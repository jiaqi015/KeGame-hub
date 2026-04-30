export type {
  CaseDecisionSupportContext,
  DecisionSupportContext,
  DecisionSupportContextSource,
  DecisionSupportRecommendationDraft,
  DecisionSupportSignal,
  DecisionSupportSignalKind,
  DecisionSupportSignalSeverity,
} from './types.js';

export type {
  DecisionSupportEvaluationBoundaryReadiness,
  DecisionSupportEvaluationBoundaryReport,
} from './evaluation-boundary-report.js';

export {
  buildDecisionSupportEvaluationBoundaryReport,
} from './evaluation-boundary-report.js';

export {
  buildDecisionSupportContextFromLegacyState,
} from './legacyAdapter.js';
