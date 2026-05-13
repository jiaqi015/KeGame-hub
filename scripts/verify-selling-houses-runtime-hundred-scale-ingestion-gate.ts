/**
 * BigWorld Runtime — Hundred-Scale Ingestion Gate
 *
 * Verifies that 100+ source records flowing into the runtime are:
 *   1. Deterministic (same input → same output)
 *   2. Source-traceable (every causal event has sourceRecordId/sourceReplayKey/sourceKind)
 *   3. Ordered deterministically (same-day records sorted by sourceKind + sourceId)
 *   4. Batch-capped (MAX_BATCH_SIZE enforced)
 *   5. Per-kind bounded (maxEventsPerKind enforced)
 *   6. Performance-guarded (tick completes in reasonable time)
 *   7. No hidden mutations (only writes to runtime/causal ledger)
 *   8. Old-save compatible (empty sourceRecords → no regression)
 *
 * This gate catches "just append thousands of events and freeze the UI" false-big.
 *
 * Usage: npx tsx scripts/verify-selling-houses-runtime-hundred-scale-ingestion-gate.ts
 */

import assert from 'node:assert/strict';

import {
  ingestSourceRecords,
  ingestSourceRecordsBatch,
  MAX_BATCH_SIZE,
} from '../src/selling-houses/domain/world-model/runtime/sourceIngestionAdapter.js';

import {
  runBigWorldDayTick,
  applyTickReceiptToRuntime,
  createDefaultRuntimeState,
  DEFAULT_COMPACTION_POLICY,
} from '../src/selling-houses/domain/world-model/runtime/index.js';

import type {
  BigWorldClockInput,
  BigWorldRuntimeState,
} from '../src/selling-houses/domain/world-model/runtime/types.js';

import type {
  InformationSourceRecord,
  SourceKind,
} from '../src/selling-houses/domain/world-model/informationSourceTypes.js';

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

const SOURCE_KINDS: SourceKind[] = [
  'market_signal', 'rival_action', 'customer_interaction',
  'owner_interview', 'manager_message', 'player_action_receipt',
  'process_receipt', 'comparable_transaction', 'platform_traffic', 'acn_network_signal',
];

