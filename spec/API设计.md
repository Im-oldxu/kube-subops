# API 设计

## 1. 文档信息

- 项目名称：kube-subops
- 文档版本：1.0.0
- 作者：Codex
- 创建日期：2026-05-27
- 最后更新日期：2026-05-27
- 文档状态：已确认
- 关联架构文档：`spec/架构设计.md`
- 关联数据库文档：`spec/数据库设计.md`
- 关联 UI 文档：`spec/UI原型设计.md`

## 2. API 适用性判断

### 当前结论

- API 范围：需要后端业务 API。
- 判断依据：前端不得直接访问 Kubernetes API Server，也不得保存 kubeconfig、Token 或 ServiceAccount Token；平台需要内置账号、服务端会话、平台 RBAC、凭据加密、审计和 Kubernetes API 代理。
- 当前阶段处理方式：定义 API 风格、全局约定、接口分组、复杂接口边界和模板 API 适配占位。
- 后续引入或调整条件：`/ui` 选定 Vue 管理后台模板后回填模板 request / service / mock / adapter 规则；实现阶段若前端实际调用或数据库契约变化，必须同步更新本文档。

## 3. 全局接口约定

### 基础信息

- Base URL：`/api/v1`
- API 版本：`v1`
- 协议：HTTP / HTTPS；生产环境必须使用 HTTPS 入口或反向代理。
- 数据格式：JSON；文件或终端流式能力按接口说明使用 WebSocket / SSE。
- 编码：UTF-8

### 认证与权限

- 认证方式：用户名 / 密码登录后创建服务端会话。
- Token / Cookie 传递方式：session id 通过 httpOnly Cookie 传递；生产环境 Cookie 启用 `Secure` 和合适的 `SameSite` 策略。
- 权限模型：平台 RBAC 为主，托管集群凭据的 Kubernetes 权限作为实际能力上限。
- 租户 / 组织隔离策略：首版不做多租户；通过用户、角色、权限点、集群和 Namespace 授权范围控制访问。

### 通用响应格式

成功响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {}
}
```

失败响应：

```json
{
  "code": 400001,
  "message": "invalid request",
  "details": {},
  "requestId": "req_xxx"
}
```

分页响应：

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "page": 1,
    "pageSize": 20,
    "total": 0,
    "items": []
  }
}
```

### 错误、分页与兼容规则

- 错误码规则：`0` 表示成功；非零表示失败；错误信息必须脱敏，不返回 kubeconfig、Token、Secret 明文或内部堆栈。
- 分页规则：列表接口统一支持 `page`、`pageSize`；Kubernetes 资源可在后端根据 API 能力做继续令牌或内存分页适配，但前端契约保持稳定。
- 排序规则：平台自身数据按白名单字段排序；Kubernetes 资源排序以名称、Namespace、创建时间、状态等后端支持字段为准。
- 时间格式：API 响应统一使用 ISO 8601 字符串。
- 幂等要求：删除、YAML apply、drain、回滚等高风险操作必须处理重复提交和失败反馈，不产生误导性成功提示。
- 版本兼容策略：首版 API 固定 `/api/v1`；破坏性变更必须更新本文档和 `spec/变更记录.md`。

## 4. 模板 API 适配基线

本节由 `/ui` 根据已确认模板 `Sub Admin`（`sub-admin`）回填，只约束前端模板 request / service / mock / adapter 的接入方式，不替代本文后续业务接口契约。

