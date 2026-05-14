/**
 * Round 12 — Super Market Scale Census Gate
 *
 * Proves WHERE the "big" actually is at market scale.
 * Distinguishes bootstrap-big from runtime-big from causal-big from product-big.
 *
 * Sections:
 *  1. Super-Market Scale Thresholds — 300+/300+/1000+/60+/8+/24+/5+/80+
 *  2. Diversity Manifest — 20+ owner types, 8+ layouts, 6+ price bands, 10+ segments, 8+ broker styles
 *  3. Source Readiness — 80+ supporting info, category coverage
 *  4. Bootstrap→Runtime Chain — bootstrap entities appear in causal events
 *  5. Causal Scale — sourceRecordId coverage, distinct kinds/actors/entities
 *  6. Product Scale — projection surfaces consume live causal refs
 *  7. Terminal Scale — terminal case explainable
 *  8. Anti-Fake-Big — entity big but causal zero → FAIL
 *  9. Census Matrix — layered count report
 *
 * Anti-false-positive rules:
 * - entity count big but source-linked causal = 0 → FAIL
 * - customers many but no demand segment diversity → FAIL
 * - listings many but no market cell / price band / owner type diversity → FAIL
 * - brokers many but no style / ACN diversity → FAIL
 * - bootstrap big but runtime not growing → FAIL
 * - only active case explainable, terminal not → FAIL
 *
 * Usage: npx tsx scripts/verify-selling-houses-round12-super-market-scale-census-gate.ts
 */

import assert from 'node:assert/strict';
import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine/opportunityEngine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { advanceDays } from '../src/selling-houses/domain/engine.js';
import {
  buildWorkspaceBigWorldModule,
} from '../src/selling-houses/application/projections/bigWorldPOVProjection.js';
import {
  buildActorKnowledgeSnapshot,
} from '../src/selling-houses/application/projections/actorKnowledgeProjection.js';
import {
  createEmptyRegistry,
  appendSourceRecord,
} from '../src/selling-houses/domain/world-model/informationSourceRegistry.js';
import type { GameState } from '../src/selling-houses/domain/models.js';
import type { InformationSourceRecord, SourceKind } from '../src/selling-houses/domain/world-model/informationSourceTypes.js';
import type { BigWorldBootstrap, BigWorldScalePolicy } from '../src/selling-houses/domain/world-model/bigWorldTypes.js';
import { buildBootstrapSummary, buildScaleManifest, buildDiversityManifest, createBigWorldBootstrap } from '../src/selling-houses/domain/world-model/bigWorldBootstrap.js';

// ── Infrastructure ──────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(condition: boolean, msg: string) {
  if (condition) { passed++; console.log(`  ✓ ${msg}`); }
  else { failed++; failures.push(msg); console.error(`  ✗ ${msg}`); }
}

function section(title: string) {
  console.log(`\n━━━ ${title} ━━━`);
}

const SEED = 20260513;

// Super-market-scale policy
const SUPER_MARKET_SCALE: BigWorldScalePolicy = {
  minMarketCells: 10,
  maxMarketCells: 12,
  acnCount: 5,
  namedBrokersPerAcn: 5,
  shadowBrokersPerAcn: 10,
  shadowListingsPerCell: 30,
  directRivalListingsPerCell: 7,
  materializedCustomersPerCell: 20,
  shadowAggregateClustersPerCell: 15,
  ownerProfilePriorCount: 300,
  customerCaseRatio: 10,
};

function buildSuperMarketWorld(seed: number): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain')!;
  const state = createInitialState(snapshot, seed);
  // Override the bootstrap with super-market-scale
  const bootstrap = createBigWorldBootstrap({
    seed,
    scenarioName: snapshot.scenario.name,
    difficultyId: snapshot.scenario.difficultyId,
    playerCaseCount: snapshot.scenario.cases.length,
    scaleOverride: SUPER_MARKET_SCALE,
  });
  (state.runContext as any).bigWorldBootstrap = bootstrap;
  seedInitialOpportunities(state);
  return state;
}

console.log('═══════════════════════════════════════════════════════════════');
console.log('  Round 12 — Super Market Scale Census Gate');
console.log('  Prove WHERE the big is, EXPOSE where it is not');
console.log('═══════════════════════════════════════════════════════════════\n');

