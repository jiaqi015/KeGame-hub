/**
 * Source Ingestion Adapter — converts InformationSourceRecord[] into
 * WorldCausalEvent[] and BigWorldDailyEvent[].
 *
 * This is the bridge between the information source layer (append-only records)
 * and the runtime causal event layer. It does NOT mutate any GameState entity
 * (no case.status, no opportunity.status, no trust/patience/urgency).
 *
 * Design principles:
 *   - Pure function: same input → same output (deterministic)
 *   - No hidden source truth leaks: visibility policy is respected
 *   - Each source record maps to 0..N causal events via SOURCE_TO_CAUSAL_MAP
 *   - Causal events carry sourceId + replayKey for traceability
 *   - Old saves with empty sourceRecords produce empty output (no regression)
 *
 * Mother model alignment:
 *   - Section 9: POV And Interaction Design
 *     "InformationSourceRecord → Actor POV → decision"
 *   - Section 13: Causal Transmission
 *     source signal → actor receives → belief/pressure changes
 *   - Section 8: Broker Service Essence
 *     raw information → interpretation → decision frame
 */

import type {
  InformationSourceRecord,
  SourceKind,
  MarketSignalPayload,
  RivalActionPayload,
  CustomerInteractionPayload,
  OwnerInterviewPayload,
  ManagerMessagePayload,
  PlayerActionReceiptPayload,
  ProcessReceiptPayload,
  ComparableTransactionPayload,
  PlatformTrafficPayload,
  AcnNetworkSignalPayload,
  SupportingFacilitySignalPayload,
  BrokerCapacitySignalPayload,
  OwnerLifeEventSignalPayload,
  BuyerFinancingSignalPayload,
  MicroMarketSignalPayload,
} from '../informationSourceTypes.js';

import {
  buildMarketHeatShifted,
  buildRivalListingRepriced,
  buildRivalBrokerActionTaken,
  buildCustomerComparedListings,
  buildCustomerAttentionShifted,
  buildOwnerMarketPressurePerceived,
  buildBrokerRecommendationChanged,
  buildMatterPriorityChanged,
} from '../causalEvents.js';

import type {
  WorldCausalEvent,
  WorldCausalEventKind,
} from '../causalEvents.js';

import type {
  BigWorldDailyEvent,
  BigWorldEventVisibility,
} from './types.js';

// ════════════════════════════════════════════════════════════════════════════
// SourceIngestionReceipt — output of one ingestion pass
// ════════════════════════════════════════════════════════════════════════════

/**
 * Receipt from ingesting a batch of InformationSourceRecords.
 * Contains the generated events and metadata for downstream consumers.
 */
export interface SourceIngestionReceipt {
  /** Day the ingestion occurred. */
  readonly day: number;
  /** Number of source records processed. */
  readonly sourcesProcessed: number;
  /** Number of source records that produced at least one causal event. */
  readonly sourcesWithEffect: number;
  /** Number of source records skipped (no matching causal kind or visibility=hidden). */
  readonly sourcesSkipped: number;
  /** Generated causal events (append to worldCausalEvents). */
  readonly causalEvents: readonly WorldCausalEvent[];
  /** Generated daily events (append to bigWorldRuntime.dailyEvents). */
  readonly dailyEvents: readonly BigWorldDailyEvent[];
  /** Per-source-kind breakdown. */
  readonly byKind: ReadonlyMap<SourceKind, {
    readonly count: number;
    readonly causalEventsProduced: number;
    readonly skipped: number;
  }>;
  /** Replay key for this ingestion batch. */
  readonly replayKey: string;
  /**
   * Source-to-events mapping: each source record's sourceId → the causal event IDs it produced.
   * This is the hard traceability index: sourceId → event IDs.
   */
  readonly sourceToEvents: ReadonlyMap<string, readonly string[]>;
  // --- Batch-level tracking (hundred-scale) ---
  /** Total causal events produced (same as causalEvents.length, but pre-computed for perf). */
  readonly totalCausalEventsProduced: number;
  /** Total daily events produced (same as dailyEvents.length, pre-computed). */
  readonly totalDailyEventsProduced: number;
  /** Ingestion batch duration in microseconds (for perf tracking). */
  readonly batchDurationUs: number;
  /** Number of unique sourceKinds in this batch. */
  readonly uniqueSourceKindCount: number;
}

// ════════════════════════════════════════════════════════════════════════════
// Visibility policy → BigWorldEventVisibility mapping
// ════════════════════════════════════════════════════════════════════════════

/**
 * Map source record visibility to runtime event visibility hint.
 * Hidden sources produce 'hidden' events; public sources produce 'signal'.
 * Player-specific sources produce 'actionable' events.
 */
