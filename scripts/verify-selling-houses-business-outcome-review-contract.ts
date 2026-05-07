/**
 * BusinessOutcomeReview v0 contract verification.
 *
 * Validates:
 * 1. All types compile
 * 2. buildBusinessOutcomeReview builds correctly
 * 3. buildEmptyBusinessOutcomeReview works
 * 4. Metrics, findings, next steps work
 * 5. All outcome types work
 * 6. Deterministic and frozen
 * 7. Core boundary clean
 * 8. Business test cases
 */

import { readFileSync } from 'node:fs';

import {
  buildBusinessOutcomeReview,
  buildEmptyBusinessOutcomeReview,
  type BusinessOutcomeReview,
  type BusinessOutcomeReviewMetric,
  type BusinessOutcomeReviewFinding,
  type BusinessOutcomeReviewNextStep,
} from '../src/selling-houses/core/world-state/strategy/index.js';

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string) {
  if (condition) { passed++; }
  else { failed++; console.error(`  [FAIL] ${message}`); }
}

// ---------------------------------------------------------------------------
// 1. Type compilation
// ---------------------------------------------------------------------------

console.log('=== Check 1: Type compilation ===');

const metric: BusinessOutcomeReviewMetric = {
  metricId: 'm1',
  label: '成交天数',
  value: 7,
  unit: '天',
  direction: 'improved',
  significance: 'high',
};
check(typeof metric.metricId === 'string', 'BusinessOutcomeReviewMetric compiles');

const finding: BusinessOutcomeReviewFinding = {
  findingId: 'f1',
  kind: 'success_factor',
  description: '快速成交',
  evidenceRefs: ['receipt-1'],
  impact: 'high',
};
check(typeof finding.findingId === 'string', 'BusinessOutcomeReviewFinding compiles');

const nextStep: BusinessOutcomeReviewNextStep = {
  stepId: 'ns1',
  actionKind: 'owner_call',
  description: '跟进业主',
  priority: 'high',
  rationale: '维护关系',
  relatedFindingIds: ['f1'],
};
check(typeof nextStep.stepId === 'string', 'BusinessOutcomeReviewNextStep compiles');

console.log('  Type compilation: PASS');

// ---------------------------------------------------------------------------
// 2. buildBusinessOutcomeReview
// ---------------------------------------------------------------------------

console.log('=== Check 2: buildBusinessOutcomeReview ===');

const review = buildBusinessOutcomeReview({
  caseId: 'case-1',
  processRunId: 'run-1',
  processKind: 'price_adjustment_communication',
  startedDay: 5,
  endedDay: 12,
  metrics: [
    {
      metricId: 'm-duration',
      label: '流程天数',
      value: 7,
      unit: '天',
      direction: 'improved',
      significance: 'medium',
    },
    {
      metricId: 'm-blockers',
      label: '阻塞次数',
      value: 2,
      unit: '次',
      direction: 'worsened',
      significance: 'low',
    },
  ],
  findings: [
    {
      findingId: 'f-success',
      kind: 'success_factor',
      description: '快速成交',
      evidenceRefs: ['receipt-1'],
      impact: 'high',
    },
    {
      findingId: 'f-risk',
      kind: 'risk_factor',
      description: '业主犹豫',
      evidenceRefs: ['belief-1'],
      impact: 'medium',
    },
  ],
  nextSteps: [
    {
      stepId: 'ns-1',
      actionKind: 'owner_call',
      description: '跟进业主',
      priority: 'high',
      rationale: '维护关系',
      relatedFindingIds: ['f-success'],
    },
  ],
  overallOutcome: 'success',
  summary: '调价沟通成功，业主接受调价',
});

check(review.reviewId.startsWith('review:'), 'review: reviewId format');
check(review.caseId === 'case-1', 'review: caseId');
check(review.processRunId === 'run-1', 'review: processRunId');
check(review.processKind === 'price_adjustment_communication', 'review: processKind');
check(review.startedDay === 5, 'review: startedDay=5');
check(review.endedDay === 12, 'review: endedDay=12');
check(review.durationDays === 7, 'review: durationDays=7');
check(review.metrics.length === 2, 'review: 2 metrics');
check(review.findings.length === 2, 'review: 2 findings');
check(review.nextSteps.length === 1, 'review: 1 nextStep');
check(review.overallOutcome === 'success', 'review: overallOutcome=success');
check(review.summary === '调价沟通成功，业主接受调价', 'review: summary');
check(Object.isFrozen(review), 'review: frozen');
check(Object.isFrozen(review.metrics), 'review: metrics frozen');
check(Object.isFrozen(review.findings), 'review: findings frozen');
check(Object.isFrozen(review.nextSteps), 'review: nextSteps frozen');

console.log('  buildBusinessOutcomeReview: PASS');

// ---------------------------------------------------------------------------
// 3. buildEmptyBusinessOutcomeReview
// ---------------------------------------------------------------------------

console.log('=== Check 3: buildEmptyBusinessOutcomeReview ===');

