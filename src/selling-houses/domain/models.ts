export type Tone = 'accent' | 'danger' | 'success';
export type LeadSourceType = 'direct' | 'broker';
export type ActionCategoryId = 'feedback' | 'marketing' | 'pricing' | 'negotiation';
export type ActionFamily =
  | 'owner'
  | 'merchandising'
  | 'pricing'
  | 'promotion'
  | 'showing'
  | 'negotiation'
  | 'broker';
export type BattleActor = 'owner' | 'market' | 'customer';
export type ActionMetricKey =
  | 'trust'
  | 'patience'
  | 'urgency'
  | 'heat'
  | 'competitiveness'
  | 'd1'
  | 'd2'
  | 'd3'
  | 'windowDays'
  | 'askPrice'
  | 'intent'
  | 'confidence'
  | 'promotionBudget'
  | 'wordOfMouth'
  | 'commission';

export interface ActionCategoryDefinition {
  id: ActionCategoryId;
  name: string;
  summary: string;
}

export interface ActionStrategyDefinition {
  id: string;
  title: string;
  note: string;
}

export interface ActionBattleTemplate {
  id: string;
  actor: BattleActor;
  title: string;
  summary: string;
  metricFocus: ActionMetricKey[];
  buildBody: (state: GameState, caseItem: Case, action: ActionDefinition) => string;
  getStrategies: (state: GameState, caseItem: Case, action: ActionDefinition) => ActionStrategyDefinition[];
}

export interface ActionDefinition {
  id: string;
  categoryId?: ActionCategoryId;
  family?: ActionFamily;
  name: string;
  summary?: string;
  costEnergy: number;
  costPromotionBudget: number;
  description: string;
  type?: 'direct' | 'scenario';
  templateId?: string;
  executorId?: string;
  metricFocus?: ActionMetricKey[];
}

export type DifficultyId = 'warmup' | 'easy' | 'standard' | 'advanced' | 'hard' | 'extreme';
export type GoalContextId = 'ability' | 'defense' | 'satisfaction';
export type GoalTier = 'core' | 'important' | 'normal';
export type ListingRelativeOutcome = 'outrun' | 'flat' | 'lose';
export type OwnerSatisfactionState = 'happy' | 'neutral' | 'no_regret' | 'regret' | 'unhappy';
export type DefenseOutcome = 'held' | 'at_risk' | 'lost_to_rival' | 'withdrawn';
export type StorylineState = 'healthy' | 'fragile' | 'sliding' | 'critical';
export type ListingEndingBucket = 'good' | 'neutral' | 'bad';
export type ListingEndingType =
  | 'sold_by_you_happy'
  | 'sold_by_you_neutral'
  | 'sold_by_you_regret'
  | 'sold_by_other'
  | 'not_sold_no_regret'
  | 'not_sold_regret'
  | 'switch_to_rent_no_regret'
  | 'withdrawn_unhappy';

export interface DifficultyPreviewMetric {
  label: string;
  value: string;
}

export interface DifficultyOption {
  id: DifficultyId;
  label: string;
  summary: string;
  detail: string;
  scenarioCount: number;
  featuredSeed: number;
  preview: DifficultyPreviewMetric[];
}

export interface ScoreThresholds {
  pass: number;
  strong: number;
  ace: number;
}

export interface ScenarioPresentationSummary {
  theme: string;
  description: string;
  caseCount: number;
  maxDay: number;
  goalContext: GoalContextId;
  targetScore: number;
}

export interface BoardPressureProfile {
  abilityPressure: number;
  defensePressure: number;
  satisfactionPressure: number;
}

export interface GameRules {
  maxDay: number;
  baseMaxEnergy: number;
  initialCash: number;
  weeklyBudgetAllowance: number;
  promotionRebateRatio: number;
  promotionRebateFloor: number;
  initialWordOfMouth: number;
  initialCommission: number;
  initialEnergy: number;
  passiveLeadBaseMultiplier: number;
  passiveLeadFocusedMultiplier: number;
  randomEventProbability: number;
  seasonalityImpact: number;
  competitionPressureThreshold: number;
  competitionHeatPenaltyMin: number;
  competitionHeatPenaltyMax: number;
  competitionTrustLossChance: number;
  competitionLogChance: number;
  rivalLossProbabilityScale: number;
  ownerUntouchedTrustLoss: number;
  urgentOwnerUntouchedTrustLoss: number;
  ownerPatienceDecayAfterDays: number;
  ownerPatienceDecayAmount: number;
  scriptedEventImpactScale: number;
  dailyMarketEventProbability: number;
  rivalListingSpawnChance: number;
  rivalPressureHeatImpact: number;
  rivalPressureTrustImpact: number;
  companySharedLeadPressureBase: number;
  companyReferralChanceBase: number;
  marketSignalDecayDays: number;
  marketSignalMaxVisible: number;
}

