import type {
  AuditLogEntry,
  ClusterCredentialFormContract,
  ClusterSummary,
  ContainerStatusView,
  CurrentUser,
  DashboardStatus,
  HighRiskActionId,
  HighRiskConfirmMetadata,
  KubeEvent,
  NamespaceSummary,
  PageResult,
  PermissionMatrix,
  PodLogLine,
  ResourceActionAvailability,
  ResourceActionId,
  ResourceDefinition,
  ResourceDetail,
  ResourceGraph,
  ResourceListQuery,
  ResourceScope,
  ResourceSummary,
  SearchResourceResult,
  SettingsAccessView,
  ShellContext,
  StatusTone
} from './kubeTypes'

export interface MetricItem {
  label: string
  value: string
  trend: string
  tone: 'primary' | 'success' | 'warning' | 'danger'
}

export interface RecordItem {
  id: string
  title: string
  owner: string
  status: '待处理' | '进行中' | '已完成'
  updatedAt: string
}

export const metrics: MetricItem[] = [
  {
    label: '集群健康',
    value: '正常',
    trend: '3/3 节点就绪',
    tone: 'success'
  },
  {
    label: '运行 Pod',
    value: '42',
    trend: '+6 今日变更',
    tone: 'primary'
  },
  {
    label: '告警事件',
    value: '2',
    trend: 'Metrics 降级',
    tone: 'warning'
  },
  {
    label: '高危待审计',
    value: '5',
    trend: '24 小时内',
    tone: 'danger'
  }
]

export const records: RecordItem[] = [
  {
    id: 'pod/api-server-7db6f89f8c-r4l8z',
    title: 'api-server-7db6f89f8c-r4l8z',
    owner: 'platform / Deployment',
    status: '进行中',
    updatedAt: '2026-05-27 09:42'
  },
  {
    id: 'deploy/web-console',
    title: 'web-console',
    owner: 'platform / Deployment',
    status: '已完成',
    updatedAt: '2026-05-27 09:30'
  },
  {
    id: 'node/worker-02',
    title: 'worker-02',
    owner: 'cluster / Node',
    status: '待处理',
    updatedAt: '2026-05-27 08:58'
  }
]

const now = '2026-05-27T10:00:00+08:00'
const defaultClusterId = 'cluster-prod'
const defaultNamespace = 'platform'
const allNamespacesValue = 'all-namespaces'

const namespacedActions: ResourceActionAvailability[] = [
  { id: 'view', label: '查看详情', enabled: true, highRisk: false },
  { id: 'yaml', label: '查看 YAML', enabled: true, highRisk: false },
  { id: 'create', label: '创建', enabled: true, highRisk: false },
  { id: 'edit', label: '编辑', enabled: true, highRisk: false },
  {
    id: 'delete',
    label: '删除',
    enabled: true,
    highRisk: true,
    confirm: buildConfirm('resource.delete', 'resource')
  }
]

const readOnlyActions: ResourceActionAvailability[] = [
  { id: 'view', label: '查看详情', enabled: true, highRisk: false },
  { id: 'yaml', label: '查看 YAML', enabled: true, highRisk: false }
]

const workloadActions: ResourceActionAvailability[] = [
  ...namespacedActions,
  {
    id: 'scale',
    label: '扩缩容',
    enabled: true,
    highRisk: true,
    confirm: buildConfirm('workload.scale', 'workload')
  },
  {
    id: 'restart',
    label: '重启',
    enabled: true,
    highRisk: true,
    confirm: buildConfirm('workload.restart', 'workload')
  },
  {
    id: 'setImage',
    label: '更新镜像',
    enabled: true,
    highRisk: true,
    confirm: buildConfirm('workload.setImage', 'workload')
  },
  { id: 'rolloutStatus', label: '滚动状态', enabled: true, highRisk: false },
  {
    id: 'rollback',
    label: '回滚',
    enabled: true,
    highRisk: true,
    confirm: buildConfirm('workload.rollback', 'workload')
  }
]

const podActions: ResourceActionAvailability[] = [
  { id: 'view', label: '查看详情', enabled: true, highRisk: false },
  { id: 'yaml', label: '查看 YAML', enabled: true, highRisk: false },
  { id: 'logs', label: '日志', enabled: true, highRisk: false },
  {
    id: 'exec',
    label: '终端',
    enabled: true,
    highRisk: true,
    confirm: buildConfirm('pod.exec', 'pod')
  },
  {
    id: 'delete',
    label: '删除',
    enabled: true,
    highRisk: true,
    confirm: buildConfirm('pod.delete', 'pod')
  }
]

const nodeActions: ResourceActionAvailability[] = [
  { id: 'view', label: '查看详情', enabled: true, highRisk: false },
  { id: 'yaml', label: '查看 YAML', enabled: true, highRisk: false },
  {
    id: 'drain',
    label: 'Drain',
    enabled: true,
    highRisk: true,
    confirm: buildConfirm('node.drain', 'node')
  },
  {
    id: 'cordon',
    label: 'Cordon',
    enabled: true,
    highRisk: true,
    confirm: buildConfirm('node.cordon', 'node')
  },
  {
    id: 'uncordon',
    label: 'Uncordon',
    enabled: true,
    highRisk: true,
    confirm: buildConfirm('node.uncordon', 'node')
  }
]

const secretActions: ResourceActionAvailability[] = [
  ...namespacedActions,
  {
    id: 'reveal',
    label: '查看明文',
    enabled: true,
    highRisk: true,
    confirm: buildConfirm('secret.reveal', 'secret')
  }
]

const eventActions: ResourceActionAvailability[] = [
  { id: 'view', label: '查看详情', enabled: true, highRisk: false },
  {
    id: 'yaml',
    label: '查看 YAML',
    enabled: false,
    highRisk: false,
    reason: 'Event 以审计和排障查看为主，当前禁用 YAML 写操作'
  }
]

const clusterScopedActions: ResourceActionAvailability[] = [
  { id: 'view', label: '查看详情', enabled: true, highRisk: false },
  { id: 'yaml', label: '查看 YAML', enabled: true, highRisk: false },
  { id: 'create', label: '创建', enabled: true, highRisk: false },
  { id: 'edit', label: '编辑', enabled: true, highRisk: false },
  {
    id: 'delete',
    label: '删除',
    enabled: true,
    highRisk: true,
    confirm: buildConfirm('resource.delete', 'resource')
  }
]

const namespaceActions: ResourceActionAvailability[] = [
  { id: 'view', label: '查看详情', enabled: true, highRisk: false },
  { id: 'yaml', label: '查看 YAML', enabled: true, highRisk: false },
  { id: 'create', label: '创建', enabled: true, highRisk: false },
  { id: 'edit', label: '编辑', enabled: true, highRisk: false },
  {
    id: 'delete',
    label: '删除',
    enabled: true,
    highRisk: true,
    confirm: buildConfirm('namespace.delete', 'namespace')
  }
]

