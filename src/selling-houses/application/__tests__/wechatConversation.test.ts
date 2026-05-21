import { describe, expect, it } from 'vitest';
import {
  buildFallbackConversationEffectProposal,
  normalizeConversationEffectProposal,
  normalizeConversationEffectProposalDetailed,
  settleWechatConversationTurn,
} from '../wechatConversation.js';
import { buildWechatDualRuntime } from '../agents/wechatDualRuntime.js';
import { buildCaseAgentContextPack } from '../agents/caseContextPackBuilder.js';
import type { ConversationEffectProposal, ConversationSceneInputPack } from '../../core/world-state/conversation/models.js';
import { createInitialState, updateDerivedState } from '../gameState.js';
import { seedInitialOpportunities } from '../../domain/engine.js';
import { getScenarioSnapshotById } from '../../domain/scenarioCatalog.js';

function buildScene(overrides: Partial<ConversationSceneInputPack> = {}): ConversationSceneInputPack {
  return {
    sceneId: 'scene-1',
    runId: 'run-1',
    day: 7,
    conversationKey: 'owner:shaonvshi',
    sourceMessageId: 'msg-1',
    sceneType: 'owner_wechat',
    playerText: '傻逼',
    sourceMessage: {
      messageId: 'msg-1',
      senderName: '邵女士',
      senderRole: 'owner',
      content: '我这边时间真的不多了，今天能不能给个明确方案，别只是说再等等。',
      timeLabel: 'DAY 7',
      urgency: 'urgent',
      primaryCtaLabel: '安排面访',
    },
    caseContext: {
      caseId: 'case-1',
      title: '万航小区 63㎡ 一房',
      ownerName: '邵女士',
      district: '静安',
      community: '万航小区',
      askPrice: 612,
      marketPrice: 606,
      priceGapPct: 1,
      trust: 52,
      patience: 36,
      urgency: 72,
      heat: 68,
      competitiveness: 61,
      hasCompletedFirstVisit: true,
      ownerProfileLabel: '强势急售型业主',
    },
    recentTurns: [],
    ...overrides,
  };
}

