/**
 * ACN Attribution — pressure channel decomposition by ACN membership.
 *
 * Decomposes rival store pressure into three channels:
 *   - coSalePressure: same-company stores in the same ACN (true co-sale partners)
 *   - internalPressure: same-company stores in a different ACN but same brand
 *     (semi-competitive — internal rivalry)
 *   - rivalPressure: external-company stores (cross-brand competition)
 *
 * Before this module, same_company stores were all lumped into coSalePressure
 * and internalPressure was always 0, because RivalStore had no acnId field.
 */

import type { RivalStore, RivalListing } from '../../domain/models.js';

// ── Output type ─────────────────────────────────────────────

export interface PressureAttribution {
  /** Pressure from same-ACN co-sale partners (cooperative). 0-100. */
  coSalePressure: number;
  /** Pressure from same-brand different-ACN stores (semi-competitive). 0-100. */
  internalPressure: number;
  /** Pressure from external-company stores (cross-brand). 0-100. */
  rivalPressure: number;
}

// ── Main function ───────────────────────────────────────────

/**
 * Attribute rival store pressure into three channels based on ACN membership.
 *
 * @param rivalStores  All rival stores visible to the player
 * @param rivalListings All rival listings (for listing-count pressure)
 * @param cellId       The market cell to filter on
 * @param playerAcnId  The player's ACN id (optional — if absent, falls back to legacy behavior)
 * @param playerBrandId The player's brand id (optional — if absent, falls back to legacy behavior)
 */
export function attributePressure(
  rivalStores: readonly RivalStore[],
  rivalListings: readonly RivalListing[],
  cellId: string,
  playerAcnId?: string,
  playerBrandId?: string,
): PressureAttribution {
  // ── Partition stores into three channels ──
  const coSaleStores: RivalStore[] = [];
  const internalStores: RivalStore[] = [];
  const rivalStores_: RivalStore[] = [];

  for (const store of rivalStores) {
    if (store.type === 'external_company') {
      rivalStores_.push(store);
      continue;
    }

    // same_company store — determine channel based on acnId
    if (playerAcnId !== undefined && store.acnId !== undefined) {
      if (store.acnId === playerAcnId) {
        // Same ACN: true co-sale partner
        coSaleStores.push(store);
      } else {
        // Same company, different ACN: internal pressure (semi-competitive)
        internalStores.push(store);
      }
    } else {
      // No acnId available — backward compatible: same_company → coSalePressure
      coSaleStores.push(store);
    }
  }

  // ── Count rival listings in cell per store channel ──
  const cellListings = rivalListings.filter(
    (r) => r.status === 'active' && r.marketCellId === cellId,
  );

  const coSaleListingCount = cellListings.filter(
    (r) => coSaleStores.some((s) => s.id === r.storeId),
  ).length;

  const internalListingCount = cellListings.filter(
    (r) => internalStores.some((s) => s.id === r.storeId),
  ).length;

  const rivalListingCount = cellListings.filter(
    (r) => rivalStores_.some((s) => s.id === r.storeId),
  ).length;

  // ── Compute pressure per channel ──

  // coSalePressure: cooperative pressure from same-ACN partners
  // avg activityHeat * 0.5 + listing count * 3, capped 0-100
  const coSaleHeat = coSaleStores.length > 0
    ? coSaleStores.reduce((sum, s) => sum + s.activityHeat, 0) / coSaleStores.length
    : 0;
  const coSalePressure = Math.min(100, Math.max(0, Math.round(
    coSaleHeat * 0.5 + coSaleListingCount * 3,
  )));

  // internalPressure: semi-competitive pressure from same-brand different-ACN stores
  // avg activityHeat * 0.6 + listing count * 5, capped 0-100
  // Weighted higher than coSale because these are competitors, not partners,
  // but lower than full rival because they share brand resources.
  const internalHeat = internalStores.length > 0
    ? internalStores.reduce((sum, s) => sum + s.activityHeat, 0) / internalStores.length
    : 0;
  const internalPressure = Math.min(100, Math.max(0, Math.round(
    internalHeat * 0.6 + internalListingCount * 5,
  )));

  // rivalPressure: cross-brand competition from external-company stores
  // avg activityHeat * 0.7 + listing count * 5, capped 0-100
  const rivalHeat = rivalStores_.length > 0
    ? rivalStores_.reduce((sum, s) => sum + s.activityHeat, 0) / rivalStores_.length
    : 0;
  const rivalPressure = Math.min(100, Math.max(0, Math.round(
    rivalHeat * 0.7 + rivalListingCount * 5,
  )));

  return { coSalePressure, internalPressure, rivalPressure };
}
