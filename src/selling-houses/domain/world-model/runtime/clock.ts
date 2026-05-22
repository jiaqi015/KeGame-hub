/**
 * BigWorldClock — autonomous world movement orchestrator.
 *
 * Runs the 8-phase daily tick pipeline and produces a BigWorldTickReceipt.
 * The clock advances the world regardless of player action.
 *
 * Usage:
 *   const receipt = runBigWorldDayTick(state);
 *   // receipt contains phase results, daily events, summary, and causal events
 *   // caller applies receipt to GameState (mutates state.bigWorldRuntime)
 *
 * Deterministic: same seed + same input state → same receipt.
 *
 * Mother model alignment:
 *   - Section 10: Competition is environment
 *   - Section 13: Causal Transmission
 *   - Section 14: Game Loop Qualities (fast feedback, surprise)
 *
 * Hard constraints:
 *   - No case.status mutation
 *   - No closedDeals mutation
 *   - No owner trust/patience/urgency raw field mutation
 *   - No UI projection fields as canonical facts
 *   - All events are deterministic
 *   - Compaction runs every tick to enforce bounds
 */

import type {
  BigWorldRuntimeState,
  BigWorldRuntimeSummary,
  BigWorldTickReceipt,
  BigWorldClockInput,
  BigWorldDailyEvent,
  BigWorldTickPhaseResult,
  ColdLedgerSummary,
  WorldRuntimeCompactionPolicy,
} from './types.js';

import { DEFAULT_COMPACTION_POLICY as DEFAULT_POLICY, buildTimeContext } from './types.js';
import { deriveBrandId, resolveStoreAcnId } from './brandIdHelper.js';

import { runAllPhases } from './phases.js';
import {
  buildRuntimeSummary,
  buildColdLedgerSummary,
  compactWorldCausalEvents,
  normalizeRuntimeState,
  createDefaultRuntimeState,
  runCompactionPass,
} from './compaction.js';

import { ingestSourceRecords } from './sourceIngestionAdapter.js';
import type { SourceIngestionReceipt } from './sourceIngestionAdapter.js';
import { buildSourceRecordsFromPhaseOutput } from './sourceRecordBuilder.js';
import { generateMarketFormationSourceRecords } from './marketFormationRuntime.js';
import { generateEconomyReceipt } from './economicReceiptWiring.js';

import type { WorldCausalEvent } from '../causalEvents.js';
import type {
  InformationSourceRecord,
  SourceKind,
  VisibilityPolicy,
  EntityRef,
  ActorRef,
  RivalActionSubtype,
} from '../informationSourceTypes.js';

// ── Source record builders for new source kinds ────────────────────────

/**
 * Map SourceKind → causal event kinds it can produce.
 * Used to build source records with correct payload shape.
 */
const SOURCE_CAUSAL_MAP: ReadonlyMap<SourceKind, readonly string[]> = new Map([
  ['market_signal', ['MarketHeatShifted', 'OwnerMarketPressurePerceived']],
  ['rival_action', ['RivalListingRepriced', 'RivalBrokerActionTaken', 'OwnerMarketPressurePerceived']],
  ['customer_interaction', ['CustomerComparedListings', 'CustomerAttentionShifted']],
  ['owner_interview', ['OwnerMarketPressurePerceived', 'BrokerRecommendationChanged']],
  ['manager_message', ['MatterPriorityChanged', 'BrokerRecommendationChanged']],
  ['player_action_receipt', ['BrokerRecommendationChanged', 'MatterPriorityChanged']],
  ['process_receipt', ['BrokerRecommendationChanged', 'MatterPriorityChanged', 'OwnerMarketPressurePerceived']],
  ['comparable_transaction', ['OwnerMarketPressurePerceived', 'MarketHeatShifted']],
  ['platform_traffic', ['MarketHeatShifted', 'CustomerAttentionShifted']],
  ['acn_network_signal', ['RivalBrokerActionTaken', 'BrokerRecommendationChanged']],
  ['supporting_facility_signal', ['MarketHeatShifted', 'OwnerMarketPressurePerceived']],
  ['broker_capacity_signal', ['BrokerRecommendationChanged', 'MatterPriorityChanged']],
  ['owner_life_event_signal', ['OwnerMarketPressurePerceived', 'BrokerRecommendationChanged']],
  ['buyer_financing_signal', ['BrokerRecommendationChanged', 'MatterPriorityChanged']],
  ['micro_market_signal', ['MarketHeatShifted', 'CustomerAttentionShifted']],
]);

/**
 * Generate additional source records for 5 new source kinds from phase data.
 *
 * These source kinds don't have dedicated phase generators but represent
 * real-world information that should flow through the ingestion pipeline.
 * We derive them from existing phase data (market cells, cases, customers, etc.)
 * so they're deterministic and don't require external source injection.
 *
 * This is the "source-big" guarantee: all 15 source kinds participate in
 * the runtime ingestion pipeline, not just the 9 that have dedicated phases.
 *
 * Round 15: redesigned for richer daily market dynamics. Each entity generates
 * multiple records per day with different subtypes, using deterministic hashing
 * with day-dependent seeds for real variation across days.
 */

// ── Deterministic hashing (same algorithm as phases.ts) ─────────────────
function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededInt(seed: string, min: number, max: number): number {
  return min + (stableHash(seed) % (max - min + 1));
}

function seededFloat(seed: string, min: number, max: number): number {
  return min + (stableHash(seed) / 4294967296) * (max - min);
}

function seededChoice<T>(seed: string, items: readonly T[]): T {
  return items[stableHash(seed) % items.length];
}

