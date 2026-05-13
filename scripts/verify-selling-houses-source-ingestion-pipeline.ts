/**
 * Source Ingestion Pipeline — verification script.
 *
 * Validates:
 * 1. ingestSourceRecords produces WorldCausalEvent[] + BigWorldDailyEvent[] from InformationSourceRecord[]
 * 2. Each SourceKind maps to the correct causal event kind
 * 3. Same seed + same records → deterministic replay
 * 4. Hidden sources (no_one) produce no player-visible events
 * 5. Source records in the future (day > current) are skipped
 * 6. worldCausalEvents count increases after ingestion
 * 7. No forbidden mutations (case.status, trust, etc.)
 * 8. Empty source records produce empty output (old save compatibility)
 * 9. BigWorldTickReceipt merges phase + ingestion events
 * 10. Source visibility affects BigWorldEventVisibility correctly
 */

import {
  ingestSourceRecords,
} from '../src/selling-houses/domain/world-model/runtime/sourceIngestionAdapter.js';

import {
  runBigWorldDayTick,
  createDefaultRuntimeState,
  DEFAULT_COMPACTION_POLICY,
} from '../src/selling-houses/domain/world-model/runtime/index.js';

import type {
  BigWorldClockInput,
} from '../src/selling-houses/domain/world-model/runtime/types.js';

import type {
  InformationSourceRecord,
} from '../src/selling-houses/domain/world-model/informationSourceTypes.js';

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
// Build deterministic test source records
// ---------------------------------------------------------------------------

function buildMarketSignalRecord(day: number, seed: number): InformationSourceRecord<'market_signal'> {
  return {
    sourceId: `isr-${seed}-ms-${day}`,
    sourceKind: 'market_signal',
    day,
    phase: 'morning',
    entityRefs: [{ id: 'cell-a', kind: 'market_cell' }],
    actorRefs: [{ id: 'system', role: 'system' }],
    visibility: { scope: 'all_actors', baseDelayDays: 0 },
    confidence: 0.85,
    delayDays: 0,
    replayKey: `rk-${seed}-ms-${day}`,
    origin: 'ecosystem_tick',
    payload: {
      subtype: 'heat_shift',
      summary: `和平里板块热度上升 (day ${day})`,
      marketCellId: 'cell-a',
      before: 50,
      after: 65,
      unit: 'heat_index',
      isPublic: true,
    },
  };
}

function buildRivalRepriceRecord(day: number, seed: number): InformationSourceRecord<'rival_action'> {
  return {
    sourceId: `isr-${seed}-ra-${day}`,
    sourceKind: 'rival_action',
    day,
    phase: 'afternoon',
    entityRefs: [
      { id: 'rival-listing-1', kind: 'listing' },
      { id: 'nb-acn-0', kind: 'broker' },
    ],
    actorRefs: [{ id: 'nb-acn-0', role: 'rival_broker', acnId: 'acn-aggressive' }],
    visibility: { scope: 'all_actors', baseDelayDays: 0 },
    confidence: 0.9,
    delayDays: 0,
    replayKey: `rk-${seed}-ra-${day}`,
    origin: 'ecosystem_tick',
    payload: {
      subtype: 'reprice',
      summary: `竞品降价 (day ${day})`,
      rivalBrokerId: 'nb-acn-0',
      rivalAcnId: 'acn-aggressive',
      listingId: 'rival-listing-1',
      marketCellId: 'cell-a',
      priceBefore: 380,
      priceAfter: 365,
      evidenceStrength: 'direct',
    },
  };
}

