// ---------------------------------------------------------------------------
// bigWorldBootstrap — canonical entrypoint for BigWorld initialization
//
// This is the SINGLE canonical entrypoint for generating a BigWorldBootstrap.
// Same scenario + seed + scalePolicy → byte-identical bootstrap.
//
// Architecture:
//   BigWorldBootstrap
//     ├── hiddenTruth        — world facts actors can't see
//     ├── materializedEntities — hot runtime entities
//     ├── coldAggregate      — compressed shadow data
//     ├── openingPOV         — player-visible projection
//     ├── causalBaseline     — seed surface + source records
//     └── marketOpeningSnapshot — backward-compatible child/adaptor
//
// Also exports:
//   buildRuntimeInitialState() — extracts typed input for Agent B
//
// Hard constraints:
//   - domain/world-model/ must NOT import runtime/*, application/*, UI/*
//   - No Date.now, no Math.random, no fetch/LLM
//   - Deterministic: same input → identical output
//   - openingPOV is a projection, not the hidden truth
// ---------------------------------------------------------------------------

import { normalizeSeed } from '../utils.js';
import { DEFAULT_ACN_NETWORKS, type AcnNetwork } from './acnNetworks.js';
import {
  generateBrokerPopulation,
  type BrokerEntity,
} from './brokerPopulation.js';
import {
  generateListingPopulation,
  type ListingPopulationEntity,
  type HistoricalTransactionSummary,
} from './listingPopulation.js';
import {
  generateDemandField,
  type CustomerDemandEntity,
  type DemandListingAttention,
} from './customerDemandField.js';
import {
  createMarketOpeningSnapshot,
  type MarketOpeningInput,
} from './seededMarketWorld.js';
import type { MarketCellSnapshot, ACNNetworkSnapshot } from './marketWorldTypes.js';
import { buildBigWorldSpec } from './bigWorldSpecFactory.js';
import type {
  BigWorldSpec,
  BigWorldBootstrap,
  BigWorldHiddenTruth,
  BigWorldMaterializedEntities,
  BigWorldColdAggregate,
  BigWorldOpeningPOV,
  BigWorldCausalBaseline,
  BigWorldRuntimeInitialState,
  BigWorldScalePolicy,
  BigWorldBootstrapSummary,
  OwnerProfilePrior,
  OwnerExpectationAnchor,
  OwnerPerceptionLag,
  ShadowAggregateCluster,
  EntityProvenance,
  BootstrapSourceRef,
  DiversityManifest,
  ScaleManifest,
} from './bigWorldTypes.js';
import type { DifficultyId } from '../models.js';

// ---------------------------------------------------------------------------
// Deterministic hash helpers
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

function seededPick<T>(seed: string, arr: readonly T[]): T {
  return arr[stableHash(seed) % arr.length];
}

function makeSourceRef(seed: number, entity: string, index: number): BootstrapSourceRef {
  return `ref:${seed}:${entity}:${index}` as BootstrapSourceRef;
}

function makeProvenance(seed: number, entity: string, index: number, origin: EntityProvenance['origin']): EntityProvenance {
  const salt = `${entity}-${seed}-${index}`;
  return {
    sourceRef: makeSourceRef(seed, entity, index),
    origin,
    generationSalt: salt,
  };
}

// ---------------------------------------------------------------------------
// Owner Profile Priors
// ---------------------------------------------------------------------------

const OWNER_TYPES: readonly OwnerProfilePrior['type'][] = [
  'game_player', 'strategy_swing', 'emotional_hold', 'strong_control',
  'rational_outsource', 'confident_blind', 'buddha_fantasy',
  'efficient_execute', 'professional_coop', 'fast_trial',
  'deal_dependent', 'steady_pace', 'rational_trust',
  'cautious_watch', 'passive_fate',
];

