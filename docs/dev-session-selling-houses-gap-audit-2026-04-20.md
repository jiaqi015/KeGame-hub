# 卖房工作台代码审计与偏差清单

最后更新：2026-04-20

这份文档只回答一件事：

> 当前卖房代码，和我们已经定下来的设计主张，哪里还没有真正契合。

它不是最终架构文档。
它是本轮 video coding 的切口文档。

---

## 0. 本轮已经确认的正向结果

先说好的部分。

当前已经成立的东西：

1. Hub + workspace registry 已经配置化，新增 workspace 不再回到 `App.tsx` 写死。
2. seller 顶部导航、排行榜入口、结果浮层、市场页一级结构已经具备。
3. `ResultOverlay.tsx` 和 `LeaderboardOverlay.tsx` 已经明显走向 projection 驱动。
4. `/seller` 深链路不再首屏回弹到 `/`，白名单免验证码登录可以直接进入 seller 开局页。
5. `结果`、`我`、`排行榜` 三个入口已经过本地浏览器烟测，当前能正常打开。
6. `verify:maintainer`、`selfplay:golden`、`build` 通过，说明卖房主循环没有被最近几轮 UI 迭代打坏。
7. `客户` 页已经收进 `buildOpportunityListProjection`，并能区分见过面机会、成交线索、流失风险和潜在人群。
8. `市场` 页已经补成局内市场总览，入口分为雷达、行情、竞对，并明确不混跨局结果。
9. `复盘` 页已经收进 `buildReviewProjection`，不再只是周复盘流水。
10. `结果` 和 `排行榜` 已补充“本局正式结算 / 跨局对比”的边界表达。

一句话：

> 现在不是“卖房还没做出来”，而是“已经做出来一个可玩的版本，但壳层和页面职责还没收干净”。

---

## 1. Findings

### [P1] 壳层还没有彻底变成壳层

位置：

- `src/selling-houses/SellingHousesWorkspace.tsx:146-181`
- `src/selling-houses/SellingHousesWorkspace.tsx:832-1060`

问题：

- seller 仍然由 `SellingHousesWorkspace.tsx` 统一负责视图切换、资源抽屉、消息、排行榜抽屉和日结浮层
- `results` / `profile` 虽然已经抽成 feature 文件，但壳层仍然知道太多页面级细节
- 市场入口层、资源详情抽屉、排行榜开关和顶栏动作都还耦在一个文件里

影响：

- 后续继续并行开发时，seller 壳层仍然最容易发生冲突
- 页面边界虽然比之前清楚，但壳层仍不够稳定，后面很难继续细拆

建议：

- 本轮先不大拆，但要把这两块从“内联语义”收成稳定边界
- 下一轮再决定是否完全独立成 feature 文件

### [P1] `useGame.ts` 过重，线程间很容易越界

位置：

- `src/selling-houses/application/useGame.ts:45-314`

问题：

- 开局、恢复、云同步、leaderboard、选择房源、推进日期、执行动作都在这个 hook

影响：

- UI 线程一旦为了拿数据方便顺手改这里，就会碰到保存、同步、榜单

建议：

- 本轮主线程守住 `useGame.ts`
- 子线程通过 projection 喂数，不直接改这个 hook

### [P1] Dashboard 仍然在页面里做大量经营判断

位置：

- `src/selling-houses/ui/features/Dashboard.tsx:35-87`

问题：

- 页面里还在直接拼：
  - 今日先看
  - 客户态势
  - 风险概览
  - 首页情报逻辑

影响：

- 和 `selling-houses-projection-architecture.md` 持续漂移
- 后面越改越难统一

建议：

- 本轮由 T1 把 dashboard 真正依赖的摘要进一步收进 projection
- T2 只负责表现，不再扩 raw state 判断

### [P1] Cases 页仍然承担过多职责

位置：

- `src/selling-houses/ui/features/Cases.tsx:59-150`

问题：

- 房源筛选
- 主矛盾判断
- 动作可用性
- 策略弹窗
- 客户机会整理
- 事项表达

都在一个文件里

影响：

- 房源页很难继续精细设计
- 任何“业主 / 客户 / Matter / 竞品”变化都会先撞到这个文件

建议：

- 本轮先拆“喂数”和“表现”
- 不在 Cases 页再新加大块业务判断

### [P1] Review 页已经是“关键转折页”第一版，后续要补因果深度

位置：

- `src/selling-houses/application/projections/reviewProjection.ts`
- `src/selling-houses/ui/features/Review.tsx`

当前状态：

