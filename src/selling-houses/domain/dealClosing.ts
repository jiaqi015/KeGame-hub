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
import { asWritableCase, asWritableGameState } from './models.js';
import { isOpportunityActiveByCanonicalState } from './opportunityLifecycleStatusRead.js';
import {
  type CanonicalStoreWriteProvenance,
  type CanonicalStoreWriteReceipt,
  type LegacyMirrorWriteReceipt,
  makeStoreWriteReceipt,
  makeLegacyMirrorWriteReceipt,
} from '../core/world-state/canonicalStoreKernel.js';
import { BALANCE } from './config/balance.js';
import { recordBudgetChange } from './budget.js';
import { applyAuxiliaryStats } from './runtimeStats.js';
import { logEvent, recordDomainEvent } from './runtimeState.js';
import { closeOpportunity, refreshOpportunityLabel } from './engine/opportunityEngine.js';
import { clamp } from './utils.js';
import { applyBrokerOwnerTrustDelta, readBrokerOwnerTrustState } from './trustWriteHelper.js';
import { markCaseSoldFromContract, readCaseTerminalOutcomeForCase } from './caseOutcome.js';
import { applyOpportunityIntentDeltaOnState, applyOpportunityConfidenceDeltaOnState, setOpportunityDaysLeftOnState, setOpportunityTouchedTodayOnState, setOpportunityPendingClosingOnState, setOpportunityStatusOnState, findBrokeredStateForOpportunity, findMatchStateForPair, ensureCustomerCaseMatchState, ensureBrokeredOpportunityState, syncCustomerRuntimeStageMirrorFromOpportunityOnState, syncOpportunityStageMirrorFromTrajectoryOnState } from './opportunitySplitHelper.js';
import { readOwnerCaseReadinessState } from './ownerCaseReadinessWriteHelper.js';
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
  buildCanonicalPriceTrajectoryFromEvidence,
  createEvidenceStateView,
} from '../core/world-state/consensus/canonicalEvidenceBuilder.js';
import { readBrokerCustomerTrust as readBrokerCustomerTrustFromBoundary } from '../core/world-state/customer/customerReadBoundary.js';
import { isCaseActiveByCanonicalStatus } from './caseLifecycleStatusRead.js';
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
// PriceTrajectory runtime helpers
// ---------------------------------------------------------------------------

function ensurePriceTrajectoryRuntime(state: GameState): {
  trajectories: readonly PriceTrajectory[];
  readinesses: readonly PriceConsensusReadiness[];
} {
  if (!state.runtimePriceTrajectories) {
    asWritableGameState(state).runtimePriceTrajectories = [];
  }
  if (!state.runtimePriceConsensusReadinesses) {
    asWritableGameState(state).runtimePriceConsensusReadinesses = [];
  }
  return {
    trajectories: state.runtimePriceTrajectories,
    readinesses: state.runtimePriceConsensusReadinesses,
  };
}

/**
 * Store-level ensure helper for price trajectory store.
 * Returns a CanonicalStoreWriteReceipt for audit.
 */
export function ensureRuntimePriceTrajectories(
  state: GameState,
  provenance: CanonicalStoreWriteProvenance = 'canonical-bootstrap',
): CanonicalStoreWriteReceipt {
  if (!state.runtimePriceTrajectories) {
    asWritableGameState(state).runtimePriceTrajectories = [];
  }
  return makeStoreWriteReceipt('runtimePriceTrajectories', 'ensure', provenance, {
    nextCount: state.runtimePriceTrajectories.length,
  });
}

export function ensureRuntimePriceConsensusReadinesses(
  state: GameState,
  provenance: CanonicalStoreWriteProvenance = 'canonical-bootstrap',
): CanonicalStoreWriteReceipt {
  if (!state.runtimePriceConsensusReadinesses) {
    asWritableGameState(state).runtimePriceConsensusReadinesses = [];
  }
  return makeStoreWriteReceipt('runtimePriceConsensusReadinesses', 'ensure', provenance, {
    nextCount: state.runtimePriceConsensusReadinesses.length,
  });
}

