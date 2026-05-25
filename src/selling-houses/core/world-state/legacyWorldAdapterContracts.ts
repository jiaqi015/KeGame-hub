/**
 * World-state adapter legacy contracts, derived from the canonical kernel.
 *
 * These contracts express what world-state adapters need from the legacy
 * Case/Opportunity/GameState shapes. They use type aliases from the single
 * canonical source in legacyCompatibilityContracts.ts so field drift is impossible.
 *
 * Array fields use mutable types so domain types satisfy the contract without
 * casting. Readonly arrays appear where the domain type is already readonly.
 */

import type {
  LegacyCanonicalCaseLike,
  LegacyCanonicalOpportunityLike,
  LegacyCanonicalGameStateLike,
  LegacyCanonicalMarketCellLike,
  LegacyCanonicalCustomerLike,
  LegacyCanonicalCompetitionGroupLike,
  LegacyCanonicalProductRunLike,
  LegacyCanonicalDomainEventLike,
} from './legacyCompatibilityContracts.js';

export type LegacyWorldCaseLike = LegacyCanonicalCaseLike;

export type LegacyWorldOpportunityLike = LegacyCanonicalOpportunityLike;

export type LegacyWorldGameStateLike = LegacyCanonicalGameStateLike;

export type LegacyWorldMarketCellLike = LegacyCanonicalMarketCellLike;

export type LegacyWorldCustomerLike = LegacyCanonicalCustomerLike;

export type LegacyWorldCompetitionGroupLike = LegacyCanonicalCompetitionGroupLike;

export type LegacyWorldProductRunLike = LegacyCanonicalProductRunLike;

export type LegacyWorldDomainEventLike = LegacyCanonicalDomainEventLike;
