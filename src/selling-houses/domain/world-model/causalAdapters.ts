/**
 * Causal adapters — derive WorldCausalEvents from existing data sources.
 *
 * These adapters are PURE functions: they read existing data structures and
 * produce causal events without mutating the source.
 *
 * Source data:
 * 1. MarketOpeningSnapshot.recentWorldEvents → OpeningWorldEventImported
 * 2. DomainEventEntry[] (eventStore) → typed causal events
 * 3. RivalListing repricing patterns → RivalListingRepriced
 * 4. CompetitionPressureSnapshot → OwnerMarketPressurePerceived
 *
 * Mother model alignment:
 * - Section 13: Causal Transmission (source signal → actor receives → belief/pressure changes)
 * - Section 14.3: Ownership Before Extraction (adapt first, migrate later)
 *
 * Hard constraints:
 * - Pure in core — no GameState mutation
 * - No runtime/application/UI imports
 * - Deterministic: same input → same causal event IDs
 * - Adapters produce events; they do NOT decide consequences
 */

import type {
  WorldCausalEvent,
  OpeningWorldEventImported,
  RivalListingRepriced,
  MarketHeatShifted,
  OwnerMarketPressurePerceived,
  CustomerComparedListings,
  BrokerRecommendationChanged,
  MatterPriorityChanged,
} from './causalEvents.js';

import {
  buildOpeningWorldEventImported,
  buildRivalListingRepriced,
  buildMarketHeatShifted,
  buildOwnerMarketPressurePerceived,
  buildCustomerComparedListings,
  buildBrokerRecommendationChanged,
  buildMatterPriorityChanged,
} from './causalEvents.js';

import type { MarketOpeningSnapshot, RecentWorldEvent } from './marketWorldTypes.js';

// ---------------------------------------------------------------------------
// Adapter 1: MarketOpeningSnapshot.recentWorldEvents → OpeningWorldEventImported
// ---------------------------------------------------------------------------

/**
 * Convert opening snapshot recent events into OpeningWorldEventImported causal events.
 *
 * Each RecentWorldEvent represents something that happened before the player entered.
 * The adapter wraps it as a causal ledger entry with provenance tracking.
 */
export function adaptOpeningRecentEvents(
  snapshot: MarketOpeningSnapshot,
  day: number = 0,
): readonly OpeningWorldEventImported[] {
  return snapshot.recentWorldEvents.map((event, index) =>
    buildOpeningWorldEventImported(
      `opening-imported-${snapshot.seed}-${index}`,
      day,
      {
        originalEventId: `opening-evt-${snapshot.seed}-${index}`,
        originalTitle: event.summary,
        originalDay: Math.max(0, day - event.daysAgo),
        originalActor: 'system',
        targetMarketCellId: event.marketCellId,
      },
    ),
  );
}

// ---------------------------------------------------------------------------
// Adapter 2: DomainEventEntry-like → typed causal events
// ---------------------------------------------------------------------------

/**
 * Minimal shape required from DomainEventEntry for causal adaptation.
 * This avoids importing domain/models.ts directly.
 */
export interface DomainEventLike {
  readonly id: string;
  readonly day: number;
  readonly kind: string;
  readonly actor: string;
  readonly title: string;
  readonly detail: string;
  readonly caseId?: string;
  readonly payload: Record<string, unknown>;
}

/**
 * Map DomainEventEntry kinds to causal event kinds.
 * Returns null if the event kind doesn't map to a causal event.
 */
