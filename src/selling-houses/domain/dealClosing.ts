import {
  claimPlayerMarketDealSlot,
  ensureMarketOutcomeState,
  getAvailableMarketDealSlots,
  getPlayerAllowedMarketDeals,
} from './models.js';
import type {
  Case,
  ClosedDealRecord,
  DealClosingEvaluation,
  EvaluationSourceTrace,
  EvidenceChainTrace,
  BlockingReasonCategory,
  GameState,
  Opportunity,
} from './models.js';
import { BALANCE } from './config/balance.js';
import { recordBudgetChange } from './budget.js';
import { applyAuxiliaryStats } from './runtimeStats.js';
import { logEvent, recordDomainEvent } from './runtimeState.js';
import { closeOpportunity, refreshOpportunityLabel } from './engine/opportunityEngine.js';
import { clamp } from './utils.js';
import { applyBrokerOwnerTrustDelta } from './trustWriteHelper.js';
import { markCaseSold } from './caseOutcome.js';
import { applyOpportunityIntentDeltaOnState, applyOpportunityConfidenceDeltaOnState, setOpportunityDaysLeftOnState, setOpportunityTouchedTodayOnState, setOpportunityPendingClosingOnState, setOpportunityStatusOnState, findBrokeredStateForOpportunity, findMatchStateForPair, ensureCustomerCaseMatchState, ensureBrokeredOpportunityState } from './opportunitySplitHelper.js';
import { ensureConsensusFormation, setConsensusEvaluationOnState, setConsensusStageOnState, markConsensusSignedOnState, markConsensusCollapsedOnState, ensureConsensusRuntime, createContractFactOnState, createOpportunityClosureOnState, findContractForCase } from './consensusFormationHelper.js';
import { buildConsensusFormationId } from '../core/world-state/consensus/writeSource.js';
import { readOwnerDecisionProfile, type OwnerDecisionProfile } from './ownerDecisionProfileHelper.js';
import { getMarketCell } from './engine/opportunityEngine.js';

function resolveNegotiationStrategy(strategyId?: string | null) {
  const strategies = BALANCE.actions.negotiation.strategies;
  return strategies[strategyId === 'hold' || strategyId === 'close' || strategyId === 'balanced' ? strategyId : 'balanced'];
}

function clearPendingDealClosing(state: GameState, opportunity: Opportunity) {
  setOpportunityPendingClosingOnState(state, opportunity, false, '', 0, '清空待结算状态');
}

// ---------------------------------------------------------------------------
// Relation-layer reads with Case fallback
// ---------------------------------------------------------------------------

/**
 * Read trust from runtime broker-owner relation state.
 * Falls back to Case.trust when relation state is not populated.
 *
 * Mother model: trust belongs to BrokerOwnerRelation, not AssetCase.
 */
function readRelationTrustForCase(state: GameState, caseItem: Case): number {
  const relations = state.runtimeBrokerOwnerRelations;
  if (relations) {
    const match = relations.find(r => r.ownerId === `owner:${caseItem.id}` || r.ownerId === caseItem.ownerName);
    if (match) return match.trust;
  }
  return caseItem.trust;
}

interface RelationReadiness {
  readonly patience: number;
  readonly urgency: number;
  /** Source: 'relation' when runtime state available, 'case-fallback' otherwise. */
  readonly source: 'relation' | 'case-fallback';
}

/**
 * Read patience/urgency from runtime owner-case readiness state.
 * Falls back to Case.patience / Case.urgency when relation state is not populated.
 *
 * Mother model: patience/urgency belong to OwnerCaseRelation, not AssetCase.
 */
function readRelationReadinessForCase(state: GameState, caseItem: Case): RelationReadiness {
  const states = state.runtimeOwnerCaseReadinessStates;
  if (states) {
    const match = states.find(s => s.assetCaseId === caseItem.id);
    if (match) return { patience: match.patience, urgency: match.urgency, source: 'relation' };
  }
  return { patience: caseItem.patience, urgency: caseItem.urgency, source: 'case-fallback' };
}

