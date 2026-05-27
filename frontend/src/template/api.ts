import axios from 'axios'
import {
  auditLogs,
  clusterCredentialFormContract,
  currentUser,
  dashboardStatus,
  getHighRiskConfirmMetadata,
  getMockResourceDefinition,
  getMockResourceDefinitionByRoute,
  getMockResourceDetail,
  getMockShellContext,
  kubeClusters,
  kubeEvents,
  kubeNamespaces,
  listMockResourceSummaries,
  podLogLines,
  resourceDefinitions,
  resourceGraph,
  searchMockResources,
  settingsAccess
} from './data'
import type {
  ActionResult,
  AuditLogEntry,
  AuditLogQuery,
  ClusterCredentialFormContract,
  ClusterSummary,
  DashboardStatus,
  HighRiskActionId,
  HighRiskActionRequest,
  HighRiskConfirmMetadata,
  KubeEvent,
  NamespaceSummary,
  PageQuery,
  PageResult,
  PodLogsQuery,
  PodLogLine,
  PodTerminalRequest,
  PodTerminalSession,
  ResourceDefinition,
  ResourceDetail,
  ResourceDetailQuery,
  ResourceGraph,
  ResourceListQuery,
  ResourceSummary,
  SearchResourceQuery,
  SearchResourceResult,
  SettingsAccessView,
  ShellContext,
  ShellContextQuery
} from './kubeTypes'

const defaultApiBaseUrl = '/api/v1'
const truthyValues = new Set(['true', '1', 'yes', 'on'])
const falseyValues = new Set(['false', '0', 'no', 'off'])

function normalizeApiBaseUrl(value: string | undefined) {
  const trimmed = (value ?? '').trim().replace(/\/$/, '')
  if (!trimmed || trimmed === '/api') return defaultApiBaseUrl
  return trimmed
}

function resolveMockEnabled() {
  const rawValue = String(import.meta.env.VITE_USE_MOCK ?? '').trim().toLowerCase()
  const appEnv = String(import.meta.env.VITE_APP_ENV ?? '').toLowerCase()
  if (truthyValues.has(rawValue)) return true
  if (appEnv === 'production') return false
  if (falseyValues.has(rawValue)) return false
  return false
}

const apiBaseUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL)

export const request = axios.create({
  baseURL: apiBaseUrl,
  timeout: 10000
})

export interface ApiResponse<T> {
  code: number
  message: string
  data: T
  details?: unknown
  requestId?: string
}

export interface BackendPageResponse<T> {
  page: number
  pageSize: number
  total: number
  items: T[]
}

type RequestMethod = 'get' | 'post' | 'put' | 'patch' | 'delete'

interface RequestOptions {
  params?: Record<string, unknown>
  data?: unknown
}

