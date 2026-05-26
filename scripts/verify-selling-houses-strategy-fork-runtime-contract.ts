/**
 * Strategy Fork Runtime Contract Verification
 *
 * Validates:
 * 1. buildStrategyForksFromState produces frozen StrategyForkSummary[]
 * 2. Forks have correct branch structure
 * 3. enrichStateWithStrategyForks upserts by forkId
 * 4. normalizeStrategyForkHistory handles old saves
 * 5. No Date.now / Math.random in adapter
 * 6. Fork does not alter gameplay (same seed → same rngCalls)
 * 7. Frozen output
 * 8. No raw GameState in fork
 * 9. Deterministic: same seed → same forks
 * 10. Fork branches have valid confidence and evidenceRefs
 */

import assert from 'node:assert/strict';
import { createInitialState } from '../src/selling-houses/application/gameState.js';
import { advanceDays } from '../src/selling-houses/domain/engine.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine/opportunityEngine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import {
  buildStrategyForksFromState,
  enrichStateWithStrategyForks,
  normalizeStrategyForkHistory,
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

// 1. buildStrategyForksFromState produces frozen output
console.log('=== Check 1: frozen StrategyForkSummary[] ===');
const world1 = buildWorld(42);
advanceDays(world1, 3);
const forks1 = buildStrategyForksFromState(world1);
check(Object.isFrozen(forks1), 'forks array is frozen');
for (const fork of forks1) {
  check(Object.isFrozen(fork), `fork ${fork.forkId} is frozen`);
  check(Object.isFrozen(fork.branches), `fork ${fork.forkId} branches is frozen`);
}

// 2. Forks have correct branch structure
console.log('=== Check 2: branch structure ===');
for (const fork of forks1) {
  check(typeof fork.forkId === 'string', `fork has forkId`);
  check(typeof fork.day === 'number', `fork has day`);
  check(typeof fork.caseId === 'string', `fork has caseId`);
  check(Array.isArray(fork.branches), `fork has branches`);
  for (const branch of fork.branches) {
    check(typeof branch.branchId === 'string', `branch has branchId`);
    check(typeof branch.strategyLabel === 'string', `branch has strategyLabel`);
    check(typeof branch.confidence === 'number', `branch has confidence`);
    check(branch.confidence >= 0 && branch.confidence <= 1, `branch confidence 0..1`);
  }
}

// 3. enrichStateWithStrategyForks upserts
console.log('=== Check 3: upsert by forkId ===');
const world3 = buildWorld(42);
advanceDays(world3, 3);
// advanceDays already enriches via hooks, so clear for clean test
asWritableGameState(world3).strategyForkHistory = [];
enrichStateWithStrategyForks(world3, forks1);
check(world3.strategyForkHistory!.length === forks1.length, `forks added: ${world3.strategyForkHistory!.length} === ${forks1.length}`);
enrichStateWithStrategyForks(world3, forks1);
check(world3.strategyForkHistory!.length === forks1.length, 'upsert: no duplicates');

// 4. normalizeStrategyForkHistory
console.log('=== Check 4: normalizeStrategyForkHistory ===');
check(normalizeStrategyForkHistory(undefined).length === 0, 'undefined → empty');
check(normalizeStrategyForkHistory(null).length === 0, 'null → empty');
check(normalizeStrategyForkHistory([{}]).length === 0, 'invalid → filtered');

// 5. No Date.now / Math.random
console.log('=== Check 5: no side effects ===');
import { readFileSync } from 'node:fs';
const src = readFileSync('/Users/jiaqi/Documents/开放日测算/src/selling-houses/runtime/simulation/strategyForkAdapter.ts', 'utf-8');
const srcClean = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!srcClean.includes('Date.now'), 'no Date.now');
check(!srcClean.includes('Math.random'), 'no Math.random');
check(!srcClean.includes('fetch('), 'no fetch');
check(!srcClean.includes('openai'), 'no openai');

// 6. Gameplay invariance
console.log('=== Check 6: gameplay invariance ===');
const world6a = buildWorld(42);
const world6b = buildWorld(42);
advanceDays(world6a, 3);
advanceDays(world6b, 3);
enrichStateWithStrategyForks(world6a, buildStrategyForksFromState(world6a));
check(world6a.rngCalls === world6b.rngCalls, 'rngCalls unchanged');
check(world6a.closedDeals.length === world6b.closedDeals.length, 'closedDeals unchanged');

// 7. Frozen output
console.log('=== Check 7: frozen output ===');
for (const fork of forks1) {
  check(Object.isFrozen(fork.branches), `fork branches frozen`);
  for (const b of fork.branches) {
    check(Object.isFrozen(b), `branch frozen`);
  }
}

// 8. No raw GameState
console.log('=== Check 8: no raw GameState ===');
const json = JSON.stringify(forks1);
check(!json.includes('rngState'), 'no rngState');
check(!json.includes('rngCalls'), 'no rngCalls');
check(!json.includes('budgetLedger'), 'no budgetLedger');
check(!json.includes('customerStates'), 'no customerStates');

// 9. Deterministic
console.log('=== Check 9: deterministic ===');
const world9a = buildWorld(42);
const world9b = buildWorld(42);
advanceDays(world9a, 3);
advanceDays(world9b, 3);
const forks9a = buildStrategyForksFromState(world9a);
const forks9b = buildStrategyForksFromState(world9b);
check(JSON.stringify(forks9a) === JSON.stringify(forks9b), 'same seed → same forks');

// 10. Branch confidence and evidenceRefs
console.log('=== Check 10: branch data ===');
for (const fork of forks1) {
  for (const branch of fork.branches) {
    check(typeof branch.evidenceRefs === 'object', `branch has evidenceRefs`);
    check(typeof branch.actionsProposed === 'object', `branch has actionsProposed`);
  }
}

// Summary
console.log(`\nTotal: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('strategy-fork-runtime-contract: PASS');
}
