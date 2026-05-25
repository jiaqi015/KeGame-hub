/**
 * R13 Live Causal Decision Spine Gate
 *
 * Proves the player-facing runtime can traverse the constitutional chain:
 * SourceRecord -> WorldCausalEvent -> ActorKnowledge -> Belief/Pressure
 * -> Command/Action -> Receipt -> next-day tick ledger.
 *
 * This gate uses real generated opening state, real executeGameAction, and
 * real advanceGameDays. It must fail hard if any link is only ceremonial.
 */

import { buildGeneratedScenarioOpeningPreview, createStateFromScenarioOpening } from '../src/selling-houses/application/scenarioOpening.js';
import { advanceGameDays, executeGameAction } from '../src/selling-houses/application/gameTransitions.js';
import { getActionAvailability } from '../src/selling-houses/domain/engine.js';
import {
  appendSourceRecords,
  createEmptyRegistry,
} from '../src/selling-houses/domain/world-model/informationSourceRegistry.js';
import {
  buildActorKnowledgeSnapshot,
  buildDecisionEvidenceEnvelope,
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

function playerActionSourceRecords(state: GameState): readonly InformationSourceRecord[] {
  return (state.pendingSourceRecords ?? []).filter(
    (record) => record.sourceKind === 'player_action_receipt',
  );
}

function sourceLinkedEvents(
  events: readonly WorldCausalEvent[] | undefined,
  sourceRecordId: string,
): readonly WorldCausalEvent[] {
  return (events ?? []).filter((event) =>
    event.sourceRecordId === sourceRecordId
    || (event.sourceRecordIds ?? []).includes(sourceRecordId),
  );
}

function sourceLinkedEventIds(
  events: readonly WorldCausalEvent[] | undefined,
  sourceRecordId: string,
): readonly string[] {
  return sourceLinkedEvents(events, sourceRecordId).map((event) => event.id);
}

function hasNewStyleReceipt(history: readonly unknown[] | undefined): boolean {
  return (history ?? []).some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const record = entry as Record<string, unknown>;
    return Array.isArray(record.generatedSourceRecordIds)
      && record.generatedSourceRecordIds.length > 0
      && Array.isArray(record.generatedCausalEventIds)
      && record.generatedCausalEventIds.length > 0;
  });
}

function executeActionAndTick(
  state: GameState,
  actionId: string,
  caseId: string,
): {
  readonly stateAfterAction: GameState;
  readonly stateAfterTick: GameState;
  readonly sourceRecords: readonly InformationSourceRecord[];
  readonly tickEventIds: readonly string[];
} {
  const caseItem = state.cases.find((entry) => entry.id === caseId);
  if (!caseItem) {
    throw new Error(`case not found: ${caseId}`);
  }

  const availability = getActionAvailability(state, caseItem, actionId);
  check(availability.enabled, `${actionId} is available on day ${state.day}`);

  const beforeHistory = state.actionReceiptHistory?.length ?? 0;
  const beforeCausal = state.worldCausalEvents?.length ?? 0;
  const result = executeGameAction(state, actionId, caseId, null);
  check(result.success, `${actionId} executes successfully`);

  const afterHistory = result.nextState.actionReceiptHistory?.length ?? 0;
  const afterCausal = result.nextState.worldCausalEvents?.length ?? 0;
  check(afterHistory > beforeHistory, `${actionId} appends actionReceiptHistory`);
  check(afterCausal > beforeCausal, `${actionId} appends immediate receipt causal event`);
  check(hasNewStyleReceipt(result.nextState.actionReceiptHistory), `${actionId} stores new-style ActionReceipt trace ids`);

  const sourceRecords = playerActionSourceRecords(result.nextState);
  check(sourceRecords.length > 0, `${actionId} queues player_action_receipt source record`);

  const immediateReceiptEvents = (result.nextState.worldCausalEvents ?? [])
    .slice(beforeCausal)
    .filter((event) => event.sourceKind === 'player_action_receipt');
  check(
    immediateReceiptEvents.length > 0,
    `${actionId} immediate receipt emits player_action_receipt causal event`,
  );

  const stateAfterTick = advanceGameDays(result.nextState, 1);
  check((stateAfterTick.pendingSourceRecords ?? []).length === 0, `${actionId} tick consumes pending source records`);

  const tickEventIds = sourceRecords.flatMap((record) =>
    sourceLinkedEventIds(stateAfterTick.worldCausalEvents, record.sourceId),
  );
  check(tickEventIds.length > 0, `${actionId} source record enters tick causal ledger`);

  return {
    stateAfterAction: result.nextState,
    stateAfterTick,
    sourceRecords,
    tickEventIds,
  };
}