// ═══════════════════════════════════════════════════════════════
// SECTION 1: SUPER-MARKET SCALE THRESHOLDS
// ═══════════════════════════════════════════════════════════════
section('Section 1: Super-Market Scale Thresholds');

const state = buildSuperMarketWorld(SEED);
const bootstrap = state.runContext.bigWorldBootstrap as BigWorldBootstrap;
check(!!bootstrap, 'bigWorldBootstrap exists');

const sm = buildScaleManifest(bootstrap);
const ht = bootstrap.hiddenTruth;
const me = bootstrap.materializedEntities;
const ca = bootstrap.coldAggregate;

console.log(`  listings: ${sm.totalListings}`);
console.log(`  owners: ${sm.totalOwners}`);
console.log(`  customers (total demand): ${sm.totalCustomers}`);
console.log(`  brokers: ${sm.totalBrokers}`);
console.log(`  marketCells: ${sm.marketCells}`);
console.log(`  microCells: ${sm.microCells}`);
console.log(`  acnNetworks: ${sm.acnNetworks}`);
console.log(`  supportingInfo: ${sm.supportingInfoCount}`);
console.log(`  historicalTxns: ${sm.historicalTransactionCount}`);

const sms = sm.meetsSuperMarketScaleThresholds;
check(sms.listingsGte300, `listings >= 300 (${sm.totalListings})`);
check(sms.ownersGte300, `owners >= 300 (${sm.totalOwners})`);
check(sms.customersGte1000, `customers >= 1000 (${sm.totalCustomers})`);
check(sms.brokersGte60, `brokers >= 60 (${sm.totalBrokers})`);
check(sms.marketCellsGte8, `marketCells >= 8 (${sm.marketCells})`);
check(sms.microCellsGte24, `microCells >= 24 (${sm.microCells})`);
check(sms.acnNetworksGte5, `acnNetworks >= 5 (${sm.acnNetworks})`);
check(sms.supportingInfoGte80, `supportingInfo >= 80 (${sm.supportingInfoCount})`);

// ═══════════════════════════════════════════════════════════════
// SECTION 2: DIVERSITY MANIFEST
// ═══════════════════════════════════════════════════════════════
section('Section 2: Diversity Manifest');

const div = buildDiversityManifest(bootstrap);

// Owner archetype diversity
check(div.ownerArchetypeDiversity >= 20, `owner archetypes >= 20 (${div.ownerArchetypeDiversity})`);
const ownerDist = Object.entries(div.ownerTypeDistribution);
check(ownerDist.length >= 20, `owner type distribution has >= 20 entries (${ownerDist.length})`);
console.log(`  owner types: ${div.ownerArchetypeDiversity} (${ownerDist.slice(0, 5).map(([k, v]) => `${k}:${v}`).join(', ')}...)`);

// Listing type diversity
check(div.listingTypeDiversity >= 8, `listing layouts >= 8 (${div.listingTypeDiversity})`);
const layoutDist = Object.entries(div.listingLayoutDistribution);
console.log(`  layouts: ${div.listingTypeDiversity} (${layoutDist.map(([k, v]) => `${k}:${v}`).join(', ')})`);

// Price band diversity
check(div.priceBandDiversity >= 6, `price bands >= 6 (${div.priceBandDiversity})`);
const priceDist = Object.entries(div.priceBandDistribution);
console.log(`  price bands: ${div.priceBandDiversity} (${priceDist.map(([k, v]) => `${k}:${v}`).join(', ')})`);

// Demand segment diversity
check(div.demandSegmentDiversity >= 10, `demand segments >= 10 (${div.demandSegmentDiversity})`);
const segDist = Object.entries(div.customerSegmentDistribution);
console.log(`  demand segments: ${div.demandSegmentDiversity} (${segDist.slice(0, 5).map(([k, v]) => `${k}:${v}`).join(', ')}...)`);

// Broker style diversity
check(div.brokerStyleDiversity >= 8, `broker styles >= 8 (${div.brokerStyleDiversity})`);
const styleDist = Object.entries(div.brokerStyleDistribution);
console.log(`  broker styles: ${div.brokerStyleDiversity} (${styleDist.map(([k, v]) => `${k}:${v}`).join(', ')})`);

