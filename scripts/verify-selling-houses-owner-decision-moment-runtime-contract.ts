/**
 * OwnerDecisionMoment Runtime Contract Verification
 *
 * Validates:
 * 1. buildOwnerDecisionMomentsFromState produces frozen OwnerDecisionMoment[]
 * 2. Moments have correct kind from 10 types
 * 3. Moments have factors with threshold comparisons
 * 4. enrichStateWithOwnerDecisionMoments upserts by momentId
 * 5. normalizeOwnerDecisionMomentHistory handles old saves
 * 6. buildOwnerDecisionMomentSummary is deterministic
 * 7. No Date.now / Math.random in adapter
 * 8. Moments do not alter gameplay (same seed → same rngCalls)
 * 9. Moments do NOT directly write trust/urgency/stage
 * 10. Frozen output
 */

import assert from 'node:assert/strict';
import { createInitialState } from '../src/selling-houses/application/gameState.js';
import { advanceDays, executeAction } from '../src/selling-houses/domain/engine.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine/opportunityEngine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import {
  buildOwnerDecisionMomentsFromState,
  enrichStateWithOwnerDecisionMoments,
  buildOwnerDecisionMomentSummary,
  normalizeOwnerDecisionMomentHistory,
} from '../src/selling-houses/runtime/simulation/ownerDecisionMomentAdapter.js';
import type { GameState, OwnerDecisionMoment } from '../src/selling-houses/domain/models.js';

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

console.log('=== Check 1: buildOwnerDecisionMomentsFromState produces frozen output ===');
{
  const snapshot = getScenarioSnapshotById('standard-window-chain')!;
  const world = createInitialState(snapshot, 42);
  seedInitialOpportunities(world);
  advanceDays(world, 3);

  const moments = buildOwnerDecisionMomentsFromState(world);
  check(Object.isFrozen(moments), 'moments array is frozen');
  for (const m of moments) {
    check(Object.isFrozen(m), `moment ${m.momentId} is frozen`);
    check(Object.isFrozen(m.factors), `moment ${m.momentId} factors is frozen`);
  }
}

console.log('=== Check 2: Moments have correct kind ===');
{
  const snapshot = getScenarioSnapshotById('standard-window-chain')!;
  const world = createInitialState(snapshot, 42);
  seedInitialOpportunities(world);
  advanceDays(world, 5);

  const moments = buildOwnerDecisionMomentsFromState(world);
  const validKinds = new Set([
    'trust_threshold', 'patience_exhausted', 'urgency_spike',
    'price_anchor_shift', 'commitment_formed', 'commitment_revoked',
    'consensus_advance', 'consensus_collapse', 'pressure_response', 'window_closing',
  ]);
  for (const m of moments) {
    check(validKinds.has(m.kind), `moment has valid kind: ${m.kind}`);
    check(['critical', 'important', 'informational'].includes(m.significance),
      `moment has valid significance: ${m.significance}`);
  }
}

console.log('=== Check 3: Moments have factors ===');
{
  const snapshot = getScenarioSnapshotById('standard-window-chain')!;
  const world = createInitialState(snapshot, 42);
  seedInitialOpportunities(world);
  advanceDays(world, 5);

  const moments = buildOwnerDecisionMomentsFromState(world);
  for (const m of moments) {
    check(Array.isArray(m.factors), `moment ${m.momentId} has factors array`);
    for (const f of m.factors) {
      check(typeof f.factorKind === 'string', `factor has factorKind: ${f.factorKind}`);
      check(typeof f.value === 'number', `factor has value`);
      check(typeof f.threshold === 'number', `factor has threshold`);
      check(['above', 'below'].includes(f.direction), `factor has direction: ${f.direction}`);
    }
  }
}

console.log('=== Check 4: enrichStateWithOwnerDecisionMoments upserts ===');
{
  const snapshot = getScenarioSnapshotById('standard-window-chain')!;
  const world = createInitialState(snapshot, 42);
  seedInitialOpportunities(world);
  advanceDays(world, 3);

  const moments = buildOwnerDecisionMomentsFromState(world);
  enrichStateWithOwnerDecisionMoments(world, moments);
  check(world.ownerDecisionMomentHistory!.length === moments.length,
    `ownerDecisionMomentHistory length: ${world.ownerDecisionMomentHistory!.length}`);

  // Upsert same moments — should not duplicate
  enrichStateWithOwnerDecisionMoments(world, moments);
  check(world.ownerDecisionMomentHistory!.length === moments.length,
    `after upsert, still ${moments.length} moments`);
}

