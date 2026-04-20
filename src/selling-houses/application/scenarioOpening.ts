import type {
  DifficultyId,
  DifficultyOption,
  GameState,
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

export interface ScenarioOpeningCatalog {
  scenarios: ScenarioSummary[];
  featuredScenarios: FeaturedScenarioPreview[];
}

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

export function buildFeaturedScenarioPreviews(
  difficultyOptions: Pick<DifficultyOption, 'id' | 'featuredSeed'>[],
): FeaturedScenarioPreview[] {
  return difficultyOptions.map((option) => ({
    difficultyId: option.id,
    seed: option.featuredSeed,
    scenario: buildGeneratedScenarioSummary(option.id, option.featuredSeed, 'standard'),
  }));
}

export async function loadScenarioOpeningCatalog(
  activationKey: string | undefined,
  difficultyOptions: Pick<DifficultyOption, 'id' | 'featuredSeed'>[],
): Promise<ScenarioOpeningCatalog> {
  const baseCatalog = await loadScenarioCatalog(activationKey);
  const featuredScenarios = buildFeaturedScenarioPreviews(difficultyOptions);
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
