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
  | 'reputation'
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
  saleBudgetBonusRatio: number;
  saleBudgetBonusFloor: number;
  initialReputation: number;
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
  ownerUntouchedTrustLoss: number;
  urgentOwnerUntouchedTrustLoss: number;
  ownerPatienceDecayAfterDays: number;
  ownerPatienceDecayAmount: number;
  scriptedEventImpactScale: number;
}

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

export interface WeightedRandomEventRef {
  templateId: string;
  weight: number;
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
  goalContext?: GoalContextId;
  targetScore?: number;
  scoreThresholds?: ScoreThresholds;
  boardPressureProfile?: BoardPressureProfile;
  rules?: Partial<GameRules>;
  published: boolean;
}

export interface ScenarioSummary {
  id: string;
  difficultyId: DifficultyId;
  name: string;
  theme: string;
  description: string;
  caseCount: number;
  maxDay: number;
}

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
  status: 'active' | 'sold' | 'withdrawn';
  stageIndex: number;
  stageLabel: string;
  riskFlags: string[];
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
  goalTier: GoalTier;
  storylineState: StorylineState;
  relativeOutcome?: ListingRelativeOutcome;
  ownerSatisfaction?: OwnerSatisfactionState;
  defenseOutcome?: DefenseOutcome;
  endingType?: ListingEndingType;
  endingSummary?: string;
  isFocused?: boolean;
  personality: 'pragmatic' | 'emotional' | 'urgent';
}

export interface ScoreDimensionResult {
  label: string;
  score: number;
  maxScore: number;
  summary: string;
}

export interface CaseFinalResult {
  caseId: string;
  title: string;
  ownerName: string;
  community: string;
  status: Case['status'];
  goalTier: GoalTier;
  endingType: ListingEndingType;
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
  scoreBreakdown: Array<{ label: string; value: number; maxValue?: number; summary?: string }>;
  highlights: string[];
  improvements: string[];
  promotionNotes: string[];
  coachNotes: string[];
  nextRunAdvice: string[];
  caseResults: CaseFinalResult[];
  stats: Array<{ label: string; value: string }>;
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

export interface GameState {
  version: number;
  runContext: RunContext;
  day: number;
  maxDay: number;
  currentDate: string;
  maxEnergy: number;
  energy: number;
  cash: number;
  reputation: number;
  commission: number;
  soldCount: number;
  withdrawnCount: number;
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
  eventLog: any[];
  weeklyReviews: any[];
  markets: MarketCell[];
  customers: CustomerProfile[];
  channels: ChannelProfile[];
  schedule: any[];
  priorities: any[];
  metrics: any;
  currentReport: DailyReport | null;
}
