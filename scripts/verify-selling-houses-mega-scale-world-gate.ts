/**
 * Big World Round 8 — Mega-Scale World Gate
 *
 * Verifies that the megaScale profile generates a world with:
 *   - 300+ materialized/shadow listings
 *   - 300+ owner profile priors
 *   - 1000+ demand/customer units (hot + cold)
 *   - 60+ brokers (named + shadow)
 *   - 8+ market cells (with micro cells)
 *   - 5+ ACN/networks
 *   - Supporting info with source readiness coverage
 *   - Deterministic replay
 *   - No hidden world leak
 *
 * Usage: npx tsx scripts/verify-selling-houses-mega-scale-world-gate.ts
 */

import { createBigWorldBootstrap, buildScaleManifest, buildBootstrapSummary } from '../src/selling-houses/domain/world-model/bigWorldBootstrap.js';
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

// ── Mega-scale policy ───────────────────────────────────────────────────

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
// CHECK 1: Mega-scale profile generates expected counts
// ══════════════════════════════════════════════════════════════════════════

console.log('=== Big World Round 8 — Mega-Scale World Gate ===\n');

console.log('--- CHECK 1: Mega-scale profile counts ---');

const megaBootstrap = createBigWorldBootstrap({
  seed: SEED,
  scenarioName: '几百量级测试',
  difficultyId: 'standard',
  playerCaseCount: 5,
  scaleOverride: MEGA_SCALE_POLICY,
});

const manifest = buildScaleManifest(megaBootstrap);

hardFail(manifest.totalListings >= 300, `totalListings >= 300 (got ${manifest.totalListings})`);
hardFail(manifest.totalOwners >= 300, `totalOwners >= 300 (got ${manifest.totalOwners})`);
hardFail(manifest.totalCustomers >= 1000, `totalCustomers >= 1000 (got ${manifest.totalCustomers})`);
hardFail(manifest.totalBrokers >= 60, `totalBrokers >= 60 (got ${manifest.totalBrokers})`);
hardFail(manifest.marketCells >= 8, `marketCells >= 8 (got ${manifest.marketCells})`);
hardFail(manifest.acnNetworks >= 5, `acnNetworks >= 5 (got ${manifest.acnNetworks})`);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 2: Mega-scale manifest thresholds
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 2: Mega-scale manifest thresholds ---');

const megaThresholds = manifest.meetsMegaScaleThresholds;
hardFail(megaThresholds.listingsGte300, 'meetsMegaScaleThresholds.listingsGte300');
hardFail(megaThresholds.ownersGte300, 'meetsMegaScaleThresholds.ownersGte300');
hardFail(megaThresholds.customersGte1000, 'meetsMegaScaleThresholds.customersGte1000');
hardFail(megaThresholds.brokersGte60, 'meetsMegaScaleThresholds.brokersGte60');
hardFail(megaThresholds.marketCellsGte8, 'meetsMegaScaleThresholds.marketCellsGte8');
hardFail(megaThresholds.acnNetworksGte5, 'meetsMegaScaleThresholds.acnNetworksGte5');

// ══════════════════════════════════════════════════════════════════════════
// CHECK 3: Micro cells exist
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 3: Micro cells ---');

hardFail(manifest.microCells > 0, `microCells > 0 (got ${manifest.microCells})`);
hardFail(
  manifest.microCells >= manifest.marketCells,
  `microCells >= marketCells (got ${manifest.microCells} >= ${manifest.marketCells})`,
);

// Each micro cell has valid structure
const microCells = megaBootstrap.hiddenTruth.microCells;
for (const mc of microCells) {
  hardFail(mc.microCellId.startsWith('mc-'), `microCell ${mc.microCellId} has valid ID prefix`);
  hardFail(mc.parentMarketCellId !== '', `microCell ${mc.microCellId} has parentMarketCellId`);
  hardFail(mc.heat >= 0 && mc.heat <= 100, `microCell ${mc.microCellId} heat in range`);
  hardFail(mc.listingCount >= 0, `microCell ${mc.microCellId} listingCount >= 0`);
}

// ══════════════════════════════════════════════════════════════════════════
// CHECK 4: Supporting info records
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 4: Supporting info records ---');

