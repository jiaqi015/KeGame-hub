/**
 * Semantic Receipt Workspace Boundary v0 — read-only adapter state.
 *
 * Exposes InteractionScene / NarrativeSignalPack / LLM disabled state
 * as compressed summaries. No raw GameState, no UI, no engine mutation.
 *
 * Mother model alignment:
 * - Section 9: POV and Interaction Design (visible facts, inferred signals)
 * - Section 20.7: LLM should not read raw GameState
 * - Section 18.10: LLM output cannot be hidden randomness
 *
 * Hard constraints:
 * 1. Read-only adapter state — no mutation.
 * 2. No raw GameState / Case / Opportunity / DomainEventEntry.
 * 3. Owner workspace cannot see broker-only / company / D4 internals.
 * 4. No-LLM stable: disabled mode, no provider required.
 * 5. Graceful fallback when data is absent (empty arrays, zero counts).
 */

import { freezeProjection, type ReadonlyDeep } from './readOnly.js';

// ---------------------------------------------------------------------------
// Interaction Scene Summary (compressed from InteractionScene)
// ---------------------------------------------------------------------------

/**
 * Compressed interaction scene summary.
 * Only exposes public metadata — no internal service interaction details.
 */
export interface SemanticInteractionSceneSummary {
  readonly sceneId: string;
  readonly sceneType: string;
  readonly caseId?: string;
  readonly povActorId: string;
  readonly evidenceRefCount: number;
  readonly resultingEventRefCount: number;
  readonly commitmentRefCount: number;
  readonly hasServiceInteraction: boolean;
}

// ---------------------------------------------------------------------------
// Narrative Signal Pack Summary (compressed from NarrativeSignalPack)
// ---------------------------------------------------------------------------

/**
 * Compressed narrative signal pack summary.
 * Only exposes counts and constraints — no raw signal content.
 */
export interface SemanticNarrativePackSummary {
  readonly packId: string;
  readonly packHash: string;
  readonly sourceRefCount: number;
  readonly evidenceRefCount: number;
  readonly timelineAnchorCount: number;
  readonly actorVisibleSignalCount: number;
  readonly generationConstraints: {
    readonly requiredEvidenceForFacts: boolean;
    readonly visibleScope: string;
    readonly canMentionHiddenOpportunities: boolean;
    readonly canMentionCompanyPressure: boolean;
    readonly canMentionD4Internals: boolean;
    readonly forbiddenTopicCount: number;
  };
}

// ---------------------------------------------------------------------------
// LLM Optionality Summary
// ---------------------------------------------------------------------------

/**
 * LLM optionality summary — always reports disabled state.
 * Future-ready: structure exists for when LLM is optionally enabled.
 */
export interface SemanticLlmOptionalitySummary {
  /** Always 'disabled' in current implementation. */
  readonly mode: 'disabled';
  /** No provider configuration required. */
  readonly noProviderRequired: true;
  /** No proposals generated. */
  readonly proposalCount: 0;
  /** Cannot call external provider. */
  readonly canCallProvider: false;
  /** Architecture supports future LLM integration. */
  readonly futureReady: true;
}

// ---------------------------------------------------------------------------
// Pressure Summary (compressed from PressureReceiptSummaryRef)
// ---------------------------------------------------------------------------

/**
 * Compressed pressure receipt summary.
 * Only exposes counts and availability — no raw pressure snapshots.
 */
export interface SemanticPressureSummary {
  readonly available: boolean;
  readonly snapshotCount: number;
  readonly decisionDeltaCount: number;
  readonly inputCount: number;
  readonly day: number;
}

// ---------------------------------------------------------------------------
// Consensus Summary (compressed from ConsensusReceiptSummaryRef)
// ---------------------------------------------------------------------------

/**
 * Compressed consensus receipt summary.
 * Only exposes counts — no raw consensus formations.
 */
export interface SemanticConsensusSummary {
  readonly available: boolean;
  readonly formationCount: number;
  readonly signedCount: number;
  readonly collapsedCount: number;
  readonly blockedCount: number;
  readonly stillPendingCount: number;
  readonly day: number;
}

// ---------------------------------------------------------------------------
// SemanticEvidenceRef — compressed evidence reference for cross-referencing
// ---------------------------------------------------------------------------

/**
 * Compressed evidence reference — stable, replayable pointer to receipt data.
 * Used by NarrativeSignalPack and LLM input packs to reference receipt evidence
 * without exposing raw pressure snapshots, consensus formations, or GameState.
 *
 * sourceId format: `{kind}:d{day}` (e.g. `pressure-receipt:d10`, `consensus-receipt:d10`)
 */
