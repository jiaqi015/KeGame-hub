/**
 * Verification script for POV / Decision Support boundary contract.
 *
 * Checks:
 * 1. BrokerPOVSnapshot is read-only and has correct structure
 * 2. OwnerPOVSnapshot is read-only and does NOT leak D4, opportunities, customer data
 * 3. ActionCommandDrafts are derived from recommendation drafts, not executed
 * 4. Pressure receipts degrade gracefully when absent
 * 5. ActorKnowledge has visibleFacts/inferredSignals/hiddenGlobalFacts boundary
 * 6. DecisionState/DecisionMoment/DecisionCommitment types compile
 * 7. POV builders are pure (no GameState mutation)
 * 8. Workspace projections are read-only
 * 9. Boundary guards validate correctly
 */

import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import type { GameState } from '../src/selling-houses/domain/models.js';

import { buildDecisionSupportContextFromLegacyState } from '../src/selling-houses/runtime/decision-support/legacyAdapter.js';
import { buildBrokerPOVSnapshot, buildOwnerPOVSnapshot, buildPressureReceiptSummary } from '../src/selling-houses/runtime/decision-support/povAdapter.js';

import {
  validateAllPOVBoundaries,
  validateBrokerPOVBoundary,
  validateOwnerPOVBoundary,
  validateBrokerCaseBoundary,
  validateOwnerCaseBoundary,
} from '../src/selling-houses/core/decision/boundaryGuards.js';

import type {
  ActionCommandDraft,
  ActorKnowledge,
  BrokerPOVSnapshot,
  DecisionCommitment,
  DecisionMoment,
  DecisionState,
  OwnerPOVSnapshot,
  PressureReceiptSummary,
} from '../src/selling-houses/core/decision/models.js';

import {
  buildBrokerPOVWorkspaceProjection,
  buildOwnerPOVWorkspaceProjection,
} from '../src/selling-houses/interface/interaction-workspace/povBoundary.js';

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
// 1. BrokerPOVSnapshot structure
// ---------------------------------------------------------------------------

function verifyBrokerPOVStructure() {
  const world = buildWorld();
  const context = buildDecisionSupportContextFromLegacyState(world);
  const pov = buildBrokerPOVSnapshot(context);

  assert.equal(pov.role, 'broker', 'role must be broker');
  assert.equal(pov.readOnly, true, 'must be readOnly');
  assert.equal(typeof pov.day, 'number', 'day must be number');
  assert.ok(pov.day > 0, 'day must be positive');
  assert.equal(typeof pov.actorId, 'string', 'actorId must be string');
  assert.ok(Array.isArray(pov.cases), 'cases must be array');
  assert.ok(Array.isArray(pov.actionCommandDrafts), 'actionCommandDrafts must be array');
  assert.ok(Array.isArray(pov.decisionMoments), 'decisionMoments must be array');
  assert.ok(pov.pressureSummary, 'pressureSummary must exist');
  assert.equal(typeof pov.energy, 'number', 'energy must be number');
  assert.ok(pov.energy >= 0, 'energy must be non-negative');
  assert.ok(Array.isArray(pov.globalKnowledge.visibleFacts), 'visibleFacts must be array');
  assert.ok(Array.isArray(pov.globalKnowledge.inferredSignals), 'inferredSignals must be array');
  assert.ok(Array.isArray(pov.globalKnowledge.hiddenGlobalFacts), 'hiddenGlobalFacts must be array');
  assert.ok(Array.isArray(pov.globalKnowledge.traces), 'global traces must be array');
  assert.ok(Array.isArray(pov.globalKnowledge.beliefs), 'global beliefs must be array');
  assert.ok(Array.isArray(pov.globalKnowledge.beliefConflicts), 'global beliefConflicts must be array');

  console.log('  [PASS] BrokerPOV structure');
}

// ---------------------------------------------------------------------------
// 2. OwnerPOVSnapshot does NOT leak hidden data
// ---------------------------------------------------------------------------

