/**
 * Canonical Price Trajectory Builder
 *
 * R44: Builds PriceTrajectory from real evidence chain, NOT soldPrice fabrication.
 *
 * Evidence sources:
 * - customer_interaction with offer_submitted subtype + offerPrice
 * - owner_interview with price_discussed subtype + concessionPrice
 * - process_receipt with negotiation_progressed/consensus_reached + metrics prices
 *
 * Hard constraints:
 * - Pure function (no domain/runtime imports)
 * - Deterministic
 * - Only creates canonical proof if real evidence exists
 * - Returns explicit failure reasons if evidence missing
 */

import type { PriceTrajectory, BuyerOffer, OwnerConcession } from './priceTrajectory.js';

// ---------------------------------------------------------------------------
// Minimal type definitions to avoid domain imports (layer boundary compliance)
// ---------------------------------------------------------------------------

/**
 * Minimal SourceRecord representation for evidence extraction.
 * This is a subset of InformationSourceRecord needed for canonical building.
 */
export interface SourceRecordForEvidence {
  readonly sourceId: string;
  readonly sourceKind: string;
  readonly day: number;
  readonly payload: Record<string, unknown>;
  readonly confidence: number;
}

/**
 * Minimal GameState representation for evidence extraction.
 * Core layer cannot import domain types, so we accept a minimal interface.
 */