const rbacActions: ResourceActionAvailability[] = clusterScopedActions.map((action) =>
  action.id === 'delete'
    ? {
      ...action,
      confirm: buildConfirm('rbac.update', 'rbac')
    }
    : action
)

export const kubeClusters: ClusterSummary[] = [
  {
    id: defaultClusterId,
    name: 'prod-east',
    apiServer: 'https://10.12.0.10:6443',
    status: 'healthy',
    statusText: '连接正常',
    kubernetesVersion: 'v1.29.4',
    credentialType: 'kubeconfig',
    credentialSummary: 'kubeconfig: prod-admin / **** / 2026-05-27 更新',
    description: '生产东区集群，承载平台与业务系统。',
    metricsAvailable: false,
    current: true,
    createdAt: '2026-05-20T09:00:00+08:00',
    updatedAt: '2026-05-27T09:30:00+08:00',
    lastConnectedAt: '2026-05-27T09:59:20+08:00',
    nodeCount: 3,
    namespaceCount: 6
  },
  {
    id: 'cluster-staging',
    name: 'staging',
    apiServer: 'https://10.13.0.10:6443',
    status: 'degraded',
    statusText: 'Metrics API 不可用',
    kubernetesVersion: 'v1.28.8',
    credentialType: 'serviceAccountToken',
    credentialSummary: 'ServiceAccount: kube-subops / token ****9921',
    description: '预发布集群，用于灰度和演练。',
    metricsAvailable: false,
    current: false,
    createdAt: '2026-05-21T11:00:00+08:00',
    updatedAt: '2026-05-27T09:20:00+08:00',
    lastConnectedAt: '2026-05-27T09:48:10+08:00',
    nodeCount: 2,
    namespaceCount: 4
  }
]

export const kubeNamespaces: Record<string, NamespaceSummary[]> = {
  [defaultClusterId]: [
    {
      name: allNamespacesValue,
      status: 'Active',
      labels: {},
      age: '-'
    },
    {
      name: 'platform',
      status: 'Active',
      labels: { team: 'platform', env: 'prod' },
      age: '28d',
      quota: {
        cpuRequests: '18 / 32 cores',
        memoryRequests: '46 / 96 Gi',
        pods: '42 / 120'
      }
    },
    {
      name: 'payments',
      status: 'Active',
      labels: { team: 'payments', env: 'prod' },
      age: '19d'
    },
    {
      name: 'observability',
      status: 'Active',
      labels: { team: 'sre', env: 'prod' },
      age: '31d'
    },
    {
      name: 'default',
      status: 'Active',
      labels: {},
      age: '31d'
    }
  ],
  'cluster-staging': [
    {
      name: allNamespacesValue,
      status: 'Active',
      labels: {},
      age: '-'
    },
    {
      name: 'platform',
      status: 'Active',
      labels: { team: 'platform', env: 'staging' },
      age: '16d'
    },
    {
      name: 'sandbox',
      status: 'Active',
      labels: { team: 'sre', env: 'staging' },
      age: '16d'
    }
  ]
}

export const currentUser: CurrentUser = {
  id: 'user-admin',
  username: 'admin',
  displayName: '平台管理员',
  email: 'admin@example.local',
  roleNames: ['平台管理员', 'SRE 运维'],
  permissions: [
    'clusters:view',
    'clusters:manage',
    'resources:view',
    'resources:write',
    'resources:delete',
    'workloads:operate',
    'pods:logs',
    'pods:exec',
    'nodes:operate',
    'secrets:reveal',
    'rbac:manage',
    'audit:view',
    'settings:manage'
  ],
  preferredClusterId: defaultClusterId,
  preferredNamespace: defaultNamespace,
  accessibleClusters: kubeClusters.map((cluster) => cluster.id),
  accessibleNamespaces: {
    [defaultClusterId]: ['platform', 'payments', 'observability', 'default'],
    'cluster-staging': ['platform', 'sandbox']
  }
}

export const permissionMatrix: PermissionMatrix = {
  canManageClusters: true,
  canManageSettings: true,
  canViewAuditLogs: true,
  resourcePermissions: {
    '*': ['view', 'yaml', 'create', 'edit', 'delete'],
    pods: ['view', 'yaml', 'delete', 'logs', 'exec'],
    deployments: ['view', 'yaml', 'create', 'edit', 'delete', 'scale', 'restart', 'setImage', 'rolloutStatus', 'rollback'],
    statefulsets: ['view', 'yaml', 'create', 'edit', 'delete', 'scale', 'restart', 'setImage', 'rolloutStatus', 'rollback'],
    daemonsets: ['view', 'yaml', 'create', 'edit', 'delete', 'restart', 'setImage', 'rolloutStatus', 'rollback'],
    replicasets: ['view', 'yaml', 'create', 'edit', 'delete', 'scale', 'rolloutStatus'],
    jobs: ['view', 'yaml', 'create', 'edit', 'delete'],
    cronjobs: ['view', 'yaml', 'create', 'edit', 'delete'],
    secrets: ['view', 'yaml', 'create', 'edit', 'delete', 'reveal'],
    nodes: ['view', 'yaml', 'drain', 'cordon', 'uncordon'],
    events: ['view'],
    namespaces: ['view', 'yaml', 'create', 'edit', 'delete']
  }
}

const commonColumns = [
  { key: 'name', label: '名称', sortable: true },
  { key: 'namespace', label: 'Namespace', sortable: true },
  { key: 'status', label: '状态', sortable: true },
  { key: 'age', label: '年龄', sortable: true },
  { key: 'actions', label: '操作' }
]

const clusterColumns = commonColumns.filter((column) => column.key !== 'namespace')

const namespaceFilter = {
  key: 'namespace',
  label: 'Namespace',
  type: 'namespace' as const
}

const commonFilters = [
  namespaceFilter,
  { key: 'name', label: '名称', type: 'text' as const },
  { key: 'labels', label: '标签选择器', type: 'labelSelector' as const },
  {
    key: 'status',
    label: '状态',
    type: 'select' as const,
    options: [
      { label: '全部状态', value: '' },
      { label: '健康', value: 'healthy' },
      { label: '运行中', value: 'running' },
      { label: '异常', value: 'warning' },
      { label: '失败', value: 'failed' }
    ]
  }
]

const clusterFilters = commonFilters.filter((filter) => filter.key !== 'namespace')

