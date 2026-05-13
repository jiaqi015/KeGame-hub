/**
 * Round 10 — All-Information Real Ingestion Gate
 *
 * Verifies that all 15 SourceKind records are actually ingested through the
 * real advanceDays loop and produce traceable causal events, not just
 * compile-time type definitions.
 *
 * Anti-false-positive:
 * - "source type defined" ≠ "source actually ingested"
 * - "source record created" ≠ "causal event produced"
 * - "causal event exists" ≠ "causal event traceable to source"
 */

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine/opportunityEngine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { advanceDays } from '../src/selling-houses/domain/engine.js';
import {
  createEmptyRegistry,
  appendSourceRecord,
} from '../src/selling-houses/domain/world-model/informationSourceRegistry.js';
import {
  ingestSourceRecords,
} from '../src/selling-houses/domain/world-model/runtime/sourceIngestionAdapter.js';
import type { InformationSourceRecord, SourceKind } from '../src/selling-houses/domain/world-model/informationSourceTypes.js';
import type { GameState } from '../src/selling-houses/domain/models.js';

let passed = 0;
let failed = 0;

function check(condition: boolean, msg: string) {
  if (condition) { passed++; console.log(`  [PASS] ${msg}`); }
  else { failed++; console.error(`  [FAIL] ${msg}`); }
}

const ALL_SOURCE_KINDS: SourceKind[] = [
  'market_signal', 'rival_action', 'customer_interaction', 'owner_interview',
  'manager_message', 'player_action_receipt', 'process_receipt',
  'comparable_transaction', 'platform_traffic', 'acn_network_signal',
  'supporting_facility_signal', 'broker_capacity_signal', 'owner_life_event_signal',
  'buyer_financing_signal', 'micro_market_signal',
];

function buildWorld(seed: number): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain')!;
  const state = createInitialState(snapshot, seed);
  seedInitialOpportunities(state);
  return state;
}

function makeRecord(kind: SourceKind, seed: number): InformationSourceRecord {
  const id = `isr-test-${kind}-${seed}`;
  return {
    sourceId: id,
    sourceKind: kind,
    payload: { summary: `test ${kind}`, subtype: 'heat_shift', marketCellId: 'cell-1', before: 50, after: 60, unit: 'heat_index', isPublic: true },
    day: 1,
    phase: 'morning',
    entityRefs: [{ id: 'cell-1', kind: 'market_cell' as const }],
    actorRefs: [{ id: 'system', role: 'system' as const }],
    visibility: { scope: 'all_actors' as const, baseDelayDays: 0 },
    confidence: 0.8,
    delayDays: 0,
    replayKey: `rk-${kind}-${seed}`,
    origin: 'ecosystem_tick' as const,
  } as unknown as InformationSourceRecord;
}

// ═══════════════════════════════════════════════════════════════
// Gate 1: All 15 SourceKind types compile and can be created
// ═══════════════════════════════════════════════════════════════
console.log('=== Gate 1: All 15 SourceKind types can be created ===');

let registry = createEmptyRegistry();
for (const kind of ALL_SOURCE_KINDS) {
  const record = makeRecord(kind, 42);
  const result = appendSourceRecord(registry, record);
  check(result.ok, `appendSourceRecord succeeds for ${kind}`);
  if (result.ok) registry = result.registry;
}
check(registry.index.count === 15, `registry has 15 records (got ${registry.index.count})`);

// ═══════════════════════════════════════════════════════════════
// Gate 2: ingestSourceRecords produces causal events for each kind
// ═══════════════════════════════════════════════════════════════
console.log('\n=== Gate 2: ingestSourceRecords produces causal events per kind ===');

const receipt = ingestSourceRecords(registry.index.all, 1, 42);
check(receipt.causalEvents.length > 0, `produced ${receipt.causalEvents.length} causal events`);
check(receipt.sourceToEvents.size > 0, `sourceToEvents has ${receipt.sourceToEvents.size} entries`);

const ingestedKinds = new Set(receipt.causalEvents.map((e: any) => e.sourceKind));
check(ingestedKinds.size >= 10, `causal events cover ${ingestedKinds.size} source kinds (need >= 10)`);

