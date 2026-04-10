import { getOpenDaySnapshotService } from '../../infrastructure/openDayPlatform.js';

const snapshotService = getOpenDaySnapshotService();

export async function handleOpenDaySnapshotList(query: { limit?: string | string[] | undefined; scenarioId?: string | string[] | undefined }) {
  const rawLimit = Array.isArray(query.limit) ? query.limit[0] : query.limit;
  const rawScenarioId = Array.isArray(query.scenarioId) ? query.scenarioId[0] : query.scenarioId;
  const limit = typeof rawLimit === 'string' ? Number(rawLimit) : undefined;
  return snapshotService.listRecent(limit, {
    scenarioTemplateId: typeof rawScenarioId === 'string' ? rawScenarioId : '',
  });
}
