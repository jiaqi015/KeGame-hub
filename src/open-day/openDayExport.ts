import * as XLSX from 'xlsx';
import type { OpenDayAnalysisRow } from '../../modules/open-day/domain/openDay.types.ts';
import { formatNumber, formatPercent } from './formatters.ts';

export type OpenDayExportCell = string | number;

export const OPEN_DAY_EXPORT_HEADERS = [
  '排名',
  '大区',
  '小区名称',
  '综合得分',
  '梯队',
  '状态',
  '规模得分',
  '流量得分',
  '商品得分',
  '互动得分',
  '成交量(单)',
  '转化率',
];

export function createOpenDayExportRows(results: OpenDayAnalysisRow[]): OpenDayExportCell[][] {
  return results.map((row) => [
    row.rank,
    row.area,
    row.name,
    formatNumber(row.score, 1),
    row.tierCode,
    row.isEligible ? '达标' : '未达标',
    formatNumber(row.scaleIdx, 1),
    formatNumber(row.trafficIdx, 1),
    formatNumber(row.productIdx, 1),
    formatNumber(row.interactionIdx, 1),
    row.transactions,
    formatPercent(row.convRate, 2),
  ]);
}

export function createOpenDayExportSheetData(results: OpenDayAnalysisRow[]): OpenDayExportCell[][] {
  return [OPEN_DAY_EXPORT_HEADERS, ...createOpenDayExportRows(results)];
}

function escapeCsvCell(value: OpenDayExportCell) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function createOpenDayCsvContent(results: OpenDayAnalysisRow[]) {
  return `\uFEFF${createOpenDayExportSheetData(results)
    .map((row) => row.map(escapeCsvCell).join(','))
    .join('\n')}`;
}

export function createOpenDayCsvBlob(results: OpenDayAnalysisRow[]) {
  return new Blob([createOpenDayCsvContent(results)], { type: 'text/csv;charset=utf-8;' });
}

export function createOpenDayXlsxBlob(results: OpenDayAnalysisRow[]) {
  const sheetData = createOpenDayExportSheetData(results);
  const worksheet = XLSX.utils.aoa_to_sheet(sheetData);
  worksheet['!cols'] = OPEN_DAY_EXPORT_HEADERS.map((header) => ({ wch: Math.max(10, header.length + 4) }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, '测算结果');
  const bytes = XLSX.write(workbook, {
    bookType: 'xlsx',
    compression: true,
    type: 'array',
  }) as ArrayBuffer;

  return new Blob([bytes], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export function createOpenDayExportFileName(sourceName: string, format: 'xlsx' | 'csv') {
  const safeName = (sourceName || '开放日测算结果').replace(/[\\/:*?"<>|]/g, '_');
  return `${safeName}.${format}`;
}
