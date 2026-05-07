/**
 * InteractionScene + BrokerServiceInteraction v0 — pure semantic types.
 *
 * Mother model alignment:
 * - Section 8 (Broker Service Essence): BrokerServiceInteraction transforms
 *   messy information into decision evidence.
 * - Section 9 (POV And Interaction Design): GlobalTruth → POVProjection →
 *   ImmersiveInteractionScene → DecisionMoment / Action → Event / Commitment.
 * - Section 19.3 (BrokerServiceInteraction vs Event vs InteractionScene):
 *   InteractionScene = container/context for the call
 *   BrokerServiceInteraction = semantic service payload inside the scene
 *   Event = append-only facts emitted by the scene/interaction
 * - Section 19.4 (Interaction Effects): Interaction transmits information,
 *   but effects are decided by receiver interpretation. A call can emit
 *   independent events for information delivery, belief update, relation
 *   update, and commitment.
 *
 * Hard constraints:
 * 1. Not a real LLM integration. No OpenAI / fetch / network / API key.
 * 2. core/world-state/interactions cannot import domain/runtime.
 * 3. All references are ref/id strings, not embedded domain objects.
 * 4. InteractionScene is not an event, not an action executor, not a result writer.
 * 5. BrokerServiceInteraction only expresses service semantics, no direct mutation.
 */

// ---------------------------------------------------------------------------
// InteractionSceneType: the kind of scene
// ---------------------------------------------------------------------------

export type InteractionSceneType =
  | 'owner_call'
  | 'customer_follow_up'
  | 'showing'
  | 'focus_meeting'
  | 'price_report'
  | 'offer_negotiation'
  | 'manager_review'
  | 'buyer_broker_recommendation';

// ---------------------------------------------------------------------------
// InteractionScene: a single-day POV scene container
// ---------------------------------------------------------------------------

export interface InteractionScene {
  readonly sceneId: string;
  readonly sceneType: InteractionSceneType;
  readonly day: number;
  /** All actors participating in this scene. */
  readonly actorIds: readonly string[];
  /** The actor whose POV defines the scene. */
  readonly primaryActorId: string;
  /** The actor(s) the primary actor is interacting with. */
  readonly counterpartyActorIds: readonly string[];
  /** Optional: the case this scene is about. */
  readonly caseId?: string;
  /** Optional: the opportunity this scene is about. */
  readonly opportunityId?: string;
  /** The actor whose POV the scene is rendered from. */
  readonly povActorId: string;
  /** References to facts the POV actor can see in this scene. */
  readonly visibleFactRefs: readonly string[];
  /** References to signals the POV actor has inferred. */
  readonly inferredSignalRefs: readonly string[];
  /** References to pressure signals active during this scene. */
  readonly pressureRefs: readonly string[];
  /** References to actions available to the primary actor in this scene. */
  readonly availableActionRefs: readonly string[];
  /** What the system expects the counterparty to do (not what they actually do). */
  readonly expectedCounterpartyReaction?: ExpectedReaction;
  /** References to events emitted as a result of this scene. */
  readonly resultingEventRefs: readonly string[];
  /** References to commitments made or updated in this scene. */
  readonly commitmentRefs: readonly string[];
  /** The semantic service payload (if this scene includes a broker service interaction). */
  readonly serviceInteraction?: BrokerServiceInteraction;
}

// ---------------------------------------------------------------------------
// ExpectedReaction: what the system expects the counterparty to do
// ---------------------------------------------------------------------------

export interface ExpectedReaction {
  readonly reactionType: 'accept' | 'reject' | 'counter' | 'delay' | 'escalate' | 'unknown';
  readonly confidence: number; // 0..1
  readonly reasoning: string;
}

// ---------------------------------------------------------------------------
// BrokerServiceInteraction: semantic service payload inside a scene
// ---------------------------------------------------------------------------

/**
 * Mother model Section 8: "Broker actions should change beliefs, confidence,
 * price anchors, trust, attention, or commitments through service interactions.
 * They should not directly mutate outcomes as mechanical score buttons."
 */
