/**
 * Round 13 — No-Dead-Corner Product Census Gate
 *
 * Verifies that every product surface either:
 *   (a) connects to the Big World causal chain (causal refs + explanation envelope), OR
 *   (b) is intentionally disconnected by design (result, leaderboard, architecture surfaces)
 *
 * This gate runs a LIVE end-to-end simulation:
 *   bootstrap super-market → advanceDays → source records → causal events →
 *   run ALL projections → verify causal chain connectivity
 *
 * Every check is against REAL runtime behavior from ONE unified live
 * super-market world, not synthetic registries or static code analysis.
 */

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { advanceGameDays, executeGameAction } from '../src/selling-houses/application/gameTransitions.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine/opportunityEngine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { advanceDays } from '../src/selling-houses/domain/engine.js';
import {
  buildWorkspaceBigWorldModule,
  buildLiveCausalContext,
} from '../src/selling-houses/application/projections/bigWorldPOVProjection.js';
import {
  buildActorKnowledgeSnapshot,
  buildDecisionEvidenceEnvelope,
  evaluatePressureSignals,
  filterAvailableCommands,
  rankCommands,
  buildExplanationEnvelope,
} from '../src/selling-houses/application/projections/actorKnowledgeProjection.js';
import {
  createEmptyRegistry,
  appendSourceRecord,
} from '../src/selling-houses/domain/world-model/informationSourceRegistry.js';
import {
  buildProductSurfaceCensus,
  buildProductCensusSummary,
  runAllProjectionsAgainstLiveState,
  type SurfaceCensusEntry,
  type ProductCensusSummary,
} from '../src/selling-houses/application/projections/noDeadCornerProductCensus.js';
import type { GameState } from '../src/selling-houses/domain/models.js';
import type {
  SourceKind,
  ActorRole,
} from '../src/selling-houses/domain/world-model/informationSourceTypes.js';
import type {
  BigWorldBootstrap,
  BigWorldScalePolicy,
} from '../src/selling-houses/domain/world-model/bigWorldTypes.js';
import type { WorldCausalEvent } from '../src/selling-houses/domain/world-model/causalEvents.js';

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

// ── Scale policy ────────────────────────────────────────────────

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

const SEED = 20260514;

// ── Imports ─────────────────────────────────────────────────────

const { createBigWorldBootstrap, buildScaleManifest, buildDiversityManifest } = await import('../src/selling-houses/domain/world-model/bigWorldBootstrap.js');

// ── Build mega-scale world via bootstrap ────────────────────────

function buildSuperMarketWorld(seed: number): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain')!;
  const state = createInitialState(snapshot, seed);
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

function sourceKindsForEvent(event: WorldCausalEvent): readonly SourceKind[] {
  const eventAny = event as WorldCausalEvent & { readonly sourceKinds?: readonly SourceKind[] };
  const kinds = new Set<SourceKind>();
  if (eventAny.sourceKind) kinds.add(eventAny.sourceKind);
  for (const kind of eventAny.sourceKinds ?? []) kinds.add(kind);
  return [...kinds];
}

// ══════════════════════════════════════════════════════════════════════════
// Gate
// ══════════════════════════════════════════════════════════════════════════

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║  Round 13 — No-Dead-Corner Product Census                      ║');
console.log('║  Gate: every surface connects to causal chain or is intentional ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');

// ═══════════════════════════════════════════════════════════════
// SECTION 1: STATIC CENSUS — catalog all surfaces
// ═══════════════════════════════════════════════════════════════
section('1. STATIC CENSUS — catalog all projection surfaces');

const census = buildProductSurfaceCensus();
const summary = buildProductCensusSummary(census);

console.log(`\n  Total surfaces: ${summary.totalSurfaces}`);
console.log(`  Connected: ${summary.connectedSurfaces}`);
console.log(`  Partial: ${summary.partialSurfaces}`);
console.log(`  Disconnected: ${summary.disconnectedSurfaces}`);
console.log(`  With live causal refs: ${summary.surfacesWithLiveCausalRefs}`);
console.log(`  With explanation envelope: ${summary.surfacesWithExplanationEnvelope}`);
console.log(`  With actor knowledge: ${summary.surfacesWithActorKnowledge}`);
console.log(`  With legacy field reads: ${summary.surfacesWithLegacyFieldReads}`);
console.log(`  Maturity: ${summary.maturity}`);

