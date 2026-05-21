import { describe, expect, it } from 'vitest';
import { buildCaseAgentContextPack } from '../agents/caseContextPackBuilder.js';
import { buildWechatDualRuntime } from '../agents/wechatDualRuntime.js';
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
    recentTurns: [],
  };
}

describe('buildWechatDualRuntime', () => {
  it('emits a harness observation for replay and shadow-mode evaluation', () => {
    const scene = buildScene();
    const caseContextPack = buildCaseAgentContextPack({
      day: 7,
      currentDate: '2026-05-20',
      cases: [],
      opportunities: [],
      marketShadow: {
        rivalListings: [],
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
            type: 'customer_feedback',
            district: '静安',
            confidence: 78,
            title: '客户在比装修',
            message: '需要解释差异。',
            expiresInDays: 2,
          },
          {
            id: 'signal-3',
            type: 'market_pressure',
            district: '静安',
            confidence: 76,
            title: '价格解释压力上升',
            message: '业主需要依据。',
            expiresInDays: 2,
          },
          {
            id: 'signal-4',
            type: 'rival_activity',
            district: '静安',
            confidence: 75,
            title: '邻盘补充挂牌',
            message: '同类房新增样本。',
            expiresInDays: 2,
          },
          {
            id: 'signal-5',
            type: 'market_pressure',
            district: '静安',
            confidence: 73,
            title: '客户压价口径更强',
            message: '需要准备竞品解释。',
            expiresInDays: 2,
          },
          {
            id: 'signal-6',
            type: 'market_pressure',
            district: '静安',
            confidence: 72,
            title: '市场对比变强',
            message: '同类房比较增多。',
            expiresInDays: 2,
          },
        ],
        dailyMarketEvent: null,
      },
    } as unknown as GameState, scene);
    const dual = buildWechatDualRuntime({ ...scene, caseContextPack }, { durationUs: 1200 });

    expect(dual.observation.agentId).toBe(dual.trace.agentId);
    expect(dual.observation.context.contextPackRef).toBe(caseContextPack?.packId);
    expect(dual.observation.context.contextBudgetSummary).toContain('市场信号 5/6');
    expect(dual.observation.tools.availableToolIds).toContain('dialogue.proposeEffect');
    expect(dual.observation.tools.availableToolIds).not.toContain('scenario.simulateTopic');
    expect(dual.observation.tools.forbiddenToolIds).toContain('state.writeDirectly');
    expect(dual.observation.proposals.ruleProposalId).toBe(dual.ruleProposal.proposalId);
    expect(dual.observation.replay.durationUs).toBe(1200);
    expect(dual.shadowReport.status).toBe('no-shadow');
    expect(dual.shadowReport.signals).toContain('llm_proposal_missing');
    expect(dual.evaluationReport.channel).toBe('wechat');
    expect(dual.evaluationReport.score).toBeGreaterThanOrEqual(0);
    expect(dual.evaluationReport.score).toBeLessThanOrEqual(100);
    expect(dual.evaluationReport.status).toBe('watch');
    expect(dual.evaluationReport.verdict).toBe('needs-work');
    expect(dual.evaluationReport.signals).toContain('shadow_no_llm');
    expect(dual.evaluationReport.signals.some((signal) => signal.startsWith('conversation:'))).toBe(true);
    expect(dual.evaluationReport.summary).toContain('微信回合');
    expect(dual.meshReport?.readiness).toBe('ready');
    expect(dual.meshReport?.signals).toContain('supports_world');
  });
});
