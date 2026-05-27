<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { RouterLink, useRoute } from 'vue-router'
import BaseDialog from '@/components/common/BaseDialog.vue'
import Select from '@/components/common/Select.vue'
import { Icon } from '@/components/icons'
import * as templateApi from '@/template/api'
import * as templateData from '@/template/data'

type ApiFn<TArgs extends unknown[], TResult> = (...args: TArgs) => Promise<TResult> | TResult
type PanelId = 'security' | 'audit' | 'access'

interface AuditLogItem {
  id: string
  user: string
  action: string
  resource: string
  result: '成功' | '失败'
  time: string
  reason: string
}

interface RoleItem {
  id: string
  name: string
  description: string
  permissions: string[]
  scopes: string[]
}

interface UserItem {
  id: string
  name: string
  role: string
  status: '启用' | '禁用'
  lastLogin: string
}

const route = useRoute()
const apiBag = templateApi as Record<string, unknown>
const dataBag = templateData as Record<string, unknown>

const panelTabs: Array<{ id: PanelId; label: string; path: string; icon: InstanceType<typeof Icon>['$props']['name'] }> = [
  { id: 'security', label: '安全配置', path: '/settings/security', icon: 'shield' },
  { id: 'audit', label: '审计配置', path: '/settings/audit', icon: 'clipboard' },
  { id: 'access', label: '用户与角色', path: '/settings/access', icon: 'users' }
]

const securityForm = reactive({
  requireHighRiskConfirm: true,
  requireTerminalReason: true,
  secretRevealTtlSeconds: 120,
  credentialRotationDays: 90,
  allowedCredentialTypes: ['kubeconfig', 'serviceAccount'],
  denyNamespaceDeleteWithoutAdmin: true
})

const auditForm = reactive({
  retentionDays: 180,
  recordReadActions: false,
  exportEnabled: true,
  failedActionAlert: true
})

const auditFilters = reactive({
  user: '',
  action: '',
  result: 'all'
})

const permissionOptions = [
  'clusters:manage',
  'resources:read',
  'resources:write',
  'resources:delete',
  'yaml:apply',
  'pods:logs',
  'pods:exec',
  'secrets:reveal',
  'nodes:operate',
  'audit:read',
  'settings:manage'
]

const fallbackAuditLogs: AuditLogItem[] = [
  { id: 'aud-001', user: 'admin', action: 'nodes:drain', resource: 'prod-main/Node/worker-a', result: '成功', time: '2026-05-27 10:26', reason: '维护窗口' },
  { id: 'aud-002', user: 'sre', action: 'secrets:reveal', resource: 'platform/Secret/db-password', result: '成功', time: '2026-05-27 10:18', reason: '排障授权' },
  { id: 'aud-003', user: 'readonly', action: 'resources:delete', resource: 'default/Pod/gateway-1', result: '失败', time: '2026-05-27 09:52', reason: '权限不足' }
]

const fallbackUsers: UserItem[] = [
  { id: 'usr-1', name: 'admin', role: '平台管理员', status: '启用', lastLogin: '2026-05-27 10:30' },
  { id: 'usr-2', name: 'sre', role: '运维人员', status: '启用', lastLogin: '2026-05-27 10:12' },
  { id: 'usr-3', name: 'readonly', role: '只读用户', status: '启用', lastLogin: '2026-05-26 18:22' }
]

const fallbackRoles: RoleItem[] = [
  { id: 'role-admin', name: '平台管理员', description: '管理集群、资源、用户、审计和系统设置。', permissions: [...permissionOptions], scopes: ['所有集群', '所有 Namespace'] },
  { id: 'role-ops', name: '运维人员', description: '管理授权范围内的资源和常用运维操作。', permissions: ['resources:read', 'resources:write', 'yaml:apply', 'pods:logs', 'pods:exec', 'nodes:operate'], scopes: ['prod-main/default', 'prod-main/platform'] },
  { id: 'role-readonly', name: '只读用户', description: '仅查看授权范围内资源和事件。', permissions: ['resources:read', 'pods:logs'], scopes: ['prod-main/default'] }
]

const auditLogs = ref<AuditLogItem[]>([])
const users = ref<UserItem[]>([])
const roles = ref<RoleItem[]>([])
const loading = ref(false)
const savedMessage = ref('')
const pendingSave = ref<PanelId | null>(null)

