import { describe, expect, it } from 'vitest';
import { buildCaseAgentContextPack } from '../agents/caseContextPackBuilder.js';
import { buildCaseAgentMeshPlan } from '../agents/caseMesh.js';
import { buildCaseAgentMeshHarnessReport } from '../agents/caseMeshHarness.js';
import { buildSelfPlayMeshStats, compareSelfPlayMeshStatsToHarness } from '../selfPlayMesh.js';
import type { ConversationReceipt, ConversationSceneInputPack } from '../../core/world-state/conversation/models.js';
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
    recentTurns: [],
  };
}

function buildState(): GameState {
  return {
    day: 7,
    currentDate: '2026-05-20',
    runId: 'run-1',
    cases: [],
    opportunities: [],
    customers: [],
    marketShadow: {
      rivalListings: [],
      marketSignals: [],
      dailyMarketEvent: null,
      inboundQueue: [],
    },
    eventLog: [],
    wechatConversationHistory: [],
    agentMemoryStore: [],
    activeRules: [],
    gameOver: false,
    maxDay: 21,
    energy: 6,
    maxEnergy: 6,
    cash: 100,
    soldCount: 0,
    auxiliaryStats: {
      soldCount: 0,
      withdrawnCount: 0,
      commission: 0,
      wordOfMouth: 0,
    },
  } as unknown as GameState;
}

function buildReceipt(overrides: Partial<ConversationReceipt> = {}): ConversationReceipt {
  return {
    receiptId: overrides.receiptId || 'receipt-1',
    conversationKey: 'owner:shaonvshi',
    sourceMessageId: 'msg-1',
    day: 7,
    turnIndex: 1,
    sceneType: 'owner_wechat',
    actorName: '邵女士',
    actorRole: 'owner',
    playerText: '下午我把客户反馈和竞品价格当面说清楚。',
    recipientReply: '好，你把客户反馈和竞品价格摊开说。',
    summary: 'ready mesh turn',
    proposal: {} as never,
    settlement: {} as never,
    nextSteps: [],
    source: 'ai',
    traceSnapshot: {
      acceptedSource: 'llm',
      ruleConfidence: 0.52,
      llmConfidence: 0.82,
      pressure: ['客户在比价'],
      uncertainty: [],
      memoryFactCount: 3,
      contextSignalCount: 4,
      arbiterDecision: 'llm accepted',
      validationNotes: [],
      rejectedReasons: [],
      meshReadiness: 'ready',
      meshPrimaryRoleId: 'owner',
      meshSignals: [
        'role_count:5',
        'primary:owner',
        'execution_order:owner>broker>manager>customer>world',
        'has_shadow_role',
        'supports_world',
        'prompt_lines_ready',
      ],
      meshSummary: 'mesh ready',
    },
    ...overrides,
  } as ConversationReceipt;
}

describe('selfPlay mesh summary', () => {
  it('aggregates mesh stats and compares them with a live harness report', () => {
    const scene = buildScene();
    const state = buildState();
    const pack = buildCaseAgentContextPack(state, scene)!;
    const reference = buildCaseAgentMeshHarnessReport(buildCaseAgentMeshPlan({ scene, caseContextPack: pack }));
    const stats = buildSelfPlayMeshStats([
      buildReceipt(),
      buildReceipt({
        receiptId: 'receipt-2',
        turnIndex: 2,
        traceSnapshot: {
          acceptedSource: 'llm',
          ruleConfidence: 0.48,
          llmConfidence: 0.79,
          pressure: ['客户在看竞品'],
          uncertainty: [],
          memoryFactCount: 4,
          contextSignalCount: 5,
          arbiterDecision: 'llm accepted',
          validationNotes: [],
          rejectedReasons: [],
          meshReadiness: 'ready',
          meshPrimaryRoleId: 'owner',
          meshSignals: [
            'role_count:5',
            'primary:owner',
            'execution_order:owner>broker>manager>customer>world',
            'has_shadow_role',
            'supports_world',
          ],
          meshSummary: 'mesh ready again',
        },
      }),
      buildReceipt({
        receiptId: 'receipt-3',
        turnIndex: 3,
        traceSnapshot: {
          acceptedSource: 'rule',
          ruleConfidence: 0.44,
          llmConfidence: null,
          pressure: ['节奏过快'],
          uncertainty: ['need_next_step'],
          memoryFactCount: 2,
          contextSignalCount: 3,
          arbiterDecision: 'rule fallback',
          validationNotes: [],
          rejectedReasons: [],
          meshReadiness: 'needs-review',
          meshPrimaryRoleId: 'owner',
          meshSignals: [
            'role_count:5',
            'primary:owner',
            'execution_order:owner>broker>manager>customer>world',
          ],
          meshSummary: 'mesh needs review',
        },
      }),
    ]);
    const comparison = compareSelfPlayMeshStatsToHarness(stats, reference);

    expect(stats.meshTurnCount).toBe(3);
    expect(stats.readinessCounts.ready).toBe(2);
    expect(stats.readinessCounts.needsReview).toBe(1);
    expect(stats.shadowTurnCount).toBe(2);
    expect(stats.dominantReadiness).toBe('ready');
    expect(stats.dominantPrimaryRoleId).toBe('owner');
    expect(stats.dominantExecutionOrder).toBe('owner>broker>manager>customer>world');
    expect(stats.summary).toContain('mesh 3/3');
    expect(stats.summary).toContain('primary_dom=owner');
    expect(stats.summary).toContain('order_dom=owner>broker>manager>customer>world');
    expect(comparison?.matched).toBe(true);
    expect(comparison?.differences).toHaveLength(0);
  });
});
