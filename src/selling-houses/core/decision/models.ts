/**
 * POV / Decision Support read-only projection types.
 *
 * These types define what actors see, believe, and can intend — NOT what they
 * execute. They are derived from evaluation snapshots, pressure receipts,
 * recommendation drafts, and availability data.
 *
 * Mother model alignment:
 * - Section 5: Human Decision Model (DecisionState, DecisionMoment, DecisionCommitment)
 * - Section 8: Broker Service Essence
 * - Section 9: POV And Interaction Design (visibleFacts, inferredSignals, hiddenGlobalFacts)
 * - Section 16: High-Priority Interfaces (ActorKnowledge, SignalSource, ActorPOV)
 */

// ---------------------------------------------------------------------------
// SignalSource — where the actor learned this information
// ---------------------------------------------------------------------------

export type SignalSource =
  | 'self_sourced'    // actor discovered it themselves
  | 'relayed'         // delivered by another actor
  | 'observed'        // directly experienced
  | 'inferred'        // guessed from incomplete evidence
  | 'systemic';       // policy, market, season, organization signal

// ---------------------------------------------------------------------------
// SignalTrace — source trail for belief formation
// ---------------------------------------------------------------------------

/**
 * Extended signal source that includes service interaction as a distinct origin.
 * Mother model Section 8: broker service interactions transform information
 * into decision evidence. Section 19.4: "A call can emit independent events
 * for information delivery, belief update, relation update, and commitment."
 */
export type SignalTraceSource =
  | SignalSource
  | 'service_interaction';  // information gained through broker service interaction

/**
 * Traces a belief or knowledge item back to its source signal.
 * Enables "why does this actor think this?" explanations.
 *
 * Mother model Section 19.1: "knowledge = actor has access to a source record
 * or observation; belief = actor's interpreted confidence/claim about what
 * that information means."
 */
export interface SignalTrace {
  readonly id: string;
  readonly source: SignalTraceSource;
  /** Key of the ActorKnownFact or signal that originated this trace. */
  readonly originKey: string;
  /** Human-readable label of the origin. */
  readonly originLabel: string;
  /** Day the signal was received. */
  readonly receivedDay: number;
  /** How credible this source is perceived by the actor (0..1). */
  readonly sourceCredibility: number;
  /** Optional: which service interaction produced this trace. */
  readonly interactionId?: string;
}

// ---------------------------------------------------------------------------
// ActorBelief — interpreted confidence/claim about what information means
// ---------------------------------------------------------------------------

/**
 * The kind of belief an actor holds. These are the structured belief objects
 * that affect decisions.
 *
 * Mother model Section 19.2: "Use typed belief objects for price anchor,
 * broker trust, market heat, seller sincerity, buyer seriousness, financing
 * confidence, and service-path confidence."
 */
export type BeliefKind =
  | 'price_anchor'              // how much the listing is worth in actor's mind
  | 'broker_trust'              // how much the actor trusts the broker
  | 'market_heat'               // how hot/active the market is perceived
  | 'seller_sincerity'          // how serious the seller is about selling
  | 'buyer_seriousness'         // how serious the buyer is about buying
  | 'financing_confidence'      // confidence in financing/loan approval
  | 'service_path_confidence';  // confidence in the service path to close

/**
 * How confident the actor is in this belief.
 * Mother model Section 19.1: "belief = actor's interpreted confidence/claim"
 */
export type BeliefConfidence =
  | 'certain'       // actor is very sure (0.9+)
  | 'confident'     // actor is fairly sure (0.7-0.9)
  | 'uncertain'     // actor is unsure (0.4-0.7)
  | 'speculative';  // actor is guessing (<0.4)

/**
 * A single belief held by an actor. Beliefs are derived from knowledge and
 * interpretation, NOT from global truth. They can be wrong.
 *
 * Mother model Section 19.1: "Conflicting 'facts' between actors are not
 * conflicting GlobalTruth; they are conflicting beliefs or interpretations
 * in ActorKnowledge."
 */
