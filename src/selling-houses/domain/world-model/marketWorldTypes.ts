// ---------------------------------------------------------------------------
// MarketOpeningSnapshot types — deterministic "大世界开局底座"
//
// Design source: selling-houses-world-model-mother-model.md
// This module defines the read-only opening snapshot that gives GameState
// a full market world before the player enters. The world exists first;
// the player is a local POV inside it.
//
// Architecture boundary:
//   - domain/world-model/ may only import domain/utils and domain/constants
//   - it must NOT import runtime/*, application/*, or UI/*
//   - all values are deterministic for same seed
//   - snapshot is read-only after creation
// ---------------------------------------------------------------------------

// --- City / Market Cycle ---------------------------------------------------

export type CityCyclePhase =
  | 'cold'       // 市场冷淡期
  | 'flat'       // 平稳期
  | 'hot'        // 火热期
  | 'structural_divergence'  // 结构性分化
  | 'school_season'          // 学区季
  | 'rental_season';         // 租赁季

export type MarketHeatDirection = 'rising' | 'stable' | 'declining';

export interface CityCycleState {
  /** Current cycle phase — environment signal, not direct deal driver. */
  readonly phase: CityCyclePhase;
  /** 0-100 heat index within current phase. */
  readonly heatIndex: number;
  /** Direction of heat movement. */
  readonly heatDirection: MarketHeatDirection;
  /** Human-readable cycle label for downstream narrative. */
  readonly label: string;
}

// --- Market Cell / 板块 / 商圈 --------------------------------------------

export type MarketCellHeatBand = 'ice' | 'cold' | 'warm' | 'hot' | 'frenzy';
export type MarketCellPriceTrend = 'declining' | 'stagnant' | 'stable' | 'rising' | 'surging';
export type MarketCellSignalStrength = 'none' | 'weak' | 'moderate' | 'strong';

export interface MarketCellSnapshot {
  /** Unique cell identifier, aligned with WorldSpec.marketCells[].id. */
  readonly id: string;
  /** Human-readable cell name (e.g. "和平里板块"). */
  readonly name: string;
  /** 0-100 heat level. Structured numeric, not copy. */
  readonly heat: number;
  /** Categorical heat band derived from heat value. */
  readonly heatBand: MarketCellHeatBand;
  /** 0-100 inventory pressure — how many unsold listings sit here. */
  readonly inventoryPressure: number;
  /** 0-100 deal velocity — how fast listings move in this cell. */
  readonly dealVelocity: number;
  /** 0-100 rental heat — demand for rentals in this cell. */
  readonly rentHeat: number;
  /** Price trend direction. */
  readonly priceTrend: MarketCellPriceTrend;
  /** 0-100 school district signal strength. */
  readonly schoolSignal: MarketCellSignalStrength;
  /** 0-100 commute convenience signal strength. */
  readonly commuteSignal: MarketCellSignalStrength;
}

// --- ACN Network / 经纪人合作网络 ------------------------------------------

export type ACNNetworkRole =
  | 'player_acn'          // 玩家所在 ACN
  | 'strong_rival_acn'    // 强竞争 ACN
  | 'local_relational';   // 本地关系型 ACN

export interface ACNNetworkSnapshot {
  /** Unique ACN identifier. */
  readonly id: string;
  /** Human-readable name. */
  readonly name: string;
  /** Role classification. */
  readonly role: ACNNetworkRole;
  /** 0-100 how willing brokers in this ACN are to co-operate on deals. */
  readonly collaborationLevel: number;
  /** 0-100 how open listings are shared across brokers. */
  readonly listingOpenness: number;
  /** 0-100 how fast information flows within this ACN. */
  readonly infoSpeed: number;
  /** 0-100 aggressive competition behavior. */
  readonly competitionAggression: number;
  /** 0-100 bias toward co-sale (合作成交) vs solo close. */
  readonly coSaleBias: number;
}

// --- Listing Inventory ------------------------------------------------------

export interface ListingInventorySnapshot {
  /** Player's own listings count. */
  readonly playerListingCount: number;
  /** Listings directly competing with the player's listings. */
  readonly directRivalListingCount: number;
  /** Shadow listings: market listings the player cannot directly see but exist.
   *  Must be strictly > playerListingCount. */
  readonly shadowListingCount: number;
  /** Historical transaction summary — deals that happened before the player entered. */
  readonly recentTransactionCount: number;
  /** Average days-on-market for recent transactions. */
  readonly avgDaysOnMarket: number;
  /** Average price discount vs ask price in recent transactions (0-100 = percentage). */
  readonly avgDiscountPct: number;
}

// --- Customer Demand Field --------------------------------------------------

export type DemandSegment =
  | 'first_home'      // 首置
  | 'upgrade'         // 改善
  | 'school_district' // 学区
  | 'investment'      // 投资
  | 'liquidity'       // 资产变现
  | 'commute'         // 通勤
  | 'rental_yield';   // 租赁收益