describe('wechatConversation hostile input handling', () => {
  it('classifies abusive player text as relationship damage instead of a missing next step', () => {
    const proposal = buildFallbackConversationEffectProposal(buildScene());

    expect(proposal.intentKinds).toContain('hostile');
    expect(proposal.riskKinds).toContain('offensive_reply');
    expect(proposal.riskKinds).not.toContain('missing_next_step');
    expect(proposal.trustDelta).toBeLessThan(0);
    expect(proposal.patienceDelta).toBeLessThan(0);
    expect(proposal.urgencyDelta).toBeGreaterThan(0);
    expect(proposal.nextStep?.label).toBe('补救沟通');
    expect(proposal.recipientReply).toContain('态度');
  });

  it('does not let an LLM proposal smooth over abusive player text', () => {
    const scene = buildScene({ playerText: '爱咋咋地' });
    const llmProposal: ConversationEffectProposal = {
      summary: '回复完成了基础安抚。',
      recipientReply: '那你再把下一步说清楚。',
      intentKinds: ['reassure'],
      riskKinds: ['missing_next_step'],
      evidenceUse: 'none',
      trustDelta: 1,
      patienceDelta: 0,
      urgencyDelta: 0,
      priceFlexibilityDelta: 0,
      customerIntentDelta: 0,
      customerConfidenceDelta: 0,
      nextStep: { kind: 'none', label: '继续观察', reason: '没有后续事项。', priority: 'low' },
      confidence: 0.9,
    };

    const normalized = normalizeConversationEffectProposal(llmProposal, scene);

    expect(normalized.intentKinds).toContain('hostile');
    expect(normalized.riskKinds).toContain('offensive_reply');
    expect(normalized.trustDelta).toBeLessThan(0);
    expect(normalized.nextStep?.label).toBe('补救沟通');
    expect(normalized.recipientReply).not.toContain('下一步');
  });

  it('classifies empty comfort as a risk instead of a positive reassurance', () => {
    const proposal = buildFallbackConversationEffectProposal(buildScene({ playerText: '收到，先这样。' }));

    expect(proposal.riskKinds).toContain('empty_comfort');
    expect(proposal.trustDelta).toBeLessThanOrEqual(0);
    expect(proposal.urgencyDelta).toBeGreaterThan(0);
    expect(proposal.nextStep?.label).toBe('补救沟通');
  });

  it('detects when a customer question is ignored', () => {
    const proposal = buildFallbackConversationEffectProposal(buildScene({
      sceneType: 'customer_wechat',
      playerText: '我晚点联系您。',
      sourceMessage: {
        messageId: 'msg-2',
        senderName: '罗投资客',
        senderRole: 'customer',
        content: '装修确实新一点。你这套如果价格没空间，我还得再想想。',
        timeLabel: 'DAY 7',
        urgency: 'medium',
      },
      opportunityContext: {
        opportunityId: 'opp-1',
        customerName: '罗投资客',
        stage: '同类比较',
        intent: 61,
        confidence: 52,
      },
    }));

    expect(proposal.riskKinds).toContain('ignores_customer');
    expect(proposal.customerIntentDelta).toBeLessThan(0);
    expect(proposal.customerConfidenceDelta).toBeLessThan(0);
  });

  it('does not accept invented action ids from an LLM next step', () => {
    const scene = buildScene({ playerText: '我把竞品和客户反馈整理给您。' });
    const normalized = normalizeConversationEffectProposal({
      summary: '准备竞品对比。',
      recipientReply: '你把对比拿来我看看。',
      intentKinds: ['present_market_evidence'],
      riskKinds: ['none'],
      evidenceUse: 'specific',
      trustDelta: 2,
      patienceDelta: 1,
      urgencyDelta: -1,
      priceFlexibilityDelta: 0,
      customerIntentDelta: 0,
      customerConfidenceDelta: 0,
      nextStep: {
        kind: 'prepare_competition_comparison',
        actionId: 'competition-comparison',
        label: '准备竞品对比',
        reason: '客户要求对比。',
        priority: 'high',
      },
      confidence: 0.86,
    }, scene);

    expect(normalized.nextStep?.kind).toBe('prepare_competition_comparison');
    expect(normalized.nextStep?.actionId).toBe('deep-diagnosis');
  });

  it('records normalization notes when an LLM invents an action id', () => {
    const scene = buildScene({ playerText: '我把竞品和客户反馈整理给您。' });
    const result = normalizeConversationEffectProposalDetailed({
      summary: '准备竞品对比。',
      recipientReply: '你把对比拿来我看看。',
      intentKinds: ['present_market_evidence'],
      riskKinds: ['none'],
      evidenceUse: 'specific',
      trustDelta: 2,
      patienceDelta: 1,
      urgencyDelta: -1,
      priceFlexibilityDelta: 0,
      customerIntentDelta: 0,
      customerConfidenceDelta: 0,
      nextStep: {
        kind: 'prepare_competition_comparison',
        actionId: 'competition-comparison',
        label: '准备竞品对比',
        reason: '客户要求对比。',
        priority: 'high',
      },
      confidence: 0.86,
    }, scene);

    expect(result.proposal.nextStep?.actionId).toBe('deep-diagnosis');
    expect(result.validationNotes).toContain('next_step_actionId_normalized:competition-comparison->deep-diagnosis');
  });

  it('surfaces shadow report signals in the settled receipt trace snapshot', () => {
    const snapshot = getScenarioSnapshotById('standard-window-chain');
    if (!snapshot) throw new Error('Missing standard-window-chain scenario');
    const state = createInitialState(snapshot, 42424);
    seedInitialOpportunities(state);
    updateDerivedState(state);

    const baseScene = buildScene({ playerText: '我把竞品和客户反馈整理给您。' });
    const scene = {
      ...baseScene,
      caseContextPack: buildCaseAgentContextPack(state, baseScene),
    };
    const dual = buildWechatDualRuntime(scene, {
      llmProposal: buildLlmProposal({ confidence: 0.87 }),
    });
    const result = settleWechatConversationTurn(state, {
      conversationKey: scene.conversationKey,
      message: {
        id: 'msg-1',
        senderName: '邵女士',
        senderRole: 'owner',
        avatarLabel: '邵',
        content: scene.sourceMessage.content,
        preview: scene.sourceMessage.content.slice(0, 20),
        timeLabel: 'DAY 7',
        unread: false,
        urgency: 'high',
        sourceTrace: { source: 'case', factType: 'owner_urgent', reason: 'test' },
      },
      playerText: scene.playerText,
      proposal: dual.arbiterResult.finalProposal,
      proposalSource: 'ai',
      trace: dual.trace,
      arbiterResult: dual.arbiterResult,
      shadowReport: dual.shadowReport,
      evaluationReport: dual.evaluationReport,
      meshReport: dual.meshReport,
    });

    expect(dual.shadowReport.status).toBe('clean');
    expect(dual.shadowReport.signals).toContain('accepted_llm');
    expect(result.receipt?.traceSnapshot?.shadowStatus).toBe('clean');
    expect(result.receipt?.traceSnapshot?.shadowSignals).toContain('accepted_llm');
    expect(result.receipt?.traceSnapshot?.evaluationSignals?.some((signal) => signal.startsWith('conversation:'))).toBe(true);
    expect(result.receipt?.traceSnapshot?.evaluationSummary).toContain('微信回合');
    expect(result.receipt?.traceSnapshot?.meshReadiness).toBe('ready');
    expect(result.receipt?.traceSnapshot?.meshSignals).toContain('supports_world');
  });

  it('writes structured conversation memory facts after settlement', () => {
    const snapshot = getScenarioSnapshotById('standard-window-chain');
    if (!snapshot) throw new Error('Missing standard-window-chain scenario');
    const state = createInitialState(snapshot, 52521);
    seedInitialOpportunities(state);
    updateDerivedState(state);

    const scene = buildScene({ playerText: '收到，先这样。' });
    const proposal = buildFallbackConversationEffectProposal(scene);
    const result = settleWechatConversationTurn(state, {
      conversationKey: scene.conversationKey,
      message: {
        id: 'msg-memory-1',
        senderName: '邵女士',
        senderRole: 'owner',
        avatarLabel: '邵',
        content: scene.sourceMessage.content,
        preview: scene.sourceMessage.content.slice(0, 20),
        timeLabel: 'DAY 7',
        unread: false,
        urgency: 'high',
        targetCaseId: scene.caseContext?.caseId,
        sourceTrace: { source: 'case', factType: 'owner_urgent', reason: 'test' },
      },
      playerText: scene.playerText,
      proposal,
      proposalSource: 'fallback',
    });

    const facts = result.nextState.agentMemoryStore?.facts || [];
    const kinds = facts.map((fact) => fact.kind);
    const summaries = facts.map((fact) => fact.summary).join('\n');

    expect(kinds).toContain('current_attitude');
    expect(kinds).toContain('relationship_effect');
    expect(summaries).toContain('未消化风险：空泛安抚');
    expect(summaries).not.toContain('empty_comfort');
  });
});

