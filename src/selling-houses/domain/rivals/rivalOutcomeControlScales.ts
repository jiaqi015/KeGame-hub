import type { GameState, OutcomeControlRules } from '../models.js';

export type RivalOutcomeControlKey =
  | 'rivalStoreCapabilityScale'
  | 'rivalDealShareScale'
  | 'rivalListingSpawnScale'
  | 'rivalCustomerPullScale'
  | 'rivalOwnerPressureScale'
  | 'rivalCaseLossScale';

export type RivalOutcomeControlScales = Pick<OutcomeControlRules, RivalOutcomeControlKey>;

function finitePositiveScale(value: number, fallback: number) {
  if (!Number.isFinite(value) || value < 0) {
    return fallback;
  }
  return value;
}

export function getRivalOutcomeControl(state: GameState): RivalOutcomeControlScales {
  const outcomeControl = state.rules.outcomeControl;
  return {
    rivalStoreCapabilityScale: finitePositiveScale(outcomeControl.rivalStoreCapabilityScale, 1),
    rivalDealShareScale: finitePositiveScale(outcomeControl.rivalDealShareScale, 1),
    rivalListingSpawnScale: finitePositiveScale(outcomeControl.rivalListingSpawnScale, 1),
    rivalCustomerPullScale: finitePositiveScale(outcomeControl.rivalCustomerPullScale, 1),
    rivalOwnerPressureScale: finitePositiveScale(outcomeControl.rivalOwnerPressureScale, 1),
    rivalCaseLossScale: finitePositiveScale(outcomeControl.rivalCaseLossScale, 1),
  };
}