export const kubeApiConfig = {
  apiBaseUrl,
  mockEnabled: resolveMockEnabled()
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function unwrapResponse<T>(payload: ApiResponse<T> | T): T {
  if (isRecord(payload) && typeof payload.code === 'number' && 'data' in payload) {
    if (payload.code !== 0) {
      throw new Error(typeof payload.message === 'string' && payload.message.trim() ? payload.message : '请求失败')
    }
    return payload.data as T
  }

  return payload as T
}

function adaptPage<T>(page: BackendPageResponse<T> | T[]): PageResult<T> {
  if (Array.isArray(page)) {
    return {
      page: 1,
      pageSize: page.length,
      total: page.length,
      items: page
    }
  }

  return {
    page: Number(page.page || 1),
    pageSize: Number(page.pageSize || 20),
    total: Number(page.total || 0),
    items: Array.isArray(page.items) ? page.items : []
  }
}

async function apiRequest<T>(method: RequestMethod, url: string, options: RequestOptions = {}): Promise<T> {
  const response = await request.request<ApiResponse<T> | T>({
    url,
    method,
    params: options.params,
    data: options.data
  })

  return unwrapResponse(response.data)
}

function paginateMock<T>(items: T[], query: PageQuery = {}): PageResult<T> {
  const page = Math.max(1, query.page ?? 1)
  const pageSize = Math.max(1, query.pageSize ?? 20)

  return {
    page,
    pageSize,
    total: items.length,
    items: items.slice((page - 1) * pageSize, page * pageSize)
  }
}

function encodePathSegment(value: string) {
  return encodeURIComponent(value)
}

function resourceDetailPath(query: ResourceDetailQuery) {
  const base = `/clusters/${encodePathSegment(query.clusterId)}/resources/${encodePathSegment(query.resourceType)}/${encodePathSegment(query.name)}`
  return base
}

function normalizeConfirmPayload(confirm: unknown) {
  if (typeof confirm === 'boolean') {
    return { confirmed: confirm }
  }
  if (isRecord(confirm)) {
    return {
      confirmed: Boolean(confirm.confirmed),
      confirmationText: typeof confirm.confirmationText === 'string' ? confirm.confirmationText : undefined,
      reason: typeof confirm.reason === 'string' ? confirm.reason : undefined
    }
  }
  return { confirmed: false }
}

function mapHighRiskAction(action: HighRiskActionRequest): HighRiskActionId {
  const actionName = action.action as string
  if (actionName === 'delete') {
    if (action.resourceType === 'pods') return 'pod.delete'
    if (action.resourceType === 'namespaces') return 'namespace.delete'
    return 'resource.delete'
  }
  if (actionName === 'apply-yaml') return 'yaml.apply'
  if (actionName === 'scale') return 'workload.scale'
  if (actionName === 'restart') return 'workload.restart'
  if (actionName === 'update-image') return 'workload.setImage'
  if (actionName === 'rollback') return 'workload.rollback'
  if (actionName === 'terminal') return 'pod.exec'
  if (actionName === 'drain') return 'node.drain'
  if (actionName === 'cordon') return 'node.cordon'
  if (actionName === 'uncordon') return 'node.uncordon'
  if (actionName === 'reveal-secret') return 'secret.reveal'
  return action.action
}

function normalizeHighRiskAction(action: HighRiskActionRequest): HighRiskActionRequest {
  return {
    ...action,
    action: mapHighRiskAction(action),
    confirm: normalizeConfirmPayload(action.confirm)
  }
}

function clusterStatusForPage(status: ClusterSummary['status']) {
  if (status === 'healthy') return 'Ready'
  if (status === 'degraded' || status === 'testing') return 'Degraded'
  return 'Offline'
}

function credentialTypeForPage(type: ClusterSummary['credentialType']) {
  return type === 'serviceAccountToken' ? 'serviceAccount' : type
}

function toPageCluster(cluster: ClusterSummary) {
  return {
    ...cluster,
    status: clusterStatusForPage(cluster.status),
    version: cluster.kubernetesVersion,
    credentialType: credentialTypeForPage(cluster.credentialType),
    credentialMasked: cluster.credentialSummary,
    updatedAt: cluster.updatedAt,
    namespaces: cluster.namespaceCount
  }
}

function toPageDashboard(status: DashboardStatus) {
  const cluster = kubeClusters.find((item) => item.id === status.cluster.id) ?? kubeClusters[0]
  return {
    clusterName: status.cluster.name,
    kubernetesVersion: status.cluster.kubernetesVersion,
    apiServer: cluster?.apiServer ?? '-',
    metricsAvailable: status.metrics.available,
    metricsMessage: status.metrics.message,
    cards: status.resourceStats.map((item) => ({
      label: item.label,
      value: item.value,
      hint: item.route,
      icon: item.label.toLowerCase().includes('pod') ? 'cube' : item.label.toLowerCase().includes('node') ? 'server' : 'chart',
      tone: item.tone === 'neutral' ? 'primary' : item.tone
    })),
    capacity: [
      { label: 'Node', used: Math.round((status.capacity.nodesReady / Math.max(status.capacity.nodesTotal, 1)) * 100), total: String(status.capacity.nodesTotal), request: `${status.capacity.nodesReady} Ready`, limit: '集群节点', tone: 'primary' },
      { label: 'CPU', used: 62, total: status.capacity.cpuAllocatable, request: status.metrics.cpuUsage, limit: 'requests / allocatable', tone: 'success' },
      { label: '内存', used: 58, total: status.capacity.memoryAllocatable, request: status.metrics.memoryUsage, limit: 'requests / allocatable', tone: 'warning' },
      { label: 'Pod 容量', used: 39, total: String(status.capacity.podCapacity), request: '按容量降级展示', limit: 'Metrics API 可选', tone: 'primary' }
    ],
    workloads: [
      { kind: 'Deployment', ready: 8, total: 9, warning: '滚动状态由详情页查看' },
      { kind: 'StatefulSet', ready: 3, total: 3, warning: '全部可用' },
      { kind: 'DaemonSet', ready: status.capacity.nodesReady, total: status.capacity.nodesTotal, warning: '按节点覆盖' },
      { kind: 'Job / CronJob', ready: 12, total: 14, warning: '历史失败任务可在 Event 查看' }
    ],
    events: status.recentEvents.map((event) => ({
      id: event.id,
      type: event.type,
      reason: event.reason,
      message: event.message,
      involvedObject: `${event.involvedObject.kind}/${event.involvedObject.name}`,
      namespace: event.involvedObject.namespace ?? '-',
      lastSeen: event.lastTimestamp
    }))
  }
}

function graphLane(kind: string) {
  if (kind === 'Namespace') return 'namespace'
  if (['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet', 'Job', 'CronJob'].includes(kind)) return 'workload'
  if (kind === 'Pod') return 'runtime'
  if (['Service', 'Ingress', 'Endpoint', 'EndpointSlice', 'NetworkPolicy'].includes(kind)) return 'network'
  return 'storage'
}

function graphStatus(tone: string) {
  if (tone === 'success') return 'Healthy'
  if (tone === 'warning') return 'Warning'
  if (tone === 'danger') return 'Error'
  return 'Pending'
}

function toPageGraph(graph: ResourceGraph) {
  return {
    nodes: graph.nodes.map((node) => ({
      id: node.id,
      kind: node.kind,
      name: node.label,
      namespace: node.namespace,
      status: graphStatus(node.tone),
      lane: graphLane(node.kind),
      href: node.route,
      summary: node.status
    })),
    edges: graph.edges.map((edge) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      relation: edge.label
    }))
  }
}

