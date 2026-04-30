import {
  STORAGE_KEY,
} from '../domain/constants.js';
import { buildScopedStorageKey } from './storageScope.js';
import {
  clamp,
  normalizeSeed,
  randomInt,
  type RandomSource,
} from '../domain/utils.js';
import { instantiateScenarioCases } from '../domain/generator.js';
import {
  buildInitialMarketOutcomeState,
  normalizeMarketOutcomeState,
  type Case,
  type CompetitionGroup,
  type CustomerProfile,
  type ClosedDealRecord,
  type ProductRun,
  type ProductRunMilestoneKind,
  type GameState,
  type GameRuleOverrides,
  type ScenarioSnapshot,
  type ShadowMarketState,
  type RivalStore,
  type RivalListing,
  type CompanyPressureState,
  type TodayArrangementExecutionMode,
  type TodayArrangementItem,
  type TodayArrangementSlot,
  type TodayPlanState,
  type FocusMeetingState,
  type FlowProgressState,
  type DailyTickResult,
  type DailyProcessResultSummary,
} from '../domain/models.js';
import { normalizeDailyProcessResultReadModel } from '../runtime/simulation/dailyProcessResult.js';
import { createInitialBudgetLedger, normalizeBudgetLedger } from '../domain/budget.js';
import { getBuiltInWorld, resolveScenarioRules } from '../domain/scenarioCatalog.js';
import { mergeRules } from '../domain/config/baseRules.js';
import { normalizeOwnerPriceAnchors } from '../domain/priceAnchors.js';
import {
  targetScoreForDifficulty,
  scoreThresholdsForTarget,
} from '../domain/scenarioMetadata.js';
import {
  buildAuxiliaryStats,
  buildRuntimeAuxiliaryStats,
  resolveFormalSoldCount,
  syncAuxiliaryMirrors,
  syncAuxiliaryStats,
} from '../domain/runtimeStats.js';
import { deriveDefaultGoalTier, seedCase, updateDerivedState as updateDomainDerivedState } from '../domain/runtimeState.js';
import { initializeCustomerStates } from '../domain/engine/customerEngine.js';
import { buildProductRunMilestones } from '../domain/productRuns.js';
import {
  createGameRunId,
  createLegacyGameRunId,
  markSavedState,
  normalizeGameSaveMetadata,
} from './saveConsistency.js';

function isBrowser() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
}

export function getGameStateStorageKey(accountEmail?: string) {
  return buildScopedStorageKey(STORAGE_KEY, accountEmail);
}

function buildInitialDate(snapshot: ScenarioSnapshot) {
  const year = 2026;
  const month = Math.max(1, Math.min(12, snapshot.scenario.startMonth));
  const day = Math.max(1, Math.min(28, snapshot.scenario.startDay));
  return new Date(Date.UTC(year, month - 1, day)).toISOString().split('T')[0];
}

function cloneWorld(snapshot: ScenarioSnapshot) {
  return {
    markets: snapshot.world.marketCells.map((entry) => ({ ...entry })),
    customers: snapshot.world.customers.map((entry) => ({ ...entry })),
    channels: snapshot.world.channels.map((entry) => ({ ...entry })),
  };
}

const TARGET_CUSTOMER_CASE_RATIO = 10;

function cloneCustomer(entry: CustomerProfile): CustomerProfile {
  return {
    ...entry,
    layouts: [...entry.layouts],
    preferences: [...entry.preferences],
  };
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.filter(Boolean)));
}

function buildExpandedCustomerPool(
  customerTemplates: CustomerProfile[],
  cases: Pick<Case, 'id' | 'district' | 'layout' | 'askPrice' | 'tags'>[],
  source: RandomSource,
) {
  const customers = customerTemplates.map(cloneCustomer);
  const targetCount = Math.max(customers.length, cases.length * TARGET_CUSTOMER_CASE_RATIO);
  if (customers.length >= targetCount || customers.length === 0 || cases.length === 0) {
    return customers;
  }

  const templateUsage = new Map<string, number>();
  customerTemplates.forEach((entry) => {
    templateUsage.set(entry.id, 1);
  });

  while (customers.length < targetCount) {
    const caseItem = cases[randomInt(0, cases.length - 1, source)];
    const exactMatches = customerTemplates.filter((entry) =>
      entry.targetDistrict === caseItem.district && entry.layouts.includes(caseItem.layout),
    );
    const districtMatches = customerTemplates.filter((entry) => entry.targetDistrict === caseItem.district);
    const templatePool = exactMatches.length > 0
      ? exactMatches
      : districtMatches.length > 0
        ? districtMatches
        : customerTemplates;
    const template = templatePool[randomInt(0, templatePool.length - 1, source)];
    const nextUsage = (templateUsage.get(template.id) || 1) + 1;
    templateUsage.set(template.id, nextUsage);

    const spreadBase = Math.max(36, template.budgetMax - template.budgetMin);
    const spread = Math.max(36, spreadBase + randomInt(-18, 22, source));
    const center = Math.round(caseItem.askPrice + randomInt(-55, 65, source));
    const budgetMin = Math.max(0, center - Math.round(spread / 2));
    const budgetMax = Math.max(budgetMin + 24, center + Math.round(spread / 2));

    customers.push({
      ...cloneCustomer(template),
      id: `${template.id}-pool-${nextUsage}`,
      name: `${template.name}#${nextUsage}`,
      budgetMin,
      budgetMax,
      targetDistrict: caseItem.district,
      layouts: dedupeStrings([caseItem.layout, ...template.layouts]).slice(0, 3),
      activity: clamp(template.activity + randomInt(-8, 9, source), 28, 96),
      urgency: clamp(template.urgency + randomInt(-10, 11, source), 24, 96),
      priceSensitivity: clamp(template.priceSensitivity + randomInt(-8, 8, source), 20, 95),
      preferences: dedupeStrings([...template.preferences, ...caseItem.tags]).slice(0, 5),
    });
  }

  return customers;
}

