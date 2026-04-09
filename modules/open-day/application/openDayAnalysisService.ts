import type { OpenDayAnalysisResponse, OpenDayScoreCommand } from '../domain/openDay.types.js';
import { scoreOpenDayDataset } from '../domain/openDayScoringEngine.js';
import type { OpenDayAnalysisCache } from './openDayAnalysisCache.js';
import { createOpenDayHash } from './openDayFingerprint.js';
import type { OpenDaySnapshotRepository } from './openDaySnapshotRepository.js';

function createCacheKey(command: OpenDayScoreCommand): string {
  return createOpenDayHash(command, 'open-day');
}

export class OpenDayAnalysisService {
  constructor(
    private readonly cache: OpenDayAnalysisCache,
    private readonly snapshotRepository?: OpenDaySnapshotRepository,
  ) {}

  async execute(command: OpenDayScoreCommand): Promise<OpenDayAnalysisResponse> {
    const cacheKey = createCacheKey(command);
    const cached = this.cache.get(cacheKey);

    if (cached) {
      return {
        ...cached,
        meta: {
          ...cached.meta,
          cacheHit: true,
          cacheKey,
        },
      };
    }

    const computed = scoreOpenDayDataset(command);
    const configVersion = createOpenDayHash(computed.meta.requestedConfig, 'cfg');
    const response: OpenDayAnalysisResponse = {
      ...computed,
      meta: {
        ...computed.meta,
        cacheHit: false,
        cacheKey,
        configVersion,
      },
    };

    if (this.snapshotRepository) {
      const champion = response.results.find((row) => row.isEligible) || response.results[0];
      const snapshot = {
        summary: {
          id: createOpenDayHash(
            {
              cacheKey,
              createdAt: new Date().toISOString(),
            },
            'snapshot',
          ).replace(/^snapshot:/, ''),
          createdAt: new Date().toISOString(),
          sourceName: command.sourceName || '未命名数据集',
          presetId: command.activePresetId || null,
          parameterPackageId:
            response.meta.scenario.parameterPackageId || command.activeParameterPackageId || command.activePresetId || null,
          configVersion,
          waterlineSource: response.meta.waterlines.source,
          totalCount: response.meta.totalCount,
          eligibleCount: response.meta.eligibleCount,
          championName: champion?.name || '暂无',
          championScore: champion?.score || 0,
        },
        command,
        response,
      };

      try {
        await this.snapshotRepository.save(snapshot);
        response.meta.snapshotId = snapshot.summary.id;
        response.meta.snapshotCreatedAt = snapshot.summary.createdAt;
      } catch (error) {
        console.error('Failed to persist open-day snapshot:', error);
      }
    }

    this.cache.set(cacheKey, response);
    return response;
  }
}
