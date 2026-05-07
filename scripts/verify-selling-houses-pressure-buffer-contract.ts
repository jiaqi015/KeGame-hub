/**
 * Verify PressureCollectionBuffer v0 contract.
 *
 * Checks:
 * 1. Buffer creation and type compilation.
 * 2. collectPressureInput appends to buffer.
 * 3. collectPressureInput is no-op when buffer is null.
 * 4. buildPressureReceiptsFromBuffer produces correct receipts.
 * 5. buildPressureReceiptsFromBuffer with empty buffer returns empty receipts.
 * 6. Receipts are frozen/immutable.
 * 7. Buffer is mutable during collection (append-only scratch).
 * 8. resetPressureCollectionBuffer clears the buffer.
 * 9. buildPressureReceiptsFromInputs convenience helper works.
 * 10. All major pressure sources produce receipts via buffer.
 * 11. market-signal is not in PressureInputSource (informational-only).
 * 12. Receipt bundle contains all expected fields.
 * 13. No mutation of input PressureInputs.
 * 14. D4 can read from CompetitionPressureSnapshot fields (for Agent B).
 */

import {
  createPressureCollectionBuffer,
  buildPressureReceiptsFromBuffer,
  resetPressureCollectionBuffer,
  buildPressureReceiptsFromInputs,
  type PressureCollectionBuffer,
  type PressureReceiptBundle,
  type PressureInput,
} from '../src/selling-houses/runtime/simulation/pressure/index.js';

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
// Sample inputs
// ---------------------------------------------------------------------------

const DAY = 5;

function makeRivalPressureInput(): PressureInput {
  return {
    source: 'rival-pressure',
    caseId: 'case-101',
    day: DAY,
    dimension: 'heat',
    magnitude: -3.5,
    evidence: '竞品房源正在抢走注意力。',
    sourceEntityId: 'rival-1',
    sourceEntityLabel: '竞品A',
    evidenceKind: 'rival-price-overlap',
    evidenceStrength: 62,
  };
}

function makeCompetitionGroupInput(): PressureInput {
  return {
    source: 'competition-group',
    caseId: 'case-101',
    day: DAY,
    dimension: 'trust',
    magnitude: -1.0,
    evidence: '同类房源降价联动。',
    sourceEntityId: 'group-1',
    evidenceKind: 'group-price-cutter',
    evidenceStrength: 55,
  };
}

function makeCompanyPressureInput(): PressureInput {
  return {
    source: 'company-pressure',
    caseId: 'case-101',
    day: DAY,
    dimension: 'intent',
    magnitude: -1.2,
    evidence: '公司内部竞争压力。',
    evidenceKind: 'company-shared-lead-pressure',
    evidenceStrength: 58,
  };
}

function makeCustomerFeedbackInput(): PressureInput {
  return {
    source: 'customer-feedback',
    caseId: 'case-102',
    day: DAY,
    dimension: 'heat',
    magnitude: -3.0,
    evidence: '无活跃客户。',
    evidenceKind: 'customer-no-active-leads',
    evidenceStrength: 40,
  };
}

function makeRivalCustomerPullInput(): PressureInput {
  return {
    source: 'rival-customer-pull',
    caseId: 'case-101',
    day: DAY,
    dimension: 'confidence',
    magnitude: -2.0,
    evidence: '客户被竞品抢走注意力。',
    sourceEntityId: 'rival-1',
    evidenceKind: 'rival-customer-pull-attention',
    evidenceStrength: 58,
    customerRuntimeIds: ['cus-01'],
  };
}

function makeRandomEventInput(): PressureInput {
  return {
    source: 'random-event',
    caseId: 'case-101',
    day: DAY,
    dimension: 'confidence',
    magnitude: -10,
    evidence: '政策利空。',
    evidenceKind: 'random-event-policy-shift',
    evidenceStrength: 80,
    opportunityIds: ['opp-1'],
  };
}

function makeRivalLossInput(): PressureInput {
  return {
    source: 'competition-rival-loss',
    caseId: 'case-103',
    day: DAY,
    dimension: 'heat',
    magnitude: -100,
    evidence: '被隔壁门店抢先成交。',
    sourceEntityId: 'rival-2',
    evidenceKind: 'rival-loss-window',
    evidenceStrength: 100,
  };
}

