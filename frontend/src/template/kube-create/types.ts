export type CreateFieldType = 'text' | 'number' | 'select' | 'keyValue' | 'ports' | 'env' | 'configData' | 'secretData'

export interface KeyValuePair {
  id: string
  key: string
  value: string
}

export interface PortEntry {
  id: string
  name: string
  port: number
  targetPort: number
  protocol: 'TCP' | 'UDP'
}

export interface EnvEntry {
  id: string
  name: string
  value: string
}

export interface VolumeMountEntry {
  id: string
  type: 'configMap' | 'secret' | 'persistentVolumeClaim' | 'emptyDir'
  name: string
  sourceName: string
  mountPath: string
  subPath: string
  readOnly: boolean
}

export interface InitContainerEntry {
  id: string
  name: string
  image: string
  imagePullPolicy: 'IfNotPresent' | 'Always' | 'Never'
  command: string
  args: string
  cpuRequest: string
  memoryRequest: string
  cpuLimit: string
  memoryLimit: string
  env: EnvEntry[]
  volumeMounts: VolumeMountEntry[]
}

export interface AppContainerEntry {
  id: string
  name: string
  image: string
  imagePullPolicy: 'IfNotPresent' | 'Always' | 'Never'
  ports: PortEntry[]
  env: EnvEntry[]
  cpuRequest: string
  memoryRequest: string
  cpuLimit: string
  memoryLimit: string
  readinessPath: string
  readinessPort: number
  readinessInitialDelaySeconds: number
  readinessPeriodSeconds: number
  readinessTimeoutSeconds: number
  readinessFailureThreshold: number
  readinessSuccessThreshold: number
  livenessPath: string
  livenessPort: number
  livenessInitialDelaySeconds: number
  livenessPeriodSeconds: number
  livenessTimeoutSeconds: number
  livenessFailureThreshold: number
  livenessSuccessThreshold: number
  startupPath: string
  startupPort: number
  startupInitialDelaySeconds: number
  startupPeriodSeconds: number
  startupTimeoutSeconds: number
  startupFailureThreshold: number
  startupSuccessThreshold: number
  volumeMounts: VolumeMountEntry[]
  lifecycleHooks: LifecycleHookEntry[]
}

export interface MatchExpressionEntry {
  id: string
  key: string
  operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist'
  values: string
}

export interface PodAffinityEntry {
  id: string
  topologyKey: string
  labelKey: string
  operator: 'In' | 'NotIn' | 'Exists' | 'DoesNotExist'
  values: string
}

export interface TolerationEntry {
  id: string
  key: string
  operator: 'Equal' | 'Exists'
  value: string
  effect: '' | 'NoSchedule' | 'PreferNoSchedule' | 'NoExecute'
  tolerationSeconds: number | null
}

export interface LifecycleHookEntry {
  id: string
  type: 'postStart' | 'preStop'
  handlerType: 'exec' | 'httpGet'
  command: string
  path: string
  port: number
}

export interface CreateFormState {
  name: string
  namespace: string
  labels: KeyValuePair[]
  annotations: KeyValuePair[]
  replicas: number
  image: string
  containerName: string
  imagePullPolicy: 'IfNotPresent' | 'Always' | 'Never'
  cpuRequest: string
  memoryRequest: string
  cpuLimit: string
  memoryLimit: string
  readinessPath: string
  readinessPort: number
  readinessInitialDelaySeconds: number
  readinessPeriodSeconds: number
  readinessTimeoutSeconds: number
  readinessFailureThreshold: number
  readinessSuccessThreshold: number
  livenessPath: string
  livenessPort: number
  livenessInitialDelaySeconds: number
  livenessPeriodSeconds: number
  livenessTimeoutSeconds: number
  livenessFailureThreshold: number
  livenessSuccessThreshold: number
  startupPath: string
  startupPort: number
  startupInitialDelaySeconds: number
  startupPeriodSeconds: number
  startupTimeoutSeconds: number
  startupFailureThreshold: number
  startupSuccessThreshold: number
  serviceAccountName: string
  automountServiceAccountToken: '' | 'true' | 'false'
  runAsUser: number | null
  runAsGroup: number | null
  fsGroup: number | null
  runAsNonRoot: '' | 'true' | 'false'
  seccompProfileType: '' | 'RuntimeDefault' | 'Localhost' | 'Unconfined'
  seccompLocalhostProfile: string
  containerRunAsUser: number | null
  containerRunAsGroup: number | null
  containerRunAsNonRoot: '' | 'true' | 'false'
  privileged: '' | 'true' | 'false'
  allowPrivilegeEscalation: '' | 'true' | 'false'
  readOnlyRootFilesystem: '' | 'true' | 'false'
  nodeSelector: KeyValuePair[]
  nodeAffinity: MatchExpressionEntry[]
  podAffinity: PodAffinityEntry[]
  podAntiAffinity: PodAffinityEntry[]
  tolerations: TolerationEntry[]
  volumeMounts: VolumeMountEntry[]
  appContainers: AppContainerEntry[]
  initContainers: InitContainerEntry[]
  lifecycleHooks: LifecycleHookEntry[]
  strategyType: '' | 'RollingUpdate' | 'Recreate'
  maxSurge: string
  maxUnavailable: string
  minReadySeconds: number | null
  revisionHistoryLimit: number | null
  progressDeadlineSeconds: number | null
  paused: boolean
  serviceType: 'ClusterIP' | 'NodePort' | 'LoadBalancer'
  ports: PortEntry[]
  env: EnvEntry[]
  configData: KeyValuePair[]
  secretType: string
  secretData: KeyValuePair[]
  storageClassName: string
  accessMode: 'ReadWriteOnce' | 'ReadOnlyMany' | 'ReadWriteMany'
  storageSize: string
}

export interface CreateFieldOption {
  label: string
  value: string
}

export interface CreateField {
  key: keyof CreateFormState
  label: string
  type: CreateFieldType
  required?: boolean
  placeholder?: string
  help?: string
  min?: number
  options?: CreateFieldOption[]
}

export interface CreateSection {
  title: string
  description?: string
  fields: CreateField[]
}

export interface CreateSchema {
  resourceType: string
  kind: string
  apiVersion: string
  title: string
  summary: string
  sections: CreateSection[]
  defaults: Partial<CreateFormState>
  toObject: (form: CreateFormState) => Record<string, unknown>
}

export interface ParsedYamlResult {
  ok: boolean
  value?: Record<string, unknown>
  error?: string
}
