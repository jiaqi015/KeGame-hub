import type { BudgetTransaction, BudgetTransactionKind, GameState } from './models';

function buildTransactionId(kind: BudgetTransactionKind, day: number, index: number) {
  return `budget-${kind}-${day}-${index}`;
}

export function createInitialBudgetLedger(initialCash: number): BudgetTransaction[] {
  if (initialCash <= 0) {
    return [];
  }

  return [
    {
      id: buildTransactionId('initial-allocation', 1, 1),
      day: 1,
      kind: 'initial-allocation',
      amount: initialCash,
      balanceAfter: initialCash,
      title: '开局拨付',
      detail: `本局初始发放推广金 ${initialCash} 点。`,
    },
  ];
}

export function normalizeBudgetLedger(entries: unknown, currentCash: number): BudgetTransaction[] {
  if (Array.isArray(entries) && entries.length > 0) {
    return entries.map((entry, index) => {
      const item = entry as Partial<BudgetTransaction>;
      return {
        id: item.id || buildTransactionId(item.kind || 'legacy-sync', Number(item.day) || 1, index + 1),
        day: Number(item.day) || 1,
        kind: item.kind || 'legacy-sync',
        amount: Number(item.amount) || 0,
        balanceAfter: Number(item.balanceAfter) || currentCash,
        title: item.title || '历史资金变动',
        detail: item.detail || '从旧版存档迁移的推广金记录。',
      };
    });
  }

  if (currentCash <= 0) {
    return [];
  }

  return [
    {
      id: buildTransactionId('legacy-sync', 1, 1),
      day: 1,
      kind: 'legacy-sync',
      amount: currentCash,
      balanceAfter: currentCash,
      title: '历史存档同步',
      detail: `旧版存档迁移时同步当前推广金 ${currentCash} 点。`,
    },
  ];
}

export function recordBudgetChange(
  state: GameState,
  input: {
    amount: number;
    kind: BudgetTransactionKind;
    title: string;
    detail: string;
  },
) {
  state.cash = Math.max(0, state.cash + input.amount);
  const entry: BudgetTransaction = {
    id: buildTransactionId(input.kind, state.day, state.budgetLedger.length + 1),
    day: state.day,
    kind: input.kind,
    amount: input.amount,
    balanceAfter: state.cash,
    title: input.title,
    detail: input.detail,
  };
  state.budgetLedger.unshift(entry);
  if (state.budgetLedger.length > 40) {
    state.budgetLedger.pop();
  }
  return entry;
}
