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
//   - No network calls, wall-clock reads, non-seeded RNG, or LLM provider calls
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
// SourceKind — re-exported from core (canonical location)
// ════════════════════════════════════════════════════════════════════════════

/**
 * SourceKind is defined in core/world-state/sourceKinds.ts to avoid
 * core→domain layer boundary violations. Domain re-exports it here
 * for backward compatibility with all existing domain consumers.
 */
import type { SourceKind } from '../../core/world-state/sourceKinds.js';
export type { SourceKind };

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
  | 'dropout_detected'
  | 'family_decision_involved';

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
  | 'rule_change'
  | 'cross_district_competition';

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

// --- supporting_facility_signal (Round 8: #11) ---

export type SupportingFacilitySubtype =
  | 'school_district_changed'
  | 'transit_access_changed'
  | 'commercial_development'
  | 'community_environment_shift'
  | 'policy_change'
  | 'noise_complaint'
  | 'building_condition_update'
  | 'property_feature_update'
  | 'community_info_changed'
  | 'community_management_changed';

export interface SupportingFacilitySignalPayload extends SourcePayloadBase {
  readonly subtype: SupportingFacilitySubtype;
  /** Related market cell. */
  readonly marketCellId: string;
  /** Related case/listing id (if applicable). */
  readonly caseId?: string;
  /** Facility type: 'school' | 'transit' | 'commercial' | 'community' | 'policy' | 'noise' | 'building' | 'property' | 'community_mgmt'. */
  readonly facilityType: 'school' | 'transit' | 'commercial' | 'community' | 'policy' | 'noise' | 'building' | 'property' | 'community_mgmt';
  /** Before rating/score (0-100). */
  readonly before: number;
  /** After rating/score (0-100). */
  readonly after: number;
  /** Source of the signal. */
  readonly dataSource: 'government_notice' | 'community_report' | 'platform_data' | 'broker_observation' | 'media';
}

// --- broker_capacity_signal (Round 8: #12) ---

export type BrokerCapacitySubtype =
  | 'energy_depleted'
  | 'schedule_overloaded'
  | 'collaboration_requested'
  | 'organizational_pressure'
  | 'skill_gap_detected'
  | 'workload_balanced'
  | 'local_expertise_detected'
  | 'acn_collaboration_strength';

export interface BrokerCapacitySignalPayload extends SourcePayloadBase {
  readonly subtype: BrokerCapacitySubtype;
  /** Broker id. */
  readonly brokerId: string;
  /** Broker's ACN id. */
  readonly acnId: string;
  /** Current energy level (0-100). */
  readonly energyLevel: number;
  /** Current schedule utilization (0-100). */
  readonly scheduleUtilization: number;
  /** Active case count. */
  readonly activeCaseCount: number;
  /** Related case ids affected by capacity change. */
  readonly affectedCaseIds: readonly string[];
  /** Pressure magnitude (0-100). */
  readonly pressureMagnitude: number;
}

// --- owner_life_event_signal (Round 8: #13) ---

export type OwnerLifeEventSubtype =
  | 'family_change'
  | 'financial_need'
  | 'relocation_planned'
  | 'health_issue'
  | 'job_change'
  | 'inheritance_received'
  | 'divorce_proceedings';

export interface OwnerLifeEventSignalPayload extends SourcePayloadBase {
  readonly subtype: OwnerLifeEventSubtype;
  /** Owner id. */
  readonly ownerId: string;
  /** Related case id. */
  readonly caseId: string;
  /** Impact on selling urgency (negative = less urgent, positive = more urgent). */
  readonly urgencyImpact: number;
  /** Impact on price flexibility (negative = less flexible, positive = more flexible). */
  readonly priceFlexibilityImpact: number;
  /** Impact on trust in broker (-100 to 100). */
  readonly trustImpact: number;
  /** Timeline hint: how soon the event affects decisions (days). */
  readonly timelineDays: number;
  /** Confidence that this life event is real (0-1). */
  readonly eventConfidence: number;
}

// --- buyer_financing_signal (Round 8: #14) ---

export type BuyerFinancingSubtype =
  | 'loan_pre_approved'
  | 'loan_rejected'
  | 'down_payment_ready'
  | 'budget_adjusted'
  | 'family_veto'
  | 'co_buyer_added'
  | 'qualification_expired';

