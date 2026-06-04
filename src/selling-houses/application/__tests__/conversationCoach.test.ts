import { describe, expect, it } from 'vitest';
import { buildCoachFeedback } from '../conversationCoach.js';
import type { ConversationReceipt } from '../../core/world-state/conversation/models.js';

function buildReceipt(overrides: Partial<ConversationReceipt> = {}): ConversationReceipt {
  return {
    receiptId: 'receipt-1',
    conversationKey: 'owner:shaonvshi',
    sourceMessageId: 'msg-1',
    day: 7,
    turnIndex: 1,
    sceneType: 'owner_wechat',
    actorName: '邵女士',
    actorRole: 'owner',
    playerText: '下午我把客户反馈和竞品价格当面说清楚。',
    recipientReply: '好，你把客户反馈和竞品价格摊开说。',
    summary: '回复完成了基础安抚，但后续还需要更明确动作。',
    proposal: {
      summary: '回复完成了基础安抚，但后续还需要更明确动作。',
      recipientReply: '好，你把客户反馈和竞品价格摊开说。',
      intentKinds: ['reassure'],
      riskKinds: ['none'],
      evidenceUse: 'mentioned',
      trustDelta: 1,
      patienceDelta: 0,
      urgencyDelta: 0,
      priceFlexibilityDelta: 0,
      customerIntentDelta: 0,
      customerConfidenceDelta: 0,
      confidence: 0.6,
    },
    settlement: {
      trustDelta: 1,
      patienceDelta: 0,
      urgencyDelta: 0,
      priceFlexibilityDelta: 0,
      customerIntentDelta: 0,
      customerConfidenceDelta: 0,
      effectLabels: [],
    },
    nextSteps: [],
    source: 'fallback',
    traceSnapshot: {
      acceptedSource: 'rule',
      ruleConfidence: 0.52,
      llmConfidence: null,
      pressure: [],
      uncertainty: [],
      memoryFactCount: 0,
      contextSignalCount: 0,
      arbiterDecision: 'rule fallback',
      validationNotes: [],
      rejectedReasons: [],
      evaluationVerdict: 'acceptable',
      evaluationStatus: 'pass',
      evaluationSignals: [],
      evaluationSummary: '微信回合评估通过',
    },
    ...overrides,
  } as ConversationReceipt;
}

