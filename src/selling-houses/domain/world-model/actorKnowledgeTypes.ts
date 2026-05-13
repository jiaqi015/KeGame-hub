/**
 * ActorKnowledgeTypes — types for actor-visible source records and belief layers.
 *
 * Architecture position:
 *   GlobalTruth (InformationSourceRecord registry)
 *     → ActorKnowledgeSnapshot (what this actor can see)
 *       → ActorBeliefUpdate (how the actor interprets what they see)
 *         → BigWorldPOVProjection (bounded product surface)
 *
 * Hard constraints:
 *   - ActorKnowledgeSnapshot never exposes raw registry
 *   - Hidden sources (visibility.scope === 'no_one') never enter any snapshot
 *   - BeliefConfidence is separate from SourceConfidence
 *   - InformationDelay is actor-dependent, not source-inherent
 *   - SourceCredibility is relational (same source, different actors = different credibility)
 *   - All types are append-only snapshots; no mutation methods
 *
 * Mother model alignment:
 *   Section 9: POV And Interaction Design
 *     "GlobalTruth → POVProjection → ImmersiveInteractionScene"
 *   Section 19.1: Knowing vs Believing
 *     "knowledge = actor has access to a source record or observation"
 *     "belief = actor's interpreted confidence/claim about what that information means"
 *   Section 13: Causal Transmission
 *     "source signal → actor receives → belief/pressure changes"
 */

import type {
  InformationSourceRecord,
  SourceKind,
  ActorRole,
  VisibilityScope,
  EntityRef,
} from './informationSourceTypes.js';

// ════════════════════════════════════════════════════════════════════════════
// BeliefConfidence — actor's interpreted confidence in a belief (0-1)
// ════════════════════════════════════════════════════════════════════════════

/**
 * BeliefConfidence represents how certain an actor is about a belief.
 *
 * This is DISTINCT from InformationSourceRecord.confidence:
 *   - SourceConfidence = how accurate the source itself is (system property)
 *   - BeliefConfidence = how much the actor trusts/believes this information
 *     (relational property: depends on source credibility, actor profile, context)
 *
 * A source with confidence 0.95 may produce a belief with confidence 0.3
 * if the actor distrusts the source. Conversely, a source with confidence 0.6
 * may produce a belief with confidence 0.8 if the actor trusts it deeply.
 */
export interface BeliefConfidence {
  /** Normalized confidence in [0, 1]. */
  readonly value: number;
  /** How this confidence was derived. */
  readonly derivation: 'direct_observation' | 'trusted_relay' | 'inference' | 'broker_framing' | 'policy_signal';
  /** Which source record(s) contributed to this belief. */
  readonly sourceIds: readonly string[];
  /** Day the belief was formed or last updated. */
  readonly asOfDay: number;
}

// ════════════════════════════════════════════════════════════════════════════
// InformationDelay — actor-dependent delay before a source becomes visible
// ════════════════════════════════════════════════════════════════════════════

/**
 * InformationDelay captures the delay between when a source record is created
 * and when a specific actor can perceive it.
 *
 * Delays are actor-dependent:
 *   - Owner perception lag: market signals reach owners slowly (1-3 days)
 *   - Broker info speed: brokers hear rival actions faster (0-1 days)
 *   - Manager reporting: manager sees aggregated signals (1-2 days)
 *   - Customer exposure: customers see platform traffic immediately (0 days)
 *
 * The delay is computed from:
 *   visibility.baseDelayDays + actor-specific modifier
 */
export interface InformationDelay {
  /** Base delay from the source's visibility policy. */
  readonly baseDelayDays: number;
  /** Actor-specific modifier (e.g., owner trust increases speed). */
  readonly actorModifierDays: number;
  /** Total effective delay in days. */
  readonly effectiveDelayDays: number;
  /** Day the source was created. */
  readonly sourceDay: number;
  /** Day the source becomes visible to this actor. */
  readonly visibleAfterDay: number;
}

// ════════════════════════════════════════════════════════════════════════════
// SourceCredibility — how trustworthy an actor considers a source
// ════════════════════════════════════════════════════════════════════════════

/**
 * SourceCredibility is relational: the same source has different credibility
 * to different actors.
 *
 * Example:
 *   - A rival_action source with evidenceStrength='rumor' has low credibility
 *     to the player broker but may have high credibility to the owner
 *     (if the owner heard it from a trusted neighbor).
 *   - A comparable_transaction from 'platform公开' has high credibility
 *     to a data-driven broker but low credibility to an emotional owner.
 */
