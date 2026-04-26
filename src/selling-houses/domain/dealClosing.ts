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
  GameState,
  Opportunity,
} from './models.js';
import { BALANCE } from './config/balance.js';
import { recordBudgetChange } from './budget.js';
import { applyAuxiliaryStats } from './runtimeStats.js';
import { logEvent, recordDomainEvent } from './runtimeState.js';
import { closeOpportunity, refreshOpportunityLabel } from './engine/opportunityEngine.js';
import { clamp, randomInt } from './utils.js';
import { markCaseSold } from './caseOutcome.js';

function resolveNegotiationStrategy(strategyId?: string | null) {
  const strategies = BALANCE.actions.negotiation.strategies;
  return strategies[strategyId === 'hold' || strategyId === 'close' || strategyId === 'balanced' ? strategyId : 'balanced'];
}

function clearPendingDealClosing(opportunity: Opportunity) {
  opportunity.pendingClosingEvaluation = false;
  opportunity.pendingClosingStrategyId = undefined;
  opportunity.pendingClosingRequestedDay = undefined;
}

function calculateNegotiationSuccessScore(
  caseItem: Case,
  opportunity: Opportunity,
  strategyId?: string | null,
) {
  const negotiationBalance = BALANCE.actions.negotiation;
  const strategy = resolveNegotiationStrategy(strategyId);
  const isUrgent = caseItem.personality === 'urgent';

  return opportunity.intent * negotiationBalance.intentWeight
    + opportunity.confidence * negotiationBalance.confidenceWeight
    + caseItem.trust * (isUrgent ? negotiationBalance.urgentTrustWeight : negotiationBalance.defaultTrustWeight)
    + caseItem.competitiveness * negotiationBalance.competitivenessWeight
    - Math.max(0, caseItem.askPrice - caseItem.marketPrice) * negotiationBalance.askPricePenaltyWeight
    + strategy.shift;
}

function calculateScaledCloseProbability(
  state: GameState,
  caseItem: Case,
  opportunity: Opportunity,
  strategyId?: string | null,
) {
  return clamp(
    Math.round(calculateNegotiationSuccessScore(caseItem, opportunity, strategyId) * state.rules.outcomeControl.playerDealClosingScale),
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
    clearPendingDealClosing(opportunity);
    return;
  }

  const saleBalance = BALANCE.actions.sale;
  caseItem.status = 'sold';
  caseItem.soldPrice = soldPrice;
  caseItem.stageLabel = '已成交';
  caseItem.trust = clamp(caseItem.trust + saleBalance.soldTrustBonus, 0, 100);
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
    entry.status = entry.id === opportunity.id ? 'won' : 'closed';
    clearPendingDealClosing(entry);
    refreshOpportunityLabel(entry);
  });

  const closedDeal = buildClosedDealRecord(state, caseItem, opportunity, soldPrice, evaluation);
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
  strategyId?: string | null,
) {
  const negotiationBalance = BALANCE.actions.negotiation;
  const strategy = resolveNegotiationStrategy(strategyId);
  const isUrgent = caseItem.personality === 'urgent';
  const isPragmatic = caseItem.personality === 'pragmatic';
  const isEmotional = caseItem.personality === 'emotional';

  opportunity.intent = clamp(opportunity.intent - strategy.loss, 0, 100);
  opportunity.confidence = clamp(opportunity.confidence - negotiationBalance.confidenceLossOnFailure, 0, 100);
  opportunity.daysLeft = negotiationBalance.failureDaysLeft;
  opportunity.touchedToday = true;
  const trustHit = strategy.priceFactor === 1
    ? (isUrgent ? negotiationBalance.trustHit.hold.urgent : isPragmatic ? negotiationBalance.trustHit.hold.pragmatic : negotiationBalance.trustHit.hold.default)
    : strategyId === 'close'
      ? (isUrgent ? negotiationBalance.trustHit.close.urgent : isEmotional ? negotiationBalance.trustHit.close.emotional : negotiationBalance.trustHit.close.default)
      : (isUrgent ? negotiationBalance.trustHit.balanced.urgent : isPragmatic ? negotiationBalance.trustHit.balanced.pragmatic : negotiationBalance.trustHit.balanced.default);
  caseItem.trust = clamp(caseItem.trust - trustHit, 0, 100);

  clearPendingDealClosing(opportunity);
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
  clearPendingDealClosing(opportunity);
  refreshOpportunityLabel(opportunity);
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
  opportunity.pendingClosingEvaluation = true;
  opportunity.pendingClosingStrategyId = strategyId || 'balanced';
  opportunity.pendingClosingRequestedDay = state.day;
  opportunity.touchedToday = true;
  opportunity.daysLeft = Math.max(opportunity.daysLeft, 2);
  refreshOpportunityLabel(opportunity);
  logEvent(state, opportunity.customerName, `${caseItem.title} 马上要见真章了。今晚关门算总账，看看底牌能不能碰上。`, 'accent');
}

