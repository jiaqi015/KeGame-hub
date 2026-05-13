/**
 * BigWorldTickPhases — 8-phase daily tick pipeline.
 *
 * Each phase reads current input state, produces causal events, and may
 * mutate input state for downstream phases. Phases do NOT directly write
 * case.status, closedDeals, or owner trust/patience raw fields.
 *
 * Deterministic: same seed + same input state → same events and mutations.
 *
 * Mother model alignment:
 *   - Section 10: Competition is environment
 *   - Section 13: Causal Transmission (deterministic skeleton)
 *   - Section 6: Owner perceives through lagged signals
 *   - Section 7: Customer compares and shifts attention
 *   - Section 8: Broker interprets and recommends
 *
 * Hard constraints:
 *   - No case.status mutation
 *   - No closedDeals mutation
 *   - No owner trust/patience/urgency raw field mutation from hidden truth
 *   - No customer final purchase commitment without process evidence
 *   - No UI projection fields as canonical facts
 */

import type {
  BigWorldDailyEvent,
  BigWorldTickPhaseId,
  BigWorldTickPhaseResult,
  BigWorldCausalRef,
  BigWorldClockInput,
  BigWorldEventVisibility,
} from './types.js';

import type { WorldCausalEvent } from '../causalEvents.js';
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

// ── Deterministic RNG ──────────────────────────────────────────────────

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededChance(seed: string, threshold: number): boolean {
  return (stableHash(seed) / 4294967296) < threshold;
}

function seededInt(seed: string, min: number, max: number): number {
  return min + (stableHash(seed) % (max - min + 1));
}

function seededFloat(seed: string, min: number, max: number): number {
  return min + (stableHash(seed) / 4294967296) * (max - min);
}

// ── Event builder helpers ──────────────────────────────────────────────

// NOTE: Self-generated events from runtime phases have no sourceRecordId.
// Only events produced by sourceIngestionAdapter carry sourceRecordId + sourceReplayKey.
// All phase-generated events use source: 'system-tick' to mark them as non-source-derived.

let eventCounter = 0;

function resetEventCounter(): void {
  eventCounter = 0;
}

function makeDailyEventId(kind: string, day: number): string {
  eventCounter += 1;
  return `bwe-${kind}-${day}-${eventCounter}`;
}

function makeCausalRef(event: WorldCausalEvent): BigWorldCausalRef {
  return { eventId: event.id, day: event.day, kind: event.kind };
}

function makeDailyEvent(
  day: number,
  phase: BigWorldTickPhaseId,
  kind: string,
  source: string,
  affectedRefs: readonly BigWorldCausalRef[],
  causeEventIds: readonly string[],
  visibilityHint: BigWorldEventVisibility,
  boundedPayload: Readonly<Record<string, string | number | boolean>>,
): BigWorldDailyEvent {
  return Object.freeze({
    id: makeDailyEventId(kind, day),
    day,
    phase,
    kind,
    source,
    affectedRefs: Object.freeze([...affectedRefs]),
    causeEventIds: Object.freeze([...causeEventIds]),
    visibilityHint,
    boundedPayload: Object.freeze({ ...boundedPayload }),
  });
}

// ── Phase 1: EnvironmentPhase ──────────────────────────────────────────

interface PhaseInput {
  readonly input: BigWorldClockInput;
  /** Mutable market cell heats — phases may nudge these. */
  marketCellHeats: Map<string, number>;
  /** Accumulated causal events for the ledger. */
  causalEvents: WorldCausalEvent[];
  /** Accumulated daily events. */
  dailyEvents: BigWorldDailyEvent[];
  /** Phase mutation counters. */
  mutationCounts: Map<BigWorldTickPhaseId, number>;
}

