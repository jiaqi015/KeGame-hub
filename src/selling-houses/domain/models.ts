import type { OwnerProfilingMemorySummary } from './ownerProfilingMemoryTypes.js';
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
  /** 时间占用（小时），用于上午/下午时段容量，不影响精力扣减。 */
  durationHours?: number;
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

export interface OutcomeControlRules {
  /** 标准模拟天数。正式难度默认 21。 */
  simulationDays: number;
  /** 21 天市场总成交容量，代表市场成交池而非玩家成交数。 */
  marketDealCapacity21d: number;
  /** 玩家 21 天基础成交预期，可用小数表达基础成交槽概率。 */
  playerBaseDealExpectation21d: number;
  /** 玩家表现特别好时，可额外争取的成交槽上限。 */
  playerBonusDealCapacity21d: number;
  /** 解锁额外成交槽所需表现分或局中代理分。 */
  playerBonusDealUnlockScore: number;
  /** 玩家自然客源 / 被动来客倍率。 */
  playerLeadSupplyScale: number;
  /** 玩家客户漏斗自然推进倍率。 */
  playerFunnelProgressionScale: number;
  /** 玩家最后成交签约倍率，需同时影响真实概率和展示概率。 */
  playerDealClosingScale: number;
  /** 客户停滞和流失强度。 */
  customerStagnationScale: number;
  /** 对手门店综合能力倍率。 */
  rivalStoreCapabilityScale: number;
  /** 对手从市场成交池争夺成交槽的能力倍率。 */
  rivalDealShareScale: number;
  /** 竞品房源生成倍率。 */
  rivalListingSpawnScale: number;
  /** 竞品对客户注意力的分流倍率。 */
  rivalCustomerPullScale: number;
  /** 竞品对业主 / 房源热度 / 信任的压力倍率。 */
  rivalOwnerPressureScale: number;
  /** 玩家 case 被他处成交 / 被竞对抢走的倍率。 */
  rivalCaseLossScale: number;
  /** 调参目标，仅用于 selfplay 和 debug，不直接参与 runtime。 */
  expectedSelfClosedDeals21d?: number;
  /** 调参目标，仅用于 selfplay 和 debug，不直接参与 runtime。 */
  expectedRivalClosedDeals21d?: number;
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
  outcomeControl: OutcomeControlRules;
}

export type GameRuleOverrides = Omit<Partial<GameRules>, 'outcomeControl'> & {
  outcomeControl?: Partial<OutcomeControlRules>;
  /** Legacy alias kept for older authored scenarios and saves. */
  initialReputation?: number;
  saleBudgetBonusRatio?: number;
  saleBudgetBonusFloor?: number;
};


export interface MarketDealSlotScheduleEntry {
  day: number;
  slots: number;
}

export interface MarketOutcomeState {
  totalCapacity21d: number;
  playerBaseDealSlots: number;
  playerBonusDealSlots: number;
  playerClaimedDeals: number;
  rivalClaimedDeals: number;
  delayedDeals: number;
  releasedSlots: number;
  slotSchedule: MarketDealSlotScheduleEntry[];
}

type DelayedMarketDealConversionObserver = (state: GameState, convertedDeals: number) => void;

let delayedMarketDealConversionObserver: DelayedMarketDealConversionObserver | null = null;

export function setDelayedMarketDealConversionObserver(observer: DelayedMarketDealConversionObserver | null) {
  delayedMarketDealConversionObserver = observer;
}

