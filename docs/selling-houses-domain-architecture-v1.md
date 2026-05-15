# 卖房 Big World 领域架构合同

最后整理：2026-05-15

这份文档不再保留旧版“建议稿”长论证，只定义当前资产顾问 Big World 的领域边界。若与旧专题文档冲突，以本文件、[卖房 Big World 架构总纲](selling-houses-master.md)、[母模型迁移工作板](selling-houses-mother-model-agent-workplan.md) 和代码 gate 为准。

## 1. 领域主链

当前领域主链是：

```text
SourceRecord
  → CausalEvent
  → ActorKnowledge
  → Belief / Pressure
  → Decision
  → Command
  → Receipt
  → RuntimeFeedback
  → Replay
  → ProjectionEnvelope
```

任何产品判断、推荐动作、复盘解释、结果归因，都必须能回到这条链。

## 2. 分层

| 层 | 放什么 | 不能放什么 |
| --- | --- | --- |
| Game / Career | account、player profile、run、result、career stats、leaderboard | 单日经营判断、UI 摘要 |
| BigWorld Runtime | day tick、market movement、source ingestion、causal ledger、resource ledger | 纯展示文案 |
| Domain Entity | listing、owner、customer、broker、ACN、market cell、matter、deal | 排序理由、推荐标题 |
| Relation | owner-listing、customer-listing、broker-owner、broker-customer、competition、co-sale | 单方 actor 私有状态 |
| Actor Knowledge | broker / owner / customer / manager 各自看见的信息与可信度 | hidden GlobalTruth |
| Decision | belief、pressure、available command、explanation refs | 直接读 legacy field 得出的推荐 |
| Receipt | player action、process outcome、organization intervention、resource change | 没有反馈 runtime 的操作日志 |
| Projection | UI 可读的有限窗口、解释、排序、摘要 | 世界真相和长期事实 |

## 3. 核心对象

| 对象 | 领域含义 |
| --- | --- |
| `ListingCase` / `Case` | 房源经营对象，保留兼容名，但不要继续膨胀成上帝对象 |
| `Owner` | 业主 actor，有预期、耐心、信任、紧迫、信息可见性 |
| `Customer` | 客户 actor，有需求、预算、比较列表、意向、流失风险 |
| `Broker` | 经纪人 actor，玩家只是其中一个 broker POV |
| `Brand / ACN / Store / Manager` | 组织与协作网络，决定联卖、组织干预和资源分配 |
| `MarketCell / MicroCell` | 市场空间单元，承接热度、价格、竞争和配套信息 |
| `Matter` | 正在处理的一件业务事项；动作是 Matter 内的步骤 |
| `Deal / ClosedDealRecord` | 成交事实，不能回写成 opportunity stage |
| `SourceRecord` | 所有信息进入世界的入口 |
| `CausalEvent` | runtime 认可的因果事实 |
| `ActorKnowledge` | 某 actor 在某天看到什么、可信度多少 |
| `Command` | 系统允许玩家或组织执行的动作 |
| `Receipt` | command 或流程执行后的回执 |
| `ProjectionEnvelope` | UI 判断的解释外壳 |

## 4. 字段归属规则

1. 房子的物理属性放 `ListingCase`。
2. 业主心理、预期和配合度放 `Owner` 或 `OwnerListingRelation`。
3. 客户需求、预算、看房行为放 `Customer`。
4. 客户对某套房的意向、阶段、信心放 `CustomerListingRelation`。
5. 经纪人资源、动作能力、组织关系放 `Broker` / organization relation。
6. 竞品不是单个数字，而是 listing、customer overlap、organization relation 和 causal events 的投影。
7. 推荐理由、排序、标签、摘要放 projection，不回写世界。
8. 任何 UI 判断都必须带 source / causal / knowledge / decision refs。

## 5. Big World 规模边界

规模合同由 `FIVE_X_SCALE_POLICY` 统一定义：

- `>= 100` market cells
- `>= 300` micro cells
- `>= 4000` listings
- `>= 2500` owner priors
- `>= 21000` demand units
- `>= 750` brokers
- `>= 32` ACN networks
- `>= 800` supporting info
- `>= 300` historical transactions

计算不能做全量笛卡尔积。产品面必须使用：

- actor-visible window
- active cohort
- shadow aggregate
- cold ledger
- dirty scope
- bounded sample

## 6. 成交边界

成交不是 `stage = closed`。

正确链路：

```text
CustomerListingRelation reaches offer
  → DealClosingEvaluation
  → ClosedDealRecord
  → receipt / causal event
  → result / leaderboard projection
```

机会阶段只表达推进深度；成交记录才是正式事实。

## 7. Matter 边界

Matter 是业务事项，不是世界最终真相。

```text
Matter
  → command
  → receipt
  → causal event
  → relation / runtime update
```

Matter 可以有详情页或专屏，但不能绕过 source / causal / receipt 主链直接改 UI 结论。

## 8. Projection 边界

Projection 必须：

- 只读世界事实、actor knowledge、belief、pressure、receipts。
- 输出 bounded UI window。
- 带 explanation envelope。
- 不写回 world。

Projection 禁止：

- 直接读取 hidden GlobalTruth。
- 用 legacy field 直接生成推荐。
- 用 display fallback 冒充 evidence-backed judgment。

## 9. 当前代码锚点

- `src/selling-houses/domain/models.ts`
- `src/selling-houses/domain/engine.ts`
- `src/selling-houses/domain/world-model/**`
- `src/selling-houses/application/projections/**`
- `scripts/verify-selling-houses-round19-*.ts`

## 10. 反模式

- `Case` 上继续堆 owner、customer、UI、score、recommendation 混合字段。
- `GameState` 里保存页面摘要、推荐标题、卡片标签。
- 推荐动作直接读 `case.heat` / `case.trust` / legacy score。
- 客户池、竞品池、市场雷达全量展开到 UI。
- 只在 bootstrap 里造大数据，runtime 不持续 ingestion。
- receipt 不反馈 runtime。
- replay 只能脚本跑，不能证明业务链可重放。

## 11. Definition of Done

一个领域改动完成，至少满足：

1. 新信息先进入 `SourceRecord` 或 command / receipt。
2. runtime 生成可追溯 `CausalEvent`。
3. actor POV 只能通过 `ActorKnowledge` 消费。
4. recommendation 由 belief / pressure / command 形成。
5. 玩家或组织动作留下 receipt，并反馈 runtime。
6. projection 能解释 source、causal、可信度、pressure、command、receipt。
7. gate 能反证不是 UI 修补、不是多加实体、不是 hidden truth 泄露。