function generateAdditionalSourceRecords(
  input: BigWorldClockInput,
  day: number,
  runSeed: number,
): readonly InformationSourceRecord[] {
  const records: InformationSourceRecord[] = [];
  const salt = `${runSeed}-${day}`;

  // Build store lookup for listing→store ACN resolution
  const storeById = new Map(input.rivalStores.map((s) => [s.id, s]));

  // ── 1. RIVAL ACTION: reprice / new_listing / withdraw / open_day ──────
  //    Each day, 1-3 rival listings get acted on, with varying actions.
  const activeListings = input.rivalListings.filter((l) => l.status === 'active');
  const rivalActionCount = seededInt(`${salt}-ra-count`, 1, Math.min(3, activeListings.length));
  for (let i = 0; i < rivalActionCount; i++) {
    const idx = seededInt(`${salt}-ra-idx-${i}`, 0, activeListings.length - 1);
    const listing = activeListings[idx];
    if (!listing) continue;

    const subtypes: readonly string[] = ['reprice', 'new_listing', 'withdraw_listing', 'open_day_held', 'customer_followed', 'owner_pitched'];
    const subtype = seededChoice(`${salt}-ra-sub-${i}`, subtypes) as RivalActionSubtype;
    const priceBefore = listing.askPrice;
    const priceDelta = seededInt(`${salt}-ra-delta-${i}`, -15, 10);
    const priceAfter = Math.max(100, priceBefore + priceDelta);

    records.push({
      sourceId: `isr-ra-${day}-${listing.id}-${i}`,
      sourceKind: 'rival_action',
      payload: {
        subtype,
        summary: `${listing.district}竞品${subtype}: ${listing.title}`,
        rivalBrokerId: `shadow-broker-${listing.storeId}`,
        rivalAcnId: resolveStoreAcnId(storeById.get(listing.storeId) ?? { id: listing.storeId }),
        listingId: listing.id,
        priceBefore,
        priceAfter,
        marketCellId: listing.marketCellId,
        evidenceStrength: 'direct',
      },
      day,
      phase: seededChoice(`${salt}-ra-phase-${i}`, ['morning', 'afternoon'] as const),
      entityRefs: [
        { id: listing.id, kind: 'listing' },
        { id: listing.marketCellId, kind: 'market_cell' },
      ],
      actorRefs: [{ id: `shadow-broker-${listing.storeId}`, role: 'rival_broker' }],
      visibility: { scope: 'all_actors', baseDelayDays: 0 },
      confidence: seededFloat(`${salt}-ra-conf-${i}`, 0.6, 0.95),
      delayDays: 0,
      replayKey: `rk-ra-${runSeed}-${day}-${listing.id}-${i}`,
      origin: 'ecosystem_tick',
    } as InformationSourceRecord<'rival_action'>);
  }

  // ── 2. CUSTOMER INTERACTION: attention shift / budget change / fatigue ─
  //    Each day, 1-2 customers shift attention or change budget.
  const activeCustomers = input.customerStates.filter((c) => c.status !== 'lost' && c.status !== 'converted');
  const custInteractionCount = seededInt(`${salt}-ci-count`, 1, Math.min(2, activeCustomers.length));
  for (let i = 0; i < custInteractionCount; i++) {
    const idx = seededInt(`${salt}-ci-idx-${i}`, 0, activeCustomers.length - 1);
    const customer = activeCustomers[idx];
    if (!customer) continue;

    const subtypes: readonly string[] = ['preference_shifted', 'budget_adjusted', 'dropout_detected', 'family_decision_involved'];
    const subtype = seededChoice(`${salt}-ci-sub-${i}`, subtypes);
    const fromIdx = seededInt(`${salt}-ci-from-${i}`, 0, customer.activeCaseIds.length - 1);
    const toIdx = (fromIdx + 1) % customer.activeCaseIds.length;

    records.push({
      sourceId: `isr-ci-${day}-${customer.customerId}-${i}`,
      sourceKind: 'customer_interaction',
      payload: {
        subtype,
        summary: `客户${customer.customerId} ${subtype}: 疲劳${customer.fatigue}`,
        customerId: customer.customerId,
        listingId: customer.activeCaseIds[toIdx],
        observationMode: 'observed',
      },
      day,
      phase: seededChoice(`${salt}-ci-phase-${i}`, ['morning', 'afternoon'] as const),
      entityRefs: [
        { id: customer.customerId, kind: 'customer' },
        ...(customer.activeCaseIds[toIdx] ? [{ id: customer.activeCaseIds[toIdx], kind: 'listing' as const }] : []),
      ],
      actorRefs: [{ id: customer.customerId, role: 'customer' }],
      visibility: { scope: 'player_only', baseDelayDays: 0 },
      confidence: seededFloat(`${salt}-ci-conf-${i}`, 0.5, 0.9),
      delayDays: 0,
      replayKey: `rk-ci-${runSeed}-${day}-${customer.customerId}-${i}`,
      origin: 'ecosystem_tick',
    } as InformationSourceRecord<'customer_interaction'>);
  }

  // ── 3. OWNER INTERVIEW: trust/price/urgency signals ──────────────────
  //    Each day, 1-2 owners express trust/price/urgency signals.
  const ownerInterviewCount = seededInt(`${salt}-oi-count`, 1, Math.min(2, input.activeCases.length));
  for (let i = 0; i < ownerInterviewCount; i++) {
    const idx = seededInt(`${salt}-oi-idx-${i}`, 0, input.activeCases.length - 1);
    const caseItem = input.activeCases[idx];
    if (!caseItem) continue;

    const subtypes: readonly string[] = ['price_discussed', 'trust_expressed', 'objection_raised', 'urgency_revealed'];
    const subtype = seededChoice(`${salt}-oi-sub-${i}`, subtypes);
    const tone = seededChoice(`${salt}-oi-tone-${i}`, ['positive', 'neutral', 'negative'] as const);

    records.push({
      sourceId: `isr-oi-${day}-${caseItem.id}-${i}`,
      sourceKind: 'owner_interview',
      payload: {
        subtype,
        summary: `${caseItem.ownerName}沟通: ${subtype}, 信任${caseItem.trust}`,
        ownerId: caseItem.ownerName,
        caseId: caseItem.id,
        brokerId: 'player-broker',
        trustLevel: caseItem.trust,
        tone,
        ownerStatement: `${subtype}: 信任${caseItem.trust}, 耐心${caseItem.patience}`,
        interactionMode: seededChoice(`${salt}-oi-mode-${i}`, ['scheduled_call', 'ad_hoc', 'meeting'] as const),
      },
      day,
      phase: 'afternoon',
      entityRefs: [
        { id: caseItem.id, kind: 'case' },
        { id: caseItem.ownerName, kind: 'owner' },
      ],
      actorRefs: [
        { id: 'player-broker', role: 'player_broker' },
        { id: caseItem.ownerName, role: 'owner' },
      ],
      visibility: { scope: 'specific_actors', actorIds: ['player-broker', caseItem.ownerName], baseDelayDays: 0 },
      confidence: seededFloat(`${salt}-oi-conf-${i}`, 0.6, 0.9),
      delayDays: 0,
      replayKey: `rk-oi-${runSeed}-${day}-${caseItem.id}-${i}`,
      origin: 'ecosystem_tick',
    } as InformationSourceRecord<'owner_interview'>);
  }

  // ── 4. BROKER CAPACITY: energy / schedule / collaboration signals ────
  //    Each day, 1-2 rival stores report capacity signals.
  const brokerCapacityCount = seededInt(`${salt}-bc-count`, 1, Math.min(2, input.rivalStores.length));
  for (let i = 0; i < brokerCapacityCount; i++) {
    const idx = seededInt(`${salt}-bc-idx-${i}`, 0, input.rivalStores.length - 1);
    const store = input.rivalStores[idx];
    if (!store) continue;

    const subtypes: readonly string[] = ['workload_balanced', 'energy_depleted', 'organizational_pressure', 'collaboration_requested'];
    const subtype = seededChoice(`${salt}-bc-sub-${i}`, subtypes);
    const energy = seededInt(`${salt}-bc-energy-${i}`, 20, 90);

    records.push({
      sourceId: `isr-bc-${day}-${store.id}-${i}`,
      sourceKind: 'broker_capacity_signal',
      payload: {
        subtype,
        summary: `${store.name}经纪人能力: ${subtype}, 精力${energy}`,
        brokerId: `shadow-broker-${store.id}`,
        acnId: resolveStoreAcnId(store),
        energyLevel: energy,
        scheduleUtilization: seededInt(`${salt}-bc-util-${i}`, 30, 95),
        activeCaseCount: seededInt(`${salt}-bc-cases-${i}`, 1, 8),
        affectedCaseIds: [],
        pressureMagnitude: seededInt(`${salt}-bc-press-${i}`, 10, 80),
      },
      day,
      phase: 'morning',
      entityRefs: [{ id: store.id, kind: 'store' }],
      actorRefs: [{ id: `shadow-broker-${store.id}`, role: 'rival_broker' }],
      visibility: { scope: 'all_actors', baseDelayDays: 0 },
      confidence: seededFloat(`${salt}-bc-conf-${i}`, 0.6, 0.9),
      delayDays: 0,
      replayKey: `rk-bc-${runSeed}-${day}-${store.id}-${i}`,
      origin: 'ecosystem_tick',
    } as InformationSourceRecord<'broker_capacity_signal'>);
  }

  // ── 5. MANAGER MESSAGE: focus case / resource allocation / strategy ───
  //    Each day, manager selects focus case and allocates resources.
  if (input.activeCases.length > 0) {
    const sorted = [...input.activeCases].sort((a, b) => b.urgency - a.urgency);
    const focusCase = sorted[0];
    const priority = Math.round(focusCase.urgency * 0.8 + focusCase.competitiveness * 0.2);

    const subtypes: readonly string[] = ['focus_case_selected', 'resource_allocated', 'strategic_direction'];
    const subtype = seededChoice(`${salt}-mm-sub`, subtypes);

    records.push({
      sourceId: `isr-mm-${day}-focus`,
      sourceKind: 'manager_message',
      payload: {
        subtype,
        summary: `经理聚焦: ${focusCase.title} 紧急度${focusCase.urgency}`,
        managerId: 'system-manager',
        targetBrokerId: 'player-broker',
        caseIds: [focusCase.id],
        priority,
        instruction: `重点关注 ${focusCase.title}，当前紧急度 ${focusCase.urgency}`,
      },
      day,
      phase: 'morning',
      entityRefs: [{ id: focusCase.id, kind: 'case' }],
      actorRefs: [
        { id: 'system-manager', role: 'manager' },
        { id: 'player-broker', role: 'player_broker' },
      ],
      visibility: { scope: 'specific_actors', actorIds: ['player-broker', 'system-manager'], baseDelayDays: 0 },
      confidence: 0.85,
      delayDays: 0,
      replayKey: `rk-mm-${runSeed}-${day}-focus`,
      origin: 'ecosystem_tick',
    } as InformationSourceRecord<'manager_message'>);
  }

  // ── 6. ACN NETWORK SIGNAL: competition / cooperation / info share ────
  //    Each day, 1-2 ACN networks emit signals.
  const acnSignalCount = seededInt(`${salt}-an-count`, 1, Math.min(2, input.rivalStores.length));
  for (let i = 0; i < acnSignalCount; i++) {
    const idx = seededInt(`${salt}-an-idx-${i}`, 0, input.rivalStores.length - 1);
    const store = input.rivalStores[idx];
    if (!store) continue;

    const subtypes: readonly string[] = ['competition_escalation', 'info_share_received', 'cooperation_opportunity', 'cross_district_competition'];
    const subtype = seededChoice(`${salt}-an-sub-${i}`, subtypes);
    const acnId = resolveStoreAcnId(store);

    records.push({
      sourceId: `isr-an-${day}-${store.id}-${i}`,
      sourceKind: 'acn_network_signal',
      payload: {
        subtype,
        summary: `${store.name} ACN信号: ${subtype}, 活跃度${store.activityHeat}`,
        sourceAcnId: acnId,
        brokerIds: [`shadow-broker-${store.id}`],
        cooperationScore: seededInt(`${salt}-an-coop-${i}`, 10, 90),
      },
      day,
      phase: seededChoice(`${salt}-an-phase-${i}`, ['morning', 'afternoon'] as const),
      entityRefs: [
        { id: store.id, kind: 'store' },
        { id: acnId, kind: 'acn' },
      ],
      actorRefs: [{ id: `shadow-broker-${store.id}`, role: 'rival_broker' }],
      visibility: { scope: 'all_actors', baseDelayDays: 0 },
      confidence: seededFloat(`${salt}-an-conf-${i}`, 0.5, 0.85),
      delayDays: 0,
      replayKey: `rk-an-${runSeed}-${day}-${store.id}-${i}`,
      origin: 'ecosystem_tick',
    } as InformationSourceRecord<'acn_network_signal'>);
  }

  // ── 7. SUPPORTING FACILITY: school/transit/commercial/neighborhood ───
  //    Each day, 1-2 market cells report facility changes.
  const facilityCount = seededInt(`${salt}-sf-count`, 1, Math.min(2, input.marketCells.length));
  for (let i = 0; i < facilityCount; i++) {
    const idx = seededInt(`${salt}-sf-idx-${i}`, 0, input.marketCells.length - 1);
    const cell = input.marketCells[idx];
    if (!cell) continue;

    const facilityTypes = ['school', 'transit', 'commercial', 'community', 'noise'] as const;
    const facilityType = seededChoice(`${salt}-sf-ft-${i}`, facilityTypes);
    const subtypes: readonly string[] = ['school_district_changed', 'transit_access_changed', 'commercial_development', 'community_environment_shift', 'noise_complaint'];
    const subtype = seededChoice(`${salt}-sf-sub-${i}`, subtypes);
    const before = seededInt(`${salt}-sf-before-${i}`, 40, 70);
    const after = seededInt(`${salt}-sf-after-${i}`, 30, 80);

    records.push({
      sourceId: `isr-sf-${day}-${cell.id}-${i}`,
      sourceKind: 'supporting_facility_signal',
      payload: {
        subtype,
        summary: `${cell.name}配套变化: ${facilityType}, ${before}→${after}`,
        marketCellId: cell.id,
        facilityType,
        before,
        after,
        dataSource: seededChoice(`${salt}-sf-ds-${i}`, ['broker_observation', 'community_report', 'media'] as const),
      },
      day,
      phase: 'morning',
      entityRefs: [{ id: cell.id, kind: 'market_cell' }],
      actorRefs: [{ id: 'system', role: 'system' }],
      visibility: { scope: 'all_actors', baseDelayDays: 1 },
      confidence: seededFloat(`${salt}-sf-conf-${i}`, 0.5, 0.85),
      delayDays: 1,
      replayKey: `rk-sf-${runSeed}-${day}-${cell.id}-${i}`,
      origin: 'ecosystem_tick',
    } as InformationSourceRecord<'supporting_facility_signal'>);
  }

  // ── 8. OWNER LIFE EVENT: financial_need / relocation / health ─────────
  //    Each day, 1-2 owners experience life events.
  const lifeEventCount = seededInt(`${salt}-ol-count`, 1, Math.min(2, input.activeCases.length));
  for (let i = 0; i < lifeEventCount; i++) {
    const idx = seededInt(`${salt}-ol-idx-${i}`, 0, input.activeCases.length - 1);
    const caseItem = input.activeCases[idx];
    if (!caseItem) continue;

    const subtypes: readonly string[] = ['financial_need', 'relocation_planned', 'family_change', 'job_change'];
    const subtype = seededChoice(`${salt}-ol-sub-${i}`, subtypes);

    records.push({
      sourceId: `isr-ol-${day}-${caseItem.id}-${i}`,
      sourceKind: 'owner_life_event_signal',
      payload: {
        subtype,
        summary: `${caseItem.ownerName}生活事件: ${subtype}`,
        ownerId: caseItem.ownerName,
        caseId: caseItem.id,
        urgencyImpact: seededInt(`${salt}-ol-urg-${i}`, -10, 20),
        priceFlexibilityImpact: seededInt(`${salt}-ol-flex-${i}`, -15, 15),
        trustImpact: seededInt(`${salt}-ol-trust-${i}`, -10, 10),
        timelineDays: seededInt(`${salt}-ol-tl-${i}`, 1, 14),
        eventConfidence: seededFloat(`${salt}-ol-conf-${i}`, 0.5, 0.9),
      },
      day,
      phase: 'afternoon',
      entityRefs: [
        { id: caseItem.id, kind: 'case' },
        { id: caseItem.ownerName, kind: 'owner' },
      ],
      actorRefs: [{ id: caseItem.ownerName, role: 'owner' }],
      visibility: { scope: 'owner_only', baseDelayDays: 0 },
      confidence: seededFloat(`${salt}-ol-vis-conf-${i}`, 0.5, 0.85),
      delayDays: 0,
      replayKey: `rk-ol-${runSeed}-${day}-${caseItem.id}-${i}`,
      origin: 'ecosystem_tick',
    } as InformationSourceRecord<'owner_life_event_signal'>);
  }

  // ── 9. BUYER FINANCING: budget / loan / qualification signals ────────
  //    Each day, 1-2 customers report financing changes.
  const financingCount = seededInt(`${salt}-bf-count`, 1, Math.min(2, activeCustomers.length));
  for (let i = 0; i < financingCount; i++) {
    const idx = seededInt(`${salt}-bf-idx-${i}`, 0, activeCustomers.length - 1);
    const customer = activeCustomers[idx];
    if (!customer) continue;

    const subtypes: readonly string[] = ['budget_adjusted', 'loan_pre_approved', 'down_payment_ready', 'family_veto'];
    const subtype = seededChoice(`${salt}-bf-sub-${i}`, subtypes);

    records.push({
      sourceId: `isr-bf-${day}-${customer.customerId}-${i}`,
      sourceKind: 'buyer_financing_signal',
      payload: {
        subtype,
        summary: `客户${customer.customerId}融资: ${subtype}, 流失风险${customer.churnRisk}`,
        customerId: customer.customerId,
        readinessImpact: seededInt(`${salt}-bf-impact-${i}`, -20, 20),
      },
      day,
      phase: 'afternoon',
      entityRefs: [{ id: customer.customerId, kind: 'customer' }],
      actorRefs: [{ id: customer.customerId, role: 'customer' }],
      visibility: { scope: 'player_only', baseDelayDays: 0 },
      confidence: seededFloat(`${salt}-bf-conf-${i}`, 0.5, 0.85),
      delayDays: 0,
      replayKey: `rk-bf-${runSeed}-${day}-${customer.customerId}-${i}`,
      origin: 'ecosystem_tick',
    } as InformationSourceRecord<'buyer_financing_signal'>);
  }

  // ── 10. MICRO MARKET: supply/demand imbalance per cell ────────────────
  //    Each day, 1-2 cells report micro-market shifts.
  const microCount = seededInt(`${salt}-mm-count`, 1, Math.min(2, input.marketCells.length));
  for (let i = 0; i < microCount; i++) {
    const idx = seededInt(`${salt}-mm-idx-${i}`, 0, input.marketCells.length - 1);
    const cell = input.marketCells[idx];
    if (!cell) continue;

    const subtypes: readonly string[] = ['supply_increased', 'demand_shift', 'price_band_squeeze', 'inventory_absorption'];
    const subtype = seededChoice(`${salt}-mm-sub-${i}`, subtypes);
    const supplyDelta = seededInt(`${salt}-mm-sup-${i}`, -10, 15);
    const demandDelta = seededInt(`${salt}-mm-dem-${i}`, -10, 15);

    records.push({
      sourceId: `isr-mm-${day}-${cell.id}-${i}`,
      sourceKind: 'micro_market_signal',
      payload: {
        subtype,
        summary: `${cell.name}微板块: ${subtype}, 供${supplyDelta}/需${demandDelta}`,
        microMarketCellId: cell.id,
        marketCellId: cell.id,
        supplyDelta,
        demandDelta,
        priceBand: `${seededInt(`${salt}-mm-lo-${i}`, 150, 300)}-${seededInt(`${salt}-mm-hi-${i}`, 300, 500)}万`,
        absorptionRate: seededInt(`${salt}-mm-ar-${i}`, 30, 80),
      },
      day,
      phase: 'morning',
      entityRefs: [{ id: cell.id, kind: 'market_cell' }],
      actorRefs: [{ id: 'system', role: 'system' }],
      visibility: { scope: 'all_actors', baseDelayDays: 0 },
      confidence: seededFloat(`${salt}-mm-conf-${i}`, 0.5, 0.85),
      delayDays: 0,
      replayKey: `rk-mm-${runSeed}-${day}-${cell.id}-${i}`,
      origin: 'ecosystem_tick',
    } as InformationSourceRecord<'micro_market_signal'>);
  }

  // ── 11. COMPARABLE TRANSACTION: platform公开 / broker内部 ─────────────
  //    Each day, 1-2 comparable transactions are observed.
  const compCount = seededInt(`${salt}-ct-count`, 1, Math.min(2, activeListings.length));
  for (let i = 0; i < compCount; i++) {
    const idx = seededInt(`${salt}-ct-idx-${i}`, 0, activeListings.length - 1);
    const listing = activeListings[idx];
    if (!listing) continue;

    const discountPct = seededInt(`${salt}-ct-disc-${i}`, 2, 15);
    const price = Math.round(listing.askPrice * (1 - discountPct / 100));

    records.push({
      sourceId: `isr-ct-${day}-${listing.id}-${i}`,
      sourceKind: 'comparable_transaction',
      payload: {
        subtype: 'price_adjusted',
        summary: `${listing.district}可比成交: ${listing.title}, 折扣${discountPct}%`,
        marketCellId: listing.marketCellId,
        district: listing.district,
        layout: listing.segment,
        areaSqm: seededInt(`${salt}-ct-area-${i}`, 60, 150),
        price,
        askPrice: listing.askPrice,
        discountPct,
        listingId: listing.id,
        daysOnMarket: seededInt(`${salt}-ct-dom-${i}`, 5, 90),
        dataSource: seededChoice(`${salt}-ct-ds-${i}`, ['platform公开', 'broker内部', 'acn共享'] as const),
      },
      day,
      phase: 'morning',
      entityRefs: [
        { id: listing.id, kind: 'listing' },
        { id: listing.marketCellId, kind: 'market_cell' },
      ],
      actorRefs: [{ id: 'system', role: 'system' }],
      visibility: { scope: 'all_actors', baseDelayDays: 1 },
      confidence: seededFloat(`${salt}-ct-conf-${i}`, 0.6, 0.9),
      delayDays: 1,
      replayKey: `rk-ct-${runSeed}-${day}-${listing.id}-${i}`,
      origin: 'ecosystem_tick',
    } as InformationSourceRecord<'comparable_transaction'>);
  }

  // ── 12. PLATFORM TRAFFIC: listing viewed / favorited / inquiry ────────
  //    Each day, 1-2 listings get platform traffic signals.
  const trafficCount = seededInt(`${salt}-pt-count`, 1, Math.min(2, activeListings.length));
  for (let i = 0; i < trafficCount; i++) {
    const idx = seededInt(`${salt}-pt-idx-${i}`, 0, activeListings.length - 1);
    const listing = activeListings[idx];
    if (!listing) continue;

    const subtypes: readonly string[] = ['listing_viewed', 'listing_favorited', 'inquiry_received', 'traffic_spike'];
    const subtype = seededChoice(`${salt}-pt-sub-${i}`, subtypes);

    records.push({
      sourceId: `isr-pt-${day}-${listing.id}-${i}`,
      sourceKind: 'platform_traffic',
      payload: {
        subtype,
        summary: `${listing.title}平台流量: ${subtype}`,
        listingId: listing.id,
        marketCellId: listing.marketCellId,
        viewCount: seededInt(`${salt}-pt-views-${i}`, 10, 200),
        favoriteCount: seededInt(`${salt}-pt-fav-${i}`, 0, 20),
        inquiryCount: seededInt(`${salt}-pt-inq-${i}`, 0, 10),
        timeWindow: 'last_24h',
        isDelta: true,
      },
      day,
      phase: 'afternoon',
      entityRefs: [
        { id: listing.id, kind: 'listing' },
        { id: listing.marketCellId, kind: 'market_cell' },
      ],
      actorRefs: [{ id: 'system', role: 'system' }],
      visibility: { scope: 'all_actors', baseDelayDays: 0 },
      confidence: seededFloat(`${salt}-pt-conf-${i}`, 0.6, 0.9),
      delayDays: 0,
      replayKey: `rk-pt-${runSeed}-${day}-${listing.id}-${i}`,
      origin: 'ecosystem_tick',
    } as InformationSourceRecord<'platform_traffic'>);
  }

  return records;
}

