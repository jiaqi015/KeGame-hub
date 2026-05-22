/**
 * MarketEconomyRuntime — models resource scarcity, competition, and economic dynamics.
 *
 * The market is not random noise. It's driven by:
 *   - Player actions consuming resources (energy, budget, org credit, attention)
 *   - Rival actions competing for the same scarce resources
 *   - Organization interventions changing resource allocation
 *   - Customer attention migrating based on follow-up quality
 *   - Owner trust/patience responding to resource-driven actions
 *
 * All resource changes produce source records that flow through:
 *   source → causal → actor knowledge → decision → command → receipt → feedback → replay
 *
 * Hard constraints:
 *   - Deterministic: same seed + same day → same records
 *   - No Date.now / Math.random / fetch / LLM provider
 *   - No direct mutation of case/opportunity/trust/patience fields
 *   - All resource changes are observable in worldCausalEvents
 */

import type {
  InformationSourceRecord,
  SourceKind,
} from '../informationSourceTypes.js';

import type {
  BigWorldClockInput,
} from './types.js';

import { resolveStoreAcnId, resolvePlayerBrokerAcnId } from './brandIdHelper.js';

// ── Deterministic RNG ────────────────────────────────────────────

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

// ── Resource Ledger ──────────────────────────────────────────────

/**
 * Daily resource snapshot — what resources were consumed/generated today.
 * This is derived deterministically from the tick input, not from hidden state.
 */
export interface DailyResourceSnapshot {
  readonly day: number;
  readonly playerEnergyConsumed: number;
  readonly playerEnergyReplenished: number;
  readonly promotionBudgetConsumed: number;
  readonly promotionBudgetAllocated: number;
  readonly orgCreditEarned: number;
  readonly orgCreditSpent: number;
  readonly customerAttentionGained: number;
  readonly customerAttentionLost: number;
  readonly customerAttentionMigrated: number;
  readonly ownerTrustNet: number;
  readonly ownerPatienceNet: number;
  readonly rivalActionsToday: number;
  readonly rivalResourceCompeted: number;
}

/**
 * Compute a deterministic daily resource snapshot from tick input.
 *
 * Round 19: prefers real action receipts from input.sourceRecords over seeded random.
 *   - energy: from player_action_receipt costEnergy
 *   - budget: from player_action_receipt costPromotionBudget + manager_message action resource records
 *   - trust/patience: from player_action_receipt fieldDeltas (when available)
 *   - fallback to seeded deterministic values when no real receipts exist
 *
 * Same seed + same input → same snapshot.
 */
