import type {
  NormalizedOpenDayRow,
  OpenDayConfig,
  OpenDayParameterKey,
  OpenDayResolvedParameter,
  OpenDayWaterlines,
} from './openDay.types.js';

const WATERLINE_KEYS: OpenDayParameterKey[] = ['I_cap', 'V_cap', 'H_cap', 'R_cap'];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function percentile(values: number[], q: number): number {
  if (!values.length) {
    return 0;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const position = (q / 100) * (sorted.length - 1);
  const base = Math.floor(position);
  const rest = position - base;
  const lower = sorted[base];
  const upper = sorted[base + 1] ?? lower;
  return lower + rest * (upper - lower);
}

function percentileRank(values: number[], target: number): number {
  if (!values.length || !Number.isFinite(target)) {
    return 50;
  }

  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 1) {
    return 50;
  }

  if (target <= sorted[0]) {
    return 1;
  }

  const lastIndex = sorted.length - 1;
  if (target >= sorted[lastIndex]) {
    return 99;
  }

  for (let index = 0; index < lastIndex; index += 1) {
    const lower = sorted[index];
    const upper = sorted[index + 1];

    if (target > upper) {
      continue;
    }

    const lowerPercentile = (index / lastIndex) * 100;
    const upperPercentile = ((index + 1) / lastIndex) * 100;

    if (upper === lower) {
      return clamp(upperPercentile, 1, 99);
    }

    const ratio = (target - lower) / (upper - lower);
    return clamp(lowerPercentile + ratio * (upperPercentile - lowerPercentile), 1, 99);
  }

  return 99;
}

function getValidMarket(rows: NormalizedOpenDayRow[]) {
  return rows.filter((row) => row.inventory > 0 && row.traffic > 0);
}

function selectValues(rows: NormalizedOpenDayRow[], key: OpenDayParameterKey) {
  switch (key) {
    case 'I_cap':
      return rows.map((row) => row.inventory);
    case 'V_cap':
      return rows.map((row) => row.traffic);
    case 'H_cap':
      return rows.map((row) => row.premium);
    case 'R_cap':
      return rows.map((row) => row.convRate);
    default:
      return [];
  }
}

function getConfiguredValue(config: OpenDayConfig, key: OpenDayParameterKey) {
  return Math.max(0, Number(config.absolutes[key]) || 0);
}

function getPercentileValue(config: OpenDayConfig, key: OpenDayParameterKey) {
  return clamp(Number(config.percentiles[key]) || 1, 1, 99);
}

function getOverrideValue(config: OpenDayConfig, key: OpenDayParameterKey) {
  const raw = config.waterlineOverrides?.[key];
  if (raw === undefined || raw === null) {
    return null;
  }

  const numeric = Number(raw);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : null;
}

export interface OpenDayResolvedWaterlineContext {
  waterlines: OpenDayWaterlines;
  resolvedParameters: OpenDayResolvedParameter[];
}

export function resolveOpenDayWaterlineContext(
  rows: NormalizedOpenDayRow[],
  config: OpenDayConfig,
): OpenDayResolvedWaterlineContext {
  const validMarket = getValidMarket(rows);
  const useAbsoluteFallback = config.waterlineMode !== 'absolute' && validMarket.length === 0;
  const activeRows = useAbsoluteFallback ? [] : validMarket;

  const resolvedParameters = WATERLINE_KEYS.map<OpenDayResolvedParameter>((key) => {
    const configuredValue = getConfiguredValue(config, key);
    const percentileValue = getPercentileValue(config, key);
    const values = selectValues(activeRows, key);
    const derivedValue = values.length ? percentile(values, percentileValue) : 0;
    const safeDerivedValue = derivedValue > 0 ? derivedValue : Math.max(configuredValue, 0.00001);
    const overrideValue = getOverrideValue(config, key);
    const useNumberMode = useAbsoluteFallback || config.waterlineMode === 'absolute';
    const finalValue = useNumberMode
      ? Math.max(configuredValue, 0.00001)
      : Math.max(overrideValue ?? safeDerivedValue, 0.00001);

    return {
      key,
      sourceMode: useNumberMode ? 'number' : 'percentile',
      percentileValue,
      configuredValue,
      derivedValue: safeDerivedValue,
      overrideValue,
      finalValue,
      derivedPercentileValue: percentileRank(values.length ? values : [configuredValue], finalValue),
      isOverridden: !useNumberMode && overrideValue !== null,
    };
  });

  const hasOverrides = resolvedParameters.some((parameter) => parameter.isOverridden);
  const source = useAbsoluteFallback
    ? '固定数值兜底'
    : config.waterlineMode === 'absolute'
      ? '固定数值'
      : hasOverrides
        ? '动态分位 + 手动覆写'
        : '动态分位';

  return {
    waterlines: {
      source,
      I_cap: resolvedParameters.find((parameter) => parameter.key === 'I_cap')?.finalValue ?? Math.max(config.absolutes.I_cap, 0.00001),
      V_cap: resolvedParameters.find((parameter) => parameter.key === 'V_cap')?.finalValue ?? Math.max(config.absolutes.V_cap, 0.00001),
      H_cap: resolvedParameters.find((parameter) => parameter.key === 'H_cap')?.finalValue ?? Math.max(config.absolutes.H_cap, 0.00001),
      R_cap: resolvedParameters.find((parameter) => parameter.key === 'R_cap')?.finalValue ?? Math.max(config.absolutes.R_cap, 0.00001),
    },
    resolvedParameters,
  };
}

export function deriveOpenDayPercentileForValue(
  rows: NormalizedOpenDayRow[],
  key: OpenDayParameterKey,
  value: number,
) {
  const values = selectValues(getValidMarket(rows), key);
  return percentileRank(values.length ? values : [Math.max(0, value)], Math.max(0, value));
}
