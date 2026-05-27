<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import { Icon } from '@/components/icons'
import { navigationItems, type NavigationItem } from '@/template/navigation'
import { siteSettings } from '@/template/site'
import VersionBadge from '@/components/common/VersionBadge.vue'

const route = useRoute()
const router = useRouter()
const title = computed(() => String(route.meta.title ?? 'Kubernetes 控制台'))
const sidebarCollapsed = ref(localStorage.getItem('sidebar-collapsed') === 'true')
const isDark = ref(document.documentElement.classList.contains('dark'))
const expandedMenus = ref<Set<string>>(new Set())
const collapsedMenus = ref<Set<string>>(new Set())
const selectedCluster = ref('prod-main')
const selectedNamespace = ref('default')
const globalSearch = ref('')

const clusterOptions = [
  { id: 'prod-main', name: 'prod-main', status: 'Ready' },
  { id: 'staging', name: 'staging', status: 'Ready' },
  { id: 'dev-sandbox', name: 'dev-sandbox', status: 'Degraded' }
]

const namespaceOptions = ['default', 'kube-system', 'platform', 'all-namespaces']
const currentUser = {
  name: '平台管理员',
  role: 'Cluster Admin',
  avatar: 'KA'
}

const activeCluster = computed(
  () => clusterOptions.find((cluster) => cluster.id === selectedCluster.value) ?? clusterOptions[0]
)

function replaceSetValue(target: typeof expandedMenus, value?: string) {
  target.value = value ? new Set([value]) : new Set()
}

function isMenuActive(item: NavigationItem) {
  if (route.path === item.path) return true
  return item.children?.some((child) => route.path === child.path || route.path.startsWith(`${child.path}/`)) ?? false
}

function isMenuExpanded(item: NavigationItem) {
  if (collapsedMenus.value.has(item.path)) return false
  return isMenuActive(item) || expandedMenus.value.has(item.path)
}

function toggleMenu(item: NavigationItem) {
  if (sidebarCollapsed.value) {
    router.push(item.path)
    return
  }

  if (isMenuExpanded(item)) {
    replaceSetValue(expandedMenus)
    collapsedMenus.value = new Set([item.path])
    return
  }

  replaceSetValue(expandedMenus, item.path)
  collapsedMenus.value = new Set()
}

function handleChildMenuClick(parent: NavigationItem) {
  replaceSetValue(expandedMenus, parent.path)
  collapsedMenus.value = new Set()
}

function handleLeafMenuClick() {
  replaceSetValue(expandedMenus)
  collapsedMenus.value = new Set()
}

function toggleTheme() {
  isDark.value = !isDark.value
  document.documentElement.classList.toggle('dark', isDark.value)
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light')
}

function toggleSidebar() {
  sidebarCollapsed.value = !sidebarCollapsed.value
  localStorage.setItem('sidebar-collapsed', String(sidebarCollapsed.value))
}
</script>

