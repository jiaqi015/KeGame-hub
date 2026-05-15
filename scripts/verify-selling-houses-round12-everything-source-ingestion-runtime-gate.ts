/**
 * Round 12 — Everything Source Ingestion Runtime Gate
 *
 * Verifies that ALL 15 SourceKind records are produced in the real
 * advanceDays / action / process runtime pipeline, not just defined as types.
 *
 * Anti-false-positive rules:
 *   - source registry has record but causal event has no sourceRecordId → FAIL
 *   - causal event has sourceKind but can't trace back to SourceRecord → FAIL
 *   - only script-created sources, not real runtime → FAIL
 *   - only 5-6 SourceKinds active → FAIL
 *   - player_action_receipt / process_receipt not flowing into runtime → FAIL
 *
 * Usage: npx tsx scripts/verify-selling-houses-round12-everything-source-ingestion-runtime-gate.ts
 */

import assert from 'node:assert/strict';
import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { advanceGameDays, executeGameAction } from '../src/selling-houses/application/gameTransitions.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine/opportunityEngine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import type { GameState } from '../src/selling-houses/domain/models.js';
import type { SourceKind } from '../src/selling-houses/domain/world-model/informationSourceTypes.js';
import type { WorldCausalEvent } from '../src/selling-houses/domain/world-model/causalEvents.js';

// ── Infrastructure ──────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(condition: boolean, msg: string) {
  if (condition) { passed++; console.log(`  ✅ ${msg}`); }
  else { failed++; failures.push(msg); console.error(`  ❌ ${msg}`); }
}

function section(title: string) {
  console.log(`\n━━━ ${title} ━━━`);
}

function buildWorld(seed: number): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain')!;
  const state = createInitialState(snapshot, seed);
  seedInitialOpportunities(state);
  return state;
}

function sourceKindsForEvent(event: WorldCausalEvent): readonly SourceKind[] {
  const eventAny = event as WorldCausalEvent & { readonly sourceKinds?: readonly SourceKind[] };
  const kinds = new Set<SourceKind>();
  if (eventAny.sourceKind) kinds.add(eventAny.sourceKind);
  for (const kind of eventAny.sourceKinds ?? []) kinds.add(kind);
  return [...kinds];
}

function eventHasSourceKind(event: WorldCausalEvent, kind: SourceKind): boolean {
  return sourceKindsForEvent(event).includes(kind);
}

const SEED = 20260514;

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║  Round 12 — Everything Source Ingestion Runtime Gate            ║');
console.log('║  Ecosystem tick + action/process receipts must join one ledger  ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');

// ═══════════════════════════════════════════════════════════════
// SECTION 1: LIVE advanceDays → worldCausalEvents with sourceKind coverage
// ═══════════════════════════════════════════════════════════════
section('1. LIVE RUNTIME — advanceGameDays produces source-linked causal events');

const state1 = buildWorld(SEED);
const beforeCausal = state1.worldCausalEvents?.length ?? 0;
const advanced1 = advanceGameDays(state1, 14);
updateDerivedState(advanced1);

const events1 = advanced1.worldCausalEvents ?? [];
check(advanced1.bigWorldRuntime !== undefined, 'bigWorldRuntime exists after 14 days');
check((advanced1.bigWorldRuntime?.tickCount ?? 0) >= 7, `tickCount >= 7 (got ${advanced1.bigWorldRuntime?.tickCount})`);
check(events1.length > beforeCausal, `worldCausalEvents grew: ${beforeCausal} → ${events1.length}`);

// ═══════════════════════════════════════════════════════════════
// SECTION 2: sourceKind coverage — all 15 kinds must be represented
// ═══════════════════════════════════════════════════════════════
section('2. ECOSYSTEM SOURCE COVERAGE — autonomous runtime source kinds');

const sourceKindsFound = new Set<string>();
let withSourceRecordId = 0;
let withSourceKind = 0;
let withSourceReplayKey = 0;

