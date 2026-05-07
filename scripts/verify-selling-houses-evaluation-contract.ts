/**
 * Verification script for the selling-houses evaluation contract.
 *
 * Checks:
 * 1. Adapters are pure (no mutation of GameState/Case/Opportunity)
 * 2. Snapshots mirror legacy D1/D2/D3 correctly
 * 3. D4 dimension is optional and does not break existing snapshots
 * 4. Comparison helpers produce valid output
 * 5. Boundary guards detect forbidden inputs
 * 6. New types compile and export correctly
 * 7. Blockers, topDrivers, recommendedDecisionMoments are populated
 */

import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import type { Case, GameState } from '../src/selling-houses/domain/models.js';

import {
  buildAssetScoreSnapshotFromLegacyCase,
  buildOwnerDecisionReadinessSnapshotFromLegacyCase,
  buildOpportunityScoreSnapshotFromLegacyOpportunity,
  buildRegionOpenDayFitSnapshotFromLegacyState,
  buildCaseEvaluationSnapshotsFromLegacyState,
  compareLegacyScoresToAssetSnapshot,
  compareLegacyFieldsToOwnerReadinessSnapshot,
  validateEvaluationSnapshotBoundary,
  validateEvaluationSnapshotsBoundaries,
} from '../src/selling-houses/core/evaluation/index.js';

import type {
  AssetScoreSnapshot,
  OwnerDecisionReadinessSnapshot,
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

// ---------------------------------------------------------------------------
// 1. Adapter Purity: snapshots must not mutate GameState, Case, or Opportunity
// ---------------------------------------------------------------------------

function verifyAdapterPurity() {
  const world = buildWorld();
  const worldBefore = deepClone(world);
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  // Build all snapshot types
  const assetSnapshot = buildAssetScoreSnapshotFromLegacyCase(world, caseItem);
  const ownerSnapshot = buildOwnerDecisionReadinessSnapshotFromLegacyCase(world, caseItem);

  // Verify Case fields unchanged
  assert.deepEqual(caseItem.d1, worldBefore.cases[0].d1, 'Case.d1 must not be mutated by adapter');
  assert.deepEqual(caseItem.d2, worldBefore.cases[0].d2, 'Case.d2 must not be mutated by adapter');
  assert.deepEqual(caseItem.d3, worldBefore.cases[0].d3, 'Case.d3 must not be mutated by adapter');
  assert.deepEqual(caseItem.competitiveness, worldBefore.cases[0].competitiveness, 'Case.competitiveness must not be mutated by adapter');
  assert.deepEqual(caseItem.trust, worldBefore.cases[0].trust, 'Case.trust must not be mutated by adapter');
  assert.deepEqual(caseItem.urgency, worldBefore.cases[0].urgency, 'Case.urgency must not be mutated by adapter');
  assert.deepEqual(caseItem.patience, worldBefore.cases[0].patience, 'Case.patience must not be mutated by adapter');

  // Verify GameState fields unchanged
  assert.deepEqual(world.day, worldBefore.day, 'GameState.day must not be mutated');
  assert.deepEqual(world.cases.length, worldBefore.cases.length, 'GameState.cases length must not change');
  assert.deepEqual(world.opportunities.length, worldBefore.opportunities.length, 'GameState.opportunities length must not change');

  // Verify snapshot is a new object (not a reference to Case)
  assert.notEqual(assetSnapshot, caseItem, 'Snapshot must not be the same reference as Case');
  assert.notEqual(ownerSnapshot, caseItem, 'Snapshot must not be the same reference as Case');

  console.log('  [PASS] Adapter purity verified');
}

// ---------------------------------------------------------------------------
// 2. Legacy D1/D2/D3 Mirror: snapshot dimensions match legacy Case fields
// ---------------------------------------------------------------------------

function verifyLegacyMirror() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  const snapshot = buildAssetScoreSnapshotFromLegacyCase(world, caseItem);

  assert.equal(snapshot.dimensions.d1.score, Math.round(caseItem.d1), 'D1 must mirror legacy Case.d1');
  assert.equal(snapshot.dimensions.d2.score, Math.round(caseItem.d2), 'D2 must mirror legacy Case.d2');
  assert.equal(snapshot.dimensions.d3.score, Math.round(caseItem.d3), 'D3 must mirror legacy Case.d3');
  assert.equal(snapshot.score, Math.round(caseItem.competitiveness), 'Total must mirror legacy Case.competitiveness');

  // Verify legacy values are preserved in inputs
  assert.equal(snapshot.inputs.legacyD1, caseItem.d1, 'inputs.legacyD1 must match Case.d1');
  assert.equal(snapshot.inputs.legacyD2, caseItem.d2, 'inputs.legacyD2 must match Case.d2');
  assert.equal(snapshot.inputs.legacyD3, caseItem.d3, 'inputs.legacyD3 must match Case.d3');
  assert.equal(snapshot.inputs.legacyCompetitiveness, caseItem.competitiveness, 'inputs.legacyCompetitiveness must match Case.competitiveness');

  console.log('  [PASS] Legacy D1/D2/D3 mirror verified');
}

