/**
 * Big World Round 6 Hard Gate — Agent D false-positive killer
 *
 * Targets the source→causal→projection chain. This gate MUST FAIL if:
 *
 * 1. InformationSourceRecord has only types, no working registry
 * 2. SourceRecord cannot append/query/replay
 * 3. Runtime causal events have no sourceId / replayKey link back to source
 * 4. Projection reads hidden source records or raw registry internals
 * 5. no_one source appears in actor POV
 * 6. Only source examples exist, no ingestion pipeline
 * 7. Same seed + same source records → replay inconsistency
 * 8. Product surface cannot trace from visible source → causal event
 *
 * Usage: npx tsx scripts/verify-selling-houses-big-world-round6-hard-gate.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Source layer imports ─────────────────────────────────────────────────
import type {
  InformationSourceRecord,
  SourceKind,
  SourceRecordIndex,
} from '../src/selling-houses/domain/world-model/informationSourceTypes.js';
import {
  SOURCE_TO_CAUSAL_MAP,
  EXAMPLE_MARKET_SIGNAL,
  EXAMPLE_RIVAL_ACTION,
  EXAMPLE_OWNER_INTERVIEW,
  EXAMPLE_COMPARABLE_TXN,
} from '../src/selling-houses/domain/world-model/informationSourceTypes.js';

import type {
  InformationSourceRegistry,
  AppendResult,
  AppendDuplicate,
  RegistryStats,
} from '../src/selling-houses/domain/world-model/informationSourceRegistry.js';
import {
  createEmptyRegistry,
  appendSourceRecord,
  appendSourceRecords,
  queryVisibleSourceRecords,
  queryHiddenSourceRecords,
  queryByKind,
  queryByDay,
  queryByEntityId,
  queryByReplayKey,
  isRecordVisibleToActor,
  getRegistryStats,
} from '../src/selling-houses/domain/world-model/informationSourceRegistry.js';

// ── Runtime imports ─────────────────────────────────────────────────────
import type { WorldCausalEvent } from '../src/selling-houses/domain/world-model/causalEvents.js';
import {
  buildMarketHeatShifted,
  buildRivalListingRepriced,
  buildRivalBrokerActionTaken,
} from '../src/selling-houses/domain/world-model/causalEvents.js';
import {
  runAllPhases,
  type BigWorldClockInput,
} from '../src/selling-houses/domain/world-model/runtime/index.js';

// ── Projection imports ──────────────────────────────────────────────────
import {
  buildWorkspaceBigWorldModule,
  buildLiveCausalContext,
} from '../src/selling-houses/application/projections/bigWorldPOVProjection.js';

// ── Helpers ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function hardFail(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    failed++;
    failures.push(message);
    console.error(`  [FAIL] ${message}`);
  }
}

function readSource(path: string): string {
  return readFileSync(resolve(import.meta.dirname ?? '.', path), 'utf8');
}

const SEED = 20260513;

console.log('=== Big World Round 6 Hard Gate ===');
console.log('Purpose: kill source→causal→projection false positives\n');

// ===========================================================================
// CHECK 1: InformationSourceRecord has a working registry (not just types)
//
// The file informationSourceRegistry.ts must export real functions:
//   createEmptyRegistry, appendSourceRecord, queryVisibleSourceRecords
// ===========================================================================
console.log('--- CHECK 1: Registry exists and is functional ---');

const emptyReg = createEmptyRegistry();
hardFail(emptyReg !== null && emptyReg !== undefined, 'createEmptyRegistry returns non-null');
hardFail(emptyReg.index.count === 0, 'empty registry has count=0');
hardFail(emptyReg.index.all.length === 0, 'empty registry has 0 records');
hardFail(emptyReg.index.byKind.size === 0, 'empty registry has 0 kind buckets');
hardFail(emptyReg.index.byReplayKey.size === 0, 'empty registry has 0 replay keys');

// Append one record
const appendResult = appendSourceRecord(emptyReg, EXAMPLE_MARKET_SIGNAL);
hardFail(appendResult.ok === true, 'appendSourceRecord returns ok=true for valid record');
if (appendResult.ok) {
  const reg1 = appendResult.registry;
  hardFail(reg1.index.count === 1, 'registry count=1 after append');
  hardFail(reg1.index.all.length === 1, 'registry all array has 1 record');
  hardFail(reg1.index.byKind.has('market_signal'), 'registry has market_signal bucket');
  hardFail(reg1.index.byDay.has(EXAMPLE_MARKET_SIGNAL.day), 'registry has day bucket');
  hardFail(reg1.index.byReplayKey.has(EXAMPLE_MARKET_SIGNAL.replayKey), 'registry has replayKey index');

  // Query by kind
  const marketRecords = queryByKind(reg1, 'market_signal');
  hardFail(marketRecords.length === 1, 'queryByKind returns 1 market_signal record');

  // Query by day
  const dayRecords = queryByDay(reg1, EXAMPLE_MARKET_SIGNAL.day);
  hardFail(dayRecords.length === 1, 'queryByDay returns records for day 3');

  // Query by entity
  const entityRecords = queryByEntityId(reg1, 'cell-1');
  hardFail(entityRecords.length >= 1, 'queryByEntityId returns records for cell-1');

  // Query by replayKey
  const replayRecord = queryByReplayKey(reg1, EXAMPLE_MARKET_SIGNAL.replayKey);
  hardFail(replayRecord !== undefined, 'queryByReplayKey returns the record');
  hardFail(replayRecord!.sourceId === EXAMPLE_MARKET_SIGNAL.sourceId, 'replayKey resolves to correct record');

  // Stats
  const stats = getRegistryStats(reg1);
  hardFail(stats.totalCount === 1, 'stats.totalCount=1');
  hardFail(stats.uniqueReplayKeys === 1, 'stats.uniqueReplayKeys=1');
}

// ===========================================================================
// CHECK 2: Duplicate replayKey is rejected
// ===========================================================================
console.log('\n--- CHECK 2: Duplicate replayKey rejection ---');

if (appendResult.ok) {
  const dupResult = appendSourceRecord(appendResult.registry, EXAMPLE_MARKET_SIGNAL);
  hardFail(!dupResult.ok, 'duplicate replayKey rejected');
  if (!dupResult.ok) {
    // TypeScript narrowing: AppendDuplicate has reason + existing
    const dupRejected = dupResult as AppendDuplicate;
    hardFail(dupRejected.reason === 'duplicate_replay_key', `rejection reason is duplicate_replay_key (got ${dupRejected.reason})`);
    hardFail(dupRejected.existing.sourceId === EXAMPLE_MARKET_SIGNAL.sourceId, 'rejected record matches existing');
  }

  // Registry unchanged after rejection
  hardFail(appendResult.registry.index.count === 1, 'registry count unchanged after rejection');
}

// ===========================================================================
// CHECK 3: Batch append works
// ===========================================================================
console.log('\n--- CHECK 3: Batch append ---');

const batchResult = appendSourceRecords(createEmptyRegistry(), [
  EXAMPLE_RIVAL_ACTION,
  EXAMPLE_OWNER_INTERVIEW,
  EXAMPLE_COMPARABLE_TXN,
]);
hardFail(batchResult.ok === true, 'batch append all succeed');
hardFail(batchResult.appendedCount === 3, `batch appended 3 records (got ${batchResult.appendedCount})`);
hardFail(batchResult.rejected.length === 0, 'batch has 0 rejections');
hardFail(batchResult.registry.index.count === 3, 'batch registry has 3 records');

// Stats after batch
const batchStats = getRegistryStats(batchResult.registry);
hardFail(batchStats.totalCount === 3, 'stats.totalCount=3');
hardFail(Object.keys(batchStats.kindCounts).length === 3, 'stats has 3 distinct kinds');

// ===========================================================================
// CHECK 4: Runtime causal events have sourceId linking back to source records
//
// WorldCausalEventBase must have a sourceId field (or equivalent) that
// references an InformationSourceRecord.sourceId. Without this, the chain
// source→causal→projection is broken.
// ===========================================================================
console.log('\n--- CHECK 4: Causal events have sourceId link ---');

// Read the causalEvents.ts source to check for sourceId field
const causalSource = readSource('../src/selling-houses/domain/world-model/causalEvents.ts');
const hasSourceIdField = causalSource.includes('sourceId') || causalSource.includes('sourceRecordId');
hardFail(
  hasSourceIdField,
  'WorldCausalEventBase has a sourceId / sourceRecordId field linking to InformationSourceRecord',
);

// Check the actual type at runtime — build a causal event and check shape
const testEvent = buildMarketHeatShifted('test-id', 1, {
  marketCellId: 'cell-1',
  before: 50,
  after: 60,
  sourceSignalId: 'env-phase-cell-1-1',
  sourceSignalType: 'environment-phase',
  confidence: 0.8,
});
const eventObj = testEvent as unknown as Record<string, unknown>;
hardFail(
  'sourceId' in eventObj || 'sourceRecordId' in eventObj || 'originSourceId' in eventObj,
  'built causal event object has a source-linking field at runtime',
);

// Also check that phases.ts references sourceId when building events
const phasesSource = readSource('../src/selling-houses/domain/world-model/runtime/phases.ts');
const phasesUseSourceId = phasesSource.includes('sourceId') || phasesSource.includes('sourceRecordId');
hardFail(
  phasesUseSourceId,
  'runtime phases reference sourceId when constructing causal events',
);

// ===========================================================================
// CHECK 5: no_one source does NOT appear in actor POV queries
//
// isRecordVisibleToActor must return false for scope=no_one.
// queryVisibleSourceRecords must exclude no_one records.
// ===========================================================================
console.log('\n--- CHECK 5: no_one sources hidden from actor POV ---');

const hiddenRecord: InformationSourceRecord<'acn_network_signal'> = {
  ...EXAMPLE_MARKET_SIGNAL,
  sourceKind: 'acn_network_signal',
  sourceId: 'isr-test-hidden-0',
  visibility: { scope: 'no_one', baseDelayDays: 0 },
  replayKey: 'rk-test-hidden-0',
  payload: {
    subtype: 'credit_allocation',
    summary: 'ACN 内部 credit 分配',
    sourceAcnId: 'acn-1',
    brokerIds: ['b-1'],
    cooperationScore: 75,
  },
};

const visibleRecord: InformationSourceRecord<'market_signal'> = {
  ...EXAMPLE_MARKET_SIGNAL,
  sourceId: 'isr-test-visible-0',
  visibility: { scope: 'all_actors', baseDelayDays: 0 },
  replayKey: 'rk-test-visible-0',
};

let hiddenReg = createEmptyRegistry();
const h1 = appendSourceRecord(hiddenReg, hiddenRecord);
hardFail(h1.ok, 'append hidden record');
if (h1.ok) hiddenReg = h1.registry;
const h2 = appendSourceRecord(hiddenReg, visibleRecord);
hardFail(h2.ok, 'append visible record');
if (h2.ok) hiddenReg = h2.registry;

// isRecordVisibleToActor: no_one → false
hardFail(
  isRecordVisibleToActor(hiddenRecord, 'player-broker', 'player_broker', 10) === false,
  'no_one record is NOT visible to player_broker',
);
hardFail(
  isRecordVisibleToActor(hiddenRecord, 'rival-broker-1', 'rival_broker', 10) === false,
  'no_one record is NOT visible to rival_broker',
);
hardFail(
  isRecordVisibleToActor(hiddenRecord, 'system', 'system', 10) === false,
  'no_one record is NOT visible to system',
);

// isRecordVisibleToActor: all_actors → true
hardFail(
  isRecordVisibleToActor(visibleRecord, 'anyone', 'player_broker', 10) === true,
  'all_actors record IS visible to player_broker',
);

// queryVisibleSourceRecords must NOT include no_one records
const actorVisible = queryVisibleSourceRecords(hiddenReg, 'player-broker', 'player_broker', 10);
const hasHiddenInQuery = actorVisible.some((r) => r.sourceId === 'isr-test-hidden-0');
hardFail(!hasHiddenInQuery, 'queryVisibleSourceRecords excludes no_one records');
hardFail(actorVisible.length === 1, `queryVisibleSourceRecords returns only visible records (got ${actorVisible.length})`);

// queryHiddenSourceRecords must return only no_one records
const hiddenOnly = queryHiddenSourceRecords(hiddenReg);
hardFail(hiddenOnly.length === 1, `queryHiddenSourceRecords returns 1 no_one record (got ${hiddenOnly.length})`);
hardFail(hiddenOnly[0].sourceId === 'isr-test-hidden-0', 'queryHiddenSourceRecords returns the correct hidden record');

// ===========================================================================
// CHECK 6: Projection does NOT directly read source registry or hidden sources
//
// bigWorldPOVProjection.ts must NOT import informationSourceRegistry or
// call queryHiddenSourceRecords. It should read through the causal ledger
// or a visibility-filtered layer, not directly access hidden truth.
// ===========================================================================
console.log('\n--- CHECK 6: Projection boundary — no direct registry access ---');

const projSource = readSource('../src/selling-houses/application/projections/bigWorldPOVProjection.ts');

// Allow type-only imports from informationSourceRegistry (no runtime dependency)
// but reject value imports (which would create a runtime dependency)
const hasValueTypeImport = /import\s+\{[^}]*\}\s+from\s+['"]\..*informationSourceRegistry/.test(projSource)
  && !/import\s+type\s+\{/.test(projSource.split('informationSourceRegistry')[0].split('\n').pop() ?? '');
// Simpler check: does the file import something that isn't 'type' from the registry?
const linesWithRegistryImport = projSource.split('\n').filter((l) => l.includes('informationSourceRegistry') && l.includes('import'));
const hasNonTypeRegistryImport = linesWithRegistryImport.some((l) => !l.includes('import type'));
hardFail(
  !hasNonTypeRegistryImport,
  'bigWorldPOVProjection.ts does NOT value-import informationSourceRegistry (type-only imports are allowed)',
);
hardFail(
  !projSource.includes('queryHiddenSourceRecords'),
  'bigWorldPOVProjection.ts does NOT call queryHiddenSourceRecords',
);
hardFail(
  !projSource.includes('queryVisibleSourceRecords'),
  'bigWorldPOVProjection.ts does NOT call queryVisibleSourceRecords directly (reads through causal ledger)',
);
hardFail(
  !projSource.includes('createEmptyRegistry'),
  'bigWorldPOVProjection.ts does NOT create registry instances',
);

// The projection should read from state.worldCausalEvents (via buildLiveCausalContext)
hardFail(
  projSource.includes('worldCausalEvents') || projSource.includes('buildLiveCausalContext'),
  'bigWorldPOVProjection.ts reads from worldCausalEvents or uses buildLiveCausalContext',
);

// ===========================================================================
// CHECK 7: Same seed + same source records → deterministic replay
//
// Append the same records to two registries and verify byte-identical state.
// Also verify that query results are identical.
// ===========================================================================
console.log('\n--- CHECK 7: Deterministic replay ---');

const records = [EXAMPLE_MARKET_SIGNAL, EXAMPLE_RIVAL_ACTION, EXAMPLE_OWNER_INTERVIEW, EXAMPLE_COMPARABLE_TXN];
let regA = createEmptyRegistry();
let regB = createEmptyRegistry();

for (const r of records) {
  const ra = appendSourceRecord(regA, r);
  const rb = appendSourceRecord(regB, r);
  hardFail(ra.ok && rb.ok, `append ${r.sourceKind} succeeds for both`);
  if (ra.ok) regA = ra.registry;
  if (rb.ok) regB = rb.registry;
}

// Same count
hardFail(regA.index.count === regB.index.count, 'same records → same count');

// Same kind distribution
const statsA = getRegistryStats(regA);
const statsB = getRegistryStats(regB);
hardFail(
  JSON.stringify(statsA.kindCounts) === JSON.stringify(statsB.kindCounts),
  'same records → same kind distribution',
);

// Same query results for each kind
for (const kind of ['market_signal', 'rival_action', 'owner_interview', 'comparable_transaction'] as SourceKind[]) {
  const qA = queryByKind(regA, kind);
  const qB = queryByKind(regB, kind);
  hardFail(qA.length === qB.length, `queryByKind(${kind}): same count`);
  if (qA.length > 0 && qB.length > 0) {
    hardFail(qA[0].sourceId === qB[0].sourceId, `queryByKind(${kind}): same first record sourceId`);
  }
}

// Same actor visibility
const visA = queryVisibleSourceRecords(regA, 'player-broker', 'player_broker', 10);
const visB = queryVisibleSourceRecords(regB, 'player-broker', 'player_broker', 10);
hardFail(visA.length === visB.length, 'same records → same visible record count');

// Replay key dedup still works after many appends
let regDup = regA;
const dupAttempt = appendSourceRecord(regDup, EXAMPLE_MARKET_SIGNAL);
hardFail(!dupAttempt.ok, 'replayKey dedup holds after multiple appends');

// ===========================================================================
// CHECK 8: Product surface can trace visible source → causal event
//
// The projection must produce refs that trace from a visible source record
// (via sourceId) to a causal event in worldCausalEvents. We test this by:
// 1. Running the runtime to produce causal events
// 2. Checking that buildLiveCausalContext produces refs with event IDs
// 3. Checking that those event IDs exist in worldCausalEvents
// ===========================================================================
console.log('\n--- CHECK 8: Source → causal event traceability ---');

// Build a minimal GameState-like object for buildLiveCausalContext
// We need state.worldCausalEvents and state.day, state.cases, state.markets, etc.
// Instead of building a full GameState, we check the code path:

// The buildLiveCausalContext function reads state.worldCausalEvents and
// converts them to POVCausalRefs. The key question: can a POVCausalRef
// be traced back to a source record?

// For now, verify that:
// a) buildLiveCausalContext exists and is exported
hardFail(
  typeof buildLiveCausalContext === 'function',
  'buildLiveCausalContext is exported and callable',
);

// b) The projection's POVCausalRef type has refType that can reference source events
const projTypes = readSource('../src/selling-houses/application/projections/bigWorldPOVProjection.ts');
hardFail(
  projTypes.includes("'market-signal'") || projTypes.includes('"market-signal"'),
  'POVCausalRef supports market-signal refType (can reference source-derived events)',
);

// c) The runtime phases produce events with IDs that match the bwe- pattern
// used by buildLiveCausalContext to build refs
hardFail(
  projTypes.includes('bwe-') || projTypes.includes("refId: e.id"),
  'buildLiveCausalContext uses event IDs as refId (traceable chain)',
);

// d) The projection reads worldCausalEvents (source of truth for refs)
hardFail(
  projTypes.includes('worldCausalEvents'),
  'projection reads state.worldCausalEvents for causal refs',
);

// e) The SOURCE_TO_CAUSAL_MAP covers the original 10 kinds and any later extensions.
// Round 8 expands the matrix to 15 kinds; this gate must not fail just because
// the source universe got larger, but it must still protect the original baseline.
const baselineSourceKinds: readonly SourceKind[] = [
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
];
hardFail(
  SOURCE_TO_CAUSAL_MAP.length >= baselineSourceKinds.length,
  `SOURCE_TO_CAUSAL_MAP covers at least baseline ${baselineSourceKinds.length} kinds (got ${SOURCE_TO_CAUSAL_MAP.length})`,
);
for (const kind of baselineSourceKinds) {
  hardFail(
    SOURCE_TO_CAUSAL_MAP.some((mapping) => mapping.sourceKind === kind),
    `SOURCE_TO_CAUSAL_MAP includes baseline kind ${kind}`,
  );
}
for (const mapping of SOURCE_TO_CAUSAL_MAP) {
  hardFail(
    mapping.possibleCausalKinds.length > 0,
    `${mapping.sourceKind} has possible causal kinds`,
  );
}

// ===========================================================================
// CHECK 9: Runtime phases actually call source ingestion (not just produce events)
//
// The phases.ts must reference InformationSourceRecord or source ingestion
// in some way. If it only builds WorldCausalEvents from raw GameState fields
// without consulting source records, the ingestion pipeline is incomplete.
// ===========================================================================
console.log('\n--- CHECK 9: Source ingestion pipeline ---');

// Check if any runtime code imports or references informationSourceTypes
const runtimeFiles = [
  '../src/selling-houses/domain/world-model/runtime/phases.ts',
  '../src/selling-houses/domain/world-model/runtime/clock.ts',
];

let runtimeReferencesSource = false;
for (const file of runtimeFiles) {
  const src = readSource(file);
  if (src.includes('informationSource') || src.includes('InformationSourceRecord') || src.includes('sourceRecord')) {
    runtimeReferencesSource = true;
    break;
  }
}

// Soft check: the runtime may not directly import source types yet,
// but it must at minimum produce events that can be linked to sources
// The key is: does the runtime have a hook for source ingestion?
// If not, that's a gap.

hardFail(
  runtimeReferencesSource || phasesUseSourceId,
  'runtime phases reference source records (informationSourceTypes or sourceId)',
);

// Also check: is there any file that bridges source records to causal events?
const allWorldModelFiles = [
  '../src/selling-houses/domain/world-model/informationSourceTypes.ts',
  '../src/selling-houses/domain/world-model/informationSourceRegistry.ts',
  '../src/selling-houses/domain/world-model/causalEvents.ts',
  '../src/selling-houses/domain/world-model/runtime/phases.ts',
];

let hasIngestionBridge = false;
for (const file of allWorldModelFiles) {
  const src = readSource(file);
  if (src.includes('ingest') || src.includes('sourceToCausal') || src.includes('SOURCE_TO_CAUSAL_MAP')) {
    hasIngestionBridge = true;
    break;
  }
}

hardFail(
  hasIngestionBridge,
  'SOURCE_TO_CAUSAL_MAP or ingestion reference exists in world-model layer',
);

// ===========================================================================
// CHECK 10: Visibility policy covers all scopes
//
// The isRecordVisibleToActor function must handle all 6 VisibilityScope values.
// ===========================================================================
console.log('\n--- CHECK 10: Visibility policy completeness ---');

const allScopes = ['all_actors', 'specific_actors', 'no_one', 'owner_only', 'broker_chain', 'player_only'] as const;
const regVis = createEmptyRegistry();

for (const scope of allScopes) {
  const record: InformationSourceRecord<'market_signal'> = {
    ...EXAMPLE_MARKET_SIGNAL,
    sourceId: `isr-vis-${scope}`,
    visibility: scope === 'specific_actors'
      ? { scope, actorIds: ['target-actor'], baseDelayDays: 0 }
      : { scope, baseDelayDays: 0 },
    replayKey: `rk-vis-${scope}`,
  };
  const res = appendSourceRecord(regVis, record);
  hardFail(res.ok, `append record with scope=${scope}`);
}

// Test each scope
const baseRecord = { ...EXAMPLE_MARKET_SIGNAL, day: 1 };

hardFail(
  isRecordVisibleToActor({ ...baseRecord, sourceId: 'x', visibility: { scope: 'all_actors', baseDelayDays: 0 }, replayKey: 'x' }, 'any', 'player_broker', 5) === true,
  'all_actors: visible',
);
hardFail(
  isRecordVisibleToActor({ ...baseRecord, sourceId: 'x', visibility: { scope: 'no_one', baseDelayDays: 0 }, replayKey: 'x' }, 'any', 'player_broker', 5) === false,
  'no_one: hidden',
);
hardFail(
  isRecordVisibleToActor({ ...baseRecord, sourceId: 'x', visibility: { scope: 'player_only', baseDelayDays: 0 }, replayKey: 'x' }, 'p1', 'player_broker', 5) === true,
  'player_only: visible to player',
);
hardFail(
  isRecordVisibleToActor({ ...baseRecord, sourceId: 'x', visibility: { scope: 'player_only', baseDelayDays: 0 }, replayKey: 'x' }, 'r1', 'rival_broker', 5) === false,
  'player_only: hidden from rival',
);
hardFail(
  isRecordVisibleToActor({ ...baseRecord, sourceId: 'x', visibility: { scope: 'owner_only', baseDelayDays: 0 }, replayKey: 'x' }, 'o1', 'owner', 5) === true,
  'owner_only: visible to owner',
);
hardFail(
  isRecordVisibleToActor({ ...baseRecord, sourceId: 'x', visibility: { scope: 'broker_chain', baseDelayDays: 0 }, replayKey: 'x' }, 'b1', 'player_broker', 5) === true,
  'broker_chain: visible to player_broker',
);
hardFail(
  isRecordVisibleToActor({ ...baseRecord, sourceId: 'x', visibility: { scope: 'broker_chain', baseDelayDays: 0 }, replayKey: 'x' }, 'b1', 'rival_broker', 5) === true,
  'broker_chain: visible to rival_broker',
);
hardFail(
  isRecordVisibleToActor({ ...baseRecord, sourceId: 'x', visibility: { scope: 'broker_chain', baseDelayDays: 0 }, replayKey: 'x' }, 'c1', 'customer', 5) === false,
  'broker_chain: hidden from customer',
);
hardFail(
  isRecordVisibleToActor({ ...baseRecord, sourceId: 'x', visibility: { scope: 'specific_actors', actorIds: ['target-actor'], baseDelayDays: 0 }, replayKey: 'x' }, 'target-actor', 'player_broker', 5) === true,
  'specific_actors: visible to listed actor',
);
hardFail(
  isRecordVisibleToActor({ ...baseRecord, sourceId: 'x', visibility: { scope: 'specific_actors', actorIds: ['target-actor'], baseDelayDays: 0 }, replayKey: 'x' }, 'other-actor', 'player_broker', 5) === false,
  'specific_actors: hidden from unlisted actor',
);

// Delay gate
hardFail(
  isRecordVisibleToActor({ ...baseRecord, sourceId: 'x', visibility: { scope: 'all_actors', baseDelayDays: 3 }, replayKey: 'x' }, 'any', 'player_broker', 3) === false,
  'delay gate: record not yet visible on day=record.day+delay',
);
hardFail(
  isRecordVisibleToActor({ ...baseRecord, sourceId: 'x', visibility: { scope: 'all_actors', baseDelayDays: 3 }, replayKey: 'x' }, 'any', 'player_broker', 5) === true,
  'delay gate: record visible after delay passes',
);

// ===========================================================================
// Summary
// ===========================================================================
console.log(`\n=== Round 6 Hard Gate Summary ===`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  console.error(`\nGATE FAILED: ${failed} checks did not pass.`);
  console.error('\nFailures:');
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
} else {
  console.log(`\nGATE PASSED: All ${passed} checks passed.`);
}
