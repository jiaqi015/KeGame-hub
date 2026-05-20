import type { GameState, Opportunity } from '../domain/models.js';
import type { WechatMessage } from './projections/myWechatTypes.js';
import { clamp } from '../domain/utils.js';
import { recordDomainEvent, updateDerivedState } from '../domain/runtimeState.js';
import { applyBrokerOwnerTrustDelta } from '../domain/trustWriteHelper.js';
import {
  applyOwnerCasePatienceDelta,
  applyOwnerCaseUrgencyDelta,
} from '../domain/ownerCaseReadinessHelper.js';
import {
  applyOpportunityConfidenceDeltaOnState,
  applyOpportunityIntentDeltaOnState,
} from '../domain/opportunitySplitHelper.js';
import { refreshOpportunityLabel } from '../domain/engine.js';
import type {
  ConversationEffectProposal,
  ConversationEffectSettlement,
  ConversationIntentKind,
  ConversationNextStepDraft,
  ConversationNextStepKind,
  ConversationReceipt,
  ConversationRiskKind,
  ConversationSceneInputPack,
  ConversationSceneType,
  ConversationTraceSnapshot,
} from '../core/world-state/conversation/models.js';
import type { AgentMemoryFact } from '../core/world-state/agents/models.js';
import type { AgentRunTrace, AgentArbiterResult } from '../core/world-state/agents/proposal.js';
import {
  mergeAgentMemoryFacts,
  selectAgentMemoryFacts,
} from '../core/world-state/agents/memoryStore.js';
import {
  buildWechatLocalReplyVariants,
  resolveWechatAgentProfile,
  buildWechatRuntimeAgentId,
} from './agents/wechatAgentAdapter.js';

export interface WechatConversationTurnInput {
  conversationKey: string;
  message: WechatMessage;
  playerText: string;
  proposal?: ConversationEffectProposal | null;
  proposalSource?: 'ai' | 'fallback';
  trace?: AgentRunTrace;
  arbiterResult?: AgentArbiterResult;
}

export interface WechatConversationTurnResult {
  nextState: GameState;
  success: boolean;
  reason: string;
  receipt: ConversationReceipt | null;
  trace?: AgentRunTrace;
  arbiterResult?: AgentArbiterResult;
}

const MAX_PLAYER_TEXT_CHARS = 220;

export function sanitizeWechatPlayerText(text: string) {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_PLAYER_TEXT_CHARS);
}

