/**
 * DailyDecisionBridge v0 contract verification.
 *
 * Validates:
 * 1. All types compile
 * 2. buildEmptyDailyDecisionBridgeSummary returns valid empty bundle
 * 3. buildDailyDecisionBridgeSummary computes totals correctly
 * 4. All fields are frozen/read-only
 * 5. Deterministic: same input → same output
 * 6. Core boundary clean (no domain/runtime imports)
 */

import { readFileSync } from 'node:fs';

import {
  buildEmptyDailyDecisionBridgeSummary,
  buildDailyDecisionBridgeSummary,
  type DailyDecisionBridgeSummary,
  type DailyCaseDecisionSummary,
  type DailyDecisionMovedField,
  type DailyDecisionWhyRef,
  type DailyDecisionBlockerRef,
  type DailyDecisionCommitmentRef,
  type DailyActorPovChangeSummary,
  type DailyBeliefChangeRef,
  type DailySignalChangeRef,
  type DailyRecommendationSummary,
} from '../src/selling-houses/core/world-state/semantic-receipt/index.js';

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

const sampleSummary: DailyDecisionBridgeSummary = buildEmptyDailyDecisionBridgeSummary(5);
check(typeof sampleSummary.day === 'number', 'DailyDecisionBridgeSummary compiles');
check(sampleSummary.totalMovedCases === 0, 'empty: totalMovedCases=0');

console.log('  Type compilation: PASS');

// ---------------------------------------------------------------------------
// 2. buildEmptyDailyDecisionBridgeSummary
// ---------------------------------------------------------------------------

console.log('=== Check 2: buildEmptyDailyDecisionBridgeSummary ===');

const empty = buildEmptyDailyDecisionBridgeSummary(10);
check(empty.day === 10, 'empty: day=10');
check(empty.movedCases.length === 0, 'empty: no moved cases');
check(empty.actorPovChanges.length === 0, 'empty: no POV changes');
check(empty.recommendations.length === 0, 'empty: no recommendations');
check(empty.totalMovedCases === 0, 'empty: totalMovedCases=0');
check(empty.totalBlockers === 0, 'empty: totalBlockers=0');
check(empty.totalCommitments === 0, 'empty: totalCommitments=0');
check(Object.isFrozen(empty), 'empty: frozen');
check(Object.isFrozen(empty.movedCases), 'empty: movedCases frozen');

console.log('  buildEmptyDailyDecisionBridgeSummary: PASS');

// ---------------------------------------------------------------------------
// 3. buildDailyDecisionBridgeSummary with data
// ---------------------------------------------------------------------------

console.log('=== Check 3: buildDailyDecisionBridgeSummary ===');

const movedField: DailyDecisionMovedField = {
  field: 'trust',
  previousValue: 50,
  newValue: 60,
  delta: 10,
  reason: 'owner call improved trust',
};

const whyRef: DailyDecisionWhyRef = {
  refType: 'pressure_receipt',
  refId: 'pressure:d5:case-1',
  summary: 'rival pressure reduced',
  relevance: 0.8,
};

const blocker: DailyDecisionBlockerRef = {
  blockerId: 'blocker:1',
  kind: 'price_exceeds_budget',
  description: '报价高于客户预算',
  severity: 'high',
  relatedField: 'askPrice',
};

const commitment: DailyDecisionCommitmentRef = {
  commitmentId: 'commitment:1',
  kind: 'timeline_agreement',
  actorId: 'owner:case-1',
  action: 'created',
  strength: 70,
  reason: '业主同意下周调价',
};

const movedCase: DailyCaseDecisionSummary = {
  caseId: 'case-1',
  movedFields: [movedField],
  whyRefs: [whyRef],
  blockers: [blocker],
  commitments: [commitment],
  actorIds: ['broker:current', 'owner:case-1'],
};

const beliefChange: DailyBeliefChangeRef = {
  beliefId: 'belief:broker_trust',
  beliefKind: 'broker_trust',
  previousConfidence: 0.5,
  newConfidence: 0.6,
  direction: 'strengthened',
  reason: 'owner call improved trust',
};

const signalChange: DailySignalChangeRef = {
  signalId: 'signal:1',
  signalKind: 'owner-readiness-low',
  severity: 'watch',
  label: '业主配合度低',
  appeared: true,
};

const povChange: DailyActorPovChangeSummary = {
  actorId: 'broker:current',
  actorKind: 'broker',
  changedBeliefs: [beliefChange],
  changedSignals: [signalChange],
  caseIds: ['case-1'],
};

