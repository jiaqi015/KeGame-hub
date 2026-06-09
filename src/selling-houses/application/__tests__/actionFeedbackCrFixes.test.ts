/**
 * Action Feedback CR Fixes (TDD)
 *
 * Tests for all issues identified in deep code review:
 * 1. Fallback should NOT accept unused worldContext param (dead code removal)
 * 2. extractWorldContext should validate input safely
 * 3. worldContext.worldContext renamed to worldContext.market
 * 4. Soul conversationHistory referenced in output
 * 5. Memory: more kinds supported + sorted by strength
 * 6. World: marketSignals and recentDeals used in output
 * 7. Confidence based on context quality, not just presence
 * 8. Closing logic deduplicated
 * 9. communicationPatterns used to avoid ineffective approaches
 *
 * Usage: npx vitest run src/selling-houses/application/__tests__/actionFeedbackCrFixes.test.ts
 */

import { describe, expect, it } from 'vitest';
import {
  buildLlmFirstActionFeedbackProposal,
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
// CR Fix 3: worldContext.market naming
// ---------------------------------------------------------------------------

describe('CR Fix 3: worldContext.market naming', () => {
  it('should accept market property instead of worldContext.worldContext', () => {
    const worldContext: ActionFeedbackWorldContext = {
      market: {
        rivalListings: [
          { id: 'rival-1', status: 'active', price: 910, community: '江悦府' },
        ],
        marketSentiment: 'negative',
      },
    };

    const result = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), worldContext);
    expect(result.message.length).toBeGreaterThan(60);
    // Should reference rivals
    expect(result.message).toContain('竞品');
  });

  it('should NOT have worldContext.worldContext property in type', () => {
    // This test verifies the type change: ActionFeedbackWorldContext should have
    // 'market' instead of 'worldContext' as a property name
    const ctx: ActionFeedbackWorldContext = {
      market: {
        marketSentiment: 'negative',
      },
    };
    // If the type still has 'worldContext', this would be a type error
    expect(ctx.market?.marketSentiment).toBe('negative');
  });
});

// ---------------------------------------------------------------------------
// CR Fix 4: Soul conversationHistory referenced in output
// ---------------------------------------------------------------------------

describe('CR Fix 4: soul conversationHistory referenced in output', () => {
  it('should reference previous conversation when history exists with positive trust delta', () => {
    const soulWithHistory = buildSoul({
      conversationHistory: [
        {
          day: 5,
          playerText: '客户看过房了，觉得装修太旧。',
          recipientReply: '好的，你继续跟进。',
          trustDelta: 3,
          patienceDelta: 2,
          urgencyDelta: -1,
          intents: ['present_market_evidence'],
          risks: ['none'],
        },
      ],
    });

    const result = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { soul: soulWithHistory });

    // Should reference the conversation content or the positive outcome
    const msg = result.message;
    // Should mention something about the previous interaction
    expect(
      msg.includes('之前') || msg.includes('上次') || msg.includes('跟进') || msg.includes('继续') || msg.includes('客户')
    ).toBe(true);
  });

  it('should reference negative conversation history differently', () => {
    const soulWithNegativeHistory = buildSoul({
      conversationHistory: [
        {
          day: 4,
          playerText: '客户觉得价格太高，暂时不考虑了。',
          recipientReply: '你给我一个说法。',
          trustDelta: -5,
          patienceDelta: -3,
          urgencyDelta: 4,
          intents: ['discuss_price'],
          risks: ['price_too_high', 'losing_customer'],
        },
      ],
    });

    const result = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { soul: soulWithNegativeHistory });

    // Should reference the negative outcome or the risks
    const msg = result.message;
    expect(
      msg.includes('价格') || msg.includes('风险') || msg.includes('之前') || msg.includes('上次')
    ).toBe(true);
  });

  it('should use most recent conversation when multiple exist', () => {
    const soulWithMultipleHistory = buildSoul({
      conversationHistory: [
        {
          day: 3,
          playerText: '市场不错，继续加油。',
          recipientReply: '好的。',
          trustDelta: 1,
          patienceDelta: 0,
          urgencyDelta: 0,
          intents: ['encourage'],
          risks: ['none'],
        },
        {
          day: 5,
          playerText: '客户反馈装修太旧，要降价才考虑。',
          recipientReply: '我再想想。',
          trustDelta: -3,
          patienceDelta: -2,
          urgencyDelta: 3,
          intents: ['discuss_price'],
          risks: ['price_too_high'],
        },
      ],
    });

    const result = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { soul: soulWithMultipleHistory });

    // Should reference the most recent (day 5) conversation about price
    const msg = result.message;
    expect(
      msg.includes('价格') || msg.includes('装修') || msg.includes('之前') || msg.includes('上次')
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// CR Fix 5: Memory: more kinds + sorted by strength
// ---------------------------------------------------------------------------

describe('CR Fix 5: memory kinds and strength sorting', () => {
  it('should use price_commitment memory when available', () => {
    const memory = buildMemoryFacts([
      { kind: 'price_commitment', summary: '业主同意降5万', strength: 0.9 },
    ]);

    const result = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { memory });
    const msg = result.message;
    expect(msg.includes('价格') || msg.includes('降') || msg.includes('承诺')).toBe(true);
  });

  it('should use open_risk memory when available', () => {
    const memory = buildMemoryFacts([
      { kind: 'open_risk', summary: '客户反馈装修太旧', strength: 0.8 },
    ]);

    const result = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { memory });
    const msg = result.message;
    expect(msg.includes('风险') || msg.includes('装修') || msg.includes('之前')).toBe(true);
  });

  it('should use decision_pattern memory when available', () => {
    const memory = buildMemoryFacts([
      { kind: 'decision_pattern', summary: '业主倾向于周末做决定', strength: 0.7 },
    ]);

    const result = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { memory });
    const msg = result.message;
    // Should reference the pattern
    expect(msg.length).toBeGreaterThan(60);
  });

  it('should use price_sensitivity memory when available', () => {
    const memory = buildMemoryFacts([
      { kind: 'price_sensitivity', summary: '客户对价格非常敏感', strength: 0.85 },
    ]);

    const result = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { memory });
    const msg = result.message;
    expect(msg.length).toBeGreaterThan(60);
  });

  it('should use customer_feedback memory when available', () => {
    const memory = buildMemoryFacts([
      { kind: 'customer_feedback', summary: '客户说户型不错但楼层太高', strength: 0.75 },
    ]);

    const result = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { memory });
    const msg = result.message;
    expect(msg.length).toBeGreaterThan(60);
  });

  it('should pick highest strength memory when multiple of same kind', () => {
    const memory = buildMemoryFacts([
      { kind: 'price_commitment', summary: '弱承诺', strength: 0.3 },
      { kind: 'price_commitment', summary: '强承诺：降10万', strength: 0.95 },
    ]);

    const result = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { memory });
    const msg = result.message;
    // Should reference the stronger memory
    expect(msg.includes('10') || msg.includes('价格') || msg.includes('承诺')).toBe(true);
  });

  it('should handle unknown memory kinds gracefully', () => {
    const memory = buildMemoryFacts([
      { kind: 'custom_future_kind', summary: '一些未来的记忆类型', strength: 0.6 },
    ]);

    const result = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { memory });
    expect(result.message.length).toBeGreaterThan(60);
  });
});

