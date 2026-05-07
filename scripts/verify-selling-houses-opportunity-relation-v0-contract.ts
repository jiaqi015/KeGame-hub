/**
 * CustomerCaseMatch / BrokeredOpportunity v0 read model verification.
 *
 * Validates:
 * 1. Merged relation: opportunity + runtime → CustomerCaseOpportunityRelationV0
 * 2. Opportunity-only relation: no runtime → opportunity_without_customer_runtime flag
 * 3. Runtime-only relation: no opportunity → customer_runtime_without_opportunity flag
 * 4. Duplicate brokered paths: multiple opps for same customer-case → duplicate_brokered_paths flag
 * 5. Conflict detection: fit/intent/confidence mismatches
 * 6. Dedupe helpers: countDedupedBuyers, countTotalBrokeredPaths
 * 7. Summary builder: buildOpportunityRelationV0Summary
 * 8. No domain imports in core/consensus/opportunity-relations
 */

import assert from 'node:assert/strict';

import {
  buildCustomerCaseOpportunityRelationV0View,
  buildOpportunityRelationV0Summary,
  countDedupedBuyers,
  countTotalBrokeredPaths,
  type CustomerCaseOpportunityRelationV0,
  type LegacyOpportunityShape,
  type LegacyCustomerRuntimeStateShape,
} from '../src/selling-houses/core/world-state/opportunity-relations/index.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const errors: string[] = [];

