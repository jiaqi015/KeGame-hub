/**
 * BigWorldRuntime — types for autonomous world movement substrate.
 *
 * Design source: selling-houses-world-model-mother-model.md
 * The world moves every day regardless of player action. The runtime substrate
 * tracks what the world did, what changed, and what pressure it created.
 *
 * Architecture boundary:
 *   - runtime/ may only import from domain/world-model/ and domain/utils
 *   - it must NOT import from application/ or UI/
 *   - all values are deterministic for same seed + same action sequence
 *   - GameState.bigWorldRuntime is the persistence surface
 *
 * Mother model alignment:
 *   - Section 10: Competition is environment
 *   - Section 13: Causal Transmission (deterministic skeleton)
 *   - Section 14: Game Loop Qualities (fast feedback, surprise, opponents)
 */

import type { WorldCausalEvent } from '../causalEvents.js';
import type { InformationSourceRecord } from '../informationSourceTypes.js';

// ---------------------------------------------------------------------------
// BigWorldCausalRef — pointer into the causal ledger
// ---------------------------------------------------------------------------

/** Reference to a causal event in the world causal ledger. */
export interface BigWorldCausalRef {
  /** The causal event ID. */
  readonly eventId: string;
  /** Day the event occurred. */
  readonly day: number;
  /** Event kind for quick filtering. */
  readonly kind: string;
}

// ---------------------------------------------------------------------------
// BigWorldDailyEvent — one day's world movement record
// ---------------------------------------------------------------------------

/** Visibility hint for downstream projection layers. */
export type BigWorldEventVisibility =
  | 'hidden'       // shadow world only, player cannot see
  | 'signal'       // player sees as market signal, not raw event
  | 'actionable'   // player can act on this
  | 'narrative';   // part of daily narrative

/** A single day's world movement event with bounded payload. */
export interface BigWorldDailyEvent {
  /** Deterministic event ID: bwe-{kind}-{day}-{index}. */
  readonly id: string;
  /** Day this event occurred. */
  readonly day: number;
  /** Phase that produced this event. */
  readonly phase: BigWorldTickPhaseId;
  /** Event kind for downstream filtering. */
  readonly kind: string;
  /** Where this event originated. */
  readonly source: string;
  /** Entity IDs directly affected by this event. */
  readonly affectedRefs: readonly BigWorldCausalRef[];
  /** IDs of events that caused this event (causal chain). */
  readonly causeEventIds: readonly string[];
  /** Who should see this event (player / manager / hidden). */
  readonly visibilityHint: BigWorldEventVisibility;
  /** Bounded payload — max 10 keys, max 200 chars per value. */
  readonly boundedPayload: Readonly<Record<string, string | number | boolean>>;
}

// ---------------------------------------------------------------------------
// BigWorldTickPhase — phase identifiers
// ---------------------------------------------------------------------------

export type BigWorldTickPhaseId =
  | 'EnvironmentPhase'
  | 'RivalBrokerPhase'
  | 'ListingSupplyPhase'
  | 'CustomerDemandPhase'
  | 'OwnerPerceptionPhase'
  | 'OpportunityPressurePhase'
  | 'RecommendationPressurePhase'
  | 'SourceIngestionPhase'
  | 'CompactionPhase';

// ---------------------------------------------------------------------------
// BigWorldTickPhaseResult — result of one phase
// ---------------------------------------------------------------------------

/** Result of executing one tick phase. */
export interface BigWorldTickPhaseResult {
  /** Which phase produced this result. */
  readonly phaseId: BigWorldTickPhaseId;
  /** Causal events emitted by this phase. */
  readonly events: readonly BigWorldDailyEvent[];
  /** Number of entities processed. */
  readonly entitiesProcessed: number;
  /** Number of state mutations (field changes). */
  readonly mutationCount: number;
  /** Duration in microseconds (for perf tracking). */
  readonly durationUs: number;
}

// ---------------------------------------------------------------------------
// BigWorldRuntimeSummary — compressed world state snapshot
// ---------------------------------------------------------------------------

/** Market environment summary for one day. */
export interface MarketEnvironmentSummary {
  /** Average heat across all market cells. */
  readonly avgHeat: number;
  /** Heat change from previous day. */
  readonly heatDelta: number;
  /** Number of market cells with rising heat. */
  readonly risingCellCount: number;
  /** Number of market cells with declining heat. */
  readonly decliningCellCount: number;
  /** Seasonal pressure factor (0-1). */
  readonly seasonalPressure: number;
  /** Policy signal strength (0-1). */
  readonly policyPressure: number;
}

