<script setup lang="ts">
import { metrics, records } from '@/template/data'
</script>

<template>
  <div class="space-y-6">
    <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <article v-for="metric in metrics" :key="metric.label" class="stat-card">
        <div class="stat-icon" :class="`stat-icon-${metric.tone}`">
          {{ metric.label.slice(0, 1) }}
        </div>
        <div>
          <p class="stat-label">{{ metric.label }}</p>
          <p class="stat-value">{{ metric.value }}</p>
          <p class="stat-trend stat-trend-up">{{ metric.trend }}</p>
        </div>
      </article>
    </section>

    <section class="card">
      <div class="card-header">
        <h2 class="text-base font-semibold text-gray-900 dark:text-white">最近记录</h2>
      </div>
      <div class="card-body">
        <div class="table-container">
          <table class="table">
            <thead>
              <tr>
                <th>编号</th>
                <th>标题</th>
                <th>负责人</th>
                <th>状态</th>
                <th>更新时间</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="record in records" :key="record.id">
                <td class="font-mono text-xs">{{ record.id }}</td>
                <td>{{ record.title }}</td>
                <td>{{ record.owner }}</td>
                <td>
                  <span class="badge" :class="record.status === '已完成' ? 'badge-success' : 'badge-primary'">
                    {{ record.status }}
                  </span>
                </td>
                <td>{{ record.updatedAt }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </section>
  </div>
</template>