function verifyOwnerPOVBoundary() {
  const world = buildWorld();
  const context = buildDecisionSupportContextFromLegacyState(world);
  const pov = buildOwnerPOVSnapshot(context);

  assert.equal(pov.role, 'owner', 'role must be owner');
  assert.equal(pov.readOnly, true, 'must be readOnly');
  assert.ok(Array.isArray(pov.cases), 'cases must be array');

  for (const caseCtx of pov.cases) {
    assert.equal((caseCtx.assetScore as any).d4, undefined, `Owner case ${caseCtx.caseId} must NOT have D4`);
    assert.equal((caseCtx as any).recommendationDrafts, undefined, `Owner case ${caseCtx.caseId} must NOT have recommendationDrafts`);
    assert.equal((caseCtx as any).opportunityCount, undefined, `Owner case ${caseCtx.caseId} must NOT have opportunityCount`);

    const hiddenKeys = caseCtx.knowledge.hiddenGlobalFacts.map((f) => f.key);
    assert.ok(hiddenKeys.includes('d4'), 'must hide d4');
    assert.ok(hiddenKeys.includes('opportunity-details'), 'must hide opportunity-details');
    assert.ok(hiddenKeys.includes('company-pressure'), 'must hide company-pressure');
  }

  const globalHiddenKeys = pov.knowledge.hiddenGlobalFacts.map((f) => f.key);
  assert.ok(globalHiddenKeys.includes('competition-internals'), 'must hide competition-internals');

  console.log('  [PASS] OwnerPOV boundary');
}

// ---------------------------------------------------------------------------
// 3. ActionCommandDrafts are derived, not executed
// ---------------------------------------------------------------------------

function verifyActionCommandDrafts() {
  const world = buildWorld();
  const context = buildDecisionSupportContextFromLegacyState(world);
  const pov = buildBrokerPOVSnapshot(context);

  for (const draft of pov.actionCommandDrafts) {
    assert.equal(typeof draft.id, 'string', 'draft id must be string');
    assert.ok(draft.id.startsWith('cmd:'), 'draft id must start with cmd:');
    assert.equal(typeof draft.caseId, 'string', 'caseId must be string');
    assert.equal(typeof draft.actionSpecId, 'string', 'actionSpecId must be string');
    assert.equal(typeof draft.legacyActionId, 'string', 'legacyActionId must be string');
    assert.equal(typeof draft.priority, 'number', 'priority must be number');
    assert.equal(typeof draft.confidence, 'number', 'confidence must be number');
    assert.equal(typeof draft.enabled, 'boolean', 'enabled must be boolean');
    assert.equal(typeof draft.disabledReason, 'string', 'disabledReason must be string');
    assert.ok(Array.isArray(draft.supportingSignalKeys), 'supportingSignalKeys must be array');
    assert.ok(Array.isArray(draft.decisionMomentIds), 'decisionMomentIds must be array');
    assert.equal(typeof draft.estimatedEnergyCost, 'number', 'estimatedEnergyCost must be number');
    assert.equal(typeof draft.estimatedBudgetCost, 'number', 'estimatedBudgetCost must be number');
    assert.equal(typeof draft.rationale, 'string', 'rationale must be string');
  }

  const contextDraftCount = context.cases.reduce((sum, c) => sum + c.recommendationDrafts.length, 0);
  assert.equal(pov.actionCommandDrafts.length, contextDraftCount, 'actionCommandDrafts count must match recommendationDrafts count');

  console.log('  [PASS] ActionCommandDrafts');
}

// ---------------------------------------------------------------------------
// 4. Pressure receipts degrade gracefully when absent
// ---------------------------------------------------------------------------

function verifyPressureGracefulDegradation() {
  const summaryNull = buildPressureReceiptSummary(null, 1);
  assert.equal(summaryNull.available, false, 'null coverage → not available');
  assert.equal(summaryNull.coverage, 0, 'null coverage → 0');
  assert.equal(summaryNull.maxConfidence, 0, 'null confidence → 0');
  assert.ok(summaryNull.headline.includes('无'), 'headline should say no data');

  const summaryUndefined = buildPressureReceiptSummary(undefined, 1);
  assert.equal(summaryUndefined.available, false, 'undefined coverage → not available');

  const world = buildWorld();
  const context = buildDecisionSupportContextFromLegacyState(world);
  const povNoCoverage = buildBrokerPOVSnapshot(context, null);
  assert.equal(povNoCoverage.pressureSummary.available, false, 'no coverage → not available');
  assert.equal(povNoCoverage.pressureSummary.coverage, 0, 'no coverage → 0');

  console.log('  [PASS] Pressure graceful degradation');
}

// ---------------------------------------------------------------------------
// 5. ActorKnowledge boundary
// ---------------------------------------------------------------------------

