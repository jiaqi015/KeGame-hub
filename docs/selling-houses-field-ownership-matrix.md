# 卖房（资产顾问）字段归属表

> **本文件由 `scripts/generate-field-ownership-matrix.ts` 自动生成。**
> 唯一 SOT 是 `src/selling-houses/core/world-state/legacy-case-field-ownership.ts`。
> 如需修改字段归属，请改 TS registry 后运行 `npx tsx scripts/generate-field-ownership-matrix.ts`。

最后生成：2026-05-21

---

## 资产画像

| 字段 | 归属 | 角色 | 目标概念 | 迁移说明 |
| ---- | ---- | ---- | -------- | -------- |
| `area` | Case | canonical | AssetCase.area | Area is an asset profile fact. |
| `community` | Case | canonical | AssetCase.community | Community belongs to the asset profile and market placement. |
| `defects` | Case | canonical | AssetCase.defects | Defects are asset profile descriptors. |
| `district` | Case | canonical | AssetCase.district | District is an asset location fact. |
| `heat` | Case | canonical | AssetCase.heat | Heat is current asset runtime performance until a separate CaseRuntime exists. |
| `housePrototypeId` | Case | canonical | AssetCase.housePrototypeId | Prototype identity is an asset profile fact. |
| `id` | Case | canonical | AssetCase.id / legacyCaseId | Legacy Case remains the source id while AssetCase is derived from it. |
| `layout` | Case | canonical | AssetCase.layout | Layout is an asset profile fact. |
| `marketCellId` | Case | canonical | AssetCase.marketCellId / Region.id | Market cell locates the asset in the world map. |
| `story` | Case | canonical | AssetCase.story | Story is authored asset profile context. |
| `tags` | Case | canonical | AssetCase.tags | Tags are asset profile descriptors. |
| `title` | Case | canonical | AssetCase.title | House title is an asset profile fact. |

## 价格模型

| 字段 | 归属 | 角色 | 目标概念 | 迁移说明 |
| ---- | ---- | ---- | -------- | -------- |
| `askPrice` | OwnerCaseRelation | mirror | OwnerCaseRelation.askPrice / listing price | Current listing price is shaped by selling this asset for this owner. |
| `bottomPrice` | OwnerCaseRelation | mirror | OwnerCaseRelation.bottomPrice | Bottom price is the owner-case negotiation floor for this listing. |
| `lastAskPrice` | OwnerCaseRelation | migrate | OwnerCaseRelation.priceHistory | Previous asking price belongs in relation price history. |
| `lastPriceActionDay` | OwnerCaseRelation | migrate | OwnerCaseRelation.lastPriceActionDay | Pricing action recency belongs with the sale relation. |
| `marketPrice` | PriceModelOutput / AssetScoreSnapshot | mirror | PriceModelOutput.marketEstimatedPrice | Market price is a pricing model output mirror, not an intrinsic asset fact. |
| `priceGapPct` | PriceModelOutput / AssetScoreSnapshot | mirror | PriceModelOutput.priceGapToMarket | Price gap is a pricing model output mirror. |

## 业主画像

| 字段 | 归属 | 角色 | 目标概念 | 迁移说明 |
| ---- | ---- | ---- | -------- | -------- |
| `ownerArchetypeId` | Owner | canonical | Owner.archetypeId | Keep on legacy Case until Owner is authored independently. |
| `ownerMood` | Owner | canonical | Owner.mood / OwnerCaseRelation.ownerMood | Current legacy field feeds Owner and OwnerCaseRelation read models. |
| `ownerName` | Owner | canonical | Owner.name | Owner name stays on legacy Case until Owner is authored independently. |
| `ownerProfilingMemory` | Owner | migrate | OwnerProfilingMemory | First-visit profiling memory should eventually live on the owner memory model, but is persisted on legacy Case during migration. |
| `personality` | Owner | canonical | Owner.personality | Owner personality stays on legacy Case until Owner is authored independently. |

## 业主决策