function runEnvironmentPhase(ctx: PhaseInput): BigWorldTickPhaseResult {
  const { input, marketCellHeats, causalEvents, dailyEvents } = ctx;
  const day = input.settledDay;
  const phase: BigWorldTickPhaseId = 'EnvironmentPhase';
  let mutations = 0;

  for (const cell of input.marketCells) {
    const currentHeat = marketCellHeats.get(cell.id) ?? cell.demandHeat;
    const salt = `env-${day}-${cell.id}`;

    // Seasonal drift: small random walk
    const seasonalDrift = seededInt(`${salt}-season`, -3, 3);
    // Supply-demand imbalance pressure
    const supplyPressure = cell.supplyPressure > 60 ? -2 : cell.supplyPressure < 30 ? 2 : 0;
    // Competitive pressure
    const compPressure = cell.competitivePressure > 70 ? -1 : 0;

    const newHeat = Math.max(0, Math.min(100, currentHeat + seasonalDrift + supplyPressure + compPressure));

    if (newHeat !== currentHeat) {
      marketCellHeats.set(cell.id, newHeat);
      mutations += 1;

      const heatEvent = buildMarketHeatShifted(
        `bwe-heat-${day}-${cell.id}`,
        day,
        {
          marketCellId: cell.id,
          before: currentHeat,
          after: newHeat,
          sourceSignalId: `env-phase-${cell.id}-${day}`,
          sourceSignalType: 'environment-phase',
          confidence: 0.8,
        },
        { sourceRecordId: '' }, // environment-phase events have no source record
      );
      causalEvents.push(heatEvent);

      const dailyEvent = makeDailyEvent(
        day, phase, 'MarketHeatShifted', 'environment',
        [makeCausalRef(heatEvent)],
        [heatEvent.id],
        'signal',
        { marketCellId: cell.id, before: currentHeat, after: newHeat, drift: newHeat - currentHeat },
      );
      dailyEvents.push(dailyEvent);
    }
  }

  const durationUs = input.marketCells.length * 12;
  return Object.freeze({
    phaseId: phase,
    events: Object.freeze([...dailyEvents.slice(-mutations)]),
    entitiesProcessed: input.marketCells.length,
    mutationCount: mutations,
    durationUs,
  });
}

// ── Phase 2: RivalBrokerPhase ──────────────────────────────────────────

function runRivalBrokerPhase(ctx: PhaseInput): BigWorldTickPhaseResult {
  const { input, causalEvents, dailyEvents, mutationCounts } = ctx;
  const day = input.settledDay;
  const phase: BigWorldTickPhaseId = 'RivalBrokerPhase';
  let mutations = 0;
  const phaseEvents: BigWorldDailyEvent[] = [];

  for (const store of input.rivalStores) {
    const salt = `rbroker-${day}-${store.id}`;
    const followupChance = 0.3 + (store.activityHeat / 100) * 0.3;

    if (!seededChance(salt, followupChance)) continue;

    // Determine which listing to act on
    const storeListings = input.rivalListings.filter(
      (l) => l.storeId === store.id && l.status === 'active',
    );
    if (storeListings.length === 0) continue;

    const targetListing = storeListings[seededInt(`${salt}-target`, 0, storeListings.length - 1)];
    const actionKinds = ['reprice', 'follow_customer', 'push_listing', 'owner_pitch'] as const;
    const actionKind = actionKinds[seededInt(`${salt}-action`, 0, actionKinds.length - 1)];
    const intensity = seededInt(`${salt}-intensity`, 20, 80);

    const brokerEvent = buildRivalBrokerActionTaken(
      `bwe-rbroker-${day}-${store.id}-${mutations}`,
      day,
      {
        brokerId: `shadow-broker-${store.id}`,
        acnId: `acn-${store.type}`,
        actionKind,
        energyCost: 10,
        actionIntensity: intensity,
        targetListingId: targetListing.id,
        targetMarketCellId: targetListing.marketCellId,
      },
    );
    causalEvents.push(brokerEvent);

    const dailyEvent = makeDailyEvent(
      day, phase, 'RivalBrokerActionTaken', `store:${store.name}`,
      [makeCausalRef(brokerEvent)],
      [brokerEvent.id],
      'signal',
      {
        storeName: store.name,
        actionKind,
        intensity,
        listingTitle: targetListing.title,
      },
    );
    phaseEvents.push(dailyEvent);
    dailyEvents.push(dailyEvent);
    mutations += 1;
  }

  mutationCounts.set(phase, mutations);
  return Object.freeze({
    phaseId: phase,
    events: Object.freeze(phaseEvents),
    entitiesProcessed: input.rivalStores.length,
    mutationCount: mutations,
    durationUs: input.rivalStores.length * 25,
  });
}