- 选中模板：Sub Admin（`sub-admin`）
- 模板事实文件：`.codex/skills/product-orch/templates/facts/sub-admin.json`
- 请求入口：`src/template/api.ts`
- Mock 入口：`src/template/data.ts`
- Service 组织方式：按业务域在 `src/template/api.ts` 附近新增 service 或 adapter，建议域包括 `auth`、`clusters`、`namespaces`、`resources`、`workloads`、`pods`、`nodes`、`yaml`、`search`、`users`、`roles`、`auditLogs`、`settings`。
- Mock 策略：开发期可在 `src/template/data.ts` 和 service 附近补最小 mock / adapter；mock 必须可通过统一配置切换到真实 `/api/v1`，不得在页面中散写第二套开关。
- 响应适配策略：统一适配后端 `{ code, message, data }` 外壳；分页统一适配 `{ page, pageSize, total, items }`；页面只消费稳定 ViewModel，字段差异在 service 或 adapter 层消化。
- 分页与筛选参数：列表页统一传递 `page`、`pageSize`、`clusterId`、`namespace?`、`name?`、`labels?`、`status?`；集群级资源允许 `namespace` 为空。
- 排序与枚举：排序字段和资源状态枚举以本文业务接口和后端白名单为准；前端状态字典只做展示映射，不定义新的业务真值。
- 错误处理与会话失效：会话失效、权限不足、高风险确认缺失、Kubernetes API 失败、集群不可达、指标源不可用统一在请求层和页面状态中收敛；错误信息不得展示 kubeconfig、Token、Secret 明文或内部堆栈。
- 前端临时 Mock 与后端真实接口切换规则：开发态 mock 是页面联调辅助；真实 API 联调和发布构建必须关闭 mock，并通过统一 API Base URL 指向 `/api/v1`。
- 禁止事项：不得把模板历史 `src/api` 旧领域接口直接当成 kube-subops 后端契约；不得新建与 `src/template/api.ts` 平行的第二套 HTTP client；不得把模板 demo API 原样改写为项目后端接口；不得让页面绕过 adapter 直接拼接复杂 Kubernetes 响应。

### 页面域与 API 契约映射

| 前端业务域 | 主要页面 | 对应契约 ID | 适配说明 |
| ---------- | -------- | ----------- | -------- |
| `auth` | 登录、退出、当前用户 | API-001 至 API-003 | 处理 httpOnly Cookie 会话态和登录失效跳转 |
| `clusters` / `namespaces` | 顶部栏、多集群管理 | API-004 至 API-007 | 凭据只提交给后端，列表只展示脱敏状态 |
| `resources` | 所有资源列表和详情 | API-008 至 API-014 | 统一资源定位、分页、YAML 查看和 apply |
| `workloads` | Deployment、StatefulSet、DaemonSet、ReplicaSet、Job、CronJob | API-015 | 不适用操作由 adapter 提供可用性状态 |
| `pods` | Pod 日志、实时日志、终端 | API-016、API-017 | 日志流和 WebSocket exec 使用专项适配 |
| `nodes` | Node 操作 | API-019 | drain / cordon / uncordon 必须携带确认载荷 |
| `secrets` | Secret 明文查看 | API-018 | 明文只进入短生命周期 UI 状态，不进入持久 store |
| `search` | 顶部全局搜索 | API-020 | 首版仅当前集群范围搜索 |
| `users` / `roles` / `settings` / `auditLogs` | 系统设置、RBAC、审计 | API-021 至 API-024 | 菜单和按钮权限表现来自当前用户权限点 |

### 版本 / 更新能力契约（按模板 facts 回填）

| 能力项 | 当前模板结论 | 方法 / 路径 / 检查方式 | 前端入口 | 后端要求 | 备注 |
| ------ | ------------ | ---------------------- | -------- | -------- | ---- |
| 版本展示 / 检查更新 | Sub Admin 固定能力保留，v1.0 可禁用动作 | `GET /admin/system/check-updates` 的模板语义 | `/settings/version`、VersionBadge | 若不实现自更新，返回不支持或禁用状态 | 不删除固定版本页 |
| 立即更新 | 非 v1.0 核心验收 | `POST /admin/system/update` 的模板语义 | `/settings/version` | 若启用需鉴权、二次确认、任务化和审计 | HTTP 请求不得同步阻塞下载或替换 |
| 回滚 | 非 v1.0 核心验收 | `POST /admin/system/rollback` 的模板语义 | `/settings/version` | 平台自身回滚与 Kubernetes 工作负载回滚分离 | 不套用到 API-015 工作负载回滚 |
| 重启服务 | 非 v1.0 核心验收 | `POST /admin/system/restart` 的模板语义 | `/settings/version` | 只记录任务或返回部署侧指引 | 不伪装平台可直接结束当前进程 |
| 运行包模式 / 升级策略 | 展示边界保留 | `package_mode` / `upgrade_strategy` | `/settings/version` | 后端明确返回支持或不支持 | Docker Compose 交付文件由 `/deploy` 生成 |
| 不支持 / 禁止套用项 | 禁止套用未选模板的自更新 API | 不涉及 | 不涉及 | 不涉及 | 不套用 Vben 静态检查或 New Admin 设置 API |

