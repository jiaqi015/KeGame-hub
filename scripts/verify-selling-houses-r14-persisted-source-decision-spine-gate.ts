/**
 * R14 Persisted Source Ledger + Unified Receipt Trace + Process/Manager Decision Spine Gate
 *
 * Proves:
 * 1. generated scenario opening creates valid game state
 * 2. executeGameAction('first-visit') emits action receipt trace and pending source
 * 3. advanceGameDays consumes pending sources
 * 4. source evidence remains in persisted runtime source ledger after pending queue clear
 * 5. registry rebuilt from persisted ledger can drive ActorKnowledge
 * 6. action receipt immediate trace is unified with tick-ingested source (same source ID)
 * 7. player_action_receipt, manager_message, and process_receipt each have source -> causal event links
 * 8. visible source refs carry causal event ids for all three kinds
 * 9. beliefs reference real source ids for all three kinds
 * 10. pressure signals reference real source ids for all three kinds where role-visible
 * 11. at least one recommended command is backed by persisted source evidence
 * 12. explanation chain is exactly source>belief>pressure>command
 * 13. same seed/action sequence replay is deterministic for source ids, replay keys, causal event ids
 * 14. JSON/structuredClone roundtrip does not break persisted source registry reconstruction
 *
 * Hard constraints:
 *   - No check(true), assert(true), || true
 *   - No WARN-as-PASS
 *   - No silent catch around core checks
 *   - Hard process.exit(1) on failure
 */

import { buildGeneratedScenarioOpeningPreview, createStateFromScenarioOpening } from '../src/selling-houses/application/scenarioOpening.js';
import { advanceGameDays, executeGameAction, cloneGameState } from '../src/selling-houses/application/gameTransitions.js';
import { getActionAvailability } from '../src/selling-houses/domain/engine.js';
import {
  createEmptyRegistry,
  appendSourceRecords,
} from '../src/selling-houses/domain/world-model/informationSourceRegistry.js';
import {
  buildActorKnowledgeSnapshot,
  buildDecisionEvidenceEnvelope,
  extractPersistedSourceRecords,
  buildInformationSourceRegistryFromRuntime,
} from '../src/selling-houses/application/projections/actorKnowledgeProjection.js';
import type { GameState } from '../src/selling-houses/domain/models.js';
import type { InformationSourceRecord } from '../src/selling-houses/domain/world-model/informationSourceTypes.js';
import type { WorldCausalEvent } from '../src/selling-houses/domain/world-model/causalEvents.js';

let passed = 0;
let failed = 0;

function pass(message: string): void {
  passed += 1;
  console.log(`  [PASS] ${message}`);
}

function fail(message: string): void {
  failed += 1;
  console.error(`  [FAIL] ${message}`);
}

function check(condition: boolean, message: string): void {
  if (condition) {
    pass(message);
  } else {
    fail(message);
  }
}

function buildWorld(seed: number): GameState {
  const opening = buildGeneratedScenarioOpeningPreview('standard', seed, 'standard');
  return createStateFromScenarioOpening(opening);
}

function firstActiveCaseId(state: GameState): string {
  const caseItem = state.cases.find((entry) => entry.status === 'active');
  if (!caseItem) {
    throw new Error('no active case in generated opening');
  }
  return caseItem.id;
}

const SEED = 20260523;

console.log('\n=== R14 Persisted Source + Decision Spine Gate ===\n');

// ── 1. Generated scenario opening ────────────────────────────────────────

console.log('\n=== R14-1: Generated opening ===\n');
const state0 = buildWorld(SEED);
const caseId = firstActiveCaseId(state0);
check(state0.cases.length > 0, 'generated opening creates valid game state with cases');
check(state0.bigWorldRuntime !== undefined, 'generated opening has bigWorldRuntime');

// ── 2-3. Execute action + advance day ────────────────────────────────────

console.log('\n=== R14-2/3: Execute action + advance day ===\n');
const case0 = state0.cases.find((entry) => entry.id === caseId)!;
const availability = getActionAvailability(state0, case0, 'first-visit');
check(availability.enabled, 'first-visit is available');

const result1 = executeGameAction(state0, 'first-visit', caseId, null);
check(result1.success, 'first-visit executes successfully');

const state1 = result1.nextState;
const pendingAfterAction = (state1.pendingSourceRecords ?? []).filter(
  (r) => r.sourceKind === 'player_action_receipt',
);
check(pendingAfterAction.length > 0, 'executeGameAction queues player_action_receipt pending source');

