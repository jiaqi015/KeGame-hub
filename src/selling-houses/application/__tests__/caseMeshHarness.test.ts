import { describe, expect, it } from 'vitest';
import { buildCaseAgentContextPack } from '../agents/caseContextPackBuilder.js';
import { buildCaseAgentMeshPlan } from '../agents/caseMesh.js';
import { buildCaseAgentMeshHarnessReport } from '../agents/caseMeshHarness.js';
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
    recentTurns: [],
  };
}

describe('case mesh harness', () => {
  it('summarizes readiness for downstream shadow replay and self-play', () => {
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
      marketShadow: { rivalListings: [], marketSignals: [], dailyMarketEvent: null },
      worldCausalEvents: [],
      actionReceiptHistory: [],
    } as unknown as GameState, scene)!;

    const mesh = buildCaseAgentMeshPlan({ scene, caseContextPack: pack });
    const report = buildCaseAgentMeshHarnessReport(mesh);

    expect(report.readiness).toBe('ready');
    expect(report.executionOrder).toEqual(mesh.executionOrder);
    expect(report.signals).toContain('prompt_lines_ready');
    expect(report.signals).toContain('has_shadow_role');
    expect(report.signals).toContain('supports_world');
    expect(report.signals).toContain('long_shared_context');
    expect(report.summary).toContain('case case-1 mesh ready');
    expect(report.summary).toContain('primary=owner');
  });
});
