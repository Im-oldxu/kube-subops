<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import DataTable from '@/components/common/DataTable.vue'
import Select from '@/components/common/Select.vue'
import { Icon } from '@/components/icons'
import type { Column } from '@/components/common/types'
import * as templateApi from '@/template/api'
import * as templateData from '@/template/data'

type ApiFn<TArgs extends unknown[], TResult> = (...args: TArgs) => Promise<TResult> | TResult
type ClusterStatus = 'Ready' | 'Degraded' | 'Offline' | 'Testing'
type CredentialType = 'kubeconfig' | 'token' | 'serviceAccount'
type FormMode = 'create' | 'edit'

interface ClusterRecord {
  id: string
  name: string
  apiServer: string
  status: ClusterStatus
  version: string
  credentialType: CredentialType
  credentialMasked: string
  description: string
  updatedAt: string
  namespaces: number
}

const apiBag = templateApi as Record<string, unknown>
const dataBag = templateData as Record<string, unknown>

const fallbackClusters: ClusterRecord[] = [
  {
    id: 'prod-main',
    name: 'prod-main',
    apiServer: 'https://10.0.12.8:6443',
    status: 'Ready',
    version: 'v1.29.4',
    credentialType: 'kubeconfig',
    credentialMasked: 'kubeconfig · sha256:8f2a****',
    description: '生产主集群',
    updatedAt: '2026-05-27 10:20',
    namespaces: 42
  },
  {
    id: 'staging',
    name: 'staging',
    apiServer: 'https://10.0.22.8:6443',
    status: 'Ready',
    version: 'v1.28.8',
    credentialType: 'serviceAccount',
    credentialMasked: 'sa-token · ending ****9c21',
    description: '预发环境',
    updatedAt: '2026-05-27 09:42',
    namespaces: 18
  },
  {
    id: 'dev-sandbox',
    name: 'dev-sandbox',
    apiServer: 'https://10.0.32.8:6443',
    status: 'Degraded',
    version: 'v1.27.13',
    credentialType: 'token',
    credentialMasked: 'bearer token · ending ****42af',
    description: '开发沙箱，Metrics API 不稳定',
    updatedAt: '2026-05-26 18:15',
    namespaces: 9
  }
]

const columns: Column[] = [
  { key: 'name', label: '集群名称', sortable: true, class: 'min-w-52' },
  { key: 'status', label: '连接状态', sortable: true },
  { key: 'apiServer', label: 'API Server', sortable: true, class: 'min-w-72' },
  { key: 'version', label: '版本', sortable: true },
  { key: 'credentialMasked', label: '凭据', class: 'min-w-56' },
  { key: 'updatedAt', label: '更新时间', sortable: true },
  { key: 'actions', label: '操作', class: 'min-w-72' }
]

const credentialOptions = [
  { label: 'kubeconfig', value: 'kubeconfig' },
  { label: 'Bearer Token', value: 'token' },
  { label: 'ServiceAccount Token', value: 'serviceAccount' }
]

const filters = reactive({
  keyword: '',
  status: 'all'
})
const clusters = ref<ClusterRecord[]>([])
const loading = ref(false)
const formOpen = ref(false)
const formMode = ref<FormMode>('create')
const activeCluster = ref<ClusterRecord | null>(null)
const confirmDelete = ref<ClusterRecord | null>(null)
const testResult = ref<{ clusterId: string; ok: boolean; message: string } | null>(null)
const form = reactive({
  name: '',
  apiServer: '',
  credentialType: 'kubeconfig' as CredentialType,
  credential: '',
  description: ''
})

const statusOptions = [
  { label: '全部状态', value: 'all' },
  { label: 'Ready', value: 'Ready' },
  { label: 'Degraded', value: 'Degraded' },
  { label: 'Offline', value: 'Offline' }
]