// Check immediate receipt trace has source IDs — the source records
// are persisted to bigWorldRuntime.persistedSourceRecords immediately
// after executeGameAction, before the tick.
const immediatePersisted = extractPersistedSourceRecords(state1.bigWorldRuntime);
const immediatePAR = immediatePersisted.filter((r) => r.sourceKind === 'player_action_receipt');
check(immediatePAR.length > 0, 'executeGameAction persists player_action_receipt source records to ledger');

// Advance one day — consumes pending sources
const state2 = advanceGameDays(state1, 1);
check((state2.pendingSourceRecords ?? []).length === 0, 'advanceGameDays consumes pending source records');

// ── 4. Persisted source ledger survives pending queue clear ──────────────

console.log('\n=== R14-4: Persisted source ledger ===\n');
const persistedRecords = extractPersistedSourceRecords(state2.bigWorldRuntime);
check(persistedRecords.length > 0, 'persisted source ledger has records after tick');

const playerActionPersisted = persistedRecords.filter(
  (r) => r.sourceKind === 'player_action_receipt',
);
check(playerActionPersisted.length > 0, 'persisted source ledger contains player_action_receipt');

// ── 5. Registry rebuild from persisted ledger ────────────────────────────

console.log('\n=== R14-5: Registry rebuild from persisted ledger ===\n');
const rebuiltRegistry = buildInformationSourceRegistryFromRuntime(state2.bigWorldRuntime);
check(rebuiltRegistry.index.all.length > 0, 'rebuilt registry has records');

const rebuiltKnowledge = buildActorKnowledgeSnapshot(
  'player-broker',
  'player_broker',
  state2.day,
  rebuiltRegistry,
  state2.worldCausalEvents,
);
check(rebuiltKnowledge.visibleSources.length > 0, 'rebuilt registry drives ActorKnowledge with visible sources');

// ── 6. Unified receipt trace ─────────────────────────────────────────────

console.log('\n=== R14-6: Unified receipt trace ===\n');
const immediateSourceId = immediatePAR[0]?.sourceId;
const pendingSourceId = pendingAfterAction[0]?.sourceId;
check(
  immediateSourceId === pendingSourceId,
  `immediate receipt source ID matches pending tick source ID (both: ${immediateSourceId ?? 'undefined'})`,
);

// Verify the tick causal event can be traced back
const tickCausalForAction = (state2.worldCausalEvents ?? []).filter(
  (e) => e.sourceRecordId === immediateSourceId || (e.sourceRecordIds ?? []).includes(immediateSourceId ?? ''),
);
check(tickCausalForAction.length > 0, 'tick causal event traces back to action receipt source ID');

// ── 7. All three source kinds have source -> causal event links ──────────

console.log('\n=== R14-7: All three source kinds have causal links ===\n');

// Second action to accumulate more evidence
const case2 = state2.cases.find((entry) => entry.id === caseId && entry.status === 'active');
let state3 = state2;
if (case2) {
  const avail2 = getActionAvailability(state2, case2, 'weekly-feedback');
  if (avail2.enabled) {
    const result2 = executeGameAction(state2, 'weekly-feedback', caseId, null);
    if (result2.success) {
      state3 = advanceGameDays(result2.nextState, 1);
    }
  }
}

// Check all three source kinds exist in persisted ledger
const allPersisted = extractPersistedSourceRecords(state3.bigWorldRuntime);
const parRecords = allPersisted.filter((r) => r.sourceKind === 'player_action_receipt');
const mmRecords = allPersisted.filter((r) => r.sourceKind === 'manager_message');
const prRecords = allPersisted.filter((r) => r.sourceKind === 'process_receipt');

check(parRecords.length > 0, 'persisted ledger has player_action_receipt records');
check(mmRecords.length > 0, 'persisted ledger has manager_message records');
check(prRecords.length > 0, 'persisted ledger has process_receipt records');

// Check causal events for each kind
const causalEvents = state3.worldCausalEvents ?? [];

function sourceHasCausalEvent(sourceId: string): boolean {
  return causalEvents.some(
    (e) => e.sourceRecordId === sourceId || (e.sourceRecordIds ?? []).includes(sourceId),
  );
}

const parHasCausal = parRecords.some((r) => sourceHasCausalEvent(r.sourceId));
const mmHasCausal = mmRecords.some((r) => sourceHasCausalEvent(r.sourceId));
const prHasCausal = prRecords.some((r) => sourceHasCausalEvent(r.sourceId));

check(parHasCausal, 'player_action_receipt has source -> causal event link');
check(mmHasCausal, 'manager_message has source -> causal event link');
check(prHasCausal, 'process_receipt has source -> causal event link');

