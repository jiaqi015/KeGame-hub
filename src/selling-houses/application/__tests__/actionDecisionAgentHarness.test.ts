import { describe, expect, it } from 'vitest';
import { buildActionDecisionAgentRuntime } from '../agents/actionDecisionAgentAdapter.js';
import { buildActionDecisionDualRuntime } from '../agents/actionDecisionDualRuntime.js';
import type { ActionAdviceRequest } from '../actionDecisionAdvice.js';

function buildOpenDayRequest(overrides: Partial<ActionAdviceRequest> = {}): ActionAdviceRequest {
  return {
    actionId: 'open-day',
    title: '万航小区开放日',
    summary: '约客户集中看房，同时给业主回传真实反馈。',
    body: '今天要把客户邀约、竞品比较和看后反馈接起来。',
    actorLabel: '客户与业主',
    currentRound: 1,
    totalRounds: 2,
    contextBullets: [
      '外部同类房增加，客户会拿装修和价格比较。',
      '业主催今天给明确反馈。',
    ],
    round: {
      title: '先定到场客户',
      description: '不是泛泛做开放日，先判断谁真的值得拉到现场。',
      mainStrategies: [
        { id: 'invite-customer-a', title: '邀罗投资客', note: '他已在比较装修和总价。' },
        { id: 'invite-customer-b', title: '邀陪读客', note: '他关注学区和通勤。' },
      ],
      assistStrategies: [
        { id: 'steady', title: '不硬推', note: '保留比较空间。' },
      ],
    },
    caseContext: {
      title: '万航小区 63㎡ 一房',
      ownerName: '邵女士',
      district: '静安',
      community: '万航小区',
      askPrice: 612,
      marketPrice: 606,
      trust: 52,
      patience: 36,
      urgency: 72,
      heat: 68,
      stageLabel: '客户准备出价',
    },
    ...overrides,
  };
}

describe('action decision agent harness', () => {
  it('uses scenario prompt presets and tool manifests for open-day simulation', () => {
    const runtime = buildActionDecisionAgentRuntime(buildOpenDayRequest());
    const prompt = runtime.promptLines.join('\n');

    expect(prompt).toContain('开放日场景模拟代理');
    expect(prompt).toContain('scenario.simulateTopic');
    expect(prompt).toContain('禁止工具');
    expect(prompt).toContain('只输出场景 proposal');
  });

  it('emits an observation for scenario replay and shadow evaluation', () => {
    const dual = buildActionDecisionDualRuntime(buildOpenDayRequest(), { durationUs: 980 });

    expect(dual.observation.channel).toBe('open_day');
    expect(dual.observation.tools.availableToolIds).toContain('scenario.simulateTopic');
    expect(dual.observation.tools.availableToolIds).toContain('action.proposeNextStep');
    expect(dual.observation.tools.forbiddenToolIds).toContain('state.writeDirectly');
    expect(dual.observation.proposals.ruleProposalId).toBe(dual.ruleProposal.proposalId);
    expect(dual.observation.replay.durationUs).toBe(980);
    expect(dual.shadowReport.channel).toBe('open_day');
    expect(dual.shadowReport.status).toBe('no-shadow');
  });
});
