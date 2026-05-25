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
import { asWritableCase } from './models.js';
import { BALANCE } from './config/balance.js';
import { recordBudgetChange } from './budget.js';
import { applyAuxiliaryStats } from './runtimeStats.js';
import { logEvent, recordDomainEvent } from './runtimeState.js';
import { closeOpportunity, refreshOpportunityLabel } from './engine/opportunityEngine.js';
import { clamp } from './utils.js';
import { applyBrokerOwnerTrustDelta } from './trustWriteHelper.js';
import { markCaseSoldFromContract } from './caseOutcome.js';
import { applyOpportunityIntentDeltaOnState, applyOpportunityConfidenceDeltaOnState, setOpportunityDaysLeftOnState, setOpportunityTouchedTodayOnState, setOpportunityPendingClosingOnState, setOpportunityStatusOnState, findBrokeredStateForOpportunity, findMatchStateForPair, ensureCustomerCaseMatchState, ensureBrokeredOpportunityState, syncCustomerRuntimeStageMirrorFromOpportunityOnState, syncOpportunityStageMirrorFromTrajectoryOnState } from './opportunitySplitHelper.js';
import { ensureConsensusFormation, setConsensusEvaluationOnState, setConsensusStageOnState, markConsensusSignedOnState, markConsensusCollapsedOnState, ensureConsensusRuntime, createOpportunityClosureOnState, findContractForCase, createContractFactFromPriceConsensusOnState, markConsensusSignedFromPriceConsensusOnState, type ContractFactState } from './consensusFormationHelper.js';
import { buildConsensusFormationId } from '../core/world-state/consensus/writeSource.js';
import { readOwnerDecisionProfile, type OwnerDecisionProfile } from './ownerDecisionProfileHelper.js';
import { getMarketCell } from './engine/opportunityEngine.js';
import {
  buildLegacyPriceTrajectoryFromOpportunity,
  buildPriceConsensusReadiness,
  buildPriceTrajectoryFromDealClosingEvaluation,
  buildPriceConsensusProof,
  validatePriceConsensusProof,
  assertTrajectoryHasOfferAndConcession,
  deriveConsensusStatusFromTrajectory,
  type PriceTrajectory,
  type PriceConsensusReadiness,
  type PriceConsensusProof,
  type WeightExplanation,
} from '../core/world-state/consensus/priceTrajectory.js';
import {
  computeCloseProbability,
  buildDefaultCloseProbabilityWeights,
  type CloseProbabilityInputs,
  type CloseProbabilityResult,
  type CloseProbabilityBlockCategory,
} from '../core/world-state/consensus/closeProbability.js';

// R20 compatibility mirror helper for deal-close stage write
function syncCustomerJourneyStageMirrorFromDealClose(
  runtime: { stageIndex: number },
  convertedStageIndex: number,
): void {
  runtime.stageIndex = convertedStageIndex;
}

// ---------------------------------------------------------------------------
// BrokerCustomerRelation trust read helper
// ---------------------------------------------------------------------------

interface BrokerCustomerTrustResult {
  readonly trust: number;
  readonly familiarity: number;
  readonly influence: number;
  readonly relationSource: 'relation' | 'legacy-customer-runtime-fallback';
  readonly relationId: string;
}

function readBrokerCustomerTrust(
  state: GameState,
  brokerId: string,
  customerId: string,
): BrokerCustomerTrustResult {
  const relations = state.runtimeBrokerCustomerRelations;
  if (relations) {
    const match = relations.find(
      (r) => r.brokerId === brokerId && r.customerId === customerId,
    );
    if (match) {
      return {
        trust: match.trust,
        familiarity: match.familiarity,
        influence: match.influence,
        relationSource: match.source === 'canonical' ? 'relation' : 'legacy-customer-runtime-fallback',
        relationId: match.relationId,
      };
    }
  }

  const customerState = state.customerStates.find(
    (cs) => cs.customerId === customerId,
  );
  const fallbackTrust = customerState?.advisorTrust ?? 48;
  return {
    trust: fallbackTrust,
    familiarity: 20,
    influence: 30,
    relationSource: 'legacy-customer-runtime-fallback',
    relationId: `fallback:${brokerId}::${customerId}`,
  };
}

// ---------------------------------------------------------------------------
// PriceTrajectory runtime helpers
// ---------------------------------------------------------------------------

function ensurePriceTrajectoryRuntime(state: GameState): {
  trajectories: PriceTrajectory[];
  readinesses: PriceConsensusReadiness[];
} {
  if (!state.runtimePriceTrajectories) state.runtimePriceTrajectories = [];
  if (!state.runtimePriceConsensusReadinesses) state.runtimePriceConsensusReadinesses = [];
  return {
    trajectories: state.runtimePriceTrajectories,
    readinesses: state.runtimePriceConsensusReadinesses,
  };
}

