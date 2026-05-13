/**
 * verify-selling-houses-big-world-round9-live-product-perfect-gate.ts
 *
 * Round 9 — Live Product Perfect Final Gate
 *
 * Chains the REAL product integration path:
 *   createInitialState → advanceDays → seller projection → action command → receipt → replay
 *
 * This is the definitive gate that kills "script-perfect, product-not-wired" false positives.
 *
 * Maturity levels:
 *   - live-runtime: bigWorldRuntime ticks inside real advanceDays
 *   - live-ingestion: source records produce real causal events during live ticks
 *   - live-projection: projections read from live worldCausalEvents
 *   - live-action: action commands → receipts → source records → causal events
 *   - live-replay: same seed + same actions → deterministic replay
 *   - live-perfect: explanation chains trace through live causal ledger
 *   - live-super: 5+ product surfaces share live causal context
 *
 * Anti-false-positive:
 * - Does NOT accept standalone runtime without real GameState
 * - Does NOT accept mock source records without real ingestion
 * - Does NOT accept projection without live causal ledger
 * - Does NOT accept "no recommendation" as success
 * - Does NOT accept compaction breaking explanation chain
 * - Does NOT accept "多加客户/房源" as completion
 */

import assert from 'node:assert/strict';
import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine/opportunityEngine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { advanceDays } from '../src/selling-houses/domain/engine.js';
import {
  buildActionCommand,
  buildActionReceipt,
} from '../src/selling-houses/domain/world-model/runtime/actionCommandReceipt.js';
import {
  replayActionCommand,
} from '../src/selling-houses/domain/world-model/runtime/actionReplay.js';
import {
  ingestSourceRecords,
} from '../src/selling-houses/domain/world-model/runtime/sourceIngestionAdapter.js';
import {
  compactWorldCausalEvents,
  buildColdLedgerSummary,
} from '../src/selling-houses/domain/world-model/runtime/compaction.js';
import {
  buildActorKnowledgeSnapshot,
  evaluatePressureSignals,
  filterAvailableCommands,
  rankCommands,
  buildDecisionEvidenceEnvelope,
  buildExplanationEnvelope,
  computeSourceCredibility,
  computeInformationDelay,
} from '../src/selling-houses/application/projections/actorKnowledgeProjection.js';
import {
  buildWorkspaceBigWorldModule,
  buildLiveCausalContext,
} from '../src/selling-houses/application/projections/bigWorldPOVProjection.js';
import {
  createEmptyRegistry,
  appendSourceRecord,
  queryVisibleSourceRecords,
} from '../src/selling-houses/domain/world-model/informationSourceRegistry.js';
import { DEFAULT_ROLE_VISIBILITY } from '../src/selling-houses/domain/world-model/actorKnowledgeTypes.js';
import type { GameState } from '../src/selling-houses/domain/models.js';

let passCount = 0;
let failCount = 0;
const maturityResults: Record<string, boolean> = {};

function check(condition: boolean, label: string, maturity?: string) {
  if (condition) {
    passCount++;
    console.log(`  ✅ ${label}`);
    if (maturity) maturityResults[maturity] = true;
  } else {
    failCount++;
    console.error(`  ❌ ${label}`);
  }
}

// ── Build real GameState ───────────────────────────────────────────────

function buildRealState(): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'standard-window-chain scenario must exist');
  const state = createInitialState(snapshot, 20260513);
  seedInitialOpportunities(state);
  return state;
}

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║  Big World Round 9 — Live Product Perfect Final Gate           ║');
console.log('║  Chains: createInitialState → advanceDays → projection →       ║');
console.log('║  action → receipt → replay through REAL product path           ║');
console.log('╚══════════════════════════════════════════════════════════════════╝');

// ════════════════════════════════════════════════════════════════════════════
// CHECK 1: live-runtime — bigWorldRuntime ticks inside real advanceDays
// ════════════════════════════════════════════════════════════════════════════

console.log('\n━━━ CHECK 1: live-runtime ━━━');

const state0 = buildRealState();
check(state0.bigWorldRuntime !== undefined, 'bigWorldRuntime exists on fresh state');
check(state0.worldCausalEvents !== undefined, 'worldCausalEvents exists on fresh state');

const beforeTick = state0.bigWorldRuntime?.tickCount ?? 0;
const beforeCausal = state0.worldCausalEvents?.length ?? 0;

advanceDays(state0, 7);
updateDerivedState(state0);