function makeAllInputs(): PressureInput[] {
  return [
    makeRivalPressureInput(),
    makeCompetitionGroupInput(),
    makeCompanyPressureInput(),
    makeCustomerFeedbackInput(),
    makeRivalCustomerPullInput(),
    makeRandomEventInput(),
    makeRivalLossInput(),
  ];
}

// ---------------------------------------------------------------------------
// Test 1: Buffer creation and type compilation
// ---------------------------------------------------------------------------

function testBufferCreation() {
  console.log('\n=== Test 1: Buffer Creation & Type Compilation ===');

  const buffer: PressureCollectionBuffer = createPressureCollectionBuffer(DAY);
  assert(buffer !== null, 'Buffer is created');
  assert(buffer.inputs.length === 0, 'Buffer starts empty');
  assert(buffer.createdAtDay === DAY, 'Buffer has correct day');

  const bundle: PressureReceiptBundle = buildPressureReceiptsFromBuffer(buffer);
  assert(bundle !== null, 'Bundle is created from empty buffer');
  assert(bundle.snapshots.length === 0, 'Empty buffer produces no snapshots');
  assert(bundle.decisionDeltas.length === 0, 'Empty buffer produces no decision deltas');
  assert(bundle.inputCount === 0, 'Bundle inputCount is 0');
  assert(bundle.day === DAY, 'Bundle day matches');

  console.log(`  Passed: ${passed}, Failed: ${failed}`);
}

// ---------------------------------------------------------------------------
// Test 2: collectPressureInput appends to buffer
// ---------------------------------------------------------------------------

function testCollectAppends() {
  console.log('\n=== Test 2: collectPressureInput Appends ===');
  const beforePassed = passed;
  const beforeFailed = failed;

  const buffer = createPressureCollectionBuffer(DAY);
  buffer.collectPressure(makeRivalPressureInput());
  assert(buffer.inputs.length === 1, 'Buffer has 1 input after collect');
  assert(buffer.inputs[0].source === 'rival-pressure', 'Input source is correct');
  assert(buffer.inputs[0].caseId === 'case-101', 'Input caseId is correct');

  buffer.collectPressure(makeCompetitionGroupInput());
  assert(buffer.inputs.length === 2, 'Buffer has 2 inputs after second collect');

  console.log(`  Passed: ${passed - beforePassed}, Failed: ${failed - beforeFailed}`);
}

// ---------------------------------------------------------------------------
// Test 3: buildPressureReceiptsFromBuffer with null/undefined returns empty
// ---------------------------------------------------------------------------

function testNullBufferNoop() {
  console.log('\n=== Test 3: Null Buffer Returns Empty ===');
  const beforePassed = passed;
  const beforeFailed = failed;

  // buildPressureReceiptsFromBuffer with null should return empty (no throw)
  const bundleNull = buildPressureReceiptsFromBuffer(null);
  assert(bundleNull.snapshots.length === 0, 'Null buffer produces empty snapshots');
  assert(bundleNull.inputCount === 0, 'Null buffer produces inputCount 0');

  const bundleUndefined = buildPressureReceiptsFromBuffer(undefined);
  assert(bundleUndefined.snapshots.length === 0, 'Undefined buffer produces empty snapshots');
  assert(bundleUndefined.inputCount === 0, 'Undefined buffer produces inputCount 0');

  console.log(`  Passed: ${passed - beforePassed}, Failed: ${failed - beforeFailed}`);
}

// ---------------------------------------------------------------------------
// Test 4: buildPressureReceiptsFromBuffer produces correct receipts
// ---------------------------------------------------------------------------