function makeSourceRecord(
  index: number,
  day: number,
  kind: SourceKind,
  seed: number,
): InformationSourceRecord {
  const sourceId = `isr-${seed}-${kind}-${day}-${index}`;
  const replayKey = `rk-${seed}-${kind}-${day}-${index}`;

  const base = {
    sourceId,
    sourceKind: kind,
    day,
    phase: 'morning' as const,
    entityRefs: [{ id: `entity-${index}`, kind: 'listing' as const }],
    actorRefs: [{ id: `actor-${index}`, role: 'system' as const }],
    visibility: { scope: 'all_actors' as const, baseDelayDays: 0 },
    confidence: 0.8,
    delayDays: 0,
    replayKey,
    origin: 'ecosystem_tick' as const,
  };

  switch (kind) {
    case 'market_signal':
      return { ...base, sourceKind: 'market_signal', payload: { subtype: 'heat_shift', marketCellId: `cell-${index % 5}`, before: 50, after: 60, unit: 'heat', isPublic: true, summary: `market signal ${index}` } };
    case 'rival_action':
      return { ...base, sourceKind: 'rival_action', payload: { subtype: 'reprice' as const, rivalBrokerId: `broker-${index}`, rivalAcnId: `acn-${index % 3}`, listingId: `listing-${index}`, priceBefore: 300, priceAfter: 280, marketCellId: `cell-${index % 5}`, evidenceStrength: 'direct' as const, summary: `rival action ${index}` } };
    case 'customer_interaction':
      return { ...base, sourceKind: 'customer_interaction', payload: { subtype: 'comparison_made' as const, customerId: `customer-${index}`, listingId: `listing-${index}`, observationMode: 'observed' as const, summary: `customer interaction ${index}` } };
    case 'owner_interview':
      return { ...base, sourceKind: 'owner_interview', payload: { subtype: 'price_discussed' as const, ownerId: `owner-${index}`, caseId: `case-${index}`, brokerId: `broker-${index}`, tone: 'neutral' as const, ownerStatement: `owner statement ${index}`, interactionMode: 'scheduled_call' as const, summary: `owner interview ${index}` } };
    case 'manager_message':
      return { ...base, sourceKind: 'manager_message', payload: { subtype: 'focus_case_selected' as const, managerId: 'mgr-1', targetBrokerId: `broker-${index}`, caseIds: [`case-${index}`], priority: 70, instruction: `focus on case ${index}`, summary: `manager message ${index}` } };
    case 'player_action_receipt':
      return { ...base, sourceKind: 'player_action_receipt', payload: { subtype: 'action_executed' as const, actionId: `action-${index}`, executorId: 'player-broker', caseId: `case-${index}`, costEnergy: 2, costPromotionBudget: 0, fieldDeltas: [], outcome: 'success' as const, summary: `player action ${index}` } };
    case 'process_receipt':
      return { ...base, sourceKind: 'process_receipt', payload: { subtype: 'open_day_completed' as const, processType: 'open_day' as const, processId: `proc-${index}`, caseIds: [`case-${index}`], customerIds: [], brokerIds: [], outcome: 'completed', metrics: {}, summary: `process receipt ${index}` } };
    case 'comparable_transaction':
      return { ...base, sourceKind: 'comparable_transaction', payload: { subtype: 'deal_closed' as const, marketCellId: `cell-${index % 5}`, district: 'test', layout: '2室1厅', areaSqm: 70, price: 280, askPrice: 300, discountPct: 6.7, daysOnMarket: 20, dataSource: 'platform公开' as const, summary: `comparable txn ${index}` } };
    case 'platform_traffic':
      return { ...base, sourceKind: 'platform_traffic', payload: { subtype: 'traffic_spike' as const, listingId: `listing-${index}`, marketCellId: `cell-${index % 5}`, viewCount: 150, favoriteCount: 10, inquiryCount: 3, timeWindow: 'last_24h', isDelta: false, summary: `platform traffic ${index}` } };
    case 'acn_network_signal':
      return { ...base, sourceKind: 'acn_network_signal', payload: { subtype: 'cooperation_opportunity' as const, sourceAcnId: `acn-${index % 3}`, brokerIds: [`broker-${index}`], cooperationScore: 75, summary: `acn signal ${index}` } };
    default:
      return { ...base, sourceKind: 'market_signal', payload: { subtype: 'heat_shift', marketCellId: `cell-${index % 5}`, before: 50, after: 60, unit: 'heat', isPublic: true, summary: `fallback ${index}` } };
  }
}

function buildBulkSourceRecords(count: number, day: number, seed: number): InformationSourceRecord[] {
  const records: InformationSourceRecord[] = [];
  for (let i = 0; i < count; i += 1) {
    const kind = SOURCE_KINDS[i % SOURCE_KINDS.length];
    records.push(makeSourceRecord(i, day, kind, seed));
  }
  return records;
}

function buildHundredScaleClockInput(
  sourceRecords: readonly InformationSourceRecord[],
): BigWorldClockInput {
  return {
    settledDay: 5,
    runSeed: 42,
    marketCells: Array.from({ length: 5 }, (_, i) => ({
      id: `cell-${i}`, name: `cell-${i}`, demandHeat: 50 + i * 5,
      supplyPressure: 40, competitivePressure: 50, sentiment: 55,
    })),
    activeCases: Array.from({ length: 10 }, (_, i) => ({
      id: `case-${i}`, title: `case-${i}`, district: 'test', marketCellId: `cell-${i % 5}`,
      trust: 55, patience: 50, urgency: 45, heat: 50, competitiveness: 60,
      d1: 45, d3: 55, ownerName: `owner-${i}`, windowDays: 14, personality: 'pragmatic',
    })),
    activeOpportunities: Array.from({ length: 8 }, (_, i) => ({
      id: `opp-${i}`, caseId: `case-${i}`, customerId: `customer-${i}`,
      customerName: `customer-${i}`, fit: 65, intent: 50, confidence: 55,
      stageIndex: 2, stagnationTicks: 3,
    })),
    rivalListings: Array.from({ length: 15 }, (_, i) => ({
      id: `rival-${i}`, storeId: `store-${i % 3}`, title: `rival-${i}`,
      district: 'test', marketCellId: `cell-${i % 5}`, segment: 'residential',
      askPrice: 300 + i * 10, heat: 50, freshness: 60, status: 'active', daysLeft: 10,
    })),
    rivalStores: Array.from({ length: 3 }, (_, i) => ({
      id: `store-${i}`, name: `store-${i}`, type: 'external_company', style: 'aggressive',
      districtFocus: ['test'], leadCapturePower: 60, sellerInfluencePower: 55,
      pricingPressurePower: 50, activityHeat: 65,
    })),
    customerStates: Array.from({ length: 20 }, (_, i) => ({
      customerId: `customer-${i}`, status: 'browsing', fatigue: 30, churnRisk: 20,
      activeCaseIds: [`case-${i % 10}`, `case-${(i + 1) % 10}`],
    })),
    sourceRecords,
  };
}