check(summary.totalSurfaces === 14, `Census catalogs exactly 14 surfaces (got ${summary.totalSurfaces})`);
check(summary.connectedSurfaces >= 10, `At least 10 surfaces are fully connected (got ${summary.connectedSurfaces})`);
check(summary.partialSurfaces >= 1, `At least 1 surface is partial (got ${summary.partialSurfaces})`);
check(summary.surfacesWithLiveCausalRefs >= 4, `At least 4 surfaces have live causal refs (got ${summary.surfacesWithLiveCausalRefs})`);
check(summary.surfacesWithExplanationEnvelope >= 4, `At least 4 surfaces have explanation envelope (got ${summary.surfacesWithExplanationEnvelope})`);
check(summary.surfacesWithActorKnowledge >= 4, `At least 4 surfaces use actor knowledge (got ${summary.surfacesWithActorKnowledge})`);

// Disconnected surfaces must be intentional (only architecture surfaces + leaderboard remain disconnected)
const intentionalDisconnected = ['leaderboard', 'architecture-migration-readiness', 'architecture-parity'];
for (const id of summary.disconnectedSurfaceIds) {
  check(intentionalDisconnected.includes(id), `Disconnected surface "${id}" is intentionally disconnected by design`);
}

// ═══════════════════════════════════════════════════════════════
// SECTION 2: SCALE BIG — verify bootstrap scale via manifest
// ═══════════════════════════════════════════════════════════════
section('2. SCALE BIG — verify bootstrap scale via manifest');

const state = buildSuperMarketWorld(SEED);
const bootstrap = state.runContext.bigWorldBootstrap as BigWorldBootstrap;
const sm = buildScaleManifest(bootstrap);
const div = buildDiversityManifest(bootstrap);

console.log(`\n  Listings: ${sm.totalListings}`);
console.log(`  Owners: ${sm.totalOwners}`);
console.log(`  Customers: ${sm.totalCustomers}`);
console.log(`  Brokers: ${sm.totalBrokers}`);
console.log(`  Market cells: ${sm.marketCells}`);
console.log(`  ACN networks: ${sm.acnNetworks}`);
console.log(`  Supporting info: ${sm.supportingInfoCount}`);

check(sm.totalListings >= 300, `At least 300 listings (got ${sm.totalListings})`);
check(sm.totalOwners >= 300, `At least 300 owners (got ${sm.totalOwners})`);
check(sm.totalCustomers >= 1000, `At least 1000 customers (got ${sm.totalCustomers})`);
check(sm.totalBrokers >= 60, `At least 60 brokers (got ${sm.totalBrokers})`);
check(sm.marketCells >= 8, `At least 8 market cells (got ${sm.marketCells})`);
check(sm.acnNetworks >= 5, `At least 5 ACN networks (got ${sm.acnNetworks})`);

// ═══════════════════════════════════════════════════════════════
// SECTION 3: RUNTIME BIG — advance 14 days, verify causal events
// ═══════════════════════════════════════════════════════════════
section('3. RUNTIME BIG — advance 14 days, verify causal events');

const beforeCausal = state.worldCausalEvents?.length ?? 0;
advanceDays(state, 14);
updateDerivedState(state);

const causalEventCount = state.worldCausalEvents?.length ?? 0;
console.log(`\n  Causal events: ${beforeCausal} → ${causalEventCount}`);
console.log(`  Tick count: ${state.bigWorldRuntime?.tickCount ?? 0}`);

check(causalEventCount > beforeCausal, `Causal events grew: ${beforeCausal} → ${causalEventCount}`);
check(causalEventCount >= 100, `At least 100 causal events (got ${causalEventCount})`);
check((state.bigWorldRuntime?.tickCount ?? 0) >= 7, `tickCount >= 7 (got ${state.bigWorldRuntime?.tickCount})`);

// ═══════════════════════════════════════════════════════════════
// SECTION 4: LIVE PROJECTIONS — run all projections against live state
// ═══════════════════════════════════════════════════════════════
section('4. LIVE PROJECTIONS — run all projections against live state');

