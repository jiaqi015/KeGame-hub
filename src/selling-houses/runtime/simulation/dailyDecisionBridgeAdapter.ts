/**
 * DailyDecisionBridge Runtime Adapter v0 — composes bridge input from
 * existing deterministic runtime artifacts.
 *
 * Mother model alignment:
 * - Section 9: POV → ImmersiveInteractionScene → DecisionMoment / Action
 * - Section 18.10: replayable, no wall-clock
 * - Section 20.7: deterministic signal extractor, no raw GameState
 *
 * Hard constraints:
 * 1. Pure functions — no mutation of GameState or DailyTickResult.
 * 2. Deterministic: stable ordering by caseId/sourceId.
 * 3. Only lightweight summary/ref — no full ActorBelief, CommitmentState,
 *    AttentionState, InteractionScene, or GameState objects.
 * 4. No LLM/fetch/provider calls.
 * 5. Graceful fallback when POV/semantic input pack is absent.
 * 6. Does NOT rewrite resolveOneDay, alter tick order/RNG, or affect gameplay.
 */

import type {
  BrokerPOVSnapshot,
  CasePOVContext,
} from '../../core/decision/models.js';

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
  DailyDecisionBridgeSummary,
  DailyCaseDecisionSummary,
  DailyDecisionMovedField,
  DailyDecisionWhyRef,
  DailyDecisionBlockerRef,
  DailyDecisionCommitmentRef,
  DailyActorPovChangeSummary,
  DailyBeliefChangeRef,
  DailySignalChangeRef,
  DailyRecommendationSummary,
  DailyDecisionBridgeInput,
  DailyOperatingMovementSummary,
  DailyCaseOperatingMovement,
  DailyMovementEntry,
  DailyMovementKind,
  DailyMovementDirection,
  DailyMovementMagnitude,
} from '../../core/world-state/semantic-receipt/dailyDecisionBridge.js';

import {
  buildEmptyDailyDecisionBridgeSummary,
  buildDailyDecisionBridgeSummary,
} from '../../core/world-state/semantic-receipt/dailyDecisionBridge.js';

import type {
  SemanticReceiptInputPack,
} from './semanticReceiptInputComposer.js';

import {
  buildDecisionSupportContextFromLegacyState,
} from '../decision-support/legacyAdapter.js';

import {
  buildBrokerPOVSnapshot,
} from '../decision-support/povAdapter.js';

import type {
  GameState,
} from '../../domain/models.js';

// Re-export core types for consumers
export type {
  DailyDecisionBridgeSummary,
  DailyCaseDecisionSummary,
  DailyDecisionMovedField,
  DailyDecisionWhyRef,
  DailyDecisionBlockerRef,
  DailyDecisionCommitmentRef,
  DailyActorPovChangeSummary,
  DailyBeliefChangeRef,
  DailySignalChangeRef,
  DailyRecommendationSummary,
  DailyDecisionBridgeInput,
};

export { buildEmptyDailyDecisionBridgeSummary, buildDailyDecisionBridgeSummary };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freezeArray<T>(items: readonly T[]): readonly T[] {
  return Object.freeze([...items]) as readonly T[];
}

// ---------------------------------------------------------------------------
// Per-case builders
// ---------------------------------------------------------------------------

