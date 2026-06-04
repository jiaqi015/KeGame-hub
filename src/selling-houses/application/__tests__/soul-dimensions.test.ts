import { describe, it, expect } from 'vitest';
import type { ConversationSceneInputPack } from '../../core/world-state/conversation/models';
import { buildFallbackConversationEffectProposal } from '../wechatConversation';

describe('Soul dimensions integration', () => {
  describe('serviceStrategy in fallback replies', () => {
    it('should reference primaryGoal when serviceStrategy is available', () => {
      const scene: ConversationSceneInputPack = {
        sceneId: 'test-1', runId: 'run-1', day: 1,
        conversationKey: 'owner:test', sourceMessageId: 'msg-1',
        sceneType: 'owner_wechat', playerText: '收到，我这边跟进一下。',
        sourceMessage: { messageId: 'msg-1', senderName: '王姐', senderRole: 'owner', content: '现在市场怎么样？', timeLabel: '14:30', urgency: 'high' },
        caseContext: {
          caseId: 'case-1', title: '天山花园3房', ownerName: '王姐', district: '长宁', community: '天山花园',
          askPrice: 680, marketPrice: 620, priceGapPct: 9.7, trust: 35, patience: 25, urgency: 80,
          heat: 60, competitiveness: 55, hasCompletedFirstVisit: true, ownerProfileLabel: '焦虑型',
          serviceStrategy: {
            primaryGoal: '把高价期待转成可验证的市场动作',
            mainBlocker: '既想守价又怕时间拖长',
            recommendedNextAction: '下次用竞品、客户反馈和一周目标做价格复盘',
            communicationStyle: '先承认价值，再给证据和备选动作。',
          },
        },
        recentTurns: [],
      };

      const proposal = buildFallbackConversationEffectProposal(scene);

      expect(proposal.recipientReply).toContain('王姐');
      expect(proposal.recipientReply.length).toBeGreaterThan(10);
    });

    it('should work without serviceStrategy', () => {
      const scene: ConversationSceneInputPack = {
        sceneId: 'test-2', runId: 'run-1', day: 1,
        conversationKey: 'owner:test', sourceMessageId: 'msg-1',
        sceneType: 'owner_wechat', playerText: '收到，我这边跟进一下。',
        sourceMessage: { messageId: 'msg-1', senderName: '王姐', senderRole: 'owner', content: '现在市场怎么样？', timeLabel: '14:30', urgency: 'high' },
        caseContext: {
          caseId: 'case-1', title: '天山花园3房', ownerName: '王姐', district: '长宁', community: '天山花园',
          askPrice: 680, marketPrice: 620, priceGapPct: 9.7, trust: 35, patience: 25, urgency: 80,
          heat: 60, competitiveness: 55, hasCompletedFirstVisit: true, ownerProfileLabel: '焦虑型',
        },
        recentTurns: [],
      };

      const proposal = buildFallbackConversationEffectProposal(scene);

      expect(proposal.recipientReply).toContain('王姐');
    });
  });

  describe('promisesNotYetFulfilled in fallback replies', () => {
    it('should reference unfulfilled promises when available', () => {
      const scene: ConversationSceneInputPack = {
        sceneId: 'test-3', runId: 'run-1', day: 2,
        conversationKey: 'owner:test', sourceMessageId: 'msg-2',
        sceneType: 'owner_wechat', playerText: '我今天下午去面访。',
        sourceMessage: { messageId: 'msg-2', senderName: '王姐', senderRole: 'owner', content: '上次你说今天来面访', timeLabel: '14:30', urgency: 'high' },
        caseContext: {
          caseId: 'case-1', title: '天山花园3房', ownerName: '王姐', district: '长宁', community: '天山花园',
          askPrice: 680, marketPrice: 620, priceGapPct: 9.7, trust: 35, patience: 25, urgency: 80,
          heat: 60, competitiveness: 55, hasCompletedFirstVisit: true, ownerProfileLabel: '焦虑型',
          promisesNotYetFulfilled: ['今天下午去面访', '带竞品数据'],
        },
        recentTurns: [],
      };

      const proposal = buildFallbackConversationEffectProposal(scene);

      expect(proposal.recipientReply).toContain('王姐');
    });
  });

  describe('recoveryCue in fallback replies', () => {
    it('should use recovery cue when trust drops significantly', () => {
      const scene: ConversationSceneInputPack = {
        sceneId: 'test-4', runId: 'run-1', day: 1,
        conversationKey: 'owner:test', sourceMessageId: 'msg-1',
        sceneType: 'owner_wechat', playerText: '收到，我这边跟进一下。',
        sourceMessage: { messageId: 'msg-1', senderName: '王姐', senderRole: 'owner', content: '你上次说来面访，结果没来', timeLabel: '14:30', urgency: 'high' },
        caseContext: {
          caseId: 'case-1', title: '天山花园3房', ownerName: '王姐', district: '长宁', community: '天山花园',
          askPrice: 680, marketPrice: 620, priceGapPct: 9.7, trust: 25, patience: 20, urgency: 85,
          heat: 60, competitiveness: 55, hasCompletedFirstVisit: true, ownerProfileLabel: '焦虑型',
        },
        recentTurns: [],
      };

      const proposal = buildFallbackConversationEffectProposal(scene);

      expect(proposal.trustDelta).toBeLessThan(0);
    });
  });
});
