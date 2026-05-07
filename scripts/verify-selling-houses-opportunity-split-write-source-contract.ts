/**
 * Opportunity Split Write Source v0 contract verification.
 *
 * Validates:
 * 1. CustomerCaseMatchState creation and write functions
 * 2. BrokeredOpportunityState creation and write functions
 * 3. Deterministic ID builders
 * 4. Legacy mirror derivation
 * 5. Core boundary (no domain/runtime imports)
 * 6. Deterministic behavior
 * 7. Frozen output
 */

import { readFileSync } from 'node:fs';

import {
  buildCustomerCaseMatchId,
  buildBrokeredOpportunityId,
  createCustomerCaseMatchState,
  setCustomerCaseMatchScores,
  applyCustomerCaseMatchDelta,
  createBrokeredOpportunityState,
  setBrokeredOpportunityStage,
  setBrokeredOpportunityLifecycle,
  setBrokeredOpportunityPendingClosing,
  applyBrokeredOpportunityProgressDelta,
  deriveLegacyOpportunityMirror,
} from '../src/selling-houses/core/world-state/opportunity-relations/writeSource.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string) {
  if (condition) { passed++; }
  else { failed++; console.error(`  [FAIL] ${message}`); }
}

// ---------------------------------------------------------------------------
// 1. CustomerCaseMatchState creation
// ---------------------------------------------------------------------------

console.log('=== Check 1: createCustomerCaseMatchState ===');

const m1 = createCustomerCaseMatchState('cust-1', 'case-1', 80, 70, 65, 500, 55, 5);
check(m1.matchId === 'match:cust-1::case-1', `matchId: ${m1.matchId}`);
check(m1.customerId === 'cust-1', `customerId: ${m1.customerId}`);
check(m1.caseId === 'case-1', `caseId: ${m1.caseId}`);
check(m1.fit === 80, `fit: ${m1.fit}`);
check(m1.interest === 70, `interest: ${m1.interest}`);
check(m1.confidence === 65, `confidence: ${m1.confidence}`);
check(m1.budgetMax === 500, `budgetMax: ${m1.budgetMax}`);
check(m1.priceSensitivity === 55, `priceSensitivity: ${m1.priceSensitivity}`);
check(m1.selected === false, `selected: ${m1.selected}`);
check(m1.offered === false, `offered: ${m1.offered}`);
check(m1.viewed === false, `viewed: ${m1.viewed}`);
check(m1.lastUpdatedDay === 5, `lastUpdatedDay: ${m1.lastUpdatedDay}`);
check(Object.isFrozen(m1), 'state is frozen');

// ---------------------------------------------------------------------------
// 2. setCustomerCaseMatchScores
// ---------------------------------------------------------------------------

console.log('=== Check 2: setCustomerCaseMatchScores ===');

const { state: m2, record: r2 } = setCustomerCaseMatchScores(m1, { fit: 90, interest: 85 }, 6, 'test');
check(m2.fit === 90, `new fit: ${m2.fit}`);
check(m2.interest === 85, `new interest: ${m2.interest}`);
check(m2.confidence === 65, `confidence unchanged: ${m2.confidence}`);
check(m2.lastUpdatedDay === 6, `lastUpdatedDay: ${m2.lastUpdatedDay}`);
check(Object.isFrozen(m2), 'new state is frozen');
check(r2.field === 'interest', `record field: ${r2.field}`);
check(Object.isFrozen(r2), 'record is frozen');

// ---------------------------------------------------------------------------
// 3. applyCustomerCaseMatchDelta
// ---------------------------------------------------------------------------

console.log('=== Check 3: applyCustomerCaseMatchDelta ===');

const { state: m3 } = applyCustomerCaseMatchDelta(m1, { fitDelta: -10, confidenceDelta: 5 }, 7, 'delta');
check(m3.fit === 70, `fit after -10: ${m3.fit}`);
check(m3.confidence === 70, `confidence after +5: ${m3.confidence}`);
check(m3.interest === 70, `interest unchanged: ${m3.interest}`);

// ---------------------------------------------------------------------------
// 4. Clamping
// ---------------------------------------------------------------------------

console.log('=== Check 4: Clamping ===');

const { state: m4a } = setCustomerCaseMatchScores(m1, { fit: 150 }, 1, 'over');
check(m4a.fit === 100, `clamp high: ${m4a.fit}`);

const { state: m4b } = setCustomerCaseMatchScores(m1, { interest: -10 }, 1, 'under');
check(m4b.interest === 0, `clamp low: ${m4b.interest}`);