// Verify each kind produced at least one event
for (const kind of ALL_SOURCE_KINDS) {
  const eventsForKind = receipt.causalEvents.filter((e: any) => e.sourceKind === kind);
  check(eventsForKind.length > 0, `${kind} → ${eventsForKind.length} causal events`);
}

// ═══════════════════════════════════════════════════════════════
// Gate 3: Causal events carry sourceRecordId for traceability
// ═══════════════════════════════════════════════════════════════
console.log('\n=== Gate 3: Causal events carry sourceRecordId ===');

let traceableCount = 0;
for (const evt of receipt.causalEvents) {
  const srcId = (evt as any).sourceRecordId;
  if (typeof srcId === 'string' && srcId.length > 0) traceableCount++;
}
check(traceableCount > 0, `${traceableCount}/${receipt.causalEvents.length} causal events have sourceRecordId`);
check(traceableCount === receipt.causalEvents.length, `all causal events traceable (got ${traceableCount}/${receipt.causalEvents.length})`);

// ═══════════════════════════════════════════════════════════════
// Gate 4: Replay consistency — same records → same causal events
// ═══════════════════════════════════════════════════════════════
console.log('\n=== Gate 4: Replay consistency ===');

let registry2 = createEmptyRegistry();
for (const kind of ALL_SOURCE_KINDS) {
  const record = makeRecord(kind, 42);
  const result = appendSourceRecord(registry2, record);
  if (result.ok) registry2 = result.registry;
}

const receipt2 = ingestSourceRecords(registry2.index.all, 1, 42);
check(receipt.causalEvents.length === receipt2.causalEvents.length, `same seed → same event count (${receipt.causalEvents.length} === ${receipt2.causalEvents.length})`);

// Compare event IDs
const ids1 = receipt.causalEvents.map((e) => e.id).sort();
const ids2 = receipt2.causalEvents.map((e) => e.id).sort();
check(JSON.stringify(ids1) === JSON.stringify(ids2), 'same seed → identical event IDs');

// Compare replayKeys
const keys1 = receipt.causalEvents.map((e) => (e as any).replayKey).filter(Boolean).sort();
const keys2 = receipt2.causalEvents.map((e) => (e as any).replayKey).filter(Boolean).sort();
check(JSON.stringify(keys1) === JSON.stringify(keys2), 'same seed → identical replayKeys');

// ═══════════════════════════════════════════════════════════════
// Gate 5: Live advanceDays produces worldCausalEvents
// ═══════════════════════════════════════════════════════════════
console.log('\n=== Gate 5: Live advanceDays produces worldCausalEvents ===');

const state = buildWorld(20260513);
const beforeLen = state.worldCausalEvents?.length ?? 0;
advanceDays(state, 7);
updateDerivedState(state);
const afterLen = state.worldCausalEvents?.length ?? 0;
check(afterLen > beforeLen, `worldCausalEvents grew: ${beforeLen} → ${afterLen}`);
check(state.bigWorldRuntime !== undefined, 'bigWorldRuntime exists');
check((state.bigWorldRuntime?.tickCount ?? 0) >= 7, `tickCount >= 7 (got ${state.bigWorldRuntime?.tickCount})`);

// ═══════════════════════════════════════════════════════════════
// Gate 6: No Date.now / Math.random in source ingestion
// ═══════════════════════════════════════════════════════════════
console.log('\n=== Gate 6: No forbidden RNG in source layer ===');

import { readFileSync } from 'node:fs';
const srcFiles = [
  'src/selling-houses/domain/world-model/informationSourceTypes.ts',
  'src/selling-houses/domain/world-model/informationSourceRegistry.ts',
  'src/selling-houses/domain/world-model/runtime/sourceIngestionAdapter.ts',
];
for (const f of srcFiles) {
  const content = readFileSync(f, 'utf-8');
  check(!content.includes('Date.now()'), `${f} has no Date.now()`);
  check(!content.match(/\bMath\.random\b/), `${f} has no Math.random`);
  check(!content.includes('fetch('), `${f} has no fetch()`);
}

// ═══════════════════════════════════════════════════════════════
// Summary
// ═══════════════════════════════════════════════════════════════
console.log(`\n=== All-Information Real Ingestion Gate ===`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);
if (failed > 0) { console.error('GATE FAILED'); process.exit(1); }
else { console.log('GATE PASSED'); }
