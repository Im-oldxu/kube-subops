import type {
  AppContainerEntry,
  CreateFormState,
  CreateSchema,
  EnvEntry,
  InitContainerEntry,
  KeyValuePair,
  LifecycleHookEntry,
  MatchExpressionEntry,
  PodAffinityEntry,
  PodVolumeEntry,
  PortEntry,
  TolerationEntry,
  VolumeMountEntry
} from './types'
import { asRecord, pairsToRecord, readPath, stringRecordToPairs } from './yaml'

const defaultLabels = () => []
const defaultPort = () => [{ id: 'http', name: 'http', port: 80, targetPort: 8080, protocol: 'TCP' as const, hostPortEnabled: false, hostPort: null, hostIP: '' }]
const defaultDeploymentLabels = (name = '') => [{ id: 'app', key: 'app', value: name || 'app' }]

let preservedDeploymentPodSpec: Record<string, unknown> = {}
let preservedDeploymentContainer: Record<string, unknown> = {}
let preservedDeploymentContainerMap: Record<string, Record<string, unknown>> = {}
let preservedDeploymentVolumes: unknown[] = []
let preservedDeploymentVolumeMap: Record<string, Record<string, unknown>> = {}
let preservedDeploymentAppVolumeMountMap: Record<string, Record<string, unknown>> = {}
let preservedDeploymentInitContainerMap: Record<string, Record<string, unknown>> = {}
let preservedDeploymentInitVolumeMountMap: Record<string, Record<string, unknown>> = {}
let preservedDeploymentReadinessProbe: Record<string, unknown> = {}
let preservedDeploymentLivenessProbe: Record<string, unknown> = {}
let preservedDeploymentStartupProbe: Record<string, unknown> = {}
let preservedDeploymentProbeMap: Record<string, {
  readinessProbe: Record<string, unknown>
  livenessProbe: Record<string, unknown>
  startupProbe: Record<string, unknown>
}> = {}

function cloneDefaults(defaults: Partial<CreateFormState>) {
  return JSON.parse(JSON.stringify(defaults)) as Partial<CreateFormState>
}

function compactObject<T extends Record<string, unknown>>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== '')) as Partial<T>
}

function compactArray<T>(value: T[]) {
  return value.length ? value : undefined
}

function nonEmptyObject(value: Record<string, unknown>) {
  return Object.keys(value).length ? value : undefined
}

function optionalBoolean(value: '' | 'true' | 'false') {
  return value === '' ? undefined : value === 'true'
}

function withoutVolumeSources(value: Record<string, unknown>) {
  const copy = { ...value }
  delete copy.configMap
  delete copy.secret
  delete copy.persistentVolumeClaim
  delete copy.emptyDir
  return copy
}

function supportedVolumeType(volume: Record<string, unknown>): PodVolumeEntry['type'] | null {
  if (volume.configMap) return 'configMap'
  if (volume.secret) return 'secret'
  if (volume.persistentVolumeClaim) return 'persistentVolumeClaim'
  if (volume.emptyDir) return 'emptyDir'
  return null
}

function buildHttpProbe(
  path: string,
  port: number,
  preservedProbe: Record<string, unknown>,
  initialDelaySeconds: number,
  periodSeconds: number,
  timeoutSeconds: number,
  failureThreshold: number,
  successThreshold: number
) {
  if (!path) {
    return preservedProbe.httpGet ? undefined : nonEmptyObject(preservedProbe)
  }
  const httpGet = asRecord(preservedProbe.httpGet)
  return {
    ...preservedProbe,
    httpGet: {
      ...httpGet,
      path,
      port: Number(port) || 8080
    },
    initialDelaySeconds: Number(initialDelaySeconds) || 0,
    periodSeconds: Number(periodSeconds) || 10,
    timeoutSeconds: Number(timeoutSeconds) || 1,
    failureThreshold: Number(failureThreshold) || 3,
    successThreshold: Number(successThreshold) || 1
  }
}

function csvToArray(value: string) {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function valuesToCsv(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item)).join(', ') : ''
}

function readHttpProbeFields(probe: Record<string, unknown>, fallbackPort = 8080, fallbackInitialDelaySeconds = 0) {
  const httpGet = asRecord(probe.httpGet)
  return {
    path: String(httpGet.path ?? ''),
    port: Number(httpGet.port ?? fallbackPort),
    initialDelaySeconds: Number(probe.initialDelaySeconds ?? fallbackInitialDelaySeconds),
    periodSeconds: Number(probe.periodSeconds ?? 10),
    timeoutSeconds: Number(probe.timeoutSeconds ?? 1),
    failureThreshold: Number(probe.failureThreshold ?? 3),
    successThreshold: Number(probe.successThreshold ?? 1)
  }
}

function readLifecycleHooks(container: Record<string, unknown>) {
  const lifecycle = asRecord(container.lifecycle)
  return (['postStart', 'preStop'] as const).flatMap((type) => {
    const hook = asRecord(lifecycle[type])
    if (!Object.keys(hook).length) return []
    const exec = asRecord(hook.exec)
    const httpGet = asRecord(hook.httpGet)
    const hasHttpGet = Boolean(Object.keys(httpGet).length)
    return [{
      id: `lifecycle-${type}`,
      type,
      handlerType: hasHttpGet ? 'httpGet' : 'exec',
      command: valuesToCsv(exec.command),
      path: String(httpGet.path ?? ''),
      port: Number(httpGet.port ?? 8080)
    }]
  }) as LifecycleHookEntry[]
}

function readContainerPorts(container: Record<string, unknown>) {
  return (Array.isArray(container.ports) ? container.ports : []).map((port, index) => {
    const item = asRecord(port)
    const containerPort = item.containerPort === undefined ? null : Number(item.containerPort)
    const hostPort = item.hostPort === undefined ? null : Number(item.hostPort)
    return {
      id: `port-${index}`,
      name: String(item.name ?? `port-${index + 1}`),
      port: containerPort,
      targetPort: containerPort,
      protocol: String(item.protocol ?? 'TCP') === 'UDP' ? 'UDP' : 'TCP',
      hostPortEnabled: hostPort !== null,
      hostPort,
      hostIP: String(item.hostIP ?? '')
    }
  }) as PortEntry[]
}

function readContainerSecurityContext(container: Record<string, unknown>) {
  const securityContext = asRecord(container.securityContext)
  return {
    containerRunAsUser: securityContext.runAsUser === undefined ? null : Number(securityContext.runAsUser),
    containerRunAsGroup: securityContext.runAsGroup === undefined ? null : Number(securityContext.runAsGroup),
    containerRunAsNonRoot: securityContext.runAsNonRoot === undefined ? '' : String(Boolean(securityContext.runAsNonRoot)) as CreateFormState['containerRunAsNonRoot'],
    privileged: securityContext.privileged === undefined ? '' : String(Boolean(securityContext.privileged)) as CreateFormState['privileged'],
    allowPrivilegeEscalation: securityContext.allowPrivilegeEscalation === undefined ? '' : String(Boolean(securityContext.allowPrivilegeEscalation)) as CreateFormState['allowPrivilegeEscalation'],
    readOnlyRootFilesystem: securityContext.readOnlyRootFilesystem === undefined ? '' : String(Boolean(securityContext.readOnlyRootFilesystem)) as CreateFormState['readOnlyRootFilesystem']
  }
}

function readContainerEnv(container: Record<string, unknown>, prefix = 'env') {
  return (Array.isArray(container.env) ? container.env : []).map((env, index) => {
    const item = asRecord(env)
    return { id: `${prefix}-${index}`, name: String(item.name ?? ''), value: String(item.value ?? '') }
  }) as EnvEntry[]
}

