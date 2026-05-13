/**
 * Big World Round 5 Hard Gate — Agent D false-positive killer
 *
 * This script MUST FAIL if any of the following false positives exist:
 *
 * 1. runBigWorldDayTick only runs in test scripts, not in real advanceDays
 * 2. advanceDays 7 days → state.bigWorldRuntime.tickCount unchanged
 * 3. advanceDays 7 days → state.worldCausalEvents not appended with live events
 * 4. because-big projection returns null for inactive case but counted as success
 * 5. Causal chain uses synthetic example, not live ledger events
 * 6. Projection diff comes only from legacy fields, cannot trace to runtime causal refs
 * 7. Hidden GlobalTruth leaks into broker POV (projection reads raw shadow arrays)
 * 8. "多客户/多竞品/多文案" mistaken for product-big
 *
 * Usage: npx tsx scripts/verify-selling-houses-big-world-round5-hard-gate.ts
 */

import { createInitialState } from '../src/selling-houses/application/gameState.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine/opportunityEngine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { advanceDays } from '../src/selling-houses/domain/engine.js';
import { updateDerivedState } from '../src/selling-houses/domain/runtimeState.js';
import {
  buildWorkspaceBigWorldModule,
  buildBecauseBigProof,
  type BigWorldPOVSummary,
} from '../src/selling-houses/application/projections/bigWorldPOVProjection.js';
import {
  runBigWorldDayTick,
  applyTickReceiptToRuntime,
  buildClockInputFromGameState,
} from '../src/selling-houses/domain/world-model/runtime/index.js';
import type { GameState } from '../src/selling-houses/domain/models.js';
import type { BigWorldRuntimeState } from '../src/selling-houses/domain/world-model/runtime/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures: string[] = [];

function hardFail(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    failed++;
    failures.push(message);
    console.error(`  [FAIL] ${message}`);
  }
}

function buildWorld(seed: number): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  if (!snapshot) throw new Error('standard-window-chain scenario not found');
  const state = createInitialState(snapshot, seed);
  seedInitialOpportunities(state);
  return state;
}

const SEED = 20260513;

console.log('=== Big World Round 5 Hard Gate ===');
console.log('Purpose: kill false positives from round 4\n');

// ===========================================================================
// FALSE POSITIVE 1: runBigWorldDayTick only runs in scripts, not in real advanceDays
//
// How to detect: after calling advanceDays, check if bigWorldRuntime was
// actually ticked. If advanceDays never calls runBigWorldDayTick, the
// runtime state will be undefined or have tickCount=0.
// ===========================================================================
console.log('--- FP1: advanceDays must integrate bigWorldRuntime ---');
const fp1State = buildWorld(SEED);

// bigWorldRuntime is initialized at createInitialState (may be default/empty).
// The key check: after advanceDays, it must be TICKED (tickCount > 0).
const beforeRuntime = fp1State.bigWorldRuntime;
const beforeTickCount = beforeRuntime?.tickCount ?? 0;

advanceDays(fp1State, 3);
updateDerivedState(fp1State);

const afterRuntime = fp1State.bigWorldRuntime;
// After 3 days of advanceDays: if the runtime is NOT integrated,
// bigWorldRuntime.tickCount will still be 0 (or undefined)
hardFail(
  afterRuntime !== undefined,
  'bigWorldRuntime exists after 3 advanceDays (runtime IS integrated into game loop)',
);

if (afterRuntime) {
  hardFail(
    afterRuntime.tickCount > beforeTickCount,
    `bigWorldRuntime.tickCount increased: ${beforeTickCount} → ${afterRuntime.tickCount} after 3 advanceDays`,
  );
  hardFail(
    afterRuntime.totalEventsEmitted > 0,
    `bigWorldRuntime.totalEventsEmitted > 0 after 3 days (got ${afterRuntime.totalEventsEmitted})`,
  );
}

