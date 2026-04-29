import { ACTIONS } from './constants.js';
import { getActionAvailability } from './engine/actionResolvers.js';
import type { Case, GameState, Opportunity } from './models.js';

export type CaseRecommendationTier = 'DEFEND' | 'PROGRESS' | 'ACCELERATE';

export type CaseRecommendationPhase =
  | 'pre_visit'
  | 'positioning'
  | 'lead_building'
  | 'showing_validation'
  | 'feedback_offer'
  | 'closing';

export type RecommendationSignalKind =
  | 'first-visit-missing'
  | 'owner-state-hidden'
  | 'owner-trust-eroding'
  | 'relationship-gap-large'
  | 'window-closing'
  | 'story-positioning-thin'
  | 'lead-engine-thin'
  | 'lead-ready-for-showing'
  | 'showing-feedback-ready'
  | 'hot-opportunity-expiring'
  | 'offer-ready-for-negotiation'
  | 'pricing-not-aligned'
  | 'low-trust-blocking-deal';

export interface RecommendationSignal {
  kind: RecommendationSignalKind;
  weight: number;
  note: string;
}

export interface CaseRecommendationAction {
  actionId: string;
  optionId?: string;
  estimatedRegretReduction: number;
  reason: string;
}

export interface CaseRecommendation {
  caseId: string;
  tier: CaseRecommendationTier;
  phase: CaseRecommendationPhase;
  regret: number;
  reason: string;
  signals: RecommendationSignal[];
  primaryAction: CaseRecommendationAction;
  alternativeActions: CaseRecommendationAction[];
}

type CandidateAction = CaseRecommendationAction & {
  tier: CaseRecommendationTier;
  signalKinds: RecommendationSignalKind[];
};

interface CaseRecommendationFacts {
  opportunities: Opportunity[];
  revealedOpportunities: Opportunity[];
  hottestOpportunity: Opportunity | null;
  highestStage: number;
  viewings: number;
  offers: number;
  ownerGapDays: number;
  trustDecayMultiplier: number;
  priceGapPct: number;
}

const TIER_ORDER: Record<CaseRecommendationTier, number> = {
  DEFEND: 0,
  PROGRESS: 1,
  ACCELERATE: 2,
};

const ACTION_RELATION_KIND = {
  alwaysAvailable: 'always-available',
  phaseMain: 'phase-main',
  phaseSupport: 'phase-support',
  maintenance: 'maintenance',
  rescue: 'rescue',
} as const;

function elapsedDays(currentDay: number, lastTouchedDay: number) {
  if (!lastTouchedDay || lastTouchedDay <= 0) {
    return Math.max(1, currentDay);
  }
  return Math.max(0, currentDay - lastTouchedDay);
}

function optionForFirstVisit(caseItem: Case) {
  if (caseItem.ownerArchetypeId === 'anxious' || caseItem.ownerArchetypeId === 'trial-balloon') {
    return 'rapport-first';
  }
  if (caseItem.ownerArchetypeId === 'game-player') {
    return 'data-first';
  }
  return 'plan-first';
}

function optionForPriceAction(world: GameState, caseItem: Case) {
  const archetype = world.runContext.scenarioSnapshot.world.ownerArchetypes
    .find((entry) => entry.id === caseItem.ownerArchetypeId);
  return archetype?.preferredTactic || 'small-cut';
}