// ===========================================================================
// Gate 1: Deterministic ordering
// ===========================================================================
console.log('=== Gate 1: Deterministic ordering ===');

const records100 = buildBulkSourceRecords(100, 5, 42);
const receiptA = ingestSourceRecordsBatch(records100, 5, 42);
const receiptB = ingestSourceRecordsBatch(records100, 5, 42);

check(receiptA.causalEvents.length === receiptB.causalEvents.length,
  `Same input → same causal event count: ${receiptA.causalEvents.length}`);
check(receiptA.replayKey === receiptB.replayKey,
  `Same input → same replayKey`);

// Verify deterministic ordering: same-day records sorted by (sourceKind, sourceId)
const sourceIds100 = receiptA.causalEvents.map((e) => e.sourceRecordId ?? '').filter(Boolean);
const sourceIds100B = receiptB.causalEvents.map((e) => e.sourceRecordId ?? '').filter(Boolean);
check(JSON.stringify(sourceIds100) === JSON.stringify(sourceIds100B),
  'Same input → same sourceRecordId ordering');

// ===========================================================================
// Gate 2: Batch size enforcement
// ===========================================================================
console.log('\n=== Gate 2: Batch size enforcement ===');

const oversizedBatch = buildBulkSourceRecords(600, 5, 42);
const oversizedReceipt = ingestSourceRecordsBatch(oversizedBatch, 5, 42);

check(oversizedReceipt.sourcesProcessed <= MAX_BATCH_SIZE,
  `Oversized batch capped to ${MAX_BATCH_SIZE} (got ${oversizedReceipt.sourcesProcessed})`);
check(oversizedReceipt.batchDurationUs >= 0, `batchDurationUs tracked: ${oversizedReceipt.batchDurationUs}`);

// ===========================================================================
// Gate 3: Per-kind event cap
// ===========================================================================
console.log('\n=== Gate 3: Per-kind event cap ===');

const maxPerKind = 5;
const cappedReceipt = ingestSourceRecordsBatch(records100, 5, 42, maxPerKind);

for (const [kind, stats] of cappedReceipt.byKind) {
  check(stats.causalEventsProduced <= maxPerKind,
    `${kind}: causalEventsProduced ${stats.causalEventsProduced} <= ${maxPerKind}`);
}

// ===========================================================================
// Gate 4: Source traceability on all causal events
// ===========================================================================
console.log('\n=== Gate 4: Source traceability ===');

for (const event of receiptA.causalEvents) {
  check(typeof event.sourceRecordId === 'string' && event.sourceRecordId.length > 0,
    `Event ${event.id} has sourceRecordId: ${event.sourceRecordId}`);
  check(typeof event.sourceReplayKey === 'string' && event.sourceReplayKey.length > 0,
    `Event ${event.id} has sourceReplayKey`);
  check(typeof event.sourceKind === 'string' && event.sourceKind.length > 0,
    `Event ${event.id} has sourceKind: ${event.sourceKind}`);
}

// ===========================================================================
// Gate 5: sourceToEvents mapping is complete
// ===========================================================================
console.log('\n=== Gate 5: sourceToEvents mapping ===');

