import { describe, it, expect } from 'vitest';
import {
  LEAD_SOURCE_TYPES,
  CUSTOMER_DECISION_STYLES,
  OWNER_PREFERRED_TACTICS,
  RIVAL_STORE_TYPES,
  RIVAL_STORE_STYLES,
  RIVAL_LISTING_SOURCE_BIASES,
  isLeadSourceType,
  isCustomerDecisionStyle,
} from '../archetypeTaxonomy.js';
import type {
  LeadSourceType,
  CustomerDecisionStyle,
  CustomerProfile,
  ChannelProfile,
  OwnerArchetype,
  RivalStoreArchetype,
  RivalListingArchetype,
} from '../archetypeTaxonomy.js';

describe('archetypeTaxonomy', () => {
  it('LEAD_SOURCE_TYPES has 2 values', () => {
    expect(LEAD_SOURCE_TYPES).toEqual(['direct', 'broker']);
  });

  it('LeadSourceType derives from tuple', () => {
    const values: LeadSourceType[] = [...LEAD_SOURCE_TYPES];
    expect(values).toHaveLength(2);
  });

  it('isLeadSourceType accepts valid values', () => {
    expect(isLeadSourceType('direct')).toBe(true);
    expect(isLeadSourceType('broker')).toBe(true);
  });

  it('isLeadSourceType rejects invalid values', () => {
    expect(isLeadSourceType('referral')).toBe(false);
    expect(isLeadSourceType('')).toBe(false);
    expect(isLeadSourceType(42)).toBe(false);
  });

  it('CUSTOMER_DECISION_STYLES has 3 values', () => {
    expect(CUSTOMER_DECISION_STYLES).toEqual(['decisive', 'balanced', 'hesitant']);
  });

  it('isCustomerDecisionStyle accepts valid values', () => {
    expect(isCustomerDecisionStyle('decisive')).toBe(true);
    expect(isCustomerDecisionStyle('balanced')).toBe(true);
    expect(isCustomerDecisionStyle('hesitant')).toBe(true);
  });

  it('isCustomerDecisionStyle rejects invalid values', () => {
    expect(isCustomerDecisionStyle('aggressive')).toBe(false);
    expect(isCustomerDecisionStyle(null)).toBe(false);
  });

  it('OWNER_PREFERRED_TACTICS has 3 values', () => {
    expect(OWNER_PREFERRED_TACTICS).toEqual(['hold-story', 'small-cut', 'deep-cut']);
  });

  it('RIVAL_STORE_TYPES has 2 values', () => {
    expect(RIVAL_STORE_TYPES).toEqual(['same_company', 'external_company']);
  });

  it('RIVAL_STORE_STYLES has 4 values', () => {
    expect(RIVAL_STORE_STYLES).toEqual(['aggressive', 'steady', 'relationship', 'traffic']);
  });

  it('RIVAL_LISTING_SOURCE_BIASES has 3 values', () => {
    expect(RIVAL_LISTING_SOURCE_BIASES).toEqual(['same_company', 'external_company', 'mixed']);
  });

  it('CustomerProfile can be constructed with minimal sample', () => {
    const profile: CustomerProfile = {
      id: 'cus-1',
      name: 'Test Customer',
      profile: 'test-profile',
      budgetMin: 100,
      budgetMax: 200,
      targetDistrict: 'D1',
      layouts: ['2BR'],
      activity: 50,
      urgency: 60,
      priceSensitivity: 0.5,
      preferences: ['quiet'],
    };
    expect(profile.id).toBe('cus-1');
  });

  it('OwnerArchetype can be constructed with minimal sample', () => {
    const owner: OwnerArchetype = {
      id: 'owner-1',
      label: 'Steady Owner',
      description: 'Test',
      trustDecayMultiplier: 1.0,
      priceElasticity: 0.5,
      urgencyGrowthBonus: 0,
      heatSensitivity: 0.5,
      patienceDelta: 0,
      preferredTactic: 'hold-story',
    };
    expect(owner.preferredTactic).toBe('hold-story');
  });

  it('ChannelProfile can be constructed with minimal sample', () => {
    const channel: ChannelProfile = {
      id: 'ch-1',
      name: 'Test Channel',
      quality: 80,
      controllability: 60,
      leadSource: 'direct',
    };
    expect(channel.leadSource).toBe('direct');
  });

  it('RivalStoreArchetype can be constructed with minimal sample', () => {
    const store: RivalStoreArchetype = {
      id: 'rs-1',
      name: 'Rival Store',
      type: 'external_company',
      style: 'aggressive',
      districtFocus: ['D1'],
      leadCapturePower: 50,
      sellerInfluencePower: 40,
      pricingPressurePower: 30,
    };
    expect(store.type).toBe('external_company');
  });

  it('RivalListingArchetype can be constructed with minimal sample', () => {
    const listing: RivalListingArchetype = {
      id: 'rl-1',
      titlePrefix: '竞品',
      segment: '3BR',
      sourceBias: 'mixed',
      baseHeat: 50,
      freshness: 80,
      storyStrength: 60,
      leadSiphonPower: 40,
      ownerAnchorPower: 30,
    };
    expect(listing.sourceBias).toBe('mixed');
  });

  it('archetypeTaxonomy.ts does not import from domain', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const source = fs.readFileSync(
      path.join(process.cwd(), 'src/selling-houses/core/business-rules/archetypes/archetypeTaxonomy.ts'),
      'utf-8',
    );
    expect(source).not.toContain('domain/models');
    expect(source).not.toContain('domain/world-model');
  });
});
