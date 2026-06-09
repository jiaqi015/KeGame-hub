import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callDeepSeekChat } from '../../../../../lib/deepseek.js';
import { handleDailyStory } from '../dailyStoryHandlers.js';
import type { DailyCityStoryContextPack } from '../../../application/dailyStory/contextPack.js';

vi.mock('../../../../../lib/deepseek.js', () => ({
  callDeepSeekChat: vi.fn(),
}));

const mockedCallDeepSeekChat = vi.mocked(callDeepSeekChat);

function buildMockPack(): DailyCityStoryContextPack {
  return {
    packId: 'daily-handler-test-pack',
    day: 3,
    reportTitle: '第3天经营简报',
    cityFrame: {
      dayLabel: '第3天',
      currentPeriod: 'night',
      districts: ['浦东前滩', '静安寺北'],
      weatherOrExternalNotes: ['夜间客户回复集中在价格和带看时间'],
      marketMood: '平稳但竞争加剧',
    },
    scoreboard: {
      totalScore: { value: 72, unit: '分' },
      sharpestDeltas: [
        { label: '业主信任', value: -8, unit: '点', direction: 'down' },
      ],
      riskCount: 2,
    },
    visibleEvents: [
      {
        eventId: 'evt-owner-trust-drop',
        actor: 'owner',
        title: '秦先生催看成交证据',
        detail: '秦先生要求明天面访时直接带同小区成交和客户反馈，不想再听空口判断。',
        tone: 'danger',
        relatedOwnerName: '秦先生',
        relatedCaseTitle: '星湖苑 92㎡ 两房',
        relatedDistrict: '浦东前滩',
      },
    ],
    visibleCases: [
      {
        caseId: 'case-star-lake',
        title: '星湖苑 92㎡ 两房',
        district: '浦东前滩',
        visibleStatus: '挂牌推进中',
        pressureLabels: ['价格证据不足', '同类竞品在场'],
      },
    ],
    visibleOwners: [
      {
        ownerId: 'owner-qin',
        displayName: '秦先生',
        relatedCaseTitle: '星湖苑 92㎡ 两房',
        visibleMood: '催促',
        pressureLabels: ['耐心偏低'],
      },
    ],
    visibleCustomers: [
      {
        customerId: 'customer-luo',
        displayName: '罗先生',
        intentLabel: '比较同类房',
        relatedCaseTitles: ['星湖苑 92㎡ 两房'],
        latestVisibleSignal: '关注成交价和楼层差异',
      },
    ],
    todayPlan: {
      label: '今日安排',
      theme: '先补证据再面访',
      energy: 6,
      focusCases: ['星湖苑 92㎡ 两房'],
      priorities: ['准备成交对比', '面访秦先生'],
    },
    constraints: ['上午只有2小时可用'],
  };
}

function buildValidStoryParagraphs(): string[] {
  return [
    '第3天夜里，浦东前滩和静安寺北的门店没有突然爆量，但竞争感比昨天更重。星湖苑92㎡两房还挂在关键位置，周边同类房源继续抢客户注意力，夜间客户回复集中在价格和带看时间。门店今天只有6小时精力，不能再把动作摊得太开，先补证据再面访是更稳的节奏。这个判断来自可见的客户回复和业主催促，不是凭感觉下结论。',
    '昨夜最明显的变化是业主信任下降8点。秦先生不是单纯着急，他已经把问题压到证据上：明天面访如果还是讲市场感觉，他会认为经纪人没有准备。同小区成交、客户反馈、竞品差异这三类材料必须放在一起讲，否则价格沟通会变成空口劝降。信任下降后，业主更容易盯住每一句话的依据。',
    '客户罗先生这边也没有完全离场，他还在比较楼层、装修和成交价。这个信号说明星湖苑不是没有机会，而是客户需要看到538万为什么值得继续谈。若只强调房子不错，客户会转去看旁边同类房；若能把最近成交条件摊开，至少还能把讨论留在这套房上。客户的犹豫点越具体，今天准备材料就越不能泛。',
    '今天要先接星湖苑这条线。上午把近三个月同小区成交、两套竞品挂牌和客户看房反馈整理成一页，下午面访秦先生时先承认价格压力，再给出守价、微调、换展示打法三种选择。这样不是替业主做决定，而是把下一步谈判的证据补齐。只要面访能把证据讲透，后续报价和客户回访才有余地。',
  ];
}

