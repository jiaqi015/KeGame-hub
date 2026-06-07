import { describe, it, expect } from 'vitest';
import { buildFallbackDailyStory } from '../dailyStory/fallbackStoryWriter.js';
import type { DailyCityStoryContextPack } from '../dailyStory/contextPack.js';

function makePack(overrides: Partial<DailyCityStoryContextPack> = {}): DailyCityStoryContextPack {
  return {
    packId: 'bench', day: 5, reportTitle: '第5天',
    cityFrame: { dayLabel: '第5天', currentPeriod: 'morning', districts: ['长宁', '浦东'], weatherOrExternalNotes: ['天气晴好'], marketMood: '整体平稳' },
    scoreboard: { totalScore: { value: 72, unit: '分' }, sharpestDeltas: [{ label: '信任度', value: 3, unit: '点', direction: 'down' }], riskCount: 2 },
    visibleEvents: [{ eventId: 'e1', actor: 'owner', title: '王姐调价', detail: '680→640', tone: 'success' }],
    visibleCases: [{ caseId: 'c1', title: '天山花园3房', district: '长宁', visibleStatus: '跟进中', pressureLabels: [] }],
    visibleOwners: [{ ownerId: 'o1', displayName: '王姐', visibleMood: '焦虑', pressureLabels: [] }],
    visibleCustomers: [{ customerId: 'cu1', displayName: '李先生', intentLabel: '高意向', relatedCaseTitles: ['天山花园3房'] }],
    todayPlan: { label: '推进日', theme: '面访', energy: 8, focusCases: ['天山花园3房'], priorities: ['面访'] },
    constraints: [],
    ...overrides,
  };
}

describe('Daily Story diversity', () => {
  it('30 scenarios produce at least 15 unique first-paragraph openers', () => {
    const unique = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const pack = makePack({ packId: `d-${i}`, day: 5 + i });
      const story = buildFallbackDailyStory(pack);
      const first20 = story.cityStory.paragraphs[0]?.slice(0, 20) || '';
      unique.add(first20);
    }
    expect(unique.size).toBeGreaterThanOrEqual(15);
  });

  it('30 scenarios produce at least 10 unique paragraph orders', () => {
    const uniqueOrders = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const pack = makePack({ packId: `d-${i}`, day: 5 + i });
      const story = buildFallbackDailyStory(pack);
      const orderSig = story.cityStory.paragraphs.map(p => p.slice(0, 5)).join('|');
      uniqueOrders.add(orderSig);
    }
    expect(uniqueOrders.size).toBeGreaterThanOrEqual(10);
  });

  it('quality remains 100% after diversity changes', () => {
    for (let i = 0; i < 10; i++) {
      const pack = makePack({ packId: `q-${i}`, day: 5 + i });
      const story = buildFallbackDailyStory(pack);
      expect(story.headline.length).toBeGreaterThan(0);
      expect(story.headline.length).toBeLessThanOrEqual(24);
      expect(story.deck.length).toBeGreaterThan(0);
      expect(story.deck.length).toBeLessThanOrEqual(70);
      expect(story.cityStory.paragraphs.length).toBeGreaterThanOrEqual(4);
      expect(story.cityStory.paragraphs.length).toBeLessThanOrEqual(6);
      expect(story.cityStory.wordCount).toBeGreaterThanOrEqual(450);
      expect(story.todayBridge.actionCue.length).toBeGreaterThan(0);
      expect(story.evidenceLabels.length).toBeGreaterThanOrEqual(3);
    }
  });
});