export interface ActorBelief {
  readonly id: string;
  readonly kind: BeliefKind;
  /** Human-readable label. */
  readonly label: string;
  /** The actor's interpreted value (e.g., "market is hot", "price should be 500万"). */
  readonly value: string | number | boolean;
  /** Numeric confidence 0..1. */
  readonly confidence: number;
  /** Categorical confidence level. */
  readonly confidenceLevel: BeliefConfidence;
  /** Direction of this belief relative to objective reality (if known). */
  readonly direction: 'positive' | 'negative' | 'neutral' | 'unknown';
  /** IDs of SignalTrace items that support this belief. */
  readonly supportingTraceIds: readonly string[];
  /** Day this belief was last updated. */
  readonly lastUpdatedDay: number;
  /** Whether this belief is stale (not refreshed recently). */
  readonly stale: boolean;
}

/**
 * A conflict between beliefs or between belief and fact.
 *
 * Mother model Section 19.1: "Conflict is usually between belief and fact,
 * or between two beliefs, not between two GlobalTruths."
 */
export type BeliefConflictKind =
  | 'belief_vs_fact'              // actor's belief contradicts known facts
  | 'belief_vs_belief'            // actor holds contradictory beliefs
  | 'stale_belief'                // belief not updated despite new information
  | 'low_confidence_interpretation'; // actor interpreting weak signals

export interface BeliefConflict {
  readonly id: string;
  readonly kind: BeliefConflictKind;
  /** Human-readable description of the conflict. */
  readonly description: string;
  /** IDs of the beliefs involved in this conflict. */
  readonly beliefIds: readonly string[];
  /** Severity of the conflict. */
  readonly severity: 'high' | 'medium' | 'low';
  /** How this conflict affects decision-making. */
  readonly decisionImpact: string;
}

// ---------------------------------------------------------------------------
// ActorKnowledge — what an actor has encountered and believes
// ---------------------------------------------------------------------------

export interface ActorKnownFact {
  readonly key: string;
  readonly label: string;
  readonly value: string | number | boolean;
  readonly source: SignalSource;
  readonly confidence: number; // 0..1
  readonly asOfDay: number;
}

export interface ActorInferredSignal {
  readonly key: string;
  readonly label: string;
  readonly direction: 'positive' | 'negative' | 'neutral' | 'unknown';
  readonly strength: number; // 0..100
  readonly source: SignalSource;
  readonly basedOn: readonly string[]; // keys of known facts
}

export interface ActorHiddenFact {
  readonly key: string;
  readonly reason: string; // why the actor cannot see this
}

/**
 * What an actor knows, infers, and cannot see.
 * This is the core of information asymmetry modeling.
 */
export interface ActorKnowledge {
  readonly visibleFacts: readonly ActorKnownFact[];
  readonly inferredSignals: readonly ActorInferredSignal[];
  readonly hiddenGlobalFacts: readonly ActorHiddenFact[];
  /** Signal traces — source trail for how the actor learned what they know. */
  readonly traces: readonly SignalTrace[];
  /** Beliefs — actor's interpreted claims about what information means. */
  readonly beliefs: readonly ActorBelief[];
  /** Active belief conflicts — contradictions the actor is aware of. */
  readonly beliefConflicts: readonly BeliefConflict[];
}

// ---------------------------------------------------------------------------
// DecisionState — current decision posture
// ---------------------------------------------------------------------------

export type DecisionPosture =
  | 'undecided'
  | 'leaning_toward'
  | 'committed'
  | 'waiting'
  | 'stuck_conflicted'
  | 'avoiding';

export interface DecisionState {
  readonly posture: DecisionPosture;
  readonly pressureLevel: number; // 0..100
  readonly confidence: number; // 0..1
  readonly blockers: readonly string[];
  readonly lastUpdatedDay: number;
}

// ---------------------------------------------------------------------------
// DecisionMoment — situated choices under pressure
// ---------------------------------------------------------------------------

export interface DecisionMoment {
  readonly id: string;
  readonly label: string;
  readonly trigger: string;
  readonly urgency: 'high' | 'medium' | 'low';
  readonly relatedCaseId?: string;
  readonly relatedSignalKeys: readonly string[];
}

// ---------------------------------------------------------------------------
// DecisionCommitment — actor's current commitment state
// ---------------------------------------------------------------------------

export type CommitmentStrength = 'strong' | 'tentative' | 'conditional' | 'expired' | 'revoked';

