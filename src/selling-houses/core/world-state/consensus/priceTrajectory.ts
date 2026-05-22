/**
 * PriceTrajectory v0 — buyer/owner price convergence tracking.
 *
 * Pure types + builder functions. These interfaces model the
 * negotiation price dance between a buyer and an owner on a single case.
 *
 * Mother model reference: Section 4 (ConsensusFormation), Section 16 (OfferThread).
 *
 * Hard constraints:
 * 1. Pure functions — no domain/runtime imports.
 * 2. No Date.now, no Math.random, no crypto, no global state.
 * 3. Deterministic: same input → same output.
 * 4. Write functions return frozen objects — no mutation.
 */

// ---------------------------------------------------------------------------
// BuyerOffer: a buyer's price offer in a negotiation trajectory
// ---------------------------------------------------------------------------

export interface BuyerOffer {
  readonly offerId: string;
  readonly day: number;
  readonly customerId: string;
  readonly caseId: string;
  readonly price: number;
  readonly sourceRecordIds: readonly string[];
  readonly causedByConcessionId?: string;
  readonly conditions: readonly string[];
  readonly confidence: number;
  readonly source: 'canonical' | 'legacy_compatibility_projection';
  readonly evidenceRefs: readonly string[];
}

// ---------------------------------------------------------------------------
// OwnerConcession: an owner's price concession in a negotiation trajectory
// ---------------------------------------------------------------------------

export interface OwnerConcession {
  readonly concessionId: string;
  readonly day: number;
  readonly ownerId: string;
  readonly caseId: string;
  readonly price: number;
  readonly sourceRecordIds: readonly string[];
  readonly causedByOfferId?: string;
  readonly conditions: readonly string[];
  readonly confidence: number;
  readonly source: 'canonical' | 'legacy_compatibility_projection';
  readonly evidenceRefs: readonly string[];
}

// ---------------------------------------------------------------------------
// PriceTrajectory: full negotiation price dance for a case
// ---------------------------------------------------------------------------

export interface PriceTrajectory {
  readonly trajectoryId: string;
  readonly caseId: string;
  readonly customerId: string;
  readonly ownerId: string;
  readonly offers: readonly BuyerOffer[];
  readonly concessions: readonly OwnerConcession[];
  readonly convergenceCurve: readonly { readonly day: number; readonly gap: number }[];
  readonly source: 'canonical' | 'legacy_compatibility_projection';
  readonly evidenceRefs: readonly string[];
}

// ---------------------------------------------------------------------------
// WeightExplanation: explains how a factor was weighted
// ---------------------------------------------------------------------------

export interface WeightExplanation {
  readonly factor: string;
  readonly weight: number;
  readonly derivedFrom: {
    readonly sourceKind: 'historical_distribution' | 'market_signal' | 'archetype_default';
    readonly sourceIds: readonly string[];
  };
}

// ---------------------------------------------------------------------------
// PriceConsensusReadiness: whether the price trajectory is ready for consensus
// ---------------------------------------------------------------------------

export interface PriceConsensusReadiness {
  readonly readinessId: string;
  readonly trajectoryId: string;
  readonly ready: boolean;
  readonly score: number;
  readonly currentGap: number;
  readonly requiredGap: number;
  readonly blockers: readonly string[];
  readonly buyerAcceptedPrice?: number;
  readonly ownerAcceptedPrice?: number;
  readonly weightExplanations: readonly WeightExplanation[];
  readonly trajectory: PriceTrajectory;
}

// ---------------------------------------------------------------------------
// Deterministic ID builders
// ---------------------------------------------------------------------------

export function buildPriceTrajectoryId(caseId: string, customerId: string, day: number): string {
  return `ptraj:${caseId}:${customerId}:${day}`;
}

export function buildPriceConsensusReadinessId(trajectoryId: string): string {
  return `pready:${trajectoryId}`;
}

// ---------------------------------------------------------------------------
// buildLegacyPriceTrajectoryFromOpportunity
// ---------------------------------------------------------------------------
// Creates a PriceTrajectory from legacy opportunity + case data.
// Generates at least 1 BuyerOffer + 1 OwnerConcession.
// Source is always 'legacy_compatibility_projection'.