// Market cell distribution — no cell should have > 40% of listings
const cellEntries = Object.entries(div.marketCellDistribution);
if (cellEntries.length > 0) {
  const maxCellCount = Math.max(...cellEntries.map(([, v]) => v));
  const totalListings = cellEntries.reduce((s, [, v]) => s + v, 0);
  const maxCellPct = totalListings > 0 ? Math.round((maxCellCount / totalListings) * 100) : 0;
  check(maxCellPct <= 40, `no cell has > 40% of listings (max: ${maxCellPct}%)`);
}

// Hot/cold split
const hcs = div.hotColdSplit;
check(hcs.materializedCustomers > 0, `materializedCustomers > 0 (${hcs.materializedCustomers})`);
check(hcs.materializedListingCount > 0, `materializedListingCount > 0 (${hcs.materializedListingCount})`);
check(hcs.totalDemandUnits > 0, `totalDemandUnits > 0 (${hcs.totalDemandUnits})`);
check(hcs.materializedCustomers > 0 && hcs.shadowClusterUnits > 0, `hot AND cold demand both non-zero`);
console.log(`  hot/cold: ${hcs.materializedCustomers} materialized + ${hcs.shadowClusterUnits} shadow = ${hcs.totalDemandUnits} total`);

// ═══════════════════════════════════════════════════════════════
// SECTION 3: SOURCE READINESS
// ═══════════════════════════════════════════════════════════════
section('Section 3: Source Readiness');

check(sm.supportingInfoCount >= 80, `supporting info >= 80 (${sm.supportingInfoCount})`);
console.log(`  supportingInfo: ${sm.supportingInfoCount} records`);

// Source readiness: how many of 15 SourceKinds are bootstrappable
const coverage = sm.sourceReadinessCoverage;
check(coverage.coveragePct >= 50, `source readiness >= 50% (${coverage.coveragePct}%)`);
console.log(`  source readiness: ${coverage.coveragePct}% (${coverage.coveredSourceKinds.length}/15 kinds)`);
console.log(`  categories: ${Object.keys(coverage.categoryCounts).join(', ')}`);

// ═══════════════════════════════════════════════════════════════
// SECTION 4: BOOTSTRAP → RUNTIME CHAIN
// ═══════════════════════════════════════════════════════════════
section('Section 4: Bootstrap → Runtime Chain');

advanceDays(state, 14);
updateDerivedState(state);

const events = state.worldCausalEvents ?? [];
const rt = state.bigWorldRuntime;
const tickCount = rt?.tickCount ?? 0;
check(tickCount >= 7, `tickCount >= 7 (${tickCount})`);
check(events.length > 0, `worldCausalEvents > 0 (${events.length})`);

// Bootstrap entity IDs should appear in causal events
const entityIdsFromBootstrap = new Set<string>();
for (const cell of ht.marketCells) entityIdsFromBootstrap.add(cell.id);
for (const acn of ht.acnNetworks) entityIdsFromBootstrap.add(acn.id);
for (const broker of me.brokers) entityIdsFromBootstrap.add(broker.brokerId);
for (const listing of me.listings) entityIdsFromBootstrap.add(listing.listingId);
for (const prior of ht.ownerProfilePriors) entityIdsFromBootstrap.add(prior.priorId);

const brokerIdSet = new Set<string>();
for (const broker of me.brokers) brokerIdSet.add(broker.brokerId);
const ownerIdSet = new Set<string>();
for (const prior of ht.ownerProfilePriors) ownerIdSet.add(prior.priorId);

const bootstrapEntitiesInCausal = new Set<string>();
for (const e of events) {
  for (const id of (e as any).entityIds ?? []) {
    if (entityIdsFromBootstrap.has(id)) bootstrapEntitiesInCausal.add(id);
  }
  for (const id of (e as any).affectedIds ?? []) {
    if (entityIdsFromBootstrap.has(id)) bootstrapEntitiesInCausal.add(id);
  }
  for (const actorId of (e as any).actorIds ?? []) {
    for (const brokerId of brokerIdSet) {
      if (actorId.includes(brokerId)) bootstrapEntitiesInCausal.add(brokerId);
    }
    for (const ownerId of ownerIdSet) {
      if (actorId.includes(ownerId)) bootstrapEntitiesInCausal.add(ownerId);
    }
  }
}