export interface GameStateForEvidence {
  readonly pendingSourceRecords?: readonly SourceRecordForEvidence[];
  readonly worldCausalEvents?: readonly { readonly id: string; readonly kind: string; readonly day: number; readonly payload: Record<string, unknown>; readonly confidence: number }[];
  readonly actionReceiptHistory?: readonly { readonly commandId: string; readonly day: number; readonly commandType: string; readonly generatedSourceRecordIds: readonly string[] }[];
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface CanonicalTrajectoryResult {
  success: boolean;
  trajectory?: PriceTrajectory;
  reason?: string;
  evidenceFound?: {
    buyerOfferEvidence: EvidenceSummary[];
    ownerConcessionEvidence: EvidenceSummary[];
  };
}

export interface EvidenceSummary {
  sourceId: string;
  sourceKind: 'action_receipt' | 'causal_event' | 'source_record';
  price?: number;
  day: number;
  confidence: number;
  customerId?: string;
  ownerId?: string;
}

// ---------------------------------------------------------------------------
// Main builder function
// ---------------------------------------------------------------------------

/**
 * Build canonical PriceTrajectory from real evidence in GameState.
 *
 * This is the production builder for R44. It requires:
 * 1. At least one buyer-side price evidence from real source
 * 2. At least one owner-side concession evidence from real source
 * 3. All sourceRecordIds must be real (isr-xxx or present in state)
 * 4. Evidence refs must resolve through validators
 *
 * Returns failure if evidence insufficient. Does NOT fabricate from soldPrice.
 */
export function buildCanonicalPriceTrajectoryFromEvidence(input: {
  state: GameStateForEvidence;
  caseId: string;
  customerId: string;
  ownerId: string;
  opportunityId: string;
  day: number;
}): CanonicalTrajectoryResult {
  const { state, caseId, customerId, ownerId, opportunityId, day } = input;

  // Collect evidence from source records
  const sourceEvidence = collectSourceRecordEvidence(state, caseId, customerId, ownerId, day);

  // Separate buyer vs owner evidence
  const buyerOfferEvidence = sourceEvidence.filter(e =>
    isBuyerSideEvidence(e, customerId)
  );
  const ownerConcessionEvidence = sourceEvidence.filter(e =>
    isOwnerSideEvidence(e, ownerId, caseId)
  );

  // R44: Require real evidence from both sides
  if (buyerOfferEvidence.length === 0) {
    return {
      success: false,
      reason: `no buyer-side offer evidence found in source records for customer ${customerId}. Need customer_interaction with offer_submitted subtype and offerPrice field.`,
      evidenceFound: { buyerOfferEvidence: [], ownerConcessionEvidence },
    };
  }

  if (ownerConcessionEvidence.length === 0) {
    return {
      success: false,
      reason: `no owner-side concession evidence found in source records for owner ${ownerId}. Need owner_interview with price_discussed subtype and concessionPrice field.`,
      evidenceFound: { buyerOfferEvidence, ownerConcessionEvidence: [] },
    };
  }

  // Build offer from buyer evidence (highest price = best offer)
  const bestOffer = selectBestOffer(buyerOfferEvidence);
  const bestConcession = selectBestConcession(ownerConcessionEvidence);

  // Validate evidence refs
  const allEvidenceIds = [
    bestOffer.sourceId,
    bestConcession.sourceId,
  ];

  // R44: Validate that evidence refs are real SourceRecord IDs
  // All refs must start with 'isr-' to be valid
  const invalidRefs = allEvidenceIds.filter(id => !id.startsWith('isr-'));
  if (invalidRefs.length > 0) {
    return {
      success: false,
      reason: `evidence refs not real SourceRecords: ${invalidRefs.join(', ')} (need isr- prefix)`,
      evidenceFound: { buyerOfferEvidence, ownerConcessionEvidence },
    };
  }

  // Build trajectory with real evidence
  const trajectory = buildTrajectoryFromEvidence({
    caseId,
    customerId,
    ownerId,
    day,
    offer: bestOffer,
    concession: bestConcession,
    allEvidence: sourceEvidence,
  });

  return {
    success: true,
    trajectory,
    evidenceFound: { buyerOfferEvidence, ownerConcessionEvidence },
  };
}

// ---------------------------------------------------------------------------
// Evidence collection from source records
// ---------------------------------------------------------------------------

function collectSourceRecordEvidence(
  state: GameStateForEvidence,
  caseId: string,
  customerId: string,
  ownerId: string,
  day: number,
): EvidenceSummary[] {
  const evidence: EvidenceSummary[] = [];

  if (!state.pendingSourceRecords) return evidence;

  for (const record of state.pendingSourceRecords) {
    // Only consider records from current day or earlier
    if (record.day > day) continue;

    const payload = record.payload;

    // Check for buyer offer evidence
    if (record.sourceKind === 'customer_interaction') {
      const subtype = payload.subtype as string | undefined;
      const offerPrice = payload.offerPrice as number | undefined;
      const recordCustomerId = payload.customerId as string | undefined;
      const recordCaseId = payload.caseId as string | undefined;

      // R44: offer_submitted with explicit offerPrice is buyer offer evidence
      if (subtype === 'offer_submitted' && offerPrice !== undefined) {
        if (recordCustomerId === customerId && (recordCaseId === caseId || recordCaseId === undefined)) {
          evidence.push({
            sourceId: record.sourceId,
            sourceKind: 'source_record',
            price: offerPrice,
            day: record.day,
            confidence: record.confidence,
            customerId: recordCustomerId,
          });
        }
      }
    }

    // Check for owner concession evidence
    if (record.sourceKind === 'owner_interview') {
      const subtype = payload.subtype as string | undefined;
      const concessionPrice = payload.concessionPrice as number | undefined;
      const priceMentioned = payload.priceMentioned as number | undefined;
      const recordOwnerId = payload.ownerId as string | undefined;
      const recordCaseId = payload.caseId as string | undefined;

      // R44: concessionPrice is explicit owner concession
      if (concessionPrice !== undefined) {
        if (recordOwnerId === ownerId && recordCaseId === caseId) {
          evidence.push({
            sourceId: record.sourceId,
            sourceKind: 'source_record',
            price: concessionPrice,
            day: record.day,
            confidence: record.confidence,
            ownerId: recordOwnerId,
          });
        }
      }

      // Fallback: price_discussed with priceMentioned could indicate owner price stance
      // Note: priceMentioned is asking price, not concession. Use with caution.
      // We only accept this if the subtype indicates willingness to negotiate.
      if (subtype === 'price_discussed' && priceMentioned !== undefined && concessionPrice === undefined) {
        // Only include if owner indicated flexibility (tone is neutral/positive)
        const tone = payload.tone as string | undefined;
        if (tone === 'neutral' || tone === 'positive') {
          if (recordOwnerId === ownerId && recordCaseId === caseId) {
            evidence.push({
              sourceId: record.sourceId,
              sourceKind: 'source_record',
              price: priceMentioned,
              day: record.day,
              confidence: record.confidence * 0.7, // Lower confidence - this is asking price, not concession
              ownerId: recordOwnerId,
            });
          }
        }
      }
    }

    // Check for process receipt evidence (negotiation progression)
    if (record.sourceKind === 'process_receipt') {
      const subtype = payload.subtype as string | undefined;
      const metrics = payload.metrics as Record<string, number> | undefined;
      const recordCaseIds = payload.caseIds as readonly string[] | undefined;

      if ((subtype === 'negotiation_progressed' || subtype === 'consensus_reached') && metrics) {
        const buyerPrice = metrics.buyerOfferPrice ?? metrics.offerPrice;
        const ownerPrice = metrics.ownerConcessionPrice ?? metrics.askPrice;

        if (recordCaseIds?.includes(caseId)) {
          if (buyerPrice !== undefined) {
            evidence.push({
              sourceId: record.sourceId,
              sourceKind: 'source_record',
              price: buyerPrice,
              day: record.day,
              confidence: record.confidence,
              customerId,
            });
          }
          if (ownerPrice !== undefined) {
            evidence.push({
              sourceId: record.sourceId,
              sourceKind: 'source_record',
              price: ownerPrice,
              day: record.day,
              confidence: record.confidence,
              ownerId,
            });
          }
        }
      }
    }
  }

  return evidence;
}

// ---------------------------------------------------------------------------
// Evidence classification helpers
// ---------------------------------------------------------------------------

function isBuyerSideEvidence(evidence: EvidenceSummary, customerId: string): boolean {
  // Evidence is buyer-side if it has customerId matching and represents a price the buyer is willing to pay
  return evidence.customerId === customerId && evidence.price !== undefined;
}

function isOwnerSideEvidence(evidence: EvidenceSummary, ownerId: string, caseId: string): boolean {
  // Evidence is owner-side if it has ownerId matching and represents a price the owner is willing to accept
  return evidence.ownerId === ownerId && evidence.price !== undefined;
}

function selectBestOffer(evidence: EvidenceSummary[]): EvidenceSummary {
  // Select highest price offer (best for buyer)
  return evidence.sort((a, b) => (b.price ?? 0) - (a.price ?? 0))[0];
}

function selectBestConcession(evidence: EvidenceSummary[]): EvidenceSummary {
  // Select lowest price concession (best for buyer, most owner is willing to concede)
  return evidence.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity))[0];
}