export function settlePendingDealClosings(state: GameState) {
  const pendingOpportunities = state.opportunities.filter((entry) => entry.status === 'active' && entry.pendingClosingEvaluation);
  pendingOpportunities.forEach((opportunity) => {
    const caseItem = state.cases.find((entry) => entry.id === opportunity.caseId);
    if (!caseItem || caseItem.status !== 'active') {
      clearPendingDealClosing(opportunity);
      return;
    }
    if (state.closedDeals.some((entry) => entry.caseId === caseItem.id)) {
      clearPendingDealClosing(opportunity);
      return;
    }

    const strategyId = opportunity.pendingClosingStrategyId || 'balanced';
    const strategy = resolveNegotiationStrategy(strategyId);
    const soldPrice = Math.round(caseItem.askPrice * strategy.priceFactor);
    const evaluation = buildDealClosingEvaluation(state, caseItem, opportunity, soldPrice, strategyId);
    if (isClosingBlockedByMarketCapacity(state, evaluation)) {
      resolveCapacityBlockedPendingClosing(state, caseItem, opportunity);
      return;
    }
    const canClose = evaluation.isEligible && randomInt(0, 99, state) < evaluation.closeProbability;

    if (canClose) {
      if (claimPlayerMarketDealSlot(state)) {
        finalizeClosedDeal(state, caseItem, opportunity, soldPrice, evaluation, strategy.wordOfMouthBonus);
      } else {
        resolveCapacityBlockedPendingClosing(state, caseItem, opportunity);
      }
      return;
    }

    resolveFailedPendingClosing(state, caseItem, opportunity, strategyId);
  });
}

export function buildDealClosingEvaluation(
  state: GameState,
  caseItem: Case,
  opportunity: Opportunity,
  soldPrice: number,
  strategyId?: string | null,
): DealClosingEvaluation {
  const closeReadiness = clamp(
    Math.round(
      opportunity.intent * 0.34
      + opportunity.confidence * 0.26
      + caseItem.trust * 0.2
      + caseItem.competitiveness * 0.12
      + Math.max(0, 100 - Math.max(0, soldPrice - opportunity.budgetMax) * 0.25) * 0.08,
    ),
    0,
    100,
  );
  const rawCloseProbability = calculateScaledCloseProbability(state, caseItem, opportunity, strategyId);

  const blockingReasons: string[] = [];
  if (soldPrice > opportunity.budgetMax) {
    blockingReasons.push('你报的价格直接把客户吓退了，超预算太多');
  }
  if (caseItem.trust < 60) {
    blockingReasons.push('业主觉得你办事不靠谱，根本不听你的压价');
  }
  const marketOutcome = ensureMarketOutcomeState(state);
  if (getAvailableMarketDealSlots(state) <= 0) {
    blockingReasons.push('今天释放的市场成交名额已经被消耗，需要继续推进下一批客户');
  }
  if (marketOutcome.playerClaimedDeals >= getPlayerAllowedMarketDeals(state)) {
    blockingReasons.push('本局可争取的自成交空间已用完，除非经营表现再上一个台阶');
  }
  const closeProbability = blockingReasons.length > 0 ? 0 : rawCloseProbability;

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
      `业主跟你交了底（信任 ${Math.round(caseItem.trust)}），而且房子确实能打（竞争力 ${Math.round(caseItem.competitiveness)}）`,
    ],
  };
}

export function buildClosedDealRecord(
  state: GameState,
  caseItem: Case,
  opportunity: Opportunity,
  soldPrice: number,
  evaluation: DealClosingEvaluation,
): ClosedDealRecord {
  const closedAt = new Date().toISOString();
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