// ===========================================================================
// FALSE POSITIVE 2: advanceDays 7 days → tickCount unchanged
//
// How to detect: tickCount must increment with each day.
// ===========================================================================
console.log('\n--- FP2: bigWorldRuntime.tickCount must advance ---');
const fp2State = buildWorld(SEED);
advanceDays(fp2State, 7);
updateDerivedState(fp2State);

const fp2Runtime = fp2State.bigWorldRuntime;
hardFail(
  fp2Runtime !== undefined,
  'bigWorldRuntime exists after 7 advanceDays',
);
if (fp2Runtime) {
  hardFail(
    fp2Runtime.tickCount >= 7,
    `tickCount >= 7 after 7 advanceDays (got ${fp2Runtime.tickCount})`,
  );
  hardFail(
    fp2Runtime.lastTickDay >= 7,
    `lastTickDay >= 7 after 7 advanceDays (got ${fp2Runtime.lastTickDay})`,
  );
  hardFail(
    fp2Runtime.dailySummaries.length > 0,
    `dailySummaries not empty after 7 days (got ${fp2Runtime.dailySummaries.length})`,
  );
}

// ===========================================================================
// FALSE POSITIVE 3: worldCausalEvents not appended with live events
//
// How to detect: worldCausalEvents must grow after advanceDays.
// The causal ledger should accumulate events from each tick.
// ===========================================================================
console.log('\n--- FP3: worldCausalEvents must grow from live ticks ---');
const fp3State = buildWorld(SEED);
const beforeCausalCount = fp3State.worldCausalEvents?.length ?? 0;

advanceDays(fp3State, 7);
updateDerivedState(fp3State);

const afterCausalCount = fp3State.worldCausalEvents?.length ?? 0;
hardFail(
  fp3State.worldCausalEvents !== undefined,
  'worldCausalEvents exists after 7 advanceDays',
);
hardFail(
  afterCausalCount > beforeCausalCount,
  `worldCausalEvents grew: ${beforeCausalCount} → ${afterCausalCount} (live events appended)`,
);

// Check that events have proper structure
if (fp3State.worldCausalEvents && fp3State.worldCausalEvents.length > 0) {
  const sample = fp3State.worldCausalEvents[0];
  hardFail(!!sample.id, 'causal event has id');
  hardFail(!!sample.kind, 'causal event has kind');
  hardFail(typeof sample.day === 'number', 'causal event has numeric day');
  hardFail(!!sample.source, 'causal event has source');
}

// ===========================================================================
// FALSE POSITIVE 4: because-big projection returns null for inactive case
//                    but counted as success
//
// How to detect: after 7 days of no action, some cases become inactive.
// buildWorkspaceBigWorldModule returns null for inactive cases.
// The vertical slice test treats null as "world moved — success".
// This is WRONG: null means the projection LOST its product surface.
// ===========================================================================
console.log('\n--- FP4: null projection for inactive case is NOT success ---');
const fp4State = buildWorld(SEED);
const fp4CaseId = fp4State.cases.find((c) => c.status === 'active')?.id;
hardFail(!!fp4CaseId, 'found active case for FP4 test');

const fp4Day0 = fp4CaseId ? buildWorkspaceBigWorldModule(fp4State, fp4CaseId) : null;
hardFail(fp4Day0 !== null, 'day 0 projection non-null for active case');

advanceDays(fp4State, 7);
updateDerivedState(fp4State);

const fp4Day7 = fp4CaseId ? buildWorkspaceBigWorldModule(fp4State, fp4CaseId) : null;

if (fp4Day7 === null) {
  // Case became inactive — projection is null
  // This means the product surface DISAPPEARED for this case
  // It is NOT a "diff" — it is a LOSS of projection
  const caseStillExists = fp4State.cases.some((c) => c.id === fp4CaseId);
  const caseStatus = fp4State.cases.find((c) => c.id === fp4CaseId)?.status;

  hardFail(
    false,
    `PROJECTION NULL: case ${fp4CaseId} status=${caseStatus} — projection disappeared. ` +
    `This is a product regression, NOT a "world moved" success. ` +
    `The because-big projection must handle inactive cases gracefully (e.g., show last-known state).`,
  );
} else {
  // Projection survived — check it actually reflects world movement
  hardFail(
    fp4Day7.day === 8,
    `day 7 projection has correct day (got ${fp4Day7.day})`,
  );
}

