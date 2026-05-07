/**
 * Verification script for D4 Competition / Service-Path Advantage adapter.
 *
 * Checks:
 * 1. Without CompetitionPressureSnapshot, D4 is undefined
 * 2. With CompetitionPressureSnapshot, D4 exists and is 0-100
 * 3. Adapter does not mutate GameState, Case, or CompetitionPressureSnapshot
 * 4. Legacy D1/D2/D3/total mirror is unchanged when using WithCompetition variant
 * 5. D4 is a derived projection, not a canonical fact
 * 6. Freeze behavior on returned snapshot
 */

import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import type { Case, GameState } from '../src/selling-houses/domain/models.js';
import type { CompetitionPressureSnapshot } from '../src/selling-houses/core/world-state/competition/models.js';

import {
  buildAssetScoreSnapshotFromLegacyCase,
  buildAssetScoreSnapshotFromLegacyCaseWithCompetition,
  buildD4CompetitionServicePathDimension,
  compareLegacyScoresToAssetSnapshot,
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

function buildMockPressure(overrides: Partial<CompetitionPressureSnapshot> = {}): CompetitionPressureSnapshot {
  return {
    caseId: 'mock-case',
    day: 1,
    signals: [],
    evidence: [],
    netHeatDelta: 0,
    netTrustDelta: 0,
    netUrgencyDelta: 0,
    lostToRival: false,
    hasSignificantPressure: false,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Without CompetitionPressureSnapshot, D4 is undefined
// ---------------------------------------------------------------------------

function verifyD4UndefinedWithoutPressure() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  const snapshot = buildAssetScoreSnapshotFromLegacyCase(world, caseItem);

  assert.equal(snapshot.dimensions.d4, undefined, 'D4 must be undefined when no competition data provided');
  assert.ok(snapshot.score >= 0 && snapshot.score <= 100, 'Score must be 0-100 without D4');

  console.log('  [PASS] D4 undefined without competition snapshot');
}

// ---------------------------------------------------------------------------
// 2. With CompetitionPressureSnapshot, D4 exists and is 0-100
// ---------------------------------------------------------------------------

function verifyD4ExistsWithPressure() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  const pressure = buildMockPressure({
    caseId: caseItem.id,
    netHeatDelta: -5,
    netTrustDelta: -3,
    netUrgencyDelta: 2,
    lostToRival: false,
    hasSignificantPressure: true,
    evidence: [
      {
        id: 'ev-1',
        kind: 'rival-price-overlap',
        sourceEntityId: 'rival-1',
        sourceLabel: '竞品A',
        day: world.day,
        strength: 60,
        detail: '竞品价格重叠',
      },
    ],
  });

  const snapshot = buildAssetScoreSnapshotFromLegacyCaseWithCompetition(world, caseItem, pressure);

  assert.ok(snapshot.dimensions.d4 !== undefined, 'D4 must exist with competition data');
  assert.ok(snapshot.dimensions.d4!.score >= 0 && snapshot.dimensions.d4!.score <= 100, 'D4 score must be 0-100');
  assert.equal(snapshot.dimensions.d4!.key, 'd4', 'D4 key must be d4');
  assert.equal(snapshot.dimensions.d4!.total, 100, 'D4 total must be 100');

  console.log('  [PASS] D4 exists with competition snapshot');
}

// ---------------------------------------------------------------------------
// 3. Adapter does not mutate GameState, Case, or CompetitionPressureSnapshot
// ---------------------------------------------------------------------------

function verifyNoMutation() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  const worldBefore = deepClone(world);
  const caseBefore = deepClone(caseItem);

  const pressure = buildMockPressure({
    caseId: caseItem.id,
    netHeatDelta: -5,
    netTrustDelta: -3,
    lostToRival: true,
    hasSignificantPressure: true,
    evidence: [{
      id: 'ev-mut',
      kind: 'rival-lead-siphon',
      sourceEntityId: 'rival-m',
      sourceLabel: '竞品M',
      day: world.day,
      strength: 80,
      detail: '客户被抢',
    }],
  });
  const pressureBefore = deepClone(pressure);

  const snapshot = buildAssetScoreSnapshotFromLegacyCaseWithCompetition(world, caseItem, pressure);

  // Verify Case unchanged
  assert.deepEqual(caseItem.d1, caseBefore.d1, 'Case.d1 must not mutate');
  assert.deepEqual(caseItem.d2, caseBefore.d2, 'Case.d2 must not mutate');
  assert.deepEqual(caseItem.d3, caseBefore.d3, 'Case.d3 must not mutate');
  assert.deepEqual(caseItem.competitiveness, caseBefore.competitiveness, 'Case.competitiveness must not mutate');
  assert.deepEqual(caseItem.trust, caseBefore.trust, 'Case.trust must not mutate');
  assert.deepEqual(caseItem.heat, caseBefore.heat, 'Case.heat must not mutate');

  // Verify GameState unchanged
  assert.deepEqual(world.day, worldBefore.day, 'GameState.day must not mutate');
  assert.deepEqual(world.cases.length, worldBefore.cases.length, 'GameState.cases length must not change');

  // Verify CompetitionPressureSnapshot unchanged
  assert.deepEqual(pressure, pressureBefore, 'CompetitionPressureSnapshot must not mutate');

  // Verify snapshot is a new object
  assert.notEqual(snapshot, caseItem, 'Snapshot must not be the same reference as Case');

  console.log('  [PASS] No mutation detected');
}