export interface SourceCredibility {
  /** Credibility score in [0, 1] for this actor. */
  readonly score: number;
  /** Why the credibility is at this level. */
  readonly factors: readonly CredibilityFactor[];
}

/**
 * A single factor affecting source credibility.
 */
export interface CredibilityFactor {
  /** What aspect affects credibility. */
  readonly dimension: 'source_type' | 'evidence_strength' | 'relay_chain' | 'actor_trust' | 'recency' | 'domain_expertise';
  /** Numeric contribution: negative = reduces credibility, positive = increases. */
  readonly contribution: number;
  /** Human-readable reason. */
  readonly reason: string;
}

// ════════════════════════════════════════════════════════════════════════════
// VisibleSourceRef — bounded reference to a source record
// ════════════════════════════════════════════════════════════════════════════

/**
 * VisibleSourceRef is a bounded reference to a source record.
 *
 * It does NOT expose the full InformationSourceRecord.
 * It contains only what the actor needs to know:
 *   - that a source exists
 *   - what kind it is
 *   - when it happened
 *   - how credible it is
 *   - what delay applied
 *
 * This prevents leaking hidden truth through source references.
 */
export interface VisibleSourceRef {
  /** Unique source record ID. */
  readonly sourceId: string;
  /** Source kind for dispatch. */
  readonly sourceKind: SourceKind;
  /** Day the source occurred. */
  readonly day: number;
  /** Phase when the source occurred. */
  readonly phase: 'morning' | 'afternoon' | 'evening' | 'tick_close';
  /** Bounded summary (max 200 chars). */
  readonly summary: string;
  /** Actor's credibility assessment of this source. */
  readonly credibility: SourceCredibility;
  /** Information delay that applied for this actor. */
  readonly delay: InformationDelay;
  /** Entity IDs this source references (bounded to max 3). */
  readonly entityRefIds: readonly string[];
}

// ════════════════════════════════════════════════════════════════════════════
// ActorBeliefUpdate — a single belief change event
// ════════════════════════════════════════════════════════════════════════════

/**
 * ActorBeliefUpdate represents a single belief change.
 *
 * Belief updates are append-only: they record what the actor came to believe,
 * not what is actually true. Two actors can have conflicting belief updates
 * about the same source — this is by design (information asymmetry).
 *
 * Belief updates feed into:
 *   - DecisionPressureDelta
 *   - ActionCommand
 *   - ConsensusFormation
 *
 * They do NOT directly write Case / Opportunity / global state.
 */
export interface ActorBeliefUpdate {
  /** Unique deterministic ID. Format: abu-{actorId}-{day}-{index}. */
  readonly updateId: string;
  /** The actor who formed this belief. */
  readonly actorId: string;
  /** Actor role. */
  readonly actorRole: ActorRole;
  /** Day the belief was formed. */
  readonly day: number;

  /** What the actor now believes. */
  readonly belief: BeliefContent;
  /** Confidence in this belief. */
  readonly confidence: BeliefConfidence;
  /** Source records that contributed to this belief. */
  readonly sourceRefs: readonly VisibleSourceRef[];
  /** Previous belief value (if update, not creation). */
  readonly previousValue?: BeliefValue;

  /** Deterministic replay key. */
  readonly replayKey: string;
}

/**
 * Belief content: what the actor believes about a specific domain.
 */
export interface BeliefContent {
  /** Belief domain. */
  readonly domain: BeliefDomain;
  /** Belief claim (structured, not narrative). */
  readonly claim: BeliefClaim;
}

/**
 * Belief domains map to mother-model decision tracks.
 */
export type BeliefDomain =
  | 'market_heat'           // market cell is heating up / cooling down
  | 'price_anchor'          // what the listing is worth
  | 'owner_readiness'       // how ready the owner is to sell
  | 'customer_seriousness'  // how serious the buyer is
  | 'rival_threat'          // how dangerous the rival is
  | 'broker_trust'          // how much the broker is trusted
  | 'deal_closeability'     // how close to a deal
  | 'service_path';         // how viable the service path is

/**
 * Belief claim: the actual content of what is believed.
 */