function stableOutcomeHash(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function deterministicOutcomeFraction(seed: number, salt: string): number {
  return stableOutcomeHash(`${seed}:${salt}`) / 4294967296;
}

function resolvePositiveInteger(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : fallback;
}

export function buildMarketDealSlotSchedule(rules: GameRules, runSeed: number): MarketDealSlotScheduleEntry[] {
  const outcomeControl = rules.outcomeControl;
  const simulationDays = Math.max(1, Math.round(outcomeControl.simulationDays || rules.maxDay || 21));
  const totalCapacity = resolvePositiveInteger(outcomeControl.marketDealCapacity21d, 0);
  if (totalCapacity <= 0) {
    return [];
  }

  const slotsByDay = new Map<number, number>();
  for (let slotIndex = 0; slotIndex < totalCapacity; slotIndex += 1) {
    const evenDay = totalCapacity === 1
      ? 1
      : 1 + Math.round((slotIndex * (simulationDays - 1)) / Math.max(1, totalCapacity - 1));
    const jitterWindow = totalCapacity <= 2 ? 0 : Math.max(1, Math.floor(simulationDays / (totalCapacity * 2)));
    const jitterRoll = deterministicOutcomeFraction(runSeed, `market-slot-${slotIndex}`);
    const jitter = jitterWindow === 0 ? 0 : Math.round(jitterRoll * jitterWindow * 2) - jitterWindow;
    const day = slotIndex === 0
      ? 1
      : Math.max(1, Math.min(simulationDays, evenDay + jitter));
    slotsByDay.set(day, (slotsByDay.get(day) || 0) + 1);
  }

  return [...slotsByDay.entries()]
    .sort(([leftDay], [rightDay]) => leftDay - rightDay)
    .map(([day, slots]) => ({ day, slots }));
}

export function resolvePlayerBaseDealSlots(rules: GameRules, runSeed: number): number {
  const expectation = Math.max(0, Number(rules.outcomeControl.playerBaseDealExpectation21d) || 0);
  const guaranteed = Math.floor(expectation);
  const fractional = expectation - guaranteed;
  return guaranteed + (fractional > 0 && deterministicOutcomeFraction(runSeed, 'player-base-deal-slot') < fractional ? 1 : 0);
}

export function buildInitialMarketOutcomeState(
  rules: GameRules,
  runSeed: number,
  currentDay: number = 1,
  claimedDeals: Partial<Pick<MarketOutcomeState, 'playerClaimedDeals' | 'rivalClaimedDeals' | 'delayedDeals'>> = {},
): MarketOutcomeState {
  const slotSchedule = buildMarketDealSlotSchedule(rules, runSeed);
  const playerClaimedDeals = Math.max(0, Math.round(claimedDeals.playerClaimedDeals || 0));
  const rivalClaimedDeals = Math.max(0, Math.round(claimedDeals.rivalClaimedDeals || 0));
  const delayedDeals = Math.max(0, Math.round(claimedDeals.delayedDeals || 0));
  const releasedBeforeCurrentDay = slotSchedule
    .filter((entry) => entry.day < currentDay)
    .reduce((sum, entry) => sum + entry.slots, 0);

  return {
    totalCapacity21d: slotSchedule.reduce((sum, entry) => sum + entry.slots, 0),
    playerBaseDealSlots: resolvePlayerBaseDealSlots(rules, runSeed),
    playerBonusDealSlots: Math.max(0, Math.round(rules.outcomeControl.playerBonusDealCapacity21d || 0)),
    playerClaimedDeals,
    rivalClaimedDeals,
    delayedDeals,
    releasedSlots: Math.max(releasedBeforeCurrentDay, Math.min(
      slotSchedule.reduce((sum, entry) => sum + entry.slots, 0),
      playerClaimedDeals + rivalClaimedDeals + delayedDeals,
    )),
    slotSchedule,
  };
}

function normalizeSlotSchedule(input: unknown, fallback: MarketDealSlotScheduleEntry[]): MarketDealSlotScheduleEntry[] {
  if (!Array.isArray(input)) {
    return fallback;
  }

  const slotsByDay = new Map<number, number>();
  input.forEach((entry) => {
    if (!entry || typeof entry !== 'object') return;
    const payload = entry as { day?: unknown; slots?: unknown };
    const day = Math.max(1, Math.round(Number(payload.day) || 1));
    const slots = Math.max(0, Math.round(Number(payload.slots) || 0));
    if (slots > 0) {
      slotsByDay.set(day, (slotsByDay.get(day) || 0) + slots);
    }
  });

  const normalized = [...slotsByDay.entries()]
    .sort(([leftDay], [rightDay]) => leftDay - rightDay)
    .map(([day, slots]) => ({ day, slots }));
  return normalized.length > 0 ? normalized : fallback;
}

export function normalizeMarketOutcomeState(
  input: unknown,
  rules: GameRules,
  runSeed: number,
  currentDay: number,
  claimedDeals: Partial<Pick<MarketOutcomeState, 'playerClaimedDeals' | 'rivalClaimedDeals' | 'delayedDeals'>> = {},
): MarketOutcomeState {
  const fallback = buildInitialMarketOutcomeState(rules, runSeed, currentDay, claimedDeals);
  if (!input || typeof input !== 'object') {
    return fallback;
  }

  const payload = input as Partial<Record<keyof MarketOutcomeState, unknown>>;
  const slotSchedule = normalizeSlotSchedule(payload.slotSchedule, fallback.slotSchedule);
  const totalCapacity21d = Math.max(
    slotSchedule.reduce((sum, entry) => sum + entry.slots, 0),
    resolvePositiveInteger(Number(payload.totalCapacity21d), fallback.totalCapacity21d),
  );
  const playerClaimedDeals = Math.max(0, Math.round(Number(payload.playerClaimedDeals) || claimedDeals.playerClaimedDeals || 0));
  const rivalClaimedDeals = Math.max(0, Math.round(Number(payload.rivalClaimedDeals) || claimedDeals.rivalClaimedDeals || 0));
  const delayedDeals = Math.max(0, Math.round(Number(payload.delayedDeals) || claimedDeals.delayedDeals || 0));
  const releasedFloor = Math.min(
    totalCapacity21d,
    slotSchedule.filter((entry) => entry.day < currentDay).reduce((sum, entry) => sum + entry.slots, 0),
  );

  return {
    totalCapacity21d,
    playerBaseDealSlots: Math.max(0, Math.round(Number(payload.playerBaseDealSlots) || fallback.playerBaseDealSlots)),
    playerBonusDealSlots: Math.max(0, Math.round(Number(payload.playerBonusDealSlots) || fallback.playerBonusDealSlots)),
    playerClaimedDeals,
    rivalClaimedDeals,
    delayedDeals,
    releasedSlots: Math.max(
      releasedFloor,
      Math.min(totalCapacity21d, Math.round(Number(payload.releasedSlots) || fallback.releasedSlots)),
      Math.min(totalCapacity21d, playerClaimedDeals + rivalClaimedDeals + delayedDeals),
    ),
    slotSchedule,
  };
}

export function ensureMarketOutcomeState(state: GameState): MarketOutcomeState {
  if (!state.marketOutcome) {
    state.marketOutcome = buildInitialMarketOutcomeState(state.rules, state.runContext.runSeed, state.day, {
      playerClaimedDeals: state.closedDeals.filter((entry) => entry.dealType === 'self_closed').length,
    });
  }
  return state.marketOutcome;
}

export function releaseMarketDealSlotsForDay(state: GameState, day: number): number {
  const marketOutcome = ensureMarketOutcomeState(state);
  const slots = marketOutcome.slotSchedule
    .filter((entry) => entry.day === day)
    .reduce((sum, entry) => sum + entry.slots, 0);
  if (slots <= 0) {
    return 0;
  }
  const before = marketOutcome.releasedSlots;
  marketOutcome.releasedSlots = Math.min(marketOutcome.totalCapacity21d, marketOutcome.releasedSlots + slots);
  convertDelayedMarketDealsToRivalClaims(state);
  return marketOutcome.releasedSlots - before;
}

export function getAvailableMarketDealSlots(state: GameState): number {
  const marketOutcome = ensureMarketOutcomeState(state);
  return Math.max(0, marketOutcome.releasedSlots - marketOutcome.playerClaimedDeals - marketOutcome.rivalClaimedDeals - marketOutcome.delayedDeals);
}

export function convertDelayedMarketDealsToRivalClaims(state: GameState): number {
  const marketOutcome = ensureMarketOutcomeState(state);
  const releasedCapacity = Math.max(
    0,
    marketOutcome.releasedSlots - marketOutcome.playerClaimedDeals - marketOutcome.rivalClaimedDeals,
  );
  const convertibleDeals = Math.min(marketOutcome.delayedDeals, releasedCapacity);
  if (convertibleDeals <= 0) {
    return 0;
  }
  marketOutcome.delayedDeals -= convertibleDeals;
  marketOutcome.rivalClaimedDeals += convertibleDeals;
  delayedMarketDealConversionObserver?.(state, convertibleDeals);
  return convertibleDeals;
}

export function estimatePlayerDealBonusUnlocked(state: GameState): number {
  const marketOutcome = ensureMarketOutcomeState(state);
  if (marketOutcome.playerBonusDealSlots <= 0) {
    return 0;
  }

  const selfClosedDeals = state.closedDeals.filter((entry) => entry.dealType === 'self_closed').length;
  if (selfClosedDeals <= 0) {
    return 0;
  }

  const activeCases = state.cases.filter((entry) => entry.status === 'active');
  const averageCaseStrength = activeCases.length === 0
    ? 0
    : activeCases.reduce((sum, entry) => sum + (entry.competitiveness * 0.36 + entry.trust * 0.32 + entry.d3 * 0.32), 0) / activeCases.length;
  const bestOpportunityStrength = state.opportunities
    .filter((entry) => entry.status === 'active')
    .reduce((best, entry) => Math.max(best, entry.stageIndex * 12 + entry.intent * 0.34 + entry.confidence * 0.24), 0);
  const closedDealMomentum = Math.min(24, selfClosedDeals * 14);
  const performanceScore = Math.min(
    100,
    Math.round(averageCaseStrength * 0.45 + bestOpportunityStrength * 0.35 + closedDealMomentum),
  );

  return performanceScore >= state.rules.outcomeControl.playerBonusDealUnlockScore
    ? marketOutcome.playerBonusDealSlots
    : 0;
}

export function getPlayerAllowedMarketDeals(state: GameState): number {
  const marketOutcome = ensureMarketOutcomeState(state);
  return marketOutcome.playerBaseDealSlots + estimatePlayerDealBonusUnlocked(state);
}

export function canPlayerClaimMarketDealSlot(state: GameState): boolean {
  const marketOutcome = ensureMarketOutcomeState(state);
  return getAvailableMarketDealSlots(state) > 0 && marketOutcome.playerClaimedDeals < getPlayerAllowedMarketDeals(state);
}

export function claimPlayerMarketDealSlot(state: GameState): boolean {
  if (!canPlayerClaimMarketDealSlot(state)) {
    return false;
  }
  ensureMarketOutcomeState(state).playerClaimedDeals += 1;
  return true;
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
  /**
   * Read-only opening snapshot of the full market world.
   * The world existed before the player entered; the player is a local POV.
   * Optional for backward compatibility with older saves.
   * Created by domain/world-model/seededMarketWorld.ts.
   */
  marketOpeningSnapshot?: import('./world-model/marketWorldTypes.js').MarketOpeningSnapshot;
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
  ownerProfilingMemory?: OwnerProfilingMemorySummary;
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

/** Category of blocking reason — used for structured consensus collapse reporting. */
export type BlockingReasonCategory =
  | 'price_budget'       // soldPrice > opportunity.budgetMax
  | 'relation_trust'     // trust < trustGate
  | 'market_capacity'    // no available deal slots
  | 'player_capacity'    // player claimed deals >= allowed
  | 'consensus_stage'    // consensus not at contract_ready
  | 'evidence_weak';     // opportunity intent/confidence too low to reach threshold

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
  /** Structured source trace — records where each input came from. */
  sourceTrace: EvaluationSourceTrace;
  /** Structured blocking reason categories — for consensus collapse reporting. */
  blockingCategories: BlockingReasonCategory[];
  /** Evidence chain trace — traces how competition/market/relation flow into the evaluation. */
  evidenceChain: EvidenceChainTrace;
}

/**
 * Evidence chain trace — shows how upstream signals flow into the deal closing evaluation.
 *
 * Mother model: competition pressure → market evidence → owner perception → consensus readiness → ContractFact.
 * This trace records each link in the chain so failures can be attributed to a specific causal link.
 */
export interface EvidenceChainTrace {
  /** Competition pressure level from market cell (0-100). 0 if no competition data. */
  readonly competitionPressure: number;
  /** Whether competition data was available for this case. */
  readonly hasCompetitionData: boolean;
  /** Case heat (competition-derived signal). */
  readonly caseHeat: number;
  /** Case competitiveness score. */
  readonly caseCompetitiveness: number;
  /** Opportunity intent (customer evidence). */
  readonly opportunityIntent: number;
  /** Opportunity confidence (customer evidence). */
  readonly opportunityConfidence: number;
  /** Relation trust value used in evaluation. */
  readonly relationTrust: number;
  /** Whether relation trust came from canonical relation or Case fallback. */
  readonly trustFromRelation: boolean;
  /** Owner urgency from readiness projection. */
  readonly ownerUrgency: number;
  /** Consensus stage at evaluation time. */
  readonly consensusStage: string;
  /** Which causal link was weakest (for failure attribution). */
  readonly weakestLink: 'competition_pressure' | 'case_heat' | 'opportunity_evidence' | 'relation_trust' | 'price_fit' | 'capacity' | 'none';
}

/** Provenance of inputs used in deal closing evaluation. */
export interface EvaluationSourceTrace {
  /** Where trust value came from: 'relation' or 'case-fallback'. */
  trustSource: string;
  /** Where readiness (patience/urgency) came from: 'relation' or 'case-fallback'. */
  readinessSource: string;
  /** Where owner profile came from: 'profiling' or 'legacy-personality-fallback'. */
  profileSource: string;
}

export interface ClosedDealMarketSnapshot {
  askPrice: number;
  marketPrice: number;
  bottomPrice: number;
  competitiveness: number;
  trust: number;
  d1: number;
  d2: number;
  d3: number;
}

export interface ClosedDealPriceSnapshot {
  soldPrice: number;
  askPrice: number;
  marketPrice: number;
  bottomPrice: number;
  discountToAskPct: number;
  premiumToMarketPct: number;
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
  caseTitle?: string;
  customerName?: string;
  ownerName?: string;
  maintainerName?: string;
  marketSnapshot?: ClosedDealMarketSnapshot;
  priceSnapshot?: ClosedDealPriceSnapshot;
  /** Canonical consensus formation id (bridge to runtimeConsensusFormations). */
  consensusId?: string;
  /** Canonical contract fact id (bridge to runtimeContractFacts). */
  contractId?: string;
  /** Canonical opportunity closure set id (bridge to runtimeOpportunityClosureSets). */
  closureSetId?: string;
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
  pendingClosingEvaluation?: boolean;
  pendingClosingStrategyId?: string;
  pendingClosingRequestedDay?: number;
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
  majorEvents: { actor: string; message: string; tone: Tone }[];
  metricsDelta: { label: string; value: number; unit: string; displayMode?: 'delta' | 'absolute' }[];
  marketNews: string[];
  todayPlan: {
    label: string;
    theme: string;
    energy: number;
    focusCases: string[];
    priorities: string[];
  };
  randomEvents: { actor: string; message: string; tone: Tone }[];
  narrativeLog?: DailyNarrative;
}

export interface Expectation {
  id: string;
  targetEntityId: string;
  expectedAction: string;
  createdAtDay: number;
  weight: number;
  sourceMatterId?: string;
}

export interface ForeshadowingHook {
  id: string;
  hookType: string;
  sourceEventId: string;
  buryDay: number;
  conditionToTrigger: string;
  expirationDay: number;
  relatedEntityId?: string;
  description: string;
}

export interface TopicHistoryPointer {
  ownerId: string;
  topic: string;
  lastEmotionalVolatility: number;
  lastTone: string;
  day: number;
}

export interface DailyNarrative {
  day: number;
  openingHook?: string;
  midTwist?: string;
  lateUndercurrent?: string;
  tomorrowHook?: string;
  text: string;
  eventsUsed: string[];
  newHooks: string[];
}

export interface DailyProcessResultSummary {
  managerId: 'negotiation-process-manager' | 'product-run-process-manager';
  owner: 'runtime-process-manager' | 'runtime-process-manager-facade';
  outcomeOwner?: 'legacy-deal-closing-engine';
  day: number;
  phase: 'settled-day' | 'next-day-setup';
  processedCount: number;
  resolvedCount: number;
  emittedEventIds: string[];
  closedDealIds: string[];
  opportunityIds: string[];
  productRunIds: string[];
}

export interface DailyTickResult {
  day: number;
  nextDay: number;
  report: DailyReport | null;
  emittedEvents: DomainEventEntry[];
  closedDeals: ClosedDealRecord[];
  /**
   * Compatibility mirror containing both settled-day and next-day setup process rows.
   * New consumers should prefer settledDayProcessResults / nextDaySetupProcessResults.
   */
  processResults: DailyProcessResultSummary[];
  settledDayProcessResults: DailyProcessResultSummary[];
  nextDaySetupProcessResults: DailyProcessResultSummary[];
  dirtyScopes: DirtyScopeSet;
  invariantAlerts: TickInvariantAlert[];
  /** Read-only pressure receipts for this tick. Undefined when no buffer was used. */
  pressureReceipts?: import('../core/world-state/competition/models.js').PressureReceiptBundle;
  /** Read-only semantic receipt summaries for this tick. Optional for backward compatibility. */
  semanticReceipts?: import('../core/world-state/semantic-receipt/models.js').DailySemanticReceiptBundle;
}

export interface DirtyScopeSet {
  cases: string[];
  opportunities: string[];
  customers: string[];
  owners: string[];
  districts: string[];
  marketCells: string[];
  matters: string[];
  market: boolean;
  dashboard: boolean;
  result: boolean;
}

export interface TickInvariantAlert {
  level: 'warning' | 'error';
  code: string;
  message: string;
  caseId?: string;
  opportunityId?: string;
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
  | 'market_event'
  | 'decision_moment_triggered'
  | 'business_flow_step_advanced';

export interface FlowProgressState {
  flowId: string;
  activatedDay: number;
  completedStepIds: string[];
  currentStepId: string | null;
}

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
  slot?: TodayArrangementSlot;
  source?: 'routine' | 'interrupt' | 'risk' | 'run';
  weekdayIntent?: string;
  actionId?: string;
  opportunityId?: string;
}

export interface PriorityEntry {
  key: string;
  kind: 'case' | 'opportunity';
  title: string;
  detail: string;
  caseId: string;
}

export type MatterSource = 'schedule' | 'priority' | 'negotiation';
export type MatterStage = 'pending' | 'in_progress' | 'completed' | 'abandoned';
export type MatterLifecycleCategory = 'report' | 'diagnose' | 'execute' | 'negotiate';
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
  lifecycleCategory: MatterLifecycleCategory;
  title: string;
  detail: string;
  badge?: string;
  stage: MatterStage;
  template: MatterTemplate;
  presentation: MatterPresentation;
  kind?: 'case' | 'opportunity';
  urgency?: number;
  openedAtDay: number;
  updatedAtDay?: number;
  resolvedAtDay?: number;
  resolutionSummary?: string;
}

