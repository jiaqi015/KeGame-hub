/**
 * scoringBalance.ts — canonical scoring balance constants.
 *
 * Architecture position:
 *   This is the single authority for the scoring subtree of BALANCE.
 *   Domain imports from here; core evaluation imports from here.
 *   This prevents core→domain layer boundary violations.
 *
 * Only the scoring subtree is extracted. Actions, opportunities,
 * market, and competition subtrees remain in domain/config/balance.ts.
 */

export const SCORING_BALANCE = {
  competitivenessWeights: { d1: 0.5, d2: 0.25, d3: 0.25 },
  d1SignalWeights: {
    poolSize: 0.15,
    activeContacts: 0.2,
    lateStageThickness: 0.3,
    advanceSpeed: 0.2,
    stagnationRisk: 0.15,
  },
  d1Normalization: {
    poolSizeLogScale: 20,
    activeContactsLogScale: 20,
    lateStageBaseline: 5,
    lateStageScale: 40,
    advanceSpeedBaseline: 3,
    advanceSpeedScale: 30,
    stagnationPenaltyPerOpportunity: 10,
  },
  d2AxisWeights: {
    layout: 0.2,
    light: 0.1,
    floor: 0.1,
    decor: 0.15,
    amenity: 0.15,
    neighborhood: 0.2,
    structure: 0.1,
  },
  d3SignalWeights: {
    priceFlex: 0.25,
    patience: 0.25,
    urgency: 0.2,
    recentCooperation: 0.2,
    consistency: 0.1,
  },
  d3Normalization: {
    priceFlexFullScale: 10,
    consistencyBaseline: 80,
  },
  portalUrgencyWeights: {
    deltaWeight: 0.4,
    levelWeight: 0.2,
    criticalEventWeight: 0.25,
    timeWindowWeight: 0.15,
  },
  portalUrgencyNormalization: {
    deltaScale: 5,
    levelScale: 100,
    criticalEventScale: 100,
    timeWindowScale: 100,
  },
} as const;

export type ScoringBalance = typeof SCORING_BALANCE;