const recommendation: DailyRecommendationSummary = {
  actionSpecId: 'first-visit',
  caseId: 'case-1',
  label: '首次面访',
  priority: 80,
  confidence: 0.7,
  enabled: true,
  rationale: '业主配合度低，需要建立信任',
  supportingSignalCount: 2,
  decisionMomentCount: 1,
};

const summary = buildDailyDecisionBridgeSummary({
  day: 5,
  movedCases: [movedCase],
  actorPovChanges: [povChange],
  recommendations: [recommendation],
});

check(summary.day === 5, 'summary: day=5');
check(summary.movedCases.length === 1, 'summary: 1 moved case');
check(summary.actorPovChanges.length === 1, 'summary: 1 POV change');
check(summary.recommendations.length === 1, 'summary: 1 recommendation');
check(summary.totalMovedCases === 1, 'summary: totalMovedCases=1');
check(summary.totalBlockers === 1, 'summary: totalBlockers=1');
check(summary.totalCommitments === 1, 'summary: totalCommitments=1');
check(Object.isFrozen(summary), 'summary: frozen');

// Check moved case details
const mc = summary.movedCases[0];
check(mc.caseId === 'case-1', 'movedCase: caseId');
check(mc.movedFields.length === 1, 'movedCase: 1 moved field');
check(mc.movedFields[0].field === 'trust', 'movedField: field=trust');
check(mc.movedFields[0].delta === 10, 'movedField: delta=10');
check(mc.whyRefs.length === 1, 'movedCase: 1 whyRef');
check(mc.whyRefs[0].refType === 'pressure_receipt', 'whyRef: refType');
check(mc.blockers.length === 1, 'movedCase: 1 blocker');
check(mc.blockers[0].severity === 'high', 'blocker: severity=high');
check(mc.commitments.length === 1, 'movedCase: 1 commitment');
check(mc.commitments[0].action === 'created', 'commitment: action=created');

// Check POV change details
const pv = summary.actorPovChanges[0];
check(pv.actorId === 'broker:current', 'povChange: actorId');
check(pv.actorKind === 'broker', 'povChange: actorKind');
check(pv.changedBeliefs.length === 1, 'povChange: 1 belief change');
check(pv.changedBeliefs[0].direction === 'strengthened', 'beliefChange: strengthened');
check(pv.changedSignals.length === 1, 'povChange: 1 signal change');
check(pv.changedSignals[0].appeared === true, 'signalChange: appeared');

// Check recommendation details
const rec = summary.recommendations[0];
check(rec.actionSpecId === 'first-visit', 'recommendation: actionSpecId');
check(rec.priority === 80, 'recommendation: priority');
check(rec.enabled === true, 'recommendation: enabled');

console.log('  buildDailyDecisionBridgeSummary: PASS');

// ---------------------------------------------------------------------------
// 4. Multiple cases with different blockers/commitments
// ---------------------------------------------------------------------------

console.log('=== Check 4: Multiple cases ===');

const case1: DailyCaseDecisionSummary = {
  caseId: 'case-1',
  movedFields: [],
  whyRefs: [],
  blockers: [
    { blockerId: 'b1', kind: 'price_exceeds_budget', description: 'x', severity: 'high' },
    { blockerId: 'b2', kind: 'low_owner_trust', description: 'y', severity: 'medium' },
  ],
  commitments: [],
  actorIds: ['broker'],
};

const case2: DailyCaseDecisionSummary = {
  caseId: 'case-2',
  movedFields: [],
  whyRefs: [],
  blockers: [],
  commitments: [
    { commitmentId: 'c1', kind: 'timeline_agreement', actorId: 'owner', action: 'created', strength: 50, reason: 'r' },
    { commitmentId: 'c2', kind: 'price_hold', actorId: 'owner', action: 'strengthened', strength: 80, reason: 'r' },
    { commitmentId: 'c3', kind: 'showing_willingness', actorId: 'customer', action: 'weakened', strength: 30, reason: 'r' },
  ],
  actorIds: ['broker', 'owner'],
};

const multi = buildDailyDecisionBridgeSummary({
  day: 6,
  movedCases: [case1, case2],
  actorPovChanges: [],
  recommendations: [],
});

check(multi.totalMovedCases === 2, 'multi: totalMovedCases=2');
check(multi.totalBlockers === 2, 'multi: totalBlockers=2');
check(multi.totalCommitments === 3, 'multi: totalCommitments=3');