function generateOwnerProfilePriors(
  count: number,
  seed: number,
): OwnerProfilePrior[] {
  const priors: OwnerProfilePrior[] = [];
  for (let i = 0; i < count; i += 1) {
    const salt = `prior-${seed}-${i}`;
    const type = seededPick(salt, OWNER_TYPES);
    const priceAnchorRigidity = seededInt(`${salt}-rigid`, 20, 90);
    const timeWindow: 'short' | 'long' = seededInt(`${salt}-tw`, 0, 1) === 0 ? 'short' : 'long';
    const downMarketExperience: 'low' | 'high' = seededInt(`${salt}-dme`, 0, 1) === 0 ? 'low' : 'high';
    const decisionStyle: 'self_decide' | 'guided_or_joint' = seededInt(`${salt}-ds`, 0, 1) === 0 ? 'self_decide' : 'guided_or_joint';

    priors.push({
      priorId: `owner-prior-${i + 1}`,
      type,
      priceAnchorRigidity,
      timeWindow,
      downMarketExperience,
      decisionStyle,
      expectedTrustBaseline: seededInt(`${salt}-trust`, 40, 70),
      expectedPatienceBaseline: seededInt(`${salt}-patience`, 30, 75),
      expectedUrgencyBaseline: seededInt(`${salt}-urgency`, 25, 80),
      priceElasticity: seededFloat(`${salt}-elasticity`, 0.1, 0.6),
      perceptionLagDays: seededInt(`${salt}-lag`, 0, 5),
      provenance: makeProvenance(seed, 'owner_prior', i, 'owner_prior'),
    });
  }
  return priors;
}

// ---------------------------------------------------------------------------
// Owner Expectation Anchors
// ---------------------------------------------------------------------------

function generateOwnerExpectationAnchors(
  caseIds: readonly string[],
  priors: readonly OwnerProfilePrior[],
  seed: number,
): OwnerExpectationAnchor[] {
  return caseIds.map((caseId, i) => {
    const salt = `anchor-${seed}-${caseId}`;
    const prior = priors[i % priors.length];
    const marketRef = seededInt(`${salt}-mkt`, 200, 800);
    const expectGap = seededFloat(`${salt}-gap`, -0.12, 0.18);
    const expectedPrice = Math.round(marketRef * (1 + expectGap));
    const listingPremium = seededFloat(`${salt}-list`, 1.02, 1.15);
    const listingPrice = Math.round(expectedPrice * listingPremium);
    const bottomDiscount = seededFloat(`${salt}-bottom`, 0.82, 0.94);
    const bottomPrice = Math.round(expectedPrice * bottomDiscount);

    return {
      anchorId: `anchor-${caseId}`,
      caseId,
      ownerId: prior.priorId,
      expectedPrice,
      listingPrice,
      bottomPrice,
      marketReferencePrice: marketRef,
      expectationGapPct: Math.round(expectGap * 10000) / 100,
      provenance: makeProvenance(seed, 'owner_anchor', i, 'owner_prior'),
    };
  });
}

// ---------------------------------------------------------------------------
// Owner Perception Lags
// ---------------------------------------------------------------------------

function generateOwnerPerceptionLags(
  priors: readonly OwnerProfilePrior[],
  acnProfiles: readonly AcnNetwork[],
  seed: number,
): OwnerPerceptionLag[] {
  return priors.map((prior, i) => {
    const salt = `lag-${seed}-${i}`;
    const acn = acnProfiles[i % acnProfiles.length];
    const baseLag = prior.perceptionLagDays;
    const acnModifier = Math.round((100 - acn.behavior.infoSpeed) / 25);
    const rigidityModifier = Math.round(prior.priceAnchorRigidity / 30);
    const effective = Math.max(0, baseLag + acnModifier + rigidityModifier);

    return {
      lagId: `lag-${prior.priorId}`,
      ownerId: prior.priorId,
      baseLagDays: baseLag,
      acnInfoSpeedModifier: acnModifier,
      rigidityModifier,
      effectiveLagDays: effective,
      provenance: makeProvenance(seed, 'owner_lag', i, 'owner_prior'),
    };
  });
}