/**
 * Generate daily settlement source records for process_receipt.
 *
 * These represent "the day's settlement" — what processes settled.
 * They're derived from phase output (recommendation changes, compaction stats)
 * so they're deterministic and don't require external injection.
 *
 * Note: player_action_receipt is NOT generated here — it only comes from
 * real executeAction calls via actionReceiptWiring.ts. The autonomous tick
 * must not forge player_action_receipt records.
 */
function generateDailySettlementSourceRecords(
  input: BigWorldClockInput,
  day: number,
  runSeed: number,
  allCausalEvents: readonly WorldCausalEvent[],
): readonly InformationSourceRecord[] {
  const records: InformationSourceRecord[] = [];

  // process_receipt: derived from compaction/closure signals this day.
  // Represents "the day's processes settled."
  const ownerPressureEvents = allCausalEvents.filter(
    (e) => e.kind === 'OwnerMarketPressurePerceived' && e.day === day,
  );
  const repriceEvents = allCausalEvents.filter(
    (e) => e.kind === 'RivalListingRepriced' && e.day === day,
  );
  const totalActivity = ownerPressureEvents.length + repriceEvents.length;

  if (totalActivity > 0) {
    const processType = repriceEvents.length > ownerPressureEvents.length
      ? 'negotiation'
      : 'open_day';
    records.push({
      sourceId: `isr-pr-${day}-settlement`,
      sourceKind: 'process_receipt',
      payload: {
        subtype: repriceEvents.length > 0 ? 'negotiation_progressed' : 'open_day_completed',
        summary: `日结: ${totalActivity}项活动 (${ownerPressureEvents.length}业主压力, ${repriceEvents.length}竞品调价)`,
        processType,
        processId: `settlement-${day}`,
        caseIds: ownerPressureEvents.slice(0, 5).map((e) => e.entityIds[0] ?? 'unknown'),
        customerIds: [],
        brokerIds: ['player-broker'],
        outcome: 'day_completed',
        metrics: {
          ownerPressureCount: ownerPressureEvents.length,
          repriceCount: repriceEvents.length,
          totalActivity,
        },
      },
      day,
      phase: 'tick_close',
      entityRefs: ownerPressureEvents.slice(0, 3).map((e) => ({ id: e.entityIds[0] ?? 'unknown', kind: 'case' as const })),
      actorRefs: [{ id: 'player-broker', role: 'player_broker' }],
      visibility: { scope: 'player_only', baseDelayDays: 0 },
      confidence: 0.85,
      delayDays: 0,
      replayKey: `rk-pr-${runSeed}-${day}-settlement`,
      origin: 'daily_settlement',
    } as InformationSourceRecord<'process_receipt'>);
  }

  return records;
}

