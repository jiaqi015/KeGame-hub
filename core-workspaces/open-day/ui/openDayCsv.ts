import type { OpenDayRawRow } from '../domain/openDay.types.ts';

export interface ParsedCsvPayload {
  headers: string[];
  rows: OpenDayRawRow[];
}

function splitCsvLine(line: string) {
  const items: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      items.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  items.push(current);
  return items;
}

export function parseCsv(text: string): ParsedCsvPayload {
  const lines = text.trim().split(/\r?\n/).filter(Boolean);
  if (!lines.length) {
    return { headers: [], rows: [] };
  }

  const grid = lines.map(splitCsvLine);
  const headers = grid[0].map((value) => value.trim());

  return {
    headers,
    rows: grid.slice(1).map((values) => {
      const row: OpenDayRawRow = {};
      headers.forEach((header, index) => {
        row[header] = (values[index] ?? '').trim();
      });
      return row;
    }),
  };
}
