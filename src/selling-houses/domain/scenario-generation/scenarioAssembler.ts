import { MAINTAINER_NAMES, OWNER_NAMES } from '../constants.js';
import type {
  CompetitionGroup,
  DifficultyId,
  HousePrototype,
  OwnerArchetype,
  RivalListing,
  RivalStore,
  ScenarioCase,
  ScenarioDefinition,
  ScriptedEvent,
  WeightedDailyEventRef,
  WorldSpec,
} from '../models.js';
import {
  clamp,
  nextRandom,
  normalizeSeed,
  pickRandom,
  pickWeighted,
  randomInt,
  type RandomSource,
} from '../utils.js';
import { getDifficultyProfile } from './difficultyProfiles.js';
import { buildScenarioPresentation } from './scenarioNamer.js';
import { getScenarioBlueprintsForDifficulty } from './scenarioBlueprints.js';
import type {
  CaseRole,
  DifficultyProfile,
  GeneratedGoalContext,
  GeneratedRoleAssignment,
  ScenarioBlueprint,
  ScenarioGenerationRequest,
} from './types.js';

interface CandidateOption<T> {
  value: T;
  weight: number;
}

interface SelectedSlot {
  slotId: string;
  role: CaseRole;
  prototype: HousePrototype;
  ownerArchetype: OwnerArchetype;
  ownerName: string;
  maintainerName: string;
}

function buildRandomSource(seed: number): RandomSource {
  return { rngState: normalizeSeed(seed), rngCalls: 0 };
}

function pickBlueprint(profile: DifficultyProfile, source: RandomSource) {
  const blueprints = getScenarioBlueprintsForDifficulty(profile.id);
  return pickWeighted(blueprints.map((blueprint) => ({ ...blueprint, weight: blueprint.weight })), source);
}

function normalizeRangePick(min: number, max: number, source: RandomSource) {
  if (min >= max) {
    return min;
  }

  return randomInt(min, max, source);
}

function takeUniqueName(pool: string[], used: Set<string>, source: RandomSource) {
  const remaining = pool.filter((name) => !used.has(name));
  const next = remaining.length ? pickRandom(remaining, source) : pickRandom(pool, source);
  used.add(next);
  return next;
}

function layoutAllowed(prototype: HousePrototype, allowedLayouts?: string[]) {
  return !allowedLayouts?.length || allowedLayouts.includes(prototype.layout);
}

function marketAllowed(prototype: HousePrototype, allowedMarketCellIds?: string[]) {
  return !allowedMarketCellIds?.length || allowedMarketCellIds.includes(prototype.marketCellId);
}

function scorePrototypeForRole(
  prototype: HousePrototype,
  role: CaseRole,
  blueprint: ScenarioBlueprint,
  world: WorldSpec,
) {
  const market = world.marketCells.find((entry) => entry.id === prototype.marketCellId);
  const focusBonus = blueprint.focusMarketCellIds?.includes(prototype.marketCellId) ? 10 : 0;
  const competitivePressure = market?.competitivePressure || 50;
  const demandHeat = market?.demandHeat || 50;
  const tagSet = new Set(prototype.tags);
  const defectSet = new Set(prototype.defects);

  let score = 10 + focusBonus;
  switch (role) {
    case 'anchor':
      score += prototype.marketPrice / 35 + prototype.area / 8;
      break;
    case 'traffic':
      score += demandHeat;
      if (tagSet.has('学区') || tagSet.has('总价友好')) {
        score += 18;
      }
      break;
    case 'fragile':
      score += defectSet.size * 9 + competitivePressure * 0.6;
      break;
    case 'grind':
      score += (100 - defectSet.size * 15) + (100 - competitivePressure) * 0.35;
      break;
    case 'spoiler':
      score += competitivePressure * 0.8 + (defectSet.has('竞品新') ? 18 : 0);
      break;
    case 'sacrifice':
      score += (100 - prototype.marketPrice / 18) + defectSet.size * 10;
      break;
  }

  return Math.max(1, Math.round(score));
}

