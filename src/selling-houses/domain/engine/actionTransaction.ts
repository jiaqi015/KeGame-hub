import type { ActionDefinition, GameState } from '../models.js';
import { asWritableGameState } from '../models.js';

type ActionResourceSnapshot = {
  energy: number;
  cash: number;
  promotionBudget: number;
  budgetLedger: GameState['budgetLedger'];
  eventStore: GameState['eventStore'];
};

export type ActionTransactionState = 'open' | 'committed' | 'rolled_back';

export type ActionTransaction = {
  id: string;
  state: GameState;
  action: ActionDefinition;
  status: ActionTransactionState;
  snapshot: ActionResourceSnapshot;
};

export type ActionTransactionResult<T> = {
  success: boolean;
  value?: T;
  transaction: ActionTransaction;
  manuallyRefundedResources: boolean;
  rolledBack: boolean;
};

function snapshotResources(state: GameState): ActionResourceSnapshot {
  return {
    energy: state.energy,
    cash: state.cash,
    promotionBudget: state.auxiliaryStats.promotionBudget,
    budgetLedger: state.budgetLedger.slice(),
    eventStore: state.eventStore.slice(),
  };
}

function restoreResources(state: GameState, snapshot: ActionResourceSnapshot) {
  state.energy = snapshot.energy;
  state.cash = snapshot.cash;
  state.auxiliaryStats = {
    ...state.auxiliaryStats,
    promotionBudget: snapshot.promotionBudget,
  };
  asWritableGameState(state).budgetLedger = snapshot.budgetLedger.slice();
  asWritableGameState(state).eventStore = snapshot.eventStore.slice();
}

function detectManualRefund(state: GameState, action: ActionDefinition, snapshot: ActionResourceSnapshot) {
  if (action.costEnergy <= 0 && action.costPromotionBudget <= 0) {
    return false;
  }
  const transactionEntries = state.budgetLedger.slice(0, Math.max(0, state.budgetLedger.length - snapshot.budgetLedger.length));
  const refundedBudget = transactionEntries.some(
    (entry) => entry.kind === 'action-refund' && entry.amount === action.costPromotionBudget,
  );
  const energyRestored = action.costEnergy <= 0 || state.energy >= snapshot.energy;
  const budgetRestored = action.costPromotionBudget <= 0 || state.auxiliaryStats.promotionBudget >= snapshot.promotionBudget;
  return refundedBudget || (energyRestored && budgetRestored);
}

export function beginActionTransaction(state: GameState, action: ActionDefinition): ActionTransaction {
  return {
    id: `action-${action.executorId || action.id}-${state.day}-${state.rngCalls}-${state.eventStore.length}`,
    state,
    action,
    status: 'open',
    snapshot: snapshotResources(state),
  };
}

export function commitActionTransaction<T>(
  transaction: ActionTransaction,
  value?: T,
): ActionTransactionResult<T> {
  transaction.status = 'committed';
  return {
    success: true,
    value,
    transaction,
    manuallyRefundedResources: false,
    rolledBack: false,
  };
}

export function rollbackActionTransaction<T>(
  transaction: ActionTransaction,
  value?: T,
): ActionTransactionResult<T> {
  const manuallyRefundedResources = detectManualRefund(transaction.state, transaction.action, transaction.snapshot);
  restoreResources(transaction.state, transaction.snapshot);
  transaction.status = 'rolled_back';
  return {
    success: false,
    value,
    transaction,
    manuallyRefundedResources,
    rolledBack: true,
  };
}

export function executeActionTransaction<T>(
  state: GameState,
  action: ActionDefinition,
  executor: (transaction: ActionTransaction) => T,
): ActionTransactionResult<T> {
  const transaction = beginActionTransaction(state, action);
  try {
    const value = executor(transaction);
    if (value === false) {
      return rollbackActionTransaction(transaction, value);
    }
    return commitActionTransaction(transaction, value);
  } catch (error) {
    rollbackActionTransaction(transaction);
    throw error;
  }
}