// ── Causal event trace merge ─────────────────────────────────────────────

/**
 * Merge source traceability from source-ingested events into phase events.
 *
 * Key design: each phase event can collect MULTIPLE source records, not just one.
 * This handles the case where multiple source kinds (e.g., market_signal +
 * supporting_facility_signal) produce the same causal event kind (MarketHeatShifted).
 *
 * The merge stores an array of sourceRecordId values so that ALL contributing
 * sources are traceable, even after compaction.
 */
function mergeCausalEventTraces(
  phaseEvents: readonly WorldCausalEvent[],
  sourceEvents: readonly WorldCausalEvent[],
): WorldCausalEvent[] {
  const result: WorldCausalEvent[] = [...phaseEvents];
  const usedSourceEvents = new Set<number>();

  for (let pi = 0; pi < result.length; pi += 1) {
    const phaseEvt = result[pi];
    const matchedSources: { sourceRecordId: string; sourceReplayKey: string; sourceKind: SourceKind }[] = [];

    // Collect all source events that match this phase event
    for (let si = 0; si < sourceEvents.length; si += 1) {
      if (usedSourceEvents.has(si)) continue;
      const srcEvt = sourceEvents[si];

      // Match by kind + entityIds (first entity is the primary match key)
      if (phaseEvt.kind !== srcEvt.kind) continue;
      if (phaseEvt.entityIds.length > 0 && srcEvt.entityIds.length > 0 &&
          phaseEvt.entityIds[0] !== srcEvt.entityIds[0]) continue;

      const srcRecordId = (srcEvt as any).sourceRecordId;
      const srcReplayKey = (srcEvt as any).sourceReplayKey;
      const srcKind = (srcEvt as any).sourceKind;

      if (srcRecordId) {
        matchedSources.push({
          sourceRecordId: srcRecordId,
          sourceReplayKey: srcReplayKey ?? '',
          sourceKind: srcKind ?? 'market_signal',
        });
      }
      usedSourceEvents.add(si);
    }

    // Apply source traceability to phase event
    if (matchedSources.length > 0) {
      // Primary source (first match) goes into sourceRecordId for backward compat
      // All sources go into sourceRecordIds array for full traceability
      result[pi] = Object.freeze({
        ...phaseEvt,
        sourceRecordId: matchedSources[0].sourceRecordId,
        sourceReplayKey: matchedSources[0].sourceReplayKey,
        sourceKind: matchedSources[0].sourceKind,
        sourceRecordIds: Object.freeze(matchedSources.map((s) => s.sourceRecordId)),
        sourceReplayKeys: Object.freeze(matchedSources.map((s) => s.sourceReplayKey)),
        sourceKinds: Object.freeze([...new Set(matchedSources.map((s) => s.sourceKind))]),
      });
    }
  }

  // Append source-ingested events that didn't match any phase event.
  // These are new causal events generated from additional source records
  // (e.g., supporting_facility_signal, owner_interview, etc.) that don't
  // have a corresponding phase event. They carry their own source traceability.
  // Clean up causeEventIds to only reference events in the result set.
  const resultIds = new Set(result.map((e) => e.id));
  for (let si = 0; si < sourceEvents.length; si += 1) {
    if (!usedSourceEvents.has(si)) {
      const srcEvt = sourceEvents[si];
      // Clean causeEventIds: remove references to source record IDs that aren't in the event set
      const cleanedCauseIds = srcEvt.causeEventIds.filter((cid) => resultIds.has(cid));
      if (cleanedCauseIds.length !== srcEvt.causeEventIds.length) {
        result.push(Object.freeze({
          ...srcEvt,
          causeEventIds: Object.freeze(cleanedCauseIds),
        }));
      } else {
        result.push(srcEvt);
      }
    }
  }

  return result;
}