function actionResult(message: string): ActionResult {
  return {
    accepted: true,
    status: 'recorded',
    message,
    auditId: `audit_mock_${Date.now()}`,
    affectedResources: [],
    requiresRefresh: true
  }
}

export function apiErrorMessage(error: unknown, fallback = '请求失败') {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data
    if (isRecord(data) && typeof data.message === 'string' && data.message.trim()) {
      return data.message
    }
    if (typeof error.message === 'string' && error.message.trim()) {
      return error.message
    }
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message
  }
  return fallback
}

export function isMockEnabled() {
  return kubeApiConfig.mockEnabled
}

export async function getExampleData<T>(url: string): Promise<T> {
  return apiRequest<T>('get', url)
}

export async function getShellContext(query: ShellContextQuery = {}): Promise<ShellContext> {
  if (isMockEnabled()) {
    return getMockShellContext(query.clusterId, query.namespace)
  }

  return apiRequest<ShellContext>('get', '/me/context', {
    params: {
      clusterId: query.clusterId,
      namespace: query.namespace
    }
  })
}

export async function listClusters(query: PageQuery & { keyword?: string } = {}): Promise<PageResult<ClusterSummary>> {
  if (isMockEnabled()) {
    const keyword = query.keyword?.trim().toLowerCase()
    const items = keyword
      ? kubeClusters.filter((cluster) => [cluster.name, cluster.apiServer, cluster.description].join(' ').toLowerCase().includes(keyword))
      : kubeClusters
    return paginateMock(items, query)
  }

  const page = await apiRequest<BackendPageResponse<ClusterSummary>>('get', '/clusters', {
    params: {
      page: query.page,
      pageSize: query.pageSize,
      keyword: query.keyword
    }
  })
  return adaptPage(page)
}

export async function listKubeClusters(query: PageQuery & { keyword?: string } = {}) {
  const page = await listClusters(query)
  return page.items.map(toPageCluster)
}

export const getKubeClusters = listKubeClusters

export async function getClusterCredentialFormContract(): Promise<ClusterCredentialFormContract> {
  return clusterCredentialFormContract
}

