/**
 * CommitmentSettlement v0 contract verification.
 *
 * Validates:
 * 1. All types compile
 * 2. CommitmentSettlement builds correctly
 * 3. All settlement statuses work
 * 4. Settlement traces work
 * 5. Ledger summary with settlements
 * 6. Deterministic and frozen
 * 7. Core boundary clean
 * 8. Business test cases
 */

import { readFileSync } from 'node:fs';

import {
  buildCommitmentSettlement,
  summarizeActionReceiptsForLedger,
  buildBrokerActionReceipt,
  type CommitmentSettlement,
  type CommitmentSettlementStatus,
  type CommitmentSettlementReason,
  type CommitmentSettlementTrace,
  type BrokerActionReceipt,
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

const status: CommitmentSettlementStatus = 'active';
check(typeof status === 'string', 'CommitmentSettlementStatus compiles');

const reason: CommitmentSettlementReason = {
  reasonType: 'action_taken',
  description: 'test',
  sourceRefIds: [],
};
check(typeof reason.reasonType === 'string', 'CommitmentSettlementReason compiles');

console.log('  Type compilation: PASS');

// ---------------------------------------------------------------------------
// 2. buildCommitmentSettlement
// ---------------------------------------------------------------------------

console.log('=== Check 2: buildCommitmentSettlement ===');

const settlement = buildCommitmentSettlement({
  commitmentId: 'cm-1',
  commitmentKind: 'timeline_agreement',
  actorId: 'owner:case-1',
  caseId: 'case-1',
  status: 'active',
  traces: [{
    traceId: 'trace-1',
    commitmentId: 'cm-1',
    fromStatus: 'active',
    toStatus: 'active',
    day: 5,
    reason: { reasonType: 'action_taken', description: 'test', sourceRefIds: [] },
    strength: 70,
  }],
  currentStrength: 70,
  credibility: 0.8,
  createdDay: 3,
  expiryDay: 10,
  relatedActionReceiptIds: ['receipt-1'],
  relatedConsensusId: 'consensus-1',
});

check(settlement.settlementId.startsWith('settlement:'), 'settlement: settlementId format');
check(settlement.commitmentId === 'cm-1', 'settlement: commitmentId');
check(settlement.commitmentKind === 'timeline_agreement', 'settlement: commitmentKind');
check(settlement.actorId === 'owner:case-1', 'settlement: actorId');
check(settlement.caseId === 'case-1', 'settlement: caseId');
check(settlement.status === 'active', 'settlement: status=active');
check(settlement.traces.length === 1, 'settlement: 1 trace');
check(settlement.currentStrength === 70, 'settlement: currentStrength=70');
check(settlement.credibility === 0.8, 'settlement: credibility=0.8');
check(settlement.createdDay === 3, 'settlement: createdDay=3');
check(settlement.expiryDay === 10, 'settlement: expiryDay=10');
check(settlement.relatedActionReceiptIds.length === 1, 'settlement: 1 related receipt');
check(settlement.relatedConsensusId === 'consensus-1', 'settlement: relatedConsensusId');
check(Object.isFrozen(settlement), 'settlement: frozen');

console.log('  buildCommitmentSettlement: PASS');

// ---------------------------------------------------------------------------
// 3. All settlement statuses
// ---------------------------------------------------------------------------

console.log('=== Check 3: All settlement statuses ===');

const allStatuses: CommitmentSettlementStatus[] = [
  'active', 'resolved', 'expired', 'revoked', 'escalated',
  'converted_to_contract', 'blocked',
];

for (const status of allStatuses) {
  const s = buildCommitmentSettlement({
    commitmentId: `cm-${status}`,
    commitmentKind: 'test',
    actorId: 'actor',
    caseId: 'case-1',
    status,
    createdDay: 1,
  });
  check(s.status === status, `status ${status}: compiles`);
}

console.log('  All settlement statuses: PASS');

// ---------------------------------------------------------------------------
// 4. Settlement traces
// ---------------------------------------------------------------------------

console.log('=== Check 4: Settlement traces ===');

const traces: CommitmentSettlementTrace[] = [
  {
    traceId: 'trace-1',
    commitmentId: 'cm-trace',
    fromStatus: 'active',
    toStatus: 'resolved',
    day: 5,
    reason: { reasonType: 'consensus_formed', description: '成交', sourceRefIds: ['consensus:1'] },
    strength: 100,
  },
  {
    traceId: 'trace-2',
    commitmentId: 'cm-trace',
    fromStatus: 'active',
    toStatus: 'expired',
    day: 10,
    reason: { reasonType: 'time_expired', description: '过期', sourceRefIds: [] },
    strength: 0,
  },
];

const traceSettlement = buildCommitmentSettlement({
  commitmentId: 'cm-trace',
  commitmentKind: 'timeline_agreement',
  actorId: 'owner:case-1',
  caseId: 'case-1',
  status: 'resolved',
  traces,
  currentStrength: 100,
  credibility: 1.0,
  createdDay: 1,
  settledDay: 5,
});

check(traceSettlement.traces.length === 2, 'traces: 2 traces');
check(traceSettlement.traces[0].fromStatus === 'active', 'trace[0]: from active');
check(traceSettlement.traces[0].toStatus === 'resolved', 'trace[0]: to resolved');
check(traceSettlement.traces[1].reason.reasonType === 'time_expired', 'trace[1]: time_expired');
check(Object.isFrozen(traceSettlement.traces), 'traces: frozen');

console.log('  Settlement traces: PASS');

// ---------------------------------------------------------------------------
// 5. Ledger summary with settlements
// ---------------------------------------------------------------------------

console.log('=== Check 5: Ledger summary with settlements ===');

const receipt1 = buildBrokerActionReceipt({
  actionKind: 'owner_call',
  caseId: 'case-1',
  actorId: 'broker:current',
  day: 5,
  outcome: 'success',
  description: 'test',
});

const settlement1 = buildCommitmentSettlement({
  commitmentId: 'cm-1',
  commitmentKind: 'timeline_agreement',
  actorId: 'owner:case-1',
  caseId: 'case-1',
  status: 'active',
  createdDay: 3,
});

const settlement2 = buildCommitmentSettlement({
  commitmentId: 'cm-2',
  commitmentKind: 'price_hold',
  actorId: 'owner:case-2',
  caseId: 'case-2',
  status: 'resolved',
  createdDay: 1,
  settledDay: 5,
});

const summary = summarizeActionReceiptsForLedger({
  day: 5,
  receipts: [receipt1],
  settlements: [settlement1, settlement2],
});

check(summary.settlementCount === 2, 'summary: 2 settlements');
check(summary.resolvedSettlementCount === 1, 'summary: 1 resolved');
check(summary.activeSettlementCount === 1, 'summary: 1 active');

console.log('  Ledger summary with settlements: PASS');

// ---------------------------------------------------------------------------
// 6. Deterministic and frozen
// ---------------------------------------------------------------------------

console.log('=== Check 6: Deterministic and frozen ===');

const input = {
  commitmentId: 'cm-det',
  commitmentKind: 'test',
  actorId: 'actor',
  caseId: 'case-1',
  status: 'active' as const,
  createdDay: 1,
};

const a = buildCommitmentSettlement(input);
const b = buildCommitmentSettlement(input);
// Different settlementIds due to sequence counter, but same content
check(a.commitmentId === b.commitmentId, 'deterministic: same commitmentId');
check(a.status === b.status, 'deterministic: same status');
check(a.currentStrength === b.currentStrength, 'deterministic: same currentStrength');

check(Object.isFrozen(a), 'frozen: settlement frozen');
check(Object.isFrozen(a.traces), 'frozen: traces frozen');

console.log('  Deterministic and frozen: PASS');

// ---------------------------------------------------------------------------
// 7. Core boundary
// ---------------------------------------------------------------------------

console.log('=== Check 7: Core boundary ===');

const src = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/semantic-receipt/actionReceipt.ts', 'utf-8');
const srcWithoutComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!srcWithoutComments.includes("from '../../domain"), 'no domain imports');
check(!srcWithoutComments.includes("from '../../runtime"), 'no runtime imports');
check(!srcWithoutComments.includes('Date.now'), 'no Date.now');
check(!srcWithoutComments.includes('Math.random'), 'no Math.random');

