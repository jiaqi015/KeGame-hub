import {
  ACTION_SPEC_BY_ID,
  ACTION_SPECS,
  DECISION_MOMENTS,
  type ActionSpecDefinition,
  type DecisionMomentDefinition,
  type DecisionMomentId,
} from '../../core/business-rules/index.js';
import {
  buildCaseEvaluationSnapshotsFromLegacyState,
  buildOpportunityEvaluationSnapshotsFromLegacyState,
  buildRegionOpenDayFitSnapshotFromLegacyState,
  type AssetScoreSnapshot,
  type OpportunityScoreSnapshot,
  type OwnerDecisionReadinessSnapshot,
} from '../../core/evaluation/index.js';
import { getActionAvailability } from '../../domain/engine/actionResolvers.js';
import type { Case, GameState } from '../../domain/models.js';
import { isCaseActiveByCanonicalStatus } from '../../domain/caseLifecycleStatusRead.js';
import { isOpportunityActiveByCanonicalState } from '../../domain/opportunityLifecycleStatusRead.js';
import type {
  CaseDecisionSupportContext,
  DecisionSupportActionSpec,
  DecisionSupportContext,
  DecisionSupportDecisionMoment,
  DecisionSupportRecommendationDraft,
  DecisionSupportSignal,
  DecisionSupportSignalKind,
  DecisionSupportSignalSeverity,
} from './types.js';

type CandidateInput = {
  actionSpecId: string;
  signalKinds: DecisionSupportSignalKind[];
  priority: number;
  confidence: number;
};

function freezeList<T>(items: readonly T[]): ReadonlyArray<T> {
  return Object.freeze([...items]);
}

function cloneActionSpecDefinition(spec: ActionSpecDefinition): DecisionSupportActionSpec {
  return Object.freeze({
    ...spec,
    metricFocus: freezeList(spec.metricFocus),
    decisionMomentIds: freezeList(spec.decisionMomentIds),
    businessFlowIds: freezeList(spec.businessFlowIds),
  });
}

function cloneDecisionMomentDefinition(moment: DecisionMomentDefinition): DecisionSupportDecisionMoment {
  return Object.freeze({
    ...moment,
    primaryActors: freezeList(moment.primaryActors),
    triggerActionIds: freezeList(moment.triggerActionIds),
    expectedSignals: freezeList(moment.expectedSignals),
    downstreamFlowIds: freezeList(moment.downstreamFlowIds),
  });
}

function buildActionSpecReadModels() {
  return Object.freeze(ACTION_SPECS.map(cloneActionSpecDefinition));
}

function buildDecisionMomentReadModels() {
  return Object.freeze(DECISION_MOMENTS.map(cloneDecisionMomentDefinition));
}

function ownerGapDays(day: number, lastOwnerTouchedDay: number) {
  if (!lastOwnerTouchedDay || lastOwnerTouchedDay <= 0) {
    return Math.max(1, day);
  }
  return Math.max(0, day - lastOwnerTouchedDay);
}

function severityForScore(score: number): DecisionSupportSignalSeverity {
  if (score >= 78) return 'urgent';
  if (score >= 58) return 'decision';
  if (score >= 32) return 'watch';
  return 'info';
}

function signal(
  caseItem: Case,
  kind: DecisionSupportSignalKind,
  label: string,
  score: number,
  sourceModelIds: Array<string>,
  decisionMomentIds: DecisionMomentId[],
  actionSpecIds: Array<string>,
): DecisionSupportSignal {
  return {
    id: `${caseItem.id}:${kind}`,
    caseId: caseItem.id,
    kind,
    severity: severityForScore(score),
    label,
    score: Math.round(score),
    sourceModelIds: [...sourceModelIds],
    decisionMomentIds: [...decisionMomentIds],
    actionSpecIds: [...actionSpecIds],
  };
}

function findActionSpec(actionSpecId: string): ActionSpecDefinition | null {
  return ACTION_SPEC_BY_ID[actionSpecId] || null;
}

function momentsForActionSpecs(actionSpecIds: Array<string>) {
  const momentIds = new Set<DecisionMomentId>();
  actionSpecIds.forEach((actionSpecId) => {
    findActionSpec(actionSpecId)?.decisionMomentIds.forEach((momentId) => momentIds.add(momentId));
  });
  return momentIds;
}