export async function listNamespaces(clusterId: string): Promise<NamespaceSummary[]> {
  if (isMockEnabled()) {
    return kubeNamespaces[clusterId] ?? []
  }

  return apiRequest<NamespaceSummary[]>('get', `/clusters/${encodePathSegment(clusterId)}/namespaces`)
}

export async function listKubeNamespaces(clusterId: string) {
  return listNamespaces(clusterId)
}

export const getKubeNamespaces = listKubeNamespaces

export async function listResourceDefinitions(): Promise<ResourceDefinition[]> {
  if (isMockEnabled()) {
    return resourceDefinitions
  }

  return apiRequest<ResourceDefinition[]>('get', '/resource-definitions')
}

export async function getResourceDefinitionByRoute(route: string): Promise<ResourceDefinition | undefined> {
  if (isMockEnabled()) {
    return getMockResourceDefinitionByRoute(route)
  }

  const definitions = await listResourceDefinitions()
  return definitions.find((definition) => definition.route === route || route.startsWith(`${definition.route}/`))
}

export async function getResourceDefinition(resourceType: string): Promise<ResourceDefinition | undefined> {
  if (isMockEnabled()) {
    return getMockResourceDefinition(resourceType)
  }

  const definitions = await listResourceDefinitions()
  return definitions.find((definition) => definition.resourceType === resourceType)
}

export async function listResourceSummaries(query: ResourceListQuery): Promise<PageResult<ResourceSummary>> {
  if (isMockEnabled()) {
    return listMockResourceSummaries(query)
  }

  const page = await apiRequest<BackendPageResponse<ResourceSummary>>(
    'get',
    `/clusters/${encodePathSegment(query.clusterId)}/resources/${encodePathSegment(query.resourceType)}`,
    {
      params: {
        namespace: query.namespace,
        name: query.name,
        labels: query.labels,
        status: query.status,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
        page: query.page,
        pageSize: query.pageSize
      }
    }
  )
  return adaptPage(page)
}

export async function listKubeResources(query: ResourceListQuery): Promise<PageResult<ResourceSummary>> {
  return listResourceSummaries(query)
}

export const listResources = listResourceSummaries
export const getKubeResourceList = listKubeResources

export async function getResourceDetail(query: ResourceDetailQuery): Promise<ResourceDetail> {
  if (isMockEnabled()) {
    return getMockResourceDetail(query)
  }

  return apiRequest<ResourceDetail>('get', resourceDetailPath(query), {
    params: {
      namespace: query.namespace
    }
  })
}

export async function getResourceYaml(query: ResourceDetailQuery): Promise<string> {
  if (isMockEnabled()) {
    return getMockResourceDetail(query).yaml
  }

  const data = await apiRequest<{ yaml: string }>('get', `/clusters/${encodePathSegment(query.clusterId)}/yaml`, {
    params: {
      resourceType: query.resourceType,
      namespace: query.namespace,
      name: query.name
    }
  })
  return data.yaml
}

export async function listResourceEvents(query: ResourceDetailQuery): Promise<KubeEvent[]> {
  if (isMockEnabled()) {
    return getMockResourceDetail(query).events
  }

  return apiRequest<KubeEvent[]>('get', `${resourceDetailPath(query)}/events`, {
    params: {
      namespace: query.namespace
    }
  })
}

export async function getDashboardStatus(clusterId = 'cluster-prod', namespace = 'platform'): Promise<DashboardStatus> {
  if (isMockEnabled()) {
    return {
      ...dashboardStatus,
      namespace
    }
  }

  return apiRequest<DashboardStatus>('get', `/clusters/${encodePathSegment(clusterId)}/dashboard/status`, {
    params: { namespace }
  })
}

export async function getKubeDashboard(query: { clusterId?: string; namespace?: string } = {}) {
  return toPageDashboard(await getDashboardStatus(query.clusterId, query.namespace))
}

export const getClusterDashboard = getKubeDashboard
export const getClusterStatus = getKubeDashboard

export async function getResourceGraph(clusterId = 'cluster-prod', namespace = 'platform'): Promise<ResourceGraph> {
  if (isMockEnabled()) {
    return {
      ...resourceGraph,
      clusterId,
      namespace
    }
  }

  return apiRequest<ResourceGraph>('get', `/clusters/${encodePathSegment(clusterId)}/dashboard/graph`, {
    params: { namespace }
  })
}