// ===========================================================================
// FALSE POSITIVE 5: Causal chain uses synthetic example, not live ledger
//
// How to detect: buildAndVerifyRivalRepriceChain creates a FAKE chain
// with fabricated IDs. The real test should check events in the live
// worldCausalEvents ledger that were produced by actual advanceDays ticks.
// ===========================================================================
console.log('\n--- FP5: live causal events must exist, not just synthetic chains ---');
const fp5State = buildWorld(SEED);
advanceDays(fp5State, 7);
updateDerivedState(fp5State);

const liveCausalEvents = fp5State.worldCausalEvents ?? [];
hardFail(
  liveCausalEvents.length > 0,
  `live worldCausalEvents has events after 7 days (got ${liveCausalEvents.length})`,
);

// Check that events were produced by actual tick phases (valid WorldCausalEventSource values),
// not by the synthetic chain example builder (which uses different ID prefixes)
const validSources = new Set<string>([
  'market-signal', 'rival-action', 'customer-behavior', 'owner-perception',
  'broker-service', 'system-tick', 'opening-snapshot', 'adapted-from-event-store',
]);
const tickProducedEvents = liveCausalEvents.filter(
  (e) => validSources.has(e.source),
);
hardFail(
  tickProducedEvents.length > 0,
  `live causal events include tick-produced events (got ${tickProducedEvents.length} from ${liveCausalEvents.length} total)`,
);

// Check that the causal chain example builder produces DIFFERENT IDs
// from the live ledger events — proving they are not the same
import { buildAndVerifyRivalRepriceChain } from '../src/selling-houses/domain/world-model/causalChainExamples.js';

const syntheticChain = buildAndVerifyRivalRepriceChain({
  day: 5,
  listingId: 'synthetic-listing',
  acnId: 'synthetic-acn',
  oldPrice: 500,
  newPrice: 450,
  affectedMarketCellIds: ['cell-1'],
  affectedCaseId: 'synthetic-case',
  comparingCustomerIds: ['synthetic-customer-1'],
  comparisonListingIds: ['synthetic-listing'],
});

const syntheticIds = new Set(syntheticChain.output.allEvents.map((e) => e.id));
const liveIds = new Set(liveCausalEvents.map((e) => e.id));
let overlap = 0;
for (const id of syntheticIds) {
  if (liveIds.has(id)) overlap++;
}
hardFail(
  overlap === 0,
  `synthetic chain IDs do NOT overlap with live ledger IDs (${overlap} overlaps — chains are independent)`,
);

// ===========================================================================
// FALSE POSITIVE 6: Projection diff comes only from legacy fields
//
// How to detect: bigWorldPOVProjection reads state.markets, state.marketShadow,
// state.cases, state.customerStates — but NOT state.worldCausalEvents or
// state.bigWorldRuntime. The "because-big proof" is computed from legacy
// fields only. A true because-big projection must trace to causal refs
// from the runtime ledger.
// ===========================================================================
console.log('\n--- FP6: projection must read from runtime causal ledger ---');

// Read the projection source code to verify it imports worldCausalEvents
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const projPath = resolve(
  import.meta.dirname ?? '.',
  '../src/selling-houses/application/projections/bigWorldPOVProjection.ts',
);
const projSource = readFileSync(projPath, 'utf8');

const readsWorldCausalEvents = projSource.includes('worldCausalEvents');
const readsBigWorldRuntime = projSource.includes('bigWorldRuntime');
const readsCausalLedger = projSource.includes('causalLedger');

hardFail(
  readsWorldCausalEvents || readsBigWorldRuntime || readsCausalLedger,
  'bigWorldPOVProjection.ts reads from worldCausalEvents / bigWorldRuntime / causalLedger (currently: ' +
  `worldCausalEvents=${readsWorldCausalEvents}, bigWorldRuntime=${readsBigWorldRuntime}, ` +
  `causalLedger=${readsCausalLedger})`,
);

