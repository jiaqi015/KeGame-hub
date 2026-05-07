import { applyAuxiliaryStats } from '../runtimeStats.js';
import { logEvent } from '../runtimeState.js';
import { clamp, getDayOfWeek, randomInt } from '../utils.js';
import { applyBrokerOwnerTrustDelta } from '../trustWriteHelper.js';
import { readCaseRelationBusinessContextFromRuntime } from '../../core/world-state/relationReadProjection.js';
import { touchCustomersForCase } from './customerEngine.js';
import { touchCaseForAction } from './actionExecutorHelpers.js';
import { refundResources } from './actionResourceAccounting.js';
import { adjustCaseOpportunities, createOpportunity } from './opportunityEngine.js';
import type { ActionExecutorMap } from './actionExecutorTypes.js';

interface FocusMeetingMeta {
  submittedCaseIds?: unknown;
  selectedCaseId?: unknown;
  recommendationMode?: unknown;
  externalRivalListingIds?: unknown;
  comparingCustomerIds?: unknown;
}

function parseFocusMeetingMeta(meta: unknown): FocusMeetingMeta {
  return meta && typeof meta === 'object' ? meta as FocusMeetingMeta : {};
}

function uniqueCaseIds(input: unknown) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map(String).filter(Boolean))].slice(0, 3);
}

function uniqueIds(input: unknown, limit = 12) {
  if (!Array.isArray(input)) return [];
  return [...new Set(input.map(String).filter(Boolean))].slice(0, limit);
}

