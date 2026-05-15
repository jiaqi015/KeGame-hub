// ---------------------------------------------------------------------------
// marketEconomyBootstrap.ts — derive market economy from formation + bootstrap
//
// This module deterministically computes resource pools and opportunity costs
// from existing bootstrap and formation data.
//
// Every output has:
//   - stable ID (deterministic from seed)
//   - source origin (which bootstrap layer produced it)
//   - replayKey (for deterministic replay)
//   - sourceRef (link to source entity)
//
// Same bootstrap → byte-identical market economy.
//
// Hard constraints:
//   - domain/world-model/ must NOT import runtime/*, application/*, UI/*
//   - No Date.now, Math.random, fetch, or LLM
// ---------------------------------------------------------------------------

import type {
  BigWorldBootstrap,
  EntityProvenance,
  BootstrapSourceRef,
} from './bigWorldTypes.js';
import type { BrokerEntity } from './brokerPopulation.js';
import type { ListingPopulationEntity } from './listingPopulation.js';
import type { CustomerDemandEntity } from './customerDemandField.js';
import type { AcnNetwork } from './acnNetworks.js';
import type {
  BrokerPoolEntry,
  ListingPoolEntry,
  CustomerPoolEntry,
} from './marketFormationTypes.js';
import type {
  MarketEconomyState,
  MarketEconomySummary,
  ResourceScalar,
  BrokerResourcePool,
  SlotCommitment,
  CustomerAttentionAllocation,
  ListingResourcePool,
  ExposureSource,
  CustomerResourcePool,
  OrgResourcePool,
  OpportunityCostEntry,
  CityLevelResourceMetrics,
} from './marketEconomyTypes.js';

// ---------------------------------------------------------------------------
// Deterministic hash helpers (same algorithm as bigWorldBootstrap)
// ---------------------------------------------------------------------------

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

function makeSourceRef(seed: number, entity: string, index: number): BootstrapSourceRef {
  return `ref:${seed}:${entity}:${index}` as BootstrapSourceRef;
}

function makeProvenance(seed: number, entity: string, index: number, origin: EntityProvenance['origin']): EntityProvenance {
  return {
    sourceRef: makeSourceRef(seed, entity, index),
    origin,
    generationSalt: `${entity}-${seed}-${index}`,
  };
}

// ---------------------------------------------------------------------------
// ResourceScalar builders
// ---------------------------------------------------------------------------

function buildResourceScalar(current: number, max: number, dailyInflow: number): ResourceScalar {
  return {
    current: Math.min(current, max),
    max,
    dailyInflow,
    lastDelta: 0,
  };
}

// ---------------------------------------------------------------------------
// Broker Resource Pool
// ---------------------------------------------------------------------------

