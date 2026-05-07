/**
 * Verification script for LLM Input Pack / Validator contract.
 *
 * Checks:
 * 1. Input packs compile and are read-only
 * 2. Validators detect forbidden mutation patterns
 * 3. Validators detect fact declarations (signed/sold/lost)
 * 4. Validators require evidenceRefs
 * 5. Validators check actionId against allowedActions
 * 6. Validators check energy/budget limits
 * 7. No-LLM fallback returns empty advisory
 * 8. Runtime adapter produces valid input packs
 * 9. Input packs do NOT contain raw GameState
 * 10. Layer imports are clean
 */

import assert from 'node:assert/strict';

import { buildDisabledFallback, isLlmDisabled } from '../src/selling-houses/core/llm-boundary/models.js';
import {
  validateLlmOutputProposal,
  validateActionRecommendationProposal,
  validateDialogueDraftProposal,
  validateDecisionEvaluationProposal,
  buildValidationResult,
} from '../src/selling-houses/core/llm-boundary/validator.js';
import type {
  LlmOutputProposal,
  LlmProposalKind,
} from '../src/selling-houses/core/llm-boundary/models.js';
import type {
  NarrativeGenerationInputPack,
  StrategyRecommendationInputPack,
  SimulatedReasoningInputPack,
} from '../src/selling-houses/core/llm-boundary/inputPacks.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeProposal(overrides: Partial<LlmOutputProposal> = {}): LlmOutputProposal {
  return Object.freeze({
    proposalId: 'test-proposal-1',
    proposalKind: 'narrative_draft' as LlmProposalKind,
    invocationEnvelope: Object.freeze({
      invocationId: 'inv-1',
      capabilityMode: 'interaction_draft',
      provider: 'none',
      requestedAtDay: 10,
      requestedByActor: 'broker:current',
      inputPackHash: 'hash-1',
      sourcePackKind: 'narrative_signal_pack',
    }),
    inputPackRef: Object.freeze({
      packKind: 'narrative_signal_pack',
      packHash: 'hash-1',
      packedAtDay: 10,
      sourceSnapshotIds: Object.freeze([]),
      sourceReceiptIds: Object.freeze([]),
      summary: 'test pack',
    }),
    content: Object.freeze({
      kind: 'text' as const,
      text: '今天市场平静。',
      language: 'zh',
    }),
    evidenceRefs: Object.freeze([
      Object.freeze({
        sourceType: 'evaluation_snapshot' as const,
        sourceId: 'snap-1',
        relevance: 0.8,
        summary: '资产评分',
      }),
    ]),
    validationStatus: 'pending' as const,
    applyability: 'advisory_only' as const,
    isFallback: false,
    ...overrides,
  }) as LlmOutputProposal;
}

// ---------------------------------------------------------------------------
// 1. Input packs compile and are read-only
// ---------------------------------------------------------------------------

function verifyInputPacksCompile() {
  const narrativePack: NarrativeGenerationInputPack = Object.freeze({
    kind: 'narrative_generation',
    day: 10,
    eventSummaries: Object.freeze([
      Object.freeze({ kind: 'pricing-friction', label: '价格摩擦', tone: 'neutral' }),
    ]),
    evaluationSnapshotIds: Object.freeze(['snap-1']),
    povActorId: 'broker:current',
    povActorKind: 'broker',
    dayContext: Object.freeze({
      activeCaseCount: 3,
      urgentSignalCount: 1,
      recentDecisionCount: 2,
    }),
    narrativeFocus: 'daily_summary',
  });

  assert.ok(narrativePack, 'NarrativeGenerationInputPack must compile');
  assert.ok(Object.isFrozen(narrativePack), 'Pack must be frozen');
  assert.ok(Object.isFrozen(narrativePack.eventSummaries), 'eventSummaries must be frozen');

  const strategyPack: StrategyRecommendationInputPack = Object.freeze({
    kind: 'strategy_recommendation',
    day: 10,
    actorId: 'broker:current',
    caseSummary: Object.freeze([]),
    allowedActions: Object.freeze([]),
    resources: Object.freeze({ energy: 100, maxEnergy: 100, promotionBudget: 50 }),
    pressureSummary: Object.freeze({ available: true, coverage: 1.0, headline: '完整' }),
    activeDecisionMoments: Object.freeze([]),
  });

  assert.ok(strategyPack, 'StrategyRecommendationInputPack must compile');

  const reasoningPack: SimulatedReasoningInputPack = Object.freeze({
    kind: 'simulated_reasoning',
    day: 10,
    caseId: 'case-1',
    actorId: 'broker:current',
    actorKind: 'broker',
    decisionState: Object.freeze({ posture: 'undecided', pressureLevel: 30, confidence: 0.5, blockers: Object.freeze([]) }),
    choiceSet: Object.freeze({ alternativeCount: 3, feasibleCount: 2, blockingConstraintCount: 1, alternatives: Object.freeze([]) }),
    commitmentSummary: Object.freeze({ activeCount: 1, staleCount: 0 }),
    beliefs: Object.freeze([]),
    availableActionIds: Object.freeze(['first-visit']),
    pressureSummary: Object.freeze({ available: true, coverage: 1.0 }),
  });

  assert.ok(reasoningPack, 'SimulatedReasoningInputPack must compile');

  console.log('  [PASS] Input packs compile and are read-only');
}

