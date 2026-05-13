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
  readonly sourceKind: string;
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
  const p = record.payload;
  const baseId = `ingest-ms-${record.day}-${record.sourceId}-${index}`;

  const event = buildMarketHeatShifted(
    baseId,
    record.day,
    {
      marketCellId: p.marketCellId,
      before: p.before,
      after: p.after,
      sourceSignalId: record.sourceId,
      sourceSignalType: p.subtype,
      confidence: record.confidence,
    },
    {
      actorIds: extractActorIds(record),
      causeEventIds: [],
      sourceRecordId: record.sourceId,
      sourceReplayKey: record.replayKey,
      sourceKind: record.sourceKind,
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
  const p = record.payload;
  const baseId = `ingest-ra-${record.day}-${record.sourceId}-${index}`;
  const events: WorldCausalEvent[] = [];

  if (p.subtype === 'reprice' && p.priceBefore !== undefined && p.priceAfter !== undefined) {
    const listingId = p.listingId ?? `unknown-listing-${record.sourceId}`;
    events.push(
      buildRivalListingRepriced(
        `${baseId}-reprice`,
        record.day,
        {
          listingId,
          acnId: p.rivalAcnId,
          brokerId: p.rivalBrokerId,
          oldPrice: p.priceBefore,
          newPrice: p.priceAfter,
          priceDelta: p.priceAfter - p.priceBefore,
          affectedMarketCellIds: p.marketCellId ? [p.marketCellId] : [],
        },
        {
          actorIds: [p.rivalBrokerId],
          causeEventIds: [],
          sourceRecordId: record.sourceId,
          sourceReplayKey: record.replayKey,
          sourceKind: record.sourceKind,
        },
      ),
    );
  } else {
    // Map rival_action subtype to RivalBrokerActionKind
    const actionKind = mapRivalActionSubtype(p.subtype);
    events.push(
      buildRivalBrokerActionTaken(
        `${baseId}-broker`,
        record.day,
        {
          brokerId: p.rivalBrokerId,
          acnId: p.rivalAcnId,
          actionKind,
          energyCost: 10,
          actionIntensity: 50,
          targetListingId: p.listingId,
          targetMarketCellId: p.marketCellId,
        },
        {
          actorIds: [p.rivalBrokerId],
          causeEventIds: [],
          sourceRecordId: record.sourceId,
          sourceReplayKey: record.replayKey,
          sourceKind: record.sourceKind,
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
  const baseId = `ingest-ci-${record.day}-${record.sourceId}-${index}`;
  const events: WorldCausalEvent[] = [];

  if (p.subtype === 'preference_shifted' && p.listingId) {
    // Attention shift: customer moved from one listing to another
    events.push(
      buildCustomerAttentionShifted(
        `${baseId}-shift`,
        record.day,
        {
          fromListingIds: [],
          toListingIds: [p.listingId],
          segment: 'ingested',
          causeEventId: record.sourceId,
        },
        {
          actorIds: p.customerId ? [p.customerId] : [],
          sourceRecordId: record.sourceId,
          sourceReplayKey: record.replayKey,
          sourceKind: record.sourceKind,
        },
      ),
    );
  } else {
    // Generic comparison
    const comparedIds = p.listingId ? [p.listingId] : [];
    events.push(
      buildCustomerComparedListings(
        `${baseId}-compare`,
        record.day,
        {
          customerId: p.customerId,
          comparedListingIds: comparedIds,
          attentionDelta: 0,
          reasonSignals: [p.subtype],
        },
        {
          actorIds: p.customerId ? [p.customerId] : [],
          causeEventIds: [],
          sourceRecordId: record.sourceId,
          sourceReplayKey: record.replayKey,
          sourceKind: record.sourceKind,
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
  const baseId = `ingest-oi-${record.day}-${record.sourceId}-${index}`;
  const events: WorldCausalEvent[] = [];

  if (p.subtype === 'trust_expressed' || p.subtype === 'trust_withdrawn') {
    const trustDelta = p.subtype === 'trust_expressed' ? 5 : -5;
    events.push(
      buildBrokerRecommendationChanged(
        `${baseId}-rec`,
        record.day,
        {
          caseId: p.caseId,
          recommendationKind: p.subtype === 'trust_expressed' ? 'push_showing' : 'wait_and_see',
          causedByEventIds: [record.sourceId],
          explanationFacts: [`业主${p.subtype === 'trust_expressed' ? '表达信任' : '撤回信任'}，信任变化 ${trustDelta > 0 ? '+' : ''}${trustDelta}`],
        },
        {
          actorIds: [p.brokerId],
          sourceRecordId: record.sourceId,
          sourceReplayKey: record.replayKey,
          sourceKind: record.sourceKind,
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
          ownerId: p.ownerId,
          caseId: p.caseId,
          perceivedSignalIds: [record.sourceId],
          pressureDelta: p.tone === 'hostile' ? 20 : p.tone === 'negative' ? 10 : 5,
          delayDays: 0,
          confidence: record.confidence,
        },
        {
          actorIds: [p.ownerId, p.brokerId],
          causeEventIds: [record.sourceId],
          sourceRecordId: record.sourceId,
          sourceReplayKey: record.replayKey,
          sourceKind: record.sourceKind,
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
  const baseId = `ingest-mm-${record.day}-${record.sourceId}-${index}`;
  const events: WorldCausalEvent[] = [];

  const primaryCaseId = p.caseIds[0] ?? 'unknown-case';

  if (p.subtype === 'focus_case_selected' || p.subtype === 'escalation_requested') {
    events.push(
      buildMatterPriorityChanged(
        `${baseId}-matter`,
        record.day,
        {
          caseId: primaryCaseId,
          priorityBefore: 50,
          priorityAfter: p.priority,
          causedByEventIds: [record.sourceId],
        },
        {
          actorIds: [p.targetBrokerId],
          sourceRecordId: record.sourceId,
          sourceReplayKey: record.replayKey,
          sourceKind: record.sourceKind,
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
          explanationFacts: [`管理层指令: ${p.instruction}`],
        },
        {
          actorIds: [p.targetBrokerId],
          sourceRecordId: record.sourceId,
          sourceReplayKey: record.replayKey,
          sourceKind: record.sourceKind,
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
  const baseId = `ingest-par-${record.day}-${record.sourceId}-${index}`;
  const events: WorldCausalEvent[] = [];

  if (p.outcome === 'success') {
    events.push(
      buildBrokerRecommendationChanged(
        `${baseId}-rec`,
        record.day,
        {
          caseId: p.caseId,
          recommendationKind: 'push_showing',
          causedByEventIds: [record.sourceId],
          explanationFacts: [`玩家执行动作 ${p.actionId}，能量消耗 ${p.costEnergy}`],
        },
        {
          actorIds: [p.executorId],
          sourceRecordId: record.sourceId,
          sourceReplayKey: record.replayKey,
          sourceKind: record.sourceKind,
        },
      ),
    );
  } else {
    events.push(
      buildMatterPriorityChanged(
        `${baseId}-matter`,
        record.day,
        {
          caseId: p.caseId,
          priorityBefore: 50,
          priorityAfter: 30,
          causedByEventIds: [record.sourceId],
        },
        {
          actorIds: [p.executorId],
          sourceRecordId: record.sourceId,
          sourceReplayKey: record.replayKey,
          sourceKind: record.sourceKind,
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
  const baseId = `ingest-pr-${record.day}-${record.sourceId}-${index}`;
  const events: WorldCausalEvent[] = [];

  const primaryCaseId = p.caseIds[0] ?? 'unknown-case';

  if (p.subtype === 'deal_signed' || p.subtype === 'consensus_reached') {
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
          actorIds: p.brokerIds,
          sourceRecordId: record.sourceId,
          sourceReplayKey: record.replayKey,
          sourceKind: record.sourceKind,
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
          explanationFacts: [`流程 ${p.processType} 完成: ${p.outcome}`],
        },
        {
          actorIds: p.brokerIds,
          sourceRecordId: record.sourceId,
          sourceReplayKey: record.replayKey,
          sourceKind: record.sourceKind,
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
  const baseId = `ingest-ct-${record.day}-${record.sourceId}-${index}`;
  const events: WorldCausalEvent[] = [];

  if (p.subtype === 'deal_closed') {
    // Comparable transaction affects owner perception through market signal
    events.push(
      buildOwnerMarketPressurePerceived(
        `${baseId}-owner-pressure`,
        record.day,
        {
          caseId: p.listingId ?? 'unknown-case',
          perceivedSignalIds: [record.sourceId],
          pressureDelta: Math.round(p.discountPct * 2),
          delayDays: p.dataSource === 'platform公开' ? 1 : 2,
          confidence: record.confidence,
        },
        {
          actorIds: [],
          causeEventIds: [record.sourceId],
          sourceRecordId: record.sourceId,
          sourceReplayKey: record.replayKey,
          sourceKind: record.sourceKind,
        },
      ),
    );
  }

  if (p.subtype === 'price_adjusted' || p.subtype === 'deal_closed') {
    events.push(
      buildMarketHeatShifted(
        `${baseId}-heat`,
        record.day,
        {
          marketCellId: p.marketCellId,
          before: p.askPrice,
          after: p.price,
          sourceSignalId: record.sourceId,
          sourceSignalType: `comparable-${p.subtype}`,
          confidence: record.confidence,
        },
        {
          actorIds: [],
          causeEventIds: [record.sourceId],
          sourceRecordId: record.sourceId,
          sourceReplayKey: record.replayKey,
          sourceKind: record.sourceKind,
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
  const baseId = `ingest-pt-${record.day}-${record.sourceId}-${index}`;
  const events: WorldCausalEvent[] = [];

  if (p.subtype === 'traffic_spike' || p.subtype === 'listing_viewed') {
    events.push(
      buildMarketHeatShifted(
        `${baseId}-heat`,
        record.day,
        {
          marketCellId: p.marketCellId,
          before: 50,
          after: Math.min(100, 50 + Math.round(p.viewCount / 10)),
          sourceSignalId: record.sourceId,
          sourceSignalType: `traffic-${p.subtype}`,
          confidence: record.confidence,
        },
        {
          actorIds: [],
          causeEventIds: [record.sourceId],
          sourceRecordId: record.sourceId,
          sourceReplayKey: record.replayKey,
          sourceKind: record.sourceKind,
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
  const baseId = `ingest-an-${record.day}-${record.sourceId}-${index}`;
  const events: WorldCausalEvent[] = [];

  if (p.subtype === 'competition_escalation') {
    events.push(
      buildRivalBrokerActionTaken(
        `${baseId}-rival`,
        record.day,
        {
          brokerId: p.brokerIds[0] ?? 'unknown-broker',
          acnId: p.sourceAcnId,
          actionKind: 'follow_customer',
          energyCost: 10,
          actionIntensity: Math.abs(p.cooperationScore),
          targetListingId: p.listingId,
        },
        {
          actorIds: p.brokerIds,
          causeEventIds: [],
          sourceRecordId: record.sourceId,
          sourceReplayKey: record.replayKey,
          sourceKind: record.sourceKind,
        },
      ),
    );
  } else {
    const primaryCaseId = p.caseId ?? 'unknown-case';
    events.push(
      buildBrokerRecommendationChanged(
        `${baseId}-rec`,
        record.day,
        {
          caseId: primaryCaseId,
          recommendationKind: p.subtype === 'cooperation_opportunity' ? 'push_showing' : 'wait_and_see',
          causedByEventIds: [record.sourceId],
          explanationFacts: [`ACN网络信号: ${p.subtype}`],
        },
        {
          actorIds: p.brokerIds,
          sourceRecordId: record.sourceId,
          sourceReplayKey: record.replayKey,
          sourceKind: record.sourceKind,
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
  switch (record.sourceKind) {
    case 'market_signal':
      return buildFromMarketSignal(record as InformationSourceRecord<'market_signal'>, index);
    case 'rival_action':
      return buildFromRivalAction(record as InformationSourceRecord<'rival_action'>, index);
    case 'customer_interaction':
      return buildFromCustomerInteraction(record as InformationSourceRecord<'customer_interaction'>, index);
    case 'owner_interview':
      return buildFromOwnerInterview(record as InformationSourceRecord<'owner_interview'>, index);
    case 'manager_message':
      return buildFromManagerMessage(record as InformationSourceRecord<'manager_message'>, index);
    case 'player_action_receipt':
      return buildFromPlayerActionReceipt(record as InformationSourceRecord<'player_action_receipt'>, index);
    case 'process_receipt':
      return buildFromProcessReceipt(record as InformationSourceRecord<'process_receipt'>, index);
    case 'comparable_transaction':
      return buildFromComparableTransaction(record as InformationSourceRecord<'comparable_transaction'>, index);
    case 'platform_traffic':
      return buildFromPlatformTraffic(record as InformationSourceRecord<'platform_traffic'>, index);
    case 'acn_network_signal':
      return buildFromAcnNetworkSignal(record as InformationSourceRecord<'acn_network_signal'>, index);
    default:
      return [];
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

  // Step 4: Enforce per-kind event cap
  const kindEventCounts = new Map<string, number>();
  const cappedCausalEvents: WorldCausalEvent[] = [];
  const cappedDailyEvents: BigWorldDailyEvent[] = [];
  const cappedSourceToEvents = new Map<string, string[]>();

  let sourcesCapped = 0;

  for (let i = 0; i < deduplicated.length; i += 1) {
    const record = deduplicated[i];
    const currentCount = kindEventCounts.get(record.sourceKind) ?? 0;

    // Find events produced by this source
    const eventIds = baseReceipt.sourceToEvents.get(record.sourceId) ?? [];
    const remaining = maxEventsPerKind - currentCount;

    if (remaining <= 0) {
      sourcesCapped += 1;
      continue;
    }

    const eventsToKeep = Math.min(eventIds.length, remaining);
    kindEventCounts.set(record.sourceKind, currentCount + eventsToKeep);

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
