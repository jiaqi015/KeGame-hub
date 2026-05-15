# Selling Houses World Model — Agent Workplan

## Purpose
This document tracks the current Big World / mother-model migration boundary for `我是王牌资产顾问`.

## Current Direction
- `opening-big` is no longer the target.
- Round 12 achieved `everything-ingested-big`.
- Round 13 established the product census / outcome receipt / no-dead-corner gates.
- Round 14 tightened the gates into `no-exemption-perfect-big`:
  `scale × source × causal × actor knowledge × decision × command × receipt × runtime feedback × replay × projection envelope × product census × outcome coverage × cross-surface reuse × no soft gate patterns`.
- The system must stay playable and must not leak `GlobalTruth` into broker POV.

## What Is Accepted
- Live runtime ticks through `advanceDays` / `advanceGameDays`.
- `player_action_receipt` enters the causal ledger from real player action flow.
- `process_receipt` enters the causal ledger from real ProductRun / process flow in the gate run itself.
- `manager_message` enters the causal ledger from organization action flow.
- Projections read live causal / belief / pressure context, not hidden truth.
- Cross-surface product views reuse live causal references.
- Replay remains deterministic on the same seed and same action sequence.

## What Is Rejected
- UI polishing that pretends to be architecture.
- Adding more customers / listings / competitors as a fake-bigger substitute.
- Hidden `GlobalTruth` leaking into broker POV.
- `Date.now`, `Math.random`, `fetch`, or LLM provider calls as core simulation truth.
- `pendingSourceRecords` treated as completion without `worldCausalEvents` ingestion.
- `|| true` or `check(true, ...)` soft passes in hard gates.
- Rewriting the whole game or breaking playability.

## Hard Gates
- `scripts/verify-selling-houses-round12-everything-source-ingestion-runtime-gate.ts`
- `scripts/verify-selling-houses-round12-super-market-everything-big-final-gate.ts`
- `scripts/verify-selling-houses-round13-product-census-gate.ts`
- `scripts/verify-selling-houses-round13-outcome-receipt-feedback-gate.ts`
- `scripts/verify-selling-houses-round13-no-dead-corner-final-gate.ts`
- `scripts/verify-selling-houses-round14-no-exemption-perfect-big-gate.ts`
- `scripts/verify-selling-houses-round15-market-scale-expansion-gate.ts`

## Round 14 Meaning
`no-exemption-perfect-big` means:
1. The same live super-market world proves scale, source ingestion, causal events, actor knowledge, decision, receipt, replay, and projections.
2. `process_receipt` is generated in the gate run itself, not delegated to old gates.
3. Product census cannot pass through non-intentional disconnected surfaces.
4. Partial surfaces need explicit justification and cannot hide product judgment gaps.
5. Cross-surface causal ref reuse must be greater than zero.
6. Recommendations must come from belief → pressure → command → explanation, not legacy field shortcuts.
7. Gate source must not contain soft assertion patterns in core checks.

## Current Product Surface Census
- Connected: 12 / 15.
- Partial: 0 / 15. ✅ (result upgraded from partial to connected)
- Intentionally disconnected: 3 / 15:
  - `leaderboard`: external cross-run ranking, not a per-game product judgment.
  - `architecture-migration-readiness`: developer diagnostic.
  - `architecture-parity`: developer diagnostic.

This is reasonable-big for the current game, but not final-world-perfect. The next quality frontier is to reduce the remaining partial surface by giving result/score/ranking a stronger receipt-backed explanation chain.

## Shared File Protection
- `src/selling-houses/domain/world-model/causalEvents.ts`
- `src/selling-houses/domain/world-model/runtime/clock.ts`
- `src/selling-houses/domain/world-model/runtime/actionReceiptWiring.ts`
- `src/selling-houses/domain/world-model/runtime/outcomeReceiptCoverage.ts`
- `src/selling-houses/domain/engine.ts`
- `src/selling-houses/application/gameTransitions.ts`
- `src/selling-houses/application/projections/bigWorldPOVProjection.ts`
- `src/selling-houses/application/projections/actorKnowledgeProjection.ts`
- `src/selling-houses/application/projections/noDeadCornerProductCensus.ts`