// ── 8. Visible source refs carry causal event ids ────────────────────────

console.log('\n=== R14-8: Visible source refs carry causal event ids ===\n');
const fullRegistry = buildInformationSourceRegistryFromRuntime(state3.bigWorldRuntime);
const fullKnowledge = buildActorKnowledgeSnapshot(
  'player-broker',
  'player_broker',
  state3.day,
  fullRegistry,
  state3.worldCausalEvents,
);
const envelope = buildDecisionEvidenceEnvelope(fullKnowledge);

const parVisible = fullKnowledge.visibleSources.filter((s) => s.sourceKind === 'player_action_receipt');
const mmVisible = fullKnowledge.visibleSources.filter((s) => s.sourceKind === 'manager_message');
const prVisible = fullKnowledge.visibleSources.filter((s) => s.sourceKind === 'process_receipt');

check(
  parVisible.length > 0 && parVisible.some((s) => (s.causalEventIds ?? []).length > 0),
  'player_action_receipt visible source has causal event ids',
);
check(
  mmVisible.length > 0 && mmVisible.some((s) => (s.causalEventIds ?? []).length > 0),
  'manager_message visible source has causal event ids',
);
check(
  prVisible.length > 0 && prVisible.some((s) => (s.causalEventIds ?? []).length > 0),
  'process_receipt visible source has causal event ids',
);

// ── 9. Beliefs reference real source ids ─────────────────────────────────

console.log('\n=== R14-9: Beliefs reference real source ids ===\n');
const allSourceIds = new Set(allPersisted.map((r) => r.sourceId));
const beliefSourceIds = fullKnowledge.beliefs.flatMap((b) => b.confidence.sourceIds);

const parBeliefSourceIds = beliefSourceIds.filter((id) => id.includes('player_action_receipt'));
const mmBeliefSourceIds = beliefSourceIds.filter((id) =>
  mmRecords.some((r) => r.sourceId === id),
);
const prBeliefSourceIds = beliefSourceIds.filter((id) =>
  prRecords.some((r) => r.sourceId === id),
);

check(parBeliefSourceIds.length > 0, 'beliefs reference player_action_receipt source ids');
check(mmBeliefSourceIds.length > 0, 'beliefs reference manager_message source ids');
check(prBeliefSourceIds.length > 0, 'beliefs reference process_receipt source ids');

// ── 10. Pressure signals reference source ids ────────────────────────────

console.log('\n=== R14-10: Pressure signals reference source ids ===\n');
const pressureSourceIds = envelope.pressureSignals.flatMap((p) => p.sourceRecordIds);

const parPressureIds = pressureSourceIds.filter((id) => id.includes('player_action_receipt'));
const mmPressureIds = pressureSourceIds.filter((id) =>
  mmRecords.some((r) => r.sourceId === id),
);
const prPressureIds = pressureSourceIds.filter((id) =>
  prRecords.some((r) => r.sourceId === id),
);

check(parPressureIds.length > 0, 'pressure signals reference player_action_receipt source ids');
check(mmPressureIds.length > 0, 'pressure signals reference manager_message source ids');
check(prPressureIds.length > 0, 'pressure signals reference process_receipt source ids');

// ── 11. Recommended command backed by persisted source evidence ──────────

console.log('\n=== R14-11: Recommended command backed by persisted evidence ===\n');
check(envelope.recommendedCommand !== null, 'decision envelope has a recommended command');
if (envelope.recommendedCommand) {
  const cmdSourceIds = envelope.recommendedCommand.sourceRecordIds;
  const cmdBackedByPersisted = cmdSourceIds.some((id) => allSourceIds.has(id));
  check(cmdBackedByPersisted, 'recommended command is backed by persisted source evidence');
}

// ── 12. Explanation chain ────────────────────────────────────────────────

console.log('\n=== R14-12: Explanation chain ===\n');
const chainSteps = envelope.explanation.chain.map((link) => link.step).join('>');
check(chainSteps === 'source>belief>pressure>command', `explanation chain is source>belief>pressure>command (got: ${chainSteps})`);

// ── 13. Replay determinism ───────────────────────────────────────────────

console.log('\n=== R14-13: Replay determinism ===\n');

