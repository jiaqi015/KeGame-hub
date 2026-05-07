/**
 * DailySemanticReceipt v0 — read-only semantic receipt summaries for DailyTickResult.
 *
 * Mother model alignment:
 * - Section 7: "DomainEvents + EvaluationSnapshots + ProcessReceipts + POVSnapshot
 *   -> NarrativeSignalPack -> LLM text generation"
 * - Section 18.10: "LLM output cannot be hidden randomness inside core simulation.
 *   For replay, store action commands, seeds/RNG counters, model versions, and any
 *   LLM-derived structured outputs used by simulation."
 * - Section 20.7: "LLM should not read raw GameState. Use deterministic signal extractor first."
 *
 * Hard constraints:
 * 1. Optional field on DailyTickResult — old saves without it are fine.
 * 2. Read-only summary/ref data only — no full objects, no embedded GameState.
 * 3. Does NOT participate in any decision. Does NOT affect gameplay.
 * 4. Deterministic: no Date.now, no Math.random, no provider/model call.
 * 5. Compatible with old saves: missing fields → empty summary.
 * 6. runtime/simulation can import domain/core/runtime.
 */

import type {
  GameState,
} from '../../domain/models.js';

import type {
  InteractionScene,
} from '../../core/world-state/interactions/models.js';

import type {
  NarrativeSignalPack,
} from '../../core/narrative/models.js';

import type {
  PressureReceiptBundle,
} from '../../core/world-state/competition/models.js';

import type {
  DailySemanticReceiptBundle,
  InteractionSceneReceiptSummary,
  NarrativeSignalPackReceiptSummary,
  PressureReceiptSummaryRef,
  ConsensusReceiptSummaryRef,
  LivePressureReceiptInput,
  LiveConsensusReceiptInput,
  LiveSemanticReceiptInput,
} from '../../core/world-state/semantic-receipt/models.js';

import {
  buildEmptySemanticReceipt,
  buildLiveSemanticReceipt,
} from '../../core/world-state/semantic-receipt/models.js';

import {
  buildNarrativeSignalPackContentHash,
} from '../../core/narrative/packHash.js';

// Re-export core types and builders for convenience
export type {
  DailySemanticReceiptBundle,
  InteractionSceneReceiptSummary,
  NarrativeSignalPackReceiptSummary,
  PressureReceiptSummaryRef,
  ConsensusReceiptSummaryRef,
  LivePressureReceiptInput,
  LiveConsensusReceiptInput,
  LiveSemanticReceiptInput,
};

export { buildEmptySemanticReceipt, buildLiveSemanticReceipt };

// ---------------------------------------------------------------------------
// Plain input shapes (no raw GameState dependency in builder)
// ---------------------------------------------------------------------------

