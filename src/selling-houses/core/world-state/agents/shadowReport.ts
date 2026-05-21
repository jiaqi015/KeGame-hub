import type { AgentHarnessObservation } from './observation.js';

export type AgentShadowReportStatus = 'clean' | 'needs-review' | 'no-shadow';
export type AgentShadowReportDecision = 'rule-only' | 'llm-won' | 'rule-kept';
export type AgentShadowRiskLevel = 'low' | 'medium' | 'high';

export interface AgentShadowReport {
  readonly reportId: string;
  readonly observationId: string;
  readonly runId: string;
  readonly agentId: string;
  readonly channel: string;
  readonly status: AgentShadowReportStatus;
  readonly decision: AgentShadowReportDecision;
  readonly riskLevel: AgentShadowRiskLevel;
  readonly confidenceDelta: number | null;
  readonly acceptedProposalId: string;
  readonly signals: readonly string[];
  readonly summary: string;
}

export function buildAgentShadowReport(observation: AgentHarnessObservation): AgentShadowReport {
  const llmMissing = !observation.proposals.llmProposalId;
  const llmRejected = observation.arbiter.rejectedReasons.length > 0;
  const llmAccepted = observation.arbiter.acceptedSource === 'llm';
  const confidenceDelta = typeof observation.proposals.llmConfidence === 'number'
    ? round2(observation.proposals.llmConfidence - observation.proposals.ruleConfidence)
    : null;
  const signals = buildSignals(observation, { llmMissing, llmRejected, llmAccepted, confidenceDelta });
  const decision = resolveDecision({ llmMissing, llmAccepted });
  const status = resolveStatus({ llmMissing, llmRejected });
  const riskLevel = resolveRiskLevel(observation, { llmMissing, llmRejected, confidenceDelta });

  return Object.freeze({
    reportId: `shadow-report:${observation.observationId}`,
    observationId: observation.observationId,
    runId: observation.runId,
    agentId: observation.agentId,
    channel: observation.channel,
    status,
    decision,
    riskLevel,
    confidenceDelta,
    acceptedProposalId: observation.replay.acceptedProposalId,
    signals: Object.freeze(signals),
    summary: buildSummary(observation, { status, decision, confidenceDelta }),
  });
}

function resolveDecision(input: {
  readonly llmMissing: boolean;
  readonly llmAccepted: boolean;
}): AgentShadowReportDecision {
  if (input.llmMissing) return 'rule-only';
  return input.llmAccepted ? 'llm-won' : 'rule-kept';
}

function resolveStatus(input: {
  readonly llmMissing: boolean;
  readonly llmRejected: boolean;
}): AgentShadowReportStatus {
  if (input.llmMissing) return 'no-shadow';
  if (input.llmRejected) return 'needs-review';
  return 'clean';
}

function resolveRiskLevel(
  observation: AgentHarnessObservation,
  input: {
    readonly llmMissing: boolean;
    readonly llmRejected: boolean;
    readonly confidenceDelta: number | null;
  },
): AgentShadowRiskLevel {
  if (input.llmRejected) return 'high';
  if (input.llmMissing) return 'medium';
  if (!observation.arbiter.bounded) return 'high';
  if (typeof input.confidenceDelta === 'number' && Math.abs(input.confidenceDelta) >= 0.25) return 'medium';
  return 'low';
}

function buildSignals(
  observation: AgentHarnessObservation,
  input: {
    readonly llmMissing: boolean;
    readonly llmRejected: boolean;
    readonly llmAccepted: boolean;
    readonly confidenceDelta: number | null;
  },
): string[] {
  const signals: string[] = [];
  if (input.llmMissing) signals.push('llm_proposal_missing');
  if (input.llmRejected) signals.push('llm_rejected');
  if (input.llmAccepted) signals.push('accepted_llm');
  if (observation.arbiter.acceptedSource === 'rule' && !input.llmMissing) signals.push('accepted_rule');
  if (observation.tools.forbiddenToolIds.length > 0) signals.push('forbidden_guardrails_present');
  if (observation.context.contextBudgetSummary?.includes('已压缩')) signals.push('context_compacted');
  if (typeof input.confidenceDelta === 'number') signals.push(`confidence_delta:${input.confidenceDelta.toFixed(2)}`);
  return signals;
}

function buildSummary(
  observation: AgentHarnessObservation,
  input: {
    readonly status: AgentShadowReportStatus;
    readonly decision: AgentShadowReportDecision;
    readonly confidenceDelta: number | null;
  },
): string {
  if (input.status === 'no-shadow') {
    return `${observation.channel} 没有 LLM proposal，本轮只能验证规则兜底和上下文边界。`;
  }
  if (input.status === 'needs-review') {
    return `${observation.channel} 的 LLM proposal 被裁决器拒绝，需要检查 prompt、上下文或校验规则。`;
  }
  return `${observation.channel} shadow 对比正常，${input.decision === 'llm-won' ? 'LLM proposal 被采纳' : '规则 proposal 保持领先'}${typeof input.confidenceDelta === 'number' ? `，置信差 ${input.confidenceDelta.toFixed(2)}` : ''}。`;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