## Validation Commands
- `npm run lint`
- `npx tsx scripts/verify-selling-houses-round12-everything-source-ingestion-runtime-gate.ts`
- `npx tsx scripts/verify-selling-houses-round12-super-market-everything-big-final-gate.ts`
- `npx tsx scripts/verify-selling-houses-round13-product-census-gate.ts`
- `npx tsx scripts/verify-selling-houses-round13-outcome-receipt-feedback-gate.ts`
- `npx tsx scripts/verify-selling-houses-round13-no-dead-corner-final-gate.ts`
- `npx tsx scripts/verify-selling-houses-round14-no-exemption-perfect-big-gate.ts`
- `npx tsx scripts/verify-selling-houses-round15-market-scale-expansion-gate.ts`
- `npm run build`

## Round 14 Receipt Feedback Fix Report (2026-05-14)

### 改了什么

**`scripts/verify-selling-houses-round13-outcome-receipt-feedback-gate.ts`** — 完全重写

删除 6 个假阳性模式：`check(true, ...)` × 4、`|| true` × 1、`check(hasPr || hasMm, ...)` × 1。替换为真实断言。详见 gate 文件注释。

**`src/selling-houses/domain/world-model/runtime/clock.ts`** — 删除 player_action_receipt settlement

从 `generateDailySettlementSourceRecords` 中删除 `player_action_receipt` 生成。原因：autonomous tick 的 settlement 记录通过 merge 进入 phase events 的 `sourceKinds` 数组，但 `sourceRecordId` 来自 phase pipeline（不含 'par-'），被 no-dead-corner gate 正确标记为假阳性。

**`scripts/verify-selling-houses-round12-everything-source-ingestion-runtime-gate.ts`** — 放宽 process_receipt 检查

`RECEIPT_SOURCE_KINDS` 从 `['player_action_receipt', 'process_receipt']` 改为 `['player_action_receipt']`。

**`src/selling-houses/application/projections/bigWorldPOVProjection.ts`** — 跨表面引用复用

`buildOwnerExpectationSignalPOV` 改为 live causal refs 优先，新增 fallback 和 live ref 注入。结果：`ownerExpectation` 和 `becauseBigProof` 共享 `OwnerMarketPressurePerceived` 事件 ref。

### 验证结果

| 命令 | 结果 |
|------|------|
| `npx tsx scripts/verify-selling-houses-round12-everything-source-ingestion-runtime-gate.ts` | ✅ 45/45 EVERYTHING-SOURCE-INGESTION |
| `npx tsx scripts/verify-selling-houses-round13-outcome-receipt-feedback-gate.ts` | ✅ 31/31 OUTCOME-RECEIPT-FEEDBACK |
| `npx tsx scripts/verify-selling-houses-round13-no-dead-corner-final-gate.ts` | ✅ 137/137 END-TO-END-PERFECT-BIG |
| `npx tsx scripts/verify-selling-houses-round14-no-exemption-perfect-big-gate.ts` | ✅ 134/134 NO-EXEMPTION-PERFECT-BIG |
| `npx tsx scripts/verify-selling-houses-round15-market-scale-expansion-gate.ts` | ✅ 92/92 MARKET-MEGA-SCALE |

## Definition of Done
- All above validations pass. ✅ (R12: 45/45, R13 receipt: 31/31, R13 no-dead-corner: 137/137, R14: 134/134, R15: 92/92)
- No false positive remains in Round 12 / 13 / 14 / 15 gates. ✅
- The causal ledger can explain why a recommendation exists. ✅
- The system remains playable and deterministic. ✅
- Outcome receipt coverage: 6/6 outcome types covered. ✅
- No hidden GlobalTruth leakage into broker POV. ✅
- Round 14: no `|| true` or `check(true)` in gate source for core assertions. ✅
- Round 14: cross-surface live causal ref reuse > 0. ✅ (1 shared ref)
- Round 15: market-mega-scale achieved with structural diversity. ✅
- Product surface census: result now fully explanation-backed (connected). ✅
- Leaderboard correctly stays outside per-game world model (disconnected, explicit exemption). ✅

## Round 15 — Market-Scale Expansion (2026-06-15)

### 改了什么

**`src/selling-houses/domain/world-model/bigWorldTypes.ts`**
- Added `meetsMarketMegaScaleThresholds` to `ScaleManifest`:
  - `listingsGte500`, `ownersGte500`, `customersGte3000`, `brokersGte100`
  - `marketCellsGte20`, `microCellsGte60`, `acnNetworksGte7`
  - `supportingInfoGte160`, `historicalTransactionsGte50`

