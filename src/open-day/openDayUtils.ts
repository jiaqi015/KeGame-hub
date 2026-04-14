import type {
  OpenDayFormulaDefinition,
  OpenDayParameterPackage,
  OpenDayRawRow,
  OpenDayScenarioDraft,
} from '../../modules/open-day/domain/openDay.types.ts';
import type { OpenDayFormMappings } from './openDayConstants';

export function getParameterPackageLabel(activeParameterPackageId: string, parameterPackages: OpenDayParameterPackage[]) {
  return parameterPackages.find((p) => p.id === activeParameterPackageId)?.label
    || (activeParameterPackageId === 'custom' ? '自定义参数' : '自动巡航');
}

export function formatWaterlineValue(key: string, value: number): number {
  if (isNaN(value)) return 0;
  // Conversion rate (R_cap) usually needs more precision, others are usually counts
  if (key === 'R_cap') {
    return Math.round(value * 10000) / 10000;
  }
  return Math.round(value);
}

export function buildScenarioDraftName(
  sourceName: string,
  scenarioDraft: OpenDayScenarioDraft,
  parameterPackages: OpenDayParameterPackage[],
  formulas: OpenDayFormulaDefinition[],
) {
  const label = scenarioDraft.parameterPackageId
    ? getParameterPackageLabel(scenarioDraft.parameterPackageId, parameterPackages)
    : formulas.find((f) => f.id === scenarioDraft.formulaId)?.label || '默认公式';
  const baseName = sourceName ? sourceName.split('/')[0].trim() : '开放日方案';
  const timestamp = new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
    .format(new Date())
    .replace(/\//g, '-')
    .replace(/\s+/g, ' ');

  return `${baseName} ${label} ${timestamp}`;
}

export function extractHeadersFromRows(rows: OpenDayRawRow[], mappings: OpenDayFormMappings) {
  const seen = new Set<string>();
  const ordered: string[] = [];

  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (!seen.has(key)) {
        seen.add(key);
        ordered.push(key);
      }
    });
  });

  Object.values(mappings).forEach((value) => {
    if (value && !seen.has(value)) {
      seen.add(value);
      ordered.push(value);
    }
  });

  return ordered;
}
