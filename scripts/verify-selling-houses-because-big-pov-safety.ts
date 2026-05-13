/**
 * verify-selling-houses-because-big-pov-safety
 *
 * Proves:
 * - Player only sees visible / inferred / relayed / observed summaries
 * - No full hidden shadow listing / customer / broker arrays exposed
 * - Causal refs bounded
 * - No raw GameState dumped
 */

import assert from 'node:assert/strict';
import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import {
  buildWorkspaceBigWorldModule,
  type BigWorldPOVSummary,
  type POVCausalRef,
} from '../src/selling-houses/application/projections/bigWorldPOVProjection.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildWorld() {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario');
  const world = createInitialState(snapshot, 20260501);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

function getAllCausalRefs(summary: BigWorldPOVSummary): POVCausalRef[] {
  const refs: POVCausalRef[] = [];
  refs.push(...summary.marketCell.refs);
  refs.push(...summary.comparableSupply.refs);
  for (const s of summary.comparableSupply.topSignals) refs.push(...s.refs);
  refs.push(...summary.demandMovement.refs);
  for (const s of summary.demandMovement.topSignals) refs.push(...s.refs);
  refs.push(...summary.ownerExpectation.refs);
  for (const s of summary.ownerExpectation.topSignals) refs.push(...s.refs);
  refs.push(...summary.brokerActionPressure.refs);
  for (const s of summary.brokerActionPressure.topSignals) refs.push(...s.refs);
  refs.push(...summary.becauseBigProof.safeCausalRefs);
  for (const e of summary.becauseBigProof.movementEvidence) refs.push(...e.refs);
  for (const r of summary.recommendedActionReasons) refs.push(...r.refs);
  // Deduplicate by refType+refId
  const seen = new Set<string>();
  return refs.filter((ref) => {
    const key = `${ref.refType}:${ref.refId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const VALID_REF_TYPES = new Set([
  'market-cell', 'rival-listing', 'rival-store', 'case', 'opportunity', 'market-signal', 'demand-segment',
]);

const VALID_SIGNAL_SOURCES = new Set(['systemic', 'observed', 'inferred', 'relayed']);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function testNoRawStateDumped() {
  const world = buildWorld();
  const caseId = world.cases.find((c) => c.status === 'active')?.id;
  assert.ok(caseId, 'Expected active case');

  const summary = buildWorkspaceBigWorldModule(world, caseId);
  assert.ok(summary, 'Expected summary');

  const serialized = JSON.stringify(summary);

  // Must not contain raw GameState fields
  const forbiddenKeys = [
    'rngState', 'rngCalls', 'budgetLedger', 'eventLog',
    'todayPlan', 'focusMeeting', 'marketOutcome',
    'runtimeBrokerOwnerRelations', 'runtimeOwnerCaseReadinessStates',
    'runtimeCustomerCaseMatches', 'runtimeBrokeredOpportunities',
    'runtimeConsensusFormations', 'runtimeContractFacts',
  ];

  for (const key of forbiddenKeys) {
    assert.ok(
      !serialized.includes(`"${key}"`),
      `Summary must not contain raw GameState field "${key}"`,
    );
  }

  console.log('  [PASS] no raw GameState dumped in summary');
}

function testNoHiddenArraysExposed() {
  const world = buildWorld();
  const caseId = world.cases.find((c) => c.status === 'active')?.id;
  assert.ok(caseId, 'Expected active case');

  const summary = buildWorkspaceBigWorldModule(world, caseId);
  assert.ok(summary, 'Expected summary');

  const serialized = JSON.stringify(summary);

  // Must not expose full arrays
  const forbiddenPatterns = [
    /"shadowListings"\s*:\s*\[/,
    /"shadowCustomers"\s*:\s*\[/,
    /"namedBrokers"\s*:\s*\[/,
    /"shadowBrokers"\s*:\s*\[/,
    /"acnProfiles"\s*:\s*\[/,
    /"listingPopulation"\s*:\s*\[/,
    /"demandField"\s*:\s*\[/,
  ];

  for (const pattern of forbiddenPatterns) {
    assert.ok(
      !pattern.test(serialized),
      `Summary must not expose hidden array: ${pattern}`,
    );
  }

  console.log('  [PASS] no hidden arrays exposed');
}

function testCausalRefsBounded() {
  const world = buildWorld();

  for (const caseItem of world.cases.filter((c) => c.status === 'active')) {
    const summary = buildWorkspaceBigWorldModule(world, caseItem.id);
    if (!summary) continue;

    const allRefs = getAllCausalRefs(summary);

    // Total refs bounded
    assert.ok(
      allRefs.length <= 20,
      `Case ${caseItem.title}: total causal refs ${allRefs.length} exceeds 20`,
    );

    // All refs have valid types
    for (const ref of allRefs) {
      assert.ok(
        VALID_REF_TYPES.has(ref.refType),
        `Invalid refType: ${ref.refType}`,
      );
      assert.ok(ref.refId.length > 0, 'refId must not be empty');
      assert.ok(ref.refLabel.length > 0, 'refLabel must not be empty');
    }
  }

  console.log('  [PASS] causal refs bounded and valid');
}

function testSignalSourcesOnlyVisible() {
  const world = buildWorld();
  const caseId = world.cases.find((c) => c.status === 'active')?.id;
  assert.ok(caseId, 'Expected active case');

  const summary = buildWorkspaceBigWorldModule(world, caseId);
  assert.ok(summary, 'Expected summary');

  const allSignals = [
    ...summary.comparableSupply.topSignals,
    ...summary.demandMovement.topSignals,
    ...summary.ownerExpectation.topSignals,
    ...summary.brokerActionPressure.topSignals,
  ];

  for (const signal of allSignals) {
    assert.ok(
      VALID_SIGNAL_SOURCES.has(signal.source),
      `Invalid signal source: ${signal.source}`,
    );
  }

  console.log('  [PASS] signal sources are only visible/inferred/relayed/observed');
}

function testPurityDeterminism() {
  const world = buildWorld();
  const caseId = world.cases.find((c) => c.status === 'active')?.id;
  assert.ok(caseId, 'Expected active case');

  const s1 = buildWorkspaceBigWorldModule(world, caseId);
  const s2 = buildWorkspaceBigWorldModule(world, caseId);

  assert.deepEqual(s1, s2, 'Same inputs must produce identical output (purity)');
  console.log('  [PASS] projection is pure and deterministic');
}

function testNoGameStateMutation() {
  const world = buildWorld();
  const caseId = world.cases.find((c) => c.status === 'active')?.id;
  assert.ok(caseId, 'Expected active case');

  const before = JSON.stringify(world);
  buildWorkspaceBigWorldModule(world, caseId);
  const after = JSON.stringify(world);

  assert.equal(before, after, 'Projection must not mutate GameState');
  console.log('  [PASS] projection does not mutate GameState');
}

function testBrokerPOVDoesNotLeakGlobalTruth() {
  const world = buildWorld();
  const caseId = world.cases.find((c) => c.status === 'active')?.id;
  assert.ok(caseId, 'Expected active case');

  const summary = buildWorkspaceBigWorldModule(world, caseId);
  assert.ok(summary, 'Expected summary');

  const serialized = JSON.stringify(summary);

  // Broker POV should NOT dump all rival stores globally
  // It should only reference stores by district-focus filtering
  const allStoreIds = world.marketShadow.rivalStores.map((s) => s.id);
  const referencedStoreIds = new Set<string>();
  for (const signal of summary.brokerActionPressure.topSignals) {
    for (const ref of signal.refs) {
      if (ref.refType === 'rival-store') referencedStoreIds.add(ref.refId);
    }
  }
  // Every referenced store must exist in the world (sanity check)
  for (const id of referencedStoreIds) {
    assert.ok(
      allStoreIds.includes(id),
      `Referenced rival store ${id} does not exist in world`,
    );
  }
  // The projection should not contain the full rival store array
  assert.ok(
    !serialized.includes('"pricingPressurePower"'),
    'Broker POV must not leak raw rival store internals like pricingPressurePower',
  );
  assert.ok(
    !serialized.includes('"leadCapturePower"'),
    'Broker POV must not leak raw rival store internals like leadCapturePower',
  );

  console.log('  [PASS] broker POV does not leak global truth');
}

function testDemandMovementFilteredByCaseRelation() {
  const world = buildWorld();

  // Find a case with very few direct customers
  const caseItem = world.cases.find((c) => c.status === 'active');
  assert.ok(caseItem, 'Expected active case');

  const directCustomerCount = world.customerStates.filter(
    (cs) => cs.activeCaseIds.includes(caseItem.id),
  ).length;

  const summary = buildWorkspaceBigWorldModule(world, caseItem.id);
  assert.ok(summary, 'Expected summary');

  // activeCustomerCount should not exceed all customers in the world
  // (it should be a subset scoped to the case)
  assert.ok(
    summary.demandMovement.activeCustomerCount <= world.customerStates.length,
    'activeCustomerCount must not exceed total customer count',
  );

  // With the fix, directCustomerCount should equal or be close to the reported count
  // (indirect customers from same-cell revealed opportunities may add some)
  assert.ok(
    summary.demandMovement.activeCustomerCount >= directCustomerCount,
    `activeCustomerCount ${summary.demandMovement.activeCustomerCount} should be >= direct customers ${directCustomerCount}`,
  );

  console.log(`  [PASS] demand movement filtered by case relation (direct=${directCustomerCount}, reported=${summary.demandMovement.activeCustomerCount})`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

console.log('\n=== Because-Big POV Safety Verification ===\n');

testNoRawStateDumped();
testNoHiddenArraysExposed();
testCausalRefsBounded();
testSignalSourcesOnlyVisible();
testPurityDeterminism();
testNoGameStateMutation();
testBrokerPOVDoesNotLeakGlobalTruth();
testDemandMovementFilteredByCaseRelation();

console.log('\n=== All POV safety checks passed ===\n');
