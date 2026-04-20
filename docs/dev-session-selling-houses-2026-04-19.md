# 卖房工作台 4 小时并行开发总控计划

最后更新：2026-04-20

这份文档是这轮 video coding 的总控台。

目标不是继续空谈架构，而是把下面 5 件事定死：

1. 现在代码和文档真实对齐到了哪里。
2. 哪些东西这轮能改，哪些不能碰。
3. 主线程先串行做什么。
4. 什么时候可以起 3 个并行线程。
5. 每 30-40 分钟怎么合并、怎么验收、怎么继续。

这个线程就是总线程。后续子线程只接受本文件和 `docs/dev-session-thread-briefs.md` 的任务边界。

---

## 0. 当前基线

当前项目主目录：

```text
/Users/jiaqi/Documents/开放日测算
```

### 0.1 已验证结果

2026-04-20 当前已重新跑过：

```bash
npm run lint
npm run build
npm run verify:maintainer
npm exec tsx scripts/verify-selling-houses-projections.ts
npm exec tsx scripts/verify-selling-houses-shell.ts
npm run selfplay:golden
vercel build
```

结果：

- `lint` 通过
- `build` 通过
- `verify:maintainer` 通过
- `verify-selling-houses-projections.ts` 通过
- `verify-selling-houses-shell.ts` 通过
- `selfplay:golden` 通过
- `vercel build` 通过
- golden 当前结果：`90 分 / 5 套成交 / 0 套在场 / 0 套撤回`

### 0.2 已验证本地链路

本地 dev 已重新预演：

```text
@ke.com trusted bypass 登录
  -> Hub
  -> /seller
  -> 难度选择
  -> 进入局内工作台
```

当前确认：

- `yangjiaqi015@ke.com` 本地可免验证码进入
- Hub 能展示 5 个 workspace
- `/seller` 可进入难度选择
- 标准局可进入卖房工作台
- seller 顶部已有 `排行榜` 入口
- `结果`、`我`、`排行榜` 入口已重新过一遍浏览器烟测，当前都能正常打开
- `客户` 已重新过浏览器烟测，当前能区分“见过面 / 接上话的机会”和“潜在人群”
- `市场` 已重新过浏览器烟测，当前是局内市场总览 + 雷达 / 行情 / 竞对入口
- `复盘` 已改为读取 `ReviewProjection`，主结构是关键转折、客户变化、昨日简报和周度沉淀
- `结果` / `排行榜` 已补充“本局正式结算”和“跨局对比”的边界文案
- 当前浏览器里的 2 条 console error 仍是未登录时 `GET /api/auth?mode=me -> 401` 的会话探测噪音，不是 seller 新回归

### 0.3 已确认部署状态

本地已确认：

```bash
command -v vercel
cat .vercel/project.json
vercel build
```

结果：

- 当前 Vercel 项目仍然是 `ai-model-sabrina`
- `.vercel/project.json` 指向的 project id 仍然有效
- `vercel build` 可以在本地完整产出 `.vercel/output`
- 说明这套项目现在不是“没接上部署”，而是部署链路本身可用

### 0.4 本轮顺手修掉的真实问题

已修：

- `server.ts` 开发环境不再默认强绑 HMR 端口 `24700`

原因：

- 之前如果本机已有别的 Vite/HMR 进程占用该端口，浏览器会一直报 websocket 红错
- 这会污染 video coding 期间的判断，容易把“开发环境噪音”误判成页面真实错误

### 0.5 当前仍存在的已知噪音

这些不是本轮阻塞，但必须知道：

- 未登录时首页会出现 `GET /api/auth?mode=me -> 401`
  这是会话恢复探测，不是主故障。
- seller 开局时如果云端 scenario catalog 访问失败，会有 warning，然后 fallback 到内置剧本。
  这说明本地可玩不依赖云端剧本库，但说明云端连通性不是完全稳定。
- 直接在 shell 里跑 `tsx ...` 不一定可用，命令请优先用 `npm run ...` 或 `npm exec tsx ...`。

---

