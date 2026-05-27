# UI 原型设计（模板驱动落地规范）

> 本文件只沉淀当前项目的模板选择、页面映射、业务能力匹配、导航裁剪和前端交接。模板能力库以选中模板 facts 和真实源码为准。

## 1. 文档控制

- 项目名称：kube-subops
- 版本：v1.0.0
- 状态：已完成
- 日期：2026-05-27
- 关联变更记录：`spec/变更记录.md`

## 2. 最终模板

- 模板名称：Sub Admin
- 模板 ID：`sub-admin`
- 技术栈：Vue 3 + TypeScript + Vite + Tailwind CSS 3 + Pinia + Vue Router
- 模板源码目录：`templates/sub-admin`
- 模板事实文件：`.codex/skills/product-orch/templates/facts/sub-admin.json`
- 初始化方式：`copy`
- 项目形态：`single-project`
- 复制策略：`replace-frontend`
- 实际开发入口：`.`
- 包管理器：`pnpm@9.15.9`
- 运行建议：Node.js 20.x；进入 `/dev-frontend` 前以模板 `package.json`、`packageManager` 和实际安装结果为准
- 选择理由：Sub Admin 与已确认 Vue 技术栈一致，是本地可复制的单项目源码基座；它已经提供管理后台壳、侧栏导航、设置页、表格、表单、弹窗、请求层和 mock 基线，能降低首版 Kubernetes 运维控制台的模板裁剪成本。

## 3. 模板底座边界

- UI 实现模式：源码基座模板模式
- 目标前端目录：`frontend/`
- 源码优先策略：以 Sub Admin 真实源码和 facts 为准，优先复用模板已有布局、路由、导航、请求层、mock、状态组件和通用交互；没有命中的 Kubernetes 专项能力再在模板体系内扩展。
- 保留结构：`src/main.ts`、`src/router/index.ts`、`src/template/layouts/AdminShell.vue`、`src/template/navigation.ts`、`src/template/api.ts`、`src/template/data.ts`、Pinia 注册入口和 `src/style.css`。
- 允许改造范围：在模板壳内新增 Kubernetes 页面、资源列表、详情页、YAML 视图、日志/终端面板、权限态、确认弹窗、service/adapter 和 mock 数据。
- 禁止混入项：不得把历史 demo、旧业务导航、旧领域 service、旧业务字段、商业化/订单/支付页面带入正式导航；不得新建第二套 HTTP client；不得绕过模板路由和导航体系从零搭壳。
- 固定底座能力：系统设置固定保留 `/settings/general` 与 `/settings/version`；`/settings` 重定向到 `/settings/general`；版本更新能力来自 `version_update_conventions`；版本页保留版本、检查更新 API、发布说明地址、更新 API、回滚 API、重启 API、启用检查更新等配置项；后端返回 `package_mode` / `upgrade_strategy` 时，前端展示当前运行包模式、发布链接和部署侧策略；不得删除、合并、改名、一级化或改成静态 API 契约页。

### 3.1 版本 / 更新能力边界

- 模板 mode：`backend-self-update`
- 默认入口：`/settings/version`
- v1.0 产品边界：平台自身版本更新不作为 Kubernetes Web 管理平台 v1.0 核心验收项；若后端暂不实现 Sub Admin 自更新端点，前端应显示“不支持”或禁用相关动作，但不得删除固定版本页。
- 后端边界：若后续启用自更新能力，接口应保持模板语义，快速返回任务或部署侧提示，不在 HTTP 请求内同步执行下载、替换、镜像拉取、rollout 或重启。
- 禁止事项：不得套用 Vben 或 New Admin 的版本检查方式；不得把平台自身回滚与 Kubernetes 工作负载回滚混为同一能力。

### 3.2 存储 / 备份能力边界

- 当前项目 v1.0 不交付平台备份 / 恢复脚本或外部对象存储归档。
- Sub Admin 历史备份页面不进入正式导航；如需参考，只能作为后续 `/deploy` 或新增需求的交互素材。
- Kubernetes 存储管理页面只覆盖 StorageClass、PersistentVolume、PersistentVolumeClaim 的资源管理，不等同于平台数据库备份。

