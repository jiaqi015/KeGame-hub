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
  /**
   * R43: Proof kind distinguishes canonical evidence from legacy compatibility.
   * - 'canonical': sourceRecordIds are real SourceRecords (isr-xxx), validators pass
   * - 'legacy_compatibility_projection': fabricated from soldPrice for backward compatibility
   */
  readonly proofKind?: 'canonical' | 'legacy_compatibility_projection';
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
  // R43: This is legacy_compatibility_projection - fabricated from soldPrice
  // TODO: Replace with real offer sequence from action receipts
  const buyerOffer: BuyerOffer = Object.freeze({
    offerId: `offer:${caseId}:${customerId}:${day}`,
    day,
    customerId,
    caseId,
    price: soldPrice,
    sourceRecordIds: Object.freeze([opportunityId]), // R43: opportunityId is NOT a real SourceRecord
    conditions: Object.freeze(blockers),
    confidence: Math.round(buyerConfidence),
    source: 'legacy_compatibility_projection', // R43: Mark as legacy projection
    evidenceRefs: Object.freeze([opportunityId, `strategy:${strategyId}`]),
  });

  // Owner concession: ask price → sold price
  // R43: This is legacy_compatibility_projection - fabricated from soldPrice
  // TODO: Replace with real concession sequence from action receipts
  const ownerConcession: OwnerConcession = Object.freeze({
    concessionId: `concession:${caseId}:${ownerId}:${day}`,
    day,
    ownerId,
    caseId,
    price: soldPrice,
    sourceRecordIds: Object.freeze([`case:${caseId}`]), // R43: case:xxx is NOT a real SourceRecord
    conditions: Object.freeze(blockers),
    confidence: Math.round(closeReadiness),
    source: 'legacy_compatibility_projection', // R43: Mark as legacy projection
    evidenceRefs: Object.freeze([
      `case:${caseId}`,
      `readiness:${closeReadiness}`, // R43: weight factor, NOT an evidence ref
      `probability:${closeProbability}`, // R43: weight factor, NOT an evidence ref
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
    source: 'legacy_compatibility_projection', // R43: Mark as legacy projection
    proofKind: 'legacy_compatibility_projection', // R43: Explicit proof kind
    evidenceRefs: Object.freeze([
      opportunityId, // R43: structural ID, NOT evidence
      `case:${caseId}`, // R43: structural ID, NOT evidence
      `strategy:${strategyId}`, // R43: strategy ID without evidence backing
    ]),
  });
}

// ---------------------------------------------------------------------------
// Stage derivation from PriceTrajectory
// ---------------------------------------------------------------------------

export type TrajectoryDerivedStage = 'formal_offer' | 'tentative_alignment' | 'negotiable_zone' | 'price_gap_visible' | 'no_evidence';

/**
 * Derive a consensus-stage-like label from PriceTrajectory evidence.
 * Uses offer/concession presence and gap convergence — not stageIndex.
 */
export function deriveStageIndexFromPriceTrajectory(trajectory: PriceTrajectory): TrajectoryDerivedStage {
  const hasOffers = trajectory.offers.length >= 1;
  const hasConcessions = trajectory.concessions.length >= 1;

  if (!hasOffers && !hasConcessions) return 'no_evidence';

  const lastGap = trajectory.convergenceCurve[trajectory.convergenceCurve.length - 1]?.gap ?? Infinity;

  if (hasOffers && hasConcessions) {
    if (lastGap <= 5) return 'formal_offer';
    if (lastGap <= 20) return 'tentative_alignment';
    return 'negotiable_zone';
  }

  if (hasOffers || hasConcessions) {
    return 'price_gap_visible';
  }

  return 'no_evidence';
}

/**
 * Assert that a PriceTrajectory has at least one BuyerOffer and one OwnerConcession.
 * Required for signed/contract paths — a consensus cannot form without both parties
 * having made a price move.
 */
export function assertTrajectoryHasOfferAndConcession(trajectory: PriceTrajectory): {
  valid: boolean;
  hasBuyerOffer: boolean;
  hasOwnerConcession: boolean;
  missing: readonly string[];
} {
  const hasBuyerOffer = trajectory.offers.length >= 1;
  const hasOwnerConcession = trajectory.concessions.length >= 1;
  const missing: string[] = [];
  if (!hasBuyerOffer) missing.push('no buyer offer');
  if (!hasOwnerConcession) missing.push('no owner concession');
  return {
    valid: hasBuyerOffer && hasOwnerConcession,
    hasBuyerOffer,
    hasOwnerConcession,
    missing: Object.freeze(missing),
  };
}

/**
 * Derive ConsensusStage from PriceTrajectory for critical closing paths.
 * Returns fallback for non-trajectory evidence paths (marked as legacy).
 */
export function deriveConsensusStatusFromTrajectory(
  trajectory: PriceTrajectory | undefined,
  fallbackStatus?: string,
): { status: string; source: 'trajectory' | 'legacy_fallback' } {
  if (trajectory) {
    const validation = assertTrajectoryHasOfferAndConcession(trajectory);
    if (validation.valid) {
      const stage = deriveStageIndexFromPriceTrajectory(trajectory);
      return { status: stage, source: 'trajectory' };
    }
  }
  return { status: fallbackStatus ?? 'price_gap_visible', source: 'legacy_fallback' };
}

// ---------------------------------------------------------------------------
// PriceConsensusProof: the bridge from trajectory + readiness to contract
// ---------------------------------------------------------------------------

export interface PriceConsensusProof {
  readonly proofId: string;
  readonly trajectory: PriceTrajectory;
  readonly readiness: PriceConsensusReadiness;
  readonly buyerOffer: BuyerOffer;
  readonly ownerConcession: OwnerConcession;
  readonly agreedPrice: number;
  readonly sourceEventRefs: readonly string[];
  readonly weightExplanations: readonly WeightExplanation[];
  readonly proofKind: 'canonical' | 'legacy_compatibility_projection';
}

// ---------------------------------------------------------------------------
// buildPriceConsensusProof
// ---------------------------------------------------------------------------
// Creates a proof object from trajectory + readiness. The proof is frozen.
// Validated: offer/concession present, readiness ready, prices converge.

export function buildPriceConsensusProof(input: {
  readonly trajectory: PriceTrajectory;
  readonly readiness: PriceConsensusReadiness;
  readonly requiredProofKind?: 'canonical' | 'legacy_compatibility_projection';
}): PriceConsensusProof {
  const { trajectory, readiness, requiredProofKind } = input;
  const proofKind = requiredProofKind ?? trajectory.source;

  const lastOffer = trajectory.offers[trajectory.offers.length - 1];
  const lastConcession = trajectory.concessions[trajectory.concessions.length - 1];

  if (!lastOffer) throw new Error('PriceConsensusProof: trajectory has no buyer offers');
  if (!lastConcession) throw new Error('PriceConsensusProof: trajectory has no owner concessions');

  // Agreed price: the last offer price (both converge to same in deal closing)
  const agreedPrice = readiness.buyerAcceptedPrice ?? lastOffer.price;

  const sourceEventRefs = Object.freeze([
    trajectory.trajectoryId,
    readiness.readinessId,
    lastOffer.offerId,
    lastConcession.concessionId,
    ...trajectory.evidenceRefs,
    ...readiness.weightExplanations.map(w => w.factor),
  ]);

  const proofId = `proof:${trajectory.trajectoryId}:${readiness.readinessId}`;

  return Object.freeze({
    proofId,
    trajectory,
    readiness,
    buyerOffer: lastOffer,
    ownerConcession: lastConcession,
    agreedPrice,
    sourceEventRefs,
    weightExplanations: readiness.weightExplanations,
    proofKind,
  });
}

// ---------------------------------------------------------------------------
// validatePriceConsensusProof
// ---------------------------------------------------------------------------
// Pure validation — no runtime imports. Returns valid + reasons.

export function validatePriceConsensusProof(proof: PriceConsensusProof): {
  readonly valid: boolean;
  readonly reasons: readonly string[];
} {
  const reasons: string[] = [];

  // Trajectory must have at least one offer
  if (proof.trajectory.offers.length < 1) {
    reasons.push('trajectory has no buyer offers');
  }

  // Trajectory must have at least one concession
  if (proof.trajectory.concessions.length < 1) {
    reasons.push('trajectory has no owner concessions');
  }

  // Readiness must be ready
  if (!proof.readiness.ready) {
    reasons.push(`readiness not ready (score ${proof.readiness.score}, blockers: ${proof.readiness.blockers.join(', ')})`);
  }

  // Readiness must point to same trajectory
  if (proof.readiness.trajectoryId !== proof.trajectory.trajectoryId) {
    reasons.push(`readiness trajectory ${proof.readiness.trajectoryId} != proof trajectory ${proof.trajectory.trajectoryId}`);
  }

  // Agreed price must be finite and positive
  if (!Number.isFinite(proof.agreedPrice) || proof.agreedPrice <= 0) {
    reasons.push(`agreed price ${proof.agreedPrice} is not finite positive`);
  }

  // Buyer offer price and owner concession price must converge within tolerance
  if (proof.buyerOffer && proof.ownerConcession) {
    const gap = Math.abs(proof.buyerOffer.price - proof.ownerConcession.price);
    if (gap > proof.readiness.requiredGap) {
      reasons.push(`offer/concession gap ${gap} exceeds required ${proof.readiness.requiredGap}`);
    }
  }

  // Source refs must include trajectory and readiness refs
  const refs = proof.sourceEventRefs;
  if (!refs.some(r => r.startsWith('ptraj:'))) {
    reasons.push('source refs missing trajectory ref');
  }
  if (!refs.some(r => r.startsWith('pready:'))) {
    reasons.push('source refs missing readiness ref');
  }

  return Object.freeze({
    valid: reasons.length === 0,
    reasons: Object.freeze(reasons),
  });
}
