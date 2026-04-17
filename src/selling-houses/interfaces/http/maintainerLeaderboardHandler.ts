import { getMaintainerRunRepository } from '../../infrastructure/sellingHousesPlatform.js';

const repository = getMaintainerRunRepository();

export async function handleMaintainerLeaderboardList(query: Record<string, unknown>) {
  const seasonId = typeof query.seasonId === 'string' && query.seasonId.trim() ? query.seasonId.trim() : 'season-1';
  const limit = typeof query.limit === 'string' ? Number(query.limit) : 10;

  return {
    seasonId,
    entries: await repository.listLeaderboard(seasonId, Number.isFinite(limit) ? limit : 10),
  };
}