console.log('  Multiple cases: PASS');

// ---------------------------------------------------------------------------
// 5. Deterministic
// ---------------------------------------------------------------------------

console.log('=== Check 5: Deterministic ===');

const a = buildDailyDecisionBridgeSummary({ day: 1, movedCases: [movedCase], actorPovChanges: [], recommendations: [] });
const b = buildDailyDecisionBridgeSummary({ day: 1, movedCases: [movedCase], actorPovChanges: [], recommendations: [] });
check(a.day === b.day, 'deterministic: same day');
check(a.totalMovedCases === b.totalMovedCases, 'deterministic: same totalMovedCases');
check(a.totalBlockers === b.totalBlockers, 'deterministic: same totalBlockers');

console.log('  Deterministic: PASS');

// ---------------------------------------------------------------------------
// 6. Core boundary
// ---------------------------------------------------------------------------

console.log('=== Check 6: Core boundary ===');

const src = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/semantic-receipt/dailyDecisionBridge.ts', 'utf-8');
const srcWithoutComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!srcWithoutComments.includes("from '../../domain"), 'no domain imports');
check(!srcWithoutComments.includes("from '../../runtime"), 'no runtime imports');
check(!srcWithoutComments.includes('Date.now'), 'no Date.now');
check(!srcWithoutComments.includes('Math.random'), 'no Math.random');

console.log('  Core boundary: PASS');

// ---------------------------------------------------------------------------
// 7. No raw GameState/Case/Opportunity embedded
// ---------------------------------------------------------------------------

console.log('=== Check 7: No raw domain types embedded ===');

// Check source code without comments
const srcCode = srcWithoutComments;
check(!srcCode.includes('GameState'), 'no GameState reference in code');
check(!srcCode.includes('Case[]'), 'no Case[] reference in code');
check(!srcCode.includes('Opportunity[]'), 'no Opportunity[] reference in code');
check(!srcCode.includes('DailyTickResult'), 'no DailyTickResult reference in code');
check(!srcCode.includes('ActorBelief'), 'no ActorBelief reference in code');
check(!srcCode.includes('CommitmentState'), 'no CommitmentState reference in code');
check(!srcCode.includes('AttentionState'), 'no AttentionState reference in code');
check(!srcCode.includes('InteractionScene'), 'no InteractionScene reference in code');

console.log('  No raw domain types embedded: PASS');

// ---------------------------------------------------------------------------
// 8. Movement types and builders
// ---------------------------------------------------------------------------

console.log('=== Check 8: Movement types and builders ===');

import type {
  DailyOperatingMovementSummary,
  DailyCaseOperatingMovement,
  DailyMovementEntry,
  DailyMovementKind,
  DailyMovementDirection,
  DailyMovementMagnitude,
} from '../src/selling-houses/core/world-state/semantic-receipt/index.js';

// Test movement types compile
const movementKind: DailyMovementKind = 'owner_relation';
const movementDir: DailyMovementDirection = 'improved';
const movementMag: DailyMovementMagnitude = 'high';
check(typeof movementKind === 'string', 'DailyMovementKind compiles');
check(typeof movementDir === 'string', 'DailyMovementDirection compiles');
check(typeof movementMag === 'string', 'DailyMovementMagnitude compiles');

// Test movement entry
const movementEntry: DailyMovementEntry = {
  kind: 'owner_relation',
  direction: 'improved',
  magnitude: 'high',
  field: 'trust',
  from: 50,
  to: 60,
  delta: 10,
  reason: 'owner call improved trust',
  sourceRefIds: ['pressure:d5:case-1'],
};
check(movementEntry.kind === 'owner_relation', 'movementEntry.kind');
check(movementEntry.direction === 'improved', 'movementEntry.direction');

// Test case operating movement
const caseMovement: DailyCaseOperatingMovement = {
  caseId: 'case-1',
  movements: [movementEntry],
  blockerEmergences: [],
  blockerResolutions: [],
  recommendedActionId: 'first-visit',
};
check(caseMovement.caseId === 'case-1', 'caseMovement.caseId');
check(caseMovement.movements.length === 1, 'caseMovement: 1 movement');
check(caseMovement.recommendedActionId === 'first-visit', 'caseMovement: recommendedActionId');

