import type {
  AgentArbiterResult,
  AgentProposalEnvelope,
  AgentRunTrace,
} from '../../core/world-state/agents/proposal.js';
import type { AgentHarnessObservation } from '../../core/world-state/agents/observation.js';
import type { AgentEvaluationReport } from '../../core/world-state/agents/evaluationReport.js';
import type { AgentShadowReport } from '../../core/world-state/agents/shadowReport.js';
import {
  arbitrateAgentProposals,
  buildAgentProposalEnvelope,
  buildAgentRunTrace,
} from '../../core/world-state/agents/proposal.js';
import { buildAgentHarnessObservation } from '../../core/world-state/agents/observation.js';
import { buildAgentEvaluationReport } from '../../core/world-state/agents/evaluationReport.js';
import { buildAgentShadowReport } from '../../core/world-state/agents/shadowReport.js';
import { resolveAgentToolManifest } from '../../core/world-state/agents/toolRegistry.js';
import type { AiArrangementContextPack } from '../aiArrangement/contextPack.js';
import type { AiArrangementProposalV2 } from '../aiArrangement/proposal.js';
import { buildFallbackAiArrangementProposal } from '../aiArrangement/fallbackPlanner.js';
import { buildAiArrangementAgentRuntime } from './aiArrangementAgentAdapter.js';

export interface AiArrangementDualRuntimeOptions {
  readonly llmProposal?: AiArrangementProposalV2 | null;
  readonly llmError?: string | null;
  readonly durationUs?: number | null;
  readonly modelId?: string;
  readonly provider?: string;
}

export interface AiArrangementDualRuntimeResult {
  readonly ruleProposal: AgentProposalEnvelope<AiArrangementProposalV2>;
  readonly llmProposal: AgentProposalEnvelope<AiArrangementProposalV2> | null;
  readonly arbiterResult: AgentArbiterResult<AiArrangementProposalV2>;
  readonly trace: AgentRunTrace;
  readonly observation: AgentHarnessObservation;
  readonly shadowReport: AgentShadowReport;
  readonly evaluationReport: AgentEvaluationReport;
}

export function buildAiArrangementDualRuntime(
  pack: AiArrangementContextPack,
  options?: AiArrangementDualRuntimeOptions,
): AiArrangementDualRuntimeResult {
  const agent = buildAiArrangementAgentRuntime(pack);
  const ruleProposal = buildFallbackAiArrangementProposal(pack);
  const ruleEnvelope = buildAgentProposalEnvelope<AiArrangementProposalV2>({
    proposalId: `rule:ai-arrangement:${pack.day}`,
    agentId: agent.profile.agentId,
    channel: 'open_day',
    mode: 'rule',
    source: 'rule',
    confidence: ruleProposal.confidence,
    proposal: ruleProposal,
    evidenceRefs: pack.candidateItems.map(item => item.itemId),
    memoryRefs: [],
    inputPackRef: pack.packId,
    createdAtDay: pack.day,
  });

  const llmError = options?.llmError ?? null;
  let llmEnvelope: AgentProposalEnvelope<AiArrangementProposalV2> | null = null;
  if (!llmError && options?.llmProposal) {
    llmEnvelope = buildAgentProposalEnvelope<AiArrangementProposalV2>({
      proposalId: `llm:ai-arrangement:${pack.day}`,
      agentId: agent.profile.agentId,
      channel: 'open_day',
      mode: 'hybrid',
      source: 'llm',
      confidence: options.llmProposal.confidence,
      proposal: options.llmProposal,
      evidenceRefs: pack.candidateItems.map(item => item.itemId),
      memoryRefs: [],
      inputPackRef: pack.packId,
      createdAtDay: pack.day,
    });
  }

  const arbiterResult = arbitrateAgentProposals<AiArrangementProposalV2>({
    ruleProposal: ruleEnvelope,
    llmProposal: llmEnvelope,
    validateLlmProposal: (proposal) => validateProposal(proposal, pack),
  });

  let finalArbiterResult = arbiterResult;
  if (llmError && arbiterResult.acceptedSource === 'rule') {
    finalArbiterResult = {
      ...arbiterResult,
      reason: `LLM error: ${llmError}; ${arbiterResult.reason}`,
      rejectedReasons: ['llm_error', ...arbiterResult.rejectedReasons],
    };
  }

  const trace = buildAgentRunTrace({
    traceId: `trace:ai-arrangement:${pack.day}`,
    agentId: agent.profile.agentId,
    channel: 'open_day',
    day: pack.day,
    visibleRefs: pack.candidateItems.map(item => item.itemId),
    memoryFactIds: [],
    pressure: agent.perception.pressure,
    uncertainty: agent.perception.uncertainty,
    ruleSource: ruleEnvelope.source,
    llmSource: llmEnvelope?.source ?? null,
    arbiterDecision: finalArbiterResult.reason,
    acceptedSource: finalArbiterResult.acceptedSource,
    ruleConfidence: ruleEnvelope.confidence,
    llmConfidence: llmEnvelope?.confidence ?? null,
    durationUs: options?.durationUs ?? null,
    validationNotes: finalArbiterResult.validationNotes,
  });

  const toolManifest = resolveAgentToolManifest({ channel: 'open_day', mode: 'hybrid' });
  const observation = buildAgentHarnessObservation({
    observationId: `observation:ai-arrangement:${pack.day}`,
    runId: `ai-arrangement:${pack.day}`,
    trace,
    contextPackRef: pack.packId,
    contextBudgetSummary: `candidates ${pack.candidateItems.length}/${pack.candidateItems.length}`,
    toolManifest,
    ruleProposal: ruleEnvelope,
    llmProposal: llmEnvelope,
    arbiterResult: finalArbiterResult,
  });

  const shadowReport = buildAgentShadowReport(observation);
  const evaluationReport = buildAgentEvaluationReport(observation, shadowReport);

  return {
    ruleProposal: ruleEnvelope,
    llmProposal: llmEnvelope,
    arbiterResult: finalArbiterResult,
    trace,
    observation,
    shadowReport,
    evaluationReport,
  };
}

function validateProposal(
  proposal: AiArrangementProposalV2,
  pack: AiArrangementContextPack,
): { ok: boolean; reason?: string; bounded?: boolean } {
  const validItemIds = new Set(pack.candidateItems.map(item => item.itemId));
  for (const draft of proposal.drafts) {
    if (!validItemIds.has(draft.itemId)) {
      return { ok: false, reason: `invalid_item:${draft.itemId}`, bounded: true };
    }
  }
  return { ok: true };
}