// ---------------------------------------------------------------------------
// 4. Legacy D1/D2/D3/total mirror unchanged
// ---------------------------------------------------------------------------

function verifyLegacyMirrorIntact() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  const withoutD4 = buildAssetScoreSnapshotFromLegacyCase(world, caseItem);
  const pressure = buildMockPressure({ caseId: caseItem.id, netHeatDelta: -2 });
  const withD4 = buildAssetScoreSnapshotFromLegacyCaseWithCompetition(world, caseItem, pressure);

  // D1/D2/D3 must be identical
  assert.equal(withD4.dimensions.d1.score, withoutD4.dimensions.d1.score, 'D1 must be identical');
  assert.equal(withD4.dimensions.d2.score, withoutD4.dimensions.d2.score, 'D2 must be identical');
  assert.equal(withD4.dimensions.d3.score, withoutD4.dimensions.d3.score, 'D3 must be identical');

  // Total (legacy competitiveness mirror) must be identical — D4 does not affect total in Round 1
  assert.equal(withD4.score, withoutD4.score, 'Total score must be identical (D4 excluded from total in Round 1)');

  // Inputs must be identical
  assert.deepEqual(withD4.inputs, withoutD4.inputs, 'Inputs must be identical');

  console.log('  [PASS] Legacy D1/D2/D3/total mirror intact');
}

// ---------------------------------------------------------------------------
// 5. D4 is a derived projection
// ---------------------------------------------------------------------------

function verifyD4IsDerivedProjection() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  // D4 varies with different pressure inputs — it's derived, not a Case field
  const lowPressure = buildMockPressure({ caseId: caseItem.id, netHeatDelta: 0, netTrustDelta: 0 });
  const highPressure = buildMockPressure({
    caseId: caseItem.id,
    netHeatDelta: -10,
    netTrustDelta: -8,
    lostToRival: true,
    hasSignificantPressure: true,
  });

  const d4Low = buildD4CompetitionServicePathDimension(lowPressure);
  const d4High = buildD4CompetitionServicePathDimension(highPressure);

  // Different pressure must produce different D4
  assert.notEqual(d4Low.score, d4High.score, 'Different pressure must produce different D4 scores');
  assert.ok(d4High.score < d4Low.score, 'Higher pressure must produce lower D4 score');

  // D4 must NOT be written to Case
  assert.equal((caseItem as any).d4, undefined, 'Case must not have a d4 field');

  console.log('  [PASS] D4 is a derived projection');
}

