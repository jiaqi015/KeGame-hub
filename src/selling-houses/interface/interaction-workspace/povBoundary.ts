/**
 * POV workspace boundary — exposes BrokerPOV/OwnerPOV as workspace projections.
 *
 * Reads from core/decision types and runtime/decision-support/povAdapter.
 * Produces workspace-level summaries. Does NOT mutate GameState.
 */

import type {
  ActionCommandDraft,
  ActorBelief,
  BrokerPOVSnapshot,
  CommitmentState,
  CommitmentTrace,
  DecisionMoment,
  NoDecisionReadModel,
  OwnerPOVSnapshot,
  PressureReceiptSummary,
  SignalTrace,
  BeliefConflict,
} from '../../core/decision/models.js';

// Import ChoiceSet/WaitingPosture summary types
export interface PovChoiceAlternativeSummary {
  readonly id: string;
  readonly label: string;
  readonly source: string;
  readonly attractiveness: number;
  readonly feasible: boolean;
  readonly constraintReason?: string;
  readonly actionCommandDraftId?: string;
}

export interface PovChoiceConstraintSummary {
  readonly key: string;
  readonly label: string;
  readonly kind: string;
  readonly blocking: boolean;
}

export interface PovChoiceSetSummary {
  readonly alternativeCount: number;
  readonly feasibleCount: number;
  readonly draftMappedCount: number;
  readonly constraintCount: number;
  readonly blockingConstraintCount: number;
  readonly alternatives: readonly PovChoiceAlternativeSummary[];
  readonly constraints: readonly PovChoiceConstraintSummary[];
}

export interface PovWaitingStateSummary {
  readonly posture: string;
  readonly reason: string;
  readonly triggerToAct?: string;
  readonly accumulatedPressure: number;
}

export interface PovSignalTraceSummary {
  readonly id: string;
  readonly source: string;
  readonly originLabel: string;
  readonly receivedDay: number;
  readonly sourceCredibility: number;
}

export interface PovBeliefSummary {
  readonly id: string;
  readonly kind: string;
  readonly label: string;
  readonly value: string | number | boolean;
  readonly confidence: number;
  readonly confidenceLevel: string;
  readonly direction: string;
  readonly stale: boolean;
  readonly supportingTraceCount: number;
}

export interface PovBeliefConflictSummary {
  readonly id: string;
  readonly kind: string;
  readonly description: string;
  readonly severity: string;
  readonly decisionImpact: string;
  readonly beliefCount: number;
}

export interface PovCommitmentTraceSummary {
  readonly id: string;
  readonly status: string;
  readonly inferredFrom: string;
  readonly reason: string;
  readonly day: number;
  readonly strength: number;
}

export interface PovCommitmentSummary {
  readonly id: string;
  readonly owner: string;
  readonly scope: string;
  readonly label: string;
  readonly status: string;
  readonly strength: number;
  readonly credibility: number;
  readonly createdDay: number;
  readonly expiryDay?: number;
  readonly expiryReason?: string;
  readonly revocable: boolean;
  readonly inferredFrom: string;
  readonly traceCount: number;
  readonly traces: readonly PovCommitmentTraceSummary[];
  readonly supportingBeliefCount: number;
  readonly relatedAlternativeCount: number;
}

export interface PovNoDecisionSummary {
  readonly posture: string;
  readonly consideredAlternativeCount: number;
  readonly blockingConstraintCount: number;
  readonly exitCondition: string;
  readonly nextReviewDay: number;
  readonly accumulatedPressure: number;
  readonly beliefTraceCount: number;
}

import type { ReadonlyDeep } from './readOnly.js';
import { freezeProjection } from './readOnly.js';

// ---------------------------------------------------------------------------
// Workspace-level POV projection types
// ---------------------------------------------------------------------------

export type PovBoundaryProjectionKind = 'broker_pov_adapter_state' | 'owner_pov_adapter_state';

export interface PovActionCommandDraftSummary {
  readonly id: string;
  readonly caseId: string;
  readonly actionSpecId: string;
  readonly legacyActionId: string;
  readonly label: string;
  readonly priority: number;
  readonly confidence: number;
  readonly enabled: boolean;
  readonly disabledReason: string;
  readonly rationale: string;
  readonly beliefTraceCount: number;
}

export interface PovDecisionMomentSummary {
  readonly id: string;
  readonly label: string;
  readonly trigger: string;
  readonly urgency: string;
  readonly relatedCaseId?: string;
}

