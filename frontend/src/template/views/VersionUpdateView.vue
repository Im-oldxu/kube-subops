<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import BaseDialog from '@/components/common/BaseDialog.vue'
import Input from '@/components/common/Input.vue'
import Select from '@/components/common/Select.vue'
import Toggle from '@/components/common/Toggle.vue'
import { Icon } from '@/components/icons'
import { checkTemplateUpdates, refreshUpgradeJobs, runSystemUpdateAction, type SystemUpdateAction, versionState } from '@/template/version'
import { resetSiteSettings, siteSettings, updateSiteSettings, type SiteSettings } from '@/template/site'

interface VersionActionItem {
  id: SystemUpdateAction
  label: string
  icon: InstanceType<typeof Icon>['$props']['name']
  buttonClass: string
  risk: string
  range: string
  targetVersion: string
  progressHint: string
}

const pendingAction = ref<VersionActionItem | null>(null)
const saved = ref(false)
const modeNotesDialogOpen = ref(false)
const allStepsDialogOpen = ref(false)
const activePanel = ref<'settings' | 'upgrade' | 'strategy'>('settings')
const selectedRollbackVersion = ref('')

const currentVersion = computed(() => versionState.currentVersion || siteSettings.version)
const latestVersion = computed(() => versionState.latestVersion || currentVersion.value)
const rollbackVersion = computed(() => selectedRollbackVersion.value || versionState.rollbackVersion || currentVersion.value)
const strategy = computed(() => versionState.upgradeStrategy)
const panelTabs = [
  { id: 'settings', label: '更新配置', icon: 'cog' },
  { id: 'upgrade', label: '版本升级与回退', icon: 'upload' },
  { id: 'strategy', label: '升级策略', icon: 'sync' }
] as const
const packageModeLabelMap: Record<string, string> = {
  'source-dev': '源码开发模式',
  binary: 'Linux 二进制包模式',
  docker: 'Docker 镜像模式',
  'docker-compose': 'Docker Compose 模式',
  kubernetes: 'Kubernetes 部署模式',
  manual: '手动发布模式'
}
const packageModeNotes = [
  ['source-dev', '源码开发', '用于本地 pnpm / go run 调试，只记录任务、标记和审计，不替换运行程序。'],
  ['binary', 'Linux 二进制', '用于 systemd 或脚本托管的单机部署，下载 tar.gz 后备份并替换本地运行包，重启后生效。'],
  ['docker', 'Docker', '用于单容器部署，拉取镜像并使用受控数据卷重建容器。'],
  ['docker-compose', 'Docker Compose', '用于 compose 编排部署，由部署侧执行 pull / up。'],
  ['kubernetes', 'Kubernetes', '用于平台自身运行在 K8S 时执行镜像变更与 rollout。'],
  ['manual', '手动发布', '只展示发布地址、记录审计，不自动替换包或镜像。']
] as const

function packageModeLabel(mode?: string) {
  return packageModeLabelMap[mode || ''] || mode || '未识别模式'
}

function displayVersion(version: string) {
  return version.startsWith('v') ? version : `v${version}`
}

