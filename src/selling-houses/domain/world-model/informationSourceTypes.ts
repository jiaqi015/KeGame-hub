// ---------------------------------------------------------------------------
// InformationSourceRecord — canonical type for every information source
//
// Architecture position:
//   World fact happens
//     → InformationSourceRecord is born (append-only)
//       → Actor POV projects a subset of records
//         → Actor interprets → belief/pressure change
//           → CausalEvent emitted → ledger
//
// Hard constraints:
//   - SourceRecord does NOT directly modify Case / Opportunity
//   - Hidden truth and ActorPOV are structurally separated
//   - Types are shared by runtime and projection
//   - No fetch / LLM provider / Date.now / Math.random
//   - Append-only: records are never mutated after creation
//   - Same seed + same events → identical records
//
// Mother model alignment:
//   Section 9: POV And Interaction Design
//     "GlobalTruth → POVProjection → ImmersiveInteractionScene"
//   Section 8: Broker Service Essence
//     raw information → interpretation → decision frame → receiver effect
//   Section 13: Causal Transmission
//     source signal → actor receives → belief/pressure changes → action
// ---------------------------------------------------------------------------

// ════════════════════════════════════════════════════════════════════════════
// SourceKind — discriminated union of information source categories
// ════════════════════════════════════════════════════════════════════════════

/**
 * The 10 information source categories in the selling-houses world.
 *
 * Each kind maps to a specific canonical payload and a set of
 * possible causal event outputs.
 */
export type SourceKind =
  | 'market_signal'
  | 'rival_action'
  | 'customer_interaction'
  | 'owner_interview'
  | 'manager_message'
  | 'player_action_receipt'
  | 'process_receipt'
  | 'comparable_transaction'
  | 'platform_traffic'
  | 'acn_network_signal';

// ════════════════════════════════════════════════════════════════════════════
// VisibilityPolicy — who can see this record
// ════════════════════════════════════════════════════════════════════════════

/**
 * Actor roles in the information ecosystem.
 */
export type ActorRole =
  | 'player_broker'
  | 'rival_broker'
  | 'owner'
  | 'customer'
  | 'manager'
  | 'system';

/**
 * Visibility scope: who is allowed to see this source record.
 *
 * 'all_actors'       — every actor sees it (e.g. public market signal)
 * 'specific_actors'  — only listed actor IDs see it
 * 'no_one'           — hidden truth only (e.g. shadow broker internals)
 * 'owner_only'       — only the owner of the related case
 * 'broker_chain'     — brokers in the same ACN or service path
 * 'player_only'      — only the player broker
 */
export type VisibilityScope =
  | 'all_actors'
  | 'specific_actors'
  | 'no_one'
  | 'owner_only'
  | 'broker_chain'
  | 'player_only';

/**
 * Visibility policy for a source record.
 * Determines which actors can project this record into their POV.
 */
export interface VisibilityPolicy {
  /** The scope rule. */
  readonly scope: VisibilityScope;
  /**
   * Specific actor IDs allowed to see this record.
   * Only meaningful when scope === 'specific_actors'.
   */
  readonly actorIds?: readonly string[];
  /**
   * Delay before the record becomes visible to actors.
   * 0 = immediate. Positive = information lag (days).
   * The delay is actor-dependent (owner perception lag vs broker info speed).
   */
  readonly baseDelayDays: number;
}

// ════════════════════════════════════════════════════════════════════════════
// EntityRef / ActorRef — typed cross-references
// ════════════════════════════════════════════════════════════════════════════

/**
 * Typed reference to an entity affected by or involved in a source record.
 */
export interface EntityRef {
  /** Entity ID (case, listing, customer, broker, etc.). */
  readonly id: string;
  /** Entity kind for runtime dispatch. */
  readonly kind: 'case' | 'listing' | 'customer' | 'broker' | 'owner' | 'market_cell' | 'acn' | 'store' | 'opportunity' | 'matter' | 'process';
}

/**
 * Typed reference to an actor who caused or participated in a source event.
 */
