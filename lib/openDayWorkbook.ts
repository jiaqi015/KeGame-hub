import type { OpenDayUploadArtifactSummary } from '../modules/open-day/domain/openDay.types.js';
import { read, utils } from 'xlsx';

export interface ParsedWorkbookPayload {
  dataset?: import('../modules/open-day/domain/openDay.types.js').OpenDayDatasetSummary;
  activeSheet: string;
  headers: string[];
  rows: Record<string, string>[];
  sheets: string[];
  uploadArtifact?: OpenDayUploadArtifactSummary;
  uploadWarning?: string;
}

function normalizeCellValue(value: unknown) {
  if (value == null) {
    return '';
  }

  return String(value).trim();
}

function countNonEmpty(values: unknown[]) {
  return values.reduce<number>((total, value) => total + (normalizeCellValue(value) ? 1 : 0), 0);
}

function findHeaderRow(grid: (string | number | null)[][]) {
  let bestIndex = 0;
  let bestScore = -1;

  grid.slice(0, 10).forEach((row, index) => {
    const score = countNonEmpty(row);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestIndex;
}

function normalizeHeaders(values: unknown[]) {
  const headers: string[] = [];

  values.forEach((value, index) => {
    const normalized = normalizeCellValue(value);

    if (!normalized && headers.length) {
      return;
    }

    headers.push(normalized || `列${index + 1}`);
  });

  return headers;
}

const PREFERRED_SHEETS = ['0331', '3月版本积分排名', '0228'];

const FIELD_ALIASES = {
  area: ['大区', '区域', '商圈', '片区', 'area'],
  name: ['小区名称', '楼盘名', '楼盘名称', '小区', '名称', 'community', 'name'],
  inventory: ['库存在售房源量', '在售房源量', '在售套数', '在售', 'inventory', '挂牌', 'sale'],
  traffic: ['带看量（房源ID+带看ID）', '带看量', '流量', 'traffic', 'view'],
  transactions: ['成交量', '交易量', '签约量', 'transaction', 'deal'],
  premium: ['库存好房量', '好房量', '好房数', '精品房源量', '好房', 'premium'],
} as const;

type WorkbookFieldKey = keyof typeof FIELD_ALIASES;

interface ParsedSheetData {
  sheetName: string;
  headers: string[];
  rows: Record<string, string>[];
  fieldHeaders: Partial<Record<WorkbookFieldKey, string>>;
  dataScore: number;
}

function normalizeComparableText(value: unknown) {
  return normalizeCellValue(value).toLowerCase().replace(/\s+/g, '');
}

function findHeaderForField(headers: string[], key: WorkbookFieldKey) {
  const aliases = FIELD_ALIASES[key].map(normalizeComparableText);
  const normalizedHeaders = headers.map((header) => ({
    original: header,
    comparable: normalizeComparableText(header),
  }));

  for (const alias of aliases) {
    const exact = normalizedHeaders.find((header) => header.comparable === alias);
    if (exact) return exact.original;
  }

  for (const alias of aliases) {
    const partial = normalizedHeaders.find((header) =>
      header.comparable.includes(alias) || alias.includes(header.comparable),
    );
    if (partial) return partial.original;
  }

  return '';
}

function parseSheetData(workbook: ReturnType<typeof read>, sheetName: string): ParsedSheetData {
  const sheet = workbook.Sheets[sheetName];

  if (!sheet) {
    throw new Error('未找到指定的工作表。');
  }

  const grid = utils.sheet_to_json<(string | number | null)[]>(sheet, {
    header: 1,
    raw: false,
    defval: '',
    blankrows: false,
  });

  const headerRowIndex = findHeaderRow(grid);
  const headerRow = Array.isArray(grid[headerRowIndex]) ? grid[headerRowIndex] : [];
  const headers = normalizeHeaders(headerRow);
  const rows = grid
    .slice(headerRowIndex + 1)
    .filter((row) => Array.isArray(row) && row.some((value) => normalizeCellValue(value)))
    .map((row) => {
      const entry: Record<string, string> = {};
      headers.forEach((header, index) => {
        entry[header] = normalizeCellValue(row[index] ?? '');
      });
      return entry;
    });

  const fieldHeaders = (Object.keys(FIELD_ALIASES) as WorkbookFieldKey[]).reduce<Partial<Record<WorkbookFieldKey, string>>>(
    (result, key) => {
      const header = findHeaderForField(headers, key);
      if (header) result[key] = header;
      return result;
    },
    {},
  );
  const dataScore = ['name', 'inventory', 'traffic', 'transactions', 'premium']
    .reduce((score, key) => score + (fieldHeaders[key as WorkbookFieldKey] ? 1 : 0), 0);

  return {
    sheetName,
    headers,
    rows,
    fieldHeaders,
    dataScore,
  };
}

function pickPrimarySheet(parsedSheets: ParsedSheetData[], requestedSheet: string) {
  const requested = requestedSheet
    ? parsedSheets.find((sheet) => sheet.sheetName === requestedSheet)
    : undefined;

  if (requested && requested.dataScore >= 3) {
    return requested;
  }

  const preferred = PREFERRED_SHEETS
    .map((sheetName) => parsedSheets.find((sheet) => sheet.sheetName === sheetName))
    .find((sheet): sheet is ParsedSheetData => Boolean(sheet && sheet.dataScore >= 3));

  if (preferred) {
    return preferred;
  }

  return [...parsedSheets].sort((left, right) => {
    if (right.dataScore !== left.dataScore) return right.dataScore - left.dataScore;
    return right.rows.length - left.rows.length;
  })[0];
}

function buildLookup(sheet: ParsedSheetData) {
  const nameHeader = sheet.fieldHeaders.name;
  const lookup = new Map<string, Record<string, string>>();

  if (!nameHeader) {
    return lookup;
  }

  sheet.rows.forEach((row) => {
    const key = normalizeComparableText(row[nameHeader]);
    if (key && !lookup.has(key)) {
      lookup.set(key, row);
    }
  });

  return lookup;
}

function mergeAuxiliarySheets(primarySheet: ParsedSheetData, parsedSheets: ParsedSheetData[]) {
  const primaryNameHeader = primarySheet.fieldHeaders.name;
  const headers = [...primarySheet.headers];
  const rows = primarySheet.rows.map((row) => ({ ...row }));

  if (!primaryNameHeader) {
    return { headers, rows, mergedSheetCount: 0 };
  }

  let mergedSheetCount = 0;

  parsedSheets
    .filter((sheet) => sheet.sheetName !== primarySheet.sheetName && sheet.fieldHeaders.name)
    .forEach((sheet) => {
      const lookup = buildLookup(sheet);
      const extraHeaders = sheet.headers.filter((header) => (
        header !== sheet.fieldHeaders.name && !headers.includes(header)
      ));

      if (!extraHeaders.length || !lookup.size) {
        return;
      }

      let matchedRows = 0;
      rows.forEach((row) => {
        const matched = lookup.get(normalizeComparableText(row[primaryNameHeader]));
        if (!matched) return;

        matchedRows += 1;
        extraHeaders.forEach((header) => {
          row[header] = matched[header] ?? '';
        });
      });

      if (!matchedRows) {
        return;
      }

      extraHeaders.forEach((header) => headers.push(header));
      mergedSheetCount += 1;
    });

  return { headers, rows, mergedSheetCount };
}

export function parseWorkbookBuffer(buffer: Buffer, requestedSheet = ''): ParsedWorkbookPayload {
  const workbook = read(buffer, { type: 'buffer', cellDates: false, raw: false });
  const sheets = workbook.SheetNames;

  if (!sheets.length) {
    throw new Error('Excel 文件中没有可读取的工作表。');
  }

  const parsedSheets = sheets.map((sheetName) => parseSheetData(workbook, sheetName));
  const primarySheet = pickPrimarySheet(parsedSheets, requestedSheet);
  const { headers, rows, mergedSheetCount } = mergeAuxiliarySheets(primarySheet, parsedSheets);
  const activeSheet = mergedSheetCount
    ? `${primarySheet.sheetName} + ${mergedSheetCount} 个辅助表`
    : primarySheet.sheetName;

  return {
    activeSheet,
    headers,
    rows,
    sheets,
  };
}
