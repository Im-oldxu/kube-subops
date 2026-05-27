<template>
  <Teleport to="body">
    <div v-if="show && position">
      <div class="fixed inset-0 z-[9998]" @click="emit('close')"></div>
      <div
        class="action-menu-content fixed z-[9999] w-52 overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-black/5 dark:bg-dark-800 dark:ring-white/10"
        :style="{ top: `${position.top}px`, left: `${position.left}px` }"
        @click.stop
      >
        <div class="py-1">
          <template v-for="item in visibleItems" :key="item.key">
            <div v-if="item.dividerBefore" class="my-1 border-t border-gray-100 dark:border-dark-700"></div>
            <button
              type="button"
              class="action-menu-item"
              :class="toneClass(item.tone)"
              :disabled="item.disabled"
              @click="selectItem(item)"
            >
              <Icon v-if="item.icon" :name="item.icon" size="sm" :stroke-width="item.strokeWidth ?? 1.8" />
              <span>{{ item.label }}</span>
            </button>
          </template>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue'
import Icon from '@/components/icons/Icon.vue'

type IconName = InstanceType<typeof Icon>['$props']['name']
type ActionTone = 'default' | 'success' | 'info' | 'warning' | 'primary' | 'purple' | 'danger'

export interface ActionMenuItem {
  key: string
  label: string
  icon?: IconName
  tone?: ActionTone
  disabled?: boolean
  hidden?: boolean
  dividerBefore?: boolean
  strokeWidth?: number
}

const props = defineProps<{
  show: boolean
  position: { top: number; left: number } | null
  items: ActionMenuItem[]
}>()

const emit = defineEmits<{
  (event: 'close'): void
  (event: 'select', item: ActionMenuItem): void
}>()

const visibleItems = computed(() => props.items.filter((item) => !item.hidden))

function toneClass(tone: ActionTone = 'default') {
  return {
    default: 'action-menu-item-default',
    success: 'action-menu-item-success',
    info: 'action-menu-item-info',
    warning: 'action-menu-item-warning',
    primary: 'action-menu-item-primary',
    purple: 'action-menu-item-purple',
    danger: 'action-menu-item-danger'
  }[tone]
}

function selectItem(item: ActionMenuItem) {
  if (item.disabled) return
  emit('select', item)
  emit('close')
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    emit('close')
  }
}

watch(
  () => props.show,
  (visible) => {
    if (visible) {
      window.addEventListener('keydown', handleKeydown)
    } else {
      window.removeEventListener('keydown', handleKeydown)
    }
  },
  { immediate: true }
)

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>
