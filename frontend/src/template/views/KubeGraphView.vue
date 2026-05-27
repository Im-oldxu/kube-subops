<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { Icon } from '@/components/icons'
import Select from '@/components/common/Select.vue'
import * as templateApi from '@/template/api'
import * as templateData from '@/template/data'

type ApiFn<TArgs extends unknown[], TResult> = (...args: TArgs) => Promise<TResult> | TResult
type GraphStatus = 'Healthy' | 'Warning' | 'Pending' | 'Error'

interface GraphNode {
  id: string
  kind: string
  name: string
  namespace?: string
  status: GraphStatus
  lane: 'namespace' | 'workload' | 'runtime' | 'network' | 'storage'
  href?: string
  summary: string
}

interface GraphEdge {
  id: string
  source: string
  target: string
  relation: string
}

interface ClusterOption {
  id: string
  name: string
}

interface NamespaceOption {
  name: string
}

interface GraphData {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

const apiBag = templateApi as Record<string, unknown>
const dataBag = templateData as Record<string, unknown>

const fallbackClusters: ClusterOption[] = [
  { id: 'prod-main', name: 'prod-main' },
  { id: 'staging', name: 'staging' },
  { id: 'dev-sandbox', name: 'dev-sandbox' }
]

const fallbackNamespaces: NamespaceOption[] = [
  { name: 'default' },
  { name: 'platform' },
  { name: 'observability' },
  { name: 'all-namespaces' }
]

const fallbackGraph: GraphData = {
  nodes: [
    { id: 'ns-platform', kind: 'Namespace', name: 'platform', namespace: 'platform', status: 'Healthy', lane: 'namespace', summary: '平台组件命名空间', href: '/other/namespaces' },
    { id: 'deploy-console', kind: 'Deployment', name: 'console', namespace: 'platform', status: 'Healthy', lane: 'workload', summary: '3/3 replicas', href: '/workloads/deployments' },
    { id: 'rs-console', kind: 'ReplicaSet', name: 'console-6f5fbcc8b6', namespace: 'platform', status: 'Healthy', lane: 'workload', summary: '当前 revision', href: '/workloads/replicasets' },
    { id: 'pod-console-a', kind: 'Pod', name: 'console-6f5fbcc8b6-k9wp8', namespace: 'platform', status: 'Healthy', lane: 'runtime', summary: 'Running · node-a', href: '/pods' },
    { id: 'pod-console-b', kind: 'Pod', name: 'console-6f5fbcc8b6-nv2sq', namespace: 'platform', status: 'Warning', lane: 'runtime', summary: 'Readiness probe failed', href: '/pods' },
    { id: 'svc-console', kind: 'Service', name: 'console', namespace: 'platform', status: 'Healthy', lane: 'network', summary: 'ClusterIP 10.96.21.8', href: '/network/services' },
    { id: 'ing-console', kind: 'Ingress', name: 'console', namespace: 'platform', status: 'Healthy', lane: 'network', summary: 'console.example.internal', href: '/network/ingresses' },
    { id: 'pvc-console', kind: 'PVC', name: 'console-data', namespace: 'platform', status: 'Healthy', lane: 'storage', summary: 'Bound · 40Gi', href: '/storage/persistent-volume-claims' },
    { id: 'deploy-api', kind: 'Deployment', name: 'payment-api', namespace: 'platform', status: 'Pending', lane: 'workload', summary: '4/6 replicas', href: '/workloads/deployments' },
    { id: 'svc-api', kind: 'Service', name: 'payment-api', namespace: 'platform', status: 'Warning', lane: 'network', summary: '2 endpoints not ready', href: '/network/services' }
  ],
  edges: [
    { id: 'e1', source: 'ns-platform', target: 'deploy-console', relation: 'contains' },
    { id: 'e2', source: 'deploy-console', target: 'rs-console', relation: 'owns' },
    { id: 'e3', source: 'rs-console', target: 'pod-console-a', relation: 'creates' },
    { id: 'e4', source: 'rs-console', target: 'pod-console-b', relation: 'creates' },
    { id: 'e5', source: 'svc-console', target: 'pod-console-a', relation: 'selects' },
    { id: 'e6', source: 'svc-console', target: 'pod-console-b', relation: 'selects' },
    { id: 'e7', source: 'ing-console', target: 'svc-console', relation: 'routes' },
    { id: 'e8', source: 'pod-console-a', target: 'pvc-console', relation: 'mounts' },
    { id: 'e9', source: 'ns-platform', target: 'deploy-api', relation: 'contains' },
    { id: 'e10', source: 'svc-api', target: 'deploy-api', relation: 'selects' }
  ]
}

const laneOrder = ['namespace', 'workload', 'runtime', 'network', 'storage'] as const
const laneLabels: Record<GraphNode['lane'], string> = {
  namespace: 'Namespace',
  workload: '工作负载',
  runtime: 'Pod / 运行时',
  network: 'Service / Ingress',
  storage: 'PVC / 存储'
}

const filters = reactive({
  clusterId: 'prod-main',
  namespace: 'platform',
  keyword: '',
  status: 'all'
})
const clusters = ref<ClusterOption[]>(fallbackClusters)
const namespaces = ref<NamespaceOption[]>(fallbackNamespaces)
const graph = ref<GraphData>(fallbackGraph)
const selectedNodeId = ref('deploy-console')
const loading = ref(false)
const errorMessage = ref('')

const clusterOptions = computed(() => clusters.value.map((cluster) => ({ label: cluster.name, value: cluster.id })))
const namespaceOptions = computed(() => namespaces.value.map((namespace) => ({ label: namespace.name, value: namespace.name })))
const statusOptions = [
  { label: '全部状态', value: 'all' },
  { label: 'Healthy', value: 'Healthy' },
  { label: 'Warning', value: 'Warning' },
  { label: 'Pending', value: 'Pending' },
  { label: 'Error', value: 'Error' }
]

const filteredNodes = computed(() => {
  const keyword = filters.keyword.trim().toLowerCase()
  return graph.value.nodes
    .filter((node) => filters.namespace === 'all-namespaces' || node.namespace === filters.namespace || node.kind === 'Namespace')
    .filter((node) => filters.status === 'all' || node.status === filters.status)
    .filter((node) => {
      if (!keyword) return true
      return `${node.kind} ${node.name} ${node.namespace ?? ''} ${node.summary}`.toLowerCase().includes(keyword)
    })
})

const visibleNodeIds = computed(() => new Set(filteredNodes.value.map((node) => node.id)))
const filteredEdges = computed(() => graph.value.edges.filter((edge) => visibleNodeIds.value.has(edge.source) && visibleNodeIds.value.has(edge.target)))
const nodesByLane = computed(() => {
  return laneOrder.map((lane) => ({
    lane,
    label: laneLabels[lane],
    nodes: filteredNodes.value.filter((node) => node.lane === lane)
  }))
})
const selectedNode = computed(() => filteredNodes.value.find((node) => node.id === selectedNodeId.value) ?? filteredNodes.value[0])
const selectedRelations = computed(() => {
  if (!selectedNode.value) return []
  return filteredEdges.value.filter((edge) => edge.source === selectedNode.value?.id || edge.target === selectedNode.value?.id)
})

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

function normalizeGraph(value: unknown): GraphData {
  if (typeof value === 'object' && value !== null) {
    const candidate = value as Partial<GraphData>
    return {
      nodes: Array.isArray(candidate.nodes) ? candidate.nodes as GraphNode[] : fallbackGraph.nodes,
      edges: Array.isArray(candidate.edges) ? candidate.edges as GraphEdge[] : fallbackGraph.edges
    }
  }
  return fallbackGraph
}

function nodeStatusClass(status: GraphStatus) {
  return {
    Healthy: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300',
    Warning: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300',
    Pending: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/40 dark:bg-sky-950/30 dark:text-sky-300',
    Error: 'border-red-200 bg-red-50 text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300'
  }[status]
}

function relationLabel(edge: GraphEdge) {
  const source = graph.value.nodes.find((node) => node.id === edge.source)
  const target = graph.value.nodes.find((node) => node.id === edge.target)
  return `${source?.kind ?? edge.source}/${source?.name ?? edge.source} ${edge.relation} ${target?.kind ?? edge.target}/${target?.name ?? edge.target}`
}

async function refreshGraph() {
  loading.value = true
  errorMessage.value = ''
  try {
    const clusterFallback = getDataExport<ClusterOption[]>('kubeClusters') ?? fallbackClusters
    const namespaceFallback = getDataExport<NamespaceOption[]>('kubeNamespaces') ?? fallbackNamespaces
    const graphFallback = getDataExport<GraphData>('kubeResourceGraph') ?? fallbackGraph

    clusters.value = await callApi(['listKubeClusters', 'getKubeClusters', 'listClusters'], [], clusterFallback)
    namespaces.value = await callApi(['listKubeNamespaces', 'getKubeNamespaces', 'listNamespaces'], [filters.clusterId], namespaceFallback)
    graph.value = normalizeGraph(await callApi(['getKubeResourceGraph', 'getResourceGraph', 'listResourceRelations'], [{ ...filters }], graphFallback))
    if (!selectedNode.value) selectedNodeId.value = filteredNodes.value[0]?.id ?? ''
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '资源关系加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  refreshGraph()
})
</script>

<template>
  <div class="space-y-6">
    <section class="card">
      <div class="card-header flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h2 class="text-base font-semibold text-gray-900 dark:text-white">资源关系图</h2>
          <p class="text-sm text-gray-500 dark:text-dark-400">按 Namespace、工作负载、Pod、网络和存储展示当前可见资源关系。</p>
        </div>
        <div class="grid gap-3 md:grid-cols-[180px_180px_160px_220px_auto]">
          <Select v-model="filters.clusterId" :options="clusterOptions" searchable @change="refreshGraph" />
          <Select v-model="filters.namespace" :options="namespaceOptions" searchable @change="refreshGraph" />
          <Select v-model="filters.status" :options="statusOptions" @change="refreshGraph" />
          <input v-model="filters.keyword" class="input" type="search" placeholder="搜索资源、关系、Namespace" />
          <button class="btn btn-secondary" type="button" :disabled="loading" @click="refreshGraph">
            <Icon name="refresh" size="sm" :class="{ 'animate-spin': loading }" />
            刷新
          </button>
        </div>
      </div>
      <div v-if="errorMessage" class="card-body">
        <div class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {{ errorMessage }}
        </div>
      </div>
    </section>

