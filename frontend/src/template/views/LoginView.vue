<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { siteSettings } from '@/template/site'
</script>

<template>
  <main class="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-dark-950">
    <section class="card w-full max-w-md">
      <div class="card-header text-center">
        <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-white shadow-glow">
          <img :src="siteSettings.logoUrl" :alt="siteSettings.siteName" class="h-full w-full object-contain" />
        </div>
        <h1 class="text-xl font-semibold text-gray-900 dark:text-white">{{ siteSettings.siteName }}</h1>
        <p class="text-sm text-gray-500 dark:text-dark-400">{{ siteSettings.siteSubtitle }}</p>
      </div>
      <form class="card-body space-y-4">
        <label class="block">
          <span class="input-label">账号</span>
          <input class="input" autocomplete="username" placeholder="demo@example.com" />
        </label>
        <label class="block">
          <span class="input-label">密码</span>
          <input class="input" autocomplete="current-password" placeholder="请输入密码" type="password" />
        </label>
        <RouterLink to="/dashboard" class="btn btn-primary w-full">进入工作台</RouterLink>
      </form>
    </section>
  </main>
</template>
