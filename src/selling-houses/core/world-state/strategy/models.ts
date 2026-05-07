/**
 * StrategyFork v0 / NegotiationReplay v0 / BusinessOutcomeReview v0
 * — pure core read-model contracts.
 *
 * Answers: How can we compare different strategy branches from the same base?
 *          How can we replay a negotiation process?
 *          How can we review business outcomes after a process completes?
 *
 * Mother model alignment:
 * - Section 1: "Same seed + same action command sequence should produce replayable world results."
 * - Section 5: Human Decision Model (DecisionState, DecisionMoment, DecisionCommitment)
 * - Section 8: Broker Service Essence
 * - Section 9: POV And Interaction Design
 * - Section 12: Consensus Formation
 * - Section 16: High-Priority Interfaces
 * - Section 18.10: "replay, store action commands, seeds/RNG counters, model versions"
 * - Section 19: Deep Design Questions — counterfactual simulation / what-if
 *
 * Hard constraints:
 * 1. Pure types in core — no domain/runtime imports.
 * 2. No Date.now, no Math.random, no crypto, no global state.
 * 3. Deterministic: same input → same output, byte-identical.
 * 4. All refs are string IDs, not embedded objects.
 * 5. Summary/ref data only — no raw GameState/Case/Opportunity.
 * 6. All actions are receipt/intent — never executed.
 * 7. ContractFact remains the sole source of deal truth.
 * 8. Frozen output.
 */

// ---------------------------------------------------------------------------
// StrategyForkBranchKind: what kind of strategy fork
// ---------------------------------------------------------------------------

export type StrategyForkBranchKind =
  | 'price_accept'            // owner accepts price adjustment
  | 'price_reject'            // owner rejects price adjustment
  | 'manager_intervene'       // manager steps in
  | 'continue_wait'           // keep waiting
  | 'open_day_push'           // push open day
  | 'sincerity_sale_push'     // push sincerity sale
  | 'escalate_to_manager'     // escalate to manager
  | 'customer_follow_up'      // follow up with customer
  | 'showing_push'            // push showing
  | 'negotiate_offer'         // negotiate offer
  | 'withdraw_listing'        // withdraw listing
  | 'custom';                 // custom strategy

// ---------------------------------------------------------------------------
// StrategyForkActionSequence: sequence of actions in a fork
// ---------------------------------------------------------------------------

export interface StrategyForkActionSequence {
  readonly sequenceId: string;
  readonly actionIds: readonly string[];
  readonly description: string;
  readonly estimatedDurationDays: number;
}

// ---------------------------------------------------------------------------
// StrategyForkBranch: one branch of a strategy fork
// ---------------------------------------------------------------------------

export interface StrategyForkBranch {
  readonly branchId: string;
  readonly kind: StrategyForkBranchKind;
  readonly label: string;
  readonly description: string;
  readonly actionSequence: StrategyForkActionSequence;
  readonly expectedOutcome: string;
  readonly confidence: number; // 0-1
  readonly riskLevel: 'low' | 'medium' | 'high';
}

// ---------------------------------------------------------------------------
// StrategyForkOutcomeDelta: delta between two branches
// ---------------------------------------------------------------------------

export interface StrategyForkOutcomeDelta {
  readonly dimension: string;
  readonly branchAValue: number;
  readonly branchBValue: number;
  readonly delta: number;
  readonly direction: 'improved' | 'worsened' | 'unchanged';
  readonly significance: 'low' | 'medium' | 'high';
}

// ---------------------------------------------------------------------------
// StrategyForkComparison: comparison between two branches
// ---------------------------------------------------------------------------

export interface StrategyForkComparison {
  readonly branchAId: string;
  readonly branchBId: string;
  readonly deltas: readonly StrategyForkOutcomeDelta[];
  readonly recommendation: string;
  readonly recommendationConfidence: number; // 0-1
}

// ---------------------------------------------------------------------------
// StrategyForkPlan: a plan for comparing strategy branches
// ---------------------------------------------------------------------------

export interface StrategyForkPlan {
  readonly planId: string;
  readonly caseId: string;
  readonly baseDay: number;
  readonly seedId: string;
  readonly branches: readonly StrategyForkBranch[];
  readonly comparisons: readonly StrategyForkComparison[];
  readonly description: string;
}

// ---------------------------------------------------------------------------
// NegotiationReplayTurn: one turn in a negotiation replay
// ---------------------------------------------------------------------------

export interface NegotiationReplayTurn {
  readonly turnId: string;
  readonly day: number;
  readonly actorId: string;
  readonly actorKind: 'broker' | 'owner' | 'customer' | 'manager';
  readonly actionKind: string;
  readonly actionDescription: string;
  readonly evidenceRefs: readonly string[];
  readonly beliefChanges: readonly NegotiationReplayBeliefChange[];
  readonly commitmentChanges: readonly NegotiationReplayCommitmentChange[];
  readonly outcome: 'positive' | 'negative' | 'neutral' | 'blocked';
}