function calculateNegotiationSuccessScore(
  caseItem: Case,
  opportunity: Opportunity,
  strategyId: string | null | undefined,
  trust: number,
  ownerProfile: OwnerDecisionProfile,
) {
  const negotiationBalance = BALANCE.actions.negotiation;
  const strategy = resolveNegotiationStrategy(strategyId);

  return opportunity.intent * negotiationBalance.intentWeight
    + opportunity.confidence * negotiationBalance.confidenceWeight
    + trust * (ownerProfile.isUrgent ? negotiationBalance.urgentTrustWeight : negotiationBalance.defaultTrustWeight)
    + caseItem.competitiveness * negotiationBalance.competitivenessWeight
    - Math.max(0, caseItem.askPrice - caseItem.marketPrice) * negotiationBalance.askPricePenaltyWeight
    + strategy.shift;
}

function calculateScaledCloseProbability(
  state: GameState,
  caseItem: Case,
  opportunity: Opportunity,
  strategyId: string | null | undefined,
  trust: number,
  ownerProfile: OwnerDecisionProfile,
) {
  return clamp(
    Math.round(calculateNegotiationSuccessScore(caseItem, opportunity, strategyId, trust, ownerProfile) * state.rules.outcomeControl.playerDealClosingScale),
    0,
    95,
  );
}