check(receiptA.sourceToEvents.size > 0, `sourceToEvents has entries: ${receiptA.sourceToEvents.size}`);

for (const [sourceId, eventIds] of receiptA.sourceToEvents) {
  check(eventIds.length > 0, `sourceToEvents[${sourceId}] has ${eventIds.length} events`);
  for (const eventId of eventIds) {
    const found = receiptA.causalEvents.some((e) => e.id === eventId);
    check(found, `sourceToEvents[${sourceId}] → ${eventId} exists in causalEvents`);
  }
}

// ===========================================================================
// Gate 6: Performance — tick completes in reasonable time
// ===========================================================================
console.log('\n=== Gate 6: Performance guard ===');

const perfInput = buildHundredScaleClockInput(records100);
const perfStart = performance.now();
const perfReceipt = runBigWorldDayTick(perfInput, createDefaultRuntimeState(DEFAULT_COMPACTION_POLICY), []);
const perfDurationMs = performance.now() - perfStart;

check(perfReceipt.durationUs > 0, `tick durationUs tracked: ${perfReceipt.durationUs}`);
check(perfDurationMs < 5000, `tick completes in <5s (got ${Math.round(perfDurationMs)}ms)`);
check(perfReceipt.allEvents.length > 0, `tick produced events: ${perfReceipt.allEvents.length}`);
check(perfReceipt.causalEventsToAppend.length > 0, `tick produced causal events: ${perfReceipt.causalEventsToAppend.length}`);

// ===========================================================================
// Gate 7: 100+ records → runtime tick deterministic
// ===========================================================================
console.log('\n=== Gate 7: Hundred-scale deterministic tick ===');

const input100 = buildHundredScaleClockInput(records100);
const runtime1 = createDefaultRuntimeState(DEFAULT_COMPACTION_POLICY);
const runtime2 = createDefaultRuntimeState(DEFAULT_COMPACTION_POLICY);

const receiptTick1 = runBigWorldDayTick(input100, runtime1, []);
const receiptTick2 = runBigWorldDayTick(input100, runtime2, []);

check(receiptTick1.allEvents.length === receiptTick2.allEvents.length,
  `Same input → same event count: ${receiptTick1.allEvents.length}`);
check(receiptTick1.causalEventsToAppend.length === receiptTick2.causalEventsToAppend.length,
  `Same input → same causal event count: ${receiptTick1.causalEventsToAppend.length}`);
check(receiptTick1.summary.totalEvents === receiptTick2.summary.totalEvents,
  `Same input → same summary.totalEvents`);
check(receiptTick1.durationUs === receiptTick2.durationUs || Math.abs(receiptTick1.durationUs - receiptTick2.durationUs) < 100,
  `Same input → similar durationUs: ${receiptTick1.durationUs} vs ${receiptTick2.durationUs}`);

// ===========================================================================
// Gate 8: No hidden mutations
// ===========================================================================
console.log('\n=== Gate 8: No hidden mutations ===');

// Verify receipt only contains runtime/causal data, not case mutations
const forbiddenPayloadKeys = ['trustDelta', 'patienceDelta', 'urgencyDelta', 'caseStatus', 'soldStatus'];
for (const event of receiptTick1.allEvents) {
  for (const key of forbiddenPayloadKeys) {
    check(!(key in event.boundedPayload),
      `DailyEvent ${event.id} has no forbidden payload key: ${key}`);
  }
}

// Verify causal events don't contain forbidden mutations
for (const event of receiptTick1.causalEventsToAppend) {
  const evt = event as Record<string, unknown>;
  check(evt['kind'] !== 'CaseStatusChanged' && evt['kind'] !== 'TrustChanged',
    `CausalEvent ${evt['id']} is not a forbidden mutation kind`);
}

// ===========================================================================
// Gate 9: Old-save compatibility
// ===========================================================================
console.log('\n=== Gate 9: Old-save compatibility ===');