// ── BigWorldClock ──────────────────────────────────────────────────────

interface BootstrapMarketCell {
  readonly id: string;
  readonly name: string;
  readonly heat: number;
  readonly inventoryPressure: number;
  readonly dealVelocity: number;
}

interface BootstrapListing {
  readonly listingId: string;
  readonly layer: string;
  readonly brokerId?: string;
  readonly acnId?: string;
  readonly marketCellId?: string;
  readonly district?: string;
  readonly layout?: string;
  readonly areaSqm?: number;
  readonly askPrice?: number;
  readonly competitiveness?: number;
  readonly liquidity?: number;
  readonly status?: string;
  readonly daysOnMarket?: number;
}

interface BootstrapBroker {
  readonly brokerId: string;
  readonly acnId?: string;
  readonly visibility?: string;
  readonly name?: string;
  readonly style?: string;
  readonly marketCellIds?: readonly string[];
  readonly energyBudget?: number;
  readonly listingPoolSize?: number;
  readonly customerPoolSize?: number;
  readonly actionBias?: number;
}

interface BootstrapCustomer {
  readonly customerId: string;
  readonly targetMarketCellId?: string;
  readonly visibility?: string;
  readonly urgency?: number;
  readonly priceSensitivity?: number;
  readonly dailyComparisonLimit?: number;
}

interface BootstrapShape {
  readonly hiddenTruth?: {
    readonly marketCells?: readonly BootstrapMarketCell[];
    readonly ownerProfilePriors?: readonly { readonly priorId: string; readonly type: string; readonly priceAnchorRigidity: number; readonly expectedTrustBaseline: number; readonly expectedPatienceBaseline: number; readonly expectedUrgencyBaseline: number; readonly perceptionLagDays: number }[];
    readonly acnProfiles?: readonly { readonly id: string; readonly name: string; readonly behavior: { readonly directAggression: number; readonly customerFollowupStrength: number; readonly priceReactionSpeed: number; readonly infoSpeed: number; readonly cooperationBias: number } }[];
  };
  readonly materializedEntities?: {
    readonly listings?: readonly BootstrapListing[];
    readonly brokers?: readonly BootstrapBroker[];
    readonly customers?: readonly BootstrapCustomer[];
  };
}

/**
 * Run the big world day tick: 8 phases, causal events, summary, compaction.
 *
 * This is the main entry point for the world runtime substrate.
 * It does NOT mutate GameState directly — it returns a receipt.
 * The caller is responsible for applying the receipt to GameState.
 *
 * @param input - Snapshot of relevant GameState fields (read-only)
 * @param existingRuntime - Current BigWorldRuntimeState (may be undefined for old saves)
 * @param existingCausalEvents - Current worldCausalEvents (may be empty for old saves)
 * @returns BigWorldTickReceipt with all phase results, events, summary, and causal events
 */
export function runBigWorldDayTick(
  input: BigWorldClockInput,
  existingRuntime?: BigWorldRuntimeState,
  existingCausalEvents?: readonly WorldCausalEvent[],
): BigWorldTickReceipt {
  const tickStartMs = performance.now();
  const policy = existingRuntime?.compactionPolicy ?? DEFAULT_POLICY;

  // Normalize runtime state (handles old saves)
  const runtime = existingRuntime
    ? normalizeRuntimeState(existingRuntime, policy)
    : createDefaultRuntimeState(policy);

  // Build effective input with fallbacks for timeContext and existingRuntime.
  // Old scripts and old saves may omit these fields; the tick must not crash.
  // timeContext fallback: derive from settledDay deterministically.
  // existingRuntime fallback: use the normalized runtime (from function param or default).
  const effectiveInput: BigWorldClockInput = {
    ...input,
    timeContext: input.timeContext ?? buildTimeContext(input.settledDay),
    existingRuntime: input.existingRuntime ?? runtime,
  };

  const day = effectiveInput.settledDay;

  // Run all 8 phases
  const { phaseResults: basePhaseResults, allDailyEvents, allCausalEvents, totalMutations } = runAllPhases(effectiveInput);

  // Convert phase-generated causal events into source records for traceability.
  // This ensures every causal event carries sourceRecordId/sourceReplayKey/sourceKind.
  const phaseSourceRecords = buildSourceRecordsFromPhaseOutput(allCausalEvents, effectiveInput.runSeed, day);

  // Generate additional source records for 5 new source kinds derived from phase data.
  // These don't have dedicated phases but represent real-world information that
  // should flow through the ingestion pipeline for full 15-kind coverage.
  const additionalSourceRecords = generateAdditionalSourceRecords(effectiveInput, day, effectiveInput.runSeed);

  // Generate market formation source records — time-dependent market dynamics.
  // These represent real daily market activity: new listings, price adjustments,
  // customer attention shifts, rival actions, owner life events, broker capacity,
  // platform traffic, facility changes, micro-market signals.
  // Key: uses day-dependent hashing → genuinely different dynamics each day.
  const marketFormationRecords = generateMarketFormationSourceRecords(effectiveInput, day, effectiveInput.runSeed);

  // Generate daily settlement records for player_action_receipt and process_receipt.
  // These represent "the day's settlement" — what the player's daily activity produced
  // and what processes settled. Completes the 15-kind source coverage.
  const settlementRecords = generateDailySettlementSourceRecords(
    effectiveInput, day, effectiveInput.runSeed, allCausalEvents,
  );

  // Generate economy source records — resource scarcity and competition dynamics.
  // These model how player energy, promotion budget, org credit, customer attention,
  // owner trust, and rival competition drive market behavior. Not random noise.
  const economyReceipt = generateEconomyReceipt(effectiveInput, day, effectiveInput.runSeed);
  const economyRecords = economyReceipt.sourceRecords;

  // Merge phase-derived source records with additional, market formation, settlement, economy, and external source records
  // Note: sourceRecords reads from original input — that's external player/manager data, not runtime-derived.
  const externalSourceRecords = input.sourceRecords ?? [];
  const allSourceRecords: readonly import('../informationSourceTypes.js').InformationSourceRecord[] = [
    ...phaseSourceRecords,
    ...additionalSourceRecords,
    ...marketFormationRecords,
    ...settlementRecords,
    ...economyRecords,
    ...externalSourceRecords,
  ];

  // Ingest all source records through the adapter
  let sourceIngestionReceipt: SourceIngestionReceipt | undefined;
  if (allSourceRecords.length > 0) {
    sourceIngestionReceipt = ingestSourceRecords(allSourceRecords, day, effectiveInput.runSeed);
  }

  // Add SourceIngestionPhase result to phase results
  const sourcePhaseResult: BigWorldTickPhaseResult = {
    phaseId: 'SourceIngestionPhase',
    events: sourceIngestionReceipt?.dailyEvents ?? [],
    entitiesProcessed: sourceIngestionReceipt?.sourcesProcessed ?? 0,
    mutationCount: sourceIngestionReceipt?.sourcesWithEffect ?? 0,
    durationUs: allSourceRecords.length * 5,
  };
  const phaseResults: readonly BigWorldTickPhaseResult[] = [...basePhaseResults, sourcePhaseResult];

  // Use source-ingested causal events as the primary output.
  // These carry sourceRecordId/sourceReplayKey/sourceKind for hard traceability.
  // ALSO include raw phase events because they form the internal causal chain
  // (e.g., CustomerComparedListings references RivalBrokerActionTaken as causeEventId).
  // Source-ingested events carry source traceability; phase events carry causal structure.
  const sourceIngestedCausal = sourceIngestionReceipt?.causalEvents ?? [];

  // Merge source traceability into phase events.
  // If a source-ingested event matches a phase event (same kind + same entityIds),
  // the phase event gets the source traceability fields. Otherwise, the source-ingested
  // event is added as a new entry.
  const allMergedCausalEvents: WorldCausalEvent[] = mergeCausalEventTraces(
    allCausalEvents,
    sourceIngestedCausal,
  );

  // Daily events come from both phases (structural) and source ingestion (traceable)
  const allMergedDailyEvents: readonly BigWorldDailyEvent[] = Object.freeze([
    ...allDailyEvents,
    ...(sourceIngestionReceipt?.dailyEvents ?? []),
  ]);

  // Build summary from merged events
  const summary = buildRuntimeSummary(day, phaseResults, allMergedDailyEvents);

  // Compact world causal events to enforce maxTotal bound
  const existingEvents = existingCausalEvents ?? [];
  const compactedCausalEvents = compactWorldCausalEvents(
    [...existingEvents, ...allMergedCausalEvents],
    policy.maxTotalCausalEvents,
  );

  // The events to append (only the new ones, not the compacted existing)
  const causalEventsToAppend = allMergedCausalEvents;

  const tickDurationUs = Math.round((performance.now() - tickStartMs) * 1000);

  // Compute sourceRecordAudit from ALL merged source records
  const auditByKind: Record<string, number> = {};
  for (const record of allSourceRecords) {
    auditByKind[record.sourceKind] = (auditByKind[record.sourceKind] ?? 0) + 1;
  }
  const sourceRecordAudit = {
    totalCount: allSourceRecords.length,
    bySourceKind: auditByKind,
    sourceKinds: Object.keys(auditByKind).sort(),
  };

  return Object.freeze({
    day,
    nextDay: day + 1,
    phaseResults: Object.freeze(phaseResults),
    allEvents: allMergedDailyEvents,
    summary,
    causalEventsToAppend: Object.freeze(causalEventsToAppend),
    sourceIngestionReceipt,
    economyReceipt,
    externalSourceRecords: Object.freeze([...externalSourceRecords]),
    sourceRecordAudit,
    durationUs: tickDurationUs,
  });
}

