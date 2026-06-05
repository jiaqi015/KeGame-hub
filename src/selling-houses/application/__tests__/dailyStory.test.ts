import { describe, it, expect } from 'vitest';
import type { DailyCityStoryContextPack } from '../dailyStory/contextPack';
import { normalizeDailyCityStory } from '../dailyStory/normalizer';
import { buildFallbackDailyStory } from '../dailyStory/fallbackStoryWriter';

function buildMockPack(overrides: Partial<DailyCityStoryContextPack> = {}): DailyCityStoryContextPack {
  return {
    packId: 'test-pack',
    day: 1,
    reportTitle: '第1天经营快报',
    cityFrame: {
      dayLabel: '第1天',
      currentPeriod: 'night',
      districts: ['浦东', '长宁'],
      weatherOrExternalNotes: [],
      marketMood: '平稳',
    },
    scoreboard: {
      totalScore: { value: 65, unit: '分' },
      sharpestDeltas: [{ label: '信任', value: -5, unit: '点', direction: 'down' }],
      riskCount: 2,
    },
    visibleEvents: [
      { eventId: 'evt-1', actor: '系统', title: '业主信任下降', detail: '王姐信任从40降到35', tone: 'danger', relatedOwnerName: '王姐', relatedCaseTitle: '天山花园3房' },
    ],
    visibleCases: [
      { caseId: 'case-1', title: '天山花园3房', district: '长宁', visibleStatus: 'active', pressureLabels: ['信任偏低'] },
    ],
    visibleOwners: [
      { ownerId: 'owner-1', displayName: '王姐', relatedCaseTitle: '天山花园3房', visibleMood: '焦虑', pressureLabels: ['信任偏低'] },
    ],
    visibleCustomers: [
      { customerId: 'cust-1', displayName: '陈先生', intentLabel: '中等意向', relatedCaseTitles: ['天山花园3房'] },
    ],
    todayPlan: {
      label: '今日安排',
      theme: '重点推进',
      energy: 6,
      focusCases: ['天山花园3房'],
      priorities: ['面访王姐', '跟进陈先生'],
    },
    constraints: ['精力有限'],
    ...overrides,
  };
}