function getRoleOwnerWeights(role: CaseRole, archetypes: OwnerArchetype[]) {
  return archetypes.map((archetype) => {
    let weight = 1;
    if (role === 'anchor') {
      weight = archetype.id === 'fair-value' ? 5 : archetype.id === 'game-player' ? 3 : 2;
    } else if (role === 'fragile') {
      weight = archetype.id === 'trial-balloon' ? 5 : archetype.id === 'anxious' ? 4 : 1;
    } else if (role === 'traffic') {
      weight = archetype.id === 'fair-value' ? 3 : archetype.id === 'anxious' ? 2 : 1;
    } else if (role === 'grind') {
      weight = archetype.id === 'fair-value' ? 5 : 1;
    } else if (role === 'spoiler') {
      weight = archetype.id === 'game-player' ? 5 : archetype.id === 'anxious' ? 2 : 1;
    } else if (role === 'sacrifice') {
      weight = archetype.id === 'trial-balloon' ? 4 : archetype.id === 'anxious' ? 3 : 1;
    }

    return { value: archetype, weight };
  });
}

function pickOwnerArchetype(
  role: CaseRole,
  blueprint: ScenarioBlueprint,
  source: RandomSource,
  world: WorldSpec,
  allowedOwnerArchetypeIds?: string[],
) {
  const candidates = world.ownerArchetypes
    .filter((archetype) => !allowedOwnerArchetypeIds?.length || allowedOwnerArchetypeIds.includes(archetype.id));
  const weighted = getRoleOwnerWeights(role, candidates.length ? candidates : world.ownerArchetypes);
  return pickWeighted(weighted, source).value;
}

function buildSlotSelections(
  blueprint: ScenarioBlueprint,
  world: WorldSpec,
  source: RandomSource,
) {
  const usedPrototypeIds = new Set<string>();
  const usedOwnerNames = new Set<string>();
  const usedMaintainerNames = new Set<string>();

  return blueprint.caseRoleSlots.map((slot) => {
    const candidates = world.housePrototypes
      .filter((prototype) => !usedPrototypeIds.has(prototype.id))
      .filter((prototype) => marketAllowed(prototype, slot.allowedMarketCellIds))
      .filter((prototype) => layoutAllowed(prototype, slot.allowedLayouts));

    if (!candidates.length) {
      throw new Error(`蓝图 ${blueprint.id} 没有可用房源可装配 slot=${slot.id}`);
    }

    const weighted = candidates.map((prototype) => ({
      value: prototype,
      weight: scorePrototypeForRole(prototype, slot.role, blueprint, world),
    })) satisfies CandidateOption<HousePrototype>[];

    const prototype = pickWeighted(weighted, source).value;
    usedPrototypeIds.add(prototype.id);

    const ownerArchetype = pickOwnerArchetype(
      slot.role,
      blueprint,
      source,
      world,
      slot.allowedOwnerArchetypeIds,
    );

    return {
      slotId: slot.id,
      role: slot.role,
      prototype,
      ownerArchetype,
      ownerName: takeUniqueName(OWNER_NAMES, usedOwnerNames, source),
      maintainerName: takeUniqueName(MAINTAINER_NAMES, usedMaintainerNames, source),
    } satisfies SelectedSlot;
  });
}

function applyWindowBias(base: number, pressure: 'wide' | 'normal' | 'tight', source: RandomSource) {
  const modifier = pressure === 'wide'
    ? randomInt(2, 4, source)
    : pressure === 'tight'
      ? randomInt(-3, -1, source)
      : randomInt(-1, 1, source);
  return base + modifier;
}

function applyTrustBias(base: number, bias: 'stable' | 'normal' | 'fragile', source: RandomSource) {
  const modifier = bias === 'stable'
    ? randomInt(4, 8, source)
    : bias === 'fragile'
      ? randomInt(-8, -3, source)
      : randomInt(-2, 2, source);
  return base + modifier;
}

function applyHeatBias(base: number, bias: 'cold' | 'warm' | 'hot', source: RandomSource) {
  const modifier = bias === 'cold'
    ? randomInt(-10, -3, source)
    : bias === 'hot'
      ? randomInt(4, 10, source)
      : randomInt(-2, 4, source);
  return base + modifier;
}

