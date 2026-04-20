# 卖房工作台总审计与迭代总图

最后更新：2026-04-20

这份文档是本轮总线程的统一口径。

它把 3 类信息收进一份：

1. 当前代码和运行链路已经做到哪里。
2. 设计和实现还没有契合的地方。
3. 接下来 video coding 应该按什么顺序推进，哪些能改，哪些先冻结。

如果本文件与分散讨论冲突，以本文件为准。

---

## 0. 结论先说

当前卖房工作台不是“还没做出来”。

当前真实状态是：

- 已经有可玩的单局经营闭环。
- 已经能正式结算、上榜、复盘。
- 主要问题不在“功能不存在”，而在“壳层过重、页面判断没收进 projection、设计语义领先于代码结构”。

所以这轮最对的策略不是重写底层。

而是：

```text
先稳壳层
  -> 先稳 projection
  -> 再收经营概览 / 房源客户 / 市场结果
  -> 最后统一回归验证
```

---

## 1. 当前基线

### 1.1 已确认的正向结果

当前已经确认成立的东西：

1. 统一入口和 workspace registry 已经配置化，不再靠 `App.tsx` 硬写。
2. seller 已经具备局内导航、排行榜入口、结果浮层、市场入口、复盘入口。
3. `/seller` 深链和白名单直登链路已打通，本地烟测可直接进入局内。
4. `ResultOverlay`、`LeaderboardOverlay`、`ReviewProjection`、`OpportunityListProjection` 已经说明 projection 架构不是停留在文档里。
5. 当前能从开局走到经营、日结、正式结算和榜单查看。

### 1.2 本地验证基线

这轮开始前已通过：

- `npm run lint`
- `npm run build`
- `npm run verify:maintainer`
- `npm exec tsx scripts/verify-selling-houses-projections.ts`
- `npm exec tsx scripts/verify-selling-houses-shell.ts`
- `npm run selfplay:golden`
- `vercel build`

golden 基线：

- 总分 `90`
- 成交 `5`
- 在场房源 `0`
- verdict `主循环已经成立`

### 1.3 部署基线

当前 Vercel 项目仍然接在：

- project name: `ai-model-sabrina`
- project id: `prj_hBpVrrCaKJIygM7Gw1g7dbUaUo6A`

本地 `vercel build` 可成功产出 `.vercel/output`，说明部署链路是通的。

---

## 2. 设计与实现的主要偏差

### P1. seller 壳层还没有真正变成壳层

位置：

- `src/selling-houses/SellingHousesWorkspace.tsx`

问题：

- 同时负责导航、壳层状态、资源条、资源抽屉、toast、排行榜开关、结果浮层、日结浮层。
- 还承担了一批经营摘要拼装逻辑。

影响：

- 并行开发时最容易冲突。
- 任何新页面或新说明都容易继续塞回壳层。

本轮处理策略：

- 不大拆路由和应用层。
- 先把资源条和资源抽屉相关派生数据抽到 projection。

### P1. `useGame.ts` 仍然过重

位置：

- `src/selling-houses/application/useGame.ts`

问题：

- 开局、恢复、云同步、冲突回退、榜单加载、动作执行、推进日期都在同一个 hook。

影响：

- UI 层一旦越界，就会碰到存档和榜单。

本轮处理策略：

- 冻结，不动。
- 需要的数据通过 projection 喂给页面。

### P1. Dashboard / Cases 仍有大量页面内经营判断

位置：

- `src/selling-houses/ui/features/Dashboard.tsx`
- `src/selling-houses/ui/features/Cases.tsx`

问题：

- “今天先做什么”“房源主矛盾是什么”“风险怎么排”这些判断仍有相当一部分在页面里做。

影响：

- 跟 projection 架构持续漂移。
- 页面越改越像临时拼出来的业务页。

本轮处理策略：

- 先把壳层接缝收干净。
- 下一批优先把 Dashboard/Cases 的喂数继续收进 projection。

### P1. 账号 / 玩家 / 局 / 榜单 主键链还没有正式解耦

位置：

- `src/selling-houses/application/cloudState.ts`
- `src/selling-houses/application/useGame.ts`
- `src/selling-houses/interfaces/http/*`
- `docs/platform-account-player-run-score-architecture.md`

问题：

- 当前仍主要依赖游戏内 `userId` 和 local storage 口径。
- 还不是设计文档里的 `account -> player -> run -> runResult -> leaderboardEntry` 正式链路。

影响：

- 后续做跨游戏生涯、赛季、统一榜单时会越来越难收。

本轮处理策略：

- 只登记，不改 schema。
- 作为后端第一优先级专项保留。

### P1. 架构文档主张已领先于代码结构

主要体现在：