function getCaseFacts(world: GameState, caseItem: Case): CaseRecommendationFacts {
  const opportunities = world.opportunities.filter((entry) => entry.caseId === caseItem.id && entry.status === 'active');
  const revealedOpportunities = opportunities.filter((entry) => entry.visibility !== 'shadow');
  const hottestOpportunity = revealedOpportunities
    .slice()
    .sort((left, right) => (
      (right.stageIndex * 20 + right.intent + right.confidence * 0.25)
      - (left.stageIndex * 20 + left.intent + left.confidence * 0.25)
    ))[0] || null;
  const highestStage = revealedOpportunities.length
    ? Math.max(...revealedOpportunities.map((entry) => entry.stageIndex))
    : 0;
  const ownerArchetype = world.runContext.scenarioSnapshot.world.ownerArchetypes
    .find((entry) => entry.id === caseItem.ownerArchetypeId);

  return {
    opportunities,
    revealedOpportunities,
    hottestOpportunity,
    highestStage,
    viewings: Math.max(
      caseItem.viewings || 0,
      revealedOpportunities.filter((entry) => entry.stageIndex >= 3).length,
    ),
    offers: Math.max(
      caseItem.offers || 0,
      revealedOpportunities.filter((entry) => entry.stageIndex >= 6).length,
    ),
    ownerGapDays: elapsedDays(world.day, caseItem.lastOwnerTouchedDay),
    trustDecayMultiplier: ownerArchetype?.trustDecayMultiplier || 1,
    priceGapPct: Number.isFinite(caseItem.priceGapPct)
      ? caseItem.priceGapPct
      : Math.round(((caseItem.askPrice - caseItem.marketPrice) / Math.max(1, caseItem.marketPrice)) * 1000) / 10,
  };
}

export function deriveCaseRecommendationPhase(caseItem: Case, facts: CaseRecommendationFacts): CaseRecommendationPhase {
  if (!caseItem.hasCompletedFirstVisit) {
    return 'pre_visit';
  }
  if (
    facts.hottestOpportunity?.pendingClosingEvaluation
    || facts.highestStage >= 5
  ) {
    return 'closing';
  }
  if (
    facts.offers > 0
    || facts.highestStage >= 4
  ) {
    return 'feedback_offer';
  }
  if (
    facts.viewings > 0
    || facts.highestStage >= 3
  ) {
    return 'showing_validation';
  }
  if (facts.revealedOpportunities.length > 0) {
    return 'lead_building';
  }
  return 'positioning';
}

function addSignal(signals: RecommendationSignal[], kind: RecommendationSignalKind, weight: number, note: string) {
  signals.push({ kind, weight, note });
}

function buildSignals(caseItem: Case, facts: CaseRecommendationFacts, phase: CaseRecommendationPhase): RecommendationSignal[] {
  const signals: RecommendationSignal[] = [];

  if (phase === 'pre_visit') {
    addSignal(signals, 'first-visit-missing', 40, '首次面访未完成');
    addSignal(signals, 'owner-state-hidden', 26, '业主分型和真实目标还不可见');
  }
  if (caseItem.storylineState === 'critical') {
    addSignal(signals, 'owner-trust-eroding', 40, '业主关系已经进入高危区');
  } else if (caseItem.storylineState === 'sliding') {
    addSignal(signals, 'owner-trust-eroding', 22, '业主关系正在走弱');
  }
  if (caseItem.windowDays <= 2) {
    addSignal(signals, 'window-closing', 34, '经营窗口只剩两天内');
  } else if (caseItem.windowDays <= 4) {
    addSignal(signals, 'window-closing', 18, '经营窗口开始收紧');
  }
  if (caseItem.trust < 56 && facts.ownerGapDays >= 2) {
    addSignal(signals, 'relationship-gap-large', 18, '业主几天没有收到明确反馈');
  } else if (facts.ownerGapDays >= 4) {
    addSignal(signals, 'relationship-gap-large', 14, '业主反馈空窗偏长');
  }
  if (facts.ownerGapDays >= 2 && caseItem.urgency >= 75) {
    addSignal(signals, 'relationship-gap-large', 10, '业主着急度高且反馈空窗已出现');
  }
  if (caseItem.qualityStory <= 0 || caseItem.competitiveness < 58) {
    addSignal(signals, 'story-positioning-thin', 14, '房源讲法或竞争力还没站稳');
  }
  if (facts.revealedOpportunities.length === 0 && phase !== 'pre_visit') {
    addSignal(signals, 'lead-engine-thin', 20, '还没有稳定接上的客户线');
  }
  if (facts.revealedOpportunities.some((entry) => entry.stageIndex < 3 && entry.intent >= 60)) {
    addSignal(signals, 'lead-ready-for-showing', 16, '已有客户适合推进到真实看房');
  }
  if (facts.viewings > 0 && facts.ownerGapDays >= 2) {
    addSignal(signals, 'showing-feedback-ready', 16, '已有看房事实还需要回传给业主');
  }
  if (facts.hottestOpportunity && facts.hottestOpportunity.intent >= 70 && facts.hottestOpportunity.daysLeft <= 2) {
    addSignal(signals, 'hot-opportunity-expiring', 26, '高意向客户快要流失');
  }
  if (facts.offers > 0 || facts.highestStage >= 6) {
    addSignal(signals, 'offer-ready-for-negotiation', 34, '客户已经进入出价前后');
  } else if (facts.highestStage >= 5) {
    addSignal(signals, 'offer-ready-for-negotiation', 26, '客户已经进入见面沟通阶段');
  }
  if (facts.priceGapPct > 4) {
    addSignal(signals, 'pricing-not-aligned', 18, '挂牌价和市场价差距偏大');
  }
  if (facts.hottestOpportunity && facts.hottestOpportunity.intent >= 75 && caseItem.trust < 60) {
    addSignal(signals, 'low-trust-blocking-deal', 18, '高意向客户可能被业主信任不足卡住');
  }

  const gapWeight = Math.round(facts.ownerGapDays * facts.trustDecayMultiplier * 2);
  if (gapWeight > 0) {
    addSignal(signals, 'relationship-gap-large', gapWeight, '业主空窗随时间自然放大');
  }

  return signals.sort((left, right) => right.weight - left.weight);
}