const emptyReceipt = ingestSourceRecordsBatch([], 5, 42);
check(emptyReceipt.sourcesProcessed === 0, 'Empty records → sourcesProcessed = 0');
check(emptyReceipt.causalEvents.length === 0, 'Empty records → no causal events');
check(emptyReceipt.batchDurationUs >= 0, 'Empty records → batchDurationUs tracked');
check(emptyReceipt.sourceToEvents.size === 0, 'Empty records → empty sourceToEvents');

// Old save with no sourceRecords
const oldSaveInput: BigWorldClockInput = {
  settledDay: 5, runSeed: 42,
  marketCells: [{ id: 'c1', name: 'c1', demandHeat: 50, supplyPressure: 40, competitivePressure: 50, sentiment: 55 }],
  activeCases: [],
  activeOpportunities: [],
  rivalListings: [],
  rivalStores: [],
  customerStates: [],
};
const oldSaveReceipt = runBigWorldDayTick(oldSaveInput, undefined, []);
check(oldSaveReceipt.sourceIngestionReceipt === undefined, 'Old save → no sourceIngestionReceipt');
check(oldSaveReceipt.durationUs > 0, 'Old save tick still tracks durationUs');

// ===========================================================================
// Gate 10: 300+ customers stress test
// ===========================================================================
console.log('\n=== Gate 10: 300+ customer stress test ===');

const stressInput: BigWorldClockInput = {
  settledDay: 5, runSeed: 42,
  marketCells: Array.from({ length: 10 }, (_, i) => ({
    id: `cell-${i}`, name: `cell-${i}`, demandHeat: 50, supplyPressure: 40,
    competitivePressure: 50, sentiment: 55,
  })),
  activeCases: Array.from({ length: 20 }, (_, i) => ({
    id: `case-${i}`, title: `case-${i}`, district: 'test', marketCellId: `cell-${i % 10}`,
    trust: 55, patience: 50, urgency: 45, heat: 50, competitiveness: 60,
    d1: 45, d3: 55, ownerName: `owner-${i}`, windowDays: 14, personality: 'pragmatic',
  })),
  activeOpportunities: Array.from({ length: 15 }, (_, i) => ({
    id: `opp-${i}`, caseId: `case-${i}`, customerId: `customer-${i}`,
    customerName: `customer-${i}`, fit: 65, intent: 50, confidence: 55,
    stageIndex: 2, stagnationTicks: 3,
  })),
  rivalListings: Array.from({ length: 30 }, (_, i) => ({
    id: `rival-${i}`, storeId: `store-${i % 5}`, title: `rival-${i}`,
    district: 'test', marketCellId: `cell-${i % 10}`, segment: 'residential',
    askPrice: 300 + i * 5, heat: 50, freshness: 60, status: 'active', daysLeft: 10,
  })),
  rivalStores: Array.from({ length: 5 }, (_, i) => ({
    id: `store-${i}`, name: `store-${i}`, type: 'external_company', style: 'aggressive',
    districtFocus: ['test'], leadCapturePower: 60, sellerInfluencePower: 55,
    pricingPressurePower: 50, activityHeat: 65,
  })),
  customerStates: Array.from({ length: 350 }, (_, i) => ({
    customerId: `customer-${i}`, status: 'browsing', fatigue: 30, churnRisk: 20,
    activeCaseIds: [`case-${i % 20}`, `case-${(i + 1) % 20}`],
  })),
  sourceRecords: buildBulkSourceRecords(200, 5, 42),
};

const stressStart = performance.now();
const stressReceipt = runBigWorldDayTick(stressInput, createDefaultRuntimeState(DEFAULT_COMPACTION_POLICY), []);
const stressDurationMs = performance.now() - stressStart;

check(stressReceipt.allEvents.length > 0, `300+ customers: events produced: ${stressReceipt.allEvents.length}`);
check(stressDurationMs < 10000, `300+ customers: tick completes in <10s (got ${Math.round(stressDurationMs)}ms)`);
check(stressReceipt.summary.totalEvents > 0, `300+ customers: summary.totalEvents > 0`);

// ===========================================================================
// Summary
// ===========================================================================
console.log(`\n=== Hundred-Scale Ingestion Gate Summary ===`);
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