    <section class="grid gap-6 xl:grid-cols-[1fr_360px]">
      <div class="card">
        <div class="card-header flex flex-wrap items-center justify-between gap-3">
          <h2 class="text-base font-semibold text-gray-900 dark:text-white">拓扑视图</h2>
          <span class="badge badge-gray">{{ filteredNodes.length }} 个节点 · {{ filteredEdges.length }} 条关系</span>
        </div>
        <div class="card-body">
          <div v-if="loading" class="grid gap-4 md:grid-cols-5">
            <div v-for="lane in laneOrder" :key="lane" class="space-y-3">
              <div class="skeleton h-5 w-24"></div>
              <div class="skeleton h-24 w-full"></div>
              <div class="skeleton h-24 w-full"></div>
            </div>
          </div>
          <div v-else-if="filteredNodes.length" class="grid gap-4 lg:grid-cols-5">
            <div v-for="lane in nodesByLane" :key="lane.lane" class="min-w-0 rounded-xl border border-gray-100 bg-gray-50/60 p-3 dark:border-dark-700 dark:bg-dark-900/40">
              <p class="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-dark-400">{{ lane.label }}</p>
              <div class="space-y-3">
                <button
                  v-for="node in lane.nodes"
                  :key="node.id"
                  type="button"
                  class="w-full rounded-xl border bg-white p-3 text-left transition hover:-translate-y-0.5 hover:shadow-sm dark:bg-dark-800"
                  :class="[nodeStatusClass(node.status), selectedNode?.id === node.id ? 'ring-2 ring-primary-500/40' : '']"
                  @click="selectedNodeId = node.id"
                >
                  <div class="flex items-start justify-between gap-2">
                    <span class="badge bg-white/70 text-gray-700 dark:bg-dark-800/70 dark:text-dark-200">{{ node.kind }}</span>
                    <Icon v-if="selectedNode?.id === node.id" name="checkCircle" size="sm" />
                  </div>
                  <p class="mt-2 truncate text-sm font-semibold">{{ node.name }}</p>
                  <p class="mt-1 truncate text-xs opacity-80">{{ node.namespace || 'cluster scope' }}</p>
                  <p class="mt-2 text-xs leading-5 opacity-90">{{ node.summary }}</p>
                </button>
              </div>
            </div>
          </div>
          <div v-else class="empty-state">
            <Icon name="link" size="xl" class="empty-state-icon" />
            <p class="empty-state-title">暂无可见关系</p>
            <p class="empty-state-description">请调整 Namespace、状态或关键词后重新刷新。</p>
          </div>
        </div>
      </div>