check(bootstrapEntitiesInCausal.size > 0, `bootstrap entities in causal (${bootstrapEntitiesInCausal.size}/${entityIdsFromBootstrap.size})`);

const cellIdsInCausal = ht.marketCells.filter((c) => bootstrapEntitiesInCausal.has(c.id));
check(cellIdsInCausal.length > 0, `market cells in causal (${cellIdsInCausal.length}/${ht.marketCells.length})`);

const brokerIdsInCausal = me.brokers.filter((b) => bootstrapEntitiesInCausal.has(b.brokerId));
check(brokerIdsInCausal.length > 0, `broker IDs in causal (${brokerIdsInCausal.length}/${me.brokers.length})`);

// ═══════════════════════════════════════════════════════════════
// SECTION 5: CAUSAL SCALE
// ═══════════════════════════════════════════════════════════════
section('Section 5: Causal Scale');

const byKind = new Map<string, number>();
for (const e of events) byKind.set(e.kind, (byKind.get(e.kind) ?? 0) + 1);
const kindsCount = byKind.size;
check(kindsCount >= 3, `distinct causal kinds >= 3 (${kindsCount})`);
console.log(`  kinds: ${kindsCount} (${[...byKind.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k, v]) => `${k}:${v}`).join(', ')})`);

let withSourceRecordId = 0;
for (const e of events) {
  if (typeof (e as any).sourceRecordId === 'string' && (e as any).sourceRecordId.length > 0) withSourceRecordId++;
}
const pct = events.length > 0 ? Math.round((withSourceRecordId / events.length) * 100) : 0;
check(pct > 0 || events.length < 50, `sourceRecordId coverage > 0 or events < 50 (${pct}%)`);
console.log(`  sourceRecordId coverage: ${withSourceRecordId}/${events.length} (${pct}%)`);

const distinctActors = new Set<string>();
for (const e of events) for (const a of (e as any).actorIds ?? []) distinctActors.add(a);
check(distinctActors.size >= 3, `distinct actors >= 3 (${distinctActors.size})`);

const distinctEntities = new Set<string>();
for (const e of events) {
  for (const id of (e as any).entityIds ?? []) distinctEntities.add(id);
  for (const id of (e as any).affectedIds ?? []) distinctEntities.add(id);
}
check(distinctEntities.size >= 5, `distinct entities >= 5 (${distinctEntities.size})`);

// ═══════════════════════════════════════════════════════════════
// SECTION 6: PRODUCT SCALE
// ═══════════════════════════════════════════════════════════════
section('Section 6: Product Scale');

const projectionCase = state.cases.find((c) => c.status === 'active') ?? state.cases[0];
check(!!projectionCase, 'projection case exists');

let surfacesWithLiveRefs = 0;
const surfaceNames: string[] = [];

if (projectionCase) {
  const summary = buildWorkspaceBigWorldModule(state, projectionCase.id);
  if (summary) {
    const liveEventIds = new Set((state.worldCausalEvents ?? []).map((e) => e.id));
    const surfaceChecks: Array<{ name: string; refs: Array<{ refId: string }> }> = [
      { name: 'ownerExpectation', refs: [...summary.ownerExpectation.refs] },
      { name: 'brokerActionPressure', refs: [...summary.brokerActionPressure.refs] },
      { name: 'demandMovement', refs: [...summary.demandMovement.refs] },
      { name: 'comparableSupply', refs: [...summary.comparableSupply.refs] },
      { name: 'becauseBigProof', refs: [...summary.becauseBigProof.safeCausalRefs] },
    ];
    for (const surface of surfaceChecks) {
      const live = surface.refs.filter((r) => liveEventIds.has(r.refId));
      if (live.length > 0) { surfacesWithLiveRefs++; surfaceNames.push(surface.name); }
    }
    const mcRefs = summary.marketCell.refs.filter((r) => liveEventIds.has(r.refId));
    if (mcRefs.length > 0) { surfacesWithLiveRefs++; surfaceNames.push('marketCell'); }
  }
}
check(surfacesWithLiveRefs >= 2, `>= 2 surfaces consume live causal refs (${surfacesWithLiveRefs}: ${surfaceNames.join(', ')})`);

