<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { Icon } from '@/components/icons'
import { checkTemplateUpdates, runSystemUpdateAction, versionState } from '@/template/version'
import { siteSettings } from '@/template/site'

const dropdownOpen = ref(false)
const rootRef = ref<HTMLElement | null>(null)
const updating = ref(false)

const currentVersion = computed(() => versionState.currentVersion || siteSettings.version)
const latestVersion = computed(() => versionState.latestVersion || currentVersion.value)
const canCheckUpdates = computed(() => siteSettings.enableUpdateCheck && Boolean(siteSettings.updateCheckUrl.trim()))
const currentVersionLabel = computed(() => formatVersion(currentVersion.value))
const latestVersionLabel = computed(() => formatVersion(latestVersion.value))
const badgeButtonClass = computed(() => {
  const base = 'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium ring-1 transition'

  if (versionState.error) {
    return `${base} bg-red-50 text-red-700 ring-red-200 hover:bg-red-100 dark:bg-red-900/30 dark:text-red-300 dark:ring-red-800`
  }

  if (versionState.hasUpdate) {
    return `${base} bg-amber-50 text-amber-700 ring-amber-200 hover:bg-amber-100 dark:bg-amber-900/30 dark:text-amber-300 dark:ring-amber-800`
  }

  return `${base} bg-white text-gray-600 ring-gray-200 hover:bg-gray-50 hover:text-gray-900 dark:bg-dark-800 dark:text-dark-300 dark:ring-dark-700 dark:hover:bg-dark-700 dark:hover:text-white`
})

function formatVersion(version: string) {
  return version.startsWith('v') ? version : `v${version}`
}

function toggleDropdown() {
  dropdownOpen.value = !dropdownOpen.value
  if (dropdownOpen.value && canCheckUpdates.value) {
    checkTemplateUpdates(false)
  }
}

async function refreshVersion() {
  dropdownOpen.value = true
  if (!canCheckUpdates.value) return
  await checkTemplateUpdates(true)
}

async function updateNow() {
  if (!versionState.hasUpdate || versionState.actionLoading || updating.value) return

  updating.value = true
  try {
    await runSystemUpdateAction('update', latestVersionLabel.value)
  } finally {
    updating.value = false
  }
}

function closeDropdown(event: MouseEvent) {
  if (rootRef.value && !rootRef.value.contains(event.target as Node)) {
    dropdownOpen.value = false
  }
}

onMounted(() => {
  if (canCheckUpdates.value) {
    checkTemplateUpdates(false)
  }
  document.addEventListener('click', closeDropdown)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', closeDropdown)
})
</script>

<template>
  <div ref="rootRef" class="relative inline-flex items-center">
    <button
      type="button"
      :class="badgeButtonClass"
      :title="versionState.hasUpdate ? '发现新版本' : '当前版本'"
      @click.stop="toggleDropdown"
    >
      <span>{{ currentVersionLabel }}</span>
      <span
        :class="[
          'h-2 w-2 rounded-full',
          versionState.error
            ? 'bg-red-400'
            : versionState.hasUpdate
              ? 'bg-amber-400'
              : 'bg-green-500'
        ]"
      ></span>
    </button>

    <transition name="dropdown">
      <div
        v-if="dropdownOpen"
        class="absolute left-0 top-full z-50 mt-3 w-72 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-xl dark:border-dark-700 dark:bg-dark-800"
      >
        <div class="flex items-center justify-between border-b border-gray-100 px-4 py-3 dark:border-dark-700">
          <span class="text-sm font-medium text-gray-700 dark:text-dark-300">当前版本</span>
          <button
            v-if="canCheckUpdates"
            type="button"
            class="rounded-lg p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-dark-700 dark:hover:text-dark-200"
            title="刷新"
            @click="refreshVersion"
          >
            <Icon name="refresh" size="sm" :class="{ 'animate-spin': versionState.loading }" />
          </button>
        </div>

        <div class="p-5 text-center">
          <div v-if="versionState.loading" class="flex justify-center py-7">
            <span class="spinner text-primary-500"></span>
          </div>
          <template v-else>
            <div class="mb-3 inline-flex items-center gap-2">
              <span class="text-3xl font-bold text-gray-900 dark:text-white">
                {{ currentVersionLabel }}
              </span>
              <span
                v-if="canCheckUpdates && versionState.hasUpdate && !versionState.error"
                class="flex h-8 w-8 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400"
              >
                <Icon name="exclamationCircle" size="sm" :stroke-width="2.4" />
              </span>
              <span
                v-else-if="canCheckUpdates && !versionState.hasUpdate && !versionState.error"
                class="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400"
              >
                <Icon name="check" size="sm" :stroke-width="2.4" />
              </span>
            </div>
            <p
              v-if="canCheckUpdates && versionState.hasUpdate && !versionState.error"
              class="mb-4 text-sm text-gray-500 dark:text-dark-400"
            >
              最新版本: {{ latestVersionLabel }}
            </p>

            <p v-if="versionState.error" class="text-sm text-red-500">
              检查失败：{{ versionState.error }}
            </p>
            <p v-else-if="!canCheckUpdates" class="text-sm text-gray-500 dark:text-dark-400">
              未配置更新检查
            </p>
            <template v-else-if="versionState.hasUpdate">
              <div class="rounded-xl border border-amber-200 bg-amber-50 p-3 text-left dark:border-amber-900/60 dark:bg-amber-900/20">
                <div class="flex items-center gap-3">
                  <span class="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300">
                    <Icon name="download" size="sm" :stroke-width="2" />
                  </span>
                  <div class="min-w-0">
                    <p class="text-sm font-medium text-amber-700 dark:text-amber-300">有新版本可用!</p>
                    <p class="text-sm text-amber-600 dark:text-amber-400">{{ latestVersionLabel }}</p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                class="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-teal-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-teal-600 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-teal-500 dark:hover:bg-teal-400"
                :disabled="Boolean(versionState.actionLoading) || updating"
                @click="updateNow"
              >
                <Icon name="download" size="sm" :class="{ 'animate-bounce': updating || versionState.actionLoading === 'update' }" />
                {{ updating || versionState.actionLoading === 'update' ? '正在准备...' : '立即更新' }}
              </button>

              <p
                v-if="versionState.actionMessage"
                class="mt-3 rounded-lg bg-primary-50 px-3 py-2 text-sm text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
              >
                {{ versionState.actionMessage }}
              </p>
            </template>
            <p v-else class="text-sm text-gray-500 dark:text-dark-400">已是最新版本</p>

            <a
              v-if="versionState.releaseUrl"
              :href="versionState.releaseUrl"
              target="_blank"
              rel="noopener noreferrer"
              class="mt-5 inline-flex items-center justify-center gap-2 text-sm text-gray-500 transition hover:text-primary-600 dark:text-dark-400"
            >
              <Icon :name="versionState.hasUpdate ? 'externalLink' : 'github'" size="sm" />
              {{ versionState.hasUpdate ? '查看更新日志' : '查看发布' }}
            </a>
          </template>
        </div>
      </div>
    </transition>
  </div>
</template>

<style scoped>
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.18s ease;
}

.dropdown-enter-from,
.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
}
</style>
