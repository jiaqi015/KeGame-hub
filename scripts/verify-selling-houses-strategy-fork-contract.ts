/**
 * StrategyFork v0 contract verification.
 *
 * Validates:
 * 1. All types compile
 * 2. buildStrategyForkPlan builds correctly
 * 3. compareStrategyForkBranches works
 * 4. All branch kinds work
 * 5. Deterministic and frozen
 * 6. Core boundary clean
 * 7. Business test cases
 */

import { readFileSync } from 'node:fs';

import {
  buildStrategyForkPlan,
  compareStrategyForkBranches,
  type StrategyForkPlan,
  type StrategyForkBranch,
  type StrategyForkBranchKind,
  type StrategyForkOutcomeDelta,
  type StrategyForkComparison,
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

const kind: StrategyForkBranchKind = 'price_accept';
check(typeof kind === 'string', 'StrategyForkBranchKind compiles');

const branch: StrategyForkBranch = {
  branchId: 'branch-1',
  kind: 'price_accept',
  label: '业主接受调价',
  description: '业主同意调价5%',
  actionSequence: {
    sequenceId: 'seq-1',
    actionIds: ['action-1', 'action-2'],
    description: '调价沟通 + 跟进',
    estimatedDurationDays: 3,
  },
  expectedOutcome: '业主接受调价',
  confidence: 0.7,
  riskLevel: 'low',
};
check(typeof branch.branchId === 'string', 'StrategyForkBranch compiles');

console.log('  Type compilation: PASS');

// ---------------------------------------------------------------------------
// 2. buildStrategyForkPlan
// ---------------------------------------------------------------------------

console.log('=== Check 2: buildStrategyForkPlan ===');

const plan = buildStrategyForkPlan({
  caseId: 'case-1',
  baseDay: 5,
  seedId: 'seed-1',
  branches: [
    {
      branchId: 'branch-accept',
      kind: 'price_accept',
      label: '业主接受调价',
      description: '业主同意调价5%',
      actionSequence: {
        sequenceId: 'seq-accept',
        actionIds: ['action-1'],
        description: '调价沟通',
        estimatedDurationDays: 3,
      },
      expectedOutcome: '业主接受调价',
      confidence: 0.7,
      riskLevel: 'low',
    },
    {
      branchId: 'branch-reject',
      kind: 'price_reject',
      label: '业主拒绝调价',
      description: '业主拒绝调价',
      actionSequence: {
        sequenceId: 'seq-reject',
        actionIds: ['action-2'],
        description: '等待或换策略',
        estimatedDurationDays: 7,
      },
      expectedOutcome: '需要重新评估',
      confidence: 0.5,
      riskLevel: 'high',
    },
  ],
  description: '调价策略对比',
});

check(plan.planId.startsWith('fork:'), 'plan: planId format');
check(plan.caseId === 'case-1', 'plan: caseId');
check(plan.baseDay === 5, 'plan: baseDay=5');
check(plan.seedId === 'seed-1', 'plan: seedId');
check(plan.branches.length === 2, 'plan: 2 branches');
check(plan.comparisons.length === 1, 'plan: 1 comparison (2 choose 2)');
check(plan.description === '调价策略对比', 'plan: description');
check(Object.isFrozen(plan), 'plan: frozen');
check(Object.isFrozen(plan.branches), 'plan: branches frozen');
check(Object.isFrozen(plan.comparisons), 'plan: comparisons frozen');

console.log('  buildStrategyForkPlan: PASS');

// ---------------------------------------------------------------------------
// 3. compareStrategyForkBranches
// ---------------------------------------------------------------------------

console.log('=== Check 3: compareStrategyForkBranches ===');

const deltas: StrategyForkOutcomeDelta[] = [
  {
    dimension: 'ownerTrust',
    branchAValue: 70,
    branchBValue: 40,
    delta: 30,
    direction: 'improved',
    significance: 'high',
  },
  {
    dimension: 'closeProbability',
    branchAValue: 60,
    branchBValue: 20,
    delta: 40,
    direction: 'improved',
    significance: 'high',
  },
];

const comparison = compareStrategyForkBranches(
  plan,
  'branch-accept',
  'branch-reject',
  deltas,
  '建议接受调价方案',
  0.8,
);

check(comparison.branchAId === 'branch-accept', 'comparison: branchAId');
check(comparison.branchBId === 'branch-reject', 'comparison: branchBId');
check(comparison.deltas.length === 2, 'comparison: 2 deltas');
check(comparison.recommendation === '建议接受调价方案', 'comparison: recommendation');
check(comparison.recommendationConfidence === 0.8, 'comparison: recommendationConfidence');
check(Object.isFrozen(comparison), 'comparison: frozen');
check(Object.isFrozen(comparison.deltas), 'comparison: deltas frozen');

console.log('  compareStrategyForkBranches: PASS');

// ---------------------------------------------------------------------------
// 4. All branch kinds
// ---------------------------------------------------------------------------

console.log('=== Check 4: All branch kinds ===');

const allKinds: StrategyForkBranchKind[] = [
  'price_accept', 'price_reject', 'manager_intervene', 'continue_wait',
  'open_day_push', 'sincerity_sale_push', 'escalate_to_manager',
  'customer_follow_up', 'showing_push', 'negotiate_offer', 'withdraw_listing', 'custom',
];

for (const kind of allKinds) {
  const plan = buildStrategyForkPlan({
    caseId: 'case-test',
    baseDay: 1,
    seedId: 'seed-test',
    branches: [{
      branchId: `branch-${kind}`,
      kind,
      label: `test ${kind}`,
      description: `test ${kind}`,
      actionSequence: {
        sequenceId: `seq-${kind}`,
        actionIds: [],
        description: `test ${kind}`,
        estimatedDurationDays: 1,
      },
      expectedOutcome: 'test',
      confidence: 0.5,
      riskLevel: 'low',
    }],
  });
  check(plan.branches[0].kind === kind, `kind ${kind}: compiles`);
}

console.log('  All branch kinds: PASS');

// ---------------------------------------------------------------------------
// 5. Deterministic and frozen
// ---------------------------------------------------------------------------

console.log('=== Check 5: Deterministic and frozen ===');

const input = {
  caseId: 'case-det',
  baseDay: 1,
  seedId: 'seed-det',
  branches: [{
    branchId: 'branch-det',
    kind: 'price_accept' as const,
    label: 'test',
    description: 'test',
    actionSequence: {
      sequenceId: 'seq-det',
      actionIds: ['a1'],
      description: 'test',
      estimatedDurationDays: 1,
    },
    expectedOutcome: 'test',
    confidence: 0.5,
    riskLevel: 'low' as const,
  }],
};

const a = buildStrategyForkPlan(input);
const b = buildStrategyForkPlan(input);
// Different planIds due to sequence counter, but same content
check(a.caseId === b.caseId, 'deterministic: same caseId');
check(a.baseDay === b.baseDay, 'deterministic: same baseDay');
check(a.branches.length === b.branches.length, 'deterministic: same branches');
check(a.branches[0].kind === b.branches[0].kind, 'deterministic: same branch kind');

check(Object.isFrozen(a), 'frozen: plan frozen');
check(Object.isFrozen(a.branches), 'frozen: branches frozen');
check(Object.isFrozen(a.comparisons), 'frozen: comparisons frozen');

console.log('  Deterministic and frozen: PASS');

// ---------------------------------------------------------------------------
// 6. Core boundary
// ---------------------------------------------------------------------------

console.log('=== Check 6: Core boundary ===');

const src = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/strategy/models.ts', 'utf-8');
const srcWithoutComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!srcWithoutComments.includes("from '../../domain"), 'no domain imports');
check(!srcWithoutComments.includes("from '../../runtime"), 'no runtime imports');
check(!srcWithoutComments.includes('Date.now'), 'no Date.now');
check(!srcWithoutComments.includes('Math.random'), 'no Math.random');

