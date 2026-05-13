// ---------------------------------------------------------------------------
// verify-selling-houses-big-world-initialization-platform.ts
//
// Verifies the BigWorld Initialization Platform contract:
// 1. Layered bootstrap structure (hiddenTruth / materialized / cold / POV / causal)
// 2. Source refs and provenance on owner priors
// 3. OpeningPOV is a projection of hiddenTruth (same references)
// 4. RuntimeInitialState can be extracted from bootstrap
// 5. Summary is persistable (JSON round-trip)
// 6. Old-save normalize produces summary + seed, NOT hidden world
// 7. Deterministic replay
// 8. Full bootstrap must NOT be used as UI projection (structural check)
// ---------------------------------------------------------------------------

import { createBigWorldBootstrap, buildRuntimeInitialState } from '../src/selling-houses/domain/world-model/bigWorldBootstrap.js';
import { buildBigWorldSpec } from '../src/selling-houses/domain/world-model/bigWorldSpecFactory.js';
import {
  buildBigWorldBootstrapSummary,
  assertBigWorldSummaryInvariants,
  normalizeOldSave,
} from '../src/selling-houses/domain/world-model/bigWorldBootstrapSummary.js';
import { createMarketOpeningSnapshot } from '../src/selling-houses/domain/world-model/seededMarketWorld.js';

const SEED = 42;
const SCENARIO = '测试剧本';
const DIFFICULTY = 'standard';
const CASE_COUNT = 5;

let failures = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) { console.error(`  FAIL: ${msg}`); failures += 1; }
  else { console.log(`  PASS: ${msg}`); }
}

console.log('=== BigWorld Initialization Platform Verification ===\n');

// ── 1. Layered bootstrap structure ──────────────────────────
console.log('--- 1. Layered structure ---');
const b = createBigWorldBootstrap({ seed: SEED, scenarioName: SCENARIO, difficultyId: DIFFICULTY, playerCaseCount: CASE_COUNT,
  playerCaseIds: ['case-1','case-2','case-3','case-4','case-5'] });

assert(b.version === 1, 'version === 1');
assert(b.hiddenTruth !== undefined, 'hiddenTruth layer exists');
assert(b.materializedEntities !== undefined, 'materializedEntities layer exists');
assert(b.coldAggregate !== undefined, 'coldAggregate layer exists');
assert(b.openingPOV !== undefined, 'openingPOV layer exists');
assert(b.causalBaseline !== undefined, 'causalBaseline layer exists');

assert(b.hiddenTruth.marketCells.length >= 3, `hiddenTruth.marketCells >= 3 (${b.hiddenTruth.marketCells.length})`);
assert(b.hiddenTruth.acnProfiles.length >= 3, `hiddenTruth.acnProfiles >= 3 (${b.hiddenTruth.acnProfiles.length})`);
assert(b.hiddenTruth.ownerProfilePriors.length >= 3, `hiddenTruth.ownerProfilePriors >= 3 (${b.hiddenTruth.ownerProfilePriors.length})`);
assert(b.hiddenTruth.ownerExpectationAnchors.length >= 3, `hiddenTruth.ownerExpectationAnchors >= 3`);
assert(b.hiddenTruth.ownerPerceptionLags.length >= 3, `hiddenTruth.ownerPerceptionLags >= 3`);

assert(b.materializedEntities.brokers.length >= 8, `materializedEntities.brokers >= 8 (${b.materializedEntities.brokers.length})`);
assert(b.materializedEntities.listings.length >= 20, `materializedEntities.listings >= 20 (${b.materializedEntities.listings.length})`);
assert(b.materializedEntities.attentions.length === 0, 'attentions empty at start');

assert(b.coldAggregate.shadowDemandClusters.length > 0, `coldAggregate.shadowDemandClusters > 0`);
assert(b.coldAggregate.historicalTransactions.length > 0, `coldAggregate.historicalTransactions > 0`);

assert(b.causalBaseline.seed === SEED, `causalBaseline.seed === ${SEED}`);
assert(b.causalBaseline.spec.version === 1, 'causalBaseline.spec.version === 1');

// ── 2. Source refs and provenance ───────────────────────────
console.log('\n--- 2. Source refs & provenance ---');
const prior0 = b.hiddenTruth.ownerProfilePriors[0];
assert(typeof prior0.provenance.sourceRef === 'string', 'prior has sourceRef');
assert(prior0.provenance.origin === 'owner_prior', 'prior origin is owner_prior');
assert(typeof prior0.provenance.generationSalt === 'string', 'prior has generationSalt');