function buildOwnerInterviewRecord(day: number, seed: number): InformationSourceRecord<'owner_interview'> {
  return {
    sourceId: `isr-${seed}-oi-${day}`,
    sourceKind: 'owner_interview',
    day,
    phase: 'evening',
    entityRefs: [
      { id: 'case-1', kind: 'case' },
      { id: 'owner-1', kind: 'owner' },
    ],
    actorRefs: [
      { id: 'player-broker', role: 'player_broker', acnId: 'acn-cooperative' },
      { id: 'owner-1', role: 'owner' },
    ],
    visibility: { scope: 'specific_actors', actorIds: ['player-broker', 'owner-1'], baseDelayDays: 0 },
    confidence: 0.95,
    delayDays: 0,
    replayKey: `rk-${seed}-oi-${day}`,
    origin: 'player_action',
    payload: {
      subtype: 'price_discussed',
      summary: `业主沟通 (day ${day})`,
      ownerId: 'owner-1',
      caseId: 'case-1',
      brokerId: 'player-broker',
      trustLevel: 65,
      priceMentioned: 420,
      tone: 'neutral',
      ownerStatement: '我觉得420万合理',
      interactionMode: 'scheduled_call',
    },
  };
}

function buildHiddenRecord(day: number, seed: number): InformationSourceRecord<'acn_network_signal'> {
  return {
    sourceId: `isr-${seed}-an-${day}`,
    sourceKind: 'acn_network_signal',
    day,
    phase: 'morning',
    entityRefs: [],
    actorRefs: [],
    visibility: { scope: 'no_one', baseDelayDays: 0 },
    confidence: 0.5,
    delayDays: 0,
    replayKey: `rk-${seed}-an-${day}`,
    origin: 'ecosystem_tick',
    payload: {
      subtype: 'cooperation_opportunity',
      summary: 'ACN内部信号',
      sourceAcnId: 'acn-cooperative',
      brokerIds: ['shadow-broker-1'],
      cooperationScore: 75,
    },
  };
}

function buildFutureRecord(day: number, seed: number): InformationSourceRecord<'market_signal'> {
  return {
    sourceId: `isr-${seed}-future-${day}`,
    sourceKind: 'market_signal',
    day: day + 10, // Future record
    phase: 'morning',
    entityRefs: [{ id: 'cell-a', kind: 'market_cell' }],
    actorRefs: [{ id: 'system', role: 'system' }],
    visibility: { scope: 'all_actors', baseDelayDays: 0 },
    confidence: 0.8,
    delayDays: 0,
    replayKey: `rk-${seed}-future-${day}`,
    origin: 'ecosystem_tick',
    payload: {
      subtype: 'heat_shift',
      summary: '未来信号',
      marketCellId: 'cell-a',
      before: 50,
      after: 70,
      unit: 'heat_index',
      isPublic: true,
    },
  };
}

function buildTestClockInput(day: number, seed: number, sourceRecords: readonly InformationSourceRecord[] = []): BigWorldClockInput {
  return {
    settledDay: day,
    runSeed: seed,
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
    activeOpportunities: [],
    rivalListings: [],
    rivalStores: [],
    customerStates: [],
    sourceRecords,
  };
}

// ---------------------------------------------------------------------------
// Test 1: Empty source records produce empty output (old save compatibility)
// ---------------------------------------------------------------------------

console.log('=== Test 1: Empty source records (old save compatibility) ===');
const emptyResult = ingestSourceRecords([], 5, 42);
assertEqual(emptyResult.sourcesProcessed, 0, 'sourcesProcessed');
assertEqual(emptyResult.sourcesWithEffect, 0, 'sourcesWithEffect');
assertEqual(emptyResult.causalEvents.length, 0, 'causalEvents empty');
assertEqual(emptyResult.dailyEvents.length, 0, 'dailyEvents empty');
check(emptyResult.replayKey.length > 0, 'replayKey is non-empty');

// ---------------------------------------------------------------------------
// Test 2: Market signal → MarketHeatShifted
// ---------------------------------------------------------------------------

