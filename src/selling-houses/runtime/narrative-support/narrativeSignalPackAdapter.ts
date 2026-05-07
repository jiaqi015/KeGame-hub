/**
 * Runtime NarrativeSignalPack Adapter — compresses live state into signal packs.
 *
 * Mother model alignment:
 * - Section 7: "DomainEvents + EvaluationSnapshots + ProcessReceipts + POVSnapshot
 *   -> NarrativeSignalPack -> LLM text generation"
 * - Section 18.10: "LLM output cannot be hidden randomness inside core simulation."
 * - Section 20.7: "LLM should not read raw GameState. Use deterministic signal extractor first."
 *
 * Hard constraints:
 * 1. Does NOT import raw GameState, Case, Opportunity, DomainEventEntry.
 * 2. Only receives compressed/pre-digested data from callers.
 * 3. Pure read-only adapter — no side effects, no mutation.
 * 4. Deterministic: same input → same pack.
 * 5. Does NOT call LLM.
 */

import type {
  NarrativeSignalPack,
  GenerationConstraints,
} from '../../core/narrative/models.js';
import type { NarrativeSignalPackInput } from '../../core/narrative/signalPack.js';
import { buildNarrativeSignalPack } from '../../core/narrative/signalPack.js';
import { buildNarrativeSignalPackContentHash } from '../../core/narrative/packHash.js';
import type {
  NarrativeGenerationInputPack,
} from '../../core/llm-boundary/inputPacks.js';
import type {
  LlmInputPackRef,
} from '../../core/llm-boundary/models.js';

// ---------------------------------------------------------------------------
// Compressed input types (no raw GameState)
// ---------------------------------------------------------------------------

/**
 * Compressed case signal for narrative pack building.
 * Derived from DecisionSupportSignal, NOT raw domain objects.
 */
export interface CompressedCaseSignal {
  readonly signalId: string;
  readonly caseId: string;
  readonly kind: string;
  readonly label: string;
  readonly severity: 'info' | 'watch' | 'decision' | 'urgent';
  readonly score?: number;
  readonly day: number;
}

/**
 * Compressed case context for narrative pack building.
 * Derived from CaseDecisionSupportContext, NOT raw Case.
 */
export interface CompressedCaseContext {
  readonly caseId: string;
  readonly title: string;
  readonly status: string;
  readonly signals: readonly CompressedCaseSignal[];
  readonly assetScore?: {
    readonly modelId: string;
    readonly score: number;
    readonly d1: number;
    readonly d2: number;
    readonly d3: number;
    readonly d4?: number;
    readonly blockers: readonly string[];
  };
  readonly ownerReadiness?: {
    readonly score: number;
    readonly trust: number;
    readonly urgency: number;
    readonly patience: number;
  };
  readonly decisionMoments: readonly {
    readonly id: string;
    readonly label: string;
    readonly summary: string;
  }[];
  readonly recommendationDrafts: readonly {
    readonly id: string;
    readonly actionSpecId: string;
    readonly enabled: boolean;
  }[];
}

/**
 * Compressed pressure receipt for narrative pack building.
 * Derived from PressureReceiptBundle, NOT raw receipts.
 */
export interface CompressedPressureReceipt {
  readonly receiptId: string;
  readonly caseId: string;
  readonly source: string;
  readonly headline: string;
  readonly magnitude: number;
  readonly day: number;
}

/**
 * Compressed consensus receipt for narrative pack building.
 * Derived from ConsensusFormationReceipt, NOT raw domain objects.
 */
export interface CompressedConsensusReceipt {
  readonly receiptId: string;
  readonly caseId: string;
  readonly opportunityId: string;
  readonly fromStage: string;
  readonly toStage: string;
  readonly direction: 'forward' | 'stall' | 'regress';
  readonly reason: string;
  readonly day: number;
}

/**
 * Compressed evaluation snapshot ref for narrative pack building.
 * Only IDs and scores, NOT full snapshot objects.
 */
export interface CompressedEvaluationRef {
  readonly snapshotId: string;
  readonly caseId: string;
  readonly dimension: string;
  readonly score: number;
  readonly previousScore?: number;
  readonly day: number;
}

/**
 * Compressed attention warning for narrative pack building.
 */
export interface CompressedAttentionWarning {
  readonly warningId: string;
  readonly actorId: string;
  readonly actorKind: string;
  readonly warningKind: string;
  readonly detail: string;
  readonly targetId: string;
  readonly targetKind: string;
  readonly day: number;
}

/**
 * Compressed commitment change for narrative pack building.
 */
export interface CompressedCommitmentChange {
  readonly changeId: string;
  readonly actorId: string;
  readonly actorKind: string;
  readonly commitmentLabel: string;
  readonly fromStatus: string;
  readonly toStatus: string;
  readonly strength: number;
  readonly reason: string;
  readonly caseId?: string;
  readonly day: number;
}

/**
 * Compressed belief conflict for narrative pack building.
 */
