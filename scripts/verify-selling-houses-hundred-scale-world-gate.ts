/**
 * Big World Round 7 — Hundred-Scale World Gate
 *
 * Verifies that the hundred-scale profile generates a world with:
 *   - 100+ materialized/shadow listings
 *   - 100+ owner profile priors
 *   - 5+ market cells
 *   - 3+ ACN/networks
 *   - 20+ named/shadow brokers
 *   - 300+ demand/customer units (hot + cold)
 *
 * Also verifies:
 *   - Standard difficulty still works (backward compat)
 *   - Scale manifest is present and accurate
 *   - Hot/cold split is correct
 *   - Materialized/aggregate split is correct
 *   - Each entity has source/causal provenance
 *
 * Usage: npx tsx scripts/verify-selling-houses-hundred-scale-world-gate.ts
 */

import { createBigWorldBootstrap, buildScaleManifest } from '../src/selling-houses/domain/world-model/bigWorldBootstrap.js';
import type { BigWorldScalePolicy } from '../src/selling-houses/domain/world-model/bigWorldTypes.js';

// ── Helpers ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function hardFail(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    failed++;
    failures.push(message);
    console.error(`  [FAIL] ${message}`);
  }
}

const SEED = 20260513;

// ── Hundred-scale policy ────────────────────────────────────────────────

const HUNDRED_SCALE_POLICY: BigWorldScalePolicy = {
  minMarketCells: 5,
  maxMarketCells: 7,
  acnCount: 3,
  namedBrokersPerAcn: 4,
  shadowBrokersPerAcn: 8,
  shadowListingsPerCell: 20,
  directRivalListingsPerCell: 5,
  materializedCustomersPerCell: 20,
  shadowAggregateClustersPerCell: 8,
  ownerProfilePriorCount: 100,
  customerCaseRatio: 10,
};

// ══════════════════════════════════════════════════════════════════════════
// CHECK 1: Hundred-scale profile generates expected counts
// ══════════════════════════════════════════════════════════════════════════

console.log('=== Big World Round 7 — Hundred-Scale World Gate ===\n');

console.log('--- CHECK 1: Hundred-scale profile counts ---');

const hundredBootstrap = createBigWorldBootstrap({
  seed: SEED,
  scenarioName: '百量级测试',
  difficultyId: 'standard', // overridden by scaleOverride
  playerCaseCount: 5,
  scaleOverride: HUNDRED_SCALE_POLICY,
});

const summary = buildScaleManifest(hundredBootstrap);

// Listings
const totalListings = summary.totalListings;
hardFail(totalListings >= 100, `totalListings >= 100 (got ${totalListings})`);

// Owners
const totalOwners = summary.totalOwners;
hardFail(totalOwners >= 100, `totalOwners >= 100 (got ${totalOwners})`);

// Market cells
const marketCells = summary.marketCells;
hardFail(marketCells >= 5, `marketCells >= 5 (got ${marketCells})`);

// ACN networks
const acnNetworks = summary.acnNetworks;
hardFail(acnNetworks >= 3, `acnNetworks >= 3 (got ${acnNetworks})`);

// Brokers
const totalBrokers = summary.totalBrokers;
hardFail(totalBrokers >= 20, `totalBrokers >= 20 (got ${totalBrokers})`);

// Demand units (hot + cold)
const totalDemand = summary.totalCustomers;
hardFail(totalDemand >= 300, `totalDemandUnits >= 300 (got ${totalDemand})`);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 2: Scale manifest thresholds match
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 2: Scale manifest thresholds ---');

const thresholds = summary.meetsHundredScaleThresholds;
hardFail(thresholds.listingsGte100, 'meetsHundredScaleThresholds.listingsGte100');
hardFail(thresholds.ownersGte100, 'meetsHundredScaleThresholds.ownersGte100');
hardFail(thresholds.customersGte300, 'meetsHundredScaleThresholds.customersGte300');
hardFail(thresholds.marketCellsGte5, 'meetsHundredScaleThresholds.marketCellsGte5');
hardFail(thresholds.acnNetworksGte3, 'meetsHundredScaleThresholds.acnNetworksGte3');
hardFail(thresholds.brokersGte20, 'meetsHundredScaleThresholds.brokersGte20');

// ══════════════════════════════════════════════════════════════════════════
// CHECK 3: Hot/cold split correctness
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 3: Hot/cold split ---');

const hotCold = summary.diversityCoverage.hotColdSplit;
hardFail(hotCold.materializedCustomers > 0, `materializedCustomers > 0 (got ${hotCold.materializedCustomers})`);
hardFail(hotCold.shadowClusterUnits > 0, `shadowClusterUnits > 0 (got ${hotCold.shadowClusterUnits})`);
hardFail(
  hotCold.totalDemandUnits === hotCold.materializedCustomers + hotCold.shadowClusterUnits,
  `totalDemandUnits = materialized + shadow (${hotCold.totalDemandUnits} = ${hotCold.materializedCustomers} + ${hotCold.shadowClusterUnits})`,
);
hardFail(hotCold.materializedListingCount > 0, `materializedListingCount > 0 (got ${hotCold.materializedListingCount})`);
hardFail(hotCold.shadowListingCount > 0, `shadowListingCount > 0 (got ${hotCold.shadowListingCount})`);
hardFail(
  hotCold.materializedListingCount + hotCold.shadowListingCount === totalListings,
  `listing split sums to total (${hotCold.materializedListingCount} + ${hotCold.shadowListingCount} = ${totalListings})`,
);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 4: Standard difficulty backward compatibility
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 4: Standard difficulty backward compat ---');

const standardBootstrap = createBigWorldBootstrap({
  seed: SEED,
  scenarioName: '标准测试',
  difficultyId: 'standard',
  playerCaseCount: 5,
});