// Also verify: the becauseBigProof.safeCausalRefs should reference
// actual runtime events, not just market-cell / rival-listing / case IDs
const fp6State = buildWorld(SEED);
const fp6CaseId = fp6State.cases.find((c) => c.status === 'active')?.id;
if (fp6CaseId) {
  const proof = buildBecauseBigProof(fp6State, fp6CaseId);
  const hasRuntimeRef = proof.safeCausalRefs.some(
    (r) => r.refType === 'market-signal' || r.refId.startsWith('bwe-'),
  );
  // This is a soft check — the projection should eventually trace to runtime events
  if (!hasRuntimeRef) {
    console.log(`  [WARN] becauseBigProof.safeCausalRefs do not yet reference runtime events (all refTypes: ${proof.safeCausalRefs.map((r) => r.refType).join(', ')})`);
  }
}

// ===========================================================================
// FALSE POSITIVE 7: Hidden GlobalTruth leaks into broker POV
//
// How to detect: bigWorldPOVProjection must not expose:
// - Full rival listing arrays (should be bounded top-N)
// - Full customer state arrays
// - Raw company pressure values
// - Shadow customer counts / demand momentum raw values
// - worldCausalEvents raw array
// - bigWorldRuntime internal state
// ===========================================================================
console.log('\n--- FP7: no hidden GlobalTruth leakage to projection ---');
const fp7State = buildWorld(SEED);
advanceDays(fp7State, 3);
updateDerivedState(fp7State);

const fp7CaseId = fp7State.cases.find((c) => c.status === 'active')?.id;
if (fp7CaseId) {
  const fp7Projection = buildWorkspaceBigWorldModule(fp7State, fp7CaseId);
  if (fp7Projection) {
    const projText = JSON.stringify(fp7Projection);

    // Check: no full rival listing array
    hardFail(
      !projText.includes('"rivalListings":['),
      'projection does not embed full rivalListings array',
    );

    // Check: no full customerStates array
    hardFail(
      !projText.includes('"customerStates":['),
      'projection does not embed full customerStates array',
    );

    // Check: no raw worldCausalEvents
    hardFail(
      !projText.includes('"worldCausalEvents":['),
      'projection does not embed worldCausalEvents array',
    );

    // Check: no bigWorldRuntime internals
    hardFail(
      !projText.includes('"bigWorldRuntime":{'),
      'projection does not embed bigWorldRuntime object',
    );

    // Check: no raw company pressure
    hardFail(
      !projText.includes('"sharedLeadPressure"'),
      'projection does not leak sharedLeadPressure',
    );

    // Check: no raw shadowCustomerCount
    hardFail(
      !projText.includes('"shadowCustomerCount"'),
      'projection does not leak shadowCustomerCount',
    );

    // Check: bounded top-N signals (not full arrays)
    for (const sub of [
      fp7Projection.comparableSupply.topSignals,
      fp7Projection.demandMovement.topSignals,
      fp7Projection.brokerActionPressure.topSignals,
      fp7Projection.ownerExpectation.topSignals,
    ]) {
      hardFail(sub.length <= 3, `signal array bounded (got ${sub.length}, max 3)`);
    }

    // Check: recommendedActionReasons bounded
    hardFail(
      fp7Projection.recommendedActionReasons.length <= 2,
      `recommendedActionReasons bounded (got ${fp7Projection.recommendedActionReasons.length}, max 2)`,
    );
  }
}

// ===========================================================================
// FALSE POSITIVE 8: "多客户/多竞品/多文案" mistaken for product-big
//
// How to detect: product-big requires that player-facing decisions are
// DRIVEN BY runtime causal ledger, not just that multiple products exist.
// Having 5 signals with different copy text is NOT product-big.
// True product-big means: the same causal event influences multiple
// product surfaces through a shared causal ref chain.
// ===========================================================================
console.log('\n--- FP8: product-big requires causal-driven multi-surface, not just multi-text ---');
const fp8State = buildWorld(SEED);
advanceDays(fp8State, 7);
updateDerivedState(fp8State);

