/**
 * BigWorldClock — autonomous world movement orchestrator.
 *
 * Runs the 8-phase daily tick pipeline and produces a BigWorldTickReceipt.
 * The clock advances the world regardless of player action.
 *
 * Usage:
 *   const receipt = runBigWorldDayTick(state);
 *   // receipt contains phase results, daily events, summary, and causal events
 *   // caller applies receipt to GameState (mutates state.bigWorldRuntime)
 *
 * Deterministic: same seed + same input state → same receipt.
 *
 * Mother model alignment:
 *   - Section 10: Competition is environment
 *   - Section 13: Causal Transmission
 *   - Section 14: Game Loop Qualities (fast feedback, surprise)
 *
 * Hard constraints:
 *   - No case.status mutation
 *   - No closedDeals mutation
 *   - No owner trust/patience/urgency raw field mutation
 *   - No UI projection fields as canonical facts
 *   - All events are deterministic
 *   - Compaction runs every tick to enforce bounds
 */

import type {
  BigWorldRuntimeState,
  BigWorldRuntimeSummary,
  BigWorldTickReceipt,
  BigWorldClockInput,
  BigWorldDailyEvent,
  BigWorldTickPhaseResult,
  ColdLedgerSummary,
  WorldRuntimeCompactionPolicy,
  DEFAULT_COMPACTION_POLICY,
} from './types.js';

import { DEFAULT_COMPACTION_POLICY as DEFAULT_POLICY } from './types.js';

import { runAllPhases } from './phases.js';
import {
  buildRuntimeSummary,
  buildColdLedgerSummary,
  compactWorldCausalEvents,
  normalizeRuntimeState,
  createDefaultRuntimeState,
  runCompactionPass,
} from './compaction.js';

import { ingestSourceRecords } from './sourceIngestionAdapter.js';
import type { SourceIngestionReceipt } from './sourceIngestionAdapter.js';
import { buildSourceRecordsFromPhaseOutput } from './sourceRecordBuilder.js';

import type { WorldCausalEvent } from '../causalEvents.js';

// ── Causal event trace merge ─────────────────────────────────────────────

/**
 * Merge source traceability from source-ingested events into phase events.
 * If a source-ingested event matches a phase event (same kind + same entityIds),
 * the phase event gets the source traceability fields.
 * Unmatched source-ingested events are NOT added (they would dangle in the ledger).
 */
function mergeCausalEventTraces(
  phaseEvents: readonly WorldCausalEvent[],
  sourceEvents: readonly WorldCausalEvent[],
): WorldCausalEvent[] {
  const result: WorldCausalEvent[] = [...phaseEvents];
  const usedSourceEvents = new Set<number>();

  for (let pi = 0; pi < result.length; pi += 1) {
    const phaseEvt = result[pi];
    // Already has source traceability
    if ((phaseEvt as any).sourceRecordId) continue;

    for (let si = 0; si < sourceEvents.length; si += 1) {
      if (usedSourceEvents.has(si)) continue;
      const srcEvt = sourceEvents[si];

      // Match by kind + entityIds (first entity is the primary match key)
      if (phaseEvt.kind !== srcEvt.kind) continue;
      if (phaseEvt.entityIds.length > 0 && srcEvt.entityIds.length > 0 &&
          phaseEvt.entityIds[0] !== srcEvt.entityIds[0]) continue;

      // Merge source traceability into phase event
      result[pi] = Object.freeze({
        ...phaseEvt,
        sourceRecordId: (srcEvt as any).sourceRecordId,
        sourceReplayKey: (srcEvt as any).sourceReplayKey,
        sourceKind: (srcEvt as any).sourceKind,
      });
      usedSourceEvents.add(si);
      break;
    }
  }

  // NOTE: Unmatched source-ingested events are intentionally NOT added.
  // They would be isolated entries in the ledger with no downstream references.
  // Source traceability is only needed on phase events that other events reference.

  return result;
}

// ── BigWorldClock ──────────────────────────────────────────────────────