export type TodayArrangementStatus = 'planned' | 'completed';
export type TodayArrangementExecutionMode = 'direct' | 'scenario';
export type TodayArrangementSlot = 'am' | 'pm';

export type ProductType = 'open-day' | 'sincere-sale';
export type ProductRunScope = 'community' | 'listing';
export type ProductRunStatus = 'running' | 'completed' | 'cancelled';
export type ProductRunMilestoneKind = 'event' | 'light_scene' | 'heavy_scene';

export interface ProductRunMilestone {
  id: string;
  title: string;
  summary: string;
  day: number;
  kind: ProductRunMilestoneKind;
  settlementHint: string;
}

export interface ProductRun {
  id: string;
  productType: ProductType;
  scope: ProductRunScope;
  status: ProductRunStatus;
  startDay: number;
  endDay?: number;
  targetIds: string[];
  nextMilestone: string;
  linkedEventIds?: string[];
  milestones?: ProductRunMilestone[];
}

export interface TodayArrangementItem {
  id: string;
  day: number;
  sourceMatterId?: string;
  linkedActionId: string;
  linkedCaseId?: string;
  linkedCustomerId?: string;
  linkedOpportunityId?: string;
  executionMode: TodayArrangementExecutionMode;
  status: TodayArrangementStatus;
  slot?: TodayArrangementSlot;
}

