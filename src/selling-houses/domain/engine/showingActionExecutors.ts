import { logEvent } from '../runtimeState.js';
import { clamp } from '../utils.js';
import { actionSuccess } from './actionExecutionResult.js';
import { touchCaseForAction } from './actionExecutorHelpers.js';
import { refundResources } from './actionResourceAccounting.js';
import { touchCustomersForCase } from './customerEngine.js';
import { findBestOpportunity, refreshOpportunityLabel } from './opportunityEngine.js';
import type { ActionExecutorMap } from './actionExecutorTypes.js';

export const SHOWING_ACTION_EXECUTORS: ActionExecutorMap = {
  showing: ({ state, caseItem, action, optionId, onMessage }) => {
    touchCaseForAction(caseItem, action.id, state.day);
    const opportunity = findBestOpportunity(state, caseItem.id, 0, 2);
    if (!opportunity) {
      refundResources(state, action, '当前没有合适的线索可以安排带看');
      onMessage?.('当前没有合适的线索可以安排带看。');
      return false;
    }

    const strategy = optionId || 'experience-showing';
    caseItem.viewings += 1;
    caseItem.heat = clamp(caseItem.heat + (strategy === 'efficiency-showing' ? 4 : 5), 0, 100);
    opportunity.stageIndex = clamp(Math.max(opportunity.stageIndex + 1, 2), 0, 4);
    opportunity.intent = clamp(opportunity.intent + (strategy === 'closing-showing' ? 16 : 12), 0, 100);
    opportunity.confidence = clamp(opportunity.confidence + (strategy === 'experience-showing' ? 10 : 7), 0, 100);
    opportunity.daysLeft = 4;
    opportunity.touchedToday = true;
    touchCustomersForCase(state, caseItem.id, {
      interestDelta: strategy === 'closing-showing' ? 9 : 7,
      confidenceDelta: strategy === 'experience-showing' ? 8 : 5,
      stageAdvance: 1,
      revealShadow: true,
      note: '带看让客户更真实进入决策',
    });

    if (opportunity.visibility === 'shadow') {
      opportunity.visibility = 'revealed';
      logEvent(state, opportunity.customerName, `通过这次带看，你摸清了 ${opportunity.customerName} 的真实需求。`, 'success');
    }

    refreshOpportunityLabel(opportunity);

    if (opportunity.stageIndex >= 3) {
      caseItem.offers = Math.max(caseItem.offers, 1);
      logEvent(state, opportunity.customerName, `${opportunity.customerName} 对 ${caseItem.title} 的带看反馈很好，机会进入 ${opportunity.stageLabel}。`, 'success');
    } else {
      logEvent(state, opportunity.customerName, `${caseItem.title} 完成一次带看，机会推进到 ${opportunity.stageLabel}。`, 'accent');
    }

    onMessage?.(`${caseItem.title} 的带看已经安排并推进。`);
    return actionSuccess(opportunity);
  },
};

export const SHOWING_ACTION_EXECUTOR_IDS = Object.freeze(Object.keys(SHOWING_ACTION_EXECUTORS));
