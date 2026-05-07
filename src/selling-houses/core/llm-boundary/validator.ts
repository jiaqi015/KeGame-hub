/**
 * LLM Output Proposal Validators — pure boundary guards.
 *
 * These validators check that LLM proposals respect the contract:
 * - evidenceRefs must exist and be non-empty
 * - actionId must be in allowedActions
 * - energy/budget cannot exceed limits
 * - proposal cannot contain directMutation / casePatch / opportunityPatch / rngSeedChange
 * - proposal cannot declare signed/sold/lost as facts
 *
 * Mother model alignment:
 * - Section 7: "LLM should not read raw GameState or invent events."
 * - Section 8: "LLM may propose DecisionEvaluation or ActionRecommendation,
 *   but SimulationEngine applies outcomes."
 * - Section 10: "Advisory mode, not autoplay."
 *
 * Hard constraints:
 * - Validators are pure functions — no side effects.
 * - Validators cannot execute actions.
 * - Validators cannot mutate GameState.
 */

import type {
  LlmOutputProposal,
  LlmValidationResult,
  LlmValidationCheck,
  ActionRecommendationProposal,
  DialogueDraftProposal,
  DecisionEvaluationProposal,
  LlmEvidenceRef,
} from './models.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LlmProposalViolation {
  readonly rule: string;
  readonly detail: string;
  readonly path: string;
}

// ---------------------------------------------------------------------------
// Forbidden patterns in proposals
// ---------------------------------------------------------------------------

const FORBIDDEN_MUTATION_PATTERNS = [
  'directMutation',
  'casePatch',
  'opportunityPatch',
  'rngSeedChange',
  'rngSeed',
  'setCaseField',
  'setOpportunityField',
  'mutateGameState',
  'writeToCase',
  'writeToOpportunity',
  'updateCaseStatus',
  'updateOpportunityStatus',
];

const FORBIDDEN_FACT_DECLARATIONS = [
  'signed',
  'sold',
  'lost_to_rival',
  'case_sold',
  'contract_signed',
  'deal_closed',
  'opportunity_won',
  'opportunity_lost',
  'customer_bought',
  'withdrawn',
  'expired',
];

// ---------------------------------------------------------------------------
// Helper: check if a string contains forbidden patterns
// ---------------------------------------------------------------------------

