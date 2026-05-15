/**
 * Outcome Receipt Coverage — tracks which runtime outcomes produce receipts.
 *
 * Every outcome that changes world state must produce a receipt that flows
 * through source record → causal event → worldCausalEvents ledger.
 * This file documents the coverage matrix and provides runtime assertion helpers.
 *
 * Coverage matrix (as of Round 14):
 * ┌─────────────────────────────────┬──────────────────────────┬─────────────────────────────────────────┬──────────┐
 * │ Outcome                         │ SourceKind               │ Path to worldCausalEvents               │ Status   │
 * ├─────────────────────────────────┼──────────────────────────┼─────────────────────────────────────────┼──────────┤
 * │ executeAction (success)         │ player_action_receipt    │ executeGameAction → buildReceiptFrom     │ ✅       │
 * │                                 │ + domain-specific        │ Snapshot → ingestSourceRecords → append  │          │
 * ├─────────────────────────────────┼──────────────────────────┼─────────────────────────────────────────┼──────────┤
 * │ executeAction (blocked/failed)  │ player_action_receipt    │ blocked action source record → ledger    │ ✅       │
 * ├─────────────────────────────────┼──────────────────────────┼─────────────────────────────────────────┼──────────┤
 * │ Negotiation settlement          │ process_receipt          │ resolveOneDay → pending → runtime tick   │ ✅       │
 * ├─────────────────────────────────┼──────────────────────────┼─────────────────────────────────────────┼──────────┤
 * │ ProductRun advancement          │ process_receipt          │ real ProductRun → pending → runtime tick │ ✅       │
 * ├─────────────────────────────────┼──────────────────────────┼─────────────────────────────────────────┼──────────┤
 * │ Focus meeting selection         │ manager_message          │ manager signal → pending → runtime tick  │ ✅       │
 * └─────────────────────────────────┴──────────────────────────┴─────────────────────────────────────────┴──────────┘
 *
 * Scenario action settlement is intentionally handled through executeGameAction
 * receipt wiring when it resolves to a real action executor. If future scenario
 * actions mutate state outside that path, they must be added here as uncovered.
 *
 * Anti-false-positive rules:
 *   - pendingSourceRecords alone ≠ receipt complete. Must appear in worldCausalEvents.
 *   - blocked action must be player_action_receipt, not process_receipt.
 *   - Same seed + same action sequence → byte-identical causal event IDs.
 */

import type { SourceKind } from '../informationSourceTypes.js';

/**
 * The three outcome categories that must have receipts.
 */
export type OutcomeCategory =
  | 'player_action'      // executeAction success/blocked/failed
  | 'process_result'     // negotiation settlement, ProductRun advancement
  | 'organization_action'; // focus meeting selection, manager intervention

/**
 * Coverage entry for one outcome type.
 */
export interface OutcomeReceiptCoverageEntry {
  readonly category: OutcomeCategory;
  readonly outcomeLabel: string;
  readonly sourceKind: SourceKind;
  readonly sourceSubtype: string;
  readonly pathDescription: string;
  readonly covered: boolean;
}

/**
 * The complete coverage matrix.
 */
export const OUTCOME_RECEIPT_COVERAGE: readonly OutcomeReceiptCoverageEntry[] = [
  {
    category: 'player_action',
    outcomeLabel: 'executeAction (success)',
    sourceKind: 'player_action_receipt',
    sourceSubtype: 'action_executed',
    pathDescription: 'executeGameAction → buildReceiptFromSnapshot → ingestSourceRecords → worldCausalEvents',
    covered: true,
  },
  {
    category: 'player_action',
    outcomeLabel: 'executeAction (blocked)',
    sourceKind: 'player_action_receipt',
    sourceSubtype: 'action_blocked',
    pathDescription: 'executeGameAction → buildBlockedPlayerActionSourceRecord → ingestSourceRecords → worldCausalEvents',
    covered: true,
  },
  {
    category: 'player_action',
    outcomeLabel: 'executeAction (failed)',
    sourceKind: 'player_action_receipt',
    sourceSubtype: 'action_failed',
    pathDescription: 'Same as blocked path',
    covered: true,
  },
  {
    category: 'process_result',
    outcomeLabel: 'Negotiation settlement',
    sourceKind: 'process_receipt',
    sourceSubtype: 'negotiation_progressed',
    pathDescription: 'resolveOneDay → buildProcessReceiptSourceRecords → pendingSourceRecords → tickBigWorldRuntime → worldCausalEvents',
    covered: true,
  },
  {
    category: 'process_result',
    outcomeLabel: 'ProductRun advancement',
    sourceKind: 'process_receipt',
    sourceSubtype: 'open_day_completed',
    pathDescription: 'Same as negotiation path',
    covered: true,
  },
  {
    category: 'organization_action',
    outcomeLabel: 'Focus meeting selection',
    sourceKind: 'manager_message',
    sourceSubtype: 'focus_case_selected',
    pathDescription: 'resolveOneDay → pendingSourceRecords → next tick → worldCausalEvents',
    covered: true,
  },
];

/**
 * Check if a given SourceKind is a receipt source (not an ecosystem source).
 * Receipt sources come from explicit outcomes, not autonomous tick phases.
 */
export function isReceiptSourceKind(kind: SourceKind): boolean {
  return kind === 'player_action_receipt' || kind === 'process_receipt';
}

/**
 * Check if a given SourceKind is an organization action source.
 */
export function isOrganizationSourceKind(kind: SourceKind): boolean {
  return kind === 'manager_message';
}
