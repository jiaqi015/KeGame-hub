# KeGame Hub

统一入口的产品型工作台，面向三个相互关联的场景：

- `多模型PK`：对同一提示词做多模型对比与核心差异总结
- `开放日选址`：上传 Excel 后完成候选小区测算、参数调优、历史回放与方案管理
- `我是王牌资产顾问`：围绕房源经营、开放日、带看与议价做经营模拟，并持续向云端同步与排行榜方向演进

这个仓库当前不是单一“开放日工具”，而是一个持续收口中的统一入口产品。

快速导航：
[Overview](#overview) ·
[Quick Start](#quick-start) ·
[Re-entry Guide](#re-entry-guide) ·
[Architecture Snapshot](#architecture-snapshot) ·
[Documentation Map](#documentation-map) ·
[Repository Guide](#repository-guide) ·
[Scripts](#scripts) ·
[Environment Variables](#environment-variables)

## Overview

- 它把 `模型对比`、`数据驱动的开放日测算`、`经营模拟` 放进同一产品入口，而不是分散成多个互相脱节的小项目
- 它不是只做前端页面，而是在继续沉淀可演进的后端接口、领域服务、持久化和缓存策略
- 它已经具备从本地开发到 `Vercel / Neon / Blob` 的多层回退和演进路径，适合继续往产品化方向推进

### Project Status

| 维度 | 当前判断 |
| --- | --- |
| 产品形态 | 统一入口产品，而不是单功能工具 |
| 最成熟模块 | `开放日选址` |
| 增长最快模块 | `我是王牌资产顾问` |
| 当前主战场 | 资产顾问母模型迁移、Daily Decision Bridge、语义合同与运行收口 |
| 文档权威入口 | [MEMORY.md](MEMORY.md) 与 `docs/project-memory/` |

## Product Surfaces

| 工作台 | 面向什么问题 | 当前状态 |
| --- | --- | --- |
| `多模型PK` | 同题多模型回答对比、提炼核心差异 | 已接入统一入口，接口链路稳定 |
| `开放日选址` | 候选小区评分、排序、参数调优、历史分析 | 当前最成熟，主流程闭环最完整 |
| `我是王牌资产顾问` | 房源经营模拟、开放日与带看决策、经营反馈 | 正在向母模型、Daily Decision Bridge、语义 receipt 和只读投影收口 |

## Highlights

- 统一入口而非拼接页面：验证、Hub、三条业务线切换已经在同一入口内收口
- 开放日工作流不是单页脚本：前端工作台、服务端接口、`modules/open-day/` 领域层已经分开演进
- 结构化持久化方向明确：支持向 `Neon Postgres`、`Vercel Runtime Cache`、`Vercel Blob` 演进，并保留本地文件 / 内存回退
- 历史与方案能力已经进入主流程：开放日支持历史快照、方案模板、方案版本、数据集画像追溯
- 资产顾问玩法不再只是“点按钮”：正在往经营问题、交互模板、云端 run、leaderboard、scenario 的方向收口

## Quick Start

### Prerequisites

- Node.js 18+
- npm

### Built with

| Layer | Stack |
| --- | --- |
| Frontend | `Vite` + `React` + `TypeScript` |
| Local server | `Express` + `tsx` |
| Open day parsing | `xlsx` |
| Persistence direction | `Neon Postgres` |
| Cache / file runtime | `Vercel Runtime Cache` + local memory fallback |
| Upload archival | `Vercel Blob` + local file fallback |

### Run locally

```bash
npm install
npm run dev
```

默认本地地址：

```bash
http://localhost:3000
```

如果 `3000` 已被占用，服务会自动 fallback 到后续可用端口，并在终端打印实际地址。

## Re-entry Guide

如果你是重新接手这个仓库，推荐按下面顺序恢复上下文：

1. 读 [MEMORY.md](/Users/jiaqi/Documents/开放日测算/MEMORY.md)
2. 读 [接手清单](docs/project-memory/handoff-checklist.md)
3. 读 [模块地图](docs/project-memory/module-map.md)
4. 看 `git status --short`，确认当前未提交改动主要落在哪条业务线
5. 如果本轮是资产顾问，先读 [卖房总设计](docs/selling-houses-total-design.md)、[卖房总纲](docs/selling-houses-master.md)、[业务事实总表](docs/selling-houses-business-facts.md) 和 [母模型迁移工作板](docs/selling-houses-mother-model-agent-workplan.md)

如果你只想 30 秒内判断这轮工作重点，优先读：

1. [MEMORY.md](/Users/jiaqi/Documents/开放日测算/MEMORY.md)
2. [docs/project-memory/handoff-checklist.md](/Users/jiaqi/Documents/开放日测算/docs/project-memory/handoff-checklist.md)
3. [docs/project-memory/module-map.md](/Users/jiaqi/Documents/开放日测算/docs/project-memory/module-map.md)

继续开发前先确认：

- 当前改动主要落在哪条业务线
- 当前任务更像是产品收口、后端闭环、玩法演进还是文档整理
- 是否已经有对应迁移文档说明这块功能正在重构中

## Architecture Snapshot

### Frontend

- `Vite + React + TypeScript`
- 统一入口：`src/App.tsx`
- Hub：`src/components/Hub/WorkspaceHub.tsx`
- 验证覆盖层：`src/components/Auth/AuthOverlay.tsx`

### Open Day

- 前端工作台：`src/open-day/`
- 领域 / 应用 / 基础设施 / HTTP handler：`modules/open-day/`
- 保留原始静态版本：`src/open-day/legacy/`
- 主能力：
  - workbook 解析
  - 参数目录
  - 测算评分
  - 历史快照
  - 方案模板
  - 方案版本
  - dataset / profile 追溯

### 我是王牌资产顾问

- 主模块：`src/selling-houses/`
- 运行真相入口：`index.html` -> `src/main.tsx` -> `src/App.tsx` -> `src/workspaces/workspaceRegistry.tsx` -> `src/selling-houses/SellingHousesWorkspace.tsx`
- `selling-houses-workspace/` 当前为并行/迁移参考目录，默认不作为功能改动落点
- `selling-houses-workspace/docs/` 不再保留重复文档，卖房文档统一读根目录 `docs/`
- 已有方向：
  - 本地玩法状态与规则引擎
  - 云同步状态与客户端
  - `Neon` 数据库与 repository
  - run / leaderboard / scenario 相关接口
  - verify / selfplay / lab 脚本

### API

- 多模型PK（内部 id：sabrina）：
  - `/api/ai-capabilities`
  - `/api/auth?mode=activate`
  - `/api/compare`
  - `/api/compare-stream`
- Open Day：
  - `/api/parse-workbook`
  - `/api/open-day-catalog`
  - `/api/open-day-score`
  - `/api/open-day-analyses`
  - `/api/open-day-scenarios`
  - `/api/open-day-scenario-versions`
- 我是王牌资产顾问（内部 API 仍沿用 maintainer）：
  - `/api/maintainer-runs`
  - `/api/selling-houses-scenarios`

### AI capability platform

- 模型 PK 仍然保留多模型对比；业务场景优先走 `/api/ai-capabilities`。
- 除模型 PK 外，核心 AI 能力默认使用 `deepseek-v4-pro`。
- AI 底层已拆成 capability / agent / skill / tool / handoff / receipt：
  - capability 是业务入口。
  - agent / subagent 定义职责、默认模型和边界。
  - skill 定义可复用 instruction、资源和脚本引用。
  - tool 定义服务端可见能力、schema、风险等级和执行策略。
  - receipt 记录每次调用的能力、agent、模型、skill、tool、guardrail 和 trace。
- 当前 tool 默认只注册和规划，不由模型自动执行；真实执行必须进入服务端白名单和业务权限校验。

### Design Constraints

- 统一入口、验证页、Hub 和三条业务线切换关系要保持清楚
- `open-day` 作为内部模块与接口前缀继续保留，不为文案变化做大规模重命名
- 开放日工作台保持“两步式”主流程
- 能在服务端解决的解析、缓存、持久化问题，优先不要回塞前端页面逻辑

## Documentation Map

### Project Memory

- [项目记忆入口](MEMORY.md)
- [文档总索引](docs/README.md)
- [稳定决策](docs/project-memory/durable-decisions.md)
- [模块地图](docs/project-memory/module-map.md)
- [接手清单](docs/project-memory/handoff-checklist.md)

### Open Day

- [DDD Architecture](docs/open-day-ddd-architecture.md)
- [持久化演进方案](docs/open-day-persistence-evolution-plan.md)
- [Phase 1: Analysis Run](docs/open-day-phase1-analysis-run-migration.md)
- [Phase 2: Scenario Versioning](docs/open-day-phase2-scenario-versioning.md)
- [Phase 3: Dataset / Profile](docs/open-day-phase3-dataset-profile.md)
- [DBA 工作 SOP](docs/open-day-dba-sop.md)

### 我是王牌资产顾问

- [玩法说明](docs/selling-houses-how-to-play.md)
- [卖房总设计](docs/selling-houses-total-design.md)
- [卖房总纲](docs/selling-houses-master.md)
- [业务事实总表](docs/selling-houses-business-facts.md)
- [母模型迁移工作板](docs/selling-houses-mother-model-agent-workplan.md)
- [领域架构](docs/selling-houses-domain-architecture-v1.md)
- [信息架构](docs/selling-houses-information-architecture.md)
- [界面详细设计](docs/selling-houses-interface-detail-design.md)
- [事项模板架构](docs/selling-houses-matter-template-architecture.md)
- [成交事实与成交引擎](docs/selling-houses-deal-fact-and-closing-model.md)
- [账号、玩家、局、得分与榜单](docs/platform-account-player-run-score-architecture.md)
- [生成式剧本架构](docs/selling-houses-generated-scenario-architecture.md)
- [游戏定位](docs/selling-houses-game-positioning.md)
- [房源生命周期设计](docs/selling-houses-listing-lifecycle-design.md)
- [评分系统](docs/selling-houses-scoring-system.md)

### 设计与理论参考

- [王牌顾问 · 系统设计鉴赏](王牌顾问-系统设计鉴赏.docx)
- [王牌顾问 · 世界模型理论分析](王牌顾问-世界模型理论分析.docx)

## Repository Guide

| 路径 | 作用 |
| --- | --- |
| `src/` | 前端主应用与三条业务线工作台 |
| `api/` | 站点 API 入口 |
| `modules/open-day/` | 开放日领域层、应用层、基础设施与 HTTP handler |
| `src/selling-houses/` | 资产顾问玩法的前端、领域、基础设施与接口实现 |
| `docs/` | 架构文档、迁移文档、项目记忆 |
| `scripts/` | verify、selfplay、lab 等研发辅助脚本 |
| `server.ts` | 本地开发服务入口 |

如果你只准备改一块功能，建议按下面的最短路径找入口：

- 改统一入口：先看 `src/App.tsx`、`src/components/Hub/WorkspaceHub.tsx`
- 改开放日：先看 `modules/open-day/`，再看 `src/open-day/`
- 改资产顾问：先看 `src/selling-houses/infrastructure/` 与 `src/selling-houses/interfaces/http/`
- 改玩法体验：再进入 `src/selling-houses/ui/features/`

## Scripts

```bash
npm run dev
npm run build
npm run preview
npm run lint
npm run verify:maintainer
npm run verify:maintainer-shadow
npm run verify:maintainer-file-shadow
npm run rebuild:maintainer-shadow
npm run rebuild:maintainer-file-shadow
npm run verify:generated-maintainer
npm run verify:generated-maintainer-fullrun
npm run selfplay:golden
npm run selfplay:maintainer
npm run selfplay:lab
```

脚本用途：

- `dev`：本地开发入口
- `build`：前端构建
- `preview`：构建后预览
- `lint`：TypeScript 检查
- `verify:maintainer`：资产顾问主链路验证
- `verify:maintainer-shadow`：资产顾问 shadow sync 验证
- `verify:maintainer-file-shadow`：资产顾问 file fallback shadow summary 验证
- `rebuild:maintainer-shadow`：shadow sync 重建
- `rebuild:maintainer-file-shadow`：file fallback shadow summary 重建
- `verify:generated-maintainer`：生成式剧本验证
- `verify:generated-maintainer-fullrun`：生成式剧本完整运行验证
- `selfplay:golden`：资产顾问 golden 自玩验证
- `selfplay:maintainer`：资产顾问自对抗运行
- `selfplay:lab`：资产顾问实验入口

## Development Workflow

推荐开发顺序：

1. 先确认当前任务属于哪条业务线
2. 读对应的项目记忆和专题文档
3. 用 `npm run dev` 本地启动
4. 改动后至少跑一轮相关验证脚本或 `npm run lint`
5. 再整理 README / 记忆文档，避免代码和文档脱节

## Environment Variables

参考 [.env.example](/Users/jiaqi/Documents/开放日测算/.env.example)。

### Required

- `ACTIVATION_KEYS`

### Optional for local development

- `PORT`
- `VITE_HMR_PORT`
- `OPEN_DAY_STORAGE_BACKEND`
- `OPEN_DAY_CACHE_BACKEND`
- `OPEN_DAY_UPLOAD_BACKEND`

### Optional for model comparison providers

- `ARK_API_KEY`
- `IKUN_API_KEY`
- `HUNYUAN_API_KEY`
- `DASHSCOPE_API_KEY`
- `DEEPSEEK_API_KEY`
- `DEEPSEEK_BASE_URL`
- `DEEPSEEK_REQUEST_TIMEOUT_MS`

### Optional for persistence and deployment

- `DATABASE_URL`
- `POSTGRES_URL`
- `BLOB_READ_WRITE_TOKEN`

## Persistence and Runtime Behavior

### Entry and workspace flow

- 验证页沿用统一入口激活机制，并兼容旧 Sabrina 工作台标识
- 验证通过后先进入功能选择页，再切入具体工作台
- 代码内部继续保留 `open-day` 作为模块与接口前缀，避免为了产品文案变化做高风险重命名

### Open Day runtime

- Excel 上传通过 `/api/parse-workbook` 在服务端解析 sheet 和数据
- 默认参数与策略包目录通过 `/api/open-day-catalog` 从后端下发
- 开放日测算由 `/api/open-day-score` 承担评分入口，并与历史分析能力协同
- 历史快照与历史回放通过 `/api/open-day-analyses` 查询和恢复
- 方案模板与方案版本通过 `/api/open-day-scenarios` 和 `/api/open-day-scenario-versions` 查询和保存
- 当一次测算绑定了已保存方案时，会记录 `scenarioTemplateId / scenarioTemplateName`
- 开放日测算会记录 `datasetId / datasetProfileId`，用于追溯数据集和字段质量画像
- workbook 解析链带有 `checksum + requestedSheet` 级别缓存，用于缩短重复解析耗时

### Persistence strategy

- 当存在 `DATABASE_URL` 或 `POSTGRES_URL` 时，开放日模块优先使用 `Neon` 持久化，否则回退为本地文件仓储
- 当运行在 Vercel 上时，开放日缓存优先使用 `Runtime Cache`，本地开发默认回退为内存缓存
- 当存在 `BLOB_READ_WRITE_TOKEN` 且结构化存储走 `Neon` 时，原始 Excel 会优先归档到 `Vercel Blob`
- 资产顾问云端 schema 已按 `Neon Postgres` 预留，可与开放日模块共用同一库、不同表

## Project Rules

- 这个仓库的定位是统一入口产品，不要把它重新理解成“只有开放日”
- 对外文案可以调整，但内部 `open-day` 命名暂时不做大规模重命名
- 开放日工作台保持“两步式”主流程，不回退成大单页混合流
- 关键背景优先沉淀在仓库内文档，而不是只留在对话里
- 自动生成记忆只能作为线索，不能直接替代人工整理的项目记忆