for (const evt of events1) {
  const evtAny = evt as any;
  if (typeof evtAny.sourceRecordId === 'string' && evtAny.sourceRecordId.length > 0) withSourceRecordId++;
  const eventSourceKinds = sourceKindsForEvent(evt);
  if (eventSourceKinds.length > 0) {
    withSourceKind++;
    for (const kind of eventSourceKinds) sourceKindsFound.add(kind);
  }
  if (typeof evtAny.sourceReplayKey === 'string' && evtAny.sourceReplayKey.length > 0) withSourceReplayKey++;
}

const ALL_SOURCE_KINDS: SourceKind[] = [
  'market_signal', 'rival_action', 'customer_interaction', 'owner_interview',
  'manager_message', 'player_action_receipt', 'process_receipt',
  'comparable_transaction', 'platform_traffic', 'acn_network_signal',
  'supporting_facility_signal', 'broker_capacity_signal', 'owner_life_event_signal',
  'buyer_financing_signal', 'micro_market_signal',
];

const DOMAIN_MAP: Record<string, string> = {
  market_signal: 'market',
  rival_action: 'rival',
  customer_interaction: 'customer',
  owner_interview: 'owner',
  manager_message: 'organization',
  player_action_receipt: 'player',
  process_receipt: 'process',
  comparable_transaction: 'market',
  platform_traffic: 'market',
  acn_network_signal: 'rival',
  supporting_facility_signal: 'property',
  broker_capacity_signal: 'broker',
  owner_life_event_signal: 'owner',
  buyer_financing_signal: 'customer',
  micro_market_signal: 'market',
};

const domainsCovered = new Set<string>();
for (const kind of sourceKindsFound) {
  const domain = DOMAIN_MAP[kind];
  if (domain) domainsCovered.add(domain);
}

// player_action_receipt must only come from real executeAction, not autonomous tick.
// process_receipt is allowed from settlement (real process settlement in resolveOneDay).
const RECEIPT_SOURCE_KINDS: SourceKind[] = ['player_action_receipt'];
const ECOSYSTEM_SOURCE_KINDS = ALL_SOURCE_KINDS.filter((k) => !RECEIPT_SOURCE_KINDS.includes(k));
const missingEcosystemKinds = ECOSYSTEM_SOURCE_KINDS.filter((k) => !sourceKindsFound.has(k));

console.log(`  ecosystem sourceKinds found: ${sourceKindsFound.size}/13+`);
console.log(`  kinds: ${[...sourceKindsFound].sort().join(', ')}`);
if (missingEcosystemKinds.length > 0) {
  console.log(`  missing: ${missingEcosystemKinds.join(', ')}`);
}
console.log(`  domains covered: ${domainsCovered.size} (${[...domainsCovered].sort().join(', ')})`);

check(events1.length > 0, `total causal events > 0 (${events1.length})`);
check(withSourceRecordId > 0, `events with sourceRecordId > 0 (${withSourceRecordId}/${events1.length})`);
check(missingEcosystemKinds.length === 0, `ecosystem sourceKind coverage = 13/13 (missing: ${missingEcosystemKinds.join(', ') || 'none'})`);
check(domainsCovered.size >= 5, `business domain coverage >= 5 domains (got ${domainsCovered.size})`);
check(!sourceKindsFound.has('player_action_receipt'), 'autonomous tick does not forge player_action_receipt (only from executeAction)');

// ═══════════════════════════════════════════════════════════════
// SECTION 3: player_action_receipt — must come from real executeAction
// ═══════════════════════════════════════════════════════════════
section('3. PLAYER ACTION RECEIPT — real executeAction produces source records');

let state3 = buildWorld(SEED + 100);
state3 = advanceGameDays(state3, 3);
updateDerivedState(state3);

const beforeActionEvents = state3.worldCausalEvents?.length ?? 0;
const beforeReceiptHistory = state3.actionReceiptHistory?.length ?? 0;

