// ---------------------------------------------------------------------------
// marketFormationTypes.ts — Market Formation structural types
//
// Defines pool states and cell thickness that make the world behave like
// a real market: listings flow through states, owners have urgency profiles,
// customers have segment-driven behavior, brokers have resource constraints,
// and market cells have measurable supply/demand thickness.
//
// Every entity has:
//   - stable ID (deterministic from seed)
//   - source origin (which bootstrap layer produced it)
//   - replayKey (for deterministic replay)
//   - sourceRef (link to source entity)
//
// These types are derived at bootstrap time from existing entity data.
// They do NOT create new runtime state — they classify and aggregate
// what already exists.
//
// Hard constraints:
//   - domain/world-model/ must NOT import runtime/*, application/*, UI/*
//   - Same seed → byte-identical market formation
//   - No Date.now, Math.random, fetch, or LLM
// ---------------------------------------------------------------------------

import type { EntityProvenance, BootstrapSourceRef } from './bigWorldTypes.js';
import type { MarketEconomyState, MarketEconomySummary } from './marketEconomyTypes.js';

// ════════════════════════════════════════════════════════════════════════════
// Listing Pool States — lifecycle classification of listings
// ════════════════════════════════════════════════════════════════════════════

/**
 * Listing pool state: where a listing is in its market lifecycle.
 *
 * Each state has different source/causal implications:
 *   - fresh: just listed, high visibility, active source generation
 *   - hot: high competitiveness/liquidity, active customer attention
 *   - cold: low liquidity, stale, potential price reduction needed
 *   - price_reduced: owner conceded, signal for market pressure
 *   - stale: daysOnMarket > 30, liquidity declining, owner patience tested
 *   - scarce: no comparable supply in cell/priceBand, high leverage
 */
export type ListingPoolState =
  | 'fresh'           // daysOnMarket <= 7, liquidity >= 60
  | 'hot'             // competitiveness >= 70 AND liquidity >= 60
  | 'warm'            // 30 <= competitiveness < 70, liquidity >= 40
  | 'cold'            // liquidity < 40 OR competitiveness < 30
  | 'price_reduced'   // askPrice < marketPrice * 0.95 (concession signal)
  | 'stale'           // daysOnMarket > 30, liquidity < 50
  | 'scarce';         // no comparable supply in same cell+priceBand

export interface ListingPoolEntry {
  /** Deterministic ID: `lpe-{listingId}`. */
  readonly entryId: string;
  /** Source listing ID. */
  readonly listingId: string;
  /** Current pool state. */
  readonly state: ListingPoolState;
  /** Market cell this listing belongs to. */
  readonly marketCellId: string;
  /** Price band. */
  readonly priceBand: string;
  /** Layout. */
  readonly layout: string;
  /** Days on market at bootstrap time. */
  readonly daysOnMarket: number;
  /** Competitiveness score 0-100. */
  readonly competitiveness: number;
  /** Liquidity score 0-100. */
  readonly liquidity: number;
  /** Whether this listing has comparable supply in same cell+priceBand. */
  readonly hasComparableSupply: boolean;
  /** Number of active competitors in same cell+priceBand. */
  readonly competitorCount: number;
  /** Provenance: how this entry was generated. */
  readonly provenance: EntityProvenance;
  /** Replay key for deterministic replay. */
  readonly replayKey: string;
}

// ════════════════════════════════════════════════════════════════════════════
// Owner Pool States — urgency and cooperation classification
// ════════════════════════════════════════════════════════════════════════════

/**
 * Owner pool state: urgency and cooperation profile.
 *
 * Derived from OwnerProfilePrior + OwnerExpectationAnchor.
 * Each state affects what source records can be generated and
 * how the owner responds to market signals.
 */