export type BeliefClaim =
  | { readonly type: 'direction'; readonly direction: 'rising' | 'stable' | 'falling'; readonly magnitude: number }
  | { readonly type: 'threshold'; readonly value: number; readonly threshold: number; readonly above: boolean }
  | { readonly type: 'categorical'; readonly category: string; readonly confidence: number }
  | { readonly type: 'comparison'; readonly subject: string; readonly relativeTo: string; readonly relation: 'better' | 'worse' | 'same' };

/**
 * Belief value: the numeric or categorical representation.
 */
export type BeliefValue =
  | { readonly type: 'numeric'; readonly value: number }
  | { readonly type: 'categorical'; readonly value: string }
  | { readonly type: 'boolean'; readonly value: boolean };

// ════════════════════════════════════════════════════════════════════════════
// ActorKnowledgeSnapshot — the core type
// ════════════════════════════════════════════════════════════════════════════

/**
 * ActorKnowledgeSnapshot — what a specific actor knows at a specific day.
 *
 * This is the projection layer between GlobalTruth (registry) and
 * BigWorldPOVProjection (product surface).
 *
 * Key invariants:
 *   - Never exposes raw InformationSourceRecord objects
 *   - Never includes sources with visibility.scope === 'no_one'
 *   - Bounded: max 10 visible sources, max 5 belief updates per domain
 *   - Same actor + same day + same registry → identical snapshot (deterministic)
 *   - Does NOT mutate any state (pure read-only projection)
 */
export interface ActorKnowledgeSnapshot {
  /** Actor ID. */
  readonly actorId: string;
  /** Actor role. */
  readonly actorRole: ActorRole;
  /** Day this snapshot represents. */
  readonly day: number;

  /** Visible source references (bounded, deduplicated). */
  readonly visibleSources: readonly VisibleSourceRef[];
  /** Total count of sources that COULD be visible (before bounding). */
  readonly totalVisibleBeforeBound: number;

  /** Current beliefs derived from visible sources. */
  readonly beliefs: readonly ActorBeliefUpdate[];
  /** Belief summary by domain. */
  readonly beliefSummary: readonly BeliefDomainSummary[];

  /** Information landscape: what the actor cannot see. */
  readonly blindSpots: readonly BlindSpot[];

  /** Deterministic replay key. */
  readonly replayKey: string;
}

/**
 * Summary of beliefs in a specific domain.
 */
export interface BeliefDomainSummary {
  /** Belief domain. */
  readonly domain: BeliefDomain;
  /** Number of belief updates in this domain. */
  readonly updateCount: number;
  /** Latest belief value. */
  readonly latestValue: BeliefValue;
  /** Average confidence across updates. */
  readonly avgConfidence: number;
  /** Trend: is the belief strengthening, weakening, or stable? */
  readonly trend: 'strengthening' | 'weakening' | 'stable';
}

/**
 * BlindSpot: something the actor cannot see but exists in the world.
 *
 * BlindSpots are bounded (max 3) and never expose hidden source details.
 * They answer: "what categories of information is this actor missing?"
 */
export interface BlindSpot {
  /** What category of information is hidden. */
  readonly category: 'rival_intent' | 'shadow_listing' | 'customer_internal_state' | 'manager_strategy' | 'owner_private_thought' | 'acn_internal';
  /** How many sources in this category exist but are hidden. */
  readonly hiddenSourceCount: number;
  /** Impact hint: why this blind spot matters for decisions. */
  readonly impactHint: string;
}

// ════════════════════════════════════════════════════════════════════════════
// ActorRoleVisibilityMatrix — who sees what
// ════════════════════════════════════════════════════════════════════════════

/**
 * Visibility rules for each actor role.
 * Maps actor role to which VisibilityScope values they can access.
 */
export interface RoleVisibilityRule {
  /** The actor role. */
  readonly role: ActorRole;
  /** Which visibility scopes this role can see. */
  readonly allowedScopes: readonly VisibilityScope[];
  /** Actor-specific delay modifier (days). */
  readonly delayModifier: number;
  /** Max sources this role can track (bounding). */
  readonly maxVisibleSources: number;
  /** Max belief updates per domain (bounding). */
  readonly maxBeliefsPerDomain: number;
  /** Max blind spots (bounding). */
  readonly maxBlindSpots: number;
}

// ════════════════════════════════════════════════════════════════════════════
// DecisionEvidenceEnvelope — decision-big evidence chain
// ════════════════════════════════════════════════════════════════════════════

/**
 * PressureSignal — a world change that creates decision pressure on an actor.
 *
 * Derived from beliefs, NOT from raw state fields.
 * Each signal must trace back to at least one belief update or visible source.
 */