function buildMovedFieldsForCase(
  casePOV: CasePOVContext,
): readonly DailyDecisionMovedField[] {
  const fields: DailyDecisionMovedField[] = [];

  // D1 demand momentum
  fields.push(Object.freeze({
    field: 'd1',
    newValue: casePOV.assetScore.d1,
    delta: 0,
    reason: `需求动量 D1=${casePOV.assetScore.d1}`,
  }) as DailyDecisionMovedField);

  // D2 asset quality
  fields.push(Object.freeze({
    field: 'd2',
    newValue: casePOV.assetScore.d2,
    delta: 0,
    reason: `资产质量 D2=${casePOV.assetScore.d2}`,
  }) as DailyDecisionMovedField);

  // D3 owner-side deal readiness
  fields.push(Object.freeze({
    field: 'd3',
    newValue: casePOV.assetScore.d3,
    delta: 0,
    reason: `成交条件 D3=${casePOV.assetScore.d3}`,
  }) as DailyDecisionMovedField);

  // D4 if available
  if (casePOV.assetScore.d4 !== undefined) {
    fields.push(Object.freeze({
      field: 'd4',
      newValue: casePOV.assetScore.d4,
      delta: 0,
      reason: `竞争与服务路径 D4=${casePOV.assetScore.d4}`,
    }) as DailyDecisionMovedField);
  }

  // Trust
  fields.push(Object.freeze({
    field: 'trust',
    newValue: casePOV.ownerReadiness.trust,
    delta: 0,
    reason: `业主信任度 ${casePOV.ownerReadiness.trust}/100`,
  }) as DailyDecisionMovedField);

  // Urgency
  fields.push(Object.freeze({
    field: 'urgency',
    newValue: casePOV.ownerReadiness.urgency,
    delta: 0,
    reason: `业主紧迫度 ${casePOV.ownerReadiness.urgency}/100`,
  }) as DailyDecisionMovedField);

  // Patience
  fields.push(Object.freeze({
    field: 'patience',
    newValue: casePOV.ownerReadiness.patience,
    delta: 0,
    reason: `业主耐心 ${casePOV.ownerReadiness.patience}/100`,
  }) as DailyDecisionMovedField);

  // Competitiveness
  fields.push(Object.freeze({
    field: 'competitiveness',
    newValue: casePOV.assetScore.score,
    delta: 0,
    reason: `房源竞争力 ${casePOV.assetScore.score}/100`,
  }) as DailyDecisionMovedField);

  return freezeArray(fields);
}

function buildWhyRefsForCase(
  casePOV: CasePOVContext,
  scenes: readonly InteractionScene[],
  narrativePack: NarrativeSignalPack | null | undefined,
  pressureSummary: BrokerPOVSnapshot['pressureSummary'] | null | undefined,
  consensusSummary: { available: boolean; formationCount: number; signedCount: number; collapsedCount: number } | null | undefined,
  day: number,
): readonly DailyDecisionWhyRef[] {
  const refs: DailyDecisionWhyRef[] = [];

  // Evaluation snapshot ref
  refs.push(Object.freeze({
    refType: 'evaluation_snapshot',
    refId: `evaluation-snapshot:${casePOV.caseId}:d${day}`,
    summary: `case ${casePOV.caseId}: score=${casePOV.assetScore.score}, signals=${casePOV.signals.length}`,
    relevance: 0.85,
  }) as DailyDecisionWhyRef);

  // Signal refs
  for (const signal of casePOV.signals) {
    refs.push(Object.freeze({
      refType: 'event',
      refId: signal.key,
      summary: signal.label,
      relevance: signal.severity === 'urgent' ? 0.95 : signal.severity === 'decision' ? 0.85 : 0.7,
    }) as DailyDecisionWhyRef);
  }

  // Decision moment refs
  for (const dm of casePOV.decisionMoments) {
    refs.push(Object.freeze({
      refType: 'event',
      refId: dm.id,
      summary: dm.label,
      relevance: 0.8,
    }) as DailyDecisionWhyRef);
  }

  // Interaction scene refs for this case
  for (const scene of scenes) {
    if (scene.caseId === casePOV.caseId) {
      refs.push(Object.freeze({
        refType: 'interaction_scene',
        refId: scene.sceneId,
        summary: `${scene.sceneType} scene for ${scene.caseId}`,
        relevance: 0.75,
      }) as DailyDecisionWhyRef);
    }
  }

  // Narrative signal pack ref
  if (narrativePack) {
    refs.push(Object.freeze({
      refType: 'belief',
      refId: narrativePack.packId ?? `narrative-pack:d${day}`,
      summary: `narrative pack with ${(narrativePack.actorVisibleSignals ?? []).length} signals`,
      relevance: 0.7,
    }) as DailyDecisionWhyRef);
  }

  // Pressure receipt ref
  if (pressureSummary?.available) {
    refs.push(Object.freeze({
      refType: 'pressure_receipt',
      refId: `pressure:d${day}`,
      summary: `${pressureSummary.wiredCount} pressure sources, coverage ${(pressureSummary.coverage * 100).toFixed(0)}%`,
      relevance: pressureSummary.coverage,
    }) as DailyDecisionWhyRef);
  }

  // Consensus receipt ref
  if (consensusSummary?.available) {
    refs.push(Object.freeze({
      refType: 'consensus_receipt',
      refId: `consensus:d${day}`,
      summary: `${consensusSummary.formationCount} formations, ${consensusSummary.signedCount} signed`,
      relevance: 0.8,
    }) as DailyDecisionWhyRef);
  }

  // Blocker refs
  for (const blocker of casePOV.assetScore.blockers) {
    refs.push(Object.freeze({
      refType: 'event',
      refId: `blocker:${blocker}:${casePOV.caseId}`,
      summary: blocker,
      relevance: 0.9,
    }) as DailyDecisionWhyRef);
  }

  return freezeArray(refs);
}