## 0.6 这轮 CR 的统一结论

这轮把代码、文档、运行链路都重新过了一遍后，当前统一结论是：

1. 设计主张已经成型，尤其是 `Projection`、信息架构、游戏层和局内层边界都已经写清楚。
2. 代码里最重的债，不在“功能不存在”，而在“页面判断还没完全收进 projection、壳层还太重、`useGame.ts` 还过大”。
3. 这轮最值钱的活，不是硬重写 `World / Matter / Deal`，而是把壳层、projection、3 个 UI 面和验证闸门收稳。
4. 账号 / 玩家 / 局 / 结果 / 榜单的正式主键链仍然是最大后端缺口，但这轮只登记，不硬改 schema。
5. 部署链路是通的；真正高风险的是环境变量、激活 key、scenario 仓库依赖 DB、以及把本地 preview 当成线上。

---

## 1. 现在的真实判断

当前不是“从零开始做卖房游戏”。

当前真实状态是：

1. 文档主张已经明显领先于代码。
2. 代码里 seller 已经可以玩、可以结算、可以上榜。
3. 但整体仍以 `GameState` 为中心，不是完整 `World / Relation / Matter / Event / Deal` 终态架构。
4. 所以这轮最佳切口不是“硬重构底层”，而是：

```text
先把壳层、信息架构、projection、结果表达、排行榜闭环做稳
同时把不能碰的后端边界守住
```

一句话：

> 这轮做“像一个可信的经营工作台”，不做“把最终架构一次性写完”。

---

## 2. 这轮严格不做什么

这轮不做：

1. 不重写完整 `World / Matter / Deal` 引擎。
2. 不迁移 `GameState` 主结构。
3. 不大改 `domain/models.ts`。
4. 不动 Neon schema。
5. 不重做账号、玩家、局、得分正式拆模。
6. 不改认证主逻辑、白名单逻辑、环境变量。
7. 不把“经营好商圈 / 做最理性的业主”从占位页推进成真实玩法。

如果线程里有人开始动这些，直接视为越界。

---

## 3. 本轮最关键的设计-实现偏差

这是本轮最值得解决的偏差，不补齐会拖慢后面所有开发。

### P1. `SellingHousesWorkspace.tsx` 仍然太重

位置：

- `src/selling-houses/SellingHousesWorkspace.tsx:51-192`
- `src/selling-houses/SellingHousesWorkspace.tsx:832-1060`

问题：

- 壳层、导航、资源抽屉、toast、排行榜弹层、结果页、我页都塞在一个文件里
- `results` / `profile` 仍走内联面板，不是和 F3 一样的独立 feature 边界

影响：

- 并行开发容易互相踩
- “结果 / 我 / 壳层状态”会继续分叉

### P1. `useGame.ts` 同时承担运行、存档、云同步、榜单加载、开局

位置：

- `src/selling-houses/application/useGame.ts:45-314`

问题：

- 启动、恢复、local save、cloud save、conflict fallback、leaderboard load、动作执行都在一个 hook

影响：

- 本轮如果不先冻结它的边界，UI 线程很容易顺手把应用层越改越重
- 多处保存触发点会增加写放大和竞态排查成本，但这轮不在这里动手术

### P1. Dashboard 仍然有大量页面内业务判断

位置：

- `src/selling-houses/ui/features/Dashboard.tsx:35-87`

问题：

- 页面还在直接从 `state`、`marketIntel`、`customerEngine` 拼很多“今天该看什么”的判断
- 没有完全收束到 projection

影响：

- 信息架构和 projection 架构会继续漂移

### P1. Cases 页面仍然是“单文件大而全”

位置：

- `src/selling-houses/ui/features/Cases.tsx:59-150`

问题：

- 列表筛选、详情、动作可用性、策略选项、客户机会排序、事项表达都混在一起

影响：

- 房源页继续很难拆
- 以后 Matter、业主、机会更细时会先在这里炸开
- 当前大量判断和解释文案留在 UI 层，不利于并行开发

### P1. Review 页已经进入“关键转折投影”，但解释深度还只是第一版