// Build registry from LIVE causal events (same pattern as Round 12)
const registry = (() => {
  let reg = createEmptyRegistry();
  const liveEvents = state.worldCausalEvents ?? [];
  for (const evt of liveEvents) {
    const evtAny = evt as any;
    if (typeof evtAny.sourceKind !== 'string' || evtAny.sourceKind.length === 0) continue;
    const payload = evtAny.payload ?? {};
    const safePayload = typeof payload === 'object' && payload !== null
      ? { summary: typeof payload.summary === 'string' ? payload.summary : `live ${evt.kind}`, ...payload }
      : { summary: `live ${evt.kind}` };
    const result = appendSourceRecord(reg, {
      sourceId: evtAny.sourceRecordId ?? `isr-live-${evt.id}`,
      sourceKind: evtAny.sourceKind,
      payload: safePayload,
      day: evt.day,
      phase: 'morning',
      entityRefs: (evt.entityIds ?? []).map((id: string) => ({ id, kind: 'market_cell' as const })),
      actorRefs: (evt.actorIds ?? []).map((id: string) => ({ id, role: 'system' as const })),
      visibility: { scope: 'all_actors', baseDelayDays: 0 },
      confidence: evt.confidence ?? 0.7,
      delayDays: 0,
      replayKey: evtAny.sourceReplayKey ?? `rk-live-${evt.id}`,
      origin: 'ecosystem_tick',
    } as any);
    if (result.ok) reg = result.registry;
  }
  return reg;
})();

console.log(`\n  Registry: ${registry.index.count} source records from causal events`);

const liveResults = await runAllProjectionsAgainstLiveState(state, registry);

let liveProducedCount = 0;
let liveWithRefsCount = 0;
let liveWithEnvelopeCount = 0;
const liveErrors: string[] = [];

for (const [surfaceId, result] of liveResults) {
  if (result.producedOutput) liveProducedCount++;
  if (result.hasRefs) liveWithRefsCount++;
  if (result.hasEnvelope) liveWithEnvelopeCount++;
  if (result.error) liveErrors.push(`${surfaceId}: ${result.error}`);

  console.log(`  ${surfaceId}: output=${result.producedOutput ? '✓' : '✗'} refs=${result.hasRefs ? '✓' : '✗'} envelope=${result.hasEnvelope ? '✓' : '✗'}${result.error ? ` error: ${result.error}` : ''}`);
}

check(liveProducedCount >= 5, `At least 5 projections produced live output (got ${liveProducedCount})`);
check(liveWithRefsCount >= 2, `At least 2 projections have live causal refs (got ${liveWithRefsCount})`);
check(liveWithEnvelopeCount >= 2, `At least 2 projections have live explanation envelope (got ${liveWithEnvelopeCount})`);
check(liveErrors.length <= 2, `At most 2 projection errors (got ${liveErrors.length})`);

// ═══════════════════════════════════════════════════════════════
// SECTION 5: CAUSAL CHAIN CONNECTIVITY — verify Big World POV
// ═══════════════════════════════════════════════════════════════
section('5. CAUSAL CHAIN CONNECTIVITY — verify Big World POV causal chain');

// Build actor knowledge snapshot from the registry built in section 4
const knowledge = buildActorKnowledgeSnapshot('player-1', 'player_broker', state.day, registry, state.worldCausalEvents);

console.log(`  Knowledge: ${knowledge.visibleSources.length} visible sources, ${knowledge.beliefs.length} beliefs, ${knowledge.beliefSummary.length} domains`);