export interface SemanticEvidenceRef {
  readonly sourceType: 'pressure_receipt' | 'consensus_receipt' | 'evaluation_snapshot' | 'narrative_signal_pack';
  readonly sourceId: string;
  readonly day: number;
  readonly available: boolean;
  readonly summary: string;
  readonly count: number;
}

// ---------------------------------------------------------------------------
// SemanticWorkspaceProjection — the main output
// ---------------------------------------------------------------------------

/**
 * Semantic workspace projection — read-only adapter state.
 * Exposes compressed interaction/narrative/pressure/consensus/LLM summaries.
 *
 * projectionKind: 'semantic_receipt_adapter_state'
 * readOnly: true
 */
export interface SemanticWorkspaceProjection {
  readonly projectionKind: 'semantic_receipt_adapter_state';
  readonly readOnly: true;
  readonly day: number;
  readonly interactionScenes: readonly SemanticInteractionSceneSummary[];
  readonly narrativePackSummary: SemanticNarrativePackSummary | null;
  readonly pressureSummary: SemanticPressureSummary;
  readonly consensusSummary: SemanticConsensusSummary;
  readonly llmOptionality: SemanticLlmOptionalitySummary;
  /** Compressed evidence index for cross-referencing receipt sources. */
  readonly evidenceIndex: readonly SemanticEvidenceRef[];
}

// ---------------------------------------------------------------------------
// Input types for building the projection (plain, no domain imports)
// ---------------------------------------------------------------------------

/**
 * Plain input for building interaction scene summaries.
 * All data is pre-compressed by callers. No raw GameState.
 */
export interface SemanticSceneInput {
  readonly sceneId: string;
  readonly sceneType: string;
  readonly caseId?: string;
  readonly povActorId: string;
  readonly evidenceRefCount: number;
  readonly resultingEventRefCount: number;
  readonly commitmentRefCount: number;
  readonly hasServiceInteraction: boolean;
}

/**
 * Plain input for building narrative pack summary.
 * All data is pre-compressed by callers. No raw NarrativeSignalPack.
 */
export interface SemanticNarrativePackInput {
  readonly packId: string;
  readonly packHash: string;
  readonly sourceRefCount: number;
  readonly evidenceRefCount: number;
  readonly timelineAnchorCount: number;
  readonly actorVisibleSignalCount: number;
  readonly generationConstraints: {
    readonly requiredEvidenceForFacts: boolean;
    readonly visibleScope: string;
    readonly canMentionHiddenOpportunities: boolean;
    readonly canMentionCompanyPressure: boolean;
    readonly canMentionD4Internals: boolean;
    readonly forbiddenTopicCount: number;
  };
}

/**
 * Plain input for building pressure summary.
 * All data is pre-compressed by callers. No raw pressure snapshots.
 */
export interface SemanticPressureInput {
  readonly available: boolean;
  readonly snapshotCount: number;
  readonly decisionDeltaCount: number;
  readonly inputCount: number;
  readonly day: number;
}

/**
 * Plain input for building consensus summary.
 * All data is pre-compressed by callers. No raw consensus formations.
 */
export interface SemanticConsensusInput {
  readonly available: boolean;
  readonly formationCount: number;
  readonly signedCount: number;
  readonly collapsedCount: number;
  readonly blockedCount: number;
  readonly stillPendingCount: number;
  readonly day: number;
}

/**
 * Full input for building a SemanticWorkspaceProjection.
 * All data is pre-compressed by callers. No raw GameState.
 */
export interface SemanticWorkspaceInput {
  readonly day: number;
  readonly scenes?: readonly SemanticSceneInput[];
  readonly narrativePack?: SemanticNarrativePackInput;
  readonly pressure?: SemanticPressureInput;
  readonly consensus?: SemanticConsensusInput;
  /** Compressed evidence refs for cross-referencing receipt sources. */
  readonly evidenceRefs?: readonly SemanticEvidenceRefInput[];
}

/**
 * Input for building a SemanticEvidenceRef.
 * Plain, no domain imports.
 */