function readVolumeMountEntries(
  mounts: Record<string, unknown>[],
  volumes: Record<string, unknown>[],
  prefix: string
) {
  return mounts.map((mountItem, index) => {
    const name = String(mountItem.name ?? '')
    const volume = volumes.find((item) => item.name === name) ?? {}
    const configMap = asRecord(volume.configMap)
    const secret = asRecord(volume.secret)
    const pvc = asRecord(volume.persistentVolumeClaim)
    const type = volume.configMap ? 'configMap' : volume.secret ? 'secret' : volume.persistentVolumeClaim ? 'persistentVolumeClaim' : 'emptyDir'
    return {
      id: `${prefix}-${index}`,
      type,
      name,
      sourceName: String(configMap.name ?? secret.secretName ?? pvc.claimName ?? name),
      mountPath: String(mountItem.mountPath ?? ''),
      subPath: String(mountItem.subPath ?? ''),
      readOnly: Boolean(mountItem.readOnly ?? type !== 'emptyDir')
    }
  }) as VolumeMountEntry[]
}

function readPodVolumeEntries(volumes: Record<string, unknown>[], prefix: string) {
  return volumes.flatMap((volume, index) => {
    const type = supportedVolumeType(volume)
    if (!type) return []
    const configMap = asRecord(volume.configMap)
    const secret = asRecord(volume.secret)
    const pvc = asRecord(volume.persistentVolumeClaim)
    const name = String(volume.name ?? '')
    return [{
      id: `${prefix}-${index}`,
      type,
      name,
      sourceName: String(configMap.name ?? secret.secretName ?? pvc.claimName ?? name)
    }]
  }) as PodVolumeEntry[]
}

function appContainerFromObject(container: Record<string, unknown>, index: number, volumes: Record<string, unknown>[]): AppContainerEntry {
  const resources = asRecord(container.resources)
  const requests = asRecord(resources.requests)
  const limits = asRecord(resources.limits)
  const readinessProbe = asRecord(container.readinessProbe)
  const livenessProbe = asRecord(container.livenessProbe)
  const startupProbe = asRecord(container.startupProbe)
  const readiness = readHttpProbeFields(readinessProbe, 8080, 10)
  const liveness = readHttpProbeFields(livenessProbe, 8080, 30)
  const startup = readHttpProbeFields(startupProbe, 8080, 0)
  const volumeMounts = Array.isArray(container.volumeMounts) ? container.volumeMounts.map((item) => asRecord(item)) : []
  return {
    id: `app-${index}`,
    name: String(container.name ?? `app-${index + 1}`),
    image: String(container.image ?? ''),
    imagePullPolicy: String(container.imagePullPolicy ?? 'IfNotPresent') as CreateFormState['imagePullPolicy'],
    ports: readContainerPorts(container),
    env: readContainerEnv(container, `env-${index}`),
    cpuRequest: String(requests.cpu ?? ''),
    memoryRequest: String(requests.memory ?? ''),
    cpuLimit: String(limits.cpu ?? ''),
    memoryLimit: String(limits.memory ?? ''),
    readinessPath: readiness.path,
    readinessPort: readiness.port,
    readinessInitialDelaySeconds: readiness.initialDelaySeconds,
    readinessPeriodSeconds: readiness.periodSeconds,
    readinessTimeoutSeconds: readiness.timeoutSeconds,
    readinessFailureThreshold: readiness.failureThreshold,
    readinessSuccessThreshold: readiness.successThreshold,
    livenessPath: liveness.path,
    livenessPort: liveness.port,
    livenessInitialDelaySeconds: liveness.initialDelaySeconds,
    livenessPeriodSeconds: liveness.periodSeconds,
    livenessTimeoutSeconds: liveness.timeoutSeconds,
    livenessFailureThreshold: liveness.failureThreshold,
    livenessSuccessThreshold: liveness.successThreshold,
    startupPath: startup.path,
    startupPort: startup.port,
    startupInitialDelaySeconds: startup.initialDelaySeconds,
    startupPeriodSeconds: startup.periodSeconds,
    startupTimeoutSeconds: startup.timeoutSeconds,
    startupFailureThreshold: startup.failureThreshold,
    startupSuccessThreshold: startup.successThreshold,
    volumeMounts: readVolumeMountEntries(volumeMounts, volumes, `volume-${index}`),
    lifecycleHooks: readLifecycleHooks(container),
    ...readContainerSecurityContext(container)
  }
}

function buildNodeAffinity(expressions: MatchExpressionEntry[]) {
  const matchExpressions = expressions
    .filter((item) => item.key.trim())
    .map((item) => compactObject({
      key: item.key.trim(),
      operator: item.operator,
      values: ['Exists', 'DoesNotExist'].includes(item.operator) ? undefined : csvToArray(item.values)
    }))
  if (!matchExpressions.length) return undefined
  return {
    requiredDuringSchedulingIgnoredDuringExecution: {
      nodeSelectorTerms: [{ matchExpressions }]
    }
  }
}

function buildPodAffinityTerms(entries: PodAffinityEntry[]) {
  return entries
    .filter((item) => item.topologyKey.trim() && item.labelKey.trim())
    .map((item) => ({
      topologyKey: item.topologyKey.trim(),
      labelSelector: {
        matchExpressions: [
          compactObject({
            key: item.labelKey.trim(),
            operator: item.operator,
            values: ['Exists', 'DoesNotExist'].includes(item.operator) ? undefined : csvToArray(item.values)
          })
        ]
      }
    }))
}

function buildAffinity(form: CreateFormState) {
  const nodeAffinity = buildNodeAffinity(form.nodeAffinity)
  const podAffinityTerms = buildPodAffinityTerms(form.podAffinity)
  const podAntiAffinityTerms = buildPodAffinityTerms(form.podAntiAffinity)
  const affinity = compactObject({
    nodeAffinity,
    podAffinity: podAffinityTerms.length ? { requiredDuringSchedulingIgnoredDuringExecution: podAffinityTerms } : undefined,
    podAntiAffinity: podAntiAffinityTerms.length ? { requiredDuringSchedulingIgnoredDuringExecution: podAntiAffinityTerms } : undefined
  })
  return nonEmptyObject(affinity)
}

function buildTolerations(tolerations: TolerationEntry[]) {
  return tolerations
    .filter((item) => item.key.trim() || item.operator === 'Exists')
    .map((item) => compactObject({
      key: item.key.trim() || undefined,
      operator: item.operator,
      value: item.operator === 'Exists' ? undefined : item.value.trim() || undefined,
      effect: item.effect || undefined,
      tolerationSeconds: item.effect === 'NoExecute' && item.tolerationSeconds !== null ? Number(item.tolerationSeconds) || 0 : undefined
    }))
}

function buildImagePullSecrets(value: string) {
  return csvToArray(value).map((name) => ({ name }))
}

function buildDnsConfig(form: CreateFormState) {
  const options = form.dnsOptions
    .filter((item) => item.key.trim())
    .map((item) => compactObject({
      name: item.key.trim(),
      value: item.value.trim() || undefined
    }))
  return nonEmptyObject(compactObject({
    nameservers: compactArray(csvToArray(form.dnsNameservers)),
    searches: compactArray(csvToArray(form.dnsSearches)),
    options: compactArray(options)
  }))
}

function buildLifecycle(hooks: LifecycleHookEntry[]) {
  const lifecycle = hooks.reduce<Record<string, unknown>>((result, hook) => {
    if (hook.handlerType === 'exec') {
      const command = csvToArray(hook.command)
      if (command.length) result[hook.type] = { exec: { command } }
      return result
    }
    if (hook.path.trim()) {
      result[hook.type] = {
        httpGet: {
          path: hook.path.trim(),
          port: Number(hook.port) || 8080
        }
      }
    }
    return result
  }, {})
  return nonEmptyObject(lifecycle)
}

function buildContainerResources(
  cpuRequest: string,
  memoryRequest: string,
  cpuLimit: string,
  memoryLimit: string
) {
  const requests = compactObject({
    cpu: cpuRequest || undefined,
    memory: memoryRequest || undefined
  })
  const limits = compactObject({
    cpu: cpuLimit || undefined,
    memory: memoryLimit || undefined
  })
  const resources = compactObject({
    requests: nonEmptyObject(requests),
    limits: nonEmptyObject(limits)
  })
  return Object.keys(resources).length ? resources : undefined
}

