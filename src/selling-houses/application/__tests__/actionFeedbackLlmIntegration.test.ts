/**
 * Action Feedback LLM Integration Tests (TDD)
 *
 * Tests that action feedback has an LLM-first path that:
 * 1. Uses world context to generate richer feedback
 * 2. Falls back to template when LLM fails
 * 3. Normalizes LLM output correctly
 *
 * Usage: npx vitest run src/selling-houses/application/__tests__/actionFeedbackLlmIntegration.test.ts
 */

import { describe, expect, it } from 'vitest';
import {
  buildFallbackActionFeedbackProposal,
  buildLlmFirstActionFeedbackProposal,
  normalizeActionFeedbackProposal,
  type ActionFeedbackRequest,
  type ActionFeedbackWorldContext,
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
// Test Group 1: LLM-first proposal generation
// ---------------------------------------------------------------------------

describe('action feedback LLM integration', () => {
  describe('LLM-first proposal generation', () => {
    it('should generate a proposal with world context', () => {
      const soul = buildSoul({
        ownerProfileLabel: '焦虑型',
        emotionalState: { trust: 45, patience: 30, urgency: 75, mood: 'negative' },
      });

      const memory = buildMemoryFacts([
        { kind: 'price_commitment', summary: '业主上次同意降价5万' },
      ]);

      const market = {
        rivalListings: [
          { id: 'rival-1', status: 'active', price: 910, community: '江悦府' },
        ],
        marketSentiment: 'negative' as const,
      };

      const result = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { soul, memory, market });

      // Should produce a context-aware message
      expect(result.message.length).toBeGreaterThan(60);
      expect(result.confidence).toBeGreaterThan(0);
      expect(result.confidence).toBeLessThanOrEqual(1);
    });

    it('should produce different output than fallback when context available', () => {
      const soul = buildSoul({
        ownerProfileLabel: '强势型',
        basePersonality: { assertiveness: 85, patience: 40, trust倾向: 50, priceSensitivity: 50 },
      });

      const llmResult = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { soul });
      const fallbackResult = buildFallbackActionFeedbackProposal(buildBaseRequest());

      // LLM-first should produce different output than fallback
      expect(llmResult.message).not.toBe(fallbackResult.message);
    });

    it('should handle missing context gracefully', () => {
      const result = buildLlmFirstActionFeedbackProposal(buildBaseRequest());

      expect(result.message.length).toBeGreaterThan(60);
      expect(result.confidence).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Test Group 2: Normalization with LLM output
  // ---------------------------------------------------------------------------

  describe('normalization with LLM output', () => {
    it('should accept good LLM output', () => {
      const goodLlmOutput = {
        message: '"这周有动静我知道了，但我不想只听一句不错。客户为什么没往下走、旁边那套怎么比、你说差9万的依据是什么，都给我摆出来。"',
        confidence: 0.76,
      };

      const result = normalizeActionFeedbackProposal(goodLlmOutput, buildBaseRequest());

      // Should accept the good output
      expect(result.message).toContain('客户');
      expect(result.message).toContain('旁边');
      expect(result.confidence).toBe(0.76);
    });

    it('should reject bad LLM output and fallback', () => {
      const badLlmOutput = {
        message: '"听起来这周还不错，继续保持。你把「突出本周进展、坦诚讲风险」讲清楚。"',
        confidence: 0.88,
      };

      const result = normalizeActionFeedbackProposal(badLlmOutput, buildBaseRequest());

      // Should reject and fallback
      expect(result.message).not.toContain('突出本周进展');
      expect(result.message).not.toContain('坦诚讲风险');
      expect(result.message).not.toContain('讲清楚');
    });

    it('should use LLM-first proposal when available', () => {
      const soul = buildSoul({
        ownerProfileLabel: '焦虑型',
        emotionalState: { trust: 45, patience: 30, urgency: 75, mood: 'negative' },
      });

      const llmProposal = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { soul });
      const result = normalizeActionFeedbackProposal(llmProposal, buildBaseRequest());

      // Should use the LLM-first proposal
      expect(result.message).toBe(llmProposal.message);
      expect(result.confidence).toBe(llmProposal.confidence);
    });
  });

  // ---------------------------------------------------------------------------
  // Test Group 3: Context-aware generation
  // ---------------------------------------------------------------------------

  describe('context-aware generation', () => {
    it('should generate different output for different soul states', () => {
      const anxiousSoul = buildSoul({
        ownerProfileLabel: '焦虑型',
        emotionalState: { trust: 25, patience: 20, urgency: 80, mood: 'negative' },
      });

      const calmSoul = buildSoul({
        ownerProfileLabel: '理性型',
        emotionalState: { trust: 75, patience: 70, urgency: 30, mood: 'positive' },
      });

      const anxiousResult = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { soul: anxiousSoul });
      const calmResult = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { soul: calmSoul });

      expect(anxiousResult.message).not.toBe(calmResult.message);
    });

    it('should generate different output for different memory', () => {
      const memoryWithPrice = buildMemoryFacts([
        { kind: 'price_commitment', summary: '业主上次同意降价5万' },
      ]);

      const memoryWithRisk = buildMemoryFacts([
        { kind: 'open_risk', summary: '客户反馈装修太旧' },
      ]);

      const priceResult = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { memory: memoryWithPrice });
      const riskResult = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { memory: memoryWithRisk });

      expect(priceResult.message).not.toBe(riskResult.message);
    });

    it('should generate different output for different world context', () => {
      const activeRivalsContext = {
        rivalListings: [
          { id: 'rival-1', status: 'active', price: 910, community: '江悦府' },
        ],
        marketSentiment: 'negative' as const,
      };

      const noRivalsContext = {
        rivalListings: [],
        marketSentiment: 'positive' as const,
      };

      const rivalsResult = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { market: activeRivalsContext });
      const noRivalsResult = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { market: noRivalsContext });

      expect(rivalsResult.message).not.toBe(noRivalsResult.message);
    });
  });

  // ---------------------------------------------------------------------------
  // Test Group 4: Backward compatibility
  // ---------------------------------------------------------------------------

  describe('backward compatibility', () => {
    it('should work without world context', () => {
      const result = buildLlmFirstActionFeedbackProposal(buildBaseRequest());

      expect(result.message.length).toBeGreaterThan(60);
      expect(result.message).not.toContain('系统');
      expect(result.message).not.toContain('AI');
    });

    it('should produce valid proposal for normalization', () => {
      const result = buildLlmFirstActionFeedbackProposal(buildBaseRequest());
      const normalized = normalizeActionFeedbackProposal(result, buildBaseRequest());

      expect(normalized.message.length).toBeGreaterThan(60);
      expect(normalized.confidence).toBeGreaterThan(0);
    });
  });
});