// ---------------------------------------------------------------------------
// NegotiationReplayBeliefChange: belief change in a negotiation turn
// ---------------------------------------------------------------------------

export interface NegotiationReplayBeliefChange {
  readonly beliefKind: string;
  readonly previousConfidence: number;
  readonly newConfidence: number;
  readonly direction: 'strengthened' | 'weakened' | 'unchanged';
}

// ---------------------------------------------------------------------------
// NegotiationReplayCommitmentChange: commitment change in a negotiation turn
// ---------------------------------------------------------------------------

export interface NegotiationReplayCommitmentChange {
  readonly commitmentId: string;
  readonly kind: string;
  readonly action: 'created' | 'strengthened' | 'weakened' | 'revoked' | 'expired';
  readonly previousStrength?: number;
  readonly newStrength?: number;
}

// ---------------------------------------------------------------------------
// NegotiationReplayStep: one step in a negotiation replay
// ---------------------------------------------------------------------------

export interface NegotiationReplayStep {
  readonly stepId: string;
  readonly day: number;
  readonly phase: string;
  readonly turns: readonly NegotiationReplayTurn[];
  readonly blockers: readonly NegotiationReplayBlocker[];
  readonly outcome: 'proceeded' | 'stalled' | 'blocked' | 'collapsed';
}

// ---------------------------------------------------------------------------
// NegotiationReplayBlocker: blocker in a negotiation replay
// ---------------------------------------------------------------------------

export interface NegotiationReplayBlocker {
  readonly blockerId: string;
  readonly kind: string;
  readonly description: string;
  readonly severity: 'low' | 'medium' | 'high';
  readonly resolvedDay?: number;
  readonly resolved: boolean;
}

// ---------------------------------------------------------------------------
// NegotiationReplayOutcome: outcome of a negotiation replay
// ---------------------------------------------------------------------------

export interface NegotiationReplayOutcome {
  readonly outcomeType: 'signed' | 'collapsed' | 'blocked' | 'expired' | 'withdrawn';
  readonly description: string;
  readonly totalDays: number;
  readonly totalTurns: number;
  readonly totalBlockers: number;
  readonly resolvedBlockers: number;
  readonly relatedConsensusId?: string;
  readonly relatedContractFactId?: string;
}

// ---------------------------------------------------------------------------
// NegotiationReplay: replay of a negotiation process
// ---------------------------------------------------------------------------

export interface NegotiationReplay {
  readonly replayId: string;
  readonly caseId: string;
  readonly processRunId?: string;
  readonly startedDay: number;
  readonly endedDay?: number;
  readonly steps: readonly NegotiationReplayStep[];
  readonly outcome?: NegotiationReplayOutcome;
}

// ---------------------------------------------------------------------------
// BusinessOutcomeReviewMetric: metric in a business outcome review
// ---------------------------------------------------------------------------

export interface BusinessOutcomeReviewMetric {
  readonly metricId: string;
  readonly label: string;
  readonly value: number;
  readonly unit: string;
  readonly direction: 'improved' | 'worsened' | 'unchanged';
  readonly significance: 'low' | 'medium' | 'high';
}

// ---------------------------------------------------------------------------
// BusinessOutcomeReviewFinding: finding in a business outcome review
// ---------------------------------------------------------------------------

export interface BusinessOutcomeReviewFinding {
  readonly findingId: string;
  readonly kind: 'success_factor' | 'failure_factor' | 'risk_factor' | 'opportunity_missed' | 'opportunity_captured';
  readonly description: string;
  readonly evidenceRefs: readonly string[];
  readonly impact: 'low' | 'medium' | 'high';
}

// ---------------------------------------------------------------------------
// BusinessOutcomeReviewNextStep: next step recommendation
// ---------------------------------------------------------------------------

export interface BusinessOutcomeReviewNextStep {
  readonly stepId: string;
  readonly actionKind: string;
  readonly description: string;
  readonly priority: 'urgent' | 'high' | 'medium' | 'low' | 'deferred';
  readonly rationale: string;
  readonly relatedFindingIds: readonly string[];
}

// ---------------------------------------------------------------------------
// BusinessOutcomeReview: review of a completed business process
// ---------------------------------------------------------------------------

export interface BusinessOutcomeReview {
  readonly reviewId: string;
  readonly caseId: string;
  readonly processRunId?: string;
  readonly processKind: string;
  readonly startedDay: number;
  readonly endedDay: number;
  readonly durationDays: number;
  readonly metrics: readonly BusinessOutcomeReviewMetric[];
  readonly findings: readonly BusinessOutcomeReviewFinding[];
  readonly nextSteps: readonly BusinessOutcomeReviewNextStep[];
  readonly overallOutcome: 'success' | 'partial_success' | 'failure' | 'neutral';
  readonly summary: string;
}

