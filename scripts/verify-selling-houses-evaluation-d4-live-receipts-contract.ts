/**
 * Verification script for D4 live receipt adapters.
 *
 * Checks:
 * 1. No receipts → D4 undefined
 * 2. Matching receipt → D4 exists and is 0-100
 * 3. Non-matching receipt → D4 undefined
 * 4. No mutation of Case or GameState
 * 5. Legacy D1/D2/D3/total unchanged with receipts
 * 6. D4 inputs come only from receipt data
 * 7. findCompetitionPressureSnapshotForCase returns correct snapshot
 * 8. findCompetitionPressureSnapshotForCase handles null/undefined receipts
 * 9. Freeze behavior on returned snapshot
 */

import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import type { Case, GameState } from '../src/selling-houses/domain/models.js';
import type { PressureInput } from '../src/selling-houses/core/world-state/competition/models.js';
import {
  createPressureCollectionBuffer,
  buildPressureReceiptsFromBuffer,
} from '../src/selling-houses/core/world-state/competition/pressureBuffer.js';

import {
  buildAssetScoreSnapshotFromLegacyCase,
  buildAssetScoreSnapshotFromLegacyCaseWithPressureReceipts,
  findCompetitionPressureSnapshotForCase,
} from '../src/selling-houses/core/evaluation/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function buildWorld(): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');
  const world = createInitialState(snapshot, 20260421);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

function buildPressureInput(
  caseId: string,
  day: number,
  overrides: Partial<PressureInput> = {},
): PressureInput {
  return {
    source: 'rival-pressure',
    caseId,
    day,
    dimension: 'heat',
    magnitude: -3,
    evidence: '竞品价格重叠',
    ...overrides,
  };
}

function buildReceiptBundle(day: number, inputs: PressureInput[]) {
  const buffer = createPressureCollectionBuffer(day);
  for (const input of inputs) {
    buffer.collectPressure(input);
  }
  return buildPressureReceiptsFromBuffer(buffer);
}

// ---------------------------------------------------------------------------
// 1. No receipts → D4 undefined
// ---------------------------------------------------------------------------

function verifyNoReceiptsD4Undefined() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  const snapshot = buildAssetScoreSnapshotFromLegacyCaseWithPressureReceipts(
    world, caseItem, undefined,
  );

  assert.equal(snapshot.dimensions.d4, undefined, 'D4 must be undefined when no receipts');
  assert.ok(snapshot.score >= 0 && snapshot.score <= 100, 'Score must be 0-100');

  console.log('  [PASS] No receipts → D4 undefined');
}

// ---------------------------------------------------------------------------
// 2. Matching receipt → D4 exists and is 0-100
// ---------------------------------------------------------------------------

function verifyMatchingReceiptD4Exists() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  const inputs = [
    buildPressureInput(caseItem.id, world.day, {
      source: 'rival-pressure',
      dimension: 'heat',
      magnitude: -4,
      evidence: '竞品热度冲击',
    }),
    buildPressureInput(caseItem.id, world.day, {
      source: 'competition-group',
      dimension: 'trust',
      magnitude: -2,
      evidence: '竞争组信任侵蚀',
    }),
  ];
  const receipts = buildReceiptBundle(world.day, inputs);

  const snapshot = buildAssetScoreSnapshotFromLegacyCaseWithPressureReceipts(
    world, caseItem, receipts,
  );

  assert.ok(snapshot.dimensions.d4 !== undefined, 'D4 must exist with matching receipt');
  assert.ok(snapshot.dimensions.d4!.score >= 0 && snapshot.dimensions.d4!.score <= 100, 'D4 score must be 0-100');
  assert.equal(snapshot.dimensions.d4!.key, 'd4', 'D4 key must be d4');

  console.log('  [PASS] Matching receipt → D4 exists');
}

// ---------------------------------------------------------------------------
// 3. Non-matching receipt → D4 undefined
// ---------------------------------------------------------------------------

