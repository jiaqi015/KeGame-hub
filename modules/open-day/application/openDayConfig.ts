import type { OpenDayConfig, OpenDayParameterPackageDefinition, OpenDayPresetDefinition } from '../domain/openDay.types.js';

export const defaultOpenDayConfig: OpenDayConfig = {
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
  waterlineOverrides: {
    H_cap: 3,
  },
  hardFilters: {
    min_inventory: 20,
    min_hq_rooms: 1,
    min_transaction: 1,
  },
  tierThresholds: {
    s: 80,
    a: 55,
    b: 30,
    c: 20,
  },
};

export const openDayParameterPackageCatalog: OpenDayParameterPackageDefinition[] = [
  {
    id: 'auto',
    label: '标准参数模式',
    description: '按照建议分位参数直接测算',
    overrides: {},
  },
  {
    id: 'sprint',
    label: '高转化要求模式',
    description: '核心关注出价和反馈。',
    overrides: {
      weights: {
        product: 0.3,
        interaction: 0.7,
      },
    },
  },
  {
    id: 'kpi',
    label: '强规模模式',
    description: '直接改固定数值。',
    overrides: {
      waterlineMode: 'absolute',
      alpha: 0.6,
      absolutes: {
        I_cap: 60,
        V_cap: 600,
        H_cap: 8,
        R_cap: 0.03,
      },
    },
  },
  {
    id: 'all-market',
    label: '水位自由调整',
    description: '自由调整水位。',
    overrides: {
      hardFilters: {
        min_inventory: 0,
        min_hq_rooms: 0,
        min_transaction: 0,
      },
    },
  },
] as const;

export const openDayPresetCatalog: OpenDayPresetDefinition[] = openDayParameterPackageCatalog;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function mergeOpenDayConfig<T>(base: T, overrides?: Partial<T>): T {
  if (!overrides) {
    return JSON.parse(JSON.stringify(base)) as T;
  }

  const next = JSON.parse(JSON.stringify(base)) as Record<string, unknown>;

  Object.entries(overrides).forEach(([key, value]) => {
    if (value === undefined) {
      return;
    }

    if (isRecord(value) && isRecord(next[key])) {
      next[key] = mergeOpenDayConfig(next[key] as Record<string, unknown>, value);
      return;
    }

    next[key] = value;
  });

  return next as T;
}

export function normalizeWeights(weights: OpenDayConfig['weights']): OpenDayConfig['weights'] {
  const product = Math.max(0, Number(weights.product) || 0);
  const interaction = Math.max(0, Number(weights.interaction) || 0);
  const total = product + interaction;

  if (total <= 0) {
    return {
      product: defaultOpenDayConfig.weights.product,
      interaction: defaultOpenDayConfig.weights.interaction,
    };
  }

  return {
    product: product / total,
    interaction: interaction / total,
  };
}