export interface ActorRef {
  /** Actor ID (broker, owner, customer, manager, or 'system'). */
  readonly id: string;
  /** Actor role. */
  readonly role: ActorRole;
  /** Actor's ACN id (if applicable). */
  readonly acnId?: string;
}

// ════════════════════════════════════════════════════════════════════════════
// Per-kind canonical payloads
// ════════════════════════════════════════════════════════════════════════════

/**
 * Base payload fields shared by all source kinds.
 */
export interface SourcePayloadBase {
  /** Free-text summary for narrative generation. */
  readonly summary: string;
}

// --- market_signal ---

export type MarketSignalSubtype =
  | 'heat_shift'
  | 'price_trend'
  | 'inventory_change'
  | 'demand_shift'
  | 'policy_change'
  | 'seasonal_pattern';

export interface MarketSignalPayload extends SourcePayloadBase {
  readonly subtype: MarketSignalSubtype;
  /** Market cell this signal pertains to. */
  readonly marketCellId: string;
  /** Before value (heat, inventory count, etc.). */
  readonly before: number;
  /** After value. */
  readonly after: number;
  /** Unit of measurement. */
  readonly unit: string;
  /** Whether this signal is publicly visible on listing platforms. */
  readonly isPublic: boolean;
}

// --- rival_action ---

export type RivalActionSubtype =
  | 'reprice'
  | 'new_listing'
  | 'withdraw_listing'
  | 'open_day_held'
  | 'customer_followed'
  | 'owner_pitched'
  | 'deal_closed';

export interface RivalActionPayload extends SourcePayloadBase {
  readonly subtype: RivalActionSubtype;
  /** The rival broker who acted. */
  readonly rivalBrokerId: string;
  /** Rival's ACN id. */
  readonly rivalAcnId: string;
  /** Related listing id (if applicable). */
  readonly listingId?: string;
  /** Related case id (if applicable). */
  readonly caseId?: string;
  /** Price before action (for reprice). */
  readonly priceBefore?: number;
  /** Price after action (for reprice). */
  readonly priceAfter?: number;
  /** Related market cell. */
  readonly marketCellId?: string;
  /** Evidence strength: how clearly the player can observe this. */
  readonly evidenceStrength: 'direct' | 'rumor' | 'inferred';
}

// --- customer_interaction ---

export type CustomerInteractionSubtype =
  | 'viewing_completed'
  | 'revisit_scheduled'
  | 'offer_submitted'
  | 'offer_rejected'
  | 'comparison_made'
  | 'preference_shifted'
  | 'budget_adjusted'
  | 'dropout_detected';

export interface CustomerInteractionPayload extends SourcePayloadBase {
  readonly subtype: CustomerInteractionSubtype;
  /** Customer id. */
  readonly customerId: string;
  /** Related listing id. */
  readonly listingId?: string;
  /** Related case id. */
  readonly caseId?: string;
  /** Related opportunity id (if any). */
  readonly opportunityId?: string;
  /** Fit score at time of interaction (0-100). */
  readonly fitScore?: number;
  /** Interest level at time of interaction (0-100). */
  readonly interestLevel?: number;
  /** Whether the customer expressed this directly or was observed. */
  readonly observationMode: 'direct' | 'observed' | 'inferred';
}

// --- owner_interview ---

export type OwnerInterviewSubtype =
  | 'price_discussed'
  | 'urgency_revealed'
  | 'objection_raised'
  | 'trust_expressed'
  | 'trust_withdrawn'
  | 'expectation_adjusted'
  | 'withdrawal_threatened'
  | 'exclusive意向_expressed';

