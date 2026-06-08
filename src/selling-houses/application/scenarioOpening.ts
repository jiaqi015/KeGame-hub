import type {
  DifficultyId,
  DifficultyOption,
  GameState,
  GoalTier,
  MarketCell,
  Opportunity,
  ScenarioOpeningRef,
  ScenarioSnapshot,
  ScenarioSummary,
  Case,
} from '../domain/models.js';
import { isOpportunityActiveByCanonicalState } from '../domain/opportunityLifecycleStatusRead.js';
import {
  generateScenarioSnapshot,
  getScenarioSnapshotById,
  listBuiltInScenarioSummaries,
} from '../domain/scenarioCatalog.js';
import { buildScenarioSummary } from '../domain/scenarioMetadata.js';
import { normalizeSeed } from '../domain/utils.js';
import { seedInitialOpportunities } from '../domain/engine.js';
import { updateDerivedState } from '../domain/runtimeState.js';
import { createInitialState } from './gameState.js';
import {
  fetchSellingHousesScenario,
  fetchSellingHousesScenarioCatalog,
} from '../infrastructure/cloudClient.js';

const MAX_SCENARIO_SEED = 2147483647;

export interface ScenarioOpening {
  openingRef: ScenarioOpeningRef;
  summary: ScenarioSummary;
  snapshot: ScenarioSnapshot;
  runSeed: number;
  scenarioSeed?: number;
}

export interface FeaturedScenarioPreview {
  difficultyId: DifficultyId;
  seed: number;
  scenario: ScenarioSummary;
}

export interface ScenarioOpeningBriefingCase {
  id: string;
  title: string;
  ownerName: string;
  ownerMood: string;
  stageLabel: string;
  roleLabel: string;
  storyLine: string;
  decisionHint: string;
  priceLabel: string;
  ownerStateLabel: string;
  customerLabel: string;
  tags: string[];
}

export interface ScenarioOpeningStory {
  deck: string;
  marketTitle: string;
  marketParagraphs: string[];
  evidenceLabels: string[];
}

export interface ScenarioOpeningBriefing {
  dateLabel: string;
  openingStory: ScenarioOpeningStory;
  marketTitle: string;
  marketDetail: string;
  marketTags: string[];
  worldScaleLabel: string;
  scaleLabel: string;
  ownerCountLabel: string;
  customerCountLabel: string;
  competitionLabel: string;
  cases: ScenarioOpeningBriefingCase[];
}

export interface ScenarioOpeningPreview extends ScenarioOpening {
  briefing: ScenarioOpeningBriefing;
}

export interface ScenarioOpeningCatalog {
  scenarios: ScenarioSummary[];
  featuredScenarios: FeaturedScenarioPreview[];
}

const WEEKDAY_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function hashScenarioIdToSeed(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return normalizeSeed(hash);
}

export function createGeneratedScenarioSeed(now: number) {
  return normalizeSeed(now % MAX_SCENARIO_SEED);
}

export function createRandomGeneratedOpeningRef(difficultyId: DifficultyId, seed: number): ScenarioOpeningRef {
  return {
    kind: 'generated',
    difficultyId,
    seed: normalizeSeed(seed),
    preset: 'random',
  };
}

export function buildGeneratedScenarioSummary(
  difficultyId: DifficultyId,
  seed: number,
  preset: 'standard' | 'random' = 'standard',
): ScenarioSummary {
  const snapshot = generateScenarioSnapshot({ difficultyId, seed });
  return {
    ...buildScenarioSummary(snapshot.scenario),
    id: snapshot.scenario.id,
    opening: {
      kind: 'generated',
      difficultyId,
      seed: normalizeSeed(seed),
      preset,
    },
  };
}