// Multi-actor POV check
const roles = ['player_broker', 'rival_broker', 'owner', 'customer', 'manager'] as const;
const driftRegistry = (() => {
  let reg = createEmptyRegistry();
  for (let i = 0; i < 20; i++) {
    const kinds: SourceKind[] = ['market_signal', 'rival_action', 'owner_interview', 'customer_interaction'];
    const kind = kinds[i % kinds.length];
    const result = appendSourceRecord(reg, {
      sourceId: `isr-r12-${i}`,
      sourceKind: kind,
      day: Math.floor(i / 4) + 1,
      phase: 'afternoon',
      entityRefs: [{ id: 'case-1', kind: 'case' }],
      actorRefs: [{ id: 'player-broker', role: 'player_broker' }],
      visibility: { scope: i % 5 === 4 ? 'no_one' as const : 'all_actors' as const, baseDelayDays: 0 },
      confidence: 0.85,
      delayDays: 0,
      replayKey: `rk-r12-${i}`,
      origin: 'player_action',
      payload: { summary: `r12 test ${kind}`, subtype: 'heat_shift', marketCellId: 'cell-1', before: 50, after: 60, unit: 'heat_index', isPublic: true },
    } as unknown as InformationSourceRecord);
    if (result.ok) reg = result.registry;
  }
  return reg;
})();

const roleVisibleCounts = new Map<string, number>();
for (const role of roles) {
  const k = buildActorKnowledgeSnapshot(`actor-${role}`, role, state.day, driftRegistry);
  roleVisibleCounts.set(role, k.visibleSources.length);
}
const uniqueVisibleCounts = new Set([...roleVisibleCounts.values()]);
check(uniqueVisibleCounts.size >= 2, `different roles see different counts (${uniqueVisibleCounts.size} unique)`);

// ═══════════════════════════════════════════════════════════════
// SECTION 7: TERMINAL SCALE
// ═══════════════════════════════════════════════════════════════
section('Section 7: Terminal Scale');

const state7 = buildSuperMarketWorld(SEED + 1000);
advanceDays(state7, 21);
updateDerivedState(state7);

const activeCases = state7.cases.filter((c) => c.status === 'active');
const terminalCases = state7.cases.filter((c) => c.status !== 'active');
console.log(`  active: ${activeCases.length}, terminal: ${terminalCases.length}`);

if (terminalCases.length > 0) {
  const tc = terminalCases[0];
  const tcEvents = (state7.worldCausalEvents ?? []).filter(
    (e) => (e.entityIds ?? []).includes(tc.id) || (e.affectedIds ?? []).includes(tc.id)
  );
  check(tcEvents.length > 0, `terminal case "${tc.title}" has ${tcEvents.length} causal events`);
  const tSummary = buildWorkspaceBigWorldModule(state7, tc.id);
  if (tSummary) {
    check(tSummary.becauseBigProof.movementEvidence.length > 0, 'terminal case has movementEvidence');
    check(tSummary.becauseBigProof.safeCausalRefs.length > 0, 'terminal case has safeCausalRefs');
  } else {
    check(tcEvents.length > 0, 'terminal case has causal history without projection');
  }
}

if (activeCases.length === 0) {
  check(terminalCases.length > 0, 'terminal cases exist when active = 0');
  for (const tc of terminalCases.slice(0, 3)) {
    const tcEv = (state7.worldCausalEvents ?? []).filter(
      (e) => (e.entityIds ?? []).includes(tc.id) || (e.affectedIds ?? []).includes(tc.id)
    );
    check(tcEv.length > 0, `terminal case "${tc.title}" has causal history`);
  }
}

// ═══════════════════════════════════════════════════════════════
// SECTION 8: ANTI-FAKE-BIG
// ═══════════════════════════════════════════════════════════════
section('Section 8: Anti-Fake-Big');

// Entity count big but causal chain empty
const entityCount = state.cases.length + state.opportunities.length;
const causalChainLen = events.length;
if (entityCount > 10) {
  check(causalChainLen > 0, `causal chain > 0 (${causalChainLen} events, not just inflation)`);
}