export function buildLegacyPriceTrajectoryFromOpportunity(params: {
  readonly caseId: string;
  readonly customerId: string;
  readonly ownerId: string;
  readonly day: number;
  readonly buyerBudgetMax: number;
  readonly buyerIntent: number;
  readonly buyerConfidence: number;
  readonly caseAskPrice: number;
  readonly caseMarketPrice: number;
  readonly caseBottomPrice: number;
  readonly soldPrice?: number;
  readonly opportunityId: string;
  readonly closeReadiness?: number;
  readonly closeProbability?: number;
}): PriceTrajectory {
  const {
    caseId, customerId, ownerId, day,
    buyerBudgetMax, buyerIntent, buyerConfidence,
    caseAskPrice, caseMarketPrice, caseBottomPrice,
    soldPrice, opportunityId, closeReadiness, closeProbability,
  } = params;

  const trajectoryId = buildPriceTrajectoryId(caseId, customerId, day);

  // Buyer offer: based on budget max, adjusted by intent/confidence
  const buyerOfferPrice = soldPrice ?? Math.round(
    Math.min(buyerBudgetMax, caseMarketPrice) * (0.85 + (buyerIntent / 100) * 0.15),
  );

  const buyerOffer: BuyerOffer = Object.freeze({
    offerId: `offer:${caseId}:${customerId}:${day}`,
    day,
    customerId,
    caseId,
    price: buyerOfferPrice,
    sourceRecordIds: Object.freeze([opportunityId]),
    conditions: Object.freeze([]),
    confidence: Math.round(buyerConfidence),
    source: 'legacy_compatibility_projection',
    evidenceRefs: Object.freeze([opportunityId]),
  });

  // Owner concession: based on bottom price, adjusted by ask/market gap
  const ownerConcessionPrice = soldPrice ?? Math.round(
    caseBottomPrice + (caseAskPrice - caseBottomPrice) * 0.6,
  );

  const ownerConcession: OwnerConcession = Object.freeze({
    concessionId: `concession:${caseId}:${ownerId}:${day}`,
    day,
    ownerId,
    caseId,
    price: ownerConcessionPrice,
    sourceRecordIds: Object.freeze([`case:${caseId}`]),
    conditions: Object.freeze([]),
    confidence: Math.round(closeReadiness ?? 50),
    source: 'legacy_compatibility_projection',
    evidenceRefs: Object.freeze([`case:${caseId}`, opportunityId]),
  });

  const gap = Math.abs(buyerOfferPrice - ownerConcessionPrice);

  return Object.freeze({
    trajectoryId,
    caseId,
    customerId,
    ownerId,
    offers: Object.freeze([buyerOffer]),
    concessions: Object.freeze([ownerConcession]),
    convergenceCurve: Object.freeze([{ day, gap }]),
    source: 'legacy_compatibility_projection',
    evidenceRefs: Object.freeze([opportunityId, `case:${caseId}`]),
  });
}

// ---------------------------------------------------------------------------
// buildPriceConsensusReadiness
// ---------------------------------------------------------------------------
// Computes readiness from a PriceTrajectory.
// ready = currentGap <= requiredGap AND offers.length >= 1 AND concessions.length >= 1

export function buildPriceConsensusReadiness(
  trajectory: PriceTrajectory,
  requiredGap: number = 5,
): PriceConsensusReadiness {
  const readinessId = buildPriceConsensusReadinessId(trajectory.trajectoryId);

  const lastCurveEntry = trajectory.convergenceCurve[trajectory.convergenceCurve.length - 1];
  const currentGap = lastCurveEntry?.gap ?? Infinity;

  const hasOffers = trajectory.offers.length >= 1;
  const hasConcessions = trajectory.concessions.length >= 1;
  const gapClosed = currentGap <= requiredGap;
  const ready = hasOffers && hasConcessions && gapClosed;

  const blockers: string[] = [];
  if (!hasOffers) blockers.push('no buyer offers');
  if (!hasConcessions) blockers.push('no owner concessions');
  if (!gapClosed) blockers.push(`price gap ${currentGap} exceeds required ${requiredGap}`);

  // Score: 0-100, based on gap convergence and evidence presence
  const gapScore = gapClosed ? 100 : Math.max(0, Math.round(100 - (currentGap / Math.max(requiredGap, 1)) * 50));
  const evidenceScore = (hasOffers ? 25 : 0) + (hasConcessions ? 25 : 0);
  const score = Math.min(100, Math.round(gapScore * 0.5 + evidenceScore * 0.5));

  const buyerAcceptedPrice = trajectory.offers.length > 0
    ? trajectory.offers[trajectory.offers.length - 1].price
    : undefined;
  const ownerAcceptedPrice = trajectory.concessions.length > 0
    ? trajectory.concessions[trajectory.concessions.length - 1].price
    : undefined;

  const weightExplanations: readonly WeightExplanation[] = Object.freeze([
    {
      factor: 'gap_convergence',
      weight: 0.5,
      derivedFrom: {
        sourceKind: 'market_signal',
        sourceIds: trajectory.evidenceRefs,
      },
    },
    {
      factor: 'evidence_presence',
      weight: 0.3,
      derivedFrom: {
        sourceKind: 'archetype_default',
        sourceIds: [trajectory.trajectoryId],
      },
    },
    {
      factor: 'buyer_confidence',
      weight: 0.2,
      derivedFrom: {
        sourceKind: 'market_signal',
        sourceIds: trajectory.offers.map(o => o.offerId),
      },
    },
  ]);

  return Object.freeze({
    readinessId,
    trajectoryId: trajectory.trajectoryId,
    ready,
    score,
    currentGap,
    requiredGap,
    blockers: Object.freeze(blockers),
    buyerAcceptedPrice,
    ownerAcceptedPrice,
    weightExplanations,
    trajectory,
  });
}

