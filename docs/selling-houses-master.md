# 卖房 Big World 架构总纲

最后整理：2026-05-15

这份总纲是资产顾问玩法的当前架构入口。旧的 6 周小世界路径、世界-视角长论证、2026-04 架构图和阶段报告已经清理，不再作为事实来源。

## 1. 当前判断

资产顾问不是“一个玩家管理几套房”的小状态机，而是一个持续运行的卖房市场。

当前架构目标：

```text
SourceRecord
  → CausalEvent
  → ActorKnowledge
  → belief / pressure
  → Decision
  → Command
  → Receipt
  → RuntimeFeedback
  → Replay
  → ProjectionEnvelope
```

只有接上这条链，才算 Big World。只多生成客户、房源、竞品，或者只改 UI 文案，都不算完成。

## 2. 当前成熟度

当前认可口径见 [母模型迁移工作板](selling-houses-mother-model-agent-workplan.md)：

- 成熟度：`FIVE-X-CITY-MARKET-BIG`
- 规模来源：`src/selling-houses/domain/world-model/bigWorldSpecFactory.ts`
- scale profile：`five-x-city-level-v1`
- scale contract version：`2`

最低规模：

| 维度 | 门槛 |
| --- | --- |
| Market cells | `>= 100` |
| Micro cells | `>= 300` |
| Listings | `>= 4000` |
| Owner priors | `>= 2500` |
| Demand units | `>= 21000` |
| Brokers | `>= 750` |
| ACN networks | `>= 32` |
| Supporting info | `>= 800` |
| Historical transactions | `>= 300` |

## 3. 第一性原理

### 3.1 World 是主体

市场不因为玩家进入才开始运行。业主、客户、同行、商圈、组织、价格和政策都应该在 runtime 中持续演化。

玩家只是其中一个 broker actor 的 POV：

- 玩家能看到的是 actor-visible knowledge。
- 玩家做出的动作必须成为 command。
- command 执行后必须留下 receipt。
- receipt 必须反馈 runtime。

### 3.2 信息先入 SourceRecord

任何信息都不能直接写进 projection：

- 市场变化先进入 `SourceRecord`。
- 玩家动作先进入 action command / receipt。
- 组织干预先进入 organization source。
- 流程结果先进入 process receipt。

然后由 runtime 生成可追溯 causal event。

### 3.3 POV 不能偷看 GlobalTruth

broker POV 只能读：

- actor knowledge
- belief
- pressure
- actor-visible causal refs
- available command
- receipt-backed outcome

不能直接读 hidden truth、完整市场真相、全部 shadow demand、竞品内部策略。

### 3.4 UI 只是 projection

UI 可以表达：

- 排序
- 推荐
- 解释
- 风险
- 机会
- 总结

但 UI 判断必须能回答：

> 谁在第几天，因为看到哪条 source，以什么可信度形成什么 belief，承受什么 pressure，所以建议什么 command，执行后留下什么 receipt，并如何反馈 runtime。

## 4. 当前主链

| 层 | 职责 | 典型文件 |
| --- | --- | --- |
| Scale / bootstrap | 定义城市级市场规模、实体和隐藏真相边界 | `domain/world-model/bigWorldSpecFactory.ts`、`bigWorldBootstrap.ts` |
| Source registry | 收纳市场、客户、业主、组织、流程、动作信息 | `domain/world-model/sourceRegistry.ts` 及相邻文件 |
| Runtime clock | 推进日期、触发市场变化、生成 source / causal | `domain/world-model/runtime/clock.ts` |
| Causal ledger | 记录可追溯因果事件 | `domain/world-model/causalEvents.ts` |
| Actor knowledge | 从 actor POV 过滤世界信息 | `application/projections/actorKnowledgeProjection.ts` |
| Decision | 用 belief / pressure / command 形成推荐 | `application/projections/bigWorldPOVProjection.ts`、strategic projection |
| Receipt | 玩家动作、流程结果、组织动作回灌 runtime | `domain/world-model/runtime/actionReceiptWiring.ts`、`outcomeReceiptCoverage.ts` |
| Replay / gate | 证明同 seed、commands、receipts 可重放 | `scripts/verify-selling-houses-round19-*.ts` |

## 5. 明确拒绝

- 不做 UI 修补冒充架构完成。
- 不接受只多加客户、房源、竞品作为完成。
- 不允许 hidden GlobalTruth 泄露到 broker POV。
- 不允许 `Date.now`、`Math.random`、`fetch`、LLM provider 作为核心模拟真相。
- 不允许 standalone runtime 绿了，但真实 `advanceDays` / `advanceGameDays` 没接上。
- 不允许 gate 里出现 `check(true, ...)`、`|| true` 等软通过。
- 不重写整个游戏，不破坏现有可玩性。

## 6. 文档分工

当前文档只保留三类：

1. 当前主文：本总纲、总设计、母模型工作板、实现合同、信息架构。
2. 专题细化：客户、业主、动作、成交、竞争、组织、Matter、时间、projection、价格、评分等。
3. 平台与持久化：账号、run、score、leaderboard、物理表、DBA 治理。

历史过程文、一次性报告、旧图、阶段迁移说明不再放在主文档体系中。

## 7. 必跑验证

```bash
npm run build
npx tsc --noEmit
npx tsx scripts/verify-selling-houses-round19-five-x-scale-census-gate.ts
npx tsx scripts/verify-selling-houses-round19-five-x-runtime-ledger-gate.ts
npx tsx scripts/verify-selling-houses-round19-five-x-product-decision-gate.ts
npx tsx scripts/verify-selling-houses-round19-market-economy-scale-gate.ts
npx tsx scripts/verify-selling-houses-round19-five-x-final-gate.ts
```

轻量检查：

```bash
npm run lint
```

## 8. 继续变大的方向

下一阶段不是继续堆实体，而是让更多业务信息都进入同一条链：

- 更多真实 source kind：房源动态、竞品调价、客户行为、业主反馈、组织安排、推广资源、成交结果。
- 更深 actor knowledge：经纪人、业主、客户、商圈经理、同行对同一 source 形成不同 belief。
- 更完整 receipt：玩家动作、流程结果、组织干预、市场反馈、资源消耗都回灌 runtime。
- 更长 replay：不只回放脚本，而是回放业务链。
- 更强 projection envelope：所有 UI 判断都能解释来源、可信度、压力和动作。

Big 的本质不是大列表，而是大因果链。
