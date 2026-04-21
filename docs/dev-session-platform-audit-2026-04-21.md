# 平台审计与第一轮改造总控

最后更新：2026-04-21

这份文档是本轮“总架构审查 + 全量代码审查 + 并行开发调度”的主控台。

目标不是继续泛泛讨论，而是把 4 件事定死：

1. 当前哪些资产已经形成了可靠基线。
2. 设计、实现、运行态之间已经证实的不契合点是什么。
3. 第一轮改造到底改什么，不改什么。
4. 3 个并行线程的 ownership、验收、合并顺序是什么。

---

## 0. 当前覆盖边界

### 0.1 已形成基线的资产

已经完成主链审计并形成证据链的对象：

- 平台入口与鉴权
  - `src/App.tsx`
  - `lib/auth.ts`
  - `lib/activation.ts`
  - `src/hooks/useAppSession.ts`
  - `src/services/apiService.ts`
- 工作区注册
  - `src/workspaces/workspaceRegistry.tsx`
  - `lib/workspaces.ts`
- selling-houses 主链
  - `src/selling-houses/application/useGame.ts`
  - `src/selling-houses/application/playerContext.ts`
  - `src/selling-houses/application/cloudState.ts`
  - `src/selling-houses/interfaces/http/maintainerRunHandlers.ts`
  - `src/selling-houses/infrastructure/sellingHousesPlatform.ts`
  - `src/selling-houses/infrastructure/neonGameRunRepository.ts`
- open-day 主链
  - `src/open-day/openDayClient.ts`
  - `modules/open-day/application/openDayAnalysisService.ts`
  - `modules/open-day/infrastructure/openDayPlatform.ts`
  - `modules/open-day/interfaces/http/openDayDisambiguationHandler.ts`
- 运行与部署
  - `package.json`
  - `server.ts`
  - `vercel.json`
  - `api/*.ts`
  - `scripts/send-smtp-test.ts`

### 0.2 已形成基线的设计文档

本轮已作为 canonical 基线使用的文档：

- `docs/selling-houses-total-design.md`
- `docs/selling-houses-master.md`
- `docs/selling-houses-implementation-contracts.md`
- `docs/platform-account-player-run-score-architecture.md`
- `docs/selling-houses-game-boundary-and-settlement-design.md`
- `docs/selling-houses-game-layer-goals-leaderboard.md`
- `docs/open-day-ddd-architecture.md`
- `docs/open-day-phase1-analysis-run-migration.md`
- `docs/open-day-phase2-scenario-versioning.md`
- `docs/open-day-phase3-dataset-profile.md`
- `docs/global-persistence-dba-unified-design.md`

### 0.3 尚未完成的覆盖

以下范围还没有做到“逐篇逐行 CR 完成”，不能当成“全部已审完”：

- `docs/` 全量 56 篇的逐篇一致性清理
- `src/selling-houses/domain/**` 全部子引擎逐文件审计
- `modules/open-day/**` 全 repo 级契约核对
- 所有 UI 页面与信息架构的逐页视觉回归

当前判断是：主链证据已经足够进入第一轮系统性改造，但还不够支撑“项目全量无遗漏完成审计”。

---

## 1. 三条基线

### 1.1 设计基线

当前 canonical 设计已经明确：

- 平台稳定主键是 `Account.accountId`
- workspace 内长期身份主键是 `PlayerProfile.playerProfileId`
- selling-houses 应收敛到
  - `Account -> PlayerProfile -> GameRun -> RunResult -> Leaderboard`
- 榜单只消费正式结算，不消费运行态
- open-day 当前仍处于 `analysis_run / scenario template version / dataset profile` 迁移收口期

### 1.2 实现基线

当前实现已经具备这些稳定骨架：

- 统一入口 `App -> AuthOverlay -> WorkspaceHub -> Workspace`
- 本地开发走 `server.ts`
- 线上部署走 `api/*.ts + vercel.json`
- selling-houses 具备 file fallback 与 Neon 存档
- open-day 具备 storage/cache/upload 多后端适配

### 1.3 运行基线

本轮已实际跑通：

