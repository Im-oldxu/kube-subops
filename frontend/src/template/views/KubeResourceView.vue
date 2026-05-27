<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import BaseDialog from '@/components/common/BaseDialog.vue'
import DataTable from '@/components/common/DataTable.vue'
import Select from '@/components/common/Select.vue'
import { Icon } from '@/components/icons'
import type { Column } from '@/components/common/types'
import * as templateApi from '@/template/api'
import * as templateData from '@/template/data'

type ApiFn<TArgs extends unknown[], TResult> = (...args: TArgs) => Promise<TResult> | TResult
type ResourceStatus = 'Running' | 'Ready' | 'Pending' | 'Warning' | 'Error' | 'Succeeded' | 'Bound' | 'Active' | 'Terminating'
type DetailTab = 'overview' | 'status' | 'metadata' | 'relations' | 'events' | 'yaml'
type EditMode = 'create' | 'edit'
type ConfirmAction =
  | 'delete'
  | 'apply-yaml'
  | 'scale'
  | 'restart'
  | 'update-image'
  | 'rollback'
  | 'terminal'
  | 'drain'
  | 'cordon'
  | 'uncordon'
  | 'reveal-secret'

interface ClusterOption {
  id: string
  name: string
}

interface ResourceDefinition {
  type: string
  title: string
  kind: string
  namespaced: boolean
  description: string
  createDisabled?: boolean
  editDisabled?: boolean
  deleteDisabled?: boolean
  workload?: boolean
  pod?: boolean
  node?: boolean
  secret?: boolean
  supportsScale?: boolean
  supportsImageUpdate?: boolean
  supportsRollback?: boolean
}

interface KubeResourceItem {
  id: string
  clusterId: string
  type: string
  kind: string
  namespace?: string
  name: string
  labels: Record<string, string>
  annotations: Record<string, string>
  status: ResourceStatus
  age: string
  ready?: string
  node?: string
  image?: string
  replicas?: number
  desiredReplicas?: number
  owner?: string
  related: Array<{ kind: string; name: string; namespace?: string; status?: string }>
  events: Array<{ id: string; type: 'Normal' | 'Warning'; reason: string; message: string; lastSeen: string }>
  yaml: string
  details: Record<string, string>
}

interface PendingConfirm {
  action: ConfirmAction
  title: string
  message: string
  resource?: KubeResourceItem
  payload?: Record<string, unknown>
}

interface WorkloadActionForm {
  action: ConfirmAction
  replicas: number
  image: string
  rollbackRevision: string
}

const route = useRoute()
const apiBag = templateApi as Record<string, unknown>
const dataBag = templateData as Record<string, unknown>

const resourceDefinitions: Record<string, ResourceDefinition> = {
  pods: { type: 'pods', title: 'Pod', kind: 'Pod', namespaced: true, description: 'Pod 列表、详情、容器、日志、实时日志、终端和 YAML。', pod: true },
  deployments: { type: 'deployments', title: 'Deployment', kind: 'Deployment', namespaced: true, description: 'Deployment 工作负载管理。', workload: true, supportsScale: true, supportsImageUpdate: true, supportsRollback: true },
  statefulsets: { type: 'statefulsets', title: 'StatefulSet', kind: 'StatefulSet', namespaced: true, description: 'StatefulSet 工作负载管理。', workload: true, supportsScale: true, supportsImageUpdate: true, supportsRollback: true },
  daemonsets: { type: 'daemonsets', title: 'DaemonSet', kind: 'DaemonSet', namespaced: true, description: 'DaemonSet 节点守护进程管理。', workload: true, supportsImageUpdate: true, supportsRollback: true },
  replicasets: { type: 'replicasets', title: 'ReplicaSet', kind: 'ReplicaSet', namespaced: true, description: 'ReplicaSet 查看和关联 Pod 管理。', workload: true },
  jobs: { type: 'jobs', title: 'Job', kind: 'Job', namespaced: true, description: 'Job 任务资源管理。', workload: true },
  cronjobs: { type: 'cronjobs', title: 'CronJob', kind: 'CronJob', namespaced: true, description: 'CronJob 调度状态和关联 Job。', workload: true },
  services: { type: 'services', title: 'Service', kind: 'Service', namespaced: true, description: 'Service 网络资源管理。' },
  ingresses: { type: 'ingresses', title: 'Ingress', kind: 'Ingress', namespaced: true, description: 'Ingress 路由规则管理。' },
  endpoints: { type: 'endpoints', title: 'Endpoint', kind: 'Endpoint', namespaced: true, description: 'Endpoint 查看和兼容处理。' },
  'endpoint-slices': { type: 'endpoint-slices', title: 'EndpointSlice', kind: 'EndpointSlice', namespaced: true, description: 'EndpointSlice 查看和管理。' },
  'network-policies': { type: 'network-policies', title: 'NetworkPolicy', kind: 'NetworkPolicy', namespaced: true, description: 'NetworkPolicy 网络策略管理。' },
  configmaps: { type: 'configmaps', title: 'ConfigMap', kind: 'ConfigMap', namespaced: true, description: 'ConfigMap 配置数据管理。' },
  secrets: { type: 'secrets', title: 'Secret', kind: 'Secret', namespaced: true, description: 'Secret 管理和受控明文查看。', secret: true },
  'storage-classes': { type: 'storage-classes', title: 'StorageClass', kind: 'StorageClass', namespaced: false, description: 'StorageClass 集群级存储类管理。' },
  'persistent-volumes': { type: 'persistent-volumes', title: 'PersistentVolume', kind: 'PersistentVolume', namespaced: false, description: 'PV 集群级存储资源管理。' },
  'persistent-volume-claims': { type: 'persistent-volume-claims', title: 'PersistentVolumeClaim', kind: 'PersistentVolumeClaim', namespaced: true, description: 'PVC 命名空间级存储声明管理。' },
  'service-accounts': { type: 'service-accounts', title: 'ServiceAccount', kind: 'ServiceAccount', namespaced: true, description: 'ServiceAccount 访问身份管理。' },
  roles: { type: 'roles', title: 'Role', kind: 'Role', namespaced: true, description: 'Role 命名空间权限管理。' },
  'cluster-roles': { type: 'cluster-roles', title: 'ClusterRole', kind: 'ClusterRole', namespaced: false, description: 'ClusterRole 集群级权限管理。' },
  'role-bindings': { type: 'role-bindings', title: 'RoleBinding', kind: 'RoleBinding', namespaced: true, description: 'RoleBinding 命名空间授权绑定。' },
  'cluster-role-bindings': { type: 'cluster-role-bindings', title: 'ClusterRoleBinding', kind: 'ClusterRoleBinding', namespaced: false, description: 'ClusterRoleBinding 集群级授权绑定。' },
  nodes: { type: 'nodes', title: 'Node', kind: 'Node', namespaced: false, description: 'Node 状态、容量、Pod、事件和节点操作。', node: true },
  namespaces: { type: 'namespaces', title: 'Namespace', kind: 'Namespace', namespaced: false, description: 'Namespace 生命周期管理。' },
  events: { type: 'events', title: 'Event', kind: 'Event', namespaced: true, description: 'Kubernetes Event 查看页。', createDisabled: true, editDisabled: true, deleteDisabled: true }
}