位置：

- `src/selling-houses/application/projections/reviewProjection.ts`
- `src/selling-houses/ui/features/Review.tsx`

当前状态：

- 已新增 `buildReviewProjection`
- `Review.tsx` 不再直接拼 `weeklyReviews`
- 页面已经能展示关键转折、客户变化、昨日简报、周度沉淀

剩余差距：

- 现在仍是基于现有 `eventStore` 的轻量排序和解释
- 还不是完整 Matter / Deal / Relation 因果链

### P1. session 恢复和 workspace 切换责任仍然分散

位置：

- `src/App.tsx`
- `src/hooks/useAppSession.ts`

问题：

- 虽然 workspace slug 映射已经收回 `workspaceRegistry`
- 但 `App.tsx` 和 `useAppSession.ts` 仍然共同负责路径恢复、会话恢复和 workspace 切换
- 这部分责任边界还可以继续收紧

影响：

- 继续加 workspace 或调整登录跳转时，仍然容易在这两处发生状态漂移

### P2. Opportunities 页面已经收进 projection，后续只补更细机会解释

位置：

- `src/selling-houses/application/projections/operatingProjection.ts`
- `src/selling-houses/ui/features/Opportunities.tsx`

当前状态：

- 已新增 `buildOpportunityListProjection`
- 客户页已按“见过面 / 接上话的机会、成交线索、流失风险、潜在人群”分层
- `marketSignals` 已经从页面直接读取迁到 projection

剩余差距：

- 客户页仍消费现有 `Opportunity` 结构
- 后续 `CustomerCaseRelation` 化后需要再升级投影输入

### P2. seller 开局时云端剧本库失败会先报 400 warning 再 fallback

来源：

- 本地浏览器预演日志
- `src/selling-houses/application/scenarioOpening.ts:92-107`
- `src/selling-houses/interfaces/http/sellingHousesScenarioHandlers.ts:8-23`

问题：

- fallback 是对的
- 但 warning 噪音和 400 会干扰对真实页面故障的判断

影响：

- video coding 期间控制台不够干净
- 它会污染 smoke 判断，但不是当前的主功能故障

### P1. 账号体系和游戏存档体系还没有真正解耦

位置：

- `src/selling-houses/application/cloudState.ts`
- `src/selling-houses/application/useGame.ts`
- `src/selling-houses/interfaces/http/maintainerRunHandlers.ts`
- `docs/platform-account-player-run-score-architecture.md`

问题：

- 当前 run 的主键链路仍然是 `accountEmail -> localStorage userId -> run`
- leaderboard 聚合仍按当前游戏内 `userId` 走，不是正式 `accountId / playerProfileId`

影响：

- 设计文档里的四层边界已经写清，但实现还没真正落库
- 如果这轮继续只做 UI，不把这条记成头号后端缺口，后面会越拖越大

结论：

- 这轮登记为后端第一优先级债务
- 本轮不动 schema，不在 video coding 里强行拆主键体系

---

## 4. 本轮分层边界

所有需求先按层判断：

```text
L0 总控层
  计划、CR、集成、预演、部署判断

L1 前端表现层
  SellingHousesWorkspace
  Dashboard / Cases / Opportunities / Market / Review / Result / Leaderboard

L2 应用投影层
  application/projections/*
  followUpPriority / marketIntel / useGame 编排

L3 局运行层
  GameState
  domain/engine

L4 持久化与接口层
  cloudClient
  maintainer handlers
  repository

L5 纯后端能力层
  账号、玩家、局、正式成绩、生涯、榜单长期结构
```

本轮规则：

- L1 可以大改
- L2 可以补强
- L3 只做小修
- L4 原则冻结
- L5 只做设计，不落库

补充冻结说明：

- `src/selling-houses/domain/engine/*`
- `src/selling-houses/domain/engine.ts`
- `src/selling-houses/domain/models.ts`
- `src/selling-houses/application/gameState.ts`
- `src/selling-houses/application/cloudState.ts`
- `src/selling-houses/infrastructure/cloudClient.ts`
- `src/selling-houses/interfaces/http/*`
- `src/selling-houses/infrastructure/*Repository*.ts`

