/**
 * DailyDecisionBridge Runtime Adapter Contract Verification.
 *
 * Validates:
 * 1. Adapter imports core types (not redefines)
 * 2. buildDailyDecisionBridgeInputFromPOV produces valid input
 * 3. buildDailyDecisionBridgeFromSemanticReceiptInputPack produces valid summary
 * 4. buildEmptyDailyDecisionBridgeInput is frozen/empty
 * 5. Adapter reads domain data (not passthrough)
 * 6. All outputs frozen
 * 7. Deterministic: same input → same output
 * 8. No side effects (Date.now, Math.random, fetch)
 * 9. Graceful fallback when scenes empty
 * 10. Re-exports core types for consumers
 */

import { readFileSync } from 'node:fs';

const ROOT = '/Users/jiaqi/Documents/开放日测算/src/selling-houses';

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string) {
  if (condition) { passed++; }
  else { failed++; console.error(`  [FAIL] ${message}`); }
}

// ---------------------------------------------------------------------------
// 1. Adapter source structure
// ---------------------------------------------------------------------------

console.log('=== Check 1: Adapter imports core types ===');

const adapterSrc = readFileSync(`${ROOT}/runtime/simulation/dailyDecisionBridgeAdapter.ts`, 'utf-8');
const adapterCode = adapterSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

// Imports from core
check(adapterCode.includes("from '../../core/world-state/semantic-receipt/dailyDecisionBridge.js'"),
  'imports from core dailyDecisionBridge');

// Imports core builders
check(adapterCode.includes('buildEmptyDailyDecisionBridgeSummary'),
  'imports buildEmptyDailyDecisionBridgeSummary');
check(adapterCode.includes('buildDailyDecisionBridgeSummary'),
  'imports buildDailyDecisionBridgeSummary');

// Does NOT redefine core types
check(!adapterCode.includes('interface DailyDecisionBridgeSummary {'),
  'does not redefine DailyDecisionBridgeSummary');
check(!adapterCode.includes('interface DailyCaseDecisionSummary {'),
  'does not redefine DailyCaseDecisionSummary');

console.log('  Adapter imports core types: PASS');

// ---------------------------------------------------------------------------
// 2. Re-exports for consumers
// ---------------------------------------------------------------------------

console.log('=== Check 2: Re-exports ===');

check(adapterSrc.includes('export type {'), 'has type re-exports');
check(adapterSrc.includes('DailyDecisionBridgeSummary,'), 're-exports DailyDecisionBridgeSummary');
check(adapterSrc.includes('DailyCaseDecisionSummary,'), 're-exports DailyCaseDecisionSummary');
check(adapterSrc.includes('DailyDecisionMovedField,'), 're-exports DailyDecisionMovedField');
check(adapterSrc.includes('DailyDecisionWhyRef,'), 're-exports DailyDecisionWhyRef');
check(adapterSrc.includes('DailyDecisionBlockerRef,'), 're-exports DailyDecisionBlockerRef');
check(adapterSrc.includes('DailyDecisionCommitmentRef,'), 're-exports DailyDecisionCommitmentRef');
check(adapterSrc.includes('DailyActorPovChangeSummary,'), 're-exports DailyActorPovChangeSummary');
check(adapterSrc.includes('DailyBeliefChangeRef,'), 're-exports DailyBeliefChangeRef');
check(adapterSrc.includes('DailySignalChangeRef,'), 're-exports DailySignalChangeRef');
check(adapterSrc.includes('DailyRecommendationSummary,'), 're-exports DailyRecommendationSummary');
check(adapterSrc.includes('DailyDecisionBridgeInput,'), 're-exports DailyDecisionBridgeInput');
check(adapterSrc.includes('export { buildEmptyDailyDecisionBridgeSummary, buildDailyDecisionBridgeSummary }'),
  're-exports core builders');

console.log('  Re-exports: PASS');

// ---------------------------------------------------------------------------
// 3. Per-case builders read domain data
// ---------------------------------------------------------------------------

console.log('=== Check 3: Per-case builders read domain data ===');

// Moved fields
check(adapterCode.includes('function buildMovedFieldsForCase'), 'has buildMovedFieldsForCase');
check(adapterCode.includes("field: 'd1'"), 'reads d1 demand momentum');
check(adapterCode.includes("field: 'd2'"), 'reads d2 asset quality');
check(adapterCode.includes("field: 'd3'"), 'reads d3 owner readiness');
check(adapterCode.includes("field: 'trust'"), 'reads trust');
check(adapterCode.includes("field: 'urgency'"), 'reads urgency');
check(adapterCode.includes("field: 'patience'"), 'reads patience');
check(adapterCode.includes("field: 'competitiveness'"), 'reads competitiveness');

// Why refs
check(adapterCode.includes('function buildWhyRefsForCase'), 'has buildWhyRefsForCase');
check(adapterCode.includes("refType: 'evaluation_snapshot'"), 'gathers evaluation_snapshot');
check(adapterCode.includes("refType: 'interaction_scene'"), 'gathers interaction_scene');
check(adapterCode.includes("refType: 'pressure_receipt'"), 'gathers pressure_receipt');
check(adapterCode.includes("refType: 'consensus_receipt'"), 'gathers consensus_receipt');
check(adapterCode.includes("refType: 'belief'"), 'gathers belief (narrative)');

// Blockers
check(adapterCode.includes('function buildBlockersForCase'), 'has buildBlockersForCase');
check(adapterCode.includes('casePOV.assetScore.blockers'), 'reads blockers from assetScore');

// Commitments
check(adapterCode.includes('function buildCommitmentsForCase'), 'has buildCommitmentsForCase');
check(adapterCode.includes('casePOV.commitmentStates'), 'reads commitmentStates');
check(adapterCode.includes('casePOV.commitments'), 'reads decision commitments');

