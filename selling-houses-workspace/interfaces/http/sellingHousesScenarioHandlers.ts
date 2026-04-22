import type { DifficultyId } from '../../domain/models.js';
import { listBuiltInScenarioSummaries, getScenarioSnapshotById } from '../../domain/scenarioCatalog.js';
import {
  getSellingHousesScenarioRepository,
  hasSellingHousesDatabaseConfig,
} from '../../infrastructure/sellingHousesPlatform.js';

const repository = getSellingHousesScenarioRepository();

export async function handleSellingHousesScenarioList(query: Record<string, unknown>) {
  const difficulty = typeof query.difficulty === 'string' ? query.difficulty.trim() : undefined;
  const limit = typeof query.limit === 'string' ? Number(query.limit) : 24;

  if (!hasSellingHousesDatabaseConfig()) {
    return {
      scenarios: listBuiltInScenarioSummaries(difficulty as DifficultyId | undefined).slice(0, limit),
    };
  }

  const scenarios = await repository.listPublished(difficulty, limit);
  return { scenarios };
}

export async function handleSellingHousesScenarioGet(query: Record<string, unknown>) {
  const scenarioId = typeof query.id === 'string' ? query.id.trim() : '';
  if (!scenarioId) {
    throw new Error('查询剧本时缺少 id。');
  }

  if (!hasSellingHousesDatabaseConfig()) {
    const snapshot = getScenarioSnapshotById(scenarioId);
    if (!snapshot) {
      throw new Error('未找到对应剧本。');
    }

    return {
      scenario: snapshot.scenario,
      world: snapshot.world,
    };
  }

  const payload = await repository.getScenario(scenarioId);
  if (!payload?.scenario || !payload?.world) {
    throw new Error('未找到对应剧本。');
  }

  return payload;
}