export function buildGeneratedScenarioOpeningPreview(
  difficultyId: DifficultyId,
  seed: number,
  preset: 'standard' | 'random' = 'standard',
): ScenarioOpeningPreview {
  const openingRef = preset === 'random'
    ? createRandomGeneratedOpeningRef(difficultyId, seed)
    : {
        kind: 'generated' as const,
        difficultyId,
        seed: normalizeSeed(seed),
        preset,
      };
  const summary = buildGeneratedScenarioSummary(difficultyId, seed, preset);
  const snapshot = generateScenarioSnapshot({ difficultyId, seed });
  const opening = {
    openingRef,
    summary,
    snapshot,
    scenarioSeed: normalizeSeed(seed),
    runSeed: normalizeSeed(seed),
  } satisfies ScenarioOpening;

  return {
    ...opening,
    briefing: buildScenarioOpeningBriefing(opening),
  };
}

export function buildFeaturedScenarioPreviews(
  difficultyOptions: Pick<DifficultyOption, 'id' | 'featuredSeed'>[],
): FeaturedScenarioPreview[] {
  return difficultyOptions.map((option) => ({
    difficultyId: option.id,
    seed: option.featuredSeed,
    scenario: buildGeneratedScenarioSummary(option.id, option.featuredSeed, 'standard'),
  }));
}

export function buildLocalScenarioOpeningCatalog(
  difficultyOptions: Pick<DifficultyOption, 'id' | 'featuredSeed'>[],
): ScenarioOpeningCatalog {
  const featuredScenarios = buildFeaturedScenarioPreviews(difficultyOptions);

  return {
    scenarios: [...featuredScenarios.map((entry) => entry.scenario), ...listBuiltInScenarioSummaries()],
    featuredScenarios,
  };
}

export async function loadScenarioOpeningCatalog(
  activationKey: string | undefined,
  difficultyOptions: Pick<DifficultyOption, 'id' | 'featuredSeed'>[],
): Promise<ScenarioOpeningCatalog> {
  const localCatalog = buildLocalScenarioOpeningCatalog(difficultyOptions);

  if (!activationKey) {
    return localCatalog;
  }

  const baseCatalog = await loadScenarioCatalog(activationKey);
  const featuredScenarios = localCatalog.featuredScenarios;
  const scenarios = [...featuredScenarios.map((entry) => entry.scenario), ...baseCatalog];

  return {
    scenarios,
    featuredScenarios,
  };
}

export async function loadScenarioCatalog(activationKey?: string) {
  if (!activationKey) {
    return listBuiltInScenarioSummaries();
  }

  try {
    const payload = await fetchSellingHousesScenarioCatalog(activationKey);
    if (Array.isArray(payload?.scenarios) && payload.scenarios.length > 0) {
      return payload.scenarios;
    }
  } catch (error) {
    console.warn('Failed to load scenario catalog from cloud:', error);
  }

  return listBuiltInScenarioSummaries();
}

async function loadScenarioSnapshot(activationKey: string | undefined, scenarioId: string) {
  if (activationKey) {
    try {
      const payload = await fetchSellingHousesScenario(activationKey, scenarioId);
      if (payload?.scenario?.id && payload?.world?.id) {
        return {
          source: 'cloud' as const,
          scenario: payload.scenario,
          world: payload.world,
        };
      }
    } catch (error) {
      console.warn('Failed to load scenario detail from cloud:', error);
    }
  }

  const snapshot = getScenarioSnapshotById(scenarioId);
  if (!snapshot) {
    throw new Error(`未找到剧本 ${scenarioId}`);
  }

  return snapshot;
}

async function resolveScenarioSummary(activationKey: string | undefined, openingRef: ScenarioOpeningRef) {
  if (openingRef.kind === 'generated') {
    return buildGeneratedScenarioSummary(openingRef.difficultyId, openingRef.seed, openingRef.preset);
  }

  const catalog = await loadScenarioCatalog(activationKey);
  return catalog.find((entry) => entry.opening.kind === 'scenario' && entry.opening.scenarioId === openingRef.scenarioId) || null;
}

async function loadOpeningSnapshot(activationKey: string | undefined, openingRef: ScenarioOpeningRef) {
  if (openingRef.kind === 'generated') {
    return generateScenarioSnapshot({
      difficultyId: openingRef.difficultyId,
      seed: openingRef.seed,
    });
  }

  return loadScenarioSnapshot(activationKey, openingRef.scenarioId);
}

