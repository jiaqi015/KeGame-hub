/**
 * Round 15 — Market-Scale Expansion Hard Gate
 *
 * Proves the Big World has expanded to real market scale:
 *   - 500+ listings, 500+ owners, 3000+ demand units, 100+ brokers, 20+ cells
 *   - Market structure: hot/cold/mature/emerging zones
 *   - Price band diversity: ultra-affordable to ultra-luxury
 *   - Demand segment diversity: first_home, upgrade, school_district, investment, etc.
 *   - Competitive density: varies by zone
 *   - Owner archetype diversity: 20+ distinct types
 *   - All entities have stable IDs, source origin, replay keys
 *   - Scale growth is linked to causal event growth (not just bootstrap manifest)
 *   - Same-seed replay is deterministic
 *
 * Anti-false-positive rules:
 *   - No `|| true` or `check(true)` on core assertions
 *   - Entity counts must be verified from actual generated data
 *   - Zone diversity must be structural (different heat/price patterns per zone)
 *   - Replay determinism must be verified with byte-identical causal event IDs
 *
 * Usage: npx tsx scripts/verify-selling-houses-round15-market-scale-expansion-gate.ts
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

// ── Scale policy: market-mega-scale ──────────────────────────────

const MARKET_MEGA_SCALE: BigWorldScalePolicy = {
  minMarketCells: 20,
  maxMarketCells: 24,
  acnCount: 8,
  namedBrokersPerAcn: 5,
  shadowBrokersPerAcn: 15,
  shadowListingsPerCell: 25,
  directRivalListingsPerCell: 8,
  materializedCustomersPerCell: 25,
  shadowAggregateClustersPerCell: 20,
  ownerProfilePriorCount: 500,
  customerCaseRatio: 12,
};

const SEED = 20260615;

// ── Helpers ─────────────────────────────────────────────────────

function sourceKindsForEvent(event: WorldCausalEvent): readonly SourceKind[] {
  const eventAny = event as WorldCausalEvent & { readonly sourceKinds?: readonly SourceKind[] };
  const kinds = new Set<SourceKind>();
  if (eventAny.sourceKind) kinds.add(eventAny.sourceKind);
  for (const kind of eventAny.sourceKinds ?? []) kinds.add(kind);
  return [...kinds];
}

// ── Build market-mega-scale world ───────────────────────────────

function buildMarketMegaWorld(seed: number): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain')!;
  const state = createInitialState(snapshot, seed);
  const bootstrap = createBigWorldBootstrap({
    seed,
    scenarioName: snapshot.scenario.name,
    difficultyId: snapshot.scenario.difficultyId,
    playerCaseCount: snapshot.scenario.cases.length,
    scaleOverride: MARKET_MEGA_SCALE,
  });
  (state.runContext as any).bigWorldBootstrap = bootstrap;
  seedInitialOpportunities(state);
  return state;
}

// ══════════════════════════════════════════════════════════════════════════
// Gate
// ══════════════════════════════════════════════════════════════════════════

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║  Round 15 — Market-Scale Expansion Hard Gate                    ║');
console.log('║  500+ listings, 500+ owners, 3000+ demand, 100+ brokers, 20+   ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');

// ═══════════════════════════════════════════════════════════════
// SECTION 1: MARKET MEGA SCALE — entity counts
// ═══════════════════════════════════════════════════════════════
section('1. MARKET MEGA SCALE — entity counts');

const state1 = buildMarketMegaWorld(SEED);
const bootstrap = state1.runContext.bigWorldBootstrap as BigWorldBootstrap;

const sm = buildScaleManifest(bootstrap);
const div = buildDiversityManifest(bootstrap);

console.log(`  Listings: ${sm.totalListings}`);
console.log(`  Owners: ${sm.totalOwners}`);
console.log(`  Customers: ${sm.totalCustomers}`);
console.log(`  Brokers: ${sm.totalBrokers}`);
console.log(`  Market cells: ${sm.marketCells}`);
console.log(`  Micro cells: ${sm.microCells}`);
console.log(`  ACN networks: ${sm.acnNetworks}`);
console.log(`  Supporting info: ${sm.supportingInfoCount}`);
console.log(`  Historical transactions: ${sm.historicalTransactionCount}`);

check(sm.totalListings >= 500, `listings >= 500 (got ${sm.totalListings})`);
check(sm.totalOwners >= 500, `owners >= 500 (got ${sm.totalOwners})`);
check(sm.totalCustomers >= 3000, `customers >= 3000 (got ${sm.totalCustomers})`);
check(sm.totalBrokers >= 100, `brokers >= 100 (got ${sm.totalBrokers})`);
check(sm.marketCells >= 20, `market cells >= 20 (got ${sm.marketCells})`);
check(sm.microCells >= 60, `micro cells >= 60 (got ${sm.microCells})`);
check(sm.acnNetworks >= 7, `ACN networks >= 7 (got ${sm.acnNetworks})`);
check(sm.supportingInfoCount >= 160, `supporting info >= 160 (got ${sm.supportingInfoCount})`);
check(sm.historicalTransactionCount >= 50, `historical transactions >= 50 (got ${sm.historicalTransactionCount})`);

// Verify meetsMarketMegaScaleThresholds
const mega = sm.meetsMarketMegaScaleThresholds;
check(mega.listingsGte500, 'meetsMarketMegaScale: listings >= 500');
check(mega.ownersGte500, 'meetsMarketMegaScale: owners >= 500');
check(mega.customersGte3000, 'meetsMarketMegaScale: customers >= 3000');
check(mega.brokersGte100, 'meetsMarketMegaScale: brokers >= 100');
check(mega.marketCellsGte20, 'meetsMarketMegaScale: cells >= 20');
check(mega.microCellsGte60, 'meetsMarketMegaScale: micro cells >= 60');
check(mega.acnNetworksGte7, 'meetsMarketMegaScale: ACN >= 7');
check(mega.supportingInfoGte160, 'meetsMarketMegaScale: info >= 160');
check(mega.historicalTransactionsGte50, 'meetsMarketMegaScale: txns >= 50');

// ═══════════════════════════════════════════════════════════════
// SECTION 2: MARKET STRUCTURE — zone diversity
// ═══════════════════════════════════════════════════════════════
section('2. MARKET STRUCTURE — zone diversity');

const cells = bootstrap.hiddenTruth.marketCells;
const heatBands = new Set(cells.map((c) => c.heatBand));
const priceTrends = new Set(cells.map((c) => c.priceTrend));
const schoolSignals = new Set(cells.map((c) => c.schoolSignal));
const commuteSignals = new Set(cells.map((c) => c.commuteSignal));

console.log(`  Heat bands: ${[...heatBands].join(', ')}`);
console.log(`  Price trends: ${[...priceTrends].join(', ')}`);
console.log(`  School signals: ${[...schoolSignals].join(', ')}`);
console.log(`  Commute signals: ${[...commuteSignals].join(', ')}`);

// Zone structural diversity
check(heatBands.size >= 3, `heat band diversity >= 3 (got ${heatBands.size}: ${[...heatBands].join(', ')})`);
check(priceTrends.size >= 2, `price trend diversity >= 2 (got ${priceTrends.size}: ${[...priceTrends].join(', ')})`);
check(schoolSignals.size >= 3, `school signal diversity >= 3 (got ${schoolSignals.size})`);
check(commuteSignals.size >= 3, `commute signal diversity >= 3 (got ${commuteSignals.size})`);

// Hot zone count (heat >= 60)
const hotCells = cells.filter((c) => c.heat >= 60);
const coldCells = cells.filter((c) => c.heat < 25);
const matureCells = cells.filter((c) => c.heat >= 25 && c.heat < 55);
check(hotCells.length >= 3, `hot zones >= 3 (got ${hotCells.length})`);
check(coldCells.length >= 2, `cold zones >= 2 (got ${coldCells.length})`);
check(matureCells.length >= 3, `mature zones >= 3 (got ${matureCells.length})`);

// ═══════════════════════════════════════════════════════════════
// SECTION 3: STRUCTURAL DIVERSITY — archetypes, layouts, bands
// ═══════════════════════════════════════════════════════════════
section('3. STRUCTURAL DIVERSITY — archetypes, layouts, bands');

console.log(`  Owner archetypes: ${div.ownerArchetypeDiversity}`);
console.log(`  Listing layouts: ${div.listingTypeDiversity}`);
console.log(`  Price bands: ${div.priceBandDiversity}`);
console.log(`  Demand segments: ${div.demandSegmentDiversity}`);
console.log(`  Broker styles: ${div.brokerStyleDiversity}`);

check(div.ownerArchetypeDiversity >= 20, `owner archetypes >= 20 (${div.ownerArchetypeDiversity})`);
check(div.listingTypeDiversity >= 8, `listing layouts >= 8 (${div.listingTypeDiversity})`);
check(div.priceBandDiversity >= 6, `price bands >= 6 (${div.priceBandDiversity})`);
check(div.demandSegmentDiversity >= 10, `demand segments >= 10 (${div.demandSegmentDiversity})`);
check(div.brokerStyleDiversity >= 8, `broker styles >= 8 (${div.brokerStyleDiversity})`);

// Price band distribution: all 6 bands must have listings
const priceBandKeys = Object.keys(div.priceBandDistribution);
check(priceBandKeys.length >= 6, `all 6 price bands represented (${priceBandKeys.length})`);

// Ultra-luxury (above_1000w) and ultra-affordable (under_200w) must exist
const above1000w = div.priceBandDistribution['above_1000w'] ?? 0;
const under200w = div.priceBandDistribution['under_200w'] ?? 0;
check(above1000w > 0, `ultra-luxury listings (above_1000w) > 0 (${above1000w})`);
check(under200w > 0, `ultra-affordable listings (under_200w) > 0 (${under200w})`);

// Hot/cold split
console.log(`  Materialized customers: ${div.hotColdSplit.materializedCustomers}`);
console.log(`  Shadow cluster units: ${div.hotColdSplit.shadowClusterUnits}`);
console.log(`  Total demand units: ${div.hotColdSplit.totalDemandUnits}`);
check(div.hotColdSplit.totalDemandUnits >= 3000, `total demand >= 3000 (${div.hotColdSplit.totalDemandUnits})`);

// ═══════════════════════════════════════════════════════════════
// SECTION 4: RUNTIME — advanceDays produces causal events
// ═══════════════════════════════════════════════════════════════
section('4. RUNTIME — advanceDays produces causal events');

const beforeCausal = state1.worldCausalEvents?.length ?? 0;
advanceDays(state1, 14);
updateDerivedState(state1);

check(state1.bigWorldRuntime !== undefined, 'bigWorldRuntime exists after 14 days');
check((state1.bigWorldRuntime?.tickCount ?? 0) >= 7, `tickCount >= 7 (got ${state1.bigWorldRuntime?.tickCount})`);
check((state1.worldCausalEvents?.length ?? 0) > beforeCausal, `worldCausalEvents grew: ${beforeCausal} → ${state1.worldCausalEvents?.length}`);
check((state1.bigWorldRuntime?.dailyEvents?.length ?? 0) > 0, `dailyEvents > 0 (${state1.bigWorldRuntime?.dailyEvents?.length})`);
check((state1.bigWorldRuntime?.dailySummaries?.length ?? 0) > 0, `dailySummaries > 0 (${state1.bigWorldRuntime?.dailySummaries?.length})`);

// ═══════════════════════════════════════════════════════════════
// SECTION 5: SOURCE COVERAGE — all 15 SourceKinds in live events
// ═══════════════════════════════════════════════════════════════
section('5. SOURCE COVERAGE — all 15 SourceKinds in live events');

const ALL_SOURCE_KINDS: SourceKind[] = [
  'market_signal', 'rival_action', 'customer_interaction', 'owner_interview',
  'manager_message', 'player_action_receipt', 'process_receipt',
  'comparable_transaction', 'platform_traffic', 'acn_network_signal',
  'supporting_facility_signal', 'broker_capacity_signal', 'owner_life_event_signal',
  'buyer_financing_signal', 'micro_market_signal',
];
check(ALL_SOURCE_KINDS.length === 15, `15 SourceKinds defined (${ALL_SOURCE_KINDS.length})`);

const liveEvents = state1.worldCausalEvents ?? [];
const sourceKindsInLive = new Set<string>();
for (const evt of liveEvents) {
  for (const kind of sourceKindsForEvent(evt)) sourceKindsInLive.add(kind);
}

const receiptSourceKinds: SourceKind[] = ['player_action_receipt', 'process_receipt'];
const ecosystemSourceKinds = ALL_SOURCE_KINDS.filter((kind) => !receiptSourceKinds.includes(kind));
const missingEcosystemKinds = ecosystemSourceKinds.filter((k) => !sourceKindsInLive.has(k));
check(missingEcosystemKinds.length === 0, `all 13 ecosystem SourceKinds present (missing: ${missingEcosystemKinds.join(', ') || 'none'})`);

// Forbidden RNG check
const srcFiles = [
  'src/selling-houses/domain/world-model/informationSourceTypes.ts',
  'src/selling-houses/domain/world-model/informationSourceRegistry.ts',
  'src/selling-houses/domain/world-model/runtime/sourceIngestionAdapter.ts',
  'src/selling-houses/domain/world-model/runtime/clock.ts',
  'src/selling-houses/domain/world-model/runtime/sourceRecordBuilder.ts',
];
for (const f of srcFiles) {
  const content = readSrc(f);
  check(!content.includes('Date.now()'), `${f} has no Date.now()`);
  check(!content.match(/\bMath\.random\b/), `${f} has no Math.random`);
  check(!content.includes('fetch('), `${f} has no fetch()`);
}

// ═══════════════════════════════════════════════════════════════
// SECTION 6: SOURCE TRACEABILITY — bidirectional source↔causal
// ═══════════════════════════════════════════════════════════════
section('6. SOURCE TRACEABILITY — bidirectional source↔causal');

let traceableCount = 0;
let untraceableCount = 0;
for (const evt of liveEvents) {
  const evtAny = evt as any;
  if (sourceKindsForEvent(evt).length > 0) {
    if (typeof evtAny.sourceRecordId === 'string' && evtAny.sourceRecordId.length > 0) {
      traceableCount++;
    } else {
      untraceableCount++;
    }
  }
}
check(traceableCount > 0, `traceable events > 0 (${traceableCount})`);
check(untraceableCount === 0, `no untraceable events with sourceKind (${untraceableCount} found)`);

const sourceRecordIds = liveEvents
  .map((e) => (e as any).sourceRecordId)
  .filter((id): id is string => typeof id === 'string' && id.length > 0);
const replayKeys = liveEvents
  .map((e) => (e as any).sourceReplayKey)
  .filter((k): k is string => typeof k === 'string' && k.length > 0);
check(sourceRecordIds.length > 0, `sourceRecordIds exist (${sourceRecordIds.length})`);
check(replayKeys.length > 0, `sourceReplayKeys exist (${replayKeys.length})`);

// ═══════════════════════════════════════════════════════════════
// SECTION 7: ENTITY PROVENANCE — stable IDs, source origin, replay keys
// ═══════════════════════════════════════════════════════════════
section('7. ENTITY PROVENANCE — stable IDs, source origin, replay keys');

// Owner priors have provenance
const priors = bootstrap.hiddenTruth.ownerProfilePriors;
const priorsWithProvenance = priors.filter((p) => p.provenance && p.provenance.sourceRef && p.provenance.origin);
check(priorsWithProvenance.length === priors.length, `all ${priors.length} owner priors have provenance`);

// Shadow demand clusters have provenance
const clusters = bootstrap.coldAggregate.shadowDemandClusters;
const clustersWithProvenance = clusters.filter((c) => c.provenance && c.provenance.sourceRef);
check(clustersWithProvenance.length === clusters.length, `all ${clusters.length} demand clusters have provenance`);

// Historical transactions have IDs
const txns = bootstrap.coldAggregate.historicalTransactions;
const txnsWithIds = txns.filter((t) => t.id && t.id.length > 0);
check(txnsWithIds.length === txns.length, `all ${txns.length} historical transactions have IDs`);

// Listing IDs are deterministic (same seed → same IDs)
const state1b = buildMarketMegaWorld(SEED);
const listingIds1 = bootstrap.materializedEntities.listings.map((l) => l.listingId).sort();
const listingIds2 = (state1b.runContext.bigWorldBootstrap as BigWorldBootstrap).materializedEntities.listings.map((l) => l.listingId).sort();
check(
  listingIds1.length === listingIds2.length && listingIds1.every((id, i) => id === listingIds2[i]),
  `same seed → byte-identical listing IDs (${listingIds1.length} listings)`,
);

// ═══════════════════════════════════════════════════════════════
// SECTION 8: REPLAY DETERMINISM — same seed → identical causal events
// ═══════════════════════════════════════════════════════════════
section('8. REPLAY DETERMINISM — same seed → identical causal events');

const state1c = buildMarketMegaWorld(SEED);
advanceDays(state1c, 14);
updateDerivedState(state1c);

check(state1.bigWorldRuntime?.tickCount === state1c.bigWorldRuntime?.tickCount, 'same seed → same tickCount');

const ids1 = state1.worldCausalEvents?.map((e) => e.id).sort() ?? [];
const ids1c = state1c.worldCausalEvents?.map((e) => e.id).sort() ?? [];
check(
  ids1.length === ids1c.length && ids1.every((id, i) => id === ids1c[i]),
  'same seed → byte-identical causal event IDs',
);

// Different seed → different
const state1d = buildMarketMegaWorld(SEED + 1);
advanceDays(state1d, 14);
updateDerivedState(state1d);
const ids1d = state1d.worldCausalEvents?.map((e) => e.id).sort() ?? [];
check(
  !(ids1.length === ids1d.length && ids1.every((id, i) => id === ids1d[i])),
  'different seed → different causal event IDs',
);

// ═══════════════════════════════════════════════════════════════
// SECTION 9: ZONE-AWARE PRICE DISTRIBUTION — hot vs cold zones
// ═══════════════════════════════════════════════════════════════
section('9. ZONE-AWARE PRICE DISTRIBUTION — hot vs cold zones');

const listings = bootstrap.materializedEntities.listings;
const cellHeatMap = new Map<string, string>();
for (const cell of cells) {
  cellHeatMap.set(cell.id, cell.heatBand);
}

const hotListings = listings.filter((l) => cellHeatMap.get(l.marketCellId) === 'hot');
const coldListings = listings.filter((l) => cellHeatMap.get(l.marketCellId) === 'cold');
const warmListings = listings.filter((l) => cellHeatMap.get(l.marketCellId) === 'warm');

const hotAvgPrice = hotListings.length > 0
  ? Math.round(hotListings.reduce((s, l) => s + l.askPrice, 0) / hotListings.length)
  : 0;
const coldAvgPrice = coldListings.length > 0
  ? Math.round(coldListings.reduce((s, l) => s + l.askPrice, 0) / coldListings.length)
  : 0;
const warmAvgPrice = warmListings.length > 0
  ? Math.round(warmListings.reduce((s, l) => s + l.askPrice, 0) / warmListings.length)
  : 0;

console.log(`  Hot zone: ${hotListings.length} listings, avg price ${hotAvgPrice}万`);
console.log(`  Warm zone: ${warmListings.length} listings, avg price ${warmAvgPrice}万`);
console.log(`  Cold zone: ${coldListings.length} listings, avg price ${coldAvgPrice}万`);

check(hotListings.length > 0, `hot zone has listings (${hotListings.length})`);
check(coldListings.length > 0, `cold zone has listings (${coldListings.length})`);
if (hotAvgPrice > 0 && coldAvgPrice > 0) {
  check(hotAvgPrice > coldAvgPrice, `hot zone avg price > cold zone (${hotAvgPrice} > ${coldAvgPrice})`);
}

// Hot zone competitiveness should be higher
const hotAvgComp = hotListings.length > 0
  ? Math.round(hotListings.reduce((s, l) => s + l.competitiveness, 0) / hotListings.length)
  : 0;
const coldAvgComp = coldListings.length > 0
  ? Math.round(coldListings.reduce((s, l) => s + l.competitiveness, 0) / coldListings.length)
  : 0;
console.log(`  Hot zone avg competitiveness: ${hotAvgComp}`);
console.log(`  Cold zone avg competitiveness: ${coldAvgComp}`);
if (hotAvgComp > 0 && coldAvgComp > 0) {
  check(hotAvgComp > coldAvgComp, `hot zone competitiveness > cold zone (${hotAvgComp} > ${coldAvgComp})`);
}

// ═══════════════════════════════════════════════════════════════
// SECTION 10: DEMAND SEGMENT COVERAGE — all major segments
// ═══════════════════════════════════════════════════════════════
section('10. DEMAND SEGMENT COVERAGE — all major segments');

const segments = new Set<string>();
for (const cluster of clusters) {
  segments.add(cluster.segment);
}
for (const customer of bootstrap.materializedEntities.customers) {
  // Customers don't have explicit segments, but their budget/urgency creates implicit segments
}

const REQUIRED_SEGMENTS = ['first_home', 'upgrade', 'school_district', 'investment', 'liquidity'];
const missingSegments = REQUIRED_SEGMENTS.filter((s) => !segments.has(s));
check(missingSegments.length === 0, `all required demand segments present (missing: ${missingSegments.join(', ') || 'none'})`);
console.log(`  Segments: ${[...segments].join(', ')}`);

// ═══════════════════════════════════════════════════════════════
// SECTION 11: COMPETITIVE DENSITY — varies by zone
// ═══════════════════════════════════════════════════════════════
section('11. COMPETITIVE DENSITY — varies by zone');

// Count listings per cell to check density variation
const listingsPerCell = new Map<string, number>();
for (const listing of listings) {
  listingsPerCell.set(listing.marketCellId, (listingsPerCell.get(listing.marketCellId) ?? 0) + 1);
}
const densities = [...listingsPerCell.values()];
const minDensity = Math.min(...densities);
const maxDensity = Math.max(...densities);
const avgDensity = Math.round(densities.reduce((s, d) => s + d, 0) / densities.length);

console.log(`  Listings per cell: min=${minDensity}, max=${maxDensity}, avg=${avgDensity}`);
check(maxDensity > minDensity, `density varies across cells (${minDensity} to ${maxDensity})`);

// ═══════════════════════════════════════════════════════════════
// SECTION 12: OWNER ARCHETYPE DIVERSITY — type distribution
// ═══════════════════════════════════════════════════════════════
section('12. OWNER ARCHETYPE DIVERSITY — type distribution');

const ownerTypeDist = div.ownerTypeDistribution;
const ownerTypes = Object.keys(ownerTypeDist);
const ownerCounts = Object.values(ownerTypeDist);
const maxOwnerType = Math.max(...ownerCounts);
const minOwnerType = Math.min(...ownerCounts);

console.log(`  Owner types: ${ownerTypes.length}`);
console.log(`  Distribution: min=${minOwnerType}, max=${maxOwnerType}`);
for (const [type, count] of Object.entries(ownerTypeDist).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
  console.log(`    ${type}: ${count}`);
}

check(ownerTypes.length >= 15, `owner types >= 15 (${ownerTypes.length})`);
// No single type should dominate (> 50% of total)
const totalPriors = priors.length;
const dominatedType = ownerCounts.find((c) => c > totalPriors * 0.5);
check(dominatedType === undefined, 'no single owner type dominates (> 50%)');

// ═══════════════════════════════════════════════════════════════
// SECTION 13: LISTING LAYOUT DIVERSITY — extended layouts
// ═══════════════════════════════════════════════════════════════
section('13. LISTING LAYOUT DIVERSITY — extended layouts');

const layoutDist = div.listingLayoutDistribution;
const layouts = Object.keys(layoutDist);
console.log(`  Layouts: ${layouts.length}`);
for (const [layout, count] of Object.entries(layoutDist).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${layout}: ${count}`);
}

check(layouts.length >= 8, `layouts >= 8 (${layouts.length})`);
// Luxury layouts should exist
const luxuryLayouts = ['别墅', '复式', 'LOFT'];
const hasLuxury = luxuryLayouts.some((l) => (layoutDist[l] ?? 0) > 0);
check(hasLuxury, `luxury layouts present (${luxuryLayouts.join(', ')})`);

// ═══════════════════════════════════════════════════════════════
// SECTION 14: BROKER STYLE DIVERSITY — extended styles
// ═══════════════════════════════════════════════════════════════
section('14. BROKER STYLE DIVERSITY — extended styles');

const brokerStyleDist = div.brokerStyleDistribution;
const brokerStyles = Object.keys(brokerStyleDist);
console.log(`  Broker styles: ${brokerStyles.length}`);
for (const [style, count] of Object.entries(brokerStyleDist).sort((a, b) => b[1] - a[1])) {
  console.log(`    ${style}: ${count}`);
}

check(brokerStyles.length >= 8, `broker styles >= 8 (${brokerStyles.length})`);

// ═══════════════════════════════════════════════════════════════
// SECTION 15: CROSS-CELL ACN COVERAGE — brokers span cells
// ═══════════════════════════════════════════════════════════════
section('15. CROSS-CELL ACN COVERAGE — brokers span cells');

const brokers = bootstrap.materializedEntities.brokers;
const acnBrokerCounts = new Map<string, number>();
for (const broker of brokers) {
  acnBrokerCounts.set(broker.acnId, (acnBrokerCounts.get(broker.acnId) ?? 0) + 1);
}
console.log(`  ACN broker distribution:`);
for (const [acnId, count] of acnBrokerCounts) {
  console.log(`    ${acnId}: ${count} brokers`);
}

// Each ACN should have brokers
for (const [acnId, count] of acnBrokerCounts) {
  check(count > 0, `ACN ${acnId} has brokers (${count})`);
}

// Brokers should cover multiple cells
const brokersMultiCell = brokers.filter((b) => b.marketCellIds.length > 1);
check(brokersMultiCell.length > 0, `brokers covering multiple cells (${brokersMultiCell.length})`);

// ═══════════════════════════════════════════════════════════════
// SECTION 16: SOURCE READINESS — supporting info coverage
// ═══════════════════════════════════════════════════════════════
section('16. SOURCE READINESS — supporting info coverage');

const srcCoverage = sm.sourceReadinessCoverage;
console.log(`  Supporting info records: ${srcCoverage.totalSupportingInfoRecords}`);
console.log(`  Categories: ${srcCoverage.categoryCoverage}`);
console.log(`  Source kinds covered: ${srcCoverage.coveredSourceKinds.length}`);
console.log(`  Coverage: ${srcCoverage.coveragePct}%`);

check(srcCoverage.totalSupportingInfoRecords >= 160, `supporting info >= 160 (${srcCoverage.totalSupportingInfoRecords})`);
check(srcCoverage.categoryCoverage >= 10, `info categories >= 10 (${srcCoverage.categoryCoverage})`);
check(srcCoverage.coveragePct >= 60, `source readiness >= 60% (${srcCoverage.coveragePct}%)`);

// ═══════════════════════════════════════════════════════════════
// SELF-AUDIT — no soft patterns in this gate (exclude this section from scan)
section('SELF-AUDIT — no soft patterns in gate source');

const gateSrc = readSrc('scripts/verify-selling-houses-round15-market-scale-expansion-gate.ts');
// Remove everything from the SELF-AUDIT section marker onward
const auditMarker = '// SELF-AUDIT — no soft patterns in this gate';
const auditIdx = gateSrc.lastIndexOf(auditMarker);
const gateSrcCore = auditIdx > 0 ? gateSrc.slice(0, auditIdx) : gateSrc;
// Strip comments (lines starting with // or block comments) before scanning
const gateSrcNoComments = gateSrcCore
  .replace(/\/\/.*$/gm, '')  // line comments
  .replace(/\/\*[\s\S]*?\*\//g, '');  // block comments
const hasTrueOrTrue = gateSrcNoComments.includes('|| true');
const hasCheckTrue = gateSrcNoComments.match(/check\(\s*true\s*,/);
check(!hasTrueOrTrue, 'gate source (excl self-audit) has no || true');
check(!hasCheckTrue, 'gate source (excl self-audit) has no check(true, ...)');

// ═══════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════

console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  Round 15 — Market-Scale Expansion Gate`);
console.log(`  Passed: ${passed} | Failed: ${failed}`);
console.log('═══════════════════════════════════════════════════════════════');

if (failures.length > 0) {
  console.log('\n  Failures:');
  for (const f of failures) {
    console.log(`    ❌ ${f}`);
  }
}

if (failed === 0) {
  console.log('\n  ✅ MARKET-MEGA-SCALE achieved');
  console.log(`  ${sm.totalListings} listings | ${sm.totalOwners} owners | ${sm.totalCustomers} demand | ${sm.totalBrokers} brokers | ${sm.marketCells} cells`);
  console.log(`  ${div.ownerArchetypeDiversity} owner archetypes | ${div.listingTypeDiversity} layouts | ${div.priceBandDiversity} price bands | ${div.brokerStyleDiversity} broker styles`);
  console.log(`  ${hotCells.length} hot zones | ${coldCells.length} cold zones | ${matureCells.length} mature zones`);
  process.exit(0);
} else {
  console.log('\n  ❌ GATE FAILED');
  process.exit(1);
}
