import type { GameRules } from '../models';

export const BASE_RULES: GameRules = {
  maxDay: 21,
  baseMaxEnergy: 4,
  initialCash: 18,
  weeklyBudgetAllowance: 4,
  saleBudgetBonusRatio: 0.3,
  saleBudgetBonusFloor: 3,
  initialReputation: 56,
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
  ownerUntouchedTrustLoss: 1,
  urgentOwnerUntouchedTrustLoss: 3,
  ownerPatienceDecayAfterDays: 7,
  ownerPatienceDecayAmount: 2,
  scriptedEventImpactScale: 1,
};

export function mergeRules(overrides?: Partial<GameRules>): GameRules {
  return {
    ...BASE_RULES,
    ...(overrides || {}),
    initialEnergy: overrides?.initialEnergy ?? overrides?.baseMaxEnergy ?? BASE_RULES.initialEnergy,
  };
}