interface BootstrapMarketCell {
  readonly id: string;
  readonly name: string;
  readonly heat: number;
  readonly inventoryPressure: number;
  readonly dealVelocity: number;
}

interface BootstrapListing {
  readonly listingId: string;
  readonly layer: string;
  readonly brokerId?: string;
  readonly acnId?: string;
  readonly marketCellId?: string;
  readonly district?: string;
  readonly layout?: string;
  readonly areaSqm?: number;
  readonly askPrice?: number;
  readonly competitiveness?: number;
  readonly liquidity?: number;
  readonly status?: string;
  readonly daysOnMarket?: number;
}

interface BootstrapBroker {
  readonly brokerId: string;
  readonly acnId?: string;
  readonly visibility?: string;
  readonly name?: string;
  readonly style?: string;
  readonly marketCellIds?: readonly string[];
  readonly energyBudget?: number;
  readonly listingPoolSize?: number;
  readonly customerPoolSize?: number;
  readonly actionBias?: number;
}

interface BootstrapCustomer {
  readonly customerId: string;
  readonly targetMarketCellId?: string;
  readonly visibility?: string;
  readonly urgency?: number;
  readonly priceSensitivity?: number;
  readonly dailyComparisonLimit?: number;
}

interface BootstrapShape {
  readonly hiddenTruth?: {
    readonly marketCells?: readonly BootstrapMarketCell[];
    readonly ownerProfilePriors?: readonly { readonly priorId: string; readonly type: string; readonly priceAnchorRigidity: number; readonly expectedTrustBaseline: number; readonly expectedPatienceBaseline: number; readonly expectedUrgencyBaseline: number; readonly perceptionLagDays: number }[];
    readonly acnProfiles?: readonly { readonly id: string; readonly name: string; readonly behavior: { readonly directAggression: number; readonly customerFollowupStrength: number; readonly priceReactionSpeed: number; readonly infoSpeed: number; readonly cooperationBias: number } }[];
  };
  readonly materializedEntities?: {
    readonly listings?: readonly BootstrapListing[];
    readonly brokers?: readonly BootstrapBroker[];
    readonly customers?: readonly BootstrapCustomer[];
  };
}

/**
 * Run the big world day tick: 8 phases, causal events, summary, compaction.
 *
 * This is the main entry point for the world runtime substrate.
 * It does NOT mutate GameState directly — it returns a receipt.
 * The caller is responsible for applying the receipt to GameState.
 *
 * @param input - Snapshot of relevant GameState fields (read-only)
 * @param existingRuntime - Current BigWorldRuntimeState (may be undefined for old saves)
 * @param existingCausalEvents - Current worldCausalEvents (may be empty for old saves)
 * @returns BigWorldTickReceipt with all phase results, events, summary, and causal events
 */
