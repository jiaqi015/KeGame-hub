// ---------------------------------------------------------------------------
// marketFormationBootstrap.ts — derive market formation from bootstrap data
//
// This module deterministically classifies existing bootstrap entities into
// market formation pools and computes per-cell thickness metrics.
//
// Every output has:
//   - stable ID (deterministic from seed)
//   - source origin (which bootstrap layer produced it)
//   - replayKey (for deterministic replay)
//   - sourceRef (link to source entity)
//
// Same bootstrap → byte-identical market formation.
//
// Hard constraints:
//   - domain/world-model/ must NOT import runtime/*, application/*, UI/*
//   - No Date.now, Math.random, fetch, or LLM
// ---------------------------------------------------------------------------

import type {
  BigWorldBootstrap,
  OwnerProfilePrior,
  OwnerExpectationAnchor,
  EntityProvenance,
  BootstrapSourceRef,
} from './bigWorldTypes.js';
import type {
  ListingPopulationEntity,
  HistoricalTransactionSummary,
} from './listingPopulation.js';
import type {
  CustomerDemandEntity,
} from './customerDemandField.js';
import type {
  BrokerEntity,
} from './brokerPopulation.js';
import type {
  MarketFormationState,
  MarketFormationSummary,
  ListingPoolEntry,
  ListingPoolState,
  OwnerPoolEntry,
  OwnerPoolState,
  CustomerPoolEntry,
  CustomerPoolState,
  BrokerPoolEntry,
  BrokerPoolState,
  MarketCellThickness,
  ListingLifecycleDistribution,
  OwnerUrgencyDistribution,
  CustomerSegmentDistribution,
} from './marketFormationTypes.js';

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
// Listing Pool Classification
// ---------------------------------------------------------------------------

function classifyListingState(
  listing: ListingPopulationEntity,
  competitorCount: number,
  hasComparableSupply: boolean,
): ListingPoolState {
  // Price reduced: askPrice significantly below marketPrice
  if (listing.askPrice < listing.marketPrice * 0.95) return 'price_reduced';

  // Stale: daysOnMarket > 30 AND low liquidity
  if (listing.daysOnMarket > 30 && listing.liquidity < 50) return 'stale';

  // Scarce: no comparable supply in same cell+priceBand
  if (!hasComparableSupply) return 'scarce';

  // Fresh: daysOnMarket <= 7 AND decent liquidity
  if (listing.daysOnMarket <= 7 && listing.liquidity >= 60) return 'fresh';

  // Hot: high competitiveness AND high liquidity
  if (listing.competitiveness >= 70 && listing.liquidity >= 60) return 'hot';

  // Cold: low liquidity OR low competitiveness
  if (listing.liquidity < 40 || listing.competitiveness < 30) return 'cold';

  // Warm: everything else
  return 'warm';
}