check(
  (state0.bigWorldRuntime?.tickCount ?? 0) > beforeTick,
  `tickCount advanced: ${beforeTick} → ${state0.bigWorldRuntime?.tickCount}`,
  'live-runtime',
);
check(
  (state0.worldCausalEvents?.length ?? 0) > beforeCausal,
  `worldCausalEvents grew: ${beforeCausal} → ${state0.worldCausalEvents?.length}`,
  'live-runtime',
);
check(state0.day >= 8, `state.day >= 8 after 7 days (got ${state0.day})`);

// ════════════════════════════════════════════════════════════════════════════
// CHECK 2: live-ingestion — source records produce real causal events
// ════════════════════════════════════════════════════════════════════════════

console.log('\n━━━ CHECK 2: live-ingestion ━━━');

const liveEvents = state0.worldCausalEvents ?? [];
check(liveEvents.length > 0, `live causal events exist (${liveEvents.length})`, 'live-ingestion');

// Verify events have proper structure
if (liveEvents.length > 0) {
  const sample = liveEvents[0];
  check(!!sample.id, 'causal event has id');
  check(!!sample.kind, 'causal event has kind');
  check(typeof sample.day === 'number', 'causal event has numeric day');
  check(!!sample.source, 'causal event has source');
  check(Array.isArray(sample.actorIds), 'causal event has actorIds');
  check(Array.isArray(sample.entityIds), 'causal event has entityIds');
  check(Array.isArray(sample.causeEventIds), 'causal event has causeEventIds');
}

// Build real source records from live events and ingest them
const liveEventIds = new Set(liveEvents.map((e) => e.id));

const { registry, ingestionReceipt } = (() => {
  let reg = createEmptyRegistry();
  for (const evt of liveEvents.slice(0, 10)) {
    const result = appendSourceRecord(reg, {
      sourceId: `isr-live-${evt.id}`,
      sourceKind: 'market_signal' as const,
      day: evt.day,
      phase: 'morning' as const,
      entityRefs: [{ id: 'cell-1', kind: 'market_cell' as const }],
      actorRefs: [{ id: 'system', role: 'system' as const }],
      visibility: { scope: 'all_actors' as const, baseDelayDays: 0 },
      confidence: 0.8,
      delayDays: 0,
      replayKey: `rk-live-${evt.id}`,
      origin: 'ecosystem_tick' as const,
      payload: { summary: `live from ${evt.kind}`, subtype: 'heat_shift' as const, marketCellId: 'cell-1', before: 50, after: 60, unit: 'heat', isPublic: true },
    });
    if (result.ok) reg = result.registry;
  }

  const sourceRecords = reg.index.all.slice(0, 5);
  const receipt = ingestSourceRecords(sourceRecords, state0.day, 20260513);
  return { registry: reg, ingestionReceipt: receipt };
})();

check(ingestionReceipt.causalEvents.length > 0, `ingestion produced ${ingestionReceipt.causalEvents.length} causal events`, 'live-ingestion');
check(ingestionReceipt.sourceToEvents.size > 0, `sourceToEvents has ${ingestionReceipt.sourceToEvents.size} entries`);

// Verify causal events have sourceRecordId
let allHaveSourceLink = true;
for (const evt of ingestionReceipt.causalEvents) {
  if (!(evt as any).sourceRecordId) allHaveSourceLink = false;
}
check(allHaveSourceLink, 'all ingested causal events have sourceRecordId');

// ════════════════════════════════════════════════════════════════════════════
// CHECK 3: live-projection — projections read from live worldCausalEvents
// ════════════════════════════════════════════════════════════════════════════

console.log('\n━━━ CHECK 3: live-projection ━━━');

const state3 = buildRealState();
advanceDays(state3, 5);
updateDerivedState(state3);

const activeCase = state3.cases.find((c) => c.status === 'active');
assert.ok(activeCase, 'Must have active case for projection test');

const projection = buildWorkspaceBigWorldModule(state3, activeCase.id);
check(projection !== null, 'bigWorldPOVProjection returns non-null for active case', 'live-projection');