function finalizeClosedDeal(
  state: GameState,
  caseItem: Case,
  opportunity: Opportunity,
  soldPrice: number,
  evaluation: DealClosingEvaluation,
  wordOfMouthBonus: number,
) {
  if (state.closedDeals.some((entry) => entry.caseId === caseItem.id)) {
    clearPendingDealClosing(state, opportunity);
    return;
  }

  // Mark consensus as signed on successful close, then create canonical artifacts
  const signedBrokered = findBrokeredStateForOpportunity(state, opportunity.id);
  const consensusId = signedBrokered
    ? buildConsensusFormationId(signedBrokered.brokeredOpportunityId)
    : undefined;
  if (signedBrokered) {
    markConsensusSignedOnState(state, signedBrokered.brokeredOpportunityId, state.day, 'deal closed');
  }

  // Create ContractFact (canonical terminal fact — guarded against duplicates)
  const contractFact = consensusId
    ? createContractFactOnState(
        state,
        consensusId,
        signedBrokered!.brokeredOpportunityId,
        caseItem.id,
        opportunity.customerId,
        soldPrice,
        'self_closed',
        state.day,
        `deal-${caseItem.id}-${opportunity.customerId}-${state.day}`,
        evaluation.closeReadiness,
        evaluation.closeProbability,
        evaluation.blockingReasons,
        evaluation.supportingReasons,
      )
    : undefined;

  // Create OpportunityClosureSet (one contract closes many opportunities)
  const closureSet = contractFact
    ? createOpportunityClosureOnState(
        state,
        contractFact.contractId,
        opportunity.id,
        state.opportunities
          .filter((e) => e.caseId === caseItem.id)
          .map((e) => e.id),
        state.opportunities
          .filter((e) => e.caseId === caseItem.id && e.customerId !== opportunity.customerId)
          .map((e) => e.customerId),
        'deal closed — related opportunities closed',
        state.day,
      )
    : undefined;

  const saleBalance = BALANCE.actions.sale;
  caseItem.status = 'sold';
  caseItem.soldPrice = soldPrice;
  caseItem.stageLabel = '已成交';
  applyBrokerOwnerTrustDelta(state, caseItem, saleBalance.soldTrustBonus, '成交信任奖励', 0, 100);
  caseItem.heat = clamp(caseItem.heat + saleBalance.soldHeatBonus, 0, 100);

  markCaseSold(caseItem, soldPrice);

  const commission = Math.round(
    soldPrice
      * saleBalance.commissionRate
      * saleBalance.advisorShareRate
      * saleBalance.precisionFactor,
  ) / saleBalance.precisionFactor;
  const budgetReturn = Math.max(
    state.rules.promotionRebateFloor,
    Math.round(commission * state.rules.promotionRebateRatio),
  );
  recordBudgetChange(state, {
    amount: budgetReturn,
    kind: 'sale-rebate',
    title: '总部推广金到账',
    detail: `${caseItem.title} 成功过户。按规定提了 ${commission} 个点，总部按比例发了 ${budgetReturn} 个推广点，又有弹药了。`,
  });
  applyAuxiliaryStats(state, {
    soldCount: state.auxiliaryStats.soldCount + 1,
    commission: state.auxiliaryStats.commission + commission,
    wordOfMouth: clamp(state.auxiliaryStats.wordOfMouth + saleBalance.wordOfMouthBaseBonus + wordOfMouthBonus, 0, 100),
  });

  state.opportunities.forEach((entry) => {
    if (entry.caseId !== caseItem.id || entry.status !== 'active') {
      return;
    }
    setOpportunityStatusOnState(state, entry, entry.id === opportunity.id ? 'won' : 'closed', '成交结算');
    clearPendingDealClosing(state, entry);
    refreshOpportunityLabel(state, entry);
  });

  const closedDeal = buildClosedDealRecord(state, caseItem, opportunity, soldPrice, evaluation);
  // Attach canonical traceability bridge IDs (optional, non-breaking)
  if (consensusId) closedDeal.consensusId = consensusId;
  if (contractFact) closedDeal.contractId = contractFact.contractId;
  if (closureSet) closedDeal.closureSetId = closureSet.closureSetId;
  state.closedDeals.unshift(closedDeal);

  state.customerStates.forEach((customerState) => {
    const runtime = customerState.caseStates[caseItem.id];
    if (!runtime) return;
    if (customerState.customerId === opportunity.customerId) {
      customerState.status = 'converted';
      runtime.selected = true;
      runtime.offered = true;
      runtime.stageIndex = saleBalance.convertedStageIndex;
      runtime.interest = 100;
      runtime.confidence = 100;
      customerState.lastActionNote = '成交完成';
    } else {
      customerState.status = customerState.status === 'lost' ? 'lost' : 'idle';
      runtime.selected = false;
      runtime.interest = clamp(runtime.interest - saleBalance.losingOtherCustomersInterestPenalty, 0, 100);
      runtime.confidence = clamp(runtime.confidence - saleBalance.losingOtherCustomersConfidencePenalty, 0, 100);
    }
    customerState.activeCaseIds = customerState.activeCaseIds.filter((id) => id !== caseItem.id);
  });

  recordDomainEvent(state, {
    kind: 'case_sold',
    actor: caseItem.title,
    title: '房源成交',
    detail: `${caseItem.title} 最终以 ${soldPrice} 万落锤，咱们拿到了 ${budgetReturn} 个推广点奖励。`,
    tone: 'success',
    caseId: caseItem.id,
    opportunityId: opportunity.id,
    customerId: opportunity.customerId,
    payload: {
      dealId: closedDeal.dealId,
      soldPrice,
      commission,
      budgetReturn,
      closeReadiness: evaluation.closeReadiness,
      closeProbability: evaluation.closeProbability,
      ownerSatisfaction: caseItem.ownerSatisfaction,
      defenseOutcome: caseItem.defenseOutcome,
      endingType: caseItem.endingType,
      endingBucket: caseItem.endingBucket,
      relativeOutcome: caseItem.relativeOutcome,
    },
  });

  logEvent(state, '成交快报', `${caseItem.title} 签了！最终 ${soldPrice} 万落锤，咱们组分了 ${commission} 个点，外加 ${budgetReturn} 个推广点，今晚加鸡腿！`, 'success');
}