const currentPackageMode = computed(() => strategy.value.mode || versionState.packageMode)
const currentPackageModeLabel = computed(() => packageModeLabel(currentPackageMode.value))
const releaseTag = computed(() => displayVersion(latestVersion.value))
const currentReleaseTag = computed(() => displayVersion(currentVersion.value))
const rollbackReleaseTag = computed(() => displayVersion(rollbackVersion.value))
const rollbackOptions = computed(() => {
  const options = versionState.rollbackVersions.map((item) => {
    const label = item.status ? `${displayVersion(item.version)} · ${item.status}` : displayVersion(item.version)
    return { label, value: item.version }
  })
  if (!options.length && versionState.rollbackVersion && versionState.rollbackVersion !== currentVersion.value) {
    options.push({ label: displayVersion(versionState.rollbackVersion), value: versionState.rollbackVersion })
  }
  return options
})
const dockerImage = computed(() => strategy.value.image || `registry.example.com/admin-template:${releaseTag.value}`)
const linuxArchive = computed(() => strategy.value.package_name || `admin-template-${releaseTag.value}-linux-amd64.tar.gz`)
const displayRecipeMode = computed(() => (['source-dev', 'binary', 'docker'].includes(currentPackageMode.value) ? currentPackageMode.value : 'source-dev'))
const deploymentRecipes = computed(() => [
  {
    mode: 'source-dev',
    title: '源码更新方式',
    label: '源码开发模式',
    description: '适合本地开发和功能验证，只切换源码版本后重新启动开发服务。',
    note: '不会替换二进制、不会拉取容器镜像，也不会重启当前开发进程。',
    commands: ['git fetch --tags', `git checkout ${releaseTag.value}`, '重新执行前后端开发服务启动命令']
  },
  {
    mode: 'binary',
    title: 'Linux 二进制更新方式',
    label: 'Linux 二进制包模式',
    description: '适合 Linux 单机部署，发布包由 systemd、脚本或进程管理器接管替换与重启。',
    note: '平台记录升级任务和回滚标记；真正替换运行目录前应完成 checksum / 签名校验。',
    commands: [
      `下载 GitHub Release 或制品库中的 ${linuxArchive.value}`,
      '解包并校验后端运行包与 frontend/dist',
      '备份旧运行目录，替换后端运行包、frontend/dist，并更新 APP_VERSION',
      '通过 systemd、脚本或进程管理器重启服务'
    ]
  },
  {
    mode: 'docker',
    title: 'Docker 更新方式',
    label: 'Docker 镜像模式',
    description: '适合单容器部署，从镜像仓库拉取目标镜像并使用原数据卷重建容器。',
    note: '默认不在容器内部修改自身镜像，也不要求挂载宿主机 Docker Socket；如果镜像拉取或重建失败，请在部署机手动执行。',
    commands: [
      `docker pull ${dockerImage.value}`,
      'docker stop admin-template',
      'docker rm admin-template',
      `docker run -d --name admin-template -p 8080:8080 -v admin-template-data:/app/data ${dockerImage.value}`
    ]
  }
])
const currentDeploymentRecipe = computed(() => deploymentRecipes.value.find((recipe) => recipe.mode === displayRecipeMode.value) ?? deploymentRecipes.value[0])
const restartTargetVersion = computed(() => {
  const pendingJob = latestJobs.value.find((job) =>
    ['pending', 'running', 'artifact_ready', 'restart_required', 'handoff_required'].includes(job.status) && job.target_version
  )
  const target = pendingJob?.target_version || (versionState.needRestart ? latestVersion.value : currentVersion.value)
  return displayVersion(target)
})

const form = reactive<SiteSettings>({
  siteName: siteSettings.siteName,
  siteSubtitle: siteSettings.siteSubtitle,
  logoUrl: siteSettings.logoUrl,
  version: siteSettings.version,
  updateCheckUrl: siteSettings.updateCheckUrl,
  updateUrl: siteSettings.updateUrl,
  rollbackUrl: siteSettings.rollbackUrl,
  restartUrl: siteSettings.restartUrl,
  releaseUrl: siteSettings.releaseUrl,
  enableUpdateCheck: siteSettings.enableUpdateCheck
})