function buildBlockersForCase(casePOV: CasePOVContext): readonly DailyDecisionBlockerRef[] {
  return freezeArray(
    casePOV.assetScore.blockers.map((blocker, idx) =>
      Object.freeze({
        blockerId: `blocker:${casePOV.caseId}:${idx}`,
        kind: 'asset',
        description: blocker,
        severity: casePOV.decisionState.posture === 'stuck_conflicted' ? 'high' as const
          : casePOV.decisionState.pressureLevel > 50 ? 'medium' as const : 'low' as const,
      }) as DailyDecisionBlockerRef,
    ),
  );
}

function buildCommitmentsForCase(casePOV: CasePOVContext): readonly DailyDecisionCommitmentRef[] {
  const commitments: DailyDecisionCommitmentRef[] = [];

  // From commitment states (inferred commitments)
  for (const cs of casePOV.commitmentStates) {
    commitments.push(Object.freeze({
      commitmentId: cs.id,
      kind: cs.scope,
      actorId: cs.owner === 'owner' ? 'owner' : cs.owner === 'customer' ? 'customer' : 'broker',
      action: cs.status === 'active' ? 'created' as const
        : cs.status === 'weak' ? 'weakened' as const
        : cs.status === 'stale' ? 'weakened' as const
        : 'revoked' as const,
      strength: cs.strength,
      reason: cs.label,
    }) as DailyDecisionCommitmentRef);
  }

  // From decision commitments (already mapped)
  for (const dc of casePOV.commitments) {
    commitments.push(Object.freeze({
      commitmentId: dc.id,
      kind: dc.scope,
      actorId: dc.actorRole,
      action: dc.strength === 'strong' ? 'strengthened' as const
        : dc.strength === 'tentative' ? 'created' as const
        : dc.strength === 'revoked' ? 'revoked' as const
        : 'weakened' as const,
      strength: dc.strength === 'strong' ? 80 : dc.strength === 'tentative' ? 50 : 20,
      reason: dc.description,
    }) as DailyDecisionCommitmentRef);
  }

  return freezeArray(commitments);
}

function buildActorPovChangesForCase(
  casePOV: CasePOVContext,
  actorId: string,
): readonly DailyActorPovChangeSummary[] {
  const changes: DailyActorPovChangeSummary[] = [];

  // Trust belief update
  const trustBelief = casePOV.knowledge.beliefs.find((b) => b.kind === 'broker_trust');
  if (trustBelief) {
    changes.push(Object.freeze({
      actorId,
      actorKind: 'broker' as const,
      changedBeliefs: freezeArray([Object.freeze({
        beliefId: trustBelief.id,
        beliefKind: trustBelief.kind,
        previousConfidence: trustBelief.confidence,
        newConfidence: trustBelief.confidence,
        direction: trustBelief.direction === 'positive' ? 'strengthened' as const
          : trustBelief.direction === 'negative' ? 'weakened' as const : 'unchanged' as const,
        reason: trustBelief.label,
      }) as DailyBeliefChangeRef]),
      changedSignals: freezeArray([]),
      caseIds: freezeArray([casePOV.caseId]),
    }) as DailyActorPovChangeSummary);
  }

  // Market heat belief update
  const heatBelief = casePOV.knowledge.beliefs.find((b) => b.kind === 'market_heat');
  if (heatBelief) {
    changes.push(Object.freeze({
      actorId,
      actorKind: 'broker' as const,
      changedBeliefs: freezeArray([Object.freeze({
        beliefId: heatBelief.id,
        beliefKind: heatBelief.kind,
        previousConfidence: heatBelief.confidence,
        newConfidence: heatBelief.confidence,
        direction: heatBelief.direction === 'positive' ? 'strengthened' as const
          : heatBelief.direction === 'negative' ? 'weakened' as const : 'unchanged' as const,
        reason: heatBelief.label,
      }) as DailyBeliefChangeRef]),
      changedSignals: freezeArray([]),
      caseIds: freezeArray([casePOV.caseId]),
    }) as DailyActorPovChangeSummary);
  }

  // Signal changes
  const signalChanges: DailySignalChangeRef[] = casePOV.signals.map((s) =>
    Object.freeze({
      signalId: s.key,
      signalKind: 'pov-signal',
      severity: s.severity as 'info' | 'watch' | 'decision' | 'urgent',
      label: s.label,
      appeared: true,
    }) as DailySignalChangeRef,
  );

  if (signalChanges.length > 0) {
    changes.push(Object.freeze({
      actorId,
      actorKind: 'broker' as const,
      changedBeliefs: freezeArray([]),
      changedSignals: freezeArray(signalChanges),
      caseIds: freezeArray([casePOV.caseId]),
    }) as DailyActorPovChangeSummary);
  }

  return freezeArray(changes);
}