export interface SemanticEvidenceRefInput {
  readonly sourceType: 'pressure_receipt' | 'consensus_receipt' | 'evaluation_snapshot' | 'narrative_signal_pack';
  readonly sourceId: string;
  readonly day: number;
  readonly available: boolean;
  readonly summary: string;
  readonly count: number;
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

function buildSceneSummary(input: SemanticSceneInput): SemanticInteractionSceneSummary {
  return Object.freeze({
    sceneId: input.sceneId,
    sceneType: input.sceneType,
    caseId: input.caseId,
    povActorId: input.povActorId,
    evidenceRefCount: input.evidenceRefCount,
    resultingEventRefCount: input.resultingEventRefCount,
    commitmentRefCount: input.commitmentRefCount,
    hasServiceInteraction: input.hasServiceInteraction,
  });
}

function buildNarrativePackSummary(
  input: SemanticNarrativePackInput,
): SemanticNarrativePackSummary {
  return Object.freeze({
    packId: input.packId,
    packHash: input.packHash,
    sourceRefCount: input.sourceRefCount,
    evidenceRefCount: input.evidenceRefCount,
    timelineAnchorCount: input.timelineAnchorCount,
    actorVisibleSignalCount: input.actorVisibleSignalCount,
    generationConstraints: Object.freeze({
      requiredEvidenceForFacts: input.generationConstraints.requiredEvidenceForFacts,
      visibleScope: input.generationConstraints.visibleScope,
      canMentionHiddenOpportunities: input.generationConstraints.canMentionHiddenOpportunities,
      canMentionCompanyPressure: input.generationConstraints.canMentionCompanyPressure,
      canMentionD4Internals: input.generationConstraints.canMentionD4Internals,
      forbiddenTopicCount: input.generationConstraints.forbiddenTopicCount,
    }),
  });
}

function buildLlmOptionality(): SemanticLlmOptionalitySummary {
  return Object.freeze({
    mode: 'disabled',
    noProviderRequired: true,
    proposalCount: 0,
    canCallProvider: false,
    futureReady: true,
  });
}

function buildPressureSummary(input?: SemanticPressureInput): SemanticPressureSummary {
  if (!input) {
    return Object.freeze({
      available: false,
      snapshotCount: 0,
      decisionDeltaCount: 0,
      inputCount: 0,
      day: 0,
    });
  }
  return Object.freeze({
    available: input.available,
    snapshotCount: input.snapshotCount,
    decisionDeltaCount: input.decisionDeltaCount,
    inputCount: input.inputCount,
    day: input.day,
  });
}

function buildConsensusSummary(input?: SemanticConsensusInput): SemanticConsensusSummary {
  if (!input) {
    return Object.freeze({
      available: false,
      formationCount: 0,
      signedCount: 0,
      collapsedCount: 0,
      blockedCount: 0,
      stillPendingCount: 0,
      day: 0,
    });
  }
  return Object.freeze({
    available: input.available,
    formationCount: input.formationCount,
    signedCount: input.signedCount,
    collapsedCount: input.collapsedCount,
    blockedCount: input.blockedCount,
    stillPendingCount: input.stillPendingCount,
    day: input.day,
  });
}

function buildEvidenceRef(input: SemanticEvidenceRefInput): SemanticEvidenceRef {
  return Object.freeze({
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    day: input.day,
    available: input.available,
    summary: input.summary,
    count: input.count,
  });
}

// ---------------------------------------------------------------------------
// buildSemanticWorkspaceProjection — main builder
// ---------------------------------------------------------------------------

/**
 * Builds a SemanticWorkspaceProjection from compressed input.
 *
 * Pure function. No side effects. No raw GameState.
 * Same input → same projection (deterministic).
 *
 * Graceful fallback: empty arrays / null when data is absent.
 */
export function buildSemanticWorkspaceProjection(
  input: SemanticWorkspaceInput,
): SemanticWorkspaceProjection {
  const scenes = (input.scenes ?? []).map(buildSceneSummary);
  const narrativePackSummary = input.narrativePack
    ? buildNarrativePackSummary(input.narrativePack)
    : null;
  const evidenceIndex = (input.evidenceRefs ?? []).map(buildEvidenceRef);

  return freezeProjection({
    projectionKind: 'semantic_receipt_adapter_state',
    readOnly: true,
    day: input.day,
    interactionScenes: scenes,
    narrativePackSummary,
    pressureSummary: buildPressureSummary(input.pressure),
    consensusSummary: buildConsensusSummary(input.consensus),
    llmOptionality: buildLlmOptionality(),
    evidenceIndex,
  }) as SemanticWorkspaceProjection;
}

/**
 * Builds an empty SemanticWorkspaceProjection — graceful fallback.
 * Used when no semantic receipt data is available.
 */
export function buildEmptySemanticWorkspaceProjection(
  day: number,
): SemanticWorkspaceProjection {
  return buildSemanticWorkspaceProjection({ day });
}