// ---------------------------------------------------------------------------
// Shadow Aggregate Demand Clusters
// ---------------------------------------------------------------------------

const SEGMENTS = ['first_home', 'upgrade', 'school_district', 'investment', 'liquidity', 'commute', 'rental_yield'];

function generateShadowDemandClusters(
  marketCellIds: readonly string[],
  clustersPerCell: number,
  seed: number,
): ShadowAggregateCluster[] {
  const clusters: ShadowAggregateCluster[] = [];
  let counter = 0;
  for (const cellId of marketCellIds) {
    for (let i = 0; i < clustersPerCell; i += 1) {
      counter += 1;
      const salt = `cluster-${seed}-${cellId}-${i}`;
      const segment = seededPick(`${salt}-seg`, SEGMENTS);
      clusters.push({
        clusterId: `shadow-cluster-${counter}`,
        marketCellId: cellId,
        segment,
        estimatedCustomerCount: seededInt(`${salt}-count`, 3, 12),
        avgBudgetMidpoint: seededInt(`${salt}-budget`, 250, 700),
        layoutPreference: {
          '2室1厅': seededInt(`${salt}-2r1`, 15, 40),
          '3室1厅': seededInt(`${salt}-3r1`, 20, 45),
          '2室2厅': seededInt(`${salt}-2r2`, 10, 30),
        },
        aggregateUrgency: seededInt(`${salt}-urg`, 25, 80),
        aggregatePriceSensitivity: seededInt(`${salt}-sens`, 30, 85),
        provenance: makeProvenance(seed, 'demand_cluster', counter - 1, 'demand_cluster'),
      });
    }
  }
  return clusters;
}

// ---------------------------------------------------------------------------
// Historical Transaction Summaries
// ---------------------------------------------------------------------------

function generateHistoricalTransactions(
  marketCellIds: readonly string[],
  marketCellNames: readonly string[],
  acnIds: readonly string[],
  count: number,
  seed: number,
): HistoricalTransactionSummary[] {
  const txns: HistoricalTransactionSummary[] = [];
  for (let i = 0; i < count; i += 1) {
    const salt = `hist-txn-${seed}-${i}`;
    const cellIdx = stableHash(`${salt}-cell`) % marketCellIds.length;
    const layout = seededPick(`${salt}-layout`, ['1室1厅', '2室1厅', '3室1厅', '2室2厅', '3室2厅']);
    const askPrice = seededInt(`${salt}-ask`, 200, 800);
    const discountPct = seededFloat(`${salt}-disc`, 0.02, 0.12);
    const soldPrice = Math.round(askPrice * (1 - discountPct));

    txns.push({
      id: `hist-txn-${i + 1}`,
      marketCellId: marketCellIds[cellIdx],
      district: marketCellNames[cellIdx] || `区域${cellIdx}`,
      layout,
      soldPrice,
      askPrice,
      discountPct: Math.round(discountPct * 100),
      soldDay: seededInt(`${salt}-day`, 1, 21),
      acnId: acnIds[stableHash(`${salt}-acn`) % acnIds.length],
    });
  }
  return txns;
}

// ---------------------------------------------------------------------------
// Player Broker
// ---------------------------------------------------------------------------

function buildPlayerBroker(seed: number): BrokerEntity {
  const energy = 100;
  return {
    brokerId: 'player-broker',
    acnId: 'acn-cooperative',
    visibility: 'named',
    name: '玩家经纪人',
    style: 'co_sale_builder',
    marketCellIds: ['cell-1'],
    energyBudget: energy,
    energyRemaining: energy,
    listingPoolSize: 8,
    customerPoolSize: 10,
    actionBias: 0,
  };
}

// ---------------------------------------------------------------------------
// Main: createBigWorldBootstrap
// ---------------------------------------------------------------------------

export interface BigWorldBootstrapInput {
  seed: number;
  scenarioName: string;
  difficultyId: DifficultyId;
  playerCaseCount: number;
  playerCaseIds?: readonly string[];
  /**
   * Optional scale policy override.
   * When provided, bypasses the difficulty-based scale lookup.
   * Used for hundred-scale and custom profiles without modifying DifficultyId.
   */
  readonly scaleOverride?: BigWorldScalePolicy;
}

