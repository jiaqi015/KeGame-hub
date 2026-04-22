import type { NormalizedOpenDayRow, OpenDayConfig, OpenDayWaterlines } from './openDay.types.js';
import { resolveOpenDayWaterlineContext } from './openDayParameterResolver.js';

export function resolveOpenDayWaterlines(
  rows: NormalizedOpenDayRow[],
  config: OpenDayConfig,
): OpenDayWaterlines {
  return resolveOpenDayWaterlineContext(rows, config).waterlines;
}