function buildVolumeMounts(mounts: VolumeMountEntry[], preservedMap: Record<string, Record<string, unknown>>) {
  return mounts
    .filter((item) => item.name.trim() && item.mountPath.trim())
    .map((item) => {
      const name = item.name.trim()
      return compactObject({
        ...preservedMap[name],
        name,
        mountPath: item.mountPath.trim(),
        subPath: item.subPath.trim() || undefined,
        readOnly: (item.readOnly || item.type === 'configMap' || item.type === 'secret') ? true : undefined
      })
    })
}

function buildVolumes(volumes: Array<PodVolumeEntry | VolumeMountEntry>) {
  const seen = new Set<string>()
  return volumes
    .filter((item) => {
      const name = item.name.trim()
      if (!name || seen.has(name)) return false
      seen.add(name)
      return true
    })
    .map((item) => {
      const name = item.name.trim()
      const sourceName = item.sourceName.trim() || name
      const preservedVolume = preservedDeploymentVolumeMap[name] ?? {}
      if (item.type === 'configMap') {
        return {
          ...withoutVolumeSources(preservedVolume),
          name,
          configMap: { ...asRecord(preservedVolume.configMap), name: sourceName }
        }
      }
      if (item.type === 'secret') {
        return {
          ...withoutVolumeSources(preservedVolume),
          name,
          secret: { ...asRecord(preservedVolume.secret), secretName: sourceName }
        }
      }
      if (item.type === 'persistentVolumeClaim') {
        const volumeReadOnly = 'readOnly' in item ? item.readOnly : false
        return {
          ...withoutVolumeSources(preservedVolume),
          name,
          persistentVolumeClaim: {
            ...asRecord(preservedVolume.persistentVolumeClaim),
            claimName: sourceName,
            readOnly: volumeReadOnly || undefined
          }
        }
      }
      return {
        ...withoutVolumeSources(preservedVolume),
        name,
        emptyDir: asRecord(preservedVolume.emptyDir)
      }
    })
}

function buildInitContainers(form: CreateFormState) {
  return form.initContainers
    .filter((container) => container.name.trim() && container.image.trim())
    .map((container) => {
      const name = container.name.trim()
      const volumeMounts = buildVolumeMounts(container.volumeMounts, preservedDeploymentInitVolumeMountMap)
      const securityContext = buildContainerSecurityContext(container)
      return compactObject({
        ...preservedDeploymentInitContainerMap[name],
        name,
        image: container.image.trim(),
        imagePullPolicy: container.imagePullPolicy,
        command: compactArray(csvToArray(container.command)),
        args: compactArray(csvToArray(container.args)),
        env: compactArray(container.env
          .filter((item) => item.name.trim())
          .map((item) => ({ name: item.name.trim(), value: item.value }))),
        resources: buildContainerResources(container.cpuRequest, container.memoryRequest, container.cpuLimit, container.memoryLimit),
        volumeMounts: compactArray(volumeMounts),
        securityContext
      })
    })
}

function formPrimaryAppContainer(form: CreateFormState): AppContainerEntry {
  return {
    id: 'app-0',
    name: form.containerName || form.name || 'app',
    image: form.image,
    imagePullPolicy: form.imagePullPolicy,
    ports: form.ports,
    env: form.env,
    cpuRequest: form.cpuRequest,
    memoryRequest: form.memoryRequest,
    cpuLimit: form.cpuLimit,
    memoryLimit: form.memoryLimit,
    readinessPath: form.readinessPath,
    readinessPort: form.readinessPort,
    readinessInitialDelaySeconds: form.readinessInitialDelaySeconds,
    readinessPeriodSeconds: form.readinessPeriodSeconds,
    readinessTimeoutSeconds: form.readinessTimeoutSeconds,
    readinessFailureThreshold: form.readinessFailureThreshold,
    readinessSuccessThreshold: form.readinessSuccessThreshold,
    livenessPath: form.livenessPath,
    livenessPort: form.livenessPort,
    livenessInitialDelaySeconds: form.livenessInitialDelaySeconds,
    livenessPeriodSeconds: form.livenessPeriodSeconds,
    livenessTimeoutSeconds: form.livenessTimeoutSeconds,
    livenessFailureThreshold: form.livenessFailureThreshold,
    livenessSuccessThreshold: form.livenessSuccessThreshold,
    startupPath: form.startupPath,
    startupPort: form.startupPort,
    startupInitialDelaySeconds: form.startupInitialDelaySeconds,
    startupPeriodSeconds: form.startupPeriodSeconds,
    startupTimeoutSeconds: form.startupTimeoutSeconds,
    startupFailureThreshold: form.startupFailureThreshold,
    startupSuccessThreshold: form.startupSuccessThreshold,
    volumeMounts: form.volumeMounts,
    lifecycleHooks: form.lifecycleHooks,
    containerRunAsUser: form.containerRunAsUser,
    containerRunAsGroup: form.containerRunAsGroup,
    containerRunAsNonRoot: form.containerRunAsNonRoot,
    privileged: form.privileged,
    allowPrivilegeEscalation: form.allowPrivilegeEscalation,
    readOnlyRootFilesystem: form.readOnlyRootFilesystem
  }
}

function buildPodSecurityContext(form: CreateFormState) {
  return nonEmptyObject(compactObject({
    runAsUser: form.runAsUser ?? undefined,
    runAsGroup: form.runAsGroup ?? undefined,
    fsGroup: form.fsGroup ?? undefined,
    runAsNonRoot: optionalBoolean(form.runAsNonRoot),
    seccompProfile: form.seccompProfileType
      ? compactObject({
        type: form.seccompProfileType,
        localhostProfile: form.seccompProfileType === 'Localhost' ? form.seccompLocalhostProfile || undefined : undefined
      })
      : undefined
  }))
}

function buildContainerSecurityContext(source: Pick<AppContainerEntry | InitContainerEntry | CreateFormState, 'containerRunAsUser' | 'containerRunAsGroup' | 'containerRunAsNonRoot' | 'privileged' | 'allowPrivilegeEscalation' | 'readOnlyRootFilesystem'>) {
  return nonEmptyObject(compactObject({
    runAsUser: source.containerRunAsUser ?? undefined,
    runAsGroup: source.containerRunAsGroup ?? undefined,
    runAsNonRoot: optionalBoolean(source.containerRunAsNonRoot),
    privileged: optionalBoolean(source.privileged),
    allowPrivilegeEscalation: optionalBoolean(source.allowPrivilegeEscalation),
    readOnlyRootFilesystem: optionalBoolean(source.readOnlyRootFilesystem)
  }))
}

function appContainersForForm(form: CreateFormState) {
  return form.appContainers.length ? form.appContainers : [formPrimaryAppContainer(form)]
}