function storePriceTrajectoryAndReadiness(
  state: GameState,
  trajectory: PriceTrajectory,
  readiness: PriceConsensusReadiness,
): void {
  const { trajectories, readinesses } = ensurePriceTrajectoryRuntime(state);
  const existingTrajIdx = trajectories.findIndex(t => t.trajectoryId === trajectory.trajectoryId);
  if (existingTrajIdx >= 0) {
    trajectories[existingTrajIdx] = trajectory;
  } else {
    trajectories.push(trajectory);
  }
  const existingReadyIdx = readinesses.findIndex(r => r.readinessId === readiness.readinessId);
  if (existingReadyIdx >= 0) {
    readinesses[existingReadyIdx] = readiness;
  } else {
    readinesses.push(readiness);
  }
}

// ---------------------------------------------------------------------------
// ContractFact → legacy mirror sync (controlled terminal writes)
// ---------------------------------------------------------------------------

/**
 * Syncs legacy Case/ClosedDealRecord mirrors from a canonical ContractFact.
 *
 * This is the ONLY allowed write path for terminal case status → 'sold',
 * soldPrice, and closedDeals.unshift. All direct mutations are encapsulated
 * here so the gate can allowlist a single location.
 *
 * R23: contractFactId + consensusFormationId are mandatory provenance.
 * The gate verifies these are present and non-empty before allowing the write.
 */