### 存储 / 备份能力契约（按模板 facts 回填）

| 能力项 | 当前模板结论 | 方法 / 路径 | 请求要点 | 响应要点 | 前端入口 / 状态 |
| ------ | ------------ | ----------- | -------- | -------- | --------------- |
| S3 / 对象存储配置读取 | 不进入 v1.0 | 不涉及 | 不涉及 | 不涉及 | 不展示 |
| S3 / 对象存储配置保存 | 不进入 v1.0 | 不涉及 | 不涉及 | 不涉及 | 不展示 |
| 测试连接 | 不进入 v1.0 | 不涉及 | 不涉及 | 不涉及 | 不展示 |
| 定时备份配置读取 | 不进入 v1.0 | 不涉及 | 不涉及 | 不涉及 | 不展示 |
| 定时备份配置保存 | 不进入 v1.0 | 不涉及 | 不涉及 | 不涉及 | 不展示 |
| 创建备份 | 不进入 v1.0 | 不涉及 | 不涉及 | 不涉及 | 不展示 |
| 备份记录列表 | 不进入 v1.0 | 不涉及 | 不涉及 | 不涉及 | 不展示 |
| 备份状态轮询 | 不进入 v1.0 | 不涉及 | 不涉及 | 不涉及 | 不展示 |
| 下载备份 | 不进入 v1.0 | 不涉及 | 不涉及 | 不涉及 | 不展示 |
| 恢复备份 | 不进入 v1.0 | 不涉及 | 不涉及 | 不涉及 | 不展示 |
| 删除备份 | 不进入 v1.0 | 不涉及 | 不涉及 | 不涉及 | 不展示 |
| Secret / 凭证处理 | 集群凭据由后端 AES-GCM 加密保存 | `/api/v1/clusters/*` | 不返回明文 | 只返回脱敏信息 | 多集群管理 |
| Kubernetes 存储资源管理 | 进入 v1.0 | API-008 至 API-014 | StorageClass、PV、PVC 资源请求 | 资源列表、详情、YAML 和操作结果 | `/storage/*` |
| 本地备份 + 远端归档语义映射 | 不涉及 | 不涉及 | 不涉及 | 不涉及 | 不展示 |

## 5. 业务接口契约基线（按需）

