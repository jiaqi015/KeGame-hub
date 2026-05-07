import { logEvent } from '../runtimeState.js';
import type { GameState, InboundOpportunity } from '../models.js';
import { chance, clamp, randomInt } from '../utils.js';
import { applyInboundOpportunity } from '../market/inboundOpportunityEngine.js';
import { applyOpportunityIntentDeltaOnState, applyOpportunityConfidenceDeltaOnState } from '../opportunitySplitHelper.js';
import type { PressureReceiptSink } from '../../core/world-state/competition/models.js';

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

export function applyCompanyPressure(state: GameState, sink?: PressureReceiptSink) {
  const pressure = state.marketShadow.companyPressure;
  const activeOpps = state.opportunities.filter((entry) => entry.status === 'active');

  if (pressure.sharedLeadPressure >= 58) {
    activeOpps
      .filter((entry) => entry.leadSource === 'broker' || entry.visibility === 'shadow')
      .forEach((entry) => {
        const intentDelta = -pressure.sharedLeadPressure / 95;
        const confidenceDelta = -pressure.internalCompetitionHeat / 120;
        applyOpportunityIntentDeltaOnState(state, entry, intentDelta, '公司内部共享线索压力', 0, 100);
        applyOpportunityConfidenceDeltaOnState(state, entry, confidenceDelta, '公司内部竞争热度', 0, 100);

        sink?.collectPressure({
          source: 'company-pressure',
          caseId: entry.caseId,
          day: state.day,
          dimension: 'intent',
          magnitude: Math.round(intentDelta * 100) / 100,
          evidence: `公司内部共享线索压力（${Math.round(pressure.sharedLeadPressure)}）导致 ${entry.customerName} 意向下降。`,
          sourceEntityId: 'company-pressure-state',
          sourceEntityLabel: '公司内部竞争',
          evidenceKind: 'company-shared-lead-pressure',
          evidenceStrength: Math.min(100, Math.round(pressure.sharedLeadPressure)),
          opportunityIds: [entry.id],
        });
        sink?.collectPressure({
          source: 'company-pressure',
          caseId: entry.caseId,
          day: state.day,
          dimension: 'confidence',
          magnitude: Math.round(confidenceDelta * 100) / 100,
          evidence: `公司内部竞争热度（${Math.round(pressure.internalCompetitionHeat)}）导致 ${entry.customerName} 置信度下降。`,
          sourceEntityId: 'company-pressure-state',
          sourceEntityLabel: '公司内部竞争',
          evidenceKind: 'company-internal-competition',
          evidenceStrength: Math.min(100, Math.round(pressure.internalCompetitionHeat)),
          opportunityIds: [entry.id],
        });
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
