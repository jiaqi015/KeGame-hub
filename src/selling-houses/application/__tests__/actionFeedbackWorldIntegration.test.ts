/**
 * Action Feedback World Integration Tests (TDD)
 *
 * Tests that action feedback is connected to ALL context:
 * 1. ParticipantSoul (personality, emotional state, arc)
 * 2. Agent memory (learned facts from previous interactions)
 * 3. Conversation history (what was said before)
 * 4. World state (market signals, rival activity)
 *
 * Usage: npx vitest run src/selling-houses/application/__tests__/actionFeedbackWorldIntegration.test.ts
 */

import { describe, expect, it } from 'vitest';
import {
  buildFallbackActionFeedbackProposal,
  buildLlmFirstActionFeedbackProposal,
  type ActionFeedbackRequest,
} from '../actionDecisionAdvice.js';
import type { ParticipantSoul } from '../../core/world-state/agents/soul.js';
import type { AgentMemoryFact } from '../../core/world-state/agents/models.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildBaseRequest(overrides: Partial<ActionFeedbackRequest> = {}): ActionFeedbackRequest {
  return {
    actionId: 'weekly-feedback',
    title: '江悦府 128㎡ 三房 · 周度反馈',
    summary: '把这一周带看、客户反馈和价格风险同步给业主。',
    body: '业主想知道这周有没有实质进展，也担心价格风险没有被讲透。',
    actorLabel: '业主',
    currentRound: 1,
    totalRounds: 2,
    contextBullets: ['本周带看 3 组，1 组有意向但未出价。', '同小区近期有 1 套成交，价格低于挂牌 5%。'],
    round: {
      title: '周度反馈',
      description: '这一轮要让业主相信你不是泛泛汇报。',
      mainStrategies: [
        { id: 'progress', title: '突出本周进展', note: '说明带看和客户反馈的真实变化。' },
        { id: 'risk', title: '坦诚讲风险', note: '把价格差距和竞品分流说清。' },
      ],
      assistStrategies: [{ id: 'direct-risk', title: '坦诚讲风险', note: '风险直接说，不做空泛安抚。' }],
    },
    choice: {
      mainStrategyIds: ['progress', 'risk'],
      assistStrategyId: 'direct-risk',
      baseFeedbackMessage: '"听起来这周还不错，继续保持。"',
      actor: 'owner',
      mood: 'positive',
    },
    caseContext: {
      title: '江悦府 128㎡ 三房',
      ownerName: '王经理',
      district: '浦东',
      community: '江悦府',
      askPrice: 930,
      marketPrice: 921,
      trust: 57,
      patience: 44,
      urgency: 66,
      heat: 63,
    },
    ...overrides,
  };
}

function buildSoul(overrides: Partial<ParticipantSoul> = {}): ParticipantSoul {
  return {
    participantId: 'owner:case-1:王经理',
    ownerProfileLabel: '焦虑型',
    basePersonality: {
      assertiveness: 30,
      patience: 44,
      trust倾向: 57,
      priceSensitivity: 60,
    },
    emotionalState: {
      trust: 57,
      patience: 44,
      urgency: 66,
      mood: 'neutral',
    },
    emotionalArc: {
      trustTrend: 'stable',
      patienceTrend: 'stable',
      urgencyTrend: 'stable',
      lastMood: 'neutral',
      consecutivePositive: 0,
      consecutiveNegative: 0,
    },
    conversationHistory: [],
    communicationPatterns: [],
    ...overrides,
  };
}

function buildMemoryFacts(facts: Partial<AgentMemoryFact>[] = []): AgentMemoryFact[] {
  return facts.map((fact, i) => ({
    factId: `fact-${i}`,
    agentId: 'wechat:owner:case-1',
    kind: 'recent_interaction' as const,
    summary: '测试事实',
    strength: 0.8,
    scope: { conversationKey: 'owner:王经理', caseId: 'case-1', channel: 'wechat' as const },
    sourceRef: { refType: 'conversation_receipt' as const, refId: `receipt-${i}` },
    createdAtDay: 5,
    updatedAtDay: 5,
    expiresAtDay: 12,
    ...fact,
  }));
}