export type DemandPreferenceTag =
  | 'school'
  | 'commute'
  | 'improvement'
  | 'investment'
  | 'liquidity'
  | 'quality_community'
  | 'low_price'
  | 'new_decoration';

export interface DemandSegmentEntry {
  /** Which demand segment. */
  readonly segment: DemandSegment;
  /** 0-100 relative weight in the market. */
  readonly weight: number;
  /** Dominant preference tags for this segment. */
  readonly preferences: readonly DemandPreferenceTag[];
}

export interface PriceBandEntry {
  /** Price band label (e.g. "200-300万"). */
  readonly label: string;
  /** Lower bound in 万. */
  readonly minPrice: number;
  /** Upper bound in 万. */
  readonly maxPrice: number;
  /** 0-100 demand concentration in this band. */
  readonly demandConcentration: number;
  /** 0-100 supply concentration in this band. */
  readonly supplyConcentration: number;
}

export interface CustomerDemandFieldSnapshot {
  /** Shadow customers: customers in the market not yet visible to the player.
   *  Must be strictly > player's initial opportunity count. */
  readonly shadowCustomerCount: number;
  /** Demand segment distribution. */
  readonly segments: readonly DemandSegmentEntry[];
  /** Price band distribution. */
  readonly priceBands: readonly PriceBandEntry[];
  /** Overall demand momentum: 0-100. */
  readonly demandMomentum: number;
}

// --- Broker Network ---------------------------------------------------------

export type BrokerStyle = 'aggressive' | 'steady' | 'relationship' | 'traffic';

export interface NamedRivalBrokerSummary {
  /** Broker identifier. */
  readonly id: string;
  /** Broker name. */
  readonly name: string;
  /** ACN network id this broker belongs to. */
  readonly acnId: string;
  /** Dominant working style. */
  readonly style: BrokerStyle;
  /** 0-100 information acquisition speed. */
  readonly infoSpeed: number;
  /** 0-100 action intensity / activity level. */
  readonly actionIntensity: number;
  /** 0-100 cooperation tendency (vs competition). */
  readonly cooperationTendency: number;
  /** 0-100 competition aggression. */
  readonly competitionAggression: number;
}

export interface BrokerStyleDistribution {
  readonly style: BrokerStyle;
  /** Count of brokers with this style. */
  readonly count: number;
}

export interface BrokerNetworkSnapshot {
  /** Named rival brokers (individually modeled). */
  readonly namedBrokers: readonly NamedRivalBrokerSummary[];
  /** Shadow broker count — brokers in the market not individually modeled.
   *  Must be strictly > namedBrokers.length. */
  readonly shadowBrokerCount: number;
  /** Distribution of broker styles across all brokers (named + shadow). */
  readonly styleDistribution: readonly BrokerStyleDistribution[];
  /** Total broker count (named + shadow). */
  readonly totalBrokerCount: number;
}

// --- Recent World Events ----------------------------------------------------

export type RecentWorldEventType =
  | 'rival_listing_repriced'
  | 'market_heat_shift'
  | 'customer_demand_shift'
  | 'listing_withdrawn'
  | 'transaction_closed'
  | 'policy_signal'
  | 'new_listing_inflow';

export interface RecentWorldEvent {
  /** Event type. */
  readonly type: RecentWorldEventType;
  /** 1-2 sentence summary. */
  readonly summary: string;
  /** Market cell affected (if applicable). */
  readonly marketCellId?: string;
  /** Days ago this event happened. */
  readonly daysAgo: number;
}

// --- MarketOpeningSnapshot (root) -------------------------------------------

/**
 * Deterministic opening snapshot of the full market world.
 *
 * This snapshot is created once at game start from seed + scenario config,
 * stored as a read-only field on GameState.runContext, and never mutated.
 *
 * The player does NOT own the world. The world existed before the player
 * entered; the player is a local POV (ACN broker) perceiving part of it.
 */
export interface MarketOpeningSnapshot {
  /** Snapshot version for future migration. */
  readonly version: 1;
  /** Seed used to generate this snapshot. */
  readonly seed: number;
  /** Scenario name for provenance. */
  readonly scenarioName: string;
  /** Difficulty id for provenance. */
  readonly difficultyId: string;
  /** Player's case count at game start. */
  readonly playerCaseCount: number;

  /** City / market cycle state at opening. */
  readonly cityCycle: CityCycleState;
  /** Market cells (>= 3). Each cell is a 板块/商圈. */
  readonly marketCells: readonly MarketCellSnapshot[];
  /** ACN networks (>= 3). */
  readonly acnNetworks: readonly ACNNetworkSnapshot[];
  /** Listing inventory overview. */
  readonly listingInventory: ListingInventorySnapshot;
  /** Customer demand field. */
  readonly customerDemand: CustomerDemandFieldSnapshot;
  /** Broker network. */
  readonly brokerNetwork: BrokerNetworkSnapshot;
  /** Events that happened in the world before the player entered. */
  readonly recentWorldEvents: readonly RecentWorldEvent[];
}
