import type {
  OpenDaySkillDefinition,
  OpenDayFormulaDefinition,
  OpenDayParameterPackage,
  OpenDayRawRow,
  OpenDayScenarioDraft,
} from '../domain/openDay.types.ts';
import type { OpenDayFormMappings } from './openDayConstants';

export function getParameterPackageLabel(activeParameterPackageId: string, parameterPackages: OpenDayParameterPackage[]) {
  return parameterPackages.find((p) => p.id === activeParameterPackageId)?.label
    || (activeParameterPackageId === 'custom' ? '自定义参数' : '标准参数模式');
}

export function formatWaterlineValue(key: string, value: number): number {
  if (isNaN(value)) return 0;
  if (key === 'R_cap') {
    return Math.round(value * 10000) / 10000;
  }
  return Math.round(value);
}

export function buildScenarioDraftName(
  sourceName: string,
  scenarioDraft: OpenDayScenarioDraft,
  parameterPackages: OpenDayParameterPackage[],
  skills: OpenDaySkillDefinition[],
) {
  const label = scenarioDraft.parameterPackageId
    ? getParameterPackageLabel(scenarioDraft.parameterPackageId, parameterPackages)
    : skills.find((s) => s.id === (scenarioDraft.skillId || scenarioDraft.formulaId))?.label || '默认技能';
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