| 契约 ID | 业务动作 | 方法 | 路径 / 调用目标 | 调用方 | 认证 / 权限 | 请求要点 | 响应要点 |
|---------|----------|------|-----------------|--------|-------------|----------|----------|
| API-001 | 登录 | POST | `/api/v1/auth/login` | 前端 | 匿名 | 用户名、密码 | 用户摘要，会话 Cookie |
| API-002 | 退出 | POST | `/api/v1/auth/logout` | 前端 | 已登录 | 当前会话 | 会话失效结果 |
| API-003 | 当前用户 | GET | `/api/v1/me` | 前端 | 已登录 | 无 | 用户、角色、权限点 |
| API-004 | 集群列表 | GET | `/api/v1/clusters` | 前端 | 集群查看权限 | 分页、关键词 | 集群摘要列表 |
| API-005 | 添加集群 | POST | `/api/v1/clusters` | 前端 | 集群管理权限 | 名称、API Server、凭据类型、凭据内容 | 集群摘要、连接状态 |
| API-006 | 集群连接测试 | POST | `/api/v1/clusters/{clusterId}/test` | 前端 | 集群管理权限 | 集群 ID | 连接成功或失败原因 |
| API-007 | Namespace 列表 | GET | `/api/v1/clusters/{clusterId}/namespaces` | 前端 | 集群访问权限 | 集群 ID | Namespace 列表 |
| API-008 | 资源列表 | GET | `/api/v1/clusters/{clusterId}/resources/{resourceType}` | 前端 | 资源查看权限 | namespace、name、labels、status、page、pageSize | 资源分页列表 |
| API-009 | 资源详情 | GET | `/api/v1/clusters/{clusterId}/resources/{resourceType}/{name}` | 前端 | 资源查看权限 | namespace 可选 | 资源详情、关联资源、事件、YAML |
| API-010 | 资源创建 | POST | `/api/v1/clusters/{clusterId}/resources/{resourceType}` | 前端 | 资源写权限 | namespace、表单数据或 YAML、confirm | 创建结果 |
| API-011 | 资源编辑 | PUT/PATCH | `/api/v1/clusters/{clusterId}/resources/{resourceType}/{name}` | 前端 | 资源写权限 | namespace、表单数据或 YAML、confirm | 更新结果 |
| API-012 | 资源删除 | DELETE | `/api/v1/clusters/{clusterId}/resources/{resourceType}/{name}` | 前端 | 删除权限 | namespace、confirm | 删除结果 |
| API-013 | YAML 获取 | GET | `/api/v1/clusters/{clusterId}/yaml` | 前端 | 资源查看权限 | resourceType、namespace、name | YAML 文本 |
| API-014 | YAML 应用 | POST | `/api/v1/clusters/{clusterId}/yaml/apply` | 前端 | YAML 应用权限 | namespace、yaml、confirm | apply 结果 |
| API-015 | 工作负载专项操作 | POST | `/api/v1/clusters/{clusterId}/workloads/{kind}/{name}/actions/{action}` | 前端 | 工作负载操作权限 | namespace、action payload、confirm | 操作结果 |
| API-016 | Pod 日志 | GET | `/api/v1/clusters/{clusterId}/pods/{podName}/logs` | 前端 | Pod 日志权限 | namespace、container、tailLines、follow | 日志文本或流 |
| API-017 | Pod 终端 | WebSocket | `/api/v1/clusters/{clusterId}/pods/{podName}/exec` | 前端 | Pod 终端权限 | namespace、container、confirm | 终端双向流 |
| API-018 | Secret 明文查看 | POST | `/api/v1/clusters/{clusterId}/secrets/{name}/reveal` | 前端 | Secret 明文权限 | namespace、confirm | Secret 明文数据 |
| API-019 | Node 操作 | POST | `/api/v1/clusters/{clusterId}/nodes/{nodeName}/actions/{action}` | 前端 | Node 操作权限 | action、confirm | 操作结果 |
| API-020 | 全局搜索 | GET | `/api/v1/search` | 前端 | 集群访问权限 | clusterId、keyword、namespace、resourceType | 搜索结果 |
| API-021 | 用户管理 | REST | `/api/v1/users` | 前端 | 用户管理权限 | 用户信息、角色绑定 | 用户数据 |
| API-022 | 角色与权限 | REST | `/api/v1/roles` | 前端 | 角色管理权限 | 角色、权限点 | 角色数据 |
| API-023 | 审计日志查询 | GET | `/api/v1/audit-logs` | 前端 | 审计查看权限 | 时间、用户、集群、动作、结果、分页 | 审计分页列表 |
| API-024 | 系统设置 | REST | `/api/v1/settings` | 前端 | 系统设置权限 | 配置项 | 配置结果 |

## 6. 关键接口详情（仅复杂接口填写）

### Pod 终端

- 契约 ID：API-017
- 功能说明：进入指定 Pod 容器终端，提供双向交互流。
- 方法：WebSocket
- 路径 / 调用目标：`/api/v1/clusters/{clusterId}/pods/{podName}/exec`
- 权限要求：Pod 终端权限 + 集群访问范围 + 二次确认。
- 调用方：Vue 管理后台。
- 关联数据对象：`sessions`、`clusters`、`cluster_credentials`、`audit_logs`

#### 请求参数

| 参数 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| clusterId | Path | string | 是 | 集群 ID |
| podName | Path | string | 是 | Pod 名称 |
| namespace | Query | string | 是 | Namespace |
| container | Query | string | 否 | 容器名称 |
| confirm | Query / Body | boolean | 是 | 高风险确认 |

#### 响应要点

WebSocket 建连成功后转发终端输入输出；建连失败返回统一错误响应或关闭帧错误。

#### 业务规则

- 后端必须校验会话、平台权限、集群访问范围和确认参数。
- 建连、关闭和失败都必须写入审计。
- 后端只在内存中短暂解密集群凭据。

#### 异常与边界

- 参数错误：缺少 Namespace、Pod 不存在或容器不存在。
- 权限不足：无 Pod 终端权限或无集群访问范围。
- 状态冲突：Pod 非 Running 或 Kubernetes API 不支持 exec。
- 幂等 / 重试：前端重连必须重新校验权限并追加审计记录。

### YAML 应用

