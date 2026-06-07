import { describe, it, expect } from 'vitest';
import { buildLlmFirstProposal, buildConversationMemory } from '../llmFirstConversationAgent.js';
import type { ConversationSceneInputPack } from '../../core/world-state/conversation/models.js';
import type { GameState } from '../../domain/models.js';

function buildScene(overrides: Partial<ConversationSceneInputPack> = {}): ConversationSceneInputPack {
  const base = {
    sceneId: 'test', runId: 'run', day: 1,
    conversationKey: 'owner:test', sourceMessageId: 'msg-1',
    sceneType: 'owner_wechat' as const, playerText: '',
    sourceMessage: { messageId: 'msg-1', senderName: '王姐', senderRole: 'owner' as const, content: '测试', timeLabel: '14:30', urgency: 'medium' as const },
    caseContext: { caseId: 'case-1', title: '天山花园3房', ownerName: '王姐', district: '长宁', community: '天山花园', askPrice: 680, marketPrice: 620, priceGapPct: 9.7, trust: 50, patience: 50, urgency: 50, heat: 60, competitiveness: 55, hasCompletedFirstVisit: true, ownerProfileLabel: '焦虑型' },
    recentTurns: [],
  };
  return { ...base, ...overrides, caseContext: { ...base.caseContext, ...(overrides.caseContext || {}) }, sourceMessage: { ...base.sourceMessage, ...(overrides.sourceMessage || {}) } } as ConversationSceneInputPack;
}

const mockState = { runId: 'test', day: 1, cases: [] } as any as GameState;

describe('buildLlmFirstProposal', () => {
  it('returns reply with sender name', () => {
    const proposal = buildLlmFirstProposal(buildScene(), mockState);
    expect(proposal.reply).toContain('王姐');
  });

  it('returns strategy with goal', () => {
    const proposal = buildLlmFirstProposal(buildScene(), mockState);
    expect(proposal.strategy.goal).toBeDefined();
    expect(proposal.strategy.tone).toBeDefined();
    expect(proposal.strategy.reasoning).toBeDefined();
  });

  it('selects build_trust goal for low trust', () => {
    const proposal = buildLlmFirstProposal(buildScene({ caseContext: { trust: 20, urgency: 50 } as any }), mockState);
    expect(proposal.strategy.goal).toBe('build_trust');
    expect(proposal.strategy.tone).toBe('empathetic');
  });

  it('selects push_price goal for high urgency', () => {
    const proposal = buildLlmFirstProposal(buildScene({ caseContext: { trust: 50, urgency: 80 } as any }), mockState);
    expect(proposal.strategy.goal).toBe('push_price');
    expect(proposal.strategy.tone).toBe('urgent');
  });

  it('selects schedule_visit for visit-related input', () => {
    const proposal = buildLlmFirstProposal(buildScene({ playerText: '我想安排面访' } as any), mockState);
    expect(proposal.strategy.goal).toBe('schedule_visit');
  });

  it('selects push_price for price-related input', () => {
    const proposal = buildLlmFirstProposal(buildScene({ playerText: '价格怎么样？' } as any), mockState);
    expect(proposal.strategy.goal).toBe('push_price');
  });

  it('selects de_escalate for low patience', () => {
    const proposal = buildLlmFirstProposal(buildScene({ caseContext: { trust: 50, patience: 15, urgency: 50 } as any }), mockState);
    expect(proposal.strategy.goal).toBe('de_escalate');
  });

  it('returns confidence between 0 and 1', () => {
    const proposal = buildLlmFirstProposal(buildScene(), mockState);
    expect(proposal.confidence).toBeGreaterThanOrEqual(0);
    expect(proposal.confidence).toBeLessThanOrEqual(1);
  });

  it('reply contains case reference', () => {
    const proposal = buildLlmFirstProposal(buildScene(), mockState);
    expect(proposal.reply).toContain('天山花园');
  });

  it('different personalities produce different strategies', () => {
    const anxious = buildLlmFirstProposal(buildScene({ caseContext: { trust: 25, urgency: 85, ownerProfileLabel: '焦虑型' } as any }), mockState);
    const calm = buildLlmFirstProposal(buildScene({ caseContext: { trust: 70, urgency: 20, ownerProfileLabel: '理性型' } as any }), mockState);
    expect(anxious.strategy.goal).not.toBe(calm.strategy.goal);
  });

  it('reply is not empty and reasonable length', () => {
    const proposal = buildLlmFirstProposal(buildScene(), mockState);
    expect(proposal.reply.length).toBeGreaterThan(10);
    expect(proposal.reply.length).toBeLessThan(200);
  });
});

describe('buildConversationMemory', () => {
  it('returns empty memory for new conversation', () => {
    const state = { wechatConversationHistory: [] } as any as GameState;
    const memory = buildConversationMemory('owner:test', state);
    expect(memory.turns).toEqual([]);
    expect(memory.promises).toEqual([]);
    expect(memory.conversationKey).toBe('owner:test');
  });

  it('builds memory from conversation history', () => {
    const state = {
      wechatConversationHistory: [
        { conversationKey: 'owner:test', day: 1, playerText: '你好', recipientReply: '收到' },
        { conversationKey: 'owner:test', day: 2, playerText: '价格怎么样？', recipientReply: '今天下午去面访' },
      ],
    } as any as GameState;
    const memory = buildConversationMemory('owner:test', state);
    expect(memory.turns.length).toBe(2);
    expect(memory.lastInteractionDay).toBe(2);
    expect(memory.relationshipScore).toBeGreaterThan(50);
  });

  it('extracts promises from history', () => {
    const state = {
      wechatConversationHistory: [
        { conversationKey: 'owner:test', day: 1, playerText: '面访安排了吗？', recipientReply: '今天下午去面访' },
      ],
    } as any as GameState;
    const memory = buildConversationMemory('owner:test', state);
    expect(memory.promises.length).toBeGreaterThan(0);
  });

  it('filters by conversation key', () => {
    const state = {
      wechatConversationHistory: [
        { conversationKey: 'owner:test', day: 1, playerText: '你好', recipientReply: '收到' },
        { conversationKey: 'owner:other', day: 1, playerText: '你好', recipientReply: '收到' },
      ],
    } as any as GameState;
    const memory = buildConversationMemory('owner:test', state);
    expect(memory.turns.length).toBe(1);
  });

  it('limits to last 5 turns', () => {
    const history = Array.from({ length: 10 }, (_, i) => ({
      conversationKey: 'owner:test', day: i, playerText: `消息${i}`, recipientReply: `回复${i}`,
    }));
    const state = { wechatConversationHistory: history } as any as GameState;
    const memory = buildConversationMemory('owner:test', state);
    expect(memory.turns.length).toBe(5);
  });
});
