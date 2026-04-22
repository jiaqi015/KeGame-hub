import { logEvent } from '../runtimeState.js';
import type { GameState, InboundOpportunity } from '../models.js';
import { chance, clamp, randomInt } from '../utils.js';
import { applyInboundOpportunity } from '../market/inboundOpportunityEngine.js';

export function tickCompanyPressure(state: GameState) {
  const pressure = state.marketShadow.companyPressure;
  const base = state.rules.companySharedLeadPressureBase;

  pressure.sharedLeadPressure = clamp(
    pressure.sharedLeadPressure + randomInt(-3, 4, state) + (base - pressure.sharedLeadPressure) * 0.05,
    0,
    100,
  );
  pressure.focusSlotPressure = clamp(pressure.focusSlotPressure + randomInt(-2, 3, state), 0, 100);
  pressure.internalCompetitionHeat = clamp(pressure.internalCompetitionHeat + randomInt(-3, 4, state), 0, 100);
  pressure.internalReferralChance = clamp(
    state.rules.companyReferralChanceBase + (100 - pressure.sharedLeadPressure) / 1000,
    0,
    0.35,
  );
}

export function applyCompanyPressure(state: GameState) {
  const pressure = state.marketShadow.companyPressure;
  const activeOpps = state.opportunities.filter((entry) => entry.status === 'active');

  if (pressure.sharedLeadPressure >= 58) {
    activeOpps
      .filter((entry) => entry.leadSource === 'broker' || entry.visibility === 'shadow')
      .forEach((entry) => {
        entry.intent = clamp(entry.intent - pressure.sharedLeadPressure / 95, 0, 100);
        entry.confidence = clamp(entry.confidence - pressure.internalCompetitionHeat / 120, 0, 100);
      });

    if (chance(0.16, state)) {
      logEvent(state, '公司资源', '同公司共享客户池变紧，部分经纪人线索推进开始变慢。', 'danger');
    }
  }

  if (chance(pressure.internalReferralChance, state)) {
    const inbound: InboundOpportunity = {
      id: `company-referral-${state.day}-${randomInt(100, 999, state)}`,
      type: 'customer_to_player',
      source: 'same_company',
      title: '同公司转客',
      message: '同公司同事转来一位客户，但需求还需要你自己确认。',
      payload: {
        bonus: 8,
      },
    };
    applyInboundOpportunity(state, inbound);
  }
}
