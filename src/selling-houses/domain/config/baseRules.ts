import type { GameRuleOverrides, GameRules, OutcomeControlRules } from '../models.js';

export const BASE_OUTCOME_CONTROL: OutcomeControlRules = {
  simulationDays: 21,
  marketDealCapacity21d: 4,
  playerBaseDealExpectation21d: 1,
  playerBonusDealCapacity21d: 1,
  playerBonusDealUnlockScore: 75,
  playerLeadSupplyScale: 1,
  playerFunnelProgressionScale: 1,
  playerDealClosingScale: 1,
  customerStagnationScale: 1,
  rivalStoreCapabilityScale: 1,
  rivalDealShareScale: 1,
  rivalListingSpawnScale: 1,
  rivalCustomerPullScale: 1,
  rivalOwnerPressureScale: 1,
  rivalCaseLossScale: 1,
  expectedSelfClosedDeals21d: 1,
  expectedRivalClosedDeals21d: 3,
};

export const BASE_RULES: GameRules = {
  maxDay: 21,
  baseMaxEnergy: 4,
  initialCash: 18,
  weeklyBudgetAllowance: 4,
  promotionRebateRatio: 0.3,
  promotionRebateFloor: 3,
  initialWordOfMouth: 56,
  initialCommission: 0,
  initialEnergy: 4,
  passiveLeadBaseMultiplier: 1,
  passiveLeadFocusedMultiplier: 3.5,
  randomEventProbability: 0.15,
  seasonalityImpact: 5,
  competitionPressureThreshold: 72,
  competitionHeatPenaltyMin: 2,
  competitionHeatPenaltyMax: 5,
  competitionTrustLossChance: 0.4,
  competitionLogChance: 0.3,
  rivalLossProbabilityScale: 0.18,
  ownerUntouchedTrustLoss: 1,
  urgentOwnerUntouchedTrustLoss: 3,
  ownerPatienceDecayAfterDays: 7,
  ownerPatienceDecayAmount: 2,
  scriptedEventImpactScale: 1,
  dailyMarketEventProbability: 0.22,
  rivalListingSpawnChance: 0.18,
  rivalPressureHeatImpact: 1.6,
  rivalPressureTrustImpact: 0.7,
  companySharedLeadPressureBase: 34,
  companyReferralChanceBase: 0.08,
  marketSignalDecayDays: 4,
  marketSignalMaxVisible: 5,
  outcomeControl: BASE_OUTCOME_CONTROL,
};

export function mergeRules(overrides?: GameRuleOverrides): GameRules {
  const {
    saleBudgetBonusRatio: _legacyPromotionRatio,
    saleBudgetBonusFloor: _legacyPromotionFloor,
    outcomeControl: outcomeControlOverrides,
    ...nextOverrides
  } = overrides || {};
  const promotionRebateRatio = overrides?.promotionRebateRatio
    ?? overrides?.saleBudgetBonusRatio
    ?? BASE_RULES.promotionRebateRatio;
  const promotionRebateFloor = overrides?.promotionRebateFloor
    ?? overrides?.saleBudgetBonusFloor
    ?? BASE_RULES.promotionRebateFloor;

  return {
    ...BASE_RULES,
    ...nextOverrides,
    promotionRebateRatio,
    promotionRebateFloor,
    initialWordOfMouth: overrides?.initialWordOfMouth ?? overrides?.initialReputation ?? BASE_RULES.initialWordOfMouth,
    initialEnergy: overrides?.initialEnergy ?? overrides?.baseMaxEnergy ?? BASE_RULES.initialEnergy,
    outcomeControl: {
      ...BASE_RULES.outcomeControl,
      ...outcomeControlOverrides,
    },
  };
}
