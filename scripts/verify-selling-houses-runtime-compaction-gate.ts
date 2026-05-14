/**
 * BigWorld Runtime — Compaction Gate
 *
 * Verifies that compaction:
 *   1. Preserves causal chain integrity (no dangling refs)
 *   2. Enforces maxDailyEvents bound
 *   3. Enforces maxSummaryDays bound
 *   4. Enforces maxCausalRefsPerEvent bound
 *   5. Preserves source refs in cold ledger summaries
 *   6. ColdLedgerSummary is explainable (can trace "why this UI judgment")
 *   7. Deterministic compaction (same input → same compacted state)
 *   8. worldCausalEvents bounded by maxTotalCausalEvents
 *   9. Performance: compaction pass completes in reasonable time
 *  10. Old-save normalization handles missing coldLedgerSummaries
 *
 * This gate catches "just let events grow forever and claim it's big" false-big.
 *
 * Usage: npx tsx scripts/verify-selling-houses-runtime-compaction-gate.ts
 */

import assert from 'node:assert/strict';

import {
  compactDailyEvents,
  compactDailySummaries,
  compactCausalRefs,
  compactWorldCausalEvents,
  compactColdLedgerSummaries,
  runCompactionPass,
  buildRuntimeSummary,
  buildColdLedgerSummary,
  normalizeRuntimeState,
  createDefaultRuntimeState,
} from '../src/selling-houses/domain/world-model/runtime/compaction.js';

import {
  ingestSourceRecordsBatch,
} from '../src/selling-houses/domain/world-model/runtime/sourceIngestionAdapter.js';

import {
  DEFAULT_COMPACTION_POLICY,
} from '../src/selling-houses/domain/world-model/runtime/types.js';

import type {
  BigWorldRuntimeState,
  BigWorldDailyEvent,
  BigWorldRuntimeSummary,
  ColdLedgerSummary,
  WorldRuntimeCompactionPolicy,
} from '../src/selling-houses/domain/world-model/runtime/types.js';

import type {
  InformationSourceRecord,
  SourceKind,
} from '../src/selling-houses/domain/world-model/informationSourceTypes.js';

const SOURCE_KINDS: SourceKind[] = [
  'market_signal', 'rival_action', 'customer_interaction',
  'owner_interview', 'manager_message', 'player_action_receipt',
  'process_receipt', 'comparable_transaction', 'platform_traffic', 'acn_network_signal',
];

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

function checkRange(value: number, min: number, max: number, message: string) {
  check(value >= min && value <= max, `${message} (got ${value}, expected [${min}, ${max}])`);
}

// ---------------------------------------------------------------------------
// Test data generators
// ---------------------------------------------------------------------------

function makeDailyEvent(id: string, day: number, causeIds: string[] = []): BigWorldDailyEvent {
  return Object.freeze({
    id,
    day,
    phase: 'EnvironmentPhase' as const,
    kind: 'MarketHeatShifted',
    source: 'system-tick',
    affectedRefs: Object.freeze([]),
    causeEventIds: Object.freeze([...causeIds]),
    visibilityHint: 'signal' as const,
    boundedPayload: Object.freeze({ marketCellId: 'cell-1', before: 50, after: 60 }),
  });
}

function makeBulkDailyEvents(count: number): BigWorldDailyEvent[] {
  const events: BigWorldDailyEvent[] = [];
  for (let i = 0; i < count; i += 1) {
    const day = Math.floor(i / 10);
    const causeIds = i > 0 ? [`bwe-test-${i - 1}`] : [];
    events.push(makeDailyEvent(`bwe-test-${i}`, day, causeIds));
  }
  return events;
}