function buildRecommendationsForCase(
  casePOV: CasePOVContext,
): readonly DailyRecommendationSummary[] {
  const recs: DailyRecommendationSummary[] = [];

  // From recommendation drafts
  for (const draft of casePOV.recommendationDrafts) {
    recs.push(Object.freeze({
      actionSpecId: draft.actionSpecId,
      caseId: casePOV.caseId,
      label: draft.label,
      priority: draft.priority,
      confidence: draft.enabled ? 0.7 : 0.3,
      enabled: draft.enabled,
      rationale: draft.enabled
        ? `信号支撑, 优先级 ${draft.priority}`
        : `当前不可用, 优先级 ${draft.priority}`,
      supportingSignalCount: casePOV.signals.length,
      decisionMomentCount: casePOV.decisionMoments.length,
    }) as DailyRecommendationSummary);
  }

  return freezeArray(recs);
}

// ---------------------------------------------------------------------------
// buildCaseOperatingMovements — compute business movements per case
// ---------------------------------------------------------------------------

function magnitudeForDelta(delta: number): DailyMovementMagnitude {
  const abs = Math.abs(delta);
  if (abs >= 15) return 'high';
  if (abs >= 7) return 'medium';
  return 'low';
}

function buildCaseOperatingMovement(
  casePOV: CasePOVContext,
  day: number,
): DailyCaseOperatingMovement {
  const movements: DailyMovementEntry[] = [];
  const blockerEmergences: DailyDecisionBlockerRef[] = [];
  const blockerResolutions: DailyDecisionBlockerRef[] = [];

  // Build movements for key business dimensions
  const fieldMappings: Array<{ field: string; kind: DailyMovementKind; value: number; threshold?: number }> = [
    { field: 'trust', kind: 'owner_relation', value: casePOV.ownerReadiness.trust },
    { field: 'urgency', kind: 'owner_relation', value: casePOV.ownerReadiness.urgency },
    { field: 'patience', kind: 'owner_relation', value: casePOV.ownerReadiness.patience },
    { field: 'd1', kind: 'customer_opportunity', value: casePOV.assetScore.d1 },
    { field: 'd2', kind: 'competition_pressure', value: casePOV.assetScore.d2 },
    { field: 'd3', kind: 'price_consensus', value: casePOV.assetScore.d3 },
    { field: 'competitiveness', kind: 'competition_pressure', value: casePOV.assetScore.score },
  ];

  for (const mapping of fieldMappings) {
    // All values are current-day snapshots; delta is 0 (no previous-day comparison available).
    // The adapter emits the current state as 'unchanged' to populate the movement array.
    movements.push(Object.freeze({
      kind: mapping.kind,
      direction: 'unchanged' as DailyMovementDirection,
      magnitude: 'low' as DailyMovementMagnitude,
      field: mapping.field,
      from: mapping.value,
      to: mapping.value,
      delta: 0,
      reason: `${mapping.field}=${mapping.value}`,
      sourceRefIds: freezeArray([`evaluation-snapshot:${casePOV.caseId}:d${day}`]),
    }) as DailyMovementEntry);
  }

  // Blockers from signals
  for (const signal of casePOV.signals) {
    if (signal.severity === 'urgent' || signal.severity === 'decision') {
      blockerEmergences.push(Object.freeze({
        blockerId: `blocker:signal:${signal.key}`,
        kind: signal.key,
        description: signal.label,
        severity: signal.severity === 'urgent' ? 'high' as const : 'medium' as const,
      }) as DailyDecisionBlockerRef);
    }
  }

  // Blockers from asset score
  for (const blocker of casePOV.assetScore.blockers) {
    blockerEmergences.push(Object.freeze({
      blockerId: `blocker:asset:${casePOV.caseId}:${blocker}`,
      kind: 'asset',
      description: blocker,
      severity: casePOV.decisionState.posture === 'stuck_conflicted' ? 'high' as const
        : casePOV.decisionState.pressureLevel > 50 ? 'medium' as const : 'low' as const,
    }) as DailyDecisionBlockerRef);
  }

  // Determine recommended action from top recommendation draft
  const topDraft = [...casePOV.recommendationDrafts]
    .filter((d) => d.enabled)
    .sort((a, b) => b.priority - a.priority)[0];

  return Object.freeze({
    caseId: casePOV.caseId,
    movements: freezeArray(movements),
    blockerEmergences: freezeArray(blockerEmergences),
    blockerResolutions: freezeArray(blockerResolutions),
    recommendedActionId: topDraft?.actionSpecId,
  }) as DailyCaseOperatingMovement;
}

