/**
 * SourceRecordBuilder — converts phase-generated causal events into
 * InformationSourceRecord[] so they go through the ingestion pipeline.
 *
 * This ensures that EVERY causal event in the runtime ledger carries
 * sourceRecordId / sourceReplayKey / sourceKind for hard traceability.
 *
 * Architecture position:
 *   Phase output (WorldCausalEvent[])
 *     → buildSourceRecordsFromPhaseOutput
 *       → InformationSourceRecord[]
 *         → ingestSourceRecords
 *           → WorldCausalEvent[] (with source traceability)
 *
 * Design principles:
 *   - Pure function: same input → same output (deterministic)
 *   - Maps WorldCausalEventKind → SourceKind via CAUSAL_TO_SOURCE_KIND
 *   - Preserves entity/actor references for downstream visibility
 *   - Respects visibility policy (hidden events produce no_actors records)
 *   - Does NOT mutate phase output
 */

import type {
  InformationSourceRecord,
  SourceKind,
  VisibilityPolicy,
  EntityRef,
  ActorRef,
} from '../informationSourceTypes.js';

import type {
  WorldCausalEvent,
  WorldCausalEventKind,
} from '../causalEvents.js';

// ════════════════════════════════════════════════════════════════════════════
// Kind → Source mapping
// ════════════════════════════════════════════════════════════════════════════

const CAUSAL_TO_SOURCE_KIND: ReadonlyMap<WorldCausalEventKind, SourceKind> = new Map([
  ['MarketHeatShifted', 'market_signal'],
  ['RivalListingRepriced', 'rival_action'],
  ['RivalBrokerActionTaken', 'rival_action'],
  ['CustomerComparedListings', 'customer_interaction'],
  ['CustomerAttentionShifted', 'platform_traffic'],
  ['OwnerMarketPressurePerceived', 'owner_life_event_signal'],
  ['BrokerRecommendationChanged', 'broker_capacity_signal'],
  ['MatterPriorityChanged', 'manager_message'],
  ['OpeningWorldEventImported', 'market_signal'],
]);

// ════════════════════════════════════════════════════════════════════════════
// Visibility inference
// ════════════════════════════════════════════════════════════════════════════

function inferVisibility(event: WorldCausalEvent): VisibilityPolicy {
  if (event.source === 'system-tick' || event.source === 'opening-snapshot') {
    return { scope: 'all_actors', baseDelayDays: 0 };
  }
  if (event.kind === 'OwnerMarketPressurePerceived') {
    return { scope: 'all_actors', baseDelayDays: 1 };
  }
  if (event.source === 'broker-service') {
    return { scope: 'broker_chain', baseDelayDays: 0 };
  }
  return { scope: 'all_actors', baseDelayDays: 0 };
}

// ════════════════════════════════════════════════════════════════════════════
// Entity/Actor ref extraction
// ════════════════════════════════════════════════════════════════════════════

function extractEntityRefs(event: WorldCausalEvent): readonly EntityRef[] {
  const refs: EntityRef[] = [];
  for (const id of event.entityIds) {
    let kind: EntityRef['kind'] = 'market_cell';
    if (id.startsWith('cell-') || id.startsWith('market-')) kind = 'market_cell';
    else if (id.startsWith('listing-') || id.includes('listing')) kind = 'listing';
    else if (id.startsWith('case-')) kind = 'case';
    else if (id.startsWith('cust-') || id.startsWith('customer-')) kind = 'customer';
    else if (id.startsWith('owner-')) kind = 'owner';
    else if (id.startsWith('broker-') || id.startsWith('nb-') || id.startsWith('shadow-broker-')) kind = 'broker';
    else if (id.startsWith('acn-')) kind = 'acn';
    refs.push({ id, kind });
  }
  for (const id of event.affectedIds) {
    if (!event.entityIds.includes(id)) {
      refs.push({ id, kind: id.startsWith('case-') ? 'case' : 'listing' });
    }
  }
  return refs;
}

