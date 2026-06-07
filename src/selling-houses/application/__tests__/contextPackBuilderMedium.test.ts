import { describe, it, expect } from 'vitest';
import { buildDailyStoryContextPack } from '../dailyStory/contextPackBuilder.js';
import type { DailyReport } from '../../domain/models.js';

function makeReport(overrides: Partial<DailyReport> = {}): DailyReport {
  return {
    day: 5,
    title: '第5天经营快报',
    majorEvents: [
      { actor: 'owner', message: '王姐同意调价到640万', tone: 'success' },
      { actor: 'market', message: '竞品天山花园2房挂价下调', tone: 'danger' },
    ],
    metricsDelta: [
      { label: '总分', value: 72, unit: '分', displayMode: 'absolute' },
      { label: '信任度', value: -3, unit: '点' },
    ],
    marketNews: [],
    todayPlan: { label: '推进日', theme: '面访+竞品', energy: 8, focusCases: ['天山花园3房'], priorities: ['下午面访王姐'] },
    randomEvents: [
      { actor: 'system', message: '随机事件1', tone: 'success' as const },
      { actor: 'system', message: '随机事件2', tone: 'success' as const },
    ],
    ...overrides,
  };
}

describe('contextPackBuilder - Medium CR fixes', () => {
  // Bug #1: eventId should be unique across major and random events
  it('eventIds are unique across major and random events', () => {
    const pack = buildDailyStoryContextPack({ report: makeReport() });
    const ids = pack.visibleEvents.map(e => e.eventId);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  // Bug #1: eventId should use type prefix consistently
  it('major events have major- prefix, random events have random- prefix', () => {
    const pack = buildDailyStoryContextPack({ report: makeReport() });
    const majorEvents = pack.visibleEvents.filter(e => e.eventId.startsWith('major-'));
    const randomEvents = pack.visibleEvents.filter(e => e.eventId.startsWith('random-'));
    expect(majorEvents.length).toBe(2);
    expect(randomEvents.length).toBe(2);
  });

  // Bug #2: buildVisibleCustomers should use Map for O(1) lookup
  it('buildVisibleCustomers handles many cases and opportunities', () => {
    const cases = Array.from({ length: 50 }, (_, i) => ({
      id: `case-${i}`, title: `案例${i}`, community: '小区', district: '区',
      layout: '3室', area: 100, askPrice: 600, marketPrice: 580,
      trust: 50, patience: 50, urgency: 50, priceGapPct: 3,
      status: 'active' as const, hasCompletedFirstVisit: true,
    }));
    const state = { cases, opportunities: cases.map((c, i) => ({
      id: `opp-${i}`, caseId: c.id, customerId: `cust-${i}`,
      customerName: `客户${i}`, intent: 50, stageLabel: '中意向',
    })) } as any;
    const pack = buildDailyStoryContextPack({ report: makeReport(), state });
    expect(pack.visibleCustomers.length).toBeGreaterThan(0);
  });
});
