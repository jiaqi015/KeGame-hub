import type {
  AgentArbiterResult,
  AgentProposalEnvelope,
  AgentRunTrace,
} from '../../core/world-state/agents/proposal.js';
import {
  arbitrateAgentProposals,
  buildAgentProposalEnvelope,
  buildAgentRunTrace,
} from '../../core/world-state/agents/proposal.js';
import {
  buildFallbackActionScenarioSimulation,
  type ActionAdviceProposal,
  type ActionAdviceRequest,
} from '../actionDecisionAdvice.js';
import {
  buildActionDecisionAgentRuntime,
  resolveActionDecisionChannel,
} from './actionDecisionAgentAdapter.js';

export interface ActionDecisionDualRuntimeOptions {
  readonly llmProposal?: ActionAdviceProposal | null;
  readonly llmError?: string | null;
  readonly durationUs?: number | null;
}

export interface ActionDecisionDualRuntimeResult {
  readonly ruleProposal: AgentProposalEnvelope<ActionAdviceProposal>;
  readonly llmProposal: AgentProposalEnvelope<ActionAdviceProposal> | null;
  readonly arbiterResult: AgentArbiterResult<ActionAdviceProposal>;
  readonly trace: AgentRunTrace;
}

export function buildActionDecisionDualRuntime(
  request: ActionAdviceRequest,
  options?: ActionDecisionDualRuntimeOptions,
): ActionDecisionDualRuntimeResult {
  const agent = buildActionDecisionAgentRuntime(request);
  const channel = resolveActionDecisionChannel(request.actionId);
  const ruleAdvice = buildFallbackActionScenarioSimulation(request);
  const ruleProposal = buildAgentProposalEnvelope<ActionAdviceProposal>({
    proposalId: `rule:${request.actionId}:${request.currentRound}`,
    agentId: agent.profile.agentId,
    channel,
    mode: 'rule',
    source: 'rule',
    confidence: ruleAdvice.confidence,
    proposal: ruleAdvice,
    evidenceRefs: agent.perception.visibleRefs,
    memoryRefs: agent.perception.memory.map((fact) => fact.factId),
    inputPackRef: `${request.actionId}:${request.currentRound}`,
    createdAtDay: agent.perception.day,
  });

  const llmError = options?.llmError ?? null;
  const llmEnvelope = !llmError && options?.llmProposal
    ? buildAgentProposalEnvelope<ActionAdviceProposal>({
      proposalId: `llm:${request.actionId}:${request.currentRound}`,
      agentId: agent.profile.agentId,
      channel,
      mode: 'hybrid',
      source: 'llm',
      confidence: options.llmProposal.confidence,
      proposal: options.llmProposal,
      evidenceRefs: agent.perception.visibleRefs,
      memoryRefs: agent.perception.memory.map((fact) => fact.factId),
      inputPackRef: `${request.actionId}:${request.currentRound}`,
      createdAtDay: agent.perception.day,
    })
    : null;

  const arbiterResult = arbitrateAgentProposals<ActionAdviceProposal>({
    ruleProposal,
    llmProposal: llmEnvelope,
    validateLlmProposal: (proposal) => validateActionAdviceProposal(proposal, request),
  });

  const finalArbiterResult = llmError && arbiterResult.acceptedSource === 'rule'
    ? {
      ...arbiterResult,
      reason: `LLM error: ${llmError}; ${arbiterResult.reason}`,
      rejectedReasons: ['llm_error', ...arbiterResult.rejectedReasons],
    }
    : arbiterResult;

  return {
    ruleProposal,
    llmProposal: llmEnvelope,
    arbiterResult: finalArbiterResult,
    trace: buildAgentRunTrace({
      traceId: `trace:${request.actionId}:${request.currentRound}`,
      agentId: agent.profile.agentId,
      channel,
      day: agent.perception.day,
      visibleRefs: agent.perception.visibleRefs,
      memoryFactIds: agent.perception.memory.map((fact) => fact.factId),
      pressure: agent.perception.pressure,
      uncertainty: agent.perception.uncertainty,
      ruleSource: ruleProposal.source,
      llmSource: llmEnvelope?.source ?? null,
      arbiterDecision: finalArbiterResult.reason,
      acceptedSource: finalArbiterResult.acceptedSource,
      ruleConfidence: ruleProposal.confidence,
      llmConfidence: llmEnvelope?.confidence ?? null,
      durationUs: options?.durationUs ?? null,
      validationNotes: finalArbiterResult.validationNotes,
    }),
  };
}

function validateActionAdviceProposal(
  proposal: ActionAdviceProposal,
  request: ActionAdviceRequest,
) {
  const validMainIds = new Set(request.round.mainStrategies.map((option) => option.id));
  const validAssistIds = new Set(request.round.assistStrategies.map((option) => option.id));
  if (!proposal.mainStrategies.length) {
    return { ok: false, reason: 'missing_main_strategies', bounded: true };
  }
  const invalidMain = proposal.mainStrategies.find((option) => !validMainIds.has(option.id));
  if (invalidMain) {
    return { ok: false, reason: `invalid_main_option:${invalidMain.id}`, bounded: true };
  }
  const invalidAssist = proposal.assistStrategies.find((option) => !validAssistIds.has(option.id));
  if (invalidAssist) {
    return { ok: false, reason: `invalid_assist_option:${invalidAssist.id}`, bounded: true };
  }
  if (proposal.confidence < 0 || proposal.confidence > 1) {
    return { ok: false, reason: 'confidence_out_of_bounds', bounded: true };
  }
  return { ok: true, bounded: true };
}
