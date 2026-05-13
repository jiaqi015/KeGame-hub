/**
 * WorldCausalEvent type family — the causal ledger's vocabulary.
 *
 * A WorldCausalEvent is a structured fact: "on day D, source S caused
 * actor A to observe X, which affected entities E, because of causes C."
 *
 * Mother model alignment:
 * - Section 10: Competition is environment, not side module
 * - Section 13: Causal Transmission (deterministic skeleton + probabilistic kernels)
 * - Section 6: Owner perceives market pressure through structured signals
 * - Section 7: Customer compares, shifts attention, evaluates alternatives
 * - Section 8: Broker interprets and recommends based on evidence chain
 *
 * Hard constraints:
 * - Events are append-only facts, not display copy
 * - No runtime/UI/domain-engine imports
 * - Every event must be traceable by causeEventIds
 * - Confidence is explicit, not implicit
 * - Competition pressure does NOT directly mutate outcomes
 */

// ---------------------------------------------------------------------------
// WorldCausalEventKind: discriminated union tag
// ---------------------------------------------------------------------------

export type WorldCausalEventKind =
  | 'MarketHeatShifted'
  | 'RivalListingRepriced'
  | 'RivalBrokerActionTaken'
  | 'CustomerComparedListings'
  | 'CustomerAttentionShifted'
  | 'OwnerMarketPressurePerceived'
  | 'BrokerRecommendationChanged'
  | 'MatterPriorityChanged'
  | 'OpeningWorldEventImported';

// ---------------------------------------------------------------------------
// WorldCausalEventSource: where this event originated
// ---------------------------------------------------------------------------

export type WorldCausalEventSource =
  | 'market-signal'
  | 'rival-action'
  | 'customer-behavior'
  | 'owner-perception'
  | 'broker-service'
  | 'system-tick'
  | 'opening-snapshot'
  | 'adapted-from-event-store';

// ---------------------------------------------------------------------------
// WorldCausalEventBase: common fields for all causal events
// ---------------------------------------------------------------------------

export interface WorldCausalEventBase {
  /** Deterministic ID. */
  readonly id: string;
  /** Discriminated kind tag. */
  readonly kind: WorldCausalEventKind;
  /** Simulation day. */
  readonly day: number;
  /** Origin of this event. */
  readonly source: WorldCausalEventSource;
  /** Actors who caused or triggered this event. */
  readonly actorIds: readonly string[];
  /** Entities directly referenced by this event. */
  readonly entityIds: readonly string[];
  /** Entities whose state may be affected by this event. */
  readonly affectedIds: readonly string[];
  /** Upstream causal events that led to this one. Empty = root cause. */
  readonly causeEventIds: readonly string[];
  /** Confidence level 0..1. */
  readonly confidence: number;
  /** Structured payload specific to the kind. */
  readonly payload: Record<string, unknown>;
  /** Optional creation timestamp. */
  readonly createdAt?: string;

  // --- Source traceability (set by sourceIngestionAdapter; absent for system-tick events) ---

  /** ID of the InformationSourceRecord that produced this causal event. Absent for self-generated (system-tick) events. */
  readonly sourceRecordId?: string;
  /** ReplayKey of the source record for deterministic traceability. */
  readonly sourceReplayKey?: string;
  /** SourceKind of the originating record. */
  readonly sourceKind?: import('./informationSourceTypes.js').SourceKind;
}

// ---------------------------------------------------------------------------
// Per-kind payload types
// ---------------------------------------------------------------------------

export interface MarketHeatShiftedPayload {
  readonly marketCellId: string;
  readonly before: number;
  readonly after: number;
  readonly sourceSignalId: string;
  readonly sourceSignalType: string;
  readonly confidence: number;
}

export interface RivalListingRepricedPayload {
  readonly listingId: string;
  readonly acnId: string;
  readonly brokerId?: string;
  readonly oldPrice: number;
  readonly newPrice: number;
  readonly priceDelta: number;
  readonly affectedMarketCellIds: readonly string[];
}