/**
 * Create a BigWorldBootstrap from seed + config.
 *
 * This is the SINGLE canonical entrypoint.
 * Same input → byte-identical output.
 */
export function createBigWorldBootstrap(
  input: BigWorldBootstrapInput,
): BigWorldBootstrap {
  const seed = normalizeSeed(input.seed);
  const spec = buildBigWorldSpec(input.difficultyId, input.playerCaseCount);
  const scale = input.scaleOverride ?? spec.scale;

  // --- Market Opening Snapshot (backward-compatible child/adaptor) ---
  const marketOpeningInput: MarketOpeningInput = {
    seed,
    scenarioName: input.scenarioName,
    difficultyId: input.difficultyId,
    playerCaseCount: input.playerCaseCount,
  };
  const marketOpeningSnapshot = createMarketOpeningSnapshot(marketOpeningInput);

  // --- Core data ---
  const acnProfiles: readonly AcnNetwork[] = DEFAULT_ACN_NETWORKS;
  const marketCells = marketOpeningSnapshot.marketCells;
  const acnNetworks = marketOpeningSnapshot.acnNetworks;
  const marketCellIds = marketCells.map((c) => c.id);
  const marketCellNames = marketCells.map((c) => c.name);
  const acnIds = acnProfiles.map((a) => a.id);

  // --- Broker Population ---
  const brokers = generateBrokerPopulation(
    acnProfiles, marketCellIds,
    {
      namedBrokersPerAcn: scale.namedBrokersPerAcn,
      shadowBrokersPerAcn: scale.shadowBrokersPerAcn,
      namedBrokerBaseEnergy: 80,
      shadowBrokerBaseEnergy: 50,
      namedBrokerListingPool: 6,
      shadowBrokerListingPool: 3,
      namedBrokerCustomerPool: 8,
      shadowBrokerCustomerPool: 4,
    },
    seed,
  );

  // --- Listing Population ---
  const listings = generateListingPopulation(
    marketCellIds, marketCellNames, acnIds,
    {
      shadowListingsPerCell: scale.shadowListingsPerCell,
      directRivalListingsPerCell: scale.directRivalListingsPerCell,
      askPriceVariationPct: 12,
    },
    seed,
  );

  // --- Customer Demand Field ---
  const brokerIds = brokers.map((b) => b.brokerId);
  const customers = generateDemandField(
    marketCellIds, brokerIds, acnIds,
    {
      customersPerCell: scale.materializedCustomersPerCell,
      baseDailyComparisonLimit: 4,
    },
    seed,
  );

  const attentions: DemandListingAttention[] = [];

  // --- Cold Aggregate ---
  const shadowDemandClusters = generateShadowDemandClusters(
    marketCellIds,
    scale.shadowAggregateClustersPerCell ?? 2,
    seed,
  );
  const historicalTransactions = generateHistoricalTransactions(
    marketCellIds, marketCellNames, acnIds,
    marketOpeningSnapshot.listingInventory.recentTransactionCount,
    seed,
  );

  // --- Owner Priors ---
  const ownerProfilePriors = generateOwnerProfilePriors(scale.ownerProfilePriorCount, seed);
  const caseIds = input.playerCaseIds ?? Array.from(
    { length: input.playerCaseCount },
    (_, i) => `case-${i + 1}`,
  );
  const ownerExpectationAnchors = generateOwnerExpectationAnchors(caseIds, ownerProfilePriors, seed);
  const ownerPerceptionLags = generateOwnerPerceptionLags(ownerProfilePriors, acnProfiles, seed);

  // --- Derived ---
  const playerBroker = buildPlayerBroker(seed);
  const recentWorldEvents = marketOpeningSnapshot.recentWorldEvents;

  // --- Named brokers (for opening POV) ---
  const namedRivalBrokers = brokers.filter((b) => b.visibility === 'named');
  const directRivalListings = listings.filter((l) => l.layer === 'direct_rival');

  // --- Build layers ---
  const hiddenTruth: BigWorldHiddenTruth = Object.freeze({
    cityCycle: marketOpeningSnapshot.cityCycle,
    marketCells,
    acnNetworks,
    acnProfiles,
    ownerProfilePriors,
    ownerExpectationAnchors,
    ownerPerceptionLags,
  });

  const materializedEntities: BigWorldMaterializedEntities = Object.freeze({
    brokers,
    listings,
    customers,
    attentions,
  });

  const coldAggregate: BigWorldColdAggregate = Object.freeze({
    shadowDemandClusters,
    historicalTransactions,
  });

  const openingPOV: BigWorldOpeningPOV = Object.freeze({
    cityCycle: hiddenTruth.cityCycle,
    marketCells: hiddenTruth.marketCells,
    acnNetworks: hiddenTruth.acnNetworks,
    namedRivalBrokers,
    directRivalListings,
    aggregateDemandSegments: spec.domain.demandSegments,
    recentWorldEvents,
    playerBroker,
  });

  const causalBaseline: BigWorldCausalBaseline = Object.freeze({
    seed,
    scenarioName: input.scenarioName,
    difficultyId: input.difficultyId,
    scalePolicy: scale,
    spec,
    recentWorldEvents,
  });

  return Object.freeze({
    version: 1 as const,
    hiddenTruth,
    materializedEntities,
    coldAggregate,
    openingPOV,
    causalBaseline,
    marketOpeningSnapshot,
  });
}

