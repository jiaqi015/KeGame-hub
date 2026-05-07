/**
 * LLM Input Packs — compressed, deterministic, no-raw-GameState.
 *
 * Each pack is a self-contained context blob that an LLM can reason over
 * without seeing mutable simulation state. Packs are built by pure functions
 * from read-only snapshots and receipts.
 *
 * Mother model alignment:
 * - Section 7: "LLM should not read raw GameState or invent events."
 * - Section 10: "LLM sees compressed POV, not full GlobalTruth."
 * - Section 18.10: "Store model versions and LLM-derived structured outputs for replay."
 *
 * Hard constraints:
 * - No raw GameState fields.
 * - No mutable Case / Opportunity / CustomerRuntimeState references.
 * - No RNG state or seed exposure.
 * - Pack hash must be deterministic for replay.
 */

// ---------------------------------------------------------------------------
// NarrativeGenerationInputPack — from NarrativeSignalPack
// ---------------------------------------------------------------------------

/**
 * Compressed narrative context. Built from domain events, evaluation snapshots,
 * and POV summary. Does NOT include raw GameState.
 */
export interface NarrativeGenerationInputPack {
  readonly kind: 'narrative_generation';
  readonly day: number;
  /** Summarized events (kind + label + tone), not raw DomainEventEntry. */
  readonly eventSummaries: readonly {
    readonly kind: string;
    readonly label: string;
    readonly tone: 'neutral' | 'success' | 'danger';
    readonly caseId?: string;
  }[];
  /** IDs of evaluation snapshots referenced (for replay traceability). */
  readonly evaluationSnapshotIds: readonly string[];
  /** Actor POV summary (who is this narrative for?). */
  readonly povActorId: string;
  readonly povActorKind: 'broker' | 'owner' | 'customer' | 'manager';
  /** Current day narrative context. */
  readonly dayContext: {
    readonly activeCaseCount: number;
    readonly urgentSignalCount: number;
    readonly recentDecisionCount: number;
  };
  /** What the narrative should focus on. */
  readonly narrativeFocus: 'daily_summary' | 'decision_moment' | 'crisis' | 'celebration' | 'foreshadowing';
}

// ---------------------------------------------------------------------------
// DialogueGenerationInputPack — from InteractionScene + ActorPOV
// ---------------------------------------------------------------------------

/**
 * Compressed dialogue context. Built from interaction scene metadata and
 * actor beliefs/knowledge. Does NOT include hidden opportunities or
 * customer identities beyond what the scene actor can see.
 */
export interface DialogueGenerationInputPack {
  readonly kind: 'dialogue_generation';
  readonly day: number;
  /** Scene metadata (not the full InteractionScene object). */
  readonly scene: {
    readonly sceneId: string;
    readonly sceneType: 'owner_call' | 'customer_followup' | 'showing' | 'focus_meeting' | 'price_report' | 'offer_negotiation' | 'manager_review';
    readonly caseId: string;
  };
  /** Speaker's compressed POV. */
  readonly speaker: {
    readonly actorId: string;
    readonly actorKind: 'broker' | 'owner' | 'customer' | 'manager';
    readonly beliefKeys: readonly string[];
    readonly knownFactKeys: readonly string[];
  };
  /** Listener's compressed POV (limited to what speaker can infer). */
  readonly listener: {
    readonly actorId: string;
    readonly actorKind: 'broker' | 'owner' | 'customer' | 'manager';
    readonly inferredBeliefKeys: readonly string[];
  };
  /** Current decision posture of the speaker. */
  readonly speakerDecisionPosture: string;
  /** Active commitment summary (what has been promised). */
  readonly activeCommitmentSummary: readonly string[];
  /** Constraints on the dialogue (what cannot be said/discussed). */
  readonly dialogueConstraints: readonly string[];
}

// ---------------------------------------------------------------------------
// StrategyRecommendationInputPack — from BrokerPOV + allowed actions
// ---------------------------------------------------------------------------

/**
 * Compressed strategy context for broker action recommendations.
 * Built from BrokerPOVSnapshot + action availability + energy/budget.
 * Does NOT include raw GameState or hidden opportunity details.
 */
export interface StrategyRecommendationInputPack {
  readonly kind: 'strategy_recommendation';
  readonly day: number;
  readonly actorId: string;
  /** Compressed case summaries (not full CasePOVContext). */
  readonly caseSummary: readonly {
    readonly caseId: string;
    readonly competitiveness: number;
    readonly d1: number;
    readonly d2: number;
    readonly d3: number;
    readonly ownerReadiness: number;
    readonly signalCount: number;
    readonly urgentSignalCount: number;
    readonly topBlockers: readonly string[];
    readonly waitingPosture: string;
  }[];
  /** Allowed actions with cost constraints. */
  readonly allowedActions: readonly {
    readonly actionId: string;
    readonly label: string;
    readonly energyCost: number;
    readonly promotionBudgetCost: number;
    readonly enabled: boolean;
    readonly disabledReason?: string;
  }[];
  /** Resource constraints. */
  readonly resources: {
    readonly energy: number;
    readonly maxEnergy: number;
    readonly promotionBudget: number;
  };
  /** Pressure summary (compressed, not raw receipts). */
  readonly pressureSummary: {
    readonly available: boolean;
    readonly coverage: number;
    readonly headline: string;
  };
  /** Active decision moments. */
  readonly activeDecisionMoments: readonly string[];
}

// ---------------------------------------------------------------------------
// SimulatedReasoningInputPack — for decision evaluation / belief update
// ---------------------------------------------------------------------------

/**
 * Compressed reasoning context for decision evaluation proposals.
 * Built from ActorPOVSnapshot + ChoiceSet + Commitment/Attention summaries.
 * Does NOT include raw GameState.
 */
export interface SimulatedReasoningInputPack {
  readonly kind: 'simulated_reasoning';
  readonly day: number;
  readonly caseId: string;
  readonly actorId: string;
  readonly actorKind: 'broker' | 'owner' | 'customer' | 'manager';
  /** Current decision posture. */
  readonly decisionState: {
    readonly posture: string;
    readonly pressureLevel: number;
    readonly confidence: number;
    readonly blockers: readonly string[];
  };
  /** Compressed choice set. */
  readonly choiceSet: {
    readonly alternativeCount: number;
    readonly feasibleCount: number;
    readonly blockingConstraintCount: number;
    readonly alternatives: readonly {
      readonly id: string;
      readonly label: string;
      readonly attractiveness: number;
      readonly feasible: boolean;
    }[];
  };
  /** Compressed commitment summary. */
  readonly commitmentSummary: {
    readonly activeCount: number;
    readonly staleCount: number;
    readonly strongestCommitmentLabel?: string;
  };
  /** Actor's beliefs (compressed). */
  readonly beliefs: readonly {
    readonly kind: string;
    readonly label: string;
    readonly value: string | number | boolean;
    readonly confidence: number;
    readonly direction: string;
  }[];
  /** Waiting posture (if any). */
  readonly waitingPosture?: {
    readonly posture: string;
    readonly reason: string;
    readonly accumulatedPressure: number;
  };
  /** Available action IDs for this case. */
  readonly availableActionIds: readonly string[];
  /** Pressure summary. */
  readonly pressureSummary: {
    readonly available: boolean;
    readonly coverage: number;
  };
}

// ---------------------------------------------------------------------------
// Union type for all input packs
// ---------------------------------------------------------------------------

export type LlmInputPack =
  | NarrativeGenerationInputPack
  | DialogueGenerationInputPack
  | StrategyRecommendationInputPack
  | SimulatedReasoningInputPack;
