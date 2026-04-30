import { logEvent } from '../runtimeState.js';
import { clamp } from '../utils.js';
import { actionSuccess } from './actionExecutionResult.js';
import { touchCaseForAction } from './actionExecutorHelpers.js';
import { refundResources } from './actionResourceAccounting.js';
import { touchCustomersForCase } from './customerEngine.js';
import { findBestOpportunity, refreshOpportunityLabel } from './opportunityEngine.js';
import { startActionProductRunIfNeeded } from './productRunActionLifecycle.js';
import type { ActionExecutorMap } from './actionExecutorTypes.js';

export const SINCERITY_SALE_ACTION_EXECUTORS: ActionExecutorMap = {
  'sincerity-sale': ({ state, caseItem, action, optionId, onMessage }) => {
    touchCaseForAction(caseItem, action.id, state.day);
    const opportunity = findBestOpportunity(state, caseItem.id, 2, 6);
    if (!opportunity) {
      refundResources(state, action, '当前还没有足够成熟的客户适合进入诚意卖');
      onMessage?.('当前还没有足够成熟的客户适合进入诚意卖。');
      return false;
    }

    const strategy = optionId || 'balanced-sincerity';
    const priceFactor = strategy === 'strict-sincerity' ? 0.998 : strategy === 'balanced-sincerity' ? 0.993 : 0.988;
    caseItem.askPrice = Math.max(Math.round(caseItem.bottomPrice), Math.round(caseItem.askPrice * priceFactor));
    opportunity.intent = clamp(opportunity.intent + (strategy === 'fast-sincerity' ? 12 : 8), 0, 100);
    opportunity.confidence = clamp(opportunity.confidence + (strategy === 'strict-sincerity' ? 6 : 10), 0, 100);
    opportunity.daysLeft = 3;
    opportunity.touchedToday = true;
    touchCustomersForCase(state, caseItem.id, {
      interestDelta: strategy === 'fast-sincerity' ? 8 : 5,
      confidenceDelta: strategy === 'strict-sincerity' ? 5 : 8,
      stageAdvance: 1,
      note: '诚意卖把客户推向报价与谈判',
    });
    startActionProductRunIfNeeded(state, caseItem, 'sincere-sale');
    refreshOpportunityLabel(opportunity);
    logEvent(state, caseItem.ownerName, `${caseItem.title} 进入诚意卖讨论，交易桌上的确定性开始抬升。`, 'success');
    onMessage?.(`${caseItem.title} 已推进到诚意卖讨论。`);
    return actionSuccess(opportunity);
  },
};

export const SINCERITY_SALE_ACTION_EXECUTOR_IDS = Object.freeze(Object.keys(SINCERITY_SALE_ACTION_EXECUTORS));