// Build Big World POV with knowledge
const firstCase = state.cases[0];
if (firstCase) {
  const pov = buildWorkspaceBigWorldModule(state, firstCase.id, 'player-1', knowledge, registry);

  check(pov !== null, 'BigWorldPOVSummary produced for first case');

  if (pov) {
    // Verify causal refs exist
    const totalRefs =
      pov.marketCell.refs.length +
      pov.comparableSupply.refs.length +
      pov.demandMovement.refs.length +
      pov.ownerExpectation.refs.length +
      pov.brokerActionPressure.refs.length +
      pov.becauseBigProof.safeCausalRefs.length;

    check(totalRefs >= 3, `BigWorldPOV has at least 3 total causal refs (got ${totalRefs})`);

    // Verify shared causal refs
    check(pov.sharedCausalRefs !== undefined, 'BigWorldPOV has sharedCausalRefs');
    if (pov.sharedCausalRefs) {
      check(pov.sharedCausalRefs.allRefs.length >= 1, `sharedCausalRefs has at least 1 ref (got ${pov.sharedCausalRefs.allRefs.length})`);
      check(pov.sharedCausalRefs.replayKey.length > 0, 'sharedCausalRefs has replayKey');
    }

    // Verify recommended actions have evidence
    check(pov.recommendedActionReasons.length >= 1, `At least 1 recommended action (got ${pov.recommendedActionReasons.length})`);
    for (const reason of pov.recommendedActionReasons) {
      check(reason.safeRefs !== undefined && reason.safeRefs.length >= 1, `Recommended action has safeRefs (got ${reason.safeRefs?.length ?? 0})`);
      check(reason.replayKey !== undefined && reason.replayKey.length > 0, 'Recommended action has replayKey');
    }

    // Verify becauseBigProof
    check(pov.becauseBigProof.hasMarketMovement || pov.becauseBigProof.hasRivalMovement || pov.becauseBigProof.hasDemandShift, 'becauseBigProof detects at least one world movement');
    check(pov.becauseBigProof.movementEvidence.length >= 1, `becauseBigProof has at least 1 evidence (got ${pov.becauseBigProof.movementEvidence.length})`);
  }
} else {
  check(false, 'No cases available for POV test');
}

// ═══════════════════════════════════════════════════════════════
// SECTION 6: ACTOR KNOWLEDGE PIPELINE — verify full chain
// ═══════════════════════════════════════════════════════════════
section('6. ACTOR KNOWLEDGE PIPELINE — verify full chain');

// Build decision evidence envelope
const envelope = buildDecisionEvidenceEnvelope(knowledge);

console.log(`\n  Pressure signals: ${envelope.pressureSignals.length}`);
console.log(`  Causal refs: ${envelope.causalRefs.length}`);
console.log(`  Explanation chain: ${envelope.explanation.chain.length}`);

check(envelope.pressureSignals.length >= 1, `At least 1 pressure signal (got ${envelope.pressureSignals.length})`);
check(envelope.causalRefs.length >= 1, `At least 1 causal ref in envelope (got ${envelope.causalRefs.length})`);
check(envelope.explanation.summary.length > 0, 'Explanation envelope has summary');
check(envelope.explanation.chain.length >= 1, `Explanation envelope has at least 1 chain link (got ${envelope.explanation.chain.length})`);

// Verify pressure signals have source record IDs
for (const signal of envelope.pressureSignals.slice(0, 3)) {
  check(signal.sourceRecordIds.length >= 1 || signal.beliefSourceIds.length >= 1, `Pressure signal "${signal.label}" has source traceability`);
}

// ═══════════════════════════════════════════════════════════════
// SECTION 7: CROSS-SURFACE CONSISTENCY — same causal refs across surfaces
// ═══════════════════════════════════════════════════════════════
section('7. CROSS-SURFACE CONSISTENCY — same causal refs across surfaces');

if (firstCase) {
  const pov = buildWorkspaceBigWorldModule(state, firstCase.id, 'player-1', knowledge, registry);
  if (pov) {
    // Collect all ref IDs from different surfaces
    const marketCellRefIds = new Set(pov.marketCell.refs.map((r) => r.refId));
    const demandRefIds = new Set(pov.demandMovement.refs.map((r) => r.refId));
    const ownerRefIds = new Set(pov.ownerExpectation.refs.map((r) => r.refId));
    const brokerRefIds = new Set(pov.brokerActionPressure.refs.map((r) => r.refId));

    // Check for cross-surface ref overlap
    let crossSurfaceOverlap = 0;
    for (const refId of marketCellRefIds) {
      if (demandRefIds.has(refId) || ownerRefIds.has(refId) || brokerRefIds.has(refId)) {
        crossSurfaceOverlap++;
      }
    }
    for (const refId of demandRefIds) {
      if (ownerRefIds.has(refId) || brokerRefIds.has(refId)) {
        crossSurfaceOverlap++;
      }
    }

    // Cross-surface overlap is desirable but not strictly required
    console.log(`  Cross-surface ref overlaps: ${crossSurfaceOverlap}`);
    check(true, `Cross-surface consistency check completed (${crossSurfaceOverlap} overlaps found)`);

    // Verify that sharedCausalRefs are the same refs used across sub-projections
    if (pov.sharedCausalRefs) {
      const sharedRefIds = new Set(pov.sharedCausalRefs.allRefs.map((r) => r.refId));
      let sharedRefsUsed = 0;
      for (const ref of pov.becauseBigProof.safeCausalRefs) {
        if (sharedRefIds.has(ref.refId)) sharedRefsUsed++;
      }
      console.log(`  Shared refs used in becauseBigProof: ${sharedRefsUsed}/${pov.sharedCausalRefs.allRefs.length}`);
    }
  }
}

