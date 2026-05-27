export type StatusTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger'

export type ClusterStatus = 'healthy' | 'degraded' | 'unreachable' | 'testing'

export type CredentialType = 'kubeconfig' | 'token' | 'serviceAccountToken'

export type ResourceScope = 'Namespaced' | 'Cluster'

export type ResourceCategory =
  | 'overview'
  | 'pod'
  | 'workloads'
  | 'network'
  | 'config'
  | 'storage'
  | 'access'
  | 'other'

export type ResourceActionId =
  | 'view'
  | 'yaml'
  | 'create'
  | 'edit'
  | 'delete'
  | 'scale'
  | 'restart'
  | 'setImage'
  | 'rolloutStatus'
  | 'rollback'
  | 'logs'
  | 'exec'
  | 'reveal'
  | 'drain'
  | 'cordon'
  | 'uncordon'

export type HighRiskActionId =
  | 'resource.delete'
  | 'yaml.apply'
  | 'workload.scale'
  | 'workload.restart'
  | 'workload.setImage'
  | 'workload.rollback'
  | 'pod.delete'
  | 'pod.exec'
  | 'secret.reveal'
  | 'node.drain'
  | 'node.cordon'
  | 'node.uncordon'
  | 'namespace.delete'
  | 'cluster.delete'
  | 'cluster.credential.update'
  | 'rbac.update'

export interface PageQuery {
  page?: number
  pageSize?: number
}

export interface PageResult<T> {
  page: number
  pageSize: number
  total: number
  items: T[]
}

export interface PermissionMatrix {
  canManageClusters: boolean
  canManageSettings: boolean
  canViewAuditLogs: boolean
  resourcePermissions: Record<string, ResourceActionId[]>
}

export interface CurrentUser {
  id: string
  username: string
  displayName: string
  email?: string
  roleNames: string[]
  permissions: string[]
  preferredClusterId?: string
  preferredNamespace?: string
  accessibleClusters: string[]
  accessibleNamespaces: Record<string, string[]>
}

export interface ClusterSummary {
  id: string
  name: string
  apiServer: string
  status: ClusterStatus
  statusText: string
  kubernetesVersion: string
  credentialType: CredentialType
  credentialSummary: string
  description: string
  metricsAvailable: boolean
  current: boolean
  createdAt: string
  updatedAt: string
  lastConnectedAt?: string
  nodeCount: number
  namespaceCount: number
}

export interface NamespaceSummary {
  name: string
  status: 'Active' | 'Terminating'
  labels: Record<string, string>
  age: string
  quota?: {
    cpuRequests: string
    memoryRequests: string
    pods: string
  }
}

export interface ShellContext {
  user: CurrentUser
  currentCluster: ClusterSummary
  currentNamespace: string
  clusters: ClusterSummary[]
  namespaces: NamespaceSummary[]
  permissions: PermissionMatrix
  quickSearchScopes: ResourceCategory[]
}

export interface ShellContextQuery {
  clusterId?: string
  namespace?: string
}

export interface ResourceColumnDefinition {
  key: string
  label: string
  sortable?: boolean
  width?: string
  toneMap?: Record<string, StatusTone>
}

export interface ResourceFilterDefinition {
  key: string
  label: string
  type: 'text' | 'select' | 'labelSelector' | 'namespace'
  options?: Array<{ label: string; value: string }>
}

export interface ResourceActionDefinition {
  id: ResourceActionId
  label: string
  permission: string
  highRisk?: boolean
  disabledReason?: string
}

export interface ResourceDefinition {
  resourceType: string
  kind: string
  apiVersion: string
  plural: string
  singular: string
  label: string
  route: string
  category: ResourceCategory
  scope: ResourceScope
  namespaced: boolean
  priority: 'P0' | 'P1' | 'P2'
  description: string
  columns: ResourceColumnDefinition[]
  filters: ResourceFilterDefinition[]
  actions: ResourceActionDefinition[]
}

export interface OwnerReferenceView {
  kind: string
  name: string
  resourceType?: string
}

export interface ResourceActionAvailability {
  id: ResourceActionId
  label: string
  enabled: boolean
  highRisk: boolean
  reason?: string
  confirm?: HighRiskConfirmMetadata
}

export interface ResourceSummary {
  id: string
  clusterId: string
  resourceType: string
  kind: string
  apiVersion: string
  name: string
  namespace?: string
  status: string
  statusText: string
  statusTone: StatusTone
  age: string
  createdAt: string
  labels: Record<string, string>
  annotations: Record<string, string>
  ownerReferences: OwnerReferenceView[]
  ready?: string
  restarts?: number
  nodeName?: string
  podIP?: string
  images?: string[]
  capacity?: string
  accessModes?: string[]
  storageClass?: string
  details: Record<string, string | number | boolean | string[] | undefined>
  actions: ResourceActionAvailability[]
}

export interface DetailField {
  label: string
  value: string
  tone?: StatusTone
}

export interface ContainerStatusView {
  name: string
  image: string
  ready: boolean
  restartCount: number
  state: string
  ports: string[]
}