export type TodayPlanConflictKind = 'fixed-overlap' | 'planned-tight' | 'running-related';

export interface TodayPlanConflictHint {
  level: 'info' | 'warning';
  kind: TodayPlanConflictKind;
  message: string;
  relatedItemIds?: string[];
}

export interface TodayPlanState {
  day: number;
  playerItems: TodayArrangementItem[];
}

export interface FocusMeetingState {
  submissionDay: number | null;
  submittedCaseIds: string[];
  selectedCaseIds: string[];
  comparisonCaseIds?: string[];
  recommendationMode?: string | null;
  selectedCaseId?: string | null;
  externalRivalListingIds?: string[];
  comparingCustomerIds?: string[];
}

export interface DerivedMetrics {
  activeCaseCount: number;
  activeOpportunityCount: number;
  averageTrust: number;
  averageD1: number;
  averageD3: number;
  topConversion: string;
}

// ---------------------------------------------------------------------------
// ActionReceipt / CommitmentSettlement — compressed audit trail
// ---------------------------------------------------------------------------

export type ActionReceiptOutcome =
  | 'success'           // action executed and produced visible effect
  | 'blocked'           // action attempted but blocked (e.g., no opportunity)
  | 'no_effect'         // action executed but no visible change
  | 'failed'            // action execution failed (e.g., transaction rollback)
  | 'partial';          // action partially succeeded

