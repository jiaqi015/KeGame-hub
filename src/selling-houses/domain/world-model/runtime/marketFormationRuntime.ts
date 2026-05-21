/**
 * MarketFormationRuntime — generates time-dependent market dynamics source records.
 *
 * These source records represent real-world market changes that accumulate
 * over 30/60/90 days. Unlike the static `generateAdditionalSourceRecords`
 * which derives from current-day input snapshot, this module tracks
 * cumulative market state to produce genuinely different dynamics each day.
 *
 * All records are deterministic: same seed + same day → same records.
 * No Date.now / Math.random / fetch / LLM provider.
 *
 * Mother model alignment:
 *   - Section 10: Competition is environment
 *   - Section 13: Causal Transmission
 *   - Section 6: Owner perceives through lagged signals
 *   - Section 7: Customer compares and shifts attention
 *   - Section 8: Broker interprets and recommends
 *
 * Hard constraints:
 *   - No case.status mutation
 *   - No closedDeals mutation
 *   - No hidden GlobalTruth leakage to broker POV
 *   - All events are deterministic
 */

import type {
  InformationSourceRecord,
  SourceKind,
  EntityRef,
  ActorRef,
} from '../informationSourceTypes.js';

import type {
  BigWorldClockInput,
} from './types.js';

// ── Deterministic RNG (same algorithm as phases.ts / clock.ts) ─────────

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

// ── Market Formation Source Records ────────────────────────────────────

/**
 * Generate market formation source records that represent real daily dynamics.
 *
 * These are SEPARATE from the phase pipeline and the existing `generateAdditionalSourceRecords`.
 * They represent ongoing market activity that happens every day:
 *   - New listings appear
 *   - Prices drift based on market conditions
 *   - Customers shift attention
 *   - Owners react to market signals
 *   - Brokers adjust strategy
 *   - Organizations allocate resources
 *
 * Key difference from `generateAdditionalSourceRecords`:
 *   - Uses `day` as part of hash → different values each day
 *   - Uses entity count ratios → scales with world size
 *   - Tracks cumulative patterns → creates genuine market dynamics
 */