export function buildWechatConversationScenePack(
  state: GameState,
  input: Pick<WechatConversationTurnInput, 'conversationKey' | 'message' | 'playerText'>,
): ConversationSceneInputPack {
  const caseItem = input.message.targetCaseId
    ? state.cases.find((entry) => entry.id === input.message.targetCaseId) || null
    : null;
  const opportunity = input.message.targetOpportunityId
    ? state.opportunities.find((entry) => entry.id === input.message.targetOpportunityId) || null
    : null;
  const customer = opportunity
    ? state.customers.find((entry) => entry.id === opportunity.customerId) || null
    : input.message.targetCustomerId
      ? state.customers.find((entry) => entry.id === input.message.targetCustomerId) || null
      : null;
  const turnIndex = (state.wechatConversationHistory || []).length + 1;
  const sceneCaseContext = caseItem
    ? {
        caseId: caseItem.id,
        title: caseItem.title,
        ownerName: caseItem.ownerName,
        district: caseItem.district,
        community: caseItem.community,
        askPrice: caseItem.askPrice,
        marketPrice: caseItem.marketPrice,
        priceGapPct: caseItem.priceGapPct,
        trust: caseItem.trust,
        patience: caseItem.patience,
        urgency: caseItem.urgency,
        heat: caseItem.heat,
        competitiveness: caseItem.competitiveness,
        hasCompletedFirstVisit: caseItem.hasCompletedFirstVisit,
        ownerProfileLabel: caseItem.ownerProfilingMemory?.ownerTypeName || caseItem.personality || '未知业主',
      }
    : undefined;
  const sceneOpportunityContext = opportunity
    ? {
        opportunityId: opportunity.id,
        customerName: customer?.name || input.message.senderName,
        stage: opportunity.stageLabel,
        intent: opportunity.intent,
        confidence: opportunity.confidence,
      }
    : undefined;
  // Derive agentId without full profile resolution to avoid double-resolving.
  // buildWechatRuntimeAgentId uses the same key-building logic as resolveProfile.
  const probedAgentId = buildWechatRuntimeAgentId({
    sceneId: '',
    runId: '',
    day: state.day,
    conversationKey: input.conversationKey,
    sourceMessageId: input.message.id,
    sceneType: resolveSceneType(input.message),
    playerText: '',
    sourceMessage: {
      messageId: input.message.id,
      senderName: input.message.senderName,
      senderRole: input.message.senderRole,
      content: '',
      timeLabel: '',
      urgency: 'medium',
    },
    recentTurns: [],
  });
  const agentMemory = selectAgentMemoryFacts(state.agentMemoryStore, {
    agentId: probedAgentId,
    conversationKey: input.conversationKey,
    caseId: caseItem?.id,
    opportunityId: opportunity?.id,
    channel: 'wechat',
    day: state.day,
    limit: 8,
  });

  return {
    sceneId: `wechat-scene-${state.day}-${turnIndex}-${input.message.id}`,
    runId: state.runId,
    day: state.day,
    conversationKey: input.conversationKey,
    sourceMessageId: input.message.id,
    sceneType: resolveSceneType(input.message),
    playerText: sanitizeWechatPlayerText(input.playerText),
    sourceMessage: {
      messageId: input.message.id,
      senderName: input.message.senderName,
      senderRole: input.message.senderRole,
      content: input.message.content,
      timeLabel: input.message.timeLabel,
      urgency: input.message.urgency,
      primaryCtaLabel: input.message.primaryCtaLabel,
    },
    caseContext: sceneCaseContext,
    opportunityContext: sceneOpportunityContext,
    agentMemory,
    recentTurns: (state.wechatConversationHistory || [])
      .filter((entry) => entry.conversationKey === input.conversationKey)
      .slice(-3)
      .map((entry) => ({
        playerText: entry.playerText,
        recipientReply: entry.recipientReply,
        summary: entry.summary,
      })),
  };
}

export function buildFallbackConversationEffectProposal(scene: ConversationSceneInputPack): ConversationEffectProposal {
  const text = scene.playerText;
  const intents = new Set<ConversationIntentKind>();
  const risks = new Set<ConversationRiskKind>();

  if (/保证|肯定|一定成交|包卖|绝对/.test(text)) {
    intents.add('overpromise');
    risks.add('overpromise');
  }
  if (/面访|见面|当面|约个时间|上门|下午|明天/.test(text)) {
    intents.add('propose_face_visit');
  }
  if (/竞品|同类|客户反馈|带看|成交|市场|数据|价格差/.test(text)) {
    intents.add('present_market_evidence');
  }
  if (/价格|调价|降价|报价|挂牌|动一动|复盘/.test(text)) {
    intents.add('discuss_price');
  }
  if (/调到|下调|改价|确认调价|今天就调/.test(text)) {
    intents.add('secure_price_adjustment');
  }
  if (/我.*(整理|同步|反馈|发您|给您)/.test(text)) {
    intents.add('promise_feedback');
  }
  if (scene.sceneType === 'customer_wechat') {
    intents.add('follow_customer');
  }
  if (scene.sceneType === 'manager_wechat') {
    intents.add('align_manager');
  }
  if (intents.size === 0) {
    intents.add('reassure');
  }

  let nextStep = resolveNextStep([...intents], scene);
  const hasEvidence = intents.has('present_market_evidence');
  const hasNextStep = nextStep.kind !== 'none';
  if (!hasNextStep && !risks.has('overpromise')) {
    risks.add('missing_next_step');
  }
  if (nextStep.kind === 'none' && shouldRecommendRecoveryStep([...risks], {
    trustDelta: risks.has('overpromise') ? -3 : 0,
    patienceDelta: risks.has('overpromise') ? -1 : 0,
    urgencyDelta: risks.has('overpromise') ? 2 : 0,
  })) {
    nextStep = buildNextStep('open_case', scene);
  }

  return {
    summary: buildFallbackSummary([...intents], scene),
    recipientReply: buildFallbackRecipientReply([...intents], [...risks], scene),
    intentKinds: [...intents],
    riskKinds: risks.size > 0 ? [...risks] : ['none'],
    evidenceUse: hasEvidence ? 'specific' : 'mentioned',
    trustDelta: risks.has('overpromise') ? -3 : hasEvidence || hasNextStep ? 3 : 1,
    patienceDelta: risks.has('overpromise') ? -1 : hasNextStep ? 2 : 0,
    urgencyDelta: risks.has('overpromise') ? 2 : hasNextStep ? -2 : 0,
    priceFlexibilityDelta: intents.has('secure_price_adjustment') ? 9 : intents.has('discuss_price') && hasEvidence ? 5 : 0,
    customerIntentDelta: scene.sceneType === 'customer_wechat' ? 4 : 0,
    customerConfidenceDelta: scene.sceneType === 'customer_wechat' ? 4 : 0,
    nextStep,
    confidence: 0.72,
  };
}