export async function resolveScenarioOpening(params: {
  activationKey?: string;
  openingRef: ScenarioOpeningRef;
  runSeed?: number;
}) {
  const { activationKey, openingRef, runSeed } = params;
  const [summary, snapshot] = await Promise.all([
    resolveScenarioSummary(activationKey, openingRef),
    loadOpeningSnapshot(activationKey, openingRef),
  ]);

  if (!summary) {
    throw new Error('未找到剧本摘要');
  }

  const resolvedScenarioSeed = openingRef.kind === 'generated' ? openingRef.seed : undefined;
  return {
    openingRef,
    summary,
    snapshot,
    scenarioSeed: resolvedScenarioSeed,
    runSeed: normalizeSeed(
      runSeed
      ?? resolvedScenarioSeed
      ?? hashScenarioIdToSeed(openingRef.kind === 'scenario' ? openingRef.scenarioId : summary.id),
    ),
  } satisfies ScenarioOpening;
}

export function createStateFromScenarioOpening(opening: ScenarioOpening): GameState {
  const world = createInitialState(opening.snapshot, {
    runSeed: opening.runSeed,
    scenarioSeed: opening.scenarioSeed,
  });
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

export function buildScenarioOpeningBriefing(opening: ScenarioOpening): ScenarioOpeningBriefing {
  const state = createStateFromScenarioOpening(opening);
  const scenario = opening.snapshot.scenario;
  const marketCells = collectScenarioMarketCells(opening.snapshot);
  const marketNames = marketCells.map((entry) => entry.name);
  const averageDemandHeat = average(marketCells.map((entry) => entry.demandHeat));
  const averageCompetitivePressure = average(marketCells.map((entry) => entry.competitivePressure));
  const averageSentiment = average(marketCells.map((entry) => entry.sentiment));
  const visibleOpportunities = state.opportunities.filter((entry) => entry.visibility !== 'shadow');
  const urgentCases = state.cases.filter((entry) => entry.windowDays <= 7 || entry.urgency >= 76);
  const fragileOwners = state.cases.filter((entry) => entry.trust <= 58 || entry.patience <= 45);
  const marketCellCount = marketCells.length || opening.snapshot.world.marketCells.length;
  const worldScaleLabel = buildBigWorldScaleLabel(state)
    ?? `${scenario.cases.length} 套房 · ${marketCellCount} 个板块 · ${state.customers.length} 位潜在客户 · ${visibleOpportunities.length} 条线索`;
  const marketTitle = buildMarketStoryTitle(marketNames, averageDemandHeat, averageCompetitivePressure);
  const marketDetail = buildMarketStoryDetail(
    marketNames,
    averageDemandHeat,
    averageCompetitivePressure,
    averageSentiment,
    scenario.initialRivalListings?.length || 0,
  );

  return {
    dateLabel: buildOpeningDateLabel(opening.snapshot),
    openingStory: buildOpeningStory(
      state.cases,
      visibleOpportunities,
      urgentCases,
      fragileOwners,
      scenario.initialRivalListings?.length || 0,
      marketTitle,
      marketDetail,
      [
        `${scenario.competitionGroups.length} 组同类房竞争`,
        `${scenario.scriptedEvents.length} 个已知节点`,
        `${scenario.initialRivalListings?.length || 0} 套竞品在场`,
      ],
    ),
    marketTitle,
    marketDetail,
    marketTags: [
      `${scenario.competitionGroups.length} 组同类房竞争`,
      `${scenario.scriptedEvents.length} 个已知节点`,
      `${scenario.initialRivalListings?.length || 0} 套竞品在场`,
    ],
    worldScaleLabel,
    scaleLabel: `${scenario.cases.length} 套房 · ${scenario.maxDay} 天`,
    ownerCountLabel: `${state.cases.length} 位业主，${urgentCases.length} 位时间较紧`,
    customerCountLabel: `${state.customers.length} 位潜在客户，${visibleOpportunities.length} 条线索已浮出`,
    competitionLabel: fragileOwners.length > 0
      ? `${fragileOwners.length} 位业主信任或耐心偏低`
      : '业主关系暂时稳住',
    cases: state.cases.map((caseItem) => {
      const opportunities = state.opportunities.filter((entry) => entry.caseId === caseItem.id && isOpportunityActiveByCanonicalState(state, entry));
      const bestOpportunity = [...opportunities].sort((left, right) =>
        (right.stageIndex * 100 + right.intent) - (left.stageIndex * 100 + left.intent),
      )[0];
      return {
        id: caseItem.id,
        title: caseItem.title,
        ownerName: caseItem.ownerName,
        ownerMood: caseItem.ownerMood,
        stageLabel: caseItem.stageLabel,
        roleLabel: caseRoleLabel(caseItem),
        storyLine: caseStoryLine(caseItem, opportunities, bestOpportunity),
        decisionHint: caseDecisionHint(caseItem, opportunities, bestOpportunity),
        priceLabel: pricePositionLabel(caseItem.askPrice, caseItem.marketPrice),
        ownerStateLabel: [
          `信任${scoreBand(caseItem.trust)}`,
          `耐心${scoreBand(caseItem.patience)}`,
          `急迫${urgencyBand(caseItem.urgency)}`,
        ].join(' · '),
        customerLabel: bestOpportunity
          ? `${opportunities.length} 条线索，最高到${bestOpportunity.stageLabel}`
          : '暂无明确线索',
        tags: [
          goalTierLabel(caseItem.goalTier),
          `热度${scoreBand(caseItem.heat)}`,
          `可推进 ${caseItem.windowDays} 天`,
        ],
      } satisfies ScenarioOpeningBriefingCase;
    }),
  };
}

function buildOpeningStory(
  cases: Case[],
  visibleOpportunities: Opportunity[],
  urgentCases: Case[],
  fragileOwners: Case[],
  rivalCount: number,
  marketTitle: string,
  marketDetail: string,
  marketTags: string[],
): ScenarioOpeningStory {
  const priorityCases = [...cases]
    .sort((left, right) => openingPriorityScore(right) - openingPriorityScore(left))
    .slice(0, 2);
  const priorityCaseText = priorityCases.map((entry) => entry.title).join('、');
  const ownerClause = urgentCases.length > 0
    ? `${urgentCases.length} 位业主时间收紧`
    : `${cases.length} 位业主要你先定节奏`;
  const customerClause = visibleOpportunities.length > 0
    ? `${visibleOpportunities.length} 条客户线索已经浮出`
    : '客户需求还需要你今天拉出来';
  const riskClause = [
    fragileOwners.length > 0 ? `${fragileOwners.length} 位业主耐心偏低` : '',
    rivalCount > 0 ? `${rivalCount} 套竞品在场` : '',
  ].filter(Boolean).join('，');
  const compactDeck = priorityCaseText
    ? `${ownerClause}，${customerClause}${riskClause ? `，${riskClause}` : ''}。先看 ${priorityCaseText}。`
    : `${ownerClause}，${customerClause}${riskClause ? `，${riskClause}` : ''}。先排今天先后手。`;
  const priorityParagraph = priorityCaseText
    ? `先处理 ${priorityCaseText}；业主沟通、客户筛选、竞品说法按这个顺序排。`
    : `先把业主沟通、客户筛选和竞品说法排成顺序。`;

  return {
    deck: compactText(compactDeck, 70),
    marketTitle,
    marketParagraphs: [compactText(marketDetail, 80), priorityParagraph],
    evidenceLabels: marketTags,
  };
}

function compactText(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, Math.max(0, maxLength - 3))}...`
    : normalized;
}

function openingPriorityScore(caseItem: Case) {
  const timePressure = Math.max(0, 12 - caseItem.windowDays) * 7;
  const ownerRisk = Math.max(0, 62 - caseItem.trust) + Math.max(0, 54 - caseItem.patience);
  const pricingRisk = caseItem.askPrice > caseItem.marketPrice
    ? ((caseItem.askPrice - caseItem.marketPrice) / Math.max(caseItem.marketPrice, 1)) * 80
    : 0;
  const competitionPressure = caseItem.competitionGroupIds.length * 12;
  return caseItem.urgency + caseItem.heat * 0.45 + timePressure + ownerRisk + pricingRisk + competitionPressure;
}

function buildOpeningDateLabel(snapshot: ScenarioSnapshot) {
  const month = Math.max(1, Math.min(12, snapshot.scenario.startMonth));
  const day = Math.max(1, Math.min(28, snapshot.scenario.startDay));
  const date = new Date(Date.UTC(2026, month - 1, day));
  return `${month}月${day}日 ${WEEKDAY_LABELS[date.getUTCDay()]}`;
}

function buildMarketStoryTitle(marketNames: string[], demandHeat: number, pressure: number) {
  const names = marketNames.length
    ? marketNames.map((entry) => entry.split('|')[0]?.trim() || entry).join('、')
    : '这片市场';
  if (demandHeat >= 68 && pressure >= 58) return `${names}有人看，但好房也在互相抢客`;
  if (demandHeat >= 58) return `${names}需求还在，关键是把客户留到你手里`;
  if (pressure >= 68) return `${names}竞争变挤，每次跟进都要更准`;
  return `${names}节奏不算差，但需要你先把重点排出来`;
}

function buildMarketStoryDetail(
  marketNames: string[],
  demandHeat: number,
  pressure: number,
  sentiment: number,
  rivalCount: number,
) {
  const marketScope = marketNames.length > 1 ? `这 ${marketNames.length} 个板块` : '这个板块';
  const demandCopy = demandHeat >= 68
    ? '买家还愿意出来看房'
    : demandHeat >= 55
      ? '客户量够用，但不会自动成交'
      : '客户没有那么主动，需要你把需求拉出来';
  const pressureCopy = pressure >= 68
    ? '同类房源会频繁分流客户'
    : pressure >= 55
      ? '旁边也有房在争同一批人'
      : '竞品压力暂时可控';
  const sentimentCopy = sentiment >= 66
    ? '市场情绪偏暖，适合尽快制造确定性'
    : sentiment >= 48
      ? '市场情绪平稳，谁先把理由讲清楚谁更占先'
      : '市场情绪偏谨慎，业主和客户都需要更多证据';
  const rivalCopy = rivalCount > 0 ? `场上还有 ${rivalCount} 套竞品，不适合慢慢等。` : '目前竞品不多，但也别让线索冷掉。';
  return `${marketScope}的开局是：${demandCopy}，${pressureCopy}。${sentimentCopy}，${rivalCopy}`;
}

function buildBigWorldScaleLabel(state: GameState) {
  const summary = state.runContext.bigWorldBootstrapSummary;
  if (!summary) return null;
  return `${summary.totalListingCount} 套在场房源 · ${summary.marketCellCount} 个板块 · ${summary.totalDemandUnitCount} 位潜在客户 · ${summary.totalBrokerCount} 位经纪人`;
}

function collectScenarioMarketCells(snapshot: ScenarioSnapshot): MarketCell[] {
  const marketIds = new Set(
    snapshot.scenario.cases
      .map((caseItem) => snapshot.world.housePrototypes.find((prototype) => prototype.id === caseItem.housePrototypeId)?.marketCellId)
      .filter(Boolean),
  );
  return snapshot.world.marketCells.filter((entry) => marketIds.has(entry.id));
}

function average(values: number[]) {
  if (!values.length) return 50;
  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function demandHeatLabel(value: number) {
  if (value >= 70) return '偏热';
  if (value >= 55) return '正常';
  if (value >= 42) return '偏冷';
  return '很冷';
}

function pressureLabel(value: number) {
  if (value >= 72) return '很挤';
  if (value >= 58) return '偏紧';
  if (value >= 42) return '正常';
  return '宽松';
}

function sentimentLabel(value: number) {
  if (value >= 66) return '偏暖';
  if (value >= 48) return '平稳';
  return '偏弱';
}

function scoreBand(value: number) {
  if (value >= 70) return '高';
  if (value >= 55) return '中';
  if (value >= 42) return '偏低';
  return '低';
}

function urgencyBand(value: number) {
  if (value >= 78) return '很高';
  if (value >= 62) return '偏高';
  if (value >= 46) return '中';
  return '低';
}

function pricePositionLabel(askPrice: number, marketPrice: number) {
  const gapPct = ((askPrice - marketPrice) / Math.max(marketPrice, 1)) * 100;
  if (gapPct >= 5) return `高于常见价 ${Math.round(gapPct)}%`;
  if (gapPct >= 2) return `略高 ${Math.round(gapPct)}%`;
  if (gapPct <= -2) return `低于常见价 ${Math.abs(Math.round(gapPct))}%`;
  return '接近常见价';
}

function caseRoleLabel(caseItem: {
  goalTier: GoalTier;
  windowDays: number;
  urgency: number;
  trust: number;
  heat: number;
  competitionGroupIds: string[];
}) {
  if (caseItem.goalTier === 'core') return '主线房';
  if (caseItem.windowDays <= 7 || caseItem.urgency >= 78) return '限时房';
  if (caseItem.trust <= 55) return '关系房';
  if (caseItem.heat >= 68) return '机会房';
  if (caseItem.competitionGroupIds.length > 0) return '对冲房';
  return '稳盘房';
}

function caseStoryLine(
  caseItem: {
    ownerName: string;
    windowDays: number;
    urgency: number;
    trust: number;
    patience: number;
    heat: number;
    askPrice: number;
    marketPrice: number;
    competitionGroupIds: string[];
  },
  opportunities: { stageLabel: string; intent: number; confidence: number }[],
  bestOpportunity?: { stageLabel: string; intent: number; confidence: number },
) {
  if (caseItem.windowDays <= 7 || caseItem.urgency >= 78) {
    return `${caseItem.ownerName}的时间感很强，先别铺太散，今天要让对方看到明确推进。`;
  }
  if (caseItem.trust <= 55 || caseItem.patience <= 45) {
    return `${caseItem.ownerName}还在观望你靠不靠谱，先把预期和下一步讲清楚。`;
  }
  if (caseItem.askPrice >= caseItem.marketPrice * 1.05) {
    return '这套价格站得偏高，客户不是没有，但需要先准备好市场依据。';
  }
  if (opportunities.length >= 4 || caseItem.heat >= 68) {
    return bestOpportunity
      ? `线索已经热起来了，最好的客户走到${bestOpportunity.stageLabel}，适合趁热推进。`
      : '线索已经热起来了，适合尽快筛出最有诚意的客户。';
  }
  if (caseItem.competitionGroupIds.length > 0) {
    return '它和同板块房源会互相抢客户，卖点和节奏不能跟别人长得一样。';
  }
  return `${caseItem.ownerName}目前还算稳，适合用稳定触达慢慢把确定性做出来。`;
}

function caseDecisionHint(
  caseItem: {
    windowDays: number;
    urgency: number;
    trust: number;
    patience: number;
    heat: number;
    askPrice: number;
    marketPrice: number;
    competitionGroupIds: string[];
  },
  opportunities: { stageLabel: string; intent: number; confidence: number }[],
  bestOpportunity?: { stageLabel: string; intent: number; confidence: number },
) {
  if (caseItem.windowDays <= 7 || caseItem.urgency >= 78) return '优先安排面访或带看，别让窗口继续变窄。';
  if (caseItem.trust <= 55 || caseItem.patience <= 45) return '先补一次业主沟通，把合作边界稳住。';
  if (caseItem.askPrice >= caseItem.marketPrice * 1.05) return '先准备调价依据，再决定要不要加推广。';
  if (bestOpportunity && bestOpportunity.intent >= 70) return `把${bestOpportunity.stageLabel}客户往下一步推。`;
  if (opportunities.length >= 3 || caseItem.heat >= 68) return '先筛客户质量，别平均用力。';
  if (caseItem.competitionGroupIds.length > 0) return '先做差异化卖点，避免被同类房截走。';
  return '保持跟进节奏，等更明确的线索冒头。';
}

function goalTierLabel(goalTier: GoalTier | undefined) {
  if (goalTier === 'core') return '重点盯';
  if (goalTier === 'important') return '要跟紧';
  return '正常推进';
}
