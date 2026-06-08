import { describe, expect, it } from 'vitest';
import { buildActionDecisionAgentRuntime } from '../agents/actionDecisionAgentAdapter.js';
import { buildActionDecisionDualRuntime } from '../agents/actionDecisionDualRuntime.js';
import {
  buildFallbackActionFeedbackProposal,
  buildFallbackActionScenarioSimulation,
  normalizeActionFeedbackProposal,
  normalizeActionScenarioSimulationProposal,
  type ActionFeedbackRequest,
  type ActionAdviceRequest,
} from '../actionDecisionAdvice.js';

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

function buildOpenDayFeedbackRequest(overrides: Partial<ActionFeedbackRequest> = {}): ActionFeedbackRequest {
  const request = buildOpenDayRequest();
  return {
    ...request,
    choice: {
      mainStrategyIds: ['invite-customer-a'],
      assistStrategyId: 'steady',
      baseFeedbackMessage: '"我再看看。"',
      actor: 'owner',
      mood: 'neutral',
    },
    ...overrides,
  };
}

function buildWeeklyFeedbackBenchmarkRequest(overrides: Partial<ActionFeedbackRequest> = {}): ActionFeedbackRequest {
  return buildOpenDayFeedbackRequest({
    actionId: 'weekly-feedback',
    title: '江悦府 128㎡ 三房 · 周度反馈',
    summary: '把这一周带看、客户反馈和价格风险同步给业主。',
    body: '业主想知道这周有没有实质进展，也担心价格风险没有被讲透。',
    round: {
      title: '周度反馈',
      description: '这一轮要让业主相信你不是泛泛汇报。',
      mainStrategies: [
        { id: 'progress', title: '突出本周进展', note: '说明带看和客户反馈的真实变化。' },
        { id: 'risk', title: '坦诚讲风险', note: '把价格差距和竞品分流说清。' },
      ],
      assistStrategies: [
        { id: 'direct-risk', title: '坦诚讲风险', note: '风险直接说，不做空泛安抚。' },
      ],
    },
    choice: {
      mainStrategyIds: ['progress', 'risk'],
      assistStrategyId: 'direct-risk',
      baseFeedbackMessage: '"听起来这周还不错，继续保持。"',
      actor: 'owner',
      mood: 'positive',
    },
    caseContext: {
      title: '江悦府 128㎡ 三房',
      ownerName: '王经理',
      district: '浦东',
      community: '江悦府',
      askPrice: 930,
      marketPrice: 921,
      trust: 57,
      patience: 44,
      urgency: 66,
      heat: 63,
      stageLabel: '周度反馈',
    },
    ...overrides,
  });
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

  it('normalizes a visible recommendation onto existing option ids', () => {
    const request = buildOpenDayRequest();
    const proposal = normalizeActionScenarioSimulationProposal({
      sceneTitle: '客户在比较同类房',
      sceneOpening: '罗投资客会拿隔壁两房一起比，这轮要把现场关注点说清。',
      roundTitle: '先定看房对象',
      roundDescription: '先判断谁今天真的值得拉到现场。',
      mainStrategies: [
        { id: 'invite-customer-b', title: '邀陪读客', note: '他关注学区和通勤。' },
        { id: 'invite-customer-a', title: '邀投资客', note: '他会比较装修和价格。' },
      ],
      assistStrategies: [
        { id: 'steady', title: '不硬推', note: '保留比较空间。' },
      ],
      recommendedMainStrategyIds: ['invite-customer-a', 'made-up'],
      recommendedAssistStrategyId: 'steady',
      recommendationReason: '客户已经进入同类房比较，先约最有比较意愿的人到场，再保留真实反馈空间。',
      roleCue: '客户愿意看，但不会马上表态。',
      stakes: ['竞品会影响看后反馈'],
      confidence: 0.74,
    }, request);

    expect(proposal.recommendedMainStrategyIds).toEqual(['invite-customer-a']);
    expect(proposal.recommendedAssistStrategyId).toBe('steady');
    expect(proposal.recommendationReason).toContain('同类房比较');
  });

  it('lets a bounded LLM recommendation win the dual runtime', () => {
    const request = buildOpenDayRequest();
    const llmProposal = {
      ...buildFallbackActionScenarioSimulation(request),
      recommendedMainStrategyIds: ['invite-customer-b'],
      recommendedAssistStrategyId: 'steady',
      recommendationReason: '陪读客关注学区和通勤，先把真实到场客户定下来，态度保持克制。',
      confidence: 0.81,
    };

    const dual = buildActionDecisionDualRuntime(request, { llmProposal });

    expect(dual.arbiterResult.acceptedSource).toBe('llm');
    expect(dual.arbiterResult.finalProposal.recommendedMainStrategyIds).toEqual(['invite-customer-b']);
  });

  it('rejects an LLM recommendation that invents option ids', () => {
    const request = buildOpenDayRequest();
    const llmProposal = {
      ...buildFallbackActionScenarioSimulation(request),
      recommendedMainStrategyIds: ['not-an-option'],
      recommendedAssistStrategyId: 'steady',
      recommendationReason: '错误推荐不应进入前台。',
      confidence: 0.81,
    };

    const dual = buildActionDecisionDualRuntime(request, { llmProposal });

    expect(dual.arbiterResult.acceptedSource).toBe('rule');
    expect(dual.arbiterResult.rejectedReasons).toContain('llm_proposal_validation_failed');
    expect(dual.arbiterResult.validationNotes).toContain('invalid_recommended_main:not-an-option');
    expect(dual.arbiterResult.finalProposal.recommendedMainStrategyIds).toEqual(['invite-customer-a', 'invite-customer-b']);
  });

  it('expands deterministic character feedback beyond one short sentence', () => {
    const feedback = buildFallbackActionFeedbackProposal(buildOpenDayFeedbackRequest());

    expect(feedback.message.length).toBeGreaterThan(60);
    expect(feedback.message).not.toContain('邀罗投资客');
    expect(feedback.message).not.toContain('「');
    expect(feedback.message).not.toContain('讲清楚');
    expect(feedback.message).toContain('同小区最近成交');
  });

  it('benchmarks owner feedback against WeChat-style human reply constraints', () => {
    const feedback = buildFallbackActionFeedbackProposal(buildWeeklyFeedbackBenchmarkRequest());

    expect(feedback.message.length).toBeGreaterThan(70);
    expect(feedback.message).not.toContain('突出本周进展');
    expect(feedback.message).not.toContain('坦诚讲风险');
    expect(feedback.message).not.toContain('你把');
    expect(feedback.message).not.toContain('讲清楚');
    expect(feedback.message).not.toContain('本轮');
    expect(feedback.message).toContain('这周有点动静');
    expect(feedback.message).toContain('旁边同类房');
    expect(feedback.message).toContain('市场价差 9 万');
  });

  it('keeps customer negotiation feedback in buyer speech instead of broker review language', () => {
    const feedback = buildFallbackActionFeedbackProposal(buildOpenDayFeedbackRequest({
      actionId: 'customer-negotiation',
      title: '徐汇悦府 95㎡ 两房 · 客户谈判推进',
      summary: '这次要决定怎么把客户往前推一步。',
      body: '客户在比较同小区成交、房源差异和后续谈价空间。',
      round: {
        title: '顺着打还是换打法',
        description: '第一轮已经摸到客户底牌，现在要根据客户反应继续推进。',
        mainStrategies: [
          { id: 'price-space', title: '继续谈价格空间', note: '客户对价格敏感，就把可谈空间讲具体。' },
          { id: 'market-window', title: '转讲市场节奏', note: '从这个价转到再拖会怎样。' },
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
    }));

    expect(feedback.message).not.toContain('我主要想看');
    expect(feedback.message).toContain('我不是不看');
    expect(feedback.message).toContain('最近成交');
  });

  it('rejects LLM feedback that copies action option labels as character speech', () => {
    const feedback = normalizeActionFeedbackProposal({
      message: '"听起来这周还不错，继续保持。你把「突出本周进展、坦诚讲风险」讲清楚，最好再拿客户反馈和竞品差异给我看。"',
      confidence: 0.88,
    }, buildWeeklyFeedbackBenchmarkRequest());

    expect(feedback.message).not.toContain('突出本周进展');
    expect(feedback.message).not.toContain('坦诚讲风险');
    expect(feedback.message).not.toContain('讲清楚');
    expect(feedback.message).toContain('这周有点动静');
    expect(feedback.confidence).toBe(0.88);
  });

  it('rejects customer feedback that sounds like an evaluation checklist', () => {
    const request = buildOpenDayFeedbackRequest({
      choice: {
        mainStrategyIds: ['invite-customer-a'],
        assistStrategyId: 'steady',
        baseFeedbackMessage: '"我明白你的意思，让我再想想。"',
        actor: 'customer',
        mood: 'neutral',
      },
    });
    const feedback = normalizeActionFeedbackProposal({
      message: '"我明白你的意思，让我再想想。我主要想看这几组客户到底卡在哪里、同小区成交和同小区最近成交，别只说这套不错。你把差异摆清，我再决定要不要继续看。"',
      confidence: 0.91,
    }, request);

    expect(feedback.message).not.toContain('我主要想看');
    expect(feedback.message).toContain('我不是不看');
    expect(feedback.confidence).toBe(0.91);
  });

  it('rejects too-short LLM character feedback and keeps the richer fallback', () => {
    const feedback = normalizeActionFeedbackProposal({
      message: '"好。"',
      confidence: 0.9,
    }, buildOpenDayFeedbackRequest());

    expect(feedback.message.length).toBeGreaterThan(60);
    expect(feedback.message).not.toBe('"好。"');
    expect(feedback.message).not.toContain('「');
  });
});