- `Projection 不反写世界`
- `Matter 是玩法单位`
- `Opportunity 终态应是 Customer × Case Relation`
- `Deal 应该独立成事实层`
- `EventStore 应该成为复盘与结算解释的主线`

当前代码只做到了一部分投影和一部分事件化，还没进到完整对象层。

这不是这轮的失败，而是这轮的边界。

---

## 3. 本轮冻结区

本轮默认冻结：

- `src/selling-houses/domain/models.ts`
- `src/selling-houses/domain/engine/*`
- `src/selling-houses/domain/engine.ts`
- `src/selling-houses/application/useGame.ts`
- `src/selling-houses/application/gameState.ts`
- `src/selling-houses/application/cloudState.ts`
- `src/selling-houses/infrastructure/*`
- `src/selling-houses/interfaces/http/*`
- `lib/auth.ts`
- `.env*`
- `.vercel/*`

原则：

- 可以登记问题，不在这一轮 video coding 里重构这些区域。
- UI 需求不要反向逼着去改高风险区。

---

## 4. 本轮安全改造顺序

### 第一刀：壳层 projection 化

目标：

- 让 `SellingHousesWorkspace.tsx` 不再自己计算资源条和资源抽屉摘要。

落点：

- 新建 `src/selling-houses/application/projections/workspaceShellProjection.ts`
- 壳层只负责消费 projection 和管理开关状态

为什么先做：

- 安全。
- 收益大。
- 不碰后端和局运行层。
- 能直接给后续 Dashboard / Cases / Market 的拆分打底。

### 第二刀：经营概览 / 房源 的页面判断继续下沉

目标：

- 让 `Dashboard.tsx`、`Cases.tsx` 更像吃 projection 的表现层。

优先级：

1. Dashboard
2. Cases
3. Opportunities

### 第三刀：市场 / 复盘 / 结果 三个“后判断面”继续收口

目标：

- 市场更像全局雷达入口。
- 复盘更像关键转折页。
- 结果和排行榜把“正式结算 / 跨局对比”边界继续压实。

---

## 5. 后端专项 backlog

这些不在本轮做，但必须保持可见：

### 5.1 账号与玩家主键链重构

目标：

- 明确 `accountId / playerId / runId / runResultId / leaderboardEntryId`

### 5.2 成交独立事实层

目标：

- 从机会推进里抽出正式 `deal fact`
- 能回答“哪套房成交了、谁的房源端、谁的客源端、是不是联卖”

### 5.3 Matter / Interaction / Campaign 对象层

目标：

- 让事项成为运行时一等公民，而不是只存在于文档和部分 shadow 表语义里

### 5.4 EventStore 作为可解释主线

目标：

- 复盘、结果解释、新闻和关键转折都从统一事件事实链出发

### 5.5 Good House / Price / Competition 独立模型输出

目标：

- 从“散落在字段和规则里的判断”升级成可复算、可解释、可映射页面的模型输出

---

## 6. 产品验收门与工程验收门

这轮以后，不能只看工程脚本通过。

还要同时过产品验收门。

### 6.1 产品验收门

必须至少回答清楚：

1. 经营概览能不能一眼回答“今天先做什么”。
2. 房源页能不能回答“这套房现在怎么打”。
3. 客户页能不能分清“见面机会”和“潜在人群”。
4. 市场页能不能站住全局入口，而不是零散情报页。
5. 复盘页是不是优先讲关键转折，而不是流水堆叠。
6. 结果和排行榜有没有混淆局内过程分与正式结算。

### 6.2 工程验收门

每一批代码合并前，至少跑：

- `npm run lint`
- `npm run build`
- `npm run verify:maintainer`
- `npm exec tsx scripts/verify-selling-houses-projections.ts`
- `npm exec tsx scripts/verify-selling-houses-shell.ts`
- `npm run selfplay:golden`
- `vercel build`

---

## 7. 4 小时 video coding 的主线建议

主线程职责：

1. 守 scope
2. 守冻结区
3. 集成安全切片
4. 跑完整验证
5. 统一文档口径

并行线程职责建议：

- T1：projection / shell seam
- T2：Dashboard / Cases / Opportunities
- T3：Market / Review / Result / Leaderboard

合并顺序：

```text
T1
  ->
T2 / T3
  ->
主线程统一回归
```

如果并行线程不可用，主线程仍按同样顺序串行推进。

---

## 8. 本轮完成标准

本轮如果做到下面这些，就已经是一次高价值迭代：

1. seller 壳层明显变薄。
2. 资源条和资源抽屉不再自己拼业务摘要。
3. Dashboard / Cases / Market 的下一轮切口被总审计文档和 projection 接缝明确下来。
4. 完整验证重新通过。
5. 文档、代码、验证三者重新对齐。

一句话：

> 这轮的目标不是把终态架构一次写完，而是把“已经可玩的版本”收成一个可持续迭代的经营工作台。