export function computeDailyResourceSnapshot(
  input: BigWorldClockInput,
  day: number,
  runSeed: number,
): DailyResourceSnapshot {
  const salt = `res-${runSeed}-${day}`;
  const sourceRecords = input.sourceRecords ?? [];

  // ── Extract real action receipts ──────────────────────────────
  const actionReceipts = sourceRecords.filter(
    (r) => r.day === day && r.sourceKind === 'player_action_receipt',
  );
  const actionResourceRecords = sourceRecords.filter(
    (r) => r.day === day && r.sourceKind === 'manager_message'
      && (r.payload as { subtype?: string }).subtype === 'resource_allocated'
      && r.sourceId.startsWith('isr-ar-'),
  );
  const processReceipts = sourceRecords.filter(
    (r) => r.day === day && r.sourceKind === 'process_receipt',
  );

  // ── Energy: from real action receipts ─────────────────────────
  const activeCaseCount = input.activeCases.length;
  const energyReplenished = 100; // daily replenishment
  let realEnergyConsumed = 0;
  for (const receipt of actionReceipts) {
    const payload = receipt.payload as { costEnergy?: number; outcome?: string };
    if (payload.outcome === 'success' && payload.costEnergy) {
      realEnergyConsumed += payload.costEnergy;
    }
  }
  // Fallback: autonomous tick energy maintenance cost
  const fallbackEnergy = seededInt(`${salt}-energy`, Math.min(30, activeCaseCount * 3), Math.min(80, activeCaseCount * 8));
  const energyConsumed = realEnergyConsumed > 0 ? realEnergyConsumed : fallbackEnergy;

  // ── Budget: from real action resource records ─────────────────
  let realBudgetConsumed = 0;
  let realBudgetAllocated = 0;
  for (const record of actionResourceRecords) {
    const payload = record.payload as { summary?: string; priority?: number };
    const amount = payload.priority ?? 0;
    if (record.sourceId.includes('-spend-')) {
      realBudgetConsumed += amount;
    } else if (record.sourceId.includes('-refund-')) {
      realBudgetConsumed -= amount;
    }
  }
  // Weekly allocation fallback — uses TimeContext instead of bare day % 7
  const weeklyAlloc = input.timeContext.isWeeklyBudgetDay ? seededInt(`${salt}-budget-alloc`, 50, 150) : 0;
  const fallbackBudget = seededInt(`${salt}-budget-cons`, 5, Math.min(40, activeCaseCount * 5));
  const budgetConsumed = realBudgetConsumed > 0 ? realBudgetConsumed : fallbackBudget;
  const budgetAllocated = weeklyAlloc;

  // ── Org credit: from focus meeting / manager messages ─────────
  const orgCreditEarned = input.timeContext.isOrgCreditDay ? seededInt(`${salt}-org-earn`, 20, 60) : 0;
  const orgCreditSpent = seededInt(`${salt}-org-spend`, 5, Math.min(30, activeCaseCount * 3));

  // ── Customer attention: from process receipts + seeded fallback ──
  const customerCount = input.customerStates.filter((c) => c.status !== 'lost' && c.status !== 'converted').length;
  let realAttentionGained = 0;
  let realAttentionLost = 0;
  for (const receipt of processReceipts) {
    const payload = receipt.payload as { metrics?: { processedCount?: number; resolvedCount?: number } };
    const processed = payload.metrics?.processedCount ?? 0;
    const resolved = payload.metrics?.resolvedCount ?? 0;
    realAttentionGained += resolved;
    realAttentionLost += Math.max(0, processed - resolved);
  }
  const attentionMigrated = seededInt(`${salt}-attn-mig`, 0, Math.min(5, customerCount));
  const attentionGained = realAttentionGained > 0 ? realAttentionGained : seededInt(`${salt}-attn-gain`, 0, Math.min(10, customerCount));
  const attentionLost = realAttentionLost > 0 ? realAttentionLost : seededInt(`${salt}-attn-lost`, 0, Math.min(8, customerCount));

  // ── Owner trust/patience: from action fieldDeltas + seeded fallback ──
  let realTrustNet = 0;
  let realPatienceNet = 0;
  let trustObserved = false;
  let patienceObserved = false;
  for (const receipt of actionReceipts) {
    const payload = receipt.payload as { fieldDeltas?: readonly { field: string; from: string | number | boolean; to: string | number | boolean }[] };
    if (payload.fieldDeltas) {
      trustObserved = true;
      patienceObserved = true;
      for (const fd of payload.fieldDeltas) {
        if (fd.field === 'trust') realTrustNet += Number(fd.to) - Number(fd.from);
        if (fd.field === 'patience') realPatienceNet += Number(fd.to) - Number(fd.from);
      }
    }
  }
  const trustNet = trustObserved ? realTrustNet : seededInt(`${salt}-trust-net`, -3, 3);
  const patienceNet = patienceObserved ? realPatienceNet : seededInt(`${salt}-patience-net`, -2, 2);

  // ── Rival resource competition: seeded deterministic ──────────
  const rivalCount = input.rivalStores.length;
  const rivalActions = seededInt(`${salt}-rival-actions`, 1, Math.min(5, rivalCount));
  const rivalCompeted = seededInt(`${salt}-rival-comp`, 5, Math.min(40, rivalCount * 5));

  return {
    day,
    playerEnergyConsumed: energyConsumed,
    playerEnergyReplenished: energyReplenished,
    promotionBudgetConsumed: budgetConsumed,
    promotionBudgetAllocated: budgetAllocated,
    orgCreditEarned,
    orgCreditSpent,
    customerAttentionGained: attentionGained,
    customerAttentionLost: attentionLost,
    customerAttentionMigrated: attentionMigrated,
    ownerTrustNet: trustNet,
    ownerPatienceNet: patienceNet,
    rivalActionsToday: rivalActions,
    rivalResourceCompeted: rivalCompeted,
  };
}

// ── Resource Source Records ──────────────────────────────────────

/**
 * Generate source records from a daily resource snapshot.
 * Each resource change produces a source record that flows through the
 * ingestion pipeline into causal events.
 */