const activePanel = computed<PanelId>(() => {
  const path = route.path
  if (path.includes('/settings/audit')) return 'audit'
  if (path.includes('/settings/access')) return 'access'
  return 'security'
})

const filteredAuditLogs = computed(() => {
  return auditLogs.value
    .filter((item) => !auditFilters.user || item.user.toLowerCase().includes(auditFilters.user.toLowerCase()))
    .filter((item) => !auditFilters.action || item.action.toLowerCase().includes(auditFilters.action.toLowerCase()))
    .filter((item) => auditFilters.result === 'all' || item.result === auditFilters.result)
})

const resultOptions = [
  { label: '全部结果', value: 'all' },
  { label: '成功', value: '成功' },
  { label: '失败', value: '失败' }
]

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

async function loadSettings() {
  loading.value = true
  const security = await callApi(['getKubeSecuritySettings', 'getSecuritySettings'], [], getDataExport('kubeSecuritySettings') ?? securityForm)
  const audit = await callApi(['getKubeAuditSettings', 'getAuditSettings'], [], getDataExport('kubeAuditSettings') ?? auditForm)
  Object.assign(securityForm, security)
  Object.assign(auditForm, audit)
  auditLogs.value = await callApi(['listKubeAuditLogs', 'listAuditLogs'], [{ page: 1, pageSize: 20 }], getDataExport('kubeAuditLogs') ?? fallbackAuditLogs)
  users.value = await callApi(['listKubeUsers', 'listUsers'], [], getDataExport('kubeUsers') ?? fallbackUsers)
  roles.value = await callApi(['listKubeRoles', 'listRoles'], [], getDataExport('kubeRoles') ?? fallbackRoles)
  loading.value = false
}

function openSaveConfirm(panel: PanelId) {
  pendingSave.value = panel
}

async function confirmSave() {
  if (!pendingSave.value) return
  if (pendingSave.value === 'security') {
    await callApi(['saveKubeSecuritySettings', 'saveSecuritySettings', 'updateKubeSettings'], [{ domain: 'security', data: { ...securityForm }, confirm: true }], { ok: true })
    savedMessage.value = '安全配置已提交'
  }
  if (pendingSave.value === 'audit') {
    await callApi(['saveKubeAuditSettings', 'saveAuditSettings', 'updateKubeSettings'], [{ domain: 'audit', data: { ...auditForm }, confirm: true }], { ok: true })
    savedMessage.value = '审计配置已提交'
  }
  if (pendingSave.value === 'access') {
    await callApi(['saveKubeAccessSettings', 'saveRolePermissions', 'updateKubeSettings'], [{ domain: 'access', roles: roles.value, confirm: true }], { ok: true })
    savedMessage.value = '用户与角色配置已提交'
  }
  pendingSave.value = null
  window.setTimeout(() => {
    savedMessage.value = ''
  }, 2200)
}

function toggleCredentialType(type: string) {
  if (securityForm.allowedCredentialTypes.includes(type)) {
    securityForm.allowedCredentialTypes = securityForm.allowedCredentialTypes.filter((item) => item !== type)
  } else {
    securityForm.allowedCredentialTypes = [...securityForm.allowedCredentialTypes, type]
  }
}

function toggleRolePermission(role: RoleItem, permission: string) {
  if (role.permissions.includes(permission)) {
    role.permissions = role.permissions.filter((item) => item !== permission)
  } else {
    role.permissions = [...role.permissions, permission]
  }
}

onMounted(() => {
  loadSettings()
})
</script>

