import type {
  OpenDayCatalogResponse,
  OpenDayConfig,
  OpenDayFormulaDefinition,
  OpenDayParameterPackage,
  OpenDayPreset,
  OpenDayRawRow,
} from '../../modules/open-day/domain/openDay.types.ts';

export interface WaterlineDefinition {
  key: keyof OpenDayConfig['absolutes'];
  title: string;
  description: string;
  percentileLabel: string;
  absoluteLabel: string;
  absoluteStep: string;
  unit: string;
}

export interface OpenDayDatasetDraft {
  datasetId: string;
  headers: string[];
  rows: OpenDayRawRow[];
  mappings: OpenDayFormMappings;
  sourceName: string;
  sourceUploadId: string;
  workbookSheets: string[];
  activeSheet: string;
}

export const waterlineDefinitions: WaterlineDefinition[] = [
  {
    key: 'I_cap',
    title: '动员规模基准',
    description: '在售规模达到这个刻度后，视为开放日场域动员饱和。',
    percentileLabel: '规模分位',
    absoluteLabel: '满分套数',
    absoluteStep: '1',
    unit: '套',
  },
  {
    key: 'V_cap',
    title: '带看漏斗基准',
    description: '带看达到标杆后视为人气饱和，再高主要靠 Alpha 做平滑。',
    percentileLabel: '流量分位',
    absoluteLabel: '标杆带看',
    absoluteStep: '1',
    unit: '次',
  },
  {
    key: 'H_cap',
    title: '优质货品基准',
    description: '好房达到这个刻度后，单场活动已具备横向对比的货品密度。',
    percentileLabel: '商品分位',
    absoluteLabel: '好房套数',
    absoluteStep: '1',
    unit: '套',
  },
  {
    key: 'R_cap',
    title: '成交转化基准',
    description: '按成交量 / 带看量计算的互动质量健康线，用来衡量逼定氛围。',
    percentileLabel: '互动分位',
    absoluteLabel: '健康转化率',
    absoluteStep: '0.001',
    unit: '%',
  },
];

export const sampleCsv = `大区,小区名称,在售套数,带看量,成交量,好房数
学院大区,今典花园,45,655,11,8
团结湖大区,慈云寺,66,422,7,12
五道口大区,展春园,22,185,4,6
望京北大区,首开金茂·望京樾,10,199,4,3
学院大区,北太平庄路2号院,21,22,1,1
望京北大区,东洲家园,71,436,10,7
五道口大区,八家嘉园,36,588,8,5
朝阳公园大区,阳光上东,72,294,6,3
朝阳公园大区,阳光上东滨河花园,6,33,1,0
朝阳公园大区,京达国际公寓,3,2,0,0
朝阳公园大区,南十里居10号院,3,4,1,0
学院大区,二里庄小区,18,126,1,2
团结湖大区,棕榈泉国际公寓,28,240,2,4
望京北大区,澳洲康都,70,1120,8,4
朝阳公园大区,燕东大厦,0,0,0,0`;

export const fallbackOpenDayConfig: OpenDayConfig = {
  formulaId: 'geometric_catalyst_v2',
  alpha: 0.8,
  waterlineMode: 'percentile',
  weights: {
    product: 0.65,
    interaction: 0.35,
  },
  percentiles: {
    I_cap: 95,
    V_cap: 95,
    H_cap: 95,
    R_cap: 75,
  },
  absolutes: {
    I_cap: 50,
    V_cap: 400,
    H_cap: 5,
    R_cap: 0.02,
  },
  waterlineOverrides: {},
  hardFilters: {
    min_inventory: 20,
    min_hq_rooms: 2,
    min_transaction: 1,
  },
  tierThresholds: {
    s: 65,
    a: 50,
    b: 35,
    c: 20,
  },
};

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function mergeConfig<T>(base: T, overrides?: Partial<T>): T {
  if (!overrides) {
    return clone(base);
  }

  const next = clone(base) as Record<string, unknown>;

  Object.entries(overrides).forEach(([key, value]) => {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      next[key] &&
      typeof next[key] === 'object' &&
      !Array.isArray(next[key])
    ) {
      next[key] = mergeConfig(next[key], value as Record<string, unknown>);
      return;
    }

    next[key] = value;
  });

  return next as T;
}