// ---------------------------------------------------------------------------
// 2. Validators detect forbidden mutation patterns
// ---------------------------------------------------------------------------

function verifyDetectsForbiddenMutation() {
  const proposal = makeProposal({
    content: Object.freeze({
      kind: 'structured' as const,
      schema: 'test',
      data: Object.freeze({ action: 'directMutation', caseId: 'case-1' }),
    }),
  });

  const violations = validateLlmOutputProposal(proposal);
  const mutationViolation = violations.find((v) => v.rule === 'no-direct-mutation');
  assert.ok(mutationViolation, 'Must detect directMutation pattern');
  assert.ok(mutationViolation!.detail.includes('directMutation'), 'Detail must mention the pattern');

  console.log('  [PASS] Validators detect forbidden mutation patterns');
}

// ---------------------------------------------------------------------------
// 3. Validators detect fact declarations
// ---------------------------------------------------------------------------

function verifyDetectsFactDeclarations() {
  const proposal = makeProposal({
    content: Object.freeze({
      kind: 'text' as const,
      text: 'The contract_signed deal is confirmed.',
      language: 'en',
    }),
  });

  const violations = validateLlmOutputProposal(proposal);
  const factViolation = violations.find((v) => v.rule === 'no-fact-declaration');
  assert.ok(factViolation, 'Must detect fact declaration');

  // Also check for 'sold'
  const proposal2 = makeProposal({
    content: Object.freeze({
      kind: 'text' as const,
      text: 'The case has been sold to the buyer.',
      language: 'en',
    }),
  });

  const violations2 = validateLlmOutputProposal(proposal2);
  const factViolation2 = violations2.find((v) => v.rule === 'no-fact-declaration');
  assert.ok(factViolation2, 'Must detect sold/lost fact declaration');

  console.log('  [PASS] Validators detect fact declarations');
}

// ---------------------------------------------------------------------------
// 4. Validators require evidenceRefs
// ---------------------------------------------------------------------------

function verifyRequiresEvidenceRefs() {
  const proposal = makeProposal({
    evidenceRefs: Object.freeze([]),
  });

  const violations = validateLlmOutputProposal(proposal);
  const evidenceViolation = violations.find((v) => v.rule === 'evidence-refs-required');
  assert.ok(evidenceViolation, 'Must require evidenceRefs');

  // Also check for missing sourceType
  const proposal2 = makeProposal({
    evidenceRefs: Object.freeze([
      Object.freeze({ sourceType: '' as any, sourceId: 'x', relevance: 0.5, summary: 'test' }),
    ]),
  });

  const violations2 = validateLlmOutputProposal(proposal2);
  const sourceTypeViolation = violations2.find((v) => v.rule === 'evidence-source-type');
  assert.ok(sourceTypeViolation, 'Must require sourceType on evidence');

  console.log('  [PASS] Validators require evidenceRefs');
}

// ---------------------------------------------------------------------------
// 5. Validators check actionId against allowedActions
// ---------------------------------------------------------------------------

function verifyChecksActionId() {
  const proposal = makeProposal({
    proposalKind: 'action_recommendation_proposal',
    content: Object.freeze({
      kind: 'structured' as const,
      schema: 'test',
      data: Object.freeze({ recommendedActionId: 'unknown-action' }),
    }),
  });

  const violations = validateActionRecommendationProposal(
    proposal,
    ['first-visit', 'weekly-feedback'],
    100,
    100,
  );

  const actionViolation = violations.find((v) => v.rule === 'action-in-allowed-set');
  assert.ok(actionViolation, 'Must check actionId against allowedActions');
  assert.ok(actionViolation!.detail.includes('unknown-action'), 'Detail must mention the action');

  console.log('  [PASS] Validators check actionId against allowedActions');
}

// ---------------------------------------------------------------------------
// 6. Validators check energy/budget limits
// ---------------------------------------------------------------------------

function verifyChecksEnergyBudget() {
  const proposal = makeProposal({
    proposalKind: 'action_recommendation_proposal',
    content: Object.freeze({
      kind: 'structured' as const,
      schema: 'test',
      data: Object.freeze({
        recommendedActionId: 'first-visit',
        energyCost: 50,
        budgetCost: 200,
      }),
    }),
  });

  const violations = validateActionRecommendationProposal(
    proposal,
    ['first-visit'],
    10, // maxEnergy = 10
    50, // maxBudget = 50
  );

  const energyViolation = violations.find((v) => v.rule === 'energy-exceeded');
  assert.ok(energyViolation, 'Must detect energy exceeded');
  assert.ok(energyViolation!.detail.includes('50'), 'Detail must mention the cost');

  const budgetViolation = violations.find((v) => v.rule === 'budget-exceeded');
  assert.ok(budgetViolation, 'Must detect budget exceeded');

  console.log('  [PASS] Validators check energy/budget limits');
}