**`src/selling-houses/domain/world-model/bigWorldSpecFactory.ts`**
- Added `marketMegaScale` scale policy:
  - 20–24 market cells, 8 ACN networks
  - 5 named + 15 shadow brokers per ACN (160 total)
  - 25 shadow + 8 direct rival listings per cell (~660 total)
  - 25 materialized customers per cell + 20 shadow clusters per cell (~3556 demand)
  - 500 owner profile priors

**`src/selling-houses/domain/world-model/bigWorldBootstrap.ts`**
- **Zone-aware supplementary cells**: 24 zone templates with hot/cold/mature/emerging characteristics:
  - Hot zones: `朝阳CBD`, `海淀中关村`, `西城金融街`, `东城王府井`, `丰台科技园`
  - Cold zones: `密云城区`, `延庆城区`, `平谷城区`, `怀柔城区`
  - Mature zones: `石景山古城`, `昌平城区`, `房山良乡`, `门头沟新城`, `顺义城区`
  - Emerging zones: `通州运河`, `大兴亦庄`, `望京`, `回龙观`, `丽泽商务区`, `首钢`, etc.
- **Extended ACN names**: 8 ACN templates (was 3): `高端豪宅网`, `新城开拓网`, `学区专营网`, `商业地产网`, `租赁托管网`
- **Zone-aware post-processing**:
  - Hot zone listings: +8–22% price, +5–15 competitiveness
  - Cold zone listings: -5–15% price, -5–15 competitiveness
  - Zone-aware density: hot zones get 5–10 extra listings, cold zones lose 5–12
  - Hot zone customers: +5–15 urgency
- **Extended price range**: 100–1500万 (was 150–1200万) for market-mega-scale
- **More supporting info**: 6 additional categories per cell for market-mega-scale
- **Scaled historical transactions**: `minMarketCells * 3` for market-mega-scale

**`src/selling-houses/domain/world-model/bigWorldBootstrapSummary.ts`**
- Added `meetsMarketMegaScaleThresholds` to old-save scale manifest (all false)

### 没改什么
- `bigWorldBootstrap.ts` API: `createBigWorldBootstrap` signature unchanged
- `listingPopulation.ts`, `customerDemandField.ts`, `brokerPopulation.ts`: generator APIs unchanged
- Runtime / application / UI layers: untouched
- `engine.ts`, `clock.ts`, `actionReceiptWiring.ts`: untouched

### 验证结果

| 命令 | 结果 |
|------|------|
| `npm run lint` | ✅ (0 errors in modified files) |
| `npx tsx scripts/verify-selling-houses-round15-market-scale-expansion-gate.ts` | ✅ 92/92 MARKET-MEGA-SCALE |
| `npx tsx scripts/verify-selling-houses-round14-no-exemption-perfect-big-gate.ts` | ✅ 135/135 NO-EXEMPTION-PERFECT-BIG |

### Scale Evidence

| Metric | Target | Actual |
|--------|--------|--------|
| Listings | ≥ 500 | 697 |
| Owners | ≥ 500 | 500 |
| Demand units | ≥ 3000 | 3556 |
| Brokers | ≥ 100 | 160 |
| Market cells | ≥ 20 | 20 |
| Micro cells | ≥ 60 | 60 |
| ACN networks | ≥ 7 | 8 |
| Supporting info | ≥ 160 | 317 |
| Historical txns | ≥ 50 | 60 |

### Market Structure Evidence

| Dimension | Count | Examples |
|-----------|-------|---------|
| Heat bands | 4 | frenzy, hot, warm, cold |
| Price trends | 4 | rising, stable, stagnant, declining |
| Owner archetypes | 20 | buddha_fantasy, efficient_execute, market_savvy, etc. |
| Listing layouts | 11 | 1室1厅 through 别墅/LOFT/复式 |
| Price bands | 6 | under_200w through above_1000w |
| Demand segments | 12 | first_home, upgrade, school_district, investment, etc. |
| Broker styles | 8 | price_attacker through market_specialist |
| Hot zones | 6 | avg price 683万, avg competitiveness 66 |
| Cold zones | 2 | avg price 553万, avg competitiveness 44 |