- `npm run lint`
- `npm run build`
- `npm run verify:maintainer`
- `npm run verify:maintainer-cloud-resume`
- `npm run verify:maintainer-identity`
- `npm run verify:generated-maintainer`
- `npx tsx scripts/verify-selling-houses-file-repository.ts`
- `npm run verify:platform-smoke`

说明：

- 主链构建链路是成立的
- selling-houses 身份链、云恢复链、文件仓储链都已有回归验证
- smoke 入口已经可统一覆盖 lint、maintainer verify、identity、cloud-resume、file-repository、projections、generated verify、SMTP dry-run
- 云端 DB 相关链路仍需在带环境变量条件下补预演

---

## 2. Mismatch Ledger

### P0

#### P0-1 selling-houses 身份主键链未完全收口

设计要求：

- `accountId / playerProfileId` 是 canonical 主键链

实现现状：

- 运行态已经明确拆成 `storageScopeKey / accountId / playerProfileId / legacy userId`
- session 场景下后端会强制以 server-derived `accountId` 作为 run owner
- 但 activation-key 兼容链路、repo contract 命名、Neon 物理列名仍保留 legacy `userId`

证据：

- `src/selling-houses/application/useGame.ts`
- `src/selling-houses/application/cloudState.ts`
- `src/selling-houses/interfaces/http/maintainerRunHandlers.ts`
- `docs/platform-account-player-run-score-architecture.md`

风险：

- 后续如果继续把 legacy `userId` 当 owner 主语义扩展，会再次污染 `PlayerProfile / GameRun / Leaderboard`
- 仓储接口与物理表名仍会给后续开发造成“到底谁是主键”的误读

状态：

- 已做第一轮命令层收口：request 层继续兼容 `userId`，command 层统一改成 `runOwnerId`
- 持久化字段与 DB schema 本轮不迁移，仍保留 legacy `userId/user_id`

#### P0-2 文档仍存在 Account/User 双口径并存

设计要求：

- 文档与实现必须围绕同一套主键词表

现状：

- canonical 文档已经切到 `Account/*`
- 多份旧卖房文档仍保留 `userId` 口径

证据：

- `docs/selling-houses-implementation-contracts.md`
- `docs/selling-houses-game-layer-goals-leaderboard.md`
- `docs/selling-houses-game-boundary-and-settlement-design.md`

风险：

- 会继续误导实现沿用 `userId` 作为主身份

状态：

- 主文档已清一轮，但 `docs/` 全量旧文仍未做逐篇一致性清理

#### P0-3 selling-houses 工作台存在“经营记录入口不可达”的真实死区

设计要求：

- 流水日志必须是全局能力，不是某个页面私有能力
- 主工作台需要有稳定入口进入“流水日志 / 经营记录”

实现现状：

- `SellingHousesWorkspace.tsx` 有 `journalOpen` 状态和 `DailyJournal` 抽屉
- 但原实现没有任何 `setJournalOpen(true)` 触发点，导致入口不可达

证据：

- `src/selling-houses/SellingHousesWorkspace.tsx`
- `docs/selling-houses-information-architecture.md`
- `docs/selling-houses-interface-detail-design.md`

风险：

- 流水日志作为“系统信任感底座”的入口失效
- 玩家无法从主工作台回看“今天 / 昨天 / 整局”发生过什么

状态：

- 本轮已修：头部工具栏新增“经营记录”入口，并展示今日记录数量
- 新增验证：`npm run verify:maintainer-shell`

#### P0-4 selling-houses D1 评分仍有旧阶段词表残留，和 canonical 机会阶段口径冲突

设计要求：

- 机会阶段 canonical 口径是
  - `线上咨询`
  - `有意向`
  - `预约首次看房`
  - `已看房`
  - `再次看房`
  - `见面沟通`
  - `出价`
- 成交不再属于机会阶段，而属于独立成交事实

实现现状：

- `scoring.ts` 里 D1 漏斗厚度仍按旧词表解释 `stageIndex`
- 旧注释与旧权重把 `5/6` 写成“谈判 / 成交”，与当前 `OPPORTUNITY_STAGES` 不一致

证据：

