/**
 * Minimal contracts for the legacy Case/GameState/Opportunity shapes that
 * core evaluation adapters actually need. This avoids importing the full
 * domain aggregates.
 *
 * Consumers that have full domain types can pass them directly since
 * Case/GameState/Opportunity satisfy these contracts. The contracts exist
 * so core does not depend on the domain aggregate at the type level.
 *
 * Array fields use mutable types so domain types (which have mutable arrays)
 * satisfy the contract without casting.
 */

export interface LegacyEvaluationCaseLike {
  id: string;
  title: string;
  community: string;
  district: string;
  askPrice: number;
  bottomPrice: number;
  marketPrice: number;
  priceGapPct: number;
  heat: number;
  competitiveness: number;
  d1: number;
  d2: number;
  d3: number;
  axisScores: Record<string, number>;
  patience: number;
  urgency: number;
  trust: number;
  windowDays: number;
  touchedOwnerToday: boolean;
  lastOwnerTouchedDay: number;
  ownerArchetypeId: string;
  storylineState: string;
  status: string;
  stageIndex: number;
  stageLabel: string;
  riskFlags: string[];
  openDayCooldown: number;
  tags: string[];
  defects: string[];
  story: string;
  qualityStory: number;
  maintainerName: string;
  lastAskPrice: number;
  viewings: number;
  offers: number;
  soldPrice: number | null;
  competitivenessSnapshots: unknown[];
  competitionGroupIds: string[];
  lastPriceActionDay: number;
  goalTier?: string;
  isFocused?: boolean;
  personality: string;
  ownerName: string;
  ownerMood: string;
  ownerProfilingMemory?: unknown;
}

export interface LegacyEvaluationOpportunityLike {
  id: string;
  caseId: string;
  customerId: string;
  customerName: string;
  profile: string;
  channelId: string;
  channelName: string;
  fit: number;
  intent: number;
  confidence: number;
  stageIndex: number;
  stageLabel: string;
  status: string;
  lifecycleStatus: string;
  leadSource: string;
  visibility: string;
  brokerName?: string;
  createdDay: number;
  daysLeft: number;
  touchedToday: boolean;
  budgetMax: number;
  priceSensitivity: number;
  stagnationTicks: number;
  history: { day: number; stage: string }[];
  pendingClosingEvaluation?: boolean;
  pendingClosingStrategyId?: string;
  pendingClosingRequestedDay?: number;
  priceGapPct?: number;
}

export interface LegacyEvaluationStateLike {
  day: number;
  opportunities: LegacyEvaluationOpportunityLike[];
  cases?: LegacyEvaluationCaseLike[];
}

export interface LegacyScoreSeparationCaseLike {
  id: string;
  askPrice: number;
  bottomPrice: number;
  marketPrice: number;
  priceGapPct: number;
  competitiveness: number;
  d1: number;
  d2: number;
  d3: number;
  axisScores: Record<string, number>;
  patience: number;
  urgency: number;
  trust: number;
  windowDays: number;
  touchedOwnerToday: boolean;
  lastOwnerTouchedDay: number;
  ownerArchetypeId: string;
  storylineState: string;
  tags: string[];
  defects: string[];
  story: string;
  qualityStory: number;
  heat: number;
}

export interface LegacyScoreSeparationStateLike {
  day: number;
  opportunities: LegacyScoreSeparationOpportunityLike[];
}

export interface LegacyScoreSeparationOpportunityLike {
  caseId: string;
  status: string;
  stageIndex: number;
}