function verifyActorKnowledgeBoundary() {
  const world = buildWorld();
  const context = buildDecisionSupportContextFromLegacyState(world);
  const brokerPOV = buildBrokerPOVSnapshot(context);
  const ownerPOV = buildOwnerPOVSnapshot(context);

  assert.ok(brokerPOV.globalKnowledge.visibleFacts.length > 0, 'broker must have visible facts');
  assert.ok(ownerPOV.knowledge.visibleFacts.length > 0, 'owner must have visible facts');
  assert.ok(ownerPOV.knowledge.hiddenGlobalFacts.length > 0, 'owner must have hidden facts');

  for (const caseCtx of brokerPOV.cases) {
    assert.ok(Array.isArray(caseCtx.knowledge.visibleFacts), 'case must have visibleFacts');
    assert.ok(Array.isArray(caseCtx.knowledge.inferredSignals), 'case must have inferredSignals');
    assert.ok(Array.isArray(caseCtx.knowledge.hiddenGlobalFacts), 'case must have hiddenGlobalFacts');
    assert.ok(Array.isArray(caseCtx.commitments), 'case must have commitments');
    assert.ok(Array.isArray(caseCtx.commitmentStates), 'case must have commitmentStates');
    assert.equal(
      caseCtx.commitments.length,
      caseCtx.commitmentStates.length,
      'broker case commitments must be derived from commitmentStates',
    );
  }

  for (const caseCtx of ownerPOV.cases) {
    assert.ok(Array.isArray(caseCtx.knowledge.visibleFacts), 'owner case must have visibleFacts');
    assert.ok(Array.isArray(caseCtx.knowledge.inferredSignals), 'owner case must have inferredSignals');
    assert.ok(Array.isArray(caseCtx.knowledge.hiddenGlobalFacts), 'owner case must have hiddenGlobalFacts');
    assert.ok(caseCtx.knowledge.hiddenGlobalFacts.length >= 3, 'owner case must have at least 3 hidden facts');
    assert.equal(
      caseCtx.commitments.length,
      caseCtx.commitmentStates.length,
      'owner commitments must be derived from owner-visible commitmentStates',
    );
  }

  console.log('  [PASS] ActorKnowledge boundary');
}

// ---------------------------------------------------------------------------
// 6. DecisionState / DecisionMoment / DecisionCommitment types compile
// ---------------------------------------------------------------------------

function verifyDecisionTypesCompile() {
  const world = buildWorld();
  const context = buildDecisionSupportContextFromLegacyState(world);
  const pov = buildBrokerPOVSnapshot(context);

  for (const caseCtx of pov.cases) {
    const ds: DecisionState = caseCtx.decisionState;
    assert.ok(
      ['undecided', 'leaning_toward', 'committed', 'waiting', 'stuck_conflicted', 'avoiding'].includes(ds.posture),
      `posture "${ds.posture}" must be valid`,
    );
    assert.ok(ds.pressureLevel >= 0 && ds.pressureLevel <= 100, 'pressureLevel must be 0..100');
    assert.ok(ds.confidence >= 0 && ds.confidence <= 1, 'confidence must be 0..1');
    assert.ok(Array.isArray(ds.blockers), 'blockers must be array');
    assert.ok(Array.isArray(caseCtx.commitments), 'commitments must be array');
    assert.ok(Array.isArray(caseCtx.commitmentStates), 'commitmentStates must be array');
    assert.equal(caseCtx.commitments.length, caseCtx.commitmentStates.length, 'commitments mirror commitmentStates');
  }

  assert.ok(
    pov.cases.some((caseCtx) => caseCtx.commitments.length > 0),
    'At least one broker POV case should surface live commitments',
  );
  assert.ok(
    pov.cases.some((caseCtx) => caseCtx.decisionState.posture !== 'undecided'),
    'At least one broker POV case should have a non-undecided decision posture',
  );

  for (const dm of pov.decisionMoments) {
    assert.equal(typeof dm.id, 'string', 'dm.id must be string');
    assert.equal(typeof dm.label, 'string', 'dm.label must be string');
    assert.equal(typeof dm.trigger, 'string', 'dm.trigger must be string');
    assert.ok(['high', 'medium', 'low'].includes(dm.urgency), 'urgency must be valid');
  }

  const emptyCommitments: DecisionCommitment[] = [];
  assert.ok(Array.isArray(emptyCommitments), 'commitments type compiles');

  console.log('  [PASS] Decision types compile');
}

// ---------------------------------------------------------------------------
// 7. POV builders are pure (no GameState mutation)
// ---------------------------------------------------------------------------

