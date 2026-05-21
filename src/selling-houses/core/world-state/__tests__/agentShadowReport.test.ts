import { describe, expect, it } from 'vitest';
import { buildAgentShadowReport } from '../agents/shadowReport.js';
import type { AgentHarnessObservation } from '../agents/observation.js';

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
      forbiddenToolIds: ['state.writeDirectly', 'price.changeDirectly'],
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

describe('agent shadow report', () => {
  it('marks rule-only observations as missing shadow signal', () => {
    const report = buildAgentShadowReport(buildObservation());

    expect(report.status).toBe('no-shadow');
    expect(report.decision).toBe('rule-only');
    expect(report.signals).toContain('llm_proposal_missing');
    expect(report.summary).toContain('没有 LLM proposal');
  });

  it('summarizes when LLM wins over rule in a bounded way', () => {
    const report = buildAgentShadowReport(buildObservation({
      proposals: {
        ruleProposalId: 'rule:scene-1',
        llmProposalId: 'llm:scene-1',
        ruleSource: 'rule',
        llmSource: 'llm',
        ruleConfidence: 0.62,
        llmConfidence: 0.86,
      },
      arbiter: {
        acceptedSource: 'llm',
        reason: 'LLM confidence 0.86 > rule 0.62',
        bounded: true,
        rejectedReasons: [],
        validationNotes: [],
        normalizationNotes: [],
      },
      replay: {
        acceptedProposalId: 'llm:scene-1',
        durationUs: 1800,
      },
    }));

    expect(report.status).toBe('clean');
    expect(report.decision).toBe('llm-won');
    expect(report.confidenceDelta).toBeCloseTo(0.24);
    expect(report.signals).toContain('accepted_llm');
  });

  it('flags rejected LLM proposals as review-worthy', () => {
    const report = buildAgentShadowReport(buildObservation({
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
    }));

    expect(report.status).toBe('needs-review');
    expect(report.decision).toBe('rule-kept');
    expect(report.signals).toContain('llm_rejected');
    expect(report.riskLevel).toBe('high');
  });
});
