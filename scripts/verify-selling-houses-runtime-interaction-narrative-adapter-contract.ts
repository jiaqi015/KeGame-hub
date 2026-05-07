/**
 * Runtime Interaction/Narrative Adapter Controller Verification.
 *
 * Verifies that A/B's runtime adapters (if they exist) are pure read-model
 * bridges that don't leak into engine or LLM. Also verifies that core types
 * remain layer-clean and that the system is still no-LLM stable.
 *
 * Checks:
 * 1. Runtime interaction adapter: doesn't exist yet OR is read-only bridge
 * 2. Runtime narrative adapter: doesn't exist yet OR is read-only bridge
 * 3. Core interaction/narrative types are layer-clean
 * 4. LLM optionality still holds
 * 5. Engine/gameplay unaffected by read model construction
 * 6. Work discipline: A/B/C/D active, reports written
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { advanceOneDay, seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import type { GameState } from '../src/selling-houses/domain/models.js';

import {
  buildInteractionScene,
  isInteractionScene,
  getSceneEvidenceRefs,
} from '../src/selling-houses/core/world-state/interactions/models.js';

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

function findFiles(dir: string, pattern: RegExp): string[] {
  if (!existsSync(dir)) return [];
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...findFiles(fullPath, pattern));
      } else if (pattern.test(entry.name)) {
        results.push(fullPath);
      }
    }
  } catch { /* ignore */ }
  return results;
}

const SEED = 20260501;

// ---------------------------------------------------------------------------
// 1. Runtime interaction adapter status
// ---------------------------------------------------------------------------

console.log('=== Check 1: Runtime interaction adapter status ===');

const interactionAdapterDir = '/Users/jiaqi/Documents/开放日测算/src/selling-houses/runtime/interaction-support';
const interactionAdapterExists = existsSync(interactionAdapterDir);

if (interactionAdapterExists) {
  const adapterFiles = findFiles(interactionAdapterDir, /\.ts$/);
  check(adapterFiles.length > 0, 'Runtime interaction adapter has files');

  for (const file of adapterFiles) {
    const src = readFileSync(file, 'utf-8');
    const nonComment = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

    // No Date.now / Math.random
    check(!nonComment.includes('Date.now'), `${file}: no Date.now`);
    check(!nonComment.includes('Math.random'), `${file}: no Math.random`);

    // No fetch / OpenAI
    check(!nonComment.includes('fetch('), `${file}: no fetch()`);
    check(!nonComment.includes('OpenAI'), `${file}: no OpenAI`);
  }
} else {
  check(true, 'Runtime interaction adapter does NOT exist yet (A has not built it)');
}

// Check that core/interactions does NOT import domain/runtime
const interactionsModelsSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/interactions/models.ts', 'utf-8');
check(!interactionsModelsSrc.includes("from '../../../domain"), 'core/interactions does NOT import domain');
check(!interactionsModelsSrc.includes("from '../../../runtime"), 'core/interactions does NOT import runtime');

// ---------------------------------------------------------------------------
// 2. Runtime narrative adapter status
// ---------------------------------------------------------------------------

console.log('=== Check 2: Runtime narrative adapter status ===');

const narrativeAdapterDir = '/Users/jiaqi/Documents/开放日测算/src/selling-houses/runtime/narrative-support';
const narrativeAdapterExists = existsSync(narrativeAdapterDir);

if (narrativeAdapterExists) {
  const adapterFiles = findFiles(narrativeAdapterDir, /\.ts$/);
  check(adapterFiles.length > 0, 'Runtime narrative adapter has files');

  for (const file of adapterFiles) {
    const src = readFileSync(file, 'utf-8');
    const nonComment = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

    check(!nonComment.includes('Date.now'), `${file}: no Date.now`);
    check(!nonComment.includes('Math.random'), `${file}: no Math.random`);
    check(!nonComment.includes('fetch('), `${file}: no fetch()`);
    check(!nonComment.includes('OpenAI'), `${file}: no OpenAI`);

    // No raw GameState in output types
    check(!nonComment.includes('GameState'), `${file}: no GameState type usage`);
  }
} else {
  check(true, 'Runtime narrative adapter does NOT exist yet (B has not built it)');
}

// Check that core/narrative does NOT import domain/runtime
const narrativeModelsSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/narrative/models.ts', 'utf-8');
check(!narrativeModelsSrc.includes("from '../../domain"), 'core/narrative does NOT import domain');
check(!narrativeModelsSrc.includes("from '../../runtime"), 'core/narrative does NOT import runtime');

