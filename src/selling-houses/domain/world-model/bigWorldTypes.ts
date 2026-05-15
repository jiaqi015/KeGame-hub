// ---------------------------------------------------------------------------
// BigWorldTypes — layered world initialization contract
//
// Architecture:
//   BigWorldSpec              — declarative scale/domain/boundaries/caps/invariants
//   BigWorldBootstrap         — the full deterministic world, explicitly layered
//     .hiddenTruth            — world facts actors cannot see
//     .materializedEntities   — hot runtime entities
//     .coldAggregate          — compressed shadow/off-screen data
//     .openingPOV             — projection of hidden truth for the player actor
//     .causalBaseline         — seed surface + opening source records
//   BigWorldBootstrapSummary  — compact persistable summary (no raw arrays)
//   BigWorldRuntimeInitialState — typed input for Agent B runtime init
//   BigWorldNormalizedSave    — what old-save normalize can produce (summary + seed only)
//
// Hard constraints:
//   - domain/world-model/ must NOT import runtime/*, application/*, UI/*
//   - Same scenario + seed + scalePolicy → byte-identical bootstrap
//   - Hidden truth and actor-visible POV are structurally separated
//   - Old-save normalize must NOT fabricate hidden world
//   - Full bootstrap must NOT be used as UI projection
// ---------------------------------------------------------------------------

import type {
  MarketCellSnapshot,
  CityCycleState,
  ACNNetworkSnapshot,
  ListingInventorySnapshot,
  CustomerDemandFieldSnapshot,
  BrokerNetworkSnapshot,
  RecentWorldEvent,
} from './marketWorldTypes.js';
import type { AcnNetwork } from './acnNetworks.js';
import type { BrokerEntity } from './brokerPopulation.js';
import type { ListingPopulationEntity, HistoricalTransactionSummary } from './listingPopulation.js';
import type { CustomerDemandEntity, DemandListingAttention } from './customerDemandField.js';
import type { SourceKind } from './informationSourceTypes.js';
import type { MarketFormationState, MarketFormationSummary } from './marketFormationTypes.js';

// ════════════════════════════════════════════════════════════════════════════
// Source Refs — branded ID types for cross-entity provenance
// ════════════════════════════════════════════════════════════════════════════

/** Branded source ref: marks an ID as originating from the bootstrap. */
export type BootstrapSourceRef = string & { readonly __brand: 'BootstrapSourceRef' };

/** Source origin tag: which bootstrap layer produced this entity. */
export type SourceOrigin =
  | 'market_cell'
  | 'acn_network'
  | 'broker_population'
  | 'listing_population'
  | 'demand_field'
  | 'owner_prior'
  | 'demand_cluster'
  | 'historical_transaction'
  | 'opening_event'
  | 'player_broker';

/** Provenance record for any entity created during bootstrap. */
export interface EntityProvenance {
  /** The source ref that produced this entity. */
  readonly sourceRef: BootstrapSourceRef;
  /** Which bootstrap layer this entity belongs to. */
  readonly origin: SourceOrigin;
  /** The seed salt used to generate this entity (for debugging). */
  readonly generationSalt: string;
}

// ════════════════════════════════════════════════════════════════════════════
// BigWorldSpec — declarative configuration (unchanged)
// ════════════════════════════════════════════════════════════════════════════

export interface BigWorldScalePolicy {
  readonly minMarketCells: number;
  readonly maxMarketCells: number;
  readonly acnCount: number;
  readonly namedBrokersPerAcn: number;
  readonly shadowBrokersPerAcn: number;
  readonly shadowListingsPerCell: number;
  readonly directRivalListingsPerCell: number;
  readonly materializedCustomersPerCell?: number;
  readonly shadowAggregateClustersPerCell?: number;
  readonly ownerProfilePriorCount: number;
  readonly customerCaseRatio: number;
}

export interface BigWorldDomainConfig {
  readonly demandSegments: readonly string[];
  readonly priceBands: readonly { label: string; minPrice: number; maxPrice: number }[];
  readonly brokerStyles: readonly string[];
  readonly listingLayers: readonly string[];
}

export interface BigWorldHiddenBoundary {
  readonly maxInformationDelayDays: number;
  readonly maxOwnerPerceptionLagDays: number;
  readonly shadowSupplyVisible: boolean;
  readonly shadowDemandVisible: boolean;
  readonly rivalBrokerInternalsVisible: boolean;
}

