/**
 * Action Receipt Snapshot — domain-layer snapshot for post-action receipt building.
 *
 * Captures the delta information needed to build an ActionReceipt without
 * importing runtime/simulation. The actual receipt building happens in the
 * application layer via runtime/simulation/actionReceiptAdapter.
 *
 * This file exists to enforce the domain→runtime layer boundary:
 * domain produces raw snapshot data, runtime builds the receipt.
 */

import type { Case, GameState } from '../models.js';

export interface ActionReceiptSnapshot {
  readonly day: number;
  readonly caseId: string;
  readonly actionId: string;
  readonly executorId: string;
  readonly optionId: string | null;
  readonly outcome: 'success' | 'blocked';
  readonly costEnergy: number;
  readonly costPromotionBudget: number;
  readonly outcomeSummary: string;
  readonly beforeTrust: number;
  readonly beforePatience: number;
  readonly beforeUrgency: number;
  readonly beforeHeat: number;
  readonly beforeCompetitiveness: number;
  readonly beforeD1: number;
  readonly beforeWindowDays: number;
  readonly beforeEventStoreLength: number;
  readonly beforeOpportunityCount: number;
  readonly afterEventStoreLength: number;
  readonly afterOpportunityCount: number;
}

export function captureActionReceiptSnapshot(
  state: GameState,
  caseItem: Case,
  actionId: string,
  executorId: string,
  optionId: string | null,
  outcome: 'success' | 'blocked',
  costEnergy: number,
  costPromotionBudget: number,
  outcomeSummary: string,
  beforeEventStoreLength: number,
  beforeOpportunityCount: number,
): ActionReceiptSnapshot {
  return Object.freeze({
    day: state.day,
    caseId: caseItem.id,
    actionId,
    executorId,
    optionId,
    outcome,
    costEnergy,
    costPromotionBudget,
    outcomeSummary,
    beforeTrust: caseItem.trust,
    beforePatience: caseItem.patience,
    beforeUrgency: caseItem.urgency,
    beforeHeat: caseItem.heat,
    beforeCompetitiveness: caseItem.competitiveness,
    beforeD1: caseItem.d1,
    beforeWindowDays: caseItem.windowDays,
    beforeEventStoreLength,
    beforeOpportunityCount,
    afterEventStoreLength: state.eventStore.length,
    afterOpportunityCount: state.opportunities.filter(
      (o) => o.caseId === caseItem.id && o.status === 'active',
    ).length,
  });
}