console.log('  Core boundary: PASS');

// ---------------------------------------------------------------------------
// 7. Business test cases
// ---------------------------------------------------------------------------

console.log('=== Check 7: Business test cases ===');

// Case 1: price adjustment strategy comparison
const pricePlan = buildStrategyForkPlan({
  caseId: 'case-price',
  baseDay: 5,
  seedId: 'seed-price',
  branches: [
    {
      branchId: 'accept',
      kind: 'price_accept',
      label: '业主接受调价',
      description: '业主同意调价5%',
      actionSequence: { sequenceId: 'seq-a', actionIds: ['call', 'adjust'], description: '调价沟通', estimatedDurationDays: 3 },
      expectedOutcome: '成交概率提升',
      confidence: 0.7,
      riskLevel: 'low',
    },
    {
      branchId: 'reject',
      kind: 'price_reject',
      label: '业主拒绝调价',
      description: '业主拒绝调价',
      actionSequence: { sequenceId: 'seq-r', actionIds: ['wait'], description: '等待', estimatedDurationDays: 7 },
      expectedOutcome: '需要换策略',
      confidence: 0.5,
      riskLevel: 'high',
    },
    {
      branchId: 'manager',
      kind: 'manager_intervene',
      label: '店长介入',
      description: '店长出面沟通',
      actionSequence: { sequenceId: 'seq-m', actionIds: ['escalate'], description: '升级', estimatedDurationDays: 2 },
      expectedOutcome: '可能突破',
      confidence: 0.6,
      riskLevel: 'medium',
    },
  ],
  description: '调价策略三分支对比',
});

check(pricePlan.branches.length === 3, 'price: 3 branches');
check(pricePlan.comparisons.length === 3, 'price: 3 comparisons (3 choose 2)');

// Compare first two branches
const priceComparison = compareStrategyForkBranches(
  pricePlan,
  'accept',
  'reject',
  [
    { dimension: 'ownerTrust', branchAValue: 70, branchBValue: 40, delta: 30, direction: 'improved', significance: 'high' },
    { dimension: 'closeProbability', branchAValue: 60, branchBValue: 20, delta: 40, direction: 'improved', significance: 'high' },
    { dimension: 'riskLevel', branchAValue: 1, branchBValue: 3, delta: -2, direction: 'improved', significance: 'medium' },
  ],
  '建议接受调价方案',
  0.8,
);

check(priceComparison.deltas.length === 3, 'price comparison: 3 deltas');
check(priceComparison.recommendationConfidence === 0.8, 'price comparison: confidence 0.8');

// Case 2: multi-branch strategy with custom kind
const customPlan = buildStrategyForkPlan({
  caseId: 'case-custom',
  baseDay: 10,
  seedId: 'seed-custom',
  branches: [
    {
      branchId: 'custom-1',
      kind: 'custom',
      label: '自定义策略A',
      description: '自定义策略A',
      actionSequence: { sequenceId: 'seq-c1', actionIds: [], description: '自定义', estimatedDurationDays: 5 },
      expectedOutcome: '待评估',
      confidence: 0.4,
      riskLevel: 'medium',
    },
  ],
});

check(customPlan.branches[0].kind === 'custom', 'custom: branch kind');
check(customPlan.comparisons.length === 0, 'custom: no comparisons (single branch)');

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
  console.log('\nselling-houses strategy-fork contract verification passed');
  process.exit(0);
}