function createFallbackPreset(
  id: string,
  label: string,
  description: string,
  overrides: Partial<OpenDayConfig>,
  version: string,
): OpenDayParameterPackage {
  return {
    id,
    label,
    description,
    overrides,
    version,
    resolvedConfig: mergeConfig(fallbackOpenDayConfig, overrides),
  };
}

const fallbackFormulas: OpenDayFormulaDefinition[] = [
  {
    id: 'weighted_catalyst_v1',
    label: '线性催化',
    description: '规模与流量直接乘积，商品和互动按权重线性合成催化项。',
  },
  {
    id: 'geometric_catalyst_v2',
    label: '几何体量 + 商品门控',
    description: '规模与流量走几何平均，商品分做硬乘子，互动分只作为加成项。',
  },
];

const fallbackParameterPackages: OpenDayParameterPackage[] = [
  createFallbackPreset('auto', '动态分位模式', '按 95% 动态分位适配大盘，适应市场波动。', {}, 'package:auto'),
  createFallbackPreset(
    'sprint',
    '高转化权重模式',
    '互动权重拉高至 0.7，核心关注逼定表现。',
    {
      weights: {
        product: 0.3,
        interaction: 0.7,
      },
    },
    'package:sprint',
  ),
  createFallbackPreset(
    'kpi',
    '固定阈值模式',
    '使用固定绝对值门槛，强控规模与流量底线。',
    {
      waterlineMode: 'absolute',
      alpha: 0.6,
      absolutes: {
        I_cap: 60,
        V_cap: 600,
        H_cap: 8,
        R_cap: 0.03,
      },
    },
    'package:kpi',
  ),
  createFallbackPreset(
    'all-market',
    '全域观察模式',
    '准入过滤全部归零，透视全城楼盘底盘数据。',
    {
      hardFilters: {
        min_inventory: 0,
        min_hq_rooms: 0,
        min_transaction: 0,
      },
    },
    'package:all-market',
  ),
];

export const fallbackCatalog: OpenDayCatalogResponse = {
  generatedAt: new Date(0).toISOString(),
  defaultConfig: clone(fallbackOpenDayConfig),
  defaultConfigVersion: 'cfg:fallback',
  formulas: fallbackFormulas,
  parameterPackages: fallbackParameterPackages,
  presets: fallbackParameterPackages as OpenDayPreset[],
};

export type MappingKey = 'area' | 'name' | 'inventory' | 'traffic' | 'transactions' | 'premium';

export interface OpenDayFormMappings {
  area: string;
  name: string;
  inventory: string;
  traffic: string;
  transactions: string;
  premium: string;
}

export const requiredMappingKeys: Exclude<MappingKey, 'area'>[] = [
  'name',
  'inventory',
  'traffic',
  'transactions',
  'premium',
];

export interface DatasetQualityReport {
  totalRows: number;
  validRows: number;
  invalidRows: number;
  missingFieldCounts: Record<MappingKey, number>;
  typeErrorCounts: Record<MappingKey, number>;
  isCriticallyDeficient: boolean;
  score: number; // 0-100
}

export const fieldAliases: Record<MappingKey, string[]> = {
  area: ['大区', '区域', '商圈', '片区', 'area'],
  name: ['小区名称', '楼盘名', '楼盘名称', '小区', '名称', 'community', 'name'],
  inventory: ['库存在售房源量', '在售套数', '在售', 'inventory', '挂牌', 'sale'],
  traffic: ['带看量（房源ID+带看ID）', '带看量', '流量', 'traffic', 'view'],
  transactions: ['成交量', '交易量', '签约量', 'transaction', 'deal'],
  premium: ['库存好房量', '好房数', '精品房源量', '好房', 'premium'],
};