// Test with movement data in bridge summary
const summaryWithMovement = buildDailyDecisionBridgeSummary({
  day: 7,
  movedCases: [],
  actorPovChanges: [],
  recommendations: [],
  caseMovements: [caseMovement],
});

check(summaryWithMovement.operatingMovement !== undefined, 'summary has operatingMovement');
const om = summaryWithMovement.operatingMovement!;
check(om.day === 7, 'operatingMovement: day=7');
check(om.movedCaseCount === 1, 'operatingMovement: movedCaseCount=1');
check(om.improvedCaseCount === 1, 'operatingMovement: improvedCaseCount=1');
check(om.worsenedCaseCount === 0, 'operatingMovement: worsenedCaseCount=0');
check(om.recommendationCount === 1, 'operatingMovement: recommendationCount=1');
check(Object.isFrozen(om), 'operatingMovement: frozen');

console.log('  Movement types and builders: PASS');

// ---------------------------------------------------------------------------
// 9. Business test cases
// ---------------------------------------------------------------------------

console.log('=== Check 9: Business test cases ===');

// Case 1: trust worsened with owner_relation
const trustWorsened: DailyMovementEntry = {
  kind: 'owner_relation',
  direction: 'worsened',
  magnitude: 'high',
  field: 'trust',
  from: 60,
  to: 40,
  delta: -20,
  reason: '业主对经纪人信任下降',
  sourceRefIds: ['pressure:d5:case-1'],
};

// Case 2: D1 improved with customer_opportunity
const d1Improved: DailyMovementEntry = {
  kind: 'customer_opportunity',
  direction: 'improved',
  magnitude: 'medium',
  field: 'd1',
  from: 40,
  to: 55,
  delta: 15,
  reason: '新客户意向增加',
  sourceRefIds: ['event:d5:case-2'],
};

// Case 3: consensus signed with deal_process
const consensusSigned: DailyMovementEntry = {
  kind: 'deal_process',
  direction: 'resolved',
  magnitude: 'high',
  field: 'consensusStage',
  from: 'contract_ready',
  to: 'signed',
  delta: 0,
  reason: '成交签约',
  sourceRefIds: ['consensus:d5:case-3'],
};

// Case 4: pressure increased with competition_pressure
const pressureIncreased: DailyMovementEntry = {
  kind: 'competition_pressure',
  direction: 'worsened',
  magnitude: 'medium',
  field: 'competitiveness',
  from: 70,
  to: 55,
  delta: -15,
  reason: '竞品压力增大',
  sourceRefIds: ['pressure:d5:case-4'],
};

// Case 5: blocker emerged with risk_control
const blockerEmerged: DailyMovementEntry = {
  kind: 'risk_control',
  direction: 'emerged',
  magnitude: 'high',
  field: 'storylineState',
  from: 'healthy',
  to: 'critical',
  delta: 0,
  reason: '房源故事线进入危机状态',
  sourceRefIds: ['event:d5:case-5'],
};

const businessCases: DailyCaseOperatingMovement[] = [
  { caseId: 'case-1', movements: [trustWorsened], blockerEmergences: [], blockerResolutions: [] },
  { caseId: 'case-2', movements: [d1Improved], blockerEmergences: [], blockerResolutions: [] },
  { caseId: 'case-3', movements: [consensusSigned], blockerEmergences: [], blockerResolutions: [], recommendedActionId: 'negotiate' },
  { caseId: 'case-4', movements: [pressureIncreased], blockerEmergences: [], blockerResolutions: [] },
  { caseId: 'case-5', movements: [blockerEmerged], blockerEmergences: [{ blockerId: 'b1', kind: 'storyline_critical', description: '危机', severity: 'high' }], blockerResolutions: [] },
];

const businessSummary = buildDailyDecisionBridgeSummary({
  day: 8,
  movedCases: [],
  actorPovChanges: [],
  recommendations: [],
  caseMovements: businessCases,
});

check(businessSummary.operatingMovement!.movedCaseCount === 5, 'business: 5 moved cases');
check(businessSummary.operatingMovement!.worsenedCaseCount === 2, 'business: 2 worsened (trust + pressure)');
check(businessSummary.operatingMovement!.improvedCaseCount === 1, 'business: 1 improved (d1)');
check(businessSummary.operatingMovement!.blockerCount === 1, 'business: 1 blocker');
check(businessSummary.operatingMovement!.recommendationCount === 1, 'business: 1 recommendation');

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
  console.log('\nselling-houses daily-decision-bridge contract verification passed');
  process.exit(0);
}