/**
 * Extract ActionResourceReceipt entries from a BigWorldTickReceipt.
 *
 * Reads from the ORIGINAL source records (not causal event payloads)
 * because the ingestion adapter transforms player_action_receipt payloads
 * into BrokerRecommendationChanged payloads, losing actionId/costEnergy/fieldDeltas.
 *
 * Source records carry the full action details; causal events carry sourceRecordId linkage.
 */
function extractActionResourceReceipts(
  receipt: BigWorldTickReceipt,
): import('./types.js').ActionResourceReceipt[] {
  const results: import('./types.js').ActionResourceReceipt[] = [];
  const day = receipt.day;

  // Read from original source records, not causal event payloads
  const sourceRecords = receipt.externalSourceRecords ?? [];
  for (const record of sourceRecords) {
    if (record.sourceKind !== 'player_action_receipt') continue;
    if (!record.sourceId.startsWith('isr-par-')) continue;

    const payload = record.payload as unknown as Record<string, unknown>;
    const actionId = String(payload['actionId'] ?? 'unknown');
    const caseId = String(payload['caseId'] ?? record.entityRefs[0]?.id ?? 'unknown');
    const costEnergy = Number(payload['costEnergy'] ?? 0);
    const costPromotionBudget = Number(payload['costPromotionBudget'] ?? 0);
    const rawFieldDeltas = Array.isArray(payload['fieldDeltas']) ? payload['fieldDeltas'] : [];

    let trustDelta = 0;
    let patienceDelta = 0;
    for (const fd of rawFieldDeltas) {
      const fdr = fd as Record<string, unknown>;
      const field = String(fdr['field'] ?? '');
      const from = Number(fdr['from'] ?? 0);
      const to = Number(fdr['to'] ?? 0);
      if (field === 'trust') trustDelta += to - from;
      if (field === 'patience') patienceDelta += to - from;
    }

    if (costEnergy > 0 || costPromotionBudget > 0 || trustDelta !== 0 || patienceDelta !== 0) {
      results.push({
        day,
        actionId,
        caseId,
        energyCost: costEnergy,
        budgetCost: costPromotionBudget,
        trustDelta,
        patienceDelta,
        sourceRecordId: record.sourceId,
        replayKey: `rk-arr-${day}-${actionId}-${caseId}`,
      });
    }
  }

  return results;
}

/**
 * Apply a BigWorldTickReceipt to BigWorldRuntimeState.
 * Mutates runtime state in place (caller owns the state).
 * Returns the updated runtime state.
 */
export function applyTickReceiptToRuntime(
  runtime: BigWorldRuntimeState,
  receipt: BigWorldTickReceipt,
): BigWorldRuntimeState {
  const target = Object.isFrozen(runtime)
    ? {
        ...runtime,
        dailyEvents: [...runtime.dailyEvents],
        dailySummaries: [...runtime.dailySummaries],
        coldLedgerSummaries: [...runtime.coldLedgerSummaries],
        economicResourceLedger: [...runtime.economicResourceLedger],
        actionResourceReceipts: [...runtime.actionResourceReceipts],
        recentErrors: [...runtime.recentErrors],
        worldGraphSummary: runtime.worldGraphSummary,
      }
    : runtime;
  // Prepend new daily events (newest first)
  const mergedEvents = [...receipt.allEvents, ...target.dailyEvents];
  // Prepend new summary
  const mergedSummaries = [receipt.summary, ...target.dailySummaries];

  // Build cold ledger summary from this tick
  const coldSummary = buildColdLedgerSummary(
    receipt.day,
    receipt.day,
    receipt.phaseResults,
    receipt.sourceIngestionReceipt,
  );
  const mergedColdSummaries = [coldSummary, ...target.coldLedgerSummaries];

  // Accumulate economy receipt snapshot into economic resource ledger
  const snapshot = receipt.economyReceipt?.snapshot;
  const ledgerEntry = snapshot
    ? {
        day: snapshot.day,
        playerEnergyConsumed: snapshot.playerEnergyConsumed,
        playerEnergyReplenished: snapshot.playerEnergyReplenished,
        promotionBudgetConsumed: snapshot.promotionBudgetConsumed,
        promotionBudgetAllocated: snapshot.promotionBudgetAllocated,
        orgCreditEarned: snapshot.orgCreditEarned,
        orgCreditSpent: snapshot.orgCreditSpent,
        customerAttentionGained: snapshot.customerAttentionGained,
        customerAttentionLost: snapshot.customerAttentionLost,
        customerAttentionMigrated: snapshot.customerAttentionMigrated,
        ownerTrustNet: snapshot.ownerTrustNet,
        ownerPatienceNet: snapshot.ownerPatienceNet,
        rivalActionsToday: snapshot.rivalActionsToday,
        rivalResourceCompeted: snapshot.rivalResourceCompeted,
        replayKey: receipt.economyReceipt!.replayKey,
      }
    : undefined;
  const mergedLedger = ledgerEntry
    ? [ledgerEntry, ...target.economicResourceLedger].slice(0, 90)
    : target.economicResourceLedger;

  // Extract action resource receipts from player_action_receipt source records
  const actionReceipts = extractActionResourceReceipts(receipt);
  const mergedActionReceipts = actionReceipts.length > 0
    ? [...actionReceipts, ...target.actionResourceReceipts].slice(0, 500)
    : target.actionResourceReceipts;

  // Update mutable fields
  target.lastTickDay = receipt.day;
  target.dailyEvents = mergedEvents;
  target.dailySummaries = mergedSummaries;
  target.coldLedgerSummaries = mergedColdSummaries;
  target.economicResourceLedger = mergedLedger;
  target.actionResourceReceipts = mergedActionReceipts;
  target.totalEventsEmitted += receipt.allEvents.length;
  target.totalMutationsEmitted += receipt.summary.totalMutations;
  target.tickCount += 1;

  if (receipt.summary.hadErrors) {
    target.recentErrors = [
      ...receipt.summary.errors,
      ...target.recentErrors,
    ].slice(0, 20);
  }

  // Run compaction pass to enforce bounds
  const compacted = runCompactionPass(target);

  // Copy compacted arrays back (runtime is mutable)
  target.dailyEvents = compacted.dailyEvents as BigWorldDailyEvent[];
  target.dailySummaries = compacted.dailySummaries as BigWorldRuntimeSummary[];
  target.coldLedgerSummaries = compacted.coldLedgerSummaries as ColdLedgerSummary[];
  target.recentErrors = compacted.recentErrors as string[];

  return target;
}