function buildBrokerResourcePool(
  broker: BrokerEntity,
  brokerPoolEntry: BrokerPoolEntry,
  customers: readonly CustomerDemandEntity[],
  listings: readonly ListingPopulationEntity[],
  seed: number,
  index: number,
): BrokerResourcePool {
  const salt = `brp-${seed}-${broker.brokerId}`;
  const activeBrokerListings = listings.filter(
    (listing) => listing.brokerId === broker.brokerId && listing.status === 'active',
  );
  const cellCustomers = customers.filter((customer) =>
    broker.marketCellIds.includes(customer.targetMarketCellId),
  );
  const managedCustomerCount = Math.min(
    cellCustomers.length,
    Math.max(1, broker.customerPoolSize + seededInt(`${salt}-managed-customers`, -3, 4)),
  );
  const allocatedCustomers = cellCustomers.slice(0, managedCustomerCount);
  const listingLoadPct = Math.min(1.25, activeBrokerListings.length / Math.max(1, broker.listingPoolSize));
  const customerLoadPct = Math.min(1.25, managedCustomerCount / Math.max(1, broker.customerPoolSize));
  const workloadPct = Math.min(0.96, listingLoadPct * 0.38 + customerLoadPct * 0.34 + Math.abs(broker.actionBias) / 650);

  // Time slots: 2 per day (AM/PM), scaled by energy budget
  const committedSlotCount = Math.min(2, Math.max(0, Math.round(workloadPct * 2)));
  const timeSlots = buildResourceScalar(Math.max(0, 2 - committedSlotCount), 2, 2);

  // Energy: workload consumes part of the daily budget even before new actions.
  const committedEnergy = Math.round(broker.energyBudget * (0.18 + workloadPct * 0.72));
  const energy = buildResourceScalar(
    Math.max(0, broker.energyBudget - committedEnergy),
    broker.energyBudget,
    Math.round(broker.energyBudget * 0.7),
  );

  // Promotion budget: named brokers get more, shadow brokers get less
  const baseBudget = broker.visibility === 'named' ? 18 : 8;
  const promotionPressure = Math.round(
    activeBrokerListings.reduce((sum, listing) => sum + listing.competitiveness, 0) / Math.max(1, activeBrokerListings.length) / 12,
  );
  const promotionBudget = buildResourceScalar(Math.max(0, baseBudget - promotionPressure), baseBudget * 2, 4);

  // Org credit: based on style and ACN
  const orgCreditBase = brokerPoolEntry.state === 'cooperation_focused' ? 40
    : brokerPoolEntry.state === 'competition_focused' ? 20
    : 30;
  const orgCredit = buildResourceScalar(Math.max(0, orgCreditBase - Math.round(workloadPct * 12)), 100, 5);

  // Cooperation capacity: based on style
  const coopBase = brokerPoolEntry.state === 'cooperation_focused' ? 60
    : brokerPoolEntry.state === 'competition_focused' ? 20
    : 40;
  const cooperationCapacity = buildResourceScalar(Math.max(0, coopBase - Math.round(workloadPct * 18)), 100, 10);

  // Customer attention: based on customerPoolSize
  const customerAttentionMax = broker.customerPoolSize * 15;
  const committedAttention = Math.min(
    customerAttentionMax,
    allocatedCustomers.length * 8 + activeBrokerListings.length * 6,
  );
  const customerAttention = buildResourceScalar(
    Math.max(0, customerAttentionMax - committedAttention),
    customerAttentionMax,
    broker.customerPoolSize * 2,
  );

  // Customer allocations: distribute attention across customers in this broker's cells
  const customerAllocations: CustomerAttentionAllocation[] = allocatedCustomers.map((customer, customerIndex) => ({
    customerId: customer.customerId,
    caseId: `case-${customer.customerId}`,
    attentionShare: Math.round(100 / Math.max(1, allocatedCustomers.length)),
    daysSinceLastInteraction: seededInt(`${salt}-interact-${customerIndex}`, 0, 5),
    interceptionRisk: seededInt(`${salt}-risk-${customerIndex}`, 10, 60),
  }));

  // Slot commitments: deterministic baseline commitments from existing listing load.
  const slotCommitments: SlotCommitment[] = activeBrokerListings
    .slice(0, committedSlotCount)
    .map((listing, slotIndex) => ({
      slotIndex,
      caseId: listing.linkedCaseId ?? listing.listingId,
      actionType: seededInt(`${salt}-slot-${slotIndex}`, 0, 1) === 0 ? 'owner_followup' : 'customer_showing',
    }));

  // Bottleneck: find the most constrained resource
  const resources = [
    { name: 'timeSlots', pct: timeSlots.current / Math.max(1, timeSlots.max) },
    { name: 'energy', pct: energy.current / Math.max(1, energy.max) },
    { name: 'promotionBudget', pct: promotionBudget.current / Math.max(1, promotionBudget.max) },
    { name: 'customerAttention', pct: customerAttention.current / Math.max(1, customerAttention.max) },
  ];
  const bottleneck = resources.reduce((min, r) => r.pct < min.pct ? r : min, resources[0]);

  // Utilization: inverse of available capacity
  const utilizationPct = Math.round(
    (1 - (timeSlots.current / Math.max(1, timeSlots.max))) * 25 +
    (1 - (energy.current / Math.max(1, energy.max))) * 25 +
    (1 - (promotionBudget.current / Math.max(1, promotionBudget.max))) * 20 +
    (1 - (customerAttention.current / Math.max(1, customerAttention.max))) * 30,
  );

  return Object.freeze({
    poolId: `brp-${broker.brokerId}`,
    brokerId: broker.brokerId,
    acnId: broker.acnId,
    timeSlots,
    slotCommitments,
    energy,
    promotionBudget,
    orgCredit,
    cooperationCapacity,
    customerAttention,
    customerAllocations,
    bottleneckResource: bottleneck.name,
    utilizationPct: Math.min(100, Math.max(0, utilizationPct)),
    provenance: makeProvenance(seed, 'broker_pool', index, 'broker_population'),
    replayKey: `rk-brp-${seed}-${broker.brokerId}`,
  });
}

// ---------------------------------------------------------------------------
// Listing Resource Pool
// ---------------------------------------------------------------------------

