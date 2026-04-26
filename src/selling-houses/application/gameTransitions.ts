import type { DailyTickResult, GameState } from '../domain/models.js';
import type { Settlement } from '../domain/actions/templates.js';
import type { TodayPlanDraft } from './todayPlan.js';
import { advanceDays, executeAction, spendResources, resolveActionDefinition } from '../domain/engine.js';
import { getActionAvailability, recordDomainEvent } from '../domain/engine.js';
import { updateDerivedState } from '../domain/runtimeState.js';
import {
  createProductRun,
  describeRunMilestone,
  findMilestoneById,
  hasActiveProductRunForTargets,
} from '../domain/productRuns.js';
import {
  buildTodayPlanItem,
  getTodayPlanActionDefinition,
  getTodayPlanRemainingEnergy,
  getSlotRemainingCapacity,
  hasTodayPlanDuplicate,
  markTodayPlanItemCompletedMutable,
  resolveActionDurationHours,
  resolveTodayPlanExecutionMode,
  syncTodayPlanForCurrentDayMutable,
} from './todayPlan.js';

export function cloneGameState(state: GameState): GameState {
  return structuredClone(state);
}

export function transitionGameState(
  state: GameState,
  transition: (next: GameState) => void,
): GameState {
  const next = cloneGameState(state);
  transition(next);
  return next;
}

export interface AdvanceGameDaysSummary {
  nextState: GameState;
  requestedDays: number;
  settledDays: number;
  beforeDay: number;
  afterDay: number;
  gameOver: boolean;
  lastResult: DailyTickResult | null;
  settledResults: DailyTickResult[];
}

export function advanceGameDaysWithSummary(
  state: GameState,
  count: number,
  onMessage?: (msg: string) => void,
): AdvanceGameDaysSummary {
  const beforeDay = state.day;
  let settledResults: DailyTickResult[] = [];
  const nextState = transitionGameState(state, (next) => {
    settledResults = advanceDays(next, count, onMessage);
    syncTodayPlanForCurrentDayMutable(next);
  });

  return {
    nextState,
    requestedDays: count,
    settledDays: settledResults.length,
    beforeDay,
    afterDay: nextState.day,
    gameOver: nextState.gameOver,
    lastResult: settledResults[settledResults.length - 1] || null,
    settledResults,
  };
}

export function advanceGameDays(
  state: GameState,
  count: number,
  onMessage?: (msg: string) => void,
): GameState {
  return advanceGameDaysWithSummary(state, count, onMessage).nextState;
}

export function executeGameAction(
  state: GameState,
  actionId: string,
  caseId: string,
  optionId: string | null = null,
  todayPlanItemId: string | null = null,
  onMessage?: (msg: string) => void,
) {
  let success = false;
  const nextState = transitionGameState(state, (next) => {
    const currentCase = next.cases.find((entry) => entry.id === caseId);
    if (currentCase) {
      success = executeAction(next, actionId, currentCase, optionId, onMessage);
      if (success) {
        if (todayPlanItemId) {
          markTodayPlanItemCompletedMutable(next, todayPlanItemId);
        } else {
          const plannedItem = next.todayPlan.playerItems.find((entry) => (
            entry.day === next.day
            && entry.status === 'planned'
            && entry.linkedActionId === actionId
            && entry.linkedCaseId === caseId
          ));
          if (plannedItem) {
            plannedItem.status = 'completed';
          }
        }
      }
    }
    syncTodayPlanForCurrentDayMutable(next);
  });

  return {
    nextState,
    success,
  };
}