- 契约 ID：API-014
- 功能说明：对目标集群应用用户提交的 YAML。
- 方法：POST
- 路径 / 调用目标：`/api/v1/clusters/{clusterId}/yaml/apply`
- 权限要求：YAML 应用权限 + 资源写权限 + 二次确认。
- 调用方：Vue 管理后台。
- 关联数据对象：`audit_logs`

#### 请求参数

| 参数 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| clusterId | Path | string | 是 | 集群 ID |
| namespace | Body | string | 否 | 默认 Namespace；集群级资源可为空 |
| yaml | Body | string | 是 | YAML 文本 |
| confirm | Body | boolean | 是 | 高风险确认 |

#### 响应要点

```json
{
  "code": 0,
  "message": "ok",
  "data": {
    "applied": true,
    "resourceRefs": []
  }
}
```

#### 业务规则

- 后端必须解析 YAML 并校验权限，不能只依赖前端。
- Kubernetes API 返回的失败原因应脱敏后返回。
- 成功和失败都必须写审计。

#### 异常与边界

- 参数错误：YAML 为空或格式错误。
- 权限不足：无目标资源写权限。
- 状态冲突：Kubernetes API 返回冲突或不可变字段错误。
- 幂等 / 重试：重复 apply 以 Kubernetes API 结果为准。

### Secret 明文查看

- 契约 ID：API-018
- 功能说明：授权用户二次确认后查看 Secret 明文。
- 方法：POST
- 路径 / 调用目标：`/api/v1/clusters/{clusterId}/secrets/{name}/reveal`
- 权限要求：Secret 明文权限 + 二次确认。
- 调用方：Vue 管理后台。
- 关联数据对象：`audit_logs`

#### 请求参数

| 参数 | 位置 | 类型 | 必填 | 说明 |
|------|------|------|------|------|
| clusterId | Path | string | 是 | 集群 ID |
| name | Path | string | 是 | Secret 名称 |
| namespace | Body | string | 是 | Namespace |
| confirm | Body | boolean | 是 | 高风险确认 |

#### 响应要点

返回解码后的 Secret 键值；前端不得长期保存。

#### 业务规则

- 必须审计查看行为，不记录 Secret 明文。
- 错误信息不得泄露凭据或 Secret 内容。

#### 异常与边界

- 参数错误：Secret 不存在或 Namespace 为空。
- 权限不足：无 Secret 明文权限。
- 幂等 / 重试：每次查看都记录独立审计。

## 7. 第三方接口与回调（按需）

### 第三方接口

- 接口名称：Kubernetes API Server
- 调用方式：后端通过 client-go 调用。
- 认证方式：平台托管 kubeconfig、Token 或 ServiceAccount Token。
- 超时设置：由后端实现阶段按资源操作类型配置。
- 重试策略：读操作可按后端策略重试；写操作谨慎重试并保留审计。
- 失败补偿：向前端返回脱敏错误原因，写入审计。

### 回调接口

- 当前不涉及外部回调接口。

## 8. 契约变更处理

- 若前端实际调用与本文件不一致，先判断是前端未同步、模板 adapter 差异，还是本文件过期。
- 若只是模板响应结构与项目契约不同，优先在前端 adapter 处理，不改业务契约。
- 若业务契约确实变化，必须同步更新本文件和 `spec/变更记录.md`。
- 若变化影响数据库结构，必须同步更新 `spec/数据库设计.md`。
- 若变化影响任务或进度，只更新 `spec/开发计划.md` 或 `spec/开发进度.md`，不要把进度写回本文件。

## 9. 相关文档

| 文档 | 路径 | 说明 |
|------|------|------|
| 需求文档 | `spec/需求文档.md` | 产品需求与验收基线 |
| 架构设计 | `spec/架构设计.md` | 系统概览、边界、技术选型与非功能约束 |
| 数据库设计 | `spec/数据库设计.md` | 数据对象、表结构、字段、关系、迁移与一致性策略 |
| UI 原型设计 | `spec/UI原型设计.md` | 页面级 API / Mock 对接清单与模板交接 |
| 开发计划 | `spec/开发计划.md` | 任务基线与阶段顺序 |
| 开发进度 | `spec/开发进度.md` | 接口、前端、后端和数据库实现进度 |
| 变更记录 | `spec/变更记录.md` | 契约变更摘要 |