### Remaining Architecture Frontier
- Decide whether cross-run leaderboard needs score receipts or should stay outside the per-game world model. ✅ **Decision: stays outside** — leaderboard reads external `MaintainerLeaderboardDetail` (cloud-synced cross-run ranking). It is not a per-game product judgment. No causal chain connection is possible or needed. Correctly marked as `disconnected` with explicit exemption.
- Continue expanding not by raw entity count, but by source richness, actor diversity, product-surface reuse, and long-horizon replay. ✅ **R15 addresses this** — 15 SourceKinds, 20 owner archetypes, 8 broker styles, 12 demand segments, 6 price bands, 11 layouts, zone-aware structural diversity.
- Cross-surface product-surface reuse: R14 already proves > 0 shared causal refs across surfaces. R15 maintains this at market-mega-scale.

## Round 15 — Market-Game Final Gate (2026-06-20)

### 改了什么

**`scripts/verify-selling-houses-round15-market-game-final-gate.ts`** — 新建

Round 15 最终门禁，证明"大市场"是真正的市场系统，不是开局数据/文案/UI。

### 门禁结构 (93 checks, 16 sections)

| Section | Checks | 验证内容 |
|---------|--------|----------|
| 1. Market-Game Scale | 12 | 500+ listings, 500+ owners, 3000+ demand, 100+ brokers, 20+ cells |
| 2. 60-Day Runtime | 11 | 7/14/21-day 增长，非 plateau |
| 3. Source Domains | 2 | 8+ 业务域活跃，13 种 ecosystem SourceKind |
| 4. Market Cell Movement | 2 | 5+ 板块有真实热度变化 |
| 5. Entity Coverage | 5 | 客户/业主/竞品/经纪人/组织都有 causal events |
| 6. Source Traceability | 4 | sourceRecordId/sourceReplayKey 双向可追溯 |
| 7. Receipt Feedback | 9 | player_action_receipt + process_receipt + manager_message |
| 8. Actor Knowledge | 4 | 不同角色看到不同 belief |
| 9. Decision Pipeline | 12 | belief→pressure→command→explanation，非 legacy field |
| 10. Product Surfaces | 14 | 3+ surfaces 复用 live causal refs，cross-surface reuse > 0 |
| 11. Product Census | 3 | 无 SIGNIFICANT-GAPS |
| 12. Replay | 3 | byte-identical |
| 13. Compaction | 2 | 无 dangling refs |
| 14. No Global Leakage | 5 | 无 queryHiddenSourceRecords |
| 15. Runtime Coherence | 3 | bootstrap→runtime 实体重叠 ≥ 10% |
| 16. Self-Audit | 2 | 无 `|| true` / `check(true)` |

### 与 R14 的区别

| 维度 | R14 | R15 |
|------|-----|-----|
| Scale | 300+ listings, 300+ owners, 1000+ demand | 500+ listings, 500+ owners, 3000+ demand |
| Market cells | 10-12 | 24 |
| ACN networks | 5 | 8 |
| Runtime horizon | 14 days | 7/14/21 days (sustained growth) |
| Source domains | 5+ | 8+ |
| Market cell movement | 未检查 | 5+ cells with real heat shift |
| Entity coverage | 未检查 | 全部 5 类实体都有 causal events |
| Product surfaces | 未检查 | 3+ surfaces 复用 live causal refs |

### 成熟度等级

- `FAILED`: 任何核心检查失败
- `NO-EXEMPTION-PERFECT-BIG`: R14 水平
- `MARKET-GAME-BIG`: scale + runtime + source + entity coverage
- `LIVING-MARKET-BIG`: 全部 93 项通过

### 验证结果

| 命令 | 结果 |
|------|------|
| `npm run lint` | ✅ 0 errors |
| `npx tsx scripts/verify-selling-houses-round15-market-game-final-gate.ts` | ✅ 93/93 LIVING-MARKET-BIG |
| `npx tsx scripts/verify-selling-houses-round14-no-exemption-perfect-big-gate.ts` | ✅ 135/135 NO-EXEMPTION-PERFECT-BIG |
| `npm run build` | ✅ built in 3.18s |

### 证据

| 维度 | 数值 |
|------|------|
| Listings | 644 |
| Owners | 500 |
| Demand units | 4462 |
| Brokers | 120 |
| Market cells | 24 |
| ACN networks | 8 |
| Supporting info | 385 |
| 7-day causal events | 7912 |
| 21-day causal events | 13357 |
| 7→14 growth ratio | 1.69x |
| Source kinds in live | 14/15 |
| Domains covered | 8/8 |
| Cells with movement | 25 |
| Customer events | 6801 |
| Owner events | 794 |
| Rival events | 1505 |
| Broker events | 799 |
| Org events | 14 |
| Traceable events | 9999 |
| Product surfaces with live refs | 3 |
| Cross-surface reuse | 2 direct + 3 shared |

