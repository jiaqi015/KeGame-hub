/**
 * Agent Proposal Harness v1 — generic causal proposal envelope, arbiter, and trace.
 *
 * Core principle: any agent output is a *proposal*, never a fact.
 * The arbiter decides which proposal becomes the final output.
 * LLM-capable paths are LLM-first: a present, bounded, valid LLM proposal wins
 * over rule/fallback proposals. Rule output remains the deterministic recovery
 * path for missing, unavailable, or invalid LLM output.
 * All functions are pure: no side effects, no network, no GameState.
 *
 * This module is channel-agnostic. It knows nothing about WeChat deltas,
 * open-day proposals, face-visit logic, or any specific proposal shape.
 * Business validation is injected by the caller via validateLlmProposal.
 *
 * Hard constraints:
 * 1. No import from conversation/, domain/, application/, runtime/, ui/.
 * 2. No fetch, network, or external provider calls.
 * 3. No mutation of input arguments.
 * 4. Arbiter is deterministic: same inputs always produce same outputs.
 * 5. No performance.now / Date.now / Math.random.
 */

import type { AgentChannel, AgentExecutionMode } from './models.js';

// ---------------------------------------------------------------------------
// AgentProposalEnvelope: wraps any proposal type with harness metadata
// ---------------------------------------------------------------------------

export type AgentProposalSource = 'rule' | 'llm' | 'fallback';

export interface AgentProposalEnvelope<TProposal = unknown> {
  readonly proposalId: string;
  readonly agentId: string;
  readonly channel: AgentChannel;
  readonly mode: AgentExecutionMode;
  readonly source: AgentProposalSource;
  readonly confidence: number;
  readonly proposal: TProposal;
  readonly evidenceRefs: readonly string[];
  readonly memoryRefs: readonly string[];
  readonly inputPackRef?: string;
  readonly createdAtDay?: number;
}

export function buildAgentProposalEnvelope<TProposal>(input: {
  proposalId: string;
  agentId: string;
  channel: AgentChannel;
  mode: AgentExecutionMode;
  source: AgentProposalSource;
  confidence: number;
  proposal: TProposal;
  evidenceRefs?: readonly string[];
  memoryRefs?: readonly string[];
  inputPackRef?: string;
  createdAtDay?: number;
}): AgentProposalEnvelope<TProposal> {
  return Object.freeze({
    proposalId: input.proposalId,
    agentId: input.agentId,
    channel: input.channel,
    mode: input.mode,
    source: input.source,
    confidence: clampConfidence(input.confidence),
    proposal: input.proposal,
    evidenceRefs: Object.freeze([...(input.evidenceRefs || [])]),
    memoryRefs: Object.freeze([...(input.memoryRefs || [])]),
    inputPackRef: input.inputPackRef,
    createdAtDay: input.createdAtDay,
  });
}

// ---------------------------------------------------------------------------
// AgentArbiterResult: output of the arbiter pure function
// ---------------------------------------------------------------------------

export type AgentArbiterAcceptedSource = 'rule' | 'llm' | 'fallback';

export interface AgentArbiterResult<TProposal = unknown> {
  readonly acceptedSource: AgentArbiterAcceptedSource;
  readonly finalProposal: TProposal;
  readonly reason: string;
  readonly bounded: boolean;
  readonly rejectedReasons: readonly string[];
  readonly validationNotes: readonly string[];
}

export function buildAgentArbiterResult<TProposal>(input: {
  acceptedSource: AgentArbiterAcceptedSource;
  finalProposal: TProposal;
  reason: string;
  bounded: boolean;
  rejectedReasons?: readonly string[];
  validationNotes?: readonly string[];
}): AgentArbiterResult<TProposal> {
  return Object.freeze({
    acceptedSource: input.acceptedSource,
    finalProposal: input.finalProposal,
    reason: input.reason,
    bounded: input.bounded,
    rejectedReasons: Object.freeze([...(input.rejectedReasons || [])]),
    validationNotes: Object.freeze([...(input.validationNotes || [])]),
  });
}

// ---------------------------------------------------------------------------
// AgentRunTrace: records which agents ran, what mode, timing
// ---------------------------------------------------------------------------

export interface AgentRunTrace {
  readonly traceId: string;
  readonly agentId: string;
  readonly channel: AgentChannel;
  readonly day: number;
  readonly visibleRefs: readonly string[];
  readonly memoryFactIds: readonly string[];
  readonly pressure: readonly string[];
  readonly uncertainty: readonly string[];
  readonly ruleSource: AgentProposalSource | null;
  readonly llmSource: AgentProposalSource | null;
  readonly arbiterDecision: string;
  readonly acceptedSource: AgentArbiterAcceptedSource;
  readonly ruleConfidence: number;
  readonly llmConfidence: number | null;
  readonly durationUs: number | null;
  readonly validationNotes: readonly string[];
  readonly modelId?: string;
  readonly provider?: string;
  readonly llmError?: string;
}

