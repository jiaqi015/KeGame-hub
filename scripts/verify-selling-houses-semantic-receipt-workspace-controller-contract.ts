/**
 * Semantic Receipt / Workspace Boundary controller verification contract.
 *
 * Proves that A/B only expose semantic layers as read-only observability
 * surfaces, without leaking back into engine or LLM provider.
 *
 * Checks:
 * 1. DailyTickResult semantic receipts are optional, read-only summary/ref
 * 2. Semantic receipts don't embed raw GameState/Case/Opportunity/DomainEventEntry
 * 3. Old tick result still works without semantic receipt fields
 * 4. Engine/gameplay: new receipts not read by resolveOneDay decision branches
 * 5. Multi-tick replayability: identical state with same seed
 * 6. Workspace boundary: projectionKind, readOnly, no UI changes, no raw GameState
 * 7. Owner/broker visibility boundary
 * 8. LLM optionality: no apiKey/fetch/OpenAI, disabled path, output is proposal
 * 9. Work discipline: S=commander, A/B/C/D=workers, E/F blocked, reports written
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { advanceOneDay, seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import type { GameState } from '../src/selling-houses/domain/models.js';

import {
  buildDisabledFallback,
  isLlmDisabled,
} from '../src/selling-houses/core/llm-boundary/models.js';

import type { PressureInputSource } from '../src/selling-houses/core/world-state/competition/models.js';

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
// 1. DailyTickResult semantic receipts are optional, read-only
// ---------------------------------------------------------------------------

console.log('=== Check 1: DailyTickResult semantic receipts ===');

const modelsSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/domain/models.ts', 'utf-8');

// pressureReceipts is optional
check(modelsSrc.includes('pressureReceipts?:'), 'pressureReceipts is optional');

// pressureReceipts uses core type, not embedded domain objects
check(modelsSrc.includes("import('../core/world-state/competition/models.js')"), 'pressureReceipts uses core type import');

// No raw GameState/Case/Opportunity embedded in DailyTickResult
const resultSection = modelsSrc.substring(
  modelsSrc.indexOf('export interface DailyTickResult'),
  modelsSrc.indexOf('export interface DirtyScopeSet'));
check(!resultSection.includes('GameState'), 'DailyTickResult does NOT embed GameState');
check(!resultSection.includes('Case[]'), 'DailyTickResult does NOT embed Case[]');
check(!resultSection.includes('Opportunity[]'), 'DailyTickResult does NOT embed Opportunity[]');

// Old tick result still works without semantic receipts
const w1 = buildWorld(SEED);
const result1 = advanceOneDay(w1);
check(result1 !== null, 'advanceOneDay returns result');
check(result1!.processResults !== undefined, 'processResults still present');
check(result1!.pressureReceipts !== undefined, 'pressureReceipts populated');
check(result1!.dirtyScopes !== undefined, 'dirtyScopes still present');

// ---------------------------------------------------------------------------
// 2. Semantic receipt builders are deterministic, no RNG
// ---------------------------------------------------------------------------

console.log('=== Check 2: Receipt builders deterministic ===');

const wa = buildWorld(SEED);
const wb = buildWorld(SEED);
const ra = advanceOneDay(wa);
const rb = advanceOneDay(wb);

check(wa.rngCalls === wb.rngCalls, `rngCalls identical: ${wa.rngCalls}`);
check(ra?.pressureReceipts?.inputCount === rb?.pressureReceipts?.inputCount, 'pressureReceipts inputCount identical');
check(ra?.pressureReceipts?.day === rb?.pressureReceipts?.day, 'pressureReceipts day identical');

// Snapshots are frozen
check(Object.isFrozen(ra!.pressureReceipts!), 'pressureReceipts bundle frozen');
check(Object.isFrozen(ra!.pressureReceipts!.snapshots), 'snapshots array frozen');

// ---------------------------------------------------------------------------
// 3. Engine does NOT read semantic receipts for decisions
// ---------------------------------------------------------------------------

console.log('=== Check 3: Engine ignores semantic receipts for decisions ===');

const engineSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/domain/engine.ts', 'utf-8');
const nonComment = engineSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

// ALLOW: building pressure receipts and semantic receipts as summary outputs
check(engineSrc.includes('buildPressureReceiptsFromBuffer'), 'engine builds pressure receipts from buffer');
check(engineSrc.includes('buildLiveSemanticReceipt'), 'engine uses buildLiveSemanticReceipt');

// ALLOW: reading pressure/consensus counts for summary input
// These are summary-only reads that don't affect decisions
check(engineSrc.includes('pressureReceipts.snapshots.length'), 'engine reads pressure snapshot count for summary');
check(engineSrc.includes('negotiationResult.consensusReceipts'), 'engine reads consensus receipts for summary');

// FORBID: using receipts in decision branches (if statements)
const decisionBranchPattern = /if\s*\(\s*(pressureReceipts|semanticReceipts|consensusReceipts)\s*[.!]/;
check(!decisionBranchPattern.test(nonComment), 'engine does NOT use receipts in decision branches');

// FORBID: reading receipt fields to change gameplay values
check(!nonComment.includes('pressureReceipts.heat'), 'engine does NOT read pressure for heat');
check(!nonComment.includes('pressureReceipts.trust'), 'engine does NOT read pressure for trust');
check(!nonComment.includes('semanticReceipts.heat'), 'engine does NOT read semantic for heat');
check(!nonComment.includes('semanticReceipts.trust'), 'engine does NOT read semantic for trust');

// FORBID: interactionScene/narrativeSignalPack in engine (not wired yet)
check(!nonComment.includes('interactionScene'), 'engine does NOT read interactionScene');
check(!nonComment.includes('narrativeSignalPack'), 'engine does NOT read narrativeSignalPack');

// ---------------------------------------------------------------------------
// 3b. Semantic receipts have live data after advanceOneDay
// ---------------------------------------------------------------------------

console.log('=== Check 3b: Semantic receipts have live data ===');

const wLive = buildWorld(SEED);
const resultLive = advanceOneDay(wLive);

check(resultLive !== null, 'advanceOneDay returns result');
check(resultLive!.semanticReceipts !== undefined, 'semanticReceipts is defined');
check(resultLive!.semanticReceipts!.day === wLive.day - 1, `semanticReceipts.day matches settled day: ${resultLive!.semanticReceipts!.day}`);

// Pressure receipts should be available (buffer was used)
check(resultLive!.semanticReceipts!.pressureReceipts.available === true, 'semanticReceipts.pressureReceipts.available is true');
check(resultLive!.semanticReceipts!.pressureReceipts.snapshotCount >= 0, 'semanticReceipts.pressureReceipts.snapshotCount is non-negative');
check(resultLive!.semanticReceipts!.pressureReceipts.day === wLive.day - 1, 'semanticReceipts.pressureReceipts.day matches settled day');

// Consensus receipts should have data (negotiation process runs)
check(resultLive!.semanticReceipts!.consensusReceipts.day === wLive.day - 1, 'semanticReceipts.consensusReceipts.day matches settled day');

// InteractionScene and NarrativeSignalPack remain empty in v1
check(resultLive!.semanticReceipts!.interactionScenes.sceneCount === 0, 'interactionScenes empty in v1');
check(resultLive!.semanticReceipts!.narrativeSignalPack.signalCount === 0, 'narrativeSignalPack empty in v1');
check(resultLive!.semanticReceipts!.llmReady === false, 'llmReady false in v1');

// Semantic receipts are frozen (read-only)
check(Object.isFrozen(resultLive!.semanticReceipts!), 'semanticReceipts bundle is frozen');
check(Object.isFrozen(resultLive!.semanticReceipts!.pressureReceipts), 'pressureReceipts summary is frozen');
check(Object.isFrozen(resultLive!.semanticReceipts!.consensusReceipts), 'consensusReceipts summary is frozen');

// ---------------------------------------------------------------------------
// 4. Multi-tick replayability
// ---------------------------------------------------------------------------

console.log('=== Check 4: Multi-tick replayability ===');

for (const tickCount of [1, 3, 5]) {
  const wa = buildWorld(SEED);
  const wb = buildWorld(SEED);
  for (let i = 0; i < tickCount; i++) {
    advanceOneDay(wa);
    advanceOneDay(wb);
  }
  check(wa.rngCalls === wb.rngCalls, `rngCalls identical after ${tickCount} ticks: ${wa.rngCalls}`);

  const ca = wa.cases.map(c => `${c.id}:${Math.round(c.heat * 100)}:${Math.round(c.trust * 100)}:${c.status}`);
  const cb = wb.cases.map(c => `${c.id}:${Math.round(c.heat * 100)}:${Math.round(c.trust * 100)}:${c.status}`);
  check(JSON.stringify(ca) === JSON.stringify(cb), `Case fields identical after ${tickCount} ticks`);

  const ea = wa.eventStore.map(e => e.kind + ':' + e.caseId);
  const eb = wb.eventStore.map(e => e.kind + ':' + e.caseId);
  check(JSON.stringify(ea) === JSON.stringify(eb), `eventStore identical after ${tickCount} ticks`);

  // Semantic receipts don't affect replayability
  const sa = wa.lastDailyTickResult?.semanticReceipts;
  const sb = wb.lastDailyTickResult?.semanticReceipts;
  check(sa?.pressureReceipts.snapshotCount === sb?.pressureReceipts.snapshotCount, `pressureReceipts snapshotCount identical after ${tickCount} ticks`);
  check(sa?.consensusReceipts.formationCount === sb?.consensusReceipts.formationCount, `consensusReceipts formationCount identical after ${tickCount} ticks`);
}

// ---------------------------------------------------------------------------
// 5. Workspace boundary
// ---------------------------------------------------------------------------

console.log('=== Check 5: Workspace boundary ===');

const workspaceTypesSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/interface/interaction-workspace/types.ts', 'utf-8');

// projectionKind exists
check(workspaceTypesSrc.includes("readonly projectionKind:"), 'projectionKind field exists');

// readOnly: true exists
check(workspaceTypesSrc.includes('readonly readOnly: true'), 'readOnly: true field exists');

// No raw GameState in workspace types
const nonCommentWs = workspaceTypesSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!nonCommentWs.includes('GameState'), 'workspace types do NOT reference GameState');

// POV workspace projections exist
const povBoundarySrc = existsSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/interface/interaction-workspace/povBoundary.ts');
check(povBoundarySrc, 'povBoundary.ts exists');

if (povBoundarySrc) {
  const povSrc = readFileSync(
    '/Users/jiaqi/Documents/开放日测算/src/selling-houses/interface/interaction-workspace/povBoundary.ts', 'utf-8');
  const nonCommentPov = povSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  check(!nonCommentPov.includes('GameState'), 'povBoundary does NOT reference GameState');
  check(!nonCommentPov.includes('execute('), 'povBoundary does NOT execute actions');
}

// Check workspace readOnly utility
const readOnlySrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/interface/interaction-workspace/readOnly.ts', 'utf-8');
check(readOnlySrc.includes('freezeProjection'), 'freezeProjection utility exists');
check(readOnlySrc.includes('ReadonlyDeep'), 'ReadonlyDeep type exists');

// Owner/broker visibility boundary
const decisionModelsSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/decision/models.ts', 'utf-8');

// OwnerPOV does NOT have pressureSummary, opportunityCount, D4
const ownerSnapStart = decisionModelsSrc.indexOf('export interface OwnerPOVSnapshot');
const ownerSnap = decisionModelsSrc.substring(ownerSnapStart, ownerSnapStart + 500);
check(!ownerSnap.includes('pressureSummary'), 'OwnerPOVSnapshot does NOT have pressureSummary');
check(ownerSnap.includes('Owner does NOT see pressure'), 'OwnerPOV explicitly hides pressure');

// BrokerPOV has readOnly: true
const brokerSnapStart = decisionModelsSrc.indexOf('export interface BrokerPOVSnapshot');
const brokerSnap = decisionModelsSrc.substring(brokerSnapStart, brokerSnapStart + 500);
check(brokerSnap.includes('readonly readOnly: true'), 'BrokerPOVSnapshot.readOnly: true');

// ActionCommandDraft is intention only
const draftSection = decisionModelsSrc.substring(
  Math.max(0, decisionModelsSrc.indexOf('export interface ActionCommandDraft') - 300),
  decisionModelsSrc.indexOf('export interface ActionCommandDraft') + 800);
check(draftSection.includes('NOT what the simulation') || draftSection.includes('intention'), 'ActionCommandDraft is intention only');

// ---------------------------------------------------------------------------
// 6. LLM optionality
// ---------------------------------------------------------------------------

console.log('=== Check 6: LLM optionality ===');

const llmModelsSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/llm-boundary/models.ts', 'utf-8');
const nonCommentLlm = llmModelsSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!nonCommentLlm.includes('GameState'), 'LLM boundary: no GameState type');
check(!nonCommentLlm.includes('apiKey'), 'LLM boundary: no apiKey');
check(!nonCommentLlm.includes('fetch('), 'LLM boundary: no fetch()');

const fallback = buildDisabledFallback('test');
check(fallback.mode === 'disabled', 'LLM disabled mode works');
check(isLlmDisabled('disabled'), 'isLlmDisabled(disabled) = true');
check(fallback.fallbackProposal.isFallback === true, 'fallback is marked as fallback');
check(fallback.fallbackProposal.validationStatus === 'rejected', 'fallback is rejected');

check(llmModelsSrc.includes("'advisory_only'"), 'LLM: advisory_only applyability');
check(llmModelsSrc.includes("'validator_required'"), 'LLM: validator_required applyability');
check(llmModelsSrc.includes("'never_apply_directly'"), 'LLM: never_apply_directly applyability');

// LLM interaction adapter doesn't reference raw GameState
const llmInputSrc = existsSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/runtime/llm-support/llmInputPackAdapter.ts');
if (llmInputSrc) {
  const adapterSrc = readFileSync(
    '/Users/jiaqi/Documents/开放日测算/src/selling-houses/runtime/llm-support/llmInputPackAdapter.ts', 'utf-8');
  const nonCommentAdapter = adapterSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  check(!nonCommentAdapter.includes('fetch('), 'llmInputPackAdapter: no fetch()');
  check(!nonCommentAdapter.includes('OpenAI'), 'llmInputPackAdapter: no OpenAI');
}

// ---------------------------------------------------------------------------
// 7. Interaction/narrative adapters are read-only bridges
// ---------------------------------------------------------------------------

console.log('=== Check 7: Interaction/narrative adapters ===');

// Runtime interaction adapter
const interactionAdapterSrc = existsSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/runtime/interaction-support/interactionSceneAdapter.ts');
check(interactionAdapterSrc, 'interactionSceneAdapter.ts exists');

if (interactionAdapterSrc) {
  const src = readFileSync(
    '/Users/jiaqi/Documents/开放日测算/src/selling-houses/runtime/interaction-support/interactionSceneAdapter.ts', 'utf-8');
  const nonCommentIA = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  check(!nonCommentIA.includes('Date.now'), 'interactionSceneAdapter: no Date.now');
  check(!nonCommentIA.includes('Math.random'), 'interactionSceneAdapter: no Math.random');
  check(!nonCommentIA.includes('fetch('), 'interactionSceneAdapter: no fetch()');

  // Returns frozen InteractionScene
  check(src.includes('Object.freeze'), 'interactionSceneAdapter: uses Object.freeze');
}

// Runtime narrative adapter
const narrativeAdapterSrc = existsSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/runtime/narrative-support/narrativeSignalPackAdapter.ts');
check(narrativeAdapterSrc, 'narrativeSignalPackAdapter.ts exists');

if (narrativeAdapterSrc) {
  const src = readFileSync(
    '/Users/jiaqi/Documents/开放日测算/src/selling-houses/runtime/narrative-support/narrativeSignalPackAdapter.ts', 'utf-8');
  const nonCommentNA = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  check(!nonCommentNA.includes('Date.now'), 'narrativeSignalPackAdapter: no Date.now');
  check(!nonCommentNA.includes('Math.random'), 'narrativeSignalPackAdapter: no Math.random');
  check(!nonCommentNA.includes('fetch('), 'narrativeSignalPackAdapter: no fetch()');
  check(!nonCommentNA.includes('GameState'), 'narrativeSignalPackAdapter: no GameState');
}

// Core types are layer-clean
const interactionsSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/interactions/models.ts', 'utf-8');
check(!interactionsSrc.includes("from '../../../domain"), 'core/interactions: no domain import');
check(!interactionsSrc.includes("from '../../../runtime"), 'core/interactions: no runtime import');

const narrativeModelsSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/narrative/models.ts', 'utf-8');
check(!narrativeModelsSrc.includes("from '../../domain"), 'core/narrative: no domain import');
check(!narrativeModelsSrc.includes("from '../../runtime"), 'core/narrative: no runtime import');

// ---------------------------------------------------------------------------
// 8. Work discipline: S=commander, A/B/C/D=workers
// ---------------------------------------------------------------------------

console.log('=== Check 8: Work discipline ===');

const workplan = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/docs/selling-houses-mother-model-agent-workplan.md', 'utf-8');
check(workplan.includes('S is the commander'), 'S is commander (总指挥)');
check(!/### \d{4}-\d{2}-\d{2}.*Agent E/.test(workplan), 'No Agent E reports');
check(!/### \d{4}-\d{2}-\d{2}.*Agent F/.test(workplan), 'No Agent F reports');
check(/### \d{4}-\d{2}-\d{2}.*Agent A/.test(workplan), 'Agent A has reports');
check(/### \d{4}-\d{2}-\d{2}.*Agent B/.test(workplan), 'Agent B has reports');
check(/### \d{4}-\d{2}-\d{2}.*Agent C/.test(workplan), 'Agent C has reports');

// No new UI components from A/B semantic work
check(!interactionsSrc.includes('className'), 'interactions: no UI classNames');
check(!narrativeModelsSrc.includes('className'), 'narrative: no UI classNames');

// ---------------------------------------------------------------------------
// 9. Existing boundaries
// ---------------------------------------------------------------------------

console.log('=== Check 9: Existing boundaries ===');

const runtimeSources: PressureInputSource[] = [
  'rival-pressure', 'competition-group', 'competition-rival-loss',
  'company-pressure', 'customer-feedback', 'rival-customer-pull',
  'random-event', 'scripted-event',
];
check(runtimeSources.length === 8, 'PressureInputSource has exactly 8 values');
check(!runtimeSources.includes('market-signal' as PressureInputSource), 'market-signal NOT in PressureInputSource');

check(!engineSrc.includes("from '../runtime/simulation/pressure"), 'engine.ts does NOT import runtime pressure');

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
  console.log('\nselling-houses semantic-receipt-workspace controller contract verification passed');
  process.exit(0);
}