/** Rival broker activity summary for one day. */
export interface RivalActivitySummary {
  /** Number of rival repricing events. */
  readonly repricingCount: number;
  /** Number of rival broker follow-up actions. */
  readonly followupCount: number;
  /** Average price change magnitude (万元). */
  readonly avgPriceChange: number;
  /** Number of rival listings that went active. */
  readonly newListings: number;
  /** Number of rival listings that went inactive. */
  readonly withdrawnListings: number;
}

/** Customer demand summary for one day. */
export interface CustomerDemandSummary {
  /** Number of customer comparison events. */
  readonly comparisonCount: number;
  /** Number of attention shift events. */
  readonly attentionShiftCount: number;
  /** Average customer urgency across active customers. */
  readonly avgUrgency: number;
  /** Number of customers who churned. */
  readonly churnedCount: number;
  /** Number of new customer activations. */
  readonly newActivations: number;
}

/** Owner perception summary for one day. */
export interface OwnerPerceptionSummary {
  /** Number of owners who perceived market pressure. */
  readonly pressurePerceivedCount: number;
  /** Average pressure delta across affected owners. */
  readonly avgPressureDelta: number;
  /** Number of owners with increased urgency. */
  readonly urgencyIncreasedCount: number;
  /** Number of owners with decreased patience. */
  readonly patienceDecreasedCount: number;
}

/** Opportunity pressure summary for one day. */
export interface OpportunityPressureSummary {
  /** Number of opportunities where fit changed. */
  readonly fitChangeCount: number;
  /** Number of opportunities where readiness changed. */
  readonly readinessChangeCount: number;
  /** Number of new opportunities formed. */
  readonly newOpportunities: number;
  /** Number of opportunities lost. */
  readonly lostOpportunities: number;
}

/** Recommendation pressure summary for one day. */
export interface RecommendationPressureSummary {
  /** Number of recommendation direction changes. */
  readonly directionChangeCount: number;
  /** Number of actionable pressure candidates generated. */
  readonly pressureCandidateCount: number;
  /** Number of escalated cases. */
  readonly escalatedCount: number;
}

/** Compressed world runtime summary for one day. */
export interface BigWorldRuntimeSummary {
  /** Day this summary represents. */
  readonly day: number;
  /** Total causal events emitted this day. */
  readonly totalEvents: number;
  /** Total state mutations this day. */
  readonly totalMutations: number;
  /** Market environment summary. */
  readonly market: MarketEnvironmentSummary;
  /** Rival activity summary. */
  readonly rivals: RivalActivitySummary;
  /** Customer demand summary. */
  readonly customers: CustomerDemandSummary;
  /** Owner perception summary. */
  readonly owners: OwnerPerceptionSummary;
  /** Opportunity pressure summary. */
  readonly opportunities: OpportunityPressureSummary;
  /** Recommendation pressure summary. */
  readonly recommendations: RecommendationPressureSummary;
  /** Whether any phase produced errors. */
  readonly hadErrors: boolean;
  /** Error messages if any. */
  readonly errors: readonly string[];
}

// ---------------------------------------------------------------------------
// BigWorldTickReceipt — full output of one day tick
// ---------------------------------------------------------------------------

/** Receipt from one BigWorldClock tick. Contains everything downstream needs. */
export interface BigWorldTickReceipt {
  /** Day the tick settled. */
  readonly day: number;
  /** Day number after tick (next day). */
  readonly nextDay: number;
  /** Phase results in execution order. */
  readonly phaseResults: readonly BigWorldTickPhaseResult[];
  /** All daily events emitted (flat list across phases). */
  readonly allEvents: readonly BigWorldDailyEvent[];
  /** Compressed summary. */
  readonly summary: BigWorldRuntimeSummary;
  /** Causal ledger events to append to GameState.worldCausalEvents. */
  readonly causalEventsToAppend: readonly WorldCausalEvent[];
  /** Source ingestion receipt (if source records were provided). */
  readonly sourceIngestionReceipt?: import('./sourceIngestionAdapter.js').SourceIngestionReceipt;
  /** Economy receipt — resource snapshot and source records for this day. */
  readonly economyReceipt?: import('./economicReceiptWiring.js').EconomyReceipt;
  /** Total tick duration in microseconds (for performance tracking). */
  readonly durationUs: number;
}

// ---------------------------------------------------------------------------
// ColdLedgerSummary — compressed source-level aggregates for projections
// ---------------------------------------------------------------------------

/**
 * Cold ledger summary: source-level aggregates that survive compaction.
 * When daily events are compacted into cold storage, this summary preserves
 * the source-level evidence that projections need to explain "why this UI
 * judgment was made."
 */
