import type {
  DifficultyId,
  DifficultyOption,
  GameState,
  GoalTier,
  MarketCell,
  ScenarioOpeningRef,
  ScenarioSnapshot,
  ScenarioSummary,
} from '../domain/models.js';
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
  priceLabel: string;
  ownerStateLabel: string;
  customerLabel: string;
  tags: string[];
}

export interface ScenarioOpeningBriefing {
  dateLabel: string;
  marketTitle: string;
  marketDetail: string;
  marketTags: string[];
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
  const marketTitle = marketCells.length
    ? marketCells.map((entry) => entry.name).join(' / ')
    : opening.snapshot.world.name;
  const averageDemandHeat = average(marketCells.map((entry) => entry.demandHeat));
  const averageCompetitivePressure = average(marketCells.map((entry) => entry.competitivePressure));
  const averageSentiment = average(marketCells.map((entry) => entry.sentiment));
  const visibleOpportunities = state.opportunities.filter((entry) => entry.visibility !== 'shadow');
  const urgentCases = state.cases.filter((entry) => entry.windowDays <= 7 || entry.urgency >= 76);
  const fragileOwners = state.cases.filter((entry) => entry.trust <= 58 || entry.patience <= 45);

  return {
    dateLabel: buildOpeningDateLabel(opening.snapshot),
    marketTitle,
    marketDetail: [
      `客户热度${demandHeatLabel(averageDemandHeat)}`,
      `同类房竞争${pressureLabel(averageCompetitivePressure)}`,
      `市场情绪${sentimentLabel(averageSentiment)}`,
    ].join(' · '),
    marketTags: [
      `${scenario.competitionGroups.length} 组同类房竞争`,
      `${scenario.scriptedEvents.length} 个已知节点`,
      `${scenario.initialRivalListings?.length || 0} 套竞品在场`,
    ],
    scaleLabel: `${scenario.cases.length} 套房 · ${scenario.maxDay} 天`,
    ownerCountLabel: `${state.cases.length} 位业主，${urgentCases.length} 位时间较紧`,
    customerCountLabel: `${state.customers.length} 位潜在客户，${visibleOpportunities.length} 条线索已浮出`,
    competitionLabel: fragileOwners.length > 0
      ? `${fragileOwners.length} 位业主信任或耐心偏低`
      : '业主关系暂时稳住',
    cases: state.cases.map((caseItem) => {
      const opportunities = state.opportunities.filter((entry) => entry.caseId === caseItem.id && entry.status === 'active');
      const bestOpportunity = [...opportunities].sort((left, right) =>
        (right.stageIndex * 100 + right.intent) - (left.stageIndex * 100 + left.intent),
      )[0];
      return {
        id: caseItem.id,
        title: caseItem.title,
        ownerName: caseItem.ownerName,
        ownerMood: caseItem.ownerMood,
        stageLabel: caseItem.stageLabel,
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

function buildOpeningDateLabel(snapshot: ScenarioSnapshot) {
  const month = Math.max(1, Math.min(12, snapshot.scenario.startMonth));
  const day = Math.max(1, Math.min(28, snapshot.scenario.startDay));
  const date = new Date(Date.UTC(2026, month - 1, day));
  return `${month}月${day}日 ${WEEKDAY_LABELS[date.getUTCDay()]}`;
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

function goalTierLabel(goalTier: GoalTier | undefined) {
  if (goalTier === 'core') return '重点盯';
  if (goalTier === 'important') return '要跟紧';
  return '正常推进';
}
