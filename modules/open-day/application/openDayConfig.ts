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
  waterlineOverrides: {},
  hardFilters: {
    min_inventory: 20,
    min_hq_rooms: 2,
    min_transaction: 1,
  },
};

export const openDayParameterPackageCatalog: OpenDayParameterPackageDefinition[] = [
  {
    id: 'auto',
    label: '自动巡航',
    description: '按动态分位适配当月大盘。',
    overrides: {},
  },
  {
    id: 'sprint',
    label: '逼单冲刺',
    description: '互动权重拉高，强调转化效率。',
    overrides: {
      weights: {
        product: 0.3,
        interaction: 0.7,
      },
    },
  },
  {
    id: 'kpi',
    label: '强压 KPI',
    description: '改用固定数值，强控规模与流量门槛。',
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
    label: '全域深潜',
    description: '红线归零，拉出全城所有盘做观察。',
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