function resolveFailedPendingClosing(
  state: GameState,
  caseItem: Case,
  opportunity: Opportunity,
  strategyId: string | null | undefined,
  ownerProfile: OwnerDecisionProfile,
  evaluation: DealClosingEvaluation,
) {
  const negotiationBalance = BALANCE.actions.negotiation;
  const strategy = resolveNegotiationStrategy(strategyId);

  applyOpportunityIntentDeltaOnState(state, opportunity, -strategy.loss, '谈判失败意向下降', 0, 100);
  applyOpportunityConfidenceDeltaOnState(state, opportunity, -negotiationBalance.confidenceLossOnFailure, '谈判失败置信度下降', 0, 100);
  setOpportunityDaysLeftOnState(state, opportunity, negotiationBalance.failureDaysLeft, '谈判失败设定剩余天数');
  setOpportunityTouchedTodayOnState(state, opportunity, true, '谈判失败标记今日触达');
  const trustHit = strategy.priceFactor === 1
    ? (ownerProfile.isUrgent ? negotiationBalance.trustHit.hold.urgent : ownerProfile.isPragmatic ? negotiationBalance.trustHit.hold.pragmatic : negotiationBalance.trustHit.hold.default)
    : strategyId === 'close'
      ? (ownerProfile.isUrgent ? negotiationBalance.trustHit.close.urgent : ownerProfile.isEmotional ? negotiationBalance.trustHit.close.emotional : negotiationBalance.trustHit.close.default)
      : (ownerProfile.isUrgent ? negotiationBalance.trustHit.balanced.urgent : ownerProfile.isPragmatic ? negotiationBalance.trustHit.balanced.pragmatic : negotiationBalance.trustHit.balanced.default);
  applyBrokerOwnerTrustDelta(state, caseItem, -trustHit, '谈判失败信任受损', 0, 100);

  clearPendingDealClosing(state, opportunity);

  // Mark consensus as collapsed with structured explainable reason
  const failedBrokered = findBrokeredStateForOpportunity(state, opportunity.id);
  if (failedBrokered) {
    // Build structured collapse reason from evaluation blockers
    const collapseReason = evaluation.blockingCategories.length > 0
      ? `consensus collapsed: ${evaluation.blockingCategories.join(', ')} (readiness=${evaluation.closeReadiness}, probability=${evaluation.closeProbability})`
      : `consensus collapsed: below threshold (readiness=${evaluation.closeReadiness}, probability=${evaluation.closeProbability}, threshold=${BALANCE.actions.negotiation.closeThreshold})`;
    markConsensusCollapsedOnState(state, failedBrokered.brokeredOpportunityId, state.day, collapseReason);
  }

  if (opportunity.intent < negotiationBalance.lostIntentThreshold) {
    closeOpportunity(state, opportunity, 'lost', `${opportunity.customerName} 最后没崩住，摔门走了，这单彻底黄了。`, 'danger');
    return;
  }

  logEvent(state, opportunity.customerName, `${caseItem.title} 这次没谈拢，但只要人还没死心就还有机会，明天再想办法磨。`, 'danger');
}

function isClosingBlockedByMarketCapacity(state: GameState, evaluation: DealClosingEvaluation) {
  if (getAvailableMarketDealSlots(state) <= 0) {
    return true;
  }
  const marketOutcome = ensureMarketOutcomeState(state);
  return marketOutcome.playerClaimedDeals >= getPlayerAllowedMarketDeals(state)
    || evaluation.blockingReasons.some((reason) => reason.includes('市场成交名额') || reason.includes('自成交空间'));
}

function resolveCapacityBlockedPendingClosing(
  state: GameState,
  caseItem: Case,
  opportunity: Opportunity,
) {
  // Mark consensus as collapsed on capacity block
  const blockedBrokered = findBrokeredStateForOpportunity(state, opportunity.id);
  if (blockedBrokered) {
    markConsensusCollapsedOnState(state, blockedBrokered.brokeredOpportunityId, state.day, 'market capacity blocked');
  }

  clearPendingDealClosing(state, opportunity);
  refreshOpportunityLabel(state, opportunity);
  const feedback = '今日成交窗口已被占满，客户意向仍在，建议明天优先跟进确认。';
  recordDomainEvent(state, {
    kind: 'journal',
    actor: opportunity.customerName,
    title: '成交窗口暂满',
    detail: feedback,
    tone: 'accent',
    caseId: caseItem.id,
    opportunityId: opportunity.id,
    customerId: opportunity.customerId,
    payload: {
      reason: 'market_capacity_blocked',
      availableSlots: getAvailableMarketDealSlots(state),
    },
  });
  logEvent(state, opportunity.customerName, feedback, 'accent');
}

