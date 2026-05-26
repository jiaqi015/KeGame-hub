import { recordBudgetChange } from '../budget.js';
import type { ActionDefinition, GameState } from '../models.js';
import { asWritableGameState } from '../models.js';
import { clamp } from '../utils.js';
import type { InformationSourceRecord } from '../world-model/informationSourceTypes.js';

/**
 * Build a manager_message source record for action resource spend/refund.
 * This ensures action budget changes flow through:
 *   source → causal → actor knowledge → decision → command → receipt → feedback → replay
 */
function buildActionResourceSourceRecord(
  state: GameState,
  action: ActionDefinition,
  kind: 'spend' | 'refund',
  reason?: string,
): InformationSourceRecord<'manager_message'> {
  const day = state.day;
  const runSeed = state.runContext.runSeed;
  const amount = kind === 'spend' ? action.costPromotionBudget : action.costPromotionBudget;

  return {
    sourceId: `isr-ar-${day}-${kind}-${action.id}`,
    sourceKind: 'manager_message',
    payload: {
      subtype: 'resource_allocated' as const,
      summary: kind === 'spend'
        ? `动作消耗: ${action.name} 消耗推广金${amount}点`
        : `动作退回: ${action.name} 退回推广金${amount}点${reason ? ` (${reason})` : ''}`,
      managerId: 'system-resource-manager',
      targetBrokerId: 'player-broker',
      caseIds: [],
      priority: amount,
      instruction: kind === 'spend'
        ? `${action.name} 消耗推广金 ${amount}`
        : `${action.name} 退回推广金 ${amount}`,
    },
    day,
    phase: 'afternoon',
    entityRefs: [],
    actorRefs: [
      { id: 'system-resource-manager', role: 'manager' as const },
      { id: 'player-broker', role: 'player_broker' as const },
    ],
    visibility: { scope: 'player_only' as const, baseDelayDays: 0 },
    confidence: 1.0,
    delayDays: 0,
    replayKey: `rk-ar-${runSeed}-${day}-${kind}-${action.id}`,
    origin: 'player_action',
  };
}

export function spendResources(state: GameState, action: ActionDefinition) {
  state.energy = clamp(state.energy - action.costEnergy, 0, state.maxEnergy);
  if (action.costPromotionBudget > 0) {
    recordBudgetChange(state, {
      amount: -action.costPromotionBudget,
      kind: 'action-spend',
      title: `执行 ${action.name}`,
      detail: `${action.name} 消耗推广金 ${action.costPromotionBudget} 点。`,
    });
    // Emit source record for budget spend → economy pipeline
    if (!state.pendingSourceRecords) asWritableGameState(state).pendingSourceRecords = [];
    asWritableGameState(state).pendingSourceRecords.push(buildActionResourceSourceRecord(state, action, 'spend'));
  }
}

export function refundResources(state: GameState, action: ActionDefinition, reason: string) {
  state.energy = clamp(state.energy + action.costEnergy, 0, state.maxEnergy);
  if (action.costPromotionBudget > 0) {
    recordBudgetChange(state, {
      amount: action.costPromotionBudget,
      kind: 'action-refund',
      title: `${action.name} 退回`,
      detail: `${reason}，退回推广金 ${action.costPromotionBudget} 点。`,
    });
    // Emit source record for budget refund → economy pipeline
    if (!state.pendingSourceRecords) asWritableGameState(state).pendingSourceRecords = [];
    asWritableGameState(state).pendingSourceRecords.push(buildActionResourceSourceRecord(state, action, 'refund', reason));
  }
}