function makeBulkSummaries(count: number): BigWorldRuntimeSummary[] {
  const summaries: BigWorldRuntimeSummary[] = [];
  for (let i = 0; i < count; i += 1) {
    summaries.push(Object.freeze({
      day: i,
      totalEvents: 10,
      totalMutations: 5,
      market: Object.freeze({ avgHeat: 55, heatDelta: 1, risingCellCount: 2, decliningCellCount: 1, seasonalPressure: 0.5, policyPressure: 0.5 }),
      rivals: Object.freeze({ repricingCount: 1, followupCount: 2, avgPriceChange: 5, newListings: 0, withdrawnListings: 0 }),
      customers: Object.freeze({ comparisonCount: 3, attentionShiftCount: 1, avgUrgency: 50, churnedCount: 0, newActivations: 0 }),
      owners: Object.freeze({ pressurePerceivedCount: 2, avgPressureDelta: 10, urgencyIncreasedCount: 1, patienceDecreasedCount: 0 }),
      opportunities: Object.freeze({ fitChangeCount: 1, readinessChangeCount: 0, newOpportunities: 0, lostOpportunities: 0 }),
      recommendations: Object.freeze({ directionChangeCount: 1, pressureCandidateCount: 1, escalatedCount: 0 }),
      hadErrors: false,
      errors: Object.freeze([]),
    }));
  }
  return summaries;
}

function makeBulkColdSummaries(count: number): ColdLedgerSummary[] {
  const summaries: ColdLedgerSummary[] = [];
  for (let i = 0; i < count; i += 1) {
    const bySourceKind = new Map<string, { count: number; causalEventsProduced: number }>();
    bySourceKind.set('market_signal', { count: 5, causalEventsProduced: 5 });
    bySourceKind.set('rival_action', { count: 3, causalEventsProduced: 3 });

    summaries.push(Object.freeze({
      fromDay: i * 10,
      toDay: (i + 1) * 10,
      totalSourceRecords: 8,
      totalCausalEventsFromSources: 8,
      bySourceKind: Object.freeze(bySourceKind) as ReadonlyMap<string, { readonly count: number; readonly causalEventsProduced: number }>,
      latestSourceIdByKind: Object.freeze(new Map([['market_signal', `isr-ms-${i}`], ['rival_action', `isr-ra-${i}`]])),
      latestReplayKeyByKind: Object.freeze(new Map([['market_signal', `rk-ms-${i}`], ['rival_action', `rk-ra-${i}`]])),
      totalPhaseEvents: 10,
      totalMutations: 5,
    }));
  }
  return summaries;
}

function makeBulkCausalEvents(count: number): { id: string; day: number; causeEventIds: readonly string[] }[] {
  const events: { id: string; day: number; causeEventIds: readonly string[] }[] = [];
  for (let i = 0; i < count; i += 1) {
    const day = Math.floor(i / 5);
    const causeIds = i > 0 ? [`evt-${i - 1}`] : [];
    events.push({ id: `evt-${i}`, day, causeEventIds: causeIds });
  }
  return events;
}