function actionIsKnown(actionId: string) {
  return ACTIONS.some((entry) => entry.id === actionId || entry.executorId === actionId);
}

function actionIsAvailable(world: GameState, caseItem: Case, actionId: string) {
  return actionIsKnown(actionId) && getActionAvailability(world, caseItem, actionId).enabled;
}

function candidate(
  actionId: string,
  reason: string,
  estimatedRegretReduction: number,
  tier: CaseRecommendationTier,
  signalKinds: RecommendationSignalKind[],
  optionId?: string,
): CandidateAction {
  return {
    actionId,
    optionId,
    reason,
    estimatedRegretReduction,
    tier,
    signalKinds,
  };
}

function buildActionCandidates(
  world: GameState,
  caseItem: Case,
  facts: CaseRecommendationFacts,
  phase: CaseRecommendationPhase,
): CandidateAction[] {
  const candidates: CandidateAction[] = [];
  const hottestOpportunity = facts.hottestOpportunity;

  if (phase === 'pre_visit') {
    candidates.push(candidate(
      'first-visit',
      '这套房还没建立经营共识，需要做业主分型，今天先把业主目标和下一步讲清楚。',
      70,
      'PROGRESS',
      ['first-visit-missing', 'owner-state-hidden'],
      optionForFirstVisit(caseItem),
    ));
    candidates.push(candidate(
      'deep-diagnosis',
      '这套房的基础事实还没梳理清楚，可以先做一次诊断补齐判断。',
      28,
      'PROGRESS',
      ['first-visit-missing'],
    ));
  }

  if (facts.offers > 0 || facts.highestStage >= 6) {
    candidates.push(candidate(
      'invite-customer-negotiation',
      `${hottestOpportunity?.customerName || '客户'}已经进入出价前后，今天要把价格和成交条件拉到一张桌上。`,
      74,
      'ACCELERATE',
      ['offer-ready-for-negotiation', 'hot-opportunity-expiring'],
      'balanced',
    ));
  } else if (facts.highestStage >= 5) {
    candidates.push(candidate(
      'invite-customer-negotiation',
      `${hottestOpportunity?.customerName || '客户'}已经进入见面沟通阶段，今天适合推进到明确谈判。`,
      62,
      'ACCELERATE',
      ['offer-ready-for-negotiation'],
      'balanced',
    ));
  }

  if (hottestOpportunity && hottestOpportunity.intent >= 70 && hottestOpportunity.daysLeft <= 2 && !hottestOpportunity.pendingClosingEvaluation) {
    candidates.push(candidate(
      hottestOpportunity.stageIndex >= 4 ? 'invite-customer-negotiation' : 'showing',
      `${hottestOpportunity.customerName} 已经到${hottestOpportunity.stageLabel}，但剩余时间很短，今天要接住这条客户线。`,
      58,
      'DEFEND',
      ['hot-opportunity-expiring'],
      hottestOpportunity.stageIndex >= 4 ? 'balanced' : undefined,
    ));
  }

  if (facts.viewings > 0 && facts.ownerGapDays >= 2) {
    candidates.push(candidate(
      'weekly-feedback',
      '已有看房反馈，但业主还没收到明确进展，今天适合补一次反馈。',
      46,
      'DEFEND',
      ['showing-feedback-ready', 'relationship-gap-large'],
    ));
  }

  if (caseItem.trust < 56 || caseItem.patience < 45 || facts.ownerGapDays >= 4 || caseItem.windowDays <= 4) {
    candidates.push(candidate(
      caseItem.hasCompletedFirstVisit ? 'weekly-feedback' : 'first-visit',
      caseItem.hasCompletedFirstVisit
        ? '业主关系已经有点发紧，今天先用事实反馈稳住授权。'
        : '这套房还没建立经营共识，需要做业主分型，今天先把业主目标和下一步讲清楚。',
      56,
      'DEFEND',
      ['owner-trust-eroding', 'relationship-gap-large', 'window-closing'],
      caseItem.hasCompletedFirstVisit ? undefined : optionForFirstVisit(caseItem),
    ));
  }

  if (facts.priceGapPct > 6 && (phase === 'feedback_offer' || phase === 'closing')) {
    candidates.push(candidate(
      'adjust-listing-price',
      '客户已经推进到后段，但价格差距还在卡成交，需要和业主商量挂牌价调整。',
      54,
      'PROGRESS',
      ['pricing-not-aligned', 'offer-ready-for-negotiation'],
      optionForPriceAction(world, caseItem),
    ));
  } else if (facts.priceGapPct > 4) {
    candidates.push(candidate(
      'pricing-advice',
      '挂牌价和市场反馈有差距，今天适合先把价格站位讲清楚。',
      38,
      'PROGRESS',
      ['pricing-not-aligned'],
    ));
  }

  if (facts.revealedOpportunities.some((entry) => entry.stageIndex < 3 && entry.intent >= 60)) {
    candidates.push(candidate(
      'showing',
      '已有客户进入可带看的状态，今天要把线上意向变成真实反馈。',
      48,
      'PROGRESS',
      ['lead-ready-for-showing'],
    ));
  }

  if (facts.revealedOpportunities.length === 0 && phase !== 'pre_visit') {
    candidates.push(candidate(
      'broker-broadcast',
      '这套房现在缺稳定客户线，可以先通过合作经纪人补一批待确认客户。',
      36,
      'PROGRESS',
      ['lead-engine-thin'],
    ));
    candidates.push(candidate(
      'xiaohongshu-boost',
      '这套房当前承接偏薄，可以补一轮公开曝光拉新客。',
      30,
      'PROGRESS',
      ['lead-engine-thin'],
    ));
  }

  if ((caseItem.qualityStory <= 0 || caseItem.competitiveness < 58) && phase !== 'pre_visit') {
    candidates.push(candidate(
      'story',
      '房源讲法还没站稳，今天适合先把卖点和看房路径重新组织一下。',
      34,
      'PROGRESS',
      ['story-positioning-thin'],
    ));
  }

  if (facts.hottestOpportunity && facts.hottestOpportunity.stageIndex >= 3 && facts.hottestOpportunity.stageIndex < 5) {
    candidates.push(candidate(
      'sincerity-sale',
      `${facts.hottestOpportunity.customerName} 已经看过房，可以尝试把诚意和价格边界往前推。`,
      32,
      'ACCELERATE',
      ['showing-feedback-ready'],
    ));
  }

  candidates.push(candidate(
    caseItem.hasCompletedFirstVisit ? 'weekly-feedback' : 'first-visit',
    caseItem.hasCompletedFirstVisit
      ? '今天可以补一次轻量反馈，保持业主和经营节奏不断线。'
      : '这套房还没建立经营共识，需要做业主分型，今天先把业主目标和下一步讲清楚。',
    12,
    caseItem.hasCompletedFirstVisit ? 'PROGRESS' : 'PROGRESS',
    caseItem.hasCompletedFirstVisit ? ['relationship-gap-large'] : ['first-visit-missing'],
    caseItem.hasCompletedFirstVisit ? undefined : optionForFirstVisit(caseItem),
  ));

  return candidates
    .sort((left, right) => {
      if (TIER_ORDER[left.tier] !== TIER_ORDER[right.tier]) {
        return TIER_ORDER[left.tier] - TIER_ORDER[right.tier];
      }
      return right.estimatedRegretReduction - left.estimatedRegretReduction;
    })
    .filter((entry, index, list) => list.findIndex((candidateEntry) => (
      candidateEntry.actionId === entry.actionId
      && candidateEntry.optionId === entry.optionId
    )) === index);
}

