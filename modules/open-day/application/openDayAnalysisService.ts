import type { OpenDayAnalysisResponse, OpenDayScoreCommand } from '../domain/openDay.types.js';
import { scoreOpenDayDataset } from '../domain/openDayScoringEngine.js';
import type { OpenDayAnalysisCache } from './openDayAnalysisCache.js';
import { OpenDayDatasetService } from './openDayDatasetService.js';
import { createOpenDayHash } from './openDayFingerprint.js';
import type { OpenDaySnapshotRepository } from './openDaySnapshotRepository.js';
import type { OpenDayDatasetRepository } from './openDayDatasetRepository.js';

const MAX_ROWS_IN_REQUEST = 50000;

function createCacheKey(command: OpenDayScoreCommand): string {
  const hashInput: Record<string, unknown> = {
    mappings: command.mappings,
    config: command.config,
    scenario: command.scenario,
    activePresetId: command.activePresetId,
    activeParameterPackageId: command.activeParameterPackageId,
  };

  if (command.datasetId) {
    hashInput['datasetId'] = command.datasetId;
  } else {
    hashInput['rows'] = command.rows;
  }

  return createOpenDayHash(hashInput, 'open-day');
}

function stripRunMeta(response: OpenDayAnalysisResponse): OpenDayAnalysisResponse {
  const { runId, runCreatedAt, snapshotId, snapshotCreatedAt, datasetId, datasetProfileId, ...meta } = response.meta;
  return {
    ...response,
    meta,
  };
}

export class OpenDayAnalysisService {
  constructor(
    private readonly cache: OpenDayAnalysisCache,
    private readonly snapshotRepository?: OpenDaySnapshotRepository,
    private readonly datasetService?: OpenDayDatasetService,
    private readonly datasetRepository?: OpenDayDatasetRepository,
  ) {}

  async execute(command: OpenDayScoreCommand): Promise<OpenDayAnalysisResponse> {
    if (!command.datasetId && command.rows.length > MAX_ROWS_IN_REQUEST) {
      throw new Error(`单次请求数据量超过上限（${MAX_ROWS_IN_REQUEST} 行）。请先上传文件后再测算。`);
    }

    if (command.datasetId && command.rows.length === 0 && this.datasetRepository) {
      const fetched = await this.datasetRepository.getDatasetRows(command.datasetId);
      if (fetched) {
        command = { ...command, rows: fetched.rows };
      }
    }
    const cacheKey = createCacheKey(command);
    const cached = await this.cache.get(cacheKey);
    const cachedBase = cached ? stripRunMeta(cached) : null;
    const baseResponse = cached
      ? {
          ...cachedBase,
          meta: {
            ...cachedBase.meta,
            cacheHit: true,
            cacheKey,
          },
        }
      : (() => {
          const computed = scoreOpenDayDataset(command);
          const configVersion = createOpenDayHash(computed.meta.requestedConfig, 'cfg');
          return {
            ...computed,
            meta: {
              ...computed.meta,
              cacheHit: false,
              cacheKey,
              configVersion,
            },
          } satisfies OpenDayAnalysisResponse;
        })();

    if (!cached) {
      await this.cache.set(cacheKey, stripRunMeta(baseResponse));
    }

    if (!this.snapshotRepository) {
      return baseResponse;
    }

    const createdAt = new Date().toISOString();
    const datasetProfile = await this.persistDatasetProfile(command);
    const champion = baseResponse.results.find((row) => row.isEligible) || baseResponse.results[0];
    const runId = createOpenDayHash(
      {
        cacheKey,
        createdAt,
      },
      'run',
    ).replace(/^run:/, '');
    const snapshot = {
      summary: {
        id: runId,
        createdAt,
        sourceName: command.sourceName || '未命名数据集',
        sourceUploadId: command.sourceUploadId || null,
        datasetId: datasetProfile?.datasetId || command.datasetId || null,
        datasetProfileId: datasetProfile?.id || null,
        scenarioTemplateId: command.activeScenarioTemplateId || null,
        scenarioTemplateName: command.activeScenarioTemplateName || null,
        scenarioTemplateVersionId: command.activeScenarioTemplateVersionId || null,
        presetId: command.activePresetId || null,
        parameterPackageId:
          baseResponse.meta.scenario.parameterPackageId || command.activeParameterPackageId || command.activePresetId || null,
        configVersion: baseResponse.meta.configVersion,
        waterlineSource: baseResponse.meta.waterlines.source,
        totalCount: baseResponse.meta.totalCount,
        eligibleCount: baseResponse.meta.eligibleCount,
        championName: champion?.name || '暂无',
        championScore: champion?.score || 0,
      },
      command,
      response: baseResponse,
    };

    try {
      await this.snapshotRepository.save(snapshot);
      return {
        ...baseResponse,
        meta: {
          ...baseResponse.meta,
          runId,
          runCreatedAt: createdAt,
          snapshotId: runId,
          snapshotCreatedAt: createdAt,
          datasetId: snapshot.summary.datasetId,
          datasetProfileId: snapshot.summary.datasetProfileId,
        },
      };
    } catch (error) {
      console.error('Failed to persist open-day analysis run:', error);
      return baseResponse;
    }
  }

  private async persistDatasetProfile(command: OpenDayScoreCommand) {
    if (!this.datasetService) {
      return null;
    }

    try {
      return await this.datasetService.persistDatasetProfile({
        datasetId: command.datasetId,
        sourceUploadId: command.sourceUploadId || null,
        sourceName: command.sourceName || '未命名数据集',
        sheetName: command.activeSheet || '',
        headers: command.headers,
        rows: command.rows,
        mappings: command.mappings,
        qualityReport: command.qualityReport || null,
      });
    } catch (error) {
      console.error('Failed to persist open-day dataset profile:', error);
      return null;
    }
  }
}
