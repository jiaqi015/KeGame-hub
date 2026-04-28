import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import * as XLSX from 'xlsx';

import { fallbackOpenDayConfig, createOpenDaySamplePayload, OPEN_DAY_LARGE_SAMPLE_SIZE } from '../src/open-day/openDayConstants.ts';
import { createOpenDayCsvContent, createOpenDayXlsxBlob, OPEN_DAY_EXPORT_HEADERS } from '../src/open-day/openDayExport.ts';
import { scoreOpenDayDataset } from '../modules/open-day/domain/openDayScoringEngine.js';

const startedAt = performance.now();
const sample = createOpenDaySamplePayload(OPEN_DAY_LARGE_SAMPLE_SIZE);
const analysis = scoreOpenDayDataset({
  rows: sample.rows,
  mappings: {
    area: '大区',
    name: '小区名称',
    inventory: '在售套数',
    traffic: '带看量',
    transactions: '成交量',
    premium: '好房数',
  },
  config: fallbackOpenDayConfig,
  sourceName: '万行测试数据',
});

assert.equal(sample.rows.length, OPEN_DAY_LARGE_SAMPLE_SIZE);
assert.equal(analysis.results.length, OPEN_DAY_LARGE_SAMPLE_SIZE);
assert.equal(analysis.meta.totalCount, OPEN_DAY_LARGE_SAMPLE_SIZE);

const csv = createOpenDayCsvContent(analysis.results);
const csvLines = csv.trim().split(/\r?\n/);
assert.equal(csvLines.length, OPEN_DAY_LARGE_SAMPLE_SIZE + 1);
assert.ok(csvLines[0].includes(OPEN_DAY_EXPORT_HEADERS[0]));
assert.ok(csvLines[0].includes(OPEN_DAY_EXPORT_HEADERS[OPEN_DAY_EXPORT_HEADERS.length - 1]));

const xlsxBlob = createOpenDayXlsxBlob(analysis.results);
const xlsxBytes = Buffer.from(await xlsxBlob.arrayBuffer());
const workbook = XLSX.read(xlsxBytes, { type: 'buffer' });
const sheet = workbook.Sheets['测算结果'];
assert.ok(sheet, '缺少“测算结果”工作表');
const xlsxRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, blankrows: false });
assert.equal(xlsxRows.length, OPEN_DAY_LARGE_SAMPLE_SIZE + 1);
assert.deepEqual(xlsxRows[0], OPEN_DAY_EXPORT_HEADERS);

const elapsedMs = Math.round(performance.now() - startedAt);
console.log(`open-day large export verified: ${OPEN_DAY_LARGE_SAMPLE_SIZE} rows, csv=${Buffer.byteLength(csv)} bytes, xlsx=${xlsxBytes.byteLength} bytes, elapsed=${elapsedMs}ms`);