function buildTestSourceRecord(index: number, kind: SourceKind): InformationSourceRecord {
  const sourceId = `isr-${kind}-${index}`;
  const base = {
    sourceId,
    sourceKind: kind,
    day: 5,
    phase: 'morning' as const,
    entityRefs: [{ id: `entity-${index}`, kind: 'listing' as const }],
    actorRefs: [{ id: `actor-${index}`, role: 'system' as const }],
    visibility: { scope: 'all_actors' as const, baseDelayDays: 0 },
    confidence: 0.8,
    delayDays: 0,
    replayKey: `rk-${kind}-${index}`,
    origin: 'ecosystem_tick' as const,
  };

  switch (kind) {
    case 'market_signal':
      return { ...base, sourceKind: 'market_signal', payload: { subtype: 'heat_shift', marketCellId: `cell-${index}`, before: 50, after: 60, unit: 'heat', isPublic: true, summary: `test ${index}` } as any };
    case 'rival_action':
      return { ...base, sourceKind: 'rival_action', payload: { subtype: 'reprice', rivalBrokerId: `broker-${index}`, rivalAcnId: 'acn-1', listingId: `listing-${index}`, priceBefore: 300, priceAfter: 280, marketCellId: `cell-${index}`, evidenceStrength: 'direct', summary: `test ${index}` } as any };
    case 'customer_interaction':
      return { ...base, sourceKind: 'customer_interaction', payload: { subtype: 'comparison_made', customerId: `customer-${index}`, listingId: `listing-${index}`, observationMode: 'observed', summary: `test ${index}` } as any };
    case 'owner_interview':
      return { ...base, sourceKind: 'owner_interview', payload: { subtype: 'price_discussed', ownerId: `owner-${index}`, caseId: `case-${index}`, brokerId: `broker-${index}`, tone: 'neutral', ownerStatement: `statement ${index}`, interactionMode: 'scheduled_call', summary: `test ${index}` } as any };
    case 'manager_message':
      return { ...base, sourceKind: 'manager_message', payload: { subtype: 'focus_case_selected', managerId: 'mgr-1', targetBrokerId: `broker-${index}`, caseIds: [`case-${index}`], priority: 70, instruction: `focus ${index}`, summary: `test ${index}` } as any };
    case 'player_action_receipt':
      return { ...base, sourceKind: 'player_action_receipt', payload: { subtype: 'action_executed', actionId: `action-${index}`, executorId: 'player-broker', caseId: `case-${index}`, costEnergy: 2, costPromotionBudget: 0, fieldDeltas: [], outcome: 'success', summary: `test ${index}` } as any };
    case 'process_receipt':
      return { ...base, sourceKind: 'process_receipt', payload: { subtype: 'open_day_completed', processType: 'open_day', processId: `proc-${index}`, caseIds: [`case-${index}`], customerIds: [], brokerIds: [], outcome: 'completed', metrics: {}, summary: `test ${index}` } as any };
    case 'comparable_transaction':
      return { ...base, sourceKind: 'comparable_transaction', payload: { subtype: 'deal_closed', marketCellId: `cell-${index}`, district: 'test', layout: '2室1厅', areaSqm: 70, price: 280, askPrice: 300, discountPct: 6.7, daysOnMarket: 20, dataSource: 'platform公开', summary: `test ${index}` } as any };
    case 'platform_traffic':
      return { ...base, sourceKind: 'platform_traffic', payload: { subtype: 'traffic_spike', listingId: `listing-${index}`, marketCellId: `cell-${index}`, viewCount: 150, favoriteCount: 10, inquiryCount: 3, timeWindow: 'last_24h', isDelta: false, summary: `test ${index}` } as any };
    case 'acn_network_signal':
      return { ...base, sourceKind: 'acn_network_signal', payload: { subtype: 'cooperation_opportunity', sourceAcnId: 'acn-1', brokerIds: [`broker-${index}`], cooperationScore: 75, summary: `test ${index}` } as any };
    default:
      return { ...base, sourceKind: 'market_signal', payload: { subtype: 'heat_shift', marketCellId: `cell-${index}`, before: 50, after: 60, unit: 'heat', isPublic: true, summary: `test ${index}` } as any };
  }
}

// ===========================================================================
// Gate 1: compactDailyEvents bounds
// ===========================================================================
console.log('=== Gate 1: compactDailyEvents bounds ===');

const bulkEvents = makeBulkDailyEvents(600);
const compactedEvents = compactDailyEvents(bulkEvents, 500);
check(compactedEvents.length <= 500, `compacted events <= 500 (got ${compactedEvents.length})`);

// Verify cause chain integrity
const keptIds = new Set(compactedEvents.map((e) => e.id));
let danglingCauses = 0;
for (const event of compactedEvents) {
  for (const causeId of event.causeEventIds) {
    if (!keptIds.has(causeId)) danglingCauses += 1;
  }
}
check(danglingCauses === 0, `No dangling cause refs after compaction (got ${danglingCauses})`);

// When under limit, no change
const smallEvents = makeBulkDailyEvents(100);
const smallCompacted = compactDailyEvents(smallEvents, 500);
check(smallCompacted.length === 100, `Under limit → no change: ${smallCompacted.length}`);

// ===========================================================================
// Gate 2: compactDailySummaries bounds
// ===========================================================================
console.log('\n=== Gate 2: compactDailySummaries bounds ===');

const bulkSummaries = makeBulkSummaries(80);
const compactedSummaries = compactDailySummaries(bulkSummaries, 60);
check(compactedSummaries.length <= 60, `compacted summaries <= 60 (got ${compactedSummaries.length})`);

// Newest kept (summaries are in ascending order, so slice keeps the end)
check(compactedSummaries[compactedSummaries.length - 1].day === 79, `newest summary day: ${compactedSummaries[compactedSummaries.length - 1].day}`);

// ===========================================================================
// Gate 3: compactCausalRefs bounds
// ===========================================================================
console.log('\n=== Gate 3: compactCausalRefs bounds ===');

