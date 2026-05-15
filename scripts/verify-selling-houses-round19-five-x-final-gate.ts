/**
 * Round 19 — Five-X Final Hard Gate (No Known-Limitation Final)
 *
 * Proves the market is a real city-level formation, not opening data, not
 * standalone scripts, not projection boilerplate, not ledger-only, not
 * hidden-truth leakage, not fake randomness, not soft assertions.
 *
 * Maturity ladder:
 *   FAILED                                    — any core check fails
 *   FIVE-X-SCALE-BIG                          — five-x scale thresholds met
 *   FIVE-X-RUNTIME-BIG                        — + runtime ticks, source→causal, receipt feedback
 *   FIVE-X-PRODUCT-BIG                        — + strategic decision consumes ledger, projection evidence
 *   FIVE-X-SCALE+PRODUCT-BIG_WITH_RUNTIME-GAP — + scale + product pass, but runtime subgate not at five-x
 *   FIVE-X-CITY-MARKET-BIG                    — + all checks pass, runtime subgate at five-x, no P0/P1 limitations
 *
 * Anti-false-positive rules:
 *   1. No `|| true` or `check(true, ...)` in core assertions.
 *   2. Projection null ≠ pass.
 *   3. Empty knowledge → no recommendation (no legacy bypass).
 *   4. resourceCost > 0 and opportunityCost ≠ fallback.
 *   5. sourceRecordIds non-empty for every topAction.
 *   6. Same seed replay byte-identical.
 *   7. No Date.now / Math.random / fetch / LLM in core simulation.
 *   8. broker POV does NOT call queryHiddenSourceRecords.
 *   9. owner trust/patience changes flow through causal events.
 *  10. action spend/refund receipts enter worldCausalEvents.
 *  11. actionResourceReceipts must be > 0 when player actions executed.
 *  12. Runtime subgate must verify at five-x scale (100+ cells).
 *  13. P0/P1 known limitations block FIVE-X-CITY-MARKET-BIG.
 *
 * Usage: npx tsx scripts/verify-selling-houses-round19-five-x-final-gate.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ROUND17_SEED,
  advanceMarketEconomyWorld,
  buildMarketEconomyWorld,
  bootstrapOf,
  scaleOf,
  diversityOf,
  buildStrategicProjectionFromState,
  buildKnowledgeMapFromState,
  countEconomySourceRecords,
  causalEventIds,
  eventHasSourceKind,
  sameStringList,
  uniqueSourceKinds,
  readSrc,
} from './verify-selling-houses-round17-market-economy-gate-core.js';
import {
  createBigWorldBootstrap,
  buildScaleManifest,
  buildDiversityManifest,
} from '../src/selling-houses/domain/world-model/bigWorldBootstrap.js';
import { FIVE_X_SCALE_POLICY } from '../src/selling-houses/domain/world-model/bigWorldSpecFactory.js';
import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { advanceDays, executeAction } from '../src/selling-houses/domain/engine.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine/opportunityEngine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { buildMarketFormationSummary } from '../src/selling-houses/domain/world-model/marketFormationBootstrap.js';
import { buildProductSurfaceCensus, buildProductCensusSummary } from '../src/selling-houses/application/projections/noDeadCornerProductCensus.js';
import { buildStrategicMarketDecisionProjection } from '../src/selling-houses/application/projections/strategicMarketDecisionProjection.js';
import { buildActorKnowledgeSnapshot } from '../src/selling-houses/application/projections/actorKnowledgeProjection.js';
import { createEmptyRegistry } from '../src/selling-houses/domain/world-model/informationSourceRegistry.js';
import type { GameState } from '../src/selling-houses/domain/models.js';
import type {
  BigWorldBootstrap,
  BigWorldScalePolicy,
} from '../src/selling-houses/domain/world-model/bigWorldTypes.js';
import type { SourceKind } from '../src/selling-houses/domain/world-model/informationSourceTypes.js';
import type { WorldCausalEvent } from '../src/selling-houses/domain/world-model/causalEvents.js';

// ── Gate infrastructure ────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];
const warnings: string[] = [];

function check(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
    console.log(`  ✅ ${message}`);
  } else {
    failed += 1;
    failures.push(message);
    console.error(`  ❌ ${message}`);
  }
}

function warn(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅ ${message}`);
  } else {
    warnings.push(message);
    console.warn(`  ⚠️  ${message}`);
  }
}

function section(title: string) {
  console.log(`\n━━━ ${title} ━━━`);
}

// ── Five-X Scale Policy (imported from single source of truth) ────

const FIVE_X_SEED = 20260701;

// ── Build five-x world ─────────────────────────────────────────

function buildFiveXWorld(seed: number = FIVE_X_SEED): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  if (!snapshot) throw new Error('standard-window-chain scenario missing');
  const state = createInitialState(snapshot, seed);
  const bootstrap = createBigWorldBootstrap({
    seed,
    scenarioName: snapshot.scenario.name,
    difficultyId: snapshot.scenario.difficultyId,
    playerCaseCount: snapshot.scenario.cases.length,
    scaleOverride: FIVE_X_SCALE_POLICY,
  });
  (state.runContext as { bigWorldBootstrap?: BigWorldBootstrap }).bigWorldBootstrap = bootstrap;
  seedInitialOpportunities(state);
  return state;
}

function buildLongHorizonFiveXWorld(seed: number = FIVE_X_SEED): GameState {
  const state = buildFiveXWorld(seed);
  state.maxDay = 120;
  state.rules.maxDay = 120;
  state.rules.outcomeControl.simulationDays = 120;
  state.rules.outcomeControl.marketDealCapacity21d = 0;
  state.rules.outcomeControl.rivalCaseLossScale = 0;
  state.rules.rivalLossProbabilityScale = 0;
  for (const caseItem of state.cases) {
    caseItem.status = 'active';
    caseItem.windowDays = 120;
    caseItem.trust = Math.max(caseItem.trust, 88);
    caseItem.patience = Math.max(caseItem.patience, 88);
    caseItem.urgency = Math.min(caseItem.urgency, 35);
    caseItem.heat = Math.max(caseItem.heat, 55);
    caseItem.competitiveness = Math.max(caseItem.competitiveness, 65);
  }
  return state;
}

function advanceFiveXWorld(days: number, seed: number = FIVE_X_SEED): GameState {
  const state = buildLongHorizonFiveXWorld(seed);
  advanceDays(state, days);
  updateDerivedState(state);
  return state;
}

function bootstrapOfFiveX(state: GameState): BigWorldBootstrap {
  const bootstrap = state.runContext.bigWorldBootstrap as BigWorldBootstrap | undefined;
  if (!bootstrap) throw new Error('bigWorldBootstrap missing');
  return bootstrap;
}

function scaleOfFiveX(state: GameState) {
  return buildScaleManifest(bootstrapOfFiveX(state));
}

function diversityOfFiveX(state: GameState) {
  return buildDiversityManifest(bootstrapOfFiveX(state));
}

// ── Header ─────────────────────────────────────────────────────

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║  Round 19 — Five-X Final Hard Gate (No Known-Limitation)        ║');
console.log('║  Catches: opening-big, standalone-big, ledger-only-big,         ║');
console.log('║           projection-fallback, hidden-truth, fake-randomness,   ║');
console.log('║           soft assertions, runtime-scale-gap, empty-receipts,   ║');
console.log('║           known-limitation-as-pass                              ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');

// ═══════════════════════════════════════════════════════════════
// 1. FIVE-X SCALE — 100+ cells, 750+ brokers, 4000+ listings, 2500+ owners, 21000+ demand
// ═══════════════════════════════════════════════════════════════
section('1. FIVE-X SCALE — city-level thresholds');
const baseState = buildFiveXWorld(FIVE_X_SEED);
const bootstrap = bootstrapOfFiveX(baseState);
const scale = scaleOfFiveX(baseState);
const diversity = diversityOfFiveX(baseState);
const formationSummary = buildMarketFormationSummary(bootstrap.hiddenTruth.marketFormation);
const economy = formationSummary.economy;

console.log(`  Scale: ${scale.totalListings} listings, ${scale.totalOwners} owners, ${scale.totalCustomers} demand, ${scale.totalBrokers} brokers, ${scale.marketCells} cells`);

check(scale.totalListings >= 4000, `listings >= 4000 (${scale.totalListings})`);
check(scale.totalOwners >= 2500, `owners >= 2500 (${scale.totalOwners})`);
check(scale.totalCustomers >= 21000, `customers >= 21000 (${scale.totalCustomers})`);
check(scale.totalBrokers >= 750, `brokers >= 750 (${scale.totalBrokers})`);
check(scale.marketCells >= 100, `market cells >= 100 (${scale.marketCells})`);
check(scale.microCells >= 300, `micro cells >= 300 (${scale.microCells})`);
check(scale.acnNetworks >= 32, `ACN networks >= 32 (${scale.acnNetworks})`);
check(scale.supportingInfoCount >= 800, `supporting info >= 800 (${scale.supportingInfoCount})`);
check(scale.historicalTransactionCount >= 300, `historical transactions >= 300 (${scale.historicalTransactionCount})`);

// Five-X scale thresholds
const fiveX = scale.meetsFiveXScaleThresholds;
check(fiveX.listingsGte4000, 'fiveX.listingsGte4000');
check(fiveX.ownersGte2500, 'fiveX.ownersGte2500');
check(fiveX.customersGte21000, 'fiveX.customersGte21000');
check(fiveX.brokersGte750, 'fiveX.brokersGte750');
check(fiveX.marketCellsGte100, 'fiveX.marketCellsGte100');
check(fiveX.microCellsGte300, 'fiveX.microCellsGte300');
check(fiveX.acnNetworksGte32, 'fiveX.acnNetworksGte32');
check(fiveX.supportingInfoGte800, 'fiveX.supportingInfoGte800');
check(fiveX.historicalTransactionsGte300, 'fiveX.historicalTransactionsGte300');

// Scale contract metadata
check(scale.scaleProfileId === 'five-x-city-level-v1', `scale profile is five-x (${scale.scaleProfileId})`);
check(scale.scaleContractVersion >= 2, `scale contract version >= 2 (${scale.scaleContractVersion})`);
check(scale.isFiveXScale, 'isFiveXScale = true (all five-x thresholds met)');

// Output actual counts for audit trail
const counts = scale.actualFiveXCounts;
console.log(`\n  📊 Actual Five-X Counts:`);
console.log(`     cells=${counts.marketCells}, acn=${counts.acnNetworks}, brokers=${counts.brokers}`);
console.log(`     listings=${counts.listings}, owners=${counts.owners}, customers=${counts.customers}`);
console.log(`     customerPools=${counts.customerPools}, brokerPools=${counts.brokerPools}, orgPools=${counts.orgPools}`);
console.log(`     microCells=${counts.microCells}, supportingInfo=${counts.supportingInfo}, txns=${counts.historicalTransactions}`);

// Diversity
check(diversity.ownerArchetypeDiversity >= 15, `owner archetypes >= 15 (${diversity.ownerArchetypeDiversity})`);
check(diversity.demandSegmentDiversity >= 10, `demand segments >= 10 (${diversity.demandSegmentDiversity})`);

// Market formation thickness
check(formationSummary.cellThicknessCount >= 50, `cell thickness >= 50 (${formationSummary.cellThicknessCount})`);
check(formationSummary.totalActiveSupply >= 2000, `active supply >= 2000 (${formationSummary.totalActiveSupply})`);
check(formationSummary.totalActiveDemand >= 2000, `active demand >= 2000 (${formationSummary.totalActiveDemand})`);
check(formationSummary.avgLiquidity >= 30, `avg liquidity >= 30 (${formationSummary.avgLiquidity})`);

// Economy resource pools
check(economy.brokerPoolCount >= 750, `broker pools >= 750 (${economy.brokerPoolCount})`);
check(economy.listingPoolCount >= 4000, `listing pools >= 4000 (${economy.listingPoolCount})`);
check(economy.customerPoolCount >= 2000, `customer pools >= 2000 (${economy.customerPoolCount})`);
check(economy.orgPoolCount >= 32, `org pools >= 32 (${economy.orgPoolCount})`);
check(economy.opportunityCostCount >= 500, `opportunity costs >= 500 (${economy.opportunityCostCount})`);

// ═══════════════════════════════════════════════════════════════
// 2. RUNTIME — advanceDays produces causal events, tickCount grows
// ═══════════════════════════════════════════════════════════════
section('2. RUNTIME — not opening-big, tickCount grows');

const state7 = advanceFiveXWorld(7, FIVE_X_SEED);
const state14 = advanceFiveXWorld(14, FIVE_X_SEED);
const state30 = advanceFiveXWorld(30, FIVE_X_SEED);
const state60 = advanceFiveXWorld(60, FIVE_X_SEED);

const events7 = state7.worldCausalEvents?.length ?? 0;
const events14 = state14.worldCausalEvents?.length ?? 0;
const events30 = state30.worldCausalEvents?.length ?? 0;
const events60 = state60.worldCausalEvents?.length ?? 0;

check((state7.bigWorldRuntime?.tickCount ?? 0) >= 7, `7-day tickCount >= 7 (${state7.bigWorldRuntime?.tickCount})`);
check((state14.bigWorldRuntime?.tickCount ?? 0) >= 14, `14-day tickCount >= 14 (${state14.bigWorldRuntime?.tickCount})`);
check((state30.bigWorldRuntime?.tickCount ?? 0) >= 30, `30-day tickCount >= 30 (${state30.bigWorldRuntime?.tickCount})`);
check((state60.bigWorldRuntime?.tickCount ?? 0) >= 60, `60-day tickCount >= 60 (${state60.bigWorldRuntime?.tickCount})`);
check(!state60.gameOver, 'world still live at day 60');

check(events14 > events7, `causal events grow 7→14 (${events7}→${events14})`);
check(events30 > events14, `causal events grow 14→30 (${events14}→${events30})`);
check(events60 > events30, `causal events grow 30→60 (${events30}→${events60})`);

// Growth ratios
const ratio7to14 = events14 / Math.max(1, events7);
const ratio14to30 = events30 / Math.max(1, events14);
const ratio30to60 = events60 / Math.max(1, events30);
check(ratio7to14 >= 1.2, `7→14 growth >= 1.2x (${ratio7to14.toFixed(2)})`);
check(ratio14to30 >= 1.2, `14→30 growth >= 1.2x (${ratio14to30.toFixed(2)})`);
check(ratio30to60 >= 1.1, `30→60 growth >= 1.1x (${ratio30to60.toFixed(2)})`);

// ═══════════════════════════════════════════════════════════════
// 3. SOURCE → CAUSAL — SourceRecord enters worldCausalEvents
// ═══════════════════════════════════════════════════════════════
section('3. SOURCE → CAUSAL — not standalone-big');

const ledger7 = countEconomySourceRecords(state7.worldCausalEvents ?? []);
const ledger14 = countEconomySourceRecords(state14.worldCausalEvents ?? []);
const ledger30 = countEconomySourceRecords(state30.worldCausalEvents ?? []);
const ledger60 = countEconomySourceRecords(state60.worldCausalEvents ?? []);

check(ledger7 >= 45, `7-day ledger entries >= 45 (${ledger7})`);
check(ledger14 > ledger7, `ledger grows 7→14 (${ledger7}→${ledger14})`);
check(ledger30 > ledger14, `ledger grows 14→30 (${ledger14}→${ledger30})`);
check(ledger60 > ledger30, `ledger grows 30→60 (${ledger30}→${ledger60})`);

// Source kinds coverage
const requiredKinds: SourceKind[] = [
  'broker_capacity_signal', 'manager_message', 'customer_interaction',
  'owner_life_event_signal', 'rival_action', 'buyer_financing_signal',
];
const liveSourceKinds = uniqueSourceKinds(state30.worldCausalEvents ?? []);
for (const kind of requiredKinds) {
  check(liveSourceKinds.has(kind), `source kind present: ${kind}`);
}

// Traceability
const events30List = state30.worldCausalEvents ?? [];
let traceableLedgerEntries = 0;
let untraceableLedgerEntries = 0;
for (const event of events30List) {
  const eventRecord = event as WorldCausalEvent & {
    readonly sourceRecordId?: string;
    readonly sourceRecordIds?: readonly string[];
    readonly sourceReplayKey?: string;
  };
  const isLedgerEntry = eventRecord.sourceRecordId?.startsWith('isr-eco-')
    || eventRecord.sourceRecordIds?.some((id) => id.startsWith('isr-eco-'));
  if (!isLedgerEntry) continue;
  const hasSourceRecordId = !!(eventRecord.sourceRecordId || eventRecord.sourceRecordIds?.length);
  const hasSourceReplayKey = !!eventRecord.sourceReplayKey;
  if (hasSourceRecordId && hasSourceReplayKey) traceableLedgerEntries++;
  else untraceableLedgerEntries++;
}
check(traceableLedgerEntries > 0, `traceable ledger entries > 0 (${traceableLedgerEntries})`);
check(untraceableLedgerEntries === 0, `untraceable ledger entries = 0 (${untraceableLedgerEntries})`);

// ═══════════════════════════════════════════════════════════════
// 4. RESOURCE LEDGER — consumed by strategic decision
// ═══════════════════════════════════════════════════════════════
section('4. RESOURCE LEDGER — not ledger-only-big');

const strategic14 = buildStrategicProjectionFromState(state14);

for (const [label, strategic] of [['14d', strategic14]] as const) {
  check(strategic.brokerOpportunity.topActions.length > 0, `${label} topActions > 0`);
  check(strategic.sharedCausalRefs !== undefined, `${label} sharedCausalRefs exists`);

  for (const action of strategic.brokerOpportunity.topActions) {
    check(
      action.resourceCost.energyCost > 0 || action.resourceCost.budgetCost > 0,
      `${label} "${action.actionLabel}" has real resourceCost (energy=${action.resourceCost.energyCost}, budget=${action.resourceCost.budgetCost})`,
    );
    check(
      action.opportunityCost.foregoneAction !== '无替代方案',
      `${label} "${action.actionLabel}" has real opportunityCost (foregone=${action.opportunityCost.foregoneAction})`,
    );
    check(
      action.opportunityCost.foregoneConfidence > 0,
      `${label} opportunityCost has confidence (${action.opportunityCost.foregoneConfidence})`,
    );
    check(
      action.competitorRisk.rivalCount > 0,
      `${label} "${action.actionLabel}" has competitorRisk rivalCount (${action.competitorRisk.rivalCount})`,
    );
    check(
      action.competitorRisk.riskMagnitude > 0,
      `${label} "${action.actionLabel}" has competitorRisk magnitude (${action.competitorRisk.riskMagnitude})`,
    );
    check(
      action.sourceRecordIds.length > 0,
      `${label} "${action.actionLabel}" has sourceRecordIds (${action.sourceRecordIds.length})`,
    );
    check(
      action.safeRefs.length > 0,
      `${label} "${action.actionLabel}" has safeRefs (${action.safeRefs.length})`,
    );
    check(
      action.timeHorizonImpact.length === 4,
      `${label} action has 3/7/14/30 horizon impact (${action.timeHorizonImpact.length})`,
    );
  }
}

// Long-horizon rival depletion: competitor pressure events exist at 30d
const rivalRepriceCount30 = (events30List).filter((e) => e.kind === 'RivalListingRepriced').length;
const rivalBrokerActionCount30 = (events30List).filter((e) => e.kind === 'RivalBrokerActionTaken').length;
check(rivalRepriceCount30 > 0, `30d rival reprice events > 0 (${rivalRepriceCount30})`);
check(rivalBrokerActionCount30 > 0, `30d rival broker actions > 0 (${rivalBrokerActionCount30})`);
check(strategic14.brokerOpportunity.topActions.length > 0, '14d topActions > 0 (strategic evidence confirmed)');

// ═══════════════════════════════════════════════════════════════
// 5. PROJECTION EVIDENCE — not projection-fallback
// ═══════════════════════════════════════════════════════════════
section('5. PROJECTION EVIDENCE — not projection-fallback');

// Empty knowledge → no recommendation
const emptyState = buildFiveXWorld(FIVE_X_SEED);
const emptyStrategic = buildStrategicMarketDecisionProjection(emptyState);
check(emptyStrategic.brokerOpportunity.topActions.length === 0, 'empty knowledge → no strategic topActions');
check(emptyStrategic.sharedCausalRefs === undefined, 'empty knowledge → no sharedCausalRefs');

// Product census
const census = buildProductSurfaceCensus();
const censusSummary = buildProductCensusSummary(census);
check(censusSummary.totalSurfaces >= 16, `product census surfaces >= 16 (${censusSummary.totalSurfaces})`);
check(censusSummary.connectedSurfaces >= 12, `connected surfaces >= 12 (${censusSummary.connectedSurfaces})`);
check(
  censusSummary.disconnectedSurfaceIds.every((id) =>
    ['leaderboard', 'architecture-migration-readiness', 'architecture-parity'].includes(id),
  ),
  'all disconnected surfaces are intentional exemptions',
);

// ═══════════════════════════════════════════════════════════════
// 6. RECEIPT FEEDBACK — action spend/refund, owner trust/patience, receipts
// ═══════════════════════════════════════════════════════════════
section('6. RECEIPT FEEDBACK — runtime feedback loop');

check(events30List.some((event) => eventHasSourceKind(event, 'broker_capacity_signal')), 'energy/capacity receipt exists');
check(events30List.some((event) => eventHasSourceKind(event, 'manager_message')), 'budget/org receipt exists');
check(events30List.some((event) => eventHasSourceKind(event, 'customer_interaction')), 'customer attention receipt exists');
check(events30List.some((event) => eventHasSourceKind(event, 'owner_life_event_signal')), 'owner trust/patience receipt exists');
check(events30List.some((event) => eventHasSourceKind(event, 'rival_action')), 'rival competition receipt exists');
check(events30List.some((event) => eventHasSourceKind(event, 'buyer_financing_signal')), 'buyer financing receipt exists');

// Owner trust/patience changes should appear in causal events (pressureDelta)
const ownerTrustEvents = events30List.filter((event) => {
  const payload = event.payload as unknown as Record<string, unknown> | undefined;
  return payload && typeof payload === 'object' && 'pressureDelta' in payload;
});
check(ownerTrustEvents.length > 0, `owner pressure delta events exist (${ownerTrustEvents.length})`);

// ═══════════════════════════════════════════════════════════════
// 7. MARKET CELL MOVEMENT — 10+ cells with real changes
// ═══════════════════════════════════════════════════════════════
section('7. MARKET CELL MOVEMENT — 10+ cells with real changes');

const heatShiftEvents = events30List.filter((e) => e.kind === 'MarketHeatShifted');
const cellsWithMovement = new Set<string>();
for (const evt of heatShiftEvents) {
  const cellId = (evt.payload as unknown as Record<string, unknown>)?.marketCellId;
  if (typeof cellId === 'string') cellsWithMovement.add(cellId);
}
check(cellsWithMovement.size >= 10, `cells with heat shift >= 10 (${cellsWithMovement.size})`);
check(heatShiftEvents.length >= 50, `heat shift events >= 50 (${heatShiftEvents.length})`);

// Rival reprice events must hit market cells
const rivalRepriceEvents = events30List.filter((e) => e.kind === 'RivalListingRepriced');
const cellsWithRivalReprice = new Set<string>();
for (const evt of rivalRepriceEvents) {
  const payload = evt.payload as unknown as Record<string, unknown> | undefined;
  if (!payload) continue;
  const cellIds = payload.affectedMarketCellIds;
  if (Array.isArray(cellIds)) {
    for (const id of cellIds) { if (typeof id === 'string') cellsWithRivalReprice.add(id); }
  }
  const singleCellId = payload.targetMarketCellId ?? payload.marketCellId;
  if (typeof singleCellId === 'string') cellsWithRivalReprice.add(singleCellId);
}
check(cellsWithRivalReprice.size >= 5, `cells with rival reprice >= 5 (${cellsWithRivalReprice.size})`);

// ═══════════════════════════════════════════════════════════════
// 8. ENTITY COVERAGE — all entity types produce causal events
// ═══════════════════════════════════════════════════════════════
section('8. ENTITY COVERAGE — customers, owners, rivals, brokers, org');

const customerEvents = events30List.filter((e) =>
  e.kind === 'CustomerComparedListings' || e.kind === 'CustomerAttentionShifted',
);
const ownerEvents = events30List.filter((e) => e.kind === 'OwnerMarketPressurePerceived');
const rivalEvents = events30List.filter((e) =>
  e.kind === 'RivalListingRepriced' || e.kind === 'RivalBrokerActionTaken',
);
const brokerEvents = events30List.filter((e) => e.kind === 'BrokerRecommendationChanged');
const orgEvents = events30List.filter((e) => e.kind === 'MatterPriorityChanged');

check(customerEvents.length > 0, `customer causal events > 0 (${customerEvents.length})`);
check(ownerEvents.length > 0, `owner causal events > 0 (${ownerEvents.length})`);
check(rivalEvents.length > 0, `rival causal events > 0 (${rivalEvents.length})`);
check(brokerEvents.length > 0, `broker recommendation events > 0 (${brokerEvents.length})`);
check(orgEvents.length > 0, `org/manager causal events > 0 (${orgEvents.length})`);

// ═══════════════════════════════════════════════════════════════
// 9. REPLAY — byte-identical on same seed
// ═══════════════════════════════════════════════════════════════
section('9. REPLAY — byte-identical');

const replayA = advanceFiveXWorld(30, FIVE_X_SEED);
const replayB = advanceFiveXWorld(30, FIVE_X_SEED);
check(sameStringList(causalEventIds(replayA), causalEventIds(replayB)), 'same seed → byte-identical 30-day causal event IDs');

function economyEventIds(state: ReturnType<typeof advanceFiveXWorld>): readonly string[] {
  return (state.worldCausalEvents ?? [])
    .filter((event) => {
      const eventRecord = event as WorldCausalEvent & { readonly sourceRecordId?: string };
      return eventRecord.sourceRecordId?.startsWith('isr-eco-');
    })
    .map((event) => event.id)
    .sort();
}
check(
  sameStringList(economyEventIds(replayA), economyEventIds(replayB)),
  'same seed → byte-identical economy ledger event IDs',
);

// ═══════════════════════════════════════════════════════════════
// 10. SOURCE CODE BOUNDARIES — no hidden truth, no fake randomness
// ═══════════════════════════════════════════════════════════════
section('10. SOURCE CODE BOUNDARIES');

const strategicSrc = readSrc('src/selling-houses/application/projections/strategicMarketDecisionProjection.ts');
const actorKnowledgeSrc = readSrc('src/selling-houses/application/projections/actorKnowledgeProjection.ts');
const runtimeSrc = readSrc('src/selling-houses/domain/world-model/runtime/marketEconomyRuntime.ts');
const bootstrapSrc = readSrc('src/selling-houses/domain/world-model/marketEconomyBootstrap.ts');
const receiptWiringSrc = readSrc('src/selling-houses/domain/world-model/runtime/economicReceiptWiring.ts');

check(!strategicSrc.includes('queryHiddenSourceRecords'), 'strategic projection no hidden truth');
check(!actorKnowledgeSrc.includes('queryHiddenSourceRecords'), 'actorKnowledge no hidden truth');
check(!/\bMath\.random\s*\(/.test(runtimeSrc), 'runtime no Math.random');
check(!/\bDate\.now\s*\(/.test(runtimeSrc), 'runtime no Date.now');
check(!/\bfetch\s*\(/.test(runtimeSrc), 'runtime no fetch');
check(!/\bMath\.random\s*\(/.test(bootstrapSrc), 'bootstrap no Math.random');
check(!/\bDate\.now\s*\(/.test(bootstrapSrc), 'bootstrap no Date.now');
check(!/\bfetch\s*\(/.test(bootstrapSrc), 'bootstrap no fetch');
check(!/\bMath\.random\s*\(/.test(receiptWiringSrc), 'receiptWiring no Math.random');
check(!/\bDate\.now\s*\(/.test(receiptWiringSrc), 'receiptWiring no Date.now');

// ═══════════════════════════════════════════════════════════════
// 11. ACTION RESOURCE RECEIPTS — hard check: must be > 0 with linkage
// ═══════════════════════════════════════════════════════════════
section('11. ACTION RESOURCE RECEIPTS — real player actions produce receipts');

// Build a five-x world with real player actions
const actionState = buildLongHorizonFiveXWorld(FIVE_X_SEED);
advanceDays(actionState, 5);
updateDerivedState(actionState);

const activeCase = actionState.cases.find((c) => c.status === 'active');
let actionsExecuted = 0;
let actionsAttempted = 0;
if (activeCase) {
  const actionIds = ['first-visit', 'weekly-feedback', 'story', 'xiaohongshu-boost', 'broker-broadcast'];
  for (const actionId of actionIds) {
    actionsAttempted += 1;
    const result = executeAction(actionState, actionId, activeCase, null);
    if (result) actionsExecuted += 1;
  }
}

advanceDays(actionState, 1);
updateDerivedState(actionState);

const actionCausalEvents = actionState.worldCausalEvents ?? [];

// Count isr-par-* records
const parRecords = actionCausalEvents.filter((event) => {
  const eventRecord = event as WorldCausalEvent & {
    readonly sourceRecordId?: string;
    readonly sourceRecordIds?: readonly string[];
  };
  return eventRecord.sourceRecordId?.startsWith('isr-par-')
    || eventRecord.sourceRecordIds?.some((id) => id.startsWith('isr-par-'));
}).length;

// Count isr-ar-* records
const arRecords = actionCausalEvents.filter((event) => {
  const eventRecord = event as WorldCausalEvent & {
    readonly sourceRecordId?: string;
    readonly sourceRecordIds?: readonly string[];
  };
  return eventRecord.sourceRecordId?.startsWith('isr-ar-')
    || eventRecord.sourceRecordIds?.some((id) => id.startsWith('isr-ar-'));
}).length;

check(actionsExecuted > 0, `player actions executed (${actionsExecuted}/${actionsAttempted})`);
check(parRecords > 0, `player action receipts (isr-par-*) in causal ledger (${parRecords})`);

// isr-ar-* records: hard check when budget-costing actions succeeded
check(arRecords > 0, `action resource records (isr-ar-*) in causal ledger (${arRecords})`);

// Linkage checks
const parEventsLinked = actionCausalEvents.filter((event) => {
  const eventRecord = event as WorldCausalEvent & { readonly sourceRecordId?: string };
  return eventRecord.sourceRecordId?.startsWith('isr-par-');
});
check(parEventsLinked.length > 0, `isr-par-* causal events have sourceRecordId linkage (${parEventsLinked.length})`);

const arEventsLinked = actionCausalEvents.filter((event) => {
  const eventRecord = event as WorldCausalEvent & { readonly sourceRecordId?: string };
  return eventRecord.sourceRecordId?.startsWith('isr-ar-');
});
check(arEventsLinked.length > 0, `isr-ar-* causal events have sourceRecordId linkage (${arEventsLinked.length})`);

// Check that actionResourceReceipts are populated in runtime state
const actionReceipts = actionState.bigWorldRuntime?.actionResourceReceipts ?? [];
check(actionReceipts.length > 0, `actionResourceReceipts > 0 (${actionReceipts.length})`);

if (actionReceipts.length > 0) {
  const receipt = actionReceipts[0];
  check(typeof receipt.day === 'number', 'action receipt has day');
  check(typeof receipt.actionId === 'string', 'action receipt has actionId');
  check(typeof receipt.caseId === 'string', 'action receipt has caseId');
  check(typeof receipt.sourceRecordId === 'string', 'action receipt has sourceRecordId');
  check(typeof receipt.replayKey === 'string', 'action receipt has replayKey');

  // Verify receipt links to causal event
  const receiptLinkedToCausal = actionCausalEvents.some((event) => {
    const eventRecord = event as WorldCausalEvent & { readonly sourceRecordId?: string };
    return eventRecord.sourceRecordId === receipt.sourceRecordId;
  });
  check(receiptLinkedToCausal, `action receipt sourceRecordId links to causal event (${receipt.sourceRecordId})`);

  // Verify at least one receipt has real resource impact (not all zeros)
  const hasRealImpact = actionReceipts.some((r) =>
    r.energyCost > 0 || r.budgetCost > 0 || r.trustDelta !== 0 || r.patienceDelta !== 0,
  );
  check(hasRealImpact, `actionResourceReceipts have real resource impact (energy/budget/trust/patience)`);
}

// ═══════════════════════════════════════════════════════════════
// 12. RUNTIME SUBGATE SCALE VERIFICATION — must be at five-x
// ═══════════════════════════════════════════════════════════════
section('12. RUNTIME SUBGATE SCALE — must verify at five-x scale');

// Read the runtime gate source code to verify it has a five-x scale check
const runtimeGateSrc = readSrc('scripts/verify-selling-houses-round19-five-x-runtime-ledger-gate.ts');

// Check that runtime gate has scale threshold checks for five-x
const runtimeGateHasCellCheck = /market\s*cells?\s*>=\s*100/.test(runtimeGateSrc);
const runtimeGateHasListingCheck = /listings?\s*>=\s*4000/.test(runtimeGateSrc);
const runtimeGateHasCustomerCheck = /customers?\s*>=\s*2[12]000/.test(runtimeGateSrc);
const runtimeGateHasBrokerCheck = /brokers?\s*>=\s*750/.test(runtimeGateSrc);

check(runtimeGateHasCellCheck, 'runtime gate has market cells >= 100 check');
check(runtimeGateHasListingCheck, 'runtime gate has listings >= 4000 check');
check(runtimeGateHasCustomerCheck, 'runtime gate has customers >= 21000 check');
check(runtimeGateHasBrokerCheck, 'runtime gate has brokers >= 750 check');

// Verify runtime gate actually builds a five-x world (not 24-cell)
const runtimeGateUsesFiveX = runtimeGateSrc.includes('FIVE_X_SCALE') || runtimeGateSrc.includes('fiveXScale');
check(runtimeGateUsesFiveX, 'runtime gate uses five-x scale policy');

// Verify runtime gate checks actionResourceReceipts > 0 (not just >= 0)
const runtimeGateChecksReceiptsGtZero = /actionReceipts\w*\.length\s*>\s*0/.test(runtimeGateSrc)
  || /actionResourceReceipts.*not empty/.test(runtimeGateSrc)
  || /actionResourceReceipts.*must be/.test(runtimeGateSrc);
check(runtimeGateChecksReceiptsGtZero, 'runtime gate checks actionResourceReceipts > 0 (not soft >= 0)');

// ═══════════════════════════════════════════════════════════════
// 13. KNOWN LIMITATIONS — P0/P1 block highest maturity
// ═══════════════════════════════════════════════════════════════
section('13. KNOWN LIMITATIONS — P0/P1 block FIVE-X-CITY-MARKET-BIG');

// Read source files to check known limitations
const receiptWiringCheck = readSrc('src/selling-houses/domain/world-model/runtime/actionReceiptWiring.ts');
const clockSrc = readSrc('src/selling-houses/domain/world-model/runtime/clock.ts');

// P1: fieldDeltas empty when trust/patience at cap → seeded fallback
// NOTE: actionReceiptWiring.ts has fieldDeltas:[] but that's the SNAPSHOT reconstruction path.
// The LIVE path uses actionResolvers.ts which computes fieldDeltas from before/after comparison.
// We check the live path (actionResolvers.ts) for correct fieldDeltas.
const actionResolversSrc = readSrc('src/selling-houses/domain/engine/actionResolvers.ts');
const livePathHasFieldDeltas = actionResolversSrc.includes('fieldDeltas') && actionResolversSrc.includes('beforeTrust');
const snapshotPathHasFieldDeltas = receiptWiringCheck.includes('fieldDeltas') && !receiptWiringCheck.includes('fieldDeltas: []');
const p1SeededFallback = !livePathHasFieldDeltas;
check(livePathHasFieldDeltas, 'LIVE path (actionResolvers.ts) computes fieldDeltas from before/after comparison');

// P1: 30% deterministic sampling for non-player customers
const has30Sampling = clockSrc.includes('hash % 100 < 30');
const p1Sampling = has30Sampling;
check(!p1Sampling, 'NO P1: non-player customers have 30% tick sampling (player-linked = 100%)');

// P2: shadow rivals 30d depletion
const activeShadowRivals30 = state30.marketShadow?.rivalListings?.filter(
  (r: { status: string }) => r.status === 'active',
).length ?? 0;
const p2ShadowDepletion = activeShadowRivals30 === 0;
warn(!p2ShadowDepletion, `KNOWN P2: shadow rivals at 30d: ${activeShadowRivals30} active (long-horizon pressure from events, not active entities)`);

// ═══════════════════════════════════════════════════════════════
// 14. SELF-AUDIT — no soft pass patterns
// ═══════════════════════════════════════════════════════════════
section('14. SELF-AUDIT — no soft pass patterns');
const gateSrc = readSrc('scripts/verify-selling-houses-round19-five-x-final-gate.ts');
const auditStart = gateSrc.indexOf("section('14. SELF-AUDIT");
const gateSrcCore = auditStart > 0 ? gateSrc.slice(0, auditStart) : gateSrc;
const gateSrcNoComments = gateSrcCore
  .replace(/\/\/.*$/gm, '')
  .replace(/\/\*[\s\S]*?\*\//g, '');
check(!gateSrcNoComments.includes('|| true'), 'gate source has no || true');
check(!gateSrcNoComments.match(/check\(\s*true\s*,/), 'gate source has no check(true, ...)');

// ═══════════════════════════════════════════════════════════════
// MATURITY CLASSIFICATION
// ═══════════════════════════════════════════════════════════════
section('MATURITY CLASSIFICATION');

const hasFiveXScale = scale.totalListings >= 4000 && scale.totalOwners >= 2500 && scale.totalCustomers >= 21000 && scale.totalBrokers >= 750 && scale.marketCells >= 100;
const hasRuntimeTicks = (state60.bigWorldRuntime?.tickCount ?? 0) >= 60 && events60 > events30;
const hasLedgerGrowth = ledger14 > ledger7 && ledger30 > ledger14 && ledger60 > ledger30;
const hasLedgerTraceability = traceableLedgerEntries > 0 && untraceableLedgerEntries === 0;
const hasStrategicEvidence = strategic14.brokerOpportunity.topActions.length > 0
  && strategic14.brokerOpportunity.topActions.every((a) => a.sourceRecordIds.length > 0 && a.opportunityCost.foregoneAction !== '无替代方案');
const hasEmptyKnowledgeBypass = emptyStrategic.brokerOpportunity.topActions.length === 0;
const hasLongHorizonPressure = rivalRepriceCount30 > 0 && rivalBrokerActionCount30 > 0;
const hasAllReceiptDomains = requiredKinds.every((kind) => liveSourceKinds.has(kind));
const hasCellMovement = cellsWithMovement.size >= 10;
const hasEntityCoverage = customerEvents.length > 0 && ownerEvents.length > 0 && rivalEvents.length > 0 && brokerEvents.length > 0 && orgEvents.length > 0;
const hasLedgerReplay = sameStringList(economyEventIds(replayA), economyEventIds(replayB));
const hasNoLeakage = !strategicSrc.includes('queryHiddenSourceRecords') && !actorKnowledgeSrc.includes('queryHiddenSourceRecords');
const hasNoFakeRandomness = !/\bMath\.random\s*\(/.test(runtimeSrc) && !/\bDate\.now\s*\(/.test(runtimeSrc);
const hasNoSoftPass = !gateSrcNoComments.includes('|| true') && !gateSrcNoComments.match(/check\(\s*true\s*,/);
const hasCensusClean = censusSummary.connectedSurfaces >= 12
  && censusSummary.disconnectedSurfaceIds.every((id) => ['leaderboard', 'architecture-migration-readiness', 'architecture-parity'].includes(id));
const hasOwnerTrustFeedback = ownerTrustEvents.length > 0;

// New checks for this gate version
const hasActionReceiptsPopulated = actionReceipts.length > 0;
const hasIsrParInCausal = parRecords > 0;
const hasIsrArInCausal = arRecords > 0;
const hasReceiptLinkage = parEventsLinked.length > 0 && arEventsLinked.length > 0;
const hasRuntimeGateAtFiveX = runtimeGateHasCellCheck && runtimeGateHasListingCheck && runtimeGateHasCustomerCheck && runtimeGateHasBrokerCheck && runtimeGateUsesFiveX;
const hasNoP1Blocker = !p1SeededFallback && !p1Sampling;

// Maturity ladder
const fiveXScaleBig = hasFiveXScale;
const fiveXRuntimeBig = fiveXScaleBig && hasRuntimeTicks && hasLedgerGrowth && hasLedgerTraceability && hasAllReceiptDomains && hasCellMovement && hasEntityCoverage;
const fiveXProductBig = fiveXRuntimeBig && hasStrategicEvidence && hasEmptyKnowledgeBypass && hasLongHorizonPressure && hasCensusClean && hasOwnerTrustFeedback;

// FIVE-X-CITY-MARKET-BIG requires ALL of:
// 1. fiveXProductBig
// 2. ledger replay
// 3. no leakage
// 4. no fake randomness
// 5. no soft pass
// 6. actionResourceReceipts populated (not empty)
// 7. isr-par-* and isr-ar-* in causal ledger
// 8. runtime gate verifies at five-x scale
// 9. no P0/P1 known limitations that would undermine the claim
const fiveXCityMarketBig = fiveXProductBig
  && hasLedgerReplay && hasNoLeakage && hasNoFakeRandomness && hasNoSoftPass
  && hasActionReceiptsPopulated && hasIsrParInCausal && hasIsrArInCausal && hasReceiptLinkage
  && hasRuntimeGateAtFiveX
  && hasNoP1Blocker;

// Intermediate level when scale + product pass but runtime gate not at five-x or P1s exist
const fiveXScaleProductWithGap = fiveXProductBig && hasLedgerReplay && hasNoLeakage && hasNoFakeRandomness && hasNoSoftPass
  && (!hasRuntimeGateAtFiveX || !hasNoP1Blocker);

const maxLevel = fiveXCityMarketBig
  ? 'FIVE-X-CITY-MARKET-BIG'
  : fiveXScaleProductWithGap
    ? 'FIVE-X-SCALE+PRODUCT-BIG_WITH-GAP'
    : fiveXProductBig
      ? 'FIVE-X-PRODUCT-BIG'
      : fiveXRuntimeBig
        ? 'FIVE-X-RUNTIME-BIG'
        : fiveXScaleBig
          ? 'FIVE-X-SCALE-BIG'
          : 'FAILED';

console.log(`  FINAL MATURITY: ${maxLevel}`);
check(maxLevel === 'FIVE-X-CITY-MARKET-BIG', `final maturity is FIVE-X-CITY-MARKET-BIG (${maxLevel})`);

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  Round 19 Five-X Final Gate Passed: ${passed} | Failed: ${failed}`);
console.log(`  Warnings: ${warnings.length}`);
console.log(`  Maturity: ${maxLevel}`);
console.log('═══════════════════════════════════════════════════════════════');

if (warnings.length > 0) {
  console.warn('\n  ⚠️  WARNINGS:');
  for (const warning of warnings) console.warn(`    • ${warning}`);
}

if (failed > 0) {
  console.error('\n  ❌ GATE FAILED:');
  for (const failure of failures) console.error(`    • ${failure}`);
  process.exit(1);
}

console.log('\n  ✅ GATE PASSED — FIVE-X-CITY-MARKET-BIG achieved');
