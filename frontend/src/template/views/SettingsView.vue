<script setup lang="ts">
import { reactive, ref } from 'vue'
import Input from '@/components/common/Input.vue'
import { resetSiteSettings, siteSettings, updateSiteSettings, type SiteSettings } from '@/template/site'

const saved = ref(false)

const form = reactive<SiteSettings>({
  siteName: siteSettings.siteName,
  siteSubtitle: siteSettings.siteSubtitle,
  logoUrl: siteSettings.logoUrl,
  version: siteSettings.version,
  updateCheckUrl: siteSettings.updateCheckUrl,
  updateUrl: siteSettings.updateUrl,
  rollbackUrl: siteSettings.rollbackUrl,
  restartUrl: siteSettings.restartUrl,
  releaseUrl: siteSettings.releaseUrl,
  enableUpdateCheck: siteSettings.enableUpdateCheck
})

function saveSettings() {
  updateSiteSettings(form)
  saved.value = true
  window.setTimeout(() => {
    saved.value = false
  }, 2200)
}

function resetSettings() {
  resetSiteSettings()
  Object.assign(form, siteSettings)
}
</script>

<template>
  <form class="mx-auto max-w-4xl space-y-6" @submit.prevent="saveSettings">
    <section class="card">
      <div class="card-header">
        <div>
          <h2 class="text-base font-semibold text-gray-900 dark:text-white">通用设置</h2>
          <p class="text-sm text-gray-500 dark:text-dark-400">配置站点标题、顶部说明和品牌 Logo。</p>
        </div>
      </div>
      <div class="card-body space-y-5">
        <Input v-model="form.siteName" label="站点标题" placeholder="Admin Template" />

        <Input v-model="form.siteSubtitle" label="站点副标题" placeholder="用于顶部说明、登录页说明" />

        <Input
          v-model="form.logoUrl"
          label="Logo 地址"
          hint="默认使用 public/logo.png；业务换品牌时优先替换该文件。"
          placeholder="/logo.png"
        />
      </div>
      <div class="card-footer flex items-center justify-between gap-3">
        <p class="text-sm text-primary-600 dark:text-primary-400">{{ saved ? '设置已保存' : '' }}</p>
        <div class="flex gap-2">
          <button type="button" class="btn btn-secondary" @click="resetSettings">恢复默认</button>
          <button type="submit" class="btn btn-primary">保存设置</button>
        </div>
      </div>
    </section>
  </form>
</template>
