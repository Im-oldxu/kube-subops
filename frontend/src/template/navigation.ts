import type { Icon } from '@/components/icons'

type IconName = InstanceType<typeof Icon>['$props']['name']

export interface NavigationItem {
  path: string
  label: string
  icon: IconName
  children?: NavigationItem[]
}

export const navigationItems: NavigationItem[] = [
  {
    path: '/dashboard',
    label: '集群总览',
    icon: 'grid',
    children: [
      {
        path: '/dashboard/status',
        label: '集群状态',
        icon: 'chart'
      },
      {
        path: '/dashboard/graph',
        label: '资源关系图',
        icon: 'link'
      }
    ]
  },
  {
    path: '/pods',
    label: 'Pod',
    icon: 'cube'
  },
  {
    path: '/workloads',
    label: '工作负载',
    icon: 'server',
    children: [
      {
        path: '/workloads/deployments',
        label: 'Deployment',
        icon: 'cloud'
      },
      {
        path: '/workloads/statefulsets',
        label: 'StatefulSet',
        icon: 'database'
      },
      {
        path: '/workloads/daemonsets',
        label: 'DaemonSet',
        icon: 'sync'
      },
      {
        path: '/workloads/replicasets',
        label: 'ReplicaSet',
        icon: 'copy'
      },
      {
        path: '/workloads/jobs',
        label: 'Job',
        icon: 'play'
      },
      {
        path: '/workloads/cronjobs',
        label: 'CronJob',
        icon: 'clock'
      }
    ]
  },
  {
    path: '/network',
    label: '服务与网络',
    icon: 'globe',
    children: [
      {
        path: '/network/services',
        label: 'Service',
        icon: 'server'
      },
      {
        path: '/network/ingresses',
        label: 'Ingress',
        icon: 'externalLink'
      },
      {
        path: '/network/endpoints',
        label: 'Endpoint',
        icon: 'link'
      },
      {
        path: '/network/endpoint-slices',
        label: 'EndpointSlice',
        icon: 'viewColumns'
      },
      {
        path: '/network/network-policies',
        label: 'NetworkPolicy',
        icon: 'shield'
      }
    ]
  },
  {
    path: '/config',
    label: '配置与密钥',
    icon: 'key',
    children: [
      {
        path: '/config/configmaps',
        label: 'ConfigMap',
        icon: 'document'
      },
      {
        path: '/config/secrets',
        label: 'Secret',
        icon: 'lock'
      }
    ]
  },
  {
    path: '/storage',
    label: '存储管理',
    icon: 'database',
    children: [
      {
        path: '/storage/storage-classes',
        label: 'StorageClass',
        icon: 'badge'
      },
      {
        path: '/storage/persistent-volumes',
        label: 'PersistentVolume',
        icon: 'server'
      },
      {
        path: '/storage/persistent-volume-claims',
        label: 'PersistentVolumeClaim',
        icon: 'clipboard'
      }
    ]
  },
  {
    path: '/access',
    label: '访问控制',
    icon: 'shield',
    children: [
      {
        path: '/access/service-accounts',
        label: 'ServiceAccount',
        icon: 'userCircle'
      },
      {
        path: '/access/roles',
        label: 'Role',
        icon: 'key'
      },
      {
        path: '/access/cluster-roles',
        label: 'ClusterRole',
        icon: 'shield'
      },
      {
        path: '/access/role-bindings',
        label: 'RoleBinding',
        icon: 'link'
      },
      {
        path: '/access/cluster-role-bindings',
        label: 'ClusterRoleBinding',
        icon: 'sync'
      }
    ]
  },
  {
    path: '/other',
    label: '其他资源',
    icon: 'clipboard',
    children: [
      {
        path: '/other/nodes',
        label: 'Node',
        icon: 'cpu'
      },
      {
        path: '/other/namespaces',
        label: 'Namespace',
        icon: 'inbox'
      },
      {
        path: '/other/events',
        label: 'Event',
        icon: 'bell'
      }
    ]
  },
  {
    path: '/clusters',
    label: '多集群管理',
    icon: 'swap'
  },
  {
    path: '/settings',
    label: '系统设置',
    icon: 'cog',
    children: [
      {
        path: '/settings/general',
        label: '通用设置',
        icon: 'cog'
      },
      {
        path: '/settings/version',
        label: '版本更新',
        icon: 'refresh'
      },
      {
        path: '/settings/security',
        label: '安全配置',
        icon: 'shield'
      },
      {
        path: '/settings/audit',
        label: '审计配置',
        icon: 'clipboard'
      },
      {
        path: '/settings/access',
        label: '用户与角色',
        icon: 'users'
      }
    ]
  }
]