// ---------------------------------------------------------------------------
// 3. D4 Dimension: optional, does not break existing snapshots
// ---------------------------------------------------------------------------

function verifyD4Optional() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  const snapshot = buildAssetScoreSnapshotFromLegacyCase(world, caseItem);

  // D4 is optional in Round 1
  assert.equal(snapshot.dimensions.d4, undefined, 'D4 should be undefined when no competition data is provided');

  // Total should still work without D4
  assert.ok(snapshot.score >= 0 && snapshot.score <= 100, 'Score must be 0-100 even without D4');

  console.log('  [PASS] D4 optional dimension verified');
}

// ---------------------------------------------------------------------------
// 4. Blockers, TopDrivers, DecisionMoments: populated fields
// ---------------------------------------------------------------------------

function verifyMotherModelFields() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  const snapshot = buildAssetScoreSnapshotFromLegacyCase(world, caseItem);

  assert.ok(Array.isArray(snapshot.blockers), 'blockers must be an array');
  assert.ok(Array.isArray(snapshot.topDrivers), 'topDrivers must be an array');
  assert.ok(Array.isArray(snapshot.recommendedDecisionMoments), 'recommendedDecisionMoments must be an array');

  // Verify blockers are strings
  for (const blocker of snapshot.blockers) {
    assert.equal(typeof blocker, 'string', 'Each blocker must be a string');
  }

  // Verify topDrivers shape
  for (const driver of snapshot.topDrivers) {
    assert.ok(['positive', 'negative', 'neutral'].includes(driver.contribution), 'Driver contribution must be positive/negative/neutral');
    assert.equal(typeof driver.label, 'string', 'Driver label must be a string');
  }

  // Verify decisionMoments shape
  for (const moment of snapshot.recommendedDecisionMoments) {
    assert.ok(['high', 'medium', 'low'].includes(moment.urgency), 'Moment urgency must be high/medium/low');
    assert.equal(typeof moment.label, 'string', 'Moment label must be a string');
    assert.equal(typeof moment.trigger, 'string', 'Moment trigger must be a string');
  }

  console.log('  [PASS] Mother-model fields (blockers, topDrivers, decisionMoments) verified');
}

// ---------------------------------------------------------------------------
// 5. Comparison helpers: produce valid output
// ---------------------------------------------------------------------------

function verifyComparisonHelpers() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  const assetSnapshot = buildAssetScoreSnapshotFromLegacyCase(world, caseItem);
  const ownerSnapshot = buildOwnerDecisionReadinessSnapshotFromLegacyCase(world, caseItem);

  // Asset comparison
  const assetComparison = compareLegacyScoresToAssetSnapshot(caseItem, assetSnapshot);
  assert.equal(assetComparison.caseId, caseItem.id, 'Comparison caseId must match');
  assert.equal(assetComparison.legacyTotal, Math.round(caseItem.competitiveness), 'Legacy total must match');
  assert.equal(assetComparison.snapshotTotal, assetSnapshot.score, 'Snapshot total must match');
  assert.ok(assetComparison.dimensions.length >= 3, 'Must have at least D1/D2/D3 comparisons');
  assert.ok(assetComparison.d3MixedWarning.length > 0, 'D3 mixed warning must be present');
  assert.ok(assetComparison.summary.length > 0, 'Summary must be present');

  // Owner readiness comparison
  const ownerComparison = compareLegacyFieldsToOwnerReadinessSnapshot(caseItem, ownerSnapshot);
  assert.equal(ownerComparison.caseId, caseItem.id, 'Owner comparison caseId must match');
  assert.equal(ownerComparison.legacyTrust, caseItem.trust, 'Legacy trust must match');
  assert.ok(ownerComparison.snapshotWeightedScore >= 0 && ownerComparison.snapshotWeightedScore <= 100, 'Weighted score must be 0-100');
  assert.ok(ownerComparison.summary.length > 0, 'Owner summary must be present');

  console.log('  [PASS] Comparison helpers verified');
}

// ---------------------------------------------------------------------------
// 6. Boundary guards: detect forbidden inputs and legacy mirrors
// ---------------------------------------------------------------------------