console.log('  Core boundary: PASS');

// ---------------------------------------------------------------------------
// 8. Business test cases
// ---------------------------------------------------------------------------

console.log('=== Check 8: Business test cases ===');

// Case 1: commitment resolved (deal closed)
const resolvedSettlement = buildCommitmentSettlement({
  commitmentId: 'cm-resolved',
  commitmentKind: 'timeline_agreement',
  actorId: 'owner:case-1',
  caseId: 'case-1',
  status: 'resolved',
  traces: [{
    traceId: 'trace-resolved',
    commitmentId: 'cm-resolved',
    fromStatus: 'active',
    toStatus: 'resolved',
    day: 5,
    reason: { reasonType: 'consensus_formed', description: '成交', sourceRefIds: ['consensus:1'] },
    strength: 100,
  }],
  currentStrength: 100,
  credibility: 1.0,
  createdDay: 1,
  settledDay: 5,
  relatedConsensusId: 'consensus-1',
});

check(resolvedSettlement.status === 'resolved', 'resolved: status');
check(resolvedSettlement.settledDay === 5, 'resolved: settledDay');
check(resolvedSettlement.relatedConsensusId === 'consensus-1', 'resolved: relatedConsensusId');

// Case 2: commitment expired
const expiredSettlement = buildCommitmentSettlement({
  commitmentId: 'cm-expired',
  commitmentKind: 'price_hold',
  actorId: 'owner:case-2',
  caseId: 'case-2',
  status: 'expired',
  traces: [{
    traceId: 'trace-expired',
    commitmentId: 'cm-expired',
    fromStatus: 'active',
    toStatus: 'expired',
    day: 10,
    reason: { reasonType: 'time_expired', description: '过期', sourceRefIds: [] },
    strength: 0,
  }],
  currentStrength: 0,
  credibility: 0,
  createdDay: 1,
  expiryDay: 10,
});

