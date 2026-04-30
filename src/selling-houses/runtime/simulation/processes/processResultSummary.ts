import type { DailyProcessResultSummary } from '../../../domain/models.js';
import { normalizeDailyProcessResultReadModel } from '../dailyProcessResult.js';
import type { NegotiationProcessManagerResult } from './negotiationProcessManager.js';
import type { ProductRunProcessManagerResult } from './productRunProcessManager.js';

type BuildProcessResultSummaryOptions = Readonly<{
  day: number;
}>;

function buildOwnedProcessResultSummary(summary: DailyProcessResultSummary): DailyProcessResultSummary {
  const readModel = normalizeDailyProcessResultReadModel(summary);
  if (!readModel) {
    throw new Error(`Invalid daily process result ownership for ${String(summary.managerId)}.`);
  }

  return {
    managerId: readModel.managerId,
    owner: readModel.owner,
    outcomeOwner: readModel.outcomeOwner,
    day: readModel.day,
    phase: readModel.phase,
    processedCount: readModel.processedCount,
    resolvedCount: readModel.resolvedCount,
    emittedEventIds: [...readModel.emittedEventIds],
    closedDealIds: [...readModel.closedDealIds],
    opportunityIds: [...readModel.opportunityIds],
    productRunIds: [...readModel.productRunIds],
  };
}

export function buildNegotiationProcessResultSummary(
  result: NegotiationProcessManagerResult,
  options: BuildProcessResultSummaryOptions,
): DailyProcessResultSummary {
  return buildOwnedProcessResultSummary({
    managerId: result.managerId,
    owner: result.settlementEntryOwner,
    outcomeOwner: result.settlementOutcomeOwner,
    day: options.day,
    phase: 'settled-day',
    processedCount: result.pendingBefore.length,
    resolvedCount: result.resolvedOpportunityIds.length,
    emittedEventIds: result.emittedEvents.map((entry) => entry.id),
    closedDealIds: result.closedDeals.map((entry) => entry.dealId),
    opportunityIds: [...result.resolvedOpportunityIds],
    productRunIds: [],
  });
}

export function buildProductRunProcessResultSummary(
  result: ProductRunProcessManagerResult,
  options: BuildProcessResultSummaryOptions,
): DailyProcessResultSummary {
  return buildOwnedProcessResultSummary({
    managerId: result.managerId,
    owner: result.transitionOwner,
    day: options.day,
    phase: 'next-day-setup',
    processedCount: result.transitions.length,
    resolvedCount: result.transitions.filter((entry) => entry.completed).length,
    emittedEventIds: [...result.eventIds],
    closedDealIds: [],
    opportunityIds: [],
    productRunIds: result.transitions.map((entry) => entry.runId),
  });
}