- `src/selling-houses/domain/scoring.ts`
- `src/selling-houses/domain/constants.ts`
- `docs/selling-houses-customer-opportunity-architecture.md`
- `docs/selling-houses-good-house-model.md`

风险：

- 页面上机会阶段、D1 解释、后续好房分原因会互相打架
- 后续如果围绕 D1 做更多投影，错误语义会继续扩散

状态：

- 本轮已修：D1 后段权重改为 `已看房 -> 再次看房 -> 见面沟通 -> 出价`
- 新增验证：`npm run verify:maintainer-scoring`

### P1

#### P1-1 鉴权验证码与用户存储仍是进程态

现状：

- `AUTH_USER_STORAGE` 通过 `process.env` 持有用户与验证码状态

证据：

- `lib/auth.ts`

风险：

- 冷启动、多实例、横向扩容下不稳定

说明：

- 这是明确问题，但不进入第一轮大改

#### P1-2 会话 secret 存在 fallback

现状：

- 未配置 `AUTH_SESSION_SECRET` 时存在退化密钥逻辑

证据：

- `lib/auth.ts`

风险：

- 生产安全边界变弱

#### P1-3 open-day run / snapshot 仍是“同 ID 双写”，语义没有真正分开

设计要求：

- `analysis_run` 是一次业务动作
- `snapshot` 是兼容影子，不应与 run 身份完全绑定

实现现状：

- `OpenDayAnalysisService` 当前生成 `runId` 后，返回里同时把 `snapshotId = runId`
- `NeonOpenDaySnapshotRepository.save()` 把同一个 `snapshot.summary.id` 同时写进 `open_day_analysis_runs` 和 `open_day_analysis_snapshots`

证据：

- `modules/open-day/application/openDayAnalysisService.ts`
- `modules/open-day/infrastructure/neonOpenDaySnapshotRepository.ts`
- `docs/open-day-phase1-analysis-run-migration.md`

风险：

- run 与 snapshot 生命周期后续无法真正分化
- phase1 迁移会长期停在“语义上分、实现上没分”

#### P1-4 open-day 路由在 `server.ts` 模式下过度依赖 path 推断 workspace

实现现状：

- `authorizeRequest(req)` 在 requiredWorkspace 缺省时会通过 `inferWorkspaceFromPath(req.path)` 猜测
- open-day express 路由主链没有逐个显式声明 `requiredWorkspace='open-day'`

证据：

- `lib/activation.ts`
- `lib/workspaces.ts`
- `server.ts`

风险：

- 新增路由时容易漏鉴权
- 本地 Express 与 serverless 的权限边界可能继续漂移

状态：

- 本轮已先收一刀：`open-day-disambiguate` handler 改为显式 `authorizeRequest(req, 'open-day')`
- 新增验证：`npm run verify:open-day-auth`
- 其余 open-day express 路由仍待逐条收口

#### P1-5 open-day dataset/profile 画像链存在“静默断链”风险

实现现状：

- 传入 `datasetId` 时不会先验证 dataset 是否真实存在
- `persistDatasetProfile()` 失败会被 catch 吞掉，测算继续返回，但 `datasetProfileId` 可能为空

证据：

- `modules/open-day/application/openDayDatasetService.ts`
- `modules/open-day/application/openDayAnalysisService.ts`
- `modules/open-day/infrastructure/neonOpenDayDatabase.ts`

风险：

- 历史 run 看似有 dataset 归因，实际 profile 链条可能断掉
- phase3 的可追溯性会变成“尽量做到”，而不是真正保证

### P2

#### P2-1 `server.ts` 与 `api/*.ts` 双入口长期漂移风险高

现状：

- 本地 Express 与 Vercel serverless 平行维护

风险：

- 新接口容易只补一边

#### P2-2 selling-houses 信息架构仍未收成“经营工作台三栏骨架”

实现现状：

- 当前是顶部横向导航 + 中央主区
- 右侧洞察/行动与日志入口还没有收成统一骨架
- 首页 / 市场 / 复盘仍有“今日先办”重复一级表达

证据：