export type GameRuleOverrides = Partial<GameRules> & {
  /** Legacy alias kept for older authored scenarios and saves. */
  initialReputation?: number;
  saleBudgetBonusRatio?: number;
  saleBudgetBonusFloor?: number;
};

export interface MarketCell {
  id: string;
  name: string;
  demandHeat: number;
  supplyPressure: number;
  competitivePressure: number;
  sentiment: number;
  monthlyFactors?: number[];
}

export interface CustomerProfile {
  id: string;
  name: string;
  profile: string;
  budgetMin: number;
  budgetMax: number;
  targetDistrict: string;
  layouts: string[];
  activity: number;
  urgency: number;
  priceSensitivity: number;
  preferences: string[];
}

export type CustomerRuntimeStatus =
  | 'idle'
  | 'browsing'
  | 'comparing'
  | 'engaged'
  | 'negotiating'
  | 'lost'
  | 'converted';

export type CustomerDecisionStyle = 'decisive' | 'balanced' | 'hesitant';

export interface CustomerCaseRuntime {
  caseId: string;
  fit: number;
  interest: number;
  confidence: number;
  stageIndex: number;
  interactions: number;
  lastActiveDay: number;
  viewed: boolean;
  offered: boolean;
  selected: boolean;
  competingCaseIds?: string[];
}

export interface CustomerRuntimeState {
  customerId: string;
  status: CustomerRuntimeStatus;
  decisionStyle: CustomerDecisionStyle;
  advisorTrust: number;
  fatigue: number;
  churnRisk: number;
  activeCaseIds: string[];
  caseStates: Record<string, CustomerCaseRuntime>;
  lastTouchDay: number;
  lastActionNote?: string;
}

export interface ChannelProfile {
  id: string;
  name: string;
  quality: number;
  controllability: number;
  leadSource?: LeadSourceType;
}

export interface OwnerArchetype {
  id: string;
  label: string;
  description: string;
  trustDecayMultiplier: number;
  priceElasticity: number;
  urgencyGrowthBonus: number;
  heatSensitivity: number;
  patienceDelta: number;
  preferredTactic: 'hold-story' | 'small-cut' | 'deep-cut';
}

export interface HousePrototype {
  id: string;
  title: string;
  community: string;
  district: string;
  layout: string;
  area: number;
  marketCellId: string;
  marketPrice: number;
  bottomPrice: number;
  story: string;
  tags: string[];
  defects: string[];
  axisScores: Record<string, number>;
}

export interface ScenarioCase {
  id: string;
  housePrototypeId: string;
  ownerArchetypeId: string;
  ownerName: string;
  ownerMood: string;
  maintainerName: string;
  askPrice: number;
  bottomPrice: number;
  initialTrust: number;
  initialPatience: number;
  initialHeat: number;
  initialUrgency: number;
  windowDays: number;
  goalTier?: GoalTier;
}

export interface CompetitionGroup {
  id: string;
  name: string;
  members: string[];
  priceElasticity: number;
  customerSpillover: number;
}

export interface RandomEventTemplate {
  id: string;
  title: string;
  tone: Tone;
  actor: string;
}

export interface RivalStoreArchetype {
  id: string;
  name: string;
  type: 'same_company' | 'external_company';
  style: 'aggressive' | 'steady' | 'relationship' | 'traffic';
  districtFocus: string[];
  leadCapturePower: number;
  sellerInfluencePower: number;
  pricingPressurePower: number;
}

export interface RivalListingArchetype {
  id: string;
  titlePrefix: string;
  segment: string;
  sourceBias: 'same_company' | 'external_company' | 'mixed';
  baseHeat: number;
  freshness: number;
  storyStrength: number;
  leadSiphonPower: number;
  ownerAnchorPower: number;
}

export interface SignalTemplate {
  id: string;
  type: 'buyer_demand' | 'seller_intent' | 'rival_activity';
  title: string;
  message: string;
}