export interface PovPressureSummaryView {
  readonly available: boolean;
  readonly headline: string;
  readonly coverage: number;
  readonly maxConfidence: number;
  readonly wiredCount: number;
  readonly wiredTotal: number;
}

export interface PovCaseSummary {
  readonly caseId: string;
  readonly title: string;
  readonly status: string;
  readonly competitiveness: number;
  readonly d1: number;
  readonly d2: number;
  readonly d3: number;
  readonly d4?: number;
  readonly ownerReadiness: number;
  readonly trust: number;
  readonly urgency: number;
  readonly signalCount: number;
  readonly urgentSignalCount: number;
  readonly enabledDraftCount: number;
  readonly decisionMomentCount: number;
  readonly blockerCount: number;
  readonly visibleFactCount: number;
  readonly inferredSignalCount: number;
  readonly hiddenFactCount: number;
  readonly choiceSet: PovChoiceSetSummary;
  readonly waitingState: PovWaitingStateSummary;
  readonly traceCount: number;
  readonly beliefCount: number;
  readonly conflictCount: number;
  readonly beliefs: readonly PovBeliefSummary[];
  readonly beliefConflicts: readonly PovBeliefConflictSummary[];
  readonly commitmentCount: number;
  readonly activeCommitmentCount: number;
  readonly staleCommitmentCount: number;
  readonly commitments: readonly PovCommitmentSummary[];
  readonly noDecision?: PovNoDecisionSummary;
}

export interface BrokerPOVWorkspaceProjection {
  readonly projectionKind: 'broker_pov_adapter_state';
  readonly role: 'broker';
  readonly readOnly: true;
  readonly day: number;
  readonly actorId: string;
  readonly caseCount: number;
  readonly totalSignals: number;
  readonly totalUrgentSignals: number;
  readonly totalEnabledDrafts: number;
  readonly totalDecisionMoments: number;
  readonly energy: number;
  readonly promotionBudget: number;
  readonly pressureSummary: PovPressureSummaryView;
  readonly cases: readonly PovCaseSummary[];
  readonly actionCommandDrafts: readonly PovActionCommandDraftSummary[];
  readonly decisionMoments: readonly PovDecisionMomentSummary[];
}

export interface OwnerPOVWorkspaceProjection {
  readonly projectionKind: 'owner_pov_adapter_state';
  readonly role: 'owner';
  readonly readOnly: true;
  readonly day: number;
  readonly caseCount: number;
  readonly cases: readonly PovCaseSummary[];
  readonly hiddenFactCount: number;
}

// ---------------------------------------------------------------------------
// Adapters
// ---------------------------------------------------------------------------

function summarizeDraft(draft: ActionCommandDraft): PovActionCommandDraftSummary {
  return {
    id: draft.id,
    caseId: draft.caseId,
    actionSpecId: draft.actionSpecId,
    legacyActionId: draft.legacyActionId,
    label: draft.label,
    priority: draft.priority,
    confidence: draft.confidence,
    enabled: draft.enabled,
    disabledReason: draft.disabledReason,
    rationale: draft.rationale,
    beliefTraceCount: draft.beliefTraceIds.length,
  };
}

function summarizeDecisionMoment(dm: DecisionMoment): PovDecisionMomentSummary {
  return { id: dm.id, label: dm.label, trigger: dm.trigger, urgency: dm.urgency, relatedCaseId: dm.relatedCaseId };
}

function summarizePressure(pressure: PressureReceiptSummary): PovPressureSummaryView {
  return {
    available: pressure.available,
    headline: pressure.headline,
    coverage: pressure.coverage,
    maxConfidence: pressure.maxConfidence,
    wiredCount: pressure.wiredCount,
    wiredTotal: pressure.wiredTotal,
  };
}

function summarizeChoiceSet(caseCtx: { choiceSet: any }): PovChoiceSetSummary {
  const cs = caseCtx.choiceSet;
  return {
    alternativeCount: cs.alternatives.length,
    feasibleCount: cs.feasibleCount,
    draftMappedCount: cs.draftMappedCount,
    constraintCount: cs.constraints.length,
    blockingConstraintCount: cs.constraints.filter((c: any) => c.blocking).length,
    alternatives: cs.alternatives.map((a: any) => ({
      id: a.id,
      label: a.label,
      source: a.source,
      attractiveness: a.attractiveness,
      feasible: a.feasible,
      constraintReason: a.constraintReason,
      actionCommandDraftId: a.actionCommandDraftId,
    })),
    constraints: cs.constraints.map((c: any) => ({
      key: c.key,
      label: c.label,
      kind: c.kind,
      blocking: c.blocking,
    })),
  };
}

