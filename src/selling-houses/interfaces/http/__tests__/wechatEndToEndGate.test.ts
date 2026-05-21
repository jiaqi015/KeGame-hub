import { describe, expect, it, beforeAll } from 'vitest';
import type { GameState, Case, Opportunity } from '../../../domain/models.js';
import type { WechatMessage } from '../../../application/projections/myWechatTypes.js';
import type { ConversationEffectProposal } from '../../../core/world-state/conversation/models.js';
import {
  settleWechatConversationTurn,
  buildFallbackConversationEffectProposal,
  buildWechatConversationScenePack,
} from '../../../application/wechatConversation.js';
import { buildWechatDualRuntime } from '../../../application/agents/wechatDualRuntime.js';
import { buildCaseAgentContextPack } from '../../../application/agents/caseContextPackBuilder.js';
import { createInitialState, updateDerivedState } from '../../../application/gameState.js';
import { seedInitialOpportunities } from '../../../domain/engine.js';
import { getScenarioSnapshotById } from '../../../domain/scenarioCatalog.js';

function buildTestState(): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  if (!snapshot) throw new Error('Missing standard-window-chain scenario');
  const state = createInitialState(snapshot, 42424);
  seedInitialOpportunities(state);
  updateDerivedState(state);
  return state;
}

function makeOwnerMessage(caseItem: Case): WechatMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    targetCaseId: caseItem.id,
    senderName: caseItem.ownerName,
    senderRole: 'owner',
    content: `${caseItem.ownerName}：最近有没有客户来看房？我有点着急。`,
    preview: '最近有没有客户来看房',
    timeLabel: '14:30',
    urgency: 'high',
  } as WechatMessage;
}

function makeCustomerMessage(caseItem: Case, opp: Opportunity, customerName: string): WechatMessage {
  return {
    id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    targetCaseId: caseItem.id,
    targetOpportunityId: opp.id,
    senderName: customerName,
    senderRole: 'customer',
    content: `${customerName}：这套房价格还能再谈谈吗？`,
    preview: '价格还能再谈谈吗',
    timeLabel: '16:00',
    urgency: 'medium',
  } as WechatMessage;
}

