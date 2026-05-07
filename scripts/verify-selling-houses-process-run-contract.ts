/**
 * ProcessRun v0 contract verification.
 *
 * Validates:
 * 1. All types compile
 * 2. buildEmptyProcessRunSummary returns correct empty summary
 * 3. buildProcessRunFromInput builds correctly
 * 4. summarizeProcessRunsForCase computes aggregates
 * 5. summarizeProcessRunsAcrossCases computes aggregates
 * 6. All 7 statuses work
 * 7. Deterministic and frozen
 * 8. Core boundary clean
 * 9. Business test cases
 */

import { readFileSync } from 'node:fs';

import {
  buildEmptyProcessRunSummary,
  buildProcessRunFromInput,
  summarizeProcessRunsForCase,
  summarizeProcessRunsAcrossCases,
  type ProcessRun,
  type ProcessRunStatus,
  type ProcessRunSummary,
  type ProcessRunAggregatedSummary,
  type ProcessRunBlocker,
  type ProcessRunNextStepDraft,
  type ProcessRunOutcome,
} from '../src/selling-houses/core/world-state/processes/index.js';

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

const status: ProcessRunStatus = 'active';
check(typeof status === 'string', 'ProcessRunStatus compiles');

const blocker: ProcessRunBlocker = {
  blockerId: 'b1',
  kind: 'price_exceeds_budget',
  description: '报价高于预算',
  severity: 'high',
  emergedDay: 3,
  resolved: false,
};
check(typeof blocker.blockerId === 'string', 'ProcessRunBlocker compiles');

const draft: ProcessRunNextStepDraft = {
  draftId: 'd1',
  actionKind: 'owner_call',
  description: '打电话给业主',
  priority: 'high',
  rationale: '需要修复信任',
};
check(typeof draft.draftId === 'string', 'ProcessRunNextStepDraft compiles');

console.log('  Type compilation: PASS');

// ---------------------------------------------------------------------------
// 2. buildEmptyProcessRunSummary
// ---------------------------------------------------------------------------

console.log('=== Check 2: buildEmptyProcessRunSummary ===');

const empty = buildEmptyProcessRunSummary(10);
check(empty.day === 10, 'empty: day=10');
check(empty.totalRuns === 0, 'empty: totalRuns=0');
check(empty.activeRuns === 0, 'empty: activeRuns=0');
check(empty.resolvedRuns === 0, 'empty: resolvedRuns=0');
check(empty.blockedRuns === 0, 'empty: blockedRuns=0');
check(empty.collapsedRuns === 0, 'empty: collapsedRuns=0');
check(empty.convertedRuns === 0, 'empty: convertedRuns=0');
check(empty.expiredRuns === 0, 'empty: expiredRuns=0');
check(empty.supersededRuns === 0, 'empty: supersededRuns=0');
check(empty.totalBlockers === 0, 'empty: totalBlockers=0');
check(empty.unresolvedBlockers === 0, 'empty: unresolvedBlockers=0');
check(empty.totalNextStepDrafts === 0, 'empty: totalNextStepDrafts=0');
check(empty.caseSummaries.length === 0, 'empty: no caseSummaries');
check(Object.isFrozen(empty), 'empty: frozen');

console.log('  buildEmptyProcessRunSummary: PASS');

// ---------------------------------------------------------------------------
// 3. buildProcessRunFromInput
// ---------------------------------------------------------------------------

console.log('=== Check 3: buildProcessRunFromInput ===');

const run = buildProcessRunFromInput({
  templateId: 'tpl-price-adjustment',
  templateKind: 'price_adjustment_communication',
  caseId: 'case-1',
  actorIds: ['broker:current', 'owner:case-1'],
  status: 'active',
  currentPhaseId: 'market-evidence-presented',
  startedDay: 3,
  phaseSnapshots: [
    {
      phaseId: 'price-gap-identified',
      enteredDay: 3,
      exitedDay: 4,
      actionReceiptIds: ['receipt-1'],
      commitmentSettlementIds: [],
      blockers: [],
    },
    {
      phaseId: 'market-evidence-presented',
      enteredDay: 4,
      actionReceiptIds: ['receipt-2'],
      commitmentSettlementIds: [],
    },
  ],
  evidenceRefs: [
    { refType: 'action_receipt', refId: 'receipt-1', summary: '调价沟通', relevance: 0.9 },
    { refType: 'evaluation_snapshot', refId: 'eval-1', summary: '市场评估', relevance: 0.8 },
  ],
  blockers: [{
    blockerId: 'b-1',
    kind: 'owner_hesitation',
    description: '业主犹豫',
    severity: 'medium',
    emergedDay: 4,
    resolved: false,
    relatedPhaseId: 'market-evidence-presented',
  }],
  nextStepDrafts: [{
    draftId: 'draft-1',
    actionKind: 'owner_call',
    description: '跟进业主',
    priority: 'high',
    relatedPhaseId: 'market-evidence-presented',
    rationale: '需要进一步沟通',
  }],
});