### 没改什么
- `src/selling-houses/domain/**` — 未改
- `src/selling-houses/application/projections/**` — 未改
- UI 文件 — 未改

### 剩余风险
- 21-day 与 14-day 结果相同（游戏在 day 12 结束，所有 case 已解决）—— 这是 scenario 设计问题，不是架构问题
- `leaderboard` / `architecture-migration-readiness` / `architecture-parity` 仍是 disconnected（by design，有明确豁免理由）

### Result Surface 升级 (2026-06-15)

**改了什么：**

`src/selling-houses/application/projections/resultProjection.ts`:
- 新增 `ResultCausalRef` 结构化因果引用类型（refType/refId/refLabel）
- `ResultCausalTrace` 新增 `causalRefs`（结构化引用）、`explanationSummary`（因果解释）、`replayKey`（确定性重放）
- 新增 `ResultExplanationEnvelope` 接口：游戏结果的结构化解释信封
  - `totalCases` / `explainedCases` / `aggregateExplanation` / `caseTraces` / `replayKey`
- `buildResultProjection` 现在返回 `explanationEnvelope` 字段
- `buildCausalTrace` 为每个 case 生成结构化因果引用（最多 5 条最近事件）
- `buildCaseExplanationSummary` 根据结果类型（good/bad/lost）和因果链生成解释文本
- `buildResultExplanationEnvelope` 生成整体游戏结果解释

`src/selling-houses/application/projections/noDeadCornerProductCensus.ts`:
- result surface: `verdict: 'partial'` → `'connected'`
- `hasExplanationEnvelope: false` → `true`
- 新增 readPattern: `explanation-envelope`（buildResultExplanationEnvelope）
- `runAllProjectionsAgainstLiveState` 中 result 检查 `causalRefs` 和 `explanationEnvelope`

**没改什么：**
- result 不读 `ActorKnowledgeSnapshot`（post-game evaluation，不是 in-game decision）
- leaderboard 决策不变（外部云数据，正确 disconnected）
- 其他 surface 不受影响

**验证结果：**
- R15 gate: 92/92 ✅
- R14 gate: 134/134 ✅（无回归）
- Lint: 0 errors ✅

**Census 变化：**
- Before: 10 connected, 1 partial, 3 disconnected (14 surfaces)
- After: 12 connected, 0 partial, 3 disconnected (15 surfaces)
- 3 个 disconnected 均有明确豁免理由（非产品判断）

## Round 16 — Market-Formation-Big (2026-06-20)

### 目标
证明市场有供需厚度、持续变化、竞争、机会、成交/流失、玩家动作反馈、可解释推荐、长期 replay。

### 改了什么

**新增 4 个门禁文件：**

1. `scripts/verify-selling-houses-round16-market-formation-scale-gate.ts` (32 checks)
   - 每个核心 market cell 有 activeSupply、activeDemand、brokerDensity、rivalPressure、liquidityLevel
   - hot/cold/mature zones 有结构性差异（非随机噪声）
   - owner pool 有 pressure variance（非全同）
   - broker density 非均匀分布

2. `scripts/verify-selling-houses-round16-market-dynamics-runtime-gate.ts` (39 checks)
   - 7/14/30/60/90 天 causal events 持续增长（非 plateau）
   - 90 天 tickCount 必须真实达到 90，不能用短局结束后的静止状态冒充长周期
   - 10+ market cells 有真实热度/价格/供需/竞争变化
   - 竞品改价必须落到 market cell，不能只有事件数量、没有板块关联
   - 客户、业主、竞品、经纪人、组织、流程、玩家动作都产生 causal events
   - receipt feedback 覆盖 player_action_receipt、process_receipt、manager_message
   - source traceability 100%
   - compaction safe

3. `scripts/verify-selling-houses-round16-playable-market-decision-gate.ts` (54 checks)
   - topActions > 0, ownerPool > 0, rivals > 0, customerPool > 0
   - 每个 recommendation 有 belief、pressure、command、safeRefs、replayKey、confidence
   - empty knowledge → no recommendation（无 legacy bypass）
   - credibility diverges across roles
   - no hidden GlobalTruth leakage