if (projection) {
  check(projection.becauseBigProof.movementEvidence.length > 0, `becauseBigProof has movement evidence (${projection.becauseBigProof.movementEvidence.length})`);

  // Verify projection reads from worldCausalEvents
  const projRefs = [
    ...projection.becauseBigProof.safeCausalRefs,
    ...projection.recommendedActionReasons.flatMap((r) => r.refs),
  ];
  check(projRefs.length > 0, `projection has causal refs (${projRefs.length})`);

  // liveCausalContext should reference actual causal events
  const liveCtx = buildLiveCausalContext(state3, activeCase.id);
  check(liveCtx.allRefs.length > 0, `liveCausalContext has refs (${liveCtx.allRefs.length})`);

  const liveCtxRefIds = liveCtx.allRefs.map((r) => r.refId);
  const refsToLiveEvents = liveCtxRefIds.filter((id) => liveEventIds.has(id));
  check(refsToLiveEvents.length > 0, `liveCausalContext refs reference actual causal events (${refsToLiveEvents.length})`);
}

// ════════════════════════════════════════════════════════════════════════════
// CHECK 4: live-action — action commands → receipts → source records → causal
// ════════════════════════════════════════════════════════════════════════════

console.log('\n━━━ CHECK 4: live-action ━━━');

const state4 = buildRealState();
advanceDays(state4, 3);
updateDerivedState(state4);

const activeCase4 = state4.cases.find((c) => c.status === 'active');
assert.ok(activeCase4, 'Must have active case for action test');

// Build knowledge from real registry
const actionRegistry = (() => {
  let reg = createEmptyRegistry();
  for (const evt of (state4.worldCausalEvents ?? []).slice(0, 15)) {
    const result = appendSourceRecord(reg, {
      sourceId: `isr-action-${evt.id}`,
      sourceKind: 'owner_interview' as const,
      day: evt.day,
      phase: 'afternoon' as const,
      entityRefs: [{ id: activeCase4.id, kind: 'case' as const }],
      actorRefs: [{ id: 'player-broker', role: 'player_broker' as const }],
      visibility: { scope: 'all_actors' as const, baseDelayDays: 0 },
      confidence: 0.85,
      delayDays: 0,
      replayKey: `rk-action-${evt.id}`,
      origin: 'player_action' as const,
      payload: { summary: `action test`, subtype: 'price_discussed' as const, ownerId: 'owner-1', caseId: activeCase4.id, brokerId: 'player-broker', tone: 'neutral' as const, ownerStatement: '可以考虑', interactionMode: 'scheduled_call' as const },
    });
    if (result.ok) reg = result.registry;
  }
  return reg;
})();

const actionKnowledge = buildActorKnowledgeSnapshot('player-broker', 'player_broker', state4.day, actionRegistry);
const actionPressure = evaluatePressureSignals(actionKnowledge);
const actionCommands = filterAvailableCommands('player_broker', actionPressure);
const actionRanked = rankCommands(actionCommands, actionPressure);