function applyUrgencyBias(base: number, bias: 'low' | 'medium' | 'high', source: RandomSource) {
  const modifier = bias === 'low'
    ? randomInt(-10, -3, source)
    : bias === 'high'
      ? randomInt(5, 12, source)
      : randomInt(-2, 3, source);
  return base + modifier;
}

function resolveAskPrice(
  marketPrice: number,
  bottomPrice: number,
  position: 'below' | 'market' | 'premium',
  role: CaseRole,
  source: RandomSource,
) {
  let delta = 0;
  if (position === 'below') {
    delta = randomInt(-14, 4, source);
  } else if (position === 'premium') {
    delta = randomInt(16, 48, source);
  } else {
    delta = randomInt(2, 18, source);
  }

  if (role === 'sacrifice') {
    delta -= randomInt(3, 8, source);
  }

  return Math.max(bottomPrice + 8, Math.round(marketPrice + delta));
}

function resolveBottomPrice(baseBottomPrice: number, source: RandomSource) {
  return Math.max(0, Math.round(baseBottomPrice + randomInt(-8, 6, source)));
}

function buildOwnerMood(role: CaseRole, ownerArchetype: OwnerArchetype, prototype: HousePrototype) {
  if (role === 'anchor') {
    return `希望你给出清晰方案，别浪费 ${prototype.community} 的窗口`;
  }
  if (role === 'fragile') {
    return ownerArchetype.id === 'trial-balloon' ? '再拖几天就想撤盘' : '窗口很紧，动作慢一点就焦虑';
  }
  if (role === 'traffic') {
    return '更在意来访和热度有没有被做出来';
  }
  if (role === 'grind') {
    return '不急着乱动，但只接受有依据的推进';
  }
  if (role === 'spoiler') {
    return '会被竞品和消息牵着走';
  }

  return '一旦局面不顺，很快就会想止损';
}

function deriveGoalTier(role: CaseRole): 'core' | 'important' | 'normal' {
  if (role === 'anchor') {
    return 'core';
  }
  if (role === 'fragile' || role === 'spoiler') {
    return 'important';
  }
  return 'normal';
}

function buildScenarioCase(
  selection: SelectedSlot,
  slot: ScenarioBlueprint['caseRoleSlots'][number],
  profile: DifficultyProfile,
  source: RandomSource,
) {
  const baseWindow = normalizeRangePick(profile.windowDaysRange.min, profile.windowDaysRange.max, source);
  const targetWindow = clamp(applyWindowBias(baseWindow, slot.windowPressure, source), 4, 16);

  const baseTrust = normalizeRangePick(profile.initialTrustRange.min, profile.initialTrustRange.max, source);
  const targetTrust = clamp(applyTrustBias(baseTrust, slot.trustBias, source), 38, 78);

  const basePatience = normalizeRangePick(profile.initialPatienceRange.min, profile.initialPatienceRange.max, source);
  const targetPatience = clamp(
    slot.trustBias === 'fragile' ? basePatience - randomInt(2, 6, source) : basePatience,
    28,
    78,
  );

  const baseHeat = normalizeRangePick(profile.initialHeatRange.min, profile.initialHeatRange.max, source);
  const targetHeat = clamp(applyHeatBias(baseHeat, slot.heatBias, source), 35, 78);

  const baseUrgency = normalizeRangePick(profile.initialUrgencyRange.min, profile.initialUrgencyRange.max, source);
  const targetUrgency = clamp(applyUrgencyBias(baseUrgency, slot.urgencyBias, source), 42, 92);

  const bottomPrice = resolveBottomPrice(selection.prototype.bottomPrice, source);
  const askPrice = resolveAskPrice(selection.prototype.marketPrice, bottomPrice, slot.pricePosition, selection.role, source);

  return {
    id: `case-${selection.slotId}-${selection.prototype.id}`,
    housePrototypeId: selection.prototype.id,
    ownerArchetypeId: selection.ownerArchetype.id,
    ownerName: selection.ownerName,
    ownerMood: buildOwnerMood(selection.role, selection.ownerArchetype, selection.prototype),
    maintainerName: selection.maintainerName,
    askPrice,
    bottomPrice: Math.min(bottomPrice, askPrice - 8),
    initialTrust: targetTrust,
    initialPatience: clamp(targetPatience - selection.ownerArchetype.patienceDelta, 28, 80),
    initialHeat: targetHeat,
    initialUrgency: clamp(targetUrgency - selection.ownerArchetype.urgencyGrowthBonus, 40, 90),
    windowDays: targetWindow,
    goalTier: deriveGoalTier(selection.role),
  } satisfies ScenarioCase;
}

