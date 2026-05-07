/**
 * Opportunity External Writes Contract Verification.
 *
 * Proves that all external Opportunity field writes in the domain/application
 * layer go through opportunitySplitHelper.ts CANONICAL stateful helpers
 * (ViaSplit/OnState), NOT through deprecated mirror-only aliases.
 *
 * Checks:
 * 1. opportunitySplitHelper exports canonical stateful helpers (ViaSplit/OnState)
 * 2. opportunitySplitHelper does NOT expose deprecated mirror-only aliases as short names
 * 3. Priority files use stateful helpers, NOT deprecated mirror-only wrappers
 * 4. Priority files do NOT import deprecatedUnsafeLegacyMirrorOnly_* functions
 * 5. No bare status/intent/confidence writes remain in priority files
 * 6. opportunitySplitHelper does NOT import from runtime
 * 7. opportunitySplitHelper is deterministic (no Date.now/Math.random)
 * 8. dealClosedRecord has no Date.now (replay safety)
 * 9. Legacy Opportunity fields still work as mirrors after advanceOneDay
 * 10. Mirror drift is zero after advanceOneDay
 * 11. Canonical state arrays exist after initialization
 * 12. Replayability: same seed produces same results
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { advanceOneDay, seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import type { GameState, Opportunity } from '../src/selling-houses/domain/models.js';
import { buildOpportunitySplitMirrorDriftReport } from '../src/selling-houses/domain/opportunitySplitHelper.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const errors: string[] = [];

function check(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    errors.push(`FAIL: ${message}`);
  }
}

function buildWorld(seed: number): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario');
  const world = createInitialState(snapshot, seed);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

const SEED = 20260501;

// ---------------------------------------------------------------------------
// Canonical stateful helpers (must be exported as real functions)
// ---------------------------------------------------------------------------

const CANONICAL_STATEFUL_HELPERS = [
  'ensureCustomerCaseMatchState',
  'ensureBrokeredOpportunityState',
  'initializeOpportunityRelations',
  'applyMatchIntentDelta',
  'applyMatchConfidenceDelta',
  'setOpportunityStageViaSplit',
  'setOpportunityLifecycleViaSplit',
  'setOpportunityPendingClosingViaSplit',
  'applyOpportunityProgressDeltaViaSplit',
  'setOpportunityVisibilityViaSplit',
  'setOpportunityTouchedTodayViaSplit',
  'setOpportunityStagnationTicks',
  'setOpportunityStageLabel',
  'setOpportunityFit',
  'closeOpportunityViaSplit',
  'markOpportunityWonOrClosedViaSplit',
  'resetOpportunityPendingClosingViaSplit',
  'findBrokeredStateForOpportunity',
  'findMatchStateForPair',
  'buildOpportunitySplitMirrorDriftReport',
  'assertOpportunitySplitMirrorConsistency',
];

// ---------------------------------------------------------------------------
// Deprecated mirror-only aliases (must NOT be exported as short names)
// ---------------------------------------------------------------------------

const DEPRECATED_SHORT_NAMES = [
  'applyOpportunityIntentDelta',
  'applyOpportunityConfidenceDelta',
  'setOpportunityStageIndex',
  'setOpportunityDaysLeft',
  'setOpportunityTouchedToday',
  'setOpportunityVisibility',
  'setOpportunityStatus',
  'setOpportunityLifecycleStatus',
  'setOpportunityPendingClosing',
];

// ---------------------------------------------------------------------------
// 1. opportunitySplitHelper exports canonical stateful helpers
// ---------------------------------------------------------------------------

console.log('=== Check 1: opportunitySplitHelper exports canonical stateful helpers ===');

const helperSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/domain/opportunitySplitHelper.ts', 'utf-8');

for (const name of CANONICAL_STATEFUL_HELPERS) {
  check(
    helperSrc.includes(`export function ${name}`),
    `canonical helper '${name}' exported as function`,
  );
}

// ---------------------------------------------------------------------------
// 2. opportunitySplitHelper does NOT expose deprecated aliases as short names
//    The deprecated functions must remain with their full deprecatedUnsafeLegacyMirrorOnly_ prefix.
//    Short names must NOT be re-exported — they trick callers into thinking they're canonical.
// ---------------------------------------------------------------------------

console.log('=== Check 2: No deprecated alias re-exports as short names ===');

// Check for the re-export block that aliases deprecated functions as short names
const hasDeprecatedReExportBlock = helperSrc.includes('deprecatedUnsafeLegacyMirrorOnly_applyOpportunityIntentDelta as applyOpportunityIntentDelta');
check(
  !hasDeprecatedReExportBlock,
  'opportunitySplitHelper does NOT re-export deprecated aliases as short names',
);

// Verify the deprecated functions still exist with their full prefix (for backward compat)
check(
  helperSrc.includes('export function deprecatedUnsafeLegacyMirrorOnly_applyOpportunityIntentDelta'),
  'deprecated function still exists with full prefix',
);

// ---------------------------------------------------------------------------
// 3. Priority files use stateful helpers, NOT deprecated mirror-only wrappers
// ---------------------------------------------------------------------------

console.log('=== Check 3: Priority files use stateful helpers ===');

// These files must import ViaSplit/OnState helpers, not the deprecated short names.
// Both ViaSplit and OnState variants are valid canonical helpers.
const statefulFileChecks: Array<[string, string[], string[]]> = [
  // [file, mustHave, mustNotHave]
  ['src/selling-houses/domain/engine/opportunityEngine.ts',
    ['setOpportunityStageViaSplit', 'setOpportunityLifecycleViaSplit', 'closeOpportunityViaSplit'],
    ['deprecatedUnsafeLegacyMirrorOnly_']],
  ['src/selling-houses/domain/engine/customerEngine.ts',
    ['OnState', 'setOpportunityFit', 'ensureCustomerCaseMatchState'],
    ['deprecatedUnsafeLegacyMirrorOnly_']],
  ['src/selling-houses/domain/engine/showingActionExecutors.ts',
    ['OnState'],
    ['deprecatedUnsafeLegacyMirrorOnly_']],
  ['src/selling-houses/domain/engine/sinceritySaleActionExecutors.ts',
    ['OnState'],
    ['deprecatedUnsafeLegacyMirrorOnly_']],
  ['src/selling-houses/domain/engine/ownerActionExecutors.ts',
    ['OnState'],
    ['deprecatedUnsafeLegacyMirrorOnly_']],
  ['src/selling-houses/domain/engine/eventEngine.ts',
    ['OnState'],
    ['deprecatedUnsafeLegacyMirrorOnly_']],
  ['src/selling-houses/domain/company/companyPressureEngine.ts',
    ['OnState'],
    ['deprecatedUnsafeLegacyMirrorOnly_']],
  ['src/selling-houses/domain/market/inboundOpportunityEngine.ts',
    ['OnState'],
    ['deprecatedUnsafeLegacyMirrorOnly_']],
  ['src/selling-houses/domain/rivals/rivalListingEngine.ts',
    ['OnState'],
    ['deprecatedUnsafeLegacyMirrorOnly_']],
  ['src/selling-houses/domain/engine/actionResolvers.ts',
    ['OnState'],
    ['deprecatedUnsafeLegacyMirrorOnly_']],
  ['src/selling-houses/application/gameTransitions.ts',
    ['OnState'],
    ['deprecatedUnsafeLegacyMirrorOnly_']],
  ['src/selling-houses/domain/caseLifecycle.ts',
    ['OnState', 'setOpportunityStageLabel'],
    ['deprecatedUnsafeLegacyMirrorOnly_']],
  ['src/selling-houses/domain/dealClosing.ts',
    ['OnState'],
    ['deprecatedUnsafeLegacyMirrorOnly_']],
];

for (const [file, mustHave, mustNotHave] of statefulFileChecks) {
  try {
    const src = readFileSync(file, 'utf-8');
    for (const pattern of mustHave) {
      check(src.includes(pattern), `${file} uses stateful helper '${pattern}'`);
    }
    for (const pattern of mustNotHave) {
      check(!src.includes(pattern), `${file} does NOT use deprecated '${pattern}'`);
    }
  } catch {
    check(false, `${file} readable`);
  }
}

// ---------------------------------------------------------------------------
// 4. No priority file imports deprecatedUnsafeLegacyMirrorOnly_* functions
// ---------------------------------------------------------------------------

console.log('=== Check 4: No deprecated imports in priority files ===');

const allPriorityFiles = statefulFileChecks.map(([file]) => file);
allPriorityFiles.push('src/selling-houses/domain/dealClosing.ts');

for (const file of allPriorityFiles) {
  try {
    const src = readFileSync(file, 'utf-8');
    const hasDeprecatedImport = src.includes('deprecatedUnsafeLegacyMirrorOnly_');
    check(!hasDeprecatedImport, `${file} does NOT import deprecatedUnsafeLegacyMirrorOnly_*`);
  } catch {
    check(false, `${file} readable`);
  }
}

// ---------------------------------------------------------------------------
// 5. No bare writes remain in key files
// ---------------------------------------------------------------------------

console.log('=== Check 5: No bare writes remain ===');

// dealClosing.ts must not have bare status writes
const dealClosingSrc = readFileSync('src/selling-houses/domain/dealClosing.ts', 'utf-8');
check(!dealClosingSrc.includes("entry.status = entry.id === opportunity.id ? 'won' : 'closed'"), 'dealClosing.ts: no bare status write');

// caseLifecycle.ts must use helpers
const caseLifecycleSrc = readFileSync('src/selling-houses/domain/caseLifecycle.ts', 'utf-8');
check(caseLifecycleSrc.includes('setOpportunityStageLabel'), 'caseLifecycle.ts: uses setOpportunityStageLabel');
const stageLabelBareWrites = caseLifecycleSrc.split('\n').filter(l => /^\s*entry\.stageLabel\s*=/.test(l));
check(stageLabelBareWrites.length === 0, 'caseLifecycle.ts: no bare entry.stageLabel writes remain');

// actionResolvers.ts must use helpers
const actionResolversSrc = readFileSync('src/selling-houses/domain/engine/actionResolvers.ts', 'utf-8');
check(actionResolversSrc.includes('setOpportunityStatusOnState'), 'actionResolvers.ts: uses setOpportunityStatusOnState');

// ---------------------------------------------------------------------------
// 6. opportunitySplitHelper does NOT import from runtime
// ---------------------------------------------------------------------------

console.log('=== Check 6: No runtime imports ===');

check(!helperSrc.includes("from '../runtime"), 'opportunitySplitHelper does NOT import from runtime');
check(!helperSrc.includes("from '../../runtime"), 'opportunitySplitHelper does NOT import from runtime');
check(!helperSrc.includes("from './runtime"), 'opportunitySplitHelper does NOT import from runtime');

// Core imports are OK
check(helperSrc.includes("from '../core/world-state/opportunity-relations/writeSource.js'"), 'Imports from core writeSource (allowed)');

// ---------------------------------------------------------------------------
// 6b. OnState helper body check: must not bare-write opportunity fields
//     OnState helpers wrap ViaSplit helpers + ensureBrokeredOpportunityState.
//     They must NOT directly mutate opportunity.intent/confidence/status/lifecycle/pending.
//     Only replaceBrokeredState/replaceMatchState (mirror sync) may write to legacy Opportunity.
// ---------------------------------------------------------------------------

console.log('=== Check 6b: OnState helper body purity ===');

const OPPORTUNITY_BARE_WRITE_FIELDS = [
  'opportunity.intent', 'opportunity.confidence', 'opportunity.fit',
  'opportunity.stageIndex', 'opportunity.stageLabel',
  'opportunity.status', 'opportunity.lifecycleStatus',
  'opportunity.daysLeft', 'opportunity.touchedToday',
  'opportunity.stagnationTicks', 'opportunity.visibility',
  'opportunity.pendingClosingEvaluation',
  'opportunity.pendingClosingStrategyId',
  'opportunity.pendingClosingRequestedDay',
];

// Find all OnState functions in opportunitySplitHelper using balanced brace extraction
const helperLines = helperSrc.split('\n');
const onStateFnStarts: Array<{ name: string; startLine: number }> = [];
for (let i = 0; i < helperLines.length; i++) {
  const fnMatch = helperLines[i].match(/^export function (\w+OnState)\b/);
  if (fnMatch) {
    onStateFnStarts.push({ name: fnMatch[1], startLine: i });
  }
}

function extractFunctionBody(lines: string[], startLine: number): string {
  let braceCount = 0;
  let started = false;
  const bodyLines: string[] = [];
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    bodyLines.push(line);
    for (const ch of line) {
      if (ch === '{') { braceCount++; started = true; }
      if (ch === '}') braceCount--;
    }
    if (started && braceCount <= 0) break;
  }
  return bodyLines.join('\n');
}

let onStateFnCount = 0;
for (const { name, startLine } of onStateFnStarts) {
  const fnBody = extractFunctionBody(helperLines, startLine);
  onStateFnCount++;

  for (const field of OPPORTUNITY_BARE_WRITE_FIELDS) {
    // Check for bare writes: opportunity.xxx = (not through helpers)
    const hasDirectWrite = fnBody.includes(`${field} =`) || fnBody.includes(`${field} +=`) || fnBody.includes(`${field} -=`);
    check(
      !hasDirectWrite,
      `OnState helper '${name}' does NOT bare-write '${field}'`,
    );
  }
}

check(onStateFnCount > 0, `Found ${onStateFnCount} OnState helper functions to check`);

// ---------------------------------------------------------------------------
// 7. opportunitySplitHelper is deterministic
// ---------------------------------------------------------------------------

console.log('=== Check 7: Deterministic ===');

const nonComment = helperSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!nonComment.includes('Date.now'), 'opportunitySplitHelper: no Date.now');
check(!nonComment.includes('Math.random'), 'opportunitySplitHelper: no Math.random');
check(!nonComment.includes('crypto.'), 'opportunitySplitHelper: no crypto');

// ---------------------------------------------------------------------------
// 8. dealClosing.buildClosedDealRecord has no Date.now (replay safety)
// ---------------------------------------------------------------------------

console.log('=== Check 8: dealClosing replay safety ===');

const dealClosingNoComment = dealClosingSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!dealClosingNoComment.includes('new Date'), 'dealClosing.ts: no new Date() (replay safe)');
check(!dealClosingNoComment.includes('Date.now'), 'dealClosing.ts: no Date.now() (replay safe)');

// ---------------------------------------------------------------------------
// 9. Legacy Opportunity fields still work as mirrors
// ---------------------------------------------------------------------------

console.log('=== Check 9: Legacy Opportunity as mirror ===');

const world = buildWorld(SEED);
const result = advanceOneDay(world);

check(result !== null, 'advanceOneDay returns result');
check(world.opportunities.length > 0, 'Opportunities exist');

// Opportunities still have all legacy fields
for (const opp of world.opportunities.slice(0, 3)) {
  check(typeof opp.intent === 'number', `Opportunity ${opp.id} has intent`);
  check(typeof opp.confidence === 'number', `Opportunity ${opp.id} has confidence`);
  check(typeof opp.stageIndex === 'number', `Opportunity ${opp.id} has stageIndex`);
  check(typeof opp.stageLabel === 'string', `Opportunity ${opp.id} has stageLabel`);
  check(typeof opp.daysLeft === 'number', `Opportunity ${opp.id} has daysLeft`);
  check(typeof opp.touchedToday === 'boolean', `Opportunity ${opp.id} has touchedToday`);
  check(typeof opp.visibility === 'string', `Opportunity ${opp.id} has visibility`);
  check(typeof opp.status === 'string', `Opportunity ${opp.id} has status`);
}

// ---------------------------------------------------------------------------
// 10. Mirror drift is zero after advanceOneDay
// ---------------------------------------------------------------------------

console.log('=== Check 10: Mirror drift after advanceOneDay ===');

if (world.runtimeBrokeredOpportunities && world.runtimeBrokeredOpportunities.length > 0) {
  const driftReport = buildOpportunitySplitMirrorDriftReport(world);
  check(driftReport.isConsistent, `mirror drift is zero after advanceOneDay (drifts: ${driftReport.drifts.length})`);
  if (!driftReport.isConsistent) {
    for (const d of driftReport.drifts.slice(0, 5)) {
      console.log(`    DRIFT: ${d.opportunityId}.${d.field}: canonical=${d.canonicalValue} legacy=${d.legacyValue}`);
    }
  }
  check(driftReport.totalBrokered > 0, `canonical brokered opportunities exist: ${driftReport.totalBrokered}`);
} else {
  check(false, 'runtimeBrokeredOpportunities should exist after advanceOneDay');
}

// Canonical state arrays exist
if (world.runtimeCustomerCaseMatches) {
  check(world.runtimeCustomerCaseMatches.length >= 0, 'runtimeCustomerCaseMatches exists');
}
if (world.runtimeBrokeredOpportunities) {
  check(world.runtimeBrokeredOpportunities.length >= 0, 'runtimeBrokeredOpportunities exists');
}

// ---------------------------------------------------------------------------
// 11. Replayability: same seed produces same results
// ---------------------------------------------------------------------------

console.log('=== Check 11: Replayability ===');

const world2 = buildWorld(SEED);
const result2 = advanceOneDay(world2);

// Opportunities should be identical
for (let i = 0; i < Math.min(world.opportunities.length, world2.opportunities.length); i++) {
  const a = world.opportunities[i];
  const b = world2.opportunities[i];
  check(a.id === b.id, `Opportunity ${i} id matches`);
  check(a.intent === b.intent, `Opportunity ${i} intent matches: ${a.intent} === ${b.intent}`);
  check(a.confidence === b.confidence, `Opportunity ${i} confidence matches: ${a.confidence} === ${b.confidence}`);
  check(a.stageIndex === b.stageIndex, `Opportunity ${i} stageIndex matches`);
  check(a.status === b.status, `Opportunity ${i} status matches`);
}

// RNG calls should be identical
check(world.rngCalls === world2.rngCalls, `rngCalls identical: ${world.rngCalls} === ${world2.rngCalls}`);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Summary ===`);
console.log(`Total checks: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (errors.length > 0) {
  console.log('\nFailures:');
  errors.forEach(e => console.log(`  ${e}`));
}

if (failed > 0) {
  console.log('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\nselling-houses opportunity external writes contract verification passed');
  process.exit(0);
}