export interface BigWorldVisibleBoundary {
  readonly playerListingsVisible: boolean;
  readonly directRivalListingsVisible: boolean;
  readonly namedRivalBrokersVisible: boolean;
  readonly aggregateDemandVisible: boolean;
  readonly recentWorldEventsVisible: boolean;
  readonly cityCycleVisible: boolean;
}

export interface BigWorldInvariants {
  readonly minMarketCells: number;
  readonly minRivalBrokers: number;
  readonly minComparableSupply: number;
  readonly minDemandUnits: number;
  readonly minOwnerProfilePriors: number;
  readonly minAcnNetworks: number;
  readonly deterministicReplay: boolean;
}

export interface BigWorldCaps {
  readonly maxNamedBrokers: number;
  readonly maxMaterializedCustomers: number;
  readonly maxMaterializedListings: number;
  readonly maxRecentWorldEvents: number;
}

export interface BigWorldSpec {
  readonly version: 1;
  readonly scale: BigWorldScalePolicy;
  readonly domain: BigWorldDomainConfig;
  readonly hiddenBoundary: BigWorldHiddenBoundary;
  readonly visibleBoundary: BigWorldVisibleBoundary;
  readonly invariants: BigWorldInvariants;
  readonly caps: BigWorldCaps;
}

// ════════════════════════════════════════════════════════════════════════════
// Owner Priors — what we know about owners before any interaction
// ════════════════════════════════════════════════════════════════════════════

export type OwnerProfilePriorType =
  | 'game_player' | 'strategy_swing' | 'emotional_hold' | 'high_risk失控'
  | 'strong_control' | 'rational_outsource' | 'confident_blind' | 'buddha_fantasy'
  | 'efficient_execute' | 'professional_coop' | 'fast_trial' | 'deal_dependent'
  | 'steady_pace' | 'rational_trust' | 'cautious_watch' | 'passive_fate'
  | 'market_savvy' | 'first_time_nervous' | 'investor_distant'
  | 'emotional_urgent' | 'rational_analyst';

export interface OwnerProfilePrior {
  readonly priorId: string;
  readonly type: OwnerProfilePriorType;
  readonly priceAnchorRigidity: number;
  readonly timeWindow: 'short' | 'long';
  readonly downMarketExperience: 'low' | 'high';
  readonly decisionStyle: 'self_decide' | 'guided_or_joint';
  readonly expectedTrustBaseline: number;
  readonly expectedPatienceBaseline: number;
  readonly expectedUrgencyBaseline: number;
  readonly priceElasticity: number;
  readonly perceptionLagDays: number;
  /** Provenance: how this prior was generated. */
  readonly provenance: EntityProvenance;
}

export interface OwnerExpectationAnchor {
  readonly anchorId: string;
  readonly caseId: string;
  readonly ownerId: string;
  readonly expectedPrice: number;
  readonly listingPrice: number;
  readonly bottomPrice: number;
  readonly marketReferencePrice: number;
  readonly expectationGapPct: number;
  readonly provenance: EntityProvenance;
}

export interface OwnerPerceptionLag {
  readonly lagId: string;
  readonly ownerId: string;
  readonly baseLagDays: number;
  readonly acnInfoSpeedModifier: number;
  readonly rigidityModifier: number;
  readonly effectiveLagDays: number;
  readonly provenance: EntityProvenance;
}

// ════════════════════════════════════════════════════════════════════════════
// Shadow Aggregate — cold compressed demand
// ════════════════════════════════════════════════════════════════════════════

export interface ShadowAggregateCluster {
  readonly clusterId: string;
  readonly marketCellId: string;
  readonly segment: string;
  readonly estimatedCustomerCount: number;
  readonly avgBudgetMidpoint: number;
  readonly layoutPreference: Readonly<Record<string, number>>;
  readonly aggregateUrgency: number;
  readonly aggregatePriceSensitivity: number;
  readonly provenance: EntityProvenance;
}

// ════════════════════════════════════════════════════════════════════════════
// SupportingInfoRecord — per-cell variable facility/environment data
// ════════════════════════════════════════════════════════════════════════════