export interface PressureSignal {
  /** Unique ID. */
  readonly signalId: string;
  /** What domain the pressure is in. */
  readonly domain: BeliefDomain;
  /** Pressure magnitude: 0-100. */
  readonly magnitude: number;
  /** Direction of pressure. */
  readonly direction: 'increasing' | 'stable' | 'decreasing';
  /** Human-readable label. */
  readonly label: string;
  /** Source belief update IDs that produced this pressure. */
  readonly beliefSourceIds: readonly string[];
  /** Source record IDs that back the beliefs. */
  readonly sourceRecordIds: readonly string[];
}

/**
 * AvailableCommand — a possible action for the actor.
 *
 * Commands are NOT computed from hidden state. They are derived from
 * the actor's knowledge snapshot + role constraints.
 */
export interface AvailableCommand {
  /** Unique command ID. */
  readonly commandId: string;
  /** Human-readable command name. */
  readonly name: string;
  /** Command category. */
  readonly category: 'pricing' | 'promotion' | 'relationship' | 'process' | 'escalation';
  /** Which belief domains this command targets. */
  readonly targetDomains: readonly BeliefDomain[];
  /** Minimum pressure threshold to consider this command (0-100). */
  readonly pressureThreshold: number;
  /** Role restrictions: which roles can execute this. */
  readonly allowedRoles: readonly ActorRole[];
}

/**
 * RecommendedCommand — a single recommendation with evidence chain.
 */
export interface RecommendedCommand {
  /** The command being recommended. */
  readonly command: AvailableCommand;
  /** Why this command over others. */
  readonly reasoning: string;
  /** Confidence in this recommendation: 0-1. */
  readonly confidence: number;
  /** Which pressure signals drove this recommendation. */
  readonly pressureSignalIds: readonly string[];
  /** Which belief updates are in the evidence chain. */
  readonly beliefSourceIds: readonly string[];
  /** Which source records ultimately back this chain. */
  readonly sourceRecordIds: readonly string[];
}

/**
 * ExplanationEnvelope — full explanation for why this recommendation exists.
 *
 * This is the "perfect explanation envelope" that the gate verifies.
 * Every recommendation must have one, and it must trace to real evidence.
 */
export interface ExplanationEnvelope {
  /** Summary: one-line reason. */
  readonly summary: string;
  /** Detailed chain: source → belief → pressure → command. */
  readonly chain: readonly ExplanationLink[];
  /** Overall confidence. */
  readonly confidence: number;
  /** Safe refs for UI display (bounded). */
  readonly safeRefs: readonly { readonly refType: string; readonly refId: string; readonly refLabel: string }[];
}

/**
 * ExplanationLink — one step in the evidence chain.
 */
export interface ExplanationLink {
  /** Step label. */
  readonly step: 'source' | 'belief' | 'pressure' | 'command';
  /** What happened at this step. */
  readonly description: string;
  /** Source/belief/pressure/command IDs that contributed. */
  readonly referencedIds: readonly string[];
}

/**
 * DecisionEvidenceEnvelope — the complete decision surface.
 *
 * Answers:
 *   - Who is this for? (actorId, actorRole, day)
 *   - What do they know? (visibleSourceRefs, causalRefs)
 *   - What do they believe? (beliefUpdates)
 *   - What pressure exists? (pressureSignals)
 *   - What can they do? (availableCommands)
 *   - What should they do? (recommendedCommand)
 *   - How confident? (confidence)
 *   - Why? (explanation)
 */
export interface DecisionEvidenceEnvelope {
  /** Actor identity. */
  readonly actorId: string;
  readonly actorRole: ActorRole;
  readonly day: number;

  /** Evidence: what the actor knows. */
  readonly visibleSourceRefs: readonly VisibleSourceRef[];
  readonly causalRefs: readonly { readonly refType: string; readonly refId: string; readonly refLabel: string }[];

  /** Beliefs: what the actor thinks. */
  readonly beliefUpdates: readonly ActorBeliefUpdate[];
  readonly beliefSummary: readonly BeliefDomainSummary[];

  /** Pressure: what the world is pushing. */
  readonly pressureSignals: readonly PressureSignal[];

  /** Commands: what the actor can do. */
  readonly availableCommands: readonly AvailableCommand[];

  /** Recommendation: what the actor should do. */
  readonly recommendedCommand: RecommendedCommand | null;

