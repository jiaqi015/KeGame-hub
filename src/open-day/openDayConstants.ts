import type {
  OpenDayCatalogResponse,
  OpenDayConfig,
  OpenDayPreset,
  OpenDayRawRow,
} from '../../modules/open-day/domain/openDay.types.ts';

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
  hardFilters: {
    min_inventory: 20,
    min_hq_rooms: 2,
    min_transaction: 1,
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
): OpenDayPreset {
  return {
    id,
    label,
    description,
    overrides,
    version,
    resolvedConfig: mergeConfig(fallbackOpenDayConfig, overrides),
  };
}

export const fallbackCatalog: OpenDayCatalogResponse = {
  generatedAt: new Date(0).toISOString(),
  defaultConfig: clone(fallbackOpenDayConfig),
  defaultConfigVersion: 'cfg:fallback',
  presets: [
    createFallbackPreset('auto', '自动巡航', '按动态分位适配当月大盘。', {}, 'preset:auto'),
    createFallbackPreset(
      'sprint',
      '逼单冲刺',
      '互动权重拉高，强调转化效率。',
      {
        weights: {
          product: 0.3,
          interaction: 0.7,
        },
      },
      'preset:sprint',
    ),
    createFallbackPreset(
      'kpi',
      '强压 KPI',
      '改用固定数值，强控规模与流量门槛。',
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
      'preset:kpi',
    ),
    createFallbackPreset(
      'all-market',
      '全域深潜',
      '红线归零，拉出全城所有盘做观察。',
      {
        hardFilters: {
          min_inventory: 0,
          min_hq_rooms: 0,
          min_transaction: 0,
        },
      },
      'preset:all-market',
    ),
  ],
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
  const normalizedHeaders = headers.map((header) => ({
    original: header,
    lowered: header.toLowerCase(),
  }));

  for (const alias of aliases) {
    const exact = normalizedHeaders.find((header) => header.lowered === alias.toLowerCase());
    if (exact) {
      return exact.original;
    }
  }

  for (const alias of aliases) {
    const partial = normalizedHeaders.find((header) => header.lowered.includes(alias.toLowerCase()));
    if (partial) {
      return partial.original;
    }
  }

  return '';
}

export function guessMappings(headers: string[]): OpenDayFormMappings {
  return {
    area: guessMapping('area', headers),
    name: guessMapping('name', headers),
    inventory: guessMapping('inventory', headers),
    traffic: guessMapping('traffic', headers),
    transactions: guessMapping('transactions', headers),
    premium: guessMapping('premium', headers),
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