describe('conversationCoach - buildCoachFeedback', () => {
  it('returns null when traceSnapshot is missing', () => {
    const receipt = buildReceipt({ traceSnapshot: undefined });
    expect(buildCoachFeedback(receipt)).toBeNull();
  });

  it('returns null when evaluationVerdict is missing', () => {
    const receipt = buildReceipt({
      traceSnapshot: {
        acceptedSource: 'rule',
        ruleConfidence: 0.5,
        llmConfidence: null,
        pressure: [],
        uncertainty: [],
        memoryFactCount: 0,
        contextSignalCount: 0,
        arbiterDecision: '',
        validationNotes: [],
        rejectedReasons: [],
      },
    });
    expect(buildCoachFeedback(receipt)).toBeNull();
  });

  it('returns overall with 基本到位 for verdict=acceptable', () => {
    const receipt = buildReceipt();
    const feedback = buildCoachFeedback(receipt);
    expect(feedback).not.toBeNull();
    expect(feedback!.overall).toContain('基本到位');
  });

  it('returns overall with 需要改进 for verdict=needs-work', () => {
    const receipt = buildReceipt({
      traceSnapshot: {
        acceptedSource: 'rule',
        ruleConfidence: 0.5,
        llmConfidence: null,
        pressure: [],
        uncertainty: [],
        memoryFactCount: 0,
        contextSignalCount: 0,
        arbiterDecision: '',
        validationNotes: [],
        rejectedReasons: [],
        evaluationVerdict: 'needs-work',
        evaluationStatus: 'watch',
        evaluationSignals: [],
        evaluationSummary: '需要改进',
      },
    });
    const feedback = buildCoachFeedback(receipt);
    expect(feedback).not.toBeNull();
    expect(feedback!.overall).toContain('需要改进');
  });

  it('returns insights for empty_comfort risk', () => {
    const receipt = buildReceipt({
      proposal: {
        summary: 'test',
        recipientReply: 'test',
        intentKinds: ['reassure'],
        riskKinds: ['empty_comfort'],
        evidenceUse: 'none',
        confidence: 0.5,
      },
      settlement: {
        trustDelta: -1,
        patienceDelta: -1,
        urgencyDelta: 0,
        priceFlexibilityDelta: 0,
        customerIntentDelta: 0,
        customerConfidenceDelta: 0,
        effectLabels: [],
      },
    });
    const feedback = buildCoachFeedback(receipt);
    expect(feedback).not.toBeNull();
    expect(feedback!.insights.some((s) => s.includes('具体方案'))).toBe(true);
  });

  it('returns overall with 核心问题 for ignores_customer risk', () => {
    const receipt = buildReceipt({
      proposal: {
        summary: 'test',
        recipientReply: 'test',
        intentKinds: ['reassure'],
        riskKinds: ['ignores_customer'],
        evidenceUse: 'none',
        confidence: 0.5,
      },
      settlement: {
        trustDelta: -1,
        patienceDelta: 0,
        urgencyDelta: 0,
        priceFlexibilityDelta: 0,
        customerIntentDelta: 0,
        customerConfidenceDelta: 0,
        effectLabels: [],
      },
    });
    const feedback = buildCoachFeedback(receipt);
    expect(feedback).not.toBeNull();
    expect(feedback!.overall).toContain('核心问题');
  });

  it('returns insights for reassure intent with trustDelta<=0', () => {
    const receipt = buildReceipt({
      proposal: {
        summary: 'test',
        recipientReply: 'test',
        intentKinds: ['reassure'],
        riskKinds: ['none'],
        evidenceUse: 'none',
        confidence: 0.5,
      },
      settlement: {
        trustDelta: 0,
        patienceDelta: 0,
        urgencyDelta: 0,
        priceFlexibilityDelta: 0,
        customerIntentDelta: 0,
        customerConfidenceDelta: 0,
        effectLabels: [],
      },
    });
    const feedback = buildCoachFeedback(receipt);
    expect(feedback).not.toBeNull();
    expect(feedback!.insights.some((s) => s.includes('安抚'))).toBe(true);
    expect(feedback!.insights.some((s) => s.includes('信任'))).toBe(true);
  });

  it('returns nextStepAdvice for schedule_face_visit', () => {
    const receipt = buildReceipt({
      proposal: {
        summary: 'test',
        recipientReply: 'test',
        intentKinds: ['propose_face_visit'],
        riskKinds: ['none'],
        evidenceUse: 'mentioned',
        confidence: 0.7,
        nextStep: {
          kind: 'schedule_face_visit',
          actionId: 'first-visit',
          label: '安排面访',
          reason: '对方需要明确方案。',
          priority: 'urgent',
        },
      },
      nextSteps: [{
        kind: 'schedule_face_visit',
        actionId: 'first-visit',
        label: '安排面访',
        reason: '对方需要明确方案。',
        priority: 'urgent',
      }],
    });
    const feedback = buildCoachFeedback(receipt);
    expect(feedback).not.toBeNull();
    expect(feedback!.nextStepAdvice).not.toBeNull();
    expect(feedback!.nextStepAdvice).toContain('面访');
  });

  it('returns null nextStepAdvice when nextStep is none', () => {
    const receipt = buildReceipt({
      proposal: {
        summary: 'test',
        recipientReply: 'test',
        intentKinds: ['reassure'],
        riskKinds: ['none'],
        evidenceUse: 'none',
        confidence: 0.5,
        nextStep: { kind: 'none', label: '继续观察', reason: '无后续', priority: 'low' },
      },
    });
    const feedback = buildCoachFeedback(receipt);
    expect(feedback).not.toBeNull();
    expect(feedback!.nextStepAdvice).toBeNull();
  });
});
