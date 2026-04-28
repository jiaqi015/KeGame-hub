import type { NormalizedOpenDayRow, OpenDayMappings, OpenDayRawRow } from './openDay.types.js';

const UNKNOWN_OPEN_DAY_AREA = '未知大区';

function parseNumericValue(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const raw = String(value ?? '').trim().replace(/,/g, '');
  if (!raw) return 0;

  const lowered = raw.toLowerCase();
  if (['null', 'nan', '#div/0!', '#value!', '--', '-'].includes(lowered)) {
    return 0;
  }

  // Handle percentage separately - remove extra chars but keep the number
  if (raw.endsWith('%')) {
    const cleanText = raw.replace(/[^\d.-]/g, '');
    const numeric = parseFloat(cleanText);
    return Number.isFinite(numeric) ? numeric / 100 : 0;
  }

  // General number extraction: keep digits, decimal point, and leading minus
  // This allows "100组" -> 100, "￥1,234.56" -> 1234.56
  const cleanText = raw.replace(/[^\d.-]/g, '');
  const numeric = parseFloat(cleanText);
  return Number.isFinite(numeric) ? numeric : 0;
}

export function validateMappings(mappings: Partial<OpenDayMappings>): asserts mappings is OpenDayMappings {
  const required = ['name', 'inventory', 'traffic', 'transactions', 'premium'] as const;
  const missing = required.filter((key) => !mappings[key]);

  if (missing.length > 0) {
    throw new Error(`缺少必要字段映射：${missing.join('、')}`);
  }
}

export function normalizeOpenDayRows(
  rows: OpenDayRawRow[],
  mappings: OpenDayMappings,
): NormalizedOpenDayRow[] {
  return rows
    .map((row) => {
      const traffic = parseNumericValue(row[mappings.traffic]);
      const transactions = parseNumericValue(row[mappings.transactions]);
      const convRate = traffic > 0 ? transactions / traffic : 0;
      const area = mappings.area ? String(row[mappings.area] ?? '').trim() : '';

      return {
        area: area || UNKNOWN_OPEN_DAY_AREA,
        name: String(row[mappings.name] ?? '').trim(),
        inventory: parseNumericValue(row[mappings.inventory]),
        traffic,
        transactions,
        premium: parseNumericValue(row[mappings.premium]),
        convRate,
      };
    })
    .filter((row) => row.name);
}