// ── Phase 3: ListingSupplyPhase ────────────────────────────────────────

function runListingSupplyPhase(ctx: PhaseInput): BigWorldTickPhaseResult {
  const { input, causalEvents, dailyEvents, mutationCounts } = ctx;
  const day = input.settledDay;
  const phase: BigWorldTickPhaseId = 'ListingSupplyPhase';
  let mutations = 0;
  const phaseEvents: BigWorldDailyEvent[] = [];

  // Collect upstream cause IDs: environment heat shifts for this day's market cells
  const upstreamCauseIds = causalEvents
    .filter((e) => e.kind === 'MarketHeatShifted' && e.day === day)
    .map((e) => e.id);

  for (const listing of input.rivalListings) {
    if (listing.status !== 'active') continue;

    const salt = `supply-${day}-${listing.id}`;
    // Reprice probability increases with freshness decay and market pressure
    const repriceChance = 0.08 + (listing.freshness < 40 ? 0.12 : 0) + (listing.daysLeft < 5 ? 0.15 : 0);

    if (!seededChance(salt, repriceChance)) continue;

    const priceDirection = seededChance(`${salt}-dir`, 0.45) ? -1 : 1;
    const magnitude = seededInt(`${salt}-mag`, 2, 12);
    const priceDelta = priceDirection * magnitude;
    const newPrice = Math.max(100, listing.askPrice + priceDelta);

    // Reference upstream environment heat shifts as causes
    const relevantUpstream = upstreamCauseIds.filter((id) => id.includes(listing.marketCellId));

    const repriceEvent = buildRivalListingRepriced(
      `bwe-reprice-${day}-${listing.id}`,
      day,
      {
        listingId: listing.id,
        acnId: `acn-${listing.segment}`,
        oldPrice: listing.askPrice,
        newPrice,
        priceDelta,
        affectedMarketCellIds: [listing.marketCellId],
      },
      { causeEventIds: relevantUpstream },
    );
    causalEvents.push(repriceEvent);

    const dailyEvent = makeDailyEvent(
      day, phase, 'RivalListingRepriced', `listing:${listing.title}`,
      [makeCausalRef(repriceEvent)],
      [repriceEvent.id, ...relevantUpstream],
      'signal',
      {
        listingTitle: listing.title,
        district: listing.district,
        oldPrice: listing.askPrice,
        newPrice,
        priceDelta,
      },
    );
    phaseEvents.push(dailyEvent);
    dailyEvents.push(dailyEvent);
    mutations += 1;
  }

  mutationCounts.set(phase, mutations);
  return Object.freeze({
    phaseId: phase,
    events: Object.freeze(phaseEvents),
    entitiesProcessed: input.rivalListings.filter((l) => l.status === 'active').length,
    mutationCount: mutations,
    durationUs: input.rivalListings.length * 15,
  });
}

// ── Phase 4: CustomerDemandPhase ───────────────────────────────────────

