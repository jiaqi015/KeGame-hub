/**
 * Consensus / ContractFact / OpportunityClosureSet Write Source v0.
 *
 * Canonical runtime state for deal consensus formation, contract facts,
 * and opportunity closure sets.
 *
 * Mother model alignment:
 * - ConsensusFormation = seller POV acceptance × buyer POV acceptance
 *   × price/terms negotiation × relation trust × alternatives
 *   × urgency/timing × service-path confidence (Section 4)
 * - ContractFact = terminal formal fact, not case.status=sold (Section 4.3)
 * - OpportunityClosureSet = one contract closes many related opportunities (Section 4.3)
 *
 * Migration direction:
 * - pendingClosing* fields on legacy Opportunity → ConsensusFormationState
 * - ClosedDealRecord fields → ContractFactState (legacy mirror preserved)
 * - dealClosing.ts probability dice-roll → ConsensusFormation stage gates
 *
 * Hard constraints:
 * 1. Pure functions in core — no domain/runtime imports.
 * 2. No Date.now, no Math.random, no crypto, no global state.
 * 3. Deterministic: same input → same output.
 * 4. Write functions return frozen objects — no mutation.
 * 5. Legacy ClosedDealRecord remains as compatibility mirror.
 */

// ---------------------------------------------------------------------------
// ConsensusFormationState: canonical consensus formation runtime state
// ---------------------------------------------------------------------------

export type ConsensusStage =
  | 'not_started'
  | 'price_gap_visible'
  | 'negotiable_zone'
  | 'tentative_alignment'
  | 'verbal_acceptance'
  | 'formal_offer'
  | 'contract_ready'
  | 'signed'
  | 'collapsed';

export interface ConsensusFormationState {
  /** Stable consensus id: consensus:${brokeredOpportunityId} */
  readonly consensusId: string;
  /** Source brokered opportunity id */
  readonly brokeredOpportunityId: string;
  /** Match id (customer-case match) */
  readonly matchId: string;
  /** Case id */
  readonly caseId: string;
  /** Customer id */
  readonly customerId: string;
  /** Current consensus stage */
  readonly stage: ConsensusStage;
  /** Negotiation strategy id (hold/close/balanced) */
  readonly strategyId: string;
  /** Close readiness score (0-100) */
  readonly closeReadiness: number;
  /** Close probability (0-95) */
  readonly closeProbability: number;
  /** Active blockers preventing consensus */
  readonly blockers: readonly string[];
  /** Supporting factors for consensus */
  readonly supportingFactors: readonly string[];
  /** Day consensus was requested */
  readonly requestedDay: number;
  /** Day consensus was last updated */
  readonly lastUpdatedDay: number;
  /** Source event refs */
  readonly sourceEventRefs: readonly string[];
  /** R20: Weight explanations for close probability computation */
  readonly weightExplanations: readonly import('./priceTrajectory.js').WeightExplanation[];
}

// ---------------------------------------------------------------------------
// ConsensusFormationRecord: immutable record of a consensus change
// ---------------------------------------------------------------------------

export interface ConsensusFormationRecord {
  readonly consensusId: string;
  readonly day: number;
  readonly field: string;
  readonly previousValue: string;
  readonly newValue: string;
  readonly reason: string;
  readonly sourceEventRefs: readonly string[];
}

// ---------------------------------------------------------------------------
// ContractFactState: canonical contract fact runtime state
// ---------------------------------------------------------------------------

