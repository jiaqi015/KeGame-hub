/**
 * Source→Causal Coverage Matrix Gate
 *
 * Verifies that all 15 SourceKinds in the coverage matrix are:
 *   1. Defined as a typed payload in informationSourceTypes.ts
 *   2. Mapped in SOURCE_TO_CAUSAL_MAP with at least one possibleCausalKind
 *   3. Consumed by sourceIngestionAdapter.ts (buildCausalEventsFromSource switch)
 *   4. Produce at least one causal event when a representative record is ingested
 *   5. Every produced causal event carries sourceRecordId/sourceReplayKey/sourceKind
 *   6. hidden/no_one sources produce 0 causal events (respect visibility)
 *   7. Future/delayed sources are skipped (respect timing)
 *   8. No source kind is "defined but not consumed" (anti-fake-big)
 *
 * This gate catches:
 *   - "I defined a type but never implemented the builder" fake coverage
 *   - "SOURCE_TO_CAUSAL_MAP has the entry but ingest doesn't produce events"
 *   - "Source kind exists in type union but switch has no case"
 *
 * Usage: npx tsx scripts/verify-selling-houses-source-causal-coverage-matrix-gate.ts
 */

import {
  ingestSourceRecords,
} from '../src/selling-houses/domain/world-model/runtime/sourceIngestionAdapter.js';

import {
  SOURCE_TO_CAUSAL_MAP,
  type SourceKind,
  type InformationSourceRecord,
} from '../src/selling-houses/domain/world-model/informationSourceTypes.js';

// ---------------------------------------------------------------------------
// Helpers
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
// All 15 SourceKinds — the canonical list
// ---------------------------------------------------------------------------

const ALL_SOURCE_KINDS: readonly SourceKind[] = [
  'market_signal',
  'rival_action',
  'customer_interaction',
  'owner_interview',
  'manager_message',
  'player_action_receipt',
  'process_receipt',
  'comparable_transaction',
  'platform_traffic',
  'acn_network_signal',
  'supporting_facility_signal',
  'broker_capacity_signal',
  'owner_life_event_signal',
  'buyer_financing_signal',
  'micro_market_signal',
];

// ---------------------------------------------------------------------------
// Representative record builder for each source kind
// ---------------------------------------------------------------------------

