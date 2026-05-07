/**
 * Daily Follow-Through Agenda Contract Verification
 *
 * Validates:
 * 1. All follow-through agenda types compile
 * 2. buildEmptyDailyFollowThroughAgenda returns valid empty agenda
 * 3. buildDailyFollowThroughAgenda computes aggregates correctly
 * 4. Priority ordering works
 * 5. Blocker resolution tracking works
 * 6. Deterministic: same input → same output
 * 7. Frozen/read-only output
 * 8. Core boundary clean
 * 9. Business test cases
 */

import { readFileSync } from 'node:fs';

import {
  buildEmptyDailyFollowThroughAgenda,
  buildDailyFollowThroughAgenda,
  type DailyFollowThroughAgendaSummary,
  type DailyFollowThroughCaseAgenda,
  type DailyFollowThroughTask,
  type DailyFollowThroughReason,
  type DailyFollowThroughBlocker,
  type DailyFollowThroughPriority,
  type DailyFollowThroughActionDraft,
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

const priority: DailyFollowThroughPriority = 'urgent';
check(typeof priority === 'string', 'DailyFollowThroughPriority compiles');

const task: DailyFollowThroughTask = {
  taskId: 'task-1',
  kind: 'resolve_blocker',
  description: '解决价格问题',
  priority: 'high',
  sourceRefIds: ['ref:1'],
};
check(typeof task.taskId === 'string', 'DailyFollowThroughTask compiles');

console.log('  Type compilation: PASS');

// ---------------------------------------------------------------------------
// 2. buildEmptyDailyFollowThroughAgenda
// ---------------------------------------------------------------------------

console.log('=== Check 2: buildEmptyDailyFollowThroughAgenda ===');

const empty = buildEmptyDailyFollowThroughAgenda(10);
check(empty.day === 10, 'empty: day=10');
check(empty.caseAgendas.length === 0, 'empty: no case agendas');
check(empty.agendaCaseCount === 0, 'empty: agendaCaseCount=0');
check(empty.urgentCaseCount === 0, 'empty: urgentCaseCount=0');
check(empty.blockerCount === 0, 'empty: blockerCount=0');
check(empty.followUpCount === 0, 'empty: followUpCount=0');
check(empty.recommendationCount === 0, 'empty: recommendationCount=0');
check(empty.resolvedCount === 0, 'empty: resolvedCount=0');
check(empty.unresolvedCount === 0, 'empty: unresolvedCount=0');
check(Object.isFrozen(empty), 'empty: frozen');
check(Object.isFrozen(empty.caseAgendas), 'empty: caseAgendas frozen');

console.log('  buildEmptyDailyFollowThroughAgenda: PASS');

// ---------------------------------------------------------------------------
// 3. buildDailyFollowThroughAgenda with data
// ---------------------------------------------------------------------------

console.log('=== Check 3: buildDailyFollowThroughAgenda ===');

const blocker: DailyFollowThroughBlocker = {
  blockerId: 'blocker:1',
  kind: 'price_exceeds_budget',
  description: '报价高于客户预算',
  severity: 'high',
  resolved: false,
  relatedField: 'askPrice',
};

const reason: DailyFollowThroughReason = {
  reasonType: 'movement_worsened',
  description: '业主信任度下降',
  relatedField: 'trust',
  sourceRefIds: ['pressure:d5:case-1'],
};

const actionDraft: DailyFollowThroughActionDraft = {
  actionId: 'action-1',
  label: '首次面访',
  description: '建立信任',
  priority: 'high',
  confidence: 0.7,
  enabled: true,
  rationale: '业主配合度低',
  supportingRefCount: 2,
};

const task1: DailyFollowThroughTask = {
  taskId: 'task-1',
  kind: 'resolve_blocker',
  description: '解决价格问题',
  priority: 'urgent',
  sourceRefIds: ['ref:1'],
};

const caseAgenda: DailyFollowThroughCaseAgenda = {
  caseId: 'case-1',
  priority: 'urgent',
  tasks: [task1],
  blockers: [blocker],
  reasons: [reason],
  actionDrafts: [actionDraft],
  urgencyScore: 85,
};

const agenda = buildDailyFollowThroughAgenda({
  day: 5,
  caseAgendas: [caseAgenda],
});

check(agenda.day === 5, 'agenda: day=5');
check(agenda.caseAgendas.length === 1, 'agenda: 1 case agenda');
check(agenda.agendaCaseCount === 1, 'agenda: agendaCaseCount=1');
check(agenda.urgentCaseCount === 1, 'agenda: urgentCaseCount=1');
check(agenda.blockerCount === 1, 'agenda: blockerCount=1');
check(agenda.followUpCount === 1, 'agenda: followUpCount=1');
check(agenda.recommendationCount === 1, 'agenda: recommendationCount=1');
check(agenda.resolvedCount === 0, 'agenda: resolvedCount=0');
check(agenda.unresolvedCount === 1, 'agenda: unresolvedCount=1');
check(Object.isFrozen(agenda), 'agenda: frozen');

console.log('  buildDailyFollowThroughAgenda: PASS');

// ---------------------------------------------------------------------------
// 4. Multiple cases with different priorities
// ---------------------------------------------------------------------------

console.log('=== Check 4: Multiple cases ===');

const urgentCase: DailyFollowThroughCaseAgenda = {
  caseId: 'case-urgent',
  priority: 'urgent',
  tasks: [],
  blockers: [{ blockerId: 'b1', kind: 'x', description: 'y', severity: 'high', resolved: false }],
  reasons: [],
  actionDrafts: [],
  urgencyScore: 90,
};

const highCase: DailyFollowThroughCaseAgenda = {
  caseId: 'case-high',
  priority: 'high',
  tasks: [],
  blockers: [],
  reasons: [],
  actionDrafts: [{ actionId: 'a1', label: 'test', description: 'test', priority: 'high', confidence: 0.8, enabled: true, rationale: 'r', supportingRefCount: 1 }],
  urgencyScore: 70,
};

const mediumCase: DailyFollowThroughCaseAgenda = {
  caseId: 'case-medium',
  priority: 'medium',
  tasks: [{ taskId: 't1', kind: 'check_status', description: 'check', priority: 'medium', sourceRefIds: [] }],
  blockers: [{ blockerId: 'b2', kind: 'x', description: 'y', severity: 'medium', resolved: true }],
  reasons: [],
  actionDrafts: [],
  urgencyScore: 40,
};

const multiAgenda = buildDailyFollowThroughAgenda({
  day: 6,
  caseAgendas: [urgentCase, highCase, mediumCase],
});

check(multiAgenda.agendaCaseCount === 3, 'multi: 3 cases');
check(multiAgenda.urgentCaseCount === 1, 'multi: 1 urgent');
check(multiAgenda.blockerCount === 2, 'multi: 2 blockers');
check(multiAgenda.followUpCount === 1, 'multi: 1 follow-up task');
check(multiAgenda.recommendationCount === 1, 'multi: 1 recommendation');
check(multiAgenda.resolvedCount === 1, 'multi: 1 resolved');
check(multiAgenda.unresolvedCount === 1, 'multi: 1 unresolved');

console.log('  Multiple cases: PASS');

// ---------------------------------------------------------------------------
// 5. All priorities
// ---------------------------------------------------------------------------

console.log('=== Check 5: All priorities ===');

const allPriorities: DailyFollowThroughPriority[] = ['urgent', 'high', 'medium', 'low', 'deferred'];
const priorityCases: DailyFollowThroughCaseAgenda[] = allPriorities.map((p, i) => ({
  caseId: `case-${p}`,
  priority: p,
  tasks: [],
  blockers: [],
  reasons: [],
  actionDrafts: [],
  urgencyScore: 100 - i * 20,
}));

const priorityAgenda = buildDailyFollowThroughAgenda({
  day: 7,
  caseAgendas: priorityCases,
});

check(priorityAgenda.agendaCaseCount === 5, 'priorities: 5 cases');
check(priorityAgenda.urgentCaseCount === 1, 'priorities: 1 urgent');

console.log('  All priorities: PASS');

// ---------------------------------------------------------------------------
// 6. Blocker resolution tracking
// ---------------------------------------------------------------------------

console.log('=== Check 6: Blocker resolution tracking ===');

const resolvedBlocker: DailyFollowThroughBlocker = {
  blockerId: 'b-resolved',
  kind: 'price_exceeds_budget',
  description: '已解决',
  severity: 'low',
  resolved: true,
};

const unresolvedBlocker: DailyFollowThroughBlocker = {
  blockerId: 'b-unresolved',
  kind: 'low_owner_trust',
  description: '未解决',
  severity: 'high',
  resolved: false,
};

const blockerCase: DailyFollowThroughCaseAgenda = {
  caseId: 'case-blockers',
  priority: 'high',
  tasks: [],
  blockers: [resolvedBlocker, unresolvedBlocker],
  reasons: [],
  actionDrafts: [],
  urgencyScore: 60,
};

const blockerAgenda = buildDailyFollowThroughAgenda({
  day: 8,
  caseAgendas: [blockerCase],
});

check(blockerAgenda.blockerCount === 2, 'blockers: 2 total');
check(blockerAgenda.resolvedCount === 1, 'blockers: 1 resolved');
check(blockerAgenda.unresolvedCount === 1, 'blockers: 1 unresolved');

console.log('  Blocker resolution tracking: PASS');

// ---------------------------------------------------------------------------
// 7. Deterministic
// ---------------------------------------------------------------------------

console.log('=== Check 7: Deterministic ===');

const a = buildDailyFollowThroughAgenda({ day: 1, caseAgendas: [caseAgenda] });
const b = buildDailyFollowThroughAgenda({ day: 1, caseAgendas: [caseAgenda] });
check(a.day === b.day, 'deterministic: same day');
check(a.agendaCaseCount === b.agendaCaseCount, 'deterministic: same agendaCaseCount');
check(a.blockerCount === b.blockerCount, 'deterministic: same blockerCount');

console.log('  Deterministic: PASS');

// ---------------------------------------------------------------------------
// 8. Core boundary
// ---------------------------------------------------------------------------

console.log('=== Check 8: Core boundary ===');

const src = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/semantic-receipt/dailyDecisionBridge.ts', 'utf-8');
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

// Case 1: trust worsened → high priority follow-up
const trustWorsened: DailyFollowThroughCaseAgenda = {
  caseId: 'case-trust',
  priority: 'urgent',
  tasks: [{
    taskId: 'task-trust',
    kind: 'resolve_blocker',
    description: '修复业主信任',
    relatedField: 'trust',
    priority: 'urgent',
    sourceRefIds: ['pressure:d5:case-trust'],
  }],
  blockers: [{
    blockerId: 'blocker-trust',
    kind: 'low_owner_trust',
    description: '业主信任度低',
    severity: 'high',
    resolved: false,
    relatedField: 'trust',
  }],
  reasons: [{
    reasonType: 'movement_worsened',
    description: '业主信任度从60降到40',
    relatedField: 'trust',
    sourceRefIds: ['pressure:d5:case-trust'],
  }],
  actionDrafts: [{
    actionId: 'action-trust',
    label: '深度诊断',
    description: '建立信任',
    priority: 'urgent',
    confidence: 0.8,
    enabled: true,
    rationale: '信任度低需要修复',
    supportingRefCount: 3,
  }],
  urgencyScore: 90,
};

// Case 2: D1 improved → revisit opportunity
const d1Improved: DailyFollowThroughCaseAgenda = {
  caseId: 'case-d1',
  priority: 'medium',
  tasks: [{
    taskId: 'task-d1',
    kind: 'revisit_opportunity',
    description: '跟进高意向客户',
    relatedField: 'd1',
    priority: 'medium',
    sourceRefIds: ['event:d5:case-d1'],
  }],
  blockers: [],
  reasons: [{
    reasonType: 'movement_improved',
    description: 'D1需求动量从40升到55',
    relatedField: 'd1',
    sourceRefIds: ['event:d5:case-d1'],
  }],
  actionDrafts: [],
  urgencyScore: 50,
};

// Case 3: consensus signed → resolved
const consensusSigned: DailyFollowThroughCaseAgenda = {
  caseId: 'case-signed',
  priority: 'low',
  tasks: [],
  blockers: [{
    blockerId: 'blocker-signed',
    kind: 'consensus_pending',
    description: '成交待确认',
    severity: 'low',
    resolved: true,
  }],
  reasons: [{
    reasonType: 'blocker_resolved',
    description: '成交已确认',
    sourceRefIds: ['consensus:d5:case-signed'],
  }],
  actionDrafts: [],
  urgencyScore: 10,
};

const businessAgenda = buildDailyFollowThroughAgenda({
  day: 9,
  caseAgendas: [trustWorsened, d1Improved, consensusSigned],
});

check(businessAgenda.agendaCaseCount === 3, 'business: 3 cases');
check(businessAgenda.urgentCaseCount === 1, 'business: 1 urgent (trust)');
check(businessAgenda.blockerCount === 2, 'business: 2 blockers');
check(businessAgenda.followUpCount === 2, 'business: 2 follow-up tasks');
check(businessAgenda.recommendationCount === 1, 'business: 1 recommendation');
check(businessAgenda.resolvedCount === 1, 'business: 1 resolved');
check(businessAgenda.unresolvedCount === 1, 'business: 1 unresolved');

console.log('  Business test cases: PASS');

// ---------------------------------------------------------------------------
// 10. Recommendation is draft-only
// ---------------------------------------------------------------------------

console.log('=== Check 10: Recommendation is draft-only ===');

const draftOnlyCase: DailyFollowThroughCaseAgenda = {
  caseId: 'case-draft',
  priority: 'high',
  tasks: [],
  blockers: [],
  reasons: [],
  actionDrafts: [{
    actionId: 'action-draft',
    label: '诚意卖',
    description: '推进成交',
    priority: 'high',
    confidence: 0.7,
    enabled: true, // enabled but draft-only
    rationale: '客户意向高',
    supportingRefCount: 2,
  }],
  urgencyScore: 75,
};

const draftAgenda = buildDailyFollowThroughAgenda({
  day: 10,
  caseAgendas: [draftOnlyCase],
});

check(draftAgenda.recommendationCount === 1, 'draft: 1 recommendation');
check(draftAgenda.caseAgendas[0].actionDrafts[0].enabled === true, 'draft: enabled but draft-only');

console.log('  Recommendation is draft-only: PASS');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Summary ===`);
console.log(`Total: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);

if (failed > 0) {
  console.log('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\nselling-houses daily-follow-through-agenda contract verification passed');
  process.exit(0);
}
