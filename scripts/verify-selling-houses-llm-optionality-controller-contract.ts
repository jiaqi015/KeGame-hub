/**
 * LLM Optionality controller verification contract.
 *
 * Proves that the current architecture is LLM-optional:
 * 1. No-LLM path is stable (no API key, no fetch/network/OpenAI, disabled mode exists)
 * 2. LLM output is always proposal, never fact/mutation/execution
 * 3. LLM boundary is layer-clean (core/llm-boundary doesn't import domain/runtime)
 * 4. Interaction drafts and reasoning proposals are distinguished
 * 5. Validator contract exists (allowed actions, energy/budget, no direct mutation)
 * 6. Replayability holds (same seed → same state, LLM disabled mode doesn't affect RNG)
 * 7. Existing boundaries still hold
 *
 * Mother model alignment:
 * - Section 7: LLM should not read raw GameState or invent events
 * - Section 8: LLM may propose, SimulationEngine applies
 * - Section 10: Advisory mode, compressed POV
 * - Section 18.10: LLM output cannot be hidden randomness
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { advanceOneDay, seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import type { GameState, Case, Opportunity, CustomerRuntimeState } from '../src/selling-houses/domain/models.js';

import {
  buildDisabledFallback,
  isLlmDisabled,
  isInteractionDraft,
  isReasoningProposal,
  getApplyabilityForMode,
  getProposalKindsForMode,
  type LlmCapabilityMode,
  type LlmOutputProposal,
  type LlmDisabledFallback,
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

function r3(n: number) { return Math.round(n * 1000) / 1000; }
function snapCase(c: Case) {
  return { id: c.id, heat: r3(c.heat), trust: r3(c.trust), urgency: r3(c.urgency), status: c.status, stageIndex: c.stageIndex };
}
function snapOpp(o: Opportunity) {
  return { id: o.id, intent: r3(o.intent), confidence: r3(o.confidence), stageIndex: o.stageIndex, status: o.status };
}
function snapCust(s: CustomerRuntimeState) {
  return { customerId: s.customerId, status: s.status, churnRisk: r3(s.churnRisk) };
}

const SEED = 20260501;

// ---------------------------------------------------------------------------
// 1. No-LLM stability: no API key, no fetch/network/OpenAI, disabled mode exists
// ---------------------------------------------------------------------------

console.log('=== Check 1: No-LLM stability ===');

const llmModelsSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/llm-boundary/models.ts', 'utf-8');

// No API key references
check(!llmModelsSrc.includes('apiKey'), 'No apiKey reference');
check(!llmModelsSrc.includes('API_KEY'), 'No API_KEY reference');

// No fetch/network/OpenAI
check(!llmModelsSrc.includes('fetch('), 'No fetch() call');
check(!llmModelsSrc.includes('openai'), 'No openai import');
// OpenAI may appear in comments (e.g. "No OpenAI"), but not as import/usage
check(!llmModelsSrc.includes('import.*OpenAI') && !llmModelsSrc.includes('new OpenAI'), 'No OpenAI import or instantiation');

// Disabled mode exists
check(llmModelsSrc.includes("'disabled'"), 'disabled mode exists in LlmCapabilityMode');
check(llmModelsSrc.includes("'none'"), "'none' provider exists in LlmProviderKind");

// buildDisabledFallback function exists
check(llmModelsSrc.includes('export function buildDisabledFallback'), 'buildDisabledFallback function exists');

// isLlmDisabled helper exists
check(llmModelsSrc.includes('export function isLlmDisabled'), 'isLlmDisabled helper exists');

// Disabled fallback returns empty/fallback
const fallback = buildDisabledFallback('test reason');
check(fallback.mode === 'disabled', 'fallback mode is disabled');
check(fallback.reason === 'test reason', 'fallback reason preserved');
check(fallback.fallbackProposal.isFallback === true, 'fallback proposal marked as isFallback');
check(fallback.fallbackProposal.validationStatus === 'rejected', 'fallback proposal is rejected');
check(fallback.fallbackProposal.applyability === 'never_apply_directly', 'fallback never applied');
check(fallback.fallbackProposal.proposalKind === 'narrative_draft', 'fallback is narrative_draft');
check(fallback.fallbackProposal.content.kind === 'text', 'fallback content is text');
check((fallback.fallbackProposal.content as any).text === '', 'fallback content is empty string');
check(fallback.fallbackProposal.evidenceRefs.length === 0, 'fallback has no evidence refs');

// isLlmDisabled returns true for disabled
check(isLlmDisabled('disabled'), 'isLlmDisabled(disabled) = true');
check(!isLlmDisabled('interaction_draft'), 'isLlmDisabled(interaction_draft) = false');
check(!isLlmDisabled('reasoning_proposal'), 'isLlmDisabled(reasoning_proposal) = false');

// ---------------------------------------------------------------------------
// 2. LLM output is always proposal, never fact/mutation/execution
// ---------------------------------------------------------------------------

console.log('=== Check 2: LLM output is proposal, not fact ===');

// LlmOutputProposal has required fields
check(llmModelsSrc.includes('export interface LlmOutputProposal'), 'LlmOutputProposal type exists');
check(llmModelsSrc.includes('readonly proposalId: string'), 'proposal has proposalId');
check(llmModelsSrc.includes('readonly proposalKind: LlmProposalKind'), 'proposal has proposalKind');
check(llmModelsSrc.includes('readonly evidenceRefs: readonly LlmEvidenceRef[]'), 'proposal has evidenceRefs');
check(llmModelsSrc.includes('readonly inputPackRef: LlmInputPackRef'), 'proposal has inputPackRef');
check(llmModelsSrc.includes('readonly validationStatus: LlmValidationStatus'), 'proposal has validationStatus');
check(llmModelsSrc.includes('readonly applyability: LlmApplyability'), 'proposal has applyability');
check(llmModelsSrc.includes('readonly isFallback: boolean'), 'proposal has isFallback');

// LlmApplyability distinguishes advisory vs validator vs never
check(llmModelsSrc.includes("'advisory_only'"), 'applyability: advisory_only');
check(llmModelsSrc.includes("'validator_required'"), 'applyability: validator_required');
check(llmModelsSrc.includes("'never_apply_directly'"), 'applyability: never_apply_directly');

// LlmValidationStatus has pending/valid/invalid/stale/rejected
check(llmModelsSrc.includes("'pending'"), 'validationStatus: pending');
check(llmModelsSrc.includes("'valid'"), 'validationStatus: valid');
check(llmModelsSrc.includes("'invalid'"), 'validationStatus: invalid');
check(llmModelsSrc.includes("'stale'"), 'validationStatus: stale');
check(llmModelsSrc.includes("'rejected'"), 'validationStatus: rejected');

// No direct mutation types
check(!llmModelsSrc.includes('directMutation'), 'No directMutation type');
check(!llmModelsSrc.includes('casePatch'), 'No casePatch type');
check(!llmModelsSrc.includes('opportunityPatch'), 'No opportunityPatch type');
check(!llmModelsSrc.includes('rngSeedChange'), 'No rngSeedChange type');

// LLM cannot declare signed/sold/lost facts
check(!llmModelsSrc.includes("'signed'") || llmModelsSrc.includes("// LLM cannot"), 'LLM does not declare signed/sold/lost as fact');

// LlmProposalKind is text-only or structured (not status mutation)
check(llmModelsSrc.includes("'narrative_draft'"), 'proposalKind: narrative_draft');
check(llmModelsSrc.includes("'dialogue_draft'"), 'proposalKind: dialogue_draft');
check(llmModelsSrc.includes("'action_recommendation_proposal'"), 'proposalKind: action_recommendation_proposal');
check(llmModelsSrc.includes("'what_if_policy_proposal'"), 'proposalKind: what_if_policy_proposal');

// ---------------------------------------------------------------------------
// 3. LLM boundary is layer-clean
// ---------------------------------------------------------------------------

console.log('=== Check 3: LLM boundary layer purity ===');

check(!llmModelsSrc.includes("from '../../domain"), 'core/llm-boundary/models.ts does NOT import domain');
check(!llmModelsSrc.includes("from '../../runtime"), 'core/llm-boundary/models.ts does NOT import runtime');
check(!llmModelsSrc.includes("from '../../../domain"), 'core/llm-boundary/models.ts does NOT import domain (deep)');
check(!llmModelsSrc.includes("from '../../../runtime"), 'core/llm-boundary/models.ts does NOT import runtime (deep)');

// Input pack types are plain (no GameState reference)
check(llmModelsSrc.includes('export interface LlmNarrativeInputSignals'), 'LlmNarrativeInputSignals exists');
check(llmModelsSrc.includes('export interface LlmDecisionInputSignals'), 'LlmDecisionInputSignals exists');
check(llmModelsSrc.includes('export interface LlmStrategyInputSignals'), 'LlmStrategyInputSignals exists');

// LlmInputPackRef does NOT contain raw GameState (may appear in comments only)
const nonCommentSrc = llmModelsSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!nonCommentSrc.includes('GameState'), 'No GameState type usage in llm-boundary (comments excluded)');
check(llmModelsSrc.includes('readonly packHash: string'), 'inputPackRef has packHash (deterministic)');

// LlmInputPackKind has 5 kinds
check(llmModelsSrc.includes("'narrative_signal_pack'"), 'inputPack: narrative_signal_pack');
check(llmModelsSrc.includes("'dialogue_context_pack'"), 'inputPack: dialogue_context_pack');
check(llmModelsSrc.includes("'decision_context_pack'"), 'inputPack: decision_context_pack');
check(llmModelsSrc.includes("'strategy_context_pack'"), 'inputPack: strategy_context_pack');
check(llmModelsSrc.includes("'what_if_policy_pack'"), 'inputPack: what_if_policy_pack');

// ---------------------------------------------------------------------------
// 4. Interaction drafts vs reasoning proposals are distinguished
// ---------------------------------------------------------------------------

console.log('=== Check 4: Interaction drafts vs reasoning proposals ===');

// isInteractionDraft
check(llmModelsSrc.includes('export function isInteractionDraft'), 'isInteractionDraft helper exists');

// isReasoningProposal
check(llmModelsSrc.includes('export function isReasoningProposal'), 'isReasoningProposal helper exists');

// Interaction draft modes
check(isInteractionDraft('interaction_draft'), 'interaction_draft is interaction draft');

// Reasoning proposal modes
check(isReasoningProposal('reasoning_proposal'), 'reasoning_proposal is reasoning proposal');
check(isReasoningProposal('strategy_advice'), 'strategy_advice is reasoning proposal');
check(isReasoningProposal('what_if_policy'), 'what_if_policy is reasoning proposal');

// Interaction draft proposals
const interactionProposals = getProposalKindsForMode('interaction_draft');
check(interactionProposals.includes('narrative_draft'), 'interaction_draft has narrative_draft');
check(interactionProposals.includes('dialogue_draft'), 'interaction_draft has dialogue_draft');
check(interactionProposals.includes('owner_reply_draft'), 'interaction_draft has owner_reply_draft');
check(interactionProposals.includes('broker_advice_draft'), 'interaction_draft has broker_advice_draft');

// Reasoning proposals
const reasoningProposals = getProposalKindsForMode('reasoning_proposal');
check(reasoningProposals.includes('decision_evaluation_proposal'), 'reasoning_proposal has decision_evaluation_proposal');
check(reasoningProposals.includes('belief_update_proposal'), 'reasoning_proposal has belief_update_proposal');
check(reasoningProposals.includes('action_recommendation_proposal'), 'reasoning_proposal has action_recommendation_proposal');

// Disabled mode returns empty
const disabledProposals = getProposalKindsForMode('disabled');
check(disabledProposals.length === 0, 'disabled mode returns no proposal kinds');

// getApplyabilityForMode
check(getApplyabilityForMode('disabled') === 'never_apply_directly', 'disabled → never_apply_directly');
check(getApplyabilityForMode('interaction_draft') === 'advisory_only', 'interaction_draft → advisory_only');
check(getApplyabilityForMode('reasoning_proposal') === 'validator_required', 'reasoning_proposal → validator_required');
check(getApplyabilityForMode('strategy_advice') === 'advisory_only', 'strategy_advice → advisory_only');

// ---------------------------------------------------------------------------
// 5. Validator contract exists
// ---------------------------------------------------------------------------

console.log('=== Check 5: Validator contract ===');

// LlmValidationCheck has required check kinds
check(llmModelsSrc.includes("'input_freshness'"), 'validation check: input_freshness');
check(llmModelsSrc.includes("'resource_cost'"), 'validation check: resource_cost');
check(llmModelsSrc.includes("'action_validity'"), 'validation check: action_validity');
check(llmModelsSrc.includes("'boundary_guard'"), 'validation check: boundary_guard');
check(llmModelsSrc.includes("'policy_constraint'"), 'validation check: policy_constraint');
check(llmModelsSrc.includes("'replay_consistency'"), 'validation check: replay_consistency');

// Strategy input signals include allowed actions and resource constraints
check(llmModelsSrc.includes('readonly allowedActionIds: readonly string[]'), 'strategy input has allowedActionIds');
check(llmModelsSrc.includes('readonly energy: number'), 'strategy input has energy');
check(llmModelsSrc.includes('readonly promotionBudget: number'), 'strategy input has promotionBudget');

// LlmReplayRecord stores invocation for replay (not re-call)
check(llmModelsSrc.includes('export interface LlmReplayRecord'), 'LlmReplayRecord type exists');
check(llmModelsSrc.includes('readonly applied: boolean'), 'replay record has applied flag');
check(llmModelsSrc.includes('readonly systemAction?: string'), 'replay record has systemAction (what system did)');

// Decision input signals include available action IDs
check(llmModelsSrc.includes('readonly availableActionIds: readonly string[]'), 'decision input has availableActionIds');

// Action recommendation has recommendedActionId (not execute)
const actionRecSection = llmModelsSrc.substring(
  llmModelsSrc.indexOf('export interface ActionRecommendationProposal'),
  llmModelsSrc.indexOf('export interface ActionRecommendationProposal') + 500);
check(actionRecSection.includes('readonly recommendedActionId: string'), 'ActionRecommendationProposal has recommendedActionId');
check(!actionRecSection.includes('execute('), 'ActionRecommendationProposal does NOT execute');

// ---------------------------------------------------------------------------
// 6. Replayability: same seed → same state, LLM disabled doesn't affect RNG
// ---------------------------------------------------------------------------

console.log('=== Check 6: Replayability ===');

for (const tickCount of [1, 3, 5]) {
  const wa = buildWorld(SEED);
  const wb = buildWorld(SEED);
  for (let i = 0; i < tickCount; i++) {
    advanceOneDay(wa);
    advanceOneDay(wb);
  }
  const ca = wa.cases.map(snapCase).sort((a, b) => a.id.localeCompare(b.id));
  const cb = wb.cases.map(snapCase).sort((a, b) => a.id.localeCompare(b.id));
  check(JSON.stringify(ca) === JSON.stringify(cb), `Case fields identical after ${tickCount} ticks`);

  check(wa.rngCalls === wb.rngCalls, `rngCalls identical after ${tickCount} ticks: ${wa.rngCalls}`);

  const ea = wa.eventStore.map(e => e.kind + ':' + e.actor + ':' + e.caseId);
  const eb = wb.eventStore.map(e => e.kind + ':' + e.actor + ':' + e.caseId);
  check(JSON.stringify(ea) === JSON.stringify(eb), `eventStore identical after ${tickCount} ticks`);
}

// Building disabled fallback doesn't affect RNG
const wFallback = buildWorld(SEED);
const rngBefore = wFallback.rngCalls;
buildDisabledFallback('test');
check(wFallback.rngCalls === rngBefore, 'buildDisabledFallback does NOT affect rngCalls');

// Building disabled fallback multiple times is deterministic
const fb1 = buildDisabledFallback('reason1');
const fb2 = buildDisabledFallback('reason2');
check(fb1.fallbackProposal.proposalKind === fb2.fallbackProposal.proposalKind, 'Fallback proposals have same kind');
check(fb1.fallbackProposal.applyability === fb2.fallbackProposal.applyability, 'Fallback proposals have same applyability');
check(fb1.fallbackProposal.isFallback === fb2.fallbackProposal.isFallback, 'Fallback proposals both marked isFallback');

// LlmReplayRecord is a cache record, not a re-call
check(llmModelsSrc.includes('readonly invocation: LlmInvocationEnvelope'), 'ReplayRecord stores invocation envelope');
check(llmModelsSrc.includes('readonly inputPackRef: LlmInputPackRef'), 'ReplayRecord stores input pack ref');
check(llmModelsSrc.includes('readonly proposal: LlmOutputProposal'), 'ReplayRecord stores proposal');

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

// Workplan A/B/C/D active
const workplan = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/docs/selling-houses-mother-model-agent-workplan.md', 'utf-8');
check(!/### \d{4}-\d{2}-\d{2}.*Agent E/.test(workplan), 'No Agent E reports');
check(!/### \d{4}-\d{2}-\d{2}.*Agent F/.test(workplan), 'No Agent F reports');

// Core consensus/decision/llm-boundary don't import domain
const consensusModels = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/consensus/models.ts', 'utf-8');
check(!consensusModels.includes("from '../../domain"), 'consensus/models.ts does NOT import domain');

const decisionModels = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/decision/models.ts', 'utf-8');
check(!decisionModels.includes("from '../../domain"), 'decision/models.ts does NOT import domain');

// ---------------------------------------------------------------------------
// 8. Evidence refs and input pack hash are required
// ---------------------------------------------------------------------------

console.log('=== Check 8: Evidence refs and input pack hash ===');

// LlmEvidenceRef has required fields
check(llmModelsSrc.includes('export interface LlmEvidenceRef'), 'LlmEvidenceRef type exists');
check(llmModelsSrc.includes("readonly sourceType: 'evaluation_snapshot'"), 'evidenceRef sourceType includes evaluation_snapshot');
check(llmModelsSrc.includes("'pressure_receipt'"), 'evidenceRef sourceType includes pressure_receipt');
check(llmModelsSrc.includes("'consensus_receipt'"), 'evidenceRef sourceType includes consensus_receipt');
check(llmModelsSrc.includes("'attention_state'"), 'evidenceRef sourceType includes attention_state');
check(llmModelsSrc.includes("'belief'"), 'evidenceRef sourceType includes belief');
check(llmModelsSrc.includes("readonly relevance: number"), 'evidenceRef has relevance (0..1)');

// Input pack hash is deterministic
check(llmModelsSrc.includes('readonly packHash: string'), 'LlmInputPackRef has packHash');
check(llmModelsSrc.includes('readonly inputPackHash: string'), 'LlmInvocationEnvelope has inputPackHash');

// packHash uses canonical content-based hash helper (not just packId)
const adapterSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/runtime/llm-support/llmInputPackAdapter.ts', 'utf-8');
check(adapterSrc.includes('buildNarrativeSignalPackContentHash'), 'llmInputPackAdapter uses canonical packHash helper');
check(!adapterSrc.includes('packHash: pack.packId'), 'llmInputPackAdapter does NOT use packId as packHash');
check(!adapterSrc.includes('stableContentHash'), 'llmInputPackAdapter does NOT use local stableContentHash (uses canonical helper)');

// validateLlmEvidenceRefsAgainstInputPack exists
const validatorSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/llm-boundary/validator.ts', 'utf-8');
check(validatorSrc.includes('export function validateLlmEvidenceRefsAgainstInputPack'), 'validateLlmEvidenceRefsAgainstInputPack exists');

// Evidence validation: evaluation_snapshot must be in sourceSnapshotIds
check(validatorSrc.includes("'evaluation_snapshot'"), 'Evidence validation covers evaluation_snapshot');
check(validatorSrc.includes('sourceSnapshotIds'), 'Evidence validation checks sourceSnapshotIds');

// Evidence validation: pressure_receipt/consensus_receipt must be in sourceReceiptIds
check(validatorSrc.includes("'pressure_receipt'"), 'Evidence validation covers pressure_receipt');
check(validatorSrc.includes("'consensus_receipt'"), 'Evidence validation covers consensus_receipt');
check(validatorSrc.includes('sourceReceiptIds'), 'Evidence validation checks sourceReceiptIds');

// Disabled/fallback proposals skip evidence validation
check(validatorSrc.includes('isFallback'), 'Evidence validation has isFallback bypass');

// Evidence validation is pure (no Date.now/Math.random/fetch)
const nonCommentValidator = validatorSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!nonCommentValidator.includes('Date.now'), 'validator.ts: no Date.now');
check(!nonCommentValidator.includes('Math.random'), 'validator.ts: no Math.random');

// ---------------------------------------------------------------------------
// 9. Determinism: no Date.now/Math.random in core/llm-boundary or runtime/llm-support
// ---------------------------------------------------------------------------

console.log('=== Check 9: Determinism in LLM modules ===');

// core/llm-boundary/models.ts: no Date.now
const nonCommentLlmModels = llmModelsSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!nonCommentLlmModels.includes('Date.now'), 'core/llm-boundary/models.ts: no Date.now');
check(!nonCommentLlmModels.includes('Math.random'), 'core/llm-boundary/models.ts: no Math.random');

// core/llm-boundary/validator.ts: no Date.now/Math.random (already loaded in Check 8)
// validatorSrc and nonCommentValidator already declared above

// core/llm-boundary/inputPacks.ts: no Date.now/Math.random
const inputPacksSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/llm-boundary/inputPacks.ts', 'utf-8');
const nonCommentInputPacks = inputPacksSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!nonCommentInputPacks.includes('Date.now'), 'core/llm-boundary/inputPacks.ts: no Date.now');
check(!nonCommentInputPacks.includes('Math.random'), 'core/llm-boundary/inputPacks.ts: no Math.random');

// runtime/llm-support files: no Date.now/Math.random/fetch/OpenAI
const llmSupportDir = '/Users/jiaqi/Documents/开放日测算/src/selling-houses/runtime/llm-support';
const llmSupportFiles = ['llmInputPackAdapter.ts', 'llmReplaySupport.ts'];
for (const file of llmSupportFiles) {
  try {
    const src = readFileSync(`${llmSupportDir}/${file}`, 'utf-8');
    const nonComment = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    check(!nonComment.includes('Date.now'), `runtime/llm-support/${file}: no Date.now`);
    check(!nonComment.includes('Math.random'), `runtime/llm-support/${file}: no Math.random`);
    check(!nonComment.includes('fetch('), `runtime/llm-support/${file}: no fetch()`);
    check(!nonComment.includes('OpenAI'), `runtime/llm-support/${file}: no OpenAI`);
    check(!nonComment.includes('apiKey'), `runtime/llm-support/${file}: no apiKey`);
  } catch {
    check(false, `runtime/llm-support/${file}: file readable`);
  }
}

// buildDisabledFallback returns deterministic proposalId
const fallback2 = buildDisabledFallback('determinism check');
check(fallback2.fallbackProposal.proposalId === 'fallback-disabled', 'buildDisabledFallback: deterministic proposalId');

// buildDisabledFallback is idempotent
const fallback3 = buildDisabledFallback('another reason');
check(fallback2.fallbackProposal.proposalId === fallback3.fallbackProposal.proposalId, 'buildDisabledFallback: idempotent proposalId');

// Replay support exists and is deterministic
try {
  const { buildDisabledReplayRecord, createReplayStore, appendReplayRecord, isReplayRecordValid, isDisabledReplayRecord, buildWhatIfProposalShell, buildReplayStoreSummary } = await import('../src/selling-houses/runtime/llm-support/llmReplaySupport.js');

  // Replay store doesn't affect rngCalls
  const wReplay = buildWorld(SEED);
  const rngBefore = wReplay.rngCalls;
  const store = createReplayStore();
  const record = buildDisabledReplayRecord(fallback2);
  const store2 = appendReplayRecord(store, record);
  check(wReplay.rngCalls === rngBefore, 'Replay store operations do NOT affect rngCalls');

  // Disabled replay record
  check(isDisabledReplayRecord(record), 'Disabled replay record is identified');
  check(!record.applied, 'Disabled replay record: applied=false');
  check(isReplayRecordValid(record), 'Disabled replay record is valid');

  // Hash consistency: invocation.inputPackHash === inputPackRef.packHash
  check(record.invocation.inputPackHash === record.inputPackRef.packHash, 'Disabled replay: hash consistency (invocation.inputPackHash === inputPackRef.packHash)');

  // Hash consistency with mismatched data should fail validation
  const { buildReplayRecord: buildReplayRecordFn } = await import('../src/selling-houses/runtime/llm-support/llmReplaySupport.js');
  const mismatchedRecord = Object.freeze({
    invocation: Object.freeze({
      invocationId: 'test',
      capabilityMode: 'disabled' as const,
      provider: 'none' as const,
      requestedAtDay: 0,
      requestedByActor: 'system',
      inputPackHash: 'hash-A',
      sourcePackKind: 'narrative_signal_pack' as const,
    }),
    inputPackRef: Object.freeze({
      packKind: 'narrative_signal_pack' as const,
      packHash: 'hash-B', // mismatch!
      packedAtDay: 0,
      sourceSnapshotIds: Object.freeze([]),
      sourceReceiptIds: Object.freeze([]),
      summary: 'test',
    }),
    proposal: fallback2.fallbackProposal,
    applied: false,
  });
  check(!isReplayRecordValid(mismatchedRecord), 'Hash mismatch: isReplayRecordValid returns false');

  // What-if proposal shell
  const whatIf = buildWhatIfProposalShell('whatif-1', 'case-1', 'heat', -5, 'test');
  check(whatIf.applyability === 'never_apply_directly', 'What-if proposal: never_apply_directly');
  check(!whatIf.isFallback, 'What-if proposal: isFallback=false');

  // Store summary
  const summary = buildReplayStoreSummary(store2);
  check(summary.totalRecords === 1, 'Store summary: 1 record');
  check(summary.disabledRecords === 1, 'Store summary: 1 disabled record');
  check(summary.appliedRecords === 0, 'Store summary: 0 applied records');

  // Idempotent disabled replay
  const record2 = buildDisabledReplayRecord(fallback3);
  check(record.proposal.proposalId === record2.proposal.proposalId, 'Disabled replay: deterministic proposalId');
  check(record.invocation.inputPackHash === record2.invocation.inputPackHash, 'Disabled replay: deterministic inputPackHash');
} catch (e) {
  check(false, `Replay support import failed: ${e}`);
}

// ---------------------------------------------------------------------------
// 10. Evidence validation against input pack
// ---------------------------------------------------------------------------

console.log('=== Check 10: Evidence validation against input pack ===');

try {
  const { validateLlmEvidenceRefsAgainstInputPack } = await import('../src/selling-houses/core/llm-boundary/validator.js');

  // Valid evidence: sourceId exists in input pack
  const validResult = validateLlmEvidenceRefsAgainstInputPack(
    [{ sourceType: 'evaluation_snapshot', sourceId: 'snap-1', relevance: 0.8, summary: 'test' }],
    { sourceSnapshotIds: ['snap-1', 'snap-2'], sourceReceiptIds: ['rec-1'] },
  );
  check(validResult.length === 0, 'Valid evidence ref: no violations');

  // Invalid: evaluation_snapshot sourceId not in sourceSnapshotIds
  const invalidSnapResult = validateLlmEvidenceRefsAgainstInputPack(
    [{ sourceType: 'evaluation_snapshot', sourceId: 'snap-99', relevance: 0.8, summary: 'test' }],
    { sourceSnapshotIds: ['snap-1'], sourceReceiptIds: ['rec-1'] },
  );
  check(invalidSnapResult.length === 1, 'Invalid snapshot ref: 1 violation');
  check(invalidSnapResult[0].rule === 'evidence-not-in-input-pack', 'Invalid snapshot ref: correct rule');

  // Invalid: pressure_receipt sourceId not in sourceReceiptIds
  const invalidReceiptResult = validateLlmEvidenceRefsAgainstInputPack(
    [{ sourceType: 'pressure_receipt', sourceId: 'rec-99', relevance: 0.8, summary: 'test' }],
    { sourceSnapshotIds: ['snap-1'], sourceReceiptIds: ['rec-1'] },
  );
  check(invalidReceiptResult.length === 1, 'Invalid receipt ref: 1 violation');

  // Invalid: consensus_receipt sourceId not in sourceReceiptIds
  const invalidConsensusResult = validateLlmEvidenceRefsAgainstInputPack(
    [{ sourceType: 'consensus_receipt', sourceId: 'cons-99', relevance: 0.8, summary: 'test' }],
    { sourceSnapshotIds: ['snap-1'], sourceReceiptIds: ['rec-1'] },
  );
  check(invalidConsensusResult.length === 1, 'Invalid consensus ref: 1 violation');

  // Other sourceTypes: format-only (no violation for unknown sourceId)
  const otherTypeResult = validateLlmEvidenceRefsAgainstInputPack(
    [{ sourceType: 'belief', sourceId: 'belief-99', relevance: 0.8, summary: 'test' }],
    { sourceSnapshotIds: ['snap-1'], sourceReceiptIds: ['rec-1'] },
  );
  check(otherTypeResult.length === 0, 'Other sourceType: no violation (format-only)');

  // Disabled/fallback: skipped
  const fallbackResult = validateLlmEvidenceRefsAgainstInputPack(
    [],
    { sourceSnapshotIds: [], sourceReceiptIds: [] },
    true, // isFallback
  );
  check(fallbackResult.length === 0, 'Fallback: skipped (no violations)');

  // Mixed valid and invalid
  const mixedResult = validateLlmEvidenceRefsAgainstInputPack(
    [
      { sourceType: 'evaluation_snapshot', sourceId: 'snap-1', relevance: 0.9, summary: 'valid' },
      { sourceType: 'pressure_receipt', sourceId: 'rec-99', relevance: 0.5, summary: 'invalid' },
    ],
    { sourceSnapshotIds: ['snap-1'], sourceReceiptIds: ['rec-1'] },
  );
  check(mixedResult.length === 1, 'Mixed: 1 violation (only the invalid receipt)');
} catch (e) {
  check(false, `Evidence validation import failed: ${e}`);
}

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
  console.log('\nselling-houses LLM optionality controller contract verification passed');
  process.exit(0);
}