check(run.runId.startsWith('run:'), 'run: runId format');
check(run.templateId === 'tpl-price-adjustment', 'run: templateId');
check(run.templateKind === 'price_adjustment_communication', 'run: templateKind');
check(run.caseId === 'case-1', 'run: caseId');
check(run.actorIds.length === 2, 'run: 2 actorIds');
check(run.status === 'active', 'run: status=active');
check(run.currentPhaseId === 'market-evidence-presented', 'run: currentPhaseId');
check(run.startedDay === 3, 'run: startedDay=3');
check(run.durationDays === 0, 'run: durationDays=0 (active)');
check(run.phaseSnapshots.length === 2, 'run: 2 phaseSnapshots');
check(run.evidenceRefs.length === 2, 'run: 2 evidenceRefs');
check(run.blockers.length === 1, 'run: 1 blocker');
check(run.nextStepDrafts.length === 1, 'run: 1 nextStepDraft');
check(Object.isFrozen(run), 'run: frozen');

// Check phase snapshot details
const phase0 = run.phaseSnapshots[0];
check(phase0.phaseId === 'price-gap-identified', 'phase0: phaseId');
check(phase0.enteredDay === 3, 'phase0: enteredDay=3');
check(phase0.exitedDay === 4, 'phase0: exitedDay=4');
check(phase0.durationDays === 1, 'phase0: durationDays=1');
check(phase0.actionReceiptIds.length === 1, 'phase0: 1 actionReceiptId');

const phase1 = run.phaseSnapshots[1];
check(phase1.phaseId === 'market-evidence-presented', 'phase1: phaseId');
check(phase1.enteredDay === 4, 'phase1: enteredDay=4');
check(phase1.exitedDay === undefined, 'phase1: exitedDay=undefined');
check(phase1.durationDays === 0, 'phase1: durationDays=0 (active)');

console.log('  buildProcessRunFromInput: PASS');

// ---------------------------------------------------------------------------
// 4. summarizeProcessRunsForCase
// ---------------------------------------------------------------------------

console.log('=== Check 4: summarizeProcessRunsForCase ===');

const run1 = buildProcessRunFromInput({
  templateId: 'tpl-1',
  templateKind: 'price_adjustment_communication',
  caseId: 'case-1',
  currentPhaseId: 'p1',
  startedDay: 1,
  status: 'active',
});

const run2 = buildProcessRunFromInput({
  templateId: 'tpl-2',
  templateKind: 'showing_to_offer_conversion',
  caseId: 'case-1',
  currentPhaseId: 'p2',
  startedDay: 2,
  status: 'resolved',
});

const caseSummary = summarizeProcessRunsForCase({
  caseId: 'case-1',
  runs: [run1, run2],
});

check(caseSummary.caseId === 'case-1', 'caseSummary: caseId');
check(caseSummary.runs.length === 2, 'caseSummary: 2 runs');
check(caseSummary.activeCount === 1, 'caseSummary: 1 active');
check(caseSummary.resolvedCount === 1, 'caseSummary: 1 resolved');
check(Object.isFrozen(caseSummary), 'caseSummary: frozen');

console.log('  summarizeProcessRunsForCase: PASS');

// ---------------------------------------------------------------------------
// 5. summarizeProcessRunsAcrossCases
// ---------------------------------------------------------------------------

console.log('=== Check 5: summarizeProcessRunsAcrossCases ===');

const caseSummary2 = summarizeProcessRunsForCase({
  caseId: 'case-2',
  runs: [
    buildProcessRunFromInput({
      templateId: 'tpl-3',
      templateKind: 'open_day_campaign',
      caseId: 'case-2',
      currentPhaseId: 'p',
      startedDay: 1,
      status: 'blocked',
      blockers: [{ blockerId: 'b', kind: 'x', description: 'y', severity: 'high', emergedDay: 1, resolved: false }],
    }),
  ],
});