export interface DecisionCommitment {
  readonly id: string;
  readonly actorRole: 'broker' | 'owner' | 'customer';
  readonly description: string;
  readonly strength: CommitmentStrength;
  readonly scope: string; // e.g. caseId, opportunityId
  readonly createdDay: number;
  readonly expiresAtDay?: number;
  readonly revocable: boolean;
}

// ---------------------------------------------------------------------------
// CommitmentOwnerKind — who holds the commitment
// ---------------------------------------------------------------------------

/**
 * Who holds the commitment. Mother model Section 5.2: owner, customer, broker,
 * manager each have distinct commitment scopes.
 */
export type CommitmentOwnerKind = 'owner' | 'customer' | 'broker' | 'manager';

// ---------------------------------------------------------------------------
// CommitmentScope — what the commitment is about
// ---------------------------------------------------------------------------

/**
 * What the commitment is about. Derived from action specs, choice set, and
 * waiting posture. NOT an exhaustive list — extend as needed.
 *
 * Mother model Section 5.2 (role-specific decisions) and Section 11
 * (business acceleration processes).
 */
export type CommitmentScope =
  | 'price_adjustment'
  | 'open_day_participation'
  | 'sincerity_sale'
  | 'showing'
  | 'revisit'
  | 'offer'
  | 'negotiation'
  | 'wait'
  | 'withdraw';

// ---------------------------------------------------------------------------
// CommitmentStatus — lifecycle state of the commitment
// ---------------------------------------------------------------------------

/**
 * Commitment lifecycle status.
 *
 * Mother model Section 19.6: "Commitments must have strength, credibility,
 * expiry, owner, scope, and revocability."
 */
export type CommitmentStatus =
  | 'none'       // no commitment detected
  | 'weak'       // inferred from posture/belief, not explicit
  | 'active'     // commitment is live and actor is acting on it
  | 'stale'      // commitment was made but no recent follow-through
  | 'revoked'    // commitment was explicitly revoked
  | 'fulfilled'; // commitment was completed

// ---------------------------------------------------------------------------
// CommitmentInferredFrom — where the commitment was derived from
// ---------------------------------------------------------------------------

/**
 * Source of commitment inference. Since we cannot emit real events in this
 * round, commitments are read-models derived from existing state.
 */
export type CommitmentInferredFrom =
  | 'choice_set'
  | 'waiting_posture'
  | 'actor_belief'
  | 'consensus_receipt'
  | 'opportunity_stage'
  | 'owner_readiness';

// ---------------------------------------------------------------------------
// CommitmentTrace — history of commitment state transitions
// ---------------------------------------------------------------------------

/**
 * A single commitment state transition. Append-only trace.
 *
 * Mother model Section 19.6: "Do not rewrite history when revoked;
 * emit commitment_revoked and update current commitment state."
 *
 * In Round 1 we cannot emit real events, so traces are derived from
 * the difference between inferred commitment states across ticks.
 */
export interface CommitmentTrace {
  readonly id: string;
  /** The commitment this trace belongs to. */
  readonly commitmentId: string;
  /** Status at this point in the trace. */
  readonly status: CommitmentStatus;
  /** What caused this transition. */
  readonly inferredFrom: CommitmentInferredFrom;
  /** Human-readable reason for the transition. */
  readonly reason: string;
  /** Day the transition was observed. */
  readonly day: number;
  /** Strength at this point (0..100). */
  readonly strength: number;
}

// ---------------------------------------------------------------------------
// CommitmentState — current commitment for a case/actor
// ---------------------------------------------------------------------------

/**
 * Current commitment state for a single actor-case pair.
 *
 * This is a READ-ONLY derived projection. It is NOT a ContractFact.
 * It does NOT write to GameState. It does NOT create DomainEventEntry.
 *
 * Mother model Section 19.6: "Commitments must have strength, credibility,
 * expiry, owner, scope, and revocability."
 */
