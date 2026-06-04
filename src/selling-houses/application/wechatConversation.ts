import type { GameState, Opportunity } from '../domain/models.js';
import { asWritableGameState } from '../domain/models.js';
import { isCaseActiveByCanonicalStatus } from '../domain/caseLifecycleStatusRead.js';
import type { WechatMessage } from './projections/myWechatTypes.js';
import { clamp } from '../domain/utils.js';
import { recordDomainEvent, updateDerivedState } from '../domain/runtimeState.js';
import { applyBrokerOwnerTrustDelta } from '../domain/trustWriteHelper.js';
import {
  applyOwnerCasePatienceDelta,
  applyOwnerCaseUrgencyDelta,
} from '../domain/ownerCaseReadinessWriteHelper.js';
import {
  applyOpportunityConfidenceDeltaOnState,
  applyOpportunityIntentDeltaOnState,
} from '../domain/opportunitySplitHelper.js';
import { refreshOpportunityLabel } from '../domain/engine.js';
import type { ParticipantSoul } from '../core/world-state/agents/soul.js';
import { initializeSoulFromCase, updateSoulAfterConversation } from './agents/soulStore.js';
import type {
  ConversationContext,
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
import type { AgentEvaluationReport } from '../core/world-state/agents/evaluationReport.js';
import type { AgentShadowReport } from '../core/world-state/agents/shadowReport.js';
import { buildConversationMemoryWriteback } from '../core/world-state/agents/conversationMemory.js';
import type { CaseAgentMeshHarnessReport } from './agents/caseMeshHarness.js';
import {
  mergeAgentMemoryFacts,
  selectAgentMemoryFacts,
} from '../core/world-state/agents/memoryStore.js';
import {
  buildWechatLocalReplyVariants,
  resolveWechatAgentProfile,
  buildWechatRuntimeAgentId,
} from './agents/wechatAgentAdapter.js';
import { buildCaseAgentContextPack } from './agents/caseContextPackBuilder.js';
import { formatConversationRiskSummary } from './agents/conversationRiskLabels.js';

export interface WechatConversationTurnInput {
  conversationKey: string;
  message: WechatMessage;
  playerText: string;
  proposal?: ConversationEffectProposal | null;
  proposalSource?: 'ai' | 'fallback';
  trace?: AgentRunTrace;
  arbiterResult?: AgentArbiterResult;
  shadowReport?: AgentShadowReport;
  evaluationReport?: AgentEvaluationReport;
  meshReport?: CaseAgentMeshHarnessReport | null;
}

export interface WechatConversationTurnResult {
  nextState: GameState;
  success: boolean;
  reason: string;
  receipt: ConversationReceipt | null;
  trace?: AgentRunTrace;
  arbiterResult?: AgentArbiterResult;
}

export interface ConversationNormalizationResult {
  readonly proposal: ConversationEffectProposal;
  readonly validationNotes: readonly string[];
}

const MAX_PLAYER_TEXT_CHARS = 220;

export function sanitizeWechatPlayerText(text: string) {
  return text.replace(/\s+/g, ' ').trim().slice(0, MAX_PLAYER_TEXT_CHARS);
}

function getOrCreateSoul(state: GameState, caseItem: GameState['cases'][number]): ParticipantSoul {
  const participantId = `owner:${caseItem.id}:${caseItem.ownerName}`;
  const existing = state.participantSouls?.[participantId];
  if (existing) return existing;
  const soul = initializeSoulFromCase({
    caseId: caseItem.id,
    ownerName: caseItem.ownerName,
    ownerProfileLabel: caseItem.ownerProfilingMemory?.ownerTypeName || caseItem.personality || '未知',
    trust: caseItem.trust,
    patience: caseItem.patience,
    urgency: caseItem.urgency,
    priceGapPct: caseItem.priceGapPct,
  });
  asWritableGameState(state).participantSouls = {
    ...state.participantSouls,
    [participantId]: soul,
  };
  return soul;
}

function buildPromisesNotYetFulfilled(state: GameState, caseId: string): string[] {
  const history = state.wechatConversationHistory || [];
  const promises: string[] = [];
  for (const receipt of history.slice(-5)) {
    if (receipt.targetCaseId !== caseId) continue;
    if (receipt.nextSteps.length > 0) {
      for (const step of receipt.nextSteps) {
        if (step.kind !== 'none') {
          promises.push(step.label);
        }
      }
    }
  }
  return promises.slice(0, 3);
}

export function buildConversationContext(scene: ConversationSceneInputPack): ConversationContext {
  const senderName = scene.sourceMessage.senderName;
  const sourceContent = scene.sourceMessage.content;
  const caseTitle = scene.caseContext?.title || '';
  const community = scene.caseContext?.community || '';
  const district = scene.caseContext?.district || '';
  const trust = scene.caseContext?.trust ?? 50;
  const patience = scene.caseContext?.patience ?? 50;
  const urgency = scene.caseContext?.urgency ?? 50;
  const priceGapPct = scene.caseContext?.priceGapPct ?? 0;
  const askPrice = scene.caseContext?.askPrice ?? 0;
  const marketPrice = scene.caseContext?.marketPrice ?? 0;
  const hasCompletedFirstVisit = scene.caseContext?.hasCompletedFirstVisit ?? false;
  const ownerProfileLabel = scene.caseContext?.ownerProfileLabel || '';
  const customerName = scene.opportunityContext?.customerName || '';
  const customerIntent = scene.opportunityContext?.intent ?? 50;
  const customerStage = scene.opportunityContext?.stage || '';
  const caseRef = caseTitle ? `${caseTitle}这套` : '这套房';
  const locRef = community || district;
  const isAssertive = /强势|硬控|控盘|博弈|自信/.test(ownerProfileLabel);
  const isAnxious = /焦虑|急/.test(ownerProfileLabel) || urgency >= 70;
  const isLowTrust = trust < 40;
  const isHighUrgency = urgency >= 70;
  const isLowPatience = patience < 30;
  const isHighPriceGap = priceGapPct > 15;
  const isManager = scene.sceneType === 'manager_wechat';
  const isCustomer = scene.sceneType === 'customer_wechat';
  const promises = scene.caseContext?.promisesNotYetFulfilled || [];
  const serviceStrategy = scene.caseContext?.serviceStrategy;
  const playerDetails = extractPlayerTextDetails(scene.playerText);

  let emotionalState: ConversationContext['emotionalState'] = 'calm';
  if (trust < 30 && urgency > 70) emotionalState = 'frustrated';
  else if (trust < 40 && patience < 30) emotionalState = 'anxious';
  else if (trust < 30) emotionalState = 'angry';
  else if (trust > 60 && urgency < 50) emotionalState = 'hopeful';

  let relationshipStage: ConversationContext['relationshipStage'] = 'stable';
  if (trust < 25 || patience < 15) relationshipStage = 'crisis';
  else if (trust < 40) relationshipStage = 'probing';
  else if (trust > 60) relationshipStage = 'building';

  return {
    senderName, sceneType: scene.sceneType, sourceContent,
    playerText: scene.playerText, caseRef, locRef,
    trust, patience, urgency, priceGapPct, askPrice, marketPrice,
    hasCompletedFirstVisit, ownerProfileLabel,
    isAssertive, isAnxious, isLowTrust, isHighUrgency, isLowPatience, isHighPriceGap,
    isManager, isCustomer,
    customerName, customerIntent, customerStage,
    promises, serviceStrategy,
    emotionalState, relationshipStage, playerDetails,
  };
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
        serviceStrategy: caseItem.ownerProfilingMemory?.serviceStrategy,
        promisesNotYetFulfilled: buildPromisesNotYetFulfilled(state, caseItem.id),
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

  const scene: ConversationSceneInputPack = {
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
  const participantSoul = caseItem
    ? getOrCreateSoul(state, caseItem)
    : undefined;
  return {
    ...scene,
    caseContextPack: buildCaseAgentContextPack(state, scene),
    participantSoul,
  };
}

export function isHostileWechatPlayerText(text: string) {
  const normalized = text
    .replace(/\s+/g, '')
    .replace(/[，。！？、,.!?]/g, '')
    .toLowerCase();
  return /傻[逼比屄]|煞笔|沙币|蠢货|废物|sb\b|爱咋咋地|关我屁事|你有病|滚|闭嘴|别烦|烦死|懒得管|不想管|别找我|随便你|你自己看着办|老子/.test(normalized);
}

export function isThreateningWechatPlayerText(text: string) {
  const normalized = text
    .replace(/\s+/g, '')
    .replace(/[，。！？、,.!?]/g, '');
  return /不[降调]价.*找.*[别的]中介|换[个别人]|找[别的]中介|不[降调]价.*[换找]|你要是不/.test(normalized);
}

function isEmptyComfortText(text: string) {
  const normalized = text.replace(/\s+/g, '').replace(/[，。！？、,.!?]/g, '');
  if (normalized.length <= 10 && /^(收到|好的|好|嗯|明白|知道了|先这样|再说|再等等|我看看)$/.test(normalized)) {
    return true;
  }
  return normalized.length <= 18 && /^(收到|好的|好|明白|知道了).*(先这样|再说|再等等|我看看)?$/.test(normalized);
}

function isIgnoringSourceQuestion(scene: ConversationSceneInputPack) {
  const source = scene.sourceMessage.content;
  if (!/价格|价|装修|竞品|同小区|空间|低|高|方案|明确|怎么办|怎么做|时间|什么时候/.test(source)) {
    return false;
  }
  const text = scene.playerText;
  return !/价格|价|装修|竞品|同类|同小区|空间|反馈|方案|面访|当面|下午|明天|时间|比较|核|确认|安排|看|谈/.test(text);
}

export function buildFallbackConversationEffectProposal(scene: ConversationSceneInputPack): ConversationEffectProposal {
  if (isHostileWechatPlayerText(scene.playerText)) {
    return buildHostileConversationEffectProposal(scene);
  }
  if (isThreateningWechatPlayerText(scene.playerText)) {
    return buildThreateningConversationEffectProposal(scene);
  }

  const text = scene.playerText;
  const intents = new Set<ConversationIntentKind>();
  const risks = new Set<ConversationRiskKind>();
  let isExplicitReassure = false;

  if (isEmptyComfortText(text)) {
    intents.add('reassure');
    risks.add('empty_comfort');
    isExplicitReassure = true;
  }
  if (isIgnoringSourceQuestion(scene)) {
    risks.add('ignores_customer');
  }
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
    isExplicitReassure = true;
  }

  let nextStep = resolveNextStep([...intents], scene);
  const hasEvidence = intents.has('present_market_evidence');
  const hasNextStep = nextStep.kind !== 'none';
  if (!hasNextStep && !risks.has('overpromise') && risks.size === 0 && !isExplicitReassure) {
    risks.add('missing_next_step');
  }
  if (nextStep.kind === 'none' && shouldRecommendRecoveryStep([...risks], {
    trustDelta: risks.has('overpromise') ? -3 : risks.has('empty_comfort') || risks.has('ignores_customer') ? -1 : 0,
    patienceDelta: risks.has('overpromise') ? -1 : risks.has('empty_comfort') || risks.has('ignores_customer') ? -1 : 0,
    urgencyDelta: risks.has('overpromise') ? 2 : risks.has('empty_comfort') || risks.has('ignores_customer') ? 1 : 0,
  })) {
    nextStep = buildNextStep('open_case', scene);
  }

  return {
    summary: buildFallbackSummary([...intents], scene),
    recipientReply: buildFallbackRecipientReply([...intents], [...risks], scene),
    intentKinds: [...intents],
    riskKinds: risks.size > 0 ? [...risks] : ['none'],
    evidenceUse: hasEvidence ? 'specific' : 'mentioned',
    trustDelta: risks.has('overpromise') ? -3 : risks.has('empty_comfort') || risks.has('ignores_customer') ? -1 : hasEvidence || hasNextStep ? 3 : 1,
    patienceDelta: risks.has('overpromise') ? -1 : risks.has('empty_comfort') || risks.has('ignores_customer') ? -1 : hasNextStep ? 2 : 0,
    urgencyDelta: risks.has('overpromise') ? 2 : risks.has('empty_comfort') || risks.has('ignores_customer') ? 1 : hasNextStep ? -2 : 0,
    priceFlexibilityDelta: intents.has('secure_price_adjustment') ? 9 : intents.has('discuss_price') && hasEvidence ? 5 : 0,
    customerIntentDelta: scene.sceneType === 'customer_wechat' ? risks.has('ignores_customer') ? -4 : 4 : 0,
    customerConfidenceDelta: scene.sceneType === 'customer_wechat' ? risks.has('ignores_customer') ? -4 : 4 : 0,
    nextStep,
    confidence: 0.72,
  };
}

export function normalizeConversationEffectProposalDetailed(
  proposal: ConversationEffectProposal | null | undefined,
  scene: ConversationSceneInputPack,
): ConversationNormalizationResult {
  const normalized = normalizeConversationEffectProposal(proposal, scene);
  const validationNotes: string[] = [];

  if (proposal?.nextStep?.actionId && proposal.nextStep.actionId !== normalized.nextStep?.actionId) {
    validationNotes.push(
      `next_step_actionId_normalized:${proposal.nextStep.actionId}->${normalized.nextStep?.actionId}`,
    );
  }

  if (proposal) {
    validationNotes.push(...collectNormalizedDeltaNotes(proposal, normalized));
    if (proposal.evidenceUse !== normalized.evidenceUse) {
      validationNotes.push(`evidenceUse_normalized:${proposal.evidenceUse}->${normalized.evidenceUse}`);
    }
    if (Array.isArray(proposal.intentKinds) && proposal.intentKinds.length > 0 && normalized.intentKinds.length === 0) {
      validationNotes.push('intentKinds_fallback_to_scene_default');
    }
    if (Array.isArray(proposal.riskKinds) && proposal.riskKinds.length > 0 && normalized.riskKinds.length === 0) {
      validationNotes.push('riskKinds_fallback_to_scene_default');
    }
  }

  return { proposal: normalized, validationNotes };
}

function collectNormalizedDeltaNotes(
  original: ConversationEffectProposal,
  normalized: ConversationEffectProposal,
): string[] {
  const notes: string[] = [];
  const deltaFields: readonly (keyof Pick<
    ConversationEffectProposal,
    | 'trustDelta'
    | 'patienceDelta'
    | 'urgencyDelta'
    | 'priceFlexibilityDelta'
    | 'customerIntentDelta'
    | 'customerConfidenceDelta'
  >)[] = [
    'trustDelta',
    'patienceDelta',
    'urgencyDelta',
    'priceFlexibilityDelta',
    'customerIntentDelta',
    'customerConfidenceDelta',
  ];

  for (const field of deltaFields) {
    const raw = original[field];
    const next = normalized[field];
    if (typeof raw === 'number' && typeof next === 'number' && raw !== next) {
      notes.push(`${field}_normalized:${raw}->${next}`);
    }
  }

  return notes;
}

export function normalizeConversationEffectProposal(
  proposal: ConversationEffectProposal | null | undefined,
  scene: ConversationSceneInputPack,
): ConversationEffectProposal {
  if (isHostileWechatPlayerText(scene.playerText)) {
    return buildHostileConversationEffectProposal(scene);
  }

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
  const normalization = normalizeConversationEffectProposalDetailed(input.proposal, scene);
  const proposal = normalization.proposal;
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
    traceSnapshot: buildTraceSnapshot(
      scene,
      input.trace,
      input.arbiterResult,
      normalization,
      input.shadowReport,
      input.evaluationReport,
      input.meshReport || undefined,
    ),
  });

  applyConversationSettlement(state, caseItem, opportunity, settlement, receipt);
  asWritableGameState(state).wechatConversationHistory = [...(state.wechatConversationHistory || []), receipt].slice(-80);
  state.agentMemoryStore = mergeAgentMemoryFacts(
    state.agentMemoryStore,
    buildWechatAgentMemoryFactsFromReceipt(scene, receipt),
  );
  if (scene.participantSoul && caseItem) {
    const participantId = `owner:${caseItem.id}:${caseItem.ownerName}`;
    const updatedSoul = updateSoulAfterConversation(scene.participantSoul, {
      day: state.day,
      playerText,
      recipientReply: proposal.recipientReply,
      settlement,
      proposal,
    });
    asWritableGameState(state).participantSouls = {
      ...state.participantSouls,
      [participantId]: updatedSoul,
    };
  }
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
  scene: ConversationSceneInputPack,
  trace: AgentRunTrace | undefined,
  arbiterResult: AgentArbiterResult | undefined,
  normalization: ConversationNormalizationResult,
  shadowReport?: AgentShadowReport,
  evaluationReport?: AgentEvaluationReport,
  meshReport?: CaseAgentMeshHarnessReport,
): ConversationTraceSnapshot {
  if (!trace && !arbiterResult) {
    // Fallback path: no agent trace available. Still produce a snapshot so the
    // receipt is never opaque. LLM is NOT simulation truth — this trace records
    // that the fallback was used, not that "AI decided".
    return {
      acceptedSource: 'fallback',
      ruleConfidence: 0.5,
      llmConfidence: null,
      contextPackId: scene.caseContextPack?.packId,
      contextBudget: scene.caseContextPack?.contextBudget.summary,
      visibleRefCount: countVisibleRefs(scene),
      pressure: [],
      uncertainty: [],
      memoryFactCount: 0,
      contextSignalCount: 0,
      arbiterDecision: 'no_agent_trace_available',
      validationNotes: ['fallback_without_agent_trace'],
      normalizationNotes: [...normalization.validationNotes],
      rejectedReasons: [],
      shadowStatus: shadowReport?.status,
      shadowDecision: shadowReport?.decision,
      shadowRiskLevel: shadowReport?.riskLevel,
      shadowConfidenceDelta: shadowReport?.confidenceDelta ?? null,
      shadowAcceptedProposalId: shadowReport?.acceptedProposalId,
      shadowSignals: shadowReport?.signals ? [...shadowReport.signals] : [],
      shadowSummary: shadowReport?.summary,
      evaluationScore: evaluationReport?.score,
      evaluationVerdict: evaluationReport?.verdict,
      evaluationStatus: evaluationReport?.status,
      evaluationSignals: evaluationReport?.signals ? [...evaluationReport.signals] : [],
      evaluationSummary: evaluationReport?.summary,
      meshReadiness: meshReport?.readiness,
      meshPrimaryRoleId: meshReport?.roleSnapshots.find((role) => role.kind === 'primary')?.roleId,
      meshSignals: meshReport?.signals ? [...meshReport.signals] : [],
      meshSummary: meshReport?.summary,
    };
  }
  return {
    acceptedSource: arbiterResult?.acceptedSource ?? trace?.acceptedSource ?? 'fallback',
    ruleConfidence: trace?.ruleConfidence ?? 0.5,
    llmConfidence: trace?.llmConfidence ?? null,
    contextPackId: scene.caseContextPack?.packId,
    contextBudget: scene.caseContextPack?.contextBudget.summary,
    visibleRefCount: trace?.visibleRefs.length ?? countVisibleRefs(scene),
    pressure: [...(trace?.pressure ?? [])],
    uncertainty: [...(trace?.uncertainty ?? [])],
    memoryFactCount: trace?.memoryFactIds?.length ?? 0,
    contextSignalCount: trace?.visibleRefs?.length ?? 0,
    arbiterDecision: arbiterResult?.reason ?? trace?.arbiterDecision ?? '',
    validationNotes: [...(arbiterResult?.validationNotes ?? trace?.validationNotes ?? [])],
    normalizationNotes: [...normalization.validationNotes],
    rejectedReasons: [...(arbiterResult?.rejectedReasons ?? [])],
    modelId: trace?.modelId,
    provider: trace?.provider,
    llmError: trace?.llmError,
    shadowStatus: shadowReport?.status,
    shadowDecision: shadowReport?.decision,
    shadowRiskLevel: shadowReport?.riskLevel,
    shadowConfidenceDelta: shadowReport?.confidenceDelta ?? null,
    shadowAcceptedProposalId: shadowReport?.acceptedProposalId,
    shadowSignals: shadowReport?.signals ? [...shadowReport.signals] : [],
    shadowSummary: shadowReport?.summary,
    evaluationScore: evaluationReport?.score,
    evaluationVerdict: evaluationReport?.verdict,
    evaluationStatus: evaluationReport?.status,
    evaluationSignals: evaluationReport?.signals ? [...evaluationReport.signals] : [],
    evaluationSummary: evaluationReport?.summary,
    meshReadiness: meshReport?.readiness,
    meshPrimaryRoleId: meshReport?.roleSnapshots.find((role) => role.kind === 'primary')?.roleId,
    meshSignals: meshReport?.signals ? [...meshReport.signals] : [],
    meshSummary: meshReport?.summary,
  };
}

