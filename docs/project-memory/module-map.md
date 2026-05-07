# 模块地图

最后整理：2026-05-06

这份文件只回答一个问题：要改某块功能，第一站该去哪里看。

## 全局骨架

- `src/`
  - 前端应用主体和各业务线工作台。
- `api/`
  - 站点 HTTP 路由入口，覆盖当前所有 workspace 和统一认证能力。
- `modules/open-day/`
  - 开放日领域层、应用层、基础设施层与 HTTP handler。
- `src/selling-houses/`
  - 资产顾问玩法的前端、领域、基础设施和接口实现。
- `docs/`
  - 业务架构、数据模型、迁移文档和项目记忆。
  - `docs/global-persistence-dba-unified-design.md`
    - 全局持久化与 DBA 统一设计总纲。
  - `docs/selling-houses-mother-model-agent-workplan.md`
    - 资产顾问母模型迁移、Daily Decision Bridge、A/B/C/D 任务和验收口径的当前总控。
- `server.ts`
  - 本地开发服务入口，承接前端开发服务和本地 API。

## 统一入口

- `src/App.tsx`
  - 整站入口，负责业务线切换。
- `src/components/Hub/WorkspaceHub.tsx`
  - 统一入口 Hub。
- `src/components/Auth/AuthOverlay.tsx`
  - 激活与验证覆盖层。
- `src/hooks/useAppSession.ts`
  - 会话态和使用态协调。

## 多模型PK

- `lib/aiCapabilities.ts`
  - 项目级 AI 能力目录，按能力抽象 LLM / agent / subagent / tool-use / skill，而不是直接绑定单个业务场景。
- `lib/aiInvocationContracts.ts`
  - AI 能力层基础合同，定义执行模式、工具策略、guardrail 和 invocation receipt。
- `lib/aiAgents.ts`
  - Agent / subagent 注册表，定义职责、默认模型、skill、tool、handoff 和 guardrail。
- `lib/aiSkills.ts`
  - Skill manifest 注册表，承接可复用 instruction、资源引用、脚本引用和可用工具。
- `lib/aiTools.ts`
  - Tool manifest 注册表，定义工具类型、输入输出 schema、风险等级和执行策略。
- `lib/aiPlatform.ts`
  - 汇总 capability / agent / skill / tool 的平台 manifest。
- `lib/aiCapabilityRuntime.ts`
  - AI 能力调用入口，按 capability 选择默认模型并转给统一模型运行层，同时返回 invocation receipt。
- `lib/modelRuntime.ts`
  - 统一模型 provider 调度层，多模型PK 和 AI 能力层共用。
- `api/ai-capabilities.ts`
  - AI 能力服务端入口，支持能力列表、非流式调用和流式调用。
- `src/components/Comparison/ComparisonWorkspace.tsx`
  - 模型对比工作区。
- `src/services/apiService.ts`
  - 前端调用模型相关接口的主要封装。
- `api/auth.ts`
  - 认证入口，同时承接邮箱登录与激活验证。
- `api/compare.ts`
  - 模型对比入口，同时承接模型列表、非流式与流式对比。

## 开放日选址

### 前端工作台

- `src/open-day/OpenDayWorkspace.tsx`
  - 开放日主工作台。
- `src/open-day/components/UploadStage.tsx`
  - 第一步上传和预览。
- `src/open-day/openDayReducer.ts`
  - 工作台状态收口。
- `src/open-day/openDayClient.ts`
  - 前端访问开放日接口。
- `src/open-day/components/FormulaBar.tsx`
  - 公式和参数表达入口。
- `src/open-day/components/SidebarConfig.tsx`
  - 侧栏配置区。
- `src/open-day/components/ScenarioDashboard.tsx`
  - 结果和分析视图。
- `src/open-day/components/HistoryPanel.tsx`
  - 历史快照与回放。

### 领域与应用层

- `modules/open-day/domain/`
  - 评分、参数解析、水位线、资格与 tier 等核心规则。
- `modules/open-day/application/`
  - analysis、scenario、snapshot、dataset、catalog、upload artifact、parse cache 等应用服务。
- `modules/open-day/infrastructure/`
  - file / Neon / Runtime Cache / Blob 等基础设施实现。
- `modules/open-day/interfaces/http/`
  - 开放日 HTTP handler，是真正的接口收口层。

### 站点 API 入口

- `api/parse-workbook.ts`
  - workbook 解析入口。
- `api/open-day-catalog.ts`
  - 参数目录与默认配置。
- `api/open-day-analyses.ts`
  - 历史分析查询与测算打分。
- `api/open-day-scenarios.ts`
  - 方案模板读取、保存与版本列表。

### 核心文档

- `docs/open-day-ddd-architecture.md`
  - 开放日领域设计总说明。
- `docs/open-day-persistence-evolution-plan.md`
  - 持久化总体演进方向。
- `docs/open-day-phase1-analysis-run-migration.md`
  - Analysis Run 迁移。