export type CommitmentSettlementTrigger =
  | 'created'           // commitment established
  | 'advanced'          // commitment progressed (stage forward)
  | 'expired'           // commitment expired (daysLeft reached 0)
  | 'revoked'           // commitment revoked by actor
  | 'signed'            // commitment became ContractFact
  | 'collapsed'         // commitment collapsed (consensus failed)
  | 'merged';           // commitment merged into another

export interface ActionReceiptFieldDelta {
  readonly field: string;
  readonly from: number | string | boolean;
  readonly to: number | string | boolean;
  readonly delta?: number;
}

export interface ActionReceipt {
  /** Deterministic ID: receipt-${caseId}-${actionId}-${day} */
  readonly receiptId: string;
  /** Day of execution */
  readonly day: number;
  /** Action definition ID */
  readonly actionId: string;
  /** Executor ID (may differ from actionId for aliases) */
  readonly executorId: string;
  /** Case this action targeted */
  readonly caseId: string;
  /** Option chosen by player (null if no option) */
  readonly optionId: string | null;
  /** Outcome of the action */
  readonly outcome: ActionReceiptOutcome;
  /** Energy cost actually spent */
  readonly costEnergy: number;
  /** Promotion budget cost actually spent */
  readonly costPromotionBudget: number;
  /** Key field deltas produced by this action */
  readonly fieldDeltas: readonly ActionReceiptFieldDelta[];
  /** Business-level outcome description (compressed) */
  readonly outcomeSummary: string;
  /** IDs of domain events emitted by this action */
  readonly emittedEventIds: readonly string[];
  /** IDs of opportunities affected by this action */
  readonly affectedOpportunityIds: readonly string[];
  /** ID of linked opportunity (if action is opportunity-bound) */
  readonly linkedOpportunityId?: string;
}