/**
 * SupportingInfoRecord captures variable supplementary information per market cell.
 * Each cell has multiple supporting info records covering school, transit,
 * commercial, community, policy, noise, and building conditions.
 *
 * These records are:
 *   - Variable per cell (not static labels)
 *   - Capable of generating InformationSourceRecords
 *   - Used for source readiness coverage checks
 */
export interface SupportingInfoRecord {
  /** Unique deterministic ID. */
  readonly recordId: string;
  /** Market cell this info belongs to. */
  readonly marketCellId: string;
  /** Micro cell id within the parent cell (for sub-cell granularity). */
  readonly microCellId: string;
  /** Info category: school | transit | commercial | community | policy | noise | building | market_trend | rival_observation | customer_signal | owner_signal | broker_signal | transaction_signal | property | community_info | community_mgmt. */
  readonly category: 'school' | 'transit' | 'commercial' | 'community' | 'policy' | 'noise' | 'building' | 'market_trend' | 'rival_observation' | 'customer_signal' | 'owner_signal' | 'broker_signal' | 'transaction_signal' | 'property' | 'community_info' | 'community_mgmt';
  /** Specific signal type within category. */
  readonly signalType: string;
  /** Current strength 0-100. */
  readonly strength: number;
  /** Change delta (positive = improving, negative = declining). */
  readonly delta: number;
  /** Direction of change: 'improving' | 'stable' | 'declining'. */
  readonly direction: 'improving' | 'stable' | 'declining';
  /** Days since last update (0 = just updated). */
  readonly daysSinceUpdate: number;
  /** Source type: where this info came from. */
  readonly sourceType: 'government_notice' | 'platform_data' | 'broker_observation' | 'community_report' | 'media' | 'acn_internal';
  /** Whether this info is publicly visible or only internal. */
  readonly isPublic: boolean;
}

/**
 * MicroCell — a sub-division of a market cell for finer granularity.
 * Each micro cell represents a specific neighborhood or block within a market cell.
 */
export interface MicroCell {
  /** Unique ID: format "mc-{parentCellId}-{index}". */
  readonly microCellId: string;
  /** Parent market cell id. */
  readonly parentMarketCellId: string;
  /** Human-readable name. */
  readonly name: string;
  /** Micro-cell heat level 0-100. */
  readonly heat: number;
  /** Inventory pressure 0-100. */
  readonly inventoryPressure: number;
  /** Deal velocity 0-100. */
  readonly dealVelocity: number;
  /** Number of listings in this micro cell. */
  readonly listingCount: number;
}

// ════════════════════════════════════════════════════════════════════════════
// BigWorldBootstrap — layered deterministic world
// ════════════════════════════════════════════════════════════════════════════

/**
 * Canonical hidden truth: world facts that exist but actors may not see.
 * This layer is NEVER directly exposed to UI projection.
 */
export interface BigWorldHiddenTruth {
  /** City / market cycle state. */
  readonly cityCycle: CityCycleState;
  /** Market cells (>= 3). Each is a 板块/商圈. */
  readonly marketCells: readonly MarketCellSnapshot[];
  /** Micro cells — sub-divisions of market cells for finer granularity. */
  readonly microCells: readonly MicroCell[];
  /** ACN network snapshots (structural, not behavioral). */
  readonly acnNetworks: readonly ACNNetworkSnapshot[];
  /** Full ACN behavioral profiles — the real params behind each ACN. */
  readonly acnProfiles: readonly AcnNetwork[];
  /** Supporting info per cell — variable facility/environment data. */
  readonly supportingInfo: readonly SupportingInfoRecord[];
  /** Owner profile priors — what we know before any broker interaction. */
  readonly ownerProfilePriors: readonly OwnerProfilePrior[];
  /** Owner expectation anchors — initial price/value beliefs. */
  readonly ownerExpectationAnchors: readonly OwnerExpectationAnchor[];
  /** Owner perception lags — how fast each owner processes market signals. */
  readonly ownerPerceptionLags: readonly OwnerPerceptionLag[];
  /**
   * Market formation: classified pools and per-cell thickness.
   * Derived deterministically from existing entities.
   * Every entry has stable ID, provenance, replayKey.
   */
  readonly marketFormation: MarketFormationState;
}

/**
 * Materialized entities: the hot set the runtime directly operates on.
 * These are individually tracked, mutable during runtime.
 */
