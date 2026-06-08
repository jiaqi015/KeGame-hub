import { BALANCE } from '../config/balance.js';
import type { Case, GameState, MarketCell, RivalListing } from '../models.js';
import type { CoreProtectionEvaluation } from '../coreProtectionPolicy.js';
import { isOpportunityActiveByCanonicalState } from '../opportunityLifecycleStatusRead.js';
import { clamp } from '../utils.js';

export interface CompetitionRivalLossInput {
  groupPricePremiumRatio: number;
}

export interface RivalLossProbabilityResult {
  allowed: boolean;
  probability: number;
  reasons: string[];
}

export function getRivalListingStrengthScale(listing: RivalListing) {
  return clamp(
    (listing.heat + listing.leadSiphonPower + listing.ownerAnchorPower) / 240,
    0.65,
    1.35,
  );
}

export function computeVisibleRivalLossProbability(
  caseItem: Case,
  listing: RivalListing,
  protection: CoreProtectionEvaluation,
  rivalCaseLossScale: number,
): RivalLossProbabilityResult {
  const coreProtection = caseItem.goalTier === 'core' && protection.recentlyMaintained ? 0.18 : 0;
  const pipelineProtection = protection.lateLeadCount > 0 ? 0.14 : 0;
  const neglectedPenalty = protection.relationshipGap >= 5 ? 0.1 : 0;
  const windowPenalty = caseItem.windowDays <= 2 ? 0.14 : caseItem.windowDays <= 4 ? 0.06 : 0;
  const trustPenalty = protection.relationTrust <= 50 ? 0.1 : protection.relationTrust <= 56 ? 0.05 : 0;
  const heatPenalty = caseItem.heat <= 42 ? 0.07 : 0;
  const noPipelinePenalty = protection.opportunities.length === 0 ? 0.06 : 0;
  const tierBase = caseItem.goalTier === 'core' ? 0.16 : caseItem.goalTier === 'important' ? 0.24 : 0.32;
  const strengthAdjustment = (getRivalListingStrengthScale(listing) - 1) * 0.12;
  const probability = clamp(
    (
      tierBase
      + strengthAdjustment
      + neglectedPenalty
      + windowPenalty
      + trustPenalty
      + heatPenalty
      + noPipelinePenalty
      - coreProtection
      - pipelineProtection
    ) * rivalCaseLossScale,
    0,
    0.95,
  );

  return {
    allowed: probability > 0,
    probability,
    reasons: [`probability=${probability.toFixed(3)}`],
  };
}

export function computeCompetitionRivalLossProbability(
  state: GameState,
  caseItem: Case,
  input: CompetitionRivalLossInput,
  protection: CoreProtectionEvaluation,
  cell: MarketCell,
  rivalCaseLossScale: number,
): RivalLossProbabilityResult {
  const rivalLossBalance = BALANCE.competition.rivalLoss;
  if (caseItem.defenseOutcome === 'lost_to_rival') {
    return { allowed: false, probability: 0, reasons: ['case already lost'] };
  }

  if (
    Number.isFinite(caseItem.lastRivalThreatDay)
    && state.day - (caseItem.lastRivalThreatDay || 0) < rivalLossBalance.threatCooldownDays
  ) {
    return { allowed: false, probability: 0, reasons: ['rival threat cooldown active'] };
  }

  const brokerShadowLeads = state.opportunities.filter((entry) => {
    return entry.caseId === caseItem.id
      && isOpportunityActiveByCanonicalState(state, entry)
      && entry.leadSource === 'broker'
      && entry.visibility === 'shadow';
  }).length;
  const priceGapRatio = Math.max(0, caseItem.askPrice - caseItem.marketPrice) / Math.max(caseItem.marketPrice, 1);
  const pressureOverLine = Math.max(0, cell.competitivePressure - state.rules.competitionPressureThreshold);
  const urgentOpening = caseItem.windowDays <= 1 || brokerShadowLeads >= 2;
  const relationshipOpening = protection.relationshipGap >= rivalLossBalance.relationshipOpeningDays
    && protection.relationTrust <= rivalLossBalance.relationshipOpeningTrustThreshold;
  const trustCollapse = protection.relationTrust <= rivalLossBalance.trustCollapseThreshold;
  const coldAndNeglected = caseItem.heat <= rivalLossBalance.coldHeatThreshold
    && protection.relationshipGap >= rivalLossBalance.coldRelationshipDays;
  const pipelineOpening = (
    protection.opportunities.length === 0
    || (protection.qualifiedLeadCount === 0 && caseItem.heat <= rivalLossBalance.pipelineHeatThreshold)
  ) && (
    pressureOverLine >= rivalLossBalance.pipelinePressureThreshold
    || input.groupPricePremiumRatio >= rivalLossBalance.pipelinePremiumThreshold
    || priceGapRatio >= rivalLossBalance.pipelinePriceGapThreshold
  );
  const priceAndPressureTrap = (
    pressureOverLine >= rivalLossBalance.priceTrapPressureThreshold
    || input.groupPricePremiumRatio >= rivalLossBalance.priceTrapPremiumThreshold
    || priceGapRatio >= rivalLossBalance.priceTrapPriceGapThreshold
  ) && (
    protection.relationTrust <= rivalLossBalance.priceTrapTrustThreshold
    || protection.relationshipGap >= rivalLossBalance.priceTrapRelationshipDays
    || caseItem.windowDays <= rivalLossBalance.priceTrapWindowDays
  );
  const visibleSlip = urgentOpening
    || relationshipOpening
    || trustCollapse
    || coldAndNeglected
    || pipelineOpening
    || priceAndPressureTrap;
  const rivalHasOpening = pressureOverLine >= rivalLossBalance.rivalOpenPressureThreshold
    || input.groupPricePremiumRatio >= rivalLossBalance.rivalOpenPremiumThreshold
    || priceGapRatio >= rivalLossBalance.rivalOpenPriceGapThreshold
    || brokerShadowLeads >= 2;

  if (!visibleSlip || !rivalHasOpening || (protection.recentlyMaintained && !urgentOpening && !pipelineOpening)) {
    return { allowed: false, probability: 0, reasons: ['no visible slip or rival opening'] };
  }

  const rawProbability = rivalLossBalance.rawProbabilityBase
    + pressureOverLine * rivalLossBalance.rawPressureWeight
    + Math.max(0, input.groupPricePremiumRatio - rivalLossBalance.rawPremiumOffset) * rivalLossBalance.rawPremiumWeight
    + Math.max(0, priceGapRatio - rivalLossBalance.rawPriceGapOffset) * rivalLossBalance.rawPriceGapWeight
    + brokerShadowLeads * rivalLossBalance.rawBrokerLeadWeight
    + (caseItem.windowDays <= rivalLossBalance.lastWindowThreshold ? rivalLossBalance.rawLastWindowBonus : 0);
  const maintainedGuard = protection.recentlyMaintained && pipelineOpening
    ? rivalLossBalance.maintainedGuardWhenPipelineOpen
    : 1;
  const probability = clamp(
    rawProbability * state.rules.rivalLossProbabilityScale * rivalCaseLossScale * maintainedGuard,
    rivalLossBalance.probabilityMin,
    rivalLossBalance.probabilityMax,
  );

  return {
    allowed: probability > 0,
    probability,
    reasons: [`probability=${probability.toFixed(3)}`],
  };
}
