import type { GameState } from '../../domain/models.js';
import {
  buildDecisionSupportContextFromLegacyState,
  type DecisionSupportContext,
  type DecisionSupportContextSource,
  type DecisionSupportSignalKind,
  type DecisionSupportSignalSeverity,
} from '../../runtime/decision-support/index.js';
import { freezeProjection } from './readOnly.js';

export type DecisionSupportWorkspaceProjectionKind = 'decision_support_adapter_state';

export interface DecisionSupportWorkspaceDecisionSupportSummary {
  readonly projectionKind: 'decision_support_context_summary';
  readonly source: DecisionSupportContextSource;
  readonly readOnly: true;
  readonly generatedAtDay: number;
  readonly caseCount: number;
  readonly regionOpenDayFitCount: number;
  readonly actionSpecCount: number;
  readonly decisionMomentDefinitionCount: number;
}

export interface DecisionSupportWorkspaceSignalAggregate {
  readonly count: number;
  readonly bySeverity: Readonly<Record<DecisionSupportSignalSeverity, number>>;
  readonly byKind: Readonly<Partial<Record<DecisionSupportSignalKind, number>>>;
}

export interface DecisionSupportWorkspaceDraftAggregate {
  readonly count: number;
  readonly enabledCount: number;
  readonly disabledCount: number;
  readonly legacyActionIds: readonly string[];
}

export interface DecisionSupportWorkspaceSummary {
  readonly projectionKind: 'decision_support_summary';
  readonly source: DecisionSupportContextSource;
  readonly readOnly: true;
  readonly day: number;
  readonly caseCount: number;
  readonly activeCaseCount: number;
  readonly signalCount: number;
  readonly recommendationDraftCount: number;
  readonly enabledRecommendationDraftCount: number;
  readonly decisionMomentCount: number;
  readonly availableDecisionMomentDefinitionCount: number;
}

export interface DecisionSupportWorkspaceSignalSummary {
  readonly id: string;
  readonly caseId: string;
  readonly kind: DecisionSupportSignalKind;
  readonly severity: DecisionSupportSignalSeverity;
  readonly label: string;
  readonly score?: number;
  readonly sourceModelIds: readonly string[];
  readonly decisionMomentIds: readonly string[];
  readonly actionSpecIds: readonly string[];
}

export interface DecisionSupportWorkspaceRecommendationDraftSummary {
  readonly id: string;
  readonly caseId: string;
  readonly actionSpecId: string;
  readonly legacyActionId: string;
  readonly decisionMomentIds: readonly string[];
  readonly supportingSignalIds: readonly string[];
  readonly priority: number;
  readonly confidence: number;
  readonly enabled: boolean;
  readonly disabledReason: string;
  readonly source: DecisionSupportContextSource;
}

export interface DecisionSupportWorkspaceDecisionMomentSummary {
  readonly id: string;
  readonly name: string;
  readonly summary: string;
  readonly primaryActors: readonly string[];
  readonly triggerActionIds: readonly string[];
  readonly downstreamFlowIds: readonly string[];
}

export interface DecisionSupportWorkspaceCaseProjection {
  readonly projectionKind: 'decision_support_case_summary';
  readonly caseId: string;
  readonly title: string;
  readonly status: string;
  readonly counts: {
    readonly signals: number;
    readonly recommendationDrafts: number;
    readonly decisionMoments: number;
    readonly opportunityScores: number;
  };
  readonly signals: readonly DecisionSupportWorkspaceSignalSummary[];
  readonly recommendationDrafts: readonly DecisionSupportWorkspaceRecommendationDraftSummary[];
  readonly decisionMoments: readonly DecisionSupportWorkspaceDecisionMomentSummary[];
}

export interface DecisionSupportWorkspaceProjection {
  readonly projectionKind: DecisionSupportWorkspaceProjectionKind;
  readonly source: DecisionSupportContextSource;
  readonly readOnly: true;
  readonly day: number;
  readonly decisionSupport: DecisionSupportWorkspaceDecisionSupportSummary;
  readonly summary: DecisionSupportWorkspaceSummary;
  readonly signals: DecisionSupportWorkspaceSignalAggregate;
  readonly recommendationDrafts: DecisionSupportWorkspaceDraftAggregate;
  readonly decisionMoments: readonly DecisionSupportWorkspaceDecisionMomentSummary[];
  readonly cases: readonly DecisionSupportWorkspaceCaseProjection[];
}

type DecisionSupportCaseContext = DecisionSupportContext['cases'][number];
type DecisionSupportDecisionMoment = DecisionSupportContext['decisionMoments'][number];

function summarizeDecisionMoment(
  moment: DecisionSupportDecisionMoment,
): DecisionSupportWorkspaceDecisionMomentSummary {
  return {
    id: moment.id,
    name: moment.name,
    summary: moment.summary,
    primaryActors: [...moment.primaryActors],
    triggerActionIds: [...moment.triggerActionIds],
    downstreamFlowIds: [...moment.downstreamFlowIds],
  };
}

function summarizeSignal(
  signal: DecisionSupportCaseContext['signals'][number],
): DecisionSupportWorkspaceSignalSummary {
  return {
    id: signal.id,
    caseId: signal.caseId,
    kind: signal.kind,
    severity: signal.severity,
    label: signal.label,
    score: signal.score,
    sourceModelIds: [...signal.sourceModelIds],
    decisionMomentIds: [...signal.decisionMomentIds],
    actionSpecIds: [...signal.actionSpecIds],
  };
}