function runCustomerDemandPhase(ctx: PhaseInput): BigWorldTickPhaseResult {
  const { input, causalEvents, dailyEvents, mutationCounts } = ctx;
  const day = input.settledDay;
  const phase: BigWorldTickPhaseId = 'CustomerDemandPhase';
  let mutations = 0;
  const phaseEvents: BigWorldDailyEvent[] = [];

  // Collect upstream cause IDs: rival events from this day
  const upstreamRivalCauseIds = causalEvents
    .filter((e) => (e.kind === 'RivalListingRepriced' || e.kind === 'RivalBrokerActionTaken') && e.day === day)
    .map((e) => e.id);

  for (const customer of input.customerStates) {
    if (customer.status === 'lost' || customer.status === 'converted') continue;

    const salt = `demand-${day}-${customer.customerId}`;

    // Comparison event
    const comparisonChance = 0.25 + (customer.fatigue > 60 ? -0.1 : 0.05);
    if (seededChance(`${salt}-compare`, comparisonChance) && customer.activeCaseIds.length >= 2) {
      const compareEvent = buildCustomerComparedListings(
        `bwe-compare-${day}-${customer.customerId}`,
        day,
        {
          customerId: customer.customerId,
          comparedListingIds: customer.activeCaseIds.slice(0, 3),
          attentionDelta: seededInt(`${salt}-attn`, -8, 5),
          reasonSignals: ['price', 'layout', 'location'].slice(0, seededInt(`${salt}-reasons`, 1, 3)),
        },
        { causeEventIds: upstreamRivalCauseIds.slice(0, 3) },
      );
      causalEvents.push(compareEvent);

      const dailyEvent = makeDailyEvent(
        day, phase, 'CustomerComparedListings', `customer:${customer.customerId}`,
        [makeCausalRef(compareEvent)],
        [compareEvent.id, ...upstreamRivalCauseIds.slice(0, 2)],
        'signal',
        {
          customerId: customer.customerId,
          comparedCount: Math.min(customer.activeCaseIds.length, 3),
          fatigue: customer.fatigue,
        },
      );
      phaseEvents.push(dailyEvent);
      dailyEvents.push(dailyEvent);
      mutations += 1;
    }

    // Attention shift event
    const shiftChance = 0.15 + (customer.churnRisk > 50 ? 0.1 : 0);
    if (seededChance(`${salt}-shift`, shiftChance) && customer.activeCaseIds.length >= 2) {
      const fromIdx = seededInt(`${salt}-from`, 0, customer.activeCaseIds.length - 1);
      let toIdx = seededInt(`${salt}-to`, 0, customer.activeCaseIds.length - 1);
      if (toIdx === fromIdx) toIdx = (toIdx + 1) % customer.activeCaseIds.length;

      // Reference upstream rival events as causes for the shift
      const validShiftCauseIds = upstreamRivalCauseIds.filter((id) => id.startsWith('bwe-'));
      const shiftEventId = `bwe-shift-${day}-${customer.customerId}`;
      const shiftCauseId = validShiftCauseIds.length > 0
        ? validShiftCauseIds[0]
        : shiftEventId; // self-reference if no upstream

      const shiftEvent = buildCustomerAttentionShifted(
        shiftEventId,
        day,
        {
          fromListingIds: [customer.activeCaseIds[fromIdx]],
          toListingIds: [customer.activeCaseIds[toIdx]],
          segment: 'price-sensitive',
          causeEventId: shiftCauseId,
        },
      );
      causalEvents.push(shiftEvent);

      const dailyEvent = makeDailyEvent(
        day, phase, 'CustomerAttentionShifted', `customer:${customer.customerId}`,
        [makeCausalRef(shiftEvent)],
        [shiftEvent.id, ...validShiftCauseIds.slice(0, 2)],
        'signal',
        {
          customerId: customer.customerId,
          fromListing: customer.activeCaseIds[fromIdx],
          toListing: customer.activeCaseIds[toIdx],
          churnRisk: customer.churnRisk,
        },
      );
      phaseEvents.push(dailyEvent);
      dailyEvents.push(dailyEvent);
      mutations += 1;
    }
  }

  mutationCounts.set(phase, mutations);
  return Object.freeze({
    phaseId: phase,
    events: Object.freeze(phaseEvents),
    entitiesProcessed: input.customerStates.length,
    mutationCount: mutations,
    durationUs: input.customerStates.length * 20,
  });
}

// ── Phase 5: OwnerPerceptionPhase ──────────────────────────────────────

