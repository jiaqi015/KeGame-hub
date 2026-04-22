import { getOpenDayScenarioService } from '../../infrastructure/openDayPlatform.js';

const scenarioService = getOpenDayScenarioService();

export async function handleOpenDayScenarioList(query: unknown) {
  const record = query && typeof query === 'object' ? (query as Record<string, unknown>) : {};
  const limit = Number(record.limit);
  return scenarioService.listRecent(Number.isFinite(limit) ? limit : 8);
}