export interface BuyerFinancingSignalPayload extends SourcePayloadBase {
  readonly subtype: BuyerFinancingSubtype;
  /** Customer id. */
  readonly customerId: string;
  /** Related case id (if applicable). */
  readonly caseId?: string;
  /** Related opportunity id. */
  readonly opportunityId?: string;
  /** Budget before adjustment. */
  readonly budgetBefore?: number;
  /** Budget after adjustment. */
  readonly budgetAfter?: number;
  /** Loan approval amount (万元). */
  readonly loanAmount?: number;
  /** Down payment available (万元). */
  readonly downPayment?: number;
  /** Impact on customer readiness (-100 to 100). */
  readonly readinessImpact: number;
}

// --- micro_market_signal (Round 8: #15) ---

export type MicroMarketSubtype =
  | 'supply_increased'
  | 'supply_decreased'
  | 'demand_shift'
  | 'price_band_squeeze'
  | 'inventory_absorption'
  | 'new_development_announced';

export interface MicroMarketSignalPayload extends SourcePayloadBase {
  readonly subtype: MicroMarketSubtype;
  /** Micro-market cell id (can be same as market_cell or more specific). */
  readonly microMarketCellId: string;
  /** Parent market cell id. */
  readonly marketCellId: string;
  /** Supply count change. */
  readonly supplyDelta: number;
  /** Demand index change. */
  readonly demandDelta: number;
  /** Price band affected (e.g. "200-300万"). */
  readonly priceBand: string;
  /** Inventory absorption rate (0-100). */
  readonly absorptionRate: number;
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
  | AcnNetworkSignalPayload
  | SupportingFacilitySignalPayload
  | BrokerCapacitySignalPayload
  | OwnerLifeEventSignalPayload
  | BuyerFinancingSignalPayload
  | MicroMarketSignalPayload;

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
  supporting_facility_signal: SupportingFacilitySignalPayload;
  broker_capacity_signal: BrokerCapacitySignalPayload;
  owner_life_event_signal: OwnerLifeEventSignalPayload;
  buyer_financing_signal: BuyerFinancingSignalPayload;
  micro_market_signal: MicroMarketSignalPayload;
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
// InformationDomain — the 8 information domains
// ════════════════════════════════════════════════════════════════════════════

/**
 * The 8 information domains that cover all real-world information in the
 * selling-houses ecosystem.
 *
 * Each domain maps to a set of SourceKinds, causal event types,
 * belief domains, and product surfaces.
 */
export type InformationDomain =
  | 'property_physical'      // 房源物理信息
  | 'neighborhood'           // 小区环境
  | 'owner_state'            // 业主信息
  | 'customer_state'         // 客户信息
  | 'broker_capability'      // 经纪人信息
  | 'competition'            // 竞品信息
  | 'organization'           // 组织信息
  | 'temporal';              // 时间信息

/**
 * Belief domains that actors can form beliefs about.
 * Maps 1:1 to InformationDomain for the decision pipeline.
 */
export type BeliefDomain =
  | 'price_anchor'           // 业主价格预期
  | 'neighborhood_quality'   // 小区环境质量
  | 'owner_readiness'        // 业主出售意愿
  | 'customer_seriousness'   // 客户购买意向
  | 'broker_capability'      // 经纪人能力
  | 'rival_threat'           // 竞品威胁
  | 'organization_pressure'  // 组织压力
  | 'market_timing';         // 市场时机

// ════════════════════════════════════════════════════════════════════════════
// InformationDomainCoverage — domain → source → causal → belief → product
// ════════════════════════════════════════════════════════════════════════════

/**
 * Complete coverage mapping for one information domain.
 *
 * This is the "contract" that guarantees every domain has a full pipeline:
 *   source record → causal event → actor belief → decision → product surface
 *
 * A domain without any entry in this table cannot enter product judgment.
 */
export interface InformationDomainCoverage {
  /** The domain. */
  readonly domain: InformationDomain;
  /** Human-readable label. */
  readonly label: string;
  /** Source kinds that feed this domain. */
  readonly sourceKinds: readonly SourceKind[];
  /** Subtypes within each source kind that are relevant. */
  readonly relevantSubtypes: Readonly<Record<string, readonly string[]>>;
  /** Causal event kinds that this domain can produce. */
  readonly causalEventKinds: readonly string[];
  /** Belief domain this maps to. */
  readonly beliefDomain: BeliefDomain;
  /** Default visibility for records in this domain. */
  readonly defaultVisibility: VisibilityScope;
  /** Default delay in days. */
  readonly defaultDelayDays: number;
  /** Product surfaces that consume this domain's beliefs. */
  readonly productSurfaces: readonly string[];
}

/**
 * The complete domain coverage table.
 * Every domain MUST have at least 3 distinct source records, 1 causal event,
 * 1 belief domain, and 1 product surface.
 */
export const INFORMATION_DOMAIN_COVERAGE: readonly InformationDomainCoverage[] = [
  {
    domain: 'property_physical',
    label: '房源物理信息',
    sourceKinds: ['supporting_facility_signal'],
    relevantSubtypes: {
      supporting_facility_signal: ['property_feature_update', 'building_condition_update', 'noise_complaint'],
    },
    causalEventKinds: ['MarketHeatShifted', 'OwnerMarketPressurePerceived'],
    beliefDomain: 'price_anchor',
    defaultVisibility: 'all_actors',
    defaultDelayDays: 0,
    productSurfaces: ['bigWorldPOV', 'ownerExpectation', 'comparableSupply'],
  },
  {
    domain: 'neighborhood',
    label: '小区环境',
    sourceKinds: ['supporting_facility_signal', 'market_signal', 'comparable_transaction'],
    relevantSubtypes: {
      supporting_facility_signal: ['school_district_changed', 'transit_access_changed', 'commercial_development', 'community_environment_shift', 'community_info_changed', 'community_management_changed'],
      market_signal: ['heat_shift', 'inventory_change'],
      comparable_transaction: ['deal_closed'],
    },
    causalEventKinds: ['MarketHeatShifted', 'OwnerMarketPressurePerceived', 'CustomerAttentionShifted'],
    beliefDomain: 'neighborhood_quality',
    defaultVisibility: 'all_actors',
    defaultDelayDays: 1,
    productSurfaces: ['marketCell', 'comparableSupply', 'demandMovement'],
  },
  {
    domain: 'owner_state',
    label: '业主信息',
    sourceKinds: ['owner_interview', 'owner_life_event_signal', 'comparable_transaction'],
    relevantSubtypes: {
      owner_interview: ['price_discussed', 'urgency_revealed', 'objection_raised', 'trust_expressed', 'trust_withdrawn', 'expectation_adjusted', 'withdrawal_threatened'],
      owner_life_event_signal: ['family_change', 'financial_need', 'relocation_planned', 'divorce_proceedings', 'family_member_involved'],
      comparable_transaction: ['deal_closed', 'price_adjusted'],
    },
    causalEventKinds: ['OwnerMarketPressurePerceived', 'BrokerRecommendationChanged'],
    beliefDomain: 'owner_readiness',
    defaultVisibility: 'specific_actors',
    defaultDelayDays: 0,
    productSurfaces: ['ownerExpectation', 'followUpPriority', 'wechatAlerts'],
  },
  {
    domain: 'customer_state',
    label: '客户信息',
    sourceKinds: ['customer_interaction', 'buyer_financing_signal', 'platform_traffic'],
    relevantSubtypes: {
      customer_interaction: ['viewing_completed', 'revisit_scheduled', 'offer_submitted', 'offer_rejected', 'comparison_made', 'preference_shifted', 'budget_adjusted', 'dropout_detected', 'family_decision_involved'],
      buyer_financing_signal: ['loan_pre_approved', 'loan_rejected', 'down_payment_ready', 'budget_adjusted', 'family_veto', 'co_buyer_added', 'qualification_expired'],
      platform_traffic: ['listing_viewed', 'listing_favorited', 'inquiry_received'],
    },
    causalEventKinds: ['CustomerComparedListings', 'CustomerAttentionShifted', 'BrokerRecommendationChanged'],
    beliefDomain: 'customer_seriousness',
    defaultVisibility: 'specific_actors',
    defaultDelayDays: 0,
    productSurfaces: ['demandMovement', 'followUpPriority', 'wechatAlerts'],
  },
  {
    domain: 'broker_capability',
    label: '经纪人信息',
    sourceKinds: ['broker_capacity_signal', 'acn_network_signal', 'player_action_receipt'],
    relevantSubtypes: {
      broker_capacity_signal: ['energy_depleted', 'schedule_overloaded', 'collaboration_requested', 'organizational_pressure', 'skill_gap_detected', 'workload_balanced', 'local_expertise_detected', 'acn_collaboration_strength'],
      acn_network_signal: ['cooperation_opportunity', 'info_share_received', 'credit_allocation'],
      player_action_receipt: ['action_executed', 'action_blocked', 'action_failed'],
    },
    causalEventKinds: ['BrokerRecommendationChanged', 'MatterPriorityChanged', 'RivalBrokerActionTaken'],
    beliefDomain: 'broker_capability',
    defaultVisibility: 'broker_chain',
    defaultDelayDays: 0,
    productSurfaces: ['brokerActionPressure', 'followUpPriority', 'bigWorldPOV'],
  },
  {
    domain: 'competition',
    label: '竞品信息',
    sourceKinds: ['rival_action', 'acn_network_signal', 'comparable_transaction', 'micro_market_signal'],
    relevantSubtypes: {
      rival_action: ['reprice', 'new_listing', 'withdraw_listing', 'open_day_held', 'customer_followed', 'owner_pitched', 'deal_closed'],
      acn_network_signal: ['competition_escalation', 'conflict_detected', 'cross_district_competition'],
      comparable_transaction: ['deal_closed', 'price_adjusted', 'listing_withdrawn'],
      micro_market_signal: ['supply_increased', 'supply_decreased', 'demand_shift', 'price_band_squeeze'],
    },
    causalEventKinds: ['RivalListingRepriced', 'RivalBrokerActionTaken', 'MarketHeatShifted', 'CustomerAttentionShifted'],
    beliefDomain: 'rival_threat',
    defaultVisibility: 'all_actors',
    defaultDelayDays: 1,
    productSurfaces: ['comparableSupply', 'brokerActionPressure', 'becauseBigProof'],
  },
  {
    domain: 'organization',
    label: '组织信息',
    sourceKinds: ['manager_message', 'acn_network_signal', 'broker_capacity_signal'],
    relevantSubtypes: {
      manager_message: ['focus_case_selected', 'resource_allocated', 'escalation_requested', 'coaching_delivered', 'performance_review', 'strategic_direction'],
      acn_network_signal: ['credit_allocation', 'rule_change'],
      broker_capacity_signal: ['organizational_pressure', 'workload_balanced'],
    },
    causalEventKinds: ['MatterPriorityChanged', 'BrokerRecommendationChanged'],
    beliefDomain: 'organization_pressure',
    defaultVisibility: 'broker_chain',
    defaultDelayDays: 0,
    productSurfaces: ['followUpPriority', 'wechatAlerts', 'managerView'],
  },
  {
    domain: 'temporal',
    label: '时间信息',
    sourceKinds: ['market_signal', 'comparable_transaction', 'process_receipt'],
    relevantSubtypes: {
      market_signal: ['seasonal_pattern', 'demand_shift'],
      comparable_transaction: ['deal_closed', 'listing_expired'],
      process_receipt: ['deal_signed', 'case_withdrawn', 'consensus_reached', 'consensus_collapsed'],
    },
    causalEventKinds: ['MarketHeatShifted', 'OwnerMarketPressurePerceived', 'BrokerRecommendationChanged'],
    beliefDomain: 'market_timing',
    defaultVisibility: 'all_actors',
    defaultDelayDays: 0,
    productSurfaces: ['marketCell', 'becauseBigProof', 'ownerExpectation'],
  },
];

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
  // --- Round 8: New source kinds (11-15) ---
  {
    sourceKind: 'supporting_facility_signal',
    possibleCausalKinds: ['MarketHeatShifted', 'OwnerMarketPressurePerceived'],
    isRootCause: true,
    confidenceRange: { min: 0.5, max: 0.9 },
    typicalDelayDays: { min: 0, max: 5 },
  },
  {
    sourceKind: 'broker_capacity_signal',
    possibleCausalKinds: ['BrokerRecommendationChanged', 'MatterPriorityChanged'],
    isRootCause: false,
    confidenceRange: { min: 0.7, max: 1.0 },
    typicalDelayDays: { min: 0, max: 1 },
  },
  {
    sourceKind: 'owner_life_event_signal',
    possibleCausalKinds: ['OwnerMarketPressurePerceived', 'BrokerRecommendationChanged'],
    isRootCause: true,
    confidenceRange: { min: 0.5, max: 0.85 },
    typicalDelayDays: { min: 0, max: 3 },
  },
  {
    sourceKind: 'buyer_financing_signal',
    possibleCausalKinds: ['BrokerRecommendationChanged', 'MatterPriorityChanged'],
    isRootCause: false,
    confidenceRange: { min: 0.6, max: 0.95 },
    typicalDelayDays: { min: 0, max: 2 },
  },
  {
    sourceKind: 'micro_market_signal',
    possibleCausalKinds: ['MarketHeatShifted', 'CustomerAttentionShifted'],
    isRootCause: true,
    confidenceRange: { min: 0.5, max: 0.85 },
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