export type RivalBrokerActionKind =
  | 'reprice'
  | 'follow_customer'
  | 'push_listing'
  | 'hold_open_day'
  | 'owner_pitch';

export interface RivalBrokerActionTakenPayload {
  readonly brokerId: string;
  readonly acnId: string;
  readonly actionKind: RivalBrokerActionKind;
  readonly energyCost: number;
  readonly actionIntensity: number;
  readonly targetListingId?: string;
  readonly targetMarketCellId?: string;
}

export interface CustomerComparedListingsPayload {
  readonly customerId?: string;
  readonly segmentId?: string;
  readonly comparedListingIds: readonly string[];
  readonly attentionDelta: number;
  readonly reasonSignals: readonly string[];
}

export interface CustomerAttentionShiftedPayload {
  readonly fromListingIds: readonly string[];
  readonly toListingIds: readonly string[];
  readonly segment: string;
  readonly causeEventId: string;
}

export interface OwnerMarketPressurePerceivedPayload {
  readonly ownerId?: string;
  readonly caseId: string;
  readonly perceivedSignalIds: readonly string[];
  readonly pressureDelta: number;
  readonly delayDays: number;
  readonly confidence: number;
}

export type RecommendationKind =
  | 'price_adjustment'
  | 'push_showing'
  | 'activate_open_day'
  | 'hold_open_day'
  | 'escalate_to_manager'
  | 'defend_listing'
  | 'accelerate_buyer'
  | 'reframe_evidence'
  | 'wait_and_see';

export interface BrokerRecommendationChangedPayload {
  readonly caseId: string;
  readonly recommendationKind: RecommendationKind;
  readonly causedByEventIds: readonly string[];
  readonly explanationFacts: readonly string[];
}

export interface MatterPriorityChangedPayload {
  readonly matterId?: string;
  readonly caseId: string;
  readonly priorityBefore: number;
  readonly priorityAfter: number;
  readonly causedByEventIds: readonly string[];
}

export interface OpeningWorldEventImportedPayload {
  readonly originalEventId: string;
  readonly originalTitle: string;
  readonly originalDay: number;
  readonly originalActor: string;
  readonly targetMarketCellId?: string;
  readonly targetCaseId?: string;
}

// ---------------------------------------------------------------------------
// Concrete event types: Omit base 'payload' to allow type narrowing
// ---------------------------------------------------------------------------

export interface MarketHeatShifted extends Omit<WorldCausalEventBase, 'payload'> {
  readonly kind: 'MarketHeatShifted';
  readonly payload: MarketHeatShiftedPayload;
}

export interface RivalListingRepriced extends Omit<WorldCausalEventBase, 'payload'> {
  readonly kind: 'RivalListingRepriced';
  readonly payload: RivalListingRepricedPayload;
}

export interface RivalBrokerActionTaken extends Omit<WorldCausalEventBase, 'payload'> {
  readonly kind: 'RivalBrokerActionTaken';
  readonly payload: RivalBrokerActionTakenPayload;
}

export interface CustomerComparedListings extends Omit<WorldCausalEventBase, 'payload'> {
  readonly kind: 'CustomerComparedListings';
  readonly payload: CustomerComparedListingsPayload;
}

export interface CustomerAttentionShifted extends Omit<WorldCausalEventBase, 'payload'> {
  readonly kind: 'CustomerAttentionShifted';
  readonly payload: CustomerAttentionShiftedPayload;
}

export interface OwnerMarketPressurePerceived extends Omit<WorldCausalEventBase, 'payload'> {
  readonly kind: 'OwnerMarketPressurePerceived';
  readonly payload: OwnerMarketPressurePerceivedPayload;
}

export interface BrokerRecommendationChanged extends Omit<WorldCausalEventBase, 'payload'> {
  readonly kind: 'BrokerRecommendationChanged';
  readonly payload: BrokerRecommendationChangedPayload;
}

export interface MatterPriorityChanged extends Omit<WorldCausalEventBase, 'payload'> {
  readonly kind: 'MatterPriorityChanged';
  readonly payload: MatterPriorityChangedPayload;
}

