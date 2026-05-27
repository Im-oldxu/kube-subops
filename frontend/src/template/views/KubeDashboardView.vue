<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { Icon } from '@/components/icons'
import Select from '@/components/common/Select.vue'
import * as templateApi from '@/template/api'
import * as templateData from '@/template/data'

type ApiFn<TArgs extends unknown[], TResult> = (...args: TArgs) => Promise<TResult> | TResult
type Tone = 'primary' | 'success' | 'warning' | 'danger'

interface ClusterOption {
  id: string
  name: string
  status: 'Ready' | 'Degraded' | 'Offline'
  version: string
}

interface NamespaceOption {
  name: string
  status: 'Active' | 'Terminating'
}

interface SummaryCard {
  label: string
  value: string
  hint: string
  icon: InstanceType<typeof Icon>['$props']['name']
  tone: Tone
}

interface CapacityItem {
  label: string
  used: number
  total: string
  request: string
  limit: string
  tone: Tone
}

interface WorkloadHealthItem {
  kind: string
  ready: number
  total: number
  warning: string
}

interface KubeEventItem {
  id: string
  type: 'Normal' | 'Warning'
  reason: string
  message: string
  involvedObject: string
  namespace: string
  lastSeen: string
}

interface ClusterDashboard {
  clusterName: string
  kubernetesVersion: string
  apiServer: string
  metricsAvailable: boolean
  metricsMessage: string
  cards: SummaryCard[]
  capacity: CapacityItem[]
  workloads: WorkloadHealthItem[]
  events: KubeEventItem[]
}

const apiBag = templateApi as Record<string, unknown>
const dataBag = templateData as Record<string, unknown>

const fallbackClusters: ClusterOption[] = [
  { id: 'prod-main', name: 'prod-main', status: 'Ready', version: 'v1.29.4' },
  { id: 'staging', name: 'staging', status: 'Ready', version: 'v1.28.8' },
  { id: 'dev-sandbox', name: 'dev-sandbox', status: 'Degraded', version: 'v1.27.13' }
]

const fallbackNamespaces: NamespaceOption[] = [
  { name: 'all-namespaces', status: 'Active' },
  { name: 'default', status: 'Active' },
  { name: 'kube-system', status: 'Active' },
  { name: 'platform', status: 'Active' },
  { name: 'observability', status: 'Active' }
]

const fallbackDashboard: ClusterDashboard = {
  clusterName: 'prod-main',
  kubernetesVersion: 'v1.29.4',
  apiServer: 'https://10.0.12.8:6443',
  metricsAvailable: false,
  metricsMessage: 'Metrics API 暂不可用，页面展示容量、requests、limits 和最近状态。',
  cards: [
    { label: '节点', value: '18 / 19', hint: '1 个节点 NotReady', icon: 'server', tone: 'warning' },
    { label: 'Namespace', value: '42', hint: '平台授权范围内', icon: 'inbox', tone: 'primary' },
    { label: 'Pod', value: '1,284', hint: 'Running 1,236 / Warning 12', icon: 'cube', tone: 'success' },
    { label: '告警事件', value: '7', hint: '近 1 小时 Warning', icon: 'bell', tone: 'danger' }
  ],
  capacity: [
    { label: 'CPU', used: 68, total: '384 Core', request: '236 Core', limit: '318 Core', tone: 'primary' },
    { label: '内存', used: 74, total: '1.5 TiB', request: '918 GiB', limit: '1.2 TiB', tone: 'success' },
    { label: 'Pod 配额', used: 57, total: '2,240', request: '1,284 已使用', limit: '956 可调度', tone: 'warning' },
    { label: '存储声明', used: 43, total: '180 TiB', request: '77 TiB 已绑定', limit: '103 TiB 可用', tone: 'primary' }
  ],
  workloads: [
    { kind: 'Deployment', ready: 146, total: 151, warning: '2 个滚动更新中' },
    { kind: 'StatefulSet', ready: 28, total: 29, warning: '1 个副本等待调度' },
    { kind: 'DaemonSet', ready: 19, total: 19, warning: '全部节点已覆盖' },
    { kind: 'Job / CronJob', ready: 88, total: 96, warning: '8 个历史失败任务' }
  ],
  events: [
    {
      id: 'evt-01',
      type: 'Warning',
      reason: 'FailedScheduling',
      message: '2 个 Pod 因资源不足等待调度。',
      involvedObject: 'Deployment/payment-api',
      namespace: 'platform',
      lastSeen: '3 分钟前'
    },
    {
      id: 'evt-02',
      type: 'Warning',
      reason: 'Unhealthy',
      message: 'readiness probe failed: HTTP 503。',
      involvedObject: 'Pod/gateway-668b7d9b77-kw7mx',
      namespace: 'default',
      lastSeen: '9 分钟前'
    },
    {
      id: 'evt-03',
      type: 'Normal',
      reason: 'SuccessfulCreate',
      message: 'ReplicaSet 已创建 3 个 Pod。',
      involvedObject: 'ReplicaSet/console-6f5fbcc8b6',
      namespace: 'platform',
      lastSeen: '18 分钟前'
    }
  ]
}

