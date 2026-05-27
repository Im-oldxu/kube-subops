<script setup lang="ts" generic="T extends object">
import { computed, onMounted, ref, watch } from 'vue'
import Icon from '@/components/icons/Icon.vue'
import type { Column } from './types'

type TableRow = object & Record<string, unknown>

const props = withDefaults(defineProps<{
  columns: Column[]
  data: T[]
  loading?: boolean
  rowKey?: string | ((row: T) => string | number)
  defaultSortKey?: string
  defaultSortOrder?: 'asc' | 'desc'
  sortStorageKey?: string
  serverSideSort?: boolean
}>(), {
  loading: false,
  defaultSortOrder: 'asc',
  serverSideSort: false
})

const emit = defineEmits<{
  sort: [key: string, order: 'asc' | 'desc']
}>()

const sortKey = ref('')
const sortOrder = ref<'asc' | 'desc'>('asc')

type SortState = {
  key: string
  order: 'asc' | 'desc'
}

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base'
})

const sortableKeys = computed(() => new Set(props.columns.filter((column) => column.sortable).map((column) => column.key)))

function normalizeSortKey(candidate: string) {
  return sortableKeys.value.has(candidate) ? candidate : ''
}

function normalizeSortOrder(candidate: unknown): 'asc' | 'desc' {
  return candidate === 'desc' ? 'desc' : 'asc'
}

function readPersistedSortState(): SortState | null {
  if (!props.sortStorageKey) return null
  try {
    const raw = localStorage.getItem(props.sortStorageKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<SortState>
    const key = normalizeSortKey(typeof parsed.key === 'string' ? parsed.key : '')
    if (!key) return null
    return { key, order: normalizeSortOrder(parsed.order) }
  } catch {
    return null
  }
}

function writePersistedSortState(state: SortState) {
  if (!props.sortStorageKey) return
  localStorage.setItem(props.sortStorageKey, JSON.stringify(state))
}

function applySortState(state: SortState | null) {
  if (!state) return
  sortKey.value = state.key
  sortOrder.value = state.order
}

function resolveInitialSortState(): SortState | null {
  const persisted = readPersistedSortState()
  if (persisted) return persisted

  const key = normalizeSortKey(props.defaultSortKey ?? '')
  if (!key) return null
  return { key, order: normalizeSortOrder(props.defaultSortOrder) }
}

function normalizeRowKey(value: unknown, fallback: number): PropertyKey {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'symbol') return value
  return fallback
}

function toTableRow(row: T): TableRow {
  return row as TableRow
}

function resolveRowKey(row: T, index: number): PropertyKey {
  const tableRow = toTableRow(row)
  if (typeof props.rowKey === 'function') return normalizeRowKey(props.rowKey(row), index)
  if (props.rowKey) return normalizeRowKey(tableRow[props.rowKey], index)
  return normalizeRowKey(tableRow.id, index)
}

function resolveCellValue(row: T, column: Column) {
  const tableRow = toTableRow(row)
  const value = tableRow[column.key]
  return column.formatter ? column.formatter(value, tableRow) : value
}

function getCellRawValue(row: T, key: string) {
  return toTableRow(row)[key]
}

function toSortableString(value: unknown) {
  if (value === null || value === undefined) return ''
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return String(value)
    }
  }
  return String(value)
}

function toFiniteNumberOrNull(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'string') {
    const next = Number(value.trim())
    return Number.isFinite(next) ? next : null
  }
  return null
}

function compareSortValues(a: unknown, b: unknown) {
  const aEmpty = a === null || a === undefined || a === ''
  const bEmpty = b === null || b === undefined || b === ''
  if (aEmpty && bEmpty) return 0
  if (aEmpty) return 1
  if (bEmpty) return -1

  const aNum = toFiniteNumberOrNull(a)
  const bNum = toFiniteNumberOrNull(b)
  if (aNum !== null && bNum !== null) return aNum === bNum ? 0 : aNum < bNum ? -1 : 1

  return collator.compare(toSortableString(a), toSortableString(b))
}

function handleSort(column: Column) {
  if (!column.sortable) return
  const nextOrder = sortKey.value === column.key && sortOrder.value === 'asc' ? 'desc' : 'asc'
  sortKey.value = column.key
  sortOrder.value = nextOrder
  if (props.serverSideSort) emit('sort', column.key, nextOrder)
}

const sortedData = computed(() => {
  if (props.serverSideSort || !sortKey.value) return props.data

  const key = sortKey.value
  const order = sortOrder.value
  return props.data
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const result = compareSortValues(getCellRawValue(a.row, key), getCellRawValue(b.row, key))
      if (result !== 0) return order === 'asc' ? result : -result
      return a.index - b.index
    })
    .map((item) => item.row)
})

onMounted(() => {
  applySortState(resolveInitialSortState())
})

watch(
  [sortKey, sortOrder],
  ([key, order]) => {
    const normalized = normalizeSortKey(key)
    if (normalized) writePersistedSortState({ key: normalized, order: normalizeSortOrder(order) })
  },
  { flush: 'post' }
)

watch(
  () => props.columns.map((column) => `${column.key}:${column.sortable ? '1' : '0'}`).join('|'),
  () => {
    if (!sortKey.value) return
    if (!normalizeSortKey(sortKey.value)) {
      sortKey.value = ''
      sortOrder.value = 'asc'
      applySortState(resolveInitialSortState())
    }
  }
)
</script>

<template>
  <div class="table-container">
    <table class="table">
      <thead>
        <tr>
          <th
            v-for="column in columns"
            :key="column.key"
            :class="[
              column.class,
              {
                'cursor-pointer select-none hover:bg-gray-100 dark:hover:bg-dark-700': column.sortable
              }
            ]"
            scope="col"
            @click="handleSort(column)"
          >
            <slot
              :name="`header-${column.key}`"
              :column="column"
              :sort-key="sortKey"
              :sort-order="sortOrder"
            >
              <span class="inline-flex items-center gap-1">
                <span>{{ column.label }}</span>
                <Icon
                  v-if="column.sortable"
                  :name="sortKey === column.key ? (sortOrder === 'asc' ? 'chevronUp' : 'chevronDown') : 'chevronDown'"
                  size="sm"
                  class="text-gray-400 dark:text-dark-500"
                />
              </span>
            </slot>
          </th>
        </tr>
      </thead>
      <tbody>
        <template v-if="loading">
          <tr v-for="row in 5" :key="`table-loading-${row}`">
            <td v-for="column in columns" :key="column.key">
              <div class="skeleton h-4 w-3/4"></div>
            </td>
          </tr>
        </template>

        <template v-else-if="sortedData.length > 0">
          <tr v-for="(row, index) in sortedData" :key="resolveRowKey(row, index)">
            <td v-for="column in columns" :key="column.key" :class="column.class">
              <slot :name="`cell-${column.key}`" :row="row" :value="getCellRawValue(row, column.key)">
                {{ resolveCellValue(row, column) }}
              </slot>
            </td>
          </tr>
        </template>

        <tr v-else>
          <td :colspan="columns.length">
            <slot name="empty">
              <div class="empty-state py-8">
                <p class="empty-state-title">暂无数据</p>
              </div>
            </slot>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