type RunSeedInput = number | {
  runSeed: number;
  scenarioSeed?: number;
};

function resolveRunSeeds(seedInput: RunSeedInput) {
  if (typeof seedInput === 'number') {
    const runSeed = normalizeSeed(seedInput);
    return {
      runSeed,
      scenarioSeed: runSeed,
    };
  }

  const runSeed = normalizeSeed(seedInput.runSeed);
  return {
    runSeed,
    scenarioSeed: normalizeSeed(seedInput.scenarioSeed ?? runSeed),
  };
}

function buildRunContext(snapshot: ScenarioSnapshot, seedInput: RunSeedInput) {
  const { runSeed, scenarioSeed } = resolveRunSeeds(seedInput);
  return {
    scenarioId: snapshot.scenario.id,
    scenarioName: snapshot.scenario.name,
    difficultyId: snapshot.scenario.difficultyId,
    worldId: snapshot.world.id,
    worldVersion: snapshot.world.version,
    runSeed,
    scenarioSeed,
    rngSeed: runSeed,
    createdAt: new Date().toISOString(),
    scenarioSnapshot: snapshot,
  };
}

function normalizeCompanyPressure(input?: Partial<CompanyPressureState>): CompanyPressureState {
  return {
    sharedLeadPressure: clamp(Number(input?.sharedLeadPressure ?? 34), 0, 100),
    focusSlotPressure: clamp(Number(input?.focusSlotPressure ?? 28), 0, 100),
    internalReferralChance: clamp(Number(input?.internalReferralChance ?? 0.08), 0, 0.5),
    internalCompetitionHeat: clamp(Number(input?.internalCompetitionHeat ?? 32), 0, 100),
  };
}

function normalizeRivalStore(entry: any, index: number): RivalStore {
  return {
    id: String(entry?.id || `rival-store-${index + 1}`),
    name: String(entry?.name || `其他门店 ${index + 1}`),
    type: entry?.type === 'same_company' ? 'same_company' : 'external_company',
    style: ['aggressive', 'steady', 'relationship', 'traffic'].includes(entry?.style) ? entry.style : 'steady',
    districtFocus: Array.isArray(entry?.districtFocus) ? entry.districtFocus.map(String) : [],
    leadCapturePower: clamp(Number(entry?.leadCapturePower ?? 45), 0, 100),
    sellerInfluencePower: clamp(Number(entry?.sellerInfluencePower ?? 45), 0, 100),
    pricingPressurePower: clamp(Number(entry?.pricingPressurePower ?? 45), 0, 100),
    activityHeat: clamp(Number(entry?.activityHeat ?? 50), 0, 100),
  };
}

function normalizeRivalListing(entry: any, index: number): RivalListing {
  return {
    id: String(entry?.id || `rival-listing-${index + 1}`),
    storeId: String(entry?.storeId || 'unknown-rival-store'),
    title: String(entry?.title || `同类在卖房 ${index + 1}`),
    district: String(entry?.district || ''),
    marketCellId: String(entry?.marketCellId || ''),
    linkedCaseId: typeof entry?.linkedCaseId === 'string' ? entry.linkedCaseId : undefined,
    segment: String(entry?.segment || '竞品'),
    askPrice: Number(entry?.askPrice) || 0,
    heat: clamp(Number(entry?.heat ?? 55), 0, 100),
    freshness: clamp(Number(entry?.freshness ?? 60), 0, 100),
    storyStrength: clamp(Number(entry?.storyStrength ?? 50), 0, 100),
    leadSiphonPower: clamp(Number(entry?.leadSiphonPower ?? 45), 0, 100),
    ownerAnchorPower: clamp(Number(entry?.ownerAnchorPower ?? 45), 0, 100),
    status: ['active', 'sold', 'withdrawn'].includes(entry?.status) ? entry.status : 'active',
    daysLeft: Math.max(1, Number(entry?.daysLeft) || 8),
    source: ['seed', 'daily_event', 'inbound'].includes(entry?.source) ? entry.source : 'seed',
  };
}

export function createInitialShadowMarket(snapshot: ScenarioSnapshot): ShadowMarketState {
  const scenario = snapshot.scenario;
  const world = snapshot.world;
  const seededStores = Array.isArray(scenario.initialRivalStores) && scenario.initialRivalStores.length
    ? scenario.initialRivalStores
    : (world.rivalStoreArchetypes || []).slice(0, scenario.difficultyId === 'warmup' ? 1 : 2).map((entry) => ({
        ...entry,
        activityHeat: scenario.difficultyId === 'warmup' ? 28 : scenario.difficultyId === 'easy' ? 36 : 46,
      }));

  const seededListings = Array.isArray(scenario.initialRivalListings) && scenario.initialRivalListings.length
    ? scenario.initialRivalListings
    : [];

  return {
    rivalStores: seededStores.map(normalizeRivalStore),
    rivalListings: seededListings.map(normalizeRivalListing),
    companyPressure: normalizeCompanyPressure(scenario.companyPressureProfile),
    marketSignals: [],
    dailyMarketEvent: null,
    activeRuleEffects: [],
    inboundQueue: [],
  };
}

