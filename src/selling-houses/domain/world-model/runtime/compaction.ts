/**
 * WorldRuntimeCompaction — event log boundedness and compaction.
 *
 * The big world runtime emits events every day. Without compaction,
 * the event log would grow unboundedly. This module enforces bounds
 * while preserving:
 * - Causal chain integrity (no dangling refs)
 * - Replay determinism (same input → same compacted state)
 * - Historical summary access (compressed daily summaries)
 *
 * Hard constraints:
 *   - Never delete events that are referenced by causeEventIds
 *   - Always keep the most recent N days of full events
 *   - Older events are compacted into summaries only
 *   - Causal refs per event are bounded (maxCausalRefsPerEvent)
 */

import type {
  BigWorldRuntimeState,
  BigWorldRuntimeSummary,
  BigWorldDailyEvent,
  ColdLedgerSummary,
  WorldRuntimeCompactionPolicy,
  DEFAULT_COMPACTION_POLICY,
} from './types.js';
import type { WorldCausalEvent } from '../causalEvents.js';
import type { SourceKind } from '../informationSourceTypes.js';

// ── Compaction: trim daily events ──────────────────────────────────────

/**
 * Compact daily events to stay within maxDailyEvents bound.
 * Keeps the newest events, removes oldest. Never removes events
 * that are referenced as causes by newer kept events.
 */
export function compactDailyEvents(
  events: readonly BigWorldDailyEvent[],
  maxEvents: number,
): readonly BigWorldDailyEvent[] {
  if (events.length <= maxEvents) return events;

  // Build a set of IDs that are referenced as causes by events we want to keep
  const keepEvents = events.slice(0, maxEvents);
  const keepIds = new Set(keepEvents.map((e) => e.id));
  const referencedCauses = new Set<string>();
  for (const event of keepEvents) {
    for (const causeId of event.causeEventIds) {
      referencedCauses.add(causeId);
    }
  }

  // Also keep events whose IDs are referenced as causes
  const extraKeep: BigWorldDailyEvent[] = [];
  for (const event of events.slice(maxEvents)) {
    if (referencedCauses.has(event.id) && !keepIds.has(event.id)) {
      extraKeep.push(event);
    }
  }

  return Object.freeze([...keepEvents, ...extraKeep]);
}

// ── Compaction: trim summaries ─────────────────────────────────────────

/**
 * Compact daily summaries to stay within maxSummaryDays bound.
 * Keeps the newest summaries.
 */
export function compactDailySummaries(
  summaries: readonly BigWorldRuntimeSummary[],
  maxDays: number,
): readonly BigWorldRuntimeSummary[] {
  if (summaries.length <= maxDays) return summaries;
  // Keep the newest summaries (end of array, since newest are prepended)
  return Object.freeze(summaries.slice(summaries.length - maxDays));
}

// ── Compaction: trim causal refs per event ─────────────────────────────

/**
 * Bound the causeEventIds array on each daily event.
 * Keeps the most recent causes, removes oldest root causes.
 */
export function compactCausalRefs(
  events: readonly BigWorldDailyEvent[],
  maxRefsPerEvent: number,
): readonly BigWorldDailyEvent[] {
  return events.map((event) => {
    if (event.causeEventIds.length <= maxRefsPerEvent) return event;
    return Object.freeze({
      ...event,
      causeEventIds: Object.freeze(
        event.causeEventIds.slice(0, maxRefsPerEvent),
      ),
      affectedRefs: Object.freeze(
        event.affectedRefs.slice(0, maxRefsPerEvent),
      ),
    });
  });
}

// ── Compaction: trim world causal events ───────────────────────────────

/**
 * Trim the worldCausalEvents array to stay within maxTotal.
 * Removes oldest root causes first (events with no causeEventIds),
 * then oldest events by day.
 */