<template>
  <div class="min-h-screen bg-gray-50 text-gray-900 dark:bg-dark-950 dark:text-gray-100">
    <aside class="sidebar admin-shell-sidebar hidden lg:flex" :class="{ 'admin-shell-sidebar-collapsed': sidebarCollapsed }">
      <div class="sidebar-header" :class="{ 'admin-shell-sidebar-header-collapsed': sidebarCollapsed }">
        <div class="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white shadow-glow">
          <img :src="siteSettings.logoUrl" :alt="siteSettings.siteName" class="h-full w-full object-contain" />
        </div>
        <div class="admin-shell-sidebar-brand min-w-0" :class="{ 'admin-shell-sidebar-brand-collapsed': sidebarCollapsed }">
          <p class="truncate text-sm font-semibold text-gray-900 dark:text-white">{{ siteSettings.siteName }}</p>
          <VersionBadge class="mt-1" />
        </div>
      </div>

      <nav class="sidebar-nav">
        <template v-for="item in navigationItems" :key="item.path">
          <button
            v-if="item.children?.length"
            type="button"
            class="sidebar-link w-full"
            :class="{
              'sidebar-link-active': isMenuActive(item),
              'admin-shell-sidebar-link-collapsed': sidebarCollapsed
            }"
            :title="sidebarCollapsed ? item.label : undefined"
            :aria-expanded="isMenuExpanded(item)"
            @click="toggleMenu(item)"
          >
            <Icon :name="item.icon" size="md" class="shrink-0" />
            <span class="admin-shell-sidebar-label" :class="{ 'admin-shell-sidebar-label-collapsed': sidebarCollapsed }">{{ item.label }}</span>
            <Icon
              name="chevronDown"
              size="sm"
              class="ml-auto shrink-0 transition-transform duration-200"
              :class="[
                isMenuExpanded(item) ? 'rotate-180' : '',
                { 'admin-shell-sidebar-label-collapsed': sidebarCollapsed }
              ]"
            />
          </button>

          <div v-if="item.children?.length && isMenuExpanded(item) && !sidebarCollapsed" class="admin-shell-submenu">
            <RouterLink
              v-for="child in item.children"
              :key="child.path"
              :to="child.path"
              class="sidebar-link admin-shell-submenu-link"
              active-class="sidebar-link-active"
              @click="handleChildMenuClick(item)"
            >
              <Icon :name="child.icon" size="sm" class="shrink-0" />
              <span class="admin-shell-sidebar-label">{{ child.label }}</span>
            </RouterLink>
          </div>

          <RouterLink
            v-else-if="!item.children?.length"
            :to="item.path"
            class="sidebar-link"
            :class="{ 'admin-shell-sidebar-link-collapsed': sidebarCollapsed }"
            active-class="sidebar-link-active"
            :title="sidebarCollapsed ? item.label : undefined"
            @click="handleLeafMenuClick"
          >
            <Icon :name="item.icon" size="md" class="shrink-0" />
            <span class="admin-shell-sidebar-label" :class="{ 'admin-shell-sidebar-label-collapsed': sidebarCollapsed }">{{ item.label }}</span>
          </RouterLink>
        </template>
      </nav>

      <div class="mt-auto border-t border-gray-100 p-3 dark:border-dark-800">
        <button
          type="button"
          class="sidebar-link mb-2 w-full"
          :class="{ 'admin-shell-sidebar-link-collapsed': sidebarCollapsed }"
          :title="sidebarCollapsed ? (isDark ? '浅色模式' : '深色模式') : undefined"
          @click="toggleTheme"
        >
          <Icon :name="isDark ? 'sun' : 'moon'" size="md" class="shrink-0" />
          <span class="admin-shell-sidebar-label" :class="{ 'admin-shell-sidebar-label-collapsed': sidebarCollapsed }">
            {{ isDark ? '浅色模式' : '深色模式' }}
          </span>
        </button>

        <button
          type="button"
          class="sidebar-link mb-2 w-full"
          :class="{ 'admin-shell-sidebar-link-collapsed': sidebarCollapsed }"
          :title="sidebarCollapsed ? '展开' : '收起'"
          @click="toggleSidebar"
        >
          <Icon :name="sidebarCollapsed ? 'chevronRight' : 'chevronLeft'" size="md" class="shrink-0" />
          <span class="admin-shell-sidebar-label" :class="{ 'admin-shell-sidebar-label-collapsed': sidebarCollapsed }">收起</span>
        </button>
      </div>
    </aside>

    <div class="min-h-screen transition-[margin] duration-300" :class="sidebarCollapsed ? 'lg:ml-[72px]' : 'lg:ml-64'">
      <header
        class="sticky top-0 z-30 border-b border-gray-200 bg-white/90 px-4 py-4 backdrop-blur dark:border-dark-800 dark:bg-dark-900/90 sm:px-6 lg:px-8"
      >
        <div class="admin-shell-topbar">
          <div class="min-w-0">
            <h1 class="text-xl font-semibold text-gray-900 dark:text-white">{{ title }}</h1>
            <p class="text-sm text-gray-500 dark:text-dark-400">{{ siteSettings.siteSubtitle }}</p>
          </div>

          <div class="admin-shell-toolbar">
            <label class="admin-shell-control min-w-[180px]">
              <span class="admin-shell-control-label">集群</span>
              <span class="admin-shell-select-wrap">
                <select v-model="selectedCluster" class="admin-shell-select" aria-label="当前集群">
                  <option v-for="cluster in clusterOptions" :key="cluster.id" :value="cluster.id">
                    {{ cluster.name }}
                  </option>
                </select>
                <span
                  class="admin-shell-status-dot"
                  :class="activeCluster.status === 'Ready' ? 'bg-emerald-500' : 'bg-amber-500'"
                  aria-hidden="true"
                ></span>
              </span>
            </label>

            <label class="admin-shell-control min-w-[160px]">
              <span class="admin-shell-control-label">Namespace</span>
              <select v-model="selectedNamespace" class="admin-shell-select" aria-label="当前 Namespace">
                <option v-for="namespace in namespaceOptions" :key="namespace" :value="namespace">
                  {{ namespace }}
                </option>
              </select>
            </label>

            <label class="admin-shell-search">
              <Icon name="search" size="sm" class="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                v-model="globalSearch"
                class="input h-10 w-full pl-9 text-sm"
                type="search"
                placeholder="搜索资源、Namespace、节点"
                aria-label="全局搜索"
              />
            </label>

            <div class="admin-shell-user">
              <div class="admin-shell-avatar" aria-hidden="true">{{ currentUser.avatar }}</div>
              <div class="min-w-0">
                <p class="truncate text-sm font-semibold text-gray-900 dark:text-white">{{ currentUser.name }}</p>
                <p class="truncate text-xs text-gray-500 dark:text-dark-400">{{ currentUser.role }}</p>
              </div>
            </div>

            <RouterLink to="/login" class="btn btn-secondary btn-sm shrink-0">退出</RouterLink>
          </div>
        </div>
      </header>

      <main class="p-4 sm:p-6 lg:p-8">
        <RouterView />
      </main>
    </div>
  </div>
