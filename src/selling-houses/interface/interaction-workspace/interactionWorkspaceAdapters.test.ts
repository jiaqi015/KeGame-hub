import { describe, expect, it } from 'vitest';
import type { GameState } from '../../domain/models.js';
import {
  buildBrokerWorkspaceView,
  buildMatterWorkspaceProjection,
  buildTodayPlanWorkspaceProjection,
} from './index.js';

function buildState(): GameState {
  return {
    day: 3,
    currentDate: '2026-04-29',
    energy: 6,
    maxEnergy: 8,
    localRevision: 12,
    schedule: [
      {
        key: 'schedule-1',
        caseId: 'case-1',
        title: '上午复盘重点房源',
        badge: '固定安排',
        note: '今日必须先完成的固定节奏。',
        urgency: 86,
        slot: 'am',
        source: 'routine',
      },
    ],
    cases: [
      {
        id: 'case-1',
        title: '梧桐苑 88 平',
        community: '梧桐苑',
        status: 'active',
      },
    ],
    matters: [
      {
        id: 'matter-1',
        source: 'priority',
        sourceKey: 'priority-1',
        caseId: 'case-1',
        scene: 'report_to_owner',
        lifecycleCategory: 'report',
        title: '给业主同步反馈',
        detail: '业主正在等今天的反馈。',
        stage: 'pending',
        template: 'form',
        presentation: 'inline-card',
        kind: 'case',
        urgency: 84,
        openedAtDay: 2,
        updatedAtDay: 3,
      },
    ],
    todayPlan: {
      day: 3,
      playerItems: [
        {
          id: 'today-1',
          day: 3,
          sourceMatterId: 'matter-1',
          linkedActionId: 'send-owner-report',
          linkedCaseId: 'case-1',
          executionMode: 'direct',
          status: 'planned',
          slot: 'am',
        },
        {
          id: 'today-2',
          day: 3,
          linkedActionId: 'refresh-listing-package',
          linkedCaseId: 'case-1',
          executionMode: 'direct',
          status: 'completed',
          slot: 'pm',
        },
      ],
    },
    opportunities: [],
    productRuns: [],
  } as unknown as GameState;
}

describe('interaction workspace adapters', () => {
  it('separates today-plan interaction items from fixed world truth without mutating state', () => {
    const state = buildState();
    const before = JSON.stringify(state);

    const projection = buildTodayPlanWorkspaceProjection(state);

    expect(JSON.stringify(state)).toBe(before);
    expect(projection.plannedInteractionItems).toHaveLength(1);
    expect(projection.completedInteractionItems).toHaveLength(1);
    expect(projection.fixedWorldItems).toHaveLength(1);
    expect(projection.plannedInteractionItems[0].worldTruthKind).toBe('player_intent');
    expect(projection.fixedWorldItems[0].worldTruthKind).toBe('schedule_truth');
    expect(Object.isFrozen(projection)).toBe(true);
  });

  it('projects matters as copied adapter state linked to domain truth by id', () => {
    const state = buildState();

    const projection = buildMatterWorkspaceProjection(state);
    state.matters[0].title = 'mutated after projection';

    expect(projection.pendingItems).toHaveLength(1);
    expect(projection.pendingItems[0].domainMatterId).toBe('matter-1');
    expect(projection.pendingItems[0].title).toBe('给业主同步反馈');
    expect(projection.pendingItems[0].projectionKind).toBe('matter_adapter_state');
    expect(Object.isFrozen(projection.pendingItems[0])).toBe(true);
  });

  it('builds a broker workspace view with read-only POV boundaries', () => {
    const state = buildState();

    const view = buildBrokerWorkspaceView(state);

    expect(view.meta.role).toBe('broker');
    expect(view.pov.actor).toBe('broker');
    expect(view.todayPlan.plannedInteractionItems[0].id).toBe('today-1');
    expect(view.matters.pendingItems[0].domainMatterId).toBe('matter-1');
    expect(Object.isFrozen(view)).toBe(true);
  });
});