function buildGoalContext(profile: DifficultyProfile, blueprint: ScenarioBlueprint): GeneratedGoalContext {
  const abilityPressure = Math.min(
    95,
    Math.round(
      44
      + profile.generationDifficultyBand.min * 0.55
      + (blueprint.eventArcId === 'double_market_balance' || blueprint.eventArcId === 'cross_pressure' ? 8 : 0),
    ),
  );
  const defensePressure = Math.min(
    95,
    Math.round(
      42
      + profile.generationDifficultyBand.min * 0.48
      + (blueprint.competitionTopology === 'paired_pressure' || blueprint.competitionTopology === 'chain_clusters' ? 12 : 6),
    ),
  );
  const satisfactionPressure = Math.min(
    95,
    Math.round(
      40
      + profile.generationDifficultyBand.min * 0.42
      + (blueprint.eventArcId === 'relationship_recovery' ? 6 : 0)
      + (blueprint.eventArcId === 'window_squeeze' || blueprint.eventArcId === 'competition_collapse' ? 10 : 0),
    ),
  );

  const goalContext = defensePressure >= abilityPressure && defensePressure >= satisfactionPressure
    ? 'defense'
    : satisfactionPressure >= abilityPressure
      ? 'satisfaction'
      : 'ability';

  const targetScore = profile.playerTargetScore;
  const pass = Math.max(42, targetScore - 12);
  const strong = Math.min(94, targetScore + 12);
  const ace = Math.min(98, strong + 8);

  return {
    goalContext,
    targetScore,
    scoreThresholds: {
      pass,
      strong,
      ace,
    },
    boardPressureProfile: {
      abilityPressure,
      defensePressure,
      satisfactionPressure,
    },
  };
}

function groupNameFromMarket(world: WorldSpec, marketCellId: string, suffix: string) {
  const market = world.marketCells.find((entry) => entry.id === marketCellId);
  const base = market?.name.split('|')[0]?.trim() || marketCellId;
  return `${base}${suffix}`;
}

function buildCompetitionGroups(
  blueprint: ScenarioBlueprint,
  world: WorldSpec,
  cases: ScenarioCase[],
  assignments: GeneratedRoleAssignment[],
  source: RandomSource,
) {
  const casesByMarket = new Map<string, ScenarioCase[]>();
  for (const entry of cases) {
    const assignment = assignments.find((candidate) => candidate.caseId === entry.id);
    const marketCellId = assignment?.marketCellId || world.housePrototypes.find((prototype) => prototype.id === entry.housePrototypeId)?.marketCellId;
    if (!marketCellId) {
      continue;
    }
    const current = casesByMarket.get(marketCellId) || [];
    current.push(entry);
    casesByMarket.set(marketCellId, current);
  }

  const groups: CompetitionGroup[] = [];
  if (blueprint.competitionTopology === 'paired_pressure') {
    for (const [marketCellId, marketCases] of casesByMarket.entries()) {
      if (marketCases.length < 2) {
        continue;
      }
      const sorted = [...marketCases].sort((left, right) => left.askPrice - right.askPrice);
      const members = sorted.slice(0, Math.min(3, sorted.length)).map((entry) => entry.id);
      groups.push({
        id: `group-${marketCellId}-paired`,
        name: groupNameFromMarket(world, marketCellId, '对冲组'),
        members,
        priceElasticity: 0.92 + nextRandom(source) * 0.24,
        customerSpillover: 0.4 + nextRandom(source) * 0.16,
      });
    }
    return groups;
  }

  for (const [marketCellId, marketCases] of casesByMarket.entries()) {
    if (marketCases.length < 2) {
      continue;
    }
    const strong = blueprint.competitionTopology === 'chain_clusters';
    groups.push({
      id: `group-${marketCellId}-${strong ? 'chain' : 'cluster'}`,
      name: groupNameFromMarket(world, marketCellId, strong ? '强耦合组' : '联动组'),
      members: marketCases.map((entry) => entry.id),
      priceElasticity: strong ? 1.08 + nextRandom(source) * 0.25 : 0.86 + nextRandom(source) * 0.22,
      customerSpillover: strong ? 0.56 + nextRandom(source) * 0.12 : 0.38 + nextRandom(source) * 0.16,
    });
  }

  return groups;
}