// ---------------------------------------------------------------------------
// buildRuntimeInitialState — extracts typed input for Agent B
// ---------------------------------------------------------------------------

/**
 * Build a BigWorldRuntimeInitialState from a BigWorldBootstrap.
 *
 * This is the ONLY way Agent B should consume bootstrap data.
 * It extracts the subset needed for runtime initialization and
 * provides deterministic sub-seeds for ecosystem/causal generation.
 *
 * Agent B must NOT reach into hiddenTruth directly.
 */
export function buildRuntimeInitialState(
  bootstrap: BigWorldBootstrap,
): BigWorldRuntimeInitialState {
  const seed = bootstrap.causalBaseline.seed;
  // Deterministic sub-seeds derived from master seed
  const ecosystemSeed = (seed ^ 0x9e3779b9) >>> 0;
  const causalSeed = (seed ^ 0x517c1b73) >>> 0;

  return Object.freeze({
    seed,
    difficultyId: bootstrap.causalBaseline.difficultyId,
    brokers: bootstrap.materializedEntities.brokers,
    listings: bootstrap.materializedEntities.listings,
    customers: bootstrap.materializedEntities.customers,
    attentions: bootstrap.materializedEntities.attentions,
    shadowDemandClusters: bootstrap.coldAggregate.shadowDemandClusters,
    historicalTransactions: bootstrap.coldAggregate.historicalTransactions,
    openingPOV: bootstrap.openingPOV,
    ecosystemSeed,
    causalSeed,
  });
}

// ---------------------------------------------------------------------------
// buildDiversityManifest — compute structural diversity from generated data
// ---------------------------------------------------------------------------

/**
 * Build a DiversityManifest from a BigWorldBootstrap.
 * Computes from actual generated entities, not from spec declarations.
 */