function summarizeRecommendationDraft(
  draft: DecisionSupportCaseContext['recommendationDrafts'][number],
): DecisionSupportWorkspaceRecommendationDraftSummary {
  return {
    id: draft.id,
    caseId: draft.caseId,
    actionSpecId: draft.actionSpecId,
    legacyActionId: draft.legacyActionId,
    decisionMomentIds: [...draft.decisionMomentIds],
    supportingSignalIds: [...draft.supportingSignalIds],
    priority: draft.priority,
    confidence: draft.confidence,
    enabled: draft.availability.enabled,
    disabledReason: draft.availability.reason,
    source: draft.source,
  };
}

function buildCaseProjection(caseContext: DecisionSupportCaseContext): DecisionSupportWorkspaceCaseProjection {
  const signals = caseContext.signals.map(summarizeSignal);
  const recommendationDrafts = caseContext.recommendationDrafts.map(summarizeRecommendationDraft);
  const decisionMoments = caseContext.decisionMoments.map(summarizeDecisionMoment);

  return {
    projectionKind: 'decision_support_case_summary',
    caseId: caseContext.caseId,
    title: caseContext.title,
    status: caseContext.status,
    counts: {
      signals: signals.length,
      recommendationDrafts: recommendationDrafts.length,
      decisionMoments: decisionMoments.length,
      opportunityScores: caseContext.opportunityScores.length,
    },
    signals,
    recommendationDrafts,
    decisionMoments,
  };
}

function countBySeverity(cases: readonly DecisionSupportWorkspaceCaseProjection[]) {
  return cases.reduce<Record<DecisionSupportSignalSeverity, number>>((counts, caseProjection) => {
    caseProjection.signals.forEach((signal) => {
      counts[signal.severity] += 1;
    });
    return counts;
  }, {
    info: 0,
    watch: 0,
    decision: 0,
    urgent: 0,
  });
}

function countByKind(cases: readonly DecisionSupportWorkspaceCaseProjection[]) {
  return cases.reduce<Partial<Record<DecisionSupportSignalKind, number>>>((counts, caseProjection) => {
    caseProjection.signals.forEach((signal) => {
      counts[signal.kind] = (counts[signal.kind] || 0) + 1;
    });
    return counts;
  }, {});
}

function activeDecisionMomentSummaries(
  context: DecisionSupportContext,
): DecisionSupportWorkspaceDecisionMomentSummary[] {
  const activeMomentIds = new Set<string>();
  context.cases.forEach((caseContext) => {
    caseContext.decisionMoments.forEach((moment) => activeMomentIds.add(moment.id));
  });
  return context.decisionMoments
    .filter((moment) => activeMomentIds.has(moment.id))
    .map(summarizeDecisionMoment);
}

function uniqueLegacyActionIds(cases: readonly DecisionSupportWorkspaceCaseProjection[]) {
  return Array.from(new Set(
    cases.flatMap((caseProjection) =>
      caseProjection.recommendationDrafts.map((draft) => draft.legacyActionId)),
  ));
}

export function buildDecisionSupportWorkspaceProjection(state: GameState): DecisionSupportWorkspaceProjection {
  const context = buildDecisionSupportContextFromLegacyState(state);
  const cases = context.cases.map(buildCaseProjection);
  const signalCount = cases.reduce((total, caseProjection) => total + caseProjection.counts.signals, 0);
  const recommendationDraftCount = cases.reduce(
    (total, caseProjection) => total + caseProjection.counts.recommendationDrafts,
    0,
  );
  const enabledRecommendationDraftCount = cases.reduce(
    (total, caseProjection) =>
      total + caseProjection.recommendationDrafts.filter((draft) => draft.enabled).length,
    0,
  );
  const decisionMoments = activeDecisionMomentSummaries(context);

  return freezeProjection({
    projectionKind: 'decision_support_adapter_state',
    source: context.source,
    readOnly: true,
    day: context.generatedAtDay,
    decisionSupport: {
      projectionKind: 'decision_support_context_summary',
      source: context.source,
      readOnly: context.readOnly,
      generatedAtDay: context.generatedAtDay,
      caseCount: context.cases.length,
      regionOpenDayFitCount: context.regionOpenDayFit.length,
      actionSpecCount: context.actionSpecs.length,
      decisionMomentDefinitionCount: context.decisionMoments.length,
    },
    summary: {
      projectionKind: 'decision_support_summary',
      source: context.source,
      readOnly: true,
      day: context.generatedAtDay,
      caseCount: context.cases.length,
      activeCaseCount: context.cases.length,
      signalCount,
      recommendationDraftCount,
      enabledRecommendationDraftCount,
      decisionMomentCount: decisionMoments.length,
      availableDecisionMomentDefinitionCount: context.decisionMoments.length,
    },
    signals: {
      count: signalCount,
      bySeverity: countBySeverity(cases),
      byKind: countByKind(cases),
    },
    recommendationDrafts: {
      count: recommendationDraftCount,
      enabledCount: enabledRecommendationDraftCount,
      disabledCount: recommendationDraftCount - enabledRecommendationDraftCount,
      legacyActionIds: uniqueLegacyActionIds(cases),
    },
    decisionMoments,
    cases,
  }) as DecisionSupportWorkspaceProjection;
}
