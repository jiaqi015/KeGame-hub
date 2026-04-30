import { settlePendingDealClosings } from '../../../domain/dealClosing.js';
import type { ClosedDealRecord, DomainEventEntry, GameState } from '../../../domain/models.js';

export interface NegotiationProcessManagerResult {
  readonly managerId: 'negotiation-process-manager';
  readonly settlementEntryOwner: 'runtime-process-manager-facade';
  readonly settlementOutcomeOwner: 'legacy-deal-closing-engine';
  readonly pendingBefore: readonly string[];
  readonly pendingAfter: readonly string[];
  readonly resolvedOpportunityIds: readonly string[];
  readonly emittedEvents: readonly DomainEventEntry[];
  readonly closedDeals: readonly ClosedDealRecord[];
}

function pendingClosingOpportunityIds(state: GameState) {
  return state.opportunities
    .filter((entry) => entry.status === 'active' && entry.pendingClosingEvaluation)
    .map((entry) => entry.id);
}

function newUnshiftedEntries<T>(items: readonly T[], startLength: number): T[] {
  const addedCount = Math.max(0, items.length - startLength);
  return addedCount > 0 ? items.slice(0, addedCount) : [];
}

function resolvedOpportunityIds(before: readonly string[], after: readonly string[]) {
  const afterSet = new Set(after);
  return before.filter((id) => !afterSet.has(id));
}

export function settleNegotiationProcessesForDay(state: GameState): NegotiationProcessManagerResult {
  const pendingBefore = pendingClosingOpportunityIds(state);
  const eventStoreStart = state.eventStore.length;
  const closedDealStart = state.closedDeals.length;

  settlePendingDealClosings(state);

  const pendingAfter = pendingClosingOpportunityIds(state);
  const result = {
    managerId: 'negotiation-process-manager',
    settlementEntryOwner: 'runtime-process-manager-facade',
    settlementOutcomeOwner: 'legacy-deal-closing-engine',
    pendingBefore: Object.freeze([...pendingBefore]),
    pendingAfter: Object.freeze([...pendingAfter]),
    resolvedOpportunityIds: Object.freeze(resolvedOpportunityIds(pendingBefore, pendingAfter)),
    emittedEvents: Object.freeze(newUnshiftedEntries(state.eventStore, eventStoreStart)),
    closedDeals: Object.freeze(newUnshiftedEntries(state.closedDeals, closedDealStart)),
  } satisfies NegotiationProcessManagerResult;

  return Object.freeze(result);
}
