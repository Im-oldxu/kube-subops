import { reactive } from 'vue'

export interface SiteSettings {
  siteName: string
  siteSubtitle: string
  logoUrl: string
  version: string
  updateCheckUrl: string
  updateUrl: string
  rollbackUrl: string
  restartUrl: string
  releaseUrl: string
  enableUpdateCheck: boolean
}

const storageKey = 'sub-admin:site-settings'

export const systemUpdateEndpoints = {
  checkUpdates: '/admin/system/check-updates',
  update: '/admin/system/update',
  rollback: '/admin/system/rollback',
  restart: '/admin/system/restart'
} as const

export const defaultSiteSettings: SiteSettings = {
  siteName: 'Admin Template',
  siteSubtitle: '通用后台前端基座，可按业务替换页面和接口。',
  logoUrl: '/logo.png',
  version: import.meta.env.VITE_APP_VERSION || 'v1.0.0',
  updateCheckUrl: systemUpdateEndpoints.checkUpdates,
  updateUrl: systemUpdateEndpoints.update,
  rollbackUrl: systemUpdateEndpoints.rollback,
  restartUrl: systemUpdateEndpoints.restart,
  releaseUrl: '',
  enableUpdateCheck: true
}

function readStoredSettings(): Partial<SiteSettings> {
  if (typeof window === 'undefined') return {}

  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) return {}

    const settings = JSON.parse(raw) as Partial<SiteSettings>
    const legacyUpdateCheckUrls = new Set(['', '/api/system/check-updates', '/api/system/version/check'])

    if (!settings.updateCheckUrl || legacyUpdateCheckUrls.has(settings.updateCheckUrl)) {
      settings.updateCheckUrl = defaultSiteSettings.updateCheckUrl
      settings.enableUpdateCheck = defaultSiteSettings.enableUpdateCheck
    }

    if (!settings.updateUrl) settings.updateUrl = defaultSiteSettings.updateUrl
    if (!settings.rollbackUrl) settings.rollbackUrl = defaultSiteSettings.rollbackUrl
    if (!settings.restartUrl) settings.restartUrl = defaultSiteSettings.restartUrl

    if (typeof settings.enableUpdateCheck !== 'boolean') {
      settings.enableUpdateCheck = defaultSiteSettings.enableUpdateCheck
    }

    return settings
  } catch {
    return {}
  }
}

function persistSettings() {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(storageKey, JSON.stringify(siteSettings))
}

export const siteSettings = reactive<SiteSettings>({
  ...defaultSiteSettings,
  ...readStoredSettings()
})

export function updateSiteSettings(input: SiteSettings) {
  Object.assign(siteSettings, {
    ...input,
    siteName: input.siteName.trim() || defaultSiteSettings.siteName,
    siteSubtitle: input.siteSubtitle.trim(),
    logoUrl: input.logoUrl.trim() || defaultSiteSettings.logoUrl,
    version: input.version.trim() || defaultSiteSettings.version,
    updateCheckUrl: input.updateCheckUrl.trim() || defaultSiteSettings.updateCheckUrl,
    updateUrl: input.updateUrl.trim() || defaultSiteSettings.updateUrl,
    rollbackUrl: input.rollbackUrl.trim() || defaultSiteSettings.rollbackUrl,
    restartUrl: input.restartUrl.trim() || defaultSiteSettings.restartUrl,
    releaseUrl: input.releaseUrl.trim()
  })
  persistSettings()
}

export function resetSiteSettings() {
  Object.assign(siteSettings, defaultSiteSettings)
  persistSettings()
}
