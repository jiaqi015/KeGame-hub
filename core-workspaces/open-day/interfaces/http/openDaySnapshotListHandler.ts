import { getOpenDaySnapshotService } from '../../infrastructure/openDayPlatform.js';

const snapshotService = getOpenDaySnapshotService();

export async function handleOpenDaySnapshotList(query: {
  limit?: string | string[] | undefined;
  scenarioId?: string | string[] | undefined;
  scenarioVersionId?: string | string[] | undefined;
  datasetId?: string | string[] | undefined;
  sourceUploadId?: string | string[] | undefined;
}) {
  const rawLimit = Array.isArray(query.limit) ? query.limit[0] : query.limit;
  const rawScenarioId = Array.isArray(query.scenarioId) ? query.scenarioId[0] : query.scenarioId;
  const rawScenarioVersionId = Array.isArray(query.scenarioVersionId) ? query.scenarioVersionId[0] : query.scenarioVersionId;
  const rawDatasetId = Array.isArray(query.datasetId) ? query.datasetId[0] : query.datasetId;
  const rawSourceUploadId = Array.isArray(query.sourceUploadId) ? query.sourceUploadId[0] : query.sourceUploadId;
  const limit = typeof rawLimit === 'string' ? Number(rawLimit) : undefined;
  return snapshotService.listRecent(limit, {
    scenarioTemplateId: typeof rawScenarioId === 'string' ? rawScenarioId : '',
    scenarioTemplateVersionId: typeof rawScenarioVersionId === 'string' ? rawScenarioVersionId : '',
    datasetId: typeof rawDatasetId === 'string' ? rawDatasetId : '',
    sourceUploadId: typeof rawSourceUploadId === 'string' ? rawSourceUploadId : '',
  });
}
