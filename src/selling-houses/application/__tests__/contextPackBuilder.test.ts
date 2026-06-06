import { describe, it, expect } from 'vitest';
import { buildDailyStoryContextPack } from '../dailyStory/contextPackBuilder.js';
import type { DailyReport, GameState, DailyTickResult } from '../../domain/models.js';
import type { DailyStoryPlayerProfile } from '../dailyStory/contextPackBuilder.js';

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
      { label: '紧迫感', value: 8, unit: '点' },
    ],
    marketNews: ['天气晴好，适合带看'],
    todayPlan: {
      label: '推进日',
      theme: '面访+竞品',
      energy: 8,
      focusCases: ['天山花园3房'],
      priorities: ['下午面访王姐', '整理竞品数据'],
    },
    randomEvents: [],
    ...overrides,
  };
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    cases: [
      {
        id: 'case-1',
        title: '天山花园3房',
        community: '天山花园',
        district: '长宁',
        layout: '3室2厅',
        area: 95,
        askPrice: 680,
        marketPrice: 620,
        bottomPrice: 600,
        trust: 55,
        patience: 50,
        urgency: 60,
        heat: 65,
        competitiveness: 55,
        priceGapPct: 9.7,
        ownerName: '王姐',
        ownerArchetypeId: 'anxious',
        hasCompletedFirstVisit: true,
        status: 'active',
        stageIndex: 2,
        stageLabel: '跟进中',
        riskFlags: [],
        personality: 'pragmatic',
      } as any,
    ],
    opportunities: [
      {
        id: 'opp-1',
        caseId: 'case-1',
        customerId: 'cust-1',
        customerName: '李先生',
        intent: 75,
        stageLabel: '高意向',
      } as any,
    ],
    ...overrides,
  } as GameState;
}

describe('buildDailyStoryContextPack', () => {
  it('builds pack from report only', () => {
    const pack = buildDailyStoryContextPack({ report: makeReport() });

    expect(pack.packId).toContain('daily-story');
    expect(pack.day).toBe(5);
    expect(pack.reportTitle).toBe('第5天经营快报');
    expect(pack.scoreboard.sharpestDeltas.length).toBeGreaterThan(0);
    expect(pack.todayPlan.theme).toBe('面访+竞品');
  });

  it('builds pack with state', () => {
    const pack = buildDailyStoryContextPack({ report: makeReport(), state: makeState() });

    expect(pack.visibleCases.length).toBe(1);
    expect(pack.visibleCases[0].title).toBe('天山花园3房');
    expect(pack.visibleCases[0].district).toBe('长宁');
    expect(pack.visibleCases[0].visibleStatus).toBe('已面访');
    expect(pack.visibleOwners.length).toBe(1);
    expect(pack.visibleOwners[0].displayName).toBe('王姐');
    expect(pack.visibleCustomers.length).toBe(1);
    expect(pack.visibleCustomers[0].displayName).toBe('李先生');
    expect(pack.visibleCustomers[0].intentLabel).toBe('高意向');
  });

  it('builds pack with tick result', () => {
    const tickResult = {
      closedDeals: [{ caseTitle: '天山花园3房', dealPrice: 640 }],
    } as any;
    const pack = buildDailyStoryContextPack({ report: makeReport(), tickResult });

    const dealEvent = pack.visibleEvents.find(e => e.title.includes('成交'));
    expect(dealEvent).toBeDefined();
    expect(dealEvent!.tone).toBe('success');
  });

  it('applies player profile constraints', () => {
    const profile: DailyStoryPlayerProfile = {
      playerId: 'p1',
      displayName: '测试经纪',
      role: 'broker',
      experienceLevel: 'beginner',
      preferredStyle: 'concise',
      focusAreas: [],
    };
    const pack = buildDailyStoryContextPack({ report: makeReport(), playerProfile: profile });

    expect(pack.constraints.some(c => c.includes('简单易懂'))).toBe(true);
    expect(pack.constraints.some(c => c.includes('简洁'))).toBe(true);
  });

  it('applies manager role constraints', () => {
    const profile: DailyStoryPlayerProfile = {
      playerId: 'p2',
      displayName: '张经理',
      role: 'manager',
      experienceLevel: 'expert',
      preferredStyle: 'detailed',
      focusAreas: [],
    };
    const pack = buildDailyStoryContextPack({ report: makeReport(), playerProfile: profile });

    expect(pack.constraints.length).toBeGreaterThanOrEqual(4);
  });

  it('infers market mood correctly', () => {
    const report = makeReport({
      metricsDelta: [
        { label: '信任度', value: -10, unit: '点' },
      ],
    });
    const pack = buildDailyStoryContextPack({ report });
    expect(pack.cityFrame.marketMood).toBe('信任压力上升');
  });

  it('infers case pressure labels', () => {
    const state = makeState();
    state.cases[0].priceGapPct = 20;
    state.cases[0].urgency = 80;
    state.cases[0].trust = 25;
    const pack = buildDailyStoryContextPack({ report: makeReport(), state });

    expect(pack.visibleCases[0].pressureLabels).toContain('价差大');
    expect(pack.visibleCases[0].pressureLabels).toContain('紧迫');
    expect(pack.visibleCases[0].pressureLabels).toContain('信任低');
  });

  it('infers owner mood', () => {
    const state = makeState();
    state.cases[0].trust = 20;
    const pack = buildDailyStoryContextPack({ report: makeReport(), state });

    expect(pack.visibleOwners[0].visibleMood).toBe('不信任');
  });

  it('handles empty state gracefully', () => {
    const pack = buildDailyStoryContextPack({ report: makeReport(), state: null });

    expect(pack.visibleCases).toEqual([]);
    expect(pack.visibleOwners).toEqual([]);
    expect(pack.visibleCustomers).toEqual([]);
  });

  it('handles storytelling style', () => {
    const profile: DailyStoryPlayerProfile = {
      playerId: 'p3',
      displayName: '故事王',
      role: 'broker',
      experienceLevel: 'expert',
      preferredStyle: 'storytelling',
      focusAreas: [],
    };
    const pack = buildDailyStoryContextPack({ report: makeReport(), playerProfile: profile });

    expect(pack.constraints.some(c => c.includes('讲故事'))).toBe(true);
  });
});