function storePriceTrajectoryAndReadiness(
  state: GameState,
  trajectory: PriceTrajectory,
  readiness: PriceConsensusReadiness,
): void {
  const { trajectories, readinesses } = ensurePriceTrajectoryRuntime(state);
  const existingTrajIdx = trajectories.findIndex(t => t.trajectoryId === trajectory.trajectoryId);
  if (existingTrajIdx >= 0) {
    asWritableGameState(state).runtimePriceTrajectories[existingTrajIdx] = trajectory;
  } else {
    asWritableGameState(state).runtimePriceTrajectories.push(trajectory);
  }
  const existingReadyIdx = readinesses.findIndex(r => r.readinessId === readiness.readinessId);
  if (existingReadyIdx >= 0) {
    asWritableGameState(state).runtimePriceConsensusReadinesses[existingReadyIdx] = readiness;
  } else {
    asWritableGameState(state).runtimePriceConsensusReadinesses.push(readiness);
  }
}

// ---------------------------------------------------------------------------
// ContractFact → legacy mirror sync (controlled terminal writes)
// ---------------------------------------------------------------------------

/**
 * Prepends a ClosedDealRecord to the closedDeals mirror store.
 * This is the ONLY allowed way to add to closedDeals in production.
 * Provenance must be 'contract-fact' (from a canonical ContractFactState).
 * R32: Returns honest LegacyMirrorWriteReceipt naming closedDeals, not the canonical source.
 */
export function prependClosedDealMirrorFromContractFact(
  state: GameState,
  closedDeal: ClosedDealRecord,
  contractFactId?: string,
  provenance: CanonicalStoreWriteProvenance = 'contract-fact',
): LegacyMirrorWriteReceipt {
  const previousCount = state.closedDeals.length;
  asWritableGameState(state).closedDeals.unshift(closedDeal);
  return makeLegacyMirrorWriteReceipt('closedDeals', 'mirror-prepend', provenance, {
    canonicalSourceId: contractFactId,
    recordId: closedDeal.dealId,
    previousCount,
    nextCount: previousCount + 1,
  });
}

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

  // R29: markCaseSoldFromContract consumes full ContractFactState
  markCaseSoldFromContract(caseItem, contract);

  // Build legacy ClosedDealRecord mirror via single authority constructor
  const closedDeal: ClosedDealRecord = buildClosedDealRecord(
    state, caseItem, input.opportunity, contract.dealPrice, input.evaluation,
  );

  if (input.consensusFormationId) closedDeal.consensusId = input.consensusFormationId;
  closedDeal.contractId = contract.contractId;
  if (input.opportunityClosureSetId) closedDeal.closureSetId = input.opportunityClosureSetId;
  prependClosedDealMirrorFromContractFact(state, closedDeal, contract.contractId, 'contract-fact');
}

function resolveNegotiationStrategy(strategyId?: string | null) {
  const strategies = BALANCE.actions.negotiation.strategies;
  return strategies[strategyId === 'hold' || strategyId === 'close' || strategyId === 'balanced' ? strategyId : 'balanced'];
}

function clearPendingDealClosing(state: GameState, opportunity: Opportunity) {
  setOpportunityPendingClosingOnState(state, opportunity, false, '', 0, '清空待结算状态');
}

// ---------------------------------------------------------------------------
// R30: Relation-layer reads using shared boundaries with old_save_compatibility fallback
// ---------------------------------------------------------------------------

/**
 * R30: Read trust from shared boundary with explicit fallback provenance.
 * Replaces local readRelationTrustForCase.
 */
function readTrustWithSource(state: GameState, caseItem: Case): { value: number; source: 'canonical_relation' | 'old_save_compatibility' } {
  const relationState = readBrokerOwnerTrustState(state, caseItem);
  if (relationState) {
    return { value: relationState.trust, source: 'canonical_relation' };
  }
  return { value: caseItem.trust, source: 'old_save_compatibility' };
}

