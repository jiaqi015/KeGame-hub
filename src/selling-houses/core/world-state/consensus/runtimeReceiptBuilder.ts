/**
 * Runtime receipt builder: derives ConsensusFormation receipts from negotiation process manager data.
 *
 * This builder takes the output of NegotiationProcessManagerResult and produces
 * read-only consensus formations, receipts, and closure sets.
 *
 * It does NOT re-compute probabilities. It does NOT mutate GameState.
 * It explains what happened in mother-model vocabulary.
 */

import type {
  ConsensusBlocker,
  ConsensusFormationReceipt,
  ConsensusFormationStatus,
  ConsensusFormationV0,
  ContractFact,
  OfferThread,
  OpportunityClosureSet,
} from './models.js';
import { parseBlockers } from './legacyAdapter.js';

// ---------------------------------------------------------------------------
// Input shapes (from NegotiationProcessManagerResult, no domain import)
// ---------------------------------------------------------------------------

export interface NegotiationTickInput {
  readonly pendingBefore: readonly string[];
  readonly pendingAfter: readonly string[];
  readonly resolvedOpportunityIds: readonly string[];
  readonly emittedEvents: readonly TickEventShape[];
  readonly closedDeals: readonly ClosedDealTickShape[];
  readonly day: number;
}

export interface TickEventShape {
  readonly kind: string;
  readonly caseId?: string;
  readonly opportunityId?: string;
  readonly customerId?: string;
  readonly tone?: string;
  readonly payload?: Record<string, unknown>;
}

export interface ClosedDealTickShape {
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
}

// ---------------------------------------------------------------------------
// Output shapes
// ---------------------------------------------------------------------------

export interface ConsensusTickFormation {
  readonly opportunityId: string;
  readonly caseId: string;
  readonly customerId: string;
  readonly status: ConsensusFormationStatus;
  readonly receipt: ConsensusFormationReceipt;
  readonly contractFact?: ContractFact;
  readonly closureSet?: OpportunityClosureSet;
}

export interface ConsensusTickReceiptBundle {
  readonly day: number;
  readonly formations: readonly ConsensusTickFormation[];
  readonly signedCount: number;
  readonly collapsedCount: number;
  readonly blockedCount: number;
  readonly stillPendingCount: number;
}

// ---------------------------------------------------------------------------
// Derivation logic
// ---------------------------------------------------------------------------

function findDealForOpportunity(
  deals: readonly ClosedDealTickShape[],
  opportunityId: string,
): ClosedDealTickShape | undefined {
  return deals.find((d) => d.sourceRelationId === opportunityId);
}

function findCapacityBlockEvent(
  events: readonly TickEventShape[],
  opportunityId: string,
): TickEventShape | undefined {
  return events.find(
    (e) => e.opportunityId === opportunityId
      && e.payload?.reason === 'market_capacity_blocked',
  );
}

function findFailureEvent(
  events: readonly TickEventShape[],
  opportunityId: string,
): TickEventShape | undefined {
  return events.find(
    (e) => e.opportunityId === opportunityId
      && (e.kind === 'opportunity_lost' || e.tone === 'danger')
      && e.payload?.reason !== 'market_capacity_blocked',
  );
}

function buildReceiptFromDeal(deal: ClosedDealTickShape, day: number): ConsensusFormationReceipt {
  return Object.freeze({
    caseId: deal.caseId,
    opportunityId: deal.sourceRelationId,
    day,
    closeReadiness: deal.closeReadiness,
    closeProbability: deal.closeProbability,
    isEligible: deal.blockingReasons.length === 0,
    blockers: Object.freeze(parseBlockers(deal.blockingReasons)),
    supportingFactors: Object.freeze([...deal.supportingReasons]),
    strategyId: 'legacy',
    outcome: 'signed',
  });
}

function buildContractFactFromTickDeal(deal: ClosedDealTickShape): ContractFact {
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
      askPrice: 0, marketPrice: 0, bottomPrice: 0,
      competitiveness: 0, trust: 0, d1: 0, d2: 0, d3: 0,
    }),
    priceSnapshot: Object.freeze({
      soldPrice: deal.dealPrice, askPrice: 0, marketPrice: 0,
      bottomPrice: 0, discountToAskPct: 0, premiumToMarketPct: 0,
    }),
  });
}