</template>

<style scoped>
.admin-shell-sidebar {
  width: 16rem;
}

.admin-shell-sidebar-collapsed {
  width: 4.5rem;
}

.admin-shell-sidebar-header-collapsed {
  gap: 0;
  padding-left: 1rem;
  padding-right: 1rem;
}

.admin-shell-sidebar-brand {
  min-width: 0;
  transition:
    max-width 0.2s ease,
    opacity 0.14s ease,
    transform 0.14s ease;
  max-width: 12rem;
}

.admin-shell-sidebar-brand-collapsed {
  max-width: 0;
  overflow: hidden;
  opacity: 0;
  transform: translateX(-4px);
  pointer-events: none;
}

.admin-shell-sidebar-link-collapsed {
  justify-content: center;
  gap: 0;
  padding-left: 0.875rem;
  padding-right: 0.875rem;
}

.admin-shell-submenu {
  position: relative;
  margin: 0.25rem 0 0.5rem 1.75rem;
  padding-left: 0.75rem;
}

.admin-shell-submenu::before {
  content: '';
  position: absolute;
  left: 0;
  top: 0.25rem;
  bottom: 0.25rem;
  width: 1px;
  background: rgb(229 231 235);
}

:global(.dark) .admin-shell-submenu::before {
  background: rgb(55 65 81);
}

.admin-shell-submenu-link {
  padding-left: 0.875rem;
  padding-right: 0.75rem;
}

.admin-shell-sidebar-label {
  display: block;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  transition:
    max-width 0.18s ease,
    opacity 0.12s ease,
    transform 0.12s ease;
  max-width: 12rem;
}

.admin-shell-sidebar-label-collapsed {
  max-width: 0;
  overflow: hidden;
  opacity: 0;
  transform: translateX(-4px);
  pointer-events: none;
}

.admin-shell-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.admin-shell-toolbar {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  justify-content: flex-end;
  gap: 0.75rem;
}

.admin-shell-control {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.admin-shell-control-label {
  font-size: 0.6875rem;
  font-weight: 600;
  line-height: 1;
  color: rgb(107 114 128);
}

:global(.dark) .admin-shell-control-label {
  color: rgb(156 163 175);
}

.admin-shell-select-wrap {
  position: relative;
  display: block;
}

.admin-shell-select {
  height: 2.5rem;
  width: 100%;
  appearance: none;
  border-radius: 0.5rem;
  border: 1px solid rgb(229 231 235);
  background: rgb(255 255 255);
  padding: 0 2rem 0 0.75rem;
  font-size: 0.875rem;
  font-weight: 500;
  color: rgb(17 24 39);
  outline: none;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}

.admin-shell-select:focus {
  border-color: rgb(59 130 246);
  box-shadow: 0 0 0 3px rgb(59 130 246 / 0.12);
}

:global(.dark) .admin-shell-select {
  border-color: rgb(55 65 81);
  background: rgb(17 24 39);
  color: rgb(243 244 246);
}

.admin-shell-status-dot {
  position: absolute;
  right: 0.75rem;
  top: 50%;
  height: 0.5rem;
  width: 0.5rem;
  transform: translateY(-50%);
  border-radius: 9999px;
}

.admin-shell-search {
  position: relative;
  width: min(26vw, 22rem);
  min-width: 14rem;
}

.admin-shell-user {
  display: flex;
  min-width: 10rem;
  align-items: center;
  gap: 0.625rem;
  border-left: 1px solid rgb(229 231 235);
  padding-left: 0.75rem;
}

:global(.dark) .admin-shell-user {
  border-left-color: rgb(55 65 81);
}

.admin-shell-avatar {
  display: flex;
  height: 2.25rem;
  width: 2.25rem;
  flex: none;
  align-items: center;
  justify-content: center;
  border-radius: 9999px;
  background: rgb(15 23 42);
  font-size: 0.75rem;
  font-weight: 700;
  color: white;
}

:global(.dark) .admin-shell-avatar {
  background: rgb(59 130 246);
}

@media (max-width: 1279px) {
  .admin-shell-topbar {
    align-items: flex-start;
    flex-direction: column;
  }

  .admin-shell-toolbar {
    width: 100%;
    flex-wrap: wrap;
    justify-content: flex-start;
  }

  .admin-shell-search {
    width: 100%;
    min-width: min(100%, 18rem);
    flex: 1 1 18rem;
  }
}

@media (max-width: 639px) {
  .admin-shell-control,
  .admin-shell-user {
    width: 100%;
    min-width: 0;
  }

  .admin-shell-toolbar > .btn {
    width: 100%;
  }
}
</style>
