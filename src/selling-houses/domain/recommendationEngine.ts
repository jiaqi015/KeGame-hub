import { ACTIONS } from './constants.js';
import {
  deriveCaseProgression,
  getActionStageRelation,
  type CaseProgressPhase,
} from './actionStageRelations.js';
import { getActionAvailability } from './engine/actionResolvers.js';
import type { Case, GameState, Opportunity } from './models.js';
import { readCaseRelationBundleFromRuntime } from '../core/world-state/relationReadProjection.js';
import type { OwnerProfilingMemorySummary } from './ownerProfilingMemoryTypes.js';
import { readOwnerBehaviorDimensions } from './ownerDecisionProfileHelper.js';
import { isCaseActiveByCanonicalStatus } from './caseLifecycleStatusRead.js';
import { isOpportunityActiveByCanonicalState } from './opportunityLifecycleStatusRead.js';

export type CaseRecommendationTier = 'DEFEND' | 'PROGRESS' | 'ACCELERATE';

export type CaseRecommendationPhase = Exclude<CaseProgressPhase, 'sold'>;

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
  /** Authoritative trust from relation bundle (not bare Case field). */
  trust: number;
  /** Authoritative patience from relation bundle (not bare Case field). */
  patience: number;
  /** Authoritative urgency from relation bundle (not bare Case field). */
  urgency: number;
  /** 16-type profiling memory (authoritative owner type source). Null if not yet revealed. */
  profiling: OwnerProfilingMemorySummary | null;
}

export const REC_BALANCE = {
  tierOrder: {
    DEFEND: 0,
    PROGRESS: 1,
    ACCELERATE: 2,
  } as Record<CaseRecommendationTier, number>,
  candidateTierOrder: {
    DEFEND: 0,
    ACCELERATE: 1,
    PROGRESS: 2,
  } as Record<CaseRecommendationTier, number>,
  facts: {
    opportunityStageWeight: 20,
    opportunityConfidenceWeight: 0.25,
    viewingsStage: 3,
    offerStage: 6,
  },
  phase: {
    closingStage: 5,
    feedbackOfferStage: 4,
    showingValidationStage: 3,
  },
  ownerRegret: {
    firstVisitMissingWeight: 40,
    ownerStateHiddenWeight: 26,
    storylineCriticalWeight: 40,
    storylineSlidingWeight: 22,
    windowClosingShortDays: 2,
    windowClosingShortWeight: 34,
    windowClosingMidDays: 4,
    windowClosingMidWeight: 18,
    lowTrustThreshold: 56,
    lowTrustGapDays: 2,
    lowTrustGapWeight: 18,
    relationshipGapLargeDays: 4,
    relationshipGapLargeWeight: 14,
    urgentThreshold: 75,
    urgentGapDays: 2,
    urgentGapWeight: 10,
    gapDecayCoefficient: 2,
    defensePatienceThreshold: 45,
    defenseWindowDays: 4,
    defenseUrgentGapDays: 3,
    defenseLongGapTrustThreshold: 64,
  },
  progressRegret: {
    storyQualityThreshold: 0,
    competitivenessThreshold: 58,
    storyPositioningThinWeight: 14,
    leadEngineThinWeight: 20,
    leadReadyStage: 3,
    leadReadyIntent: 60,
    leadReadyWeight: 16,
    showingFeedbackGapDays: 2,
    showingFeedbackWeight: 16,
    pricingNotAlignedGapPct: 4,
    pricingNotAlignedWeight: 18,
  },
  opportunityRegret: {
    hotOpportunityIntent: 70,
    hotOpportunityDaysLeft: 3,
    hotOpportunityWeight: 26,
    offerReadyWeight: 34,
    lateStageNegotiationWeight: 26,
    lowTrustBlockingIntent: 75,
    lowTrustBlockingTrust: 60,
    lowTrustBlockingWeight: 18,
  },
  actionRegret: {
    firstVisit: 70,
    deepDiagnosis: 28,
    offerNegotiation: 74,
    lateStageNegotiation: 62,
    hotOpportunityLateStage: 68,
    hotOpportunityShowing: 58,
    showingFeedbackDefense: 46,
    showingFeedbackProgress: 30,
    ownerDefenseFeedback: 56,
    ownerLongGapFeedback: 24,
    adjustListingPrice: 54,
    pricingAdvice: 38,
    showing: 48,
    brokerBroadcast: 36,
    xiaohongshuBoost: 30,
    story: 34,
    sinceritySale: 32,
    lightFeedback: 12,
  },
  price: {
    adjustListingGapPct: 6,
    adviceGapPct: 4,
  },
  scoring: {
    primaryActionMultiplier: 0.35,
    defenseSignalWeightThreshold: 30,
    alternativeActionLimit: 2,
  },
};