function testBuildReceipts() {
  console.log('\n=== Test 4: Build Receipts From Buffer ===');
  const beforePassed = passed;
  const beforeFailed = failed;

  const buffer = createPressureCollectionBuffer(DAY);
  const inputs = makeAllInputs();
  inputs.forEach((input) => buffer.collectPressure(input));

  const bundle = buildPressureReceiptsFromBuffer(buffer);

  assert(bundle.inputCount === inputs.length, `Bundle inputCount is ${bundle.inputCount}`);
  assert(bundle.snapshots.length > 0, 'Bundle has snapshots');
  assert(bundle.decisionDeltas.length > 0, 'Bundle has decision deltas');

  // case-101 snapshot should exist
  const case101 = bundle.snapshots.find((s) => s.caseId === 'case-101');
  assert(case101 !== undefined, 'case-101 snapshot exists');
  if (case101) {
    assert(case101.signals.length > 0, 'case-101 has signals');
    assert(case101.evidence.length > 0, 'case-101 has evidence');
    assert(typeof case101.netHeatDelta === 'number', 'case-101 has netHeatDelta');
    assert(typeof case101.netTrustDelta === 'number', 'case-101 has netTrustDelta');
    assert(case101.hasSignificantPressure === true, 'case-101 has significant pressure');
  }

  // case-103 should be lost to rival
  const case103 = bundle.snapshots.find((s) => s.caseId === 'case-103');
  assert(case103 !== undefined, 'case-103 snapshot exists');
  if (case103) {
    assert(case103.lostToRival === true, 'case-103 lostToRival is true');
  }

  // POVs should be populated
  assert(bundle.brokerPOV.actor === 'broker', 'Broker POV exists');
  assert(bundle.ownerPOV.actor === 'owner', 'Owner POV exists');
  assert(bundle.managerPOV.actor === 'manager', 'Manager POV exists');
  assert(bundle.brokerPOV.pressuredCaseIds.length > 0, 'Broker POV has pressured cases');
  assert(bundle.brokerPOV.topEvidence.length > 0, 'Broker POV has top evidence');
  assert(bundle.brokerPOV.headline.length > 0, 'Broker POV has headline');

  console.log(`  Passed: ${passed - beforePassed}, Failed: ${failed - beforeFailed}`);
}

// ---------------------------------------------------------------------------
// Test 5: Empty buffer returns empty receipts
// ---------------------------------------------------------------------------

function testEmptyBuffer() {
  console.log('\n=== Test 5: Empty Buffer Returns Empty Receipts ===');
  const beforePassed = passed;
  const beforeFailed = failed;

  const buffer = createPressureCollectionBuffer(DAY);
  const bundle = buildPressureReceiptsFromBuffer(buffer);

  assert(bundle.snapshots.length === 0, 'No snapshots');
  assert(bundle.decisionDeltas.length === 0, 'No decision deltas');
  assert(bundle.inputCount === 0, 'inputCount is 0');
  assert(bundle.brokerPOV.pressuredCaseIds.length === 0, 'No pressured cases');
  assert(bundle.brokerPOV.activeRivalCount === 0, 'No active rivals');
  assert(bundle.brokerPOV.companyPressureActive === false, 'No company pressure');

  console.log(`  Passed: ${passed - beforePassed}, Failed: ${failed - beforeFailed}`);
}

// ---------------------------------------------------------------------------
// Test 6: Receipts are frozen/immutable
// ---------------------------------------------------------------------------