function runOwnerPerceptionPhase(ctx: PhaseInput): BigWorldTickPhaseResult {
  const { input, causalEvents, dailyEvents, mutationCounts } = ctx;
  const day = input.settledDay;
  const phase: BigWorldTickPhaseId = 'OwnerPerceptionPhase';
  let mutations = 0;
  const phaseEvents: BigWorldDailyEvent[] = [];

  // Collect upstream cause IDs: customer events from this day
  const upstreamCustomerCauseIds = causalEvents
    .filter((e) => (e.kind === 'CustomerComparedListings' || e.kind === 'CustomerAttentionShifted') && e.day === day)
    .map((e) => e.id);

  // Owner perception has a lag: high-trust owners perceive faster
  for (const caseItem of input.activeCases) {
    const salt = `owner-${day}-${caseItem.id}`;

    // Probability of perceiving pressure depends on heat, trust, and patience
    const heatPressure = caseItem.heat > 70 ? 0.2 : caseItem.heat < 30 ? 0.05 : 0.1;
    const trustFactor = caseItem.trust < 50 ? 0.15 : 0; // Low trust = faster perception
    const patienceFactor = caseItem.patience < 40 ? 0.12 : 0; // Low patience = more reactive
    const perceptionChance = heatPressure + trustFactor + patienceFactor;

    if (!seededChance(`${salt}-perceive`, perceptionChance)) continue;

    // Lag: how many days until owner actually processes this
    const lagDays = seededInt(`${salt}-lag`, 1, 3);
    // Pressure delta: based on environment heat and case's own heat
    const pressureDelta = seededInt(`${salt}-pressure`, 5, 25);
    // Confidence: lower if owner has high trust (less likely to believe negative signals)
    const confidence = Math.max(0.3, Math.min(0.9, 0.7 - (caseItem.trust - 50) * 0.004));

    // Reference upstream customer events as causes for owner perception
    const relevantCustomerCauses = upstreamCustomerCauseIds.slice(0, 2);
    const signalIds = relevantCustomerCauses.length > 0
      ? relevantCustomerCauses
      : [`market-signal-${caseItem.marketCellId}`];

    const perceptionEvent = buildOwnerMarketPressurePerceived(
      `bwe-owner-perceive-${day}-${caseItem.id}`,
      day,
      {
        caseId: caseItem.id,
        perceivedSignalIds: signalIds,
        pressureDelta,
        delayDays: lagDays,
        confidence,
      },
      { causeEventIds: relevantCustomerCauses },
    );
    causalEvents.push(perceptionEvent);

    const dailyEvent = makeDailyEvent(
      day, phase, 'OwnerMarketPressurePerceived', `owner:${caseItem.ownerName}`,
      [makeCausalRef(perceptionEvent)],
      [perceptionEvent.id, ...relevantCustomerCauses],
      'signal',
      {
        caseTitle: caseItem.title,
        ownerName: caseItem.ownerName,
        pressureDelta,
        lagDays,
        trust: caseItem.trust,
        patience: caseItem.patience,
      },
    );
    phaseEvents.push(dailyEvent);
    dailyEvents.push(dailyEvent);
    mutations += 1;
  }

  mutationCounts.set(phase, mutations);
  return Object.freeze({
    phaseId: phase,
    events: Object.freeze(phaseEvents),
    entitiesProcessed: input.activeCases.length,
    mutationCount: mutations,
    durationUs: input.activeCases.length * 18,
  });
}

// ── Phase 6: OpportunityPressurePhase ──────────────────────────────────

function runOpportunityPressurePhase(ctx: PhaseInput): BigWorldTickPhaseResult {
  const { input, mutationCounts } = ctx;
  const day = input.settledDay;
  const phase: BigWorldTickPhaseId = 'OpportunityPressurePhase';
  let mutations = 0;

  // Opportunity pressure is tracked through stagnation and fit changes
  // We count mutations but don't emit separate causal events here
  // (the upstream phases already produced the relevant signals)
  for (const opp of input.activeOpportunities) {
    if (opp.stagnationTicks > 5) mutations += 1; // High stagnation = pressure
    if (opp.intent < 30) mutations += 1; // Low intent = readiness dropping
  }

  mutationCounts.set(phase, mutations);
  return Object.freeze({
    phaseId: phase,
    events: Object.freeze([]),
    entitiesProcessed: input.activeOpportunities.length,
    mutationCount: mutations,
    durationUs: input.activeOpportunities.length * 8,
  });
}

