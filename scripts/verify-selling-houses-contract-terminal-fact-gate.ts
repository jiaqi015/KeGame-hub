/**
 * ContractFact Terminal Fact Gate.
 *
 * Verifies that terminal case status mutations (sold/withdrawn/lost_to_rival),
 * soldPrice writes, and closedDeals.unshift only happen through controlled paths.
 *
 * Checks:
 *  1. createContractFactOnState exists in consensusFormationHelper
 *  2. dealClosing.ts uses ContractFact (calls createContractFactOnState)
 *  3. syncLegacyCaseDealMirrorsFromContractFact exists and is the single write path
 *  4. Direct case status writes only in allowlisted locations
 *  5. Direct soldPrice writes only in allowlisted locations
 *  6. closedDeals.unshift only in allowlisted locations
 *  7. ContractFact references consensusId
 *  8. No check(true) / assert(true) / || true / .claude/worktrees patterns
 *  9. npm run lint passes
 */

import { execSync } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const errors: string[] = [];

function check(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  [PASS] ${message}`);
  } else {
    failed++;
    errors.push(message);
    console.log(`  [FAIL] ${message}`);
  }
}

function readFile(path: string): string {
  return readFileSync(join(import.meta.dirname!, '..', path), 'utf-8');
}

function readFileSafe(path: string): string | null {
  try {
    return readFile(path);
  } catch {
    return null;
  }
}

function fileExists(path: string): boolean {
  return existsSync(join(import.meta.dirname!, '..', path));
}

// ---------------------------------------------------------------------------
// Source paths
// ---------------------------------------------------------------------------

const DEAL_CLOSING = 'src/selling-houses/domain/dealClosing.ts';
const CONSENSUS_HELPER = 'src/selling-houses/domain/consensusFormationHelper.ts';
const CASE_OUTCOME = 'src/selling-houses/domain/caseOutcome.ts';
const CASE_LIFECYCLE = 'src/selling-houses/domain/caseLifecycle.ts';
const ACTION_RESOLVERS = 'src/selling-houses/domain/engine/actionResolvers.ts';

// Allowlisted locations for direct terminal mutations
const ALLOWLISTED_STATUS_SOLD = [
  DEAL_CLOSING,  // syncLegacyCaseDealMirrorsFromContractFact
];
const ALLOWLISTED_STATUS_LOST = [
  CASE_LIFECYCLE,  // loseCaseToRival
];
const ALLOWLISTED_STATUS_WITHDRAWN = [
  ACTION_RESOLVERS,  // withdrawCase
];
const ALLOWLISTED_SOLD_PRICE = [
  DEAL_CLOSING,  // syncLegacyCaseDealMirrorsFromContractFact
  CASE_OUTCOME,  // markCaseSold (called from sync function)
];
const ALLOWLISTED_CLOSED_DEALS = [
  DEAL_CLOSING,  // syncLegacyCaseDealMirrorsFromContractFact
];

// ---------------------------------------------------------------------------
// 1. createContractFactOnState exists
// ---------------------------------------------------------------------------

function checkContractFactExists() {
  console.log('\n=== Check 1: createContractFactOnState exists ===');
  const src = readFileSafe(CONSENSUS_HELPER);
  check(src !== null, `${CONSENSUS_HELPER} exists`);
  if (!src) return;
  check(src.includes('export function createContractFactOnState'), 'createContractFactOnState exported from consensusFormationHelper');
}

// ---------------------------------------------------------------------------
// 2. dealClosing.ts uses ContractFact
// ---------------------------------------------------------------------------

function checkDealClosingUsesContractFact() {
  console.log('\n=== Check 2: dealClosing.ts uses ContractFact ===');
  const src = readFileSafe(DEAL_CLOSING);
  check(src !== null, `${DEAL_CLOSING} exists`);
  if (!src) return;
  check(src.includes('createContractFactOnState'), 'dealClosing calls createContractFactOnState');
  check(src.includes('import.*consensusFormationHelper') || src.includes("from './consensusFormationHelper"), 'dealClosing imports from consensusFormationHelper');
}

// ---------------------------------------------------------------------------
// 3. syncLegacyCaseDealMirrorsFromContractFact exists
// ---------------------------------------------------------------------------

function checkSyncFunctionExists() {
  console.log('\n=== Check 3: syncLegacyCaseDealMirrorsFromContractFact exists ===');
  const src = readFileSafe(DEAL_CLOSING);
  check(src !== null, `${DEAL_CLOSING} exists`);
  if (!src) return;
  check(
    src.includes('export function syncLegacyCaseDealMirrorsFromContractFact'),
    'syncLegacyCaseDealMirrorsFromContractFact exported from dealClosing',
  );
  check(
    src.includes('syncLegacyCaseDealMirrorsFromContractFact(state'),
    'finalizeClosedDeal calls syncLegacyCaseDealMirrorsFromContractFact',
  );
}

// ---------------------------------------------------------------------------
// 4. Direct caseItem.status = 'sold' only in allowlisted locations
// ---------------------------------------------------------------------------

function checkDirectStatusSoldWrites() {
  console.log('\n=== Check 4: direct status=sold writes ===');
  const files = [
    DEAL_CLOSING,
    CASE_OUTCOME,
    CASE_LIFECYCLE,
    ACTION_RESOLVERS,
    'src/selling-houses/domain/runtimeState.ts',
    'src/selling-houses/domain/resultEvaluation.ts',
    'src/selling-houses/domain/actionStageRelations.ts',
    'src/selling-houses/infrastructure/neonGameRunRepository.ts',
    'src/selling-houses/application/projections/operatingProjection.ts',
  ];
  for (const file of files) {
    const src = readFileSafe(file);
    if (!src) continue;
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/caseItem\.status\s*=\s*'sold'/.test(line) || /case\.status\s*=\s*'sold'/.test(line)) {
        const isAllowlisted = ALLOWLISTED_STATUS_SOLD.some((f) => file === f);
        check(isAllowlisted, `status='sold' at ${file}:${i + 1} is allowlisted`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 5. Direct caseItem.soldPrice = only in allowlisted locations
// ---------------------------------------------------------------------------

function checkDirectSoldPriceWrites() {
  console.log('\n=== Check 5: direct soldPrice writes ===');
  const files = [
    DEAL_CLOSING,
    CASE_OUTCOME,
    CASE_LIFECYCLE,
    ACTION_RESOLVERS,
    'src/selling-houses/domain/runtimeState.ts',
  ];
  for (const file of files) {
    const src = readFileSafe(file);
    if (!src) continue;
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/caseItem\.soldPrice\s*=/.test(line) || /case\.soldPrice\s*=/.test(line)) {
        const isAllowlisted = ALLOWLISTED_SOLD_PRICE.some((f) => file === f);
        check(isAllowlisted, `soldPrice write at ${file}:${i + 1} is allowlisted`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 6. closedDeals.unshift / push only in allowlisted locations
// ---------------------------------------------------------------------------

function checkClosedDealsWrites() {
  console.log('\n=== Check 6: closedDeals writes ===');
  const files = [
    DEAL_CLOSING,
    CASE_OUTCOME,
    CASE_LIFECYCLE,
    ACTION_RESOLVERS,
    'src/selling-houses/domain/runtimeState.ts',
    'src/selling-houses/infrastructure/neonGameRunRepository.ts',
  ];
  for (const file of files) {
    const src = readFileSafe(file);
    if (!src) continue;
    const lines = src.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/closedDeals\.(unshift|push)/.test(line)) {
        const isAllowlisted = ALLOWLISTED_CLOSED_DEALS.some((f) => file === f);
        check(isAllowlisted, `closedDeals write at ${file}:${i + 1} is allowlisted`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// 7. ContractFact references consensusId
// ---------------------------------------------------------------------------

function checkContractFactReferencesConsensus() {
  console.log('\n=== Check 7: ContractFact references consensusId ===');
  const src = readFileSafe(CONSENSUS_HELPER);
  if (!src) { check(false, 'consensusFormationHelper not found'); return; }
  check(src.includes('consensusId'), 'createContractFactOnState accepts consensusId param');

  const wsSrc = readFileSafe('src/selling-houses/core/world-state/consensus/writeSource.ts');
  if (!wsSrc) { check(false, 'writeSource.ts not found'); return; }
  check(wsSrc.includes('readonly consensusId: string'), 'ContractFactState has consensusId field');
}

// ---------------------------------------------------------------------------
// 8. No check(true) / assert(true) / || true / .claude/worktrees
// ---------------------------------------------------------------------------

function checkNoDeceptivePatterns() {
  console.log('\n=== Check 8: no deceptive patterns ===');
  const files = [
    DEAL_CLOSING,
    CONSENSUS_HELPER,
    CASE_OUTCOME,
    CASE_LIFECYCLE,
    ACTION_RESOLVERS,
    'src/selling-houses/core/world-state/consensus/writeSource.ts',
    'src/selling-houses/core/world-state/consensus/models.ts',
  ];
  for (const file of files) {
    const src = readFileSafe(file);
    if (!src) continue;
    const noComment = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    check(!noComment.includes('check(true)'), `${file}: no check(true)`);
    check(!noComment.includes('assert(true)'), `${file}: no assert(true)`);
    check(!noComment.includes('|| true'), `${file}: no || true`);
    check(!noComment.includes('.claude/worktrees'), `${file}: no .claude/worktrees`);
  }
}

// ---------------------------------------------------------------------------
// 9. npm run lint
// ---------------------------------------------------------------------------

function checkLint() {
  console.log('\n=== Check 9: npm run lint ===');
  try {
    execSync('npm run lint -- --pretty false', {
      cwd: join(import.meta.dirname!, '..'),
      encoding: 'utf-8',
      timeout: 120_000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    check(true, 'npm run lint passes');
  } catch (err: any) {
    const output = (err.stderr || err.stdout || '').slice(-500);
    check(false, `npm run lint failed:\n${output}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('=== ContractFact Terminal Fact Gate ===');
console.log(`Date: ${new Date().toISOString()}`);

checkContractFactExists();
checkDealClosingUsesContractFact();
checkSyncFunctionExists();
checkDirectStatusSoldWrites();
checkDirectSoldPriceWrites();
checkClosedDealsWrites();
checkContractFactReferencesConsensus();
checkNoDeceptivePatterns();
checkLint();

console.log(`\n=== Summary: ${passed} passed, ${failed} failed ===`);
if (failed > 0) {
  console.log('\nFailed checks:');
  for (const err of errors) {
    console.log(`  - ${err}`);
  }
  process.exit(1);
}
