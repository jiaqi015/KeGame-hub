/**
 * ProcessRun Replay Contract Verification
 *
 * Validates:
 * 1. Same seed + same actions → byte-identical processRunHistory
 * 2. Same seed + same actions → byte-identical ownerDecisionMomentHistory
 * 3. ProcessRun has no raw GameState/Case/Opportunity
 * 4. ProcessRun links to action receipts via evidenceRefs
 * 5. Same seed + same actions → byte-identical aggregated summary
 * 6. Old saves without processRunHistory work (empty array fallback)
 */

import assert from 'node:assert/strict';
import { createInitialState } from '../src/selling-houses/application/gameState.js';
import { advanceDays, executeAction } from '../src/selling-houses/domain/engine.js';
import { popPendingActionReceiptSnapshots } from '../src/selling-houses/domain/engine/actionResolvers.js';
import { buildActionReceiptFromSnapshot, appendActionReceiptFromSnapshot } from '../src/selling-houses/runtime/simulation/actionReceiptFromSnapshotAdapter.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine/opportunityEngine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import {
  buildProcessRunsFromState,
  enrichStateWithProcessRuns,
  buildProcessRunAggregatedSummary,
} from '../src/selling-houses/runtime/simulation/processRunAdapter.js';
import {
  buildOwnerDecisionMomentsFromState,
  enrichStateWithOwnerDecisionMoments,
} from '../src/selling-houses/runtime/simulation/ownerDecisionMomentAdapter.js';
import type { GameState } from '../src/selling-houses/domain/models.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const errors: string[] = [];

function check(condition: boolean, message: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    errors.push(message);
    console.error(`  [FAIL] ${message}`);
  }
}

function buildWorld(seed: number): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain')!;
  const world = createInitialState(snapshot, seed);
  seedInitialOpportunities(world);
  return world;
}

/**
 * Builds a world with real action receipts by executing real actions.
 * Uses the proper snapshot→receipt flow to populate actionReceiptHistory.
 */
function buildWorldWithRealReceipts(seed: number, days: number = 5): GameState {
  const world = buildWorld(seed);
  advanceDays(world, days);

  // Execute real actions and process pending receipt snapshots
  const activeCases = world.cases.filter(c => c.status === 'active');
  if (activeCases.length > 0) {
    const targetCase = activeCases[0];
    for (const actionId of ['weekly-feedback', 'first-visit', 'pricing-advice']) {
      executeAction(world, actionId, targetCase);
      // Process pending receipt snapshots into actionReceiptHistory
      for (const snap of popPendingActionReceiptSnapshots()) {
        const receipt = buildActionReceiptFromSnapshot(snap, world);
        appendActionReceiptFromSnapshot(world, receipt);
      }
    }
  }

  return world;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log('=== Check 1: Same seed → byte-identical processRunHistory ===');
{
  const world1 = buildWorldWithRealReceipts(42, 5);
  const world2 = buildWorldWithRealReceipts(42, 5);

  const runs1 = buildProcessRunsFromState(world1);
  const runs2 = buildProcessRunsFromState(world2);

  check(runs1.length > 0, `runs has ${runs1.length} entries (expected > 0)`);
  check(JSON.stringify(runs1) === JSON.stringify(runs2), 'same seed → same runs');
}

console.log('=== Check 2: Same seed → byte-identical ownerDecisionMomentHistory ===');
{
  const world1 = buildWorldWithRealReceipts(42, 5);
  const world2 = buildWorldWithRealReceipts(42, 5);

  const moments1 = buildOwnerDecisionMomentsFromState(world1);
  const moments2 = buildOwnerDecisionMomentsFromState(world2);

  check(JSON.stringify(moments1) === JSON.stringify(moments2), 'same seed → same moments');
}

console.log('=== Check 3: ProcessRun has no raw GameState ===');
{
  const world = buildWorldWithRealReceipts(42, 5);

  const runs = buildProcessRunsFromState(world);
  check(runs.length > 0, `runs has ${runs.length} entries (expected > 0)`);
  for (const run of runs) {
    const json = JSON.stringify(run);
    check(!json.includes('rngState'), `run ${run.runId} has no rngState`);
    check(!json.includes('rngCalls'), `run ${run.runId} has no rngCalls`);
    check(!json.includes('budgetLedger'), `run ${run.runId} has no budgetLedger`);
    check(!json.includes('customerStates'), `run ${run.runId} has no customerStates`);
    check(!json.includes('eventLog'), `run ${run.runId} has no eventLog`);
  }
}

console.log('=== Check 3b: Enrichment pipeline populates processRunHistory ===');
{
  const world = buildWorldWithRealReceipts(42, 3);
  const runs = buildProcessRunsFromState(world);
  check(runs.length > 0, `buildProcessRunsFromState produced ${runs.length} runs`);
  enrichStateWithProcessRuns(world, runs);
  check(
    world.processRunHistory!.length > 0,
    `processRunHistory populated: ${world.processRunHistory!.length} entries`,
  );
}

console.log('=== Check 4: ProcessRun links to action receipts ===');
{
  const world = buildWorldWithRealReceipts(42, 5);

  const runs = buildProcessRunsFromState(world);
  check(runs.length > 0, `runs has ${runs.length} entries (expected > 0)`);
  for (const run of runs) {
    check(run.evidenceRefs.length > 0, `run ${run.runId} has ${run.evidenceRefs.length} evidence refs`);
    for (const ref of run.evidenceRefs) {
      check(typeof ref.refId === 'string' && ref.refId.length > 0, `evidence ref has refId`);
      check(typeof ref.summary === 'string' && ref.summary.length > 0, `evidence ref has summary`);
      check(typeof ref.relevance === 'number', `evidence ref has relevance`);
    }
  }
}

console.log('=== Check 5: Same seed → byte-identical aggregated summary ===');
{
  const world1 = buildWorldWithRealReceipts(42, 5);
  const world2 = buildWorldWithRealReceipts(42, 5);

  enrichStateWithProcessRuns(world1, buildProcessRunsFromState(world1));
  enrichStateWithProcessRuns(world2, buildProcessRunsFromState(world2));

  const summary1 = buildProcessRunAggregatedSummary(world1, world1.day);
  const summary2 = buildProcessRunAggregatedSummary(world2, world2.day);

  check(summary1.totalRuns > 0, `summary has ${summary1.totalRuns} runs (expected > 0)`);
  check(JSON.stringify(summary1) === JSON.stringify(summary2), 'same seed → same summary');
}

console.log('=== Check 6: Old saves without processRunHistory work ===');
{
  const world = buildWorld(42);
  advanceDays(world, 3);

  // Simulate old save without processRunHistory
  delete (world as any).processRunHistory;
  delete (world as any).ownerDecisionMomentHistory;

  const runs = buildProcessRunsFromState(world);
  check(Array.isArray(runs), 'buildProcessRunsFromState handles missing history');

  const moments = buildOwnerDecisionMomentsFromState(world);
  check(Array.isArray(moments), 'buildOwnerDecisionMomentsFromState handles missing history');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Summary ===`);
console.log(`Total: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);

if (failed > 0) {
  console.log('\nFailures:');
  for (const e of errors) {
    console.log(`  - ${e}`);
  }
  process.exit(1);
} else {
  console.log('\nselling-houses-process-run-replay-contract: PASS');
  process.exit(0);
}