export interface BrokerServiceInteraction {
  readonly interactionId: string;
  readonly sceneId: string;
  readonly brokerId: string;
  readonly day: number;
  /** What raw information the broker collected during this interaction. */
  readonly rawInformationCollected: readonly InformationItem[];
  /** What interpretation the broker provided to the counterparty. */
  readonly interpretationProvided: readonly InterpretationItem[];
  /** What recommendation the broker made. */
  readonly recommendationMade?: RecommendationItem;
  /** What decision frame the broker created for the counterparty. */
  readonly decisionFrameCreated?: DecisionFrame;
  /** Questions the counterparty asked (information asymmetry signal). */
  readonly counterpartyQuestions: readonly CounterpartyQuestion[];
  /** How this interaction changed actor beliefs. */
  readonly actorBeliefChanged: readonly BeliefChange[];
  /** How this interaction changed actor commitments. */
  readonly actorCommitmentChanged: readonly CommitmentChange[];
}

// ---------------------------------------------------------------------------
// InformationItem: raw information collected
// ---------------------------------------------------------------------------

export interface InformationItem {
  readonly id: string;
  readonly kind: 'fact' | 'signal' | 'rumor' | 'observation';
  readonly label: string;
  readonly source: 'self_sourced' | 'relayed' | 'observed' | 'inferred' | 'systemic';
  readonly confidence: number; // 0..1
  readonly relatedFactRef?: string;
}

// ---------------------------------------------------------------------------
// InterpretationItem: interpretation provided by broker
// ---------------------------------------------------------------------------

export interface InterpretationItem {
  readonly id: string;
  readonly topic: string;
  readonly interpretation: string;
  readonly credibility: number; // 0..1
  readonly basedOnRefs: readonly string[];
}

// ---------------------------------------------------------------------------
// RecommendationItem: recommendation made by broker
// ---------------------------------------------------------------------------

export interface RecommendationItem {
  readonly id: string;
  readonly label: string;
  readonly actionRef?: string;
  readonly reasoning: string;
  readonly confidence: number; // 0..1
  readonly expectedOutcome: string;
}

// ---------------------------------------------------------------------------
// DecisionFrame: decision frame created by broker
// ---------------------------------------------------------------------------

export interface DecisionFrame {
  readonly id: string;
  readonly frameType: 'price_anchor' | 'urgency_signal' | 'alternative_comparison' | 'risk_warning' | 'opportunity_highlight';
  readonly label: string;
  readonly description: string;
  readonly anchorValue?: number;
  readonly relatedFactRefs: readonly string[];
}

// ---------------------------------------------------------------------------
// CounterpartyQuestion: questions the counterparty asked
// ---------------------------------------------------------------------------

export interface CounterpartyQuestion {
  readonly id: string;
  readonly question: string;
  readonly topic: string;
  readonly revealsLackOf: 'information' | 'confidence' | 'trust' | 'commitment';
}

// ---------------------------------------------------------------------------
// BeliefChange: how this interaction changed actor beliefs
// ---------------------------------------------------------------------------