export const resourceDefinitions: ResourceDefinition[] = [
  defineResource('pods', 'Pod', 'v1', 'Pod', '/pods', 'pod', 'Namespaced', 'P0', podActions, [
    ...commonColumns,
    { key: 'ready', label: 'Ready', sortable: true },
    { key: 'restarts', label: '重启', sortable: true },
    { key: 'nodeName', label: 'Node', sortable: true }
  ]),
  defineResource('deployments', 'Deployment', 'apps/v1', 'Deployment', '/workloads/deployments', 'workloads', 'Namespaced', 'P0', workloadActions, [
    ...commonColumns,
    { key: 'ready', label: 'Ready', sortable: true },
    { key: 'images', label: '镜像' }
  ]),
  defineResource('statefulsets', 'StatefulSet', 'apps/v1', 'StatefulSet', '/workloads/statefulsets', 'workloads', 'Namespaced', 'P0', workloadActions),
  defineResource('daemonsets', 'DaemonSet', 'apps/v1', 'DaemonSet', '/workloads/daemonsets', 'workloads', 'Namespaced', 'P0', disableActions(workloadActions, ['scale'], 'DaemonSet 不支持手动扩缩容')),
  defineResource('replicasets', 'ReplicaSet', 'apps/v1', 'ReplicaSet', '/workloads/replicasets', 'workloads', 'Namespaced', 'P0', disableActions(workloadActions, ['setImage', 'rollback'], 'ReplicaSet 回滚以关联 Deployment 为准')),
  defineResource('jobs', 'Job', 'batch/v1', 'Job', '/workloads/jobs', 'workloads', 'Namespaced', 'P0', disableActions(workloadActions, ['scale', 'restart', 'setImage', 'rolloutStatus', 'rollback'], 'Job 不适用工作负载滚动操作')),
  defineResource('cronjobs', 'CronJob', 'batch/v1', 'CronJob', '/workloads/cronjobs', 'workloads', 'Namespaced', 'P0', disableActions(workloadActions, ['scale', 'restart', 'setImage', 'rolloutStatus', 'rollback'], 'CronJob 通过调度配置触发 Job')),
  defineResource('services', 'Service', 'v1', 'Service', '/network/services', 'network', 'Namespaced', 'P0', namespacedActions),
  defineResource('ingresses', 'Ingress', 'networking.k8s.io/v1', 'Ingress', '/network/ingresses', 'network', 'Namespaced', 'P0', namespacedActions),
  defineResource('endpoints', 'Endpoint', 'v1', 'Endpoint', '/network/endpoints', 'network', 'Namespaced', 'P1', namespacedActions),
  defineResource('endpoint-slices', 'EndpointSlice', 'discovery.k8s.io/v1', 'EndpointSlice', '/network/endpoint-slices', 'network', 'Namespaced', 'P1', namespacedActions),
  defineResource('network-policies', 'NetworkPolicy', 'networking.k8s.io/v1', 'NetworkPolicy', '/network/network-policies', 'network', 'Namespaced', 'P1', namespacedActions),
  defineResource('configmaps', 'ConfigMap', 'v1', 'ConfigMap', '/config/configmaps', 'config', 'Namespaced', 'P0', namespacedActions),
  defineResource('secrets', 'Secret', 'v1', 'Secret', '/config/secrets', 'config', 'Namespaced', 'P0', secretActions),
  defineResource('storage-classes', 'StorageClass', 'storage.k8s.io/v1', 'StorageClass', '/storage/storage-classes', 'storage', 'Cluster', 'P1', clusterScopedActions, clusterColumns, clusterFilters),
  defineResource('persistent-volumes', 'PersistentVolume', 'v1', 'PersistentVolume', '/storage/persistent-volumes', 'storage', 'Cluster', 'P1', clusterScopedActions, clusterColumns, clusterFilters),
  defineResource('persistent-volume-claims', 'PersistentVolumeClaim', 'v1', 'PersistentVolumeClaim', '/storage/persistent-volume-claims', 'storage', 'Namespaced', 'P1', namespacedActions),
  defineResource('service-accounts', 'ServiceAccount', 'v1', 'ServiceAccount', '/access/service-accounts', 'access', 'Namespaced', 'P1', namespacedActions),
  defineResource('roles', 'Role', 'rbac.authorization.k8s.io/v1', 'Role', '/access/roles', 'access', 'Namespaced', 'P1', rbacActions),
  defineResource('cluster-roles', 'ClusterRole', 'rbac.authorization.k8s.io/v1', 'ClusterRole', '/access/cluster-roles', 'access', 'Cluster', 'P1', rbacActions, clusterColumns, clusterFilters),
  defineResource('role-bindings', 'RoleBinding', 'rbac.authorization.k8s.io/v1', 'RoleBinding', '/access/role-bindings', 'access', 'Namespaced', 'P1', rbacActions),
  defineResource('cluster-role-bindings', 'ClusterRoleBinding', 'rbac.authorization.k8s.io/v1', 'ClusterRoleBinding', '/access/cluster-role-bindings', 'access', 'Cluster', 'P1', rbacActions, clusterColumns, clusterFilters),
  defineResource('nodes', 'Node', 'v1', 'Node', '/other/nodes', 'other', 'Cluster', 'P0', nodeActions, [
    { key: 'name', label: '名称', sortable: true },
    { key: 'status', label: '状态', sortable: true },
    { key: 'capacity', label: '容量' },
    { key: 'age', label: '年龄', sortable: true },
    { key: 'actions', label: '操作' }
  ], clusterFilters),
  defineResource('namespaces', 'Namespace', 'v1', 'Namespace', '/other/namespaces', 'other', 'Cluster', 'P0', namespaceActions, clusterColumns, clusterFilters),
  defineResource('events', 'Event', 'events.k8s.io/v1', 'Event', '/other/events', 'other', 'Namespaced', 'P1', eventActions, [
    { key: 'type', label: '类型', sortable: true },
    { key: 'reason', label: '原因', sortable: true },
    { key: 'involvedObject', label: '对象' },
    { key: 'message', label: '消息' },
    { key: 'lastTimestamp', label: '最后发生', sortable: true }
  ])
]