const aggregated = summarizeProcessRunsAcrossCases(5, [caseSummary, caseSummary2]);
check(aggregated.day === 5, 'aggregated: day=5');
check(aggregated.totalRuns === 3, 'aggregated: 3 runs');
check(aggregated.activeRuns === 1, 'aggregated: 1 active');
check(aggregated.resolvedRuns === 1, 'aggregated: 1 resolved');
check(aggregated.blockedRuns === 1, 'aggregated: 1 blocked');
check(aggregated.totalBlockers === 1, 'aggregated: 1 blocker');
check(aggregated.unresolvedBlockers === 1, 'aggregated: 1 unresolved');
check(Object.isFrozen(aggregated), 'aggregated: frozen');

console.log('  summarizeProcessRunsAcrossCases: PASS');

// ---------------------------------------------------------------------------
// 6. All 7 statuses work
// ---------------------------------------------------------------------------

console.log('=== Check 6: All 7 statuses ===');

const allStatuses: ProcessRunStatus[] = [
  'active', 'resolved', 'blocked', 'collapsed', 'converted_to_contract', 'expired', 'superseded',
];

for (const status of allStatuses) {
  const r = buildProcessRunFromInput({
    templateId: 'tpl-test',
    templateKind: 'price_adjustment_communication',
    caseId: 'case-test',
    currentPhaseId: 'p',
    startedDay: 1,
    status,
  });
  check(r.status === status, `status ${status}: compiles`);
}

console.log('  All 7 statuses: PASS');

// ---------------------------------------------------------------------------
// 7. Deterministic and frozen
// ---------------------------------------------------------------------------

console.log('=== Check 7: Deterministic and frozen ===');

const input = {
  templateId: 'tpl-det',
  templateKind: 'showing_to_offer_conversion' as const,
  caseId: 'case-det',
  currentPhaseId: 'p',
  startedDay: 1,
};

const a = buildProcessRunFromInput(input);
const b = buildProcessRunFromInput(input);
// Same input -> byte-identical output (input-derived IDs)
check(a.runId === b.runId, 'deterministic: same runId');
check(a.templateId === b.templateId, 'deterministic: same templateId');
check(a.caseId === b.caseId, 'deterministic: same caseId');
check(a.status === b.status, 'deterministic: same status');
check(JSON.stringify(a) === JSON.stringify(b), 'deterministic: byte-identical');

check(Object.isFrozen(a), 'frozen: run frozen');
check(Object.isFrozen(a.phaseSnapshots), 'frozen: phaseSnapshots frozen');
check(Object.isFrozen(a.evidenceRefs), 'frozen: evidenceRefs frozen');
check(Object.isFrozen(a.blockers), 'frozen: blockers frozen');
check(Object.isFrozen(a.nextStepDrafts), 'frozen: nextStepDrafts frozen');

console.log('  Deterministic and frozen: PASS');

// ---------------------------------------------------------------------------
// 8. Core boundary
// ---------------------------------------------------------------------------

console.log('=== Check 8: Core boundary ===');

const src = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/processes/models.ts', 'utf-8');
const srcWithoutComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!srcWithoutComments.includes("from '../../domain"), 'no domain imports');
check(!srcWithoutComments.includes("from '../../runtime"), 'no runtime imports');
check(!srcWithoutComments.includes('Date.now'), 'no Date.now');
check(!srcWithoutComments.includes('Math.random'), 'no Math.random');
check(!srcWithoutComments.includes('let _runSeq'), 'no mutable _runSeq counter');

console.log('  Core boundary: PASS');

// ---------------------------------------------------------------------------
// 9. Business test cases
// ---------------------------------------------------------------------------

console.log('=== Check 9: Business test cases ===');

// Case 1: price adjustment communication — active with blocker
const priceRun = buildProcessRunFromInput({
  templateId: 'tpl-price',
  templateKind: 'price_adjustment_communication',
  caseId: 'case-price',
  actorIds: ['broker:current', 'owner:case-price'],
  status: 'active',
  currentPhaseId: 'owner-considering',
  startedDay: 3,
  phaseSnapshots: [
    { phaseId: 'price-gap-identified', enteredDay: 3, exitedDay: 4 },
    { phaseId: 'market-evidence-presented', enteredDay: 4, exitedDay: 5 },
    { phaseId: 'owner-considering', enteredDay: 5 },
  ],
  blockers: [{
    blockerId: 'b-price',
    kind: 'owner_hesitation',
    description: '业主犹豫不决',
    severity: 'medium',
    emergedDay: 5,
    resolved: false,
    relatedPhaseId: 'owner-considering',
  }],
  nextStepDrafts: [{
    draftId: 'draft-price',
    actionKind: 'owner_call',
    description: '跟进业主',
    priority: 'high',
    relatedPhaseId: 'owner-considering',
    rationale: '需要进一步沟通',
  }],
});