function buildAppContainers(form: CreateFormState) {
  return appContainersForForm(form)
    .filter((container) => container.name.trim() && container.image.trim())
    .map((container) => {
      const name = container.name.trim()
      const preservedProbes = preservedDeploymentProbeMap[name] ?? {
        readinessProbe: preservedDeploymentReadinessProbe,
        livenessProbe: preservedDeploymentLivenessProbe,
        startupProbe: preservedDeploymentStartupProbe
      }
      const resources = buildContainerResources(container.cpuRequest, container.memoryRequest, container.cpuLimit, container.memoryLimit)
      const readinessProbe = buildHttpProbe(
        container.readinessPath,
        container.readinessPort,
        preservedProbes.readinessProbe,
        container.readinessInitialDelaySeconds,
        container.readinessPeriodSeconds,
        container.readinessTimeoutSeconds,
        container.readinessFailureThreshold,
        container.readinessSuccessThreshold
      )
      const livenessProbe = buildHttpProbe(
        container.livenessPath,
        container.livenessPort,
        preservedProbes.livenessProbe,
        container.livenessInitialDelaySeconds,
        container.livenessPeriodSeconds,
        container.livenessTimeoutSeconds,
        container.livenessFailureThreshold,
        container.livenessSuccessThreshold
      )
      const startupProbe = buildHttpProbe(
        container.startupPath,
        container.startupPort,
        preservedProbes.startupProbe,
        container.startupInitialDelaySeconds,
        container.startupPeriodSeconds,
        container.startupTimeoutSeconds,
        container.startupFailureThreshold,
        container.startupSuccessThreshold
      )
      const volumeMounts = buildVolumeMounts(container.volumeMounts, preservedDeploymentAppVolumeMountMap)
      const securityContext = buildContainerSecurityContext(container)
      return compactObject({
        ...preservedDeploymentContainerMap[name],
        ...(name === form.containerName ? preservedDeploymentContainer : {}),
        name,
        image: container.image.trim(),
        imagePullPolicy: container.imagePullPolicy,
        ports: compactArray(container.ports
          .map((port) => {
            const containerPort = Number(port.targetPort) || Number(port.port) || 0
            if (!containerPort) return undefined
            return compactObject({
              name: port.name || undefined,
              containerPort,
              protocol: port.protocol,
              hostPort: port.hostPortEnabled && port.hostPort ? Number(port.hostPort) : undefined,
              hostIP: port.hostPortEnabled && port.hostIP.trim() ? port.hostIP.trim() : undefined
            })
          })
          .filter((port): port is Record<string, unknown> => Boolean(port))),
        env: compactArray(container.env
          .filter((item) => item.name.trim())
          .map((item) => ({ name: item.name.trim(), value: item.value }))),
        resources,
        readinessProbe,
        livenessProbe,
        startupProbe,
        lifecycle: buildLifecycle(container.lifecycleHooks),
        volumeMounts: compactArray(volumeMounts),
        securityContext
      })
    })
}

function deploymentObject(form: CreateFormState) {
  const metadataLabels = pairsToRecord(form.labels)
  const metadataAnnotations = pairsToRecord(form.annotations)
  const selectorLabels = { app: form.name }
  const templateLabels = {
    ...selectorLabels,
    ...metadataLabels
  }
  const nodeSelector = pairsToRecord(form.nodeSelector)
  const affinity = buildAffinity(form)
  const tolerations = buildTolerations(form.tolerations)
  const appContainers = buildAppContainers(form)
  const imagePullSecrets = buildImagePullSecrets(form.imagePullSecrets)
  const dnsConfig = buildDnsConfig(form)
  const mountedVolumes = [
    ...appContainersForForm(form).flatMap((container) => container.volumeMounts),
    ...form.initContainers.flatMap((container) => container.volumeMounts)
  ]
  const configuredVolumes = buildVolumes([
    ...form.podVolumes,
    ...mountedVolumes
  ])
  const volumes = [...preservedDeploymentVolumes, ...configuredVolumes]
  const initContainers = buildInitContainers(form)
  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: form.name,
      namespace: form.namespace,
      labels: nonEmptyObject(metadataLabels),
      annotations: nonEmptyObject(metadataAnnotations)
    },
    spec: {
      replicas: Number(form.replicas) || 1,
      strategy: form.strategyType ? compactObject({
        type: form.strategyType,
        rollingUpdate: form.strategyType === 'RollingUpdate' && (form.maxSurge || form.maxUnavailable)
          ? compactObject({
            maxSurge: form.maxSurge || undefined,
            maxUnavailable: form.maxUnavailable || undefined
          })
          : undefined
      }) : undefined,
      minReadySeconds: form.minReadySeconds ?? undefined,
      revisionHistoryLimit: form.revisionHistoryLimit ?? undefined,
      progressDeadlineSeconds: form.progressDeadlineSeconds ?? undefined,
      paused: form.paused || undefined,
      selector: {
        matchLabels: selectorLabels
      },
      template: {
        metadata: {
          labels: templateLabels
        },
        spec: {
          ...preservedDeploymentPodSpec,
          serviceAccountName: form.serviceAccountName || undefined,
          automountServiceAccountToken: form.automountServiceAccountToken === '' ? undefined : form.automountServiceAccountToken === 'true',
          imagePullSecrets: imagePullSecrets.length ? imagePullSecrets : undefined,
          securityContext: buildPodSecurityContext(form),
          hostNetwork: optionalBoolean(form.hostNetwork),
          dnsPolicy: form.dnsPolicy || undefined,
          dnsConfig,
          nodeSelector: Object.keys(nodeSelector).length ? nodeSelector : undefined,
          affinity,
          tolerations: tolerations.length ? tolerations : undefined,
          volumes: volumes.length ? volumes : undefined,
          initContainers: initContainers.length ? initContainers : undefined,
          containers: appContainers
        }
      }
    }
  }
}

function serviceObject(form: CreateFormState) {
  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: form.name,
      namespace: form.namespace,
      labels: pairsToRecord(form.labels),
      annotations: pairsToRecord(form.annotations)
    },
    spec: {
      type: form.serviceType,
      selector: {
        app: form.name
      },
      ports: form.ports.map((port) => ({
        name: port.name || undefined,
        port: Number(port.port) || 80,
        targetPort: Number(port.targetPort) || Number(port.port) || 80,
        protocol: port.protocol
      }))
    }
  }
}

function configMapObject(form: CreateFormState) {
  return {
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: form.name,
      namespace: form.namespace,
      labels: pairsToRecord(form.labels),
      annotations: pairsToRecord(form.annotations)
    },
    data: pairsToRecord(form.configData)
  }
}

function secretObject(form: CreateFormState) {
  return {
    apiVersion: 'v1',
    kind: 'Secret',
    type: form.secretType || 'Opaque',
    metadata: {
      name: form.name,
      namespace: form.namespace,
      labels: pairsToRecord(form.labels),
      annotations: pairsToRecord(form.annotations)
    },
    stringData: pairsToRecord(form.secretData)
  }
}

function pvcObject(form: CreateFormState) {
  return {
    apiVersion: 'v1',
    kind: 'PersistentVolumeClaim',
    metadata: {
      name: form.name,
      namespace: form.namespace,
      labels: pairsToRecord(form.labels),
      annotations: pairsToRecord(form.annotations)
    },
    spec: {
      accessModes: [form.accessMode],
      storageClassName: form.storageClassName || undefined,
      resources: {
        requests: {
          storage: form.storageSize || '10Gi'
        }
      }
    }
  }
}

const commonFields = [
  { key: 'name', label: '名称', type: 'text', required: true, placeholder: 'resource-name' },
  { key: 'namespace', label: 'Namespace', type: 'text', required: true, placeholder: 'default' },
  { key: 'labels', label: '标签', type: 'keyValue', help: '会写入 metadata.labels。' },
  { key: 'annotations', label: '注解', type: 'keyValue', help: '会写入 metadata.annotations。' }
] satisfies CreateSchema['sections'][number]['fields']