export interface CommitmentSettlement {
  /** Deterministic ID: settlement-${caseId}-${kind}-${day} */
  readonly settlementId: string;
  /** Day of settlement */
  readonly day: number;
  /** Case this settlement relates to */
  readonly caseId: string;
  /** Commitment type */
  readonly commitmentKind: string;
  /** Commitment scope */
  readonly commitmentScope: string;
  /** What happened */
  readonly trigger: CommitmentSettlementTrigger;
  /** Entity that owns the commitment (owner/customer/broker) */
  readonly ownerEntity: string;
  /** Strength before (0-100) */
  readonly strengthBefore: number;
  /** Strength after (0-100) */
  readonly strengthAfter: number;
  /** Business reason (compressed) */
  readonly reason: string;
  /** IDs of related domain events */
  readonly relatedEventIds: readonly string[];
  /** IDs of related action receipts */
  readonly relatedReceiptIds: readonly string[];
}

// ---------------------------------------------------------------------------
// OwnerDecisionMoment — structural observation of owner decision nodes
// ---------------------------------------------------------------------------

export type OwnerDecisionMomentKind =
  | 'trust_threshold'
  | 'patience_exhausted'
  | 'urgency_spike'
  | 'price_anchor_shift'
  | 'commitment_formed'
  | 'commitment_revoked'
  | 'consensus_advance'
  | 'consensus_collapse'
  | 'pressure_response'
  | 'window_closing';

export type OwnerDecisionMomentSignificance =
  | 'critical'
  | 'important'
  | 'informational';

export interface OwnerDecisionMomentFactor {
  readonly factorKind: string;
  readonly label: string;
  readonly value: number;
  readonly threshold: number;
  readonly direction: 'above' | 'below';
  readonly weight: number;
}