export async function getKubeResourceGraph(query: { clusterId?: string; namespace?: string } = {}) {
  return toPageGraph(await getResourceGraph(query.clusterId, query.namespace))
}

export const listResourceRelations = getKubeResourceGraph

export async function searchResources(query: SearchResourceQuery): Promise<PageResult<SearchResourceResult>> {
  if (isMockEnabled()) {
    return paginateMock(searchMockResources(query.keyword, query.clusterId, query.namespace, query.resourceType), query)
  }

  const page = await apiRequest<BackendPageResponse<SearchResourceResult>>('get', '/search', {
    params: {
      clusterId: query.clusterId,
      keyword: query.keyword,
      namespace: query.namespace,
      resourceType: query.resourceType,
      page: query.page,
      pageSize: query.pageSize
    }
  })
  return adaptPage(page)
}

export async function listPodLogs(query: PodLogsQuery): Promise<PodLogLine[] | string> {
  if (isMockEnabled()) {
    const key = `${query.namespace}/${query.podName}`
    const lines = podLogLines[key] ?? []
    return lines.slice(-(query.tailLines ?? lines.length))
  }

  return apiRequest<string>('get', `/clusters/${encodePathSegment(query.clusterId)}/pods/${encodePathSegment(query.podName)}/logs`, {
    params: {
      namespace: query.namespace,
      container: query.container,
      tailLines: query.tailLines,
      follow: query.follow
    }
  })
}

export async function getKubePodLogs(query: PodLogsQuery) {
  const logs = await listPodLogs(query)
  if (Array.isArray(logs)) {
    return logs.map((line) => `[${line.timestamp}] ${line.stream} ${line.message}`).join('\n')
  }
  return logs
}

export const getPodLogs = getKubePodLogs

export async function openPodTerminal(requestPayload: PodTerminalRequest): Promise<PodTerminalSession> {
  if (isMockEnabled()) {
    return {
      sessionId: `mock-term-${Date.now()}`,
      clusterId: requestPayload.clusterId,
      namespace: requestPayload.namespace,
      podName: requestPayload.podName,
      container: requestPayload.container || 'app',
      status: requestPayload.confirm.confirmed ? 'mock-ready' : 'denied',
      auditHint: 'mock 模式仅返回终端会话占位；真实 WebSocket 由后端 API-017 建连并写审计。',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString()
    }
  }

  return apiRequest<PodTerminalSession>(
    'post',
    `/clusters/${encodePathSegment(requestPayload.clusterId)}/pods/${encodePathSegment(requestPayload.podName)}/exec`,
    {
      data: {
        namespace: requestPayload.namespace,
        container: requestPayload.container,
        confirm: requestPayload.confirm
      }
    }
  )
}

export async function openKubePodTerminal(payload: HighRiskActionRequest): Promise<PodTerminalSession> {
  return openPodTerminal({
    clusterId: payload.clusterId,
    namespace: payload.namespace ?? 'default',
    podName: payload.name ?? '',
    container: typeof payload.payload?.container === 'string' ? payload.payload.container : undefined,
    confirm: normalizeConfirmPayload(payload.confirm)
  })
}

export async function getHighRiskActionMetadata(action: HighRiskActionRequest): Promise<HighRiskConfirmMetadata> {
  if (isMockEnabled()) {
    return getHighRiskConfirmMetadata(action.action, action.name)
  }

  return apiRequest<HighRiskConfirmMetadata>('get', '/high-risk-action-metadata', {
    params: {
      action: action.action,
      clusterId: action.clusterId,
      resourceType: action.resourceType,
      namespace: action.namespace,
      name: action.name
    }
  })
}

