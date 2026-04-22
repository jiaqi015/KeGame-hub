import type { GameState } from '../domain/models.js';
import type { Settlement } from '../domain/actions/templates.js';
import type { TodayPlanDraft } from './todayPlan.js';
import { advanceDays, executeAction } from '../domain/engine.js';
import { getActionAvailability } from '../domain/engine.js';
import { applyScenarioSettlement } from '../domain/actions/templates.js';
import {
  buildTodayPlanItem,
  getTodayPlanActionDefinition,
  getTodayPlanRemainingEnergy,
  hasTodayPlanDuplicate,
  markTodayPlanItemCompletedMutable,
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

export function advanceGameDays(
  state: GameState,
  count: number,
  onMessage?: (msg: string) => void,
): GameState {
  return transitionGameState(state, (next) => {
    advanceDays(next, count, onMessage);
    syncTodayPlanForCurrentDayMutable(next);
  });
}

export function executeGameAction(
  state: GameState,
  actionId: string,
  caseId: string,
  optionId: string | null = null,
  settlement: Settlement | null = null,
  onMessage?: (msg: string) => void,
) {
  let success = false;
  const nextState = transitionGameState(state, (next) => {
    const currentCase = next.cases.find((entry) => entry.id === caseId);
    if (currentCase) {
      if (settlement) {
        applyScenarioSettlement(currentCase, settlement);
      }
      success = executeAction(next, actionId, currentCase, optionId, onMessage);
      if (success) {
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

  const result = executeGameAction(state, action.id, item.linkedCaseId, optionId, null, onMessage);
  if (!result.success) {
    return {
      nextState: state,
      success: false,
      reason: '',
      outcome: 'blocked' as const,
      executionMode,
    };
  }

  const completedState = transitionGameState(result.nextState, (next) => {
    markTodayPlanItemCompletedMutable(next, itemId);
    syncTodayPlanForCurrentDayMutable(next);
  });

  return {
    nextState: completedState,
    success: true,
    reason: '',
    outcome: 'executed' as const,
    executionMode,
  };
}
