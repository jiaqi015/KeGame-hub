import { recordBudgetChange } from '../budget.js';
import type { ActionDefinition, GameState } from '../models.js';
import { clamp } from '../utils.js';

export function spendResources(state: GameState, action: ActionDefinition) {
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

export function refundResources(state: GameState, action: ActionDefinition, reason: string) {
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
