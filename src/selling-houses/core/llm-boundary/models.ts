/**
 * LLM Extension Boundary v0 — provider-neutral contract types.
 *
 * Mother model alignment:
 * - Section 7 (Narrative and LLM): LLM should not read raw GameState or invent
 *   events. Use deterministic signal extractor first.
 * - Section 8 (LLM decision integration): Safest order: narrative/dialogue →
 *   strategy recommendation → policy proposal → structured decision evaluator.
 *   LLM may propose DecisionEvaluation or ActionRecommendation, but
 *   SimulationEngine applies outcomes.
 * - Section 10 (LLM broker strategy agent): Advisory mode, not autoplay.
 *   LLM sees compressed POV, not full GlobalTruth.
 * - Section 18.10 (Replayability): LLM output cannot be hidden randomness
 *   inside core simulation. Store model versions and LLM-derived structured
 *   outputs for replay.
 *
 * Hard constraints:
 * 1. Not a real LLM integration. No OpenAI / fetch / network / API key.
 * 2. No-LLM main path must be stable: disabled mode returns empty/fallback.
 * 3. LLM output is always proposal, never fact, never execution result.
 * 4. core/llm-boundary cannot import domain/runtime.
 * 5. All types are pure interfaces/enums, no side effects.
 */

// ---------------------------------------------------------------------------
// LlmCapabilityMode: controls whether LLM features are active
// ---------------------------------------------------------------------------

export type LlmCapabilityMode =
  | 'disabled'                // no LLM, all builders return empty/fallback
  | 'interaction_draft'       // narrative/dialogue/owner-reply drafting
  | 'reasoning_proposal'      // decision evaluation / belief update proposals
  | 'strategy_advice'         // broker strategy recommendations
  | 'what_if_policy';         // offline counterfactual policy proposals

// ---------------------------------------------------------------------------
// LlmProviderKind: provider-neutral identifier (no actual provider code)
// ---------------------------------------------------------------------------

export type LlmProviderKind =
  | 'none'                    // no provider configured
  | 'local_deterministic'     // local seeded template (for testing)
  | 'external_api';           // future: real LLM API (not implemented)

// ---------------------------------------------------------------------------
// LlmInvocationEnvelope: metadata about an LLM invocation
// ---------------------------------------------------------------------------

export interface LlmInvocationEnvelope {
  readonly invocationId: string;
  readonly capabilityMode: LlmCapabilityMode;
  readonly provider: LlmProviderKind;
  readonly model?: string;
  readonly modelVersion?: string;
  readonly requestedAtDay: number;
  readonly requestedByActor: string;
  readonly inputPackHash: string;
  readonly sourcePackKind: LlmInputPackKind;
}

// ---------------------------------------------------------------------------
// LlmInputPackKind: what kind of input was sent to the LLM
// ---------------------------------------------------------------------------

export type LlmInputPackKind =
  | 'narrative_signal_pack'       // DomainEvents + EvaluationSnapshots + POVSnapshot
  | 'dialogue_context_pack'       // interaction scene + actor beliefs
  | 'decision_context_pack'       // DecisionState + ChoiceSet + pressure
  | 'strategy_context_pack'       // BrokerPOV + allowed actions + constraints
  | 'what_if_policy_pack';        // counterfactual fork + policy question

// ---------------------------------------------------------------------------
// LlmInputPackRef: reference to a deterministic input pack (not raw GameState)
// ---------------------------------------------------------------------------

export interface LlmInputPackRef {
  readonly packKind: LlmInputPackKind;
  readonly packHash: string;
  readonly packedAtDay: number;
  readonly sourceSnapshotIds: readonly string[];
  readonly sourceReceiptIds: readonly string[];
  /** Human-readable summary of what's in the pack. */
  readonly summary: string;
}

// ---------------------------------------------------------------------------
// LlmOutputProposal: the LLM's output (always a proposal, never a fact)
// ---------------------------------------------------------------------------

export type LlmProposalKind =
  // Interaction drafts (LLM writes text, system validates)
  | 'narrative_draft'
  | 'dialogue_draft'
  | 'owner_reply_draft'
  | 'broker_advice_draft'
  // Reasoning proposals (LLM suggests, system evaluates)
  | 'decision_evaluation_proposal'
  | 'belief_update_proposal'
  | 'action_recommendation_proposal'
  | 'what_if_policy_proposal';

export type LlmApplyability =
  | 'advisory_only'           // shown to player, never auto-applied
  | 'validator_required'      // must pass validation before use
  | 'never_apply_directly';   // only for logging/replay/analysis

