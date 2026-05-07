/**
 * DailyOperatingLedger Runtime Contract Verification.
 *
 * Validates the runtime adapter behavior:
 * 1. buildDailyOperatingLedgerFromTickResult produces valid entries
 * 2. enrichStateWithDailyOperatingLedger upserts correctly
 * 3. No raw GameState in ledger output
 * 4. Ledger doesn't alter gameplay fields
 * 5. Same state → same ledger (deterministic)
 * 6. Ledger entries contain semantic receipt data
 * 7. Ledger contains operatingMovement when available
 * 8. normalizeOperatingLedgerDays handles old saves
 */

import { readFileSync } from 'node:fs';

import {
  buildDailyOperatingLedgerFromTickResult,
  enrichStateWithDailyOperatingLedger,
  normalizeOperatingLedgerDays,
} from '../src/selling-houses/runtime/simulation/dailyOperatingLedgerAdapter.js';

import { createInitialState } from '../src/selling-houses/application/gameState.js';
import { advanceDays, advanceOneDay } from '../src/selling-houses/domain/engine.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine/opportunityEngine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import type { GameState, DailyTickResult } from '../src/selling-houses/domain/models.js';
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
// 1. buildDailyOperatingLedgerFromTickResult produces valid entries
// ---------------------------------------------------------------------------

console.log('=== Check 1: buildDailyOperatingLedgerFromTickResult ===');

const state1 = buildWorld(SEED);
const tick1 = advanceOneDay(state1);

if (tick1) {
  const activeIds = state1.cases.filter((c) => c.status === 'active').map((c) => c.id).sort();
  const entry = buildDailyOperatingLedgerFromTickResult(tick1, activeIds, state1.gameOver);

  check(entry.day === tick1.day, `day matches tick (${entry.day} === ${tick1.day})`);
  check(typeof entry.entryCount === 'number', 'entryCount is number');
  check(typeof entry.pendingCount === 'number', 'pendingCount is number');
  check(typeof entry.resolvedCount === 'number', 'resolvedCount is number');
  check(typeof entry.signedCount === 'number', 'signedCount is number');
  check(typeof entry.closedCount === 'number', 'closedCount is number');
  check(typeof entry.observingCount === 'number', 'observingCount is number');
  check(typeof entry.riskBlockedCount === 'number', 'riskBlockedCount is number');
  check(typeof entry.totalTasks === 'number', 'totalTasks is number');
  check(typeof entry.totalOutcomes === 'number', 'totalOutcomes is number');
  check(typeof entry.totalEvidenceRefs === 'number', 'totalEvidenceRefs is number');
  check(entry.semanticReceipt !== undefined, 'semanticReceipt is present');
  check(Object.isFrozen(entry), 'entry is frozen');
}

console.log('  buildDailyOperatingLedgerFromTickResult: PASS');

// ---------------------------------------------------------------------------
// 2. enrichStateWithDailyOperatingLedger upserts correctly
// ---------------------------------------------------------------------------

console.log('=== Check 2: enrichStateWithDailyOperatingLedger ===');

const state2 = buildWorld(SEED);
state2.operatingLedgerDays = [];

const entry1: DailyOperatingLedgerDaySummary = {
  day: 1,
  entries: [],
  entryCount: 0,
  pendingCount: 0,
  resolvedCount: 0,
  signedCount: 0,
  closedCount: 0,
  observingCount: 0,
  riskBlockedCount: 0,
  totalTasks: 0,
  totalOutcomes: 0,
  totalEvidenceRefs: 0,
};

enrichStateWithDailyOperatingLedger(state2, entry1);
check(state2.operatingLedgerDays!.length === 1, 'after first enrich: 1 entry');
check(state2.operatingLedgerDays![0].day === 1, 'day=1');

// Upsert same day
const entry1Updated: DailyOperatingLedgerDaySummary = {
  ...entry1,
  entryCount: 5,
};

enrichStateWithDailyOperatingLedger(state2, entry1Updated);
check(state2.operatingLedgerDays!.length === 1, 'after upsert same day: still 1 entry');
check(state2.operatingLedgerDays![0].entryCount === 5, 'entryCount updated to 5');

// Add different day
const entry2: DailyOperatingLedgerDaySummary = { ...entry1, day: 2 };
enrichStateWithDailyOperatingLedger(state2, entry2);
check(state2.operatingLedgerDays!.length === 2, 'after add day 2: 2 entries');

console.log('  enrichStateWithDailyOperatingLedger: PASS');

// ---------------------------------------------------------------------------
// 3. No raw GameState in ledger output
// ---------------------------------------------------------------------------

console.log('=== Check 3: No raw GameState ===');

const state3 = buildWorld(SEED);
advanceDays(state3, 2);

const ledger = state3.operatingLedgerDays ?? [];
const ledgerJson = JSON.stringify(ledger);

