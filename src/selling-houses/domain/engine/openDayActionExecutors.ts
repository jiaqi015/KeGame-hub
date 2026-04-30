import { logEvent } from '../runtimeState.js';
import { clamp } from '../utils.js';
import {
  adjustCaseOpportunities,
  createOpportunity,
} from './opportunityEngine.js';
import { touchCustomersForCase } from './customerEngine.js';
import { touchCaseForAction } from './actionExecutorHelpers.js';
import { startActionProductRunIfNeeded } from './productRunActionLifecycle.js';
import type { ActionExecutorMap } from './actionExecutorTypes.js';

export const OPEN_DAY_ACTION_EXECUTORS: ActionExecutorMap = {
  'open-day': ({ state, caseItem, action, optionId, onMessage }) => {
    touchCaseForAction(caseItem, action.id, state.day);
    const strategy = optionId || 'quality-open-day';
    caseItem.openDayCooldown = 4;
    caseItem.heat = clamp(caseItem.heat + (strategy === 'heat-open-day' ? 18 : strategy === 'quality-open-day' ? 14 : 16), 0, 100);
    caseItem.trust = clamp(caseItem.trust + (strategy === 'conversion-open-day' ? 4 : 3), 0, 100);
    caseItem.viewings += 1;
    adjustCaseOpportunities(state, caseItem.id, strategy === 'quality-open-day' ? 10 : 8, strategy === 'conversion-open-day' ? 8 : 6);
    createOpportunity(state, caseItem, 'open-day', strategy === 'quality-open-day' ? 18 : 15);
    createOpportunity(state, caseItem, 'open-day', strategy === 'heat-open-day' ? 12 : 14);
    touchCustomersForCase(state, caseItem.id, {
      interestDelta: strategy === 'heat-open-day' ? 10 : 8,
      confidenceDelta: strategy === 'conversion-open-day' ? 7 : 5,
      stageAdvance: 1,
      note: '开放日推动客户从关注走向看房',
    });
    startActionProductRunIfNeeded(state, caseItem, 'open-day');
    logEvent(state, '开放日', `${caseItem.title} 完成一次开放日，关注度被集中拉了起来。`, 'success');
    onMessage?.(`${caseItem.title} 的开放日结束，接下来适合追带看。`);
    return true;
  },
};

export const OPEN_DAY_ACTION_EXECUTOR_IDS = Object.freeze(Object.keys(OPEN_DAY_ACTION_EXECUTORS));