console.log('=== Check 5: normalizeOwnerDecisionMomentHistory handles old saves ===');
{
  check(normalizeOwnerDecisionMomentHistory(undefined).length === 0, 'undefined → empty');
  check(normalizeOwnerDecisionMomentHistory(null).length === 0, 'null → empty');
  check(normalizeOwnerDecisionMomentHistory('string').length === 0, 'string → empty');
  check(normalizeOwnerDecisionMomentHistory([{ momentId: 'x', caseId: 'y', day: 1 }]).length === 1, 'valid → kept');
  check(normalizeOwnerDecisionMomentHistory([{ momentId: 'x', caseId: 'y', day: -1 }]).length === 0, 'negative day → filtered');
}

console.log('=== Check 6: buildOwnerDecisionMomentSummary is deterministic ===');
{
  const snapshot = getScenarioSnapshotById('standard-window-chain')!;
  const world = createInitialState(snapshot, 42);
  seedInitialOpportunities(world);
  advanceDays(world, 5);

  const moments = buildOwnerDecisionMomentsFromState(world);
  enrichStateWithOwnerDecisionMoments(world, moments);

  const summary1 = buildOwnerDecisionMomentSummary(world, world.day);
  const summary2 = buildOwnerDecisionMomentSummary(world, world.day);
  check(JSON.stringify(summary1) === JSON.stringify(summary2), 'same input → same summary');
}

console.log('=== Check 7: No Date.now / Math.random ===');
{
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(
    '/Users/jiaqi/Documents/开放日测算/src/selling-houses/runtime/simulation/ownerDecisionMomentAdapter.ts',
    'utf-8',
  );
  const srcNoComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  check(!srcNoComments.includes('Date.now'), 'no Date.now');
  check(!srcNoComments.includes('Math.random'), 'no Math.random');
  check(!srcNoComments.includes('fetch('), 'no fetch');
  check(!srcNoComments.includes('openai'), 'no openai');
}

console.log('=== Check 8: Gameplay invariance ===');
{
  const snapshot = getScenarioSnapshotById('standard-window-chain')!;
  const worldA = createInitialState(snapshot, 42);
  seedInitialOpportunities(worldA);
  const worldB = createInitialState(snapshot, 42);
  seedInitialOpportunities(worldB);

  advanceDays(worldA, 3);
  advanceDays(worldB, 3);

  // Now enrich worldA with moments
  const moments = buildOwnerDecisionMomentsFromState(worldA);
  enrichStateWithOwnerDecisionMoments(worldA, moments);

  check(worldA.rngCalls === worldB.rngCalls, 'rngCalls unchanged');
  check(worldA.closedDeals.length === worldB.closedDeals.length, 'closedDeals unchanged');
  check(worldA.rngState === worldB.rngState, 'rngState unchanged');
}

console.log('=== Check 9: Moments do NOT write trust/urgency/stage ===');
{
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(
    '/Users/jiaqi/Documents/开放日测算/src/selling-houses/runtime/simulation/ownerDecisionMomentAdapter.ts',
    'utf-8',
  );
  const srcNoComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  // Should not contain direct writes to trust, urgency, or stage
  check(!srcNoComments.includes('.trust ='), 'no direct trust write');
  check(!srcNoComments.includes('.urgency ='), 'no direct urgency write');
  check(!srcNoComments.includes('.stageIndex ='), 'no direct stageIndex write');
  check(!srcNoComments.includes('.stageLabel ='), 'no direct stageLabel write');
  check(!srcNoComments.includes('applyBrokerOwnerTrustDelta'), 'no trust delta call');
  check(!srcNoComments.includes('setOpportunityStatusOnState'), 'no opportunity status write');
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
  console.log('\nselling-houses-owner-decision-moment-runtime-contract: PASS');
  process.exit(0);
}