// ---------------------------------------------------------------------------
// 6. Freeze behavior
// ---------------------------------------------------------------------------

function verifyFreezeBehavior() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  const pressure = buildMockPressure({
    caseId: caseItem.id,
    lostToRival: true,
    hasSignificantPressure: true,
  });

  const snapshot = buildAssetScoreSnapshotFromLegacyCaseWithCompetition(world, caseItem, pressure);

  assert.ok(Object.isFrozen(snapshot.blockers), 'blockers must be frozen');
  assert.ok(Object.isFrozen(snapshot.topDrivers), 'topDrivers must be frozen');
  assert.ok(Object.isFrozen(snapshot.recommendedDecisionMoments), 'recommendedDecisionMoments must be frozen');

  console.log('  [PASS] Freeze behavior verified');
}

// ---------------------------------------------------------------------------
// 7. Comparison helper notes D4 has no legacy equivalent
// ---------------------------------------------------------------------------

function verifyComparisonHelperD4Note() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  const pressure = buildMockPressure({ caseId: caseItem.id });
  const snapshot = buildAssetScoreSnapshotFromLegacyCaseWithCompetition(world, caseItem, pressure);
  const comparison = compareLegacyScoresToAssetSnapshot(caseItem, snapshot);

  const d4Mapping = comparison.dimensions.find((d) => d.snapshotDimension === 'd4');
  assert.ok(d4Mapping, 'Comparison must include D4 mapping');
  assert.equal(d4Mapping!.legacyValue, 0, 'D4 legacy value must be 0 (no equivalent)');
  assert.ok(d4Mapping!.note.includes('no legacy equivalent'), 'D4 note must state no legacy equivalent');

  console.log('  [PASS] Comparison helper D4 note verified');
}

// ---------------------------------------------------------------------------
// 8. D4 dimension inputs are populated
// ---------------------------------------------------------------------------

function verifyD4Inputs() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  const pressure = buildMockPressure({
    caseId: caseItem.id,
    netHeatDelta: -4.5,
    netTrustDelta: -2.3,
    netUrgencyDelta: 1.1,
    lostToRival: false,
    hasSignificantPressure: true,
    evidence: [{
      id: 'ev-input',
      kind: 'group-premium-penalty',
      sourceEntityId: 'group-1',
      sourceLabel: '竞争组A',
      day: world.day,
      strength: 45,
      detail: '溢价惩罚',
    }],
  });

  const d4 = buildD4CompetitionServicePathDimension(pressure);

  assert.ok(d4.inputs, 'D4 must have inputs');
  assert.equal(d4.inputs!.netHeatDelta, -4.5, 'netHeatDelta must match');
  assert.equal(d4.inputs!.netTrustDelta, -2.3, 'netTrustDelta must match');
  assert.equal(d4.inputs!.netUrgencyDelta, 1.1, 'netUrgencyDelta must match');
  assert.equal(d4.inputs!.lostToRival, false, 'lostToRival must match');
  assert.equal(d4.inputs!.hasSignificantPressure, true, 'hasSignificantPressure must match');
  assert.equal(d4.inputs!.evidenceCount, 1, 'evidenceCount must match');
  assert.equal(d4.inputs!.avgEvidenceStrength, 45, 'avgEvidenceStrength must match');

  console.log('  [PASS] D4 dimension inputs verified');
}

// ---------------------------------------------------------------------------
// 9. D4 does NOT participate in total score
// ---------------------------------------------------------------------------

function verifyD4NotInTotalScore() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  const withoutD4 = buildAssetScoreSnapshotFromLegacyCase(world, caseItem);
  const pressure = buildMockPressure({
    caseId: caseItem.id,
    netHeatDelta: -8,
    netTrustDelta: -6,
    lostToRival: true,
    hasSignificantPressure: true,
  });
  const withD4 = buildAssetScoreSnapshotFromLegacyCaseWithCompetition(world, caseItem, pressure);

  // Total score must be identical — D4 is excluded from snapshot.score
  assert.equal(withD4.score, withoutD4.score, 'snapshot.score must not change with D4');
  assert.equal(withD4.total, withoutD4.total, 'snapshot.total must not change with D4');
  assert.equal(withD4.confidence, withoutD4.confidence, 'snapshot.confidence must not change with D4');

  console.log('  [PASS] D4 excluded from total score');
}