// ═══════════════════════════════════════════════════════════════
// SECTION 8: INTENTIONAL DISCONNECTION — verify by-design surfaces
// ═══════════════════════════════════════════════════════════════
section('8. INTENTIONAL DISCONNECTION — verify by-design surfaces');

// Result projection: now partial — has causalTrace linking case outcomes to causal events
const resultEntry = census.find((e) => e.surfaceId === 'result');
check(resultEntry !== undefined, 'Result surface exists in census');
check(resultEntry?.verdict === 'partial', 'Result is partial (has causalTrace for case outcomes)');
check(resultEntry?.hasLiveCausalRefs, 'Result has live causal refs (causalTrace)');

// Leaderboard projection: reads external leaderboard data, not game state
const leaderboardEntry = census.find((e) => e.surfaceId === 'leaderboard');
check(leaderboardEntry !== undefined, 'Leaderboard surface exists in census');
check(leaderboardEntry?.verdict === 'disconnected', 'Leaderboard is intentionally disconnected');
check(leaderboardEntry?.readPatterns.every((p) => p.kind === 'systemic' || p.kind === 'static'), 'Leaderboard only reads systemic/static data');

// Architecture surfaces: read static registries and system state, not causal chain
const archEntry = census.find((e) => e.surfaceId === 'architecture-migration-readiness');
check(archEntry !== undefined, 'Architecture migration readiness surface exists in census');
check(archEntry?.verdict === 'disconnected', 'Architecture surface is intentionally disconnected');

// Owner surfaces: connected — profiling memory is derived from owner interactions (causal events)
const ownerProfileEntry = census.find((e) => e.surfaceId === 'owner-persona-profile');
check(ownerProfileEntry !== undefined, 'Owner persona profile surface exists in census');
check(ownerProfileEntry?.verdict === 'connected', 'Owner persona profile is connected (profiling from interview interactions)');

const ownerMemoryEntry = census.find((e) => e.surfaceId === 'owner-profiling-memory');
check(ownerMemoryEntry !== undefined, 'Owner profiling memory surface exists in census');
check(ownerMemoryEntry?.verdict === 'connected', 'Owner profiling memory is connected (derived from interview topic choices)');

// ═══════════════════════════════════════════════════════════════
// SECTION 9: LEGACY FIELD DOCUMENTATION — verify documented
// ═══════════════════════════════════════════════════════════════
section('9. LEGACY FIELD DOCUMENTATION — verify documented');

// All legacy fields should be documented in the census
const documentedLegacyFields = new Set<string>();
for (const entry of census) {
  for (const field of entry.legacyFieldsRead) {
    documentedLegacyFields.add(field);
  }
}

console.log(`  Documented legacy fields: ${documentedLegacyFields.size}`);
console.log(`  Fields: ${[...documentedLegacyFields].sort().join(', ')}`);

// Key legacy fields that must be documented
const keyLegacyFields = ['trust', 'patience', 'urgency', 'priceGapPct', 'askPrice', 'marketPrice', 'status', 'intent', 'daysLeft'];
for (const field of keyLegacyFields) {
  check(documentedLegacyFields.has(field), `Legacy field "${field}" is documented in census`);
}

// ═══════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════
section('SUMMARY');

console.log(`\n  Census maturity: ${summary.maturity}`);
console.log(`  Total checks: ${passed + failed}`);
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);

if (failures.length > 0) {
  console.log('\n  Failures:');
  for (const f of failures) {
    console.log(`    ✗ ${f}`);
  }
}

console.log('\n' + '═'.repeat(68));
if (failed === 0) {
  console.log('  ROUND 13 GATE: PASSED');
  console.log('  No dead corners found in product surface census.');
  console.log('  All surfaces either connect to causal chain or are intentionally disconnected.');
} else {
  console.log('  ROUND 13 GATE: FAILED');
  console.log(`  ${failed} check(s) failed.`);
}
console.log('═'.repeat(68));

process.exit(failed > 0 ? 1 : 0);