export interface CommitmentState {
  readonly id: string;
  /** Who holds this commitment. */
  readonly owner: CommitmentOwnerKind;
  /** What the commitment is about. */
  readonly scope: CommitmentScope;
  /** Human-readable label. */
  readonly label: string;
  /** Current lifecycle status. */
  readonly status: CommitmentStatus;
  /** Strength of the commitment (0..100). */
  readonly strength: number;
  /** Credibility — how likely the actor is to follow through (0..1). */
  readonly credibility: number;
  /** Day the commitment was first inferred. */
  readonly createdDay: number;
  /** Day the commitment expires, if applicable. */
  readonly expiryDay?: number;
  /** Why the commitment expires, if applicable. */
  readonly expiryReason?: string;
  /** Whether this commitment can be revoked. */
  readonly revocable: boolean;
  /** What this commitment was inferred from. */
  readonly inferredFrom: CommitmentInferredFrom;
  /** Trace of state transitions. */
  readonly traces: readonly CommitmentTrace[];
  /** IDs of beliefs that support this commitment. */
  readonly supportingBeliefIds: readonly string[];
  /** IDs of choice alternatives this commitment maps to. */
  readonly relatedAlternativeIds: readonly string[];
  /** Case this commitment belongs to. */
  readonly caseId: string;
}

// ---------------------------------------------------------------------------
// NoDecisionReadModel — explicit "why no action" explanation
// ---------------------------------------------------------------------------

/**
 * Explicit read-model for why no action was taken.
 *
 * Mother model Section 19.3: "Not deciding is not absence of state.
 * Waiting is a decision posture with memory and pressure."
 *
 * This extends WaitingState with structured exit conditions and
 * the alternatives that were considered but not acted upon.
 */
export interface NoDecisionReadModel {
  /** Current waiting posture. */
  readonly posture: WaitingPosture;
  /** IDs of alternatives that were considered. */
  readonly consideredAlternativeIds: readonly string[];
  /** Constraints that are blocking action. */
  readonly blockingConstraints: readonly string[];
  /** What would need to happen for the actor to act. */
  readonly exitCondition: string;
  /** When the actor should re-evaluate. */
  readonly nextReviewDay: number;
  /** Pressure accumulating while waiting (0..100). */
  readonly accumulatedPressure: number;
  /** Belief trace IDs that explain the waiting posture. */
  readonly beliefTraceIds: readonly string[];
}

// ---------------------------------------------------------------------------
// ActionCommandDraft — intention to act, NOT execution
// ---------------------------------------------------------------------------

/**
 * Maps from a recommendation draft. This is what the broker intends to do,
 * NOT what the simulation will execute. The simulation decides real consequences.
 */
export interface ActionCommandDraft {
  readonly id: string;
  readonly caseId: string;
  readonly actionSpecId: string;
  readonly legacyActionId: string;
  readonly label: string;
  readonly priority: number;
  readonly confidence: number;
  readonly enabled: boolean;
  readonly disabledReason: string;
  readonly supportingSignalKeys: readonly string[];
  readonly decisionMomentIds: readonly string[];
  /** Energy cost from action spec. 0 if unknown. */
  readonly estimatedEnergyCost: number;
  /** Promotion budget cost from action spec. 0 if unknown. */
  readonly estimatedBudgetCost: number;
  /** Why this action is recommended right now. */
  readonly rationale: string;
  /** Which beliefs support this action recommendation (trace IDs). */
  readonly beliefTraceIds: readonly string[];
}

// ---------------------------------------------------------------------------
// ChoiceSet — what alternatives the actor perceives
// ---------------------------------------------------------------------------

/**
 * Where the choice set comes from. This matters because broker-framed options
 * carry different weight than self-sourced ones, and system defaults may not
 * reflect the actor's actual preferences.
 *
 * Mother model Section 19.2: "Choice sets are generated by combining actor
 * goals, POV-known options, broker framing, search/exploration behavior,
 * constraints, and system-visible default options."
 */
export type ChoiceSetSource =
  | 'self'                  // actor discovered/evaluated options themselves
  | 'broker-framed'         // broker presented and framed these options
  | 'system-default'        // system-visible default options (e.g. withdraw)
  | 'inferred-from-pressure'; // options that emerged from competition/pressure signals

export interface DecisionAlternative {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  /** Which ActionCommandDraft this alternative maps to, if any. */
  readonly actionCommandDraftId?: string;
  readonly source: ChoiceSetSource;
  /** How attractive this option appears to the actor (0..100). */
  readonly attractiveness: number;
  /** Whether this option is currently feasible given constraints. */
  readonly feasible: boolean;
  /** Why this option is not feasible, if applicable. */
  readonly constraintReason?: string;
  /** What supporting signals suggest this option. */
  readonly supportingSignalKeys: readonly string[];
  /** Which beliefs support this alternative (trace IDs). */
  readonly beliefTraceIds: readonly string[];
}