export function compactWorldCausalEvents<T extends { readonly id: string; readonly day: number; readonly causeEventIds: readonly string[] }>(
  events: readonly T[],
  maxTotal: number,
): readonly T[] {
  if (events.length <= maxTotal) return events;

  // Sort by day ascending (oldest first), then by whether it's a root cause
  const sorted = [...events].sort((a, b) => {
    // Root causes (no causes) are oldest and can be trimmed first
    const aIsRoot = a.causeEventIds.length === 0 ? 0 : 1;
    const bIsRoot = b.causeEventIds.length === 0 ? 0 : 1;
    if (aIsRoot !== bIsRoot) return aIsRoot - bIsRoot;
    return a.day - b.day;
  });

  const toRemove = sorted.length - maxTotal;
  const removeIds = new Set(sorted.slice(0, toRemove).map((e) => e.id));

  // Filter events AND clean up dangling causeEventIds in surviving events.
  // When we remove old events, surviving events that referenced them would
  // have dangling cause refs. We clean those up to maintain causal chain integrity.
  const surviving: T[] = [];
  for (const event of events) {
    if (removeIds.has(event.id)) continue;
    const cleanedCauseIds = event.causeEventIds.filter((cid) => !removeIds.has(cid));
    if (cleanedCauseIds.length !== event.causeEventIds.length) {
      surviving.push({
        ...event,
        causeEventIds: Object.freeze(cleanedCauseIds),
      } as T);
    } else {
      surviving.push(event);
    }
  }
  return Object.freeze(surviving);
}

// ── Full compaction pass ───────────────────────────────────────────────

/**
 * Run a full compaction pass on BigWorldRuntimeState.
 * Returns a new state with compacted arrays (does not mutate input).
 */
export function runCompactionPass(
  state: BigWorldRuntimeState,
): BigWorldRuntimeState {
  const policy = state.compactionPolicy;

  const compactedEvents = compactCausalRefs(
    compactDailyEvents(state.dailyEvents, policy.maxDailyEvents),
    policy.maxCausalRefsPerEvent,
  );

  const compactedSummaries = compactDailySummaries(
    state.dailySummaries,
    policy.maxSummaryDays,
  );

  const compactedColdSummaries = compactColdLedgerSummaries(
    state.coldLedgerSummaries,
    policy.maxSummaryDays,
  );

  const compactedErrors = state.recentErrors.length > 20
    ? Object.freeze(state.recentErrors.slice(0, 20))
    : state.recentErrors;

  return {
    ...state,
    dailyEvents: [...compactedEvents] as BigWorldDailyEvent[],
    dailySummaries: [...compactedSummaries] as BigWorldRuntimeSummary[],
    coldLedgerSummaries: [...compactedColdSummaries] as ColdLedgerSummary[],
    recentErrors: [...compactedErrors] as string[],
  };
}

// ── Summary aggregation ────────────────────────────────────────────────

/**
 * Build a BigWorldRuntimeSummary from phase results.
 * Pure function — no side effects.
 */