除非本轮切成专项回归线程，否则这些区域不要和 UI 线程混改。

---

## 5. 串行前置：主线程先做什么

在起 3 个并行线程之前，主线程先串行完成下面这些动作。

### 5.1 已完成

已完成：

1. 通读主干文档
2. CR 核心实现文件
3. 跑基线命令
4. 看 Vercel 当前项目状态
5. 跑本地 smoke
6. 修 dev HMR 固定端口问题

### 5.2 起线程前仍要坚持的规则

主线程继续负责：

1. 保持 `SellingHousesWorkspace.tsx` 壳层 ownership
2. 冻结 `domain/models.ts`
3. 冻结 `interfaces/http/*`、`infrastructure/*`
4. 冻结 `lib/auth.ts`、`.env*`、`.vercel/*`
5. 每收一个线程就先 CR，再合并

---

## 6. 什么时候起 3 个并行线程

正确顺序不是一开始就 3 线程乱冲。

正确顺序：

```text
主线程串行锁边界
  ->
线程 T1 先把壳层/投影接缝立住
  ->
再起 T2、T3 并行做两个 UI 面
```

原因：

- 如果 T1 不先把壳层和 projection 接缝定住
- T2/T3 很容易直接在页面里各自发明一套业务判断

---

## 7. 本轮线程模型

这轮推荐模型是：

```text
主线程
  我来做：
  总控 / CR / 集成 / backend gate / smoke / deploy check

线程 T1
  壳层 + 应用投影层 + seller 页面接缝

线程 T2
  经营概览 + 房源 + 客户

线程 T3
  市场 + 复盘 + 结果 + 排行榜
```

### 主线程负责

负责文件：

- `src/selling-houses/SellingHousesWorkspace.tsx`
- `src/selling-houses/application/useGame.ts`
- `server.ts`
- `src/hooks/useAppSession.ts`
- `src/workspaces/workspaceRegistry.tsx`
- `docs/dev-session-selling-houses-2026-04-19.md`
- `docs/dev-session-thread-briefs.md`
- `docs/dev-session-selling-houses-gap-audit-2026-04-20.md`

主线程职责：

1. 继续收敛壳层边界
2. 守后端和部署边界
3. 审每个线程的 diff
4. 合并后统一验收

### 线程 T1：壳层接缝与 Projection

负责文件：

- `src/selling-houses/application/projections/*`
- `src/selling-houses/ui/features/followUpPriority.ts`
- `src/selling-houses/ui/features/marketIntel.ts`
- 如总线程批准，可改 `SellingHousesWorkspace.tsx` 的少量接缝

目标：

1. 把页面真正该吃的 projection 收进去
2. 让 `results / review / market / dashboard / opportunities` 尽量少直接读原始 state 做判断
3. 给 T2/T3 提供稳定喂数面

### 线程 T2：经营概览 + 房源 + 客户

负责文件：

- `src/selling-houses/ui/features/Dashboard.tsx`
- `src/selling-houses/ui/features/Cases.tsx`
- `src/selling-houses/ui/features/Opportunities.tsx`

目标：

1. 把经营概览做成真实经营台
2. 把房源页做成“主矛盾 + 业主 + 准客池 + 事项”
3. 把客户页做成“见面机会 / 潜在人群”双层结构

### 线程 T3：市场 + 复盘 + 结果 + 排行榜

负责文件：

- `src/selling-houses/ui/features/Market.tsx`
- `src/selling-houses/ui/features/Review.tsx`
- `src/selling-houses/ui/features/ResultOverlay.tsx`
- `src/selling-houses/ui/features/LeaderboardOverlay.tsx`

目标：

1. 把市场页做成全局雷达入口
2. 把复盘页变成“关键转折”而不是流水账
3. 让结果页和排行榜彻底站稳“正式结算”边界

---

## 8. 合并顺序

推荐合并顺序：