export interface LlmOutputProposal {
  readonly proposalId: string;
  readonly proposalKind: LlmProposalKind;
  readonly invocationEnvelope: LlmInvocationEnvelope;
  readonly inputPackRef: LlmInputPackRef;
  /** The actual proposal content (structured or text). */
  readonly content: LlmProposalContent;
  /** Evidence references: what input signals the LLM claims to have used. */
  readonly evidenceRefs: readonly LlmEvidenceRef[];
  /** Validation status (starts as 'pending'). */
  readonly validationStatus: LlmValidationStatus;
  /** How this proposal may be applied. */
  readonly applyability: LlmApplyability;
  /** Provider/model/version (optional, for replay). */
  readonly provider?: LlmProviderKind;
  readonly model?: string;
  readonly modelVersion?: string;
  /** Whether this proposal was generated in no-LLM fallback mode. */
  readonly isFallback: boolean;
}

// ---------------------------------------------------------------------------
// LlmProposalContent: the actual proposal payload
// ---------------------------------------------------------------------------

export type LlmProposalContent =
  | LlmTextContent
  | LlmStructuredContent;

export interface LlmTextContent {
  readonly kind: 'text';
  readonly text: string;
  readonly language: string;
}

export interface LlmStructuredContent {
  readonly kind: 'structured';
  readonly schema: string;
  readonly data: Readonly<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// LlmEvidenceRef: reference to input signals the LLM used
// ---------------------------------------------------------------------------

export interface LlmEvidenceRef {
  readonly sourceType: 'evaluation_snapshot' | 'pressure_receipt' | 'consensus_receipt'
    | 'attention_state' | 'decision_signal' | 'event' | 'belief' | 'relation';
  readonly sourceId: string;
  readonly relevance: number; // 0..1, how much the LLM claims this influenced the output
  readonly summary: string;
}

// ---------------------------------------------------------------------------
// LlmValidationResult: outcome of validating a proposal
// ---------------------------------------------------------------------------

export type LlmValidationStatus =
  | 'pending'         // not yet validated
  | 'valid'           // passed all checks
  | 'invalid'         // failed validation
  | 'stale'           // input changed since proposal
  | 'rejected';       // explicitly rejected by actor/system

export interface LlmValidationResult {
  readonly proposalId: string;
  readonly status: LlmValidationStatus;
  readonly validatedAtDay: number;
  readonly checks: readonly LlmValidationCheck[];
  readonly reason?: string;
}

export interface LlmValidationCheck {
  readonly checkId: string;
  readonly checkKind: 'input_freshness' | 'resource_cost' | 'action_validity'
    | 'boundary_guard' | 'policy_constraint' | 'replay_consistency';
  readonly passed: boolean;
  readonly detail: string;
}

// ---------------------------------------------------------------------------
// LlmReplayRecord: for deterministic replay of LLM-involved sessions
// ---------------------------------------------------------------------------

export interface LlmReplayRecord {
  readonly invocation: LlmInvocationEnvelope;
  readonly inputPackRef: LlmInputPackRef;
  readonly proposal: LlmOutputProposal;
  readonly validationResult?: LlmValidationResult;
  /** Whether the proposal was actually applied to the simulation. */
  readonly applied: boolean;
  /** If applied, what the system did with it (not what LLM said). */
  readonly systemAction?: string;
}

// ---------------------------------------------------------------------------
// LlmDisabledFallback: the no-LLM default contract
// ---------------------------------------------------------------------------

export interface LlmDisabledFallback {
  readonly mode: 'disabled';
  readonly reason: string;
  readonly fallbackProposal: LlmOutputProposal;
}

// ---------------------------------------------------------------------------
// Interaction draft types (LLM writes text, system validates)
// ---------------------------------------------------------------------------

export interface NarrativeDraftProposal {
  readonly kind: 'narrative_draft';
  readonly sceneId: string;
  readonly text: string;
  readonly tone: 'neutral' | 'dramatic' | 'tense' | 'celebratory';
  readonly targetAudience: 'player' | 'owner' | 'customer';
}

export interface DialogueDraftProposal {
  readonly kind: 'dialogue_draft';
  readonly sceneId: string;
  readonly speakerActorId: string;
  readonly listenerActorId: string;
  readonly lines: readonly { text: string; intent: string }[];
}

export interface OwnerReplyDraftProposal {
  readonly kind: 'owner_reply_draft';
  readonly ownerArchetype: string;
  readonly contextSummary: string;
  readonly replyText: string;
  readonly emotionalTone: string;
}

export interface BrokerAdviceDraftProposal {
  readonly kind: 'broker_advice_draft';
  readonly caseId: string;
  readonly adviceText: string;
  readonly suggestedActionIds: readonly string[];
  readonly reasoning: string;
}

// ---------------------------------------------------------------------------
// Reasoning proposal types (LLM suggests, system evaluates)
// ---------------------------------------------------------------------------

export interface DecisionEvaluationProposal {
  readonly kind: 'decision_evaluation_proposal';
  readonly caseId: string;
  readonly actorId: string;
  readonly decisionMomentId: string;
  readonly proposedEvaluation: {
    readonly label: string;
    readonly confidence: number;
    readonly reasoning: string;
    readonly alternativeIds: readonly string[];
  };
}

export interface BeliefUpdateProposal {
  readonly kind: 'belief_update_proposal';
  readonly actorId: string;
  readonly beliefKind: string;
  readonly proposedValue: string | number | boolean;
  readonly proposedConfidence: number;
  readonly reasoning: string;
  readonly supportingEvidenceIds: readonly string[];
}

export interface ActionRecommendationProposal {
  readonly kind: 'action_recommendation_proposal';
  readonly caseId: string;
  readonly actorId: string;
  readonly recommendedActionId: string;
  readonly reasoning: string;
  readonly expectedOutcome: string;
  readonly confidence: number;
}

export interface WhatIfPolicyProposal {
  readonly kind: 'what_if_policy_proposal';
  readonly forkId: string;
  readonly policyQuestion: string;
  readonly proposedPolicy: {
    readonly label: string;
    readonly parameters: Readonly<Record<string, unknown>>;
    readonly reasoning: string;
  };
  readonly expectedImpact: string;
}

// ---------------------------------------------------------------------------
// Builder input shapes (plain, no domain import)
// ---------------------------------------------------------------------------

export interface LlmNarrativeInputSignals {
  readonly day: number;
  readonly eventSummaries: readonly { kind: string; label: string; tone: string }[];
  readonly evaluationSnapshotIds: readonly string[];
  readonly povActorId: string;
  readonly povActorKind: string;
}

export interface LlmDecisionInputSignals {
  readonly caseId: string;
  readonly actorId: string;
  readonly actorKind: string;
  readonly decisionMomentId: string;
  readonly knownFactKeys: readonly string[];
  readonly beliefKeys: readonly string[];
  readonly pressureSummary: string;
  readonly availableActionIds: readonly string[];
}

export interface LlmStrategyInputSignals {
  readonly actorId: string;
  readonly actorKind: string;
  readonly caseIds: readonly string[];
  readonly energy: number;
  readonly promotionBudget: number;
  readonly allowedActionIds: readonly string[];
  readonly povSummary: string;
}

// ---------------------------------------------------------------------------
// No-LLM fallback builder
// ---------------------------------------------------------------------------

export function buildDisabledFallback(reason: string): LlmDisabledFallback {
  const fallbackProposal: LlmOutputProposal = Object.freeze({
    proposalId: 'fallback-disabled',
    proposalKind: 'narrative_draft',
    invocationEnvelope: Object.freeze({
      invocationId: 'disabled',
      capabilityMode: 'disabled',
      provider: 'none',
      requestedAtDay: 0,
      requestedByActor: 'system',
      inputPackHash: 'disabled',
      sourcePackKind: 'narrative_signal_pack',
    }),
    inputPackRef: Object.freeze({
      packKind: 'narrative_signal_pack',
      packHash: 'disabled',
      packedAtDay: 0,
      sourceSnapshotIds: Object.freeze([]),
      sourceReceiptIds: Object.freeze([]),
      summary: 'LLM disabled — no input pack generated',
    }),
    content: Object.freeze({
      kind: 'text' as const,
      text: '',
      language: 'zh',
    }),
    evidenceRefs: Object.freeze([]),
    validationStatus: 'rejected' as const,
    applyability: 'never_apply_directly' as const,
    isFallback: true,
  });

  return Object.freeze({
    mode: 'disabled' as const,
    reason,
    fallbackProposal,
  });
}

// ---------------------------------------------------------------------------
// Capability mode helpers
// ---------------------------------------------------------------------------

export function isLlmDisabled(mode: LlmCapabilityMode): boolean {
  return mode === 'disabled';
}

export function isInteractionDraft(mode: LlmCapabilityMode): boolean {
  return mode === 'interaction_draft';
}

export function isReasoningProposal(mode: LlmCapabilityMode): boolean {
  return mode === 'reasoning_proposal' || mode === 'strategy_advice' || mode === 'what_if_policy';
}

export function getApplyabilityForMode(mode: LlmCapabilityMode): LlmApplyability {
  switch (mode) {
    case 'disabled': return 'never_apply_directly';
    case 'interaction_draft': return 'advisory_only';
    case 'reasoning_proposal': return 'validator_required';
    case 'strategy_advice': return 'advisory_only';
    case 'what_if_policy': return 'validator_required';
  }
}

export function getProposalKindsForMode(mode: LlmCapabilityMode): readonly LlmProposalKind[] {
  switch (mode) {
    case 'disabled': return [];
    case 'interaction_draft': return ['narrative_draft', 'dialogue_draft', 'owner_reply_draft', 'broker_advice_draft'];
    case 'reasoning_proposal': return ['decision_evaluation_proposal', 'belief_update_proposal', 'action_recommendation_proposal'];
    case 'strategy_advice': return ['action_recommendation_proposal', 'broker_advice_draft'];
    case 'what_if_policy': return ['what_if_policy_proposal'];
  }
}