export interface ContractFactState {
  /** Stable contract id: contract:${caseId}:${customerId}:${day} */
  readonly contractId: string;
  /** Source consensus formation id */
  readonly consensusId: string;
  /** Source brokered opportunity id */
  readonly brokeredOpportunityId: string;
  /** Case id (the asset) */
  readonly caseId: string;
  /** Customer id (the buyer) */
  readonly customerId: string;
  /** Deal price (万) */
  readonly dealPrice: number;
  /** Deal type (self_closed, broker_mediated, etc.) */
  readonly dealType: string;
  /** Day the contract was signed */
  readonly signedDay: number;
  /** Source ClosedDealRecord id (legacy bridge) */
  readonly sourceClosedDealId: string;
  /** Close readiness at time of deal */
  readonly closeReadiness: number;
  /** Close probability at time of deal */
  readonly closeProbability: number;
  /** Blockers that were resolved */
  readonly resolvedBlockers: readonly string[];
  /** Supporting factors that led to deal */
  readonly supportingFactors: readonly string[];
  /** Source event refs */
  readonly sourceEventRefs: readonly string[];
  /** R20: Weight explanations for close probability at contract time */
  readonly weightExplanations: readonly import('./priceTrajectory.js').WeightExplanation[];
  /** R26: Price consensus proof id */
  readonly priceConsensusProofId?: string;
  /** R26: Price trajectory id */
  readonly priceTrajectoryId?: string;
  /** R26: Buyer offer id */
  readonly buyerOfferId?: string;
  /** R26: Owner concession id */
  readonly ownerConcessionId?: string;
  /** R26: Agreed price from proof */
  readonly agreedPrice?: number;
}

// ---------------------------------------------------------------------------
// OpportunityClosureSetState: one contract closes many opportunities
// ---------------------------------------------------------------------------

export interface OpportunityClosureSetState {
  /** Stable closure set id: closure:${contractId} */
  readonly closureSetId: string;
  /** Source contract fact id */
  readonly contractId: string;
  /** The winning opportunity id */
  readonly wonOpportunityId: string;
  /** All closed opportunity ids (including won) */
  readonly closedOpportunityIds: readonly string[];
  /** Losing customer ids */
  readonly losingCustomerIds: readonly string[];
  /** Closure reason */
  readonly reason: string;
  /** Day of closure */
  readonly day: number;
  /** Source event refs */
  readonly sourceEventRefs: readonly string[];
}

// ---------------------------------------------------------------------------
// Deterministic ID builders
// ---------------------------------------------------------------------------

export function buildConsensusFormationId(brokeredOpportunityId: string): string {
  return `consensus:${brokeredOpportunityId}`;
}

export function buildContractFactId(caseId: string, customerId: string, day: number): string {
  return `contract:${caseId}:${customerId}:${day}`;
}

export function buildOpportunityClosureSetId(contractId: string): string {
  return `closure:${contractId}`;
}

// ---------------------------------------------------------------------------
// ConsensusFormationState write functions (pure, no mutation)
// ---------------------------------------------------------------------------

export function createConsensusFormationState(
  brokeredOpportunityId: string,
  matchId: string,
  caseId: string,
  customerId: string,
  strategyId: string,
  day: number,
): ConsensusFormationState {
  return Object.freeze({
    consensusId: buildConsensusFormationId(brokeredOpportunityId),
    brokeredOpportunityId,
    matchId,
    caseId,
    customerId,
    stage: 'not_started',
    strategyId,
    closeReadiness: 0,
    closeProbability: 0,
    blockers: Object.freeze([]),
    supportingFactors: Object.freeze([]),
    requestedDay: day,
    lastUpdatedDay: day,
    sourceEventRefs: Object.freeze([]),
    weightExplanations: Object.freeze([]),
  });
}

export function setConsensusStage(
  state: ConsensusFormationState,
  stage: ConsensusStage,
  day: number,
  reason: string,
  sourceEventRefs: readonly string[] = [],
): { state: ConsensusFormationState; record: ConsensusFormationRecord } {
  const newState: ConsensusFormationState = Object.freeze({
    ...state,
    stage,
    lastUpdatedDay: day,
    sourceEventRefs: Object.freeze([...sourceEventRefs]),
  });

  const record: ConsensusFormationRecord = Object.freeze({
    consensusId: state.consensusId,
    day,
    field: 'stage',
    previousValue: state.stage,
    newValue: stage,
    reason,
    sourceEventRefs: Object.freeze([...sourceEventRefs]),
  });

  return { state: newState, record };
}