export function normalizeConversationEffectProposal(
  proposal: ConversationEffectProposal | null | undefined,
  scene: ConversationSceneInputPack,
): ConversationEffectProposal {
  if (!proposal) {
    return buildFallbackConversationEffectProposal(scene);
  }

  const fallback = buildFallbackConversationEffectProposal(scene);
  const intentKinds = normalizeIntentKinds(proposal.intentKinds);
  const riskKinds = normalizeRiskKinds(proposal.riskKinds);
  let nextStep = normalizeNextStep(proposal.nextStep, intentKinds, scene);
  const trustDelta = normalizeDelta(proposal.trustDelta, -5, 6, fallback.trustDelta || 0);
  const patienceDelta = normalizeDelta(proposal.patienceDelta, -5, 6, fallback.patienceDelta || 0);
  const urgencyDelta = normalizeDelta(proposal.urgencyDelta, -6, 6, fallback.urgencyDelta || 0);
  const priceFlexibilityDelta = normalizeDelta(proposal.priceFlexibilityDelta, -6, 10, fallback.priceFlexibilityDelta || 0);
  const customerIntentDelta = normalizeDelta(proposal.customerIntentDelta, -8, 8, fallback.customerIntentDelta || 0);
  const customerConfidenceDelta = normalizeDelta(proposal.customerConfidenceDelta, -8, 8, fallback.customerConfidenceDelta || 0);

  if (nextStep.kind === 'none' && shouldRecommendRecoveryStep(riskKinds, { trustDelta, patienceDelta, urgencyDelta })) {
    nextStep = buildNextStep('open_case', scene);
  }

  return {
    summary: normalizeText(proposal.summary, fallback.summary, 96),
    recipientReply: normalizeText(proposal.recipientReply, fallback.recipientReply, 140),
    intentKinds: intentKinds.length ? intentKinds : fallback.intentKinds,
    riskKinds: riskKinds.length ? riskKinds : fallback.riskKinds,
    evidenceUse: proposal.evidenceUse === 'specific' || proposal.evidenceUse === 'mentioned' ? proposal.evidenceUse : 'none',
    trustDelta,
    patienceDelta,
    urgencyDelta,
    priceFlexibilityDelta,
    customerIntentDelta,
    customerConfidenceDelta,
    nextStep,
    confidence: clamp(Number(proposal.confidence) || fallback.confidence, 0.35, 0.95),
  };
}

