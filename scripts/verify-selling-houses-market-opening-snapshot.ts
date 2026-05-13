// ---------------------------------------------------------------------------
// verify-selling-houses-market-opening-snapshot.ts
//
// Verifies MarketOpeningSnapshot:
// 1. MarketOpeningSnapshot invariants (>= 3 cells, >= 3 ACN, etc.)
// 2. MarketOpeningSnapshot is a child/adaptor of BigWorldBootstrap
// 3. Backward compatibility: old saves without bootstrap still work
// 4. normalizeOldSave extracts summary + seed (no hidden world fabrication)
// ---------------------------------------------------------------------------

import { createBigWorldBootstrap } from '../src/selling-houses/domain/world-model/bigWorldBootstrap.js';
import {
  readMarketOpeningSnapshot,
  assertMarketOpeningInvariants,
} from '../src/selling-houses/domain/world-model/marketOpening.js';
import { normalizeOldSave } from '../src/selling-houses/domain/world-model/bigWorldBootstrapSummary.js';
import { createMarketOpeningSnapshot } from '../src/selling-houses/domain/world-model/seededMarketWorld.js';

let failures = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) { console.error(`  FAIL: ${msg}`); failures += 1; }
  else { console.log(`  PASS: ${msg}`); }
}

console.log('=== MarketOpeningSnapshot Verification ===\n');

// --- 1. Invariants on bootstrap-derived snapshot ---
console.log('--- 1. Bootstrap snapshot invariants ---');
const b = createBigWorldBootstrap({ seed: 42, scenarioName: '测试', difficultyId: 'standard', playerCaseCount: 5 });
const mos = b.marketOpeningSnapshot;
const errs = assertMarketOpeningInvariants(mos);
assert(errs.length === 0, `invariants pass (${errs.join(', ')})`);

// --- 2. Child relationship ---
console.log('\n--- 2. Child relationship ---');
assert(mos.seed === b.causalBaseline.seed, 'seed matches');
assert(mos.scenarioName === b.causalBaseline.scenarioName, 'scenarioName matches');
assert(mos.difficultyId === b.causalBaseline.difficultyId, 'difficultyId matches');
assert(mos.marketCells === b.hiddenTruth.marketCells, 'marketCells same ref as hiddenTruth');
assert(mos.cityCycle === b.hiddenTruth.cityCycle, 'cityCycle same ref as hiddenTruth');
assert(mos.acnNetworks === b.hiddenTruth.acnNetworks, 'acnNetworks same ref as hiddenTruth');

// --- 3. readMarketOpeningSnapshot ---
console.log('\n--- 3. readMarketOpeningSnapshot ---');
const readBack = readMarketOpeningSnapshot({ runContext: { marketOpeningSnapshot: mos } });
assert(readBack !== null, 'returns non-null for valid snapshot');
assert(readBack!.version === 1, 'version === 1');

const nullResult = readMarketOpeningSnapshot({});
assert(nullResult === null, 'returns null for empty state');
const nullResult2 = readMarketOpeningSnapshot({ runContext: {} });
assert(nullResult2 === null, 'returns null when missing');

// --- 4. normalizeOldSave: summary + seed only ---
console.log('\n--- 4. normalizeOldSave ---');
const snap = createMarketOpeningSnapshot({ seed: 42, scenarioName: '直接测试', difficultyId: 'standard', playerCaseCount: 5 });
const norm = normalizeOldSave({ runContext: { marketOpeningSnapshot: snap } });
assert(norm.valid === true, 'valid');
assert(norm.summary !== null, 'has summary');
assert(norm.seed !== null, 'has seed');
assert(norm.summary!.seed === 42, 'seed preserved');
assert(norm.summary!.marketCellCount >= 3, `marketCellCount >= 3 (${norm.summary!.marketCellCount})`);
assert(norm.summary!.acnNetworkCount >= 3, `acnNetworkCount >= 3 (${norm.summary!.acnNetworkCount})`);
assert(norm.summary!.ownerProfilePriorCount === 0, '0 owner priors (cannot fabricate)');
assert(!('hiddenTruth' in norm), 'NO hiddenTruth in normalized save');
assert(!('materializedEntities' in norm), 'NO materializedEntities');

const emptyNorm = normalizeOldSave({});
assert(emptyNorm.valid === false, 'empty: valid=false');

// --- 5. Standalone snapshot invariants ---
console.log('\n--- 5. Standalone snapshot ---');
const standalone = createMarketOpeningSnapshot({ seed: 123, scenarioName: '独立测试', difficultyId: 'hard', playerCaseCount: 8 });
const stErrs = assertMarketOpeningInvariants(standalone);
assert(stErrs.length === 0, `standalone invariants pass (${stErrs.join(', ')})`);
assert(standalone.marketCells.length >= 3, `cells >= 3 (${standalone.marketCells.length})`);
assert(standalone.acnNetworks.length >= 3, `ACNs >= 3 (${standalone.acnNetworks.length})`);

// --- Summary ---
console.log('\n=== Summary ===');
console.log(`Bootstrap snapshot: ${mos.marketCells.length} cells, ${mos.acnNetworks.length} ACNs`);
console.log(`Standalone: ${standalone.marketCells.length} cells, ${standalone.acnNetworks.length} ACNs`);
console.log(`Old-save: ${norm.summary!.marketCellCount} cells, ${norm.summary!.totalBrokerCount} brokers`);

if (failures > 0) { console.error(`\n${failures} FAILURES`); process.exit(1); }
else { console.log('\nAll tests passed!'); }
