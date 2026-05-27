import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { siteSettings } from '@/template/site'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/template/layouts/AdminShell.vue'),
    children: [
      {
        path: '',
        redirect: '/dashboard'
      },
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/template/views/DashboardView.vue'),
        meta: {
          title: '工作台'
        }
      },
      {
        path: 'records',
        name: 'Records',
        component: () => import('@/template/views/RecordsView.vue'),
        meta: {
          title: '数据列表'
        }
      },
      {
        path: 'form',
        name: 'Form',
        component: () => import('@/template/views/FormView.vue'),
        meta: {
          title: '表单示例'
        }
      },
      {
        path: 'settings',
        name: 'Settings',
        redirect: '/settings/general'
      },
      {
        path: 'settings/general',
        name: 'SettingsGeneral',
        component: () => import('@/template/views/SettingsView.vue'),
        meta: {
          title: '通用设置'
        }
      },
      {
        path: 'settings/version',
        name: 'SettingsVersion',
        component: () => import('@/template/views/VersionUpdateView.vue'),
        meta: {
          title: '版本更新'
        }
      }
    ]
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/template/views/LoginView.vue'),
    meta: {
      title: '登录'
    }
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('@/template/views/NotFoundView.vue'),
    meta: {
      title: '页面不存在'
    }
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior() {
    return { top: 0 }
  }
})

router.beforeEach((to) => {
  document.title = `${String(to.meta.title ?? '后台模板')} - ${siteSettings.siteName}`
})

router.onError((error) => {
  console.error('Router error:', error)
})

export default router