// ---------------------------------------------------------------------------
// 10. D4 does NOT write back to Case
// ---------------------------------------------------------------------------

function verifyD4DoesNotWriteCase() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  const pressure = buildMockPressure({
    caseId: caseItem.id,
    netHeatDelta: -10,
    netTrustDelta: -8,
    lostToRival: true,
    hasSignificantPressure: true,
    evidence: [{
      id: 'ev-write',
      kind: 'rival-lead-siphon',
      sourceEntityId: 'rival-w',
      sourceLabel: '竞品W',
      day: world.day,
      strength: 90,
      detail: '严重流失',
    }],
  });

  buildAssetScoreSnapshotFromLegacyCaseWithCompetition(world, caseItem, pressure);

  // Case must NOT have a d4 field
  assert.equal((caseItem as any).d4, undefined, 'Case must not have a d4 field after evaluation');
  // Case.competitiveness must remain unchanged
  assert.equal(typeof caseItem.competitiveness, 'number', 'Case.competitiveness must remain a number');
  assert.equal(typeof caseItem.d1, 'number', 'Case.d1 must remain a number');
  assert.equal(typeof caseItem.d2, 'number', 'Case.d2 must remain a number');
  assert.equal(typeof caseItem.d3, 'number', 'Case.d3 must remain a number');

  console.log('  [PASS] D4 does not write back to Case');
}

// ---------------------------------------------------------------------------
// 11. D4 inputs come only from receipt types, not Case fields
// ---------------------------------------------------------------------------

function verifyD4InputSourceOnlyFromReceipt() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  const pressure = buildMockPressure({
    caseId: caseItem.id,
    netHeatDelta: -4,
    netTrustDelta: -3,
    netUrgencyDelta: 1,
    lostToRival: false,
    hasSignificantPressure: true,
    evidence: [{
      id: 'ev-src',
      kind: 'group-premium-penalty',
      sourceEntityId: 'group-src',
      sourceLabel: '竞争组S',
      day: world.day,
      strength: 55,
      detail: '溢价惩罚',
    }],
  });

  const snapshot = buildAssetScoreSnapshotFromLegacyCaseWithCompetition(world, caseItem, pressure);
  const d4 = snapshot.dimensions.d4!;
  assert.ok(d4, 'D4 must exist');

  // D4 inputs must come from CompetitionPressureSnapshot only
  const d4InputKeys = Object.keys(d4.inputs ?? {});
  const caseFieldKeys = [
    'heat', 'trust', 'patience', 'urgency', 'd1', 'd2', 'd3',
    'askPrice', 'marketPrice', 'bottomPrice', 'competitiveness',
    'axisScores', 'activeOpportunityCount', 'lateStageOpportunityCount',
    'priceFlexScore', 'windowDays', 'lastOwnerTouchedDay',
    'storylineState', 'ownerArchetypeId',
  ];

  for (const caseKey of caseFieldKeys) {
    assert.ok(
      !d4InputKeys.includes(caseKey),
      `D4 inputs must not contain Case field "${caseKey}"`,
    );
  }

  // D4 inputs must contain only receipt-derived fields
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
// Main
// ---------------------------------------------------------------------------

console.log('Verifying selling-houses evaluation D4 contract...');

verifyD4UndefinedWithoutPressure();
verifyD4ExistsWithPressure();
verifyNoMutation();
verifyLegacyMirrorIntact();
verifyD4IsDerivedProjection();
verifyFreezeBehavior();
verifyComparisonHelperD4Note();
verifyD4Inputs();
verifyD4NotInTotalScore();
verifyD4DoesNotWriteCase();
verifyD4InputSourceOnlyFromReceipt();

console.log('selling-houses evaluation D4 contract verification passed');