check(priceRun.status === 'active', 'price: active');
check(priceRun.phaseSnapshots.length === 3, 'price: 3 phases');
check(priceRun.blockers.length === 1, 'price: 1 blocker');
check(priceRun.blockers[0].resolved === false, 'price: blocker unresolved');
check(priceRun.nextStepDrafts.length === 1, 'price: 1 nextStepDraft');

// Case 2: consensus to contract — signed
const contractRun = buildProcessRunFromInput({
  templateId: 'tpl-consensus',
  templateKind: 'consensus_to_contract',
  caseId: 'case-contract',
  actorIds: ['broker:current', 'owner:case-contract', 'customer:case-contract'],
  status: 'converted_to_contract',
  currentPhaseId: 'contract-signed',
  startedDay: 1,
  endedDay: 5,
  phaseSnapshots: [
    { phaseId: 'consensus-formed', enteredDay: 1, exitedDay: 2 },
    { phaseId: 'offer-submitted', enteredDay: 2, exitedDay: 3 },
    { phaseId: 'negotiation-active', enteredDay: 3, exitedDay: 5 },
    { phaseId: 'contract-signed', enteredDay: 5 },
  ],
  outcome: {
    outcomeType: 'converted_to_contract',
    description: '成交签约',
    relatedConsensusId: 'consensus-1',
    relatedContractFactId: 'contract-1',
  },
});

check(contractRun.status === 'converted_to_contract', 'contract: converted');
check(contractRun.phaseSnapshots.length === 4, 'contract: 4 phases');
check(contractRun.durationDays === 4, 'contract: durationDays=4');
check(contractRun.outcome !== undefined, 'contract: has outcome');
check(contractRun.outcome!.outcomeType === 'converted_to_contract', 'contract: outcome type');
check(contractRun.outcome!.relatedConsensusId === 'consensus-1', 'contract: relatedConsensusId');
check(contractRun.outcome!.relatedContractFactId === 'contract-1', 'contract: relatedContractFactId');

// Case 3: showing to offer — collapsed
const collapsedRun = buildProcessRunFromInput({
  templateId: 'tpl-showing',
  templateKind: 'showing_to_offer_conversion',
  caseId: 'case-collapsed',
  status: 'collapsed',
  currentPhaseId: 'customer-declined',
  startedDay: 1,
  endedDay: 3,
  phaseSnapshots: [
    { phaseId: 'showing-scheduled', enteredDay: 1, exitedDay: 2 },
    { phaseId: 'showing-completed', enteredDay: 2, exitedDay: 3 },
    { phaseId: 'customer-declined', enteredDay: 3 },
  ],
  outcome: {
    outcomeType: 'collapsed',
    description: '客户放弃',
  },
});

check(collapsedRun.status === 'collapsed', 'collapsed: status');
check(collapsedRun.outcome!.outcomeType === 'collapsed', 'collapsed: outcome type');

// Case 4: open day — expired
const expiredRun = buildProcessRunFromInput({
  templateId: 'tpl-open',
  templateKind: 'open_day_campaign',
  caseId: 'case-expired',
  status: 'expired',
  currentPhaseId: 'leads-collected',
  startedDay: 1,
  endedDay: 15,
  phaseSnapshots: [
    { phaseId: 'open-day-planned', enteredDay: 1, exitedDay: 5 },
    { phaseId: 'open-day-executed', enteredDay: 5, exitedDay: 8 },
    { phaseId: 'leads-collected', enteredDay: 8, exitedDay: 15 },
  ],
  outcome: {
    outcomeType: 'expired',
    description: '线索未转化',
  },
});

check(expiredRun.status === 'expired', 'expired: status');
check(expiredRun.durationDays === 14, 'expired: durationDays=14');

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
  console.log('\nselling-houses process-run contract verification passed');
  process.exit(0);
}