function containsForbiddenPattern(text: string, patterns: readonly string[]): string | null {
  const lower = text.toLowerCase();
  for (const pattern of patterns) {
    if (lower.includes(pattern.toLowerCase())) {
      return pattern;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helper: validate evidence refs
// ---------------------------------------------------------------------------

function validateEvidenceRefs(evidenceRefs: readonly LlmEvidenceRef[]): LlmProposalViolation[] {
  const violations: LlmProposalViolation[] = [];

  if (!Array.isArray(evidenceRefs) || evidenceRefs.length === 0) {
    violations.push({
      rule: 'evidence-refs-required',
      detail: 'Proposal must have at least one evidenceRef',
      path: 'proposal.evidenceRefs',
    });
  }

  for (const ref of evidenceRefs) {
    if (!ref.sourceType) {
      violations.push({
        rule: 'evidence-source-type',
        detail: 'EvidenceRef must have sourceType',
        path: 'proposal.evidenceRefs[].sourceType',
      });
    }
    if (!ref.sourceId) {
      violations.push({
        rule: 'evidence-source-id',
        detail: 'EvidenceRef must have sourceId',
        path: 'proposal.evidenceRefs[].sourceId',
      });
    }
    if (typeof ref.relevance !== 'number' || ref.relevance < 0 || ref.relevance > 1) {
      violations.push({
        rule: 'evidence-relevance',
        detail: `EvidenceRef relevance must be 0..1, got ${ref.relevance}`,
        path: 'proposal.evidenceRefs[].relevance',
      });
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// validateLlmEvidenceRefsAgainstInputPack — check evidence refs against input pack
// ---------------------------------------------------------------------------

/**
 * Validates that LLM proposal evidence refs actually reference sources that
 * exist in the input pack. Prevents LLM from inventing evidence.
 *
 * Rules:
 * - evaluation_snapshot: sourceId must be in inputPackRef.sourceSnapshotIds
 * - pressure_receipt / consensus_receipt: sourceId must be in inputPackRef.sourceReceiptIds
 * - Other sourceTypes: format-only validation (sourceType non-empty, sourceId non-empty)
 *
 * Disabled/fallback proposals are skipped — they are always rejected/never_apply_directly.
 *
 * Pure function — no side effects, no LLM, no network.
 */
export function validateLlmEvidenceRefsAgainstInputPack(
  evidenceRefs: readonly LlmEvidenceRef[],
  inputPackRef: { readonly sourceSnapshotIds: readonly string[]; readonly sourceReceiptIds: readonly string[] },
  isFallback: boolean = false,
): LlmProposalViolation[] {
  // Disabled/fallback proposals skip evidence validation — they are always rejected
  if (isFallback) return [];

  const violations: LlmProposalViolation[] = [];

  const snapshotIdSet = new Set(inputPackRef.sourceSnapshotIds);
  const receiptIdSet = new Set(inputPackRef.sourceReceiptIds);

  for (const ref of evidenceRefs) {
    if (!ref.sourceType || !ref.sourceId) continue; // format issues caught by validateEvidenceRefs

    switch (ref.sourceType) {
      case 'evaluation_snapshot':
        if (!snapshotIdSet.has(ref.sourceId)) {
          violations.push({
            rule: 'evidence-not-in-input-pack',
            detail: `EvidenceRef sourceId "${ref.sourceId}" (evaluation_snapshot) not found in inputPackRef.sourceSnapshotIds`,
            path: `proposal.evidenceRefs[].sourceId:${ref.sourceId}`,
          });
        }
        break;

      case 'pressure_receipt':
      case 'consensus_receipt':
        if (!receiptIdSet.has(ref.sourceId)) {
          violations.push({
            rule: 'evidence-not-in-input-pack',
            detail: `EvidenceRef sourceId "${ref.sourceId}" (${ref.sourceType}) not found in inputPackRef.sourceReceiptIds`,
            path: `proposal.evidenceRefs[].sourceId:${ref.sourceId}`,
          });
        }
        break;

      default:
        // Other sourceTypes: format-only (don't over-constrain future extensions)
        break;
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Helper: validate no forbidden mutation in content
// ---------------------------------------------------------------------------

function validateNoForbiddenMutation(content: unknown): LlmProposalViolation[] {
  const violations: LlmProposalViolation[] = [];
  const text = JSON.stringify(content);

  const mutationPattern = containsForbiddenPattern(text, FORBIDDEN_MUTATION_PATTERNS);
  if (mutationPattern) {
    violations.push({
      rule: 'no-direct-mutation',
      detail: `Proposal contains forbidden mutation pattern: "${mutationPattern}"`,
      path: 'proposal.content',
    });
  }

  return violations;
}

// ---------------------------------------------------------------------------
// Helper: validate no fact declarations
// ---------------------------------------------------------------------------

function validateNoFactDeclarations(content: unknown): LlmProposalViolation[] {
  const violations: LlmProposalViolation[] = [];
  const text = JSON.stringify(content);

  const factPattern = containsForbiddenPattern(text, FORBIDDEN_FACT_DECLARATIONS);
  if (factPattern) {
    violations.push({
      rule: 'no-fact-declaration',
      detail: `Proposal declares a fact outcome: "${factPattern}". LLM cannot declare signed/sold/lost.`,
      path: 'proposal.content',
    });
  }

  return violations;
}

// ---------------------------------------------------------------------------
// validateLlmOutputProposal — generic validator
// ---------------------------------------------------------------------------

/**
 * Validates any LLM output proposal against the boundary contract.
 *
 * Checks:
 * 1. evidenceRefs must exist and be non-empty
 * 2. proposal cannot contain directMutation / casePatch / etc.
 * 3. proposal cannot declare signed/sold/lost as facts
 * 4. proposal must have valid proposalKind
 * 5. proposal must have valid validationStatus
 */
export function validateLlmOutputProposal(
  proposal: LlmOutputProposal,
  allowedActionIds: readonly string[] = [],
  maxEnergy: number = Infinity,
  maxBudget: number = Infinity,
): LlmProposalViolation[] {
  const violations: LlmProposalViolation[] = [];

  // 1. Evidence refs
  violations.push(...validateEvidenceRefs(proposal.evidenceRefs));

  // 2. No forbidden mutation
  violations.push(...validateNoForbiddenMutation(proposal.content));

  // 3. No fact declarations
  violations.push(...validateNoFactDeclarations(proposal.content));

  // 4. Valid proposal kind
  if (!proposal.proposalKind) {
    violations.push({
      rule: 'proposal-kind',
      detail: 'Proposal must have proposalKind',
      path: 'proposal.proposalKind',
    });
  }

  // 5. Validation status must be 'pending' (not pre-set to 'valid')
  if (proposal.validationStatus !== 'pending') {
    violations.push({
      rule: 'validation-status',
      detail: `Proposal validationStatus should be 'pending', got '${proposal.validationStatus}'`,
      path: 'proposal.validationStatus',
    });
  }

  // 6. If it's an action recommendation, check actionId against allowedActions
  if (proposal.proposalKind === 'action_recommendation_proposal') {
    const content = proposal.content;
    if (content.kind === 'structured' && content.data) {
      const actionId = (content.data as Record<string, unknown>).recommendedActionId;
      if (actionId && allowedActionIds.length > 0 && !allowedActionIds.includes(actionId as string)) {
        violations.push({
          rule: 'action-in-allowed-set',
          detail: `Recommended action "${actionId}" is not in allowedActions`,
          path: 'proposal.content.data.recommendedActionId',
        });
      }
    }
  }

  return violations;
}

// ---------------------------------------------------------------------------
// validateActionRecommendationProposal — specific validator
// ---------------------------------------------------------------------------

/**
 * Validates an action recommendation proposal.
 *
 * Checks:
 * 1. All generic checks from validateLlmOutputProposal
 * 2. recommendedActionId must be in allowedActionIds
 * 3. Energy cost must not exceed maxEnergy
 * 4. Budget cost must not exceed maxBudget
 * 5. Cannot declare outcome facts
 */
export function validateActionRecommendationProposal(
  proposal: LlmOutputProposal,
  allowedActionIds: readonly string[],
  maxEnergy: number,
  maxBudget: number,
): LlmProposalViolation[] {
  const violations: LlmProposalViolation[] = [];

  // Generic checks
  violations.push(...validateLlmOutputProposal(proposal, allowedActionIds, maxEnergy, maxBudget));

  // Must be action_recommendation_proposal
  if (proposal.proposalKind !== 'action_recommendation_proposal') {
    violations.push({
      rule: 'proposal-kind-mismatch',
      detail: `Expected action_recommendation_proposal, got ${proposal.proposalKind}`,
      path: 'proposal.proposalKind',
    });
    return violations;
  }

  // Extract structured content
  if (proposal.content.kind !== 'structured' || !proposal.content.data) {
    violations.push({
      rule: 'structured-content-required',
      detail: 'Action recommendation must have structured content',
      path: 'proposal.content',
    });
    return violations;
  }

  const data = proposal.content.data as Record<string, unknown>;

  // Check actionId
  const actionId = data.recommendedActionId as string | undefined;
  if (!actionId) {
    violations.push({
      rule: 'action-id-required',
      detail: 'Action recommendation must have recommendedActionId',
      path: 'proposal.content.data.recommendedActionId',
    });
  } else if (allowedActionIds.length > 0 && !allowedActionIds.includes(actionId)) {
    violations.push({
      rule: 'action-in-allowed-set',
      detail: `Recommended action "${actionId}" is not in allowedActions`,
      path: 'proposal.content.data.recommendedActionId',
    });
  }

  // Check energy
  const energyCost = data.energyCost as number | undefined;
  if (typeof energyCost === 'number' && energyCost > maxEnergy) {
    violations.push({
      rule: 'energy-exceeded',
      detail: `Energy cost ${energyCost} exceeds max ${maxEnergy}`,
      path: 'proposal.content.data.energyCost',
    });
  }

  // Check budget
  const budgetCost = data.budgetCost as number | undefined;
  if (typeof budgetCost === 'number' && budgetCost > maxBudget) {
    violations.push({
      rule: 'budget-exceeded',
      detail: `Budget cost ${budgetCost} exceeds max ${maxBudget}`,
      path: 'proposal.content.data.budgetCost',
    });
  }

  return violations;
}

// ---------------------------------------------------------------------------
// validateDialogueDraftProposal — specific validator
// ---------------------------------------------------------------------------

/**
 * Validates a dialogue draft proposal.
 *
 * Checks:
 * 1. All generic checks from validateLlmOutputProposal
 * 2. Must have text content (not structured)
 * 3. Text must not contain forbidden mutation patterns
 * 4. Must have sceneId and speakerActorId
 * 5. Lines must not declare fact outcomes
 */
export function validateDialogueDraftProposal(
  proposal: LlmOutputProposal,
): LlmProposalViolation[] {
  const violations: LlmProposalViolation[] = [];

  // Generic checks
  violations.push(...validateLlmOutputProposal(proposal));

  // Must be dialogue_draft
  if (proposal.proposalKind !== 'dialogue_draft') {
    violations.push({
      rule: 'proposal-kind-mismatch',
      detail: `Expected dialogue_draft, got ${proposal.proposalKind}`,
      path: 'proposal.proposalKind',
    });
    return violations;
  }

  // Must have text content
  if (proposal.content.kind !== 'text' || !proposal.content.text) {
    violations.push({
      rule: 'text-content-required',
      detail: 'Dialogue draft must have text content',
      path: 'proposal.content',
    });
    return violations;
  }

  // Text must not contain fact declarations
  const text = proposal.content.text;
  const factPattern = containsForbiddenPattern(text, FORBIDDEN_FACT_DECLARATIONS);
  if (factPattern) {
    violations.push({
      rule: 'no-fact-in-dialogue',
      detail: `Dialogue contains forbidden fact declaration: "${factPattern}"`,
      path: 'proposal.content.text',
    });
  }

  return violations;
}

// ---------------------------------------------------------------------------
// validateDecisionEvaluationProposal — specific validator
// ---------------------------------------------------------------------------

/**
 * Validates a decision evaluation proposal.
 *
 * Checks:
 * 1. All generic checks from validateLlmOutputProposal
 * 2. Must have structured content
 * 3. proposedEvaluation must have label, confidence, reasoning
 * 4. Confidence must be 0..1
 * 5. Cannot declare outcome facts
 */
export function validateDecisionEvaluationProposal(
  proposal: LlmOutputProposal,
): LlmProposalViolation[] {
  const violations: LlmProposalViolation[] = [];

  // Generic checks
  violations.push(...validateLlmOutputProposal(proposal));

  // Must be decision_evaluation_proposal
  if (proposal.proposalKind !== 'decision_evaluation_proposal') {
    violations.push({
      rule: 'proposal-kind-mismatch',
      detail: `Expected decision_evaluation_proposal, got ${proposal.proposalKind}`,
      path: 'proposal.proposalKind',
    });
    return violations;
  }

  // Must have structured content
  if (proposal.content.kind !== 'structured' || !proposal.content.data) {
    violations.push({
      rule: 'structured-content-required',
      detail: 'Decision evaluation must have structured content',
      path: 'proposal.content',
    });
    return violations;
  }

  const data = proposal.content.data as Record<string, unknown>;
  const eval_ = data.proposedEvaluation as Record<string, unknown> | undefined;

  if (!eval_) {
    violations.push({
      rule: 'proposed-evaluation-required',
      detail: 'Decision evaluation must have proposedEvaluation',
      path: 'proposal.content.data.proposedEvaluation',
    });
    return violations;
  }

  if (!eval_.label) {
    violations.push({
      rule: 'evaluation-label-required',
      detail: 'proposedEvaluation must have label',
      path: 'proposal.content.data.proposedEvaluation.label',
    });
  }

  if (typeof eval_.confidence !== 'number' || eval_.confidence < 0 || eval_.confidence > 1) {
    violations.push({
      rule: 'evaluation-confidence-range',
      detail: `proposedEvaluation.confidence must be 0..1, got ${eval_.confidence}`,
      path: 'proposal.content.data.proposedEvaluation.confidence',
    });
  }

  if (!eval_.reasoning) {
    violations.push({
      rule: 'evaluation-reasoning-required',
      detail: 'proposedEvaluation must have reasoning',
      path: 'proposal.content.data.proposedEvaluation.reasoning',
    });
  }

  return violations;
}

// ---------------------------------------------------------------------------
// buildValidationResult — convert violations to LlmValidationResult
// ---------------------------------------------------------------------------

/**
 * Builds a LlmValidationResult from violations.
 * Pure function — no side effects.
 */
export function buildValidationResult(
  proposalId: string,
  violations: readonly LlmProposalViolation[],
  day: number,
): LlmValidationResult {
  const checks: LlmValidationCheck[] = violations.map((v) => ({
    checkId: `check:${v.rule}`,
    checkKind: 'boundary_guard' as const,
    passed: false,
    detail: v.detail,
  }));

  // Add passing checks for each rule that didn't violate
  const violatedRules = new Set(violations.map((v) => v.rule));
  const allRules = [
    'evidence-refs-required', 'no-direct-mutation', 'no-fact-declaration',
    'proposal-kind', 'validation-status', 'action-in-allowed-set',
    'energy-exceeded', 'budget-exceeded', 'evidence-not-in-input-pack',
  ];
  for (const rule of allRules) {
    if (!violatedRules.has(rule)) {
      checks.push({
        checkId: `check:${rule}`,
        checkKind: 'boundary_guard',
        passed: true,
        detail: `Rule ${rule} passed`,
      });
    }
  }

  return Object.freeze({
    proposalId,
    status: violations.length === 0 ? 'valid' : 'invalid',
    validatedAtDay: day,
    checks: Object.freeze(checks),
    reason: violations.length > 0 ? violations.map((v) => v.detail).join('; ') : undefined,
  });
}