export interface BeliefChange {
  readonly actorId: string;
  readonly beliefKind: string;
  readonly previousConfidence: number;
  readonly newConfidence: number;
  readonly direction: 'strengthened' | 'weakened' | 'unchanged';
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// CommitmentChange: how this interaction changed actor commitments
// ---------------------------------------------------------------------------

export interface CommitmentChange {
  readonly actorId: string;
  readonly commitmentType: 'price_hold' | 'showing_willingness' | 'offer_readiness' | 'service_exclusivity' | 'timeline_agreement';
  readonly action: 'created' | 'strengthened' | 'weakened' | 'revoked';
  readonly strength: number; // 0..100
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// SceneEvidenceRef: reference to evidence in a scene
// ---------------------------------------------------------------------------

export interface SceneEvidenceRef {
  readonly refType: 'visible_fact' | 'inferred_signal' | 'pressure' | 'event' | 'commitment';
  readonly refId: string;
  readonly summary: string;
}

// ---------------------------------------------------------------------------
// Helper predicates
// ---------------------------------------------------------------------------

export function isInteractionScene(value: unknown): value is InteractionScene {
  return (
    typeof value === 'object'
    && value !== null
    && 'sceneId' in value
    && 'sceneType' in value
    && 'day' in value
    && 'primaryActorId' in value
  );
}

export function hasServiceInteraction(scene: InteractionScene): boolean {
  return scene.serviceInteraction !== undefined;
}

export function getSceneEvidenceRefs(scene: InteractionScene): readonly SceneEvidenceRef[] {
  const refs: SceneEvidenceRef[] = [];

  for (const refId of scene.visibleFactRefs) {
    refs.push({ refType: 'visible_fact', refId, summary: `visible fact ${refId}` });
  }
  for (const refId of scene.inferredSignalRefs) {
    refs.push({ refType: 'inferred_signal', refId, summary: `inferred signal ${refId}` });
  }
  for (const refId of scene.pressureRefs) {
    refs.push({ refType: 'pressure', refId, summary: `pressure ${refId}` });
  }
  for (const refId of scene.resultingEventRefs) {
    refs.push({ refType: 'event', refId, summary: `event ${refId}` });
  }
  for (const refId of scene.commitmentRefs) {
    refs.push({ refType: 'commitment', refId, summary: `commitment ${refId}` });
  }

  return Object.freeze(refs);
}

export function getInformationCollectedCount(interaction: BrokerServiceInteraction): number {
  return interaction.rawInformationCollected.length;
}

export function getInterpretationProvidedCount(interaction: BrokerServiceInteraction): number {
  return interaction.interpretationProvided.length;
}

export function getBeliefChangeCount(interaction: BrokerServiceInteraction): number {
  return interaction.actorBeliefChanged.length;
}

export function getCommitmentChangeCount(interaction: BrokerServiceInteraction): number {
  return interaction.actorCommitmentChanged.length;
}

// ---------------------------------------------------------------------------
// Scene builder (minimal, no domain dependency)
// ---------------------------------------------------------------------------

export interface InteractionSceneInput {
  readonly sceneId: string;
  readonly sceneType: InteractionSceneType;
  readonly day: number;
  readonly actorIds: readonly string[];
  readonly primaryActorId: string;
  readonly counterpartyActorIds: readonly string[];
  readonly caseId?: string;
  readonly opportunityId?: string;
  readonly povActorId: string;
  readonly visibleFactRefs?: readonly string[];
  readonly inferredSignalRefs?: readonly string[];
  readonly pressureRefs?: readonly string[];
  readonly availableActionRefs?: readonly string[];
  readonly expectedCounterpartyReaction?: ExpectedReaction;
  readonly resultingEventRefs?: readonly string[];
  readonly commitmentRefs?: readonly string[];
  readonly serviceInteraction?: BrokerServiceInteraction;
}

export function buildInteractionScene(input: InteractionSceneInput): InteractionScene {
  return Object.freeze({
    sceneId: input.sceneId,
    sceneType: input.sceneType,
    day: input.day,
    actorIds: Object.freeze([...input.actorIds]),
    primaryActorId: input.primaryActorId,
    counterpartyActorIds: Object.freeze([...input.counterpartyActorIds]),
    caseId: input.caseId,
    opportunityId: input.opportunityId,
    povActorId: input.povActorId,
    visibleFactRefs: Object.freeze([...(input.visibleFactRefs ?? [])]),
    inferredSignalRefs: Object.freeze([...(input.inferredSignalRefs ?? [])]),
    pressureRefs: Object.freeze([...(input.pressureRefs ?? [])]),
    availableActionRefs: Object.freeze([...(input.availableActionRefs ?? [])]),
    expectedCounterpartyReaction: input.expectedCounterpartyReaction,
    resultingEventRefs: Object.freeze([...(input.resultingEventRefs ?? [])]),
    commitmentRefs: Object.freeze([...(input.commitmentRefs ?? [])]),
    serviceInteraction: input.serviceInteraction,
  });
}