describe('Daily City Story', () => {
  describe('context pack validation', () => {
    it('should not contain hidden/global truth fields', () => {
      const pack = buildMockPack();
      expect(pack).not.toHaveProperty('hiddenTruth');
      expect(pack).not.toHaveProperty('globalState');
      expect(pack).not.toHaveProperty('internalScores');
    });

    it('should contain required fields', () => {
      const pack = buildMockPack();
      expect(pack.day).toBeDefined();
      expect(pack.reportTitle).toBeDefined();
      expect(pack.todayPlan).toBeDefined();
      expect(pack.scoreboard).toBeDefined();
      expect(pack.visibleEvents).toBeDefined();
    });
  });

  describe('normalizer', () => {
    it('should accept valid AI output', () => {
      const pack = buildMockPack();
      const aiOutput = {
        headline: '第1天经营快报',
        deck: '浦东、长宁商圈平稳',
        cityStory: {
          paragraphs: [
            '第1天，浦东、长宁商圈平稳。门店节奏重点推进，今日精力6小时。市场整体氛围偏冷，客户观望情绪浓厚，但部分优质房源仍有热度。今天重点关注天山花园3房和虹桥花园2房。各条线按计划推进，没有突发风险。各区域门店按计划推进，没有突发风险事件。整体经营节奏平稳，没有大的波动。',
            '信任变化下降5点。当前2个风险点。王姐的信任度从40降到35，主要原因是上周承诺的面访没有兑现，导致她对经纪人的配合度下降。这个变化会影响后续沟通效率，需要尽快修复关系。建议今天下午去面访，带竞品数据和客户反馈。同时需要关注其他业主的信任变化，避免类似问题。需要尽快修复关系，不能只靠口头安抚。',
            '昨夜关键事件：业主信任下降。王姐信任从40降到35，涉及天山花园3房。这套房挂牌价680万，市场价620万，价差9.7%，客户反馈偏高。需要尽快修复关系，不能只靠口头安抚。建议今天下午去面访，带竞品数据和客户反馈。同时需要关注虹桥花园2房的竞品压力。竞品挂牌价600万，客户反馈偏高。',
            '今日重点关注天山花园3房。涉及业主：王姐。建议今天下午去面访，带竞品数据和客户反馈，修复信任关系。同时跟进陈先生的看房需求。今天精力6小时，优先处理高风险事项。同时需要关注虹桥花园2房的竞品压力，避免被切。客户反馈偏高，需要尽快确认价格和竞品差异。',
          ],
          wordCount: 450,
        },
        todayBridge: { label: '今天怎么接', value: '面访王姐', actionCue: '优先处理天山花园3房' },
        evidenceLabels: ['业主信任下降'],
        citedEventIds: ['evt-1'],
        citedCaseIds: ['case-1'],
        citedCustomerIds: ['cust-1'],
        citedOwnerIds: ['owner-1'],
        safety: { hiddenTruthUsed: false, inventedFacts: false, needsFallback: false },
      };

      const result = normalizeDailyCityStory(aiOutput, pack);
      expect(result.validationNotes.length).toBe(0);
      expect(result.result.source).toBe('ai');
      expect(result.result.cityStory.paragraphs.length).toBe(4);
    });

    it('should reject invalid citedEventIds', () => {
      const pack = buildMockPack();
      const aiOutput = {
        headline: 'test',
        deck: 'test',
        cityStory: { paragraphs: ['段1', '段2', '段3', '段4'], wordCount: 100 },
        todayBridge: { label: '今天怎么接', value: 'test', actionCue: 'test' },
        evidenceLabels: ['test'],
        citedEventIds: ['nonexistent-event'],
        citedCaseIds: [],
        citedCustomerIds: [],
        citedOwnerIds: [],
        safety: { hiddenTruthUsed: false, inventedFacts: false, needsFallback: false },
      };

      const result = normalizeDailyCityStory(aiOutput, pack);
      expect(result.validationNotes).toContain('invalid_event_id:nonexistent-event');
    });

    it('should reject forbidden words', () => {
      const pack = buildMockPack();
      const aiOutput = {
        headline: 'test',
        deck: 'test',
        cityStory: { paragraphs: ['这是LLM生成的故事', '段2', '段3', '段4'], wordCount: 100 },
        todayBridge: { label: '今天怎么接', value: 'test', actionCue: 'test' },
        evidenceLabels: ['test'],
        citedEventIds: [],
        citedCaseIds: [],
        citedCustomerIds: [],
        citedOwnerIds: [],
        safety: { hiddenTruthUsed: false, inventedFacts: false, needsFallback: false },
      };

      const result = normalizeDailyCityStory(aiOutput, pack);
      expect(result.validationNotes.some(n => n.includes('forbidden_words'))).toBe(true);
    });

    it('should reject too few paragraphs', () => {
      const pack = buildMockPack();
      const aiOutput = {
        headline: 'test',
        deck: 'test',
        cityStory: { paragraphs: ['段1', '段2'], wordCount: 50 },
        todayBridge: { label: '今天怎么接', value: 'test', actionCue: 'test' },
        evidenceLabels: ['test'],
        citedEventIds: [],
        citedCaseIds: [],
        citedCustomerIds: [],
        citedOwnerIds: [],
        safety: { hiddenTruthUsed: false, inventedFacts: false, needsFallback: false },
      };

      const result = normalizeDailyCityStory(aiOutput, pack);
      expect(result.validationNotes.some(n => n.includes('too_few_paragraphs'))).toBe(true);
    });
  });

  describe('fallback story writer', () => {
    it('should output at least 4 paragraphs', () => {
      const pack = buildMockPack();
      const story = buildFallbackDailyStory(pack);
      expect(story.cityStory.paragraphs.length).toBeGreaterThanOrEqual(4);
    });

    it('should not contain system noise', () => {
      const pack = buildMockPack();
      const story = buildFallbackDailyStory(pack);
      const text = story.cityStory.paragraphs.join('');
      expect(text).not.toContain('LLM');
      expect(text).not.toContain('fallback');
      expect(text).not.toContain('规则置信度');
      expect(text).not.toContain('模型');
    });

    it('should reference visible events', () => {
      const pack = buildMockPack();
      const story = buildFallbackDailyStory(pack);
      expect(story.citedEventIds.length).toBeGreaterThan(0);
    });

    it('should have todayBridge', () => {
      const pack = buildMockPack();
      const story = buildFallbackDailyStory(pack);
      expect(story.todayBridge.label).toBeDefined();
      expect(story.todayBridge.value).toBeDefined();
      expect(story.todayBridge.actionCue).toBeDefined();
    });
  });
});