export const MARKETING_ACTION_EXECUTORS: ActionExecutorMap = {
  'story': ({ state, caseItem, action, optionId, onMessage }) => {
    touchCaseForAction(caseItem, action.id, state.day);
    const strategy = optionId || 'product-angle';
    caseItem.competitiveness = clamp(caseItem.competitiveness + (strategy === 'certainty-angle' ? 7 : 8), 0, 100);
    caseItem.heat = clamp(caseItem.heat + (strategy === 'value-angle' ? 5 : 4), 0, 100);
    applyBrokerOwnerTrustDelta(state, caseItem, 2, '卖点重构提升信任', 0, 100);
    caseItem.qualityStory += 1;
    adjustCaseOpportunities(state, caseItem.id, strategy === 'value-angle' ? 7 : 6, 4);
    touchCustomersForCase(state, caseItem.id, {
      interestDelta: strategy === 'value-angle' ? 8 : 6,
      confidenceDelta: 3,
      note: '卖点重构让客户更容易理解这套房',
    });
    logEvent(state, caseItem.maintainerName, `${caseItem.title} 完成一轮卖点重构，接下来的营销表达更顺了。`, 'accent');
    onMessage?.(`${caseItem.title} 的卖点已经重新整理。`);
    return true;
  },
  'xiaohongshu-boost': ({ state, caseItem, action, optionId, onMessage }) => {
    touchCaseForAction(caseItem, action.id, state.day);
    const strategy = optionId || 'traffic-push';
    caseItem.heat = clamp(caseItem.heat + (strategy === 'traffic-push' ? 11 : strategy === 'precise-push' ? 8 : 6), 0, 100);
    applyAuxiliaryStats(state, {
      wordOfMouth: clamp(state.auxiliaryStats.wordOfMouth + (strategy === 'reputation-push' ? 2 : 1), 0, 100),
    });
    createOpportunity(state, caseItem, 'xiaohongshu', strategy === 'precise-push' ? 12 : 10);
    if ((caseItem.qualityStory > 0 || caseItem.heat > 72) && randomInt(0, 99, state) < (strategy === 'traffic-push' ? 45 : 32)) {
      createOpportunity(state, caseItem, 'xiaohongshu', 6);
    }
    touchCustomersForCase(state, caseItem.id, {
      interestDelta: strategy === 'traffic-push' ? 7 : 5,
      confidenceDelta: strategy === 'precise-push' ? 5 : 2,
      note: '公开推广抬升客户关注',
    });
    logEvent(state, '小红书推广', `${caseItem.title} 发起一轮小红书推广，公开客群开始抬头。`, 'accent');
    onMessage?.(`${caseItem.title} 已完成一轮小红书推广。`);
    return true;
  },
  'broker-broadcast': ({ state, caseItem, action, optionId, onMessage }) => {
    touchCaseForAction(caseItem, action.id, state.day);
    const strategy = optionId || 'target-network';
    caseItem.heat = clamp(caseItem.heat + (strategy === 'wide-network' ? 6 : 4), 0, 100);
    caseItem.competitiveness = clamp(caseItem.competitiveness + (strategy === 'core-network' ? 4 : 3), 0, 100);
    createOpportunity(state, caseItem, 'broker-network', strategy === 'core-network' ? 14 : 12);
    if (randomInt(0, 99, state) < (strategy === 'wide-network' ? 65 : 50)) {
      createOpportunity(state, caseItem, 'broker-network', 8);
    }
    touchCustomersForCase(state, caseItem.id, {
      interestDelta: 4,
      confidenceDelta: strategy === 'core-network' ? 6 : 3,
      advisorTrustDelta: 2,
      note: '经纪人网络扩大接触面',
    });
    logEvent(state, '经纪人投放', `${caseItem.title} 被分发到合作经纪人网络，换来更多待确认需求的客群。`, 'accent');
    onMessage?.(`${caseItem.title} 已完成一轮经纪人投放。`);
    return true;
  },
  'private-referral': ({ state, caseItem, action, optionId, onMessage }) => {
    touchCaseForAction(caseItem, action.id, state.day);
    const strategy = optionId || 'old-client-circle';
    applyBrokerOwnerTrustDelta(state, caseItem, (strategy === 'owner-circle' ? 4 : 2), '私域转介绍提升信任', 0, 100);
    caseItem.heat = clamp(caseItem.heat + (strategy === 'vip-circle' ? 3 : 4), 0, 100);
    createOpportunity(state, caseItem, 'private-referral', strategy === 'vip-circle' ? 15 : 10);
    if (readCaseRelationBusinessContextFromRuntime(state, caseItem).trustValue >= 68 || caseItem.qualityStory >= 1) {
      createOpportunity(state, caseItem, 'private-referral', 14);
    }
    touchCustomersForCase(state, caseItem.id, {
      interestDelta: 5,
      confidenceDelta: 7,
      advisorTrustDelta: 5,
      note: '私域转介绍提升客户信任',
    });
    logEvent(state, '私域转介绍', `${caseItem.title} 通过私域关系链被再次推荐，客群质量更整齐。`, 'success');
    onMessage?.(`${caseItem.title} 已完成一轮私域转介绍。`);
    return true;
  },
  'focus-meeting-submit': ({ state, caseItem, action, optionId, meta, onMessage }) => {
    if (getDayOfWeek(state.day) !== 4) {
      refundResources(state, action, '非周四不可提报聚焦会');
      onMessage?.('周四上午才能提报聚焦会。');
      return false;
    }
    const focusMeta = parseFocusMeetingMeta(meta);
    const requestedSubmittedCaseIds = uniqueCaseIds(focusMeta.submittedCaseIds);
    const requestedSelectedCaseId = typeof focusMeta.selectedCaseId === 'string' ? focusMeta.selectedCaseId : '';
    const submittedCaseIds = requestedSubmittedCaseIds.length > 0
      ? requestedSubmittedCaseIds
      : [caseItem.id];
    const selectedCaseId = submittedCaseIds.includes(requestedSelectedCaseId)
      ? requestedSelectedCaseId
      : caseItem.id;
    if (state.focusMeeting.submissionDay !== state.day) {
      state.focusMeeting = {
        submissionDay: state.day,
        submittedCaseIds: [],
        selectedCaseIds: [],
        comparisonCaseIds: [],
        recommendationMode: null,
        selectedCaseId: null,
        externalRivalListingIds: [],
        comparingCustomerIds: [],
      };
    }
    const alreadySubmittedIds = submittedCaseIds.filter((caseId) => state.focusMeeting.submittedCaseIds.includes(caseId));
    if (alreadySubmittedIds.length > 0) {
      refundResources(state, action, '同一房源当天不可重复提报');
      onMessage?.('有房源今天已经提报过了。');
      return false;
    }
    if (state.focusMeeting.submittedCaseIds.length + submittedCaseIds.length > 3) {
      refundResources(state, action, '周四聚焦会提报上限为 3 套');
      onMessage?.('周四聚焦会最多提报 3 套房。');
      return false;
    }
    const submittedCases = submittedCaseIds
      .map((caseId) => state.cases.find((entry) => entry.id === caseId))
      .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry) && entry.status === 'active');
    if (!submittedCases.length) {
      refundResources(state, action, '没有可提报房源');
      onMessage?.('今天没有可提报的活跃房源。');
      return false;
    }
    state.focusMeeting.submittedCaseIds.push(...submittedCases.map((entry) => entry.id));
    const strategy = optionId || 'quality-priority';
    const strategyLabel = strategy === 'owner-readiness'
      ? '业主配合'
      : strategy === 'customer-signal'
        ? '客户信号'
        : '房源质量';
    submittedCases.forEach((entry) => {
      touchCaseForAction(entry, action.id, state.day, true);
      entry.lastOwnerTouchedDay = state.day;
      entry.heat = clamp(entry.heat + (strategy === 'customer-signal' ? 4 : 2), 0, 100);
      entry.competitiveness = clamp(entry.competitiveness + (strategy === 'quality-priority' ? 3 : 1), 0, 100);
      applyBrokerOwnerTrustDelta(state, entry, strategy === 'owner-readiness' ? 3 : 1, '聚焦会提报强化资源承接', 0, 100);
    });
    const selectedCase = submittedCases.find((entry) => entry.id === selectedCaseId) || submittedCases[0];
    state.cases.forEach((entry) => {
      entry.isFocused = entry.id === selectedCase.id;
    });
    state.focusMeeting.selectedCaseIds = [selectedCase.id];
    state.focusMeeting.comparisonCaseIds = submittedCases.map((entry) => entry.id);
    state.focusMeeting.selectedCaseId = selectedCase.id;
    state.focusMeeting.recommendationMode = strategy;
    state.focusMeeting.externalRivalListingIds = uniqueIds(focusMeta.externalRivalListingIds);
    state.focusMeeting.comparingCustomerIds = uniqueIds(focusMeta.comparingCustomerIds);
    selectedCase.heat = clamp(selectedCase.heat + 12, 0, 100);
    selectedCase.competitiveness = clamp(selectedCase.competitiveness + 6, 0, 100);
    applyBrokerOwnerTrustDelta(state, selectedCase, 5, '聚焦会最终入选并推进推广', 0, 100);
    createOpportunity(state, selectedCase, 'xiaohongshu', 12);
    createOpportunity(state, selectedCase, 'broker-network', 10);
    logEvent(
      state,
      '周四聚焦会',
      `${submittedCases.map((entry) => entry.title).join('、')} 完成提报；最终聚焦 ${selectedCase.title}，参考 ${state.focusMeeting.externalRivalListingIds.length} 个外部竞品和 ${state.focusMeeting.comparingCustomerIds.length} 位比较中客户，按「${strategyLabel}」推进推广。`,
      'accent',
    );
    onMessage?.(`${selectedCase.title} 已定为本轮聚焦房源，开始推进推广。`);
    return true;
  },
};

export const MARKETING_ACTION_EXECUTOR_IDS = Object.freeze(Object.keys(MARKETING_ACTION_EXECUTORS));