function normalizeShadowMarket(input: any, snapshot: ScenarioSnapshot): ShadowMarketState {
  const fallback = createInitialShadowMarket(snapshot);
  if (!input || typeof input !== 'object') {
    return fallback;
  }

  return {
    rivalStores: Array.isArray(input.rivalStores) ? input.rivalStores.map(normalizeRivalStore) : fallback.rivalStores,
    rivalListings: Array.isArray(input.rivalListings) ? input.rivalListings.map(normalizeRivalListing) : fallback.rivalListings,
    companyPressure: normalizeCompanyPressure(input.companyPressure || fallback.companyPressure),
    marketSignals: Array.isArray(input.marketSignals)
      ? input.marketSignals.map((entry: any, index: number) => ({
          id: String(entry?.id || `signal-${index + 1}`),
          type: ['buyer_demand', 'seller_intent', 'rival_activity'].includes(entry?.type) ? entry.type : 'rival_activity',
          district: String(entry?.district || ''),
          confidence: clamp(Number(entry?.confidence ?? 50), 0, 100),
          title: String(entry?.title || '市场信号'),
          message: String(entry?.message || ''),
          expiresInDays: Math.max(1, Number(entry?.expiresInDays) || 3),
        }))
      : [],
    dailyMarketEvent: input.dailyMarketEvent
      ? {
          ...input.dailyMarketEvent,
          day: Number(input.dailyMarketEvent.day) || 0,
        }
      : null,
    activeRuleEffects: Array.isArray(input.activeRuleEffects)
      ? input.activeRuleEffects.map((entry: any, index: number) => ({
          id: String(entry?.id || `effect-${index + 1}`),
          source: ['daily_market_event', 'company_pressure', 'rival_listing'].includes(entry?.source) ? entry.source : 'daily_market_event',
          label: String(entry?.label || '临时规则'),
          expiresInDays: Math.max(1, Number(entry?.expiresInDays) || 1),
        }))
      : [],
    inboundQueue: Array.isArray(input.inboundQueue)
      ? input.inboundQueue.map((entry: any, index: number) => ({
          id: String(entry?.id || `inbound-${index + 1}`),
          type: ['customer_to_player', 'listing_to_player', 'rival_listing_to_market', 'signal_to_player'].includes(entry?.type)
            ? entry.type
            : 'signal_to_player',
          source: ['same_company', 'external_company', 'seller_referral', 'market_event', 'system_seed'].includes(entry?.source)
            ? entry.source
            : 'market_event',
          title: String(entry?.title || '外部入场'),
          message: String(entry?.message || ''),
          payload: entry?.payload && typeof entry.payload === 'object' ? entry.payload : {},
        }))
      : [],
  };
}

export function createInitialState(snapshot: ScenarioSnapshot, seedInput: RunSeedInput): GameState {
  const rules = resolveScenarioRules(snapshot);
  const { runSeed } = resolveRunSeeds(seedInput);
  const rng: RandomSource = { rngState: runSeed, rngCalls: 0 };
  const generatedCases = instantiateScenarioCases(snapshot, rng).map(seedCase);
  const clonedWorld = cloneWorld(snapshot);
  const customers = buildExpandedCustomerPool(clonedWorld.customers, generatedCases, rng);

  const state: GameState = {
    version: 6,
    runId: createGameRunId(),
    localRevision: 0,
    clientUpdatedAt: new Date().toISOString(),
    saveSource: 'system',
    runContext: buildRunContext(snapshot, seedInput),
    day: 1,
    maxDay: rules.maxDay,
    currentDate: buildInitialDate(snapshot),
    maxEnergy: rules.baseMaxEnergy,
    energy: rules.initialEnergy,
    cash: rules.initialCash,
    auxiliaryStats: buildRuntimeAuxiliaryStats({
      cash: rules.initialCash,
      commission: rules.initialCommission,
      wordOfMouth: rules.initialWordOfMouth,
      soldCount: 0,
      withdrawnCount: 0,
    }),
    reputation: 0,
    commission: 0,
    soldCount: 0,
    withdrawnCount: 0,
    selectedCaseId: generatedCases[0]?.id || null,
    gameOver: false,
    finalResult: null,
    lastMessage: `本局剧本：${snapshot.scenario.name}。你有 ${rules.maxDay} 天把握节奏，别让同类房和推进压力一起把你拖垮。`,
    rules,
    scheduledEvents: snapshot.scenario.scriptedEvents.map((entry) => ({ ...entry })),
    competitionGroups: snapshot.scenario.competitionGroups.map((entry) => ({ ...entry })),
    rngState: rng.rngState,
    rngCalls: rng.rngCalls,
    channels: clonedWorld.channels,
    markets: clonedWorld.markets,
    customers,
    customerStates: [],
    cases: generatedCases,
    opportunities: [],
    budgetLedger: createInitialBudgetLedger(rules.initialCash),
    eventLog: [],
    eventStore: [],
    weeklyReviews: [],
    schedule: [],
    priorities: [],
    matters: [],
    todayPlan: {
      day: 1,
      playerItems: [],
    },
    focusMeeting: {
      submissionDay: null,
      submittedCaseIds: [],
      selectedCaseIds: [],
    },
    flowProgress: {},
    productRuns: [],
    closedDeals: [],
    marketOutcome: buildInitialMarketOutcomeState(rules, runSeed),
    metrics: {
      activeCaseCount: generatedCases.filter((entry) => entry.status === 'active').length,
      activeOpportunityCount: 0,
      averageTrust: 0,
      averageD1: 0,
      averageD3: 0,
      topConversion: '',
    },
    currentReport: null,
    lastDailyTickResult: null,
    marketShadow: createInitialShadowMarket(snapshot),
  };

  initializeCustomerStates(state);
  syncAuxiliaryStats(state);
  return state;
}

