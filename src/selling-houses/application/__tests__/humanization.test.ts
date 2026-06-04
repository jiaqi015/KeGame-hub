import { describe, it, expect } from 'vitest';
import type { ConversationSceneInputPack } from '../../core/world-state/conversation/models';
import { buildConversationContext } from '../wechatConversation';
import { applyHumanization, applyEmotionalVariant } from '../agents/humanization';

function buildScene(overrides: Partial<ConversationSceneInputPack> = {}): ConversationSceneInputPack {
  return {
    sceneId: 'test', runId: 'run', day: 1,
    conversationKey: 'owner:test', sourceMessageId: 'msg-1',
    sceneType: 'owner_wechat', playerText: '测试消息',
    sourceMessage: { messageId: 'msg-1', senderName: '王姐', senderRole: 'owner', content: '现在市场怎么样？', timeLabel: '14:30', urgency: 'high' },
    caseContext: {
      caseId: 'case-1', title: '天山花园3房', ownerName: '王姐', district: '长宁', community: '天山花园',
      askPrice: 680, marketPrice: 620, priceGapPct: 9.7, trust: 50, patience: 50, urgency: 50,
      heat: 60, competitiveness: 55, hasCompletedFirstVisit: true, ownerProfileLabel: '焦虑型',
    },
    recentTurns: [],
    ...overrides,
  };
}

describe('Humanization', () => {
  describe('applyHumanization', () => {
    it('should add emotional expression for frustrated state', () => {
      const scene = buildScene({ caseContext: { trust: 25, patience: 20, urgency: 85 } as any });
      const ctx = buildConversationContext(scene);
      const reply = '你得拿出具体动作让我看到变化。';
      const result = applyHumanization(reply, ctx);
      expect(result.length).toBeGreaterThan(reply.length);
    });

    it('should add emotional expression for anxious state', () => {
      const scene = buildScene({ caseContext: { trust: 35, patience: 20, urgency: 50 } as any });
      const ctx = buildConversationContext(scene);
      const reply = '你今天要给我一个明确判断。';
      const result = applyHumanization(reply, ctx);
      expect(result.length).toBeGreaterThan(reply.length);
    });

    it('should add emotional expression for hopeful state', () => {
      const scene = buildScene({ caseContext: { trust: 70, patience: 60, urgency: 40 } as any });
      const ctx = buildConversationContext(scene);
      const reply = '好，你把竞品和客户反馈整理一下。';
      const result = applyHumanization(reply, ctx);
      expect(result.length).toBeGreaterThan(reply.length);
    });

    it('should not add emotional expression for calm state', () => {
      const scene = buildScene({ caseContext: { trust: 50, patience: 50, urgency: 50 } as any });
      const ctx = buildConversationContext(scene);
      const reply = '收到，你把关键情况确认清楚。';
      const result = applyHumanization(reply, ctx);
      expect(result).toBe(reply);
    });

    it('should add personality quirk for assertive owner', () => {
      const scene = buildScene({ caseContext: { ownerProfileLabel: '强势型', trust: 25, patience: 20, urgency: 85 } as any });
      const ctx = buildConversationContext(scene);
      const reply = '你得给我依据。';
      const result = applyHumanization(reply, ctx);
      expect(result.length).toBeGreaterThan(reply.length);
    });

    it('should add personality quirk for anxious owner', () => {
      const scene = buildScene({ caseContext: { ownerProfileLabel: '焦虑型', trust: 35, patience: 20, urgency: 50 } as any });
      const ctx = buildConversationContext(scene);
      const reply = '你今天要给我一个明确判断。';
      const result = applyHumanization(reply, ctx);
      expect(result.length).toBeGreaterThan(reply.length);
    });
  });

  describe('applyEmotionalVariant', () => {
    it('should return different reply for frustrated vs calm', () => {
      const frustratedScene = buildScene({ caseContext: { trust: 25, patience: 20, urgency: 85 } as any });
      const calmScene = buildScene({ caseContext: { trust: 50, patience: 50, urgency: 50 } as any });
      const frustratedCtx = buildConversationContext(frustratedScene);
      const calmCtx = buildConversationContext(calmScene);
      const baseReply = '你得拿出具体动作让我看到变化。';
      const frustratedReply = applyEmotionalVariant(baseReply, frustratedCtx);
      const calmReply = applyEmotionalVariant(baseReply, calmCtx);
      expect(frustratedReply).not.toBe(calmReply);
    });

    it('should return different reply for anxious vs hopeful', () => {
      const anxiousScene = buildScene({ caseContext: { trust: 35, patience: 20, urgency: 50 } as any });
      const hopefulScene = buildScene({ caseContext: { trust: 70, patience: 60, urgency: 40 } as any });
      const anxiousCtx = buildConversationContext(anxiousScene);
      const hopefulCtx = buildConversationContext(hopefulScene);
      const baseReply = '你今天要给我一个明确判断。';
      const anxiousReply = applyEmotionalVariant(baseReply, anxiousCtx);
      const hopefulReply = applyEmotionalVariant(baseReply, hopefulCtx);
      expect(anxiousReply).not.toBe(hopefulReply);
    });
  });
});