export function queueDealClosingEvaluation(
  state: GameState,
  caseItem: Case,
  opportunity: Opportunity,
  strategyId?: string | null,
) {
  // Ensure canonical state exists
  const match = ensureCustomerCaseMatchState(
    state, opportunity.customerId, opportunity.caseId,
    opportunity.fit, opportunity.intent, opportunity.confidence,
    opportunity.budgetMax, opportunity.priceSensitivity,
  );
  const brokered = ensureBrokeredOpportunityState(state, opportunity, match.matchId);

  // Create ConsensusFormation for this opportunity
  ensureConsensusFormation(
    state,
    brokered.brokeredOpportunityId,
    match.matchId,
    caseItem.id,
    opportunity.customerId,
    strategyId || 'balanced',
    state.day,
  );

  // Advance consensus stage to at least price_gap_visible
  setConsensusStageOnState(state, brokered.brokeredOpportunityId, 'price_gap_visible', state.day, 'queue closing evaluation');

  // Legacy mirror writes (preserved for backward compatibility)
  setOpportunityPendingClosingOnState(state, opportunity, true, strategyId || 'balanced', state.day, '请求结算评估');
  setOpportunityTouchedTodayOnState(state, opportunity, true, '请求结算标记今日触达');
  setOpportunityDaysLeftOnState(state, opportunity, Math.max(opportunity.daysLeft, 2), '请求结算确保剩余天数');
  refreshOpportunityLabel(state, opportunity);
  logEvent(state, opportunity.customerName, `${caseItem.title} 马上要见真章了。今晚关门算总账，看看底牌能不能碰上。`, 'accent');
}

export function settlePendingDealClosings(state: GameState) {
  const pendingOpportunities = state.opportunities.filter((entry) => entry.status === 'active' && entry.pendingClosingEvaluation);
  pendingOpportunities.forEach((opportunity) => {
    const caseItem = state.cases.find((entry) => entry.id === opportunity.caseId);
    if (!caseItem || caseItem.status !== 'active') {
      clearPendingDealClosing(state, opportunity);
      return;
    }
    if (state.closedDeals.some((entry) => entry.caseId === caseItem.id)) {
      clearPendingDealClosing(state, opportunity);
      return;
    }

    const strategyId = opportunity.pendingClosingStrategyId || 'balanced';
    const strategy = resolveNegotiationStrategy(strategyId);
    const soldPrice = Math.round(caseItem.askPrice * strategy.priceFactor);
    const evaluation = buildDealClosingEvaluation(state, caseItem, opportunity, soldPrice, strategyId);

    // Write evaluation into ConsensusFormation (canonical)
    const match = findMatchStateForPair(state, opportunity.customerId, opportunity.caseId);
    const brokered = match ? findBrokeredStateForOpportunity(state, opportunity.id) : undefined;
    if (match && brokered) {
      // Ensure consensus exists and write evaluation
      const consensus = ensureConsensusFormation(
        state,
        brokered.brokeredOpportunityId,
        match.matchId,
        caseItem.id,
        opportunity.customerId,
        strategyId,
        state.day,
      );
      setConsensusEvaluationOnState(state, brokered.brokeredOpportunityId, {
        closeReadiness: evaluation.closeReadiness,
        closeProbability: evaluation.closeProbability,
        blockers: evaluation.blockingReasons,
        supportingFactors: evaluation.supportingReasons,
        strategyId,
      }, state.day, 'settle evaluation');

      // Advance stage based on evaluation
      const hasBlockers = evaluation.blockingReasons.length > 0;
      const nextStage = hasBlockers ? 'negotiable_zone' : 'contract_ready';
      setConsensusStageOnState(state, brokered.brokeredOpportunityId, nextStage, state.day, 'evaluation stage advance');
    }

    if (isClosingBlockedByMarketCapacity(state, evaluation)) {
      // Mark consensus as collapsed on capacity block
      if (brokered) {
        markConsensusCollapsedOnState(state, brokered.brokeredOpportunityId, state.day, 'market capacity blocked');
      }
      resolveCapacityBlockedPendingClosing(state, caseItem, opportunity);
      return;
    }
    // Deterministic close: consensus is a process, not a dice roll.
    // closeProbability already encodes accumulated evidence (intent, confidence,
    // trust, competitiveness, price gap, strategy). If it meets the threshold,
    // the deal closes. Randomness lives in upstream daily tick mutations, not here.
    const canClose = evaluation.isEligible && evaluation.closeProbability >= BALANCE.actions.negotiation.closeThreshold;

    if (canClose) {
      if (claimPlayerMarketDealSlot(state)) {
        // Mark consensus as signed before finalizing (canonical write)
        if (brokered) {
          markConsensusSignedOnState(state, brokered.brokeredOpportunityId, state.day, 'deal closed');
        }
        finalizeClosedDeal(state, caseItem, opportunity, soldPrice, evaluation, strategy.wordOfMouthBonus);
      } else {
        resolveCapacityBlockedPendingClosing(state, caseItem, opportunity);
      }
      return;
    }

    const ownerProfileForFailure = readOwnerDecisionProfile(caseItem);
    resolveFailedPendingClosing(state, caseItem, opportunity, strategyId, ownerProfileForFailure, evaluation);
  });
}

