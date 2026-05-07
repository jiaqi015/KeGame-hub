/**
 * DailyOperatingLedger Replay Contract Verification.
 *
 * Validates:
 * 1. Same seed + same actions → byte-identical ledger output
 * 2. Ledger contains semantic receipt bundles
 * 3. Ledger preserves pressureReceipts and consensusReceipts
 * 4. Ledger does NOT contain raw GameState/Case/Opportunity
 * 5. Upsert by day: same day → no duplicate entries
 * 6. Old saves without operatingLedgerDays work (empty array fallback)
 * 7. Ledger entries are frozen
 * 8. operatingMovement from bridge is preserved in ledger
 */

import { readFileSync } from 'node:fs';

import { createInitialState } from '../src/selling-houses/application/gameState.js';
import { advanceDays } from '../src/selling-houses/domain/engine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine/opportunityEngine.js';
import { normalizeOperatingLedgerDays } from '../src/selling-houses/runtime/simulation/dailyOperatingLedgerAdapter.js';
import type { GameState } from '../src/selling-houses/domain/models.js';
import type { DailyOperatingLedgerDaySummary } from '../src/selling-houses/core/world-state/semantic-receipt/dailyOperatingLedger.js';

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string) {
  if (condition) { passed++; }
  else { failed++; console.error(`  [FAIL] ${message}`); }
}

function buildWorld(seed: number): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  if (!snapshot) throw new Error('standard-window-chain scenario not found');
  const state = createInitialState(snapshot, seed);
  seedInitialOpportunities(state);
  return state;
}

const SEED = 20260507;

// ---------------------------------------------------------------------------
// 1. Same seed + same actions → byte-identical ledger
// ---------------------------------------------------------------------------

console.log('=== Check 1: Deterministic replay ===');

const stateA = buildWorld(SEED);
const stateB = buildWorld(SEED);

advanceDays(stateA, 3);
advanceDays(stateB, 3);

const ledgerA = stateA.operatingLedgerDays ?? [];
const ledgerB = stateB.operatingLedgerDays ?? [];

check(ledgerA.length === ledgerB.length, `same seed: same ledger length (${ledgerA.length} === ${ledgerB.length})`);
check(ledgerA.length > 0, `ledger has entries (${ledgerA.length})`);

// Compare each day's JSON
let allIdentical = true;
for (let i = 0; i < Math.min(ledgerA.length, ledgerB.length); i++) {
  const jsonA = JSON.stringify(ledgerA[i]);
  const jsonB = JSON.stringify(ledgerB[i]);
  if (jsonA !== jsonB) {
    allIdentical = false;
    console.error(`  Day ${ledgerA[i].day}: JSON mismatch`);
  }
}
check(allIdentical, 'same seed: all ledger entries byte-identical');

console.log('  Deterministic replay: PASS');

// ---------------------------------------------------------------------------
// 2. Ledger contains semantic receipt bundles
// ---------------------------------------------------------------------------

console.log('=== Check 2: Semantic receipts in ledger ===');

for (const entry of ledgerA) {
  check(entry.semanticReceipt !== undefined, `day ${entry.day}: has semanticReceipt`);
  check(entry.semanticReceipt.day === entry.day, `day ${entry.day}: receipt day matches`);
  check(entry.semanticReceipt.pressureReceipts !== undefined, `day ${entry.day}: has pressureReceipts`);
  check(entry.semanticReceipt.consensusReceipts !== undefined, `day ${entry.day}: has consensusReceipts`);
}

console.log('  Semantic receipts in ledger: PASS');

// ---------------------------------------------------------------------------
// 3. Pressure/consensus receipts preserved
// ---------------------------------------------------------------------------

console.log('=== Check 3: Pressure/consensus preserved ===');

for (const entry of ledgerA) {
  const receipt = entry.semanticReceipt;
  // Pressure receipts should have valid structure
  check(typeof receipt.pressureReceipts.available === 'boolean', `day ${entry.day}: pressureReceipts.available is boolean`);
  check(typeof receipt.consensusReceipts.available === 'boolean', `day ${entry.day}: consensusReceipts.available is boolean`);
}