| 字段 | 归属 | 角色 | 目标概念 | 迁移说明 |
| ---- | ---- | ---- | -------- | -------- |
| `patience` | OwnerCaseRelation | mirror | OwnerCaseRelation.patience | Patience is owner-side decision readiness. Read through relationReadProjection.readRelationReadiness() or readCaseRelationBundle(). |
| `urgency` | OwnerCaseRelation | mirror | OwnerDecisionReadiness | Urgency is owner-side decision pressure for this sale relation. |
| `windowDays` | OwnerCaseRelation | mirror | OwnerCaseRelation.windowDays | Sale window belongs to the owner-case relation and owner decision boundary. |

## 经纪关系

| 字段 | 归属 | 角色 | 目标概念 | 迁移说明 |
| ---- | ---- | ---- | -------- | -------- |
| `lastOwnerTouchedDay` | BrokerOwnerRelation | mirror | BrokerOwnerRelation.lastOwnerTouchedDay | Owner touch recency belongs to the broker-owner relation. |
| `maintainerName` | BrokerOwnerRelation | migrate | BrokerOwnerRelation.brokerId | Maintainer is a broker relation reference, not an asset field. |
| `touchedOwnerToday` | BrokerOwnerRelation | mirror | BrokerOwnerRelation.touchedOwnerToday | Owner touch state belongs to the broker-owner relation. |
| `trust` | BrokerOwnerRelation | mirror | BrokerOwnerRelation.trust | Trust is between broker and owner, never an asset-case fact. Read through relationReadProjection.readRelationTrust() or readCaseRelationBundle(). |

## 评估模型

| 字段 | 归属 | 角色 | 目标概念 | 迁移说明 |
| ---- | ---- | ---- | -------- | -------- |
| `axisScores` | PriceModelOutput / AssetScoreSnapshot | mirror | AssetScoreSnapshot.inputs.axisScores | Axis scores are evaluation inputs for D2, not mutable asset facts. |
| `competitiveness` | PriceModelOutput / AssetScoreSnapshot | mirror | AssetScoreSnapshot.score | Competitiveness mirrors the legacy asset score read model. |
| `competitivenessSnapshots` | PriceModelOutput / AssetScoreSnapshot | mirror | AssetScoreSnapshot.history | Score snapshots are evaluation history. |
| `d1` | PriceModelOutput / AssetScoreSnapshot | mirror | AssetScoreSnapshot.dimensions.d1 | D1 mirrors demand and funnel evaluation. |
| `d2` | PriceModelOutput / AssetScoreSnapshot | mirror | AssetScoreSnapshot.dimensions.d2 | D2 mirrors intrinsic asset quality evaluation. |
| `d3` | PriceModelOutput / AssetScoreSnapshot | mirror | AssetScoreSnapshot.dimensions.d3 | D3 is a legacy mixed evaluation mirror and still contains owner relation inputs. |

## 生命周期

| 字段 | 归属 | 角色 | 目标概念 | 迁移说明 |
| ---- | ---- | ---- | -------- | -------- |
| `competitionGroupIds` | ListingLifecycle | mirror | CaseCompetitionRelation | Competition membership is relation state currently mirrored on Case. |
| `hasCompletedFirstVisit` | ListingLifecycle | migrate | ListingLifecycle.firstVisitCompleted | First visit completion is a lifecycle milestone. |
| `lastRivalThreatDay` | ListingLifecycle | migrate | RivalPressureProcess.lastThreatDay | Rival threat recency is process/event-derived state. |
| `offers` | ListingLifecycle | mirror | ListingLifecycle.offers | Offer count mirrors lifecycle/event-derived process facts. |
| `openDayCooldown` | ListingLifecycle | migrate | OpenDayProcess.cooldown | Open-day cooldown is process state. |
| `soldPrice` | ListingLifecycle | mirror | ListingLifecycle.soldPrice | Sold price is a lifecycle result fact, not a live asset profile field. |
| `stageIndex` | ListingLifecycle | mirror | ListingLifecycle.stageIndex | Stage index is a process/lifecycle mirror, not house profile. |
| `stageLabel` | ListingLifecycle | mirror | ListingLifecycle.stageLabel | Stage label mirrors listing lifecycle presentation. |
| `status` | ListingLifecycle | mirror | ListingLifecycle.status | Status mirrors listing lifecycle state and is still copied into AssetCase. |
| `viewings` | ListingLifecycle | mirror | ListingLifecycle.viewings | Viewing count mirrors lifecycle/event-derived process facts. |

