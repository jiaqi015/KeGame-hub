# 卖房 Deal / Outcome 合同

最后整理：2026-05-18

成交、丢盘、撤盘、流失都不是 UI 结论，而是世界里的 outcome fact。它们必须通过 receipt 和 causal ledger 进入 runtime，再由 result / review / leaderboard 投影消费。

## 1. 成交边界

成交不能写成：

```text
CustomerListingRelation.stage = closed
```

也不能把 `ClosedDealRecord` 当成“签约真因”。在当前实现里，成交事实的真实签约依据是 canonical evidence 汇聚后的 `PriceConsensusProof`，再由它写出 `ContractFact`；`ClosedDealRecord` 是结果镜像、结算输出和复盘入口，不是事实生成器。

正确链路：

```text
real buyer offer / owner concession evidence
  → canonical price trajectory
  → PriceConsensusProof
  → ContractFact
  → ClosedDealRecord / outcome receipt
  → causal event
  → runtime feedback
  → result / review projection
```

## 2. Outcome 类型

| 类型 | 含义 |
| --- | --- |
| `sold_by_player` | 玩家主导成交 |
| `sold_by_cosale` | 同 ACN 联卖成交 |
| `sold_by_rival` | 跨品牌竞品成交 |
| `customer_lost` | 客户流失或被别人转化 |
| `listing_withdrawn` | 业主撤盘 |
| `not_sold` | 周期结束未成交 |
| `switch_to_rent` | 业主转租 |

## 3. ClosedDealRecord 必须回答

- 哪套房成交。
- 哪个 owner / customer / broker / brand / store / ACN 参与。
- 是房源端、客源端、联卖还是竞品成交。
- 成交价格和市场合理价的关系。
- 成交前看到了哪些 source。
- 哪些 action / process / organization receipt 影响了成交。
- 对 score、career、leaderboard 的影响。

## 4. Outcome Receipt

每个 outcome 都必须留下 receipt：

```text
outcome
  → receipt
  → causal event
  → field/resource deltas
  → result projection
  → replay anchor
```

没有 receipt 的 outcome 不能进入正式结算。

## 5. 组织与联卖归因

同 ACN 成交必须拆：

- listing side broker
- customer side broker
- listing side store / brand / ACN
- customer side store / brand / ACN
- co-sale contribution

跨品牌成交才进入竞品失败 / 丢客 / 丢盘口径。

## 6. Result 投影

结果页只读 outcome facts 和 receipts：

- 不从机会阶段倒推成交。
- 不从 UI 卡片状态倒推成交。
- 不从 legacy sold count 当真相。

## 7. 反模式

- `closed` 阶段替代成交事实。
- 成交没有组织归因。
- 丢盘 / 丢客只是一句复盘文案。
- outcome 没有 receipt。
- leaderboard 直接读局内临时分。
