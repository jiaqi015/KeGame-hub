// ---------------------------------------------------------------------------
// marketEconomyTypes.ts — Market Economy resource pool types
//
// Defines the economic system that makes the selling-houses world feel like
// a real resource-constrained market: every action has a cost, every resource
// is scarce, and opportunity cost means doing A means missing B.
//
// Architecture:
//   MarketFormation (R16) classifies entities into pools
//   MarketEconomy (R17) adds resource pools and scarcity to those pools
//   → BrokerResourcePool: time, energy, promotion budget, org credit, cooperation, attention
//   → ListingResourcePool: exposure, showing slots, bargaining window, owner trust
//   → CustomerResourcePool: attention budget, viewing capacity, interception risk
//   → OrgResourcePool: focus meeting slots, promotion allocation, manager intervention
//   → OpportunityCostMatrix: what you lose by choosing one action over another
//
// Every resource has:
//   - stable ID (deterministic from seed)
//   - source origin (which bootstrap layer produced it)
//   - replayKey (for deterministic replay)
//   - current/max/delta for runtime tracking
//   - inflow/outflow rules for deterministic tick
//
// Hard constraints:
//   - domain/world-model/ must NOT import runtime/*, application/*, UI/*
//   - Same seed → byte-identical economy
//   - No Date.now, Math.random, fetch, or LLM
//   - Resources must be consumable, recoverable, and contestable
// ---------------------------------------------------------------------------

import type { EntityProvenance, BootstrapSourceRef } from './bigWorldTypes.js';

// ════════════════════════════════════════════════════════════════════════════
// Resource Scalar — a single trackable resource with current/max/delta
// ════════════════════════════════════════════════════════════════════════════

/**
 * A resource scalar: a single trackable resource value.
 * Used for energy, budget, trust, attention, etc.
 */
export interface ResourceScalar {
  /** Current value. */
  readonly current: number;
  /** Maximum capacity (0 = no cap). */
  readonly max: number;
  /** Daily inflow rate (recovery/regeneration per tick). */
  readonly dailyInflow: number;
  /** Last recorded delta (change from previous tick). */
  readonly lastDelta: number;
}

// ════════════════════════════════════════════════════════════════════════════
// Broker Resource Pool — per-broker economic constraints
// ════════════════════════════════════════════════════════════════════════════

/**
 * Broker resource pool: the economic constraints on a single broker.
 *
 * Each broker has finite time (slots), energy, promotion budget,
 * organizational credit, cooperation capacity, and customer attention.
 * These resources determine what actions the broker can take and
 * how effective those actions are.
 */
export interface BrokerResourcePool {
  /** Deterministic ID: `brp-{brokerId}`. */
  readonly poolId: string;
  /** Source broker ID. */
  readonly brokerId: string;
  /** ACN ID. */
  readonly acnId: string;

  // --- Time ---
  /** Available action slots per day (AM + PM). */
  readonly timeSlots: ResourceScalar;
  /** Slot occupancy: which slots are committed to which case. */
  readonly slotCommitments: readonly SlotCommitment[];

  // --- Energy ---
  /** Physical energy for actions (distinct from time). */
  readonly energy: ResourceScalar;

  // --- Promotion Budget ---
  /** Spendable promotion currency. */
  readonly promotionBudget: ResourceScalar;

  // --- Organizational Credit ---
  /** Credit with the organization for focus meetings, manager support, cross-store cooperation. */
  readonly orgCredit: ResourceScalar;

  // --- ACN Cooperation ---
  /** Cooperation capacity with other brokers in the same ACN. */
  readonly cooperationCapacity: ResourceScalar;

  // --- Customer Attention ---
  /** Total customer attention budget: how many customers this broker can meaningfully serve. */
  readonly customerAttention: ResourceScalar;
  /** Per-customer attention allocation. */
  readonly customerAllocations: readonly CustomerAttentionAllocation[];

  // --- Aggregate ---
  /** Most constrained resource (the bottleneck). */
  readonly bottleneckResource: string;
  /** Overall resource utilization 0-100. */
  readonly utilizationPct: number;

  /** Provenance. */
  readonly provenance: EntityProvenance;
  /** Replay key. */
  readonly replayKey: string;
}