const TIER_ORDER = REC_BALANCE.tierOrder;

const CANDIDATE_TIER_ORDER = REC_BALANCE.candidateTierOrder;

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

function optionForFirstVisit(
  caseItem: Case,
  profiling: OwnerProfilingMemorySummary | null,
) {
  // Use 16-type profiling dimensions when available (authoritative)
  if (profiling) {
    const priceAnchor = profiling.dimensions.find((d) => d.key === 'price_anchor')?.value;
    const decisionStyle = profiling.dimensions.find((d) => d.key === 'decision_style')?.value;
    // Strong price anchor or guided decision → rapport-first (need trust before data)
    if (priceAnchor === 'strong' || decisionStyle === 'guided_or_joint') {
      return 'rapport-first';
    }
    // High experience + self-decide → data-first (trust evidence)
    const experience = profiling.dimensions.find((d) => d.key === 'transaction_experience')?.value;
    if (experience === 'high' && decisionStyle === 'self_decide') {
      return 'data-first';
    }
  }
  // Default when profiling not available: plan-first (neutral)
  return 'plan-first';
}

function optionForPriceAction(caseItem: Case, profiling: OwnerProfilingMemorySummary | null) {
  // Derive pricing tactic from 16-type profiling dimensions (authoritative)
  if (profiling) {
    const priceAnchor = profiling.dimensions.find((d) => d.key === 'price_anchor')?.value;
    const decisionStyle = profiling.dimensions.find((d) => d.key === 'decision_style')?.value;
    const experience = profiling.dimensions.find((d) => d.key === 'transaction_experience')?.value;
    // Strong anchor or guided decision → hold price, use story
    if (priceAnchor === 'strong' || decisionStyle === 'guided_or_joint') {
      return 'hold-story';
    }
    // Weak anchor + low experience → owner flexible, can cut deeper
    if (priceAnchor === 'weak' && experience === 'low') {
      return 'deep-cut';
    }
  }
  // Default when profiling not available
  return 'small-cut';
}

function hasOwnerDefensePressure(caseItem: Case, facts: CaseRecommendationFacts) {
  return caseItem.storylineState === 'critical'
    || facts.trust < REC_BALANCE.ownerRegret.lowTrustThreshold
    || facts.patience < REC_BALANCE.ownerRegret.defensePatienceThreshold
    || caseItem.windowDays <= REC_BALANCE.ownerRegret.defenseWindowDays
    || (
      facts.ownerGapDays >= REC_BALANCE.ownerRegret.defenseUrgentGapDays
      && facts.urgency >= REC_BALANCE.ownerRegret.urgentThreshold
    )
    || (
      facts.ownerGapDays >= REC_BALANCE.ownerRegret.relationshipGapLargeDays
      && facts.trust < REC_BALANCE.ownerRegret.defenseLongGapTrustThreshold
    );
}

