import type { AgentHarnessObservation } from './observation.js';
import type { AgentShadowReport } from './shadowReport.js';

export type AgentEvaluationStatus = 'pass' | 'review' | 'watch';
export type AgentEvaluationVerdict = 'strong' | 'acceptable' | 'needs-work';

export interface AgentEvaluationReport {
  readonly reportId: string;
  readonly observationId: string;
  readonly runId: string;
  readonly agentId: string;
  readonly channel: string;
  readonly status: AgentEvaluationStatus;
  readonly verdict: AgentEvaluationVerdict;
  readonly score: number;
  readonly signals: readonly string[];
  readonly summary: string;
}

export function buildAgentEvaluationReport(
  observation: AgentHarnessObservation,
  shadowReport?: AgentShadowReport | null,
): AgentEvaluationReport {
  const score = clampScore(scoreObservation(observation, shadowReport));
  const status = resolveStatus(observation, shadowReport, score);
  const verdict = resolveVerdict(score);
  const signals = buildSignals(observation, shadowReport, score, status);
  const summary = buildSummary(observation, shadowReport, score, verdict);

  return Object.freeze({
    reportId: `evaluation-report:${observation.observationId}`,
    observationId: observation.observationId,
    runId: observation.runId,
    agentId: observation.agentId,
    channel: observation.channel,
    status,
    verdict,
    score,
    signals: Object.freeze(signals),
    summary,
  });
}

function scoreObservation(
  observation: AgentHarnessObservation,
  shadowReport?: AgentShadowReport | null,
): number {
  let score = 60;

  if (!shadowReport) {
    score -= 10;
  } else {
    if (shadowReport.status === 'clean') score += 18;
    if (shadowReport.status === 'needs-review') score -= 22;
    if (shadowReport.status === 'no-shadow') score -= 10;
    if (shadowReport.decision === 'llm-won') score += 14;
    if (shadowReport.decision === 'rule-kept') score += 3;
    if (shadowReport.decision === 'rule-only') score -= 6;
    if (typeof shadowReport.confidenceDelta === 'number') {
      const delta = Math.min(12, Math.max(-12, Math.round((0.25 - Math.abs(shadowReport.confidenceDelta)) * 40)));
      score += delta;
    }
    if (shadowReport.riskLevel === 'high') score -= 18;
    if (shadowReport.riskLevel === 'medium') score -= 6;
  }

  if (observation.arbiter.acceptedSource === 'llm') score += 10;
  if (observation.arbiter.acceptedSource === 'rule' && observation.proposals.llmProposalId) score -= 4;
  if (observation.arbiter.rejectedReasons.length > 0) score -= 14;
  if (observation.tools.forbiddenToolIds.length > 0) score += 2;
  if (observation.context.contextBudgetSummary?.includes('已压缩')) score += 1;
  if (observation.context.visibleRefs.length >= 3) score += 3;
  if (observation.context.pressure.length > 0) score += 1;

  return score;
}

function resolveStatus(
  observation: AgentHarnessObservation,
  shadowReport: AgentShadowReport | null | undefined,
  score: number,
): AgentEvaluationStatus {
  if (shadowReport?.status === 'needs-review') return 'review';
  if (!shadowReport || shadowReport.status === 'no-shadow') return 'watch';
  if (observation.arbiter.rejectedReasons.length > 0) return 'review';
  if (score >= 80) return 'pass';
  return 'watch';
}

function resolveVerdict(score: number): AgentEvaluationVerdict {
  if (score >= 80) return 'strong';
  if (score >= 60) return 'acceptable';
  return 'needs-work';
}

function buildSignals(
  observation: AgentHarnessObservation,
  shadowReport: AgentShadowReport | null | undefined,
  score: number,
  status: AgentEvaluationStatus,
): string[] {
  const signals: string[] = [];
  const isNoShadow = shadowReport?.status === 'no-shadow';
  signals.push(`score:${score}`);
  signals.push(`status:${status}`);
  if (isNoShadow) signals.push('shadow_no_llm');
  if (shadowReport?.status === 'needs-review') signals.push('shadow_review');
  if (shadowReport?.decision === 'llm-won') signals.push('shadow_llm_won');
  if (shadowReport?.decision === 'rule-kept') signals.push('shadow_rule_kept');
  if (isNoShadow && observation.arbiter.rejectedReasons.includes('llm_error')) {
    signals.push('llm_unavailable');
  }
  if (!isNoShadow && observation.arbiter.rejectedReasons.length > 0) signals.push('llm_rejected');
  if (observation.arbiter.acceptedSource === 'llm') signals.push('accepted_llm');
  if (observation.arbiter.acceptedSource === 'rule') signals.push('accepted_rule');
  if (!isNoShadow && observation.arbiter.rejectedReasons.length > 0) signals.push('arbiter_rejected');
  if (observation.context.contextBudgetSummary?.includes('已压缩')) signals.push('context_compacted');
  return signals;
}

function buildSummary(
  observation: AgentHarnessObservation,
  shadowReport: AgentShadowReport | null | undefined,
  score: number,
  verdict: AgentEvaluationVerdict,
): string {
  if (!shadowReport) {
    return `${observation.channel} 还没有 shadow 对比，本轮只验证了规则路径，评分 ${score}。`;
  }
  if (shadowReport.status === 'needs-review') {
    return `${observation.channel} 的 shadow 对比需要回看，评分 ${score}，当前 verdict ${verdict}。`;
  }
  if (shadowReport.status === 'no-shadow') {
    return `${observation.channel} 暂无 LLM proposal，评分 ${score}，属于规则兜底观测。`;
  }
  return `${observation.channel} shadow 对比正常，评分 ${score}，verdict ${verdict}。`;
}

function clampScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.max(0, Math.min(100, Math.round(score)));
}
