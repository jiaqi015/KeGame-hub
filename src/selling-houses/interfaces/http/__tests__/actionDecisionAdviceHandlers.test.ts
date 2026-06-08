import { beforeEach, describe, expect, it, vi } from 'vitest';
import { callDeepSeekChat } from '../../../../../lib/deepseek.js';
import {
  handleActionDecisionAdvice,
  handleActionDecisionFeedback,
} from '../actionDecisionAdviceHandlers.js';

vi.mock('../../../../../lib/deepseek.js', () => ({
  callDeepSeekChat: vi.fn(),
}));

const mockedCallDeepSeekChat = vi.mocked(callDeepSeekChat);

describe('handleActionDecisionAdvice harness observation', () => {
  beforeEach(() => {
    mockedCallDeepSeekChat.mockReset();
  });

  it('returns scenario observation with fallback advice when model is unavailable', async () => {
    const result = await handleActionDecisionAdvice({
      modelId: 'missing-model',
      request: {
        actionId: 'open-day',
        title: '万航小区开放日',
        summary: '集中看房并回传业主。',
        body: '客户会拿同类竞品比较。',
        actorLabel: '客户与业主',
        currentRound: 1,
        totalRounds: 2,
        contextBullets: ['外部同类房增加。'],
        round: {
          title: '先定到场客户',
          description: '判断谁值得拉到现场。',
          mainStrategies: [
            { id: 'invite-a', title: '邀罗投资客', note: '他在比较装修和价格。' },
          ],
          assistStrategies: [],
        },
      },
    });

    expect(result.status).toBe(200);
    expect(result.body.source).toBe('fallback');
    expect(result.body.observation?.channel).toBe('open_day');
    expect(result.body.observation?.tools.availableToolIds).toContain('scenario.simulateTopic');
    expect(result.body.shadowReport?.decision).toBe('rule-only');
    expect(result.body.evaluationReport?.status).toBe('watch');
  });

  it('returns richer fallback feedback when model is unavailable', async () => {
    const result = await handleActionDecisionFeedback({
      modelId: 'missing-model',
      feedbackRequest: {
        actionId: 'first-visit',
        title: '万航小区 63㎡ 一房 · 首次面访',
        summary: '把业主顾虑、节奏和合作基础摸清',
        body: '首次面访先摸清真实卖房意愿。',
        actorLabel: '这次主要在和业主博弈',
        currentRound: 2,
        totalRounds: 6,
        contextBullets: ['挂牌价 643 万，市场常见成交价 637 万'],
        round: {
          title: '拆清价格锚点',
          description: '把业主价格从哪里来、愿不愿复盘、什么证据能打动他问清楚。',
          mainStrategies: [
            { id: 'ask-price-anchor', title: '心理价位从哪来', note: '判断价格锚定强弱。' },
            { id: 'compare-source', title: '参考了哪些房和成交', note: '区分真实竞品和挂牌噪音。' },
          ],
          assistStrategies: [
            { id: 'listen-more', title: '先听价格来历', note: '让业主说完他的依据。' },
          ],
        },
        choice: {
          mainStrategyIds: ['ask-price-anchor', 'compare-source'],
          assistStrategyId: 'listen-more',
          baseFeedbackMessage: '"我这个价主要参考隔壁和之前成交，不能随便低。"',
          actor: 'owner',
          mood: 'neutral',
        },
      },
    });

    expect(result.status).toBe(200);
    expect(result.body.source).toBe('fallback');
    expect(result.body.feedback.message.length).toBeGreaterThan(80);
    expect(result.body.feedback.message).toContain('心理价位从哪来');
    expect(result.body.feedback.message).toContain('同小区最近成交');
  });

  it('repairs unusable LLM customer feedback with a second LLM pass before falling back', async () => {
    mockedCallDeepSeekChat
      .mockResolvedValueOnce({
        modelId: 'deepseek-v4-flash',
        status: 'completed',
        result: '{"message":"\\"我不是不看，只是还得比较一下。你把差异摆清，再把这几组客户到底卡在哪里、同小区成交和同小区最近成交都列出来，我再决定。\\"","confidence":0.91}',
      })
      .mockResolvedValueOnce({
        modelId: 'deepseek-v4-flash',
        status: 'completed',
        result: '{"message":"\\"我不是不看，就是还没想定。最近那套成交条件、旁边同类房差在哪，你直接摊开说；价格和房况对得上，我就继续看。\\"","confidence":0.78}',
      });

    const result = await handleActionDecisionFeedback({
      feedbackRequest: {
        actionId: 'customer-negotiation',
        title: '徐汇悦府 95㎡ 两房 · 客户谈判推进',
        summary: '这次要决定怎么把客户往前推一步。',
        body: '客户在比较同小区成交、房源差异和后续谈价空间。',
        actorLabel: '这次主要在和客户博弈',
        currentRound: 2,
        totalRounds: 3,
        contextBullets: ['客户犹豫点在价格和旁边同类房。'],
        round: {
          title: '顺着打还是换打法',
          description: '第一轮已经摸到客户底牌，现在要根据客户反应继续推进。',
          mainStrategies: [
            { id: 'price-space', title: '继续谈价格空间', note: '客户对价格敏感，就把可谈空间讲具体。' },
          ],
          assistStrategies: [
            { id: 'slow-down', title: '放缓节奏', note: '客户有压力时，先松一松。' },
          ],
        },
        choice: {
          mainStrategyIds: ['price-space'],
          assistStrategyId: 'slow-down',
          baseFeedbackMessage: '"我明白你的意思，让我再想想。"',
          actor: 'customer',
          mood: 'neutral',
        },
        caseContext: {
          title: '徐汇悦府 95㎡ 两房',
          ownerName: '孙女士',
          district: '徐汇',
          community: '徐汇悦府',
          askPrice: 933,
          marketPrice: 914,
          trust: 68,
          patience: 65,
          urgency: 54,
          heat: 61,
          stageLabel: '客户谈判推进',
        },
      },
    });

    expect(result.status).toBe(200);
    expect(result.body.source).toBe('ai');
    expect(result.body.feedback.message).toContain('最近那套成交条件');
    expect(result.body.feedback.message).not.toContain('你把差异摆清');
    expect(mockedCallDeepSeekChat).toHaveBeenCalledTimes(2);
    expect(mockedCallDeepSeekChat.mock.calls[1]?.[0]?.[1]?.content).toContain('上一版不可用');
  });
});
