/**
 * Semantic Workspace Composer verification contract.
 *
 * Proves:
 * 1. buildSemanticWorkspaceProjectionFromDailyTickResult reads only result.day and result.semanticReceipts
 * 2. buildSemanticWorkspaceProjectionFromState reads only state.day and state.lastDailyTickResult
 * 3. Output is valid SemanticWorkspaceProjection
 * 4. Graceful fallback when semanticReceipts is absent
 * 5. No raw GameState fields in output
 * 6. LLM optionality is disabled/futureReady
 * 7. Deterministic output
 * 8. Pure functions (no mutation)
 */

import assert from 'node:assert/strict';

import {
  buildSemanticWorkspaceProjectionFromDailyTickResult,
  buildSemanticWorkspaceProjectionFromState,
} from '../src/selling-houses/interface/interaction-workspace/semanticWorkspaceComposer.js';

import type { DailyTickResult, GameState } from '../src/selling-houses/domain/models.js';
import type { DailySemanticReceiptBundle } from '../src/selling-houses/core/world-state/semantic-receipt/models.js';
import type { SemanticWorkspaceProjection } from '../src/selling-houses/interface/interaction-workspace/semanticReceiptBoundary.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const errors: string[] = [];

function check(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    failed++;
    errors.push(message);
    console.log(`  [FAIL] ${message}`);
  }
}

