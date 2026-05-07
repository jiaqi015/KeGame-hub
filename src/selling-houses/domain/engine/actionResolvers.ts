import { ACTIONS } from '../constants.js';
import { markCaseWithdrawn } from '../caseOutcome.js';
import { updateDerivedState, logEvent, recordDomainEvent } from '../runtimeState.js';
import { applyAuxiliaryStats, getPromotionBudget } from '../runtimeStats.js';
import { clamp, getDayOfWeek } from '../utils.js';
import { setOpportunityStatusOnState } from '../opportunitySplitHelper.js';
import { applyActionStageRelation, deriveCaseProgression, getActionStageRelation } from '../actionStageRelations.js';
import type { Case, GameState } from '../models.js';
import {
  findBestOpportunity,
  refreshOpportunityLabel,
} from './opportunityEngine.js';
import { executeActionTransaction } from './actionTransaction.js';
import {
  getActionExecutionOpportunity,
  isActionExecutionSuccess,
} from './actionExecutionResult.js';
export { refundResources, spendResources } from './actionResourceAccounting.js';
import { spendResources } from './actionResourceAccounting.js';
import type { ActionExecutorMap } from './actionExecutorTypes.js';
import { MARKETING_ACTION_EXECUTORS } from './marketingActionExecutors.js';
import { NEGOTIATION_ACTION_EXECUTORS } from './negotiationActionExecutors.js';
import { OPEN_DAY_ACTION_EXECUTORS } from './openDayActionExecutors.js';
import { OWNER_ACTION_EXECUTORS } from './ownerActionExecutors.js';
import { PRICING_ACTION_EXECUTORS } from './pricingActionExecutors.js';
import { SINCERITY_SALE_ACTION_EXECUTORS } from './sinceritySaleActionExecutors.js';
import { SHOWING_ACTION_EXECUTORS } from './showingActionExecutors.js';
import { emitDecisionMomentTriggers, advanceFlowProgress } from '../../runtime/simulation/decisionMomentEmission.js';
import { buildActionReceipt, appendActionReceipt } from '../../runtime/simulation/actionReceiptAdapter.js';

export function resolveActionDefinition(actionId: string) {
  return ACTIONS.find((entry) => entry.id === actionId || entry.executorId === actionId);
}

function normalizeActionId(actionId: string) {
  const action = resolveActionDefinition(actionId);
  return action?.executorId || action?.id || actionId;
}

function getOpportunityBoundUnavailableReason(actionId: string) {
  if (actionId === 'showing') {
    return '还没有足够成熟的线索能安排带看。';
  }
  if (actionId === 'sincerity-sale') {
    return '还没有足够成熟的客户适合进入诚意卖。';
  }
  if (actionId === 'invite-customer-negotiation') {
    return '还没有进入报价阶段的客户。';
  }
  return '当前还没有匹配这个动作的客户机会。';
}

const ACTION_EXECUTORS: ActionExecutorMap = {
  ...OWNER_ACTION_EXECUTORS,
  ...PRICING_ACTION_EXECUTORS,
  ...MARKETING_ACTION_EXECUTORS,
  ...SHOWING_ACTION_EXECUTORS,
  ...OPEN_DAY_ACTION_EXECUTORS,
  ...SINCERITY_SALE_ACTION_EXECUTORS,
  ...NEGOTIATION_ACTION_EXECUTORS,
};

