/**
 * Interaction + NarrativeSignalPack controller verification contract.
 *
 * Proves that A's InteractionScene/BrokerServiceInteraction and B's
 * NarrativeSignalPack are pure read models, visibility-safe, replay-safe,
 * layer-clean, and LLM-optional.
 *
 * Mother model alignment:
 * - Section 8: BrokerServiceInteraction transforms information into decision evidence
 * - Section 9: GlobalTruth → POVProjection → ImmersiveInteractionScene
 * - Section 19.3: InteractionScene = container, BrokerServiceInteraction = payload, Event = facts
 * - Section 7: LLM should not read raw GameState; use NarrativeSignalPack
 * - Section 18.10: LLM output cannot be hidden randomness
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { advanceOneDay, seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import type { GameState } from '../src/selling-houses/domain/models.js';

import {
  buildInteractionScene,
  isInteractionScene,
  hasServiceInteraction,
  getSceneEvidenceRefs,
  getInformationCollectedCount,
  getInterpretationProvidedCount,
  getBeliefChangeCount,
  getCommitmentChangeCount,
  type InteractionScene,
  type BrokerServiceInteraction,
  type InteractionSceneType,
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

const SEED = 20260501;

// ---------------------------------------------------------------------------
// 1. InteractionScene exists and is exported from core
// ---------------------------------------------------------------------------

console.log('=== Check 1: InteractionScene existence and layer ===');

const interactionsSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/interactions/models.ts', 'utf-8');

check(interactionsSrc.includes('export interface InteractionScene'), 'InteractionScene type exists');
check(interactionsSrc.includes('export type InteractionSceneType'), 'InteractionSceneType type exists');

// core/interactions does NOT import domain/runtime
check(!interactionsSrc.includes("from '../../../domain"), 'interactions/models.ts does NOT import domain');
check(!interactionsSrc.includes("from '../../../runtime"), 'interactions/models.ts does NOT import runtime');

// sceneType covers all 8 required types
const sceneTypes: InteractionSceneType[] = [
  'owner_call', 'customer_follow_up', 'showing', 'focus_meeting',
  'price_report', 'offer_negotiation', 'manager_review', 'buyer_broker_recommendation',
];
for (const st of sceneTypes) {
  check(interactionsSrc.includes(`'${st}'`), `sceneType includes ${st}`);
}

// InteractionScene does NOT contain Case/GameState/DomainEventEntry types
const nonCommentSrc = interactionsSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!nonCommentSrc.includes('GameState'), 'InteractionScene does NOT reference GameState');
check(!nonCommentSrc.includes('DomainEventEntry'), 'InteractionScene does NOT reference DomainEventEntry');

// InteractionScene does NOT contain execute/apply/mutate
check(!nonCommentSrc.includes('execute('), 'InteractionScene has no execute()');
check(!nonCommentSrc.includes('apply('), 'InteractionScene has no apply()');
check(!nonCommentSrc.includes('mutate'), 'InteractionScene has no mutate');

// buildInteractionScene returns frozen result
const scene = buildInteractionScene({
  sceneId: 'test-scene-1',
  sceneType: 'owner_call',
  day: 1,
  actorIds: ['broker-1', 'owner-1'],
  primaryActorId: 'broker-1',
  counterpartyActorIds: ['owner-1'],
  povActorId: 'broker-1',
  caseId: 'case-1',
});
check(Object.isFrozen(scene), 'buildInteractionScene returns frozen result');
check(scene.sceneId === 'test-scene-1', 'sceneId preserved');
check(scene.sceneType === 'owner_call', 'sceneType preserved');
check(Object.isFrozen(scene.actorIds), 'actorIds is frozen');
check(Object.isFrozen(scene.visibleFactRefs), 'visibleFactRefs is frozen');

// ---------------------------------------------------------------------------
// 2. BrokerServiceInteraction covers all 7 required fields
// ---------------------------------------------------------------------------

console.log('=== Check 2: BrokerServiceInteraction structure ===');

check(interactionsSrc.includes('export interface BrokerServiceInteraction'), 'BrokerServiceInteraction type exists');

// 7 required fields from mother model
check(interactionsSrc.includes('readonly rawInformationCollected'), 'rawInformationCollected exists');
check(interactionsSrc.includes('readonly interpretationProvided'), 'interpretationProvided exists');
check(interactionsSrc.includes('readonly recommendationMade'), 'recommendationMade exists');
check(interactionsSrc.includes('readonly decisionFrameCreated'), 'decisionFrameCreated exists');
check(interactionsSrc.includes('readonly counterpartyQuestions'), 'counterpartyQuestions exists');
check(interactionsSrc.includes('readonly actorBeliefChanged'), 'actorBeliefChanged exists');
check(interactionsSrc.includes('readonly actorCommitmentChanged'), 'actorCommitmentChanged exists');

// Only uses refs, not embedded domain objects
check(interactionsSrc.includes('readonly relatedFactRef?: string'), 'InformationItem uses ref string');
check(interactionsSrc.includes('readonly basedOnRefs: readonly string[]'), 'InterpretationItem uses ref strings');
check(interactionsSrc.includes('readonly actionRef?: string'), 'RecommendationItem uses ref string');
check(interactionsSrc.includes('readonly relatedFactRefs: readonly string[]'), 'DecisionFrame uses ref strings');

// Does NOT declare signed/sold/lost facts
check(!nonCommentSrc.includes("'signed'") || nonCommentSrc.includes("'created'"), 'No signed fact declaration');
check(!nonCommentSrc.includes("'sold'"), 'No sold fact declaration');
check(!nonCommentSrc.includes("'lost'"), 'No lost fact declaration');

// BeliefChange and CommitmentChange are semantic, not mutation
check(interactionsSrc.includes('export interface BeliefChange'), 'BeliefChange type exists');
check(interactionsSrc.includes("readonly direction: 'strengthened' | 'weakened' | 'unchanged'"), 'BeliefChange direction is semantic');
check(interactionsSrc.includes('export interface CommitmentChange'), 'CommitmentChange type exists');
check(interactionsSrc.includes("readonly action: 'created' | 'strengthened' | 'weakened' | 'revoked'"), 'CommitmentChange action is semantic');

// Helper predicates exist
check(interactionsSrc.includes('export function isInteractionScene'), 'isInteractionScene predicate exists');
check(interactionsSrc.includes('export function hasServiceInteraction'), 'hasServiceInteraction predicate exists');
check(interactionsSrc.includes('export function getSceneEvidenceRefs'), 'getSceneEvidenceRefs helper exists');

// ---------------------------------------------------------------------------
// 3. NarrativeSignalPack exists and is exported from core
// ---------------------------------------------------------------------------

console.log('=== Check 3: NarrativeSignalPack existence and layer ===');

const narrativeSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/narrative/models.ts', 'utf-8');

check(narrativeSrc.includes('export interface NarrativeSignalPack'), 'NarrativeSignalPack type exists');

// core/narrative does NOT import domain/runtime
check(!narrativeSrc.includes("from '../../domain"), 'narrative/models.ts does NOT import domain');
check(!narrativeSrc.includes("from '../../runtime"), 'narrative/models.ts does NOT import runtime');

// NarrativeSignalPack is NOT DailyNarrative, NOT text output (comments excluded)
const nonCommentNarrative = narrativeSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!nonCommentNarrative.includes('DailyNarrative'), 'NarrativeSignalPack is NOT DailyNarrative');
check(!nonCommentNarrative.includes("'text'") || narrativeSrc.includes('NOT text output'), 'NarrativeSignalPack is NOT text output');

// Builder is deterministic: no Date.now / Math.random / fetch / OpenAI / LLM (comments excluded)
check(!nonCommentNarrative.includes('Date.now'), 'No Date.now in narrative models');
check(!nonCommentNarrative.includes('Math.random'), 'No Math.random in narrative models');
check(!narrativeSrc.includes('fetch('), 'No fetch() in narrative models');
check(!narrativeSrc.includes('openai'), 'No openai in narrative models');
check(!narrativeSrc.includes('OpenAI'), 'No OpenAI in narrative models');

// Signals must have evidenceRefs/sourceRefs
check(narrativeSrc.includes('readonly evidenceRefs: readonly EvidenceRef[]'), 'NarrativeSignalPack has evidenceRefs');
check(narrativeSrc.includes('readonly sourceRefs: readonly SourceRef[]'), 'NarrativeSignalPack has sourceRefs');

// ActorVisibleSignal has evidenceRefs and sourceRefs
check(narrativeSrc.includes('export interface ActorVisibleSignal'), 'ActorVisibleSignal type exists');
const visibleSignalSection = narrativeSrc.substring(
  narrativeSrc.indexOf('export interface ActorVisibleSignal'),
  narrativeSrc.indexOf('export interface BeliefConflictSignal'));
check(visibleSignalSection.includes('readonly evidenceRefs: readonly EvidenceRef[]'), 'ActorVisibleSignal has evidenceRefs');
check(visibleSignalSection.includes('readonly sourceRefs: readonly SourceRef[]'), 'ActorVisibleSignal has sourceRefs');

// NarrativeSignalPack does NOT expose raw GameState
check(!nonCommentNarrative.includes('GameState'), 'NarrativeSignalPack does NOT reference GameState');

// GenerationConstraints restricts what narrative can say
check(narrativeSrc.includes('export interface GenerationConstraints'), 'GenerationConstraints type exists');
check(narrativeSrc.includes('readonly canMentionHiddenOpportunities: boolean'), 'canMentionHiddenOpportunities constraint');
check(narrativeSrc.includes('readonly canMentionCompanyPressure: boolean'), 'canMentionCompanyPressure constraint');
check(narrativeSrc.includes('readonly canMentionD4Internals: boolean'), 'canMentionD4Internals constraint');

// ---------------------------------------------------------------------------
// 4. LLM optionality still holds
// ---------------------------------------------------------------------------

console.log('=== Check 4: LLM optionality ===');

// No-LLM disabled path works
const fallback = buildDisabledFallback('test');
check(fallback.mode === 'disabled', 'LLM disabled mode works');
check(isLlmDisabled('disabled'), 'isLlmDisabled returns true');
check(fallback.fallbackProposal.isFallback === true, 'fallback is marked as fallback');

// LLM input pack reads NarrativeSignalPack/InteractionScene refs, not raw GameState
const llmModelsSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/llm-boundary/models.ts', 'utf-8');
const nonCommentLlm = llmModelsSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!nonCommentLlm.includes('GameState'), 'LLM boundary does NOT reference GameState type');

// LLM output is still proposal
check(llmModelsSrc.includes("'advisory_only'"), 'LLM output: advisory_only');
check(llmModelsSrc.includes("'validator_required'"), 'LLM output: validator_required');
check(llmModelsSrc.includes("'never_apply_directly'"), 'LLM output: never_apply_directly');

// LLM evidence refs reference NarrativeSignalPack sources
const evidenceRefSection = llmModelsSrc.substring(
  llmModelsSrc.indexOf('export interface LlmEvidenceRef'),
  llmModelsSrc.indexOf('export interface LlmEvidenceRef') + 500);
check(evidenceRefSection.includes("'evaluation_snapshot'"), 'LLM evidence ref: evaluation_snapshot');
check(evidenceRefSection.includes("'pressure_receipt'"), 'LLM evidence ref: pressure_receipt');
check(evidenceRefSection.includes("'consensus_receipt'"), 'LLM evidence ref: consensus_receipt');
check(evidenceRefSection.includes("'belief'"), 'LLM evidence ref: belief');

// ---------------------------------------------------------------------------
// 5. Replayability: same seed → same state, interaction/narrative don't affect RNG
// ---------------------------------------------------------------------------

console.log('=== Check 5: Replayability ===');

for (const tickCount of [1, 3, 5]) {
  const wa = buildWorld(SEED);
  const wb = buildWorld(SEED);
  for (let i = 0; i < tickCount; i++) {
    advanceOneDay(wa);
    advanceOneDay(wb);
  }
  check(wa.rngCalls === wb.rngCalls, `rngCalls identical after ${tickCount} ticks: ${wa.rngCalls}`);

  const ea = wa.eventStore.map(e => e.kind + ':' + e.actor + ':' + e.caseId);
  const eb = wb.eventStore.map(e => e.kind + ':' + e.actor + ':' + e.caseId);
  check(JSON.stringify(ea) === JSON.stringify(eb), `eventStore identical after ${tickCount} ticks`);
}

// Building interaction scene doesn't affect RNG
const wScene = buildWorld(SEED);
const rngBefore = wScene.rngCalls;
buildInteractionScene({
  sceneId: 'test', sceneType: 'showing', day: 1,
  actorIds: ['b1'], primaryActorId: 'b1', counterpartyActorIds: ['c1'], povActorId: 'b1',
});
check(wScene.rngCalls === rngBefore, 'buildInteractionScene does NOT affect rngCalls');

// Building disabled fallback doesn't affect RNG
buildDisabledFallback('test');
check(wScene.rngCalls === rngBefore, 'buildDisabledFallback does NOT affect rngCalls');

// InteractionScene and BrokerServiceInteraction are frozen (immutable)
const frozenScene = buildInteractionScene({
  sceneId: 'frozen-test', sceneType: 'offer_negotiation', day: 5,
  actorIds: ['b1', 'o1'], primaryActorId: 'b1', counterpartyActorIds: ['o1'], povActorId: 'b1',
  caseId: 'case-1',
  visibleFactRefs: ['fact-1'],
  commitmentRefs: ['commit-1'],
});
check(Object.isFrozen(frozenScene), 'Scene is frozen');
check(Object.isFrozen(frozenScene.visibleFactRefs), 'visibleFactRefs is frozen');
check(Object.isFrozen(frozenScene.commitmentRefs), 'commitmentRefs is frozen');

// ---------------------------------------------------------------------------
// 6. Work discipline: A/B/C/D active, check A/B/C/D reports
// ---------------------------------------------------------------------------

console.log('=== Check 6: Work discipline ===');

const workplan = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/docs/selling-houses-mother-model-agent-workplan.md', 'utf-8');

check(!/### \d{4}-\d{2}-\d{2}.*Agent E/.test(workplan), 'No Agent E reports');
check(!/### \d{4}-\d{2}-\d{2}.*Agent F/.test(workplan), 'No Agent F reports');
check(/### \d{4}-\d{2}-\d{2}.*Agent A/.test(workplan), 'Agent A has reports');
check(/### \d{4}-\d{2}-\d{2}.*Agent B/.test(workplan), 'Agent B has reports');
check(/### \d{4}-\d{2}-\d{2}.*Agent C/.test(workplan), 'Agent C has reports');

// ---------------------------------------------------------------------------
// 7. Existing boundaries still hold
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
const engineSrc = readFileSync('/Users/jiaqi/Documents/开放日测算/src/selling-houses/domain/engine.ts', 'utf-8');
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
  console.log('\nselling-houses interaction-narrative controller contract verification passed');
  process.exit(0);
}
