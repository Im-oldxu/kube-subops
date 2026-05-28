import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import checker from 'vite-plugin-checker'
import { resolve } from 'path'
import { existsSync, readFileSync } from 'fs'

function readEnvFile(filePath: string) {
  if (!existsSync(filePath)) {
    return {}
  }

  return Object.fromEntries(
    readFileSync(filePath, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=')
        return [line.slice(0, index).trim(), line.slice(index + 1).trim()]
      })
  )
}

const projectConfigKeys = [
  'APP_ENV',
  'APP_VERSION',
  'APP_PACKAGE_MODE',
  'FRONTEND_PORT',
  'BACKEND_HOST',
  'BACKEND_PORT',
  'API_BASE_URL',
  'MOCK_ENABLED'
]

function readProcessConfig() {
  return Object.fromEntries(
    projectConfigKeys
      .map((key) => [key, process.env[key]])
      .filter(([, value]) => value !== undefined && value !== '')
  )
}

function defaultMockEnabled(mode: string) {
  if (mode === 'production') {
    return 'false'
  }

  return existsSync(resolve(__dirname, '../backend')) ? 'false' : 'true'
}

function normalizeBackendUrl(host: string, port: string) {
  const trimmedHost = (host || '127.0.0.1').trim().replace(/\/$/, '')
  const trimmedPort = (port || '8080').trim()

  if (/^https?:\/\//i.test(trimmedHost)) {
    return trimmedHost
  }

  return `http://${trimmedHost}:${trimmedPort}`
}

function isTruthy(value: string | undefined) {
  return ['true', '1', 'yes', 'on'].includes(String(value ?? '').trim().toLowerCase())
}

function readProjectConfig(mode: string) {
  return {
    APP_ENV: mode === 'production' ? 'production' : 'development',
    APP_VERSION: 'v0.1.2',
    APP_PACKAGE_MODE: 'source-dev',
    FRONTEND_PORT: '5173',
    BACKEND_HOST: '127.0.0.1',
    BACKEND_PORT: '8080',
    API_BASE_URL: '/api',
    MOCK_ENABLED: defaultMockEnabled(mode),
    ...readEnvFile(resolve(__dirname, '../.env')),
    ...readProcessConfig()
  }
}

export default defineConfig(({ mode }) => {
  const projectConfig = readProjectConfig(mode)
  const backendPort = projectConfig.BACKEND_PORT || '8080'
  const backendHost = projectConfig.BACKEND_HOST || '127.0.0.1'
  const apiBaseUrl = projectConfig.API_BASE_URL || ''
  const backendUrl = normalizeBackendUrl(backendHost, backendPort)
  const devPort = Number(projectConfig.FRONTEND_PORT || 5173)
  const mockEnabled = isTruthy(projectConfig.MOCK_ENABLED)
  const injectedEnv = {
    'import.meta.env.VITE_APP_ENV': JSON.stringify(projectConfig.APP_ENV || mode),
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(projectConfig.APP_VERSION || 'v0.1.2'),
    'import.meta.env.VITE_API_BASE_URL': JSON.stringify(apiBaseUrl),
    'import.meta.env.VITE_USE_MOCK': JSON.stringify(projectConfig.MOCK_ENABLED || 'false')
  }

  const proxy = mockEnabled
    ? undefined
    : {
        '/api': {
          target: backendUrl,
          changeOrigin: true
        },
        '/v1': {
          target: backendUrl,
          changeOrigin: true
        },
        '/setup': {
          target: backendUrl,
          changeOrigin: true
        }
      }

  return {
    plugins: [
      vue(),
      checker({
        vueTsc: true
      })
    ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      // 使用 vue-i18n 运行时版本，避免 CSP unsafe-eval 问题
      'vue-i18n': 'vue-i18n/dist/vue-i18n.runtime.esm-bundler.js'
    }
  },
  define: {
    ...injectedEnv,
    // 启用 vue-i18n JIT 编译，在 CSP 环境下处理消息插值
    // JIT 编译器生成 AST 对象而非 JS 代码，无需 unsafe-eval
    __INTLIFY_JIT_COMPILATION__: true
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        /**
         * 手动分包配置
         * 分离第三方库并按功能合并应用代码，避免循环依赖
         */
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            // Vue 核心库
            if (
              id.includes('/vue/') ||
              id.includes('/vue-router/') ||
              id.includes('/pinia/') ||
              id.includes('/@vue/')
            ) {
              return 'vendor-vue'
            }

            // UI 工具库（较大，单独分离）
            if (id.includes('/@vueuse/') || id.includes('/xlsx/')) {
              return 'vendor-ui'
            }

            // 图表库
            if (id.includes('/chart.js/') || id.includes('/vue-chartjs/')) {
              return 'vendor-chart'
            }

            // 国际化
            if (id.includes('/vue-i18n/') || id.includes('/@intlify/')) {
              return 'vendor-i18n'
            }

            // 其他小型第三方库合并
            return 'vendor-misc'
          }

          // 应用代码：按入口点自动分包，不手动干预
          // 这样可以避免循环依赖，同时保持合理的 chunk 数量
        }
      }
    }
  },
    server: {
      host: '0.0.0.0',
      port: devPort,
      proxy
    }
  }
})