## 4. 页面清单

| 页面 | 用户任务 | 优先级 | 路由 | 备注 |
| --- | --- | --- | --- | --- |
| 登录页 | 用户登录平台 | P0 | `/login` | 使用模板登录页并接入 `/api/v1/auth/login` |
| 集群状态 | 查看当前集群健康、容量、指标和告警降级 | P0 | `/dashboard/status` | Metrics API 不可用时展示降级提示 |
| 资源关系图 | 查看 Namespace、工作负载、ReplicaSet、Pod、Service、Ingress、PVC 关系 | P0 | `/dashboard/graph` | 在模板主内容区实现自定义关系图组件 |
| Pod | 查看 Pod 列表、详情、容器、日志、终端和 YAML | P0 | `/pods` | 专项页面，终端和删除需要二次确认 |
| Deployment | 管理 Deployment | P0 | `/workloads/deployments` | 工作负载专项操作完整开放 |
| StatefulSet | 管理 StatefulSet | P0 | `/workloads/statefulsets` | 工作负载专项操作完整开放 |
| DaemonSet | 管理 DaemonSet | P0 | `/workloads/daemonsets` | 不适用扩缩容操作隐藏或置灰 |
| ReplicaSet | 管理 ReplicaSet | P0 | `/workloads/replicasets` | 回滚语义以关联 Deployment 为准 |
| Job | 管理 Job | P0 | `/workloads/jobs` | 不适用滚动更新和回滚的操作隐藏或置灰 |
| CronJob | 管理 CronJob | P0 | `/workloads/cronjobs` | 展示调度状态和关联 Job |
| Service | 管理 Service | P0 | `/network/services` | 通用资源页 |
| Ingress | 管理 Ingress | P0 | `/network/ingresses` | 通用资源页 |
| Endpoint | 查看和管理 Endpoint | P1 | `/network/endpoints` | Kubernetes 版本差异需错误兜底 |
| EndpointSlice | 查看和管理 EndpointSlice | P1 | `/network/endpoint-slices` | 通用资源页 |
| NetworkPolicy | 管理 NetworkPolicy | P1 | `/network/network-policies` | 删除和 YAML 应用二次确认 |
| ConfigMap | 管理 ConfigMap | P0 | `/config/configmaps` | 通用资源页 |
| Secret | 管理 Secret 并受控查看明文 | P0 | `/config/secrets` | 明文查看必须二次确认和审计 |
| StorageClass | 管理 StorageClass | P1 | `/storage/storage-classes` | 集群级资源 |
| PersistentVolume | 管理 PV | P1 | `/storage/persistent-volumes` | 集群级资源 |
| PersistentVolumeClaim | 管理 PVC | P1 | `/storage/persistent-volume-claims` | 命名空间级资源 |
| ServiceAccount | 管理 ServiceAccount | P1 | `/access/service-accounts` | 访问控制资源，高风险写操作确认 |
| Role | 管理 Role | P1 | `/access/roles` | 命名空间级资源 |
| ClusterRole | 管理 ClusterRole | P1 | `/access/cluster-roles` | 集群级资源 |
| RoleBinding | 管理 RoleBinding | P1 | `/access/role-bindings` | 命名空间级资源 |
| ClusterRoleBinding | 管理 ClusterRoleBinding | P1 | `/access/cluster-role-bindings` | 集群级资源 |
| Node | 查看节点状态、资源、Pod、事件并执行节点操作 | P0 | `/other/nodes` | drain / cordon / uncordon 需要二次确认 |
| Namespace | 管理 Namespace | P0 | `/other/namespaces` | 删除 Namespace 高风险 |
| Event | 查看事件 | P1 | `/other/events` | 以查看为主，不适用操作隐藏或置灰 |
| 多集群管理 | 添加、测试、更新和删除集群连接 | P0 | `/clusters` | 凭据输入不在前端长期保存 |
| 系统通用设置 | 平台基础配置 | P1 | `/settings/general` | Sub Admin 固定保留 |
| 版本设置 | 模板固定版本能力 | P2 | `/settings/version` | 可禁用不支持动作，不删除页面 |
| 安全配置 | 管理凭据、安全策略和高风险确认策略 | P1 | `/settings/security` | 新增为 `/settings/*` 子页面 |
| 审计配置 | 管理审计保留周期并查询审计入口 | P1 | `/settings/audit` | 与 `/api/v1/audit-logs` 对接 |
| 用户与角色 | 管理用户、角色、权限点和授权范围 | P1 | `/settings/access` | 平台 RBAC 设置入口 |