export function buildDiversityManifest(
  bootstrap: BigWorldBootstrap,
): DiversityManifest {
  const { hiddenTruth, materializedEntities, coldAggregate } = bootstrap;

  // --- Owner archetype diversity ---
  const ownerTypeDist: Record<string, number> = {};
  for (const prior of hiddenTruth.ownerProfilePriors) {
    ownerTypeDist[prior.type] = (ownerTypeDist[prior.type] ?? 0) + 1;
  }

  // --- Listing type diversity ---
  const listingLayoutDist: Record<string, number> = {};
  for (const listing of materializedEntities.listings) {
    listingLayoutDist[listing.layout] = (listingLayoutDist[listing.layout] ?? 0) + 1;
  }

  // --- Price band diversity ---
  const priceBandDist: Record<string, number> = {};
  for (const listing of materializedEntities.listings) {
    priceBandDist[listing.priceBand] = (priceBandDist[listing.priceBand] ?? 0) + 1;
  }

  // --- Demand segment diversity (from cold clusters) ---
  const customerSegDist: Record<string, number> = {};
  for (const cluster of coldAggregate.shadowDemandClusters) {
    customerSegDist[cluster.segment] = (customerSegDist[cluster.segment] ?? 0) + cluster.estimatedCustomerCount;
  }
  // Also count materialized customers by their broker's ACN (proxy for segment)
  // But the real segment info is in cold clusters. Count unique segments.
  const allSegments = new Set<string>();
  for (const cluster of coldAggregate.shadowDemandClusters) {
    allSegments.add(cluster.segment);
  }
  // Add demand segments from spec
  for (const seg of hiddenTruth.marketCells.map(() => '')) {
    // market cells don't have segments directly; use cold clusters
  }

  // --- Broker style diversity ---
  const brokerStyleDist: Record<string, number> = {};
  for (const broker of materializedEntities.brokers) {
    brokerStyleDist[broker.style] = (brokerStyleDist[broker.style] ?? 0) + 1;
  }

  // --- Market cell distribution ---
  const cellDist: Record<string, number> = {};
  for (const listing of materializedEntities.listings) {
    cellDist[listing.marketCellId] = (cellDist[listing.marketCellId] ?? 0) + 1;
  }

  // --- Hot/cold split ---
  const totalClusterUnits = coldAggregate.shadowDemandClusters.reduce(
    (sum, c) => sum + c.estimatedCustomerCount, 0,
  );
  const materializedCustomers = materializedEntities.customers.length;
  const directRivalListings = materializedEntities.listings.filter((l) => l.layer === 'direct_rival').length;
  const shadowListings = materializedEntities.listings.filter((l) => l.layer === 'shadow').length;

  return {
    ownerArchetypeDiversity: Object.keys(ownerTypeDist).length,
    listingTypeDiversity: Object.keys(listingLayoutDist).length,
    priceBandDiversity: Object.keys(priceBandDist).length,
    demandSegmentDiversity: allSegments.size,
    brokerStyleDiversity: Object.keys(brokerStyleDist).length,
    marketCellCount: hiddenTruth.marketCells.length,

    ownerTypeDistribution: ownerTypeDist,
    listingLayoutDistribution: listingLayoutDist,
    priceBandDistribution: priceBandDist,
    customerSegmentDistribution: customerSegDist,
    brokerStyleDistribution: brokerStyleDist,
    marketCellDistribution: cellDist,

    hotColdSplit: {
      materializedCustomers,
      shadowClusterUnits: totalClusterUnits,
      totalDemandUnits: materializedCustomers + totalClusterUnits,
      materializedListingCount: directRivalListings,
      shadowListingCount: shadowListings,
    },
  };
}

// ---------------------------------------------------------------------------
// buildScaleManifest — quantitative summary with diversity
// ---------------------------------------------------------------------------

/**
 * Build a ScaleManifest from a BigWorldBootstrap.
 * Provides counts, diversity coverage, and threshold checks.
 */