export function setConsensusEvaluation(
  state: ConsensusFormationState,
  evaluation: {
    closeReadiness: number;
    closeProbability: number;
    blockers: readonly string[];
    supportingFactors: readonly string[];
    strategyId?: string;
    weightExplanations?: readonly import('./priceTrajectory.js').WeightExplanation[];
  },
  day: number,
  reason: string,
  sourceEventRefs: readonly string[] = [],
): { state: ConsensusFormationState; record: ConsensusFormationRecord } {
  const newState: ConsensusFormationState = Object.freeze({
    ...state,
    closeReadiness: clampValue(evaluation.closeReadiness),
    closeProbability: clampValue(evaluation.closeProbability, 0, 95),
    blockers: Object.freeze([...evaluation.blockers]),
    supportingFactors: Object.freeze([...evaluation.supportingFactors]),
    strategyId: evaluation.strategyId ?? state.strategyId,
    lastUpdatedDay: day,
    sourceEventRefs: Object.freeze([...sourceEventRefs]),
    weightExplanations: Object.freeze([...(evaluation.weightExplanations ?? state.weightExplanations)]),
  });

  const record: ConsensusFormationRecord = Object.freeze({
    consensusId: state.consensusId,
    day,
    field: 'evaluation',
    previousValue: `readiness:${state.closeReadiness},prob:${state.closeProbability}`,
    newValue: `readiness:${evaluation.closeReadiness},prob:${evaluation.closeProbability}`,
    reason,
    sourceEventRefs: Object.freeze([...sourceEventRefs]),
  });

  return { state: newState, record };
}

export function markConsensusSigned(
  state: ConsensusFormationState,
  day: number,
  reason: string,
  sourceEventRefs: readonly string[] = [],
): { state: ConsensusFormationState; record: ConsensusFormationRecord } {
  const newState: ConsensusFormationState = Object.freeze({
    ...state,
    stage: 'signed',
    lastUpdatedDay: day,
    sourceEventRefs: Object.freeze([...sourceEventRefs]),
  });

  const record: ConsensusFormationRecord = Object.freeze({
    consensusId: state.consensusId,
    day,
    field: 'stage',
    previousValue: state.stage,
    newValue: 'signed',
    reason,
    sourceEventRefs: Object.freeze([...sourceEventRefs]),
  });

  return { state: newState, record };
}

export function markConsensusCollapsed(
  state: ConsensusFormationState,
  day: number,
  reason: string,
  sourceEventRefs: readonly string[] = [],
): { state: ConsensusFormationState; record: ConsensusFormationRecord } {
  const newState: ConsensusFormationState = Object.freeze({
    ...state,
    stage: 'collapsed',
    lastUpdatedDay: day,
    sourceEventRefs: Object.freeze([...sourceEventRefs]),
  });

  const record: ConsensusFormationRecord = Object.freeze({
    consensusId: state.consensusId,
    day,
    field: 'stage',
    previousValue: state.stage,
    newValue: 'collapsed',
    reason,
    sourceEventRefs: Object.freeze([...sourceEventRefs]),
  });

  return { state: newState, record };
}

// ---------------------------------------------------------------------------
// ContractFactState write functions (pure, no mutation)
// ---------------------------------------------------------------------------

export function createContractFactState(
  consensusId: string,
  brokeredOpportunityId: string,
  caseId: string,
  customerId: string,
  dealPrice: number,
  dealType: string,
  signedDay: number,
  sourceClosedDealId: string,
  closeReadiness: number,
  closeProbability: number,
  resolvedBlockers: readonly string[],
  supportingFactors: readonly string[],
  sourceEventRefs: readonly string[] = [],
  weightExplanations: readonly import('./priceTrajectory.js').WeightExplanation[] = [],
): ContractFactState {
  return Object.freeze({
    contractId: buildContractFactId(caseId, customerId, signedDay),
    consensusId,
    brokeredOpportunityId,
    caseId,
    customerId,
    dealPrice,
    dealType,
    signedDay,
    sourceClosedDealId,
    closeReadiness,
    closeProbability,
    resolvedBlockers: Object.freeze([...resolvedBlockers]),
    supportingFactors: Object.freeze([...supportingFactors]),
    sourceEventRefs: Object.freeze([...sourceEventRefs]),
    weightExplanations: Object.freeze([...weightExplanations]),
  });
}

