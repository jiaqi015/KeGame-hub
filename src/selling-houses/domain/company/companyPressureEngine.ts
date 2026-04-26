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
      logEvent(state, '公司群消息', '商圈经理在群里发火了，大家都在抢客，必须增加跟客户的联系频率，不然全被洗走了。', 'danger');
    }
  }

  if (chance(pressure.internalReferralChance, state)) {
    const inbound: InboundOpportunity = {
      id: `company-referral-${state.day}-${randomInt(100, 999, state)}`,
      type: 'customer_to_player',
      source: 'same_company',
      title: '同事甩来的线索',
      message: '二组老赵丢过来一个号码，要看你手头的房，但客户到底图啥他是一问三不知。',
      payload: {
        bonus: 8,
      },
    };
    applyInboundOpportunity(state, inbound);
  }
}
