/**
 * DailyOperatingLedger v0 contract verification.
 *
 * Validates:
 * 1. All types compile
 * 2. Empty builder returns correct frozen empty day
 * 3. Day builder computes aggregates correctly
 * 4. Status counting works for all 6 statuses
 * 5. Summarize across days works
 * 6. Replay slice builds correctly
 * 7. Deterministic: same input → byte-identical output
 * 8. Frozen output — no mutation
 * 9. Core boundary clean (no domain/runtime imports)
 * 10. No raw GameState/Case/Opportunity embedded
 */

import { readFileSync } from 'node:fs';

import {
  buildEmptyDailyOperatingLedgerDaySummary,
  buildDailyOperatingLedgerDaySummary,
  summarizeDailyOperatingLedger,
  buildDailyOperatingLedgerReplaySlice,
  type DailyOperatingLedgerDaySummary,
  type DailyOperatingLedgerEntry,
  type DailyOperatingLedgerEntryStatus,
  type DailyOperatingLedgerOutcome,
  type DailyOperatingLedgerTaskItem,
  type DailyOperatingLedgerEvidenceRef,
  type DailyOperatingLedgerSummary,
  type DailyOperatingLedgerReplaySlice,
  type DailyOperatingLedgerEntryInput,
  type DailyOperatingLedgerDayInput,
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

const status: DailyOperatingLedgerEntryStatus = 'pending';
check(typeof status === 'string', 'DailyOperatingLedgerEntryStatus compiles');

const outcome: DailyOperatingLedgerOutcome = {
  outcomeType: 'movement',
  description: 'trust improved',
  direction: 'improved',
  magnitude: 'high',
  field: 'trust',
  from: 50,
  to: 60,
  delta: 10,
  sourceRefIds: ['pressure:d5:case-1'],
};
check(typeof outcome.outcomeType === 'string', 'DailyOperatingLedgerOutcome compiles');

const task: DailyOperatingLedgerTaskItem = {
  taskId: 'task-1',
  kind: 'resolve_blocker',
  description: '解决价格问题',
  priority: 'high',
  relatedField: 'askPrice',
  sourceRefIds: ['ref:1'],
};
check(typeof task.taskId === 'string', 'DailyOperatingLedgerTaskItem compiles');

const evidence: DailyOperatingLedgerEvidenceRef = {
  refType: 'pressure_receipt',
  refId: 'pressure:d5:case-1',
  summary: 'rival pressure reduced',
  relevance: 0.8,
};
check(typeof evidence.refType === 'string', 'DailyOperatingLedgerEvidenceRef compiles');

console.log('  Type compilation: PASS');

// ---------------------------------------------------------------------------
// 2. buildEmptyDailyOperatingLedgerDaySummary
// ---------------------------------------------------------------------------

console.log('=== Check 2: buildEmptyDailyOperatingLedgerDaySummary ===');

const empty = buildEmptyDailyOperatingLedgerDaySummary(10);
check(empty.day === 10, 'empty: day=10');
check(empty.entries.length === 0, 'empty: no entries');
check(empty.entryCount === 0, 'empty: entryCount=0');
check(empty.pendingCount === 0, 'empty: pendingCount=0');
check(empty.resolvedCount === 0, 'empty: resolvedCount=0');
check(empty.signedCount === 0, 'empty: signedCount=0');
check(empty.closedCount === 0, 'empty: closedCount=0');
check(empty.observingCount === 0, 'empty: observingCount=0');
check(empty.riskBlockedCount === 0, 'empty: riskBlockedCount=0');
check(empty.totalTasks === 0, 'empty: totalTasks=0');
check(empty.totalOutcomes === 0, 'empty: totalOutcomes=0');
check(empty.totalEvidenceRefs === 0, 'empty: totalEvidenceRefs=0');
check(Object.isFrozen(empty), 'empty: frozen');
check(Object.isFrozen(empty.entries), 'empty: entries frozen');

console.log('  buildEmptyDailyOperatingLedgerDaySummary: PASS');

// ---------------------------------------------------------------------------
// 3. buildDailyOperatingLedgerDaySummary with data
// ---------------------------------------------------------------------------

console.log('=== Check 3: buildDailyOperatingLedgerDaySummary ===');

const entry1: DailyOperatingLedgerEntryInput = {
  caseId: 'case-1',
  status: 'pending',
  outcomes: [
    {
      outcomeType: 'movement',
      description: 'trust worsened',
      direction: 'worsened',
      magnitude: 'high',
      field: 'trust',
      from: 60,
      to: 40,
      delta: -20,
      sourceRefIds: ['pressure:d5:case-1'],
    },
  ],
  tasks: [
    { taskId: 't1', kind: 'resolve_blocker', description: '修复信任', priority: 'urgent', sourceRefIds: [] },
    { taskId: 't2', kind: 'check_status', description: '跟进业主', priority: 'medium', sourceRefIds: [] },
  ],
  evidenceRefs: [
    { refType: 'pressure_receipt', refId: 'p1', summary: '压力增大', relevance: 0.9 },
  ],
  recommendedActionId: 'first-visit',
  urgencyScore: 85,
  movementSummary: '信任度下降，需要紧急修复',
};

const entry2: DailyOperatingLedgerEntryInput = {
  caseId: 'case-2',
  status: 'resolved',
  outcomes: [
    {
      outcomeType: 'blocker_resolved',
      description: '价格问题解决',
      direction: 'resolved',
      magnitude: 'medium',
      field: 'askPrice',
      sourceRefIds: ['event:d5:case-2'],
    },
  ],
  tasks: [],
  evidenceRefs: [],
  urgencyScore: 20,
  movementSummary: '价格问题已解决',
};

const entry3: DailyOperatingLedgerEntryInput = {
  caseId: 'case-3',
  status: 'signed',
  outcomes: [
    {
      outcomeType: 'contract_signed',
      description: '成交签约',
      direction: 'improved',
      magnitude: 'high',
      sourceRefIds: ['consensus:d5:case-3'],
    },
  ],
  tasks: [],
  evidenceRefs: [
    { refType: 'contract_fact', refId: 'cf1', summary: '成交', relevance: 1.0 },
  ],
  urgencyScore: 0,
  movementSummary: '已成交',
};

const entry4: DailyOperatingLedgerEntryInput = {
  caseId: 'case-4',
  status: 'risk_blocked',
  outcomes: [
    {
      outcomeType: 'blocker_emerged',
      description: '房源故事线进入危机',
      direction: 'emerged',
      magnitude: 'high',
      field: 'storylineState',
      from: 'healthy',
      to: 'critical',
      sourceRefIds: ['event:d5:case-4'],
    },
  ],
  tasks: [
    { taskId: 't3', kind: 'escalate', description: '升级处理', priority: 'urgent', sourceRefIds: [] },
  ],
  evidenceRefs: [],
  urgencyScore: 95,
  movementSummary: '危机状态，需要立即处理',
};

const entry5: DailyOperatingLedgerEntryInput = {
  caseId: 'case-5',
  status: 'observing',
  outcomes: [],
  tasks: [],
  evidenceRefs: [],
  urgencyScore: 10,
  movementSummary: '稳定观察中',
};

const entry6: DailyOperatingLedgerEntryInput = {
  caseId: 'case-6',
  status: 'closed',
  outcomes: [
    {
      outcomeType: 'opportunity_closed',
      description: '机会关闭',
      direction: 'unchanged',
      magnitude: 'low',
      sourceRefIds: [],
    },
  ],
  tasks: [],
  evidenceRefs: [],
  urgencyScore: 0,
  movementSummary: '机会已关闭',
};

const day = buildDailyOperatingLedgerDaySummary({
  day: 5,
  entries: [entry1, entry2, entry3, entry4, entry5, entry6],
});

check(day.day === 5, 'day: day=5');
check(day.entryCount === 6, 'day: 6 entries');
check(day.pendingCount === 1, 'day: 1 pending');
check(day.resolvedCount === 1, 'day: 1 resolved');
check(day.signedCount === 1, 'day: 1 signed');
check(day.closedCount === 1, 'day: 1 closed');
check(day.observingCount === 1, 'day: 1 observing');
check(day.riskBlockedCount === 1, 'day: 1 risk_blocked');
check(day.totalTasks === 3, 'day: 3 tasks');
check(day.totalOutcomes === 5, 'day: 5 outcomes');
check(day.totalEvidenceRefs === 2, 'day: 2 evidence refs');
check(Object.isFrozen(day), 'day: frozen');
check(Object.isFrozen(day.entries), 'day: entries frozen');

// Check entry details
const e1 = day.entries[0];
check(e1.caseId === 'case-1', 'entry1: caseId');
check(e1.status === 'pending', 'entry1: status=pending');
check(e1.outcomes.length === 1, 'entry1: 1 outcome');
check(e1.tasks.length === 2, 'entry1: 2 tasks');
check(e1.evidenceRefs.length === 1, 'entry1: 1 evidence ref');
check(e1.recommendedActionId === 'first-visit', 'entry1: recommendedActionId');
check(e1.urgencyScore === 85, 'entry1: urgencyScore=85');
check(Object.isFrozen(e1), 'entry1: frozen');

console.log('  buildDailyOperatingLedgerDaySummary: PASS');

// ---------------------------------------------------------------------------
// 4. summarizeDailyOperatingLedger
// ---------------------------------------------------------------------------

console.log('=== Check 4: summarizeDailyOperatingLedger ===');

const day1 = buildDailyOperatingLedgerDaySummary({
  day: 1,
  entries: [
    { caseId: 'c1', status: 'pending', outcomes: [], tasks: [], evidenceRefs: [] },
    { caseId: 'c2', status: 'resolved', outcomes: [], tasks: [], evidenceRefs: [] },
  ],
});

const day2 = buildDailyOperatingLedgerDaySummary({
  day: 2,
  entries: [
    { caseId: 'c3', status: 'signed', outcomes: [], tasks: [], evidenceRefs: [] },
    { caseId: 'c4', status: 'risk_blocked', outcomes: [], tasks: [], evidenceRefs: [] },
  ],
});

const summary = summarizeDailyOperatingLedger([day1, day2]);
check(summary.totalDays === 2, 'summary: 2 days');
check(summary.totalEntries === 4, 'summary: 4 entries');
check(summary.totalPending === 1, 'summary: 1 pending');
check(summary.totalResolved === 1, 'summary: 1 resolved');
check(summary.totalSigned === 1, 'summary: 1 signed');
check(summary.totalRiskBlocked === 1, 'summary: 1 risk_blocked');
check(Object.isFrozen(summary), 'summary: frozen');
check(Object.isFrozen(summary.days), 'summary: days frozen');

console.log('  summarizeDailyOperatingLedger: PASS');

// ---------------------------------------------------------------------------
// 5. buildDailyOperatingLedgerReplaySlice
// ---------------------------------------------------------------------------

console.log('=== Check 5: buildDailyOperatingLedgerReplaySlice ===');

const entries: DailyOperatingLedgerEntry[] = [
  {
    caseId: 'case-replay',
    status: 'pending',
    day: 3,
    outcomes: [{
      outcomeType: 'movement',
      description: 'test',
      direction: 'improved',
      magnitude: 'low',
      sourceRefIds: [],
    }],
    tasks: [],
    evidenceRefs: [],
    urgencyScore: 50,
    movementSummary: 'test',
  },
];

const slice = buildDailyOperatingLedgerReplaySlice(3, entries);
check(slice.day === 3, 'slice: day=3');
check(slice.entries.length === 1, 'slice: 1 entry');
check(slice.summary.entryCount === 1, 'slice summary: 1 entry');
check(Object.isFrozen(slice), 'slice: frozen');

console.log('  buildDailyOperatingLedgerReplaySlice: PASS');

// ---------------------------------------------------------------------------
// 6. All 6 statuses work
// ---------------------------------------------------------------------------

console.log('=== Check 6: All 6 statuses ===');

const allStatuses: DailyOperatingLedgerEntryStatus[] = [
  'pending', 'resolved', 'signed', 'closed', 'observing', 'risk_blocked',
];

for (const status of allStatuses) {
  const d = buildDailyOperatingLedgerDaySummary({
    day: 1,
    entries: [{ caseId: `c-${status}`, status, outcomes: [], tasks: [], evidenceRefs: [] }],
  });
  check(d.entryCount === 1, `${status}: entryCount=1`);
}

const mixed = buildDailyOperatingLedgerDaySummary({
  day: 1,
  entries: allStatuses.map((s) => ({
    caseId: `c-${s}`,
    status: s,
    outcomes: [],
    tasks: [],
    evidenceRefs: [],
  })),
});
check(mixed.entryCount === 6, 'mixed: 6 entries');
check(mixed.pendingCount === 1, 'mixed: 1 pending');
check(mixed.resolvedCount === 1, 'mixed: 1 resolved');
check(mixed.signedCount === 1, 'mixed: 1 signed');
check(mixed.closedCount === 1, 'mixed: 1 closed');
check(mixed.observingCount === 1, 'mixed: 1 observing');
check(mixed.riskBlockedCount === 1, 'mixed: 1 risk_blocked');

console.log('  All 6 statuses: PASS');

// ---------------------------------------------------------------------------
// 7. Deterministic
// ---------------------------------------------------------------------------

console.log('=== Check 7: Deterministic ===');

const input: DailyOperatingLedgerDayInput = {
  day: 1,
  entries: [{
    caseId: 'c-det',
    status: 'pending',
    outcomes: [{ outcomeType: 'movement', description: 'test', direction: 'improved', magnitude: 'low', sourceRefIds: [] }],
    tasks: [],
    evidenceRefs: [],
  }],
};

const a = buildDailyOperatingLedgerDaySummary(input);
const b = buildDailyOperatingLedgerDaySummary(input);
check(a.day === b.day, 'deterministic: same day');
check(a.entryCount === b.entryCount, 'deterministic: same entryCount');
check(a.entries[0].caseId === b.entries[0].caseId, 'deterministic: same caseId');
check(JSON.stringify(a) === JSON.stringify(b), 'deterministic: byte-identical JSON');

console.log('  Deterministic: PASS');

// ---------------------------------------------------------------------------
// 8. Frozen output
// ---------------------------------------------------------------------------

console.log('=== Check 8: Frozen output ===');

const frozenDay = buildDailyOperatingLedgerDaySummary({
  day: 1,
  entries: [{
    caseId: 'c-freeze',
    status: 'pending',
    outcomes: [{ outcomeType: 'movement', description: 'test', direction: 'improved', magnitude: 'low', sourceRefIds: [] }],
    tasks: [{ taskId: 't1', kind: 'check_status', description: 'test', priority: 'low', sourceRefIds: [] }],
    evidenceRefs: [{ refType: 'event', refId: 'e1', summary: 'test', relevance: 0.5 }],
  }],
});

check(Object.isFrozen(frozenDay), 'day frozen');
check(Object.isFrozen(frozenDay.entries), 'entries frozen');
check(Object.isFrozen(frozenDay.entries[0]), 'entry frozen');
check(Object.isFrozen(frozenDay.entries[0].outcomes), 'outcomes frozen');
check(Object.isFrozen(frozenDay.entries[0].tasks), 'tasks frozen');
check(Object.isFrozen(frozenDay.entries[0].evidenceRefs), 'evidenceRefs frozen');

console.log('  Frozen output: PASS');

// ---------------------------------------------------------------------------
// 9. Core boundary
// ---------------------------------------------------------------------------

console.log('=== Check 9: Core boundary ===');

const src = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/semantic-receipt/dailyOperatingLedger.ts', 'utf-8');
const srcWithoutComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!srcWithoutComments.includes("from '../../domain"), 'no domain imports');
check(!srcWithoutComments.includes("from '../../runtime"), 'no runtime imports');
check(!srcWithoutComments.includes('Date.now'), 'no Date.now');
check(!srcWithoutComments.includes('Math.random'), 'no Math.random');

console.log('  Core boundary: PASS');

// ---------------------------------------------------------------------------
// 10. No raw domain types embedded
// ---------------------------------------------------------------------------

console.log('=== Check 10: No raw domain types embedded ===');

// Check source code without comments
const srcCode = srcWithoutComments;
check(!srcCode.includes('GameState'), 'no GameState reference in code');
check(!srcCode.includes('Case[]'), 'no Case[] reference in code');
check(!srcCode.includes('Opportunity[]'), 'no Opportunity[] reference in code');
check(!srcCode.includes('DailyTickResult'), 'no DailyTickResult reference in code');

console.log('  No raw domain types embedded: PASS');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Summary ===`);
console.log(`Total: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);

if (failed > 0) {
  console.log('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\nselling-houses daily-operating-ledger contract verification passed');
  process.exit(0);
}
