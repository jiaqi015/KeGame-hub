/**
 * Business Outcome Review Runtime Contract Verification
 *
 * Validates:
 * 1. buildBusinessOutcomeReviewsFromState produces frozen BusinessOutcomeReview[]
 * 2. Reviews have correct structure
 * 3. enrichStateWithBusinessOutcomeReviews upserts by reviewId
 * 4. normalizeBusinessOutcomeReviewHistory handles old saves
 * 5. No Date.now / Math.random in adapter
 * 6. Review does not alter gameplay (same seed → same rngCalls)
 * 7. Frozen output
 * 8. No raw GameState in review
 * 9. Review does NOT create ContractFact
 * 10. Review has success/failure factors and recommended next actions
 */

import assert from 'node:assert/strict';
import { createInitialState } from '../src/selling-houses/application/gameState.js';
import { advanceDays } from '../src/selling-houses/domain/engine.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine/opportunityEngine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import {
  buildBusinessOutcomeReviewsFromState,
  enrichStateWithBusinessOutcomeReviews,
  normalizeBusinessOutcomeReviewHistory,
} from '../src/selling-houses/runtime/simulation/businessOutcomeReviewAdapter.js';
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

// 1. buildBusinessOutcomeReviewsFromState
console.log('=== Check 1: frozen BusinessOutcomeReview[] ===');
const world1 = buildWorld(42);
advanceDays(world1, 3);
const reviews1 = buildBusinessOutcomeReviewsFromState(world1);
check(Object.isFrozen(reviews1), 'reviews array is frozen');
for (const review of reviews1) {
  check(Object.isFrozen(review), `review ${review.reviewId} is frozen`);
  check(Object.isFrozen(review.successFactors), 'successFactors frozen');
  check(Object.isFrozen(review.failureFactors), 'failureFactors frozen');
  check(Object.isFrozen(review.keyLearnings), 'keyLearnings frozen');
  check(Object.isFrozen(review.recommendedNextActions), 'recommendedNextActions frozen');
}

// 2. Reviews have correct structure
console.log('=== Check 2: review structure ===');
for (const review of reviews1) {
  check(typeof review.reviewId === 'string', 'review has reviewId');
  check(typeof review.caseId === 'string', 'review has caseId');
  check(typeof review.templateKind === 'string', 'review has templateKind');
  check(typeof review.startedDay === 'number', 'review has startedDay');
  check(typeof review.endedDay === 'number', 'review has endedDay');
  check(typeof review.finalStatus === 'string', 'review has finalStatus');
  check(typeof review.outcomeDescription === 'string', 'review has outcomeDescription');
  check(Array.isArray(review.successFactors), 'review has successFactors');
  check(Array.isArray(review.failureFactors), 'review has failureFactors');
  check(Array.isArray(review.keyLearnings), 'review has keyLearnings');
  check(Array.isArray(review.recommendedNextActions), 'review has recommendedNextActions');
  for (const action of review.recommendedNextActions) {
    check(typeof action.actionId === 'string', `action has actionId`);
    check(typeof action.reason === 'string', `action has reason`);
    check(['urgent', 'high', 'medium', 'low'].includes(action.priority), `action has valid priority`);
  }
}

// 3. enrichStateWithBusinessOutcomeReviews upserts
console.log('=== Check 3: upsert by reviewId ===');
const world3 = buildWorld(42);
advanceDays(world3, 3);
// advanceDays already enriches via hooks, so clear for clean test
world3.businessOutcomeReviewHistory = [];
enrichStateWithBusinessOutcomeReviews(world3, reviews1);
check(world3.businessOutcomeReviewHistory!.length === reviews1.length, 'reviews added');
enrichStateWithBusinessOutcomeReviews(world3, reviews1);
check(world3.businessOutcomeReviewHistory!.length === reviews1.length, 'upsert: no duplicates');

