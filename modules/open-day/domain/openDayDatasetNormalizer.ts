import type { NormalizedOpenDayRow, OpenDayMappings, OpenDayRawRow } from './openDay.types.js';

function parseNumericValue(value: unknown): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }

  const text = String(value ?? '').trim().replace(/,/g, '');
  const lowered = text.toLowerCase();

  if (!text || ['null', 'nan', '#div/0!', '#value!', '--', '-'].includes(lowered)) {
    return 0;
  }

  if (text.endsWith('%')) {
    const numeric = Number(text.slice(0, -1));
    return Number.isFinite(numeric) ? numeric / 100 : 0;
  }

  const numeric = Number(text);
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

      return {
        area: mappings.area ? String(row[mappings.area] ?? '').trim() : '',
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
