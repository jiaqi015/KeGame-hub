import { NeonGameRunRepository } from '../../infrastructure/neonGameRunRepository.js';

const repository = new NeonGameRunRepository();

export async function handleMaintainerLeaderboardList(query: Record<string, unknown>) {
  const seasonId = typeof query.seasonId === 'string' && query.seasonId.trim() ? query.seasonId.trim() : 'season-1';
  const limit = typeof query.limit === 'string' ? Number(query.limit) : 10;

  return {
    seasonId,
    entries: await repository.listLeaderboard(seasonId, Number.isFinite(limit) ? limit : 10),
  };
}