function buildListingResourcePool(
  listing: ListingPopulationEntity,
  listingPoolEntry: ListingPoolEntry,
  allListings: readonly ListingPopulationEntity[],
  seed: number,
  index: number,
): ListingResourcePool {
  const salt = `lrp-${seed}-${listing.listingId}`;

  // Exposure: based on competitiveness and liquidity
  const exposureBase = Math.round(listing.competitiveness * 0.6 + listing.liquidity * 0.4);
  const exposure = buildResourceScalar(exposureBase, 100, 5);

  // Exposure sources
  const exposureSources: ExposureSource[] = [
    { sourceType: 'platform', strength: seededInt(`${salt}-platform`, 30, 80), daysSinceLastRefresh: seededInt(`${salt}-plat-days`, 0, 3) },
    { sourceType: 'broker_network', strength: seededInt(`${salt}-network`, 20, 70), daysSinceLastRefresh: seededInt(`${salt}-net-days`, 0, 5) },
  ];
  if (listing.competitiveness > 60) {
    exposureSources.push({ sourceType: 'open_day', strength: seededInt(`${salt}-openday`, 40, 90), daysSinceLastRefresh: seededInt(`${salt}-od-days`, 0, 7) });
  }

  // Showing slots: 2-4 per day based on liquidity
  const showingSlotMax = listing.liquidity > 60 ? 4 : listing.liquidity > 40 ? 3 : 2;
  const showingSlots = buildResourceScalar(showingSlotMax, showingSlotMax, showingSlotMax);

  // Bargaining window: tied to owner rigidity (inverse)
  const bargainingBase = Math.max(10, 100 - listing.ownerRigidity);
  const bargainingWindow = buildResourceScalar(bargainingBase, 100, 2);

  // Owner trust: starts at a baseline
  const trustBase = seededInt(`${salt}-trust`, 40, 70);
  const ownerTrust = buildResourceScalar(trustBase, 100, 1);

  // Rival pressure: count competitors in same cell+priceBand
  const competitors = allListings.filter((l) =>
    l.marketCellId === listing.marketCellId &&
    l.priceBand === listing.priceBand &&
    l.status === 'active' &&
    l.listingId !== listing.listingId,
  );
  const rivalPressure = competitors.length > 0
    ? Math.round(competitors.reduce((sum, l) => sum + l.competitiveness, 0) / competitors.length)
    : 0;

  // Velocity score: composite of exposure, liquidity, competitiveness
  const velocityScore = Math.round(
    exposureBase * 0.4 + listing.liquidity * 0.3 + listing.competitiveness * 0.3,
  );

  // Bottleneck
  const resources = [
    { name: 'exposure', pct: exposure.current / Math.max(1, exposure.max) },
    { name: 'bargainingWindow', pct: bargainingWindow.current / Math.max(1, bargainingWindow.max) },
    { name: 'ownerTrust', pct: ownerTrust.current / Math.max(1, ownerTrust.max) },
  ];
  const bottleneck = resources.reduce((min, r) => r.pct < min.pct ? r : min, resources[0]);

  return Object.freeze({
    poolId: `lrp-${listing.listingId}`,
    listingId: listing.listingId,
    marketCellId: listing.marketCellId,
    exposure,
    exposureSources,
    showingSlots,
    committedShowings: 0,
    bargainingWindow,
    concessionPotential: Math.round(bargainingBase * 0.3),
    ownerTrust,
    rivalPressure,
    directCompetitorCount: competitors.length,
    velocityScore,
    bottleneckResource: bottleneck.name,
    provenance: makeProvenance(seed, 'listing_pool', index, 'listing_population'),
    replayKey: `rk-lrp-${seed}-${listing.listingId}`,
  });
}

// ---------------------------------------------------------------------------
// Customer Resource Pool
// ---------------------------------------------------------------------------