const activeCase3 = state3.cases.find((c) => c.status === 'active');
let playerActionReceiptEvents: readonly typeof events1[number][] = [];
if (activeCase3) {
  const actionResult = executeGameAction(state3, 'first-visit', activeCase3.id);
  check(actionResult.success === true, `executeGameAction('first-visit') succeeded`);
  state3 = actionResult.nextState;
  updateDerivedState(state3);

  const pendingPlayerRecords = (state3.pendingSourceRecords ?? []).filter((r) => r.sourceKind === 'player_action_receipt');
  check((state3.actionReceiptHistory?.length ?? 0) > beforeReceiptHistory, `actionReceiptHistory grew (${beforeReceiptHistory} → ${state3.actionReceiptHistory?.length})`);
  check(pendingPlayerRecords.length > 0, `player_action_receipt source records queued (${pendingPlayerRecords.length})`);
  check((state3.worldCausalEvents?.length ?? 0) > beforeActionEvents, `worldCausalEvents grew after action receipt adapter (${beforeActionEvents} → ${state3.worldCausalEvents?.length})`);

  const beforeIngest = state3.worldCausalEvents?.length ?? 0;
  state3 = advanceGameDays(state3, 1);
  updateDerivedState(state3);
  playerActionReceiptEvents = (state3.worldCausalEvents ?? []).filter((e) => eventHasSourceKind(e, 'player_action_receipt'));
  check(playerActionReceiptEvents.length > 0, `player_action_receipt entered causal ledger after runtime feedback (${playerActionReceiptEvents.length})`);
  check((state3.worldCausalEvents?.length ?? 0) > beforeIngest, `worldCausalEvents grew after runtime feedback (${beforeIngest} → ${state3.worldCausalEvents?.length})`);

  const recEvent = playerActionReceiptEvents[0] as WorldCausalEvent & { readonly sourceRecordIds?: readonly string[]; readonly sourceReplayKeys?: readonly string[] };
  check(typeof recEvent.sourceRecordId === 'string' && recEvent.sourceRecordId.length > 0, `sourceRecordId present: ${recEvent.sourceRecordId}`);
  check(typeof recEvent.sourceReplayKey === 'string' && recEvent.sourceReplayKey.length > 0, `sourceReplayKey present: ${recEvent.sourceReplayKey}`);
}

// ═══════════════════════════════════════════════════════════════
// SECTION 4: process_receipt — must come from real process settlement
// ═══════════════════════════════════════════════════════════════
section('4. PROCESS RECEIPT — real process settlement produces source records');

let state4 = buildWorld(SEED + 200);
updateDerivedState(state4);

const activeCase4 = state4.cases.find((c) => c.status === 'active');
if (activeCase4) {
  const firstVisit = executeGameAction(state4, 'first-visit', activeCase4.id);
  check(firstVisit.success === true, `executeGameAction('first-visit') succeeded before process`);
  state4 = firstVisit.nextState;
  updateDerivedState(state4);

  const showing = executeGameAction(state4, 'showing', activeCase4.id);
  check(showing.success === true, `executeGameAction('showing') succeeded before process`);
  state4 = showing.nextState;
  updateDerivedState(state4);

  const openDay = executeGameAction(state4, 'open-day', activeCase4.id);
  check(openDay.success === true, `executeGameAction('open-day') started real ProductRun`);
  state4 = openDay.nextState;
  updateDerivedState(state4);
  check((state4.productRuns?.length ?? 0) > 0, `real ProductRun created (${state4.productRuns?.length ?? 0})`);

  state4 = advanceGameDays(state4, 2);
  updateDerivedState(state4);
}

const processEvents = (state4.worldCausalEvents ?? []).filter(
  (e) => eventHasSourceKind(e, 'process_receipt'),
);
console.log(`  process_receipt events in causal ledger: ${processEvents.length}`);
check(processEvents.length > 0, `process_receipt entered causal ledger (${processEvents.length})`);
check((state4.pendingSourceRecords ?? []).some((record) => record.sourceKind === 'process_receipt'), 'latest process_receipt is queued for next runtime feedback');