function pickPrimaryAction(
  world: GameState,
  caseItem: Case,
  candidates: CandidateAction[],
): { primary: CandidateAction; alternatives: CandidateAction[] } | null {
  const available = candidates.filter((entry) => actionIsAvailable(world, caseItem, entry.actionId));
  const primary = available[0] || null;
  if (!primary) {
    return null;
  }
  return {
    primary,
    alternatives: available
      .filter((entry) => entry !== primary)
      .slice(0, 2),
  };
}

function scoreRecommendation(signals: RecommendationSignal[], primary: CandidateAction) {
  const signalScore = signals
    .filter((entry) => primary.signalKinds.includes(entry.kind))
    .reduce((sum, entry) => sum + entry.weight, 0);
  return Math.max(primary.estimatedRegretReduction, signalScore + primary.estimatedRegretReduction * 0.35);
}

function deriveRecommendationTier(signals: RecommendationSignal[], primary: CandidateAction): CaseRecommendationTier {
  if (primary.tier === 'DEFEND') return 'DEFEND';
  if (signals.some((entry) => (
    (entry.kind === 'owner-trust-eroding' || entry.kind === 'window-closing')
    && entry.weight >= 30
  ))) {
    return 'DEFEND';
  }
  if (primary.tier === 'ACCELERATE') return 'ACCELERATE';
  return 'PROGRESS';
}