export const kubeResourceSummaries: ResourceSummary[] = [
  resource('pods', 'api-server-7db6f89f8c-r4l8z', 'platform', 'Running', '2/2', 'worker-01', {
    ready: '2/2',
    restarts: 1,
    podIP: '10.42.1.18',
    images: ['ghcr.io/example/api-server:v1.0.0'],
    details: { cpu: '220m', memory: '410Mi', owner: 'Deployment/api-server' },
    ownerReferences: [{ kind: 'ReplicaSet', name: 'api-server-7db6f89f8c', resourceType: 'replicasets' }],
    actions: podActions
  }),
  resource('pods', 'web-console-56fcd7d7c8-7p9vx', 'platform', 'Running', '1/1', 'worker-02', {
    ready: '1/1',
    restarts: 0,
    podIP: '10.42.2.33',
    images: ['ghcr.io/example/web-console:v1.0.0'],
    details: { cpu: '80m', memory: '180Mi', owner: 'Deployment/web-console' },
    ownerReferences: [{ kind: 'ReplicaSet', name: 'web-console-56fcd7d7c8', resourceType: 'replicasets' }],
    actions: podActions
  }),
  resource('pods', 'payment-worker-0', 'payments', 'CrashLoopBackOff', '0/1', 'worker-02', {
    ready: '0/1',
    restarts: 8,
    podIP: '10.42.2.41',
    images: ['ghcr.io/example/payment-worker:v0.9.2'],
    details: { cpu: '30m', memory: '96Mi', owner: 'StatefulSet/payment-worker' },
    ownerReferences: [{ kind: 'StatefulSet', name: 'payment-worker', resourceType: 'statefulsets' }],
    actions: podActions
  }),
  resource('deployments', 'api-server', 'platform', 'Available', '3/3', undefined, {
    ready: '3/3',
    images: ['ghcr.io/example/api-server:v1.0.0'],
    details: { replicas: 3, strategy: 'RollingUpdate', selector: 'app=api-server' },
    actions: workloadActions
  }),
  resource('deployments', 'web-console', 'platform', 'Available', '2/2', undefined, {
    ready: '2/2',
    images: ['ghcr.io/example/web-console:v1.0.0'],
    details: { replicas: 2, strategy: 'RollingUpdate', selector: 'app=web-console' },
    actions: workloadActions
  }),
  resource('statefulsets', 'payment-worker', 'payments', 'Degraded', '0/1', undefined, {
    ready: '0/1',
    images: ['ghcr.io/example/payment-worker:v0.9.2'],
    details: { replicas: 1, serviceName: 'payment-worker', updateStrategy: 'RollingUpdate' },
    actions: workloadActions
  }),
  resource('daemonsets', 'node-exporter', 'observability', 'Available', '3/3', undefined, {
    ready: '3/3',
    images: ['quay.io/prometheus/node-exporter:v1.8.1'],
    details: { desired: 3, current: 3, ready: 3 },
    actions: disableActions(workloadActions, ['scale'], 'DaemonSet 不支持手动扩缩容')
  }),
  resource('replicasets', 'api-server-7db6f89f8c', 'platform', 'Available', '3/3', undefined, {
    ready: '3/3',
    images: ['ghcr.io/example/api-server:v1.0.0'],
    ownerReferences: [{ kind: 'Deployment', name: 'api-server', resourceType: 'deployments' }],
    details: { replicas: 3, selector: 'app=api-server,pod-template-hash=7db6f89f8c' },
    actions: disableActions(workloadActions, ['setImage', 'rollback'], 'ReplicaSet 回滚以关联 Deployment 为准')
  }),
  resource('jobs', 'db-migration-20260527', 'platform', 'Complete', '1/1', undefined, {
    ready: '1/1',
    details: { completions: 1, duration: '38s' },
    actions: disableActions(workloadActions, ['scale', 'restart', 'setImage', 'rolloutStatus', 'rollback'], 'Job 不适用工作负载滚动操作')
  }),
  resource('cronjobs', 'audit-retention-cleanup', 'platform', 'Active', '0/1', undefined, {
    details: { schedule: '0 2 * * *', suspend: false, lastSchedule: '2026-05-27 02:00' },
    actions: disableActions(workloadActions, ['scale', 'restart', 'setImage', 'rolloutStatus', 'rollback'], 'CronJob 通过调度配置触发 Job')
  }),
  resource('services', 'api-server', 'platform', 'Active', 'ClusterIP', undefined, {
    details: { type: 'ClusterIP', clusterIP: '10.96.12.11', ports: '8080/TCP' },
    actions: namespacedActions
  }),
  resource('services', 'web-console', 'platform', 'Active', 'ClusterIP', undefined, {
    details: { type: 'ClusterIP', clusterIP: '10.96.18.24', ports: '80/TCP' },
    actions: namespacedActions
  }),
  resource('ingresses', 'web-console', 'platform', 'Ready', '1 rule', undefined, {
    details: { className: 'nginx', host: 'kube-subops.example.local', address: '10.12.0.100' },
    actions: namespacedActions
  }),
  resource('endpoints', 'api-server', 'platform', 'Ready', '3 addresses', undefined, {
    details: { subsets: 1, addresses: '10.42.1.18,10.42.2.19,10.42.3.20' },
    actions: namespacedActions
  }),
  resource('endpoint-slices', 'api-server-m8fxp', 'platform', 'Ready', '3 endpoints', undefined, {
    details: { addressType: 'IPv4', ports: '8080', endpoints: 3 },
    actions: namespacedActions
  }),
  resource('network-policies', 'default-deny', 'platform', 'Active', 'Ingress/Egress', undefined, {
    details: { podSelector: 'all', policyTypes: 'Ingress,Egress' },
    actions: namespacedActions
  }),
  resource('configmaps', 'web-console-config', 'platform', 'Active', '6 keys', undefined, {
    details: { keys: 'APP_ENV,API_BASE_URL,MOCK_ENABLED', immutable: false },
    actions: namespacedActions
  }),
  resource('secrets', 'cluster-prod-credential', 'platform', 'Active', 'Opaque', undefined, {
    details: { type: 'Opaque', keys: 'kubeconfig.enc,checksum', secretDataVisible: false },
    actions: secretActions
  }),
  resource('storage-classes', 'fast-ssd', undefined, 'Active', 'Default', undefined, {
    details: { provisioner: 'kubernetes.io/no-provisioner', reclaimPolicy: 'Retain', volumeBindingMode: 'WaitForFirstConsumer' },
    actions: clusterScopedActions
  }),
  resource('persistent-volumes', 'pv-platform-data', undefined, 'Bound', '200Gi', undefined, {
    capacity: '200Gi',
    accessModes: ['ReadWriteOnce'],
    storageClass: 'fast-ssd',
    details: { claim: 'platform/kube-subops-data', reclaimPolicy: 'Retain' },
    actions: clusterScopedActions
  }),
  resource('persistent-volume-claims', 'kube-subops-data', 'platform', 'Bound', '200Gi', undefined, {
    capacity: '200Gi',
    accessModes: ['ReadWriteOnce'],
    storageClass: 'fast-ssd',
    details: { volume: 'pv-platform-data', used: '78Gi' },
    actions: namespacedActions
  }),
  resource('service-accounts', 'kube-subops', 'platform', 'Active', '2 secrets', undefined, {
    details: { automount: true, secrets: 2 },
    actions: namespacedActions
  }),
  resource('roles', 'namespace-operator', 'platform', 'Active', '18 rules', undefined, {
    details: { rules: 18, subjects: 'SRE 运维' },
    actions: rbacActions
  }),
  resource('cluster-roles', 'cluster-readonly', undefined, 'Active', '22 rules', undefined, {
    details: { rules: 22, aggregation: false },
    actions: rbacActions
  }),
  resource('role-bindings', 'namespace-operator-binding', 'platform', 'Active', '2 subjects', undefined, {
    details: { roleRef: 'Role/namespace-operator', subjects: 'ops-admin,sre-oncall' },
    actions: rbacActions
  }),
  resource('cluster-role-bindings', 'cluster-readonly-binding', undefined, 'Active', '1 subject', undefined, {
    details: { roleRef: 'ClusterRole/cluster-readonly', subjects: 'readonly-users' },
    actions: rbacActions
  }),
  resource('nodes', 'worker-01', undefined, 'Ready', '8c / 32Gi', undefined, {
    capacity: '8 CPU / 32Gi',
    details: { os: 'Ubuntu 22.04', kubelet: 'v1.29.4', pods: '16/110', taints: '-' },
    actions: nodeActions
  }),
  resource('nodes', 'worker-02', undefined, 'Ready,SchedulingDisabled', '8c / 32Gi', undefined, {
    capacity: '8 CPU / 32Gi',
    details: { os: 'Ubuntu 22.04', kubelet: 'v1.29.4', pods: '14/110', taints: 'maintenance=true:NoSchedule' },
    actions: nodeActions
  }),
  resource('nodes', 'worker-03', undefined, 'NotReady', '8c / 32Gi', undefined, {
    capacity: '8 CPU / 32Gi',
    details: { os: 'Ubuntu 22.04', kubelet: 'v1.29.4', pods: '12/110', taints: 'node.kubernetes.io/unreachable:NoSchedule' },
    actions: nodeActions
  }),
  resource('namespaces', 'platform', undefined, 'Active', '28d', undefined, {
    details: { team: 'platform', quota: 'enabled' },
    actions: namespaceActions
  }),
  resource('namespaces', 'payments', undefined, 'Active', '19d', undefined, {
    details: { team: 'payments', quota: 'enabled' },
    actions: namespaceActions
  }),
  resource('events', 'payment-worker-crashloop', 'payments', 'Warning', 'BackOff', undefined, {
    details: { type: 'Warning', reason: 'BackOff', message: 'Back-off restarting failed container payment-worker' },
    actions: eventActions
  })
]