export interface OwnerInterviewPayload extends SourcePayloadBase {
  readonly subtype: OwnerInterviewSubtype;
  /** Owner id. */
  readonly ownerId: string;
  /** Related case id. */
  readonly caseId: string;
  /** Broker who conducted the interview. */
  readonly brokerId: string;
  /** Trust level at time of interview (0-100). */
  readonly trustLevel?: number;
  /** Price mentioned (if price-related). */
  readonly priceMentioned?: number;
  /** Owner's emotional tone. */
  readonly tone: 'positive' | 'neutral' | 'negative' | 'hostile';
  /** What the owner said (compressed factual summary). */
  readonly ownerStatement: string;
  /** Whether this was a scheduled call or ad-hoc. */
  readonly interactionMode: 'scheduled_call' | 'ad_hoc' | 'meeting' | 'message';
}

// --- manager_message ---

export type ManagerMessageSubtype =
  | 'focus_case_selected'
  | 'resource_allocated'
  | 'escalation_requested'
  | 'coaching_delivered'
  | 'performance_review'
  | 'strategic_direction';

export interface ManagerMessagePayload extends SourcePayloadBase {
  readonly subtype: ManagerMessageSubtype;
  /** Manager id. */
  readonly managerId: string;
  /** Target broker id. */
  readonly targetBrokerId: string;
  /** Related case ids. */
  readonly caseIds: readonly string[];
  /** Priority level (0-100). */
  readonly priority: number;
  /** Instruction summary. */
  readonly instruction: string;
  /** Resource allocation (budget, time slots, etc.). */
  readonly resourceAllocation?: Record<string, number>;
}

// --- player_action_receipt ---

export type PlayerActionReceiptSubtype =
  | 'action_executed'
  | 'action_blocked'
  | 'action_failed';

export interface PlayerActionReceiptPayload extends SourcePayloadBase {
  readonly subtype: PlayerActionReceiptSubtype;
  /** Action definition id. */
  readonly actionId: string;
  /** Executor id. */
  readonly executorId: string;
  /** Related case id. */
  readonly caseId: string;
  /** Related opportunity id. */
  readonly opportunityId?: string;
  /** Energy cost. */
  readonly costEnergy: number;
  /** Promotion budget cost. */
  readonly costPromotionBudget: number;
  /** Field deltas produced. */
  readonly fieldDeltas: readonly {
    readonly field: string;
    readonly from: number | string | boolean;
    readonly to: number | string | boolean;
  }[];
  /** Outcome: success, blocked, failed. */
  readonly outcome: 'success' | 'blocked' | 'failed';
}

// --- process_receipt ---

export type ProcessReceiptSubtype =
  | 'open_day_completed'
  | 'sincerity_sale_completed'
  | 'focus_meeting_completed'
  | 'negotiation_progressed'
  | 'consensus_reached'
  | 'consensus_collapsed'
  | 'deal_signed'
  | 'case_withdrawn';

export interface ProcessReceiptPayload extends SourcePayloadBase {
  readonly subtype: ProcessReceiptSubtype;
  /** Process type. */
  readonly processType: 'open_day' | 'sincerity_sale' | 'focus_meeting' | 'negotiation' | 'consensus' | 'closure';
  /** Process id. */
  readonly processId: string;
  /** Related case ids. */
  readonly caseIds: readonly string[];
  /** Related customer ids. */
  readonly customerIds: readonly string[];
  /** Related broker ids. */
  readonly brokerIds: readonly string[];
  /** Outcome summary. */
  readonly outcome: string;
  /** Metrics snapshot at completion. */
  readonly metrics: Record<string, number>;
}

// --- comparable_transaction ---

export type ComparableTransactionSubtype =
  | 'deal_closed'
  | 'price_adjusted'
  | 'listing_withdrawn'
  | 'listing_expired';

export interface ComparableTransactionPayload extends SourcePayloadBase {
  readonly subtype: ComparableTransactionSubtype;
  /** Related market cell. */
  readonly marketCellId: string;
  /** District name. */
  readonly district: string;
  /** Layout. */
  readonly layout: string;
  /** Area sqm. */
  readonly areaSqm: number;
  /** Sold/adjusted price (万元). */
  readonly price: number;
  /** Original ask price. */
  readonly askPrice: number;
  /** Discount percentage (0-100). */
  readonly discountPct: number;
  /** Listing id (if known). */
  readonly listingId?: string;
  /** Days on market. */
  readonly daysOnMarket: number;
  /** Source of the comparable data. */
  readonly dataSource: 'platform公开' | 'broker内部' | 'acn共享' | '媒体报道';
}