export function runBigWorldDayTick(
  input: BigWorldClockInput,
  existingRuntime?: BigWorldRuntimeState,
  existingCausalEvents?: readonly WorldCausalEvent[],
): BigWorldTickReceipt {
  const tickStartMs = performance.now();
  const day = input.settledDay;
  const policy = existingRuntime?.compactionPolicy ?? DEFAULT_POLICY;

  // Normalize runtime state (handles old saves)
  const runtime = existingRuntime
    ? normalizeRuntimeState(existingRuntime, policy)
    : createDefaultRuntimeState(policy);

  // Run all 8 phases
  const { phaseResults: basePhaseResults, allDailyEvents, allCausalEvents, totalMutations } = runAllPhases(input);

  // Convert phase-generated causal events into source records for traceability.
  // This ensures every causal event carries sourceRecordId/sourceReplayKey/sourceKind.
  const phaseSourceRecords = buildSourceRecordsFromPhaseOutput(allCausalEvents, input.runSeed, day);

  // Merge phase-derived source records with any external source records
  const externalSourceRecords = input.sourceRecords ?? [];
  const allSourceRecords: readonly import('../informationSourceTypes.js').InformationSourceRecord[] = [
    ...phaseSourceRecords,
    ...externalSourceRecords,
  ];

  // Ingest all source records through the adapter
  let sourceIngestionReceipt: SourceIngestionReceipt | undefined;
  if (allSourceRecords.length > 0) {
    sourceIngestionReceipt = ingestSourceRecords(allSourceRecords, day, input.runSeed);
  }

  // Add SourceIngestionPhase result to phase results
  const sourcePhaseResult: BigWorldTickPhaseResult = {
    phaseId: 'SourceIngestionPhase',
    events: sourceIngestionReceipt?.dailyEvents ?? [],
    entitiesProcessed: sourceIngestionReceipt?.sourcesProcessed ?? 0,
    mutationCount: sourceIngestionReceipt?.sourcesWithEffect ?? 0,
    durationUs: allSourceRecords.length * 5,
  };
  const phaseResults: readonly BigWorldTickPhaseResult[] = [...basePhaseResults, sourcePhaseResult];

  // Use source-ingested causal events as the primary output.
  // These carry sourceRecordId/sourceReplayKey/sourceKind for hard traceability.
  // ALSO include raw phase events because they form the internal causal chain
  // (e.g., CustomerComparedListings references RivalBrokerActionTaken as causeEventId).
  // Source-ingested events carry source traceability; phase events carry causal structure.
  const sourceIngestedCausal = sourceIngestionReceipt?.causalEvents ?? [];

  // Merge source traceability into phase events.
  // If a source-ingested event matches a phase event (same kind + same entityIds),
  // the phase event gets the source traceability fields. Otherwise, the source-ingested
  // event is added as a new entry.
  const allMergedCausalEvents: WorldCausalEvent[] = mergeCausalEventTraces(
    allCausalEvents,
    sourceIngestedCausal,
  );

  // Daily events come from both phases (structural) and source ingestion (traceable)
  const allMergedDailyEvents: readonly BigWorldDailyEvent[] = Object.freeze([
    ...allDailyEvents,
    ...(sourceIngestionReceipt?.dailyEvents ?? []),
  ]);

  // Build summary from merged events
  const summary = buildRuntimeSummary(day, phaseResults, allMergedDailyEvents);

  // Compact world causal events to enforce maxTotal bound
  const existingEvents = existingCausalEvents ?? [];
  const compactedCausalEvents = compactWorldCausalEvents(
    [...existingEvents, ...allMergedCausalEvents],
    policy.maxTotalCausalEvents,
  );

  // The events to append (only the new ones, not the compacted existing)
  const causalEventsToAppend = allMergedCausalEvents;

  const tickDurationUs = Math.round((performance.now() - tickStartMs) * 1000);

  return Object.freeze({
    day,
    nextDay: day + 1,
    phaseResults: Object.freeze(phaseResults),
    allEvents: allMergedDailyEvents,
    summary,
    causalEventsToAppend: Object.freeze(causalEventsToAppend),
    sourceIngestionReceipt,
    durationUs: tickDurationUs,
  });
}

/**
 * Apply a BigWorldTickReceipt to BigWorldRuntimeState.
 * Mutates runtime state in place (caller owns the state).
 * Returns the updated runtime state.
 */