function buildSignals(
  state: GameState,
  caseItem: Case,
  assetScore: AssetScoreSnapshot,
  ownerReadiness: OwnerDecisionReadinessSnapshot,
  opportunityScores: OpportunityScoreSnapshot[],
): DecisionSupportSignal[] {
  const signals: DecisionSupportSignal[] = [];
  const add = (
    kind: DecisionSupportSignalKind,
    label: string,
    score: number,
    sourceModelIds: Array<string>,
    actionSpecIds: Array<string>,
  ) => {
    signals.push(signal(
      caseItem,
      kind,
      label,
      score,
      sourceModelIds,
      Array.from(momentsForActionSpecs(actionSpecIds)),
      actionSpecIds,
    ));
  };

  if (!caseItem.hasCompletedFirstVisit) {
    add(
      'owner-discovery-missing',
      'Owner expectation and authorization boundary are not discovered yet.',
      88,
      [ownerReadiness.modelId],
      ['first-visit', 'deep-diagnosis'],
    );
  }

  const ownerGap = ownerGapDays(state.day, caseItem.lastOwnerTouchedDay);
  const ownerPressure = Math.max(
    0,
    100 - ownerReadiness.score,
    ownerGap * 10,
    caseItem.storylineState === 'critical' ? 86 : caseItem.storylineState === 'sliding' ? 62 : 0,
  );
  if (ownerPressure >= 30) {
    add(
      'owner-readiness-low',
      'Owner readiness needs a decision-support read before operational push.',
      ownerPressure,
      [ownerReadiness.modelId],
      [caseItem.hasCompletedFirstVisit ? 'weekly-feedback' : 'first-visit'],
    );
  }

  if (assetScore.score < 62 || assetScore.dimensions.d2.score < 58) {
    add(
      'asset-positioning-gap',
      'Asset positioning or base competitiveness is below the operating threshold.',
      100 - Math.min(assetScore.score, assetScore.dimensions.d2.score),
      [assetScore.modelId],
      ['story', 'deep-diagnosis'],
    );
  }

  const activeOpportunityScores = opportunityScores.filter((entry) => entry.inputs.status === 'active');
  if (caseItem.hasCompletedFirstVisit && activeOpportunityScores.length === 0) {
    add(
      'lead-pipeline-thin',
      'No active opportunity score is available for this case.',
      64,
      [assetScore.modelId],
      ['broker-broadcast', 'xiaohongshu-boost', 'private-referral'],
    );
  }

  const topOpportunity = activeOpportunityScores
    .slice()
    .sort((left, right) => right.score - left.score)[0] || null;
  if (topOpportunity && topOpportunity.dimensions.closeReadiness.score >= 72) {
    const actionSpecIds = topOpportunity.inputs.stageIndex >= 3
      ? ['invite-customer-negotiation', 'sincerity-sale']
      : ['showing'];
    add(
      'opportunity-close-ready',
      'A customer opportunity is close enough to require a decision moment.',
      topOpportunity.dimensions.closeReadiness.score,
      [topOpportunity.modelId],
      actionSpecIds,
    );
  }

  if (ownerReadiness.inputs.priceGapPct >= 4) {
    add(
      'pricing-friction',
      'Listing price is separated from market reference and should be framed as a decision.',
      Math.min(95, ownerReadiness.inputs.priceGapPct * 10),
      [assetScore.modelId, ownerReadiness.modelId],
      ['pricing-advice', 'ask-psychological-price', 'adjust-listing-price'],
    );
  }

  if (assetScore.inputs.heat >= 70 && ownerReadiness.score >= 58 && caseItem.openDayCooldown <= 0) {
    add(
      'open-day-fit',
      'Asset heat and owner readiness can support an open-day participation decision.',
      Math.round(assetScore.inputs.heat * 0.55 + ownerReadiness.score * 0.45),
      [assetScore.modelId, ownerReadiness.modelId],
      ['open-day'],
    );
  }

  return signals.sort((left, right) => (right.score || 0) - (left.score || 0));
}

function buildCandidateInputs(signals: DecisionSupportSignal[]): CandidateInput[] {
  const byActionSpecId = new Map<string, CandidateInput>();
  signals.forEach((signalItem) => {
    signalItem.actionSpecIds.forEach((actionSpecId) => {
      const existing = byActionSpecId.get(actionSpecId);
      const signalScore = signalItem.score || 0;
      if (!existing) {
        byActionSpecId.set(actionSpecId, {
          actionSpecId,
          signalKinds: [signalItem.kind],
          priority: signalScore,
          confidence: signalItem.severity === 'urgent' ? 0.86 : signalItem.severity === 'decision' ? 0.78 : 0.68,
        });
        return;
      }
      existing.priority += Math.round(signalScore * 0.35);
      existing.confidence = Math.max(existing.confidence, signalItem.severity === 'urgent' ? 0.86 : 0.78);
      if (!existing.signalKinds.includes(signalItem.kind)) {
        existing.signalKinds.push(signalItem.kind);
      }
    });
  });

  return Array.from(byActionSpecId.values())
    .filter((entry) => Boolean(findActionSpec(entry.actionSpecId)))
    .sort((left, right) => right.priority - left.priority)
    .slice(0, 6);
}

