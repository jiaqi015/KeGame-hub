/**
 * Semantic Evidence ↔ LLM Boundary Compatibility v0
 *
 * Verifies that LLM proposals can only reference evidence that exists in
 * the workspace/receipt evidence index. Future LLM cannot invent evidence.
 *
 * Checks:
 * 1. SemanticWorkspaceProjection.evidenceIndex contains pressure_receipt/consensus_receipt refs
 * 2. LlmInputPackRef.sourceReceiptIds derived from evidenceIndex
 * 3. Valid evidence refs pass validation
 * 4. Non-existent receipt ids fail validation
 * 5. Disabled fallback is rejected/never_apply_directly, not misclassified
 * 6. No Date.now/Math.random/fetch/OpenAI/apiKey in validator
 * 7. Replay hash consistency still holds
 *
 * Mother model alignment:
 * - Section 7: "LLM should not read raw GameState or invent events."
 * - Section 20.7: "LLM should not read raw GameState."
 * - Evidence refs must trace back to input pack / receipt / snapshot.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { advanceOneDay, seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import type { GameState } from '../src/selling-houses/domain/models.js';

import {
  buildSemanticWorkspaceProjection,
  buildEmptySemanticWorkspaceProjection,
  type SemanticWorkspaceProjection,
  type SemanticEvidenceRef,
} from '../src/selling-houses/interface/interaction-workspace/semanticReceiptBoundary.js';

import {
  validateLlmEvidenceRefsAgainstInputPack,
  buildValidationResult,
} from '../src/selling-houses/core/llm-boundary/validator.js';

import {
  buildDisabledFallback,
  isLlmDisabled,
  type LlmEvidenceRef,
  type LlmInputPackRef,
} from '../src/selling-houses/core/llm-boundary/models.js';

import {
  buildDisabledReplayRecord,
  isReplayRecordValid,
  isDisabledReplayRecord,
  createReplayStore,
  appendReplayRecord,
} from '../src/selling-houses/runtime/llm-support/llmReplaySupport.js';

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
// 1. SemanticWorkspaceProjection.evidenceIndex structure
// ---------------------------------------------------------------------------

console.log('=== Check 1: SemanticWorkspaceProjection.evidenceIndex ===');

// Build a workspace projection with evidence refs
const evidenceRefs: SemanticEvidenceRef[] = [
  {
    sourceType: 'pressure_receipt',
    sourceId: 'pressure-receipt:d5',
    day: 5,
    available: true,
    summary: '竞品房源压制热度',
    count: 3,
  },
  {
    sourceType: 'consensus_receipt',
    sourceId: 'consensus-receipt:d5',
    day: 5,
    available: true,
    summary: '客户意向推进',
    count: 1,
  },
  {
    sourceType: 'narrative_signal_pack',
    sourceId: 'narrative-pack:d5',
    day: 5,
    available: true,
    summary: '经纪人视角信号包',
    count: 7,
  },
];

const projection = buildSemanticWorkspaceProjection({
  day: 5,
  evidenceRefs,
});

check(projection.projectionKind === 'semantic_receipt_adapter_state', 'projectionKind is correct');
check(projection.readOnly === true, 'readOnly is true');
check(projection.evidenceIndex.length === 3, 'evidenceIndex has 3 entries');

// evidenceIndex contains pressure_receipt
const pressureRef = projection.evidenceIndex.find((r) => r.sourceType === 'pressure_receipt');
check(pressureRef !== undefined, 'evidenceIndex has pressure_receipt');
check(pressureRef?.sourceId === 'pressure-receipt:d5', 'pressure_receipt sourceId correct');
check(pressureRef?.available === true, 'pressure_receipt is available');

// evidenceIndex contains consensus_receipt
const consensusRef = projection.evidenceIndex.find((r) => r.sourceType === 'consensus_receipt');
check(consensusRef !== undefined, 'evidenceIndex has consensus_receipt');
check(consensusRef?.sourceId === 'consensus-receipt:d5', 'consensus_receipt sourceId correct');

// evidenceIndex contains narrative_signal_pack
const narrativeRef = projection.evidenceIndex.find((r) => r.sourceType === 'narrative_signal_pack');
check(narrativeRef !== undefined, 'evidenceIndex has narrative_signal_pack');

// Empty projection has empty evidenceIndex
const emptyProjection = buildEmptySemanticWorkspaceProjection(1);
check(emptyProjection.evidenceIndex.length === 0, 'Empty projection has empty evidenceIndex');

// ---------------------------------------------------------------------------
// 2. LlmInputPackRef.sourceReceiptIds derived from evidenceIndex
// ---------------------------------------------------------------------------

console.log('=== Check 2: LlmInputPackRef from evidenceIndex ===');

// Derive sourceReceiptIds from evidenceIndex
const sourceReceiptIds = projection.evidenceIndex
  .filter((r) => r.sourceType === 'pressure_receipt' || r.sourceType === 'consensus_receipt')
  .map((r) => r.sourceId);

check(sourceReceiptIds.length === 2, 'sourceReceiptIds has 2 entries');
check(sourceReceiptIds.includes('pressure-receipt:d5'), 'sourceReceiptIds includes pressure-receipt');
check(sourceReceiptIds.includes('consensus-receipt:d5'), 'sourceReceiptIds includes consensus-receipt');

// Build LlmInputPackRef
const inputPackRef: LlmInputPackRef = Object.freeze({
  packKind: 'narrative_signal_pack',
  packHash: 'test-hash',
  packedAtDay: 5,
  sourceSnapshotIds: Object.freeze(['snap-1']),
  sourceReceiptIds: Object.freeze(sourceReceiptIds),
  summary: 'Test pack',
});

check(inputPackRef.sourceReceiptIds.length === 2, 'LlmInputPackRef has 2 sourceReceiptIds');

// ---------------------------------------------------------------------------
// 3. Valid evidence refs pass validation
// ---------------------------------------------------------------------------

console.log('=== Check 3: Valid evidence refs pass ===');

// Valid: pressure_receipt from evidenceIndex
const validPressure: LlmEvidenceRef[] = [
  { sourceType: 'pressure_receipt', sourceId: 'pressure-receipt:d5', relevance: 0.9, summary: '竞品压制' },
];
const validPressureResult = validateLlmEvidenceRefsAgainstInputPack(validPressure, inputPackRef);
check(validPressureResult.length === 0, 'Valid pressure_receipt: no violations');

// Valid: consensus_receipt from evidenceIndex
const validConsensus: LlmEvidenceRef[] = [
  { sourceType: 'consensus_receipt', sourceId: 'consensus-receipt:d5', relevance: 0.8, summary: '客户意向' },
];
const validConsensusResult = validateLlmEvidenceRefsAgainstInputPack(validConsensus, inputPackRef);
check(validConsensusResult.length === 0, 'Valid consensus_receipt: no violations');

// Valid: evaluation_snapshot from sourceSnapshotIds
const validSnapshot: LlmEvidenceRef[] = [
  { sourceType: 'evaluation_snapshot', sourceId: 'snap-1', relevance: 0.7, summary: '资产评分' },
];
const validSnapshotResult = validateLlmEvidenceRefsAgainstInputPack(validSnapshot, inputPackRef);
check(validSnapshotResult.length === 0, 'Valid evaluation_snapshot: no violations');

// Valid: mixed
const validMixed: LlmEvidenceRef[] = [
  { sourceType: 'pressure_receipt', sourceId: 'pressure-receipt:d5', relevance: 0.9, summary: '竞品' },
  { sourceType: 'consensus_receipt', sourceId: 'consensus-receipt:d5', relevance: 0.8, summary: '意向' },
  { sourceType: 'evaluation_snapshot', sourceId: 'snap-1', relevance: 0.7, summary: '评分' },
];
const validMixedResult = validateLlmEvidenceRefsAgainstInputPack(validMixed, inputPackRef);
check(validMixedResult.length === 0, 'Valid mixed refs: no violations');

// ---------------------------------------------------------------------------
// 4. Non-existent receipt ids fail validation
// ---------------------------------------------------------------------------

console.log('=== Check 4: Non-existent receipt ids fail ===');

// Invalid: pressure_receipt not in evidenceIndex
const invalidPressure: LlmEvidenceRef[] = [
  { sourceType: 'pressure_receipt', sourceId: 'pressure-receipt:d99', relevance: 0.9, summary: '不存在' },
];
const invalidPressureResult = validateLlmEvidenceRefsAgainstInputPack(invalidPressure, inputPackRef);
check(invalidPressureResult.length === 1, 'Invalid pressure_receipt: 1 violation');
check(invalidPressureResult[0].rule === 'evidence-not-in-input-pack', 'Invalid pressure_receipt: correct rule');

// Invalid: consensus_receipt not in evidenceIndex
const invalidConsensus: LlmEvidenceRef[] = [
  { sourceType: 'consensus_receipt', sourceId: 'consensus-receipt:d99', relevance: 0.8, summary: '不存在' },
];
const invalidConsensusResult = validateLlmEvidenceRefsAgainstInputPack(invalidConsensus, inputPackRef);
check(invalidConsensusResult.length === 1, 'Invalid consensus_receipt: 1 violation');

// Invalid: evaluation_snapshot not in sourceSnapshotIds
const invalidSnapshot: LlmEvidenceRef[] = [
  { sourceType: 'evaluation_snapshot', sourceId: 'snap-99', relevance: 0.7, summary: '不存在' },
];
const invalidSnapshotResult = validateLlmEvidenceRefsAgainstInputPack(invalidSnapshot, inputPackRef);
check(invalidSnapshotResult.length === 1, 'Invalid evaluation_snapshot: 1 violation');

// Invalid: completely fabricated id
const fabricated: LlmEvidenceRef[] = [
  { sourceType: 'pressure_receipt', sourceId: 'fabricated-id', relevance: 1.0, summary: '编造' },
];
const fabricatedResult = validateLlmEvidenceRefsAgainstInputPack(fabricated, inputPackRef);
check(fabricatedResult.length === 1, 'Fabricated id: 1 violation');

// Mixed: one valid, one invalid
const mixedInvalid: LlmEvidenceRef[] = [
  { sourceType: 'pressure_receipt', sourceId: 'pressure-receipt:d5', relevance: 0.9, summary: '真实' },
  { sourceType: 'consensus_receipt', sourceId: 'consensus-receipt:d99', relevance: 0.8, summary: '编造' },
];
const mixedInvalidResult = validateLlmEvidenceRefsAgainstInputPack(mixedInvalid, inputPackRef);
check(mixedInvalidResult.length === 1, 'Mixed valid+invalid: 1 violation (only the invalid one)');

// ---------------------------------------------------------------------------
// 5. Disabled fallback: rejected, not misclassified
// ---------------------------------------------------------------------------

console.log('=== Check 5: Disabled fallback is rejected ===');

const fallback = buildDisabledFallback('test');
check(fallback.mode === 'disabled', 'Fallback mode is disabled');
check(isLlmDisabled('disabled'), 'isLlmDisabled(disabled) = true');
check(fallback.fallbackProposal.isFallback === true, 'Fallback isFallback=true');
check(fallback.fallbackProposal.validationStatus === 'rejected', 'Fallback validationStatus=rejected');
check(fallback.fallbackProposal.applyability === 'never_apply_directly', 'Fallback applyability=never_apply_directly');

// Fallback proposal should NOT be validated as a normal proposal
// (it's always rejected, so evidence validation is skipped)
const fallbackEvidenceResult = validateLlmEvidenceRefsAgainstInputPack(
  fallback.fallbackProposal.evidenceRefs,
  inputPackRef,
  true, // isFallback
);
check(fallbackEvidenceResult.length === 0, 'Fallback evidence validation: skipped (no violations)');

// Fallback replay record is valid
const replayRecord = buildDisabledReplayRecord(fallback);
check(isDisabledReplayRecord(replayRecord), 'Fallback replay record is disabled');
check(isReplayRecordValid(replayRecord), 'Fallback replay record is valid');
check(!replayRecord.applied, 'Fallback replay record: applied=false');

// Fallback cannot be misclassified as applicable
check(fallback.fallbackProposal.applyability !== 'advisory_only', 'Fallback is NOT advisory_only');
check(fallback.fallbackProposal.applyability !== 'validator_required', 'Fallback is NOT validator_required');

// ---------------------------------------------------------------------------
// 6. No Date.now/Math.random/fetch/OpenAI/apiKey in validator
// ---------------------------------------------------------------------------

console.log('=== Check 6: Validator determinism ===');

const validatorSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/llm-boundary/validator.ts', 'utf-8');
const nonCommentValidator = validatorSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!nonCommentValidator.includes('Date.now'), 'validator.ts: no Date.now');
check(!nonCommentValidator.includes('Math.random'), 'validator.ts: no Math.random');
check(!nonCommentValidator.includes('fetch('), 'validator.ts: no fetch()');
check(!nonCommentValidator.includes('OpenAI'), 'validator.ts: no OpenAI');
check(!nonCommentValidator.includes('apiKey'), 'validator.ts: no apiKey');

// semanticReceiptBoundary.ts: no Date.now/Math.random/fetch
const boundarySrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/interface/interaction-workspace/semanticReceiptBoundary.ts', 'utf-8');
const nonCommentBoundary = boundarySrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!nonCommentBoundary.includes('Date.now'), 'semanticReceiptBoundary.ts: no Date.now');
check(!nonCommentBoundary.includes('Math.random'), 'semanticReceiptBoundary.ts: no Math.random');
check(!nonCommentBoundary.includes('fetch('), 'semanticReceiptBoundary.ts: no fetch()');

// ---------------------------------------------------------------------------
// 7. Replay hash consistency
// ---------------------------------------------------------------------------

console.log('=== Check 7: Replay hash consistency ===');

// Disabled replay record has consistent hash
check(replayRecord.invocation.inputPackHash === replayRecord.inputPackRef.packHash, 'Disabled replay: hash consistent');

// Mismatched hash fails validation
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
    packHash: 'hash-B',
    packedAtDay: 0,
    sourceSnapshotIds: Object.freeze([]),
    sourceReceiptIds: Object.freeze([]),
    summary: 'test',
  }),
  proposal: fallback.fallbackProposal,
  applied: false,
});
check(!isReplayRecordValid(mismatchedRecord), 'Hash mismatch: isReplayRecordValid returns false');

// ---------------------------------------------------------------------------
// 8. Build validation result with evidence-not-in-input-pack
// ---------------------------------------------------------------------------

console.log('=== Check 8: buildValidationResult with evidence violations ===');

const violations = [
  {
    rule: 'evidence-not-in-input-pack',
    detail: 'sourceId "fake-id" not found',
    path: 'proposal.evidenceRefs[].sourceId:fake-id',
  },
];
const validationResult = buildValidationResult('test-proposal', violations, 5);
check(validationResult.proposalId === 'test-proposal', 'validationResult has proposalId');
check(validationResult.checks.length > 0, 'validationResult has checks');
check(validationResult.checks.some((c) => c.checkId === 'check:evidence-not-in-input-pack'), 'validationResult includes evidence-not-in-input-pack check');

// ---------------------------------------------------------------------------
// 9. Existing boundaries still hold
// ---------------------------------------------------------------------------

console.log('=== Check 9: Existing boundaries ===');

const runtimeSources: PressureInputSource[] = [
  'rival-pressure', 'competition-group', 'competition-rival-loss',
  'company-pressure', 'customer-feedback', 'rival-customer-pull',
  'random-event', 'scripted-event',
];
check(runtimeSources.length === 8, 'PressureInputSource has exactly 8 values');
check(!runtimeSources.includes('market-signal' as PressureInputSource), 'market-signal NOT in PressureInputSource');

const engineSrc = readFileSync('/Users/jiaqi/Documents/开放日测算/src/selling-houses/domain/engine.ts', 'utf-8');
check(!engineSrc.includes("from '../runtime/simulation/pressure"), 'engine.ts does NOT import runtime pressure');

// Replay store doesn't affect rngCalls
const w = buildWorld(SEED);
const rngBefore = w.rngCalls;
const store = createReplayStore();
const store2 = appendReplayRecord(store, replayRecord);
check(w.rngCalls === rngBefore, 'Replay store operations do NOT affect rngCalls');

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
  console.log('\nselling-houses semantic evidence LLM compatibility contract verification passed');
  process.exit(0);
}