function verifyNonMatchingReceiptD4Undefined() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  // Build receipts for a DIFFERENT case
  const inputs = [
    buildPressureInput('nonexistent-case-id', world.day, {
      dimension: 'heat',
      magnitude: -5,
    }),
  ];
  const receipts = buildReceiptBundle(world.day, inputs);

  const snapshot = buildAssetScoreSnapshotFromLegacyCaseWithPressureReceipts(
    world, caseItem, receipts,
  );

  assert.equal(snapshot.dimensions.d4, undefined, 'D4 must be undefined when no matching receipt');

  console.log('  [PASS] Non-matching receipt → D4 undefined');
}

// ---------------------------------------------------------------------------
// 4. No mutation of Case or GameState
// ---------------------------------------------------------------------------

function verifyNoMutation() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  const worldBefore = deepClone(world);
  const caseBefore = deepClone(caseItem);

  const inputs = [
    buildPressureInput(caseItem.id, world.day, {
      magnitude: -8,
      source: 'rival-pressure',
      dimension: 'trust',
    }),
  ];
  const receipts = buildReceiptBundle(world.day, inputs);

  buildAssetScoreSnapshotFromLegacyCaseWithPressureReceipts(world, caseItem, receipts);

  // Verify Case unchanged
  assert.deepEqual(caseItem.d1, caseBefore.d1, 'Case.d1 must not mutate');
  assert.deepEqual(caseItem.d2, caseBefore.d2, 'Case.d2 must not mutate');
  assert.deepEqual(caseItem.d3, caseBefore.d3, 'Case.d3 must not mutate');
  assert.deepEqual(caseItem.competitiveness, caseBefore.competitiveness, 'Case.competitiveness must not mutate');
  assert.deepEqual(caseItem.trust, caseBefore.trust, 'Case.trust must not mutate');
  assert.deepEqual(caseItem.heat, caseBefore.heat, 'Case.heat must not mutate');
  assert.equal((caseItem as any).d4, undefined, 'Case must not have a d4 field');

  // Verify GameState unchanged
  assert.deepEqual(world.day, worldBefore.day, 'GameState.day must not mutate');
  assert.deepEqual(world.cases.length, worldBefore.cases.length, 'GameState.cases length must not change');

  console.log('  [PASS] No mutation detected');
}

// ---------------------------------------------------------------------------
// 5. Legacy D1/D2/D3/total unchanged with receipts
// ---------------------------------------------------------------------------

function verifyLegacyScoresUnchanged() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  const withoutReceipts = buildAssetScoreSnapshotFromLegacyCase(world, caseItem);
  const inputs = [
    buildPressureInput(caseItem.id, world.day, { magnitude: -6 }),
  ];
  const receipts = buildReceiptBundle(world.day, inputs);
  const withReceipts = buildAssetScoreSnapshotFromLegacyCaseWithPressureReceipts(
    world, caseItem, receipts,
  );

  // D1/D2/D3 must be identical
  assert.equal(withReceipts.dimensions.d1.score, withoutReceipts.dimensions.d1.score, 'D1 must be identical');
  assert.equal(withReceipts.dimensions.d2.score, withoutReceipts.dimensions.d2.score, 'D2 must be identical');
  assert.equal(withReceipts.dimensions.d3.score, withoutReceipts.dimensions.d3.score, 'D3 must be identical');

  // Total must be identical — D4 excluded from total
  assert.equal(withReceipts.score, withoutReceipts.score, 'Total score must not change with D4');

  // Inputs must be identical
  assert.deepEqual(withReceipts.inputs, withoutReceipts.inputs, 'Inputs must be identical');

  console.log('  [PASS] Legacy scores unchanged');
}

// ---------------------------------------------------------------------------
// 6. D4 inputs come only from receipt data
// ---------------------------------------------------------------------------