export const createSchemas: Record<string, CreateSchema> = {
  deployments: {
    resourceType: 'deployments',
    kind: 'Deployment',
    apiVersion: 'apps/v1',
    title: 'Deployment 表单',
    summary: '适合创建常规无状态工作负载，支持副本、镜像、端口和环境变量。',
    defaults: {
      labels: defaultDeploymentLabels(),
      replicas: 2,
      containerName: 'app',
      image: 'nginx:1.27',
      imagePullPolicy: 'IfNotPresent',
      cpuRequest: '',
      memoryRequest: '',
      cpuLimit: '',
      memoryLimit: '',
      readinessPath: '',
      readinessPort: 8080,
      readinessInitialDelaySeconds: 10,
      readinessPeriodSeconds: 10,
      readinessTimeoutSeconds: 1,
      readinessFailureThreshold: 3,
      readinessSuccessThreshold: 1,
      livenessPath: '',
      livenessPort: 8080,
      livenessInitialDelaySeconds: 30,
      livenessPeriodSeconds: 10,
      livenessTimeoutSeconds: 1,
      livenessFailureThreshold: 3,
      livenessSuccessThreshold: 1,
      startupPath: '',
      startupPort: 8080,
      startupInitialDelaySeconds: 0,
      startupPeriodSeconds: 10,
      startupTimeoutSeconds: 1,
      startupFailureThreshold: 30,
      startupSuccessThreshold: 1,
      ports: [],
      env: [],
      imagePullSecrets: '',
      runAsUser: null,
      runAsGroup: null,
      fsGroup: null,
      runAsNonRoot: '',
      seccompProfileType: '',
      seccompLocalhostProfile: '',
      containerRunAsUser: null,
      containerRunAsGroup: null,
      containerRunAsNonRoot: '',
      privileged: '',
      allowPrivilegeEscalation: '',
      readOnlyRootFilesystem: '',
      nodeSelector: [],
      nodeAffinity: [],
      podAffinity: [],
      podAntiAffinity: [],
      tolerations: [],
      hostNetwork: '',
      dnsPolicy: '',
      dnsNameservers: '',
      dnsSearches: '',
      dnsOptions: [],
      podVolumes: [],
      volumeMounts: [],
      appContainers: [],
      initContainers: [],
      lifecycleHooks: [],
      strategyType: '',
      maxSurge: '',
      maxUnavailable: '',
      minReadySeconds: null,
      revisionHistoryLimit: null,
      progressDeadlineSeconds: null,
      paused: false
    },
    sections: [
      { title: '基本信息', fields: commonFields },
      {
        title: 'Pod 模板',
        description: '普通容器、Init 容器和容器级配置入口。',
        fields: [
          { key: 'replicas', label: '副本数', type: 'number', required: true, min: 0 },
          { key: 'containerName', label: '容器名称', type: 'text', required: true, placeholder: 'app' },
          { key: 'image', label: '镜像', type: 'text', required: true, placeholder: 'registry.example/app:v1.0.0' },
          {
            key: 'imagePullPolicy',
            label: '镜像拉取策略',
            type: 'select',
            required: true,
            options: [
              { label: 'IfNotPresent', value: 'IfNotPresent' },
              { label: 'Always', value: 'Always' },
              { label: 'Never', value: 'Never' }
            ]
          },
          { key: 'ports', label: '容器端口', type: 'ports' },
          { key: 'env', label: '环境变量', type: 'env' }
        ]
      }
    ],
    toObject: deploymentObject
  },
  services: {
    resourceType: 'services',
    kind: 'Service',
    apiVersion: 'v1',
    title: 'Service 表单',
    summary: '适合暴露工作负载，支持 Service 类型、端口和 selector。',
    defaults: {
      labels: defaultLabels(),
      serviceType: 'ClusterIP',
      ports: defaultPort()
    },
    sections: [
      { title: '基本信息', fields: commonFields },
      {
        title: '服务端口',
        fields: [
          {
            key: 'serviceType',
            label: 'Service 类型',
            type: 'select',
            required: true,
            options: [
              { label: 'ClusterIP', value: 'ClusterIP' },
              { label: 'NodePort', value: 'NodePort' },
              { label: 'LoadBalancer', value: 'LoadBalancer' }
            ]
          },
          { key: 'ports', label: '端口映射', type: 'ports' }
        ]
      }
    ],
    toObject: serviceObject
  },
  configmaps: {
    resourceType: 'configmaps',
    kind: 'ConfigMap',
    apiVersion: 'v1',
    title: 'ConfigMap 表单',
    summary: '适合创建普通 key/value 配置，复杂文件内容可直接在 YAML 中编辑。',
    defaults: {
      labels: defaultLabels(),
      configData: [{ id: 'config-1', key: 'APP_ENV', value: 'production' }]
    },
    sections: [
      { title: '基本信息', fields: commonFields },
      { title: '配置数据', fields: [{ key: 'configData', label: 'Data', type: 'configData', required: true }] }
    ],
    toObject: configMapObject
  },
  secrets: {
    resourceType: 'secrets',
    kind: 'Secret',
    apiVersion: 'v1',
    title: 'Secret 表单',
    summary: '使用 stringData 短暂编辑明文，提交后由后端加密/审计，页面不长期保存。',
    defaults: {
      labels: defaultLabels(),
      secretType: 'Opaque',
      secretData: [{ id: 'secret-1', key: 'password', value: '' }]
    },
    sections: [
      { title: '基本信息', fields: commonFields },
      {
        title: 'Secret 数据',
        fields: [
          {
            key: 'secretType',
            label: 'Secret 类型',
            type: 'select',
            required: true,
            options: [
              { label: 'Opaque', value: 'Opaque' },
              { label: 'kubernetes.io/dockerconfigjson', value: 'kubernetes.io/dockerconfigjson' },
              { label: 'kubernetes.io/tls', value: 'kubernetes.io/tls' },
              { label: 'kubernetes.io/basic-auth', value: 'kubernetes.io/basic-auth' }
            ]
          },
          { key: 'secretData', label: 'stringData', type: 'secretData', required: true }
        ]
      }
    ],
    toObject: secretObject
  },
  'persistent-volume-claims': {
    resourceType: 'persistent-volume-claims',
    kind: 'PersistentVolumeClaim',
    apiVersion: 'v1',
    title: 'PVC 表单',
    summary: '适合申请命名空间级持久卷，支持 StorageClass、访问模式和容量。',
    defaults: {
      labels: defaultLabels(),
      accessMode: 'ReadWriteOnce',
      storageClassName: 'standard',
      storageSize: '10Gi'
    },
    sections: [
      { title: '基本信息', fields: commonFields },
      {
        title: '存储声明',
        fields: [
          { key: 'storageClassName', label: 'StorageClass', type: 'text', placeholder: 'standard' },
          {
            key: 'accessMode',
            label: '访问模式',
            type: 'select',
            required: true,
            options: [
              { label: 'ReadWriteOnce', value: 'ReadWriteOnce' },
              { label: 'ReadOnlyMany', value: 'ReadOnlyMany' },
              { label: 'ReadWriteMany', value: 'ReadWriteMany' }
            ]
          },
          { key: 'storageSize', label: '容量', type: 'text', required: true, placeholder: '10Gi' }
        ]
      }
    ],
    toObject: pvcObject
  }
}