export interface DailyEventTemplate {
  id: string;
  title: string;
  message: string;
  tone: Tone;
  layer: 'market' | 'rival' | 'company' | 'seller';
  effectType:
    | 'heat_wave'
    | 'rival_listing_inflow'
    | 'company_pressure_shift'
    | 'customer_return'
    | 'listing_inbound'
    | 'signal_only';
}

export interface WeightedRandomEventRef {
  templateId: string;
  weight: number;
}

export interface WeightedDailyEventRef {
  templateId: string;
  weight: number;
}

export interface RivalStore {
  id: string;
  name: string;
  type: 'same_company' | 'external_company';
  style: 'aggressive' | 'steady' | 'relationship' | 'traffic';
  districtFocus: string[];
  leadCapturePower: number;
  sellerInfluencePower: number;
  pricingPressurePower: number;
  activityHeat: number;
}

export interface RivalListing {
  id: string;
  storeId: string;
  title: string;
  district: string;
  marketCellId: string;
  linkedCaseId?: string;
  segment: string;
  askPrice: number;
  heat: number;
  freshness: number;
  storyStrength: number;
  leadSiphonPower: number;
  ownerAnchorPower: number;
  status: 'active' | 'sold' | 'withdrawn';
  daysLeft: number;
  source: 'seed' | 'daily_event' | 'inbound';
}

export interface CompanyPressureState {
  sharedLeadPressure: number;
  focusSlotPressure: number;
  internalReferralChance: number;
  internalCompetitionHeat: number;
}

export interface MarketSignal {
  id: string;
  type: 'buyer_demand' | 'seller_intent' | 'rival_activity';
  district: string;
  confidence: number;
  title: string;
  message: string;
  expiresInDays: number;
}

export interface RuleEffect {
  id: string;
  source: 'daily_market_event' | 'company_pressure' | 'rival_listing';
  label: string;
  expiresInDays: number;
}

export interface DailyMarketEvent {
  id: string;
  day: number;
  title: string;
  message: string;
  tone: Tone;
  layer: 'market' | 'rival' | 'company' | 'seller';
  effectType:
    | 'heat_wave'
    | 'rival_listing_inflow'
    | 'company_pressure_shift'
    | 'customer_return'
    | 'listing_inbound'
    | 'signal_only';
  targetMarketCellId?: string;
}

export interface InboundOpportunity {
  id: string;
  type:
    | 'customer_to_player'
    | 'listing_to_player'
    | 'rival_listing_to_market'
    | 'signal_to_player';
  source:
    | 'same_company'
    | 'external_company'
    | 'seller_referral'
    | 'market_event'
    | 'system_seed';
  title: string;
  message: string;
  payload: Record<string, unknown>;
}

export interface ShadowMarketState {
  rivalStores: RivalStore[];
  rivalListings: RivalListing[];
  companyPressure: CompanyPressureState;
  marketSignals: MarketSignal[];
  dailyMarketEvent: DailyMarketEvent | null;
  activeRuleEffects: RuleEffect[];
  inboundQueue: InboundOpportunity[];
}

export interface ScriptedEvent {
  id: string;
  day: number;
  actor: string;
  title: string;
  message: string;
  tone: Tone;
  targetCaseId?: string;
  targetMarketCellId?: string;
  trustDelta?: number;
  heatDelta?: number;
  urgencyDelta?: number;
  askPriceDelta?: number;
  windowDaysDelta?: number;
  confidenceDelta?: number;
  sentimentDelta?: number;
  demandHeatDelta?: number;
  competitionPressureDelta?: number;
}

export interface WorldSpec {
  id: string;
  version: number;
  name: string;
  marketCells: MarketCell[];
  customers: CustomerProfile[];
  channels: ChannelProfile[];
  ownerArchetypes: OwnerArchetype[];
  housePrototypes: HousePrototype[];
  randomEventTemplates: RandomEventTemplate[];
  rivalStoreArchetypes?: RivalStoreArchetype[];
  rivalListingArchetypes?: RivalListingArchetype[];
  signalTemplates?: SignalTemplate[];
  dailyEventTemplates?: DailyEventTemplate[];
}

