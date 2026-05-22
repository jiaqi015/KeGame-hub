/**
 * archetypeTaxonomy.ts — canonical definitions of archetype-related types.
 *
 * Architecture position:
 *   This is the single authority for LeadSourceType, CustomerDecisionStyle,
 *   CustomerProfile, ChannelProfile, OwnerArchetype, RivalStoreArchetype,
 *   and RivalListingArchetype.
 *   Domain re-exports from here; core imports from here.
 *   This prevents core→domain layer boundary violations.
 */

// ── Literal union types with runtime tuples ──────────────────────────────

export const LEAD_SOURCE_TYPES = ['direct', 'broker'] as const;
export type LeadSourceType = (typeof LEAD_SOURCE_TYPES)[number];

const LEAD_SOURCE_TYPE_SET: ReadonlySet<string> = new Set(LEAD_SOURCE_TYPES);
export function isLeadSourceType(value: unknown): value is LeadSourceType {
  return typeof value === 'string' && LEAD_SOURCE_TYPE_SET.has(value);
}

export const CUSTOMER_DECISION_STYLES = ['decisive', 'balanced', 'hesitant'] as const;
export type CustomerDecisionStyle = (typeof CUSTOMER_DECISION_STYLES)[number];

const CUSTOMER_DECISION_STYLE_SET: ReadonlySet<string> = new Set(CUSTOMER_DECISION_STYLES);
export function isCustomerDecisionStyle(value: unknown): value is CustomerDecisionStyle {
  return typeof value === 'string' && CUSTOMER_DECISION_STYLE_SET.has(value);
}

export const OWNER_PREFERRED_TACTICS = ['hold-story', 'small-cut', 'deep-cut'] as const;
export type OwnerPreferredTactic = (typeof OWNER_PREFERRED_TACTICS)[number];

export const RIVAL_STORE_TYPES = ['same_company', 'external_company'] as const;
export type RivalStoreType = (typeof RIVAL_STORE_TYPES)[number];

export const RIVAL_STORE_STYLES = ['aggressive', 'steady', 'relationship', 'traffic'] as const;
export type RivalStoreStyle = (typeof RIVAL_STORE_STYLES)[number];

export const RIVAL_LISTING_SOURCE_BIASES = ['same_company', 'external_company', 'mixed'] as const;
export type RivalListingSourceBias = (typeof RIVAL_LISTING_SOURCE_BIASES)[number];

// ── Interface types ──────────────────────────────────────────────────────

export interface CustomerProfile {
  id: string;
  name: string;
  profile: string;
  budgetMin: number;
  budgetMax: number;
  targetDistrict: string;
  layouts: readonly string[];
  activity: number;
  urgency: number;
  priceSensitivity: number;
  preferences: readonly string[];
}

export interface ChannelProfile {
  id: string;
  name: string;
  quality: number;
  controllability: number;
  leadSource?: LeadSourceType;
}

export interface OwnerArchetype {
  id: string;
  label: string;
  description: string;
  trustDecayMultiplier: number;
  priceElasticity: number;
  urgencyGrowthBonus: number;
  heatSensitivity: number;
  patienceDelta: number;
  preferredTactic: OwnerPreferredTactic;
}

export interface RivalStoreArchetype {
  id: string;
  name: string;
  type: RivalStoreType;
  style: RivalStoreStyle;
  districtFocus: readonly string[];
  leadCapturePower: number;
  sellerInfluencePower: number;
  pricingPressurePower: number;
  acnId?: string;
  brandId?: string;
}

export interface RivalListingArchetype {
  id: string;
  titlePrefix: string;
  segment: string;
  sourceBias: RivalListingSourceBias;
  baseHeat: number;
  freshness: number;
  storyStrength: number;
  leadSiphonPower: number;
  ownerAnchorPower: number;
}