function buildShadowMarketConfig(
  profile: DifficultyProfile,
  world: WorldSpec,
  cases: ScenarioCase[],
  source: RandomSource,
) {
  const difficultyIndex = ['warmup', 'easy', 'standard', 'advanced', 'hard', 'extreme'].indexOf(profile.id);
  const pressureLevel = Math.max(0, difficultyIndex);
  const storeCount = clamp(profile.id === 'warmup' ? 1 : profile.id === 'easy' ? 1 : 2 + Math.floor(pressureLevel / 2), 1, 4);
  const listingCount = clamp(
    profile.id === 'warmup' || profile.id === 'easy'
      ? 0
      : profile.id === 'standard'
        ? 1
        : 1 + Math.floor(pressureLevel / 2),
    0,
    4,
  );
  const stores: RivalStore[] = (world.rivalStoreArchetypes || [])
    .slice(0, storeCount)
    .map((entry, index) => ({
      ...entry,
      id: `${entry.id}-${profile.id}-${index + 1}`,
      activityHeat: clamp(24 + pressureLevel * 9 + randomInt(-4, 6, source), 12, 92),
    }));

  const archetypes = world.rivalListingArchetypes || [];
  const listings: RivalListing[] = [];
  for (let index = 0; index < listingCount; index += 1) {
    const targetCase = cases[randomInt(0, cases.length - 1, source)];
    const prototype = world.housePrototypes.find((entry) => entry.id === targetCase.housePrototypeId);
    const archetype = archetypes[randomInt(0, Math.max(0, archetypes.length - 1), source)];
    const store = stores[randomInt(0, Math.max(0, stores.length - 1), source)];
    if (!prototype || !archetype || !store) continue;
    listings.push({
      id: `seed-rival-${profile.id}-${index + 1}`,
      storeId: store.id,
      title: `${prototype.district} ${archetype.titlePrefix}`,
      district: prototype.district,
      marketCellId: prototype.marketCellId,
      segment: archetype.segment,
      askPrice: Math.round(prototype.marketPrice * (1 + randomInt(-3, 3, source) / 100)),
      heat: clamp(archetype.baseHeat + pressureLevel * 2 + randomInt(-5, 6, source), 20, 96),
      freshness: clamp(archetype.freshness + randomInt(-8, 8, source), 0, 100),
      storyStrength: clamp(archetype.storyStrength + randomInt(-6, 8, source), 0, 100),
      leadSiphonPower: clamp(archetype.leadSiphonPower + pressureLevel * 2, 0, 100),
      ownerAnchorPower: clamp(archetype.ownerAnchorPower + pressureLevel * 2, 0, 100),
      status: 'active',
      daysLeft: randomInt(7, 12, source),
      source: 'seed',
    });
  }

  const dailyEventPool: WeightedDailyEventRef[] = [
    { templateId: 'shadow-demand-signal', weight: profile.id === 'warmup' ? 5 : 3 },
    { templateId: 'shadow-customer-return', weight: profile.id === 'warmup' ? 3 : 2 },
    { templateId: 'shadow-rival-inflow', weight: pressureLevel >= 2 ? 3 + pressureLevel : 1 },
    { templateId: 'shadow-company-squeeze', weight: pressureLevel >= 2 ? 2 + pressureLevel : 1 },
    { templateId: 'shadow-seller-referral', weight: pressureLevel >= 3 ? 2 : 1 },
  ];

  return {
    initialRivalStores: stores,
    initialRivalListings: listings,
    dailyEventPool,
    companyPressureProfile: {
      sharedLeadPressure: clamp(20 + pressureLevel * 9, 10, 78),
      focusSlotPressure: clamp(16 + pressureLevel * 8, 8, 74),
      internalReferralChance: clamp(0.13 - pressureLevel * 0.012, 0.04, 0.18),
      internalCompetitionHeat: clamp(20 + pressureLevel * 10, 10, 86),
    },
  };
}

