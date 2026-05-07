/**
 * Daily Operating Loop Contract Verification
 *
 * Validates that the DailyDecisionBridge movement types are properly
 * exported and usable from the core semantic-receipt module.
 *
 * This script verifies:
 * 1. Movement types compile
 * 2. Movement builders work correctly
 * 3. Movement data flows through the bridge
 * 4. Empty/missing movement data is handled gracefully
 */

import {
  buildEmptyDailyDecisionBridgeSummary,
  buildDailyDecisionBridgeSummary,
  type DailyOperatingMovementSummary,
  type DailyCaseOperatingMovement,
  type DailyMovementEntry,
  type DailyMovementKind,
  type DailyMovementDirection,
  type DailyMovementMagnitude,
} from '../src/selling-houses/core/world-state/semantic-receipt/index.js';

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string) {
  if (condition) { passed++; }
  else { failed++; console.error(`  [FAIL] ${message}`); }
}

// ---------------------------------------------------------------------------
// 1. Movement types compile
// ---------------------------------------------------------------------------

console.log('=== Check 1: Movement types compile ===');

const kind: DailyMovementKind = 'owner_relation';
const dir: DailyMovementDirection = 'improved';
const mag: DailyMovementMagnitude = 'high';
check(typeof kind === 'string', 'DailyMovementKind compiles');
check(typeof dir === 'string', 'DailyMovementDirection compiles');
check(typeof mag === 'string', 'DailyMovementMagnitude compiles');

console.log('  Movement types compile: PASS');

// ---------------------------------------------------------------------------
// 2. Empty summary has movement data
// ---------------------------------------------------------------------------

console.log('=== Check 2: Empty summary has movement data ===');

const empty = buildEmptyDailyDecisionBridgeSummary(10);
check(empty.operatingMovement !== undefined, 'empty has operatingMovement');
check(empty.operatingMovement!.day === 10, 'empty movement day=10');
check(empty.operatingMovement!.movedCaseCount === 0, 'empty movedCaseCount=0');
check(empty.operatingMovement!.worsenedCaseCount === 0, 'empty worsenedCaseCount=0');
check(empty.operatingMovement!.improvedCaseCount === 0, 'empty improvedCaseCount=0');
check(Object.isFrozen(empty.operatingMovement), 'empty movement frozen');

console.log('  Empty summary has movement data: PASS');

// ---------------------------------------------------------------------------
// 3. Movement with caseMovements
// ---------------------------------------------------------------------------

console.log('=== Check 3: Movement with caseMovements ===');

const movement: DailyMovementEntry = {
  kind: 'owner_relation',
  direction: 'improved',
  magnitude: 'medium',
  field: 'trust',
  from: 50,
  to: 60,
  delta: 10,
  reason: 'trust improved',
  sourceRefIds: ['ref:1'],
};

const caseMovement: DailyCaseOperatingMovement = {
  caseId: 'case-1',
  movements: [movement],
  blockerEmergences: [],
  blockerResolutions: [],
  recommendedActionId: 'action-1',
};

const summary = buildDailyDecisionBridgeSummary({
  day: 5,
  movedCases: [],
  actorPovChanges: [],
  recommendations: [],
  caseMovements: [caseMovement],
});

check(summary.operatingMovement !== undefined, 'summary has operatingMovement');
check(summary.operatingMovement!.movedCaseCount === 1, 'movedCaseCount=1');
check(summary.operatingMovement!.improvedCaseCount === 1, 'improvedCaseCount=1');
check(summary.operatingMovement!.recommendationCount === 1, 'recommendationCount=1');

console.log('  Movement with caseMovements: PASS');

// ---------------------------------------------------------------------------
// 4. Mixed directions
// ---------------------------------------------------------------------------

console.log('=== Check 4: Mixed directions ===');

const worsened: DailyMovementEntry = {
  kind: 'competition_pressure',
  direction: 'worsened',
  magnitude: 'high',
  field: 'competitiveness',
  from: 70,
  to: 50,
  delta: -20,
  reason: 'pressure increased',
  sourceRefIds: [],
};

const improved: DailyMovementEntry = {
  kind: 'customer_opportunity',
  direction: 'improved',
  magnitude: 'medium',
  field: 'd1',
  from: 40,
  to: 55,
  delta: 15,
  reason: 'demand improved',
  sourceRefIds: [],
};

const mixedCases: DailyCaseOperatingMovement[] = [
  { caseId: 'case-1', movements: [worsened], blockerEmergences: [], blockerResolutions: [] },
  { caseId: 'case-2', movements: [improved], blockerEmergences: [], blockerResolutions: [] },
  { caseId: 'case-3', movements: [worsened, improved], blockerEmergences: [], blockerResolutions: [] }, // both
];

const mixedSummary = buildDailyDecisionBridgeSummary({
  day: 6,
  movedCases: [],
  actorPovChanges: [],
  recommendations: [],
  caseMovements: mixedCases,
});

check(mixedSummary.operatingMovement!.movedCaseCount === 3, 'mixed: 3 moved cases');
check(mixedSummary.operatingMovement!.worsenedCaseCount === 1, 'mixed: 1 worsened (case-1 only)');
check(mixedSummary.operatingMovement!.improvedCaseCount === 1, 'mixed: 1 improved (case-2 only)');
// case-3 has both worsened and improved, so it's neither pure worsened nor pure improved

console.log('  Mixed directions: PASS');

// ---------------------------------------------------------------------------
// 5. Blocker emergence and resolution
// ---------------------------------------------------------------------------

console.log('=== Check 5: Blocker emergence and resolution ===');

const blockerCase: DailyCaseOperatingMovement = {
  caseId: 'case-blocker',
  movements: [],
  blockerEmergences: [
    { blockerId: 'b1', kind: 'price_exceeds_budget', description: 'x', severity: 'high' },
    { blockerId: 'b2', kind: 'low_owner_trust', description: 'y', severity: 'medium' },
  ],
  blockerResolutions: [
    { blockerId: 'b3', kind: 'market_capacity', description: 'z', severity: 'low' },
  ],
};

const blockerSummary = buildDailyDecisionBridgeSummary({
  day: 7,
  movedCases: [],
  actorPovChanges: [],
  recommendations: [],
  caseMovements: [blockerCase],
});

check(blockerSummary.operatingMovement!.blockerCount === 3, 'blockers: 3 total (2 emergences + 1 resolution)');

console.log('  Blocker emergence and resolution: PASS');

// ---------------------------------------------------------------------------
// 6. No mutation
// ---------------------------------------------------------------------------

console.log('=== Check 6: No mutation ===');

const input: DailyCaseOperatingMovement = {
  caseId: 'case-mut',
  movements: [{
    kind: 'owner_relation',
    direction: 'improved',
    magnitude: 'low',
    field: 'trust',
    from: 50,
    to: 55,
    delta: 5,
    reason: 'test',
    sourceRefIds: [],
  }],
  blockerEmergences: [],
  blockerResolutions: [],
};

const inputCopy = JSON.stringify(input);
buildDailyDecisionBridgeSummary({
  day: 1,
  movedCases: [],
  actorPovChanges: [],
  recommendations: [],
  caseMovements: [input],
});
check(JSON.stringify(input) === inputCopy, 'input not mutated');

console.log('  No mutation: PASS');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Summary ===`);
console.log(`Total: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);

if (failed > 0) {
  console.log('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\nselling-houses daily-operating-loop contract verification passed');
  process.exit(0);
}
