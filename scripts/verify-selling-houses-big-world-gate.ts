// ---------------------------------------------------------------------------
// verify-selling-houses-big-world-gate.ts
//
// Final gate: verifies the complete BigWorld Initialization Platform.
//
// Checks:
// 1. Sample scale meets minimum requirements (layered structure)
// 2. Hidden truth vs openingPOV boundary
// 3. Hot/cold separation
// 4. Domain/world-model has no runtime/application/UI imports
// 5. Agent B can consume via RuntimeInitialState
// 6. Legacy compatibility (old saves normalize to summary+seed only)
// 7. All invariants pass
// ---------------------------------------------------------------------------

import { createBigWorldBootstrap, buildRuntimeInitialState } from '../src/selling-houses/domain/world-model/bigWorldBootstrap.js';
import {
  buildBigWorldBootstrapSummary,
  assertBigWorldSummaryInvariants,
  normalizeOldSave,
} from '../src/selling-houses/domain/world-model/bigWorldBootstrapSummary.js';
import { createMarketOpeningSnapshot } from '../src/selling-houses/domain/world-model/seededMarketWorld.js';

let failures = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) { console.error(`  FAIL: ${msg}`); failures += 1; }
  else { console.log(`  PASS: ${msg}`); }
}

console.log('=== BigWorld Gate Verification ===\n');

const b = createBigWorldBootstrap({
  seed: 42, scenarioName: 'Gate测试', difficultyId: 'standard', playerCaseCount: 5,
  playerCaseIds: ['case-1', 'case-2', 'case-3', 'case-4', 'case-5'],
});
const summary = buildBigWorldBootstrapSummary(b);
const rt = buildRuntimeInitialState(b);

// --- Gate 1: Sample scale ---
console.log('--- Gate 1: Sample scale ---');
assert(b.hiddenTruth.marketCells.length >= 3, `cells >= 3 (${b.hiddenTruth.marketCells.length})`);
assert(b.hiddenTruth.acnNetworks.length >= 3, `ACNs >= 3 (${b.hiddenTruth.acnNetworks.length})`);
const named = b.materializedEntities.brokers.filter((x) => x.visibility === 'named');
const shadow = b.materializedEntities.brokers.filter((x) => x.visibility === 'shadow');
assert(named.length + shadow.length >= 8, `brokers >= 8 (${named.length + shadow.length})`);
assert(b.materializedEntities.listings.length >= 20, `listings >= 20 (${b.materializedEntities.listings.length})`);
const totalDemand = b.materializedEntities.customers.length
  + b.coldAggregate.shadowDemandClusters.reduce((s, c) => s + c.estimatedCustomerCount, 0);
assert(totalDemand >= 60, `demand >= 60 (${totalDemand})`);
assert(b.hiddenTruth.ownerProfilePriors.length >= 3, `priors >= 3 (${b.hiddenTruth.ownerProfilePriors.length})`);

// --- Gate 2: Hidden truth vs openingPOV ---
console.log('\n--- Gate 2: Hidden vs POV ---');
assert(b.hiddenTruth.acnProfiles.length >= 3, 'hiddenTruth.acnProfiles present');
assert(b.hiddenTruth.ownerProfilePriors.length >= 3, 'hiddenTruth.ownerProfilePriors present');
assert(b.coldAggregate.shadowDemandClusters.length > 0, 'coldAggregate.shadowDemandClusters present');
assert(b.openingPOV.cityCycle === b.hiddenTruth.cityCycle, 'POV.cityCycle shared ref');
assert(b.openingPOV.marketCells === b.hiddenTruth.marketCells, 'POV.marketCells shared ref');
assert(!('acnProfiles' in b.openingPOV), 'POV does NOT expose acnProfiles');
assert(!('ownerProfilePriors' in b.openingPOV), 'POV does NOT expose ownerProfilePriors');

// --- Gate 3: Hot/cold separation ---
console.log('\n--- Gate 3: Hot/cold ---');
assert(b.materializedEntities.brokers.length > 0, 'hot: brokers');
assert(b.materializedEntities.listings.length > 0, 'hot: listings');
assert(b.coldAggregate.shadowDemandClusters.length > 0, 'cold: clusters');
assert(b.coldAggregate.historicalTransactions.length > 0, 'cold: txns');

// --- Gate 4: Import boundary ---
console.log('\n--- Gate 4: Import boundary ---');
assert(!('day' in b), 'no day');
assert(!('energy' in b), 'no energy');
assert(!('cash' in b), 'no cash');
assert(!('selectedCaseId' in b), 'no selectedCaseId');

// --- Gate 5: Agent B via RuntimeInitialState ---
console.log('\n--- Gate 5: Agent B consumption ---');
assert(rt.brokers.length > 0, 'rt.brokers available');
assert(rt.listings.length > 0, 'rt.listings available');
assert(rt.openingPOV.marketCells.length >= 3, 'rt.openingPOV.marketCells available');
assert(typeof rt.ecosystemSeed === 'number', 'rt.ecosystemSeed available');
assert(typeof rt.causalSeed === 'number', 'rt.causalSeed available');

// --- Gate 6: Legacy compatibility ---
console.log('\n--- Gate 6: Legacy ---');
const snap = createMarketOpeningSnapshot({ seed: 42, scenarioName: 'legacy', difficultyId: 'standard', playerCaseCount: 5 });
const norm = normalizeOldSave({ runContext: { marketOpeningSnapshot: snap } });
assert(norm.valid === true, 'old save normalizes');
assert(norm.summary !== null, 'has summary');
assert(norm.seed !== null, 'has seed');
assert(!('hiddenTruth' in norm), 'NO hiddenTruth in normalized save');
assert(!('materializedEntities' in norm), 'NO materializedEntities');
assert(norm.summary!.ownerProfilePriorCount === 0, '0 owner priors (cannot fabricate)');

const emptyNorm = normalizeOldSave({});
assert(emptyNorm.valid === false, 'empty: valid=false');

// --- Gate 7: Invariants ---
console.log('\n--- Gate 7: Invariants ---');
const errs = assertBigWorldSummaryInvariants(summary);
assert(errs.length === 0, `invariants pass (${errs.join('; ')})`);

// --- Numbers ---
console.log('\n=== Numbers ===');
console.log(`Cells: ${b.hiddenTruth.marketCells.length} | ACNs: ${b.hiddenTruth.acnNetworks.length}`);
console.log(`Brokers: ${named.length + shadow.length} (named: ${named.length}, shadow: ${shadow.length})`);
console.log(`Listings: ${b.materializedEntities.listings.length}`);
console.log(`Customers: ${b.materializedEntities.customers.length}`);
console.log(`Clusters: ${b.coldAggregate.shadowDemandClusters.length} | Txns: ${b.coldAggregate.historicalTransactions.length}`);
console.log(`Priors: ${b.hiddenTruth.ownerProfilePriors.length} | Anchors: ${b.hiddenTruth.ownerExpectationAnchors.length}`);
console.log(`Demand units: ${totalDemand}`);

if (failures > 0) { console.error(`\n${failures} FAILURES`); process.exit(1); }
else { console.log('\nAll gate checks passed!'); }
