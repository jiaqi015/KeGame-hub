import { describe, expect, it } from 'vitest';
import {
  buildShadowComparisonReport,
  summarizeShadowComparisonReport,
} from '../shadowComparison.js';
import type { ConversationEffectProposal } from '../../core/world-state/conversation/models.js';

function buildProposal(overrides: Partial<ConversationEffectProposal> = {}): ConversationEffectProposal {
  return {
    summary: '默认摘要',
    recipientReply: '默认回复',
    intentKinds: ['reassure'],
    riskKinds: ['none'],
    evidenceUse: 'mentioned',
    confidence: 0.62,
    ...overrides,
  } as ConversationEffectProposal;
}

describe('shadow comparison', () => {
  it('compares rule and AI outputs across risk, next step, and core issue', () => {
    const report = buildShadowComparisonReport({
      scopeType: 'conversation',
      scopeId: 'owner:shaonvshi',
      sourceText: '今天能不能给个明确方案，别只是说再等等。价格和面访要讲清楚。',
      focusTerms: ['明确方案', '再等等', '价格', '面访'],
      criticalRiskKinds: ['missing_next_step', 'empty_comfort', 'ignores_customer'],
      ruleProposal: buildProposal({
        summary: '先安抚一下',
        recipientReply: '我再看看吧。',
        intentKinds: ['reassure'],
        riskKinds: ['empty_comfort'],
        evidenceUse: 'mentioned',
        nextStep: { kind: 'none', label: '无', reason: '没有明确下一步', priority: 'low' },
      }),
      aiProposal: buildProposal({
        summary: '先把客户反馈、竞品价格和下一步摊开说清楚',
        recipientReply: '我今天先不让您只听一句再等等，下午当面把客户反馈、竞品价格和方案讲清楚。',
        intentKinds: ['present_market_evidence', 'propose_face_visit', 'promise_feedback'],
        riskKinds: ['missing_next_step', 'ignores_customer'],
        evidenceUse: 'specific',
        nextStep: {
          kind: 'schedule_face_visit',
          actionId: 'owner-face-visit',
          label: '安排面访',
          reason: '把客户反馈和竞品价格当面讲清楚',
          priority: 'high',
        },
      }),
    });

    expect(report.overallWinner).toBe('ai');
    expect(report.dimensions.map((dimension) => `${dimension.id}:${dimension.winner}`)).toEqual([
      'risk_hit:ai',
      'next_step:ai',
      'core_issue:ai',
    ]);
    expect(report.rule.nextStepKind).toBe('none');
    expect(report.ai.nextStepKind).toBe('schedule_face_visit');
    expect(report.signals).toContain('overall:ai');
    expect(report.signals).toContain('dimension:risk_hit:ai');
    expect(summarizeShadowComparisonReport(report)).toContain('AI');
  });
});