- 已新增 `buildReviewProjection`
- 页面已经按关键转折、客户变化、最近变化、昨日简报、周度沉淀组织
- 浏览器烟测可打开

剩余差距：

- 现在的关键转折仍然是基于 `eventStore` 的排序与轻解释
- 等 Matter / Deal / Relation 完整落地后，要把“为什么发生”讲得更细

建议：

- 继续保持投影边界，不把复盘解释写回 state
- 下一轮再补“事件 -> 事项 -> 结果”的因果链

### [P1] 路由与权限映射仍有手写分叉

这条旧问题已经过时。

当前状态：

- `src/hooks/useAppSession.ts` 已经改为使用 `workspaceRegistry` 暴露的 `normalizeWorkspacePathname` 和 `resolveAllowedWorkspaceFromPathname`
- `/seller` 深链 + 白名单登录链路已通过本地浏览器实测

现在真正还剩的不是“手写路由映射”，而是：

- session 恢复逻辑仍然分散在 `App.tsx` 和 `useAppSession.ts`
- 路由、会话恢复和 workspace 切换的责任边界还可以再收紧

### [P2] Opportunities 页已关进 projection，后续等 Relation 化再升级

位置：

- `src/selling-houses/application/projections/operatingProjection.ts`
- `src/selling-houses/ui/features/Opportunities.tsx`

当前状态：

- 页面不再直接读取 `state.marketShadow.marketSignals`
- 已通过 `buildOpportunityListProjection` 输出 `met / potential / closing / atRisk / signalCards`
- 浏览器烟测可打开，并能表达“客户机会不是一回事”

剩余差距：

- 底层仍是现有 `Opportunity` 对象，不是最终 `CustomerCaseRelation`
- 后续 Customer / Relation 建模完成后，需要替换 projection 输入

建议：

- 短期不要继续往页面里加 raw state 判断
- 新需求先加投影字段，再让页面消费

### [P2] seller 剧本目录的云端失败噪音还在

来源：

- 本地预演 console
- `src/selling-houses/application/scenarioOpening.ts:92-107`

问题：

- 云端 scenario catalog 失败会 warning
- 页面会 fallback 到内置剧本，功能不阻塞

影响：

- 影响 video coding 期间的控制台判断

建议：

- 本轮先记录为已知噪音
- 下一轮再单独整理 scenario catalog 的 cloud fallback 口径

### [P1] 账号体系和游戏存档体系还没有真正解耦

位置：

- `src/selling-houses/application/cloudState.ts:19-34`
- `src/selling-houses/application/useGame.ts:36-166`
- `src/selling-houses/interfaces/http/maintainerRunHandlers.ts:8-61`
- `docs/platform-account-player-run-score-architecture.md`

问题：

- 现在 run 的主键链路仍然是 `accountEmail -> 本地 localStorage userId -> run`
- `maintainer userId` 还是浏览器本地生成，不是平台账号层的稳定玩家身份
- leaderboard 聚合也还是按这个游戏内 `userId` 来算，不是显式的 `accountId / playerId`

影响：

- 设计文档里“账号 / 玩家 / 局 / 榜单”四层已经讲清楚，但代码还没真正落成
- 这块如果不先记清楚，后面继续做跨游戏生涯、赛季和总分榜时会越来越难收

建议：

- 本轮继续冻结 schema，不在 video coding 里硬改后端主键体系
- 但要把这条列为后端第一优先级架构缺口，避免 UI 迭代掩盖问题

---

## 2. 本轮最合适的切口

这轮最合适的切口不是“重构底层”。

而是：

1. 收壳层
2. 收 projection
3. 收 3 个 UI 面
4. 守 backend gate

也就是：

```text
壳层和投影稳定
  ->
经营概览 / 房源客户 / 市场结果 三块收口
  ->
最后统一 smoke + build + verify
```

---

## 3. 本轮冻结区

冻结：

- `src/selling-houses/domain/models.ts`
- `src/selling-houses/domain/*` 大迁移
- `src/selling-houses/interfaces/http/*`
- `src/selling-houses/infrastructure/*`
- `lib/auth.ts`
- `.env*`
- `.vercel/*`

本轮如果改这些，收益远小于风险。

---

## 4. 本轮目标定义

本轮做完，至少要达到：

1. 经营概览真的能回答“今天先做什么”
2. 房源页真的能回答“这套房现在怎么打”
3. 客户页真的能区分“见面机会”和“潜在人群”
4. 市场页真的能作为全局入口
5. 复盘页不再只是流水摘要
6. 结果 / 排行榜不再混淆局内和跨局

做到这一步，就已经是一次高价值迭代。