function buildLegacySnapshot(parsed: any): ScenarioSnapshot {
  const world = getBuiltInWorld();
  const scenarioCases = Array.isArray(parsed?.cases)
    ? parsed.cases.map((caseItem: any, index: number) => ({
        id: caseItem.id || `legacy-case-${index + 1}`,
        housePrototypeId: `legacy-prototype-${index + 1}`,
        ownerArchetypeId: caseItem.personality === 'urgent'
          ? 'anxious'
          : caseItem.personality === 'pragmatic'
            ? 'fair-value'
            : 'game-player',
        ownerName: caseItem.ownerName || '匿名业主',
        ownerMood: caseItem.ownerMood || '历史存档迁移',
        maintainerName: caseItem.maintainerName || '资产顾问',
        askPrice: Number(caseItem.askPrice) || 0,
        bottomPrice: Number(caseItem.bottomPrice) || Math.max(0, Number(caseItem.askPrice) - 20),
        initialTrust: Number(caseItem.trust) || 55,
        initialPatience: Number(caseItem.patience) || 55,
        initialHeat: Number(caseItem.heat) || 55,
        initialUrgency: Number(caseItem.urgency) || 55,
        windowDays: Number(caseItem.windowDays) || 10,
      }))
    : [];

  const worldFromSave = {
    ...world,
    marketCells: Array.isArray(parsed?.markets)
      ? parsed.markets.map((entry: any) => ({ ...entry }))
      : world.marketCells,
    customers: Array.isArray(parsed?.customers)
      ? parsed.customers.map((entry: any) => ({ ...entry }))
      : world.customers,
    channels: Array.isArray(parsed?.channels)
      ? parsed.channels.map((entry: any) => ({ ...entry }))
      : world.channels,
    housePrototypes: Array.isArray(parsed?.cases)
      ? parsed.cases.map((caseItem: any, index: number) => ({
          id: `legacy-prototype-${index + 1}`,
          title: caseItem.title,
          community: caseItem.community,
          district: caseItem.district,
          layout: caseItem.layout,
          area: Number(caseItem.area) || 0,
          marketCellId: caseItem.marketCellId,
          marketPrice: Number(caseItem.marketPrice) || Number(caseItem.askPrice) || 0,
          bottomPrice: Number(caseItem.bottomPrice) || Math.max(0, Number(caseItem.askPrice) - 20),
          story: caseItem.story || '历史盘源',
          tags: Array.isArray(caseItem.tags) ? caseItem.tags : [],
          defects: Array.isArray(caseItem.defects) ? caseItem.defects : [],
          axisScores: { ...(caseItem.axisScores || {}) },
        }))
      : world.housePrototypes,
  };

  return {
    source: 'builtin',
    world: worldFromSave,
    scenario: {
      id: 'legacy-v3-run',
      worldId: worldFromSave.id,
      worldVersion: worldFromSave.version,
      difficultyId: 'standard',
      name: '历史存档迁移局',
      theme: '从旧版状态迁移',
      description: '自动从 v3 存档迁移。',
      startMonth: 9,
      startDay: 1,
      maxDay: Number(parsed?.maxDay) || 21,
      cases: scenarioCases,
      competitionGroups: [],
      scriptedEvents: [],
      randomEventPool: [
        { templateId: 'school-boom', weight: 3 },
        { templateId: 'policy-shift', weight: 3 },
        { templateId: 'competitor-cut', weight: 3 },
      ],
      goalContext: 'ability',
      targetScore: targetScoreForDifficulty('standard'),
      scoreThresholds: scoreThresholdsForTarget(targetScoreForDifficulty('standard')),
      boardPressureProfile: {
        abilityPressure: 58,
        defensePressure: 54,
        satisfactionPressure: 50,
      },
      published: true,
    },
  };
}

function normalizeCase(caseItem: any): Case {
  const normalizedStatus = caseItem?.status === 'withdrawn' && caseItem?.defenseOutcome === 'lost_to_rival'
    ? 'lost_to_rival'
    : caseItem?.status;
  const priceAnchors = normalizeOwnerPriceAnchors({
    askPrice: Number(caseItem?.askPrice) || 0,
    marketPrice: Number(caseItem?.marketPrice) || 0,
    bottomPrice: Number(caseItem?.bottomPrice) || 0,
  });
  return {
    ...caseItem,
    ...priceAnchors,
    status: normalizedStatus,
    housePrototypeId: caseItem?.housePrototypeId || caseItem?.id || 'legacy-prototype',
    ownerArchetypeId: caseItem?.ownerArchetypeId || 'fair-value',
    personality: caseItem?.personality || 'pragmatic',
    competitionGroupIds: Array.isArray(caseItem?.competitionGroupIds) ? caseItem.competitionGroupIds : [],
    lastAskPrice: Math.max(Number(caseItem?.lastAskPrice) || 0, priceAnchors.askPrice),
    lastRivalThreatDay: Number.isFinite(caseItem?.lastRivalThreatDay)
      ? Number(caseItem.lastRivalThreatDay)
      : undefined,
    lastTouchedDay: Number.isFinite(caseItem?.lastTouchedDay) ? Number(caseItem.lastTouchedDay) : 0,
    lastOwnerTouchedDay: Number.isFinite(caseItem?.lastOwnerTouchedDay)
      ? Number(caseItem.lastOwnerTouchedDay)
      : Number.isFinite(caseItem?.lastTouchedDay)
        ? Number(caseItem.lastTouchedDay)
        : 0,
    hasCompletedFirstVisit: Boolean(caseItem?.hasCompletedFirstVisit)
      || (caseItem?.lastAction === 'first-visit'),
    goalTier: deriveDefaultGoalTier(caseItem),
    storylineState: caseItem?.storylineState || 'healthy',
    relativeOutcome: caseItem?.relativeOutcome,
    ownerSatisfaction: caseItem?.ownerSatisfaction,
    defenseOutcome: caseItem?.defenseOutcome,
    endingType: caseItem?.endingType,
    endingBucket: caseItem?.endingBucket,
    endingSummary: caseItem?.endingSummary || '',
  };
}

function normalizeOpportunity(opportunity: any) {
  return {
    ...opportunity,
    lifecycleStatus: ['active', 'stagnated', 'lost', 'closed_by_deal', 'closed_by_case'].includes(opportunity?.lifecycleStatus)
      ? opportunity.lifecycleStatus
      : opportunity?.status === 'won'
        ? 'closed_by_deal'
        : opportunity?.status === 'closed'
          ? 'closed_by_case'
          : opportunity?.status === 'lost'
            ? 'lost'
            : 'active',
    createdDay: Number(opportunity?.createdDay)
      || Number(opportunity?.history?.[0]?.day)
      || 1,
    pendingClosingEvaluation: Boolean(opportunity?.pendingClosingEvaluation),
    pendingClosingStrategyId: typeof opportunity?.pendingClosingStrategyId === 'string'
      ? opportunity.pendingClosingStrategyId
      : undefined,
    pendingClosingRequestedDay: Number.isFinite(opportunity?.pendingClosingRequestedDay)
      ? Number(opportunity.pendingClosingRequestedDay)
      : undefined,
  };
}