function verifyBoundaryGuards() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  const snapshot = buildAssetScoreSnapshotFromLegacyCase(world, caseItem);

  // Validate boundary
  const report = validateEvaluationSnapshotBoundary(snapshot);
  assert.equal(report.modelId, 'asset-score', 'Report modelId must match');
  assert.ok(report.status === 'legacy-warning' || report.status === 'clean', `Status must be legacy-warning or clean, got: ${report.status}`);

  // The asset snapshot has legacy mirror fields (d1/d2/d3/competitiveness)
  // so we expect legacy-warning status
  assert.ok(report.legacyMirrorHits.length > 0, 'Expected legacy mirror hits for D1/D2/D3');
  assert.equal(report.forbiddenInputHits.length, 0, 'Must not have forbidden input hits');

  // Owner readiness should be clean (no legacy mirrors in its boundary)
  const ownerSnapshot = buildOwnerDecisionReadinessSnapshotFromLegacyCase(world, caseItem);
  const ownerReport = validateEvaluationSnapshotBoundary(ownerSnapshot);
  assert.equal(ownerReport.status, 'clean', 'Owner readiness should have clean boundary status');

  // Batch validation
  const allReports = validateEvaluationSnapshotsBoundaries([snapshot, ownerSnapshot]);
  assert.equal(allReports.length, 2, 'Must have 2 reports for 2 snapshots');

  console.log('  [PASS] Boundary guards verified');
}

// ---------------------------------------------------------------------------
// 7. All snapshot types compile and produce valid output
// ---------------------------------------------------------------------------

function verifyAllSnapshotTypes() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  // AssetScoreSnapshot
  const assetSnapshot = buildAssetScoreSnapshotFromLegacyCase(world, caseItem);
  assert.equal(assetSnapshot.modelId, 'asset-score');
  assert.equal(assetSnapshot.modelVersion, '1.0.0');
  assert.ok(assetSnapshot.confidence > 0 && assetSnapshot.confidence <= 1, 'Confidence must be 0-1');

  // OwnerDecisionReadinessSnapshot
  const ownerSnapshot = buildOwnerDecisionReadinessSnapshotFromLegacyCase(world, caseItem);
  assert.equal(ownerSnapshot.modelId, 'owner-decision-readiness');
  assert.ok(ownerSnapshot.confidence > 0 && ownerSnapshot.confidence <= 1, 'Confidence must be 0-1');

  // OpportunityScoreSnapshot
  const opp = world.opportunities.find((o) => o.caseId === caseItem.id);
  if (opp) {
    const oppSnapshot = buildOpportunityScoreSnapshotFromLegacyOpportunity(world, opp);
    assert.equal(oppSnapshot.modelId, 'opportunity-score');
    assert.ok(oppSnapshot.confidence > 0 && oppSnapshot.confidence <= 1, 'Confidence must be 0-1');
  }

  // RegionOpenDayFitSnapshot
  const regionSnapshot = buildRegionOpenDayFitSnapshotFromLegacyState(world, {
    district: caseItem.district,
    community: caseItem.community,
  });
  assert.equal(regionSnapshot.modelId, 'region-open-day-fit');

  // Combined case snapshots
  const combined = buildCaseEvaluationSnapshotsFromLegacyState(world, caseItem);
  assert.ok(combined.assetScore, 'Combined must have assetScore');
  assert.ok(combined.ownerDecisionReadiness, 'Combined must have ownerDecisionReadiness');

  console.log('  [PASS] All snapshot types compile and produce valid output');
}

// ---------------------------------------------------------------------------
// 8. Freeze checks: snapshots and comparison results are frozen
// ---------------------------------------------------------------------------

function verifyFreezeBehavior() {
  const world = buildWorld();
  const caseItem = world.cases[0];
  assert.ok(caseItem, 'Expected at least one case');

  const snapshot = buildAssetScoreSnapshotFromLegacyCase(world, caseItem);

  // Verify frozen (Object.isFrozen)
  assert.ok(Object.isFrozen(snapshot.blockers), 'blockers array must be frozen');
  assert.ok(Object.isFrozen(snapshot.topDrivers), 'topDrivers array must be frozen');
  assert.ok(Object.isFrozen(snapshot.recommendedDecisionMoments), 'recommendedDecisionMoments array must be frozen');

  const comparison = compareLegacyScoresToAssetSnapshot(caseItem, snapshot);
  assert.ok(Object.isFrozen(comparison), 'Comparison result must be frozen');
  assert.ok(Object.isFrozen(comparison.dimensions), 'Comparison dimensions must be frozen');

  console.log('  [PASS] Freeze behavior verified');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('Verifying selling-houses evaluation contract...');

verifyAdapterPurity();
verifyLegacyMirror();
verifyD4Optional();
verifyMotherModelFields();
verifyComparisonHelpers();
verifyBoundaryGuards();
verifyAllSnapshotTypes();
verifyFreezeBehavior();

console.log('selling-houses evaluation contract verification passed');