const versionActions = computed<VersionActionItem[]>(() => [
  {
    id: 'update',
    label: strategy.value.action_label || '创建升级任务',
    icon: 'upload',
    buttonClass: 'btn btn-primary',
    risk: strategy.value.warning || '将根据当前运行包模式准备升级任务，真正替换动作由对应部署策略执行。',
    range: `从 ${currentReleaseTag.value} 升级到 ${releaseTag.value}，影响平台后端服务、版本记录、升级审计和 ${currentPackageModeLabel.value}。`,
    targetVersion: releaseTag.value,
    progressHint: currentPackageMode.value === 'binary'
      ? '二进制模式会下载、解包、备份并替换本地运行包，任务状态为“待重启生效”后需要由部署侧重启生效。'
      : '任务创建后会出现在“版本更新任务”；容器、Compose、K8S 或源码开发模式需要部署侧按提示命令执行。'
  },
  {
    id: 'rollback',
    label: '回滚版本',
    icon: 'arrowLeft',
    buttonClass: 'btn btn-warning',
    risk: currentPackageMode.value === 'binary'
      ? `确认后会下载/使用 ${rollbackReleaseTag.value} 的发布包，备份当前运行包并替换本地文件，重启后回滚生效。`
      : '确认后会按当前部署模式创建回滚任务；容器、Compose、K8S 或源码开发模式需要部署侧手动执行目标版本切换。',
    range: `确认从 ${currentReleaseTag.value} 回滚到上一个版本 ${rollbackReleaseTag.value}，影响平台后端服务、版本包目录、升级任务记录和审计记录。`,
    targetVersion: rollbackReleaseTag.value,
    progressHint: currentPackageMode.value === 'binary'
      ? '回滚会使用和升级相同的包准备流程；任务状态为“待重启生效”后需要由部署侧重启生效。'
      : '回滚任务会和升级任务使用同一套任务记录；若当前为 Docker 镜像模式，请手动拉取目标版本镜像并重建容器。'
  },
  {
    id: 'restart',
    label: '检查是否重启',
    icon: 'refresh',
    buttonClass: 'btn btn-danger',
    risk: restartInstruction(),
    range: `检查当前部署是否已完成目标版本切换，以及是否仍需按 ${currentPackageModeLabel.value} 执行部署侧重启或重新部署。`,
    targetVersion: restartTargetVersion.value,
    progressHint: restartInstruction()
  }
])

const actionTypeLabelMap: Record<string, string> = {
  upgrade: '升级',
  update: '升级',
  rollback: '回滚',
  restart: '重启检查'
}
const statusLabelMap: Record<string, string> = {
  pending: '等待中',
  running: '执行中',
  succeeded: '已完成',
  artifact_ready: '安装包已下载',
  restart_required: '待重启生效',
  handoff_required: '待部署执行',
  recorded: '已记录',
  failed: '失败'
}
const statusDescriptionMap: Record<string, string> = {
  pending: '任务已创建，等待后台执行。',
  running: '后台正在下载、解包、校验或替换运行包。',
  succeeded: '任务已完成。',
  artifact_ready: '发布包已准备完成，等待下一步处理。',
  restart_required: '二进制运行包已替换到磁盘，需要由部署侧重启后生效。',
  handoff_required: '当前部署模式需要外部执行镜像更新、容器重建或 rollout。',
  recorded: '任务已记录，实际动作由人工或外部发布流程处理。',
  failed: '任务失败，请查看下方失败原因。'
}
const statusClassMap: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-600 dark:bg-dark-700 dark:text-dark-300',
  running: 'bg-primary-50 text-primary-600 dark:bg-primary-900/30 dark:text-primary-300',
  succeeded: 'bg-green-50 text-green-600 dark:bg-green-900/30 dark:text-green-300',
  artifact_ready: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  restart_required: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  handoff_required: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  recorded: 'bg-gray-100 text-gray-600 dark:bg-dark-700 dark:text-dark-300',
  failed: 'bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-300'
}
const latestJobs = computed(() => versionState.upgradeJobs)

function actionTypeLabel(type?: string) {
  return actionTypeLabelMap[type || ''] || type || '-'
}

function statusLabel(status?: string) {
  return statusLabelMap[status || ''] || status || '-'
}

function statusClass(status?: string) {
  return statusClassMap[status || ''] || statusClassMap.pending
}

function statusDescription(status?: string) {
  return statusDescriptionMap[status || ''] || '任务状态已更新，请查看任务详情。'
}

function packageModeExecutionDetail(mode?: string) {
  const currentMode = mode || currentPackageMode.value
  switch (currentMode) {
    case 'binary':
      return 'Linux 二进制模式由后台准备发布包并替换本地运行包；待重启时需要 systemd、脚本或人工重启后端运行包，重启后刷新任务会自动归档。'
    case 'docker':
      return 'Docker 模式需要部署侧拉取目标镜像并重建容器；单纯 docker restart 不会切换镜像。'
    case 'docker-compose':
      return 'Docker Compose 模式需要部署侧执行 docker compose pull/up 完成容器重建。'
    case 'kubernetes':
      return 'Kubernetes 模式需要部署侧执行 set image / rollout 完成目标版本切换。'
    case 'source-dev':
      return '源码开发模式只记录任务；请重新执行前后端开发服务启动命令。'
    case 'manual':
      return '手动发布模式只记录任务；实际更新、回滚或重启由企业发布流程执行。'
    default:
      return '当前部署模式需要外部流程完成目标版本切换。'
  }
}