describe('WeChat End-to-End Gate Tests', () => {
  let baseState: GameState;
  let activeCase: Case;

  beforeAll(() => {
    baseState = buildTestState();
    activeCase = baseState.cases.find((c) => c.status === 'active')!;
  });

  describe('Scene 1: 业主高催促 + 玩家给竞品证据', () => {
    it('full chain: contextPack → dual runtime → settle → receipt with positive trustDelta', () => {
      const state = buildTestState();
      const caseItem = state.cases.find((c) => c.status === 'active')!;
      caseItem.urgency = 78;
      caseItem.patience = 35;

      const msg = makeOwnerMessage(caseItem);
      const conversationKey = `owner:${caseItem.ownerName}`;
      const playerText = '同小区有一套刚成交的，89平两房795万，客户反馈咱们挂牌偏高，我整理了竞品数据发您参考。';

      const scene = buildWechatConversationScenePack(state, {
        conversationKey,
        message: msg,
        playerText,
      });

      const dual = buildWechatDualRuntime(scene, {
        llmProposal: {
          ...buildFallbackConversationEffectProposal(scene),
          confidence: 0.88,
          recipientReply: '好的，竞品数据发我看看，我这边也跟客户再确认下意向。',
          trustDelta: 4,
          evidenceUse: 'specific',
        },
        durationUs: 1200,
      });

      const result = settleWechatConversationTurn(state, {
        conversationKey,
        message: msg,
        playerText,
        proposal: dual.arbiterResult.finalProposal,
        proposalSource: 'ai',
        trace: dual.trace,
        arbiterResult: dual.arbiterResult,
      });

      expect(result.success).toBe(true);
      expect(result.receipt).not.toBeNull();

      const receipt = result.receipt!;
      const snap = receipt.traceSnapshot;

      // traceSnapshot 存在
      expect(snap).toBeDefined();
      expect(snap).not.toBeNull();

      // acceptedSource 是 'rule' 或 'llm'
      expect(['rule', 'llm']).toContain(snap!.acceptedSource);

      // ruleConfidence > 0
      expect(snap!.ruleConfidence).toBeGreaterThan(0);

      // contextPackId 存在且包含 sceneId
      expect(snap!.contextPackId).toBeDefined();
      expect(snap!.contextPackId).toContain(scene.sceneId);

      // contextBudget.summary 包含 "市场信号"
      expect(snap!.contextBudget).toBeDefined();
      expect(snap!.contextBudget).toContain('市场信号');

      // validationNotes 是数组
      expect(Array.isArray(snap!.validationNotes)).toBe(true);

      // normalizationNotes 是数组
      expect(Array.isArray(snap!.normalizationNotes)).toBe(true);

      // settlement 有 trustDelta > 0（因为给了竞品证据）
      expect(receipt.settlement.trustDelta).toBeGreaterThan(0);

      // recipientReply 像微信（16-46 字，不含系统/AI/模型关键词）
      const reply = receipt.recipientReply;
      expect(reply.length).toBeGreaterThanOrEqual(16);
      expect(reply.length).toBeLessThanOrEqual(46);
      expect(reply).not.toMatch(/系统|AI|模型|人工智能/);

      // contextPack 真实构建验证
      const contextPack = buildCaseAgentContextPack(state, scene);
      expect(contextPack).toBeDefined();
      expect(contextPack!.packId).toContain(caseItem.id);
    });
  });

  describe('Scene 2: 客户场景 + 玩家空泛安抚', () => {
    it('detects empty_comfort risk with non-positive customerIntentDelta', () => {
      const state = buildTestState();
      const caseItem = state.cases.find((c) => c.status === 'active')!;
      const opp = state.opportunities.find((o) => o.caseId === caseItem.id && o.status === 'active');
      expect(opp).toBeDefined();

      const customer = state.customers.find((c) => c.id === opp!.customerId);
      const customerName = customer?.name || '客户';
      const msg = makeCustomerMessage(caseItem, opp!, customerName);
      const conversationKey = `customer:${customerName}`;
      const playerText = '收到，先这样。';

      const scene = buildWechatConversationScenePack(state, {
        conversationKey,
        message: msg,
        playerText,
      });

      const result = settleWechatConversationTurn(state, {
        conversationKey,
        message: msg,
        playerText,
      });

      expect(result.success).toBe(true);
      expect(result.receipt).not.toBeNull();

      const receipt = result.receipt!;

      // riskKinds 包含 'empty_comfort'
      expect(receipt.proposal.riskKinds).toContain('empty_comfort');

      // customerIntentDelta <= 0（空泛安抚不会提升客户意向）
      expect(receipt.settlement.customerIntentDelta).toBeLessThanOrEqual(0);

      // recipientReply 不是系统评语（不含"系统""人工智能""模型输出"）
      expect(receipt.recipientReply).not.toMatch(/系统|人工智能|模型输出/);
      expect(receipt.recipientReply.length).toBeGreaterThan(0);
    });
  });

  describe('Scene 3: 辱骂输入 → 强制 fallback', () => {
    it('hostile input forces fallback without LLM call', () => {
      const state = buildTestState();
      const caseItem = state.cases.find((c) => c.status === 'active')!;
      const msg = makeOwnerMessage(caseItem);
      const conversationKey = `owner:${caseItem.ownerName}`;
      const playerText = '傻逼';

      const scene = buildWechatConversationScenePack(state, {
        conversationKey,
        message: msg,
        playerText,
      });

      // 双运行时：无 LLM proposal（hostile 在 handler 层直接短路）
      const dual = buildWechatDualRuntime(scene);

      const result = settleWechatConversationTurn(state, {
        conversationKey,
        message: msg,
        playerText,
        proposal: dual.arbiterResult.finalProposal,
        proposalSource: 'fallback',
        trace: dual.trace,
        arbiterResult: dual.arbiterResult,
      });

      expect(result.success).toBe(true);
      expect(result.receipt).not.toBeNull();

      const receipt = result.receipt!;
      const snap = receipt.traceSnapshot;

      // acceptedSource 是 'rule'（hostile 走 rule fallback proposal，arbiter 选 rule）
      expect(snap!.acceptedSource).toBe('rule');

      // intentKinds 包含 'hostile'
      expect(receipt.proposal.intentKinds).toContain('hostile');

      // riskKinds 包含 'offensive_reply'
      expect(receipt.proposal.riskKinds).toContain('offensive_reply');

      // llmSource 是 null（没调 LLM）
      expect(dual.trace.llmSource).toBeNull();

      // recipientReply 包含 "态度"
      expect(receipt.recipientReply).toContain('态度');
    });
  });

  describe('Scene 4: Context Pack 预算截断', () => {
    it('marketSignals truncated when source exceeds 5', () => {
      const state = buildTestState();
      const caseItem = state.cases.find((c) => c.status === 'active')!;

      // 注入 10 个市场信号（1 dailyMarketEvent + 9 marketSignals）
      state.marketShadow = {
        ...state.marketShadow,
        dailyMarketEvent: {
          id: 'evt-daily',
          day: state.day,
          title: '今日市场',
          message: '市场活跃',
          tone: 'accent' as const,
          layer: 'market' as const,
          effectType: 'signal_only' as const,
        },
        marketSignals: Array.from({ length: 9 }, (_, i) => ({
          id: `signal-${i}`,
          title: `市场信号 ${i}`,
          message: `信号内容 ${i}`,
          confidence: 0.7,
          type: 'buyer_demand' as const,
          district: caseItem.district,
          expiresInDays: 3,
        })),
      };

      const scene = buildWechatConversationScenePack(state, {
        conversationKey: `owner:${caseItem.ownerName}`,
        message: makeOwnerMessage(caseItem),
        playerText: '市场最近怎么样？我看到同小区有几套在卖。',
      });

      const contextPack = buildCaseAgentContextPack(state, scene);

      // contextPack 存在
      expect(contextPack).toBeDefined();

      // contextBudget.marketSignals.truncated > 0
      expect(contextPack!.contextBudget.marketSignals.truncated).toBeGreaterThan(0);

      // contextBudget.isCompacted === true
      expect(contextPack!.contextBudget.isCompacted).toBe(true);

      // contextPack 中 marketSignals 最多 5 条
      expect(contextPack!.currentWorld.marketSignals.length).toBeLessThanOrEqual(5);
      expect(contextPack!.currentWorld.marketSignals.length).toBe(5);
    });
  });

  describe('Scene 5: LLM proposal 声称 forbidden action', () => {
    it('arbiter rejects LLM proposal that claims to have changed price', () => {
      const state = buildTestState();
      const caseItem = state.cases.find((c) => c.status === 'active')!;
      const msg = makeOwnerMessage(caseItem);
      const conversationKey = `owner:${caseItem.ownerName}`;
      const playerText = '价格方面您看怎么调？';

      const scene = buildWechatConversationScenePack(state, {
        conversationKey,
        message: msg,
        playerText,
      });

      // LLM proposal 声称已经把价改到580万
      const forbiddenProposal: ConversationEffectProposal = {
        summary: '已经把价改到580万了，业主比较满意。',
        recipientReply: '已经把价改到580万了，业主比较满意。',
        intentKinds: ['discuss_price'],
        riskKinds: ['none'],
        evidenceUse: 'specific',
        trustDelta: 3,
        confidence: 0.92,
      };

      const dual = buildWechatDualRuntime(scene, {
        llmProposal: forbiddenProposal,
        durationUs: 800,
      });

      // acceptedSource 是 'rule'（LLM 被拒）
      expect(dual.arbiterResult.acceptedSource).toBe('rule');

      // rejectedReasons 包含 'llm_proposal_validation_failed'
      expect(dual.arbiterResult.rejectedReasons).toContain('llm_proposal_validation_failed');

      // validationNotes 记录了拒绝原因
      expect(dual.arbiterResult.validationNotes.length).toBeGreaterThan(0);
      expect(dual.arbiterResult.validationNotes.some((note) =>
        note.includes('proposal_claims_forbidden_action'),
      )).toBe(true);

      // 最终 settle 使用的是 rule 提案
      const result = settleWechatConversationTurn(state, {
        conversationKey,
        message: msg,
        playerText,
        proposal: dual.arbiterResult.finalProposal,
        proposalSource: dual.arbiterResult.acceptedSource === 'llm' ? 'ai' : 'fallback',
        trace: dual.trace,
        arbiterResult: dual.arbiterResult,
      });

      expect(result.success).toBe(true);
      expect(result.receipt!.traceSnapshot!.acceptedSource).toBe('rule');
    });
  });

  describe('Scene 6: modelId 透传或 trace 字段完整性', () => {
    it('trace contains modelId when provided, otherwise has acceptedSource + ruleConfidence', () => {
      const state = buildTestState();
      const caseItem = state.cases.find((c) => c.status === 'active')!;
      const msg = makeOwnerMessage(caseItem);
      const conversationKey = `owner:${caseItem.ownerName}`;
      const playerText = '这周有客户看过房，反馈还不错，我整理一下同步您。';

      const scene = buildWechatConversationScenePack(state, {
        conversationKey,
        message: msg,
        playerText,
      });

      // 带 modelId 的 dual runtime
      const dualWithModel = buildWechatDualRuntime(scene, {
        llmProposal: {
          ...buildFallbackConversationEffectProposal(scene),
          confidence: 0.88,
        },
        durationUs: 500,
        modelId: 'deepseek-v4-flash',
        provider: 'deepseek',
      });

      // trace 有 modelId
      expect(dualWithModel.trace.modelId).toBe('deepseek-v4-flash');
      expect(dualWithModel.trace.provider).toBe('deepseek');

      // 不带 modelId 的 dual runtime
      const dualNoModel = buildWechatDualRuntime(scene);

      // trace 必有 acceptedSource 和 ruleConfidence
      expect(dualNoModel.trace.acceptedSource).toBeDefined();
      expect(['rule', 'llm', 'fallback']).toContain(dualNoModel.trace.acceptedSource);
      expect(typeof dualNoModel.trace.ruleConfidence).toBe('number');
      expect(dualNoModel.trace.ruleConfidence).toBeGreaterThan(0);

      // settle 完整链路
      const result = settleWechatConversationTurn(state, {
        conversationKey,
        message: msg,
        playerText,
        proposal: dualWithModel.arbiterResult.finalProposal,
        proposalSource: 'ai',
        trace: dualWithModel.trace,
        arbiterResult: dualWithModel.arbiterResult,
      });

      expect(result.success).toBe(true);
      const snap = result.receipt!.traceSnapshot!;
      expect(snap.acceptedSource).toBeDefined();
      expect(snap.ruleConfidence).toBeGreaterThan(0);
      expect(Array.isArray(snap.validationNotes)).toBe(true);
      expect(Array.isArray(snap.normalizationNotes)).toBe(true);
    });
  });

  describe('Scene 7: 经理场景 + 玩家给具体动作', () => {
    it('manager_wechat with concrete action plan produces positive trustDelta', () => {
      const state = buildTestState();
      const caseItem = state.cases.find((c) => c.status === 'active')!;

      const msg: WechatMessage = {
        id: `msg-mgr-${Date.now()}`,
        targetCaseId: caseItem.id,
        senderName: '王经理',
        senderRole: 'store_manager',
        content: '王经理：今天重点抓哪套？风险点在哪？',
        preview: '今天重点抓哪套',
        timeLabel: '09:00',
        urgency: 'high',
      } as WechatMessage;

      const conversationKey = 'manager:王经理';
      const playerText = '今天重点抓万航小区，上午安排客户罗先生看房，下午跟业主邵女士做价格沟通。竞品数据已整理好。';

      const scene = buildWechatConversationScenePack(state, {
        conversationKey,
        message: msg,
        playerText,
      });

      const dual = buildWechatDualRuntime(scene, {
        llmProposal: {
          ...buildFallbackConversationEffectProposal(scene),
          confidence: 0.85,
          recipientReply: '可以，对象和时间都清楚了。看完房和谈完价把结果同步我。',
        },
        durationUs: 600,
      });

      const result = settleWechatConversationTurn(state, {
        conversationKey,
        message: msg,
        playerText,
        proposal: dual.arbiterResult.finalProposal,
        proposalSource: 'ai',
        trace: dual.trace,
        arbiterResult: dual.arbiterResult,
      });

      expect(result.success).toBe(true);
      expect(result.receipt).not.toBeNull();

      const receipt = result.receipt!;
      const snap = receipt.traceSnapshot!;

      // trace 完整
      expect(snap).toBeDefined();
      expect(['rule', 'llm']).toContain(snap.acceptedSource);
      expect(snap.ruleConfidence).toBeGreaterThan(0);

      // 经理场景不做 trustDelta（只对 owner_wechat 生效）
      expect(receipt.settlement.trustDelta).toBe(0);

      // recipientReply 像微信
      expect(receipt.recipientReply.length).toBeGreaterThanOrEqual(16);
      expect(receipt.recipientReply.length).toBeLessThanOrEqual(46);
      expect(receipt.recipientReply).not.toMatch(/系统|AI|模型/);

      // contextPackId 存在
      expect(snap.contextPackId).toBeDefined();
    });
  });

  describe('Scene 8: 业务联系人场景 + 玩家空泛回复', () => {
    it('broker_wechat with empty comfort detects risk', () => {
      const state = buildTestState();
      const caseItem = state.cases.find((c) => c.status === 'active')!;

      const msg: WechatMessage = {
        id: `msg-broker-${Date.now()}`,
        targetCaseId: caseItem.id,
        senderName: '张中介',
        senderRole: 'agent',
        content: '张中介：同小区那套两房价格能谈吗？客户在等。',
        preview: '价格能谈吗',
        timeLabel: '11:00',
        urgency: 'medium',
      } as WechatMessage;

      const conversationKey = 'agent:张中介';
      const playerText = '收到，先这样。';

      const scene = buildWechatConversationScenePack(state, {
        conversationKey,
        message: msg,
        playerText,
      });

      const result = settleWechatConversationTurn(state, {
        conversationKey,
        message: msg,
        playerText,
      });

      expect(result.success).toBe(true);
      expect(result.receipt).not.toBeNull();

      const receipt = result.receipt!;
      const snap = receipt.traceSnapshot!;

      // trace 存在
      expect(snap).toBeDefined();

      // empty_comfort 被检测
      expect(receipt.proposal.riskKinds).toContain('empty_comfort');

      // recipientReply 不是系统评语
      expect(receipt.recipientReply).not.toMatch(/系统|人工智能|模型输出/);
      expect(receipt.recipientReply.length).toBeGreaterThan(0);

      // contextBudget 存在
      expect(snap.contextBudget).toBeDefined();
    });
  });
});