function getFirstAssignmentByRole(assignments: GeneratedRoleAssignment[], role: CaseRole) {
  return assignments.find((assignment) => assignment.role === role);
}

function eventDay(maxDay: number, anchor: number, source: RandomSource) {
  return clamp(anchor + randomInt(-1, 1, source), 2, Math.max(2, maxDay - 1));
}

function buildScriptedEvents(
  blueprint: ScenarioBlueprint,
  world: WorldSpec,
  scenarioCases: ScenarioCase[],
  assignments: GeneratedRoleAssignment[],
  maxDay: number,
  source: RandomSource,
) {
  const anchor = getFirstAssignmentByRole(assignments, 'anchor');
  const fragile = getFirstAssignmentByRole(assignments, 'fragile') || anchor;
  const traffic = getFirstAssignmentByRole(assignments, 'traffic') || anchor;
  const spoiler = getFirstAssignmentByRole(assignments, 'spoiler') || fragile || anchor;
  const sacrifice = getFirstAssignmentByRole(assignments, 'sacrifice') || fragile || spoiler || anchor;
  const secondaryMarketCellId = assignments.find((assignment) => assignment.marketCellId !== anchor?.marketCellId)?.marketCellId || fragile?.marketCellId || anchor?.marketCellId;

  const events: ScriptedEvent[] = [];
  if (blueprint.eventArcId === 'relationship_recovery') {
    if (fragile) {
      const targetCase = scenarioCases.find((entry) => entry.id === fragile.caseId);
      events.push({
        id: 'event-generated-1',
        day: eventDay(maxDay, 4, source),
        actor: '业主朋友圈',
        title: '同类盘回暖',
        message: `${targetCase?.ownerName || '业主'}看到同类房源有成交进展，愿意多听你一点节奏建议。`,
        tone: 'success',
        targetCaseId: fragile.caseId,
        trustDelta: 5,
        urgencyDelta: -3,
      });
    }
    if (traffic) {
      events.push({
        id: 'event-generated-2',
        day: eventDay(maxDay, 8, source),
        actor: '活动预热',
        title: '周末预约升温',
        message: `${groupNameFromMarket(world, traffic.marketCellId, '')}的来访开始回暖，适合把带看节奏往前提。`,
        tone: 'success',
        targetMarketCellId: traffic.marketCellId,
        demandHeatDelta: 6,
        sentimentDelta: 4,
      });
    }
  } else if (blueprint.eventArcId === 'weekend_burst') {
    if (traffic) {
      events.push({
        id: 'event-generated-1',
        day: eventDay(maxDay, 5, source),
        actor: '活动邀约',
        title: '圈层邀约成功',
        message: '开放日前的邀约开始起量，一批更匹配的客户被提前唤醒。',
        tone: 'success',
        targetMarketCellId: traffic.marketCellId,
        demandHeatDelta: 7,
        sentimentDelta: 4,
      });
    }
    if (anchor) {
      const targetCase = scenarioCases.find((entry) => entry.id === anchor.caseId);
      events.push({
        id: 'event-generated-2',
        day: eventDay(maxDay, 9, source),
        actor: '业主家庭',
        title: '配合节奏确认',
        message: `${targetCase?.ownerName || '业主'}确认了接下来两周的安排，愿意多给你一点操作窗口。`,
        tone: 'success',
        targetCaseId: anchor.caseId,
        trustDelta: 4,
        windowDaysDelta: 2,
      });
    }
  } else if (blueprint.eventArcId === 'double_market_balance') {
    if (fragile) {
      events.push({
        id: 'event-generated-1',
        day: eventDay(maxDay, 5, source),
        actor: '业主家庭',
        title: '耐心下滑',
        message: '家里开始追问推进节奏，关系型成本被提前抬上来。',
        tone: 'danger',
        targetCaseId: fragile.caseId,
        trustDelta: -7,
        urgencyDelta: 5,
      });
    }
    if (anchor) {
      events.push({
        id: 'event-generated-2',
        day: eventDay(maxDay, 8, source),
        actor: '市场',
        title: '带看窗口回暖',
        message: '改善型客户的关注度回升，让优质盘更容易接到下一阶段。',
        tone: 'success',
        targetMarketCellId: anchor.marketCellId,
        demandHeatDelta: 8,
        sentimentDelta: 5,
      });
    }
    if (spoiler) {
      events.push({
        id: 'event-generated-3',
        day: eventDay(maxDay, 12, source),
        actor: '竞品',
        title: '同组盘跳价',
        message: '竞品突然改了说法，把买家心里的参考价又往下拽了一截。',
        tone: 'danger',
        targetMarketCellId: spoiler.marketCellId,
        competitionPressureDelta: 10,
        sentimentDelta: -4,
      });
    }
  } else if (blueprint.eventArcId === 'cross_pressure') {
    if (fragile) {
      events.push({
        id: 'event-generated-1',
        day: eventDay(maxDay, 6, source),
        actor: '业主家庭',
        title: '信任波动',
        message: '业主开始怀疑你是不是把注意力分散到了别的盘上。',
        tone: 'danger',
        targetCaseId: fragile.caseId,
        trustDelta: -8,
        urgencyDelta: 4,
      });
    }
    if (anchor) {
      events.push({
        id: 'event-generated-2',
        day: eventDay(maxDay, 10, source),
        actor: '宏观',
        title: '需求侧抬头',
        message: '有一批改善客重新开始看盘，优质房源的出手机会被放大。',
        tone: 'success',
        targetMarketCellId: anchor.marketCellId,
        demandHeatDelta: 7,
        sentimentDelta: 5,
      });
    }
    if (spoiler) {
      events.push({
        id: 'event-generated-3',
        day: eventDay(maxDay, 13, source),
        actor: '竞品',
        title: '参考价下移',
        message: '板块里的竞品重新改口，让你解释价格这件事一下子变难了。',
        tone: 'danger',
        targetMarketCellId: spoiler.marketCellId,
        competitionPressureDelta: 11,
        sentimentDelta: -5,
      });
    }
  } else if (blueprint.eventArcId === 'window_squeeze') {
    if (fragile) {
      const targetCase = scenarioCases.find((entry) => entry.id === fragile.caseId);
      events.push({
        id: 'event-generated-1',
        day: eventDay(maxDay, 4, source),
        actor: '家里催促',
        title: '窗口收紧',
        message: `${targetCase?.ownerName || '业主'}突然把成交期限往前提了一截。`,
        tone: 'danger',
        targetCaseId: fragile.caseId,
        urgencyDelta: 7,
        windowDaysDelta: -2,
      });
    }
    events.push({
      id: 'event-generated-2',
      day: eventDay(maxDay, 9, source),
      actor: '宏观',
      title: '买方观望',
      message: '整批客户开始等更明确的价格信号，中段推进明显变慢。',
      tone: 'danger',
      confidenceDelta: -9,
    });
    if (anchor) {
      events.push({
        id: 'event-generated-3',
        day: eventDay(maxDay, 12, source),
        actor: '竞品',
        title: '参考价再压低',
        message: '同组竞品重新拉低了参考价，让强推更容易伤到整组房。',
        tone: 'danger',
        targetMarketCellId: anchor.marketCellId,
        competitionPressureDelta: 12,
        sentimentDelta: -6,
      });
    }
  } else if (blueprint.eventArcId === 'competition_collapse') {
    if (anchor) {
      events.push({
        id: 'event-generated-1',
        day: eventDay(maxDay, 5, source),
        actor: '竞品',
        title: '极限跳价',
        message: '板块竞品突然改价，把整组盘的价格预期一起往下拖。',
        tone: 'danger',
        targetMarketCellId: anchor.marketCellId,
        competitionPressureDelta: 15,
        sentimentDelta: -8,
      });
    }
    if (sacrifice) {
      events.push({
        id: 'event-generated-2',
        day: eventDay(maxDay, 9, source),
        actor: '业主家庭',
        title: '关系危机',
        message: '业主开始质疑你是不是没有把这套盘真正当重点。',
        tone: 'danger',
        targetCaseId: sacrifice.caseId,
        trustDelta: -9,
        urgencyDelta: 5,
      });
    }
    if (secondaryMarketCellId) {
      events.push({
        id: 'event-generated-3',
        day: eventDay(maxDay, 13, source),
        actor: '市场',
        title: '热度退潮',
        message: '拖延成本开始显性化，晚一步解释就会更难成交。',
        tone: 'danger',
        targetMarketCellId: secondaryMarketCellId,
        demandHeatDelta: -6,
        sentimentDelta: -5,
      });
    }
  }

  return events;
}

