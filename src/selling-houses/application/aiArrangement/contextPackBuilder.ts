import type { GameState } from '../../domain/models.js';
import type { ArrangementProjection } from '../projections/operatingProjection.js';
import { getSlotRemainingCapacity } from '../todayPlan.js';
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
    fixedReserve: Math.max(0, arrangement.fixedEnergyReserve),
  };

  const slots = {
    am: {
      remainingCapacity: getSlotRemainingCapacity(state, 'am'),
      fixedCount: arrangement.slots.am.fixedItems.length,
      plannedCount: arrangement.slots.am.plannedItems.length,
    },
    pm: {
      remainingCapacity: getSlotRemainingCapacity(state, 'pm'),
      fixedCount: arrangement.slots.pm.fixedItems.length,
      plannedCount: arrangement.slots.pm.plannedItems.length,
    },
  };

  const wechatSignals = buildWechatSignals(state);
  const marketSignals = buildMarketSignals(state);

  const plannedItems = arrangement.plannedItems.map(i => mapToVisibleItem(i, wechatSignals));
  const fixedItems = arrangement.fixedItems.map(i => mapToVisibleItem(i, wechatSignals));
  const candidateItems = arrangement.candidateItems
    .filter(item => !item.isDisabled)
    .slice(0, 8)
    .map(i => mapToVisibleItem(i, wechatSignals));

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

function mapToVisibleItem(item: any, wechatSignals: VisibleWechatSignal[]): VisibleArrangementItem {
  const evidenceLabels: string[] = [];
  const signalTrace: import('./contextPack.js').SignalTrace[] = [];

  const relatedWechat = wechatSignals.filter(s => s.caseId === item.caseId);
  for (const ws of relatedWechat) {
    evidenceLabels.push(`${ws.senderName}：${ws.content.slice(0, 20)}`);
    signalTrace.push({ source: 'wechat', signal: ws.content.slice(0, 40), credibility: ws.urgency === 'high' ? 0.9 : 0.7, receivedAt: 'today' });
  }

  if (item.rank !== undefined && item.rank <= 3) evidenceLabels.push(`优先级 #${item.rank}`);

  const riskLevel = item.isDisabled ? 'high' as const : item.rank !== undefined && item.rank <= 2 ? 'medium' as const : 'low' as const;

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
    evidenceLabels,
    signalTrace,
    riskLevel,
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