export interface ChoiceConstraint {
  readonly key: string;
  readonly label: string;
  readonly kind: 'resource' | 'trust' | 'timing' | 'information' | 'relationship' | 'market';
  /** Whether this constraint is currently blocking alternatives. */
  readonly blocking: boolean;
  readonly detail: string;
}

export interface AlternativeSet {
  readonly alternatives: readonly DecisionAlternative[];
  readonly source: ChoiceSetSource;
  readonly constraints: readonly ChoiceConstraint[];
  /** How many alternatives are currently feasible. */
  readonly feasibleCount: number;
  /** How many alternatives are mapped to ActionCommandDrafts. */
  readonly draftMappedCount: number;
}

// ---------------------------------------------------------------------------
// WaitingPosture — not deciding is a decision
// ---------------------------------------------------------------------------

/**
 * Waiting is not absence of state. It is a decision posture with memory and
 * pressure. Different waiting postures imply different broker strategies.
 *
 * Mother model Section 19.3: "Waiting updates anxiety, attention, trust,
 * patience, opportunity staleness, and interpretation of new signals."
 */
export type WaitingPosture =
  | 'not_waiting'             // actor is actively deciding or has decided
  | 'wait_observe'            // gathering information, watching market
  | 'wait_for_better_offer'   // holding out for a better deal
  | 'wait_for_family'         // family decision participants not yet aligned
  | 'wait_for_market_signal'  // waiting for external market event
  | 'avoid_decision'          // actively avoiding the decision
  | 'stuck_conflicted';       // wants to decide but internal conflict prevents it

export interface WaitingState {
  readonly posture: WaitingPosture;
  /** Human-readable explanation of why the actor is waiting. */
  readonly reason: string;
  /** What signal or event would break the wait. */
  readonly triggerToAct?: string;
  /** How long the actor has been in this waiting posture (days). */
  readonly waitingSinceDay?: number;
  /** Pressure accumulating during the wait (0..100). */
  readonly accumulatedPressure: number;
  /** Which beliefs contribute to this waiting posture (trace IDs). */
  readonly beliefTraceIds: readonly string[];
}

export interface NoDecision {
  /** The waiting posture that explains why no decision was made. */
  readonly waitingState: WaitingState;
  /** AlternativeSet that was considered but not acted upon. */
  readonly consideredAlternatives: AlternativeSet;
  /** What the actor would need to see to change their posture. */
  readonly exitCondition: string;
}

// ---------------------------------------------------------------------------
// PressureSummary — compressed pressure receipt info for POV
// ---------------------------------------------------------------------------

export interface PressureSourceSummary {
  readonly source: string;
  readonly category: 'wired' | 'pending' | 'informational';
  readonly present: boolean;
}

export interface PressureReceiptSummary {
  readonly available: boolean;
  readonly day: number;
  readonly coverage: number; // 0..1
  readonly maxConfidence: number;
  readonly wiredCount: number;
  readonly wiredTotal: number;
  readonly sources: readonly PressureSourceSummary[];
  readonly headline: string;
}

// ---------------------------------------------------------------------------
// CasePOVContext — one case's data from a specific actor's POV
// ---------------------------------------------------------------------------