check(expiredSettlement.status === 'expired', 'expired: status');
check(expiredSettlement.expiryDay === 10, 'expired: expiryDay');
check(expiredSettlement.currentStrength === 0, 'expired: currentStrength=0');

// Case 3: commitment revoked
const revokedSettlement = buildCommitmentSettlement({
  commitmentId: 'cm-revoked',
  commitmentKind: 'showing_willingness',
  actorId: 'customer:case-3',
  caseId: 'case-3',
  status: 'revoked',
  traces: [{
    traceId: 'trace-revoked',
    commitmentId: 'cm-revoked',
    fromStatus: 'active',
    toStatus: 'revoked',
    day: 5,
    reason: { reasonType: 'actor_revoked', description: '客户撤销', sourceRefIds: [] },
    strength: 0,
  }],
  currentStrength: 0,
  credibility: 0,
  createdDay: 1,
});

check(revokedSettlement.status === 'revoked', 'revoked: status');

// Case 4: commitment converted to contract
const convertedSettlement = buildCommitmentSettlement({
  commitmentId: 'cm-converted',
  commitmentKind: 'offer_readiness',
  actorId: 'customer:case-4',
  caseId: 'case-4',
  status: 'converted_to_contract',
  traces: [{
    traceId: 'trace-converted',
    commitmentId: 'cm-converted',
    fromStatus: 'active',
    toStatus: 'converted_to_contract',
    day: 5,
    reason: { reasonType: 'contract_signed', description: '成交签约', sourceRefIds: ['consensus:1'] },
    strength: 100,
  }],
  currentStrength: 100,
  credibility: 1.0,
  createdDay: 1,
  settledDay: 5,
  relatedConsensusId: 'consensus-1',
});

check(convertedSettlement.status === 'converted_to_contract', 'converted: status');
check(convertedSettlement.relatedConsensusId === 'consensus-1', 'converted: relatedConsensusId');

// Case 5: commitment blocked
const blockedSettlement = buildCommitmentSettlement({
  commitmentId: 'cm-blocked',
  commitmentKind: 'timeline_agreement',
  actorId: 'owner:case-5',
  caseId: 'case-5',
  status: 'blocked',
  traces: [{
    traceId: 'trace-blocked',
    commitmentId: 'cm-blocked',
    fromStatus: 'active',
    toStatus: 'blocked',
    day: 5,
    reason: { reasonType: 'blocker_emerged', description: '价格阻塞', sourceRefIds: ['blocker:1'] },
    strength: 30,
  }],
  currentStrength: 30,
  credibility: 0.3,
  createdDay: 1,
});

check(blockedSettlement.status === 'blocked', 'blocked: status');
check(blockedSettlement.currentStrength === 30, 'blocked: currentStrength=30');

// Case 6: commitment escalated
const escalatedSettlement = buildCommitmentSettlement({
  commitmentId: 'cm-escalated',
  commitmentKind: 'service_exclusivity',
  actorId: 'owner:case-6',
  caseId: 'case-6',
  status: 'escalated',
  traces: [{
    traceId: 'trace-escalated',
    commitmentId: 'cm-escalated',
    fromStatus: 'active',
    toStatus: 'escalated',
    day: 5,
    reason: { reasonType: 'pressure_increased', description: '升级处理', sourceRefIds: [] },
    strength: 50,
  }],
  currentStrength: 50,
  credibility: 0.5,
  createdDay: 1,
});

check(escalatedSettlement.status === 'escalated', 'escalated: status');

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
  console.log('\nselling-houses commitment-settlement contract verification passed');
  process.exit(0);
}
