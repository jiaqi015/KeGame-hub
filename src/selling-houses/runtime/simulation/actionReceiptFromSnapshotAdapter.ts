/**
 * Action Receipt From Snapshot Adapter — builds ActionReceipt from domain snapshot.
 *
 * Bridges domain-layer ActionReceiptSnapshot to runtime ActionReceipt.
 * Called from application layer after executeAction returns.
 *
 * Hard constraints:
 * 1. Pure function — no side effects.
 * 2. No Date.now, no Math.random.
 * 3. Deterministic: same snapshot → same receipt.
 * 4. Frozen output.
 */

import type { ActionReceipt, ActionReceiptFieldDelta, ActionReceiptOutcome, GameState } from '../../domain/models.js';
import type { ActionReceiptSnapshot } from '../../domain/engine/actionReceiptSnapshot.js';

/**
 * Builds an ActionReceipt from a domain snapshot.
 * Computes field deltas from before/after values.
 */
export function buildActionReceiptFromSnapshot(
  snapshot: ActionReceiptSnapshot,
  state: GameState,
): ActionReceipt {
  const caseItem = state.cases.find((c) => c.id === snapshot.caseId);
  const fieldDeltas: ActionReceiptFieldDelta[] = [];

  if (caseItem) {
    const addDelta = (field: string, before: number, after: number) => {
      if (Math.round(before) !== Math.round(after)) {
        fieldDeltas.push({
          field,
          from: Math.round(before),
          to: Math.round(after),
          delta: Math.round(after - before),
        });
      }
    };
    addDelta('trust', snapshot.beforeTrust, caseItem.trust);
    addDelta('patience', snapshot.beforePatience, caseItem.patience);
    addDelta('urgency', snapshot.beforeUrgency, caseItem.urgency);
    addDelta('heat', snapshot.beforeHeat, caseItem.heat);
    addDelta('competitiveness', snapshot.beforeCompetitiveness, caseItem.competitiveness);
    addDelta('d1', snapshot.beforeD1, caseItem.d1);
    addDelta('windowDays', snapshot.beforeWindowDays, caseItem.windowDays);
  }

  const emittedEventIds = state.eventStore
    .slice(snapshot.beforeEventStoreLength)
    .map((e) => e.id);

  const affectedOpportunityIds = state.opportunities
    .filter((o) => o.caseId === snapshot.caseId && o.status === 'active')
    .slice(0, snapshot.afterOpportunityCount)
    .map((o) => o.id);

  return Object.freeze({
    receiptId: `action-receipt:${snapshot.caseId}:${snapshot.actionId}:${snapshot.day}`,
    day: snapshot.day,
    caseId: snapshot.caseId,
    actionId: snapshot.actionId,
    executorId: snapshot.executorId,
    optionId: snapshot.optionId,
    outcome: snapshot.outcome as ActionReceiptOutcome,
    costEnergy: snapshot.costEnergy,
    costPromotionBudget: snapshot.costPromotionBudget,
    fieldDeltas: Object.freeze(fieldDeltas),
    outcomeSummary: snapshot.outcomeSummary,
    emittedEventIds: Object.freeze(emittedEventIds),
    affectedOpportunityIds: Object.freeze(affectedOpportunityIds),
    linkedOpportunityId: undefined,
  });
}

/**
 * Appends an ActionReceipt to state.actionReceiptHistory.
 * Non-invasive: does NOT alter gameplay.
 */
export function appendActionReceiptFromSnapshot(
  state: GameState,
  receipt: ActionReceipt,
): void {
  const s = state as any;
  if (!s.actionReceiptHistory) {
    s.actionReceiptHistory = [];
  }
  s.actionReceiptHistory.push(receipt);
}
