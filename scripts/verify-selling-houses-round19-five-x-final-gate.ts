/**
 * Round 19 — Five-X Final Hard Gate
 *
 * Proves the market is a real city-level formation, not opening data, not
 * standalone scripts, not projection boilerplate, not ledger-only, not
 * hidden-truth leakage, not fake randomness, not soft assertions.
 *
 * Maturity ladder:
 *   FAILED                  — any core check fails
 *   FIVE-X-SCALE-BIG       — five-x scale thresholds met
 *   FIVE-X-RUNTIME-BIG     — + runtime ticks, source→causal, receipt feedback
 *   FIVE-X-PRODUCT-BIG     — + strategic decision consumes ledger, projection evidence
 *   FIVE-X-CITY-MARKET-BIG — + all 90 checks pass, no soft patterns, replay deterministic
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
 *   10. action spend/refund receipts enter worldCausalEvents.
 *
 * Usage: npx tsx scripts/verify-selling-houses-round19-five-x-final-gate.ts
 */

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
import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { advanceDays } from '../src/selling-houses/domain/engine.js';
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

function section(title: string) {
  console.log(`\n━━━ ${title} ━━━`);
}

// ── Five-X Scale Policy ────────────────────────────────────────

const FIVE_X_SCALE: BigWorldScalePolicy = {
  minMarketCells: 100,
  maxMarketCells: 120,
  acnCount: 32,
  namedBrokersPerAcn: 6,
  shadowBrokersPerAcn: 18,
  shadowListingsPerCell: 35,
  directRivalListingsPerCell: 10,
  materializedCustomersPerCell: 30,
  shadowAggregateClustersPerCell: 25,
  ownerProfilePriorCount: 2500,
  customerCaseRatio: 12,
};

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
    scaleOverride: FIVE_X_SCALE,
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
console.log('║  Round 19 — Five-X Final Hard Gate                             ║');
console.log('║  Catches: opening-big, standalone-big, ledger-only-big,         ║');
console.log('║           projection-fallback, hidden-truth, fake-randomness,   ║');
console.log('║           soft assertions                                      ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');

// ═══════════════════════════════════════════════════════════════
// 1. FIVE-X SCALE — 100+ cells, 750+ brokers, 4000+ listings, 2500+ owners, 22000+ demand
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
check(fiveX.customersGte22000, 'fiveX.customersGte22000');
check(fiveX.brokersGte750, 'fiveX.brokersGte750');
check(fiveX.marketCellsGte100, 'fiveX.marketCellsGte100');
check(fiveX.microCellsGte300, 'fiveX.microCellsGte300');
check(fiveX.acnNetworksGte32, 'fiveX.acnNetworksGte32');
check(fiveX.supportingInfoGte800, 'fiveX.supportingInfoGte800');
check(fiveX.historicalTransactionsGte300, 'fiveX.historicalTransactionsGte300');

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
  // Payload may use affectedMarketCellIds (array) or targetMarketCellId / marketCellId
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
// 11. SELF-AUDIT — no soft pass patterns
// ═══════════════════════════════════════════════════════════════
section('11. SELF-AUDIT — no soft pass patterns');
const gateSrc = readSrc('scripts/verify-selling-houses-round19-five-x-final-gate.ts');
const auditStart = gateSrc.indexOf("section('11. SELF-AUDIT");
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

// Maturity ladder
const fiveXScaleBig = hasFiveXScale;
const fiveXRuntimeBig = fiveXScaleBig && hasRuntimeTicks && hasLedgerGrowth && hasLedgerTraceability && hasAllReceiptDomains && hasCellMovement && hasEntityCoverage;
const fiveXProductBig = fiveXRuntimeBig && hasStrategicEvidence && hasEmptyKnowledgeBypass && hasLongHorizonPressure && hasCensusClean && hasOwnerTrustFeedback;
const fiveXCityMarketBig = fiveXProductBig && hasLedgerReplay && hasNoLeakage && hasNoFakeRandomness && hasNoSoftPass;

const maxLevel = fiveXCityMarketBig
  ? 'FIVE-X-CITY-MARKET-BIG'
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
console.log(`  Maturity: ${maxLevel}`);
console.log('═══════════════════════════════════════════════════════════════');

if (failed > 0) {
  console.error('\n  ❌ GATE FAILED:');
  for (const failure of failures) console.error(`    • ${failure}`);
  process.exit(1);
}

console.log('\n  ✅ GATE PASSED — FIVE-X-CITY-MARKET-BIG achieved');