const filters = reactive({
  clusterId: 'prod-main',
  namespace: 'all-namespaces'
})

const clusters = ref<ClusterOption[]>([])
const namespaces = ref<NamespaceOption[]>([])
const dashboard = ref<ClusterDashboard>(fallbackDashboard)
const loading = ref(false)
const errorMessage = ref('')
const lastUpdated = ref('')

const clusterOptions = computed(() => clusters.value.map((cluster) => ({ label: cluster.name, value: cluster.id })))
const namespaceOptions = computed(() => namespaces.value.map((namespace) => ({ label: namespace.name, value: namespace.name })))
const activeCluster = computed(() => clusters.value.find((cluster) => cluster.id === filters.clusterId) ?? clusters.value[0])
const warningEvents = computed(() => dashboard.value.events.filter((event) => event.type === 'Warning'))

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

function normalizeClusters(value: unknown): ClusterOption[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => item as Partial<ClusterOption>)
      .filter((item) => item.id && item.name)
      .map((item) => ({
        id: String(item.id),
        name: String(item.name),
        status: item.status === 'Offline' || item.status === 'Degraded' ? item.status : 'Ready',
        version: String(item.version ?? 'unknown')
      }))
  }
  return fallbackClusters
}

function normalizeNamespaces(value: unknown): NamespaceOption[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => (typeof item === 'string' ? { name: item, status: 'Active' } : item as Partial<NamespaceOption>))
      .filter((item) => item.name)
      .map((item) => ({
        name: String(item.name),
        status: item.status === 'Terminating' ? 'Terminating' : 'Active'
      }))
  }
  return fallbackNamespaces
}

function normalizeDashboard(value: unknown): ClusterDashboard {
  if (typeof value === 'object' && value !== null) {
    return { ...fallbackDashboard, ...(value as Partial<ClusterDashboard>) }
  }
  return fallbackDashboard
}

function capacityBarClass(tone: Tone) {
  return {
    primary: 'from-sky-500 to-blue-500',
    success: 'from-emerald-500 to-teal-500',
    warning: 'from-amber-500 to-orange-500',
    danger: 'from-red-500 to-rose-500'
  }[tone]
}

function cardToneClass(tone: Tone) {
  return `stat-icon-${tone}`
}

async function refreshDashboard() {
  loading.value = true
  errorMessage.value = ''
  try {
    const clusterFallback = getDataExport<unknown>('kubeClusters') ?? fallbackClusters
    const namespaceFallback = getDataExport<unknown>('kubeNamespaces') ?? fallbackNamespaces
    const dashboardFallback = getDataExport<unknown>('kubeDashboard') ?? fallbackDashboard

    clusters.value = normalizeClusters(await callApi(['listKubeClusters', 'getKubeClusters', 'listClusters'], [], clusterFallback))
    namespaces.value = normalizeNamespaces(
      await callApi(['listKubeNamespaces', 'getKubeNamespaces', 'listNamespaces'], [filters.clusterId], namespaceFallback)
    )
    dashboard.value = normalizeDashboard(
      await callApi(['getKubeDashboard', 'getClusterDashboard', 'getClusterStatus'], [{ ...filters }], dashboardFallback)
    )
    lastUpdated.value = new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    }).format(new Date())
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '集群状态加载失败'
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  refreshDashboard()
})
</script>