function normalizeClosedDeal(entry: any, index: number): ClosedDealRecord {
  const dealId = String(entry?.dealId || `legacy-deal-${index + 1}`);
  const caseId = String(entry?.caseId || '');
  const customerId = String(entry?.customerId || '');
  const sourceRelationId = String(entry?.sourceRelationId || entry?.opportunityId || '');
  const dayIndex = Math.max(1, Number(entry?.dayIndex ?? entry?.day) || 1);
  const dealPrice = Number(entry?.dealPrice ?? entry?.price) || 0;

  return {
    dealId,
    caseId,
    customerId,
    sourceRelationId,
    opportunityId: String(entry?.opportunityId || sourceRelationId),
    dayIndex,
    day: dayIndex,
    closedAt: typeof entry?.closedAt === 'string' && entry.closedAt.trim()
      ? entry.closedAt
      : new Date().toISOString(),
    dealType: ['self_closed', 'internal_cosale_closed', 'external_competitor_closed', 'platform_matched_closed'].includes(entry?.dealType)
      ? entry.dealType
      : 'self_closed',
    dealPrice,
    price: dealPrice,
    closeReadiness: Math.max(0, Number(entry?.closeReadiness) || 0),
    closeProbability: Math.max(0, Number(entry?.closeProbability) || 0),
    blockingReasons: Array.isArray(entry?.blockingReasons) ? entry.blockingReasons.map(String) : [],
    supportingReasons: Array.isArray(entry?.supportingReasons) ? entry.supportingReasons.map(String) : [],
  };
}

function normalizeCompetitionGroups(groups: unknown): CompetitionGroup[] {
  return Array.isArray(groups) ? groups.map((entry) => ({ ...(entry as CompetitionGroup) })) : [];
}

function normalizeRules(snapshot: ScenarioSnapshot, rules: unknown) {
  const fallback = resolveScenarioRules(snapshot);
  if (!rules || typeof rules !== 'object') {
    return fallback;
  }

  return mergeRules(rules as GameRuleOverrides);
}

function normalizeTodayArrangementExecutionMode(value: unknown): TodayArrangementExecutionMode {
  return value === 'scenario' ? 'scenario' : 'direct';
}

function normalizeTodayArrangementSlot(value: unknown): TodayArrangementSlot | undefined {
  return value === 'pm' ? 'pm' : 'am';
}

function normalizeTodayArrangementItem(entry: any, fallbackDay: number, index: number): TodayArrangementItem | null {
  const linkedActionId = typeof entry?.linkedActionId === 'string' ? entry.linkedActionId.trim() : '';
  if (!linkedActionId) {
    return null;
  }

  return {
    id: typeof entry?.id === 'string' && entry.id.trim()
      ? entry.id
      : `today-item-${fallbackDay}-${index + 1}`,
    day: Math.max(1, Number(entry?.day) || fallbackDay),
    sourceMatterId: typeof entry?.sourceMatterId === 'string' ? entry.sourceMatterId : undefined,
    linkedActionId,
    linkedCaseId: typeof entry?.linkedCaseId === 'string' ? entry.linkedCaseId : undefined,
    linkedCustomerId: typeof entry?.linkedCustomerId === 'string' ? entry.linkedCustomerId : undefined,
    linkedOpportunityId: typeof entry?.linkedOpportunityId === 'string' ? entry.linkedOpportunityId : undefined,
    executionMode: normalizeTodayArrangementExecutionMode(entry?.executionMode),
    status: entry?.status === 'completed' ? 'completed' : 'planned',
    slot: normalizeTodayArrangementSlot(entry?.slot),
  };
}

function normalizeTodayPlan(input: unknown, currentDay: number): TodayPlanState {
  const fallback: TodayPlanState = {
    day: currentDay,
    playerItems: [],
  };

  if (!input || typeof input !== 'object') {
    return fallback;
  }

  const parsedDay = Math.max(1, Number((input as { day?: unknown }).day) || currentDay);
  if (parsedDay !== currentDay) {
    return fallback;
  }

  const rawPlayerItems = (input as { playerItems?: unknown[] }).playerItems;
  const playerItems = Array.isArray(rawPlayerItems)
    ? rawPlayerItems
        .map((entry, index) => normalizeTodayArrangementItem(entry, currentDay, index))
        .filter((entry): entry is TodayArrangementItem => Boolean(entry))
        .filter((entry) => entry.day === currentDay)
    : [];

  return {
    day: currentDay,
    playerItems,
  };
}

function normalizeFocusMeeting(input: unknown, currentDay: number): FocusMeetingState {
  if (!input || typeof input !== 'object') {
    return {
      submissionDay: null,
      submittedCaseIds: [],
      selectedCaseIds: [],
    };
  }

  const payload = input as {
    submissionDay?: unknown;
    submittedCaseIds?: unknown;
    selectedCaseIds?: unknown;
  };
  const submissionDay = Number.isFinite(payload.submissionDay)
    ? Number(payload.submissionDay)
    : null;

  return {
    submissionDay: submissionDay === currentDay ? currentDay : null,
    submittedCaseIds: Array.isArray(payload.submittedCaseIds)
      ? payload.submittedCaseIds.map(String).filter(Boolean).slice(0, 3)
      : [],
    selectedCaseIds: Array.isArray(payload.selectedCaseIds)
      ? payload.selectedCaseIds.map(String).filter(Boolean).slice(0, 3)
      : [],
  };
}