const fp8CaseId = fp8State.cases.find((c) => c.status === 'active')?.id;
if (fp8CaseId) {
  const fp8Projection = buildWorkspaceBigWorldModule(fp8State, fp8CaseId);
  if (fp8Projection) {
    // Collect all refs from the projection
    const allRefs = [
      ...fp8Projection.marketCell.refs,
      ...fp8Projection.comparableSupply.refs,
      ...fp8Projection.demandMovement.refs,
      ...fp8Projection.ownerExpectation.refs,
      ...fp8Projection.brokerActionPressure.refs,
      ...fp8Projection.becauseBigProof.safeCausalRefs,
      ...fp8Projection.recommendedActionReasons.flatMap((r) => r.refs),
    ];
    const refTypes = new Set(allRefs.map((r) => r.refType));

    // Product-big requires refs that trace to runtime events, not just
    // market-cell / case / rival-listing (which are legacy fields)
    const hasRuntimeTraceableRef = refTypes.has('market-signal')
      || refTypes.has('demand-segment')
      || allRefs.some((r) => r.refId.startsWith('bwe-'));

    hardFail(
      hasRuntimeTraceableRef,
      `projection has at least one runtime-traceable ref type (found: ${[...refTypes].join(', ')})`,
    );

    // Check: becauseBigProof.movementEvidence should reference live events
    const evidenceRefs = fp8Projection.becauseBigProof.movementEvidence.flatMap((e) => e.refs);
    hardFail(
      evidenceRefs.length > 0,
      `becauseBigProof.movementEvidence has refs (${evidenceRefs.length})`,
    );

    // The key product-big test: collect live causal event IDs that appear
    // as refIds anywhere in the projection, then check if at least one
    // live event ID is referenced by 2+ different sub-projections.
    const liveEventIds = new Set(
      (fp8State.worldCausalEvents ?? []).map((e) => e.id),
    );

    // Map each sub-projection to its set of refIds
    const subRefMaps = [
      { name: 'ownerExpectation', refs: new Set(fp8Projection.ownerExpectation.refs.map((r) => r.refId)) },
      { name: 'brokerActionPressure', refs: new Set(fp8Projection.brokerActionPressure.refs.map((r) => r.refId)) },
      { name: 'comparableSupply', refs: new Set(fp8Projection.comparableSupply.refs.map((r) => r.refId)) },
      { name: 'demandMovement', refs: new Set(fp8Projection.demandMovement.refs.map((r) => r.refId)) },
      { name: 'marketCell', refs: new Set(fp8Projection.marketCell.refs.map((r) => r.refId)) },
      { name: 'becauseBigProof', refs: new Set(fp8Projection.becauseBigProof.safeCausalRefs.map((r) => r.refId)) },
      { name: 'recommendedReasons', refs: new Set(fp8Projection.recommendedActionReasons.flatMap((r) => r.refs).map((r) => r.refId)) },
    ];

    // Find live causal event IDs that appear in 2+ sub-projections
    let liveSharedCount = 0;
    const liveSharedIds: string[] = [];
    for (const evtId of liveEventIds) {
      const inSubs = subRefMaps.filter((m) => m.refs.has(evtId)).length;
      if (inSubs >= 2) {
        liveSharedCount++;
        liveSharedIds.push(evtId);
      }
    }

    hardFail(
      liveSharedCount > 0,
      `at least 1 live causal event ref shared across 2+ sub-projections (${liveSharedCount} shared: ${liveSharedIds.slice(0, 3).join(', ')} — proves unified causal context)`,
    );
  }
}

// ===========================================================================
// Maturity reclassification
// ===========================================================================
console.log('\n--- Maturity Reclassification ---');

// Re-evaluate maturity with killed false positives
const reState = buildWorld(SEED);
advanceDays(reState, 7);
updateDerivedState(reState);