/**
 * Build a BigWorldClockInput from GameState.
 * Pure adapter — reads GameState fields and maps to clock input shape.
 * Also extracts shadow entity data from bootstrap for hundreds-scale runtime.
 */
export function buildClockInputFromGameState(
  state: {
    readonly day: number;
    readonly runContext: { readonly runSeed: number; readonly bigWorldBootstrap?: BootstrapShape };
    readonly markets: readonly { readonly id: string; readonly name: string; readonly demandHeat: number; readonly supplyPressure: number; readonly competitivePressure: number; readonly sentiment: number }[];
    readonly cases: readonly { readonly id: string; readonly title: string; readonly status: string; readonly district: string; readonly marketCellId: string; readonly trust: number; readonly patience: number; readonly urgency: number; readonly heat: number; readonly competitiveness: number; readonly d1: number; readonly d3: number; readonly ownerName: string; readonly windowDays: number; readonly personality: string }[];
    readonly opportunities: readonly { readonly id: string; readonly caseId: string; readonly customerId: string; readonly customerName: string; readonly fit: number; readonly intent: number; readonly confidence: number; readonly stageIndex: number; readonly status: string; readonly stagnationTicks: number }[];
    readonly marketShadow: { readonly rivalListings: readonly { readonly id: string; readonly storeId: string; readonly title: string; readonly district: string; readonly marketCellId: string; readonly segment: string; readonly askPrice: number; readonly heat: number; readonly freshness: number; readonly status: string; readonly daysLeft: number }[]; readonly rivalStores: readonly { readonly id: string; readonly name: string; readonly type: string; readonly style: string; readonly districtFocus: readonly string[]; readonly leadCapturePower: number; readonly sellerInfluencePower: number; readonly pricingPressurePower: number; readonly activityHeat: number }[] };
    readonly customerStates: readonly { readonly customerId: string; readonly status: string; readonly fatigue: number; readonly churnRisk: number; readonly activeCaseIds: readonly string[] }[];
    readonly pendingSourceRecords?: readonly InformationSourceRecord[];
    readonly bigWorldRuntime?: BigWorldRuntimeState;
    readonly runtimeBrokerOwnerRelations?: readonly { readonly relationId: string; readonly brokerId: string; readonly ownerId: string; readonly trust: number }[];
    readonly runtimeOwnerCaseReadinessStates?: readonly { readonly relationId: string; readonly ownerId: string; readonly assetCaseId: string; readonly patience: number; readonly urgency: number }[];
  },
): BigWorldClockInput {
  const bootstrap = state.runContext.bigWorldBootstrap;
  const marketCells = mapBootstrapMarkets(state.markets, bootstrap);
  const rivalListings = mapBootstrapRivalListings(state.marketShadow.rivalListings, bootstrap);
  const rivalStores = mapBootstrapRivalStores(state.marketShadow.rivalStores, bootstrap);
  const customerStates = mapBootstrapCustomerStates(state.customerStates, bootstrap);

  // Extract shadow owner priors from bootstrap
  const shadowOwnerPriors = bootstrap?.hiddenTruth?.ownerProfilePriors;

  // Extract ACN profiles from bootstrap
  const acnProfiles = bootstrap?.hiddenTruth?.acnProfiles;
  const timeContext = buildTimeContext(state.day);

  // Build shadow cases from owner priors + market cells
  // These allow the runtime to process 50+ owners per day
  const shadowCases = buildShadowCases(
    {
      day: state.day,
      runContext: state.runContext,
      markets: marketCells,
    },
    shadowOwnerPriors,
  );

  // Build case relation snapshots from canonical runtime sources
  const relations = state.runtimeBrokerOwnerRelations;
  const readinessStates = state.runtimeOwnerCaseReadinessStates;
  const activeCases = state.cases.filter((c) => c.status === 'active');
  const caseRelationSnapshots = (relations?.length || readinessStates?.length)
    ? activeCases.map((c) => {
        const ownerId = `owner:${c.id}`;
        const assetCaseId = `case:${c.id}`;
        const trustRel = relations?.find((r) => r.ownerId === ownerId);
        const readiness = readinessStates?.find((r) => r.assetCaseId === assetCaseId);
        return {
          caseId: c.id,
          trustValue: trustRel?.trust ?? c.trust,
          trustSource: (trustRel ? 'canonical_relation' : 'legacy_case_mirror') as 'canonical_relation' | 'legacy_case_mirror',
          patienceValue: readiness?.patience ?? c.patience,
          urgencyValue: readiness?.urgency ?? c.urgency,
          readinessSource: (readiness ? 'canonical_relation' : 'legacy_case_mirror') as 'canonical_relation' | 'legacy_case_mirror',
        };
      })
    : undefined;

  return {
    settledDay: state.day,
    runSeed: state.runContext.runSeed,
    timeContext,
    marketCells,
    activeCases: state.cases.filter((c) => c.status === 'active'),
    activeOpportunities: state.opportunities.filter((o) => o.status === 'active'),
    rivalListings,
    rivalStores,
    customerStates: sampleActiveCohort(
      customerStates,
      state.cases.filter((c) => c.status === 'active'),
      marketCells,
      state.day,
      state.runContext.runSeed,
    ),
    shadowOwnerPriors,
    shadowCases,
    acnProfiles,
    existingRuntime: state.bigWorldRuntime,
    sourceRecords: (state.pendingSourceRecords ?? []).slice(0, 200),
    caseRelationSnapshots,
  };
}

/**
 * Active cohort scheduler — sample customers for the daily tick.
 *
 * Five-X runtime cannot brute-force all 24,000 customers. This function:
 * 1. Includes all player-visible customers (linked to active cases)
 * 2. Samples hot-cell customers at higher rate
 * 3. Aggregates cold-cell customers into a smaller cohort
 * 4. Caps total at a deterministic limit per day
 *
 * Deterministic: same inputs → same output.
 */
function sampleActiveCohort(
  allCustomers: BigWorldClockInput['customerStates'],
  activeCases: readonly { readonly id: string; readonly marketCellId: string }[],
  marketCells: readonly { readonly id: string; readonly demandHeat: number }[],
  day: number,
  runSeed: number,
): BigWorldClockInput['customerStates'] {
  // If small enough, include all
  if (allCustomers.length <= 500) return allCustomers;

  // Step 1: Identify hot cells (heat > 60 or has player case)
  const playerCellIds = new Set(activeCases.map((c) => c.marketCellId));
  const hotCellIds = new Set<string>();
  for (const cell of marketCells) {
    if (cell.demandHeat > 60 || playerCellIds.has(cell.id)) {
      hotCellIds.add(cell.id);
    }
  }

  // Step 2: Classify customers by cell heat
  // Note: customerStates don't have marketCellId directly, but activeCaseIds link to cases
  const playerLinked = new Set<string>();
  const hotCellCustomers: BigWorldClockInput['customerStates'][number][] = [];
  const coldCellCustomers: BigWorldClockInput['customerStates'][number][] = [];

  for (const customer of allCustomers) {
    // Is this customer linked to a player case?
    const isPlayerLinked = customer.activeCaseIds.some((caseId) =>
      activeCases.some((c) => c.id === caseId),
    );
    if (isPlayerLinked) {
      playerLinked.add(customer.customerId);
      continue; // Always included, skip from sampling
    }

    // Check if any of their active cases map to hot cells
    // Since we don't have case→cell mapping here, use a deterministic heuristic
    // All non-player customers go through the hot/cold classification
    // (no 30% sampling — every customer has a chance to be ticked)
    const hash = stableHash(`${runSeed}-day-${day}-cohort-${customer.customerId}`);
    if (hash % 100 < 50) {
      // 50% deterministic split for balanced hot/cold distribution
      hotCellCustomers.push(customer);
    } else {
      coldCellCustomers.push(customer);
    }
  }

  // Step 3: Deterministic sampling
  const salt = `cohort-${runSeed}-${day}`;
  const maxHotSample = Math.min(hotCellCustomers.length, 200);
  const maxColdSample = Math.min(coldCellCustomers.length, 100);

  // Deterministic shuffle using stableHash
  const hotSample = hotCellCustomers
    .map((c) => ({ customer: c, hash: stableHash(`${salt}-hot-${c.customerId}`) }))
    .sort((a, b) => a.hash - b.hash)
    .slice(0, maxHotSample)
    .map((x) => x.customer);

  const coldSample = coldCellCustomers
    .map((c) => ({ customer: c, hash: stableHash(`${salt}-cold-${c.customerId}`) }))
    .sort((a, b) => a.hash - b.hash)
    .slice(0, maxColdSample)
    .map((x) => x.customer);

  // Step 4: Merge: player-linked (all) + hot sample + cold sample
  const playerCustomers = allCustomers.filter((c) => playerLinked.has(c.customerId));
  const result: BigWorldClockInput['customerStates'] = [...playerCustomers, ...hotSample, ...coldSample];

  return result;
}