/** A time slot commitment: which case uses which slot. */
export interface SlotCommitment {
  readonly slotIndex: number;
  readonly caseId: string;
  readonly actionType: string;
}

/** Per-customer attention allocation. */
export interface CustomerAttentionAllocation {
  readonly customerId: string;
  readonly caseId: string;
  /** Attention share 0-100 (relative to total budget). */
  readonly attentionShare: number;
  /** Days since last interaction. */
  readonly daysSinceLastInteraction: number;
  /** Risk of losing this customer to a rival (0-100). */
  readonly interceptionRisk: number;
}

// ════════════════════════════════════════════════════════════════════════════
// Listing Resource Pool — per-listing economic constraints
// ════════════════════════════════════════════════════════════════════════════

/**
 * Listing resource pool: the economic constraints on a single listing.
 *
 * Each listing has finite exposure, showing slots, bargaining window,
 * owner trust, and rival pressure. These determine how quickly the
 * listing can move and what the broker needs to invest.
 */
export interface ListingResourcePool {
  /** Deterministic ID: `lrp-{listingId}`. */
  readonly poolId: string;
  /** Source listing ID. */
  readonly listingId: string;
  /** Market cell ID. */
  readonly marketCellId: string;

  // --- Exposure ---
  /** Current exposure level 0-100 (visibility to potential buyers). */
  readonly exposure: ResourceScalar;
  /** Exposure sources: platform, broker network, open day, etc. */
  readonly exposureSources: readonly ExposureSource[];

  // --- Showing Slots ---
  /** Available showing slots per day. */
  readonly showingSlots: ResourceScalar;
  /** Committed showings today. */
  readonly committedShowings: number;

  // --- Bargaining Window ---
  /** Remaining negotiation flexibility (0-100). Tied to owner patience. */
  readonly bargainingWindow: ResourceScalar;
  /** Price concession potential (how much the owner might bend). */
  readonly concessionPotential: number;

  // --- Owner Trust ---
  /** Trust between broker and owner for this listing. */
  readonly ownerTrust: ResourceScalar;

  // --- Rival Pressure ---
  /** Competitive pressure from rival listings in same cell+priceBand. */
  readonly rivalPressure: number;
  /** Number of direct competitors. */
  readonly directCompetitorCount: number;

  // --- Aggregate ---
  /** Listing velocity score: how fast this listing is moving (0-100). */
  readonly velocityScore: number;
  /** Most constrained resource (the bottleneck). */
  readonly bottleneckResource: string;

  /** Provenance. */
  readonly provenance: EntityProvenance;
  /** Replay key. */
  readonly replayKey: string;
}

/** An exposure source: where this listing gets visibility. */
export interface ExposureSource {
  readonly sourceType: 'platform' | 'broker_network' | 'open_day' | 'referral' | 'acn_share';
  readonly strength: number;
  readonly daysSinceLastRefresh: number;
}

// ════════════════════════════════════════════════════════════════════════════
// Customer Resource Pool — per-customer economic constraints
// ════════════════════════════════════════════════════════════════════════════

/**
 * Customer resource pool: the economic constraints on a single customer.
 *
 * Each customer has finite attention, viewing capacity, budget flexibility,
 * and a ticking clock. Rival brokers can intercept if the player is too slow.
 */
export interface CustomerResourcePool {
  /** Deterministic ID: `crp-{customerId}`. */
  readonly poolId: string;
  /** Source customer ID. */
  readonly customerId: string;
  /** Target market cell ID. */
  readonly targetMarketCellId: string;

  // --- Attention Budget ---
  /** How many listings this customer can meaningfully evaluate. */
  readonly attentionBudget: ResourceScalar;
  /** Listings already evaluated. */
  readonly evaluatedCount: number;

  // --- Viewing Capacity ---
  /** Physical viewing slots available (weekends, evenings). */
  readonly viewingCapacity: ResourceScalar;
  /** Viewings already scheduled. */
  readonly scheduledViewings: number;

  // --- Budget Flexibility ---
  /** How much the customer can stretch beyond initial budget (0-100). */
  readonly budgetFlexibility: ResourceScalar;

  // --- Time Window ---
  /** Days remaining before customer churns or goes to rival. */
  readonly timeWindow: ResourceScalar;
  /** Urgency level 0-100. */
  readonly urgency: number;