export function buildScaleManifest(
  bootstrap: BigWorldBootstrap,
): ScaleManifest {
  const diversity = buildDiversityManifest(bootstrap);
  const listings = bootstrap.materializedEntities.listings;
  const customers = bootstrap.materializedEntities.customers;
  const brokers = bootstrap.materializedEntities.brokers;
  const priors = bootstrap.hiddenTruth.ownerProfilePriors;

  const totalDemandUnits = diversity.hotColdSplit.totalDemandUnits;

  return {
    totalListings: listings.length,
    totalOwners: priors.length,
    totalCustomers: totalDemandUnits,
    totalBrokers: brokers.length,
    marketCells: bootstrap.hiddenTruth.marketCells.length,
    acnNetworks: bootstrap.hiddenTruth.acnNetworks.length,

    diversityCoverage: diversity,

    meetsHundredScaleThresholds: {
      listingsGte100: listings.length >= 100,
      ownersGte100: priors.length >= 100,
      customersGte300: totalDemandUnits >= 300,
      marketCellsGte5: bootstrap.hiddenTruth.marketCells.length >= 5,
      acnNetworksGte3: bootstrap.hiddenTruth.acnNetworks.length >= 3,
      brokersGte20: brokers.length >= 20,
    },
  };
}

// ---------------------------------------------------------------------------
// buildBootstrapSummary — full summary with scale manifest
// ---------------------------------------------------------------------------

/**
 * Build a BigWorldBootstrapSummary from a bootstrap.
 * Includes the scale manifest for diversity checks.
 */
export function buildBootstrapSummary(
  bootstrap: BigWorldBootstrap,
): BigWorldBootstrapSummary {
  const scaleManifest = buildScaleManifest(bootstrap);
  const listings = bootstrap.materializedEntities.listings;
  const customers = bootstrap.materializedEntities.customers;
  const brokers = bootstrap.materializedEntities.brokers;
  const priors = bootstrap.hiddenTruth.ownerProfilePriors;

  return {
    version: 1,
    seed: bootstrap.causalBaseline.seed,
    scenarioName: bootstrap.causalBaseline.scenarioName,
    difficultyId: bootstrap.causalBaseline.difficultyId,
    playerCaseCount: bootstrap.marketOpeningSnapshot.playerCaseCount,

    marketCellCount: bootstrap.hiddenTruth.marketCells.length,
    acnNetworkCount: bootstrap.hiddenTruth.acnNetworks.length,
    namedBrokerCount: brokers.filter((b) => b.visibility === 'named').length,
    shadowBrokerCount: brokers.filter((b) => b.visibility === 'shadow').length,
    totalBrokerCount: brokers.length,
    materializedListingCount: listings.length,
    shadowListingCount: listings.filter((l) => l.layer === 'shadow').length,
    directRivalListingCount: listings.filter((l) => l.layer === 'direct_rival').length,
    totalListingCount: listings.length,
    materializedCustomerCount: customers.length,
    shadowDemandClusterCount: bootstrap.coldAggregate.shadowDemandClusters.length,
    totalDemandUnitCount: scaleManifest.diversityCoverage.hotColdSplit.totalDemandUnits,
    ownerProfilePriorCount: priors.length,
    ownerExpectationAnchorCount: bootstrap.hiddenTruth.ownerExpectationAnchors.length,
    ownerPerceptionLagCount: bootstrap.hiddenTruth.ownerPerceptionLags.length,
    historicalTransactionCount: bootstrap.coldAggregate.historicalTransactions.length,
    recentWorldEventCount: bootstrap.causalBaseline.recentWorldEvents.length,
    attentionRelationCount: bootstrap.materializedEntities.attentions.length,

    invariantCheck: {
      marketCellsGte3: bootstrap.hiddenTruth.marketCells.length >= 3,
      rivalBrokersGte8: brokers.length >= 8,
      comparableSupplyGte20: listings.length >= 20,
      demandUnitsGte60: scaleManifest.diversityCoverage.hotColdSplit.totalDemandUnits >= 60,
      ownerProfilePriorsGte3: priors.length >= 3,
      acnNetworksGte3: bootstrap.hiddenTruth.acnNetworks.length >= 3,
    },

    scaleManifest,

    marketCellIds: bootstrap.hiddenTruth.marketCells.map((c) => c.id),
    acnNetworkIds: bootstrap.hiddenTruth.acnNetworks.map((a) => a.id),
    namedBrokerIds: brokers.filter((b) => b.visibility === 'named').map((b) => b.brokerId),
    ownerProfilePriorIds: priors.map((p) => p.priorId),
  };
}
