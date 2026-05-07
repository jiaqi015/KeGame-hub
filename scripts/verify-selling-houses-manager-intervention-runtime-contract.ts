/**
 * Manager Intervention Runtime Contract Verification
 *
 * Validates:
 * 1. buildManagerInterventionFromFocusMeeting produces frozen ManagerInterventionReceipt
 * 2. buildManagerInterventionFromDraft produces frozen receipt
 * 3. enrichStateWithManagerInterventions upserts by receiptId
 * 4. normalizeManagerInterventionReceiptHistory handles old saves
 * 5. No Date.now / Math.random in adapter
 * 6. Receipt does not alter gameplay (same seed → same rngCalls)
 * 7. Frozen output
 * 8. No raw GameState in receipt
 * 9. Receipt does NOT directly write trust/urgency/stage
 * 10. Focus meeting context is captured correctly
 */

import assert from 'node:assert/strict';
import { createInitialState } from '../src/selling-houses/application/gameState.js';
import { advanceDays } from '../src/selling-houses/domain/engine.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine/opportunityEngine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import {
  buildManagerInterventionFromFocusMeeting,
  buildManagerInterventionFromDraft,
  enrichStateWithManagerInterventions,
  normalizeManagerInterventionReceiptHistory,
} from '../src/selling-houses/runtime/simulation/managerInterventionAdapter.js';
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

// 1. buildManagerInterventionFromFocusMeeting
console.log('=== Check 1: buildManagerInterventionFromFocusMeeting ===');
const world1 = buildWorld(42);
advanceDays(world1, 3);
const receipt1 = buildManagerInterventionFromFocusMeeting(world1);
// May be null if not a focus meeting day
if (receipt1) {
  check(Object.isFrozen(receipt1), 'receipt is frozen');
  check(typeof receipt1.receiptId === 'string', 'receipt has receiptId');
  check(typeof receipt1.day === 'number', 'receipt has day');
  check(typeof receipt1.caseId === 'string', 'receipt has caseId');
  check(Array.isArray(receipt1.drafts), 'receipt has drafts');
}

// 2. buildManagerInterventionFromDraft
console.log('=== Check 2: buildManagerInterventionFromDraft ===');
const receipt2 = buildManagerInterventionFromDraft(world1, 'case-1', 'showing', '测试原因');
check(Object.isFrozen(receipt2), 'draft receipt is frozen');
check(typeof receipt2.receiptId === 'string', 'draft receipt has receiptId');
check(receipt2.interventionKind === 'manager_draft', 'interventionKind is manager_draft');

// 3. enrichStateWithManagerInterventions upserts
console.log('=== Check 3: upsert by receiptId ===');
const world3 = buildWorld(42);
advanceDays(world3, 3);
// advanceDays already enriches via hooks, so clear for clean test
world3.managerInterventionReceiptHistory = [];
enrichStateWithManagerInterventions(world3, [receipt2]);
check(world3.managerInterventionReceiptHistory!.length === 1, 'receipt added');
enrichStateWithManagerInterventions(world3, [receipt2]);
check(world3.managerInterventionReceiptHistory!.length === 1, 'upsert: no duplicates');

// 4. normalizeManagerInterventionReceiptHistory
console.log('=== Check 4: normalizeManagerInterventionReceiptHistory ===');
check(normalizeManagerInterventionReceiptHistory(undefined).length === 0, 'undefined → empty');
check(normalizeManagerInterventionReceiptHistory(null).length === 0, 'null → empty');
check(normalizeManagerInterventionReceiptHistory([{}]).length === 0, 'invalid → filtered');

// 5. No Date.now / Math.random
console.log('=== Check 5: no side effects ===');
import { readFileSync } from 'node:fs';
const src = readFileSync('/Users/jiaqi/Documents/开放日测算/src/selling-houses/runtime/simulation/managerInterventionAdapter.ts', 'utf-8');
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
const r6 = buildManagerInterventionFromDraft(world6a, 'case-1', 'showing', 'test');
enrichStateWithManagerInterventions(world6a, [r6]);
check(world6a.rngCalls === world6b.rngCalls, 'rngCalls unchanged');
check(world6a.closedDeals.length === world6b.closedDeals.length, 'closedDeals unchanged');

// 7. Frozen output
console.log('=== Check 7: frozen output ===');
check(Object.isFrozen(receipt2), 'receipt frozen');
check(Object.isFrozen(receipt2.drafts), 'receipt drafts frozen');
check(Object.isFrozen(receipt2.evidenceRefs), 'receipt evidenceRefs frozen');

// 8. No raw GameState
console.log('=== Check 8: no raw GameState ===');
const json = JSON.stringify(receipt2);
check(!json.includes('rngState'), 'no rngState');
check(!json.includes('rngCalls'), 'no rngCalls');
check(!json.includes('budgetLedger'), 'no budgetLedger');
check(!json.includes('customerStates'), 'no customerStates');

// 9. No direct trust/urgency/stage writes
console.log('=== Check 9: no direct writes ===');
const srcClean2 = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!srcClean2.includes('.trust ='), 'no direct trust write');
check(!srcClean2.includes('.urgency ='), 'no direct urgency write');
check(!srcClean2.includes('.stageIndex ='), 'no direct stageIndex write');
check(!srcClean2.includes('.stageLabel ='), 'no direct stageLabel write');

// 10. Focus meeting context
console.log('=== Check 10: focus meeting context ===');
check(receipt2.interventionKind === 'manager_draft', 'correct interventionKind');
check(Array.isArray(receipt2.focusMeetingSubmittedCaseIds), 'focusMeetingSubmittedCaseIds is array');
check(Array.isArray(receipt2.focusMeetingSelectedCaseIds), 'focusMeetingSelectedCaseIds is array');
check(receipt2.drafts.length === 1, 'one draft from buildManagerInterventionFromDraft');
check(receipt2.drafts[0].actionSpecId === 'showing', 'draft actionSpecId matches');

// Summary
console.log(`\nTotal: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('manager-intervention-runtime-contract: PASS');
}