function restartInstruction() {
  switch (currentPackageMode.value) {
    case 'binary':
      return 'Linux 二进制模式不会由平台结束当前进程。请在部署机执行 systemctl restart admin-template，或使用受控脚本/人工重启后端运行包。'
    case 'docker':
      return `Docker 模式需要在部署机拉取镜像并重建容器，单纯 docker restart 不会切换镜像。可先执行 docker pull ${dockerImage.value}，再 stop / rm / run。`
    case 'docker-compose':
      return 'Docker Compose 模式请在部署机执行 docker compose pull admin-template && docker compose up -d admin-template。'
    case 'kubernetes':
      return `Kubernetes 模式请由运维执行 kubectl set image deployment/admin-template admin-template=${dockerImage.value} 并等待 rollout 完成。`
    case 'source-dev':
      return '源码开发模式只记录重启检查任务，不会重启开发进程。请重新执行前后端开发服务启动命令。'
    default:
      return '当前模式只记录重启检查任务，请按企业部署流程手动重启或切换到目标版本。'
  }
}

function jobDetail(job: { status: string; error_message?: string; target_version?: string; job_type?: string; package_mode?: string; detail?: string }) {
  if (job.error_message) return job.error_message
  if (job.detail) return job.detail
  const target = job.target_version ? `目标版本 ${job.target_version}。` : ''
  if (job.status === 'handoff_required') return `${packageModeExecutionDetail(job.package_mode)}${target}`
  if (job.status === 'restart_required') return `${packageModeExecutionDetail('binary')}${target}`
  return `${statusDescription(job.status)}${target}`
}

function formatTime(value?: string) {
  if (!value) return '-'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', { hour12: false })
}

function saveSettings() {
  updateSiteSettings(form)
  saved.value = true
  window.setTimeout(() => {
    saved.value = false
  }, 2200)
}

function resetSettings() {
  resetSiteSettings()
  Object.assign(form, siteSettings)
}

function openConfirm(action: VersionActionItem) {
  pendingAction.value = action
}

function openModeNotes() {
  modeNotesDialogOpen.value = true
}

function openAllSteps() {
  allStepsDialogOpen.value = true
}

function closeModeNotes() {
  modeNotesDialogOpen.value = false
}

function closeAllSteps() {
  allStepsDialogOpen.value = false
}

function closeConfirm() {
  pendingAction.value = null
}

async function confirmAction() {
  if (!pendingAction.value) return
  await runSystemUpdateAction(pendingAction.value.id, pendingAction.value.targetVersion)
  closeConfirm()
}

onMounted(() => {
  checkTemplateUpdates(false).then(() => {
    selectedRollbackVersion.value = versionState.rollbackVersion || ''
  })
  refreshUpgradeJobs()
})
</script>

