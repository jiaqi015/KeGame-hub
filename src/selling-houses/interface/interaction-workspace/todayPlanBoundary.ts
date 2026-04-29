import { ACTIONS } from '../../domain/constants.js';
import type { ActionDefinition, GameState, ScheduleEntry, TodayArrangementItem } from '../../domain/models.js';
import {
  estimateFixedTodayPlanEnergyReserve,
  getSlotRemainingCapacity,
  getTodayPlanCommittedEnergy,
  getTodayPlanRemainingEnergy,
  getVisibleFixedScheduleEntries,
  resolveActionDurationHours,
  resolveActionEnergyCost,
  resolveScheduleEntryDurationHours,
  resolveScheduleEntrySlot,
} from '../../application/todayPlan.js';
import { freezeProjection } from './readOnly.js';
import type { TodayPlanWorkspaceItem, TodayPlanWorkspaceProjection } from './types.js';

function resolveAction(actionId: string): ActionDefinition | null {
  return ACTIONS.find((entry) => entry.id === actionId || entry.executorId === actionId) || null;
}

function buildFixedWorldItem(entry: ScheduleEntry, state: GameState): TodayPlanWorkspaceItem {
  return {
    id: `fixed:${entry.key}`,
    worldTruthKind: 'schedule_truth',
    title: entry.title,
    detail: entry.note,
    status: 'fixed',
    slot: resolveScheduleEntrySlot(entry),
    caseId: entry.caseId,
    actionId: entry.actionId,
    opportunityId: entry.opportunityId,
    durationHours: resolveScheduleEntryDurationHours(entry),
    energyCost: resolveScheduleEntryDurationHours(entry),
    sourceDay: state.day,
  };
}

function buildInteractionItem(entry: TodayArrangementItem, state: GameState): TodayPlanWorkspaceItem {
  const action = resolveAction(entry.linkedActionId);
  const linkedCase = entry.linkedCaseId
    ? state.cases.find((caseItem) => caseItem.id === entry.linkedCaseId) || null
    : null;

  return {
    id: entry.id,
    worldTruthKind: 'player_intent',
    title: linkedCase ? `${linkedCase.title} · ${action?.name || '今日事项'}` : action?.name || '今日事项',
    detail: action?.description || '玩家排入今日处理的互动事项。',
    status: entry.status,
    slot: entry.slot,
    caseId: entry.linkedCaseId,
    matterId: entry.sourceMatterId,
    actionId: entry.linkedActionId,
    customerId: entry.linkedCustomerId,
    opportunityId: entry.linkedOpportunityId,
    executionMode: entry.executionMode,
    durationHours: resolveActionDurationHours(entry.linkedActionId) || 1,
    energyCost: resolveActionEnergyCost(entry.linkedActionId) || 1,
    sourceDay: entry.day,
  };
}

export function buildTodayPlanWorkspaceProjection(state: GameState): TodayPlanWorkspaceProjection {
  const planItems = state.todayPlan?.day === state.day ? state.todayPlan.playerItems : [];
  const plannedInteractionItems = planItems
    .filter((entry) => entry.day === state.day && entry.status === 'planned')
    .map((entry) => buildInteractionItem(entry, state));
  const completedInteractionItems = planItems
    .filter((entry) => entry.day === state.day && entry.status === 'completed')
    .map((entry) => buildInteractionItem(entry, state));
  const fixedWorldItems = getVisibleFixedScheduleEntries(state).map((entry) => buildFixedWorldItem(entry, state));

  return freezeProjection({
    projectionKind: 'today_plan_adapter_state',
    day: state.day,
    capacity: {
      worldTruthKind: 'capacity_truth',
      remainingEnergy: getTodayPlanRemainingEnergy(state),
      plannedEnergy: getTodayPlanCommittedEnergy(state, 'planned'),
      fixedEnergyReserve: estimateFixedTodayPlanEnergyReserve(state),
      slots: {
        am: {
          remainingHours: getSlotRemainingCapacity(state, 'am'),
        },
        pm: {
          remainingHours: getSlotRemainingCapacity(state, 'pm'),
        },
      },
    },
    fixedWorldItems,
    plannedInteractionItems,
    completedInteractionItems,
  }) as TodayPlanWorkspaceProjection;
}
