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

export interface AssetScoreDimensionDriver {
  label: string;
  value: number | string | boolean;
  contribution: 'positive' | 'negative' | 'neutral';
}

export interface AssetScoreDecisionMoment {
  label: string;
  trigger: string;
  urgency: 'high' | 'medium' | 'low';
}

export interface AssetScoreDimensions {
  d1: EvaluationDimensionSnapshot;
  d2: EvaluationDimensionSnapshot;
  d3: EvaluationDimensionSnapshot;
  /**
   * D4 Competition / Service-Path Advantage.
   *
   * **Derived projection, not a canonical Case field.** D4 is computed from
   * CompetitionPressureSnapshot (receipt data produced by Agent C's buffer),
   * never from Case fields directly. It does NOT participate in `snapshot.score`
   * (the total remains the legacy D1/D2/D3 weighted sum). D4 may be absent if
   * competition receipts are not yet available for this tick.
   */
  d4?: EvaluationDimensionSnapshot;
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
 *
 * Aligned with mother-model GoodHouseScoreSnapshot v1:
 * - D1 Demand / Opportunity Momentum
 * - D2 Asset Quality
 * - D3 Owner-Side Deal Readiness (legacy mixed)
 * - D4 Competition / Service-Path Advantage (optional, from competition receipts)
 * - blockers, topDrivers, recommendedDecisionMoments for decision support
 */
export type AssetScoreSnapshot = EvaluationSnapshotBase<
  'asset-score',
  AssetScoreDimensions,
  AssetScoreInputs
> & {
  /** What is blocking this case from closing. Derived from D1-D4 signals. */
  readonly blockers: readonly string[];
  /** Top positive drivers ranked by contribution. */
  readonly topDrivers: readonly AssetScoreDimensionDriver[];
  /** Decision moments the broker should consider. */
  readonly recommendedDecisionMoments: readonly AssetScoreDecisionMoment[];
};

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

// ---------------------------------------------------------------------------
// D4 Receipt Coverage
// ---------------------------------------------------------------------------

export type D4SourceCategory = 'wired' | 'pending' | 'informational';

export interface D4SourceCoverageEntry {
  readonly source: string;
  readonly category: D4SourceCategory;
  readonly present: boolean;
}

export interface D4ReceiptCoverageReport {
  readonly sources: readonly D4SourceCoverageEntry[];
  readonly wiredCount: number;
  readonly wiredTotal: number;
  readonly pendingSources: readonly string[];
  readonly coverage: number;
  readonly maxConfidence: number;
}
