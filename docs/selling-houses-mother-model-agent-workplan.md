# Selling Houses World Model — Current Workplan

最后整理：2026-05-15

这份文件只保留当前仍然有效的 Big World / mother-model 迁移边界。历史 Round 报告、一次性验收记录、调试过程和 agent 交接流水账不再放进主文档；真实证据以代码、gate 脚本和当前验证结果为准。

## 1. 当前成熟度

当前目标不是“多造一些房源和客户”，而是把卖房玩法接到同一条生命周期链：

`source → causal event → actor knowledge → belief / pressure → decision → command → receipt → runtime feedback → replay → projection envelope`

当前认可的成熟度：

- `FIVE-X-CITY-MARKET-BIG`
- 规模口径来自 `src/selling-houses/domain/world-model/bigWorldSpecFactory.ts` 的 `FIVE_X_SCALE_POLICY`
- 门禁必须证明 runtime、projection、receipt、replay 和 product decision 都接在同一条 live causal chain 上

任何只增加初始实体数量、只加 UI 文案、只在脚本里 standalone 跑通的实现，都不能算 Big World 完成。

## 2. Five-X Scale Contract

唯一规模来源：

- `FIVE_X_SCALE_PROFILE_ID = 'five-x-city-level-v1'`
- `FIVE_X_SCALE_CONTRACT_VERSION = 2`
- `FIVE_X_SCALE_POLICY` 在 `src/selling-houses/domain/world-model/bigWorldSpecFactory.ts`

最低门槛：

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

注：`materializedCustomersPerCell` 的策略值是 60；由于场景模板扩展限制，实际 materialized customer 可能低于策略值，但总 demand 必须通过 materialized + shadow clusters 达到 `>= 21000`。

## 3. 什么算完成

必须同时满足：

1. `advanceDays` / `advanceGameDays` 能驱动 live runtime tick。
2. `worldCausalEvents` 在真实推进后增长，而不是只在验证脚本里生成。
3. `player_action_receipt` 来自真实玩家动作流。
4. `process_receipt` 来自真实 ProductRun / process flow。
5. `manager_message` / organization action 进入 source 与 causal ledger。
6. projection 读取 actor-visible belief / pressure / causal refs，不偷看 hidden GlobalTruth。
7. decision 由 belief / pressure / available command 推出，不直接读 legacy fields。
8. 同一个 causal ref 能被多个产品面复用。
9. replay 能在相同 seed、source records、commands、receipts 下稳定复现。
10. gate 源码不能出现 `check(true, ...)`、`|| true` 等软通过模式。

## 4. 明确拒绝

- 用 UI 修补冒充架构完成。
- 用“多加客户 / 房源 / 竞品”冒充大世界。
- hidden `GlobalTruth` 泄露到 broker POV。
- `Date.now`、`Math.random`、`fetch`、LLM provider 作为核心模拟真相。
- `pendingSourceRecords` 未进入 `worldCausalEvents` 就当完成。
- standalone runtime 通过，但真实游戏推进链路没有接上。
- 重写整个游戏或破坏现有可玩性。

## 5. 当前硬门禁

必跑：

```bash
npm run build
npx tsc --noEmit
npx tsx scripts/verify-selling-houses-round12-super-market-everything-big-final-gate.ts
npx tsx scripts/verify-selling-houses-round13-no-dead-corner-final-gate.ts
npx tsx scripts/verify-selling-houses-round14-no-exemption-perfect-big-gate.ts
npx tsx scripts/verify-selling-houses-round17-market-economy-final-gate.ts
npx tsx scripts/verify-selling-houses-round18-resource-ledger-final-gate.ts
npx tsx scripts/verify-selling-houses-round19-five-x-scale-census-gate.ts
npx tsx scripts/verify-selling-houses-round19-five-x-runtime-ledger-gate.ts
npx tsx scripts/verify-selling-houses-round19-five-x-product-decision-gate.ts
npx tsx scripts/verify-selling-houses-round19-market-economy-scale-gate.ts
npx tsx scripts/verify-selling-houses-round19-five-x-final-gate.ts
```

快速检查：

```bash
npm run lint
```

## 6. 共享文件保护

这些文件影响 source、causal、runtime、projection、receipt、replay 主链，不能多人并行乱改：

- `src/selling-houses/domain/engine.ts`
- `src/selling-houses/application/gameTransitions.ts`
- `src/selling-houses/domain/world-model/bigWorldBootstrap.ts`
- `src/selling-houses/domain/world-model/bigWorldSpecFactory.ts`
- `src/selling-houses/domain/world-model/causalEvents.ts`
- `src/selling-houses/domain/world-model/runtime/clock.ts`
- `src/selling-houses/domain/world-model/runtime/actionReceiptWiring.ts`
- `src/selling-houses/domain/world-model/runtime/outcomeReceiptCoverage.ts`
- `src/selling-houses/application/projections/bigWorldPOVProjection.ts`
- `src/selling-houses/application/projections/actorKnowledgeProjection.ts`
- `src/selling-houses/application/projections/noDeadCornerProductCensus.ts`

如果必须改共享文件，先约定合并顺序：scale/source → runtime/receipt → projection/decision → gate。

## 7. 当前风险

P0 / P1：

- 当前无已知 P0 / P1 可以被文档豁免；一旦发现必须让 final gate 阻断最高成熟度。

P2：

- 长周期 shadow rival 生命周期仍偏短，30 天后活跃竞品可能耗尽，后续竞争压力主要靠事件和历史 pressure 承接。
- 部分 display fallback 仍需要持续收敛成 evidence-backed explanation。
- Five-X runtime tick 已可跑，但继续扩大规模时要关注 active cohort scheduler 和验证耗时。

## 8. 文档维护规则

- 主文档只写当前事实、当前门禁、当前风险。
- 一次性 agent 报告、验收截图、playtest 输出、Round 流水账不进入 `docs/`。
- 可再生成的测试输出放 `artifacts/`，且默认不纳入 git。
- 如果代码口径变化，优先更新 source contract 和 gate，再更新本文。
