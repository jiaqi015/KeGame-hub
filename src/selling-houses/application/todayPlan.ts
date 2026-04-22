import { ACTIONS } from '../domain/constants.js';
import type {
  ActionDefinition,
  GameState,
  TodayArrangementExecutionMode,
  TodayArrangementItem,
  TodayArrangementSlot,
} from '../domain/models.js';

export interface TodayPlanDraft {
  sourceMatterId?: string;
  linkedActionId: string;
  linkedCaseId?: string;
  linkedCustomerId?: string;
  executionMode?: TodayArrangementExecutionMode;
  slot?: TodayArrangementSlot;
}

function resolveActionDefinition(actionId: string): ActionDefinition | null {
  return ACTIONS.find((entry) => entry.id === actionId || entry.executorId === actionId) || null;
}

function buildItemSignature(item: Pick<TodayArrangementItem, 'linkedActionId' | 'linkedCaseId' | 'linkedCustomerId' | 'sourceMatterId'>) {
  return [
    item.linkedActionId || '',
    item.linkedCaseId || '',
    item.linkedCustomerId || '',
    item.sourceMatterId || '',
  ].join('|');
}

export function resolveTodayPlanExecutionMode(
  actionId: string,
  fallback?: TodayArrangementExecutionMode,
): TodayArrangementExecutionMode {
  const action = resolveActionDefinition(actionId);
  if (action?.type === 'scenario') {
    return 'scenario';
  }
  return fallback === 'scenario' ? 'scenario' : 'direct';
}

export function getTodayPlanActionDefinition(actionId: string) {
  return resolveActionDefinition(actionId);
}

export function estimateFixedTodayPlanEnergyReserve(state: GameState) {
  const scheduleReserve = state.schedule
    .slice(0, 2)
    .reduce((sum, entry) => sum + (entry.urgency >= 92 ? 2 : 1), 0);
  const negotiationReserve = state.matters.some((entry) => entry.stage === 'pending' && entry.kind === 'opportunity') ? 1 : 0;
  return scheduleReserve + negotiationReserve;
}

export function getTodayPlanCommittedEnergy(state: GameState, status: TodayArrangementItem['status'] = 'planned') {
  return state.todayPlan.playerItems
    .filter((entry) => entry.day === state.day && entry.status === status)
    .reduce((sum, entry) => sum + (resolveActionDefinition(entry.linkedActionId)?.costEnergy || 0), 0);
}

export function getTodayPlanRemainingEnergy(state: GameState) {
  return Math.max(0, state.energy - estimateFixedTodayPlanEnergyReserve(state) - getTodayPlanCommittedEnergy(state, 'planned'));
}

export function syncTodayPlanForCurrentDayMutable(state: GameState) {
  const currentDay = state.day;
  const currentPlan = state.todayPlan && typeof state.todayPlan === 'object'
    ? state.todayPlan
    : { day: currentDay, playerItems: [] };

  const deduped = new Map<string, TodayArrangementItem>();

  for (const rawItem of currentPlan.playerItems || []) {
    if (!rawItem || rawItem.day !== currentDay || !rawItem.linkedActionId) {
      continue;
    }

    const action = resolveActionDefinition(rawItem.linkedActionId);
    if (!action) {
      continue;
    }

    const normalized: TodayArrangementItem = {
      ...rawItem,
      executionMode: resolveTodayPlanExecutionMode(rawItem.linkedActionId, rawItem.executionMode),
      status: rawItem.status === 'completed' ? 'completed' : 'planned',
      slot: rawItem.slot === 'pm' ? 'pm' : rawItem.slot === 'am' ? 'am' : undefined,
    };

    if (normalized.status === 'planned' && normalized.linkedCaseId) {
      const caseItem = state.cases.find((entry) => entry.id === normalized.linkedCaseId);
      if (!caseItem || caseItem.status !== 'active') {
        continue;
      }
    }

    const signature = buildItemSignature(normalized);
    const existing = deduped.get(signature);
    if (!existing || (existing.status !== 'completed' && normalized.status === 'completed')) {
      deduped.set(signature, normalized);
    }
  }

  state.todayPlan = {
    day: currentDay,
    playerItems: [...deduped.values()],
  };
}

export function buildTodayPlanItem(state: GameState, draft: TodayPlanDraft): TodayArrangementItem {
  const suffix = state.todayPlan.playerItems.length + state.eventStore.length + 1;
  return {
    id: `today-item-${state.day}-${draft.linkedActionId}-${draft.linkedCaseId || 'case'}-${suffix}`,
    day: state.day,
    sourceMatterId: draft.sourceMatterId,
    linkedActionId: draft.linkedActionId,
    linkedCaseId: draft.linkedCaseId,
    linkedCustomerId: draft.linkedCustomerId,
    executionMode: resolveTodayPlanExecutionMode(draft.linkedActionId, draft.executionMode),
    status: 'planned',
    slot: draft.slot,
  };
}

export function hasTodayPlanDuplicate(state: GameState, draft: TodayPlanDraft) {
  const signature = buildItemSignature({
    linkedActionId: draft.linkedActionId,
    linkedCaseId: draft.linkedCaseId,
    linkedCustomerId: draft.linkedCustomerId,
    sourceMatterId: draft.sourceMatterId,
  });

  return state.todayPlan.playerItems.some((entry) => (
    entry.day === state.day
    && buildItemSignature(entry) === signature
  ));
}

export function markTodayPlanItemCompletedMutable(state: GameState, itemId: string) {
  const item = state.todayPlan.playerItems.find((entry) => entry.id === itemId && entry.day === state.day);
  if (!item || item.status === 'completed') {
    return null;
  }
  item.status = 'completed';
  return item;
}

export function markTodayPlanItemCompletedByActionMutable(state: GameState, actionId: string, caseId: string) {
  const item = state.todayPlan.playerItems.find((entry) => (
    entry.day === state.day
    && entry.status === 'planned'
    && entry.linkedActionId === actionId
    && entry.linkedCaseId === caseId
  ));

  if (!item) {
    return null;
  }

  item.status = 'completed';
  return item;
}