export interface OwnerDecisionMoment {
  readonly momentId: string;
  readonly day: number;
  readonly caseId: string;
  readonly kind: OwnerDecisionMomentKind;
  readonly significance: OwnerDecisionMomentSignificance;
  readonly description: string;
  readonly factors: readonly OwnerDecisionMomentFactor[];
  readonly relatedReceiptIds: readonly string[];
  readonly relatedSettlementIds: readonly string[];
  readonly relatedRunIds: readonly string[];
  readonly ownerEntity: string;
  readonly recommendedResponse: string;
}

// ---------------------------------------------------------------------------
// StrategyForkSummary — read-only fork branch summary
// ---------------------------------------------------------------------------

export interface StrategyForkBranch {
  readonly branchId: string;
  readonly strategyLabel: string;
  readonly caseId: string;
  readonly policySummary: string;
  readonly snapshotDay: number;
  readonly actionsProposed: readonly string[];
  readonly outcomeForecast: string;
  readonly confidence: number; // 0..1
  readonly evidenceRefs: readonly string[];
}

export interface StrategyForkSummary {
  readonly forkId: string;
  readonly day: number;
  readonly baseSeed: number;
  readonly caseId: string;
  readonly branches: readonly StrategyForkBranch[];
  readonly recommendedBranchId: string | null;
  readonly recommendationRationale: string;
}

// ---------------------------------------------------------------------------
// ManagerInterventionReceipt — manager intervention ActionReceipt
// ---------------------------------------------------------------------------

export interface ManagerInterventionReceipt {
  readonly receiptId: string;
  readonly day: number;
  readonly caseId: string;
  readonly interventionKind: 'focus_meeting_selection' | 'manager_draft' | 'escalation';
  readonly focusMeetingSubmittedCaseIds: readonly string[];
  readonly focusMeetingSelectedCaseIds: readonly string[];
  readonly drafts: readonly {
    readonly draftId: string;
    readonly actionSpecId: string;
    readonly reason: string;
  }[];
  readonly evidenceRefs: readonly string[];
  readonly recommendedActionId: string | null;
  readonly recommendationReason: string;
}

// ---------------------------------------------------------------------------
// NegotiationReplaySummary — replay from consensus/contract/receipts
// ---------------------------------------------------------------------------

export interface NegotiationReplayPhase {
  readonly phaseId: string;
  readonly label: string;
  readonly enteredDay: number;
  readonly exitedDay: number | null;
  readonly triggerReceiptId: string | null;
  readonly triggerSettlementId: string | null;
  readonly description: string;
}

export interface NegotiationReplayTurnPoint {
  readonly turnPointId: string;
  readonly day: number;
  readonly description: string;
  readonly relatedReceiptId: string | null;
  readonly relatedSettlementId: string | null;
  readonly impact: 'positive' | 'negative' | 'neutral';
}

export interface NegotiationReplaySummary {
  readonly replayId: string;
  readonly caseId: string;
  readonly customerId: string;
  readonly templateKind: string;
  readonly startedDay: number;
  readonly endedDay: number | null;
  readonly finalStatus: string;
  readonly phases: readonly NegotiationReplayPhase[];
  readonly turnPoints: readonly NegotiationReplayTurnPoint[];
  readonly evidenceChain: readonly {
    readonly refType: string;
    readonly refId: string;
    readonly day: number;
    readonly summary: string;
  }[];
  readonly contractFactId: string | null;
}

// ---------------------------------------------------------------------------
// BusinessOutcomeReview — structured review from ended ProcessRun
// ---------------------------------------------------------------------------

export interface BusinessOutcomeReview {
  readonly reviewId: string;
  readonly caseId: string;
  readonly templateKind: string;
  readonly startedDay: number;
  readonly endedDay: number;
  readonly finalStatus: string;
  readonly outcomeDescription: string;
  readonly successFactors: readonly string[];
  readonly failureFactors: readonly string[];
  readonly keyLearnings: readonly string[];
  readonly relatedReceiptIds: readonly string[];
  readonly relatedSettlementIds: readonly string[];
  readonly relatedRunIds: readonly string[];
  readonly contractFactId: string | null;
  readonly recommendedNextActions: readonly {
    readonly actionId: string;
    readonly reason: string;
    readonly priority: 'urgent' | 'high' | 'medium' | 'low';
  }[];
}

export type GameSaveSource = 'local' | 'cloud' | 'manual' | 'system';