/**
 * R26: Create a ContractFact from a validated PriceConsensusProof.
 * This is the strict production path — proof must be validated before calling.
 */
export function createContractFactFromProof(
  consensusId: string,
  brokeredOpportunityId: string,
  caseId: string,
  customerId: string,
  dealType: string,
  signedDay: number,
  sourceClosedDealId: string,
  closeReadiness: number,
  closeProbability: number,
  resolvedBlockers: readonly string[],
  supportingFactors: readonly string[],
  proof: import('./priceTrajectory.js').PriceConsensusProof,
): ContractFactState {
  return Object.freeze({
    contractId: buildContractFactId(caseId, customerId, signedDay),
    consensusId,
    brokeredOpportunityId,
    caseId,
    customerId,
    dealPrice: proof.agreedPrice,
    dealType,
    signedDay,
    sourceClosedDealId,
    closeReadiness,
    closeProbability,
    resolvedBlockers: Object.freeze([...resolvedBlockers]),
    supportingFactors: Object.freeze([...supportingFactors]),
    sourceEventRefs: Object.freeze([...proof.sourceEventRefs]),
    weightExplanations: Object.freeze([...proof.weightExplanations]),
    priceConsensusProofId: proof.proofId,
    priceTrajectoryId: proof.trajectory.trajectoryId,
    buyerOfferId: proof.buyerOffer.offerId,
    ownerConcessionId: proof.ownerConcession.concessionId,
    agreedPrice: proof.agreedPrice,
  });
}

// ---------------------------------------------------------------------------
// OpportunityClosureSetState write functions (pure, no mutation)
// ---------------------------------------------------------------------------

export function createOpportunityClosureSetState(
  contractId: string,
  wonOpportunityId: string,
  closedOpportunityIds: readonly string[],
  losingCustomerIds: readonly string[],
  reason: string,
  day: number,
  sourceEventRefs: readonly string[] = [],
): OpportunityClosureSetState {
  return Object.freeze({
    closureSetId: buildOpportunityClosureSetId(contractId),
    contractId,
    wonOpportunityId,
    closedOpportunityIds: Object.freeze([...closedOpportunityIds]),
    losingCustomerIds: Object.freeze([...losingCustomerIds]),
    reason,
    day,
    sourceEventRefs: Object.freeze([...sourceEventRefs]),
  });
}

// ---------------------------------------------------------------------------
// Legacy mirror derivation
// ---------------------------------------------------------------------------

/**
 * Derives legacy ClosedDealRecord mirror values from a ContractFactState.
 * Used for backward compatibility — ClosedDealRecord fields should be synced from this.
 */
export function deriveLegacyClosedDealMirror(contract: ContractFactState) {
  // Extract legacy opportunity ID from brokered ID prefix.
  // brokeredOpportunityId = "brokered:${legacyOpportunityId}"
  // Legacy UI reads opportunityId / sourceRelationId as raw opportunity IDs,
  // so we must strip the "brokered:" prefix to avoid breaking traceability.
  const legacyOpportunityId = contract.brokeredOpportunityId.startsWith('brokered:')
    ? contract.brokeredOpportunityId.slice('brokered:'.length)
    : contract.brokeredOpportunityId;

  return Object.freeze({
    dealId: contract.sourceClosedDealId || contract.contractId,
    caseId: contract.caseId,
    customerId: contract.customerId,
    sourceRelationId: legacyOpportunityId,
    opportunityId: legacyOpportunityId,
    dayIndex: contract.signedDay,
    day: contract.signedDay,
    closedAt: '',
    dealType: contract.dealType,
    dealPrice: contract.dealPrice,
    price: contract.dealPrice,
    closeReadiness: contract.closeReadiness,
    closeProbability: contract.closeProbability,
    blockingReasons: contract.resolvedBlockers,
    supportingReasons: contract.supportingFactors,
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function clampValue(value: number, min: number = 0, max: number = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