function stableSnapshot(value: unknown): string {
  return JSON.stringify(value);
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

function makeReceipt(): DailySemanticReceiptBundle {
  return Object.freeze({
    day: 10,
    interactionScenes: Object.freeze({
      sceneCount: 2,
      sceneIds: Object.freeze(['scene-1', 'scene-2']),
      sceneTypes: Object.freeze(['owner_call', 'showing']),
      caseIds: Object.freeze(['case-1', 'case-2']),
      primaryActorIds: Object.freeze(['broker-1', 'broker-1']),
      hasServiceInteractionCount: 1,
      hasServiceInteractionFlags: Object.freeze([true, false]),
    }),
    narrativeSignalPack: Object.freeze({
      packId: 'nsp-10-broker-1',
      packHash: 'hash-abc123',
      sourceRefCount: 8,
      evidenceRefCount: 12,
      signalCount: 7,
      timelineAnchorCount: 5,
      actorId: 'broker-1',
      actorKind: 'broker',
    }),
    pressureReceipts: Object.freeze({
      available: true,
      snapshotCount: 3,
      decisionDeltaCount: 2,
      inputCount: 5,
      day: 10,
    }),
    consensusReceipts: Object.freeze({
      available: true,
      formationCount: 1,
      signedCount: 0,
      collapsedCount: 0,
      blockedCount: 1,
      stillPendingCount: 0,
      day: 10,
    }),
    llmReady: true,
  }) as DailySemanticReceiptBundle;
}

function makeSparseSceneReceipt(): DailySemanticReceiptBundle {
  const receipt = makeReceipt();
  return Object.freeze({
    ...receipt,
    interactionScenes: Object.freeze({
      ...receipt.interactionScenes,
      sceneIds: Object.freeze(['scene-no-case', 'scene-with-case']),
      sceneTypes: Object.freeze(['general_checkin', 'owner_call']),
      caseIds: Object.freeze(['', 'case-2']),
      hasServiceInteractionCount: 1,
      hasServiceInteractionFlags: Object.freeze([false, true]),
    }),
  }) as DailySemanticReceiptBundle;
}

function makeDailyTickResult(receipt?: DailySemanticReceiptBundle): DailyTickResult {
  return {
    day: 10,
    nextDay: 11,
    report: null,
    emittedEvents: [],
    closedDeals: [],
    processResults: [],
    settledDayProcessResults: [],
    nextDaySetupProcessResults: [],
    dirtyScopes: {
      cases: [], opportunities: [], customers: [], owners: [],
      districts: [], marketCells: [], matters: [], market: false,
      dashboard: false, result: false,
    },
    invariantAlerts: [],
    semanticReceipts: receipt,
  };
}

function makeGameState(result?: DailyTickResult): GameState {
  return {
    day: 10,
    cases: [],
    opportunities: [],
    customers: [],
    eventStore: { events: [] },
    rngState: { seed: 42, calls: 0 },
    lastDailyTickResult: result,
  } as unknown as GameState;
}

// ---------------------------------------------------------------------------
// 1. buildSemanticWorkspaceProjectionFromDailyTickResult reads only result.day and result.semanticReceipts
// ---------------------------------------------------------------------------

function checkFromDailyTickResult() {
  const receipt = makeReceipt();
  const result = makeDailyTickResult(receipt);
  const projection = buildSemanticWorkspaceProjectionFromDailyTickResult(result);

  check(projection.day === 10, 'day must be 10');
  check(projection.readOnly === true, 'readOnly must be true');
  check(projection.projectionKind === 'semantic_receipt_adapter_state', 'projectionKind must match');
  check(projection.interactionScenes.length === 2, 'must have 2 scenes');
  check(projection.interactionScenes[0]!.sceneId === 'scene-1', 'first sceneId must match');
  check(projection.interactionScenes[0]!.sceneType === 'owner_call', 'first sceneType must match');
  check(projection.interactionScenes[0]!.povActorId === 'broker-1', 'first povActorId must match');
  check(projection.interactionScenes[0]!.hasServiceInteraction === true, 'first hasServiceInteraction must be true');
  check(projection.interactionScenes[1]!.hasServiceInteraction === false, 'second hasServiceInteraction must be false');
  check(projection.narrativePackSummary !== null, 'narrativePackSummary must not be null');
  check(projection.narrativePackSummary!.packId === 'nsp-10-broker-1', 'packId must match');
  check(projection.narrativePackSummary!.actorVisibleSignalCount === 7, 'actorVisibleSignalCount must match');
  check(projection.pressureSummary.available === true, 'pressure must be available');
  check(projection.pressureSummary.snapshotCount === 3, 'pressure snapshotCount must be 3');
  check(projection.pressureSummary.decisionDeltaCount === 2, 'pressure decisionDeltaCount must be 2');
  check(projection.pressureSummary.inputCount === 5, 'pressure inputCount must be 5');
  check(projection.consensusSummary.available === true, 'consensus must be available');
  check(projection.consensusSummary.formationCount === 1, 'consensus formationCount must be 1');
  check(projection.consensusSummary.blockedCount === 1, 'consensus blockedCount must be 1');
  check(projection.llmOptionality.mode === 'disabled', 'llmOptionality must be disabled');

  // Evidence index checks
  const ei = projection.evidenceIndex;
  check(Array.isArray(ei), 'evidenceIndex must be an array');
  check(ei.length === 3, 'evidenceIndex must have 3 entries');

  const pressureRef = ei.find((r) => r.sourceType === 'pressure_receipt');
  check(pressureRef !== undefined, 'must have pressure_receipt ref');
  check(pressureRef!.sourceId === 'pressure-receipt:d10', 'pressure sourceId must be stable');
  check(pressureRef!.available === true, 'pressure must be available');
  check(pressureRef!.count === 3, 'pressure count must match snapshotCount');

  const consensusRef = ei.find((r) => r.sourceType === 'consensus_receipt');
  check(consensusRef !== undefined, 'must have consensus_receipt ref');
  check(consensusRef!.sourceId === 'consensus-receipt:d10', 'consensus sourceId must be stable');
  check(consensusRef!.available === true, 'consensus must be available');
  check(consensusRef!.count === 1, 'consensus count must match formationCount');

  const narrativeRef = ei.find((r) => r.sourceType === 'narrative_signal_pack');
  check(narrativeRef !== undefined, 'must have narrative_signal_pack ref');
  check(narrativeRef!.sourceId === 'narrative-pack:d10', 'narrative sourceId must be stable');
  check(narrativeRef!.available === true, 'narrative must be available');
  check(narrativeRef!.count === 7, 'narrative count must match signalCount');
}

function checkSparseSceneProjection() {
  const receipt = makeSparseSceneReceipt();
  const result = makeDailyTickResult(receipt);
  const projection = buildSemanticWorkspaceProjectionFromDailyTickResult(result);

  check(projection.interactionScenes.length === 2, 'sparse scenes: must have 2 scenes');
  check(projection.interactionScenes[0]!.sceneId === 'scene-no-case', 'sparse scenes: first scene id');
  check(projection.interactionScenes[0]!.caseId === undefined, 'sparse scenes: first scene has no caseId');
  check(projection.interactionScenes[0]!.hasServiceInteraction === false, 'sparse scenes: first service flag false');
  check(projection.interactionScenes[1]!.sceneId === 'scene-with-case', 'sparse scenes: second scene id');
  check(projection.interactionScenes[1]!.caseId === 'case-2', 'sparse scenes: second caseId remains index-aligned');
  check(projection.interactionScenes[1]!.hasServiceInteraction === true, 'sparse scenes: second service flag true');
}

// ---------------------------------------------------------------------------
// 2. buildSemanticWorkspaceProjectionFromState reads only state.day and state.lastDailyTickResult
// ---------------------------------------------------------------------------

function checkFromState() {
  const receipt = makeReceipt();
  const result = makeDailyTickResult(receipt);
  const state = makeGameState(result);
  const projection = buildSemanticWorkspaceProjectionFromState(state);

  check(projection.day === 10, 'state-derived day must be 10');
  check(projection.interactionScenes.length === 2, 'state-derived must have 2 scenes');
  check(projection.narrativePackSummary !== null, 'state-derived narrativePackSummary must not be null');
}

// ---------------------------------------------------------------------------
// 3. Graceful fallback when semanticReceipts is absent
// ---------------------------------------------------------------------------

function checkGracefulFallbackFromResult() {
  const result = makeDailyTickResult(); // no receipt
  const projection = buildSemanticWorkspaceProjectionFromDailyTickResult(result);

  check(projection.day === 10, 'fallback day must be 10');
  check(projection.interactionScenes.length === 0, 'fallback scenes must be empty');
  check(projection.narrativePackSummary === null, 'fallback narrativePackSummary must be null');
  check(projection.pressureSummary.available === false, 'fallback pressure must be unavailable');
  check(projection.pressureSummary.snapshotCount === 0, 'fallback pressure snapshotCount must be 0');
  check(projection.consensusSummary.available === false, 'fallback consensus must be unavailable');
  check(projection.consensusSummary.formationCount === 0, 'fallback consensus formationCount must be 0');
  check(projection.llmOptionality.mode === 'disabled', 'fallback llmOptionality must be disabled');
  check(Object.isFrozen(projection), 'fallback projection must be frozen');
}

function checkGracefulFallbackFromState() {
  const state = makeGameState(); // no lastDailyTickResult
  const projection = buildSemanticWorkspaceProjectionFromState(state);

  check(projection.day === 10, 'state-fallback day must be 10');
  check(projection.interactionScenes.length === 0, 'state-fallback scenes must be empty');
  check(projection.narrativePackSummary === null, 'state-fallback narrativePackSummary must be null');
}

function checkGracefulFallbackFromStateWithEmptyResult() {
  const result = makeDailyTickResult(); // no receipt
  const state = makeGameState(result);
  const projection = buildSemanticWorkspaceProjectionFromState(state);

  check(projection.day === 10, 'state-empty-fallback day must be 10');
  check(projection.interactionScenes.length === 0, 'state-empty-fallback scenes must be empty');
}

// ---------------------------------------------------------------------------
// 4. No raw GameState fields in output
// ---------------------------------------------------------------------------

function checkNoRawGameStateExposure() {
  const receipt = makeReceipt();
  const result = makeDailyTickResult(receipt);
  const state = makeGameState(result);
  const projection = buildSemanticWorkspaceProjectionFromState(state);
  const json = JSON.stringify(projection);

  const forbiddenPatterns = [
    'cases', 'opportunities', 'customers', 'eventStore', 'eventLog',
    'rngState', 'rngCalls', 'dirtyScopes', 'invariantAlerts',
    'processResults', 'closedDeals', 'emittedEvents',
    'askPrice', 'marketPrice', 'bottomPrice', 'customerId',
    'stageIndex', 'daysLeft', 'budgetMax',
  ];

  for (const pattern of forbiddenPatterns) {
    check(!json.includes(`"${pattern}"`), `must not expose raw ${pattern}`);
  }
}

// ---------------------------------------------------------------------------
// 5. LLM optionality is disabled/futureReady
// ---------------------------------------------------------------------------

function checkLlmOptionality() {
  const receipt = makeReceipt();
  const result = makeDailyTickResult(receipt);
  const projection = buildSemanticWorkspaceProjectionFromDailyTickResult(result);

  check(projection.llmOptionality.mode === 'disabled', 'mode must be disabled');
  check(projection.llmOptionality.noProviderRequired === true, 'noProviderRequired must be true');
  check(projection.llmOptionality.proposalCount === 0, 'proposalCount must be 0');
  check(projection.llmOptionality.canCallProvider === false, 'canCallProvider must be false');
  check(projection.llmOptionality.futureReady === true, 'futureReady must be true');
}

// ---------------------------------------------------------------------------
// 6. Deterministic output
// ---------------------------------------------------------------------------

function checkDeterministic() {
  const receipt = makeReceipt();
  const result = makeDailyTickResult(receipt);
  const state = makeGameState(result);

  const proj1 = buildSemanticWorkspaceProjectionFromDailyTickResult(result);
  const proj2 = buildSemanticWorkspaceProjectionFromDailyTickResult(result);
  const proj3 = buildSemanticWorkspaceProjectionFromState(state);
  const proj4 = buildSemanticWorkspaceProjectionFromState(state);

  check(stableSnapshot(proj1) === stableSnapshot(proj2), 'same result → same projection');
  check(stableSnapshot(proj3) === stableSnapshot(proj4), 'same state → same projection');
  check(stableSnapshot(proj1) === stableSnapshot(proj3), 'result and state paths produce same output');
}

// ---------------------------------------------------------------------------
// 7. Pure functions (no mutation)
// ---------------------------------------------------------------------------

function checkPureFunctions() {
  const receipt = makeReceipt();
  const result = makeDailyTickResult(receipt);
  const state = makeGameState(result);

  const resultBefore = stableSnapshot(result);
  const stateBefore = stableSnapshot(state);

  buildSemanticWorkspaceProjectionFromDailyTickResult(result);
  buildSemanticWorkspaceProjectionFromState(state);

  check(stableSnapshot(result) === resultBefore, 'result must not be mutated');
  check(stableSnapshot(state) === stateBefore, 'state must not be mutated');
}

// ---------------------------------------------------------------------------
// 8. Projection is frozen
// ---------------------------------------------------------------------------

function checkFrozen() {
  const receipt = makeReceipt();
  const result = makeDailyTickResult(receipt);
  const projection = buildSemanticWorkspaceProjectionFromDailyTickResult(result);

  check(Object.isFrozen(projection), 'projection must be frozen');
  check(Object.isFrozen(projection.interactionScenes), 'interactionScenes must be frozen');
  check(Object.isFrozen(projection.llmOptionality), 'llmOptionality must be frozen');
  check(Object.isFrozen(projection.pressureSummary), 'pressureSummary must be frozen');
  check(Object.isFrozen(projection.consensusSummary), 'consensusSummary must be frozen');
  if (projection.narrativePackSummary) {
    check(Object.isFrozen(projection.narrativePackSummary), 'narrativePackSummary must be frozen');
  }
}

// ---------------------------------------------------------------------------
// Run all checks
// ---------------------------------------------------------------------------

console.log('Verifying selling-houses workspace semantic composer contract...');

checkFromDailyTickResult();
checkSparseSceneProjection();
checkFromState();
checkGracefulFallbackFromResult();
checkGracefulFallbackFromState();
checkGracefulFallbackFromStateWithEmptyResult();
checkNoRawGameStateExposure();
checkLlmOptionality();
checkDeterministic();
checkPureFunctions();
checkFrozen();

console.log('');
console.log(`Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.error('FAILURES:');
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exit(1);
} else {
  console.log('selling-houses workspace semantic composer contract verification passed');
}