function buildCustomerResourcePool(
  customer: CustomerDemandEntity,
  customerPoolEntry: CustomerPoolEntry,
  allListings: readonly ListingPopulationEntity[],
  seed: number,
  index: number,
): CustomerResourcePool {
  const salt = `crp-${seed}-${customer.customerId}`;

  // Attention budget: how many listings can this customer evaluate
  const attentionMax = customer.decisionStyle === 'cautious' ? 8
    : customer.decisionStyle === 'decisive' ? 4
    : 6;
  const attentionBudget = buildResourceScalar(attentionMax, attentionMax, 0);

  // Viewing capacity: physical viewing slots
  const viewingMax = customer.urgency > 70 ? 3 : customer.urgency > 40 ? 2 : 1;
  const viewingCapacity = buildResourceScalar(viewingMax, viewingMax, viewingMax);

  // Budget flexibility
  const flexibilityBase = customer.priceSensitivity < 50 ? 30 : customer.priceSensitivity < 75 ? 15 : 5;
  const budgetFlexibility = buildResourceScalar(flexibilityBase, 100, 0);

  // Time window
  const windowDays = customer.urgency > 70 ? 14 : customer.urgency > 40 ? 21 : 30;
  const timeWindow = buildResourceScalar(windowDays, windowDays, 0);

  // Interception risk: based on how many rival brokers cover this cell
  const cellListings = allListings.filter((l) =>
    l.marketCellId === customer.targetMarketCellId && l.status === 'active',
  );
  const rivalBrokersInCell = new Set(cellListings.map((l) => l.brokerId));
  const competitionRisk = Math.min(42, rivalBrokersInCell.size * 2);
  const urgencyRisk = Math.round(customer.urgency * 0.25);
  const sensitivityRisk = Math.round(customer.priceSensitivity * 0.1);
  const behaviorVariance = seededInt(`${salt}-interception-variance`, -12, 14);
  const interceptionRisk = Math.min(100, Math.max(5, Math.round(
    competitionRisk + urgencyRisk + sensitivityRisk + behaviorVariance,
  )));

  // Decision fatigue: based on how many options exist
  const optionCount = cellListings.filter((l) =>
    l.priceBand === `${customer.budgetMin < 200 ? 'under_200w' : customer.budgetMin < 400 ? '200w_400w' : customer.budgetMin < 600 ? '400w_600w' : customer.budgetMin < 800 ? '600w_800w' : '800w_1000w'}`,
  ).length;
  const fatigueBase = Math.min(100, optionCount * 8);
  const decisionFatigue = buildResourceScalar(fatigueBase, 100, -5); // decays per day

  // Conversion probability
  const conversionProbability = Math.round(
    (customer.urgency * 0.3 +
    (100 - customer.priceSensitivity) * 0.2 +
    (100 - interceptionRisk) * 0.2 +
    (100 - fatigueBase) * 0.15 +
    flexibilityBase * 0.15),
  );

  // Bottleneck
  const resources = [
    { name: 'attentionBudget', pct: attentionBudget.current / Math.max(1, attentionBudget.max) },
    { name: 'viewingCapacity', pct: viewingCapacity.current / Math.max(1, viewingCapacity.max) },
    { name: 'timeWindow', pct: timeWindow.current / Math.max(1, timeWindow.max) },
  ];
  const bottleneck = resources.reduce((min, r) => r.pct < min.pct ? r : min, resources[0]);

  return Object.freeze({
    poolId: `crp-${customer.customerId}`,
    customerId: customer.customerId,
    targetMarketCellId: customer.targetMarketCellId,
    attentionBudget,
    evaluatedCount: 0,
    viewingCapacity,
    scheduledViewings: 0,
    budgetFlexibility,
    timeWindow,
    urgency: customer.urgency,
    interceptionRisk,
    rivalBrokersTargeting: [...rivalBrokersInCell].slice(0, 5),
    decisionFatigue,
    conversionProbability,
    bottleneckResource: bottleneck.name,
    provenance: makeProvenance(seed, 'customer_pool', index, 'demand_field'),
    replayKey: `rk-crp-${seed}-${customer.customerId}`,
  });
}

// ---------------------------------------------------------------------------
// Org Resource Pool
// ---------------------------------------------------------------------------