- `src/selling-houses/SellingHousesWorkspace.tsx`
- `src/selling-houses/ui/features/Dashboard.tsx`
- `src/selling-houses/ui/features/Market.tsx`
- `src/selling-houses/ui/features/Review.tsx`
- `docs/selling-houses-information-architecture.md`
- `docs/selling-houses-page-responsibility-matrix.md`

风险：

- 用户无法形成稳定的“看局面 / 做动作 / 查因果”心智
- 后续 UI 继续叠功能会越来越散

#### P2-3 selling-houses domain 仍未落地“独立成交引擎 + Matter 沉淀对象 + 纯函数日结主链”

实现现状：

- 成交主要在 `actionResolvers.ts` 的动作里即时判定
- `Matter` 只是从 `schedule/priorities` 派生的事项骨架
- `advanceDays / resolveOneDay` 仍是原地 mutate

证据：

- `src/selling-houses/domain/engine/actionResolvers.ts`
- `src/selling-houses/domain/runtimeState.ts`
- `src/selling-houses/domain/engine.ts`
- `docs/selling-houses-deal-fact-and-closing-model.md`
- `docs/selling-houses-daily-tick-design.md`

风险：

- 领域对象边界继续混杂
- 下一轮想做“可回放 / 可解释 / 可扩展”的日结就会越来越难

状态：

- 本轮已完成第一步收口，但还没有彻底做完
- 成交链：
  - 已把 `DealClosingEvaluation / ClosedDealRecord` 的构建逻辑从 `actionResolvers.ts` 抽到独立模块 `src/selling-houses/domain/dealClosing.ts`
  - `ClosedDealRecord` 已补最小归因与快照字段：`caseTitle/customerName/ownerName/maintainerName/marketSnapshot/priceSnapshot`
  - 已把 `invite-customer-negotiation` 从“动作内立即成交”改为“动作发起价格确认，日结统一落 `ClosedDealRecord`”
  - 相关验证已补强：`scripts/verify-selling-houses-deal-facts.ts`，并接入 `scripts/verify-platform-smoke.ts`
- 日结链：
  - 已新增 `advanceOneDay()`，开始返回最小结构化结果 `DailyTickResult`
  - `GameState` 现已保留 `lastDailyTickResult`，可供后续日志、回放、Matter 生命周期和 UI 投影消费
  - `DailyTickResult` 已补上 `dirtyScopes / invariantAlerts` 最小骨架，并开始承载“本次日结增量结果 + 投影重算入口”的职责
  - `dirtyScopes` 已从最小三项扩展为兼容式实体口径：`cases / opportunities / customers / owners / districts / marketCells / matters`
  - `dirtyScopes.matters` 已按“刚结算的那一天”收口，不再误把下一天的 day 当成事项脏范围判定基准
  - 相关验证已新增：`scripts/verify-selling-houses-daily-tick-contract.ts`，并接入 `scripts/verify-platform-smoke.ts`
- Matter 链：
  - 已把 Matter 派生逻辑从“每次重算生成全新数组”收成带生命周期合并的 `src/selling-houses/domain/matterEngine.ts`
  - 同一 matter 现在可保留 `stage/openedAtDay`，源头消失时会自动结算成 `completed`
  - `invite-customer-negotiation` 发起后，现已可派生出 `scene = negotiation` 的真实事项，并在日结后自动结算
  - 相关验证已新增：`npm run verify:maintainer-matters`
- 仍未完成的部分：
  - Matter 还没有接入完整的 report/diagnose/execute/negotiate 生命周期
  - `advanceDays / resolveOneDay` 虽然已开始产出结构化结果，但仍然是原地 mutate，不是纯函数日结主链

#### P2-2 selling-houses 场景仓储平台选择职责不一致

现状：

- run repo 有 DB/file fallback
- scenario handler 已在无 DB 配置时回退到 builtin scenarios，但 platform resolver 里 `scenario repo` 仍固定为 `NeonScenarioRepository`

证据：

- `src/selling-houses/infrastructure/sellingHousesPlatform.ts`
- `src/selling-houses/interfaces/http/sellingHousesScenarioHandlers.ts`