// ---------------------------------------------------------------------------
// buildDailyDecisionBridgeInputFromPOV — main adapter entry point
// ---------------------------------------------------------------------------

/**
 * Composes DailyDecisionBridgeInput from BrokerPOVSnapshot and optional
 * InteractionScene/NarrativeSignalPack/pressure/consensus data.
 *
 * Pure function. No mutation. Deterministic.
 * Only produces lightweight summary/ref data — no embedded heavy objects.
 */
export function buildDailyDecisionBridgeInputFromPOV(
  pov: BrokerPOVSnapshot,
  scenes: readonly InteractionScene[] = [],
  narrativePack?: NarrativeSignalPack | null,
  pressureSummary?: BrokerPOVSnapshot['pressureSummary'] | null,
  consensusSummary?: { available: boolean; formationCount: number; signedCount: number; collapsedCount: number } | null,
): DailyDecisionBridgeInput {
  const day = pov.day;
  const actorId = pov.actorId;

  // Sort cases by caseId for deterministic ordering
  const sortedCases = [...pov.cases].sort((a, b) => a.caseId.localeCompare(b.caseId));

  const movedCases: DailyCaseDecisionSummary[] = sortedCases.map((casePOV) => {
    const movedFields = buildMovedFieldsForCase(casePOV);
    const whyRefs = buildWhyRefsForCase(casePOV, scenes, narrativePack, pressureSummary ?? pov.pressureSummary, consensusSummary, day);
    const blockers = buildBlockersForCase(casePOV);
    const commitments = buildCommitmentsForCase(casePOV);
    const actorIds = freezeArray([actorId, 'owner']);

    return Object.freeze({
      caseId: casePOV.caseId,
      movedFields,
      whyRefs,
      blockers,
      commitments,
      actorIds,
    }) as DailyCaseDecisionSummary;
  });

  // Actor POV changes
  const actorPovChanges: DailyActorPovChangeSummary[] = sortedCases.flatMap((casePOV) =>
    buildActorPovChangesForCase(casePOV, actorId),
  );

  // Recommendations
  const recommendations: DailyRecommendationSummary[] = sortedCases.flatMap((casePOV) =>
    buildRecommendationsForCase(casePOV),
  );

  // Operating movements per case
  const caseMovements: DailyCaseOperatingMovement[] = sortedCases.map((casePOV) =>
    buildCaseOperatingMovement(casePOV, day),
  );

  return Object.freeze({
    day,
    movedCases: freezeArray(movedCases),
    actorPovChanges: freezeArray(actorPovChanges),
    recommendations: freezeArray(recommendations),
    caseMovements: freezeArray(caseMovements),
  }) as DailyDecisionBridgeInput;
}

// ---------------------------------------------------------------------------
// buildDailyDecisionBridgeFromSemanticReceiptInputPack
// ---------------------------------------------------------------------------

/**
 * Composes DailyDecisionBridgeSummary from a SemanticReceiptInputPack.
 *
 * This adapter bridges the semantic receipt input composer's output
 * to the DailyDecisionBridge summary without reading raw GameState.
 *
 * Pure function. No mutation. Deterministic.
 */