<template>
  <div class="mx-auto max-w-5xl space-y-6">
    <div class="sticky top-0 z-10 overflow-x-auto rounded-2xl border border-gray-100 bg-white/95 p-2 shadow-sm backdrop-blur dark:border-dark-700 dark:bg-dark-900/95">
      <nav class="flex min-w-max gap-2">
        <button
          v-for="tab in panelTabs"
          :key="tab.id"
          type="button"
          :class="[
            'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition',
            activePanel === tab.id
              ? 'bg-primary-50 text-primary-700 ring-1 ring-primary-200 dark:bg-primary-900/30 dark:text-primary-300 dark:ring-primary-800'
              : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900 dark:text-dark-300 dark:hover:bg-dark-800 dark:hover:text-white'
          ]"
          @click="activePanel = tab.id"
        >
          <Icon :name="tab.icon" size="sm" />
          {{ tab.label }}
        </button>
      </nav>
    </div>

    <div v-if="activePanel === 'settings'" class="space-y-6">
      <form class="card" @submit.prevent="saveSettings">
        <div class="card-header">
          <div>
            <h2 class="text-base font-semibold text-gray-900 dark:text-white">更新配置</h2>
            <p class="text-sm text-gray-500 dark:text-dark-400">配置当前版本、检查更新接口和发布说明入口。</p>
          </div>
        </div>

        <div class="card-body space-y-5">
          <Input v-model="form.version" label="当前版本" placeholder="v1.0.0" />

          <div class="grid gap-4 md:grid-cols-2">
            <Input v-model="form.updateCheckUrl" label="检查更新 API" placeholder="/admin/system/check-updates" />
            <Input v-model="form.releaseUrl" label="发布说明地址" placeholder="https://github.com/..." />
          </div>

          <div class="grid gap-4 md:grid-cols-3">
            <Input v-model="form.updateUrl" label="立即更新 API" placeholder="/admin/system/update" />
            <Input v-model="form.rollbackUrl" label="回滚 API" placeholder="/admin/system/rollback" />
            <Input v-model="form.restartUrl" label="检查是否重启 API" placeholder="/admin/system/restart" />
          </div>

          <label class="flex items-center justify-between gap-4 rounded-xl border border-gray-100 px-4 py-3 dark:border-dark-700">
            <span>
              <span class="block text-sm font-medium text-gray-900 dark:text-white">启用检查更新</span>
              <span class="text-xs text-gray-500 dark:text-dark-400">默认使用 Sub Admin 官方 /admin/system/check-updates 契约，强制刷新会传 force=true。</span>
            </span>
            <Toggle v-model="form.enableUpdateCheck" />
          </label>
        </div>

        <div class="card-footer flex items-center justify-between gap-3">
          <p class="text-sm text-primary-600 dark:text-primary-400">{{ saved ? '设置已保存' : '' }}</p>
          <div class="flex gap-2">
            <button type="button" class="btn btn-secondary" @click="resetSettings">恢复默认</button>
            <button type="submit" class="btn btn-primary">保存设置</button>
          </div>
        </div>
      </form>
    </div>

    <div v-else-if="activePanel === 'upgrade'" class="space-y-6">
      <section class="card">
        <div class="card-header">
          <div>
            <h2 class="text-base font-semibold text-gray-900 dark:text-white">版本升级与回退</h2>
            <p class="text-sm text-gray-500 dark:text-dark-400">
              当前为 {{ currentPackageModeLabel }}，升级、回滚和重启检查都会按该部署模式创建任务并进入二次确认。
            </p>
          </div>
        </div>
        <div class="card-body space-y-5">
          <div class="grid gap-4 md:grid-cols-3">
            <div class="rounded-xl border border-gray-100 p-4 dark:border-dark-700">
              <p class="text-xs text-gray-500 dark:text-dark-400">当前版本</p>
              <p class="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{{ currentReleaseTag }}</p>
            </div>
            <div class="rounded-xl border border-gray-100 p-4 dark:border-dark-700">
              <p class="text-xs text-gray-500 dark:text-dark-400">可升级到</p>
              <a
                v-if="versionState.releaseUrl"
                :href="versionState.releaseUrl"
                target="_blank"
                rel="noopener noreferrer"
                class="mt-2 inline-flex items-center gap-1 text-2xl font-semibold text-gray-900 transition hover:text-primary-600 dark:text-white"
              >
                {{ releaseTag }}
                <Icon name="externalLink" size="sm" />
              </a>
              <p v-else class="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{{ releaseTag }}</p>
            </div>
            <div class="rounded-xl border border-gray-100 p-4 dark:border-dark-700">
              <p class="text-xs text-gray-500 dark:text-dark-400">回滚目标</p>
              <p class="mt-2 text-2xl font-semibold text-gray-900 dark:text-white">{{ rollbackReleaseTag }}</p>
            </div>
          </div>

          <div class="rounded-xl border border-gray-100 p-4 dark:border-dark-700">
            <div class="grid gap-4 md:grid-cols-[1fr_1.4fr] md:items-end">
              <div>
                <p class="text-sm font-medium text-gray-900 dark:text-white">选择回滚目标</p>
                <p class="mt-1 text-xs text-gray-500 dark:text-dark-400">
                  默认选择当前版本以下的最高真实发布版本；需要时可选择更早的已知发布版本。
                </p>
              </div>
              <Select
                v-model="selectedRollbackVersion"
                :options="rollbackOptions"
                placeholder="暂无可回滚版本"
                :disabled="!rollbackOptions.length"
              />
            </div>
          </div>

          <div v-if="versionState.actionError || versionState.actionMessage" class="rounded-xl bg-gray-50 px-4 py-3 dark:bg-dark-900/50">
            <p v-if="versionState.actionError" class="text-sm text-red-600 dark:text-red-400">{{ versionState.actionError }}</p>
            <p v-else class="text-sm text-primary-600 dark:text-primary-400">{{ versionState.actionMessage }}</p>
          </div>

          <div class="grid gap-3 md:grid-cols-3">
            <button
              v-for="action in versionActions"
              :key="action.id"
              type="button"
              :class="action.buttonClass"
              :disabled="Boolean(versionState.actionLoading)"
              @click="openConfirm(action)"
            >
              <Icon :name="action.icon" size="sm" :class="{ 'animate-spin': versionState.actionLoading === action.id }" />
              {{ action.label }}
            </button>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card-header flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 class="text-base font-semibold text-gray-900 dark:text-white">版本更新任务</h2>
            <p class="text-sm text-gray-500 dark:text-dark-400">
              升级、回滚和重启任务都会记录在这里；“待重启生效”表示二进制运行包已替换到磁盘，重启后刷新任务会自动归档为已完成。
            </p>
          </div>
          <button class="btn btn-secondary btn-sm" type="button" :disabled="versionState.jobsLoading" @click="refreshUpgradeJobs">
            <Icon name="refresh" size="sm" :class="{ 'animate-spin': versionState.jobsLoading }" />
            刷新任务
          </button>
        </div>
        <div class="card-body">
          <div v-if="latestJobs.length" class="overflow-x-auto">
            <table class="min-w-full divide-y divide-gray-100 text-sm dark:divide-dark-700">
              <thead>
                <tr class="text-left text-xs uppercase tracking-wide text-gray-400 dark:text-dark-400">
                  <th class="whitespace-nowrap px-3 py-2 font-medium">任务</th>
                  <th class="whitespace-nowrap px-3 py-2 font-medium">类型</th>
                  <th class="whitespace-nowrap px-3 py-2 font-medium">目标版本</th>
                  <th class="whitespace-nowrap px-3 py-2 font-medium">状态</th>
                  <th class="min-w-64 px-3 py-2 font-medium">执行信息</th>
                  <th class="whitespace-nowrap px-3 py-2 font-medium">创建时间</th>
                  <th class="whitespace-nowrap px-3 py-2 font-medium">完成时间</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100 dark:divide-dark-700">
                <tr v-for="job in latestJobs" :key="job.id" class="text-gray-700 dark:text-dark-200">
                  <td class="whitespace-nowrap px-3 py-3 font-mono text-xs">{{ job.id }}</td>
                  <td class="whitespace-nowrap px-3 py-3">{{ actionTypeLabel(job.job_type) }}</td>
                  <td class="whitespace-nowrap px-3 py-3">{{ job.target_version || currentReleaseTag }}</td>
                  <td class="whitespace-nowrap px-3 py-3">
                    <span :class="['rounded-full px-2.5 py-1 text-xs font-medium', statusClass(job.status)]">
                      {{ statusLabel(job.status) }}
                    </span>
                  </td>
                  <td class="px-3 py-3">
                    <div class="max-w-md">
                      <p
                        :class="[
                          'text-sm leading-5',
                          job.error_message ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-dark-300'
                        ]"
                      >
                        {{ jobDetail(job) }}
                      </p>
                    </div>
                  </td>
                  <td class="whitespace-nowrap px-3 py-3">{{ formatTime(job.created_at) }}</td>
                  <td class="whitespace-nowrap px-3 py-3">{{ formatTime(job.finished_at) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-else class="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500 dark:border-dark-700 dark:text-dark-400">
            暂无版本任务。创建升级、回滚或重启任务后会显示在这里。
          </div>
        </div>
      </section>
    </div>

    <section v-else class="card">
      <div class="card-header">
        <h2 class="text-base font-semibold text-gray-900 dark:text-white">升级策略</h2>
      </div>
      <div class="card-body space-y-4">
        <div class="rounded-xl border border-gray-100 p-4 dark:border-dark-700">
          <div class="flex items-center justify-between gap-2">
            <div>
              <p class="text-xs text-gray-500 dark:text-dark-400">运行包模式</p>
              <p class="mt-2 text-lg font-semibold text-gray-900 dark:text-white">{{ currentPackageModeLabel }}</p>
              <p class="mt-1 font-mono text-xs text-gray-400 dark:text-dark-500">{{ strategy.mode || versionState.packageMode }}</p>
            </div>
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-gray-500 transition hover:bg-gray-100 hover:text-primary-600 dark:text-dark-400 dark:hover:bg-dark-800"
              title="查看模式备注"
              @click="openModeNotes"
            >
              <Icon name="infoCircle" size="xs" />
              模式备注
            </button>
          </div>
        </div>

        <div class="rounded-xl bg-gray-50 p-4 dark:bg-dark-900/50">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <p class="text-sm font-medium text-gray-900 dark:text-white">当前更新方式</p>
            <button
              type="button"
              class="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs text-gray-500 transition hover:text-primary-600 dark:bg-dark-800 dark:text-dark-300"
              @click="openAllSteps"
            >
              查看全部步骤
              <Icon name="chevronRight" size="xs" />
            </button>
          </div>

          <div class="mt-4">
            <div
              v-if="currentDeploymentRecipe"
              class="rounded-xl border border-gray-200 bg-white p-4 dark:border-dark-700 dark:bg-dark-800"
            >
              <div class="flex flex-wrap items-center gap-2">
                <p class="text-sm font-semibold text-gray-900 dark:text-white">{{ currentDeploymentRecipe.title }}</p>
                <span class="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-500 dark:bg-dark-700 dark:text-dark-300">
                  {{ currentDeploymentRecipe.label }}
                </span>
                <span class="rounded-full bg-primary-50 px-2.5 py-1 text-xs text-primary-600 dark:bg-primary-900/30 dark:text-primary-300">当前模式</span>
              </div>
              <p class="mt-2 text-sm text-gray-600 dark:text-dark-300">{{ strategy.description }}</p>
              <p class="mt-2 text-sm text-gray-600 dark:text-dark-300">{{ currentDeploymentRecipe.description }}</p>
              <p v-if="strategy.warning" class="mt-1 text-sm text-amber-600 dark:text-amber-400">{{ strategy.warning }}</p>
              <p v-else class="mt-1 text-sm text-amber-600 dark:text-amber-400">{{ currentDeploymentRecipe.note }}</p>
              <p v-if="strategy.image" class="mt-3 break-all font-mono text-xs text-gray-500 dark:text-dark-400">{{ strategy.image }}</p>
              <pre
                class="mt-3 overflow-x-auto rounded-lg bg-gray-100 px-3 py-2 font-mono text-xs leading-6 text-gray-800 dark:bg-dark-900 dark:text-dark-200"
              >{{ currentDeploymentRecipe.commands.join('\n') }}</pre>
            </div>
          </div>
        </div>
      </div>
    </section>

    <BaseDialog
      :show="modeNotesDialogOpen"
      title="运行包模式备注"
      width="normal"
      @close="closeModeNotes"
    >
      <dl class="space-y-3">
        <div
          v-for="[mode, name, note] in packageModeNotes"
          :key="mode"
          class="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/50"
        >
          <dt class="flex flex-wrap items-center gap-2 text-sm font-semibold text-gray-900 dark:text-white">
            {{ name }}
            <span class="rounded-full bg-white px-2.5 py-1 font-mono text-xs font-normal text-gray-500 dark:bg-dark-800 dark:text-dark-300">
              {{ mode }}
            </span>
            <span
              v-if="mode === currentPackageMode"
              class="rounded-full bg-primary-50 px-2.5 py-1 text-xs font-normal text-primary-600 dark:bg-primary-900/30 dark:text-primary-300"
            >
              当前模式
            </span>
          </dt>
          <dd class="mt-2 text-sm leading-6 text-gray-600 dark:text-dark-300">{{ note }}</dd>
        </div>
      </dl>

      <template #footer>
        <button class="btn btn-primary" type="button" @click="closeModeNotes">知道了</button>
      </template>
    </BaseDialog>

    <BaseDialog
      :show="allStepsDialogOpen"
      title="升级步骤"
      width="normal"
      @close="closeAllSteps"
    >
      <div class="space-y-3">
        <div
          v-for="recipe in deploymentRecipes"
          :key="recipe.mode"
          class="rounded-xl border border-gray-100 bg-gray-50 p-4 dark:border-dark-700 dark:bg-dark-900/50"
        >
          <div class="flex flex-wrap items-center gap-2">
            <p class="text-sm font-semibold text-gray-900 dark:text-white">{{ recipe.title }}</p>
            <span class="rounded-full bg-white px-2.5 py-1 text-xs text-gray-500 dark:bg-dark-800 dark:text-dark-300">
              {{ recipe.label }}
            </span>
          </div>
          <p class="mt-2 text-sm text-gray-600 dark:text-dark-300">{{ recipe.description }}</p>
          <pre
            class="mt-3 overflow-x-auto rounded-lg bg-gray-100 px-3 py-2 font-mono text-xs leading-6 text-gray-800 dark:bg-dark-800 dark:text-dark-200"
          >{{ recipe.commands.join('\n') }}</pre>
        </div>
      </div>

      <template #footer>
        <button class="btn btn-primary" type="button" @click="closeAllSteps">知道了</button>
      </template>
    </BaseDialog>

    <BaseDialog
      :show="Boolean(pendingAction)"
      :title="pendingAction ? `确认${pendingAction.label}` : '确认版本升级与回退'"
      width="normal"
      @close="closeConfirm"
    >
      <dl v-if="pendingAction" class="space-y-3 text-sm">
        <div>
          <dt class="font-medium text-gray-900 dark:text-white">当前版本</dt>
          <dd class="mt-1 text-gray-600 dark:text-dark-300">{{ currentReleaseTag }}</dd>
        </div>
        <div>
          <dt class="font-medium text-gray-900 dark:text-white">目标版本</dt>
          <dd class="mt-1 text-gray-600 dark:text-dark-300">{{ pendingAction.targetVersion }}</dd>
        </div>
        <div>
          <dt class="font-medium text-gray-900 dark:text-white">部署模式</dt>
          <dd class="mt-1 text-gray-600 dark:text-dark-300">
            {{ currentPackageModeLabel }}（{{ currentPackageMode }}）
          </dd>
        </div>
        <div>
          <dt class="font-medium text-gray-900 dark:text-white">范围</dt>
          <dd class="mt-1 text-gray-600 dark:text-dark-300">{{ pendingAction.range }}</dd>
        </div>
        <div v-if="pendingAction.id === 'restart'">
          <dt class="font-medium text-gray-900 dark:text-white">说明</dt>
          <dd class="mt-1 text-gray-600 dark:text-dark-300">{{ pendingAction.progressHint }}</dd>
        </div>
        <div v-else>
          <dt class="font-medium text-gray-900 dark:text-white">任务进度</dt>
          <dd class="mt-1 text-gray-600 dark:text-dark-300">{{ pendingAction.progressHint }}</dd>
        </div>
      </dl>

      <template #footer>
        <button class="btn btn-secondary" type="button" :disabled="Boolean(versionState.actionLoading)" @click="closeConfirm">
          取消
        </button>
        <button
          class="btn btn-danger"
          type="button"
          :disabled="Boolean(versionState.actionLoading)"
          @click="confirmAction"
        >
          <Icon v-if="versionState.actionLoading" name="refresh" size="sm" class="animate-spin" />
          确认执行
        </button>
      </template>
    </BaseDialog>
  </div>
</template>