export function createEmptyMappings(): OpenDayFormMappings {
  return {
    area: '',
    name: '',
    inventory: '',
    traffic: '',
    transactions: '',
    premium: '',
  };
}

export function guessMapping(key: MappingKey, headers: string[]) {
  const aliases = fieldAliases[key] || [];
  const candidates: { header: string; score: number }[] = [];

  const normalizedHeaders = headers.map((header) => ({
    original: header,
    lowered: header.toLowerCase(),
  }));

  for (const alias of aliases) {
    const aliasLower = alias.toLowerCase();
    
    for (const h of normalizedHeaders) {
      if (h.lowered === aliasLower) {
        candidates.push({ header: h.original, score: 100 });
      } else if (h.lowered.includes(aliasLower) || aliasLower.includes(h.lowered)) {
        // Scoring based on similarity if not exact
        const score = 50 + (h.lowered.length > 0 ? (Math.min(h.lowered.length, aliasLower.length) / Math.max(h.lowered.length, aliasLower.length)) * 30 : 0);
        candidates.push({ header: h.original, score });
      }
    }
  }

  if (candidates.length === 0) return '';
  
  // Return the one with the highest score
  return candidates.sort((a, b) => b.score - a.score)[0].header;
}

export function guessMappings(headers: string[]): OpenDayFormMappings {
  const result = createEmptyMappings();
  const seenHeaders = new Set<string>();

  // Order matters: pick the most unique ones first or just iterate usually
  (Object.keys(fieldAliases) as MappingKey[]).forEach((key) => {
    const matched = guessMapping(key, headers.filter(h => !seenHeaders.has(h)));
    if (matched) {
      result[key] = matched;
      seenHeaders.add(matched);
    }
  });

  return result;
}

export function generateDatasetQualityReport(rows: OpenDayRawRow[], mappings: OpenDayFormMappings): DatasetQualityReport {
  const report: DatasetQualityReport = {
    totalRows: rows.length,
    validRows: 0,
    invalidRows: 0,
    missingFieldCounts: createEmptyCounts(),
    typeErrorCounts: createEmptyCounts(),
    isCriticallyDeficient: false,
    score: 0,
  };

  if (rows.length === 0) {
    report.isCriticallyDeficient = true;
    return report;
  }

  rows.forEach((row) => {
    let hasError = false;

    (Object.entries(mappings) as [MappingKey, string][]).forEach(([key, header]) => {
      if (!header) {
        if (requiredMappingKeys.includes(key as any)) {
          report.missingFieldCounts[key]++;
          hasError = true;
        }
        return;
      }

      const val = row[header];
      if (val === undefined || val === null || val === '') {
        report.missingFieldCounts[key]++;
        hasError = true;
      } else if (key !== 'name' && key !== 'area') {
        const num = parseFloat(String(val).replace(/[^\d.-]/g, ''));
        if (isNaN(num)) {
          report.typeErrorCounts[key]++;
          hasError = true;
        }
      }
    });

    if (hasError) {
      report.invalidRows++;
    } else {
      report.validRows++;
    }
  });

  // Critical if more than 50% rows are invalid or NO valid rows
  report.isCriticallyDeficient = report.validRows === 0 || (report.invalidRows / report.totalRows > 0.8);
  report.score = Math.round((report.validRows / report.totalRows) * 100);

  return report;
}

function createEmptyCounts(): Record<MappingKey, number> {
  return {
    area: 0,
    name: 0,
    inventory: 0,
    traffic: 0,
    transactions: 0,
    premium: 0,
  };
}

export function getMissingMappings(mappings: OpenDayFormMappings) {
  return requiredMappingKeys.filter((key) => !mappings[key]);
}

export function cloneConfig(value: OpenDayConfig) {
  return clone(value);
}

export function cloneRows(rows: OpenDayRawRow[]) {
  return clone(rows);
}
