/**
 * Big World Round 8 — Mega-Diversity Gate
 *
 * Verifies that the mega-scale world has meaningful structural diversity:
 *   - Owner archetypes >= 20
 *   - Listing layouts >= 8
 *   - Price bands >= 6
 *   - Demand segments >= 10
 *   - Broker styles >= 8
 *   - Source kind coverage (all core source kinds)
 *   - No homogenous copy-paste
 *   - Cross-cell diversity
 *
 * Usage: npx tsx scripts/verify-selling-houses-mega-diversity-gate.ts
 */

import { createBigWorldBootstrap, buildScaleManifest } from '../src/selling-houses/domain/world-model/bigWorldBootstrap.js';
import type { BigWorldScalePolicy } from '../src/selling-houses/domain/world-model/bigWorldTypes.js';
import { SOURCE_TO_CAUSAL_MAP } from '../src/selling-houses/domain/world-model/informationSourceTypes.js';

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

const MEGA_SCALE_POLICY: BigWorldScalePolicy = {
  minMarketCells: 10,
  maxMarketCells: 12,
  acnCount: 5,
  namedBrokersPerAcn: 5,
  shadowBrokersPerAcn: 10,
  shadowListingsPerCell: 25,
  directRivalListingsPerCell: 7,
  materializedCustomersPerCell: 15,
  shadowAggregateClustersPerCell: 12,
  ownerProfilePriorCount: 300,
  customerCaseRatio: 10,
};

// ══════════════════════════════════════════════════════════════════════════
// Generate world
// ══════════════════════════════════════════════════════════════════════════

console.log('=== Big World Round 8 — Mega-Diversity Gate ===\n');

const bootstrap = createBigWorldBootstrap({
  seed: SEED,
  scenarioName: '几百量级多样性测试',
  difficultyId: 'standard',
  playerCaseCount: 5,
  scaleOverride: MEGA_SCALE_POLICY,
});

const summary = buildScaleManifest(bootstrap);
const diversity = summary.diversityCoverage;

// ══════════════════════════════════════════════════════════════════════════
// CHECK 1: Owner archetype diversity >= 20
// ══════════════════════════════════════════════════════════════════════════

console.log('--- CHECK 1: Owner archetype diversity ---');

const ownerTypes = Object.keys(diversity.ownerTypeDistribution);
hardFail(ownerTypes.length >= 20, `ownerArchetypeDiversity >= 20 types (got ${ownerTypes.length})`);

const ownerTotal = Object.values(diversity.ownerTypeDistribution).reduce((s, v) => s + v, 0);
const maxOwnerCount = Math.max(...Object.values(diversity.ownerTypeDistribution));
hardFail(
  maxOwnerCount / ownerTotal < 0.3,
  `no single owner type dominates >30% (max: ${maxOwnerCount}/${ownerTotal} = ${(maxOwnerCount / ownerTotal * 100).toFixed(1)}%)`,
);

const ownerEntropy = getDistributionEntropy(diversity.ownerTypeDistribution);
hardFail(ownerEntropy > 3.0, `owner type entropy > 3.0 bits (got ${ownerEntropy.toFixed(2)})`);

console.log(`  Types: ${ownerTypes.length} distinct types`);
console.log(`  Entropy: ${ownerEntropy.toFixed(2)} bits`);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 2: Listing type diversity >= 8
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 2: Listing type diversity ---');

const listingLayouts = Object.keys(diversity.listingLayoutDistribution);
hardFail(listingLayouts.length >= 8, `listingTypeDiversity >= 8 layouts (got ${listingLayouts.length})`);

const listingTotal = Object.values(diversity.listingLayoutDistribution).reduce((s, v) => s + v, 0);
const maxLayoutCount = Math.max(...Object.values(diversity.listingLayoutDistribution));
hardFail(
  maxLayoutCount / listingTotal < 0.3,
  `no single layout dominates >30% (max: ${maxLayoutCount}/${listingTotal} = ${(maxLayoutCount / listingTotal * 100).toFixed(1)}%)`,
);

const layoutEntropy = getDistributionEntropy(diversity.listingLayoutDistribution);
hardFail(layoutEntropy > 2.5, `listing layout entropy > 2.5 bits (got ${layoutEntropy.toFixed(2)})`);

console.log(`  Layouts: ${listingLayouts.length} distinct layouts`);
console.log(`  Entropy: ${layoutEntropy.toFixed(2)} bits`);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 3: Price band diversity >= 6
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 3: Price band diversity ---');

