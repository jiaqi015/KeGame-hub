/**
 * Big World Round 7 — Diversity Coverage Gate
 *
 * Verifies that the hundred-scale world has meaningful structural diversity:
 *   - Owner archetype diversity (not all same type)
 *   - Listing type diversity (not all same layout)
 *   - Price band diversity (not all same price range)
 *   - Demand segment diversity (not all same segment)
 *   - Broker style diversity (not all same style)
 *   - Market cell distribution (not all in one cell)
 *
 * This gate MUST FAIL if the implementation generates homogenous data
 * by just copying the same template N times.
 *
 * Usage: npx tsx scripts/verify-selling-houses-diversity-coverage-gate.ts
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

function getDistributionEntropy(dist: Record<string, number>): number {
  const total = Object.values(dist).reduce((s, v) => s + v, 0);
  if (total === 0) return 0;
  let entropy = 0;
  for (const count of Object.values(dist)) {
    if (count > 0) {
      const p = count / total;
      entropy -= p * Math.log2(p);
    }
  }
  return entropy;
}

const SEED = 20260513;

const HUNDRED_SCALE_POLICY: BigWorldScalePolicy = {
  minMarketCells: 5,
  maxMarketCells: 7,
  acnCount: 3,
  namedBrokersPerAcn: 4,
  shadowBrokersPerAcn: 8,
  shadowListingsPerCell: 12,
  directRivalListingsPerCell: 5,
  materializedCustomersPerCell: 15,
  shadowAggregateClustersPerCell: 6,
  ownerProfilePriorCount: 20,
  customerCaseRatio: 10,
};

// ══════════════════════════════════════════════════════════════════════════
// Generate world
// ══════════════════════════════════════════════════════════════════════════

console.log('=== Big World Round 7 — Diversity Coverage Gate ===\n');

const bootstrap = createBigWorldBootstrap({
  seed: SEED,
  scenarioName: '多样性测试',
  difficultyId: 'standard',
  playerCaseCount: 5,
  scaleOverride: HUNDRED_SCALE_POLICY,
});

const summary = buildScaleManifest(bootstrap);
const diversity = summary.diversityCoverage;

// ══════════════════════════════════════════════════════════════════════════
// CHECK 1: Owner archetype diversity
// ══════════════════════════════════════════════════════════════════════════

console.log('--- CHECK 1: Owner archetype diversity ---');

const ownerTypes = Object.keys(diversity.ownerTypeDistribution);
hardFail(ownerTypes.length >= 5, `ownerArchetypeDiversity >= 5 types (got ${ownerTypes.length})`);

// No single type should dominate > 50%
const ownerTotal = Object.values(diversity.ownerTypeDistribution).reduce((s, v) => s + v, 0);
const maxOwnerCount = Math.max(...Object.values(diversity.ownerTypeDistribution));
hardFail(
  maxOwnerCount / ownerTotal < 0.5,
  `no single owner type dominates >50% (max: ${maxOwnerCount}/${ownerTotal} = ${(maxOwnerCount / ownerTotal * 100).toFixed(1)}%)`,
);

// Entropy check — should be > 2 bits for 5+ types
const ownerEntropy = getDistributionEntropy(diversity.ownerTypeDistribution);
hardFail(ownerEntropy > 2.0, `owner type entropy > 2.0 bits (got ${ownerEntropy.toFixed(2)})`);

console.log(`  Types: ${ownerTypes.join(', ')}`);
console.log(`  Distribution: ${JSON.stringify(diversity.ownerTypeDistribution)}`);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 2: Listing type diversity
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 2: Listing type diversity ---');

const listingLayouts = Object.keys(diversity.listingLayoutDistribution);
hardFail(listingLayouts.length >= 4, `listingTypeDiversity >= 4 layouts (got ${listingLayouts.length})`);

const listingTotal = Object.values(diversity.listingLayoutDistribution).reduce((s, v) => s + v, 0);
const maxLayoutCount = Math.max(...Object.values(diversity.listingLayoutDistribution));
hardFail(
  maxLayoutCount / listingTotal < 0.4,
  `no single layout dominates >40% (max: ${maxLayoutCount}/${listingTotal} = ${(maxLayoutCount / listingTotal * 100).toFixed(1)}%)`,
);

const layoutEntropy = getDistributionEntropy(diversity.listingLayoutDistribution);
hardFail(layoutEntropy > 2.0, `listing layout entropy > 2.0 bits (got ${layoutEntropy.toFixed(2)})`);

console.log(`  Layouts: ${listingLayouts.join(', ')}`);
console.log(`  Distribution: ${JSON.stringify(diversity.listingLayoutDistribution)}`);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 3: Price band diversity
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 3: Price band diversity ---');

const priceBands = Object.keys(diversity.priceBandDistribution);
hardFail(priceBands.length >= 3, `priceBandDiversity >= 3 bands (got ${priceBands.length})`);

const priceTotal = Object.values(diversity.priceBandDistribution).reduce((s, v) => s + v, 0);
const maxPriceCount = Math.max(...Object.values(diversity.priceBandDistribution));
hardFail(
  maxPriceCount / priceTotal < 0.5,
  `no single price band dominates >50% (max: ${maxPriceCount}/${priceTotal} = ${(maxPriceCount / priceTotal * 100).toFixed(1)}%)`,
);

console.log(`  Bands: ${priceBands.join(', ')}`);
console.log(`  Distribution: ${JSON.stringify(diversity.priceBandDistribution)}`);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 4: Demand segment diversity
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 4: Demand segment diversity ---');

const demandSegs = Object.keys(diversity.customerSegmentDistribution);
hardFail(demandSegs.length >= 3, `demandSegmentDiversity >= 3 segments (got ${demandSegs.length})`);

const demandTotal = Object.values(diversity.customerSegmentDistribution).reduce((s, v) => s + v, 0);
const maxDemandCount = Math.max(...Object.values(diversity.customerSegmentDistribution));
hardFail(
  maxDemandCount / demandTotal < 0.5,
  `no single demand segment dominates >50% (max: ${maxDemandCount}/${demandTotal} = ${(maxDemandCount / demandTotal * 100).toFixed(1)}%)`,
);

console.log(`  Segments: ${demandSegs.join(', ')}`);
console.log(`  Distribution: ${JSON.stringify(diversity.customerSegmentDistribution)}`);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 5: Broker style diversity
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 5: Broker style diversity ---');

const brokerStyles = Object.keys(diversity.brokerStyleDistribution);
hardFail(brokerStyles.length >= 3, `brokerStyleDiversity >= 3 styles (got ${brokerStyles.length})`);

const brokerTotal = Object.values(diversity.brokerStyleDistribution).reduce((s, v) => s + v, 0);
const maxBrokerCount = Math.max(...Object.values(diversity.brokerStyleDistribution));
hardFail(
  maxBrokerCount / brokerTotal < 0.5,
  `no single broker style dominates >50% (max: ${maxBrokerCount}/${brokerTotal} = ${(maxBrokerCount / brokerTotal * 100).toFixed(1)}%)`,
);

console.log(`  Styles: ${brokerStyles.join(', ')}`);
console.log(`  Distribution: ${JSON.stringify(diversity.brokerStyleDistribution)}`);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 6: Market cell distribution
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 6: Market cell distribution ---');

const cellIds = Object.keys(diversity.marketCellDistribution);
hardFail(cellIds.length >= 5, `marketCellCount >= 5 cells with listings (got ${cellIds.length})`);

const cellTotal = Object.values(diversity.marketCellDistribution).reduce((s, v) => s + v, 0);
const maxCellCount = Math.max(...Object.values(diversity.marketCellDistribution));
hardFail(
  maxCellCount / cellTotal < 0.4,
  `no single cell dominates >40% (max: ${maxCellCount}/${cellTotal} = ${(maxCellCount / cellTotal * 100).toFixed(1)}%)`,
);

// Each cell should have at least 3 listings
for (const [cellId, count] of Object.entries(diversity.marketCellDistribution)) {
  hardFail(count >= 3, `cell ${cellId} has >= 3 listings (got ${count})`);
}

console.log(`  Cells: ${cellIds.join(', ')}`);
console.log(`  Distribution: ${JSON.stringify(diversity.marketCellDistribution)}`);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 7: Cross-entity diversity (no single combination dominates)
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 7: Cross-entity diversity ---');

// Check that listing layout × price band combinations are diverse
const comboMap: Record<string, number> = {};
for (const listing of bootstrap.materializedEntities.listings) {
  const key = `${listing.layout}|${listing.priceBand}`;
  comboMap[key] = (comboMap[key] ?? 0) + 1;
}
const comboKeys = Object.keys(comboMap);
hardFail(comboKeys.length >= 10, `layout×priceBand combos >= 10 (got ${comboKeys.length})`);

const comboMax = Math.max(...Object.values(comboMap));
const comboTotal = Object.values(comboMap).reduce((s, v) => s + v, 0);
hardFail(
  comboMax / comboTotal < 0.2,
  `no single layout×priceBand combo dominates >20% (max: ${comboMax}/${comboTotal})`,
);

console.log(`  Layout×PriceBand combos: ${comboKeys.length}`);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 8: Hundred-scale diversity is strictly greater than standard
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 8: Hundred-scale vs standard diversity ---');

const standardBootstrap = createBigWorldBootstrap({
  seed: SEED,
  scenarioName: '标准对比',
  difficultyId: 'standard',
  playerCaseCount: 5,
});

const standardSummary = buildScaleManifest(standardBootstrap);
const stdDiv = standardSummary.diversityCoverage;

hardFail(
  summary.totalListings > standardSummary.totalListings,
  `hundred-scale listings (${summary.totalListings}) > standard (${standardSummary.totalListings})`,
);
hardFail(
  summary.totalOwners > standardSummary.totalOwners,
  `hundred-scale owners (${summary.totalOwners}) > standard (${standardSummary.totalOwners})`,
);
hardFail(
  summary.totalCustomers > standardSummary.totalCustomers,
  `hundred-scale customers (${summary.totalCustomers}) > standard (${standardSummary.totalCustomers})`,
);
hardFail(
  summary.totalBrokers > standardSummary.totalBrokers,
  `hundred-scale brokers (${summary.totalBrokers}) > standard (${standardSummary.totalBrokers})`,
);
hardFail(
  diversity.ownerArchetypeDiversity >= stdDiv.ownerArchetypeDiversity,
  `hundred-scale owner diversity (${diversity.ownerArchetypeDiversity}) >= standard (${stdDiv.ownerArchetypeDiversity})`,
);
hardFail(
  diversity.listingTypeDiversity >= stdDiv.listingTypeDiversity,
  `hundred-scale listing diversity (${diversity.listingTypeDiversity}) >= standard (${stdDiv.listingTypeDiversity})`,
);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 9: No homogenous copy-paste detection
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 9: Homogenous copy-paste detection ---');

// If all listings have the same ask price ±1%, it's copy-paste
const askPrices = bootstrap.materializedEntities.listings.map((l) => l.askPrice);
const avgPrice = askPrices.reduce((s, p) => s + p, 0) / askPrices.length;
const priceVariance = askPrices.reduce((s, p) => s + (p - avgPrice) ** 2, 0) / askPrices.length;
const priceStdDev = Math.sqrt(priceVariance);
hardFail(
  priceStdDev > avgPrice * 0.05,
  `listing price std dev > 5% of mean (stddev=${priceStdDev.toFixed(1)}, mean=${avgPrice.toFixed(1)}, ratio=${(priceStdDev / avgPrice * 100).toFixed(1)}%)`,
);

// If all owner rigidity values are identical, it's copy-paste
const rigidityValues = bootstrap.hiddenTruth.ownerProfilePriors.map((p) => p.priceAnchorRigidity);
const uniqueRigidity = new Set(rigidityValues);
hardFail(
  uniqueRigidity.size >= 5,
  `owner rigidity has >= 5 distinct values (got ${uniqueRigidity.size})`,
);

// If all customer urgencies are identical, it's copy-paste
const urgencyValues = bootstrap.materializedEntities.customers.map((c) => c.urgency);
const uniqueUrgency = new Set(urgencyValues);
hardFail(
  uniqueUrgency.size >= 5,
  `customer urgency has >= 5 distinct values (got ${uniqueUrgency.size})`,
);

// ══════════════════════════════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════════════════════════════

console.log('\n=== Diversity Coverage Summary ===');
console.log(`  Owner archetypes:    ${diversity.ownerArchetypeDiversity} types (entropy: ${ownerEntropy.toFixed(2)} bits)`);
console.log(`  Listing layouts:     ${diversity.listingTypeDiversity} types (entropy: ${layoutEntropy.toFixed(2)} bits)`);
console.log(`  Price bands:         ${diversity.priceBandDiversity} bands`);
console.log(`  Demand segments:     ${diversity.demandSegmentDiversity} segments`);
console.log(`  Broker styles:       ${diversity.brokerStyleDiversity} styles`);
console.log(`  Market cells:        ${diversity.marketCellCount} cells`);
console.log(`  Layout×Price combos: ${comboKeys.length}`);
console.log(`  Price stddev:        ${priceStdDev.toFixed(1)} (${(priceStdDev / avgPrice * 100).toFixed(1)}% of mean)`);

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);

if (failed > 0) {
  console.error('\nFailures:');
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
}

console.log('\nAll diversity checks passed.');