console.log('\n=== Test 2: Market signal → MarketHeatShifted ===');
const msRecord = buildMarketSignalRecord(5, 42);
const msResult = ingestSourceRecords([msRecord], 5, 42);
assertEqual(msResult.sourcesWithEffect, 1, 'sourcesWithEffect');
assertEqual(msResult.causalEvents.length, 1, 'causalEvents count');
check(msResult.causalEvents[0].kind === 'MarketHeatShifted', `causal kind: ${msResult.causalEvents[0].kind}`);
check(msResult.causalEvents[0].day === 5, `causal day: ${msResult.causalEvents[0].day}`);
check(msResult.dailyEvents[0].visibilityHint === 'signal', `visibility: ${msResult.dailyEvents[0].visibilityHint}`);

// ---------------------------------------------------------------------------
// Test 3: Rival reprice → RivalListingRepriced
// ---------------------------------------------------------------------------

console.log('\n=== Test 3: Rival reprice → RivalListingRepriced ===');
const raRecord = buildRivalRepriceRecord(5, 42);
const raResult = ingestSourceRecords([raRecord], 5, 42);
assertEqual(raResult.sourcesWithEffect, 1, 'sourcesWithEffect');
assertEqual(raResult.causalEvents.length, 1, 'causalEvents count');
check(raResult.causalEvents[0].kind === 'RivalListingRepriced', `causal kind: ${raResult.causalEvents[0].kind}`);

// ---------------------------------------------------------------------------
// Test 4: Owner interview → OwnerMarketPressurePerceived
// ---------------------------------------------------------------------------

console.log('\n=== Test 4: Owner interview → OwnerMarketPressurePerceived ===');
const oiRecord = buildOwnerInterviewRecord(5, 42);
const oiResult = ingestSourceRecords([oiRecord], 5, 42);
assertEqual(oiResult.sourcesWithEffect, 1, 'sourcesWithEffect');
assertEqual(oiResult.causalEvents.length, 1, 'causalEvents count');
check(oiResult.causalEvents[0].kind === 'OwnerMarketPressurePerceived', `causal kind: ${oiResult.causalEvents[0].kind}`);

// ---------------------------------------------------------------------------
// Test 5: Hidden sources produce no events
// ---------------------------------------------------------------------------

console.log('\n=== Test 5: Hidden sources (no_one) skipped ===');
const hiddenRecord = buildHiddenRecord(5, 42);
const hiddenResult = ingestSourceRecords([hiddenRecord], 5, 42);
assertEqual(hiddenResult.sourcesSkipped, 1, 'sourcesSkipped');
assertEqual(hiddenResult.causalEvents.length, 0, 'no causal events');
assertEqual(hiddenResult.dailyEvents.length, 0, 'no daily events');

// ---------------------------------------------------------------------------
// Test 6: Future records are skipped
// ---------------------------------------------------------------------------

console.log('\n=== Test 6: Future records skipped ===');
const futureRecord = buildFutureRecord(5, 42);
const futureResult = ingestSourceRecords([futureRecord], 5, 42);
assertEqual(futureResult.sourcesSkipped, 1, 'sourcesSkipped');
assertEqual(futureResult.causalEvents.length, 0, 'no causal events');

// ---------------------------------------------------------------------------
// Test 7: Deterministic replay
// ---------------------------------------------------------------------------

console.log('\n=== Test 7: Deterministic replay ===');
const records7 = [
  buildMarketSignalRecord(3, 99),
  buildRivalRepriceRecord(3, 99),
  buildOwnerInterviewRecord(3, 99),
];
const result7a = ingestSourceRecords(records7, 3, 99);
const result7b = ingestSourceRecords(records7, 3, 99);
assertEqual(result7a.causalEvents.length, result7b.causalEvents.length, 'same causal event count');
assertEqual(result7a.replayKey, result7b.replayKey, 'same replayKey');
assertEqual(
  result7a.causalEvents.map((e) => e.id).join(','),
  result7b.causalEvents.map((e) => e.id).join(','),
  'same causal event IDs',
);

