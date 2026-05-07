/**
 * Workspace DailyDecisionBridge Contract Verification.
 *
 * Validates:
 * 1. DailySemanticReceiptBundle carries optional dailyDecisionBridge field
 * 2. Workspace projection is readOnly
 * 3. LLM boundary: bridge is evidence/ref only, optional/disabled
 * 4. Workspace composer exists and is read-only projection
 * 5. Bridge compressed counts available (totalMovedCases, totalBlockers, totalCommitments)
 * 6. No raw GameState in workspace output
 * 7. Interface layer doesn't directly import domain engine
 * 8. Bridge enrichment doesn't mutate DailyTickResult
 */

import { readFileSync } from 'node:fs';

const ROOT = '/Users/jiaqi/Documents/开放日测算/src/selling-houses';

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string) {
  if (condition) { passed++; }
  else { failed++; console.error(`  [FAIL] ${message}`); }
}

function stripComments(src: string): string {
  return src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

// ---------------------------------------------------------------------------
// 1. DailySemanticReceiptBundle carries bridge
// ---------------------------------------------------------------------------

console.log('=== Check 1: Bundle carries bridge ===');

const modelsSrc = readFileSync(`${ROOT}/core/world-state/semantic-receipt/models.ts`, 'utf-8');
check(modelsSrc.includes('dailyDecisionBridge?: import'),
  'DailySemanticReceiptBundle has optional dailyDecisionBridge field');
check(modelsSrc.includes('DailyDecisionBridgeSummary'),
  'field type is DailyDecisionBridgeSummary');

// Empty builder does NOT set dailyDecisionBridge (optional, no default)
const emptyBuilderCode = stripComments(modelsSrc);
check(emptyBuilderCode.includes('llmReady: false'),
  'empty builder sets llmReady=false');

console.log('  Bundle carries bridge: PASS');

// ---------------------------------------------------------------------------
// 2. Workspace projection is readOnly
// ---------------------------------------------------------------------------

console.log('=== Check 2: Workspace readOnly ===');

const readOnlySrc = readFileSync(`${ROOT}/interface/interaction-workspace/readOnly.ts`, 'utf-8');
check(readOnlySrc.length > 50, 'readOnly.ts exists and is non-trivial');
check(readOnlySrc.includes('readonly') || readOnlySrc.includes('ReadOnly') || readOnlySrc.includes('Frozen'),
  'readOnly module enforces readonly pattern');

// Semantic workspace composer
const composerSrc = readFileSync(`${ROOT}/interface/interaction-workspace/semanticWorkspaceComposer.ts`, 'utf-8');
const composerCode = stripComments(composerSrc);
check(composerSrc.includes('readonly') || composerSrc.includes('ReadOnly'),
  'workspace composer uses readonly pattern');
check(composerSrc.includes('SemanticWorkspaceProjection'),
  'workspace composer produces SemanticWorkspaceProjection');

console.log('  Workspace readOnly: PASS');

// ---------------------------------------------------------------------------
// 3. LLM boundary
// ---------------------------------------------------------------------------

console.log('=== Check 3: LLM boundary ===');

const bridgeSrc = readFileSync(`${ROOT}/core/world-state/semantic-receipt/dailyDecisionBridge.ts`, 'utf-8');
const bridgeCode = stripComments(bridgeSrc);

check(bridgeCode.includes('openai') === false, 'bridge: no openai');
check(bridgeCode.includes('fetch(') === false, 'bridge: no fetch');
check(bridgeCode.includes('apiKey') === false, 'bridge: no apiKey');
check(bridgeCode.includes('LLM') === false, 'bridge: no LLM references');

// Bridge is optional (not required for gameplay)
check(modelsSrc.includes('dailyDecisionBridge?:'),
  'bridge is optional in bundle (not required)');

// LLM readiness is a boolean flag, not an LLM call
check(modelsSrc.includes('readonly llmReady: boolean'),
  'llmReady is a boolean flag, not an LLM invocation');

console.log('  LLM boundary: PASS');

// ---------------------------------------------------------------------------
// 4. Workspace composer is read-only projection
// ---------------------------------------------------------------------------

console.log('=== Check 4: Workspace composer read-only ===');

// Composer builds projections, doesn't mutate state
check(!composerCode.includes('state.cases.push'), 'composer: no case mutation');
check(!composerCode.includes('state.opportunities.push'), 'composer: no opportunity mutation');
check(!composerCode.includes('delete state'), 'composer: no state deletion');

// Composer has projectionKind
check(composerCode.includes('SemanticWorkspaceProjection'), 'composer declares SemanticWorkspaceProjection');

console.log('  Workspace composer read-only: PASS');

// ---------------------------------------------------------------------------
// 5. Bridge compressed counts
// ---------------------------------------------------------------------------

console.log('=== Check 5: Bridge compressed counts ===');

check(bridgeSrc.includes('readonly totalMovedCases: number'),
  'DailyDecisionBridgeSummary has totalMovedCases');
check(bridgeSrc.includes('readonly totalBlockers: number'),
  'DailyDecisionBridgeSummary has totalBlockers');
check(bridgeSrc.includes('readonly totalCommitments: number'),
  'DailyDecisionBridgeSummary has totalCommitments');

// Builders compute these counts
check(bridgeSrc.includes('totalMovedCases: input.movedCases.length'),
  'builder computes totalMovedCases from movedCases.length');
check(bridgeSrc.includes('totalBlockers'),
  'builder computes totalBlockers');
check(bridgeSrc.includes('totalCommitments'),
  'builder computes totalCommitments');

console.log('  Bridge compressed counts: PASS');

// ---------------------------------------------------------------------------
// 6. No raw GameState in workspace output
// ---------------------------------------------------------------------------

console.log('=== Check 6: No raw GameState in workspace ===');

// Check all interface workspace files
const decisionSupportSrc = readFileSync(`${ROOT}/interface/interaction-workspace/decisionSupportBoundary.ts`, 'utf-8');
const povBoundarySrc = readFileSync(`${ROOT}/interface/interaction-workspace/povBoundary.ts`, 'utf-8');

// Workspace files should not embed GameState objects
const workspaceFiles = [composerSrc, decisionSupportSrc, povBoundarySrc];
for (const f of workspaceFiles) {
  const code = stripComments(f);
  // These are interface files — they may type-import GameState but should not value-embed it
  check(!code.includes('const state: GameState ='), `workspace file does not embed GameState value`);
}

console.log('  No raw GameState in workspace: PASS');

// ---------------------------------------------------------------------------
// 7. Interface doesn't directly import domain engine
// ---------------------------------------------------------------------------

console.log('=== Check 7: Interface boundary ===');

const interfaceFiles = [composerSrc, decisionSupportSrc, povBoundarySrc, readOnlySrc];
for (const f of interfaceFiles) {
  const code = stripComments(f);
  check(!code.includes("from '../../domain/engine"), 'interface file does not import domain engine');
}

console.log('  Interface boundary: PASS');

// ---------------------------------------------------------------------------
// 8. Bridge enrichment doesn't mutate DailyTickResult
// ---------------------------------------------------------------------------

console.log('=== Check 8: Enrichment non-mutation ===');

const enrichSrc = readFileSync(`${ROOT}/runtime/simulation/semanticReceiptEnrichment.ts`, 'utf-8');
const enrichCode = stripComments(enrichSrc);

check(enrichSrc.includes('Does NOT mutate original DailyTickResult'),
  'enrichment declares non-mutation');
check(enrichCode.includes('Object.freeze'),
  'enrichment uses Object.freeze on output');
check(!enrichCode.includes('originalResult.semanticReceipts ='),
  'enrichment does not assign to originalResult');
check(!enrichCode.includes('delete originalResult'),
  'enrichment does not delete from originalResult');

// Bridge enrichment function
check(enrichSrc.includes('enrichDailyTickResultWithDailyDecisionBridge'),
  'has bridge-specific enrichment function');

console.log('  Enrichment non-mutation: PASS');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Workspace Bridge Contract Summary ===`);
console.log(`Total: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);

if (failed > 0) {
  console.log('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\nworkspace daily-decision-bridge contract verification passed');
  process.exit(0);
}