export interface ColdLedgerSummary {
  /** Day range this summary covers. */
  readonly fromDay: number;
  readonly toDay: number;
  /** Total source records ingested in this range. */
  readonly totalSourceRecords: number;
  /** Total causal events produced from sources. */
  readonly totalCausalEventsFromSources: number;
  /** Source records grouped by kind with counts. */
  readonly bySourceKind: ReadonlyMap<string, {
    readonly count: number;
    readonly causalEventsProduced: number;
  }>;
  /** Most recent sourceRecordId per sourceKind (for traceability). */
  readonly latestSourceIdByKind: ReadonlyMap<string, string>;
  /** Most recent sourceReplayKey per sourceKind. */
  readonly latestReplayKeyByKind: ReadonlyMap<string, string>;
  /** Total phase-generated events (non-source). */
  readonly totalPhaseEvents: number;
  /** Total mutations. */
  readonly totalMutations: number;
}

// ---------------------------------------------------------------------------
// WorldRuntimeCompactionPolicy — controls event log boundedness
// ---------------------------------------------------------------------------

/** Compaction policy for the big world runtime event log. */
export interface WorldRuntimeCompactionPolicy {
  /** Maximum number of daily events to keep in history before compaction. */
  readonly maxDailyEvents: number;
  /** Maximum number of summary days to keep before compaction. */
  readonly maxSummaryDays: number;
  /** Maximum number of causal events to keep in the runtime causal chain before trimming. */
  readonly maxCausalRefsPerEvent: number;
  /** Days after which old daily events are compacted into summary. */
  readonly compactAfterDays: number;
  /** Maximum total events in worldCausalEvents before trimming oldest root causes. */
  readonly maxTotalCausalEvents: number;
}

/** Default compaction policy — conservative bounds. */
export const DEFAULT_COMPACTION_POLICY: WorldRuntimeCompactionPolicy = Object.freeze({
  maxDailyEvents: 500,
  maxSummaryDays: 60,
  maxCausalRefsPerEvent: 8,
  compactAfterDays: 30,
  maxTotalCausalEvents: 2000,
});

// ---------------------------------------------------------------------------
// BigWorldRuntimeState — persistent runtime state on GameState
// ---------------------------------------------------------------------------

/**
 * Single day's resource snapshot entry in the economic ledger.
 * Persisted in GameState for deterministic replay.
 */
export interface EconomicResourceLedgerEntry {
  /** Day this snapshot represents. */
  readonly day: number;
  /** Player energy consumed this day. */
  readonly playerEnergyConsumed: number;
  /** Player energy replenished this day. */
  readonly playerEnergyReplenished: number;
  /** Promotion budget consumed this day. */
  readonly promotionBudgetConsumed: number;
  /** Promotion budget allocated this day. */
  readonly promotionBudgetAllocated: number;
  /** Org credit earned this day. */
  readonly orgCreditEarned: number;
  /** Org credit spent this day. */
  readonly orgCreditSpent: number;
  /** Customer attention gained this day. */
  readonly customerAttentionGained: number;
  /** Customer attention lost this day. */
  readonly customerAttentionLost: number;
  /** Customer attention migrated this day. */
  readonly customerAttentionMigrated: number;
  /** Owner trust net change this day. */
  readonly ownerTrustNet: number;
  /** Owner patience net change this day. */
  readonly ownerPatienceNet: number;
  /** Rival actions this day. */
  readonly rivalActionsToday: number;
  /** Rival resource competed this day. */
  readonly rivalResourceCompeted: number;
  /** Replay key for deterministic verification. */
  readonly replayKey: string;
}

/**
 * Traceable action resource receipt — records a single action's resource impact.
 * Links action spend/refund and relation effects to source records for full traceability.
 * Persisted in BigWorldRuntimeState for deterministic replay.
 */
export interface ActionResourceReceipt {
  /** Day this receipt represents. */
  readonly day: number;
  /** Action ID that caused this resource change. */
  readonly actionId: string;
  /** Case ID affected. */
  readonly caseId: string;
  /** Energy consumed by this action. */
  readonly energyCost: number;
  /** Promotion budget consumed by this action. */
  readonly budgetCost: number;
  /** Trust delta from this action. */
  readonly trustDelta: number;
  /** Patience delta from this action. */
  readonly patienceDelta: number;
  /** Source record ID for traceability. */
  readonly sourceRecordId: string;
  /** Replay key for deterministic verification. */
  readonly replayKey: string;
}