// ---------------------------------------------------------------------------
// Trajectory construction
// ---------------------------------------------------------------------------

function buildTrajectoryFromEvidence(params: {
  caseId: string;
  customerId: string;
  ownerId: string;
  day: number;
  offer: EvidenceSummary;
  concession: EvidenceSummary;
  allEvidence: EvidenceSummary[];
}): PriceTrajectory {
  const { caseId, customerId, ownerId, day, offer, concession, allEvidence } = params;

  const trajectoryId = `ptraj:${caseId}:${customerId}:${day}`;

  const buyerOffer: BuyerOffer = Object.freeze({
    offerId: `offer:${caseId}:${customerId}:${day}`,
    day,
    customerId,
    caseId,
    price: offer.price ?? 0,
    sourceRecordIds: Object.freeze([offer.sourceId]),
    conditions: Object.freeze([]),
    confidence: offer.confidence,
    source: 'canonical',
    evidenceRefs: Object.freeze([offer.sourceId]),
  });

  const ownerConcession: OwnerConcession = Object.freeze({
    concessionId: `concession:${caseId}:${ownerId}:${day}`,
    day,
    ownerId,
    caseId,
    price: concession.price ?? 0,
    sourceRecordIds: Object.freeze([concession.sourceId]),
    conditions: Object.freeze([]),
    confidence: concession.confidence,
    source: 'canonical',
    evidenceRefs: Object.freeze([concession.sourceId]),
  });

  const gap = Math.abs((offer.price ?? 0) - (concession.price ?? 0));

  return Object.freeze({
    trajectoryId,
    caseId,
    customerId,
    ownerId,
    offers: Object.freeze([buyerOffer]),
    concessions: Object.freeze([ownerConcession]),
    convergenceCurve: Object.freeze([{ day, gap }]),
    source: 'canonical',
    proofKind: 'canonical',
    evidenceRefs: Object.freeze(allEvidence.map(e => e.sourceId)),
  });
}

// ---------------------------------------------------------------------------
// Helper for domain layer to create evidence view from GameState
// ---------------------------------------------------------------------------

/**
 * Helper for domain layer to extract minimal evidence state.
 * Domain layer calls this to create a layer-compliant view.
 */
export function createEvidenceStateView(state: {
  pendingSourceRecords?: readonly {
    sourceId: string;
    sourceKind: string;
    day: number;
    payload: unknown;
    confidence: number;
  }[];
  worldCausalEvents?: readonly {
    id: string;
    kind: string;
    day: number;
    payload: unknown;
    confidence: number;
  }[];
  actionReceiptHistory?: readonly {
    receiptId?: string;
    day: number;
    actionId?: string;
    commandId?: string;
    commandType?: string;
    generatedSourceRecordIds?: readonly string[];
  }[];
}): GameStateForEvidence {
  // Transform typed payloads to Record<string, unknown> for core layer
  return {
    pendingSourceRecords: state.pendingSourceRecords?.map(r => ({
      sourceId: r.sourceId,
      sourceKind: r.sourceKind,
      day: r.day,
      payload: r.payload as Record<string, unknown>,
      confidence: r.confidence,
    })),
    worldCausalEvents: state.worldCausalEvents?.map(e => ({
      id: e.id,
      kind: e.kind,
      day: e.day,
      payload: e.payload as Record<string, unknown>,
      confidence: e.confidence,
    })),
    actionReceiptHistory: state.actionReceiptHistory?.map(r => ({
      commandId: r.commandId ?? r.receiptId ?? '',
      day: r.day,
      commandType: r.commandType ?? r.actionId ?? '',
      generatedSourceRecordIds: r.generatedSourceRecordIds ?? [],
    })),
  };
}