interface RelationReadiness {
  readonly patience: number;
  readonly urgency: number;
  readonly source: 'canonical_relation' | 'old_save_compatibility';
}

/**
 * R30: Read readiness from shared boundary with explicit fallback provenance.
 * Replaces local readRelationReadinessForCase.
 */
function readReadinessWithSource(state: GameState, caseItem: Case): RelationReadiness {
  const readinessState = readOwnerCaseReadinessState(state, caseItem);
  if (readinessState) {
    return { patience: readinessState.patience, urgency: readinessState.urgency, source: 'canonical_relation' };
  }
  return { patience: caseItem.patience, urgency: caseItem.urgency, source: 'old_save_compatibility' };
}

function finalizeClosedDeal(
  state: GameState,
  caseItem: Case,
  opportunity: Opportunity,
  soldPrice: number,
  evaluation: DealClosingEvaluation,
  wordOfMouthBonus: number,
) {
  if ((state.runtimeContractFacts ?? []).some((cf) => cf.caseId === caseItem.id)) {
    clearPendingDealClosing(state, opportunity);
    return true;
  }

  // Mark consensus as signed on successful close, then create canonical artifacts
  const signedBrokered = findBrokeredStateForOpportunity(state, opportunity.id);
  const consensusId = signedBrokered
    ? buildConsensusFormationId(signedBrokered.brokeredOpportunityId)
    : undefined;
  // R26: consensus signing is now done from PriceConsensusProof when proof is available
  // (moved below after proof construction)

  // R44: Try canonical trajectory builder FIRST (requires real evidence)
  // R47: Merge pending + persisted source records so evidence from previous ticks
  // is available even after tickBigWorldRuntime clears pendingSourceRecords.
  const ownerId = caseItem.ownerName || `owner:${caseItem.id}`;
  const mergedPendingRecords = [
    ...(state.pendingSourceRecords ?? []),
    ...(state.bigWorldRuntime?.persistedSourceRecords ?? []),
  ];
  const canonicalResult = buildCanonicalPriceTrajectoryFromEvidence({
    state: createEvidenceStateView({ ...state, pendingSourceRecords: mergedPendingRecords }),
    caseId: caseItem.id,
    customerId: opportunity.customerId,
    ownerId,
    opportunityId: opportunity.id,
    day: state.day,
  });

  let canonicalTrajectory: PriceTrajectory;
  let canonicalReadiness: PriceConsensusReadiness;
  let canonicalProofAvailable = false;

  if (canonicalResult.success && canonicalResult.trajectory) {
    // R44: Canonical evidence found — use real trajectory
    canonicalTrajectory = canonicalResult.trajectory;
    canonicalReadiness = buildPriceConsensusReadiness(canonicalTrajectory);
    canonicalProofAvailable = true;
  } else {
    // R44: No canonical evidence — fall back to legacy projection for DISPLAY only
    // Note: legacy_compatibility_projection is NOT valid for production ContractFact signing
    canonicalTrajectory = buildPriceTrajectoryFromDealClosingEvaluation({
      caseId: caseItem.id,
      customerId: opportunity.customerId,
      ownerId,
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
    canonicalReadiness = buildPriceConsensusReadiness(canonicalTrajectory);
    // R44: Mark that we only have legacy projection — cannot sign with this
    canonicalProofAvailable = false;
  }

  storePriceTrajectoryAndReadiness(state, canonicalTrajectory, canonicalReadiness);

  // Validate trajectory has both BuyerOffer and OwnerConcession (R19 structural invariant)
  const trajectoryValidation = assertTrajectoryHasOfferAndConcession(canonicalTrajectory);

  // R27: Build PriceConsensusProof and validate — no scalar fallback
  // R44: Only create proof if canonical evidence was found
  let proof: PriceConsensusProof | undefined;
  if (canonicalReadiness.ready && trajectoryValidation.valid && canonicalProofAvailable) {
    proof = buildPriceConsensusProof({
      trajectory: canonicalTrajectory,
      readiness: canonicalReadiness,
      requiredProofKind: 'canonical',
    });
    const proofValidation = validatePriceConsensusProof(proof);
    if (!proofValidation.valid) {
      proof = undefined;
    }
  }

  // R27: No scalar fallback — contract only from proof
  // R44: Contract requires canonical proof (proofKind === 'canonical')
  let contractFact: ContractFactState | undefined;
  if (consensusId && proof && proof.proofKind === 'canonical') {
    if (!claimPlayerMarketDealSlot(state)) {
      markConsensusCollapsedOnState(state, signedBrokered!.brokeredOpportunityId, state.day, 'market capacity blocked');
      return false;
    }
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
    const reason = canonicalResult.success === false
      ? `canonical evidence missing: ${canonicalResult.reason}`
      : `proof invalid or not canonical (proofKind=${proof?.proofKind ?? 'undefined'})`;
    markConsensusCollapsedOnState(state, signedBrokered!.brokeredOpportunityId, state.day, reason);
  }

  // R20: Derive opportunity stage from trajectory for the closing path
  syncOpportunityStageMirrorFromTrajectoryOnState(state, opportunity, canonicalTrajectory, opportunity.stageIndex, 'deal close trajectory-derived stage');

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

  // R44: only proof-backed contracts may run post-close side-effects.
  if (contractFact) {
    syncLegacyCaseDealMirrorsFromContractFact(state, {
      contractFact,
      consensusFormationId: consensusId ?? '',
      opportunityClosureSetId: closureSet?.closureSetId,
      caseId: caseItem.id,
      opportunity,
      evaluation,
    });

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
      if (entry.caseId !== caseItem.id || !isOpportunityActiveByCanonicalState(state, entry)) {
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
        dealId: contractFact.contractId,
        soldPrice,
        commission,
        budgetReturn,
        closeReadiness: evaluation.closeReadiness,
        closeProbability: evaluation.closeProbability,
        ownerSatisfaction: readCaseTerminalOutcomeForCase(state, caseItem, caseItem.trust).ownerSatisfaction,
        defenseOutcome: readCaseTerminalOutcomeForCase(state, caseItem, caseItem.trust).defenseOutcome,
        endingType: readCaseTerminalOutcomeForCase(state, caseItem, caseItem.trust).endingType,
        endingBucket: readCaseTerminalOutcomeForCase(state, caseItem, caseItem.trust).endingBucket,
        relativeOutcome: readCaseTerminalOutcomeForCase(state, caseItem, caseItem.trust).relativeOutcome,
      },
    });

    logEvent(state, '成交快报', `${caseItem.title} 签了！最终 ${soldPrice} 万落锤，咱们组分了 ${commission} 个点，外加 ${budgetReturn} 个推广点，今晚加鸡腿！`, 'success');
  }

  if (!contractFact) {
    clearPendingDealClosing(state, opportunity);
  }

  return Boolean(contractFact);
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

  // R45: emit buyer offer source record for canonical trajectory
  const brokerId = state.bigWorldRuntime?.playerBrokerAcnId ?? 'player-broker';
  const offerPrice = computeBuyerOfferPrice(opportunity, caseItem);
  emitBuyerOfferSourceRecord(state, opportunity, caseItem, brokerId, offerPrice);

  // Legacy mirror writes (preserved for backward compatibility)
  setOpportunityPendingClosingOnState(state, opportunity, true, strategyId || 'balanced', state.day, '请求结算评估');
  setOpportunityTouchedTodayOnState(state, opportunity, true, '请求结算标记今日触达');
  setOpportunityDaysLeftOnState(state, opportunity, Math.max(opportunity.daysLeft, 2), '请求结算确保剩余天数');
  refreshOpportunityLabel(state, opportunity);
  logEvent(state, opportunity.customerName, `${caseItem.title} 马上要见真章了。今晚关门算总账，看看底牌能不能碰上。`, 'accent');
}