#### P2-4 验证仍偏脚本化，缺少分层测试入口

现状：

- 目前已经有统一 `verify:platform-smoke`
- 但主链验证仍主要依赖脚本，不是标准化单元/集成测试分层

证据：

- `package.json`
- `scripts/verify-platform-smoke.ts`

状态：

- 本轮已把 `verify:maintainer-shell`、`verify:maintainer-scoring`、`verify:open-day-auth` 并入 smoke 主链
- 但整体仍以脚本回归为主，距离标准化单元/集成测试分层还有距离

### P3

#### P3-1 审计文档里已有部分结论过期，需要持续回写

现状：

- `scripts/send-smtp-test.ts` 已改成默认 dry-run 且必须显式 `--send --to`
- 这说明审计结论本身也需要像代码一样持续回写，否则会混入已失效问题

证据：

- `scripts/send-smtp-test.ts`
- `docs/dev-session-platform-thread-briefs-2026-04-21.md`

#### P3-2 开发端口漂移与脚本说明不足

现状：

- 本机多进程情况下 `npm run dev` 可能漂移端口
- 新同学易误判环境问题为功能问题

---

## 3. 第一轮改造范围

### 3.1 本轮一定做

1. selling-houses 身份链第一轮收口
   - 不做最终 schema 迁移
   - 但要明确区分
     - 平台主身份
     - legacy 本地回退身份
     - storage scope
2. open-day API 一致性补齐
   - 把本地已有的 `/api/open-day-disambiguate` 补成 serverless 可用
3. 工程验证入口与脚本卫生
   - 统一一个更清晰的 smoke/verify 入口
   - 避免测试脚本误发真实邮件

### 3.2 本轮明确不做

1. 不做 `PlayerProfile` 正式落库迁移
2. 不做 selling-houses 全量数据库 schema 重构
3. 不做 auth 持久化改造成正式数据库表
4. 不做全站 UI 大改
5. 不做 open-day phase2/3 全量迁移闭环
6. 不动 `.env*`、`.vercel/*`、线上配置

---

## 4. Execution Board

### 4.1 串行先做

主线程先完成：

1. 固化本轮 canonical 改造边界
2. 固化线程 ownership
3. 固化合并与验证顺序

### 4.2 并行三线程

#### 线程 A：selling-houses 身份链收口

目标：

- 让 authenticated 场景优先围绕 `accountId`
- 把 legacy `userId` 明确降格为 fallback 桥

#### 线程 B：open-day API 一致性

目标：

- 补齐 `/api/open-day-disambiguate`
- 让本地与 serverless 至少在主链能力上对齐

#### 线程 C：工程验证与脚本卫生

目标：

- 统一 smoke/verify 入口
- 让 SMTP 测试脚本更安全
- 提升接手与预演稳定性

---

## 5. 合并顺序

必须按这个顺序合并：

1. 线程 A
2. 线程 B
3. 线程 C
4. 主线程统一回归

原因：

- A 会定义“身份口径”
- B 依赖较少，可独立并入
- C 需要基于前两者最终命令面收口验证

---

## 6. 验证标准

第一轮合并后至少重跑：

- `npm run lint`
- `npm run build`
- `npm run verify:maintainer`
- `npm run verify:maintainer-identity`
- `npm run verify:maintainer-cloud-resume`
- `npm run verify:generated-maintainer`

如 open-day API 改动完成，再补：

- 本地 `npm run dev` 下 `/api/open-day-disambiguate`
- serverless 入口静态检查

如工程脚本改动完成，再补：

- 新增 smoke 命令
- SMTP dry-run 或显式收件人参数验证

---

## 7. 风险板

当前最高风险：

- 误把 legacy `userId` 当 canonical 主键继续扩散
- 误在本轮顺手做大 schema 改造
- 子线程改动越界到共享高风险文件
- 在脏工作树中误碰已有已验证修改

### 禁改区

第一轮默认禁改：

- `.env*`
- `.vercel/*`
- `lib/auth.ts`
- DB schema 相关持久化结构性大改
- selling-houses 全量 domain 建模重写

如果必须突破禁改区，只能由主线程仲裁。