export function applyTickReceiptToRuntime(
  runtime: BigWorldRuntimeState,
  receipt: BigWorldTickReceipt,
): BigWorldRuntimeState {
  const target = Object.isFrozen(runtime)
    ? {
        ...runtime,
        dailyEvents: [...runtime.dailyEvents],
        dailySummaries: [...runtime.dailySummaries],
        coldLedgerSummaries: [...runtime.coldLedgerSummaries],
        recentErrors: [...runtime.recentErrors],
      }
    : runtime;
  // Prepend new daily events (newest first)
  const mergedEvents = [...receipt.allEvents, ...target.dailyEvents];
  // Prepend new summary
  const mergedSummaries = [receipt.summary, ...target.dailySummaries];

  // Build cold ledger summary from this tick
  const coldSummary = buildColdLedgerSummary(
    receipt.day,
    receipt.day,
    receipt.phaseResults,
    receipt.sourceIngestionReceipt,
  );
  const mergedColdSummaries = [coldSummary, ...target.coldLedgerSummaries];

  // Update mutable fields
  target.lastTickDay = receipt.day;
  target.dailyEvents = mergedEvents;
  target.dailySummaries = mergedSummaries;
  target.coldLedgerSummaries = mergedColdSummaries;
  target.totalEventsEmitted += receipt.allEvents.length;
  target.totalMutationsEmitted += receipt.summary.totalMutations;
  target.tickCount += 1;

  if (receipt.summary.hadErrors) {
    target.recentErrors = [
      ...receipt.summary.errors,
      ...target.recentErrors,
    ].slice(0, 20);
  }

  // Run compaction pass to enforce bounds
  const compacted = runCompactionPass(target);

  // Copy compacted arrays back (runtime is mutable)
  target.dailyEvents = compacted.dailyEvents as BigWorldDailyEvent[];
  target.dailySummaries = compacted.dailySummaries as BigWorldRuntimeSummary[];
  target.coldLedgerSummaries = compacted.coldLedgerSummaries as ColdLedgerSummary[];
  target.recentErrors = compacted.recentErrors as string[];

  return target;
}

/**
 * Build a BigWorldClockInput from GameState.
 * Pure adapter — reads GameState fields and maps to clock input shape.
 * Also extracts shadow entity data from bootstrap for hundreds-scale runtime.
 */
export function buildClockInputFromGameState(
  state: {
    readonly day: number;
    readonly runContext: { readonly runSeed: number; readonly bigWorldBootstrap?: BootstrapShape };
    readonly markets: readonly { readonly id: string; readonly name: string; readonly demandHeat: number; readonly supplyPressure: number; readonly competitivePressure: number; readonly sentiment: number }[];
    readonly cases: readonly { readonly id: string; readonly title: string; readonly status: string; readonly district: string; readonly marketCellId: string; readonly trust: number; readonly patience: number; readonly urgency: number; readonly heat: number; readonly competitiveness: number; readonly d1: number; readonly d3: number; readonly ownerName: string; readonly windowDays: number; readonly personality: string }[];
    readonly opportunities: readonly { readonly id: string; readonly caseId: string; readonly customerId: string; readonly customerName: string; readonly fit: number; readonly intent: number; readonly confidence: number; readonly stageIndex: number; readonly status: string; readonly stagnationTicks: number }[];
    readonly marketShadow: { readonly rivalListings: readonly { readonly id: string; readonly storeId: string; readonly title: string; readonly district: string; readonly marketCellId: string; readonly segment: string; readonly askPrice: number; readonly heat: number; readonly freshness: number; readonly status: string; readonly daysLeft: number }[]; readonly rivalStores: readonly { readonly id: string; readonly name: string; readonly type: string; readonly style: string; readonly districtFocus: readonly string[]; readonly leadCapturePower: number; readonly sellerInfluencePower: number; readonly pricingPressurePower: number; readonly activityHeat: number }[] };
    readonly customerStates: readonly { readonly customerId: string; readonly status: string; readonly fatigue: number; readonly churnRisk: number; readonly activeCaseIds: readonly string[] }[];
  },
): BigWorldClockInput {
  const bootstrap = state.runContext.bigWorldBootstrap;
  const marketCells = mapBootstrapMarkets(state.markets, bootstrap);
  const rivalListings = mapBootstrapRivalListings(state.marketShadow.rivalListings, bootstrap);
  const rivalStores = mapBootstrapRivalStores(state.marketShadow.rivalStores, bootstrap);
  const customerStates = mapBootstrapCustomerStates(state.customerStates, bootstrap);

  // Extract shadow owner priors from bootstrap
  const shadowOwnerPriors = bootstrap?.hiddenTruth?.ownerProfilePriors;

  // Extract ACN profiles from bootstrap
  const acnProfiles = bootstrap?.hiddenTruth?.acnProfiles;

  // Build shadow cases from owner priors + market cells
  // These allow the runtime to process 50+ owners per day
  const shadowCases = buildShadowCases(
    {
      day: state.day,
      runContext: state.runContext,
      markets: marketCells,
    },
    shadowOwnerPriors,
  );

  return {
    settledDay: state.day,
    runSeed: state.runContext.runSeed,
    marketCells,
    activeCases: state.cases.filter((c) => c.status === 'active'),
    activeOpportunities: state.opportunities.filter((o) => o.status === 'active'),
    rivalListings,
    rivalStores,
    customerStates,
    shadowOwnerPriors,
    shadowCases,
    acnProfiles,
  };
}