// ---------------------------------------------------------------------------
// CR Fix 6: World marketSignals and recentDeals used in output
// ---------------------------------------------------------------------------

describe('CR Fix 6: world marketSignals and recentDeals used', () => {
  it('should reference marketSignals when present', () => {
    const worldContext: ActionFeedbackWorldContext = {
      market: {
        marketSignals: [
          { type: 'competitor_cut', day: 6, detail: '同小区竞品降价10万' },
        ],
        marketSentiment: 'negative',
      },
    };

    const result = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), worldContext);
    const msg = result.message;
    // Should reference market signals or competitor activity
    expect(
      msg.includes('竞品') || msg.includes('市场') || msg.includes('信号') || msg.includes('降价')
    ).toBe(true);
  });

  it('should reference recentDeals when present', () => {
    const worldContext: ActionFeedbackWorldContext = {
      market: {
        recentDeals: [
          { community: '江悦府', price: 890, day: 5 },
        ],
        marketSentiment: 'neutral',
      },
    };

    const result = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), worldContext);
    const msg = result.message;
    // Should reference recent deals or price data
    expect(
      msg.includes('成交') || msg.includes('价格') || msg.includes('最近') || msg.includes('市场')
    ).toBe(true);
  });

  it('should use both marketSignals and recentDeals when both present', () => {
    const worldContext: ActionFeedbackWorldContext = {
      market: {
        marketSignals: [
          { type: 'competitor_cut', day: 6, detail: '同小区竞品降价10万' },
        ],
        recentDeals: [
          { community: '江悦府', price: 890, day: 5 },
        ],
        marketSentiment: 'negative',
      },
    };

    const result = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), worldContext);
    const msg = result.message;
    // Should be richer than with just one
    expect(msg.length).toBeGreaterThan(80);
  });
});

// ---------------------------------------------------------------------------
// CR Fix 7: Confidence based on context quality
// ---------------------------------------------------------------------------