export type OwnerPoolState =
  | 'urgent'          // expectedUrgencyBaseline >= 70 OR timeWindow === 'short'
  | 'watchful'        // cautious_watch OR market_savvy OR rational_analyst
  | 'stubborn'        // priceAnchorRigidity >= 75 OR strong_control OR confident_blind
  | 'cooperative'     // professional_coop OR efficient_execute OR rational_outsource
  | 'upgrading'       // timeWindow === 'long' AND downMarketExperience === 'high'
  | 'financial_stress' // emotional_urgent OR high_risk失控 OR deal_dependent
  | 'emotional';      // emotional_hold OR buddha_fantasy OR passive_fate

export interface OwnerPoolEntry {
  /** Deterministic ID: `ope-{priorId}`. */
  readonly entryId: string;
  /** Source owner prior ID. */
  readonly priorId: string;
  /** Current pool state. */
  readonly state: OwnerPoolState;
  /** Associated case ID (if any). */
  readonly caseId?: string;
  /** Market cell ID (derived from case or anchor). */
  readonly marketCellId?: string;
  /** Price anchor rigidity 0-100. */
  readonly priceAnchorRigidity: number;
  /** Expected urgency baseline 0-100. */
  readonly expectedUrgency: number;
  /** Expected patience baseline 0-100. */
  readonly expectedPatience: number;
  /** Price elasticity 0-1. */
  readonly priceElasticity: number;
  /** Provenance. */
  readonly provenance: EntityProvenance;
  /** Replay key. */
  readonly replayKey: string;
}

// ════════════════════════════════════════════════════════════════════════════
// Customer Pool States — segment and urgency classification
// ════════════════════════════════════════════════════════════════════════════

/**
 * Customer pool state: segment-driven behavior classification.
 *
 * Derived from CustomerDemandEntity preference weights and urgency.
 * Each state affects how the customer responds to listings and market signals.
 */
export type CustomerPoolState =
  | 'first_home'        // low_total_price weight > 50, budget < 400
  | 'upgrade'           // improvement weight > 50, budget >= 400
  | 'school_district'   // school weight > 60
  | 'investment'        // liquidity OR rent_option weight > 50
  | 'budget_sensitive'  // priceSensitivity >= 75
  | 'time_sensitive'    // urgency >= 75
  | 'hesitant';         // decisionStyle === 'cautious' AND urgency < 40

export interface CustomerPoolEntry {
  /** Deterministic ID: `cpe-{customerId}`. */
  readonly entryId: string;
  /** Source customer ID. */
  readonly customerId: string;
  /** Current pool state. */
  readonly state: CustomerPoolState;
  /** Target market cell ID. */
  readonly targetMarketCellId: string;
  /** Budget range. */
  readonly budgetMin: number;
  readonly budgetMax: number;
  /** Urgency 0-100. */
  readonly urgency: number;
  /** Price sensitivity 0-100. */
  readonly priceSensitivity: number;
  /** Decision style. */
  readonly decisionStyle: string;
  /** Provenance. */
  readonly provenance: EntityProvenance;
  /** Replay key. */
  readonly replayKey: string;
}

// ════════════════════════════════════════════════════════════════════════════
// Broker Pool States — resource and capability classification
// ════════════════════════════════════════════════════════════════════════════

/**
 * Broker pool state: resource constraint and capability profile.
 *
 * Derived from BrokerEntity energy, pool sizes, and style.
 * Each state affects what actions the broker can take and how
 * they generate source records.
 */
export type BrokerPoolState =
  | 'listing_maintenance' // listingPoolSize >= 6, actionBias < 0
  | 'customer_hunting'    // customerPoolSize >= 6, actionBias > 10
  | 'cooperation_focused' // co_sale_builder OR local_connector style
  | 'competition_focused' // price_attacker OR speed_runner style
  | 'resource_constrained' // energyBudget < 40 OR listingPoolSize < 3
  | 'balanced';           // none of the above dominant