export interface BigWorldMaterializedEntities {
  /** All brokers: named rivals + shadow brokers + player broker. */
  readonly brokers: readonly BrokerEntity[];
  /** All listings: shadow + direct rival (player listings come from legacy). */
  readonly listings: readonly ListingPopulationEntity[];
  /** Materialized customers in the demand field. */
  readonly customers: readonly CustomerDemandEntity[];
  /** Customer-listing attention relations (empty at start). */
  readonly attentions: readonly DemandListingAttention[];
}

/**
 * Cold aggregate: compressed data for entities not individually tracked.
 * Agent B can read this for aggregate pressure, but cannot mutate.
 */
export interface BigWorldColdAggregate {
  /** Shadow demand clusters — aggregate demand per cell/segment. */
  readonly shadowDemandClusters: readonly ShadowAggregateCluster[];
  /** Historical transaction summaries — recent deals before player entered. */
  readonly historicalTransactions: readonly HistoricalTransactionSummary[];
}

/**
 * Opening POV: what the player actor can see at game start.
 * This is a PROJECTION of hidden truth, not the truth itself.
 * Agent B must NOT use hidden truth where openingPOV suffices.
 */
export interface BigWorldOpeningPOV {
  /** City cycle phase — visible to player. */
  readonly cityCycle: CityCycleState;
  /** Market cells — player can see cell-level data. */
  readonly marketCells: readonly MarketCellSnapshot[];
  /** ACN networks — player can see structural network data. */
  readonly acnNetworks: readonly ACNNetworkSnapshot[];
  /** Named rival brokers — player knows who they are. */
  readonly namedRivalBrokers: readonly BrokerEntity[];
  /** Direct rival listings — player can see these on the market. */
  readonly directRivalListings: readonly ListingPopulationEntity[];
  /** Aggregate demand segments — player sees market-level demand, not individual customers. */
  readonly aggregateDemandSegments: readonly string[];
  /** Recent world events — player sees what happened before they entered. */
  readonly recentWorldEvents: readonly RecentWorldEvent[];
  /** Player's own broker. */
  readonly playerBroker: BrokerEntity;
}

/**
 * Causal baseline: seed surface and opening source records.
 * Used for deterministic replay and causal chain tracing.
 */
export interface BigWorldCausalBaseline {
  /** The seed used to generate this bootstrap. */
  readonly seed: number;
  /** Scenario name. */
  readonly scenarioName: string;
  /** Difficulty id. */
  readonly difficultyId: string;
  /** Scale policy used. */
  readonly scalePolicy: BigWorldScalePolicy;
  /** The spec this bootstrap was generated from. */
  readonly spec: BigWorldSpec;
  /** Recent world events (opening source records). */
  readonly recentWorldEvents: readonly RecentWorldEvent[];
}

/**
 * BigWorldBootstrap — the complete layered world.
 *
 * Same scenario + seed + scalePolicy → byte-identical bootstrap.
 *
 * Structural separation:
 *   hiddenTruth        → world facts, NOT directly shown to player
 *   materializedEntities → hot runtime entities, individually tracked
 *   coldAggregate      → compressed shadow data, read-only
 *   openingPOV         → projection of hidden truth for the player
 *   causalBaseline     → seed surface for replay
 */
export interface BigWorldBootstrap {
  readonly version: 1;

  /** Layer 1: canonical hidden truth (world facts actors can't see). */
  readonly hiddenTruth: BigWorldHiddenTruth;

  /** Layer 2: materialized entities (hot runtime set). */
  readonly materializedEntities: BigWorldMaterializedEntities;

  /** Layer 3: cold aggregate (compressed shadow data). */
  readonly coldAggregate: BigWorldColdAggregate;

  /** Layer 4: player-visible opening POV (projection, NOT the truth). */
  readonly openingPOV: BigWorldOpeningPOV;

  /** Layer 5: causal baseline (seed surface + source records). */
  readonly causalBaseline: BigWorldCausalBaseline;