const priceBands = Object.keys(diversity.priceBandDistribution);
hardFail(priceBands.length >= 6, `priceBandDiversity >= 6 bands (got ${priceBands.length})`);

const priceTotal = Object.values(diversity.priceBandDistribution).reduce((s, v) => s + v, 0);
const maxPriceCount = Math.max(...Object.values(diversity.priceBandDistribution));
hardFail(
  maxPriceCount / priceTotal < 0.4,
  `no single price band dominates >40% (max: ${maxPriceCount}/${priceTotal} = ${(maxPriceCount / priceTotal * 100).toFixed(1)}%)`,
);

console.log(`  Bands: ${priceBands.length} distinct bands`);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 4: Demand segment diversity >= 10
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 4: Demand segment diversity ---');

const demandSegs = Object.keys(diversity.customerSegmentDistribution);
hardFail(demandSegs.length >= 10, `demandSegmentDiversity >= 10 segments (got ${demandSegs.length})`);

const demandTotal = Object.values(diversity.customerSegmentDistribution).reduce((s, v) => s + v, 0);
const maxDemandCount = Math.max(...Object.values(diversity.customerSegmentDistribution));
hardFail(
  maxDemandCount / demandTotal < 0.3,
  `no single demand segment dominates >30% (max: ${maxDemandCount}/${demandTotal} = ${(maxDemandCount / demandTotal * 100).toFixed(1)}%)`,
);

console.log(`  Segments: ${demandSegs.length} distinct segments`);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 5: Broker style diversity >= 8
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 5: Broker style diversity ---');

const brokerStyles = Object.keys(diversity.brokerStyleDistribution);
hardFail(brokerStyles.length >= 8, `brokerStyleDiversity >= 8 styles (got ${brokerStyles.length})`);

const brokerTotal = Object.values(diversity.brokerStyleDistribution).reduce((s, v) => s + v, 0);
const maxBrokerCount = Math.max(...Object.values(diversity.brokerStyleDistribution));
hardFail(
  maxBrokerCount / brokerTotal < 0.3,
  `no single broker style dominates >30% (max: ${maxBrokerCount}/${brokerTotal} = ${(maxBrokerCount / brokerTotal * 100).toFixed(1)}%)`,
);

console.log(`  Styles: ${brokerStyles.length} distinct styles`);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 6: Source kind coverage (all core source kinds)
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 6: Source kind coverage ---');

const sourceReadiness = summary.sourceReadinessCoverage;
const allSourceKinds = SOURCE_TO_CAUSAL_MAP.map((m) => m.sourceKind);
const coveredKinds = new Set(sourceReadiness.coveredSourceKinds);

// Check that at least 8 of the 15 source kinds are covered
const coveredCount = allSourceKinds.filter((k) => coveredKinds.has(k as any)).length;
hardFail(coveredCount >= 8, `source readiness covers >= 8 of ${allSourceKinds.length} source kinds (got ${coveredCount})`);

// Check that critical source kinds are covered
const criticalKinds = ['market_signal', 'comparable_transaction', 'supporting_facility_signal', 'micro_market_signal'] as const;
for (const kind of criticalKinds) {
  hardFail(coveredKinds.has(kind as any), `critical source kind '${kind}' is covered`);
}

console.log(`  Source kinds covered: ${coveredCount}/${allSourceKinds.length}`);
console.log(`  Coverage: ${sourceReadiness.coveragePct}%`);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 7: Cross-entity diversity
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 7: Cross-entity diversity ---');

const comboMap: Record<string, number> = {};
for (const listing of bootstrap.materializedEntities.listings) {
  const key = `${listing.layout}|${listing.priceBand}`;
  comboMap[key] = (comboMap[key] ?? 0) + 1;
}
const comboKeys = Object.keys(comboMap);
hardFail(comboKeys.length >= 30, `layout×priceBand combos >= 30 (got ${comboKeys.length})`);

const comboMax = Math.max(...Object.values(comboMap));
const comboTotal = Object.values(comboMap).reduce((s, v) => s + v, 0);
hardFail(
  comboMax / comboTotal < 0.15,
  `no single combo dominates >15% (max: ${comboMax}/${comboTotal})`,
);

console.log(`  Layout×PriceBand combos: ${comboKeys.length}`);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 8: Cross-cell distribution
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 8: Cross-cell distribution ---');

const cellIds = Object.keys(diversity.marketCellDistribution);
hardFail(cellIds.length >= 8, `marketCells with listings >= 8 (got ${cellIds.length})`);