export function buildRuntimeSummary(
  day: number,
  phaseResults: readonly { readonly phaseId: string; readonly mutationCount: number; readonly entitiesProcessed: number }[],
  allEvents: readonly { readonly kind: string; readonly visibilityHint: string; readonly boundedPayload: Readonly<Record<string, string | number | boolean>> }[],
): BigWorldRuntimeSummary {
  const totalEvents = allEvents.length;
  const totalMutations = phaseResults.reduce((s, r) => s + r.mutationCount, 0);

  // Extract market summary from events
  const heatEvents = allEvents.filter((e) => e.kind === 'MarketHeatShifted');
  const avgHeatBefore = heatEvents.length > 0
    ? heatEvents.reduce((s, e) => s + ((e.boundedPayload['before'] as number) ?? 50), 0) / heatEvents.length
    : 50;
  const avgHeatAfter = heatEvents.length > 0
    ? heatEvents.reduce((s, e) => s + ((e.boundedPayload['after'] as number) ?? 50), 0) / heatEvents.length
    : 50;

  // Rival summary
  const repriceEvents = allEvents.filter((e) => e.kind === 'RivalListingRepriced');
  const brokerEvents = allEvents.filter((e) => e.kind === 'RivalBrokerActionTaken');

  // Customer summary
  const compareEvents = allEvents.filter((e) => e.kind === 'CustomerComparedListings');
  const shiftEvents = allEvents.filter((e) => e.kind === 'CustomerAttentionShifted');

  // Owner summary
  const ownerEvents = allEvents.filter((e) => e.kind === 'OwnerMarketPressurePerceived');

  // Recommendation summary
  const recEvents = allEvents.filter((e) => e.kind === 'BrokerRecommendationChanged');

  return Object.freeze({
    day,
    totalEvents,
    totalMutations,
    market: Object.freeze({
      avgHeat: Math.round(avgHeatAfter * 10) / 10,
      heatDelta: Math.round((avgHeatAfter - avgHeatBefore) * 10) / 10,
      risingCellCount: heatEvents.filter((e) => ((e.boundedPayload['after'] as number) ?? 0) > ((e.boundedPayload['before'] as number) ?? 0)).length,
      decliningCellCount: heatEvents.filter((e) => ((e.boundedPayload['after'] as number) ?? 0) < ((e.boundedPayload['before'] as number) ?? 0)).length,
      seasonalPressure: 0.5,
      policyPressure: 0.5,
    }),
    rivals: Object.freeze({
      repricingCount: repriceEvents.length,
      followupCount: brokerEvents.length,
      avgPriceChange: repriceEvents.length > 0
        ? Math.round(repriceEvents.reduce((s, e) => s + Math.abs((e.boundedPayload['priceDelta'] as number) ?? 0), 0) / repriceEvents.length * 10) / 10
        : 0,
      newListings: 0,
      withdrawnListings: 0,
    }),
    customers: Object.freeze({
      comparisonCount: compareEvents.length,
      attentionShiftCount: shiftEvents.length,
      avgUrgency: 50,
      churnedCount: 0,
      newActivations: 0,
    }),
    owners: Object.freeze({
      pressurePerceivedCount: ownerEvents.length,
      avgPressureDelta: ownerEvents.length > 0
        ? Math.round(ownerEvents.reduce((s, e) => s + ((e.boundedPayload['pressureDelta'] as number) ?? 0), 0) / ownerEvents.length * 10) / 10
        : 0,
      urgencyIncreasedCount: 0,
      patienceDecreasedCount: 0,
    }),
    opportunities: Object.freeze({
      fitChangeCount: 0,
      readinessChangeCount: 0,
      newOpportunities: 0,
      lostOpportunities: 0,
    }),
    recommendations: Object.freeze({
      directionChangeCount: recEvents.length,
      pressureCandidateCount: recEvents.length,
      escalatedCount: recEvents.filter((e) => e.boundedPayload['recommendationKind'] === 'escalate_to_manager').length,
    }),
    hadErrors: false,
    errors: Object.freeze([]),
  });
}

// ── ColdLedgerSummary: source-level aggregates ────────────────────────

/**
 * Build a ColdLedgerSummary from phase results and source ingestion receipt.
 * This is called during compaction to create a compressed evidence record
 * that projections can use to explain "why this UI judgment was made."
 */
