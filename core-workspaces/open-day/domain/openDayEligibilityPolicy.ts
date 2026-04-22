import type { NormalizedOpenDayRow, OpenDayConfig } from './openDay.types.js';

export function isEligibleOpenDayRow(
  row: Pick<NormalizedOpenDayRow, 'inventory' | 'premium' | 'transactions'>,
  config: Pick<OpenDayConfig, 'hardFilters'>,
): boolean {
  return (
    row.inventory >= config.hardFilters.min_inventory &&
    row.premium >= config.hardFilters.min_hq_rooms &&
    row.transactions >= config.hardFilters.min_transaction
  );
}
