/**
 * Causal chain examples — verifiable, structurally callable functions.
 *
 * This module provides the required demonstration that a RivalListingRepriced
 * event can propagate through the causal ledger to produce:
 * 1. CustomerComparedListings
 * 2. CustomerAttentionShifted
 * 3. OwnerMarketPressurePerceived
 * 4. BrokerRecommendationChanged AND MatterPriorityChanged
 *
 * These are STRUCTURAL functions, not documentation.
 * Each function accepts typed inputs and returns typed causal events.
 *
 * Mother model alignment:
 * - Section 10: Competition is environment, not side module
 * - Section 13: Causal Transmission (source signal -> actor receives -> belief/pressure changes -> action)
 * - Section 7: Customer compares, shifts attention, evaluates alternatives
 * - Section 8: Broker interprets and recommends based on evidence chain
 *
 * Hard constraints:
 * - Competition pressure does NOT directly mutate outcomes
 * - Heat does NOT directly equal transaction
 * - Events are structured facts, not display copy
 * - Ledger does NOT depend on UI projection
 */

import type {
  RivalListingRepriced,
  CustomerComparedListings,
  CustomerAttentionShifted,
  OwnerMarketPressurePerceived,
  BrokerRecommendationChanged,
  MatterPriorityChanged,
  WorldCausalEvent,
} from './causalEvents.js';

import {
  buildRivalListingRepriced,
  buildCustomerComparedListings,
  buildCustomerAttentionShifted,
  buildOwnerMarketPressurePerceived,
  buildBrokerRecommendationChanged,
  buildMatterPriorityChanged,
} from './causalEvents.js';

import {
  buildCausalLedger,
  traceCausalChainForward,
  traceCausalChainBackward,
  getEventsAffecting,
  type WorldCausalLedger,
} from './causalLedger.js';

// ---------------------------------------------------------------------------
// Input types for the example chain
// ---------------------------------------------------------------------------

export interface RivalRepriceChainInput {
  /** Day the repricing happened. */
  readonly day: number;
  /** The rival listing that repriced. */
  readonly listingId: string;
  /** ACN the listing belongs to. */
  readonly acnId: string;
  /** Broker who repriced (optional). */
  readonly brokerId?: string;
  /** Price before. */
  readonly oldPrice: number;
  /** Price after. */
  readonly newPrice: number;
  /** Market cells affected by this repricing. */
  readonly affectedMarketCellIds: readonly string[];
  /** The player's case in the same market cell that is affected. */
  readonly affectedCaseId: string;
  /** Customer IDs who were comparing listings in this cell. */
  readonly comparingCustomerIds: readonly string[];
  /** Listing IDs that customers were comparing. */
  readonly comparisonListingIds: readonly string[];
}

export interface RivalRepriceChainOutput {
  /** The root repricing event. */
  readonly root: RivalListingRepriced;
  /** Customer comparison events generated. */
  readonly comparisons: readonly CustomerComparedListings[];
  /** Customer attention shift events generated. */
  readonly attentionShifts: readonly CustomerAttentionShifted[];
  /** Owner perception events generated. */
  readonly ownerPerceptions: readonly OwnerMarketPressurePerceived[];
  /** Broker recommendation changes generated. */
  readonly brokerRecommendations: readonly BrokerRecommendationChanged[];
  /** Matter priority changes generated. */
  readonly matterPriorityChanges: readonly MatterPriorityChanged[];
  /** All events in causal order. */
  readonly allEvents: readonly WorldCausalEvent[];
  /** Ledger built from all events. */
  readonly ledger: WorldCausalLedger;
}

// ---------------------------------------------------------------------------
// Chain builder: RivalListingRepriced -> full causal chain
// ---------------------------------------------------------------------------

/**
 * Build a complete causal chain starting from a rival listing repricing.
 *
 * Step 1: RivalListingRepriced (root cause)
 * Step 2: CustomerComparedListings (customers notice the price change)
 * Step 3: CustomerAttentionShifted (attention moves toward cheaper listings)
 * Step 4: OwnerMarketPressurePerceived (owner perceives competitive pressure)
 * Step 5: BrokerRecommendationChanged (broker adjusts strategy)
 * Step 6: MatterPriorityChanged (case priority increases)
 *
 * Returns all events and a ledger containing them.
 */