function buildOrgResourcePool(
  acn: AcnNetwork,
  brokers: readonly BrokerEntity[],
  seed: number,
  index: number,
): OrgResourcePool {
  const salt = `orp-${seed}-${acn.id}`;
  const acnBrokers = brokers.filter((b) => b.acnId === acn.id);

  // Focus meeting slots: 2-4 per week based on ACN size
  const focusSlots = Math.min(4, Math.max(2, Math.floor(acnBrokers.length / 5)));
  const focusMeetingSlots = buildResourceScalar(focusSlots, focusSlots, focusSlots);

  // Promotion pool: sum of broker budgets
  const totalBudget = acnBrokers.reduce((sum, b) => sum + (b.visibility === 'named' ? 18 : 8), 0);
  const promotionPool = buildResourceScalar(totalBudget, totalBudget * 2, Math.round(totalBudget * 0.3));

  // Manager intervention: 1-3 per week
  const interventionMax = Math.min(3, Math.max(1, Math.floor(acnBrokers.length / 8)));
  const managerIntervention = buildResourceScalar(interventionMax, interventionMax, interventionMax);

  // Cross-store cooperation: based on ACN cooperation bias
  const coopBase = seededInt(`${salt}-coop`, 20, 60);
  const crossStoreCooperation = buildResourceScalar(coopBase, 100, 10);

  // Utilization
  const utilizationPct = Math.round(
    (1 - (focusMeetingSlots.current / Math.max(1, focusMeetingSlots.max))) * 40 +
    (1 - (promotionPool.current / Math.max(1, promotionPool.max))) * 30 +
    (1 - (managerIntervention.current / Math.max(1, managerIntervention.max))) * 30,
  );

  return Object.freeze({
    poolId: `orp-${acn.id}`,
    acnId: acn.id,
    acnName: acn.name,
    focusMeetingSlots,
    submittedCases: [],
    promotionPool,
    perBrokerAllocationLimit: Math.round(totalBudget / Math.max(1, acnBrokers.length)),
    managerIntervention,
    pendingInterventions: [],
    crossStoreCooperation,
    activeCooperations: [],
    utilizationPct: Math.min(100, Math.max(0, utilizationPct)),
    provenance: makeProvenance(seed, 'org_pool', index, 'acn_network'),
    replayKey: `rk-orp-${seed}-${acn.id}`,
  });
}

// ---------------------------------------------------------------------------
// Opportunity Cost Matrix
// ---------------------------------------------------------------------------

