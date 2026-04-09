import type { NormalizedOpenDayRow, OpenDayConfig, OpenDayWaterlines } from './openDay.types.js';

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

export function resolveOpenDayWaterlines(
  rows: NormalizedOpenDayRow[],
  config: OpenDayConfig,
): OpenDayWaterlines {
  if (config.waterlineMode === 'absolute') {
    return {
      source: '固定数值',
      ...config.absolutes,
    };
  }

  const validMarket = rows.filter((row) => row.inventory > 0 && row.traffic > 0);
  if (!validMarket.length) {
    return {
      source: '固定数值兜底',
      ...config.absolutes,
    };
  }

  const waterlines = {
    I_cap: percentile(validMarket.map((row) => row.inventory), config.percentiles.I_cap),
    V_cap: percentile(validMarket.map((row) => row.traffic), config.percentiles.V_cap),
    H_cap: percentile(validMarket.map((row) => row.premium), config.percentiles.H_cap),
    R_cap: percentile(validMarket.map((row) => row.convRate), config.percentiles.R_cap),
  };

  return {
    source: '动态分位',
    I_cap: waterlines.I_cap > 0 ? waterlines.I_cap : Math.max(config.absolutes.I_cap, 0.00001),
    V_cap: waterlines.V_cap > 0 ? waterlines.V_cap : Math.max(config.absolutes.V_cap, 0.00001),
    H_cap: waterlines.H_cap > 0 ? waterlines.H_cap : Math.max(config.absolutes.H_cap, 0.00001),
    R_cap: waterlines.R_cap > 0 ? waterlines.R_cap : Math.max(config.absolutes.R_cap, 0.00001),
  };
}
