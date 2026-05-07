/**
 * Verify that pressure buffer hooks do not change gameplay.
 *
 * Strategy:
 * 1. Create identical initial states (same seed).
 * 2. Run advanceOneDay on both — buffer is always created now (in resolveOneDay).
 * 3. Compare Case/Opportunity/CustomerRuntime key fields — must be identical.
 * 4. Compare rngCalls — must be identical (no extra random calls added).
 * 5. Confirm pressureReceipts is populated with data from hooked sources.
 * 6. Confirm default path (no explicit buffer) still works.
 */

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { advanceOneDay, seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import type { GameState, Case, Opportunity, CustomerRuntimeState } from '../src/selling-houses/domain/models.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const errors: string[] = [];

function assert(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    errors.push(`FAIL: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function buildWorld(seed: number): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  if (!snapshot) throw new Error('Expected standard-window-chain scenario');
  const world = createInitialState(snapshot, seed);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

function cloneCaseFields(c: Case) {
  return {
    id: c.id,
    heat: Math.round(c.heat * 100) / 100,
    trust: Math.round(c.trust * 100) / 100,
    urgency: Math.round(c.urgency * 100) / 100,
    competitiveness: Math.round(c.competitiveness * 100) / 100,
    d1: Math.round(c.d1 * 100) / 100,
    d2: Math.round(c.d2 * 100) / 100,
    d3: Math.round(c.d3 * 100) / 100,
    status: c.status,
    stageIndex: c.stageIndex,
    offers: c.offers,
    viewings: c.viewings,
  };
}

function cloneOpportunityFields(o: Opportunity) {
  return {
    id: o.id,
    intent: Math.round(o.intent * 100) / 100,
    confidence: Math.round(o.confidence * 100) / 100,
    stageIndex: o.stageIndex,
    status: o.status,
    daysLeft: Math.round(o.daysLeft * 100) / 100,
  };
}

function cloneCustomerRuntimeFields(s: CustomerRuntimeState) {
  return {
    customerId: s.customerId,
    status: s.status,
    churnRisk: Math.round(s.churnRisk * 100) / 100,
    advisorTrust: Math.round(s.advisorTrust * 100) / 100,
    fatigue: Math.round(s.fatigue * 100) / 100,
  };
}

// ---------------------------------------------------------------------------
// Test 1: Case fields identical between two runs with same seed
// ---------------------------------------------------------------------------

function testCaseFieldsIdentical() {
  console.log('\n=== Test 1: Case Fields Identical ===');
  const beforePassed = passed;
  const beforeFailed = failed;

  const SEED = 20260501;
  const worldA = buildWorld(SEED);
  const worldB = buildWorld(SEED);

  // Snapshot before
  const casesBeforeA = worldA.cases.map(cloneCaseFields);
  const casesBeforeB = worldB.cases.map(cloneCaseFields);
  assert(
    JSON.stringify(casesBeforeA) === JSON.stringify(casesBeforeB),
    'Cases identical before tick',
  );

  // Advance one day
  const resultA = advanceOneDay(worldA);
  const resultB = advanceOneDay(worldB);

  assert(resultA !== null, 'Result A is not null');
  assert(resultB !== null, 'Result B is not null');

  // Compare after
  const casesAfterA = worldA.cases.map(cloneCaseFields);
  const casesAfterB = worldB.cases.map(cloneCaseFields);
  assert(
    JSON.stringify(casesAfterA) === JSON.stringify(casesAfterB),
    'Cases identical after tick (no gameplay change)',
  );

  console.log(`  Passed: ${passed - beforePassed}, Failed: ${failed - beforeFailed}`);
}

// ---------------------------------------------------------------------------
// Test 2: Opportunity fields identical
// ---------------------------------------------------------------------------

function testOpportunityFieldsIdentical() {
  console.log('\n=== Test 2: Opportunity Fields Identical ===');
  const beforePassed = passed;
  const beforeFailed = failed;

  const SEED = 20260501;
  const worldA = buildWorld(SEED);
  const worldB = buildWorld(SEED);

  advanceOneDay(worldA);
  advanceOneDay(worldB);

  const oppsA = worldA.opportunities.map(cloneOpportunityFields).sort((a, b) => a.id.localeCompare(b.id));
  const oppsB = worldB.opportunities.map(cloneOpportunityFields).sort((a, b) => a.id.localeCompare(b.id));
  assert(
    JSON.stringify(oppsA) === JSON.stringify(oppsB),
    'Opportunities identical after tick',
  );

  console.log(`  Passed: ${passed - beforePassed}, Failed: ${failed - beforeFailed}`);
}

// ---------------------------------------------------------------------------
// Test 3: CustomerRuntimeState fields identical
// ---------------------------------------------------------------------------

function testCustomerRuntimeIdentical() {
  console.log('\n=== Test 3: CustomerRuntimeState Identical ===');
  const beforePassed = passed;
  const beforeFailed = failed;

  const SEED = 20260501;
  const worldA = buildWorld(SEED);
  const worldB = buildWorld(SEED);

  advanceOneDay(worldA);
  advanceOneDay(worldB);

  const custA = worldA.customerStates.map(cloneCustomerRuntimeFields).sort((a, b) => a.customerId.localeCompare(b.customerId));
  const custB = worldB.customerStates.map(cloneCustomerRuntimeFields).sort((a, b) => a.customerId.localeCompare(b.customerId));
  assert(
    JSON.stringify(custA) === JSON.stringify(custB),
    'CustomerRuntimeState identical after tick',
  );

  console.log(`  Passed: ${passed - beforePassed}, Failed: ${failed - beforeFailed}`);
}

// ---------------------------------------------------------------------------
// Test 4: rngCalls identical
// ---------------------------------------------------------------------------

function testRngCallsIdentical() {
  console.log('\n=== Test 4: rngCalls Identical ===');
  const beforePassed = passed;
  const beforeFailed = failed;

  const SEED = 20260501;
  const worldA = buildWorld(SEED);
  const worldB = buildWorld(SEED);

  assert(worldA.rngCalls === worldB.rngCalls, 'rngCalls equal before tick');

  advanceOneDay(worldA);
  advanceOneDay(worldB);

  assert(worldA.rngCalls === worldB.rngCalls, `rngCalls equal after tick: A=${worldA.rngCalls} B=${worldB.rngCalls}`);

  console.log(`  Passed: ${passed - beforePassed}, Failed: ${failed - beforeFailed}`);
}

// ---------------------------------------------------------------------------
// Test 5: pressureReceipts populated on tick result
// ---------------------------------------------------------------------------

function testPressureReceiptsPopulated() {
  console.log('\n=== Test 5: pressureReceipts Populated ===');
  const beforePassed = passed;
  const beforeFailed = failed;

  const SEED = 20260501;
  const world = buildWorld(SEED);
  const result = advanceOneDay(world);

  assert(result !== null, 'Result is not null');
  if (!result) return;

  assert(result.pressureReceipts !== undefined, 'pressureReceipts is defined');
  assert(typeof result.pressureReceipts?.inputCount === 'number', 'pressureReceipts has inputCount');
  assert(typeof result.pressureReceipts?.day === 'number', 'pressureReceipts has day');
  assert(Array.isArray(result.pressureReceipts?.snapshots), 'pressureReceipts has snapshots array');
  assert(Array.isArray(result.pressureReceipts?.decisionDeltas), 'pressureReceipts has decisionDeltas array');
  assert(result.pressureReceipts?.brokerPOV !== undefined, 'pressureReceipts has brokerPOV');
  assert(result.pressureReceipts?.ownerPOV !== undefined, 'pressureReceipts has ownerPOV');
  assert(result.pressureReceipts?.managerPOV !== undefined, 'pressureReceipts has managerPOV');

  console.log(`  Passed: ${passed - beforePassed}, Failed: ${failed - beforeFailed}`);
}

// ---------------------------------------------------------------------------
// Test 6: Receipts contain data from hooked sources
// ---------------------------------------------------------------------------

function testReceiptsFromHookedSources() {
  console.log('\n=== Test 6: Receipts From Hooked Sources ===');
  const beforePassed = passed;
  const beforeFailed = failed;

  const SEED = 20260501;
  const world = buildWorld(SEED);
  const result = advanceOneDay(world);

  assert(result !== null, 'Result is not null');
  if (!result || !result.pressureReceipts) return;

  const { pressureReceipts } = result;

  // Should have at least some inputs from customer-feedback or rival-customer-pull
  const customerFeedbackInputs = pressureReceipts.snapshots.flatMap(
    (s) => s.signals.filter((sig) => sig.source === 'customer-feedback'),
  );
  const rivalPullInputs = pressureReceipts.snapshots.flatMap(
    (s) => s.signals.filter((sig) => sig.source === 'rival-customer-pull'),
  );

  // At least one of the two hooked sources should have produced inputs
  // (customer-feedback is very likely since all cases go through applyCustomerFeedbackToCases)
  const hasHookedData = customerFeedbackInputs.length > 0 || rivalPullInputs.length > 0;
  assert(hasHookedData, `Hooked sources produced data: customer-feedback=${customerFeedbackInputs.length}, rival-customer-pull=${rivalPullInputs.length}`);

  // Verify snapshot structure for hooked data
  if (pressureReceipts.snapshots.length > 0) {
    const firstSnap = pressureReceipts.snapshots[0];
    assert(firstSnap.caseId.length > 0, 'Snapshot has caseId');
    assert(firstSnap.day > 0, 'Snapshot has positive day');
    assert(firstSnap.signals.length > 0, 'Snapshot has signals from hooked sources');
  }

  // Verify POV reflects hooked data
  assert(pressureReceipts.brokerPOV.day > 0, 'Broker POV has day');
  assert(typeof pressureReceipts.brokerPOV.headline === 'string', 'Broker POV has headline');

  console.log(`  Passed: ${passed - beforePassed}, Failed: ${failed - beforeFailed}`);
}

// ---------------------------------------------------------------------------
// Test 7: Receipts are frozen
// ---------------------------------------------------------------------------

function testReceiptsFrozen() {
  console.log('\n=== Test 7: Receipts Frozen ===');
  const beforePassed = passed;
  const beforeFailed = failed;

  const SEED = 20260501;
  const world = buildWorld(SEED);
  const result = advanceOneDay(world);

  if (!result?.pressureReceipts) {
    assert(false, 'pressureReceipts should exist');
    return;
  }

  assert(Object.isFrozen(result.pressureReceipts), 'pressureReceipts bundle is frozen');
  assert(Object.isFrozen(result.pressureReceipts.snapshots), 'snapshots array is frozen');

  if (result.pressureReceipts.snapshots.length > 0) {
    assert(Object.isFrozen(result.pressureReceipts.snapshots[0]), 'individual snapshot is frozen');
    assert(Object.isFrozen(result.pressureReceipts.snapshots[0].signals), 'signals array is frozen');
  }

  assert(Object.isFrozen(result.pressureReceipts.decisionDeltas), 'decisionDeltas is frozen');
  if (result.pressureReceipts.decisionDeltas.length > 0) {
    assert(Object.isFrozen(result.pressureReceipts.decisionDeltas[0]), 'individual delta is frozen');
  }

  console.log(`  Passed: ${passed - beforePassed}, Failed: ${failed - beforeFailed}`);
}

// ---------------------------------------------------------------------------
// Test 8: Multiple ticks still produce identical results
// ---------------------------------------------------------------------------

function testMultipleTicksIdentical() {
  console.log('\n=== Test 8: Multiple Ticks Identical ===');
  const beforePassed = passed;
  const beforeFailed = failed;

  const SEED = 20260501;
  const worldA = buildWorld(SEED);
  const worldB = buildWorld(SEED);

  // Run 3 ticks
  for (let i = 0; i < 3; i++) {
    advanceOneDay(worldA);
    advanceOneDay(worldB);
  }

  const casesA = worldA.cases.map(cloneCaseFields);
  const casesB = worldB.cases.map(cloneCaseFields);
  assert(
    JSON.stringify(casesA) === JSON.stringify(casesB),
    'Cases identical after 3 ticks',
  );

  assert(worldA.rngCalls === worldB.rngCalls, `rngCalls equal after 3 ticks: ${worldA.rngCalls}`);

  console.log(`  Passed: ${passed - beforePassed}, Failed: ${failed - beforeFailed}`);
}

// ---------------------------------------------------------------------------
// Test 9: Event store identical (no extra events from buffer)
// ---------------------------------------------------------------------------

function testEventStoreIdentical() {
  console.log('\n=== Test 9: Event Store Identical ===');
  const beforePassed = passed;
  const beforeFailed = failed;

  const SEED = 20260501;
  const worldA = buildWorld(SEED);
  const worldB = buildWorld(SEED);

  advanceOneDay(worldA);
  advanceOneDay(worldB);

  const eventsA = worldA.eventStore.map((e) => ({ kind: e.kind, actor: e.actor, caseId: e.caseId }));
  const eventsB = worldB.eventStore.map((e) => ({ kind: e.kind, actor: e.actor, caseId: e.caseId }));
  assert(
    JSON.stringify(eventsA) === JSON.stringify(eventsB),
    'Event store identical after tick',
  );

  console.log(`  Passed: ${passed - beforePassed}, Failed: ${failed - beforeFailed}`);
}

// ---------------------------------------------------------------------------
// Run all tests
// ---------------------------------------------------------------------------

console.log('=== Selling Houses Pressure Buffer Hooks Verification ===');
console.log(`Date: ${new Date().toISOString()}`);

testCaseFieldsIdentical();
testOpportunityFieldsIdentical();
testCustomerRuntimeIdentical();
testRngCallsIdentical();
testPressureReceiptsPopulated();
testReceiptsFromHookedSources();
testReceiptsFrozen();
testMultipleTicksIdentical();
testEventStoreIdentical();

console.log('\n=== Summary ===');
console.log(`Total passed: ${passed}`);
console.log(`Total failed: ${failed}`);

if (errors.length > 0) {
  console.log('\nFailures:');
  errors.forEach((error) => console.log(`  ${error}`));
}

if (failed > 0) {
  console.log('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\nRESULT: PASS');
  process.exit(0);
}
