import type {
  EvaluationSubjectKind,
  SellingHousesEvaluationSnapshot,
} from './models.js';

export type EvaluationModelId = SellingHousesEvaluationSnapshot['modelId'];

export type EvaluationBoundarySubjectKind =
  | EvaluationSubjectKind
  | readonly EvaluationSubjectKind[];

export interface EvaluationModelInputFacetBoundary {
  facet: string;
  fields: readonly string[];
  note: string;
}

export interface EvaluationModelForbiddenInputFacet {
  facet: string;
  fields: readonly string[];
  reason: string;
}

export interface EvaluationModelLegacyMirrorField {
  field: string;
  sourceFields?: readonly string[];
  concept: string;
  warningLevel: 'compatibility-mirror' | 'legacy-warning';
  futureCanonicalInput: boolean;
  note: string;
}

export interface EvaluationModelBoundary {
  modelId: EvaluationModelId;
  label: string;
  subjectKind: EvaluationBoundarySubjectKind;
  canonicalOutputOwner: string;
  canonicalOutputConcept: string;
  allowedInputFacets: readonly EvaluationModelInputFacetBoundary[];
  forbiddenInputFacets: readonly EvaluationModelForbiddenInputFacet[];
  legacyMirrorFields: readonly EvaluationModelLegacyMirrorField[];
}