export interface OpeningWorldEventImported extends Omit<WorldCausalEventBase, 'payload'> {
  readonly kind: 'OpeningWorldEventImported';
  readonly payload: OpeningWorldEventImportedPayload;
}

// ---------------------------------------------------------------------------
// WorldCausalEvent: discriminated union of all causal event types
// ---------------------------------------------------------------------------

export type WorldCausalEvent =
  | MarketHeatShifted
  | RivalListingRepriced
  | RivalBrokerActionTaken
  | CustomerComparedListings
  | CustomerAttentionShifted
  | OwnerMarketPressurePerceived
  | BrokerRecommendationChanged
  | MatterPriorityChanged
  | OpeningWorldEventImported;

// ---------------------------------------------------------------------------
// Builders: pure, deterministic, frozen
// ---------------------------------------------------------------------------

function makeBase(
  id: string,
  kind: WorldCausalEventKind,
  day: number,
  source: WorldCausalEventSource,
  opts: {
    actorIds?: readonly string[];
    entityIds?: readonly string[];
    affectedIds?: readonly string[];
    causeEventIds?: readonly string[];
    confidence?: number;
    createdAt?: string;
    sourceRecordId?: string;
    sourceReplayKey?: string;
    sourceKind?: import('./informationSourceTypes.js').SourceKind;
  },
): WorldCausalEventBase {
  return Object.freeze({
    id,
    kind,
    day,
    source,
    actorIds: Object.freeze([...(opts.actorIds ?? [])]),
    entityIds: Object.freeze([...(opts.entityIds ?? [])]),
    affectedIds: Object.freeze([...(opts.affectedIds ?? [])]),
    causeEventIds: Object.freeze([...(opts.causeEventIds ?? [])]),
    confidence: opts.confidence ?? 1,
    payload: {},
    createdAt: opts.createdAt,
    sourceRecordId: opts.sourceRecordId,
    sourceReplayKey: opts.sourceReplayKey,
    sourceKind: opts.sourceKind,
  });
}

export function buildMarketHeatShifted(
  id: string,
  day: number,
  payload: MarketHeatShiftedPayload,
  opts?: { actorIds?: readonly string[]; causeEventIds?: readonly string[]; createdAt?: string; sourceRecordId?: string; sourceReplayKey?: string; sourceKind?: import('./informationSourceTypes.js').SourceKind },
): MarketHeatShifted {
  const base = makeBase(id, 'MarketHeatShifted', day, 'market-signal', {
    actorIds: opts?.actorIds,
    entityIds: [payload.marketCellId],
    affectedIds: [payload.marketCellId],
    causeEventIds: opts?.causeEventIds,
    confidence: payload.confidence,
    createdAt: opts?.createdAt,
    sourceRecordId: opts?.sourceRecordId,
    sourceReplayKey: opts?.sourceReplayKey,
    sourceKind: opts?.sourceKind,
  });
  return Object.freeze({ ...base, kind: 'MarketHeatShifted' as const, payload: Object.freeze(payload) });
}

export function buildRivalListingRepriced(
  id: string,
  day: number,
  payload: RivalListingRepricedPayload,
  opts?: { actorIds?: readonly string[]; causeEventIds?: readonly string[]; createdAt?: string; sourceRecordId?: string; sourceReplayKey?: string; sourceKind?: import('./informationSourceTypes.js').SourceKind },
): RivalListingRepriced {
  const base = makeBase(id, 'RivalListingRepriced', day, 'rival-action', {
    actorIds: opts?.actorIds ?? (payload.brokerId ? [payload.brokerId] : []),
    entityIds: [payload.listingId, payload.acnId],
    affectedIds: [payload.listingId, ...payload.affectedMarketCellIds],
    causeEventIds: opts?.causeEventIds,
    confidence: 1,
    createdAt: opts?.createdAt,
    sourceRecordId: opts?.sourceRecordId,
    sourceReplayKey: opts?.sourceReplayKey,
    sourceKind: opts?.sourceKind,
  });
  return Object.freeze({ ...base, kind: 'RivalListingRepriced' as const, payload: Object.freeze(payload) });
}