      <aside class="space-y-6">
        <section class="card">
          <div class="card-header">
            <h2 class="text-base font-semibold text-gray-900 dark:text-white">选中资源</h2>
          </div>
          <div class="card-body">
            <div v-if="selectedNode" class="space-y-4">
              <div>
                <div class="flex flex-wrap items-center gap-2">
                  <span class="badge badge-primary">{{ selectedNode.kind }}</span>
                  <span class="badge" :class="selectedNode.status === 'Healthy' ? 'badge-success' : selectedNode.status === 'Error' ? 'badge-danger' : 'badge-warning'">
                    {{ selectedNode.status }}
                  </span>
                </div>
                <h3 class="mt-3 break-all text-lg font-semibold text-gray-900 dark:text-white">{{ selectedNode.name }}</h3>
                <p class="mt-1 text-sm text-gray-500 dark:text-dark-400">{{ selectedNode.namespace || '集群级资源' }}</p>
                <p class="mt-3 text-sm leading-6 text-gray-600 dark:text-dark-300">{{ selectedNode.summary }}</p>
              </div>
              <RouterLink v-if="selectedNode.href" :to="selectedNode.href" class="btn btn-secondary w-full">
                <Icon name="externalLink" size="sm" />
                打开资源列表
              </RouterLink>
            </div>
            <div v-else class="text-sm text-gray-500 dark:text-dark-400">请选择一个资源节点。</div>
          </div>
        </section>