function summarizeWaitingState(caseCtx: { waitingState: any }): PovWaitingStateSummary {
  return {
    posture: caseCtx.waitingState.posture,
    reason: caseCtx.waitingState.reason,
    triggerToAct: caseCtx.waitingState.triggerToAct,
    accumulatedPressure: caseCtx.waitingState.accumulatedPressure,
  };
}

function summarizeBelief(belief: ActorBelief): PovBeliefSummary {
  return {
    id: belief.id,
    kind: belief.kind,
    label: belief.label,
    value: belief.value,
    confidence: belief.confidence,
    confidenceLevel: belief.confidenceLevel,
    direction: belief.direction,
    stale: belief.stale,
    supportingTraceCount: belief.supportingTraceIds.length,
  };
}

function summarizeBeliefConflict(conflict: BeliefConflict): PovBeliefConflictSummary {
  return {
    id: conflict.id,
    kind: conflict.kind,
    description: conflict.description,
    severity: conflict.severity,
    decisionImpact: conflict.decisionImpact,
    beliefCount: conflict.beliefIds.length,
  };
}

function summarizeCommitmentTrace(trace: CommitmentTrace): PovCommitmentTraceSummary {
  return {
    id: trace.id,
    status: trace.status,
    inferredFrom: trace.inferredFrom,
    reason: trace.reason,
    day: trace.day,
    strength: trace.strength,
  };
}

function summarizeCommitment(commitment: CommitmentState): PovCommitmentSummary {
  return {
    id: commitment.id,
    owner: commitment.owner,
    scope: commitment.scope,
    label: commitment.label,
    status: commitment.status,
    strength: commitment.strength,
    credibility: commitment.credibility,
    createdDay: commitment.createdDay,
    expiryDay: commitment.expiryDay,
    expiryReason: commitment.expiryReason,
    revocable: commitment.revocable,
    inferredFrom: commitment.inferredFrom,
    traceCount: commitment.traces.length,
    traces: commitment.traces.map(summarizeCommitmentTrace),
    supportingBeliefCount: commitment.supportingBeliefIds.length,
    relatedAlternativeCount: commitment.relatedAlternativeIds.length,
  };
}

function summarizeNoDecision(noDecision: NoDecisionReadModel): PovNoDecisionSummary {
  return {
    posture: noDecision.posture,
    consideredAlternativeCount: noDecision.consideredAlternativeIds.length,
    blockingConstraintCount: noDecision.blockingConstraints.length,
    exitCondition: noDecision.exitCondition,
    nextReviewDay: noDecision.nextReviewDay,
    accumulatedPressure: noDecision.accumulatedPressure,
    beliefTraceCount: noDecision.beliefTraceIds.length,
  };
}

function summarizeBrokerCase(caseCtx: BrokerPOVSnapshot['cases'][number]): PovCaseSummary {
  return {
    caseId: caseCtx.caseId,
    title: caseCtx.title,
    status: caseCtx.status,
    competitiveness: caseCtx.assetScore.score,
    d1: caseCtx.assetScore.d1,
    d2: caseCtx.assetScore.d2,
    d3: caseCtx.assetScore.d3,
    d4: caseCtx.assetScore.d4,
    ownerReadiness: caseCtx.ownerReadiness.score,
    trust: caseCtx.ownerReadiness.trust,
    urgency: caseCtx.ownerReadiness.urgency,
    signalCount: caseCtx.signals.length,
    urgentSignalCount: caseCtx.signals.filter((s) => s.severity === 'urgent').length,
    enabledDraftCount: caseCtx.recommendationDrafts.filter((d) => d.enabled).length,
    decisionMomentCount: caseCtx.decisionMoments.length,
    blockerCount: caseCtx.assetScore.blockers.length,
    visibleFactCount: caseCtx.knowledge.visibleFacts.length,
    inferredSignalCount: caseCtx.knowledge.inferredSignals.length,
    hiddenFactCount: caseCtx.knowledge.hiddenGlobalFacts.length,
    choiceSet: summarizeChoiceSet(caseCtx),
    waitingState: summarizeWaitingState(caseCtx),
    traceCount: caseCtx.knowledge.traces.length,
    beliefCount: caseCtx.knowledge.beliefs.length,
    conflictCount: caseCtx.knowledge.beliefConflicts.length,
    beliefs: caseCtx.knowledge.beliefs.map(summarizeBelief),
    beliefConflicts: caseCtx.knowledge.beliefConflicts.map(summarizeBeliefConflict),
    commitmentCount: caseCtx.commitmentStates.length,
    activeCommitmentCount: caseCtx.commitmentStates.filter((c) => c.status === 'active').length,
    staleCommitmentCount: caseCtx.commitmentStates.filter((c) => c.status === 'stale').length,
    commitments: caseCtx.commitmentStates.map(summarizeCommitment),
    noDecision: caseCtx.noDecision ? summarizeNoDecision(caseCtx.noDecision) : undefined,
  };
}