export function createDefaultForm(resourceType: string, kind: string, namespace: string): CreateFormState {
  const schema = createSchemas[resourceType]
  const defaults = cloneDefaults(schema?.defaults ?? {})
  if (resourceType === 'deployments') {
    preservedDeploymentPodSpec = {}
    preservedDeploymentContainer = {}
    preservedDeploymentContainerMap = {}
    preservedDeploymentVolumes = []
    preservedDeploymentVolumeMap = {}
    preservedDeploymentAppVolumeMountMap = {}
    preservedDeploymentInitContainerMap = {}
    preservedDeploymentInitVolumeMountMap = {}
    preservedDeploymentReadinessProbe = {}
    preservedDeploymentLivenessProbe = {}
    preservedDeploymentStartupProbe = {}
    preservedDeploymentProbeMap = {}
  }
  return {
    name: '',
    namespace,
    labels: defaultLabels(),
    annotations: [],
    replicas: 1,
    image: `${kind.toLowerCase()}:latest`,
    containerName: 'app',
    imagePullPolicy: 'IfNotPresent',
    cpuRequest: '',
    memoryRequest: '',
    cpuLimit: '',
    memoryLimit: '',
    readinessPath: '',
    readinessPort: 8080,
    readinessInitialDelaySeconds: 10,
    readinessPeriodSeconds: 10,
    readinessTimeoutSeconds: 1,
    readinessFailureThreshold: 3,
    readinessSuccessThreshold: 1,
    livenessPath: '',
    livenessPort: 8080,
    livenessInitialDelaySeconds: 30,
    livenessPeriodSeconds: 10,
    livenessTimeoutSeconds: 1,
    livenessFailureThreshold: 3,
    livenessSuccessThreshold: 1,
    startupPath: '',
    startupPort: 8080,
    startupInitialDelaySeconds: 0,
    startupPeriodSeconds: 10,
    startupTimeoutSeconds: 1,
    startupFailureThreshold: 30,
    startupSuccessThreshold: 1,
    serviceAccountName: '',
    automountServiceAccountToken: '',
    imagePullSecrets: '',
    runAsUser: null,
    runAsGroup: null,
    fsGroup: null,
    runAsNonRoot: '',
    seccompProfileType: '',
    seccompLocalhostProfile: '',
    containerRunAsUser: null,
    containerRunAsGroup: null,
    containerRunAsNonRoot: '',
    privileged: '',
    allowPrivilegeEscalation: '',
    readOnlyRootFilesystem: '',
    nodeSelector: [],
    nodeAffinity: [],
    podAffinity: [],
    podAntiAffinity: [],
    tolerations: [],
    hostNetwork: '',
    dnsPolicy: '',
    dnsNameservers: '',
    dnsSearches: '',
    dnsOptions: [],
    podVolumes: [],
    volumeMounts: [],
    appContainers: [],
    initContainers: [],
    lifecycleHooks: [],
    strategyType: '',
    maxSurge: '',
    maxUnavailable: '',
    minReadySeconds: null,
    revisionHistoryLimit: null,
    progressDeadlineSeconds: null,
    paused: false,
    serviceType: 'ClusterIP',
    ports: defaultPort(),
    env: [],
    configData: [],
    secretType: 'Opaque',
    secretData: [],
    storageClassName: '',
    accessMode: 'ReadWriteOnce',
    storageSize: '10Gi',
    ...defaults
  }
}