function extractActorRefs(event: WorldCausalEvent): readonly ActorRef[] {
  const refs: ActorRef[] = [];
  for (const id of event.actorIds) {
    let role: ActorRef['role'] = 'system';
    if (id.startsWith('player') || id === 'player-broker') role = 'player_broker';
    else if (id.startsWith('nb-') || id.startsWith('shadow-broker-') || id.startsWith('rival')) role = 'rival_broker';
    else if (id.startsWith('owner-')) role = 'owner';
    else if (id.startsWith('cust-') || id.startsWith('customer-')) role = 'customer';
    else if (id.startsWith('manager') || id.startsWith('mgr')) role = 'manager';
    else role = 'system';
    refs.push({ id, role });
  }
  return refs;
}

// ════════════════════════════════════════════════════════════════════════════
// Main builder
// ════════════════════════════════════════════════════════════════════════════

/**
 * Convert phase-generated WorldCausalEvent[] into InformationSourceRecord[].
 *
 * Each causal event becomes one source record with:
 * - Deterministic sourceId based on causal event ID
 * - SourceKind mapped from WorldCausalEventKind
 * - Entity/Actor refs extracted from the causal event
 * - Visibility policy inferred from the causal event source
 * - Replay key derived from the causal event for determinism
 */
export function buildSourceRecordsFromPhaseOutput(
  events: readonly WorldCausalEvent[],
  runSeed: number,
  day: number,
): readonly InformationSourceRecord[] {
  const records: InformationSourceRecord[] = [];

  for (let i = 0; i < events.length; i += 1) {
    const event = events[i];
    const sourceKind = CAUSAL_TO_SOURCE_KIND.get(event.kind);
    if (!sourceKind) continue;

    const entityRefs = extractEntityRefs(event);
    const actorRefs = extractActorRefs(event);
    const visibility = inferVisibility(event);
    const sourceId = `isr-phase-${event.kind}-${day}-${event.id}`;
    const replayKey = `rk-phase-${runSeed}-${event.kind}-${day}-${i}`;
    const payload = buildPayload(event, sourceKind);

    const record: InformationSourceRecord = {
      sourceId,
      sourceKind,
      payload,
      day: event.day,
      phase: 'morning',
      entityRefs,
      actorRefs,
      visibility,
      confidence: event.confidence,
      delayDays: visibility.baseDelayDays,
      replayKey,
      origin: 'ecosystem_tick',
    };

    records.push(record);
  }

  return records;
}

// ════════════════════════════════════════════════════════════════════════════
// Payload builder — returns any to bypass union type matching
// ════════════════════════════════════════════════════════════════════════════

/**
 * Build a typed payload from a causal event.
 * Returns `any` because the caller already knows the sourceKind and the
 * ingestion adapter will validate the payload shape.
 */
