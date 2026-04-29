export type EvaluationMetricModelId =
  | 'asset-score'
  | 'owner-decision-readiness'
  | 'opportunity-score'
  | 'region-open-day-fit';

export interface EvaluationMetricDefinition {
  id: string;
  modelId: EvaluationMetricModelId;
  label: string;
  description: string;
  total: number;
  stable: true;
}

export interface EvaluationModelMetricDefinition {
  modelId: EvaluationMetricModelId;
  version: string;
  label: string;
  boundary: string;
  metrics: EvaluationMetricDefinition[];
}

function metric(
  modelId: EvaluationMetricModelId,
  id: string,
  label: string,
  description: string,
): EvaluationMetricDefinition {
  return {
    id,
    modelId,
    label,
    description,
    total: 100,
    stable: true,
  };
}

export const ASSET_SCORE_METRICS: EvaluationModelMetricDefinition = {
  modelId: 'asset-score',
  version: '1.0.0',
  label: '好房分',
  boundary:
    'Read-only asset score snapshot. It mirrors legacy D1/D2/D3/total; legacy D3 is explicitly marked as relationship-mixed and should not be treated as owner readiness truth.',
  metrics: [
    metric('asset-score', 'd1', 'D1 客户需求与漏斗', 'Legacy demand and funnel strength dimension.'),
    metric('asset-score', 'd2', 'D2 房源基础资产', 'Legacy physical/location/story asset dimension.'),
    metric('asset-score', 'd3', 'D3 成交条件（legacy）', 'Legacy dealability dimension; currently includes owner relation signals.'),
    metric('asset-score', 'total', '好房分 total', 'Legacy weighted D1/D2/D3 competitiveness total.'),
  ],
};

export const OWNER_DECISION_READINESS_METRICS: EvaluationModelMetricDefinition = {
  modelId: 'owner-decision-readiness',
  version: '1.0.0',
  label: '业主决策准备度',
  boundary:
    'Relationship/dependency evaluation only. It is not Case truth and should stay separate from asset scoring.',
  metrics: [
    metric('owner-decision-readiness', 'trust', '信任', 'Current owner trust in the maintainer relationship.'),
    metric('owner-decision-readiness', 'urgency', '紧迫度', 'Current owner urgency signal.'),
    metric('owner-decision-readiness', 'patience', '耐心', 'Current owner patience and runway signal.'),
    metric('owner-decision-readiness', 'willingnessToAdjust', '调价/配合意愿', 'Inferred willingness to adjust price or cooperate.'),
    metric('owner-decision-readiness', 'decisionLoad', '决策负荷', 'Inverse friction score for owner-side decision pressure.'),
    metric('owner-decision-readiness', 'total', '业主决策准备度 total', 'Relationship/dependency readiness aggregate.'),
  ],
};

export const OPPORTUNITY_SCORE_METRICS: EvaluationModelMetricDefinition = {
  modelId: 'opportunity-score',
  version: '1.0.0',
  label: '客户机会分',
  boundary:
    'Read-only opportunity evaluation for a customer-case relation. It does not mutate opportunity stage, status, or deal eligibility.',
  metrics: [
    metric('opportunity-score', 'fit', '匹配度', 'Customer-case fit.'),
    metric('opportunity-score', 'intent', '意向', 'Customer intent.'),
    metric('opportunity-score', 'confidence', '成交把握', 'Customer confidence and transaction certainty.'),
    metric('opportunity-score', 'closeReadiness', '收口准备度', 'Estimated readiness to enter closing action.'),
    metric('opportunity-score', 'total', '客户机会分 total', 'Opportunity aggregate score.'),
  ],
};

export const REGION_OPEN_DAY_FIT_METRICS: EvaluationModelMetricDefinition = {
  modelId: 'region-open-day-fit',
  version: '1.0.0',
  label: '区域开放日适配度',
  boundary:
    'Read-only region/community suitability for OpenDay. It evaluates fit and capacity signals; it does not create product runs or action availability.',
  metrics: [
    metric('region-open-day-fit', 'assetBase', '房源基础', 'Active case asset base in the region/community.'),
    metric('region-open-day-fit', 'demandBase', '区域客需', 'Demand, heat, and active opportunity base.'),
    metric('region-open-day-fit', 'ownerReadiness', '业主配合基础', 'Owner-side cooperation base for running an OpenDay.'),
    metric('region-open-day-fit', 'operationalFit', '开放日操作条件', 'Current operational fit including cooldown constraints.'),
    metric('region-open-day-fit', 'total', '区域开放日适配度 total', 'OpenDay suitability aggregate.'),
  ],
};

export const EVALUATION_MODEL_METRICS = [
  ASSET_SCORE_METRICS,
  OWNER_DECISION_READINESS_METRICS,
  OPPORTUNITY_SCORE_METRICS,
  REGION_OPEN_DAY_FIT_METRICS,
] as const;

export function getEvaluationModelMetrics(modelId: EvaluationMetricModelId) {
  return EVALUATION_MODEL_METRICS.find((entry) => entry.modelId === modelId) || null;
}