export interface ScenarioDefinition {
  id: string;
  worldId: string;
  worldVersion: number;
  difficultyId: DifficultyId;
  name: string;
  theme: string;
  description: string;
  startMonth: number;
  startDay: number;
  maxDay: number;
  cases: ScenarioCase[];
  competitionGroups: CompetitionGroup[];
  scriptedEvents: ScriptedEvent[];
  randomEventPool: WeightedRandomEventRef[];
  initialRivalStores?: RivalStore[];
  initialRivalListings?: RivalListing[];
  dailyEventPool?: WeightedDailyEventRef[];
  companyPressureProfile?: Partial<CompanyPressureState>;
  goalContext?: GoalContextId;
  targetScore?: number;
  scoreThresholds?: ScoreThresholds;
  boardPressureProfile?: BoardPressureProfile;
  rules?: GameRuleOverrides;
  published: boolean;
}

export interface ScenarioSummary {
  id: string;
  difficultyId: DifficultyId;
  name: string;
  opening: ScenarioOpeningRef;
  presentation: ScenarioPresentationSummary;
}

export interface ScenarioCatalogOpeningRef {
  kind: 'scenario';
  scenarioId: string;
}

export interface GeneratedScenarioOpeningRef {
  kind: 'generated';
  difficultyId: DifficultyId;
  seed: number;
  preset: 'standard' | 'random';
}

export type ScenarioOpeningRef = ScenarioCatalogOpeningRef | GeneratedScenarioOpeningRef;

export interface ScenarioSnapshot {
  world: WorldSpec;
  scenario: ScenarioDefinition;
  source: 'builtin' | 'cloud';
}

export interface RunContext {
  scenarioId: string;
  scenarioName: string;
  difficultyId: DifficultyId;
  worldId: string;
  worldVersion: number;
  runSeed: number;
  scenarioSeed?: number;
  rngSeed: number;
  createdAt: string;
  scenarioSnapshot: ScenarioSnapshot;
}

export interface Case {
  id: string;
  housePrototypeId: string;
  ownerArchetypeId: string;
  title: string;
  community: string;
  district: string;
  layout: string;
  area: number;
  askPrice: number;
  marketPrice: number;
  bottomPrice: number;
  patience: number;
  trust: number;
  heat: number;
  competitiveness: number;
  d1: number;
  d2: number;
  d3: number;
  axisScores: Record<string, number>;
  urgency: number;
  windowDays: number;
  ownerName: string;
  ownerMood: string;
  maintainerName: string;
  marketCellId: string;
  story: string;
  tags: string[];
  defects: string[];
  status: 'active' | 'sold' | 'withdrawn' | 'lost_to_rival';
  stageIndex: number;
  stageLabel: string;
  riskFlags: string[];
  actionsApplied?: string[];
  actionsToday: number;
  touchedToday: boolean;
  touchedOwnerToday: boolean;
  lastTouchedDay: number;
  lastOwnerTouchedDay: number;
  hasCompletedFirstVisit: boolean;
  lastAction: string;
  lastPriceActionDay: number;
  openDayCooldown: number;
  qualityStory: number;
  negotiationBonus: number;
  viewings: number;
  offers: number;
  soldPrice: number | null;
  priceGapPct: number;
  competitivenessSnapshots: CompetitivenessSnapshot[];
  competitionGroupIds: string[];
  lastAskPrice: number;
  lastRivalThreatDay?: number;
  goalTier: GoalTier;
  storylineState: StorylineState;
  relativeOutcome?: ListingRelativeOutcome;
  ownerSatisfaction?: OwnerSatisfactionState;
  defenseOutcome?: DefenseOutcome;
  endingType?: ListingEndingType;
  endingBucket?: ListingEndingBucket;
  endingSummary?: string;
  isFocused?: boolean;
  personality: 'pragmatic' | 'emotional' | 'urgent';
}

export interface ScoreDimensionResult {
  label: string;
  score: number;
  maxScore: number;
  summary: string;
  attribution?: ScoreAttribution;
}

export interface ScoreAttributionItem {
  key: string;
  label: string;
  count: number;
  tone: 'positive' | 'warning' | 'neutral';
}

export interface ScoreAttribution {
  headline: string;
  actions: ScoreAttributionItem[];
  events: ScoreAttributionItem[];
}

export interface ScoreBreakdownEntry {
  label: string;
  value: number;
  maxValue?: number;
  summary?: string;
  attribution?: ScoreAttribution;
}

export interface CaseFinalResult {
  caseId: string;
  title: string;
  ownerName: string;
  community: string;
  status: Case['status'];
  goalTier: GoalTier;
  endingType: ListingEndingType;
  endingBucket: ListingEndingBucket;
  endingBucketLabel: string;
  endingLabel: string;
  endingSummary: string;
  relativeOutcome: ListingRelativeOutcome;
  relativeOutcomeLabel: string;
  ownerSatisfaction: OwnerSatisfactionState;
  ownerSatisfactionLabel: string;
  defenseOutcome: DefenseOutcome;
  defenseOutcomeLabel: string;
  soldPrice: number | null;
  finalTrust: number;
  finalCompetitiveness: number;
  remainingWindowDays: number;
}