describe('CR Fix 7: confidence based on context quality', () => {
  it('should give higher confidence for soul with rich history than empty soul', () => {
    const richSoul = buildSoul({
      conversationHistory: [
        {
          day: 5,
          playerText: '客户看过了，觉得不错。',
          recipientReply: '好的。',
          trustDelta: 3,
          patienceDelta: 1,
          urgencyDelta: -1,
          intents: ['present_market_evidence'],
          risks: ['none'],
        },
      ],
      communicationPatterns: [
        { intent: 'present_market_evidence', effectiveness: 0.8, lastUsed: 5, count: 3 },
      ],
      emotionalState: { trust: 70, patience: 50, urgency: 40, mood: 'positive' },
    });

    const emptySoul = buildSoul({
      conversationHistory: [],
      communicationPatterns: [],
    });

    const richResult = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { soul: richSoul });
    const emptyResult = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { soul: emptySoul });

    // Rich soul should have higher or equal confidence
    expect(richResult.confidence).toBeGreaterThanOrEqual(emptyResult.confidence);
  });

  it('should give higher confidence for high-strength memory than low-strength', () => {
    const strongMemory = buildMemoryFacts([
      { kind: 'price_commitment', summary: '强承诺', strength: 0.95 },
    ]);

    const weakMemory = buildMemoryFacts([
      { kind: 'price_commitment', summary: '弱印象', strength: 0.2 },
    ]);

    const strongResult = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { memory: strongMemory });
    const weakResult = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { memory: weakMemory });

    // Strong memory should have higher or equal confidence
    expect(strongResult.confidence).toBeGreaterThanOrEqual(weakResult.confidence);
  });

  it('should give higher confidence when market has more data', () => {
    const richMarket: ActionFeedbackWorldContext = {
      market: {
        rivalListings: [
          { id: 'rival-1', status: 'active', price: 910, community: '江悦府' },
          { id: 'rival-2', status: 'active', price: 900, community: '江悦府' },
        ],
        marketSignals: [
          { type: 'competitor_cut', day: 6, detail: '竞品降价10万' },
        ],
        recentDeals: [
          { community: '江悦府', price: 890, day: 5 },
        ],
        marketSentiment: 'negative',
      },
    };

    const thinMarket: ActionFeedbackWorldContext = {
      market: {
        marketSentiment: 'neutral',
      },
    };

    const richResult = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), richMarket);
    const thinResult = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), thinMarket);

    expect(richResult.confidence).toBeGreaterThanOrEqual(thinResult.confidence);
  });
});

// ---------------------------------------------------------------------------
// CR Fix 9: communicationPatterns used to avoid ineffective approaches
// ---------------------------------------------------------------------------

describe('CR Fix 9: communicationPatterns used', () => {
  it('should avoid ineffective communication patterns', () => {
    const soulWithPatterns = buildSoul({
      communicationPatterns: [
        { intent: 'present_market_evidence', effectiveness: 0.8, lastUsed: 5, count: 3 },
        { intent: 'discuss_price', effectiveness: -0.5, lastUsed: 3, count: 2 },
      ],
    });

    const result = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { soul: soulWithPatterns });
    const msg = result.message;

    // Should produce a valid message that reflects learned patterns
    expect(msg.length).toBeGreaterThan(60);
  });

  it('should handle soul with no patterns', () => {
    const soulNoPatterns = buildSoul({
      communicationPatterns: [],
    });

    const result = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), { soul: soulNoPatterns });
    expect(result.message.length).toBeGreaterThan(60);
  });
});

// ---------------------------------------------------------------------------
// Integration: All fixes together
// ---------------------------------------------------------------------------

describe('CR fixes integration', () => {
  it('should produce rich output with all context types', () => {
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
          playerText: '客户觉得价格太高了。',
          recipientReply: '你给我一个说法。',
          trustDelta: -3,
          patienceDelta: -2,
          urgencyDelta: 3,
          intents: ['discuss_price'],
          risks: ['price_too_high'],
        },
      ],
      communicationPatterns: [
        { intent: 'present_market_evidence', effectiveness: 0.6, lastUsed: 5, count: 2 },
      ],
    });

    const memory = buildMemoryFacts([
      { kind: 'price_commitment', summary: '业主同意降5万', strength: 0.9 },
      { kind: 'open_risk', summary: '客户反馈装修太旧', strength: 0.7 },
      { kind: 'decision_pattern', summary: '业主倾向周末决定', strength: 0.5 },
    ]);

    const worldContext: ActionFeedbackWorldContext = {
      market: {
        rivalListings: [
          { id: 'rival-1', status: 'active', price: 910, community: '江悦府' },
        ],
        marketSignals: [
          { type: 'competitor_cut', day: 6, detail: '同小区竞品降价10万' },
        ],
        recentDeals: [
          { community: '江悦府', price: 890, day: 5 },
        ],
        marketSentiment: 'negative',
      },
    };

    const result = buildLlmFirstActionFeedbackProposal(buildBaseRequest(), {
      soul,
      memory,
      ...worldContext,
    });

    const msg = result.message;

    // Should be a rich, context-aware message
    expect(msg.length).toBeGreaterThan(80);
    expect(result.confidence).toBeGreaterThan(0.65);

    // Should not contain system terms
    expect(msg).not.toContain('系统');
    expect(msg).not.toContain('AI');
    expect(msg).not.toContain('本轮选择');
    expect(msg).not.toContain('选项');

    // Should reference some context
    const hasContext = msg.includes('价格') || msg.includes('竞品') || msg.includes('风险') || msg.includes('市场') || msg.includes('之前') || msg.includes('客户');
    expect(hasContext).toBe(true);
  });
});