function normalizeFlowProgress(input: unknown): Record<string, FlowProgressState> {
  if (!input || typeof input !== 'object') {
    return {};
  }
  const result: Record<string, FlowProgressState> = {};
  for (const [flowId, raw] of Object.entries(input as Record<string, any>)) {
    if (!raw || typeof raw !== 'object') continue;
    result[flowId] = {
      flowId: String(raw.flowId || flowId),
      activatedDay: Math.max(1, Number(raw.activatedDay) || 1),
      completedStepIds: Array.isArray(raw.completedStepIds)
        ? raw.completedStepIds.map(String).filter(Boolean)
        : [],
      currentStepId: typeof raw.currentStepId === 'string' ? raw.currentStepId : null,
    };
  }
  return result;
}

function normalizeProductRunMilestoneKind(value: unknown): ProductRunMilestoneKind {
  if (value === 'light_scene') return 'light_scene';
  if (value === 'heavy_scene') return 'heavy_scene';
  return 'event';
}

function normalizeProductRun(entry: any, index: number, currentDay: number): ProductRun | null {
  const productType = entry?.productType === 'open-day' || entry?.productType === 'sincere-sale'
    ? entry.productType
    : null;
  if (!productType) {
    return null;
  }

  const startDay = Math.max(1, Number(entry?.startDay) || currentDay);
  const milestones = Array.isArray(entry?.milestones) && entry.milestones.length > 0
    ? entry.milestones.map((milestone: any, milestoneIndex: number) => ({
        id: String(milestone?.id || `milestone-${milestoneIndex + 1}`),
        title: String(milestone?.title || '节点'),
        summary: String(milestone?.summary || ''),
        day: Math.max(startDay, Number(milestone?.day) || startDay),
        kind: normalizeProductRunMilestoneKind(milestone?.kind),
        settlementHint: String(milestone?.settlementHint || ''),
      }))
    : buildProductRunMilestones(productType, startDay);

  const fallbackMilestone = milestones.find((milestone) => milestone.day >= currentDay) || milestones[milestones.length - 1];

  return {
    id: String(entry?.id || `product-run-${productType}-${startDay}-${index + 1}`),
    productType,
    scope: entry?.scope === 'community' ? 'community' : 'listing',
    status: entry?.status === 'completed' || entry?.status === 'cancelled' ? entry.status : 'running',
    startDay,
    endDay: Number.isFinite(entry?.endDay) ? Number(entry.endDay) : undefined,
    targetIds: Array.isArray(entry?.targetIds) ? entry.targetIds.map(String).filter(Boolean) : [],
    nextMilestone: typeof entry?.nextMilestone === 'string' && entry.nextMilestone.trim()
      ? entry.nextMilestone
      : fallbackMilestone?.id || 'completed',
    linkedEventIds: Array.isArray(entry?.linkedEventIds) ? entry.linkedEventIds.map(String).filter(Boolean) : [],
    milestones,
  };
}

function normalizeProductRuns(input: unknown, currentDay: number): ProductRun[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((entry, index) => normalizeProductRun(entry, index, currentDay))
    .filter((entry): entry is ProductRun => Boolean(entry));
}

function normalizeStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function normalizeBoolean(value: unknown): boolean {
  return value === true;
}

function normalizeDailyProcessResult(
  entry: unknown,
  tickDay: number,
  nextDay: number,
  expectedPhase?: DailyProcessResultSummary['phase'],
): DailyProcessResultSummary | null {
  const managerId = entry && typeof entry === 'object'
    ? (entry as { managerId?: unknown }).managerId
    : undefined;
  const expectedDay = managerId === 'product-run-process-manager'
    ? nextDay
    : managerId === 'negotiation-process-manager'
      ? tickDay
      : undefined;
  const fallbackPhase = expectedPhase
    ?? (managerId === 'product-run-process-manager' ? 'next-day-setup' : 'settled-day');
  const readModel = normalizeDailyProcessResultReadModel(entry, {
    expectedDay,
    fallbackDay: expectedDay ?? tickDay,
    fallbackPhase,
  });
  if (!readModel) {
    return null;
  }
  if (expectedPhase && readModel.phase !== expectedPhase) {
    return null;
  }

  return {
    managerId: readModel.managerId,
    owner: readModel.owner,
    outcomeOwner: readModel.outcomeOwner,
    day: readModel.day,
    phase: readModel.phase,
    processedCount: readModel.processedCount,
    resolvedCount: readModel.resolvedCount,
    emittedEventIds: [...readModel.emittedEventIds],
    closedDealIds: [...readModel.closedDealIds],
    opportunityIds: [...readModel.opportunityIds],
    productRunIds: [...readModel.productRunIds],
  };
}

function normalizeDailyProcessResultsForTick(
  input: unknown,
  tickDay: number,
  nextDay: number,
  expectedPhase?: DailyProcessResultSummary['phase'],
): DailyProcessResultSummary[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .map((entry) => normalizeDailyProcessResult(entry, tickDay, nextDay, expectedPhase))
    .filter((entry): entry is DailyProcessResultSummary => Boolean(entry));
}