export interface FinalCustomerReview {
  engaged: number;
  comparing: number;
  atRisk: number;
  rivalPulled: number;
  strongestCaseTitle: string | null;
  mostComparedCaseTitle: string | null;
  mostAtRiskCaseTitle: string | null;
  summary: string;
  notes: string[];
}

export interface FinalResult {
  title: string;
  summary: string;
  reason: string;
  grade: string;
  goalContext: GoalContextId;
  targetScore: number;
  score: number;
  dimensions: {
    ability: ScoreDimensionResult;
    defense: ScoreDimensionResult;
    satisfaction: ScoreDimensionResult;
  };
  scoreBreakdown: ScoreBreakdownEntry[];
  highlights: string[];
  improvements: string[];
  promotionNotes: string[];
  coachNotes: string[];
  nextRunAdvice: string[];
  customerReview: FinalCustomerReview;
  caseResults: CaseFinalResult[];
  endingStats: {
    good: number;
    neutral: number;
    bad: number;
    coreBadCount: number;
    importantBadCount: number;
    weightedGood: number;
    weightedBad: number;
  };
  stats: Array<{ label: string; value: string }>;
}

export type DealType =
  | 'self_closed'
  | 'internal_cosale_closed'
  | 'external_competitor_closed'
  | 'platform_matched_closed';

export interface DealClosingEvaluation {
  relationId: string;
  caseId: string;
  customerId: string;
  dayIndex: number;
  isEligible: boolean;
  closeReadiness: number;
  closeProbability: number;
  blockingReasons: string[];
  supportingReasons: string[];
}

export interface ClosedDealRecord {
  dealId: string;
  caseId: string;
  customerId: string;
  sourceRelationId: string;
  /** Legacy alias kept for older runtime helpers and persisted saves. */
  opportunityId: string;
  dayIndex: number;
  /** Legacy alias kept for older saves. */
  day: number;
  closedAt: string;
  dealType: DealType;
  dealPrice: number;
  /** Legacy alias kept for older saves. */
  price: number;
  closeReadiness: number;
  closeProbability: number;
  blockingReasons: string[];
  supportingReasons: string[];
}

export interface Opportunity {
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
  status: 'active' | 'won' | 'lost' | 'closed';
  lifecycleStatus: 'active' | 'stagnated' | 'lost' | 'closed_by_deal' | 'closed_by_case';
  leadSource: 'direct' | 'broker';
  visibility: 'shadow' | 'revealed';
  brokerName?: string;
  createdDay: number;
  daysLeft: number;
  touchedToday: boolean;
  budgetMax: number;
  priceSensitivity: number;
  stagnationTicks: number;
  history: { day: number; stage: string }[];
}

export interface CompetitivenessSnapshot {
  day: number;
  total: number;
  d1: number;
  d2: number;
  d3: number;
  delta: number;
  breakdown: {
    d1_delta: number;
    d1_drivers: { signal: string; contribution: number; reason: string }[];
    d2_delta: number;
    d3_delta: number;
    d3_drivers: { signal: string; contribution: number; reason: string }[];
  };
}

export interface DailyReport {
  day: number;
  title: string;
  majorEvents: { actor: string; message: string; tone: string }[];
  metricsDelta: { label: string; value: number; unit: string }[];
  marketNews: string[];
  todayPlan: {
    label: string;
    theme: string;
    energy: number;
    focusCases: string[];
    priorities: string[];
  };
  randomEvents: { actor: string; message: string; tone: string }[];
}

export type BudgetTransactionKind =
  | 'initial-allocation'
  | 'weekly-allocation'
  | 'action-spend'
  | 'action-refund'
  | 'sale-rebate'
  | 'legacy-sync';

export interface BudgetTransaction {
  id: string;
  day: number;
  kind: BudgetTransactionKind;
  amount: number;
  balanceAfter: number;
  title: string;
  detail: string;
}

export interface AuxiliaryStats {
  commission: number;
  wordOfMouth: number;
  /** Legacy compatibility mirror. Canonical formal deal fact is GameState.closedDeals / ClosedDealRecord[]. */
  soldCount: number;
  withdrawnCount: number;
}

