import {
  STORAGE_KEY,
  CASE_STAGES,
} from '../domain/constants';
import {
  average,
  clamp,
  normalizeSeed,
  randomInt,
  type RandomSource,
  getOpportunityPriority,
} from '../domain/utils';
import { updateCompetitiveness, calculateUrgency } from '../domain/scoring';
import { instantiateScenarioCases } from '../domain/generator';
import {
  type Case,
  type GoalTier,
  type CompetitionGroup,
  type GameState,
  type Opportunity,
  type ScenarioSnapshot,
  type ShadowMarketState,
  type RivalStore,
  type RivalListing,
  type CompanyPressureState,
} from '../domain/models';
import { createInitialBudgetLedger, normalizeBudgetLedger } from '../domain/budget';
import { getBuiltInWorld, resolveScenarioRules } from '../domain/scenarioCatalog';
import { mergeRules } from '../domain/config/baseRules';

function isBrowser() {
  return typeof window !== 'undefined' && Boolean(window.localStorage);
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

function buildRunContext(snapshot: ScenarioSnapshot, seed: number) {
  return {
    scenarioId: snapshot.scenario.id,
    scenarioName: snapshot.scenario.name,
    difficultyId: snapshot.scenario.difficultyId,
    worldId: snapshot.world.id,
    worldVersion: snapshot.world.version,
    rngSeed: seed,
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
    name: String(entry?.name || `竞品门店 ${index + 1}`),
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
    title: String(entry?.title || `竞品房源 ${index + 1}`),
    district: String(entry?.district || ''),
    marketCellId: String(entry?.marketCellId || ''),
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

function deriveDefaultGoalTier(caseItem: any): GoalTier {
  if (caseItem?.goalTier === 'core' || caseItem?.goalTier === 'important' || caseItem?.goalTier === 'normal') {
    return caseItem.goalTier;
  }

  if (Number(caseItem?.windowDays) <= 7 || Number(caseItem?.urgency) >= 76) {
    return 'core';
  }
  if (Number(caseItem?.trust) <= 58 || Number(caseItem?.windowDays) <= 10 || Number(caseItem?.patience) <= 45) {
    return 'important';
  }
  return 'normal';
}

export function createInitialState(snapshot: ScenarioSnapshot, seed: number): GameState {
  const rules = resolveScenarioRules(snapshot);
  const normalizedSeed = normalizeSeed(seed);
  const rng: RandomSource = { rngState: normalizedSeed, rngCalls: 0 };
  const generatedCases = instantiateScenarioCases(snapshot, rng).map(seedCase);
  const clonedWorld = cloneWorld(snapshot);

  return {
    version: 5,
    runContext: buildRunContext(snapshot, normalizedSeed),
    day: 1,
    maxDay: rules.maxDay,
    currentDate: buildInitialDate(snapshot),
    maxEnergy: rules.baseMaxEnergy,
    energy: rules.initialEnergy,
    cash: rules.initialCash,
    reputation: rules.initialReputation,
    commission: rules.initialCommission,
    soldCount: 0,
    withdrawnCount: 0,
    selectedCaseId: generatedCases[0]?.id || null,
    gameOver: false,
    finalResult: null,
    lastMessage: `本局剧本：${snapshot.scenario.name}。你有 ${rules.maxDay} 天把握节奏，别让竞品和窗口一起把你拖垮。`,
    rules,
    scheduledEvents: snapshot.scenario.scriptedEvents.map((entry) => ({ ...entry })),
    competitionGroups: snapshot.scenario.competitionGroups.map((entry) => ({ ...entry })),
    rngState: rng.rngState,
    rngCalls: rng.rngCalls,
    channels: clonedWorld.channels,
    markets: clonedWorld.markets,
    customers: clonedWorld.customers,
    cases: generatedCases,
    opportunities: [],
    budgetLedger: createInitialBudgetLedger(rules.initialCash),
    eventLog: [],
    weeklyReviews: [],
    schedule: [],
    priorities: [],
    metrics: {},
    currentReport: null,
    marketShadow: createInitialShadowMarket(snapshot),
  };
}

export function seedCase(base: Case): Case {
  return {
    ...base,
    status: 'active',
    stageIndex: 0,
    stageLabel: CASE_STAGES[0],
    riskFlags: [],
    actionsToday: 0,
    touchedToday: false,
    touchedOwnerToday: false,
    lastTouchedDay: 0,
    lastOwnerTouchedDay: 0,
    hasCompletedFirstVisit: false,
    lastAction: '',
    lastPriceActionDay: -99,
    openDayCooldown: 0,
    qualityStory: 0,
    negotiationBonus: 0,
    viewings: 0,
    offers: 0,
    soldPrice: null,
    priceGapPct: 0,
    competitivenessSnapshots: [],
    competitionGroupIds: base.competitionGroupIds || [],
    lastAskPrice: base.askPrice,
    lastRivalThreatDay: undefined,
    goalTier: deriveDefaultGoalTier(base),
    storylineState: 'healthy',
    relativeOutcome: undefined,
    ownerSatisfaction: undefined,
    defenseOutcome: undefined,
    endingType: undefined,
    endingBucket: undefined,
    endingSummary: '',
  };
}

export function logEvent(world: GameState, actor: string, message: string, tone: 'accent' | 'danger' | 'success' = 'accent') {
  world.eventLog.unshift({
    actor,
    message,
    tone,
    day: world.day,
    date: world.currentDate,
  });
  if (world.eventLog.length > 120) {
    world.eventLog.pop();
  }
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
      targetScore: 68,
      scoreThresholds: {
        pass: 56,
        strong: 82,
        ace: 92,
      },
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
  return {
    ...caseItem,
    status: normalizedStatus,
    housePrototypeId: caseItem?.housePrototypeId || caseItem?.id || 'legacy-prototype',
    ownerArchetypeId: caseItem?.ownerArchetypeId || 'fair-value',
    personality: caseItem?.personality || 'pragmatic',
    competitionGroupIds: Array.isArray(caseItem?.competitionGroupIds) ? caseItem.competitionGroupIds : [],
    lastAskPrice: Number(caseItem?.lastAskPrice) || Number(caseItem?.askPrice) || 0,
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
    createdDay: Number(opportunity?.createdDay)
      || Number(opportunity?.history?.[0]?.day)
      || 1,
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

  return mergeRules(rules as Parameters<typeof mergeRules>[0]);
}

export function loadSavedState(): GameState | null {
  if (!isBrowser()) {
    return null;
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return normalizeLoadedState(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function normalizeLoadedState(parsed: any): GameState | null {
  if (!parsed || typeof parsed !== 'object') {
    return null;
  }

  if (parsed.version !== 5 && parsed.version !== 4 && parsed.version !== 3) {
    return null;
  }

  const snapshot = parsed?.runContext?.scenarioSnapshot || buildLegacySnapshot(parsed);
  const rules = normalizeRules(snapshot, parsed?.rules);
  const state = {
    ...parsed,
    version: 5,
    runContext: parsed?.runContext || buildRunContext(snapshot, Number(parsed?.rngState) || Date.now()),
    rules,
    maxDay: Number(parsed?.maxDay) || rules.maxDay,
    maxEnergy: Number(parsed?.maxEnergy) || rules.baseMaxEnergy,
    scheduledEvents: Array.isArray(parsed?.scheduledEvents)
      ? parsed.scheduledEvents
      : snapshot.scenario.scriptedEvents.map((entry) => ({ ...entry })),
    competitionGroups: normalizeCompetitionGroups(parsed?.competitionGroups || snapshot.scenario.competitionGroups),
    rngState: normalizeSeed(Number(parsed?.rngState) || Number(parsed?.runContext?.rngSeed) || Date.now()),
    rngCalls: Number.isFinite(parsed?.rngCalls) ? Number(parsed.rngCalls) : 0,
    cash: Number(parsed?.cash) || 0,
    cases: Array.isArray(parsed?.cases) ? parsed.cases.map(normalizeCase) : [],
    opportunities: Array.isArray(parsed?.opportunities) ? parsed.opportunities.map(normalizeOpportunity) : [],
    budgetLedger: normalizeBudgetLedger(parsed?.budgetLedger, Number(parsed?.cash) || 0),
    currentReport: parsed?.currentReport || null,
    marketShadow: normalizeShadowMarket(parsed?.marketShadow, snapshot),
  } as GameState;

  return state;
}

export function saveGameState(world: GameState) {
  if (!isBrowser()) {
    return;
  }

  try {
    const snapshot = {
      ...world,
      eventLog: world.eventLog.slice(0, 120),
      weeklyReviews: world.weeklyReviews.slice(0, 12),
    };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (error) {
    console.error('Save failed', error);
  }
}

export function clearSavedGameState() {
  if (!isBrowser()) {
    return;
  }

  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore local cleanup failure
  }
}

export function updateDerivedState(world: GameState) {
  world.cases.forEach((caseItem) => {
    const opportunities = world.opportunities.filter((entry) => entry.caseId === caseItem.id && entry.status === 'active');
    const highestStage = opportunities.length ? Math.max(...opportunities.map((entry) => entry.stageIndex)) : 0;

    if (caseItem.status === 'sold') {
      caseItem.stageLabel = '已成交';
    } else if (caseItem.status === 'lost_to_rival') {
      caseItem.stageLabel = '被竞品截走';
    } else if (caseItem.status === 'withdrawn') {
      caseItem.stageLabel = '已撤盘';
    } else {
      caseItem.stageIndex = Math.max(caseItem.stageIndex, highestStage);
      caseItem.stageLabel = CASE_STAGES[clamp(caseItem.stageIndex, 0, CASE_STAGES.length - 1)];
    }

    caseItem.priceGapPct = Math.round(((caseItem.askPrice - caseItem.marketPrice) / Math.max(caseItem.marketPrice, 1)) * 1000) / 10;
    updateCompetitiveness(world, caseItem);
    caseItem.riskFlags = deriveRiskFlags(world, caseItem, opportunities);
    caseItem.storylineState = deriveStorylineState(caseItem, opportunities);
  });

  world.schedule = deriveSchedule(world);
  world.priorities = derivePriorities(world);
  world.metrics = deriveMetrics(world);

  if (!world.cases.some((entry) => entry.id === world.selectedCaseId)) {
    world.selectedCaseId = world.cases.find((entry) => entry.status === 'active')?.id || world.cases[0]?.id || null;
  }

  world.opportunities.sort((left, right) => getOpportunityPriority(right) - getOpportunityPriority(left));
}

function deriveRiskFlags(world: GameState, caseItem: Case, opportunities: Opportunity[]) {
  const flags: string[] = [];
  if (caseItem.status !== 'active') return flags;
  if (caseItem.trust < 58) flags.push('关系脆弱');
  if (caseItem.windowDays <= 4) flags.push('窗口逼近');
  if (caseItem.askPrice > caseItem.marketPrice * 1.05) flags.push('价格锚偏高');
  if (caseItem.heat < 48) flags.push('盘面发冷');
  if (!opportunities.length) flags.push('线索断档');
  if (caseItem.competitionGroupIds.length > 0) flags.push('竞品联动');
  if (!flags.length) flags.push('节奏稳定');
  return flags;
}

function deriveStorylineState(caseItem: Case, opportunities: Opportunity[]) {
  if (caseItem.status === 'sold') return 'healthy' as const;
  if (caseItem.status === 'lost_to_rival' || caseItem.status === 'withdrawn') return 'critical' as const;
  if (caseItem.windowDays <= 2 || caseItem.trust <= 45) return 'critical' as const;
  if (caseItem.windowDays <= 4 || caseItem.trust <= 55 || !opportunities.length) return 'sliding' as const;
  if (caseItem.heat < 50 || caseItem.competitionGroupIds.length > 0) return 'fragile' as const;
  return 'healthy' as const;
}

function deriveSchedule(world: GameState) {
  const items: any[] = [];
  world.cases.forEach((caseItem) => {
    if (caseItem.status !== 'active') return;
    if (caseItem.windowDays <= 4) {
      items.push({
        key: `${caseItem.id}-window`,
        title: '业主窗口逼近',
        badge: `${caseItem.windowDays} 天内`,
        note: `${caseItem.title} 处在业主窗口收缩阶段，${caseItem.ownerName} 的预期正在变紧。`,
        urgency: 100 - caseItem.windowDays * 10,
      });
    }
  });

  world.opportunities
    .filter((entry) => entry.status === 'active' && entry.daysLeft <= 2)
    .forEach((entry) => {
      const isShadow = entry.visibility === 'shadow';
      const displayName = isShadow ? `待确认客户 #${entry.id.split('-').pop()}` : entry.customerName;
      items.push({
        key: entry.id,
        title: isShadow ? '确认客户需求' : entry.stageLabel,
        badge: `${entry.daysLeft} 天后流失`,
        note: `${displayName} 正在从 ${world.cases.find((caseItem) => caseItem.id === entry.caseId)?.title || '房源'} 上流失，剩余窗口已经不多。`,
        urgency: 86 - entry.daysLeft * 10 + entry.stageIndex * 4,
      });
    });

  return items.sort((left, right) => right.urgency - left.urgency).slice(0, 10);
}

function derivePriorities(world: GameState) {
  const items: any[] = [];
  world.cases
    .filter((entry) => entry.status === 'active')
    .sort((left, right) => calculateUrgency(right) - calculateUrgency(left))
    .slice(0, 2)
    .forEach((caseItem) => {
      const urgencyLabel = caseItem.storylineState === 'critical'
        ? '这套房已经快滑出可控区了。'
        : caseItem.storylineState === 'sliding'
          ? '这套房正在往难看收尾滑。'
          : caseItem.storylineState === 'fragile'
            ? '这套房还能守，但已经不能再放。'
            : '这套房目前还在你能控住的区间里。';
      items.push({
        kind: 'case',
        title: `${caseItem.title} 风险抬升`,
        detail: `${urgencyLabel} ${caseItem.ownerName} 当前信任 ${Math.round(caseItem.trust)}，D3 意愿分 ${Math.round(caseItem.d3)}。`,
        caseId: caseItem.id,
      });
    });

  world.opportunities
    .filter((entry) => entry.status === 'active')
    .slice(0, 2)
    .forEach((entry) => {
      const isShadow = entry.visibility === 'shadow';
      const displayName = isShadow ? `待确认客户 #${entry.id.split('-').pop()}` : entry.customerName;
      items.push({
        kind: 'opportunity',
        title: isShadow ? `${displayName} 待确认` : `${displayName} 进入 ${entry.stageLabel}`,
        detail: isShadow
          ? `这是一位待确认客户，当前信息来自经纪人 ${entry.brokerName}。`
          : `${displayName} 已进入 ${entry.stageLabel}，${entry.daysLeft} 天后可能流失。`,
        caseId: entry.caseId,
      });
    });

  return items.slice(0, 5);
}

function deriveMetrics(world: GameState) {
  const activeCases = world.cases.filter((entry) => entry.status === 'active');
  const activeOpportunities = world.opportunities.filter((entry) => entry.status === 'active');
  return {
    activeCaseCount: activeCases.length,
    activeOpportunityCount: activeOpportunities.length,
    averageTrust: Math.round(average(activeCases.map((entry) => entry.trust))),
    averageD1: Math.round(average(activeCases.map((entry) => entry.d1))),
    averageD3: Math.round(average(activeCases.map((entry) => entry.d3))),
    topConversion: activeOpportunities.length ? `${Math.round(activeOpportunities[0].intent)}%` : '暂无',
  };
}
