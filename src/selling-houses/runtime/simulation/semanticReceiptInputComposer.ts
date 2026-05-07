/**
 * Semantic Receipt Input Composer v0 — read-only input preparation layer.
 *
 * Chains existing DecisionSupport / POV / InteractionScene / NarrativeSignalPack
 * adapters into an input pack suitable for semantic receipt enrichment.
 *
 * Mother model alignment:
 * - Section 7: "DomainEvents + EvaluationSnapshots + ProcessReceipts + POVSnapshot
 *   -> NarrativeSignalPack -> LLM text generation"
 * - Section 9: POV and Interaction Design (visible facts, inferred signals)
 * - Section 18.10: LLM output cannot be hidden randomness
 * - Section 20.7: LLM should not read raw GameState
 *
 * Hard constraints:
 * 1. Read-only — does NOT mutate GameState.
 * 2. No raw GameState / Case / Opportunity / DomainEventEntry exposed.
 * 3. No LLM calls, no fetch, no OpenAI, no apiKey.
 * 4. Deterministic: same input → same output (stable sorting, no Date.now).
 * 5. Pure functions — no side effects.
 * 6. runtime/ can import core/runtime/domain (layer-compliant).
 */

import type {
  InteractionScene,
} from '../../core/world-state/interactions/models.js';

import type {
  NarrativeSignalPack,
} from '../../core/narrative/models.js';

import type {
  DecisionSupportContext,
} from '../decision-support/types.js';

import type {
  BrokerPOVSnapshot,
} from '../../core/decision/models.js';

import type {
  D4ReceiptCoverageReport,
} from '../../core/evaluation/models.js';

import {
  buildInteractionScenesFromDecisionContext,
  buildInteractionScenesFromPOV,
} from '../interaction-support/interactionSceneAdapter.js';

import {
  buildNarrativeSignalPackFromRuntime,
  type RuntimeNarrativeSignalPackInput,
  type CompressedCaseContext,
  type CompressedPressureReceipt,
  type CompressedConsensusReceipt,
  type CompressedEvaluationRef,
  type CompressedAttentionWarning,
  type CompressedCommitmentChange,
  type CompressedBeliefConflict,
  type CompressedInteractionScene,
} from '../narrative-support/narrativeSignalPackAdapter.js';

// ---------------------------------------------------------------------------
// Output types
// ---------------------------------------------------------------------------

/**
 * Compressed evidence reference for cross-referencing receipt sources.
 * Stable, replayable pointer to receipt data — no raw snapshots.
 */
export interface SemanticEvidenceSourceRef {
  readonly sourceType: 'pressure_receipt' | 'consensus_receipt' | 'evaluation_snapshot' | 'narrative_signal_pack' | 'interaction_scene';
  readonly sourceId: string;
  readonly day: number;
  readonly available: boolean;
  readonly summary: string;
  readonly count: number;
}

/**
 * Read-only input pack for semantic receipt enrichment.
 * Contains InteractionScene[], optional NarrativeSignalPack, and evidence refs.
 * No raw GameState, no mutable references.
 */