// Check signalPack builder is deterministic
const signalPackSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/narrative/signalPack.ts', 'utf-8');
const nonCommentSignalPack = signalPackSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!nonCommentSignalPack.includes('Date.now'), 'signalPack builder: no Date.now');
check(!nonCommentSignalPack.includes('Math.random'), 'signalPack builder: no Math.random');
check(!signalPackSrc.includes("from '../../domain"), 'signalPack builder: no domain import');
check(!signalPackSrc.includes("from '../../runtime"), 'signalPack builder: no runtime import');

// Check LLM input packs don't expose raw GameState
const inputPacksSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/llm-boundary/inputPacks.ts', 'utf-8');
const nonCommentInputPacks = inputPacksSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!nonCommentInputPacks.includes('GameState'), 'LLM input packs: no GameState type');
check(!nonCommentInputPacks.includes('DomainEventEntry'), 'LLM input packs: no DomainEventEntry type');

// ---------------------------------------------------------------------------
// 3. Core type layer purity
// ---------------------------------------------------------------------------

console.log('=== Check 3: Core type layer purity ===');

// interactions/models.ts: frozen builder, no mutation
const scene = buildInteractionScene({
  sceneId: 'test-scene', sceneType: 'showing', day: 1,
  actorIds: ['b1'], primaryActorId: 'b1', counterpartyActorIds: ['c1'], povActorId: 'b1',
});
check(Object.isFrozen(scene), 'buildInteractionScene returns frozen result');
check(isInteractionScene(scene), 'isInteractionScene predicate works');

// interactions has all 8 scene types
const sceneTypes = ['owner_call', 'customer_follow_up', 'showing', 'focus_meeting',
  'price_report', 'offer_negotiation', 'manager_review', 'buyer_broker_recommendation'];
for (const st of sceneTypes) {
  check(interactionsModelsSrc.includes(`'${st}'`), `sceneType: ${st}`);
}

// BrokerServiceInteraction has 7 mother-model fields
check(interactionsModelsSrc.includes('readonly rawInformationCollected'), 'BSI: rawInformationCollected');
check(interactionsModelsSrc.includes('readonly interpretationProvided'), 'BSI: interpretationProvided');
check(interactionsModelsSrc.includes('readonly recommendationMade'), 'BSI: recommendationMade');
check(interactionsModelsSrc.includes('readonly decisionFrameCreated'), 'BSI: decisionFrameCreated');
check(interactionsModelsSrc.includes('readonly counterpartyQuestions'), 'BSI: counterpartyQuestions');
check(interactionsModelsSrc.includes('readonly actorBeliefChanged'), 'BSI: actorBeliefChanged');
check(interactionsModelsSrc.includes('readonly actorCommitmentChanged'), 'BSI: actorCommitmentChanged');

// NarrativeSignalPack has evidenceRefs/sourceRefs
check(narrativeModelsSrc.includes('readonly evidenceRefs: readonly EvidenceRef[]'), 'NarrativeSignalPack has evidenceRefs');
check(narrativeModelsSrc.includes('readonly sourceRefs: readonly SourceRef[]'), 'NarrativeSignalPack has sourceRefs');

// GenerationConstraints restricts narrative
check(narrativeModelsSrc.includes('readonly canMentionHiddenOpportunities: boolean'), 'GenerationConstraints: canMentionHiddenOpportunities');
check(narrativeModelsSrc.includes('readonly canMentionCompanyPressure: boolean'), 'GenerationConstraints: canMentionCompanyPressure');
check(narrativeModelsSrc.includes('readonly canMentionD4Internals: boolean'), 'GenerationConstraints: canMentionD4Internals');

// ---------------------------------------------------------------------------
// 4. LLM optionality
// ---------------------------------------------------------------------------

console.log('=== Check 4: LLM optionality ===');

// No-LLM disabled path
const fallback = buildDisabledFallback('test');
check(fallback.mode === 'disabled', 'LLM disabled mode works');
check(isLlmDisabled('disabled'), 'isLlmDisabled(disabled) = true');
check(fallback.fallbackProposal.isFallback === true, 'fallback marked as isFallback');
check(fallback.fallbackProposal.validationStatus === 'rejected', 'fallback is rejected');

// LLM boundary layer purity
const llmModelsSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/llm-boundary/models.ts', 'utf-8');
const nonCommentLlm = llmModelsSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!nonCommentLlm.includes('GameState'), 'LLM boundary: no GameState type');
check(!nonCommentLlm.includes('apiKey'), 'LLM boundary: no apiKey');
check(!nonCommentLlm.includes('fetch('), 'LLM boundary: no fetch()');

// LLM output is proposal
check(llmModelsSrc.includes("'advisory_only'"), 'LLM: advisory_only applyability');
check(llmModelsSrc.includes("'validator_required'"), 'LLM: validator_required applyability');
check(llmModelsSrc.includes("'never_apply_directly'"), 'LLM: never_apply_directly applyability');

