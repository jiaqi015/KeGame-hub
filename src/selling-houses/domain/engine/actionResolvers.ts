import { ACTIONS } from '../constants.js';
import { BALANCE } from '../config/balance.js';
import { queueDealClosingEvaluation } from '../dealClosing.js';
import { updateDerivedState, logEvent, recordDomainEvent } from '../runtimeState.js';
import { recordBudgetChange } from '../budget.js';
import { applyAuxiliaryStats, getPromotionBudget } from '../runtimeStats.js';
import { clamp, randomInt } from '../utils.js';
import type {
  ActionDefinition,
  Case,
  GameState,
  Opportunity,
} from '../models.js';
import {
  adjustCaseOpportunities,
  closeOpportunity,
  createOpportunity,
  findBestOpportunity,
  refreshOpportunityLabel,
} from './opportunityEngine.js';
import { touchCustomersForCase } from './customerEngine.js';

function spendResources(state: GameState, action: ActionDefinition) {
  state.energy = clamp(state.energy - action.costEnergy, 0, state.maxEnergy);
  if (action.costPromotionBudget > 0) {
    recordBudgetChange(state, {
      amount: -action.costPromotionBudget,
      kind: 'action-spend',
      title: `执行 ${action.name}`,
      detail: `${action.name} 消耗推广金 ${action.costPromotionBudget} 点。`,
    });
  }
}

function refundResources(state: GameState, action: ActionDefinition, reason: string) {
  state.energy = clamp(state.energy + action.costEnergy, 0, state.maxEnergy);
  if (action.costPromotionBudget > 0) {
    recordBudgetChange(state, {
      amount: action.costPromotionBudget,
      kind: 'action-refund',
      title: `${action.name} 退回`,
      detail: `${reason}，退回推广金 ${action.costPromotionBudget} 点。`,
    });
  }
}

type ActionExecutionContext = {
  state: GameState;
  action: ActionDefinition;
  caseItem: Case;
  optionId: string | null;
  onMessage?: (msg: string) => void;
};

type ActionExecutor = (ctx: ActionExecutionContext) => boolean;

function resolveActionDefinition(actionId: string) {
  return ACTIONS.find((entry) => entry.id === actionId || entry.executorId === actionId);
}

function normalizeActionId(actionId: string) {
  const action = resolveActionDefinition(actionId);
  return action?.executorId || action?.id || actionId;
}

function findShadowOpportunity(state: GameState, caseId: string) {
  return state.opportunities.find((entry) => entry.caseId === caseId && entry.status === 'active' && entry.visibility === 'shadow');
}

function touchCaseForAction(caseItem: Case, actionId: string, currentDay: number, touchOwner = false) {
  caseItem.actionsToday += 1;
  caseItem.touchedToday = true;
  caseItem.lastTouchedDay = currentDay;
  caseItem.lastAction = normalizeActionId(actionId);
  if (touchOwner) {
    caseItem.touchedOwnerToday = true;
  }
}