## 5. 页面到模板源码映射

| 业务页面 | 推荐模板页面/布局 | 推荐源码入口 | 允许改造范围 | 禁止偏离点 |
| --- | --- | --- | --- | --- |
| 登录页 | LoginView | `src/template/views/LoginView.vue`、`src/template/api.ts` | 替换登录字段、错误态和会话跳转 | 不绕过服务端会话或保存敏感凭据 |
| 顶部栏与侧栏 | AdminShell + navigation | `src/template/layouts/AdminShell.vue`、`src/template/navigation.ts`、`src/router/index.ts` | 增加集群、Namespace、搜索、用户信息和 Kubernetes 导航 | 侧栏不放资源操作按钮，不删除固定设置入口 |
| 集群状态 | DashboardView + StatCard | `src/template/views/DashboardView.vue`、`src/components/common/StatCard.vue` | 改造成集群健康、资源统计、指标降级面板 | 不保留模板旧业务统计字段 |
| 资源关系图 | Dashboard 壳 + 自定义主内容 | `src/template/views/DashboardView.vue` | 在模板内容区扩展关系图组件、筛选和空态 | 不用静态插图替代真实资源关系 |
| Kubernetes 通用资源列表 | RecordsView + 表格组件 | `src/template/views/RecordsView.vue`、`src/template/data.ts` | 替换列、筛选、分页、状态、操作菜单和资源 DTO | 不把历史 records 字段当业务契约 |
| Kubernetes 通用详情 | 模板页面壳 + tabs/cards | `src/template/layouts/AdminShell.vue`、通用卡片/表格组件 | 新增基本信息、状态、标签、注解、关联资源、事件、YAML tab | 不把高风险操作放入侧栏 |
| 创建/编辑/YAML 表单 | FormView + Dialog | `src/template/views/FormView.vue`、`BaseDialog.vue`、`ConfirmDialog.vue` | 改造为资源表单、YAML 编辑、二次确认和结果反馈 | 不绕过 confirm 载荷和后端权限复核 |
| Pod 日志与终端 | 模板壳 + 专项面板 | `src/template/layouts/AdminShell.vue`、弹窗/状态组件 | 在模板体系内实现日志、实时日志和 WebSocket 终端面板 | 不在进入终端前跳过确认与审计提示 |
| Node 专项页面 | RecordsView + 详情 tabs + Dialog | `src/template/views/RecordsView.vue`、`ConfirmDialog.vue` | 增加污点、节点 Pod、事件、drain/cordon/uncordon | 不把节点 drain 设计成普通无确认按钮 |
| 多集群管理 | RecordsView + FormView | `src/template/views/RecordsView.vue`、`src/template/views/FormView.vue` | 集群列表、连接测试、凭据录入、脱敏展示 | 不在列表或 localStorage 长期保存凭据明文 |
| 系统设置 | SettingsView + 固定子路由 | `src/template/views/SettingsView.vue`、`src/template/views/VersionUpdateView.vue` | 追加安全、审计、用户角色权限子页 | 不删除 `/settings/general`、`/settings/version` |

## 6. 业务能力到模板功能分类映射