export const kubeEvents: KubeEvent[] = [
  {
    id: 'evt-001',
    type: 'Warning',
    reason: 'BackOff',
    message: 'Back-off restarting failed container payment-worker in pod payment-worker-0',
    involvedObject: {
      kind: 'Pod',
      name: 'payment-worker-0',
      namespace: 'payments'
    },
    count: 8,
    source: 'kubelet/worker-02',
    firstTimestamp: '2026-05-27T08:42:12+08:00',
    lastTimestamp: '2026-05-27T09:58:30+08:00'
  },
  {
    id: 'evt-002',
    type: 'Warning',
    reason: 'MetricsUnavailable',
    message: 'metrics.k8s.io API is not available, capacity view falls back to requests and limits',
    involvedObject: {
      kind: 'Cluster',
      name: 'prod-east'
    },
    count: 1,
    source: 'kube-subops',
    firstTimestamp: '2026-05-27T09:20:00+08:00',
    lastTimestamp: '2026-05-27T09:20:00+08:00'
  },
  {
    id: 'evt-003',
    type: 'Normal',
    reason: 'Pulled',
    message: 'Container image ghcr.io/example/web-console:v1.0.0 already present on machine',
    involvedObject: {
      kind: 'Pod',
      name: 'web-console-56fcd7d7c8-7p9vx',
      namespace: 'platform'
    },
    count: 1,
    source: 'kubelet/worker-02',
    firstTimestamp: '2026-05-27T09:30:02+08:00',
    lastTimestamp: '2026-05-27T09:30:02+08:00'
  }
]

export const dashboardStatus: DashboardStatus = {
  cluster: {
    id: defaultClusterId,
    name: 'prod-east',
    status: 'healthy',
    statusText: '连接正常',
    kubernetesVersion: 'v1.29.4'
  },
  namespace: defaultNamespace,
  generatedAt: now,
  metrics: {
    available: false,
    message: 'Metrics API 不可用，当前展示容量、requests、limits 和状态降级数据。',
    cpuUsage: 'requests 8.6 / allocatable 24 cores',
    memoryUsage: 'requests 34 / allocatable 96 Gi'
  },
  capacity: {
    nodesReady: 2,
    nodesTotal: 3,
    cpuAllocatable: '24 cores',
    memoryAllocatable: '96 Gi',
    podCapacity: 330
  },
  resourceStats: [
    { label: 'Namespace', value: '6', tone: 'primary', route: '/other/namespaces' },
    { label: 'Pod Running', value: '42', tone: 'success', route: '/pods' },
    { label: '工作负载异常', value: '1', tone: 'warning', route: '/workloads/statefulsets' },
    { label: 'Node NotReady', value: '1', tone: 'danger', route: '/other/nodes' }
  ],
  alerts: [
    {
      id: 'alert-metrics',
      title: 'Metrics API 不可用',
      description: '集群 CPU / 内存实时指标已降级为 requests、limits 与容量视图。',
      severity: 'warning'
    },
    {
      id: 'alert-node',
      title: 'worker-03 NotReady',
      description: '节点心跳不可达，相关 Pod 调度和工作负载可用性可能受影响。',
      severity: 'critical'
    }
  ],
  recentEvents: kubeEvents
}

export const resourceGraph: ResourceGraph = {
  clusterId: defaultClusterId,
  namespace: defaultNamespace,
  nodes: [
    graphNode('namespace:platform', 'platform', 'Namespace', 'Active', 'success'),
    graphNode('deploy:api-server', 'api-server', 'Deployment', 'Available', 'success', '/workloads/deployments'),
    graphNode('rs:api-server-7db6f89f8c', 'api-server-7db6f89f8c', 'ReplicaSet', 'Available', 'success', '/workloads/replicasets'),
    graphNode('pod:api-server-7db6f89f8c-r4l8z', 'api-server-7db6f89f8c-r4l8z', 'Pod', 'Running', 'success', '/pods'),
    graphNode('svc:api-server', 'api-server', 'Service', 'Active', 'primary', '/network/services'),
    graphNode('ing:web-console', 'web-console', 'Ingress', 'Ready', 'primary', '/network/ingresses'),
    graphNode('pvc:kube-subops-data', 'kube-subops-data', 'PersistentVolumeClaim', 'Bound', 'success', '/storage/persistent-volume-claims')
  ],
  edges: [
    { id: 'edge-namespace-deploy', source: 'namespace:platform', target: 'deploy:api-server', label: 'contains' },
    { id: 'edge-deploy-rs', source: 'deploy:api-server', target: 'rs:api-server-7db6f89f8c', label: 'owns' },
    { id: 'edge-rs-pod', source: 'rs:api-server-7db6f89f8c', target: 'pod:api-server-7db6f89f8c-r4l8z', label: 'creates' },
    { id: 'edge-svc-pod', source: 'svc:api-server', target: 'pod:api-server-7db6f89f8c-r4l8z', label: 'selects' },
    { id: 'edge-ing-svc', source: 'ing:web-console', target: 'svc:api-server', label: 'routes' },
    { id: 'edge-pod-pvc', source: 'pod:api-server-7db6f89f8c-r4l8z', target: 'pvc:kube-subops-data', label: 'mounts' }
  ]
}

