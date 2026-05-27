export interface MetricItem {
  label: string
  value: string
  trend: string
  tone: 'primary' | 'success' | 'warning' | 'danger'
}

export interface RecordItem {
  id: string
  title: string
  owner: string
  status: '待处理' | '进行中' | '已完成'
  updatedAt: string
}

export const metrics: MetricItem[] = [
  {
    label: '今日新增',
    value: '128',
    trend: '+12.4%',
    tone: 'primary'
  },
  {
    label: '处理中',
    value: '36',
    trend: '+4',
    tone: 'warning'
  },
  {
    label: '完成率',
    value: '92%',
    trend: '+3.8%',
    tone: 'success'
  },
  {
    label: '待跟进',
    value: '8',
    trend: '-2',
    tone: 'danger'
  }
]

export const records: RecordItem[] = [
  {
    id: 'REC-1001',
    title: '示例业务记录 A',
    owner: '产品组',
    status: '进行中',
    updatedAt: '2026-05-08 10:20'
  },
  {
    id: 'REC-1002',
    title: '示例业务记录 B',
    owner: '运营组',
    status: '待处理',
    updatedAt: '2026-05-08 09:45'
  },
  {
    id: 'REC-1003',
    title: '示例业务记录 C',
    owner: '交付组',
    status: '已完成',
    updatedAt: '2026-05-07 18:12'
  }
]
