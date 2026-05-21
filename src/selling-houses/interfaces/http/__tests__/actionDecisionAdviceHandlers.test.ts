import { describe, expect, it } from 'vitest';
import { handleActionDecisionAdvice } from '../actionDecisionAdviceHandlers.js';

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
});