const supportingInfo = megaBootstrap.hiddenTruth.supportingInfo;
hardFail(supportingInfo.length > 0, `supportingInfo.length > 0 (got ${supportingInfo.length})`);

// Each record has valid structure
const categories = new Set<string>();
for (const info of supportingInfo) {
  hardFail(info.recordId.startsWith('si-'), `supportingInfo ${info.recordId} has valid ID prefix`);
  hardFail(info.marketCellId !== '', `${info.recordId} has marketCellId`);
  hardFail(info.microCellId.startsWith('mc-'), `${info.recordId} has microCellId`);
  hardFail(info.strength >= 0 && info.strength <= 100, `${info.recordId} strength in range`);
  hardFail(info.delta >= -100 && info.delta <= 100, `${info.recordId} delta in range`);
  hardFail(
    ['improving', 'stable', 'declining'].includes(info.direction),
    `${info.recordId} direction valid`,
  );
  hardFail(info.daysSinceUpdate >= 0, `${info.recordId} daysSinceUpdate >= 0`);
  categories.add(info.category);
}

// Check coverage of facility categories
hardFail(categories.size >= 3, `supportingInfo covers >= 3 categories (got ${categories.size})`);
hardFail(categories.has('school'), 'supportingInfo covers school');
hardFail(categories.has('transit'), 'supportingInfo covers transit');

// ══════════════════════════════════════════════════════════════════════════
// CHECK 5: Source readiness coverage
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 5: Source readiness coverage ---');

const sourceReadiness = manifest.sourceReadinessCoverage;
hardFail(sourceReadiness.totalSupportingInfoRecords > 0, `totalSupportingInfoRecords > 0 (got ${sourceReadiness.totalSupportingInfoRecords})`);
hardFail(sourceReadiness.categoryCoverage >= 3, `categoryCoverage >= 3 (got ${sourceReadiness.categoryCoverage})`);
hardFail(sourceReadiness.coveredSourceKinds.length >= 3, `coveredSourceKinds >= 3 (got ${sourceReadiness.coveredSourceKinds.length})`);
hardFail(sourceReadiness.coveragePct > 0, `coveragePct > 0 (got ${sourceReadiness.coveragePct}%)`);

console.log(`  Supporting info records: ${sourceReadiness.totalSupportingInfoRecords}`);
console.log(`  Categories covered: ${sourceReadiness.categoryCoverage}`);
console.log(`  Source kinds covered: ${sourceReadiness.coveredSourceKinds.join(', ')}`);
console.log(`  Coverage: ${sourceReadiness.coveragePct}%`);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 6: Hot/cold split
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 6: Hot/cold split ---');

const hotCold = manifest.diversityCoverage.hotColdSplit;
hardFail(hotCold.materializedCustomers > 0, `materializedCustomers > 0 (got ${hotCold.materializedCustomers})`);
hardFail(hotCold.shadowClusterUnits > 0, `shadowClusterUnits > 0 (got ${hotCold.shadowClusterUnits})`);
hardFail(
  hotCold.totalDemandUnits === hotCold.materializedCustomers + hotCold.shadowClusterUnits,
  `totalDemandUnits = materialized + shadow`,
);
hardFail(hotCold.materializedListingCount > 0, `materializedListingCount > 0 (got ${hotCold.materializedListingCount})`);
hardFail(hotCold.shadowListingCount > 0, `shadowListingCount > 0 (got ${hotCold.shadowListingCount})`);
hardFail(
  hotCold.materializedListingCount + hotCold.shadowListingCount === manifest.totalListings,
  `listing split sums to total`,
);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 7: Deterministic replay
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 7: Deterministic replay ---');

const replay1 = createBigWorldBootstrap({
  seed: SEED,
  scenarioName: '几百量级测试',
  difficultyId: 'standard',
  playerCaseCount: 5,
  scaleOverride: MEGA_SCALE_POLICY,
});

const replay2 = createBigWorldBootstrap({
  seed: SEED,
  scenarioName: '几百量级测试',
  difficultyId: 'standard',
  playerCaseCount: 5,
  scaleOverride: MEGA_SCALE_POLICY,
});