// ---------------------------------------------------------------------------
// buildPriceTrajectoryFromDealClosingEvaluation
// ---------------------------------------------------------------------------
// Creates a PriceTrajectory from the deal-closing evaluation data.
// Pulls from ConsensusFormationState + Case + Opportunity data available in state.

export function buildPriceTrajectoryFromDealClosingEvaluation(params: {
  readonly caseId: string;
  readonly customerId: string;
  readonly ownerId: string;
  readonly opportunityId: string;
  readonly day: number;
  readonly soldPrice: number;
  readonly closeReadiness: number;
  readonly closeProbability: number;
  readonly buyerBudgetMax: number;
  readonly buyerIntent: number;
  readonly buyerConfidence: number;
  readonly caseAskPrice: number;
  readonly caseMarketPrice: number;
  readonly caseBottomPrice: number;
  readonly blockers: readonly string[];
  readonly supportingFactors: readonly string[];
  readonly strategyId: string;
}): PriceTrajectory {
  const {
    caseId, customerId, ownerId, opportunityId, day,
    soldPrice, closeReadiness, closeProbability,
    buyerBudgetMax, buyerIntent, buyerConfidence,
    caseAskPrice, caseMarketPrice, caseBottomPrice,
    blockers, supportingFactors, strategyId,
  } = params;

  const trajectoryId = buildPriceTrajectoryId(caseId, customerId, day);

  // Buyer offer: the proposed deal price
  const buyerOffer: BuyerOffer = Object.freeze({
    offerId: `offer:${caseId}:${customerId}:${day}`,
    day,
    customerId,
    caseId,
    price: soldPrice,
    sourceRecordIds: Object.freeze([opportunityId]),
    conditions: Object.freeze(blockers),
    confidence: Math.round(buyerConfidence),
    source: 'canonical',
    evidenceRefs: Object.freeze([opportunityId, `strategy:${strategyId}`]),
  });

  // Owner concession: ask price → sold price
  const ownerConcession: OwnerConcession = Object.freeze({
    concessionId: `concession:${caseId}:${ownerId}:${day}`,
    day,
    ownerId,
    caseId,
    price: soldPrice,
    sourceRecordIds: Object.freeze([`case:${caseId}`]),
    conditions: Object.freeze(blockers),
    confidence: Math.round(closeReadiness),
    source: 'canonical',
    evidenceRefs: Object.freeze([
      `case:${caseId}`,
      `readiness:${closeReadiness}`,
      `probability:${closeProbability}`,
      ...supportingFactors,
    ]),
  });

  const gap = 0; // deal closing means gap is closed

  return Object.freeze({
    trajectoryId,
    caseId,
    customerId,
    ownerId,
    offers: Object.freeze([buyerOffer]),
    concessions: Object.freeze([ownerConcession]),
    convergenceCurve: Object.freeze([{ day, gap }]),
    source: 'canonical',
    evidenceRefs: Object.freeze([
      opportunityId,
      `case:${caseId}`,
      `strategy:${strategyId}`,
    ]),
  });
}