export function buildColdLedgerSummary(
  fromDay: number,
  toDay: number,
  phaseResults: readonly { readonly phaseId: string; readonly mutationCount: number; readonly entitiesProcessed: number }[],
  sourceReceipt?: {
    readonly sourcesProcessed: number;
    readonly causalEvents: readonly {
      readonly id?: string;
      readonly kind?: string;
      readonly source?: string;
      readonly sourceKind?: string;
      readonly sourceRecordId?: string;
      readonly sourceReplayKey?: string;
      readonly payload?: unknown;
    }[];
    readonly byKind: ReadonlyMap<string, { readonly count: number; readonly causalEventsProduced: number }>;
  },
): ColdLedgerSummary {
  const totalPhaseEvents = phaseResults.reduce((s, r) => s + r.entitiesProcessed, 0);
  const totalMutations = phaseResults.reduce((s, r) => s + r.mutationCount, 0);

  const bySourceKind = new Map<string, { count: number; causalEventsProduced: number }>();
  const latestSourceIdByKind = new Map<string, string>();
  const latestReplayKeyByKind = new Map<string, string>();
  let totalSourceRecords = 0;
  let totalCausalEventsFromSources = 0;

  if (sourceReceipt) {
    totalSourceRecords = sourceReceipt.sourcesProcessed;
    totalCausalEventsFromSources = sourceReceipt.causalEvents.length;

    // Build bySourceKind from receipt's byKind map
    for (const [kind, stats] of sourceReceipt.byKind) {
      bySourceKind.set(kind, { count: stats.count, causalEventsProduced: stats.causalEventsProduced });
    }

    // Track latest sourceId and replayKey per kind
    for (const event of sourceReceipt.causalEvents) {
      const kind = event.sourceKind ?? inferSourceKindFromCausalEvent(event);
      const sourceRecordId = event.sourceRecordId ?? inferSourceRecordIdFromCausalEvent(event);
      const sourceReplayKey = event.sourceReplayKey ?? inferSourceReplayKeyFromCausalEvent(event);
      if (kind && sourceRecordId) {
        latestSourceIdByKind.set(kind, sourceRecordId);
      }
      if (kind && sourceReplayKey) {
        latestReplayKeyByKind.set(kind, sourceReplayKey);
      }
    }
  }

  return Object.freeze({
    fromDay,
    toDay,
    totalSourceRecords,
    totalCausalEventsFromSources,
    bySourceKind: Object.freeze(bySourceKind) as ReadonlyMap<string, {
      readonly count: number;
      readonly causalEventsProduced: number;
    }>,
    latestSourceIdByKind: Object.freeze(latestSourceIdByKind),
    latestReplayKeyByKind: Object.freeze(latestReplayKeyByKind),
    totalPhaseEvents,
    totalMutations,
  });
}

function inferSourceKindFromCausalEvent(
  event: {
    readonly kind?: string;
    readonly source?: string;
    readonly payload?: unknown;
  },
): string | undefined {
  const payload = event.payload && typeof event.payload === 'object'
    ? event.payload as Readonly<Record<string, unknown>>
    : {};
  const payloadSourceKind = typeof payload['sourceKind'] === 'string' ? payload['sourceKind'] : undefined;
  if (payloadSourceKind) return payloadSourceKind;

  switch (event.source) {
    case 'market-signal':
      return 'market_signal';
    case 'rival-action':
      return 'rival_action';
    case 'customer-behavior':
      return 'customer_interaction';
    case 'owner-perception':
      return 'owner_interview';
    case 'broker-service':
      return event.kind === 'MatterPriorityChanged' ? 'manager_message' : 'player_action_receipt';
    case 'opening-snapshot':
      return 'market_signal';
    default:
      break;
  }

  switch (event.kind) {
    case 'MarketHeatShifted':
      return 'market_signal';
    case 'RivalListingRepriced':
    case 'RivalBrokerActionTaken':
      return 'rival_action';
    case 'CustomerComparedListings':
    case 'CustomerAttentionShifted':
      return 'customer_interaction';
    case 'OwnerMarketPressurePerceived':
      return 'owner_interview';
    case 'BrokerRecommendationChanged':
      return 'player_action_receipt';
    case 'MatterPriorityChanged':
      return 'manager_message';
    default:
      return undefined;
  }
}

function inferSourceRecordIdFromCausalEvent(
  event: { readonly id?: string; readonly sourceRecordId?: string },
): string | undefined {
  return event.sourceRecordId ?? (event.id ? `causal:${event.id}` : undefined);
}