export function settleWechatConversationTurn(
  state: GameState,
  input: WechatConversationTurnInput,
): WechatConversationTurnResult {
  const playerText = sanitizeWechatPlayerText(input.playerText);
  if (playerText.length < 2) {
    return { nextState: state, success: false, reason: '先输入要回复的内容。', receipt: null };
  }

  const scene = buildWechatConversationScenePack(state, { ...input, playerText });
  const proposal = normalizeConversationEffectProposal(input.proposal, scene);
  const caseItem = input.message.targetCaseId
    ? state.cases.find((entry) => entry.id === input.message.targetCaseId) || null
    : null;
  const opportunity = input.message.targetOpportunityId
    ? state.opportunities.find((entry) => entry.id === input.message.targetOpportunityId) || null
    : null;
  const turnIndex = (state.wechatConversationHistory || []).length + 1;
  const settlement = buildConversationSettlement(state, caseItem, opportunity, scene, proposal);
  const receipt: ConversationReceipt = Object.freeze({
    receiptId: `wechat-receipt-${state.day}-${turnIndex}-${input.message.id}`,
    conversationKey: input.conversationKey,
    sourceMessageId: input.message.id,
    day: state.day,
    turnIndex,
    sceneType: scene.sceneType,
    targetCaseId: input.message.targetCaseId,
    targetOpportunityId: input.message.targetOpportunityId,
    actorName: input.message.senderName,
    actorRole: input.message.senderRole,
    playerText,
    recipientReply: proposal.recipientReply,
    summary: proposal.summary,
    proposal,
    settlement,
    nextSteps: proposal.nextStep && proposal.nextStep.kind !== 'none' ? [proposal.nextStep] : [],
    source: input.proposalSource === 'ai' && input.proposal ? 'ai' : 'fallback',
    traceSnapshot: buildTraceSnapshot(input.trace, input.arbiterResult),
  });

  applyConversationSettlement(state, caseItem, opportunity, settlement, receipt);
  state.wechatConversationHistory = [...(state.wechatConversationHistory || []), receipt].slice(-80);
  state.agentMemoryStore = mergeAgentMemoryFacts(
    state.agentMemoryStore,
    buildWechatAgentMemoryFactsFromReceipt(scene, receipt),
  );
  updateDerivedState(state);

  return {
    nextState: state,
    success: true,
    reason: receipt.summary,
    receipt,
    trace: input.trace,
    arbiterResult: input.arbiterResult,
  };
}

function buildTraceSnapshot(
  trace: AgentRunTrace | undefined,
  arbiterResult: AgentArbiterResult | undefined,
): ConversationTraceSnapshot | undefined {
  if (!trace && !arbiterResult) return undefined;
  return {
    acceptedSource: arbiterResult?.acceptedSource ?? trace?.acceptedSource ?? 'fallback',
    ruleConfidence: trace?.ruleConfidence ?? 0.5,
    llmConfidence: trace?.llmConfidence ?? null,
    pressure: [...(trace?.pressure ?? [])],
    uncertainty: [...(trace?.uncertainty ?? [])],
    memoryFactCount: trace?.memoryFactIds?.length ?? 0,
    contextSignalCount: trace?.visibleRefs?.length ?? 0,
    arbiterDecision: arbiterResult?.reason ?? trace?.arbiterDecision ?? '',
    validationNotes: [...(arbiterResult?.validationNotes ?? trace?.validationNotes ?? [])],
    rejectedReasons: [...(arbiterResult?.rejectedReasons ?? [])],
  };
}