/**
 * Buyer offer price = marketPrice × (0.85 + intent/500), capped at budgetMax.
 * intent=0 → 85% market, intent=100 → 110% market.
 * Uses customer's real budget constraint, NOT soldPrice.
 */
function computeBuyerOfferPrice(opportunity: Opportunity, caseItem: Case): number {
  const intentFactor = 0.85 + (opportunity.intent / 500);
  const baseOffer = caseItem.marketPrice * intentFactor;
  return Math.round(Math.min(opportunity.budgetMax, baseOffer));
}

function emitBuyerOfferSourceRecord(
  state: GameState,
  opportunity: Opportunity,
  caseItem: Case,
  brokerId: string,
  offerPrice: number,
): void {
  if (!state.pendingSourceRecords) {
    asWritableGameState(state).pendingSourceRecords = [];
  }

  const sourceId = `isr-offer-${state.day}-${opportunity.customerId}-${caseItem.id}`;

  const record = {
    sourceId,
    sourceKind: 'customer_interaction' as const,
    day: state.day,
    phase: 'evening' as const,
    entityRefs: [
      { id: caseItem.id, kind: 'case' as const },
      { id: opportunity.customerId, kind: 'customer' as const },
    ],
    actorRefs: [
      { id: brokerId, role: 'player_broker' as const },
    ],
    visibility: { scope: 'player_only' as const, baseDelayDays: 0 },
    confidence: 0.85 + (opportunity.intent / 1000),
    delayDays: 0,
    replayKey: `rk-offer-${state.runContext.runSeed}-${state.day}-${opportunity.customerId}`,
    origin: 'player_action' as const,
    payload: {
      summary: `${opportunity.customerName} 对 ${caseItem.title} 提交了购买意向报价 ${offerPrice} 万。`,
      subtype: 'offer_submitted' as const,
      customerId: opportunity.customerId,
      caseId: caseItem.id,
      listingId: undefined,
      opportunityId: opportunity.id,
      fitScore: opportunity.fit,
      interestLevel: opportunity.intent,
      observationMode: 'direct' as const,
      offerPrice,
    },
  };

  asWritableGameState(state).pendingSourceRecords = [...state.pendingSourceRecords, record];
}