function summarizeOwnerCase(caseCtx: OwnerPOVSnapshot['cases'][number]): PovCaseSummary {
  return {
    caseId: caseCtx.caseId,
    title: caseCtx.title,
    status: caseCtx.status,
    competitiveness: caseCtx.assetScore.score,
    d1: caseCtx.assetScore.d1,
    d2: caseCtx.assetScore.d2,
    d3: caseCtx.assetScore.d3,
    ownerReadiness: caseCtx.ownerReadiness.score,
    trust: caseCtx.ownerReadiness.trust,
    urgency: caseCtx.ownerReadiness.urgency,
    signalCount: caseCtx.visibleSignals.length,
    urgentSignalCount: caseCtx.visibleSignals.filter((s) => s.severity === 'urgent').length,
    enabledDraftCount: 0,
    decisionMomentCount: 0,
    blockerCount: 0,
    visibleFactCount: caseCtx.knowledge.visibleFacts.length,
    inferredSignalCount: caseCtx.knowledge.inferredSignals.length,
    hiddenFactCount: caseCtx.knowledge.hiddenGlobalFacts.length,
    choiceSet: summarizeChoiceSet(caseCtx),
    waitingState: summarizeWaitingState(caseCtx),
    traceCount: caseCtx.knowledge.traces.length,
    beliefCount: caseCtx.knowledge.beliefs.length,
    conflictCount: caseCtx.knowledge.beliefConflicts.length,
    beliefs: caseCtx.knowledge.beliefs.map(summarizeBelief),
    beliefConflicts: caseCtx.knowledge.beliefConflicts.map(summarizeBeliefConflict),
    commitmentCount: caseCtx.commitmentStates.length,
    activeCommitmentCount: caseCtx.commitmentStates.filter((c) => c.status === 'active').length,
    staleCommitmentCount: caseCtx.commitmentStates.filter((c) => c.status === 'stale').length,
    commitments: caseCtx.commitmentStates.map(summarizeCommitment),
    noDecision: caseCtx.noDecision ? summarizeNoDecision(caseCtx.noDecision) : undefined,
  };
}

export function buildBrokerPOVWorkspaceProjection(
  pov: BrokerPOVSnapshot,
): ReadonlyDeep<BrokerPOVWorkspaceProjection> {
  const cases = pov.cases.map(summarizeBrokerCase);
  const totalSignals = cases.reduce((sum, c) => sum + c.signalCount, 0);
  const totalUrgent = cases.reduce((sum, c) => sum + c.urgentSignalCount, 0);
  const totalEnabled = cases.reduce((sum, c) => sum + c.enabledDraftCount, 0);

  return freezeProjection({
    projectionKind: 'broker_pov_adapter_state',
    role: 'broker',
    readOnly: true,
    day: pov.day,
    actorId: pov.actorId,
    caseCount: pov.cases.length,
    totalSignals,
    totalUrgentSignals: totalUrgent,
    totalEnabledDrafts: totalEnabled,
    totalDecisionMoments: pov.decisionMoments.length,
    energy: pov.energy,
    promotionBudget: pov.promotionBudget,
    pressureSummary: summarizePressure(pov.pressureSummary),
    cases,
    actionCommandDrafts: pov.actionCommandDrafts.map(summarizeDraft),
    decisionMoments: pov.decisionMoments.map(summarizeDecisionMoment),
  });
}

export function buildOwnerPOVWorkspaceProjection(
  pov: OwnerPOVSnapshot,
): ReadonlyDeep<OwnerPOVWorkspaceProjection> {
  const cases = pov.cases.map(summarizeOwnerCase);
  const hiddenFactCount = pov.knowledge.hiddenGlobalFacts.length
    + cases.reduce((sum, c) => sum + c.hiddenFactCount, 0);

  return freezeProjection({
    projectionKind: 'owner_pov_adapter_state',
    role: 'owner',
    readOnly: true,
    day: pov.day,
    caseCount: pov.cases.length,
    cases,
    hiddenFactCount,
  });
}
