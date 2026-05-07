/**
 * NarrativeSignalPack builder — deterministic signal extractor.
 *
 * Takes compressed input from runtime adapters and produces a
 * NarrativeSignalPack. Pure function: no side effects, no randomness,
 * no timestamps, no global state.
 *
 * Mother model Section 7: "Use deterministic signal extractor first."
 *
 * Hard constraints:
 * - No Date.now / Math.random / global state
 * - No domain/runtime imports
 * - Same input → same pack (deterministic)
 * - Every signal must have evidenceRefs
 */

import type {
  ActorVisibleSignal,
  AttentionWarningSignal,
  BeliefConflictSignal,
  CommitmentChangeSignal,
  ConsensusMovementSignal,
  EvaluationHighlightSignal,
  EvidenceRef,
  GenerationConstraints,
  InteractionSceneRef,
  NarrativeSignalPack,
  PressureHighlightSignal,
  SourceRef,
  TimelineAnchor,
} from './models.js';

// ---------------------------------------------------------------------------
// NarrativeSignalPackInput — plain input shape (no domain imports)
// ---------------------------------------------------------------------------

/**
 * Plain input for building a NarrativeSignalPack.
 * All data is pre-compressed by runtime adapters.
 * No raw GameState, no mutable references.
 */
export interface NarrativeSignalPackInput {
  readonly day: number;
  readonly actorId: string;
  readonly actorKind: 'broker' | 'owner' | 'customer' | 'manager';

  /** Event summaries from domain events (compressed). */
  readonly eventSummaries: readonly {
    readonly eventId: string;
    readonly kind: string;
    readonly label: string;
    readonly tone: 'neutral' | 'success' | 'danger';
    readonly caseId?: string;
    readonly day: number;
  }[];

  /** Evaluation snapshot references (IDs only, not full snapshots). */
  readonly evaluationSnapshotRefs: readonly {
    readonly snapshotId: string;
    readonly caseId: string;
    readonly dimension: string;
    readonly score: number;
    readonly previousScore?: number;
    readonly day: number;
  }[];

  /** Pressure receipt references (compressed). */
  readonly pressureReceiptRefs: readonly {
    readonly receiptId: string;
    readonly caseId: string;
    readonly source: string;
    readonly headline: string;
    readonly magnitude: number;
    readonly day: number;
  }[];

  /** Consensus receipt references (compressed). */
  readonly consensusReceiptRefs: readonly {
    readonly receiptId: string;
    readonly caseId: string;
    readonly opportunityId: string;
    readonly fromStage: string;
    readonly toStage: string;
    readonly direction: 'forward' | 'stall' | 'regress';
    readonly reason: string;
    readonly day: number;
  }[];

  /** POV summary (compressed). */
  readonly povSummary: {
    readonly activeCaseCount: number;
    readonly urgentSignalCount: number;
    readonly recentDecisionCount: number;
    readonly energy: number;
    readonly promotionBudget: number;
  };

  /** Attention warnings (compressed). */
  readonly attentionWarnings: readonly {
    readonly warningId: string;
    readonly actorId: string;
    readonly actorKind: string;
    readonly warningKind: string;
    readonly detail: string;
    readonly targetId: string;
    readonly targetKind: string;
    readonly day: number;
  }[];

  /** Commitment changes (compressed). */
  readonly commitmentChanges: readonly {
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
  }[];

  /** Belief conflicts (compressed). */
  readonly beliefConflicts: readonly {
    readonly conflictId: string;
    readonly actorId: string;
    readonly actorKind: string;
    readonly conflictKind: 'belief_vs_fact' | 'belief_vs_belief' | 'stale_belief' | 'low_confidence';
    readonly description: string;
    readonly involvedBeliefs: readonly string[];
    readonly severity: 'low' | 'medium' | 'high';
    readonly caseId?: string;
    readonly day: number;
  }[];

  /** Actor visible signals (compressed). */
  readonly actorVisibleSignals: readonly {
    readonly signalId: string;
    readonly actorId: string;
    readonly actorKind: string;
    readonly signalKind: string;
    readonly label: string;
    readonly severity: 'info' | 'watch' | 'decision' | 'urgent';
    readonly score?: number;
    readonly caseId?: string;
    readonly day: number;
  }[];

  /** Interaction scene refs (compressed). */
  readonly interactionSceneRefs: readonly {
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
  }[];

  /** Generation constraints. */
  readonly generationConstraints: GenerationConstraints;
}

// ---------------------------------------------------------------------------
// Helpers (deterministic, pure)
// ---------------------------------------------------------------------------

