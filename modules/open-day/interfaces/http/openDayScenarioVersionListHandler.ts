import { getOpenDayScenarioService } from '../../infrastructure/openDayPlatform.js';

const scenarioService = getOpenDayScenarioService();

export async function handleOpenDayScenarioVersionList(query: unknown) {
  const record = query && typeof query === 'object' ? (query as Record<string, unknown>) : {};
  const templateId =
    typeof record.templateId === 'string'
      ? record.templateId
      : typeof record.id === 'string'
        ? record.id
        : '';
  const limit = Number(record.limit);
  return scenarioService.listVersions(templateId, Number.isFinite(limit) ? limit : 20);
}
