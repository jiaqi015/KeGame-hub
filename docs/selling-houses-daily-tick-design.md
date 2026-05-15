# 卖房 Big World Runtime Tick 合同

最后整理：2026-05-15

这份文档定义当前“一天怎么推进”。旧版按 `resolveOneDay` 逐行罗列的实现说明已经清理；当前口径以 Big World runtime、source ingestion、causal ledger、receipt feedback 和 replay 为主。

## 1. Tick 的目标

每天推进不是“重算几个 UI 字段”，而是让世界继续运行：

```text
previous GameState
  → ingest pending source / receipt
  → runBigWorldDayTick
  → append causal events
  → update actor knowledge
  → update pressure / belief / resource ledger
  → project bounded UI windows
  → preserve replay anchors
```

## 2. 必须接入真实游戏推进

`runBigWorldDayTick` 必须被真实推进链路调用：

- `advanceDays`
- `advanceGameDays`
- `advanceOneDay` / `resolveOneDay` 兼容路径
- 玩家 action 后的后续结算路径

只在 gate 脚本里 standalone 跑 runtime，不算完成。

## 3. Tick 输入

| 输入 | 含义 |
| --- | --- |
| `GameState` | 当前局状态和 Big World runtime snapshot |
| `seed` | 确定性随机源，不允许 `Math.random` |
| `pendingSourceRecords` | 待进入 runtime 的市场、客户、业主、组织、流程信息 |
| `actionCommands` | 玩家或组织准备执行的命令 |
| `receipts` | 动作、流程、组织干预、资源变化回执 |
| `runtimeClock` | 当前 day / tickCount / horizon |

## 4. Tick 输出

| 输出 | 验收口径 |
| --- | --- |
| `bigWorldRuntime.tickCount` | 真实推进后增长 |
| `worldCausalEvents` | 真实推进后追加 live causal events |
| `actorKnowledge` | 从 causal / source 过滤，不偷看 GlobalTruth |
| `resourceLedger` | 推广金、信任、耐心、客户势能等资源变化可追溯 |
| `receiptFeedback` | receipt 影响后续 runtime，而非孤立日志 |
| `projectionInvalidation` | dirty scope / causal refs 驱动 bounded projection |
| `replayAnchor` | seed + sources + commands + receipts 可重放 |

## 5. Source → Causal

每个 source kind 进入 runtime 后都必须能生成或参与生成 causal event：

- market signal
- rival action
- customer interaction
- owner interview / owner feedback
- manager message
- player action receipt
- process receipt
- organization intervention
- resource ledger change
- deal / lost / withdrawn outcome

`pendingSourceRecords` 本身不是完成；进入 `worldCausalEvents` 才算被世界吸收。

## 6. Receipt Feedback

Receipt 不是日志。它必须反馈 runtime：

```text
command executed
  → receipt
  → source / causal event
  → field deltas / resource deltas
  → next-day actor knowledge / pressure
  → next recommendation
```

必须覆盖：

- 玩家动作 receipt
- Matter / process receipt
- 组织干预 receipt
- 推广资源 receipt
- 成交 / 丢盘 / 流失 outcome receipt

## 7. Actor Knowledge

tick 后每个 actor 看到的是不同世界：

- broker 看到 actor-visible market / owner / customer / manager 信息
- owner 看到与自己房源和经纪人相关的信息
- customer 看到自己比较列表和市场可见信息
- manager 看到组织维度和经纪人行动

任何 projection 不能直接越过 knowledge 去读 hidden truth。

## 8. 有界计算

Five-X 城市级世界不能每天全量笛卡尔积。tick 必须使用：

- active cohort
- hot / cold split
- actor-visible cells
- dirty scope
- bounded sample
- shadow aggregate
- cold ledger

大世界的正确形态是“大底座 + 有界活跃窗口”，不是把几万实体每天全部展开。

## 9. Replay

可重放输入：

```text
seed
source records
action commands
receipts
runtime contract version
scale contract version
```

相同输入必须得到相同关键输出：

- tickCount
- causal event ids / kinds
- receipt counts
- projection explanation refs
- run result anchors

## 10. Gate 要防什么

- standalone runtime 通过但真实 advance path 不调用。
- source 留在 pending 没有进入 causal。
- receipt 生成了但不反馈 runtime。
- projection 用 legacy fields 直接判断。
- hidden GlobalTruth 泄露到 broker POV。
- gate 使用 `check(true)` / `|| true` / `>= 0` 软通过。
- 只增加实体数量，runtime 不变大。

## 11. 当前验证

核心命令见 [母模型迁移工作板](selling-houses-mother-model-agent-workplan.md)。

最低轻量验证：

```bash
npm run lint
npx tsx scripts/verify-selling-houses-round19-five-x-runtime-ledger-gate.ts
npx tsx scripts/verify-selling-houses-round19-five-x-final-gate.ts
```