function buildRecommendationDrafts(
  state: GameState,
  caseItem: Case,
  signals: DecisionSupportSignal[],
): DecisionSupportRecommendationDraft[] {
  return buildCandidateInputs(signals).map((candidate) => {
    const actionSpec = findActionSpec(candidate.actionSpecId);
    if (!actionSpec) {
      throw new Error(`Unknown action spec candidate: ${candidate.actionSpecId}`);
    }
    const availability = getActionAvailability(state, caseItem, actionSpec.legacyActionId);
    const supportingSignalIds = signals
      .filter((signalItem) => candidate.signalKinds.includes(signalItem.kind))
      .map((signalItem) => signalItem.id);

    return {
      id: `${caseItem.id}:${actionSpec.id}`,
      caseId: caseItem.id,
      actionSpecId: actionSpec.id,
      legacyActionId: actionSpec.legacyActionId,
      decisionMomentIds: [...actionSpec.decisionMomentIds],
      supportingSignalIds,
      priority: Math.round(candidate.priority),
      confidence: candidate.confidence,
      availability,
      source: 'legacy-game-state-read-model',
    };
  });
}

function activeDecisionMomentsFor(
  signals: DecisionSupportSignal[],
  drafts: DecisionSupportRecommendationDraft[],
): DecisionSupportDecisionMoment[] {
  const momentIds = new Set<DecisionMomentId>();
  signals.forEach((signalItem) => signalItem.decisionMomentIds.forEach((momentId) => momentIds.add(momentId)));
  drafts.forEach((draft) => draft.decisionMomentIds.forEach((momentId) => momentIds.add(momentId)));
  return DECISION_MOMENTS
    .filter((moment) => momentIds.has(moment.id))
    .map(cloneDecisionMomentDefinition);
}

function buildCaseDecisionSupportContext(
  state: GameState,
  caseItem: Case,
): CaseDecisionSupportContext {
  const caseSnapshots = buildCaseEvaluationSnapshotsFromLegacyState(state, caseItem);
  const opportunityScores = state.opportunities
    .filter((entry) => entry.caseId === caseItem.id && isOpportunityActiveByCanonicalState(state, entry))
    .map((entry) => buildOpportunityEvaluationSnapshotsFromLegacyState(state, entry).opportunityScore);
  const signals = buildSignals(
    state,
    caseItem,
    caseSnapshots.assetScore,
    caseSnapshots.ownerDecisionReadiness,
    opportunityScores,
  );
  const recommendationDrafts = buildRecommendationDrafts(state, caseItem, signals);

  return {
    caseId: caseItem.id,
    title: caseItem.title,
    status: caseItem.status,
    assetScore: caseSnapshots.assetScore,
    ownerReadiness: caseSnapshots.ownerDecisionReadiness,
    opportunityScores,
    decisionMoments: activeDecisionMomentsFor(signals, recommendationDrafts),
    signals,
    recommendationDrafts,
  };
}

function buildRegionOpenDayFit(state: GameState) {
  const scopes = new Map<string, { district: string; community?: string }>();
  state.cases
    .filter((entry) => isCaseActiveByCanonicalStatus(state, entry))
    .forEach((caseItem) => {
      scopes.set(`district:${caseItem.district}`, { district: caseItem.district });
      scopes.set(`community:${caseItem.district}:${caseItem.community}`, {
        district: caseItem.district,
        community: caseItem.community,
      });
    });
  return Array.from(scopes.values()).map((scope) => buildRegionOpenDayFitSnapshotFromLegacyState(state, scope));
}

/**
 * Builds a decision-support read model from legacy GameState.
 *
 * This adapter only reads legacy world state plus evaluation/business-rule definitions.
 * It does not execute actions, update derived state, or write back into GameState.
 */
export function buildDecisionSupportContextFromLegacyState(state: GameState): DecisionSupportContext {
  return {
    source: 'legacy-game-state-read-model',
    generatedAtDay: state.day,
    readOnly: true,
    cases: state.cases
      .filter((caseItem) => isCaseActiveByCanonicalStatus(state, caseItem))
      .map((caseItem) => buildCaseDecisionSupportContext(state, caseItem)),
    regionOpenDayFit: buildRegionOpenDayFit(state),
    actionSpecs: buildActionSpecReadModels(),
    decisionMoments: buildDecisionMomentReadModels(),
  };
}