export async function performHighRiskAction(action: HighRiskActionRequest): Promise<ActionResult> {
  action = normalizeHighRiskAction(action)

  if (isMockEnabled()) {
    if (!action.confirm.confirmed) {
      return {
        accepted: false,
        status: 'failed',
        message: '操作未确认，mock 未执行。',
        auditId: 'audit_mock_denied',
        affectedResources: [],
        requiresRefresh: false
      }
    }

    return {
      accepted: true,
      status: 'recorded',
      message: `mock 已记录 ${action.action}，真实模式由后端校验权限、确认载荷和 Kubernetes API 结果。`,
      auditId: `audit_mock_${Date.now()}`,
      affectedResources: [action.name ?? action.resourceType ?? action.action].filter(Boolean),
      requiresRefresh: true
    }
  }

  if (action.action.startsWith('workload.')) {
    const actionName = action.action.replace('workload.', '')
    return apiRequest<ActionResult>(
      'post',
      `/clusters/${encodePathSegment(action.clusterId)}/workloads/${encodePathSegment(action.kind ?? action.resourceType ?? '')}/${encodePathSegment(action.name ?? '')}/actions/${encodePathSegment(actionName)}`,
      {
        data: {
          namespace: action.namespace,
          payload: action.payload,
          confirm: action.confirm
        }
      }
    )
  }

  if (action.action.startsWith('node.')) {
    const actionName = action.action.replace('node.', '')
    return apiRequest<ActionResult>(
      'post',
      `/clusters/${encodePathSegment(action.clusterId)}/nodes/${encodePathSegment(action.name ?? '')}/actions/${encodePathSegment(actionName)}`,
      {
        data: {
          payload: action.payload,
          confirm: action.confirm
        }
      }
    )
  }

  if (action.action === 'secret.reveal') {
    return apiRequest<ActionResult>(
      'post',
      `/clusters/${encodePathSegment(action.clusterId)}/secrets/${encodePathSegment(action.name ?? '')}/reveal`,
      {
        data: {
          namespace: action.namespace,
          confirm: action.confirm
        }
      }
    )
  }

  if (action.action === 'yaml.apply') {
    return apiRequest<ActionResult>('post', `/clusters/${encodePathSegment(action.clusterId)}/yaml/apply`, {
      data: {
        namespace: action.namespace,
        yaml: action.payload?.yaml,
        confirm: action.confirm
      }
    })
  }

  if (action.action.endsWith('.delete')) {
    return apiRequest<ActionResult>(
      'delete',
      `/clusters/${encodePathSegment(action.clusterId)}/resources/${encodePathSegment(action.resourceType ?? '')}/${encodePathSegment(action.name ?? '')}`,
      {
        params: {
          namespace: action.namespace
        },
        data: {
          confirm: action.confirm
        }
      }
    )
  }

  return apiRequest<ActionResult>('post', '/high-risk-actions', {
    data: action
  })
}

export async function createKubeResource(payload: Record<string, unknown>) {
  if (isMockEnabled()) return actionResult('资源创建请求已记录。')
  const clusterId = String(payload.clusterId ?? '')
  const resourceType = String(payload.resourceType ?? '')
  return apiRequest<ActionResult>('post', `/clusters/${encodePathSegment(clusterId)}/resources/${encodePathSegment(resourceType)}`, {
    data: {
      ...payload,
      confirm: normalizeConfirmPayload(payload.confirm ?? true)
    }
  })
}

export const createResource = createKubeResource

export async function updateKubeResource(payload: Record<string, unknown>) {
  if (isMockEnabled()) return actionResult('资源编辑请求已记录。')
  const clusterId = String(payload.clusterId ?? '')
  const resourceType = String(payload.resourceType ?? '')
  const name = String(payload.name ?? '')
  return apiRequest<ActionResult>('patch', `/clusters/${encodePathSegment(clusterId)}/resources/${encodePathSegment(resourceType)}/${encodePathSegment(name)}`, {
    data: {
      ...payload,
      confirm: normalizeConfirmPayload(payload.confirm ?? true)
    }
  })
}

export const updateResource = updateKubeResource

export async function deleteKubeResource(payload: HighRiskActionRequest) {
  return performHighRiskAction({ ...payload, action: 'resource.delete' })
}

export const deleteResource = deleteKubeResource

export async function applyKubeYaml(payload: HighRiskActionRequest) {
  return performHighRiskAction({ ...payload, action: 'yaml.apply' })
}

export const applyYaml = applyKubeYaml

export async function revealKubeSecret(payload: HighRiskActionRequest) {
  const result = await performHighRiskAction({ ...payload, action: 'secret.reveal' })
  return {
    ...result,
    data: isMockEnabled() ? { username: 'admin', password: 'mock-secret-value' } : undefined
  }
}