| 业务能力 | catalog 分类 / 能力 id | 推荐源码入口 | reuse_level | copy_policy | 备注 |
| --- | --- | --- | --- | --- | --- |
| 顶部栏、侧栏、设置入口、版本入口 | `app_shell_navigation_settings` | `AdminShell.vue`、`navigation.ts`、`router/index.ts` | default_reuse | baseline | 正式导航按 PRD 分组重写 |
| Kubernetes 资源列表、筛选、搜索、分页、刷新 | `lists_tables_filters` | `RecordsView.vue`、表格与分页组件 | default_reuse | baseline | 所有资源列表页共用模式 |
| 创建、编辑、删除确认、YAML 应用、高风险二次确认 | `forms_dialogs_feedback` | `FormView.vue`、`BaseDialog.vue`、`ConfirmDialog.vue` | default_reuse | baseline | 高风险操作必须带确认载荷 |
| 全局搜索、资源刷新、状态重新拉取 | `runtime_search_refresh` | 顶部搜索入口、刷新按钮和请求层 | platform_reuse | on_demand | 搜索范围为当前集群 |
| 登录态、用户信息、角色权限、按钮权限表现 | `identity_access_control` | 登录页、路由守卫、用户菜单、权限状态 | platform_reuse | on_demand | 无权限资源或操作隐藏或置灰 |
| API 响应适配、分页、枚举、状态字典、ViewModel 转换 | `data_api_dictionary_utilities` | `src/template/api.ts`、service/adapter | platform_reuse | baseline | 页面只消费稳定 ViewModel |
| 集群状态、指标降级、事件和资源概览 | `monitoring_probe_observability` | 运维看板参考、状态卡、错误态 | domain_reference | reference_only | 只复用结构，不保留旧业务字段 |
| 集群统计、趋势和图表 | `analytics_charts_dashboard` | `StatCard.vue`、图表参考组件 | platform_reuse | on_demand | 不为简单统计引入第二套图表体系 |
| 集群连接安全、凭据、代理/TLS 后续扩展 | `security_network_settings` | 安全设置和网络设置参考组件 | domain_reference | reference_only | 当前只记录安全配置落点 |

## 7. 正式导航裁剪规则

- 必须保留：登录页、`AdminShell`、顶部栏、侧栏、用户菜单、`/settings/general`、`/settings/version`、`/settings -> /settings/general` 重定向、统一请求层和 mock 基线。
- 必须移除或隐藏：历史 demo 导航、旧业务资源页面、商业化/订单/支付页面、与 Kubernetes 管理无关的历史 service 和导航入口。
- 可作为开发参考但不进入正式导航：历史运维看板、图表、公告、代理/TLS、备份页面、旧业务弹窗和旧业务表格。
- 新增设置类页面落点：安全配置、审计配置、用户与角色权限等只能追加为 `/settings/*` 子菜单，不得改动 `/settings/general` 与 `/settings/version`。
- 正式左侧导航：
  - 集群总览：集群状态、资源关系图
  - Pod
  - 工作负载：Deployment、StatefulSet、DaemonSet、ReplicaSet、Job、CronJob
  - 服务与网络：Service、Ingress、Endpoint、EndpointSlice、NetworkPolicy
  - 配置与密钥：ConfigMap、Secret
  - 存储管理：StorageClass、PersistentVolume、PersistentVolumeClaim
  - 访问控制：ServiceAccount、Role、ClusterRole、RoleBinding、ClusterRoleBinding
  - 其他资源：Node、Namespace、Event
  - 多集群管理
  - 系统设置

## 8. 页面级实施说明

### 页面：集群总览 / 集群状态

- 路由：`/dashboard/status`
- 页面用途：展示当前集群状态、资源统计、节点容量、指标源状态和关键事件入口。
- 推荐源码：`DashboardView.vue`、`StatCard.vue`
- 复用等级：baseline + on_demand
- 改造字段：集群名称、Kubernetes 版本、节点数、Namespace 数、Pod 状态、CPU/内存、Metrics API 状态。
- 关联 API / Mock：API-004、API-007、API-008、API-020；mock 提供正常、指标不可用、集群不可达三类状态。
- 权限与状态：无集群访问权限时隐藏资源统计；Metrics API 不可用时展示降级提示。
- 完成标准：页面能按当前集群和 Namespace 刷新状态，不误导展示实时指标。

