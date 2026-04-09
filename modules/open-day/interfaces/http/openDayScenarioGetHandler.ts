import { getOpenDayScenarioService } from '../../infrastructure/openDayPlatform.js';

const scenarioService = getOpenDayScenarioService();

export async function handleOpenDayScenarioGet(query: unknown) {
  const record = query && typeof query === 'object' ? (query as Record<string, unknown>) : {};
  const id = typeof record.id === 'string' ? record.id : '';
  return scenarioService.getById(id);
}