/**
 * Build shadow cases from owner priors + market cells.
 * Each shadow case represents an owner's market position that the runtime
 * can process for pressure perception, recommendation, etc.
 * These are synthetic but deterministic — same input → same output.
 */
function buildShadowCases(
  state: {
    readonly day: number;
    readonly runContext: { readonly runSeed: number };
    readonly markets: readonly { readonly id: string; readonly name: string }[];
  },
  shadowOwnerPriors?: readonly { readonly priorId: string; readonly type: string; readonly priceAnchorRigidity: number; readonly expectedTrustBaseline: number; readonly expectedPatienceBaseline: number; readonly expectedUrgencyBaseline: number; readonly perceptionLagDays: number }[],
): readonly { readonly id: string; readonly marketCellId: string; readonly district: string; readonly heat: number; readonly trust: number; readonly patience: number; readonly urgency: number; readonly windowDays: number; readonly ownerName: string }[] {
  if (!shadowOwnerPriors || shadowOwnerPriors.length === 0) return [];

  // Deterministic hash for shadow case generation
  const stableHash = (input: string): number => {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  };

  const seededInt = (seed: string, min: number, max: number): number =>
    min + (stableHash(seed) % (max - min + 1));

  const cells = state.markets;
  const cases: { id: string; marketCellId: string; district: string; heat: number; trust: number; patience: number; urgency: number; windowDays: number; ownerName: string }[] = [];

  for (let i = 0; i < shadowOwnerPriors.length; i += 1) {
    const prior = shadowOwnerPriors[i];
    const salt = `shadow-case-${state.runContext.runSeed}-${state.day}-${i}`;
    const cell = cells[i % cells.length];

    cases.push({
      id: `shadow-case-${prior.priorId}`,
      marketCellId: cell.id,
      district: cell.name,
      heat: seededInt(`${salt}-heat`, 20, 80),
      trust: prior.expectedTrustBaseline,
      patience: prior.expectedPatienceBaseline,
      urgency: prior.expectedUrgencyBaseline,
      windowDays: seededInt(`${salt}-window`, 7, 30),
      ownerName: `shadow-owner-${prior.priorId}`,
    });
  }

  return cases;
}

function mapBootstrapMarkets(
  stateMarkets: readonly { readonly id: string; readonly name: string; readonly demandHeat: number; readonly supplyPressure: number; readonly competitivePressure: number; readonly sentiment: number }[],
  bootstrap?: BootstrapShape,
): BigWorldClockInput['marketCells'] {
  const cells = bootstrap?.hiddenTruth?.marketCells ?? [];
  if (cells.length === 0) return stateMarkets;

  return cells.map((cell) => ({
    id: cell.id,
    name: cell.name,
    demandHeat: cell.heat,
    supplyPressure: cell.inventoryPressure,
    competitivePressure: Math.max(0, Math.min(100, 100 - cell.dealVelocity + Math.round(cell.inventoryPressure * 0.25))),
    sentiment: Math.max(0, Math.min(100, Math.round((cell.heat + cell.dealVelocity) / 2))),
  }));
}

function mapBootstrapRivalListings(
  fallback: BigWorldClockInput['rivalListings'],
  bootstrap?: BootstrapShape,
): BigWorldClockInput['rivalListings'] {
  const listings = bootstrap?.materializedEntities?.listings ?? [];
  const mapped = listings
    .filter((listing) => listing.layer === 'direct_rival' || listing.layer === 'shadow')
    .map((listing, index) => ({
      id: listing.listingId,
      storeId: listing.brokerId ?? listing.acnId ?? `bootstrap-store-${index % 3}`,
      title: `${listing.district ?? '大世界'} ${listing.layer === 'shadow' ? '影子盘' : '竞品盘'} ${index + 1}`,
      district: listing.district ?? '',
      marketCellId: listing.marketCellId ?? '',
      segment: listing.layout ?? listing.layer,
      askPrice: Number(listing.askPrice) || 0,
      heat: Math.max(0, Math.min(100, Math.round(((listing.competitiveness ?? 50) + (listing.liquidity ?? 50)) / 2))),
      freshness: Math.max(0, Math.min(100, 100 - (Number(listing.daysOnMarket) || 0))),
      status: listing.status === 'sold' || listing.status === 'withdrawn' ? listing.status : 'active',
      daysLeft: Math.max(1, 30 - (Number(listing.daysOnMarket) || 0)),
    }));
  return mapped.length > fallback.length ? mapped : fallback;
}

function mapBootstrapRivalStores(
  fallback: BigWorldClockInput['rivalStores'],
  bootstrap?: BootstrapShape,
): BigWorldClockInput['rivalStores'] {
  const brokers = bootstrap?.materializedEntities?.brokers ?? [];
  const mapped = brokers
    .filter((broker) => broker.brokerId !== 'player-broker')
    .map((broker) => ({
      id: broker.brokerId,
      name: broker.name ?? broker.brokerId,
      type: broker.visibility === 'named' ? 'same_company' : 'external_company',
      style: broker.style ?? 'steady',
      districtFocus: broker.marketCellIds ?? [],
      leadCapturePower: Math.max(0, Math.min(100, (broker.customerPoolSize ?? 4) * 10)),
      sellerInfluencePower: Math.max(0, Math.min(100, (broker.listingPoolSize ?? 3) * 10)),
      pricingPressurePower: Math.max(0, Math.min(100, 50 + (broker.actionBias ?? 0))),
      activityHeat: Math.max(0, Math.min(100, broker.energyBudget ?? 50)),
      acnId: broker.acnId,
      brandId: deriveBrandId(broker.acnId),
    }));
  return mapped.length > fallback.length ? mapped : fallback;
}

function mapBootstrapCustomerStates(
  fallback: BigWorldClockInput['customerStates'],
  bootstrap?: BootstrapShape,
): BigWorldClockInput['customerStates'] {
  const customers = bootstrap?.materializedEntities?.customers ?? [];
  const listings = bootstrap?.materializedEntities?.listings ?? [];
  if (customers.length === 0 || listings.length === 0) return fallback;

  const listingsByCell = new Map<string, string[]>();
  for (const listing of listings) {
    if (!listing.marketCellId) continue;
    const bucket = listingsByCell.get(listing.marketCellId) ?? [];
    bucket.push(listing.listingId);
    listingsByCell.set(listing.marketCellId, bucket);
  }

  const mapped = customers
    .filter((customer) => customer.visibility !== 'churned')
    .map((customer, index) => {
      const sameCellListings = customer.targetMarketCellId
        ? listingsByCell.get(customer.targetMarketCellId) ?? []
        : [];
      const allListingIds = listings.map((listing) => listing.listingId);
      const activeCaseIds = (sameCellListings.length >= 2 ? sameCellListings : allListingIds)
        .slice(index % 3, (index % 3) + Math.max(2, customer.dailyComparisonLimit ?? 4));
      return {
        customerId: customer.customerId,
        status: 'active',
        fatigue: Math.max(0, Math.min(100, 100 - (customer.urgency ?? 50))),
        churnRisk: Math.max(0, Math.min(100, customer.priceSensitivity ?? 50)),
        activeCaseIds: activeCaseIds.length >= 2 ? activeCaseIds : allListingIds.slice(0, 3),
      };
    });

  return mapped.length > fallback.length ? mapped : fallback;
}