const anchor0 = b.hiddenTruth.ownerExpectationAnchors[0];
assert(typeof anchor0.provenance.sourceRef === 'string', 'anchor has sourceRef');
assert(anchor0.provenance.origin === 'owner_prior', 'anchor origin is owner_prior');

const lag0 = b.hiddenTruth.ownerPerceptionLags[0];
assert(typeof lag0.provenance.sourceRef === 'string', 'lag has sourceRef');

const cluster0 = b.coldAggregate.shadowDemandClusters[0];
assert(typeof cluster0.provenance.sourceRef === 'string', 'cluster has sourceRef');
assert(cluster0.provenance.origin === 'demand_cluster', 'cluster origin is demand_cluster');

// ── 3. OpeningPOV is projection of hiddenTruth ──────────────
console.log('\n--- 3. OpeningPOV is projection ---');
assert(b.openingPOV.cityCycle === b.hiddenTruth.cityCycle, 'POV.cityCycle === hiddenTruth.cityCycle (same ref)');
assert(b.openingPOV.marketCells === b.hiddenTruth.marketCells, 'POV.marketCells === hiddenTruth.marketCells (same ref)');
assert(b.openingPOV.acnNetworks === b.hiddenTruth.acnNetworks, 'POV.acnNetworks === hiddenTruth.acnNetworks (same ref)');
assert(b.openingPOV.playerBroker.brokerId === 'player-broker', 'POV.playerBroker exists');
assert(b.openingPOV.namedRivalBrokers.length > 0, 'POV.namedRivalBrokers populated');
assert(b.openingPOV.directRivalListings.length > 0, 'POV.directRivalListings populated');
assert(b.openingPOV.aggregateDemandSegments.length > 0, 'POV.aggregateDemandSegments populated');

// POV must NOT expose hidden fields
assert(!('acnProfiles' in b.openingPOV), 'POV does NOT expose acnProfiles');
assert(!('ownerProfilePriors' in b.openingPOV), 'POV does NOT expose ownerProfilePriors');
assert(!('shadowDemandClusters' in b.openingPOV), 'POV does NOT expose shadowDemandClusters');

// ── 4. RuntimeInitialState extraction ───────────────────────
console.log('\n--- 4. RuntimeInitialState ---');
const rt = buildRuntimeInitialState(b);
assert(rt.seed === SEED, 'rt.seed === SEED');
assert(rt.difficultyId === DIFFICULTY, 'rt.difficultyId matches');
assert(rt.brokers === b.materializedEntities.brokers, 'rt.brokers is same ref as materializedEntities.brokers');
assert(rt.listings === b.materializedEntities.listings, 'rt.listings is same ref');
assert(rt.customers === b.materializedEntities.customers, 'rt.customers is same ref');
assert(rt.shadowDemandClusters === b.coldAggregate.shadowDemandClusters, 'rt.shadowDemandClusters is same ref');
assert(rt.openingPOV === b.openingPOV, 'rt.openingPOV is same ref');
assert(typeof rt.ecosystemSeed === 'number', 'rt.ecosystemSeed is number');
assert(typeof rt.causalSeed === 'number', 'rt.causalSeed is number');
assert(rt.ecosystemSeed !== rt.causalSeed, 'ecosystemSeed !== causalSeed');
assert(rt.ecosystemSeed !== SEED, 'ecosystemSeed !== master seed');

// ── 5. Summary persistable ──────────────────────────────────
console.log('\n--- 5. Summary persistable ---');
const summary = buildBigWorldBootstrapSummary(b);
const summaryJson = JSON.stringify(summary);
const parsed = JSON.parse(summaryJson);
assert(parsed.version === 1, 'round-trip version');
assert(parsed.seed === SEED, 'round-trip seed');
assert(parsed.marketCellCount === summary.marketCellCount, 'round-trip marketCellCount');
assert(parsed.ownerProfilePriorCount === summary.ownerProfilePriorCount, 'round-trip ownerProfilePriorCount');
const invErrors = assertBigWorldSummaryInvariants(summary);
assert(invErrors.length === 0, `invariants pass (${invErrors.join('; ')})`);