// ---------------------------------------------------------------------------
// Test 8: Multiple source kinds in one batch
// ---------------------------------------------------------------------------

console.log('\n=== Test 8: Multiple source kinds in batch ===');
const mixedRecords = [
  buildMarketSignalRecord(5, 42),
  buildRivalRepriceRecord(5, 42),
  buildOwnerInterviewRecord(5, 42),
];
const mixedResult = ingestSourceRecords(mixedRecords, 5, 42);
assertEqual(mixedResult.sourcesProcessed, 3, 'sourcesProcessed');
assertEqual(mixedResult.sourcesWithEffect, 3, 'sourcesWithEffect');
check(mixedResult.causalEvents.length >= 3, `causalEvents: ${mixedResult.causalEvents.length} (>= 3)`);

// Check per-kind stats
const msStats = mixedResult.byKind.get('market_signal');
check(Boolean(msStats), 'market_signal stats exist');
check(msStats?.count === 1, 'market_signal count: 1');

const raStats = mixedResult.byKind.get('rival_action');
check(Boolean(raStats), 'rival_action stats exist');
check(raStats?.count === 1, 'rival_action count: 1');

// ---------------------------------------------------------------------------
// Test 9: worldCausalEvents grows after ingestion through BigWorldClock
// ---------------------------------------------------------------------------

console.log('\n=== Test 9: BigWorldClock merges source ingestion ===');
const clockInput = buildTestClockInput(5, 42, [
  buildMarketSignalRecord(5, 42),
  buildRivalRepriceRecord(5, 42),
]);
const receipt = runBigWorldDayTick(clockInput, createDefaultRuntimeState(DEFAULT_COMPACTION_POLICY), []);

check(receipt.sourceIngestionReceipt !== undefined, 'sourceIngestionReceipt exists');
check(
  (receipt.sourceIngestionReceipt?.sourcesWithEffect ?? 0) >= 2,
  `sourcesWithEffect: ${receipt.sourceIngestionReceipt?.sourcesWithEffect}`,
);
check(
  receipt.causalEventsToAppend.length > 0,
  `causalEventsToAppend: ${receipt.causalEventsToAppend.length}`,
);

// Phase events should also be present
check(receipt.allEvents.length > 0, `total allEvents: ${receipt.allEvents.length}`);

// ---------------------------------------------------------------------------
// Test 10: Causal events carry sourceId + replayKey in bounded payload
// ---------------------------------------------------------------------------

console.log('\n=== Test 10: Source traceability in daily events ===');
const traceRecords = [buildMarketSignalRecord(5, 42)];
const traceResult = ingestSourceRecords(traceRecords, 5, 42);
check(traceResult.dailyEvents.length > 0, 'daily events exist');
const traceEvent = traceResult.dailyEvents[0];
check('sourceId' in traceEvent.boundedPayload, 'boundedPayload has sourceId');
check('replayKey' in traceEvent.boundedPayload, 'boundedPayload has replayKey');
check('sourceKind' in traceEvent.boundedPayload, 'boundedPayload has sourceKind');

// ---------------------------------------------------------------------------
// Test 11: Source visibility affects event visibility hint
// ---------------------------------------------------------------------------

console.log('\n=== Test 11: Visibility mapping ===');
const allActorsRecord = buildMarketSignalRecord(5, 42);
const allActorsResult = ingestSourceRecords([allActorsRecord], 5, 42);
check(
  allActorsResult.dailyEvents[0].visibilityHint === 'signal',
  `all_actors → signal: ${allActorsResult.dailyEvents[0].visibilityHint}`,
);