const eventsWithRefs: BigWorldDailyEvent[] = Array.from({ length: 5 }, (_, i) =>
  makeDailyEvent(`ref-${i}`, 1, Array.from({ length: 20 }, (_, j) => `cause-${j}`)),
);
const refCompacted = compactCausalRefs(eventsWithRefs, 8);
for (const event of refCompacted) {
  check(event.causeEventIds.length <= 8,
    `Event ${event.id} causeEventIds bounded: ${event.causeEventIds.length} <= 8`);
}

// ===========================================================================
// Gate 4: compactWorldCausalEvents bounds
// ===========================================================================
console.log('\n=== Gate 4: compactWorldCausalEvents bounds ===');

const bulkCausal = makeBulkCausalEvents(2500);
const compactedCausal = compactWorldCausalEvents(bulkCausal, 2000);
check(compactedCausal.length <= 2000, `compacted causal events <= 2000 (got ${compactedCausal.length})`);

// Compaction must preserve causal integrity: removed events cannot remain as dangling refs.
const compactedCausalIds = new Set(compactedCausal.map((e) => e.id));
let compactedDanglingCauseRefs = 0;
let cleanedCausalRefCount = 0;
for (const event of compactedCausal) {
  const original = bulkCausal.find((entry) => entry.id === event.id);
  if (original && event.causeEventIds.length < original.causeEventIds.length) {
    cleanedCausalRefCount += original.causeEventIds.length - event.causeEventIds.length;
  }
  for (const causeId of event.causeEventIds) {
    if (!compactedCausalIds.has(causeId)) compactedDanglingCauseRefs += 1;
  }
}
check(compactedDanglingCauseRefs === 0,
  `No dangling cause refs after compaction (got ${compactedDanglingCauseRefs})`);
check(cleanedCausalRefCount > 0,
  `Dangling-prone cause refs cleaned: ${cleanedCausalRefCount} > 0`);

// ===========================================================================
// Gate 5: ColdLedgerSummary preservation
// ===========================================================================
console.log('\n=== Gate 5: ColdLedgerSummary preservation ===');

const bulkCold = makeBulkColdSummaries(80);
const compactedCold = compactColdLedgerSummaries(bulkCold, 60);
check(compactedCold.length <= 60, `compacted cold summaries <= 60 (got ${compactedCold.length})`);

// Verify source kind data preserved
for (const summary of compactedCold.slice(0, 5)) {
  check(summary.bySourceKind.size > 0, `Cold summary fromDay=${summary.fromDay} has sourceKind data`);
  check(summary.latestSourceIdByKind.size > 0, `Cold summary has latestSourceIdByKind`);
  check(summary.latestReplayKeyByKind.size > 0, `Cold summary has latestReplayKeyByKind`);
  check(summary.totalSourceRecords > 0, `Cold summary totalSourceRecords > 0`);
}

// ===========================================================================
// Gate 6: ColdLedgerSummary explainability
// ===========================================================================
console.log('\n=== Gate 6: ColdLedgerSummary explainability ===');

const explainReceipt = ingestSourceRecordsBatch(
  Array.from({ length: 50 }, (_, i) => buildTestSourceRecord(i, SOURCE_KINDS[i % SOURCE_KINDS.length])),
  5, 42,
);

const explainSummary = buildColdLedgerSummary(
  5, 5,
  [
    { phaseId: 'EnvironmentPhase', mutationCount: 3, entitiesProcessed: 5 },
    { phaseId: 'SourceIngestionPhase', mutationCount: explainReceipt.sourcesWithEffect, entitiesProcessed: explainReceipt.sourcesProcessed },
  ],
  explainReceipt,
);

check(explainSummary.fromDay === 5, `Cold summary fromDay: ${explainSummary.fromDay}`);
check(explainSummary.toDay === 5, `Cold summary toDay: ${explainSummary.toDay}`);
check(explainSummary.totalSourceRecords > 0, `totalSourceRecords: ${explainSummary.totalSourceRecords}`);
check(explainSummary.totalCausalEventsFromSources > 0, `totalCausalEventsFromSources: ${explainSummary.totalCausalEventsFromSources}`);
check(explainSummary.bySourceKind.size > 0, `bySourceKind has entries: ${explainSummary.bySourceKind.size}`);

