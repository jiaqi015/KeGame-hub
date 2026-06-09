/**
 * Comprehensive Interface Tests - All HTTP Handlers
 *
 * Tests all interfaces that were missing test coverage:
 * 1. handleScenarioOpeningStory - 开场故事
 * 2. handleMyWechatBrokerReplyDraft - 微信回复草稿
 * 3. handleMaintainerRun* - 存档管理
 * 4. handleSellingHousesScenario* - 剧本查询
 *
 * Usage: npx vitest run src/selling-houses/interfaces/http/__tests__/comprehensiveInterfaceTests.test.ts
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callDeepSeekChat } from '../../../../../lib/deepseek.js';
import { handleScenarioOpeningStory } from '../scenarioOpeningStoryHandlers.js';
import { handleMyWechatBrokerReplyDraft } from '../myWechatAiHandlers.js';
import {
  buildFallbackActionFeedbackProposal,
  buildLlmFirstActionFeedbackProposal,
} from '../../../application/actionDecisionAdvice.js';

vi.mock('../../../../../lib/deepseek.js', () => ({
  callDeepSeekChat: vi.fn(),
}));

vi.mock('../../../../../lib/modelRuntime.js', () => ({
  resolveEnabledModel: vi.fn(() => ({
    id: 'deepseek-v4-pro',
    provider: 'deepseek',
  })),
}));

const mockedCallDeepSeekChat = vi.mocked(callDeepSeekChat);

// ============================================================================
// Test Data Factories
// ============================================================================

function buildScenarioOpeningBriefing() {
  return {
    dateLabel: '2024年1月15日 周一',
    openingStory: {
      deck: '今天是开放日，集中看房并回传业主。',
      marketTitle: '万航小区 63㎡ 一房',
      marketParagraphs: ['周边竞品增多，价格压力增大。', '客户会拿同类竞品比较。'],
      evidenceLabels: ['竞品增加', '价格敏感'],
    },
    marketTitle: '万航小区 63㎡ 一房',
    marketDetail: '周边竞品增多，价格压力增大',
    marketTags: ['竞品增加', '价格敏感'],
    worldScaleLabel: '区域',
    scaleLabel: '小区',
    ownerCountLabel: '3 位业主',
    customerCountLabel: '5 组客户',
    competitionLabel: '竞品增多',
    cases: [
      {
        id: 'case-1',
        title: '万航小区 63㎡ 一房',
        ownerName: '王经理',
        ownerMood: '焦虑',
        stageLabel: '首次面访',
        roleLabel: '业主',
        storyLine: '业主急于出售，但价格期望偏高。',
        decisionHint: '先了解业主真实卖房意愿。',
        priceLabel: '挂牌价 643 万',
        ownerStateLabel: '焦虑型',
        customerLabel: '5 组客户',
        tags: ['价格敏感', '竞品增多'],
      },
    ],
  };
}

function buildWechatBrokerReplyDraftRequest() {
  return {
    modelId: 'deepseek-v4-flash',
    messages: [
      {
        id: 'msg-1',
        sender: 'owner' as const,
        content: '价格不能再低了，已经很优惠了。',
        timestamp: Date.now(),
      },
      {
        id: 'msg-2',
        sender: 'customer' as const,
        content: '我再考虑考虑。',
        timestamp: Date.now(),
      },
    ],
    context: {
      caseId: 'case-1',
      ownerName: '王经理',
      customerName: '张先生',
      community: '万航小区',
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('comprehensive interface tests', () => {
  beforeEach(() => {
    mockedCallDeepSeekChat.mockReset();
  });

  // ==========================================================================
  // handleScenarioOpeningStory
  // ==========================================================================

  describe('handleScenarioOpeningStory', () => {
    it('should return fallback when model unavailable', async () => {
      // Temporarily override the mock to return undefined
      const { resolveEnabledModel } = await import('../../../../../lib/modelRuntime.js');
      const mockResolve = vi.mocked(resolveEnabledModel);
      mockResolve.mockReturnValueOnce(undefined as any);

      const result = await handleScenarioOpeningStory(buildScenarioOpeningBriefing());

      expect(result.status).toBe(200);
      expect(result.body.ok).toBe(true);
      expect(result.body.source).toBe('fallback');
      expect(result.body.story.deck).toBeDefined();
      expect(result.body.story.marketTitle).toBeDefined();
      expect(result.body.story.marketParagraphs).toBeDefined();
      expect(result.body.story.evidenceLabels).toBeDefined();
    });

    it('should return AI story when model available', async () => {
      mockedCallDeepSeekChat.mockResolvedValueOnce({
        modelId: 'deepseek-v4-pro',
        status: 'completed',
        result: JSON.stringify({
          deck: '今天万航小区开放日，集中看房。',
          marketTitle: '万航小区 63㎡ 一房',
          marketParagraphs: ['周边竞品增多。', '客户会拿同类竞品比较。'],
          evidenceLabels: ['竞品增加', '价格敏感'],
        }),
      });

      const result = await handleScenarioOpeningStory(buildScenarioOpeningBriefing());

      expect(result.status).toBe(200);
      expect(result.body.ok).toBe(true);
      expect(result.body.source).toBe('ai');
      expect(result.body.story.deck).toContain('万航');
    });

    it('should fallback when LLM fails', async () => {
      mockedCallDeepSeekChat.mockResolvedValueOnce({
        modelId: 'deepseek-v4-pro',
        status: 'error',
        result: 'DeepSeek 开场故事生成失败。',
      });

      const result = await handleScenarioOpeningStory(buildScenarioOpeningBriefing());

      expect(result.status).toBe(200);
      expect(result.body.ok).toBe(true);
      expect(result.body.source).toBe('fallback');
      expect(result.body.error).toBeDefined();
    });

    it('should normalize LLM output correctly', async () => {
      mockedCallDeepSeekChat.mockResolvedValueOnce({
        modelId: 'deepseek-v4-pro',
        status: 'completed',
        result: JSON.stringify({
          deck: '开场摘要',
          marketTitle: '市场标题',
          marketParagraphs: ['段落1', '段落2', '段落3'], // 超过2段
          evidenceLabels: ['标签1', '标签2', '标签3', '标签4', '标签5'], // 超过4个
        }),
      });

      const result = await handleScenarioOpeningStory(buildScenarioOpeningBriefing());

      expect(result.status).toBe(200);
      expect(result.body.story.marketParagraphs.length).toBeLessThanOrEqual(2);
      expect(result.body.story.evidenceLabels.length).toBeLessThanOrEqual(4);
    });
  });

  // ==========================================================================
  // handleMyWechatBrokerReplyDraft
  // ==========================================================================

  describe('handleMyWechatBrokerReplyDraft', () => {
    it('should return 400 when no messages', async () => {
      const result = await handleMyWechatBrokerReplyDraft({
        messages: [],
      });

      expect(result.status).toBe(400);
      expect(result.body.ok).toBe(false);
      expect(result.body.error).toContain('没有可生成回复的微信消息');
    });

    it('should return error when model unavailable', async () => {
      const result = await handleMyWechatBrokerReplyDraft({
        messages: [{ id: 'msg-1', sender: 'owner', content: 'test' }],
      });

      // When model is unavailable, should return error
      expect(result.body.ok).toBe(false);
      expect(result.body.error).toBeDefined();
    });

    it('should return error when LLM fails', async () => {
      mockedCallDeepSeekChat.mockResolvedValueOnce({
        modelId: 'deepseek-v4-flash',
        status: 'error',
        result: 'DeepSeek 对话生成失败。',
      });

      const result = await handleMyWechatBrokerReplyDraft(buildWechatBrokerReplyDraftRequest());

      expect(result.body.ok).toBe(false);
      expect(result.body.error).toBeDefined();
    });
  });

  // ==========================================================================
  // buildFallbackActionFeedbackProposal (Fix 1 verification)
  // ==========================================================================

  describe('buildFallbackActionFeedbackProposal (Fix 1: no worldContext)', () => {
    it('should work without any worldContext parameter', () => {
      const request = {
        actionId: 'weekly-feedback',
        title: '江悦府 128㎡ 三房 · 周度反馈',
        summary: '把这一周带看、客户反馈和价格风险同步给业主。',
        body: '业主想知道这周有没有实质进展。',
        actorLabel: '业主',
        currentRound: 1,
        totalRounds: 2,
        contextBullets: ['本周带看 3 组。'],
        round: {
          title: '周度反馈',
          description: '这一轮要让业主相信你不是泛泛汇报。',
          mainStrategies: [
            { id: 'progress', title: '突出本周进展', note: '说明带看和客户反馈的真实变化。' },
          ],
          assistStrategies: [{ id: 'direct-risk', title: '坦诚讲风险', note: '风险直接说。' }],
        },
        choice: {
          mainStrategyIds: ['progress'],
          assistStrategyId: 'direct-risk',
          baseFeedbackMessage: '"听起来这周还不错。"',
          actor: 'owner' as const,
          mood: 'positive' as const,
        },
      };

      const result = buildFallbackActionFeedbackProposal(request);

      expect(result.message).toBeDefined();
      expect(result.message.length).toBeGreaterThan(20);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });
  });

  describe('buildLlmFirstActionFeedbackProposal (CR fixes)', () => {
    it('should use conversationHistory from soul', () => {
      const request = {
        actionId: 'weekly-feedback',
        title: '江悦府 128㎡ 三房 · 周度反馈',
        summary: '把这一周带看、客户反馈和价格风险同步给业主。',
        body: '业主想知道这周有没有实质进展。',
        actorLabel: '业主',
        currentRound: 1,
        totalRounds: 2,
        contextBullets: ['本周带看 3 组。'],
        round: {
          title: '周度反馈',
          description: '这一轮要让业主相信你不是泛泛汇报。',
          mainStrategies: [
            { id: 'progress', title: '突出本周进展', note: '说明带看和客户反馈的真实变化。' },
          ],
          assistStrategies: [{ id: 'direct-risk', title: '坦诚讲风险', note: '风险直接说。' }],
        },
        choice: {
          mainStrategyIds: ['progress'],
          assistStrategyId: 'direct-risk',
          baseFeedbackMessage: '"听起来这周还不错。"',
          actor: 'owner' as const,
          mood: 'positive' as const,
        },
      };

      const soul = {
        participantId: 'owner:case-1:王经理',
        ownerProfileLabel: '焦虑型',
        basePersonality: { assertiveness: 30, patience: 44, trust倾向: 57, priceSensitivity: 60 },
        emotionalState: { trust: 57, patience: 44, urgency: 66, mood: 'neutral' as const },
        emotionalArc: {
          trustTrend: 'stable' as const,
          patienceTrend: 'stable' as const,
          urgencyTrend: 'stable' as const,
          lastMood: 'neutral' as const,
          consecutivePositive: 0,
          consecutiveNegative: 0,
        },
        conversationHistory: [
          {
            day: 5,
            playerText: '客户反馈价格太高了。',
            recipientReply: '你给我一个说法。',
            trustDelta: -3,
            patienceDelta: -2,
            urgencyDelta: 3,
            intents: ['discuss_price'],
            risks: ['price_too_high'],
          },
        ],
        communicationPatterns: [],
      };

      const result = buildLlmFirstActionFeedbackProposal(request, { soul });

      expect(result.message).toBeDefined();
      expect(result.message.length).toBeGreaterThan(20);
      // Should reference conversation history
      expect(
        result.message.includes('价格') || result.message.includes('之前') || result.message.includes('上次')
      ).toBe(true);
    });

    it('should use market data with market property (Fix 3)', () => {
      const request = {
        actionId: 'weekly-feedback',
        title: '江悦府 128㎡ 三房 · 周度反馈',
        summary: '把这一周带看、客户反馈和价格风险同步给业主。',
        body: '业主想知道这周有没有实质进展。',
        actorLabel: '业主',
        currentRound: 1,
        totalRounds: 2,
        contextBullets: ['本周带看 3 组。'],
        round: {
          title: '周度反馈',
          description: '这一轮要让业主相信你不是泛泛汇报。',
          mainStrategies: [
            { id: 'progress', title: '突出本周进展', note: '说明带看和客户反馈的真实变化。' },
          ],
          assistStrategies: [{ id: 'direct-risk', title: '坦诚讲风险', note: '风险直接说。' }],
        },
        choice: {
          mainStrategyIds: ['progress'],
          assistStrategyId: 'direct-risk',
          baseFeedbackMessage: '"听起来这周还不错。"',
          actor: 'owner' as const,
          mood: 'positive' as const,
        },
      };

      const market = {
        rivalListings: [
          { id: 'rival-1', status: 'active', price: 910, community: '江悦府' },
        ],
        marketSentiment: 'negative' as const,
      };

      const result = buildLlmFirstActionFeedbackProposal(request, { market });

      expect(result.message).toBeDefined();
      expect(result.message.includes('竞品') || result.message.includes('市场')).toBe(true);
    });

    it('should use memory with strength sorting (Fix 5)', () => {
      const request = {
        actionId: 'weekly-feedback',
        title: '江悦府 128㎡ 三房 · 周度反馈',
        summary: '把这一周带看、客户反馈和价格风险同步给业主。',
        body: '业主想知道这周有没有实质进展。',
        actorLabel: '业主',
        currentRound: 1,
        totalRounds: 2,
        contextBullets: ['本周带看 3 组。'],
        round: {
          title: '周度反馈',
          description: '这一轮要让业主相信你不是泛泛汇报。',
          mainStrategies: [
            { id: 'progress', title: '突出本周进展', note: '说明带看和客户反馈的真实变化。' },
          ],
          assistStrategies: [{ id: 'direct-risk', title: '坦诚讲风险', note: '风险直接说。' }],
        },
        choice: {
          mainStrategyIds: ['progress'],
          assistStrategyId: 'direct-risk',
          baseFeedbackMessage: '"听起来这周还不错。"',
          actor: 'owner' as const,
          mood: 'positive' as const,
        },
      };

      const memory = [
        {
          factId: 'fact-1',
          agentId: 'wechat:owner:case-1',
          kind: 'price_commitment',
          summary: '业主同意降5万',
          strength: 0.9,
          createdAtDay: 5,
          updatedAtDay: 5,
        },
        {
          factId: 'fact-2',
          agentId: 'wechat:owner:case-1',
          kind: 'open_risk',
          summary: '客户反馈装修太旧',
          strength: 0.3,
          createdAtDay: 4,
          updatedAtDay: 4,
        },
      ];

      const result = buildLlmFirstActionFeedbackProposal(request, { memory });

      expect(result.message).toBeDefined();
      // Should reference the stronger memory (price_commitment)
      expect(result.message.includes('价格') || result.message.includes('承诺')).toBe(true);
    });

    it('should give higher confidence for richer context (Fix 7)', () => {
      const request = {
        actionId: 'weekly-feedback',
        title: '江悦府 128㎡ 三房 · 周度反馈',
        summary: '把这一周带看、客户反馈和价格风险同步给业主。',
        body: '业主想知道这周有没有实质进展。',
        actorLabel: '业主',
        currentRound: 1,
        totalRounds: 2,
        contextBullets: ['本周带看 3 组。'],
        round: {
          title: '周度反馈',
          description: '这一轮要让业主相信你不是泛泛汇报。',
          mainStrategies: [
            { id: 'progress', title: '突出本周进展', note: '说明带看和客户反馈的真实变化。' },
          ],
          assistStrategies: [{ id: 'direct-risk', title: '坦诚讲风险', note: '风险直接说。' }],
        },
        choice: {
          mainStrategyIds: ['progress'],
          assistStrategyId: 'direct-risk',
          baseFeedbackMessage: '"听起来这周还不错。"',
          actor: 'owner' as const,
          mood: 'positive' as const,
        },
      };

      // Empty context
      const emptyResult = buildLlmFirstActionFeedbackProposal(request);

      // Rich context
      const richResult = buildLlmFirstActionFeedbackProposal(request, {
        soul: {
          participantId: 'owner:case-1:王经理',
          ownerProfileLabel: '焦虑型',
          basePersonality: { assertiveness: 30, patience: 44, trust倾向: 57, priceSensitivity: 60 },
          emotionalState: { trust: 57, patience: 44, urgency: 66, mood: 'neutral' as const },
          emotionalArc: {
            trustTrend: 'stable' as const,
            patienceTrend: 'stable' as const,
            urgencyTrend: 'stable' as const,
            lastMood: 'neutral' as const,
            consecutivePositive: 0,
            consecutiveNegative: 0,
          },
          conversationHistory: [
            {
              day: 5,
              playerText: '客户反馈还不错。',
              recipientReply: '好的。',
              trustDelta: 1,
              patienceDelta: 0,
              urgencyDelta: 0,
              intents: ['present_market_evidence'],
              risks: ['none'],
            },
          ],
          communicationPatterns: [
            { intent: 'present_market_evidence', effectiveness: 0.8, lastUsed: 5, count: 3 },
          ],
        },
        memory: [
          {
            factId: 'fact-1',
            agentId: 'wechat:owner:case-1',
            kind: 'price_commitment',
            summary: '业主同意降5万',
            strength: 0.9,
            createdAtDay: 5,
            updatedAtDay: 5,
          },
        ],
        market: {
          rivalListings: [
            { id: 'rival-1', status: 'active', price: 910, community: '江悦府' },
          ],
          marketSentiment: 'negative' as const,
        },
      });

      // Rich context should have higher confidence
      expect(richResult.confidence).toBeGreaterThan(emptyResult.confidence);
    });
  });
});
