import { reactive } from 'vue'
import { apiErrorMessage, request, type ApiResponse } from './api'
import { siteSettings } from './site'

interface RemoteVersionResponse {
  current_version?: string
  latest_version?: string
  rollback_version?: string
  rollback_versions?: RollbackVersionOption[]
  has_update?: boolean
  build_type?: string
  package_mode?: string
  need_restart?: boolean
  upgrade_strategy?: UpgradeStrategy
  release_info?: {
    name?: string
    body?: string
    published_at?: string
    html_url?: string
  }
  release_url?: string
  message?: string
}

interface SystemUpdateActionResponse {
  message?: string
  manual_hint?: string
  need_restart?: boolean
  job_id?: string
  job_status?: string
  target_version?: string
  package_mode?: string
  upgrade_strategy?: UpgradeStrategy
}

export interface UpgradeStrategy {
  mode?: string
  title?: string
  description?: string
  supported?: boolean
  automatic?: boolean
  action_label?: string
  warning?: string
  release_url?: string
  image?: string
  package_url?: string
  package_name?: string
  commands?: string[]
}

export interface RollbackVersionOption {
  version: string
  status?: string
  release_notes?: string
  release_url?: string
  created_at?: string
}

type MaybeApiResponse<T> = T | ApiResponse<T>
export type SystemUpdateAction = 'update' | 'rollback' | 'restart'

export interface UpgradeJobRecord {
  id: string
  job_type: SystemUpdateAction | 'upgrade'
  target_version?: string
  status: string
  package_mode?: string
  detail?: string
  error_message?: string
  operator_id?: string
  started_at?: string
  finished_at?: string
  created_at: string
}

const activeUpgradeStatuses = new Set(['pending', 'running'])

export const versionState = reactive({
  loading: false,
  actionLoading: '' as SystemUpdateAction | '',
  jobsLoading: false,
  checked: false,
  error: '',
  actionError: '',
  actionMessage: '',
  lastJobId: '',
  currentVersion: siteSettings.version,
  latestVersion: siteSettings.version,
  rollbackVersion: siteSettings.version,
  rollbackVersions: [] as RollbackVersionOption[],
  hasUpdate: false,
  releaseUrl: siteSettings.releaseUrl,
  releaseName: '',
  releaseBody: '',
  releasePublishedAt: '',
  buildType: 'template',
  packageMode: 'source-dev',
  upgradeStrategy: {
    mode: 'source-dev',
    title: '源码开发模式',
    description: '当前尚未完成远程检查，版本操作会以本地开发闭环处理。',
    supported: true,
    automatic: false,
    action_label: '创建升级任务'
  } as UpgradeStrategy,
  needRestart: false,
  upgradeJobs: [] as UpgradeJobRecord[]
})

const systemRequestBaseURL = '/'

function actionEndpoint(action: SystemUpdateAction) {
  if (action === 'update') return siteSettings.updateUrl
  if (action === 'rollback') return siteSettings.rollbackUrl
  return siteSettings.restartUrl
}

function normalizeVersion(value: string) {
  return value.trim().replace(/^v/i, '')
}

function compareVersions(left: string, right: string) {
  const a = normalizeVersion(left).split('.').map((item) => Number(item) || 0)
  const b = normalizeVersion(right).split('.').map((item) => Number(item) || 0)
  const max = Math.max(a.length, b.length)

  for (let index = 0; index < max; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0)
    if (diff !== 0) return diff
  }

  return 0
}

function unwrapResponse<T>(payload: MaybeApiResponse<T>): T {
  if (payload && typeof payload === 'object' && 'code' in payload && 'data' in payload) {
    return payload.data
  }

  return payload as T
}

function toUpgradeJobRecord(value: Record<string, unknown>): UpgradeJobRecord {
  return {
    id: String(value.id ?? value.job_id ?? ''),
    job_type: String(value.job_type ?? 'upgrade') as UpgradeJobRecord['job_type'],
    target_version: value.target_version ? String(value.target_version) : undefined,
    status: String(value.status ?? 'pending'),
    package_mode: value.package_mode ? String(value.package_mode) : undefined,
    detail: value.detail ? String(value.detail) : undefined,
    error_message: value.error_message ? String(value.error_message) : undefined,
    operator_id: value.operator_id ? String(value.operator_id) : undefined,
    started_at: value.started_at ? String(value.started_at) : undefined,
    finished_at: value.finished_at ? String(value.finished_at) : undefined,
    created_at: String(value.created_at ?? '')
  }
}

