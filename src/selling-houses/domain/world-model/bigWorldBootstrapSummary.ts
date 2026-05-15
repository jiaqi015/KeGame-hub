// ---------------------------------------------------------------------------
// bigWorldBootstrapSummary — build + normalize a compact persistable summary
//
// BigWorldBootstrapSummary is:
//   - versioned for migration
//   - persistable to JSON (for save files)
//   - compatible with old saves that only have MarketOpeningSnapshot
//   - does NOT contain infinite/large raw arrays
//
// normalizeOldSave() returns BigWorldNormalizedSave:
//   - summary (counts + refs)
//   - seed (for re-bootstrap)
//   - marketOpeningSnapshot (backward compat, if present)
//   - NO hidden truth, NO materialized entities, NO opening POV
//
// Hard constraints:
//   - domain/world-model/ must NOT import runtime/*, application/*, UI/*
//   - Same bootstrap → same summary (deterministic)
//   - Old-save normalize must NOT fabricate hidden world
// ---------------------------------------------------------------------------

import type {
  BigWorldBootstrap,
  BigWorldBootstrapSummary,
  BigWorldNormalizedSave,
  ScaleManifest,
  SourceReadinessCoverage,
} from './bigWorldTypes.js';
import type { MarketFormationSummary } from './marketFormationTypes.js';
import { readMarketOpeningSnapshot } from './marketOpening.js';
import { buildScaleManifest } from './bigWorldBootstrap.js';
import { buildMarketFormationSummary } from './marketFormationBootstrap.js';

// ---------------------------------------------------------------------------
// Build summary from bootstrap
// ---------------------------------------------------------------------------

/**
 * Build a compact BigWorldBootstrapSummary from a full bootstrap.
 * This summary is safe to persist in save files.
 */
export function buildBigWorldBootstrapSummary(
  bootstrap: BigWorldBootstrap,
): BigWorldBootstrapSummary {
  const allBrokers = bootstrap.materializedEntities.brokers;
  const namedBrokers = allBrokers.filter((b) => b.visibility === 'named');
  const shadowBrokers = allBrokers.filter((b) => b.visibility === 'shadow');
  const allListings = bootstrap.materializedEntities.listings;
  const shadowListings = allListings.filter((l) => l.layer === 'shadow');
  const directRivalListings = allListings.filter((l) => l.layer === 'direct_rival');
  const customers = bootstrap.materializedEntities.customers;

  const totalDemandUnits = customers.length
    + bootstrap.coldAggregate.shadowDemandClusters.reduce((sum, c) => sum + c.estimatedCustomerCount, 0);

  const spec = bootstrap.causalBaseline.spec;
  const inv = spec.invariants;

  const invariantCheck = {
    marketCellsGte3: bootstrap.hiddenTruth.marketCells.length >= inv.minMarketCells,
    rivalBrokersGte8: (namedBrokers.length + shadowBrokers.length) >= inv.minRivalBrokers,
    comparableSupplyGte20: allListings.length >= inv.minComparableSupply,
    demandUnitsGte60: totalDemandUnits >= inv.minDemandUnits,
    ownerProfilePriorsGte3: bootstrap.hiddenTruth.ownerProfilePriors.length >= inv.minOwnerProfilePriors,
    acnNetworksGte3: bootstrap.hiddenTruth.acnNetworks.length >= inv.minAcnNetworks,
  };

  return Object.freeze({
    version: 1 as const,
    seed: bootstrap.causalBaseline.seed,
    scenarioName: bootstrap.causalBaseline.scenarioName,
    difficultyId: bootstrap.causalBaseline.difficultyId,
    playerCaseCount: bootstrap.marketOpeningSnapshot.playerCaseCount,

    marketCellCount: bootstrap.hiddenTruth.marketCells.length,
    acnNetworkCount: bootstrap.hiddenTruth.acnNetworks.length,
    namedBrokerCount: namedBrokers.length,
    shadowBrokerCount: shadowBrokers.length,
    totalBrokerCount: allBrokers.length,
    materializedListingCount: allListings.length,
    shadowListingCount: shadowListings.length,
    directRivalListingCount: directRivalListings.length,
    totalListingCount: allListings.length,
    materializedCustomerCount: customers.length,
    shadowDemandClusterCount: bootstrap.coldAggregate.shadowDemandClusters.length,
    totalDemandUnitCount: totalDemandUnits,
    ownerProfilePriorCount: bootstrap.hiddenTruth.ownerProfilePriors.length,
    ownerExpectationAnchorCount: bootstrap.hiddenTruth.ownerExpectationAnchors.length,
    ownerPerceptionLagCount: bootstrap.hiddenTruth.ownerPerceptionLags.length,
    historicalTransactionCount: bootstrap.coldAggregate.historicalTransactions.length,
    recentWorldEventCount: bootstrap.causalBaseline.recentWorldEvents.length,
    attentionRelationCount: bootstrap.materializedEntities.attentions.length,

    invariantCheck,

    scaleManifest: buildScaleManifest(bootstrap),

    marketCellIds: bootstrap.hiddenTruth.marketCells.map((c) => c.id),
    acnNetworkIds: bootstrap.hiddenTruth.acnNetworks.map((a) => a.id),
    namedBrokerIds: namedBrokers.map((b) => b.brokerId),
    ownerProfilePriorIds: bootstrap.hiddenTruth.ownerProfilePriors.map((p) => p.priorId),

    marketFormation: buildMarketFormationSummary(bootstrap.hiddenTruth.marketFormation),
  });
}

