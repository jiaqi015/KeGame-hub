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
    if (!command.persistArtifact || !this.uploadArtifactService) {
      return parseWorkbookBuffer(command.buffer, command.requestedSheet);
    }

    const [payloadResult, uploadResult] = await Promise.allSettled([
      Promise.resolve().then(() => parseWorkbookBuffer(command.buffer, command.requestedSheet)),
      this.uploadArtifactService.save({
        buffer: command.buffer,
        originalFilename: command.originalFilename,
        contentType: command.contentType,
      }),
    ]);

    if (payloadResult.status === 'rejected') {
      throw payloadResult.reason;
    }

    if (uploadResult.status === 'fulfilled') {
      return {
        ...payloadResult.value,
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
}