function buildRepresentativeRecord(kind: SourceKind, day: number, seed: number): InformationSourceRecord {
  const sourceId = `isr-cov-${seed}-${kind}-${day}`;
  const replayKey = `rk-cov-${seed}-${kind}-${day}`;
  const base = {
    sourceId,
    sourceKind: kind,
    day,
    phase: 'morning' as const,
    entityRefs: [{ id: `entity-${kind}`, kind: 'listing' as const }],
    actorRefs: [{ id: `actor-${kind}`, role: 'system' as const }],
    visibility: { scope: 'all_actors' as const, baseDelayDays: 0 },
    confidence: 0.85,
    delayDays: 0,
    replayKey,
    origin: 'ecosystem_tick' as const,
  };

  switch (kind) {
    case 'market_signal':
      return { ...base, payload: { subtype: 'heat_shift', summary: '板块热度上升', marketCellId: 'cell-1', before: 50, after: 65, unit: 'heat_index', isPublic: true } };
    case 'rival_action':
      return { ...base, payload: { subtype: 'reprice', summary: '竞品降价', rivalBrokerId: 'broker-1', rivalAcnId: 'acn-1', listingId: 'listing-1', priceBefore: 380, priceAfter: 365, marketCellId: 'cell-1', evidenceStrength: 'direct' as const } };
    case 'customer_interaction':
      return { ...base, payload: { subtype: 'comparison_made', summary: '客户比较房源', customerId: 'customer-1', listingId: 'listing-1', observationMode: 'observed' as const } };
    case 'owner_interview':
      return { ...base, payload: { subtype: 'price_discussed', summary: '业主沟通价格', ownerId: 'owner-1', caseId: 'case-1', brokerId: 'broker-1', tone: 'neutral' as const, ownerStatement: '我觉得价格合理', interactionMode: 'scheduled_call' as const } };
    case 'manager_message':
      return { ...base, payload: { subtype: 'focus_case_selected', summary: '管理层指令', managerId: 'mgr-1', targetBrokerId: 'broker-1', caseIds: ['case-1'], priority: 70, instruction: '重点跟进' } };
    case 'player_action_receipt':
      return { ...base, payload: { subtype: 'action_executed', summary: '玩家动作', actionId: 'call-owner', executorId: 'player-broker', caseId: 'case-1', costEnergy: 2, costPromotionBudget: 0, fieldDeltas: [], outcome: 'success' as const } };
    case 'process_receipt':
      return { ...base, payload: { subtype: 'open_day_completed', summary: '流程完成', processType: 'open_day' as const, processId: 'proc-1', caseIds: ['case-1'], customerIds: [], brokerIds: [], outcome: 'completed', metrics: {} } };
    case 'comparable_transaction':
      return { ...base, payload: { subtype: 'deal_closed', summary: '周边成交', marketCellId: 'cell-1', district: '和平里', layout: '2室1厅', areaSqm: 72, price: 358, askPrice: 370, discountPct: 3.2, daysOnMarket: 23, dataSource: 'platform公开' as const } };
    case 'platform_traffic':
      return { ...base, payload: { subtype: 'traffic_spike', summary: '流量飙升', listingId: 'listing-1', marketCellId: 'cell-1', viewCount: 150, favoriteCount: 10, inquiryCount: 3, timeWindow: 'last_24h', isDelta: false } };
    case 'acn_network_signal':
      return { ...base, payload: { subtype: 'cooperation_opportunity', summary: 'ACN合作信号', sourceAcnId: 'acn-1', brokerIds: ['broker-1'], cooperationScore: 75 } };
    case 'supporting_facility_signal':
      return { ...base, payload: { subtype: 'school_district_changed', summary: '学区划分变更', marketCellId: 'cell-1', facilityType: 'school' as const, before: 80, after: 60, dataSource: 'government_notice' as const } };
    case 'broker_capacity_signal':
      return { ...base, payload: { subtype: 'energy_depleted', summary: '经纪人精力耗尽', brokerId: 'broker-1', acnId: 'acn-1', energyLevel: 10, scheduleUtilization: 95, activeCaseCount: 8, affectedCaseIds: ['case-1'], pressureMagnitude: 85 } };
    case 'owner_life_event_signal':
      return { ...base, payload: { subtype: 'relocation_planned', summary: '业主计划搬迁', ownerId: 'owner-1', caseId: 'case-1', urgencyImpact: 25, priceFlexibilityImpact: 15, trustImpact: 5, timelineDays: 1, eventConfidence: 0.8 } };
    case 'buyer_financing_signal':
      return { ...base, payload: { subtype: 'loan_pre_approved', summary: '客户贷款预批', customerId: 'customer-1', caseId: 'case-1', loanAmount: 200, downPayment: 80, readinessImpact: 30 } };
    case 'micro_market_signal':
      return { ...base, payload: { subtype: 'supply_increased', summary: '微板块供给增加', microMarketCellId: 'micro-1', marketCellId: 'cell-1', supplyDelta: 5, demandDelta: -2, priceBand: '200-300万', absorptionRate: 45 } };
    default:
      return { ...base, payload: { subtype: 'heat_shift', summary: 'fallback', marketCellId: 'cell-1', before: 50, after: 60, unit: 'heat', isPublic: true } };
  }
}

function buildHiddenRecord(kind: SourceKind, day: number, seed: number): InformationSourceRecord {
  const rep = buildRepresentativeRecord(kind, day, seed);
  return { ...rep, visibility: { scope: 'no_one', baseDelayDays: 0 } };
}

function buildFutureRecord(kind: SourceKind, day: number, seed: number): InformationSourceRecord {
  const rep = buildRepresentativeRecord(kind, day, seed);
  return { ...rep, day: day + 100 };
}

// ===========================================================================
// Gate 1: SOURCE_TO_CAUSAL_MAP covers all 15 SourceKinds
// ===========================================================================
console.log('=== Gate 1: SOURCE_TO_CAUSAL_MAP coverage ===');

const mappedKinds = new Set(SOURCE_TO_CAUSAL_MAP.map((m) => m.sourceKind));
for (const kind of ALL_SOURCE_KINDS) {
  check(mappedKinds.has(kind), `${kind} is in SOURCE_TO_CAUSAL_MAP`);
  const mapping = SOURCE_TO_CAUSAL_MAP.find((m) => m.sourceKind === kind);
  if (mapping) {
    check(mapping.possibleCausalKinds.length > 0, `${kind} has possibleCausalKinds: [${mapping.possibleCausalKinds}]`);
  }
}

// ===========================================================================
// Gate 2: Ingestion produces causal events for each source kind
// ===========================================================================
console.log('\n=== Gate 2: Each source kind produces causal events ===');