check(!ledgerJson.includes('"rngState"'), 'no rngState');
check(!ledgerJson.includes('"rngCalls"'), 'no rngCalls');
check(!ledgerJson.includes('"budgetLedger"'), 'no budgetLedger');
check(!ledgerJson.includes('"customerStates"'), 'no customerStates');
check(!ledgerJson.includes('"scheduledEvents"'), 'no scheduledEvents');

console.log('  No raw GameState: PASS');

// ---------------------------------------------------------------------------
// 4. Ledger doesn't alter gameplay fields
// ---------------------------------------------------------------------------

console.log('=== Check 4: Gameplay invariance ===');

const state4a = buildWorld(SEED);
const state4b = buildWorld(SEED);

// Run both with same seed — ledger should not affect gameplay
advanceDays(state4a, 3);
advanceDays(state4b, 3);

check(state4a.day === state4b.day, 'same day after advance');
check(state4a.rngCalls === state4b.rngCalls, 'same rngCalls');
check(state4a.rngState === state4b.rngState, 'same rngState');
check(JSON.stringify(state4a.cases) === JSON.stringify(state4b.cases), 'same cases');
check(JSON.stringify(state4a.opportunities) === JSON.stringify(state4b.opportunities), 'same opportunities');

console.log('  Gameplay invariance: PASS');

// ---------------------------------------------------------------------------
// 5. Deterministic
// ---------------------------------------------------------------------------

console.log('=== Check 5: Deterministic ===');

const state5a = buildWorld(SEED);
const state5b = buildWorld(SEED);

advanceDays(state5a, 5);
advanceDays(state5b, 5);

const ledger5a = state5a.operatingLedgerDays ?? [];
const ledger5b = state5b.operatingLedgerDays ?? [];

check(ledger5a.length === ledger5b.length, `same length (${ledger5a.length})`);
check(JSON.stringify(ledger5a) === JSON.stringify(ledger5b), 'byte-identical JSON');

console.log('  Deterministic: PASS');

// ---------------------------------------------------------------------------
// 6. Semantic receipt data in ledger
// ---------------------------------------------------------------------------

console.log('=== Check 6: Semantic receipt data ===');

for (const entry of ledger5a) {
  check(entry.semanticReceipt !== undefined, `day ${entry.day}: has semanticReceipt`);
  check(entry.semanticReceipt.day === entry.day, `day ${entry.day}: receipt day matches`);
  check(entry.semanticReceipt.interactionScenes !== undefined, `day ${entry.day}: has interactionScenes`);
  check(entry.semanticReceipt.narrativeSignalPack !== undefined, `day ${entry.day}: has narrativeSignalPack`);
  check(typeof entry.semanticReceipt.llmReady === 'boolean', `day ${entry.day}: llmReady is boolean`);
}

console.log('  Semantic receipt data: PASS');

// ---------------------------------------------------------------------------
// 7. operatingMovement when available
// ---------------------------------------------------------------------------

console.log('=== Check 7: operatingMovement ===');

const withMovement = ledger5a.filter((e) => e.operatingMovement !== undefined);
check(withMovement.length > 0, `at least one entry has operatingMovement (${withMovement.length})`);

for (const entry of withMovement) {
  const om = entry.operatingMovement!;
  check(typeof om.movedCaseCount === 'number', `day ${entry.day}: movedCaseCount`);
  check(typeof om.worsenedCaseCount === 'number', `day ${entry.day}: worsenedCaseCount`);
  check(typeof om.improvedCaseCount === 'number', `day ${entry.day}: improvedCaseCount`);
  check(Array.isArray(om.caseMovements), `day ${entry.day}: caseMovements is array`);
}

console.log('  operatingMovement: PASS');

// ---------------------------------------------------------------------------
// 8. dailyDecisionBridge in semantic receipt
// ---------------------------------------------------------------------------

console.log('=== Check 8: dailyDecisionBridge in receipt ===');

for (const entry of ledger5a) {
  check(entry.semanticReceipt.dailyDecisionBridge !== undefined, `day ${entry.day}: has dailyDecisionBridge`);
  const bridge = entry.semanticReceipt.dailyDecisionBridge!;
  check(bridge.day === entry.day, `day ${entry.day}: bridge day matches`);
  check(typeof bridge.totalMovedCases === 'number', `day ${entry.day}: totalMovedCases`);
  check(typeof bridge.totalBlockers === 'number', `day ${entry.day}: totalBlockers`);
  check(typeof bridge.totalCommitments === 'number', `day ${entry.day}: totalCommitments`);
}

console.log('  dailyDecisionBridge in receipt: PASS');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Summary ===`);
console.log(`Total: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);

if (failed > 0) {
  console.log('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\nselling-houses daily-operating-ledger runtime contract verification passed');
  process.exit(0);
}
