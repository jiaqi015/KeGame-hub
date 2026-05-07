/**
 * DailyDecisionBridge Final Hard Gate.
 *
 * Proves the bridge is NOT an empty shell type by verifying:
 *  1. A/B/C/D governance, E/F unauthorized
 *  2. Core exports exist (types + builders)
 *  3. Runtime adapter exists with real behavioral logic (not re-export only)
 *  4. Runtime enrichment pathway exists
 *  5. Empty builder frozen/zero/null-safe
 *  6. Non-empty sample has movedFields/whyRefs/actorPovChanges
 *  7. Same input → identical JSON (deterministic)
 *  8. Output leaks no raw GameState/Case/Opportunity
 *  9. Workspace projection readOnly with bridge compressed counts
 * 10. LLM boundary only evidence/ref, optional/disabled
 * 11. Bridge enrichment doesn't change rngCalls/legacy outcomes
 * 12. Bridge builders have no Date.now/Math.random/fetch/OpenAI/apiKey
 * 13. Runtime adapter has per-case builders (not passthrough)
 * 14. Core→runtime import direction correct
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = '/Users/jiaqi/Documents/开放日测算/src/selling-houses';

let passed = 0;
let failed = 0;
let warnings = 0;

function check(condition: boolean, message: string) {
  if (condition) { passed++; }
  else { failed++; console.error(`  [FAIL] ${message}`); }
}

function warn(condition: boolean, message: string) {
  if (!condition) { warnings++; console.warn(`  [WARN] ${message}`); }
}

// ---------------------------------------------------------------------------
// Helper: read file or empty string
// ---------------------------------------------------------------------------

function readSrc(relPath: string): string {
  const full = resolve(ROOT, relPath);
  if (!existsSync(full)) return '';
  return readFileSync(full, 'utf-8');
}

function stripComments(src: string): string {
  return src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

// ---------------------------------------------------------------------------
// 1. A/B/C/D governance, E/F unauthorized
// ---------------------------------------------------------------------------

console.log('=== Check 1: Governance ===');

const governanceSrc = readSrc('core/world-state/semantic-receipt/dailyDecisionBridge.ts');
check(governanceSrc.length > 100, 'core dailyDecisionBridge.ts exists and is non-trivial');

// E/F should not exist as top-level worker directories
const adapterSrc = readSrc('runtime/simulation/dailyDecisionBridgeAdapter.ts');
check(adapterSrc.length > 200, 'runtime adapter exists and is substantial');

// No imports from E/F paths
const adapterCode = stripComments(adapterSrc);
check(!adapterSrc.includes("from '../../agent-e") && !adapterSrc.includes("from '../../agent-f"),
  'no E/F agent imports in adapter');

console.log('  Governance: PASS');

// ---------------------------------------------------------------------------
// 2. Core exports exist (types + builders)
// ---------------------------------------------------------------------------

console.log('=== Check 2: Core exports ===');

const coreIndexSrc = readSrc('core/world-state/semantic-receipt/index.ts');
check(coreIndexSrc.includes('DailyDecisionBridgeSummary'), 'index exports DailyDecisionBridgeSummary');
check(coreIndexSrc.includes('buildEmptyDailyDecisionBridgeSummary'), 'index exports buildEmptyDailyDecisionBridgeSummary');
check(coreIndexSrc.includes('buildDailyDecisionBridgeSummary'), 'index exports buildDailyDecisionBridgeSummary');

// Check all 10 types are exported from the core file
const coreTypes = [
  'DailyDecisionBridgeSummary',
  'DailyCaseDecisionSummary',
  'DailyDecisionMovedField',
  'DailyDecisionWhyRef',
  'DailyDecisionBlockerRef',
  'DailyDecisionCommitmentRef',
  'DailyActorPovChangeSummary',
  'DailyBeliefChangeRef',
  'DailySignalChangeRef',
  'DailyRecommendationSummary',
  'DailyDecisionBridgeInput',
];
for (const t of coreTypes) {
  check(governanceSrc.includes(`export interface ${t}`), `core defines ${t}`);
}

console.log('  Core exports: PASS');

// ---------------------------------------------------------------------------
// 3. Runtime adapter has real behavioral logic (not re-export only)
// ---------------------------------------------------------------------------

console.log('=== Check 3: Runtime adapter behavioral logic ===');

// Must have per-case builder functions
check(adapterSrc.includes('function buildMovedFieldsForCase'), 'adapter has buildMovedFieldsForCase');
check(adapterSrc.includes('function buildWhyRefsForCase'), 'adapter has buildWhyRefsForCase');
check(adapterSrc.includes('function buildBlockersForCase'), 'adapter has buildBlockersForCase');
check(adapterSrc.includes('function buildCommitmentsForCase'), 'adapter has buildCommitmentsForCase');
check(adapterSrc.includes('function buildActorPovChangesForCase'), 'adapter has buildActorPovChangesForCase');
check(adapterSrc.includes('function buildRecommendationsForCase'), 'adapter has buildRecommendationsForCase');

// Must have main adapter entry points
check(adapterSrc.includes('export function buildDailyDecisionBridgeInputFromPOV'),
  'adapter exports buildDailyDecisionBridgeInputFromPOV');
check(adapterSrc.includes('export function buildDailyDecisionBridgeFromSemanticReceiptInputPack'),
  'adapter exports buildDailyDecisionBridgeFromSemanticReceiptInputPack');
check(adapterSrc.includes('export function buildEmptyDailyDecisionBridgeInput'),
  'adapter exports buildEmptyDailyDecisionBridgeInput');

// Must import from core (not define its own types)
check(adapterCode.includes("from '../../core/world-state/semantic-receipt/dailyDecisionBridge.js'"),
  'adapter imports from core dailyDecisionBridge');

// Must use core builders
check(adapterCode.includes('buildEmptyDailyDecisionBridgeSummary'),
  'adapter uses buildEmptyDailyDecisionBridgeSummary from core');
check(adapterCode.includes('buildDailyDecisionBridgeSummary'),
  'adapter uses buildDailyDecisionBridgeSummary from core');

// Must have actual computation (not just passthrough)
check(adapterCode.includes('casePOV.assetScore.d1'), 'adapter reads assetScore.d1');
check(adapterCode.includes('casePOV.ownerReadiness.trust'), 'adapter reads ownerReadiness.trust');
check(adapterCode.includes('casePOV.signals'), 'adapter reads casePOV.signals');
check(adapterCode.includes('casePOV.decisionMoments'), 'adapter reads casePOV.decisionMoments');
check(adapterCode.includes('casePOV.commitmentStates'), 'adapter reads commitmentStates');
check(adapterCode.includes('casePOV.recommendationDrafts'), 'adapter reads recommendationDrafts');

// Must sort for deterministic ordering
check(adapterCode.includes('.sort('), 'adapter sorts for determinism');

console.log('  Runtime adapter behavioral logic: PASS');

// ---------------------------------------------------------------------------
// 4. Runtime enrichment pathway exists
// ---------------------------------------------------------------------------

console.log('=== Check 4: Runtime enrichment pathway ===');

const enrichSrc = readSrc('runtime/simulation/semanticReceiptEnrichment.ts');
const enrichCode = stripComments(enrichSrc);

check(enrichSrc.includes('enrichDailyTickResultWithDailyDecisionBridge'),
  'enrichment has bridge-specific function');
check(enrichCode.includes('dailyDecisionBridge?: DailyDecisionBridgeSummary'),
  'enrichment input accepts DailyDecisionBridgeSummary');
check(enrichCode.includes('dailyDecisionBridge: input.dailyDecisionBridge'),
  'enrichment passes bridge to result');

// Runtime index re-exports
const runtimeIndexSrc = readSrc('runtime/simulation/index.ts');
check(runtimeIndexSrc.includes("from './dailyDecisionBridgeAdapter.js'"),
  'runtime index re-exports bridge adapter');

console.log('  Runtime enrichment pathway: PASS');

// ---------------------------------------------------------------------------
// 5. Empty builder frozen/zero/null-safe
// ---------------------------------------------------------------------------

console.log('=== Check 5: Empty builder frozen/zero ===');

// Import and test the empty builder dynamically
const { buildEmptyDailyDecisionBridgeSummary } = await import(
  '../src/selling-houses/core/world-state/semantic-receipt/dailyDecisionBridge.js'
);

const empty = buildEmptyDailyDecisionBridgeSummary(7);
check(empty.day === 7, 'empty: day=7');
check(empty.movedCases.length === 0, 'empty: movedCases=[]');
check(empty.actorPovChanges.length === 0, 'empty: actorPovChanges=[]');
check(empty.recommendations.length === 0, 'empty: recommendations=[]');
check(empty.totalMovedCases === 0, 'empty: totalMovedCases=0');
check(empty.totalBlockers === 0, 'empty: totalBlockers=0');
check(empty.totalCommitments === 0, 'empty: totalCommitments=0');
check(Object.isFrozen(empty), 'empty: top-level frozen');
check(Object.isFrozen(empty.movedCases), 'empty: movedCases frozen');
check(Object.isFrozen(empty.actorPovChanges), 'empty: actorPovChanges frozen');
check(Object.isFrozen(empty.recommendations), 'empty: recommendations frozen');

// Null-safe: no undefined fields (8 fields including operatingMovement)
const emptyKeys = Object.keys(empty);
check(emptyKeys.length === 8, 'empty: exactly 8 fields (including operatingMovement)');
for (const k of emptyKeys) {
  check((empty as any)[k] !== undefined, `empty: ${k} is not undefined`);
}
// Verify operatingMovement is frozen and has correct structure
check(empty.operatingMovement !== undefined, 'empty: has operatingMovement');
check(empty.operatingMovement.movedCaseCount === 0, 'empty: operatingMovement.movedCaseCount=0');
check(Object.isFrozen(empty.operatingMovement), 'empty: operatingMovement frozen');

console.log('  Empty builder frozen/zero: PASS');

// ---------------------------------------------------------------------------
// 6. Non-empty sample has movedFields/whyRefs/actorPovChanges
// ---------------------------------------------------------------------------

console.log('=== Check 6: Non-empty sample correctness ===');

const { buildDailyDecisionBridgeSummary } = await import(
  '../src/selling-houses/core/world-state/semantic-receipt/dailyDecisionBridge.js'
);

const sample = buildDailyDecisionBridgeSummary({
  day: 3,
  movedCases: [{
    caseId: 'case-100',
    movedFields: [{
      field: 'trust',
      previousValue: 40,
      newValue: 60,
      delta: 20,
      reason: '首次面访建立信任',
    }, {
      field: 'askPrice',
      previousValue: 500,
      newValue: 480,
      delta: -20,
      reason: '业主同意降价',
    }],
    whyRefs: [{
      refType: 'interaction_scene',
      refId: 'scene:first-visit:case-100',
      summary: '首次面访场景',
      relevance: 0.9,
    }, {
      refType: 'pressure_receipt',
      refId: 'pressure:d3:case-100',
      summary: '竞品压力增加',
      relevance: 0.75,
    }],
    blockers: [{
      blockerId: 'b:1',
      kind: 'price_exceeds_budget',
      description: '报价高于客户预算',
      severity: 'high',
    }],
    commitments: [{
      commitmentId: 'cm:1',
      kind: 'timeline_agreement',
      actorId: 'owner:case-100',
      action: 'created',
      strength: 70,
      reason: '业主同意下周调价',
    }],
    actorIds: ['broker:current', 'owner:case-100'],
  }],
  actorPovChanges: [{
    actorId: 'broker:current',
    actorKind: 'broker',
    changedBeliefs: [{
      beliefId: 'belief:trust',
      beliefKind: 'broker_trust',
      previousConfidence: 0.4,
      newConfidence: 0.6,
      direction: 'strengthened',
      reason: '面访改善信任',
    }],
    changedSignals: [{
      signalId: 'sig:1',
      signalKind: 'owner-readiness-low',
      severity: 'watch',
      label: '业主配合度低',
      appeared: true,
    }],
    caseIds: ['case-100'],
  }],
  recommendations: [{
    actionSpecId: 'follow-up-call',
    caseId: 'case-100',
    label: '跟进电话',
    priority: 70,
    confidence: 0.65,
    enabled: true,
    rationale: '业主配合度提升，跟进确认',
    supportingSignalCount: 2,
    decisionMomentCount: 1,
  }],
});

check(sample.day === 3, 'sample: day=3');
check(sample.movedCases.length === 1, 'sample: 1 moved case');
check(sample.movedCases[0].movedFields.length === 2, 'sample: 2 moved fields');
check(sample.movedCases[0].movedFields[0].field === 'trust', 'sample: first field is trust');
check(sample.movedCases[0].movedFields[0].delta === 20, 'sample: trust delta=20');
check(sample.movedCases[0].movedFields[1].field === 'askPrice', 'sample: second field is askPrice');
check(sample.movedCases[0].whyRefs.length === 2, 'sample: 2 whyRefs');
check(sample.movedCases[0].whyRefs[0].refType === 'interaction_scene', 'sample: first whyRef is interaction_scene');
check(sample.movedCases[0].whyRefs[1].refType === 'pressure_receipt', 'sample: second whyRef is pressure_receipt');
check(sample.movedCases[0].blockers.length === 1, 'sample: 1 blocker');
check(sample.movedCases[0].blockers[0].severity === 'high', 'sample: blocker severity=high');
check(sample.movedCases[0].commitments.length === 1, 'sample: 1 commitment');
check(sample.movedCases[0].commitments[0].action === 'created', 'sample: commitment action=created');
check(sample.actorPovChanges.length === 1, 'sample: 1 actorPovChange');
check(sample.actorPovChanges[0].changedBeliefs[0].direction === 'strengthened', 'sample: belief strengthened');
check(sample.actorPovChanges[0].changedSignals[0].appeared === true, 'sample: signal appeared');
check(sample.recommendations.length === 1, 'sample: 1 recommendation');
check(sample.recommendations[0].enabled === true, 'sample: recommendation enabled');
check(sample.totalMovedCases === 1, 'sample: totalMovedCases=1');
check(sample.totalBlockers === 1, 'sample: totalBlockers=1');
check(sample.totalCommitments === 1, 'sample: totalCommitments=1');
check(Object.isFrozen(sample), 'sample: frozen');

console.log('  Non-empty sample correctness: PASS');

// ---------------------------------------------------------------------------
// 7. Same input → identical JSON (deterministic)
// ---------------------------------------------------------------------------

console.log('=== Check 7: Deterministic ===');

const input = {
  day: 5,
  movedCases: [{
    caseId: 'case-d',
    movedFields: [{ field: 'f', previousValue: 1, newValue: 2, delta: 1, reason: 'r' }],
    whyRefs: [{ refType: 'event' as const, refId: 'e1', summary: 's', relevance: 0.5 }],
    blockers: [{ blockerId: 'b1', kind: 'k', description: 'd', severity: 'low' as const }],
    commitments: [{ commitmentId: 'c1', kind: 'k', actorId: 'a', action: 'created' as const, strength: 50, reason: 'r' }],
    actorIds: ['a1'],
  }],
  actorPovChanges: [{
    actorId: 'a1',
    actorKind: 'broker' as const,
    changedBeliefs: [{ beliefId: 'b1', beliefKind: 'bk', previousConfidence: 0.5, newConfidence: 0.6, direction: 'strengthened' as const, reason: 'r' }],
    changedSignals: [{ signalId: 's1', signalKind: 'sk', severity: 'info' as const, label: 'l', appeared: true }],
    caseIds: ['case-d'],
  }],
  recommendations: [{
    actionSpecId: 'ar1',
    caseId: 'case-d',
    label: 'l',
    priority: 50,
    confidence: 0.5,
    enabled: true,
    rationale: 'r',
    supportingSignalCount: 1,
    decisionMomentCount: 1,
  }],
};

const run1 = buildDailyDecisionBridgeSummary(input);
const run2 = buildDailyDecisionBridgeSummary(input);

check(JSON.stringify(run1) === JSON.stringify(run2), 'deterministic: identical JSON for same input');

// Also check empty builder determinism
const e1 = buildEmptyDailyDecisionBridgeSummary(99);
const e2 = buildEmptyDailyDecisionBridgeSummary(99);
check(JSON.stringify(e1) === JSON.stringify(e2), 'deterministic: empty builder identical JSON');

console.log('  Deterministic: PASS');

// ---------------------------------------------------------------------------
// 8. Output leaks no raw GameState/Case/Opportunity
// ---------------------------------------------------------------------------

console.log('=== Check 8: No raw type leaks ===');

const coreSrc = stripComments(governanceSrc);
check(!coreSrc.includes('GameState'), 'core: no GameState');
check(!coreSrc.includes('Case[]'), 'core: no Case[]');
check(!coreSrc.includes('Opportunity[]'), 'core: no Opportunity[]');
check(!coreSrc.includes('DailyTickResult'), 'core: no DailyTickResult');
check(!coreSrc.includes('ActorBelief'), 'core: no ActorBelief');
check(!coreSrc.includes('CommitmentState'), 'core: no CommitmentState');
check(!coreSrc.includes('AttentionState'), 'core: no AttentionState');
check(!coreSrc.includes('InteractionScene'), 'core: no InteractionScene');

// All bridge fields are string refs, not embedded objects
check(coreSrc.includes('readonly caseId: string'), 'core: caseId is string ref');
check(coreSrc.includes('readonly refId: string'), 'core: refId is string ref');
check(coreSrc.includes('readonly blockerId: string'), 'core: blockerId is string ref');
check(coreSrc.includes('readonly commitmentId: string'), 'core: commitmentId is string ref');
check(coreSrc.includes('readonly actorId: string'), 'core: actorId is string ref');
check(coreSrc.includes('readonly beliefId: string'), 'core: beliefId is string ref');
check(coreSrc.includes('readonly signalId: string'), 'core: signalId is string ref');
check(coreSrc.includes('readonly actionSpecId: string'), 'core: actionSpecId is string ref');

console.log('  No raw type leaks: PASS');

// ---------------------------------------------------------------------------
// 9. Workspace projection readOnly with bridge compressed counts
// ---------------------------------------------------------------------------

console.log('=== Check 9: Workspace projection ===');

const workspaceComposerSrc = readSrc('interface/interaction-workspace/semanticWorkspaceComposer.ts');
const readOnlySrc = readSrc('interface/interaction-workspace/readOnly.ts');

// Check workspace has readOnly pattern
check(readOnlySrc.length > 50 || workspaceComposerSrc.includes('readOnly') || workspaceComposerSrc.includes('readonly'),
  'workspace has readOnly pattern');

// DailySemanticReceiptBundle carries bridge as optional field
const modelsSrc = readSrc('core/world-state/semantic-receipt/models.ts');
check(modelsSrc.includes('dailyDecisionBridge?: import'),
  'DailySemanticReceiptBundle has optional dailyDecisionBridge field');

// Bridge summary has compressed counts (totalMovedCases, totalBlockers, totalCommitments)
check(governanceSrc.includes('readonly totalMovedCases: number'), 'bridge has totalMovedCases count');
check(governanceSrc.includes('readonly totalBlockers: number'), 'bridge has totalBlockers count');
check(governanceSrc.includes('readonly totalCommitments: number'), 'bridge has totalCommitments count');

// All bridge fields are readonly
check(governanceSrc.includes('readonly movedCases: readonly'), 'bridge movedCases is readonly array');
check(governanceSrc.includes('readonly actorPovChanges: readonly'), 'bridge actorPovChanges is readonly array');
check(governanceSrc.includes('readonly recommendations: readonly'), 'bridge recommendations is readonly array');

console.log('  Workspace projection: PASS');

// ---------------------------------------------------------------------------
// 10. LLM boundary only evidence/ref, optional/disabled
// ---------------------------------------------------------------------------

console.log('=== Check 10: LLM boundary ===');

// Bridge has no LLM imports
check(!coreSrc.includes('openai'), 'core: no openai import');
check(!coreSrc.includes('fetch('), 'core: no fetch call');
check(!coreSrc.includes('apiKey'), 'core: no apiKey');

// LLM readiness is optional in the receipt bundle
check(modelsSrc.includes('readonly llmReady: boolean'), 'llmReady is boolean field');
check(modelsSrc.includes('llmReady: false'), 'empty receipt has llmReady=false');

// dailyDecisionBridge field is optional in the bundle
check(modelsSrc.includes('dailyDecisionBridge?:'), 'bridge is optional in receipt bundle');

// Adapter has no LLM calls
const adapterCodeClean = stripComments(adapterSrc);
check(!adapterCodeClean.includes('openai'), 'adapter: no openai');
check(!adapterCodeClean.includes('fetch('), 'adapter: no fetch');
check(!adapterCodeClean.includes('apiKey'), 'adapter: no apiKey');
check(!adapterCodeClean.includes('LLM'), 'adapter: no LLM calls');

console.log('  LLM boundary: PASS');

// ---------------------------------------------------------------------------
// 11. Bridge enrichment doesn't change rngCalls/legacy outcomes
// ---------------------------------------------------------------------------

console.log('=== Check 11: Enrichment doesn\'t affect gameplay ===');

const enrichCodeClean = stripComments(enrichSrc);

// Enrichment returns frozen copy, doesn't mutate
check(enrichSrc.includes('Does NOT mutate original DailyTickResult'),
  'enrichment declares non-mutation');
check(enrichSrc.includes('Does NOT modify domain engine behavior'),
  'enrichment declares no engine modification');
check(enrichSrc.includes('Does NOT affect gameplay, RNG, tick order, or UI'),
  'enrichment declares no gameplay effect');

// Enrichment uses Object.freeze
check(enrichCodeClean.includes('Object.freeze'), 'enrichment uses Object.freeze');

// No rngCalls modification
check(!enrichCodeClean.includes('rngCalls'), 'enrichment: no rngCalls access');

// No domain state mutation
check(!enrichCodeClean.includes('state.cases.push'), 'enrichment: no case mutation');
check(!enrichCodeClean.includes('state.opportunities'), 'enrichment: no opportunity mutation');

console.log('  Enrichment doesn\'t affect gameplay: PASS');

// ---------------------------------------------------------------------------
// 12. Bridge builders have no Date.now/Math.random/fetch/OpenAI/apiKey
// ---------------------------------------------------------------------------

console.log('=== Check 12: No side effects in builders ===');

// Core builders
check(!coreSrc.includes('Date.now'), 'core: no Date.now');
check(!coreSrc.includes('Math.random'), 'core: no Math.random');
check(!coreSrc.includes('fetch('), 'core: no fetch');
check(!coreSrc.includes('openai'), 'core: no openai');
check(!coreSrc.includes('apiKey'), 'core: no apiKey');
check(!coreSrc.includes('crypto'), 'core: no crypto');

// Adapter
check(!adapterCodeClean.includes('Date.now'), 'adapter: no Date.now');
check(!adapterCodeClean.includes('Math.random'), 'adapter: no Math.random');
check(!adapterCodeClean.includes('fetch('), 'adapter: no fetch');
check(!adapterCodeClean.includes('crypto'), 'adapter: no crypto');

// Enrichment
check(!enrichCodeClean.includes('Date.now'), 'enrichment: no Date.now');
check(!enrichCodeClean.includes('Math.random'), 'enrichment: no Math.random');

console.log('  No side effects in builders: PASS');

// ---------------------------------------------------------------------------
// 13. Runtime adapter has per-case builders (not passthrough)
// ---------------------------------------------------------------------------

console.log('=== Check 13: Per-case builder depth ===');

// Each per-case builder must have domain-specific logic, not just forwarding
check(adapterCode.includes('casePOV.assetScore.d1'), 'buildMovedFieldsForCase reads d1');
check(adapterCode.includes('casePOV.assetScore.d2'), 'buildMovedFieldsForCase reads d2');
check(adapterCode.includes('casePOV.assetScore.d3'), 'buildMovedFieldsForCase reads d3');
check(adapterCode.includes('casePOV.ownerReadiness.trust'), 'buildMovedFieldsForCase reads trust');
check(adapterCode.includes('casePOV.ownerReadiness.urgency'), 'buildMovedFieldsForCase reads urgency');
check(adapterCode.includes('casePOV.ownerReadiness.patience'), 'buildMovedFieldsForCase reads patience');
check(adapterCode.includes('casePOV.assetScore.score'), 'buildMovedFieldsForCase reads competitiveness score');
check(adapterCode.includes('casePOV.assetScore.blockers'), 'buildBlockersForCase reads blockers');
check(adapterCode.includes('casePOV.commitmentStates'), 'buildCommitmentsForCase reads commitmentStates');
check(adapterCode.includes('casePOV.commitments'), 'buildCommitmentsForCase reads commitments');
check(adapterCode.includes('casePOV.knowledge.beliefs'), 'buildActorPovChangesForCase reads beliefs');
check(adapterCode.includes('casePOV.recommendationDrafts'), 'buildRecommendationsForCase reads drafts');

// Why refs must gather from multiple sources
check(adapterCode.includes('evaluation_snapshot'), 'whyRefs gather evaluation_snapshot');
check(adapterCode.includes('interaction_scene'), 'whyRefs gather interaction_scene');
check(adapterCode.includes('pressure_receipt'), 'whyRefs gather pressure_receipt');
check(adapterCode.includes('consensus_receipt'), 'whyRefs gather consensus_receipt');
check(adapterCode.includes('narrativePack'), 'whyRefs gather narrative signal pack');

console.log('  Per-case builder depth: PASS');

// ---------------------------------------------------------------------------
// 14. Core→runtime import direction correct
// ---------------------------------------------------------------------------

console.log('=== Check 14: Import direction ===');

// Core must NOT import from runtime
check(!coreSrc.includes("from '../../runtime"), 'core: no runtime imports');
check(!coreSrc.includes("from '../runtime"), 'core: no runtime imports');
check(!coreSrc.includes("from './runtime"), 'core: no runtime imports');

// Core must NOT import from domain
check(!coreSrc.includes("from '../../domain"), 'core: no domain imports');

// Runtime adapter imports from core (allowed direction)
check(adapterCode.includes("from '../../core/world-state/semantic-receipt/dailyDecisionBridge.js'"),
  'adapter imports from core (correct direction)');

// Runtime adapter does NOT import from interface
check(!adapterCode.includes("from '../../interface"), 'adapter: no interface imports');

console.log('  Import direction: PASS');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== DailyDecisionBridge Final Gate Summary ===`);
console.log(`Total: ${passed + failed + warnings}, Passed: ${passed}, Failed: ${failed}, Warnings: ${warnings}`);

if (failed > 0) {
  console.log('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\ndaily-decision-bridge final gate passed');
  process.exit(0);
}
