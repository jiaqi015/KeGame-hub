import { describe, expect, it } from 'vitest';
import type { GameState, MatterEntry } from '../../domain/models.js';
import {
  getSlotRemainingCapacity,
  getTodayPlanRemainingEnergy,
} from '../todayPlan.js';

function capacityState(overrides: Partial<GameState> = {}): GameState {
  return {
    day: 4,
    energy: 3,
    maxEnergy: 3,
    schedule: [
      {
        key: 'focus-meeting',
        caseId: 'case-1',
        title: '周四上午聚焦会',
        badge: '内部会',
        note: '上午固定进行提报评审。',
        urgency: 95,
        slot: 'am',
        source: 'routine',
        weekdayIntent: '内部聚焦会',
        actionId: 'focus-meeting-submit',
      },
      {
        key: 'owner-risk',
        caseId: 'case-2',
        title: '业主开始不耐烦',
        badge: '2 天内',
        note: '这是风险提醒，不应该占用排程容量。',
        urgency: 90,
        slot: 'pm',
        source: 'risk',
      },
    ],
    matters: [],
    todayPlan: { day: 4, playerItems: [] },
    productRuns: [],
    cases: [],
    eventStore: [],
    ...overrides,
  } as unknown as GameState;
}

function opportunityMatter(overrides: Partial<MatterEntry> = {}): MatterEntry {
  return {
    id: 'matter-opportunity',
    source: 'priority',
    sourceKey: 'priority-opportunity',
    caseId: 'case-2',
    scene: 'client_call',
    lifecycleCategory: 'report',
    title: '客户机会跟进',
    detail: '这是候选动作来源，不是隐藏固定安排。',
    stage: 'pending',
    template: 'dialog',
    presentation: 'inline-card',
    kind: 'opportunity',
    urgency: 72,
    openedAtDay: 4,
    updatedAtDay: 4,
    ...overrides,
  };
}

describe('today plan capacity', () => {
  it('does not let risk reminders consume playable energy or afternoon capacity', () => {
    const state = capacityState();

    expect(getTodayPlanRemainingEnergy(state)).toBe(1);
    expect(getSlotRemainingCapacity(state, 'am')).toBe(0);
    expect(getSlotRemainingCapacity(state, 'pm')).toBe(4);
  });

  it('does not reserve hidden energy for ordinary opportunity follow-up matters', () => {
    const state = capacityState({
      matters: [opportunityMatter()],
    });

    expect(getTodayPlanRemainingEnergy(state)).toBe(1);
    expect(getSlotRemainingCapacity(state, 'pm')).toBe(4);
  });

  it('reserves one afternoon hour only for active negotiation matters', () => {
    const state = capacityState({
      matters: [opportunityMatter({ source: 'negotiation', sourceKey: 'op-1', scene: 'negotiation', lifecycleCategory: 'negotiate' })],
    });

    expect(getTodayPlanRemainingEnergy(state)).toBe(0);
    expect(getSlotRemainingCapacity(state, 'pm')).toBe(3);
  });
});
