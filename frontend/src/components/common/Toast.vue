<template>
  <Teleport to="body">
    <div class="pointer-events-none fixed right-4 top-4 z-[9999] space-y-3" aria-live="polite">
      <TransitionGroup
        enter-active-class="transition ease-out duration-300"
        enter-from-class="translate-x-full opacity-0"
        enter-to-class="translate-x-0 opacity-100"
        leave-active-class="transition ease-in duration-200"
        leave-from-class="translate-x-0 opacity-100"
        leave-to-class="translate-x-full opacity-0"
      >
        <div
          v-for="toast in toasts"
          :key="toast.id"
          class="pointer-events-auto min-w-[280px] max-w-md rounded-lg border-l-4 bg-white p-4 shadow-lg dark:bg-dark-800"
          :class="toast.type === 'error' ? 'border-red-500' : 'border-primary-500'"
        >
          <p class="text-sm font-medium text-gray-900 dark:text-white">{{ toast.message }}</p>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref } from 'vue'

interface ToastItem {
  id: number
  message: string
  type?: 'info' | 'error'
}

const toasts = ref<ToastItem[]>([])

function pushToast(message: string, type: ToastItem['type'] = 'info') {
  const id = Date.now()
  toasts.value.push({ id, message, type })
  window.setTimeout(() => {
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }, 3000)
}

defineExpose({ pushToast })
</script>