function verifyD4InputSourceOnlyFromReceipt() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  const inputs = [
    buildPressureInput(caseItem.id, world.day, {
      source: 'rival-pressure',
      dimension: 'heat',
      magnitude: -3,
      evidence: '竞品热度',
    }),
    buildPressureInput(caseItem.id, world.day, {
      source: 'competition-group',
      dimension: 'trust',
      magnitude: -2,
      evidence: '竞争组信任',
    }),
  ];
  const receipts = buildReceiptBundle(world.day, inputs);

  const snapshot = buildAssetScoreSnapshotFromLegacyCaseWithPressureReceipts(
    world, caseItem, receipts,
  );
  const d4 = snapshot.dimensions.d4!;
  assert.ok(d4, 'D4 must exist');

  const d4InputKeys = Object.keys(d4.inputs ?? {});
  const caseFieldKeys = [
    'heat', 'trust', 'patience', 'urgency', 'd1', 'd2', 'd3',
    'askPrice', 'marketPrice', 'bottomPrice', 'competitiveness',
    'axisScores', 'activeOpportunityCount', 'lateStageOpportunityCount',
  ];

  for (const caseKey of caseFieldKeys) {
    assert.ok(
      !d4InputKeys.includes(caseKey),
      `D4 inputs must not contain Case field "${caseKey}"`,
    );
  }

  const allowedD4Keys = [
    'netHeatDelta', 'netTrustDelta', 'netUrgencyDelta',
    'lostToRival', 'hasSignificantPressure',
    'evidenceCount', 'avgEvidenceStrength',
  ];
  for (const d4Key of d4InputKeys) {
    assert.ok(
      allowedD4Keys.includes(d4Key),
      `D4 input "${d4Key}" must be a receipt-derived field`,
    );
  }

  console.log('  [PASS] D4 inputs only from receipt types');
}

// ---------------------------------------------------------------------------
// 7. findCompetitionPressureSnapshotForCase returns correct snapshot
// ---------------------------------------------------------------------------

function verifyFindSnapshotReturnsCorrect() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  const inputs = [
    buildPressureInput(caseItem.id, world.day, { magnitude: -5 }),
    buildPressureInput('other-case', world.day, { magnitude: -3 }),
  ];
  const receipts = buildReceiptBundle(world.day, inputs);

  const found = findCompetitionPressureSnapshotForCase(receipts, caseItem.id);
  assert.ok(found, 'Must find snapshot for matching caseId');
  assert.equal(found!.caseId, caseItem.id, 'Found snapshot must have correct caseId');
  assert.equal(found!.day, world.day, 'Found snapshot must have correct day');

  const notFound = findCompetitionPressureSnapshotForCase(receipts, 'nonexistent');
  assert.equal(notFound, undefined, 'Must return undefined for non-matching caseId');

  console.log('  [PASS] findCompetitionPressureSnapshotForCase correct');
}

// ---------------------------------------------------------------------------
// 8. findCompetitionPressureSnapshotForCase handles null/undefined
// ---------------------------------------------------------------------------

function verifyFindSnapshotHandlesNull() {
  assert.equal(
    findCompetitionPressureSnapshotForCase(null, 'any'),
    undefined,
    'Must return undefined for null receipts',
  );
  assert.equal(
    findCompetitionPressureSnapshotForCase(undefined, 'any'),
    undefined,
    'Must return undefined for undefined receipts',
  );

  console.log('  [PASS] findCompetitionPressureSnapshotForCase handles null/undefined');
}

// ---------------------------------------------------------------------------
// 9. Freeze behavior
// ---------------------------------------------------------------------------

function verifyFreezeBehavior() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  const inputs = [buildPressureInput(caseItem.id, world.day)];
  const receipts = buildReceiptBundle(world.day, inputs);

  const snapshot = buildAssetScoreSnapshotFromLegacyCaseWithPressureReceipts(
    world, caseItem, receipts,
  );

  assert.ok(Object.isFrozen(snapshot.blockers), 'blockers must be frozen');
  assert.ok(Object.isFrozen(snapshot.topDrivers), 'topDrivers must be frozen');
  assert.ok(Object.isFrozen(snapshot.recommendedDecisionMoments), 'recommendedDecisionMoments must be frozen');

  console.log('  [PASS] Freeze behavior verified');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('Verifying selling-houses evaluation D4 live receipts contract...');

verifyNoReceiptsD4Undefined();
verifyMatchingReceiptD4Exists();
verifyNonMatchingReceiptD4Undefined();
verifyNoMutation();
verifyLegacyScoresUnchanged();
verifyD4InputSourceOnlyFromReceipt();
verifyFindSnapshotReturnsCorrect();
verifyFindSnapshotHandlesNull();
verifyFreezeBehavior();

console.log('selling-houses evaluation D4 live receipts contract verification passed');