// ---------------------------------------------------------------------------
// 5. BrokeredOpportunityState creation
// ---------------------------------------------------------------------------

console.log('=== Check 5: createBrokeredOpportunityState ===');

const o1 = createBrokeredOpportunityState(
  'opp-1', 'match:cust-1::case-1', 'cust-1', 'case-1',
  3, '已看房', 'active', 'active', 'direct', 'revealed',
  'ch-private', '私域转介绍', '链家1号', 5, 2,
);
check(o1.brokeredOpportunityId === 'brokered:opp-1', `brokeredId: ${o1.brokeredOpportunityId}`);
check(o1.legacyOpportunityId === 'opp-1', `legacyId: ${o1.legacyOpportunityId}`);
check(o1.matchId === 'match:cust-1::case-1', `matchId: ${o1.matchId}`);
check(o1.stageIndex === 3, `stageIndex: ${o1.stageIndex}`);
check(o1.status === 'active', `status: ${o1.status}`);
check(o1.visibility === 'revealed', `visibility: ${o1.visibility}`);
check(o1.daysLeft === 5, `daysLeft: ${o1.daysLeft}`);
check(o1.stagnationTicks === 0, `stagnationTicks: ${o1.stagnationTicks}`);
check(Object.isFrozen(o1), 'state is frozen');

// ---------------------------------------------------------------------------
// 6. setBrokeredOpportunityStage
// ---------------------------------------------------------------------------

console.log('=== Check 6: setBrokeredOpportunityStage ===');

const { state: o2, record: r6 } = setBrokeredOpportunityStage(o1, 4, '谈判中', 10, 'stage-up');
check(o2.stageIndex === 4, `new stageIndex: ${o2.stageIndex}`);
check(o2.stageLabel === '谈判中', `new stageLabel: ${o2.stageLabel}`);
check(o2.lastUpdatedDay === 10, `lastUpdatedDay: ${o2.lastUpdatedDay}`);
check(r6.field === 'stage', `record field: ${r6.field}`);
check(r6.previousValue === '3:已看房', `previous: ${r6.previousValue}`);
check(r6.newValue === '4:谈判中', `new: ${r6.newValue}`);

// ---------------------------------------------------------------------------
// 7. setBrokeredOpportunityLifecycle
// ---------------------------------------------------------------------------

console.log('=== Check 7: setBrokeredOpportunityLifecycle ===');

const { state: o3, record: r7 } = setBrokeredOpportunityLifecycle(o1, 'won', 'won', 11, 'closed');
check(o3.status === 'won', `new status: ${o3.status}`);
check(o3.lifecycleStatus === 'won', `new lifecycleStatus: ${o3.lifecycleStatus}`);
check(r7.field === 'lifecycle', `record field: ${r7.field}`);

// ---------------------------------------------------------------------------
// 8. setBrokeredOpportunityPendingClosing
// ---------------------------------------------------------------------------

console.log('=== Check 8: setBrokeredOpportunityPendingClosing ===');

const { state: o4, record: r8 } = setBrokeredOpportunityPendingClosing(
  o1, true, 'hold', 10, 12, 'pending',
);
check(o4.pendingClosingEvaluation === true, `pendingClosingEvaluation: ${o4.pendingClosingEvaluation}`);
check(o4.pendingClosingStrategyId === 'hold', `pendingClosingStrategyId: ${o4.pendingClosingStrategyId}`);
check(o4.pendingClosingRequestedDay === 10, `pendingClosingRequestedDay: ${o4.pendingClosingRequestedDay}`);
check(r8.field === 'pendingClosing', `record field: ${r8.field}`);

// ---------------------------------------------------------------------------
// 9. applyBrokeredOpportunityProgressDelta
// ---------------------------------------------------------------------------

console.log('=== Check 9: applyBrokeredOpportunityProgressDelta ===');

const { state: o5, record: r9 } = applyBrokeredOpportunityProgressDelta(
  o1, { daysLeftDelta: -2, stagnationTicksDelta: 1 }, 13, 'progress',
);
check(o5.daysLeft === 3, `daysLeft after -2: ${o5.daysLeft}`);
check(o5.stagnationTicks === 1, `stagnationTicks after +1: ${o5.stagnationTicks}`);
check(r9.field === 'progress', `record field: ${r9.field}`);