export interface KubeEvent {
  id: string
  type: 'Normal' | 'Warning'
  reason: string
  message: string
  involvedObject: {
    kind: string
    name: string
    namespace?: string
  }
  count: number
  source: string
  firstTimestamp: string
  lastTimestamp: string
}

export interface ResourceDetail {
  summary: ResourceSummary
  metadataFields: DetailField[]
  specFields: DetailField[]
  statusFields: DetailField[]
  containers: ContainerStatusView[]
  relatedResources: ResourceSummary[]
  events: KubeEvent[]
  yaml: string
  actionAvailability: ResourceActionAvailability[]
}

export interface ResourceListQuery extends PageQuery {
  clusterId: string
  resourceType: string
  namespace?: string
  name?: string
  labels?: string
  status?: string
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface ResourceDetailQuery {
  clusterId: string
  resourceType: string
  namespace?: string
  name: string
}

export interface DashboardStatus {
  cluster: Pick<ClusterSummary, 'id' | 'name' | 'status' | 'statusText' | 'kubernetesVersion'>
  namespace: string
  generatedAt: string
  metrics: {
    available: boolean
    message: string
    cpuUsage: string
    memoryUsage: string
  }
  capacity: {
    nodesReady: number
    nodesTotal: number
    cpuAllocatable: string
    memoryAllocatable: string
    podCapacity: number
  }
  resourceStats: Array<{
    label: string
    value: string
    tone: StatusTone
    route: string
  }>
  alerts: Array<{
    id: string
    title: string
    description: string
    severity: 'info' | 'warning' | 'critical'
  }>
  recentEvents: KubeEvent[]
}

export interface ResourceGraphNode {
  id: string
  label: string
  kind: string
  namespace?: string
  status: string
  tone: StatusTone
  route?: string
}

export interface ResourceGraphEdge {
  id: string
  source: string
  target: string
  label: string
}

export interface ResourceGraph {
  clusterId: string
  namespace: string
  nodes: ResourceGraphNode[]
  edges: ResourceGraphEdge[]
}

export interface SearchResourceQuery extends PageQuery {
  clusterId: string
  keyword: string
  namespace?: string
  resourceType?: string
}

export interface SearchResourceResult {
  id: string
  resourceType: string
  kind: string
  name: string
  namespace?: string
  route: string
  status: string
  snippet: string
}

export interface PodLogsQuery {
  clusterId: string
  namespace: string
  podName: string
  container?: string
  tailLines?: number
  follow?: boolean
}

export interface PodLogLine {
  timestamp: string
  stream: 'stdout' | 'stderr'
  message: string
}

export interface PodTerminalRequest {
  clusterId: string
  namespace: string
  podName: string
  container?: string
  confirm: HighRiskConfirmPayload
}

export interface PodTerminalSession {
  sessionId: string
  clusterId: string
  namespace: string
  podName: string
  container: string
  websocketUrl?: string
  status: 'mock-ready' | 'ready' | 'denied'
  auditHint: string
  expiresAt: string
}

export interface HighRiskConfirmPayload {
  confirmed: boolean
  confirmationText?: string
  reason?: string
}

export interface HighRiskConfirmMetadata {
  action: HighRiskActionId
  title: string
  description: string
  dangerLevel: 'medium' | 'high' | 'critical'
  targetName?: string
  requiredText?: string
  requireReason: boolean
  auditAction: string
}

export interface HighRiskActionRequest {
  action: HighRiskActionId
  clusterId: string
  resourceType?: string
  kind?: string
  namespace?: string
  name?: string
  payload?: Record<string, unknown>
  confirm: HighRiskConfirmPayload
}

export interface ActionResult {
  accepted: boolean
  status: 'succeeded' | 'queued' | 'failed' | 'recorded'
  message: string
  auditId: string
  affectedResources: string[]
  requiresRefresh: boolean
}

export interface AuditLogQuery extends PageQuery {
  user?: string
  clusterId?: string
  namespace?: string
  resourceType?: string
  action?: string
  result?: 'success' | 'failed'
  startTime?: string
  endTime?: string
}

export interface AuditLogEntry {
  id: string
  timestamp: string
  user: string
  action: string
  result: 'success' | 'failed'
  clusterName: string
  namespace?: string
  resourceType?: string
  resourceName?: string
  message: string
  requestId: string
}

export interface SettingsSectionAccess {
  id: string
  title: string
  route: string
  canView: boolean
  canEdit: boolean
  reason?: string
}

export interface SettingsAccessView {
  sections: SettingsSectionAccess[]
  auditRetentionDays: number
  highRiskConfirmation: {
    requireReason: boolean
    requireTypedName: boolean
    terminalSessionTtlMinutes: number
  }
  roles: Array<{
    id: string
    name: string
    permissions: string[]
    scopes: string[]
  }>
}

export interface CredentialFieldDefinition {
  key: string
  label: string
  input: 'text' | 'textarea' | 'password' | 'select'
  required: boolean
  secret: boolean
  placeholder: string
  help: string
}

export interface ClusterCredentialFormContract {
  credentialTypes: Array<{
    type: CredentialType
    label: string
    description: string
  }>
  fieldsByType: Record<CredentialType, CredentialFieldDefinition[]>
  retentionPolicy: string
}
