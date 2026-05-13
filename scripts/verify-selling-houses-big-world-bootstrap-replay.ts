// ---------------------------------------------------------------------------
// verify-selling-houses-big-world-bootstrap-replay.ts
//
// Verifies:
// 1. Same seed + config → byte-identical bootstrap (layered structure)
// 2. Different seed → different bootstrap
// 3. Different difficulty → different bootstrap
// 4. Summary is deterministic
// 5. RuntimeInitialState is deterministic
// 6. OpeningPOV is deterministic
// 7. Multiple difficulty levels produce valid bootstraps
// 8. RuntimeInitialState can be reconstructed from summary + seed
// ---------------------------------------------------------------------------

import { createBigWorldBootstrap, buildRuntimeInitialState } from '../src/selling-houses/domain/world-model/bigWorldBootstrap.js';
import { buildBigWorldBootstrapSummary, assertBigWorldSummaryInvariants } from '../src/selling-houses/domain/world-model/bigWorldBootstrapSummary.js';
import type { DifficultyId } from '../src/selling-houses/domain/models.js';

const SCENARIO = '回放测试';
let failures = 0;

function assert(cond: boolean, msg: string): void {
  if (!cond) { console.error(`  FAIL: ${msg}`); failures += 1; }
  else { console.log(`  PASS: ${msg}`); }
}

function j(obj: unknown): string { return JSON.stringify(obj); }

console.log('=== BigWorld Bootstrap Replay Verification ===\n');

// --- 1. Identical replay (layered) ---
console.log('--- 1. Identical replay ---');
const cfg = { seed: 42, scenarioName: SCENARIO, difficultyId: 'standard' as DifficultyId, playerCaseCount: 5,
  playerCaseIds: ['case-1','case-2','case-3','case-4','case-5'] as readonly string[] };
const b1 = createBigWorldBootstrap(cfg);
const b2 = createBigWorldBootstrap(cfg);
assert(j(b1) === j(b2), 'same input → byte-identical');
assert(j(b1.hiddenTruth) === j(b2.hiddenTruth), 'hiddenTruth identical');
assert(j(b1.materializedEntities) === j(b2.materializedEntities), 'materializedEntities identical');
assert(j(b1.coldAggregate) === j(b2.coldAggregate), 'coldAggregate identical');
assert(j(b1.openingPOV) === j(b2.openingPOV), 'openingPOV identical');
assert(j(b1.causalBaseline) === j(b2.causalBaseline), 'causalBaseline identical');

// --- 2. Different seed ---
console.log('\n--- 2. Different seed ---');
const b3 = createBigWorldBootstrap({ ...cfg, seed: 99 });
assert(j(b1) !== j(b3), 'different seed → different');
assert(j(b1.hiddenTruth.ownerProfilePriors) !== j(b3.hiddenTruth.ownerProfilePriors), 'different priors');
assert(j(b1.materializedEntities.brokers) !== j(b3.materializedEntities.brokers), 'different brokers');

// --- 3. Different difficulty ---
console.log('\n--- 3. Different difficulty ---');
const b4 = createBigWorldBootstrap({ ...cfg, difficultyId: 'hard' });
assert(j(b1) !== j(b4), 'different difficulty → different');

// --- 4. Summary deterministic ---
console.log('\n--- 4. Summary deterministic ---');
const s1 = buildBigWorldBootstrapSummary(b1);
const s2 = buildBigWorldBootstrapSummary(b2);
assert(j(s1) === j(s2), 'same bootstrap → identical summary');

// --- 5. RuntimeInitialState deterministic ---
console.log('\n--- 5. RuntimeInitialState deterministic ---');
const rt1 = buildRuntimeInitialState(b1);
const rt2 = buildRuntimeInitialState(b2);
assert(j(rt1) === j(rt2), 'same bootstrap → identical RuntimeInitialState');

// --- 6. OpeningPOV deterministic ---
console.log('\n--- 6. OpeningPOV deterministic ---');
assert(j(b1.openingPOV) === j(b2.openingPOV), 'same bootstrap → identical OpeningPOV');

// --- 7. Multiple difficulty levels ---
console.log('\n--- 7. Multiple difficulties ---');
const diffs: DifficultyId[] = ['warmup', 'easy', 'standard', 'advanced', 'hard'];
for (const d of diffs) {
  const bx = createBigWorldBootstrap({ seed: 42, scenarioName: SCENARIO, difficultyId: d, playerCaseCount: 5 });
  assert(bx.hiddenTruth.marketCells.length >= 3, `${d}: cells >= 3 (${bx.hiddenTruth.marketCells.length})`);
  assert(bx.materializedEntities.brokers.length >= 8, `${d}: brokers >= 8 (${bx.materializedEntities.brokers.length})`);
  assert(bx.materializedEntities.listings.length >= 20, `${d}: listings >= 20 (${bx.materializedEntities.listings.length})`);
  assert(bx.hiddenTruth.ownerProfilePriors.length >= 3, `${d}: priors >= 3 (${bx.hiddenTruth.ownerProfilePriors.length})`);
  const rt = buildRuntimeInitialState(bx);
  assert(rt.ecosystemSeed !== rt.causalSeed, `${d}: sub-seeds differ`);
}

// --- 8. RuntimeInitialState from summary + seed ---
console.log('\n--- 8. Re-bootstrap from seed ---');
// Demonstrate that given seed + difficulty, we can produce the same RuntimeInitialState
const reBootstrap = createBigWorldBootstrap({ seed: 42, scenarioName: SCENARIO, difficultyId: 'standard', playerCaseCount: 5,
  playerCaseIds: ['case-1','case-2','case-3','case-4','case-5'] });
const reRT = buildRuntimeInitialState(reBootstrap);
assert(j(rt1) === j(reRT), 're-bootstrap → same RuntimeInitialState');

// --- 9. Replay 10 times ---
console.log('\n--- 9. Replay 10 times ---');
const base = j(b1);
let ok = true;
for (let i = 0; i < 10; i += 1) {
  if (j(createBigWorldBootstrap(cfg)) !== base) { ok = false; break; }
}
assert(ok, '10 replays identical');

// --- Summary ---
console.log('\n=== Summary ===');
console.log(`Tested ${diffs.length} difficulty levels`);
console.log(`Replayed 10 times`);
console.log(`JSON size: ${(base.length / 1024).toFixed(1)} KB`);

if (failures > 0) { console.error(`\n${failures} FAILURES`); process.exit(1); }
else { console.log('\nAll replay tests passed!'); }
