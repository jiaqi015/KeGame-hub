import { parseWorkbookBuffer, type ParsedWorkbookPayload } from '../../../lib/openDayWorkbook.js';
import { OpenDayUploadArtifactService } from './openDayUploadArtifactService.js';

export interface ParseOpenDayWorkbookCommand {
  buffer: Buffer;
  requestedSheet?: string;
  originalFilename: string;
  contentType?: string;
  persistArtifact?: boolean;
}

export class OpenDayWorkbookParseService {
  constructor(private readonly uploadArtifactService?: OpenDayUploadArtifactService) {}

  async execute(command: ParseOpenDayWorkbookCommand): Promise<ParsedWorkbookPayload> {
    const payload = parseWorkbookBuffer(command.buffer, command.requestedSheet);

    if (!command.persistArtifact || !this.uploadArtifactService) {
      return payload;
    }

    try {
      const uploadArtifact = await this.uploadArtifactService.save({
        buffer: command.buffer,
        originalFilename: command.originalFilename,
        contentType: command.contentType,
      });

      return {
        ...payload,
        uploadArtifact,
      };
    } catch (error) {
      console.error('Failed to persist open-day upload artifact:', error);
      return {
        ...payload,
        uploadWarning: error instanceof Error ? error.message : '上传归档失败',
      };
    }
  }
}
