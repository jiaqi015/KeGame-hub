import type { AgentChannel, AgentExecutionMode } from './models.js';
import type {
  AgentArbiterAcceptedSource,
  AgentArbiterResult,
  AgentProposalEnvelope,
  AgentProposalSource,
  AgentRunTrace,
} from './proposal.js';
import type { AgentToolManifest } from './toolRegistry.js';

export interface AgentHarnessObservation {
  readonly observationId: string;
  readonly runId: string;
  readonly agentId: string;
  readonly channel: AgentChannel;
  readonly mode: AgentExecutionMode;
  readonly day: number;
  readonly context: {
    readonly contextPackRef?: string;
    readonly inputPackRef?: string;
    readonly contextBudgetSummary?: string;
    readonly visibleRefs: readonly string[];
    readonly memoryFactIds: readonly string[];
    readonly pressure: readonly string[];
    readonly uncertainty: readonly string[];
  };
  readonly tools: {
    readonly enabledToolsets: readonly string[];
    readonly disabledToolsets: readonly string[];
    readonly availableToolIds: readonly string[];
    readonly forbiddenToolIds: readonly string[];
  };
  readonly proposals: {
    readonly ruleProposalId: string;
    readonly llmProposalId: string | null;
    readonly ruleSource: AgentProposalSource;
    readonly llmSource: AgentProposalSource | null;
    readonly ruleConfidence: number;
    readonly llmConfidence: number | null;
  };
  readonly arbiter: {
    readonly acceptedSource: AgentArbiterAcceptedSource;
    readonly reason: string;
    readonly bounded: boolean;
    readonly rejectedReasons: readonly string[];
    readonly validationNotes: readonly string[];
    readonly normalizationNotes: readonly string[];
  };
  readonly replay: {
    readonly acceptedProposalId: string;
    readonly durationUs: number | null;
  };
}

export function buildAgentHarnessObservation<TProposal>(input: {
  readonly observationId: string;
  readonly runId: string;
  readonly trace: AgentRunTrace;
  readonly contextPackRef?: string;
  readonly contextBudgetSummary?: string;
  readonly toolManifest: AgentToolManifest;
  readonly ruleProposal: AgentProposalEnvelope<TProposal>;
  readonly llmProposal: AgentProposalEnvelope<TProposal> | null;
  readonly arbiterResult: AgentArbiterResult<TProposal>;
  readonly normalizationNotes?: readonly string[];
}): AgentHarnessObservation {
  const acceptedProposalId = input.arbiterResult.acceptedSource === 'llm' && input.llmProposal
    ? input.llmProposal.proposalId
    : input.ruleProposal.proposalId;

  return Object.freeze({
    observationId: input.observationId,
    runId: input.runId,
    agentId: input.trace.agentId,
    channel: input.trace.channel,
    mode: input.toolManifest.mode,
    day: input.trace.day,
    context: Object.freeze({
      contextPackRef: input.contextPackRef,
      inputPackRef: input.ruleProposal.inputPackRef,
      contextBudgetSummary: input.contextBudgetSummary,
      visibleRefs: Object.freeze([...input.trace.visibleRefs]),
      memoryFactIds: Object.freeze([...input.trace.memoryFactIds]),
      pressure: Object.freeze([...input.trace.pressure]),
      uncertainty: Object.freeze([...input.trace.uncertainty]),
    }),
    tools: Object.freeze({
      enabledToolsets: Object.freeze([...input.toolManifest.enabledToolsets]),
      disabledToolsets: Object.freeze([...input.toolManifest.disabledToolsets]),
      availableToolIds: Object.freeze(input.toolManifest.availableTools.map((tool) => tool.toolId)),
      forbiddenToolIds: Object.freeze(input.toolManifest.forbiddenTools.map((tool) => tool.toolId)),
    }),
    proposals: Object.freeze({
      ruleProposalId: input.ruleProposal.proposalId,
      llmProposalId: input.llmProposal?.proposalId ?? null,
      ruleSource: input.ruleProposal.source,
      llmSource: input.llmProposal?.source ?? null,
      ruleConfidence: input.ruleProposal.confidence,
      llmConfidence: input.llmProposal?.confidence ?? null,
    }),
    arbiter: Object.freeze({
      acceptedSource: input.arbiterResult.acceptedSource,
      reason: input.arbiterResult.reason,
      bounded: input.arbiterResult.bounded,
      rejectedReasons: Object.freeze([...input.arbiterResult.rejectedReasons]),
      validationNotes: Object.freeze([...input.arbiterResult.validationNotes]),
      normalizationNotes: Object.freeze([...(input.normalizationNotes || [])]),
    }),
    replay: Object.freeze({
      acceptedProposalId,
      durationUs: input.trace.durationUs,
    }),
  });
}

export function summarizeAgentHarnessObservation(observation: AgentHarnessObservation): string {
  return [
    observation.channel,
    observation.agentId,
    `accepted=${observation.arbiter.acceptedSource}`,
    `proposal=${observation.replay.acceptedProposalId}`,
    `tools=${observation.tools.availableToolIds.length}`,
  ].join(' | ');
}
