import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { recordBudgetChange } from '../src/selling-houses/domain/budget.js';
import {
  executeActionTransaction,
} from '../src/selling-houses/domain/engine/actionTransaction.js';
import { spendResources } from '../src/selling-houses/domain/engine/actionResolvers.js';
import type { ActionDefinition } from '../src/selling-houses/domain/models.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';

function buildWorld() {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');
  const world = createInitialState(snapshot, 20260429);
  updateDerivedState(world);
  return world;
}

const testAction: ActionDefinition = {
  id: 'transaction-contract-action',
  name: '事务合同动作',
  costEnergy: 2,
  costPromotionBudget: 30,
  description: 'Verifies failed action transaction rollback.',
};

const world = buildWorld();
const before = {
  energy: world.energy,
  cash: world.cash,
  promotionBudget: world.auxiliaryStats.promotionBudget,
  budgetLedger: world.budgetLedger.slice(),
  eventStore: world.eventStore.slice(),
};

const failedResult = executeActionTransaction(world, testAction, () => {
  spendResources(world, testAction);
  return false;
});

assert.equal(failedResult.success, false, 'Expected failed action transaction to report failure');
assert.equal(failedResult.rolledBack, true, 'Expected failed action transaction to roll back');
assert.equal(failedResult.transaction.status, 'rolled_back', 'Expected transaction status to be rolled_back');
assert.equal(world.energy, before.energy, 'Expected failed action transaction to restore energy');
assert.equal(world.cash, before.cash, 'Expected failed action transaction to restore cash');
assert.equal(
  world.auxiliaryStats.promotionBudget,
  before.promotionBudget,
  'Expected failed action transaction to restore promotion budget',
);
assert.deepEqual(world.budgetLedger, before.budgetLedger, 'Expected failed action transaction to restore budget ledger');
assert.deepEqual(world.eventStore, before.eventStore, 'Expected failed action transaction to restore event store');
assert.ok(
  !world.budgetLedger.some((entry) => entry.kind === 'action-spend' && entry.title.includes(testAction.name)),
  'Expected failed action transaction not to leave action-spend budget entries',
);
assert.ok(
  !world.eventStore.some((entry) =>
    entry.kind === 'budget_changed'
    && typeof entry.payload?.budgetKind === 'string'
    && entry.payload.budgetKind === 'action-spend'),
  'Expected failed action transaction not to leave eventStore spend entries',
);

const manualRefundWorld = buildWorld();
const manualRefundBudget = manualRefundWorld.auxiliaryStats.promotionBudget;
const manualRefundResult = executeActionTransaction(manualRefundWorld, testAction, () => {
  recordBudgetChange(manualRefundWorld, {
    amount: -testAction.costPromotionBudget,
    kind: 'action-spend',
    title: '事务合同消耗',
    detail: '事务合同消耗推广金。',
  });
  recordBudgetChange(manualRefundWorld, {
    amount: testAction.costPromotionBudget,
    kind: 'action-refund',
    title: '事务合同退回',
    detail: '事务合同退回推广金。',
  });
  return false;
});

assert.equal(manualRefundResult.success, false, 'Expected manually refunded transaction to still report failure');
assert.equal(
  manualRefundResult.manuallyRefundedResources,
  true,
  'Expected transaction to detect manual refunds without requiring UI flow',
);
assert.equal(
  manualRefundWorld.auxiliaryStats.promotionBudget,
  manualRefundBudget,
  'Expected rollback to restore budget after manual refund path',
);
assert.ok(
  !manualRefundWorld.budgetLedger.some((entry) => entry.kind === 'action-spend' || entry.kind === 'action-refund'),
  'Expected rollback to leave no spend/refund ledger entries from failed transaction',
);
assert.ok(
  !manualRefundWorld.eventStore.some((entry) =>
    entry.kind === 'budget_changed'
    && (
      entry.payload?.budgetKind === 'action-spend'
      || entry.payload?.budgetKind === 'action-refund'
    )),
  'Expected rollback to leave no spend/refund budget events from failed transaction',
);

console.log('selling-houses action transaction contract verification passed');