export const podLogLines: Record<string, PodLogLine[]> = {
  'platform/api-server-7db6f89f8c-r4l8z': [
    { timestamp: '2026-05-27T09:58:01+08:00', stream: 'stdout', message: 'request completed method=GET path=/api/v1/me status=200 duration=18ms' },
    { timestamp: '2026-05-27T09:58:08+08:00', stream: 'stdout', message: 'resource list cluster=prod-east namespace=platform type=pods total=12' },
    { timestamp: '2026-05-27T09:58:12+08:00', stream: 'stdout', message: 'audit recorded action=resources.view result=success request_id=req_mock_001' }
  ],
  'payments/payment-worker-0': [
    { timestamp: '2026-05-27T09:57:42+08:00', stream: 'stdout', message: 'starting payment worker version=v0.9.2' },
    { timestamp: '2026-05-27T09:57:43+08:00', stream: 'stderr', message: 'failed to connect to payment gateway: connection refused' },
    { timestamp: '2026-05-27T09:57:43+08:00', stream: 'stderr', message: 'worker exited with code 1' }
  ]
}

export const auditLogs: AuditLogEntry[] = [
  {
    id: 'audit-1001',
    timestamp: '2026-05-27T09:59:10+08:00',
    user: '平台管理员',
    action: 'pods.logs',
    result: 'success',
    clusterName: 'prod-east',
    namespace: 'platform',
    resourceType: 'pods',
    resourceName: 'api-server-7db6f89f8c-r4l8z',
    message: '查看 Pod 日志',
    requestId: 'req_mock_1001'
  },
  {
    id: 'audit-1002',
    timestamp: '2026-05-27T09:50:32+08:00',
    user: '平台管理员',
    action: 'node.cordon',
    result: 'success',
    clusterName: 'prod-east',
    resourceType: 'nodes',
    resourceName: 'worker-02',
    message: '节点进入维护调度保护',
    requestId: 'req_mock_1002'
  },
  {
    id: 'audit-1003',
    timestamp: '2026-05-27T09:42:19+08:00',
    user: 'sre-oncall',
    action: 'secret.reveal',
    result: 'failed',
    clusterName: 'prod-east',
    namespace: 'platform',
    resourceType: 'secrets',
    resourceName: 'cluster-prod-credential',
    message: '权限不足，Secret 明文查看被拒绝',
    requestId: 'req_mock_1003'
  }
]

export const settingsAccess: SettingsAccessView = {
  sections: [
    { id: 'general', title: '系统通用设置', route: '/settings/general', canView: true, canEdit: true },
    { id: 'version', title: '版本设置', route: '/settings/version', canView: true, canEdit: false, reason: 'v1.0 后端可返回不支持自更新' },
    { id: 'security', title: '安全配置', route: '/settings/security', canView: true, canEdit: true },
    { id: 'audit', title: '审计配置', route: '/settings/audit', canView: true, canEdit: true },
    { id: 'access', title: '用户与角色', route: '/settings/access', canView: true, canEdit: true }
  ],
  auditRetentionDays: 180,
  highRiskConfirmation: {
    requireReason: true,
    requireTypedName: true,
    terminalSessionTtlMinutes: 30
  },
  roles: [
    {
      id: 'role-admin',
      name: '平台管理员',
      permissions: ['*'],
      scopes: ['cluster:*', 'namespace:*']
    },
    {
      id: 'role-ops',
      name: 'SRE 运维',
      permissions: ['resources:*', 'pods:logs', 'pods:exec', 'nodes:operate'],
      scopes: ['cluster:prod-east', 'namespace:platform,payments,observability']
    },
    {
      id: 'role-readonly',
      name: '只读用户',
      permissions: ['resources:view', 'audit:view'],
      scopes: ['cluster:prod-east', 'namespace:platform']
    }
  ]
}

export const clusterCredentialFormContract: ClusterCredentialFormContract = {
  credentialTypes: [
    { type: 'kubeconfig', label: 'kubeconfig', description: '提交 kubeconfig 内容给后端加密保存，前端不长期持有。' },
    { type: 'token', label: 'Token', description: '提交 Bearer Token 给后端加密保存，列表仅显示脱敏摘要。' },
    { type: 'serviceAccountToken', label: 'ServiceAccount Token', description: '提交服务账号 Token 和 CA 信息给后端保存。' }
  ],
  fieldsByType: {
    kubeconfig: [
      { key: 'name', label: '集群名称', input: 'text', required: true, secret: false, placeholder: 'prod-east', help: '展示在顶部栏和多集群列表中。' },
      { key: 'apiServer', label: 'API Server', input: 'text', required: true, secret: false, placeholder: 'https://10.12.0.10:6443', help: '由后端用于连接测试和 client-go 初始化。' },
      { key: 'kubeconfig', label: 'kubeconfig 内容', input: 'textarea', required: true, secret: true, placeholder: '粘贴 kubeconfig，提交后不会在前端保存明文。', help: '仅在表单提交瞬间存在于内存中。' }
    ],
    token: [
      { key: 'name', label: '集群名称', input: 'text', required: true, secret: false, placeholder: 'prod-east', help: '展示在顶部栏和多集群列表中。' },
      { key: 'apiServer', label: 'API Server', input: 'text', required: true, secret: false, placeholder: 'https://10.12.0.10:6443', help: '由后端用于连接测试和 client-go 初始化。' },
      { key: 'bearerToken', label: 'Bearer Token', input: 'password', required: true, secret: true, placeholder: '提交后仅显示 **** 摘要', help: '不得写入 localStorage、Pinia 持久化或 URL。' }
    ],
    serviceAccountToken: [
      { key: 'name', label: '集群名称', input: 'text', required: true, secret: false, placeholder: 'staging', help: '展示在顶部栏和多集群列表中。' },
      { key: 'apiServer', label: 'API Server', input: 'text', required: true, secret: false, placeholder: 'https://10.13.0.10:6443', help: '由后端用于连接测试和 client-go 初始化。' },
      { key: 'namespace', label: 'ServiceAccount Namespace', input: 'text', required: true, secret: false, placeholder: 'kube-system', help: '服务账号所在 Namespace。' },
      { key: 'serviceAccountName', label: 'ServiceAccount 名称', input: 'text', required: true, secret: false, placeholder: 'kube-subops', help: '用于脱敏摘要和审计。' },
      { key: 'token', label: 'ServiceAccount Token', input: 'password', required: true, secret: true, placeholder: '提交后仅显示 **** 摘要', help: '不得在前端长期保存。' },
      { key: 'caCertificate', label: 'CA 证书', input: 'textarea', required: false, secret: true, placeholder: '可选 CA 证书 PEM 内容', help: '仅提交给后端保存。' }
    ]
  },
  retentionPolicy: '前端仅提供表单字段和脱敏摘要 mock；kubeconfig、Token、ServiceAccount Token 不进入长期存储。'
}