const kindCausalCounts = new Map<SourceKind, number>();
for (const kind of ALL_SOURCE_KINDS) {
  const record = buildRepresentativeRecord(kind, 5, 42);
  const receipt = ingestSourceRecords([record], 5, 42);
  const causalCount = receipt.causalEvents.length;
  kindCausalCounts.set(kind, causalCount);
  check(causalCount >= 1, `${kind} produces >= 1 causal event (got ${causalCount})`);
}

// ===========================================================================
// Gate 3: Every causal event carries sourceRecordId/sourceReplayKey/sourceKind
// ===========================================================================
console.log('\n=== Gate 3: Source traceability on all causal events ===');

for (const kind of ALL_SOURCE_KINDS) {
  const record = buildRepresentativeRecord(kind, 5, 42);
  const receipt = ingestSourceRecords([record], 5, 42);
  for (const event of receipt.causalEvents) {
    const evt = event as unknown as Record<string, unknown>;
    check(
      typeof evt.sourceRecordId === 'string' && evt.sourceRecordId.length > 0,
      `${kind}: event ${event.id} has sourceRecordId`,
    );
    check(
      typeof evt.sourceReplayKey === 'string' && evt.sourceReplayKey.length > 0,
      `${kind}: event ${event.id} has sourceReplayKey`,
    );
    check(
      typeof evt.sourceKind === 'string' && evt.sourceKind === kind,
      `${kind}: event ${event.id} has sourceKind = ${kind}`,
    );
  }
}

// ===========================================================================
// Gate 4: sourceToEvents mapping is complete for all kinds
// ===========================================================================
console.log('\n=== Gate 4: sourceToEvents mapping per kind ===');

for (const kind of ALL_SOURCE_KINDS) {
  const record = buildRepresentativeRecord(kind, 5, 42);
  const receipt = ingestSourceRecords([record], 5, 42);
  const eventIds = receipt.sourceToEvents.get(record.sourceId) ?? [];
  check(eventIds.length >= 1, `${kind}: sourceToEvents[${record.sourceId}] has >= 1 event`);
  for (const eventId of eventIds) {
    const found = receipt.causalEvents.some((e) => e.id === eventId);
    check(found, `${kind}: sourceToEvents[${record.sourceId}] → ${eventId} exists in causalEvents`);
  }
}

// ===========================================================================
// Gate 5: Hidden/no_one sources produce 0 causal events
// ===========================================================================
console.log('\n=== Gate 5: Hidden sources respect visibility ===');

for (const kind of ALL_SOURCE_KINDS) {
  const hiddenRecord = buildHiddenRecord(kind, 5, 42);
  const receipt = ingestSourceRecords([hiddenRecord], 5, 42);
  check(receipt.causalEvents.length === 0, `${kind} hidden: 0 causal events`);
  check(receipt.sourcesSkipped >= 1, `${kind} hidden: sourcesSkipped >= 1`);
}

// ===========================================================================
// Gate 6: Future sources are skipped
// ===========================================================================
console.log('\n=== Gate 6: Future sources are skipped ===');

for (const kind of ALL_SOURCE_KINDS) {
  const futureRecord = buildFutureRecord(kind, 5, 42);
  const receipt = ingestSourceRecords([futureRecord], 5, 42);
  check(receipt.causalEvents.length === 0, `${kind} future: 0 causal events`);
  check(receipt.sourcesSkipped >= 1, `${kind} future: sourcesSkipped >= 1`);
}

// ===========================================================================
// Gate 7: Coverage matrix summary
// ===========================================================================
console.log('\n=== Gate 7: Coverage matrix summary ===');

console.log('SourceKind → CausalEventKinds mapping:');
for (const kind of ALL_SOURCE_KINDS) {
  const mapping = SOURCE_TO_CAUSAL_MAP.find((m) => m.sourceKind === kind);
  const causalCount = kindCausalCounts.get(kind) ?? 0;
  console.log(`  ${kind.padEnd(30)} → [${(mapping?.possibleCausalKinds ?? []).join(', ').padEnd(60)}] (${causalCount} events produced)`);
}

// Verify total coverage: all 15 kinds produce events
const totalProducing = Array.from(kindCausalCounts.values()).filter((c) => c >= 1).length;
check(totalProducing === 15, `All 15 source kinds produce events (got ${totalProducing})`);

// ===========================================================================
// Summary
// ===========================================================================
console.log(`\n=== Source→Causal Coverage Matrix Gate Summary ===`);
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