### 页面：集群总览 / 资源关系图

- 路由：`/dashboard/graph`
- 页面用途：展示 Namespace、工作负载、ReplicaSet、Pod、Service、Ingress、PVC 等资源关系。
- 推荐源码：`DashboardView.vue` 作为页面壳，自定义关系图组件在模板体系内实现。
- 复用等级：on_demand
- 改造字段：资源节点、关联边、状态、筛选条件、空态和错误态。
- 关联 API / Mock：API-008、API-009、API-020；mock 提供小集群、复杂关系和空关系样例。
- 权限与状态：只展示用户可见资源；无权限关联资源不显示或以受限状态展示。
- 完成标准：关系图可按集群和 Namespace 刷新，并能跳转到资源详情。

### 页面：资源通用列表

- 路由：所有资源列表路由，包括 `/pods`、`/workloads/*`、`/network/*`、`/config/*`、`/storage/*`、`/access/*`、`/other/*`
- 页面用途：展示 Kubernetes 资源列表、筛选、搜索、分页、刷新、详情、YAML、创建、编辑和删除入口。
- 推荐源码：`RecordsView.vue`、`src/template/data.ts`、表格/分页/筛选组件。
- 复用等级：baseline
- 改造字段：资源类型、Namespace、名称、标签、状态、年龄、关联对象、操作权限。
- 关联 API / Mock：API-008、API-010、API-011、API-012、API-013。
- 权限与状态：无权限资源或操作隐藏或置灰；高风险删除必须二次确认。
- 完成标准：所有 PRD 指定资源均有列表页，集群级和命名空间级资源的 Namespace 语义正确。

### 页面：资源通用详情

- 路由：由资源列表进入详情，具体路由在 `/dev-frontend` 中按资源类型生成。
- 页面用途：展示基本信息、状态、标签、注解、关联资源、事件和 YAML。
- 推荐源码：模板页面壳、卡片、tab、表格、弹窗和 YAML 展示区域。
- 复用等级：on_demand
- 改造字段：metadata、spec、status、labels、annotations、events、ownerReferences、YAML。
- 关联 API / Mock：API-009、API-013、API-014。
- 权限与状态：详情操作按平台 RBAC 控制；YAML apply 需要二次确认。
- 完成标准：所有资源详情页结构一致，同时保留各资源专项信息入口。

### 页面：工作负载专项页面

- 路由：`/workloads/deployments`、`/workloads/statefulsets`、`/workloads/daemonsets`、`/workloads/replicasets`、`/workloads/jobs`、`/workloads/cronjobs`
- 页面用途：管理工作负载，执行扩缩容、重启、更新镜像、查看滚动状态和回滚。
- 推荐源码：`RecordsView.vue`、`FormView.vue`、`ConfirmDialog.vue`
- 复用等级：baseline
- 改造字段：replicas、image、selector、strategy、conditions、rollout status、关联 Pod。
- 关联 API / Mock：API-008、API-009、API-015。
- 权限与状态：Job / CronJob 等不适用操作隐藏或置灰；回滚和重启必须二次确认。
- 完成标准：适用操作可见且权限正确，不适用操作不产生误导。

### 页面：Pod 专项页面

- 路由：`/pods`
- 页面用途：查看 Pod、容器状态、事件、日志、实时日志、终端和 YAML。
- 推荐源码：`RecordsView.vue`、模板详情壳、弹窗/状态组件。
- 复用等级：baseline + on_demand
- 改造字段：容器、重启次数、镜像、Node、IP、状态、日志参数、终端参数。
- 关联 API / Mock：API-008、API-009、API-016、API-017、API-012。
- 权限与状态：日志、终端、删除分别按权限控制；进入终端必须二次确认并提示审计。
- 完成标准：普通日志、实时日志和终端入口清晰，失败时展示原因。

### 页面：Node 专项页面