// --- platform_traffic ---

export type PlatformTrafficSubtype =
  | 'listing_viewed'
  | 'listing_favorited'
  | 'inquiry_received'
  | 'traffic_spike'
  | 'traffic_drop';

export interface PlatformTrafficPayload extends SourcePayloadBase {
  readonly subtype: PlatformTrafficSubtype;
  /** Listing id. */
  readonly listingId: string;
  /** Market cell. */
  readonly marketCellId: string;
  /** View count (or delta). */
  readonly viewCount: number;
  /** Favorited count (or delta). */
  readonly favoriteCount: number;
  /** Inquiry count (or delta). */
  readonly inquiryCount: number;
  /** Time window (e.g. "last_24h", "last_7d"). */
  readonly timeWindow: string;
  /** Whether this is absolute or delta. */
  readonly isDelta: boolean;
}

// --- acn_network_signal ---

export type AcnNetworkSignalSubtype =
  | 'cooperation_opportunity'
  | 'competition_escalation'
  | 'info_share_received'
  | 'credit_allocation'
  | 'conflict_detected'
  | 'rule_change';

export interface AcnNetworkSignalPayload extends SourcePayloadBase {
  readonly subtype: AcnNetworkSignalSubtype;
  /** Source ACN id. */
  readonly sourceAcnId: string;
  /** Target ACN id (if applicable). */
  readonly targetAcnId?: string;
  /** Related broker ids. */
  readonly brokerIds: readonly string[];
  /** Related listing id. */
  readonly listingId?: string;
  /** Related case id. */
  readonly caseId?: string;
  /** Cooperation score (0-100, -100 for conflict). */
  readonly cooperationScore: number;
  /** Credit amount (if credit allocation). */
  readonly creditAmount?: number;
  /** Rule change details (if applicable). */
  readonly ruleChange?: string;
}

// ════════════════════════════════════════════════════════════════════════════
// InformationSourceRecord — the core type
// ════════════════════════════════════════════════════════════════════════════

/**
 * Canonical payload: discriminated union of all source-kind payloads.
 */
export type SourceCanonicalPayload =
  | MarketSignalPayload
  | RivalActionPayload
  | CustomerInteractionPayload
  | OwnerInterviewPayload
  | ManagerMessagePayload
  | PlayerActionReceiptPayload
  | ProcessReceiptPayload
  | ComparableTransactionPayload
  | PlatformTrafficPayload
  | AcnNetworkSignalPayload;

/**
 * Mapping from SourceKind to its payload type.
 * Used for type-safe construction and extraction.
 */
export interface SourceKindPayloadMap {
  market_signal: MarketSignalPayload;
  rival_action: RivalActionPayload;
  customer_interaction: CustomerInteractionPayload;
  owner_interview: OwnerInterviewPayload;
  manager_message: ManagerMessagePayload;
  player_action_receipt: PlayerActionReceiptPayload;
  process_receipt: ProcessReceiptPayload;
  comparable_transaction: ComparableTransactionPayload;
  platform_traffic: PlatformTrafficPayload;
  acn_network_signal: AcnNetworkSignalPayload;
}

/**
 * InformationSourceRecord — the single canonical type for all information sources.
 *
 * Every piece of information that enters the world — whether from a market signal,
 * a rival action, a customer interaction, an owner interview, or any other source —
 * is recorded as an InformationSourceRecord.
 *
 * Records are append-only. They are never mutated after creation.
 *
 * Records do NOT directly modify Case / Opportunity.
 * Instead, actors project records into their POV, interpret them,
 * and then decide — which may produce CausalEvents.
 *
 * Same seed + same events → identical records.
 */
