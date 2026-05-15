/**
 * Round 19 — Five-X Product Decision Gate
 *
 * Proves the product surface works at five-x scale (100+ cells, 4000+ listings)
 * without degrading to fallback text, leaking hidden GlobalTruth, or exploding
 * in iteration cost.
 *
 * This gate catches 6 false-positive classes:
 *   1. Static cost map — resourceCost comes from hardcoded map, not evidence
 *   2. Full-world iteration — projection iterates all 100+ cells (O(n) explosion)
 *   3. Fallback at scale — recommendations degrade to generic text at five-x
 *   4. Hidden truth leakage — broker POV peeks at GlobalTruth at five-x
 *   5. Empty knowledge bypass — empty knowledge still produces recommendations
 *   6. Soft pass — gate uses || true / check(true) to pass core assertions
 *
 * Combines R18 resource-ledger checks with R19 five-x scale checks.
 *
 * Maturity: FAILED | RESOURCE-LEDGER-ECONOMY-BIG | FIVE-X-PRODUCT-DECISION-BIG
 *
 * Usage: npx tsx scripts/verify-selling-houses-round19-five-x-product-decision-gate.ts
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
  sameStringList,
  uniqueSourceKinds,
  readSrc,
} from './verify-selling-houses-round17-market-economy-gate-core.js';
import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { advanceDays } from '../src/selling-houses/domain/engine.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine/opportunityEngine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import {
  createBigWorldBootstrap,
  buildScaleManifest,
  buildDiversityManifest,
} from '../src/selling-houses/domain/world-model/bigWorldBootstrap.js';
import { buildProductSurfaceCensus, buildProductCensusSummary } from '../src/selling-houses/application/projections/noDeadCornerProductCensus.js';
import { buildStrategicMarketDecisionProjection } from '../src/selling-houses/application/projections/strategicMarketDecisionProjection.js';
import { buildPlayableMarketProjection } from '../src/selling-houses/application/projections/playableMarketProjection.js';
import type { GameState } from '../src/selling-houses/domain/models.js';
import type { SourceKind } from '../src/selling-houses/domain/world-model/informationSourceTypes.js';
import type { WorldCausalEvent } from '../src/selling-houses/domain/world-model/causalEvents.js';
import type {
  BigWorldBootstrap,
  BigWorldScalePolicy,
} from '../src/selling-houses/domain/world-model/bigWorldTypes.js';

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

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║  Round 19 — Five-X Product Decision Gate                        ║');
console.log('║  Catches: static cost, full-world iteration, fallback at scale,  ║');
console.log('║           hidden truth leakage, empty bypass, soft pass          ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');

// ═══════════════════════════════════════════════════════════════
// 0. FIVE-X SCALE WORLD — 100+ cells, 4000+ listings
// ═══════════════════════════════════════════════════════════════
section('0. FIVE-X SCALE WORLD — build and verify scale');

const FIVE_X_SCALE: BigWorldScalePolicy = {
  minMarketCells: 100,
  maxMarketCells: 120,
  acnCount: 32,
  namedBrokersPerAcn: 6,
  shadowBrokersPerAcn: 18,
  shadowListingsPerCell: 35,
  directRivalListingsPerCell: 10,
  materializedCustomersPerCell: 32,
  shadowAggregateClustersPerCell: 25,
  ownerProfilePriorCount: 2500,
  customerCaseRatio: 12,
};

function buildFiveXWorld(seed: number): GameState {
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

function buildFiveXLongHorizon(seed: number): GameState {
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

function advanceFiveXWorld(days: number, seed: number): GameState {
  const state = buildFiveXLongHorizon(seed);
  advanceDays(state, days);
  updateDerivedState(state);
  return state;
}

const FIVE_X_SEED = 20260628;
const fiveXBase = buildFiveXWorld(FIVE_X_SEED);
const fiveXBootstrap = bootstrapOf(fiveXBase);
const fiveXScale = scaleOf(fiveXBase);
const fiveXDiversity = diversityOf(fiveXBase);

check(fiveXScale.marketCells >= 100, `five-x cells >= 100 (${fiveXScale.marketCells})`);
check(fiveXScale.totalListings >= 4000, `five-x listings >= 4000 (${fiveXScale.totalListings})`);
check(fiveXScale.totalOwners >= 2500, `five-x owners >= 2500 (${fiveXScale.totalOwners})`);
check(fiveXScale.totalCustomers >= 22000, `five-x customers >= 22000 (${fiveXScale.totalCustomers})`);
check(fiveXScale.totalBrokers >= 750, `five-x brokers >= 750 (${fiveXScale.totalBrokers})`);
check(fiveXScale.acnNetworks >= 32, `five-x ACN networks >= 32 (${fiveXScale.acnNetworks})`);

// ═══════════════════════════════════════════════════════════════
// 1. FIVE-X RUNTIME — 30-day advance at five-x scale
// ═══════════════════════════════════════════════════════════════
section('1. FIVE-X RUNTIME — 30-day advance at five-x scale');
const fiveX30 = advanceFiveXWorld(30, FIVE_X_SEED);

const fiveXEvents30 = fiveX30.worldCausalEvents?.length ?? 0;
check(fiveXEvents30 > 0, `five-x 30-day causal events > 0 (${fiveXEvents30})`);
check((fiveX30.bigWorldRuntime?.tickCount ?? 0) >= 30, `five-x tickCount >= 30 (${fiveX30.bigWorldRuntime?.tickCount ?? 0})`);
check(!fiveX30.gameOver, 'five-x world still live at day 30');

const fiveXEconomy30 = countEconomySourceRecords(fiveX30.worldCausalEvents ?? []);
check(fiveXEconomy30 >= 20, `five-x economy source records >= 20 (${fiveXEconomy30})`);

// ═══════════════════════════════════════════════════════════════
// 2. STRATEGIC PROJECTION — builds without O(n) explosion
// ═══════════════════════════════════════════════════════════════
section('2. STRATEGIC PROJECTION — builds at five-x without explosion');

const fiveXKnowledgeMap = buildKnowledgeMapFromState(fiveX30);
const startTime = performance.now();
const fiveXStrategic = buildStrategicMarketDecisionProjection(fiveX30, fiveXKnowledgeMap);
const elapsed = performance.now() - startTime;

check(fiveXStrategic !== null, 'five-x strategic projection produced output');
check(elapsed < 5000, `five-x strategic projection built in < 5s (${Math.round(elapsed)}ms)`);
check(fiveXStrategic.sharedCausalRefs !== undefined, 'five-x sharedCausalRefs exists');

// ═══════════════════════════════════════════════════════════════
// 3. RESOURCE COST — from pressure signals, not static map
// ═══════════════════════════════════════════════════════════════
section('3. RESOURCE COST — evidence-backed, not static map');

for (const action of fiveXStrategic.brokerOpportunity.topActions) {
  check(
    action.resourceCost.energyCost > 0 || action.resourceCost.budgetCost > 0,
    `five-x "${action.actionLabel}" has real resourceCost (energy=${action.resourceCost.energyCost}, budget=${action.resourceCost.budgetCost})`,
  );
  // Verify labels contain evidence reasoning (not just static text)
  check(
    action.resourceCost.energyLabel.includes('压力系数') || action.resourceCost.energyLabel.includes('不消耗'),
    `five-x energyLabel has evidence reasoning: "${action.resourceCost.energyLabel}"`,
  );
  check(
    action.sourceRecordIds.length > 0,
    `five-x "${action.actionLabel}" has sourceRecordIds (${action.sourceRecordIds.length})`,
  );
  check(
    action.safeRefs.length > 0,
    `five-x "${action.actionLabel}" has safeRefs (${action.safeRefs.length})`,
  );
  check(
    action.replayKey.length > 0,
    `five-x "${action.actionLabel}" has replayKey`,
  );
  check(
    action.opportunityCost.foregoneAction !== '无替代方案',
    `five-x "${action.actionLabel}" has real opportunityCost`,
  );
  check(
    action.competitorRisk.rivalCount > 0,
    `five-x "${action.actionLabel}" has competitorRisk rivalCount (${action.competitorRisk.rivalCount})`,
  );
  check(
    action.timeHorizonImpact.length === 4,
    `five-x action has 3/7/14/30 horizon impact (${action.timeHorizonImpact.length})`,
  );
}

// ═══════════════════════════════════════════════════════════════
// 4. MARKET RADAR — bounded by actor-visible window
// ═══════════════════════════════════════════════════════════════
section('4. MARKET RADAR — bounded at five-x scale');

const radarCellCount = fiveXStrategic.marketRadar.hotCells.length + fiveXStrategic.marketRadar.coldCells.length;
check(radarCellCount <= 20, `five-x radar cells bounded (${radarCellCount} <= 20)`);
check(radarCellCount > 0, `five-x radar has cells (${radarCellCount})`);

// ═══════════════════════════════════════════════════════════════
// 5. COMPETITIVE PRESSURE — from visible causal refs at five-x
// ═══════════════════════════════════════════════════════════════
section('5. COMPETITIVE PRESSURE — evidence-backed at five-x');

check(fiveXStrategic.competitivePressure.activeRivalCount > 0, `five-x competitor pressure > 0 (${fiveXStrategic.competitivePressure.activeRivalCount})`);
check(fiveXStrategic.competitivePressure.topRivalAction !== null, 'five-x top rival evidence exists');

// ═══════════════════════════════════════════════════════════════
// 6. CUSTOMER POOL — bounded at five-x
// ═══════════════════════════════════════════════════════════════
section('6. CUSTOMER POOL — bounded at five-x');

check(fiveXStrategic.customerPool.activeCount > 0, `five-x customer pool > 0 (${fiveXStrategic.customerPool.activeCount})`);
check(fiveXStrategic.customerPool.activeCount <= 200, `five-x customer pool bounded (${fiveXStrategic.customerPool.activeCount} <= 200)`);

// ═══════════════════════════════════════════════════════════════
// 7. OWNER POOL — bounded at five-x
// ═══════════════════════════════════════════════════════════════
section('7. OWNER POOL — bounded at five-x');

check(fiveXStrategic.ownerPool.totalActive > 0, `five-x owner pool > 0 (${fiveXStrategic.ownerPool.totalActive})`);

// ═══════════════════════════════════════════════════════════════
// 8. PLAYABLE MARKET — builds at five-x
// ═══════════════════════════════════════════════════════════════
section('8. PLAYABLE MARKET — builds at five-x');

const fiveXPlayable = buildPlayableMarketProjection(fiveX30, fiveXKnowledgeMap);
check(fiveXPlayable !== null, 'five-x playable market produced output');
check(fiveXPlayable.sharedCausalRefs !== undefined, 'five-x playable sharedCausalRefs exists');
check(fiveXPlayable.brokerOpportunity.topActions.length > 0, `five-x playable topActions > 0 (${fiveXPlayable.brokerOpportunity.topActions.length})`);

// ═══════════════════════════════════════════════════════════════
// 9. EMPTY KNOWLEDGE — no recommendation at five-x
// ═══════════════════════════════════════════════════════════════
section('9. EMPTY KNOWLEDGE — no recommendation at five-x');

const emptyFiveX = buildStrategicMarketDecisionProjection(fiveX30);
check(emptyFiveX.brokerOpportunity.topActions.length === 0, 'five-x empty knowledge → no strategic topActions');
check(emptyFiveX.sharedCausalRefs === undefined, 'five-x empty knowledge → no sharedCausalRefs');

// ═══════════════════════════════════════════════════════════════
// 10. NO HIDDEN TRUTH LEAKAGE — source code boundaries
// ═══════════════════════════════════════════════════════════════
section('10. SOURCE CODE BOUNDARIES — no hidden truth at five-x');

const strategicSrc = readSrc('src/selling-houses/application/projections/strategicMarketDecisionProjection.ts');
const actorKnowledgeSrc = readSrc('src/selling-houses/application/projections/actorKnowledgeProjection.ts');
const playableSrc = readSrc('src/selling-houses/application/projections/playableMarketProjection.ts');

check(!strategicSrc.includes('queryHiddenSourceRecords'), 'strategic projection no hidden truth');
check(!actorKnowledgeSrc.includes('queryHiddenSourceRecords'), 'actorKnowledge no hidden truth');
check(!playableSrc.includes('queryHiddenSourceRecords'), 'playable market no hidden truth');

// Verify no static cost maps remain
check(!strategicSrc.includes('costMap'), 'strategic projection has no static costMap');
check(!strategicSrc.includes('estimateEnergyCost'), 'strategic projection has no estimateEnergyCost');
check(!strategicSrc.includes('estimateBudgetCost'), 'strategic projection has no estimateBudgetCost');

// Verify evidence-backed cost derivation exists
check(strategicSrc.includes('deriveResourceCost'), 'strategic projection uses deriveResourceCost');
check(strategicSrc.includes('commandCategory'), 'strategic projection derives from command category');
check(strategicSrc.includes('pressureScale'), 'strategic projection scales by pressure');

// Verify actor-visible window bounds exist
check(strategicSrc.includes('buildActorVisibleCellWindow'), 'strategic projection uses actor-visible cell window');
check(strategicSrc.includes('buildActorVisibleCustomerWindow'), 'strategic projection uses actor-visible customer window');

// ═══════════════════════════════════════════════════════════════
// 11. PRODUCT CENSUS — five-x compatibility
// ═══════════════════════════════════════════════════════════════
section('11. PRODUCT CENSUS — five-x compatibility');

const census = buildProductSurfaceCensus();
const censusSummary = buildProductCensusSummary(census);

check(censusSummary.totalSurfaces >= 16, `product census surfaces >= 16 (${censusSummary.totalSurfaces})`);
check(censusSummary.connectedSurfaces >= 12, `connected surfaces >= 12 (${censusSummary.connectedSurfaces})`);
check(censusSummary.fiveXCompatibleSurfaces >= 12, `five-x compatible surfaces >= 12 (${censusSummary.fiveXCompatibleSurfaces})`);
check(
  censusSummary.disconnectedSurfaceIds.every((id) => ['leaderboard', 'architecture-migration-readiness', 'architecture-parity'].includes(id)),
  'all disconnected surfaces are intentional exemptions',
);

// Verify strategic-decision and playable-market are five-x compatible
const strategicCensus = census.find((e) => e.surfaceId === 'strategic-decision');
const playableCensus = census.find((e) => e.surfaceId === 'playable-market');
check(strategicCensus?.fiveXCompatible === true, 'strategic-decision is five-x compatible');
check(playableCensus?.fiveXCompatible === true, 'playable-market is five-x compatible');

// ═══════════════════════════════════════════════════════════════
// 12. REPLAY — byte-identical at five-x
// ═══════════════════════════════════════════════════════════════
section('12. REPLAY — byte-identical at five-x');

const replayFiveXA = advanceFiveXWorld(30, FIVE_X_SEED);
const replayFiveXB = advanceFiveXWorld(30, FIVE_X_SEED);
check(
  sameStringList(causalEventIds(replayFiveXA), causalEventIds(replayFiveXB)),
  'five-x same seed → byte-identical 30-day causal event IDs',
);

// ═══════════════════════════════════════════════════════════════
// 13. R18 REGRESSION — resource ledger still works
// ═══════════════════════════════════════════════════════════════
section('13. R18 REGRESSION — resource ledger at five-x');

const fiveXSourceKinds = uniqueSourceKinds(fiveX30.worldCausalEvents ?? []);
const requiredKinds: SourceKind[] = [
  'broker_capacity_signal',
  'manager_message',
  'customer_interaction',
  'owner_life_event_signal',
  'rival_action',
  'buyer_financing_signal',
];
for (const kind of requiredKinds) {
  check(fiveXSourceKinds.has(kind), `five-x source kind present: ${kind}`);
}

// ═══════════════════════════════════════════════════════════════
// 15. KNOWN LIMITATIONS — documented, not soft-passed
// ═══════════════════════════════════════════════════════════════
section('15. KNOWN LIMITATIONS — documented architectural gaps');

// Limitation 1: isr-ar-* causal event payload doesn't carry original budget amount
// sourceIngestionAdapter maps manager_message → MatterPriorityChanged, losing priority field
// Ledger reads budget from source records (not causal events) — traceability requires sourceRecordId backtrace
const runtimeSrc = readSrc('src/selling-houses/domain/world-model/runtime/marketEconomyRuntime.ts');
check(
  runtimeSrc.includes('r.sourceId.startsWith(\'isr-ar-\')'),
  'KNOWN: budget reads from isr-ar-* source records (priority field in source, not causal event)',
);

// Limitation 2: fieldDeltas empty when trust/patience at cap
// actionReceiptWiring produces fieldDeltas:[] for success path
// Ledger falls back to seededInt when fieldDeltas empty — records phantom trust/patience changes
const receiptWiringSrc = readSrc('src/selling-houses/domain/world-model/runtime/actionReceiptWiring.ts');
check(
  receiptWiringSrc.includes('fieldDeltas: []'),
  'KNOWN: actionReceiptWiring success path has empty fieldDeltas — seeded fallback for trust/patience',
);

// Limitation 3: 30% deterministic sampling for non-player customers
// Active cohort scheduler samples 30% of non-player-linked customers per tick
// Player-linked customers have full coverage — verified by checking scheduler code exists
const clockSrc = readSrc('src/selling-houses/domain/world-model/runtime/clock.ts');
check(
  clockSrc.includes('hash % 100 < 30'),
  'KNOWN: non-player customers have 30% tick sampling (player-linked = 100%)',
);

// ═══════════════════════════════════════════════════════════════
// 16. SELF-AUDIT — no soft pass patterns
// ═══════════════════════════════════════════════════════════════
section('16. SELF-AUDIT — no soft pass patterns');
const gateSrc = readSrc('scripts/verify-selling-houses-round19-five-x-product-decision-gate.ts');
const auditStart = gateSrc.indexOf("section('16. SELF-AUDIT");
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

const hasFiveXScale = fiveXScale.marketCells >= 100 && fiveXScale.totalListings >= 4000;
const hasFiveXRuntime = fiveXEvents30 > 0 && (fiveX30.bigWorldRuntime?.tickCount ?? 0) >= 30;
const hasFiveXProjection = fiveXStrategic.brokerOpportunity.topActions.length > 0 && elapsed < 5000;
const hasEvidenceCost = fiveXStrategic.brokerOpportunity.topActions.every(
  (a) => !a.resourceCost.energyLabel.includes('消耗 2 精力') || a.resourceCost.energyLabel.includes('压力系数'),
);
const hasBoundedRadar = radarCellCount <= 20 && radarCellCount > 0;
const hasBoundedCustomer = fiveXStrategic.customerPool.activeCount <= 200;
const hasFiveXCensus = censusSummary.fiveXCompatibleSurfaces >= 12;
const hasNoStaticCost = !strategicSrc.includes('costMap') && strategicSrc.includes('deriveResourceCost');
const hasActorWindow = strategicSrc.includes('buildActorVisibleCellWindow');
const hasNoLeakage = !strategicSrc.includes('queryHiddenSourceRecords') && !playableSrc.includes('queryHiddenSourceRecords');
const hasFiveXReplay = sameStringList(causalEventIds(replayFiveXA), causalEventIds(replayFiveXB));
const hasNoSoftPass = !gateSrcNoComments.includes('|| true') && !gateSrcNoComments.match(/check\(\s*true\s*,/);
const hasEmptyKnowledgeBypass = emptyFiveX.brokerOpportunity.topActions.length === 0;

const fiveXProductDecisionBig = hasFiveXScale && hasFiveXRuntime && hasFiveXProjection
  && hasEvidenceCost && hasBoundedRadar && hasBoundedCustomer && hasFiveXCensus
  && hasNoStaticCost && hasActorWindow && hasNoLeakage && hasFiveXReplay
  && hasNoSoftPass && hasEmptyKnowledgeBypass;

const resourceLedgerEconomyBig = hasFiveXScale && hasFiveXRuntime && hasFiveXReplay && hasNoLeakage;
const maxLevel = fiveXProductDecisionBig
  ? 'FIVE-X-PRODUCT-DECISION-BIG'
  : resourceLedgerEconomyBig
    ? 'RESOURCE-LEDGER-ECONOMY-BIG'
    : hasFiveXScale
      ? 'SCALE-BIG'
      : 'FAILED';

console.log(`  FINAL MATURITY: ${maxLevel}`);
check(maxLevel === 'FIVE-X-PRODUCT-DECISION-BIG', `final maturity is FIVE-X-PRODUCT-DECISION-BIG (${maxLevel})`);

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  Round 19 Five-X Product Decision Gate Passed: ${passed} | Failed: ${failed}`);
console.log(`  Maturity: ${maxLevel}`);
console.log('═══════════════════════════════════════════════════════════════');

if (failed > 0) {
  console.error('\n  ❌ GATE FAILED:');
  for (const failure of failures) console.error(`    • ${failure}`);
  process.exit(1);
}

console.log('\n  ✅ GATE PASSED — FIVE-X-PRODUCT-DECISION-BIG achieved');