- 路由：`/other/nodes`
- 页面用途：查看 Node 状态、资源、标签、污点、节点 Pod、节点事件，并执行 drain / cordon / uncordon。
- 推荐源码：`RecordsView.vue`、详情 tabs、`ConfirmDialog.vue`
- 复用等级：baseline + on_demand
- 改造字段：capacity、allocatable、conditions、taints、labels、pods、events、操作结果。
- 关联 API / Mock：API-008、API-009、API-019。
- 权限与状态：节点操作属于高风险；无权限时隐藏或置灰。
- 完成标准：节点详情和节点操作可追踪，drain 失败原因清晰展示。

### 页面：多集群管理

- 路由：`/clusters`
- 页面用途：添加、测试、更新和删除 Kubernetes 集群连接配置。
- 推荐源码：`RecordsView.vue`、`FormView.vue`、`ConfirmDialog.vue`
- 复用等级：baseline
- 改造字段：集群名称、API Server、凭据类型、连接状态、描述、更新时间。
- 关联 API / Mock：API-004、API-005、API-006。
- 权限与状态：凭据输入只短暂存在于表单提交中；列表只显示脱敏状态。
- 完成标准：连接测试结果明确，凭据不在前端长期保存。

### 页面：系统设置

- 路由：`/settings/general`、`/settings/version`、`/settings/security`、`/settings/audit`、`/settings/access`
- 页面用途：管理平台基础配置、版本页、安全配置、审计保留周期、用户角色权限。
- 推荐源码：`SettingsView.vue`、`VersionUpdateView.vue`、设置页组件。
- 复用等级：baseline + on_demand
- 改造字段：平台配置、安全策略、审计保留周期、用户、角色、权限点、集群/Namespace 授权范围。
- 关联 API / Mock：API-003、API-021、API-022、API-023、API-024。
- 权限与状态：只有有权限用户可见设置子页；版本更新动作可按 v1.0 后端支持情况禁用。
- 完成标准：固定设置页不被破坏，新增设置页遵守 `/settings/*` 子路由。

## 9. 页面级 API / Mock 对接清单

| 页面 | 关联 API / Mock | 数据状态 | 后端依赖 | 备注 |
| --- | --- | --- | --- | --- |
| 登录页 | API-001、API-002、API-003 | mock + 真实接口 | 认证与会话 | 使用 httpOnly Cookie，会话失效统一处理 |
| 顶部栏 | API-003、API-004、API-007、API-020 | mock + 真实接口 | 当前用户、集群、Namespace、搜索 | 不保存敏感凭据 |
| 集群状态 | API-004、API-007、API-008、API-020 | mock + 真实接口 | 集群和资源聚合 | Metrics API 可降级 |
| 资源关系图 | API-008、API-009、API-020 | mock + 真实接口 | 资源关联关系 | 权限过滤后展示 |
| 通用资源列表 | API-008、API-010、API-011、API-012、API-013 | mock + 真实接口 | 资源通用管理 | 分页、筛选、刷新统一 |
| 通用资源详情 | API-009、API-013、API-014 | mock + 真实接口 | 详情、YAML、事件 | YAML apply 需要确认 |
| 工作负载专项 | API-015 | mock + 真实接口 | 工作负载操作 | 不适用操作隐藏或置灰 |
| Pod 日志 / 终端 | API-016、API-017 | mock + 真实接口 | 日志流、WebSocket exec | 终端进入二次确认 |
| Secret 明文 | API-018 | mock + 真实接口 | Secret reveal | 明文不长期保存 |
| Node 操作 | API-019 | mock + 真实接口 | Node drain/cordon/uncordon | 高风险操作确认 |
| 多集群管理 | API-004、API-005、API-006 | mock + 真实接口 | 集群凭据和连接测试 | 凭据脱敏 |
| 用户角色权限 | API-021、API-022 | mock + 真实接口 | 平台 RBAC | 控制菜单和按钮可见性 |
| 审计日志 | API-023 | mock + 真实接口 | 审计查询 | 支持时间、用户、资源和结果筛选 |
| 系统设置 | API-024 | mock + 真实接口 | 配置管理 | 设置变更写审计 |