export function getMockShellContext(clusterId = defaultClusterId, namespace = defaultNamespace): ShellContext {
  const currentCluster = kubeClusters.find((cluster) => cluster.id === clusterId) ?? kubeClusters[0]
  const namespaces = kubeNamespaces[currentCluster.id] ?? []

  return {
    user: currentUser,
    currentCluster,
    currentNamespace: namespace,
    clusters: kubeClusters,
    namespaces,
    permissions: permissionMatrix,
    quickSearchScopes: ['pod', 'workloads', 'network', 'config', 'storage', 'access', 'other']
  }
}

export function getMockResourceDefinitionByRoute(route: string) {
  return resourceDefinitions.find((definition) => definition.route === route || route.startsWith(`${definition.route}/`))
}

export function getMockResourceDefinition(resourceType: string) {
  return resourceDefinitions.find((definition) => definition.resourceType === resourceType)
}

export function getMockResourceDetail(query: { resourceType: string; name: string; namespace?: string }): ResourceDetail {
  const summary =
    kubeResourceSummaries.find(
      (item) =>
        item.resourceType === query.resourceType &&
        item.name === query.name &&
        (query.namespace === undefined || item.namespace === query.namespace)
    ) ?? kubeResourceSummaries[0]

  const containers: ContainerStatusView[] =
    summary.resourceType === 'pods'
      ? [
        {
          name: 'app',
          image: summary.images?.[0] ?? 'ghcr.io/example/app:v1.0.0',
          ready: summary.status === 'Running',
          restartCount: summary.restarts ?? 0,
          state: summary.status,
          ports: summary.details.ports ? [String(summary.details.ports)] : ['8080/TCP']
        }
      ]
      : []

  return {
    summary,
    metadataFields: [
      { label: '名称', value: summary.name },
      { label: 'Namespace', value: summary.namespace ?? '集群级资源' },
      { label: 'Kind', value: summary.kind },
      { label: 'API Version', value: summary.apiVersion },
      { label: '创建时间', value: summary.createdAt }
    ],
    specFields: Object.entries(summary.details).map(([label, value]) => ({
      label,
      value: Array.isArray(value) ? value.join(', ') : String(value ?? '-')
    })),
    statusFields: [
      { label: '状态', value: summary.statusText, tone: summary.statusTone },
      { label: '年龄', value: summary.age },
      { label: 'Ready', value: summary.ready ?? '-' },
      { label: 'Node', value: summary.nodeName ?? '-' }
    ],
    containers,
    relatedResources: findRelatedResources(summary),
    events: kubeEvents.filter(
      (event) =>
        event.involvedObject.name === summary.name ||
        event.involvedObject.namespace === summary.namespace ||
        summary.ownerReferences.some((owner) => owner.name === event.involvedObject.name)
    ),
    yaml: renderMockYaml(summary),
    actionAvailability: summary.actions
  }
}

export function listMockResourceSummaries(query: ResourceListQuery): PageResult<ResourceSummary> {
  const definition = getMockResourceDefinition(query.resourceType)
  const normalizedNamespace = query.namespace && query.namespace !== allNamespacesValue ? query.namespace : ''
  const keyword = (query.name ?? '').trim().toLowerCase()
  const status = (query.status ?? '').trim().toLowerCase()
  const labelPairs = parseLabelSelector(query.labels)
  const page = Math.max(1, query.page ?? 1)
  const pageSize = Math.max(1, query.pageSize ?? 20)

  let items = kubeResourceSummaries
    .filter((item) => item.clusterId === query.clusterId)
    .filter((item) => item.resourceType === query.resourceType)
    .filter((item) => !definition?.namespaced || !normalizedNamespace || item.namespace === normalizedNamespace)
    .filter((item) => !keyword || item.name.toLowerCase().includes(keyword))
    .filter((item) => !status || item.status.toLowerCase().includes(status) || item.statusText.toLowerCase().includes(status))
    .filter((item) => labelPairs.every(([key, value]) => item.labels[key] === value))

  if (query.sortBy) {
    items = [...items].sort((left, right) => {
      const leftValue = String(readResourceSortValue(left, query.sortBy ?? 'name'))
      const rightValue = String(readResourceSortValue(right, query.sortBy ?? 'name'))
      const result = leftValue.localeCompare(rightValue)
      return query.sortOrder === 'desc' ? -result : result
    })
  }

  return {
    page,
    pageSize,
    total: items.length,
    items: items.slice((page - 1) * pageSize, page * pageSize)
  }
}