// ── 6. Old-save normalize: summary + seed only ──────────────
console.log('\n--- 6. Old-save normalize ---');
const norm = normalizeOldSave({ runContext: { marketOpeningSnapshot: b.marketOpeningSnapshot } });
assert(norm.valid === true, 'normalizeOldSave valid');
assert(norm.summary !== null, 'normalizeOldSave has summary');
assert(norm.seed !== null, 'normalizeOldSave has seed');
assert(norm.marketOpeningSnapshot !== null, 'normalizeOldSave has marketOpeningSnapshot');

// Must NOT contain hidden world
assert(!('hiddenTruth' in norm), 'normalizedSave has NO hiddenTruth');
assert(!('materializedEntities' in norm), 'normalizedSave has NO materializedEntities');
assert(!('openingPOV' in norm), 'normalizedSave has NO openingPOV');
assert(!('coldAggregate' in norm), 'normalizedSave has NO coldAggregate');

// Old save has 0 owner priors (cannot fabricate)
assert(norm.summary!.ownerProfilePriorCount === 0, 'old save: 0 owner priors');
assert(norm.summary!.ownerProfilePriorIds.length === 0, 'old save: 0 prior IDs');

const emptyNorm = normalizeOldSave({});
assert(emptyNorm.valid === false, 'empty state: valid=false');
assert(emptyNorm.summary === null, 'empty state: summary=null');
assert(emptyNorm.seed === null, 'empty state: seed=null');

// ── 7. Deterministic replay ─────────────────────────────────
console.log('\n--- 7. Deterministic replay ---');
const b2 = createBigWorldBootstrap({ seed: SEED, scenarioName: SCENARIO, difficultyId: DIFFICULTY, playerCaseCount: CASE_COUNT,
  playerCaseIds: ['case-1','case-2','case-3','case-4','case-5'] });
assert(JSON.stringify(b) === JSON.stringify(b2), 'same input → byte-identical');

const b3 = createBigWorldBootstrap({ seed: 99, scenarioName: SCENARIO, difficultyId: DIFFICULTY, playerCaseCount: CASE_COUNT });
assert(JSON.stringify(b) !== JSON.stringify(b3), 'different seed → different output');

// Replay 5 times
const baseJson = JSON.stringify(b);
let allMatch = true;
for (let i = 0; i < 5; i += 1) {
  const bx = createBigWorldBootstrap({ seed: SEED, scenarioName: SCENARIO, difficultyId: DIFFICULTY, playerCaseCount: CASE_COUNT,
    playerCaseIds: ['case-1','case-2','case-3','case-4','case-5'] });
  if (JSON.stringify(bx) !== baseJson) { allMatch = false; break; }
}
assert(allMatch, '5 replays identical');

// ── 8. No UI/runtime fields leaking into bootstrap ──────────
console.log('\n--- 8. No UI/runtime leak ---');
assert(!('day' in b), 'no day field');
assert(!('energy' in b), 'no energy field');
assert(!('cash' in b), 'no cash field');
assert(!('selectedCaseId' in b), 'no selectedCaseId');
assert(!('lastDailyTickResult' in b), 'no lastDailyTickResult');

// ── Summary ─────────────────────────────────────────────────
console.log('\n=== Summary ===');
console.log(`HiddenTruth: ${b.hiddenTruth.marketCells.length} cells, ${b.hiddenTruth.acnProfiles.length} ACNs, ${b.hiddenTruth.ownerProfilePriors.length} priors`);
console.log(`Materialized: ${b.materializedEntities.brokers.length} brokers, ${b.materializedEntities.listings.length} listings, ${b.materializedEntities.customers.length} customers`);
console.log(`ColdAggregate: ${b.coldAggregate.shadowDemandClusters.length} clusters, ${b.coldAggregate.historicalTransactions.length} txns`);
console.log(`OpeningPOV: ${b.openingPOV.namedRivalBrokers.length} named brokers, ${b.openingPOV.directRivalListings.length} rival listings`);
console.log(`RuntimeState: ecosystemSeed=${rt.ecosystemSeed}, causalSeed=${rt.causalSeed}`);
console.log(`JSON size: ${(JSON.stringify(b).length / 1024).toFixed(1)} KB`);

if (failures > 0) { console.error(`\n${failures} FAILURES`); process.exit(1); }
else { console.log('\nAll tests passed!'); }
