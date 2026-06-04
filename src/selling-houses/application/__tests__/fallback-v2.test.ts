import { describe, it, expect } from 'vitest';
import type { ConversationSceneInputPack, ConversationContext } from '../../core/world-state/conversation/models';
import { buildConversationContext } from '../wechatConversation';

function buildScene(overrides: Partial<ConversationSceneInputPack> = {}): ConversationSceneInputPack {
  return {
    sceneId: 'test', runId: 'run', day: 1,
    conversationKey: 'owner:test', sourceMessageId: 'msg-1',
    sceneType: 'owner_wechat', playerText: '测试消息',
    sourceMessage: { messageId: 'msg-1', senderName: '王姐', senderRole: 'owner', content: '现在市场怎么样？', timeLabel: '14:30', urgency: 'high' },
    caseContext: {
      caseId: 'case-1', title: '天山花园3房', ownerName: '王姐', district: '长宁', community: '天山花园',
      askPrice: 680, marketPrice: 620, priceGapPct: 9.7, trust: 35, patience: 25, urgency: 80,
      heat: 60, competitiveness: 55, hasCompletedFirstVisit: true, ownerProfileLabel: '焦虑型',
    },
    recentTurns: [],
    ...overrides,
  };
}

describe('Fallback 2.0 — ConversationContext', () => {
  describe('buildConversationContext', () => {
    it('should extract all fields from scene', () => {
      const scene = buildScene();
      const ctx = buildConversationContext(scene);

      expect(ctx.senderName).toBe('王姐');
      expect(ctx.sceneType).toBe('owner_wechat');
      expect(ctx.sourceContent).toBe('现在市场怎么样？');
      expect(ctx.playerText).toBe('测试消息');
      expect(ctx.caseRef).toBe('天山花园3房这套');
      expect(ctx.trust).toBe(35);
      expect(ctx.patience).toBe(25);
      expect(ctx.urgency).toBe(80);
      expect(ctx.priceGapPct).toBe(9.7);
      expect(ctx.ownerProfileLabel).toBe('焦虑型');
    });

    it('should compute isAssertive and isAnxious from ownerProfileLabel', () => {
      const assertiveScene = buildScene({
        caseContext: { ownerProfileLabel: '强势型' } as any,
      });
      const assertiveCtx = buildConversationContext(assertiveScene);
      expect(assertiveCtx.isAssertive).toBe(true);
      expect(assertiveCtx.isAnxious).toBe(false);

      const anxiousScene = buildScene({
        caseContext: { ownerProfileLabel: '焦虑型' } as any,
      });
      const anxiousCtx = buildConversationContext(anxiousScene);
      expect(anxiousCtx.isAssertive).toBe(false);
      expect(anxiousCtx.isAnxious).toBe(true);
    });

    it('should compute emotionalState from trust/patience/urgency', () => {
      const frustratedScene = buildScene({
        caseContext: { trust: 25, patience: 20, urgency: 85 } as any,
      });
      const frustratedCtx = buildConversationContext(frustratedScene);
      expect(frustratedCtx.emotionalState).toBe('frustrated');

      const calmScene = buildScene({
        caseContext: { trust: 60, patience: 60, urgency: 40 } as any,
      });
      const calmCtx = buildConversationContext(calmScene);
      expect(calmCtx.emotionalState).toBe('calm');
    });

    it('should compute relationshipStage from trust/patience', () => {
      const crisisScene = buildScene({
        caseContext: { trust: 20, patience: 15 } as any,
      });
      const crisisCtx = buildConversationContext(crisisScene);
      expect(crisisCtx.relationshipStage).toBe('crisis');

      const stableScene = buildScene({
        caseContext: { trust: 60, patience: 60 } as any,
      });
      const stableCtx = buildConversationContext(stableScene);
      expect(stableCtx.relationshipStage).toBe('stable');
    });

    it('should extract playerDetails from playerText', () => {
      const scene = buildScene({ playerText: '市场价大概620万，建议调到640万。' });
      const ctx = buildConversationContext(scene);
      expect(ctx.playerDetails.priceRef).toBe('620万');
    });

    it('should extract promises from caseContext', () => {
      const scene = buildScene({
        caseContext: { promisesNotYetFulfilled: ['今天下午去面访'] } as any,
      });
      const ctx = buildConversationContext(scene);
      expect(ctx.promises).toEqual(['今天下午去面访']);
    });

    it('should extract serviceStrategy from caseContext', () => {
      const scene = buildScene({
        caseContext: {
          serviceStrategy: {
            primaryGoal: '把高价期待转成可验证的市场动作',
            communicationStyle: '先承认价值，再给证据。',
          },
        } as any,
      });
      const ctx = buildConversationContext(scene);
      expect(ctx.serviceStrategy?.primaryGoal).toBe('把高价期待转成可验证的市场动作');
    });

    it('should work for manager scene', () => {
      const scene = buildScene({
        sceneType: 'manager_wechat',
        sourceMessage: { messageId: 'msg-1', senderName: '赵经理', senderRole: 'store_manager', content: '天山花园那套怎么样了？', timeLabel: '14:30', urgency: 'high' },
      });
      const ctx = buildConversationContext(scene);
      expect(ctx.isManager).toBe(true);
      expect(ctx.isCustomer).toBe(false);
      expect(ctx.senderName).toBe('赵经理');
    });

    it('should work for customer scene', () => {
      const scene = buildScene({
        sceneType: 'customer_wechat',
        sourceMessage: { messageId: 'msg-1', senderName: '陈先生', senderRole: 'customer', content: '这套房子有什么缺点吗？', timeLabel: '14:30', urgency: 'medium' },
        opportunityContext: { opportunityId: 'opp-1', customerName: '陈先生', stage: '初看', intent: 55, confidence: 45 },
      });
      const ctx = buildConversationContext(scene);
      expect(ctx.isCustomer).toBe(true);
      expect(ctx.customerName).toBe('陈先生');
      expect(ctx.customerIntent).toBe(55);
    });
  });
});