export function searchMockResources(keyword: string, clusterId = defaultClusterId, namespace?: string, resourceType?: string): SearchResourceResult[] {
  const normalizedKeyword = keyword.trim().toLowerCase()
  if (!normalizedKeyword) return []

  return kubeResourceSummaries
    .filter((item) => item.clusterId === clusterId)
    .filter((item) => !namespace || namespace === allNamespacesValue || item.namespace === namespace)
    .filter((item) => !resourceType || item.resourceType === resourceType)
    .filter((item) => {
      const haystack = [item.name, item.namespace, item.kind, item.status, ...Object.keys(item.labels), ...Object.values(item.labels)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      return haystack.includes(normalizedKeyword)
    })
    .slice(0, 20)
    .map((item) => {
      const definition = getMockResourceDefinition(item.resourceType)
      return {
        id: item.id,
        resourceType: item.resourceType,
        kind: item.kind,
        name: item.name,
        namespace: item.namespace,
        route: definition ? `${definition.route}/${encodeURIComponent(item.name)}` : '',
        status: item.statusText,
        snippet: [item.kind, item.namespace, item.statusText].filter(Boolean).join(' / ')
      }
    })
}

export function getHighRiskConfirmMetadata(action: HighRiskActionId, targetName?: string): HighRiskConfirmMetadata {
  return {
    ...buildConfirm(action, targetName),
    targetName
  }
}

function defineResource(
  resourceType: string,
  singular: string,
  apiVersion: string,
  label: string,
  route: string,
  category: ResourceDefinition['category'],
  scope: ResourceScope,
  priority: ResourceDefinition['priority'],
  availabilityActions: ResourceActionAvailability[],
  columns = scope === 'Cluster' ? clusterColumns : commonColumns,
  filters = scope === 'Cluster' ? clusterFilters : commonFilters
): ResourceDefinition {
  return {
    resourceType,
    kind: singular,
    apiVersion,
    plural: resourceType,
    singular,
    label,
    route,
    category,
    scope,
    namespaced: scope === 'Namespaced',
    priority,
    description: `${label} ${scope === 'Namespaced' ? '命名空间级' : '集群级'}资源管理`,
    columns,
    filters,
    actions: availabilityActions.map((action) => ({
      id: action.id,
      label: action.label,
      permission: actionPermission(resourceType, action.id),
      highRisk: action.highRisk,
      disabledReason: action.reason
    }))
  }
}

function resource(
  resourceType: string,
  name: string,
  namespace: string | undefined,
  status: string,
  readyOrAge: string,
  nodeName: string | undefined,
  overrides: Partial<ResourceSummary>
): ResourceSummary {
  const definition = getMockResourceDefinition(resourceType)
  const statusTone = statusToTone(status)
  const kind = definition?.kind ?? resourceType
  const labels = {
    app: name.split('-')[0] || name,
    'app.kubernetes.io/managed-by': 'kube-subops',
    ...(overrides.labels ?? {})
  }

  return {
    id: [resourceType, namespace, name].filter(Boolean).join('/'),
    clusterId: defaultClusterId,
    resourceType,
    kind,
    apiVersion: definition?.apiVersion ?? 'v1',
    name,
    namespace,
    status,
    statusText: status,
    statusTone,
    age: resourceType === 'namespaces' ? readyOrAge : '3d',
    createdAt: '2026-05-24T10:00:00+08:00',
    labels,
    annotations: {
      'kubectl.kubernetes.io/last-applied-configuration': 'hidden in summary'
    },
    ownerReferences: overrides.ownerReferences ?? [],
    ready: overrides.ready ?? (readyOrAge.includes('/') ? readyOrAge : undefined),
    restarts: overrides.restarts,
    nodeName,
    podIP: overrides.podIP,
    images: overrides.images,
    capacity: overrides.capacity,
    accessModes: overrides.accessModes,
    storageClass: overrides.storageClass,
    details: overrides.details ?? {},
    actions: overrides.actions ?? readOnlyActions
  }
}

function graphNode(
  id: string,
  label: string,
  kind: string,
  status: string,
  tone: StatusTone,
  route?: string
) {
  return {
    id,
    label,
    kind,
    namespace: defaultNamespace,
    status,
    tone,
    route
  }
}

function statusToTone(status: string): StatusTone {
  const normalized = status.toLowerCase()
  if (normalized.includes('running') || normalized.includes('ready') || normalized.includes('available') || normalized.includes('active') || normalized.includes('bound') || normalized.includes('complete')) return 'success'
  if (normalized.includes('degraded') || normalized.includes('backoff') || normalized.includes('disabled')) return 'warning'
  if (normalized.includes('notready') || normalized.includes('failed') || normalized.includes('error')) return 'danger'
  return 'primary'
}

function disableActions(
  actions: ResourceActionAvailability[],
  ids: ResourceActionId[],
  reason: string
): ResourceActionAvailability[] {
  return actions.map((action) =>
    ids.includes(action.id)
      ? {
        ...action,
        enabled: false,
        reason
      }
      : action
  )
}

function actionPermission(resourceType: string, action: ResourceActionId) {
  if (action === 'view' || action === 'yaml') return 'resources:view'
  if (action === 'delete') return 'resources:delete'
  if (['scale', 'restart', 'setImage', 'rolloutStatus', 'rollback'].includes(action)) return 'workloads:operate'
  if (action === 'logs') return 'pods:logs'
  if (action === 'exec') return 'pods:exec'
  if (action === 'reveal') return 'secrets:reveal'
  if (['drain', 'cordon', 'uncordon'].includes(action)) return 'nodes:operate'
  if (resourceType.includes('role') || resourceType.includes('account')) return 'rbac:manage'
  return 'resources:write'
}

function buildConfirm(action: HighRiskActionId, targetName?: string): HighRiskConfirmMetadata {
  const titleByAction: Record<HighRiskActionId, string> = {
    'resource.delete': '确认删除资源',
    'yaml.apply': '确认应用 YAML',
    'workload.scale': '确认扩缩容',
    'workload.restart': '确认重启工作负载',
    'workload.setImage': '确认更新镜像',
    'workload.rollback': '确认回滚工作负载',
    'pod.delete': '确认删除 Pod',
    'pod.exec': '确认进入 Pod 终端',
    'secret.reveal': '确认查看 Secret 明文',
    'node.drain': '确认 Drain 节点',
    'node.cordon': '确认 Cordon 节点',
    'node.uncordon': '确认 Uncordon 节点',
    'namespace.delete': '确认删除 Namespace',
    'cluster.delete': '确认删除集群',
    'cluster.credential.update': '确认更新集群凭据',
    'rbac.update': '确认修改访问控制'
  }
  const critical = new Set<HighRiskActionId>(['namespace.delete', 'node.drain', 'secret.reveal', 'cluster.delete', 'rbac.update'])

  return {
    action,
    title: titleByAction[action],
    description: '后端会重新校验权限、确认载荷和 Kubernetes API 结果，并写入审计记录。',
    dangerLevel: critical.has(action) ? 'critical' : 'high',
    targetName,
    requiredText: targetName,
    requireReason: true,
    auditAction: action
  }
}

function parseLabelSelector(selector = '') {
  return selector
    .split(',')
    .map((pair) => pair.trim())
    .filter(Boolean)
    .map((pair) => {
      const [key, value = ''] = pair.split('=')
      return [key.trim(), value.trim()] as const
    })
    .filter(([key, value]) => key && value)
}

function readResourceSortValue(item: ResourceSummary, key: string) {
  if (key in item) return item[key as keyof ResourceSummary]
  return item.details[key]
}

function findRelatedResources(summary: ResourceSummary) {
  const ownerNames = new Set(summary.ownerReferences.map((owner) => owner.name))
  return kubeResourceSummaries.filter((item) => {
    if (item.id === summary.id) return false
    if (ownerNames.has(item.name)) return true
    return item.ownerReferences.some((owner) => owner.name === summary.name)
  })
}

function renderMockYaml(summary: ResourceSummary) {
  const namespaceLine = summary.namespace ? `  namespace: ${summary.namespace}\n` : ''
  const labels = Object.entries(summary.labels)
    .map(([key, value]) => `    ${key}: ${value}`)
    .join('\n')
  const spec = Object.entries(summary.details)
    .map(([key, value]) => `  ${key}: ${JSON.stringify(value)}`)
    .join('\n')

  return [
    `apiVersion: ${summary.apiVersion}`,
    `kind: ${summary.kind}`,
    'metadata:',
    `  name: ${summary.name}`,
    namespaceLine.trimEnd(),
    '  labels:',
    labels || '    app: example',
    'spec:',
    spec || '  managedBy: kube-subops-mock',
    'status:',
    `  phase: ${summary.status}`
  ]
    .filter(Boolean)
    .join('\n')
}
