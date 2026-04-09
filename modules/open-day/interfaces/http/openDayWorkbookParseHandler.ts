import type { ParsedWorkbookPayload } from '../../../../lib/openDayWorkbook.js';
import { getOpenDayWorkbookParseService } from '../../infrastructure/openDayPlatform.js';

const workbookParseService = getOpenDayWorkbookParseService();

export interface HandleOpenDayWorkbookParseCommand {
  buffer: Buffer;
  requestedSheet?: string;
  originalFilename?: string;
  contentType?: string;
  persistArtifact?: boolean;
}

export async function handleOpenDayWorkbookParse(
  command: HandleOpenDayWorkbookParseCommand,
): Promise<ParsedWorkbookPayload> {
  if (!Buffer.isBuffer(command.buffer) || command.buffer.byteLength === 0) {
    throw new Error('缺少可解析的 Excel 文件内容。');
  }

  return workbookParseService.execute({
    buffer: command.buffer,
    requestedSheet: typeof command.requestedSheet === 'string' ? command.requestedSheet : '',
    originalFilename:
      typeof command.originalFilename === 'string' && command.originalFilename.trim()
        ? command.originalFilename.trim()
        : '开放日工作簿.xlsx',
    contentType: typeof command.contentType === 'string' ? command.contentType : '',
    persistArtifact: command.persistArtifact !== false,
  });
}