- `docs/open-day-phase2-scenario-versioning.md`
  - 方案版本化迁移。
- `docs/open-day-phase3-dataset-profile.md`
  - dataset profile 阶段演进。
- `docs/open-day-dba-sop.md`
  - DBA 视角的治理与工作 SOP。

## 我是王牌资产顾问

### 前端与应用层

- `src/selling-houses/SellingHousesWorkspace.tsx`
  - 资产顾问主工作台。
- `src/selling-houses/application/useGame.ts`
  - 主运行 hook。
- `src/selling-houses/application/gameState.ts`
  - 本地运行态定义。
- `src/selling-houses/application/cloudState.ts`
  - 云同步状态。
- `src/selling-houses/application/cloudSync.ts`
  - 云同步流程。
- `src/selling-houses/application/maintainerRunRepository.ts`
  - run repository contract。
- `src/selling-houses/application/sellingHousesScenarioRepository.ts`
  - scenario repository contract。
- `src/selling-houses/application/localAdversarialSelfPlayArena.ts`
  - 自对抗 arena。
- `src/selling-houses/application/localAdversarialSelfPlayLab.ts`
  - 本地 lab。

### 领域层

- `src/selling-houses/core/`
  - 母模型迁移的核心收口区，包括 world-state、evaluation、decision、narrative、LLM boundary、semantic receipt 等只读合同和适配层。
- `src/selling-houses/domain/models.ts`
  - 核心模型。
- `src/selling-houses/domain/engine.ts`
  - 总体规则推进入口。
- `src/selling-houses/domain/engine/`
  - 行动、市场、事件、竞争、机会等子引擎。
- `src/selling-houses/domain/actions/`
  - 行动定义和模板。
- `src/selling-houses/domain/scenario-generation/`
  - 难度、蓝图、组装、命名、校验等生成式剧本逻辑。
- `src/selling-houses/domain/scenarios/`
  - 内置剧本。
- `src/selling-houses/domain/worlds/`
  - 世界配置。
- `src/selling-houses/domain/config/`
  - 基础规则和难度配置。

### 基础设施与接口

- `src/selling-houses/infrastructure/cloudClient.ts`
  - 云端请求封装。
- `src/selling-houses/infrastructure/neonGameDatabase.ts`
  - Neon 数据库初始化和 schema 方向。
- `src/selling-houses/infrastructure/neonGameRunRepository.ts`
  - run repository。
- `src/selling-houses/infrastructure/fileMaintainerRunRepository.ts`
  - file fallback run repository，同时维护本地 shadow summary sidecar。
- `src/selling-houses/infrastructure/neonScenarioRepository.ts`
  - scenario repository。
- `src/selling-houses/infrastructure/sellingHousesPlatform.ts`
  - selling-houses platform resolver。
- `src/selling-houses/interfaces/http/maintainerRunHandlers.ts`
  - run 相关 handler。
- `src/selling-houses/interfaces/http/maintainerLeaderboardHandler.ts`
  - leaderboard handler。
- `src/selling-houses/interfaces/http/sellingHousesScenarioHandlers.ts`
  - selling-houses scenario handlers。
- `api/maintainer-runs.ts`
  - run API 入口，同时承接 leaderboard 查询。
- `api/selling-houses-scenarios.ts`
  - scenario API 入口。

### UI 特征区

- `src/selling-houses/ui/features/ScenarioSetup.tsx`
  - 开局与难度入口。
- `src/selling-houses/ui/features/Dashboard.tsx`
  - 主控制台。
- `src/selling-houses/ui/features/Cases.tsx`
  - 房源 / case 面板。
- `src/selling-houses/ui/features/Market.tsx`
  - 市场视角。
- `src/selling-houses/ui/features/Opportunities.tsx`
  - 准客池 / 机会视角。
- `src/selling-houses/ui/features/Review.tsx`
  - 复盘视角。
- `src/selling-houses/ui/features/ResultOverlay.tsx`
  - 结果层。

### 核心文档

- `docs/selling-houses-master.md`
  - 卖房总纲与旧文档处置锚点。
- `docs/selling-houses-mother-model-agent-workplan.md`
  - 当前母模型迁移工作板。A/B/C/D 提示词、Daily Decision Bridge 轮次、gate、报告和 P1/P2 清单以这里为准。
- `docs/selling-houses-total-design.md`
  - 卖房总设计稿，把业务、世界模型、引擎、页面、结算和落地闭环收成一份可读总说明。
- `docs/selling-houses-domain-architecture-v1.md`
  - 当前领域架构正文。
- `docs/selling-houses-architecture-diagrams.md`
  - 总体架构图、ER 图和关键边界。
- `docs/selling-houses-organization-acn-model.md`
  - 品牌、ACN、门店、商圈经理、联卖、客户私有等组织层设计。
- `docs/selling-houses-business-facts.md`
  - 卖房业务事实总表，集中收住市场、组织、客户、房源、时间与评分事实。
- `docs/selling-houses-business-language-guide.md`
  - 业务语言指南，规定页面文案、事件描述、系统建议和投影解释如何业务化、真实化、去 AI 味。
