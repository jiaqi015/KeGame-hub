/**
 * Minimal contracts for the legacy Case/GameState/Opportunity shapes that
 * core world-state adapters actually need. This avoids importing the full
 * domain aggregates.
 *
 * Consumers that have full domain types can pass them directly since
 * Case/GameState/Opportunity satisfy these contracts. The contracts exist
 * so core does not depend on the domain aggregate at the type level.
 *
 * Array fields use mutable types so domain types satisfy the contract
 * without casting.
 */

export interface LegacyWorldCaseLike {
  id: string;
  housePrototypeId: string;
  title: string;
  community: string;
  district: string;
  layout: string;
  area: number;
  askPrice: number;
  marketPrice: number;
  bottomPrice: number;
  lastAskPrice: number;
  priceGapPct: number;
  heat: number;
  status: string;
  stageIndex: number;
  stageLabel: string;
  riskFlags: string[];
  goalTier?: string;
  storylineState: string;
  viewings: number;
  offers: number;
  soldPrice: number | null;
  ownerArchetypeId: string;
  ownerName: string;
  ownerMood: string;
  personality: string;
  trust: number;
  patience: number;
  urgency: number;
  windowDays: number;
  maintainerName: string;
  marketCellId: string;
  story: string;
  tags: string[];
  defects: string[];
  touchedOwnerToday: boolean;
  lastOwnerTouchedDay: number;
  competitionGroupIds: string[];
  axisScores: Record<string, number>;
  competitiveness: number;
  d1: number;
  d2: number;
  d3: number;
  isFocused?: boolean;
  ownerSatisfaction?: string;
  relativeOutcome?: string;
  defenseOutcome?: string;
  endingType?: string;
  endingBucket?: string;
  endingSummary?: string;
  actionsApplied?: string[];
  actionsToday: number;
  touchedToday: boolean;
  lastTouchedDay: number;
  hasCompletedFirstVisit: boolean;
  lastAction: string;
  lastPriceActionDay: number;
  openDayCooldown: number;
  qualityStory: number;
  negotiationBonus: number;
  competitivenessSnapshots: unknown[];
  lastRivalThreatDay?: number;
  ownerProfilingMemory?: unknown;
}

export interface LegacyWorldOpportunityLike {
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
}

export interface LegacyWorldGameStateLike {
  runId: string;
  version: number;
  day: number;
  currentDate: string;
  cases: LegacyWorldCaseLike[];
  opportunities: LegacyWorldOpportunityLike[];
  markets?: LegacyWorldMarketCellLike[];
  customers?: LegacyWorldCustomerLike[];
  competitionGroups?: LegacyWorldCompetitionGroupLike[];
  productRuns?: LegacyWorldProductRunLike[];
  eventStore?: LegacyWorldDomainEventLike[];
}

export interface LegacyWorldMarketCellLike {
  id: string;
  name: string;
  demandHeat: number;
  supplyPressure: number;
  competitivePressure: number;
  sentiment: number;
  monthlyFactors?: number[];
}

export interface LegacyWorldCustomerLike {
  id: string;
  name: string;
  profile: string;
  budgetMin: number;
  budgetMax: number;
  targetDistrict: string;
  layouts: readonly string[];
  activity: number;
  urgency: number;
  priceSensitivity: number;
  preferences: readonly string[];
}

export interface LegacyWorldCompetitionGroupLike {
  id: string;
  name: string;
  members: string[];
  priceElasticity: number;
  customerSpillover: number;
}

export interface LegacyWorldProductRunLike {
  id: string;
  productType: string;
  scope: string;
  status: string;
  startDay?: number;
  endDay?: number;
  targetIds: string[];
  nextMilestone?: string;
  linkedEventIds?: string[];
  milestones?: unknown[];
}

export interface LegacyWorldDomainEventLike {
  id: string;
  day: number;
  date?: string;
  kind: string;
  actor: string;
  title: string;
  detail?: string;
  tone?: string;
  caseId?: string;
  customerId?: string;
  payload?: Record<string, unknown>;
}
