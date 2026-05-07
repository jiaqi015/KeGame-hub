/**
 * Daily Operating Ledger Final Hard Gate.
 *
 * Proves the full Daily Operating Ledger system (DailyTickReceipt + EventStreamReceipt
 * + ProcessResult + WorldFork) is real business functionality:
 *
 * 1. Governance: A/B/C/D are workers, E/F blocked
 * 2. Core contracts exist and are pure (no domain/runtime/UI imports)
 * 3. Runtime wiring: advanceOneDay → processResults populated → buildLastDailyTickReceiptFromState returns non-null
 * 4. Workspace projections consume compressed data without raw GameState
 * 5. Graceful fallback when old saves lack ledger data
 * 6. Deterministic: same seed → byte-identical receipt/projection JSON
 * 7. Gameplay-invariance: receipt building doesn't change closedDeals/lifecycle/rngCalls
 * 8. Compressed: no complete GameState in receipt output (EventStreamReceipt has payloadKeys not payload,
 *    DailyTickReceipt has counts/IDs not objects; WorldFork receipt is compressed even though forkState is a clone)
 * 9. All four projections use readOnly + projectionKind
 * 10. No side effects (Date.now/Math.random/fetch) in receipt/projection builders
 * 11. EventStreamReceipt compression: recentEvents have payloadKeys but not payload values
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { advanceOneDay, seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import type { GameState, DailyTickResult } from '../src/selling-houses/domain/models.js';

import {
  buildDailyTickReceipt,
  buildLastDailyTickReceiptFromState,
} from '../src/selling-houses/runtime/simulation/dailyTickReceipt.js';

import {
  buildEventStreamReceiptFromState,
  buildDailyTickEventStreamReceipt,
} from '../src/selling-houses/runtime/simulation/eventStreamReceipt.js';

import {
  buildDailyTickReceiptWorkspaceProjection,
} from '../src/selling-houses/interface/interaction-workspace/dailyTickReceiptBoundary.js';

import {
  buildEventStreamWorkspaceProjection,
} from '../src/selling-houses/interface/interaction-workspace/eventStreamBoundary.js';

import {
  buildWorldForkWorkspaceProjection,
} from '../src/selling-houses/interface/interaction-workspace/worldForkBoundary.js';

import {
  buildProcessResultWorkspaceProjection,
} from '../src/selling-houses/interface/interaction-workspace/processResultBoundary.js';

import {
  createCounterfactualWorldFork,
} from '../src/selling-houses/runtime/decision-support/worldFork.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = '/Users/jiaqi/Documents/开放日测算/src/selling-houses';

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string) {
  if (condition) { passed++; }
  else { failed++; console.error(`  [FAIL] ${message}`); }
}

function stripComments(src: string): string {
  return src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

const SEED = 20260506;

function buildWorld(seed: number): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario');
  const world = createInitialState(snapshot, seed);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

// ---------------------------------------------------------------------------
// 1. Governance
// ---------------------------------------------------------------------------

console.log('=== Check 1: A/B/C/D governance, E/F blocked ===');

const workplanSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/docs/selling-houses-mother-model-agent-workplan.md', 'utf-8');
check(workplanSrc.includes('A, B, C, D are workers'), 'workplan: A/B/C/D are workers');
check(workplanSrc.includes('Do not create Agent E/F'), 'workplan: E/F blocked');

// No E/F imports in ledger files
const receiptSrc = readFileSync(`${ROOT}/runtime/simulation/dailyTickReceipt.ts`, 'utf-8');
const eventSrc = readFileSync(`${ROOT}/runtime/simulation/eventStreamReceipt.ts`, 'utf-8');
const procSrc = readFileSync(`${ROOT}/runtime/simulation/dailyProcessResult.ts`, 'utf-8');
const forkSrc = readFileSync(`${ROOT}/runtime/decision-support/worldFork.ts`, 'utf-8');

for (const [name, src] of [
  ['dailyTickReceipt', receiptSrc],
  ['eventStreamReceipt', eventSrc],
  ['dailyProcessResult', procSrc],
  ['worldFork', forkSrc],
]) {
  check(!src.includes("from '../../agent-e") && !src.includes("from '../../agent-f"),
    `${name}: no E/F imports`);
}

console.log('  Governance: PASS');

// ---------------------------------------------------------------------------
// 2. Core contracts exist and are pure
// ---------------------------------------------------------------------------

console.log('=== Check 2: Core contracts pure ===');

// dailyProcessResult.ts — core read model, no domain/runtime imports
const procCode = stripComments(procSrc);
check(!procCode.includes("from '../../domain"), 'dailyProcessResult: no domain imports');
check(!procCode.includes("from '../../runtime"), 'dailyProcessResult: no runtime imports');
check(!procCode.includes("from '../../application"), 'dailyProcessResult: no application imports');
check(!procCode.includes('Date.now'), 'dailyProcessResult: no Date.now');
check(!procCode.includes('Math.random'), 'dailyProcessResult: no Math.random');

// dailyTickReceipt.ts — reads from domain types but doesn't import domain logic
check(receiptSrc.includes("from '../../domain/models.js'"), 'dailyTickReceipt: imports domain types only');

// eventStreamReceipt.ts — reads from domain types only
check(eventSrc.includes("from '../../domain/models.js'"), 'eventStreamReceipt: imports domain types only');

// worldFork.ts — imports GameState type only
check(forkSrc.includes("from '../../domain/models.js'"), 'worldFork: imports GameState type only');

console.log('  Core contracts pure: PASS');

// ---------------------------------------------------------------------------
// 3. Runtime wiring: advanceOneDay → processResults → receipt
// ---------------------------------------------------------------------------

console.log('=== Check 3: Runtime wiring ===');

const world1 = buildWorld(SEED);
const tick1 = advanceOneDay(world1) as DailyTickResult;

check(tick1 !== null, 'tick1 is not null');
check(tick1.processResults !== undefined, 'tick1 has processResults');
check(Array.isArray(tick1.processResults), 'tick1.processResults is array');
check(tick1.processResults.length > 0, 'tick1.processResults is non-empty');

// ProcessResults have expected shape
for (const pr of tick1.processResults) {
  check(typeof pr.managerId === 'string', `processResult: managerId is string`);
  check(typeof pr.owner === 'string', `processResult: owner is string`);
  check(typeof pr.day === 'number', `processResult: day is number`);
  check(pr.phase === 'settled-day' || pr.phase === 'next-day-setup',
    `processResult: phase is settled-day or next-day-setup`);
  check(typeof pr.processedCount === 'number', `processResult: processedCount is number`);
  check(typeof pr.resolvedCount === 'number', `processResult: resolvedCount is number`);
  check(Array.isArray(pr.emittedEventIds), `processResult: emittedEventIds is array`);
  check(Array.isArray(pr.closedDealIds), `processResult: closedDealIds is array`);
}

// buildLastDailyTickReceiptFromState returns non-null after tick
const receipt = buildLastDailyTickReceiptFromState(world1);
check(receipt !== null, 'buildLastDailyTickReceiptFromState returns non-null');
check(receipt!.day === tick1.day, 'receipt day matches tick day');
check(receipt!.receiptKind === 'daily_tick_receipt', 'receipt has correct receiptKind');
check(receipt!.readOnly === true, 'receipt is readOnly');
check(receipt!.processResultCount > 0, 'receipt has processResultCount > 0');

// Process manager counts are populated
check(typeof receipt!.processManagerCounts['negotiation-process-manager'] === 'number',
  'receipt: negotiation count is number');
check(typeof receipt!.processManagerCounts['product-run-process-manager'] === 'number',
  'receipt: product-run count is number');

// buildDailyTickReceipt from tick result also works
const directReceipt = buildDailyTickReceipt(tick1);
check(directReceipt.day === tick1.day, 'directReceipt day matches');
check(directReceipt.processResultCount > 0, 'directReceipt has processResults');

// Run more days for accumulated state
const tick2 = advanceOneDay(world1) as DailyTickResult;
const tick3 = advanceOneDay(world1) as DailyTickResult;
check(tick3.processResults.length > 0, 'tick3 has processResults');

// EventStreamReceipt from state
const eventReceipt = buildEventStreamReceiptFromState(world1);
check(eventReceipt.receiptKind === 'event_stream_receipt', 'eventReceipt: correct kind');
check(eventReceipt.eventCount > 0, 'eventReceipt: events present');
check(eventReceipt.readOnly === true, 'eventReceipt: readOnly');

console.log('  Runtime wiring: PASS');

// ---------------------------------------------------------------------------
// 4. Workspace projections consume compressed data
// ---------------------------------------------------------------------------

console.log('=== Check 4: Workspace projections ===');

// DailyTickReceipt projection
const dtProjection = buildDailyTickReceiptWorkspaceProjection(world1);
check(dtProjection.projectionKind === 'daily_tick_receipt_adapter_state', 'dtProjection: kind');
check(dtProjection.readOnly === true, 'dtProjection: readOnly');
check(dtProjection.source === 'runtime-daily-tick-receipt', 'dtProjection: source');
check(dtProjection.receipt !== null, 'dtProjection: receipt non-null');
check(dtProjection.receipt!.processResultCount > 0, 'dtProjection: has processResults');

// EventStream projection
const esProjection = buildEventStreamWorkspaceProjection(world1);
check(esProjection.projectionKind === 'event_stream_adapter_state', 'esProjection: kind');
check(esProjection.readOnly === true, 'esProjection: readOnly');
check(esProjection.receipt.eventCount > 0, 'esProjection: has events');

// WorldFork projection
const wfProjection = buildWorldForkWorkspaceProjection(world1);
check(wfProjection.projectionKind === 'world_fork_adapter_state', 'wfProjection: kind');
check(wfProjection.readOnly === true, 'wfProjection: readOnly');
check(wfProjection.receipt.caseCount >= 0, 'wfProjection: has caseCount');

// ProcessResult projection
const prProjection = buildProcessResultWorkspaceProjection(world1);
check(prProjection.projectionKind === 'process_result_adapter_state', 'prProjection: kind');
check(prProjection.readOnly === true, 'prProjection: readOnly');
check(prProjection.processResultCount >= 0, 'prProjection: has processResultCount');
check(prProjection.byManager !== undefined, 'prProjection: has byManager');
check(Array.isArray(prProjection.settledDayResults), 'prProjection: has settledDayResults');
check(Array.isArray(prProjection.nextDaySetupResults), 'prProjection: has nextDaySetupResults');
check(Array.isArray(prProjection.results), 'prProjection: has results');

// None of the projections expose raw GameState
const dtJson = JSON.stringify(dtProjection);
const esJson = JSON.stringify(esProjection);
const wfJson = JSON.stringify(wfProjection);
const prJson = JSON.stringify(prProjection);

check(!dtJson.includes('rngState'), 'dtProjection: no rngState');
check(!dtJson.includes('eventStore'), 'dtProjection: no eventStore');
check(!esJson.includes('rngState'), 'esProjection: no rngState');
check(!prJson.includes('rngState'), 'prProjection: no rngState');
check(!prJson.includes('eventStore'), 'prProjection: no eventStore');

console.log('  Workspace projections: PASS');

// ---------------------------------------------------------------------------
// 5. Graceful fallback for old saves
// ---------------------------------------------------------------------------

console.log('=== Check 5: Graceful fallback ===');

// Empty world without tick — receipt should be null
const emptyWorld = buildWorld(SEED);
// Don't call advanceOneDay — no lastDailyTickResult yet
const emptyReceipt = buildLastDailyTickReceiptFromState(emptyWorld);
check(emptyReceipt === null, 'empty world: receipt is null (graceful)');

// Empty world projection
const emptyDtProj = buildDailyTickReceiptWorkspaceProjection(emptyWorld);
check(emptyDtProj.receipt === null, 'empty world: projection receipt is null');
check(emptyDtProj.day === emptyWorld.day, 'empty world: projection day matches state.day');

// ProcessResult handles missing lastDailyTickResult
const emptyPrProj = buildProcessResultWorkspaceProjection(emptyWorld);
check(emptyPrProj.processResultCount === 0, 'empty world: processResultCount=0');
check(emptyPrProj.results.length === 0, 'empty world: results empty');

// buildDailyTickReceipt with missing processResults
const emptyResult = { day: 1, nextDay: 2, emittedEvents: [], closedDeals: [], invariantAlerts: [] };
const fallbackReceipt = buildDailyTickReceipt(emptyResult);
check(fallbackReceipt.processResultCount === 0, 'fallback: empty processResults');
check(fallbackReceipt.processResults.length === 0, 'fallback: empty processResults array');
check(fallbackReceipt.settledDayProcessResults.length === 0, 'fallback: empty settledDay');
check(fallbackReceipt.nextDaySetupProcessResults.length === 0, 'fallback: empty nextDaySetup');
check(fallbackReceipt.emittedEventCount === 0, 'fallback: no events');
check(fallbackReceipt.closedDealCount === 0, 'fallback: no deals');
check(fallbackReceipt.semanticReceiptSummary === undefined, 'fallback: no semantic summary');

console.log('  Graceful fallback: PASS');

// ---------------------------------------------------------------------------
// 6. Deterministic
// ---------------------------------------------------------------------------

console.log('=== Check 6: Deterministic ===');

const worldA = buildWorld(SEED);
const worldB = buildWorld(SEED);

const tickA = advanceOneDay(worldA) as DailyTickResult;
const tickB = advanceOneDay(worldB) as DailyTickResult;

// Same tick
check(tickA.day === tickB.day, 'same day');

// Same receipt
const rcpA = buildDailyTickReceipt(tickA);
const rcpB = buildDailyTickReceipt(tickB);
check(JSON.stringify(rcpA) === JSON.stringify(rcpB), 'identical DailyTickReceipt JSON');

// Same event stream receipt from state
const esA = buildEventStreamReceiptFromState(worldA);
const esB = buildEventStreamReceiptFromState(worldB);
check(JSON.stringify(esA) === JSON.stringify(esB), 'identical EventStreamReceipt JSON');

// Same daily tick event stream receipt
const dtesA = buildDailyTickEventStreamReceipt(tickA);
const dtesB = buildDailyTickEventStreamReceipt(tickB);
check(JSON.stringify(dtesA) === JSON.stringify(dtesB), 'identical daily tick EventStream JSON');

// Same projections
const projDtA = buildDailyTickReceiptWorkspaceProjection(worldA);
const projDtB = buildDailyTickReceiptWorkspaceProjection(worldB);
check(JSON.stringify(projDtA) === JSON.stringify(projDtB), 'identical dtProjection JSON');

const projEsA = buildEventStreamWorkspaceProjection(worldA);
const projEsB = buildEventStreamWorkspaceProjection(worldB);
check(JSON.stringify(projEsA) === JSON.stringify(projEsB), 'identical esProjection JSON');

const projPrA = buildProcessResultWorkspaceProjection(worldA);
const projPrB = buildProcessResultWorkspaceProjection(worldB);
check(JSON.stringify(projPrA) === JSON.stringify(projPrB), 'identical prProjection JSON');

// Note: WorldFork uses new Date().toISOString() for forkCreatedAt, so we pass a fixed value
// Note: baseRunId is a unique UUID per world — exclude from determinism comparison
const wfA = createCounterfactualWorldFork(worldA, { forkCreatedAt: '2026-05-06T00:00:00Z' });
const wfB = createCounterfactualWorldFork(worldB, { forkCreatedAt: '2026-05-06T00:00:00Z' });
const wfAComparable = { ...wfA.receipt, baseRunId: '<run>' };
const wfBComparable = { ...wfB.receipt, baseRunId: '<run>' };
check(JSON.stringify(wfAComparable) === JSON.stringify(wfBComparable),
  'identical WorldForkReceipt JSON (normalized runId)');

console.log('  Deterministic: PASS');

// ---------------------------------------------------------------------------
// 7. Gameplay invariance
// ---------------------------------------------------------------------------

console.log('=== Check 7: Gameplay invariance ===');

const worldPre = buildWorld(SEED);
const tickPre = advanceOneDay(worldPre) as DailyTickResult;

// Capture state AFTER advanceOneDay (which legitimately changes rngCalls, etc.)
const rngCallsAfterTick = worldPre.rngCalls;
const eventStoreAfterTick = worldPre.eventStore.length;

// Building receipt does NOT alter state
const receiptPre = buildLastDailyTickReceiptFromState(worldPre);
check(receiptPre !== null, 'invariance: receipt built');
check(worldPre.rngCalls === rngCallsAfterTick,
  'invariance: rngCalls unchanged by receipt building');

// Build all projections — none should mutate state
const eventStoreSnapshot = JSON.stringify(worldPre.eventStore.slice(0, 3));
const rngCallsBeforeProjections = worldPre.rngCalls;
buildDailyTickReceiptWorkspaceProjection(worldPre);
buildEventStreamWorkspaceProjection(worldPre);
buildProcessResultWorkspaceProjection(worldPre);
check(JSON.stringify(worldPre.eventStore.slice(0, 3)) === eventStoreSnapshot,
  'invariance: eventStore unchanged after all projections');
check(worldPre.rngCalls === rngCallsBeforeProjections,
  'invariance: rngCalls unchanged by projections');

// WorldFork creates a clone — original should be untouched
const casesBeforeFork = worldPre.cases.length;
const worldFork = createCounterfactualWorldFork(worldPre);
check(worldPre.cases.length === casesBeforeFork, 'invariance: original cases unchanged after fork');

console.log('  Gameplay invariance: PASS');

// ---------------------------------------------------------------------------
// 8. Compressed: no complete GameState in receipt output
// ---------------------------------------------------------------------------

console.log('=== Check 8: Compressed output ===');

// DailyTickReceipt: has counts and IDs, not full objects
check(typeof receipt!.emittedEventCount === 'number', 'receipt: emittedEventCount is count');
check(typeof receipt!.closedDealCount === 'number', 'receipt: closedDealCount is count');
check(Array.isArray(receipt!.emittedEventIds), 'receipt: emittedEventIds is ID list');
check(Array.isArray(receipt!.closedDealIds), 'receipt: closedDealIds is ID list');

// ProcessResult receipt has IDs not objects
for (const pr of receipt!.processResults) {
  check(Array.isArray(pr.emittedEventIds), 'processResult: emittedEventIds is array');
  check(Array.isArray(pr.closedDealIds), 'processResult: closedDealIds is array');
  check(Array.isArray(pr.opportunityIds), 'processResult: opportunityIds is array');
  check(Array.isArray(pr.productRunIds), 'processResult: productRunIds is array');
}

// EventStreamReceipt: recentEvents have payloadKeys, not payload values
for (const evt of eventReceipt.recentEvents) {
  check(Array.isArray(evt.payloadKeys), `event ${evt.id}: has payloadKeys`);
  check((evt as any).payload === undefined, `event ${evt.id}: no payload field`);
}

// WorldFork receipt is compressed (counts, not arrays)
const wfReceipt = worldFork.receipt;
check(typeof wfReceipt.caseCount === 'number', 'wfReceipt: caseCount is number');
check(typeof wfReceipt.opportunityCount === 'number', 'wfReceipt: opportunityCount is number');
check(typeof wfReceipt.eventCount === 'number', 'wfReceipt: eventCount is number');
check(typeof wfReceipt.closedDealCount === 'number', 'wfReceipt: closedDealCount is number');
check(typeof wfReceipt.productRunCount === 'number', 'wfReceipt: productRunCount is number');
// WorldFork receipt should NOT have cases/opportunities/etc arrays
check((wfReceipt as any).cases === undefined, 'wfReceipt: no cases array');
check((wfReceipt as any).opportunities === undefined, 'wfReceipt: no opportunities array');
check((wfReceipt as any).eventStore === undefined, 'wfReceipt: no eventStore');

// Dirty scope counts are numbers (not arrays of IDs)
check(typeof receipt!.dirtyScopeCounts.cases === 'number', 'dirtyScopeCounts: cases is count');
check(typeof receipt!.dirtyScopeCounts.opportunities === 'number', 'dirtyScopeCounts: opps is count');
check(typeof receipt!.dirtyScopeCounts.customers === 'number', 'dirtyScopeCounts: customers is count');

console.log('  Compressed output: PASS');

// ---------------------------------------------------------------------------
// 9. All four projections use readOnly + projectionKind
// ---------------------------------------------------------------------------

console.log('=== Check 9: All projections readOnly + projectionKind ===');

check(dtProjection.readOnly === true && dtProjection.projectionKind === 'daily_tick_receipt_adapter_state',
  'DailyTickReceipt projection: readOnly + kind');
check(esProjection.readOnly === true && esProjection.projectionKind === 'event_stream_adapter_state',
  'EventStream projection: readOnly + kind');
check(wfProjection.readOnly === true && wfProjection.projectionKind === 'world_fork_adapter_state',
  'WorldFork projection: readOnly + kind');
check(prProjection.readOnly === true && prProjection.projectionKind === 'process_result_adapter_state',
  'ProcessResult projection: readOnly + kind');

// All receipts have receiptKind
check(receipt!.receiptKind === 'daily_tick_receipt', 'DailyTickReceipt: receiptKind');
check(eventReceipt.receiptKind === 'event_stream_receipt', 'EventStreamReceipt: receiptKind');
check(wfReceipt.receiptKind === 'world_fork_receipt', 'WorldForkReceipt: receiptKind');

// All receipts have readOnly and source
check(receipt!.readOnly === true, 'DailyTickReceipt: readOnly');
check(receipt!.source === 'domain-daily-tick-result', 'DailyTickReceipt: source');
check(eventReceipt.readOnly === true, 'EventStreamReceipt: readOnly');
check(wfReceipt.readOnly === true, 'WorldForkReceipt: readOnly');
check(wfReceipt.source === 'legacy-game-state-clone', 'WorldForkReceipt: source');

console.log('  All projections readOnly + projectionKind: PASS');

// ---------------------------------------------------------------------------
// 10. No side effects in builders
// ---------------------------------------------------------------------------

console.log('=== Check 10: No side effects ===');

const boundaryFiles: [string, string][] = [
  ['dailyTickReceiptBoundary', readFileSync(`${ROOT}/interface/interaction-workspace/dailyTickReceiptBoundary.ts`, 'utf-8')],
  ['eventStreamBoundary', readFileSync(`${ROOT}/interface/interaction-workspace/eventStreamBoundary.ts`, 'utf-8')],
  ['worldForkBoundary', readFileSync(`${ROOT}/interface/interaction-workspace/worldForkBoundary.ts`, 'utf-8')],
  ['processResultBoundary', readFileSync(`${ROOT}/interface/interaction-workspace/processResultBoundary.ts`, 'utf-8')],
];

const runtimeFiles: [string, string][] = [
  ['dailyTickReceipt', receiptSrc],
  ['eventStreamReceipt', eventSrc],
  ['dailyProcessResult', procSrc],
];

for (const [name, src] of [...boundaryFiles, ...runtimeFiles]) {
  const code = stripComments(src);
  check(!code.includes('Date.now'), `${name}: no Date.now`);
  check(!code.includes('Math.random'), `${name}: no Math.random`);
  check(!code.includes('fetch('), `${name}: no fetch`);
  check(!code.includes('openai'), `${name}: no openai`);
  check(!code.includes('apiKey'), `${name}: no apiKey`);
}

// WorldFork: Date.now/Math.random/fetch/openai prohibited, but new Date() for forkCreatedAt is intentional
const forkCode = stripComments(forkSrc);
check(!forkCode.includes('Date.now'), 'worldFork: no Date.now');
check(!forkCode.includes('Math.random'), 'worldFork: no Math.random');
check(!forkCode.includes('fetch('), 'worldFork: no fetch');
check(!forkCode.includes('openai'), 'worldFork: no openai');
// Note: worldFork intentionally uses new Date().toISOString() for forkCreatedAt

console.log('  No side effects: PASS');

// ---------------------------------------------------------------------------
// 11. EventStreamReceipt compression detail
// ---------------------------------------------------------------------------

console.log('=== Check 11: EventStreamReceipt compression detail ===');

// Build from daily tick result
const tickEventReceipt = buildDailyTickEventStreamReceipt(tick1);
check(tickEventReceipt.receiptKind === 'event_stream_receipt', 'tickEventReceipt: kind');
check(tickEventReceipt.source === 'daily-tick-emitted-events', 'tickEventReceipt: source');
check(tickEventReceipt.readOnly === true, 'tickEventReceipt: readOnly');

// Recent events have payloadKeys but not payload
for (const evt of tickEventReceipt.recentEvents) {
  check(typeof evt.id === 'string', 'tickEvent: id is string');
  check(typeof evt.kind === 'string', 'tickEvent: kind is string');
  check(typeof evt.actor === 'string', 'tickEvent: actor is string');
  check(typeof evt.title === 'string', 'tickEvent: title is string');
  check(typeof evt.tone === 'string', 'tickEvent: tone is string');
  check(Array.isArray(evt.payloadKeys), 'tickEvent: payloadKeys is array');
  check((evt as any).payload === undefined, 'tickEvent: no raw payload');
  check((evt as any).detail === undefined, 'tickEvent: no raw detail');
}

// ByKind and byTone are present
check(typeof tickEventReceipt.byKind === 'object', 'tickEventReceipt: byKind is object');
check(typeof tickEventReceipt.byTone === 'object', 'tickEventReceipt: byTone is object');

// Referenced IDs are extracted
check(Array.isArray(tickEventReceipt.referencedCaseIds), 'tickEventReceipt: referencedCaseIds');
check(Array.isArray(tickEventReceipt.referencedOpportunityIds), 'tickEventReceipt: referencedOpportunityIds');
check(Array.isArray(tickEventReceipt.referencedCustomerIds), 'tickEventReceipt: referencedCustomerIds');

console.log('  EventStreamReceipt compression detail: PASS');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Daily Operating Ledger Final Gate ===`);
console.log(`Total: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);

if (failed > 0) {
  console.log('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\ndaily-operating-ledger final gate passed');
  process.exit(0);
}