export const EVALUATION_MODEL_BOUNDARIES = [
  {
    modelId: 'asset-score',
    label: '好房分',
    subjectKind: 'case',
    canonicalOutputOwner: 'GoodHouseEvaluation',
    canonicalOutputConcept: '好房分 / 资产评价',
    allowedInputFacets: [
      {
        facet: 'asset-intrinsic-quality',
        fields: ['axisScores', 'qualityStory', 'tags', 'defects'],
        note: 'Canonical asset quality inputs describe the property itself.',
      },
      {
        facet: 'market-facing-demand',
        fields: ['heat', 'activeOpportunityCount', 'lateStageOpportunityCount'],
        note: 'Demand and funnel thickness can shape asset evaluation without becoming owner readiness.',
      },
      {
        facet: 'listing-price-position',
        fields: ['askPrice', 'marketPrice', 'priceGapPct'],
        note: 'Listing price position is allowed as market-facing context for the asset.',
      },
    ],
    forbiddenInputFacets: [
      {
        facet: 'broker-owner-relation',
        fields: ['trust', 'lastOwnerTouchedDay', 'touchedOwnerToday'],
        reason: '好房分 is an asset evaluation; broker-owner relationship state is not a canonical asset input.',
      },
      {
        facet: 'owner-decision-readiness',
        fields: ['urgency', 'patience', 'windowDays', 'ownerGapDays', 'ownerArchetypeId', 'storylineState'],
        reason: 'Owner decision pressure belongs to owner-decision-readiness, not future canonical asset-score input.',
      },
    ],
    legacyMirrorFields: [
      {
        field: 'competitiveness',
        sourceFields: ['legacyCompetitiveness'],
        concept: 'Legacy weighted good-house total',
        warningLevel: 'compatibility-mirror',
        futureCanonicalInput: false,
        note: 'Kept only as a read-model mirror of the old score field.',
      },
      {
        field: 'd1',
        sourceFields: ['legacyD1'],
        concept: 'Legacy demand and funnel dimension',
        warningLevel: 'compatibility-mirror',
        futureCanonicalInput: false,
        note: 'D1 is mirrored from legacy scoring for compatibility.',
      },
      {
        field: 'd2',
        sourceFields: ['legacyD2'],
        concept: 'Legacy asset-quality dimension',
        warningLevel: 'compatibility-mirror',
        futureCanonicalInput: false,
        note: 'D2 is mirrored from legacy scoring for compatibility.',
      },
      {
        field: 'd3',
        sourceFields: ['legacyD3'],
        concept: 'Legacy mixed dealability dimension',
        warningLevel: 'compatibility-mirror',
        futureCanonicalInput: false,
        note: 'D3 remains a legacy mirror because it currently mixes price flexibility and owner relation signals.',
      },
      {
        field: 'legacyD3MixedSignals',
        sourceFields: ['legacyD3', 'legacyD3OwnerRelationSignals', 'bottomPrice'],
        concept: 'Legacy D3 mixed relationship and pricing signals',
        warningLevel: 'legacy-warning',
        futureCanonicalInput: false,
        note: 'This is an explicit warning surface only; it must not become a future canonical asset-score input.',
      },
    ],
  },
  {
    modelId: 'owner-decision-readiness',
    label: '业主决策准备度',
    subjectKind: 'case',
    canonicalOutputOwner: 'OwnerDecisionReadiness',
    canonicalOutputConcept: '业主关系 / 决策状态',
    allowedInputFacets: [
      {
        facet: 'broker-owner-relation',
        fields: ['trust', 'lastOwnerTouchedDay', 'touchedOwnerToday'],
        note: 'Trust and owner-touch recency are relationship signals for readiness.',
      },
      {
        facet: 'owner-case-decision-state',
        fields: ['urgency', 'patience', 'windowDays', 'ownerGapDays', 'ownerArchetypeId', 'storylineState'],
        note: 'Decision pressure and runway belong to owner-side readiness.',
      },
      {
        facet: 'price-negotiation-context',
        fields: ['askPrice', 'marketPrice', 'bottomPrice', 'priceGapPct'],
        note: 'Price context can affect readiness to adjust or cooperate.',
      },
    ],
    forbiddenInputFacets: [
      {
        facet: 'asset-intrinsic-quality',
        fields: ['axisScores', 'qualityStory', 'tags', 'defects'],
        reason: 'Physical asset quality should not be treated as owner relationship readiness.',
      },
    ],
    legacyMirrorFields: [],
  },
  {
    modelId: 'opportunity-score',
    label: '客户机会分',
    subjectKind: 'opportunity',
    canonicalOutputOwner: 'CustomerCaseOpportunityEvaluation',
    canonicalOutputConcept: '客户机会评价',
    allowedInputFacets: [
      {
        facet: 'customer-case-relation',
        fields: ['opportunityId', 'caseId', 'stageIndex', 'daysLeft', 'status', 'pendingClosingEvaluation'],
        note: 'Opportunity score evaluates the customer-case relation state.',
      },
      {
        facet: 'customer-demand-state',
        fields: ['fit', 'intent', 'confidence', 'budgetMax'],
        note: 'Customer fit, intent, confidence, and budget shape opportunity quality.',
      },
      {
        facet: 'evaluation-context',
        fields: ['askPrice', 'caseCompetitiveness', 'caseTrust'],
        note: 'Legacy adapters may pass asset and owner-readiness context; future canonical inputs should reference evaluation outputs.',
      },
    ],
    forbiddenInputFacets: [
      {
        facet: 'asset-intrinsic-quality',
        fields: ['axisScores', 'qualityStory', 'defects'],
        reason: 'Opportunity score should consume fit/evaluation context, not raw asset-quality internals.',
      },
    ],
    legacyMirrorFields: [
      {
        field: 'caseTrust',
        sourceFields: ['trust'],
        concept: 'Legacy owner-readiness context',
        warningLevel: 'compatibility-mirror',
        futureCanonicalInput: false,
        note: 'Direct trust scalar is legacy context; use owner-decision-readiness output as the future canonical boundary.',
      },
      {
        field: 'caseCompetitiveness',
        sourceFields: ['competitiveness'],
        concept: 'Legacy asset-score context',
        warningLevel: 'compatibility-mirror',
        futureCanonicalInput: false,
        note: 'Direct competitiveness scalar is legacy context; use asset-score output as the future canonical boundary.',
      },
    ],
  },
  {
    modelId: 'region-open-day-fit',
    label: '区域开放日适配度',
    subjectKind: ['community', 'region'],
    canonicalOutputOwner: 'OpenDayFitEvaluation',
    canonicalOutputConcept: '区域/小区开放日适配度',
    allowedInputFacets: [
      {
        facet: 'open-day-scope',
        fields: ['scope', 'community', 'district', 'caseIds'],
        note: 'Region fit is evaluated for a district or community scope.',
      },
      {
        facet: 'asset-score-rollup',
        fields: ['activeCaseCount', 'averageCompetitiveness', 'averageD1'],
        note: 'OpenDay fit can consume rolled-up asset-score outputs.',
      },
      {
        facet: 'demand-rollup',
        fields: ['activeOpportunityCount', 'averageHeat'],
        note: 'Demand and heat rollups describe whether the scope has enough activity.',
      },
      {
        facet: 'owner-decision-readiness-rollup',
        fields: ['averageTrust', 'averageUrgency', 'averagePatience'],
        note: 'Owner readiness can be consumed as an aggregate suitability input, not as asset quality.',
      },
      {
        facet: 'operation-constraint',
        fields: ['averageOpenDayCooldown'],
        note: 'Cooldown and operating constraints belong to OpenDay fit.',
      },
    ],
    forbiddenInputFacets: [
      {
        facet: 'raw-broker-owner-relation',
        fields: ['trust', 'urgency', 'patience'],
        reason: 'Region fit should consume readiness rollups, not raw per-case relationship fields as asset facts.',
      },
    ],
    legacyMirrorFields: [
      {
        field: 'averageCompetitiveness',
        sourceFields: ['competitiveness'],
        concept: 'Legacy asset-score rollup',
        warningLevel: 'compatibility-mirror',
        futureCanonicalInput: false,
        note: 'This is a rollup mirror until region fit reads canonical asset-score snapshots directly.',
      },
      {
        field: 'averageTrust',
        sourceFields: ['trust'],
        concept: 'Legacy owner-readiness rollup',
        warningLevel: 'compatibility-mirror',
        futureCanonicalInput: false,
        note: 'This is a rollup mirror until region fit reads owner-decision-readiness snapshots directly.',
      },
      {
        field: 'averageUrgency',
        sourceFields: ['urgency'],
        concept: 'Legacy owner-readiness rollup',
        warningLevel: 'compatibility-mirror',
        futureCanonicalInput: false,
        note: 'This is a rollup mirror until region fit reads owner-decision-readiness snapshots directly.',
      },
    ],
  },
] as const satisfies readonly EvaluationModelBoundary[];

const EVALUATION_MODEL_BOUNDARY_BY_ID = new Map<EvaluationModelId, EvaluationModelBoundary>(
  EVALUATION_MODEL_BOUNDARIES.map((entry) => [entry.modelId, entry] as const),
);

export function getEvaluationModelBoundary(modelId: EvaluationModelId) {
  return EVALUATION_MODEL_BOUNDARY_BY_ID.get(modelId) ?? null;
}