// ═══════════════════════════════════════════════════════════════
// SECTION 5: SOURCE TRACEABILITY — bidirectional source↔causal
// ═══════════════════════════════════════════════════════════════
section('5. SOURCE TRACEABILITY — bidirectional source↔causal');

// Every causal event with sourceKind must have sourceRecordId
let traceableCount = 0;
let untraceableCount = 0;
for (const evt of events1) {
  const evtAny = evt as any;
  if (sourceKindsForEvent(evt).length > 0) {
    if (typeof evtAny.sourceRecordId === 'string' && evtAny.sourceRecordId.length > 0) {
      traceableCount++;
    } else {
      untraceableCount++;
    }
  }
}

check(traceableCount > 0, `traceable events > 0 (${traceableCount})`);
check(untraceableCount === 0, `no untraceable events with sourceKind (${untraceableCount} found)`);

// ═══════════════════════════════════════════════════════════════
// SECTION 6: REPLAY — deterministic with same seed
// ═══════════════════════════════════════════════════════════════
section('6. REPLAY — deterministic with same seed');

const state6a = buildWorld(SEED);
const replay6a = advanceGameDays(state6a, 7);
updateDerivedState(replay6a);

const state6b = buildWorld(SEED);
const replay6b = advanceGameDays(state6b, 7);
updateDerivedState(replay6b);

const ids6a = replay6a.worldCausalEvents?.map((e) => e.id).sort() ?? [];
const ids6b = replay6b.worldCausalEvents?.map((e) => e.id).sort() ?? [];
check(ids6a.length === ids6b.length && ids6a.every((id, i) => id === ids6b[i]), 'same seed → byte-identical causal event IDs');

const srcIds6a = replay6a.worldCausalEvents?.map((e) => (e as any).sourceRecordId ?? '').sort() ?? [];
const srcIds6b = replay6b.worldCausalEvents?.map((e) => (e as any).sourceRecordId ?? '').sort() ?? [];
check(srcIds6a.length === srcIds6b.length && srcIds6a.every((id, i) => id === srcIds6b[i]), 'same seed → byte-identical sourceRecordIds');

// ═══════════════════════════════════════════════════════════════
// SECTION 7: NO FORBIDDEN RNG / NETWORK / LLM PROVIDER
// ═══════════════════════════════════════════════════════════════
section('7. NO FORBIDDEN RNG / NETWORK / LLM PROVIDER');

import { readFileSync } from 'node:fs';
const srcFiles = [
  'src/selling-houses/domain/world-model/informationSourceTypes.ts',
  'src/selling-houses/domain/world-model/informationSourceRegistry.ts',
  'src/selling-houses/domain/world-model/runtime/sourceIngestionAdapter.ts',
  'src/selling-houses/domain/world-model/runtime/clock.ts',
  'src/selling-houses/domain/world-model/runtime/sourceRecordBuilder.ts',
];
for (const f of srcFiles) {
  const content = readFileSync(f, 'utf-8');
  check(!content.includes('Date.now()'), `${f} has no Date.now()`);
  check(!content.match(/\bMath\.random\b/), `${f} has no Math.random`);
  check(!content.includes('fetch('), `${f} has no fetch()`);
}

// ═══════════════════════════════════════════════════════════════
// SECTION 8: COMPACTION — no dangling cause refs
// ═══════════════════════════════════════════════════════════════
section('8. COMPACTION — no dangling cause refs');

const allIds = new Set(events1.map((e) => e.id));
let danglingRefs = 0;
for (const event of events1) {
  for (const causeId of event.causeEventIds) {
    if (causeId && !allIds.has(causeId)) danglingRefs++;
  }
}
check(danglingRefs === 0, `no dangling causal refs after 14 days (${danglingRefs} found)`);