export function buildDealClosingEvaluation(
  state: GameState,
  caseItem: Case,
  opportunity: Opportunity,
  soldPrice: number,
  strategyId?: string | null,
): DealClosingEvaluation {
  // Read trust from relation layer (canonical), fallback to Case
  const trust = readRelationTrustForCase(state, caseItem);
  const trustSource: EvaluationSourceTrace['trustSource'] =
    state.runtimeBrokerOwnerRelations?.find(r => r.ownerId === `owner:${caseItem.id}` || r.ownerId === caseItem.ownerName)
      ? 'relation' : 'case-fallback';
  const readiness = readRelationReadinessForCase(state, caseItem);
  const ownerProfile = readOwnerDecisionProfile(caseItem);

  // Read competition-derived evidence (read-only, does not change outcome directly)
  const cell = getMarketCell(state, caseItem.marketCellId);
  const competitionPressure = cell?.competitivePressure ?? 0;

  const closeReadiness = clamp(
    Math.round(
      opportunity.intent * 0.34
      + opportunity.confidence * 0.26
      + trust * 0.2
      + caseItem.competitiveness * 0.12
      + Math.max(0, 100 - Math.max(0, soldPrice - opportunity.budgetMax) * 0.25) * 0.08,
    ),
    0,
    100,
  );
  const rawCloseProbability = calculateScaledCloseProbability(state, caseItem, opportunity, strategyId, trust, ownerProfile);

  const blockingReasons: string[] = [];
  const blockingCategories: BlockingReasonCategory[] = [];
  if (soldPrice > opportunity.budgetMax) {
    blockingReasons.push('你报的价格直接把客户吓退了，超预算太多');
    blockingCategories.push('price_budget');
  }
  if (trust < BALANCE.actions.negotiation.trustGate) {
    blockingReasons.push('业主觉得你办事不靠谱，根本不听你的压价');
    blockingCategories.push('relation_trust');
  }
  const marketOutcome = ensureMarketOutcomeState(state);
  if (getAvailableMarketDealSlots(state) <= 0) {
    blockingReasons.push('今天释放的市场成交名额已经被消耗，需要继续推进下一批客户');
    blockingCategories.push('market_capacity');
  }
  if (marketOutcome.playerClaimedDeals >= getPlayerAllowedMarketDeals(state)) {
    blockingReasons.push('本局可争取的自成交空间已用完，除非经营表现再上一个台阶');
    blockingCategories.push('player_capacity');
  }
  // Evidence weakness: opportunity signals too low to reach threshold even without hard blockers
  if (blockingReasons.length === 0 && rawCloseProbability < BALANCE.actions.negotiation.closeThreshold) {
    blockingReasons.push(`共识证据不足：综合评估 ${rawCloseProbability} 未达成交阈值 ${BALANCE.actions.negotiation.closeThreshold}`);
    blockingCategories.push('evidence_weak');
  }
  const closeProbability = blockingReasons.length === 0 ? rawCloseProbability : 0;

  const sourceTrace: EvaluationSourceTrace = {
    trustSource,
    readinessSource: readiness.source,
    profileSource: ownerProfile.source,
  };

  // Determine weakest link in the evidence chain for failure attribution
  const weakestLink: EvidenceChainTrace['weakestLink'] =
    blockingCategories.includes('price_budget') ? 'price_fit'
    : blockingCategories.includes('relation_trust') ? 'relation_trust'
    : blockingCategories.includes('market_capacity') || blockingCategories.includes('player_capacity') ? 'capacity'
    : blockingCategories.includes('evidence_weak')
      ? (opportunity.intent < 40 || opportunity.confidence < 40 ? 'opportunity_evidence'
        : caseItem.heat < 30 ? 'case_heat'
        : competitionPressure > 60 ? 'competition_pressure'
        : 'opportunity_evidence')
    : 'none';

  const evidenceChain: EvidenceChainTrace = {
    competitionPressure: Math.round(competitionPressure),
    hasCompetitionData: cell !== undefined,
    caseHeat: caseItem.heat,
    caseCompetitiveness: caseItem.competitiveness,
    opportunityIntent: opportunity.intent,
    opportunityConfidence: opportunity.confidence,
    relationTrust: trust,
    trustFromRelation: trustSource === 'relation',
    ownerUrgency: readiness.urgency,
    consensusStage: 'evaluated',
    weakestLink,
  };

  return {
    relationId: opportunity.id,
    caseId: caseItem.id,
    customerId: opportunity.customerId,
    dayIndex: state.day,
    isEligible: blockingReasons.length === 0,
    closeReadiness,
    closeProbability,
    blockingReasons,
    supportingReasons: [
      `${opportunity.customerName} 已经坐到了桌前，进入 ${opportunity.stageLabel}`,
      `客户两眼放光，意向 ${Math.round(opportunity.intent)}，但对房子信心 ${Math.round(opportunity.confidence)}`,
      `业主跟你交了底（信任 ${Math.round(trust)}），而且房子确实能打（竞争力 ${Math.round(caseItem.competitiveness)}）`,
    ],
    sourceTrace,
    blockingCategories,
    evidenceChain,
  };
}