export interface InformationSourceRecord<Kind extends SourceKind = SourceKind> {
  /** Unique deterministic ID. Format: isr-{seed}-{kind}-{index}. */
  readonly sourceId: string;
  /** The source category. */
  readonly sourceKind: Kind;
  /** Payload specific to this source kind. */
  readonly payload: SourceKindPayloadMap[Kind];

  // --- Timing ---

  /** Simulation day when this source event occurred. */
  readonly day: number;
  /** Phase within the day: 'morning' | 'afternoon' | 'evening' | 'tick_close'. */
  readonly phase: 'morning' | 'afternoon' | 'evening' | 'tick_close';

  // --- Entity / Actor refs ---

  /** Entities this source record references. */
  readonly entityRefs: readonly EntityRef[];
  /** Actors who caused or participated. */
  readonly actorRefs: readonly ActorRef[];

  // --- Visibility ---

  /** Who can see this record. */
  readonly visibility: VisibilityPolicy;

  // --- Quality ---

  /** Confidence that this source is accurate (0-1). */
  readonly confidence: number;

  // --- Delay ---

  /**
   * Actual delay in days before this record becomes visible to actors.
   * Computed from visibility.baseDelayDays + actor-specific modifiers.
   * 0 = immediately visible (after phase gate).
   */
  readonly delayDays: number;

  // --- Replay ---

  /**
   * Deterministic replay key: same seed + same event sequence → same replayKey.
   * Used for save/load and deterministic replay.
   */
  readonly replayKey: string;

  // --- Provenance ---

  /** Which bootstrap layer or runtime process produced this record. */
  readonly origin: 'bootstrap' | 'ecosystem_tick' | 'player_action' | 'process_run' | 'daily_settlement';
}

// ════════════════════════════════════════════════════════════════════════════
// SourceRecordIndex — in-memory query index
// ════════════════════════════════════════════════════════════════════════════

/**
 * In-memory index for fast source record queries.
 * Built once, append-only during runtime.
 */
export interface SourceRecordIndex {
  /** All records in insertion order. */
  readonly all: readonly InformationSourceRecord[];
  /** Records indexed by sourceKind. */
  readonly byKind: ReadonlyMap<SourceKind, readonly InformationSourceRecord[]>;
  /** Records indexed by day. */
  readonly byDay: ReadonlyMap<number, readonly InformationSourceRecord[]>;
  /** Records indexed by entity ID. */
  readonly byEntityId: ReadonlyMap<string, readonly InformationSourceRecord[]>;
  /** Records indexed by actor ID. */
  readonly byActorId: ReadonlyMap<string, readonly InformationSourceRecord[]>;
  /** Records indexed by replayKey. Exactly one record per replayKey. */
  readonly byReplayKey: ReadonlyMap<string, InformationSourceRecord>;
  /** Total record count. */
  readonly count: number;
}

// ════════════════════════════════════════════════════════════════════════════
// Source-to-Causal mapping suggestions
// ════════════════════════════════════════════════════════════════════════════

/**
 * Suggested mapping from SourceKind to WorldCausalEventKind.
 *
 * One source record may produce zero or more causal events.
 * The mapping depends on:
 *   - which actors observe the record (visibility)
 *   - how actors interpret the record (belief update)
 *   - what decision pressure the interpretation creates
 *
 * This is a GUIDE for runtime implementation, not a hard type constraint.
 */
export interface SourceToCausalMapping {
  /** The source kind. */
  readonly sourceKind: SourceKind;
  /** Possible causal event kinds this source can produce. */
  readonly possibleCausalKinds: readonly string[];
  /** Whether this source is a root cause (no upstream causeEventIds). */
  readonly isRootCause: boolean;
  /** Typical confidence range for the resulting causal events. */
  readonly confidenceRange: { readonly min: number; readonly max: number };
  /** Typical delay before the causal event fires. */
  readonly typicalDelayDays: { readonly min: number; readonly max: number };
}

/**
 * Default mapping table. Runtime should use this as reference.
 */