export interface RuntimeAuxiliaryStats extends AuxiliaryStats {
  promotionBudget: number;
}

export interface EventLogEntry {
  actor: string;
  message: string;
  tone: Tone;
  day: number;
  date: string;
}

export type DomainEventKind =
  | 'journal'
  | 'action_executed'
  | 'budget_changed'
  | 'opportunity_advanced'
  | 'opportunity_closed'
  | 'case_sold'
  | 'case_withdrawn'
  | 'case_lost_to_rival'
  | 'window_extended'
  | 'market_event';

export interface DomainEventEntry {
  id: string;
  day: number;
  date: string;
  kind: DomainEventKind;
  actor: string;
  title: string;
  detail: string;
  tone: Tone;
  caseId?: string;
  opportunityId?: string;
  customerId?: string;
  payload: Record<string, unknown>;
}

export interface WeeklyReview {
  id: string;
  title: string;
  note: string;
  suggestion: string;
}

export interface ScheduleEntry {
  key: string;
  caseId: string;
  title: string;
  badge: string;
  note: string;
  urgency: number;
}

export interface PriorityEntry {
  key: string;
  kind: 'case' | 'opportunity';
  title: string;
  detail: string;
  caseId: string;
}

export type MatterSource = 'schedule' | 'priority';
export type MatterStage = 'pending' | 'in_progress' | 'completed' | 'abandoned';
export type MatterTemplate = 'dialog' | 'form' | 'schedule' | 'realtime';
export type MatterPresentation = 'inline-card' | 'detail-page' | 'full-screen';
export type MatterScene =
  | 'showing'
  | 'open_house'
  | 'valuation'
  | 'listing_prep'
  | 'client_call'
  | 'negotiation'
  | 'report_to_owner'
  | 'closing_prep'
  | 'diagnose'
  | 'co_selling'
  | 'risk_followup';

export interface MatterEntry {
  id: string;
  source: MatterSource;
  sourceKey: string;
  caseId?: string;
  scene: MatterScene;
  title: string;
  detail: string;
  badge?: string;
  stage: MatterStage;
  template: MatterTemplate;
  presentation: MatterPresentation;
  kind?: 'case' | 'opportunity';
  urgency?: number;
  openedAtDay: number;
}

export interface DerivedMetrics {
  activeCaseCount: number;
  activeOpportunityCount: number;
  averageTrust: number;
  averageD1: number;
  averageD3: number;
  topConversion: string;
}

export interface GameState {
  version: number;
  runContext: RunContext;
  day: number;
  maxDay: number;
  currentDate: string;
  maxEnergy: number;
  energy: number;
  /** Legacy compatibility mirror for persisted promotion budget columns. Runtime code should use auxiliaryStats.promotionBudget. */
  cash: number;
  auxiliaryStats: RuntimeAuxiliaryStats;
  /** Legacy compatibility mirror for older saves/storage. Runtime code should use auxiliaryStats.wordOfMouth. */
  reputation?: number;
  /** Legacy compatibility mirror for older saves/storage. Runtime code should use auxiliaryStats.commission. */
  commission?: number;
  /** Legacy compatibility mirror for older saves/storage. Canonical formal deal fact is closedDeals / ClosedDealRecord[]. */
  soldCount?: number;
  /** Legacy compatibility mirror for older saves/storage. Runtime code should use auxiliaryStats.withdrawnCount. */
  withdrawnCount?: number;
  selectedCaseId: string | null;
  gameOver: boolean;
  finalResult: FinalResult | null;
  lastMessage: string;
  rules: GameRules;
  scheduledEvents: ScriptedEvent[];
  competitionGroups: CompetitionGroup[];
  rngState: number;
  rngCalls: number;
  cases: Case[];
  opportunities: Opportunity[];
  budgetLedger: BudgetTransaction[];
  eventLog: EventLogEntry[];
  eventStore: DomainEventEntry[];
  weeklyReviews: WeeklyReview[];
  markets: MarketCell[];
  customers: CustomerProfile[];
  customerStates: CustomerRuntimeState[];
  channels: ChannelProfile[];
  schedule: ScheduleEntry[];
  priorities: PriorityEntry[];
  matters: MatterEntry[];
  closedDeals: ClosedDealRecord[];
  metrics: DerivedMetrics;
  currentReport: DailyReport | null;
  marketShadow: ShadowMarketState;
}