export function generateEconomySourceRecords(
  snapshot: DailyResourceSnapshot,
  input: BigWorldClockInput,
  runSeed: number,
): readonly InformationSourceRecord[] {
  const records: InformationSourceRecord[] = [];
  const day = snapshot.day;
  const salt = `eco-${runSeed}-${day}`;

  // ── 1. Player energy consumption ──────────────────────────────
  //    Broker capacity signal: energy depleted by maintaining market presence
  if (snapshot.playerEnergyConsumed > 0) {
    const activeCase = input.activeCases[0];
    records.push({
      sourceId: `isr-eco-energy-${day}`,
      sourceKind: 'broker_capacity_signal',
      payload: {
        subtype: snapshot.playerEnergyConsumed > 50 ? 'energy_depleted' : 'workload_balanced',
        summary: `经纪人日耗精力${snapshot.playerEnergyConsumed}，补充${snapshot.playerEnergyReplenished}`,
        brokerId: 'player-broker',
        acnId: resolvePlayerBrokerAcnId(input.existingRuntime),
        energyLevel: Math.max(0, snapshot.playerEnergyReplenished - snapshot.playerEnergyConsumed),
        scheduleUtilization: Math.min(100, Math.round(snapshot.playerEnergyConsumed * 1.2)),
        activeCaseCount: input.activeCases.length,
        affectedCaseIds: input.activeCases.slice(0, 3).map((c) => c.id),
        pressureMagnitude: snapshot.playerEnergyConsumed,
      },
      day,
      phase: 'evening',
      entityRefs: [{ id: 'player-broker', kind: 'broker' }],
      actorRefs: [{ id: 'player-broker', role: 'player_broker' }],
      visibility: { scope: 'player_only', baseDelayDays: 0 },
      confidence: 0.95,
      delayDays: 0,
      replayKey: `rk-eco-energy-${runSeed}-${day}`,
      origin: 'daily_settlement',
    } as InformationSourceRecord<'broker_capacity_signal'>);
  }

  // ── 2. Promotion budget consumption/allocation ────────────────
  //    Manager message: org resource allocation
  if (snapshot.promotionBudgetConsumed > 0 || snapshot.promotionBudgetAllocated > 0) {
    const focusCase = input.activeCases.length > 0
      ? [...input.activeCases].sort((a, b) => b.urgency - a.urgency)[0]
      : undefined;
    records.push({
      sourceId: `isr-eco-budget-${day}`,
      sourceKind: 'manager_message',
      payload: {
        subtype: snapshot.promotionBudgetAllocated > 0 ? 'resource_allocated' : 'strategic_direction',
        summary: snapshot.promotionBudgetAllocated > 0
          ? `周度拨付${snapshot.promotionBudgetAllocated}推广金，消耗${snapshot.promotionBudgetConsumed}`
          : `日消耗推广金${snapshot.promotionBudgetConsumed}，当前余额待确认`,
        managerId: 'system-manager',
        targetBrokerId: 'player-broker',
        caseIds: focusCase ? [focusCase.id] : [],
        priority: Math.round(snapshot.promotionBudgetConsumed * 1.5),
        instruction: snapshot.promotionBudgetAllocated > 0
          ? `本周推广金${snapshot.promotionBudgetAllocated}点已到账，合理分配`
          : `今日推广消耗${snapshot.promotionBudgetConsumed}点，注意控制节奏`,
      },
      day,
      phase: 'morning',
      entityRefs: focusCase ? [{ id: focusCase.id, kind: 'case' }] : [],
      actorRefs: [
        { id: 'system-manager', role: 'manager' },
        { id: 'player-broker', role: 'player_broker' },
      ],
      visibility: { scope: 'specific_actors', actorIds: ['player-broker', 'system-manager'], baseDelayDays: 0 },
      confidence: 0.9,
      delayDays: 0,
      replayKey: `rk-eco-budget-${runSeed}-${day}`,
      origin: 'daily_settlement',
    } as InformationSourceRecord<'manager_message'>);
  }

  // ── 3. Org credit earned/spent ────────────────────────────────
  //    Manager message: organizational intervention based on credit
  if (snapshot.orgCreditEarned > 0 || snapshot.orgCreditSpent > 0) {
    const sorted = [...input.activeCases].sort((a, b) => b.competitiveness - a.competitiveness);
    const topCase = sorted[0];
    if (topCase) {
      records.push({
        sourceId: `isr-eco-org-${day}`,
        sourceKind: 'manager_message',
        payload: {
          subtype: snapshot.orgCreditEarned > 0 ? 'focus_case_selected' : 'resource_allocated',
          summary: snapshot.orgCreditEarned > 0
            ? `组织信用+${snapshot.orgCreditEarned}，聚焦会资源到位`
            : `组织信用-${snapshot.orgCreditSpent}，资源分配给${topCase.title}`,
          managerId: 'system-manager',
          targetBrokerId: 'player-broker',
          caseIds: [topCase.id],
          priority: Math.round(topCase.competitiveness),
          instruction: `资源分配: ${topCase.title} 竞争力${topCase.competitiveness}`,
        },
        day,
        phase: 'morning',
        entityRefs: [{ id: topCase.id, kind: 'case' }],
        actorRefs: [
          { id: 'system-manager', role: 'manager' },
          { id: 'player-broker', role: 'player_broker' },
        ],
        visibility: { scope: 'specific_actors', actorIds: ['player-broker', 'system-manager'], baseDelayDays: 0 },
        confidence: 0.85,
        delayDays: 0,
        replayKey: `rk-eco-org-${runSeed}-${day}`,
        origin: 'daily_settlement',
      } as InformationSourceRecord<'manager_message'>);
    }
  }

  // ── 4. Customer attention migration ───────────────────────────
  //    Customer interaction: attention shifts driven by follow-up quality and rival pressure
  if (snapshot.customerAttentionMigrated > 0 || snapshot.customerAttentionLost > 0) {
    const activeCustomers = input.customerStates.filter(
      (c) => c.status !== 'lost' && c.status !== 'converted',
    );
    if (activeCustomers.length > 0) {
      const idx = seededInt(`${salt}-attn-idx`, 0, activeCustomers.length - 1);
      const customer = activeCustomers[idx];
      const subtype = snapshot.customerAttentionLost > snapshot.customerAttentionGained
        ? 'dropout_detected'
        : snapshot.customerAttentionMigrated > 0
          ? 'preference_shifted'
          : 'comparison_made';
      records.push({
        sourceId: `isr-eco-attn-${day}-${customer.customerId}`,
        sourceKind: 'customer_interaction',
        payload: {
          subtype,
          summary: `客户${customer.customerId}注意力变化: 获得${snapshot.customerAttentionGained} 失去${snapshot.customerAttentionLost} 迁移${snapshot.customerAttentionMigrated}`,
          customerId: customer.customerId,
          listingId: customer.activeCaseIds[0],
          observationMode: 'observed',
        },
        day,
        phase: 'afternoon',
        entityRefs: [
          { id: customer.customerId, kind: 'customer' },
          ...(customer.activeCaseIds[0] ? [{ id: customer.activeCaseIds[0], kind: 'listing' as const }] : []),
        ],
        actorRefs: [{ id: customer.customerId, role: 'customer' }],
        visibility: { scope: 'player_only', baseDelayDays: 0 },
        confidence: 0.75,
        delayDays: 0,
        replayKey: `rk-eco-attn-${runSeed}-${day}-${customer.customerId}`,
        origin: 'daily_settlement',
      } as InformationSourceRecord<'customer_interaction'>);
    }
  }

  // ── 5. Owner trust/patience changes from resource actions ─────
  //    Owner life event: trust/patience shifts driven by broker follow-up quality
  if (Math.abs(snapshot.ownerTrustNet) > 0 || Math.abs(snapshot.ownerPatienceNet) > 0) {
    const activeCases = input.activeCases;
    if (activeCases.length > 0) {
      const idx = seededInt(`${salt}-owner-idx`, 0, activeCases.length - 1);
      const caseItem = activeCases[idx];
      const urgencyImpact = Math.round(snapshot.ownerPatienceNet * 0.5);
      const trustImpact = snapshot.ownerTrustNet;
      records.push({
        sourceId: `isr-eco-owner-${day}-${caseItem.id}`,
        sourceKind: 'owner_life_event_signal',
        payload: {
          subtype: snapshot.ownerTrustNet < 0 ? 'financial_need' : 'relocation_planned',
          summary: `${caseItem.ownerName}资源驱动变化: 信任${snapshot.ownerTrustNet > 0 ? '+' : ''}${snapshot.ownerTrustNet} 耐心${snapshot.ownerPatienceNet > 0 ? '+' : ''}${snapshot.ownerPatienceNet}`,
          ownerId: caseItem.ownerName,
          caseId: caseItem.id,
          urgencyImpact,
          priceFlexibilityImpact: Math.round(snapshot.ownerTrustNet * 0.3),
          trustImpact,
          timelineDays: seededInt(`${salt}-owner-tl`, 1, 7),
          eventConfidence: 0.7,
        },
        day,
        phase: 'afternoon',
        entityRefs: [
          { id: caseItem.id, kind: 'case' },
          { id: caseItem.ownerName, kind: 'owner' },
        ],
        actorRefs: [{ id: caseItem.ownerName, role: 'owner' }],
        visibility: { scope: 'owner_only', baseDelayDays: 0 },
        confidence: 0.7,
        delayDays: 0,
        replayKey: `rk-eco-owner-${runSeed}-${day}-${caseItem.id}`,
        origin: 'daily_settlement',
      } as InformationSourceRecord<'owner_life_event_signal'>);
    }
  }

  // ── 6. Rival resource competition ─────────────────────────────
  //    Rival action: rivals competing for the same scarce resources
  if (snapshot.rivalActionsToday > 0) {
    const rivalStoresWithListings = input.rivalStores.filter((store) =>
      input.rivalListings.some((listing) => listing.storeId === store.id && listing.status === 'active'),
    );
    const rivalStores = rivalStoresWithListings.length > 0 ? rivalStoresWithListings : input.rivalStores;
    if (rivalStores.length > 0) {
      const idx = seededInt(`${salt}-rival-idx`, 0, rivalStores.length - 1);
      const store = rivalStores[idx];
      const storeListings = input.rivalListings.filter(
        (l) => l.storeId === store.id && l.status === 'active',
      );
      const targetListing = storeListings.length > 0
        ? storeListings[seededInt(`${salt}-rival-target`, 0, storeListings.length - 1)]
        : undefined;

      records.push({
        sourceId: `isr-eco-rival-${day}-${store.id}`,
        sourceKind: 'rival_action',
        payload: {
          subtype: seededChoice(`${salt}-rival-sub`, ['reprice', 'customer_followed', 'push_listing', 'owner_pitched'] as const),
          summary: `${store.name}资源竞争: ${snapshot.rivalActionsToday}个动作，争夺${snapshot.rivalResourceCompeted}单位资源`,
          rivalBrokerId: `shadow-broker-${store.id}`,
          rivalAcnId: resolveStoreAcnId(store),
          listingId: targetListing?.id,
          priceBefore: targetListing?.askPrice,
          priceAfter: targetListing ? Math.max(100, targetListing.askPrice + seededInt(`${salt}-rival-delta`, -10, 5)) : undefined,
          marketCellId: targetListing?.marketCellId,
          evidenceStrength: 'direct' as const,
        },
        day,
        phase: seededChoice(`${salt}-rival-phase`, ['morning', 'afternoon'] as const),
        entityRefs: [
          { id: store.id, kind: 'store' },
          ...(targetListing ? [{ id: targetListing.id, kind: 'listing' as const }] : []),
          ...(targetListing?.marketCellId ? [{ id: targetListing.marketCellId, kind: 'market_cell' as const }] : []),
        ],
        actorRefs: [{ id: `shadow-broker-${store.id}`, role: 'rival_broker' }],
        visibility: { scope: 'all_actors', baseDelayDays: 0 },
        confidence: 0.8,
        delayDays: 0,
        replayKey: `rk-eco-rival-${runSeed}-${day}-${store.id}`,
        origin: 'daily_settlement',
      } as InformationSourceRecord<'rival_action'>);
    }
  }

  // ── 7. Buyer financing signal from resource dynamics ──────────
  //    Customer budget/financing affected by market resource competition
  const activeCustomers = input.customerStates.filter(
    (c) => c.status !== 'lost' && c.status !== 'converted',
  );
  if (activeCustomers.length > 0) {
    const idx = seededInt(`${salt}-fin-idx`, 0, activeCustomers.length - 1);
    const customer = activeCustomers[idx];
    const subtype = seededChoice(`${salt}-fin-sub`, ['budget_adjusted', 'down_payment_ready', 'loan_pre_approved'] as const);
    records.push({
      sourceId: `isr-eco-fin-${day}-${customer.customerId}`,
      sourceKind: 'buyer_financing_signal',
      payload: {
        subtype,
        summary: `客户${customer.customerId}资源环境变化: 竞争${snapshot.rivalResourceCompeted}单位，注意力${snapshot.customerAttentionGained}/${snapshot.customerAttentionLost}`,
        customerId: customer.customerId,
        readinessImpact: snapshot.customerAttentionGained > snapshot.customerAttentionLost ? 5 : -5,
      },
      day,
      phase: 'afternoon',
      entityRefs: [{ id: customer.customerId, kind: 'customer' }],
      actorRefs: [{ id: customer.customerId, role: 'customer' }],
      visibility: { scope: 'player_only', baseDelayDays: 0 },
      confidence: 0.65,
      delayDays: 0,
      replayKey: `rk-eco-fin-${runSeed}-${day}-${customer.customerId}`,
      origin: 'daily_settlement',
    } as InformationSourceRecord<'buyer_financing_signal'>);
  }

  return records;
}