export function executeScenarioAction(
  state: GameState,
  actionId: string,
  caseId: string,
  settlement: Settlement,
  scenarioContext?: {
    choices?: Array<{ round: number; main: string; assist: string }>;
    feedbacks?: Array<{ actor: string; mood: string; message: string }>;
  },
  todayPlanItemId: string | null = null,
  onMessage?: (msg: string) => void,
) {
  let success = false;
  const nextState = transitionGameState(state, (next) => {
    const currentCase = next.cases.find((entry) => entry.id === caseId);
    if (!currentCase || currentCase.status !== 'active') {
      return;
    }

    const action = resolveActionDefinition(actionId);
    if (!action) {
      return;
    }

    const availability = getActionAvailability(next, currentCase, actionId);
    if (!availability.enabled) {
      onMessage?.(availability.reason);
      return;
    }

    spendResources(next, action);

    const todayPlanItem = todayPlanItemId
      ? next.todayPlan.playerItems.find((entry) => entry.id === todayPlanItemId && entry.day === next.day)
      : null;
    const deltaTarget = {
      linkedCustomerId: todayPlanItem?.linkedCustomerId,
      linkedOpportunityId: todayPlanItem?.linkedOpportunityId,
    };
    settlement.stateDeltas.forEach((delta) => {
      applyScenarioDelta(next, currentCase, delta, actionId, deltaTarget);
    });
    currentCase.actionsToday += 1;
    currentCase.touchedToday = true;
    currentCase.lastTouchedDay = next.day;
    currentCase.lastAction = action.executorId || action.id;

    recordDomainEvent(next, {
      kind: 'action_executed',
      actor: '场景动作',
      title: `执行 ${actionId}`,
      detail: settlement.title,
      caseId,
      tone: 'accent',
      payload: {
        actionId,
        finalOptionId: settlement.finalOptionId ?? scenarioContext?.choices?.[scenarioContext.choices.length - 1]?.main ?? null,
        settlementOutcome: settlement.outcome,
        settlementTitle: settlement.title,
        stateDeltas: settlement.stateDeltas,
        choices: scenarioContext?.choices || [],
        feedbacks: scenarioContext?.feedbacks || [],
      },
    });

    if (action.id === 'open-day') {
      const targetIds = next.cases
        .filter((entry) => entry.status === 'active' && entry.community === currentCase.community)
        .map((entry) => entry.id);
      const normalizedTargets = targetIds.length > 0 ? targetIds : [currentCase.id];
      if (!hasActiveProductRunForTargets(next, 'open-day', normalizedTargets)) {
        const run = createProductRun(next, 'open-day', normalizedTargets);
        next.productRuns.unshift(run);
        const milestone = findMilestoneById(run, run.nextMilestone);
        const runEvent = recordDomainEvent(next, {
          kind: 'journal',
          actor: '开放日产品链路',
          title: '启动开放日跨天 run',
          detail: describeRunMilestone(run, milestone?.id || run.nextMilestone),
          caseId: currentCase.id,
          tone: 'success',
          payload: {
            runId: run.id,
            productType: run.productType,
            scope: run.scope,
            targetIds: run.targetIds,
            nextMilestone: run.nextMilestone,
          },
        });
        run.linkedEventIds = [...(run.linkedEventIds || []), runEvent.id];
      }
    }

    if (todayPlanItemId) {
      markTodayPlanItemCompletedMutable(next, todayPlanItemId);
    } else {
      const plannedItem = next.todayPlan.playerItems.find((entry) => (
        entry.day === next.day
        && entry.status === 'planned'
        && entry.linkedActionId === actionId
        && entry.linkedCaseId === caseId
      ));
      if (plannedItem) {
        plannedItem.status = 'completed';
      }
    }

    updateDerivedState(next);
    success = true;
    syncTodayPlanForCurrentDayMutable(next);
  });

  return {
    nextState,
    success,
  };
}

export function syncTodayPlanForCurrentDay(state: GameState) {
  return transitionGameState(state, (next) => {
    syncTodayPlanForCurrentDayMutable(next);
  });
}

export function addTodayPlanItem(
  state: GameState,
  draft: TodayPlanDraft,
  onMessage?: (msg: string) => void,
) {
  let success = false;
  let reason = '';

  const nextState = transitionGameState(state, (next) => {
    syncTodayPlanForCurrentDayMutable(next);

    const action = getTodayPlanActionDefinition(draft.linkedActionId);
    if (!action) {
      reason = '这个动作暂时还没有接好。';
      onMessage?.(reason);
      return;
    }

    const caseItem = draft.linkedCaseId
      ? next.cases.find((entry) => entry.id === draft.linkedCaseId)
      : null;
    if (!caseItem || caseItem.status !== 'active') {
      reason = '这套房当前不在场，先刷新一下再试。';
      onMessage?.(reason);
      return;
    }

    if (hasTodayPlanDuplicate(next, draft)) {
      reason = '这件事今天已经排进来了。';
      onMessage?.(reason);
      return;
    }

    const availability = getActionAvailability(next, caseItem, action.id);
    if (!availability.enabled) {
      reason = availability.reason;
      onMessage?.(reason);
      return;
    }

    const targetSlot = draft.slot === 'pm' ? 'pm' : 'am';
    const actionDurationHours = resolveActionDurationHours(action.id);
    if (getSlotRemainingCapacity(next, targetSlot) < actionDurationHours) {
      reason = `${targetSlot === 'am' ? '上午' : '下午'}时段容量不足，先完成已排事项或改到另一个时段。`;
      onMessage?.(reason);
      return;
    }

    const remainingEnergy = getTodayPlanRemainingEnergy(next);
    if (remainingEnergy < action.costEnergy) {
      reason = `今天还能安排的精力不够，先完成一件已排事项。`;
      onMessage?.(reason);
      return;
    }

    next.todayPlan.playerItems.push(buildTodayPlanItem(next, {
      ...draft,
      executionMode: resolveTodayPlanExecutionMode(action.id, draft.executionMode),
    }));
    syncTodayPlanForCurrentDayMutable(next);
    success = true;
  });

  return {
    nextState: success ? nextState : state,
    success,
    reason,
  };
}

export function removeTodayPlanItem(
  state: GameState,
  itemId: string,
  onMessage?: (msg: string) => void,
) {
  let success = false;
  let reason = '';

  const nextState = transitionGameState(state, (next) => {
    syncTodayPlanForCurrentDayMutable(next);
    const before = next.todayPlan.playerItems.length;
    next.todayPlan.playerItems = next.todayPlan.playerItems.filter((entry) => !(
      entry.id === itemId
      && entry.day === next.day
      && entry.status === 'planned'
    ));
    success = next.todayPlan.playerItems.length < before;
    if (!success) {
      reason = '这个安排已经不在今天的计划里了。';
      onMessage?.(reason);
    }
  });

  return {
    nextState: success ? nextState : state,
    success,
    reason,
  };
}