        <section class="card">
          <div class="card-header">
            <h2 class="text-base font-semibold text-gray-900 dark:text-white">关联关系</h2>
          </div>
          <div class="card-body space-y-3">
            <div v-for="edge in selectedRelations" :key="edge.id" class="rounded-xl border border-gray-100 p-3 dark:border-dark-700">
              <p class="text-sm font-medium text-gray-900 dark:text-white">{{ edge.relation }}</p>
              <p class="mt-1 text-xs leading-5 text-gray-500 dark:text-dark-400">{{ relationLabel(edge) }}</p>
            </div>
            <div v-if="!selectedRelations.length" class="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500 dark:border-dark-700 dark:text-dark-400">
              暂无直接关系。
            </div>
          </div>
        </section>
      </aside>
    </section>

    <section class="card">
      <div class="card-header">
        <h2 class="text-base font-semibold text-gray-900 dark:text-white">关系明细</h2>
      </div>
      <div class="card-body">
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>源资源</th>
                <th>关系</th>
                <th>目标资源</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="edge in filteredEdges" :key="edge.id">
                <td>{{ graph.nodes.find((node) => node.id === edge.source)?.name ?? edge.source }}</td>
                <td><span class="badge badge-gray">{{ edge.relation }}</span></td>
                <td>{{ graph.nodes.find((node) => node.id === edge.target)?.name ?? edge.target }}</td>
              </tr>
              <tr v-if="!filteredEdges.length">
                <td colspan="3" class="text-center text-gray-500 dark:text-dark-400">暂无关系数据</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </div>
</template>
