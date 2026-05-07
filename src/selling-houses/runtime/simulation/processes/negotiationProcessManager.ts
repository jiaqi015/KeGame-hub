import { settlePendingDealClosings } from '../../../domain/dealClosing.js';
import type { ClosedDealRecord, DomainEventEntry, GameState } from '../../../domain/models.js';
import type { ConsensusTickReceiptBundle } from '../../../core/world-state/consensus/runtimeReceiptBuilder.js';
import { buildConsensusTickReceiptBundle } from '../../../core/world-state/consensus/runtimeReceiptBuilder.js';

export interface NegotiationProcessManagerResult {
  readonly managerId: 'negotiation-process-manager';
  readonly settlementEntryOwner: 'runtime-process-manager-facade';
  readonly settlementOutcomeOwner: 'legacy-deal-closing-engine';
  readonly pendingBefore: readonly string[];
  readonly pendingAfter: readonly string[];
  readonly resolvedOpportunityIds: readonly string[];
  readonly emittedEvents: readonly DomainEventEntry[];
  readonly closedDeals: readonly ClosedDealRecord[];
  readonly consensusReceipts: ConsensusTickReceiptBundle;
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
  const resolved = resolvedOpportunityIds(pendingBefore, pendingAfter);
  const emitted = newUnshiftedEntries(state.eventStore, eventStoreStart);
  const closed = newUnshiftedEntries(state.closedDeals, closedDealStart);

  const consensusReceipts = buildConsensusTickReceiptBundle({
    pendingBefore: [...pendingBefore],
    pendingAfter: [...pendingAfter],
    resolvedOpportunityIds: resolved,
    emittedEvents: emitted,
    closedDeals: closed,
    day: state.day,
  });

  const result = {
    managerId: 'negotiation-process-manager',
    settlementEntryOwner: 'runtime-process-manager-facade',
    settlementOutcomeOwner: 'legacy-deal-closing-engine',
    pendingBefore: Object.freeze([...pendingBefore]),
    pendingAfter: Object.freeze([...pendingAfter]),
    resolvedOpportunityIds: Object.freeze(resolved),
    emittedEvents: Object.freeze(emitted),
    closedDeals: Object.freeze(closed),
    consensusReceipts,
  } satisfies NegotiationProcessManagerResult;

  return Object.freeze(result);
}