export function applyObjectToForm(form: CreateFormState, object: Record<string, unknown>, resourceType: string) {
  const metadata = asRecord(object.metadata)
  form.name = String(metadata.name ?? form.name ?? '')
  form.namespace = String(metadata.namespace ?? form.namespace ?? 'default')
  form.labels = stringRecordToPairs(asRecord(metadata.labels))
  form.annotations = stringRecordToPairs(asRecord(metadata.annotations))

  if (resourceType === 'deployments') {
    form.replicas = Number(readPath(object, ['spec', 'replicas']) ?? form.replicas)
    const podSpec = asRecord(readPath(object, ['spec', 'template', 'spec']))
    const containers = Array.isArray(podSpec.containers) ? podSpec.containers.map((item) => asRecord(item)) : []
    const container = containers[0] ?? {}
    const resources = asRecord(container.resources)
    const requests = asRecord(resources.requests)
    const limits = asRecord(resources.limits)
    preservedDeploymentReadinessProbe = asRecord(container.readinessProbe)
    preservedDeploymentLivenessProbe = asRecord(container.livenessProbe)
    preservedDeploymentStartupProbe = asRecord(container.startupProbe)
    const readinessHttpGet = asRecord(preservedDeploymentReadinessProbe.httpGet)
    const livenessHttpGet = asRecord(preservedDeploymentLivenessProbe.httpGet)
    const startupHttpGet = asRecord(preservedDeploymentStartupProbe.httpGet)
    const volumes = Array.isArray(podSpec.volumes) ? podSpec.volumes.map((item) => asRecord(item)) : []
    form.podVolumes = readPodVolumeEntries(volumes, 'pod-volume')
    preservedDeploymentVolumeMap = Object.fromEntries(volumes.map((item) => [String(item.name ?? ''), item]).filter(([name]) => name))
    const volumeMounts = Array.isArray(container.volumeMounts) ? container.volumeMounts.map((item) => asRecord(item)) : []
    preservedDeploymentAppVolumeMountMap = Object.fromEntries(containers
      .flatMap((appContainer) => {
        const mounts = Array.isArray(appContainer.volumeMounts) ? appContainer.volumeMounts.map((item) => asRecord(item)) : []
        return mounts.map((item) => [String(item.name ?? ''), item] as const)
      })
      .filter(([name]) => name))
    preservedDeploymentContainerMap = Object.fromEntries(containers.map((item) => [String(item.name ?? ''), { ...item }]).filter(([name]) => name))
    preservedDeploymentProbeMap = Object.fromEntries(containers.map((item) => {
      const name = String(item.name ?? '')
      return [name, {
        readinessProbe: asRecord(item.readinessProbe),
        livenessProbe: asRecord(item.livenessProbe),
        startupProbe: asRecord(item.startupProbe)
      }] as const
    }).filter(([name]) => name))
    const initContainers = Array.isArray(podSpec.initContainers) ? podSpec.initContainers.map((item) => asRecord(item)) : []
    preservedDeploymentInitContainerMap = Object.fromEntries(initContainers.map((item) => [String(item.name ?? ''), { ...item }]).filter(([name]) => name))
    preservedDeploymentInitVolumeMountMap = Object.fromEntries(initContainers
      .flatMap((initContainer) => {
        const mounts = Array.isArray(initContainer.volumeMounts) ? initContainer.volumeMounts.map((item) => asRecord(item)) : []
        return mounts.map((item) => [String(item.name ?? ''), item] as const)
      })
      .filter(([name]) => name))
    preservedDeploymentPodSpec = { ...podSpec }
    delete preservedDeploymentPodSpec.containers
    delete preservedDeploymentPodSpec.initContainers
    delete preservedDeploymentPodSpec.serviceAccountName
    delete preservedDeploymentPodSpec.automountServiceAccountToken
    delete preservedDeploymentPodSpec.imagePullSecrets
    delete preservedDeploymentPodSpec.securityContext
    delete preservedDeploymentPodSpec.hostNetwork
    delete preservedDeploymentPodSpec.dnsPolicy
    delete preservedDeploymentPodSpec.dnsConfig
    delete preservedDeploymentPodSpec.nodeSelector
    delete preservedDeploymentPodSpec.affinity
    delete preservedDeploymentPodSpec.tolerations
    delete preservedDeploymentPodSpec.volumes
    preservedDeploymentContainer = { ...container }
    const stripGeneratedContainerFields = (target: Record<string, unknown>) => {
      for (const key of ['name', 'image', 'imagePullPolicy', 'ports', 'env', 'resources', 'readinessProbe', 'livenessProbe', 'startupProbe', 'lifecycle', 'volumeMounts', 'securityContext']) {
        delete target[key]
      }
    }
    stripGeneratedContainerFields(preservedDeploymentContainer)
    Object.values(preservedDeploymentContainerMap).forEach(stripGeneratedContainerFields)
    const stripGeneratedInitContainerFields = (target: Record<string, unknown>) => {
      for (const key of ['name', 'image', 'imagePullPolicy', 'env', 'resources', 'volumeMounts', 'securityContext', 'lifecycle', 'readinessProbe', 'livenessProbe', 'startupProbe']) {
        delete target[key]
      }
    }
    Object.values(preservedDeploymentInitContainerMap).forEach(stripGeneratedInitContainerFields)
    form.containerName = String(container.name ?? form.containerName)
    form.image = String(container.image ?? form.image)
    form.imagePullPolicy = String(container.imagePullPolicy ?? form.imagePullPolicy) as CreateFormState['imagePullPolicy']
    form.imagePullSecrets = (Array.isArray(podSpec.imagePullSecrets) ? podSpec.imagePullSecrets : [])
      .map((item) => String(asRecord(item).name ?? ''))
      .filter(Boolean)
      .join(', ')
    form.cpuRequest = String(requests.cpu ?? '')
    form.memoryRequest = String(requests.memory ?? '')
    form.cpuLimit = String(limits.cpu ?? '')
    form.memoryLimit = String(limits.memory ?? '')
    form.readinessPath = String(readinessHttpGet.path ?? '')
    form.readinessPort = Number(readinessHttpGet.port ?? 8080)
    form.readinessInitialDelaySeconds = Number(preservedDeploymentReadinessProbe.initialDelaySeconds ?? 10)
    form.readinessPeriodSeconds = Number(preservedDeploymentReadinessProbe.periodSeconds ?? 10)
    form.readinessTimeoutSeconds = Number(preservedDeploymentReadinessProbe.timeoutSeconds ?? 1)
    form.readinessFailureThreshold = Number(preservedDeploymentReadinessProbe.failureThreshold ?? 3)
    form.readinessSuccessThreshold = Number(preservedDeploymentReadinessProbe.successThreshold ?? 1)
    form.livenessPath = String(livenessHttpGet.path ?? '')
    form.livenessPort = Number(livenessHttpGet.port ?? 8080)
    form.livenessInitialDelaySeconds = Number(preservedDeploymentLivenessProbe.initialDelaySeconds ?? 30)
    form.livenessPeriodSeconds = Number(preservedDeploymentLivenessProbe.periodSeconds ?? 10)
    form.livenessTimeoutSeconds = Number(preservedDeploymentLivenessProbe.timeoutSeconds ?? 1)
    form.livenessFailureThreshold = Number(preservedDeploymentLivenessProbe.failureThreshold ?? 3)
    form.livenessSuccessThreshold = Number(preservedDeploymentLivenessProbe.successThreshold ?? 1)
    form.startupPath = String(startupHttpGet.path ?? '')
    form.startupPort = Number(startupHttpGet.port ?? 8080)
    form.startupInitialDelaySeconds = Number(preservedDeploymentStartupProbe.initialDelaySeconds ?? 0)
    form.startupPeriodSeconds = Number(preservedDeploymentStartupProbe.periodSeconds ?? 10)
    form.startupTimeoutSeconds = Number(preservedDeploymentStartupProbe.timeoutSeconds ?? 1)
    form.startupFailureThreshold = Number(preservedDeploymentStartupProbe.failureThreshold ?? 30)
    form.startupSuccessThreshold = Number(preservedDeploymentStartupProbe.successThreshold ?? 1)
    form.serviceAccountName = String(podSpec.serviceAccountName ?? '')
    form.automountServiceAccountToken = podSpec.automountServiceAccountToken === undefined ? '' : String(Boolean(podSpec.automountServiceAccountToken)) as CreateFormState['automountServiceAccountToken']
    const podSecurityContext = asRecord(podSpec.securityContext)
    const seccompProfile = asRecord(podSecurityContext.seccompProfile)
    const containerSecurityContext = asRecord(container.securityContext)
    form.runAsUser = podSecurityContext.runAsUser === undefined ? null : Number(podSecurityContext.runAsUser)
    form.runAsGroup = podSecurityContext.runAsGroup === undefined ? null : Number(podSecurityContext.runAsGroup)
    form.fsGroup = podSecurityContext.fsGroup === undefined ? null : Number(podSecurityContext.fsGroup)
    form.runAsNonRoot = podSecurityContext.runAsNonRoot === undefined ? '' : String(Boolean(podSecurityContext.runAsNonRoot)) as CreateFormState['runAsNonRoot']
    form.seccompProfileType = ['RuntimeDefault', 'Localhost', 'Unconfined'].includes(String(seccompProfile.type)) ? String(seccompProfile.type) as CreateFormState['seccompProfileType'] : ''
    form.seccompLocalhostProfile = String(seccompProfile.localhostProfile ?? '')
    form.containerRunAsUser = containerSecurityContext.runAsUser === undefined ? null : Number(containerSecurityContext.runAsUser)
    form.containerRunAsGroup = containerSecurityContext.runAsGroup === undefined ? null : Number(containerSecurityContext.runAsGroup)
    form.containerRunAsNonRoot = containerSecurityContext.runAsNonRoot === undefined ? '' : String(Boolean(containerSecurityContext.runAsNonRoot)) as CreateFormState['containerRunAsNonRoot']
    form.privileged = containerSecurityContext.privileged === undefined ? '' : String(Boolean(containerSecurityContext.privileged)) as CreateFormState['privileged']
    form.allowPrivilegeEscalation = containerSecurityContext.allowPrivilegeEscalation === undefined ? '' : String(Boolean(containerSecurityContext.allowPrivilegeEscalation)) as CreateFormState['allowPrivilegeEscalation']
    form.readOnlyRootFilesystem = containerSecurityContext.readOnlyRootFilesystem === undefined ? '' : String(Boolean(containerSecurityContext.readOnlyRootFilesystem)) as CreateFormState['readOnlyRootFilesystem']
    const strategy = asRecord(readPath(object, ['spec', 'strategy']))
    const rollingUpdate = asRecord(strategy.rollingUpdate)
    form.strategyType = strategy.type === 'RollingUpdate' || strategy.type === 'Recreate' ? strategy.type : ''
    form.maxSurge = String(rollingUpdate.maxSurge ?? '')
    form.maxUnavailable = String(rollingUpdate.maxUnavailable ?? '')
    form.minReadySeconds = readPath(object, ['spec', 'minReadySeconds']) === undefined ? null : Number(readPath(object, ['spec', 'minReadySeconds']))
    form.revisionHistoryLimit = readPath(object, ['spec', 'revisionHistoryLimit']) === undefined ? null : Number(readPath(object, ['spec', 'revisionHistoryLimit']))
    form.progressDeadlineSeconds = readPath(object, ['spec', 'progressDeadlineSeconds']) === undefined ? null : Number(readPath(object, ['spec', 'progressDeadlineSeconds']))
    form.paused = Boolean(readPath(object, ['spec', 'paused']) ?? false)
    form.nodeSelector = stringRecordToPairs(asRecord(podSpec.nodeSelector))
    const affinity = asRecord(podSpec.affinity)
    const nodeTerms = readPath(affinity, ['nodeAffinity', 'requiredDuringSchedulingIgnoredDuringExecution', 'nodeSelectorTerms'])
    form.nodeAffinity = (Array.isArray(nodeTerms) ? nodeTerms : []).flatMap((term, termIndex) => {
      const expressions = asRecord(term).matchExpressions
      return (Array.isArray(expressions) ? expressions : []).map((expression, index) => {
        const item = asRecord(expression)
        return {
          id: `node-affinity-${termIndex}-${index}`,
          key: String(item.key ?? ''),
          operator: ['NotIn', 'Exists', 'DoesNotExist'].includes(String(item.operator)) ? String(item.operator) : 'In',
          values: valuesToCsv(item.values)
        }
      })
    }) as MatchExpressionEntry[]
    const readPodAffinityTerms = (key: 'podAffinity' | 'podAntiAffinity') => {
      const terms = readPath(affinity, [key, 'requiredDuringSchedulingIgnoredDuringExecution'])
      return (Array.isArray(terms) ? terms : []).map((term, index) => {
        const item = asRecord(term)
        const expressions = asRecord(item.labelSelector).matchExpressions
        const firstExpression = Array.isArray(expressions) ? asRecord(expressions[0]) : {}
        return {
          id: `${key}-${index}`,
          topologyKey: String(item.topologyKey ?? 'kubernetes.io/hostname'),
          labelKey: String(firstExpression.key ?? ''),
          operator: ['NotIn', 'Exists', 'DoesNotExist'].includes(String(firstExpression.operator)) ? String(firstExpression.operator) : 'In',
          values: valuesToCsv(firstExpression.values)
        }
      }) as PodAffinityEntry[]
    }
    form.podAffinity = readPodAffinityTerms('podAffinity')
    form.podAntiAffinity = readPodAffinityTerms('podAntiAffinity')
    const tolerations = podSpec.tolerations
    form.tolerations = (Array.isArray(tolerations) ? tolerations : []).map((toleration, index) => {
      const item = asRecord(toleration)
      return {
        id: `toleration-${index}`,
        key: String(item.key ?? ''),
        operator: String(item.operator ?? 'Equal') === 'Exists' ? 'Exists' : 'Equal',
        value: String(item.value ?? ''),
        effect: ['NoSchedule', 'PreferNoSchedule', 'NoExecute'].includes(String(item.effect)) ? String(item.effect) : '',
        tolerationSeconds: item.tolerationSeconds === undefined ? null : Number(item.tolerationSeconds)
      }
    }) as TolerationEntry[]
    const dnsConfig = asRecord(podSpec.dnsConfig)
    form.hostNetwork = podSpec.hostNetwork === undefined ? '' : String(Boolean(podSpec.hostNetwork)) as CreateFormState['hostNetwork']
    form.dnsPolicy = String(podSpec.dnsPolicy ?? '') as CreateFormState['dnsPolicy']
    form.dnsNameservers = valuesToCsv(dnsConfig.nameservers)
    form.dnsSearches = valuesToCsv(dnsConfig.searches)
    form.dnsOptions = (Array.isArray(dnsConfig.options) ? dnsConfig.options : []).map((option, index) => {
      const item = asRecord(option)
      return { id: `dns-option-${index}`, key: String(item.name ?? ''), value: String(item.value ?? '') }
    }) as KeyValuePair[]
    form.lifecycleHooks = readLifecycleHooks(container)
    form.volumeMounts = readVolumeMountEntries(volumeMounts, volumes, 'volume')
    form.appContainers = containers.map((item, index) => appContainerFromObject(item, index, volumes))
    form.initContainers = initContainers.map((initContainer, index) => {
      const initResources = asRecord(initContainer.resources)
      const initRequests = asRecord(initResources.requests)
      const initLimits = asRecord(initResources.limits)
      const initMounts = Array.isArray(initContainer.volumeMounts) ? initContainer.volumeMounts.map((item) => asRecord(item)) : []
      return {
        id: `init-${index}`,
        name: String(initContainer.name ?? `init-${index + 1}`),
        image: String(initContainer.image ?? ''),
        imagePullPolicy: String(initContainer.imagePullPolicy ?? 'IfNotPresent') as CreateFormState['imagePullPolicy'],
        command: valuesToCsv(initContainer.command),
        args: valuesToCsv(initContainer.args),
        cpuRequest: String(initRequests.cpu ?? ''),
        memoryRequest: String(initRequests.memory ?? ''),
        cpuLimit: String(initLimits.cpu ?? ''),
        memoryLimit: String(initLimits.memory ?? ''),
        env: (Array.isArray(initContainer.env) ? initContainer.env : []).map((env, envIndex) => {
          const item = asRecord(env)
          return { id: `init-env-${index}-${envIndex}`, name: String(item.name ?? ''), value: String(item.value ?? '') }
        }) as EnvEntry[],
        volumeMounts: initMounts.map((mountItem, mountIndex) => {
          const name = String(mountItem.name ?? '')
          const volume = volumes.find((item) => item.name === name) ?? {}
          const configMap = asRecord(volume.configMap)
          const secret = asRecord(volume.secret)
          const pvc = asRecord(volume.persistentVolumeClaim)
          const type = volume.configMap ? 'configMap' : volume.secret ? 'secret' : volume.persistentVolumeClaim ? 'persistentVolumeClaim' : 'emptyDir'
          return {
            id: `init-volume-${index}-${mountIndex}`,
            type,
            name,
            sourceName: String(configMap.name ?? secret.secretName ?? pvc.claimName ?? name),
            mountPath: String(mountItem.mountPath ?? ''),
            subPath: String(mountItem.subPath ?? ''),
            readOnly: Boolean(mountItem.readOnly ?? type !== 'emptyDir')
          }
        }) as VolumeMountEntry[],
        ...readContainerSecurityContext(initContainer)
      }
    }) as InitContainerEntry[]
    preservedDeploymentVolumes = volumes.filter((item) => !supportedVolumeType(item))
    form.ports = readContainerPorts(container)
    form.env = readContainerEnv(container)
  }

  if (resourceType === 'services') {
    form.serviceType = String(readPath(object, ['spec', 'type']) ?? 'ClusterIP') as CreateFormState['serviceType']
    const servicePorts = readPath(object, ['spec', 'ports'])
    form.ports = (Array.isArray(servicePorts) ? servicePorts : []).map((port, index) => {
      const item = asRecord(port)
      return {
        id: `port-${index}`,
        name: String(item.name ?? `port-${index + 1}`),
        port: Number(item.port ?? 80),
        targetPort: Number(item.targetPort ?? item.port ?? 80),
        protocol: String(item.protocol ?? 'TCP') === 'UDP' ? 'UDP' : 'TCP',
        hostPortEnabled: false,
        hostPort: null,
        hostIP: ''
      }
    }) as PortEntry[]
  }

  if (resourceType === 'configmaps') {
    form.configData = stringRecordToPairs(asRecord(object.data))
  }

  if (resourceType === 'secrets') {
    form.secretType = String(object.type ?? 'Opaque')
    form.secretData = stringRecordToPairs(asRecord(object.stringData))
  }

  if (resourceType === 'persistent-volume-claims') {
    const accessModes = readPath(object, ['spec', 'accessModes'])
    form.storageClassName = String(readPath(object, ['spec', 'storageClassName']) ?? '')
    form.accessMode = (Array.isArray(accessModes) ? accessModes[0] : 'ReadWriteOnce') as CreateFormState['accessMode']
    form.storageSize = String(readPath(object, ['spec', 'resources', 'requests', 'storage']) ?? '10Gi')
  }
}