const empty = buildEmptyBusinessOutcomeReview('case-empty', 'showing_to_offer_conversion', 10);
check(empty.caseId === 'case-empty', 'empty: caseId');
check(empty.processKind === 'showing_to_offer_conversion', 'empty: processKind');
check(empty.startedDay === 10, 'empty: startedDay=10');
check(empty.endedDay === 10, 'empty: endedDay=10');
check(empty.durationDays === 0, 'empty: durationDays=0');
check(empty.metrics.length === 0, 'empty: no metrics');
check(empty.findings.length === 0, 'empty: no findings');
check(empty.nextSteps.length === 0, 'empty: no nextSteps');
check(empty.overallOutcome === 'neutral', 'empty: overallOutcome=neutral');
check(empty.summary === '', 'empty: summary empty');
check(Object.isFrozen(empty), 'empty: frozen');

console.log('  buildEmptyBusinessOutcomeReview: PASS');

// ---------------------------------------------------------------------------
// 4. All outcome types
// ---------------------------------------------------------------------------

console.log('=== Check 4: All outcome types ===');

const allOutcomes: BusinessOutcomeReview['overallOutcome'][] = [
  'success', 'partial_success', 'failure', 'neutral',
];

for (const outcome of allOutcomes) {
  const r = buildBusinessOutcomeReview({
    caseId: 'case-test',
    processKind: 'test',
    startedDay: 1,
    endedDay: 2,
    overallOutcome: outcome,
  });
  check(r.overallOutcome === outcome, `outcome ${outcome}: compiles`);
}

console.log('  All outcome types: PASS');

// ---------------------------------------------------------------------------
// 5. All finding kinds
// ---------------------------------------------------------------------------

console.log('=== Check 5: All finding kinds ===');

const allFindingKinds: BusinessOutcomeReviewFinding['kind'][] = [
  'success_factor', 'failure_factor', 'risk_factor', 'opportunity_missed', 'opportunity_captured',
];

for (const kind of allFindingKinds) {
  const r = buildBusinessOutcomeReview({
    caseId: 'case-test',
    processKind: 'test',
    startedDay: 1,
    endedDay: 2,
    findings: [{
      findingId: `f-${kind}`,
      kind,
      description: `test ${kind}`,
      evidenceRefs: [],
      impact: 'medium',
    }],
  });
  check(r.findings[0].kind === kind, `finding kind ${kind}: compiles`);
}

console.log('  All finding kinds: PASS');

// ---------------------------------------------------------------------------
// 6. All next step priorities
// ---------------------------------------------------------------------------

console.log('=== Check 6: All next step priorities ===');

const allPriorities: BusinessOutcomeReviewNextStep['priority'][] = [
  'urgent', 'high', 'medium', 'low', 'deferred',
];

for (const priority of allPriorities) {
  const r = buildBusinessOutcomeReview({
    caseId: 'case-test',
    processKind: 'test',
    startedDay: 1,
    endedDay: 2,
    nextSteps: [{
      stepId: `ns-${priority}`,
      actionKind: 'test',
      description: `test ${priority}`,
      priority,
      rationale: 'test',
      relatedFindingIds: [],
    }],
  });
  check(r.nextSteps[0].priority === priority, `priority ${priority}: compiles`);
}

console.log('  All next step priorities: PASS');

// ---------------------------------------------------------------------------
// 7. Deterministic and frozen
// ---------------------------------------------------------------------------

console.log('=== Check 7: Deterministic and frozen ===');

const input = {
  caseId: 'case-det',
  processKind: 'test',
  startedDay: 1,
  endedDay: 2,
  metrics: [{
    metricId: 'm-det',
    label: 'test',
    value: 1,
    unit: 'test',
    direction: 'improved' as const,
    significance: 'low' as const,
  }],
  findings: [{
    findingId: 'f-det',
    kind: 'success_factor' as const,
    description: 'test',
    evidenceRefs: [],
    impact: 'low' as const,
  }],
  nextSteps: [{
    stepId: 'ns-det',
    actionKind: 'test',
    description: 'test',
    priority: 'low' as const,
    rationale: 'test',
    relatedFindingIds: [],
  }],
};

const a = buildBusinessOutcomeReview(input);
const b = buildBusinessOutcomeReview(input);
// Different reviewIds due to sequence counter, but same content
check(a.caseId === b.caseId, 'deterministic: same caseId');
check(a.processKind === b.processKind, 'deterministic: same processKind');
check(a.durationDays === b.durationDays, 'deterministic: same durationDays');
check(a.overallOutcome === b.overallOutcome, 'deterministic: same overallOutcome');

check(Object.isFrozen(a), 'frozen: review frozen');
check(Object.isFrozen(a.metrics), 'frozen: metrics frozen');
check(Object.isFrozen(a.findings), 'frozen: findings frozen');
check(Object.isFrozen(a.nextSteps), 'frozen: nextSteps frozen');