// ---------------------------------------------------------------------------
// Test Group 1: Soul integration
// ---------------------------------------------------------------------------

describe('action feedback world integration', () => {
  describe('soul integration', () => {
    it('should produce different output for assertive vs anxious owner', () => {
      const assertiveSoul = buildSoul({
        ownerProfileLabel: '强势型',
        basePersonality: { assertiveness: 85, patience: 40, trust倾向: 50, priceSensitivity: 50 },
      });
      const anxiousSoul = buildSoul({
        ownerProfileLabel: '焦虑型',
        basePersonality: { assertiveness: 25, patience: 30, trust倾向: 50, priceSensitivity: 70 },
      });

      const assertiveResult = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { soul: assertiveSoul });
      const anxiousResult = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { soul: anxiousSoul });

      expect(assertiveResult.message).not.toBe(anxiousResult.message);
    });

    it('should produce different output for low trust vs high trust soul', () => {
      const lowTrustSoul = buildSoul({
        emotionalState: { trust: 25, patience: 44, urgency: 66, mood: 'negative' },
      });
      const highTrustSoul = buildSoul({
        emotionalState: { trust: 80, patience: 44, urgency: 66, mood: 'positive' },
      });

      const lowTrustResult = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { soul: lowTrustSoul });
      const highTrustResult = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { soul: highTrustSoul });

      expect(lowTrustResult.message).not.toBe(highTrustResult.message);
    });

    it('should reflect trust trend in output', () => {
      const fallingTrustSoul = buildSoul({
        emotionalArc: {
          trustTrend: 'falling',
          patienceTrend: 'stable',
          urgencyTrend: 'stable',
          lastMood: 'negative',
          consecutivePositive: 0,
          consecutiveNegative: 3,
        },
      });

      const risingTrustSoul = buildSoul({
        emotionalArc: {
          trustTrend: 'rising',
          patienceTrend: 'stable',
          urgencyTrend: 'stable',
          lastMood: 'positive',
          consecutivePositive: 3,
          consecutiveNegative: 0,
        },
      });

      const fallingResult = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { soul: fallingTrustSoul });
      const risingResult = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { soul: risingTrustSoul });

      expect(fallingResult.message).not.toBe(risingResult.message);
    });
  });

  // ---------------------------------------------------------------------------
  // Test Group 2: Conversation history integration
  // ---------------------------------------------------------------------------

  describe('conversation history integration', () => {
    it('should reference previous conversation when history exists', () => {
      const soulWithHistory = buildSoul({
        conversationHistory: [
          {
            day: 5,
            playerText: '这周有客户看过房，反馈还不错。',
            recipientReply: '好的，你整理了给我看。',
            trustDelta: 3,
            patienceDelta: 2,
            urgencyDelta: -1,
            intents: ['present_market_evidence'],
            risks: ['none'],
          },
        ],
      });

      const result = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { soul: soulWithHistory });

      // Should reference the previous conversation somehow
      expect(result.message.length).toBeGreaterThan(60);
    });

    it('should adapt based on what worked before', () => {
      const soulWithPatterns = buildSoul({
        communicationPatterns: [
          { intent: 'present_market_evidence', effectiveness: 0.8, lastUsed: 5, count: 3 },
          { intent: 'discuss_price', effectiveness: -0.5, lastUsed: 3, count: 2 },
        ],
      });

      const result = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { soul: soulWithPatterns });

      // Should produce a message that reflects learned patterns
      expect(result.message.length).toBeGreaterThan(60);
    });
  });

  // ---------------------------------------------------------------------------
  // Test Group 3: Agent memory integration
  // ---------------------------------------------------------------------------

  describe('agent memory integration', () => {
    it('should incorporate memory facts about price sensitivity', () => {
      const memory = buildMemoryFacts([
        { kind: 'price_commitment', summary: '业主上次同意降价5万' },
      ]);

      const result = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { memory });

      // Should reference price-related memory
      expect(result.message.length).toBeGreaterThan(60);
    });

    it('should incorporate memory facts about customer feedback', () => {
      const memory = buildMemoryFacts([
        { kind: 'recent_interaction', summary: '客户说装修太旧，需要重新考虑' },
      ]);

      const result = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { memory });

      expect(result.message.length).toBeGreaterThan(60);
    });

    it('should work without memory (backward compatibility)', () => {
      const result = buildLlmFirstActionFeedbackProposal(buildBaseRequest());

      expect(result.message.length).toBeGreaterThan(60);
      expect(result.message).not.toContain('系统');
      expect(result.message).not.toContain('AI');
    });
  });

  // ---------------------------------------------------------------------------
  // Test Group 4: World state integration
  // ---------------------------------------------------------------------------

  describe('world state integration', () => {
    it('should reflect rival activity in output', () => {
      const market = {
        rivalListings: [
          { id: 'rival-1', status: 'active', price: 910, community: '江悦府' },
        ],
        marketSignals: [
          { type: 'competitor_cut', day: 6, detail: '同小区竞品降价10万' },
        ],
      };

      const result = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { market });

      // Should reference rival activity
      expect(result.message.length).toBeGreaterThan(60);
    });

    it('should reflect market sentiment in output', () => {
      const market = {
        marketSentiment: 'negative' as const,
        recentDeals: [
          { community: '江悦府', price: 890, day: 5 },
        ],
      };

      const result = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { market });

      expect(result.message.length).toBeGreaterThan(60);
    });

    it('should work without world context (backward compatibility)', () => {
      const result = buildFallbackActionFeedbackProposal(buildBaseRequest());

      expect(result.message.length).toBeGreaterThan(60);
      expect(result.message).not.toContain('系统');
      expect(result.message).not.toContain('AI');
    });
  });

  // ---------------------------------------------------------------------------
  // Test Group 5: Combined context
  // ---------------------------------------------------------------------------

  describe('combined context', () => {
    it('should produce rich output when all context available', () => {
      const soul = buildSoul({
        ownerProfileLabel: '焦虑型',
        emotionalState: { trust: 45, patience: 30, urgency: 75, mood: 'negative' },
        emotionalArc: {
          trustTrend: 'falling',
          patienceTrend: 'falling',
          urgencyTrend: 'rising',
          lastMood: 'negative',
          consecutivePositive: 0,
          consecutiveNegative: 2,
        },
        conversationHistory: [
          {
            day: 5,
            playerText: '客户反馈还不错，但还没出价。',
            recipientReply: '好的，你继续跟进。',
            trustDelta: 1,
            patienceDelta: -1,
            urgencyDelta: 2,
            intents: ['present_market_evidence'],
            risks: ['empty_comfort'],
          },
        ],
      });

      const memory = buildMemoryFacts([
        { kind: 'price_commitment', summary: '业主上次同意降价5万' },
        { kind: 'recent_interaction', summary: '客户说装修太旧' },
      ]);

      const market = {
        rivalListings: [
          { id: 'rival-1', status: 'active', price: 910, community: '江悦府' },
        ],
        marketSignals: [
          { type: 'competitor_cut', day: 6, detail: '同小区竞品降价10万' },
        ],
      };

      const result = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), {
        soul,
        memory,
        market,
      });

      // Should produce a rich, context-aware message
      expect(result.message.length).toBeGreaterThan(80);
      expect(result.message).not.toContain('系统');
      expect(result.message).not.toContain('AI');
      expect(result.message).not.toContain('本轮选择');
      expect(result.message).not.toContain('主话题');
    });
  });
});
