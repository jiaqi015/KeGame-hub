import { describe, expect, it } from 'vitest';
import {
  handleActionDecisionAdvice,
  handleActionDecisionFeedback,
} from '../actionDecisionAdviceHandlers.js';

describe('handleActionDecisionAdvice harness observation', () => {
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
    expect(result.body.feedback.message).toContain('同小区成交');
  });
});