export function syncLegacyCaseDealMirrorsFromContractFact(
  state: GameState,
  input: {
    contractFact: ContractFactState;
    consensusFormationId: string;
    opportunityClosureSetId?: string;
    caseId: string;
    opportunity: Opportunity;
    evaluation: DealClosingEvaluation;
  },
): void {
  const caseItem = state.cases.find((c) => c.id === input.caseId);
  if (!caseItem) return;

  const contract = input.contractFact;

  // Terminal status write
  asWritableCase(caseItem).status = 'sold';
  asWritableCase(caseItem).soldPrice = contract.dealPrice;
  caseItem.stageLabel = '已成交';

  // R27: Always use markCaseSoldFromContract — no loose markCaseSold in production
  markCaseSoldFromContract(caseItem, contract.dealPrice, contract.priceConsensusProofId ?? contract.contractId);

  // Build legacy ClosedDealRecord mirror via single authority constructor
  const closedDeal: ClosedDealRecord = buildClosedDealRecord(
    state, caseItem, input.opportunity, contract.dealPrice, input.evaluation,
  );

  if (input.consensusFormationId) closedDeal.consensusId = input.consensusFormationId;
  closedDeal.contractId = contract.contractId;
  if (input.opportunityClosureSetId) closedDeal.closureSetId = input.opportunityClosureSetId;
  state.closedDeals.unshift(closedDeal);
}

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
  // R26: consensus signing is now done from PriceConsensusProof when proof is available
  // (moved below after proof construction)

  const canonicalTrajectory = buildPriceTrajectoryFromDealClosingEvaluation({
    caseId: caseItem.id,
    customerId: opportunity.customerId,
    ownerId: caseItem.ownerName || `owner:${caseItem.id}`,
    opportunityId: opportunity.id,
    day: state.day,
    soldPrice,
    closeReadiness: evaluation.closeReadiness,
    closeProbability: evaluation.closeProbability,
    buyerBudgetMax: opportunity.budgetMax,
    buyerIntent: opportunity.intent,
    buyerConfidence: opportunity.confidence,
    caseAskPrice: caseItem.askPrice,
    caseMarketPrice: caseItem.marketPrice,
    caseBottomPrice: caseItem.bottomPrice,
    blockers: evaluation.blockingReasons,
    supportingFactors: evaluation.supportingReasons,
    strategyId: opportunity.pendingClosingStrategyId || 'balanced',
  });
  const canonicalReadiness = buildPriceConsensusReadiness(canonicalTrajectory);
  storePriceTrajectoryAndReadiness(state, canonicalTrajectory, canonicalReadiness);

  // Validate trajectory has both BuyerOffer and OwnerConcession (R19 structural invariant)
  const trajectoryValidation = assertTrajectoryHasOfferAndConcession(canonicalTrajectory);

  // R27: Build PriceConsensusProof and validate — no scalar fallback
  let proof: PriceConsensusProof | undefined;
  if (canonicalReadiness.ready && trajectoryValidation.valid) {
    proof = buildPriceConsensusProof({
      trajectory: canonicalTrajectory,
      readiness: canonicalReadiness,
    });
    const proofValidation = validatePriceConsensusProof(proof);
    if (!proofValidation.valid) {
      proof = undefined;
    }
  }

  // R20: Derive opportunity stage from trajectory for the closing path
  syncOpportunityStageMirrorFromTrajectoryOnState(state, opportunity, canonicalTrajectory, opportunity.stageIndex, 'deal close trajectory-derived stage');

  // R27: No scalar fallback — contract only from proof
  let contractFact: ContractFactState | undefined;
  if (consensusId && proof) {
    markConsensusSignedFromPriceConsensusOnState(state, signedBrokered!.brokeredOpportunityId, state.day, proof);
    contractFact = createContractFactFromPriceConsensusOnState(
      state,
      consensusId,
      signedBrokered!.brokeredOpportunityId,
      caseItem.id,
      opportunity.customerId,
      'self_closed',
      state.day,
      `deal-${caseItem.id}-${opportunity.customerId}-${state.day}`,
      evaluation.closeReadiness,
      evaluation.closeProbability,
      evaluation.blockingReasons,
      evaluation.supportingReasons,
      proof,
    );
  } else if (consensusId) {
    // R27: No proof = no contract. Collapse consensus as evidence failure.
    markConsensusCollapsedOnState(state, signedBrokered!.brokeredOpportunityId, state.day,
      `proof invalid or readiness not ready (readiness.ready=${canonicalReadiness.ready}, trajectoryValid=${trajectoryValidation.valid})`);
  }

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

  // R27: Sync legacy mirrors only when proof-backed contract exists
  if (contractFact) {
    syncLegacyCaseDealMirrorsFromContractFact(state, {
      contractFact,
      consensusFormationId: consensusId ?? '',
      opportunityClosureSetId: closureSet?.closureSetId,
      caseId: caseItem.id,
      opportunity,
      evaluation,
    });
  }

  applyBrokerOwnerTrustDelta(state, caseItem, saleBalance.soldTrustBonus, '成交信任奖励', 0, 100);
  caseItem.heat = clamp(caseItem.heat + saleBalance.soldHeatBonus, 0, 100);

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

  state.customerStates.forEach((customerState) => {
    const runtime = customerState.caseStates[caseItem.id];
    if (!runtime) return;
    if (customerState.customerId === opportunity.customerId) {
      customerState.status = 'converted';
      runtime.selected = true;
      runtime.offered = true;
      syncCustomerJourneyStageMirrorFromDealClose(runtime, saleBalance.convertedStageIndex);
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
      dealId: contractFact?.contractId ?? `deal-${caseItem.id}-${opportunity.customerId}-${state.day}`,
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

    const legacyTrajectory = buildLegacyPriceTrajectoryFromOpportunity({
      caseId: caseItem.id,
      customerId: opportunity.customerId,
      ownerId: caseItem.ownerName || `owner:${caseItem.id}`,
      day: state.day,
      buyerBudgetMax: opportunity.budgetMax,
      buyerIntent: opportunity.intent,
      buyerConfidence: opportunity.confidence,
      caseAskPrice: caseItem.askPrice,
      caseMarketPrice: caseItem.marketPrice,
      caseBottomPrice: caseItem.bottomPrice,
      opportunityId: opportunity.id,
    });
    const legacyReadiness = buildPriceConsensusReadiness(legacyTrajectory);
    storePriceTrajectoryAndReadiness(state, legacyTrajectory, legacyReadiness);

    // Write evaluation into ConsensusFormation (canonical)
    // Ensure match and brokered state exist (they may not if settlePendingDealClosings
    // was called without going through queueDealClosingEvaluation first)
    const match = ensureCustomerCaseMatchState(
      state, opportunity.customerId, opportunity.caseId,
      opportunity.fit, opportunity.intent, opportunity.confidence,
      opportunity.budgetMax, opportunity.priceSensitivity,
    );
    const brokered = ensureBrokeredOpportunityState(state, opportunity, match.matchId);
    // Ensure consensus exists and write evaluation
    ensureConsensusFormation(
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
      weightExplanations: evaluation.weightExplanations,
    }, state.day, 'settle evaluation');

    // Advance stage based on evaluation
    const hasBlockers = evaluation.blockingReasons.length > 0;
    const nextStage = hasBlockers ? 'negotiable_zone' : 'contract_ready';
    setConsensusStageOnState(state, brokered.brokeredOpportunityId, nextStage, state.day, 'evaluation stage advance');

    if (isClosingBlockedByMarketCapacity(state, evaluation)) {
      // Mark consensus as collapsed on capacity block
      markConsensusCollapsedOnState(state, brokered.brokeredOpportunityId, state.day, 'market capacity blocked');
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
        // R26: consensus signing now happens inside finalizeClosedDeal via proof path
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
  const brokerId = state.bigWorldRuntime?.playerBrokerAcnId ?? 'player-broker';

  // Read trust from relation layer (canonical), fallback to Case
  const trust = readRelationTrustForCase(state, caseItem);
  const trustSource: EvaluationSourceTrace['trustSource'] =
    state.runtimeBrokerOwnerRelations?.find(r => r.ownerId === `owner:${caseItem.id}` || r.ownerId === caseItem.ownerName)
      ? 'relation' : 'case-fallback';
  const readiness = readRelationReadinessForCase(state, caseItem);
  const ownerProfile = readOwnerDecisionProfile(caseItem);

  // Read broker-customer trust from relation layer, fallback to CustomerRuntimeState
  const bcrResult = readBrokerCustomerTrust(state, brokerId, opportunity.customerId);

  // Read competition-derived evidence (read-only, does not change outcome directly)
  const cell = getMarketCell(state, caseItem.marketCellId);
  const competitionPressure = cell?.competitivePressure ?? 0;

  // R20: Compute close probability via pure kernel
  const strategy = resolveNegotiationStrategy(strategyId);
  const probResult = computeCloseProbability(
    {
      customerIntent: opportunity.intent,
      customerConfidence: opportunity.confidence,
      ownerTrust: trust,
      ownerIsUrgent: ownerProfile.isUrgent,
      caseCompetitiveness: caseItem.competitiveness,
      askPricePenalty: Math.max(0, caseItem.askPrice - caseItem.marketPrice),
      strategyShift: strategy.shift,
      scalingFactor: state.rules.outcomeControl.playerDealClosingScale,
      trustGate: BALANCE.actions.negotiation.trustGate,
      priceExceedsBudget: soldPrice > opportunity.budgetMax,
      marketCapacityBlocked: getAvailableMarketDealSlots(state) <= 0,
      playerCapacityBlocked: ensureMarketOutcomeState(state).playerClaimedDeals >= getPlayerAllowedMarketDeals(state),
      brokerCustomerTrust: bcrResult.trust,
      brokerCustomerFamiliarity: bcrResult.familiarity,
      brokerCustomerInfluence: bcrResult.influence,
      brokerCustomerRelationSource: bcrResult.relationSource === 'relation' ? 'relation' : 'legacy-customer-runtime-fallback',
      brokerCustomerRelationId: bcrResult.relationId,
    },
    buildDefaultCloseProbabilityWeights(),
  );

  const closeReadiness = probResult.closeReadiness;
  const rawCloseProbability = probResult.rawProbability;

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

  const legacyTrajectory = buildLegacyPriceTrajectoryFromOpportunity({
    caseId: caseItem.id,
    customerId: opportunity.customerId,
    ownerId: caseItem.ownerName || `owner:${caseItem.id}`,
    day: state.day,
    buyerBudgetMax: opportunity.budgetMax,
    buyerIntent: opportunity.intent,
    buyerConfidence: opportunity.confidence,
    caseAskPrice: caseItem.askPrice,
    caseMarketPrice: caseItem.marketPrice,
    caseBottomPrice: caseItem.bottomPrice,
    opportunityId: opportunity.id,
  });
  const legacyReadiness = buildPriceConsensusReadiness(legacyTrajectory);

  const sourceTrace: EvaluationSourceTrace = {
    trustSource,
    readinessSource: readiness.source,
    profileSource: ownerProfile.source,
    customerTrustSource: bcrResult.relationSource,
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
    brokerCustomerTrust: bcrResult.trust,
    brokerCustomerFamiliarity: bcrResult.familiarity,
    brokerCustomerInfluence: bcrResult.influence,
    brokerCustomerRelationSource: bcrResult.relationSource,
    brokerCustomerRelationId: bcrResult.relationId,
    trajectoryId: legacyTrajectory.trajectoryId,
    readinessId: legacyReadiness.readinessId,
    priceGap: legacyReadiness.currentGap,
    priceBlockers: legacyReadiness.blockers,
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
      `客户对你信任 ${Math.round(bcrResult.trust)}（${bcrResult.relationSource === 'relation' ? '关系记录' : '历史数据推导'}），愿意继续谈`,
      legacyReadiness.ready
        ? `价格共识已达成（差距 ${legacyReadiness.currentGap}，得分 ${legacyReadiness.score}）`
        : `价格共识暂未达成（差距 ${legacyReadiness.currentGap}，还需降到 ${legacyReadiness.requiredGap} 以内，阻塞：${legacyReadiness.blockers.join(', ')}）`,
    ],
    sourceTrace,
    blockingCategories,
    evidenceChain,
    weightExplanations: probResult.weightExplanations,
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
