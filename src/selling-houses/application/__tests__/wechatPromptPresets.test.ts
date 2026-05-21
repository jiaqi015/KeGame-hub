import { describe, expect, it } from 'vitest';
import { resolveWechatAgentProfile } from '../agents/wechatAgentAdapter.js';
import { buildWechatAgentPromptSections, buildWechatConversationTurnPromptLines } from '../agents/wechatPromptPresets.js';
import { buildCaseAgentContextPack } from '../agents/caseContextPackBuilder.js';
import type { GameState } from '../../domain/models.js';
import type { ConversationReceipt, ConversationSceneInputPack } from '../../core/world-state/conversation/models.js';

function buildScene(): ConversationSceneInputPack {
  return {
    sceneId: 'scene-1',
    runId: 'run-1',
    day: 7,
    conversationKey: 'owner:shaonvshi',
    sourceMessageId: 'msg-1',
    sceneType: 'owner_wechat',
    playerText: '我把竞品和客户反馈整理给您。',
    sourceMessage: {
      messageId: 'msg-1',
      senderName: '邵女士',
      senderRole: 'owner',
      content: '今天能不能给个明确方案，别只是说再等等。',
      timeLabel: 'DAY 7',
      urgency: 'urgent',
      primaryCtaLabel: '安排面访',
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
      urgency: 72,
      heat: 68,
      competitiveness: 61,
      hasCompletedFirstVisit: true,
      ownerProfileLabel: '强势急售型业主',
    },
    recentTurns: [],
  };
}

function buildHistoryReceipt(): ConversationReceipt {
  return {
    receiptId: 'receipt-1',
    conversationKey: 'owner:shaonvshi',
    sourceMessageId: 'msg-1',
    day: 7,
    turnIndex: 1,
    sceneType: 'owner_wechat',
    actorName: '邵女士',
    actorRole: 'owner',
    playerText: '我把竞品和客户反馈整理给您。',
    recipientReply: '别只说整理，今天给我一个明确判断。',
    summary: '业主要求明确判断和下一步。',
    proposal: {
      summary: '业主要求明确判断和下一步。',
      recipientReply: '别只说整理，今天给我一个明确判断。',
      intentKinds: ['reassure'],
      riskKinds: ['none'],
      evidenceUse: 'specific',
      confidence: 0.72,
    },
    settlement: {
      trustDelta: 1,
      patienceDelta: 0,
      urgencyDelta: 0,
      priceFlexibilityDelta: 0,
      customerIntentDelta: 0,
      customerConfidenceDelta: 0,
      effectLabels: [],
    },
    nextSteps: [],
    source: 'ai',
  };
}

describe('wechat prompt presets', () => {
  it('builds a layered system prompt for WeChat agents', () => {
    const scene = buildScene();
    const pack = buildCaseAgentContextPack({
      day: 7,
      currentDate: '2026-05-20',
      cases: [],
      opportunities: [],
      marketShadow: {
        rivalListings: [],
        marketSignals: [],
        dailyMarketEvent: null,
      },
      wechatConversationHistory: [buildHistoryReceipt()],
    } as unknown as GameState, scene)!;

    const sections = buildWechatAgentPromptSections({
      profile: resolveWechatAgentProfile(scene),
      scene,
      caseContextPack: pack,
    });

    expect(sections.rootLines.join('\n')).toContain('只能输出 proposal');
    expect(sections.roleLines.join('\n')).toContain('对话角色：');
    expect(sections.contextLines.join('\n')).toContain('上下文预算');
    expect(sections.validationLines.join('\n')).toContain('不要脑补缺失事实');
    expect(sections.validationLines.join('\n')).toContain('可用工具 case-read');
    expect(sections.validationLines.join('\n')).not.toContain('scenario.simulateTopic');
    expect(sections.outputContractLines.join('\n')).toContain('recipientReply 必须像这个角色本人回的一条微信');
    expect(sections.contextLines.join('\n')).toContain('会话历史');
  });

  it('builds a judge prompt that is ready for DeepSeek JSON output', () => {
    const scene = buildScene();
    const pack = buildCaseAgentContextPack({
      day: 7,
      currentDate: '2026-05-20',
      cases: [],
      opportunities: [],
      marketShadow: {
        rivalListings: [],
        marketSignals: [],
        dailyMarketEvent: null,
      },
      wechatConversationHistory: [buildHistoryReceipt()],
    } as unknown as GameState, scene)!;

    const lines = buildWechatConversationTurnPromptLines({
      profile: resolveWechatAgentProfile(scene),
      scene,
      caseContextPack: pack,
    });

    expect(lines.join('\n')).toContain('微信对话理解器');
    expect(lines.join('\n')).toContain('只输出 JSON');
    expect(lines.join('\n')).toContain('如果上下文预算显示已压缩，不要脑补缺失事实');
    expect(lines.join('\n')).toContain('意图识别顺序');
  });
});