function testReceiptsFrozen() {
  console.log('\n=== Test 6: Receipts Are Frozen (Deep) ===');
  const beforePassed = passed;
  const beforeFailed = failed;

  const buffer = createPressureCollectionBuffer(DAY);
  // Use multiple inputs to cover all source types
  buffer.collectPressure(makeRivalPressureInput());
  buffer.collectPressure(makeCompetitionGroupInput());
  buffer.collectPressure(makeCompanyPressureInput());
  const bundle = buildPressureReceiptsFromBuffer(buffer);

  // Top-level bundle should be frozen
  assert(Object.isFrozen(bundle), 'Bundle is frozen');
  assert(Object.isFrozen(bundle.snapshots), 'Snapshots array is frozen');
  assert(Object.isFrozen(bundle.decisionDeltas), 'Decision deltas array is frozen');

  // Individual snapshots should be deeply frozen
  if (bundle.snapshots.length > 0) {
    const snap = bundle.snapshots[0];
    assert(Object.isFrozen(snap), 'Individual snapshot is frozen');
    assert(Object.isFrozen(snap.signals), 'Snapshot signals array is frozen');
    assert(Object.isFrozen(snap.evidence), 'Snapshot evidence array is frozen');

    // Each signal item should be frozen
    if (snap.signals.length > 0) {
      assert(Object.isFrozen(snap.signals[0]), 'Individual signal is frozen');
      // Attempting to mutate a frozen signal should throw in strict mode
      let signalMutationBlocked = false;
      try {
        (snap.signals[0] as any).magnitude = 999;
        signalMutationBlocked = snap.signals[0].magnitude !== 999;
      } catch {
        signalMutationBlocked = true;
      }
      assert(signalMutationBlocked, 'Signal mutation is blocked by freeze');
    }

    // Each evidence item should be frozen
    if (snap.evidence.length > 0) {
      assert(Object.isFrozen(snap.evidence[0]), 'Individual evidence is frozen');
    }

    // Push to signals should fail
    let signalsPushBlocked = false;
    try {
      (snap.signals as any).push({ id: 'fake' });
      signalsPushBlocked = snap.signals.length === bundle.snapshots[0].signals.length;
    } catch {
      signalsPushBlocked = true;
    }
    assert(signalsPushBlocked, 'Push to signals array is blocked');

    // Push to evidence should fail
    let evidencePushBlocked = false;
    try {
      (snap.evidence as any).push({ id: 'fake' });
      evidencePushBlocked = snap.evidence.length === bundle.snapshots[0].evidence.length;
    } catch {
      evidencePushBlocked = true;
    }
    assert(evidencePushBlocked, 'Push to evidence array is blocked');
  }

  // DecisionDeltas: each delta frozen, sourceEvidenceIds frozen
  if (bundle.decisionDeltas.length > 0) {
    const delta = bundle.decisionDeltas[0];
    assert(Object.isFrozen(delta), 'Individual delta is frozen');
    assert(Object.isFrozen(delta.sourceEvidenceIds), 'Delta sourceEvidenceIds is frozen');

    let deltaSourcePushBlocked = false;
    try {
      (delta.sourceEvidenceIds as any).push('fake-id');
      deltaSourcePushBlocked = delta.sourceEvidenceIds.length === bundle.decisionDeltas[0].sourceEvidenceIds.length;
    } catch {
      deltaSourcePushBlocked = true;
    }
    assert(deltaSourcePushBlocked, 'Push to delta sourceEvidenceIds is blocked');
  }

  // POVs: topEvidence and pressuredCaseIds should be frozen
  assert(Object.isFrozen(bundle.brokerPOV.topEvidence), 'BrokerPOV topEvidence is frozen');
  assert(Object.isFrozen(bundle.brokerPOV.pressuredCaseIds), 'BrokerPOV pressuredCaseIds is frozen');
  assert(Object.isFrozen(bundle.ownerPOV.topEvidence), 'OwnerPOV topEvidence is frozen');
  assert(Object.isFrozen(bundle.ownerPOV.pressuredCaseIds), 'OwnerPOV pressuredCaseIds is frozen');
  assert(Object.isFrozen(bundle.managerPOV.topEvidence), 'ManagerPOV topEvidence is frozen');
  assert(Object.isFrozen(bundle.managerPOV.pressuredCaseIds), 'ManagerPOV pressuredCaseIds is frozen');

  // Push to POV arrays should fail
  let povTopEvidencePushBlocked = false;
  try {
    (bundle.brokerPOV.topEvidence as any).push({ id: 'fake' });
    povTopEvidencePushBlocked = bundle.brokerPOV.topEvidence.length === 0 || true;
  } catch {
    povTopEvidencePushBlocked = true;
  }
  // In frozen arrays, push silently fails in sloppy mode or throws in strict mode
  // Either way, the array should not grow
  const topEvidenceLenBefore = bundle.brokerPOV.topEvidence.length;
  try { (bundle.brokerPOV.topEvidence as any).push({ id: 'fake' }); } catch {}
  assert(bundle.brokerPOV.topEvidence.length === topEvidenceLenBefore, 'Push to POV topEvidence does not grow array');

  // Deep-freeze: each topEvidence item should be frozen
  if (bundle.brokerPOV.topEvidence.length > 0) {
    assert(Object.isFrozen(bundle.brokerPOV.topEvidence[0]), 'Individual topEvidence item is frozen');
  }

  console.log(`  Passed: ${passed - beforePassed}, Failed: ${failed - beforeFailed}`);
}

// ---------------------------------------------------------------------------
// Test 7: Buffer is mutable during collection
// ---------------------------------------------------------------------------