function resolveVisibilityHint(
  record: InformationSourceRecord,
): BigWorldEventVisibility {
  switch (record.visibility.scope) {
    case 'no_one':
      return 'hidden';
    case 'all_actors':
      return record.sourceKind === 'player_action_receipt' ? 'actionable' : 'signal';
    case 'specific_actors': {
      const ids = record.visibility.actorIds ?? [];
      // If player_broker is in the list, this is actionable for the player
      if (ids.some((id) => id.startsWith('player'))) return 'actionable';
      return 'signal';
    }
    case 'owner_only':
      return 'signal';
    case 'broker_chain':
      return 'signal';
    case 'player_only':
      return 'actionable';
    default:
      return 'signal';
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Per-kind causal event builders
// ════════════════════════════════════════════════════════════════════════════

/**
 * Source link opts extracted from an InformationSourceRecord.
 * Passed to every causal event builder for hard traceability.
 */
function sourceLinkOpts(record: InformationSourceRecord): {
  readonly sourceRecordId: string;
  readonly sourceReplayKey: string;
  readonly sourceKind: SourceKind;
} {
  return {
    sourceRecordId: record.sourceId,
    sourceReplayKey: record.replayKey,
    sourceKind: record.sourceKind,
  };
}

/**
 * Extract entity IDs from a source record for causal event linking.
 */
function extractEntityIds(record: InformationSourceRecord): readonly string[] {
  return record.entityRefs.map((ref) => ref.id);
}

/**
 * Extract actor IDs from a source record for causal event linking.
 */
function extractActorIds(record: InformationSourceRecord): readonly string[] {
  return record.actorRefs.map((ref) => ref.id);
}

type SourcePayloadView = Readonly<Record<string, unknown>>;
type EntityRefKind = InformationSourceRecord['entityRefs'][number]['kind'];

function payloadView(record: InformationSourceRecord): SourcePayloadView {
  return record.payload as unknown as SourcePayloadView;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function stringValue(value: unknown, fallback: string): string {
  return optionalString(value) ?? fallback;
}

function numberValue(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function stringArrayValue(value: unknown): readonly string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
}

function firstEntityId(
  record: InformationSourceRecord,
  kind?: EntityRefKind,
): string | undefined {
  const match = kind
    ? record.entityRefs.find((ref) => ref.kind === kind)
    : record.entityRefs[0];
  return match?.id;
}

function firstActorId(record: InformationSourceRecord, role?: string): string | undefined {
  const match = role
    ? record.actorRefs.find((ref) => ref.role === role)
    : record.actorRefs[0];
  return match?.id;
}

function uniqueStrings(values: readonly (string | undefined)[]): readonly string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function actorIdsWithSource(
  record: InformationSourceRecord,
  explicit: readonly (string | undefined)[] = [],
): readonly string[] {
  return uniqueStrings([...explicit, ...extractActorIds(record)]);
}

function safeCaseId(record: InformationSourceRecord, explicit?: unknown): string {
  return optionalString(explicit)
    ?? firstEntityId(record, 'case')
    ?? firstEntityId(record, 'listing')
    ?? firstEntityId(record)
    ?? 'unknown-case';
}

function safeListingId(record: InformationSourceRecord, explicit?: unknown): string | undefined {
  return optionalString(explicit)
    ?? firstEntityId(record, 'listing')
    ?? firstEntityId(record, 'case');
}

function safeMarketCellId(record: InformationSourceRecord, explicit?: unknown): string {
  return optionalString(explicit)
    ?? firstEntityId(record, 'market_cell')
    ?? firstEntityId(record)
    ?? 'unknown-market-cell';
}

function safeSubtype(record: InformationSourceRecord, fallback = record.sourceKind): string {
  return stringValue(payloadView(record).subtype, fallback);
}

function buildFallbackSourceEvent(
  record: InformationSourceRecord,
  index: number,
  reason: 'empty_builder' | 'builder_exception',
): readonly WorldCausalEvent[] {
  const baseId = `ingest-fallback-${record.day}-${record.sourceId}-${index}`;
  return [
    buildBrokerRecommendationChanged(
      `${baseId}-rec`,
      record.day,
      {
        caseId: safeCaseId(record),
        recommendationKind: 'wait_and_see',
        causedByEventIds: [record.sourceId],
        explanationFacts: [
          `信息源进入因果链: ${record.sourceKind}/${safeSubtype(record)}`,
          `稀疏信息容错: ${reason}`,
        ],
      },
      {
        actorIds: actorIdsWithSource(record),
        sourceRecordId: record.sourceId,
        sourceReplayKey: record.replayKey,
        sourceKind: record.sourceKind,
      },
    ),
  ];
}

/**
 * Build causal events from a market_signal source record.
 *
 * Mapping:
 *   heat_shift → MarketHeatShifted
 *   price_trend → MarketHeatShifted (as price movement)
 *   Other subtypes → MarketHeatShifted (generic market signal)
 */
function buildFromMarketSignal(
  record: InformationSourceRecord<'market_signal'>,
  index: number,
): readonly WorldCausalEvent[] {
  const view = payloadView(record);
  const baseId = `ingest-ms-${record.day}-${record.sourceId}-${index}`;

  const event = buildMarketHeatShifted(
    baseId,
    record.day,
    {
      marketCellId: safeMarketCellId(record, view.marketCellId),
      before: numberValue(view.before, 50),
      after: numberValue(view.after, 50),
      sourceSignalId: record.sourceId,
      sourceSignalType: safeSubtype(record),
      confidence: record.confidence,
    },
    {
      actorIds: actorIdsWithSource(record),
      causeEventIds: [],
      ...sourceLinkOpts(record),
    },
  );

  return [event];
}

/**
 * Build causal events from a rival_action source record.
 *
 * Mapping:
 *   reprice → RivalListingRepriced
 *   Other subtypes → RivalBrokerActionTaken
 */
function buildFromRivalAction(
  record: InformationSourceRecord<'rival_action'>,
  index: number,
): readonly WorldCausalEvent[] {
  const view = payloadView(record);
  const baseId = `ingest-ra-${record.day}-${record.sourceId}-${index}`;
  const events: WorldCausalEvent[] = [];

  const subtype = safeSubtype(record);
  const rivalBrokerId = optionalString(view.rivalBrokerId)
    ?? firstActorId(record, 'rival_broker')
    ?? firstActorId(record)
    ?? 'unknown-rival-broker';
  const rivalAcnId = stringValue(view.rivalAcnId, firstEntityId(record, 'acn') ?? 'unknown-acn');
  const priceBefore = numberValue(view.priceBefore, 0);
  const priceAfter = numberValue(view.priceAfter, priceBefore);
  const listingId = safeListingId(record, view.listingId) ?? `unknown-listing-${record.sourceId}`;

  if (subtype === 'reprice') {
    events.push(
      buildRivalListingRepriced(
        `${baseId}-reprice`,
        record.day,
        {
          listingId,
          acnId: rivalAcnId,
          brokerId: rivalBrokerId,
          oldPrice: priceBefore,
          newPrice: priceAfter,
          priceDelta: priceAfter - priceBefore,
          affectedMarketCellIds: optionalString(view.marketCellId) ? [String(view.marketCellId)] : [],
        },
        {
          actorIds: actorIdsWithSource(record, [rivalBrokerId]),
          causeEventIds: [],
          ...sourceLinkOpts(record),
        },
      ),
    );
  } else {
    // Map rival_action subtype to RivalBrokerActionKind
    const actionKind = mapRivalActionSubtype(subtype);
    events.push(
      buildRivalBrokerActionTaken(
        `${baseId}-broker`,
        record.day,
        {
          brokerId: rivalBrokerId,
          acnId: rivalAcnId,
          actionKind,
          energyCost: 10,
          actionIntensity: 50,
          targetListingId: safeListingId(record, view.listingId),
          targetMarketCellId: optionalString(view.marketCellId),
        },
        {
          actorIds: actorIdsWithSource(record, [rivalBrokerId]),
          causeEventIds: [],
          ...sourceLinkOpts(record),
        },
      ),
    );
  }

  return events;
}

function mapRivalActionSubtype(
  subtype: string,
): 'reprice' | 'follow_customer' | 'push_listing' | 'hold_open_day' | 'owner_pitch' {
  switch (subtype) {
    case 'new_listing': return 'push_listing';
    case 'withdraw_listing': return 'push_listing';
    case 'open_day_held': return 'hold_open_day';
    case 'customer_followed': return 'follow_customer';
    case 'owner_pitched': return 'owner_pitch';
    case 'deal_closed': return 'push_listing';
    default: return 'push_listing';
  }
}

/**
 * Build causal events from a customer_interaction source record.
 *
 * Mapping:
 *   comparison_made → CustomerComparedListings
 *   preference_shifted → CustomerAttentionShifted
 *   Other subtypes → CustomerComparedListings (generic comparison)
 */
function buildFromCustomerInteraction(
  record: InformationSourceRecord<'customer_interaction'>,
  index: number,
): readonly WorldCausalEvent[] {
  const p = record.payload;
  const view = payloadView(record);
  const baseId = `ingest-ci-${record.day}-${record.sourceId}-${index}`;
  const events: WorldCausalEvent[] = [];

  const subtype = safeSubtype(record);
  const customerId = optionalString(view.customerId)
    ?? firstActorId(record, 'customer')
    ?? firstEntityId(record, 'customer');
  const listingId = safeListingId(record, view.listingId);

  if (subtype === 'preference_shifted' && listingId) {
    // Attention shift: customer moved from one listing to another
    events.push(
      buildCustomerAttentionShifted(
        `${baseId}-shift`,
        record.day,
        {
          fromListingIds: [],
          toListingIds: [listingId],
          segment: 'ingested',
          causeEventId: record.sourceId,
        },
        {
          actorIds: actorIdsWithSource(record, [customerId]),
          ...sourceLinkOpts(record),
        },
      ),
    );
  } else if (subtype === 'family_decision_involved' && listingId) {
    // Family involvement in decision: creates comparison pressure
    events.push(
      buildCustomerComparedListings(
        `${baseId}-family-compare`,
        record.day,
        {
          customerId,
          comparedListingIds: [listingId],
          attentionDelta: 5,
          reasonSignals: ['family_decision_involved'],
        },
        {
          actorIds: actorIdsWithSource(record, [customerId]),
          causeEventIds: [],
          ...sourceLinkOpts(record),
        },
      ),
    );
  } else {
    // Generic comparison
    const comparedIds = listingId ? [listingId] : [];
    events.push(
      buildCustomerComparedListings(
        `${baseId}-compare`,
        record.day,
        {
          customerId,
          comparedListingIds: comparedIds,
          attentionDelta: 0,
          reasonSignals: [subtype],
        },
        {
          actorIds: actorIdsWithSource(record, [customerId]),
          causeEventIds: [],
          ...sourceLinkOpts(record),
        },
      ),
    );
  }

  return events;
}

/**
 * Build causal events from an owner_interview source record.
 *
 * Mapping:
 *   price_discussed / expectation_adjusted → OwnerMarketPressurePerceived
 *   trust_expressed / trust_withdrawn → BrokerRecommendationChanged
 *   Other subtypes → OwnerMarketPressurePerceived
 */
function buildFromOwnerInterview(
  record: InformationSourceRecord<'owner_interview'>,
  index: number,
): readonly WorldCausalEvent[] {
  const p = record.payload;
  const view = payloadView(record);
  const baseId = `ingest-oi-${record.day}-${record.sourceId}-${index}`;
  const events: WorldCausalEvent[] = [];

  const subtype = safeSubtype(record);
  const caseId = safeCaseId(record, view.caseId);
  const ownerId = optionalString(view.ownerId)
    ?? firstActorId(record, 'owner')
    ?? firstEntityId(record, 'owner');
  const brokerId = optionalString(view.brokerId)
    ?? firstActorId(record, 'player_broker')
    ?? firstActorId(record, 'rival_broker')
    ?? firstEntityId(record, 'broker');
  const tone = stringValue(view.tone, 'neutral');

  if (subtype === 'trust_expressed' || subtype === 'trust_withdrawn') {
    const trustDelta = subtype === 'trust_expressed' ? 5 : -5;
    events.push(
      buildBrokerRecommendationChanged(
        `${baseId}-rec`,
        record.day,
        {
          caseId,
          recommendationKind: subtype === 'trust_expressed' ? 'push_showing' : 'wait_and_see',
          causedByEventIds: [record.sourceId],
          explanationFacts: [`业主${subtype === 'trust_expressed' ? '表达信任' : '撤回信任'}，信任变化 ${trustDelta > 0 ? '+' : ''}${trustDelta}`],
        },
        {
          actorIds: actorIdsWithSource(record, [brokerId, ownerId]),
          ...sourceLinkOpts(record),
        },
      ),
    );
  } else {
    // Owner market pressure perceived
    events.push(
      buildOwnerMarketPressurePerceived(
        `${baseId}-pressure`,
        record.day,
        {
          ownerId,
          caseId,
          perceivedSignalIds: [record.sourceId],
          pressureDelta: tone === 'hostile' ? 20 : tone === 'negative' ? 10 : 5,
          delayDays: 0,
          confidence: record.confidence,
        },
        {
          actorIds: actorIdsWithSource(record, [ownerId, brokerId]),
          causeEventIds: [record.sourceId],
          ...sourceLinkOpts(record),
        },
      ),
    );
  }

  return events;
}

/**
 * Build causal events from a manager_message source record.
 *
 * Mapping:
 *   focus_case_selected / escalation_requested → MatterPriorityChanged
 *   Other subtypes → BrokerRecommendationChanged
 */
function buildFromManagerMessage(
  record: InformationSourceRecord<'manager_message'>,
  index: number,
): readonly WorldCausalEvent[] {
  const p = record.payload;
  const view = payloadView(record);
  const baseId = `ingest-mm-${record.day}-${record.sourceId}-${index}`;
  const events: WorldCausalEvent[] = [];

  const subtype = safeSubtype(record);
  const caseIds = stringArrayValue(view.caseIds);
  const primaryCaseId = safeCaseId(record, caseIds[0]);
  const targetBrokerId = optionalString(view.targetBrokerId)
    ?? firstActorId(record, 'player_broker')
    ?? firstEntityId(record, 'broker');
  const priority = numberValue(view.priority, 50);
  const instruction = stringValue(view.instruction, stringValue(view.summary, subtype));

  if (subtype === 'focus_case_selected' || subtype === 'escalation_requested') {
    events.push(
      buildMatterPriorityChanged(
        `${baseId}-matter`,
        record.day,
        {
          caseId: primaryCaseId,
          priorityBefore: 50,
          priorityAfter: priority,
          causedByEventIds: [record.sourceId],
        },
        {
          actorIds: actorIdsWithSource(record, [targetBrokerId]),
          ...sourceLinkOpts(record),
        },
      ),
    );
  } else {
    events.push(
      buildBrokerRecommendationChanged(
        `${baseId}-rec`,
        record.day,
        {
          caseId: primaryCaseId,
          recommendationKind: 'escalate_to_manager',
          causedByEventIds: [record.sourceId],
          explanationFacts: [`管理层指令: ${instruction}`],
        },
        {
          actorIds: actorIdsWithSource(record, [targetBrokerId]),
          ...sourceLinkOpts(record),
        },
      ),
    );
  }

  return events;
}

/**
 * Build causal events from a player_action_receipt source record.
 *
 * Mapping:
 *   action_executed → BrokerRecommendationChanged (with relevant recommendation)
 *   action_blocked / action_failed → MatterPriorityChanged
 */
function buildFromPlayerActionReceipt(
  record: InformationSourceRecord<'player_action_receipt'>,
  index: number,
): readonly WorldCausalEvent[] {
  const p = record.payload;
  const view = payloadView(record);
  const baseId = `ingest-par-${record.day}-${record.sourceId}-${index}`;
  const events: WorldCausalEvent[] = [];

  const caseId = safeCaseId(record, view.caseId);
  const executorId = optionalString(view.executorId)
    ?? firstActorId(record, 'player_broker')
    ?? firstActorId(record)
    ?? firstEntityId(record, 'broker');
  const actionId = stringValue(view.actionId, safeSubtype(record));
  const costEnergy = numberValue(view.costEnergy, 0);
  const outcome = stringValue(view.outcome, 'success');

  if (outcome === 'success') {
    events.push(
      buildBrokerRecommendationChanged(
        `${baseId}-rec`,
        record.day,
        {
          caseId,
          recommendationKind: 'push_showing',
          causedByEventIds: [record.sourceId],
          explanationFacts: [`玩家执行动作 ${actionId}，能量消耗 ${costEnergy}`],
        },
        {
          actorIds: actorIdsWithSource(record, [executorId]),
          ...sourceLinkOpts(record),
        },
      ),
    );
  } else {
    events.push(
      buildMatterPriorityChanged(
        `${baseId}-matter`,
        record.day,
        {
          caseId,
          priorityBefore: 50,
          priorityAfter: 30,
          causedByEventIds: [record.sourceId],
        },
        {
          actorIds: actorIdsWithSource(record, [executorId]),
          ...sourceLinkOpts(record),
        },
      ),
    );
  }

  return events;
}

/**
 * Build causal events from a process_receipt source record.
 *
 * Mapping:
 *   deal_signed / consensus_reached → MatterPriorityChanged
 *   Other subtypes → BrokerRecommendationChanged
 */
function buildFromProcessReceipt(
  record: InformationSourceRecord<'process_receipt'>,
  index: number,
): readonly WorldCausalEvent[] {
  const p = record.payload;
  const view = payloadView(record);
  const baseId = `ingest-pr-${record.day}-${record.sourceId}-${index}`;
  const events: WorldCausalEvent[] = [];

  const subtype = safeSubtype(record);
  const caseIds = stringArrayValue(view.caseIds);
  const brokerIds = stringArrayValue(view.brokerIds);
  const primaryCaseId = safeCaseId(record, caseIds[0]);
  const processType = stringValue(view.processType, 'unknown_process');
  const outcome = stringValue(view.outcome, stringValue(view.summary, subtype));

  if (subtype === 'deal_signed' || subtype === 'consensus_reached') {
    events.push(
      buildMatterPriorityChanged(
        `${baseId}-matter`,
        record.day,
        {
          caseId: primaryCaseId,
          priorityBefore: 50,
          priorityAfter: 90,
          causedByEventIds: [record.sourceId],
        },
        {
          actorIds: actorIdsWithSource(record, brokerIds),
          ...sourceLinkOpts(record),
        },
      ),
    );
  } else {
    events.push(
      buildBrokerRecommendationChanged(
        `${baseId}-rec`,
        record.day,
        {
          caseId: primaryCaseId,
          recommendationKind: 'wait_and_see',
          causedByEventIds: [record.sourceId],
          explanationFacts: [`流程 ${processType} 完成: ${outcome}`],
        },
        {
          actorIds: actorIdsWithSource(record, brokerIds),
          ...sourceLinkOpts(record),
        },
      ),
    );
  }

  return events;
}

/**
 * Build causal events from a comparable_transaction source record.
 *
 * Mapping:
 *   deal_closed → OwnerMarketPressurePerceived
 *   price_adjusted → MarketHeatShifted
 */
function buildFromComparableTransaction(
  record: InformationSourceRecord<'comparable_transaction'>,
  index: number,
): readonly WorldCausalEvent[] {
  const p = record.payload;
  const view = payloadView(record);
  const baseId = `ingest-ct-${record.day}-${record.sourceId}-${index}`;
  const events: WorldCausalEvent[] = [];

  const subtype = safeSubtype(record);
  const listingId = safeListingId(record, view.listingId);
  const marketCellId = safeMarketCellId(record, view.marketCellId);
  const askPrice = numberValue(view.askPrice, numberValue(view.price, 50));
  const price = numberValue(view.price, askPrice);
  const discountPct = numberValue(view.discountPct, askPrice > 0 ? Math.max(0, ((askPrice - price) / askPrice) * 100) : 0);
  const dataSource = stringValue(view.dataSource, 'platform公开');

  if (subtype === 'deal_closed') {
    // Comparable transaction affects owner perception through market signal
    events.push(
      buildOwnerMarketPressurePerceived(
        `${baseId}-owner-pressure`,
        record.day,
        {
          caseId: safeCaseId(record, listingId),
          perceivedSignalIds: [record.sourceId],
          pressureDelta: Math.round(discountPct * 2),
          delayDays: dataSource === 'platform公开' ? 1 : 2,
          confidence: record.confidence,
        },
        {
          actorIds: [],
          causeEventIds: [record.sourceId],
          ...sourceLinkOpts(record),
        },
      ),
    );
  }

  if (subtype === 'price_adjusted' || subtype === 'deal_closed') {
    events.push(
      buildMarketHeatShifted(
        `${baseId}-heat`,
        record.day,
        {
          marketCellId,
          before: askPrice,
          after: price,
          sourceSignalId: record.sourceId,
          sourceSignalType: `comparable-${subtype}`,
          confidence: record.confidence,
        },
        {
          actorIds: [],
          causeEventIds: [record.sourceId],
          ...sourceLinkOpts(record),
        },
      ),
    );
  }

  return events;
}

/**
 * Build causal events from a platform_traffic source record.
 *
 * Mapping:
 *   traffic_spike / listing_viewed → MarketHeatShifted
 *   traffic_drop → MarketHeatShifted (negative)
 */
function buildFromPlatformTraffic(
  record: InformationSourceRecord<'platform_traffic'>,
  index: number,
): readonly WorldCausalEvent[] {
  const p = record.payload;
  const view = payloadView(record);
  const baseId = `ingest-pt-${record.day}-${record.sourceId}-${index}`;
  const events: WorldCausalEvent[] = [];

  const subtype = safeSubtype(record);
  const viewCount = numberValue(view.viewCount, 0);

  if (subtype === 'traffic_spike' || subtype === 'listing_viewed') {
    events.push(
      buildMarketHeatShifted(
        `${baseId}-heat`,
        record.day,
        {
          marketCellId: safeMarketCellId(record, view.marketCellId),
          before: 50,
          after: Math.min(100, 50 + Math.round(viewCount / 10)),
          sourceSignalId: record.sourceId,
          sourceSignalType: `traffic-${subtype}`,
          confidence: record.confidence,
        },
        {
          actorIds: [],
          causeEventIds: [record.sourceId],
          ...sourceLinkOpts(record),
        },
      ),
    );
  }

  return events;
}

/**
 * Build causal events from an acn_network_signal source record.
 *
 * Mapping:
 *   cooperation_opportunity → BrokerRecommendationChanged
 *   competition_escalation → RivalBrokerActionTaken
 *   info_share_received → BrokerRecommendationChanged
 */
function buildFromAcnNetworkSignal(
  record: InformationSourceRecord<'acn_network_signal'>,
  index: number,
): readonly WorldCausalEvent[] {
  const p = record.payload;
  const view = payloadView(record);
  const baseId = `ingest-an-${record.day}-${record.sourceId}-${index}`;
  const events: WorldCausalEvent[] = [];

  const subtype = safeSubtype(record);
  const brokerIds = stringArrayValue(view.brokerIds);
  const primaryBrokerId = brokerIds[0]
    ?? firstActorId(record, 'rival_broker')
    ?? firstActorId(record)
    ?? 'unknown-broker';
  const sourceAcnId = stringValue(view.sourceAcnId, firstEntityId(record, 'acn') ?? 'unknown-acn');
  const cooperationScore = numberValue(view.cooperationScore, 0);
  const listingId = safeListingId(record, view.listingId);
  const caseId = safeCaseId(record, view.caseId);

  if (subtype === 'competition_escalation') {
    events.push(
      buildRivalBrokerActionTaken(
        `${baseId}-rival`,
        record.day,
        {
          brokerId: primaryBrokerId,
          acnId: sourceAcnId,
          actionKind: 'follow_customer',
          energyCost: 10,
          actionIntensity: Math.abs(cooperationScore),
          targetListingId: listingId,
        },
        {
          actorIds: actorIdsWithSource(record, brokerIds),
          causeEventIds: [],
          ...sourceLinkOpts(record),
        },
      ),
    );
  } else if (subtype === 'cross_district_competition') {
    // Cross-district competition: rival broker competing in another district
    events.push(
      buildRivalBrokerActionTaken(
        `${baseId}-cross-rival`,
        record.day,
        {
          brokerId: primaryBrokerId,
          acnId: sourceAcnId,
          actionKind: 'push_listing',
          energyCost: 15,
          actionIntensity: Math.abs(cooperationScore),
          targetListingId: listingId,
          targetMarketCellId: caseId, // caseId used as marketCellId proxy
        },
        {
          actorIds: actorIdsWithSource(record, brokerIds),
          causeEventIds: [],
          ...sourceLinkOpts(record),
        },
      ),
    );
  } else {
    const primaryCaseId = caseId;
    events.push(
      buildBrokerRecommendationChanged(
        `${baseId}-rec`,
        record.day,
        {
          caseId: primaryCaseId,
          recommendationKind: subtype === 'cooperation_opportunity' ? 'push_showing' : 'wait_and_see',
          causedByEventIds: [record.sourceId],
          explanationFacts: [`ACN网络信号: ${subtype}`],
        },
        {
          actorIds: actorIdsWithSource(record, brokerIds),
          ...sourceLinkOpts(record),
        },
      ),
    );
  }

  return events;
}

/**
 * Build causal events from a supporting_facility_signal source record.
 *
 * Mapping:
 *   school_district_changed / transit_access_changed / commercial_development /
 *   community_environment_shift / policy_change / noise_complaint / building_condition_update
 *   → MarketHeatShifted (facility change affects market perception)
 *   → OwnerMarketPressurePerceived (facility change affects owner pressure)
 */
function buildFromSupportingFacilitySignal(
  record: InformationSourceRecord<'supporting_facility_signal'>,
  index: number,
): readonly WorldCausalEvent[] {
  const p = record.payload;
  const view = payloadView(record);
  const baseId = `ingest-sf-${record.day}-${record.sourceId}-${index}`;
  const events: WorldCausalEvent[] = [];

  const subtype = safeSubtype(record);
  const before = numberValue(view.before, 50);
  const after = numberValue(view.after, before);
  const marketCellId = safeMarketCellId(record, view.marketCellId);
  const caseId = optionalString(view.caseId) ?? firstEntityId(record, 'case') ?? firstEntityId(record, 'listing');
  const facilityType = stringValue(view.facilityType, '');

  // Facility changes affect market heat
  const heatDelta = Math.round((after - before) * 0.3);
  if (heatDelta !== 0) {
    events.push(
      buildMarketHeatShifted(
        `${baseId}-heat`,
        record.day,
        {
          marketCellId,
          before,
          after,
          sourceSignalId: record.sourceId,
          sourceSignalType: `facility-${subtype}`,
          confidence: record.confidence,
        },
        {
          actorIds: [],
          causeEventIds: [],
          ...sourceLinkOpts(record),
        },
      ),
    );
  }

  // Facility changes affect owner perception
  if (caseId) {
    // Property and community management subtypes create owner pressure through
    // a different causal path: they affect the owner's perception of their own listing
    // rather than the market as a whole.
    const isPropertyOrCommunityMgmt = subtype === 'property_feature_update'
      || subtype === 'community_info_changed'
      || subtype === 'community_management_changed';
    const pressureDelta = isPropertyOrCommunityMgmt
      ? Math.round((after - before) * 0.15)
      : heatDelta > 0 ? -5 : heatDelta < 0 ? 10 : 0;
    if (pressureDelta !== 0) {
      events.push(
        buildOwnerMarketPressurePerceived(
          `${baseId}-owner-pressure`,
          record.day,
          {
            caseId,
            perceivedSignalIds: [record.sourceId],
            pressureDelta,
            delayDays: facilityType === 'policy' ? 0 : 2,
            confidence: record.confidence,
          },
          {
            actorIds: [],
            causeEventIds: [record.sourceId],
            ...sourceLinkOpts(record),
          },
        ),
      );
    }
  }

  return events;
}

/**
 * Build causal events from a broker_capacity_signal source record.
 *
 * Mapping:
 *   energy_depleted / schedule_overloaded / organizational_pressure → BrokerRecommendationChanged
 *   collaboration_requested / skill_gap_detected → MatterPriorityChanged
 *   workload_balanced → BrokerRecommendationChanged (positive)
 */
function buildFromBrokerCapacitySignal(
  record: InformationSourceRecord<'broker_capacity_signal'>,
  index: number,
): readonly WorldCausalEvent[] {
  const p = record.payload;
  const view = payloadView(record);
  const baseId = `ingest-bc-${record.day}-${record.sourceId}-${index}`;
  const events: WorldCausalEvent[] = [];

  const subtype = safeSubtype(record);
  const affectedCaseIds = stringArrayValue(view.affectedCaseIds);
  const primaryCaseId = safeCaseId(record, affectedCaseIds[0]);
  const brokerId = optionalString(view.brokerId)
    ?? firstActorId(record, 'player_broker')
    ?? firstActorId(record, 'rival_broker')
    ?? firstActorId(record)
    ?? firstEntityId(record, 'broker');
  const energyLevel = numberValue(view.energyLevel, 0);
  const scheduleUtilization = numberValue(view.scheduleUtilization, 0);

  if (subtype === 'collaboration_requested' || subtype === 'skill_gap_detected') {
    events.push(
      buildMatterPriorityChanged(
        `${baseId}-matter`,
        record.day,
        {
          caseId: primaryCaseId,
          priorityBefore: 50,
          priorityAfter: subtype === 'collaboration_requested' ? 60 : 40,
          causedByEventIds: [record.sourceId],
        },
        {
          actorIds: actorIdsWithSource(record, [brokerId]),
          ...sourceLinkOpts(record),
        },
      ),
    );
  } else if (subtype === 'local_expertise_detected') {
    // Local expertise detected: broker knows the neighborhood well
    events.push(
      buildBrokerRecommendationChanged(
        `${baseId}-expertise`,
        record.day,
        {
          caseId: primaryCaseId,
          recommendationKind: 'push_showing',
          causedByEventIds: [record.sourceId],
          explanationFacts: [`经纪人本地经验: 商圈熟悉度高，精力${energyLevel}%`],
        },
        {
          actorIds: actorIdsWithSource(record, [brokerId]),
          ...sourceLinkOpts(record),
        },
      ),
    );
  } else if (subtype === 'acn_collaboration_strength') {
    // ACN collaboration strength: affects service path viability
    events.push(
      buildMatterPriorityChanged(
        `${baseId}-collab`,
        record.day,
        {
          caseId: primaryCaseId,
          priorityBefore: 50,
          priorityAfter: 55,
          causedByEventIds: [record.sourceId],
        },
        {
          actorIds: actorIdsWithSource(record, [brokerId]),
          ...sourceLinkOpts(record),
        },
      ),
    );
  } else {
    const recKind = subtype === 'workload_balanced' ? 'push_showing' : 'escalate_to_manager';
    events.push(
      buildBrokerRecommendationChanged(
        `${baseId}-rec`,
        record.day,
        {
          caseId: primaryCaseId,
          recommendationKind: recKind,
          causedByEventIds: [record.sourceId],
          explanationFacts: [`经纪人能力信号: ${subtype}, 精力${energyLevel}%, 排期${scheduleUtilization}%`],
        },
        {
          actorIds: actorIdsWithSource(record, [brokerId]),
          ...sourceLinkOpts(record),
        },
      ),
    );
  }

  return events;
}

/**
 * Build causal events from an owner_life_event_signal source record.
 *
 * Mapping:
 *   family_change / financial_need / relocation_planned / health_issue /
 *   job_change / inheritance_received / divorce_proceedings
 *   → OwnerMarketPressurePerceived (life event changes owner urgency/flexibility)
 *   → BrokerRecommendationChanged (if trust impact is significant)
 */
function buildFromOwnerLifeEventSignal(
  record: InformationSourceRecord<'owner_life_event_signal'>,
  index: number,
): readonly WorldCausalEvent[] {
  const p = record.payload;
  const view = payloadView(record);
  const baseId = `ingest-ole-${record.day}-${record.sourceId}-${index}`;
  const events: WorldCausalEvent[] = [];

  const subtype = safeSubtype(record);
  const ownerId = optionalString(view.ownerId)
    ?? firstActorId(record, 'owner')
    ?? firstEntityId(record, 'owner');
  const caseId = safeCaseId(record, view.caseId);
  const urgencyImpact = numberValue(view.urgencyImpact, 0);
  const timelineDays = numberValue(view.timelineDays, 0);
  const eventConfidence = numberValue(view.eventConfidence, 1);
  const trustImpact = numberValue(view.trustImpact, 0);

  // Owner life events create market pressure perception
  events.push(
    buildOwnerMarketPressurePerceived(
      `${baseId}-pressure`,
      record.day,
      {
        ownerId,
        caseId,
        perceivedSignalIds: [record.sourceId],
        pressureDelta: urgencyImpact,
        delayDays: timelineDays,
        confidence: record.confidence * eventConfidence,
      },
      {
        actorIds: actorIdsWithSource(record, [ownerId]),
        causeEventIds: [record.sourceId],
        ...sourceLinkOpts(record),
      },
    ),
  );

  // Significant trust changes trigger recommendation
  if (Math.abs(trustImpact) >= 10) {
    const recKind = trustImpact > 0 ? 'push_showing' : 'wait_and_see';
    events.push(
      buildBrokerRecommendationChanged(
        `${baseId}-rec`,
        record.day,
        {
          caseId,
          recommendationKind: recKind,
          causedByEventIds: [record.sourceId],
          explanationFacts: [`业主生活事件: ${subtype}, 信任影响${trustImpact > 0 ? '+' : ''}${trustImpact}`],
        },
        {
          actorIds: actorIdsWithSource(record, [ownerId]),
          ...sourceLinkOpts(record),
        },
      ),
    );
  }

  return events;
}

/**
 * Build causal events from a buyer_financing_signal source record.
 *
 * Mapping:
 *   loan_pre_approved / down_payment_ready → BrokerRecommendationChanged (positive)
 *   loan_rejected / budget_adjusted / family_veto / qualification_expired → BrokerRecommendationChanged (negative)
 *   co_buyer_added → MatterPriorityChanged
 */
function buildFromBuyerFinancingSignal(
  record: InformationSourceRecord<'buyer_financing_signal'>,
  index: number,
): readonly WorldCausalEvent[] {
  const p = record.payload;
  const view = payloadView(record);
  const baseId = `ingest-bf-${record.day}-${record.sourceId}-${index}`;
  const events: WorldCausalEvent[] = [];

  const subtype = safeSubtype(record);
  const primaryCaseId = safeCaseId(record, view.caseId);
  const customerId = optionalString(view.customerId)
    ?? firstActorId(record, 'customer')
    ?? firstEntityId(record, 'customer');

  if (subtype === 'co_buyer_added') {
    events.push(
      buildMatterPriorityChanged(
        `${baseId}-matter`,
        record.day,
        {
          caseId: primaryCaseId,
          priorityBefore: 50,
          priorityAfter: 65,
          causedByEventIds: [record.sourceId],
        },
        {
          actorIds: actorIdsWithSource(record, [customerId]),
          ...sourceLinkOpts(record),
        },
      ),
    );
  } else {
    const isPositive = subtype === 'loan_pre_approved' || subtype === 'down_payment_ready';
    const recKind = isPositive ? 'push_showing' : 'wait_and_see';
    const budgetAfter = typeof view.budgetAfter === 'number' && Number.isFinite(view.budgetAfter) ? view.budgetAfter : undefined;
    const budgetInfo = budgetAfter !== undefined ? `预算调整为${budgetAfter}万` : '';
    events.push(
      buildBrokerRecommendationChanged(
        `${baseId}-rec`,
        record.day,
        {
          caseId: primaryCaseId,
          recommendationKind: recKind,
          causedByEventIds: [record.sourceId],
          explanationFacts: [`客户融资信号: ${subtype}${budgetInfo ? `, ${budgetInfo}` : ''}`],
        },
        {
          actorIds: actorIdsWithSource(record, [customerId]),
          ...sourceLinkOpts(record),
        },
      ),
    );
  }

  return events;
}

/**
 * Build causal events from a micro_market_signal source record.
 *
 * Mapping:
 *   supply_increased / supply_decreased / demand_shift /
 *   price_band_squeeze / inventory_absorption / new_development_announced
 *   → MarketHeatShifted (micro-market supply/demand affects heat)
 *   → CustomerAttentionShifted (micro-market shifts customer attention)
 */
function buildFromMicroMarketSignal(
  record: InformationSourceRecord<'micro_market_signal'>,
  index: number,
): readonly WorldCausalEvent[] {
  const p = record.payload;
  const view = payloadView(record);
  const baseId = `ingest-mm-${record.day}-${record.sourceId}-${index}`;
  const events: WorldCausalEvent[] = [];

  const subtype = safeSubtype(record);
  const supplyDelta = numberValue(view.supplyDelta, 0);
  const demandDelta = numberValue(view.demandDelta, 0);
  const priceBand = stringValue(view.priceBand, 'unknown-price-band');

  // Micro-market supply/demand changes affect market heat
  const heatDelta = Math.round((demandDelta - supplyDelta) * 0.5);
  if (heatDelta !== 0) {
    events.push(
      buildMarketHeatShifted(
        `${baseId}-heat`,
        record.day,
        {
          marketCellId: safeMarketCellId(record, view.marketCellId),
          before: 50,
          after: Math.max(0, Math.min(100, 50 + heatDelta)),
          sourceSignalId: record.sourceId,
          sourceSignalType: `micro-${subtype}`,
          confidence: record.confidence,
        },
        {
          actorIds: [],
          causeEventIds: [],
          ...sourceLinkOpts(record),
        },
      ),
    );
  }

  // Micro-market demand shifts affect customer attention
  if (subtype === 'demand_shift' || subtype === 'price_band_squeeze') {
    events.push(
      buildCustomerAttentionShifted(
        `${baseId}-shift`,
        record.day,
        {
          fromListingIds: [],
          toListingIds: [],
          segment: priceBand,
          causeEventId: record.sourceId,
        },
        {
          actorIds: [],
          ...sourceLinkOpts(record),
        },
      ),
    );
  }

  return events;
}

// ════════════════════════════════════════════════════════════════════════════
// Main ingestion adapter
// ════════════════════════════════════════════════════════════════════════════

/**
 * Ingest a batch of InformationSourceRecords and produce causal events + daily events.
 *
 * This is a pure function. Same input → same output (deterministic).
 *
 * Hard constraints:
 *   - Does NOT mutate source records
 *   - Does NOT mutate any GameState entity
 *   - Does NOT produce forbidden event kinds (case_sold, deal_closed, etc.)
 *   - All generated events carry sourceId + replayKey for traceability
 *
 * @param records - Source records to ingest
 * @param day - Simulation day for the generated events
 * @param runSeed - Seed for deterministic ID generation
 * @returns SourceIngestionReceipt with all generated events
 */
export function ingestSourceRecords(
  records: readonly InformationSourceRecord[],
  day: number,
  runSeed: number,
): SourceIngestionReceipt {
  const causalEvents: WorldCausalEvent[] = [];
  const dailyEvents: BigWorldDailyEvent[] = [];
  let sourcesWithEffect = 0;
  let sourcesSkipped = 0;

  // Per-kind tracking
  const byKind = new Map<SourceKind, {
    count: number;
    causalEventsProduced: number;
    skipped: number;
  }>();

  // Source→event mapping for hard traceability
  const sourceToEvents = new Map<string, string[]>();

  for (let i = 0; i < records.length; i += 1) {
    const record = records[i];
    const kindStats = byKind.get(record.sourceKind) ?? { count: 0, causalEventsProduced: 0, skipped: 0 };
    kindStats.count += 1;

    // Skip records that are too far in the future (delay hasn't elapsed)
    if (record.day > day) {
      kindStats.skipped += 1;
      sourcesSkipped += 1;
      byKind.set(record.sourceKind, kindStats);
      continue;
    }

    // Skip hidden sources (no_one scope produces no player-visible events)
    if (record.visibility.scope === 'no_one') {
      kindStats.skipped += 1;
      sourcesSkipped += 1;
      byKind.set(record.sourceKind, kindStats);
      continue;
    }

    // Build causal events from this source record
    const causalBatch = buildCausalEventsFromSource(record, i);
    if (causalBatch.length === 0) {
      kindStats.skipped += 1;
      sourcesSkipped += 1;
      byKind.set(record.sourceKind, kindStats);
      continue;
    }

    // Track source→event mapping
    const eventIds = causalBatch.map((e) => e.id);
    sourceToEvents.set(record.sourceId, eventIds);

    // Create matching daily events
    const visibilityHint = resolveVisibilityHint(record);
    for (const causalEvent of causalBatch) {
      const entityRefs = record.entityRefs.map((ref) => ({
        eventId: causalEvent.id,
        day: causalEvent.day,
        kind: causalEvent.kind,
      }));

      const dailyEvent: BigWorldDailyEvent = {
        id: `bwe-ingest-${record.sourceKind}-${day}-${i}-${causalEvent.kind}`,
        day,
        phase: 'SourceIngestionPhase',
        kind: causalEvent.kind,
        source: `source-record:${record.sourceId}`,
        affectedRefs: Object.freeze(entityRefs),
        causeEventIds: Object.freeze([record.sourceId]),
        visibilityHint,
        boundedPayload: Object.freeze({
          sourceKind: record.sourceKind,
          sourceId: record.sourceId,
          replayKey: record.replayKey,
          confidence: record.confidence,
        }),
      };
      dailyEvents.push(dailyEvent);
    }

    causalEvents.push(...causalBatch);
    kindStats.causalEventsProduced += causalBatch.length;
    sourcesWithEffect += 1;
    byKind.set(record.sourceKind, kindStats);
  }

  // Freeze outputs
  const frozenCausalEvents = Object.freeze(causalEvents);
  const frozenDailyEvents = Object.freeze(dailyEvents);

  // Generate deterministic replay key
  const replayKey = `ingest-${runSeed}-${day}-${records.length}-${causalEvents.length}`;

  // Compute batch-level stats
  const totalCausalEventsProduced = causalEvents.length;
  const totalDailyEventsProduced = dailyEvents.length;
  const uniqueSourceKindCount = byKind.size;

  return Object.freeze({
    day,
    sourcesProcessed: records.length,
    sourcesWithEffect,
    sourcesSkipped,
    causalEvents: frozenCausalEvents,
    dailyEvents: frozenDailyEvents,
    byKind: Object.freeze(byKind) as ReadonlyMap<SourceKind, {
      readonly count: number;
      readonly causalEventsProduced: number;
      readonly skipped: number;
    }>,
    replayKey,
    sourceToEvents: Object.freeze(sourceToEvents) as ReadonlyMap<string, readonly string[]>,
    totalCausalEventsProduced,
    totalDailyEventsProduced,
    batchDurationUs: 0, // caller sets this via wrapper
    uniqueSourceKindCount,
  });
}

/**
 * Dispatch a single source record to the appropriate builder.
 * Returns 0 or more causal events.
 */
function buildCausalEventsFromSource(
  record: InformationSourceRecord,
  index: number,
): readonly WorldCausalEvent[] {
  try {
    let events: readonly WorldCausalEvent[];
    switch (record.sourceKind) {
      case 'market_signal':
        events = buildFromMarketSignal(record as InformationSourceRecord<'market_signal'>, index);
        break;
      case 'rival_action':
        events = buildFromRivalAction(record as InformationSourceRecord<'rival_action'>, index);
        break;
      case 'customer_interaction':
        events = buildFromCustomerInteraction(record as InformationSourceRecord<'customer_interaction'>, index);
        break;
      case 'owner_interview':
        events = buildFromOwnerInterview(record as InformationSourceRecord<'owner_interview'>, index);
        break;
      case 'manager_message':
        events = buildFromManagerMessage(record as InformationSourceRecord<'manager_message'>, index);
        break;
      case 'player_action_receipt':
        events = buildFromPlayerActionReceipt(record as InformationSourceRecord<'player_action_receipt'>, index);
        break;
      case 'process_receipt':
        events = buildFromProcessReceipt(record as InformationSourceRecord<'process_receipt'>, index);
        break;
      case 'comparable_transaction':
        events = buildFromComparableTransaction(record as InformationSourceRecord<'comparable_transaction'>, index);
        break;
      case 'platform_traffic':
        events = buildFromPlatformTraffic(record as InformationSourceRecord<'platform_traffic'>, index);
        break;
      case 'acn_network_signal':
        events = buildFromAcnNetworkSignal(record as InformationSourceRecord<'acn_network_signal'>, index);
        break;
      case 'supporting_facility_signal':
        events = buildFromSupportingFacilitySignal(record as InformationSourceRecord<'supporting_facility_signal'>, index);
        break;
      case 'broker_capacity_signal':
        events = buildFromBrokerCapacitySignal(record as InformationSourceRecord<'broker_capacity_signal'>, index);
        break;
      case 'owner_life_event_signal':
        events = buildFromOwnerLifeEventSignal(record as InformationSourceRecord<'owner_life_event_signal'>, index);
        break;
      case 'buyer_financing_signal':
        events = buildFromBuyerFinancingSignal(record as InformationSourceRecord<'buyer_financing_signal'>, index);
        break;
      case 'micro_market_signal':
        events = buildFromMicroMarketSignal(record as InformationSourceRecord<'micro_market_signal'>, index);
        break;
      default:
        events = [];
    }
    return events.length > 0 ? events : buildFallbackSourceEvent(record, index, 'empty_builder');
  } catch {
    return buildFallbackSourceEvent(record, index, 'builder_exception');
  }
}

// ════════════════════════════════════════════════════════════════════════════
// Scale-safe batch ingestion
// ════════════════════════════════════════════════════════════════════════════

/**
 * Maximum number of source records allowed per batch.
 * Guards against "just append thousands of events and freeze the UI" false-big.
 */
export const MAX_BATCH_SIZE = 500;

/**
 * Sort comparator for source records: deterministic ordering by (day, sourceKind, sourceId).
 * Same-day records with same sourceId are kept in insertion order (stable sort).
 */
function compareSourceRecords(
  a: InformationSourceRecord,
  b: InformationSourceRecord,
): number {
  if (a.day !== b.day) return a.day - b.day;
  if (a.sourceKind !== b.sourceKind) return a.sourceKind < b.sourceKind ? -1 : 1;
  if (a.sourceId !== b.sourceId) return a.sourceId < b.sourceId ? -1 : 1;
  return 0; // same record — stable sort preserves insertion order
}

/**
 * Scale-safe batch ingestion: handles 100+ source records with deterministic ordering.
 *
 * Key properties vs ingestSourceRecords:
 *   1. Sorts records by (day, sourceKind, sourceId) for deterministic ordering
 *   2. Enforces MAX_BATCH_SIZE limit
 *   3. Deduplicates by sourceId (first occurrence wins)
 *   4. Reports batch-level timing and throughput
 *   5. Caps causalEventsPerSourceKind to prevent one-kind explosion
 *
 * @param records - Source records to ingest (may be unsorted)
 * @param day - Simulation day for the generated events
 * @param runSeed - Seed for deterministic operations
 * @param maxEventsPerKind - Maximum causal events to produce per sourceKind (default: 50)
 * @returns SourceIngestionReceipt with batch-level stats
 */
export function ingestSourceRecordsBatch(
  records: readonly InformationSourceRecord[],
  day: number,
  runSeed: number,
  maxEventsPerKind: number = 50,
): SourceIngestionReceipt {
  const startTime = performance.now();

  // Guard: enforce batch size limit
  const effectiveRecords = records.length > MAX_BATCH_SIZE
    ? records.slice(0, MAX_BATCH_SIZE)
    : records;

  // Step 1: Sort deterministically
  const sorted = [...effectiveRecords].sort(compareSourceRecords);

  // Step 2: Deduplicate by sourceId (first occurrence wins, preserving sort order)
  const seenSourceIds = new Set<string>();
  const deduplicated: InformationSourceRecord[] = [];
  for (const record of sorted) {
    if (!seenSourceIds.has(record.sourceId)) {
      seenSourceIds.add(record.sourceId);
      deduplicated.push(record);
    }
  }

  // Step 3: Run standard ingestion on deduplicated, sorted records
  const baseReceipt = ingestSourceRecords(deduplicated, day, runSeed);

  // Step 4: Enforce per-kind event cap (maxEventsPerKind events total per sourceKind)
  const kindEventCounts = new Map<string, number>();
  const cappedCausalEvents: WorldCausalEvent[] = [];
  const cappedDailyEvents: BigWorldDailyEvent[] = [];
  const cappedSourceToEvents = new Map<string, string[]>();

  let sourcesCapped = 0;

  for (let i = 0; i < deduplicated.length; i += 1) {
    const record = deduplicated[i];

    // Find events produced by this source
    const eventIds = baseReceipt.sourceToEvents.get(record.sourceId) ?? [];

    // Cap: total events per sourceKind
    const currentKindCount = kindEventCounts.get(record.sourceKind) ?? 0;
    const remaining = maxEventsPerKind - currentKindCount;

    if (remaining <= 0) {
      sourcesCapped += 1;
      continue;
    }

    const eventsToKeep = Math.min(eventIds.length, remaining);
    kindEventCounts.set(record.sourceKind, currentKindCount + eventsToKeep);

    // Keep only the first N events for this source
    const keptEventIds = eventIds.slice(0, eventsToKeep);
    if (keptEventIds.length > 0) {
      cappedSourceToEvents.set(record.sourceId, keptEventIds);
    }

    // Collect corresponding causal and daily events
    for (const eventId of keptEventIds) {
      const causalEvent = baseReceipt.causalEvents.find((e) => e.id === eventId);
      if (causalEvent) {
        cappedCausalEvents.push(causalEvent);
      }
      const dailyEvent = baseReceipt.dailyEvents.find((e) => e.source === `source-record:${record.sourceId}`);
      if (dailyEvent) {
        cappedDailyEvents.push(dailyEvent);
      }
    }
  }

  const durationUs = Math.round((performance.now() - startTime) * 1000);

  // Build capped receipt
  const frozenCausalEvents = Object.freeze(cappedCausalEvents);
  const frozenDailyEvents = Object.freeze(cappedDailyEvents);

  const replayKey = `batch-${runSeed}-${day}-${deduplicated.length}-${cappedCausalEvents.length}`;

  // Rebuild byKind from deduplicated records
  const byKind = new Map<SourceKind, {
    count: number;
    causalEventsProduced: number;
    skipped: number;
  }>();
  for (const record of deduplicated) {
    const kindStats = byKind.get(record.sourceKind) ?? { count: 0, causalEventsProduced: 0, skipped: 0 };
    kindStats.count += 1;
    const eventCount = cappedSourceToEvents.get(record.sourceId)?.length ?? 0;
    kindStats.causalEventsProduced += eventCount;
    byKind.set(record.sourceKind, kindStats);
  }

  // Count skipped (visibility=no_one + future day + capped)
  let sourcesSkipped = 0;
  for (const record of deduplicated) {
    if (record.day > day || record.visibility.scope === 'no_one') {
      sourcesSkipped += 1;
    }
  }
  sourcesSkipped += sourcesCapped;

  return Object.freeze({
    day,
    sourcesProcessed: deduplicated.length,
    sourcesWithEffect: deduplicated.length - sourcesSkipped,
    sourcesSkipped,
    causalEvents: frozenCausalEvents,
    dailyEvents: frozenDailyEvents,
    byKind: Object.freeze(byKind) as ReadonlyMap<SourceKind, {
      readonly count: number;
      readonly causalEventsProduced: number;
      readonly skipped: number;
    }>,
    replayKey,
    sourceToEvents: Object.freeze(cappedSourceToEvents) as ReadonlyMap<string, readonly string[]>,
    totalCausalEventsProduced: cappedCausalEvents.length,
    totalDailyEventsProduced: cappedDailyEvents.length,
    batchDurationUs: durationUs,
    uniqueSourceKindCount: byKind.size,
  });
}