function buildWechatAgentMemoryFactsFromReceipt(
  scene: ConversationSceneInputPack,
  receipt: ConversationReceipt,
): AgentMemoryFact[] {
  const profile = resolveWechatAgentProfile(scene);
  const scope = {
    conversationKey: receipt.conversationKey,
    caseId: receipt.targetCaseId,
    opportunityId: receipt.targetOpportunityId,
    channel: 'wechat' as const,
  };
  const sourceRef = {
    refType: 'conversation_receipt',
    refId: receipt.receiptId,
  };
  const facts: AgentMemoryFact[] = [
    {
      factId: `wechat:${receipt.conversationKey}:last-reply`,
      agentId: profile.agentId,
      kind: 'recent_interaction',
      summary: `上次玩家说：“${trimMemoryText(receipt.playerText, 44)}”；你当时回：“${trimMemoryText(receipt.recipientReply, 38)}”`,
      strength: 0.82,
      scope,
      sourceRef,
      createdAtDay: receipt.day,
      updatedAtDay: receipt.day,
      expiresAtDay: receipt.day + 7,
    },
    {
      factId: `wechat:${receipt.conversationKey}:latest-effect`,
      agentId: profile.agentId,
      kind: 'relationship_effect',
      summary: receipt.settlement.effectLabels.length > 0
        ? `这轮对话结果：${receipt.settlement.effectLabels.join('、')}`
        : `这轮对话结果：${receipt.summary}`,
      strength: 0.76,
      scope,
      sourceRef,
      createdAtDay: receipt.day,
      updatedAtDay: receipt.day,
      expiresAtDay: receipt.day + 10,
    },
  ];

  if (receipt.nextSteps.length > 0) {
    const step = receipt.nextSteps[0];
    facts.push({
      factId: `wechat:${receipt.conversationKey}:next-step`,
      agentId: profile.agentId,
      kind: 'active_next_step',
      summary: `下一步期待：${step.label}，原因是${step.reason}`,
      strength: step.priority === 'urgent' || step.priority === 'high' ? 0.9 : 0.72,
      scope,
      sourceRef,
      createdAtDay: receipt.day,
      updatedAtDay: receipt.day,
      expiresAtDay: receipt.day + 6,
    });
  }

  if (receipt.proposal.riskKinds.some((risk) => risk !== 'none')) {
    facts.push({
      factId: `wechat:${receipt.conversationKey}:risk`,
      agentId: profile.agentId,
      kind: 'open_risk',
      summary: `未消化风险：${receipt.proposal.riskKinds.filter((risk) => risk !== 'none').join('、')}`,
      strength: 0.78,
      scope,
      sourceRef,
      createdAtDay: receipt.day,
      updatedAtDay: receipt.day,
      expiresAtDay: receipt.day + 5,
    });
  }

  if (receipt.settlement.askPriceAfter && receipt.settlement.askPriceBefore && receipt.settlement.askPriceAfter < receipt.settlement.askPriceBefore) {
    facts.push({
      factId: `wechat:${receipt.conversationKey}:price-moved`,
      agentId: profile.agentId,
      kind: 'price_commitment',
      summary: `微信沟通后挂牌价从 ${receipt.settlement.askPriceBefore} 调整到 ${receipt.settlement.askPriceAfter}`,
      strength: 0.95,
      scope,
      sourceRef,
      createdAtDay: receipt.day,
      updatedAtDay: receipt.day,
      expiresAtDay: receipt.day + 14,
    });
  }

  return facts;
}