## 运行时

| 字段 | 归属 | 角色 | 目标概念 | 迁移说明 |
| ---- | ---- | ---- | -------- | -------- |
| `actionsApplied` | DayScratch | migrate | ActionLedger.appliedActionIds | Applied action ids should move to an action ledger or event stream. |
| `actionsToday` | DayScratch | migrate | DailyActionBudget.caseUsage | Daily action counters are run scratch state. |
| `lastAction` | DayScratch | migrate | ActionLedger.lastCaseAction | Last action should come from action/event history. |
| `lastTouchedDay` | DayScratch | migrate | DailyTouchLedger.lastCaseTouchedDay | Case touch recency should be ledger-backed. |
| `touchedToday` | DayScratch | migrate | DailyTouchLedger.caseTouchedToday | Touch markers are day scratch state and should be recomputed or ledger-backed. |

## 投影/UI

| 字段 | 归属 | 角色 | 目标概念 | 迁移说明 |
| ---- | ---- | ---- | -------- | -------- |
| `defenseOutcome` | Projection | migrate | ResultProjection.defenseOutcome | Defense outcome is settlement projection output. |
| `endingBucket` | Projection | migrate | ResultProjection.endingBucket | Ending bucket is result projection output. |
| `endingSummary` | Projection | migrate | ResultProjection.endingSummary | Ending summary is projection copy and should not drive world state. |
| `endingType` | Projection | migrate | ResultProjection.endingType | Ending type is result projection output. |
| `goalTier` | Projection | migrate | ScenarioGoalProjection.goalTier | Goal tier is run/scenario projection metadata for player-facing evaluation. |
| `isFocused` | Projection | migrate | SessionViewport.focusedCaseIds | Focus is player viewport/session state. |
| `ownerSatisfaction` | Projection | migrate | ResultProjection.ownerSatisfaction | Owner satisfaction is settlement/review projection output in the current legacy model. |
| `relativeOutcome` | Projection | migrate | ResultProjection.relativeOutcome | Relative outcome is settlement projection output. |
| `riskFlags` | Projection | migrate | CaseDetailProjection.riskFlags | Risk flags are player-facing projection output and should not become world truth. |
| `storylineState` | Projection | migrate | CaseNarrativeProjection.storylineState | Storyline state is a derived narrative projection. |

## 历史遗留

| 字段 | 归属 | 角色 | 目标概念 | 迁移说明 |
| ---- | ---- | ---- | -------- | -------- |
| `negotiationBonus` | （已废弃） | migrate | NegotiationProcess.bonusSignals | Legacy negotiation bonus should be replaced by negotiation process state. |
| `qualityStory` | （已废弃） | migrate | AssetScoreSnapshot.inputs.qualityNarrative | Legacy bonus flag should be replaced by evaluation inputs or events. |

---

## 价格术语对照

文档（price-model.md）和代码（models.ts Case 字段）使用不同命名。对照表：

| 语义 | 文档命名 | 代码字段 | 归属 | 说明 |
| ---- | -------- | -------- | ---- | ---- |
| 挂牌价 | `listingPrice` | `askPrice` | OwnerCaseRelation | 当前对外挂价 |
| 市场估价 | `marketEstimatedPrice` | `marketPrice` | PriceModelOutput | 模型评估的市场价 |
| 底价 | — | `bottomPrice` | OwnerCaseRelation | 业主能接受的最低成交价 |
| 业主心理价 | `ownerPsychPrice` | — | PriceModelOutput | 业主认为合理的价格（≠底价） |
| 价差 | `priceGapToMarket` | `priceGapPct` | PriceModelOutput | 挂牌价与市场价的差距百分比 |
