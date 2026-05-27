<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import DataTable from '@/components/common/DataTable.vue'
import Select from '@/components/common/Select.vue'
import Icon from '@/components/icons/Icon.vue'
import { records } from '@/template/data'
import type { Column } from '@/components/common/types'

const hiddenColumnsStorageKey = 'template-records-hidden-columns'
const visibleFiltersStorageKey = 'template-records-visible-filters'

const statusOptions = [
  { label: '全部状态', value: 'all' },
  { label: '待处理', value: 'pending' },
  { label: '进行中', value: 'in_progress' },
  { label: '已完成', value: 'done' }
]

const filters = reactive({
  keyword: '',
  status: 'all'
})
const visibleFilters = reactive(new Set(['status']))
const hiddenColumns = reactive(new Set<string>())
const showFilterDropdown = ref(false)
const showColumnDropdown = ref(false)
const loading = ref(false)
const filterDropdownRef = ref<HTMLElement | null>(null)
const columnDropdownRef = ref<HTMLElement | null>(null)

const builtInFilters = [
  { key: 'status', name: '状态' }
]
const baseTableColumns: Column[] = [
  { key: 'id', label: '编号', sortable: true, class: 'font-mono text-xs' },
  { key: 'title', label: '标题', sortable: true },
  { key: 'owner', label: '负责人', sortable: true },
  { key: 'status', label: '状态', sortable: true },
  { key: 'updatedAt', label: '更新时间', sortable: true },
  { key: 'actions', label: '操作' }
]
const toggleableColumns = computed(() => baseTableColumns.filter((column) => column.key !== 'actions'))
const tableColumns = computed(() => baseTableColumns.filter((column) => column.key === 'actions' || !hiddenColumns.has(column.key)))
const filteredRecords = computed(() => {
  const keyword = filters.keyword.trim().toLowerCase()
  return records
    .filter((record) => !keyword || record.id.toLowerCase().includes(keyword) || record.title.toLowerCase().includes(keyword))
    .filter((record) => filters.status === 'all' || record.status === statusLabelByValue(filters.status))
})

function statusLabelByValue(value: string) {
  return statusOptions.find((option) => option.value === value)?.label ?? value
}

function isColumnVisible(key: string) {
  return !hiddenColumns.has(key)
}

function toggleColumn(key: string) {
  if (hiddenColumns.has(key)) {
    hiddenColumns.delete(key)
  } else {
    hiddenColumns.add(key)
  }
  localStorage.setItem(hiddenColumnsStorageKey, JSON.stringify([...hiddenColumns]))
}

function toggleFilter(key: string) {
  if (visibleFilters.has(key)) {
    visibleFilters.delete(key)
    if (key === 'status') filters.status = 'all'
  } else {
    visibleFilters.add(key)
  }
  localStorage.setItem(visibleFiltersStorageKey, JSON.stringify([...visibleFilters]))
}

function refreshRecords() {
  loading.value = true
  window.setTimeout(() => {
    loading.value = false
  }, 400)
}

function loadPreferences() {
  try {
    JSON.parse(localStorage.getItem(hiddenColumnsStorageKey) || '[]').forEach((key: string) => hiddenColumns.add(key))
    const savedFilters = JSON.parse(localStorage.getItem(visibleFiltersStorageKey) || '[]')
    if (savedFilters.length > 0) {
      visibleFilters.clear()
      savedFilters.forEach((key: string) => visibleFilters.add(key))
    }
  } catch {
    hiddenColumns.clear()
  }
}

function handleClickOutside(event: MouseEvent) {
  const target = event.target as Node
  if (filterDropdownRef.value && !filterDropdownRef.value.contains(target)) showFilterDropdown.value = false
  if (columnDropdownRef.value && !columnDropdownRef.value.contains(target)) showColumnDropdown.value = false
}

onMounted(() => {
  loadPreferences()
  document.addEventListener('click', handleClickOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<template>
  <section class="card">
    <div class="card-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h2 class="text-base font-semibold text-gray-900 dark:text-white">数据列表</h2>
        <p class="text-sm text-gray-500 dark:text-dark-400">用于承载项目中的表格、筛选和批量操作页面。</p>
      </div>
      <div class="flex flex-wrap items-center gap-2">
        <button class="btn btn-secondary px-2 md:px-3" type="button" :disabled="loading" title="刷新" @click="refreshRecords">
          <Icon name="refresh" size="sm" :class="{ 'animate-spin': loading }" />
        </button>
        <div ref="filterDropdownRef" class="relative">
          <button class="btn btn-secondary px-2 md:px-3" type="button" title="筛选设置" @click="showFilterDropdown = !showFilterDropdown">
            <Icon name="filter" size="sm" class="md:mr-1.5" />
            <span class="hidden md:inline">筛选设置</span>
          </button>
          <div v-if="showFilterDropdown" class="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-dark-600 dark:bg-dark-800">
            <button
              v-for="filter in builtInFilters"
              :key="filter.key"
              type="button"
              class="flex w-full items-center justify-between px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-700"
              @click="toggleFilter(filter.key)"
            >
              <span>{{ filter.name }}</span>
              <Icon v-if="visibleFilters.has(filter.key)" name="check" size="sm" class="text-primary-500" :stroke-width="2" />
            </button>
          </div>
        </div>
        <div ref="columnDropdownRef" class="relative">
          <button class="btn btn-secondary px-2 md:px-3" type="button" title="列设置" @click="showColumnDropdown = !showColumnDropdown">
            <Icon name="viewColumns" size="sm" class="md:mr-1.5" />
            <span class="hidden md:inline">列设置</span>
          </button>
          <div v-if="showColumnDropdown" class="absolute right-0 top-full z-50 mt-1 max-h-80 w-44 overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-dark-600 dark:bg-dark-800">
            <button
              v-for="column in toggleableColumns"
              :key="column.key"
              type="button"
              class="flex w-full items-center justify-between px-4 py-2 text-left text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-dark-700"
              @click="toggleColumn(column.key)"
            >
              <span>{{ column.label }}</span>
              <Icon v-if="isColumnVisible(column.key)" name="check" size="sm" class="text-primary-500" :stroke-width="2" />
            </button>
          </div>
        </div>
        <button class="btn btn-primary flex-1 md:flex-initial" type="button">
          <Icon name="plus" size="md" class="mr-2" />
          新增记录
        </button>
      </div>
    </div>
    <div class="card-body">
      <div class="mb-4 grid gap-3 md:grid-cols-3">
        <input v-model="filters.keyword" class="input" placeholder="搜索标题或编号" />
        <Select v-if="visibleFilters.has('status')" v-model="filters.status" :options="statusOptions" />
      </div>

      <DataTable
        :columns="tableColumns"
        :data="filteredRecords"
        :loading="loading"
        row-key="id"
        default-sort-key="updatedAt"
        default-sort-order="desc"
        sort-storage-key="template-records-sort"
      >
        <template #cell-status="{ row }">
          <span class="badge" :class="row.status === '已完成' ? 'badge-success' : row.status === '进行中' ? 'badge-primary' : 'badge-warning'">
            {{ row.status }}
          </span>
        </template>
        <template #cell-actions>
          <div class="action-list">
            <button class="action-item action-item-primary" type="button">
              <Icon name="edit" size="sm" />
              <span>编辑</span>
            </button>
            <button class="action-item action-item-danger" type="button">
              <Icon name="trash" size="sm" />
              <span>删除</span>
            </button>
          </div>
        </template>
      </DataTable>
    </div>
  </section>
</template>
