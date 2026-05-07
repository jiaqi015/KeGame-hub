/**
 * NarrativeSignalPack v0 — deterministic signal extractor for narrative generation.
 *
 * Mother model alignment:
 * - Section 7: "LLM should not read raw GameState or invent events.
 *   Use deterministic signal extractor first:
 *   DomainEvents + EvaluationSnapshots + ProcessReceipts + POVSnapshot
 *     -> NarrativeSignalPack -> LLM text generation"
 * - Section 18.10: "LLM output cannot be hidden randomness inside core simulation."
 * - Section 19.4: "Interaction transmits information, but effects are decided
 *   by receiver interpretation."
 *
 * Hard constraints:
 * 1. NOT text output. NOT DailyNarrative. NOT DomainEventStore.
 * 2. Every signal must have evidenceRefs — no evidence-free facts.
 * 3. Deterministic: no Date.now, no Math.random, no global state.
 * 4. core/narrative cannot import domain/runtime.
 * 5. LLM reads pack, not raw GameState.
 */

// ---------------------------------------------------------------------------
// SourceRef: traceable origin of a signal
// ---------------------------------------------------------------------------

export interface SourceRef {
  readonly sourceType: 'evaluation_snapshot' | 'pressure_receipt' | 'consensus_receipt'
    | 'attention_state' | 'decision_signal' | 'event' | 'belief' | 'relation'
    | 'interaction_scene' | 'process_receipt';
  readonly sourceId: string;
  readonly summary: string;
}

// ---------------------------------------------------------------------------
// EvidenceRef: evidence supporting a specific signal
// ---------------------------------------------------------------------------

export interface EvidenceRef {
  readonly sourceRef: SourceRef;
  readonly relevance: number; // 0..1
  readonly detail: string;
}

// ---------------------------------------------------------------------------
// TimelineAnchor: a point in the simulation timeline
// ---------------------------------------------------------------------------

export interface TimelineAnchor {
  readonly day: number;
  readonly label: string;
  readonly anchorType: 'event' | 'decision' | 'commitment' | 'process_stage' | 'pressure_shift';
  readonly caseId?: string;
  readonly sourceRef: SourceRef;
}

// ---------------------------------------------------------------------------
// ActorVisibleSignal: what an actor can see
// ---------------------------------------------------------------------------

export interface ActorVisibleSignal {
  readonly signalId: string;
  readonly actorId: string;
  readonly actorKind: 'broker' | 'owner' | 'customer' | 'manager';
  readonly signalKind: string;
  readonly label: string;
  readonly severity: 'info' | 'watch' | 'decision' | 'urgent';
  readonly score?: number;
  readonly evidenceRefs: readonly EvidenceRef[];
  readonly sourceRefs: readonly SourceRef[];
  readonly caseId?: string;
  readonly day: number;
}

// ---------------------------------------------------------------------------
// BeliefConflictSignal: contradiction between beliefs or belief and fact
// ---------------------------------------------------------------------------

export interface BeliefConflictSignal {
  readonly conflictId: string;
  readonly actorId: string;
  readonly actorKind: 'broker' | 'owner' | 'customer' | 'manager';
  readonly conflictKind: 'belief_vs_fact' | 'belief_vs_belief' | 'stale_belief' | 'low_confidence';
  readonly description: string;
  readonly involvedBeliefs: readonly string[];
  readonly severity: 'low' | 'medium' | 'high';
  readonly evidenceRefs: readonly EvidenceRef[];
  readonly caseId?: string;
  readonly day: number;
}

// ---------------------------------------------------------------------------
// AttentionWarningSignal: attention anomaly
// ---------------------------------------------------------------------------

export interface AttentionWarningSignal {
  readonly warningId: string;
  readonly actorId: string;
  readonly actorKind: 'broker' | 'owner' | 'customer' | 'manager';
  readonly warningKind: string;
  readonly detail: string;
  readonly targetId: string;
  readonly targetKind: string;
  readonly evidenceRefs: readonly EvidenceRef[];
  readonly day: number;
}

// ---------------------------------------------------------------------------
// CommitmentChangeSignal: commitment state transition
// ---------------------------------------------------------------------------

export interface CommitmentChangeSignal {
  readonly changeId: string;
  readonly actorId: string;
  readonly actorKind: 'broker' | 'owner' | 'customer' | 'manager';
  readonly commitmentLabel: string;
  readonly fromStatus: string;
  readonly toStatus: string;
  readonly strength: number;
  readonly reason: string;
  readonly evidenceRefs: readonly EvidenceRef[];
  readonly caseId?: string;
  readonly day: number;
}

// ---------------------------------------------------------------------------
// PressureHighlightSignal: notable pressure event
// ---------------------------------------------------------------------------

