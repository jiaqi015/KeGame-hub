import { logEvent } from '../runtimeState.js';
import { clamp } from '../utils.js';
import { applyBrokerOwnerTrustDelta } from '../trustWriteHelper.js';
import { applyOwnerCasePatienceDelta, applyOwnerCaseUrgencyDelta } from '../ownerCaseReadinessHelper.js';
import { touchCustomersForCase } from './customerEngine.js';
import { touchCaseForAction } from './actionExecutorHelpers.js';
import { adjustCaseOpportunities, refreshOpportunityLabel } from './opportunityEngine.js';
import { applyOpportunityIntentDeltaOnState, applyOpportunityConfidenceDeltaOnState, setOpportunityVisibilityOnState } from '../opportunitySplitHelper.js';
import type { ActionExecutorMap } from './actionExecutorTypes.js';
import type { GameState } from '../models.js';

function findShadowOpportunity(state: GameState, caseId: string) {
  return state.opportunities.find((entry) => entry.caseId === caseId && entry.status === 'active' && entry.visibility === 'shadow');
}

export const OWNER_ACTION_EXECUTORS: ActionExecutorMap = {
  'first-visit': ({ state, caseItem, action, optionId, onMessage }) => {
    touchCaseForAction(caseItem, action.id, state.day, true);
    caseItem.hasCompletedFirstVisit = true;
    caseItem.lastOwnerTouchedDay = state.day;
    const strategy = optionId || 'plan-first';
    const trustDelta = strategy === 'rapport-first' ? 8 : strategy === 'data-first' ? 5 : 6;
    const patienceDelta = strategy === 'plan-first' ? 7 : 5;
    const urgencyDelta = strategy === 'plan-first' ? -5 : -3;
    const heatDelta = strategy === 'data-first' ? 2 : 1;
    applyBrokerOwnerTrustDelta(state, caseItem, trustDelta, '首次面访建立信任', 0, 100);
    applyOwnerCasePatienceDelta(state, caseItem, patienceDelta, '首次面访建立信任', 0, 100);
    applyOwnerCaseUrgencyDelta(state, caseItem, urgencyDelta, '首次面访建立信任', 0, 100);
    caseItem.windowDays = Math.min(caseItem.windowDays + 1, 14);
    caseItem.heat = clamp(caseItem.heat + heatDelta, 0, 100);
    adjustCaseOpportunities(state, caseItem.id, 4, 3);
    touchCustomersForCase(state, caseItem.id, {
      interestDelta: 5,
      confidenceDelta: 7,
      advisorTrustDelta: 6,
      note: '首次面访建立信任',
    });
    logEvent(state, caseItem.ownerName, `${caseItem.title} 完成首次面访，业主对经营路径有了更清晰的理解。`, 'success');
    onMessage?.(`${caseItem.title} 已完成首次面访。`);
    return true;
  },
  'weekly-feedback': ({ state, caseItem, action, optionId, onMessage }) => {
    touchCaseForAction(caseItem, action.id, state.day, true);
    caseItem.lastOwnerTouchedDay = state.day;
    const strategy = optionId || 'show-plan';
    const trustDelta = strategy === 'show-progress' ? 6 : strategy === 'show-risk' ? 3 : 5;
    const patienceDelta = strategy === 'show-plan' ? 6 : 3;
    const urgencyDelta = strategy === 'show-risk' ? 1 : -2;
    applyBrokerOwnerTrustDelta(state, caseItem, trustDelta, '周度反馈提升信任', 0, 100);
    applyOwnerCasePatienceDelta(state, caseItem, patienceDelta, '周度反馈提升信任', 0, 100);
    applyOwnerCaseUrgencyDelta(state, caseItem, urgencyDelta, '周度反馈提升信任', 0, 100);
    caseItem.windowDays = Math.min(caseItem.windowDays + 1, 14);
    adjustCaseOpportunities(state, caseItem.id, 3, 3);
    touchCustomersForCase(state, caseItem.id, {
      interestDelta: 4,
      confidenceDelta: 5,
      advisorTrustDelta: 4,
      note: '周度反馈稳定客户预期',
    });
    logEvent(state, caseItem.ownerName, `${caseItem.title} 完成一轮周度反馈，业主对当前节奏更有感知。`, 'success');
    onMessage?.(`${caseItem.title} 已完成周度反馈。`);
    return true;
  },
  'deep-diagnosis': ({ state, caseItem, action, optionId, onMessage }) => {
    touchCaseForAction(caseItem, action.id, state.day, true);
    caseItem.lastOwnerTouchedDay = state.day;
    const strategy = optionId || 'customer-dive';
    applyBrokerOwnerTrustDelta(state, caseItem, (strategy === 'decision-dive' ? 3 : 5), '深度诊断提升信任', 0, 100);
    caseItem.competitiveness = clamp(caseItem.competitiveness + 4, 0, 100);
    caseItem.heat = clamp(caseItem.heat + 2, 0, 100);
    adjustCaseOpportunities(state, caseItem.id, 5, 5);
    touchCustomersForCase(state, caseItem.id, {
      interestDelta: 3,
      confidenceDelta: 8,
      advisorTrustDelta: 5,
      revealShadow: true,
      note: '深度诊断摸清客户需求',
    });
    const shadowOpportunity = findShadowOpportunity(state, caseItem.id);
    if (shadowOpportunity) {
      setOpportunityVisibilityOnState(state, shadowOpportunity, 'revealed', '诊断揭示影子机会');
      applyOpportunityIntentDeltaOnState(state, shadowOpportunity, 6, '诊断提升意向', 0, 100);
      applyOpportunityConfidenceDeltaOnState(state, shadowOpportunity, 8, '诊断提升信心', 0, 100);
      refreshOpportunityLabel(state, shadowOpportunity);
      logEvent(state, '诊断反馈', `${caseItem.title} 的诊断过程中，你顺带摸清了一位待确认客户的真实需求。`, 'success');
    }
    logEvent(state, caseItem.ownerName, `${caseItem.title} 完成一轮深度诊断，业主开始更理解这套房现在到底卡在哪。`, 'accent');
    onMessage?.(`${caseItem.title} 已完成深度诊断。`);
    return true;
  },
};

export const OWNER_ACTION_EXECUTOR_IDS = Object.freeze(Object.keys(OWNER_ACTION_EXECUTORS));