function getCaseFacts(world: GameState, caseItem: Case): CaseRecommendationFacts {
  const opportunities = world.opportunities.filter((entry) => entry.caseId === caseItem.id && isOpportunityActiveByCanonicalState(world, entry));
  const revealedOpportunities = opportunities.filter((entry) => entry.visibility !== 'shadow');
  const hottestOpportunity = revealedOpportunities
    .slice()
    .sort((left, right) => (
      (right.stageIndex * REC_BALANCE.facts.opportunityStageWeight
        + right.intent
        + right.confidence * REC_BALANCE.facts.opportunityConfidenceWeight)
      - (left.stageIndex * REC_BALANCE.facts.opportunityStageWeight
        + left.intent
        + left.confidence * REC_BALANCE.facts.opportunityConfidenceWeight)
    ))[0] || null;
  const highestStage = revealedOpportunities.length
    ? Math.max(...revealedOpportunities.map((entry) => entry.stageIndex))
    : 0;
  // Authoritative read: trust/patience/urgency from relation bundle
  const bundle = readCaseRelationBundleFromRuntime(world, caseItem);
  // Authoritative read: behavioral dimensions from profiling
  const behaviorDims = readOwnerBehaviorDimensions(caseItem);

  return {
    opportunities,
    revealedOpportunities,
    hottestOpportunity,
    highestStage,
    viewings: Math.max(
      caseItem.viewings || 0,
      revealedOpportunities.filter((entry) => entry.stageIndex >= REC_BALANCE.facts.viewingsStage).length,
    ),
    offers: Math.max(
      caseItem.offers || 0,
      revealedOpportunities.filter((entry) => entry.stageIndex >= REC_BALANCE.facts.offerStage).length,
    ),
    ownerGapDays: elapsedDays(world.day, caseItem.lastOwnerTouchedDay),
    trustDecayMultiplier: behaviorDims.trustDecayMultiplier,
    priceGapPct: Number.isFinite(caseItem.priceGapPct)
      ? caseItem.priceGapPct
      : Math.round(((caseItem.askPrice - caseItem.marketPrice) / Math.max(1, caseItem.marketPrice)) * 1000) / 10,
    trust: bundle.trust?.trust ?? caseItem.trust,
    patience: bundle.readiness?.patience ?? caseItem.patience,
    urgency: bundle.readiness?.urgency ?? caseItem.urgency,
    profiling: bundle.ownerProfile.profiling ?? caseItem.ownerProfilingMemory ?? null,
  };
}

function toRecommendationPhase(phase: CaseProgressPhase): CaseRecommendationPhase {
  return phase === 'sold' ? 'closing' : phase;
}

export function deriveCaseRecommendationPhase(world: GameState, caseItem: Case): CaseRecommendationPhase {
  return toRecommendationPhase(deriveCaseProgression(world, caseItem).phase);
}

function addSignal(signals: RecommendationSignal[], kind: RecommendationSignalKind, weight: number, note: string) {
  signals.push({ kind, weight, note });
}

