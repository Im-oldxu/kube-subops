<script setup lang="ts">
import Select from '@/components/common/Select.vue'

const categoryOptions = [
  { label: '默认分类', value: 'default' },
  { label: '业务分类 A', value: 'business-a' },
  { label: '业务分类 B', value: 'business-b' }
]
</script>

<template>
  <section class="card max-w-3xl">
    <div class="card-header">
      <h2 class="text-base font-semibold text-gray-900 dark:text-white">表单示例</h2>
      <p class="text-sm text-gray-500 dark:text-dark-400">用于承载创建、编辑和配置类工作流。</p>
    </div>
    <form class="card-body space-y-4">
      <label class="block">
        <span class="input-label">名称</span>
        <input class="input" placeholder="请输入名称" />
      </label>

      <label class="block">
        <span class="input-label">分类</span>
        <Select :model-value="'default'" :options="categoryOptions" />
      </label>

      <label class="block">
        <span class="input-label">说明</span>
        <textarea class="input min-h-32" placeholder="请输入说明"></textarea>
      </label>

      <div class="flex justify-end gap-3">
        <button class="btn btn-secondary" type="button">取消</button>
        <button class="btn btn-primary" type="button">保存</button>
      </div>
    </form>
  </section>
</template>
