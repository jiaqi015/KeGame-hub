export type EvaluationSubjectKind = 'case' | 'opportunity' | 'community' | 'region';

export interface EvaluationSubjectRef {
  kind: EvaluationSubjectKind;
  id: string;
  label: string;
  parentId?: string;
  parentLabel?: string;
}

export interface EvaluationDimensionSnapshot {
  key: string;
  label: string;
  score: number;
  total: number;
  weight?: number;
  inputs?: Record<string, number | string | boolean | null>;
  note?: string;
}

export type EvaluationInputs = Record<
  string,
  number | string | boolean | null | Array<number | string | boolean | null> | Record<string, number | string | boolean | null>
>;

export interface EvaluationSnapshotBase<
  ModelId extends string = string,
  Dimensions extends object = Record<string, EvaluationDimensionSnapshot>,
  Inputs extends object = EvaluationInputs,
> {
  subjectRef: EvaluationSubjectRef;
  modelId: ModelId;
  modelVersion: string;
  day: number;
  score: number;
  total: number;
  dimensions: Dimensions;
  inputs: Inputs;
  confidence: number;
}

export interface AssetScoreDimensions {
  d1: EvaluationDimensionSnapshot;
  d2: EvaluationDimensionSnapshot;
  d3: EvaluationDimensionSnapshot;
}

export interface AssetScoreInputs extends EvaluationInputs {
  legacyCompetitiveness: number;
  legacyD1: number;
  legacyD2: number;
  legacyD3: number;
  askPrice: number;
  marketPrice: number;
  bottomPrice: number;
  heat: number;
  axisScores: Record<string, number | string | boolean | null>;
  activeOpportunityCount: number;
  lateStageOpportunityCount: number;
  legacyD3OwnerRelationSignals: Record<string, number | string | boolean | null>;
}

/**
 * 好房分 read model. It mirrors legacy D1/D2/D3/total for compatibility, but does
 * not make owner readiness a Case truth. Legacy D3 still contains owner relation
 * signals; use OwnerDecisionReadinessSnapshot for the separated relationship view.
 */
export type AssetScoreSnapshot = EvaluationSnapshotBase<
  'asset-score',
  AssetScoreDimensions,
  AssetScoreInputs
>;

export interface OwnerDecisionReadinessDimensions {
  trust: EvaluationDimensionSnapshot;
  urgency: EvaluationDimensionSnapshot;
  patience: EvaluationDimensionSnapshot;
  willingnessToAdjust: EvaluationDimensionSnapshot;
  decisionLoad: EvaluationDimensionSnapshot;
}

export interface OwnerDecisionReadinessInputs extends EvaluationInputs {
  trust: number;
  urgency: number;
  patience: number;
  askPrice: number;
  marketPrice: number;
  bottomPrice: number;
  priceGapPct: number;
  windowDays: number;
  lastOwnerTouchedDay: number;
  ownerGapDays: number;
  touchedOwnerToday: boolean;
  ownerArchetypeId: string;
  storylineState: string;
}

/**
 * Relationship/dependency evaluation for owner-side readiness. This is not
 * persisted Case truth and should not be folded back into asset quality.
 */
export type OwnerDecisionReadinessSnapshot = EvaluationSnapshotBase<
  'owner-decision-readiness',
  OwnerDecisionReadinessDimensions,
  OwnerDecisionReadinessInputs
>;

export interface OpportunityScoreDimensions {
  fit: EvaluationDimensionSnapshot;
  intent: EvaluationDimensionSnapshot;
  confidence: EvaluationDimensionSnapshot;
  closeReadiness: EvaluationDimensionSnapshot;
}

export interface OpportunityScoreInputs extends EvaluationInputs {
  opportunityId: string;
  caseId: string;
  stageIndex: number;
  daysLeft: number;
  status: string;
  budgetMax: number;
  askPrice: number | null;
  caseTrust: number | null;
  caseCompetitiveness: number | null;
  pendingClosingEvaluation: boolean;
}

export type OpportunityScoreSnapshot = EvaluationSnapshotBase<
  'opportunity-score',
  OpportunityScoreDimensions,
  OpportunityScoreInputs
>;

export interface RegionOpenDayFitDimensions {
  assetBase: EvaluationDimensionSnapshot;
  demandBase: EvaluationDimensionSnapshot;
  ownerReadiness: EvaluationDimensionSnapshot;
  operationalFit: EvaluationDimensionSnapshot;
}

export interface RegionOpenDayFitInputs extends EvaluationInputs {
  scope: 'community' | 'region';
  community: string | null;
  district: string;
  caseIds: Array<string>;
  activeCaseCount: number;
  activeOpportunityCount: number;
  averageCompetitiveness: number;
  averageD1: number;
  averageTrust: number;
  averageUrgency: number;
  averageHeat: number;
  averageOpenDayCooldown: number;
}

export type RegionOpenDayFitSnapshot = EvaluationSnapshotBase<
  'region-open-day-fit',
  RegionOpenDayFitDimensions,
  RegionOpenDayFitInputs
>;

export type SellingHousesEvaluationSnapshot =
  | AssetScoreSnapshot
  | OwnerDecisionReadinessSnapshot
  | OpportunityScoreSnapshot
  | RegionOpenDayFitSnapshot;