export const LEGACY_ACTION_EXECUTOR_IDS = Object.freeze(Object.keys(ACTION_EXECUTORS));

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
    // Non-invasive blocked receipt — records that action was attempted but blocked
    try {
      const receipt = buildActionReceipt({
        day: state.day,
        caseId: caseItem.id,
        actionId: actionId,
        executorId: actionId,
        optionId,
        outcome: 'blocked',
        costEnergy: 0,
        costPromotionBudget: 0,
        fieldDeltas: [],
        outcomeSummary: availability.reason,
        emittedEventIds: [],
        affectedOpportunityIds: [],
      });
      appendActionReceipt(state, receipt);
    } catch {
      // Receipt generation is non-invasive — swallow errors silently
    }
    onMessage?.(availability.reason);
    return false;
  }

  const executor = ACTION_EXECUTORS[action.executorId || action.id];
  if (!executor) {
    onMessage?.('这个动作暂时还没有接好执行逻辑。');
    return false;
  }

  // Snapshot key fields before execution for receipt delta computation
  const beforeTrust = caseItem.trust;
  const beforePatience = caseItem.patience;
  const beforeUrgency = caseItem.urgency;
  const beforeHeat = caseItem.heat;
  const beforeCompetitiveness = caseItem.competitiveness;
  const beforeD1 = caseItem.d1;
  const beforeWindowDays = caseItem.windowDays;
  const beforeEventStoreLength = state.eventStore.length;
  const beforeOpportunityCount = state.opportunities.filter(
    (o) => o.caseId === caseItem.id && o.status === 'active',
  ).length;

  const transactionResult = executeActionTransaction(state, action, () => {
    spendResources(state, action);
    const result = executor({ state, action, caseItem, optionId, onMessage });
    if (isActionExecutionSuccess(result)) {
      applyActionStageRelation(state, caseItem, action.executorId || action.id, getActionExecutionOpportunity(result));
      return result;
    }
    return false;
  });
  if (!transactionResult.success) {
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
  emitDecisionMomentTriggers(state, action.id, caseItem, optionId ?? undefined);
  advanceFlowProgress(state, action.id, caseItem.id);
  updateDerivedState(state);

  // Non-invasive receipt hook: build compressed ActionReceipt after successful execution.
  // Does NOT alter gameplay, RNG, tick order, or UI.
  // Deterministic: same state snapshot → same receipt.
  try {
    const emittedEventIds = state.eventStore
      .slice(beforeEventStoreLength)
      .map((e) => e.id);
    const affectedOpportunityIds = state.opportunities
      .filter((o) => o.caseId === caseItem.id && o.status === 'active')
      .map((o) => o.id);
    const fieldDeltas: Array<{ field: string; from: number; to: number; delta: number }> = [];
    const pushDelta = (field: string, from: number, to: number) => {
      const delta = Math.round((to - from) * 100) / 100;
      if (delta !== 0) fieldDeltas.push({ field, from, to, delta });
    };
    pushDelta('trust', beforeTrust, caseItem.trust);
    pushDelta('patience', beforePatience, caseItem.patience);
    pushDelta('urgency', beforeUrgency, caseItem.urgency);
    pushDelta('heat', beforeHeat, caseItem.heat);
    pushDelta('competitiveness', beforeCompetitiveness, caseItem.competitiveness);
    pushDelta('d1', beforeD1, caseItem.d1);
    pushDelta('windowDays', beforeWindowDays, caseItem.windowDays);

    const receipt = buildActionReceipt({
      day: state.day,
      caseId: caseItem.id,
      actionId: action.id,
      executorId: action.executorId || action.id,
      optionId,
      outcome: 'success',
      costEnergy: action.costEnergy,
      costPromotionBudget: action.costPromotionBudget,
      fieldDeltas,
      outcomeSummary: `${action.name} 执行成功`,
      emittedEventIds,
      affectedOpportunityIds,
    });
    appendActionReceipt(state, receipt);
  } catch {
    // Receipt generation is non-invasive — swallow errors silently
  }

  return true;
}

export function withdrawCase(world: GameState, caseItem: Case, reason: string) {
  caseItem.status = 'withdrawn';
  caseItem.stageLabel = '已核销';

  markCaseWithdrawn(caseItem);

  applyAuxiliaryStats(world, {
    withdrawnCount: world.auxiliaryStats.withdrawnCount + 1,
    wordOfMouth: clamp(world.auxiliaryStats.wordOfMouth - 3, 0, 100),
  });
  world.opportunities.forEach((entry) => {
    if (entry.caseId === caseItem.id && entry.status === 'active') {
      setOpportunityStatusOnState(world, entry, 'closed', '房源撤回关闭机会');
      refreshOpportunityLabel(world, entry);
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
  const stageRelation = getActionStageRelation(normalizedActionId);

  if (state.energy < action.costEnergy) {
    return { enabled: false, reason: '精力不够了，先结束今天吧。' };
  }
  if (getPromotionBudget(state) < action.costPromotionBudget) {
    return { enabled: false, reason: '推广金不足，先成交回款或者少做高成本动作。' };
  }

  if (stageRelation?.touchesOwner && caseItem.touchedOwnerToday) {
    return { enabled: false, reason: '今天已经和业主深聊过一次了，先消化反馈，明天再推进。' };
  }
  if (stageRelation?.revealsOwnerState && stageRelation.repeatableAfterCompletion === false && caseItem.hasCompletedFirstVisit) {
    return { enabled: false, reason: '首次面访已经完成了，后续请改用周度反馈或深度诊断继续经营。' };
  }
  if (stageRelation && !stageRelation.phaseIds.includes(deriveCaseProgression(state, caseItem).phase)) {
    return { enabled: false, reason: '这件事现在还接不上当前房源状态。' };
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
  if (normalizedActionId === 'focus-meeting-submit') {
    if (getDayOfWeek(state.day) !== 4) {
      return { enabled: false, reason: '周四上午才能提报聚焦会。' };
    }
    if (state.focusMeeting.submissionDay === state.day && state.focusMeeting.submittedCaseIds.includes(caseItem.id)) {
      return { enabled: false, reason: '这套房今天已经提报过了。' };
    }
    if (state.focusMeeting.submissionDay === state.day && state.focusMeeting.submittedCaseIds.length >= 3) {
      return { enabled: false, reason: '周四聚焦会最多提报 3 套房。' };
    }
  }
  if (stageRelation?.availabilityKind === 'opportunity-bound' && stageRelation.opportunityStageWindow) {
    const { min, max } = stageRelation.opportunityStageWindow;
    if (!findBestOpportunity(state, caseItem.id, min, max)) {
      return { enabled: false, reason: getOpportunityBoundUnavailableReason(normalizedActionId) };
    }
  }

  return { enabled: true, reason: '' };
}
