import { logEvent } from '../runtimeState.js';
import { clamp } from '../utils.js';
import { applyBrokerOwnerTrustDelta } from '../trustWriteHelper.js';
import { applyOwnerCasePatienceDelta, applyOwnerCaseUrgencyDelta } from '../ownerCaseReadinessWriteHelper.js';
import { readOwnerBehaviorDimensions } from '../ownerDecisionProfileHelper.js';
import { touchCustomersForCase } from './customerEngine.js';
import { touchCaseForAction } from './actionExecutorHelpers.js';
import { adjustCaseOpportunities } from './opportunityEngine.js';
import type { ActionExecutorMap } from './actionExecutorTypes.js';

export const PRICING_ACTION_EXECUTORS: ActionExecutorMap = {
  'pricing-advice': ({ state, caseItem, action, optionId, onMessage }) => {
    touchCaseForAction(caseItem, action.id, state.day, true);
    caseItem.lastOwnerTouchedDay = state.day;
    const strategy = optionId || 'client-view';
    const trustDelta = strategy === 'client-view' ? 5 : strategy === 'compete-view' ? 3 : 4;
    const urgencyDelta = strategy === 'window-view' ? 3 : 1;
    applyBrokerOwnerTrustDelta(state, caseItem, trustDelta, '价格沟通提升信任', 0, 100);
    applyOwnerCaseUrgencyDelta(state, caseItem, urgencyDelta, '价格沟通影响紧迫', 0, 100);
    caseItem.competitiveness = clamp(caseItem.competitiveness + 2, 0, 100);
    adjustCaseOpportunities(state, caseItem.id, strategy === 'client-view' ? 5 : 3, 4);
    touchCustomersForCase(state, caseItem.id, {
      confidenceDelta: strategy === 'client-view' ? 6 : 4,
      advisorTrustDelta: 4,
      note: '价格沟通会影响客户价格判断',
    });
    logEvent(state, caseItem.ownerName, `${caseItem.title} 完成一轮价格沟通，业主开始理解当前价格站位。`, 'accent');
    onMessage?.(`${caseItem.title} 已完成一轮价格沟通。`);
    return true;
  },
  'ask-psychological-price': ({ state, caseItem, action, optionId, onMessage }) => {
    touchCaseForAction(caseItem, action.id, state.day, true);
    caseItem.lastOwnerTouchedDay = state.day;
    const strategy = optionId || 'soft-anchor';
    applyBrokerOwnerTrustDelta(state, caseItem, (strategy === 'bottom-anchor' ? -1 : strategy === 'soft-anchor' ? 4 : 2), '心理价试探影响信任', 0, 100);
    applyOwnerCasePatienceDelta(state, caseItem, 2, '心理价试探影响耐心', 0, 100);
    caseItem.bottomPrice = Math.max(
      Math.round(caseItem.marketPrice * (strategy === 'soft-anchor' ? 0.95 : strategy === 'data-anchor' ? 0.93 : 0.91)),
      caseItem.bottomPrice,
    );
    touchCustomersForCase(state, caseItem.id, {
      confidenceDelta: 4,
      advisorTrustDelta: 2,
      note: '心理价试探让客户预期更稳定',
    });
    logEvent(state, caseItem.ownerName, `${caseItem.title} 完成一轮心理价试探，你对业主真实价格预期更有把握。`, 'success');
    onMessage?.(`${caseItem.title} 已摸到一部分业主心理价。`);
    return true;
  },
  'adjust-listing-price': ({ state, caseItem, action, optionId, onMessage }) => {
    touchCaseForAction(caseItem, action.id, state.day, true);
    caseItem.lastOwnerTouchedDay = state.day;
    caseItem.lastPriceActionDay = state.day;

    const ownerBehavior = readOwnerBehaviorDimensions(caseItem);
    const strategy = optionId || 'small-cut';

    if (strategy === 'hold-story') {
      applyBrokerOwnerTrustDelta(state, caseItem, ownerBehavior.holdStoryTrustDelta, '守价换讲法信任', 0, 100);
      caseItem.competitiveness = clamp(caseItem.competitiveness + 6, 0, 100);
      caseItem.heat = clamp(caseItem.heat + 3, 0, 100);
      adjustCaseOpportunities(state, caseItem.id, 5, 4);
      touchCustomersForCase(state, caseItem.id, {
        interestDelta: 4,
        confidenceDelta: 4,
        note: '守价换讲法，稳住在场客户',
      });
      logEvent(state, caseItem.ownerName, `${caseItem.title} 暂不降价，而是先统一新的卖点说辞。`, 'accent');
      onMessage?.(`${caseItem.title} 选择了守价换讲法。`);
      return true;
    }

    if (strategy === 'small-cut') {
      caseItem.askPrice = Math.max(Math.round(caseItem.marketPrice * 0.95), Math.round(caseItem.askPrice * 0.985));
      applyBrokerOwnerTrustDelta(state, caseItem, ownerBehavior.smallCutTrustDelta, '小幅调价提升信任', 0, 100);
      caseItem.competitiveness = clamp(caseItem.competitiveness + 9, 0, 100);
      caseItem.heat = clamp(caseItem.heat + 6, 0, 100);
      adjustCaseOpportunities(state, caseItem.id, 8, 6);
      touchCustomersForCase(state, caseItem.id, {
        interestDelta: 8,
        confidenceDelta: 7,
        note: '小幅调价提高客户可接受度',
      });
      logEvent(state, caseItem.ownerName, `${caseItem.title} 小幅调整挂牌价，换来了更高的成交确定性。`, 'success');
      onMessage?.(`${caseItem.title} 已完成小幅调价。`);
      return true;
    }

    caseItem.askPrice = Math.max(Math.round(caseItem.marketPrice * 0.92), Math.round(caseItem.askPrice * 0.97));
    applyBrokerOwnerTrustDelta(state, caseItem, ownerBehavior.deepCutTrustDelta, '明显调价提升信任', 0, 100);
    caseItem.competitiveness = clamp(caseItem.competitiveness + 14, 0, 100);
    caseItem.heat = clamp(caseItem.heat + 10, 0, 100);
    adjustCaseOpportunities(state, caseItem.id, 12, 8);
    touchCustomersForCase(state, caseItem.id, {
      interestDelta: 10,
      confidenceDelta: 9,
      stageAdvance: 1,
      note: '明显调价把客户推进到更深决策',
    });
    logEvent(state, caseItem.ownerName, `${caseItem.title} 明显调整挂牌价，关注度快速抬升。`, 'success');
    onMessage?.(`${caseItem.title} 已切到快卖模式。`);
    return true;
  },
};

export const PRICING_ACTION_EXECUTOR_IDS = Object.freeze(Object.keys(PRICING_ACTION_EXECUTORS));
