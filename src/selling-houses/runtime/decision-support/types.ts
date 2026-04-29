import type {
  AssetScoreSnapshot,
  OpportunityScoreSnapshot,
  OwnerDecisionReadinessSnapshot,
  RegionOpenDayFitSnapshot,
} from '../../core/evaluation/index.js';
import type {
  ActionSpecDefinition,
  DecisionMomentDefinition,
  DecisionMomentId,
} from '../../core/business-rules/index.js';

export type DecisionSupportContextSource = 'legacy-game-state-read-model';

export type DecisionSupportSignalKind =
  | 'owner-discovery-missing'
  | 'owner-readiness-low'
  | 'asset-positioning-gap'
  | 'lead-pipeline-thin'
  | 'opportunity-close-ready'
  | 'pricing-friction'
  | 'open-day-fit';

export type DecisionSupportSignalSeverity = 'info' | 'watch' | 'decision' | 'urgent';

export type DecisionSupportActionSpec = Readonly<
  Omit<ActionSpecDefinition, 'metricFocus' | 'decisionMomentIds' | 'businessFlowIds'>
> & {
  readonly metricFocus: ReadonlyArray<ActionSpecDefinition['metricFocus'][number]>;
  readonly decisionMomentIds: ReadonlyArray<DecisionMomentId>;
  readonly businessFlowIds: ReadonlyArray<ActionSpecDefinition['businessFlowIds'][number]>;
};

export type DecisionSupportDecisionMoment = Readonly<
  Omit<DecisionMomentDefinition, 'primaryActors' | 'triggerActionIds' | 'expectedSignals' | 'downstreamFlowIds'>
> & {
  readonly primaryActors: ReadonlyArray<DecisionMomentDefinition['primaryActors'][number]>;
  readonly triggerActionIds: readonly string[];
  readonly expectedSignals: ReadonlyArray<DecisionMomentDefinition['expectedSignals'][number]>;
  readonly downstreamFlowIds: readonly string[];
};

export interface DecisionSupportSignal {
  id: string;
  caseId: string;
  kind: DecisionSupportSignalKind;
  severity: DecisionSupportSignalSeverity;
  label: string;
  score?: number;
  sourceModelIds: Array<string>;
  decisionMomentIds: DecisionMomentId[];
  actionSpecIds: Array<string>;
}

export interface DecisionSupportRecommendationDraft {
  id: string;
  caseId: string;
  actionSpecId: string;
  legacyActionId: string;
  decisionMomentIds: DecisionMomentId[];
  supportingSignalIds: Array<string>;
  priority: number;
  confidence: number;
  availability: {
    enabled: boolean;
    reason: string;
  };
  source: DecisionSupportContextSource;
}

export interface CaseDecisionSupportContext {
  caseId: string;
  title: string;
  status: string;
  assetScore: AssetScoreSnapshot;
  ownerReadiness: OwnerDecisionReadinessSnapshot;
  opportunityScores: ReadonlyArray<OpportunityScoreSnapshot>;
  decisionMoments: ReadonlyArray<DecisionSupportDecisionMoment>;
  signals: ReadonlyArray<DecisionSupportSignal>;
  recommendationDrafts: ReadonlyArray<DecisionSupportRecommendationDraft>;
}

export interface DecisionSupportContext {
  source: DecisionSupportContextSource;
  generatedAtDay: number;
  readOnly: true;
  cases: ReadonlyArray<CaseDecisionSupportContext>;
  regionOpenDayFit: ReadonlyArray<RegionOpenDayFitSnapshot>;
  actionSpecs: ReadonlyArray<DecisionSupportActionSpec>;
  decisionMoments: ReadonlyArray<DecisionSupportDecisionMoment>;
}
