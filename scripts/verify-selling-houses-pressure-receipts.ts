/**
 * Verify that pressure receipt types and builders work correctly.
 *
 * This script checks:
 * 1. All types compile.
 * 2. Receipt builders are pure (don't mutate inputs).
 * 3. All major pressure sources can generate receipts.
 * 4. Receipts contain source/target/dimension/magnitude/evidence.
 * 5. CompetitionPressureSnapshot aggregates correctly.
 * 6. DecisionPressureDelta derives from signals.
 * 7. CompetitionPOV summarizes pressure state.
 */

import {
  pressureInputToSignal,
  pressureInputToEvidence,
  buildCompetitionPressureSnapshots,
  buildDecisionPressureDeltas,
  buildCompetitionPOV,
  type PressureInput,
  type ConstraintSignal,
  type CompetitionEvidence,
  type CompetitionPressureSnapshot,
  type DecisionPressureDelta,
  type CompetitionPOV,
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

function assertType<T>(_value: T, label: string) {
  assert(true, `Type check passed: ${label}`);
}

// ---------------------------------------------------------------------------
// Sample PressureInputs covering all major sources
// ---------------------------------------------------------------------------

const DAY = 5;

function makeInputs(): PressureInput[] {
  return [
    // 1. Rival listing pressure
    {
      source: 'rival-pressure',
      caseId: 'case-101',
      day: DAY,
      dimension: 'heat',
      magnitude: -3.5,
      evidence: '竞品房源前滩华府 89㎡ 正在抢走 case-101 的注意力。',
      sourceEntityId: 'rival-5-1-423',
      sourceEntityLabel: '浦东前滩 新入场竞品',
      evidenceKind: 'rival-price-overlap',
      evidenceStrength: 62,
    },
    // 2. Rival pressure on trust
    {
      source: 'rival-pressure',
      caseId: 'case-101',
      day: DAY,
      dimension: 'trust',
      magnitude: -0.5,
      evidence: '竞品房源持续压制业主信心。',
      sourceEntityId: 'rival-5-1-423',
      sourceEntityLabel: '浦东前滩 新入场竞品',
      evidenceKind: 'rival-owner-anchor',
      evidenceStrength: 45,
    },
    // 3. Competition group pressure
    {
      source: 'competition-group',
      caseId: 'case-101',
      day: DAY,
      dimension: 'heat',
      magnitude: -2.0,
      evidence: '同类房源中有人降价，case-101 价格压力同步放大。',
      sourceEntityId: 'comp-group-1',
      sourceEntityLabel: '前滩刚改竞争组',
      evidenceKind: 'group-price-cutter',
      evidenceStrength: 55,
    },
    // 4. Rival loss (case lost)
    {
      source: 'competition-rival-loss',
      caseId: 'case-103',
      day: DAY,
      dimension: 'heat',
      magnitude: -100,
      evidence: '被隔壁门店抓住价格和推进空档，最终没守住。',
      sourceEntityId: 'rival-5-2-789',
      sourceEntityLabel: '静安寺北 竞品',
      evidenceKind: 'rival-loss-window',
      evidenceStrength: 100,
    },
    // 5. Company pressure on intent
    {
      source: 'company-pressure',
      caseId: 'case-101',
      day: DAY,
      dimension: 'intent',
      magnitude: -1.2,
      evidence: '公司内部共享线索压力导致客户意向下降。',
      sourceEntityId: 'company-pressure-state',
      sourceEntityLabel: '公司群消息',
      evidenceKind: 'company-shared-lead-pressure',
      evidenceStrength: 58,
    },
    // 6. Customer feedback - negative (no active leads)
    {
      source: 'customer-feedback',
      caseId: 'case-101',
      day: DAY,
      dimension: 'heat',
      magnitude: -3.0,
      evidence: 'case-101 当前没有活跃客户，热度自然下降。',
      evidenceKind: 'customer-no-active-leads',
      evidenceStrength: 40,
    },
    // 7. Customer feedback - positive (high intent customer)
    {
      source: 'customer-feedback',
      caseId: 'case-101',
      day: DAY,
      dimension: 'trust',
      magnitude: 1.5,
      evidence: '有客户进入谈判阶段，业主信心有所恢复。',
      evidenceKind: 'customer-high-intent-feedback',
      evidenceStrength: 65,
    },
    // 8. Rival customer pull
    {
      source: 'rival-customer-pull',
      caseId: 'case-101',
      day: DAY,
      dimension: 'intent',
      magnitude: -2.0,
      evidence: '客户被竞品 前滩华府 抢走注意力。',
      sourceEntityId: 'rival-5-1-423',
      sourceEntityLabel: '浦东前滩 新入场竞品',
      evidenceKind: 'rival-customer-pull-attention',
      evidenceStrength: 58,
      customerRuntimeIds: ['cus-01'],
    },
    // 9. Random event - policy shift
    {
      source: 'random-event',
      caseId: 'case-101',
      day: DAY,
      dimension: 'confidence',
      magnitude: -10,
      evidence: '利率上行预期强化，所有活跃客户的成交置信度同步回落。',
      evidenceKind: 'random-event-policy-shift',
      evidenceStrength: 80,
      opportunityIds: ['opp-1', 'opp-2'],
    },
    // 10. Company pressure on confidence
    {
      source: 'company-pressure',
      caseId: 'case-101',
      day: DAY,
      dimension: 'confidence',
      magnitude: -0.8,
      evidence: '公司内部竞争热度导致经纪人推介客户信心下降。',
      sourceEntityId: 'company-pressure-state',
      sourceEntityLabel: '公司内部竞争',
      evidenceKind: 'company-internal-competition',
      evidenceStrength: 45,
    },
  ];
}

// ---------------------------------------------------------------------------
// Test 1: Type compilation
// ---------------------------------------------------------------------------

function testTypeCompilation() {
  console.log('\n=== Test 1: Type Compilation ===');

  const signal: ConstraintSignal = pressureInputToSignal(makeInputs()[0], 0);
  assertType<ConstraintSignal>(signal, 'ConstraintSignal');
  assert(typeof signal.id === 'string', 'signal.id is string');
  assert(typeof signal.source === 'string', 'signal.source is string');
  assert(typeof signal.dimension === 'string', 'signal.dimension is string');
  assert(typeof signal.magnitude === 'number', 'signal.magnitude is number');
  assert(typeof signal.evidence === 'string', 'signal.evidence is string');

  const evidence: CompetitionEvidence = pressureInputToEvidence(makeInputs()[0], 0);
  assertType<CompetitionEvidence>(evidence, 'CompetitionEvidence');
  assert(typeof evidence.kind === 'string', 'evidence.kind is string');
  assert(typeof evidence.strength === 'number', 'evidence.strength is number');

  const snapshots: CompetitionPressureSnapshot[] = buildCompetitionPressureSnapshots(makeInputs());
  assertType<CompetitionPressureSnapshot[]>(snapshots, 'CompetitionPressureSnapshot[]');

  const deltas: DecisionPressureDelta[] = buildDecisionPressureDeltas(makeInputs());
  assertType<DecisionPressureDelta[]>(deltas, 'DecisionPressureDelta[]');

  const pov: CompetitionPOV = buildCompetitionPOV('broker', DAY, snapshots, makeInputs());
  assertType<CompetitionPOV>(pov, 'CompetitionPOV');

  console.log(`  Passed: ${passed}, Failed: ${failed}`);
}

// ---------------------------------------------------------------------------
// Test 2: Purity (no mutation of inputs)
// ---------------------------------------------------------------------------

function testPurity() {
  console.log('\n=== Test 2: Builder Purity ===');
  const beforePassed = passed;
  const beforeFailed = failed;

  const inputs = makeInputs();
  const frozenInputs = Object.freeze([...inputs]);

  // Run all builders
  buildCompetitionPressureSnapshots(frozenInputs);
  buildDecisionPressureDeltas(frozenInputs);
  buildCompetitionPOV('broker', DAY, [], frozenInputs);

  // Verify inputs unchanged
  assert(inputs.length === frozenInputs.length, 'Input array length unchanged');
  assert(inputs[0].caseId === 'case-101', 'First input caseId unchanged');
  assert(inputs[0].magnitude === -3.5, 'First input magnitude unchanged');

  console.log(`  Passed: ${passed - beforePassed}, Failed: ${failed - beforeFailed}`);
}

// ---------------------------------------------------------------------------
// Test 3: All major pressure sources generate receipts
// ---------------------------------------------------------------------------

function testAllSourcesCovered() {
  console.log('\n=== Test 3: All Major Pressure Sources Covered ===');
  const beforePassed = passed;
  const beforeFailed = failed;

  const sourceTypes = [
    'rival-pressure',
    'competition-group',
    'competition-rival-loss',
    'company-pressure',
    'customer-feedback',
    'rival-customer-pull',
    'random-event',
  ] as const;

  sourceTypes.forEach((source) => {
    const input: PressureInput = {
      source,
      caseId: 'test-case',
      day: DAY,
      dimension: 'heat',
      magnitude: -5,
      evidence: `Test evidence for ${source}`,
    };
    const signal = pressureInputToSignal(input, 0);
    assert(signal.source.length > 0, `Source ${source} maps to signal source: ${signal.source}`);
    assert(signal.evidence === input.evidence, `Source ${source} preserves evidence`);
    assert(signal.magnitude === -5, `Source ${source} preserves magnitude`);

    const evidence = pressureInputToEvidence(input, 0);
    assert(evidence.kind.length > 0, `Source ${source} maps to evidence kind: ${evidence.kind}`);
    assert(evidence.sourceEntityId.length > 0, `Source ${source} has sourceEntityId`);
  });

  console.log(`  Passed: ${passed - beforePassed}, Failed: ${failed - beforeFailed}`);
}

// ---------------------------------------------------------------------------
// Test 4: Receipt structure completeness
// ---------------------------------------------------------------------------

function testReceiptCompleteness() {
  console.log('\n=== Test 4: Receipt Structure Completeness ===');
  const beforePassed = passed;
  const beforeFailed = failed;

  const inputs = makeInputs();
  const snapshots = buildCompetitionPressureSnapshots(inputs);

  // case-101 should have multiple signals
  const case101Snapshot = snapshots.find((s) => s.caseId === 'case-101');
  assert(case101Snapshot !== undefined, 'case-101 has a snapshot');
  if (case101Snapshot) {
    assert(case101Snapshot.signals.length > 0, 'Snapshot has signals');
    assert(case101Snapshot.evidence.length > 0, 'Snapshot has evidence');
    assert(typeof case101Snapshot.netHeatDelta === 'number', 'Snapshot has netHeatDelta');
    assert(typeof case101Snapshot.netTrustDelta === 'number', 'Snapshot has netTrustDelta');
    assert(typeof case101Snapshot.lostToRival === 'boolean', 'Snapshot has lostToRival');
    assert(case101Snapshot.hasSignificantPressure === true, 'case-101 has significant pressure');

    // Verify each signal has all required fields
    case101Snapshot.signals.forEach((signal) => {
      assert(signal.id.length > 0, `Signal has id: ${signal.id}`);
      assert(signal.source.length > 0, `Signal has source: ${signal.source}`);
      assert(signal.targetEntityId.length > 0, `Signal has targetEntityId`);
      assert(signal.dimension.length > 0, `Signal has dimension: ${signal.dimension}`);
      assert(typeof signal.magnitude === 'number', `Signal has magnitude: ${signal.magnitude}`);
      assert(signal.evidence.length > 0, `Signal has evidence`);
    });

    // Verify each evidence has all required fields
    case101Snapshot.evidence.forEach((ev) => {
      assert(ev.id.length > 0, `Evidence has id: ${ev.id}`);
      assert(ev.kind.length > 0, `Evidence has kind: ${ev.kind}`);
      assert(ev.sourceEntityId.length > 0, `Evidence has sourceEntityId`);
      assert(typeof ev.strength === 'number', `Evidence has strength: ${ev.strength}`);
      assert(ev.detail.length > 0, `Evidence has detail`);
    });
  }

  // case-103 should be lost to rival
  const case103Snapshot = snapshots.find((s) => s.caseId === 'case-103');
  assert(case103Snapshot !== undefined, 'case-103 has a snapshot');
  if (case103Snapshot) {
    assert(case103Snapshot.lostToRival === true, 'case-103 lostToRival is true');
  }

  console.log(`  Passed: ${passed - beforePassed}, Failed: ${failed - beforeFailed}`);
}

// ---------------------------------------------------------------------------
// Test 5: DecisionPressureDelta derivation
// ---------------------------------------------------------------------------

function testDecisionPressureDelta() {
  console.log('\n=== Test 5: DecisionPressureDelta Derivation ===');
  const beforePassed = passed;
  const beforeFailed = failed;

  const inputs = makeInputs();
  const deltas = buildDecisionPressureDeltas(inputs);

  assert(deltas.length > 0, 'DecisionPressureDeltas generated');

  // Check that heat signals map to price-adjustment-pressure
  const heatDeltas = deltas.filter(
    (d) => d.dimension === 'price-adjustment-pressure',
  );
  assert(heatDeltas.length > 0, 'Heat signals produce price-adjustment-pressure deltas');

  // Check that trust signals map to trust-repair-pressure
  const trustDeltas = deltas.filter(
    (d) => d.dimension === 'trust-repair-pressure',
  );
  assert(trustDeltas.length > 0, 'Trust signals produce trust-repair-pressure deltas');

  // Check that intent signals map to service-quality-pressure
  const intentDeltas = deltas.filter(
    (d) => d.dimension === 'service-quality-pressure',
  );
  assert(intentDeltas.length > 0, 'Intent signals produce service-quality-pressure deltas');

  // Verify structure
  deltas.forEach((delta) => {
    assert(delta.caseId.length > 0, 'Delta has caseId');
    assert(delta.dimension.length > 0, `Delta has dimension: ${delta.dimension}`);
    assert(typeof delta.delta === 'number', `Delta has delta: ${delta.delta}`);
    assert(delta.sourceEvidenceIds.length > 0, 'Delta has sourceEvidenceIds');
    assert(delta.summary.length > 0, 'Delta has summary');
  });

  console.log(`  Passed: ${passed - beforePassed}, Failed: ${failed - beforeFailed}`);
}

// ---------------------------------------------------------------------------
// Test 6: CompetitionPOV summary
// ---------------------------------------------------------------------------

function testCompetitionPOV() {
  console.log('\n=== Test 6: CompetitionPOV Summary ===');
  const beforePassed = passed;
  const beforeFailed = failed;

  const inputs = makeInputs();
  const snapshots = buildCompetitionPressureSnapshots(inputs);
  const pov = buildCompetitionPOV('broker', DAY, snapshots, inputs);

  assert(pov.actor === 'broker', 'POV actor is broker');
  assert(pov.day === DAY, 'POV day matches');
  assert(pov.pressuredCaseIds.length > 0, 'POV has pressuredCaseIds');
  assert(pov.topEvidence.length > 0, 'POV has topEvidence');
  assert(pov.topEvidence.length <= 5, 'POV topEvidence capped at 5');
  assert(pov.headline.length > 0, 'POV has headline');
  assert(typeof pov.activeRivalCount === 'number', 'POV has activeRivalCount');
  assert(typeof pov.companyPressureActive === 'boolean', 'POV has companyPressureActive');
  assert(pov.companyPressureActive === true, 'Company pressure is active in test data');

  // Owner POV should also work
  const ownerPov = buildCompetitionPOV('owner', DAY, snapshots, inputs);
  assert(ownerPov.actor === 'owner', 'Owner POV works');

  // Manager POV should also work
  const managerPov = buildCompetitionPOV('manager', DAY, snapshots, inputs);
  assert(managerPov.actor === 'manager', 'Manager POV works');

  console.log(`  Passed: ${passed - beforePassed}, Failed: ${failed - beforeFailed}`);
}

// ---------------------------------------------------------------------------
// Test 7: Net delta aggregation
// ---------------------------------------------------------------------------

function testNetDeltaAggregation() {
  console.log('\n=== Test 7: Net Delta Aggregation ===');
  const beforePassed = passed;
  const beforeFailed = failed;

  const inputs = makeInputs();
  const snapshots = buildCompetitionPressureSnapshots(inputs);
  const case101 = snapshots.find((s) => s.caseId === 'case-101');

  assert(case101 !== undefined, 'case-101 snapshot exists');
  if (case101) {
    // heat: rival(-3.5) + group(-2.0) + customer(-3.0) = -8.5
    assert(
      Math.abs(case101.netHeatDelta - (-8.5)) < 0.01,
      `case-101 netHeatDelta is ${case101.netHeatDelta} (expected -8.5)`,
    );
    // trust: rival(-0.5) + customer(+1.5) = 1.0
    assert(
      Math.abs(case101.netTrustDelta - 1.0) < 0.01,
      `case-101 netTrustDelta is ${case101.netTrustDelta} (expected 1.0)`,
    );
    // urgency: none in inputs
    assert(
      case101.netUrgencyDelta === 0,
      `case-101 netUrgencyDelta is ${case101.netUrgencyDelta} (expected 0)`,
    );
  }

  console.log(`  Passed: ${passed - beforePassed}, Failed: ${failed - beforeFailed}`);
}

// ---------------------------------------------------------------------------
// Test 8: Causal chain — evidence ↔ delta linkage (P1 Finding 2 fix)
// ---------------------------------------------------------------------------

function testCausalChainEvidenceDeltaLinkage() {
  const beforePassed = passed;
  const beforeFailed = failed;

  // Build inputs that mix same-case and cross-case to stress the linkage.
  const inputs: PressureInput[] = [
    {
      source: 'rival-pressure',
      caseId: 'case-X',
      day: DAY,
      dimension: 'heat',
      magnitude: -2,
      evidence: 'rival heat pressure',
      sourceEntityId: 'rival-x',
      sourceEntityLabel: '竞品X',
    },
    {
      source: 'competition-group',
      caseId: 'case-X',
      day: DAY,
      dimension: 'heat',
      magnitude: -1,
      evidence: 'group heat pressure',
    },
    {
      source: 'rival-pressure',
      caseId: 'case-X',
      day: DAY,
      dimension: 'trust',
      magnitude: -3,
      evidence: 'rival trust pressure',
      sourceEntityId: 'rival-x',
      sourceEntityLabel: '竞品X',
    },
    {
      source: 'customer-feedback',
      caseId: 'case-Y',
      day: DAY,
      dimension: 'urgency',
      magnitude: 1,
      evidence: 'customer urgency feedback',
    },
  ];

  const snapshots = buildCompetitionPressureSnapshots(inputs);
  const deltas = buildDecisionPressureDeltas(inputs);

  // Collect ALL evidence IDs from all snapshots.
  const allEvidenceIds = new Set(
    snapshots.flatMap((s) => s.evidence.map((e) => e.id)),
  );

  // 1. Every delta.sourceEvidenceIds entry must reference a real evidence ID.
  for (const delta of deltas) {
    for (const evId of delta.sourceEvidenceIds) {
      assert(
        allEvidenceIds.has(evId),
        `Delta "${delta.dimension}" for ${delta.caseId} references evidence ${evId} which must exist in snapshots`,
      );
    }
  }

  // 2. sourceEvidenceIds must never start with "signal:".
  for (const delta of deltas) {
    for (const evId of delta.sourceEvidenceIds) {
      assert(
        !evId.startsWith('signal:'),
        `sourceEvidenceIds must reference evidence, not signals. Found: ${evId}`,
      );
    }
  }

  // 3. Not all deltas land on index :0 — with 4 inputs we expect at least
  //    two distinct index suffixes.
  const indexSuffixes = new Set(
    deltas.flatMap((d) =>
      d.sourceEvidenceIds.map((id) => {
        const parts = id.split(':');
        return parts[parts.length - 1];
      }),
    ),
  );
  assert(
    indexSuffixes.size >= 2,
    `Expected at least 2 distinct index suffixes across deltas, got ${indexSuffixes.size}: ${[...indexSuffixes]}`,
  );

  // 4. rival-customer-pull with customerRuntimeIds should use that ID
  //    as targetEntityId instead of caseId.
  const pullInput: PressureInput = {
    source: 'rival-customer-pull',
    caseId: 'case-pull',
    day: DAY,
    dimension: 'confidence',
    magnitude: -4,
    evidence: '客户被竞品拉走',
    customerRuntimeIds: ['cust-rt-42'],
  };
  const pullSignal = pressureInputToSignal(pullInput, 0);
  assert(
    pullSignal.targetEntityKind === 'customer-runtime',
    `rival-customer-pull targetEntityKind should be customer-runtime, got ${pullSignal.targetEntityKind}`,
  );
  assert(
    pullSignal.targetEntityId === 'cust-rt-42',
    `rival-customer-pull with customerRuntimeIds should target cust-rt-42, got ${pullSignal.targetEntityId}`,
  );

  // 5. rival-customer-pull without customerRuntimeIds falls back to caseId.
  const pullInputFallback: PressureInput = {
    source: 'rival-customer-pull',
    caseId: 'case-pull-fallback',
    day: DAY,
    dimension: 'confidence',
    magnitude: -2,
    evidence: '客户可能被拉走',
  };
  const pullSignalFallback = pressureInputToSignal(pullInputFallback, 0);
  assert(
    pullSignalFallback.targetEntityId === 'case-pull-fallback',
    `rival-customer-pull without customerRuntimeIds should fallback to caseId, got ${pullSignalFallback.targetEntityId}`,
  );

  console.log(`  Passed: ${passed - beforePassed}, Failed: ${failed - beforeFailed}`);
}

// ---------------------------------------------------------------------------
// Run all tests
// ---------------------------------------------------------------------------

console.log('=== Selling Houses Pressure Receipt Verification ===');
console.log(`Date: ${new Date().toISOString()}`);

testTypeCompilation();
testPurity();
testAllSourcesCovered();
testReceiptCompleteness();
testDecisionPressureDelta();
testCompetitionPOV();
testNetDeltaAggregation();
testCausalChainEvidenceDeltaLinkage();

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