export interface SemanticReceiptInputPack {
  readonly day: number;
  readonly actorId: string;
  readonly actorKind: 'broker' | 'owner';
  /** Interaction scenes derived from DecisionSupportContext or BrokerPOV. */
  readonly interactionScenes: readonly InteractionScene[];
  /** Narrative signal pack derived from compressed runtime data. */
  readonly narrativeSignalPack: NarrativeSignalPack | null;
  /** Compressed evidence refs for cross-referencing receipt sources. */
  readonly evidenceSources: readonly SemanticEvidenceSourceRef[];
  /** Generation constraints for the pack. */
  readonly generationConstraints: {
    readonly requiredEvidenceForFacts: boolean;
    readonly visibleScope: 'full' | 'case_scoped' | 'owner_scoped';
    readonly canMentionHiddenOpportunities: boolean;
    readonly canMentionCompanyPressure: boolean;
    readonly canMentionD4Internals: boolean;
    readonly forbiddenTopicCount: number;
  };
  /** Whether this pack was built from live data or fallback. */
  readonly isLive: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freezeArray<T>(items: readonly T[]): readonly T[] {
  return Object.freeze([...items]) as readonly T[];
}

function buildStableEvidenceId(sourceType: string, day: number, suffix: string): string {
  return `${sourceType}:d${day}:${suffix}`;
}

// ---------------------------------------------------------------------------
// Compressors: DecisionSupportContext → RuntimeNarrativeSignalPackInput
// ---------------------------------------------------------------------------

function compressCases(context: DecisionSupportContext): readonly CompressedCaseContext[] {
  return context.cases.map((c) => ({
    caseId: c.caseId,
    title: c.title,
    status: c.status,
    signals: c.signals.map((s) => ({
      signalId: s.id,
      caseId: c.caseId,
      kind: s.kind,
      label: s.label,
      severity: s.severity as 'info' | 'watch' | 'decision' | 'urgent',
      score: s.score,
      day: context.generatedAtDay,
    })),
    assetScore: {
      modelId: c.assetScore.modelId,
      score: c.assetScore.score,
      d1: c.assetScore.dimensions.d1.score,
      d2: c.assetScore.dimensions.d2.score,
      d3: c.assetScore.dimensions.d3.score,
      d4: c.assetScore.dimensions.d4?.score,
      blockers: [...c.assetScore.blockers],
    },
    ownerReadiness: {
      score: c.ownerReadiness.score,
      trust: c.ownerReadiness.dimensions.trust.score,
      urgency: c.ownerReadiness.dimensions.urgency.score,
      patience: c.ownerReadiness.dimensions.patience.score,
    },
    decisionMoments: c.decisionMoments.map((dm) => ({
      id: dm.id,
      label: dm.name,
      summary: dm.summary,
    })),
    recommendationDrafts: c.recommendationDrafts.map((rd) => ({
      id: rd.id,
      actionSpecId: rd.actionSpecId,
      enabled: rd.availability.enabled,
    })),
  }));
}

function compressInteractionScenes(scenes: readonly InteractionScene[]): readonly CompressedInteractionScene[] {
  return scenes.map((s) => ({
    sceneId: s.sceneId,
    sceneType: s.sceneType,
    caseId: s.caseId ?? '',
    day: s.day,
    participants: s.actorIds.map((actorId) => ({
      actorId,
      actorKind: actorId === s.primaryActorId ? 'broker' as const : 'owner' as const,
      role: actorId === s.primaryActorId ? 'initiator' as const : 'receiver' as const,
    })),
    outcome: s.resultingEventRefs.length > 0 ? 'events_emitted' : undefined,
  }));
}

// ---------------------------------------------------------------------------
// Evidence source builders
// ---------------------------------------------------------------------------

function buildEvidenceSources(
  context: DecisionSupportContext,
  scenes: readonly InteractionScene[],
  narrativePack: NarrativeSignalPack | null,
): readonly SemanticEvidenceSourceRef[] {
  const refs: SemanticEvidenceSourceRef[] = [];

  // Interaction scene evidence
  refs.push(Object.freeze({
    sourceType: 'interaction_scene',
    sourceId: buildStableEvidenceId('interaction-scene', context.generatedAtDay, 'scenes'),
    day: context.generatedAtDay,
    available: scenes.length > 0,
    summary: `${scenes.length} interaction scenes`,
    count: scenes.length,
  }) as SemanticEvidenceSourceRef);

  // Narrative signal pack evidence
  if (narrativePack) {
    refs.push(Object.freeze({
      sourceType: 'narrative_signal_pack',
      sourceId: buildStableEvidenceId('narrative-pack', context.generatedAtDay, 'signals'),
      day: context.generatedAtDay,
      available: true,
      summary: `pack ${narrativePack.packId}, ${narrativePack.sourceRefs.length} source refs`,
      count: narrativePack.sourceRefs.length,
    }) as SemanticEvidenceSourceRef);
  }

  // Per-case evaluation evidence (derived snapshot, NOT consensus/process receipt)
  for (const c of context.cases) {
    refs.push(Object.freeze({
      sourceType: 'evaluation_snapshot',
      sourceId: buildStableEvidenceId('evaluation-snapshot', context.generatedAtDay, c.caseId),
      day: context.generatedAtDay,
      available: true,
      summary: `case ${c.caseId}: score=${c.assetScore.score}, signals=${c.signals.length}`,
      count: c.signals.length,
    }) as SemanticEvidenceSourceRef);
  }

  return freezeArray(refs);
}

// ---------------------------------------------------------------------------
// buildSemanticReceiptInputPackFromContext
// ---------------------------------------------------------------------------

/**
 * Builds a SemanticReceiptInputPack from DecisionSupportContext.
 *
 * Delegates to existing adapters:
 * - buildInteractionScenesFromDecisionContext → InteractionScene[]
 * - buildNarrativeSignalPackFromRuntime → NarrativeSignalPack
 *
 * Pure function. No mutation. Deterministic.
 */
export function buildSemanticReceiptInputPackFromContext(
  context: DecisionSupportContext,
): SemanticReceiptInputPack {
  const scenes = buildInteractionScenesFromDecisionContext(context);

  // Build compressed input for narrative pack
  const compressedCases = compressCases(context);
  const compressedScenes = compressInteractionScenes(scenes);

  const runtimeInput: RuntimeNarrativeSignalPackInput = {
    day: context.generatedAtDay,
    actorId: 'broker:current',
    actorKind: 'broker',
    cases: compressedCases,
    pressureReceipts: [] as readonly CompressedPressureReceipt[],
    consensusReceipts: [] as readonly CompressedConsensusReceipt[],
    evaluationRefs: context.cases.flatMap((c): CompressedEvaluationRef[] => [
      {
        snapshotId: c.assetScore.modelId,
        caseId: c.caseId,
        dimension: 'd1',
        score: c.assetScore.dimensions.d1.score,
        day: context.generatedAtDay,
      },
      {
        snapshotId: c.assetScore.modelId,
        caseId: c.caseId,
        dimension: 'd2',
        score: c.assetScore.dimensions.d2.score,
        day: context.generatedAtDay,
      },
      {
        snapshotId: c.assetScore.modelId,
        caseId: c.caseId,
        dimension: 'd3',
        score: c.assetScore.dimensions.d3.score,
        day: context.generatedAtDay,
      },
    ]),
    attentionWarnings: [] as readonly CompressedAttentionWarning[],
    commitmentChanges: [] as readonly CompressedCommitmentChange[],
    beliefConflicts: [] as readonly CompressedBeliefConflict[],
    interactionScenes: compressedScenes,
    povSummary: {
      activeCaseCount: context.cases.length,
      urgentSignalCount: context.cases.reduce((sum, c) => sum + c.signals.filter((s) => s.severity === 'urgent').length, 0),
      recentDecisionCount: context.cases.reduce((sum, c) => sum + c.decisionMoments.length, 0),
      energy: 100,
      promotionBudget: 0,
    },
  };

  const narrativePack = buildNarrativeSignalPackFromRuntime(runtimeInput);
  const evidenceSources = buildEvidenceSources(context, scenes, narrativePack);

  return Object.freeze({
    day: context.generatedAtDay,
    actorId: 'broker:current',
    actorKind: 'broker',
    interactionScenes: freezeArray(scenes),
    narrativeSignalPack: narrativePack,
    evidenceSources,
    generationConstraints: Object.freeze({
      requiredEvidenceForFacts: true,
      visibleScope: 'full',
      canMentionHiddenOpportunities: false,
      canMentionCompanyPressure: false,
      canMentionD4Internals: false,
      forbiddenTopicCount: 5,
    }),
    isLive: true,
  }) as SemanticReceiptInputPack;
}

// ---------------------------------------------------------------------------
// buildSemanticReceiptInputPackFromPOV
// ---------------------------------------------------------------------------

/**
 * Builds a SemanticReceiptInputPack from BrokerPOVSnapshot.
 *
 * Delegates to existing adapters:
 * - buildInteractionScenesFromPOV → InteractionScene[]
 * - buildNarrativeSignalPackFromRuntime → NarrativeSignalPack (from POV data)
 *
 * Pure function. No mutation. Deterministic.
 */
export function buildSemanticReceiptInputPackFromPOV(
  pov: BrokerPOVSnapshot,
): SemanticReceiptInputPack {
  const scenes = buildInteractionScenesFromPOV(pov);
  const compressedScenes = compressInteractionScenes(scenes);

  // Build compressed cases from POV
  const compressedCases: CompressedCaseContext[] = pov.cases.map((c) => ({
    caseId: c.caseId,
    title: c.title,
    status: c.status,
    signals: c.signals.map((s) => ({
      signalId: s.key,
      caseId: c.caseId,
      kind: 'pov-signal',
      label: s.label,
      severity: s.severity as 'info' | 'watch' | 'decision' | 'urgent',
      day: pov.day,
    })),
    assetScore: {
      modelId: 'pov-asset-score',
      score: c.assetScore.score,
      d1: c.assetScore.d1,
      d2: c.assetScore.d2,
      d3: c.assetScore.d3,
      d4: c.assetScore.d4,
      blockers: [...c.assetScore.blockers],
    },
    ownerReadiness: {
      score: c.ownerReadiness.score,
      trust: c.ownerReadiness.trust,
      urgency: c.ownerReadiness.urgency,
      patience: c.ownerReadiness.patience,
    },
    decisionMoments: c.decisionMoments.map((dm) => ({
      id: dm.id,
      label: dm.label,
      summary: dm.label,
    })),
    recommendationDrafts: c.recommendationDrafts.map((rd) => ({
      id: rd.id,
      actionSpecId: rd.actionSpecId,
      enabled: rd.enabled,
    })),
  }));

  const runtimeInput: RuntimeNarrativeSignalPackInput = {
    day: pov.day,
    actorId: pov.actorId,
    actorKind: 'broker',
    cases: compressedCases,
    pressureReceipts: [] as readonly CompressedPressureReceipt[],
    consensusReceipts: [] as readonly CompressedConsensusReceipt[],
    evaluationRefs: pov.cases.flatMap((c): CompressedEvaluationRef[] => [
      {
        snapshotId: `pov-score:${c.caseId}`,
        caseId: c.caseId,
        dimension: 'd1',
        score: c.assetScore.d1,
        day: pov.day,
      },
      {
        snapshotId: `pov-score:${c.caseId}`,
        caseId: c.caseId,
        dimension: 'd2',
        score: c.assetScore.d2,
        day: pov.day,
      },
      {
        snapshotId: `pov-score:${c.caseId}`,
        caseId: c.caseId,
        dimension: 'd3',
        score: c.assetScore.d3,
        day: pov.day,
      },
    ]),
    attentionWarnings: [] as readonly CompressedAttentionWarning[],
    commitmentChanges: [] as readonly CompressedCommitmentChange[],
    beliefConflicts: [] as readonly CompressedBeliefConflict[],
    interactionScenes: compressedScenes,
    povSummary: {
      activeCaseCount: pov.cases.length,
      urgentSignalCount: pov.cases.reduce((sum, c) => sum + c.signals.filter((s) => s.severity === 'urgent').length, 0),
      recentDecisionCount: pov.cases.reduce((sum, c) => sum + c.decisionMoments.length, 0),
      energy: pov.energy,
      promotionBudget: pov.promotionBudget,
    },
  };

  const narrativePack = buildNarrativeSignalPackFromRuntime(runtimeInput);

  const evidenceSources: SemanticEvidenceSourceRef[] = [
    Object.freeze({
      sourceType: 'interaction_scene',
      sourceId: buildStableEvidenceId('interaction-scene', pov.day, 'pov-scenes'),
      day: pov.day,
      available: scenes.length > 0,
      summary: `${scenes.length} POV interaction scenes`,
      count: scenes.length,
    }),
    Object.freeze({
      sourceType: 'narrative_signal_pack',
      sourceId: buildStableEvidenceId('narrative-pack', pov.day, 'pov-signals'),
      day: pov.day,
      available: true,
      summary: `POV pack, ${narrativePack.sourceRefs.length} source refs`,
      count: narrativePack.sourceRefs.length,
    }),
    ...pov.cases.map((c) =>
      Object.freeze({
        sourceType: 'evaluation_snapshot' as const,
        sourceId: buildStableEvidenceId('evaluation-snapshot', pov.day, c.caseId),
        day: pov.day,
        available: true,
        summary: `case ${c.caseId}: score=${c.assetScore.score}, signals=${c.signals.length}`,
        count: c.signals.length,
      }),
    ),
  ];

  return Object.freeze({
    day: pov.day,
    actorId: pov.actorId,
    actorKind: 'broker',
    interactionScenes: freezeArray(scenes),
    narrativeSignalPack: narrativePack,
    evidenceSources: freezeArray(evidenceSources),
    generationConstraints: Object.freeze({
      requiredEvidenceForFacts: true,
      visibleScope: 'full',
      canMentionHiddenOpportunities: false,
      canMentionCompanyPressure: false,
      canMentionD4Internals: false,
      forbiddenTopicCount: 5,
    }),
    isLive: true,
  }) as SemanticReceiptInputPack;
}

// ---------------------------------------------------------------------------
// buildEmptySemanticReceiptInputPack — graceful fallback
// ---------------------------------------------------------------------------

/**
 * Builds an empty SemanticReceiptInputPack — graceful fallback.
 * Used when no DecisionSupportContext or BrokerPOVSnapshot is available.
 */
export function buildEmptySemanticReceiptInputPack(
  day: number,
  actorId: string = 'broker:current',
): SemanticReceiptInputPack {
  return Object.freeze({
    day,
    actorId,
    actorKind: 'broker',
    interactionScenes: Object.freeze([]),
    narrativeSignalPack: null,
    evidenceSources: Object.freeze([]),
    generationConstraints: Object.freeze({
      requiredEvidenceForFacts: true,
      visibleScope: 'full',
      canMentionHiddenOpportunities: false,
      canMentionCompanyPressure: false,
      canMentionD4Internals: false,
      forbiddenTopicCount: 5,
    }),
    isLive: false,
  }) as SemanticReceiptInputPack;
}