  /**
   * Backward-compatible MarketOpeningSnapshot.
   * This is a child/adaptor derived from the layered bootstrap.
   * New consumers should prefer the layered fields above.
   */
  readonly marketOpeningSnapshot: {
    readonly version: 1;
    readonly seed: number;
    readonly scenarioName: string;
    readonly difficultyId: string;
    readonly playerCaseCount: number;
    readonly cityCycle: CityCycleState;
    readonly marketCells: readonly MarketCellSnapshot[];
    readonly acnNetworks: readonly ACNNetworkSnapshot[];
    readonly listingInventory: ListingInventorySnapshot;
    readonly customerDemand: CustomerDemandFieldSnapshot;
    readonly brokerNetwork: BrokerNetworkSnapshot;
    readonly recentWorldEvents: readonly RecentWorldEvent[];
  };
}

// ════════════════════════════════════════════════════════════════════════════
// BigWorldBootstrapSummary — persistable summary
// ════════════════════════════════════════════════════════════════════════════

export interface BigWorldBootstrapSummary {
  readonly version: 1;
  readonly seed: number;
  readonly scenarioName: string;
  readonly difficultyId: string;
  readonly playerCaseCount: number;

  readonly marketCellCount: number;
  readonly acnNetworkCount: number;
  readonly namedBrokerCount: number;
  readonly shadowBrokerCount: number;
  readonly totalBrokerCount: number;
  readonly materializedListingCount: number;
  readonly shadowListingCount: number;
  readonly directRivalListingCount: number;
  readonly totalListingCount: number;
  readonly materializedCustomerCount: number;
  readonly shadowDemandClusterCount: number;
  readonly totalDemandUnitCount: number;
  readonly ownerProfilePriorCount: number;
  readonly ownerExpectationAnchorCount: number;
  readonly ownerPerceptionLagCount: number;
  readonly historicalTransactionCount: number;
  readonly recentWorldEventCount: number;
  readonly attentionRelationCount: number;

  readonly invariantCheck: {
    readonly marketCellsGte3: boolean;
    readonly rivalBrokersGte8: boolean;
    readonly comparableSupplyGte20: boolean;
    readonly demandUnitsGte60: boolean;
    readonly ownerProfilePriorsGte3: boolean;
    readonly acnNetworksGte3: boolean;
  };

  /** Scale manifest: quantitative summary + diversity coverage. */
  readonly scaleManifest: ScaleManifest;

  readonly marketCellIds: readonly string[];
  readonly acnNetworkIds: readonly string[];
  readonly namedBrokerIds: readonly string[];
  readonly ownerProfilePriorIds: readonly string[];

  /** Market formation summary: pool distributions and cell thickness. */
  readonly marketFormation: MarketFormationSummary;
}

// ════════════════════════════════════════════════════════════════════════════
// DiversityManifest — structural diversity coverage report
// ════════════════════════════════════════════════════════════════════════════

/**
 * DiversityManifest records the structural diversity of the generated world.
 * It is computed from actual generated entities, not from the spec.
 *
 * Each field is either a count (unique values) or a distribution map.
 * A gate can assert minimum diversity thresholds.
 */
export interface DiversityManifest {
  /** Owner archetype diversity: how many distinct OwnerProfilePriorType values appear. */
  readonly ownerArchetypeDiversity: number;
  /** Listing type diversity: how many distinct layout values appear. */
  readonly listingTypeDiversity: number;
  /** Price band diversity: how many distinct priceBand values appear. */
  readonly priceBandDiversity: number;
  /** Demand segment diversity: how many distinct demand segments appear across customers + cold clusters. */
  readonly demandSegmentDiversity: number;
  /** Broker style diversity: how many distinct BrokerStyle values appear. */
  readonly brokerStyleDiversity: number;
  /** Market cell count (for cross-cell diversity). */
  readonly marketCellCount: number;

  /** Owner type distribution: OwnerProfilePriorType → count. */
  readonly ownerTypeDistribution: Readonly<Record<string, number>>;
  /** Listing layout distribution: layout string → count. */
  readonly listingLayoutDistribution: Readonly<Record<string, number>>;
  /** Price band distribution: priceBand string → count. */
  readonly priceBandDistribution: Readonly<Record<string, number>>;
  /** Customer segment distribution: segment string → count. */
  readonly customerSegmentDistribution: Readonly<Record<string, number>>;
  /** Broker style distribution: BrokerStyle → count. */
  readonly brokerStyleDistribution: Readonly<Record<string, number>>;
  /** Market cell distribution: cellId → listing count. */
  readonly marketCellDistribution: Readonly<Record<string, number>>;