1. 先合 T1
2. 再合 T2
3. 最后合 T3

理由：

- T1 是喂数层和接缝层
- T2/T3 都依赖它

每次合并后至少跑：

```bash
npm run lint
```

全部合完后必须跑：

```bash
npm run lint
npm run build
npm run verify:maintainer
npm exec tsx scripts/verify-selling-houses-projections.ts
npm exec tsx scripts/verify-selling-houses-shell.ts
npm run selfplay:golden
vercel build
```

然后再跑一轮浏览器 smoke。

---

## 9. 每 30-40 分钟检查什么

### Checkpoint A：线程启动后 30 分钟

看：

1. 有没有越界碰 `domain/models.ts`
2. 有没有两个线程同时改同一个大文件
3. 有没有把页面建议写回 state

### Checkpoint B：线程启动后 60-80 分钟

看：

1. T1 的 projection 接缝是否稳定
2. T2/T3 是否还在大量直接读 raw state
3. 页面文案是否还带 AI/后台味

### Checkpoint C：合并前

看：

1. 结果和排行榜有没有混淆“局内”和“游戏层”
2. review 是否有关键转折结构
3. dashboard 是否真能回答“今天先干啥”
4. 是否有人顺手碰了 `useGame.ts`、`cloudState.ts`、`interfaces/http/*`

### Checkpoint D：准备部署前

看：

1. `vercel build` 是否通过
2. Preview/Production 的 env 是否齐
3. `/api/*` 的鉴权和激活 key 是否还一致
4. 是否误把 `npm run preview` 当成了完整线上链路验证

---

## 10. 本轮验收门禁

通过门禁才算这轮可继续。

### 10.1 代码门禁

必须：

- `lint` 通过
- `build` 通过
- `verify:maintainer` 通过
- `verify-selling-houses-projections.ts` 通过
- `verify-selling-houses-shell.ts` 通过
- `selfplay:golden` 通过
- `vercel build` 通过

### 10.2 浏览器门禁

至少走完：

```text
登录
  -> Hub
  -> /seller
  -> 难度选择
  -> 标准局
  -> 经营概览
  -> 房源
  -> 客户
  -> 市场
  -> 复盘
  -> 排行榜
```

不得出现：

- 白屏
- 导航死路
- 结果页崩
- 排行榜崩
- `NaN`

### 10.3 边界门禁

不得出现：

- 改 `domain/models.ts`
- 改认证主逻辑
- 改云端契约
- 为了页面方便改 repository / handler

---

## 11. 4 小时推进节奏

建议按下面这个顺序跑，而不是 3 个线程一上来就散开。

### Phase 0：20 分钟

主线程做：

1. 拉最新代码和文档
2. 重跑最小基线：`npm run lint`、`npm run verify:maintainer`
3. 确认冻结区和 ownership

### Phase 1：40 分钟

先只开 T1。

目标：

1. 稳住 projection 边界
2. 明确壳层只做壳层
3. 给 T2/T3 一个稳定的喂数面

### Phase 2：90 分钟

在 T1 接缝稳定后，同时开 T2 和 T3。

目标：

1. T2 收 `经营概览 + 房源 + 客户`
2. T3 收 `市场 + 复盘 + 结果 + 排行榜`
3. 主线程专门做 CR、冲突协调和回归

### Phase 3：50 分钟

按 `T1 -> T2 -> T3` 的顺序合并。

每次合并后至少跑：

```bash
npm run lint
```

全部合完后跑完整门禁。

### Phase 4：40 分钟

主线程做最终 smoke 和部署判断：

1. 登录 -> Hub -> `/seller`
2. 开一局
3. 经营概览 / 房源 / 客户 / 市场 / 复盘 / 排行榜 全走一遍
4. 如果门禁全绿，再决定要不要发 Preview

---

## 12. 这一轮可以直接发车的结论

现在已经可以正式开干。

最稳节奏是：

```text
主线程继续控壳层和验收
T1 先接 projection
T2、T3 再平行做两块 UI
```

如果只给 4 小时，这就是当前最优切法。