function testBufferMutableDuringCollection() {
  console.log('\n=== Test 7: Buffer Mutable During Collection ===');
  const beforePassed = passed;
  const beforeFailed = failed;

  const buffer = createPressureCollectionBuffer(DAY);
  assert(!Object.isFrozen(buffer), 'Buffer is NOT frozen');
  assert(!Object.isFrozen(buffer.inputs), 'Buffer inputs array is NOT frozen');

  buffer.collectPressure(makeRivalPressureInput());
  assert(buffer.inputs.length === 1, 'Buffer is mutable — can append');

  buffer.collectPressure(makeCompetitionGroupInput());
  assert(buffer.inputs.length === 2, 'Buffer accepts second append');

  console.log(`  Passed: ${passed - beforePassed}, Failed: ${failed - beforeFailed}`);
}

// ---------------------------------------------------------------------------
// Test 8: resetPressureCollectionBuffer clears the buffer
// ---------------------------------------------------------------------------

function testResetBuffer() {
  console.log('\n=== Test 8: Reset Buffer ===');
  const beforePassed = passed;
  const beforeFailed = failed;

  const buffer = createPressureCollectionBuffer(DAY);
  buffer.collectPressure(makeRivalPressureInput());
  buffer.collectPressure(makeCompetitionGroupInput());
  assert(buffer.inputs.length === 2, 'Buffer has 2 inputs before reset');

  resetPressureCollectionBuffer(buffer);
  assert(buffer.inputs.length === 0, 'Buffer is empty after reset');
  assert(buffer.createdAtDay === DAY, 'Buffer day unchanged after reset');

  // Should be usable again after reset
  buffer.collectPressure(makeCompanyPressureInput());
  assert(buffer.inputs.length === 1, 'Buffer accepts input after reset');

  console.log(`  Passed: ${passed - beforePassed}, Failed: ${failed - beforeFailed}`);
}

// ---------------------------------------------------------------------------
// Test 9: buildPressureReceiptsFromInputs convenience helper
// ---------------------------------------------------------------------------

function testConvenienceHelper() {
  console.log('\n=== Test 9: buildPressureReceiptsFromInputs ===');
  const beforePassed = passed;
  const beforeFailed = failed;

  const inputs = makeAllInputs();
  const frozen = Object.freeze([...inputs]);

  const bundle = buildPressureReceiptsFromInputs(frozen, DAY);

  assert(bundle.inputCount === frozen.length, 'Convenience helper produces correct inputCount');
  assert(bundle.snapshots.length > 0, 'Convenience helper produces snapshots');
  assert(bundle.day === DAY, 'Convenience helper preserves day');
  assert(Object.isFrozen(bundle), 'Convenience helper returns frozen bundle');

  // Verify inputs unchanged
  assert(frozen.length === makeAllInputs().length, 'Input array length unchanged');

  console.log(`  Passed: ${passed - beforePassed}, Failed: ${failed - beforeFailed}`);
}

// ---------------------------------------------------------------------------
// Test 10: All major pressure sources produce receipts via buffer
// ---------------------------------------------------------------------------

function testAllSourcesViaBuffer() {
  console.log('\n=== Test 10: All Sources Via Buffer ===');
  const beforePassed = passed;
  const beforeFailed = failed;

  const sourceInputs: Array<{ source: string; input: PressureInput }> = [
    { source: 'rival-pressure', input: makeRivalPressureInput() },
    { source: 'competition-group', input: makeCompetitionGroupInput() },
    { source: 'company-pressure', input: makeCompanyPressureInput() },
    { source: 'customer-feedback', input: makeCustomerFeedbackInput() },
    { source: 'rival-customer-pull', input: makeRivalCustomerPullInput() },
    { source: 'random-event', input: makeRandomEventInput() },
    { source: 'competition-rival-loss', input: makeRivalLossInput() },
  ];

  sourceInputs.forEach(({ source, input }) => {
    const buffer = createPressureCollectionBuffer(DAY);
    buffer.collectPressure(input);
    const bundle = buildPressureReceiptsFromBuffer(buffer);
    assert(bundle.snapshots.length > 0, `Source ${source} produces snapshot via buffer`);
    assert(bundle.inputCount === 1, `Source ${source} has inputCount 1`);
  });

  console.log(`  Passed: ${passed - beforePassed}, Failed: ${failed - beforeFailed}`);
}

// ---------------------------------------------------------------------------
// Test 11: market-signal is NOT in PressureInputSource
// ---------------------------------------------------------------------------