export async function checkTemplateUpdates(force = false) {
  if (versionState.loading) return
  if (versionState.checked && !force) return

  versionState.loading = true
  versionState.error = ''

  try {
    versionState.currentVersion = siteSettings.version
    versionState.releaseUrl = siteSettings.releaseUrl

    if (!siteSettings.enableUpdateCheck || !siteSettings.updateCheckUrl) {
      versionState.latestVersion = siteSettings.version
      versionState.hasUpdate = false
      versionState.checked = true
      return
    }

    const response = await request.get<MaybeApiResponse<RemoteVersionResponse>>(siteSettings.updateCheckUrl, {
      baseURL: systemRequestBaseURL,
      params: force ? { force: true } : undefined
    })
    const data = unwrapResponse(response.data)

    versionState.currentVersion = data.current_version || siteSettings.version
    versionState.latestVersion = data.latest_version || data.current_version || siteSettings.version
    versionState.rollbackVersion = data.rollback_version || data.current_version || siteSettings.version
    versionState.rollbackVersions = Array.isArray(data.rollback_versions)
      ? data.rollback_versions
        .filter((item) => item && typeof item.version === 'string' && item.version.trim())
        .map((item) => ({
          version: item.version,
          status: item.status,
          release_notes: item.release_notes,
          release_url: item.release_url,
          created_at: item.created_at
        }))
      : []
    versionState.hasUpdate =
      typeof data.has_update === 'boolean'
        ? data.has_update
        : compareVersions(versionState.latestVersion, versionState.currentVersion) > 0
    versionState.releaseUrl = data.release_info?.html_url || data.release_url || siteSettings.releaseUrl
    versionState.releaseName = data.release_info?.name || ''
    versionState.releaseBody = data.release_info?.body || ''
    versionState.releasePublishedAt = data.release_info?.published_at || ''
    versionState.buildType = data.build_type || 'template'
    versionState.packageMode = data.package_mode || data.upgrade_strategy?.mode || 'source-dev'
    versionState.upgradeStrategy = data.upgrade_strategy || {
      mode: versionState.packageMode,
      title: versionState.packageMode,
      description: '后端未返回升级策略详情。',
      supported: false,
      automatic: false,
      action_label: '创建升级任务'
    }
    versionState.needRestart = Boolean(data.need_restart)
    versionState.checked = true
  } catch (error) {
    versionState.error = apiErrorMessage(error)
    versionState.latestVersion = siteSettings.version
    versionState.hasUpdate = false
    versionState.checked = true
  } finally {
    versionState.loading = false
  }
}

export async function refreshUpgradeJobs() {
  if (versionState.jobsLoading) return
  versionState.jobsLoading = true

  try {
    const response = await request.get<MaybeApiResponse<{ items?: Record<string, unknown>[] }>>('/admin/system/upgrade-jobs', {
      baseURL: systemRequestBaseURL,
      params: { page: 1, page_size: 5 }
    })
    const data = unwrapResponse(response.data)
    versionState.upgradeJobs = Array.isArray(data.items) ? data.items.map(toUpgradeJobRecord) : []
  } catch {
    versionState.upgradeJobs = []
  } finally {
    versionState.jobsLoading = false
  }
}

export async function runSystemUpdateAction(action: SystemUpdateAction, targetVersion?: string) {
  if (versionState.actionLoading) return

  versionState.actionLoading = action
  versionState.actionError = ''
  versionState.actionMessage = ''

  try {
    const response = await request.post<MaybeApiResponse<SystemUpdateActionResponse>>(
      actionEndpoint(action),
      { confirmation_token: 'confirm', target_version: targetVersion },
      { baseURL: systemRequestBaseURL }
    )
    const data = unwrapResponse(response.data)

    versionState.actionMessage = [data.message, data.manual_hint].filter(Boolean).join(' ') || '操作已提交'
    versionState.lastJobId = data.job_id || ''
    versionState.packageMode = data.package_mode || data.upgrade_strategy?.mode || versionState.packageMode
    if (data.upgrade_strategy) versionState.upgradeStrategy = data.upgrade_strategy
    versionState.needRestart = Boolean(data.need_restart)
    await refreshUpgradeJobs()
    if (data.job_id && activeUpgradeStatuses.has(data.job_status || '')) {
      scheduleUpgradeJobRefresh()
    }
    return data
  } catch (error) {
    versionState.actionError = apiErrorMessage(error)
    throw error
  } finally {
    versionState.actionLoading = ''
  }
}

let upgradeJobsRefreshTimer: number | undefined

function scheduleUpgradeJobRefresh(attempt = 1) {
  if (upgradeJobsRefreshTimer) {
    window.clearTimeout(upgradeJobsRefreshTimer)
  }
  if (attempt > 12) return

  upgradeJobsRefreshTimer = window.setTimeout(async () => {
    await refreshUpgradeJobs()
    if (versionState.upgradeJobs.some((job) => activeUpgradeStatuses.has(job.status))) {
      scheduleUpgradeJobRefresh(attempt + 1)
    }
  }, 3000)
}