  /** Hot/cold split: materialized vs aggregate demand units. */
  readonly hotColdSplit: {
    readonly materializedCustomers: number;
    readonly shadowClusterUnits: number;
    readonly totalDemandUnits: number;
    readonly materializedListingCount: number;
    readonly shadowListingCount: number;
  };
}

// ════════════════════════════════════════════════════════════════════════════
// ScaleManifest — quantitative summary of the generated world
// ════════════════════════════════════════════════════════════════════════════

/**
 * ScaleManifest provides a compact, human-readable quantitative summary
 * of the generated world. Includes diversity manifest for structural checks.
 */
/**
 * SourceReadinessCoverage tracks which SourceKind categories are
 * representable by the generated supporting info and bootstrap data.
 */
export interface SourceReadinessCoverage {
  /** Total supporting info records generated. */
  readonly totalSupportingInfoRecords: number;
  /** Number of distinct categories covered. */
  readonly categoryCoverage: number;
  /** Which SourceKind categories have at least one supporting info record. */
  readonly coveredSourceKinds: readonly SourceKind[];
  /** Coverage percentage (covered / total possible source kinds). */
  readonly coveragePct: number;
  /** Per-category counts. */
  readonly categoryCounts: Readonly<Record<string, number>>;
}

export interface ScaleManifest {
  readonly totalListings: number;
  readonly totalOwners: number;
  readonly totalCustomers: number;
  readonly totalBrokers: number;
  readonly marketCells: number;
  readonly microCells: number;
  readonly acnNetworks: number;
  readonly supportingInfoCount: number;
  readonly historicalTransactionCount: number;

  readonly diversityCoverage: DiversityManifest;
  readonly sourceReadinessCoverage: SourceReadinessCoverage;

  // ── Scale contract metadata ──
  /** Profile identifier (e.g. 'five-x-city-level-v1'). */
  readonly scaleProfileId: string;
  /** Contract version — bumped when thresholds or semantics change. */
  readonly scaleContractVersion: number;

  /** Whether the hundred-scale thresholds are met. */
  readonly meetsHundredScaleThresholds: {
    readonly listingsGte100: boolean;
    readonly ownersGte100: boolean;
    readonly customersGte300: boolean;
    readonly marketCellsGte5: boolean;
    readonly acnNetworksGte3: boolean;
    readonly brokersGte20: boolean;
  };

  /** Whether the mega-scale thresholds are met. */
  readonly meetsMegaScaleThresholds: {
    readonly listingsGte300: boolean;
    readonly ownersGte300: boolean;
    readonly customersGte1000: boolean;
    readonly brokersGte60: boolean;
    readonly marketCellsGte8: boolean;
    readonly acnNetworksGte5: boolean;
  };

  /** Whether the super-market-scale thresholds are met (Round 12). */
  readonly meetsSuperMarketScaleThresholds: {
    readonly listingsGte300: boolean;
    readonly ownersGte300: boolean;
    readonly customersGte1000: boolean;
    readonly brokersGte60: boolean;
    readonly marketCellsGte8: boolean;
    readonly microCellsGte24: boolean;
    readonly acnNetworksGte5: boolean;
    readonly supportingInfoGte80: boolean;
  };

  /** Whether the market-mega-scale thresholds are met (Round 15). */
  readonly meetsMarketMegaScaleThresholds: {
    readonly listingsGte500: boolean;
    readonly ownersGte500: boolean;
    readonly customersGte3000: boolean;
    readonly brokersGte100: boolean;
    readonly marketCellsGte20: boolean;
    readonly microCellsGte60: boolean;
    readonly acnNetworksGte7: boolean;
    readonly supportingInfoGte160: boolean;
    readonly historicalTransactionsGte50: boolean;
  };

  /** Whether the five-x-scale thresholds are met (Round 19). */
  readonly meetsFiveXScaleThresholds: {
    readonly listingsGte4000: boolean;
    readonly ownersGte2500: boolean;
    readonly customersGte21000: boolean;
    readonly brokersGte750: boolean;
    readonly marketCellsGte100: boolean;
    readonly microCellsGte300: boolean;
    readonly acnNetworksGte32: boolean;
    readonly supportingInfoGte800: boolean;
    readonly historicalTransactionsGte300: boolean;
  };

