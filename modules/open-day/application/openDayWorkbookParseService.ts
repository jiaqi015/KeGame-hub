import { createHash } from 'node:crypto';
import { parseWorkbookBuffer, type ParsedWorkbookPayload } from '../../../lib/openDayWorkbook.js';
import { createOpenDayHash } from './openDayFingerprint.js';
import type { OpenDayWorkbookParseCache, OpenDayWorkbookParseCachePayload } from './openDayWorkbookParseCache.js';
import { OpenDayUploadArtifactService } from './openDayUploadArtifactService.js';
import { OpenDayDatasetService } from './openDayDatasetService.js';

const WORKBOOK_PARSER_VERSION = 'multi-sheet-v2';

export interface ParseOpenDayWorkbookCommand {
  buffer: Buffer;
  requestedSheet?: string;
  originalFilename: string;
  contentType?: string;
  persistArtifact?: boolean;
}

export class OpenDayWorkbookParseService {
  constructor(
    private readonly cache?: OpenDayWorkbookParseCache,
    private readonly uploadArtifactService?: OpenDayUploadArtifactService,
    private readonly datasetService?: OpenDayDatasetService,
  ) {}

  async execute(command: ParseOpenDayWorkbookCommand): Promise<ParsedWorkbookPayload> {
    const checksumSha256 = createHash('sha256').update(command.buffer).digest('hex');
    const cacheKey = createOpenDayHash(
      {
        checksumSha256,
        requestedSheet: command.requestedSheet || '',
        parserVersion: WORKBOOK_PARSER_VERSION,
      },
      'open-day-workbook',
    );

    const cached = await this.cache?.get(cacheKey);
    const parsePromise = cached
      ? Promise.resolve<OpenDayWorkbookParseCachePayload>(cached)
      : Promise.resolve().then(() => {
          const payload = parseWorkbookBuffer(command.buffer, command.requestedSheet);
          const nextPayload: OpenDayWorkbookParseCachePayload = {
            activeSheet: payload.activeSheet,
            headers: payload.headers,
            rows: payload.rows,
            sheets: payload.sheets,
          };
          return nextPayload;
        });

    if (!command.persistArtifact || !this.uploadArtifactService) {
      const payload = await parsePromise;
      if (!cached) {
        await this.cache?.set(cacheKey, payload);
      }

      return payload;
    }

    const [payloadResult, uploadResult] = await Promise.allSettled([
      parsePromise,
      this.uploadArtifactService.save({
        buffer: command.buffer,
        originalFilename: command.originalFilename,
        contentType: command.contentType,
        checksumSha256,
      }),
    ]);

    if (payloadResult.status === 'rejected') {
      throw payloadResult.reason;
    }

    if (!cached) {
      await this.cache?.set(cacheKey, payloadResult.value);
    }

    if (uploadResult.status === 'fulfilled') {
      const dataset = await this.persistDataset({
        sourceUploadId: uploadResult.value.id,
        sourceName: command.originalFilename,
        sheetName: payloadResult.value.activeSheet,
        headers: payloadResult.value.headers,
        rows: payloadResult.value.rows,
      });
      return {
        ...payloadResult.value,
        dataset,
        uploadArtifact: uploadResult.value,
      };
    }

    console.error('Failed to persist open-day upload artifact:', uploadResult.reason);
    return {
      ...payloadResult.value,
      uploadWarning:
        uploadResult.reason instanceof Error ? uploadResult.reason.message : '上传归档失败',
    };
  }

  private async persistDataset(command: Parameters<OpenDayDatasetService['persistDataset']>[0]) {
    if (!this.datasetService) {
      return undefined;
    }

    try {
      return await this.datasetService.persistDataset(command);
    } catch (error) {
      console.error('Failed to persist open-day dataset:', error);
      return undefined;
    }
  }
}