export const SOURCE_TO_CAUSAL_MAP: readonly SourceToCausalMapping[] = [
  {
    sourceKind: 'market_signal',
    possibleCausalKinds: ['MarketHeatShifted', 'OwnerMarketPressurePerceived'],
    isRootCause: true,
    confidenceRange: { min: 0.6, max: 0.95 },
    typicalDelayDays: { min: 0, max: 3 },
  },
  {
    sourceKind: 'rival_action',
    possibleCausalKinds: ['RivalListingRepriced', 'RivalBrokerActionTaken', 'OwnerMarketPressurePerceived'],
    isRootCause: true,
    confidenceRange: { min: 0.7, max: 1.0 },
    typicalDelayDays: { min: 0, max: 2 },
  },
  {
    sourceKind: 'customer_interaction',
    possibleCausalKinds: ['CustomerComparedListings', 'CustomerAttentionShifted'],
    isRootCause: false,
    confidenceRange: { min: 0.8, max: 1.0 },
    typicalDelayDays: { min: 0, max: 1 },
  },
  {
    sourceKind: 'owner_interview',
    possibleCausalKinds: ['OwnerMarketPressurePerceived', 'BrokerRecommendationChanged'],
    isRootCause: false,
    confidenceRange: { min: 0.5, max: 0.9 },
    typicalDelayDays: { min: 0, max: 0 },
  },
  {
    sourceKind: 'manager_message',
    possibleCausalKinds: ['MatterPriorityChanged', 'BrokerRecommendationChanged'],
    isRootCause: false,
    confidenceRange: { min: 0.8, max: 1.0 },
    typicalDelayDays: { min: 0, max: 0 },
  },
  {
    sourceKind: 'player_action_receipt',
    possibleCausalKinds: ['BrokerRecommendationChanged', 'MatterPriorityChanged'],
    isRootCause: false,
    confidenceRange: { min: 0.9, max: 1.0 },
    typicalDelayDays: { min: 0, max: 0 },
  },
  {
    sourceKind: 'process_receipt',
    possibleCausalKinds: ['BrokerRecommendationChanged', 'MatterPriorityChanged', 'OwnerMarketPressurePerceived'],
    isRootCause: false,
    confidenceRange: { min: 0.7, max: 1.0 },
    typicalDelayDays: { min: 0, max: 1 },
  },
  {
    sourceKind: 'comparable_transaction',
    possibleCausalKinds: ['OwnerMarketPressurePerceived', 'MarketHeatShifted'],
    isRootCause: true,
    confidenceRange: { min: 0.6, max: 0.85 },
    typicalDelayDays: { min: 1, max: 5 },
  },
  {
    sourceKind: 'platform_traffic',
    possibleCausalKinds: ['MarketHeatShifted', 'CustomerAttentionShifted'],
    isRootCause: true,
    confidenceRange: { min: 0.5, max: 0.8 },
    typicalDelayDays: { min: 0, max: 2 },
  },
  {
    sourceKind: 'acn_network_signal',
    possibleCausalKinds: ['RivalBrokerActionTaken', 'BrokerRecommendationChanged'],
    isRootCause: false,
    confidenceRange: { min: 0.4, max: 0.8 },
    typicalDelayDays: { min: 0, max: 3 },
  },
];

// ════════════════════════════════════════════════════════════════════════════
// Per-kind example helpers (for tests and documentation)
// ════════════════════════════════════════════════════════════════════════════

/**
 * Example: market_signal — 板块热度上升
 */
export const EXAMPLE_MARKET_SIGNAL: InformationSourceRecord<'market_signal'> = {
  sourceId: 'isr-42-market_signal-0',
  sourceKind: 'market_signal',
  day: 3,
  phase: 'morning',
  entityRefs: [{ id: 'cell-1', kind: 'market_cell' }],
  actorRefs: [{ id: 'system', role: 'system' }],
  visibility: { scope: 'all_actors', baseDelayDays: 0 },
  confidence: 0.85,
  delayDays: 0,
  replayKey: 'rk-42-ms-3-0',
  origin: 'ecosystem_tick',
  payload: {
    subtype: 'heat_shift',
    summary: '和平里板块热度从 52 上升到 61',
    marketCellId: 'cell-1',
    before: 52,
    after: 61,
    unit: 'heat_index',
    isPublic: true,
  },
};