describe('handleDailyStory repair path', () => {
  beforeEach(() => {
    mockedCallDeepSeekChat.mockReset();
  });

  it('repairs too-short AI story with a second LLM pass before returning AI source', async () => {
    mockedCallDeepSeekChat
      .mockResolvedValueOnce({
        modelId: 'deepseek-v4-pro',
        status: 'completed',
        result: JSON.stringify({
          headline: '秦先生催证据',
          deck: '星湖苑价格压力要今天补证据',
          cityStory: { paragraphs: ['秦先生催证据，星湖苑不能冷。'] },
          todayBridge: { label: '今天怎么接', value: '准备成交对比', actionCue: '先补证据再面访' },
          evidenceLabels: ['催证据'],
          citedEventIds: ['evt-owner-trust-drop'],
          citedCaseIds: ['case-star-lake'],
          citedCustomerIds: ['customer-luo'],
          citedOwnerIds: ['owner-qin'],
        }),
      })
      .mockResolvedValueOnce({
        modelId: 'deepseek-v4-pro',
        status: 'completed',
        result: JSON.stringify({
          headline: '星湖苑夜里要补证据',
          deck: '秦先生和罗先生都把问题压到成交证据上',
          cityStory: { paragraphs: buildValidStoryParagraphs() },
          todayBridge: { label: '今天怎么接', value: '准备成交对比', actionCue: '上午补成交证据，下午面访秦先生' },
          evidenceLabels: ['业主催证据', '客户比价格', '竞品在场'],
          citedEventIds: ['evt-owner-trust-drop'],
          citedCaseIds: ['case-star-lake'],
          citedCustomerIds: ['customer-luo'],
          citedOwnerIds: ['owner-qin'],
        }),
      });

    const result = await handleDailyStory(buildMockPack());

    expect(result.status).toBe(200);
    expect(result.body.source).toBe('ai');
    expect(result.body.story.source).toBe('ai');
    expect(result.body.story.cityStory.paragraphs.length).toBe(4);
    expect(result.body.story.cityStory.wordCount).toBeGreaterThanOrEqual(450);
    expect(result.body.story.safety.needsFallback).toBe(false);
    expect(mockedCallDeepSeekChat).toHaveBeenCalledTimes(2);
    expect(mockedCallDeepSeekChat.mock.calls[1]?.[0]?.[1]?.content).toContain('上一版日结故事未达到上线标准');
  });

  it('falls back when the repair pass still cannot satisfy story length', async () => {
    mockedCallDeepSeekChat
      .mockResolvedValueOnce({
        modelId: 'deepseek-v4-pro',
        status: 'completed',
        result: JSON.stringify({
          headline: '秦先生催证据',
          deck: '星湖苑价格压力',
          cityStory: { paragraphs: ['秦先生催证据。'] },
          todayBridge: { label: '今天怎么接', value: '准备成交对比', actionCue: '先补证据再面访' },
          evidenceLabels: ['催证据'],
          citedEventIds: ['evt-owner-trust-drop'],
          citedCaseIds: ['case-star-lake'],
          citedCustomerIds: ['customer-luo'],
          citedOwnerIds: ['owner-qin'],
        }),
      })
      .mockResolvedValueOnce({
        modelId: 'deepseek-v4-pro',
        status: 'completed',
        result: JSON.stringify({
          headline: '还是太短',
          deck: '没有补足',
          cityStory: { paragraphs: ['还是只有一句话。'] },
          todayBridge: { label: '今天怎么接', value: '准备成交对比', actionCue: '先补证据再面访' },
          evidenceLabels: ['催证据'],
          citedEventIds: ['evt-owner-trust-drop'],
          citedCaseIds: ['case-star-lake'],
          citedCustomerIds: ['customer-luo'],
          citedOwnerIds: ['owner-qin'],
        }),
      });

    const result = await handleDailyStory(buildMockPack());

    expect(result.status).toBe(200);
    expect(result.body.source).toBe('fallback');
    expect(result.body.story.source).toBe('fallback');
    expect(result.body.error).toContain('too_');
    expect(mockedCallDeepSeekChat).toHaveBeenCalledTimes(2);
  });
});