function countVisibleRefs(scene: ConversationSceneInputPack) {
  let count = 1;
  if (scene.caseContext?.caseId) count += 1;
  if (scene.opportunityContext?.opportunityId) count += 1;
  return count;
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
      summary: formatConversationRiskSummary(`未消化风险：${receipt.proposal.riskKinds.filter((risk) => risk !== 'none').join('、')}`),
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

  const ownerProfileLabel = scene.caseContext?.ownerProfileLabel || '';
  if (ownerProfileLabel) {
    const crossScope = {
      conversationKey: `profile:${ownerProfileLabel}`,
      caseId: receipt.targetCaseId,
      channel: 'wechat' as const,
    };
    const effectiveIntents = receipt.proposal.intentKinds.filter((k) => k !== 'hostile' && k !== 'unclear');
    const trustDir = receipt.settlement.trustDelta > 0 ? '提升' : receipt.settlement.trustDelta < 0 ? '下降' : '持平';
    const urgencyDir = receipt.settlement.urgencyDelta > 0 ? '上升' : receipt.settlement.urgencyDelta < 0 ? '下降' : '持平';
    facts.push({
      factId: `wechat:profile:${ownerProfileLabel}:pattern:${receipt.day}:${receipt.receiptId.slice(-6)}`,
      agentId: profile.agentId,
      kind: 'communication_pattern',
      summary: `${ownerProfileLabel}：用${effectiveIntents.join('+')}沟通，信任${trustDir}，紧迫${urgencyDir}；${receipt.summary}`,
      strength: 0.65,
      scope: crossScope,
      sourceRef,
      createdAtDay: receipt.day,
      updatedAtDay: receipt.day,
      expiresAtDay: receipt.day + 20,
    });
  }

  return [
    ...facts,
    ...buildConversationMemoryWriteback({
      receipt,
      existingFacts: scene.agentMemory,
    }).facts,
  ];
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
  if (caseItem && isCaseActiveByCanonicalStatus(state, caseItem)) {
    const trustBefore = caseItem.trust;
    const patienceBefore = caseItem.patience;
    const urgencyBefore = caseItem.urgency;

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

    if (settlement.trustDelta < 0) {
      caseItem.heat = clamp(caseItem.heat - 3, 0, 100);
    }
    if (settlement.urgencyDelta > 2) {
      caseItem.competitiveness = clamp(caseItem.competitiveness + 2, 0, 100);
    }

    if (trustBefore >= 30 && caseItem.trust < 30) {
      recordDomainEvent(state, {
        kind: 'journal',
        actor: '微信对话',
        title: `${caseItem.title} 关系告急`,
        detail: `信任跌破 30（${caseItem.trust}），业主可能不再配合。需要尽快面访修复关系。`,
        tone: 'danger',
        caseId: caseItem.id,
        opportunityId: receipt.targetOpportunityId,
        payload: { trigger: 'trust_below_30', trust: caseItem.trust, receiptId: receipt.receiptId },
      });
    }
    if (patienceBefore >= 20 && caseItem.patience < 20) {
      recordDomainEvent(state, {
        kind: 'journal',
        actor: '微信对话',
        title: `${caseItem.title} 耐心耗尽`,
        detail: `耐心跌破 20（${caseItem.patience}），业主随时可能换人。需要立即给出明确方案。`,
        tone: 'danger',
        caseId: caseItem.id,
        opportunityId: receipt.targetOpportunityId,
        payload: { trigger: 'patience_below_20', patience: caseItem.patience, receiptId: receipt.receiptId },
      });
    }
    if (urgencyBefore <= 80 && caseItem.urgency > 80) {
      recordDomainEvent(state, {
        kind: 'journal',
        actor: '微信对话',
        title: `${caseItem.title} 催促升级`,
        detail: `紧迫突破 80（${caseItem.urgency}），业主开始频繁催促。需要今天给出动作。`,
        tone: 'danger',
        caseId: caseItem.id,
        opportunityId: receipt.targetOpportunityId,
        payload: { trigger: 'urgency_above_80', urgency: caseItem.urgency, receiptId: receipt.receiptId },
      });
    }
  }

  if (opportunity) {
    const intentBefore = opportunity.intent;
    const confidenceBefore = opportunity.confidence;

    if (settlement.customerIntentDelta !== 0) {
      applyOpportunityIntentDeltaOnState(state, opportunity, settlement.customerIntentDelta, '微信对话影响客户意向', 0, 100);
    }
    if (settlement.customerConfidenceDelta !== 0) {
      applyOpportunityConfidenceDeltaOnState(state, opportunity, settlement.customerConfidenceDelta, '微信对话影响客户信心', 0, 100);
    }
    refreshOpportunityLabel(state, opportunity);

    if (intentBefore < 70 && opportunity.intent >= 70) {
      recordDomainEvent(state, {
        kind: 'journal',
        actor: '微信对话',
        title: `${opportunity.customerName} 意向升级`,
        detail: `客户意向突破 70（${opportunity.intent}），进入高意向区间。需要尽快安排看房或出价。`,
        tone: 'accent',
        caseId: receipt.targetCaseId,
        opportunityId: opportunity.id,
        payload: { trigger: 'intent_above_70', intent: opportunity.intent, receiptId: receipt.receiptId },
      });
    }
    if (confidenceBefore >= 30 && opportunity.confidence < 30) {
      recordDomainEvent(state, {
        kind: 'journal',
        actor: '微信对话',
        title: `${opportunity.customerName} 信心不足`,
        detail: `客户信心跌破 30（${opportunity.confidence}），可能转向其他房源。需要尽快确认价格和竞品差异。`,
        tone: 'danger',
        caseId: receipt.targetCaseId,
        opportunityId: opportunity.id,
        payload: { trigger: 'confidence_below_30', confidence: opportunity.confidence, receiptId: receipt.receiptId },
      });
    }
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

function buildHostileConversationEffectProposal(scene: ConversationSceneInputPack): ConversationEffectProposal {
  return {
    summary: '这句回复冒犯了对方，关系明显受损。',
    recipientReply: buildFallbackRecipientReply(['hostile'], ['offensive_reply'], scene),
    intentKinds: ['hostile'],
    riskKinds: ['offensive_reply'],
    evidenceUse: 'none',
    trustDelta: -5,
    patienceDelta: -4,
    urgencyDelta: 4,
    priceFlexibilityDelta: -4,
    customerIntentDelta: scene.sceneType === 'customer_wechat' ? -6 : 0,
    customerConfidenceDelta: scene.sceneType === 'customer_wechat' ? -6 : 0,
    nextStep: buildNextStep('open_case', scene),
    confidence: 0.9,
  };
}

function buildThreateningConversationEffectProposal(scene: ConversationSceneInputPack): ConversationEffectProposal {
  const senderName = scene.sourceMessage.senderName;
  const caseTitle = scene.caseContext?.title || '';
  const caseRef = caseTitle ? `${caseTitle}这套` : '这套房';
  const isCustomer = scene.sceneType === 'customer_wechat';
  const isManager = scene.sceneType === 'manager_wechat';

  let recipientReply: string;
  if (isCustomer) {
    recipientReply = `${senderName}：您这么说我就理解了，但${caseRef}的情况我得跟业主确认，价格不是我一个人能定的。`;
  } else if (isManager) {
    recipientReply = `${senderName}：这个态度不行，先把${caseRef}的情况稳住，别让业主跑单。`;
  } else {
    recipientReply = `${senderName}：您这么说我就理解了，但${caseRef}的价格不是我能直接定的，我得跟客户和市场确认。您给我一点时间。`;
  }

  return {
    summary: '回复中带有施压成分，关系出现裂痕，需要尽快修复。',
    recipientReply,
    intentKinds: ['discuss_price'],
    riskKinds: ['offensive_reply'],
    evidenceUse: 'none',
    trustDelta: -3,
    patienceDelta: -2,
    urgencyDelta: 3,
    priceFlexibilityDelta: -2,
    customerIntentDelta: isCustomer ? -4 : 0,
    customerConfidenceDelta: isCustomer ? -4 : 0,
    nextStep: buildNextStep('open_case', scene),
    confidence: 0.82,
  };
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
  if (intents.includes('hostile')) return '这句回复冒犯了对方，关系明显受损。';
  if (intents.includes('overpromise')) return '回复里有结果承诺，短期能安抚，但后续兑现压力会变大。';
  if (intents.includes('secure_price_adjustment')) return '对话把价格问题推到可确认阶段，业主开始松动挂牌预期。';
  if (intents.includes('propose_face_visit')) return '回复给了明确见面安排，能把焦虑转成下一步沟通。';
  if (intents.includes('discuss_price')) return '回复把问题带到价格复盘，需要继续用市场依据承接。';
  if (scene.sceneType === 'customer_wechat') return '回复给了客户明确反馈，客户更愿意继续等你确认。';
  return '回复完成了基础安抚，但后续还需要更明确动作。';
}

function extractPlayerTextDetails(text: string): { priceRef: string; actionRef: string; timeRef: string } {
  const priceMatch = text.match(/(\d+)\s*万/);
  const priceRef = priceMatch ? `${priceMatch[1]}万` : '';
  const timeMatch = text.match(/(今天|明天|下午|周末|下周|周[一二三四五六日天])/);
  const timeRef = timeMatch ? timeMatch[1] : '';
  let actionRef = '';
  if (/面访|见面|上门|当面/.test(text)) actionRef = '面访';
  else if (/调价|降价|改价|下调|动一动/.test(text)) actionRef = '调价';
  else if (/反馈|整理|同步|发您/.test(text)) actionRef = '反馈';
  else if (/竞品|成交|数据|市场/.test(text)) actionRef = '数据';
  else if (/客户|带看|约|看房/.test(text)) actionRef = '客户';
  return { priceRef, actionRef, timeRef };
}

interface ReplyContext {
  readonly senderName: string;
  readonly caseRef: string;
  readonly locRef: string;
  readonly community: string;
  readonly district: string;
  readonly askPrice: number;
  readonly marketPrice: number;
  readonly priceGapPct: number;
  readonly trust: number;
  readonly patience: number;
  readonly urgency: number;
  readonly customerName: string;
  readonly customerIntent: number;
  readonly sourceSnippet: string;
  readonly promiseRef: string;
  readonly strategyRef: string;
  readonly priceRef: string;
  readonly actionRef: string;
  readonly timeRef: string;
}

interface ReplyRule {
  readonly priority: number;
  readonly sceneType?: ConversationSceneType;
  readonly intents?: readonly ConversationIntentKind[];
  readonly risks?: readonly ConversationRiskKind[];
  readonly ownerProfile?: 'assertive' | 'anxious' | 'default';
  readonly flags?: readonly ('lowTrust' | 'highUrgency' | 'lowPatience' | 'highPriceGap' | 'noFirstVisit' | 'isCustomer')[];
  readonly playerDetail?: 'hasPriceRef' | 'noPriceRef' | 'actionData' | 'actionFeedback' | 'actionVisit' | 'actionCustomer' | 'hasTimeRef' | 'noTimeRef' | 'any';
  readonly customerIntentHigh?: boolean;
  readonly hasCustomerName?: boolean;
  readonly buildReply: (ctx: ReplyContext) => string;
}

function buildReplyContext(scene: ConversationSceneInputPack): ReplyContext {
  const senderName = scene.sourceMessage.senderName;
  const sourceContent = scene.sourceMessage.content;
  const caseTitle = scene.caseContext?.title || '';
  const community = scene.caseContext?.community || '';
  const district = scene.caseContext?.district || '';
  const trust = scene.caseContext?.trust ?? 50;
  const patience = scene.caseContext?.patience ?? 50;
  const urgency = scene.caseContext?.urgency ?? 50;
  const priceGapPct = scene.caseContext?.priceGapPct ?? 0;
  const askPrice = scene.caseContext?.askPrice ?? 0;
  const marketPrice = scene.caseContext?.marketPrice ?? 0;
  const customerName = scene.opportunityContext?.customerName || '';
  const customerIntent = scene.opportunityContext?.intent ?? 50;
  const caseRef = caseTitle ? `${caseTitle}这套` : '这套房';
  const locRef = community || district;
  const playerDetails = extractPlayerTextDetails(scene.playerText);
  const sourceSnippet = sourceContent.length > 20 ? `${sourceContent.slice(0, 20)}…` : sourceContent;
  const promises = scene.caseContext?.promisesNotYetFulfilled || [];
  const promiseRef = promises.length > 0 ? `你上次说的${promises[0]}还没兑现，` : '';
  const strategy = scene.caseContext?.serviceStrategy;
  const strategyRef = strategy ? `按${strategy.communicationStyle}` : '';

  return {
    senderName, caseRef, locRef, community, district,
    askPrice, marketPrice, priceGapPct, trust, patience, urgency,
    customerName, customerIntent, sourceSnippet, promiseRef, strategyRef,
    priceRef: playerDetails.priceRef,
    actionRef: playerDetails.actionRef,
    timeRef: playerDetails.timeRef,
  };
}

function resolveOwnerProfile(scene: ConversationSceneInputPack): 'assertive' | 'anxious' | 'default' {
  const ownerProfileLabel = scene.caseContext?.ownerProfileLabel || '';
  const urgency = scene.caseContext?.urgency ?? 50;
  if (/强势|硬控|控盘|博弈|自信/.test(ownerProfileLabel)) return 'assertive';
  if (/焦虑|急/.test(ownerProfileLabel) || urgency >= 70) return 'anxious';
  return 'default';
}

function resolveFlags(scene: ConversationSceneInputPack): Set<string> {
  const flags = new Set<string>();
  const trust = scene.caseContext?.trust ?? 50;
  const urgency = scene.caseContext?.urgency ?? 50;
  const patience = scene.caseContext?.patience ?? 50;
  const priceGapPct = scene.caseContext?.priceGapPct ?? 0;
  const hasCompletedFirstVisit = scene.caseContext?.hasCompletedFirstVisit ?? false;

  if (trust < 40) flags.add('lowTrust');
  if (urgency >= 70) flags.add('highUrgency');
  if (patience < 30) flags.add('lowPatience');
  if (priceGapPct > 15) flags.add('highPriceGap');
  if (!hasCompletedFirstVisit) flags.add('noFirstVisit');
  if (scene.sceneType === 'customer_wechat') flags.add('isCustomer');
  return flags;
}

function matchRule(
  rule: ReplyRule,
  scene: ConversationSceneInputPack,
  intents: readonly ConversationIntentKind[],
  risks: readonly ConversationRiskKind[],
  ctx: ReplyContext,
  ownerProfile: 'assertive' | 'anxious' | 'default',
  flags: Set<string>,
): boolean {
  if (rule.sceneType && rule.sceneType !== scene.sceneType) return false;
  if (rule.intents && !rule.intents.some(i => intents.includes(i))) return false;
  if (rule.risks && !rule.risks.some(r => risks.includes(r))) return false;

  if (rule.ownerProfile && rule.ownerProfile !== ownerProfile) return false;

  if (rule.flags && !rule.flags.every(f => flags.has(f))) return false;

  if (rule.playerDetail) {
    if (rule.playerDetail === 'hasPriceRef' && !ctx.priceRef) return false;
    if (rule.playerDetail === 'noPriceRef' && ctx.priceRef) return false;
    if (rule.playerDetail === 'actionData' && ctx.actionRef !== '数据') return false;
    if (rule.playerDetail === 'actionFeedback' && ctx.actionRef !== '反馈') return false;
    if (rule.playerDetail === 'actionVisit' && ctx.actionRef !== '面访') return false;
    if (rule.playerDetail === 'actionCustomer' && ctx.actionRef !== '客户') return false;
    if (rule.playerDetail === 'hasTimeRef' && !ctx.timeRef) return false;
    if (rule.playerDetail === 'noTimeRef' && ctx.timeRef) return false;
  }

  if (rule.customerIntentHigh !== undefined) {
    if (rule.customerIntentHigh && ctx.customerIntent < 70) return false;
    if (!rule.customerIntentHigh && ctx.customerIntent >= 70) return false;
  }

  if (rule.hasCustomerName !== undefined) {
    if (rule.hasCustomerName && !ctx.customerName) return false;
    if (!rule.hasCustomerName && ctx.customerName) return false;
  }

  return true;
}

const OWNER_REPLY_TABLE: readonly ReplyRule[] = [
  // Priority 100: hostile/offensive
  { priority: 100, risks: ['offensive_reply'], sceneType: 'customer_wechat', buildReply: () => '你这个态度，我就先不跟你聊这套了。' },
  { priority: 100, risks: ['offensive_reply'], sceneType: 'manager_wechat', buildReply: () => '这个态度不行，先把客户和业主稳住。' },
  { priority: 100, risks: ['offensive_reply'], sceneType: 'owner_wechat', buildReply: () => '你要是这个态度，那我没法继续信你了。' },
  { priority: 100, risks: ['offensive_reply'], buildReply: () => '这个态度没法继续配合，先冷静一下。' },
  { priority: 100, intents: ['hostile'], sceneType: 'customer_wechat', buildReply: () => '你这个态度，我就先不跟你聊这套了。' },
  { priority: 100, intents: ['hostile'], sceneType: 'manager_wechat', buildReply: () => '这个态度不行，先把客户和业主稳住。' },
  { priority: 100, intents: ['hostile'], sceneType: 'owner_wechat', buildReply: () => '你要是这个态度，那我没法继续信你了。' },
  { priority: 100, intents: ['hostile'], buildReply: () => '这个态度没法继续配合，先冷静一下。' },

  // Priority 20: intent-based - secure_price_adjustment
  { priority: 20, intents: ['secure_price_adjustment'], ownerProfile: 'assertive', playerDetail: 'hasPriceRef', buildReply: (ctx) => `${ctx.senderName}：${ctx.priceRef}这个价格你有依据吗？${ctx.caseRef}挂价${ctx.askPrice}万，市场才${ctx.marketPrice}万，你得告诉我凭什么调。` },
  { priority: 20, intents: ['secure_price_adjustment'], ownerProfile: 'assertive', flags: ['highPriceGap'], buildReply: (ctx) => `${ctx.senderName}：调价可以，但${ctx.caseRef}挂价${ctx.askPrice}万，市场才${ctx.marketPrice}万，差了${ctx.priceGapPct.toFixed(0)}%。你得告诉我客户到底出到多少，凭什么调。` },
  { priority: 20, intents: ['secure_price_adjustment'], ownerProfile: 'assertive', buildReply: (ctx) => `${ctx.senderName}：调价可以，但你得先告诉我客户到底出到多少，凭什么调，我听依据，不听空判断。` },
  { priority: 20, intents: ['secure_price_adjustment'], ownerProfile: 'anxious', playerDetail: 'hasPriceRef', buildReply: (ctx) => `${ctx.senderName}：你说调到${ctx.priceRef}，我现在最怕调了也没用。${ctx.caseRef}挂了这么久没成交，你告诉我调多少能成交。` },
  { priority: 20, intents: ['secure_price_adjustment'], ownerProfile: 'anxious', buildReply: (ctx) => `${ctx.senderName}：你说调价，我现在最怕调了也没用。${ctx.caseRef}挂了这么久没成交，你告诉我调多少能成交，别让我白折腾。` },
  { priority: 20, intents: ['secure_price_adjustment'], flags: ['highPriceGap'], playerDetail: 'hasPriceRef', buildReply: (ctx) => `${ctx.senderName}：你说${ctx.priceRef}，但${ctx.caseRef}挂价${ctx.askPrice}万比市场高${ctx.priceGapPct.toFixed(0)}%，你先告诉我客户真实出价。` },
  { priority: 20, intents: ['secure_price_adjustment'], flags: ['highPriceGap'], buildReply: (ctx) => `${ctx.senderName}：你说调价，但${ctx.caseRef}挂价${ctx.askPrice}万比市场高${ctx.priceGapPct.toFixed(0)}%，你先告诉我客户真实出价，我再判断怎么调。` },
  { priority: 20, intents: ['secure_price_adjustment'], playerDetail: 'hasPriceRef', buildReply: (ctx) => `${ctx.senderName}：${ctx.priceRef}可以，但${ctx.caseRef}的情况你得先给我分析清楚，市场价和客户反馈我都需要。` },
  { priority: 20, intents: ['secure_price_adjustment'], buildReply: (ctx) => `${ctx.senderName}：调价可以，但${ctx.caseRef}的情况你得先给我分析清楚，市场价和客户反馈我都需要。` },

  // Priority 20: intent-based - propose_face_visit
  { priority: 20, intents: ['propose_face_visit'], ownerProfile: 'assertive', playerDetail: 'hasTimeRef', buildReply: (ctx) => `${ctx.senderName}：${ctx.timeRef}可以，但你得带${ctx.caseRef}的竞品数据和客户反馈来，别只来聊聊。` },
  { priority: 20, intents: ['propose_face_visit'], ownerProfile: 'assertive', buildReply: (ctx) => `${ctx.senderName}：行，那你带${ctx.caseRef}的竞品数据和客户反馈来，别只来聊聊。` },
  { priority: 20, intents: ['propose_face_visit'], ownerProfile: 'anxious', playerDetail: 'hasTimeRef', buildReply: (ctx) => `${ctx.senderName}：${ctx.timeRef}就定时间，${ctx.caseRef}的事我不能再等了。` },
  { priority: 20, intents: ['propose_face_visit'], ownerProfile: 'anxious', buildReply: (ctx) => `${ctx.senderName}：行，那你今天就定时间，${ctx.caseRef}的事我不能再等了。` },
  { priority: 20, intents: ['propose_face_visit'], flags: ['lowPatience'], buildReply: (ctx) => `${ctx.senderName}：可以见面，但你得带方案来，${ctx.caseRef}的情况你得说清楚。` },
  { priority: 20, intents: ['propose_face_visit'], playerDetail: 'hasTimeRef', buildReply: (ctx) => `${ctx.senderName}：好，${ctx.timeRef}我们当面把${ctx.caseRef}的情况理清楚。` },
  { priority: 20, intents: ['propose_face_visit'], buildReply: (ctx) => `${ctx.senderName}：好，那你定个时间，我们当面把${ctx.caseRef}的情况理清楚。` },

  // Priority 20: intent-based - discuss_price
  { priority: 20, intents: ['discuss_price'], ownerProfile: 'assertive', playerDetail: 'hasPriceRef', buildReply: (ctx) => `${ctx.senderName}：${ctx.priceRef}你有依据吗？${ctx.locRef ? `${ctx.locRef}同小区` : '同小区'}成交数据和客户出价摆出来。` },
  { priority: 20, intents: ['discuss_price'], ownerProfile: 'assertive', buildReply: (ctx) => `${ctx.senderName}：价格的事你得给我依据，${ctx.locRef ? `${ctx.locRef}同小区` : '同小区'}成交数据和客户出价摆出来，我再判断。` },
  { priority: 20, intents: ['discuss_price'], flags: ['highPriceGap'], playerDetail: 'hasPriceRef', buildReply: (ctx) => `${ctx.senderName}：${ctx.priceRef}可以谈，但${ctx.caseRef}挂价${ctx.askPrice}万确实偏高，市场价大概${ctx.marketPrice}万。` },
  { priority: 20, intents: ['discuss_price'], flags: ['highPriceGap'], buildReply: (ctx) => `${ctx.senderName}：价格可以谈，但${ctx.caseRef}挂价${ctx.askPrice}万确实偏高，市场价大概${ctx.marketPrice}万，你得告诉我客户的真实出价。` },
  { priority: 20, intents: ['discuss_price'], playerDetail: 'hasPriceRef', buildReply: (ctx) => `${ctx.senderName}：${ctx.priceRef}可以谈，但你得先告诉我客户的真实出价和${ctx.locRef ? `${ctx.locRef}的` : ''}市场对比。` },
  { priority: 20, intents: ['discuss_price'], buildReply: (ctx) => `${ctx.senderName}：价格可以谈，但你得先告诉我客户的真实出价和${ctx.locRef ? `${ctx.locRef}的` : ''}市场对比。` },

  // Priority 20: intent-based - present_market_evidence
  { priority: 20, intents: ['present_market_evidence'], flags: ['noFirstVisit'], playerDetail: 'actionData', buildReply: (ctx) => `${ctx.senderName}：数据我看了，但${ctx.caseRef}你还没面访过，我不确定这些数据是不是针对这套的。你先来一趟。` },
  { priority: 20, intents: ['present_market_evidence'], flags: ['noFirstVisit'], buildReply: (ctx) => `${ctx.senderName}：你还没来面访过，${ctx.caseRef}的情况我不确定，你先来一趟。` },
  { priority: 20, intents: ['present_market_evidence'], flags: ['lowTrust'], playerDetail: 'actionData', buildReply: (ctx) => `${ctx.senderName}：数据是有了，但你之前说的和实际有出入，${ctx.caseRef}的情况我需要更多依据才能信你。` },
  { priority: 20, intents: ['present_market_evidence'], flags: ['lowTrust'], buildReply: (ctx) => `${ctx.senderName}：你说的我听到了，但${ctx.caseRef}之前有出入，我需要看到具体数据才信你。` },
  { priority: 20, intents: ['present_market_evidence'], ownerProfile: 'assertive', playerDetail: 'hasPriceRef', buildReply: (ctx) => `${ctx.senderName}：${ctx.priceRef}这个数据可以，但${ctx.caseRef}的竞品和客户反馈你得整理一下，我们当面过一遍。` },
  { priority: 20, intents: ['present_market_evidence'], ownerProfile: 'assertive', playerDetail: 'actionData', buildReply: (ctx) => `${ctx.senderName}：竞品数据我看了，${ctx.caseRef}的差异你得摆明白，我们当面过一遍。` },
  { priority: 20, intents: ['present_market_evidence'], ownerProfile: 'assertive', playerDetail: 'actionCustomer', buildReply: (ctx) => `${ctx.senderName}：客户反馈我看了，${ctx.caseRef}的竞品数据你也得整理一下，我们当面过一遍。` },
  { priority: 20, intents: ['present_market_evidence'], ownerProfile: 'assertive', playerDetail: 'actionVisit', buildReply: (ctx) => `${ctx.senderName}：面访完把${ctx.caseRef}的竞品数据和客户反馈整理一下，我看依据再做判断。` },
  { priority: 20, intents: ['present_market_evidence'], ownerProfile: 'assertive', buildReply: (ctx) => `${ctx.senderName}：好，你把${ctx.caseRef}的竞品数据和客户反馈整理一下，我们当面过一遍，我看依据再做判断。` },
  { priority: 20, intents: ['present_market_evidence'], flags: ['isCustomer'], playerDetail: 'actionData', buildReply: (ctx) => `${ctx.senderName}：竞品对比我看了，${ctx.caseRef}的优缺点你再发我一下。` },
  { priority: 20, intents: ['present_market_evidence'], flags: ['isCustomer'], buildReply: (ctx) => `${ctx.senderName}：好，你把${ctx.caseRef}的优缺点和竞品对比发我，我看完再决定。` },
  { priority: 20, intents: ['present_market_evidence'], playerDetail: 'hasPriceRef', buildReply: (ctx) => `${ctx.senderName}：${ctx.priceRef}这个数据我看到了，${ctx.caseRef}的竞品和客户反馈你整理一下，我们当面过一遍。` },
  { priority: 20, intents: ['present_market_evidence'], playerDetail: 'actionData', buildReply: (ctx) => `${ctx.senderName}：竞品数据我看了，${ctx.caseRef}的情况你再补充一下客户反馈，我们当面过一遍。` },
  { priority: 20, intents: ['present_market_evidence'], buildReply: (ctx) => `${ctx.senderName}：好，你把${ctx.caseRef}的竞品和客户反馈整理一下，我们当面过一遍。` },

  // Priority 20: intent-based - follow_customer
  { priority: 20, intents: ['follow_customer'], customerIntentHigh: true, hasCustomerName: true, playerDetail: 'hasTimeRef', buildReply: (ctx) => `${ctx.senderName}：${ctx.timeRef}确认，${ctx.customerName}这边意向不错，${ctx.caseRef}的机会别错过。` },
  { priority: 20, intents: ['follow_customer'], customerIntentHigh: true, hasCustomerName: true, buildReply: (ctx) => `${ctx.senderName}：那你尽快确认，${ctx.customerName}这边意向不错，${ctx.caseRef}的机会别错过。` },
  { priority: 20, intents: ['follow_customer'], hasCustomerName: true, playerDetail: 'hasTimeRef', buildReply: (ctx) => `${ctx.senderName}：${ctx.timeRef}确认，${ctx.customerName}这边时间不确定，${ctx.caseRef}的窗口别错过。` },
  { priority: 20, intents: ['follow_customer'], hasCustomerName: true, buildReply: (ctx) => `${ctx.senderName}：那你尽快确认，${ctx.customerName}这边时间不确定，${ctx.caseRef}的窗口别错过。` },
  { priority: 20, intents: ['follow_customer'], playerDetail: 'hasTimeRef', buildReply: (ctx) => `${ctx.senderName}：${ctx.timeRef}确认，客户这边时间不确定，${ctx.caseRef}的窗口别错过。` },
  { priority: 20, intents: ['follow_customer'], buildReply: (ctx) => `${ctx.senderName}：那你尽快确认，客户这边时间不确定，${ctx.caseRef}的窗口别错过。` },

  // Priority 20: intent-based - promise_feedback
  { priority: 20, intents: ['promise_feedback'], flags: ['lowTrust'], playerDetail: 'actionFeedback', buildReply: (ctx) => `${ctx.senderName}：你说会反馈${ctx.caseRef}的情况，但我需要看到具体动作，不只是口头。` },
  { priority: 20, intents: ['promise_feedback'], flags: ['lowTrust'], buildReply: (ctx) => `${ctx.senderName}：你说会反馈，但${ctx.caseRef}的情况我需要看到具体动作，不只是口头。` },
  { priority: 20, intents: ['promise_feedback'], playerDetail: 'hasTimeRef', buildReply: (ctx) => `${ctx.senderName}：好，${ctx.timeRef}把${ctx.caseRef}的结果发我。` },
  { priority: 20, intents: ['promise_feedback'], buildReply: (ctx) => `${ctx.senderName}：好，那你今天就把${ctx.caseRef}的结果发我，我等你。` },

  // Priority 20: intent-based - align_manager
  { priority: 20, intents: ['align_manager'], playerDetail: 'actionFeedback', buildReply: (ctx) => `${ctx.senderName}：收到，${ctx.caseRef}的情况和风险点你整理一下同步我，今天别散。` },
  { priority: 20, intents: ['align_manager'], playerDetail: 'actionData', buildReply: (ctx) => `${ctx.senderName}：收到，${ctx.caseRef}的情况和风险点你整理一下同步我，今天别散。` },
  { priority: 20, intents: ['align_manager'], buildReply: (ctx) => `${ctx.senderName}：收到，你把${ctx.caseRef}的情况和风险点同步我，今天别散。` },

  // Priority 10: risk-based
  { priority: 10, risks: ['overpromise'], buildReply: (ctx) => `${ctx.senderName}：你这么说太绝对了，${ctx.caseRef}的情况不确定，你得给我一个更稳妥的方案。` },
  { priority: 10, risks: ['empty_comfort'], flags: ['highUrgency'], buildReply: (ctx) => `${ctx.senderName}：${ctx.promiseRef}你这么说太笼统了，${ctx.caseRef}现在需要具体方案，不是安慰。` },
  { priority: 10, risks: ['empty_comfort'], ownerProfile: 'assertive', buildReply: (ctx) => `${ctx.senderName}：${ctx.promiseRef}这话太泛了。${ctx.caseRef}你得告诉我具体怎么做，别只让我再等等。` },
  { priority: 10, risks: ['empty_comfort'], buildReply: (ctx) => `${ctx.senderName}：${ctx.promiseRef}我听到了，但${ctx.caseRef}的情况不够具体，你得告诉我下一步怎么做。` },
  { priority: 10, risks: ['ignores_customer'], buildReply: (ctx) => `${ctx.senderName}：你没回答我的问题，我问的是${ctx.sourceSnippet}，你得正面回应。` },
  { priority: 10, risks: ['missing_next_step'], ownerProfile: 'assertive', buildReply: (ctx) => `${ctx.senderName}：方向可以，但${ctx.caseRef}下一步做什么你没说，我需要明确动作和时间点。` },
  { priority: 10, risks: ['missing_next_step'], buildReply: (ctx) => `${ctx.senderName}：方向可以，但${ctx.caseRef}下一步做什么你没说，我需要明确动作。` },

  // Priority 5: reassure
  { priority: 5, intents: ['reassure'], flags: ['lowTrust'], buildReply: (ctx) => `${ctx.senderName}：我听到了，但${ctx.caseRef}的情况光说没用，${ctx.strategyRef}你得拿出具体动作让我看到变化。` },
  { priority: 5, intents: ['reassure'], ownerProfile: 'anxious', buildReply: (ctx) => `${ctx.senderName}：我能理解，但${ctx.caseRef}我现在最怕一直拖。${ctx.strategyRef}你今天要给我一个明确判断。` },
  { priority: 5, intents: ['reassure'], buildReply: (ctx) => `${ctx.senderName}：收到，${ctx.strategyRef}你把${ctx.caseRef}的关键情况确认清楚，再给我一个明确反馈。` },
];

const MANAGER_REPLY_TABLE: readonly ReplyRule[] = [
  // Priority 100: hostile/offensive
  { priority: 100, risks: ['offensive_reply'], sceneType: 'customer_wechat', buildReply: () => '你这个态度，我就先不跟你聊这套了。' },
  { priority: 100, risks: ['offensive_reply'], sceneType: 'manager_wechat', buildReply: () => '这个态度不行，先把客户和业主稳住。' },
  { priority: 100, risks: ['offensive_reply'], sceneType: 'owner_wechat', buildReply: () => '你要是这个态度，那我没法继续信你了。' },
  { priority: 100, risks: ['offensive_reply'], buildReply: () => '这个态度没法继续配合，先冷静一下。' },
  { priority: 100, intents: ['hostile'], sceneType: 'customer_wechat', buildReply: () => '你这个态度，我就先不跟你聊这套了。' },
  { priority: 100, intents: ['hostile'], sceneType: 'manager_wechat', buildReply: () => '这个态度不行，先把客户和业主稳住。' },
  { priority: 100, intents: ['hostile'], sceneType: 'owner_wechat', buildReply: () => '你要是这个态度，那我没法继续信你了。' },
  { priority: 100, intents: ['hostile'], buildReply: () => '这个态度没法继续配合，先冷静一下。' },
  { priority: 20, intents: ['secure_price_adjustment'], buildReply: (ctx) => `${ctx.senderName}：调价的事你先别急，把${ctx.caseRef}的市场数据和客户反馈拿来，我帮你判断。` },
  { priority: 20, intents: ['propose_face_visit'], playerDetail: 'hasTimeRef', buildReply: (ctx) => `${ctx.senderName}：${ctx.timeRef}面访完把${ctx.caseRef}的结果和风险点同步我。` },
  { priority: 20, intents: ['propose_face_visit'], playerDetail: 'actionData', buildReply: (ctx) => `${ctx.senderName}：好，面访时把${ctx.caseRef}的竞品数据和客户反馈带齐，结果同步我。` },
  { priority: 20, intents: ['propose_face_visit'], playerDetail: 'actionFeedback', buildReply: (ctx) => `${ctx.senderName}：好，面访时把${ctx.caseRef}的竞品数据和客户反馈带齐，结果同步我。` },
  { priority: 20, intents: ['propose_face_visit'], buildReply: (ctx) => `${ctx.senderName}：好，面访完把${ctx.caseRef}的结果和风险点同步我。` },
  { priority: 20, intents: ['discuss_price'], buildReply: (ctx) => `${ctx.senderName}：价格的事你得有依据，${ctx.caseRef}的竞品数据和客户出价你清楚吗？` },
  { priority: 20, intents: ['present_market_evidence'], flags: ['noFirstVisit'], playerDetail: 'actionData', buildReply: (ctx) => `${ctx.senderName}：竞品数据先放一边，${ctx.caseRef}你还没面访过，先把业主关系打牢。` },
  { priority: 20, intents: ['present_market_evidence'], flags: ['noFirstVisit'], playerDetail: 'actionCustomer', buildReply: (ctx) => `${ctx.senderName}：客户反馈先放一边，${ctx.caseRef}你还没面访过，先把业主关系打牢。` },
  { priority: 20, intents: ['present_market_evidence'], flags: ['noFirstVisit'], playerDetail: 'hasPriceRef', buildReply: (ctx) => `${ctx.senderName}：${ctx.priceRef}的数据先放一边，${ctx.caseRef}你还没面访过，先把业主关系打牢。` },
  { priority: 20, intents: ['present_market_evidence'], flags: ['noFirstVisit'], playerDetail: 'actionVisit', buildReply: (ctx) => `${ctx.senderName}：面访是好事，但${ctx.caseRef}你得先把业主关系打牢，再谈数据。` },
  { priority: 20, intents: ['present_market_evidence'], flags: ['noFirstVisit'], buildReply: (ctx) => `${ctx.senderName}：数据先放一边，${ctx.caseRef}你还没面访过，先把业主关系打牢。` },
  { priority: 20, intents: ['present_market_evidence'], flags: ['lowTrust'], playerDetail: 'actionCustomer', buildReply: (ctx) => `${ctx.senderName}：客户反馈我看了，但${ctx.caseRef}的信任基础还不够，你得先稳住业主。` },
  { priority: 20, intents: ['present_market_evidence'], flags: ['lowTrust'], buildReply: (ctx) => `${ctx.senderName}：数据有了，但${ctx.caseRef}的信任基础还不够，你得先稳住业主。` },
  { priority: 20, intents: ['present_market_evidence'], playerDetail: 'hasPriceRef', buildReply: (ctx) => `${ctx.senderName}：${ctx.priceRef}的数据我看了，${ctx.caseRef}的竞品和客户情况你整理一下，我看看有没有风险。` },
  { priority: 20, intents: ['present_market_evidence'], playerDetail: 'actionData', buildReply: (ctx) => `${ctx.senderName}：竞品数据我看了，${ctx.caseRef}的客户情况你补充一下，我看看有没有风险。` },
  { priority: 20, intents: ['present_market_evidence'], buildReply: (ctx) => `${ctx.senderName}：好，${ctx.caseRef}的竞品和客户情况你整理一下，我看看有没有风险。` },
  { priority: 20, intents: ['follow_customer'], buildReply: (ctx) => `${ctx.senderName}：客户跟进别停，${ctx.caseRef}的窗口随时会变。` },
  { priority: 20, intents: ['promise_feedback'], buildReply: (ctx) => `${ctx.senderName}：好，今天把${ctx.caseRef}的结果发我，别拖。` },
  { priority: 20, intents: ['align_manager'], buildReply: (ctx) => `${ctx.senderName}：收到，${ctx.caseRef}的情况和风险点你同步我，今天别散。` },
  { priority: 10, risks: ['overpromise'], buildReply: (ctx) => `${ctx.senderName}：别说绝对话，${ctx.caseRef}的情况你给我一个稳妥方案。` },
  { priority: 10, risks: ['empty_comfort'], flags: ['highUrgency'], buildReply: (ctx) => `${ctx.senderName}：别给我空话，${ctx.caseRef}今天到底抓哪件事，你给我说清楚。` },
  { priority: 10, risks: ['empty_comfort'], buildReply: (ctx) => `${ctx.senderName}：方向可以，但${ctx.caseRef}的具体动作你没说，我需要明确。` },
  { priority: 10, risks: ['ignores_customer'], buildReply: (ctx) => `${ctx.senderName}：你没回答我的问题，${ctx.caseRef}的情况你得正面回应。` },
  { priority: 10, risks: ['missing_next_step'], buildReply: (ctx) => `${ctx.senderName}：${ctx.caseRef}下一步做什么你没说，今天先落到一件事。` },
  { priority: 5, intents: ['reassure'], buildReply: (ctx) => `${ctx.senderName}：收到，${ctx.caseRef}的关键情况你确认清楚再给我反馈。` },
];

const OWNER_REPLY_TABLE_SORTED = [...OWNER_REPLY_TABLE].sort((a, b) => b.priority - a.priority);
const MANAGER_REPLY_TABLE_SORTED = [...MANAGER_REPLY_TABLE].sort((a, b) => b.priority - a.priority);

function buildFallbackRecipientReply(
  intents: readonly ConversationIntentKind[],
  risks: readonly ConversationRiskKind[],
  scene: ConversationSceneInputPack,
) {
  const ctx = buildReplyContext(scene);
  const ownerProfile = resolveOwnerProfile(scene);
  const flags = resolveFlags(scene);
  const isManager = scene.sceneType === 'manager_wechat';
  const table = isManager ? MANAGER_REPLY_TABLE_SORTED : OWNER_REPLY_TABLE_SORTED;
  for (const rule of table) {
    if (matchRule(rule, scene, intents, risks, ctx, ownerProfile, flags)) {
      return rule.buildReply(ctx);
    }
  }
  const variants = buildWechatLocalReplyVariants(scene);
  return variants.neutral;
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
    'hostile',
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
    'offensive_reply',
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
    actionId: fallback.actionId,
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