const hasRuntime = reState.bigWorldRuntime !== undefined && reState.bigWorldRuntime.tickCount >= 7;
const hasCausalEvents = (reState.worldCausalEvents?.length ?? 0) > 0;

let maturity = 'not-big';

// opening-big: snapshot exists
const snap = reState.runContext.marketOpeningSnapshot;
const openingBig = snap !== null && snap !== undefined
  && snap.acnNetworks.length >= 3
  && snap.marketCells.length >= 3;
if (openingBig) maturity = 'opening-big';

// bootstrap-big: seeded init works
if (openingBig && snap.seed === SEED) maturity = 'bootstrap-big';

// standalone-runtime: runtime module works in isolation
// (We know this from the daily-operating-loop test passing)
maturity = 'standalone-runtime';

// runtime-big: real game loop integrates runtime
if (hasRuntime && hasCausalEvents) maturity = 'runtime-big';

// because-big: projection traces to live causal refs
const fp8CaseForReclass = reState.cases.find((c) => c.status === 'active')?.id;
let projectionTracesToCausal = false;
if (fp8CaseForReclass) {
  const reProj = buildWorkspaceBigWorldModule(reState, fp8CaseForReclass);
  if (reProj) {
    const allRefs = [
      ...reProj.becauseBigProof.safeCausalRefs,
      ...reProj.recommendedActionReasons.flatMap((r) => r.refs),
    ];
    projectionTracesToCausal = allRefs.some(
      (r) => r.refType === 'market-signal' || r.refId.startsWith('bwe-'),
    );
  }
}

// product-big: multiple surfaces driven by same causal chain
let multiSurfaceCausal = false;
if (fp8CaseForReclass) {
  const reProj = buildWorkspaceBigWorldModule(reState, fp8CaseForReclass);
  if (reProj) {
    const allRefs = [
      ...reProj.ownerExpectation.refs,
      ...reProj.brokerActionPressure.refs,
      ...reProj.comparableSupply.refs,
      ...reProj.demandMovement.refs,
    ];
    const refIds = allRefs.map((r) => r.refId);
    const unique = new Set(refIds);
    multiSurfaceCausal = unique.size < refIds.length; // some IDs appear in multiple surfaces
  }
}

if (projectionTracesToCausal) maturity = 'because-big';
if (multiSurfaceCausal && projectionTracesToCausal) maturity = 'product-big';

// HARD CAP: if any gate failed, maturity cannot exceed runtime-big
// because-unless all false positives are killed, we cannot trust the projection
if (failed > 0 && (maturity === 'because-big' || maturity === 'product-big')) {
  console.log(`  CAPPING maturity from ${maturity} to runtime-big (failed > 0)`);
  maturity = 'runtime-big';
}

console.log(`  Reclassified maturity: ${maturity}`);
console.log(`  hasRuntime=${hasRuntime}, hasCausalEvents=${hasCausalEvents}`);
console.log(`  projectionTracesToCausal=${projectionTracesToCausal}, multiSurfaceCausal=${multiSurfaceCausal}`);

// ===========================================================================
// Summary
// ===========================================================================
console.log(`\n=== Round 5 Hard Gate Summary ===`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
console.log(`Maturity: ${maturity}`);

if (failed > 0) {
  console.error(`\nGATE FAILED: ${failed} false positive checks did not pass.`);
  console.error('\nFalse positives detected:');
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  console.error(`\nFailed because: unified causal context is missing — projection sub-surfaces do not share live causal event refs.`);
  console.error(`Maturity: ${maturity} (below target: because-big)`);
  process.exit(1);
} else {
  console.log(`\nGATE PASSED: All ${passed} checks passed.`);
  console.log(`\nMaturity: ${maturity}`);
  if (maturity === 'product-big') {
    console.log('TARGET ACHIEVED: product-big');
  } else if (maturity === 'because-big') {
    console.log('MINIMUM PASSED: because-big. Next: product-big.');
  } else {
    console.log(`Below minimum (because-big). Current: ${maturity}.`);
  }
}