export function buildClosedDealRecord(
  state: GameState,
  caseItem: Case,
  opportunity: Opportunity,
  soldPrice: number,
  evaluation: DealClosingEvaluation,
): ClosedDealRecord {
  // Deterministic closedAt: derive from state.currentDate (replay-safe, no wall clock)
  const closedAt = `${state.currentDate}T00:00:00.000Z`;
  const discountToAskPct = Math.round(((soldPrice - caseItem.askPrice) / Math.max(caseItem.askPrice, 1)) * 1000) / 10;
  const premiumToMarketPct = Math.round(((soldPrice - caseItem.marketPrice) / Math.max(caseItem.marketPrice, 1)) * 1000) / 10;

  return {
    dealId: `deal-${caseItem.id}-${opportunity.customerId}-${state.day}`,
    caseId: caseItem.id,
    customerId: opportunity.customerId,
    sourceRelationId: opportunity.id,
    opportunityId: opportunity.id,
    dayIndex: state.day,
    day: state.day,
    closedAt,
    dealType: 'self_closed',
    dealPrice: soldPrice,
    price: soldPrice,
    closeReadiness: evaluation.closeReadiness,
    closeProbability: evaluation.closeProbability,
    blockingReasons: [...evaluation.blockingReasons],
    supportingReasons: [...evaluation.supportingReasons],
    caseTitle: caseItem.title,
    customerName: opportunity.customerName,
    ownerName: caseItem.ownerName,
    maintainerName: caseItem.maintainerName,
    // marketSnapshot: frozen point-in-time compatibility mirror for display.
    // NOT a truth source. Trust/competitiveness here are bare Case field snapshots
    // at deal time; canonical trust is in BrokerOwnerRelation, canonical readiness
    // is in OwnerCaseRelation. Use ContractFact for deal truth.
    marketSnapshot: {
      askPrice: caseItem.askPrice,
      marketPrice: caseItem.marketPrice,
      bottomPrice: caseItem.bottomPrice,
      competitiveness: caseItem.competitiveness,
      trust: caseItem.trust,
      d1: caseItem.d1,
      d2: caseItem.d2,
      d3: caseItem.d3,
    },
    priceSnapshot: {
      soldPrice,
      askPrice: caseItem.askPrice,
      marketPrice: caseItem.marketPrice,
      bottomPrice: caseItem.bottomPrice,
      discountToAskPct,
      premiumToMarketPct,
    },
  };
}