export interface BrokerPoolEntry {
  /** Deterministic ID: `bpe-{brokerId}`. */
  readonly entryId: string;
  /** Source broker ID. */
  readonly brokerId: string;
  /** Current pool state. */
  readonly state: BrokerPoolState;
  /** ACN ID. */
  readonly acnId: string;
  /** Covered market cell IDs. */
  readonly marketCellIds: readonly string[];
  /** Energy budget. */
  readonly energyBudget: number;
  /** Listing pool capacity. */
  readonly listingPoolSize: number;
  /** Customer pool capacity. */
  readonly customerPoolSize: number;
  /** Action bias (positive = aggressive, negative = defensive). */
  readonly actionBias: number;
  /** Broker style. */
  readonly style: string;
  /** Provenance. */
  readonly provenance: EntityProvenance;
  /** Replay key. */
  readonly replayKey: string;
}

// ════════════════════════════════════════════════════════════════════════════
// Market Cell Thickness — per-cell supply/demand density
// ════════════════════════════════════════════════════════════════════════════

/**
 * Listing lifecycle distribution within a market cell.
 * Shows where listings are in their market journey.
 */
export interface ListingLifecycleDistribution {
  readonly fresh: number;
  readonly hot: number;
  readonly warm: number;
  readonly cold: number;
  readonly priceReduced: number;
  readonly stale: number;
  readonly scarce: number;
  readonly total: number;
}

/**
 * Owner urgency distribution within a market cell.
 */
export interface OwnerUrgencyDistribution {
  readonly urgent: number;
  readonly watchful: number;
  readonly stubborn: number;
  readonly cooperative: number;
  readonly upgrading: number;
  readonly financialStress: number;
  readonly emotional: number;
  readonly total: number;
}

/**
 * Customer segment distribution within a market cell.
 */
export interface CustomerSegmentDistribution {
  readonly firstHome: number;
  readonly upgrade: number;
  readonly schoolDistrict: number;
  readonly investment: number;
  readonly budgetSensitive: number;
  readonly timeSensitive: number;
  readonly hesitant: number;
  readonly total: number;
}

/**
 * Market cell thickness: aggregated supply/demand density metrics.
 *
 * Answers "how thick is this market?" with real numbers:
 *   - How many listings are in each lifecycle state?
 *   - How many owners are urgent vs stubborn?
 *   - How many customers are actively searching?
 *   - How many brokers are competing?
 *   - What's the liquidity level?
 *   - What's the competition pressure?
 */
export interface MarketCellThickness {
  /** Market cell ID. */
  readonly marketCellId: string;
  /** Cell name. */
  readonly cellName: string;

  // --- Supply side ---
  /** Active listings in this cell. */
  readonly activeSupply: number;
  /** Listing lifecycle distribution. */
  readonly listingLifecycle: ListingLifecycleDistribution;
  /** Owner urgency distribution (for owners linked to cases in this cell). */
  readonly ownerUrgency: OwnerUrgencyDistribution;

  // --- Demand side ---
  /** Active customer demand units in this cell. */
  readonly activeDemand: number;
  /** Customer segment distribution. */
  readonly customerSegment: CustomerSegmentDistribution;

  // --- Broker density ---
  /** Active brokers covering this cell. */
  readonly brokerDensity: number;
  /** Named brokers in this cell. */
  readonly namedBrokerCount: number;
  /** Shadow brokers in this cell. */
  readonly shadowBrokerCount: number;

  // --- Competition ---
  /** Rival pressure score 0-100 (aggregate of rival listing competitiveness). */
  readonly rivalPressure: number;
  /** Number of distinct ACNs competing in this cell. */
  readonly acnCount: number;

  // --- Liquidity ---
  /** Liquidity level 0-100 (aggregate of listing liquidity scores). */
  readonly liquidityLevel: number;
  /** Average days on market for active listings. */
  readonly avgDaysOnMarket: number;

  // --- Transaction velocity ---
  /** Historical transactions in this cell. */
  readonly historicalTxnCount: number;
  /** Average discount percentage from historical transactions. */
  readonly avgDiscountPct: number;

  // --- Source readiness ---
  /** Supporting info records in this cell. */
  readonly supportingInfoCount: number;
  /** Distinct supporting info categories covered. */
  readonly supportingInfoCategories: number;

  /** Replay key. */
  readonly replayKey: string;
}

