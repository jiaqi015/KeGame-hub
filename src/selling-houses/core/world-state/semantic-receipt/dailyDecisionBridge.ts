/**
 * DailyDecisionBridge v1 — pure core read-model contract with movement semantics.
 *
 * Answers: which cases moved today, why, which actor POV changed,
 * what blockers/commitments appeared, what recommended actions exist,
 * AND what real business movement happened (improved/worsened/emerged/resolved).
 *
 * Mother model alignment:
 * - Section 5: Human Decision Model (DecisionState, DecisionMoment, DecisionCommitment)
 * - Section 9: POV And Interaction Design (visibleFacts, inferredSignals, hiddenGlobalFacts)
 * - Section 16: High-Priority Interfaces (ActorKnowledge, SignalSource, ActorPOV)
 * - Business movement: trust/heat/d1/competitiveness/storylineState changes
 *
 * Hard constraints:
 * 1. Pure types in core — no domain/runtime imports.
 * 2. No Date.now, no Math.random, no crypto, no global state.
 * 3. Deterministic: same input → same output.
 * 4. All refs are string IDs, not embedded objects.
 * 5. Summary/ref data only — no raw GameState/Case/Opportunity.
 */

// ---------------------------------------------------------------------------
// DailyMovementKind: what business dimension moved
// ---------------------------------------------------------------------------

export type DailyMovementKind =
  | 'owner_relation'         // trust, patience, urgency, owner mood
  | 'customer_opportunity'   // d1, intent, confidence, stage, churn
  | 'price_consensus'        // askPrice, marketPrice, bottomPrice, closeProbability
  | 'competition_pressure'   // competitiveness, heat, rival pressure
  | 'deal_process'           // consensus stage, pendingClosing, signed/collapsed
  | 'service_commitment'     // broker commitment, timeline agreement, service path
  | 'risk_control';          // blockers, storylineState, windowDays

// ---------------------------------------------------------------------------
// DailyMovementDirection: what direction the movement went
// ---------------------------------------------------------------------------

export type DailyMovementDirection =
  | 'improved'    // situation got better
  | 'worsened'    // situation got worse
  | 'emerged'     // new blocker/signal/opportunity appeared
  | 'resolved'    // blocker/signal/opportunity resolved
  | 'unchanged';  // no meaningful change

// ---------------------------------------------------------------------------
// DailyMovementMagnitude: how significant the movement was
// ---------------------------------------------------------------------------

export type DailyMovementMagnitude =
  | 'low'       // minor change, routine
  | 'medium'    // noticeable, worth attention
  | 'high';     // significant, requires action

// ---------------------------------------------------------------------------
// DailyOperatingMovementSummary: top-level movement summary for one tick
// ---------------------------------------------------------------------------

export interface DailyOperatingMovementSummary {
  readonly day: number;
  readonly caseMovements: readonly DailyCaseOperatingMovement[];
  readonly movedCaseCount: number;
  readonly worsenedCaseCount: number;
  readonly improvedCaseCount: number;
  readonly blockerCount: number;
  readonly commitmentCount: number;
  readonly recommendationCount: number;
}

// ---------------------------------------------------------------------------
// DailyCaseOperatingMovement: movement for one case
// ---------------------------------------------------------------------------

export interface DailyCaseOperatingMovement {
  readonly caseId: string;
  readonly movements: readonly DailyMovementEntry[];
  readonly blockerEmergences: readonly DailyDecisionBlockerRef[];
  readonly blockerResolutions: readonly DailyDecisionBlockerRef[];
  readonly recommendedActionId?: string;
}

// ---------------------------------------------------------------------------
// DailyMovementEntry: a single movement on a case
// ---------------------------------------------------------------------------

export interface DailyMovementEntry {
  readonly kind: DailyMovementKind;
  readonly direction: DailyMovementDirection;
  readonly magnitude: DailyMovementMagnitude;
  readonly field: string;
  readonly from: string | number | boolean;
  readonly to: string | number | boolean;
  readonly delta: number;
  readonly reason: string;
  readonly sourceRefIds: readonly string[];
}

// ---------------------------------------------------------------------------
// DailyDecisionBridgeSummary: top-level summary for one tick (backward compatible)
// ---------------------------------------------------------------------------