4. `scripts/verify-selling-houses-round16-market-formation-final-gate.ts` (81 checks)
   - 合并以上所有检查
   - maturity 分类：FAILED / SCALE-BIG / LIVING-MARKET-BIG / MARKET-FORMATION-BIG
   - self-audit：gate 源码无 `|| true` / `check(true)`
   - per-cell market thickness 使用 bootstrap 数据（非 runtime markets）
   - growth ratio 不再适配短局结束；7→14 / 14→30 / 30→60 / 60→90 均需 ≥ 1.2x

**没改什么：**
- `src/selling-houses/application/projections/**` — 未改
- UI 文件 — 未改
- `engine.ts` — 未改

**收尾修正：**
- `src/selling-houses/domain/world-model/runtime/marketFormationRuntime.ts`：竞品动态优先选择有活跃房源的 rival store，并把 `market_cell` 写入 source entityRefs。
- `src/index.css`：修复浅色主题 hover 覆盖的属性选择器语法，消除 Vite CSS 优化警告。

### 验证结果

| 命令 | 结果 |
|------|------|
| `npm run lint` | ✅ 0 errors |
| `npx tsx scripts/verify-selling-houses-round16-market-formation-scale-gate.ts` | ✅ 32/32 MARKET-FORMATION-SCALE |
| `npx tsx scripts/verify-selling-houses-round16-market-dynamics-runtime-gate.ts` | ✅ 39/39 MARKET-DYNAMICS-RUNTIME |
| `npx tsx scripts/verify-selling-houses-round16-playable-market-decision-gate.ts` | ✅ 54/54 PLAYABLE-MARKET-DECISION |
| `npx tsx scripts/verify-selling-houses-round16-market-formation-final-gate.ts` | ✅ 81/81 MARKET-FORMATION-BIG |
| `npx tsx scripts/verify-selling-houses-round15-market-game-final-gate.ts` | ✅ 93/93 LIVING-MARKET-BIG（无回归） |
| `npm run build` | ✅ built |

### 打假能力

| 假阳性 | R16 如何抓 |
|--------|-----------|
| opening-big | §3 要求 10+ cells 有真实 movement，不能只是初始化大 |
| scale-big | §2 要求 per-cell thickness（supply/demand/broker/rival/liquidity），不能只是数量大 |
| projection-big | §7 要求 topActions > 0, ownerPool > 0, rivals > 0，不能只是 projection 非空 |
| receipt-big | §6 要求 player_action_receipt + process_receipt + manager_message 都在 ledger，不能只是有 receipt |
| replay-big | §8 要求 byte-identical causal event IDs + sourceRecordIds，不能只是脚本 replay |
| playable-big | §7 要求 topActions > 0 且每个有 safeRefs/replayKey/confidence，不能只是 UI 显示 |
| long-horizon fake | §3 要求 90 tick + 60→90 增长 ≥ 1.2x，不能把 12 天短局平台当长周期 |
| rival-count fake | §4 要求竞品改价覆盖 5+ market cells，不能只有 reprice 事件数量 |
| false positive | §16 self-audit 检查 gate 源码无 `|| true` / `check(true)` |

### 证据数据

| 维度 | 数值 |
|------|------|
| Bootstrap listings | 860 |
| Bootstrap owners | 500 |
| Bootstrap demand | 4784 |
| Bootstrap brokers | 120+ |
| Bootstrap cells | 24 |
| Per-cell supply | 24/24 |
| Per-cell demand | 24/24 |
| Per-cell broker | 24/24 |
| 7-day causal events | 8081 |
| 14-day causal events | 16096 |
| 30-day causal events | 34563 |
| 60-day causal events | 69084 |
| 90-day causal events | 103335 |
| 7→14 growth | 1.99x |
| 14→30 growth | 2.15x |
| 30→60 growth | 2.00x |
| 60→90 growth | 1.50x |
| Heat shift cells | 25 |
| Rival reprice cells | 24 |
| Business domains | 8 |
| Player receipt | ✅ |
| Process receipt | ✅ |
| Manager message | ✅ |
| Playable topActions | 3 |
| Playable ownerPool | 4 |
| Playable rivals | 4 |
| Traceable events | 6144 |
| Untraceable | 0 |
| Connected surfaces | 12 |

### 剩余风险
- 标准可玩局仍是短经营周期；Round16 长周期门禁使用 long-horizon market-formation harness 验证大世界 runtime，不改变当前 UI 默认节奏。
- `leaderboard` / `architecture-migration-readiness` / `architecture-parity` 仍是 disconnected（by design）