export interface CompressedBeliefConflict {
  readonly conflictId: string;
  readonly actorId: string;
  readonly actorKind: string;
  readonly conflictKind: 'belief_vs_fact' | 'belief_vs_belief' | 'stale_belief' | 'low_confidence';
  readonly description: string;
  readonly involvedBeliefs: readonly string[];
  readonly severity: 'low' | 'medium' | 'high';
  readonly caseId?: string;
  readonly day: number;
}

/**
 * Compressed interaction scene ref for narrative pack building.
 */
export interface CompressedInteractionScene {
  readonly sceneId: string;
  readonly sceneType: string;
  readonly caseId: string;
  readonly day: number;
  readonly participants: readonly {
    readonly actorId: string;
    readonly actorKind: string;
    readonly role: 'initiator' | 'receiver' | 'observer';
  }[];
  readonly outcome?: string;
}

/**
 * Full compressed input for building a NarrativeSignalPack from runtime.
 * All data is pre-compressed by callers. No raw GameState.
 */
export interface RuntimeNarrativeSignalPackInput {
  readonly day: number;
  readonly actorId: string;
  readonly actorKind: 'broker' | 'owner' | 'customer' | 'manager';
  readonly cases: readonly CompressedCaseContext[];
  readonly pressureReceipts: readonly CompressedPressureReceipt[];
  readonly consensusReceipts: readonly CompressedConsensusReceipt[];
  readonly evaluationRefs: readonly CompressedEvaluationRef[];
  readonly attentionWarnings: readonly CompressedAttentionWarning[];
  readonly commitmentChanges: readonly CompressedCommitmentChange[];
  readonly beliefConflicts: readonly CompressedBeliefConflict[];
  readonly interactionScenes: readonly CompressedInteractionScene[];
  readonly povSummary?: {
    readonly activeCaseCount: number;
    readonly urgentSignalCount: number;
    readonly recentDecisionCount: number;
    readonly energy: number;
    readonly promotionBudget: number;
  };
  readonly generationConstraints?: Partial<GenerationConstraints>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freezeArray<T>(items: readonly T[]): readonly T[] {
  return Object.freeze([...items]) as readonly T[];
}

/**
 * Deterministic pack hash — stable across calls with same input.
 * Uses day + actorId + caseCount as basis.
 */
function buildStablePackHash(day: number, actorId: string, caseCount: number): string {
  let hash = 0;
  const str = `narrative:${day}:${actorId}:${caseCount}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return `nsp-${Math.abs(hash).toString(36)}`;
}

// ---------------------------------------------------------------------------
// buildNarrativeSignalPackFromRuntime
// ---------------------------------------------------------------------------

/**
 * Builds a NarrativeSignalPack from compressed runtime data.
 *
 * This is the main adapter entry point. It takes pre-compressed data
 * from callers (NOT raw GameState) and produces a deterministic signal pack.
 *
 * Pure function. No side effects. No mutation.
 */
export function buildNarrativeSignalPackFromRuntime(
  input: RuntimeNarrativeSignalPackInput,
): NarrativeSignalPack {
  // Build event summaries from signals
  const eventSummaries = input.cases.flatMap((c) =>
    c.signals.map((s) => ({
      eventId: s.signalId,
      kind: s.kind,
      label: s.label,
      tone: s.severity === 'urgent' ? 'danger' as const
        : s.severity === 'decision' ? 'success' as const
          : 'neutral' as const,
      caseId: s.caseId,
      day: s.day,
    })),
  );

  // Build actor visible signals from case signals
  const actorVisibleSignals = input.cases.flatMap((c) =>
    c.signals.map((s) => ({
      signalId: s.signalId,
      actorId: input.actorId,
      actorKind: input.actorKind,
      signalKind: s.kind,
      label: s.label,
      severity: s.severity,
      score: s.score,
      caseId: s.caseId,
      day: s.day,
    })),
  );

  // Build interaction scene refs
  const interactionSceneRefs = input.interactionScenes.map((scene) => ({
    sceneId: scene.sceneId,
    sceneType: scene.sceneType,
    caseId: scene.caseId,
    day: scene.day,
    participants: scene.participants.map((p) => ({
      actorId: p.actorId,
      actorKind: p.actorKind,
      role: p.role,
    })),
    outcome: scene.outcome,
  }));

  // Default generation constraints
  const defaultConstraints: GenerationConstraints = {
    forbiddenTopics: ['内部策略', '客户隐私', '竞争细节'],
    requiredEvidenceForFacts: true,
    povActorId: input.actorId,
    povActorKind: input.actorKind,
    visibleScope: input.actorKind === 'owner' ? 'owner_scoped'
      : input.actorKind === 'customer' ? 'customer_scoped'
        : 'case_scoped',
    canMentionHiddenOpportunities: false,
    canMentionCompanyPressure: input.actorKind === 'broker',
    canMentionD4Internals: input.actorKind === 'broker',
  };

  const constraints: GenerationConstraints = {
    ...defaultConstraints,
    ...input.generationConstraints,
  };

  // Build the pack input
  const packInput: NarrativeSignalPackInput = {
    day: input.day,
    actorId: input.actorId,
    actorKind: input.actorKind,
    eventSummaries: freezeArray(eventSummaries),
    evaluationSnapshotRefs: freezeArray(input.evaluationRefs),
    pressureReceiptRefs: freezeArray(input.pressureReceipts),
    consensusReceiptRefs: freezeArray(input.consensusReceipts),
    povSummary: input.povSummary ?? {
      activeCaseCount: input.cases.length,
      urgentSignalCount: input.cases.reduce(
        (sum, c) => sum + c.signals.filter((s) => s.severity === 'urgent').length, 0,
      ),
      recentDecisionCount: input.cases.reduce(
        (sum, c) => sum + c.decisionMoments.length, 0,
      ),
      energy: 100,
      promotionBudget: 0,
    },
    attentionWarnings: freezeArray(input.attentionWarnings),
    commitmentChanges: freezeArray(input.commitmentChanges),
    beliefConflicts: freezeArray(input.beliefConflicts),
    actorVisibleSignals: freezeArray(actorVisibleSignals),
    interactionSceneRefs: freezeArray(interactionSceneRefs),
    generationConstraints: constraints,
  };

  return buildNarrativeSignalPack(packInput);
}

// ---------------------------------------------------------------------------
// buildNarrativeGenerationInputPackFromSignalPack
// ---------------------------------------------------------------------------

/**
 * Builds a NarrativeGenerationInputPack from a NarrativeSignalPack.
 *
 * This bridges the richer signal pack to the compressed LLM-ready input pack.
 * The input pack is what LLM actually reads; the signal pack is the source.
 *
 * Pure function. No side effects.
 */
export function buildNarrativeGenerationInputPackFromSignalPack(
  pack: NarrativeSignalPack,
  narrativeFocus: NarrativeGenerationInputPack['narrativeFocus'] = 'daily_summary',
): NarrativeGenerationInputPack {
  return Object.freeze({
    kind: 'narrative_generation',
    day: pack.day,
    eventSummaries: freezeArray(
      pack.sourceRefs
        .filter((r) => r.sourceType === 'event')
        .map((r) => Object.freeze({
          kind: r.sourceId.split(':')[0] ?? 'unknown',
          label: r.summary,
          tone: 'neutral' as const,
        })),
    ),
    evaluationSnapshotIds: freezeArray(
      pack.sourceRefs
        .filter((r) => r.sourceType === 'evaluation_snapshot')
        .map((r) => r.sourceId),
    ),
    povActorId: pack.generatedForActorId,
    povActorKind: pack.generatedForActorKind,
    dayContext: Object.freeze({
      activeCaseCount: pack.actorVisibleSignals
        .map((s) => s.caseId)
        .filter((v, i, a) => a.indexOf(v) === i)
        .filter(Boolean).length,
      urgentSignalCount: pack.actorVisibleSignals
        .filter((s) => s.severity === 'urgent').length,
      recentDecisionCount: pack.timelineAnchors
        .filter((a) => a.anchorType === 'decision').length,
    }),
    narrativeFocus,
  }) as NarrativeGenerationInputPack;
}

// ---------------------------------------------------------------------------
// buildLlmInputPackRefFromSignalPack
// ---------------------------------------------------------------------------

/**
 * Builds an LlmInputPackRef from a NarrativeSignalPack.
 *
 * This is the reference that LLM output proposals cite as their source.
 * Contains pack hash for replay, snapshot IDs, and receipt IDs.
 *
 * Pure function. No side effects.
 */
export function buildLlmInputPackRefFromSignalPack(
  pack: NarrativeSignalPack,
): LlmInputPackRef {
  const snapshotIds = pack.sourceRefs
    .filter((r) => r.sourceType === 'evaluation_snapshot')
    .map((r) => r.sourceId);
  const receiptIds = [
    ...pack.sourceRefs.filter((r) => r.sourceType === 'pressure_receipt').map((r) => r.sourceId),
    ...pack.sourceRefs.filter((r) => r.sourceType === 'consensus_receipt').map((r) => r.sourceId),
  ];

  const summaryParts: string[] = [];
  if (pack.actorVisibleSignals.length > 0) {
    summaryParts.push(`${pack.actorVisibleSignals.length} signals`);
  }
  if (pack.beliefConflicts.length > 0) {
    summaryParts.push(`${pack.beliefConflicts.length} belief conflicts`);
  }
  if (pack.pressureHighlights.length > 0) {
    summaryParts.push(`${pack.pressureHighlights.length} pressure highlights`);
  }
  if (pack.consensusMovement.length > 0) {
    summaryParts.push(`${pack.consensusMovement.length} consensus movements`);
  }

  return Object.freeze({
    packKind: 'narrative_signal_pack',
    packHash: buildNarrativeSignalPackContentHash(pack),
    packedAtDay: pack.day,
    sourceSnapshotIds: freezeArray(snapshotIds),
    sourceReceiptIds: freezeArray(receiptIds),
    summary: summaryParts.length > 0
      ? `NarrativeSignalPack: ${summaryParts.join(', ')}`
      : 'NarrativeSignalPack: no signals',
  }) as LlmInputPackRef;
}