console.log('  Pressure/consensus preserved: PASS');

// ---------------------------------------------------------------------------
// 4. No raw GameState in ledger
// ---------------------------------------------------------------------------

console.log('=== Check 4: No raw GameState ===');

const ledgerJson = JSON.stringify(ledgerA);
check(!ledgerJson.includes('"rngState"'), 'no rngState in ledger');
check(!ledgerJson.includes('"rngCalls"'), 'no rngCalls in ledger');
check(!ledgerJson.includes('"budgetLedger"'), 'no budgetLedger in ledger');
check(!ledgerJson.includes('"customerStates"'), 'no customerStates in ledger');
// These are allowed in semantic receipt bundle (they're compressed refs)
// but raw full objects should not appear

console.log('  No raw GameState: PASS');

// ---------------------------------------------------------------------------
// 5. Upsert by day (no duplicates)
// ---------------------------------------------------------------------------

console.log('=== Check 5: Upsert by day ===');

// Check that each day appears at most once
const dayCounts = new Map<number, number>();
for (const entry of ledgerA) {
  dayCounts.set(entry.day, (dayCounts.get(entry.day) ?? 0) + 1);
}

let noDuplicates = true;
for (const [day, count] of dayCounts) {
  if (count > 1) {
    noDuplicates = false;
    console.error(`  Day ${day}: appears ${count} times`);
  }
}
check(noDuplicates, 'no duplicate days in ledger');

console.log('  Upsert by day: PASS');

// ---------------------------------------------------------------------------
// 6. Old saves without operatingLedgerDays (empty array fallback)
// ---------------------------------------------------------------------------

console.log('=== Check 6: Old save fallback ===');

check(normalizeOperatingLedgerDays(undefined).length === 0, 'undefined → empty array');
check(normalizeOperatingLedgerDays(null).length === 0, 'null → empty array');
check(normalizeOperatingLedgerDays('invalid').length === 0, 'string → empty array');
check(normalizeOperatingLedgerDays([]).length === 0, 'empty array → empty array');
check(normalizeOperatingLedgerDays([{ day: 1 }]).length === 1, 'valid entry → kept');
check(normalizeOperatingLedgerDays([{ day: -1 }]).length === 0, 'negative day → filtered');
check(normalizeOperatingLedgerDays([{ noDay: true }]).length === 0, 'no day field → filtered');

console.log('  Old save fallback: PASS');

// ---------------------------------------------------------------------------
// 7. Entries are frozen
// ---------------------------------------------------------------------------

console.log('=== Check 7: Frozen entries ===');

for (const entry of ledgerA) {
  check(Object.isFrozen(entry), `day ${entry.day}: entry is frozen`);
  check(Object.isFrozen(entry.entries), `day ${entry.day}: entries array is frozen`);
}

console.log('  Frozen entries: PASS');

// ---------------------------------------------------------------------------
// 8. operatingMovement from bridge preserved
// ---------------------------------------------------------------------------

console.log('=== Check 8: operatingMovement preserved ===');

// At least some entries should have operatingMovement
const withMovement = ledgerA.filter((e) => e.operatingMovement !== undefined);
check(withMovement.length > 0, `at least one entry has operatingMovement (${withMovement.length}/${ledgerA.length})`);

for (const entry of withMovement) {
  const om = entry.operatingMovement!;
  check(typeof om.movedCaseCount === 'number', `day ${entry.day}: movedCaseCount is number`);
  check(typeof om.worsenedCaseCount === 'number', `day ${entry.day}: worsenedCaseCount is number`);
  check(typeof om.improvedCaseCount === 'number', `day ${entry.day}: improvedCaseCount is number`);
}

console.log('  operatingMovement preserved: PASS');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Summary ===`);
console.log(`Total: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);

if (failed > 0) {
  console.log('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\nselling-houses daily-operating-ledger replay contract verification passed');
  process.exit(0);
}