// ---------------------------------------------------------------------------
// Input shapes for builders
// ---------------------------------------------------------------------------

export interface StrategyForkPlanInput {
  readonly caseId: string;
  readonly baseDay: number;
  readonly seedId: string;
  readonly branches: readonly StrategyForkBranch[];
  readonly description?: string;
}

export interface NegotiationReplayInput {
  readonly caseId: string;
  readonly processRunId?: string;
  readonly startedDay: number;
  readonly endedDay?: number;
  readonly steps: readonly NegotiationReplayStep[];
  readonly outcome?: NegotiationReplayOutcome;
}

export interface BusinessOutcomeReviewInput {
  readonly caseId: string;
  readonly processRunId?: string;
  readonly processKind: string;
  readonly startedDay: number;
  readonly endedDay: number;
  readonly metrics?: readonly BusinessOutcomeReviewMetric[];
  readonly findings?: readonly BusinessOutcomeReviewFinding[];
  readonly nextSteps?: readonly BusinessOutcomeReviewNextStep[];
  readonly overallOutcome?: 'success' | 'partial_success' | 'failure' | 'neutral';
  readonly summary?: string;
}

// ---------------------------------------------------------------------------
// Builders (pure, deterministic, frozen)
// ---------------------------------------------------------------------------

export function buildStrategyForkPlan(input: StrategyForkPlanInput): StrategyForkPlan {
  const planId = `fork:${input.caseId}:${input.baseDay}`;

  const comparisons: StrategyForkComparison[] = [];
  for (let i = 0; i < input.branches.length; i++) {
    for (let j = i + 1; j < input.branches.length; j++) {
      comparisons.push(Object.freeze({
        branchAId: input.branches[i].branchId,
        branchBId: input.branches[j].branchId,
        deltas: Object.freeze([]),
        recommendation: '',
        recommendationConfidence: 0,
      }));
    }
  }

  return Object.freeze({
    planId,
    caseId: input.caseId,
    baseDay: input.baseDay,
    seedId: input.seedId,
    branches: Object.freeze([...input.branches]),
    comparisons: Object.freeze(comparisons),
    description: input.description ?? '',
  });
}

export function compareStrategyForkBranches(
  plan: StrategyForkPlan,
  branchAId: string,
  branchBId: string,
  deltas: readonly StrategyForkOutcomeDelta[],
  recommendation: string,
  recommendationConfidence: number,
): StrategyForkComparison {
  return Object.freeze({
    branchAId,
    branchBId,
    deltas: Object.freeze([...deltas]),
    recommendation,
    recommendationConfidence,
  });
}

export function buildNegotiationReplay(input: NegotiationReplayInput): NegotiationReplay {
  const replayId = `replay:${input.caseId}:${input.startedDay}`;

  // Deep-freeze each step to ensure turns and blockers arrays are frozen
  const frozenSteps = input.steps.map(step => Object.freeze({
    ...step,
    turns: Object.freeze(step.turns.map(turn => Object.freeze({
      ...turn,
      evidenceRefs: Object.freeze([...turn.evidenceRefs]),
      beliefChanges: Object.freeze([...turn.beliefChanges]),
      commitmentChanges: Object.freeze([...turn.commitmentChanges]),
    }))),
    blockers: Object.freeze(step.blockers.map(blocker => Object.freeze({...blocker}))),
  }));

  return Object.freeze({
    replayId,
    caseId: input.caseId,
    processRunId: input.processRunId,
    startedDay: input.startedDay,
    endedDay: input.endedDay,
    steps: Object.freeze(frozenSteps),
    outcome: input.outcome,
  });
}

export function buildBusinessOutcomeReview(input: BusinessOutcomeReviewInput): BusinessOutcomeReview {
  const reviewId = `review:${input.caseId}:${input.processKind}:${input.endedDay}`;

  return Object.freeze({
    reviewId,
    caseId: input.caseId,
    processRunId: input.processRunId,
    processKind: input.processKind,
    startedDay: input.startedDay,
    endedDay: input.endedDay,
    durationDays: input.endedDay - input.startedDay,
    metrics: Object.freeze([...(input.metrics ?? [])]),
    findings: Object.freeze([...(input.findings ?? [])]),
    nextSteps: Object.freeze([...(input.nextSteps ?? [])]),
    overallOutcome: input.overallOutcome ?? 'neutral',
    summary: input.summary ?? '',
  });
}

export function buildEmptyBusinessOutcomeReview(caseId: string, processKind: string, day: number): BusinessOutcomeReview {
  return buildBusinessOutcomeReview({
    caseId,
    processKind,
    startedDay: day,
    endedDay: day,
  });
}