/**
 * Example: rival_action — 竞品调价
 */
export const EXAMPLE_RIVAL_ACTION: InformationSourceRecord<'rival_action'> = {
  sourceId: 'isr-42-rival_action-0',
  sourceKind: 'rival_action',
  day: 5,
  phase: 'afternoon',
  entityRefs: [
    { id: 'rival-listing-3', kind: 'listing' },
    { id: 'nb-acn-aggressive-0', kind: 'broker' },
  ],
  actorRefs: [{ id: 'nb-acn-aggressive-0', role: 'rival_broker', acnId: 'acn-aggressive' }],
  visibility: { scope: 'all_actors', baseDelayDays: 0 },
  confidence: 0.9,
  delayDays: 0,
  replayKey: 'rk-42-ra-5-0',
  origin: 'ecosystem_tick',
  payload: {
    subtype: 'reprice',
    summary: '竞品经纪人将朝阳公园板块2室1厅从380万降至365万',
    rivalBrokerId: 'nb-acn-aggressive-0',
    rivalAcnId: 'acn-aggressive',
    listingId: 'rival-listing-3',
    marketCellId: 'cell-2',
    priceBefore: 380,
    priceAfter: 365,
    evidenceStrength: 'direct',
  },
};

/**
 * Example: owner_interview — 业主沟通
 */
export const EXAMPLE_OWNER_INTERVIEW: InformationSourceRecord<'owner_interview'> = {
  sourceId: 'isr-42-owner_interview-0',
  sourceKind: 'owner_interview',
  day: 7,
  phase: 'evening',
  entityRefs: [
    { id: 'case-1', kind: 'case' },
    { id: 'owner-1', kind: 'owner' },
  ],
  actorRefs: [
    { id: 'player-broker', role: 'player_broker', acnId: 'acn-cooperative' },
    { id: 'owner-1', role: 'owner' },
  ],
  visibility: { scope: 'specific_actors', actorIds: ['player-broker', 'owner-1'], baseDelayDays: 0 },
  confidence: 0.95,
  delayDays: 0,
  replayKey: 'rk-42-oi-7-0',
  origin: 'player_action',
  payload: {
    subtype: 'price_discussed',
    summary: '与业主沟通挂牌价，业主期望420万但市场参考价390万',
    ownerId: 'owner-1',
    caseId: 'case-1',
    brokerId: 'player-broker',
    trustLevel: 65,
    priceMentioned: 420,
    tone: 'neutral',
    ownerStatement: '我觉得420万合理，周边成交价都差不多',
    interactionMode: 'scheduled_call',
  },
};

/**
 * Example: comparable_transaction — 周边成交
 */
export const EXAMPLE_COMPARABLE_TXN: InformationSourceRecord<'comparable_transaction'> = {
  sourceId: 'isr-42-comparable_transaction-0',
  sourceKind: 'comparable_transaction',
  day: 10,
  phase: 'morning',
  entityRefs: [{ id: 'cell-1', kind: 'market_cell' }],
  actorRefs: [{ id: 'system', role: 'system' }],
  visibility: { scope: 'all_actors', baseDelayDays: 1 },
  confidence: 0.8,
  delayDays: 1,
  replayKey: 'rk-42-ct-10-0',
  origin: 'daily_settlement',
  payload: {
    subtype: 'deal_closed',
    summary: '和平里板块2室1厅成交价358万，挂牌价370万，折扣3.2%',
    marketCellId: 'cell-1',
    district: '和平里',
    layout: '2室1厅',
    areaSqm: 72,
    price: 358,
    askPrice: 370,
    discountPct: 3.2,
    listingId: 'shadow-listing-12',
    daysOnMarket: 23,
    dataSource: 'platform公开',
  },
};