export interface CasePOVContext {
  readonly caseId: string;
  readonly title: string;
  readonly status: string;
  readonly assetScore: {
    readonly score: number;
    readonly d1: number;
    readonly d2: number;
    readonly d3: number;
    readonly d4?: number;
    readonly blockers: readonly string[];
    readonly topDriverLabels: readonly string[];
  };
  readonly ownerReadiness: {
    readonly score: number;
    readonly trust: number;
    readonly urgency: number;
    readonly patience: number;
  };
  readonly opportunityCount: number;
  readonly lateStageOpportunityCount: number;
  readonly signals: readonly {
    readonly key: string;
    readonly label: string;
    readonly severity: string;
    readonly score?: number;
  }[];
  readonly recommendationDrafts: readonly {
    readonly id: string;
    readonly actionSpecId: string;
    readonly label: string;
    readonly enabled: boolean;
    readonly priority: number;
  }[];
  readonly decisionMoments: readonly {
    readonly id: string;
    readonly label: string;
    readonly urgency: string;
  }[];
  readonly knowledge: ActorKnowledge;
  readonly decisionState: DecisionState;
  readonly commitments: readonly DecisionCommitment[];
  /** What alternatives the actor perceives for this case. */
  readonly choiceSet: AlternativeSet;
  /** Current waiting posture — not deciding is a decision. */
  readonly waitingState: WaitingState;
  /** Inferred commitment states — derived from choice set, beliefs, readiness. */
  readonly commitmentStates: readonly CommitmentState[];
  /** Explicit "why no action" read-model. Present when posture is not 'not_waiting'. */
  readonly noDecision?: NoDecisionReadModel;
}

// ---------------------------------------------------------------------------
// BrokerPOVSnapshot — what the broker sees
// ---------------------------------------------------------------------------

/**
 * Broker's full operational POV. Can see all active cases, their evaluation
 * snapshots, pressure summaries, recommendation drafts, and availability.
 *
 * Mother model Section 8: broker is information collector, interpreter,
 * decision-support provider, service-path organizer.
 */
export interface BrokerPOVSnapshot {
  readonly role: 'broker';
  readonly readOnly: true;
  readonly day: number;
  readonly actorId: string;
  readonly cases: readonly CasePOVContext[];
  readonly pressureSummary: PressureReceiptSummary;
  readonly actionCommandDrafts: readonly ActionCommandDraft[];
  readonly decisionMoments: readonly DecisionMoment[];
  readonly energy: number;
  readonly promotionBudget: number;
  readonly globalKnowledge: ActorKnowledge;
}

// ---------------------------------------------------------------------------
// OwnerPOVContext — one case from owner's perspective
// ---------------------------------------------------------------------------

/**
 * Owner's case-scoped POV. This is intentionally more limited than broker POV:
 * - NO raw GameState
 * - NO hidden opportunities or customer identities
 * - NO company/manager internal pressure
 * - Only their own case's evaluation and signals
 * - Only signals that are visible to the owner (not internal broker reasoning)
 */
export interface OwnerPOVContext {
  readonly caseId: string;
  readonly title: string;
  readonly status: string;
  readonly assetScore: {
    readonly score: number;
    readonly d1: number;
    readonly d2: number;
    readonly d3: number;
    /** D4 is hidden from owner — they don't see competition internals */
  };
  readonly ownerReadiness: {
    readonly score: number;
    readonly trust: number;
    readonly urgency: number;
    readonly patience: number;
  };
  /** Only signals visible to the owner (not broker-internal reasoning) */
  readonly visibleSignals: readonly {
    readonly key: string;
    readonly label: string;
    readonly severity: string;
  }[];
  readonly knowledge: ActorKnowledge;
  readonly decisionState: DecisionState;
  readonly commitments: readonly DecisionCommitment[];
  /** What alternatives the owner perceives — limited to owner-visible options. */
  readonly choiceSet: AlternativeSet;
  /** Current waiting posture — not deciding is a decision. */
  readonly waitingState: WaitingState;
  /** Inferred commitment states — owner-relevant only. */
  readonly commitmentStates: readonly CommitmentState[];
  /** Explicit "why no action" read-model. Present when posture is not 'not_waiting'. */
  readonly noDecision?: NoDecisionReadModel;
}

// ---------------------------------------------------------------------------
// OwnerPOVSnapshot — what the owner sees
// ---------------------------------------------------------------------------

/**
 * Owner's POV. Case-scoped, cannot see full GameState, hidden opportunities,
 * customer privacy, or company/manager internals.
 *
 * Mother model Section 6.4: OwnerPOV contains self-sourced, relayed,
 * observed, inferred, systemic signals — but visibility is bounded.
 */
export interface OwnerPOVSnapshot {
  readonly role: 'owner';
  readonly readOnly: true;
  readonly day: number;
  readonly cases: readonly OwnerPOVContext[];
  /** Owner does NOT see pressure receipts — they see broker-communicated effects only */
  readonly knowledge: ActorKnowledge;
}
