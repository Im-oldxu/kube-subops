<script setup lang="ts">
import { computed, ref } from 'vue'
import { RouterLink, RouterView, useRoute } from 'vue-router'
import { Icon } from '@/components/icons'
import { navigationItems, type NavigationItem } from '@/template/navigation'
import { siteSettings } from '@/template/site'
import VersionBadge from '@/components/common/VersionBadge.vue'

const route = useRoute()
const title = computed(() => String(route.meta.title ?? '后台模板'))
const sidebarCollapsed = ref(localStorage.getItem('sidebar-collapsed') === 'true')
const isDark = ref(document.documentElement.classList.contains('dark'))
const expandedMenus = ref<Set<string>>(new Set())
const collapsedMenus = ref<Set<string>>(new Set())

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
        <div class="flex items-center justify-between gap-4">
          <div>
            <h1 class="text-xl font-semibold text-gray-900 dark:text-white">{{ title }}</h1>
            <p class="text-sm text-gray-500 dark:text-dark-400">{{ siteSettings.siteSubtitle }}</p>
          </div>
          <RouterLink to="/login" class="btn btn-secondary btn-sm">登录页</RouterLink>
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
</style>
