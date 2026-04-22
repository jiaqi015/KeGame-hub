import type { MaintainerRunRecord } from './cloudSync.js';

export interface ShadowWriteSummary {
  listingCount: number;
  leadCount: number;
  leadFeedbackCount: number;
  eventCount: number;
  listingResultCount: number;
  listingFinalResultCount: number;
  sellerStateCount: number;
  competitivenessCount: number;
  matterCount: number;
  weekCycleCount: number;
  recommendationCount: number;
  listingFlagCount: number;
  focusMeetingEntryCount: number;
  matterInteractionCount: number;
}

export interface ShadowSyncVerificationSummary {
  runId: string;
  expected: ShadowWriteSummary;
  actual: ShadowWriteSummary;
}

export function createEmptyShadowWriteSummary(): ShadowWriteSummary {
  return {
    listingCount: 0,
    leadCount: 0,
    leadFeedbackCount: 0,
    eventCount: 0,
    listingResultCount: 0,
    listingFinalResultCount: 0,
    sellerStateCount: 0,
    competitivenessCount: 0,
    matterCount: 0,
    weekCycleCount: 0,
    recommendationCount: 0,
    listingFlagCount: 0,
    focusMeetingEntryCount: 0,
    matterInteractionCount: 0,
  };
}

export function buildShadowWriteSummary(state: MaintainerRunRecord['saveData']): ShadowWriteSummary {
  const cases = Array.isArray(state?.cases) ? state.cases : [];
  const caseResults = Array.isArray(state?.finalResult?.caseResults) ? state.finalResult.caseResults : [];
  return {
    listingCount: cases.length,
    leadCount: Array.isArray(state?.opportunities) ? state.opportunities.length : 0,
    leadFeedbackCount: Array.isArray(state?.opportunities) ? state.opportunities.length : 0,
    eventCount: Array.isArray(state?.eventLog) ? state.eventLog.length : 0,
    listingResultCount: cases.filter((caseItem) =>
      Boolean(
        caseItem?.goalTier
        || caseItem?.storylineState
        || caseItem?.relativeOutcome
        || caseItem?.ownerSatisfaction
        || caseItem?.defenseOutcome
        || caseItem?.endingType
        || caseItem?.endingSummary
        || caseItem?.soldPrice != null,
      ),
    ).length,
    listingFinalResultCount: caseResults.length,
    sellerStateCount: cases.length,
    competitivenessCount: cases.length,
    matterCount: Math.min(
      (Array.isArray(state?.priorities) ? state.priorities.length : 0)
      + (Array.isArray(state?.schedule) ? state.schedule.length : 0),
      20,
    ),
    weekCycleCount: Math.max(
      Array.isArray(state?.weeklyReviews) ? state.weeklyReviews.length : 0,
      1,
    ),
    recommendationCount: Array.isArray(state?.priorities) ? state.priorities.length : 0,
    listingFlagCount: cases.reduce((sum, caseItem) => {
      const riskFlags = Array.isArray(caseItem?.riskFlags) ? caseItem.riskFlags.length : 0;
      return sum + riskFlags + 3;
    }, 0),
    focusMeetingEntryCount: cases.filter((caseItem) => caseItem?.status === 'active' && caseItem?.isFocused).length,
    matterInteractionCount: Math.min(Array.isArray(state?.priorities) ? state.priorities.length : 0, 5),
  };
}
