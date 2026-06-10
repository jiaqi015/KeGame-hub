import { describe, expect, it } from 'vitest';
import { buildFallbackConversationEffectProposal } from '../wechatConversation.js';
import type { ConversationSceneInputPack } from '../../core/world-state/conversation/models.js';

function buildScene(overrides: Partial<ConversationSceneInputPack> = {}): ConversationSceneInputPack {
  return {
    sceneId: 'scene-1',
    runId: 'run-1',
    day: 7,
    conversationKey: 'owner:test',
    sourceMessageId: 'msg-1',
    sceneType: 'owner_wechat',
    playerText: '',
    sourceMessage: {
      messageId: 'msg-1',
      senderName: '邵女士',
      senderRole: 'owner',
      content: '价格有没有空间？',
      timeLabel: 'DAY 7',
      urgency: 'medium',
    },
    caseContext: {
      caseId: 'case-1',
      title: '万航小区 63㎡ 一房',
      ownerName: '邵女士',
      district: '静安',
      community: '万航小区',
      askPrice: 612,
      marketPrice: 606,
      priceGapPct: 1,
      trust: 52,
      patience: 36,
      urgency: 55,
      heat: 68,
      competitiveness: 61,
      hasCompletedFirstVisit: true,
      ownerProfileLabel: '普通业主',
    },
    recentTurns: [],
    ...overrides,
  };
}

describe('enrichReply - enrichment passes', () => {
  it('prependSourceAwareness: adds source topic when not already in reply', () => {
    const proposal = buildFallbackConversationEffectProposal(buildScene({
      playerText: '我再想想',
      sourceMessage: {
        messageId: 'msg-1',
        senderName: '邵女士',
        senderRole: 'owner',
        content: '价格有没有空间？',
        timeLabel: 'DAY 7',
        urgency: 'medium',
      },
    }));
    // sourceTopic should be "价格的事" and prepended
    expect(proposal.recipientReply).toContain('邵女士');
  });

  it('appendRecentAwareness: adds recent ref when available', () => {
    const proposal = buildFallbackConversationEffectProposal(buildScene({
      playerText: '好的，收到',
      recentTurns: [{
        playerText: '明天面访一下',
        recipientReply: '好，明天面访。',
        summary: '安排面访',
      }],
    }));
    expect(proposal.recipientReply).toContain('邵女士');
  });

  it('enrichContext: adds case title when not present', () => {
    const proposal = buildFallbackConversationEffectProposal(buildScene({
      playerText: '收到',
      caseContext: {
        caseId: 'case-1',
        title: '万航小区 63㎡ 一房',
        ownerName: '邵女士',
        district: '静安',
        community: '万航小区',
        askPrice: 612,
        marketPrice: 606,
        priceGapPct: 1,
        trust: 52,
        patience: 36,
        urgency: 55,
        heat: 68,
        competitiveness: 61,
        hasCompletedFirstVisit: true,
        ownerProfileLabel: '普通业主',
      },
    }));
    // Should contain case reference
    expect(proposal.recipientReply).toContain('邵女士');
  });

  it('enrichEmotion: adds urgency prefix for high urgency', () => {
    const proposal = buildFallbackConversationEffectProposal(buildScene({
      playerText: '收到',
      caseContext: {
        caseId: 'case-1',
        title: '万航小区 63㎡ 一房',
        ownerName: '邵女士',
        district: '静安',
        community: '万航小区',
        askPrice: 612,
        marketPrice: 606,
        priceGapPct: 1,
        trust: 52,
        patience: 36,
        urgency: 80,
        heat: 68,
        competitiveness: 61,
        hasCompletedFirstVisit: true,
        ownerProfileLabel: '普通业主',
      },
    }));
    // High urgency should add urgency prefix
    expect(proposal.recipientReply).toContain('邵女士');
  });

  it('enrichResilience: expands very short replies', () => {
    const proposal = buildFallbackConversationEffectProposal(buildScene({
      playerText: '收到',
    }));
    // Short replies get expanded
    expect(proposal.recipientReply.length).toBeGreaterThan(10);
  });

  it('hostile input skips enrichment', () => {
    const proposal = buildFallbackConversationEffectProposal(buildScene({
      playerText: '傻逼',
    }));
    // Hostile replies should NOT be enriched
    expect(proposal.intentKinds).toContain('hostile');
    expect(proposal.recipientReply).toContain('态度');
  });

  it('enrichInference: adds differentiation for family hesitation', () => {
    const proposal = buildFallbackConversationEffectProposal(buildScene({
      playerText: '家里人觉得不太合适',
    }));
    expect(proposal.recipientReply).toContain('邵女士');
  });

  it('enrichInference: adds strategy for long-listed properties', () => {
    const proposal = buildFallbackConversationEffectProposal(buildScene({
      playerText: '挂了三个月了还没动静',
    }));
    expect(proposal.recipientReply).toContain('邵女士');
  });

  it('enrichStrategy: adds action suffix when no time/action mentioned', () => {
    const proposal = buildFallbackConversationEffectProposal(buildScene({
      playerText: '嗯嗯好的',
    }));
    expect(proposal.recipientReply).toContain('邵女士');
  });
});
