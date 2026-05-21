import { describe, expect, it } from 'vitest';
import { buildConversationEvaluationReport } from '../agents/conversationEvaluation.js';
import type { ConversationEvaluationInput } from '../agents/conversationEvaluation.js';

function buildInput(): ConversationEvaluationInput {
  return {
    conversationKey: 'owner:shaonvshi',
    channel: 'wechat',
    day: 7,
    playerText: '我今天先不让您只听一句再等等，下午当面把客户反馈、竞品价格和可选方案摊开说清楚。',
    recipientReply: '可以，下午把比较和方案带过来。',
    summary: '接住了明确方案和下一步问题，推动到面访与比较。',
    intentKinds: ['present_market_evidence', 'propose_face_visit'],
    riskKinds: ['none'],
    evidenceUse: 'specific',
    nextStep: {
      kind: 'schedule_face_visit',
      label: '安排面访',
      reason: '先把面对面沟通排上，把客户反馈和竞品价格摊开。',
      priority: 'high',
      actionId: 'face-visit',
    },
    trustDelta: 2,
    patienceDelta: 1,
    urgencyDelta: -1,
    priceFlexibilityDelta: 3,
    customerIntentDelta: 0,
    customerConfidenceDelta: 1,
  };
}

describe('conversation evaluation', () => {
  it('returns the minimal structured flags for a healthy turn', () => {
    const report = buildConversationEvaluationReport(buildInput());

    expect(report.overallScore).toBeGreaterThanOrEqual(80);
    expect(report.hasClearNextStep).toBe(true);
    expect(report.hasRisk).toBe(false);
    expect(report.coreIssueMatched).toBe(true);
  });

  it('returns structured motion flags for price / face-visit / follow-up', () => {
    const report = buildConversationEvaluationReport({
      ...buildInput(),
      intentKinds: ['discuss_price', 'propose_face_visit', 'follow_customer'],
      nextStep: {
        kind: 'follow_customer',
        label: '明天回访客户并确认价格反馈',
        reason: '客户已进入比较阶段，需要明确反馈窗口。',
        priority: 'high',
        actionId: 'follow-up',
      },
    });

    expect(report.businessMotion.price).toBe(true);
    expect(report.businessMotion.faceVisit).toBe(true);
    expect(report.businessMotion.followUp).toBe(true);
  });

  it('marks direct relationship risk as review and exposes risk labels', () => {
    const report = buildConversationEvaluationReport({
      ...buildInput(),
      playerText: '你爱卖不卖，别烦我。',
      recipientReply: '你这态度我没法继续沟通。',
      summary: '对话失控。',
      intentKinds: ['hostile'],
      riskKinds: ['offensive_reply', 'ignores_customer'],
      evidenceUse: 'none',
      nextStep: {
        kind: 'none',
        label: '无',
        reason: '关系已经恶化。',
        priority: 'low',
      },
      trustDelta: -6,
      patienceDelta: -4,
      urgencyDelta: 2,
      priceFlexibilityDelta: -3,
      customerIntentDelta: -4,
      customerConfidenceDelta: -5,
    });

    expect(report.status).toBe('review');
    expect(report.hasRisk).toBe(true);
    expect(report.riskLabels).toEqual(expect.arrayContaining(['冒犯性回复', '没接住客户问题']));
  });
});
