import { actionSuccess } from './actionExecutionResult.js';
import { touchCaseForAction } from './actionExecutorHelpers.js';
import { refundResources } from './actionResourceAccounting.js';
import type { ActionExecutorMap } from './actionExecutorTypes.js';
import { queueNegotiationProcessEvaluation } from './negotiationActionLifecycle.js';
import { findBestOpportunity } from './opportunityEngine.js';

export const NEGOTIATION_ACTION_EXECUTORS: ActionExecutorMap = {
  'invite-customer-negotiation': ({ state, caseItem, action, optionId, onMessage }) => {
    touchCaseForAction(caseItem, action.id, state.day);
    const opportunity = findBestOpportunity(state, caseItem.id, 3, 6);
    if (!opportunity) {
      refundResources(state, action, '当前还没有进入报价阶段的客户');
      onMessage?.('当前还没有进入报价阶段的客户。');
      return false;
    }

    queueNegotiationProcessEvaluation(state, caseItem, opportunity, optionId, onMessage);
    return actionSuccess(opportunity);
  },
};

export const NEGOTIATION_ACTION_EXECUTOR_IDS = Object.freeze(Object.keys(NEGOTIATION_ACTION_EXECUTORS));