export interface DailyDecisionBridgeSummary {
  readonly day: number;
  readonly movedCases: readonly DailyCaseDecisionSummary[];
  readonly actorPovChanges: readonly DailyActorPovChangeSummary[];
  readonly recommendations: readonly DailyRecommendationSummary[];
  readonly totalMovedCases: number;
  readonly totalBlockers: number;
  readonly totalCommitments: number;
  /** v1: real business movement summary (optional for backward compat) */
  readonly operatingMovement?: DailyOperatingMovementSummary;
}

// ---------------------------------------------------------------------------
// DailyCaseDecisionSummary: what happened to one case today
// ---------------------------------------------------------------------------

export interface DailyCaseDecisionSummary {
  readonly caseId: string;
  readonly movedFields: readonly DailyDecisionMovedField[];
  readonly whyRefs: readonly DailyDecisionWhyRef[];
  readonly blockers: readonly DailyDecisionBlockerRef[];
  readonly commitments: readonly DailyDecisionCommitmentRef[];
  readonly actorIds: readonly string[];
}

// ---------------------------------------------------------------------------
// DailyDecisionMovedField: a field that changed on this case
// ---------------------------------------------------------------------------

export interface DailyDecisionMovedField {
  readonly field: string;
  readonly previousValue: string | number | boolean;
  readonly newValue: string | number | boolean;
  readonly delta: number;
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// DailyDecisionWhyRef: a reference explaining why something changed
// ---------------------------------------------------------------------------

export interface DailyDecisionWhyRef {
  readonly refType: 'pressure_receipt' | 'consensus_receipt' | 'evaluation_snapshot'
    | 'interaction_scene' | 'event' | 'commitment' | 'belief' | 'attention';
  readonly refId: string;
  readonly summary: string;
  readonly relevance: number; // 0..1
}

// ---------------------------------------------------------------------------
// DailyDecisionBlockerRef: a blocker that appeared or persisted
// ---------------------------------------------------------------------------

export interface DailyDecisionBlockerRef {
  readonly blockerId: string;
  readonly kind: string;
  readonly description: string;
  readonly severity: 'low' | 'medium' | 'high';
  readonly relatedField?: string;
}

// ---------------------------------------------------------------------------
// DailyDecisionCommitmentRef: a commitment that was made or changed
// ---------------------------------------------------------------------------

export interface DailyDecisionCommitmentRef {
  readonly commitmentId: string;
  readonly kind: string;
  readonly actorId: string;
  readonly action: 'created' | 'strengthened' | 'weakened' | 'revoked';
  readonly strength: number; // 0..100
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// DailyActorPovChangeSummary: what changed in an actor's POV
// ---------------------------------------------------------------------------

export interface DailyActorPovChangeSummary {
  readonly actorId: string;
  readonly actorKind: 'broker' | 'owner' | 'customer' | 'manager';
  readonly changedBeliefs: readonly DailyBeliefChangeRef[];
  readonly changedSignals: readonly DailySignalChangeRef[];
  readonly caseIds: readonly string[];
}

// ---------------------------------------------------------------------------
// DailyBeliefChangeRef: a belief that changed
// ---------------------------------------------------------------------------

export interface DailyBeliefChangeRef {
  readonly beliefId: string;
  readonly beliefKind: string;
  readonly previousConfidence: number;
  readonly newConfidence: number;
  readonly direction: 'strengthened' | 'weakened' | 'unchanged';
  readonly reason: string;
}

// ---------------------------------------------------------------------------
// DailySignalChangeRef: a signal that appeared or changed
// ---------------------------------------------------------------------------

export interface DailySignalChangeRef {
  readonly signalId: string;
  readonly signalKind: string;
  readonly severity: 'info' | 'watch' | 'decision' | 'urgent';
  readonly label: string;
  readonly appeared: boolean; // true if new, false if updated
}

// ---------------------------------------------------------------------------
// DailyRecommendationSummary: a recommended action
// ---------------------------------------------------------------------------

export interface DailyRecommendationSummary {
  readonly actionSpecId: string;
  readonly caseId: string;
  readonly label: string;
  readonly priority: number;
  readonly confidence: number;
  readonly enabled: boolean;
  readonly rationale: string;
  readonly supportingSignalCount: number;
  readonly decisionMomentCount: number;
}

// ---------------------------------------------------------------------------
// DailyFollowThroughAgendaSummary: follow-through agenda for today
// ---------------------------------------------------------------------------

export interface DailyFollowThroughAgendaSummary {
  readonly day: number;
  readonly caseAgendas: readonly DailyFollowThroughCaseAgenda[];
  readonly agendaCaseCount: number;
  readonly urgentCaseCount: number;
  readonly blockerCount: number;
  readonly followUpCount: number;
  readonly recommendationCount: number;
  readonly resolvedCount: number;
  readonly unresolvedCount: number;
}

// ---------------------------------------------------------------------------
// DailyFollowThroughCaseAgenda: agenda for one case
// ---------------------------------------------------------------------------

export interface DailyFollowThroughCaseAgenda {
  readonly caseId: string;
  readonly priority: DailyFollowThroughPriority;
  readonly tasks: readonly DailyFollowThroughTask[];
  readonly blockers: readonly DailyFollowThroughBlocker[];
  readonly reasons: readonly DailyFollowThroughReason[];
  readonly actionDrafts: readonly DailyFollowThroughActionDraft[];
  readonly urgencyScore: number; // 0-100, higher = more urgent
}

// ---------------------------------------------------------------------------
// DailyFollowThroughTask: a specific task to follow up on
// ---------------------------------------------------------------------------

export interface DailyFollowThroughTask {
  readonly taskId: string;
  readonly kind: 'resolve_blocker' | 'revisit_opportunity' | 'follow_commitment' | 'check_status' | 'escalate';
  readonly description: string;
  readonly relatedField?: string;
  readonly priority: DailyFollowThroughPriority;
  readonly sourceRefIds: readonly string[];
}

// ---------------------------------------------------------------------------
// DailyFollowThroughReason: why this case needs attention
// ---------------------------------------------------------------------------

export interface DailyFollowThroughReason {
  readonly reasonType: 'movement_worsened' | 'movement_improved' | 'blocker_emerged' | 'blocker_resolved'
    | 'commitment_changed' | 'pressure_increased' | 'opportunity_ready' | 'risk_control';
  readonly description: string;
  readonly relatedField?: string;
  readonly sourceRefIds: readonly string[];
}

// ---------------------------------------------------------------------------
// DailyFollowThroughBlocker: a blocker that needs resolution
// ---------------------------------------------------------------------------

export interface DailyFollowThroughBlocker {
  readonly blockerId: string;
  readonly kind: string;
  readonly description: string;
  readonly severity: 'low' | 'medium' | 'high';
  readonly resolved: boolean;
  readonly relatedField?: string;
}

// ---------------------------------------------------------------------------
// DailyFollowThroughPriority: priority level for follow-through
// ---------------------------------------------------------------------------

export type DailyFollowThroughPriority =
  | 'urgent'      // must resolve today
  | 'high'        // should resolve today
  | 'medium'      // resolve this week
  | 'low'         // routine follow-up
  | 'deferred';   // can wait

// ---------------------------------------------------------------------------
// DailyFollowThroughActionDraft: a draft action recommendation
// ---------------------------------------------------------------------------

export interface DailyFollowThroughActionDraft {
  readonly actionId: string;
  readonly label: string;
  readonly description: string;
  readonly priority: DailyFollowThroughPriority;
  readonly confidence: number; // 0-1
  readonly enabled: boolean;
  readonly rationale: string;
  readonly supportingRefCount: number;
}

// ---------------------------------------------------------------------------
// Input shapes for builders (plain objects, no domain import)
// ---------------------------------------------------------------------------

export interface DailyDecisionBridgeInput {
  readonly day: number;
  readonly movedCases: readonly DailyCaseDecisionSummary[];
  readonly actorPovChanges: readonly DailyActorPovChangeSummary[];
  readonly recommendations: readonly DailyRecommendationSummary[];
  readonly caseMovements?: readonly DailyCaseOperatingMovement[];
}

export interface DailyFollowThroughAgendaInput {
  readonly day: number;
  readonly caseAgendas: readonly DailyFollowThroughCaseAgenda[];
}

// ---------------------------------------------------------------------------
// Builders (pure, deterministic, frozen)
// ---------------------------------------------------------------------------

export function buildEmptyDailyDecisionBridgeSummary(day: number): DailyDecisionBridgeSummary {
  return Object.freeze({
    day,
    movedCases: Object.freeze([]),
    actorPovChanges: Object.freeze([]),
    recommendations: Object.freeze([]),
    totalMovedCases: 0,
    totalBlockers: 0,
    totalCommitments: 0,
    operatingMovement: Object.freeze({
      day,
      caseMovements: Object.freeze([]),
      movedCaseCount: 0,
      worsenedCaseCount: 0,
      improvedCaseCount: 0,
      blockerCount: 0,
      commitmentCount: 0,
      recommendationCount: 0,
    }),
  });
}

export function buildDailyDecisionBridgeSummary(input: DailyDecisionBridgeInput): DailyDecisionBridgeSummary {
  const totalBlockers = input.movedCases.reduce(
    (sum, c) => sum + c.blockers.length,
    0,
  );
  const totalCommitments = input.movedCases.reduce(
    (sum, c) => sum + c.commitments.length,
    0,
  );

  // Build operating movement summary from caseMovements
  const caseMovements = input.caseMovements ?? [];
  const movedCaseCount = caseMovements.length;
  let worsenedCaseCount = 0;
  let improvedCaseCount = 0;
  let blockerCount = 0;
  let commitmentCount = 0;
  let recommendationCount = 0;

  for (const cm of caseMovements) {
    const hasWorsened = cm.movements.some((m) => m.direction === 'worsened');
    const hasImproved = cm.movements.some((m) => m.direction === 'improved');
    if (hasWorsened && !hasImproved) worsenedCaseCount++;
    if (hasImproved && !hasWorsened) improvedCaseCount++;
    blockerCount += cm.blockerEmergences.length + cm.blockerResolutions.length;
    if (cm.recommendedActionId) recommendationCount++;
  }

  const operatingMovement: DailyOperatingMovementSummary = Object.freeze({
    day: input.day,
    caseMovements: Object.freeze([...caseMovements]),
    movedCaseCount,
    worsenedCaseCount,
    improvedCaseCount,
    blockerCount,
    commitmentCount,
    recommendationCount,
  });

  return Object.freeze({
    day: input.day,
    movedCases: Object.freeze([...input.movedCases]),
    actorPovChanges: Object.freeze([...input.actorPovChanges]),
    recommendations: Object.freeze([...input.recommendations]),
    totalMovedCases: input.movedCases.length,
    totalBlockers,
    totalCommitments,
    operatingMovement,
  });
}

// ---------------------------------------------------------------------------
// Follow-through agenda builders
// ---------------------------------------------------------------------------

export function buildEmptyDailyFollowThroughAgenda(day: number): DailyFollowThroughAgendaSummary {
  return Object.freeze({
    day,
    caseAgendas: Object.freeze([]),
    agendaCaseCount: 0,
    urgentCaseCount: 0,
    blockerCount: 0,
    followUpCount: 0,
    recommendationCount: 0,
    resolvedCount: 0,
    unresolvedCount: 0,
  });
}

export function buildDailyFollowThroughAgenda(input: DailyFollowThroughAgendaInput): DailyFollowThroughAgendaSummary {
  let urgentCaseCount = 0;
  let blockerCount = 0;
  let followUpCount = 0;
  let recommendationCount = 0;
  let resolvedCount = 0;
  let unresolvedCount = 0;

  for (const agenda of input.caseAgendas) {
    if (agenda.priority === 'urgent') urgentCaseCount++;
    for (const blocker of agenda.blockers) {
      blockerCount++;
      if (blocker.resolved) resolvedCount++;
      else unresolvedCount++;
    }
    followUpCount += agenda.tasks.length;
    recommendationCount += agenda.actionDrafts.length;
  }

  return Object.freeze({
    day: input.day,
    caseAgendas: Object.freeze([...input.caseAgendas]),
    agendaCaseCount: input.caseAgendas.length,
    urgentCaseCount,
    blockerCount,
    followUpCount,
    recommendationCount,
    resolvedCount,
    unresolvedCount,
  });
}
