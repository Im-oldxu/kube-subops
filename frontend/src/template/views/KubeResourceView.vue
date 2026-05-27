<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import BaseDialog from '@/components/common/BaseDialog.vue'
import DataTable from '@/components/common/DataTable.vue'
import Select from '@/components/common/Select.vue'
import { Icon } from '@/components/icons'
import type { Column } from '@/components/common/types'
import {
  applyObjectToForm,
  createDefaultForm,
  createSchemas,
  validateCreateForm
} from '@/template/kube-create/schemas'
import type { AppContainerEntry, CreateField, CreateFieldOption, CreateFormState, InitContainerEntry, KeyValuePair, VolumeMountEntry } from '@/template/kube-create/types'
import { parseKubeYaml, stringifyKubeObject } from '@/template/kube-create/yaml'
import * as templateApi from '@/template/api'
import * as templateData from '@/template/data'

type ApiFn<TArgs extends unknown[], TResult> = (...args: TArgs) => Promise<TResult> | TResult
type ResourceStatus = 'Running' | 'Ready' | 'Pending' | 'Warning' | 'Error' | 'Succeeded' | 'Bound' | 'Active' | 'Terminating'
type DetailTab = 'overview' | 'status' | 'metadata' | 'relations' | 'events' | 'yaml'
type EditMode = 'create' | 'edit'
type CreateMode = 'form' | 'yaml'
type ResourcePanel = 'cpu' | 'memory'
type ProbePanel = 'readiness' | 'liveness' | 'startup'
type MountPanel = VolumeMountEntry['type']
type DeploymentPanel = 'basic' | 'metadata'
type PodTemplatePanel = 'app' | 'init'
type AppContainerPanel = 'basic' | 'ports' | 'env' | 'resources' | 'probes' | 'mounts' | 'lifecycle'
type InitContainerPanel = 'basic' | 'command' | 'env' | 'resources' | 'mounts'
type PodSecurityPanel = 'identity' | 'pod' | 'container'
type SchedulePanel = 'node' | 'pod' | 'tolerations'
type LifecyclePanel = 'postStart' | 'preStop'
type StrategyPanel = 'strategy' | 'history'
type YamlTemplateId = 'web' | 'api' | 'worker' | 'db'
type RelatedCreateType = 'configmaps' | 'secrets' | 'persistent-volume-claims'
type CreateDialogSize = 'regular' | 'wide'
type YamlValidationStatus = 'ok' | 'warning' | 'error' | 'info'
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

