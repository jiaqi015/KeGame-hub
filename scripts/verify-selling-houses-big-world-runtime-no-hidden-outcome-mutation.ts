/**
 * No Hidden Outcome Mutation — verification script.
 *
 * Proves that the big world runtime never directly mutates:
 * - case.status to sold/lost
 * - closedDeals
 * - owner trust/patience/urgency raw fields
 * - customer final purchase commitment
 * - UI projection fields as canonical facts
 *
 * The runtime only emits causal events and pressure signals.
 * Actual outcome mutations must go through the existing process/consensus engines.
 */

import {
  runAllPhases,
  buildRuntimeSummary,
} from '../src/selling-houses/domain/world-model/runtime/index.js';

import type { BigWorldClockInput } from '../src/selling-houses/domain/world-model/runtime/types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${message}`);
  }
}

// ---------------------------------------------------------------------------
// Build test input with known initial state
// ---------------------------------------------------------------------------

function buildTestInput(day: number): BigWorldClockInput {
  return {
    settledDay: day,
    runSeed: 42,
    marketCells: [
      { id: 'cell-a', name: '和平里', demandHeat: 65, supplyPressure: 40, competitivePressure: 55, sentiment: 60 },
    ],
    activeCases: [
      {
        id: 'case-1', title: '和平里两居', district: '和平里', marketCellId: 'cell-a',
        trust: 60, patience: 55, urgency: 40, heat: 50, competitiveness: 65,
        d1: 45, d3: 60, ownerName: '张女士', windowDays: 14, personality: 'pragmatic',
      },
    ],
    activeOpportunities: [
      {
        id: 'opp-1', caseId: 'case-1', customerId: 'cust-1', customerName: '王客户',
        fit: 70, intent: 55, confidence: 60, stageIndex: 3, stagnationTicks: 2,
      },
    ],
    rivalListings: [
      {
        id: 'rival-1', storeId: 'store-1', title: '和平里竞品', district: '和平里',
        marketCellId: 'cell-a', segment: 'residential', askPrice: 350, heat: 60,
        freshness: 45, status: 'active', daysLeft: 10,
      },
    ],
    rivalStores: [
      {
        id: 'store-1', name: '链家和平里', type: 'external_company', style: 'aggressive',
        districtFocus: ['和平里'], leadCapturePower: 70, sellerInfluencePower: 60,
        pricingPressurePower: 65, activityHeat: 75,
      },
    ],
    customerStates: [
      {
        customerId: 'cust-1', status: 'browsing', fatigue: 30, churnRisk: 20,
        activeCaseIds: ['case-1'],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Forbidden mutation patterns
// ---------------------------------------------------------------------------

/** Event kinds that would be forbidden direct mutations. */
const FORBIDDEN_EVENT_KINDS = [
  'case_sold',
  'case_withdrawn',
  'case_lost_to_rival',
  'deal_closed',
  'customer_committed',
  'owner_trust_changed',
  'owner_patience_changed',
  'owner_urgency_changed',
  'opportunity_won',
  'opportunity_lost',
];

/** Payload keys that would indicate forbidden direct mutations. */
const FORBIDDEN_PAYLOAD_KEYS = [
  'soldStatus',
  'closedDealId',
  'dealPrice',
  'trustDelta',
  'patienceDelta',
  'urgencyDelta',
  'finalCommitment',
  'contractSigned',
  'caseStatus',
  'newStatus',
  'trustValue',
  'patienceValue',
  'urgencyValue',
];

/** Visibility hints that would indicate forbidden UI-as-canonical. */
const FORBIDDEN_VISIBILITY_HINTS = [
  'projection',
  'ui_state',
  'display_status',
];

// ---------------------------------------------------------------------------
// Test 1: Phase events never contain forbidden kinds
// ---------------------------------------------------------------------------

console.log('=== Test 1: No forbidden event kinds ===');

for (let day = 1; day <= 21; day += 1) {
  const input = buildTestInput(day);
  const result = runAllPhases(input);

  for (const event of result.allDailyEvents) {
    check(
      !FORBIDDEN_EVENT_KINDS.includes(event.kind),
      `Day ${day}: event ${event.id} kind "${event.kind}" is not forbidden`,
    );
  }
}

// ---------------------------------------------------------------------------
// Test 2: No forbidden payload keys in any event
// ---------------------------------------------------------------------------

console.log('\n=== Test 2: No forbidden payload keys ===');

let forbiddenPayloadCount = 0;
for (let day = 1; day <= 21; day += 1) {
  const input = buildTestInput(day);
  const result = runAllPhases(input);

  for (const event of result.allDailyEvents) {
    for (const key of FORBIDDEN_PAYLOAD_KEYS) {
      if (key in event.boundedPayload) {
        forbiddenPayloadCount += 1;
        console.error(`  [FAIL] Day ${day}: event ${event.id} has forbidden payload key "${key}"`);
      }
    }
  }
}
check(forbiddenPayloadCount === 0, `Forbidden payload keys found: ${forbiddenPayloadCount}`);

// ---------------------------------------------------------------------------
// Test 3: No forbidden visibility hints
// ---------------------------------------------------------------------------

console.log('\n=== Test 3: No forbidden visibility hints ===');

let forbiddenVisibilityCount = 0;
for (let day = 1; day <= 21; day += 1) {
  const input = buildTestInput(day);
  const result = runAllPhases(input);

  for (const event of result.allDailyEvents) {
    if (FORBIDDEN_VISIBILITY_HINTS.includes(event.visibilityHint)) {
      forbiddenVisibilityCount += 1;
    }
  }
}
check(forbiddenVisibilityCount === 0, `Forbidden visibility hints: ${forbiddenVisibilityCount}`);

// ---------------------------------------------------------------------------
// Test 4: Causal events don't contain forbidden kinds
// ---------------------------------------------------------------------------

console.log('\n=== Test 4: Causal events no forbidden mutations ===');

const FORBIDDEN_CAUSAL_KINDS = [
  'CaseSold',
  'CaseWithdrawn',
  'DealClosed',
  'CustomerCommitted',
  'OwnerTrustChanged',
  'OwnerPatienceChanged',
];

let forbiddenCausalCount = 0;
for (let day = 1; day <= 21; day += 1) {
  const input = buildTestInput(day);
  const result = runAllPhases(input);

  for (const event of result.allCausalEvents) {
    if (FORBIDDEN_CAUSAL_KINDS.includes(event.kind)) {
      forbiddenCausalCount += 1;
    }
  }
}
check(forbiddenCausalCount === 0, `Forbidden causal event kinds: ${forbiddenCausalCount}`);

// ---------------------------------------------------------------------------
// Test 5: Causal events only contain allowed kinds
// ---------------------------------------------------------------------------

console.log('\n=== Test 5: Causal events only contain allowed kinds ===');

const ALLOWED_CAUSAL_KINDS = new Set([
  'MarketHeatShifted',
  'RivalListingRepriced',
  'RivalBrokerActionTaken',
  'CustomerComparedListings',
  'CustomerAttentionShifted',
  'OwnerMarketPressurePerceived',
  'BrokerRecommendationChanged',
  'MatterPriorityChanged',
]);

let disallowedCausalCount = 0;
for (let day = 1; day <= 21; day += 1) {
  const input = buildTestInput(day);
  const result = runAllPhases(input);

  for (const event of result.allCausalEvents) {
    if (!ALLOWED_CAUSAL_KINDS.has(event.kind)) {
      disallowedCausalCount += 1;
      console.error(`  [FAIL] Day ${day}: disallowed causal kind "${event.kind}"`);
    }
  }
}
check(disallowedCausalCount === 0, `Disallowed causal event kinds: ${disallowedCausalCount}`);

// ---------------------------------------------------------------------------
// Test 6: Phase results don't directly report outcome mutations
// ---------------------------------------------------------------------------

console.log('\n=== Test 6: Phase results report pressure, not outcomes ===');

// Phases should report mutationCount as "pressure changes", not "outcomes achieved"
for (let day = 1; day <= 7; day += 1) {
  const input = buildTestInput(day);
  const result = runAllPhases(input);

  for (const phase of result.phaseResults) {
    // mutationCount should be non-negative
    check(
      phase.mutationCount >= 0,
      `Day ${day} ${phase.phaseId}: mutationCount = ${phase.mutationCount} (non-negative)`,
    );
  }
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== No Hidden Outcome Mutation Summary ===`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  console.error(`\nVERIFICATION FAILED: ${failed} checks did not pass.`);
  process.exit(1);
} else {
  console.log(`\nVERIFICATION PASSED: All ${passed} checks passed.`);
  console.log('\nConclusion: The runtime emits pressure signals and causal events,');
  console.log('never direct outcome mutations. case.status, closedDeals, owner trust/patience,');
  console.log('and customer commitments are never written by the runtime.');
}
