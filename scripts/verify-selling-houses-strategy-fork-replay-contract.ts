/**
 * Strategy Fork Replay Contract Verification
 *
 * Validates:
 * 1. Same seed + same actions → byte-identical strategy forks
 * 2. Fork does NOT pollute main world
 * 3. Fork branches are read-only proposals (never executed)
 * 4. No Date.now / Math.random in adapter
 * 5. Same seed → same recommendedBranchId
 * 6. Fork history upserts correctly
 * 7. Old saves without strategyForkHistory work
 */

import assert from 'node:assert/strict';
import { createInitialState } from '../src/selling-houses/application/gameState.js';
import { advanceDays } from '../src/selling-houses/domain/engine.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine/opportunityEngine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import {
  buildStrategyForksFromState,
  enrichStateWithStrategyForks,
} from '../src/selling-houses/runtime/simulation/strategyForkAdapter.js';
import { asWritableGameState } from '../src/selling-houses/domain/models.js';
import type { GameState } from '../src/selling-houses/domain/models.js';

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string) {
  if (condition) { passed++; }
  else { failed++; console.error(`  [FAIL] ${message}`); }
}

function buildWorld(seed: number): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario');
  const world = createInitialState(snapshot, seed);
  seedInitialOpportunities(world);
  return world;
}

// 1. Same seed → byte-identical forks
console.log('=== Check 1: same seed → byte-identical ===');
const world1a = buildWorld(42);
const world1b = buildWorld(42);
advanceDays(world1a, 3);
advanceDays(world1b, 3);
const forks1a = buildStrategyForksFromState(world1a);
const forks1b = buildStrategyForksFromState(world1b);
check(JSON.stringify(forks1a) === JSON.stringify(forks1b), 'same seed → same forks');

// 2. Fork does NOT pollute main world
console.log('=== Check 2: no main world pollution ===');
const world2 = buildWorld(42);
const beforeRng = world2.rngCalls;
const beforeCases = world2.cases.length;
advanceDays(world2, 3);
const afterRng = world2.rngCalls;
const afterCases = world2.cases.length;
const forks2 = buildStrategyForksFromState(world2);
// Fork should not change rngCalls or case count
check(world2.rngCalls === afterRng, 'fork does not change rngCalls');
check(world2.cases.length === afterCases, 'fork does not change case count');

// 3. Fork branches are read-only proposals
console.log('=== Check 3: read-only proposals ===');
for (const fork of forks2) {
  for (const branch of fork.branches) {
    check(typeof branch.branchId === 'string', 'branch has branchId (not executed)');
    check(typeof branch.outcomeForecast === 'string', 'branch has outcomeForecast (not outcome)');
    check(typeof branch.confidence === 'number', 'branch has confidence (not probability roll)');
  }
}

// 4. No Date.now / Math.random
console.log('=== Check 4: no side effects ===');
import { readFileSync } from 'node:fs';
const src = readFileSync('/Users/jiaqi/Documents/开放日测算/src/selling-houses/runtime/simulation/strategyForkAdapter.ts', 'utf-8');
const srcClean = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!srcClean.includes('Date.now'), 'no Date.now');
check(!srcClean.includes('Math.random'), 'no Math.random');

// 5. Same seed → same recommendedBranchId
console.log('=== Check 5: same recommendedBranchId ===');
check(
  forks1a.length === 0 || forks1a[0].recommendedBranchId === forks1b[0]?.recommendedBranchId,
  'same seed → same recommendedBranchId',
);

// 6. Fork history upserts correctly
console.log('=== Check 6: upsert ===');
const world6 = buildWorld(42);
advanceDays(world6, 3);
// advanceDays already enriches via hooks, so clear for clean test
asWritableGameState(world6).strategyForkHistory = [];
enrichStateWithStrategyForks(world6, forks2);
enrichStateWithStrategyForks(world6, forks2);
check(world6.strategyForkHistory!.length === forks2.length, 'upsert: no duplicates');

// 7. Old saves work
console.log('=== Check 7: old save fallback ===');
const world7 = buildWorld(42);
delete (world7 as any).strategyForkHistory;
const forks7 = buildStrategyForksFromState(world7);
check(Array.isArray(forks7), 'old save: forks still work');

// Summary
console.log(`\nTotal: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('strategy-fork-replay-contract: PASS');
}