export function buildDailyDecisionBridgeFromSemanticReceiptInputPack(
  pack: SemanticReceiptInputPack,
): DailyDecisionBridgeSummary {
  if (!pack.isLive || pack.interactionScenes.length === 0) {
    return buildEmptyDailyDecisionBridgeSummary(pack.day);
  }

  // Build case summaries from the pack's evidence sources
  const caseIds = new Set<string>();
  for (const scene of pack.interactionScenes) {
    if (scene.caseId) caseIds.add(scene.caseId);
  }

  const movedCases: DailyCaseDecisionSummary[] = [...caseIds].sort().map((caseId) => {
    const caseScenes = pack.interactionScenes.filter((s) => s.caseId === caseId);
    const caseEvidence = pack.evidenceSources.filter((e) =>
      e.sourceType === 'evaluation_snapshot' && e.sourceId.includes(caseId),
    );

    const movedFields: DailyDecisionMovedField[] = caseScenes.map((scene) =>
      Object.freeze({
        field: scene.sceneType,
        newValue: true,
        delta: 1,
        reason: `${scene.sceneType} interaction for ${caseId}`,
      }) as DailyDecisionMovedField,
    );

    const whyRefs: DailyDecisionWhyRef[] = [
      ...caseEvidence.map((e) =>
        Object.freeze({
          refType: 'evaluation_snapshot' as const,
          refId: e.sourceId,
          summary: e.summary,
          relevance: 0.85,
        }) as DailyDecisionWhyRef,
      ),
      ...caseScenes.map((s) =>
        Object.freeze({
          refType: 'interaction_scene' as const,
          refId: `scene:${s.sceneId}`,
          summary: `${s.sceneType} scene`,
          relevance: 0.75,
        }) as DailyDecisionWhyRef,
      ),
    ];

    // Add narrative signal pack ref if available
    if (pack.narrativeSignalPack) {
      whyRefs.push(Object.freeze({
        refType: 'belief',
        refId: pack.narrativeSignalPack.packId ?? `narrative-pack:d${pack.day}`,
        summary: `narrative pack with ${(pack.narrativeSignalPack.actorVisibleSignals ?? []).length} signals`,
        relevance: 0.7,
      }) as DailyDecisionWhyRef);
    }

    const actorIds = freezeArray([pack.actorId, 'owner']);

    return Object.freeze({
      caseId,
      movedFields: freezeArray(movedFields),
      whyRefs: freezeArray(whyRefs),
      blockers: Object.freeze([]),
      commitments: Object.freeze([]),
      actorIds,
    }) as DailyCaseDecisionSummary;
  });

  const totalBlockers = movedCases.reduce((s, c) => s + c.blockers.length, 0);
  const totalCommitments = movedCases.reduce((s, c) => s + c.commitments.length, 0);

  return Object.freeze({
    day: pack.day,
    movedCases: freezeArray(movedCases),
    actorPovChanges: Object.freeze([]),
    recommendations: Object.freeze([]),
    totalMovedCases: movedCases.length,
    totalBlockers,
    totalCommitments,
  });
}

// ---------------------------------------------------------------------------
// buildEmptyDailyDecisionBridgeInput — graceful fallback
// ---------------------------------------------------------------------------

export function buildEmptyDailyDecisionBridgeInput(day: number): DailyDecisionBridgeInput {
  return Object.freeze({
    day,
    movedCases: Object.freeze([]),
    actorPovChanges: Object.freeze([]),
    recommendations: Object.freeze([]),
  }) as DailyDecisionBridgeInput;
}

// ---------------------------------------------------------------------------
// buildDailyDecisionBridgeFromGameState — runtime entry point
// ---------------------------------------------------------------------------

/**
 * Builds a DailyDecisionBridgeSummary from GameState using existing
 * decision-support adapter boundaries.
 *
 * This function reads GameState only through the established adapter
 * boundary (buildDecisionSupportContextFromLegacyState → buildBrokerPOVSnapshot),
 * not by accessing raw fields directly.
 *
 * Pure function. No mutation. Deterministic.
 * Graceful fallback: returns empty bridge when no active cases exist.
 */
export function buildDailyDecisionBridgeFromGameState(
  state: GameState,
): DailyDecisionBridgeSummary {
  const context = buildDecisionSupportContextFromLegacyState(state);
  if (!context.cases || context.cases.length === 0) {
    return buildEmptyDailyDecisionBridgeSummary(state.day);
  }

  const pov = buildBrokerPOVSnapshot(context);
  const bridgeInput = buildDailyDecisionBridgeInputFromPOV(pov);
  return buildDailyDecisionBridgeSummary(bridgeInput);
}