// ════════════════════════════════════════════════════════════════════════════
// MarketFormationState — complete market formation at bootstrap
// ════════════════════════════════════════════════════════════════════════════

/**
 * MarketFormationState: the complete market formation derived from bootstrap data.
 *
 * This is a READ-ONLY derived layer. It does not create new runtime state.
 * It classifies existing entities into pools and computes per-cell thickness.
 *
 * Every entry has stable ID, provenance, and replayKey for deterministic replay.
 * Every entry links to its source entity via sourceRef.
 */
export interface MarketFormationState {
  /** Listing pool: lifecycle-classified listings. */
  readonly listingPool: readonly ListingPoolEntry[];
  /** Owner pool: urgency-classified owners. */
  readonly ownerPool: readonly OwnerPoolEntry[];
  /** Customer pool: segment-classified customers. */
  readonly customerPool: readonly CustomerPoolEntry[];
  /** Broker pool: capability-classified brokers. */
  readonly brokerPool: readonly BrokerPoolEntry[];
  /** Per-cell market thickness metrics. */
  readonly cellThickness: readonly MarketCellThickness[];

  // --- Aggregate metrics ---
  /** Total active supply across all cells. */
  readonly totalActiveSupply: number;
  /** Total active demand across all cells. */
  readonly totalActiveDemand: number;
  /** Total broker count. */
  readonly totalBrokers: number;
  /** Average liquidity across all cells. */
  readonly avgLiquidity: number;
  /** Average rival pressure across all cells. */
  readonly avgRivalPressure: number;

  // --- Pool state distributions (aggregate) ---
  readonly listingStateDistribution: Readonly<Record<ListingPoolState, number>>;
  readonly ownerStateDistribution: Readonly<Record<OwnerPoolState, number>>;
  readonly customerStateDistribution: Readonly<Record<CustomerPoolState, number>>;
  readonly brokerStateDistribution: Readonly<Record<BrokerPoolState, number>>;

  /** Replay key for the entire market formation. */
  readonly replayKey: string;

  /**
   * Market economy: resource pools and scarcity derived from formation.
   * Adds economic constraints and opportunity costs to the market structure.
   */
  readonly economy: MarketEconomyState;
}

// ════════════════════════════════════════════════════════════════════════════
// Market Formation Summary — compact persistable summary
// ════════════════════════════════════════════════════════════════════════════

/**
 * Compact summary of market formation for bootstrap summary.
 * Contains counts and distributions, not full entity lists.
 */
export interface MarketFormationSummary {
  readonly listingPoolCount: number;
  readonly ownerPoolCount: number;
  readonly customerPoolCount: number;
  readonly brokerPoolCount: number;
  readonly cellThicknessCount: number;

  readonly listingStateDistribution: Readonly<Record<ListingPoolState, number>>;
  readonly ownerStateDistribution: Readonly<Record<OwnerPoolState, number>>;
  readonly customerStateDistribution: Readonly<Record<CustomerPoolState, number>>;
  readonly brokerStateDistribution: Readonly<Record<BrokerPoolState, number>>;

  readonly totalActiveSupply: number;
  readonly totalActiveDemand: number;
  readonly avgLiquidity: number;
  readonly avgRivalPressure: number;

  /** Minimum thickness thresholds met. */
  readonly meetsMarketFormationThresholds: {
    readonly listingPoolGte100: boolean;
    readonly ownerPoolGte100: boolean;
    readonly customerPoolGte200: boolean;
    readonly brokerPoolGte50: boolean;
    readonly cellThicknessGte10: boolean;
    readonly activeSupplyGte200: boolean;
    readonly activeDemandGte200: boolean;
    readonly liquidityLevelGte30: boolean;
    readonly listingStatesCoveredGte4: boolean;
    readonly ownerStatesCoveredGte4: boolean;
    readonly customerStatesCoveredGte4: boolean;
    readonly brokerStatesCoveredGte3: boolean;
  };

  /** Market economy summary. */
  readonly economy: MarketEconomySummary;
}