const routeAliases: Record<string, string> = {
  Pods: 'pods',
  WorkloadDeployments: 'deployments',
  WorkloadStatefulSets: 'statefulsets',
  WorkloadDaemonSets: 'daemonsets',
  WorkloadReplicaSets: 'replicasets',
  WorkloadJobs: 'jobs',
  WorkloadCronJobs: 'cronjobs',
  NetworkServices: 'services',
  NetworkIngresses: 'ingresses',
  NetworkEndpoints: 'endpoints',
  NetworkEndpointSlices: 'endpoint-slices',
  NetworkPolicies: 'network-policies',
  ConfigMaps: 'configmaps',
  Secrets: 'secrets',
  StorageClasses: 'storage-classes',
  PersistentVolumes: 'persistent-volumes',
  PersistentVolumeClaims: 'persistent-volume-claims',
  ServiceAccounts: 'service-accounts',
  Roles: 'roles',
  ClusterRoles: 'cluster-roles',
  RoleBindings: 'role-bindings',
  ClusterRoleBindings: 'cluster-role-bindings',
  Nodes: 'nodes',
  Namespaces: 'namespaces',
  Events: 'events'
}

const fallbackClusters: ClusterOption[] = [
  { id: 'prod-main', name: 'prod-main' },
  { id: 'staging', name: 'staging' },
  { id: 'dev-sandbox', name: 'dev-sandbox' }
]
const namespaceOptions = ['all-namespaces', 'default', 'kube-system', 'platform', 'observability']
const statusOptions = ['all', 'Running', 'Ready', 'Pending', 'Warning', 'Error', 'Succeeded', 'Bound', 'Active', 'Terminating']
const pageSizeOptions = [
  { label: '10 条 / 页', value: 10 },
  { label: '20 条 / 页', value: 20 },
  { label: '50 条 / 页', value: 50 }
]

const filters = reactive({
  clusterId: 'prod-main',
  namespace: 'all-namespaces',
  name: '',
  labels: '',
  status: 'all',
  keyword: ''
})
const clusters = ref<ClusterOption[]>(fallbackClusters)
const resources = ref<KubeResourceItem[]>([])
const selectedResource = ref<KubeResourceItem | null>(null)
const activeDetailTab = ref<DetailTab>('overview')
const page = ref(1)
const pageSize = ref(10)
const loading = ref(false)
const errorMessage = ref('')
const successMessage = ref('')
const editDialogOpen = ref(false)
const editMode = ref<EditMode>('create')
const yamlDialogOpen = ref(false)
const actionDialogOpen = ref(false)
const logsDialogOpen = ref(false)
const terminalDialogOpen = ref(false)
const secretDialogOpen = ref(false)
const pendingConfirm = ref<PendingConfirm | null>(null)
const formState = reactive({
  name: '',
  namespace: 'default',
  yaml: ''
})
const yamlDraft = ref('')
const logsText = ref('')
const secretPlaintext = ref<Record<string, string>>({})
const actionForm = reactive<WorkloadActionForm>({
  action: 'scale',
  replicas: 1,
  image: '',
  rollbackRevision: 'previous'
})

const tableColumns = computed<Column[]>(() => [
  { key: 'name', label: '名称', sortable: true, class: 'min-w-56' },
  ...(currentDefinition.value.namespaced ? [{ key: 'namespace', label: 'Namespace', sortable: true }] : []),
  { key: 'status', label: '状态', sortable: true },
  { key: 'ready', label: '就绪', sortable: true },
  { key: 'labels', label: '标签' },
  { key: 'age', label: '年龄', sortable: true },
  { key: 'actions', label: '操作', class: 'min-w-96' }
])