// Clamping
const { state: o5b } = applyBrokeredOpportunityProgressDelta(
  o1, { daysLeftDelta: -100 }, 14, 'clamp',
);
check(o5b.daysLeft === 0, `daysLeft clamped to 0: ${o5b.daysLeft}`);

// ---------------------------------------------------------------------------
// 10. deriveLegacyOpportunityMirror
// ---------------------------------------------------------------------------

console.log('=== Check 10: deriveLegacyOpportunityMirror ===');

const mirror = deriveLegacyOpportunityMirror(o1);
check(mirror.id === 'opp-1', `mirror.id: ${mirror.id}`);
check(mirror.caseId === 'case-1', `mirror.caseId: ${mirror.caseId}`);
check(mirror.stageIndex === 3, `mirror.stageIndex: ${mirror.stageIndex}`);
check(mirror.status === 'active', `mirror.status: ${mirror.status}`);
check(mirror.visibility === 'revealed', `mirror.visibility: ${mirror.visibility}`);
check(Object.isFrozen(mirror), 'mirror is frozen');

// ---------------------------------------------------------------------------
// 11. Deterministic ID builders
// ---------------------------------------------------------------------------

console.log('=== Check 11: Deterministic ID builders ===');

check(buildCustomerCaseMatchId('a', 'b') === 'match:a::b', `match id: ${buildCustomerCaseMatchId('a', 'b')}`);
check(buildBrokeredOpportunityId('opp-x') === 'brokered:opp-x', `brokered id: ${buildBrokeredOpportunityId('opp-x')}`);
check(buildCustomerCaseMatchId('a', 'b') === buildCustomerCaseMatchId('a', 'b'), 'match id deterministic');
check(buildBrokeredOpportunityId('x') === buildBrokeredOpportunityId('x'), 'brokered id deterministic');

// ---------------------------------------------------------------------------
// 12. Core boundary
// ---------------------------------------------------------------------------

console.log('=== Check 12: Core boundary ===');

const src = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/opportunity-relations/writeSource.ts', 'utf-8');
check(!src.includes("from '../../../domain"), 'writeSource has no domain imports');
check(!src.includes("from '../../../runtime"), 'writeSource has no runtime imports');
// Check that Date.now/Math.random are not used in actual code (comments are OK)
const srcWithoutComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!srcWithoutComments.includes('Date.now'), 'writeSource has no Date.now in code');
check(!srcWithoutComments.includes('Math.random'), 'writeSource has no Math.random in code');

// ---------------------------------------------------------------------------
// 13. Deterministic behavior
// ---------------------------------------------------------------------------

console.log('=== Check 13: Deterministic ===');

const m13a = createCustomerCaseMatchState('c', 'x', 50, 50, 50, 100, 50, 1);
const m13b = createCustomerCaseMatchState('c', 'x', 50, 50, 50, 100, 50, 1);
check(m13a.matchId === m13b.matchId, 'deterministic: same matchId');
check(m13a.fit === m13b.fit, 'deterministic: same fit');

const o13a = createBrokeredOpportunityState('opp-1', 'm', 'c', 'x', 1, 'l', 'a', 'a', 'd', 'r', 'ch', 'n', 'b', 5, 1);
const o13b = createBrokeredOpportunityState('opp-1', 'm', 'c', 'x', 1, 'l', 'a', 'a', 'd', 'r', 'ch', 'n', 'b', 5, 1);
check(o13a.brokeredOpportunityId === o13b.brokeredOpportunityId, 'deterministic: same brokeredId');
check(o13a.stageIndex === o13b.stageIndex, 'deterministic: same stage');

// ---------------------------------------------------------------------------
// 14. No mutation of input
// ---------------------------------------------------------------------------

console.log('=== Check 14: No mutation ===');

const m14 = createCustomerCaseMatchState('c', 'x', 50, 50, 50, 100, 50, 1);
const originalFit = m14.fit;
setCustomerCaseMatchScores(m14, { fit: 99 }, 2, 'test');
check(m14.fit === originalFit, 'original state not mutated');

const o14 = createBrokeredOpportunityState('opp-1', 'm', 'c', 'x', 1, 'l', 'a', 'a', 'd', 'r', 'ch', 'n', 'b', 5, 1);
const originalStage = o14.stageIndex;
setBrokeredOpportunityStage(o14, 99, 'x', 2, 'test');
check(o14.stageIndex === originalStage, 'original opportunity not mutated');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Summary ===`);
console.log(`Total: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);

if (failed > 0) {
  console.log('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\nselling-houses opportunity split write source contract verification passed');
  process.exit(0);
}