// ═══════════════════════════════════════════════════════════════
// SECTION 9: PROJECTION BOUNDARY — no registry bypass
// ═══════════════════════════════════════════════════════════════
section('9. PROJECTION BOUNDARY — no registry bypass');

const projSource = readFileSync('src/selling-houses/application/projections/bigWorldPOVProjection.ts', 'utf-8');
check(!projSource.includes('queryHiddenSourceRecords'), 'bigWorldPOVProjection does NOT call queryHiddenSourceRecords');

// ═══════════════════════════════════════════════════════════════
// SECTION 10: GROWTH — source coverage grows with entity count
// ═══════════════════════════════════════════════════════════════
section('10. GROWTH — source coverage grows with entity count');

const state10 = buildWorld(SEED);
const entityBefore = state10.cases.length + state10.opportunities.length;
const causalBefore = state10.worldCausalEvents?.length ?? 0;
const advanced10 = advanceGameDays(state10, 7);
updateDerivedState(advanced10);
const entityAfter = advanced10.cases.length + advanced10.opportunities.length;
const causalAfter = advanced10.worldCausalEvents?.length ?? 0;

check(causalAfter > 0, `causal chain > 0 (${causalAfter} events)`);
if (entityAfter > 10) {
  check(causalAfter >= entityAfter, `causal chain (${causalAfter}) >= entity count (${entityAfter})`);
}

// ═══════════════════════════════════════════════════════════════
// MATURITY CLASSIFICATION
// ═══════════════════════════════════════════════════════════════
section('MATURITY CLASSIFICATION');

const hasRuntime = advanced1.bigWorldRuntime !== undefined && (advanced1.bigWorldRuntime?.tickCount ?? 0) >= 7;
const hasCausalEvents = events1.length > 0;
const hasSourceTrace = withSourceRecordId > 0 && withSourceKind > 0;
const hasEcosystemSourceCoverage = missingEcosystemKinds.length === 0;
const hasDomainCoverage = domainsCovered.size >= 5;
const hasPlayerActionReceipt = playerActionReceiptEvents.length > 0;
const hasProcessReceipt = processEvents.length > 0;
const hasManagerMessage = sourceKindsFound.has('manager_message');
const hasAcnNetworkSignal = sourceKindsFound.has('acn_network_signal');
const hasBidirectionalTrace = untraceableCount === 0 && traceableCount > 0;
const hasDetermReplay = ids6a.length === ids6b.length && ids6a.every((id, i) => id === ids6b[i]);
const hasNoDanglingRefs = danglingRefs === 0;
const hasNoForbiddenRng = true;

const maturityChecks: Record<string, boolean> = {
  'runtime': hasRuntime && hasCausalEvents,
  'source-trace': hasSourceTrace,
  'ecosystem-source-coverage-13': hasEcosystemSourceCoverage,
  'domain-coverage-5': hasDomainCoverage,
  'player-action-receipt': hasPlayerActionReceipt,
  'process-receipt': hasProcessReceipt,
  'manager-message': hasManagerMessage,
  'acn-network-signal': hasAcnNetworkSignal,
  'bidirectional-trace': hasBidirectionalTrace,
  'replay': hasDetermReplay,
  'compaction-safe': hasNoDanglingRefs,
  'everything-source-ingestion': hasRuntime && hasCausalEvents && hasSourceTrace && hasEcosystemSourceCoverage && hasDomainCoverage && hasPlayerActionReceipt && hasProcessReceipt && hasManagerMessage && hasAcnNetworkSignal && hasBidirectionalTrace && hasDetermReplay && hasNoDanglingRefs && hasNoForbiddenRng,
};

console.log('\n  Maturity checks:');
let maxLevel = 'not-passed';
const levelOrder = ['runtime', 'source-trace', 'ecosystem-source-coverage-13', 'domain-coverage-5', 'player-action-receipt', 'process-receipt', 'manager-message', 'acn-network-signal', 'bidirectional-trace', 'replay', 'compaction-safe', 'everything-source-ingestion'];

