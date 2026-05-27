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
    label: '工作台',
    icon: 'grid'
  },
  {
    path: '/records',
    label: '数据列表',
    icon: 'clipboard'
  },
  {
    path: '/form',
    label: '表单示例',
    icon: 'edit'
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
      }
    ]
  }
]
