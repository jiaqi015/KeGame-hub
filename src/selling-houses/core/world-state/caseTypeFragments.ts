/**
 * Canonical type fragments extracted from domain Case and Opportunity types.
 * These allow core/world-state/models.ts to avoid importing the full Case/Opportunity
 * aggregate from domain, using only the specific type-index properties it needs.
 *
 * Each union type has a corresponding runtime constant array and guard function
 * so that adapters can validate legacy string values before casting.
 */

// ---------------------------------------------------------------------------
// AssetCaseStatus
// ---------------------------------------------------------------------------

export const ASSET_CASE_STATUSES = ['active', 'sold', 'withdrawn', 'lost_to_rival'] as const;
export type AssetCaseStatus = (typeof ASSET_CASE_STATUSES)[number];

const ASSET_CASE_STATUS_SET: ReadonlySet<string> = new Set(ASSET_CASE_STATUSES);
export function isAssetCaseStatus(value: unknown): value is AssetCaseStatus {
  return typeof value === 'string' && ASSET_CASE_STATUS_SET.has(value);
}

// ---------------------------------------------------------------------------
// OwnerPersonality
// ---------------------------------------------------------------------------

export const OWNER_PERSONALITIES = ['pragmatic', 'emotional', 'urgent'] as const;
export type OwnerPersonality = (typeof OWNER_PERSONALITIES)[number];

const OWNER_PERSONALITY_SET: ReadonlySet<string> = new Set(OWNER_PERSONALITIES);
export function isOwnerPersonality(value: unknown): value is OwnerPersonality {
  return typeof value === 'string' && OWNER_PERSONALITY_SET.has(value);
}

// ---------------------------------------------------------------------------
// OpportunityStatus
// ---------------------------------------------------------------------------

export const OPPORTUNITY_STATUSES = ['active', 'won', 'lost', 'closed'] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];

const OPPORTUNITY_STATUS_SET: ReadonlySet<string> = new Set(OPPORTUNITY_STATUSES);
export function isOpportunityStatus(value: unknown): value is OpportunityStatus {
  return typeof value === 'string' && OPPORTUNITY_STATUS_SET.has(value);
}

// ---------------------------------------------------------------------------
// OpportunityLifecycleStatus
// ---------------------------------------------------------------------------

export const OPPORTUNITY_LIFECYCLE_STATUSES = ['active', 'stagnated', 'lost', 'closed_by_deal', 'closed_by_case'] as const;
export type OpportunityLifecycleStatus = (typeof OPPORTUNITY_LIFECYCLE_STATUSES)[number];

const OPPORTUNITY_LIFECYCLE_STATUS_SET: ReadonlySet<string> = new Set(OPPORTUNITY_LIFECYCLE_STATUSES);
export function isOpportunityLifecycleStatus(value: unknown): value is OpportunityLifecycleStatus {
  return typeof value === 'string' && OPPORTUNITY_LIFECYCLE_STATUS_SET.has(value);
}

// ---------------------------------------------------------------------------
// OpportunityVisibility
// ---------------------------------------------------------------------------

export const OPPORTUNITY_VISIBILITIES = ['shadow', 'revealed'] as const;
export type OpportunityVisibility = (typeof OPPORTUNITY_VISIBILITIES)[number];

const OPPORTUNITY_VISIBILITY_SET: ReadonlySet<string> = new Set(OPPORTUNITY_VISIBILITIES);
export function isOpportunityVisibility(value: unknown): value is OpportunityVisibility {
  return typeof value === 'string' && OPPORTUNITY_VISIBILITY_SET.has(value);
}

// ---------------------------------------------------------------------------
// OpportunityHistoryEntry
// ---------------------------------------------------------------------------

export interface OpportunityHistoryEntry {
  day: number;
  stage: string;
}