for (const level of levelOrder) {
  const ok = maturityChecks[level] ?? false;
  console.log(`    ${ok ? '✅' : '❌'} ${level}`);
  if (ok) maxLevel = level;
}

console.log(`\n  FINAL MATURITY: ${maxLevel.toUpperCase()}`);

console.log('\n  Anti-False-Positive Verdict:');
console.log(`    ${hasRuntime ? '✅' : '❌'} runtime ticks inside real advanceDays`);
console.log(`    ${hasSourceTrace ? '✅' : '❌'} sourceRecordId/sourceKind on live events`);
console.log(`    ${hasEcosystemSourceCoverage ? '✅' : '❌'} 13 ecosystem source kinds live; receipts verified via action/process`);
console.log(`    ${hasDomainCoverage ? '✅' : '❌'} ${domainsCovered.size}/8 business domains covered`);
console.log(`    ${hasPlayerActionReceipt ? '✅' : '❌'} player_action_receipt via command → pending source → runtime ledger`);
console.log(`    ${hasProcessReceipt ? '✅' : '❌'} process_receipt via process manager → runtime ledger`);
console.log(`    ${hasManagerMessage ? '✅' : '❌'} manager_message in live runtime`);
console.log(`    ${hasAcnNetworkSignal ? '✅' : '❌'} acn_network_signal in live runtime`);
console.log(`    ${hasBidirectionalTrace ? '✅' : '❌'} all sourceKind events have sourceRecordId`);
console.log(`    ${hasDetermReplay ? '✅' : '✗'} replay byte-identical on same seed`);
console.log(`    ${hasNoDanglingRefs ? '✅' : '✗'} compaction preserves causal chain`);

// ═══════════════════════════════════════════════════════════════
// SOURCE COVERAGE MATRIX
// ═══════════════════════════════════════════════════════════════
section('SOURCE COVERAGE MATRIX');

console.log('  SourceKind                      | Live | Domain      | Source');
console.log('  --------------------------------|------|-------------|-------');
for (const kind of ALL_SOURCE_KINDS) {
  const live = kind === 'player_action_receipt'
    ? (hasPlayerActionReceipt ? '✅' : '❌')
    : kind === 'process_receipt'
      ? (hasProcessReceipt ? '✅' : '❌')
      : (sourceKindsFound.has(kind) ? '✅' : '❌');
  const domain = DOMAIN_MAP[kind] ?? 'unknown';
  const source = kind === 'player_action_receipt' ? 'executeGameAction→runtimeFeedback'
    : kind === 'process_receipt' ? 'processManager→runtimeTick'
    : kind === 'owner_interview' ? 'generateAdditional'
    : kind === 'comparable_transaction' ? 'generateAdditional'
    : kind === 'supporting_facility_signal' ? 'generateAdditional'
    : kind === 'broker_capacity_signal' ? 'generateAdditional'
    : kind === 'owner_life_event_signal' ? 'generateAdditional'
    : kind === 'buyer_financing_signal' ? 'generateAdditional'
    : kind === 'micro_market_signal' ? 'generateAdditional'
    : 'phasePipeline';
  console.log(`  ${kind.padEnd(31)} | ${live}   | ${domain.padEnd(11)} | ${source}`);
}

// ═══════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════
console.log('\n═══════════════════════════════════════════════════════════════');
console.log(`  Round 12 — Everything Source Ingestion Runtime Gate`);
console.log(`  Passed: ${passed} | Failed: ${failed}`);
console.log(`  Maturity: ${maxLevel.toUpperCase()}`);
console.log('═══════════════════════════════════════════════════════════════');

if (failed > 0) {
  console.error('\n  ❌ GATE FAILED:');
  for (const f of failures) {
    console.error(`    • ${f}`);
  }
  process.exit(1);
} else {
  console.log('\n  ✅ GATE PASSED — everything-source-ingestion-runtime achieved');
}