hardFail(replay1.materializedEntities.listings.length === replay2.materializedEntities.listings.length, 'replay: same listing count');
hardFail(replay1.materializedEntities.brokers.length === replay2.materializedEntities.brokers.length, 'replay: same broker count');
hardFail(replay1.hiddenTruth.ownerProfilePriors.length === replay2.hiddenTruth.ownerProfilePriors.length, 'replay: same owner count');
hardFail(replay1.hiddenTruth.microCells.length === replay2.hiddenTruth.microCells.length, 'replay: same micro cell count');
hardFail(replay1.hiddenTruth.supportingInfo.length === replay2.hiddenTruth.supportingInfo.length, 'replay: same supporting info count');

const json1 = JSON.stringify(replay1);
const json2 = JSON.stringify(replay2);
hardFail(json1 === json2, 'replay: byte-identical bootstrap JSON');

// ══════════════════════════════════════════════════════════════════════════
// CHECK 8: Summary is well-formed
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 8: Summary well-formed ---');

const summary = buildBootstrapSummary(megaBootstrap);
hardFail(summary.version === 1, 'summary.version === 1');
hardFail(summary.totalListingCount >= 300, `summary.totalListingCount >= 300 (got ${summary.totalListingCount})`);
hardFail(summary.totalBrokerCount >= 60, `summary.totalBrokerCount >= 60 (got ${summary.totalBrokerCount})`);
hardFail(summary.ownerProfilePriorCount >= 300, `summary.ownerProfilePriorCount >= 300 (got ${summary.ownerProfilePriorCount})`);
hardFail(summary.marketCellCount >= 8, `summary.marketCellCount >= 8 (got ${summary.marketCellCount})`);
hardFail(summary.acnNetworkCount >= 5, `summary.acnNetworkCount >= 5 (got ${summary.acnNetworkCount})`);

// Scale manifest is embedded in summary
hardFail(summary.scaleManifest !== undefined, 'summary has scaleManifest');
hardFail(summary.scaleManifest.meetsMegaScaleThresholds !== undefined, 'summary has meetsMegaScaleThresholds');

// ══════════════════════════════════════════════════════════════════════════
// CHECK 9: No Date.now / Math.random leakage
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 9: No randomness leakage ---');

const differentSeed = createBigWorldBootstrap({
  seed: SEED + 1,
  scenarioName: '几百量级测试',
  difficultyId: 'standard',
  playerCaseCount: 5,
  scaleOverride: MEGA_SCALE_POLICY,
});

hardFail(
  differentSeed.materializedEntities.listings.length !== megaBootstrap.materializedEntities.listings.length
  || differentSeed.hiddenTruth.ownerProfilePriors.length !== megaBootstrap.hiddenTruth.ownerProfilePriors.length
  || JSON.stringify(differentSeed) !== json1,
  'different seed → different output',
);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 10: Hidden world does NOT leak into openingPOV
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 10: Hidden world boundary ---');

const pov = megaBootstrap.openingPOV;
// POV should have market cells but NOT micro cells or supporting info
hardFail(pov.marketCells.length > 0, 'openingPOV has marketCells');
hardFail(!('microCells' in pov), 'openingPOV does NOT have microCells');
hardFail(!('supportingInfo' in pov), 'openingPOV does NOT have supportingInfo');
hardFail(!('ownerProfilePriors' in pov), 'openingPOV does NOT have ownerProfilePriors');

// ══════════════════════════════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════════════════════════════

console.log('\n=== Scale Manifest ===');
console.log(`  totalListings:       ${manifest.totalListings}`);
console.log(`  totalOwners:         ${manifest.totalOwners}`);
console.log(`  totalCustomers:      ${manifest.totalCustomers}`);
console.log(`  totalBrokers:        ${manifest.totalBrokers}`);
console.log(`  marketCells:         ${manifest.marketCells}`);
console.log(`  microCells:          ${manifest.microCells}`);
console.log(`  acnNetworks:         ${manifest.acnNetworks}`);
console.log(`  supportingInfo:      ${sourceReadiness.totalSupportingInfoRecords} records`);
console.log(`  sourceReadiness:     ${sourceReadiness.coveragePct}% (${sourceReadiness.coveredSourceKinds.length} kinds)`);
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