export const revealSecret = revealKubeSecret

export async function performKubeNodeAction(payload: HighRiskActionRequest) {
  const action = String(payload.action ?? '')
  const mappedAction = action === 'drain' || action === 'cordon' || action === 'uncordon' ? `node.${action}` : action
  return performHighRiskAction({ ...payload, action: mappedAction as HighRiskActionId })
}

export const performNodeAction = performKubeNodeAction

export async function performKubeWorkloadAction(payload: HighRiskActionRequest) {
  const action = String(payload.action ?? '')
  const mappedAction =
    action === 'scale'
      ? 'workload.scale'
      : action === 'restart'
        ? 'workload.restart'
        : action === 'update-image'
          ? 'workload.setImage'
          : action === 'rollback'
            ? 'workload.rollback'
            : action
  return performHighRiskAction({ ...payload, action: mappedAction as HighRiskActionId })
}

export const performWorkloadAction = performKubeWorkloadAction

export async function createKubeCluster(payload: Record<string, unknown>) {
  if (isMockEnabled()) return actionResult('集群创建请求已记录，凭据不会在前端长期保存。')
  return apiRequest<ActionResult>('post', '/clusters', { data: payload })
}

export const createCluster = createKubeCluster

export async function updateKubeCluster(payload: Record<string, unknown>) {
  const clusterId = String(payload.id ?? payload.clusterId ?? '')
  if (isMockEnabled()) return actionResult('集群更新请求已记录，凭据字段仅短暂提交。')
  return apiRequest<ActionResult>('patch', `/clusters/${encodePathSegment(clusterId)}`, { data: payload })
}

export const updateCluster = updateKubeCluster

export async function testKubeClusterConnection(payload: { clusterId: string }) {
  if (isMockEnabled()) {
    return {
      ok: true,
      message: '连接成功，已获取 Kubernetes 版本和 Namespace 列表。'
    }
  }
  return apiRequest<{ ok: boolean; message: string }>('post', `/clusters/${encodePathSegment(payload.clusterId)}/test`)
}

export const testClusterConnection = testKubeClusterConnection

export async function deleteKubeCluster(payload: { clusterId: string; confirm?: boolean }) {
  if (isMockEnabled()) return actionResult('集群删除请求已记录。')
  return apiRequest<ActionResult>('delete', `/clusters/${encodePathSegment(payload.clusterId)}`, {
    data: {
      confirm: normalizeConfirmPayload(payload.confirm ?? true)
    }
  })
}

export const deleteCluster = deleteKubeCluster

export async function listAuditLogs(query: AuditLogQuery = {}): Promise<PageResult<AuditLogEntry>> {
  if (isMockEnabled()) {
    const items = auditLogs.filter((entry) => {
      if (query.user && !entry.user.toLowerCase().includes(query.user.toLowerCase())) return false
      if (query.clusterId) {
        const cluster = kubeClusters.find((item) => item.id === query.clusterId)
        if (cluster && entry.clusterName !== cluster.name) return false
      }
      if (query.namespace && entry.namespace !== query.namespace) return false
      if (query.resourceType && entry.resourceType !== query.resourceType) return false
      if (query.action && entry.action !== query.action) return false
      if (query.result && entry.result !== query.result) return false
      return true
    })
    return paginateMock(items, query)
  }

  const page = await apiRequest<BackendPageResponse<AuditLogEntry>>('get', '/audit-logs', {
    params: query as Record<string, unknown>
  })
  return adaptPage(page)
}

export async function listKubeAuditLogs(query: AuditLogQuery = {}) {
  const page = await listAuditLogs(query)
  return page.items.map((entry) => ({
    id: entry.id,
    user: entry.user,
    action: entry.action,
    resource: [entry.namespace, entry.resourceType, entry.resourceName].filter(Boolean).join('/'),
    result: entry.result === 'success' ? '成功' : '失败',
    time: entry.timestamp,
    reason: entry.message
  }))
}

export async function listSettingsAccess(): Promise<SettingsAccessView> {
  if (isMockEnabled()) {
    return settingsAccess
  }

  return apiRequest<SettingsAccessView>('get', '/settings/access-view')
}