const cellTotal = Object.values(diversity.marketCellDistribution).reduce((s, v) => s + v, 0);
const maxCellCount = Math.max(...Object.values(diversity.marketCellDistribution));
hardFail(
  maxCellCount / cellTotal < 0.3,
  `no single cell dominates >30% (max: ${maxCellCount}/${cellTotal})`,
);

console.log(`  Cells with listings: ${cellIds.length}`);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 9: Homogenous copy-paste detection
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 9: Homogenous copy-paste detection ---');

// Price variance
const askPrices = bootstrap.materializedEntities.listings.map((l) => l.askPrice);
const avgPrice = askPrices.reduce((s, p) => s + p, 0) / askPrices.length;
const priceVariance = askPrices.reduce((s, p) => s + (p - avgPrice) ** 2, 0) / askPrices.length;
const priceStdDev = Math.sqrt(priceVariance);
hardFail(
  priceStdDev > avgPrice * 0.05,
  `listing price std dev > 5% of mean (stddev=${priceStdDev.toFixed(1)}, mean=${avgPrice.toFixed(1)})`,
);

// Owner rigidity variance
const rigidityValues = bootstrap.hiddenTruth.ownerProfilePriors.map((p) => p.priceAnchorRigidity);
const uniqueRigidity = new Set(rigidityValues);
hardFail(uniqueRigidity.size >= 10, `owner rigidity has >= 10 distinct values (got ${uniqueRigidity.size})`);

// Customer urgency variance
const urgencyValues = bootstrap.materializedEntities.customers.map((c) => c.urgency);
const uniqueUrgency = new Set(urgencyValues);
hardFail(uniqueUrgency.size >= 10, `customer urgency has >= 10 distinct values (got ${uniqueUrgency.size})`);

// Area variance
const areas = bootstrap.materializedEntities.listings.map((l) => l.areaSqm);
const uniqueAreas = new Set(areas);
hardFail(uniqueAreas.size >= 15, `listing area has >= 15 distinct values (got ${uniqueAreas.size})`);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 10: Mega-scale diversity >= hundred-scale diversity
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 10: Mega vs hundred-scale diversity ---');

const hundredPolicy: BigWorldScalePolicy = {
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

const hundredBootstrap = createBigWorldBootstrap({
  seed: SEED,
  scenarioName: '百量级对比',
  difficultyId: 'standard',
  playerCaseCount: 5,
  scaleOverride: hundredPolicy,
});

const hundredSummary = buildScaleManifest(hundredBootstrap);
const hundredDiv = hundredSummary.diversityCoverage;

hardFail(
  summary.totalListings > hundredSummary.totalListings,
  `mega listings (${summary.totalListings}) > hundred (${hundredSummary.totalListings})`,
);
hardFail(
  diversity.ownerArchetypeDiversity >= hundredDiv.ownerArchetypeDiversity,
  `mega owner diversity (${diversity.ownerArchetypeDiversity}) >= hundred (${hundredDiv.ownerArchetypeDiversity})`,
);
hardFail(
  diversity.listingTypeDiversity >= hundredDiv.listingTypeDiversity,
  `mega listing diversity (${diversity.listingTypeDiversity}) >= hundred (${hundredDiv.listingTypeDiversity})`,
);
hardFail(
  diversity.demandSegmentDiversity >= hundredDiv.demandSegmentDiversity,
  `mega demand diversity (${diversity.demandSegmentDiversity}) >= hundred (${hundredDiv.demandSegmentDiversity})`,
);

// ══════════════════════════════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════════════════════════════

console.log('\n=== Mega-Diversity Summary ===');
console.log(`  Owner archetypes:    ${diversity.ownerArchetypeDiversity} types (entropy: ${ownerEntropy.toFixed(2)} bits)`);
console.log(`  Listing layouts:     ${diversity.listingTypeDiversity} types (entropy: ${layoutEntropy.toFixed(2)} bits)`);
console.log(`  Price bands:         ${diversity.priceBandDiversity} bands`);
console.log(`  Demand segments:     ${diversity.demandSegmentDiversity} segments`);
console.log(`  Broker styles:       ${diversity.brokerStyleDiversity} styles`);
console.log(`  Market cells:        ${diversity.marketCellCount} cells`);
console.log(`  Layout×Price combos: ${comboKeys.length}`);
console.log(`  Source coverage:     ${coveredCount}/${allSourceKinds.length} kinds (${sourceReadiness.coveragePct}%)`);

console.log(`\n=== Result: ${passed} passed, ${failed} failed ===`);

if (failed > 0) {
  console.error('\nFailures:');
  for (const f of failures) {
    console.error(`  - ${f}`);
  }
  process.exit(1);
}

console.log('\nAll diversity checks passed.');
