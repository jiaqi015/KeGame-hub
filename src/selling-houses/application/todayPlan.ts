import { ACTIONS } from '../domain/constants.js';
import type {
  ActionDefinition,
  GameState,
  TodayPlanConflictHint,
  TodayArrangementExecutionMode,
  TodayArrangementItem,
  TodayArrangementSlot,
} from '../domain/models.js';
import { isCaseActiveByCanonicalStatus } from '../domain/caseLifecycleStatusRead.js';

export interface TodayPlanDraft {
  sourceMatterId?: string;
  linkedActionId: string;
  linkedCaseId?: string;
  linkedCustomerId?: string;
  linkedOpportunityId?: string;
  executionMode?: TodayArrangementExecutionMode;
  slot?: TodayArrangementSlot;
}

function resolveActionDefinition(actionId: string): ActionDefinition | null {
  return ACTIONS.find((entry) => entry.id === actionId || entry.executorId === actionId) || null;
}

export function resolveActionDurationHours(actionId: string) {
  const action = resolveActionDefinition(actionId);
  if (!action) return 0;
  return Math.max(0, action.durationHours ?? action.costEnergy);
}

export function resolveActionEnergyCost(actionId: string) {
  const action = resolveActionDefinition(actionId);
  if (!action) return 0;
  return Math.max(0, action.costEnergy);
}

function buildItemSignature(item: Pick<TodayArrangementItem, 'linkedActionId' | 'linkedCaseId' | 'linkedCustomerId' | 'linkedOpportunityId'>) {
  return [
    item.linkedActionId || '',
    item.linkedCaseId || '',
    item.linkedCustomerId || '',
    item.linkedOpportunityId || '',
  ].join('|');
}

