/**
 * Negotiation Replay Replay Contract Verification
 *
 * Validates that replay is deterministic:
 * 1. Same seed + same actions → byte-identical NegotiationReplaySummary
 * 2. Same seed + same actions → byte-identical evidence chain
 * 3. Same seed + same actions → byte-identical turn points
 * 4. Same seed + same actions → byte-identical phases
 * 5. Replay does not alter gameplay (rngCalls, closedDeals unchanged)
 * 6. Replay does NOT re-roll dice
 * 7. Evidence chain is sorted by day
 * 8. Frozen output
 */

import assert from 'node:assert/strict';
import { createInitialState } from '../src/selling-houses/application/gameState.js';
import { advanceDays } from '../src/selling-houses/domain/engine.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine/opportunityEngine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import {
  buildNegotiationReplaysFromState,
  enrichStateWithNegotiationReplays,
} from '../src/selling-houses/runtime/simulation/negotiationReplayAdapter.js';
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

// 1. Same seed → byte-identical replays
console.log('=== Check 1: same seed → byte-identical replays ===');
const world1a = buildWorld(42);
const world1b = buildWorld(42);
advanceDays(world1a, 5);
advanceDays(world1b, 5);
const replays1a = buildNegotiationReplaysFromState(world1a);
const replays1b = buildNegotiationReplaysFromState(world1b);
check(
  JSON.stringify(replays1a) === JSON.stringify(replays1b),
  'same seed → byte-identical replays',
);

// 2. Same seed → byte-identical evidence chain
console.log('=== Check 2: same seed → byte-identical evidence chain ===');
for (let i = 0; i < replays1a.length; i++) {
  check(
    JSON.stringify(replays1a[i].evidenceChain) === JSON.stringify(replays1b[i].evidenceChain),
    `replay ${i}: evidence chain identical`,
  );
}

// 3. Same seed → byte-identical turn points
console.log('=== Check 3: same seed → byte-identical turn points ===');
for (let i = 0; i < replays1a.length; i++) {
  check(
    JSON.stringify(replays1a[i].turnPoints) === JSON.stringify(replays1b[i].turnPoints),
    `replay ${i}: turn points identical`,
  );
}

// 4. Same seed → byte-identical phases
console.log('=== Check 4: same seed → byte-identical phases ===');
for (let i = 0; i < replays1a.length; i++) {
  check(
    JSON.stringify(replays1a[i].phases) === JSON.stringify(replays1b[i].phases),
    `replay ${i}: phases identical`,
  );
}

// 5. Replay does not alter gameplay
console.log('=== Check 5: gameplay invariance ===');
const world5a = buildWorld(42);
const world5b = buildWorld(42);
advanceDays(world5a, 3);
advanceDays(world5b, 3);
enrichStateWithNegotiationReplays(world5a, buildNegotiationReplaysFromState(world5a));
check(world5a.rngCalls === world5b.rngCalls, 'rngCalls unchanged');
check(world5a.closedDeals.length === world5b.closedDeals.length, 'closedDeals unchanged');

// 6. Replay does NOT re-roll dice
console.log('=== Check 6: no dice roll ===');
import { readFileSync } from 'node:fs';
const src = readFileSync('/Users/jiaqi/Documents/开放日测算/src/selling-houses/runtime/simulation/negotiationReplayAdapter.ts', 'utf-8');
const srcClean = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!srcClean.includes('randomInt'), 'no randomInt in adapter');
check(!srcClean.includes('Date.now'), 'no Date.now');
check(!srcClean.includes('Math.random'), 'no Math.random');

// 7. Evidence chain sorted by day
console.log('=== Check 7: evidence chain sorted ===');
for (const replay of replays1a) {
  for (let i = 1; i < replay.evidenceChain.length; i++) {
    check(
      replay.evidenceChain[i].day >= replay.evidenceChain[i - 1].day,
      'evidence chain sorted by day',
    );
  }
}

// 8. Frozen output
console.log('=== Check 8: frozen output ===');
for (const replay of replays1a) {
  check(Object.isFrozen(replay), 'replay frozen');
  check(Object.isFrozen(replay.phases), 'phases frozen');
  check(Object.isFrozen(replay.turnPoints), 'turnPoints frozen');
  check(Object.isFrozen(replay.evidenceChain), 'evidenceChain frozen');
}

// Summary
console.log(`\nTotal: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('negotiation-replay-replay-contract: PASS');
}