interface YamlValidationItem {
  status: YamlValidationStatus
  text: string
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
const createMode = ref<CreateMode>('form')
const activeDeploymentPanel = ref<DeploymentPanel>('basic')
const activePodTemplatePanel = ref<PodTemplatePanel>('app')
const activeAppContainerId = ref('')
const activeAppContainerPanel = ref<AppContainerPanel>('basic')
const activeInitContainerId = ref('')
const activeInitContainerPanel = ref<InitContainerPanel>('basic')
const activeResourcePanel = ref<ResourcePanel>('cpu')
const activeProbePanel = ref<ProbePanel>('readiness')
const activeMountPanel = ref<MountPanel>('configMap')
const activePodSecurityPanel = ref<PodSecurityPanel>('identity')
const activeSchedulePanel = ref<SchedulePanel>('node')
const activeLifecyclePanel = ref<LifecyclePanel>('postStart')
const activeStrategyPanel = ref<StrategyPanel>('strategy')
const collapsedSections = reactive<Record<string, boolean>>({})
const yamlFontSize = ref(13)
const createDialogSize = ref<CreateDialogSize>('wide')
const activeYamlTemplate = ref<YamlTemplateId>('web')
const yamlTextareaRef = ref<HTMLTextAreaElement | null>(null)
const createForm = reactive<CreateFormState>(createDefaultForm('pods', 'Pod', 'default'))
const formErrors = ref<string[]>([])
const yamlParseError = ref('')
const syncingFromYaml = ref(false)
const showLegacyAppSections = false
const yamlDraft = ref('')
const logsText = ref('')
const secretPlaintext = ref<Record<string, string>>({})
const actionForm = reactive<WorkloadActionForm>({
  action: 'scale',
  replicas: 1,
  image: '',
  rollbackRevision: 'previous'
})
const relatedDialogOpen = ref(false)
const relatedMountType = ref<Exclude<MountPanel, 'emptyDir'>>('configMap')
const relatedMountTargetId = ref<string | null>(null)
const relatedCreateMode = ref<CreateMode>('form')
const relatedForm = reactive<CreateFormState>(createDefaultForm('configmaps', 'ConfigMap', 'default'))
const relatedFormState = reactive({
  name: '',
  namespace: 'default',
  yaml: ''
})
const relatedFormErrors = ref<string[]>([])
const relatedYamlParseError = ref('')

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
const createDefinition = computed(() => currentDefinition.value)
const currentCreateSchema = computed(() => createSchemas[createDefinition.value.type])
const visibleCreateSections = computed(() => (
  currentCreateSchema.value?.sections.filter((section) => createDefinition.value.type !== 'deployments' || section.title !== '基本信息') ?? []
))
const hasCreateSchema = computed(() => Boolean(currentCreateSchema.value))
const relatedResourceType = computed<RelatedCreateType>(() => relatedMountType.value === 'configMap' ? 'configmaps' : relatedMountType.value === 'secret' ? 'secrets' : 'persistent-volume-claims')
const relatedDefinition = computed(() => resourceDefinitions[relatedResourceType.value])
const relatedCreateSchema = computed(() => createSchemas[relatedDefinition.value.type])
const hasRelatedCreateSchema = computed(() => Boolean(relatedCreateSchema.value))
const activeAppContainer = computed(() => createForm.appContainers.find((item) => item.id === activeAppContainerId.value) ?? createForm.appContainers[0])
const activeInitContainer = computed(() => createForm.initContainers.find((item) => item.id === activeInitContainerId.value) ?? createForm.initContainers[0])
const createDialogWidth = computed(() => createDialogSize.value === 'wide' ? 'workspace' : 'full')
const createDialogSplitClass = computed(() => (
  createDialogSize.value === 'wide'
    ? 'xl:grid-cols-[minmax(0,1.08fr)_minmax(420px,0.92fr)]'
    : '2xl:grid-cols-[minmax(0,1fr)_minmax(360px,0.9fr)]'
))
const yamlValidationItems = computed<YamlValidationItem[]>(() => validateYamlContent(formState.yaml, createDefinition.value, formState.namespace || createForm.namespace))
const highlightedYaml = computed(() => highlightYaml(formState.yaml))
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
const podTemplatePanels: Array<{ id: PodTemplatePanel; label: string; help: string }> = [
  { id: 'app', label: '普通容器', help: 'Deployment Pod 中长期运行的业务容器，可配置多个容器，并分别维护基础、端口、环境变量、资源、探针、挂载和生命周期。' },
  { id: 'init', label: 'Init 容器', help: 'Pod 启动前顺序执行的初始化容器，支持命令、环境变量、资源和挂载；普通 init 容器不配置探针和生命周期钩子。' }
]
const appContainerPanels: Array<{ id: AppContainerPanel; label: string; help: string }> = [
  { id: 'basic', label: '基础', help: '配置普通容器名称、镜像和拉取策略。' },
  { id: 'ports', label: '端口', help: '写入当前普通容器 ports。' },
  { id: 'env', label: '环境变量', help: '写入当前普通容器 env。' },
  { id: 'resources', label: '资源', help: '按 CPU 与内存配置当前普通容器 requests / limits。' },
  { id: 'probes', label: '健康检查', help: '配置当前普通容器 readiness、liveness 和 startup probe。' },
  { id: 'mounts', label: '挂载', help: '配置当前普通容器 volumeMounts，并同步生成 Pod volumes。' },
  { id: 'lifecycle', label: '生命周期', help: '配置当前普通容器 PostStart / PreStop 钩子。' }
]
const deploymentPanels: Array<{ id: DeploymentPanel; label: string; help: string }> = [
  { id: 'basic', label: '基本信息', help: '配置 Deployment 名称、Namespace 和副本数。' },
  { id: 'metadata', label: '元数据信息', help: '默认标签 key 为 app，value 跟随名称；注解默认为空。' }
]
const podSecurityPanels: Array<{ id: PodSecurityPanel; label: string; help: string }> = [
  { id: 'identity', label: '身份', help: 'ServiceAccount 与 token 自动挂载属于 Pod spec。' },
  { id: 'pod', label: 'Pod SecurityContext', help: 'runAsUser、runAsGroup、fsGroup、runAsNonRoot 和 seccompProfile 作用于整个 Pod。' },
  { id: 'container', label: '容器 SecurityContext', help: '容器级 securityContext 会写入普通容器，可覆盖 Pod 级默认值。' }
]
const initContainerPanels: Array<{ id: InitContainerPanel; label: string; help: string }> = [
  { id: 'basic', label: '基础', help: '配置 Init 容器名称、镜像和拉取策略。' },
  { id: 'command', label: '命令', help: 'command 和 args 使用逗号分隔，会分别写入 Kubernetes command / args 数组。' },
  { id: 'env', label: '环境变量', help: '写入 Init 容器 env。' },
  { id: 'resources', label: '资源', help: '写入 Init 容器 resources.requests / limits。' },
  { id: 'mounts', label: '挂载', help: '选择 Pod 模板中的 ConfigMap、Secret 或 emptyDir，并挂载到 Init 容器。' }
]
const resourcePanels: Array<{ id: ResourcePanel; label: string; help: string }> = [
  { id: 'cpu', label: 'CPU', help: 'CPU requests / limits' },
  { id: 'memory', label: '内存', help: 'Memory requests / limits' }
]
const probePanels: Array<{ id: ProbePanel; label: string; help: string }> = [
  { id: 'readiness', label: 'Readiness', help: '控制服务是否接收流量' },
  { id: 'liveness', label: 'Liveness', help: '控制容器是否需要重启' },
  { id: 'startup', label: 'Startup', help: '控制慢启动容器启动期探测' }
]
const mountPanels: Array<{ id: MountPanel; label: string; help: string }> = [
  { id: 'configMap', label: 'ConfigMap', help: '挂载配置数据' },
  { id: 'secret', label: 'Secret', help: '挂载敏感配置' },
  { id: 'persistentVolumeClaim', label: 'PVC', help: '挂载 PersistentVolumeClaim 存储卷' },
  { id: 'emptyDir', label: 'emptyDir', help: 'Pod 临时目录' }
]
const schedulePanels: Array<{ id: SchedulePanel; label: string; help: string }> = [
  { id: 'node', label: '节点调度', help: '通过 nodeSelector 和节点亲和选择调度目标。' },
  { id: 'pod', label: 'Pod 调度', help: '通过 Pod 亲和和反亲和控制与其他 Pod 的拓扑关系。' },
  { id: 'tolerations', label: '容忍', help: '允许 Pod 调度到带有匹配污点的节点。' }
]
const lifecyclePanels: Array<{ id: LifecyclePanel; label: string; help: string }> = [
  { id: 'postStart', label: 'PostStart', help: '容器启动后立即触发的钩子。' },
  { id: 'preStop', label: 'PreStop', help: '容器停止前触发的钩子。' }
]
const strategyPanels: Array<{ id: StrategyPanel; label: string; help: string }> = [
  { id: 'strategy', label: '更新方式', help: '默认不写入 spec.strategy，使用 Kubernetes 默认 RollingUpdate。需要显式控制时再配置。' },
  { id: 'history', label: '历史与进度', help: '配置 minReadySeconds、revisionHistoryLimit、progressDeadlineSeconds 和 paused，默认不写入。' }
]
const yamlTemplates: Array<{ id: YamlTemplateId; label: string; description: string; patch: Partial<CreateFormState> }> = [
  {
    id: 'web',
    label: 'Web 服务',
    description: 'Nginx/HTTP 服务，模板只预填推荐端口、探针和资源值，名称与镜像可继续修改。',
    patch: {
      replicas: 2,
      containerName: 'web',
      image: 'nginx:1.27',
      cpuRequest: '100m',
      cpuLimit: '500m',
      memoryRequest: '128Mi',
      memoryLimit: '512Mi',
      readinessPath: '/healthz',
      livenessPath: '/healthz',
      ports: [{ id: 'http', name: 'http', port: 80, targetPort: 8080, protocol: 'TCP' }],
      env: [{ id: 'env-1', name: 'APP_ENV', value: 'production' }]
    }
  },
  {
    id: 'api',
    label: 'API 服务',
    description: '后端 API 服务，模板只预填副本、ServiceAccount、探针和资源建议，不锁定名称或镜像。',
    patch: {
      replicas: 3,
      containerName: 'api',
      image: 'registry.example.com/app/api:1.0.0',
      serviceAccountName: 'app-api',
      cpuRequest: '200m',
      cpuLimit: '1',
      memoryRequest: '256Mi',
      memoryLimit: '1Gi',
      readinessPath: '/readyz',
      livenessPath: '/livez',
      startupPath: '/startupz',
      ports: [{ id: 'http', name: 'http', port: 80, targetPort: 8080, protocol: 'TCP' }],
      env: [{ id: 'env-1', name: 'APP_ENV', value: 'production' }]
    }
  },
  {
    id: 'worker',
    label: '后台任务',
    description: '后台消费任务样例，只预填副本、镜像建议和队列变量，选择后仍可调整。',
    patch: {
      replicas: 1,
      containerName: 'worker',
      image: 'registry.example.com/app/worker:1.0.0',
      cpuRequest: '100m',
      cpuLimit: '800m',
      memoryRequest: '256Mi',
      memoryLimit: '768Mi',
      readinessPath: '',
      livenessPath: '',
      startupPath: '',
      ports: [],
      env: [{ id: 'env-1', name: 'QUEUE_NAME', value: 'default' }]
    }
  },
  {
    id: 'db',
    label: '轻量 DB',
    description: '开发/测试态单副本数据库样例，只预填便于修改的起始值；生产有状态服务建议使用 StatefulSet。',
    patch: {
      replicas: 1,
      containerName: 'db',
      image: 'postgres:16',
      cpuRequest: '250m',
      cpuLimit: '1',
      memoryRequest: '512Mi',
      memoryLimit: '2Gi',
      readinessPath: '',
      livenessPath: '',
      startupPath: '',
      ports: [{ id: 'postgres', name: 'postgres', port: 5432, targetPort: 5432, protocol: 'TCP' }],
      env: [{ id: 'env-1', name: 'POSTGRES_DB', value: 'app' }]
    }
  }
]
const configSourceOptions = reactive<Record<Exclude<MountPanel, 'emptyDir'>, Array<{ label: string; value: string }>>>({
  configMap: [
    { label: 'app-config', value: 'app-config' },
    { label: 'nginx-conf', value: 'nginx-conf' },
    { label: 'feature-flags', value: 'feature-flags' }
  ],
  secret: [
    { label: 'app-secret', value: 'app-secret' },
    { label: 'db-password', value: 'db-password' },
    { label: 'registry-credential', value: 'registry-credential' }
  ],
  persistentVolumeClaim: [
    { label: 'app-data', value: 'app-data' },
    { label: 'logs-pvc', value: 'logs-pvc' },
    { label: 'cache-pvc', value: 'cache-pvc' }
  ]
})
const resourceFieldGroups: Record<ResourcePanel, Array<{ key: keyof CreateFormState; label: string; placeholder: string; help: string }>> = {
  cpu: [
    { key: 'cpuRequest', label: 'CPU Request', placeholder: '100m', help: '调度时预留的 CPU。' },
    { key: 'cpuLimit', label: 'CPU Limit', placeholder: '500m', help: '容器可使用的 CPU 上限。' }
  ],
  memory: [
    { key: 'memoryRequest', label: 'Memory Request', placeholder: '128Mi', help: '调度时预留的内存。' },
    { key: 'memoryLimit', label: 'Memory Limit', placeholder: '512Mi', help: '容器可使用的内存上限。' }
  ]
}
const probeFieldGroups: Record<ProbePanel, Array<{ key: keyof CreateFormState; label: string; type: 'text' | 'number'; placeholder?: string; min?: number; help: string }>> = {
  readiness: [
    { key: 'readinessPath', label: 'HTTP 路径', type: 'text', placeholder: '/readyz', help: '为空时不生成 readinessProbe。' },
    { key: 'readinessPort', label: '端口', type: 'number', min: 1, help: '通常与容器端口一致。' },
    { key: 'readinessInitialDelaySeconds', label: '启动延迟', type: 'number', min: 0, help: '容器启动后等待多少秒开始探测。' },
    { key: 'readinessPeriodSeconds', label: '探测周期', type: 'number', min: 1, help: '两次探测之间的间隔秒数。' },
    { key: 'readinessTimeoutSeconds', label: '超时时间', type: 'number', min: 1, help: '单次探测超时秒数。' },
    { key: 'readinessFailureThreshold', label: '失败阈值', type: 'number', min: 1, help: '连续失败多少次后标记为未就绪。' },
    { key: 'readinessSuccessThreshold', label: '成功阈值', type: 'number', min: 1, help: '连续成功多少次后恢复就绪。' }
  ],
  liveness: [
    { key: 'livenessPath', label: 'HTTP 路径', type: 'text', placeholder: '/healthz', help: '为空时不生成 livenessProbe。' },
    { key: 'livenessPort', label: '端口', type: 'number', min: 1, help: '通常与容器端口一致。' },
    { key: 'livenessInitialDelaySeconds', label: '启动延迟', type: 'number', min: 0, help: '容器启动后等待多少秒开始探测。' },
    { key: 'livenessPeriodSeconds', label: '探测周期', type: 'number', min: 1, help: '两次探测之间的间隔秒数。' },
    { key: 'livenessTimeoutSeconds', label: '超时时间', type: 'number', min: 1, help: '单次探测超时秒数。' },
    { key: 'livenessFailureThreshold', label: '失败阈值', type: 'number', min: 1, help: '连续失败多少次后重启容器。' },
    { key: 'livenessSuccessThreshold', label: '成功阈值', type: 'number', min: 1, help: '连续成功多少次后恢复健康。' }
  ],
  startup: [
    { key: 'startupPath', label: 'HTTP 路径', type: 'text', placeholder: '/startupz', help: '为空时不生成 startupProbe。' },
    { key: 'startupPort', label: '端口', type: 'number', min: 1, help: '通常与容器端口一致。' },
    { key: 'startupInitialDelaySeconds', label: '启动延迟', type: 'number', min: 0, help: '容器启动后等待多少秒开始探测。' },
    { key: 'startupPeriodSeconds', label: '探测周期', type: 'number', min: 1, help: '两次探测之间的间隔秒数。' },
    { key: 'startupTimeoutSeconds', label: '超时时间', type: 'number', min: 1, help: '单次探测超时秒数。' },
    { key: 'startupFailureThreshold', label: '失败阈值', type: 'number', min: 1, help: '慢启动容器允许失败的次数。' },
    { key: 'startupSuccessThreshold', label: '成功阈值', type: 'number', min: 1, help: '连续成功多少次后结束启动探测。' }
  ]
}

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

function inputValue(event: Event) {
  return (event.target as HTMLInputElement | HTMLTextAreaElement).value
}

function nextEntryId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

function scalarValue(key: keyof CreateFormState) {
  const value = createForm[key]
  return Array.isArray(value) ? '' : String(value ?? '')
}

function numberValue(key: keyof CreateFormState) {
  const value = createForm[key]
  return typeof value === 'number' ? value : Number(value) || 0
}

function fieldOptions(field: CreateField): Array<Record<string, string>> {
  return (field.options ?? []).map((option: CreateFieldOption) => ({ label: option.label, value: option.value }))
}

function markFormSource() {
  if (editMode.value === 'create' && hasCreateSchema.value && createMode.value !== 'form') {
    createMode.value = 'form'
    formErrors.value = []
  }
}

function updateScalarField(key: keyof CreateFormState, value: string | number | boolean | null) {
  markFormSource()
  const target = createForm as unknown as Record<keyof CreateFormState, unknown>
  target[key] = key === 'replicas' ? Number(value) || 0 : String(value ?? '')
}

function updateTextField(key: keyof CreateFormState, event: Event) {
  const previousName = key === 'name' ? createForm.name : ''
  updateScalarField(key, inputValue(event))
  if (key === 'name' && createDefinition.value.type === 'deployments') {
    const appLabel = createForm.labels.find((pair) => pair.key === 'app')
    if (!appLabel) {
      createForm.labels.unshift({ id: nextEntryId('pair'), key: 'app', value: createForm.name })
    } else if (!appLabel.value || appLabel.value === previousName) {
      appLabel.value = createForm.name
    }
  }
}

function updateNumberField(key: keyof CreateFormState, event: Event) {
  updateScalarField(key, Number(inputValue(event)) || 0)
}

function updateNullableNumberFormField(key: keyof CreateFormState, event: Event) {
  markFormSource()
  const value = inputValue(event).trim()
  const target = createForm as unknown as Record<keyof CreateFormState, unknown>
  target[key] = value === '' ? null : Number(value)
}

function pairList(key: keyof CreateFormState) {
  const value = createForm[key]
  return Array.isArray(value) ? (value as KeyValuePair[]) : []
}

function addPair(key: keyof CreateFormState) {
  markFormSource()
  const value = createForm[key]
  if (Array.isArray(value)) {
    ;(value as KeyValuePair[]).push({ id: nextEntryId('pair'), key: '', value: '' })
  }
}

function removePair(key: keyof CreateFormState, id: string) {
  markFormSource()
  const value = createForm[key]
  if (!Array.isArray(value)) return
  const list = value as KeyValuePair[]
  if (list.length <= 1 && ['configData', 'secretData'].includes(String(key))) return
  const index = list.findIndex((item) => item.id === id)
  if (index >= 0) list.splice(index, 1)
}

function addPort() {
  markFormSource()
  createForm.ports.push({ id: nextEntryId('port'), name: 'http', port: 80, targetPort: 8080, protocol: 'TCP' })
}

function removePort(id: string) {
  markFormSource()
  if (createForm.ports.length <= 1) return
  const index = createForm.ports.findIndex((item) => item.id === id)
  if (index >= 0) createForm.ports.splice(index, 1)
}

function addEnv() {
  markFormSource()
  createForm.env.push({ id: nextEntryId('env'), name: '', value: '' })
}

function removeEnv(id: string) {
  markFormSource()
  const index = createForm.env.findIndex((item) => item.id === id)
  if (index >= 0) createForm.env.splice(index, 1)
}

function createAppContainerEntry(name = `app-${createForm.appContainers.length + 1}`): AppContainerEntry {
  return {
    id: nextEntryId('app-container'),
    name,
    image: 'nginx:1.27',
    imagePullPolicy: 'IfNotPresent',
    ports: [{ id: nextEntryId('app-port'), name: 'http', port: 80, targetPort: 8080, protocol: 'TCP' }],
    env: [],
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
    volumeMounts: [],
    lifecycleHooks: []
  }
}

function seedAppContainersFromLegacyFields() {
  if (createForm.appContainers.length) return
  createForm.appContainers.push({
    ...createAppContainerEntry(createForm.containerName || createForm.name || 'app'),
    id: nextEntryId('app-container'),
    image: createForm.image,
    imagePullPolicy: createForm.imagePullPolicy,
    ports: createForm.ports,
    env: createForm.env,
    cpuRequest: createForm.cpuRequest,
    memoryRequest: createForm.memoryRequest,
    cpuLimit: createForm.cpuLimit,
    memoryLimit: createForm.memoryLimit,
    readinessPath: createForm.readinessPath,
    readinessPort: createForm.readinessPort,
    readinessInitialDelaySeconds: createForm.readinessInitialDelaySeconds,
    readinessPeriodSeconds: createForm.readinessPeriodSeconds,
    readinessTimeoutSeconds: createForm.readinessTimeoutSeconds,
    readinessFailureThreshold: createForm.readinessFailureThreshold,
    readinessSuccessThreshold: createForm.readinessSuccessThreshold,
    livenessPath: createForm.livenessPath,
    livenessPort: createForm.livenessPort,
    livenessInitialDelaySeconds: createForm.livenessInitialDelaySeconds,
    livenessPeriodSeconds: createForm.livenessPeriodSeconds,
    livenessTimeoutSeconds: createForm.livenessTimeoutSeconds,
    livenessFailureThreshold: createForm.livenessFailureThreshold,
    livenessSuccessThreshold: createForm.livenessSuccessThreshold,
    startupPath: createForm.startupPath,
    startupPort: createForm.startupPort,
    startupInitialDelaySeconds: createForm.startupInitialDelaySeconds,
    startupPeriodSeconds: createForm.startupPeriodSeconds,
    startupTimeoutSeconds: createForm.startupTimeoutSeconds,
    startupFailureThreshold: createForm.startupFailureThreshold,
    startupSuccessThreshold: createForm.startupSuccessThreshold,
    volumeMounts: createForm.volumeMounts,
    lifecycleHooks: createForm.lifecycleHooks
  })
}

function syncLegacyFieldsFromActiveAppContainer() {
  const container = activeAppContainer.value
  if (!container) return
  createForm.containerName = container.name
  createForm.image = container.image
  createForm.imagePullPolicy = container.imagePullPolicy
  createForm.ports = container.ports
  createForm.env = container.env
  createForm.cpuRequest = container.cpuRequest
  createForm.memoryRequest = container.memoryRequest
  createForm.cpuLimit = container.cpuLimit
  createForm.memoryLimit = container.memoryLimit
  createForm.readinessPath = container.readinessPath
  createForm.readinessPort = container.readinessPort
  createForm.readinessInitialDelaySeconds = container.readinessInitialDelaySeconds
  createForm.readinessPeriodSeconds = container.readinessPeriodSeconds
  createForm.readinessTimeoutSeconds = container.readinessTimeoutSeconds
  createForm.readinessFailureThreshold = container.readinessFailureThreshold
  createForm.readinessSuccessThreshold = container.readinessSuccessThreshold
  createForm.livenessPath = container.livenessPath
  createForm.livenessPort = container.livenessPort
  createForm.livenessInitialDelaySeconds = container.livenessInitialDelaySeconds
  createForm.livenessPeriodSeconds = container.livenessPeriodSeconds
  createForm.livenessTimeoutSeconds = container.livenessTimeoutSeconds
  createForm.livenessFailureThreshold = container.livenessFailureThreshold
  createForm.livenessSuccessThreshold = container.livenessSuccessThreshold
  createForm.startupPath = container.startupPath
  createForm.startupPort = container.startupPort
  createForm.startupInitialDelaySeconds = container.startupInitialDelaySeconds
  createForm.startupPeriodSeconds = container.startupPeriodSeconds
  createForm.startupTimeoutSeconds = container.startupTimeoutSeconds
  createForm.startupFailureThreshold = container.startupFailureThreshold
  createForm.startupSuccessThreshold = container.startupSuccessThreshold
  createForm.volumeMounts = container.volumeMounts
  createForm.lifecycleHooks = container.lifecycleHooks
}

function syncActiveAppContainer() {
  seedAppContainersFromLegacyFields()
  if (!createForm.appContainers.some((container) => container.id === activeAppContainerId.value)) {
    activeAppContainerId.value = createForm.appContainers[0]?.id ?? ''
  }
  syncLegacyFieldsFromActiveAppContainer()
}

function addAppContainer() {
  markFormSource()
  const container = createAppContainerEntry(`app-${createForm.appContainers.length + 1}`)
  createForm.appContainers.push(container)
  activeAppContainerId.value = container.id
  activePodTemplatePanel.value = 'app'
  activeAppContainerPanel.value = 'basic'
  syncLegacyFieldsFromActiveAppContainer()
}

function removeAppContainer(id: string) {
  markFormSource()
  if (createForm.appContainers.length <= 1) return
  const index = createForm.appContainers.findIndex((item) => item.id === id)
  if (index >= 0) createForm.appContainers.splice(index, 1)
  if (activeAppContainerId.value === id) {
    activeAppContainerId.value = createForm.appContainers[0]?.id ?? ''
  }
  syncLegacyFieldsFromActiveAppContainer()
}

function appScalarValue(container: AppContainerEntry, key: keyof AppContainerEntry) {
  const value = container[key]
  return Array.isArray(value) ? '' : String(value ?? '')
}

function updateAppScalarField(container: AppContainerEntry, key: keyof AppContainerEntry, value: string | number | boolean | null) {
  markFormSource()
  const target = container as unknown as Record<keyof AppContainerEntry, unknown>
  const numberKeys = new Set<keyof AppContainerEntry>([
    'readinessPort',
    'readinessInitialDelaySeconds',
    'readinessPeriodSeconds',
    'readinessTimeoutSeconds',
    'readinessFailureThreshold',
    'readinessSuccessThreshold',
    'livenessPort',
    'livenessInitialDelaySeconds',
    'livenessPeriodSeconds',
    'livenessTimeoutSeconds',
    'livenessFailureThreshold',
    'livenessSuccessThreshold',
    'startupPort',
    'startupInitialDelaySeconds',
    'startupPeriodSeconds',
    'startupTimeoutSeconds',
    'startupFailureThreshold',
    'startupSuccessThreshold'
  ])
  target[key] = numberKeys.has(key) ? Number(value) || 0 : String(value ?? '')
  syncLegacyFieldsFromActiveAppContainer()
}

function updateAppTextField(container: AppContainerEntry, key: keyof AppContainerEntry, event: Event) {
  updateAppScalarField(container, key, inputValue(event))
}

function updateAppNumberField(container: AppContainerEntry, key: keyof AppContainerEntry, event: Event) {
  updateAppScalarField(container, key, Number(inputValue(event)) || 0)
}

function updateNullableNumberField(key: keyof CreateFormState, event: Event) {
  markFormSource()
  const value = inputValue(event)
  const target = createForm as unknown as Record<keyof CreateFormState, unknown>
  target[key] = value === '' ? null : Number(value) || 0
}

function addAppPort(container: AppContainerEntry) {
  markFormSource()
  container.ports.push({ id: nextEntryId('app-port'), name: 'http', port: 80, targetPort: 8080, protocol: 'TCP' })
  syncLegacyFieldsFromActiveAppContainer()
}

function removeAppPort(container: AppContainerEntry, id: string) {
  markFormSource()
  if (container.ports.length <= 1) return
  const index = container.ports.findIndex((item) => item.id === id)
  if (index >= 0) container.ports.splice(index, 1)
  syncLegacyFieldsFromActiveAppContainer()
}

function addAppEnv(container: AppContainerEntry) {
  markFormSource()
  container.env.push({ id: nextEntryId('app-env'), name: '', value: '' })
  syncLegacyFieldsFromActiveAppContainer()
}

function removeAppEnv(container: AppContainerEntry, id: string) {
  markFormSource()
  const index = container.env.findIndex((item) => item.id === id)
  if (index >= 0) container.env.splice(index, 1)
  syncLegacyFieldsFromActiveAppContainer()
}

function addInitContainer() {
  markFormSource()
  const id = nextEntryId('init')
  createForm.initContainers.push({
    id,
    name: `init-${createForm.initContainers.length + 1}`,
    image: 'busybox:1.36',
    imagePullPolicy: 'IfNotPresent',
    command: '/bin/sh, -c',
    args: 'echo init',
    cpuRequest: '',
    memoryRequest: '',
    cpuLimit: '',
    memoryLimit: '',
    env: [],
    volumeMounts: []
  })
  activeInitContainerId.value = id
  activePodTemplatePanel.value = 'init'
  activeInitContainerPanel.value = 'basic'
}

function removeInitContainer(id: string) {
  markFormSource()
  const index = createForm.initContainers.findIndex((item) => item.id === id)
  if (index >= 0) createForm.initContainers.splice(index, 1)
  if (activeInitContainerId.value === id) {
    activeInitContainerId.value = createForm.initContainers[0]?.id ?? ''
  }
}

function initScalarValue(container: InitContainerEntry, key: keyof InitContainerEntry) {
  const value = container[key]
  return Array.isArray(value) ? '' : String(value ?? '')
}

function updateInitScalarField(container: InitContainerEntry, key: keyof InitContainerEntry, value: string | number | boolean | null) {
  markFormSource()
  const target = container as unknown as Record<keyof InitContainerEntry, unknown>
  target[key] = String(value ?? '')
}

function updateInitTextField(container: InitContainerEntry, key: keyof InitContainerEntry, event: Event) {
  updateInitScalarField(container, key, inputValue(event))
}

function addInitEnv(container: InitContainerEntry) {
  markFormSource()
  container.env.push({ id: nextEntryId('init-env'), name: '', value: '' })
}

function removeInitEnv(container: InitContainerEntry, id: string) {
  markFormSource()
  const index = container.env.findIndex((item) => item.id === id)
  if (index >= 0) container.env.splice(index, 1)
}

function resizeYamlTextarea() {
  const textarea = yamlTextareaRef.value
  if (!textarea) return
  textarea.style.height = 'auto'
  textarea.style.height = `${Math.max(420, textarea.scrollHeight + 8)}px`
}

function scheduleYamlResize() {
  void nextTick(resizeYamlTextarea)
}

function segmentButtonClass(active: boolean) {
  return active
    ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/25'
    : 'text-gray-600 hover:bg-white hover:text-gray-900 dark:text-dark-300 dark:hover:bg-dark-800 dark:hover:text-white'
}

function validationStatusClass(status: YamlValidationStatus) {
  const classes: Record<YamlValidationStatus, string> = {
    ok: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300',
    warning: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300',
    error: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300',
    info: 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300'
  }
  return classes[status]
}

function setCreateDialogSize(size: CreateDialogSize) {
  createDialogSize.value = size
  scheduleYamlResize()
}

function sectionKey(title: string) {
  return title.replace(/\s+/g, '-')
}

function isSectionCollapsed(key: string) {
  return Boolean(collapsedSections[key])
}

function toggleSection(key: string) {
  collapsedSections[key] = !collapsedSections[key]
  scheduleYamlResize()
}

function setPodTemplatePanel(panel: PodTemplatePanel) {
  activePodTemplatePanel.value = panel
  if (panel === 'app') syncActiveAppContainer()
}

function setAppContainerPanel(panel: AppContainerPanel) {
  activeAppContainerPanel.value = panel
}

function setInitContainerPanel(panel: InitContainerPanel) {
  activeInitContainerPanel.value = panel
}

function setResourcePanel(panel: ResourcePanel) {
  activeResourcePanel.value = panel
}

function setProbePanel(panel: ProbePanel) {
  activeProbePanel.value = panel
}

function setMountPanel(panel: MountPanel) {
  activeMountPanel.value = panel
}

function setPodSecurityPanel(panel: PodSecurityPanel) {
  activePodSecurityPanel.value = panel
}

function setSchedulePanel(panel: SchedulePanel) {
  activeSchedulePanel.value = panel
}

function setLifecyclePanel(panel: LifecyclePanel) {
  activeLifecyclePanel.value = panel
}

function setStrategyPanel(panel: StrategyPanel) {
  activeStrategyPanel.value = panel
}

function setYamlFontSize(size: number | string | boolean | null) {
  yamlFontSize.value = Number(size) || 13
  scheduleYamlResize()
}

function resetCollapsedSections() {
  for (const key of Object.keys(collapsedSections)) delete collapsedSections[key]
  if (createDefinition.value.type === 'deployments') {
    ;['deployment', 'pod-template', 'pod-security', 'pod-storage', 'deployment-strategy', 'scheduling', 'yaml-template'].forEach((key) => {
      collapsedSections[key] = true
    })
    currentCreateSchema.value?.sections.forEach((section) => {
      collapsedSections[sectionKey(section.title)] = true
    })
  }
}

function closeEditDialog() {
  editDialogOpen.value = false
  closeRelatedDialog()
}

function defaultNamespaceFor(definition: ResourceDefinition) {
  return definition.namespaced ? (filters.namespace === 'all-namespaces' ? 'default' : filters.namespace) : ''
}

function mountListByType(type: MountPanel) {
  return (activeAppContainer.value?.volumeMounts ?? createForm.volumeMounts).filter((item) => item.type === type)
}

function initMountListByType(container: InitContainerEntry, type: MountPanel) {
  return container.volumeMounts.filter((item) => item.type === type)
}

function addVolumeMount(type: MountPanel = activeMountPanel.value) {
  markFormSource()
  const targetMounts = activeAppContainer.value?.volumeMounts ?? createForm.volumeMounts
  targetMounts.push({
    id: nextEntryId('mount'),
    type,
    name: '',
    sourceName: '',
    mountPath: '',
    subPath: '',
    readOnly: type === 'configMap' || type === 'secret'
  })
  syncLegacyFieldsFromActiveAppContainer()
}

function addInitVolumeMount(container: InitContainerEntry, type: MountPanel = activeMountPanel.value) {
  markFormSource()
  container.volumeMounts.push({
    id: nextEntryId('init-mount'),
    type,
    name: '',
    sourceName: '',
    mountPath: '',
    subPath: '',
    readOnly: type === 'configMap' || type === 'secret'
  })
}

function removeVolumeMount(id: string) {
  markFormSource()
  const targetMounts = activeAppContainer.value?.volumeMounts ?? createForm.volumeMounts
  const index = targetMounts.findIndex((item) => item.id === id)
  if (index >= 0) targetMounts.splice(index, 1)
  syncLegacyFieldsFromActiveAppContainer()
}

function removeInitVolumeMount(container: InitContainerEntry, id: string) {
  markFormSource()
  const index = container.volumeMounts.findIndex((item) => item.id === id)
  if (index >= 0) container.volumeMounts.splice(index, 1)
}

function sourceOptions(type: MountPanel) {
  return type === 'emptyDir' ? [] : configSourceOptions[type]
}

function mountSourceLabel(type: MountPanel) {
  if (type === 'configMap') return 'ConfigMap 名称'
  if (type === 'secret') return 'Secret 名称'
  if (type === 'persistentVolumeClaim') return 'PVC 名称'
  return '资源名称'
}

function mountCreateLabel(type: MountPanel) {
  if (type === 'configMap') return 'ConfigMap'
  if (type === 'secret') return 'Secret'
  if (type === 'persistentVolumeClaim') return 'PVC'
  return '资源'
}

function mountDefaultPath(type: MountPanel) {
  if (type === 'configMap') return '/etc/config'
  if (type === 'secret') return '/etc/secret'
  if (type === 'persistentVolumeClaim') return '/data'
  return '/tmp/cache'
}

function ensureConfigSourceOption(type: Exclude<MountPanel, 'emptyDir'>, name: string) {
  const trimmedName = name.trim()
  if (!trimmedName) return
  const options = configSourceOptions[type]
  if (!options.some((option) => option.value === trimmedName)) {
    options.unshift({ label: trimmedName, value: trimmedName })
  }
}

function onMountSourceSelect(mount: VolumeMountEntry, value: string | number | boolean | null) {
  markFormSource()
  const sourceName = String(value ?? '')
  mount.sourceName = sourceName
  if (!mount.name.trim()) mount.name = sourceName
  syncLegacyFieldsFromActiveAppContainer()
}

function syncRelatedYamlFromForm() {
  const schema = relatedCreateSchema.value
  const definition = relatedDefinition.value
  if (!schema) return
  relatedFormState.name = relatedForm.name
  relatedFormState.namespace = definition.namespaced ? relatedForm.namespace : ''
  relatedFormState.yaml = stringifyKubeObject(schema.toObject(relatedForm))
  relatedYamlParseError.value = ''
}

function applyRelatedYamlToForm(object: Record<string, unknown>) {
  const definition = relatedDefinition.value
  const namespace = definition.namespaced ? (relatedFormState.namespace || relatedForm.namespace || 'default') : ''
  Object.assign(relatedForm, createDefaultForm(definition.type, definition.kind, namespace))
  applyObjectToForm(relatedForm, object, definition.type)
  relatedFormState.name = relatedForm.name
  relatedFormState.namespace = definition.namespaced ? relatedForm.namespace : ''
}

function syncRelatedFormFromYaml() {
  const parsed = parseKubeYaml(relatedFormState.yaml)
  if (!parsed.ok || !parsed.value) {
    relatedYamlParseError.value = parsed.error ?? 'YAML 解析失败。'
    return null
  }
  relatedYamlParseError.value = ''
  if (hasRelatedCreateSchema.value) {
    applyRelatedYamlToForm(parsed.value)
  }
  return parsed.value
}

function openRelatedConfigResource(type: Exclude<MountPanel, 'emptyDir'>, targetMountId?: string) {
  const targetType: RelatedCreateType = type === 'configMap' ? 'configmaps' : type === 'secret' ? 'secrets' : 'persistent-volume-claims'
  const definition = resourceDefinitions[targetType]
  relatedMountType.value = type
  relatedMountTargetId.value = targetMountId ?? null
  relatedFormErrors.value = []
  relatedYamlParseError.value = ''
  const namespace = defaultNamespaceFor(definition)
  const nextForm = createDefaultForm(definition.type, definition.kind, namespace)
  const baseName = createForm.name.trim() || 'app'
  nextForm.name = type === 'configMap' ? `${baseName}-config` : type === 'secret' ? `${baseName}-secret` : `${baseName}-data`
  Object.assign(relatedForm, nextForm)
  relatedFormState.name = nextForm.name
  relatedFormState.namespace = namespace
  relatedCreateMode.value = createSchemas[definition.type] ? 'form' : 'yaml'
  if (createSchemas[definition.type]) {
    relatedFormState.yaml = stringifyKubeObject(createSchemas[definition.type].toObject(relatedForm))
    relatedYamlParseError.value = ''
  } else {
    relatedFormState.yaml = sampleYaml(definition.kind, nextForm.name, relatedFormState.namespace)
  }
  relatedDialogOpen.value = true
}

function closeRelatedDialog() {
  relatedDialogOpen.value = false
  relatedMountTargetId.value = null
  relatedFormErrors.value = []
  relatedYamlParseError.value = ''
}

function setRelatedCreateMode(mode: CreateMode) {
  relatedCreateMode.value = mode
  relatedFormErrors.value = []
  if (mode === 'form') {
    syncRelatedYamlFromForm()
  } else {
    syncRelatedFormFromYaml()
  }
}

function relatedPairList(key: keyof CreateFormState) {
  const value = relatedForm[key]
  return Array.isArray(value) ? (value as KeyValuePair[]) : []
}

function addRelatedPair(key: keyof CreateFormState) {
  const value = relatedForm[key]
  if (Array.isArray(value)) {
    ;(value as KeyValuePair[]).push({ id: nextEntryId('related-pair'), key: '', value: '' })
  }
}

function removeRelatedPair(key: keyof CreateFormState, id: string) {
  const value = relatedForm[key]
  if (!Array.isArray(value)) return
  const list = value as KeyValuePair[]
  if (list.length <= 1 && ['configData', 'secretData'].includes(String(key))) return
  const index = list.findIndex((item) => item.id === id)
  if (index >= 0) list.splice(index, 1)
}

function relatedScalarValue(key: keyof CreateFormState) {
  const value = relatedForm[key]
  return Array.isArray(value) ? '' : String(value ?? '')
}

function updateRelatedScalarField(key: keyof CreateFormState, value: string | number | boolean | null) {
  const target = relatedForm as unknown as Record<keyof CreateFormState, unknown>
  target[key] = key === 'replicas' ? Number(value) || 0 : String(value ?? '')
  if (relatedCreateMode.value !== 'form') relatedCreateMode.value = 'form'
}

function updateRelatedTextField(key: keyof CreateFormState, event: Event) {
  updateRelatedScalarField(key, inputValue(event))
}

function onRelatedYamlInput(event: Event) {
  relatedCreateMode.value = 'yaml'
  relatedFormState.yaml = inputValue(event)
  relatedFormErrors.value = []
  syncRelatedFormFromYaml()
}

function fillCreatedRelatedResource(name: string) {
  const mountType = relatedMountType.value
  ensureConfigSourceOption(mountType, name)
  const targetMounts = activeAppContainer.value?.volumeMounts ?? createForm.volumeMounts
  let mount = relatedMountTargetId.value
    ? targetMounts.find((item) => item.id === relatedMountTargetId.value)
    : undefined
  if (!mount) {
    mount = {
      id: nextEntryId('mount'),
      type: mountType,
      name,
      sourceName: name,
      mountPath: mountDefaultPath(mountType),
      subPath: '',
      readOnly: mountType === 'configMap' || mountType === 'secret'
    }
    targetMounts.push(mount)
    activeMountPanel.value = mountType
  }
  mount.type = mountType
  mount.sourceName = name
  if (!mount.name.trim()) mount.name = name
  if (!mount.mountPath.trim()) mount.mountPath = mountDefaultPath(mountType)
  mount.readOnly = mountType === 'configMap' || mountType === 'secret' ? true : mount.readOnly
  markFormSource()
  syncLegacyFieldsFromActiveAppContainer()
}

function initContainerVolumeOptions(container: InitContainerEntry, type: Exclude<MountPanel, 'emptyDir'>) {
  const podMounts = createForm.appContainers
    .flatMap((appContainer) => appContainer.volumeMounts)
    .filter((mount) => mount.type === type && mount.sourceName.trim())
    .map((mount) => ({ label: `${mount.sourceName}（Pod 挂载）`, value: mount.sourceName }))
  const localMounts = container.volumeMounts
    .filter((mount) => mount.type === type && mount.sourceName.trim())
    .map((mount) => ({ label: `${mount.sourceName}（Init 当前）`, value: mount.sourceName }))
  const seen = new Set<string>()
  return [...podMounts, ...localMounts, ...configSourceOptions[type]].filter((option) => {
    if (seen.has(option.value)) return false
    seen.add(option.value)
    return true
  })
}

async function submitRelatedForm() {
  relatedFormErrors.value = []
  const definition = relatedDefinition.value
  let yaml = relatedFormState.yaml
  let name = relatedFormState.name
  let namespace = relatedFormState.namespace

  if (hasRelatedCreateSchema.value && relatedCreateMode.value === 'form') {
    const errors = validateCreateForm(relatedForm, definition.type)
    if (errors.length) {
      relatedFormErrors.value = errors
      return
    }
    syncRelatedYamlFromForm()
    yaml = relatedFormState.yaml
    name = relatedForm.name
    namespace = definition.namespaced ? relatedForm.namespace : ''
  } else {
    const object = syncRelatedFormFromYaml()
    if (!object) {
      relatedFormErrors.value = [relatedYamlParseError.value || 'YAML 解析失败。']
      return
    }
    const errors = validateYamlObject(object, definition, relatedFormState.namespace || relatedForm.namespace)
    if (errors.length) {
      relatedFormErrors.value = errors
      return
    }
    name = relatedForm.name || name
    namespace = definition.namespaced ? (relatedForm.namespace || namespace) : ''
  }

  await callApi(
    ['createKubeResource', 'createResource'],
    [{ clusterId: filters.clusterId, resourceType: definition.type, namespace: namespace || undefined, name, yaml }],
    { ok: true }
  )
  fillCreatedRelatedResource(name)
  syncYamlFromForm()
  closeRelatedDialog()
  successMessage.value = `已创建 ${definition.title}/${name}，并回填到当前挂载配置`
}

function addNodeAffinity() {
  markFormSource()
  createForm.nodeAffinity.push({ id: nextEntryId('node-affinity'), key: '', operator: 'In', values: '' })
}

function removeNodeAffinity(id: string) {
  markFormSource()
  const index = createForm.nodeAffinity.findIndex((item) => item.id === id)
  if (index >= 0) createForm.nodeAffinity.splice(index, 1)
}

function affinityList(panel: 'podAffinity' | 'podAntiAffinity') {
  return createForm[panel]
}

function addPodAffinity(panel: 'podAffinity' | 'podAntiAffinity') {
  markFormSource()
  createForm[panel].push({
    id: nextEntryId(panel),
    topologyKey: 'kubernetes.io/hostname',
    labelKey: 'app',
    operator: 'In',
    values: ''
  })
}

function removePodAffinity(panel: 'podAffinity' | 'podAntiAffinity', id: string) {
  markFormSource()
  const list = createForm[panel]
  const index = list.findIndex((item) => item.id === id)
  if (index >= 0) list.splice(index, 1)
}

function addToleration() {
  markFormSource()
  createForm.tolerations.push({ id: nextEntryId('toleration'), key: '', operator: 'Equal', value: '', effect: '', tolerationSeconds: null })
}

function removeToleration(id: string) {
  markFormSource()
  const index = createForm.tolerations.findIndex((item) => item.id === id)
  if (index >= 0) createForm.tolerations.splice(index, 1)
}

function lifecycleList(type: LifecyclePanel, container: AppContainerEntry | null | undefined = activeAppContainer.value) {
  return (container?.lifecycleHooks ?? createForm.lifecycleHooks).filter((item) => item.type === type)
}

function addLifecycleHook(type: LifecyclePanel = activeLifecyclePanel.value, container: AppContainerEntry | null | undefined = activeAppContainer.value) {
  markFormSource()
  const hooks = container?.lifecycleHooks ?? createForm.lifecycleHooks
  if (hooks.some((item) => item.type === type)) return
  hooks.push({
    id: nextEntryId('lifecycle'),
    type,
    handlerType: 'exec',
    command: type === 'postStart' ? '/bin/sh, -c, echo started' : '/bin/sh, -c, sleep 5',
    path: '',
    port: 8080
  })
  syncLegacyFieldsFromActiveAppContainer()
}

function ensureLifecycleHook(type: LifecyclePanel) {
  addLifecycleHook(type)
}

function removeLifecycleHook(id: string, container: AppContainerEntry | null | undefined = activeAppContainer.value) {
  markFormSource()
  const hooks = container?.lifecycleHooks ?? createForm.lifecycleHooks
  const index = hooks.findIndex((item) => item.id === id)
  if (index >= 0) hooks.splice(index, 1)
  syncLegacyFieldsFromActiveAppContainer()
}

function applyYamlTemplate(templateId: YamlTemplateId | string | number | boolean | null) {
  const template = yamlTemplates.find((item) => item.id === templateId)
  if (!template) return
  activeYamlTemplate.value = template.id
  markFormSource()
  const previousName = createForm.name.trim()
  const previousImage = createForm.image.trim()
  const defaultImage = `${createDefinition.value.kind.toLowerCase()}:latest`
  const patch = JSON.parse(JSON.stringify(template.patch)) as Partial<CreateFormState>
  Object.assign(createForm, patch)
  if (previousName) {
    createForm.name = previousName
  } else {
    createForm.name = template.id === 'db' ? 'db-sample' : `${template.id}-${createDefinition.value.type}`
  }
  if (previousImage && previousImage !== defaultImage) createForm.image = previousImage
  createForm.appContainers = []
  seedAppContainersFromLegacyFields()
  activeAppContainerId.value = createForm.appContainers[0]?.id ?? ''
  syncLegacyFieldsFromActiveAppContainer()
  activeProbePanel.value = template.patch.startupPath ? 'startup' : 'readiness'
  syncYamlFromForm()
}

function yamlSyntaxStatus() {
  const parsed = parseKubeYaml(formState.yaml)
  if (!formState.yaml.trim()) return { status: 'warning' as const, text: 'YAML 为空' }
  if (!parsed.ok || !parsed.value) return { status: 'error' as const, text: 'YAML 语法错误' }
  return { status: 'ok' as const, text: 'YAML 语法有效' }
}

function syncActiveInitContainer() {
  if (!createForm.initContainers.length) {
    activeInitContainerId.value = ''
    return
  }
  if (!createForm.initContainers.some((container) => container.id === activeInitContainerId.value)) {
    activeInitContainerId.value = createForm.initContainers[0].id
  }
}

function syncYamlFromForm() {
  const schema = currentCreateSchema.value
  const definition = createDefinition.value
  if (!schema) return
  syncLegacyFieldsFromActiveAppContainer()
  formState.name = createForm.name
  formState.namespace = definition.namespaced ? createForm.namespace : ''
  formState.yaml = stringifyKubeObject(schema.toObject(createForm))
  yamlParseError.value = ''
  scheduleYamlResize()
}

function setCreateForm(nextForm: CreateFormState) {
  Object.assign(createForm, nextForm)
}

function applyYamlToCreateForm(object: Record<string, unknown>) {
  const definition = createDefinition.value
  const namespace = definition.namespaced ? (formState.namespace || createForm.namespace || 'default') : ''
  setCreateForm(createDefaultForm(definition.type, definition.kind, namespace))
  applyObjectToForm(createForm, object, definition.type)
  syncActiveAppContainer()
  syncActiveInitContainer()
  formState.name = createForm.name
  formState.namespace = definition.namespaced ? createForm.namespace : ''
}

function syncFormFromYaml() {
  const parsed = parseKubeYaml(formState.yaml)
  if (!parsed.ok || !parsed.value) {
    yamlParseError.value = parsed.error ?? 'YAML 解析失败。'
    return null
  }

  yamlParseError.value = ''
  if (currentCreateSchema.value) {
    syncingFromYaml.value = true
    applyYamlToCreateForm(parsed.value)
    void nextTick(() => {
      syncingFromYaml.value = false
    })
  }
  return parsed.value
}

function onYamlInput(event: Event) {
  createMode.value = 'yaml'
  formState.yaml = inputValue(event)
  formErrors.value = []
  syncFormFromYaml()
  scheduleYamlResize()
}

function onRawYamlInput(event: Event) {
  formState.yaml = inputValue(event)
  yamlParseError.value = ''
  formErrors.value = []
  scheduleYamlResize()
}

function setCreateMode(mode: CreateMode) {
  createMode.value = mode
  formErrors.value = []
  if (mode === 'form') {
    syncYamlFromForm()
  } else {
    syncFormFromYaml()
    scheduleYamlResize()
  }
}

function expectedApiVersionFor(definition: ResourceDefinition) {
  if (['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet'].includes(definition.kind)) return 'apps/v1'
  if (definition.kind === 'Ingress') return 'networking.k8s.io/v1'
  if (definition.kind === 'NetworkPolicy') return 'networking.k8s.io/v1'
  if (definition.kind === 'CronJob') return 'batch/v1'
  if (definition.kind === 'Job') return 'batch/v1'
  if (definition.kind === 'EndpointSlice') return 'discovery.k8s.io/v1'
  return 'v1'
}

function yamlMetadata(object: Record<string, unknown>) {
  return object.metadata && typeof object.metadata === 'object' && !Array.isArray(object.metadata)
    ? object.metadata as Record<string, unknown>
    : {}
}

function validateYamlObject(object: Record<string, unknown>, targetDefinition = createDefinition.value, namespaceFallback = formState.namespace || createForm.namespace) {
  const errors: string[] = []
  const definition = targetDefinition
  const metadata = yamlMetadata(object)
  const name = String(metadata.name ?? '').trim()
  const namespace = String(metadata.namespace ?? namespaceFallback ?? '').trim()
  const kind = String(object.kind ?? '').trim()
  const apiVersion = String(object.apiVersion ?? '').trim()
  const expectedApiVersion = expectedApiVersionFor(definition)

  if (!apiVersion) errors.push('YAML apiVersion 不能为空。')
  if (apiVersion && apiVersion !== expectedApiVersion) errors.push(`${definition.kind} 推荐 apiVersion 为 ${expectedApiVersion}，当前为 ${apiVersion}。`)
  if (!kind) errors.push('YAML kind 不能为空。')
  if (kind && kind !== definition.kind) errors.push(`当前弹窗创建 ${definition.kind}，YAML kind 为 ${kind}。`)
  if (!name) errors.push('YAML metadata.name 不能为空。')
  if (definition.namespaced && !namespace) errors.push('Namespace 不能为空。')

  return errors
}

function validateYamlContent(value: string, targetDefinition = createDefinition.value, namespaceFallback = formState.namespace || createForm.namespace): YamlValidationItem[] {
  if (!value.trim()) {
    return [{ status: 'warning', text: 'YAML 为空。' }]
  }
  const parsed = parseKubeYaml(value)
  if (!parsed.ok || !parsed.value) {
    return [{ status: 'error', text: parsed.error ?? 'YAML 解析失败。' }]
  }
  const errors = validateYamlObject(parsed.value, targetDefinition, namespaceFallback)
  return [
    { status: 'ok', text: 'YAML 语法有效。' },
    ...errors.map((error) => ({ status: 'warning' as const, text: error }))
  ]
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function highlightYamlLine(line: string) {
  const escaped = escapeHtml(line)
  if (/^\s*#/.test(line)) return `<span class="yaml-token-comment">${escaped}</span>`
  const commentIndex = escaped.indexOf('#')
  const codePart = commentIndex >= 0 ? escaped.slice(0, commentIndex) : escaped
  const commentPart = commentIndex >= 0 ? escaped.slice(commentIndex) : ''
  const highlighted = codePart
    .replace(/^(\s*-?\s*)([A-Za-z0-9_.-]+)(\s*:)/, '$1<span class="yaml-token-key">$2</span>$3')
    .replace(/(:\s*)(true|false|null)(\s*)$/i, '$1<span class="yaml-token-bool">$2</span>$3')
    .replace(/(:\s*)(-?\d+(?:\.\d+)?)(\s*)$/, '$1<span class="yaml-token-number">$2</span>$3')
    .replace(/(:\s*)(&quot;.*?&quot;|'.*?')(\s*)$/, '$1<span class="yaml-token-string">$2</span>$3')
  return `${highlighted}${commentPart ? `<span class="yaml-token-comment">${commentPart}</span>` : ''}`
}

function highlightYaml(value: string) {
  return value.split('\n').map(highlightYamlLine).join('\n')
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
  formErrors.value = []
  yamlParseError.value = ''
  resetCollapsedSections()
  activeDeploymentPanel.value = 'basic'
  activeResourcePanel.value = 'cpu'
  activePodTemplatePanel.value = 'app'
  activeAppContainerId.value = ''
  activeAppContainerPanel.value = 'basic'
  activeInitContainerId.value = ''
  activeInitContainerPanel.value = 'basic'
  activeProbePanel.value = 'readiness'
  activeMountPanel.value = 'configMap'
  activePodSecurityPanel.value = 'identity'
  activeSchedulePanel.value = 'node'
  activeLifecyclePanel.value = 'postStart'
  activeStrategyPanel.value = 'strategy'
  activeYamlTemplate.value = 'web'
  const definition = createDefinition.value
  const namespace = defaultNamespaceFor(definition)
  const nextForm = createDefaultForm(definition.type, definition.kind, namespace)
  nextForm.name = `${definition.type}-sample`
  if (definition.type === 'deployments') {
    nextForm.labels = [{ id: 'app', key: 'app', value: nextForm.name }]
  }
  setCreateForm(nextForm)
  syncActiveAppContainer()
  formState.name = nextForm.name
  formState.namespace = namespace
  createMode.value = hasCreateSchema.value ? 'form' : 'yaml'
  if (hasCreateSchema.value) {
    syncYamlFromForm()
  } else {
    formState.yaml = sampleYaml(definition.kind, nextForm.name, formState.namespace)
    scheduleYamlResize()
  }
  editDialogOpen.value = true
  scheduleYamlResize()
}

function openEdit(resource: KubeResourceItem) {
  editMode.value = 'edit'
  createMode.value = 'yaml'
  formErrors.value = []
  yamlParseError.value = ''
  formState.name = resource.name
  formState.namespace = resource.namespace ?? ''
  formState.yaml = resource.yaml
  if (hasCreateSchema.value) {
    const parsed = parseKubeYaml(resource.yaml)
    if (parsed.ok && parsed.value) {
      setCreateForm(createDefaultForm(currentDefinition.value.type, currentDefinition.value.kind, formState.namespace || 'default'))
      applyObjectToForm(createForm, parsed.value, currentDefinition.value.type)
      syncActiveAppContainer()
      syncActiveInitContainer()
    }
  }
  editDialogOpen.value = true
  scheduleYamlResize()
}

async function submitForm() {
  formErrors.value = []
  const definition = createDefinition.value
  let yaml = formState.yaml
  let name = formState.name
  let namespace = formState.namespace

  if (editMode.value === 'create' && hasCreateSchema.value) {
    if (createMode.value === 'form') {
      const errors = validateCreateForm(createForm, definition.type)
      if (errors.length) {
        formErrors.value = errors
        return
      }
      syncYamlFromForm()
      yaml = formState.yaml
      name = createForm.name
      namespace = definition.namespaced ? createForm.namespace : ''
    } else {
      const object = syncFormFromYaml()
      if (!object) {
        formErrors.value = [yamlParseError.value || 'YAML 解析失败。']
        return
      }
      const errors = validateYamlObject(object)
      if (errors.length) {
        formErrors.value = errors
        return
      }
      name = createForm.name || name
      namespace = definition.namespaced ? (createForm.namespace || namespace) : ''
    }
  } else {
    const parsed = parseKubeYaml(formState.yaml)
    if (!parsed.ok || !parsed.value) {
      yamlParseError.value = parsed.error ?? 'YAML 解析失败。'
      formErrors.value = [yamlParseError.value]
      return
    }
    const errors = validateYamlObject(parsed.value)
    if (errors.length) {
      formErrors.value = errors
      return
    }
  }

  const payload = {
    clusterId: filters.clusterId,
    resourceType: definition.type,
    namespace: namespace || undefined,
    name,
    yaml
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

watch(createForm, () => {
  if (editMode.value !== 'create' || !hasCreateSchema.value || createMode.value !== 'form' || syncingFromYaml.value) return
  syncActiveAppContainer()
  syncActiveInitContainer()
  syncYamlFromForm()
}, { deep: true })

watch(() => formState.yaml, scheduleYamlResize)

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

    <BaseDialog :show="editDialogOpen" :title="editMode === 'create' ? `创建 ${createDefinition.title}` : `编辑 ${currentDefinition.title}`" :width="createDialogWidth" @close="closeEditDialog">
      <form class="space-y-4" @submit.prevent="submitForm">
        <div v-if="editMode === 'create' && hasCreateSchema" class="space-y-4">
          <div class="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-3 shadow-sm dark:border-dark-700 dark:bg-dark-800 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p class="text-sm font-semibold text-gray-900 dark:text-white">{{ currentCreateSchema?.title }}</p>
              <p class="text-xs leading-5 text-gray-500 dark:text-dark-400">{{ currentCreateSchema?.summary }}</p>
            </div>
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div class="inline-flex w-full rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-dark-700 dark:bg-dark-900 sm:w-fit" aria-label="弹窗尺寸">
                <button
                  type="button"
                  class="flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-all sm:flex-none"
                  :class="segmentButtonClass(createDialogSize === 'regular')"
                  @click="setCreateDialogSize('regular')"
                >
                  常规
                </button>
                <button
                  type="button"
                  class="flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-all sm:flex-none"
                  :class="segmentButtonClass(createDialogSize === 'wide')"
                  @click="setCreateDialogSize('wide')"
                >
                  超宽
                </button>
              </div>
              <div class="inline-flex w-full rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-dark-700 dark:bg-dark-900 sm:w-fit" aria-label="创建方式">
                <button
                  type="button"
                  class="flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-all sm:flex-none"
                  :class="createMode === 'form' ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/25' : 'text-gray-600 hover:bg-white hover:text-gray-900 dark:text-dark-300 dark:hover:bg-dark-800 dark:hover:text-white'"
                  @click="setCreateMode('form')"
                >
                  表单创建
                </button>
                <button
                  type="button"
                  class="flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-all sm:flex-none"
                  :class="createMode === 'yaml' ? 'bg-primary-600 text-white shadow-sm shadow-primary-600/25' : 'text-gray-600 hover:bg-white hover:text-gray-900 dark:text-dark-300 dark:hover:bg-dark-800 dark:hover:text-white'"
                  @click="setCreateMode('yaml')"
                >
                  YAML 编辑
                </button>
              </div>
            </div>
          </div>

          <div v-if="formErrors.length" class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
            <p v-for="error in formErrors" :key="error">{{ error }}</p>
          </div>

          <div class="grid min-w-0 gap-4" :class="createDialogSplitClass">
            <div class="min-w-0 space-y-4">
              <div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
                当前表单覆盖常用创建字段；YAML 中的复杂字段会作为高级配置保留，未表单化字段请继续在 YAML 中维护。
              </div>

              <section v-if="createDefinition.type === 'deployments'" class="rounded-xl border border-gray-100 p-4 dark:border-dark-700">
                <div class="mb-4 space-y-3">
                  <button type="button" class="flex w-full items-start justify-between gap-3 text-left" @click="toggleSection('deployment')">
                    <span class="min-w-0">
                      <span class="block text-sm font-semibold text-gray-900 dark:text-white">Deployment</span>
                      <span class="block text-xs leading-5 text-gray-500 dark:text-dark-400">配置 Deployment 自身的基本信息与元数据。</span>
                    </span>
                    <Icon :name="isSectionCollapsed('deployment') ? 'chevronDown' : 'chevronUp'" size="sm" class="mt-1 shrink-0 text-gray-400" />
                  </button>
                  <div v-if="!isSectionCollapsed('deployment')" class="inline-flex w-full rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-dark-700 dark:bg-dark-900 sm:w-fit">
                    <button
                      v-for="panel in deploymentPanels"
                      :key="panel.id"
                      type="button"
                      class="flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-all sm:flex-none"
                      :class="segmentButtonClass(activeDeploymentPanel === panel.id)"
                      @click="activeDeploymentPanel = panel.id"
                    >
                      {{ panel.label }}
                    </button>
                  </div>
                </div>

                <div v-if="!isSectionCollapsed('deployment')" class="space-y-3">
                  <div class="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-xs leading-5 text-gray-500 dark:border-dark-700 dark:bg-dark-900/40 dark:text-dark-400">
                    {{ deploymentPanels.find((panel) => panel.id === activeDeploymentPanel)?.help }}
                  </div>
                  <div v-if="activeDeploymentPanel === 'basic'" class="grid gap-3 md:grid-cols-3">
                    <label class="block">
                      <span class="input-label">名称 <span class="text-red-500">*</span></span>
                      <input class="input" :value="createForm.name" placeholder="deployment-name" @input="updateTextField('name', $event)" />
                    </label>
                    <label class="block">
                      <span class="input-label">Namespace <span class="text-red-500">*</span></span>
                      <input class="input" :value="createForm.namespace" placeholder="default" @input="updateTextField('namespace', $event)" />
                    </label>
                    <label class="block">
                      <span class="input-label">副本数 <span class="text-red-500">*</span></span>
                      <input class="input" min="0" type="number" :value="createForm.replicas" @input="updateNumberField('replicas', $event)" />
                    </label>
                  </div>
                  <div v-else class="space-y-4">
                    <div class="space-y-2">
                      <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                        <span class="input-label">标签</span>
                        <span class="text-xs text-gray-400 dark:text-dark-500">默认标签 key 为 app，value 跟随名称，可继续增加其他标签。</span>
                      </div>
                      <div v-for="pair in createForm.labels" :key="pair.id" class="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto]">
                        <input v-model="pair.key" class="input" placeholder="key" @focus="markFormSource" />
                        <input v-model="pair.value" class="input" placeholder="value" @focus="markFormSource" />
                        <button class="btn btn-secondary btn-sm" type="button" :disabled="pair.key === 'app' && createForm.labels.length <= 1" @click="removePair('labels', pair.id)">
                          <Icon name="trash" size="sm" />
                        </button>
                      </div>
                      <button class="btn btn-secondary btn-sm" type="button" @click="addPair('labels')">
                        <Icon name="plus" size="sm" />
                        添加标签
                      </button>
                    </div>
                    <div class="space-y-2">
                      <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                        <span class="input-label">注解</span>
                        <span class="text-xs text-gray-400 dark:text-dark-500">默认空；需要时再写入 metadata.annotations。</span>
                      </div>
                      <div v-if="createForm.annotations.length" class="space-y-2">
                        <div v-for="pair in createForm.annotations" :key="pair.id" class="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto]">
                          <input v-model="pair.key" class="input" placeholder="key" @focus="markFormSource" />
                          <input v-model="pair.value" class="input" placeholder="value" @focus="markFormSource" />
                          <button class="btn btn-secondary btn-sm" type="button" @click="removePair('annotations', pair.id)">
                            <Icon name="trash" size="sm" />
                          </button>
                        </div>
                      </div>
                      <div v-else class="rounded-xl border border-gray-100 px-4 py-5 text-center text-sm text-gray-500 dark:border-dark-700 dark:text-dark-400">当前未配置注解。</div>
                      <button class="btn btn-secondary btn-sm" type="button" @click="addPair('annotations')">
                        <Icon name="plus" size="sm" />
                        添加注解
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              <section v-if="createDefinition.type === 'deployments'" class="rounded-xl border border-gray-100 p-4 dark:border-dark-700">
                <div class="mb-4 space-y-3">
                  <button type="button" class="flex w-full items-start justify-between gap-3 text-left" @click="toggleSection('deployment-strategy')">
                    <span class="min-w-0">
                      <span class="block text-sm font-semibold text-gray-900 dark:text-white">Deployment 更新策略</span>
                      <span class="block text-xs leading-5 text-gray-500 dark:text-dark-400">默认不写入，使用 Kubernetes 默认 RollingUpdate；需要显式控制滚动更新、历史版本和进度期限时再配置。</span>
                    </span>
                    <Icon :name="isSectionCollapsed('deployment-strategy') ? 'chevronDown' : 'chevronUp'" size="sm" class="mt-1 shrink-0 text-gray-400" />
                  </button>
                  <div v-if="!isSectionCollapsed('deployment-strategy')" class="inline-flex w-full rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-dark-700 dark:bg-dark-900 sm:w-fit">
                    <button
                      v-for="panel in strategyPanels"
                      :key="panel.id"
                      type="button"
                      class="flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-all sm:flex-none"
                      :class="segmentButtonClass(activeStrategyPanel === panel.id)"
                      @click="setStrategyPanel(panel.id)"
                    >
                      {{ panel.label }}
                    </button>
                  </div>
                </div>
                <div v-if="!isSectionCollapsed('deployment-strategy')" class="space-y-3">
                  <div class="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-xs leading-5 text-gray-500 dark:border-dark-700 dark:bg-dark-900/40 dark:text-dark-400">
                    {{ strategyPanels.find((panel) => panel.id === activeStrategyPanel)?.help }}
                  </div>
                  <div v-if="activeStrategyPanel === 'strategy'" class="grid gap-3 md:grid-cols-3">
                    <label class="block">
                      <span class="input-label">策略类型</span>
                      <Select
                        :model-value="createForm.strategyType"
                        :options="[{ label: '默认', value: '' }, { label: 'RollingUpdate', value: 'RollingUpdate' }, { label: 'Recreate', value: 'Recreate' }]"
                        @update:model-value="updateScalarField('strategyType', $event)"
                      />
                    </label>
                    <label class="block">
                      <span class="input-label">maxSurge</span>
                      <input class="input" :value="createForm.maxSurge" placeholder="25%" :disabled="createForm.strategyType !== 'RollingUpdate'" @input="updateTextField('maxSurge', $event)" />
                    </label>
                    <label class="block">
                      <span class="input-label">maxUnavailable</span>
                      <input class="input" :value="createForm.maxUnavailable" placeholder="25%" :disabled="createForm.strategyType !== 'RollingUpdate'" @input="updateTextField('maxUnavailable', $event)" />
                    </label>
                  </div>
                  <div v-else class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <label class="block">
                      <span class="input-label">minReadySeconds</span>
                      <input class="input" min="0" type="number" :value="createForm.minReadySeconds ?? ''" placeholder="默认" @input="updateNullableNumberField('minReadySeconds', $event)" />
                    </label>
                    <label class="block">
                      <span class="input-label">revisionHistoryLimit</span>
                      <input class="input" min="0" type="number" :value="createForm.revisionHistoryLimit ?? ''" placeholder="默认" @input="updateNullableNumberField('revisionHistoryLimit', $event)" />
                    </label>
                    <label class="block">
                      <span class="input-label">progressDeadlineSeconds</span>
                      <input class="input" min="1" type="number" :value="createForm.progressDeadlineSeconds ?? ''" placeholder="默认" @input="updateNullableNumberField('progressDeadlineSeconds', $event)" />
                    </label>
                    <label class="flex min-h-[42px] items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 dark:border-dark-600 dark:text-dark-300">
                      <input v-model="createForm.paused" type="checkbox" class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" @focus="markFormSource" />
                      暂停 rollout
                    </label>
                  </div>
                </div>
              </section>

              <section
                v-for="section in visibleCreateSections"
                :key="section.title"
                class="rounded-xl border border-gray-100 p-4 dark:border-dark-700"
              >
                <button
                  type="button"
                  class="mb-4 flex w-full items-start justify-between gap-3 text-left"
                  @click="toggleSection(sectionKey(section.title))"
                >
                  <span class="min-w-0">
                    <span class="block text-sm font-semibold text-gray-900 dark:text-white">{{ section.title }}</span>
                    <span v-if="section.description" class="block text-xs text-gray-500 dark:text-dark-400">{{ section.description }}</span>
                  </span>
                  <Icon :name="isSectionCollapsed(sectionKey(section.title)) ? 'chevronDown' : 'chevronUp'" size="sm" class="mt-1 shrink-0 text-gray-400" />
                </button>

                <div v-if="!isSectionCollapsed(sectionKey(section.title))" class="space-y-4">
                  <div v-if="section.title === 'Pod 模板'" class="space-y-4">
                    <div class="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-xs leading-5 text-gray-500 dark:border-dark-700 dark:bg-dark-900/40 dark:text-dark-400">
                      Pod 模板统一纳管普通容器与 Init 容器。普通容器配置端口、环境变量、资源、探针、生命周期和容器挂载；Init 容器支持 command / args、env、resources 和 volumeMounts，但不配置 readiness、liveness、startup probe 或 lifecycle。Pod 安全、存储和调度在下方以 Pod 级配置统一生效。
                    </div>
                    <div class="inline-flex w-full rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-dark-700 dark:bg-dark-900 sm:w-fit">
                      <button
                        v-for="panel in podTemplatePanels"
                        :key="panel.id"
                        type="button"
                        class="flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-all sm:flex-none"
                        :class="segmentButtonClass(activePodTemplatePanel === panel.id)"
                        @click="setPodTemplatePanel(panel.id)"
                      >
                        {{ panel.label }}
                      </button>
                    </div>
                    <p class="text-xs leading-5 text-gray-500 dark:text-dark-400">
                      {{ podTemplatePanels.find((panel) => panel.id === activePodTemplatePanel)?.help }}
                    </p>
                  </div>

                  <template v-if="section.title !== 'Pod 模板'">
                  <div v-for="field in section.fields" :key="field.key" class="space-y-2">
                    <template v-if="section.title !== '基本信息' || field.key === 'name' || field.key === 'namespace'">
                    <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                      <span class="input-label">
                        {{ field.label }}
                        <span v-if="field.required" class="text-red-500">*</span>
                      </span>
                      <span v-if="field.help" class="text-xs text-gray-400 dark:text-dark-500">{{ field.help }}</span>
                    </div>

                    <input
                      v-if="field.type === 'text'"
                      class="input"
                      :placeholder="field.placeholder"
                      :value="scalarValue(field.key)"
                      @input="updateTextField(field.key, $event)"
                    />

                    <input
                      v-else-if="field.type === 'number'"
                      class="input"
                      :min="field.min"
                      type="number"
                      :value="numberValue(field.key)"
                      @input="updateNumberField(field.key, $event)"
                    />

                    <Select
                      v-else-if="field.type === 'select'"
                      :model-value="scalarValue(field.key)"
                      :options="fieldOptions(field)"
                      @update:model-value="updateScalarField(field.key, $event)"
                    />

                    <div v-else-if="field.type === 'keyValue' || field.type === 'configData' || field.type === 'secretData'" class="space-y-2">
                      <div v-for="pair in pairList(field.key)" :key="pair.id" class="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto]">
                        <input v-model="pair.key" class="input" placeholder="key" @focus="markFormSource" />
                        <input
                          v-model="pair.value"
                          class="input"
                          :type="field.type === 'secretData' ? 'password' : 'text'"
                          :placeholder="field.type === 'secretData' ? 'value' : 'value'"
                          @focus="markFormSource"
                        />
                        <button class="btn btn-secondary btn-sm" type="button" @click="removePair(field.key, pair.id)">
                          <Icon name="trash" size="sm" />
                        </button>
                      </div>
                      <button class="btn btn-secondary btn-sm" type="button" @click="addPair(field.key)">
                        <Icon name="plus" size="sm" />
                        添加
                      </button>
                    </div>

                    <div v-else-if="field.type === 'ports'" class="space-y-2">
                      <div v-for="port in createForm.ports" :key="port.id" class="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_100px_100px_112px_auto]">
                        <input v-model="port.name" class="input" placeholder="名称" @focus="markFormSource" />
                        <input v-model.number="port.port" class="input" min="1" type="number" placeholder="Port" @focus="markFormSource" />
                        <input v-model.number="port.targetPort" class="input" min="1" type="number" placeholder="Target" @focus="markFormSource" />
                        <Select v-model="port.protocol" :options="[{ label: 'TCP', value: 'TCP' }, { label: 'UDP', value: 'UDP' }]" />
                        <button class="btn btn-secondary btn-sm" type="button" @click="removePort(port.id)">
                          <Icon name="trash" size="sm" />
                        </button>
                      </div>
                      <button class="btn btn-secondary btn-sm" type="button" @click="addPort">
                        <Icon name="plus" size="sm" />
                        添加端口
                      </button>
                    </div>

                    <div v-else-if="field.type === 'env'" class="space-y-2">
                      <div v-for="env in createForm.env" :key="env.id" class="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto]">
                        <input v-model="env.name" class="input" placeholder="NAME" @focus="markFormSource" />
                        <input v-model="env.value" class="input" placeholder="value" @focus="markFormSource" />
                        <button class="btn btn-secondary btn-sm" type="button" @click="removeEnv(env.id)">
                          <Icon name="trash" size="sm" />
                        </button>
                      </div>
                      <button class="btn btn-secondary btn-sm" type="button" @click="addEnv">
                        <Icon name="plus" size="sm" />
                        添加变量
                      </button>
                    </div>
                    </template>
                  </div>
                  </template>

                  <div v-else-if="activePodTemplatePanel === 'app'" class="space-y-4">
                    <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div class="inline-flex w-full flex-wrap rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-dark-700 dark:bg-dark-900 sm:w-fit">
                        <button
                          v-for="panel in appContainerPanels"
                          :key="panel.id"
                          type="button"
                          class="flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-all sm:flex-none"
                          :class="segmentButtonClass(activeAppContainerPanel === panel.id)"
                          @click="setAppContainerPanel(panel.id)"
                        >
                          {{ panel.label }}
                        </button>
                      </div>
                      <button class="btn btn-secondary btn-sm" type="button" @click="addAppContainer">
                        <Icon name="plus" size="sm" />
                        添加普通容器
                      </button>
                    </div>
                    <p class="text-xs leading-5 text-gray-500 dark:text-dark-400">
                      {{ appContainerPanels.find((panel) => panel.id === activeAppContainerPanel)?.help }}
                    </p>

                    <div v-if="createForm.appContainers.length" class="space-y-3">
                      <div class="flex flex-wrap gap-2">
                        <button
                          v-for="container in createForm.appContainers"
                          :key="container.id"
                          type="button"
                          class="rounded-lg border px-3 py-2 text-sm font-semibold transition-all"
                          :class="activeAppContainerId === container.id ? 'border-primary-500 bg-primary-50 text-primary-700 dark:border-primary-500 dark:bg-primary-950/30 dark:text-primary-300' : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-dark-700 dark:text-dark-300 dark:hover:bg-dark-800'"
                          @click="activeAppContainerId = container.id; syncLegacyFieldsFromActiveAppContainer()"
                        >
                          {{ container.name || '未命名普通容器' }}
                        </button>
                      </div>

                      <div v-if="activeAppContainer" class="rounded-xl border border-gray-100 p-3 dark:border-dark-700">
                        <div v-if="activeAppContainerPanel === 'basic'" class="space-y-3">
                          <div class="grid gap-3 md:grid-cols-2">
                            <label class="block">
                              <span class="input-label">容器名称</span>
                              <input class="input" :value="activeAppContainer.name" placeholder="app" @input="updateAppTextField(activeAppContainer, 'name', $event)" />
                            </label>
                            <label class="block">
                              <span class="input-label">镜像</span>
                              <input class="input" :value="activeAppContainer.image" placeholder="registry.example/app:v1.0.0" @input="updateAppTextField(activeAppContainer, 'image', $event)" />
                            </label>
                            <label class="block">
                              <span class="input-label">镜像拉取策略</span>
                              <Select
                                :model-value="activeAppContainer.imagePullPolicy"
                                :options="[{ label: 'IfNotPresent', value: 'IfNotPresent' }, { label: 'Always', value: 'Always' }, { label: 'Never', value: 'Never' }]"
                                @update:model-value="updateAppScalarField(activeAppContainer, 'imagePullPolicy', $event)"
                              />
                            </label>
                          </div>
                          <button class="btn btn-secondary btn-sm" type="button" :disabled="createForm.appContainers.length <= 1" @click="removeAppContainer(activeAppContainer.id)">
                            <Icon name="trash" size="sm" />
                            移除当前普通容器
                          </button>
                        </div>

                        <div v-else-if="activeAppContainerPanel === 'ports'" class="space-y-2">
                          <div v-for="port in activeAppContainer.ports" :key="port.id" class="grid min-w-0 gap-2 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_100px_100px_112px_auto]">
                            <input v-model="port.name" class="input" placeholder="名称" @focus="markFormSource" />
                            <input v-model.number="port.port" class="input" min="1" type="number" placeholder="Port" @focus="markFormSource" />
                            <input v-model.number="port.targetPort" class="input" min="1" type="number" placeholder="Target" @focus="markFormSource" />
                            <Select v-model="port.protocol" :options="[{ label: 'TCP', value: 'TCP' }, { label: 'UDP', value: 'UDP' }]" />
                            <button class="btn btn-secondary btn-sm" type="button" @click="removeAppPort(activeAppContainer, port.id)">
                              <Icon name="trash" size="sm" />
                            </button>
                          </div>
                          <button class="btn btn-secondary btn-sm" type="button" @click="addAppPort(activeAppContainer)">
                            <Icon name="plus" size="sm" />
                            添加端口
                          </button>
                        </div>

                        <div v-else-if="activeAppContainerPanel === 'env'" class="space-y-2">
                          <div v-for="env in activeAppContainer.env" :key="env.id" class="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto]">
                            <input v-model="env.name" class="input" placeholder="NAME" @focus="markFormSource" />
                            <input v-model="env.value" class="input" placeholder="value" @focus="markFormSource" />
                            <button class="btn btn-secondary btn-sm" type="button" @click="removeAppEnv(activeAppContainer, env.id)">
                              <Icon name="trash" size="sm" />
                            </button>
                          </div>
                          <button class="btn btn-secondary btn-sm" type="button" @click="addAppEnv(activeAppContainer)">
                            <Icon name="plus" size="sm" />
                            添加变量
                          </button>
                        </div>

                        <div v-else-if="activeAppContainerPanel === 'resources'" class="space-y-3">
                          <div class="inline-flex w-full rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-dark-700 dark:bg-dark-900 sm:w-fit">
                            <button
                              v-for="panel in resourcePanels"
                              :key="panel.id"
                              type="button"
                              class="flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-all sm:flex-none"
                              :class="segmentButtonClass(activeResourcePanel === panel.id)"
                              @click="setResourcePanel(panel.id)"
                            >
                              {{ panel.label }}
                            </button>
                          </div>
                          <div class="grid gap-3 md:grid-cols-2">
                            <label v-for="field in resourceFieldGroups[activeResourcePanel]" :key="field.key" class="block">
                              <span class="input-label">{{ field.label }}</span>
                              <input
                                class="input"
                                :placeholder="field.placeholder"
                                :value="appScalarValue(activeAppContainer, field.key as keyof AppContainerEntry)"
                                @input="updateAppTextField(activeAppContainer, field.key as keyof AppContainerEntry, $event)"
                              />
                              <span class="input-hint">{{ field.help }}</span>
                            </label>
                          </div>
                        </div>

                        <div v-else-if="activeAppContainerPanel === 'probes'" class="space-y-3">
                          <div class="inline-flex w-full flex-wrap rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-dark-700 dark:bg-dark-900 sm:w-fit">
                            <button
                              v-for="panel in probePanels"
                              :key="panel.id"
                              type="button"
                              class="flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-all sm:flex-none"
                              :class="segmentButtonClass(activeProbePanel === panel.id)"
                              @click="setProbePanel(panel.id)"
                            >
                              {{ panel.label }}
                            </button>
                          </div>
                          <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                            <label v-for="field in probeFieldGroups[activeProbePanel]" :key="field.key" class="block">
                              <span class="input-label">{{ field.label }}</span>
                              <input
                                v-if="field.type === 'text'"
                                class="input"
                                :placeholder="field.placeholder"
                                :value="appScalarValue(activeAppContainer, field.key as keyof AppContainerEntry)"
                                @input="updateAppTextField(activeAppContainer, field.key as keyof AppContainerEntry, $event)"
                              />
                              <input
                                v-else
                                class="input"
                                :min="field.min"
                                type="number"
                                :value="Number(appScalarValue(activeAppContainer, field.key as keyof AppContainerEntry)) || 0"
                                @input="updateAppNumberField(activeAppContainer, field.key as keyof AppContainerEntry, $event)"
                              />
                              <span class="input-hint">{{ field.help }}</span>
                            </label>
                          </div>
                        </div>

                        <div v-else-if="activeAppContainerPanel === 'mounts'" class="space-y-3">
                          <div class="inline-flex w-full rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-dark-700 dark:bg-dark-900 sm:w-fit">
                            <button
                              v-for="panel in mountPanels"
                              :key="panel.id"
                              type="button"
                              class="flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-all sm:flex-none"
                              :class="segmentButtonClass(activeMountPanel === panel.id)"
                              @click="setMountPanel(panel.id)"
                            >
                              {{ panel.label }}
                            </button>
                          </div>
                          <div class="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-xs leading-5 text-gray-500 dark:border-dark-700 dark:bg-dark-900/40 dark:text-dark-400">
                            {{ mountPanels.find((panel) => panel.id === activeMountPanel)?.help }}。未添加条目时不会写入 volumes / volumeMounts。
                          </div>
                          <div v-if="mountListByType(activeMountPanel).length" class="space-y-3">
                            <div v-for="mount in mountListByType(activeMountPanel)" :key="mount.id" class="rounded-xl border border-gray-100 p-3 dark:border-dark-700">
                              <div class="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)]">
                                <label class="block">
                                  <span class="input-label">Volume 名称</span>
                                  <input v-model="mount.name" class="input" placeholder="app-config" @focus="markFormSource" />
                                </label>
                                <div v-if="mount.type !== 'emptyDir'" class="block space-y-2">
                                  <span class="input-label">{{ mountSourceLabel(mount.type) }}</span>
                                  <Select
                                    :model-value="sourceOptions(mount.type).some((option) => option.value === mount.sourceName) ? mount.sourceName : null"
                                    :options="sourceOptions(mount.type)"
                                    :placeholder="mount.sourceName || '请选择已有资源'"
                                    searchable
                                    @update:model-value="onMountSourceSelect(mount, $event)"
                                  />
                                </div>
                                <label class="block">
                                  <span class="input-label">挂载路径</span>
                                  <input v-model="mount.mountPath" class="input" placeholder="/etc/config" @focus="markFormSource" />
                                </label>
                                <label class="block">
                                  <span class="input-label">SubPath</span>
                                  <input v-model="mount.subPath" class="input" placeholder="可选" @focus="markFormSource" />
                                </label>
                                <label class="flex min-h-[42px] items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 dark:border-dark-600 dark:text-dark-300">
                                  <input v-model="mount.readOnly" type="checkbox" class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" @focus="markFormSource" />
                                  只读挂载
                                </label>
                                <div class="flex items-end gap-2">
                                  <button class="btn btn-secondary btn-sm w-full" type="button" @click="removeVolumeMount(mount.id)">
                                    <Icon name="trash" size="sm" />
                                    移除
                                  </button>
                                  <button v-if="mount.type !== 'emptyDir'" class="btn btn-secondary btn-sm w-full" type="button" @click="openRelatedConfigResource(mount.type, mount.id)">
                                    <Icon name="plus" size="sm" />
                                    新建并选中
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div v-else class="rounded-xl border border-gray-100 px-4 py-6 text-center text-sm text-gray-500 dark:border-dark-700 dark:text-dark-400">
                            当前分类还没有挂载项。
                          </div>
                          <button class="btn btn-secondary btn-sm" type="button" @click="addVolumeMount()">
                            <Icon name="plus" size="sm" />
                            添加 {{ mountPanels.find((panel) => panel.id === activeMountPanel)?.label }} 挂载
                          </button>
                          <button v-if="activeMountPanel !== 'emptyDir'" class="btn btn-secondary btn-sm" type="button" @click="openRelatedConfigResource(activeMountPanel)">
                            <Icon name="plus" size="sm" />
                            创建 {{ mountCreateLabel(activeMountPanel) }}
                          </button>
                        </div>

                        <div v-else class="space-y-3">
                          <div class="inline-flex w-full rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-dark-700 dark:bg-dark-900 sm:w-fit">
                            <button
                              v-for="panel in lifecyclePanels"
                              :key="panel.id"
                              type="button"
                              class="flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-all sm:flex-none"
                              :class="segmentButtonClass(activeLifecyclePanel === panel.id)"
                              @click="setLifecyclePanel(panel.id)"
                            >
                              {{ panel.label }}
                            </button>
                          </div>
                          <div class="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-xs leading-5 text-gray-500 dark:border-dark-700 dark:bg-dark-900/40 dark:text-dark-400">
                            {{ lifecyclePanels.find((panel) => panel.id === activeLifecyclePanel)?.help }} 多命令用逗号分隔，例如 `/bin/sh, -c, echo started`。
                          </div>
                          <div v-if="lifecycleList(activeLifecyclePanel, activeAppContainer).length" class="space-y-3">
                            <div v-for="hook in lifecycleList(activeLifecyclePanel, activeAppContainer)" :key="hook.id" class="rounded-xl border border-gray-100 p-3 dark:border-dark-700">
                              <div class="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-[160px_minmax(0,1fr)_120px_auto]">
                                <label class="block">
                                  <span class="input-label">处理方式</span>
                                  <Select v-model="hook.handlerType" :options="[{ label: 'Exec', value: 'exec' }, { label: 'HTTP GET', value: 'httpGet' }]" />
                                </label>
                                <label v-if="hook.handlerType === 'exec'" class="block xl:col-span-2">
                                  <span class="input-label">命令</span>
                                  <input v-model="hook.command" class="input" placeholder="/bin/sh, -c, echo started" @focus="markFormSource" />
                                </label>
                                <label v-if="hook.handlerType === 'httpGet'" class="block">
                                  <span class="input-label">路径</span>
                                  <input v-model="hook.path" class="input" placeholder="/hook" @focus="markFormSource" />
                                </label>
                                <label v-if="hook.handlerType === 'httpGet'" class="block">
                                  <span class="input-label">端口</span>
                                  <input v-model.number="hook.port" class="input" min="1" type="number" @focus="markFormSource" />
                                </label>
                                <div class="flex items-end">
                                  <button class="btn btn-secondary btn-sm w-full" type="button" @click="removeLifecycleHook(hook.id, activeAppContainer)">
                                    <Icon name="trash" size="sm" />
                                    移除
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div v-else class="rounded-xl border border-gray-100 px-4 py-6 text-center text-sm text-gray-500 dark:border-dark-700 dark:text-dark-400">
                            当前钩子未启用。
                          </div>
                          <button class="btn btn-secondary btn-sm" type="button" @click="addLifecycleHook(activeLifecyclePanel, activeAppContainer)">
                            <Icon name="plus" size="sm" />
                            添加 {{ lifecyclePanels.find((panel) => panel.id === activeLifecyclePanel)?.label }}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div v-else class="space-y-4">
                    <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div class="inline-flex w-full flex-wrap rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-dark-700 dark:bg-dark-900 sm:w-fit">
                        <button
                          v-for="panel in initContainerPanels"
                          :key="panel.id"
                          type="button"
                          class="flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-all sm:flex-none"
                          :class="segmentButtonClass(activeInitContainerPanel === panel.id)"
                          @click="setInitContainerPanel(panel.id)"
                        >
                          {{ panel.label }}
                        </button>
                      </div>
                      <button class="btn btn-secondary btn-sm" type="button" @click="addInitContainer">
                        <Icon name="plus" size="sm" />
                        添加 Init 容器
                      </button>
                    </div>
                    <p class="text-xs leading-5 text-gray-500 dark:text-dark-400">
                      {{ initContainerPanels.find((panel) => panel.id === activeInitContainerPanel)?.help }}
                    </p>

                    <div v-if="createForm.initContainers.length" class="space-y-3">
                      <div class="flex flex-wrap gap-2">
                        <button
                          v-for="container in createForm.initContainers"
                          :key="container.id"
                          type="button"
                          class="rounded-lg border px-3 py-2 text-sm font-semibold transition-all"
                          :class="activeInitContainerId === container.id ? 'border-primary-500 bg-primary-50 text-primary-700 dark:border-primary-500 dark:bg-primary-950/30 dark:text-primary-300' : 'border-gray-200 text-gray-600 hover:bg-gray-50 dark:border-dark-700 dark:text-dark-300 dark:hover:bg-dark-800'"
                          @click="activeInitContainerId = container.id"
                        >
                          {{ container.name || '未命名 Init 容器' }}
                        </button>
                      </div>

                      <div v-if="activeInitContainer" class="rounded-xl border border-gray-100 p-3 dark:border-dark-700">
                        <div v-if="activeInitContainerPanel === 'basic'" class="space-y-3">
                          <div class="grid gap-3 md:grid-cols-2">
                            <label class="block">
                              <span class="input-label">Init 容器名称</span>
                              <input class="input" :value="activeInitContainer.name" placeholder="init-db" @input="updateInitTextField(activeInitContainer, 'name', $event)" />
                            </label>
                            <label class="block">
                              <span class="input-label">镜像</span>
                              <input class="input" :value="activeInitContainer.image" placeholder="busybox:1.36" @input="updateInitTextField(activeInitContainer, 'image', $event)" />
                            </label>
                            <label class="block">
                              <span class="input-label">镜像拉取策略</span>
                              <Select
                                :model-value="activeInitContainer.imagePullPolicy"
                                :options="[{ label: 'IfNotPresent', value: 'IfNotPresent' }, { label: 'Always', value: 'Always' }, { label: 'Never', value: 'Never' }]"
                                @update:model-value="updateInitScalarField(activeInitContainer, 'imagePullPolicy', $event)"
                              />
                            </label>
                          </div>
                          <button class="btn btn-secondary btn-sm" type="button" @click="removeInitContainer(activeInitContainer.id)">
                            <Icon name="trash" size="sm" />
                            移除当前 Init 容器
                          </button>
                        </div>

                        <div v-else-if="activeInitContainerPanel === 'command'" class="grid gap-3 md:grid-cols-2">
                          <label class="block">
                            <span class="input-label">Command</span>
                            <input class="input" :value="activeInitContainer.command" placeholder="/bin/sh, -c" @input="updateInitTextField(activeInitContainer, 'command', $event)" />
                            <span class="input-hint">逗号分隔，写入 command 数组。</span>
                          </label>
                          <label class="block">
                            <span class="input-label">Args</span>
                            <input class="input" :value="activeInitContainer.args" placeholder="echo init" @input="updateInitTextField(activeInitContainer, 'args', $event)" />
                            <span class="input-hint">逗号分隔，写入 args 数组。</span>
                          </label>
                        </div>

                        <div v-else-if="activeInitContainerPanel === 'env'" class="space-y-2">
                          <div v-for="env in activeInitContainer.env" :key="env.id" class="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto]">
                            <input v-model="env.name" class="input" placeholder="NAME" @focus="markFormSource" />
                            <input v-model="env.value" class="input" placeholder="value" @focus="markFormSource" />
                            <button class="btn btn-secondary btn-sm" type="button" @click="removeInitEnv(activeInitContainer, env.id)">
                              <Icon name="trash" size="sm" />
                            </button>
                          </div>
                          <button class="btn btn-secondary btn-sm" type="button" @click="addInitEnv(activeInitContainer)">
                            <Icon name="plus" size="sm" />
                            添加 Init 环境变量
                          </button>
                        </div>

                        <div v-else-if="activeInitContainerPanel === 'resources'" class="grid gap-3 md:grid-cols-2">
                          <label class="block">
                            <span class="input-label">CPU Request</span>
                            <input class="input" :value="initScalarValue(activeInitContainer, 'cpuRequest')" placeholder="100m" @input="updateInitTextField(activeInitContainer, 'cpuRequest', $event)" />
                          </label>
                          <label class="block">
                            <span class="input-label">CPU Limit</span>
                            <input class="input" :value="initScalarValue(activeInitContainer, 'cpuLimit')" placeholder="500m" @input="updateInitTextField(activeInitContainer, 'cpuLimit', $event)" />
                          </label>
                          <label class="block">
                            <span class="input-label">Memory Request</span>
                            <input class="input" :value="initScalarValue(activeInitContainer, 'memoryRequest')" placeholder="128Mi" @input="updateInitTextField(activeInitContainer, 'memoryRequest', $event)" />
                          </label>
                          <label class="block">
                            <span class="input-label">Memory Limit</span>
                            <input class="input" :value="initScalarValue(activeInitContainer, 'memoryLimit')" placeholder="512Mi" @input="updateInitTextField(activeInitContainer, 'memoryLimit', $event)" />
                          </label>
                        </div>

                        <div v-else class="space-y-3">
                          <div class="inline-flex w-full rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-dark-700 dark:bg-dark-900 sm:w-fit">
                            <button
                              v-for="panel in mountPanels"
                              :key="panel.id"
                              type="button"
                              class="flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-all sm:flex-none"
                              :class="segmentButtonClass(activeMountPanel === panel.id)"
                              @click="setMountPanel(panel.id)"
                            >
                              {{ panel.label }}
                            </button>
                          </div>

                          <div v-if="initMountListByType(activeInitContainer, activeMountPanel).length" class="space-y-3">
                            <div
                              v-for="mount in initMountListByType(activeInitContainer, activeMountPanel)"
                              :key="mount.id"
                              class="rounded-xl border border-gray-100 p-3 dark:border-dark-700"
                            >
                              <div class="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)]">
                                <label class="block">
                                  <span class="input-label">Volume 名称</span>
                                  <input v-model="mount.name" class="input" placeholder="init-config" @focus="markFormSource" />
                                </label>
                                <div v-if="mount.type !== 'emptyDir'" class="block space-y-2">
                                  <span class="input-label">{{ mountSourceLabel(mount.type) }}</span>
                                  <Select
                                    :model-value="initContainerVolumeOptions(activeInitContainer, mount.type).some((option) => option.value === mount.sourceName) ? mount.sourceName : null"
                                    :options="initContainerVolumeOptions(activeInitContainer, mount.type)"
                                    :placeholder="mount.sourceName || '请选择已有资源'"
                                    searchable
                                    @update:model-value="onMountSourceSelect(mount, $event)"
                                  />
                                </div>
                                <label class="block">
                                  <span class="input-label">挂载路径</span>
                                  <input v-model="mount.mountPath" class="input" placeholder="/etc/init" @focus="markFormSource" />
                                </label>
                                <label class="block">
                                  <span class="input-label">SubPath</span>
                                  <input v-model="mount.subPath" class="input" placeholder="可选" @focus="markFormSource" />
                                </label>
                                <label class="flex min-h-[42px] items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 dark:border-dark-600 dark:text-dark-300">
                                  <input v-model="mount.readOnly" type="checkbox" class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" @focus="markFormSource" />
                                  只读挂载
                                </label>
                                <div class="flex items-end">
                                  <button class="btn btn-secondary btn-sm w-full" type="button" @click="removeInitVolumeMount(activeInitContainer, mount.id)">
                                    <Icon name="trash" size="sm" />
                                    移除
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                          <div v-else class="rounded-xl border border-gray-100 px-4 py-6 text-center text-sm text-gray-500 dark:border-dark-700 dark:text-dark-400">
                            当前 Init 容器还没有此类挂载。
                          </div>
                          <button class="btn btn-secondary btn-sm" type="button" @click="addInitVolumeMount(activeInitContainer)">
                            <Icon name="plus" size="sm" />
                            添加 {{ mountPanels.find((panel) => panel.id === activeMountPanel)?.label }} 挂载
                          </button>
                        </div>
                      </div>
                    </div>

                    <div v-else class="rounded-xl border border-gray-100 px-4 py-8 text-center text-sm text-gray-500 dark:border-dark-700 dark:text-dark-400">
                      当前未配置 Init 容器；需要初始化数据库、拉取配置或等待依赖时再添加。
                    </div>
                  </div>
                </div>
              </section>

              <section v-if="createDefinition.type === 'deployments' && activePodTemplatePanel === 'app' && showLegacyAppSections" class="rounded-xl border border-gray-100 p-4 dark:border-dark-700">
                <div class="mb-4 space-y-3">
                  <button type="button" class="flex w-full items-start justify-between gap-3 text-left" @click="toggleSection('resources')">
                    <span class="min-w-0">
                      <span class="block text-sm font-semibold text-gray-900 dark:text-white">资源限制</span>
                      <span class="block text-xs leading-5 text-gray-500 dark:text-dark-400">按 CPU 与内存分别配置 requests / limits，未填写的值不会写入 YAML。</span>
                    </span>
                    <Icon :name="isSectionCollapsed('resources') ? 'chevronDown' : 'chevronUp'" size="sm" class="mt-1 shrink-0 text-gray-400" />
                  </button>
                  <div v-if="!isSectionCollapsed('resources')" class="inline-flex w-full rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-dark-700 dark:bg-dark-900 sm:w-fit">
                    <button
                      v-for="panel in resourcePanels"
                      :key="panel.id"
                      type="button"
                      class="flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-all sm:flex-none"
                      :class="segmentButtonClass(activeResourcePanel === panel.id)"
                      @click="setResourcePanel(panel.id)"
                    >
                      {{ panel.label }}
                    </button>
                  </div>
                </div>

                <div v-if="!isSectionCollapsed('resources')" class="grid gap-3 md:grid-cols-2">
                  <label v-for="field in resourceFieldGroups[activeResourcePanel]" :key="field.key" class="block">
                    <span class="input-label">{{ field.label }}</span>
                    <input
                      class="input"
                      :placeholder="field.placeholder"
                      :value="scalarValue(field.key)"
                      @input="updateTextField(field.key, $event)"
                    />
                    <span class="input-hint">{{ field.help }}</span>
                  </label>
                </div>
              </section>

              <section v-if="createDefinition.type === 'deployments' && activePodTemplatePanel === 'app' && showLegacyAppSections" class="rounded-xl border border-gray-100 p-4 dark:border-dark-700">
                <div class="mb-4 space-y-3">
                  <button type="button" class="flex w-full items-start justify-between gap-3 text-left" @click="toggleSection('probes')">
                    <span class="min-w-0">
                      <span class="block text-sm font-semibold text-gray-900 dark:text-white">健康检查</span>
                      <span class="block text-xs leading-5 text-gray-500 dark:text-dark-400">Readiness 控制是否接收流量，Liveness 控制容器是否需要重启，Startup 适合慢启动容器。</span>
                    </span>
                    <Icon :name="isSectionCollapsed('probes') ? 'chevronDown' : 'chevronUp'" size="sm" class="mt-1 shrink-0 text-gray-400" />
                  </button>
                  <div v-if="!isSectionCollapsed('probes')" class="inline-flex w-full rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-dark-700 dark:bg-dark-900 sm:w-fit">
                    <button
                      v-for="panel in probePanels"
                      :key="panel.id"
                      type="button"
                      class="flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-all sm:flex-none"
                      :class="segmentButtonClass(activeProbePanel === panel.id)"
                      @click="setProbePanel(panel.id)"
                    >
                      {{ panel.label }}
                    </button>
                  </div>
                </div>

                <div v-if="!isSectionCollapsed('probes')" class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  <label v-for="field in probeFieldGroups[activeProbePanel]" :key="field.key" class="block">
                    <span class="input-label">{{ field.label }}</span>
                    <input
                      v-if="field.type === 'text'"
                      class="input"
                      :placeholder="field.placeholder"
                      :value="scalarValue(field.key)"
                      @input="updateTextField(field.key, $event)"
                    />
                    <input
                      v-else
                      class="input"
                      :min="field.min"
                      type="number"
                      :value="numberValue(field.key)"
                      @input="updateNumberField(field.key, $event)"
                    />
                    <span class="input-hint">{{ field.help }}</span>
                  </label>
                </div>
              </section>

              <section v-if="createDefinition.type === 'deployments' && activePodTemplatePanel === 'app' && showLegacyAppSections" class="rounded-xl border border-gray-100 p-4 dark:border-dark-700">
                <div class="mb-4 space-y-3">
                  <button type="button" class="flex w-full items-start justify-between gap-3 text-left" @click="toggleSection('mounts')">
                    <span class="min-w-0">
                      <span class="block text-sm font-semibold text-gray-900 dark:text-white">挂载与配置</span>
                      <span class="block text-xs leading-5 text-gray-500 dark:text-dark-400">ConfigMap、Secret 和 emptyDir 均为可选项；挂载项只选择当前 Namespace 资源，需要新资源时从下方创建入口进入。</span>
                    </span>
                    <Icon :name="isSectionCollapsed('mounts') ? 'chevronDown' : 'chevronUp'" size="sm" class="mt-1 shrink-0 text-gray-400" />
                  </button>
                  <div v-if="!isSectionCollapsed('mounts')" class="inline-flex w-full rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-dark-700 dark:bg-dark-900 sm:w-fit">
                    <button
                      v-for="panel in mountPanels"
                      :key="panel.id"
                      type="button"
                      class="flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-all sm:flex-none"
                      :class="segmentButtonClass(activeMountPanel === panel.id)"
                      @click="setMountPanel(panel.id)"
                    >
                      {{ panel.label }}
                    </button>
                  </div>
                </div>

                <div v-if="!isSectionCollapsed('mounts')" class="space-y-3">
                  <div class="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-xs leading-5 text-gray-500 dark:border-dark-700 dark:bg-dark-900/40 dark:text-dark-400">
                    {{ mountPanels.find((panel) => panel.id === activeMountPanel)?.help }}。未添加条目时不会写入 volumes / volumeMounts；从 YAML 回填的复杂挂载字段会尽量保留在原始结构中。
                  </div>

                  <div v-if="mountListByType(activeMountPanel).length" class="space-y-3">
                    <div
                      v-for="mount in mountListByType(activeMountPanel)"
                      :key="mount.id"
                      class="rounded-xl border border-gray-100 p-3 dark:border-dark-700"
                    >
                      <div class="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)]">
                        <label class="block">
                          <span class="input-label">Volume 名称</span>
                          <input v-model="mount.name" class="input" placeholder="app-config" @focus="markFormSource" />
                        </label>
                        <div v-if="mount.type !== 'emptyDir'" class="block space-y-2">
                          <span class="input-label">{{ mountSourceLabel(mount.type) }}</span>
                          <Select
                            :model-value="sourceOptions(mount.type).some((option) => option.value === mount.sourceName) ? mount.sourceName : null"
                            :options="sourceOptions(mount.type)"
                            :placeholder="mount.sourceName || '请选择已有资源'"
                            searchable
                            @update:model-value="onMountSourceSelect(mount, $event)"
                          />
                          <p v-if="mount.sourceName && !sourceOptions(mount.type).some((option) => option.value === mount.sourceName)" class="text-xs leading-5 text-amber-600 dark:text-amber-400">
                            当前 YAML 引用了 {{ mount.sourceName }}，但示例资源列表中暂未返回该名称；请确认后端资源列表同步后再选择。
                          </p>
                        </div>
                        <label class="block">
                          <span class="input-label">挂载路径</span>
                          <input v-model="mount.mountPath" class="input" placeholder="/etc/config" @focus="markFormSource" />
                        </label>
                        <label class="block">
                          <span class="input-label">SubPath</span>
                          <input v-model="mount.subPath" class="input" placeholder="可选" @focus="markFormSource" />
                        </label>
                        <label class="flex min-h-[42px] items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 dark:border-dark-600 dark:text-dark-300">
                          <input v-model="mount.readOnly" type="checkbox" class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" @focus="markFormSource" />
                          只读挂载
                        </label>
                        <div class="flex items-end">
                          <button class="btn btn-secondary btn-sm w-full" type="button" @click="removeVolumeMount(mount.id)">
                            <Icon name="trash" size="sm" />
                            移除
                          </button>
                          <button v-if="mount.type !== 'emptyDir'" class="btn btn-secondary btn-sm w-full" type="button" @click="openRelatedConfigResource(mount.type, mount.id)">
                            <Icon name="plus" size="sm" />
                            新建并选中
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div v-else class="rounded-xl border border-gray-100 px-4 py-6 text-center text-sm text-gray-500 dark:border-dark-700 dark:text-dark-400">
                    当前分类还没有挂载项。
                  </div>

                  <button class="btn btn-secondary btn-sm" type="button" @click="addVolumeMount()">
                    <Icon name="plus" size="sm" />
                    添加 {{ mountPanels.find((panel) => panel.id === activeMountPanel)?.label }} 挂载
                  </button>
                  <button v-if="activeMountPanel !== 'emptyDir'" class="btn btn-secondary btn-sm" type="button" @click="openRelatedConfigResource(activeMountPanel)">
                    <Icon name="plus" size="sm" />
                    创建 {{ mountCreateLabel(activeMountPanel) }}
                  </button>
                </div>
              </section>

              <section v-if="createDefinition.type === 'deployments' && activePodTemplatePanel === 'app' && showLegacyAppSections" class="rounded-xl border border-gray-100 p-4 dark:border-dark-700">
                <div class="mb-4 space-y-3">
                  <button type="button" class="flex w-full items-start justify-between gap-3 text-left" @click="toggleSection('lifecycle')">
                    <span class="min-w-0">
                      <span class="block text-sm font-semibold text-gray-900 dark:text-white">生命周期钩子</span>
                      <span class="block text-xs leading-5 text-gray-500 dark:text-dark-400">配置容器 PostStart / PreStop 钩子；支持 exec 命令或 HTTP GET，默认不生成。</span>
                    </span>
                    <Icon :name="isSectionCollapsed('lifecycle') ? 'chevronDown' : 'chevronUp'" size="sm" class="mt-1 shrink-0 text-gray-400" />
                  </button>
                  <div v-if="!isSectionCollapsed('lifecycle')" class="inline-flex w-full rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-dark-700 dark:bg-dark-900 sm:w-fit">
                    <button
                      v-for="panel in lifecyclePanels"
                      :key="panel.id"
                      type="button"
                      class="flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-all sm:flex-none"
                      :class="segmentButtonClass(activeLifecyclePanel === panel.id)"
                      @click="setLifecyclePanel(panel.id)"
                    >
                      {{ panel.label }}
                    </button>
                  </div>
                </div>

                <div v-if="!isSectionCollapsed('lifecycle')" class="space-y-3">
                  <div class="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-xs leading-5 text-gray-500 dark:border-dark-700 dark:bg-dark-900/40 dark:text-dark-400">
                    {{ lifecyclePanels.find((panel) => panel.id === activeLifecyclePanel)?.help }} 多命令用逗号分隔，例如 `/bin/sh, -c, echo started`。
                  </div>
                  <div v-if="lifecycleList(activeLifecyclePanel).length" class="space-y-3">
                    <div v-for="hook in lifecycleList(activeLifecyclePanel)" :key="hook.id" class="rounded-xl border border-gray-100 p-3 dark:border-dark-700">
                      <div class="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-[160px_minmax(0,1fr)_120px_auto]">
                        <label class="block">
                          <span class="input-label">处理方式</span>
                          <Select v-model="hook.handlerType" :options="[{ label: 'Exec', value: 'exec' }, { label: 'HTTP GET', value: 'httpGet' }]" />
                        </label>
                        <label v-if="hook.handlerType === 'exec'" class="block xl:col-span-2">
                          <span class="input-label">命令</span>
                          <input v-model="hook.command" class="input" placeholder="/bin/sh, -c, echo started" @focus="markFormSource" />
                        </label>
                        <label v-if="hook.handlerType === 'httpGet'" class="block">
                          <span class="input-label">路径</span>
                          <input v-model="hook.path" class="input" placeholder="/hook" @focus="markFormSource" />
                        </label>
                        <label v-if="hook.handlerType === 'httpGet'" class="block">
                          <span class="input-label">端口</span>
                          <input v-model.number="hook.port" class="input" min="1" type="number" @focus="markFormSource" />
                        </label>
                        <div class="flex items-end">
                          <button class="btn btn-secondary btn-sm w-full" type="button" @click="removeLifecycleHook(hook.id)">
                            <Icon name="trash" size="sm" />
                            移除
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div v-else class="rounded-xl border border-gray-100 px-4 py-6 text-center text-sm text-gray-500 dark:border-dark-700 dark:text-dark-400">
                    当前钩子未启用。
                  </div>
                  <button class="btn btn-secondary btn-sm" type="button" @click="ensureLifecycleHook(activeLifecyclePanel)">
                    <Icon name="plus" size="sm" />
                    添加 {{ lifecyclePanels.find((panel) => panel.id === activeLifecyclePanel)?.label }}
                  </button>
                </div>
              </section>

              <section v-if="createDefinition.type === 'deployments'" class="rounded-xl border border-gray-100 p-4 dark:border-dark-700">
                <div class="mb-4 space-y-3">
                  <button type="button" class="flex w-full items-start justify-between gap-3 text-left" @click="toggleSection('pod-security')">
                    <span class="min-w-0">
                      <span class="block text-sm font-semibold text-gray-900 dark:text-white">Pod 安全</span>
                      <span class="block text-xs leading-5 text-gray-500 dark:text-dark-400">身份、Pod securityContext 和容器 securityContext 按 Kubernetes 字段归属分组配置。</span>
                    </span>
                    <Icon :name="isSectionCollapsed('pod-security') ? 'chevronDown' : 'chevronUp'" size="sm" class="mt-1 shrink-0 text-gray-400" />
                  </button>
                  <div v-if="!isSectionCollapsed('pod-security')" class="inline-flex w-full flex-wrap rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-dark-700 dark:bg-dark-900 lg:w-fit">
                    <button
                      v-for="panel in podSecurityPanels"
                      :key="panel.id"
                      type="button"
                      class="flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-all lg:flex-none"
                      :class="segmentButtonClass(activePodSecurityPanel === panel.id)"
                      @click="setPodSecurityPanel(panel.id)"
                    >
                      {{ panel.label }}
                    </button>
                  </div>
                </div>

                <div v-if="!isSectionCollapsed('pod-security')" class="space-y-3">
                  <div class="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-xs leading-5 text-gray-500 dark:border-dark-700 dark:bg-dark-900/40 dark:text-dark-400">
                    {{ podSecurityPanels.find((panel) => panel.id === activePodSecurityPanel)?.help }}
                  </div>
                  <div v-if="activePodSecurityPanel === 'identity'" class="grid gap-3 md:grid-cols-2">
                    <label class="block">
                      <span class="input-label">ServiceAccount</span>
                      <input class="input" :value="createForm.serviceAccountName" placeholder="default" @input="updateTextField('serviceAccountName', $event)" />
                    </label>
                    <label class="block">
                      <span class="input-label">自动挂载 Token</span>
                      <Select
                        :model-value="createForm.automountServiceAccountToken"
                        :options="[{ label: '默认', value: '' }, { label: '开启', value: 'true' }, { label: '关闭', value: 'false' }]"
                        @update:model-value="updateScalarField('automountServiceAccountToken', $event)"
                      />
                      <span class="input-hint">默认不写入 YAML，由集群和 ServiceAccount 默认值决定。</span>
                    </label>
                  </div>
                  <div v-else-if="activePodSecurityPanel === 'pod'" class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <label class="block">
                      <span class="input-label">runAsUser</span>
                      <input class="input" min="0" type="number" :value="createForm.runAsUser ?? ''" placeholder="默认" @input="updateNullableNumberFormField('runAsUser', $event)" />
                    </label>
                    <label class="block">
                      <span class="input-label">runAsGroup</span>
                      <input class="input" min="0" type="number" :value="createForm.runAsGroup ?? ''" placeholder="默认" @input="updateNullableNumberFormField('runAsGroup', $event)" />
                    </label>
                    <label class="block">
                      <span class="input-label">fsGroup</span>
                      <input class="input" min="0" type="number" :value="createForm.fsGroup ?? ''" placeholder="默认" @input="updateNullableNumberFormField('fsGroup', $event)" />
                    </label>
                    <label class="block">
                      <span class="input-label">runAsNonRoot</span>
                      <Select :model-value="createForm.runAsNonRoot" :options="[{ label: '默认', value: '' }, { label: '开启', value: 'true' }, { label: '关闭', value: 'false' }]" @update:model-value="updateScalarField('runAsNonRoot', $event)" />
                    </label>
                    <label class="block">
                      <span class="input-label">seccompProfile</span>
                      <Select :model-value="createForm.seccompProfileType" :options="[{ label: '默认', value: '' }, { label: 'RuntimeDefault', value: 'RuntimeDefault' }, { label: 'Localhost', value: 'Localhost' }, { label: 'Unconfined', value: 'Unconfined' }]" @update:model-value="updateScalarField('seccompProfileType', $event)" />
                    </label>
                    <label class="block">
                      <span class="input-label">localhostProfile</span>
                      <input class="input" :value="createForm.seccompLocalhostProfile" placeholder="profiles/audit.json" :disabled="createForm.seccompProfileType !== 'Localhost'" @input="updateTextField('seccompLocalhostProfile', $event)" />
                    </label>
                  </div>
                  <div v-else class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    <label class="block">
                      <span class="input-label">runAsUser</span>
                      <input class="input" min="0" type="number" :value="createForm.containerRunAsUser ?? ''" placeholder="默认" @input="updateNullableNumberFormField('containerRunAsUser', $event)" />
                    </label>
                    <label class="block">
                      <span class="input-label">runAsGroup</span>
                      <input class="input" min="0" type="number" :value="createForm.containerRunAsGroup ?? ''" placeholder="默认" @input="updateNullableNumberFormField('containerRunAsGroup', $event)" />
                    </label>
                    <label class="block">
                      <span class="input-label">runAsNonRoot</span>
                      <Select :model-value="createForm.containerRunAsNonRoot" :options="[{ label: '默认', value: '' }, { label: '开启', value: 'true' }, { label: '关闭', value: 'false' }]" @update:model-value="updateScalarField('containerRunAsNonRoot', $event)" />
                    </label>
                    <label class="block">
                      <span class="input-label">privileged</span>
                      <Select :model-value="createForm.privileged" :options="[{ label: '默认', value: '' }, { label: '开启', value: 'true' }, { label: '关闭', value: 'false' }]" @update:model-value="updateScalarField('privileged', $event)" />
                    </label>
                    <label class="block">
                      <span class="input-label">allowPrivilegeEscalation</span>
                      <Select :model-value="createForm.allowPrivilegeEscalation" :options="[{ label: '默认', value: '' }, { label: '开启', value: 'true' }, { label: '关闭', value: 'false' }]" @update:model-value="updateScalarField('allowPrivilegeEscalation', $event)" />
                    </label>
                    <label class="block">
                      <span class="input-label">readOnlyRootFilesystem</span>
                      <Select :model-value="createForm.readOnlyRootFilesystem" :options="[{ label: '默认', value: '' }, { label: '开启', value: 'true' }, { label: '关闭', value: 'false' }]" @update:model-value="updateScalarField('readOnlyRootFilesystem', $event)" />
                    </label>
                  </div>
                </div>
              </section>

              <section v-if="createDefinition.type === 'deployments'" class="rounded-xl border border-gray-100 p-4 dark:border-dark-700">
                <div class="mb-4 space-y-3">
                  <button type="button" class="flex w-full items-start justify-between gap-3 text-left" @click="toggleSection('pod-storage')">
                    <span class="min-w-0">
                      <span class="block text-sm font-semibold text-gray-900 dark:text-white">Pod 存储</span>
                      <span class="block text-xs leading-5 text-gray-500 dark:text-dark-400">Pod volumes 支持 ConfigMap、Secret、PVC 和 emptyDir；容器挂载在普通容器 / Init 容器内引用这些卷。</span>
                    </span>
                    <Icon :name="isSectionCollapsed('pod-storage') ? 'chevronDown' : 'chevronUp'" size="sm" class="mt-1 shrink-0 text-gray-400" />
                  </button>
                  <div v-if="!isSectionCollapsed('pod-storage')" class="inline-flex w-full rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-dark-700 dark:bg-dark-900 sm:w-fit">
                    <button
                      v-for="panel in mountPanels"
                      :key="panel.id"
                      type="button"
                      class="flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-all sm:flex-none"
                      :class="segmentButtonClass(activeMountPanel === panel.id)"
                      @click="setMountPanel(panel.id)"
                    >
                      {{ panel.label }}
                    </button>
                  </div>
                </div>

                <div v-if="!isSectionCollapsed('pod-storage')" class="space-y-3">
                  <div class="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-xs leading-5 text-gray-500 dark:border-dark-700 dark:bg-dark-900/40 dark:text-dark-400">
                    {{ mountPanels.find((panel) => panel.id === activeMountPanel)?.help }}。未添加条目时不会写入 volumes / volumeMounts；需要新资源时可在当前弹窗叠加创建并自动选中。
                  </div>

                  <div v-if="mountListByType(activeMountPanel).length" class="space-y-3">
                    <div v-for="mount in mountListByType(activeMountPanel)" :key="mount.id" class="rounded-xl border border-gray-100 p-3 dark:border-dark-700">
                      <div class="grid min-w-0 gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1fr)]">
                        <label class="block">
                          <span class="input-label">Volume 名称</span>
                          <input v-model="mount.name" class="input" placeholder="app-data" @focus="markFormSource" />
                        </label>
                        <div v-if="mount.type !== 'emptyDir'" class="block space-y-2">
                          <span class="input-label">{{ mountSourceLabel(mount.type) }}</span>
                          <Select
                            :model-value="sourceOptions(mount.type).some((option) => option.value === mount.sourceName) ? mount.sourceName : null"
                            :options="sourceOptions(mount.type)"
                            :placeholder="mount.sourceName || '请选择已有资源'"
                            searchable
                            @update:model-value="onMountSourceSelect(mount, $event)"
                          />
                        </div>
                        <label class="block">
                          <span class="input-label">挂载路径</span>
                          <input v-model="mount.mountPath" class="input" :placeholder="mountDefaultPath(mount.type)" @focus="markFormSource" />
                        </label>
                        <label class="block">
                          <span class="input-label">SubPath</span>
                          <input v-model="mount.subPath" class="input" placeholder="可选" @focus="markFormSource" />
                        </label>
                        <label class="flex min-h-[42px] items-center gap-2 rounded-xl border border-gray-200 px-4 py-2.5 text-sm text-gray-700 dark:border-dark-600 dark:text-dark-300">
                          <input v-model="mount.readOnly" type="checkbox" class="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" @focus="markFormSource" />
                          只读挂载
                        </label>
                        <div class="flex items-end gap-2">
                          <button class="btn btn-secondary btn-sm w-full" type="button" @click="removeVolumeMount(mount.id)">
                            <Icon name="trash" size="sm" />
                            移除
                          </button>
                          <button v-if="mount.type !== 'emptyDir'" class="btn btn-secondary btn-sm w-full" type="button" @click="openRelatedConfigResource(mount.type, mount.id)">
                            <Icon name="plus" size="sm" />
                            新建并选中
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div v-else class="rounded-xl border border-gray-100 px-4 py-6 text-center text-sm text-gray-500 dark:border-dark-700 dark:text-dark-400">
                    当前分类还没有挂载项。
                  </div>

                  <button class="btn btn-secondary btn-sm" type="button" @click="addVolumeMount()">
                    <Icon name="plus" size="sm" />
                    添加 {{ mountPanels.find((panel) => panel.id === activeMountPanel)?.label }} 挂载
                  </button>
                  <button v-if="activeMountPanel !== 'emptyDir'" class="btn btn-secondary btn-sm" type="button" @click="openRelatedConfigResource(activeMountPanel)">
                    <Icon name="plus" size="sm" />
                    创建 {{ mountCreateLabel(activeMountPanel) }}
                  </button>
                </div>
              </section>

              <section v-if="createDefinition.type === 'deployments'" class="rounded-xl border border-gray-100 p-4 dark:border-dark-700">
                <div class="mb-4 space-y-3">
                  <button type="button" class="flex w-full items-start justify-between gap-3 text-left" @click="toggleSection('scheduling')">
                    <span class="min-w-0">
                      <span class="block text-sm font-semibold text-gray-900 dark:text-white">Pod 调度策略</span>
                      <span class="block text-xs leading-5 text-gray-500 dark:text-dark-400">调度策略作用于整个 Pod，按节点调度、Pod 调度和容忍分组。</span>
                    </span>
                    <Icon :name="isSectionCollapsed('scheduling') ? 'chevronDown' : 'chevronUp'" size="sm" class="mt-1 shrink-0 text-gray-400" />
                  </button>
                  <div v-if="!isSectionCollapsed('scheduling')" class="inline-flex w-full flex-wrap rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-dark-700 dark:bg-dark-900 lg:w-fit">
                    <button
                      v-for="panel in schedulePanels"
                      :key="panel.id"
                      type="button"
                      class="flex-1 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-semibold transition-all lg:flex-none"
                      :class="segmentButtonClass(activeSchedulePanel === panel.id)"
                      @click="setSchedulePanel(panel.id)"
                    >
                      {{ panel.label }}
                    </button>
                  </div>
                </div>

                <div v-if="!isSectionCollapsed('scheduling')" class="space-y-3">
                  <div class="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-xs leading-5 text-gray-500 dark:border-dark-700 dark:bg-dark-900/40 dark:text-dark-400">
                    {{ schedulePanels.find((panel) => panel.id === activeSchedulePanel)?.help }}
                  </div>

                  <div v-if="activeSchedulePanel === 'node'" class="space-y-4">
                    <div class="space-y-3">
                      <p class="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-dark-500">nodeSelector</p>
                    <div v-for="pair in createForm.nodeSelector" :key="pair.id" class="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto]">
                      <input v-model="pair.key" class="input" placeholder="node label key，例如 topology.kubernetes.io/zone" @focus="markFormSource" />
                      <input v-model="pair.value" class="input" placeholder="value" @focus="markFormSource" />
                      <button class="btn btn-secondary btn-sm" type="button" @click="removePair('nodeSelector', pair.id)">
                        <Icon name="trash" size="sm" />
                      </button>
                    </div>
                    <button class="btn btn-secondary btn-sm" type="button" @click="addPair('nodeSelector')">
                      <Icon name="plus" size="sm" />
                      添加 nodeSelector
                    </button>
                    </div>
                    <div class="space-y-3">
                      <p class="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-dark-500">节点亲和</p>
                    <div v-for="item in createForm.nodeAffinity" :key="item.id" class="grid min-w-0 gap-2 lg:grid-cols-[minmax(240px,1.6fr)_140px_minmax(180px,1fr)_auto]">
                      <input v-model="item.key" class="input" placeholder="topology.kubernetes.io/zone" @focus="markFormSource" />
                      <Select v-model="item.operator" :options="[{ label: 'In', value: 'In' }, { label: 'NotIn', value: 'NotIn' }, { label: 'Exists', value: 'Exists' }, { label: 'DoesNotExist', value: 'DoesNotExist' }]" />
                      <input v-model="item.values" class="input" placeholder="value1, value2" :disabled="['Exists', 'DoesNotExist'].includes(item.operator)" @focus="markFormSource" />
                      <button class="btn btn-secondary btn-sm" type="button" @click="removeNodeAffinity(item.id)">
                        <Icon name="trash" size="sm" />
                      </button>
                    </div>
                    <button class="btn btn-secondary btn-sm" type="button" @click="addNodeAffinity">
                      <Icon name="plus" size="sm" />
                      添加节点亲和
                    </button>
                    </div>
                  </div>

                  <div v-else-if="activeSchedulePanel === 'pod'" class="space-y-4">
                    <div class="space-y-3">
                      <p class="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-dark-500">Pod 亲和</p>
                    <div v-for="item in affinityList('podAffinity')" :key="item.id" class="grid min-w-0 gap-2 lg:grid-cols-[minmax(220px,1.2fr)_minmax(240px,1.4fr)_140px_minmax(180px,1fr)_auto]">
                      <input v-model="item.topologyKey" class="input" placeholder="kubernetes.io/hostname" @focus="markFormSource" />
                      <input v-model="item.labelKey" class="input" placeholder="app.kubernetes.io/name" @focus="markFormSource" />
                      <Select v-model="item.operator" :options="[{ label: 'In', value: 'In' }, { label: 'NotIn', value: 'NotIn' }, { label: 'Exists', value: 'Exists' }, { label: 'DoesNotExist', value: 'DoesNotExist' }]" />
                      <input v-model="item.values" class="input" placeholder="value1, value2" :disabled="['Exists', 'DoesNotExist'].includes(item.operator)" @focus="markFormSource" />
                      <button class="btn btn-secondary btn-sm" type="button" @click="removePodAffinity('podAffinity', item.id)">
                        <Icon name="trash" size="sm" />
                      </button>
                    </div>
                    <button class="btn btn-secondary btn-sm" type="button" @click="addPodAffinity('podAffinity')">
                      <Icon name="plus" size="sm" />
                      添加 Pod 亲和
                    </button>
                    </div>
                    <div class="space-y-3">
                      <p class="text-xs font-semibold uppercase tracking-wide text-gray-400 dark:text-dark-500">Pod 反亲和</p>
                    <div v-for="item in affinityList('podAntiAffinity')" :key="item.id" class="grid min-w-0 gap-2 lg:grid-cols-[minmax(220px,1.2fr)_minmax(240px,1.4fr)_140px_minmax(180px,1fr)_auto]">
                      <input v-model="item.topologyKey" class="input" placeholder="kubernetes.io/hostname" @focus="markFormSource" />
                      <input v-model="item.labelKey" class="input" placeholder="app.kubernetes.io/name" @focus="markFormSource" />
                      <Select v-model="item.operator" :options="[{ label: 'In', value: 'In' }, { label: 'NotIn', value: 'NotIn' }, { label: 'Exists', value: 'Exists' }, { label: 'DoesNotExist', value: 'DoesNotExist' }]" />
                      <input v-model="item.values" class="input" placeholder="value1, value2" :disabled="['Exists', 'DoesNotExist'].includes(item.operator)" @focus="markFormSource" />
                      <button class="btn btn-secondary btn-sm" type="button" @click="removePodAffinity('podAntiAffinity', item.id)">
                        <Icon name="trash" size="sm" />
                      </button>
                    </div>
                    <button class="btn btn-secondary btn-sm" type="button" @click="addPodAffinity('podAntiAffinity')">
                      <Icon name="plus" size="sm" />
                      添加 Pod 反亲和
                    </button>
                    </div>
                  </div>

                  <div v-else class="space-y-3">
                    <div v-for="item in createForm.tolerations" :key="item.id" class="grid min-w-0 gap-2 lg:grid-cols-[minmax(240px,1.5fr)_120px_minmax(180px,1fr)_150px_130px_auto]">
                      <input v-model="item.key" class="input" placeholder="node.kubernetes.io/not-ready" @focus="markFormSource" />
                      <Select v-model="item.operator" :options="[{ label: 'Equal', value: 'Equal' }, { label: 'Exists', value: 'Exists' }]" />
                      <input v-model="item.value" class="input" placeholder="value" :disabled="item.operator === 'Exists'" @focus="markFormSource" />
                      <Select v-model="item.effect" :options="[{ label: '不限制', value: '' }, { label: 'NoSchedule', value: 'NoSchedule' }, { label: 'PreferNoSchedule', value: 'PreferNoSchedule' }, { label: 'NoExecute', value: 'NoExecute' }]" />
                      <input v-model.number="item.tolerationSeconds" class="input" min="0" type="number" placeholder="seconds" :disabled="item.effect !== 'NoExecute'" @focus="markFormSource" />
                      <button class="btn btn-secondary btn-sm" type="button" @click="removeToleration(item.id)">
                        <Icon name="trash" size="sm" />
                      </button>
                    </div>
                    <button class="btn btn-secondary btn-sm" type="button" @click="addToleration">
                      <Icon name="plus" size="sm" />
                      添加容忍
                    </button>
                  </div>
                </div>
              </section>
            </div>

            <div class="min-w-0 space-y-3">
              <div v-if="createDefinition.type === 'deployments'" class="space-y-3 rounded-xl border border-gray-100 p-3 dark:border-dark-700">
                <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <span class="input-label">YAML 模板</span>
                    <p class="text-xs text-gray-500 dark:text-dark-400">选择常用模板后会回填表单并重新生成 YAML。</p>
                  </div>
                  <Select
                    :model-value="activeYamlTemplate"
                    :options="yamlTemplates.map((template) => ({ label: template.label, value: template.id }))"
                    @update:model-value="applyYamlTemplate"
                  />
                </div>
                <p class="rounded-lg bg-gray-50 px-3 py-2 text-xs leading-5 text-gray-500 dark:bg-dark-900/50 dark:text-dark-400">
                  {{ yamlTemplates.find((template) => template.id === activeYamlTemplate)?.description }}
                </p>
                <p class="text-xs leading-5 text-gray-500 dark:text-dark-400">
                  模板用于快速填充起始字段，不会锁定名称和镜像；如果你已经手动改过镜像，再切模板会保留当前镜像。
                </p>
              </div>

              <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div>
                  <span class="input-label">YAML</span>
                  <span class="text-xs" :class="yamlParseError ? 'text-red-500' : 'text-gray-400 dark:text-dark-500'">
                    {{ yamlParseError || (createMode === 'form' ? '随表单实时生成，可切到 YAML 直接编辑' : 'YAML 变更会尝试回填表单') }}
                  </span>
                </div>
                <div class="flex items-center gap-2">
                  <span class="text-xs text-gray-500 dark:text-dark-400">字号</span>
                  <span
                    class="rounded-full border px-3 py-1 text-xs font-medium"
                    :class="validationStatusClass(yamlSyntaxStatus().status)"
                  >
                    {{ yamlSyntaxStatus().text }}
                  </span>
                  <div class="inline-flex rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-dark-700 dark:bg-dark-900">
                    <button
                      v-for="size in [12, 13, 14, 16]"
                      :key="size"
                      type="button"
                      class="rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all"
                      :class="segmentButtonClass(yamlFontSize === size)"
                      @click="setYamlFontSize(size)"
                    >
                      {{ size }}
                    </button>
                  </div>
                </div>
              </div>
              <div v-if="yamlValidationItems.some((item) => item.status === 'warning' || item.status === 'error')" class="flex flex-wrap gap-2">
                <span
                  v-for="item in yamlValidationItems.filter((item) => item.status === 'warning' || item.status === 'error')"
                  :key="item.text"
                  class="rounded-full border px-3 py-1 text-xs font-medium"
                  :class="validationStatusClass(item.status)"
                >
                  {{ item.text }}
                </span>
              </div>
              <div class="yaml-editor-shell">
                <pre
                  class="yaml-highlight-layer"
                  :style="{ fontSize: `${yamlFontSize}px` }"
                  v-html="highlightedYaml"
                ></pre>
                <textarea
                  ref="yamlTextareaRef"
                  class="yaml-editor-input"
                  :style="{ fontSize: `${yamlFontSize}px` }"
                  :value="formState.yaml"
                  spellcheck="false"
                  @input="onYamlInput"
                ></textarea>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="space-y-4">
          <div v-if="editMode === 'create' && !hasCreateSchema" class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
            当前资源暂未配置表单 schema，先使用 YAML 创建；后续可以按同一机制扩展到此资源。
          </div>
          <div v-if="formErrors.length" class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
            <p v-for="error in formErrors" :key="error">{{ error }}</p>
          </div>
          <label class="block">
            <span class="input-label">名称</span>
            <input v-model="formState.name" class="input" :disabled="editMode === 'edit'" placeholder="resource-name" />
          </label>
          <label v-if="createDefinition.namespaced" class="block">
            <span class="input-label">Namespace</span>
            <input v-model="formState.namespace" class="input" placeholder="default" />
          </label>
          <label class="block">
            <span class="input-label">YAML</span>
            <textarea :value="formState.yaml" class="input min-h-80 font-mono text-xs" spellcheck="false" @input="onRawYamlInput"></textarea>
          </label>
          <p v-if="yamlParseError" class="text-sm text-red-600 dark:text-red-300">{{ yamlParseError }}</p>
        </div>

        <div class="flex justify-end gap-2">
          <button class="btn btn-secondary" type="button" @click="closeEditDialog">取消</button>
          <button class="btn btn-primary" type="submit">提交</button>
        </div>
      </form>
    </BaseDialog>

    <BaseDialog
      :show="relatedDialogOpen"
      :title="`创建 ${relatedDefinition.title}`"
      width="wide"
      :z-index="60"
      @close="closeRelatedDialog"
    >
      <form class="space-y-4" @submit.prevent="submitRelatedForm">
        <div class="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-6 text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/30 dark:text-blue-300">
          在当前 Deployment 表单上叠加创建 {{ relatedDefinition.title }}；取消会回到原表单，创建成功后会自动选中到挂载配置。
        </div>

        <div class="flex flex-col gap-3 rounded-xl border border-gray-200 p-3 dark:border-dark-700 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p class="text-sm font-semibold text-gray-900 dark:text-white">{{ relatedCreateSchema?.title }}</p>
            <p class="text-xs leading-5 text-gray-500 dark:text-dark-400">{{ relatedCreateSchema?.summary }}</p>
          </div>
          <div class="inline-flex w-full rounded-xl border border-gray-200 bg-gray-100 p-1 dark:border-dark-700 dark:bg-dark-900 sm:w-fit">
            <button
              type="button"
              class="flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-all sm:flex-none"
              :class="segmentButtonClass(relatedCreateMode === 'form')"
              @click="setRelatedCreateMode('form')"
            >
              表单创建
            </button>
            <button
              type="button"
              class="flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-all sm:flex-none"
              :class="segmentButtonClass(relatedCreateMode === 'yaml')"
              @click="setRelatedCreateMode('yaml')"
            >
              YAML 编辑
            </button>
          </div>
        </div>

        <div v-if="relatedFormErrors.length" class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          <p v-for="error in relatedFormErrors" :key="error">{{ error }}</p>
        </div>

        <div class="grid gap-4 lg:grid-cols-[minmax(0,0.95fr)_minmax(360px,1.05fr)]">
          <div class="space-y-4">
            <section v-for="section in relatedCreateSchema?.sections" :key="section.title" class="rounded-xl border border-gray-100 p-4 dark:border-dark-700">
              <h3 class="mb-4 text-sm font-semibold text-gray-900 dark:text-white">{{ section.title }}</h3>
              <div class="space-y-4">
                <div v-for="field in section.fields" :key="field.key" class="space-y-2">
                  <div class="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <span class="input-label">
                      {{ field.label }}
                      <span v-if="field.required" class="text-red-500">*</span>
                    </span>
                    <span v-if="field.help" class="text-xs text-gray-400 dark:text-dark-500">{{ field.help }}</span>
                  </div>

                  <input
                    v-if="field.type === 'text'"
                    class="input"
                    :placeholder="field.placeholder"
                    :value="relatedScalarValue(field.key)"
                    @input="updateRelatedTextField(field.key, $event)"
                  />

                  <Select
                    v-else-if="field.type === 'select'"
                    :model-value="relatedScalarValue(field.key)"
                    :options="fieldOptions(field)"
                    @update:model-value="updateRelatedScalarField(field.key, $event)"
                  />

                  <div v-else-if="field.type === 'keyValue' || field.type === 'configData' || field.type === 'secretData'" class="space-y-2">
                    <div v-for="pair in relatedPairList(field.key)" :key="pair.id" class="grid min-w-0 gap-2 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)_auto]">
                      <input v-model="pair.key" class="input" placeholder="key" />
                      <input
                        v-model="pair.value"
                        class="input"
                        :type="field.type === 'secretData' ? 'password' : 'text'"
                        placeholder="value"
                      />
                      <button class="btn btn-secondary btn-sm" type="button" @click="removeRelatedPair(field.key, pair.id)">
                        <Icon name="trash" size="sm" />
                      </button>
                    </div>
                    <button class="btn btn-secondary btn-sm" type="button" @click="addRelatedPair(field.key)">
                      <Icon name="plus" size="sm" />
                      添加
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <div class="space-y-3">
            <div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <span class="input-label">YAML</span>
                <span class="text-xs" :class="relatedYamlParseError ? 'text-red-500' : 'text-gray-400 dark:text-dark-500'">
                  {{ relatedYamlParseError || (relatedCreateMode === 'form' ? '随表单实时生成' : 'YAML 变更会尝试回填表单') }}
                </span>
              </div>
            </div>
            <textarea
              class="input min-h-[420px] resize-y font-mono leading-6"
              :style="{ fontSize: `${yamlFontSize}px` }"
              :value="relatedFormState.yaml"
              spellcheck="false"
              @input="onRelatedYamlInput"
            ></textarea>
          </div>
        </div>

        <div class="flex justify-end gap-2">
          <button class="btn btn-secondary" type="button" @click="closeRelatedDialog">取消</button>
          <button class="btn btn-primary" type="submit">创建并回填</button>
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