function buildRandomEventPool(profile: DifficultyProfile, blueprint: ScenarioBlueprint) {
  const templateIds = ['school-boom', 'policy-shift', 'competitor-cut'];
  return templateIds.map((templateId) => ({
    templateId,
    weight: Math.max(1, (profile.randomEventWeights[templateId] || 1) + (blueprint.randomEventWeightBias?.[templateId] || 0)),
  }));
}

export function assembleGeneratedScenario(request: ScenarioGenerationRequest) {
  const generationVersion = request.generationVersion || 'v1';
  const source = buildRandomSource(request.seed);
  const world = request.world ? structuredClone(request.world) : null;
  if (!world) {
    throw new Error('assembleGeneratedScenario 需要明确传入 world。');
  }

  const profile = getDifficultyProfile(request.difficultyId);
  const blueprint = pickBlueprint(profile, source);
  const selections = buildSlotSelections(blueprint, world, source);

  const maxDay = normalizeRangePick(profile.maxDayRange.min, profile.maxDayRange.max, source);
  const startMonth = pickRandom(profile.startMonthPool, source);
  const startDay = normalizeRangePick(profile.startDayRange.min, profile.startDayRange.max, source);

  const scenarioCases = selections.map((selection, index) => {
    const slot = blueprint.caseRoleSlots[index];
    return buildScenarioCase(selection, slot, profile, source);
  });

  const assignments: GeneratedRoleAssignment[] = selections.map((selection, index) => ({
    slotId: selection.slotId,
    role: selection.role,
    goalTier: deriveGoalTier(selection.role),
    caseId: scenarioCases[index].id,
    housePrototypeId: selection.prototype.id,
    ownerArchetypeId: selection.ownerArchetype.id,
    marketCellId: selection.prototype.marketCellId,
    layout: selection.prototype.layout,
  }));

  const competitionGroups = buildCompetitionGroups(blueprint, world, scenarioCases, assignments, source);
  const scriptedEvents = buildScriptedEvents(blueprint, world, scenarioCases, assignments, maxDay, source);
  const presentation = buildScenarioPresentation(blueprint, scenarioCases.length, scriptedEvents.length, source);
  const goalContext = buildGoalContext(profile, blueprint);
  const shadowMarketConfig = buildShadowMarketConfig(profile, world, scenarioCases, source);

  const scenario: ScenarioDefinition = {
    id: `generated-${generationVersion}-${request.difficultyId}-${blueprint.id}-${request.seed}`,
    worldId: world.id,
    worldVersion: world.version,
    difficultyId: request.difficultyId,
    name: presentation.name,
    theme: presentation.theme,
    description: presentation.description,
    startMonth,
    startDay,
    maxDay,
    cases: scenarioCases,
    competitionGroups,
    scriptedEvents,
    randomEventPool: buildRandomEventPool(profile, blueprint),
    initialRivalStores: shadowMarketConfig.initialRivalStores,
    initialRivalListings: shadowMarketConfig.initialRivalListings,
    dailyEventPool: shadowMarketConfig.dailyEventPool,
    companyPressureProfile: shadowMarketConfig.companyPressureProfile,
    goalContext: goalContext.goalContext,
    targetScore: goalContext.targetScore,
    scoreThresholds: goalContext.scoreThresholds,
    boardPressureProfile: goalContext.boardPressureProfile,
    rules: {
      ...profile.ruleAdjustments,
      ...blueprint.ruleAdjustments,
      maxDay,
    },
    published: true,
  };

  return {
    scenario,
    blueprint,
    profile,
    assignments,
  };
}