export interface PressureHighlightSignal {
  readonly highlightId: string;
  readonly caseId: string;
  readonly pressureKind: string;
  readonly headline: string;
  readonly magnitude: number; // 0..100
  readonly source: string;
  readonly evidenceRefs: readonly EvidenceRef[];
  readonly day: number;
}

// ---------------------------------------------------------------------------
// ConsensusMovementSignal: consensus formation progress/regress
// ---------------------------------------------------------------------------

export interface ConsensusMovementSignal {
  readonly movementId: string;
  readonly caseId: string;
  readonly opportunityId: string;
  readonly fromStage: string;
  readonly toStage: string;
  readonly direction: 'forward' | 'stall' | 'regress';
  readonly reason: string;
  readonly evidenceRefs: readonly EvidenceRef[];
  readonly day: number;
}

// ---------------------------------------------------------------------------
// EvaluationHighlightSignal: notable evaluation change
// ---------------------------------------------------------------------------

export interface EvaluationHighlightSignal {
  readonly highlightId: string;
  readonly caseId: string;
  readonly dimension: string; // d1, d2, d3, d4, competitiveness
  readonly fromScore: number;
  readonly toScore: number;
  readonly delta: number;
  readonly significance: 'minor' | 'notable' | 'major';
  readonly reason: string;
  readonly evidenceRefs: readonly EvidenceRef[];
  readonly day: number;
}

// ---------------------------------------------------------------------------
// InteractionSceneRef: reference to an interaction scene
// ---------------------------------------------------------------------------

export interface InteractionSceneRef {
  readonly sceneId: string;
  readonly sceneType: string;
  readonly caseId: string;
  readonly day: number;
  readonly participants: readonly {
    readonly actorId: string;
    readonly actorKind: 'broker' | 'owner' | 'customer' | 'manager';
    readonly role: 'initiator' | 'receiver' | 'observer';
  }[];
  readonly outcome?: string;
  readonly sourceRef: SourceRef;
}

// ---------------------------------------------------------------------------
// GenerationConstraints: limits on what the narrative can say
// ---------------------------------------------------------------------------

export interface GenerationConstraints {
  readonly maxTokens?: number;
  readonly forbiddenTopics: readonly string[];
  readonly requiredEvidenceForFacts: boolean;
  readonly povActorId: string;
  readonly povActorKind: 'broker' | 'owner' | 'customer' | 'manager';
  readonly visibleScope: 'full' | 'case_scoped' | 'owner_scoped' | 'customer_scoped';
  readonly canMentionHiddenOpportunities: boolean;
  readonly canMentionCompanyPressure: boolean;
  readonly canMentionD4Internals: boolean;
}

// ---------------------------------------------------------------------------
// NarrativeSignalPack v0: the main output
// ---------------------------------------------------------------------------

/**
 * NarrativeSignalPack is a deterministic signal extractor output.
 * It contains structured signals with evidence, NOT text.
 * LLM reads this pack to generate narrative, but cannot invent facts.
 *
 * Every signal field has evidenceRefs — no evidence-free claims.
 * Deterministic: same input → same pack (no randomness, no timestamps).
 */
export interface NarrativeSignalPack {
  readonly packId: string;
  readonly day: number;
  readonly generatedForActorId: string;
  readonly generatedForActorKind: 'broker' | 'owner' | 'customer' | 'manager';

  /** References to source data used to build this pack. */
  readonly sourceRefs: readonly SourceRef[];

  /** Evidence supporting the entire pack (global context). */
  readonly evidenceRefs: readonly EvidenceRef[];

  /** Timeline anchors: key moments in the simulation. */
  readonly timelineAnchors: readonly TimelineAnchor[];

  /** Signals visible to the target actor. */
  readonly actorVisibleSignals: readonly ActorVisibleSignal[];

  /** Belief conflicts the actor is aware of. */
  readonly beliefConflicts: readonly BeliefConflictSignal[];

  /** Attention warnings for the actor. */
  readonly attentionWarnings: readonly AttentionWarningSignal[];

  /** Commitment changes relevant to the actor. */
  readonly commitmentChanges: readonly CommitmentChangeSignal[];

  /** Notable pressure events. */
  readonly pressureHighlights: readonly PressureHighlightSignal[];

  /** Consensus formation progress/regress. */
  readonly consensusMovement: readonly ConsensusMovementSignal[];

  /** Notable evaluation changes. */
  readonly evaluationHighlights: readonly EvaluationHighlightSignal[];

  /** Interaction scenes the actor participated in or observed. */
  readonly interactionSceneRefs: readonly InteractionSceneRef[];

  /** Constraints on what the narrative can say. */
  readonly generationConstraints: GenerationConstraints;
}