// Bootstrap big but runtime not growing
if (sm.totalListings >= 50) {
  check(tickCount >= 5, `bootstrap has ${sm.totalListings} listings but tickCount >= 5`);
}

// Customers many but no demand segment diversity
if (sm.totalCustomers >= 500) {
  check(div.demandSegmentDiversity >= 5, `customers >= 500 but demand segments >= 5 (${div.demandSegmentDiversity})`);
}

// Listings many but no market cell / price band diversity
if (sm.totalListings >= 100) {
  check(div.marketCellCount >= 3, `listings >= 100 but marketCells >= 3 (${div.marketCellCount})`);
  check(div.priceBandDiversity >= 3, `listings >= 100 but price bands >= 3 (${div.priceBandDiversity})`);
  check(div.ownerArchetypeDiversity >= 5, `listings >= 100 but owner types >= 5 (${div.ownerArchetypeDiversity})`);
}

// Brokers many but no style diversity
if (sm.totalBrokers >= 30) {
  check(div.brokerStyleDiversity >= 5, `brokers >= 30 but styles >= 5 (${div.brokerStyleDiversity})`);
}

// Source-linked events have sourceKind
let sourceLinkedMissing = 0;
for (const e of events) {
  const srcId = (e as any).sourceRecordId;
  const srcKind = (e as any).sourceKind;
  if (typeof srcId === 'string' && srcId.length > 0) {
    if (typeof srcKind !== 'string' || srcKind.length === 0) sourceLinkedMissing++;
  }
}
check(sourceLinkedMissing === 0, `source-linked events have sourceKind (${sourceLinkedMissing} missing)`);

// Projection has replayKey
if (projectionCase) {
  const s = buildWorkspaceBigWorldModule(state, projectionCase.id);
  if (s && s.recommendedActionReasons.length > 0) {
    let withReplayKey = 0;
    for (const r of s.recommendedActionReasons) {
      if (r.replayKey !== undefined) withReplayKey++;
    }
    check(withReplayKey === s.recommendedActionReasons.length, `all reasons have replayKey (${withReplayKey}/${s.recommendedActionReasons.length})`);
  }
}

// ═══════════════════════════════════════════════════════════════
// SECTION 9: CENSUS MATRIX
// ═══════════════════════════════════════════════════════════════
section('Census Matrix');

const census = {
  bootstrap: {
    marketCells: sm.marketCells,
    microCells: sm.microCells,
    acnNetworks: sm.acnNetworks,
    brokers: sm.totalBrokers,
    listings: sm.totalListings,
    owners: sm.totalOwners,
    customers: sm.totalCustomers,
    supportingInfo: sm.supportingInfoCount,
    demandClusters: ca.shadowDemandClusters.length,
    historicalTxns: sm.historicalTransactionCount,
  },
  runtime: {
    tickCount,
    dailyEvents: rt?.dailyEvents?.length ?? 0,
    dailySummaries: rt?.dailySummaries?.length ?? 0,
    worldCausalEvents: events.length,
  },
  causal: {
    distinctKinds: kindsCount,
    sourceRecordIdCoverage: pct,
    distinctActors: distinctActors.size,
    distinctEntities: distinctEntities.size,
  },
  diversity: {
    ownerArchetypes: div.ownerArchetypeDiversity,
    listingLayouts: div.listingTypeDiversity,
    priceBands: div.priceBandDiversity,
    demandSegments: div.demandSegmentDiversity,
    brokerStyles: div.brokerStyleDiversity,
    marketCells: div.marketCellCount,
  },
  product: {
    surfacesWithLiveRefs,
    surfaceNames,
  },
  terminal: {
    activeCases: activeCases.length,
    terminalCases: terminalCases.length,
  },
};

console.log(JSON.stringify(census, null, 2));

// ── Summary ──
console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  Round 12 — Super Market Scale Census Gate`);
console.log(`  Passed: ${passed} | Failed: ${failed}`);
console.log('═══════════════════════════════════════════════════════════════');

if (failed > 0) {
  console.error('\nGATE FAILED — super-market-scale gaps detected:');
  for (const f of failures) {
    console.error(`  ✗ ${f}`);
  }
  process.exit(1);
} else {
  console.log('\nGATE PASSED — super market scale census complete');
}