const standardSummary = buildScaleManifest(standardBootstrap);
hardFail(standardSummary.totalListings > 0, `standard: totalListings > 0 (got ${standardSummary.totalListings})`);
hardFail(standardSummary.totalOwners > 0, `standard: totalOwners > 0 (got ${standardSummary.totalOwners})`);
hardFail(standardSummary.totalCustomers > 0, `standard: totalCustomers > 0 (got ${standardSummary.totalCustomers})`);
hardFail(standardSummary.totalBrokers > 0, `standard: totalBrokers > 0 (got ${standardSummary.totalBrokers})`);
hardFail(standardSummary.marketCells >= 3, `standard: marketCells >= 3 (got ${standardSummary.marketCells})`);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 5: Source provenance exists on entities
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 5: Source provenance ---');

const priors = hundredBootstrap.hiddenTruth.ownerProfilePriors;
hardFail(priors.length > 0, `ownerProfilePriors exist (${priors.length})`);
hardFail(
  priors.every((p) => p.provenance.sourceRef !== undefined),
  'all ownerProfilePriors have provenance.sourceRef',
);
hardFail(
  priors.every((p) => p.provenance.origin === 'owner_prior'),
  'all ownerProfilePriors have origin=owner_prior',
);

const anchors = hundredBootstrap.hiddenTruth.ownerExpectationAnchors;
hardFail(anchors.length > 0, `ownerExpectationAnchors exist (${anchors.length})`);
hardFail(
  anchors.every((a) => a.provenance.sourceRef !== undefined),
  'all ownerExpectationAnchors have provenance.sourceRef',
);

const lags = hundredBootstrap.hiddenTruth.ownerPerceptionLags;
hardFail(lags.length > 0, `ownerPerceptionLags exist (${lags.length})`);
hardFail(
  lags.every((l) => l.provenance.sourceRef !== undefined),
  'all ownerPerceptionLags have provenance.sourceRef',
);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 6: Deterministic replay
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 6: Deterministic replay ---');

const replay1 = createBigWorldBootstrap({
  seed: SEED,
  scenarioName: '百量级测试',
  difficultyId: 'standard',
  playerCaseCount: 5,
  scaleOverride: HUNDRED_SCALE_POLICY,
});

const replay2 = createBigWorldBootstrap({
  seed: SEED,
  scenarioName: '百量级测试',
  difficultyId: 'standard',
  playerCaseCount: 5,
  scaleOverride: HUNDRED_SCALE_POLICY,
});

hardFail(replay1.materializedEntities.listings.length === replay2.materializedEntities.listings.length, 'replay: same listing count');
hardFail(replay1.materializedEntities.brokers.length === replay2.materializedEntities.brokers.length, 'replay: same broker count');
hardFail(replay1.hiddenTruth.ownerProfilePriors.length === replay2.hiddenTruth.ownerProfilePriors.length, 'replay: same owner count');
hardFail(replay1.coldAggregate.shadowDemandClusters.length === replay2.coldAggregate.shadowDemandClusters.length, 'replay: same cluster count');

// Byte-identical JSON
const json1 = JSON.stringify(replay1);
const json2 = JSON.stringify(replay2);
hardFail(json1 === json2, 'replay: byte-identical bootstrap JSON');

// ══════════════════════════════════════════════════════════════════════════
// CHECK 7: Cold aggregate is not empty
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 7: Cold aggregate data ---');

hardFail(
  hundredBootstrap.coldAggregate.shadowDemandClusters.length > 0,
  `shadowDemandClusters > 0 (got ${hundredBootstrap.coldAggregate.shadowDemandClusters.length})`,
);
hardFail(
  hundredBootstrap.coldAggregate.historicalTransactions.length > 0,
  `historicalTransactions > 0 (got ${hundredBootstrap.coldAggregate.historicalTransactions.length})`,
);

// Clusters have provenance
const clusters = hundredBootstrap.coldAggregate.shadowDemandClusters;
hardFail(
  clusters.every((c) => c.provenance.sourceRef !== undefined),
  'all shadowDemandClusters have provenance',
);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 8: No Date.now / Math.random leakage
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 8: No randomness leakage ---');

// Deterministic: different seed → different output
const differentSeed = createBigWorldBootstrap({
  seed: SEED + 1,
  scenarioName: '百量级测试',
  difficultyId: 'standard',
  playerCaseCount: 5,
  scaleOverride: HUNDRED_SCALE_POLICY,
});

hardFail(
  differentSeed.materializedEntities.listings.length !== hundredBootstrap.materializedEntities.listings.length
  || differentSeed.hiddenTruth.ownerProfilePriors.length !== hundredBootstrap.hiddenTruth.ownerProfilePriors.length
  || JSON.stringify(differentSeed) !== json1,
  'different seed → different output (no Math.random leakage)',
);

// ══════════════════════════════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════════════════════════════

console.log('\n=== Scale Manifest ===');
console.log(`  totalListings:       ${summary.totalListings}`);
console.log(`  totalOwners:         ${summary.totalOwners}`);
console.log(`  totalCustomers:      ${summary.totalCustomers}`);
console.log(`  totalBrokers:        ${summary.totalBrokers}`);
console.log(`  marketCells:         ${summary.marketCells}`);
console.log(`  acnNetworks:         ${summary.acnNetworks}`);
console.log(`  materialized:        ${hotCold.materializedCustomers} customers, ${hotCold.materializedListingCount} listings`);
console.log(`  cold/aggregate:      ${hotCold.shadowClusterUnits} cluster units, ${hotCold.shadowListingCount} shadow listings`);

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);

if (failed > 0) {
  console.error('\nFailures:');
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
}

console.log('\nAll checks passed.');