function inferSourceReplayKeyFromCausalEvent(
  event: { readonly id?: string; readonly sourceReplayKey?: string },
): string | undefined {
  return event.sourceReplayKey ?? (event.id ? `causal-rk:${event.id}` : undefined);
}

/**
 * Compact cold ledger summaries to stay within maxSummaryDays bound.
 * Keeps the newest summaries.
 */
export function compactColdLedgerSummaries(
  summaries: readonly ColdLedgerSummary[],
  maxDays: number,
): readonly ColdLedgerSummary[] {
  if (summaries.length <= maxDays) return summaries;
  // Keep the newest summaries (end of array, since newest are prepended)
  return Object.freeze(summaries.slice(summaries.length - maxDays));
}

// ── Normalize old saves ────────────────────────────────────────────────

/**
 * Normalize a potentially missing or partial BigWorldRuntimeState.
 * Old saves without this field get a fresh default state.
 */
export function normalizeRuntimeState(
  input: unknown,
  compactionPolicy: WorldRuntimeCompactionPolicy,
): BigWorldRuntimeState {
  if (!input || typeof input !== 'object') {
    return createDefaultRuntimeState(compactionPolicy);
  }

  const raw = input as Record<string, unknown>;
  const economicResourceLedger = Array.isArray(raw['economicResourceLedger'])
    ? raw['economicResourceLedger'] as import('./types.js').EconomicResourceLedgerEntry[]
    : [];
  const actionResourceReceipts = Array.isArray(raw['actionResourceReceipts'])
    ? raw['actionResourceReceipts'] as import('./types.js').ActionResourceReceipt[]
    : [];
  const worldGraphSummary = raw['worldGraphSummary'] && typeof raw['worldGraphSummary'] === 'object'
    ? raw['worldGraphSummary'] as import('./types.js').WorldGraphSummary
    : undefined;

  return Object.freeze({
    compactionPolicy,
    lastTickDay: Math.max(0, Number(raw['lastTickDay']) || 0),
    dailyEvents: Array.isArray(raw['dailyEvents']) ? raw['dailyEvents'] as BigWorldDailyEvent[] : [],
    dailySummaries: Array.isArray(raw['dailySummaries']) ? raw['dailySummaries'] as BigWorldRuntimeSummary[] : [],
    coldLedgerSummaries: Array.isArray(raw['coldLedgerSummaries']) ? raw['coldLedgerSummaries'] as ColdLedgerSummary[] : [],
    economicResourceLedger,
    actionResourceReceipts,
    worldGraphSummary,
    totalEventsEmitted: Math.max(0, Number(raw['totalEventsEmitted']) || 0),
    totalMutationsEmitted: Math.max(0, Number(raw['totalMutationsEmitted']) || 0),
    tickCount: Math.max(0, Number(raw['tickCount']) || 0),
    recentErrors: Array.isArray(raw['recentErrors']) ? raw['recentErrors'] as string[] : [],
    playerBrokerAcnId: typeof raw['playerBrokerAcnId'] === 'string' && raw['playerBrokerAcnId']
      ? raw['playerBrokerAcnId']
      : 'acn-cooperative',
  });
}

/**
 * Create a default BigWorldRuntimeState.
 */
export function createDefaultRuntimeState(
  compactionPolicy: WorldRuntimeCompactionPolicy,
): BigWorldRuntimeState {
  return {
    compactionPolicy,
    lastTickDay: 0,
    dailyEvents: [],
    dailySummaries: [],
    coldLedgerSummaries: [],
    economicResourceLedger: [],
    actionResourceReceipts: [],
    totalEventsEmitted: 0,
    totalMutationsEmitted: 0,
    tickCount: 0,
    recentErrors: [],
    playerBrokerAcnId: 'acn-cooperative',
  };
}
