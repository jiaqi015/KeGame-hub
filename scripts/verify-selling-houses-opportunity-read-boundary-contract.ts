/**
 * Opportunity Read Boundary Contract Verification
 *
 * Validates:
 * 1. Canonical match preferred over legacy when available
 * 2. Legacy fallback when no canonical state
 * 3. Source markers correct
 * 4. No state mutation
 * 5. Core boundary clean
 * 6. Old save fallback works
 */

import { readFileSync } from 'node:fs';
import {
  readOpportunityIntent,
  readOpportunityConfidence,
  readOpportunityStage,
  readOpportunityLifecycle,
  readOpportunityFit,
  readOpportunityDaysLeft,
  readOpportunityPendingClosing,
  readOpportunityRiskSignals,
  findCustomerCaseMatchFromState,
  findBrokeredOpportunityFromState,
} from '../src/selling-houses/core/world-state/opportunity-relations/readBoundary.js';

import {
  buildCustomerCaseMatchId,
  buildBrokeredOpportunityId,
} from '../src/selling-houses/core/world-state/opportunity-relations/writeSource.js';

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string) {
  if (condition) { passed++; }
  else { failed++; console.error(`  [FAIL] ${message}`); }
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const legacyOpp = {
  id: 'opp-1',
  caseId: 'case-1',
  customerId: 'cust-1',
  customerName: 'Test Customer',
  fit: 60,
  intent: 20,
  confidence: 30,
  stageIndex: 1,
  stageLabel: '初步沟通',
  status: 'active',
  lifecycleStatus: 'active',
  leadSource: 'direct',
  visibility: 'revealed',
  channelId: 'ch-1',
  channelName: 'test',
  createdDay: 1,
  daysLeft: 5,
  touchedToday: false,
  budgetMax: 500,
  priceSensitivity: 50,
  stagnationTicks: 0,
};

const canonicalMatch = {
  matchId: buildCustomerCaseMatchId('cust-1', 'case-1'),
  customerId: 'cust-1',
  caseId: 'case-1',
  fit: 85,
  interest: 80,
  confidence: 75,
  budgetMax: 600,
  priceSensitivity: 40,
  selected: true,
  offered: false,
  viewed: true,
  lastUpdatedDay: 5,
};

const canonicalBrokered = {
  brokeredOpportunityId: buildBrokeredOpportunityId('opp-1'),
  legacyOpportunityId: 'opp-1',
  matchId: buildCustomerCaseMatchId('cust-1', 'case-1'),
  stageIndex: 4,
  stageLabel: '谈判中',
  status: 'active',
  lifecycleStatus: 'active',
  daysLeft: 3,
  stagnationTicks: 0,
  pendingClosingEvaluation: true,
  pendingClosingStrategyId: 'hold',
  pendingClosingRequestedDay: 3,
};

// ---------------------------------------------------------------------------
// 1. Canonical match preferred over legacy
// ---------------------------------------------------------------------------

console.log('=== Check 1: Canonical match preferred ===');

const stateWithMatch = {
  runtimeCustomerCaseMatches: [canonicalMatch],
  runtimeBrokeredOpportunities: [],
};

const intentResult = readOpportunityIntent(stateWithMatch, legacyOpp);
check(intentResult.value === 80, `intent from canonical: ${intentResult.value}`);
check(intentResult.source === 'canonical_match', `intent source: ${intentResult.source}`);

const confidenceResult = readOpportunityConfidence(stateWithMatch, legacyOpp);
check(confidenceResult.value === 75, `confidence from canonical: ${confidenceResult.value}`);
check(confidenceResult.source === 'canonical_match', `confidence source: ${confidenceResult.source}`);

console.log('  Canonical match preferred: PASS');

// ---------------------------------------------------------------------------
// 2. Legacy fallback when no canonical state
// ---------------------------------------------------------------------------

console.log('=== Check 2: Legacy fallback ===');

const emptyState = {
  runtimeCustomerCaseMatches: [],
  runtimeBrokeredOpportunities: [],
};

const fallbackIntent = readOpportunityIntent(emptyState, legacyOpp);
check(fallbackIntent.value === 20, `intent fallback: ${fallbackIntent.value}`);
check(fallbackIntent.source === 'legacy_opportunity_mirror', `intent source: ${fallbackIntent.source}`);

const fallbackConfidence = readOpportunityConfidence(emptyState, legacyOpp);
check(fallbackConfidence.value === 30, `confidence fallback: ${fallbackConfidence.value}`);
check(fallbackConfidence.source === 'legacy_opportunity_mirror', `confidence source: ${fallbackConfidence.source}`);

console.log('  Legacy fallback: PASS');

// ---------------------------------------------------------------------------
// 3. Stage from canonical brokered opportunity
// ---------------------------------------------------------------------------

console.log('=== Check 3: Stage from canonical brokered ===');

const stateWithBrokered = {
  runtimeCustomerCaseMatches: [],
  runtimeBrokeredOpportunities: [canonicalBrokered],
};

const stageResult = readOpportunityStage(stateWithBrokered, legacyOpp);
check(stageResult.value.stageIndex === 4, `stage from canonical: ${stageResult.value.stageIndex}`);
check(stageResult.value.stageLabel === '谈判中', `stageLabel from canonical: ${stageResult.value.stageLabel}`);
check(stageResult.source === 'canonical_brokered_opportunity', `stage source: ${stageResult.source}`);

const legacyStage = readOpportunityStage(emptyState, legacyOpp);
check(legacyStage.value.stageIndex === 1, `stage fallback: ${legacyStage.value.stageIndex}`);
check(legacyStage.source === 'legacy_opportunity_mirror', `stage source: ${legacyStage.source}`);

console.log('  Stage from canonical brokered: PASS');

// ---------------------------------------------------------------------------
// 4. Lifecycle from canonical brokered opportunity
// ---------------------------------------------------------------------------

console.log('=== Check 4: Lifecycle from canonical brokered ===');

const lifecycleResult = readOpportunityLifecycle(stateWithBrokered, legacyOpp);
check(lifecycleResult.value.status === 'active', `lifecycle status: ${lifecycleResult.value.status}`);
check(lifecycleResult.source === 'canonical_brokered_opportunity', `lifecycle source: ${lifecycleResult.source}`);

console.log('  Lifecycle from canonical brokered: PASS');

// ---------------------------------------------------------------------------
// 5. Risk signals
// ---------------------------------------------------------------------------

console.log('=== Check 5: Risk signals ===');

const riskResult = readOpportunityRiskSignals(stateWithMatch, legacyOpp, 10);
check(riskResult.source === 'canonical_match', `risk source: ${riskResult.source}`);
check(riskResult.value.lowConfidence === false, `risk lowConfidence: ${riskResult.value.lowConfidence}`);

const staleMatch = { ...canonicalMatch, lastUpdatedDay: 0 };
const staleState = { runtimeCustomerCaseMatches: [staleMatch], runtimeBrokeredOpportunities: [] };
const staleRisk = readOpportunityRiskSignals(staleState, legacyOpp, 10);
check(staleRisk.value.staleMatch === true, `stale match detected: ${staleRisk.value.staleMatch}`);

console.log('  Risk signals: PASS');

// ---------------------------------------------------------------------------
// 6. No state mutation
// ---------------------------------------------------------------------------

console.log('=== Check 6: No mutation ===');

const stateBefore = JSON.stringify(stateWithMatch);
readOpportunityIntent(stateWithMatch, legacyOpp);
readOpportunityConfidence(stateWithMatch, legacyOpp);
readOpportunityStage(stateWithMatch, legacyOpp);
check(JSON.stringify(stateWithMatch) === stateBefore, 'state not mutated');

console.log('  No mutation: PASS');

// ---------------------------------------------------------------------------
// 7. findCustomerCaseMatchFromState / findBrokeredOpportunityFromState
// ---------------------------------------------------------------------------

console.log('=== Check 7: Find helpers ===');

const foundMatch = findCustomerCaseMatchFromState(stateWithMatch, 'cust-1', 'case-1');
check(foundMatch !== undefined, 'found match');
check(foundMatch.interest === 80, `match interest: ${foundMatch.interest}`);

const notFound = findCustomerCaseMatchFromState(stateWithMatch, 'cust-2', 'case-2');
check(notFound === undefined, 'not found returns undefined');

const foundBrokered = findBrokeredOpportunityFromState(stateWithBrokered, 'opp-1');
check(foundBrokered !== undefined, 'found brokered');
check(foundBrokered.stageIndex === 4, `brokered stage: ${foundBrokered.stageIndex}`);

console.log('  Find helpers: PASS');

// ---------------------------------------------------------------------------
// 7b. Fit from canonical match
// ---------------------------------------------------------------------------

console.log('=== Check 7b: Fit from canonical match ===');

const fitResultCanonical = readOpportunityFit(stateWithMatch, legacyOpp);
check(fitResultCanonical.value === 85, `fit from canonical: ${fitResultCanonical.value}`);
check(fitResultCanonical.source === 'canonical_match', `fit source: ${fitResultCanonical.source}`);

const fitResultFallback = readOpportunityFit(emptyState, legacyOpp);
check(fitResultFallback.value === 60, `fit fallback: ${fitResultFallback.value}`);
check(fitResultFallback.source === 'legacy_opportunity_mirror', `fit source: ${fitResultFallback.source}`);

console.log('  Fit from canonical match: PASS');

// ---------------------------------------------------------------------------
// 7c. DaysLeft from canonical brokered
// ---------------------------------------------------------------------------

console.log('=== Check 7c: DaysLeft from canonical brokered ===');

const daysLeftResultCanonical = readOpportunityDaysLeft(stateWithBrokered, legacyOpp);
check(daysLeftResultCanonical.value === 3, `daysLeft from canonical: ${daysLeftResultCanonical.value}`);
check(daysLeftResultCanonical.source === 'canonical_brokered_opportunity', `daysLeft source: ${daysLeftResultCanonical.source}`);

const daysLeftResultFallback = readOpportunityDaysLeft(emptyState, legacyOpp);
check(daysLeftResultFallback.value === 5, `daysLeft fallback: ${daysLeftResultFallback.value}`);
check(daysLeftResultFallback.source === 'legacy_opportunity_mirror', `daysLeft source: ${daysLeftResultFallback.source}`);

console.log('  DaysLeft from canonical brokered: PASS');

// ---------------------------------------------------------------------------
// 7d. PendingClosing from canonical brokered
// ---------------------------------------------------------------------------

console.log('=== Check 7d: PendingClosing from canonical brokered ===');

const pendingResultCanonical = readOpportunityPendingClosing(stateWithBrokered, legacyOpp);
check(pendingResultCanonical.value.evaluation === true, `pendingClosing evaluation from canonical: ${pendingResultCanonical.value.evaluation}`);
check(pendingResultCanonical.value.strategyId === 'hold', `pendingClosing strategyId from canonical: ${pendingResultCanonical.value.strategyId}`);
check(pendingResultCanonical.value.requestedDay === 3, `pendingClosing requestedDay from canonical: ${pendingResultCanonical.value.requestedDay}`);
check(pendingResultCanonical.source === 'canonical_brokered_opportunity', `pendingClosing source: ${pendingResultCanonical.source}`);

const pendingResultFallback = readOpportunityPendingClosing(emptyState, legacyOpp);
check(pendingResultFallback.value.evaluation === false, `pendingClosing evaluation fallback: ${pendingResultFallback.value.evaluation}`);
check(pendingResultFallback.source === 'legacy_opportunity_mirror', `pendingClosing source: ${pendingResultFallback.source}`);

console.log('  PendingClosing from canonical brokered: PASS');

// ---------------------------------------------------------------------------
// 8. Core boundary
// ---------------------------------------------------------------------------

console.log('=== Check 8: Core boundary ===');

const src = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/opportunity-relations/readBoundary.ts', 'utf-8');
const srcWithoutComments = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!srcWithoutComments.includes("from '../../../domain"), 'readBoundary has no domain imports');
check(!srcWithoutComments.includes("from '../../../runtime"), 'readBoundary has no runtime imports');
check(!srcWithoutComments.includes('Date.now'), 'readBoundary has no Date.now');
check(!srcWithoutComments.includes('Math.random'), 'readBoundary has no Math.random');

console.log('  Core boundary: PASS');

// ---------------------------------------------------------------------------
// 9. Intent mismatch: canonical=80 vs legacy=20
// ---------------------------------------------------------------------------

console.log('=== Check 9: Intent mismatch (canonical wins) ===');

const mismatchResult = readOpportunityIntent(stateWithMatch, legacyOpp);
check(mismatchResult.value === 80, `canonical intent wins: ${mismatchResult.value} (not ${legacyOpp.intent})`);

console.log('  Intent mismatch: PASS');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Summary ===`);
console.log(`Total: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);

if (failed > 0) {
  console.log('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\nselling-houses opportunity read boundary contract verification passed');
  process.exit(0);
}