// ── Phase 7: RecommendationPressurePhase ───────────────────────────────

function runRecommendationPressurePhase(ctx: PhaseInput): BigWorldTickPhaseResult {
  const { input, causalEvents, dailyEvents, mutationCounts } = ctx;
  const day = input.settledDay;
  const phase: BigWorldTickPhaseId = 'RecommendationPressurePhase';
  let mutations = 0;
  const phaseEvents: BigWorldDailyEvent[] = [];

  // For each active case, evaluate if recommendation direction should change
  for (const caseItem of input.activeCases) {
    const salt = `rec-${day}-${caseItem.id}`;

    // Recommendation changes when: heat is low, trust is dropping, window is closing
    const heatPressure = caseItem.heat < 40;
    const trustPressure = caseItem.trust < 55;
    const windowPressure = caseItem.windowDays < 7;
    const d1Pressure = caseItem.d1 < 40;

    const shouldRecommend = heatPressure || trustPressure || windowPressure || d1Pressure;
    if (!seededChance(`${salt}-rec`, shouldRecommend ? 0.35 : 0.05)) continue;

    // Determine recommendation kind
    let recKind: 'price_adjustment' | 'push_showing' | 'activate_open_day' | 'escalate_to_manager' | 'wait_and_see';
    if (heatPressure && caseItem.d1 < 30) {
      recKind = 'activate_open_day';
    } else if (trustPressure) {
      recKind = 'push_showing';
    } else if (windowPressure) {
      recKind = 'escalate_to_manager';
    } else if (d1Pressure) {
      recKind = 'price_adjustment';
    } else {
      recKind = 'wait_and_see';
    }

    // Collect upstream causes: owner perception events for this case, plus any rival/customer events
    const ownerPerceptionCauses = causalEvents
      .filter((e) => e.kind === 'OwnerMarketPressurePerceived' && e.day === day && e.affectedIds.includes(caseItem.id))
      .map((e) => e.id);
    const rivalCauses = causalEvents
      .filter((e) => (e.kind === 'RivalListingRepriced' || e.kind === 'RivalBrokerActionTaken') && e.day === day)
      .map((e) => e.id);
    const allUpstreamCauses = [...ownerPerceptionCauses, ...rivalCauses.slice(0, 2)];

    const recEvent = buildBrokerRecommendationChanged(
      `bwe-rec-${day}-${caseItem.id}`,
      day,
      {
        caseId: caseItem.id,
        recommendationKind: recKind,
        causedByEventIds: allUpstreamCauses.length > 0
          ? allUpstreamCauses.slice(0, 4)
          : causalEvents
              .filter((e) => e.affectedIds.includes(caseItem.id) || e.entityIds.includes(caseItem.id))
              .map((e) => e.id)
              .slice(0, 4),
        explanationFacts: [
          heatPressure ? `热度 ${caseItem.heat} 偏低` : '',
          trustPressure ? `信任 ${caseItem.trust} 偏低` : '',
          windowPressure ? `窗口 ${caseItem.windowDays} 天` : '',
          d1Pressure ? `客户线 ${caseItem.d1} 偏低` : '',
        ].filter(Boolean),
      },
    );
    causalEvents.push(recEvent);

    const dailyEvent = makeDailyEvent(
      day, phase, 'BrokerRecommendationChanged', `case:${caseItem.title}`,
      [makeCausalRef(recEvent)],
      [recEvent.id, ...allUpstreamCauses.slice(0, 3)],
      'actionable',
      {
        caseTitle: caseItem.title,
        recommendationKind: recKind,
        heat: caseItem.heat,
        trust: caseItem.trust,
        windowDays: caseItem.windowDays,
      },
    );
    phaseEvents.push(dailyEvent);
    dailyEvents.push(dailyEvent);
    mutations += 1;
  }

  mutationCounts.set(phase, mutations);
  return Object.freeze({
    phaseId: phase,
    events: Object.freeze(phaseEvents),
    entitiesProcessed: input.activeCases.length,
    mutationCount: mutations,
    durationUs: input.activeCases.length * 14,
  });
}