  // --- Interception Risk ---
  /** Probability of being intercepted by a rival broker (0-100). */
  readonly interceptionRisk: number;
  /** Rival brokers actively targeting this customer. */
  readonly rivalBrokersTargeting: readonly string[];

  // --- Decision Fatigue ---
  /** Accumulated decision fatigue from too many options (0-100). */
  readonly decisionFatigue: ResourceScalar;

  // --- Aggregate ---
  /** Customer conversion probability 0-100. */
  readonly conversionProbability: number;
  /** Most constrained resource. */
  readonly bottleneckResource: string;

  /** Provenance. */
  readonly provenance: EntityProvenance;
  /** Replay key. */
  readonly replayKey: string;
}

// ════════════════════════════════════════════════════════════════════════════
// Org Resource Pool — organizational economic constraints
// ════════════════════════════════════════════════════════════════════════════

/**
 * Org resource pool: the economic constraints on the organization (ACN/store).
 *
 * Organizations have finite focus meeting slots, promotion budgets,
 * manager intervention capacity, and cross-store cooperation opportunities.
 */
export interface OrgResourcePool {
  /** Deterministic ID: `orp-{acnId}`. */
  readonly poolId: string;
  /** Source ACN ID. */
  readonly acnId: string;
  /** ACN name. */
  readonly acnName: string;

  // --- Focus Meeting Slots ---
  /** Weekly focus meeting capacity. */
  readonly focusMeetingSlots: ResourceScalar;
  /** Cases submitted for focus meeting. */
  readonly submittedCases: readonly string[];

  // --- Promotion Allocation ---
  /** Total promotion budget pool for this ACN. */
  readonly promotionPool: ResourceScalar;
  /** Per-broker allocation limits. */
  readonly perBrokerAllocationLimit: number;

  // --- Manager Intervention ---
  /** Manager intervention capacity (coaching, escalation, resource reallocation). */
  readonly managerIntervention: ResourceScalar;
  /** Pending interventions. */
  readonly pendingInterventions: readonly string[];

  // --- Cross-Store Cooperation ---
  /** Cross-store cooperation opportunities (co-sale, referral). */
  readonly crossStoreCooperation: ResourceScalar;
  /** Active cooperation agreements. */
  readonly activeCooperations: readonly string[];

  // --- Aggregate ---
  /** Org utilization 0-100. */
  readonly utilizationPct: number;

  /** Provenance. */
  readonly provenance: EntityProvenance;
  /** Replay key. */
  readonly replayKey: string;
}

// ════════════════════════════════════════════════════════════════════════════
// Opportunity Cost Matrix — what you lose by choosing one action
// ════════════════════════════════════════════════════════════════════════════

/**
 * Opportunity cost entry: what you sacrifice by choosing a specific action.
 *
 * Every action has an opportunity cost because resources are finite.
 * Doing a showing means you can't do a pricing advice that hour.
 * Promoting one listing means less budget for another.
 */
export interface OpportunityCostEntry {
  /** Deterministic ID: `oce-{brokerId}-{actionId}-{day}`. */
  readonly entryId: string;
  /** The action being considered. */
  readonly actionId: string;
  /** Case this action targets. */
  readonly caseId: string;

  // --- Resource Costs ---
  /** Energy cost. */
  readonly energyCost: number;
  /** Promotion budget cost. */
  readonly budgetCost: number;
  /** Time slot cost (1 = half-day, 2 = full-day). */
  readonly timeSlotCost: number;
  /** Customer attention cost (share of attention budget). */
  readonly attentionCost: number;

  // --- Opportunity Gains ---
  /** Expected trust gain on the target case. */
  readonly expectedTrustGain: number;
  /** Expected heat/visibility gain. */
  readonly expectedHeatGain: number;
  /** Expected stage progression. */
  readonly expectedStageProgress: number;
  /** Expected conversion probability lift. */
  readonly expectedConversionLift: number;

  // --- Opportunity Losses ---
  /** Cases that will NOT be served because resources are spent here. */
  readonly unservedCases: readonly string[];
  /** Customers that might be intercepted by rivals while you're busy. */
  readonly interceptionRiskCases: readonly string[];
  /** Trust decay on untouched cases. */
  readonly untouchedTrustDecay: number;

