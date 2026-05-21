import { describe, expect, it } from 'vitest';
import { buildCaseAgentContextPack } from '../agents/caseContextPackBuilder.js';
import {
  buildCaseAgentMeshOverviewLines,
  buildCaseAgentMeshPlan,
} from '../agents/caseMesh.js';
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

describe('case mesh', () => {
  it('builds an ordered multi-role mesh with primary and shadow roles', () => {
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

    expect(mesh.primaryRoleId).toBe('owner');
    expect(mesh.executionOrder).toEqual(['owner', 'broker', 'manager', 'customer', 'world']);
    expect(mesh.roleCards.find((card) => card.roleId === 'owner')?.kind).toBe('primary');
    expect(mesh.roleCards.find((card) => card.roleId === 'world')?.kind).toBe('shadow');
    expect(mesh.roleCards.find((card) => card.roleId === 'manager')?.supportRoleIds).toContain('broker');

    const overview = buildCaseAgentMeshOverviewLines(mesh).join('\n');
    expect(overview).toContain('Case Mesh');
    expect(overview).toContain('执行顺序');
    expect(overview).toContain('角色 owner(primary)');
    expect(overview).toContain('角色 world(shadow)');
  });
});
