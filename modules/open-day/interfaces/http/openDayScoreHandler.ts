import type { OpenDayScoreCommand } from '../../domain/openDay.types.js';
import { getOpenDayAnalysisService } from '../../infrastructure/openDayPlatform.js';

const analysisService = getOpenDayAnalysisService();

function normalizeBody(body: unknown): OpenDayScoreCommand {
  if (!body || typeof body !== 'object') {
    throw new Error('请求体不能为空。');
  }

  const candidate = body as Partial<OpenDayScoreCommand>;
  const rows = Array.isArray(candidate.rows) ? candidate.rows : [];
  const datasetId = typeof candidate.datasetId === 'string' ? candidate.datasetId : '';

  if (!rows.length && !datasetId) {
    throw new Error('至少需要一行数据才能开始测算。请先上传数据文件。');
  }

  const mappings = candidate.mappings;

  if (!mappings || typeof mappings !== 'object') {
    throw new Error('缺少字段映射信息。');
  }

  const mappingRecord = mappings as unknown as Record<string, unknown>;

  return {
    rows: rows.map((row) => {
      if (!row || typeof row !== 'object') {
        return {};
      }

      return Object.fromEntries(
        Object.entries(row as Record<string, unknown>).map(([key, value]) => [key, String(value ?? '')]),
      );
    }),
    mappings: {
      area: typeof mappingRecord.area === 'string' ? mappingRecord.area : '',
      name: typeof mappingRecord.name === 'string' ? mappingRecord.name : '',
      inventory:
        typeof mappingRecord.inventory === 'string'
          ? mappingRecord.inventory
          : '',
      traffic:
        typeof mappingRecord.traffic === 'string'
          ? mappingRecord.traffic
          : '',
      transactions:
        typeof mappingRecord.transactions === 'string'
          ? mappingRecord.transactions
          : '',
      premium:
        typeof mappingRecord.premium === 'string'
          ? mappingRecord.premium
          : '',
    },
    config: candidate.config,
    scenario: candidate.scenario,
    sourceName: typeof candidate.sourceName === 'string' ? candidate.sourceName : '',
    sourceUploadId: typeof candidate.sourceUploadId === 'string' ? candidate.sourceUploadId : '',
    datasetId: typeof candidate.datasetId === 'string' ? candidate.datasetId : '',
    activeSheet: typeof candidate.activeSheet === 'string' ? candidate.activeSheet : '',
    headers: Array.isArray(candidate.headers)
      ? candidate.headers.map((header) => String(header ?? ''))
      : [],
    qualityReport: candidate.qualityReport,
    activeScenarioTemplateId:
      typeof candidate.activeScenarioTemplateId === 'string' ? candidate.activeScenarioTemplateId : '',
    activeScenarioTemplateName:
      typeof candidate.activeScenarioTemplateName === 'string' ? candidate.activeScenarioTemplateName : '',
    activeScenarioTemplateVersionId:
      typeof candidate.activeScenarioTemplateVersionId === 'string' ? candidate.activeScenarioTemplateVersionId : '',
    activePresetId: typeof candidate.activePresetId === 'string' ? candidate.activePresetId : '',
    activeParameterPackageId:
      typeof candidate.activeParameterPackageId === 'string'
        ? candidate.activeParameterPackageId
        : typeof candidate.activePresetId === 'string'
          ? candidate.activePresetId
          : '',
  };
}

export async function handleOpenDayScore(body: unknown) {
  const command = normalizeBody(body);
  return analysisService.execute(command);
}