const playerOnlyRecord: InformationSourceRecord<'player_action_receipt'> = {
  sourceId: 'isr-42-par-5',
  sourceKind: 'player_action_receipt',
  day: 5,
  phase: 'afternoon',
  entityRefs: [{ id: 'case-1', kind: 'case' }],
  actorRefs: [{ id: 'player-broker', role: 'player_broker' }],
  visibility: { scope: 'player_only', baseDelayDays: 0 },
  confidence: 1.0,
  delayDays: 0,
  replayKey: 'rk-42-par-5',
  origin: 'player_action',
  payload: {
    subtype: 'action_executed',
    summary: '玩家执行动作',
    actionId: 'call-owner',
    executorId: 'player-broker',
    caseId: 'case-1',
    costEnergy: 2,
    costPromotionBudget: 0,
    fieldDeltas: [],
    outcome: 'success',
  },
};
const playerOnlyResult = ingestSourceRecords([playerOnlyRecord], 5, 42);
check(
  playerOnlyResult.dailyEvents[0].visibilityHint === 'actionable',
  `player_only → actionable: ${playerOnlyResult.dailyEvents[0].visibilityHint}`,
);

// ---------------------------------------------------------------------------
// Test 12: No forbidden mutations in generated events
// ---------------------------------------------------------------------------

console.log('\n=== Test 12: No forbidden mutations ===');
const forbiddenKinds = ['case_sold', 'case_withdrawn', 'deal_closed', 'owner_trust_changed', 'customer_committed'];
const allRecords = [
  buildMarketSignalRecord(5, 42),
  buildRivalRepriceRecord(5, 42),
  buildOwnerInterviewRecord(5, 42),
];
const allResult = ingestSourceRecords(allRecords, 5, 42);
let forbiddenCount = 0;
for (const event of allResult.causalEvents) {
  if (forbiddenKinds.includes(event.kind)) {
    forbiddenCount += 1;
  }
}
check(forbiddenCount === 0, `forbidden causal event kinds: ${forbiddenCount}`);

const forbiddenPayloadKeys = ['soldStatus', 'closedDealId', 'trustValue', 'patienceValue', 'finalCommitment'];
for (const event of allResult.dailyEvents) {
  for (const key of forbiddenPayloadKeys) {
    if (key in event.boundedPayload) {
      forbiddenCount += 1;
    }
  }
}
check(forbiddenCount === 0, `forbidden payload keys: ${forbiddenCount}`);

// ---------------------------------------------------------------------------
// Test 13: Day mismatch (source day != current day) still processes
// ---------------------------------------------------------------------------

console.log('\n=== Test 13: Source day < current day still processes ===');
const oldRecord = buildMarketSignalRecord(3, 42); // Source occurred on day 3
const day5Result = ingestSourceRecords([oldRecord], 5, 42); // Current day is 5
check(day5Result.causalEvents.length === 1, 'Old source record still produces event');
check(day5Result.causalEvents[0].day === 3, `Event keeps original day: ${day5Result.causalEvents[0].day}`);

// ---------------------------------------------------------------------------
// Test 14: SourceIngestionPhase shows in BigWorldTickReceipt phaseResults
// ---------------------------------------------------------------------------

console.log('\n=== Test 14: SourceIngestionPhase in phase results ===');
const phaseReceipt = runBigWorldDayTick(
  buildTestClockInput(5, 42, [buildMarketSignalRecord(5, 42)]),
  createDefaultRuntimeState(DEFAULT_COMPACTION_POLICY),
  [],
);
const sourcePhase = phaseReceipt.phaseResults.find((r) => r.phaseId === 'SourceIngestionPhase');
check(sourcePhase !== undefined, 'SourceIngestionPhase present in phaseResults');
check(sourcePhase?.entitiesProcessed === 1, `entitiesProcessed: ${sourcePhase?.entitiesProcessed}`);

// ---------------------------------------------------------------------------
// Test 15: Every causal event from source ingestion carries sourceRecordId
// ---------------------------------------------------------------------------