// ---------------------------------------------------------------------------
// Validate invariants on summary
// ---------------------------------------------------------------------------

/**
 * Validate that a BigWorldBootstrapSummary satisfies all invariants.
 * Returns array of error strings (empty = valid).
 */
export function assertBigWorldSummaryInvariants(
  summary: BigWorldBootstrapSummary,
): string[] {
  const errors: string[] = [];

  if (summary.version !== 1) {
    errors.push(`Expected version 1, got ${summary.version}`);
  }
  if (summary.marketCellCount < 3) {
    errors.push(`Market cells must be >= 3, got ${summary.marketCellCount}`);
  }
  if (summary.totalBrokerCount < 8) {
    errors.push(`Total brokers must be >= 8, got ${summary.totalBrokerCount}`);
  }
  if (summary.totalListingCount < 20) {
    errors.push(`Total comparable supply must be >= 20, got ${summary.totalListingCount}`);
  }
  if (summary.totalDemandUnitCount < 60) {
    errors.push(`Total demand units must be >= 60, got ${summary.totalDemandUnitCount}`);
  }
  if (summary.ownerProfilePriorCount < 3) {
    errors.push(`Owner profile priors must be >= 3, got ${summary.ownerProfilePriorCount}`);
  }
  if (summary.acnNetworkCount < 3) {
    errors.push(`ACN networks must be >= 3, got ${summary.acnNetworkCount}`);
  }

  if (!summary.invariantCheck.marketCellsGte3) errors.push('Invariant check marketCellsGte3 failed');
  if (!summary.invariantCheck.rivalBrokersGte8) errors.push('Invariant check rivalBrokersGte8 failed');
  if (!summary.invariantCheck.comparableSupplyGte20) errors.push('Invariant check comparableSupplyGte20 failed');
  if (!summary.invariantCheck.demandUnitsGte60) errors.push('Invariant check demandUnitsGte60 failed');
  if (!summary.invariantCheck.ownerProfilePriorsGte3) errors.push('Invariant check ownerProfilePriorsGte3 failed');
  if (!summary.invariantCheck.acnNetworksGte3) errors.push('Invariant check acnNetworksGte3 failed');

  return errors;
}

// ---------------------------------------------------------------------------
// Old-save normalization: produces summary + seed only, NO hidden world
// ---------------------------------------------------------------------------

/**
 * Normalize an old save into a BigWorldNormalizedSave.
 *
 * Returns:
 *   - summary (counts + refs extracted from MarketOpeningSnapshot)
 *   - seed (for deterministic re-bootstrap)
 *   - marketOpeningSnapshot (backward compat, if present)
 *
 * Does NOT return:
 *   - hidden truth (no acnProfiles, no owner priors, no full entities)
 *   - materialized entities (no broker/listing/customer objects)
 *   - opening POV (no projection)
 *
 * The runtime must re-bootstrap from seed to get full state.
 */
