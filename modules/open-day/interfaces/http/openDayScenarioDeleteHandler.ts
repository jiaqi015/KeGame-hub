import { getOpenDayScenarioService } from '../../infrastructure/openDayPlatform.js';

const scenarioService = getOpenDayScenarioService();

export async function handleOpenDayScenarioDelete(query: unknown) {
  const candidate = (query || {}) as { id?: string | string[] };
  const rawId = Array.isArray(candidate.id) ? candidate.id[0] : candidate.id;
  return scenarioService.deleteById(typeof rawId === 'string' ? rawId : '');
}