function buildListingPool(
  bootstrap: BigWorldBootstrap,
  seed: number,
): ListingPoolEntry[] {
  const listings = bootstrap.materializedEntities.listings;
  const entries: ListingPoolEntry[] = [];

  // Build lookup: cellId+priceBand → count (for comparable supply)
  const comparableSupplyMap = new Map<string, number>();
  for (const listing of listings) {
    if (listing.status !== 'active') continue;
    const key = `${listing.marketCellId}:${listing.priceBand}`;
    comparableSupplyMap.set(key, (comparableSupplyMap.get(key) ?? 0) + 1);
  }

  // Build lookup: cellId+priceBand → competitor count
  const competitorMap = new Map<string, number>();
  for (const listing of listings) {
    if (listing.status !== 'active') continue;
    const key = `${listing.marketCellId}:${listing.priceBand}`;
    competitorMap.set(key, (competitorMap.get(key) ?? 0) + 1);
  }

  for (let i = 0; i < listings.length; i += 1) {
    const listing = listings[i];
    const key = `${listing.marketCellId}:${listing.priceBand}`;
    const competitorCount = competitorMap.get(key) ?? 0;
    const hasComparableSupply = (comparableSupplyMap.get(key) ?? 0) > 1;
    const state = classifyListingState(listing, competitorCount, hasComparableSupply);

    entries.push({
      entryId: `lpe-${listing.listingId}`,
      listingId: listing.listingId,
      state,
      marketCellId: listing.marketCellId,
      priceBand: listing.priceBand,
      layout: listing.layout,
      daysOnMarket: listing.daysOnMarket,
      competitiveness: listing.competitiveness,
      liquidity: listing.liquidity,
      hasComparableSupply,
      competitorCount,
      provenance: makeProvenance(seed, 'listing_pool', i, 'listing_population'),
      replayKey: `rk-lpe-${seed}-${listing.listingId}`,
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Owner Pool Classification
// ---------------------------------------------------------------------------

function classifyOwnerState(prior: OwnerProfilePrior): OwnerPoolState {
  // Urgent: high urgency OR short time window
  if (prior.expectedUrgencyBaseline >= 70 || prior.timeWindow === 'short') return 'urgent';

  // Financial stress
  if (prior.type === 'emotional_urgent' || prior.type === 'high_risk失控' || prior.type === 'deal_dependent') return 'financial_stress';

  // Stubborn: high rigidity OR controlling type
  if (prior.priceAnchorRigidity >= 75 || prior.type === 'strong_control' || prior.type === 'confident_blind') return 'stubborn';

  // Cooperative
  if (prior.type === 'professional_coop' || prior.type === 'efficient_execute' || prior.type === 'rational_outsource') return 'cooperative';

  // Watchful
  if (prior.type === 'cautious_watch' || prior.type === 'market_savvy' || prior.type === 'rational_analyst') return 'watchful';

  // Upgrading: long window AND high experience
  if (prior.timeWindow === 'long' && prior.downMarketExperience === 'high') return 'upgrading';

  // Emotional
  if (prior.type === 'emotional_hold' || prior.type === 'buddha_fantasy' || prior.type === 'passive_fate') return 'emotional';

  // Default: watchful
  return 'watchful';
}

function buildOwnerPool(
  bootstrap: BigWorldBootstrap,
  seed: number,
): OwnerPoolEntry[] {
  const priors = bootstrap.hiddenTruth.ownerProfilePriors;
  const anchors = bootstrap.hiddenTruth.ownerExpectationAnchors;
  const entries: OwnerPoolEntry[] = [];

  // Build anchor lookup: ownerId → anchor
  const anchorByOwner = new Map<string, OwnerExpectationAnchor>();
  for (const anchor of anchors) {
    anchorByOwner.set(anchor.ownerId, anchor);
  }

  for (let i = 0; i < priors.length; i += 1) {
    const prior = priors[i];
    const anchor = anchorByOwner.get(prior.priorId);
    const state = classifyOwnerState(prior);

    entries.push({
      entryId: `ope-${prior.priorId}`,
      priorId: prior.priorId,
      state,
      caseId: anchor?.caseId,
      marketCellId: undefined, // derived at runtime from case
      priceAnchorRigidity: prior.priceAnchorRigidity,
      expectedUrgency: prior.expectedUrgencyBaseline,
      expectedPatience: prior.expectedPatienceBaseline,
      priceElasticity: prior.priceElasticity,
      provenance: makeProvenance(seed, 'owner_pool', i, 'owner_prior'),
      replayKey: `rk-ope-${seed}-${prior.priorId}`,
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Customer Pool Classification
// ---------------------------------------------------------------------------

function classifyCustomerState(customer: CustomerDemandEntity): CustomerPoolState {
  const pw = customer.preferenceWeights;

  // School district: school preference dominant
  if (pw.school > 60) return 'school_district';

  // Investment: liquidity or rent_option dominant
  if (pw.liquidity > 50 || pw.rent_option > 50) return 'investment';

  // First home: low total price dominant AND low budget
  if (pw.low_total_price > 50 && customer.budgetMax < 400) return 'first_home';

  // Upgrade: improvement dominant AND higher budget
  if (pw.improvement > 50 && customer.budgetMin >= 300) return 'upgrade';

  // Budget sensitive
  if (customer.priceSensitivity >= 75) return 'budget_sensitive';

  // Time sensitive
  if (customer.urgency >= 75) return 'time_sensitive';

  // Hesitant: cautious style AND low urgency
  if (customer.decisionStyle === 'cautious' && customer.urgency < 40) return 'hesitant';

  // Default based on budget
  if (customer.budgetMax < 400) return 'first_home';
  return 'upgrade';
}

function buildCustomerPool(
  bootstrap: BigWorldBootstrap,
  seed: number,
): CustomerPoolEntry[] {
  const customers = bootstrap.materializedEntities.customers;
  const entries: CustomerPoolEntry[] = [];

  for (let i = 0; i < customers.length; i += 1) {
    const customer = customers[i];
    const state = classifyCustomerState(customer);

    entries.push({
      entryId: `cpe-${customer.customerId}`,
      customerId: customer.customerId,
      state,
      targetMarketCellId: customer.targetMarketCellId,
      budgetMin: customer.budgetMin,
      budgetMax: customer.budgetMax,
      urgency: customer.urgency,
      priceSensitivity: customer.priceSensitivity,
      decisionStyle: customer.decisionStyle,
      provenance: makeProvenance(seed, 'customer_pool', i, 'demand_field'),
      replayKey: `rk-cpe-${seed}-${customer.customerId}`,
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Broker Pool Classification
// ---------------------------------------------------------------------------

function classifyBrokerState(broker: BrokerEntity): BrokerPoolState {
  // Resource constrained
  if (broker.energyBudget < 40 || broker.listingPoolSize < 3) return 'resource_constrained';

  // Competition focused
  if (broker.style === 'price_attacker' || broker.style === 'speed_runner') return 'competition_focused';

  // Cooperation focused
  if (broker.style === 'co_sale_builder' || broker.style === 'local_connector') return 'cooperation_focused';

  // Customer hunting
  if (broker.customerPoolSize >= 6 && broker.actionBias > 10) return 'customer_hunting';

  // Listing maintenance
  if (broker.listingPoolSize >= 6 && broker.actionBias < 0) return 'listing_maintenance';

  return 'balanced';
}

function buildBrokerPool(
  bootstrap: BigWorldBootstrap,
  seed: number,
): BrokerPoolEntry[] {
  const brokers = bootstrap.materializedEntities.brokers;
  const entries: BrokerPoolEntry[] = [];

  for (let i = 0; i < brokers.length; i += 1) {
    const broker = brokers[i];
    const state = classifyBrokerState(broker);

    entries.push({
      entryId: `bpe-${broker.brokerId}`,
      brokerId: broker.brokerId,
      state,
      acnId: broker.acnId,
      marketCellIds: broker.marketCellIds,
      energyBudget: broker.energyBudget,
      listingPoolSize: broker.listingPoolSize,
      customerPoolSize: broker.customerPoolSize,
      actionBias: broker.actionBias,
      style: broker.style,
      provenance: makeProvenance(seed, 'broker_pool', i, 'broker_population'),
      replayKey: `rk-bpe-${seed}-${broker.brokerId}`,
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Market Cell Thickness
// ---------------------------------------------------------------------------

function buildEmptyLifecycleDist(): ListingLifecycleDistribution {
  return { fresh: 0, hot: 0, warm: 0, cold: 0, priceReduced: 0, stale: 0, scarce: 0, total: 0 } as ListingLifecycleDistribution;
}

function buildEmptyOwnerDist(): OwnerUrgencyDistribution {
  return { urgent: 0, watchful: 0, stubborn: 0, cooperative: 0, upgrading: 0, financialStress: 0, emotional: 0, total: 0 } as OwnerUrgencyDistribution;
}

function buildEmptyCustomerDist(): CustomerSegmentDistribution {
  return { firstHome: 0, upgrade: 0, schoolDistrict: 0, investment: 0, budgetSensitive: 0, timeSensitive: 0, hesitant: 0, total: 0 } as CustomerSegmentDistribution;
}

function buildCellThickness(
  bootstrap: BigWorldBootstrap,
  listingPool: readonly ListingPoolEntry[],
  ownerPool: readonly OwnerPoolEntry[],
  customerPool: readonly CustomerPoolEntry[],
  brokerPool: readonly BrokerPoolEntry[],
  seed: number,
): MarketCellThickness[] {
  const cells = bootstrap.hiddenTruth.marketCells;
  const supportingInfo = bootstrap.hiddenTruth.supportingInfo;
  const historicalTxns = bootstrap.coldAggregate.historicalTransactions;
  const results: MarketCellThickness[] = [];

  for (let ci = 0; ci < cells.length; ci += 1) {
    const cell = cells[ci];

    // Listing pool entries for this cell
    const cellListings = listingPool.filter((l) => l.marketCellId === cell.id);
    const activeListings = bootstrap.materializedEntities.listings.filter(
      (l) => l.marketCellId === cell.id && l.status === 'active',
    );

    // Listing lifecycle distribution
    const ld = { fresh: 0, hot: 0, warm: 0, cold: 0, priceReduced: 0, stale: 0, scarce: 0, total: 0 };
    for (const lp of cellListings) {
      ld.total += 1;
      switch (lp.state) {
        case 'fresh': ld.fresh += 1; break;
        case 'hot': ld.hot += 1; break;
        case 'warm': ld.warm += 1; break;
        case 'cold': ld.cold += 1; break;
        case 'price_reduced': ld.priceReduced += 1; break;
        case 'stale': ld.stale += 1; break;
        case 'scarce': ld.scarce += 1; break;
      }
    }
    const lifecycleDist: ListingLifecycleDistribution = ld;

    // Owner pool entries linked to this cell (via case anchors)
    const cellOwnerEntries = ownerPool.filter((o) => o.marketCellId === cell.id);
    // Also count owners whose prior type suggests this cell's characteristics
    // (fallback: distribute evenly if no case linkage)
    const od = { urgent: 0, watchful: 0, stubborn: 0, cooperative: 0, upgrading: 0, financialStress: 0, emotional: 0, total: 0 };
    const ownersToCount = cellOwnerEntries.length > 0
      ? cellOwnerEntries
      : ownerPool.slice(ci * Math.floor(ownerPool.length / cells.length), (ci + 1) * Math.floor(ownerPool.length / cells.length));
    for (const op of ownersToCount) {
      od.total += 1;
      switch (op.state) {
        case 'urgent': od.urgent += 1; break;
        case 'watchful': od.watchful += 1; break;
        case 'stubborn': od.stubborn += 1; break;
        case 'cooperative': od.cooperative += 1; break;
        case 'upgrading': od.upgrading += 1; break;
        case 'financial_stress': od.financialStress += 1; break;
        case 'emotional': od.emotional += 1; break;
      }
    }
    const ownerDist: OwnerUrgencyDistribution = od;

    // Customer pool entries for this cell
    const cellCustomers = customerPool.filter((c) => c.targetMarketCellId === cell.id);
    const cd = { firstHome: 0, upgrade: 0, schoolDistrict: 0, investment: 0, budgetSensitive: 0, timeSensitive: 0, hesitant: 0, total: 0 };
    for (const cp of cellCustomers) {
      cd.total += 1;
      switch (cp.state) {
        case 'first_home': cd.firstHome += 1; break;
        case 'upgrade': cd.upgrade += 1; break;
        case 'school_district': cd.schoolDistrict += 1; break;
        case 'investment': cd.investment += 1; break;
        case 'budget_sensitive': cd.budgetSensitive += 1; break;
        case 'time_sensitive': cd.timeSensitive += 1; break;
        case 'hesitant': cd.hesitant += 1; break;
      }
    }
    const customerDist: CustomerSegmentDistribution = cd;

    // Broker pool entries for this cell
    const cellBrokers = brokerPool.filter((b) => b.marketCellIds.includes(cell.id));
    const namedBrokers = cellBrokers.filter((b) => bootstrap.materializedEntities.brokers.find((br) => br.brokerId === b.brokerId)?.visibility === 'named');
    const shadowBrokers = cellBrokers.filter((b) => bootstrap.materializedEntities.brokers.find((br) => br.brokerId === b.brokerId)?.visibility === 'shadow');

    // Rival pressure: average competitiveness of active listings in cell
    const rivalPressure = activeListings.length > 0
      ? Math.round(activeListings.reduce((sum, l) => sum + l.competitiveness, 0) / activeListings.length)
      : 0;

    // ACN count: distinct ACNs among brokers in this cell
    const acnIds = new Set(cellBrokers.map((b) => b.acnId));

    // Liquidity: average liquidity of active listings
    const liquidityLevel = activeListings.length > 0
      ? Math.round(activeListings.reduce((sum, l) => sum + l.liquidity, 0) / activeListings.length)
      : 0;

    // Average days on market
    const avgDaysOnMarket = activeListings.length > 0
      ? Math.round(activeListings.reduce((sum, l) => sum + l.daysOnMarket, 0) / activeListings.length)
      : 0;

    // Historical transactions in this cell
    const cellTxns = historicalTxns.filter((t) => t.marketCellId === cell.id);
    const avgDiscountPct = cellTxns.length > 0
      ? Math.round(cellTxns.reduce((sum, t) => sum + t.discountPct, 0) / cellTxns.length)
      : 0;

    // Supporting info in this cell
    const cellInfo = supportingInfo.filter((si) => si.marketCellId === cell.id);
    const infoCategories = new Set(cellInfo.map((si) => si.category));

    results.push({
      marketCellId: cell.id,
      cellName: cell.name,
      activeSupply: activeListings.length,
      listingLifecycle: lifecycleDist,
      ownerUrgency: ownerDist,
      activeDemand: cellCustomers.length,
      customerSegment: customerDist,
      brokerDensity: cellBrokers.length,
      namedBrokerCount: namedBrokers.length,
      shadowBrokerCount: shadowBrokers.length,
      rivalPressure,
      acnCount: acnIds.size,
      liquidityLevel,
      avgDaysOnMarket,
      historicalTxnCount: cellTxns.length,
      avgDiscountPct,
      supportingInfoCount: cellInfo.length,
      supportingInfoCategories: infoCategories.size,
      replayKey: `rk-ct-${seed}-${cell.id}`,
    });
  }

  return results;
}

// ---------------------------------------------------------------------------
// Aggregate Distributions
// ---------------------------------------------------------------------------

function countByState<T extends string>(entries: readonly { readonly state: T }[]): Readonly<Record<T, number>> {
  const result = {} as Record<T, number>;
  for (const entry of entries) {
    result[entry.state] = (result[entry.state] ?? 0) + 1;
  }
  return result;
}

// ---------------------------------------------------------------------------
// Main: buildMarketFormation
// ---------------------------------------------------------------------------

/**
 * Build MarketFormationState from a BigWorldBootstrap.
 *
 * This is the canonical entrypoint for market formation derivation.
 * Same bootstrap → byte-identical market formation.
 *
 * Every entry has stable ID, provenance, replayKey, and sourceRef.
 * Every cell has thickness metrics showing supply/demand density.
 */
export function buildMarketFormation(
  bootstrap: BigWorldBootstrap,
): MarketFormationState {
  const seed = bootstrap.causalBaseline.seed;

  const listingPool = buildListingPool(bootstrap, seed);
  const ownerPool = buildOwnerPool(bootstrap, seed);
  const customerPool = buildCustomerPool(bootstrap, seed);
  const brokerPool = buildBrokerPool(bootstrap, seed);
  const cellThickness = buildCellThickness(
    bootstrap, listingPool, ownerPool, customerPool, brokerPool, seed,
  );

  // Aggregate metrics
  const totalActiveSupply = listingPool.filter((l) =>
    l.state !== 'stale' && l.state !== 'cold',
  ).length;
  const totalActiveDemand = customerPool.length;
  const totalBrokers = brokerPool.length;
  const avgLiquidity = cellThickness.length > 0
    ? Math.round(cellThickness.reduce((sum, ct) => sum + ct.liquidityLevel, 0) / cellThickness.length)
    : 0;
  const avgRivalPressure = cellThickness.length > 0
    ? Math.round(cellThickness.reduce((sum, ct) => sum + ct.rivalPressure, 0) / cellThickness.length)
    : 0;

  return Object.freeze({
    listingPool,
    ownerPool,
    customerPool,
    brokerPool,
    cellThickness,
    totalActiveSupply,
    totalActiveDemand,
    totalBrokers,
    avgLiquidity,
    avgRivalPressure,
    listingStateDistribution: countByState(listingPool),
    ownerStateDistribution: countByState(ownerPool),
    customerStateDistribution: countByState(customerPool),
    brokerStateDistribution: countByState(brokerPool),
    replayKey: `rk-mf-${seed}`,
  });
}

// ---------------------------------------------------------------------------
// buildMarketFormationSummary — compact persistable summary
// ---------------------------------------------------------------------------

/**
 * Build a compact MarketFormationSummary from a MarketFormationState.
 * Safe to persist in save files.
 */
export function buildMarketFormationSummary(
  formation: MarketFormationState,
): MarketFormationSummary {
  const lsd = formation.listingStateDistribution;
  const osd = formation.ownerStateDistribution;
  const csd = formation.customerStateDistribution;
  const bsd = formation.brokerStateDistribution;

  const listingStatesCovered = Object.values(lsd).filter((v) => v > 0).length;
  const ownerStatesCovered = Object.values(osd).filter((v) => v > 0).length;
  const customerStatesCovered = Object.values(csd).filter((v) => v > 0).length;
  const brokerStatesCovered = Object.values(bsd).filter((v) => v > 0).length;

  return {
    listingPoolCount: formation.listingPool.length,
    ownerPoolCount: formation.ownerPool.length,
    customerPoolCount: formation.customerPool.length,
    brokerPoolCount: formation.brokerPool.length,
    cellThicknessCount: formation.cellThickness.length,
    listingStateDistribution: lsd,
    ownerStateDistribution: osd,
    customerStateDistribution: csd,
    brokerStateDistribution: bsd,
    totalActiveSupply: formation.totalActiveSupply,
    totalActiveDemand: formation.totalActiveDemand,
    avgLiquidity: formation.avgLiquidity,
    avgRivalPressure: formation.avgRivalPressure,
    meetsMarketFormationThresholds: {
      listingPoolGte100: formation.listingPool.length >= 100,
      ownerPoolGte100: formation.ownerPool.length >= 100,
      customerPoolGte200: formation.customerPool.length >= 200,
      brokerPoolGte50: formation.brokerPool.length >= 50,
      cellThicknessGte10: formation.cellThickness.length >= 10,
      activeSupplyGte200: formation.totalActiveSupply >= 200,
      activeDemandGte200: formation.totalActiveDemand >= 200,
      liquidityLevelGte30: formation.avgLiquidity >= 30,
      listingStatesCoveredGte4: listingStatesCovered >= 4,
      ownerStatesCoveredGte4: ownerStatesCovered >= 4,
      customerStatesCoveredGte4: customerStatesCovered >= 4,
      brokerStatesCoveredGte3: brokerStatesCovered >= 3,
    },
  };
}