export async function getKubeSecuritySettings() {
  const access = await listSettingsAccess()
  return {
    requireHighRiskConfirm: true,
    requireTerminalReason: access.highRiskConfirmation.requireReason,
    secretRevealTtlSeconds: 120,
    credentialRotationDays: 90,
    allowedCredentialTypes: ['kubeconfig', 'token', 'serviceAccount'],
    denyNamespaceDeleteWithoutAdmin: true
  }
}

export const getSecuritySettings = getKubeSecuritySettings

export async function getKubeAuditSettings() {
  const access = await listSettingsAccess()
  return {
    retentionDays: access.auditRetentionDays,
    recordReadActions: false,
    exportEnabled: true,
    failedActionAlert: true
  }
}

export const getAuditSettings = getKubeAuditSettings

export async function listKubeUsers() {
  if (!isMockEnabled()) {
    const page = await apiRequest<BackendPageResponse<{ id: string; username: string; roleNames?: string[]; status?: string; lastLoginAt?: string }>>('get', '/users')
    return adaptPage(page).items.map((user) => ({
      id: user.id,
      name: user.username,
      role: user.roleNames?.join(' / ') ?? '-',
      status: user.status ?? '-',
      lastLogin: user.lastLoginAt ?? '-'
    }))
  }

  return [
    { id: 'usr-admin', name: currentUser.username, role: currentUser.roleNames.join(' / '), status: '启用', lastLogin: '2026-05-27 10:30' },
    { id: 'usr-sre', name: 'sre-oncall', role: 'SRE 运维', status: '启用', lastLogin: '2026-05-27 10:12' },
    { id: 'usr-readonly', name: 'readonly', role: '只读用户', status: '启用', lastLogin: '2026-05-26 18:22' }
  ]
}

export const listUsers = listKubeUsers

export async function listKubeRoles() {
  if (!isMockEnabled()) {
    const page = await apiRequest<BackendPageResponse<{ id: string; name: string; description?: string; permissions?: string[]; scopes?: string[] }>>('get', '/roles')
    return adaptPage(page).items.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description ?? '',
      permissions: role.permissions ?? [],
      scopes: role.scopes ?? []
    }))
  }

  return settingsAccess.roles.map((role) => ({
    id: role.id,
    name: role.name,
    description: role.scopes.join('；'),
    permissions: role.permissions,
    scopes: role.scopes
  }))
}

export const listRoles = listKubeRoles

export async function updateKubeSettings(payload: Record<string, unknown>) {
  if (isMockEnabled()) return actionResult(`${String(payload.domain ?? 'settings')} 设置已记录。`)
  return apiRequest<ActionResult>('patch', '/settings', { data: payload })
}

export const saveKubeSecuritySettings = updateKubeSettings
export const saveSecuritySettings = updateKubeSettings
export const saveKubeAuditSettings = updateKubeSettings
export const saveAuditSettings = updateKubeSettings
export const saveKubeAccessSettings = updateKubeSettings
export const saveRolePermissions = updateKubeSettings

export async function listClusterEvents(clusterId: string, query: PageQuery & { namespace?: string } = {}): Promise<PageResult<KubeEvent>> {
  if (isMockEnabled()) {
    return paginateMock(
      kubeEvents.filter((event) => !query.namespace || event.involvedObject.namespace === query.namespace),
      query
    )
  }

  const page = await apiRequest<BackendPageResponse<KubeEvent>>('get', `/clusters/${encodePathSegment(clusterId)}/events`, {
    params: {
      namespace: query.namespace,
      page: query.page,
      pageSize: query.pageSize
    }
  })
  return adaptPage(page)
}

export type {
  ActionResult,
  AuditLogEntry,
  AuditLogQuery,
  ClusterCredentialFormContract,
  ClusterSummary,
  DashboardStatus,
  HighRiskActionRequest,
  HighRiskConfirmMetadata,
  NamespaceSummary,
  PageResult,
  PodLogsQuery,
  PodLogLine,
  PodTerminalRequest,
  PodTerminalSession,
  ResourceDefinition,
  ResourceDetail,
  ResourceDetailQuery,
  ResourceGraph,
  ResourceListQuery,
  ResourceSummary,
  SearchResourceQuery,
  SearchResourceResult,
  SettingsAccessView,
  ShellContext
}
