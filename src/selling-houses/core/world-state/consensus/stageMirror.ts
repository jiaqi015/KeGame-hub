/**
 * Stage Mirror Helpers — derives Opportunity/Customer/Case stage mirrors
 * from PriceTrajectory / offer-concession evidence.
 *
 * Stage mirrors are compatibility projections, not independent truth.
 * For negotiation/closing stages (>= 4), a PriceTrajectory with
 * at least one BuyerOffer and one OwnerConcession is required.
 *
 * Pure functions — no domain/runtime imports, no Date.now/Math.random.
 */

import type { PriceTrajectory } from './priceTrajectory.js';
import { assertTrajectoryHasOfferAndConcession, deriveStageIndexFromPriceTrajectory } from './priceTrajectory.js';

// ---------------------------------------------------------------------------
// Stage mirror derivation
// ---------------------------------------------------------------------------

/**
 * Derive a late-stage Opportunity stageIndex from PriceTrajectory evidence.
 * Returns null if trajectory lacks offer+concession evidence (not eligible for >= 4).
 */
export function deriveLateStageFromPriceTrajectory(
  trajectory: PriceTrajectory | undefined,
): number | null {
  if (!trajectory) return null;

  const validation = assertTrajectoryHasOfferAndConcession(trajectory);
  if (!validation.valid) return null;

  const stage = deriveStageIndexFromPriceTrajectory(trajectory);
  // Map trajectory-derived stage to numeric stageIndex
  switch (stage) {
    case 'formal_offer': return 4;
    case 'tentative_alignment': return 4;
    case 'negotiable_zone': return 3;
    case 'price_gap_visible': return 2;
    case 'no_evidence': return null;
  }
}

/**
 * Derive a full Opportunity stageIndex, combining trajectory-derived late stage
 * with a lower-funnel fallback from customer journey state.
 *
 * If trajectory provides a late stage (>= 4), it takes precedence.
 * Otherwise, the lower stage fallback is used (0-3 from customer journey).
 */
export function deriveOpportunityStageMirrorFromPriceTrajectory(
  trajectory: PriceTrajectory | undefined,
  lowerStageFallback: number,
): number {
  const lateStage = deriveLateStageFromPriceTrajectory(trajectory);
  if (lateStage !== null) {
    return Math.max(lateStage, lowerStageFallback);
  }
  // No trajectory evidence: cap at 3 (cannot reach formal offer without offers+concessions)
  return Math.min(lowerStageFallback, 3);
}

/**
 * Assert that a late stage (>= 4) has trajectory evidence backing it.
 * Returns false if stageIndex >= 4 but no trajectory with offer+concession exists.
 */
export function assertLateStageHasTrajectoryEvidence(
  stageIndex: number,
  trajectory: PriceTrajectory | undefined,
): { valid: boolean; reason: string } {
  if (stageIndex < 4) return { valid: true, reason: 'lower stage, no trajectory required' };

  if (!trajectory) {
    return { valid: false, reason: `stageIndex ${stageIndex} >= 4 but no PriceTrajectory provided` };
  }

  const validation = assertTrajectoryHasOfferAndConcession(trajectory);
  if (!validation.valid) {
    return {
      valid: false,
      reason: `stageIndex ${stageIndex} >= 4 but trajectory lacks ${validation.missing.join(', ')}`,
    };
  }

  return { valid: true, reason: 'trajectory has offer+concession evidence' };
}