export function settlePendingDealClosings(state: GameState) {
  const pendingOpportunities = state.opportunities.filter((entry) => isOpportunityActiveByCanonicalState(state, entry) && entry.pendingClosingEvaluation);
  pendingOpportunities.forEach((opportunity) => {
    const caseItem = state.cases.find((entry) => entry.id === opportunity.caseId);
    if (!caseItem || !isCaseActiveByCanonicalStatus(state, caseItem)) {
      clearPendingDealClosing(state, opportunity);
      return;
    }
    if ((state.runtimeContractFacts ?? []).some((cf) => cf.caseId === caseItem.id)) {
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
      // R26/R44: consensus signing and market-slot claim happen inside finalizeClosedDeal
      // only after canonical proof is available.
      if (!finalizeClosedDeal(state, caseItem, opportunity, soldPrice, evaluation, strategy.wordOfMouthBonus)) {
        if (isClosingBlockedByMarketCapacity(state, evaluation)) {
          resolveCapacityBlockedPendingClosing(state, caseItem, opportunity);
        } else {
          const ownerProfileForFailure = readOwnerDecisionProfile(caseItem);
          resolveFailedPendingClosing(state, caseItem, opportunity, strategyId, ownerProfileForFailure, evaluation);
        }
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

  // R30: Read trust from shared boundary with explicit provenance
  const trustResult = readTrustWithSource(state, caseItem);
  const trust = trustResult.value;
  const trustSource: EvaluationSourceTrace['trustSource'] =
    trustResult.source === 'canonical_relation' ? 'relation' : 'old_save_compatibility';
  const readiness = readReadinessWithSource(state, caseItem);
  const ownerProfile = readOwnerDecisionProfile(caseItem);

  // R33: Read broker-customer trust from shared read boundary
  const bcrResult = readBrokerCustomerTrustFromBoundary(state, brokerId, opportunity.customerId);

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
    readinessSource: readiness.source === 'canonical_relation' ? 'relation' : 'old_save_compatibility',
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
