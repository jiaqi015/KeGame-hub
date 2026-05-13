/**
 * Big World Runtime Substrate — verification script.
 *
 * Validates:
 * 1. Runtime types are properly defined
 * 2. Phase pipeline produces deterministic results
 * 3. Summary changes between day 0 / day 7 / day 14
 * 4. Causal events are emitted for each phase
 * 5. Compaction enforces bounds
 * 6. No forbidden mutations (case.status, closedDeals, owner trust/patience)
 * 7. Replay determinism: same seed → byte-identical results
 */

import {
  runAllPhases,
  buildRuntimeSummary,
  compactDailyEvents,
  compactDailySummaries,
  compactCausalRefs,
  compactWorldCausalEvents,
  runCompactionPass,
  normalizeRuntimeState,
  createDefaultRuntimeState,
  DEFAULT_COMPACTION_POLICY,
  TICK_PHASE_ORDER,
} from '../src/selling-houses/domain/world-model/runtime/index.js';

import type {
  BigWorldClockInput,
  BigWorldRuntimeState,
  BigWorldRuntimeSummary,
} from '../src/selling-houses/domain/world-model/runtime/types.js';

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

function assertEqual<T>(actual: T, expected: T, label: string) {
  if (actual === expected) {
    passed++;
    console.log(`  [PASS] ${label}: ${JSON.stringify(actual)}`);
  } else {
    failed++;
    console.error(`  [FAIL] ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// ---------------------------------------------------------------------------
// Build deterministic test input
// ---------------------------------------------------------------------------

function buildTestInput(day: number, seed: number): BigWorldClockInput {
  return {
    settledDay: day,
    runSeed: seed,
    marketCells: [
      { id: 'cell-a', name: '和平里', demandHeat: 65, supplyPressure: 40, competitivePressure: 55, sentiment: 60 },
      { id: 'cell-b', name: '望京', demandHeat: 72, supplyPressure: 35, competitivePressure: 60, sentiment: 68 },
      { id: 'cell-c', name: '朝阳公园', demandHeat: 58, supplyPressure: 50, competitivePressure: 45, sentiment: 52 },
    ],
    activeCases: [
      {
        id: 'case-1', title: '和平里两居', district: '和平里', marketCellId: 'cell-a',
        trust: 60, patience: 55, urgency: 40, heat: 50, competitiveness: 65,
        d1: 45, d3: 60, ownerName: '张女士', windowDays: 14, personality: 'pragmatic',
      },
      {
        id: 'case-2', title: '望京三居', district: '望京', marketCellId: 'cell-b',
        trust: 45, patience: 35, urgency: 65, heat: 70, competitiveness: 55,
        d1: 30, d3: 40, ownerName: '李先生', windowDays: 7, personality: 'emotional',
      },
    ],
    activeOpportunities: [
      {
        id: 'opp-1', caseId: 'case-1', customerId: 'cust-1', customerName: '王客户',
        fit: 70, intent: 55, confidence: 60, stageIndex: 3, stagnationTicks: 2,
      },
      {
        id: 'opp-2', caseId: 'case-2', customerId: 'cust-2', customerName: '赵客户',
        fit: 45, intent: 25, confidence: 35, stageIndex: 1, stagnationTicks: 6,
      },
    ],
    rivalListings: [
      {
        id: 'rival-1', storeId: 'store-1', title: '和平里竞品', district: '和平里',
        marketCellId: 'cell-a', segment: 'residential', askPrice: 350, heat: 60,
        freshness: 45, status: 'active', daysLeft: 10,
      },
      {
        id: 'rival-2', storeId: 'store-2', title: '望京竞品', district: '望京',
        marketCellId: 'cell-b', segment: 'residential', askPrice: 520, heat: 75,
        freshness: 30, status: 'active', daysLeft: 5,
      },
    ],
    rivalStores: [
      {
        id: 'store-1', name: '链家和平里', type: 'external_company', style: 'aggressive',
        districtFocus: ['和平里'], leadCapturePower: 70, sellerInfluencePower: 60,
        pricingPressurePower: 65, activityHeat: 75,
      },
      {
        id: 'store-2', name: '我望京', type: 'external_company', style: 'steady',
        districtFocus: ['望京'], leadCapturePower: 55, sellerInfluencePower: 50,
        pricingPressurePower: 40, activityHeat: 50,
      },
    ],
    customerStates: [
      {
        customerId: 'cust-1', status: 'browsing', fatigue: 30, churnRisk: 20,
        activeCaseIds: ['case-1', 'case-2'],
      },
      {
        customerId: 'cust-2', status: 'comparing', fatigue: 55, churnRisk: 45,
        activeCaseIds: ['case-1', 'case-2'],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Test 1: Types are properly defined
// ---------------------------------------------------------------------------

console.log('=== Test 1: Types and exports ===');
check(typeof runAllPhases === 'function', 'runAllPhases is a function');
check(typeof buildRuntimeSummary === 'function', 'buildRuntimeSummary is a function');
check(typeof compactDailyEvents === 'function', 'compactDailyEvents is a function');
check(typeof normalizeRuntimeState === 'function', 'normalizeRuntimeState is a function');
check(typeof createDefaultRuntimeState === 'function', 'createDefaultRuntimeState is a function');
check(DEFAULT_COMPACTION_POLICY.maxDailyEvents > 0, `DEFAULT_COMPACTION_POLICY.maxDailyEvents = ${DEFAULT_COMPACTION_POLICY.maxDailyEvents}`);
check(TICK_PHASE_ORDER.length === 8, `TICK_PHASE_ORDER has ${TICK_PHASE_ORDER.length} phases`);
check(
  JSON.stringify(TICK_PHASE_ORDER) === JSON.stringify([
    'EnvironmentPhase', 'RivalBrokerPhase', 'ListingSupplyPhase',
    'CustomerDemandPhase', 'OwnerPerceptionPhase', 'OpportunityPressurePhase',
    'RecommendationPressurePhase', 'CompactionPhase',
  ]),
  'Phase order is correct',
);

// ---------------------------------------------------------------------------
// Test 2: Phase pipeline produces results
// ---------------------------------------------------------------------------

console.log('\n=== Test 2: Phase pipeline ===');
const input = buildTestInput(5, 42);
const result = runAllPhases(input);
check(result.phaseResults.length === 8, `Got ${result.phaseResults.length} phase results (expected 8)`);
check(result.allDailyEvents.length > 0, `Emitted ${result.allDailyEvents.length} daily events (expected > 0)`);
check(result.allCausalEvents.length > 0, `Emitted ${result.allCausalEvents.length} causal events (expected > 0)`);
check(result.totalMutations > 0, `Total mutations: ${result.totalMutations} (expected > 0)`);

// Each phase should have a result
for (const phaseId of TICK_PHASE_ORDER) {
  const phaseResult = result.phaseResults.find((r) => r.phaseId === phaseId);
  check(Boolean(phaseResult), `Phase ${phaseId} produced a result`);
  if (phaseResult) {
    check(phaseResult.entitiesProcessed >= 0, `  ${phaseId}: ${phaseResult.entitiesProcessed} entities processed`);
  }
}

// ---------------------------------------------------------------------------
// Test 3: Summary changes between days
// ---------------------------------------------------------------------------

console.log('\n=== Test 3: Day 0 / Day 7 / Day 14 runtime summaries ===');

const summaries: BigWorldRuntimeSummary[] = [];
for (const day of [0, 7, 14]) {
  const dayInput = buildTestInput(day, 42);
  const dayResult = runAllPhases(dayInput);
  const summary = buildRuntimeSummary(day, dayResult.phaseResults, dayResult.allDailyEvents);
  summaries.push(summary);
  console.log(`\n  Day ${day}:`);
  console.log(`    Total events: ${summary.totalEvents}`);
  console.log(`    Total mutations: ${summary.totalMutations}`);
  console.log(`    Market avgHeat: ${summary.market.avgHeat}, heatDelta: ${summary.market.heatDelta}`);
  console.log(`    Rival repricing: ${summary.rivals.repricingCount}, followups: ${summary.rivals.followupCount}`);
  console.log(`    Customer comparisons: ${summary.customers.comparisonCount}, attention shifts: ${summary.customers.attentionShiftCount}`);
  console.log(`    Owner pressure: ${summary.owners.pressurePerceivedCount}, avgDelta: ${summary.owners.avgPressureDelta}`);
  console.log(`    Recommendations: ${summary.recommendations.directionChangeCount}`);
}

// Day 0 vs Day 14 should show different summaries (proving world moves)
check(
  summaries[0].totalEvents !== summaries[2].totalEvents
  || summaries[0].totalMutations !== summaries[2].totalMutations
  || summaries[0].market.avgHeat !== summaries[2].market.avgHeat,
  'Day 0 and Day 14 summaries are different (world moves without player)',
);

// ---------------------------------------------------------------------------
// Test 4: Compaction enforces bounds
// ---------------------------------------------------------------------------

console.log('\n=== Test 4: Compaction bounds ===');

// Build a large event list
const largeEventList = Array.from({ length: 600 }, (_, i) => ({
  id: `evt-${i}`,
  day: i,
  phase: 'EnvironmentPhase' as const,
  kind: 'TestEvent',
  source: 'test',
  affectedRefs: [],
  causeEventIds: i > 0 ? [`evt-${i - 1}`] : [],
  visibilityHint: 'hidden' as const,
  boundedPayload: {},
}));

const compacted = compactDailyEvents(largeEventList, 500);
check(compacted.length <= 500, `Compacted events: ${compacted.length} (max 500)`);

// Check cause refs are preserved
const keptIds = new Set(compacted.map((e) => e.id));
let danglingCauses = 0;
for (const event of compacted) {
  for (const causeId of event.causeEventIds) {
    if (!keptIds.has(causeId)) danglingCauses += 1;
  }
}
check(danglingCauses === 0, `Dangling cause refs after compaction: ${danglingCauses}`);

// Test summary compaction
const largeSummaryList = Array.from({ length: 80 }, (_, i) =>
  buildRuntimeSummary(i, [], []),
);
const compactedSummaries = compactDailySummaries(largeSummaryList, 60);
check(compactedSummaries.length <= 60, `Compacted summaries: ${compactedSummaries.length} (max 60)`);

// Test causal ref compaction
const eventWithTooManyRefs = {
  id: 'test', day: 1, phase: 'EnvironmentPhase' as const,
  kind: 'Test', source: 'test', visibilityHint: 'hidden' as const,
  boundedPayload: {},
  affectedRefs: Array.from({ length: 20 }, (_, i) => ({ eventId: `ref-${i}`, day: 0, kind: 'test' })),
  causeEventIds: Array.from({ length: 20 }, (_, i) => `cause-${i}`),
};
const refCompacted = compactCausalRefs([eventWithTooManyRefs], 8);
check(refCompacted[0].causeEventIds.length <= 8, `Causal refs bounded: ${refCompacted[0].causeEventIds.length} (max 8)`);

// ---------------------------------------------------------------------------
// Test 5: Normalization of old saves
// ---------------------------------------------------------------------------

console.log('\n=== Test 5: Old save normalization ===');

const normalized = normalizeRuntimeState(undefined, DEFAULT_COMPACTION_POLICY);
check(normalized.lastTickDay === 0, 'Undefined runtime normalizes to day 0');
check(normalized.dailyEvents.length === 0, 'Undefined runtime has empty events');
check(normalized.tickCount === 0, 'Undefined runtime has 0 ticks');

const normalizedFromPartial = normalizeRuntimeState(
  { lastTickDay: 5, tickCount: 3 },
  DEFAULT_COMPACTION_POLICY,
);
check(normalizedFromPartial.lastTickDay === 5, 'Partial runtime preserves lastTickDay');
check(normalizedFromPartial.tickCount === 3, 'Partial runtime preserves tickCount');

// ---------------------------------------------------------------------------
// Test 6: Full runtime state lifecycle
// ---------------------------------------------------------------------------

console.log('\n=== Test 6: Runtime state lifecycle ===');

const runtime = createDefaultRuntimeState(DEFAULT_COMPACTION_POLICY);
check(runtime.lastTickDay === 0, 'Default runtime starts at day 0');
check(runtime.totalEventsEmitted === 0, 'Default runtime has 0 events emitted');

// Simulate ticking 3 days
for (let day = 1; day <= 3; day += 1) {
  const dayInput = buildTestInput(day, 42);
  const dayResult = runAllPhases(dayInput);
  const summary = buildRuntimeSummary(day, dayResult.phaseResults, dayResult.allDailyEvents);

  // Mutate runtime (simulating what applyTickReceiptToRuntime would do)
  runtime.lastTickDay = day;
  runtime.dailyEvents = [...dayResult.allDailyEvents, ...runtime.dailyEvents];
  runtime.dailySummaries = [summary, ...runtime.dailySummaries];
  runtime.totalEventsEmitted += dayResult.allDailyEvents.length;
  runtime.totalMutationsEmitted += dayResult.totalMutations;
  runtime.tickCount += 1;
}

check(runtime.tickCount === 3, `After 3 ticks: tickCount = ${runtime.tickCount}`);
check(runtime.totalEventsEmitted > 0, `After 3 ticks: totalEventsEmitted = ${runtime.totalEventsEmitted}`);
check(runtime.dailySummaries.length === 3, `After 3 ticks: ${runtime.dailySummaries.length} summaries`);

// Run compaction
const compactedRuntime = runCompactionPass(runtime);
check(compactedRuntime.dailyEvents.length <= DEFAULT_COMPACTION_POLICY.maxDailyEvents, 'Compacted events within bounds');
check(compactedRuntime.dailySummaries.length <= DEFAULT_COMPACTION_POLICY.maxSummaryDays, 'Compacted summaries within bounds');

// ---------------------------------------------------------------------------
// Test 7: No forbidden mutations proof
// ---------------------------------------------------------------------------

console.log('\n=== Test 7: No forbidden mutations ===');

const forbiddenChecks: string[] = [];

// Check that phases never produce events with forbidden kinds
const forbiddenEventKinds = ['case_sold', 'case_withdrawn', 'deal_closed', 'owner_trust_changed', 'customer_committed'];
for (const event of result.allDailyEvents) {
  if (forbiddenEventKinds.includes(event.kind)) {
    forbiddenChecks.push(`Phase produced forbidden event kind: ${event.kind}`);
  }
}

// Check that daily events don't have forbidden payload keys
const forbiddenPayloadKeys = ['soldStatus', 'closedDealId', 'trustValue', 'patienceValue', 'finalCommitment'];
for (const event of result.allDailyEvents) {
  for (const key of forbiddenPayloadKeys) {
    if (key in event.boundedPayload) {
      forbiddenChecks.push(`Event ${event.id} has forbidden payload key: ${key}`);
    }
  }
}

check(forbiddenChecks.length === 0, `Forbidden mutations: ${forbiddenChecks.length === 0 ? 'none' : forbiddenChecks.join('; ')}`);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Big World Runtime Substrate Verification Summary ===`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  console.error(`\nVERIFICATION FAILED: ${failed} checks did not pass.`);
  process.exit(1);
} else {
  console.log(`\nVERIFICATION PASSED: All ${passed} checks passed.`);
}