export function validateCreateForm(form: CreateFormState, resourceType: string) {
  const errors: string[] = []
  if (!form.name.trim()) errors.push('名称不能为空。')
  if (!form.namespace.trim() && resourceType !== 'storage-classes' && resourceType !== 'persistent-volumes') errors.push('Namespace 不能为空。')

  if (resourceType === 'deployments') {
    const appContainers = appContainersForForm(form)
    if (!appContainers.length) errors.push('至少需要一个普通容器。')
    const volumeNames = new Set<string>()
    form.podVolumes.forEach((volume, index) => {
      const name = volume.name.trim()
      if (!name) errors.push(`Pod 存储卷 ${index + 1} 名称不能为空。`)
      if (name && volumeNames.has(name)) errors.push(`Pod 存储卷 ${name} 重复。`)
      if (name) volumeNames.add(name)
      if (volume.type !== 'emptyDir' && !volume.sourceName.trim()) errors.push(`Pod 存储卷 ${name || index + 1} 需要选择来源资源。`)
    })
    appContainers.forEach((container, index) => {
      if (!container.name.trim()) errors.push(`普通容器 ${index + 1} 名称不能为空。`)
      if (!container.image.trim()) errors.push(`普通容器 ${index + 1} 镜像不能为空。`)
      container.volumeMounts.forEach((mount) => {
        if (mount.name.trim() && !volumeNames.has(mount.name.trim())) errors.push(`普通容器 ${container.name || index + 1} 挂载了未定义的 Pod 存储卷 ${mount.name}。`)
      })
    })
    form.initContainers.forEach((container, index) => {
      if (!container.name.trim()) errors.push(`Init 容器 ${index + 1} 名称不能为空。`)
      if (!container.image.trim()) errors.push(`Init 容器 ${index + 1} 镜像不能为空。`)
      container.volumeMounts.forEach((mount) => {
        if (mount.name.trim() && !volumeNames.has(mount.name.trim())) errors.push(`Init 容器 ${container.name || index + 1} 挂载了未定义的 Pod 存储卷 ${mount.name}。`)
      })
    })
  }

  if (resourceType === 'configmaps' && form.configData.every((item) => !item.key.trim())) {
    errors.push('至少填写一条 ConfigMap 数据。')
  }

  if (resourceType === 'secrets' && form.secretData.every((item) => !item.key.trim())) {
    errors.push('至少填写一条 Secret stringData。')
  }

  if (resourceType === 'persistent-volume-claims' && !form.storageSize.trim()) {
    errors.push('容量不能为空。')
  }

  return errors
}