export function adaptDomainEventToCausal(
  event: DomainEventLike,
): WorldCausalEvent | null {
  // Market events → MarketHeatShifted
  if (event.kind === 'market_event') {
    const targetCellId = (event.payload['targetMarketCellId'] as string)
      ?? (event.payload['marketCellId'] as string)
      ?? '';
    const heatDelta = (event.payload['demandHeatDelta'] as number)
      ?? (event.payload['heatDelta'] as number)
      ?? 0;
    if (targetCellId) {
      return buildMarketHeatShifted(
        `causal-market-${event.id}`,
        event.day,
        {
          marketCellId: targetCellId,
          before: Math.max(0, 50 - heatDelta),
          after: 50,
          sourceSignalId: event.id,
          sourceSignalType: event.kind,
          confidence: 0.7,
        },
        { actorIds: [event.actor], causeEventIds: [event.id] },
      );
    }
  }

  // Case lost to rival → OwnerMarketPressurePerceived
  if (event.kind === 'case_lost_to_rival' && event.caseId) {
    return buildOwnerMarketPressurePerceived(
      `causal-rival-pressure-${event.id}`,
      event.day,
      {
        caseId: event.caseId,
        perceivedSignalIds: [event.id],
        pressureDelta: 20,
        delayDays: 0,
        confidence: 0.9,
      },
      { actorIds: [event.actor], causeEventIds: [event.id] },
    );
  }

  // Opportunity advanced → CustomerComparedListings
  if (event.kind === 'opportunity_advanced' && event.caseId) {
    const opportunityId = (event.payload['opportunityId'] as string) ?? event.id;
    return buildCustomerComparedListings(
      `causal-compare-${event.id}`,
      event.day,
      {
        customerId: (event.payload['customerId'] as string) ?? undefined,
        comparedListingIds: [event.caseId],
        attentionDelta: 5,
        reasonSignals: [event.title],
      },
      { causeEventIds: [event.id] },
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Adapter 3: RivalListing-like repricing → RivalListingRepriced
// ---------------------------------------------------------------------------

/**
 * Minimal shape for a rival listing repricing event.
 */
export interface RivalListingRepriceInput {
  readonly listingId: string;
  readonly acnId: string;
  readonly brokerId?: string;
  readonly oldPrice: number;
  readonly newPrice: number;
  readonly affectedMarketCellIds: readonly string[];
  readonly day: number;
}

export function adaptRivalListingReprice(
  input: RivalListingRepriceInput,
  causeEventIds: readonly string[] = [],
): RivalListingRepriced {
  return buildRivalListingRepriced(
    `causal-rival-reprice-${input.listingId}-${input.day}`,
    input.day,
    {
      listingId: input.listingId,
      acnId: input.acnId,
      brokerId: input.brokerId,
      oldPrice: input.oldPrice,
      newPrice: input.newPrice,
      priceDelta: input.newPrice - input.oldPrice,
      affectedMarketCellIds: input.affectedMarketCellIds,
    },
    {
      actorIds: input.brokerId ? [input.brokerId] : [],
      causeEventIds,
    },
  );
}

// ---------------------------------------------------------------------------
// Adapter 4: CompetitionPressureSnapshot-like → OwnerMarketPressurePerceived
// ---------------------------------------------------------------------------

/**
 * Minimal shape for competition pressure data.
 */
export interface CompetitionPressureLike {
  readonly caseId: string;
  readonly day: number;
  readonly netHeatDelta: number;
  readonly netTrustDelta: number;
  readonly sourceEntityIds: readonly string[];
  readonly ownerId?: string;
}

export function adaptCompetitionPressureToOwnerPerception(
  pressure: CompetitionPressureLike,
  causeEventIds: readonly string[] = [],
  delayDays: number = 0,
): OwnerMarketPressurePerceived {
  const pressureDelta = Math.abs(pressure.netHeatDelta) + Math.abs(pressure.netTrustDelta) * 2;
  return buildOwnerMarketPressurePerceived(
    `causal-owner-pressure-${pressure.caseId}-${pressure.day}`,
    pressure.day,
    {
      ownerId: pressure.ownerId,
      caseId: pressure.caseId,
      perceivedSignalIds: pressure.sourceEntityIds,
      pressureDelta: Math.round(pressureDelta * 10) / 10,
      delayDays,
      confidence: 0.75,
    },
    { causeEventIds },
  );
}

// ---------------------------------------------------------------------------
// Adapter 5: MarketCell-like shift → MarketHeatShifted
// ---------------------------------------------------------------------------

export interface MarketCellShiftInput {
  readonly marketCellId: string;
  readonly before: number;
  readonly after: number;
  readonly sourceSignalId: string;
  readonly sourceSignalType: string;
  readonly day: number;
}

export function adaptMarketCellHeatShift(
  input: MarketCellShiftInput,
  causeEventIds: readonly string[] = [],
): MarketHeatShifted {
  return buildMarketHeatShifted(
    `causal-heat-shift-${input.marketCellId}-${input.day}`,
    input.day,
    {
      marketCellId: input.marketCellId,
      before: input.before,
      after: input.after,
      sourceSignalId: input.sourceSignalId,
      sourceSignalType: input.sourceSignalType,
      confidence: 0.8,
    },
    { causeEventIds },
  );
}

// ---------------------------------------------------------------------------
// Adapter 6: Case-like recommendation → BrokerRecommendationChanged
// ---------------------------------------------------------------------------

export interface BrokerRecommendationInput {
  readonly caseId: string;
  readonly recommendationKind: import('./causalEvents.js').RecommendationKind;
  readonly causedByEventIds: readonly string[];
  readonly explanationFacts: readonly string[];
  readonly day: number;
  readonly actorIds?: readonly string[];
}

export function adaptBrokerRecommendation(
  input: BrokerRecommendationInput,
): BrokerRecommendationChanged {
  return buildBrokerRecommendationChanged(
    `causal-rec-${input.caseId}-${input.recommendationKind}-${input.day}`,
    input.day,
    {
      caseId: input.caseId,
      recommendationKind: input.recommendationKind,
      causedByEventIds: input.causedByEventIds,
      explanationFacts: input.explanationFacts,
    },
    { actorIds: input.actorIds },
  );
}

// ---------------------------------------------------------------------------
// Adapter 7: Case-like priority → MatterPriorityChanged
// ---------------------------------------------------------------------------

export interface MatterPriorityInput {
  readonly caseId: string;
  readonly matterId?: string;
  readonly priorityBefore: number;
  readonly priorityAfter: number;
  readonly causedByEventIds: readonly string[];
  readonly day: number;
}

export function adaptMatterPriority(
  input: MatterPriorityInput,
): MatterPriorityChanged {
  return buildMatterPriorityChanged(
    `causal-priority-${input.caseId}-${input.day}`,
    input.day,
    {
      caseId: input.caseId,
      matterId: input.matterId,
      priorityBefore: input.priorityBefore,
      priorityAfter: input.priorityAfter,
      causedByEventIds: input.causedByEventIds,
    },
  );
}

// ---------------------------------------------------------------------------
// Batch adapter: opening snapshot → full initial causal ledger entries
// ---------------------------------------------------------------------------

/**
 * Build the complete initial causal ledger from an opening snapshot.
 * Returns all causal events that should seed the ledger before day 1.
 */
export function buildInitialCausalEventsFromOpening(
  snapshot: MarketOpeningSnapshot,
): readonly WorldCausalEvent[] {
  const openingEvents = adaptOpeningRecentEvents(snapshot, 0);
  const heatShifts = snapshot.marketCells.map((cell, index) =>
    buildMarketHeatShifted(
      `opening-heat-${snapshot.seed}-${index}`,
      0,
      {
        marketCellId: cell.id,
        before: 50,
        after: cell.heat,
        sourceSignalId: `opening-cell-${cell.id}`,
        sourceSignalType: 'market-signal',
        confidence: 0.85,
      },
    ),
  );

  return [...openingEvents, ...heatShifts];
}