const currentResourceType = computed(() => resolveResourceType())
const currentDefinition = computed(() => resourceDefinitions[currentResourceType.value] ?? resourceDefinitions.pods)
const clusterOptions = computed(() => clusters.value.map((cluster) => ({ label: cluster.name, value: cluster.id })))
const computedNamespaceOptions = computed(() => {
  const options = currentDefinition.value.namespaced ? namespaceOptions : ['cluster-scope']
  return options.map((namespace) => ({ label: namespace, value: namespace }))
})
const filteredResources = computed(() => {
  const keyword = filters.keyword.trim().toLowerCase()
  const name = filters.name.trim().toLowerCase()
  const labelFilter = filters.labels.trim().toLowerCase()
  return resources.value
    .filter((item) => item.clusterId === filters.clusterId)
    .filter((item) => item.type === currentDefinition.value.type)
    .filter((item) => !currentDefinition.value.namespaced || filters.namespace === 'all-namespaces' || item.namespace === filters.namespace)
    .filter((item) => filters.status === 'all' || item.status === filters.status)
    .filter((item) => !name || item.name.toLowerCase().includes(name))
    .filter((item) => {
      if (!labelFilter) return true
      return Object.entries(item.labels).some(([key, value]) => `${key}=${value}`.toLowerCase().includes(labelFilter))
    })
    .filter((item) => {
      if (!keyword) return true
      return `${item.name} ${item.namespace ?? ''} ${item.kind} ${item.status}`.toLowerCase().includes(keyword)
    })
})
const totalPages = computed(() => Math.max(1, Math.ceil(filteredResources.value.length / pageSize.value)))
const pagedResources = computed(() => filteredResources.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value))
const detailTabs = [
  { id: 'overview', label: '基本信息' },
  { id: 'status', label: '状态' },
  { id: 'metadata', label: '标签与注解' },
  { id: 'relations', label: '关联资源' },
  { id: 'events', label: '事件' },
  { id: 'yaml', label: 'YAML' }
] as const

function getExport<T>(name: string): T | undefined {
  return apiBag[name] as T | undefined
}

function getDataExport<T>(name: string): T | undefined {
  return dataBag[name] as T | undefined
}

async function callApi<TArgs extends unknown[], TResult>(names: string[], args: TArgs, fallback: TResult): Promise<TResult> {
  for (const name of names) {
    const fn = getExport<ApiFn<TArgs, TResult>>(name)
    if (typeof fn === 'function') return await fn(...args)
  }
  return fallback
}

function resolveResourceType() {
  const fromMeta = String(route.meta.resourceType ?? '')
  if (fromMeta && resourceDefinitions[fromMeta]) return fromMeta
  const fromName = route.name ? routeAliases[String(route.name)] : ''
  if (fromName) return fromName
  const segments = route.path.split('/').filter(Boolean)
  const path = segments[segments.length - 1] ?? 'pods'
  return resourceDefinitions[path] ? path : 'pods'
}

function sampleYaml(kind: string, name: string, namespace?: string) {
  return [
    'apiVersion: v1',
    `kind: ${kind}`,
    'metadata:',
    `  name: ${name}`,
    namespace ? `  namespace: ${namespace}` : '',
    '  labels:',
    '    app.kubernetes.io/managed-by: kube-subops',
    'spec:',
    '  # 由后端返回完整 YAML；当前为前端 mock 示例'
  ].filter(Boolean).join('\n')
}

function makeResource(definition: ResourceDefinition, index: number): KubeResourceItem {
  const namespace = definition.namespaced ? ['default', 'platform', 'observability'][index % 3] : undefined
  const baseName = {
    pods: ['gateway-668b7d9b77-kw7mx', 'payment-api-7f6cdd5f65-2kqvc', 'console-6f5fbcc8b6-nv2sq'],
    deployments: ['gateway', 'payment-api', 'console'],
    statefulsets: ['postgres', 'redis', 'victoria-metrics'],
    daemonsets: ['node-exporter', 'fluent-bit', 'csi-node'],
    nodes: ['worker-a', 'worker-b', 'control-plane-1'],
    secrets: ['registry-credential', 'db-password', 'webhook-token'],
    services: ['gateway', 'payment-api', 'console']
  }[definition.type]?.[index] ?? `${definition.type}-${index + 1}`
  const status: ResourceStatus = index === 1 ? 'Warning' : definition.type === 'jobs' ? 'Succeeded' : definition.type === 'persistent-volume-claims' ? 'Bound' : 'Running'
  return {
    id: `${definition.type}-${baseName}`,
    clusterId: 'prod-main',
    type: definition.type,
    kind: definition.kind,
    namespace,
    name: baseName,
    labels: {
      app: baseName.split('-')[0] || definition.type,
      tier: index % 2 ? 'backend' : 'platform'
    },
    annotations: {
      'kube-subops.io/last-sync': '2026-05-27T10:30:00+08:00',
      'kubectl.kubernetes.io/last-applied-configuration': 'managed'
    },
    status,
    age: `${index + 2}d`,
    ready: definition.pod ? (index === 1 ? '0/1' : '1/1') : definition.workload ? (index === 1 ? '2/3' : '3/3') : '-',
    node: definition.pod ? ['worker-a', 'worker-b', 'worker-c'][index % 3] : undefined,
    image: definition.pod || definition.workload ? `registry.internal/${baseName}:v1.${index + 2}.0` : undefined,
    replicas: definition.workload ? (index === 1 ? 2 : 3) : undefined,
    desiredReplicas: definition.workload ? 3 : undefined,
    owner: definition.pod ? 'ReplicaSet/console-6f5fbcc8b6' : undefined,
    related: [
      { kind: 'Pod', name: `${baseName}-pod-a`, namespace, status: index === 1 ? 'Warning' : 'Running' },
      { kind: 'Service', name: baseName, namespace, status: 'Ready' }
    ],
    events: [
      { id: `${baseName}-evt-1`, type: index === 1 ? 'Warning' : 'Normal', reason: index === 1 ? 'Unhealthy' : 'Pulled', message: index === 1 ? 'readiness probe failed' : 'Container image pulled', lastSeen: '5 分钟前' },
      { id: `${baseName}-evt-2`, type: 'Normal', reason: 'Scheduled', message: 'Successfully assigned resource', lastSeen: '1 小时前' }
    ],
    yaml: sampleYaml(definition.kind, baseName, namespace),
    details: {
      API版本: 'v1',
      创建时间: '2026-05-24 10:12',
      所属节点: definition.pod ? ['worker-a', 'worker-b', 'worker-c'][index % 3] : '-',
      镜像: definition.pod || definition.workload ? `registry.internal/${baseName}:v1.${index + 2}.0` : '-'
    }
  }
}