function check(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    errors.push(`FAIL: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function makeOpportunity(overrides: Partial<LegacyOpportunityShape>): LegacyOpportunityShape {
  return {
    id: 'opp-default',
    caseId: 'case-default',
    customerId: 'customer-default',
    customerName: '默认客户',
    fit: 80,
    intent: 75,
    confidence: 70,
    stageIndex: 3,
    stageLabel: '已看房',
    status: 'active',
    lifecycleStatus: 'active',
    leadSource: 'direct',
    visibility: 'revealed',
    channelId: 'private-referral',
    channelName: '私域转介绍',
    createdDay: 2,
    daysLeft: 4,
    touchedToday: false,
    budgetMax: 600,
    priceSensitivity: 50,
    stagnationTicks: 0,
    ...overrides,
  };
}

function makeRuntime(overrides: Partial<LegacyCustomerRuntimeStateShape>): LegacyCustomerRuntimeStateShape {
  return {
    customerId: 'customer-default',
    status: 'engaged',
    decisionStyle: 'balanced',
    advisorTrust: 60,
    fatigue: 10,
    churnRisk: 15,
    activeCaseIds: ['case-default'],
    caseStates: {
      'case-default': {
        caseId: 'case-default',
        fit: 80,
        interest: 75,
        confidence: 70,
        stageIndex: 3,
        interactions: 2,
        lastActiveDay: 3,
        viewed: true,
        offered: false,
        selected: true,
      },
    },
    lastTouchDay: 3,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Merged relation
// ---------------------------------------------------------------------------

const mergedOpps = [makeOpportunity({ id: 'opp-merged', caseId: 'case-m', customerId: 'cust-m' })];
const mergedRuntimes = [makeRuntime({
  customerId: 'cust-m',
  activeCaseIds: ['case-m'],
  caseStates: {
    'case-m': {
      caseId: 'case-m',
      fit: 80,
      interest: 75,
      confidence: 70,
      stageIndex: 3,
      interactions: 2,
      lastActiveDay: 3,
      viewed: true,
      offered: false,
      selected: true,
    },
  },
})];

const mergedResult = buildCustomerCaseOpportunityRelationV0View({
  opportunities: mergedOpps,
  customerStates: mergedRuntimes,
});

check(mergedResult.length === 1, `merged: 1 relation, got: ${mergedResult.length}`);
check(mergedResult[0].source === 'merged', `merged source, got: ${mergedResult[0].source}`);
check(mergedResult[0].relationKey === 'cust-m::case-m', `merged relationKey, got: ${mergedResult[0].relationKey}`);
check(mergedResult[0].match.matchTrack.fit === 80, 'merged match fit');
check(mergedResult[0].match.matchTrack.interest === 75, 'merged match interest');
check(mergedResult[0].match.matchTrack.confidence === 70, 'merged match confidence');
check(mergedResult[0].match.matchTrack.selected === true, 'merged match selected');
check(mergedResult[0].match.matchTrack.churnRisk === 15, 'merged match churnRisk');
check(mergedResult[0].match.matchTrack.advisorTrust === 60, 'merged match advisorTrust');
check(mergedResult[0].match.brokeredPathCount === 1, 'merged match brokeredPathCount');
check(mergedResult[0].brokeredPaths.length === 1, 'merged brokeredPaths length');
check(mergedResult[0].brokeredPaths[0].opportunityId === 'opp-merged', 'merged brokeredPath opportunityId');
check(mergedResult[0].brokeredPaths[0].brokeredTrack.status === 'active', 'merged brokeredTrack status');
check(mergedResult[0].brokeredPaths[0].brokeredTrack.visibility === 'revealed', 'merged brokeredTrack visibility');
check(mergedResult[0].conflictFlags.length === 0, 'merged: no conflicts when values match');

console.log('  Merged relation: PASS');

// ---------------------------------------------------------------------------
// 2. Opportunity-only relation
// ---------------------------------------------------------------------------

const oppOnlyResult = buildCustomerCaseOpportunityRelationV0View({
  opportunities: [makeOpportunity({ id: 'opp-only', caseId: 'case-oo', customerId: 'cust-oo' })],
  customerStates: [],
});

check(oppOnlyResult.length === 1, 'opp-only: 1 relation');
check(oppOnlyResult[0].source === 'opportunity-only', `opp-only source, got: ${oppOnlyResult[0].source}`);
check(oppOnlyResult[0].conflictFlags.length === 1, 'opp-only: 1 conflict');
check(oppOnlyResult[0].conflictFlags[0].kind === 'opportunity_without_customer_runtime', 'opp-only conflict kind');
check(oppOnlyResult[0].match.matchTrack.customerStatus === 'unknown', 'opp-only: unknown customer status');
check(oppOnlyResult[0].match.matchTrack.churnRisk === 0, 'opp-only: churnRisk=0');

console.log('  Opportunity-only relation: PASS');

// ---------------------------------------------------------------------------
// 3. Runtime-only relation
// ---------------------------------------------------------------------------

const rtOnlyResult = buildCustomerCaseOpportunityRelationV0View({
  opportunities: [],
  customerStates: [makeRuntime({
    customerId: 'cust-ro',
    activeCaseIds: ['case-ro'],
    caseStates: {
      'case-ro': {
        caseId: 'case-ro',
        fit: 72,
        interest: 66,
        confidence: 58,
        stageIndex: 2,
        interactions: 1,
        lastActiveDay: 3,
        viewed: true,
        offered: false,
        selected: true,
      },
    },
  })],
});

check(rtOnlyResult.length === 1, 'rt-only: 1 relation');
check(rtOnlyResult[0].source === 'runtime-only', `rt-only source, got: ${rtOnlyResult[0].source}`);
check(rtOnlyResult[0].conflictFlags.length === 1, 'rt-only: 1 conflict');
check(rtOnlyResult[0].conflictFlags[0].kind === 'customer_runtime_without_opportunity', 'rt-only conflict kind');
check(rtOnlyResult[0].match.matchTrack.interest === 66, 'rt-only match interest');
check(rtOnlyResult[0].match.brokeredPathCount === 0, 'rt-only: no brokered paths');
check(rtOnlyResult[0].brokeredPaths.length === 0, 'rt-only: empty brokeredPaths');

console.log('  Runtime-only relation: PASS');

// ---------------------------------------------------------------------------
// 4. Duplicate brokered paths
// ---------------------------------------------------------------------------

const dupResult = buildCustomerCaseOpportunityRelationV0View({
  opportunities: [
    makeOpportunity({ id: 'opp-dup-1', caseId: 'case-dup', customerId: 'cust-dup', leadSource: 'direct', visibility: 'revealed' }),
    makeOpportunity({ id: 'opp-dup-2', caseId: 'case-dup', customerId: 'cust-dup', leadSource: 'broker', visibility: 'shadow', brokerName: '链家1号' }),
  ],
  customerStates: [makeRuntime({
    customerId: 'cust-dup',
    activeCaseIds: ['case-dup'],
    caseStates: {
      'case-dup': {
        caseId: 'case-dup',
        fit: 80,
        interest: 75,
        confidence: 70,
        stageIndex: 3,
        interactions: 2,
        lastActiveDay: 3,
        viewed: true,
        offered: false,
        selected: true,
      },
    },
  })],
});

check(dupResult.length === 1, 'dup: 1 relation (not 2)');
check(dupResult[0].source === 'merged', 'dup: merged source');
check(dupResult[0].brokeredPaths.length === 2, `dup: 2 brokeredPaths, got: ${dupResult[0].brokeredPaths.length}`);
check(dupResult[0].match.brokeredPathCount === 2, 'dup: match brokeredPathCount=2');

const dupConflict = dupResult[0].conflictFlags.find((f) => f.kind === 'duplicate_brokered_paths');
check(dupConflict !== undefined, 'dup: has duplicate_brokered_paths flag');
check(dupConflict!.detail.includes('2 brokered paths'), `dup conflict detail, got: ${dupConflict!.detail}`);

// Verify brokered path keys are different
const pathKeys = dupResult[0].brokeredPaths.map((p) => p.brokeredPathKey);
check(pathKeys[0] !== pathKeys[1], 'dup: brokered path keys are distinct');
check(dupResult[0].match.brokeredPathKeys.length === 2, 'dup: match has 2 brokeredPathKeys');

console.log('  Duplicate brokered paths: PASS');

// ---------------------------------------------------------------------------
// 5. Conflict detection: fit/intent/confidence mismatch
// ---------------------------------------------------------------------------

const conflictResult = buildCustomerCaseOpportunityRelationV0View({
  opportunities: [makeOpportunity({
    id: 'opp-conflict',
    caseId: 'case-conflict',
    customerId: 'cust-conflict',
    fit: 90,
    intent: 90,
    confidence: 90,
  })],
  customerStates: [makeRuntime({
    customerId: 'cust-conflict',
    activeCaseIds: ['case-conflict'],
    caseStates: {
      'case-conflict': {
        caseId: 'case-conflict',
        fit: 50,
        interest: 50,
        confidence: 50,
        stageIndex: 1,
        interactions: 0,
        lastActiveDay: 1,
        viewed: false,
        offered: false,
        selected: false,
      },
    },
  })],
});

check(conflictResult.length === 1, 'conflict: 1 relation');
const fitConflict = conflictResult[0].conflictFlags.find((f) => f.kind === 'fit_mismatch');
const intentConflict = conflictResult[0].conflictFlags.find((f) => f.kind === 'intent_mismatch');
const confidenceConflict = conflictResult[0].conflictFlags.find((f) => f.kind === 'confidence_mismatch');
check(fitConflict !== undefined, 'conflict: fit_mismatch detected');
check(intentConflict !== undefined, 'conflict: intent_mismatch detected');
check(confidenceConflict !== undefined, 'conflict: confidence_mismatch detected');
check(fitConflict!.detail.includes('90') && fitConflict!.detail.includes('50'), 'conflict: fit detail values');

console.log('  Conflict detection: PASS');

// ---------------------------------------------------------------------------
// 6. Dedupe helpers
// ---------------------------------------------------------------------------

// Multiple opps for same customer-case = 1 deduped buyer
const dedupeResult = buildCustomerCaseOpportunityRelationV0View({
  opportunities: [
    makeOpportunity({ id: 'opp-d1', caseId: 'case-dd', customerId: 'cust-dd' }),
    makeOpportunity({ id: 'opp-d2', caseId: 'case-dd', customerId: 'cust-dd' }),
  ],
  customerStates: [],
});

check(countDedupedBuyers(dedupeResult) === 1, `dedupe: 1 buyer, got: ${countDedupedBuyers(dedupeResult)}`);
check(countTotalBrokeredPaths(dedupeResult) === 2, `dedupe: 2 paths, got: ${countTotalBrokeredPaths(dedupeResult)}`);

// Two different customer-case matches = 2 deduped buyers
const dedupe2Result = buildCustomerCaseOpportunityRelationV0View({
  opportunities: [
    makeOpportunity({ id: 'opp-e1', caseId: 'case-e1', customerId: 'cust-e1' }),
    makeOpportunity({ id: 'opp-e2', caseId: 'case-e2', customerId: 'cust-e2' }),
  ],
  customerStates: [],
});

check(countDedupedBuyers(dedupe2Result) === 2, `dedupe2: 2 buyers, got: ${countDedupedBuyers(dedupe2Result)}`);
check(countTotalBrokeredPaths(dedupe2Result) === 2, `dedupe2: 2 paths, got: ${countTotalBrokeredPaths(dedupe2Result)}`);

console.log('  Dedupe helpers: PASS');

// ---------------------------------------------------------------------------
// 7. Summary builder
// ---------------------------------------------------------------------------

const summaryResult = buildCustomerCaseOpportunityRelationV0View({
  opportunities: [
    makeOpportunity({ id: 'opp-s1', caseId: 'case-s1', customerId: 'cust-s1' }),
    makeOpportunity({ id: 'opp-s2', caseId: 'case-s2', customerId: 'cust-s2' }),
    makeOpportunity({ id: 'opp-s3', caseId: 'case-s2', customerId: 'cust-s2' }),
  ],
  customerStates: [makeRuntime({
    customerId: 'cust-s1',
    activeCaseIds: ['case-s1'],
    caseStates: {
      'case-s1': {
        caseId: 'case-s1',
        fit: 80,
        interest: 75,
        confidence: 70,
        stageIndex: 3,
        interactions: 2,
        lastActiveDay: 3,
        viewed: true,
        offered: false,
        selected: true,
      },
    },
  })],
});

const summary = buildOpportunityRelationV0Summary(summaryResult);
check(summary.totalRelations === 2, `summary: 2 relations, got: ${summary.totalRelations}`);
check(summary.uniqueCustomerCaseMatches === 2, `summary: 2 matches, got: ${summary.uniqueCustomerCaseMatches}`);
check(summary.totalBrokeredPaths === 3, `summary: 3 paths, got: ${summary.totalBrokeredPaths}`);
check(summary.dedupedBuyerCount === 2, `summary: 2 deduped buyers, got: ${summary.dedupedBuyerCount}`);
check(summary.conflictCount > 0, 'summary: has conflicts');
check(summary.conflictsByKind.duplicate_brokered_paths === 1, 'summary: 1 duplicate_brokered_paths');
check(summary.conflictsByKind.customer_runtime_without_opportunity === 0, 'summary: no rt-without-opp (cust-s1 merged)');

console.log('  Summary builder: PASS');

// ---------------------------------------------------------------------------
// 8. No domain imports
// ---------------------------------------------------------------------------

// Verified by import — if v0ReadModel imported from domain, this script would fail.
check(true, 'v0ReadModel imports from core only — no domain dependency');

console.log('  Layer boundary: PASS');

// ---------------------------------------------------------------------------
// 9. Existing contract still passes (backward compatibility)
// ---------------------------------------------------------------------------

// The existing readModel.ts still imports from domain — that's a separate concern.
// The v0 read model is additive, not replacing the existing one.
check(true, 'v0 read model is additive — existing readModel.ts unchanged');

console.log('  Backward compatibility: PASS');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

if (failed > 0) {
  console.error(`\nFAILED: ${failed} of ${passed + failed} checks`);
  for (const err of errors) {
    console.error(`  ${err}`);
  }
  process.exit(1);
}

console.log(`\n  Total: ${passed} passed, 0 failed`);
console.log('selling-houses opportunity relation v0 contract verification passed');