/**
 * Build shadow cases from owner priors + market cells.
 * Each shadow case represents an owner's market position that the runtime
 * can process for pressure perception, recommendation, etc.
 * These are synthetic but deterministic — same input → same output.
 */
function buildShadowCases(
  state: {
    readonly day: number;
    readonly runContext: { readonly runSeed: number };
    readonly markets: readonly { readonly id: string; readonly name: string }[];
  },
  shadowOwnerPriors?: readonly { readonly priorId: string; readonly type: string; readonly priceAnchorRigidity: number; readonly expectedTrustBaseline: number; readonly expectedPatienceBaseline: number; readonly expectedUrgencyBaseline: number; readonly perceptionLagDays: number }[],
): readonly { readonly id: string; readonly marketCellId: string; readonly district: string; readonly heat: number; readonly trust: number; readonly patience: number; readonly urgency: number; readonly windowDays: number; readonly ownerName: string }[] {
  if (!shadowOwnerPriors || shadowOwnerPriors.length === 0) return [];

  // Deterministic hash for shadow case generation
  const stableHash = (input: string): number => {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };

  const seededInt = (seed: string, min: number, max: number): number =>
    min + (stableHash(seed) % (max - min + 1));

  const cells = state.markets;
  const cases: { id: string; marketCellId: string; district: string; heat: number; trust: number; patience: number; urgency: number; windowDays: number; ownerName: string }[] = [];

  for (let i = 0; i < shadowOwnerPriors.length; i += 1) {
    const prior = shadowOwnerPriors[i];
    const salt = `shadow-case-${state.runContext.runSeed}-${state.day}-${i}`;
    const cell = cells[i % cells.length];

    cases.push({
      id: `shadow-case-${prior.priorId}`,
      marketCellId: cell.id,
      district: cell.name,
      heat: seededInt(`${salt}-heat`, 20, 80),
      trust: prior.expectedTrustBaseline,
      patience: prior.expectedPatienceBaseline,
      urgency: prior.expectedUrgencyBaseline,
      windowDays: seededInt(`${salt}-window`, 7, 30),
      ownerName: `shadow-owner-${prior.priorId}`,
    });
  }

  return cases;
}

function mapBootstrapMarkets(
  stateMarkets: readonly { readonly id: string; readonly name: string; readonly demandHeat: number; readonly supplyPressure: number; readonly competitivePressure: number; readonly sentiment: number }[],
  bootstrap?: BootstrapShape,
): BigWorldClockInput['marketCells'] {
  const cells = bootstrap?.hiddenTruth?.marketCells ?? [];
  if (cells.length === 0) return stateMarkets;

  return cells.map((cell) => ({
    id: cell.id,
    name: cell.name,
    demandHeat: cell.heat,
    supplyPressure: cell.inventoryPressure,
    competitivePressure: Math.max(0, Math.min(100, 100 - cell.dealVelocity + Math.round(cell.inventoryPressure * 0.25))),
    sentiment: Math.max(0, Math.min(100, Math.round((cell.heat + cell.dealVelocity) / 2))),
  }));
}

