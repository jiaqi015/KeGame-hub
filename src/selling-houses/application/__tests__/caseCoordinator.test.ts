import { describe, expect, it } from 'vitest';
import { buildCaseAgentContextPack } from '../agents/caseContextPackBuilder.js';
import {
  buildCaseAgentCoordinatorPlan,
  buildCaseAgentRolePromptLines,
} from '../agents/caseCoordinator.js';
import type { ConversationSceneInputPack } from '../../core/world-state/conversation/models.js';
import type { GameState } from '../../domain/models.js';

function buildScene(): ConversationSceneInputPack {
  return {
    sceneId: 'scene-1',
    runId: 'run-1',
    day: 7,
    conversationKey: 'owner:shaonvshi',
    sourceMessageId: 'msg-1',
    sceneType: 'owner_wechat',
    playerText: '下午我把客户反馈和竞品价格当面说清楚。',
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
    agentMemory: [
      {
        factId: 'memory-1',
        agentId: 'wechat:owner:shaonvshi',
        kind: 'recent_interaction',
        summary: '上次业主要求更具体。',
        strength: 0.8,
      },
    ],
    recentTurns: [
      {
        playerText: '我下午给您方案。',
        recipientReply: '别只说下午，具体一点。',
        summary: '业主要求明确动作。',
      },
    ],
  };
}

describe('case coordinator', () => {
  it('builds a long-context shared plan for owner/customer/manager/broker/world roles', () => {
    const scene = buildScene();
    const pack = buildCaseAgentContextPack({
      day: 7,
      currentDate: '2026-05-20',
      cases: [
        {
          id: 'case-1',
          title: '万航小区 63㎡ 一房',
          marketCellId: 'cell-1',
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
      ],
      opportunities: [],
      marketShadow: {
        rivalListings: [],
        marketSignals: [
          {
            id: 'signal-1',
            type: 'market_pressure',
            district: '静安',
            confidence: 82,
            title: '同价位供给增加',
            message: '客户压价理由变多。',
            expiresInDays: 2,
          },
        ],
        dailyMarketEvent: null,
      },
      worldCausalEvents: [
        {
          eventId: 'world-1',
          day: 7,
          summary: '客户拿竞品压价。',
          targetCaseId: 'case-1',
        },
      ],
      actionReceiptHistory: [
        {
          receiptId: 'receipt-1',
          day: 6,
          actionId: 'first-visit',
          executorId: 'first-visit',
          caseId: 'case-1',
          optionId: null,
          outcome: 'success',
          costEnergy: 1,
          costPromotionBudget: 0,
          fieldDeltas: [{ field: 'trust', from: 48, to: 52, delta: 4 }],
          outcomeSummary: '完成首次沟通，业主要求下一步方案。',
          emittedEventIds: [],
          affectedOpportunityIds: [],
        },
      ],
      wechatConversationHistory: [
        {
          receiptId: 'receipt-history-1',
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
        },
      ],
    } as unknown as GameState, scene);

    const plan = buildCaseAgentCoordinatorPlan({ scene, caseContextPack: pack });

    expect(plan.rolePlans.map((role) => role.roleId)).toEqual([
      'owner',
      'customer',
      'manager',
      'broker',
      'world',
    ]);
    expect(plan.sharedContextLines.join('\n')).toContain('Case 全上下文');
    expect(plan.sharedMemoryLines.join('\n')).toContain('会话历史');
    expect(plan.sharedBoundaryLines.join('\n')).toContain('结算边界');

    const ownerPrompt = buildCaseAgentRolePromptLines(plan, 'owner').join('\n');
    expect(ownerPrompt).toContain('你模拟业主收到经纪人微信后的真实反应');
    expect(ownerPrompt).toContain('上下文预算');
    expect(ownerPrompt).toContain('未消化风险');

    const brokerPrompt = buildCaseAgentRolePromptLines(plan, 'broker').join('\n');
    expect(brokerPrompt).toContain('你模拟经纪人面对业主、客户或经理时的专业微信回应');
    expect(brokerPrompt).toContain('只输出可结算 proposal');

    const worldPrompt = buildCaseAgentRolePromptLines(plan, 'world').join('\n');
    expect(worldPrompt).toContain('世界引擎');
    expect(worldPrompt).toContain('不能直接改 GameState');
  });
});
