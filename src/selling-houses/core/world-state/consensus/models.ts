/**
 * ConsensusFormation v0 / OfferThread v0 / ContractFact semantic contract.
 *
 * These types are READ-ONLY semantic models. They explain the legacy
 * "probability-based deal closing" in mother-model vocabulary.
 *
 * They do NOT replace the legacy engine. They do NOT mutate GameState.
 * Case remains the runtime fact source in Round 1.
 *
 * Mother model reference: Section 4 (ConsensusFormation), Section 16 (OfferThread, ContractFact, OpportunityClosureSet).
 */

// ---------------------------------------------------------------------------
// ConsensusFormationStatus: lifecycle states for consensus formation
// ---------------------------------------------------------------------------

export type ConsensusFormationStatus =
  | 'not_started'
  | 'price_gap_visible'
  | 'negotiable_zone'
  | 'tentative_alignment'
  | 'verbal_acceptance'
  | 'formal_offer'
  | 'contract_ready'
  | 'signed'
  | 'collapsed';

// ---------------------------------------------------------------------------
// OfferAttempt: a single offer attempt within an OfferThread
// ---------------------------------------------------------------------------

export interface OfferAttempt {
  readonly attemptIndex: number;
  readonly day: number;
  readonly strategyId: string;
  readonly soldPrice: number;
  readonly closeReadiness: number;
  readonly closeProbability: number;
  readonly outcome: 'signed' | 'failed' | 'capacity_blocked';
  readonly blockingReasons: readonly string[];
  readonly supportingReasons: readonly string[];
}

// ---------------------------------------------------------------------------
// OfferThread: negotiation/offer progression through stages
// ---------------------------------------------------------------------------

export interface OfferThread {
  readonly threadId: string;
  readonly opportunityId: string;
  readonly caseId: string;
  readonly customerId: string;
  readonly stageIndex: number;
  readonly stageLabel: string;
  readonly status: string;
  readonly lifecycleStatus: string;
  readonly daysLeft: number;
  readonly stagnationTicks: number;
  readonly attempts: readonly OfferAttempt[];
  readonly createdAtDay: number;
}

// ---------------------------------------------------------------------------
// ConsensusBlocker: what prevented consensus from forming
// ---------------------------------------------------------------------------

export interface ConsensusBlocker {
  readonly kind: 'price_exceeds_budget' | 'low_owner_trust' | 'market_capacity' | 'player_capacity' | 'custom';
  readonly description: string;
  readonly severity: 'hard' | 'soft';
}

// ---------------------------------------------------------------------------
// ConsensusFormationReceipt: explanation of why consensus formed or didn't
// ---------------------------------------------------------------------------

export interface ConsensusFormationReceipt {
  readonly caseId: string;
  readonly opportunityId: string;
  readonly day: number;
  readonly closeReadiness: number;
  readonly closeProbability: number;
  readonly isEligible: boolean;
  readonly blockers: readonly ConsensusBlocker[];
  readonly supportingFactors: readonly string[];
  readonly strategyId: string;
  readonly outcome: 'signed' | 'failed' | 'capacity_blocked' | 'pending';
}

// ---------------------------------------------------------------------------
// OpportunityClosureSet: one contract closes many related opportunities
// ---------------------------------------------------------------------------

export interface OpportunityClosureSet {
  readonly signedOpportunityId: string;
  readonly closedOpportunityIds: readonly string[];
  readonly closureReason: string;
  readonly day: number;
}

// ---------------------------------------------------------------------------
// ContractFact: the terminal formal fact (not case.status = sold)
// ---------------------------------------------------------------------------

export interface ContractFact {
  readonly dealId: string;
  readonly assetCaseId: string;
  readonly customerId: string;
  readonly sourceOpportunityId: string;
  readonly closeDay: number;
  readonly closedAt: string;
  readonly dealType: string;
  readonly dealPrice: number;
  readonly closeReadiness: number;
  readonly closeProbability: number;
  readonly blockers: readonly ConsensusBlocker[];
  readonly supportingFactors: readonly string[];
  readonly marketSnapshot: {
    readonly askPrice: number;
    readonly marketPrice: number;
    readonly bottomPrice: number;
    readonly competitiveness: number;
    readonly trust: number;
    readonly d1: number;
    readonly d2: number;
    readonly d3: number;
  };
  readonly priceSnapshot: {
    readonly soldPrice: number;
    readonly askPrice: number;
    readonly marketPrice: number;
    readonly bottomPrice: number;
    readonly discountToAskPct: number;
    readonly premiumToMarketPct: number;
  };
}

// ---------------------------------------------------------------------------
// ConsensusFormation v0: wraps legacy pendingClosingEvaluation state
// ---------------------------------------------------------------------------

export interface ConsensusFormationV0 {
  readonly caseId: string;
  readonly opportunityId: string;
  readonly status: ConsensusFormationStatus;
  readonly pendingEvaluation: boolean;
  readonly pendingStrategyId?: string;
  readonly pendingRequestedDay?: number;
  readonly receipt?: ConsensusFormationReceipt;
  readonly offerThread: OfferThread;
}