  /** Explanation: why this recommendation exists. */
  readonly explanation: ExplanationEnvelope;

  /** Deterministic replay key. */
  readonly replayKey: string;
}

// ════════════════════════════════════════════════════════════════════════════
// ActionCommand — player intent to execute an action
// ════════════════════════════════════════════════════════════════════════════

/**
 * ActionCommand represents a player's intent to execute a specific action.
 *
 * This is the bridge between the decision pipeline (recommendation) and
 * the world (receipt → source record → causal event).
 *
 * Key constraints:
 *   - Deterministic: same inputs → same commandId and replayKey
 *   - Bounded: max 5 targetRefs, max 5 inputBeliefRefs, max 5 inputSourceRefs
 *   - No hidden GlobalTruth reads
 *   - Must trace back to ActorKnowledgeSnapshot evidence
 */
export interface ActionCommand {
  /** Unique command ID. Format: ac-{commandType}-{actorId}-{day}-{seed}. */
  readonly commandId: string;
  /** Actor executing this command. */
  readonly actorId: string;
  /** Actor role. */
  readonly actorRole: ActorRole;
  /** Day the command is executed. */
  readonly day: number;
  /** Command type from the catalog. */
  readonly commandType: 'owner_interview' | 'defend_listing' | 'customer_followup';
  /** Entity IDs this command targets (max 5). */
  readonly targetRefs: readonly EntityRef[];
  /** Belief update IDs that informed this command (max 5). */
  readonly inputBeliefRefs: readonly string[];
  /** Source record IDs that provided evidence for this command (max 5). */
  readonly inputSourceRefs: readonly string[];
  /** Expected effect description. */
  readonly expectedEffect: string;
  /** Deterministic replay key. */
  readonly replayKey: string;
}

// ════════════════════════════════════════════════════════════════════════════
// ActionReceipt — proof that command was executed
// ════════════════════════════════════════════════════════════════════════════

/**
 * ActionReceipt is the immutable proof that an ActionCommand was executed.
 *
 * It bridges the command to the world by:
 *   1. Generating source records (via actionExecutor)
 *   2. Ingesting those source records into causal events
 *   3. Recording which actor knowledge refs were affected
 *   4. Proving no direct hidden mutation
 *
 * Key constraints:
 *   - Never directly modifies case.trust/patience/status
 *   - All world effects flow through source record → causal event pipeline
 *   - Deterministic: same command + same state → same receipt
 *   - Bounded: max 10 source records, max 20 causal events
 */
export interface ActionReceipt {
  /** The command this receipt is for. */
  readonly commandReplayKey: string;
  /** Command ID. */
  readonly commandId: string;
  /** Actor who executed. */
  readonly actorId: string;
  /** Actor role. */
  readonly actorRole: ActorRole;
  /** Day executed. */
  readonly day: number;
  /** Command type. */
  readonly commandType: ActionCommand['commandType'];

  /** Outcome of the action. */
  readonly outcome: ActionOutcome;

  /** Source records generated by this action. */
  readonly generatedSourceRecordIds: readonly string[];
  /** Causal events produced from the source records. */
  readonly generatedCausalEventIds: readonly string[];
  /** Daily events produced from the source records. */
  readonly generatedDailyEventIds: readonly string[];

  /** Actor knowledge refs affected by this action. */
  readonly affectedActorKnowledgeRefs: readonly {
    readonly actorId: string;
    readonly beliefDomain: string;
    readonly previousConfidence: number;
    readonly newConfidence: number;
  }[];

  /** Proof that no hidden mutation occurred. */
  readonly noDirectHiddenMutationProof: NoDirectHiddenMutationProof;

  /** Deterministic replay key. */
  readonly replayKey: string;
}

/**
 * Outcome of an action execution.
 */
export interface ActionOutcome {
  /** Whether the action succeeded. */
  readonly success: boolean;
  /** Outcome code for dispatch. */
  readonly code: 'interview_completed' | 'listing_defended' | 'followup_sent' | 'blocked' | 'failed';
  /** Human-readable outcome message. */
  readonly message: string;
  /** Numeric impact magnitude (0-100). */
  readonly impactMagnitude: number;
  /** Which belief domains were affected. */
  readonly affectedDomains: readonly BeliefDomain[];
}

/**
 * Proof that the receipt did NOT directly mutate hidden state.
 * This is a verification artifact — it records what the receipt
 * explicitly did NOT touch.
 */