function trimMemoryText(text: string, maxLength: number) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 1)}…` : normalized;
}

function buildConversationSettlement(
  state: GameState,
  caseItem: GameState['cases'][number] | null,
  opportunity: Opportunity | null,
  scene: ConversationSceneInputPack,
  proposal: ConversationEffectProposal,
): ConversationEffectSettlement {
  const trustDelta = scene.sceneType === 'owner_wechat' ? normalizeDelta(proposal.trustDelta, -5, 6, 0) : 0;
  const patienceDelta = scene.sceneType === 'owner_wechat' ? normalizeDelta(proposal.patienceDelta, -5, 6, 0) : 0;
  const urgencyDelta = scene.sceneType === 'owner_wechat' ? normalizeDelta(proposal.urgencyDelta, -6, 5, 0) : 0;
  const priceFlexibilityDelta = scene.sceneType === 'owner_wechat' ? normalizeDelta(proposal.priceFlexibilityDelta, -6, 10, 0) : 0;
  const customerIntentDelta = opportunity ? normalizeDelta(proposal.customerIntentDelta, -8, 8, 0) : 0;
  const customerConfidenceDelta = opportunity ? normalizeDelta(proposal.customerConfidenceDelta, -8, 8, 0) : 0;
  const canAdjustPrice = shouldApplyPriceAdjustment(state, caseItem, scene, proposal, priceFlexibilityDelta);
  const askPriceBefore = canAdjustPrice && caseItem ? caseItem.askPrice : undefined;
  const askPriceAfter = canAdjustPrice && caseItem
    ? Math.max(Math.round(caseItem.marketPrice * 0.97), Math.round(caseItem.askPrice * 0.985))
    : undefined;

  return {
    trustDelta,
    patienceDelta,
    urgencyDelta,
    priceFlexibilityDelta,
    customerIntentDelta,
    customerConfidenceDelta,
    askPriceBefore,
    askPriceAfter,
    effectLabels: buildEffectLabels({
      trustDelta,
      patienceDelta,
      urgencyDelta,
      priceFlexibilityDelta,
      customerIntentDelta,
      customerConfidenceDelta,
      askPriceBefore,
      askPriceAfter,
      nextStep: proposal.nextStep,
    }),
  };
}

function applyConversationSettlement(
  state: GameState,
  caseItem: GameState['cases'][number] | null,
  opportunity: Opportunity | null,
  settlement: ConversationEffectSettlement,
  receipt: ConversationReceipt,
) {
  if (caseItem && caseItem.status === 'active') {
    if (settlement.trustDelta !== 0) {
      applyBrokerOwnerTrustDelta(state, caseItem, settlement.trustDelta, '微信对话影响关系', 0, 100);
    }
    if (settlement.patienceDelta !== 0) {
      applyOwnerCasePatienceDelta(state, caseItem, settlement.patienceDelta, '微信对话影响耐心', 0, 100);
    }
    if (settlement.urgencyDelta !== 0) {
      applyOwnerCaseUrgencyDelta(state, caseItem, settlement.urgencyDelta, '微信对话影响紧迫', 0, 100);
    }
    if (typeof settlement.askPriceAfter === 'number' && settlement.askPriceAfter < caseItem.askPrice) {
      caseItem.askPrice = settlement.askPriceAfter;
      caseItem.lastPriceActionDay = state.day;
      caseItem.heat = clamp(caseItem.heat + 5, 0, 100);
      caseItem.competitiveness = clamp(caseItem.competitiveness + 6, 0, 100);
    }
  }

  if (opportunity) {
    if (settlement.customerIntentDelta !== 0) {
      applyOpportunityIntentDeltaOnState(state, opportunity, settlement.customerIntentDelta, '微信对话影响客户意向', 0, 100);
    }
    if (settlement.customerConfidenceDelta !== 0) {
      applyOpportunityConfidenceDeltaOnState(state, opportunity, settlement.customerConfidenceDelta, '微信对话影响客户信心', 0, 100);
    }
    refreshOpportunityLabel(state, opportunity);
  }

  recordDomainEvent(state, {
    kind: 'journal',
    actor: '微信对话',
    title: `${receipt.actorName} 对话`,
    detail: receipt.summary,
    tone: settlement.trustDelta < 0 || settlement.urgencyDelta > 2 ? 'danger' : 'accent',
    caseId: receipt.targetCaseId,
    opportunityId: receipt.targetOpportunityId,
    payload: {
      receiptId: receipt.receiptId,
      sourceMessageId: receipt.sourceMessageId,
      intentKinds: receipt.proposal.intentKinds,
      riskKinds: receipt.proposal.riskKinds,
      effectLabels: settlement.effectLabels,
      nextSteps: receipt.nextSteps,
    },
  });
}

function shouldApplyPriceAdjustment(
  state: GameState,
  caseItem: GameState['cases'][number] | null,
  scene: ConversationSceneInputPack,
  proposal: ConversationEffectProposal,
  priceFlexibilityDelta: number,
) {
  if (!caseItem || scene.sceneType !== 'owner_wechat') return false;
  if (caseItem.lastPriceActionDay === state.day) return false;
  if (!proposal.intentKinds.includes('secure_price_adjustment')) return false;
  if (priceFlexibilityDelta < 8) return false;
  if (caseItem.askPrice <= caseItem.marketPrice * 1.01) return false;
  return /调价|降价|改价|下调|价格.*动|动一动/.test(scene.playerText);
}

function resolveSceneType(message: WechatMessage): ConversationSceneType {
  if (message.senderRole === 'owner') return 'owner_wechat';
  if (message.senderRole === 'customer') return 'customer_wechat';
  if (message.senderRole === 'district_manager' || message.senderRole === 'store_manager') return 'manager_wechat';
  return 'broker_wechat';
}

function resolveNextStep(
  intents: readonly ConversationIntentKind[],
  scene: ConversationSceneInputPack,
): ConversationNextStepDraft {
  const has = (intent: ConversationIntentKind) => intents.includes(intent);
  if (has('secure_price_adjustment')) {
    return buildNextStep('confirm_price_adjustment');
  }
  if (has('propose_face_visit')) {
    return buildNextStep('schedule_face_visit', scene);
  }
  if (has('discuss_price')) {
    return buildNextStep('review_price', scene);
  }
  if (has('present_market_evidence') && scene.sceneType === 'owner_wechat') {
    return buildNextStep('prepare_competition_comparison', scene);
  }
  if (has('follow_customer') || scene.sceneType === 'customer_wechat') {
    return buildNextStep('follow_customer', scene);
  }
  return buildNextStep('none', scene);
}

function buildNextStep(kind: ConversationNextStepKind, scene?: ConversationSceneInputPack): ConversationNextStepDraft {
  if (kind === 'schedule_face_visit') {
    return { kind, actionId: 'first-visit', label: '安排面访', reason: '对方需要明确方案，适合当面把客户、竞品和价格讲清。', priority: 'urgent' };
  }
  if (kind === 'review_price') {
    return { kind, actionId: 'pricing-advice', label: '做价格沟通', reason: '对话已经进入价格判断，需要用市场和客户反馈承接。', priority: 'high' };
  }
  if (kind === 'prepare_competition_comparison') {
    return { kind, actionId: 'deep-diagnosis', label: '准备竞品对比', reason: '先把竞品差异讲清，再继续推进业主决策。', priority: 'high' };
  }
  if (kind === 'confirm_price_adjustment') {
    return { kind, actionId: 'adjust-listing-price', label: '确认挂牌价调整', reason: '业主已进入价格复盘语境，可以进入调价确认。', priority: 'urgent' };
  }
  if (kind === 'follow_customer') {
    return { kind, actionId: 'showing', label: '跟进客户', reason: '客户需要明确反馈，适合继续确认看房或价格边界。', priority: 'high' };
  }
  if (kind === 'open_case') {
    const actionId = scene?.caseContext?.hasCompletedFirstVisit ? 'deep-diagnosis' : 'first-visit';
    return { kind, actionId, label: '补救沟通', reason: '这次回复让关系或节奏变差，需要排一次带方案的沟通把问题接回来。', priority: 'high' };
  }
  return { kind: 'none', label: '继续观察', reason: '这次回复没有形成明确后续事项。', priority: 'low' };
}

function shouldRecommendRecoveryStep(
  risks: readonly ConversationRiskKind[],
  deltas: Pick<ConversationEffectProposal, 'trustDelta' | 'patienceDelta' | 'urgencyDelta'>,
) {
  const hasRisk = risks.some((risk) => risk !== 'none');
  return hasRisk && (
    Number(deltas.trustDelta || 0) < 0
    || Number(deltas.patienceDelta || 0) < 0
    || Number(deltas.urgencyDelta || 0) > 0
  );
}

function buildFallbackSummary(intents: readonly ConversationIntentKind[], scene: ConversationSceneInputPack) {
  if (intents.includes('overpromise')) return '回复里有结果承诺，短期能安抚，但后续兑现压力会变大。';
  if (intents.includes('secure_price_adjustment')) return '对话把价格问题推到可确认阶段，业主开始松动挂牌预期。';
  if (intents.includes('propose_face_visit')) return '回复给了明确见面安排，能把焦虑转成下一步沟通。';
  if (intents.includes('discuss_price')) return '回复把问题带到价格复盘，需要继续用市场依据承接。';
  if (scene.sceneType === 'customer_wechat') return '回复给了客户明确反馈，客户更愿意继续等你确认。';
  return '回复完成了基础安抚，但后续还需要更明确动作。';
}

function buildFallbackRecipientReply(
  intents: readonly ConversationIntentKind[],
  risks: readonly ConversationRiskKind[],
  scene: ConversationSceneInputPack,
) {
  const variants = buildWechatLocalReplyVariants(scene);
  if (risks.includes('overpromise')) {
    return variants.skeptical;
  }
  if (intents.includes('secure_price_adjustment')) {
    return variants.positive;
  }
  if (intents.includes('propose_face_visit')) {
    return variants.positive;
  }
  if (intents.includes('discuss_price')) {
    return variants.neutral;
  }
  if (scene.sceneType === 'customer_wechat') {
    return intents.includes('follow_customer') || intents.includes('present_market_evidence')
      ? variants.positive
      : variants.neutral;
  }
  if (risks.includes('missing_next_step') || risks.includes('empty_comfort')) {
    return variants.skeptical;
  }
  return intents.includes('present_market_evidence') || intents.includes('promise_feedback')
    ? variants.neutral
    : variants.skeptical;
}

function buildEffectLabels(input: {
  trustDelta: number;
  patienceDelta: number;
  urgencyDelta: number;
  priceFlexibilityDelta: number;
  customerIntentDelta: number;
  customerConfidenceDelta: number;
  askPriceBefore?: number;
  askPriceAfter?: number;
  nextStep?: ConversationNextStepDraft;
}) {
  const labels: string[] = [];
  if (input.trustDelta > 0) labels.push('关系更稳');
  if (input.trustDelta < 0) labels.push('关系受损');
  if (input.patienceDelta > 0) labels.push('愿意再等等');
  if (input.patienceDelta < 0) labels.push('耐心下降');
  if (input.urgencyDelta < 0) labels.push('催促缓和');
  if (input.urgencyDelta > 0) labels.push('催促更强');
  if (input.priceFlexibilityDelta >= 5) labels.push('价格态度松动');
  if (input.customerIntentDelta > 0 || input.customerConfidenceDelta > 0) labels.push('客户继续跟进');
  if (typeof input.askPriceBefore === 'number' && typeof input.askPriceAfter === 'number' && input.askPriceAfter < input.askPriceBefore) {
    labels.push(`挂牌价 ${input.askPriceBefore}→${input.askPriceAfter}`);
  }
  if (input.nextStep && input.nextStep.kind !== 'none') {
    labels.push(input.nextStep.label);
  }
  return labels.slice(0, 4);
}

function normalizeIntentKinds(values: readonly unknown[] | undefined): ConversationIntentKind[] {
  const allowed = new Set<ConversationIntentKind>([
    'reassure',
    'present_market_evidence',
    'propose_face_visit',
    'discuss_price',
    'secure_price_adjustment',
    'promise_feedback',
    'follow_customer',
    'align_manager',
    'overpromise',
    'unclear',
  ]);
  return Array.isArray(values) ? [...new Set(values.filter((value): value is ConversationIntentKind => allowed.has(value as ConversationIntentKind)))] : [];
}

function normalizeRiskKinds(values: readonly unknown[] | undefined): ConversationRiskKind[] {
  const allowed = new Set<ConversationRiskKind>([
    'none',
    'overpromise',
    'empty_comfort',
    'price_pressure_too_fast',
    'missing_next_step',
    'ignores_customer',
  ]);
  return Array.isArray(values) ? [...new Set(values.filter((value): value is ConversationRiskKind => allowed.has(value as ConversationRiskKind)))] : [];
}

function normalizeNextStep(
  nextStep: ConversationNextStepDraft | undefined,
  intents: readonly ConversationIntentKind[],
  scene: ConversationSceneInputPack,
): ConversationNextStepDraft {
  if (!nextStep || typeof nextStep !== 'object') return resolveNextStep(intents, scene);
  const kind = normalizeNextStepKind(nextStep.kind);
  if (kind === 'none') return buildNextStep('none', scene);
  const fallback = buildNextStep(kind, scene);
  return {
    kind,
    actionId: typeof nextStep.actionId === 'string' ? nextStep.actionId : fallback.actionId,
    label: normalizeText(nextStep.label, fallback.label, 24),
    reason: normalizeText(nextStep.reason, fallback.reason, 80),
    priority: nextStep.priority === 'urgent' || nextStep.priority === 'high' || nextStep.priority === 'medium' || nextStep.priority === 'low'
      ? nextStep.priority
      : fallback.priority,
  };
}

function normalizeNextStepKind(value: unknown): ConversationNextStepKind {
  if (
    value === 'schedule_face_visit'
    || value === 'review_price'
    || value === 'prepare_competition_comparison'
    || value === 'follow_customer'
    || value === 'confirm_price_adjustment'
    || value === 'open_case'
    || value === 'none'
  ) {
    return value;
  }
  return 'none';
}

function normalizeText(value: unknown, fallback: string, maxLength: number) {
  const text = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
  return (text || fallback).slice(0, maxLength);
}

function normalizeDelta(value: unknown, min: number, max: number, fallback: number) {
  const next = Number(value);
  return clamp(Number.isFinite(next) ? Math.round(next) : fallback, min, max);
}