function buildClosureSetFromDeal(
  deal: ClosedDealTickShape,
  allClosedOpportunityIds: readonly string[],
  day: number,
): OpportunityClosureSet {
  const others = allClosedOpportunityIds.filter((id) => id !== deal.sourceRelationId);
  return Object.freeze({
    signedOpportunityId: deal.sourceRelationId,
    closedOpportunityIds: Object.freeze([...others]),
    closureReason: 'contract_signed',
    day,
  });
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildConsensusTickReceiptBundle(
  input: NegotiationTickInput,
): ConsensusTickReceiptBundle {
  const formations: ConsensusTickFormation[] = [];

  for (const oppId of input.resolvedOpportunityIds) {
    const deal = findDealForOpportunity(input.closedDeals, oppId);

    if (deal) {
      // signed
      const receipt = buildReceiptFromDeal(deal, input.day);
      const contractFact = buildContractFactFromTickDeal(deal);
      const closureSet = buildClosureSetFromDeal(
        deal,
        input.closedDeals.map((d) => d.sourceRelationId),
        input.day,
      );
      formations.push(Object.freeze({
        opportunityId: oppId,
        caseId: deal.caseId,
        customerId: deal.customerId,
        status: 'signed' as ConsensusFormationStatus,
        receipt,
        contractFact,
        closureSet,
      }));
      continue;
    }

    const capacityBlock = findCapacityBlockEvent(input.emittedEvents, oppId);
    if (capacityBlock) {
      // blocked
      const receipt: ConsensusFormationReceipt = Object.freeze({
        caseId: (capacityBlock.caseId ?? '') as string,
        opportunityId: oppId,
        day: input.day,
        closeReadiness: 0,
        closeProbability: 0,
        isEligible: false,
        blockers: Object.freeze([{
          kind: 'market_capacity' as const,
          description: '今日成交窗口已被占满',
          severity: 'hard' as const,
        }]),
        supportingFactors: Object.freeze([]),
        strategyId: 'legacy',
        outcome: 'capacity_blocked',
      });
      formations.push(Object.freeze({
        opportunityId: oppId,
        caseId: capacityBlock.caseId ?? '',
        customerId: capacityBlock.customerId ?? '',
        status: 'collapsed' as ConsensusFormationStatus,
        receipt,
      }));
      continue;
    }

    const failureEvent = findFailureEvent(input.emittedEvents, oppId);
    if (failureEvent) {
      // collapsed (failed negotiation)
      const receipt: ConsensusFormationReceipt = Object.freeze({
        caseId: (failureEvent.caseId ?? '') as string,
        opportunityId: oppId,
        day: input.day,
        closeReadiness: 0,
        closeProbability: 0,
        isEligible: false,
        blockers: Object.freeze([{
          kind: 'custom' as const,
          description: '谈判失败，客户流失',
          severity: 'hard' as const,
        }]),
        supportingFactors: Object.freeze([]),
        strategyId: 'legacy',
        outcome: 'failed',
      });
      formations.push(Object.freeze({
        opportunityId: oppId,
        caseId: failureEvent.caseId ?? '',
        customerId: failureEvent.customerId ?? '',
        status: 'collapsed' as ConsensusFormationStatus,
        receipt,
      }));
      continue;
    }

    // resolved but no deal/capacity_block/failure — treat as collapsed (generic)
    formations.push(Object.freeze({
      opportunityId: oppId,
      caseId: '',
      customerId: '',
      status: 'collapsed' as ConsensusFormationStatus,
      receipt: Object.freeze({
        caseId: '',
        opportunityId: oppId,
        day: input.day,
        closeReadiness: 0,
        closeProbability: 0,
        isEligible: false,
        blockers: Object.freeze([]),
        supportingFactors: Object.freeze([]),
        strategyId: 'legacy',
        outcome: 'failed',
      }),
    }));
  }

  // still_pending: pendingAfter minus resolved
  const resolvedSet = new Set(input.resolvedOpportunityIds);
  const stillPending = input.pendingAfter.filter((id) => !resolvedSet.has(id));
  for (const oppId of stillPending) {
    formations.push(Object.freeze({
      opportunityId: oppId,
      caseId: '',
      customerId: '',
      status: 'formal_offer' as ConsensusFormationStatus,
      receipt: Object.freeze({
        caseId: '',
        opportunityId: oppId,
        day: input.day,
        closeReadiness: 0,
        closeProbability: 0,
        isEligible: true,
        blockers: Object.freeze([]),
        supportingFactors: Object.freeze([]),
        strategyId: 'legacy',
        outcome: 'pending',
      }),
    }));
  }

  return Object.freeze({
    day: input.day,
    formations: Object.freeze(formations),
    signedCount: formations.filter((f) => f.status === 'signed').length,
    collapsedCount: formations.filter((f) => f.status === 'collapsed' && f.receipt.outcome !== 'capacity_blocked').length,
    blockedCount: formations.filter((f) => f.receipt.outcome === 'capacity_blocked').length,
    stillPendingCount: stillPending.length,
  });
}