function normalizeLastDailyTickResult(input: unknown): DailyTickResult | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const payload = input as DailyTickResult & {
    processResults?: unknown;
    settledDayProcessResults?: unknown;
    nextDaySetupProcessResults?: unknown;
  };
  const day = Math.max(1, Number(payload.day) || 1);
  const parsedNextDay = Number(payload.nextDay);
  const nextDay = Number.isFinite(parsedNextDay) ? Math.max(day, parsedNextDay) : day + 1;
  const flatProcessResults = Array.isArray(payload.processResults)
    ? normalizeDailyProcessResultsForTick(payload.processResults, day, nextDay)
    : [];
  const settledDayProcessResults = Array.isArray(payload.settledDayProcessResults)
    ? normalizeDailyProcessResultsForTick(payload.settledDayProcessResults, day, nextDay, 'settled-day')
    : flatProcessResults.filter((entry) => entry.phase === 'settled-day');
  const nextDaySetupProcessResults = Array.isArray(payload.nextDaySetupProcessResults)
    ? normalizeDailyProcessResultsForTick(payload.nextDaySetupProcessResults, day, nextDay, 'next-day-setup')
    : flatProcessResults.filter((entry) => entry.phase === 'next-day-setup');
  const processResults = flatProcessResults.length > 0
    ? flatProcessResults
    : [...settledDayProcessResults, ...nextDaySetupProcessResults];
  const dirtyScopes = payload.dirtyScopes && typeof payload.dirtyScopes === 'object'
    ? payload.dirtyScopes
    : {};

  return {
    ...payload,
    day,
    nextDay,
    report: payload.report || null,
    emittedEvents: Array.isArray(payload.emittedEvents) ? payload.emittedEvents : [],
    closedDeals: Array.isArray(payload.closedDeals)
      ? payload.closedDeals.map(normalizeClosedDeal)
      : [],
    processResults,
    settledDayProcessResults,
    nextDaySetupProcessResults,
    dirtyScopes: {
      cases: normalizeStringArray((dirtyScopes as { cases?: unknown }).cases),
      opportunities: normalizeStringArray((dirtyScopes as { opportunities?: unknown }).opportunities),
      customers: normalizeStringArray((dirtyScopes as { customers?: unknown }).customers),
      owners: normalizeStringArray((dirtyScopes as { owners?: unknown }).owners),
      districts: normalizeStringArray((dirtyScopes as { districts?: unknown }).districts),
      marketCells: normalizeStringArray((dirtyScopes as { marketCells?: unknown }).marketCells),
      matters: normalizeStringArray((dirtyScopes as { matters?: unknown }).matters),
      market: normalizeBoolean((dirtyScopes as { market?: unknown }).market),
      dashboard: normalizeBoolean((dirtyScopes as { dashboard?: unknown }).dashboard),
      result: normalizeBoolean((dirtyScopes as { result?: unknown }).result),
    },
    invariantAlerts: Array.isArray(payload.invariantAlerts)
      ? payload.invariantAlerts
      : [],
  };
}

function resolveParsedAuxiliaryStats(parsed: any) {
  return buildRuntimeAuxiliaryStats({
    cash: Number(parsed?.cash) || 0,
    auxiliaryStats: parsed?.auxiliaryStats,
    closedDeals: Array.isArray(parsed?.closedDeals)
      ? parsed.closedDeals.map(normalizeClosedDeal)
      : undefined,
    commission: Number(parsed?.commission) || 0,
    wordOfMouth: Number(parsed?.wordOfMouth) || 0,
    reputation: Number(parsed?.reputation) || 0,
    soldCount: Number(parsed?.soldCount) || 0,
    withdrawnCount: Number(parsed?.withdrawnCount) || 0,
  });
}