export function buildRivalBrokerActionTaken(
  id: string,
  day: number,
  payload: RivalBrokerActionTakenPayload,
  opts?: { actorIds?: readonly string[]; causeEventIds?: readonly string[]; createdAt?: string; sourceRecordId?: string; sourceReplayKey?: string; sourceKind?: import('./informationSourceTypes.js').SourceKind },
): RivalBrokerActionTaken {
  const entityIds = [payload.brokerId, payload.acnId];
  if (payload.targetListingId) entityIds.push(payload.targetListingId);
  const affectedIds = payload.targetListingId ? [payload.targetListingId] : [];
  if (payload.targetMarketCellId) affectedIds.push(payload.targetMarketCellId);
  const base = makeBase(id, 'RivalBrokerActionTaken', day, 'rival-action', {
    actorIds: opts?.actorIds ?? [payload.brokerId],
    entityIds,
    affectedIds,
    causeEventIds: opts?.causeEventIds,
    confidence: 1,
    createdAt: opts?.createdAt,
    sourceRecordId: opts?.sourceRecordId,
    sourceReplayKey: opts?.sourceReplayKey,
    sourceKind: opts?.sourceKind,
  });
  return Object.freeze({ ...base, kind: 'RivalBrokerActionTaken' as const, payload: Object.freeze(payload) });
}

export function buildCustomerComparedListings(
  id: string,
  day: number,
  payload: CustomerComparedListingsPayload,
  opts?: { actorIds?: readonly string[]; causeEventIds?: readonly string[]; createdAt?: string; sourceRecordId?: string; sourceReplayKey?: string; sourceKind?: import('./informationSourceTypes.js').SourceKind },
): CustomerComparedListings {
  const entityIds = payload.customerId ? [payload.customerId] : (payload.segmentId ? [payload.segmentId] : []);
  const base = makeBase(id, 'CustomerComparedListings', day, 'customer-behavior', {
    actorIds: opts?.actorIds,
    entityIds,
    affectedIds: [...payload.comparedListingIds],
    causeEventIds: opts?.causeEventIds,
    confidence: 1,
    createdAt: opts?.createdAt,
    sourceRecordId: opts?.sourceRecordId,
    sourceReplayKey: opts?.sourceReplayKey,
    sourceKind: opts?.sourceKind,
  });
  return Object.freeze({ ...base, kind: 'CustomerComparedListings' as const, payload: Object.freeze(payload) });
}

export function buildCustomerAttentionShifted(
  id: string,
  day: number,
  payload: CustomerAttentionShiftedPayload,
  opts?: { actorIds?: readonly string[]; createdAt?: string; sourceRecordId?: string; sourceReplayKey?: string; sourceKind?: import('./informationSourceTypes.js').SourceKind },
): CustomerAttentionShifted {
  const affectedIds = [...payload.fromListingIds, ...payload.toListingIds];
  const base = makeBase(id, 'CustomerAttentionShifted', day, 'customer-behavior', {
    actorIds: opts?.actorIds,
    entityIds: affectedIds,
    affectedIds,
    causeEventIds: [payload.causeEventId],
    confidence: 1,
    createdAt: opts?.createdAt,
    sourceRecordId: opts?.sourceRecordId,
    sourceReplayKey: opts?.sourceReplayKey,
    sourceKind: opts?.sourceKind,
  });
  return Object.freeze({ ...base, kind: 'CustomerAttentionShifted' as const, payload: Object.freeze(payload) });
}

