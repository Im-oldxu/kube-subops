<template>
  <main class="flex min-h-screen items-center justify-center bg-gray-50 p-4 dark:bg-dark-950">
    <section class="empty-state">
      <p class="text-6xl font-bold text-primary-500">404</p>
      <h1 class="empty-state-title">页面不存在</h1>
      <p class="empty-state-description">当前路由没有匹配到页面。</p>
      <RouterLink to="/dashboard" class="btn btn-primary mt-6">返回工作台</RouterLink>
    </section>
  </main>
</template>