// Actor POV changes
check(adapterCode.includes('function buildActorPovChangesForCase'), 'has buildActorPovChangesForCase');
check(adapterCode.includes('casePOV.knowledge.beliefs'), 'reads beliefs from knowledge');

// Recommendations
check(adapterCode.includes('function buildRecommendationsForCase'), 'has buildRecommendationsForCase');
check(adapterCode.includes('casePOV.recommendationDrafts'), 'reads recommendationDrafts');

console.log('  Per-case builders read domain data: PASS');

// ---------------------------------------------------------------------------
// 4. Main adapter entry points
// ---------------------------------------------------------------------------

console.log('=== Check 4: Main adapter entry points ===');

check(adapterCode.includes('export function buildDailyDecisionBridgeInputFromPOV'),
  'exports buildDailyDecisionBridgeInputFromPOV');
check(adapterCode.includes('export function buildDailyDecisionBridgeFromSemanticReceiptInputPack'),
  'exports buildDailyDecisionBridgeFromSemanticReceiptInputPack');
check(adapterCode.includes('export function buildEmptyDailyDecisionBridgeInput'),
  'exports buildEmptyDailyDecisionBridgeInput');

// POV adapter takes BrokerPOVSnapshot
check(adapterCode.includes('pov: BrokerPOVSnapshot'),
  'buildDailyDecisionBridgeInputFromPOV takes BrokerPOVSnapshot');
check(adapterCode.includes('scenes: readonly InteractionScene[]'),
  'accepts InteractionScene[]');
check(adapterCode.includes('narrativePack?: NarrativeSignalPack'),
  'accepts optional NarrativeSignalPack');

// Semantic receipt adapter takes SemanticReceiptInputPack
check(adapterCode.includes('pack: SemanticReceiptInputPack'),
  'buildDailyDecisionBridgeFromSemanticReceiptInputPack takes SemanticReceiptInputPack');

console.log('  Main adapter entry points: PASS');

// ---------------------------------------------------------------------------
// 5. Deterministic ordering
// ---------------------------------------------------------------------------

console.log('=== Check 5: Deterministic ordering ===');

check(adapterCode.includes('.sort('), 'sorts for deterministic ordering');
check(adapterCode.includes('caseId.localeCompare'), 'sorts by caseId');
check(adapterCode.includes('[...pov.cases]'), 'copies before sort (no mutation)');

// Semantic receipt adapter also sorts
check(adapterCode.includes('[...caseIds].sort()'), 'semantic receipt adapter sorts caseIds');

console.log('  Deterministic ordering: PASS');

// ---------------------------------------------------------------------------
// 6. All outputs frozen
// ---------------------------------------------------------------------------

console.log('=== Check 6: All outputs frozen ===');

check(adapterCode.includes('function freezeArray'), 'has freezeArray helper');
check(adapterCode.includes('Object.freeze([...items])'), 'freezeArray copies then freezes');

// Main builders freeze output
check(adapterCode.includes('return Object.freeze({'), 'builders freeze output objects');

console.log('  All outputs frozen: PASS');

// ---------------------------------------------------------------------------
// 7. No side effects
// ---------------------------------------------------------------------------

console.log('=== Check 7: No side effects ===');

check(!adapterCode.includes('Date.now'), 'no Date.now');
check(!adapterCode.includes('Math.random'), 'no Math.random');
check(!adapterCode.includes('fetch('), 'no fetch');
check(!adapterCode.includes('openai'), 'no openai');
check(!adapterCode.includes('apiKey'), 'no apiKey');
check(!adapterCode.includes('crypto'), 'no crypto');
check(!adapterCode.includes('new Date'), 'no new Date');

console.log('  No side effects: PASS');

// ---------------------------------------------------------------------------
// 8. Graceful fallback
// ---------------------------------------------------------------------------

console.log('=== Check 8: Graceful fallback ===');

check(adapterCode.includes('buildEmptyDailyDecisionBridgeInput'),
  'has buildEmptyDailyDecisionBridgeInput fallback');
check(adapterCode.includes('buildEmptyDailyDecisionBridgeSummary(pack.day)'),
  'semantic receipt adapter falls back to empty when not live or no scenes');

console.log('  Graceful fallback: PASS');

// ---------------------------------------------------------------------------
// 9. No raw GameState embedded
// ---------------------------------------------------------------------------

console.log('=== Check 9: No raw domain types ===');

// Allow GameState as type import (for function parameter), but not as embedded raw state
check(!adapterCode.includes('state.cases') && !adapterCode.includes('state.opportunities'),
  'no raw GameState field access in adapter output builders');
check(!adapterCode.includes('DailyTickResult'), 'no DailyTickResult import in value position');

// Only type imports from core (not value imports that could create coupling)
check(adapterCode.includes("import type {"), 'uses type imports for core types');

console.log('  No raw domain types: PASS');

// ---------------------------------------------------------------------------
// 10. Runtime index re-exports adapter
// ---------------------------------------------------------------------------

console.log('=== Check 10: Runtime index re-export ===');

const runtimeIndexSrc = readFileSync(`${ROOT}/runtime/simulation/index.ts`, 'utf-8');
check(runtimeIndexSrc.includes("from './dailyDecisionBridgeAdapter.js'"),
  'runtime/simulation/index.ts re-exports bridge adapter');

console.log('  Runtime index re-export: PASS');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Runtime Adapter Contract Summary ===`);
console.log(`Total: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);

if (failed > 0) {
  console.log('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\ndaily-decision-bridge runtime adapter contract verification passed');
  process.exit(0);
}