- `docs/platform-account-player-run-score-architecture.md`
  - 平台账号、玩家、局、每日分、最终分、生涯总分和榜单的统一数据架构。
- `docs/selling-houses-customer-opportunity-architecture.md`
  - 客户、客户状态、客户关系与机会阶段推进的详细设计。
- `docs/selling-houses-competition-and-cosale-architecture.md`
  - 竞争、联卖、房源端、客源端、丢盘丢客的详细设计。
- `docs/selling-houses-archetype-architecture.md`
  - 业主与客户类型体系，定义动机、性格、需求、决策风格等差异。
- `docs/selling-houses-field-ownership-matrix.md`
  - 字段归属表，直接指导迁移。
- `docs/selling-houses-good-house-model.md`
  - D1 / D2 / D3 与好房分模型。
- `docs/selling-houses-price-model.md`
  - 挂牌价、心理价、市场估价与成交可行度。
- `docs/selling-houses-deal-fact-and-closing-model.md`
  - 成交事实、成交概率、独立成交记录、联卖归因、丢盘丢客与结算消费路径。
- `docs/selling-houses-market-event-matrix.md`
  - 市场事件目录与影响矩阵。
- `docs/selling-houses-time-architecture.md`
  - 时间架构，拆分年、季度、月、周、日，以及城市、商圈、个人三层时间。
- `docs/selling-houses-daily-tick-design.md`
  - 日内 / 日结运行蓝图。
- `docs/selling-houses-information-architecture.md`
  - 页面信息架构与底层对象映射。
- `docs/selling-houses-interface-detail-design.md`
  - 界面信息架构详细设计，定义工作台布局、层级钻取、详情页、新闻、事件与流水日志。
- `docs/selling-houses-projection-architecture.md`
  - Projection 投影体系，定义经营概览、房源详情、市场、复盘、结果、排行榜如何从世界事实派生。
- `docs/selling-houses-interaction-campaign-event-architecture.md`
  - 交互、活动、事件、地点与典型链路设计。
- `docs/selling-houses-owner-conversation-architecture.md`
  - 业主沟通的动作壳、话题、事实包与影响解析器设计。
- `docs/selling-houses-broker-action-architecture.md`
  - 经纪人动作总架构，统一沟通、营销推广、撮合互动、组织协同四类动作。
- `docs/selling-houses-matter-template-architecture.md`
  - Matter 体系，定义 scene / template / presentation，以及 report、diagnose、execute、negotiate 生命周期分类的阶段、完成条件和影响对象。
- `docs/selling-houses-game-layer-goals-leaderboard.md`
  - 游戏层目标、跨局沉淀、个人纪录与三类排行榜的汇总架构。
- `docs/selling-houses-game-positioning.md`
  - 定位与体验表达。
- `docs/selling-houses-generated-scenario-architecture.md`
  - 生成式剧本架构。
- `docs/selling-houses-listing-lifecycle-design.md`
  - 房源生命周期设计。
- `docs/selling-houses-scoring-system.md`
  - 评分系统。

## 运行与验证

- `package.json`
  - `npm run dev`：本地开发
  - `npm run build`：构建
  - `npm run lint`：TypeScript 检查
  - `npm run verify:maintainer`：资产顾问验证
  - `npm run verify:maintainer-shadow`：Neon shadow sync 验证
  - `npm run verify:maintainer-file-shadow`：file fallback shadow summary 验证
  - `npm run rebuild:maintainer-shadow`：Neon shadow sync 重建
  - `npm run rebuild:maintainer-file-shadow`：file fallback shadow summary 重建
  - `npm run verify:generated-maintainer`：生成式剧本验证
  - `npm run verify:generated-maintainer-fullrun`：生成式剧本完整运行验证
  - `npm run selfplay:golden`：资产顾问 golden 自玩验证
  - `npm run selfplay:maintainer`：自对抗运行
  - `npm run selfplay:lab`：本地 lab
- `scripts/verify-selling-houses.ts`
  - 资产顾问专项验证入口。
- `scripts/verify-selling-houses-shadow-sync.ts`
  - Neon 影子表校验入口。
- `scripts/verify-selling-houses-file-shadow-sync.ts`
  - file fallback shadow summary 校验入口。
- `scripts/rebuild-selling-houses-shadow-sync.ts`
  - Neon 影子表重建入口。
- `scripts/rebuild-selling-houses-file-shadow-sync.ts`
  - file fallback shadow summary 重建入口。
- `scripts/verify-generated-selling-houses.ts`
  - 生成式剧本验证入口。
- `scripts/verify-generated-selling-houses-fullrun.ts`
  - 生成式剧本完整运行验证入口。
- `scripts/run-selling-houses-golden.ts`
  - 资产顾问 golden 自玩验证入口。
- `scripts/run-selling-houses-agent.ts`
  - 自对抗运行脚本。
- `scripts/run-selling-houses-lab.ts`
  - 实验入口。