export function normalizeOldSave(state: {
  runContext?: {
    marketOpeningSnapshot?: unknown;
    runSeed?: unknown;
    rngSeed?: unknown;
  };
}): BigWorldNormalizedSave {
  const snapshot = readMarketOpeningSnapshot(state);
  if (!snapshot) {
    return Object.freeze({
      valid: false,
      summary: null,
      seed: null,
      marketOpeningSnapshot: null,
    });
  }

  const namedBrokers = snapshot.brokerNetwork.namedBrokers;
  const shadowBrokerCount = snapshot.brokerNetwork.shadowBrokerCount;
  const shadowListings = snapshot.listingInventory.shadowListingCount;
  const directRivalListings = snapshot.listingInventory.directRivalListingCount;
  const totalDemandUnits = snapshot.customerDemand.shadowCustomerCount;

  const invariantCheck = {
    marketCellsGte3: snapshot.marketCells.length >= 3,
    rivalBrokersGte8: (namedBrokers.length + shadowBrokerCount) >= 8,
    comparableSupplyGte20: (shadowListings + directRivalListings) >= 20,
    demandUnitsGte60: totalDemandUnits >= 60,
    ownerProfilePriorsGte3: false, // old saves don't have owner priors
    acnNetworksGte3: snapshot.acnNetworks.length >= 3,
  };

  // For old saves, construct a minimal scaleManifest from snapshot counts
  const oldScaleManifest: ScaleManifest = {
    totalListings: shadowListings + directRivalListings,
    totalOwners: 0,
    totalCustomers: totalDemandUnits,
    totalBrokers: namedBrokers.length + shadowBrokerCount,
    marketCells: snapshot.marketCells.length,
    microCells: 0,
    acnNetworks: snapshot.acnNetworks.length,
    supportingInfoCount: 0,
    historicalTransactionCount: snapshot.listingInventory.recentTransactionCount,
    diversityCoverage: {
      ownerArchetypeDiversity: 0,
      listingTypeDiversity: 0,
      priceBandDiversity: 0,
      demandSegmentDiversity: 0,
      brokerStyleDiversity: 0,
      marketCellCount: snapshot.marketCells.length,
      ownerTypeDistribution: {},
      listingLayoutDistribution: {},
      priceBandDistribution: {},
      customerSegmentDistribution: {},
      brokerStyleDistribution: {},
      marketCellDistribution: {},
      hotColdSplit: {
        materializedCustomers: 0,
        shadowClusterUnits: totalDemandUnits,
        totalDemandUnits,
        materializedListingCount: directRivalListings,
        shadowListingCount: shadowListings,
      },
    },
    sourceReadinessCoverage: {
      totalSupportingInfoRecords: 0,
      categoryCoverage: 0,
      coveredSourceKinds: [],
      coveragePct: 0,
      categoryCounts: {},
    },
    meetsHundredScaleThresholds: {
      listingsGte100: (shadowListings + directRivalListings) >= 100,
      ownersGte100: false,
      customersGte300: totalDemandUnits >= 300,
      marketCellsGte5: snapshot.marketCells.length >= 5,
      acnNetworksGte3: snapshot.acnNetworks.length >= 3,
      brokersGte20: (namedBrokers.length + shadowBrokerCount) >= 20,
    },
    meetsMegaScaleThresholds: {
      listingsGte300: false,
      ownersGte300: false,
      customersGte1000: false,
      brokersGte60: false,
      marketCellsGte8: false,
      acnNetworksGte5: false,
    },
    meetsSuperMarketScaleThresholds: {
      listingsGte300: false,
      ownersGte300: false,
      customersGte1000: false,
      brokersGte60: false,
      marketCellsGte8: false,
      microCellsGte24: false,
      acnNetworksGte5: false,
      supportingInfoGte80: false,
    },
    meetsMarketMegaScaleThresholds: {
      listingsGte500: false,
      ownersGte500: false,
      customersGte3000: false,
      brokersGte100: false,
      marketCellsGte20: false,
      microCellsGte60: false,
      acnNetworksGte7: false,
      supportingInfoGte160: false,
      historicalTransactionsGte50: false,
    },
  };

  const summary: BigWorldBootstrapSummary = Object.freeze({
    version: 1 as const,
    seed: snapshot.seed,
    scenarioName: snapshot.scenarioName,
    difficultyId: snapshot.difficultyId,
    playerCaseCount: snapshot.playerCaseCount,

    marketCellCount: snapshot.marketCells.length,
    acnNetworkCount: snapshot.acnNetworks.length,
    namedBrokerCount: namedBrokers.length,
    shadowBrokerCount,
    totalBrokerCount: namedBrokers.length + shadowBrokerCount,
    materializedListingCount: directRivalListings,
    shadowListingCount: shadowListings,
    directRivalListingCount: directRivalListings,
    totalListingCount: shadowListings + directRivalListings,
    materializedCustomerCount: 0, // old saves don't have materialized customers
    shadowDemandClusterCount: 0,
    totalDemandUnitCount: totalDemandUnits,
    ownerProfilePriorCount: 0, // old saves don't have owner priors
    ownerExpectationAnchorCount: 0,
    ownerPerceptionLagCount: 0,
    historicalTransactionCount: snapshot.listingInventory.recentTransactionCount,
    recentWorldEventCount: snapshot.recentWorldEvents.length,
    attentionRelationCount: 0,

    invariantCheck,

    scaleManifest: oldScaleManifest,

    marketCellIds: snapshot.marketCells.map((c) => c.id),
    acnNetworkIds: snapshot.acnNetworks.map((a) => a.id),
    namedBrokerIds: namedBrokers.map((b) => b.id),
    ownerProfilePriorIds: [], // old saves don't have owner priors

    // Old saves don't have market formation data
    marketFormation: {
      listingPoolCount: 0,
      ownerPoolCount: 0,
      customerPoolCount: 0,
      brokerPoolCount: 0,
      cellThicknessCount: 0,
      listingStateDistribution: { fresh: 0, hot: 0, warm: 0, cold: 0, price_reduced: 0, stale: 0, scarce: 0 },
      ownerStateDistribution: { urgent: 0, watchful: 0, stubborn: 0, cooperative: 0, upgrading: 0, financial_stress: 0, emotional: 0 },
      customerStateDistribution: { first_home: 0, upgrade: 0, school_district: 0, investment: 0, budget_sensitive: 0, time_sensitive: 0, hesitant: 0 },
      brokerStateDistribution: { listing_maintenance: 0, customer_hunting: 0, cooperation_focused: 0, competition_focused: 0, resource_constrained: 0, balanced: 0 },
      totalActiveSupply: 0,
      totalActiveDemand: 0,
      avgLiquidity: 0,
      avgRivalPressure: 0,
      meetsMarketFormationThresholds: {
        listingPoolGte100: false,
        ownerPoolGte100: false,
        customerPoolGte200: false,
        brokerPoolGte50: false,
        cellThicknessGte10: false,
        activeSupplyGte200: false,
        activeDemandGte200: false,
        liquidityLevelGte30: false,
        listingStatesCoveredGte4: false,
        ownerStatesCoveredGte4: false,
        customerStatesCoveredGte4: false,
        brokerStatesCoveredGte3: false,
      },
      // Old saves don't have market economy data
      economy: {
        brokerPoolCount: 0,
        listingPoolCount: 0,
        customerPoolCount: 0,
        orgPoolCount: 0,
        opportunityCostCount: 0,
        avgBrokerUtilization: 0,
        avgListingVelocity: 0,
        avgConversionProbability: 0,
        bottleneckedBrokerCount: 0,
        atRiskCustomerCount: 0,
        totalDailyEnergyInflow: 0,
        totalDailyEnergyOutflow: 0,
        totalWeeklyBudgetInflow: 0,
        totalWeeklyBudgetOutflow: 0,
        meetsMarketEconomyThresholds: {
          brokerPoolsGte50: false,
          listingPoolsGte100: false,
          customerPoolsGte100: false,
          orgPoolsGte5: false,
          opportunityCostsGte50: false,
          avgBrokerUtilizationGte30: false,
          avgListingVelocityGte20: false,
          avgConversionProbabilityGte10: false,
          bottleneckedBrokersGte5: false,
          atRiskCustomersGte10: false,
          energyFlowBalanced: false,
          budgetFlowBalanced: false,
        },
        ledgerReady: false,
      },
    },
  });

  // Extract seed from runContext if available
  const runSeed = state?.runContext?.runSeed;
  const seed = typeof runSeed === 'number' ? runSeed : snapshot.seed;

  return Object.freeze({
    valid: true,
    summary,
    seed,
    marketOpeningSnapshot: snapshot,
  });
}