function freezeArray<T>(items: readonly T[]): readonly T[] {
  return Object.freeze([...items]) as readonly T[];
}

/**
 * Deterministic pack ID: hash of day + actorId.
 * No Date.now, no Math.random.
 */
function buildPackId(day: number, actorId: string): string {
  // Simple deterministic hash: day + actorId
  // Not cryptographically secure, just stable
  let hash = 0;
  const str = `pack:${day}:${actorId}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit integer
  }
  return `nsp-${day}-${Math.abs(hash).toString(36)}`;
}

function buildSourceRef(
  sourceType: SourceRef['sourceType'],
  sourceId: string,
  summary: string,
): SourceRef {
  return Object.freeze({ sourceType, sourceId, summary });
}

function buildEvidenceRef(
  sourceRef: SourceRef,
  relevance: number,
  detail: string,
): EvidenceRef {
  return Object.freeze({ sourceRef, relevance, detail });
}

// ---------------------------------------------------------------------------
// Signal builders (deterministic, pure)
// ---------------------------------------------------------------------------

function buildTimelineAnchors(
  input: NarrativeSignalPackInput,
): readonly TimelineAnchor[] {
  const anchors: TimelineAnchor[] = [];

  // Events as timeline anchors
  for (const event of input.eventSummaries) {
    anchors.push(Object.freeze({
      day: event.day,
      label: event.label,
      anchorType: 'event' as const,
      caseId: event.caseId,
      sourceRef: buildSourceRef('event', event.eventId, event.label),
    }));
  }

  // Consensus movements as timeline anchors
  for (const consensus of input.consensusReceiptRefs) {
    anchors.push(Object.freeze({
      day: consensus.day,
      label: `${consensus.fromStage} → ${consensus.toStage}`,
      anchorType: 'process_stage' as const,
      caseId: consensus.caseId,
      sourceRef: buildSourceRef('consensus_receipt', consensus.receiptId, consensus.reason),
    }));
  }

  // Commitment changes as timeline anchors
  for (const commit of input.commitmentChanges) {
    anchors.push(Object.freeze({
      day: commit.day,
      label: `${commit.commitmentLabel}: ${commit.fromStatus} → ${commit.toStatus}`,
      anchorType: 'commitment' as const,
      caseId: commit.caseId,
      sourceRef: buildSourceRef('event', commit.changeId, commit.reason),
    }));
  }

  // Sort by day, then by label for determinism
  return freezeArray(
    anchors.sort((a, b) => a.day - b.day || a.label.localeCompare(b.label)),
  );
}

function buildActorVisibleSignals(
  input: NarrativeSignalPackInput,
): readonly ActorVisibleSignal[] {
  return freezeArray(
    input.actorVisibleSignals.map((sig) => {
      const sourceRef = buildSourceRef('decision_signal', sig.signalId, sig.label);
      return Object.freeze({
        signalId: sig.signalId,
        actorId: sig.actorId,
        actorKind: sig.actorKind as ActorVisibleSignal['actorKind'],
        signalKind: sig.signalKind,
        label: sig.label,
        severity: sig.severity,
        score: sig.score,
        evidenceRefs: freezeArray([buildEvidenceRef(sourceRef, 0.8, `Signal: ${sig.label}`)]),
        sourceRefs: freezeArray([sourceRef]),
        caseId: sig.caseId,
        day: sig.day,
      });
    }),
  );
}

function buildBeliefConflictSignals(
  input: NarrativeSignalPackInput,
): readonly BeliefConflictSignal[] {
  return freezeArray(
    input.beliefConflicts.map((conflict) => {
      const sourceRef = buildSourceRef('belief', conflict.conflictId, conflict.description);
      return Object.freeze({
        conflictId: conflict.conflictId,
        actorId: conflict.actorId,
        actorKind: conflict.actorKind as BeliefConflictSignal['actorKind'],
        conflictKind: conflict.conflictKind,
        description: conflict.description,
        involvedBeliefs: freezeArray(conflict.involvedBeliefs),
        severity: conflict.severity,
        evidenceRefs: freezeArray([buildEvidenceRef(sourceRef, 0.9, conflict.description)]),
        caseId: conflict.caseId,
        day: conflict.day,
      });
    }),
  );
}

function buildAttentionWarningSignals(
  input: NarrativeSignalPackInput,
): readonly AttentionWarningSignal[] {
  return freezeArray(
    input.attentionWarnings.map((warn) => {
      const sourceRef = buildSourceRef('attention_state', warn.warningId, warn.detail);
      return Object.freeze({
        warningId: warn.warningId,
        actorId: warn.actorId,
        actorKind: warn.actorKind as AttentionWarningSignal['actorKind'],
        warningKind: warn.warningKind,
        detail: warn.detail,
        targetId: warn.targetId,
        targetKind: warn.targetKind,
        evidenceRefs: freezeArray([buildEvidenceRef(sourceRef, 0.85, warn.detail)]),
        day: warn.day,
      });
    }),
  );
}

function buildCommitmentChangeSignals(
  input: NarrativeSignalPackInput,
): readonly CommitmentChangeSignal[] {
  return freezeArray(
    input.commitmentChanges.map((change) => {
      const sourceRef = buildSourceRef('event', change.changeId, change.reason);
      return Object.freeze({
        changeId: change.changeId,
        actorId: change.actorId,
        actorKind: change.actorKind as CommitmentChangeSignal['actorKind'],
        commitmentLabel: change.commitmentLabel,
        fromStatus: change.fromStatus,
        toStatus: change.toStatus,
        strength: change.strength,
        reason: change.reason,
        evidenceRefs: freezeArray([buildEvidenceRef(sourceRef, 0.9, change.reason)]),
        caseId: change.caseId,
        day: change.day,
      });
    }),
  );
}

function buildPressureHighlightSignals(
  input: NarrativeSignalPackInput,
): readonly PressureHighlightSignal[] {
  return freezeArray(
    input.pressureReceiptRefs.map((receipt) => {
      const sourceRef = buildSourceRef('pressure_receipt', receipt.receiptId, receipt.headline);
      return Object.freeze({
        highlightId: `ph:${receipt.receiptId}`,
        caseId: receipt.caseId,
        pressureKind: receipt.source,
        headline: receipt.headline,
        magnitude: receipt.magnitude,
        source: receipt.source,
        evidenceRefs: freezeArray([buildEvidenceRef(sourceRef, 0.8, receipt.headline)]),
        day: receipt.day,
      });
    }),
  );
}

function buildConsensusMovementSignals(
  input: NarrativeSignalPackInput,
): readonly ConsensusMovementSignal[] {
  return freezeArray(
    input.consensusReceiptRefs.map((receipt) => {
      const sourceRef = buildSourceRef('consensus_receipt', receipt.receiptId, receipt.reason);
      return Object.freeze({
        movementId: `cm:${receipt.receiptId}`,
        caseId: receipt.caseId,
        opportunityId: receipt.opportunityId,
        fromStage: receipt.fromStage,
        toStage: receipt.toStage,
        direction: receipt.direction,
        reason: receipt.reason,
        evidenceRefs: freezeArray([buildEvidenceRef(sourceRef, 0.9, receipt.reason)]),
        day: receipt.day,
      });
    }),
  );
}

function buildEvaluationHighlightSignals(
  input: NarrativeSignalPackInput,
): readonly EvaluationHighlightSignal[] {
  const highlights: EvaluationHighlightSignal[] = [];

  for (const ref of input.evaluationSnapshotRefs) {
    if (ref.previousScore !== undefined) {
      const delta = ref.score - ref.previousScore;
      const absDelta = Math.abs(delta);
      if (absDelta >= 5) {
        const significance = absDelta >= 15 ? 'major' : absDelta >= 10 ? 'notable' : 'minor';
        const sourceRef = buildSourceRef('evaluation_snapshot', ref.snapshotId, `${ref.dimension}: ${ref.previousScore} → ${ref.score}`);
        highlights.push(Object.freeze({
          highlightId: `eh:${ref.snapshotId}:${ref.dimension}`,
          caseId: ref.caseId,
          dimension: ref.dimension,
          fromScore: ref.previousScore,
          toScore: ref.score,
          delta,
          significance,
          reason: `${ref.dimension} ${delta > 0 ? '上升' : '下降'} ${absDelta} 分`,
          evidenceRefs: freezeArray([buildEvidenceRef(sourceRef, 0.85, `${ref.dimension} score change`)]),
          day: ref.day,
        }));
      }
    }
  }

  return freezeArray(highlights);
}

function buildInteractionSceneRefs(
  input: NarrativeSignalPackInput,
): readonly InteractionSceneRef[] {
  return freezeArray(
    input.interactionSceneRefs.map((scene) => {
      const sourceRef = buildSourceRef('interaction_scene', scene.sceneId, scene.sceneType);
      return Object.freeze({
        sceneId: scene.sceneId,
        sceneType: scene.sceneType,
        caseId: scene.caseId,
        day: scene.day,
        participants: freezeArray(
          scene.participants.map((p) =>
            Object.freeze({
              actorId: p.actorId,
              actorKind: p.actorKind as InteractionSceneRef['participants'][number]['actorKind'],
              role: p.role,
            }),
          ),
        ),
        outcome: scene.outcome,
        sourceRef,
      });
    }),
  );
}

function buildSourceRefs(input: NarrativeSignalPackInput): readonly SourceRef[] {
  const refs: SourceRef[] = [];

  // Event sources
  for (const event of input.eventSummaries) {
    refs.push(buildSourceRef('event', event.eventId, event.label));
  }

  // Evaluation snapshot sources
  for (const ref of input.evaluationSnapshotRefs) {
    refs.push(buildSourceRef('evaluation_snapshot', ref.snapshotId, `${ref.dimension}: ${ref.score}`));
  }

  // Pressure receipt sources
  for (const receipt of input.pressureReceiptRefs) {
    refs.push(buildSourceRef('pressure_receipt', receipt.receiptId, receipt.headline));
  }

  // Consensus receipt sources
  for (const receipt of input.consensusReceiptRefs) {
    refs.push(buildSourceRef('consensus_receipt', receipt.receiptId, receipt.reason));
  }

  // Interaction scene sources
  for (const scene of input.interactionSceneRefs) {
    refs.push(buildSourceRef('interaction_scene', scene.sceneId, scene.sceneType));
  }

  // Deduplicate by sourceId for determinism
  const seen = new Set<string>();
  const deduped: SourceRef[] = [];
  for (const ref of refs) {
    if (!seen.has(ref.sourceId)) {
      seen.add(ref.sourceId);
      deduped.push(ref);
    }
  }

  return freezeArray(deduped.sort((a, b) => a.sourceId.localeCompare(b.sourceId)));
}

function buildGlobalEvidenceRefs(
  input: NarrativeSignalPackInput,
): readonly EvidenceRef[] {
  const refs: EvidenceRef[] = [];

  // Global context evidence
  if (input.povSummary.activeCaseCount > 0) {
    refs.push(buildEvidenceRef(
      buildSourceRef('event', 'pov-summary', 'POV summary'),
      0.5,
      `${input.povSummary.activeCaseCount} active cases`,
    ));
  }

  if (input.povSummary.urgentSignalCount > 0) {
    refs.push(buildEvidenceRef(
      buildSourceRef('decision_signal', 'urgent-signals', 'Urgent signals'),
      0.7,
      `${input.povSummary.urgentSignalCount} urgent signals`,
    ));
  }

  return freezeArray(refs);
}

// ---------------------------------------------------------------------------
// buildNarrativeSignalPack — the main deterministic builder
// ---------------------------------------------------------------------------

/**
 * Builds a NarrativeSignalPack from compressed input.
 *
 * Pure function. Deterministic. No side effects.
 * Same input → same pack (no randomness, no timestamps).
 *
 * Every signal has evidenceRefs — no evidence-free facts.
 */
export function buildNarrativeSignalPack(
  input: NarrativeSignalPackInput,
): NarrativeSignalPack {
  const packId = buildPackId(input.day, input.actorId);
  const sourceRefs = buildSourceRefs(input);
  const evidenceRefs = buildGlobalEvidenceRefs(input);
  const timelineAnchors = buildTimelineAnchors(input);
  const actorVisibleSignals = buildActorVisibleSignals(input);
  const beliefConflicts = buildBeliefConflictSignals(input);
  const attentionWarnings = buildAttentionWarningSignals(input);
  const commitmentChanges = buildCommitmentChangeSignals(input);
  const pressureHighlights = buildPressureHighlightSignals(input);
  const consensusMovement = buildConsensusMovementSignals(input);
  const evaluationHighlights = buildEvaluationHighlightSignals(input);
  const interactionSceneRefs = buildInteractionSceneRefs(input);

  return Object.freeze({
    packId,
    day: input.day,
    generatedForActorId: input.actorId,
    generatedForActorKind: input.actorKind,
    sourceRefs,
    evidenceRefs,
    timelineAnchors,
    actorVisibleSignals,
    beliefConflicts,
    attentionWarnings,
    commitmentChanges,
    pressureHighlights,
    consensusMovement,
    evaluationHighlights,
    interactionSceneRefs,
    generationConstraints: Object.freeze({ ...input.generationConstraints }),
  }) as NarrativeSignalPack;
}
