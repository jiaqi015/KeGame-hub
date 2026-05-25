/**
 * Pure adapter: legacy Opportunity/ClosedDealRecord fields → ConsensusFormation v0 semantic model.
 *
 * This adapter does NOT mutate GameState. It is a read-only projection.
 * Case remains the runtime fact source.
 */

import type {
  ConsensusBlocker,
  ConsensusFormationReceipt,
  ConsensusFormationStatus,
  ConsensusFormationV0,
  ContractFact,
  OfferAttempt,
  OfferThread,
  OpportunityClosureSet,
} from './models.js';

// ---------------------------------------------------------------------------
// Legacy shape interfaces (string-typed, no domain import)
// ---------------------------------------------------------------------------

export interface LegacyOpportunityShape {
  readonly id: string;
  readonly caseId: string;
  readonly customerId: string;
  readonly stageIndex: number;
  readonly stageLabel: string;
  readonly status: string;
  readonly lifecycleStatus: string;
  readonly daysLeft: number;
  readonly stagnationTicks: number;
  readonly pendingClosingEvaluation?: boolean;
  readonly pendingClosingStrategyId?: string;
  readonly pendingClosingRequestedDay?: number;
  readonly createdDay: number;
}

export interface LegacyClosedDealShape {
  readonly dealId: string;
  readonly caseId: string;
  readonly customerId: string;
  readonly sourceRelationId: string;
  readonly dayIndex: number;
  readonly closedAt: string;
  readonly dealType: string;
  readonly dealPrice: number;
  readonly closeReadiness: number;
  readonly closeProbability: number;
  readonly blockingReasons: readonly string[];
  readonly supportingReasons: readonly string[];
  readonly marketSnapshot?: {
    readonly askPrice: number;
    readonly marketPrice: number;
    readonly bottomPrice: number;
    readonly competitiveness: number;
    readonly trust: number;
    readonly d1: number;
    readonly d2: number;
    readonly d3: number;
  };
  readonly priceSnapshot?: {
    readonly soldPrice: number;
    readonly askPrice: number;
    readonly marketPrice: number;
    readonly bottomPrice: number;
    readonly discountToAskPct: number;
    readonly premiumToMarketPct: number;
  };
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

function mapStageToConsensusStatus(stageIndex: number, status: string): ConsensusFormationStatus {
  if (status === 'won') return 'signed';
  if (status === 'lost' || status === 'closed') return 'collapsed';
  // Legacy fallback: stageIndex-based mapping. For signed/contract paths,
  // ConsensusFormation must reference a PriceTrajectory with at least one
  // BuyerOffer and one OwnerConcession (enforced by R19 gate).
  if (stageIndex >= 5) return 'contract_ready';
  if (stageIndex >= 4) return 'formal_offer';
  if (stageIndex >= 3) return 'verbal_acceptance';
  if (stageIndex >= 2) return 'tentative_alignment';
  if (stageIndex >= 1) return 'negotiable_zone';
  return 'price_gap_visible';
}

export function parseBlockers(reasons: readonly string[]): readonly ConsensusBlocker[] {
  return reasons.map((reason) => {
    if (reason.includes('超预算')) {
      return { kind: 'price_exceeds_budget', description: reason, severity: 'hard' } as ConsensusBlocker;
    }
    if (reason.includes('不靠谱') || reason.includes('信任')) {
      return { kind: 'low_owner_trust', description: reason, severity: 'hard' } as ConsensusBlocker;
    }
    if (reason.includes('成交名额') || reason.includes('市场')) {
      return { kind: 'market_capacity', description: reason, severity: 'hard' } as ConsensusBlocker;
    }
    if (reason.includes('自成交空间') || reason.includes('经营表现')) {
      return { kind: 'player_capacity', description: reason, severity: 'hard' } as ConsensusBlocker;
    }
    return { kind: 'custom', description: reason, severity: 'soft' } as ConsensusBlocker;
  });
}

// ---------------------------------------------------------------------------
// Pure adapter functions
// ---------------------------------------------------------------------------

export function buildOfferThreadFromLegacy(opportunity: LegacyOpportunityShape): OfferThread {
  return Object.freeze({
    threadId: `thread-${opportunity.id}`,
    opportunityId: opportunity.id,
    caseId: opportunity.caseId,
    customerId: opportunity.customerId,
    stageIndex: opportunity.stageIndex,
    stageLabel: opportunity.stageLabel,
    status: opportunity.status,
    lifecycleStatus: opportunity.lifecycleStatus,
    daysLeft: opportunity.daysLeft,
    stagnationTicks: opportunity.stagnationTicks,
    attempts: Object.freeze([]),
    createdAtDay: opportunity.createdDay,
  });
}

export function buildOfferAttemptFromDeal(deal: LegacyClosedDealShape, attemptIndex: number): OfferAttempt {
  return Object.freeze({
    attemptIndex,
    day: deal.dayIndex,
    strategyId: 'legacy',
    soldPrice: deal.dealPrice,
    closeReadiness: deal.closeReadiness,
    closeProbability: deal.closeProbability,
    outcome: 'signed',
    blockingReasons: Object.freeze([...deal.blockingReasons]),
    supportingReasons: Object.freeze([...deal.supportingReasons]),
  });
}

export function buildConsensusFormationReceiptFromDeal(deal: LegacyClosedDealShape): ConsensusFormationReceipt {
  return Object.freeze({
    caseId: deal.caseId,
    opportunityId: deal.sourceRelationId,
    day: deal.dayIndex,
    closeReadiness: deal.closeReadiness,
    closeProbability: deal.closeProbability,
    isEligible: deal.blockingReasons.length === 0,
    blockers: Object.freeze(parseBlockers(deal.blockingReasons)),
    supportingFactors: Object.freeze([...deal.supportingReasons]),
    strategyId: 'legacy',
    outcome: 'signed',
  });
}

export function buildContractFactFromDeal(deal: LegacyClosedDealShape): ContractFact {
  return Object.freeze({
    dealId: deal.dealId,
    assetCaseId: deal.caseId,
    customerId: deal.customerId,
    sourceOpportunityId: deal.sourceRelationId,
    closeDay: deal.dayIndex,
    closedAt: deal.closedAt,
    dealType: deal.dealType,
    dealPrice: deal.dealPrice,
    closeReadiness: deal.closeReadiness,
    closeProbability: deal.closeProbability,
    blockers: Object.freeze(parseBlockers(deal.blockingReasons)),
    supportingFactors: Object.freeze([...deal.supportingReasons]),
    marketSnapshot: Object.freeze({
      askPrice: deal.marketSnapshot?.askPrice ?? 0,
      marketPrice: deal.marketSnapshot?.marketPrice ?? 0,
      bottomPrice: deal.marketSnapshot?.bottomPrice ?? 0,
      competitiveness: deal.marketSnapshot?.competitiveness ?? 0,
      trust: deal.marketSnapshot?.trust ?? 0,
      d1: deal.marketSnapshot?.d1 ?? 0,
      d2: deal.marketSnapshot?.d2 ?? 0,
      d3: deal.marketSnapshot?.d3 ?? 0,
    }),
    priceSnapshot: Object.freeze({
      soldPrice: deal.priceSnapshot?.soldPrice ?? deal.dealPrice,
      askPrice: deal.priceSnapshot?.askPrice ?? 0,
      marketPrice: deal.priceSnapshot?.marketPrice ?? 0,
      bottomPrice: deal.priceSnapshot?.bottomPrice ?? 0,
      discountToAskPct: deal.priceSnapshot?.discountToAskPct ?? 0,
      premiumToMarketPct: deal.priceSnapshot?.premiumToMarketPct ?? 0,
    }),
  });
}

export function buildOpportunityClosureSetFromDeal(
  deal: LegacyClosedDealShape,
  closedOpportunityIds: readonly string[],
): OpportunityClosureSet {
  return Object.freeze({
    signedOpportunityId: deal.sourceRelationId,
    closedOpportunityIds: Object.freeze([...closedOpportunityIds]),
    closureReason: 'contract_signed',
    day: deal.dayIndex,
  });
}

export function buildConsensusFormationV0FromLegacy(
  opportunity: LegacyOpportunityShape,
): ConsensusFormationV0 {
  const offerThread = buildOfferThreadFromLegacy(opportunity);
  const status = mapStageToConsensusStatus(opportunity.stageIndex, opportunity.status);

  return Object.freeze({
    caseId: opportunity.caseId,
    opportunityId: opportunity.id,
    status,
    pendingEvaluation: opportunity.pendingClosingEvaluation ?? false,
    pendingStrategyId: opportunity.pendingClosingStrategyId,
    pendingRequestedDay: opportunity.pendingClosingRequestedDay,
    offerThread,
  });
}