export function loadSavedState(accountEmail?: string): GameState | null {
  if (!isBrowser()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(getGameStateStorageKey(accountEmail));
    if (!raw) return null;
    return normalizeLoadedState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function migrateSavedStateScope(targetScopeKey: string, legacyScopeKey?: string): GameState | null {
  if (!isBrowser()) {
    return null;
  }

  const existing = loadSavedState(targetScopeKey);
  if (existing) {
    return existing;
  }

  if (!legacyScopeKey || legacyScopeKey === targetScopeKey) {
    return null;
  }

  const legacyState = loadSavedState(legacyScopeKey);
  if (!legacyState) {
    return null;
  }

  saveGameState(legacyState, targetScopeKey);
  return legacyState;
}

export function normalizeLoadedState(parsed: any): GameState | null {
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  if (parsed.version !== 6 && parsed.version !== 5 && parsed.version !== 4 && parsed.version !== 3) {
    return null;
  }

  const snapshot = parsed?.runContext?.scenarioSnapshot || buildLegacySnapshot(parsed);
  const rules = normalizeRules(snapshot, parsed?.rules);
  const parsedRunContext = parsed?.runContext && typeof parsed.runContext === 'object'
    ? parsed.runContext
    : null;
  const runSeed = normalizeSeed(
    Number(parsedRunContext?.runSeed ?? parsedRunContext?.rngSeed ?? parsed?.rngState ?? Date.now()),
  );
  const scenarioSeed = normalizeSeed(
    Number(parsedRunContext?.scenarioSeed ?? parsedRunContext?.runSeed ?? parsedRunContext?.rngSeed ?? runSeed),
  );
  const normalizedCases = Array.isArray(parsed?.cases) ? parsed.cases.map(normalizeCase) : [];
  const normalizedClosedDeals = Array.isArray(parsed?.closedDeals)
    ? parsed.closedDeals.map(normalizeClosedDeal)
    : [];
  const currentDay = Math.max(1, Number(parsed?.day) || 1);
  const restoredCustomers = Array.isArray(parsed?.customers)
    ? parsed.customers.map((entry: any) => cloneCustomer(entry as CustomerProfile))
    : snapshot.world.customers.map(cloneCustomer);
  const customerPoolSeed: RandomSource = {
    rngState: normalizeSeed(runSeed ^ 0x9e3779b9),
    rngCalls: 0,
  };
  const saveMetadata = normalizeGameSaveMetadata(parsed, {
    runId: createLegacyGameRunId({
      scenarioId: String(parsedRunContext?.scenarioId || snapshot.scenario.id),
      runSeed,
      createdAt: typeof parsedRunContext?.createdAt === 'string' ? parsedRunContext.createdAt : undefined,
    }),
    createdAt: typeof parsedRunContext?.createdAt === 'string' ? parsedRunContext.createdAt : undefined,
  });

  const state = {
    ...parsed,
    ...saveMetadata,
    version: 6,
    runContext: {
      ...buildRunContext(snapshot, { runSeed, scenarioSeed }),
      ...(parsedRunContext || {}),
      scenarioId: String(parsedRunContext?.scenarioId || snapshot.scenario.id),
      scenarioName: String(parsedRunContext?.scenarioName || snapshot.scenario.name),
      difficultyId: parsedRunContext?.difficultyId || snapshot.scenario.difficultyId,
      worldId: String(parsedRunContext?.worldId || snapshot.world.id),
      worldVersion: Number(parsedRunContext?.worldVersion || snapshot.world.version),
      runSeed,
      scenarioSeed,
      rngSeed: runSeed,
      createdAt: typeof parsedRunContext?.createdAt === 'string'
        ? parsedRunContext.createdAt
        : new Date().toISOString(),
      scenarioSnapshot: parsedRunContext?.scenarioSnapshot || snapshot,
    },
    rules,
    day: currentDay,
    maxDay: Number(parsed?.maxDay) || rules.maxDay,
    maxEnergy: Number(parsed?.maxEnergy) || rules.baseMaxEnergy,
    scheduledEvents: Array.isArray(parsed?.scheduledEvents)
      ? parsed.scheduledEvents
      : snapshot.scenario.scriptedEvents.map((entry) => ({ ...entry })),
    competitionGroups: normalizeCompetitionGroups(parsed?.competitionGroups || snapshot.scenario.competitionGroups),
    rngState: normalizeSeed(Number(parsed?.rngState) || Number(parsedRunContext?.rngSeed) || runSeed),
    rngCalls: Number.isFinite(parsed?.rngCalls) ? Number(parsed.rngCalls) : 0,
    cash: Number(parsed?.cash) || 0,
    auxiliaryStats: resolveParsedAuxiliaryStats(parsed),
    reputation: 0,
    commission: 0,
    soldCount: 0,
    withdrawnCount: 0,
    cases: normalizedCases,
    opportunities: Array.isArray(parsed?.opportunities) ? parsed.opportunities.map(normalizeOpportunity) : [],
    closedDeals: normalizedClosedDeals,
    eventLog: Array.isArray(parsed?.eventLog)
      ? parsed.eventLog.map((entry: any) => ({
          actor: String(entry?.actor || '系统'),
          message: String(entry?.message || entry?.detail || ''),
          tone: entry?.tone === 'success' || entry?.tone === 'danger' ? entry.tone : 'accent',
          day: Number(entry?.day) || 1,
          date: typeof entry?.date === 'string' ? entry.date : buildInitialDate(snapshot),
        }))
      : [],
    eventStore: Array.isArray(parsed?.eventStore) ? parsed.eventStore.map((entry: any, index: number) => ({
      id: String(entry?.id || `event-legacy-${index + 1}`),
      day: Number(entry?.day) || 1,
      date: typeof entry?.date === 'string' ? entry.date : buildInitialDate(snapshot),
      kind: typeof entry?.kind === 'string' ? entry.kind : 'journal',
      actor: String(entry?.actor || '系统'),
      title: String(entry?.title || entry?.actor || '历史事件'),
      detail: String(entry?.detail || entry?.message || ''),
      tone: entry?.tone === 'success' || entry?.tone === 'danger' ? entry.tone : 'accent',
      caseId: typeof entry?.caseId === 'string' ? entry.caseId : undefined,
      opportunityId: typeof entry?.opportunityId === 'string' ? entry.opportunityId : undefined,
      customerId: typeof entry?.customerId === 'string' ? entry.customerId : undefined,
      payload: entry?.payload && typeof entry.payload === 'object' ? entry.payload : {},
    })) : [],
    customers: buildExpandedCustomerPool(restoredCustomers, normalizedCases, customerPoolSeed),
    customerStates: Array.isArray(parsed?.customerStates)
      ? parsed.customerStates.map((entry: any) => ({
          ...entry,
          activeCaseIds: Array.isArray(entry?.activeCaseIds) ? entry.activeCaseIds.map(String) : [],
          caseStates: entry?.caseStates && typeof entry.caseStates === 'object' ? entry.caseStates : {},
        }))
      : [],
    todayPlan: normalizeTodayPlan(parsed?.todayPlan, currentDay),
    focusMeeting: normalizeFocusMeeting(parsed?.focusMeeting, currentDay),
    flowProgress: normalizeFlowProgress(parsed?.flowProgress),
    productRuns: normalizeProductRuns(parsed?.productRuns, currentDay),
    budgetLedger: normalizeBudgetLedger(parsed?.budgetLedger, Number(parsed?.cash) || 0),
    currentReport: parsed?.currentReport || null,
    lastDailyTickResult: normalizeLastDailyTickResult(parsed?.lastDailyTickResult),
    marketOutcome: normalizeMarketOutcomeState(parsed?.marketOutcome, rules, runSeed, currentDay, {
      playerClaimedDeals: normalizedClosedDeals.filter((entry) => entry.dealType === 'self_closed').length,
    }),
    marketShadow: normalizeShadowMarket(parsed?.marketShadow, snapshot),
  } as GameState;

  if (!state.customerStates.length) {
    initializeCustomerStates(state);
  }
  updateDerivedState(state);

  return state;
}

export function saveGameState(world: GameState, accountEmail?: string) {
  if (!isBrowser()) {
    return;
  }

  try {
    const legacyAuxiliaryStats = buildAuxiliaryStats(world);
    const soldCount = resolveFormalSoldCount(world);
    const savedWorld = markSavedState(world);
    const snapshot = {
      ...savedWorld,
      commission: legacyAuxiliaryStats.commission,
      wordOfMouth: legacyAuxiliaryStats.wordOfMouth,
      reputation: world.reputation,
      soldCount,
      withdrawnCount: legacyAuxiliaryStats.withdrawnCount,
      eventLog: world.eventLog.slice(0, 120),
      eventStore: world.eventStore,
      weeklyReviews: world.weeklyReviews.slice(0, 12),
    };
    window.localStorage.setItem(getGameStateStorageKey(accountEmail), JSON.stringify(snapshot));
  } catch (error) {
    console.warn('Save failed', error);
  }
}

export function clearSavedGameState(accountEmail?: string) {
  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.removeItem(getGameStateStorageKey(accountEmail));
  } catch {
    // ignore local cleanup failure
  }
}

export function updateDerivedState(world: GameState) {
  updateDomainDerivedState(world);
  syncAuxiliaryMirrors(world);
}