## 10. 模板 API 适配索引

- 请求入口：`src/template/api.ts`
- Mock 入口：`src/template/data.ts`
- Service 组织：按 `auth`、`clusters`、`resources`、`workloads`、`pods`、`nodes`、`yaml`、`search`、`users`、`roles`、`auditLogs`、`settings` 等业务域扩展 service 或 adapter。
- 响应适配：统一适配后端 `{ code, message, data }`；分页统一适配 `{ page, pageSize, total, items }`。
- 错误处理：会话失效、权限不足、高风险确认缺失、Kubernetes API 失败、指标源不可用和集群不可达都在请求层与页面状态中收敛。
- Mock 切换：开发期 mock 必须可由统一配置切换到真实 `/api/v1`；不得在页面内散写第二套开关。
- 禁止事项：不得把历史 `src/api` 旧领域接口当成 kube-subops 后端契约；不得新建平行 HTTP client。

## 11. 版本 / 更新能力索引

| 能力项 | 当前模板结论 | 方法 / 路径 / 检查方式 | 前端入口 | 后端要求 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 版本展示 / 检查更新 | 模板固定能力保留 | Sub Admin facts 中的 `/admin/system/check-updates` 语义 | `/settings/version`、VersionBadge | v1.0 可返回不支持或禁用操作 | 不删除页面 |
| 立即更新 | 非 v1.0 核心验收 | `/admin/system/update` 语义 | `/settings/version` | 若启用需任务化和审计 | 不同步阻塞 HTTP |
| 回滚 | 非 v1.0 核心验收 | `/admin/system/rollback` 语义 | `/settings/version` | 平台自身回滚与工作负载回滚分离 | 不套用到 Kubernetes 回滚 |
| 重启服务 | 非 v1.0 核心验收 | `/admin/system/restart` 语义 | `/settings/version` | 只记录任务或部署侧指引 | 不伪装直接重启 |
| 运行包模式 / 升级策略 | 展示边界保留 | `package_mode` / `upgrade_strategy` | `/settings/version` | 后端明确返回支持或不支持 | Docker Compose 交付由 `/deploy` 生成 |

## 12. 存储 / 备份能力索引

| 能力项 | 当前模板结论 | 前端入口 | 后端要求 | 备注 |
| --- | --- | --- | --- | --- |
| 平台数据库备份 / 恢复 | 不进入 v1.0 | 不展示 | 不要求 | 由后续 `/deploy` 或新增需求评估 |
| 外部对象存储归档 | 不进入 v1.0 | 不展示 | 不要求 | 不把模板历史备份页放入正式导航 |
| Kubernetes 存储资源管理 | 进入 v1.0 | `/storage/*` | API-008 到 API-014 | 管理 StorageClass、PV、PVC，不等同于平台备份 |

## 13. 前端交接摘要

- `/dev-frontend` 先读取本文件第 2 到 3 节确认模板、源码目录、复制策略、目标目录和底座边界。
- `/dev-frontend` 使用 `sub-admin`，`scaffold_dir=templates/sub-admin`，`dev_entry=.`，目标目录为 `frontend/`。
- `/dev-frontend` 按第 5 到 6 节的页面映射和业务能力映射定位模板 facts 与真实源码。
- 若命中 `copy_policy=baseline`，使用复制到 `frontend/` 的源码。
- 若命中 `copy_policy=on_demand`，从模板源码目录复制或改造真实源码。
- 若命中 `copy_policy=reference_only`，只复用结构、交互和状态，不保留旧业务语义。
- `/dev-frontend` 按第 7 节裁剪无关 demo / 示例入口，再进入业务页面改造。
- 完整接口契约以 `spec/API设计.md` 为准；模板能力以 `.codex/skills/product-orch/templates/facts/sub-admin.json` 为准。
- 本阶段未复制模板、未安装依赖、未启动服务、未写前端业务代码。
