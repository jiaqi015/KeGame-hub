import { describe, expect, it } from 'vitest';
import { buildAgentEvaluationReport } from '../agents/evaluationReport.js';
import type { AgentHarnessObservation } from '../agents/observation.js';
import type { AgentShadowReport } from '../agents/shadowReport.js';

function buildObservation(overrides: Partial<AgentHarnessObservation> = {}): AgentHarnessObservation {
  return {
    observationId: 'obs-1',
    runId: 'run-1',
    agentId: 'wechat:owner:shaonvshi',
    channel: 'wechat',
    mode: 'hybrid',
    day: 7,
    context: {
      contextPackRef: 'case-context:case-1:7',
      inputPackRef: 'scene-1',
      contextBudgetSummary: '市场信号 5/6；已压缩',
      visibleRefs: ['msg-1', 'case-1'],
      memoryFactIds: ['memory-1'],
      pressure: ['业主催促感偏强'],
      uncertainty: ['客户反馈待确认'],
    },
    tools: {
      enabledToolsets: ['case-read', 'memory-read', 'dialogue-proposal'],
      disabledToolsets: [],
      availableToolIds: ['case.getFullContext', 'memory.retrieve', 'dialogue.proposeEffect'],
      forbiddenToolIds: ['state.writeDirectly'],
    },
    proposals: {
      ruleProposalId: 'rule:scene-1',
      llmProposalId: null,
      ruleSource: 'rule',
      llmSource: null,
      ruleConfidence: 0.72,
      llmConfidence: null,
    },
    arbiter: {
      acceptedSource: 'rule',
      reason: 'rule-only mode: no LLM proposal available',
      bounded: true,
      rejectedReasons: [],
      validationNotes: [],
      normalizationNotes: [],
    },
    replay: {
      acceptedProposalId: 'rule:scene-1',
      durationUs: 1200,
    },
    ...overrides,
  };
}

function buildShadow(overrides: Partial<AgentShadowReport> = {}): AgentShadowReport {
  return {
    reportId: 'shadow-report:obs-1',
    observationId: 'obs-1',
    runId: 'run-1',
    agentId: 'wechat:owner:shaonvshi',
    channel: 'wechat',
    status: 'no-shadow',
    decision: 'rule-only',
    riskLevel: 'medium',
    confidenceDelta: null,
    acceptedProposalId: 'rule:scene-1',
    signals: ['llm_proposal_missing'],
    summary: '没有 LLM proposal，本轮只能验证规则兜底和上下文边界。',
    ...overrides,
  };
}

describe('agent evaluation report', () => {
  it('downgrades rule-only observations to watch status', () => {
    const report = buildAgentEvaluationReport(buildObservation(), buildShadow());

    expect(report.status).toBe('watch');
    expect(report.verdict).toBe('needs-work');
    expect(report.score).toBeLessThan(70);
    expect(report.signals).toContain('shadow_no_llm');
  });

  it('keeps no-shadow fallback as watch even when the arbiter records model errors', () => {
    const report = buildAgentEvaluationReport(
      buildObservation({
        arbiter: {
          acceptedSource: 'rule',
          reason: 'LLM error: model_not_available; rule-only mode: no LLM proposal available',
          bounded: true,
          rejectedReasons: ['llm_error'],
          validationNotes: [],
          normalizationNotes: [],
        },
      }),
      buildShadow(),
    );

    expect(report.status).toBe('watch');
    expect(report.signals).toContain('shadow_no_llm');
    expect(report.signals).toContain('llm_unavailable');
    expect(report.signals).not.toContain('llm_rejected');
  });

  it('scores clean llm wins as strong enough for pass', () => {
    const report = buildAgentEvaluationReport(
      buildObservation({
        proposals: {
          ruleProposalId: 'rule:scene-1',
          llmProposalId: 'llm:scene-1',
          ruleSource: 'rule',
          llmSource: 'llm',
          ruleConfidence: 0.62,
          llmConfidence: 0.88,
        },
        arbiter: {
          acceptedSource: 'llm',
          reason: 'LLM confidence 0.88 > rule 0.62',
          bounded: true,
          rejectedReasons: [],
          validationNotes: [],
          normalizationNotes: [],
        },
        replay: {
          acceptedProposalId: 'llm:scene-1',
          durationUs: 1800,
        },
      }),
      buildShadow({
        status: 'clean',
        decision: 'llm-won',
        riskLevel: 'low',
        confidenceDelta: 0.26,
        acceptedProposalId: 'llm:scene-1',
        signals: ['accepted_llm', 'confidence_delta:0.26'],
        summary: 'wechat shadow 对比正常，LLM proposal 被采纳，置信差 0.26。',
      }),
    );

    expect(report.status).toBe('pass');
    expect(report.verdict).toBe('strong');
    expect(report.score).toBeGreaterThanOrEqual(80);
    expect(report.signals).toContain('accepted_llm');
  });

  it('marks rejected llm proposals as review-worthy', () => {
    const report = buildAgentEvaluationReport(
      buildObservation({
        proposals: {
          ruleProposalId: 'rule:scene-1',
          llmProposalId: 'llm:scene-1',
          ruleSource: 'rule',
          llmSource: 'llm',
          ruleConfidence: 0.72,
          llmConfidence: 0.9,
        },
        arbiter: {
          acceptedSource: 'rule',
          reason: 'LLM proposal validation failed: proposal_claims_forbidden_action',
          bounded: true,
          rejectedReasons: ['llm_proposal_validation_failed'],
          validationNotes: ['proposal_claims_forbidden_action'],
          normalizationNotes: [],
        },
      }),
      buildShadow({
        status: 'needs-review',
        decision: 'rule-kept',
        riskLevel: 'high',
        confidenceDelta: 0.18,
        acceptedProposalId: 'rule:scene-1',
        signals: ['llm_rejected', 'accepted_rule'],
        summary: 'wechat 的 LLM proposal 被裁决器拒绝，需要检查 prompt、上下文或校验规则。',
      }),
    );

    expect(report.status).toBe('review');
    expect(report.verdict).toBe('needs-work');
    expect(report.score).toBeLessThan(60);
    expect(report.signals).toContain('llm_rejected');
  });
});
