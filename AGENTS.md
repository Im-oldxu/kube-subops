# AGENTS.md

本文件是给当前仓库内所有编码 Agent 的通用协作入口。具体流程规则以 `.codex/skills/product-orch/` 为准；本文件只保留最小约束，避免把 Skill 细节复制成第二套规则。

## 1. 总入口

- 默认使用 `product-orch` 作为产品研发流水线总控。
- 执行任何阶段前，先读取 `.codex/skills/product-orch/SKILL.md`。
- 阶段路由读取：
  - `.codex/skills/product-orch/references/skill-registry.json`
  - `.codex/skills/product-orch/references/routing-matrix.md`
  - `.codex/skills/product-orch/references/stage-return-protocol.md`
- 进入具体阶段后，再读取对应 `subskills/*/SKILL.md`，不要凭记忆执行。

## 2. 项目事实源

优先读取 `spec/状态.json` 判断当前阶段、项目类型、完成状态和质量门禁。

常用事实源：

- `spec/需求文档.md`
- `spec/架构设计.md`
- `spec/API设计.md`
- `spec/数据库设计.md`
- `spec/UI原型设计.md`
- `spec/开发计划.md`
- `spec/开发进度.md`
- 检查报告、部署设计、发布说明等当前阶段声明的输入文件

事实源不足时，回到最靠近根因的上游阶段，不要直接写实现。

## 3. 阶段路由

常用命令与职责：

- `/prd`：需求澄清、范围确认、PRD 落盘。
- `/arch-plan`：技术栈、架构、API、数据库、开发计划和状态基线。
- `/ui`：模板选择、页面结构、交互状态和前端交接。
- `/dev-frontend`：前端模板基线、业务页面、请求层、mock 和交互实现。
- `/dev-backend`：后端 API、服务、数据库、任务、适配器和配置实现。
- `/parallel-dev`：分支、worktree、子 Agent 工作包和集成策略编排。
- `/integrate`：并行成果合并、冲突处理和最小集成验证。
- `/check`：对照事实源做一致性审计，判断放行或回流。
- `/ops`：本地运行态启停、重启、日志和状态。
- `/deploy`：部署交付包、部署文档、脚本和部署自检。
- `/git-bootstrap`：仓库初始化、首个基线提交和并行开发前 Git 基线。
- `/git-push`：日常提交、备份 tag 和 push。
- `/release`：正式 tag、GitHub Release、发布说明和发布流水线。
- `/help`：命令说明和下一步建议。

旁路命令 `/ops`、`/deploy`、`/git-*`、`/release`、`/help` 默认不改变主线阶段。

## 4. 执行原则

- 一次请求只选择一个目标阶段；不要同时展开多个生命周期阶段。
- 显式命令也必须检查门禁，不能跳过 `routing-matrix.md`。
- 阶段完成后只推荐一个下一步，按 `stage-return-protocol.md` 返回。
- 写入 `spec/*` 时遵守 `shared/references/state-sync-rules.md` 和 `shared/references/document-creation-rules.md`。
- 恢复已有项目时使用“推断”口径；没有在当前会话完成的动作，不要说“我已完成”。

## 5. 实现边界

- 前端工程默认只在 `frontend/` 内实现。
- 后端工程默认只在 `backend/` 内实现。
- `/dev-frontend` 不创建后端工程；`/dev-backend` 不改前端页面结构和风格系统。
- `/check` 先做审计和归因，不直接改代码；若允许同轮修复，必须切换到唯一目标实现技能。
- `/parallel-dev` 只做编排和工作包边界，不直接写业务代码。
- `/integrate` 不替代 `/check`、`/git-push` 或 `/release`。
- `/release` 不临时脑补部署能力；缺部署交付物时先回 `/deploy`。

## 6. Bug 修复

先归因，再决定路径：

- 小 Bug：`main-fix`，稳定主干干净、改动少、归属单一时可直接修复并最小验证。
- 中等 Bug：`bug/*`，跨模块、影响范围不确定、需要 Review 或补丁发布时使用。
- 紧急 Bug：`fix/*`，线上版本快速修复时使用，只包含本缺陷和必要验证。
- 规格问题：回 `/prd`、`/arch-plan` 或 `/ui`，未确认前不直接开发。

修复完成后只复检受影响范围；只有跨端契约失效时才重置另一端门禁。

## 7. 模板与 Mock

- 模板驱动项目必须读取对应 facts，优先复用模板已有能力，不随意 DIY 固定页面、版本更新、备份、设置页、请求层或状态组件。
- Mock 是开发期数据源，不是生产能力。真实 API 联调和发布构建必须通过项目配置关闭 mock。
- Mock 开关、API Base URL、运行模式等配置必须来自统一配置入口，不在页面里散写第二套事实。

## 8. 部署与发布

- 部署文件、Dockerfile、Compose、脚本和部署文档由 `/deploy` 按当前项目事实生成。
- Release 说明优先使用 `docs/releases/<tag>.md`。
- Release 标题使用 `<程序显示名> <tag>`。
- Workflow 必须按当前项目技术栈生成，不把某个项目的语言、二进制名、镜像名硬编码成通用模板。
- 发布 Docker 镜像时，应包含 GHCR tag，例如 `ghcr.io/<owner>/<repo>:<tag>`；只有真实产出时才写 Docker Hub、安装脚本、checksum、SBOM 或签名。

## 9. Git 安全

- 不自动提交、不自动推送、不创建正式 tag，除非用户明确要求对应动作。
- 不回滚用户已有改动；遇到无关未跟踪文件，默认保持原样。
- 需求、架构和 UI 已确认后，进入开发前先走 `/git-bootstrap` 建立项目工程起点。
- `/git-bootstrap` 可在用户提供远程地址时配置 `origin`，并推送首个基线 commit 与 baseline tag。
- 日常保存走 `/git-push`。
- 正式发布走 `/release`。
- `.codex/` 若被 `.gitignore` 忽略，但用户要求提交 Skill 变化，需要按实际范围强制暂存，避免把缓存、运行数据或无关模板整包误提交。

## 10. 输出要求

- 默认使用中文。
- 输出高信号结果：做了什么、验证了什么、还剩什么风险。
- 不写空泛流程话术，不重复粘贴 Skill 长文。
- 失败时说明具体原因、已验证证据和下一步建议。