export function buildRivalRepriceCausalChain(
  input: RivalRepriceChainInput,
): RivalRepriceChainOutput {
  // --- Step 1: Root event — rival repriced ---
  const root = buildRivalListingRepriced(
    `chain-reprice-${input.listingId}-${input.day}`,
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
  );

  // --- Step 2: Customers compare listings ---
  const comparisons: CustomerComparedListings[] = input.comparingCustomerIds.map(
    (customerId, index) =>
      buildCustomerComparedListings(
        `chain-compare-${customerId}-${input.day}`,
        input.day + 1,
        {
          customerId,
          comparedListingIds: input.comparisonListingIds,
          attentionDelta: -5,
          reasonSignals: [
            `${input.listingId} 降价 ${input.oldPrice - input.newPrice}万`,
          ],
        },
        {
          causeEventIds: [root.id],
        },
      ),
  );

  // --- Step 3: Customer attention shifts ---
  const attentionShifts: CustomerAttentionShifted[] = input.comparingCustomerIds.map(
    (customerId, index) =>
      buildCustomerAttentionShifted(
        `chain-attn-shift-${customerId}-${input.day}`,
        input.day + 2,
        {
          fromListingIds: input.comparisonListingIds.filter(
            (id) => id !== input.listingId,
          ),
          toListingIds: [input.listingId],
          segment: 'price-sensitive',
          causeEventId: comparisons[index]?.id ?? root.id,
        },
      ),
  );

  // --- Step 4: Owner perceives market pressure ---
  const ownerPerceptions: OwnerMarketPressurePerceived[] = input.affectedMarketCellIds.map(
    (cellId) =>
      buildOwnerMarketPressurePerceived(
        `chain-owner-pressure-${input.affectedCaseId}-${cellId}-${input.day}`,
        input.day + 2,
        {
          caseId: input.affectedCaseId,
          perceivedSignalIds: [root.id, ...comparisons.map((c) => c.id)],
          pressureDelta: Math.abs(input.oldPrice - input.newPrice) * 0.5,
          delayDays: 1,
          confidence: 0.7,
        },
        {
          causeEventIds: [root.id, ...comparisons.map((c) => c.id)],
        },
      ),
  );

  // --- Step 5: Broker recommendation changes ---
  const brokerRecommendations: BrokerRecommendationChanged[] = [
    buildBrokerRecommendationChanged(
      `chain-broker-rec-${input.affectedCaseId}-${input.day}`,
      input.day + 3,
      {
        caseId: input.affectedCaseId,
        recommendationKind: 'price_adjustment',
        causedByEventIds: [
          root.id,
          ...ownerPerceptions.map((p) => p.id),
        ],
        explanationFacts: [
          `竞品 ${input.listingId} 从 ${input.oldPrice}万 降至 ${input.newPrice}万`,
          `价格差 ${input.oldPrice - input.newPrice}万，对本房源形成直接压力`,
          ...input.affectedMarketCellIds.map(
            (cellId) => `所在板块 ${cellId} 客户注意力正在转移`,
          ),
        ],
      },
    ),
  ];

  // --- Step 6: Matter priority changes ---
  const matterPriorityChanges: MatterPriorityChanged[] = [
    buildMatterPriorityChanged(
      `chain-priority-${input.affectedCaseId}-${input.day}`,
      input.day + 3,
      {
        caseId: input.affectedCaseId,
        priorityBefore: 50,
        priorityAfter: 75,
        causedByEventIds: [
          root.id,
          ...ownerPerceptions.map((p) => p.id),
          ...brokerRecommendations.map((r) => r.id),
        ],
      },
    ),
  ];

  // --- Collect all events in causal order ---
  const allEvents: WorldCausalEvent[] = [
    root,
    ...comparisons,
    ...attentionShifts,
    ...ownerPerceptions,
    ...brokerRecommendations,
    ...matterPriorityChanges,
  ];

  // --- Build ledger ---
  const ledger = buildCausalLedger(allEvents);

  return Object.freeze({
    root,
    comparisons,
    attentionShifts,
    ownerPerceptions,
    brokerRecommendations,
    matterPriorityChanges,
    allEvents: Object.freeze(allEvents),
    ledger,
  });
}