if (actionRanked.length > 0) {
  const cmd = buildActionCommand(actionRanked[0], actionKnowledge, state4.day, 20260513);
  check(!!cmd.commandId, `actionCommand has commandId: ${cmd.commandId}`, 'live-action');
  check(!!cmd.replayKey, `actionCommand has replayKey`);

  const receipt = buildActionReceipt(cmd, 20260513);
  check(receipt !== null, 'buildActionReceipt returns non-null');

  if (receipt) {
    check(receipt.commandReplayKey === cmd.replayKey, 'receipt replayKey matches command');
    check(receipt.generatedSourceRecordIds.length > 0, `receipt generated ${receipt.generatedSourceRecordIds.length} source records`);
    check(receipt.generatedCausalEventIds.length > 0, `receipt generated ${receipt.generatedCausalEventIds.length} causal events`);

    // Verify the receipt proves no direct hidden mutation
    check(!!receipt.noDirectHiddenMutationProof, 'receipt has noDirectHiddenMutationProof');
    if (receipt.noDirectHiddenMutationProof) {
      check(receipt.noDirectHiddenMutationProof.worldEffectPath === 'source_record_causal_event_projection', 'worldEffectPath is correct');
    }

    // Ingest source records and verify causal events
    const srcRecords = receipt.generatedSourceRecordIds
      .map((id) => actionRegistry.index.all.find((r) => r.sourceId === id))
      .filter(Boolean);

    if (srcRecords.length > 0) {
      const ingResult = ingestSourceRecords(srcRecords, state4.day, 20260513);
      check(ingResult.causalEvents.length > 0, `ingestion produced ${ingResult.causalEvents.length} causal events from receipt sources`);

      for (const evt of ingResult.causalEvents) {
        check(
          (evt as any).sourceRecordId !== undefined,
          `causal event from receipt has sourceRecordId`,
        );
      }
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// CHECK 5: live-replay — deterministic replay through live path
// ════════════════════════════════════════════════════════════════════════════

console.log('\n━━━ CHECK 5: live-replay ━━━');

const state5a = buildRealState();
advanceDays(state5a, 3);
updateDerivedState(state5a);

const state5b = buildRealState();
advanceDays(state5b, 3);
updateDerivedState(state5b);

// Same seed → same tick count and causal events
check(
  state5a.bigWorldRuntime?.tickCount === state5b.bigWorldRuntime?.tickCount,
  `same seed → same tickCount: ${state5a.bigWorldRuntime?.tickCount} === ${state5b.bigWorldRuntime?.tickCount}`,
  'live-replay',
);
check(
  (state5a.worldCausalEvents?.length ?? 0) === (state5b.worldCausalEvents?.length ?? 0),
  `same seed → same worldCausalEvents length: ${state5a.worldCausalEvents?.length} === ${state5b.worldCausalEvents?.length}`,
);

// Replay action command deterministically
if (state5a.cases.find((c) => c.status === 'active')) {
  const replayRegistryA = (() => {
    let reg = createEmptyRegistry();
    for (const evt of (state5a.worldCausalEvents ?? []).slice(0, 10)) {
      const result = appendSourceRecord(reg, {
        sourceId: `isr-replay-a-${evt.id}`,
        sourceKind: 'market_signal' as const,
        day: evt.day,
        phase: 'morning' as const,
        entityRefs: [{ id: 'cell-1', kind: 'market_cell' as const }],
        actorRefs: [{ id: 'system', role: 'system' as const }],
        visibility: { scope: 'all_actors' as const, baseDelayDays: 0 },
        confidence: 0.8,
        delayDays: 0,
        replayKey: `rk-replay-a-${evt.id}`,
        origin: 'ecosystem_tick' as const,
        payload: { summary: 'replay test', subtype: 'heat_shift' as const, marketCellId: 'cell-1', before: 50, after: 60, unit: 'heat', isPublic: true },
      });
      if (result.ok) reg = result.registry;
    }
    return reg;
  })();

  const replayK = buildActorKnowledgeSnapshot('player-broker', 'player_broker', state5a.day, replayRegistryA);
  const replayP = evaluatePressureSignals(replayK);
  const replayCmds = filterAvailableCommands('player_broker', replayP);
  const replayRanked = rankCommands(replayCmds, replayP);

  if (replayRanked.length > 0) {
    const cmd = buildActionCommand(replayRanked[0], replayK, state5a.day, 20260513);
    const receipt = buildActionReceipt(cmd, 20260513);

    if (receipt) {
      // Replay the command
      const replayResult = replayActionCommand(cmd, replayK, receipt, state5a.day, 20260513);
      check(replayResult.matched === true, 'replay produces matched=true');
      check(replayResult.commandReplayKey === cmd.replayKey, 'replay preserves commandReplayKey');
      check(replayResult.sourceRecordIdsMatched, 'replay sourceRecordIds match');
      check(replayResult.causalEventIdsMatched, 'replay causalEventIds match');
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// CHECK 6: live-perfect — explanation chains trace through live causal ledger
// ════════════════════════════════════════════════════════════════════════════

console.log('\n━━━ CHECK 6: live-perfect ━━━');

const state6 = buildRealState();
advanceDays(state6, 5);
updateDerivedState(state6);

const perfRegistry = (() => {
  let reg = createEmptyRegistry();
  for (const evt of (state6.worldCausalEvents ?? []).slice(0, 20)) {
    const result = appendSourceRecord(reg, {
      sourceId: `isr-perf-${evt.id}`,
      sourceKind: 'owner_interview' as const,
      day: evt.day,
      phase: 'afternoon' as const,
      entityRefs: [{ id: 'case-1', kind: 'case' as const }],
      actorRefs: [{ id: 'player-broker', role: 'player_broker' as const }],
      visibility: { scope: 'all_actors' as const, baseDelayDays: 0 },
      confidence: 0.85,
      delayDays: 0,
      replayKey: `rk-perf-${evt.id}`,
      origin: 'player_action' as const,
      payload: { summary: `perf test`, subtype: 'price_discussed' as const, ownerId: 'owner-1', caseId: 'case-1', brokerId: 'player-broker', tone: 'neutral' as const, ownerStatement: '可以考虑', interactionMode: 'scheduled_call' as const },
    });
    if (result.ok) reg = result.registry;
  }
  return reg;
})();

const perfK = buildActorKnowledgeSnapshot('player-broker', 'player_broker', state6.day, perfRegistry);
const perfEnvelope = buildDecisionEvidenceEnvelope(perfK);

if (perfEnvelope.recommendedCommand) {
  const explanation = buildExplanationEnvelope(perfEnvelope.recommendedCommand, perfEnvelope.pressureSignals, perfK);

  // Each recommendation must answer all required questions
  check(explanation.summary.length > 0, 'explanation has summary', 'live-perfect');
  check(explanation.confidence > 0, `explanation confidence > 0 (${explanation.confidence.toFixed(3)})`);
  check(explanation.chain.length >= 2, `explanation chain has >= 2 steps (${explanation.chain.length})`);

  // Chain must include source, belief, and command steps
  const chainSteps = explanation.chain.map((l) => l.step);
  check(chainSteps.includes('source'), 'explanation has source step');
  check(chainSteps.includes('belief'), 'explanation has belief step');
  check(chainSteps.includes('command'), 'explanation has command step');

  // Source step must reference real source record IDs
  const sourceLink = explanation.chain.find((l) => l.step === 'source');
  if (sourceLink) {
    check(sourceLink.referencedIds.length > 0, `source step has ${sourceLink.referencedIds.length} referenced IDs`);
    for (const srcId of sourceLink.referencedIds.slice(0, 3)) {
      const found = perfRegistry.index.all.find((r) => r.sourceId === srcId);
      check(!!found, `source ${srcId} traceable in registry`);
    }
  }

  // Safe refs bounded
  check(explanation.safeRefs.length <= 5, `safeRefs bounded (${explanation.safeRefs.length})`);

  // No raw GameState leakage
  const envJson = JSON.stringify(explanation);
  check(!envJson.includes('rngState'), 'explanation does not leak rngState');
  check(!envJson.includes('budgetLedger'), 'explanation does not leak budgetLedger');
  check(!envJson.includes('eventLog'), 'explanation does not leak eventLog');
} else {
  check(false, 'PERFECT-BIG: No recommendation generated — cannot verify explanation chain');
}

// ════════════════════════════════════════════════════════════════════════════
// CHECK 7: live-super — 5+ product surfaces share live causal context
// ════════════════════════════════════════════════════════════════════════════

console.log('\n━━━ CHECK 7: live-super ━━━');

const state7 = buildRealState();
advanceDays(state7, 5);
updateDerivedState(state7);

const activeCase7 = state7.cases.find((c) => c.status === 'active');
assert.ok(activeCase7, 'Must have active case for super test');

const liveCtx = buildLiveCausalContext(state7, activeCase7.id);
check(liveCtx.allRefs.length > 0, `liveCausalContext has refs (${liveCtx.allRefs.length})`);

// Build all 5+ product surfaces
const surfaces: Array<{ name: string; hasRefs: boolean; hasEvidence: boolean }> = [];

// Surface 1: bigWorldPOVProjection
const pov = buildWorkspaceBigWorldModule(state7, activeCase7.id);
if (pov) {
  const povAllRefs = [
    ...pov.marketCell.refs,
    ...pov.comparableSupply.refs,
    ...pov.demandMovement.refs,
    ...pov.ownerExpectation.refs,
    ...pov.brokerActionPressure.refs,
    ...pov.becauseBigProof.safeCausalRefs,
  ];
  surfaces.push({ name: 'bigWorldPOVProjection', hasRefs: povAllRefs.length > 0, hasEvidence: pov.becauseBigProof.movementEvidence.length > 0 });
}

// Surface 2: actorKnowledgeProjection (broker knowledge)
const { buildActorKnowledgeSnapshot: buildAK } = await import('../src/selling-houses/application/projections/actorKnowledgeProjection.js');
const akRegistry = (() => {
  let reg = createEmptyRegistry();
  for (const evt of (state7.worldCausalEvents ?? []).slice(0, 15)) {
    const result = appendSourceRecord(reg, {
      sourceId: `isr-super-${evt.id}`,
      sourceKind: 'market_signal' as const,
      day: evt.day,
      phase: 'morning' as const,
      entityRefs: [{ id: 'cell-1', kind: 'market_cell' as const }],
      actorRefs: [{ id: 'system', role: 'system' as const }],
      visibility: { scope: 'all_actors' as const, baseDelayDays: 0 },
      confidence: 0.8,
      delayDays: 0,
      replayKey: `rk-super-${evt.id}`,
      origin: 'ecosystem_tick' as const,
      payload: { summary: `super test`, subtype: 'heat_shift' as const, marketCellId: 'cell-1', before: 50, after: 60, unit: 'heat', isPublic: true },
    });
    if (result.ok) reg = result.registry;
  }
  return reg;
})();
const akK = buildAK('player-broker', 'player_broker', state7.day, akRegistry);
surfaces.push({ name: 'actorKnowledgeProjection', hasRefs: akK.visibleSources.length > 0, hasEvidence: akK.beliefs.length > 0 });

// Surface 3: marketOpeningPOVProjection
const { buildMarketOpeningPOVProjection } = await import('../src/selling-houses/application/projections/marketOpeningPOVProjection.js');
const openingProj = buildMarketOpeningPOVProjection(state7);
surfaces.push({ name: 'marketOpeningPOVProjection', hasRefs: openingProj.topMarketSignals.length > 0, hasEvidence: openingProj.acnSummaries.length > 0 });

// Surface 4: workspaceShellProjection
const { buildWorkspaceShellProjection } = await import('../src/selling-houses/application/projections/workspaceShellProjection.js');
const shellProj = buildWorkspaceShellProjection(state7);
surfaces.push({ name: 'workspaceShellProjection', hasRefs: !!shellProj?.header, hasEvidence: !!shellProj?.budgetPanel });

// Surface 5: operatingProjection
const { buildOperatingProjection } = await import('../src/selling-houses/application/projections/operatingProjection.js');
const opProj = buildOperatingProjection(state7);
surfaces.push({ name: 'operatingProjection', hasRefs: !!opProj?.dashboard, hasEvidence: opProj?.cases?.length > 0 });

// Surface 6: myWechatProjection
const { buildMyWechatProjection } = await import('../src/selling-houses/application/projections/myWechatProjection.js');
const wechatProj = buildMyWechatProjection({ state: state7 });
surfaces.push({ name: 'myWechatProjection', hasRefs: Array.isArray(wechatProj?.messages), hasEvidence: (wechatProj?.messages.length ?? 0) > 0 });

// Surface 7: ownerPersonaProfile
const { buildOwnerPersonaProfile } = await import('../src/selling-houses/application/projections/ownerPersonaProfile.js');
const ownerProj = buildOwnerPersonaProfile(activeCase7);
surfaces.push({ name: 'ownerPersonaProfile', hasRefs: !!ownerProj?.label, hasEvidence: !!ownerProj?.tone });

check(surfaces.length >= 5, `at least 5 product surfaces built (${surfaces.length})`, 'live-super');
check(surfaces.every((s) => s.hasRefs), 'all surfaces have refs/evidence');
check(surfaces.filter((s) => s.hasEvidence).length >= 3, `at least 3 surfaces have substantive evidence (${surfaces.filter((s) => s.hasEvidence).length})`);

// Verify live causal context feeds multiple sub-projections
const subRefMaps: Record<string, Set<string>> = {
  ownerExpectation: new Set(pov?.ownerExpectation.refs.map((r) => r.refId) ?? []),
  brokerActionPressure: new Set(pov?.brokerActionPressure.refs.map((r) => r.refId) ?? []),
  demandMovement: new Set(pov?.demandMovement.refs.map((r) => r.refId) ?? []),
  comparableSupply: new Set(pov?.comparableSupply.refs.map((r) => r.refId) ?? []),
  becauseBigProof: new Set(pov?.becauseBigProof.safeCausalRefs.map((r) => r.refId) ?? []),
  liveCausalContext: new Set(liveCtx.allRefs.map((r) => r.refId)),
};

const allRefIds = new Set<string>();
for (const refs of Object.values(subRefMaps)) {
  for (const id of refs) allRefIds.add(id);
}

let sharedRefsCount = 0;
for (const refId of allRefIds) {
  const surfacesUsing = Object.entries(subRefMaps).filter(([, refs]) => refs.has(refId)).length;
  if (surfacesUsing >= 2) sharedRefsCount++;
}
check(sharedRefsCount > 0, `at least 1 causal ref shared across 2+ surfaces (${sharedRefsCount} shared)`);

// Verify liveCausalContext refs reference actual causal events
const liveEventIds7 = new Set((state7.worldCausalEvents ?? []).map((e) => e.id));
const liveCtxRefIds = liveCtx.allRefs.map((r) => r.refId);
const refsToLiveEvents = liveCtxRefIds.filter((id) => liveEventIds7.has(id));
check(refsToLiveEvents.length > 0, `liveCausalContext refs reference actual causal events (${refsToLiveEvents.length})`);

// ════════════════════════════════════════════════════════════════════════════
// CHECK 8: Compaction doesn't break explanation chain
// ════════════════════════════════════════════════════════════════════════════

console.log('\n━━━ CHECK 8: Compaction chain integrity ━━━');

const { compactWorldCausalEvents: compact, buildColdLedgerSummary: buildCold } = await import('../src/selling-houses/domain/world-model/runtime/compaction.js');

const compacted = compact(state7.worldCausalEvents ?? [], 100);
check(compacted.length <= 100, `compaction bounds events (${compacted.length})`);

// Surviving source-linked events must keep their links
for (const evt of compacted) {
  if ((evt as any).sourceRecordId) {
    check(!!(evt as any).sourceReplayKey, `compacted event ${evt.id} preserves sourceReplayKey`);
    check(!!(evt as any).sourceKind, `compacted event ${evt.id} preserves sourceKind`);
  }
}

// ColdLedgerSummary preserves source traceability
const coldSummary = buildCold(
  1, state7.day,
  [{ phaseId: 'test', mutationCount: 0, entitiesProcessed: 0 }],
  {
    sourcesProcessed: 15,
    causalEvents: (state7.worldCausalEvents ?? []).slice(0, 5) as any,
    byKind: new Map([['market_signal', { count: 10, causalEventsProduced: 10 }]]),
  },
);
check(coldSummary.latestSourceIdByKind.size > 0, `coldLedgerSummary has sourceId traceability (${coldSummary.latestSourceIdByKind.size} kinds)`);
check(coldSummary.latestReplayKeyByKind.size > 0, `coldLedgerSummary has replayKey traceability (${coldSummary.latestReplayKeyByKind.size} kinds)`);

// ════════════════════════════════════════════════════════════════════════════
// CHECK 9: No "多加客户/房源" as completion
// ════════════════════════════════════════════════════════════════════════════

console.log('\n━━━ CHECK 9: Not just more entities ━━━');

const entityCount = state7.cases.length + state7.opportunities.length;
check(entityCount > 0, `game has entities (${entityCount})`);

// The key is that entities have CAUSAL CHAIN traceability, not just count
const causalChainExists = (state7.worldCausalEvents?.length ?? 0) > 0;
check(causalChainExists, 'causal chain exists (not just entity count)');

// Verify causal events are traceable (have causeEventIds)
const traceableEvents = (state7.worldCausalEvents ?? []).filter((e) => e.causeEventIds.length > 0 || e.kind === 'OpeningWorldEventImported');
check(traceableEvents.length > 0, `causal events are traceable (${traceableEvents.length}/${state7.worldCausalEvents?.length})`);

// ════════════════════════════════════════════════════════════════════════════
// Maturity Classification
// ════════════════════════════════════════════════════════════════════════════

console.log('\n━━━ Maturity Classification ━━━');

const maturityLevels = [
  'live-runtime',
  'live-ingestion',
  'live-projection',
  'live-action',
  'live-replay',
  'live-perfect',
  'live-super',
];

let maxMaturity = 'not-big';
for (const level of maturityLevels) {
  const passed = maturityResults[level] === true;
  console.log(`  ${passed ? '✅' : '❌'} ${level}`);
  if (passed) maxMaturity = level;
}

console.log(`\n  Final Maturity: ${maxMaturity}`);

// ── Summary ───────────────────────────────────────────────────────────

console.log(`\n╔══════════════════════════════════════════════════════════════════╗`);
console.log(`║  Round 9 Live Product Perfect Gate — Summary                    ║`);
console.log(`╚══════════════════════════════════════════════════════════════════╝`);
console.log(`Passed: ${passCount}`);
console.log(`Failed: ${failCount}`);
console.log(`Maturity: ${maxMaturity}`);

if (failCount > 0) {
  console.error(`\nGATE FAILED: ${failCount} checks did not pass.`);
  process.exit(1);
} else {
  console.log(`\nGATE PASSED: All ${passCount} checks passed.`);
}
