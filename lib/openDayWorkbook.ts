import { read, utils } from 'xlsx';

export interface ParsedWorkbookPayload {
  activeSheet: string;
  headers: string[];
  rows: Record<string, string>[];
  sheets: string[];
}

function normalizeCellValue(value: unknown) {
  if (value == null) {
    return '';
  }

  return String(value).trim();
}

function countNonEmpty(values: unknown[]) {
  return values.reduce((total, value) => total + (normalizeCellValue(value) ? 1 : 0), 0);
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

export function parseWorkbookBuffer(buffer: Buffer, requestedSheet = ''): ParsedWorkbookPayload {
  const workbook = read(buffer, { type: 'buffer', cellDates: false, raw: false });
  const sheets = workbook.SheetNames;

  if (!sheets.length) {
    throw new Error('Excel 文件中没有可读取的工作表。');
  }

  const activeSheet = requestedSheet && sheets.includes(requestedSheet)
    ? requestedSheet
    : PREFERRED_SHEETS.find((sheetName) => sheets.includes(sheetName)) || sheets[0];
  const sheet = workbook.Sheets[activeSheet];

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
  const width = headers.length;

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

  return {
    activeSheet,
    headers,
    rows,
    sheets,
  };
}