<template>
  <div class="mx-auto max-w-6xl space-y-6">
    <section class="card">
      <div class="card-header flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 class="text-base font-semibold text-gray-900 dark:text-white">Kubernetes 业务设置</h2>
          <p class="text-sm text-gray-500 dark:text-dark-400">
            这里只承载安全、审计、权限等新增业务设置；Sub Admin 固定的通用设置和版本更新仍保留在独立页面。
          </p>
        </div>
        <div class="flex flex-wrap gap-2">
          <RouterLink to="/settings/general" class="btn btn-secondary btn-sm">通用设置</RouterLink>
          <RouterLink to="/settings/version" class="btn btn-secondary btn-sm">版本更新</RouterLink>
        </div>
      </div>
      <div class="card-body">
        <div class="tabs overflow-x-auto">
          <RouterLink
            v-for="tab in panelTabs"
            :key="tab.id"
            :to="tab.path"
            class="tab inline-flex items-center gap-2 whitespace-nowrap"
            :class="{ 'tab-active': activePanel === tab.id }"
          >
            <Icon :name="tab.icon" size="sm" />
            {{ tab.label }}
          </RouterLink>
        </div>
      </div>
    </section>

    <div v-if="savedMessage" class="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-300">
      {{ savedMessage }}
    </div>

    <section v-if="activePanel === 'security'" class="card">
      <div class="card-header">
        <h2 class="text-base font-semibold text-gray-900 dark:text-white">安全配置</h2>
      </div>
      <div class="card-body space-y-5">
        <label class="flex items-center justify-between gap-4 rounded-xl border border-gray-100 px-4 py-3 dark:border-dark-700">
          <span>
            <span class="block text-sm font-medium text-gray-900 dark:text-white">高风险操作二次确认</span>
            <span class="text-xs text-gray-500 dark:text-dark-400">删除、YAML 应用、回滚、Secret 明文、Pod 终端、Node 操作必须携带 confirm=true。</span>
          </span>
          <input v-model="securityForm.requireHighRiskConfirm" class="h-5 w-5" type="checkbox" />
        </label>

        <label class="flex items-center justify-between gap-4 rounded-xl border border-gray-100 px-4 py-3 dark:border-dark-700">
          <span>
            <span class="block text-sm font-medium text-gray-900 dark:text-white">Pod 终端必须填写原因</span>
            <span class="text-xs text-gray-500 dark:text-dark-400">后端记录审计时保留操作者输入的排障原因。</span>
          </span>
          <input v-model="securityForm.requireTerminalReason" class="h-5 w-5" type="checkbox" />
        </label>

        <div class="grid gap-4 md:grid-cols-2">
          <label class="block">
            <span class="input-label">Secret 明文显示时长（秒）</span>
            <input v-model.number="securityForm.secretRevealTtlSeconds" class="input" min="30" type="number" />
          </label>
          <label class="block">
            <span class="input-label">集群凭据轮换周期（天）</span>
            <input v-model.number="securityForm.credentialRotationDays" class="input" min="1" type="number" />
          </label>
        </div>

        <div class="rounded-xl border border-gray-100 p-4 dark:border-dark-700">
          <p class="text-sm font-medium text-gray-900 dark:text-white">允许的集群凭据类型</p>
          <div class="mt-3 flex flex-wrap gap-2">
            <button
              v-for="type in ['kubeconfig', 'token', 'serviceAccount']"
              :key="type"
              type="button"
              class="btn btn-sm"
              :class="securityForm.allowedCredentialTypes.includes(type) ? 'btn-primary' : 'btn-secondary'"
              @click="toggleCredentialType(type)"
            >
              {{ type }}
            </button>
          </div>
        </div>
      </div>
      <div class="card-footer flex justify-end">
        <button class="btn btn-primary" type="button" @click="openSaveConfirm('security')">保存安全配置</button>
      </div>
    </section>

    <section v-else-if="activePanel === 'audit'" class="space-y-6">
      <div class="card">
        <div class="card-header">
          <h2 class="text-base font-semibold text-gray-900 dark:text-white">审计策略</h2>
        </div>
        <div class="card-body space-y-5">
          <div class="grid gap-4 md:grid-cols-2">
            <label class="block">
              <span class="input-label">审计保留周期（天）</span>
              <input v-model.number="auditForm.retentionDays" class="input" min="7" type="number" />
            </label>
            <label class="flex items-center justify-between gap-4 rounded-xl border border-gray-100 px-4 py-3 dark:border-dark-700">
              <span>
                <span class="block text-sm font-medium text-gray-900 dark:text-white">失败操作告警</span>
                <span class="text-xs text-gray-500 dark:text-dark-400">高风险操作失败时进入审计告警视图。</span>
              </span>
              <input v-model="auditForm.failedActionAlert" class="h-5 w-5" type="checkbox" />
            </label>
          </div>
        </div>
        <div class="card-footer flex justify-end">
          <button class="btn btn-primary" type="button" @click="openSaveConfirm('audit')">保存审计配置</button>
        </div>
      </div>

      <div class="card">
        <div class="card-header flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 class="text-base font-semibold text-gray-900 dark:text-white">审计查询入口</h2>
            <p class="text-sm text-gray-500 dark:text-dark-400">与 API-023 对接，支持按用户、动作和结果筛选。</p>
          </div>
          <button class="btn btn-secondary btn-sm" type="button" :disabled="loading" @click="loadSettings">
            <Icon name="refresh" size="sm" :class="{ 'animate-spin': loading }" />
            刷新
          </button>
        </div>
        <div class="card-body space-y-4">
          <div class="grid gap-3 md:grid-cols-3">
            <input v-model="auditFilters.user" class="input" placeholder="用户" />
            <input v-model="auditFilters.action" class="input" placeholder="动作" />
            <Select v-model="auditFilters.result" :options="resultOptions" />
          </div>
          <div class="table-container">
            <table class="table">
              <thead>
                <tr>
                  <th>时间</th>
                  <th>用户</th>
                  <th>动作</th>
                  <th>资源</th>
                  <th>结果</th>
                  <th>原因</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="item in filteredAuditLogs" :key="item.id">
                  <td>{{ item.time }}</td>
                  <td>{{ item.user }}</td>
                  <td class="font-mono text-xs">{{ item.action }}</td>
                  <td>{{ item.resource }}</td>
                  <td><span class="badge" :class="item.result === '成功' ? 'badge-success' : 'badge-danger'">{{ item.result }}</span></td>
                  <td>{{ item.reason }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>

    <section v-else class="space-y-6">
      <div class="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div class="card">
          <div class="card-header">
            <h2 class="text-base font-semibold text-gray-900 dark:text-white">用户</h2>
          </div>
          <div class="card-body space-y-3">
            <div v-for="user in users" :key="user.id" class="rounded-xl border border-gray-100 p-4 dark:border-dark-700">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="font-medium text-gray-900 dark:text-white">{{ user.name }}</p>
                  <p class="text-sm text-gray-500 dark:text-dark-400">{{ user.role }} · 最近登录 {{ user.lastLogin }}</p>
                </div>
                <span class="badge" :class="user.status === '启用' ? 'badge-success' : 'badge-gray'">{{ user.status }}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h2 class="text-base font-semibold text-gray-900 dark:text-white">角色与权限点</h2>
          </div>
          <div class="card-body space-y-4">
            <div v-for="role in roles" :key="role.id" class="rounded-xl border border-gray-100 p-4 dark:border-dark-700">
              <div>
                <p class="font-medium text-gray-900 dark:text-white">{{ role.name }}</p>
                <p class="mt-1 text-sm text-gray-500 dark:text-dark-400">{{ role.description }}</p>
                <p class="mt-2 text-xs text-gray-400 dark:text-dark-500">授权范围：{{ role.scopes.join('、') }}</p>
              </div>
              <div class="mt-3 flex flex-wrap gap-2">
                <button
                  v-for="permission in permissionOptions"
                  :key="permission"
                  type="button"
                  class="rounded-full px-2.5 py-1 text-xs font-medium transition"
                  :class="role.permissions.includes(permission) ? 'bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300' : 'bg-gray-100 text-gray-500 dark:bg-dark-700 dark:text-dark-300'"
                  @click="toggleRolePermission(role, permission)"
                >
                  {{ permission }}
                </button>
              </div>
            </div>
          </div>
          <div class="card-footer flex justify-end">
            <button class="btn btn-primary" type="button" @click="openSaveConfirm('access')">保存权限配置</button>
          </div>
        </div>
      </div>
    </section>

    <BaseDialog :show="Boolean(pendingSave)" title="确认保存设置" width="normal" @close="pendingSave = null">
      <p class="text-sm leading-6 text-gray-600 dark:text-dark-300">
        保存设置会调用系统设置或权限相关接口，并由后端记录审计。请确认当前修改符合平台安全策略。
      </p>
      <template #footer>
        <button class="btn btn-secondary" type="button" @click="pendingSave = null">取消</button>
        <button class="btn btn-danger" type="button" @click="confirmSave">确认保存</button>
      </template>
    </BaseDialog>
  </div>
</template>
