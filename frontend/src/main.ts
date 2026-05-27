import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './style.css'

function initThemeClass() {
  const savedTheme = localStorage.getItem('theme')
  const shouldUseDark =
    savedTheme === 'dark' ||
    (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)

  document.documentElement.classList.toggle('dark', shouldUseDark)
}

function initInputModalityClass() {
  const root = document.documentElement

  window.addEventListener('keydown', (event) => {
    if (event.key === 'Tab') {
      root.classList.add('using-keyboard')
    }
  })

  window.addEventListener('pointerdown', () => {
    root.classList.remove('using-keyboard')
  })
}

async function bootstrap() {
  initThemeClass()
  initInputModalityClass()

  const app = createApp(App)
  app.use(createPinia())
  app.use(router)

  await router.isReady()
  app.mount('#app')
}

bootstrap()
