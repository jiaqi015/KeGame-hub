import { describe, it, expect } from 'vitest';
import { attributePressure } from '../projections/acnAttribution.js';
import type { RivalStore, RivalListing } from '../../domain/models.js';

// ── Helpers ──────────────────────────────────────────────────

function makeStore(overrides: Partial<RivalStore> & { id: string; type: RivalStore['type'] }): RivalStore {
  return {
    name: `Store ${overrides.id}`,
    style: 'steady',
    districtFocus: ['district-1'],
    leadCapturePower: 50,
    sellerInfluencePower: 50,
    pricingPressurePower: 50,
    activityHeat: 60,
    ...overrides,
  };
}

function makeListing(overrides: Partial<RivalListing> & { id: string; storeId: string }): RivalListing {
  return {
    title: `Listing ${overrides.id}`,
    district: 'district-1',
    marketCellId: 'cell-1',
    segment: 'standard',
    askPrice: 500,
    heat: 50,
    freshness: 50,
    storyStrength: 50,
    leadSiphonPower: 50,
    ownerAnchorPower: 50,
    status: 'active',
    daysLeft: 10,
    source: 'seed',
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────

describe('attributePressure', () => {
  const cellId = 'cell-1';
  const playerAcnId = 'acn-cooperative';

  it('same_company store with same acnId as player contributes to coSalePressure, NOT internalPressure', () => {
    const stores: RivalStore[] = [
      makeStore({ id: 's1', type: 'same_company', acnId: playerAcnId, brandId: 'acn', activityHeat: 80 }),
    ];
    const listings: RivalListing[] = [];

    const result = attributePressure(stores, listings, cellId, playerAcnId);

    expect(result.coSalePressure).toBeGreaterThan(0);
    expect(result.internalPressure).toBe(0);
    expect(result.rivalPressure).toBe(0);
  });

  it('same_company store with different acnId contributes to internalPressure, NOT coSalePressure', () => {
    const stores: RivalStore[] = [
      makeStore({ id: 's1', type: 'same_company', acnId: 'acn-aggressive', brandId: 'acn', activityHeat: 70 }),
    ];
    const listings: RivalListing[] = [];

    const result = attributePressure(stores, listings, cellId, playerAcnId);

    expect(result.internalPressure).toBeGreaterThan(0);
    expect(result.coSalePressure).toBe(0);
    expect(result.rivalPressure).toBe(0);
  });

  it('external_company stores contribute to rivalPressure only', () => {
    const stores: RivalStore[] = [
      makeStore({ id: 's1', type: 'external_company', activityHeat: 75 }),
    ];
    const listings: RivalListing[] = [];

    const result = attributePressure(stores, listings, cellId, playerAcnId);

    expect(result.rivalPressure).toBeGreaterThan(0);
    expect(result.coSalePressure).toBe(0);
    expect(result.internalPressure).toBe(0);
  });

  it('mix of all three types populates all three channels correctly', () => {
    const stores: RivalStore[] = [
      makeStore({ id: 's-co', type: 'same_company', acnId: playerAcnId, brandId: 'acn', activityHeat: 60 }),
      makeStore({ id: 's-int', type: 'same_company', acnId: 'acn-aggressive', brandId: 'acn', activityHeat: 50 }),
      makeStore({ id: 's-ext', type: 'external_company', activityHeat: 70 }),
    ];
    const listings: RivalListing[] = [
      makeListing({ id: 'l1', storeId: 's-co', marketCellId: cellId }),
      makeListing({ id: 'l2', storeId: 's-int', marketCellId: cellId }),
      makeListing({ id: 'l3', storeId: 's-ext', marketCellId: cellId }),
    ];

    const result = attributePressure(stores, listings, cellId, playerAcnId);

    expect(result.coSalePressure).toBeGreaterThan(0);
    expect(result.internalPressure).toBeGreaterThan(0);
    expect(result.rivalPressure).toBeGreaterThan(0);
  });

  it('backward compatible: stores without acnId fall back to same_company → coSalePressure', () => {
    const stores: RivalStore[] = [
      makeStore({ id: 's1', type: 'same_company', activityHeat: 55 }),
    ];
    const listings: RivalListing[] = [];

    const result = attributePressure(stores, listings, cellId, playerAcnId);

    expect(result.coSalePressure).toBeGreaterThan(0);
    expect(result.internalPressure).toBe(0);
    expect(result.rivalPressure).toBe(0);
  });

  it('backward compatible: stores without acnId when playerAcnId is also undefined', () => {
    const stores: RivalStore[] = [
      makeStore({ id: 's1', type: 'same_company', activityHeat: 55 }),
      makeStore({ id: 's2', type: 'external_company', activityHeat: 65 }),
    ];
    const listings: RivalListing[] = [];

    const result = attributePressure(stores, listings, cellId);

    expect(result.coSalePressure).toBeGreaterThan(0);
    expect(result.rivalPressure).toBeGreaterThan(0);
    expect(result.internalPressure).toBe(0);
  });

  it('internalPressure uses reduced weight compared to rivalPressure', () => {
    const stores: RivalStore[] = [
      makeStore({ id: 's-int', type: 'same_company', acnId: 'acn-aggressive', brandId: 'acn', activityHeat: 80 }),
      makeStore({ id: 's-ext', type: 'external_company', activityHeat: 80 }),
    ];
    const listings: RivalListing[] = [
      makeListing({ id: 'l1', storeId: 's-int', marketCellId: cellId }),
      makeListing({ id: 'l2', storeId: 's-ext', marketCellId: cellId }),
    ];

    const result = attributePressure(stores, listings, cellId, playerAcnId);

    // Same activityHeat and same listing count, but internalPressure weight < rivalPressure weight
    expect(result.internalPressure).toBeLessThan(result.rivalPressure);
  });

  it('listings in different cells do not affect pressure', () => {
    const stores: RivalStore[] = [
      makeStore({ id: 's1', type: 'same_company', acnId: playerAcnId, brandId: 'acn', activityHeat: 60 }),
    ];
    const listings: RivalListing[] = [
      makeListing({ id: 'l1', storeId: 's1', marketCellId: 'cell-other' }),
    ];

    const result = attributePressure(stores, listings, cellId, playerAcnId);

    // Listing is in a different cell, so no listing count pressure
    // Only activityHeat contributes: 60 * 0.5 = 30
    expect(result.coSalePressure).toBe(30);
  });

  it('returns all zeros for empty stores', () => {
    const result = attributePressure([], [], cellId, playerAcnId);

    expect(result.coSalePressure).toBe(0);
    expect(result.internalPressure).toBe(0);
    expect(result.rivalPressure).toBe(0);
  });

  it('same_company store with same acnId but no brandId still goes to coSalePressure', () => {
    const stores: RivalStore[] = [
      makeStore({ id: 's1', type: 'same_company', acnId: playerAcnId, activityHeat: 50 }),
    ];
    const listings: RivalListing[] = [];

    const result = attributePressure(stores, listings, cellId, playerAcnId);

    expect(result.coSalePressure).toBeGreaterThan(0);
    expect(result.internalPressure).toBe(0);
  });

  it('pressure values are capped at 100', () => {
    const stores: RivalStore[] = [
      makeStore({ id: 's1', type: 'external_company', activityHeat: 100 }),
      makeStore({ id: 's2', type: 'external_company', activityHeat: 100 }),
      makeStore({ id: 's3', type: 'external_company', activityHeat: 100 }),
    ];
    // 20 listings in cell for max listing pressure
    const listings: RivalListing[] = Array.from({ length: 20 }, (_, i) =>
      makeListing({ id: `l${i}`, storeId: 's1', marketCellId: cellId }),
    );

    const result = attributePressure(stores, listings, cellId, playerAcnId);

    expect(result.rivalPressure).toBeLessThanOrEqual(100);
    expect(result.coSalePressure).toBe(0);
    expect(result.internalPressure).toBe(0);
  });

  it('same brand different ACN store contributes to internalPressure when playerBrandId matches', () => {
    const stores: RivalStore[] = [
      makeStore({ id: 's1', type: 'same_company', acnId: 'acn-aggressive', brandId: 'brand-alpha', activityHeat: 60 }),
    ];
    const listings: RivalListing[] = [];

    const result = attributePressure(stores, listings, cellId, playerAcnId, 'brand-alpha');

    expect(result.internalPressure).toBeGreaterThan(0);
    expect(result.coSalePressure).toBe(0);
    expect(result.rivalPressure).toBe(0);
  });

  it('same company different brand different ACN still goes to internal (same_company fallback)', () => {
    const stores: RivalStore[] = [
      makeStore({ id: 's1', type: 'same_company', acnId: 'acn-other-brand', brandId: 'brand-beta', activityHeat: 60 }),
    ];
    const listings: RivalListing[] = [];

    const result = attributePressure(stores, listings, cellId, playerAcnId, 'brand-alpha');

    // Different brand, different ACN, but same_company type → internal (affiliation)
    expect(result.internalPressure).toBeGreaterThan(0);
    expect(result.coSalePressure).toBe(0);
  });

  it('same brand different ACN with no playerAcnId still routes to internal via brandId', () => {
    const stores: RivalStore[] = [
      makeStore({ id: 's1', type: 'same_company', acnId: 'acn-aggressive', brandId: 'brand-alpha', activityHeat: 55 }),
    ];
    const listings: RivalListing[] = [];

    // No playerAcnId provided — brandId match alone should route to internal
    const result = attributePressure(stores, listings, cellId, undefined, 'brand-alpha');

    expect(result.internalPressure).toBeGreaterThan(0);
    expect(result.coSalePressure).toBe(0);
    expect(result.rivalPressure).toBe(0);
  });
});
