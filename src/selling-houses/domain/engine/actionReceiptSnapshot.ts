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
import { isOpportunityActiveByCanonicalState } from '../opportunityLifecycleStatusRead.js';

export interface ActionReceiptSnapshot {
  readonly day: number;
  readonly caseId: string;
  readonly ownerName: string;
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
  /** After-action trust (for fieldDelta computation in runtime wiring). */
  readonly afterTrust: number;
  /** After-action patience. */
  readonly afterPatience: number;
  /** After-action urgency. */
  readonly afterUrgency: number;
  /** After-action heat. */
  readonly afterHeat: number;
  /** After-action competitiveness. */
  readonly afterCompetitiveness: number;
  /**
   * R45: Owner's concession price signal (万元).
   * Present when action reveals owner's willingness to accept a specific price.
   * Comes from: ask-psychological-price (bottomPrice), adjust-listing-price (new askPrice).
   * This is NOT the final deal price — it's the owner's expressed price stance.
   */
  readonly ownerConcessionPrice?: number;
  /**
   * R45: Price mentioned by owner during interaction (万元).
   * The price the owner talks about, which may differ from their true concession.
   * Comes from: pricing-advice, ask-psychological-price.
   */
  readonly ownerPriceMentioned?: number;
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
  beforeTrust?: number,
  beforePatience?: number,
  beforeUrgency?: number,
  beforeHeat?: number,
  beforeCompetitiveness?: number,
  ownerConcessionPrice?: number,
  ownerPriceMentioned?: number,
): ActionReceiptSnapshot {
  return Object.freeze({
    day: state.day,
    caseId: caseItem.id,
    ownerName: caseItem.ownerName,
    actionId,
    executorId,
    optionId,
    outcome,
    costEnergy,
    costPromotionBudget,
    outcomeSummary,
    beforeTrust: beforeTrust ?? caseItem.trust,
    beforePatience: beforePatience ?? caseItem.patience,
    beforeUrgency: beforeUrgency ?? caseItem.urgency,
    beforeHeat: beforeHeat ?? caseItem.heat,
    beforeCompetitiveness: beforeCompetitiveness ?? caseItem.competitiveness,
    beforeD1: caseItem.d1,
    beforeWindowDays: caseItem.windowDays,
    beforeEventStoreLength,
    beforeOpportunityCount,
    afterEventStoreLength: state.eventStore.length,
    afterOpportunityCount: state.opportunities.filter(
      (o) => o.caseId === caseItem.id && isOpportunityActiveByCanonicalState(state, o),
    ).length,
    afterTrust: caseItem.trust,
    afterPatience: caseItem.patience,
    afterUrgency: caseItem.urgency,
    afterHeat: caseItem.heat,
    afterCompetitiveness: caseItem.competitiveness,
    ownerConcessionPrice,
    ownerPriceMentioned,
  });
}
