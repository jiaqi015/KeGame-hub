import type { OpenDayRawRow } from '../../modules/open-day/domain/openDay.types.ts';

export const OPEN_DAY_SAMPLE_HEADERS = ['大区', '小区名称', '在售套数', '带看量', '成交量', '好房数'] as const;
export const OPEN_DAY_SMALL_SAMPLE_SIZE = 15;
export const OPEN_DAY_LARGE_SAMPLE_SIZE = 10000;

const sampleAreas = ['学院大区', '团结湖大区', '五道口大区', '望京北大区', '朝阳公园大区', '前滩大区'];
const sampleNameRoots = [
  '今典花园',
  '慈云寺',
  '展春园',
  '首开金茂望京樾',
  '北太平庄路院',
  '东洲家园',
  '八家嘉园',
  '阳光上东',
  '滨河花园',
  '京达国际公寓',
];

function padSampleIndex(index: number) {
  return String(index + 1).padStart(5, '0');
}

function createSampleRow(index: number): OpenDayRawRow {
  const inventory = 6 + ((index * 17 + 13) % 96);
  const traffic = 8 + ((index * 37 + 41) % 1180);
  const transactions = Math.min(traffic, Math.floor(traffic * (0.006 + ((index % 21) / 1000))));
  const premium = Math.min(inventory, 1 + ((index * 11 + 3) % Math.max(2, Math.ceil(inventory / 3))));

  return {
    大区: sampleAreas[index % sampleAreas.length],
    小区名称: `${sampleNameRoots[index % sampleNameRoots.length]} ${padSampleIndex(index)}`,
    在售套数: String(inventory),
    带看量: String(traffic),
    成交量: String(transactions),
    好房数: String(premium),
  };
}

function escapeSampleCsvCell(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function createOpenDaySampleRows(count = OPEN_DAY_SMALL_SAMPLE_SIZE): OpenDayRawRow[] {
  return Array.from({ length: count }, (_, index) => createSampleRow(index));
}

export function createOpenDaySamplePayload(count = OPEN_DAY_SMALL_SAMPLE_SIZE) {
  return {
    headers: [...OPEN_DAY_SAMPLE_HEADERS],
    rows: createOpenDaySampleRows(count),
  };
}

export function createOpenDaySampleCsv(count = OPEN_DAY_SMALL_SAMPLE_SIZE) {
  const rows = createOpenDaySampleRows(count);
  return [
    OPEN_DAY_SAMPLE_HEADERS.join(','),
    ...rows.map((row) => OPEN_DAY_SAMPLE_HEADERS.map((header) => escapeSampleCsvCell(row[header] || '')).join(',')),
  ].join('\n');
}