function mapBootstrapRivalListings(
  fallback: BigWorldClockInput['rivalListings'],
  bootstrap?: BootstrapShape,
): BigWorldClockInput['rivalListings'] {
  const listings = bootstrap?.materializedEntities?.listings ?? [];
  const mapped = listings
    .filter((listing) => listing.layer === 'direct_rival' || listing.layer === 'shadow')
    .map((listing, index) => ({
      id: listing.listingId,
      storeId: listing.brokerId ?? listing.acnId ?? `bootstrap-store-${index % 3}`,
      title: `${listing.district ?? '大世界'} ${listing.layer === 'shadow' ? '影子盘' : '竞品盘'} ${index + 1}`,
      district: listing.district ?? '',
      marketCellId: listing.marketCellId ?? '',
      segment: listing.layout ?? listing.layer,
      askPrice: Number(listing.askPrice) || 0,
      heat: Math.max(0, Math.min(100, Math.round(((listing.competitiveness ?? 50) + (listing.liquidity ?? 50)) / 2))),
      freshness: Math.max(0, Math.min(100, 100 - (Number(listing.daysOnMarket) || 0))),
      status: listing.status === 'sold' || listing.status === 'withdrawn' ? listing.status : 'active',
      daysLeft: Math.max(1, 30 - (Number(listing.daysOnMarket) || 0)),
    }));
  return mapped.length > fallback.length ? mapped : fallback;
}

function mapBootstrapRivalStores(
  fallback: BigWorldClockInput['rivalStores'],
  bootstrap?: BootstrapShape,
): BigWorldClockInput['rivalStores'] {
  const brokers = bootstrap?.materializedEntities?.brokers ?? [];
  const mapped = brokers
    .filter((broker) => broker.brokerId !== 'player-broker')
    .map((broker) => ({
      id: broker.brokerId,
      name: broker.name ?? broker.brokerId,
      type: broker.visibility === 'named' ? 'same_company' : 'external_company',
      style: broker.style ?? 'steady',
      districtFocus: broker.marketCellIds ?? [],
      leadCapturePower: Math.max(0, Math.min(100, (broker.customerPoolSize ?? 4) * 10)),
      sellerInfluencePower: Math.max(0, Math.min(100, (broker.listingPoolSize ?? 3) * 10)),
      pricingPressurePower: Math.max(0, Math.min(100, 50 + (broker.actionBias ?? 0))),
      activityHeat: Math.max(0, Math.min(100, broker.energyBudget ?? 50)),
    }));
  return mapped.length > fallback.length ? mapped : fallback;
}

function mapBootstrapCustomerStates(
  fallback: BigWorldClockInput['customerStates'],
  bootstrap?: BootstrapShape,
): BigWorldClockInput['customerStates'] {
  const customers = bootstrap?.materializedEntities?.customers ?? [];
  const listings = bootstrap?.materializedEntities?.listings ?? [];
  if (customers.length === 0 || listings.length === 0) return fallback;

  const listingsByCell = new Map<string, string[]>();
  for (const listing of listings) {
    if (!listing.marketCellId) continue;
    const bucket = listingsByCell.get(listing.marketCellId) ?? [];
    bucket.push(listing.listingId);
    listingsByCell.set(listing.marketCellId, bucket);
  }

  const mapped = customers
    .filter((customer) => customer.visibility !== 'churned')
    .map((customer, index) => {
      const sameCellListings = customer.targetMarketCellId
        ? listingsByCell.get(customer.targetMarketCellId) ?? []
        : [];
      const allListingIds = listings.map((listing) => listing.listingId);
      const activeCaseIds = (sameCellListings.length >= 2 ? sameCellListings : allListingIds)
        .slice(index % 3, (index % 3) + Math.max(2, customer.dailyComparisonLimit ?? 4));
      return {
        customerId: customer.customerId,
        status: 'active',
        fatigue: Math.max(0, Math.min(100, 100 - (customer.urgency ?? 50))),
        churnRisk: Math.max(0, Math.min(100, customer.priceSensitivity ?? 50)),
        activeCaseIds: activeCaseIds.length >= 2 ? activeCaseIds : allListingIds.slice(0, 3),
      };
    });

  return mapped.length > fallback.length ? mapped : fallback;
}
