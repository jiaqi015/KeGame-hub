import assert from 'node:assert/strict';

import { scoreOpenDayDataset } from '../modules/open-day/domain/openDayScoringEngine.js';
import { normalizeOpenDayRows } from '../modules/open-day/domain/openDayDatasetNormalizer.js';
import { fallbackOpenDayConfig, generateDatasetQualityReport } from '../src/open-day/openDayConstants.ts';

const rowsWithoutArea = [
  { 小区名称: '无大区列小区', 在售套数: '28', 带看量: '120', 成交量: '2', 好房数: '3' },
];

const mappingsWithoutArea = {
  area: '',
  name: '小区名称',
  inventory: '在售套数',
  traffic: '带看量',
  transactions: '成交量',
  premium: '好房数',
};

const normalizedWithoutArea = normalizeOpenDayRows(rowsWithoutArea, mappingsWithoutArea);
assert.equal(normalizedWithoutArea[0].area, '未知大区');

const qualityWithoutArea = generateDatasetQualityReport(rowsWithoutArea, mappingsWithoutArea);
assert.equal(qualityWithoutArea.validRows, 1);
assert.equal(qualityWithoutArea.invalidRows, 0);

const rowsWithBlankArea = [
  { 大区: '', 小区名称: '空大区值小区', 在售套数: '35', 带看量: '160', 成交量: '3', 好房数: '5' },
];

const mappingsWithArea = {
  ...mappingsWithoutArea,
  area: '大区',
};

const normalizedWithBlankArea = normalizeOpenDayRows(rowsWithBlankArea, mappingsWithArea);
assert.equal(normalizedWithBlankArea[0].area, '未知大区');

const qualityWithBlankArea = generateDatasetQualityReport(rowsWithBlankArea, mappingsWithArea);
assert.equal(qualityWithBlankArea.validRows, 1);
assert.equal(qualityWithBlankArea.invalidRows, 0);

const analysis = scoreOpenDayDataset({
  rows: rowsWithoutArea,
  mappings: mappingsWithoutArea,
  config: fallbackOpenDayConfig,
  sourceName: '大区缺失验证',
});

assert.equal(analysis.results.length, 1);
assert.equal(analysis.results[0].area, '未知大区');

console.log('open-day area fallback verified: missing/blank area => 未知大区, valid rows pass');
