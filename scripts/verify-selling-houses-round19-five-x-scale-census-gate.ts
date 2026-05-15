/**
 * Round 19 — Five-X Scale Census Gate
 *
 * Proves the Big World has expanded to five-x city-level scale:
 *   - 4000+ listings, 2500+ owners, 21000+ demand, 750+ brokers, 100+ cells
 *   - Four-layer entity stratification: materialized core / active cohort / shadow aggregate / cold ledger
 *   - ACN networks >= 32 with behavioral diversity
 *   - Per-cell thickness: supply/demand/broker/rival/liquidity
 *   - Structural diversity: owner archetypes, listing layouts, price bands, demand segments, broker styles
 *   - All entities have stable IDs, source origin, replay keys
 *   - Same-seed replay is deterministic
 *
 * Anti-false-positive rules:
 *   - No `|| true` or `check(true)` on core assertions
 *   - Entity counts must be verified from actual generated data (not just constants)
 *   - Per-cell thickness must show structural variation (not uniform)
 *   - ACN distribution must be non-trivial (not all in one ACN)
 *   - Replay determinism must be verified with byte-identical causal event IDs
 *
 * Usage: npx tsx scripts/verify-selling-houses-round19-five-x-scale-census-gate.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { advanceGameDays, executeGameAction } from '../src/selling-houses/application/gameTransitions.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine/opportunityEngine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { advanceDays } from '../src/selling-houses/domain/engine.js';
import {
  createBigWorldBootstrap,
  buildScaleManifest,
  buildDiversityManifest,
} from '../src/selling-houses/domain/world-model/bigWorldBootstrap.js';
import { FIVE_X_SCALE_POLICY } from '../src/selling-houses/domain/world-model/bigWorldSpecFactory.js';
import type { GameState } from '../src/selling-houses/domain/models.js';
import type {
  BigWorldBootstrap,
  BigWorldScalePolicy,
} from '../src/selling-houses/domain/world-model/bigWorldTypes.js';
import type { WorldCausalEvent } from '../src/selling-houses/domain/world-model/causalEvents.js';
import type { SourceKind } from '../src/selling-houses/domain/world-model/informationSourceTypes.js';

// ── Infrastructure ──────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(condition: boolean, msg: string) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; failures.push(msg); console.error(`  ❌ ${msg}`); }
}

function section(title: string) {
  console.log(`\n━━━ ${title} ━━━`);
}

function readSrc(rel: string): string {
  return readFileSync(resolve(import.meta.dirname ?? '.', '..', rel), 'utf-8');
}

// ── Five-X Scale Policy (imported from single source of truth) ────

const SEED = 20260615;

// ── Helpers ─────────────────────────────────────────────────────

function sourceKindsForEvent(event: WorldCausalEvent): readonly SourceKind[] {
  const eventAny = event as WorldCausalEvent & { readonly sourceKinds?: readonly SourceKind[] };
  const kinds = new Set<SourceKind>();
  if (eventAny.sourceKind) kinds.add(eventAny.sourceKind);
  for (const kind of eventAny.sourceKinds ?? []) kinds.add(kind);
  return [...kinds];
}

// ── Build five-x-scale world ────────────────────────────────────

const { buildMarketFormation, buildMarketFormationSummary } = await import('../src/selling-houses/domain/world-model/marketFormationBootstrap.js');

function buildFiveXWorld(seed: number): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain')!;
  const state = createInitialState(snapshot, seed);
  const bootstrap = createBigWorldBootstrap({
    seed,
    scenarioName: snapshot.scenario.name,
    difficultyId: snapshot.scenario.difficultyId,
    playerCaseCount: snapshot.scenario.cases.length,
    scaleOverride: FIVE_X_SCALE_POLICY,
  });
  (state.runContext as any).bigWorldBootstrap = bootstrap;
  seedInitialOpportunities(state);
  return state;
}

// ══════════════════════════════════════════════════════════════════════════
// Gate
// ══════════════════════════════════════════════════════════════════════════

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║  Round 19 — Five-X Scale Census Gate                            ║');
console.log('║  4000+ listings, 2500+ owners, 21000+ demand, 750+ brokers       ║');
console.log('║  100+ cells, 32+ ACN, 300+ micro cells, 800+ supporting info    ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');

// ═══════════════════════════════════════════════════════════════
// SECTION 1: SCALE — entity counts from actual bootstrap
// ═══════════════════════════════════════════════════════════════
section('1. SCALE — entity counts from actual bootstrap');

const baseState = buildFiveXWorld(SEED);
const bootstrap = baseState.runContext.bigWorldBootstrap as BigWorldBootstrap;
const scale = buildScaleManifest(bootstrap);
const diversity = buildDiversityManifest(bootstrap);
const formation = buildMarketFormation(bootstrap);
const formationSummary = buildMarketFormationSummary(formation);

check(scale.totalListings >= 4000, `listings >= 4000 (${scale.totalListings})`);
check(scale.totalOwners >= 2500, `owners >= 2500 (${scale.totalOwners})`);
check(scale.totalCustomers >= 21000, `customers >= 21000 (${scale.totalCustomers})`);
check(scale.totalBrokers >= 750, `brokers >= 750 (${scale.totalBrokers})`);
check(scale.marketCells >= 100, `market cells >= 100 (${scale.marketCells})`);
check(scale.microCells >= 300, `micro cells >= 300 (${scale.microCells})`);
check(scale.acnNetworks >= 32, `ACN networks >= 32 (${scale.acnNetworks})`);
check(scale.supportingInfoCount >= 800, `supporting info >= 800 (${scale.supportingInfoCount})`);
check(scale.historicalTransactionCount >= 300, `historical transactions >= 300 (${scale.historicalTransactionCount})`);

// Verify five-x-scale thresholds
const fxs = scale.meetsFiveXScaleThresholds;
check(fxs.listingsGte4000, `five-x: listings >= 4000 (${scale.totalListings})`);
check(fxs.ownersGte2500, `five-x: owners >= 2500 (${scale.totalOwners})`);
check(fxs.customersGte21000, `five-x: customers >= 21000 (${scale.totalCustomers})`);
check(fxs.brokersGte750, `five-x: brokers >= 750 (${scale.totalBrokers})`);
check(fxs.marketCellsGte100, `five-x: cells >= 100 (${scale.marketCells})`);
check(fxs.microCellsGte300, `five-x: micro cells >= 300 (${scale.microCells})`);
check(fxs.acnNetworksGte32, `five-x: ACN >= 32 (${scale.acnNetworks})`);
check(fxs.supportingInfoGte800, `five-x: info >= 800 (${scale.supportingInfoCount})`);
check(fxs.historicalTransactionsGte300, `five-x: txns >= 300 (${scale.historicalTransactionCount})`);

// Verify scale contract metadata
check(scale.scaleProfileId === 'five-x-city-level-v1', `scale profile is five-x (${scale.scaleProfileId})`);
check(scale.scaleContractVersion >= 2, `scale contract version >= 2 (${scale.scaleContractVersion})`);
check(scale.isFiveXScale, `isFiveXScale = true (all five-x thresholds met)`);

// Output actual counts for audit trail
const counts = scale.actualFiveXCounts;
console.log(`\n  📊 Actual Five-X Counts:`);
console.log(`     cells=${counts.marketCells}, acn=${counts.acnNetworks}, brokers=${counts.brokers}`);
console.log(`     listings=${counts.listings}, owners=${counts.owners}, customers=${counts.customers}`);
console.log(`     customerPools=${counts.customerPools}, brokerPools=${counts.brokerPools}, orgPools=${counts.orgPools}`);
console.log(`     microCells=${counts.microCells}, supportingInfo=${counts.supportingInfo}, txns=${counts.historicalTransactions}`);

// ═══════════════════════════════════════════════════════════════
// SECTION 2: STRUCTURAL DIVERSITY — archetypes, layouts, bands
// ═══════════════════════════════════════════════════════════════
section('2. STRUCTURAL DIVERSITY — archetypes, layouts, bands, segments');

check(diversity.ownerArchetypeDiversity >= 15, `owner archetypes >= 15 (${diversity.ownerArchetypeDiversity})`);
check(diversity.listingTypeDiversity >= 8, `listing layouts >= 8 (${diversity.listingTypeDiversity})`);
check(diversity.priceBandDiversity >= 5, `price bands >= 5 (${diversity.priceBandDiversity})`);
check(diversity.demandSegmentDiversity >= 10, `demand segments >= 10 (${diversity.demandSegmentDiversity})`);
check(diversity.brokerStyleDiversity >= 5, `broker styles >= 5 (${diversity.brokerStyleDiversity})`);
check(diversity.marketCellCount >= 100, `market cells in diversity >= 100 (${diversity.marketCellCount})`);

// ═══════════════════════════════════════════════════════════════
// SECTION 3: MARKET FORMATION — pool distributions
// ═══════════════════════════════════════════════════════════════
section('3. MARKET FORMATION — pool distributions and cell thickness');

check(formation.listingPool.length >= 4000, `listing pool >= 4000 (${formation.listingPool.length})`);
check(formation.ownerPool.length >= 2500, `owner pool >= 2500 (${formation.ownerPool.length})`);
check(formation.customerPool.length >= 2000, `customer pool >= 2000 (${formation.customerPool.length})`);
check(formation.brokerPool.length >= 750, `broker pool >= 750 (${formation.brokerPool.length})`);
check(formation.cellThickness.length >= 100, `cell thickness >= 100 (${formation.cellThickness.length})`);

// Listing state distribution
const lsd = formationSummary.listingStateDistribution;
check(lsd.fresh > 0, `fresh listings > 0 (${lsd.fresh})`);
check(lsd.hot > 0, `hot listings > 0 (${lsd.hot})`);
check(lsd.cold > 0, `cold listings > 0 (${lsd.cold})`);
check(lsd.price_reduced > 0, `price_reduced listings > 0 (${lsd.price_reduced})`);

// Owner state distribution
const osd = formationSummary.ownerStateDistribution;
check(osd.urgent > 0, `urgent owners > 0 (${osd.urgent})`);
check(osd.cooperative > 0, `cooperative owners > 0 (${osd.cooperative})`);
check(osd.stubborn > 0, `stubborn owners > 0 (${osd.stubborn})`);

// Customer state distribution
const csd = formationSummary.customerStateDistribution;
check(csd.first_home > 0, `first_home customers > 0 (${csd.first_home})`);
check(csd.upgrade > 0, `upgrade customers > 0 (${csd.upgrade})`);
check(csd.investment > 0, `investment customers > 0 (${csd.investment})`);

// Broker state distribution
const bsd = formationSummary.brokerStateDistribution;
check(bsd.customer_hunting > 0, `customer_hunting brokers > 0 (${bsd.customer_hunting})`);
check(bsd.competition_focused > 0, `competition_focused brokers > 0 (${bsd.competition_focused})`);

// ═══════════════════════════════════════════════════════════════
// SECTION 4: PER-CELL THICKNESS — supply/demand/broker/rival/liquidity
// ═══════════════════════════════════════════════════════════════
section('4. PER-CELL THICKNESS — structural variation across cells');

let cellsWithSupply = 0;
let cellsWithDemand = 0;
let cellsWithBroker = 0;
let cellsWithRival = 0;
let cellsWithLiquidity = 0;

for (const ct of formation.cellThickness) {
  if (ct.activeSupply > 0) cellsWithSupply++;
  if (ct.activeDemand > 0) cellsWithDemand++;
  if (ct.brokerDensity > 0) cellsWithBroker++;
  if (ct.rivalPressure > 0) cellsWithRival++;
  if (ct.liquidityLevel > 0) cellsWithLiquidity++;
}

check(cellsWithSupply >= 50, `cells with supply >= 50 (${cellsWithSupply})`);
check(cellsWithDemand >= 50, `cells with demand >= 50 (${cellsWithDemand})`);
check(cellsWithBroker >= 50, `cells with brokers >= 50 (${cellsWithBroker})`);
check(cellsWithRival >= 30, `cells with rival pressure >= 30 (${cellsWithRival})`);
check(cellsWithLiquidity >= 50, `cells with liquidity >= 50 (${cellsWithLiquidity})`);

// Verify thickness varies (not all identical)
const supplyValues = formation.cellThickness.map((ct) => ct.activeSupply);
const uniqueSupply = new Set(supplyValues);
check(uniqueSupply.size >= 5, `supply count varies across cells (${uniqueSupply.size} unique values)`);

const liquidityValues = formation.cellThickness.map((ct) => ct.liquidityLevel);
const uniqueLiquidity = new Set(liquidityValues);
check(uniqueLiquidity.size >= 5, `liquidity varies across cells (${uniqueLiquidity.size} unique values)`);

// ═══════════════════════════════════════════════════════════════
// SECTION 5: ACN DISTRIBUTION — non-trivial spread
// ═══════════════════════════════════════════════════════════════
section('5. ACN DISTRIBUTION — brokers spread across networks');

const acnBrokerCounts = new Map<string, number>();
for (const broker of bootstrap.materializedEntities.brokers) {
  acnBrokerCounts.set(broker.acnId, (acnBrokerCounts.get(broker.acnId) ?? 0) + 1);
}
check(acnBrokerCounts.size >= 8, `ACN networks with brokers >= 8 (${acnBrokerCounts.size})`);

// No single ACN should have > 50% of all brokers
const maxAcnBrokers = Math.max(...acnBrokerCounts.values());
const totalBrokers = bootstrap.materializedEntities.brokers.length;
check(maxAcnBrokers < totalBrokers * 0.5, `no single ACN has > 50% brokers (max=${maxAcnBrokers}, total=${totalBrokers})`);

// ═══════════════════════════════════════════════════════════════
// SECTION 6: FOUR-LAYER ENTITY STRATIFICATION
// ═══════════════════════════════════════════════════════════════
section('6. FOUR-LAYER ENTITY STRATIFICATION');

const materializedListings = bootstrap.materializedEntities.listings.filter((l) => l.layer === 'direct_rival').length;
const shadowListings = bootstrap.materializedEntities.listings.filter((l) => l.layer === 'shadow').length;
const coldClusters = bootstrap.coldAggregate.shadowDemandClusters.length;
const historicalTxns = bootstrap.coldAggregate.historicalTransactions.length;

check(materializedListings >= 500, `materialized (direct rival) listings >= 500 (${materializedListings})`);
check(shadowListings >= 3000, `shadow listings >= 3000 (${shadowListings})`);
check(coldClusters >= 2000, `shadow demand clusters >= 2000 (${coldClusters})`);
check(historicalTxns >= 300, `historical transactions >= 300 (${historicalTxns})`);

// Layer ratio: shadow should be > materialized (not just materializing everything)
check(shadowListings > materializedListings, `shadow > materialized (${shadowListings} > ${materializedListings})`);

// ═══════════════════════════════════════════════════════════════
// SECTION 7: RUNTIME CAUSAL EVENTS — growth over 7/14 days
// ═══════════════════════════════════════════════════════════════
section('7. RUNTIME CAUSAL EVENTS — growth over time');

const state7 = buildFiveXWorld(SEED);
advanceDays(state7, 7);
updateDerivedState(state7);

const state14 = buildFiveXWorld(SEED);
advanceDays(state14, 14);
updateDerivedState(state14);

const events7 = state7.worldCausalEvents?.length ?? 0;
const events14 = state14.worldCausalEvents?.length ?? 0;

check(events7 > 0, `7-day causal events > 0 (${events7})`);
check(events14 > events7, `14-day > 7-day (${events7} → ${events14})`);

// Source kinds in live events
const liveKinds = new Set<string>();
for (const evt of state14.worldCausalEvents ?? []) {
  for (const kind of sourceKindsForEvent(evt)) liveKinds.add(kind);
}
check(liveKinds.size >= 8, `source kinds in live >= 8 (${liveKinds.size})`);

// ═══════════════════════════════════════════════════════════════
// SECTION 8: SOURCE TRACEABILITY — stable IDs and replay keys
// ═══════════════════════════════════════════════════════════════
section('8. SOURCE TRACEABILITY — stable IDs and replay keys');

// Owner priors have provenance
const priorsWithProvenance = bootstrap.hiddenTruth.ownerProfilePriors.filter(
  (p) => p.provenance && p.provenance.sourceRef && p.provenance.origin,
);
check(priorsWithProvenance.length === bootstrap.hiddenTruth.ownerProfilePriors.length,
  `all ${bootstrap.hiddenTruth.ownerProfilePriors.length} owner priors have provenance`);

// Listing pool entries have replay keys
const listingsWithReplay = formation.listingPool.filter((l) => l.replayKey && l.replayKey.length > 0);
check(listingsWithReplay.length === formation.listingPool.length,
  `all ${formation.listingPool.length} listing pool entries have replayKey`);

// Customer pool entries have replay keys
const customersWithReplay = formation.customerPool.filter((c) => c.replayKey && c.replayKey.length > 0);
check(customersWithReplay.length === formation.customerPool.length,
  `all ${formation.customerPool.length} customer pool entries have replayKey`);

// Broker pool entries have replay keys
const brokersWithReplay = formation.brokerPool.filter((b) => b.replayKey && b.replayKey.length > 0);
check(brokersWithReplay.length === formation.brokerPool.length,
  `all ${formation.brokerPool.length} broker pool entries have replayKey`);

// ═══════════════════════════════════════════════════════════════
// SECTION 9: REPLAY DETERMINISM — same seed → byte-identical
// ═══════════════════════════════════════════════════════════════
section('9. REPLAY DETERMINISM — same seed → byte-identical');

const replayA = buildFiveXWorld(SEED);
const replayB = buildFiveXWorld(SEED);

// Bootstrap should be byte-identical
const bootstrapA = replayA.runContext.bigWorldBootstrap as BigWorldBootstrap;
const bootstrapB = replayB.runContext.bigWorldBootstrap as BigWorldBootstrap;
const listingsA = bootstrapA.materializedEntities.listings.map((l) => l.listingId).sort();
const listingsB = bootstrapB.materializedEntities.listings.map((l) => l.listingId).sort();
check(
  listingsA.length === listingsB.length && listingsA.every((id, i) => id === listingsB[i]),
  `same seed → byte-identical listing IDs (${listingsA.length} listings)`,
);

// Causal events after advance should be deterministic
advanceDays(replayA, 7);
advanceDays(replayB, 7);
const eventsA = replayA.worldCausalEvents?.map((e) => e.id).sort() ?? [];
const eventsB = replayB.worldCausalEvents?.map((e) => e.id).sort() ?? [];
check(
  eventsA.length === eventsB.length && eventsA.every((id, i) => id === eventsB[i]),
  `same seed → byte-identical 7-day causal event IDs (${eventsA.length} events)`,
);

// Different seed → different
const replayC = buildFiveXWorld(SEED + 1);
advanceDays(replayC, 7);
const eventsC = replayC.worldCausalEvents?.map((e) => e.id).sort() ?? [];
check(
  !(eventsA.length === eventsC.length && eventsA.every((id, i) => id === eventsC[i])),
  'different seed → different causal event IDs',
);

// ═══════════════════════════════════════════════════════════════
// SECTION 10: SOURCE CODE BOUNDARIES — no forbidden patterns
// ═══════════════════════════════════════════════════════════════
section('10. SOURCE CODE BOUNDARIES — no forbidden patterns');

const bootstrapSrc = readSrc('src/selling-houses/domain/world-model/bigWorldBootstrap.ts');
const specSrc = readSrc('src/selling-houses/domain/world-model/bigWorldSpecFactory.ts');
const typesSrc = readSrc('src/selling-houses/domain/world-model/bigWorldTypes.ts');

check(!/\bMath\.random\s*\(/.test(bootstrapSrc), 'bigWorldBootstrap.ts no Math.random');
check(!/\bDate\.now\s*\(/.test(bootstrapSrc), 'bigWorldBootstrap.ts no Date.now');
check(!/\bfetch\s*\(/.test(bootstrapSrc), 'bigWorldBootstrap.ts no fetch');
check(!/\bMath\.random\s*\(/.test(specSrc), 'bigWorldSpecFactory.ts no Math.random');
check(!/\bDate\.now\s*\(/.test(specSrc), 'bigWorldSpecFactory.ts no Date.now');
check(!/\bMath\.random\s*\(/.test(typesSrc), 'bigWorldTypes.ts no Math.random');

// ═══════════════════════════════════════════════════════════════
// SECTION 11: SELF-AUDIT — no soft pass patterns
// ═══════════════════════════════════════════════════════════════
section('11. SELF-AUDIT — no soft pass patterns');

const gateSrc = readSrc('scripts/verify-selling-houses-round19-five-x-scale-census-gate.ts');
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

const hasFiveXScale = scale.totalListings >= 4000 && scale.totalOwners >= 2500
  && scale.totalCustomers >= 21000 && scale.totalBrokers >= 750
  && scale.marketCells >= 100;

const hasStructuralDiversity = diversity.ownerArchetypeDiversity >= 15
  && diversity.listingTypeDiversity >= 8 && diversity.demandSegmentDiversity >= 10;

const hasFormationDepth = formation.listingPool.length >= 4000
  && formation.ownerPool.length >= 2500 && formation.customerPool.length >= 2000
  && formation.cellThickness.length >= 100;

const hasPerCellThickness = cellsWithSupply >= 50 && cellsWithDemand >= 50
  && cellsWithBroker >= 50 && cellsWithRival >= 30;

const hasFourLayers = materializedListings >= 500 && shadowListings >= 3000
  && coldClusters >= 2000 && historicalTxns >= 300;

const hasRuntimeGrowth = events14 > events7 && liveKinds.size >= 8;

const hasReplayDeterminism = eventsA.length === eventsB.length
  && eventsA.every((id, i) => id === eventsB[i]);

const hasTraceability = priorsWithProvenance.length === bootstrap.hiddenTruth.ownerProfilePriors.length
  && listingsWithReplay.length === formation.listingPool.length;

const hasNoForbidden = !/\bMath\.random\s*\(/.test(bootstrapSrc)
  && !/\bDate\.now\s*\(/.test(bootstrapSrc)
  && !/\bfetch\s*\(/.test(bootstrapSrc);

const hasNoSoftPass = !gateSrcNoComments.includes('|| true')
  && !gateSrcNoComments.match(/check\(\s*true\s*,/);

const fiveXScaleBig = hasFiveXScale && hasStructuralDiversity && hasFormationDepth
  && hasPerCellThickness && hasFourLayers && hasRuntimeGrowth && hasReplayDeterminism
  && hasTraceability && hasNoForbidden && hasNoSoftPass;

const marketMegaScaleBig = scale.totalListings >= 500 && scale.totalOwners >= 500
  && scale.totalCustomers >= 3000 && scale.totalBrokers >= 100 && scale.marketCells >= 20;

const maxLevel = fiveXScaleBig
  ? 'FIVE-X-SCALE-BIG'
  : marketMegaScaleBig
    ? 'MARKET-MEGA-SCALE-BIG'
    : hasFiveXScale
      ? 'FIVE-X-SCALE-COUNT'
      : 'FAILED';

console.log(`  FINAL MATURITY: ${maxLevel}`);
check(maxLevel === 'FIVE-X-SCALE-BIG', `final maturity is FIVE-X-SCALE-BIG (${maxLevel})`);

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  Round 19 Five-X Scale Census Gate Passed: ${passed} | Failed: ${failed}`);
console.log(`  Maturity: ${maxLevel}`);
console.log('═══════════════════════════════════════════════════════════════');

if (failed > 0) {
  console.error('\n  ❌ GATE FAILED:');
  for (const failure of failures) console.error(`    • ${failure}`);
  process.exit(1);
}

console.log('\n  ✅ GATE PASSED — FIVE-X-SCALE-BIG achieved');