console.log('\n=== Test 15: Causal events carry sourceRecordId ===');
const traceRecords15 = [
  buildMarketSignalRecord(5, 42),
  buildRivalRepriceRecord(5, 42),
  buildOwnerInterviewRecord(5, 42),
];
const traceResult15 = ingestSourceRecords(traceRecords15, 5, 42);
let allHaveSourceId = true;
let allHaveReplayKey = true;
let allHaveSourceKind = true;
for (const event of traceResult15.causalEvents) {
  const evt = event as unknown as Record<string, unknown>;
  if (!evt.sourceRecordId || evt.sourceRecordId === '') allHaveSourceId = false;
  if (!evt.sourceReplayKey || evt.sourceReplayKey === '') allHaveReplayKey = false;
  if (!evt.sourceKind || evt.sourceKind === '') allHaveSourceKind = false;
}
check(allHaveSourceId, 'all causal events have non-empty sourceRecordId');
check(allHaveReplayKey, 'all causal events have non-empty sourceReplayKey');
check(allHaveSourceKind, 'all causal events have non-empty sourceKind');

// Verify specific values
const msCausalEvent = traceResult15.causalEvents.find((e) => e.kind === 'MarketHeatShifted');
if (msCausalEvent) {
  const evt = msCausalEvent as unknown as Record<string, unknown>;
  assertEqual(evt.sourceRecordId, 'isr-42-ms-5', 'MarketHeatShifted sourceRecordId matches source');
  assertEqual(evt.sourceKind, 'market_signal', 'MarketHeatShifted sourceKind matches');
}

// ---------------------------------------------------------------------------
// Test 16: sourceToEvents mapping exists and is correct
// ---------------------------------------------------------------------------

console.log('\n=== Test 16: sourceToEvents mapping ===');
check(traceResult15.sourceToEvents !== undefined, 'sourceToEvents exists');
check(traceResult15.sourceToEvents.size === 3, `sourceToEvents has 3 entries (got ${traceResult15.sourceToEvents.size})`);

const msEventIds = traceResult15.sourceToEvents.get('isr-42-ms-5');
check(Boolean(msEventIds), 'sourceToEvents has entry for isr-42-ms-5');
check(msEventIds?.length === 1, `isr-42-ms-5 produced 1 event (got ${msEventIds?.length})`);

const raEventIds = traceResult15.sourceToEvents.get('isr-42-ra-5');
check(Boolean(raEventIds), 'sourceToEvents has entry for isr-42-ra-5');
check(raEventIds?.length === 1, `isr-42-ra-5 produced 1 event (got ${raEventIds?.length})`);

// Verify event IDs in sourceToEvents match actual causal event IDs
for (const [sourceId, eventIds] of traceResult15.sourceToEvents) {
  for (const eventId of eventIds) {
    const found = traceResult15.causalEvents.some((e) => e.id === eventId);
    check(found, `sourceToEvents[${sourceId}] → ${eventId} exists in causalEvents`);
  }
}

// ---------------------------------------------------------------------------
// Test 17: worldCausalEvents can be traced back to source records
// ---------------------------------------------------------------------------

console.log('\n=== Test 17: Causal events traceable to source records ===');
// Build a clock receipt and verify causal events in worldCausalEvents carry source links
const clockReceipt = runBigWorldDayTick(
  buildTestClockInput(5, 42, [
    buildMarketSignalRecord(5, 42),
    buildRivalRepriceRecord(5, 42),
  ]),
  createDefaultRuntimeState(DEFAULT_COMPACTION_POLICY),
  [],
);

// Filter to only source-ingested causal events (those with non-empty sourceRecordId)
const sourceDerivedEvents = clockReceipt.causalEventsToAppend.filter((e) => {
  const evt = e as unknown as Record<string, unknown>;
  return evt.sourceRecordId && evt.sourceRecordId !== '';
});

check(sourceDerivedEvents.length >= 2, `source-derived causal events: ${sourceDerivedEvents.length} (>= 2)`);