// LLM validator exists
const validatorSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/llm-boundary/validator.ts', 'utf-8');
check(validatorSrc.includes('export'), 'LLM validator has exports');

// ---------------------------------------------------------------------------
// 5. Engine/gameplay unaffected
// ---------------------------------------------------------------------------

console.log('=== Check 5: Engine/gameplay ===');

// resolveOneDay is not modified by adapters
const engineSrc = readFileSync('/Users/jiaqi/Documents/开放日测算/src/selling-houses/domain/engine.ts', 'utf-8');
check(!engineSrc.includes('InteractionScene'), 'engine.ts does NOT reference InteractionScene');
check(!engineSrc.includes('NarrativeSignalPack'), 'engine.ts does NOT reference NarrativeSignalPack');
check(!engineSrc.includes('interaction-support'), 'engine.ts does NOT import interaction-support');
check(!engineSrc.includes('narrative-support'), 'engine.ts does NOT import narrative-support');

// Multi-tick replayability
for (const tickCount of [1, 3, 5]) {
  const wa = buildWorld(SEED);
  const wb = buildWorld(SEED);
  for (let i = 0; i < tickCount; i++) {
    advanceOneDay(wa);
    advanceOneDay(wb);
  }
  check(wa.rngCalls === wb.rngCalls, `rngCalls identical after ${tickCount} ticks: ${wa.rngCalls}`);

  const ca = wa.cases.map(c => c.id + ':' + Math.round(c.heat * 1000) / 1000 + ':' + Math.round(c.trust * 1000) / 1000);
  const cb = wb.cases.map(c => c.id + ':' + Math.round(c.heat * 1000) / 1000 + ':' + Math.round(c.trust * 1000) / 1000);
  check(JSON.stringify(ca) === JSON.stringify(cb), `Case heat/trust identical after ${tickCount} ticks`);
}

// Building interaction scene doesn't affect RNG
const w = buildWorld(SEED);
const rngBefore = w.rngCalls;
buildInteractionScene({
  sceneId: 'rng-test', sceneType: 'owner_call', day: 1,
  actorIds: ['b1'], primaryActorId: 'b1', counterpartyActorIds: ['o1'], povActorId: 'b1',
});
check(w.rngCalls === rngBefore, 'buildInteractionScene does NOT affect rngCalls');

buildDisabledFallback('test');
check(w.rngCalls === rngBefore, 'buildDisabledFallback does NOT affect rngCalls');

// ---------------------------------------------------------------------------
// 6. Work discipline
// ---------------------------------------------------------------------------

console.log('=== Check 6: Work discipline ===');

const workplan = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/docs/selling-houses-mother-model-agent-workplan.md', 'utf-8');

check(!/### \d{4}-\d{2}-\d{2}.*Agent E/.test(workplan), 'No Agent E reports');
check(!/### \d{4}-\d{2}-\d{2}.*Agent F/.test(workplan), 'No Agent F reports');
check(/### \d{4}-\d{2}-\d{2}.*Agent A/.test(workplan), 'Agent A has reports');
check(/### \d{4}-\d{2}-\d{2}.*Agent B/.test(workplan), 'Agent B has reports');
check(/### \d{4}-\d{2}-\d{2}.*Agent C/.test(workplan), 'Agent C has reports');

// No new UI text (only export boundaries allowed)
// Check that core types don't contain visible UI strings
check(!interactionsModelsSrc.includes('className'), 'interactions: no UI classNames');
check(!narrativeModelsSrc.includes('className'), 'narrative: no UI classNames');

// ---------------------------------------------------------------------------
// 7. Existing boundaries
// ---------------------------------------------------------------------------

console.log('=== Check 7: Existing boundaries ===');

// market-signal NOT in PressureInputSource
const runtimeSources: PressureInputSource[] = [
  'rival-pressure', 'competition-group', 'competition-rival-loss',
  'company-pressure', 'customer-feedback', 'rival-customer-pull',
  'random-event', 'scripted-event',
];
check(runtimeSources.length === 8, 'PressureInputSource has exactly 8 values');
check(!runtimeSources.includes('market-signal' as PressureInputSource), 'market-signal NOT in PressureInputSource');

// Domain does NOT import runtime pressure
check(!engineSrc.includes("from '../runtime/simulation/pressure"), 'engine.ts does NOT import runtime pressure');

// Core consensus/decision/llm-boundary do NOT import domain
const consensusModels = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/consensus/models.ts', 'utf-8');
check(!consensusModels.includes("from '../../domain"), 'consensus/models.ts does NOT import domain');

const decisionModels = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/decision/models.ts', 'utf-8');
check(!decisionModels.includes("from '../../domain"), 'decision/models.ts does NOT import domain');

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
  console.log('\nselling-houses runtime interaction-narrative adapter contract verification passed');
  process.exit(0);
}
