import type { ParsedWorkbookPayload } from '../../../lib/openDayWorkbook.js';

export interface OpenDayWorkbookParseCachePayload {
  activeSheet: ParsedWorkbookPayload['activeSheet'];
  headers: ParsedWorkbookPayload['headers'];
  rows: ParsedWorkbookPayload['rows'];
  sheets: ParsedWorkbookPayload['sheets'];
}

export interface OpenDayWorkbookParseCache {
  get(key: string): Promise<OpenDayWorkbookParseCachePayload | null>;
  set(key: string, value: OpenDayWorkbookParseCachePayload): Promise<void>;
}
