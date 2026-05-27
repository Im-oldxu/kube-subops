import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { siteSettings } from '@/template/site'

const KubeDashboardView = () => import('@/template/views/KubeDashboardView.vue')
const KubeGraphView = () => import('@/template/views/KubeGraphView.vue')
const KubeResourceView = () => import('@/template/views/KubeResourceView.vue')
const KubeClustersView = () => import('@/template/views/KubeClustersView.vue')
const KubeSettingsPanelView = () => import('@/template/views/KubeSettingsPanelView.vue')

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    component: () => import('@/template/layouts/AdminShell.vue'),
    children: [
      {
        path: '',
        redirect: '/dashboard/status'
      },
      {
        path: 'dashboard',
        redirect: '/dashboard/status'
      },
      {
        path: 'dashboard/status',
        name: 'DashboardStatus',
        component: KubeDashboardView,
        meta: {
          title: '集群状态'
        }
      },
      {
        path: 'dashboard/graph',
        name: 'DashboardGraph',
        component: KubeGraphView,
        meta: {
          title: '资源关系图'
        }
      },
      {
        path: 'pods',
        name: 'Pods',
        component: KubeResourceView,
        meta: {
          title: 'Pod',
          resourceType: 'pods'
        }
      },
      {
        path: 'workloads',
        redirect: '/workloads/deployments'
      },
      {
        path: 'workloads/deployments',
        name: 'WorkloadDeployments',
        component: KubeResourceView,
        meta: {
          title: 'Deployment',
          resourceType: 'deployments'
        }
      },
      {
        path: 'workloads/statefulsets',
        name: 'WorkloadStatefulSets',
        component: KubeResourceView,
        meta: {
          title: 'StatefulSet',
          resourceType: 'statefulsets'
        }
      },
      {
        path: 'workloads/daemonsets',
        name: 'WorkloadDaemonSets',
        component: KubeResourceView,
        meta: {
          title: 'DaemonSet',
          resourceType: 'daemonsets'
        }
      },
      {
        path: 'workloads/replicasets',
        name: 'WorkloadReplicaSets',
        component: KubeResourceView,
        meta: {
          title: 'ReplicaSet',
          resourceType: 'replicasets'
        }
      },
      {
        path: 'workloads/jobs',
        name: 'WorkloadJobs',
        component: KubeResourceView,
        meta: {
          title: 'Job',
          resourceType: 'jobs'
        }
      },
      {
        path: 'workloads/cronjobs',
        name: 'WorkloadCronJobs',
        component: KubeResourceView,
        meta: {
          title: 'CronJob',
          resourceType: 'cronjobs'
        }
      },
      {
        path: 'network',
        redirect: '/network/services'
      },
      {
        path: 'network/services',
        name: 'NetworkServices',
        component: KubeResourceView,
        meta: {
          title: 'Service',
          resourceType: 'services'
        }
      },
      {
        path: 'network/ingresses',
        name: 'NetworkIngresses',
        component: KubeResourceView,
        meta: {
          title: 'Ingress',
          resourceType: 'ingresses'
        }
      },
      {
        path: 'network/endpoints',
        name: 'NetworkEndpoints',
        component: KubeResourceView,
        meta: {
          title: 'Endpoint',
          resourceType: 'endpoints'
        }
      },
      {
        path: 'network/endpoint-slices',
        name: 'NetworkEndpointSlices',
        component: KubeResourceView,
        meta: {
          title: 'EndpointSlice',
          resourceType: 'endpoint-slices'
        }
      },
      {
        path: 'network/network-policies',
        name: 'NetworkPolicies',
        component: KubeResourceView,
        meta: {
          title: 'NetworkPolicy',
          resourceType: 'network-policies'
        }
      },
      {
        path: 'config',
        redirect: '/config/configmaps'
      },
      {
        path: 'config/configmaps',
        name: 'ConfigMaps',
        component: KubeResourceView,
        meta: {
          title: 'ConfigMap',
          resourceType: 'configmaps'
        }
      },
      {
        path: 'config/secrets',
        name: 'Secrets',
        component: KubeResourceView,
        meta: {
          title: 'Secret',
          resourceType: 'secrets'
        }
      },
      {
        path: 'storage',
        redirect: '/storage/storage-classes'
      },
      {
        path: 'storage/storage-classes',
        name: 'StorageClasses',
        component: KubeResourceView,
        meta: {
          title: 'StorageClass',
          resourceType: 'storage-classes'
        }
      },
      {
        path: 'storage/persistent-volumes',
        name: 'PersistentVolumes',
        component: KubeResourceView,
        meta: {
          title: 'PersistentVolume',
          resourceType: 'persistent-volumes'
        }
      },
      {
        path: 'storage/persistent-volume-claims',
        name: 'PersistentVolumeClaims',
        component: KubeResourceView,
        meta: {
          title: 'PersistentVolumeClaim',
          resourceType: 'persistent-volume-claims'
        }
      },
      {
        path: 'access',
        redirect: '/access/service-accounts'
      },
      {
        path: 'access/service-accounts',
        name: 'ServiceAccounts',
        component: KubeResourceView,
        meta: {
          title: 'ServiceAccount',
          resourceType: 'service-accounts'
        }
      },
      {
        path: 'access/roles',
        name: 'Roles',
        component: KubeResourceView,
        meta: {
          title: 'Role',
          resourceType: 'roles'
        }
      },
      {
        path: 'access/cluster-roles',
        name: 'ClusterRoles',
        component: KubeResourceView,
        meta: {
          title: 'ClusterRole',
          resourceType: 'cluster-roles'
        }
      },
      {
        path: 'access/role-bindings',
        name: 'RoleBindings',
        component: KubeResourceView,
        meta: {
          title: 'RoleBinding',
          resourceType: 'role-bindings'
        }
      },
      {
        path: 'access/cluster-role-bindings',
        name: 'ClusterRoleBindings',
        component: KubeResourceView,
        meta: {
          title: 'ClusterRoleBinding',
          resourceType: 'cluster-role-bindings'
        }
      },
      {
        path: 'other',
        redirect: '/other/nodes'
      },
      {
        path: 'other/nodes',
        name: 'Nodes',
        component: KubeResourceView,
        meta: {
          title: 'Node',
          resourceType: 'nodes'
        }
      },
      {
        path: 'other/namespaces',
        name: 'Namespaces',
        component: KubeResourceView,
        meta: {
          title: 'Namespace',
          resourceType: 'namespaces'
        }
      },
      {
        path: 'other/events',
        name: 'Events',
        component: KubeResourceView,
        meta: {
          title: 'Event',
          resourceType: 'events'
        }
      },
      {
        path: 'clusters',
        name: 'Clusters',
        component: KubeClustersView,
        meta: {
          title: '多集群管理'
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
      },
      {
        path: 'settings/security',
        name: 'SettingsSecurity',
        component: KubeSettingsPanelView,
        meta: {
          title: '安全配置',
          settingsMode: 'security'
        }
      },
      {
        path: 'settings/audit',
        name: 'SettingsAudit',
        component: KubeSettingsPanelView,
        meta: {
          title: '审计配置',
          settingsMode: 'audit'
        }
      },
      {
        path: 'settings/access',
        name: 'SettingsAccess',
        component: KubeSettingsPanelView,
        meta: {
          title: '用户与角色',
          settingsMode: 'access'
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