function runSequence(seed: number) {
  const s0 = buildWorld(seed);
  const cid = firstActiveCaseId(s0);
  const r1 = executeGameAction(s0, 'first-visit', cid, null);
  const s1 = advanceGameDays(r1.nextState, 1);
  const c1 = s1.cases.find((e) => e.id === cid && e.status === 'active');
  let s2 = s1;
  if (c1) {
    const a2 = getActionAvailability(s1, c1, 'weekly-feedback');
    if (a2.enabled) {
      const r2 = executeGameAction(s1, 'weekly-feedback', cid, null);
      if (r2.success) {
        s2 = advanceGameDays(r2.nextState, 1);
      }
    }
  }
  const registry = buildInformationSourceRegistryFromRuntime(s2.bigWorldRuntime);
  const knowledge = buildActorKnowledgeSnapshot('player-broker', 'player_broker', s2.day, registry, s2.worldCausalEvents);
  const env = buildDecisionEvidenceEnvelope(knowledge);
  const persisted = extractPersistedSourceRecords(s2.bigWorldRuntime);

  return {
    sourceIds: persisted.map((r) => r.sourceId).sort(),
    replayKeys: persisted.map((r) => r.replayKey).sort(),
    causalEventIds: (s2.worldCausalEvents ?? []).map((e) => e.id).sort(),
    envelopeReplayKey: env.replayKey,
  };
}

const runA = runSequence(SEED);
const runB = runSequence(SEED);

check(JSON.stringify(runA.sourceIds) === JSON.stringify(runB.sourceIds), 'replay: same source ids');
check(JSON.stringify(runA.replayKeys) === JSON.stringify(runB.replayKeys), 'replay: same replay keys');
check(JSON.stringify(runA.causalEventIds) === JSON.stringify(runB.causalEventIds), 'replay: same causal event ids');
check(runA.envelopeReplayKey === runB.envelopeReplayKey, 'replay: same decision envelope replay key');

// ── 14. JSON/structuredClone roundtrip ───────────────────────────────────

console.log('\n=== R14-14: JSON/structuredClone roundtrip ===\n');
const cloned = structuredClone(state3);
const clonedPersisted = extractPersistedSourceRecords(cloned.bigWorldRuntime);
check(clonedPersisted.length > 0, 'cloned state has persisted source records');
check(
  clonedPersisted.length === allPersisted.length,
  `cloned state has same number of persisted records (${clonedPersisted.length} vs ${allPersisted.length})`,
);

const clonedRegistry = buildInformationSourceRegistryFromRuntime(cloned.bigWorldRuntime);
check(clonedRegistry.index.all.length > 0, 'rebuilt registry from cloned state has records');

const clonedKnowledge = buildActorKnowledgeSnapshot(
  'player-broker',
  'player_broker',
  cloned.day,
  clonedRegistry,
  cloned.worldCausalEvents,
);
check(clonedKnowledge.visibleSources.length > 0, 'cloned state registry drives ActorKnowledge');
check(
  clonedKnowledge.visibleSources.some((s) => s.sourceKind === 'player_action_receipt'),
  'cloned state ActorKnowledge includes player_action_receipt',
);
check(
  clonedKnowledge.visibleSources.some((s) => s.sourceKind === 'manager_message'),
  'cloned state ActorKnowledge includes manager_message',
);

// JSON roundtrip
const jsonString = JSON.stringify(state3);
const parsed = JSON.parse(jsonString) as GameState;
// Reconstruct runtime from parsed JSON (simulate save/load)
const parsedRuntime = parsed.bigWorldRuntime;
const jsonPersisted = extractPersistedSourceRecords(parsedRuntime);
check(jsonPersisted.length > 0, 'JSON roundtripped state has persisted source records');

const jsonRegistry = buildInformationSourceRegistryFromRuntime(parsedRuntime);
check(jsonRegistry.index.all.length > 0, 'rebuilt registry from JSON roundtripped state has records');

const jsonKnowledge = buildActorKnowledgeSnapshot(
  'player-broker',
  'player_broker',
  parsed.day,
  jsonRegistry,
  parsed.worldCausalEvents,
);
check(jsonKnowledge.visibleSources.length > 0, 'JSON roundtripped state registry drives ActorKnowledge');
check(
  jsonKnowledge.visibleSources.some((s) => s.sourceKind === 'player_action_receipt'),
  'JSON roundtripped ActorKnowledge includes player_action_receipt',
);

// ── Summary ──────────────────────────────────────────────────────────────

console.log('\n=== R14 Persisted Source + Decision Spine Gate Summary ===\n');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  console.error(`\nGATE FAILED: ${failed} checks did not pass.`);
  process.exit(1);
}

console.log(`\nGATE PASSED: All ${passed} checks passed.`);
console.log('Verified: persisted source ledger, unified receipt trace, manager/process decision spine, replay determinism, and save/load roundtrip.');
