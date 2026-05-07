import { logEvent } from '../runtimeState.js';
import { clamp } from '../utils.js';
import { actionSuccess } from './actionExecutionResult.js';
import { touchCaseForAction } from './actionExecutorHelpers.js';
import { refundResources } from './actionResourceAccounting.js';
import { touchCustomersForCase } from './customerEngine.js';
import { findBestOpportunity, refreshOpportunityLabel } from './opportunityEngine.js';
import { applyOpportunityIntentDeltaOnState, applyOpportunityConfidenceDeltaOnState, setOpportunityDaysLeftOnState, setOpportunityTouchedTodayOnState, setOpportunityVisibilityOnState, setOpportunityStageIndexOnState } from '../opportunitySplitHelper.js';
import type { ActionExecutorMap } from './actionExecutorTypes.js';

export const SHOWING_ACTION_EXECUTORS: ActionExecutorMap = {
  showing: ({ state, caseItem, action, optionId, onMessage }) => {
    touchCaseForAction(caseItem, action.id, state.day);
    const explicitOpportunityId = resolveShowingOpportunityIdFromOption(optionId);
    const opportunity = explicitOpportunityId
      ? state.opportunities.find((entry) => (
          entry.id === explicitOpportunityId
          && entry.caseId === caseItem.id
          && entry.status === 'active'
          && entry.stageIndex >= 0
          && entry.stageIndex <= 2
        )) || null
      : findBestOpportunity(state, caseItem.id, 0, 2);
    if (!opportunity) {
      refundResources(state, action, '当前没有合适的线索可以安排带看');
      onMessage?.('当前没有合适的线索可以安排带看。');
      return false;
    }

    const strategy = normalizeShowingStrategy(optionId);
    caseItem.viewings += 1;
    caseItem.heat = clamp(caseItem.heat + (strategy === 'compare-rival-before' ? 6 : 5), 0, 100);
    setOpportunityStageIndexOnState(state, opportunity, Math.max(opportunity.stageIndex + 1, 2), '带看推进阶段', 0, 4);
    applyOpportunityIntentDeltaOnState(state, opportunity, strategy === 'show-best-fit' ? 15 : 12, '带看提升意向', 0, 100);
    applyOpportunityConfidenceDeltaOnState(state, opportunity, strategy === 'compare-rival-before' ? 11 : 8, '带看提升置信度', 0, 100);
    setOpportunityDaysLeftOnState(state, opportunity, 4, '带看设定剩余天数');
    setOpportunityTouchedTodayOnState(state, opportunity, true, '带看标记今日触达');
    touchCustomersForCase(state, caseItem.id, {
      interestDelta: strategy === 'show-best-fit' ? 9 : 7,
      confidenceDelta: strategy === 'compare-rival-before' ? 8 : 6,
      stageAdvance: 1,
      revealShadow: true,
      note: '带看让客户更真实进入决策',
    });
    if (strategy === 'owner-feedback-after') {
      caseItem.lastOwnerTouchedDay = state.day;
      caseItem.touchedOwnerToday = true;
    }

    if (opportunity.visibility === 'shadow') {
      setOpportunityVisibilityOnState(state, opportunity, 'revealed', '带看揭示客户');
      logEvent(state, opportunity.customerName, `通过这次带看，你摸清了 ${opportunity.customerName} 的真实需求。`, 'success');
    }

    refreshOpportunityLabel(state, opportunity);

    if (opportunity.stageIndex >= 3) {
      caseItem.offers = Math.max(caseItem.offers, 1);
      logEvent(state, opportunity.customerName, `${opportunity.customerName} 对 ${caseItem.title} 的带看反馈很好，机会进入 ${opportunity.stageLabel}。`, 'success');
    } else {
      logEvent(state, opportunity.customerName, `${caseItem.title} 完成一次带看，机会推进到 ${opportunity.stageLabel}。`, 'accent');
    }

    onMessage?.(`${caseItem.title} 的带看已经安排，客户反馈会沉淀到后续经营。`);
    return actionSuccess(opportunity);
  },
};

function resolveShowingOpportunityIdFromOption(optionId: string | null | undefined) {
  const prefix = 'show-customer-';
  if (!optionId?.startsWith(prefix)) {
    return null;
  }
  return optionId.slice(prefix.length) || null;
}

function normalizeShowingStrategy(optionId: string | null | undefined) {
  if (resolveShowingOpportunityIdFromOption(optionId)) return 'show-best-fit';
  if (optionId === 'efficiency-showing') return 'show-best-fit';
  if (optionId === 'experience-showing') return 'compare-rival-before';
  if (optionId === 'closing-showing') return 'owner-feedback-after';
  if (optionId === 'show-best-fit' || optionId === 'compare-rival-before' || optionId === 'owner-feedback-after') {
    return optionId;
  }
  return 'show-best-fit';
}

export const SHOWING_ACTION_EXECUTOR_IDS = Object.freeze(Object.keys(SHOWING_ACTION_EXECUTORS));