function matchesExecutableIdentity(
  item: Pick<TodayArrangementItem, 'linkedActionId' | 'linkedCaseId' | 'linkedCustomerId' | 'linkedOpportunityId'>,
  draft: Pick<TodayPlanDraft, 'linkedActionId' | 'linkedCaseId' | 'linkedCustomerId' | 'linkedOpportunityId'>,
) {
  return buildItemSignature(item) === buildItemSignature(draft);
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

function isNegotiationReserveMatter(entry: GameState['matters'][number]) {
  return entry.stage === 'pending' && entry.source === 'negotiation' && entry.kind === 'opportunity';
}

export function estimateFixedTodayPlanEnergyReserve(state: GameState) {
  const scheduleReserve = getVisibleFixedScheduleEntries(state)
    .filter(isScheduleEntryCapacityBlocking)
    .reduce((sum, entry) => sum + resolveScheduleEntryDurationHours(entry), 0);
  const negotiationReserve = state.matters.some(isNegotiationReserveMatter) ? 1 : 0;
  return scheduleReserve + negotiationReserve;
}

export function getTodayPlanCommittedEnergy(state: GameState, status: TodayArrangementItem['status'] = 'planned') {
  return state.todayPlan.playerItems
    .filter((entry) => entry.day === state.day && entry.status === status)
    .reduce((sum, entry) => sum + resolveActionEnergyCost(entry.linkedActionId), 0);
}

export function getTodayPlanRemainingEnergy(state: GameState) {
  return Math.max(0, state.energy - estimateFixedTodayPlanEnergyReserve(state) - getTodayPlanCommittedEnergy(state, 'planned'));
}

export const SLOT_CAPACITY = {
  am: 2,
  pm: 4,
} as const;

export function resolveScheduleEntrySlot(entry: GameState['schedule'][number]): TodayArrangementSlot {
  return entry.slot || scheduleEntrySlot(entry.title);
}

export function isSlotBlockingRoutine(entry: GameState['schedule'][number]) {
  if (entry.source !== 'routine') return false;
  const label = `${entry.title} ${entry.badge} ${entry.weekdayIntent || ''}`;
  return /内部|聚焦会/.test(label);
}

export function isScheduleEntryCapacityBlocking(entry: GameState['schedule'][number]) {
  return isSlotBlockingRoutine(entry);
}

export function getVisibleFixedScheduleEntries(state: GameState) {
  const blockingEntries = state.schedule.filter(isSlotBlockingRoutine);
  const blockedSlots = new Set(blockingEntries.map(resolveScheduleEntrySlot));
  const visibleEntries = state.schedule.filter((entry) => (
    !isSlotBlockingRoutine(entry)
    && !(entry.source === 'risk' && blockedSlots.has(resolveScheduleEntrySlot(entry)))
  ));

  return [...blockingEntries, ...visibleEntries].slice(0, 2);
}

export function resolveScheduleEntryDurationHours(entry: GameState['schedule'][number]) {
  if (isSlotBlockingRoutine(entry)) {
    return SLOT_CAPACITY[resolveScheduleEntrySlot(entry)];
  }
  return entry.urgency >= 92 ? 2 : 1;
}

export function getSlotCommittedDurationHours(
  state: GameState,
  slot: 'am' | 'pm',
  status: TodayArrangementItem['status'] = 'planned',
) {
  return state.todayPlan.playerItems
    .filter((entry) => entry.day === state.day && entry.status === status && entry.slot === slot)
    .reduce((sum, entry) => sum + resolveActionDurationHours(entry.linkedActionId), 0);
}

export function getSlotRemainingCapacity(
  state: GameState,
  slot: 'am' | 'pm',
) {
  const fixedItemsDurationHours = (getVisibleFixedScheduleEntries(state)
    .filter(isScheduleEntryCapacityBlocking)
    .reduce((sum, entry) => {
      const entrySlot = resolveScheduleEntrySlot(entry);
      return entrySlot === slot ? sum + resolveScheduleEntryDurationHours(entry) : sum;
    }, 0)) + (slot === 'pm' && state.matters.some(isNegotiationReserveMatter) ? 1 : 0);

  const committedDurationHours = getSlotCommittedDurationHours(state, slot, 'planned');
  return Math.max(0, SLOT_CAPACITY[slot] - fixedItemsDurationHours - committedDurationHours);
}

function scheduleEntrySlot(title: string): TodayArrangementSlot {
  return /下午|晚|收尾/.test(title) ? 'pm' : 'am';
}

export function getTodayPlanConflictHint(
  state: GameState,
  input: {
    slot?: TodayArrangementSlot;
    actionId?: string;
    caseId?: string;
    durationHours?: number;
  },
): TodayPlanConflictHint | undefined {
  const slot = input.slot === 'pm' ? 'pm' : 'am';
  const durationHours = input.durationHours ?? (input.actionId ? resolveActionDurationHours(input.actionId) : 1);
  const remainingCapacity = getSlotRemainingCapacity(state, slot);
  const fixedItems = getVisibleFixedScheduleEntries(state).filter((entry) => resolveScheduleEntrySlot(entry) === slot);
  const plannedItems = state.todayPlan.playerItems.filter((entry) => (
    entry.day === state.day
    && entry.status === 'planned'
    && (entry.slot || 'am') === slot
  ));

  if (fixedItems.length > 0 && remainingCapacity < durationHours) {
    return {
      level: 'warning',
      kind: 'fixed-overlap',
      message: `${slot === 'am' ? '上午' : '下午'}已有安排，可以先看另一个时段。`,
      relatedItemIds: fixedItems.map((entry) => entry.key),
    };
  }

  if (plannedItems.length > 0 && remainingCapacity <= durationHours + 1) {
    return {
      level: 'warning',
      kind: 'planned-tight',
      message: `${slot === 'am' ? '上午' : '下午'}安排已经比较满，建议先完成已排事项。`,
      relatedItemIds: plannedItems.map((entry) => entry.id),
    };
  }

  if (input.caseId) {
    const relatedRun = state.productRuns.find((run) => (
      run.status === 'running'
      && run.targetIds.includes(input.caseId || '')
    ));
    if (relatedRun) {
      return {
        level: 'info',
        kind: 'running-related',
        message: '这套房已有进行中的事项，加入今天前先确认不要重复发力。',
        relatedItemIds: [relatedRun.id],
      };
    }
  }

  return undefined;
}

export function canCandidateFitSlot(
  state: GameState,
  slot: 'am' | 'pm',
  actionDurationHours: number,
  reservedDurationHours: number = 0,
) {
  return getSlotRemainingCapacity(state, slot) - reservedDurationHours >= actionDurationHours;
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
      if (!caseItem || !isCaseActiveByCanonicalStatus(state, caseItem)) {
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
    linkedOpportunityId: draft.linkedOpportunityId,
    executionMode: resolveTodayPlanExecutionMode(draft.linkedActionId, draft.executionMode),
    status: 'planned',
    slot: draft.slot,
  };
}

export function hasTodayPlanDuplicate(state: GameState, draft: TodayPlanDraft) {
  return state.todayPlan.playerItems.some((entry) => (
    entry.day === state.day
    && matchesExecutableIdentity(entry, draft)
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

export function markTodayPlanItemCompletedByActionMutable(
  state: GameState,
  actionId: string,
  caseId: string,
  target?: {
    linkedCustomerId?: string;
    linkedOpportunityId?: string;
  },
) {
  const item = state.todayPlan.playerItems.find((entry) => (
    entry.day === state.day
    && entry.status === 'planned'
    && matchesExecutableIdentity(entry, {
      linkedActionId: actionId,
      linkedCaseId: caseId,
      linkedCustomerId: target?.linkedCustomerId,
      linkedOpportunityId: target?.linkedOpportunityId,
    })
  ));

  if (!item) {
    return null;
  }

  item.status = 'completed';
  return item;
}