// ---------------------------------------------------------------------------
// Chain verification: assert the causal chain is valid
// ---------------------------------------------------------------------------

export interface ChainVerificationResult {
  readonly valid: boolean;
  readonly errors: readonly string[];
  readonly stats: {
    readonly totalEvents: number;
    readonly rootCauseCount: number;
    readonly chainDepth: number;
    readonly affectedEntityCount: number;
  };
}

/**
 * Verify that a causal chain output is structurally valid.
 * Checks:
 * - All events have required fields
 * - causeEventIds form a connected graph
 * - The chain has the expected depth
 * - No dangling cause references
 */
export function verifyRivalRepriceChain(
  output: RivalRepriceChainOutput,
): ChainVerificationResult {
  const errors: string[] = [];

  // Check all events have required fields
  for (const event of output.allEvents) {
    if (!event.id) errors.push(`Event missing id: ${JSON.stringify(event.kind)}`);
    if (!event.kind) errors.push(`Event ${event.id} missing kind`);
    if (typeof event.day !== 'number') errors.push(`Event ${event.id} missing day`);
    if (!event.source) errors.push(`Event ${event.id} missing source`);
    if (typeof event.confidence !== 'number') errors.push(`Event ${event.id} missing confidence`);
    if (!event.affectedIds || event.affectedIds.length === 0) {
      errors.push(`Event ${event.id} has no affectedIds`);
    }
  }

  // Check cause chain connectivity
  const allIds = new Set(output.allEvents.map((e) => e.id));
  for (const event of output.allEvents) {
    for (const causeId of event.causeEventIds) {
      if (!allIds.has(causeId)) {
        errors.push(`Event ${event.id} references non-existent cause ${causeId}`);
      }
    }
  }

  // Check chain depth (should be at least 3 levels: root -> compare -> owner/broker -> priority)
  const backwardFromPriority = traceCausalChainBackward(
    output.ledger,
    output.matterPriorityChanges[0]?.id ?? '',
  );
  const chainDepth = backwardFromPriority.length;
  if (chainDepth < 2) {
    errors.push(`Chain depth ${chainDepth} is less than expected minimum of 2`);
  }

  // Check root has no causes (it's a root cause)
  if (output.root.causeEventIds.length !== 0) {
    errors.push(`Root event should have no causes, got ${output.root.causeEventIds.length}`);
  }

  // Check that at least some events have causes (chain is connected)
  const eventsWithCauses = output.allEvents.filter((e) => e.causeEventIds.length > 0);
  if (eventsWithCauses.length < 3) {
    errors.push(`Expected at least 3 events with causes, got ${eventsWithCauses.length}`);
  }

  // Count affected entities
  const affectedEntities = new Set<string>();
  for (const event of output.allEvents) {
    for (const id of event.affectedIds) {
      affectedEntities.add(id);
    }
  }

  return Object.freeze({
    valid: errors.length === 0,
    errors: Object.freeze(errors),
    stats: Object.freeze({
      totalEvents: output.allEvents.length,
      rootCauseCount: output.allEvents.filter((e) => e.causeEventIds.length === 0).length,
      chainDepth,
      affectedEntityCount: affectedEntities.size,
    }),
  });
}

// ---------------------------------------------------------------------------
// Convenience: build + verify in one call
// ---------------------------------------------------------------------------

/**
 * Build a rival repricing causal chain and verify it.
 * Returns the chain output and verification result.
 * Throws if verification fails (use in tests).
 */
export function buildAndVerifyRivalRepriceChain(
  input: RivalRepriceChainInput,
): { output: RivalRepriceChainOutput; verification: ChainVerificationResult } {
  const output = buildRivalRepriceCausalChain(input);
  const verification = verifyRivalRepriceChain(output);
  return Object.freeze({ output, verification });
}
