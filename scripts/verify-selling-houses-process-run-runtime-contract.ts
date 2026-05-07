/**
 * ProcessRun Runtime Contract Verification
 *
 * Validates:
 * 1. buildProcessRunsFromState produces frozen ProcessRun[]
 * 2. ProcessRun has correct templateKind from 6 business flow types
 * 3. ProcessRun has evidence refs from action receipts
 * 4. enrichStateWithProcessRuns upserts by runId
 * 5. normalizeProcessRunHistory handles old saves
 * 6. buildProcessRunAggregatedSummary is deterministic
 * 7. No Date.now / Math.random in adapter
 * 8. ProcessRun does not alter gameplay (same seed → same rngCalls)
 * 9. nextStepDrafts are draft-only (no executeAction)
 * 10. Frozen output
 */

import assert from 'node:assert/strict';
import { createInitialState } from '../src/selling-houses/application/gameState.js';
import { advanceDays, executeAction } from '../src/selling-houses/domain/engine.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine/opportunityEngine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import {
  buildProcessRunsFromState,
  enrichStateWithProcessRuns,
  buildProcessRunAggregatedSummary,
  normalizeProcessRunHistory,
} from '../src/selling-houses/runtime/simulation/processRunAdapter.js';
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

console.log('=== Check 1: buildProcessRunsFromState produces frozen output ===');
{
  const snapshot = getScenarioSnapshotById('standard-window-chain')!;
  const world = createInitialState(snapshot, 42);
  seedInitialOpportunities(world);
  advanceDays(world, 3);

  const runs = buildProcessRunsFromState(world);
  check(Object.isFrozen(runs), 'runs array is frozen');
  for (const run of runs) {
    check(Object.isFrozen(run), `run ${run.runId} is frozen`);
    check(Object.isFrozen(run.evidenceRefs), `run ${run.runId} evidenceRefs is frozen`);
    check(Object.isFrozen(run.phaseSnapshots), `run ${run.runId} phaseSnapshots is frozen`);
  }
}

console.log('=== Check 2: ProcessRun has correct templateKind ===');
{
  const snapshot = getScenarioSnapshotById('standard-window-chain')!;
  const world = createInitialState(snapshot, 42);
  seedInitialOpportunities(world);
  advanceDays(world, 5);

  const runs = buildProcessRunsFromState(world);
  const validKinds = new Set([
    'price_adjustment_communication',
    'showing_to_offer_conversion',
    'open_day_campaign',
    'sincerity_sale_push',
    'owner_waiting_to_commitment',
    'consensus_to_contract',
  ]);
  for (const run of runs) {
    check(validKinds.has(run.templateKind), `run ${run.runId} has valid templateKind: ${run.templateKind}`);
  }
}

console.log('=== Check 3: enrichStateWithProcessRuns upserts ===');
{
  const snapshot = getScenarioSnapshotById('standard-window-chain')!;
  const world = createInitialState(snapshot, 42);
  seedInitialOpportunities(world);
  advanceDays(world, 3);

  const runs = buildProcessRunsFromState(world);
  enrichStateWithProcessRuns(world, runs);
  check(world.processRunHistory!.length === runs.length, `processRunHistory length: ${world.processRunHistory!.length}`);

  // Upsert same runs — should not duplicate
  enrichStateWithProcessRuns(world, runs);
  check(world.processRunHistory!.length === runs.length, `after upsert, still ${runs.length} runs`);
}

console.log('=== Check 4: normalizeProcessRunHistory handles old saves ===');
{
  check(normalizeProcessRunHistory(undefined).length === 0, 'undefined → empty');
  check(normalizeProcessRunHistory(null).length === 0, 'null → empty');
  check(normalizeProcessRunHistory('string').length === 0, 'string → empty');
  check(normalizeProcessRunHistory([1, 2]).length === 0, 'number array → empty');
  check(normalizeProcessRunHistory([{ runId: 'x', caseId: 'y', startedDay: 1 }]).length === 1, 'valid → kept');
  check(normalizeProcessRunHistory([{ runId: 'x', caseId: 'y', startedDay: -1 }]).length === 0, 'negative day → filtered');
}

console.log('=== Check 5: buildProcessRunAggregatedSummary is deterministic ===');
{
  const snapshot = getScenarioSnapshotById('standard-window-chain')!;
  const world1 = createInitialState(snapshot, 42);
  seedInitialOpportunities(world1);
  advanceDays(world1, 5);

  const summary1 = buildProcessRunAggregatedSummary(world1, world1.day);
  const summary2 = buildProcessRunAggregatedSummary(world1, world1.day);
  check(JSON.stringify(summary1) === JSON.stringify(summary2), 'same input → same summary');
}

console.log('=== Check 6: No Date.now / Math.random ===');
{
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(
    '/Users/jiaqi/Documents/开放日测算/src/selling-houses/runtime/simulation/processRunAdapter.ts',
    'utf-8',
  );
  const srcNoComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  check(!srcNoComments.includes('Date.now'), 'no Date.now');
  check(!srcNoComments.includes('Math.random'), 'no Math.random');
  check(!srcNoComments.includes('fetch('), 'no fetch');
  check(!srcNoComments.includes('openai'), 'no openai');
}

console.log('=== Check 7: Gameplay invariance ===');
{
  const snapshot = getScenarioSnapshotById('standard-window-chain')!;
  const worldA = createInitialState(snapshot, 42);
  seedInitialOpportunities(worldA);
  const worldB = createInitialState(snapshot, 42);
  seedInitialOpportunities(worldB);

  advanceDays(worldA, 3);
  advanceDays(worldB, 3);

  // Now enrich worldA with process runs
  const runs = buildProcessRunsFromState(worldA);
  enrichStateWithProcessRuns(worldA, runs);

  check(worldA.rngCalls === worldB.rngCalls, 'rngCalls unchanged');
  check(worldA.closedDeals.length === worldB.closedDeals.length, 'closedDeals unchanged');
  check(worldA.rngState === worldB.rngState, 'rngState unchanged');
}

console.log('=== Check 8: nextStepDrafts are draft-only ===');
{
  const snapshot = getScenarioSnapshotById('standard-window-chain')!;
  const world = createInitialState(snapshot, 42);
  seedInitialOpportunities(world);
  advanceDays(world, 5);

  const runs = buildProcessRunsFromState(world);
  for (const run of runs) {
    for (const draft of run.nextStepDrafts) {
      check(typeof draft.draftId === 'string', `draft has draftId: ${draft.draftId}`);
      check(typeof draft.description === 'string', `draft has description`);
      // nextStepDrafts should never have an executeAction call
      check(!draft.description.includes('executeAction'), 'draft does not call executeAction');
    }
  }
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
  console.log('\nselling-houses-process-run-runtime-contract: PASS');
  process.exit(0);
}
