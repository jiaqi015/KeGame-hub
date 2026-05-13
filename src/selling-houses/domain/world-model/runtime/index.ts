/**
 * BigWorldRuntime — barrel exports for autonomous world movement substrate.
 *
 * This module is the single entry point for the big world runtime.
 * Import from 'domain/world-model/runtime' to access all runtime types and functions.
 */

// --- Types (Agent B) -----------------------------------------------------

export type {
  BigWorldCausalRef,
  BigWorldDailyEvent,
  BigWorldEventVisibility,
  BigWorldTickPhaseId,
  BigWorldTickPhaseResult,
  MarketEnvironmentSummary,
  RivalActivitySummary,
  CustomerDemandSummary,
  OwnerPerceptionSummary,
  OpportunityPressureSummary,
  RecommendationPressureSummary,
  BigWorldRuntimeSummary,
  BigWorldTickReceipt,
  ColdLedgerSummary,
  WorldRuntimeCompactionPolicy,
  BigWorldRuntimeState,
  BigWorldClockInput,
} from './types.js';

export { DEFAULT_COMPACTION_POLICY } from './types.js';

// --- Phases (Agent B) ----------------------------------------------------

export { TICK_PHASE_ORDER, runAllPhases } from './phases.js';

// --- Compaction (Agent B) ------------------------------------------------

export {
  compactDailyEvents,
  compactDailySummaries,
  compactCausalRefs,
  compactWorldCausalEvents,
  compactColdLedgerSummaries,
  runCompactionPass,
  buildRuntimeSummary,
  buildColdLedgerSummary,
  normalizeRuntimeState,
  createDefaultRuntimeState,
} from './compaction.js';

// --- Source Ingestion Adapter (Agent B) -----------------------------------

export type {
  SourceIngestionReceipt,
} from './sourceIngestionAdapter.js';

export {
  ingestSourceRecords,
  ingestSourceRecordsBatch,
  MAX_BATCH_SIZE,
} from './sourceIngestionAdapter.js';

// --- Clock (Agent B) -----------------------------------------------------

export {
  runBigWorldDayTick,
  applyTickReceiptToRuntime,
  buildClockInputFromGameState,
} from './clock.js';

// --- ActionCommandReceipt (Agent C) ----------------------------------------

export {
  buildActionCommand,
  buildActionReceipt,
} from './actionCommandReceipt.js';

// --- ActionReplay (Agent C) ------------------------------------------------

export {
  replayActionCommand,
  verifyActionChainDeterminism,
} from './actionReplay.js';