function buildLlmProposal(overrides: Partial<ConversationEffectProposal> = {}): ConversationEffectProposal {
  return {
    summary: '正常沟通。',
    recipientReply: '好的，我再想想。',
    intentKinds: ['reassure'],
    riskKinds: ['none'],
    evidenceUse: 'none',
    trustDelta: 1,
    patienceDelta: 0,
    urgencyDelta: 0,
    priceFlexibilityDelta: 0,
    customerIntentDelta: 0,
    customerConfidenceDelta: 0,
    nextStep: { kind: 'none', label: '继续观察', reason: '等回复。', priority: 'low' },
    confidence: 0.9,
    ...overrides,
  };
}

describe('forbidden tool claim detection', () => {
  it('rejects proposal claiming price was already changed', () => {
    const result = buildWechatDualRuntime(buildScene(), {
      llmProposal: buildLlmProposal({
        summary: '已经把价改到580万，业主同意了。',
        recipientReply: '价格已经调好了，580万。',
      }),
    });
    expect(result.arbiterResult.acceptedSource).toBe('rule');
    expect(result.arbiterResult.rejectedReasons).toContain('llm_proposal_validation_failed');
    expect(result.arbiterResult.validationNotes.join(' ')).toContain('proposal_claims_forbidden_action');
    expect(result.arbiterResult.validationNotes.join(' ')).toContain('price.changeDirectly');
  });

  it('rejects proposal claiming deal was closed', () => {
    const result = buildWechatDualRuntime(buildScene(), {
      llmProposal: buildLlmProposal({
        summary: '已经成交了，成交价590万。',
        recipientReply: '恭喜，已经签约。',
      }),
    });
    expect(result.arbiterResult.acceptedSource).toBe('rule');
    expect(result.arbiterResult.rejectedReasons).toContain('llm_proposal_validation_failed');
    expect(result.arbiterResult.validationNotes.join(' ')).toContain('deal.closeDirectly');
  });

  it('rejects proposal claiming state was directly written', () => {
    const result = buildWechatDualRuntime(buildScene(), {
      llmProposal: buildLlmProposal({
        summary: '已经改了业主状态，已更新状态为急售。',
        recipientReply: '状态已经调整好了。',
      }),
    });
    expect(result.arbiterResult.acceptedSource).toBe('rule');
    expect(result.arbiterResult.validationNotes.join(' ')).toContain('state.writeDirectly');
  });

  it('accepts proposal that merely suggests price adjustment', () => {
    const result = buildWechatDualRuntime(buildScene(), {
      llmProposal: buildLlmProposal({
        summary: '建议调价到580万，缩小价差。',
        recipientReply: '可以考虑调价，580万比较合理。',
        confidence: 0.95,
      }),
    });
    expect(result.arbiterResult.acceptedSource).toBe('llm');
    expect(result.arbiterResult.rejectedReasons).not.toContain('llm_proposal_validation_failed');
  });

  it('forbidden tool violations appear in trace validationNotes', () => {
    const result = buildWechatDualRuntime(buildScene(), {
      llmProposal: buildLlmProposal({
        summary: '已下调到570万。',
        recipientReply: '价格已调整为570万。',
      }),
    });
    expect(result.trace.validationNotes.join(' ')).toContain('proposal_claims_forbidden_action');
  });
});