// Verify we can trace "why this UI judgment"
for (const [kind, stats] of explainSummary.bySourceKind) {
  check(stats.count > 0, `${kind}: count > 0`);
  check(stats.causalEventsProduced > 0, `${kind}: causalEventsProduced > 0`);
}

// Verify latest sourceId/replayKey per kind
for (const [kind, sourceId] of explainSummary.latestSourceIdByKind) {
  check(sourceId.startsWith('isr-'), `${kind}: latestSourceId is valid: ${sourceId}`);
}

// ===========================================================================
// Gate 7: runCompactionPass full pass
// ===========================================================================
console.log('\n=== Gate 7: runCompactionPass ===');

const bigRuntime: BigWorldRuntimeState = {
  compactionPolicy: DEFAULT_COMPACTION_POLICY,
  lastTickDay: 100,
  dailyEvents: makeBulkDailyEvents(600),
  dailySummaries: makeBulkSummaries(80),
  coldLedgerSummaries: makeBulkColdSummaries(80),
  totalEventsEmitted: 6000,
  totalMutationsEmitted: 3000,
  tickCount: 100,
  recentErrors: Array.from({ length: 25 }, (_, i) => `error-${i}`),
};

const compactedRuntime = runCompactionPass(bigRuntime);
check(compactedRuntime.dailyEvents.length <= 500, `compacted dailyEvents <= 500`);
check(compactedRuntime.dailySummaries.length <= 60, `compacted dailySummaries <= 60`);
check(compactedRuntime.coldLedgerSummaries.length <= 60, `compacted coldLedgerSummaries <= 60`);
check(compactedRuntime.recentErrors.length <= 20, `compacted recentErrors <= 20`);
check(compactedRuntime.lastTickDay === 100, `lastTickDay preserved: ${compactedRuntime.lastTickDay}`);
check(compactedRuntime.totalEventsEmitted === 6000, `totalEventsEmitted preserved: ${compactedRuntime.totalEventsEmitted}`);
check(compactedRuntime.tickCount === 100, `tickCount preserved: ${compactedRuntime.tickCount}`);

// ===========================================================================
// Gate 8: Deterministic compaction
// ===========================================================================
console.log('\n=== Gate 8: Deterministic compaction ===');

const runtimeA: BigWorldRuntimeState = {
  compactionPolicy: DEFAULT_COMPACTION_POLICY,
  lastTickDay: 50,
  dailyEvents: makeBulkDailyEvents(600),
  dailySummaries: makeBulkSummaries(80),
  coldLedgerSummaries: makeBulkColdSummaries(80),
  totalEventsEmitted: 3000,
  totalMutationsEmitted: 1500,
  tickCount: 50,
  recentErrors: [],
};

const runtimeB: BigWorldRuntimeState = {
  compactionPolicy: DEFAULT_COMPACTION_POLICY,
  lastTickDay: 50,
  dailyEvents: makeBulkDailyEvents(600),
  dailySummaries: makeBulkSummaries(80),
  coldLedgerSummaries: makeBulkColdSummaries(80),
  totalEventsEmitted: 3000,
  totalMutationsEmitted: 1500,
  tickCount: 50,
  recentErrors: [],
};

const compactedA = runCompactionPass(runtimeA);
const compactedB = runCompactionPass(runtimeB);

check(compactedA.dailyEvents.length === compactedB.dailyEvents.length,
  `Same input → same compacted dailyEvents length`);
check(compactedA.dailySummaries.length === compactedB.dailySummaries.length,
  `Same input → same compacted dailySummaries length`);
check(compactedA.coldLedgerSummaries.length === compactedB.coldLedgerSummaries.length,
  `Same input → same compacted coldLedgerSummaries length`);

// ===========================================================================
// Gate 9: Performance
// ===========================================================================
console.log('\n=== Gate 9: Compaction performance ===');

const perfStart = performance.now();
const perfRuntime: BigWorldRuntimeState = {
  compactionPolicy: DEFAULT_COMPACTION_POLICY,
  lastTickDay: 200,
  dailyEvents: makeBulkDailyEvents(1000),
  dailySummaries: makeBulkSummaries(120),
  coldLedgerSummaries: makeBulkColdSummaries(120),
  totalEventsEmitted: 10000,
  totalMutationsEmitted: 5000,
  tickCount: 200,
  recentErrors: Array.from({ length: 30 }, (_, i) => `err-${i}`),
};