/** Autonomous world runtime state. Lives on GameState.bigWorldRuntime. */
export interface BigWorldRuntimeState {
  /** Current compaction policy. */
  readonly compactionPolicy: WorldRuntimeCompactionPolicy;
  /** Day number of the last completed tick. */
  lastTickDay: number;
  /** Daily event history (newest first). Bounded by compaction policy. */
  dailyEvents: BigWorldDailyEvent[];
  /** Daily summaries (newest first). Bounded by compaction policy. */
  dailySummaries: BigWorldRuntimeSummary[];
  /** Cold ledger summaries (newest first). Aggregated source-level evidence. */
  coldLedgerSummaries: ColdLedgerSummary[];
  /**
   * Economic resource ledger — accumulated daily resource snapshots.
   * Grows each tick; bounded by maxLedgerDays from compaction policy.
   * Used by Round 18 gates to verify resource dynamics over 7/14/30/60 day horizons.
   */
  economicResourceLedger: EconomicResourceLedgerEntry[];
  /**
   * Action resource receipts — traceable records of action spend/refund + relation effects.
   * Each entry links to a sourceRecordId for full traceability through the causal chain.
   * Grows with player actions; bounded by same policy as daily events.
   */
  actionResourceReceipts: ActionResourceReceipt[];
  /** Total events emitted since game start. Monotonic. */
  totalEventsEmitted: number;
  /** Total mutations since game start. Monotonic. */
  totalMutationsEmitted: number;
  /** Tick count since game start. */
  tickCount: number;
  /** Errors encountered during ticks (most recent first, bounded). */
  recentErrors: string[];
}

// ---------------------------------------------------------------------------
// BigWorldClockInput — input for runBigWorldDayTick
// ---------------------------------------------------------------------------

/** Input for the big world day tick. Adapts existing GameState shape. */
export interface BigWorldClockInput {
  /** Current simulation day (the day being settled). */
  readonly settledDay: number;
  /** Run seed for deterministic operations. */
  readonly runSeed: number;
  /** Market cells (from GameState.markets). */
  readonly marketCells: readonly { readonly id: string; readonly name: string; readonly demandHeat: number; readonly supplyPressure: number; readonly competitivePressure: number; readonly sentiment: number }[];
  /** Active cases (from GameState.cases, filtered to status === 'active'). */
  readonly activeCases: readonly { readonly id: string; readonly title: string; readonly district: string; readonly marketCellId: string; readonly trust: number; readonly patience: number; readonly urgency: number; readonly heat: number; readonly competitiveness: number; readonly d1: number; readonly d3: number; readonly ownerName: string; readonly windowDays: number; readonly personality: string }[];
  /** Active opportunities (from GameState.opportunities, filtered to status === 'active'). */
  readonly activeOpportunities: readonly { readonly id: string; readonly caseId: string; readonly customerId: string; readonly customerName: string; readonly fit: number; readonly intent: number; readonly confidence: number; readonly stageIndex: number; readonly stagnationTicks: number }[];
  /** Rival listings (from GameState.marketShadow.rivalListings). */
  readonly rivalListings: readonly { readonly id: string; readonly storeId: string; readonly title: string; readonly district: string; readonly marketCellId: string; readonly segment: string; readonly askPrice: number; readonly heat: number; readonly freshness: number; readonly status: string; readonly daysLeft: number }[];
  /** Rival stores (from GameState.marketShadow.rivalStores). */
  readonly rivalStores: readonly { readonly id: string; readonly name: string; readonly type: string; readonly style: string; readonly districtFocus: readonly string[]; readonly leadCapturePower: number; readonly sellerInfluencePower: number; readonly pricingPressurePower: number; readonly activityHeat: number }[];
  /** Customer states (from GameState.customerStates). */
  readonly customerStates: readonly { readonly customerId: string; readonly status: string; readonly fatigue: number; readonly churnRisk: number; readonly activeCaseIds: readonly string[] }[];
  // --- Shadow entity inputs (from bootstrap, for hundreds-scale runtime) ---
  /** Shadow owner priors — allows runtime to process 50+ owners per day. */
  readonly shadowOwnerPriors?: readonly { readonly priorId: string; readonly type: string; readonly priceAnchorRigidity: number; readonly expectedTrustBaseline: number; readonly expectedPatienceBaseline: number; readonly expectedUrgencyBaseline: number; readonly perceptionLagDays: number }[];
  /** Shadow cases — synthetic cases derived from owner priors + listings for broader coverage. */
  readonly shadowCases?: readonly { readonly id: string; readonly marketCellId: string; readonly district: string; readonly heat: number; readonly trust: number; readonly patience: number; readonly urgency: number; readonly windowDays: number; readonly ownerName: string }[];
  /** ACN profiles — behavioral profiles for rival broker phase expansion. */
  readonly acnProfiles?: readonly { readonly id: string; readonly name: string; readonly behavior: { readonly directAggression: number; readonly customerFollowupStrength: number; readonly priceReactionSpeed: number; readonly infoSpeed: number; readonly cooperationBias: number } }[];
  /** Existing runtime state (may be undefined for old saves). */
  readonly existingRuntime?: BigWorldRuntimeState;
  /** Existing world causal events (may be empty for old saves). */
  readonly existingCausalEvents?: readonly WorldCausalEvent[];
  /** Information source records for this day's ingestion (may be empty for old saves). */
  readonly sourceRecords?: readonly InformationSourceRecord[];
}