function buildOpportunityCosts(
  broker: BrokerEntity,
  brokerPool: BrokerResourcePool,
  listings: readonly ListingPopulationEntity[],
  customers: readonly CustomerDemandEntity[],
  seed: number,
): OpportunityCostEntry[] {
  const entries: OpportunityCostEntry[] = [];
  const brokerListings = listings.filter((l) => l.brokerId === broker.brokerId).slice(0, 5);
  const brokerCustomers = customers.filter((c) => c.brokerId === broker.brokerId).slice(0, 3);

  // For each listing-action pair, compute opportunity cost
  for (let i = 0; i < brokerListings.length; i += 1) {
    const listing = brokerListings[i];
    const salt = `oce-${seed}-${broker.brokerId}-${listing.listingId}`;

    const energyCost = seededInt(`${salt}-energy`, 1, 2);
    const budgetCost = seededInt(`${salt}-budget`, 0, 3);
    const timeSlotCost = 1;
    const attentionCost = Math.round(100 / Math.max(1, broker.customerPoolSize));

    const expectedTrustGain = seededInt(`${salt}-trust`, 2, 8);
    const expectedHeatGain = seededInt(`${salt}-heat`, 3, 12);
    const expectedStageProgress = seededInt(`${salt}-stage`, 0, 1);
    const expectedConversionLift = seededInt(`${salt}-conv`, 2, 10);

    // Unserved cases: other listings this broker manages
    const unservedCases = brokerListings
      .filter((l) => l.listingId !== listing.listingId)
      .map((l) => l.listingId)
      .slice(0, 3);

    // Interception risk: customers who might go to rivals
    const interceptionRiskCases = brokerCustomers
      .filter((c) => c.urgency > 60)
      .map((c) => c.customerId)
      .slice(0, 2);

    const untouchedTrustDecay = unservedCases.length * 2;

    const netValue = Math.round(
      expectedTrustGain * 2 + expectedHeatGain * 1.5 + expectedStageProgress * 10 + expectedConversionLift * 2
      - untouchedTrustDecay * 1.5 - interceptionRiskCases.length * 5,
    );

    entries.push({
      entryId: `oce-${broker.brokerId}-${listing.listingId}`,
      actionId: `showing-${listing.listingId}`,
      caseId: listing.listingId,
      energyCost,
      budgetCost,
      timeSlotCost,
      attentionCost,
      expectedTrustGain,
      expectedHeatGain,
      expectedStageProgress,
      expectedConversionLift,
      unservedCases,
      interceptionRiskCases,
      untouchedTrustDecay,
      netValue: Math.max(0, Math.min(100, netValue)),
      isOptimal: false, // set below
      provenance: makeProvenance(seed, 'opportunity_cost', entries.length, 'broker_population'),
      replayKey: `rk-oce-${seed}-${broker.brokerId}-${listing.listingId}`,
    });
  }

  // Customer follow-up opportunity costs: attention is scarce too.
  for (let customerIndex = 0; customerIndex < brokerCustomers.length; customerIndex += 1) {
    const customer = brokerCustomers[customerIndex];
    const salt = `oce-customer-${seed}-${broker.brokerId}-${customer.customerId}`;
    const urgentListing = brokerListings[customerIndex % Math.max(1, brokerListings.length)];
    const energyCost = seededInt(`${salt}-energy`, 1, 3);
    const budgetCost = seededInt(`${salt}-budget`, 0, 2);
    const timeSlotCost = 1;
    const attentionCost = seededInt(`${salt}-attention`, 12, 28);
    const unservedCases = brokerListings
      .filter((listing) => listing.listingId !== urgentListing?.listingId)
      .map((listing) => listing.listingId)
      .slice(0, 3);
    const interceptionRiskCases = brokerCustomers
      .filter((candidate) => candidate.customerId !== customer.customerId && candidate.urgency > 55)
      .map((candidate) => candidate.customerId)
      .slice(0, 3);
    const untouchedTrustDecay = unservedCases.length + Math.round(customer.priceSensitivity / 35);
    const expectedConversionLift = seededInt(`${salt}-conv`, 4, 14);
    const netValue = Math.round(
      customer.urgency * 0.25 +
      expectedConversionLift * 2 +
      (100 - customer.priceSensitivity) * 0.12 -
      untouchedTrustDecay * 2 -
      interceptionRiskCases.length * 4,
    );

    entries.push({
      entryId: `oce-${broker.brokerId}-${customer.customerId}`,
      actionId: `followup-${customer.customerId}`,
      caseId: urgentListing?.listingId ?? customer.customerId,
      energyCost,
      budgetCost,
      timeSlotCost,
      attentionCost,
      expectedTrustGain: seededInt(`${salt}-trust`, 0, 4),
      expectedHeatGain: seededInt(`${salt}-heat`, 0, 6),
      expectedStageProgress: customer.urgency > 60 ? 1 : 0,
      expectedConversionLift,
      unservedCases,
      interceptionRiskCases,
      untouchedTrustDecay,
      netValue: Math.max(0, Math.min(100, netValue)),
      isOptimal: false,
      provenance: makeProvenance(seed, 'opportunity_cost', entries.length, 'demand_field'),
      replayKey: `rk-oce-${seed}-${broker.brokerId}-${customer.customerId}`,
    });
  }

  // Mark the highest netValue entry as optimal
  if (entries.length > 0) {
    const bestIdx = entries.reduce((best, e, i) => e.netValue > entries[best].netValue ? i : best, 0);
    (entries[bestIdx] as { isOptimal: boolean }).isOptimal = true;
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Main: buildMarketEconomy
// ---------------------------------------------------------------------------

/**
 * Build MarketEconomyState from a BigWorldBootstrap and pool data.
 *
 * This is the canonical entrypoint for market economy derivation.
 * Same bootstrap → byte-identical market economy.
 *
 * Every entry has stable ID, provenance, replayKey, and sourceRef.
 * Every resource has current/max/delta for runtime tracking.
 */
export function buildMarketEconomy(
  bootstrap: BigWorldBootstrap,
  pools: {
    readonly brokerPool: readonly BrokerPoolEntry[];
    readonly listingPool: readonly ListingPoolEntry[];
    readonly customerPool: readonly CustomerPoolEntry[];
  },
): MarketEconomyState {
  const seed = bootstrap.causalBaseline.seed;
  const brokers = bootstrap.materializedEntities.brokers;
  const listings = bootstrap.materializedEntities.listings;
  const customers = bootstrap.materializedEntities.customers;
  const acnProfiles = bootstrap.hiddenTruth.acnProfiles;

  // Build broker resource pools
  const brokerPools: BrokerResourcePool[] = [];
  for (let i = 0; i < brokers.length; i += 1) {
    const broker = brokers[i];
    const poolEntry = pools.brokerPool.find((bp) => bp.brokerId === broker.brokerId);
    if (poolEntry) {
      brokerPools.push(buildBrokerResourcePool(broker, poolEntry, customers, listings, seed, i));
    }
  }

  // Build listing resource pools
  const listingPools: ListingResourcePool[] = [];
  for (let i = 0; i < listings.length; i += 1) {
    const listing = listings[i];
    const poolEntry = pools.listingPool.find((lp) => lp.listingId === listing.listingId);
    if (poolEntry) {
      listingPools.push(buildListingResourcePool(listing, poolEntry, listings, seed, i));
    }
  }

  // Build customer resource pools
  const customerPools: CustomerResourcePool[] = [];
  for (let i = 0; i < customers.length; i += 1) {
    const customer = customers[i];
    const poolEntry = pools.customerPool.find((cp) => cp.customerId === customer.customerId);
    if (poolEntry) {
      customerPools.push(buildCustomerResourcePool(customer, poolEntry, listings, seed, i));
    }
  }

  // Build org resource pools
  const orgPools: OrgResourcePool[] = [];
  for (let i = 0; i < acnProfiles.length; i += 1) {
    orgPools.push(buildOrgResourcePool(acnProfiles[i], brokers, seed, i));
  }

  // Build opportunity cost entries (top 3 per named broker)
  const namedBrokers = brokers.filter((b) => b.visibility === 'named');
  const opportunityCosts: OpportunityCostEntry[] = [];
  for (const broker of namedBrokers) {
    const brokerPool = brokerPools.find((bp) => bp.brokerId === broker.brokerId);
    if (brokerPool) {
      opportunityCosts.push(...buildOpportunityCosts(broker, brokerPool, listings, customers, seed));
    }
  }

  // Aggregate metrics
  const avgBrokerUtilization = brokerPools.length > 0
    ? Math.round(brokerPools.reduce((sum, bp) => sum + bp.utilizationPct, 0) / brokerPools.length)
    : 0;
  const avgListingVelocity = listingPools.length > 0
    ? Math.round(listingPools.reduce((sum, lp) => sum + lp.velocityScore, 0) / listingPools.length)
    : 0;
  const avgConversionProbability = customerPools.length > 0
    ? Math.round(customerPools.reduce((sum, cp) => sum + cp.conversionProbability, 0) / customerPools.length)
    : 0;
  const bottleneckedBrokerCount = brokerPools.filter((bp) => bp.utilizationPct > 80).length;
  const atRiskCustomerCount = customerPools.filter((cp) => cp.interceptionRisk > 50).length;

  // Resource flow
  const totalDailyEnergyInflow = brokerPools.reduce((sum, bp) => sum + bp.energy.dailyInflow, 0);
  const totalDailyEnergyOutflow = brokerPools.reduce((sum, bp) => sum + bp.energy.current, 0);
  const totalWeeklyBudgetInflow = orgPools.reduce((sum, op) => sum + op.promotionPool.dailyInflow * 7, 0);
  const totalWeeklyBudgetOutflow = orgPools.reduce((sum, op) => sum + op.promotionPool.current, 0);

  return Object.freeze({
    brokerPools,
    listingPools,
    customerPools,
    orgPools,
    opportunityCosts,
    avgBrokerUtilization,
    avgListingVelocity,
    avgConversionProbability,
    totalOpportunityCosts: opportunityCosts.length,
    bottleneckedBrokerCount,
    atRiskCustomerCount,
    totalDailyEnergyInflow,
    totalDailyEnergyOutflow,
    totalWeeklyBudgetInflow,
    totalWeeklyBudgetOutflow,
    replayKey: `rk-me-${seed}`,
  });
}

// ---------------------------------------------------------------------------
// buildCityLevelResourceMetrics — city-wide economic density
// ---------------------------------------------------------------------------

/**
 * Build city-level resource metrics from an existing MarketEconomyState.
 * Aggregates all resource pools into city-wide totals and averages.
 *
 * Used by R19 gate to verify the economy scales to city-level.
 */
export function buildCityLevelResourceMetrics(
  economy: MarketEconomyState,
): CityLevelResourceMetrics {
  const totalBrokerEnergy = economy.brokerPools.reduce(
    (sum, bp) => sum + bp.energy.current, 0,
  );
  const totalPromotionBudget = economy.orgPools.reduce(
    (sum, op) => sum + op.promotionPool.current, 0,
  );
  const totalOrgCredit = economy.orgPools.reduce(
    (sum, op) => sum + op.focusMeetingSlots.current, 0,
  );
  const totalCustomerAttentionCapacity = economy.brokerPools.reduce(
    (sum, bp) => sum + bp.customerAttention.current, 0,
  );
  const totalListingExposure = economy.listingPools.reduce(
    (sum, lp) => sum + lp.exposure.current, 0,
  );
  const totalOwnerTrust = economy.listingPools.reduce(
    (sum, lp) => sum + lp.ownerTrust.current, 0,
  );

  const meetsCityLevelThresholds =
    economy.brokerPools.length >= 750 &&
    economy.listingPools.length >= 4000 &&
    economy.customerPools.length >= 2000 &&
    economy.orgPools.length >= 30 &&
    economy.opportunityCosts.length >= 500 &&
    economy.bottleneckedBrokerCount >= 20 &&
    economy.atRiskCustomerCount >= 500 &&
    totalBrokerEnergy > 0 &&
    totalPromotionBudget > 0;

  return Object.freeze({
    totalBrokerEnergy,
    totalPromotionBudget,
    totalOrgCredit,
    totalCustomerAttentionCapacity,
    totalListingExposure,
    totalOwnerTrust,
    cityAvgBrokerUtilization: economy.avgBrokerUtilization,
    cityAvgListingVelocity: economy.avgListingVelocity,
    cityAvgConversionProbability: economy.avgConversionProbability,
    cityTotalOpportunityCosts: economy.opportunityCosts.length,
    bottleneckedBrokerCount: economy.bottleneckedBrokerCount,
    atRiskCustomerCount: economy.atRiskCustomerCount,
    meetsCityLevelThresholds,
    replayKey: `rk-clrm-${economy.brokerPools.length}-${economy.listingPools.length}`,
  });
}

// ---------------------------------------------------------------------------
// buildMarketEconomySummary — compact persistable summary
// ---------------------------------------------------------------------------

/**
 * Build a compact MarketEconomySummary from a MarketEconomyState.
 * Safe to persist in save files.
 */
export function buildMarketEconomySummary(
  economy: MarketEconomyState,
): MarketEconomySummary {
  return {
    brokerPoolCount: economy.brokerPools.length,
    listingPoolCount: economy.listingPools.length,
    customerPoolCount: economy.customerPools.length,
    orgPoolCount: economy.orgPools.length,
    opportunityCostCount: economy.opportunityCosts.length,
    avgBrokerUtilization: economy.avgBrokerUtilization,
    avgListingVelocity: economy.avgListingVelocity,
    avgConversionProbability: economy.avgConversionProbability,
    bottleneckedBrokerCount: economy.bottleneckedBrokerCount,
    atRiskCustomerCount: economy.atRiskCustomerCount,
    totalDailyEnergyInflow: economy.totalDailyEnergyInflow,
    totalDailyEnergyOutflow: economy.totalDailyEnergyOutflow,
    totalWeeklyBudgetInflow: economy.totalWeeklyBudgetInflow,
    totalWeeklyBudgetOutflow: economy.totalWeeklyBudgetOutflow,
    meetsMarketEconomyThresholds: {
      brokerPoolsGte50: economy.brokerPools.length >= 50,
      listingPoolsGte100: economy.listingPools.length >= 100,
      customerPoolsGte100: economy.customerPools.length >= 100,
      orgPoolsGte5: economy.orgPools.length >= 5,
      opportunityCostsGte50: economy.opportunityCosts.length >= 50,
      avgBrokerUtilizationGte30: economy.avgBrokerUtilization >= 30,
      avgListingVelocityGte20: economy.avgListingVelocity >= 20,
      avgConversionProbabilityGte10: economy.avgConversionProbability >= 10,
      bottleneckedBrokersGte5: economy.bottleneckedBrokerCount >= 5,
      atRiskCustomersGte10: economy.atRiskCustomerCount >= 10,
      energyFlowBalanced: economy.totalDailyEnergyInflow > 0 && economy.totalDailyEnergyOutflow > 0,
      budgetFlowBalanced: economy.totalWeeklyBudgetInflow > 0 && economy.totalWeeklyBudgetOutflow > 0,
    },
    ledgerReady: true,
    meetsCityLevelEconomyThresholds: {
      brokerPoolsGte750: economy.brokerPools.length >= 750,
      listingPoolsGte4000: economy.listingPools.length >= 4000,
      customerPoolsGte2000: economy.customerPools.length >= 2000,
      orgPoolsGte30: economy.orgPools.length >= 30,
      opportunityCostsGte500: economy.opportunityCosts.length >= 500,
      bottleneckedBrokersGte20: economy.bottleneckedBrokerCount >= 20,
      atRiskCustomersGte500: economy.atRiskCustomerCount >= 500,
      cityWideEnergyBalance: economy.totalDailyEnergyInflow > 0 && economy.totalDailyEnergyOutflow > 0,
      cityWideBudgetBalance: economy.totalWeeklyBudgetInflow > 0 && economy.totalWeeklyBudgetOutflow > 0,
    },
  };
}