for (let i = 0; i < 100; i += 1) {
  runCompactionPass(perfRuntime);
}
const perfDurationMs = performance.now() - perfStart;

check(perfDurationMs < 5000, `100 compaction passes in <5s (got ${Math.round(perfDurationMs)}ms)`);

// ===========================================================================
// Gate 10: Old-save normalization
// ===========================================================================
console.log('\n=== Gate 10: Old-save normalization ===');

const normalized = normalizeRuntimeState(undefined, DEFAULT_COMPACTION_POLICY);
check(normalized.lastTickDay === 0, 'undefined → lastTickDay = 0');
check(normalized.dailyEvents.length === 0, 'undefined → empty dailyEvents');
check(normalized.dailySummaries.length === 0, 'undefined → empty dailySummaries');
check(normalized.coldLedgerSummaries.length === 0, 'undefined → empty coldLedgerSummaries');
check(normalized.tickCount === 0, 'undefined → tickCount = 0');

const partialNormalized = normalizeRuntimeState(
  { lastTickDay: 5, tickCount: 3 },
  DEFAULT_COMPACTION_POLICY,
);
check(partialNormalized.lastTickDay === 5, 'partial → preserves lastTickDay');
check(partialNormalized.coldLedgerSummaries.length === 0, 'partial → empty coldLedgerSummaries');

// ===========================================================================
// Gate 11: worldCausalEvents bounded after 100+ source records
// ===========================================================================
console.log('\n=== Gate 11: Causal events bounded after bulk ingestion ===');

const bulkSourceRecords = Array.from({ length: 150 }, (_, i) => buildTestSourceRecord(i, SOURCE_KINDS[i % SOURCE_KINDS.length]));
const bulkReceipt = ingestSourceRecordsBatch(bulkSourceRecords, 5, 42);

// Some source kinds (e.g. comparable_transaction with deal_closed) produce 2 events per record.
// With 150 records across 10 kinds (15 per kind), maxEventsPerKind=50 doesn't cap individual records.
// Max theoretical: 150 records * 2 events = 300. Actual depends on subtype distribution.
check(bulkReceipt.causalEvents.length <= 300, `causal events bounded: ${bulkReceipt.causalEvents.length} <= 300`);

// After compaction
const compactedCausalFromBulk = compactWorldCausalEvents(bulkReceipt.causalEvents, 100);
check(compactedCausalFromBulk.length <= 100, `after compaction: ${compactedCausalFromBulk.length} <= 100`);

// ===========================================================================
// Gate 12: Custom compaction policy
// ===========================================================================
console.log('\n=== Gate 12: Custom compaction policy ===');

const customPolicy: WorldRuntimeCompactionPolicy = {
  maxDailyEvents: 50,
  maxSummaryDays: 10,
  maxCausalRefsPerEvent: 4,
  compactAfterDays: 7,
  maxTotalCausalEvents: 200,
};

const customRuntime: BigWorldRuntimeState = {
  compactionPolicy: customPolicy,
  lastTickDay: 30,
  dailyEvents: makeBulkDailyEvents(200),
  dailySummaries: makeBulkSummaries(30),
  coldLedgerSummaries: makeBulkColdSummaries(30),
  totalEventsEmitted: 2000,
  totalMutationsEmitted: 1000,
  tickCount: 30,
  recentErrors: [],
};

const customCompacted = runCompactionPass(customRuntime);
check(customCompacted.dailyEvents.length <= 50, `custom: dailyEvents <= 50 (got ${customCompacted.dailyEvents.length})`);
check(customCompacted.dailySummaries.length <= 10, `custom: dailySummaries <= 10 (got ${customCompacted.dailySummaries.length})`);
check(customCompacted.coldLedgerSummaries.length <= 10, `custom: coldLedgerSummaries <= 10 (got ${customCompacted.coldLedgerSummaries.length})`);

// ===========================================================================
// Summary
// ===========================================================================
console.log(`\n=== Compaction Gate Summary ===`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  console.error(`\nGATE FAILED: ${failed} checks did not pass.`);
  console.error('\nFailures:');
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
} else {
  console.log(`\nGATE PASSED: All ${passed} checks passed.`);
}