const ACTION_EXECUTORS: Record<string, ActionExecutor> = {
  'first-visit': ({ state, caseItem, action, optionId, onMessage }) => {
    touchCaseForAction(caseItem, action.id, state.day, true);
    caseItem.hasCompletedFirstVisit = true;
    caseItem.lastOwnerTouchedDay = state.day;
    const strategy = optionId || 'plan-first';
    const trustDelta = strategy === 'rapport-first' ? 8 : strategy === 'data-first' ? 5 : 6;
    const patienceDelta = strategy === 'plan-first' ? 7 : 5;
    const urgencyDelta = strategy === 'plan-first' ? -5 : -3;
    const heatDelta = strategy === 'data-first' ? 2 : 1;
    caseItem.trust = clamp(caseItem.trust + trustDelta, 0, 100);
    caseItem.patience = clamp(caseItem.patience + patienceDelta, 0, 100);
    caseItem.urgency = clamp(caseItem.urgency + urgencyDelta, 0, 100);
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
    caseItem.trust = clamp(caseItem.trust + trustDelta, 0, 100);
    caseItem.patience = clamp(caseItem.patience + patienceDelta, 0, 100);
    caseItem.urgency = clamp(caseItem.urgency + urgencyDelta, 0, 100);
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
    caseItem.trust = clamp(caseItem.trust + (strategy === 'decision-dive' ? 3 : 5), 0, 100);
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
      shadowOpportunity.visibility = 'revealed';
      shadowOpportunity.intent = clamp(shadowOpportunity.intent + 6, 0, 100);
      shadowOpportunity.confidence = clamp(shadowOpportunity.confidence + 8, 0, 100);
      refreshOpportunityLabel(shadowOpportunity);
      logEvent(state, '诊断反馈', `${caseItem.title} 的诊断过程中，你顺带摸清了一位待确认客户的真实需求。`, 'success');
    }
    logEvent(state, caseItem.ownerName, `${caseItem.title} 完成一轮深度诊断，业主开始更理解这套房现在到底卡在哪。`, 'accent');
    onMessage?.(`${caseItem.title} 已完成深度诊断。`);
    return true;
  },
  story: ({ state, caseItem, action, optionId, onMessage }) => {
    touchCaseForAction(caseItem, action.id, state.day);
    const strategy = optionId || 'product-angle';
    caseItem.competitiveness = clamp(caseItem.competitiveness + (strategy === 'certainty-angle' ? 7 : 8), 0, 100);
    caseItem.heat = clamp(caseItem.heat + (strategy === 'value-angle' ? 5 : 4), 0, 100);
    caseItem.trust = clamp(caseItem.trust + 2, 0, 100);
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
    caseItem.trust = clamp(caseItem.trust + (strategy === 'owner-circle' ? 4 : 2), 0, 100);
    caseItem.heat = clamp(caseItem.heat + (strategy === 'vip-circle' ? 3 : 4), 0, 100);
    createOpportunity(state, caseItem, 'private-referral', strategy === 'vip-circle' ? 15 : 10);
    if (caseItem.trust >= 68 || caseItem.qualityStory >= 1) {
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
    logEvent(state, '开放日', `${caseItem.title} 完成一次开放日，关注度被集中拉了起来。`, 'success');
    onMessage?.(`${caseItem.title} 的开放日结束，接下来适合追带看。`);
    return true;
  },
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
    return true;
  },
  'pricing-advice': ({ state, caseItem, action, optionId, onMessage }) => {
    touchCaseForAction(caseItem, action.id, state.day, true);
    caseItem.lastOwnerTouchedDay = state.day;
    const strategy = optionId || 'client-view';
    const trustDelta = strategy === 'client-view' ? 5 : strategy === 'compete-view' ? 3 : 4;
    const urgencyDelta = strategy === 'window-view' ? 3 : 1;
    caseItem.trust = clamp(caseItem.trust + trustDelta, 0, 100);
    caseItem.urgency = clamp(caseItem.urgency + urgencyDelta, 0, 100);
    caseItem.competitiveness = clamp(caseItem.competitiveness + 2, 0, 100);
    adjustCaseOpportunities(state, caseItem.id, strategy === 'client-view' ? 5 : 3, 4);
    touchCustomersForCase(state, caseItem.id, {
      confidenceDelta: strategy === 'client-view' ? 6 : 4,
      advisorTrustDelta: 4,
      note: '定价建议影响客户价格判断',
    });
    logEvent(state, caseItem.ownerName, `${caseItem.title} 完成一轮定价建议沟通，业主开始理解当前价格站位。`, 'accent');
    onMessage?.(`${caseItem.title} 已完成一轮定价建议。`);
    return true;
  },
  'ask-psychological-price': ({ state, caseItem, action, optionId, onMessage }) => {
    touchCaseForAction(caseItem, action.id, state.day, true);
    caseItem.lastOwnerTouchedDay = state.day;
    const strategy = optionId || 'soft-anchor';
    caseItem.trust = clamp(caseItem.trust + (strategy === 'bottom-anchor' ? -1 : strategy === 'soft-anchor' ? 4 : 2), 0, 100);
    caseItem.patience = clamp(caseItem.patience + 2, 0, 100);
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

    const isUrgent = caseItem.personality === 'urgent';
    const isPragmatic = caseItem.personality === 'pragmatic';
    const strategy = optionId || 'small-cut';

    if (strategy === 'hold-story') {
      caseItem.trust = clamp(caseItem.trust + (isPragmatic ? 1 : 3), 0, 100);
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
      caseItem.trust = clamp(caseItem.trust + (isPragmatic ? 8 : isUrgent ? 6 : 4), 0, 100);
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
    caseItem.trust = clamp(caseItem.trust + (isUrgent ? 12 : isPragmatic ? 6 : 7), 0, 100);
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
  'sincerity-sale': ({ state, caseItem, action, optionId, onMessage }) => {
    touchCaseForAction(caseItem, action.id, state.day);
    const opportunity = findBestOpportunity(state, caseItem.id, 2);
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
    refreshOpportunityLabel(opportunity);
    logEvent(state, caseItem.ownerName, `${caseItem.title} 进入诚意卖讨论，交易桌上的确定性开始抬升。`, 'success');
    onMessage?.(`${caseItem.title} 已推进到诚意卖讨论。`);
    return true;
  },
  'invite-customer-negotiation': ({ state, caseItem, action, optionId, onMessage }) => {
    touchCaseForAction(caseItem, action.id, state.day);
    const opportunity = findBestOpportunity(state, caseItem.id, 3);
    if (!opportunity) {
      refundResources(state, action, '当前还没有进入报价阶段的客户');
      onMessage?.('当前还没有进入报价阶段的客户。');
      return false;
    }

    resolveNegotiation(state, caseItem, opportunity, optionId, onMessage);
    return true;
  },
};

export function executeAction(
  state: GameState,
  actionId: string,
  caseItem: Case | null | undefined,
  optionId: string | null = null,
  onMessage?: (msg: string) => void,
) {
  const action = resolveActionDefinition(actionId);
  if (!action || !caseItem || caseItem.status !== 'active') return false;

  const availability = getActionAvailability(state, caseItem, actionId);
  if (!availability.enabled) {
    onMessage?.(availability.reason);
    return false;
  }

  const executor = ACTION_EXECUTORS[action.executorId || action.id];
  if (!executor) {
    onMessage?.('这个动作暂时还没有接好执行逻辑。');
    return false;
  }

  spendResources(state, action);
  const success = executor({ state, action, caseItem, optionId, onMessage });
  if (!success) {
    return false;
  }

  recordDomainEvent(state, {
    kind: 'action_executed',
    actor: '经营动作',
    title: action.name,
    detail: `${caseItem.title} 执行了 ${action.name}${optionId ? `（${optionId}）` : ''}。`,
    tone: 'accent',
    caseId: caseItem.id,
    payload: {
      actionId: action.id,
      executorId: action.executorId || action.id,
      optionId: optionId || undefined,
      family: action.family || '',
      categoryId: action.categoryId || '',
      costEnergy: action.costEnergy,
      costPromotionBudget: action.costPromotionBudget,
    },
  });
  updateDerivedState(state);
  return true;
}

function resolveNegotiation(
  state: GameState,
  caseItem: Case,
  opportunity: Opportunity,
  optionId: string | null,
  onMessage?: (msg: string) => void,
) {
  queueDealClosingEvaluation(state, caseItem, opportunity, optionId || 'balanced');
  onMessage?.(`${caseItem.title} 已进入价格确认，今天结束后会看客户和业主条件能不能谈成。`);
}

export function withdrawCase(world: GameState, caseItem: Case, reason: string) {
  caseItem.status = 'withdrawn';
  caseItem.stageLabel = '已撤盘';
  applyAuxiliaryStats(world, {
    withdrawnCount: world.auxiliaryStats.withdrawnCount + 1,
    wordOfMouth: clamp(world.auxiliaryStats.wordOfMouth - 3, 0, 100),
  });
  world.opportunities.forEach((entry) => {
    if (entry.caseId === caseItem.id && entry.status === 'active') {
      entry.status = 'closed';
      refreshOpportunityLabel(entry);
    }
  });
  world.customerStates.forEach((customerState) => {
    const runtime = customerState.caseStates[caseItem.id];
    if (!runtime) return;
    runtime.selected = false;
    runtime.interest = clamp(runtime.interest - 28, 0, 100);
    runtime.confidence = clamp(runtime.confidence - 20, 0, 100);
    customerState.activeCaseIds = customerState.activeCaseIds.filter((id) => id !== caseItem.id);
    if (customerState.status !== 'converted') {
      customerState.status = customerState.activeCaseIds.length > 0 ? 'browsing' : 'lost';
    }
    customerState.lastActionNote = '房源撤盘';
  });
  recordDomainEvent(world, {
    kind: 'case_withdrawn',
    actor: caseItem.ownerName,
    title: '房源撤盘',
    detail: `${caseItem.title} ${reason}`,
    tone: 'danger',
    caseId: caseItem.id,
    payload: {
      endingType: caseItem.endingType,
      endingBucket: caseItem.endingBucket,
    },
  });
  logEvent(world, caseItem.ownerName, `${caseItem.title} ${reason}`, 'danger');
}

export function getActionAvailability(
  state: GameState,
  caseItem: Case | null | undefined,
  actionId: string,
) {
  if (state.gameOver) {
    return { enabled: false, reason: '本局已经结束。' };
  }
  if (!caseItem || caseItem.status !== 'active') {
    return { enabled: false, reason: '这个盘已经不能再操作。' };
  }

  const action = resolveActionDefinition(actionId);
  if (!action) return { enabled: false, reason: '未知动作。' };

  const normalizedActionId = normalizeActionId(actionId);

  if (state.energy < action.costEnergy) {
    return { enabled: false, reason: '精力不够了，先结束今天吧。' };
  }
  if (getPromotionBudget(state) < action.costPromotionBudget) {
    return { enabled: false, reason: '推广金不足，先成交回款或者少做高成本动作。' };
  }

  if (['first-visit', 'weekly-feedback', 'deep-diagnosis', 'pricing-advice', 'ask-psychological-price', 'adjust-listing-price'].includes(normalizedActionId) && caseItem.touchedOwnerToday) {
    return { enabled: false, reason: '今天已经和业主深聊过一次了，先消化反馈，明天再推进。' };
  }
  if (normalizedActionId === 'first-visit' && caseItem.hasCompletedFirstVisit) {
    return { enabled: false, reason: '首次面访已经完成了，后续请改用周度反馈或深度诊断继续经营。' };
  }
  if (normalizedActionId === 'story' && caseItem.lastAction === 'story') {
    return { enabled: false, reason: '同一天连续改两次卖点收益很低，先拿反馈再继续打磨。' };
  }
  if (normalizedActionId === 'showing' && caseItem.lastAction === 'showing') {
    return { enabled: false, reason: '同一天重复安排多次带看会撞档，先等这轮反馈回来。' };
  }
  if (normalizedActionId === 'invite-customer-negotiation' && caseItem.lastAction === 'invite-customer-negotiation') {
    return { enabled: false, reason: '同一天已经在议价桌上推进过一次了，先等对方回球。' };
  }
  if (normalizedActionId === 'open-day' && caseItem.openDayCooldown > 0) {
    return { enabled: false, reason: `开放日还要冷却 ${caseItem.openDayCooldown} 天。` };
  }
  if (normalizedActionId === 'showing' && !findBestOpportunity(state, caseItem.id, 0, 2)) {
    return { enabled: false, reason: '还没有足够成熟的线索能安排带看。' };
  }
  if (normalizedActionId === 'sincerity-sale' && !findBestOpportunity(state, caseItem.id, 2)) {
    return { enabled: false, reason: '还没有足够成熟的客户适合进入诚意卖。' };
  }
  if (normalizedActionId === 'invite-customer-negotiation' && !findBestOpportunity(state, caseItem.id, 3)) {
    return { enabled: false, reason: '还没有进入报价阶段的客户。' };
  }

  return { enabled: true, reason: '' };
}
