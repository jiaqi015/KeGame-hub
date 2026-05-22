/**
 * Canonical type fragments extracted from domain Case and Opportunity types.
 * These allow core/world-state/models.ts to avoid importing the full Case/Opportunity
 * aggregate from domain, using only the specific type-index properties it needs.
 */

export type AssetCaseStatus = 'active' | 'sold' | 'withdrawn' | 'lost_to_rival';

export type OwnerPersonality = 'pragmatic' | 'emotional' | 'urgent';

export type OpportunityStatus = 'active' | 'won' | 'lost' | 'closed';

export type OpportunityLifecycleStatus = 'active' | 'stagnated' | 'lost' | 'closed_by_deal' | 'closed_by_case';

export type OpportunityVisibility = 'shadow' | 'revealed';

export interface OpportunityHistoryEntry {
  day: number;
  stage: string;
}
