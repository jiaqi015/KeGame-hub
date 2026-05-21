import { describe, expect, it } from 'vitest';
import { buildWechatAgentRuntime } from '../agents/wechatAgentAdapter.js';
import { buildCaseAgentContextPack } from '../agents/caseContextPackBuilder.js';
import { buildWechatConversationTurnPromptLines } from '../agents/wechatPromptPresets.js';
import type { GameState } from '../../domain/models.js';
import type { ConversationReceipt, ConversationSceneInputPack } from '../../core/world-state/conversation/models.js';

const scene: ConversationSceneInputPack = {
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
      factId: 'risk-1',
      agentId: 'wechat:owner:shaonvshi',
      kind: 'open_risk',
      summary: '未消化风险：offensive_reply',
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

function buildConversationReceipt(
  turnIndex: number,
  overrides: Partial<ConversationReceipt> = {},
): ConversationReceipt {
  return {
    receiptId: `receipt-${turnIndex}`,
    conversationKey: 'owner:shaonvshi',
    sourceMessageId: `msg-${turnIndex}`,
    day: 7,
    turnIndex,
    sceneType: 'owner_wechat',
    actorName: '邵女士',
    actorRole: 'owner',
    playerText: `第${turnIndex}轮玩家`,
    recipientReply: `第${turnIndex}轮回复`,
    summary: `第${turnIndex}轮摘要`,
    proposal: {
      summary: `第${turnIndex}轮摘要`,
      recipientReply: `第${turnIndex}轮回复`,
      intentKinds: ['reassure'],
      riskKinds: ['none'],
      evidenceUse: 'mentioned',
      confidence: 0.66,
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
    ...overrides,
  };
}

describe('buildCaseAgentContextPack', () => {
  it('builds one structured full-context pack for a WeChat case agent', () => {
    const state = {
      day: 7,
      currentDate: '2026-05-20',
      cases: [
        {
          id: 'case-1',
          story: '近地铁，户型紧凑，总价低。',
          tags: ['近地铁', '总价低'],
          defects: ['楼层一般'],
          marketCellId: 'cell-1',
          competitionGroupIds: ['group-1'],
          riskFlags: ['业主催促'],
          stageLabel: '客户准备出价',
          status: 'active',
        },
      ],
      opportunities: [
        {
          id: 'opp-1',
          caseId: 'case-1',
          customerId: 'customer-1',
          customerName: '罗投资客',
          stageLabel: '同类比较',
          intent: 67,
          confidence: 58,
          status: 'active',
          budgetMax: 650,
          priceSensitivity: 82,
        },
      ],
      marketShadow: {
        rivalListings: [
          {
            id: 'rival-1',
            title: '同小区两居',
            district: '静安',
            marketCellId: 'cell-1',
            askPrice: 640,
            heat: 74,
            status: 'active',
            daysLeft: 9,
            source: 'daily_event',
          },
          {
            id: 'rival-2',
            title: '隔壁低价一房',
            district: '静安',
            marketCellId: 'cell-1',
            askPrice: 598,
            heat: 69,
            status: 'active',
            daysLeft: 11,
            source: 'seed',
          },
        ],
        marketSignals: [
          {
            id: 'signal-1',
            type: 'rival_activity',
            district: '静安',
            confidence: 82,
            title: '同价位供给增加',
            message: '客户压价理由变多。',
            expiresInDays: 2,
          },
          {
            id: 'signal-2',
            type: 'rival_activity',
            district: '静安',
            confidence: 80,
            title: '邻盘补充挂牌',
            message: '同类房新增可比样本。',
            expiresInDays: 2,
          },
          {
            id: 'signal-3',
            type: 'customer_feedback',
            district: '静安',
            confidence: 76,
            title: '客户在比装修',
            message: '客户更在意装修新旧和总价。',
            expiresInDays: 2,
          },
          {
            id: 'signal-4',
            type: 'market_pressure',
            district: '静安',
            confidence: 75,
            title: '价格解释压力上升',
            message: '业主需要更清楚的价格依据。',
            expiresInDays: 2,
          },
          {
            id: 'signal-5',
            type: 'rival_activity',
            district: '静安',
            confidence: 73,
            title: '竞品展示更完整',
            message: '市场上对比材料变多。',
            expiresInDays: 2,
          },
          {
            id: 'signal-6',
            type: 'market_pressure',
            district: '静安',
            confidence: 72,
            title: '客户压价口径更强',
            message: '需要先准备竞品解释和价格预期。',
            expiresInDays: 2,
          },
        ],
        dailyMarketEvent: {
          id: 'event-1',
          day: 7,
          title: '竞品快讯',
          message: '同价位供给增加。',
          tone: 'warning',
          layer: 'rival',
          effectType: 'rival_listing_inflow',
          targetMarketCellId: 'cell-1',
        },
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
        ...Array.from({ length: 7 }, (_, index) => buildConversationReceipt(index + 1)),
        buildConversationReceipt(99, {
          conversationKey: 'owner:other-thread',
          sourceMessageId: 'other-msg',
          summary: '不应进入当前会话历史。',
        }),
      ],
      todayPlan: {
        day: 7,
        playerItems: [
          {
            id: 'plan-1',
            day: 7,
            linkedActionId: 'first-visit',
            linkedCaseId: 'case-1',
            executionMode: 'manual',
            status: 'planned',
            slot: 'afternoon',
          },
        ],
      },
      energy: 2,
      maxEnergy: 6,
    } as unknown as GameState;

    const pack = buildCaseAgentContextPack(state, scene);

    expect(pack.caseIdentity.title).toBe('万航小区 63㎡ 一房');
    expect(pack.operatingContext.energyLeft).toBe(2);
    expect(pack.operatingContext.todayPlannedActions[0]?.actionId).toBe('first-visit');
    expect(pack.memory.recentCaseActions[0]?.summary).toContain('完成首次沟通');
    expect(pack.currentWorld.externalCompetitors).toHaveLength(2);
    expect(pack.currentWorld.activeCustomers[0]?.customerName).toBe('罗投资客');
    expect(pack.memory.unresolvedRisks).toContain('未消化风险：冒犯性回复');
    expect(pack.actorMind.relationshipBoundary).toContain('不能接受辱骂');
    expect(pack.settlementContract.hardRules).toContain('LLM 只能输出 proposal，不能直接改 GameState。');
    expect(pack.availableActions.map((action) => action.actionId)).toContain('first-visit');
    expect(pack.contextBudget.isCompacted).toBe(true);
    expect(pack.memory.conversationHistory).toHaveLength(6);
    expect(pack.memory.conversationHistory[0]?.turnIndex).toBe(2);
    expect(pack.memory.conversationHistory[5]?.turnIndex).toBe(7);
    expect(pack.contextBudget.conversationHistory.kept).toBe(6);
    expect(pack.contextBudget.marketSignals.kept).toBe(5);
    expect(pack.contextBudget.externalCompetitors.kept).toBe(2);
    expect(pack.contextBudget.summary).toContain('市场信号 5/7');
    expect(pack.contextBudget.summary).toContain('外部竞品 2/2');
    expect(pack.contextBudget.summary).toContain('会话历史 6/7');
  });

  it('owner scene: visibleBoundary contains market price in canKnow and customer budget in cannotKnow', () => {
    const state = {
      day: 7,
      currentDate: '2026-05-20',
      cases: [{ id: 'case-1', marketCellId: 'cell-1' }],
      opportunities: [],
      marketShadow: { rivalListings: [], marketSignals: [] },
      worldCausalEvents: [],
      actionReceiptHistory: [],
    } as unknown as GameState;

    const pack = buildCaseAgentContextPack(state, scene);
    expect(pack).toBeDefined();
    expect(pack!.visibleBoundary.canKnow.some((item) => item.includes('市场价'))).toBe(true);
    expect(pack!.visibleBoundary.cannotKnow.some((item) => item.includes('客户') && item.includes('预算'))).toBe(true);
  });

  it('customer scene: visibleBoundary contains layout diff in canKnow and owner bottom price in cannotKnow', () => {
    const customerScene: ConversationSceneInputPack = {
      sceneId: 'scene-2',
      runId: 'run-1',
      day: 7,
      conversationKey: 'customer:luotouzike',
      sourceMessageId: 'msg-2',
      sceneType: 'customer_wechat',
      playerText: '这套房价格和户型差异我帮您确认了。',
      sourceMessage: {
        messageId: 'msg-2',
        senderName: '罗投资客',
        senderRole: 'customer',
        content: '你把价格和缺点发我看看。',
        timeLabel: 'DAY 7',
        urgency: 'normal',
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
        hasCompletedFirstVisit: false,
        ownerProfileLabel: '强势急售型业主',
      },
      opportunityContext: {
        opportunityId: 'opp-1',
        customerName: '罗投资客',
        stage: '同类比较',
        intent: 67,
        confidence: 58,
      },
      recentTurns: [],
    };

    const state = {
      day: 7,
      currentDate: '2026-05-20',
      cases: [{ id: 'case-1', marketCellId: 'cell-1' }],
      opportunities: [],
      marketShadow: { rivalListings: [], marketSignals: [] },
      worldCausalEvents: [],
      actionReceiptHistory: [],
    } as unknown as GameState;

    const pack = buildCaseAgentContextPack(state, customerScene);
    expect(pack).toBeDefined();
    expect(pack!.visibleBoundary.canKnow.some((item) => item.includes('户型差异'))).toBe(true);
    expect(pack!.visibleBoundary.cannotKnow.some((item) => item.includes('业主底价'))).toBe(true);
  });

  it('buildLLMVisibleContext does not leak heat or competitiveness', () => {
    const ownerProfile = {
      agentId: 'wechat.owner:shaonvshi',
      kind: 'human' as const,
      roleLabel: '理性业主',
      soul: '看重依据',
      goals: ['卖得合理'],
      traits: ['会追问'],
      boundaries: ['不能编造'],
      speakingStyle: ['短句'],
    };

    const lines = buildWechatConversationTurnPromptLines({
      profile: ownerProfile,
      scene,
      caseContextPack: buildCaseAgentContextPack(
        {
          day: 7,
          currentDate: '2026-05-20',
          cases: [{ id: 'case-1', marketCellId: 'cell-1' }],
          opportunities: [],
          marketShadow: { rivalListings: [], marketSignals: [] },
          worldCausalEvents: [],
          actionReceiptHistory: [],
        } as unknown as GameState,
        scene,
      ),
    });
    const prompt = lines.join('\n');
    const marker = '输入上下文：\n';
    const jsonStart = prompt.indexOf(marker);
    expect(jsonStart).toBeGreaterThan(-1);
    const jsonStr = prompt.slice(jsonStart + marker.length).trim();
    const json = JSON.parse(jsonStr);
    expect(json.caseContext).toBeDefined();
    expect(json.caseContext.heat).toBeUndefined();
    expect(json.caseContext.competitiveness).toBeUndefined();
  });

  it('buildLLMVisibleContext does not leak budgetMax or priceSensitivity as numbers', () => {
    const lines = buildWechatConversationTurnPromptLines({
      profile: {
        agentId: 'wechat.owner:shaonvshi',
        kind: 'human',
        roleLabel: '理性业主',
        soul: '看重依据',
        goals: ['卖得合理'],
        traits: ['会追问'],
        boundaries: ['不能编造'],
        speakingStyle: ['短句'],
      },
      scene,
      caseContextPack: buildCaseAgentContextPack(
        {
          day: 7,
          currentDate: '2026-05-20',
          cases: [{ id: 'case-1', marketCellId: 'cell-1' }],
          opportunities: [
            {
              id: 'opp-1',
              caseId: 'case-1',
              customerId: 'customer-1',
              customerName: '罗投资客',
              stageLabel: '同类比较',
              intent: 67,
              confidence: 58,
              status: 'active',
              budgetMax: 650,
              priceSensitivity: 82,
            },
          ],
          marketShadow: { rivalListings: [], marketSignals: [] },
          worldCausalEvents: [],
          actionReceiptHistory: [],
        } as unknown as GameState,
        scene,
      ),
    });
    const prompt = lines.join('\n');
    const marker = '输入上下文：\n';
    const jsonStart = prompt.indexOf(marker);
    expect(jsonStart).toBeGreaterThan(-1);
    const jsonStr = prompt.slice(jsonStart + marker.length).trim();
    const json = JSON.parse(jsonStr);
    const customers = json.caseAgentContextPack.currentWorld.activeCustomers;
    expect(customers[0].budgetMax).toBeUndefined();
    expect(customers[0].priceSensitivity).toBeUndefined();
    expect(customers[0].budgetRange).toBeDefined();
    expect(customers[0].priceSensitivityLevel).toBeDefined();
  });

  it('feeds the full case context into the WeChat agent prompt', () => {
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
    } as unknown as GameState, scene);

    const runtime = buildWechatAgentRuntime({ ...scene, caseContextPack: pack });
    const prompt = runtime.promptLines.join('\n');

    expect(prompt).toContain('Case 全上下文');
    expect(prompt).toContain('万航小区 63㎡ 一房');
    expect(prompt).toContain('结算边界');
    expect(prompt).toContain('LLM 只能输出 proposal');
    expect(prompt).toContain('意图识别顺序');
    expect(prompt).toContain('已做动作');
    expect(prompt).toContain('上下文预算');
  });
});