function runSequence(seed: number) {
  const state0 = buildWorld(seed);
  const caseId = firstActiveCaseId(state0);

  console.log('\n=== R13 Live Spine: first action ===\n');
  const first = executeActionAndTick(state0, 'first-visit', caseId);

  console.log('\n=== R13 Live Spine: second action ===\n');
  const second = executeActionAndTick(first.stateAfterTick, 'weekly-feedback', caseId);

  const sourceRecords = [...first.sourceRecords, ...second.sourceRecords];
  let registry = createEmptyRegistry();
  const appendResult = appendSourceRecords(registry, sourceRecords);
  check(appendResult.appendedCount === sourceRecords.length, 'source registry accepts real action records without duplicate replay keys');
  registry = appendResult.registry;

  const knowledge = buildActorKnowledgeSnapshot(
    'player-broker',
    'player_broker',
    second.stateAfterTick.day,
    registry,
    second.stateAfterTick.worldCausalEvents,
  );
  const envelope = buildDecisionEvidenceEnvelope(knowledge);

  return {
    state: second.stateAfterTick,
    caseId,
    sourceRecords,
    sourceIds: sourceRecords.map((record) => record.sourceId),
    sourceReplayKeys: sourceRecords.map((record) => record.replayKey),
    tickEventIds: [
      ...first.tickEventIds,
      ...second.tickEventIds,
    ],
    knowledge,
    envelope,
  };
}

const SEED = 20260522;

console.log('\n=== R13 Live Causal Decision Spine Gate ===\n');

const runA = runSequence(SEED);

console.log('\n=== R13 Live Spine: actor knowledge / decision envelope ===\n');

const visibleSourceIds = runA.knowledge.visibleSources.map((source) => source.sourceId);
for (const sourceId of runA.sourceIds) {
  check(visibleSourceIds.includes(sourceId), `ActorKnowledge includes visible source ${sourceId}`);
}

const visibleCausalEventIds = runA.knowledge.visibleSources.flatMap((source) => source.causalEventIds ?? []);
for (const eventId of runA.tickEventIds) {
  check(visibleCausalEventIds.includes(eventId), `VisibleSourceRef carries causal event ${eventId}`);
}

const beliefSourceIds = runA.knowledge.beliefs.flatMap((belief) => belief.confidence.sourceIds);
for (const sourceId of runA.sourceIds) {
  check(beliefSourceIds.includes(sourceId), `belief chain references source ${sourceId}`);
}

const pressureSourceIds = runA.envelope.pressureSignals.flatMap((pressure) => pressure.sourceRecordIds);
for (const sourceId of runA.sourceIds) {
  check(pressureSourceIds.includes(sourceId), `pressure chain references source ${sourceId}`);
}

check(
  runA.envelope.recommendedCommand !== null,
  'decision envelope recommends a command after repeated real action evidence',
);

const recommended = runA.envelope.recommendedCommand;
if (recommended) {
  check(
    recommended.sourceRecordIds.every((sourceId) => runA.sourceIds.includes(sourceId)),
    'recommended command is backed by real player action source records',
  );
  check(
    runA.envelope.explanation.chain.map((link) => link.step).join('>') === 'source>belief>pressure>command',
    'explanation chain is source>belief>pressure>command',
  );
}

const causalRefIds = runA.envelope.causalRefs
  .filter((ref) => ref.refType === 'causal_event')
  .map((ref) => ref.refId);
for (const eventId of runA.tickEventIds) {
  check(causalRefIds.includes(eventId), `DecisionEvidenceEnvelope causalRefs include real event ${eventId}`);
}

console.log('\n=== R13 Live Spine: replay determinism ===\n');

const runB = runSequence(SEED);
check(JSON.stringify(runA.sourceIds) === JSON.stringify(runB.sourceIds), 'same seed/action sequence -> same source ids');
check(JSON.stringify(runA.sourceReplayKeys) === JSON.stringify(runB.sourceReplayKeys), 'same seed/action sequence -> same source replay keys');
check(JSON.stringify(runA.tickEventIds) === JSON.stringify(runB.tickEventIds), 'same seed/action sequence -> same tick causal event ids');
check(runA.envelope.replayKey === runB.envelope.replayKey, 'same seed/action sequence -> same decision envelope replay key');

console.log('\n=== R13 Live Causal Decision Spine Summary ===\n');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  console.error(`\nGATE FAILED: ${failed} checks did not pass.`);
  process.exit(1);
}

console.log(`\nGATE PASSED: All ${passed} checks passed.`);
console.log('Verified live spine: real action receipts now reach causal events, actor knowledge, beliefs, pressure, command recommendation, and replay-stable causal refs.');
