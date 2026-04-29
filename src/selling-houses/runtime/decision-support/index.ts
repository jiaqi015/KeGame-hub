export type {
  CaseDecisionSupportContext,
  DecisionSupportContext,
  DecisionSupportContextSource,
  DecisionSupportRecommendationDraft,
  DecisionSupportSignal,
  DecisionSupportSignalKind,
  DecisionSupportSignalSeverity,
} from './types.js';

export {
  buildDecisionSupportContextFromLegacyState,
} from './legacyAdapter.js';
