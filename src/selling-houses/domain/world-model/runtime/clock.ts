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

import type { WorldCausalEvent } from '../causalEvents.js';

// ── BigWorldClock ──────────────────────────────────────────────────────

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

  // Ingest source records (if any provided)
  let sourceIngestionReceipt: SourceIngestionReceipt | undefined;
  const sourceRecords = input.sourceRecords ?? [];
  if (sourceRecords.length > 0) {
    sourceIngestionReceipt = ingestSourceRecords(sourceRecords, day, input.runSeed);
  }

  // Add SourceIngestionPhase result to phase results
  const sourcePhaseResult: BigWorldTickPhaseResult = {
    phaseId: 'SourceIngestionPhase',
    events: sourceIngestionReceipt?.dailyEvents ?? [],
    entitiesProcessed: sourceIngestionReceipt?.sourcesProcessed ?? 0,
    mutationCount: sourceIngestionReceipt?.sourcesWithEffect ?? 0,
    durationUs: sourceRecords.length * 5,
  };
  const phaseResults: readonly BigWorldTickPhaseResult[] = [...basePhaseResults, sourcePhaseResult];

  // Merge causal events from phases + source ingestion
  const allMergedCausalEvents: WorldCausalEvent[] = [
    ...allCausalEvents,
    ...(sourceIngestionReceipt?.causalEvents ?? []),
  ];
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
  // Prepend new daily events (newest first)
  const mergedEvents = [...receipt.allEvents, ...runtime.dailyEvents];
  // Prepend new summary
  const mergedSummaries = [receipt.summary, ...runtime.dailySummaries];

  // Build cold ledger summary from this tick
  const coldSummary = buildColdLedgerSummary(
    receipt.day,
    receipt.day,
    receipt.phaseResults,
    receipt.sourceIngestionReceipt,
  );
  const mergedColdSummaries = [coldSummary, ...runtime.coldLedgerSummaries];

  // Update mutable fields
  runtime.lastTickDay = receipt.day;
  runtime.dailyEvents = mergedEvents;
  runtime.dailySummaries = mergedSummaries;
  runtime.coldLedgerSummaries = mergedColdSummaries;
  runtime.totalEventsEmitted += receipt.allEvents.length;
  runtime.totalMutationsEmitted += receipt.summary.totalMutations;
  runtime.tickCount += 1;

  if (receipt.summary.hadErrors) {
    runtime.recentErrors = [
      ...receipt.summary.errors,
      ...runtime.recentErrors,
    ].slice(0, 20);
  }

  // Run compaction pass to enforce bounds
  const compacted = runCompactionPass(runtime);

  // Copy compacted arrays back (runtime is mutable)
  runtime.dailyEvents = compacted.dailyEvents as BigWorldDailyEvent[];
  runtime.dailySummaries = compacted.dailySummaries as BigWorldRuntimeSummary[];
  runtime.coldLedgerSummaries = compacted.coldLedgerSummaries as ColdLedgerSummary[];
  runtime.recentErrors = compacted.recentErrors as string[];

  return runtime;
}

/**
 * Build a BigWorldClockInput from GameState.
 * Pure adapter — reads GameState fields and maps to clock input shape.
 * Also extracts shadow entity data from bootstrap for hundreds-scale runtime.
 */
export function buildClockInputFromGameState(
  state: {
    readonly day: number;
    readonly runContext: { readonly runSeed: number; readonly bigWorldBootstrap?: { readonly hiddenTruth?: { readonly ownerProfilePriors?: readonly { readonly priorId: string; readonly type: string; readonly priceAnchorRigidity: number; readonly expectedTrustBaseline: number; readonly expectedPatienceBaseline: number; readonly expectedUrgencyBaseline: number; readonly perceptionLagDays: number }[]; readonly acnProfiles?: readonly { readonly id: string; readonly name: string; readonly behavior: { readonly directAggression: number; readonly customerFollowupStrength: number; readonly priceReactionSpeed: number; readonly infoSpeed: number; readonly cooperationBias: number } }[] }; readonly materializedEntities?: { readonly listings?: readonly { readonly id: string; readonly layer: string }[] } } };
    readonly markets: readonly { readonly id: string; readonly name: string; readonly demandHeat: number; readonly supplyPressure: number; readonly competitivePressure: number; readonly sentiment: number }[];
    readonly cases: readonly { readonly id: string; readonly title: string; readonly status: string; readonly district: string; readonly marketCellId: string; readonly trust: number; readonly patience: number; readonly urgency: number; readonly heat: number; readonly competitiveness: number; readonly d1: number; readonly d3: number; readonly ownerName: string; readonly windowDays: number; readonly personality: string }[];
    readonly opportunities: readonly { readonly id: string; readonly caseId: string; readonly customerId: string; readonly customerName: string; readonly fit: number; readonly intent: number; readonly confidence: number; readonly stageIndex: number; readonly status: string; readonly stagnationTicks: number }[];
    readonly marketShadow: { readonly rivalListings: readonly { readonly id: string; readonly storeId: string; readonly title: string; readonly district: string; readonly marketCellId: string; readonly segment: string; readonly askPrice: number; readonly heat: number; readonly freshness: number; readonly status: string; readonly daysLeft: number }[]; readonly rivalStores: readonly { readonly id: string; readonly name: string; readonly type: string; readonly style: string; readonly districtFocus: readonly string[]; readonly leadCapturePower: number; readonly sellerInfluencePower: number; readonly pricingPressurePower: number; readonly activityHeat: number }[] };
    readonly customerStates: readonly { readonly customerId: string; readonly status: string; readonly fatigue: number; readonly churnRisk: number; readonly activeCaseIds: readonly string[] }[];
  },
): BigWorldClockInput {
  const bootstrap = state.runContext.bigWorldBootstrap;

  // Extract shadow owner priors from bootstrap
  const shadowOwnerPriors = bootstrap?.hiddenTruth?.ownerProfilePriors;

  // Extract ACN profiles from bootstrap
  const acnProfiles = bootstrap?.hiddenTruth?.acnProfiles;

  // Build shadow cases from owner priors + market cells
  // These allow the runtime to process 50+ owners per day
  const shadowCases = buildShadowCases(state, shadowOwnerPriors);

  return {
    settledDay: state.day,
    runSeed: state.runContext.runSeed,
    marketCells: state.markets,
    activeCases: state.cases.filter((c) => c.status === 'active'),
    activeOpportunities: state.opportunities.filter((o) => o.status === 'active'),
    rivalListings: state.marketShadow.rivalListings,
    rivalStores: state.marketShadow.rivalStores,
    customerStates: state.customerStates,
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
