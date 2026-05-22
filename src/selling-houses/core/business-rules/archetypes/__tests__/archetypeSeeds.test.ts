import { describe, it, expect } from 'vitest';
import {
  OWNER_ARCHETYPE_SEEDS,
  CUSTOMER_ARCHETYPE_SEEDS,
  CHANNEL_ARCHETYPE_SEEDS,
  RIVAL_STORE_ARCHETYPE_SEEDS,
  RIVAL_LISTING_ARCHETYPE_SEEDS,
} from '../archetypeSeeds.js';
import type {
  OwnerArchetype,
  CustomerProfile,
  ChannelProfile,
  RivalStoreArchetype,
  RivalListingArchetype,
} from '../archetypeTaxonomy.js';

describe('archetypeSeeds', () => {
  it('OWNER_ARCHETYPE_SEEDS has 4 entries with required fields', () => {
    expect(OWNER_ARCHETYPE_SEEDS).toHaveLength(4);
    for (const entry of OWNER_ARCHETYPE_SEEDS) {
      expect(entry.id).toBeTruthy();
      expect(entry.label).toBeTruthy();
      expect(entry.description).toBeTruthy();
      expect(typeof entry.trustDecayMultiplier).toBe('number');
      expect(typeof entry.priceElasticity).toBe('number');
      expect(typeof entry.urgencyGrowthBonus).toBe('number');
      expect(typeof entry.heatSensitivity).toBe('number');
      expect(typeof entry.patienceDelta).toBe('number');
      expect(entry.preferredTactic).toBeTruthy();
    }
  });

  it('CUSTOMER_ARCHETYPE_SEEDS has 9 entries with required fields', () => {
    expect(CUSTOMER_ARCHETYPE_SEEDS).toHaveLength(9);
    for (const entry of CUSTOMER_ARCHETYPE_SEEDS) {
      expect(entry.id).toBeTruthy();
      expect(entry.name).toBeTruthy();
      expect(entry.profile).toBeTruthy();
      expect(typeof entry.budgetMin).toBe('number');
      expect(typeof entry.budgetMax).toBe('number');
      expect(entry.targetDistrict).toBeTruthy();
      expect(Array.isArray(entry.layouts)).toBe(true);
      expect(typeof entry.activity).toBe('number');
      expect(typeof entry.urgency).toBe('number');
      expect(typeof entry.priceSensitivity).toBe('number');
      expect(Array.isArray(entry.preferences)).toBe(true);
    }
  });

  it('CHANNEL_ARCHETYPE_SEEDS has 4 entries with required fields', () => {
    expect(CHANNEL_ARCHETYPE_SEEDS).toHaveLength(4);
    for (const entry of CHANNEL_ARCHETYPE_SEEDS) {
      expect(entry.id).toBeTruthy();
      expect(entry.name).toBeTruthy();
      expect(typeof entry.quality).toBe('number');
      expect(typeof entry.controllability).toBe('number');
    }
  });

  it('RIVAL_STORE_ARCHETYPE_SEEDS has 3 entries with required fields', () => {
    expect(RIVAL_STORE_ARCHETYPE_SEEDS).toHaveLength(3);
    for (const entry of RIVAL_STORE_ARCHETYPE_SEEDS) {
      expect(entry.id).toBeTruthy();
      expect(entry.name).toBeTruthy();
      expect(entry.type).toBeTruthy();
      expect(entry.style).toBeTruthy();
      expect(Array.isArray(entry.districtFocus)).toBe(true);
      expect(typeof entry.leadCapturePower).toBe('number');
      expect(typeof entry.sellerInfluencePower).toBe('number');
      expect(typeof entry.pricingPressurePower).toBe('number');
    }
  });

  it('RIVAL_LISTING_ARCHETYPE_SEEDS has 3 entries with required fields', () => {
    expect(RIVAL_LISTING_ARCHETYPE_SEEDS).toHaveLength(3);
    for (const entry of RIVAL_LISTING_ARCHETYPE_SEEDS) {
      expect(entry.id).toBeTruthy();
      expect(entry.titlePrefix).toBeTruthy();
      expect(entry.segment).toBeTruthy();
      expect(entry.sourceBias).toBeTruthy();
      expect(typeof entry.baseHeat).toBe('number');
      expect(typeof entry.freshness).toBe('number');
      expect(typeof entry.storyStrength).toBe('number');
      expect(typeof entry.leadSiphonPower).toBe('number');
      expect(typeof entry.ownerAnchorPower).toBe('number');
    }
  });

  it('OWNER_ARCHETYPE_SEEDS is runtime immutable: push throws TypeError', () => {
    expect(() => { (OWNER_ARCHETYPE_SEEDS as any[]).push({} as any); }).toThrow(TypeError);
  });

  it('CUSTOMER_ARCHETYPE_SEEDS is runtime immutable: push throws TypeError', () => {
    expect(() => { (CUSTOMER_ARCHETYPE_SEEDS as any[]).push({} as any); }).toThrow(TypeError);
  });

  it('RIVAL_STORE_ARCHETYPE_SEEDS nested districtFocus is runtime immutable', () => {
    const firstSeed = RIVAL_STORE_ARCHETYPE_SEEDS[0];
    expect(firstSeed.districtFocus.length).toBeGreaterThan(0);
    expect(() => { (firstSeed.districtFocus as any).push('invalid'); }).toThrow(TypeError);
  });

  it('CUSTOMER_ARCHETYPE_SEEDS nested layouts is runtime immutable', () => {
    const firstSeed = CUSTOMER_ARCHETYPE_SEEDS[0];
    expect(firstSeed.layouts.length).toBeGreaterThan(0);
    expect(() => { (firstSeed.layouts as any).push('invalid'); }).toThrow(TypeError);
  });

  it('CUSTOMER_ARCHETYPE_SEEDS nested preferences is runtime immutable', () => {
    const firstSeed = CUSTOMER_ARCHETYPE_SEEDS[0];
    expect(firstSeed.preferences.length).toBeGreaterThan(0);
    expect(() => { (firstSeed.preferences as any).push('invalid'); }).toThrow(TypeError);
  });

  it('seed arrays are typed correctly', () => {
    // Compile-time assertions — if these lines type-check, the types are correct.
    const _owner: readonly OwnerArchetype[] = OWNER_ARCHETYPE_SEEDS;
    const _customer: readonly CustomerProfile[] = CUSTOMER_ARCHETYPE_SEEDS;
    const _channel: readonly ChannelProfile[] = CHANNEL_ARCHETYPE_SEEDS;
    const _rivalStore: readonly RivalStoreArchetype[] = RIVAL_STORE_ARCHETYPE_SEEDS;
    const _rivalListing: readonly RivalListingArchetype[] = RIVAL_LISTING_ARCHETYPE_SEEDS;

    expect(_owner).toBe(OWNER_ARCHETYPE_SEEDS);
    expect(_customer).toBe(CUSTOMER_ARCHETYPE_SEEDS);
    expect(_channel).toBe(CHANNEL_ARCHETYPE_SEEDS);
    expect(_rivalStore).toBe(RIVAL_STORE_ARCHETYPE_SEEDS);
    expect(_rivalListing).toBe(RIVAL_LISTING_ARCHETYPE_SEEDS);
  });
});