function verifyBuildersArePure() {
  const world = buildWorld();
  const worldBefore = deepClone(world);
  const context = buildDecisionSupportContextFromLegacyState(world);
  const contextBefore = deepClone(context);

  buildBrokerPOVSnapshot(context);
  buildOwnerPOVSnapshot(context);

  assert.deepEqual(world.day, worldBefore.day, 'day must not change');
  assert.deepEqual(world.cases.length, worldBefore.cases.length, 'cases count must not change');
  assert.deepEqual(world.cases.map((c) => c.id), worldBefore.cases.map((c) => c.id), 'case ids must not change');
  assert.deepEqual(context.cases.length, contextBefore.cases.length, 'context cases must not change');

  console.log('  [PASS] Builders are pure');
}

// ---------------------------------------------------------------------------
// 8. Workspace projections are read-only
// ---------------------------------------------------------------------------

function verifyWorkspaceProjectionsReadOnly() {
  const world = buildWorld();
  const context = buildDecisionSupportContextFromLegacyState(world);
  const brokerPOV = buildBrokerPOVSnapshot(context);
  const ownerPOV = buildOwnerPOVSnapshot(context);

  const brokerWorkspace = buildBrokerPOVWorkspaceProjection(brokerPOV);
  const ownerWorkspace = buildOwnerPOVWorkspaceProjection(ownerPOV);

  assert.ok(Object.isFrozen(brokerWorkspace), 'broker workspace must be frozen');
  assert.equal(brokerWorkspace.readOnly, true, 'broker workspace readOnly');
  assert.equal(brokerWorkspace.projectionKind, 'broker_pov_adapter_state', 'broker projectionKind');

  assert.ok(Object.isFrozen(ownerWorkspace), 'owner workspace must be frozen');
  assert.equal(ownerWorkspace.readOnly, true, 'owner workspace readOnly');
  assert.equal(ownerWorkspace.projectionKind, 'owner_pov_adapter_state', 'owner projectionKind');

  assert.equal(typeof brokerWorkspace.caseCount, 'number', 'caseCount must be number');
  assert.equal(typeof brokerWorkspace.totalSignals, 'number', 'totalSignals must be number');
  assert.equal(typeof brokerWorkspace.energy, 'number', 'energy must be number');
  assert.ok(Array.isArray(brokerWorkspace.cases), 'cases must be array');
  assert.ok(Array.isArray(brokerWorkspace.actionCommandDrafts), 'drafts must be array');
  assert.ok(Array.isArray(brokerWorkspace.decisionMoments), 'moments must be array');

  for (const caseSummary of ownerWorkspace.cases) {
    assert.equal(caseSummary.d4, undefined, 'owner workspace case must NOT have d4');
    assert.equal(caseSummary.enabledDraftCount, 0, 'owner workspace must NOT have drafts');
  }

  console.log('  [PASS] Workspace projections read-only');
}

// ---------------------------------------------------------------------------
// 9. Boundary guard validation
// ---------------------------------------------------------------------------

function verifyBoundaryGuards() {
  const world = buildWorld();
  const context = buildDecisionSupportContextFromLegacyState(world);
  const brokerPOV = buildBrokerPOVSnapshot(context);
  const ownerPOV = buildOwnerPOVSnapshot(context);

  const brokerViolations = validateBrokerPOVBoundary(brokerPOV);
  assert.equal(brokerViolations.length, 0, `BrokerPOV should have 0 violations, got: ${JSON.stringify(brokerViolations)}`);

  const ownerViolations = validateOwnerPOVBoundary(ownerPOV);
  assert.equal(ownerViolations.length, 0, `OwnerPOV should have 0 violations, got: ${JSON.stringify(ownerViolations)}`);

  for (const caseCtx of brokerPOV.cases) {
    const violations = validateBrokerCaseBoundary(caseCtx);
    assert.equal(violations.length, 0, `Broker case ${caseCtx.caseId} violations: ${JSON.stringify(violations)}`);
  }

  for (const caseCtx of ownerPOV.cases) {
    const violations = validateOwnerCaseBoundary(caseCtx);
    assert.equal(violations.length, 0, `Owner case ${caseCtx.caseId} violations: ${JSON.stringify(violations)}`);
  }

  const allViolations = validateAllPOVBoundaries(brokerPOV, ownerPOV);
  assert.equal(allViolations.length, 0, `All POV violations: ${JSON.stringify(allViolations)}`);

  console.log('  [PASS] Boundary guards');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('Verifying selling-houses POV boundary contract...');

verifyBrokerPOVStructure();
verifyOwnerPOVBoundary();
verifyActionCommandDrafts();
verifyPressureGracefulDegradation();
verifyActorKnowledgeBoundary();
verifyDecisionTypesCompile();
verifyBuildersArePure();
verifyWorkspaceProjectionsReadOnly();
verifyBoundaryGuards();

console.log('selling-houses POV boundary verification passed');
