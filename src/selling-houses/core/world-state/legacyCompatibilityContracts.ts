/**
 * Canonical legacy compatibility contracts — single source of truth for the
 * field sets that core uses instead of importing domain Case/Opportunity/GameState.
 *
 * Evaluation and world-state adapters derive their types from these canonical
 * bases using Pick/extends/alias, so field drift between the two is impossible.
 *
 * Array fields use readonly types where the domain type uses readonly, so that
 * the domain type is assignable to the contract without casting. Mutable arrays
 * are used only where the domain type is also mutable.
 */

// ---------------------------------------------------------------------------
// Case
// ---------------------------------------------------------------------------

export interface LegacyCanonicalCaseLike {
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

// ---------------------------------------------------------------------------
// Opportunity
// ---------------------------------------------------------------------------

export interface LegacyCanonicalOpportunityLike {
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

// ---------------------------------------------------------------------------
// GameState
// ---------------------------------------------------------------------------

export interface LegacyCanonicalGameStateLike {
  runId: string;
  version: number;
  day: number;
  currentDate: string;
  cases: LegacyCanonicalCaseLike[];
  opportunities: LegacyCanonicalOpportunityLike[];
  markets?: LegacyCanonicalMarketCellLike[];
  customers?: LegacyCanonicalCustomerLike[];
  competitionGroups?: LegacyCanonicalCompetitionGroupLike[];
  productRuns?: LegacyCanonicalProductRunLike[];
  eventStore?: readonly LegacyCanonicalDomainEventLike[];
}

// ---------------------------------------------------------------------------
// MarketCell
// ---------------------------------------------------------------------------

export interface LegacyCanonicalMarketCellLike {
  id: string;
  name: string;
  demandHeat: number;
  supplyPressure: number;
  competitivePressure: number;
  sentiment: number;
  monthlyFactors?: number[];
}

// ---------------------------------------------------------------------------
// Customer
// ---------------------------------------------------------------------------

export interface LegacyCanonicalCustomerLike {
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

// ---------------------------------------------------------------------------
// CompetitionGroup
// ---------------------------------------------------------------------------

export interface LegacyCanonicalCompetitionGroupLike {
  id: string;
  name: string;
  members: string[];
  priceElasticity: number;
  customerSpillover: number;
}

// ---------------------------------------------------------------------------
// ProductRun
// ---------------------------------------------------------------------------

export interface LegacyCanonicalProductRunLike {
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

// ---------------------------------------------------------------------------
// DomainEvent
// ---------------------------------------------------------------------------

export interface LegacyCanonicalDomainEventLike {
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