function buildFallbackResources(type = currentDefinition.value.type) {
  const definition = resourceDefinitions[type] ?? resourceDefinitions.pods
  return [0, 1, 2].map((index) => makeResource(definition, index))
}

function normalizeResourceList(value: unknown): KubeResourceItem[] {
  const candidate = Array.isArray(value) ? value : typeof value === 'object' && value !== null ? (value as { items?: unknown }).items : undefined
  if (!Array.isArray(candidate)) return buildFallbackResources()
  return candidate.map((item, index) => {
    const partial = item as Partial<KubeResourceItem>
    return {
      ...makeResource(currentDefinition.value, index),
      ...partial,
      type: partial.type ?? currentDefinition.value.type,
      kind: partial.kind ?? currentDefinition.value.kind,
      clusterId: partial.clusterId ?? filters.clusterId,
      labels: partial.labels ?? {},
      annotations: partial.annotations ?? {},
      related: partial.related ?? [],
      events: partial.events ?? [],
      yaml: partial.yaml ?? sampleYaml(currentDefinition.value.kind, partial.name ?? `resource-${index + 1}`, partial.namespace)
    }
  })
}

function statusClass(status: ResourceStatus | string) {
  if (['Running', 'Ready', 'Succeeded', 'Bound', 'Active'].includes(status)) return 'badge-success'
  if (status === 'Pending') return 'badge-primary'
  if (status === 'Warning' || status === 'Terminating') return 'badge-warning'
  return 'badge-danger'
}

function labelPairs(labels: Record<string, string>) {
  return Object.entries(labels).map(([key, value]) => `${key}=${value}`)
}

function selectResource(resource: KubeResourceItem) {
  selectedResource.value = resource
  activeDetailTab.value = 'overview'
}