<template>
  <div class="space-y-6">
    <section class="card">
      <div class="card-header flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 class="text-base font-semibold text-gray-900 dark:text-white">集群状态</h2>
          <p class="text-sm text-gray-500 dark:text-dark-400">
            查看当前集群健康、容量、指标源状态和最近 Kubernetes 事件。
          </p>
        </div>
        <div class="grid gap-3 sm:grid-cols-[180px_180px_auto]">
          <Select v-model="filters.clusterId" :options="clusterOptions" searchable @change="refreshDashboard" />
          <Select v-model="filters.namespace" :options="namespaceOptions" searchable @change="refreshDashboard" />
          <button class="btn btn-secondary" type="button" :disabled="loading" @click="refreshDashboard">
            <Icon name="refresh" size="sm" :class="{ 'animate-spin': loading }" />
            刷新
          </button>
        </div>
      </div>
      <div class="card-body">
        <div v-if="errorMessage" class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
          {{ errorMessage }}
        </div>
        <div class="grid gap-4 lg:grid-cols-[1.3fr_0.7fr]">
          <div class="rounded-xl border border-gray-100 p-4 dark:border-dark-700">
            <div class="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p class="text-xs text-gray-500 dark:text-dark-400">当前集群</p>
                <div class="mt-2 flex flex-wrap items-center gap-2">
                  <h3 class="text-2xl font-semibold text-gray-900 dark:text-white">{{ dashboard.clusterName }}</h3>
                  <span
                    class="badge"
                    :class="activeCluster?.status === 'Ready' ? 'badge-success' : activeCluster?.status === 'Offline' ? 'badge-danger' : 'badge-warning'"
                  >
                    {{ activeCluster?.status ?? 'Unknown' }}
                  </span>
                </div>
                <p class="mt-1 text-sm text-gray-500 dark:text-dark-400">
                  {{ dashboard.kubernetesVersion }} · {{ dashboard.apiServer }}
                </p>
              </div>
              <p class="text-xs text-gray-400 dark:text-dark-500">最近刷新：{{ lastUpdated || '尚未刷新' }}</p>
            </div>
          </div>

          <div
            class="rounded-xl border px-4 py-3"
            :class="dashboard.metricsAvailable ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-900/40 dark:bg-emerald-950/30' : 'border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/30'"
          >
            <div class="flex items-start gap-3">
              <Icon :name="dashboard.metricsAvailable ? 'checkCircle' : 'exclamationTriangle'" size="lg" :class="dashboard.metricsAvailable ? 'text-emerald-600' : 'text-amber-600'" />
              <div>
                <p class="text-sm font-semibold text-gray-900 dark:text-white">
                  Metrics API {{ dashboard.metricsAvailable ? '可用' : '降级' }}
                </p>
                <p class="mt-1 text-sm text-gray-600 dark:text-dark-300">{{ dashboard.metricsMessage }}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article v-for="card in dashboard.cards" :key="card.label" class="stat-card">
        <div class="stat-icon" :class="cardToneClass(card.tone)">
          <Icon :name="card.icon" size="lg" />
        </div>
        <div class="min-w-0">
          <p class="stat-label">{{ card.label }}</p>
          <p class="stat-value">{{ card.value }}</p>
          <p class="mt-1 truncate text-xs text-gray-500 dark:text-dark-400">{{ card.hint }}</p>
        </div>
      </article>
    </section>

    <section class="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
      <div class="card">
        <div class="card-header">
          <h2 class="text-base font-semibold text-gray-900 dark:text-white">容量与配额</h2>
        </div>
        <div class="card-body space-y-5">
          <div v-for="item in dashboard.capacity" :key="item.label" class="space-y-2">
            <div class="flex items-center justify-between gap-3">
              <div>
                <p class="text-sm font-medium text-gray-900 dark:text-white">{{ item.label }}</p>
                <p class="text-xs text-gray-500 dark:text-dark-400">{{ item.request }} · {{ item.limit }}</p>
              </div>
              <p class="text-sm font-semibold text-gray-900 dark:text-white">{{ item.used }}%</p>
            </div>
            <div class="progress">
              <div class="h-full rounded-full bg-gradient-to-r transition-all duration-300" :class="capacityBarClass(item.tone)" :style="{ width: `${item.used}%` }"></div>
            </div>
            <p class="text-xs text-gray-400 dark:text-dark-500">总量：{{ item.total }}</p>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h2 class="text-base font-semibold text-gray-900 dark:text-white">工作负载健康</h2>
        </div>
        <div class="card-body space-y-3">
          <div v-for="item in dashboard.workloads" :key="item.kind" class="rounded-xl border border-gray-100 p-4 dark:border-dark-700">
            <div class="flex items-center justify-between gap-3">
              <p class="text-sm font-medium text-gray-900 dark:text-white">{{ item.kind }}</p>
              <span class="badge" :class="item.ready === item.total ? 'badge-success' : 'badge-warning'">
                {{ item.ready }} / {{ item.total }}
              </span>
            </div>
            <p class="mt-2 text-sm text-gray-500 dark:text-dark-400">{{ item.warning }}</p>
          </div>
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-header flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 class="text-base font-semibold text-gray-900 dark:text-white">关键事件</h2>
          <p class="text-sm text-gray-500 dark:text-dark-400">Warning 事件优先展示，便于从状态页进入排障。</p>
        </div>
        <span class="badge" :class="warningEvents.length ? 'badge-danger' : 'badge-success'">
          {{ warningEvents.length }} 个 Warning
        </span>
      </div>
      <div class="card-body">
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>类型</th>
                <th>原因</th>
                <th>对象</th>
                <th>Namespace</th>
                <th>最近出现</th>
                <th>消息</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="event in dashboard.events" :key="event.id">
                <td>
                  <span class="badge" :class="event.type === 'Warning' ? 'badge-danger' : 'badge-success'">{{ event.type }}</span>
                </td>
                <td class="font-mono text-xs">{{ event.reason }}</td>
                <td>{{ event.involvedObject }}</td>
                <td>{{ event.namespace }}</td>
                <td>{{ event.lastSeen }}</td>
                <td class="min-w-72">{{ event.message }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </div>
</template>