  // --- Net Assessment ---
  /** Net value: gains - losses (normalized 0-100). */
  readonly netValue: number;
  /** Whether this is the highest-value action for this broker right now. */
  readonly isOptimal: boolean;

  /** Provenance. */
  readonly provenance: EntityProvenance;
  /** Replay key. */
  readonly replayKey: string;
}

// ════════════════════════════════════════════════════════════════════════════
// MarketEconomyState — complete market economy at bootstrap
// ════════════════════════════════════════════════════════════════════════════

/**
 * MarketEconomyState: the complete market economy derived from formation data.
 *
 * This is a READ-ONLY derived layer. It does not create new runtime state.
 * It computes resource pools and opportunity costs from existing entities.
 *
 * Every entry has stable ID, provenance, and replayKey for deterministic replay.
 */
export interface MarketEconomyState {
  /** Broker resource pools. */
  readonly brokerPools: readonly BrokerResourcePool[];
  /** Listing resource pools. */
  readonly listingPools: readonly ListingResourcePool[];
  /** Customer resource pools. */
  readonly customerPools: readonly CustomerResourcePool[];
  /** Org resource pools (per ACN). */
  readonly orgPools: readonly OrgResourcePool[];
  /** Opportunity cost entries (top N per broker). */
  readonly opportunityCosts: readonly OpportunityCostEntry[];

  // --- Aggregate Scarcity Metrics ---
  /** Average broker utilization across all brokers. */
  readonly avgBrokerUtilization: number;
  /** Average listing velocity across all listings. */
  readonly avgListingVelocity: number;
  /** Average customer conversion probability. */
  readonly avgConversionProbability: number;
  /** Total opportunity cost entries. */
  readonly totalOpportunityCosts: number;
  /** Number of bottlenecked brokers (utilization > 80%). */
  readonly bottleneckedBrokerCount: number;
  /** Number of at-risk customers (interception risk > 50%). */
  readonly atRiskCustomerCount: number;

  // --- Resource Flow Summary ---
  /** Total energy inflow per day (all brokers). */
  readonly totalDailyEnergyInflow: number;
  /** Total energy outflow per day (all brokers). */
  readonly totalDailyEnergyOutflow: number;
  /** Total budget inflow per week (all ACNs). */
  readonly totalWeeklyBudgetInflow: number;
  /** Total budget outflow per week (all ACNs). */
  readonly totalWeeklyBudgetOutflow: number;

  /** Replay key for the entire market economy. */
  readonly replayKey: string;
}

// ════════════════════════════════════════════════════════════════════════════
// MarketEconomySummary — compact persistable summary
// ════════════════════════════════════════════════════════════════════════════

/**
 * Compact summary of market economy for bootstrap summary.
 * Contains counts and aggregates, not full resource pools.
 */
export interface MarketEconomySummary {
  readonly brokerPoolCount: number;
  readonly listingPoolCount: number;
  readonly customerPoolCount: number;
  readonly orgPoolCount: number;
  readonly opportunityCostCount: number;

  readonly avgBrokerUtilization: number;
  readonly avgListingVelocity: number;
  readonly avgConversionProbability: number;
  readonly bottleneckedBrokerCount: number;
  readonly atRiskCustomerCount: number;

  readonly totalDailyEnergyInflow: number;
  readonly totalDailyEnergyOutflow: number;
  readonly totalWeeklyBudgetInflow: number;
  readonly totalWeeklyBudgetOutflow: number;

  /** Minimum economy thresholds met. */
  readonly meetsMarketEconomyThresholds: {
    readonly brokerPoolsGte50: boolean;
    readonly listingPoolsGte100: boolean;
    readonly customerPoolsGte100: boolean;
    readonly orgPoolsGte5: boolean;
    readonly opportunityCostsGte50: boolean;
    readonly avgBrokerUtilizationGte30: boolean;
    readonly avgListingVelocityGte20: boolean;
    readonly avgConversionProbabilityGte10: boolean;
    readonly bottleneckedBrokersGte5: boolean;
    readonly atRiskCustomersGte10: boolean;
    readonly energyFlowBalanced: boolean;
    readonly budgetFlowBalanced: boolean;
  };

  /**
   * Ledger readiness: whether opening balances can be extracted for the resource ledger.
   * When true, the economy state can seed the EconomicResourceLedger.
   */
  readonly ledgerReady: boolean;
}