export function buildOwnerMarketPressurePerceived(
  id: string,
  day: number,
  payload: OwnerMarketPressurePerceivedPayload,
  opts?: { actorIds?: readonly string[]; causeEventIds?: readonly string[]; createdAt?: string; sourceRecordId?: string; sourceReplayKey?: string; sourceKind?: import('./informationSourceTypes.js').SourceKind },
): OwnerMarketPressurePerceived {
  const entityIds = [payload.caseId];
  if (payload.ownerId) entityIds.push(payload.ownerId);
  const base = makeBase(id, 'OwnerMarketPressurePerceived', day, 'owner-perception', {
    actorIds: opts?.actorIds ?? (payload.ownerId ? [payload.ownerId] : []),
    entityIds,
    affectedIds: [payload.caseId],
    causeEventIds: opts?.causeEventIds ?? payload.perceivedSignalIds,
    confidence: payload.confidence,
    createdAt: opts?.createdAt,
    sourceRecordId: opts?.sourceRecordId,
    sourceReplayKey: opts?.sourceReplayKey,
    sourceKind: opts?.sourceKind,
  });
  return Object.freeze({ ...base, kind: 'OwnerMarketPressurePerceived' as const, payload: Object.freeze(payload) });
}

export function buildBrokerRecommendationChanged(
  id: string,
  day: number,
  payload: BrokerRecommendationChangedPayload,
  opts?: { actorIds?: readonly string[]; createdAt?: string; sourceRecordId?: string; sourceReplayKey?: string; sourceKind?: import('./informationSourceTypes.js').SourceKind },
): BrokerRecommendationChanged {
  const base = makeBase(id, 'BrokerRecommendationChanged', day, 'broker-service', {
    actorIds: opts?.actorIds,
    entityIds: [payload.caseId],
    affectedIds: [payload.caseId],
    causeEventIds: payload.causedByEventIds,
    confidence: 1,
    createdAt: opts?.createdAt,
    sourceRecordId: opts?.sourceRecordId,
    sourceReplayKey: opts?.sourceReplayKey,
    sourceKind: opts?.sourceKind,
  });
  return Object.freeze({ ...base, kind: 'BrokerRecommendationChanged' as const, payload: Object.freeze(payload) });
}

export function buildMatterPriorityChanged(
  id: string,
  day: number,
  payload: MatterPriorityChangedPayload,
  opts?: { actorIds?: readonly string[]; createdAt?: string; sourceRecordId?: string; sourceReplayKey?: string; sourceKind?: import('./informationSourceTypes.js').SourceKind },
): MatterPriorityChanged {
  const entityIds = [payload.caseId];
  if (payload.matterId) entityIds.push(payload.matterId);
  const base = makeBase(id, 'MatterPriorityChanged', day, 'broker-service', {
    actorIds: opts?.actorIds,
    entityIds,
    affectedIds: [payload.caseId],
    causeEventIds: payload.causedByEventIds,
    confidence: 1,
    createdAt: opts?.createdAt,
    sourceRecordId: opts?.sourceRecordId,
    sourceReplayKey: opts?.sourceReplayKey,
    sourceKind: opts?.sourceKind,
  });
  return Object.freeze({ ...base, kind: 'MatterPriorityChanged' as const, payload: Object.freeze(payload) });
}

export function buildOpeningWorldEventImported(
  id: string,
  day: number,
  payload: OpeningWorldEventImportedPayload,
  opts?: { actorIds?: readonly string[]; createdAt?: string; sourceRecordId?: string; sourceReplayKey?: string; sourceKind?: import('./informationSourceTypes.js').SourceKind },
): OpeningWorldEventImported {
  const affectedIds: string[] = [];
  if (payload.targetCaseId) affectedIds.push(payload.targetCaseId);
  if (payload.targetMarketCellId) affectedIds.push(payload.targetMarketCellId);
  const base = makeBase(id, 'OpeningWorldEventImported', day, 'opening-snapshot', {
    actorIds: opts?.actorIds ?? [payload.originalActor],
    entityIds: [payload.originalEventId],
    affectedIds,
    causeEventIds: [],
    confidence: 0.8,
    createdAt: opts?.createdAt,
    sourceRecordId: opts?.sourceRecordId,
    sourceReplayKey: opts?.sourceReplayKey,
    sourceKind: opts?.sourceKind,
  });
  return Object.freeze({ ...base, kind: 'OpeningWorldEventImported' as const, payload: Object.freeze(payload) });
}