export interface GameState {
  version: number;
  runId: string;
  localRevision: number;
  clientUpdatedAt: string;
  lastSavedAt?: string;
  lastHydratedAt?: string;
  saveSource: GameSaveSource;
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
  todayPlan: TodayPlanState;
  focusMeeting: FocusMeetingState;
  flowProgress?: Record<string, FlowProgressState>;
  productRuns: ProductRun[];
  closedDeals: ClosedDealRecord[];
  marketOutcome?: MarketOutcomeState;
  metrics: DerivedMetrics;
  currentReport: DailyReport | null;
  lastDailyTickResult?: DailyTickResult | null;
  /** Optional runtime BrokerOwnerRelation trust states. Canonical trust write source. */
  runtimeBrokerOwnerRelations?: import('../core/world-state/trustWriteSource.js').BrokerOwnerRelationTrustState[];
  /** Optional runtime OwnerCaseRelation readiness states. Canonical patience/urgency write source. */
  runtimeOwnerCaseReadinessStates?: import('../core/world-state/ownerCaseReadinessWriteSource.js').OwnerCaseReadinessState[];
  /** Optional runtime CustomerCaseMatch states. Canonical match write source. */
  runtimeCustomerCaseMatches?: import('../core/world-state/opportunity-relations/writeSource.js').CustomerCaseMatchState[];
  /** Optional runtime BrokeredOpportunity states. Canonical opportunity write source. */
  runtimeBrokeredOpportunities?: import('../core/world-state/opportunity-relations/writeSource.js').BrokeredOpportunityState[];
  /** Optional runtime ConsensusFormation states. Canonical consensus write source. */
  runtimeConsensusFormations?: import('../core/world-state/consensus/writeSource.js').ConsensusFormationState[];
  /** Optional runtime ContractFact states. Canonical contract write source. */
  runtimeContractFacts?: import('../core/world-state/consensus/writeSource.js').ContractFactState[];
  /** Optional runtime OpportunityClosureSet states. Canonical closure write source. */
  runtimeOpportunityClosureSets?: import('../core/world-state/consensus/writeSource.js').OpportunityClosureSetState[];
  /**
   * Optional daily operating ledger — one entry per settled day.
   * Lightweight per-day operating summaries for historical replay and review.
   * Does NOT contain raw GameState/Case/Opportunity — only compressed summaries.
   * Old saves without this field work normally (empty array fallback).
   */
  operatingLedgerDays?: import('../core/world-state/semantic-receipt/dailyOperatingLedger.js').DailyOperatingLedgerDaySummary[];
  /**
   * Optional action receipt history — compressed audit trail of action executions.
   * Each receipt records what action was chosen, what happened, and key field deltas.
   * Does NOT contain raw GameState/Case/Opportunity — only compressed summaries.
   * Old saves without this field work normally (empty array fallback).
   */
  actionReceiptHistory?: ActionReceipt[];
  /**
   * Optional commitment settlement history — compressed audit trail of commitment changes.
   * Each settlement records a commitment state transition (created/advanced/expired/revoked/signed).
   * Does NOT contain raw GameState/Case/Opportunity — only compressed summaries.
   * Old saves without this field work normally (empty array fallback).
   */
  commitmentSettlementHistory?: CommitmentSettlement[];
  /**
   * Optional process run history — aggregated multi-day business process instances.
   * Derived from actionReceiptHistory and commitmentSettlementHistory.
   * Does NOT contain raw GameState/Case/Opportunity — only compressed summaries.
   * Old saves without this field work normally (empty array fallback).
   */
  processRunHistory?: import('../core/world-state/processes/models.js').ProcessRun[];
  /**
   * Optional owner decision moment history — structural observations of owner decision nodes.
   * Derived from readiness, trust, pressure, commitment, and price signals.
   * Does NOT contain raw GameState/Case/Opportunity — only compressed summaries.
   * Old saves without this field work normally (empty array fallback).
   */
  ownerDecisionMomentHistory?: OwnerDecisionMoment[];
  /**
   * Optional strategy fork history — read-only fork branch summaries.
   * Derived from structuredClone + seed. Does NOT alter main world.
   * Old saves without this field work normally (empty array fallback).
   */
  strategyForkHistory?: StrategyForkSummary[];
  /**
   * Optional manager intervention receipt history.
   * Generated when focus meeting selects cases or manager drafts appear.
   * Does NOT contain raw GameState/Case/Opportunity — only compressed summaries.
   * Old saves without this field work normally (empty array fallback).
   */
  managerInterventionReceiptHistory?: ManagerInterventionReceipt[];
  /**
   * Optional negotiation replay history — replay summaries from consensus/contract/receipts.
   * Derived from processRunHistory, consensusFormations, contractFacts, actionReceipts.
   * Does NOT re-roll dice. Old saves without this field work normally (empty array fallback).
   */
  negotiationReplayHistory?: NegotiationReplaySummary[];
  /**
   * Optional business outcome review history — structured reviews from ended ProcessRuns.
   * Derived from processRunHistory with success/failure factors.
   * Does NOT create ContractFact. Old saves without this field work normally (empty array fallback).
   */
  businessOutcomeReviewHistory?: BusinessOutcomeReview[];
  marketShadow: ShadowMarketState;
  expectationStore?: Expectation[];
  foreshadowingStore?: ForeshadowingHook[];
  topicHistory?: TopicHistoryPointer[];
}