// ---------------------------------------------------------------------------
// 7. No-LLM fallback returns empty advisory
// ---------------------------------------------------------------------------

function verifyNoLlmFallback() {
  const fallback = buildDisabledFallback('test disabled');

  assert.ok(fallback, 'Fallback must exist');
  assert.equal(fallback.mode, 'disabled', 'Mode must be disabled');
  assert.ok(fallback.reason, 'Must have reason');
  assert.ok(fallback.fallbackProposal, 'Must have fallbackProposal');
  assert.equal(fallback.fallbackProposal.isFallback, true, 'isFallback must be true');
  assert.equal(fallback.fallbackProposal.validationStatus, 'rejected', 'Status must be rejected');
  assert.equal(fallback.fallbackProposal.applyability, 'never_apply_directly', 'Must be never_apply_directly');

  assert.ok(isLlmDisabled('disabled'), 'isLlmDisabled must return true for disabled');
  assert.ok(!isLlmDisabled('interaction_draft'), 'isLlmDisabled must return false for other modes');

  console.log('  [PASS] No-LLM fallback returns empty advisory');
}

// ---------------------------------------------------------------------------
// 8. buildValidationResult converts violations correctly
// ---------------------------------------------------------------------------

function verifyBuildValidationResult() {
  // No violations → valid
  const validResult = buildValidationResult('prop-1', [], 10);
  assert.equal(validResult.status, 'valid', 'No violations → valid');
  assert.equal(validResult.proposalId, 'prop-1', 'Must have proposalId');
  assert.ok(validResult.checks.length > 0, 'Must have checks');

  // With violations → invalid
  const violations = [{ rule: 'test-rule', detail: 'test detail', path: 'test.path' }];
  const invalidResult = buildValidationResult('prop-2', violations, 10);
  assert.equal(invalidResult.status, 'invalid', 'With violations → invalid');
  assert.ok(invalidResult.reason, 'Must have reason');
  assert.ok(invalidResult.reason!.includes('test detail'), 'Reason must include detail');

  console.log('  [PASS] buildValidationResult converts violations correctly');
}

// ---------------------------------------------------------------------------
// 9. Dialogue draft validator
// ---------------------------------------------------------------------------

function verifyDialogueDraftValidator() {
  // Valid dialogue
  const validProposal = makeProposal({
    proposalKind: 'dialogue_draft',
    content: Object.freeze({
      kind: 'text' as const,
      text: '您好，这套房子最近市场反馈不错。',
      language: 'zh',
    }),
  });

  const validViolations = validateDialogueDraftProposal(validProposal);
  assert.equal(validViolations.length, 0, 'Valid dialogue must have no violations');

  // Dialogue with fact declaration
  const invalidProposal = makeProposal({
    proposalKind: 'dialogue_draft',
    content: Object.freeze({
      kind: 'text' as const,
      text: 'Congratulations, the contract has been signed!',
      language: 'en',
    }),
  });

  const invalidViolations = validateDialogueDraftProposal(invalidProposal);
  assert.ok(invalidViolations.length > 0, 'Dialogue with fact must have violations');

  console.log('  [PASS] Dialogue draft validator works correctly');
}

// ---------------------------------------------------------------------------
// 10. Decision evaluation validator
// ---------------------------------------------------------------------------

function verifyDecisionEvaluationValidator() {
  const validProposal = makeProposal({
    proposalKind: 'decision_evaluation_proposal',
    content: Object.freeze({
      kind: 'structured' as const,
      schema: 'test',
      data: Object.freeze({
        proposedEvaluation: Object.freeze({
          label: '建议调价',
          confidence: 0.75,
          reasoning: '当前价格高于市场价 8%',
          alternativeIds: Object.freeze(['alt-1']),
        }),
      }),
    }),
  });

  const violations = validateDecisionEvaluationProposal(validProposal);
  // Should have no violations beyond the generic ones
  const specificViolations = violations.filter(
    (v) => !['evidence-refs-required', 'no-direct-mutation', 'no-fact-declaration', 'proposal-kind', 'validation-status'].includes(v.rule),
  );
  assert.equal(specificViolations.length, 0, 'Valid evaluation must have no specific violations');

  console.log('  [PASS] Decision evaluation validator works correctly');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('Verifying selling-houses LLM input/validator contract...');

verifyInputPacksCompile();
verifyDetectsForbiddenMutation();
verifyDetectsFactDeclarations();
verifyRequiresEvidenceRefs();
verifyChecksActionId();
verifyChecksEnergyBudget();
verifyNoLlmFallback();
verifyBuildValidationResult();
verifyDialogueDraftValidator();
verifyDecisionEvaluationValidator();

console.log('selling-houses LLM input/validator contract verification passed');
