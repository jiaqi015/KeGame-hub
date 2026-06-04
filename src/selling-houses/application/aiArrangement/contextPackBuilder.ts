import type { GameState } from '../../domain/models.js';
import type { ArrangementProjection } from '../projections/operatingProjection.js';
import type {
  AiArrangementContextPack,
  VisibleArrangementItem,
  VisibleWechatSignal,
  VisibleMarketSignal,
} from './contextPack.js';

export function buildAiArrangementContextPack(
  state: GameState,
  arrangement: ArrangementProjection,
  currentSlot: 'am' | 'pm',
): AiArrangementContextPack {
  const day = state.day;
  const packId = `ai-arrangement-${day}-${currentSlot}-${Date.now()}`;

  const energy = {
    remaining: Math.max(0, arrangement.remainingEnergy),
    planned: arrangement.plannedItems.reduce((sum, item) => sum + item.energyCost, 0),
    fixedReserve: arrangement.fixedItems.reduce((sum, item) => sum + item.energyCost, 0),
  };

  const slots = {
    am: {
      remainingCapacity: Math.max(0, 4 - arrangement.slots.am.fixedItems.length - arrangement.slots.am.plannedItems.length),
      fixedCount: arrangement.slots.am.fixedItems.length,
      plannedCount: arrangement.slots.am.plannedItems.length,
    },
    pm: {
      remainingCapacity: Math.max(0, 4 - arrangement.slots.pm.fixedItems.length - arrangement.slots.pm.plannedItems.length),
      fixedCount: arrangement.slots.pm.fixedItems.length,
      plannedCount: arrangement.slots.pm.plannedItems.length,
    },
  };

  const plannedItems = arrangement.plannedItems.map(mapToVisibleItem);
  const fixedItems = arrangement.fixedItems.map(mapToVisibleItem);
  const candidateItems = arrangement.candidateItems
    .filter(item => !item.isDisabled)
    .slice(0, 8)
    .map(mapToVisibleItem);

  const wechatSignals = buildWechatSignals(state);
  const marketSignals = buildMarketSignals(state);

  const constraints = buildConstraints(arrangement, energy, slots);

  return {
    packId,
    day,
    currentSlot,
    energy,
    slots,
    plannedItems,
    fixedItems,
    candidateItems,
    wechatSignals,
    marketSignals,
    constraints,
  };
}

function mapToVisibleItem(item: any): VisibleArrangementItem {
  return {
    itemId: item.id,
    actionId: item.actionId,
    caseId: item.caseId,
    customerId: item.customerId,
    opportunityId: item.opportunityId,
    slot: item.slot,
    title: item.displayTitle || item.title,
    detail: item.detail || '',
    energyCost: item.energyCost,
    durationHours: item.durationHours,
    rank: item.rank,
    disabledReason: item.isDisabled ? item.conflictHint?.message : undefined,
  };
}

function buildWechatSignals(state: GameState): VisibleWechatSignal[] {
  const history = state.wechatConversationHistory || [];
  return history
    .slice(-5)
    .map(receipt => ({
      messageId: receipt.sourceMessageId,
      senderName: receipt.actorName,
      senderRole: receipt.actorRole,
      content: receipt.playerText,
      urgency: 'medium' as const,
      caseId: receipt.targetCaseId,
    }));
}

function buildMarketSignals(state: GameState): VisibleMarketSignal[] {
  const events = state.eventLog || [];
  return events
    .filter(e => e.message?.includes('市场'))
    .slice(-3)
    .map(e => ({
      signalId: `signal-${Date.now()}`,
      title: e.actor || '',
      message: e.message || '',
      caseId: undefined,
    }));
}

function buildConstraints(
  arrangement: ArrangementProjection,
  energy: { remaining: number; planned: number; fixedReserve: number },
  slots: { am: { remainingCapacity: number }; pm: { remainingCapacity: number } },
): string[] {
  const constraints: string[] = [];
  if (energy.remaining <= 0) constraints.push('今日精力已用完');
  if (slots.am.remainingCapacity <= 0) constraints.push('上午时段已满');
  if (slots.pm.remainingCapacity <= 0) constraints.push('下午时段已满');
  if (arrangement.candidateItems.length === 0) constraints.push('无可用候选动作');
  return constraints;
}