export interface NoDirectHiddenMutationProof {
  /** Fields that were NOT modified. */
  readonly untouchedCaseFields: readonly string[];
  /** Fields that were NOT modified. */
  readonly untouchedOpportunityFields: readonly string[];
  /** Fields that were NOT modified. */
  readonly untouchedCustomerFields: readonly string[];
  /** World effects flowed through: source_record → causal_event → projection. */
  readonly worldEffectPath: 'source_record_causal_event_projection';
}

// ════════════════════════════════════════════════════════════════════════════
// ActionReplayReceipt — proof of deterministic replay
// ════════════════════════════════════════════════════════════════════════════

/**
 * ActionReplayReceipt is the output of replaying an action command.
 * It compares the original receipt against the replayed receipt.
 */
export interface ActionReplayReceipt {
  /** Whether the replay matched the original. */
  readonly matched: boolean;
  /** Original command replay key. */
  readonly commandReplayKey: string;
  /** Original source record IDs. */
  readonly originalSourceRecordIds: readonly string[];
  /** Replayed source record IDs. */
  readonly replayedSourceRecordIds: readonly string[];
  /** Original causal event IDs. */
  readonly originalCausalEventIds: readonly string[];
  /** Replayed causal event IDs. */
  readonly replayedCausalEventIds: readonly string[];
  /** Original belief refs. */
  readonly originalBeliefRefs: readonly string[];
  /** Replayed belief refs. */
  readonly replayedBeliefRefs: readonly string[];
  /** Whether source record IDs matched. */
  readonly sourceRecordIdsMatched: boolean;
  /** Whether causal event IDs matched. */
  readonly causalEventIdsMatched: boolean;
  /** Whether belief refs matched. */
  readonly beliefRefsMatched: boolean;
  /** Mismatch details if any. */
  readonly mismatches: readonly string[];
}

// ════════════════════════════════════════════════════════════════════════════
// ActorRoleVisibilityMatrix — who sees what
// ════════════════════════════════════════════════════════════════════════════

/**
 * Visibility rules for each actor role.
 * Maps actor role to which VisibilityScope values they can access.
 */
export interface RoleVisibilityRule {
  /** The actor role. */
  readonly role: ActorRole;
  /** Which visibility scopes this role can see. */
  readonly allowedScopes: readonly VisibilityScope[];
  /** Actor-specific delay modifier (days). */
  readonly delayModifier: number;
  /** Max sources this role can track (bounding). */
  readonly maxVisibleSources: number;
  /** Max belief updates per domain (bounding). */
  readonly maxBeliefsPerDomain: number;
  /** Max blind spots (bounding). */
  readonly maxBlindSpots: number;
}

/**
 * Default visibility rules per role.
 */
export const DEFAULT_ROLE_VISIBILITY: readonly RoleVisibilityRule[] = [
  {
    role: 'player_broker',
    allowedScopes: ['all_actors', 'player_only', 'broker_chain'],
    delayModifier: 0,
    maxVisibleSources: 10,
    maxBeliefsPerDomain: 5,
    maxBlindSpots: 3,
  },
  {
    role: 'rival_broker',
    allowedScopes: ['all_actors', 'broker_chain'],
    delayModifier: 1,
    maxVisibleSources: 8,
    maxBeliefsPerDomain: 4,
    maxBlindSpots: 3,
  },
  {
    role: 'owner',
    allowedScopes: ['all_actors', 'owner_only'],
    delayModifier: 2,
    maxVisibleSources: 6,
    maxBeliefsPerDomain: 3,
    maxBlindSpots: 3,
  },
  {
    role: 'customer',
    allowedScopes: ['all_actors'],
    delayModifier: 0,
    maxVisibleSources: 5,
    maxBeliefsPerDomain: 3,
    maxBlindSpots: 2,
  },
  {
    role: 'manager',
    allowedScopes: ['all_actors'],
    delayModifier: 1,
    maxVisibleSources: 12,
    maxBeliefsPerDomain: 5,
    maxBlindSpots: 2,
  },
  {
    role: 'system',
    allowedScopes: ['all_actors', 'owner_only', 'player_only', 'broker_chain', 'specific_actors', 'no_one'],
    delayModifier: 0,
    maxVisibleSources: 50,
    maxBeliefsPerDomain: 10,
    maxBlindSpots: 0,
  },
] as const;