const filteredClusters = computed(() => {
  const keyword = filters.keyword.trim().toLowerCase()
  return clusters.value
    .filter((cluster) => filters.status === 'all' || cluster.status === filters.status)
    .filter((cluster) => {
      if (!keyword) return true
      return `${cluster.name} ${cluster.apiServer} ${cluster.description}`.toLowerCase().includes(keyword)
    })
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

function normalizeClusters(value: unknown): ClusterRecord[] {
  const candidate = Array.isArray(value) ? value : typeof value === 'object' && value !== null ? (value as { items?: unknown }).items : undefined
  if (!Array.isArray(candidate)) return fallbackClusters
  return candidate.map((item, index) => ({
    ...fallbackClusters[index % fallbackClusters.length],
    ...(item as Partial<ClusterRecord>)
  }))
}

function statusClass(status: ClusterStatus) {
  if (status === 'Ready') return 'badge-success'
  if (status === 'Testing') return 'badge-primary'
  if (status === 'Degraded') return 'badge-warning'
  return 'badge-danger'
}

function credentialLabel(type: CredentialType) {
  return credentialOptions.find((option) => option.value === type)?.label ?? type
}

async function loadClusters() {
  loading.value = true
  const fallback = getDataExport<unknown>('kubeClusters') ?? fallbackClusters
  clusters.value = normalizeClusters(await callApi(['listKubeClusters', 'getKubeClusters', 'listClusters'], [{ keyword: filters.keyword }], fallback))
  loading.value = false
}

function resetForm() {
  form.name = ''
  form.apiServer = ''
  form.credentialType = 'kubeconfig'
  form.credential = ''
  form.description = ''
  activeCluster.value = null
}

function openCreate() {
  formMode.value = 'create'
  resetForm()
  formOpen.value = true
}

function openEdit(cluster: ClusterRecord) {
  formMode.value = 'edit'
  activeCluster.value = cluster
  form.name = cluster.name
  form.apiServer = cluster.apiServer
  form.credentialType = cluster.credentialType
  form.credential = ''
  form.description = cluster.description
  formOpen.value = true
}

async function saveCluster() {
  const payload = {
    id: activeCluster.value?.id,
    name: form.name,
    apiServer: form.apiServer,
    credentialType: form.credentialType,
    credential: form.credential,
    description: form.description
  }
  await callApi(formMode.value === 'create' ? ['createKubeCluster', 'createCluster'] : ['updateKubeCluster', 'updateCluster'], [payload], { ok: true })
  formOpen.value = false
  resetForm()
  await loadClusters()
}

async function testCluster(cluster: ClusterRecord) {
  testResult.value = { clusterId: cluster.id, ok: true, message: '连接测试中...' }
  const result = await callApi(['testKubeClusterConnection', 'testClusterConnection'], [{ clusterId: cluster.id }], {
    ok: cluster.status !== 'Offline',
    message: cluster.status === 'Offline' ? '无法连接 API Server' : '连接成功，已获取 Kubernetes 版本和 Namespace 列表。'
  })
  const normalized = result as { ok?: boolean; message?: string }
  testResult.value = {
    clusterId: cluster.id,
    ok: normalized.ok !== false,
    message: normalized.message ?? '连接测试完成'
  }
}

async function deleteCluster() {
  if (!confirmDelete.value) return
  await callApi(['deleteKubeCluster', 'deleteCluster'], [{ clusterId: confirmDelete.value.id, confirm: true }], { ok: true })
  confirmDelete.value = null
  await loadClusters()
}

onMounted(() => {
  loadClusters()
})
</script>

<template>
  <div class="space-y-6">
    <section class="card">
      <div class="card-header flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 class="text-base font-semibold text-gray-900 dark:text-white">多集群管理</h2>
          <p class="text-sm text-gray-500 dark:text-dark-400">添加、测试、更新和删除 Kubernetes 集群连接；凭据仅提交给后端，不在前端长期保存。</p>
        </div>
        <div class="flex flex-wrap items-center gap-2">
          <button class="btn btn-secondary" type="button" :disabled="loading" @click="loadClusters">
            <Icon name="refresh" size="sm" :class="{ 'animate-spin': loading }" />
            刷新
          </button>
          <button class="btn btn-primary" type="button" @click="openCreate">
            <Icon name="plus" size="sm" />
            添加集群
          </button>
        </div>
      </div>
      <div class="card-body">
        <div class="grid gap-3 md:grid-cols-[220px_180px]">
          <input v-model="filters.keyword" class="input" type="search" placeholder="搜索集群名称或地址" />
          <Select v-model="filters.status" :options="statusOptions" />
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-body">
        <DataTable :columns="columns" :data="filteredClusters" :loading="loading" row-key="id" default-sort-key="updatedAt" default-sort-order="desc" sort-storage-key="kube-clusters-sort">
          <template #cell-name="{ row }">
            <p class="font-medium text-gray-900 dark:text-white">{{ row.name }}</p>
            <p class="mt-1 text-xs text-gray-500 dark:text-dark-400">{{ row.description }}</p>
          </template>
          <template #cell-status="{ row }">
            <span class="badge" :class="statusClass(row.status)">{{ row.status }}</span>
            <p v-if="testResult?.clusterId === row.id" class="mt-2 text-xs" :class="testResult.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'">
              {{ testResult.message }}
            </p>
          </template>
          <template #cell-apiServer="{ row }">
            <span class="font-mono text-xs">{{ row.apiServer }}</span>
          </template>
          <template #cell-credentialMasked="{ row }">
            <p class="font-mono text-xs">{{ row.credentialMasked }}</p>
            <p class="mt-1 text-xs text-gray-400 dark:text-dark-500">{{ credentialLabel(row.credentialType) }}</p>
          </template>
          <template #cell-actions="{ row }">
            <div class="action-list">
              <button class="action-item action-item-success" type="button" @click="testCluster(row)">
                <Icon name="beaker" size="sm" />
                <span>测试</span>
              </button>
              <button class="action-item action-item-primary" type="button" @click="openEdit(row)">
                <Icon name="edit" size="sm" />
                <span>编辑</span>
              </button>
              <button class="action-item action-item-danger" type="button" @click="confirmDelete = row">
                <Icon name="trash" size="sm" />
                <span>删除</span>
              </button>
            </div>
          </template>
        </DataTable>
      </div>
    </section>

    <BaseDialog :show="formOpen" :title="formMode === 'create' ? '添加集群' : '更新集群'" width="wide" @close="formOpen = false">
      <form class="space-y-4" @submit.prevent="saveCluster">
        <div class="grid gap-4 md:grid-cols-2">
          <label class="block">
            <span class="input-label">集群名称</span>
            <input v-model="form.name" class="input" placeholder="prod-main" required />
          </label>
          <label class="block">
            <span class="input-label">API Server</span>
            <input v-model="form.apiServer" class="input" placeholder="https://10.0.0.1:6443" required />
          </label>
        </div>

        <label class="block">
          <span class="input-label">凭据类型</span>
          <Select v-model="form.credentialType" :options="credentialOptions" />
        </label>

        <label class="block">
          <span class="input-label">{{ formMode === 'edit' ? '新凭据（留空表示不更新）' : '凭据内容' }}</span>
          <textarea
            v-model="form.credential"
            class="input min-h-44 font-mono text-xs"
            :placeholder="form.credentialType === 'kubeconfig' ? '粘贴 kubeconfig' : '粘贴 Token'"
            spellcheck="false"
          ></textarea>
          <span class="input-hint">凭据只在当前表单内短暂存在，提交后由后端加密保存；列表仅展示脱敏摘要。</span>
        </label>

        <label class="block">
          <span class="input-label">描述</span>
          <textarea v-model="form.description" class="input min-h-24" placeholder="用途、环境、维护人等"></textarea>
        </label>

        <div class="flex justify-end gap-2">
          <button class="btn btn-secondary" type="button" @click="formOpen = false">取消</button>
          <button class="btn btn-primary" type="submit">提交</button>
        </div>
      </form>
    </BaseDialog>

    <BaseDialog :show="Boolean(confirmDelete)" title="确认删除集群连接" width="normal" @close="confirmDelete = null">
      <p class="text-sm leading-6 text-gray-600 dark:text-dark-300">
        删除 {{ confirmDelete?.name }} 会移除平台保存的集群连接配置和凭据引用，并记录审计。不会删除目标 Kubernetes 集群。
      </p>
      <template #footer>
        <button class="btn btn-secondary" type="button" @click="confirmDelete = null">取消</button>
        <button class="btn btn-danger" type="button" @click="deleteCluster">确认删除</button>
      </template>
    </BaseDialog>
  </div>
</template>