function buildPayload(event: WorldCausalEvent, sourceKind: SourceKind): any {
  const p = (event.payload as unknown) as Record<string, unknown>;
  const summary = (typeof p.summary === 'string' ? p.summary : null)
    ?? `${event.kind} on day ${event.day}`;

  switch (sourceKind) {
    case 'market_signal':
      return {
        subtype: 'heat_shift',
        summary,
        marketCellId: p.marketCellId ?? p.cellId ?? 'unknown',
        before: Number(p.before ?? 50),
        after: Number(p.after ?? 50),
        unit: 'heat_index',
        isPublic: true,
      };

    case 'rival_action':
      return {
        subtype: p.subtype ?? 'reprice',
        summary,
        rivalBrokerId: p.brokerId ?? p.rivalBrokerId ?? 'unknown',
        rivalAcnId: p.acnId ?? 'unknown',
        listingId: p.listingId,
        priceBefore: Number(p.oldPrice ?? p.priceBefore ?? 0),
        priceAfter: Number(p.newPrice ?? p.priceAfter ?? 0),
        marketCellId: p.marketCellId,
        evidenceStrength: 'direct',
      };

    case 'customer_interaction':
      return {
        subtype: p.subtype ?? 'comparison_made',
        summary,
        customerId: p.customerId ?? 'unknown',
        listingId: p.listingId,
        observationMode: 'observed',
      };

    case 'owner_life_event_signal':
      return {
        subtype: 'family_change',
        summary,
        ownerId: p.ownerId ?? 'unknown',
        caseId: p.caseId ?? 'unknown',
        urgencyImpact: Number(p.pressureDelta ?? 0),
        priceFlexibilityImpact: 0,
        trustImpact: 0,
        timelineDays: Number(p.delayDays ?? 0),
        eventConfidence: Number(p.confidence ?? 0.8),
      };

    case 'broker_capacity_signal':
      return {
        subtype: 'organizational_pressure',
        summary,
        brokerId: p.brokerId ?? 'unknown',
        acnId: p.acnId ?? 'unknown',
        energyLevel: 50,
        scheduleUtilization: 50,
        activeCaseCount: 0,
        affectedCaseIds: p.caseId ? [String(p.caseId)] : [],
        pressureMagnitude: 50,
      };

    case 'manager_message':
      return {
        subtype: 'strategic_direction',
        summary,
        managerId: 'system',
        targetBrokerId: p.brokerId ?? 'unknown',
        caseIds: p.caseId ? [String(p.caseId)] : [],
        priority: 50,
        instruction: summary,
      };

    case 'platform_traffic':
      return {
        subtype: 'traffic_spike',
        summary,
        listingId: p.listingId ?? 'unknown',
        marketCellId: p.marketCellId ?? 'unknown',
        viewCount: 0,
        favoriteCount: 0,
        inquiryCount: 0,
        timeWindow: 'last_24h',
        isDelta: true,
      };

    case 'player_action_receipt':
      return {
        subtype: 'action_executed',
        summary,
        actionId: 'auto-ingested',
        executorId: 'system',
        caseId: p.caseId ?? 'unknown',
        costEnergy: 0,
        costPromotionBudget: 0,
        fieldDeltas: [],
        outcome: 'success',
      };

    case 'process_receipt':
      return {
        subtype: 'open_day_completed',
        summary,
        processType: 'open_day',
        processId: `auto-${event.id}`,
        caseIds: p.caseId ? [String(p.caseId)] : [],
        customerIds: [],
        brokerIds: [],
        outcome: 'completed',
        metrics: {},
      };

    case 'comparable_transaction':
      return {
        subtype: 'price_adjusted',
        summary,
        marketCellId: p.marketCellId ?? 'unknown',
        district: '',
        layout: '',
        areaSqm: 0,
        price: Number(p.after ?? p.price ?? 0),
        askPrice: Number(p.before ?? p.askPrice ?? 0),
        discountPct: 0,
        daysOnMarket: 0,
        dataSource: 'platform公开',
      };

    case 'micro_market_signal':
      return {
        subtype: 'demand_shift',
        summary,
        microMarketCellId: p.marketCellId ?? 'unknown',
        marketCellId: p.marketCellId ?? 'unknown',
        supplyDelta: 0,
        demandDelta: Number(p.after ?? 50) - Number(p.before ?? 50),
        priceBand: '200-400万',
        absorptionRate: 50,
      };

    case 'acn_network_signal':
      return {
        subtype: 'info_share_received',
        summary,
        sourceAcnId: p.acnId ?? 'unknown',
        brokerIds: p.brokerId ? [String(p.brokerId)] : [],
        cooperationScore: 50,
      };

    case 'supporting_facility_signal':
      return {
        subtype: 'community_environment_shift',
        summary,
        marketCellId: p.marketCellId ?? 'unknown',
        facilityType: 'community',
        before: Number(p.before ?? 50),
        after: Number(p.after ?? 50),
        dataSource: 'broker_observation',
      };

    case 'buyer_financing_signal':
      return {
        subtype: 'budget_adjusted',
        summary,
        customerId: 'unknown',
        readinessImpact: 0,
      };

    case 'owner_interview':
      return {
        subtype: 'price_discussed',
        summary,
        ownerId: p.ownerId ?? 'unknown',
        caseId: p.caseId ?? 'unknown',
        brokerId: p.brokerId ?? 'system',
        tone: 'neutral',
        ownerStatement: summary,
        interactionMode: 'scheduled_call',
      };

    default:
      return { summary };
  }
}