export interface SemanticReceiptBuildInput {
  readonly day: number;
  readonly interactionScenes: readonly InteractionScene[];
  readonly narrativeSignalPack?: NarrativeSignalPack;
  readonly pressureReceipts?: PressureReceiptBundle;
  readonly consensusFormationCount?: number;
  readonly consensusSignedCount?: number;
  readonly consensusCollapsedCount?: number;
  readonly consensusBlockedCount?: number;
  readonly consensusStillPendingCount?: number;
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function buildInteractionSceneReceiptSummary(
  scenes: readonly InteractionScene[],
): InteractionSceneReceiptSummary {
  const sceneIds: string[] = [];
  const sceneTypes: string[] = [];
  const caseIds: string[] = [];
  const primaryActorIds: string[] = [];
  const hasServiceInteractionFlags: boolean[] = [];
  let hasServiceInteractionCount = 0;

  for (const scene of scenes) {
    sceneIds.push(scene.sceneId);
    sceneTypes.push(scene.sceneType);
    caseIds.push(scene.caseId ?? '');
    primaryActorIds.push(scene.primaryActorId);
    const hasInteraction = !!scene.serviceInteraction;
    hasServiceInteractionFlags.push(hasInteraction);
    if (hasInteraction) hasServiceInteractionCount++;
  }

  return Object.freeze({
    sceneCount: scenes.length,
    sceneIds: Object.freeze([...sceneIds]),
    sceneTypes: Object.freeze([...sceneTypes]),
    caseIds: Object.freeze([...caseIds]),
    primaryActorIds: Object.freeze([...primaryActorIds]),
    hasServiceInteractionCount,
    hasServiceInteractionFlags: Object.freeze([...hasServiceInteractionFlags]),
  });
}

function buildNarrativeSignalPackReceiptSummary(
  pack: NarrativeSignalPack | undefined,
  day: number,
): NarrativeSignalPackReceiptSummary {
  if (!pack) {
    return Object.freeze({
      packId: `narrative-pack:none:d${day}`,
      packHash: 'none',
      sourceRefCount: 0,
      evidenceRefCount: 0,
      signalCount: 0,
      timelineAnchorCount: 0,
      actorId: 'none',
      actorKind: 'broker',
    });
  }

  const sourceRefCount = (pack.actorVisibleSignals ?? []).length;
  const evidenceRefCount = (pack.actorVisibleSignals ?? []).reduce(
    (sum, s) => sum + (s.evidenceRefs ?? []).length,
    0,
  );

  const packHash = buildNarrativeSignalPackContentHash(pack);

  return Object.freeze({
    packId: pack.packId ?? `narrative-pack:d${day}`,
    packHash,
    sourceRefCount,
    evidenceRefCount,
    signalCount: sourceRefCount,
    timelineAnchorCount: (pack.timelineAnchors ?? []).length,
    actorId: pack.generatedForActorId ?? 'unknown',
    actorKind: pack.generatedForActorKind ?? 'broker',
  });
}

function buildPressureReceiptSummaryRef(
  pressure: PressureReceiptBundle | undefined,
  day: number,
): PressureReceiptSummaryRef {
  if (!pressure) {
    return Object.freeze({
      available: false,
      snapshotCount: 0,
      decisionDeltaCount: 0,
      inputCount: 0,
      day,
    });
  }

  return Object.freeze({
    available: true,
    snapshotCount: (pressure.snapshots ?? []).length,
    decisionDeltaCount: (pressure.decisionDeltas ?? []).length,
    inputCount: pressure.inputCount ?? 0,
    day: pressure.day ?? 0,
  });
}

function buildConsensusReceiptSummaryRef(
  input: SemanticReceiptBuildInput,
): ConsensusReceiptSummaryRef {
  const hasData = (input.consensusFormationCount ?? 0) > 0;

  return Object.freeze({
    available: hasData,
    formationCount: input.consensusFormationCount ?? 0,
    signedCount: input.consensusSignedCount ?? 0,
    collapsedCount: input.consensusCollapsedCount ?? 0,
    blockedCount: input.consensusBlockedCount ?? 0,
    stillPendingCount: input.consensusStillPendingCount ?? 0,
    day: input.day,
  });
}

// ---------------------------------------------------------------------------
// Public API: buildDailySemanticReceipt
// ---------------------------------------------------------------------------

export function buildDailySemanticReceipt(
  input: SemanticReceiptBuildInput,
): DailySemanticReceiptBundle {
  const interactionScenes = buildInteractionSceneReceiptSummary(input.interactionScenes);
  const narrativeSignalPack = buildNarrativeSignalPackReceiptSummary(
    input.narrativeSignalPack,
    input.day,
  );
  const pressureReceipts = buildPressureReceiptSummaryRef(input.pressureReceipts, input.day);
  const consensusReceipts = buildConsensusReceiptSummaryRef(input);

  const llmReady = interactionScenes.sceneCount > 0 && narrativeSignalPack.signalCount > 0;

  return Object.freeze({
    day: input.day,
    interactionScenes,
    narrativeSignalPack,
    pressureReceipts,
    consensusReceipts,
    llmReady,
  });
}

// ---------------------------------------------------------------------------
// Public API: buildDailySemanticReceiptFromGameState
// ---------------------------------------------------------------------------

export function buildDailySemanticReceiptFromGameState(
  state: GameState,
  scenes: readonly InteractionScene[] = [],
  narrativePack?: NarrativeSignalPack,
  pressureReceipts?: PressureReceiptBundle,
): DailySemanticReceiptBundle {
  return buildDailySemanticReceipt({
    day: state.day,
    interactionScenes: scenes,
    narrativeSignalPack: narrativePack,
    pressureReceipts: pressureReceipts,
  });
}

// buildEmptySemanticReceipt is re-exported from core/world-state/semantic-receipt/models.js
