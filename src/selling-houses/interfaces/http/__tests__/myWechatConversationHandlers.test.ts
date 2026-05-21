import { describe, expect, it } from 'vitest';
import { handleMyWechatConversationTurn } from '../myWechatConversationHandlers.js';

describe('handleMyWechatConversationTurn redline guard', () => {
  it('settles hostile dialogue locally before any model dependency is needed', async () => {
    const result = await handleMyWechatConversationTurn({
      scene: {
        sceneId: 'hostile-handler-scene',
        runId: 'run-1',
        day: 7,
        conversationKey: 'owner:lin',
        sourceMessageId: 'msg-1',
        sceneType: 'owner_wechat',
        playerText: '爱咋咋地',
        sourceMessage: {
          messageId: 'msg-1',
          senderName: '林老伯',
          senderRole: 'owner',
          content: '今天给我一个明确方案。',
          timeLabel: 'DAY 7',
          urgency: 'urgent',
        },
        caseContext: {
          caseId: 'case-1',
          title: '瑞和里 89㎡ 两房',
          ownerName: '林老伯',
          district: '浦东前滩',
          community: '瑞和里',
          askPrice: 820,
          marketPrice: 804,
          priceGapPct: 2,
          trust: 41,
          patience: 50,
          urgency: 75,
          heat: 64,
          competitiveness: 58,
          hasCompletedFirstVisit: false,
          ownerProfileLabel: '焦虑业主',
        },
        recentTurns: [],
      },
    });

    expect(result.status).toBe(200);
    expect(result.body.source).toBe('fallback');
    expect(result.body.error).toBeUndefined();
    expect(result.body.proposal.intentKinds).toContain('hostile');
    expect(result.body.proposal.riskKinds).toContain('offensive_reply');
    expect(result.body.trace?.llmSource).toBeNull();
    expect(result.body.observation?.tools.forbiddenToolIds).toContain('state.writeDirectly');
    expect(result.body.observation?.arbiter.acceptedSource).toBe('rule');
    expect(result.body.shadowReport?.status).toBe('no-shadow');
    expect(result.body.evaluationReport?.status).toBe('watch');
  });
});