export function generateMarketFormationSourceRecords(
  input: BigWorldClockInput,
  day: number,
  runSeed: number,
): readonly InformationSourceRecord[] {
  const records: InformationSourceRecord[] = [];
  const salt = `mf-${runSeed}-${day}`;

  // ── 1. Supply Dynamics: new listings / price adjustments / withdrawals ──
  //    Market cell heat drives supply behavior
  for (let i = 0; i < input.marketCells.length; i += 1) {
    const cell = input.marketCells[i];
    const cellSalt = `${salt}-supply-${cell.id}`;

    // Heat trend: high heat → more listings, low heat → withdrawals
    const heatTrend = cell.demandHeat - 50;
    const supplyAction = seededChoice(`${cellSalt}-action`, [
      'new_listing', 'price_adjusted', 'listing_withdrawn', 'relist',
    ] as const);

    if (supplyAction === 'new_listing' && heatTrend > -20) {
      // New listing appears when market is warm
      records.push({
        sourceId: `isr-mf-new-${day}-${cell.id}`,
        sourceKind: 'comparable_transaction',
        payload: {
          subtype: 'price_adjusted',
          summary: `${cell.name}新增挂牌: 板块热度${cell.demandHeat}`,
          marketCellId: cell.id,
          district: cell.name,
          layout: seededChoice(`${cellSalt}-layout`, ['两室一厅', '三室两厅', '一室一厅']),
          areaSqm: seededInt(`${cellSalt}-area`, 60, 120),
          price: Math.round(cell.demandHeat * seededFloat(`${cellSalt}-price`, 3, 8)),
          askPrice: Math.round(cell.demandHeat * seededFloat(`${cellSalt}-ask`, 3.5, 9)),
          discountPct: 0,
          daysOnMarket: 0,
          dataSource: 'platform公开',
        },
        day,
        phase: 'morning',
        entityRefs: [{ id: cell.id, kind: 'market_cell' }],
        actorRefs: [{ id: 'system', role: 'system' }],
        visibility: { scope: 'all_actors', baseDelayDays: 1 },
        confidence: 0.75,
        delayDays: 1,
        replayKey: `rk-mf-new-${runSeed}-${day}-${cell.id}`,
        origin: 'ecosystem_tick',
      } as InformationSourceRecord<'comparable_transaction'>);
    }

    if (supplyAction === 'price_adjusted') {
      // Price adjustment based on market pressure
      const pressure = cell.competitivePressure;
      const discountDirection = pressure > 60 ? -1 : pressure < 30 ? 1 : 0;
      if (discountDirection !== 0) {
        records.push({
          sourceId: `isr-mf-price-${day}-${cell.id}`,
          sourceKind: 'market_signal',
          payload: {
            subtype: 'price_trend',
            summary: `${cell.name}价格趋势: 竞争压力${cell.competitivePressure}, ${discountDirection > 0 ? '上涨' : '下调'}信号`,
            marketCellId: cell.id,
            before: Math.round(cell.demandHeat * 5),
            after: Math.round(cell.demandHeat * 5 + discountDirection * seededInt(`${cellSalt}-delta`, 2, 8)),
            unit: 'heat_index',
            isPublic: true,
          },
          day,
          phase: 'morning',
          entityRefs: [{ id: cell.id, kind: 'market_cell' }],
          actorRefs: [{ id: 'system', role: 'system' }],
          visibility: { scope: 'all_actors', baseDelayDays: 0 },
          confidence: 0.7,
          delayDays: 0,
          replayKey: `rk-mf-price-${runSeed}-${day}-${cell.id}`,
          origin: 'ecosystem_tick',
        } as InformationSourceRecord<'market_signal'>);
      }
    }
  }

  // ── 2. Demand Dynamics: customer attention shifts / budget changes ──────
  const activeCustomers = input.customerStates.filter(
    (c) => c.status !== 'lost' && c.status !== 'converted',
  );
  const demandCount = Math.min(3, activeCustomers.length);
  for (let i = 0; i < demandCount; i += 1) {
    const idx = seededInt(`${salt}-dem-idx-${i}`, 0, activeCustomers.length - 1);
    const customer = activeCustomers[idx];
    if (!customer) continue;

    const customerSalt = `${salt}-dem-${customer.customerId}`;
    const action = seededChoice(`${customerSalt}-action`, [
      'attention_shift', 'budget_change', 'fatigue_signal', 'comparison',
    ] as const);

    if (action === 'attention_shift' && customer.activeCaseIds.length >= 2) {
      const fromIdx = seededInt(`${customerSalt}-from`, 0, customer.activeCaseIds.length - 1);
      const toIdx = (fromIdx + 1) % customer.activeCaseIds.length;
      records.push({
        sourceId: `isr-mf-shift-${day}-${customer.customerId}-${i}`,
        sourceKind: 'customer_interaction',
        payload: {
          subtype: 'preference_shifted',
          summary: `客户${customer.customerId}注意力转移: 从${customer.activeCaseIds[fromIdx]}转向${customer.activeCaseIds[toIdx]}`,
          customerId: customer.customerId,
          listingId: customer.activeCaseIds[toIdx],
          observationMode: 'observed',
        },
        day,
        phase: 'afternoon',
        entityRefs: [
          { id: customer.customerId, kind: 'customer' },
          ...(customer.activeCaseIds[toIdx] ? [{ id: customer.activeCaseIds[toIdx], kind: 'listing' as const }] : []),
        ],
        actorRefs: [{ id: customer.customerId, role: 'customer' }],
        visibility: { scope: 'player_only', baseDelayDays: 0 },
        confidence: 0.7,
        delayDays: 0,
        replayKey: `rk-mf-shift-${runSeed}-${day}-${customer.customerId}-${i}`,
        origin: 'ecosystem_tick',
      } as InformationSourceRecord<'customer_interaction'>);
    }

    if (action === 'budget_change') {
      records.push({
        sourceId: `isr-mf-budget-${day}-${customer.customerId}-${i}`,
        sourceKind: 'buyer_financing_signal',
        payload: {
          subtype: seededChoice(`${customerSalt}-fin`, ['budget_adjusted', 'down_payment_ready'] as const),
          summary: `客户${customer.customerId}预算变化: 流失风险${customer.churnRisk}`,
          customerId: customer.customerId,
          readinessImpact: seededInt(`${customerSalt}-impact`, -15, 15),
        },
        day,
        phase: 'afternoon',
        entityRefs: [{ id: customer.customerId, kind: 'customer' }],
        actorRefs: [{ id: customer.customerId, role: 'customer' }],
        visibility: { scope: 'player_only', baseDelayDays: 0 },
        confidence: 0.65,
        delayDays: 0,
        replayKey: `rk-mf-budget-${runSeed}-${day}-${customer.customerId}-${i}`,
        origin: 'ecosystem_tick',
      } as InformationSourceRecord<'buyer_financing_signal'>);
    }
  }

  // ── 3. Rival Dynamics: rival broker actions / ACN competition ───────────
  const rivalStoresWithListings = input.rivalStores.filter((store) =>
    input.rivalListings.some((listing) => listing.storeId === store.id && listing.status === 'active'),
  );
  const rivalStorePool = rivalStoresWithListings.length > 0 ? rivalStoresWithListings : input.rivalStores;
  const rivalCount = Math.min(2, rivalStorePool.length);
  for (let i = 0; i < rivalCount; i += 1) {
    const idx = seededInt(`${salt}-rival-idx-${i}`, 0, rivalStorePool.length - 1);
    const store = rivalStorePool[idx];
    if (!store) continue;

    const rivalSalt = `${salt}-rival-${store.id}-${i}`;
    const action = seededChoice(`${rivalSalt}-action`, [
      'reprice', 'customer_followed', 'push_listing', 'open_day_held',
    ] as const);

    // Rival broker action
    const storeListings = input.rivalListings.filter(
      (l) => l.storeId === store.id && l.status === 'active',
    );
    const targetListing = storeListings.length > 0
      ? storeListings[seededInt(`${rivalSalt}-target`, 0, storeListings.length - 1)]
      : undefined;

    records.push({
      sourceId: `isr-mf-rival-${day}-${store.id}-${i}`,
      sourceKind: 'rival_action',
      payload: {
        subtype: action,
        summary: `${store.name}${action}: 活跃度${store.activityHeat}`,
        rivalBrokerId: `shadow-broker-${store.id}`,
        rivalAcnId: store.acnId ?? `acn-${store.type}`,
        listingId: targetListing?.id,
        priceBefore: targetListing?.askPrice,
        priceAfter: targetListing ? Math.max(100, targetListing.askPrice + seededInt(`${rivalSalt}-delta`, -10, 5)) : undefined,
        marketCellId: targetListing?.marketCellId,
        evidenceStrength: 'direct' as const,
      },
      day,
      phase: seededChoice(`${rivalSalt}-phase`, ['morning', 'afternoon'] as const),
      entityRefs: [
        { id: store.id, kind: 'store' },
        ...(targetListing ? [{ id: targetListing.id, kind: 'listing' as const }] : []),
        ...(targetListing?.marketCellId ? [{ id: targetListing.marketCellId, kind: 'market_cell' as const }] : []),
      ],
      actorRefs: [{ id: `shadow-broker-${store.id}`, role: 'rival_broker' }],
      visibility: { scope: 'all_actors', baseDelayDays: 0 },
      confidence: seededFloat(`${rivalSalt}-conf`, 0.6, 0.9),
      delayDays: 0,
      replayKey: `rk-mf-rival-${runSeed}-${day}-${store.id}-${i}`,
      origin: 'ecosystem_tick',
    } as InformationSourceRecord<'rival_action'>);

    // ACN network signal
    const acnId = store.acnId ?? `acn-${store.type}`;
    records.push({
      sourceId: `isr-mf-acn-${day}-${store.id}-${i}`,
      sourceKind: 'acn_network_signal',
      payload: {
        subtype: seededChoice(`${rivalSalt}-acn`, ['competition_escalation', 'cooperation_opportunity'] as const),
        summary: `${store.name} ACN动态: 活跃度${store.activityHeat}`,
        sourceAcnId: acnId,
        brokerIds: [`shadow-broker-${store.id}`],
        cooperationScore: seededInt(`${rivalSalt}-coop`, 10, 90),
      },
      day,
      phase: seededChoice(`${rivalSalt}-acn-phase`, ['morning', 'afternoon'] as const),
      entityRefs: [
        { id: store.id, kind: 'store' },
        { id: acnId, kind: 'acn' },
      ],
      actorRefs: [{ id: `shadow-broker-${store.id}`, role: 'rival_broker' }],
      visibility: { scope: 'all_actors', baseDelayDays: 0 },
      confidence: seededFloat(`${rivalSalt}-acn-conf`, 0.5, 0.85),
      delayDays: 0,
      replayKey: `rk-mf-acn-${runSeed}-${day}-${store.id}-${i}`,
      origin: 'ecosystem_tick',
    } as InformationSourceRecord<'acn_network_signal'>);
  }

  // ── 4. Owner Dynamics: trust/price/urgency shifts ──────────────────────
  const ownerCount = Math.min(3, input.activeCases.length);
  for (let i = 0; i < ownerCount; i += 1) {
    const idx = seededInt(`${salt}-owner-idx-${i}`, 0, input.activeCases.length - 1);
    const caseItem = input.activeCases[idx];
    if (!caseItem) continue;

    const ownerSalt = `${salt}-owner-${caseItem.id}-${i}`;

    // Owner life event (financial, family, relocation)
    const lifeEvent = seededChoice(`${ownerSalt}-life`, [
      'financial_need', 'family_change', 'relocation_planned', 'job_change',
    ] as const);

    records.push({
      sourceId: `isr-mf-ole-${day}-${caseItem.id}-${i}`,
      sourceKind: 'owner_life_event_signal',
      payload: {
        subtype: lifeEvent,
        summary: `${caseItem.ownerName}生活事件: ${lifeEvent}, 紧急度${caseItem.urgency}`,
        ownerId: caseItem.ownerName,
        caseId: caseItem.id,
        urgencyImpact: seededInt(`${ownerSalt}-urg`, -10, 20),
        priceFlexibilityImpact: seededInt(`${ownerSalt}-flex`, -15, 15),
        trustImpact: seededInt(`${ownerSalt}-trust`, -10, 10),
        timelineDays: seededInt(`${ownerSalt}-tl`, 1, 14),
        eventConfidence: seededFloat(`${ownerSalt}-conf`, 0.5, 0.9),
      },
      day,
      phase: 'afternoon',
      entityRefs: [
        { id: caseItem.id, kind: 'case' },
        { id: caseItem.ownerName, kind: 'owner' },
      ],
      actorRefs: [{ id: caseItem.ownerName, role: 'owner' }],
      visibility: { scope: 'owner_only', baseDelayDays: 0 },
      confidence: seededFloat(`${ownerSalt}-vis-conf`, 0.5, 0.85),
      delayDays: 0,
      replayKey: `rk-mf-ole-${runSeed}-${day}-${caseItem.id}-${i}`,
      origin: 'ecosystem_tick',
    } as InformationSourceRecord<'owner_life_event_signal'>);

    // Owner interview signal (trust/price/urgency)
    const interviewSubtype = seededChoice(`${ownerSalt}-int`, [
      'price_discussed', 'trust_expressed', 'urgency_revealed', 'objection_raised',
    ] as const);
    const tone = seededChoice(`${ownerSalt}-tone`, ['positive', 'neutral', 'negative'] as const);

    records.push({
      sourceId: `isr-mf-oi-${day}-${caseItem.id}-${i}`,
      sourceKind: 'owner_interview',
      payload: {
        subtype: interviewSubtype,
        summary: `${caseItem.ownerName}沟通: ${interviewSubtype}, 信任${caseItem.trust}`,
        ownerId: caseItem.ownerName,
        caseId: caseItem.id,
        brokerId: 'player-broker',
        trustLevel: caseItem.trust,
        tone,
        ownerStatement: `${interviewSubtype}: 信任${caseItem.trust}, 耐心${caseItem.patience}`,
        interactionMode: seededChoice(`${ownerSalt}-mode`, ['scheduled_call', 'ad_hoc', 'meeting'] as const),
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
      confidence: seededFloat(`${ownerSalt}-int-conf`, 0.6, 0.9),
      delayDays: 0,
      replayKey: `rk-mf-oi-${runSeed}-${day}-${caseItem.id}-${i}`,
      origin: 'ecosystem_tick',
    } as InformationSourceRecord<'owner_interview'>);
  }

  // ── 5. Broker/Org Dynamics: capacity / manager / platform signals ──────
  //    Manager message (focus case selection)
  if (input.activeCases.length > 0) {
    const sorted = [...input.activeCases].sort((a, b) => b.urgency - a.urgency);
    const focusCase = sorted[0];
    const priority = Math.round(focusCase.urgency * 0.8 + focusCase.competitiveness * 0.2);

    records.push({
      sourceId: `isr-mf-mm-${day}-focus`,
      sourceKind: 'manager_message',
      payload: {
        subtype: seededChoice(`${salt}-mm-sub`, ['focus_case_selected', 'resource_allocated', 'strategic_direction'] as const),
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
      replayKey: `rk-mf-mm-${runSeed}-${day}-focus`,
      origin: 'ecosystem_tick',
    } as InformationSourceRecord<'manager_message'>);
  }

  // Broker capacity signals
  const brokerCapacityCount = Math.min(2, input.rivalStores.length);
  for (let i = 0; i < brokerCapacityCount; i += 1) {
    const idx = seededInt(`${salt}-bc-idx-${i}`, 0, input.rivalStores.length - 1);
    const store = input.rivalStores[idx];
    if (!store) continue;

    const bcSalt = `${salt}-bc-${store.id}-${i}`;
    records.push({
      sourceId: `isr-mf-bc-${day}-${store.id}-${i}`,
      sourceKind: 'broker_capacity_signal',
      payload: {
        subtype: seededChoice(`${bcSalt}-sub`, ['workload_balanced', 'energy_depleted', 'organizational_pressure'] as const),
        summary: `${store.name}经纪人能力: 活跃度${store.activityHeat}`,
        brokerId: `shadow-broker-${store.id}`,
        acnId: store.acnId ?? `acn-${store.type}`,
        energyLevel: seededInt(`${bcSalt}-energy`, 20, 90),
        scheduleUtilization: seededInt(`${bcSalt}-util`, 30, 95),
        activeCaseCount: seededInt(`${bcSalt}-cases`, 1, 8),
        affectedCaseIds: [],
        pressureMagnitude: seededInt(`${bcSalt}-press`, 10, 80),
      },
      day,
      phase: 'morning',
      entityRefs: [{ id: store.id, kind: 'store' }],
      actorRefs: [{ id: `shadow-broker-${store.id}`, role: 'rival_broker' }],
      visibility: { scope: 'all_actors', baseDelayDays: 0 },
      confidence: seededFloat(`${bcSalt}-conf`, 0.6, 0.9),
      delayDays: 0,
      replayKey: `rk-mf-bc-${runSeed}-${day}-${store.id}-${i}`,
      origin: 'ecosystem_tick',
    } as InformationSourceRecord<'broker_capacity_signal'>);
  }

  // ── 6. Platform Traffic: listing views / inquiries ──────────────────────
  const trafficCount = Math.min(2, input.rivalListings.length);
  for (let i = 0; i < trafficCount; i += 1) {
    const idx = seededInt(`${salt}-pt-idx-${i}`, 0, input.rivalListings.length - 1);
    const listing = input.rivalListings[idx];
    if (!listing) continue;

    const ptSalt = `${salt}-pt-${listing.id}-${i}`;
    records.push({
      sourceId: `isr-mf-pt-${day}-${listing.id}-${i}`,
      sourceKind: 'platform_traffic',
      payload: {
        subtype: seededChoice(`${ptSalt}-sub`, ['listing_viewed', 'listing_favorited', 'inquiry_received'] as const),
        summary: `${listing.title}平台流量`,
        listingId: listing.id,
        marketCellId: listing.marketCellId,
        viewCount: seededInt(`${ptSalt}-views`, 10, 200),
        favoriteCount: seededInt(`${ptSalt}-fav`, 0, 20),
        inquiryCount: seededInt(`${ptSalt}-inq`, 0, 10),
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
      confidence: seededFloat(`${ptSalt}-conf`, 0.6, 0.9),
      delayDays: 0,
      replayKey: `rk-mf-pt-${runSeed}-${day}-${listing.id}-${i}`,
      origin: 'ecosystem_tick',
    } as InformationSourceRecord<'platform_traffic'>);
  }

  // ── 7. Supporting Facility: school/transit/commercial changes ───────────
  const facilityCount = Math.min(2, input.marketCells.length);
  for (let i = 0; i < facilityCount; i += 1) {
    const idx = seededInt(`${salt}-sf-idx-${i}`, 0, input.marketCells.length - 1);
    const cell = input.marketCells[idx];
    if (!cell) continue;

    const sfSalt = `${salt}-sf-${cell.id}-${i}`;
    records.push({
      sourceId: `isr-mf-sf-${day}-${cell.id}-${i}`,
      sourceKind: 'supporting_facility_signal',
      payload: {
        subtype: seededChoice(`${sfSalt}-sub`, ['school_district_changed', 'transit_access_changed', 'commercial_development', 'community_environment_shift'] as const),
        summary: `${cell.name}配套变化`,
        marketCellId: cell.id,
        facilityType: seededChoice(`${sfSalt}-ft`, ['school', 'transit', 'commercial', 'community'] as const),
        before: seededInt(`${sfSalt}-before`, 40, 70),
        after: seededInt(`${sfSalt}-after`, 30, 80),
        dataSource: seededChoice(`${sfSalt}-ds`, ['broker_observation', 'community_report', 'media'] as const),
      },
      day,
      phase: 'morning',
      entityRefs: [{ id: cell.id, kind: 'market_cell' }],
      actorRefs: [{ id: 'system', role: 'system' }],
      visibility: { scope: 'all_actors', baseDelayDays: 1 },
      confidence: seededFloat(`${sfSalt}-conf`, 0.5, 0.85),
      delayDays: 1,
      replayKey: `rk-mf-sf-${runSeed}-${day}-${cell.id}-${i}`,
      origin: 'ecosystem_tick',
    } as InformationSourceRecord<'supporting_facility_signal'>);
  }

  // ── 8. Micro-Market: supply/demand imbalance signals ───────────────────
  const microCount = Math.min(2, input.marketCells.length);
  for (let i = 0; i < microCount; i += 1) {
    const idx = seededInt(`${salt}-mm-idx-${i}`, 0, input.marketCells.length - 1);
    const cell = input.marketCells[idx];
    if (!cell) continue;

    const mmSalt = `${salt}-mm-${cell.id}-${i}`;
    const supplyDelta = seededInt(`${mmSalt}-sup`, -10, 15);
    const demandDelta = seededInt(`${mmSalt}-dem`, -10, 15);

    records.push({
      sourceId: `isr-mf-mm-${day}-${cell.id}-${i}`,
      sourceKind: 'micro_market_signal',
      payload: {
        subtype: seededChoice(`${mmSalt}-sub`, ['supply_increased', 'demand_shift', 'price_band_squeeze', 'inventory_absorption'] as const),
        summary: `${cell.name}微板块动态: 供${supplyDelta}/需${demandDelta}`,
        microMarketCellId: cell.id,
        marketCellId: cell.id,
        supplyDelta,
        demandDelta,
        priceBand: `${seededInt(`${mmSalt}-lo`, 150, 300)}-${seededInt(`${mmSalt}-hi`, 300, 500)}万`,
        absorptionRate: seededInt(`${mmSalt}-ar`, 30, 80),
      },
      day,
      phase: 'morning',
      entityRefs: [{ id: cell.id, kind: 'market_cell' }],
      actorRefs: [{ id: 'system', role: 'system' }],
      visibility: { scope: 'all_actors', baseDelayDays: 0 },
      confidence: seededFloat(`${mmSalt}-conf`, 0.5, 0.85),
      delayDays: 0,
      replayKey: `rk-mf-mm-${runSeed}-${day}-${cell.id}-${i}`,
      origin: 'ecosystem_tick',
    } as InformationSourceRecord<'micro_market_signal'>);
  }

  return records;
}