function buildRecommendation(world: GameState, caseItem: Case): CaseRecommendation | null {
  if (caseItem.status !== 'active') {
    return null;
  }

  const facts = getCaseFacts(world, caseItem);
  const phase = deriveCaseRecommendationPhase(caseItem, facts);
  const signals = buildSignals(caseItem, facts, phase);
  const actionPick = pickPrimaryAction(world, caseItem, buildActionCandidates(world, caseItem, facts, phase));
  if (!actionPick) {
    return null;
  }

  const tier = deriveRecommendationTier(signals, actionPick.primary);
  return {
    caseId: caseItem.id,
    tier,
    phase,
    regret: Math.round(scoreRecommendation(signals, actionPick.primary)),
    reason: actionPick.primary.reason,
    signals,
    primaryAction: {
      actionId: actionPick.primary.actionId,
      optionId: actionPick.primary.optionId,
      estimatedRegretReduction: actionPick.primary.estimatedRegretReduction,
      reason: actionPick.primary.reason,
    },
    alternativeActions: actionPick.alternatives.map((entry) => ({
      actionId: entry.actionId,
      optionId: entry.optionId,
      estimatedRegretReduction: entry.estimatedRegretReduction,
      reason: entry.reason,
    })),
  };
}

export function deriveCaseRecommendations(world: GameState): CaseRecommendation[] {
  return world.cases
    .map((caseItem) => buildRecommendation(world, caseItem))
    .filter((entry): entry is CaseRecommendation => Boolean(entry))
    .sort((left, right) => {
      if (TIER_ORDER[left.tier] !== TIER_ORDER[right.tier]) {
        return TIER_ORDER[left.tier] - TIER_ORDER[right.tier];
      }
      return right.regret - left.regret;
    });
}

export const CASE_ACTION_RELATION_KIND = ACTION_RELATION_KIND;
