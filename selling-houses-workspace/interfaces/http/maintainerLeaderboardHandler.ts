import { getMaintainerRunRepository } from '../../infrastructure/sellingHousesPlatform.js';

const repository = getMaintainerRunRepository();

function resolveLimit(query: Record<string, unknown>, fallback: number) {
  const raw = typeof query.limit === 'string' ? Number(query.limit) : fallback;
  return Number.isFinite(raw) ? raw : fallback;
}

export async function handleMaintainerLeaderboardList(query: Record<string, unknown>) {
  const seasonId = typeof query.seasonId === 'string' && query.seasonId.trim() ? query.seasonId.trim() : 'season-1';
  const limit = resolveLimit(query, 10);

  return {
    seasonId,
    entries: await repository.listLeaderboard(seasonId, limit),
  };
}

export async function handleMaintainerLeaderboardDetail(query: Record<string, unknown>) {
  const seasonId = typeof query.seasonId === 'string' && query.seasonId.trim() ? query.seasonId.trim() : 'season-1';
  const limit = resolveLimit(query, 20);

  return repository.getLeaderboardDetail(seasonId, limit);
}