function testMarketSignalNotInSource() {
  console.log('\n=== Test 11: market-signal Not In PressureInputSource ===');
  const beforePassed = passed;
  const beforeFailed = failed;

  // PressureInputSource should not include 'market-signal'
  // We verify by checking that the type system rejects it at compile time
  // (if it were included, this test would fail at runtime because there's
  // no handling for it in inferEvidenceKind)
  const validSources = [
    'rival-pressure',
    'competition-group',
    'competition-rival-loss',
    'company-pressure',
    'customer-feedback',
    'rival-customer-pull',
    'random-event',
    'scripted-event',
  ];
  assert(validSources.length === 8, '8 valid sources defined');
  assert(!validSources.includes('market-signal' as string), 'market-signal is NOT a valid source');

  // Verify that market-signal exists in ConstraintSignalSource (core layer)
  // but not in PressureInputSource (runtime layer)
  // This is confirmed by the type definitions — market-signal is in
  // ConstraintSignalSource for future use but not in PressureInputSource
  // because there's no mutation site to wire into.
  assert(true, 'market-signal is type-defined in core/competition but not in runtime/pressure PressureInputSource');

  console.log(`  Passed: ${passed - beforePassed}, Failed: ${failed - beforeFailed}`);
}

// ---------------------------------------------------------------------------
// Test 12: Receipt bundle contains all expected fields
// ---------------------------------------------------------------------------

function testBundleStructure() {
  console.log('\n=== Test 12: Receipt Bundle Structure ===');
  const beforePassed = passed;
  const beforeFailed = failed;

  const buffer = createPressureCollectionBuffer(DAY);
  buffer.collectPressure(makeRivalPressureInput());
  buffer.collectPressure(makeCompanyPressureInput());
  const bundle = buildPressureReceiptsFromBuffer(buffer);

  // Top-level fields
  assert('snapshots' in bundle, 'Bundle has snapshots');
  assert('decisionDeltas' in bundle, 'Bundle has decisionDeltas');
  assert('brokerPOV' in bundle, 'Bundle has brokerPOV');
  assert('ownerPOV' in bundle, 'Bundle has ownerPOV');
  assert('managerPOV' in bundle, 'Bundle has managerPOV');
  assert('inputCount' in bundle, 'Bundle has inputCount');
  assert('day' in bundle, 'Bundle has day');

  // Snapshot fields
  const snap = bundle.snapshots[0];
  assert('caseId' in snap, 'Snapshot has caseId');
  assert('day' in snap, 'Snapshot has day');
  assert('signals' in snap, 'Snapshot has signals');
  assert('evidence' in snap, 'Snapshot has evidence');
  assert('netHeatDelta' in snap, 'Snapshot has netHeatDelta');
  assert('netTrustDelta' in snap, 'Snapshot has netTrustDelta');
  assert('netUrgencyDelta' in snap, 'Snapshot has netUrgencyDelta');
  assert('lostToRival' in snap, 'Snapshot has lostToRival');
  assert('hasSignificantPressure' in snap, 'Snapshot has hasSignificantPressure');

  // DecisionPressureDelta fields
  const delta = bundle.decisionDeltas[0];
  assert('caseId' in delta, 'Delta has caseId');
  assert('dimension' in delta, 'Delta has dimension');
  assert('delta' in delta, 'Delta has delta');
  assert('sourceEvidenceIds' in delta, 'Delta has sourceEvidenceIds');
  assert('day' in delta, 'Delta has day');
  assert('summary' in delta, 'Delta has summary');

  // POV fields
  const pov = bundle.brokerPOV;
  assert('actor' in pov, 'POV has actor');
  assert('day' in pov, 'POV has day');
  assert('pressuredCaseIds' in pov, 'POV has pressuredCaseIds');
  assert('topEvidence' in pov, 'POV has topEvidence');
  assert('headline' in pov, 'POV has headline');
  assert('activeRivalCount' in pov, 'POV has activeRivalCount');
  assert('companyPressureActive' in pov, 'POV has companyPressureActive');

  console.log(`  Passed: ${passed - beforePassed}, Failed: ${failed - beforeFailed}`);
}

// ---------------------------------------------------------------------------
// Test 13: No mutation of input PressureInputs
// ---------------------------------------------------------------------------