export function buildAgentRunTrace(input: {
  traceId: string;
  agentId: string;
  channel: AgentChannel;
  day: number;
  visibleRefs: readonly string[];
  memoryFactIds: readonly string[];
  pressure: readonly string[];
  uncertainty: readonly string[];
  ruleSource: AgentProposalSource | null;
  llmSource: AgentProposalSource | null;
  arbiterDecision: string;
  acceptedSource: AgentArbiterAcceptedSource;
  ruleConfidence: number;
  llmConfidence: number | null;
  durationUs?: number | null;
  validationNotes?: readonly string[];
  modelId?: string;
  provider?: string;
  llmError?: string;
}): AgentRunTrace {
  return Object.freeze({
    traceId: input.traceId,
    agentId: input.agentId,
    channel: input.channel,
    day: input.day,
    visibleRefs: Object.freeze([...input.visibleRefs]),
    memoryFactIds: Object.freeze([...input.memoryFactIds]),
    pressure: Object.freeze([...input.pressure]),
    uncertainty: Object.freeze([...input.uncertainty]),
    ruleSource: input.ruleSource,
    llmSource: input.llmSource,
    arbiterDecision: input.arbiterDecision,
    acceptedSource: input.acceptedSource,
    ruleConfidence: input.ruleConfidence,
    llmConfidence: input.llmConfidence,
    durationUs: input.durationUs ?? null,
    validationNotes: Object.freeze([...(input.validationNotes || [])]),
    modelId: input.modelId,
    provider: input.provider,
    llmError: input.llmError,
  });
}

// ---------------------------------------------------------------------------
// AgentExecutorPort: generic interface for running agents
// ---------------------------------------------------------------------------

export interface AgentExecutorPort<TContext = unknown, TProposal = unknown> {
  readonly channel: AgentChannel;
  buildRuleProposal(context: TContext): AgentProposalEnvelope<TProposal>;
  buildLlmProposal?(context: TContext): Promise<AgentProposalEnvelope<TProposal>> | AgentProposalEnvelope<TProposal>;
}

// ---------------------------------------------------------------------------
// Proposal validator: injectable business validation
// ---------------------------------------------------------------------------

export interface ProposalValidationResult {
  readonly ok: boolean;
  readonly reason?: string;
  readonly bounded?: boolean;
}

export type ProposalValidator<TProposal = unknown> = (
  proposal: TProposal,
) => ProposalValidationResult;

// ---------------------------------------------------------------------------
// Arbiter: generic pure function that selects between rule and LLM proposals
// ---------------------------------------------------------------------------

export interface ArbitrateAgentProposalsInput<TProposal = unknown> {
  readonly ruleProposal: AgentProposalEnvelope<TProposal>;
  readonly llmProposal: AgentProposalEnvelope<TProposal> | null;
  readonly validateLlmProposal?: ProposalValidator<TProposal>;
}

export function arbitrateAgentProposals<TProposal>(
  input: ArbitrateAgentProposalsInput<TProposal>,
): AgentArbiterResult<TProposal> {
  const { ruleProposal, llmProposal, validateLlmProposal } = input;
  const rejectedReasons: string[] = [];
  const validationNotes: string[] = [];

  // Rule-only mode: no LLM proposal available
  if (!llmProposal) {
    return buildAgentArbiterResult({
      acceptedSource: ruleProposal.source === 'fallback' ? 'fallback' : 'rule',
      finalProposal: ruleProposal.proposal,
      reason: 'rule-only mode: no LLM proposal available',
      bounded: true,
      rejectedReasons: [],
      validationNotes: [],
    });
  }

  // Run injectable business validation if provided
  if (validateLlmProposal) {
    const validation = validateLlmProposal(llmProposal.proposal);
    if (!validation.ok) {
      rejectedReasons.push('llm_proposal_validation_failed');
      if (validation.reason) validationNotes.push(validation.reason);
      return buildAgentArbiterResult({
        acceptedSource: 'rule',
        finalProposal: ruleProposal.proposal,
        reason: `LLM proposal validation failed${validation.reason ? ': ' + validation.reason : ''}`,
        bounded: validation.bounded ?? true,
        rejectedReasons,
        validationNotes,
      });
    }
  }

  return buildAgentArbiterResult({
    acceptedSource: 'llm',
    finalProposal: llmProposal.proposal,
    reason: `LLM-first accepted valid proposal; LLM confidence ${llmProposal.confidence.toFixed(2)}, rule confidence ${ruleProposal.confidence.toFixed(2)}`,
    bounded: true,
    rejectedReasons,
    validationNotes,
  });
}

function clampConfidence(value: number): number {
  if (!Number.isFinite(value)) return 0.50;
  return Math.max(0.10, Math.min(1.0, value));
}