// ── Phase 8: CompactionPhase ───────────────────────────────────────────

function runCompactionPhase(ctx: PhaseInput): BigWorldTickPhaseResult {
  const { causalEvents } = ctx;
  const phase: BigWorldTickPhaseId = 'CompactionPhase';

  // Validate causal chain integrity
  let danglingRefs = 0;
  const allIds = new Set(causalEvents.map((e) => e.id));
  for (const event of causalEvents) {
    for (const causeId of event.causeEventIds) {
      if (!allIds.has(causeId)) danglingRefs += 1;
    }
  }

  return Object.freeze({
    phaseId: phase,
    events: Object.freeze([]),
    entitiesProcessed: causalEvents.length,
    mutationCount: danglingRefs,
    durationUs: causalEvents.length * 2,
  });
}

// ── Phase pipeline ─────────────────────────────────────────────────────

/** All phase IDs in execution order. */
export const TICK_PHASE_ORDER: readonly BigWorldTickPhaseId[] = Object.freeze([
  'EnvironmentPhase',
  'RivalBrokerPhase',
  'ListingSupplyPhase',
  'CustomerDemandPhase',
  'OwnerPerceptionPhase',
  'OpportunityPressurePhase',
  'RecommendationPressurePhase',
  'CompactionPhase',
]);

/** Phase runner function signature. */
type PhaseRunner = (ctx: PhaseInput) => BigWorldTickPhaseResult;

const PHASE_RUNNERS: ReadonlyMap<BigWorldTickPhaseId, PhaseRunner> = new Map([
  ['EnvironmentPhase', runEnvironmentPhase],
  ['RivalBrokerPhase', runRivalBrokerPhase],
  ['ListingSupplyPhase', runListingSupplyPhase],
  ['CustomerDemandPhase', runCustomerDemandPhase],
  ['OwnerPerceptionPhase', runOwnerPerceptionPhase],
  ['OpportunityPressurePhase', runOpportunityPressurePhase],
  ['RecommendationPressurePhase', runRecommendationPressurePhase],
  ['CompactionPhase', runCompactionPhase],
]);

/**
 * Run all 8 phases in sequence.
 * Returns phase results, accumulated daily events, and causal events.
 */
export function runAllPhases(
  input: BigWorldClockInput,
): {
  readonly phaseResults: readonly BigWorldTickPhaseResult[];
  readonly allDailyEvents: readonly BigWorldDailyEvent[];
  readonly allCausalEvents: readonly WorldCausalEvent[];
  readonly totalMutations: number;
} {
  resetEventCounter();

  const ctx: PhaseInput = {
    input,
    marketCellHeats: new Map(
      input.marketCells.map((c) => [c.id, c.demandHeat]),
    ),
    causalEvents: [],
    dailyEvents: [],
    mutationCounts: new Map(),
  };

  const phaseResults: BigWorldTickPhaseResult[] = [];
  for (const phaseId of TICK_PHASE_ORDER) {
    const runner = PHASE_RUNNERS.get(phaseId);
    if (!runner) continue;
    const result = runner(ctx);
    phaseResults.push(result);
  }

  const totalMutations = Array.from(ctx.mutationCounts.values()).reduce((s, n) => s + n, 0);

  return Object.freeze({
    phaseResults: Object.freeze(phaseResults),
    allDailyEvents: Object.freeze([...ctx.dailyEvents]),
    allCausalEvents: Object.freeze([...ctx.causalEvents]),
    totalMutations,
  });
}