  /** Whether all five-x-scale thresholds are met. */
  readonly isFiveXScale: boolean;

  /** Actual entity counts for five-x verification (always populated). */
  readonly actualFiveXCounts: {
    readonly listings: number;
    readonly owners: number;
    readonly customers: number;
    readonly brokers: number;
    readonly marketCells: number;
    readonly microCells: number;
    readonly acnNetworks: number;
    readonly supportingInfo: number;
    readonly historicalTransactions: number;
    readonly customerPools: number;
    readonly brokerPools: number;
    readonly orgPools: number;
  };
}

// ════════════════════════════════════════════════════════════════════════════
// BigWorldRuntimeInitialState — typed input for Agent B
// ════════════════════════════════════════════════════════════════════════════

/**
 * BigWorldRuntimeInitialState — what Agent B needs to initialize runtime.
 *
 * This is a SUBSET of the bootstrap, deliberately shaped for runtime use:
 *   - seed surface (for deterministic runtime)
 *   - materialized entities (for runtime tick)
 *   - cold aggregate (for pressure estimation)
 *   - opening POV (for player-facing projection)
 *
 * Agent B must NOT reach into hiddenTruth directly.
 * Agent B must NOT treat openingPOV as the full world.
 *
 * Constructed from BigWorldBootstrap via buildRuntimeInitialState().
 */
export interface BigWorldRuntimeInitialState {
  /** Seed for deterministic runtime initialization. */
  readonly seed: number;
  /** Difficulty id. */
  readonly difficultyId: string;

  // --- Materialized entities (hot) ---
  /** All brokers (named + shadow). */
  readonly brokers: readonly BrokerEntity[];
  /** All listings (shadow + rival). */
  readonly listings: readonly ListingPopulationEntity[];
  /** Materialized customers. */
  readonly customers: readonly CustomerDemandEntity[];
  /** Initial attentions (empty). */
  readonly attentions: readonly DemandListingAttention[];

  // --- Cold aggregate ---
  readonly shadowDemandClusters: readonly ShadowAggregateCluster[];
  readonly historicalTransactions: readonly HistoricalTransactionSummary[];

  // --- Opening POV ---
  readonly openingPOV: BigWorldOpeningPOV;

  // --- Seed surface for sub-generators ---
  /** Base seed for daily ecosystem proposal generation. */
  readonly ecosystemSeed: number;
  /** Base seed for causal event generation. */
  readonly causalSeed: number;
}

// ════════════════════════════════════════════════════════════════════════════
// BigWorldNormalizedSave — what old-save normalize can produce
// ════════════════════════════════════════════════════════════════════════════

/**
 * BigWorldNormalizedSave — the ONLY output of old-save normalization.
 *
 * Contains:
 *   - summary (persistable counts/refs)
 *   - seed (for deterministic re-bootstrap)
 *   - validity flag
 *
 * Does NOT contain:
 *   - hidden truth (no acnProfiles, no owner priors, no full entities)
 *   - materialized entities (no broker/listing/customer objects)
 *   - opening POV (no projection)
 *
 * Old saves cannot fabricate hidden world data.
 * The runtime must re-bootstrap from seed + summary to get full state.
 */
export interface BigWorldNormalizedSave {
  /** Whether normalization succeeded. */
  readonly valid: boolean;
  /** The summary extracted from the old save. */
  readonly summary: BigWorldBootstrapSummary | null;
  /** The seed for re-bootstrap (from old save's runContext). */
  readonly seed: number | null;
  /** The MarketOpeningSnapshot from the old save (if present). */
  readonly marketOpeningSnapshot: {
    readonly version: 1;
    readonly seed: number;
    readonly scenarioName: string;
    readonly difficultyId: string;
    readonly playerCaseCount: number;
    readonly cityCycle: CityCycleState;
    readonly marketCells: readonly MarketCellSnapshot[];
    readonly acnNetworks: readonly ACNNetworkSnapshot[];
    readonly listingInventory: ListingInventorySnapshot;
    readonly customerDemand: CustomerDemandFieldSnapshot;
    readonly brokerNetwork: BrokerNetworkSnapshot;
    readonly recentWorldEvents: readonly RecentWorldEvent[];
  } | null;
}