for (const event of sourceDerivedEvents) {
  const evt = event as unknown as Record<string, unknown>;
  check(
    typeof evt.sourceRecordId === 'string' && evt.sourceRecordId.length > 0,
    `event ${event.id} has sourceRecordId: ${evt.sourceRecordId}`,
  );
  check(
    typeof evt.sourceReplayKey === 'string' && evt.sourceReplayKey.length > 0,
    `event ${event.id} has sourceReplayKey`,
  );
  check(
    typeof evt.sourceKind === 'string' && evt.sourceKind.length > 0,
    `event ${event.id} has sourceKind: ${evt.sourceKind}`,
  );
}

// ---------------------------------------------------------------------------
// Test 18: Same source records + same seed → same source links
// ---------------------------------------------------------------------------

console.log('\n=== Test 18: Deterministic source links ===');
const detRecords = [buildMarketSignalRecord(3, 99), buildRivalRepriceRecord(3, 99)];
const detResultA = ingestSourceRecords(detRecords, 3, 99);
const detResultB = ingestSourceRecords(detRecords, 3, 99);

// Same sourceToEvents mapping
check(detResultA.sourceToEvents.size === detResultB.sourceToEvents.size, 'same sourceToEvents size');
for (const [sourceId, eventIds] of detResultA.sourceToEvents) {
  const otherIds = detResultB.sourceToEvents.get(sourceId);
  check(
    Boolean(otherIds) && JSON.stringify([...eventIds]) === JSON.stringify([...otherIds!]),
    `sourceToEvents[${sourceId}] identical`,
  );
}

// Same causal event source links
for (let i = 0; i < detResultA.causalEvents.length; i += 1) {
  const evtA = detResultA.causalEvents[i] as unknown as Record<string, unknown>;
  const evtB = detResultB.causalEvents[i] as unknown as Record<string, unknown>;
  assertEqual(evtA.sourceRecordId, evtB.sourceRecordId, `event ${i} sourceRecordId identical`);
  assertEqual(evtA.sourceReplayKey, evtB.sourceReplayKey, `event ${i} sourceReplayKey identical`);
  assertEqual(evtA.sourceKind, evtB.sourceKind, `event ${i} sourceKind identical`);
}

// ---------------------------------------------------------------------------
// Test 19: Hidden source → no causal events → no source links
// ---------------------------------------------------------------------------

console.log('\n=== Test 19: Hidden source has no source links ===');
const hiddenRecord19 = buildHiddenRecord(5, 42);
const hiddenResult19 = ingestSourceRecords([hiddenRecord19], 5, 42);
check(hiddenResult19.causalEvents.length === 0, 'hidden source produces 0 causal events');
check(hiddenResult19.sourceToEvents.size === 0, 'hidden source produces 0 sourceToEvents entries');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Source Ingestion Pipeline Verification Summary ===`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  console.error(`\nVERIFICATION FAILED: ${failed} checks did not pass.`);
  process.exit(1);
} else {
  console.log(`\nVERIFICATION PASSED: All ${passed} checks passed.`);
  console.log('\n接线点:');
  console.log('  - ingestSourceRecords(records, day, seed) → SourceIngestionReceipt');
  console.log('  - BigWorldClockInput.sourceRecords → optional, backward-compatible');
  console.log('  - BigWorldTickReceipt.sourceIngestionReceipt → merged with phase events');
  console.log('  - sourceIngestionReceipt.causalEvents → append to worldCausalEvents');
  console.log('  - sourceIngestionReceipt.dailyEvents → append to bigWorldRuntime.dailyEvents');
  console.log('\nreplay 证明:');
  console.log('  - Same records + same day + same seed → same replayKey');
  console.log('  - Same records + same day + same seed → same causal event IDs');
  console.log('  - Hidden sources → 0 events (visibility respected)');
  console.log('  - Future sources → skipped (delay respected)');
  console.log('  - Empty sources → empty output (old save safe)');
}