export function executeTodayPlanItem(
  state: GameState,
  itemId: string,
  optionId: string | null = null,
  onMessage?: (msg: string) => void,
) {
  const item = state.todayPlan.playerItems.find((entry) => (
    entry.id === itemId
    && entry.day === state.day
    && entry.status === 'planned'
  )) || null;
  if (!item) {
    const reason = '这个安排已经不在今天的计划里了。';
    onMessage?.(reason);
    return {
      nextState: state,
      success: false,
      reason,
      outcome: 'missing' as const,
      executionMode: null,
    };
  }

  const action = getTodayPlanActionDefinition(item.linkedActionId);
  const executionMode = resolveTodayPlanExecutionMode(item.linkedActionId, item.executionMode);
  if (!action || !item.linkedCaseId) {
    const reason = '这个安排暂时还没有接好执行入口。';
    onMessage?.(reason);
    return {
      nextState: state,
      success: false,
      reason,
      outcome: 'blocked' as const,
      executionMode,
    };
  }

  if (executionMode === 'scenario') {
    return {
      nextState: state,
      success: true,
      reason: '',
      outcome: 'scenario' as const,
      executionMode,
    };
  }

  const result = executeGameAction(state, action.id, item.linkedCaseId, optionId, itemId, onMessage);
  if (!result.success) {
    return {
      nextState: state,
      success: false,
      reason: '',
      outcome: 'blocked' as const,
      executionMode,
    };
  }

  return {
    nextState: result.nextState,
    success: true,
    reason: '',
    outcome: 'executed' as const,
    executionMode,
  };
}

function clamp01to100(value: number) {
  return Math.max(0, Math.min(100, value));
}

function applyScenarioDelta(
  state: GameState,
  currentCase: GameState['cases'][number],
  delta: Settlement['stateDeltas'][number],
  actionId: string,
  target?: {
    linkedCustomerId?: string;
    linkedOpportunityId?: string;
  },
) {
  if (delta.field === 'trust') {
    currentCase.trust = clamp01to100(currentCase.trust + delta.value);
    return;
  }
  if (delta.field === 'patience') {
    currentCase.patience = clamp01to100(currentCase.patience + delta.value);
    return;
  }
  if (delta.field === 'd1') {
    currentCase.d1 = clamp01to100(currentCase.d1 + delta.value);
    return;
  }
  if (delta.field === 'd2') {
    currentCase.d2 = clamp01to100(currentCase.d2 + delta.value);
    return;
  }
  if (delta.field === 'd3') {
    currentCase.d3 = clamp01to100(currentCase.d3 + delta.value);
    return;
  }
  if (delta.field === 'heat') {
    currentCase.heat = clamp01to100(currentCase.heat + delta.value);
    return;
  }
  if (delta.field === 'urgency') {
    currentCase.urgency = clamp01to100(currentCase.urgency + delta.value);
    return;
  }
  if (delta.field === 'askPrice') {
    currentCase.askPrice += delta.value;
    return;
  }
  if (delta.field === 'intent' || delta.field === 'confidence') {
    const activeOpportunities = state.opportunities
      .filter((entry) => entry.caseId === currentCase.id && entry.status === 'active');
    const explicitOpportunity = target?.linkedOpportunityId
      ? activeOpportunities.find((entry) => entry.id === target.linkedOpportunityId)
      : null;
    const customerOpportunity = !explicitOpportunity && target?.linkedCustomerId
      ? activeOpportunities.find((entry) => entry.customerId === target.linkedCustomerId)
      : null;
    const fallbackOpportunity = [...activeOpportunities]
      .sort((left, right) => (right.stageIndex + right.intent / 100) - (left.stageIndex + left.intent / 100))[0];
    const targetOpportunity = explicitOpportunity || customerOpportunity || fallbackOpportunity;
    if (!targetOpportunity) {
      recordDomainEvent(state, {
        kind: 'journal',
        actor: '场景动作',
        title: '结算字段未写回',
        detail: `${actionId} 结算包含 ${delta.field}，但当前没有可写回的活跃客户线。`,
        caseId: currentCase.id,
        tone: 'danger',
        payload: { field: delta.field, value: delta.value },
      });
      return;
    }
    if (delta.field === 'intent') {
      targetOpportunity.intent = clamp01to100(targetOpportunity.intent + delta.value);
    } else {
      targetOpportunity.confidence = clamp01to100(targetOpportunity.confidence + delta.value);
    }
    return;
  }
  recordDomainEvent(state, {
    kind: 'journal',
    actor: '场景动作',
    title: '结算字段未支持',
    detail: `${actionId} 结算字段 ${delta.field} 暂未支持写回，已忽略。`,
    caseId: currentCase.id,
    tone: 'danger',
    payload: { field: delta.field, value: delta.value },
  });
}
