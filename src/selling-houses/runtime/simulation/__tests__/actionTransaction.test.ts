import { describe, expect, it } from 'vitest';

import {
  executeActionTransaction,
} from '../../../domain/engine/actionTransaction';
import {
  createInitialState,
  updateDerivedState,
} from '../../../application/gameState';
import { recordBudgetChange } from '../../../domain/budget';
import type { ActionDefinition } from '../../../domain/models';
import { getScenarioSnapshotById } from '../../../domain/scenarioCatalog';

function buildWorld() {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  if (!snapshot) {
    throw new Error('Missing builtin scenario for transaction test');
  }
  const world = createInitialState(snapshot, 123456);
  updateDerivedState(world);
  return world;
}

const testAction: ActionDefinition = {
  id: 'test-action',
  name: '测试动作',
  costEnergy: 2,
  costPromotionBudget: 30,
  description: 'transaction boundary test action',
};

describe('action transaction boundary', () => {
  it('restores legacy resources and budget ledger when execution fails', () => {
    const world = buildWorld();
    const before = {
      energy: world.energy,
      cash: world.cash,
      promotionBudget: world.auxiliaryStats.promotionBudget,
      budgetLedgerLength: world.budgetLedger.length,
      eventStoreLength: world.eventStore.length,
    };

    const result = executeActionTransaction(world, testAction, () => {
      recordBudgetChange(world, {
        amount: -testAction.costPromotionBudget,
        kind: 'action-spend',
        title: '测试消耗',
        detail: '测试消耗推广金。',
      });
      world.energy -= testAction.costEnergy;
      return false;
    });

    expect(result.success).toBe(false);
    expect(world.energy).toBe(before.energy);
    expect(world.cash).toBe(before.cash);
    expect(world.auxiliaryStats.promotionBudget).toBe(before.promotionBudget);
    expect(world.budgetLedger).toHaveLength(before.budgetLedgerLength);
    expect(world.eventStore).toHaveLength(before.eventStoreLength);
  });

  it('detects manual refunds without applying a second refund', () => {
    const world = buildWorld();
    const beforeBudget = world.auxiliaryStats.promotionBudget;

    const result = executeActionTransaction(world, testAction, () => {
      recordBudgetChange(world, {
        amount: -testAction.costPromotionBudget,
        kind: 'action-spend',
        title: '测试消耗',
        detail: '测试消耗推广金。',
      });
      recordBudgetChange(world, {
        amount: testAction.costPromotionBudget,
        kind: 'action-refund',
        title: '测试退回',
        detail: '测试退回推广金。',
      });
      return false;
    });

    expect(result.success).toBe(false);
    expect(result.manuallyRefundedResources).toBe(true);
    expect(world.auxiliaryStats.promotionBudget).toBe(beforeBudget);
  });
});