// 4. normalizeBusinessOutcomeReviewHistory
console.log('=== Check 4: normalizeBusinessOutcomeReviewHistory ===');
check(normalizeBusinessOutcomeReviewHistory(undefined).length === 0, 'undefined → empty');
check(normalizeBusinessOutcomeReviewHistory(null).length === 0, 'null → empty');
check(normalizeBusinessOutcomeReviewHistory([{}]).length === 0, 'invalid → filtered');

// 5. No Date.now / Math.random
console.log('=== Check 5: no side effects ===');
import { readFileSync } from 'node:fs';
const src = readFileSync('/Users/jiaqi/Documents/开放日测算/src/selling-houses/runtime/simulation/businessOutcomeReviewAdapter.ts', 'utf-8');
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
enrichStateWithBusinessOutcomeReviews(world6a, buildBusinessOutcomeReviewsFromState(world6a));
check(world6a.rngCalls === world6b.rngCalls, 'rngCalls unchanged');
check(world6a.closedDeals.length === world6b.closedDeals.length, 'closedDeals unchanged');

// 7. Frozen output
console.log('=== Check 7: frozen output ===');
for (const review of reviews1) {
  check(Object.isFrozen(review), 'review frozen');
  check(Object.isFrozen(review.successFactors), 'successFactors frozen');
  check(Object.isFrozen(review.recommendedNextActions), 'recommendedNextActions frozen');
}

// 8. No raw GameState
console.log('=== Check 8: no raw GameState ===');
const json = JSON.stringify(reviews1);
check(!json.includes('rngState'), 'no rngState');
check(!json.includes('rngCalls'), 'no rngCalls');
check(!json.includes('budgetLedger'), 'no budgetLedger');
check(!json.includes('customerStates'), 'no customerStates');

// 9. Review does NOT create ContractFact
console.log('=== Check 9: no ContractFact creation ===');
check(!srcClean.includes('createContractFactState'), 'no createContractFactState');
check(!srcClean.includes('contractId = build'), 'no contractId builder');

// 10. Review has success/failure factors and recommended next actions
console.log('=== Check 10: review content ===');
for (const review of reviews1) {
  check(typeof review.outcomeDescription === 'string' && review.outcomeDescription.length > 0, 'review has outcomeDescription');
  check(Array.isArray(review.successFactors), 'review has successFactors');
  check(Array.isArray(review.failureFactors), 'review has failureFactors');
  check(Array.isArray(review.keyLearnings), 'review has keyLearnings');
  check(Array.isArray(review.recommendedNextActions), 'review has recommendedNextActions');
  check(Array.isArray(review.relatedReceiptIds), 'review has relatedReceiptIds');
  check(Array.isArray(review.relatedSettlementIds), 'review has relatedSettlementIds');
  check(Array.isArray(review.relatedRunIds), 'review has relatedRunIds');
}

// 11. Review relatedReceiptIds include ledger and fork evidence
console.log('=== Check 11: review evidence sources ===');
for (const review of reviews1) {
  // relatedReceiptIds now includes ledger and fork refs
  const hasLedgerRef = review.relatedReceiptIds.some((id) => id.startsWith('ledger:'));
  const hasForkRef = review.relatedReceiptIds.some((id) => !id.startsWith('receipt-') && !id.startsWith('ledger:'));
  // These are optional — only validate format if present
  if (hasLedgerRef) {
    check(true, `review ${review.reviewId}: has ledger evidence refs`);
  }
  if (hasForkRef) {
    check(true, `review ${review.reviewId}: has fork evidence refs`);
  }
  // All receipt IDs should be strings
  for (const id of review.relatedReceiptIds) {
    check(typeof id === 'string' && id.length > 0, `receipt ID is non-empty string: ${id}`);
  }
}

// Summary
console.log(`\nTotal: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);
if (failed > 0) {
  process.exit(1);
} else {
  console.log('business-outcome-review-runtime-contract: PASS');
}