function buildSignals(caseItem: Case, facts: CaseRecommendationFacts, phase: CaseRecommendationPhase): RecommendationSignal[] {
  const signals: RecommendationSignal[] = [];

  if (phase === 'pre_visit') {
    addSignal(signals, 'first-visit-missing', REC_BALANCE.ownerRegret.firstVisitMissingWeight, '首次面访未完成');
    addSignal(signals, 'owner-state-hidden', REC_BALANCE.ownerRegret.ownerStateHiddenWeight, '业主分型和真实目标还不可见');
  }
  if (caseItem.storylineState === 'critical') {
    addSignal(signals, 'owner-trust-eroding', REC_BALANCE.ownerRegret.storylineCriticalWeight, '业主关系已经进入高危区');
  } else if (caseItem.storylineState === 'sliding') {
    addSignal(signals, 'owner-trust-eroding', REC_BALANCE.ownerRegret.storylineSlidingWeight, '业主关系正在走弱');
  }
  if (caseItem.windowDays <= REC_BALANCE.ownerRegret.windowClosingShortDays) {
    addSignal(signals, 'window-closing', REC_BALANCE.ownerRegret.windowClosingShortWeight, '经营窗口只剩两天内');
  } else if (caseItem.windowDays <= REC_BALANCE.ownerRegret.windowClosingMidDays) {
    addSignal(signals, 'window-closing', REC_BALANCE.ownerRegret.windowClosingMidWeight, '经营窗口开始收紧');
  }
  if (facts.trust < REC_BALANCE.ownerRegret.lowTrustThreshold && facts.ownerGapDays >= REC_BALANCE.ownerRegret.lowTrustGapDays) {
    addSignal(signals, 'relationship-gap-large', REC_BALANCE.ownerRegret.lowTrustGapWeight, '业主几天没有收到明确反馈');
  } else if (facts.ownerGapDays >= REC_BALANCE.ownerRegret.relationshipGapLargeDays) {
    addSignal(signals, 'relationship-gap-large', REC_BALANCE.ownerRegret.relationshipGapLargeWeight, '业主反馈空窗偏长');
  }
  if (facts.ownerGapDays >= REC_BALANCE.ownerRegret.urgentGapDays && facts.urgency >= REC_BALANCE.ownerRegret.urgentThreshold) {
    addSignal(signals, 'relationship-gap-large', REC_BALANCE.ownerRegret.urgentGapWeight, '业主着急度高且反馈空窗已出现');
  }
  if (
    caseItem.qualityStory <= REC_BALANCE.progressRegret.storyQualityThreshold
    || caseItem.competitiveness < REC_BALANCE.progressRegret.competitivenessThreshold
  ) {
    addSignal(signals, 'story-positioning-thin', REC_BALANCE.progressRegret.storyPositioningThinWeight, '房源讲法或竞争力还没站稳');
  }
  if (facts.revealedOpportunities.length === 0 && phase !== 'pre_visit') {
    addSignal(signals, 'lead-engine-thin', REC_BALANCE.progressRegret.leadEngineThinWeight, '还没有稳定接上的客户线');
  }
  if (facts.revealedOpportunities.some((entry) => (
    entry.stageIndex < REC_BALANCE.progressRegret.leadReadyStage
    && entry.intent >= REC_BALANCE.progressRegret.leadReadyIntent
  ))) {
    addSignal(signals, 'lead-ready-for-showing', REC_BALANCE.progressRegret.leadReadyWeight, '客户意向已到真实看房前');
  }
  if (facts.viewings > 0 && facts.ownerGapDays >= REC_BALANCE.progressRegret.showingFeedbackGapDays) {
    addSignal(signals, 'showing-feedback-ready', REC_BALANCE.progressRegret.showingFeedbackWeight, '已有看房事实，业主侧缺一次同步');
  }
  if (
    facts.hottestOpportunity
    && facts.hottestOpportunity.intent >= REC_BALANCE.opportunityRegret.hotOpportunityIntent
    && facts.hottestOpportunity.daysLeft <= REC_BALANCE.opportunityRegret.hotOpportunityDaysLeft
  ) {
    addSignal(signals, 'hot-opportunity-expiring', REC_BALANCE.opportunityRegret.hotOpportunityWeight, '高意向客户快要流失');
  }
  if (facts.offers > 0 || facts.highestStage >= REC_BALANCE.facts.offerStage) {
    addSignal(signals, 'offer-ready-for-negotiation', REC_BALANCE.opportunityRegret.offerReadyWeight, '客户已经进入出价前后');
  } else if (facts.highestStage >= REC_BALANCE.phase.closingStage) {
    addSignal(signals, 'offer-ready-for-negotiation', REC_BALANCE.opportunityRegret.lateStageNegotiationWeight, '客户已经进入见面沟通阶段');
  }
  if (facts.priceGapPct > REC_BALANCE.progressRegret.pricingNotAlignedGapPct) {
    addSignal(signals, 'pricing-not-aligned', REC_BALANCE.progressRegret.pricingNotAlignedWeight, '挂牌价和市场价差距偏大');
  }
  if (
    facts.hottestOpportunity
    && facts.hottestOpportunity.intent >= REC_BALANCE.opportunityRegret.lowTrustBlockingIntent
    && facts.trust < REC_BALANCE.opportunityRegret.lowTrustBlockingTrust
  ) {
    addSignal(signals, 'low-trust-blocking-deal', REC_BALANCE.opportunityRegret.lowTrustBlockingWeight, '高意向客户可能被业主信任不足卡住');
  }

  const gapWeight = Math.round(facts.ownerGapDays * facts.trustDecayMultiplier * REC_BALANCE.ownerRegret.gapDecayCoefficient);
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

function candidateMatchesActionStageRelation(
  entry: CandidateAction,
  facts: CaseRecommendationFacts,
  phase: CaseRecommendationPhase,
) {
  const relation = getActionStageRelation(entry.actionId);
  if (!relation) {
    return false;
  }
  if (!relation.phaseIds.includes(phase)) {
    return false;
  }
  if (relation.availabilityKind !== 'opportunity-bound' || !relation.opportunityStageWindow) {
    return true;
  }
  const { min, max } = relation.opportunityStageWindow;
  return facts.revealedOpportunities.some((opportunity) =>
    opportunity.stageIndex >= min && opportunity.stageIndex <= max);
}

function buildActionCandidates(
  world: GameState,
  caseItem: Case,
  facts: CaseRecommendationFacts,
  phase: CaseRecommendationPhase,
): CandidateAction[] {
  const candidates: CandidateAction[] = [];
  const hottestOpportunity = facts.hottestOpportunity;
  const ownerDefensePressure = hasOwnerDefensePressure(caseItem, facts);

  if (phase === 'pre_visit') {
    candidates.push(candidate(
      'first-visit',
      '这套房还没完成业主分型，真实目标暂不可见。',
      REC_BALANCE.actionRegret.firstVisit,
      'PROGRESS',
      ['first-visit-missing', 'owner-state-hidden'],
      optionForFirstVisit(caseItem, facts.profiling),
    ));
    candidates.push(candidate(
      'deep-diagnosis',
      '基础事实还没梳理完整，诊断后事实链更完整。',
      REC_BALANCE.actionRegret.deepDiagnosis,
      'PROGRESS',
      ['first-visit-missing'],
    ));
  }

  if (facts.offers > 0 || facts.highestStage >= REC_BALANCE.facts.offerStage) {
    candidates.push(candidate(
      'invite-customer-negotiation',
      `${hottestOpportunity?.customerName || '客户'}已到出价前后，价格和成交条件已到谈判桌。`,
      REC_BALANCE.actionRegret.offerNegotiation,
      'ACCELERATE',
      ['offer-ready-for-negotiation', 'hot-opportunity-expiring'],
      'balanced',
    ));
  } else if (facts.highestStage >= REC_BALANCE.phase.closingStage) {
    candidates.push(candidate(
      'invite-customer-negotiation',
      `${hottestOpportunity?.customerName || '客户'}已到见面沟通阶段，谈判条件开始变清楚。`,
      REC_BALANCE.actionRegret.lateStageNegotiation,
      'ACCELERATE',
      ['offer-ready-for-negotiation'],
      'balanced',
    ));
  }

  if (
    hottestOpportunity
    && hottestOpportunity.intent >= REC_BALANCE.opportunityRegret.hotOpportunityIntent
    && hottestOpportunity.daysLeft <= REC_BALANCE.opportunityRegret.hotOpportunityDaysLeft
    && !hottestOpportunity.pendingClosingEvaluation
  ) {
    candidates.push(candidate(
      hottestOpportunity.stageIndex >= REC_BALANCE.phase.feedbackOfferStage ? 'invite-customer-negotiation' : 'showing',
      `${hottestOpportunity.customerName} 已到${hottestOpportunity.stageLabel}，剩余时间不多。`,
      hottestOpportunity.stageIndex >= REC_BALANCE.phase.feedbackOfferStage
        ? REC_BALANCE.actionRegret.hotOpportunityLateStage
        : REC_BALANCE.actionRegret.hotOpportunityShowing,
      'DEFEND',
      ['hot-opportunity-expiring'],
      hottestOpportunity.stageIndex >= REC_BALANCE.phase.feedbackOfferStage ? 'balanced' : undefined,
    ));
  }

  if (facts.viewings > 0 && facts.ownerGapDays >= REC_BALANCE.progressRegret.showingFeedbackGapDays) {
    candidates.push(candidate(
      'weekly-feedback',
      '已有看房反馈，业主侧同步材料已形成。',
      ownerDefensePressure
        ? REC_BALANCE.actionRegret.showingFeedbackDefense
        : REC_BALANCE.actionRegret.showingFeedbackProgress,
      ownerDefensePressure ? 'DEFEND' : 'PROGRESS',
      ['showing-feedback-ready', 'relationship-gap-large'],
    ));
  }

  if (ownerDefensePressure || facts.ownerGapDays >= REC_BALANCE.ownerRegret.relationshipGapLargeDays) {
    candidates.push(candidate(
      caseItem.hasCompletedFirstVisit ? 'weekly-feedback' : 'first-visit',
      caseItem.hasCompletedFirstVisit
        ? ownerDefensePressure
          ? '业主关系有些发紧，事实反馈已形成同步材料。'
          : '业主有一段时间没收到反馈，轻量同步已有事实基础。'
        : '这套房还没完成业主分型，真实目标暂不可见。',
      ownerDefensePressure
        ? REC_BALANCE.actionRegret.ownerDefenseFeedback
        : REC_BALANCE.actionRegret.ownerLongGapFeedback,
      ownerDefensePressure ? 'DEFEND' : 'PROGRESS',
      ['owner-trust-eroding', 'relationship-gap-large', 'window-closing'],
      caseItem.hasCompletedFirstVisit ? undefined : optionForFirstVisit(caseItem, facts.profiling),
    ));
  }

  if (facts.priceGapPct > REC_BALANCE.price.adjustListingGapPct && (phase === 'feedback_offer' || phase === 'closing')) {
    candidates.push(candidate(
      'adjust-listing-price',
      '客户已到谈价阶段，价格差距还卡着成交，挂牌调整已有依据。',
      REC_BALANCE.actionRegret.adjustListingPrice,
      'PROGRESS',
      ['pricing-not-aligned', 'offer-ready-for-negotiation'],
      optionForPriceAction(caseItem, facts.profiling),
    ));
  } else if (facts.priceGapPct > REC_BALANCE.price.adviceGapPct) {
    candidates.push(candidate(
      'pricing-advice',
      '挂牌价和市场反馈有差距，价格站位待补清楚。',
      REC_BALANCE.actionRegret.pricingAdvice,
      'PROGRESS',
      ['pricing-not-aligned'],
    ));
  }

  if (facts.revealedOpportunities.some((entry) => (
    entry.stageIndex < REC_BALANCE.progressRegret.leadReadyStage
    && entry.intent >= REC_BALANCE.progressRegret.leadReadyIntent
  ))) {
    candidates.push(candidate(
      'showing',
      '客户意向已经到可带看状态，线上兴趣可转成真实反馈。',
      REC_BALANCE.actionRegret.showing,
      'PROGRESS',
      ['lead-ready-for-showing'],
    ));
  }

  if (facts.revealedOpportunities.length === 0 && phase !== 'pre_visit') {
    candidates.push(candidate(
      'broker-broadcast',
      '这套房客户线偏薄，合作经纪人可补一批待确认客户。',
      REC_BALANCE.actionRegret.brokerBroadcast,
      'PROGRESS',
      ['lead-engine-thin'],
    ));
    candidates.push(candidate(
      'xiaohongshu-boost',
      '当前承接偏薄，公开曝光可补新客。',
      REC_BALANCE.actionRegret.xiaohongshuBoost,
      'PROGRESS',
      ['lead-engine-thin'],
    ));
  }

  if (
    (
      caseItem.qualityStory <= REC_BALANCE.progressRegret.storyQualityThreshold
      || caseItem.competitiveness < REC_BALANCE.progressRegret.competitivenessThreshold
    )
    && phase !== 'pre_visit'
  ) {
    candidates.push(candidate(
      'story',
      '房源讲法还没站稳，卖点和看房路径待重组。',
      REC_BALANCE.actionRegret.story,
      'PROGRESS',
      ['story-positioning-thin'],
    ));
  }

  if (
    facts.hottestOpportunity
    && facts.hottestOpportunity.stageIndex >= REC_BALANCE.phase.showingValidationStage
    && facts.hottestOpportunity.stageIndex < REC_BALANCE.phase.closingStage
  ) {
    candidates.push(candidate(
      'sincerity-sale',
      `${facts.hottestOpportunity.customerName} 已看过房，诚意和价格边界已有沟通基础。`,
      REC_BALANCE.actionRegret.sinceritySale,
      'ACCELERATE',
      ['showing-feedback-ready'],
    ));
  }

  candidates.push(candidate(
    caseItem.hasCompletedFirstVisit ? 'weekly-feedback' : 'first-visit',
    caseItem.hasCompletedFirstVisit
      ? '业主有一段时间没收到反馈，轻量同步已有事实基础。'
      : '这套房还没完成业主分型，真实目标暂不可见。',
    REC_BALANCE.actionRegret.lightFeedback,
    caseItem.hasCompletedFirstVisit ? 'PROGRESS' : 'PROGRESS',
    caseItem.hasCompletedFirstVisit ? ['relationship-gap-large'] : ['first-visit-missing'],
    caseItem.hasCompletedFirstVisit ? undefined : optionForFirstVisit(caseItem, facts.profiling),
  ));

  return candidates
    .filter((entry) => candidateMatchesActionStageRelation(entry, facts, phase))
    .sort((left, right) => {
      if (CANDIDATE_TIER_ORDER[left.tier] !== CANDIDATE_TIER_ORDER[right.tier]) {
        return CANDIDATE_TIER_ORDER[left.tier] - CANDIDATE_TIER_ORDER[right.tier];
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
      .slice(0, REC_BALANCE.scoring.alternativeActionLimit),
  };
}

function scoreRecommendation(signals: RecommendationSignal[], primary: CandidateAction) {
  const signalScore = signals
    .filter((entry) => primary.signalKinds.includes(entry.kind))
    .reduce((sum, entry) => sum + entry.weight, 0);
  return Math.max(
    primary.estimatedRegretReduction,
    signalScore + primary.estimatedRegretReduction * REC_BALANCE.scoring.primaryActionMultiplier,
  );
}

function deriveRecommendationTier(signals: RecommendationSignal[], primary: CandidateAction): CaseRecommendationTier {
  if (primary.tier === 'DEFEND') return 'DEFEND';
  if (signals.some((entry) => (
    (entry.kind === 'owner-trust-eroding' || entry.kind === 'window-closing')
    && entry.weight >= REC_BALANCE.scoring.defenseSignalWeightThreshold
  ))) {
    return 'DEFEND';
  }
  if (primary.tier === 'ACCELERATE') return 'ACCELERATE';
  return 'PROGRESS';
}

function buildRecommendation(world: GameState, caseItem: Case): CaseRecommendation | null {
  if (!isCaseActiveByCanonicalStatus(world, caseItem)) {
    return null;
  }

  const facts = getCaseFacts(world, caseItem);
  const phase = deriveCaseRecommendationPhase(world, caseItem);
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