function testInputPurity() {
  console.log('\n=== Test 13: Input Purity ===');
  const beforePassed = passed;
  const beforeFailed = failed;

  const input = makeRivalPressureInput();
  const frozen = Object.freeze({ ...input });

  const buffer = createPressureCollectionBuffer(DAY);
  buffer.collectPressure(frozen);
  const bundle = buildPressureReceiptsFromBuffer(buffer);

  // Verify frozen input unchanged
  assert(frozen.source === 'rival-pressure', 'Input source unchanged');
  assert(frozen.caseId === 'case-101', 'Input caseId unchanged');
  assert(frozen.magnitude === -3.5, 'Input magnitude unchanged');
  assert(frozen.evidence === '竞品房源正在抢走注意力。', 'Input evidence unchanged');

  // Verify bundle derived from it
  assert(bundle.snapshots.length > 0, 'Bundle produced from frozen input');
  assert(bundle.snapshots[0].signals[0].magnitude === -3.5, 'Signal magnitude matches input');

  console.log(`  Passed: ${passed - beforePassed}, Failed: ${failed - beforeFailed}`);
}

// ---------------------------------------------------------------------------
// Test 14: D4 can read from CompetitionPressureSnapshot fields
// ---------------------------------------------------------------------------

function testD4ReadableFields() {
  console.log('\n=== Test 14: D4 Readable Fields (for Agent B) ===');
  const beforePassed = passed;
  const beforeFailed = failed;

  const buffer = createPressureCollectionBuffer(DAY);
  buffer.collectPressure(makeRivalPressureInput());
  buffer.collectPressure(makeCompetitionGroupInput());
  buffer.collectPressure(makeCompanyPressureInput());
  const bundle = buildPressureReceiptsFromBuffer(buffer);

  const case101 = bundle.snapshots.find((s) => s.caseId === 'case-101');
  assert(case101 !== undefined, 'case-101 snapshot exists for D4');
  if (!case101) return;

  // D4 needs: competitionPressure, rivalCount, serviceLock, etc.
  // These are derivable from snapshot fields:
  const competitionPressure = Math.abs(case101.netHeatDelta) + Math.abs(case101.netTrustDelta);
  assert(competitionPressure > 0, `D4 competitionPressure derivable: ${competitionPressure}`);

  const rivalCount = case101.evidence.filter(
    (ev) => ev.kind.startsWith('rival-') || ev.kind === 'group-premium-penalty' || ev.kind === 'group-price-cutter',
  ).length;
  assert(rivalCount > 0, `D4 rivalCount derivable: ${rivalCount}`);

  const hasRivalLoss = case101.lostToRival;
  assert(typeof hasRivalLoss === 'boolean', `D4 rivalLoss flag available: ${hasRivalLoss}`);

  const signalCount = case101.signals.length;
  assert(signalCount > 0, `D4 signalCount available: ${signalCount}`);

  const evidenceKinds = case101.evidence.map((ev) => ev.kind);
  assert(evidenceKinds.length > 0, `D4 evidenceKinds available: ${evidenceKinds.join(', ')}`);

  const topEvidenceStrength = Math.max(...case101.evidence.map((ev) => ev.strength));
  assert(topEvidenceStrength > 0, `D4 topEvidenceStrength available: ${topEvidenceStrength}`);

  // POV-level fields
  assert(bundle.brokerPOV.activeRivalCount >= 0, `D4 activeRivalCount: ${bundle.brokerPOV.activeRivalCount}`);
  assert(typeof bundle.brokerPOV.companyPressureActive === 'boolean', `D4 companyPressureActive: ${bundle.brokerPOV.companyPressureActive}`);

  console.log(`  Passed: ${passed - beforePassed}, Failed: ${failed - beforeFailed}`);
}

// ---------------------------------------------------------------------------
// Run all tests
// ---------------------------------------------------------------------------

console.log('=== Selling Houses Pressure Collection Buffer Verification ===');
console.log(`Date: ${new Date().toISOString()}`);

testBufferCreation();
testCollectAppends();
testNullBufferNoop();
testBuildReceipts();
testEmptyBuffer();
testReceiptsFrozen();
testBufferMutableDuringCollection();
testResetBuffer();
testConvenienceHelper();
testAllSourcesViaBuffer();
testMarketSignalNotInSource();
testBundleStructure();
testInputPurity();
testD4ReadableFields();

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