async function refreshResources() {
  loading.value = true
  errorMessage.value = ''
  successMessage.value = ''
  try {
    const dataFallback = getDataExport<unknown>('kubeResources') ?? buildFallbackResources()
    const result = await callApi(['listKubeResources', 'listResources', 'getKubeResourceList'], [{ resourceType: currentDefinition.value.type, ...filters, page: page.value, pageSize: pageSize.value }], dataFallback)
    resources.value = normalizeResourceList(result)
    if (!selectedResource.value || selectedResource.value.type !== currentDefinition.value.type) {
      selectedResource.value = filteredResources.value[0] ?? null
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '资源列表加载失败'
  } finally {
    loading.value = false
  }
}

function openCreate() {
  editMode.value = 'create'
  formState.name = ''
  formState.namespace = currentDefinition.value.namespaced ? (filters.namespace === 'all-namespaces' ? 'default' : filters.namespace) : ''
  formState.yaml = sampleYaml(currentDefinition.value.kind, `${currentDefinition.value.type}-sample`, formState.namespace)
  editDialogOpen.value = true
}

function openEdit(resource: KubeResourceItem) {
  editMode.value = 'edit'
  formState.name = resource.name
  formState.namespace = resource.namespace ?? ''
  formState.yaml = resource.yaml
  editDialogOpen.value = true
}

async function submitForm() {
  const payload = {
    clusterId: filters.clusterId,
    resourceType: currentDefinition.value.type,
    namespace: formState.namespace || undefined,
    name: formState.name,
    yaml: formState.yaml
  }
  await callApi(
    editMode.value === 'create' ? ['createKubeResource', 'createResource'] : ['updateKubeResource', 'updateResource'],
    [payload],
    { ok: true }
  )
  editDialogOpen.value = false
  successMessage.value = editMode.value === 'create' ? '创建请求已提交' : '编辑请求已提交'
  await refreshResources()
}

function openYaml(resource: KubeResourceItem) {
  selectResource(resource)
  yamlDraft.value = resource.yaml
  yamlDialogOpen.value = true
}

function openApplyYaml() {
  if (!selectedResource.value) return
  pendingConfirm.value = {
    action: 'apply-yaml',
    title: '确认应用 YAML',
    message: `将对 ${currentDefinition.value.kind}/${selectedResource.value.name} 应用 YAML，后端会再次校验权限和资源范围。`,
    resource: selectedResource.value,
    payload: { yaml: yamlDraft.value || selectedResource.value.yaml }
  }
}

function openDelete(resource: KubeResourceItem) {
  pendingConfirm.value = {
    action: 'delete',
    title: '确认删除资源',
    message: `删除 ${resource.kind}/${resource.name} 属于高风险操作，请确认后继续。`,
    resource
  }
}

function openWorkloadAction(resource: KubeResourceItem, action: ConfirmAction) {
  actionForm.action = action
  actionForm.replicas = resource.desiredReplicas ?? resource.replicas ?? 1
  actionForm.image = resource.image ?? ''
  actionForm.rollbackRevision = 'previous'
  selectResource(resource)
  actionDialogOpen.value = true
}

function confirmWorkloadAction() {
  if (!selectedResource.value) return
  const payload = {
    replicas: actionForm.replicas,
    image: actionForm.image,
    revision: actionForm.rollbackRevision
  }
  const labels: Record<ConfirmAction, string> = {
    scale: '扩缩容',
    restart: '重启',
    'update-image': '更新镜像',
    rollback: '回滚',
    delete: '删除',
    'apply-yaml': '应用 YAML',
    terminal: '进入终端',
    drain: 'drain 节点',
    cordon: 'cordon 节点',
    uncordon: 'uncordon 节点',
    'reveal-secret': '查看 Secret 明文'
  }
  pendingConfirm.value = {
    action: actionForm.action,
    title: `确认${labels[actionForm.action]}`,
    message: `${labels[actionForm.action]} ${selectedResource.value.kind}/${selectedResource.value.name} 会写入审计并由后端复核权限。`,
    resource: selectedResource.value,
    payload
  }
}

async function openLogs(resource: KubeResourceItem, follow = false) {
  selectResource(resource)
  logsDialogOpen.value = true
  logsText.value = '日志加载中...'
  logsText.value = await callApi(
    ['getKubePodLogs', 'getPodLogs'],
    [{ clusterId: filters.clusterId, namespace: resource.namespace, podName: resource.name, follow, tailLines: 200 }],
    [
      `[${new Date().toISOString()}] ${resource.name} container started`,
      `[${new Date().toISOString()}] readiness probe ${resource.status === 'Warning' ? 'failed' : 'succeeded'}`,
      follow ? '[stream] 实时日志连接已建立，等待后端 SSE / WebSocket 接入。' : '[tail] 最近 200 行日志已加载。'
    ].join('\n')
  )
}

function openTerminal(resource: KubeResourceItem) {
  pendingConfirm.value = {
    action: 'terminal',
    title: '确认进入 Pod 终端',
    message: `进入 ${resource.name} 终端会被审计记录，请确认已获得授权。`,
    resource
  }
}

function openNodeAction(resource: KubeResourceItem, action: 'drain' | 'cordon' | 'uncordon') {
  const labels = { drain: 'drain 节点', cordon: 'cordon 节点', uncordon: 'uncordon 节点' }
  pendingConfirm.value = {
    action,
    title: `确认${labels[action]}`,
    message: `${labels[action]} ${resource.name} 会影响调度或驱逐 Pod，请确认维护窗口和影响范围。`,
    resource
  }
}

function openSecretReveal(resource: KubeResourceItem) {
  pendingConfirm.value = {
    action: 'reveal-secret',
    title: '确认查看 Secret 明文',
    message: `Secret/${resource.name} 明文只会短暂展示在当前弹窗中，关闭后即清空。`,
    resource
  }
}

async function performHighRiskAction(payload: Record<string, unknown>) {
  const generic = getExport<ApiFn<[Record<string, unknown>], unknown>>('performHighRiskAction')
  if (typeof generic === 'function') return await generic(payload)

  const action = String(payload.action ?? '')
  if (action === 'delete') return await callApi(['deleteKubeResource', 'deleteResource'], [payload], { ok: true })
  if (action === 'apply-yaml') return await callApi(['applyKubeYaml', 'applyYaml'], [payload], { ok: true })
  if (action === 'reveal-secret') {
    return await callApi(['revealKubeSecret', 'revealSecret'], [payload], { data: { username: 'admin', password: '临时明文示例' } })
  }
  if (['drain', 'cordon', 'uncordon'].includes(action)) return await callApi(['performKubeNodeAction', 'performNodeAction'], [payload], { ok: true })
  if (action === 'terminal') return await callApi(['openKubePodTerminal', 'openPodTerminal'], [payload], { sessionId: 'mock-terminal-session' })
  return await callApi(['performKubeWorkloadAction', 'performWorkloadAction'], [payload], { ok: true })
}

async function confirmHighRisk() {
  if (!pendingConfirm.value) return
  const resource = pendingConfirm.value.resource
  const action = pendingConfirm.value.action
  const response = await performHighRiskAction({
    confirm: true,
    action,
    clusterId: filters.clusterId,
    resourceType: currentDefinition.value.type,
    kind: resource?.kind ?? currentDefinition.value.kind,
    namespace: resource?.namespace,
    name: resource?.name,
    ...(pendingConfirm.value.payload ?? {})
  })

  if (action === 'reveal-secret') {
    const data = response && typeof response === 'object' && 'data' in response ? (response as { data?: Record<string, string> }).data : undefined
    secretPlaintext.value = data ?? { username: 'admin', password: '临时明文示例' }
    secretDialogOpen.value = true
  } else if (action === 'terminal') {
    terminalDialogOpen.value = true
  } else {
    successMessage.value = `${pendingConfirm.value.title}请求已提交`
  }

  pendingConfirm.value = null
  actionDialogOpen.value = false
  yamlDialogOpen.value = action === 'apply-yaml' ? false : yamlDialogOpen.value
  await refreshResources()
}

function closeSecretDialog() {
  secretDialogOpen.value = false
  secretPlaintext.value = {}
}

function goPrevPage() {
  page.value = Math.max(1, page.value - 1)
}

function goNextPage() {
  page.value = Math.min(totalPages.value, page.value + 1)
}

watch(currentResourceType, () => {
  filters.status = 'all'
  filters.name = ''
  filters.labels = ''
  filters.keyword = ''
  filters.namespace = currentDefinition.value.namespaced ? 'all-namespaces' : 'cluster-scope'
  page.value = 1
  selectedResource.value = null
  refreshResources()
})

watch([() => filters.namespace, () => filters.name, () => filters.labels, () => filters.status, () => filters.keyword, pageSize], () => {
  page.value = 1
})

onMounted(() => {
  const clusterData = getDataExport<ClusterOption[]>('kubeClusters')
  if (Array.isArray(clusterData)) clusters.value = clusterData
  if (!currentDefinition.value.namespaced) filters.namespace = 'cluster-scope'
  refreshResources()
})
</script>

<template>
  <div class="space-y-6">
    <section class="card">
      <div class="card-header flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <div class="flex flex-wrap items-center gap-2">
            <h2 class="text-base font-semibold text-gray-900 dark:text-white">{{ currentDefinition.title }}</h2>
            <span class="badge" :class="currentDefinition.namespaced ? 'badge-primary' : 'badge-gray'">
              {{ currentDefinition.namespaced ? '命名空间级' : '集群级' }}
            </span>
          </div>
          <p class="text-sm text-gray-500 dark:text-dark-400">{{ currentDefinition.description }}</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button class="btn btn-secondary" type="button" :disabled="loading" @click="refreshResources">
            <Icon name="refresh" size="sm" :class="{ 'animate-spin': loading }" />
            刷新
          </button>
          <button class="btn btn-primary" type="button" :disabled="currentDefinition.createDisabled" @click="openCreate">
            <Icon name="plus" size="sm" />
            创建
          </button>
        </div>
      </div>
      <div class="card-body space-y-4">
        <div class="grid gap-3 lg:grid-cols-6">
          <Select v-model="filters.clusterId" :options="clusterOptions" searchable @change="refreshResources" />
          <Select v-model="filters.namespace" :options="computedNamespaceOptions" :disabled="!currentDefinition.namespaced" searchable />
          <input v-model="filters.name" class="input" placeholder="按名称筛选" />
          <input v-model="filters.labels" class="input" placeholder="标签 app=console" />
          <Select v-model="filters.status" :options="statusOptions.map((status) => ({ label: status === 'all' ? '全部状态' : status, value: status }))" />
          <input v-model="filters.keyword" class="input" type="search" placeholder="搜索" />
        </div>
        <div v-if="errorMessage" class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {{ errorMessage }}
        </div>
        <div v-if="successMessage" class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
          {{ successMessage }}
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-body">
        <DataTable :columns="tableColumns" :data="pagedResources" :loading="loading" row-key="id" default-sort-key="name" :sort-storage-key="`kube-${currentDefinition.type}-sort`">
          <template #cell-name="{ row }">
            <button class="text-left font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400" type="button" @click="selectResource(row)">
              {{ row.name }}
            </button>
            <p class="mt-1 text-xs text-gray-400 dark:text-dark-500">{{ row.kind }}</p>
          </template>
          <template #cell-status="{ row }">
            <span class="badge" :class="statusClass(row.status)">{{ row.status }}</span>
          </template>
          <template #cell-ready="{ row }">
            <span class="font-mono text-xs">{{ row.ready || '-' }}</span>
          </template>
          <template #cell-labels="{ row }">
            <div class="flex max-w-md flex-wrap gap-1">
              <span v-for="label in labelPairs(row.labels).slice(0, 3)" :key="label" class="badge badge-gray">{{ label }}</span>
            </div>
          </template>
          <template #cell-actions="{ row }">
            <div class="action-list">
              <button class="action-item action-item-primary" type="button" @click="selectResource(row)">
                <Icon name="eye" size="sm" />
                <span>详情</span>
              </button>
              <button class="action-item action-item-info" type="button" @click="openYaml(row)">
                <Icon name="document" size="sm" />
                <span>YAML</span>
              </button>
              <button class="action-item action-item-primary" type="button" :disabled="currentDefinition.editDisabled" @click="openEdit(row)">
                <Icon name="edit" size="sm" />
                <span>编辑</span>
              </button>
              <button v-if="currentDefinition.workload && currentDefinition.supportsScale" class="action-item action-item-success" type="button" @click="openWorkloadAction(row, 'scale')">
                <Icon name="arrowsUpDown" size="sm" />
                <span>扩缩容</span>
              </button>
              <button v-if="currentDefinition.workload" class="action-item action-item-warning" type="button" @click="openWorkloadAction(row, 'restart')">
                <Icon name="refresh" size="sm" />
                <span>重启</span>
              </button>
              <button v-if="currentDefinition.workload && currentDefinition.supportsImageUpdate" class="action-item action-item-primary" type="button" @click="openWorkloadAction(row, 'update-image')">
                <Icon name="upload" size="sm" />
                <span>镜像</span>
              </button>
              <button v-if="currentDefinition.workload && currentDefinition.supportsRollback" class="action-item action-item-warning" type="button" @click="openWorkloadAction(row, 'rollback')">
                <Icon name="sync" size="sm" />
                <span>回滚</span>
              </button>
              <button v-if="currentDefinition.pod" class="action-item action-item-primary" type="button" @click="openLogs(row, false)">
                <Icon name="document" size="sm" />
                <span>日志</span>
              </button>
              <button v-if="currentDefinition.pod" class="action-item action-item-success" type="button" @click="openLogs(row, true)">
                <Icon name="play" size="sm" />
                <span>实时</span>
              </button>
              <button v-if="currentDefinition.pod" class="action-item action-item-warning" type="button" @click="openTerminal(row)">
                <Icon name="terminal" size="sm" />
                <span>终端</span>
              </button>
              <button v-if="currentDefinition.node" class="action-item action-item-warning" type="button" @click="openNodeAction(row, 'drain')">
                <Icon name="download" size="sm" />
                <span>drain</span>
              </button>
              <button v-if="currentDefinition.node" class="action-item action-item-primary" type="button" @click="openNodeAction(row, 'cordon')">
                <Icon name="ban" size="sm" />
                <span>cordon</span>
              </button>
              <button v-if="currentDefinition.node" class="action-item action-item-success" type="button" @click="openNodeAction(row, 'uncordon')">
                <Icon name="checkCircle" size="sm" />
                <span>uncordon</span>
              </button>
              <button v-if="currentDefinition.secret" class="action-item action-item-warning" type="button" @click="openSecretReveal(row)">
                <Icon name="eye" size="sm" />
                <span>明文</span>
              </button>
              <button class="action-item action-item-danger" type="button" :disabled="currentDefinition.deleteDisabled" @click="openDelete(row)">
                <Icon name="trash" size="sm" />
                <span>删除</span>
              </button>
            </div>
          </template>
        </DataTable>

        <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p class="text-sm text-gray-500 dark:text-dark-400">共 {{ filteredResources.length }} 条，当前第 {{ page }} / {{ totalPages }} 页</p>
          <div class="flex items-center gap-2">
            <Select v-model="pageSize" :options="pageSizeOptions" />
            <button class="btn btn-secondary btn-sm" type="button" :disabled="page <= 1" @click="goPrevPage">上一页</button>
            <button class="btn btn-secondary btn-sm" type="button" :disabled="page >= totalPages" @click="goNextPage">下一页</button>
          </div>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-header flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 class="text-base font-semibold text-gray-900 dark:text-white">资源详情</h2>
          <p class="text-sm text-gray-500 dark:text-dark-400">
            {{ selectedResource ? `${selectedResource.kind}/${selectedResource.name}` : '从列表选择资源查看详情' }}
          </p>
        </div>
        <div v-if="selectedResource" class="tabs overflow-x-auto">
          <button
            v-for="tab in detailTabs"
            :key="tab.id"
            type="button"
            class="tab whitespace-nowrap"
            :class="{ 'tab-active': activeDetailTab === tab.id }"
            @click="activeDetailTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </div>
      </div>
      <div class="card-body">
        <div v-if="!selectedResource" class="empty-state">
          <Icon name="inbox" size="xl" class="empty-state-icon" />
          <p class="empty-state-title">暂无选中资源</p>
          <p class="empty-state-description">点击列表中的资源名称或详情操作后展示基本信息、状态、关联资源、事件和 YAML。</p>
        </div>

        <div v-else-if="activeDetailTab === 'overview'" class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div v-for="[key, value] in Object.entries(selectedResource.details)" :key="key" class="rounded-xl border border-gray-100 p-4 dark:border-dark-700">
            <p class="text-xs text-gray-500 dark:text-dark-400">{{ key }}</p>
            <p class="mt-2 break-all text-sm font-medium text-gray-900 dark:text-white">{{ value }}</p>
          </div>
        </div>

        <div v-else-if="activeDetailTab === 'status'" class="grid gap-4 md:grid-cols-3">
          <div class="rounded-xl border border-gray-100 p-4 dark:border-dark-700">
            <p class="text-xs text-gray-500 dark:text-dark-400">当前状态</p>
            <span class="badge mt-2" :class="statusClass(selectedResource.status)">{{ selectedResource.status }}</span>
          </div>
          <div class="rounded-xl border border-gray-100 p-4 dark:border-dark-700">
            <p class="text-xs text-gray-500 dark:text-dark-400">就绪</p>
            <p class="mt-2 text-lg font-semibold text-gray-900 dark:text-white">{{ selectedResource.ready || '-' }}</p>
          </div>
          <div class="rounded-xl border border-gray-100 p-4 dark:border-dark-700">
            <p class="text-xs text-gray-500 dark:text-dark-400">副本</p>
            <p class="mt-2 text-lg font-semibold text-gray-900 dark:text-white">{{ selectedResource.replicas ?? '-' }} / {{ selectedResource.desiredReplicas ?? '-' }}</p>
          </div>
        </div>

        <div v-else-if="activeDetailTab === 'metadata'" class="grid gap-6 lg:grid-cols-2">
          <div>
            <h3 class="mb-3 text-sm font-semibold text-gray-900 dark:text-white">标签</h3>
            <div class="flex flex-wrap gap-2">
              <span v-for="label in labelPairs(selectedResource.labels)" :key="label" class="badge badge-gray">{{ label }}</span>
            </div>
          </div>
          <div>
            <h3 class="mb-3 text-sm font-semibold text-gray-900 dark:text-white">注解</h3>
            <div class="space-y-2">
              <p v-for="[key, value] in Object.entries(selectedResource.annotations)" :key="key" class="rounded-lg bg-gray-50 px-3 py-2 font-mono text-xs text-gray-600 dark:bg-dark-900/60 dark:text-dark-300">
                {{ key }}={{ value }}
              </p>
            </div>
          </div>
        </div>

        <div v-else-if="activeDetailTab === 'relations'" class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>类型</th>
                <th>名称</th>
                <th>Namespace</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in selectedResource.related" :key="`${item.kind}-${item.name}`">
                <td>{{ item.kind }}</td>
                <td>{{ item.name }}</td>
                <td>{{ item.namespace || '-' }}</td>
                <td><span class="badge" :class="statusClass(item.status || 'Ready')">{{ item.status || 'Ready' }}</span></td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else-if="activeDetailTab === 'events'" class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>类型</th>
                <th>原因</th>
                <th>消息</th>
                <th>最近出现</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="event in selectedResource.events" :key="event.id">
                <td><span class="badge" :class="event.type === 'Warning' ? 'badge-warning' : 'badge-success'">{{ event.type }}</span></td>
                <td class="font-mono text-xs">{{ event.reason }}</td>
                <td>{{ event.message }}</td>
                <td>{{ event.lastSeen }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div v-else>
          <pre class="code-block max-h-[460px] whitespace-pre-wrap">{{ selectedResource.yaml }}</pre>
        </div>
      </div>
    </section>

    <BaseDialog :show="editDialogOpen" :title="editMode === 'create' ? `创建 ${currentDefinition.title}` : `编辑 ${currentDefinition.title}`" width="wide" @close="editDialogOpen = false">
      <form class="space-y-4" @submit.prevent="submitForm">
        <label class="block">
          <span class="input-label">名称</span>
          <input v-model="formState.name" class="input" :disabled="editMode === 'edit'" placeholder="resource-name" />
        </label>
        <label v-if="currentDefinition.namespaced" class="block">
          <span class="input-label">Namespace</span>
          <input v-model="formState.namespace" class="input" placeholder="default" />
        </label>
        <label class="block">
          <span class="input-label">YAML</span>
          <textarea v-model="formState.yaml" class="input min-h-80 font-mono text-xs" spellcheck="false"></textarea>
        </label>
        <div class="flex justify-end gap-2">
          <button class="btn btn-secondary" type="button" @click="editDialogOpen = false">取消</button>
          <button class="btn btn-primary" type="submit">提交</button>
        </div>
      </form>
    </BaseDialog>

    <BaseDialog :show="yamlDialogOpen" title="查看与应用 YAML" width="wide" @close="yamlDialogOpen = false">
      <textarea v-model="yamlDraft" class="input min-h-[460px] font-mono text-xs" spellcheck="false"></textarea>
      <template #footer>
        <button class="btn btn-secondary" type="button" @click="yamlDialogOpen = false">关闭</button>
        <button class="btn btn-danger" type="button" @click="openApplyYaml">
          <Icon name="upload" size="sm" />
          应用 YAML
        </button>
      </template>
    </BaseDialog>

    <BaseDialog :show="actionDialogOpen" title="工作负载操作" width="normal" @close="actionDialogOpen = false">
      <div class="space-y-4">
        <label v-if="actionForm.action === 'scale'" class="block">
          <span class="input-label">目标副本数</span>
          <input v-model.number="actionForm.replicas" class="input" min="0" type="number" />
        </label>
        <label v-if="actionForm.action === 'update-image'" class="block">
          <span class="input-label">目标镜像</span>
          <input v-model="actionForm.image" class="input" placeholder="registry.example/app:v1.2.3" />
        </label>
        <label v-if="actionForm.action === 'rollback'" class="block">
          <span class="input-label">回滚目标</span>
          <input v-model="actionForm.rollbackRevision" class="input" placeholder="previous 或 revision id" />
        </label>
        <p class="text-sm text-gray-500 dark:text-dark-400">提交前会进入二次确认，并调用高风险操作接口携带 confirm=true。</p>
      </div>
      <template #footer>
        <button class="btn btn-secondary" type="button" @click="actionDialogOpen = false">取消</button>
        <button class="btn btn-danger" type="button" @click="confirmWorkloadAction">继续确认</button>
      </template>
    </BaseDialog>

    <BaseDialog :show="Boolean(pendingConfirm)" :title="pendingConfirm?.title || '确认操作'" width="normal" @close="pendingConfirm = null">
      <p class="text-sm leading-6 text-gray-600 dark:text-dark-300">{{ pendingConfirm?.message }}</p>
      <template #footer>
        <button class="btn btn-secondary" type="button" @click="pendingConfirm = null">取消</button>
        <button class="btn btn-danger" type="button" @click="confirmHighRisk">确认执行</button>
      </template>
    </BaseDialog>

    <BaseDialog :show="logsDialogOpen" title="Pod 日志" width="wide" @close="logsDialogOpen = false">
      <pre class="code-block max-h-[560px] whitespace-pre-wrap">{{ logsText }}</pre>
    </BaseDialog>

    <BaseDialog :show="terminalDialogOpen" title="Pod 终端" width="wide" @close="terminalDialogOpen = false">
      <div class="rounded-xl bg-gray-950 p-4 font-mono text-sm text-emerald-300">
        <p>$ kubectl exec -it {{ selectedResource?.name }} -- /bin/sh</p>
        <p class="mt-3 text-gray-400">终端 WebSocket 将由后端 API-017 接入。当前确认已提交并记录审计。</p>
      </div>
    </BaseDialog>

    <BaseDialog :show="secretDialogOpen" title="Secret 明文" width="normal" @close="closeSecretDialog">
      <div class="space-y-3">
        <p class="text-sm text-amber-600 dark:text-amber-400">关闭弹窗后会清空当前明文状态，页面不会长期保存 Secret 内容。</p>
        <div v-for="[key, value] in Object.entries(secretPlaintext)" :key="key" class="rounded-xl border border-gray-100 p-3 dark:border-dark-700">
          <p class="text-xs text-gray-500 dark:text-dark-400">{{ key }}</p>
          <p class="mt-1 break-all font-mono text-sm text-gray-900 dark:text-white">{{ value }}</p>
        </div>
      </div>
    </BaseDialog>
  </div>
</template>
