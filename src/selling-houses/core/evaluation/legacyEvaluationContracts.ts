/**
 * Evaluation-layer legacy contracts, derived from the canonical kernel.
 *
 * These contracts express only what evaluation adapters need from the legacy
 * Case/Opportunity/GameState shapes. They use Pick/extends from the single
 * canonical source in legacyCompatibilityContracts.ts so field drift is impossible.
 *
 * Array fields use mutable types so domain types satisfy the contract without
 * casting.
 */

import type {
  LegacyCanonicalCaseLike,
  LegacyCanonicalOpportunityLike,
  LegacyCanonicalGameStateLike,
} from '../world-state/legacyCompatibilityContracts.js';

// Evaluation needs most Case fields plus evaluation-specific derived access
export type LegacyEvaluationCaseLike = LegacyCanonicalCaseLike;

export type LegacyEvaluationOpportunityLike = LegacyCanonicalOpportunityLike;

export type LegacyEvaluationStateLike = Pick<LegacyCanonicalGameStateLike,
  'day' | 'opportunities'
> & {
  cases?: LegacyCanonicalCaseLike[];
};

// Score-separation needs a focused subset of Case fields
export type LegacyScoreSeparationCaseLike = Pick<LegacyCanonicalCaseLike,
  | 'id' | 'askPrice' | 'bottomPrice' | 'marketPrice' | 'priceGapPct'
  | 'competitiveness' | 'd1' | 'd2' | 'd3' | 'axisScores'
  | 'patience' | 'urgency' | 'trust' | 'windowDays'
  | 'touchedOwnerToday' | 'lastOwnerTouchedDay' | 'ownerArchetypeId'
  | 'storylineState' | 'tags' | 'defects' | 'story' | 'qualityStory' | 'heat'
>;

export type LegacyScoreSeparationStateLike = Pick<LegacyCanonicalGameStateLike, 'day'> & {
  opportunities: LegacyScoreSeparationOpportunityLike[];
};

export type LegacyScoreSeparationOpportunityLike = Pick<LegacyCanonicalOpportunityLike,
  'caseId' | 'status' | 'stageIndex'
>;