console.log('  Deterministic and frozen: PASS');

// ---------------------------------------------------------------------------
// 8. Core boundary
// ---------------------------------------------------------------------------

console.log('=== Check 8: Core boundary ===');

const src = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/strategy/models.ts', 'utf-8');
const srcWithoutComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!srcWithoutComments.includes("from '../../domain"), 'no domain imports');
check(!srcWithoutComments.includes("from '../../runtime"), 'no runtime imports');
check(!srcWithoutComments.includes('Date.now'), 'no Date.now');
check(!srcWithoutComments.includes('Math.random'), 'no Math.random');

console.log('  Core boundary: PASS');

// ---------------------------------------------------------------------------
// 9. Business test cases
// ---------------------------------------------------------------------------

console.log('=== Check 9: Business test cases ===');

// Case 1: successful price adjustment review
const successReview = buildBusinessOutcomeReview({
  caseId: 'case-success',
  processRunId: 'run-success',
  processKind: 'price_adjustment_communication',
  startedDay: 5,
  endedDay: 12,
  metrics: [
    { metricId: 'm1', label: '流程天数', value: 7, unit: '天', direction: 'improved', significance: 'medium' },
    { metricId: 'm2', label: '阻塞次数', value: 1, unit: '次', direction: 'improved', significance: 'low' },
    { metricId: 'm3', label: '业主信任变化', value: 15, unit: '点', direction: 'improved', significance: 'high' },
  ],
  findings: [
    { findingId: 'f1', kind: 'success_factor', description: '快速调价成功', evidenceRefs: ['receipt-1'], impact: 'high' },
    { findingId: 'f2', kind: 'opportunity_captured', description: '客户意向提升', evidenceRefs: ['eval-1'], impact: 'medium' },
  ],
  nextSteps: [
    { stepId: 'ns1', actionKind: 'owner_call', description: '维护关系', priority: 'medium', rationale: '保持信任', relatedFindingIds: ['f1'] },
  ],
  overallOutcome: 'success',
  summary: '调价沟通成功，业主接受调价，客户意向提升',
});

check(successReview.overallOutcome === 'success', 'success: outcome');
check(successReview.metrics.length === 3, 'success: 3 metrics');
check(successReview.findings.length === 2, 'success: 2 findings');
check(successReview.findings[0].kind === 'success_factor', 'success: success_factor');
check(successReview.findings[1].kind === 'opportunity_captured', 'success: opportunity_captured');

// Case 2: failed sincerity sale review
const failureReview = buildBusinessOutcomeReview({
  caseId: 'case-failure',
  processKind: 'sincerity_sale_push',
  startedDay: 1,
  endedDay: 11,
  metrics: [
    { metricId: 'm1', label: '流程天数', value: 10, unit: '天', direction: 'worsened', significance: 'high' },
    { metricId: 'm2', label: '阻塞次数', value: 3, unit: '次', direction: 'worsened', significance: 'high' },
  ],
  findings: [
    { findingId: 'f1', kind: 'failure_factor', description: '业主拒绝诚意售', evidenceRefs: ['receipt-1'], impact: 'high' },
    { findingId: 'f2', kind: 'risk_factor', description: '客户流失风险', evidenceRefs: ['belief-1'], impact: 'medium' },
    { findingId: 'f3', kind: 'opportunity_missed', description: '错过最佳时机', evidenceRefs: ['eval-1'], impact: 'low' },
  ],
  nextSteps: [
    { stepId: 'ns1', actionKind: 'owner_call', description: '重新评估策略', priority: 'urgent', rationale: '需要新方案', relatedFindingIds: ['f1'] },
    { stepId: 'ns2', actionKind: 'escalation', description: '升级给经理', priority: 'high', rationale: '需要支持', relatedFindingIds: ['f1', 'f2'] },
  ],
  overallOutcome: 'failure',
  summary: '诚意售失败，业主拒绝，需要重新评估',
});

check(failureReview.overallOutcome === 'failure', 'failure: outcome');
check(failureReview.findings.length === 3, 'failure: 3 findings');
check(failureReview.findings[0].kind === 'failure_factor', 'failure: failure_factor');
check(failureReview.findings[2].kind === 'opportunity_missed', 'failure: opportunity_missed');
check(failureReview.nextSteps.length === 2, 'failure: 2 nextSteps');

// Case 3: partial success
const partialReview = buildBusinessOutcomeReview({
  caseId: 'case-partial',
  processKind: 'showing_to_offer_conversion',
  startedDay: 1,
  endedDay: 6,
  overallOutcome: 'partial_success',
  summary: '带看完成但客户未下定',
});

check(partialReview.overallOutcome === 'partial_success', 'partial: outcome');
check(partialReview.durationDays === 5, 'partial: durationDays=5');

console.log('  Business test cases: PASS');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Summary ===`);
console.log(`Total: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);

if (failed > 0) {
  console.log('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\nselling-houses business-outcome-review contract verification passed');
  process.exit(0);
}
