/**
 * ConsensusFormation Helper — domain bridge between core writeSource and GameState.
 *
 * This module provides convenience functions that:
 * 1. Import from core writeSource (pure functions)
 * 2. Accept GameState for persistence
 * 3. Sync legacy ClosedDealRecord as compatibility mirror
 *
 * Runtime status (as of 2026-05-06):
 * - dealClosing.ts actively calls ensureConsensusFormation, markConsensusSignedOnState,
 *   markConsensusCollapsedOnState, createContractFactFromPriceConsensusOnState, createOpportunityClosureOnState.
 * - finalizeClosedDeal creates ContractFact + OpportunityClosureSet on success path.
 * - ContractFact has duplicate guard: one contract per case.
 * - deriveLegacyClosedDealMirror strips "brokered:" prefix for legacy UI traceability.
 *
 * Migration direction:
 * - pendingClosing* fields on legacy Opportunity → ConsensusFormationState
 * - ClosedDealRecord fields → ContractFactState (legacy mirror preserved)
 * - dealClosing.ts probability dice-roll → ConsensusFormation stage gates
 */

import type { GameState } from './models.js';
import { asWritableGameState } from './models.js';
import {
  type CanonicalStoreWriteProvenance,
  type CanonicalStoreWriteReceipt,
  makeStoreWriteReceipt,
} from '../core/world-state/canonicalStoreKernel.js';
import {
  type ConsensusFormationState,
  type ConsensusFormationRecord,
  type ConsensusStage,
  type ContractFactState,
  type OpportunityClosureSetState,
  buildConsensusFormationId,
  createConsensusFormationState as createConsensusCore,
  setConsensusStage as setStageCore,
  setConsensusEvaluation as setEvalCore,
  markConsensusSigned as markSignedCore,
  markConsensusCollapsed as markCollapsedCore,
  createContractFactForFixtureOnlyState as createContractCore,
  createContractFactFromProof as createContractFromProofCore,
  createOpportunityClosureSetState as createClosureCore,
  deriveLegacyClosedDealMirror,
} from '../core/world-state/consensus/writeSource.js';
import type { PriceConsensusProof } from '../core/world-state/consensus/priceTrajectory.js';

// Re-export types for domain consumers
export type {
  ConsensusFormationState,
  ConsensusFormationRecord,
  ConsensusStage,
  ContractFactState,
  OpportunityClosureSetState,
};

// ---------------------------------------------------------------------------
// GameState extension (runtime arrays)
// ---------------------------------------------------------------------------

/**
 * Ensures runtime consensus arrays exist on GameState.
 * Called during createInitialState or first access.
 */
export function ensureConsensusRuntime(state: GameState): {
  formations: readonly ConsensusFormationState[];
  contracts: readonly ContractFactState[];
  closures: readonly OpportunityClosureSetState[];
} {
  ensureRuntimeConsensusFormations(state, 'canonical-bootstrap');
  ensureRuntimeContractFacts(state, 'canonical-bootstrap');
  ensureRuntimeOpportunityClosureSets(state, 'canonical-bootstrap');
  return {
    formations: state.runtimeConsensusFormations!,
    contracts: state.runtimeContractFacts!,
    closures: state.runtimeOpportunityClosureSets!,
  };
}

export function ensureRuntimeConsensusFormations(
  state: GameState,
  provenance: CanonicalStoreWriteProvenance = 'canonical-bootstrap',
): CanonicalStoreWriteReceipt {
  if (!state.runtimeConsensusFormations) {
    asWritableGameState(state).runtimeConsensusFormations = [];
  }
  return makeStoreWriteReceipt('runtimeConsensusFormations', 'ensure', provenance, {
    nextCount: state.runtimeConsensusFormations.length,
  });
}

export function ensureRuntimeContractFacts(
  state: GameState,
  provenance: CanonicalStoreWriteProvenance = 'canonical-bootstrap',
): CanonicalStoreWriteReceipt {
  if (!state.runtimeContractFacts) {
    asWritableGameState(state).runtimeContractFacts = [];
  }
  return makeStoreWriteReceipt('runtimeContractFacts', 'ensure', provenance, {
    nextCount: state.runtimeContractFacts.length,
  });
}

export function ensureRuntimeOpportunityClosureSets(
  state: GameState,
  provenance: CanonicalStoreWriteProvenance = 'canonical-bootstrap',
): CanonicalStoreWriteReceipt {
  if (!state.runtimeOpportunityClosureSets) {
    asWritableGameState(state).runtimeOpportunityClosureSets = [];
  }
  return makeStoreWriteReceipt('runtimeOpportunityClosureSets', 'ensure', provenance, {
    nextCount: state.runtimeOpportunityClosureSets.length,
  });
}

// ---------------------------------------------------------------------------
// Consensus formation helpers (with GameState persistence)
// ---------------------------------------------------------------------------

export function findConsensusForOpportunity(
  state: GameState,
  brokeredOpportunityId: string,
): ConsensusFormationState | undefined {
  const formations = state.runtimeConsensusFormations ?? [];
  const consensusId = buildConsensusFormationId(brokeredOpportunityId);
  return formations.find((f) => f.consensusId === consensusId);
}

export function ensureConsensusFormation(
  state: GameState,
  brokeredOpportunityId: string,
  matchId: string,
  caseId: string,
  customerId: string,
  strategyId: string,
  day: number,
): ConsensusFormationState {
  const existing = findConsensusForOpportunity(state, brokeredOpportunityId);
  if (existing) return existing;

  const { formations } = ensureConsensusRuntime(state);
  const created = createConsensusCore(
    brokeredOpportunityId, matchId, caseId, customerId, strategyId, day,
  );
  asWritableGameState(state).runtimeConsensusFormations.push(created);
  return created;
}

export function setConsensusStageOnState(
  state: GameState,
  brokeredOpportunityId: string,
  stage: ConsensusStage,
  day: number,
  reason: string,
): ConsensusFormationRecord | undefined {
  const existing = findConsensusForOpportunity(state, brokeredOpportunityId);
  if (!existing) return undefined;

  const { formations } = ensureConsensusRuntime(state);
  const idx = formations.indexOf(existing);
  const { state: newState, record } = setStageCore(existing, stage, day, reason);
  asWritableGameState(state).runtimeConsensusFormations[idx] = newState;
  return record;
}

export function setConsensusEvaluationOnState(
  state: GameState,
  brokeredOpportunityId: string,
  evaluation: {
    closeReadiness: number;
    closeProbability: number;
    blockers: readonly string[];
    supportingFactors: readonly string[];
    strategyId?: string;
    weightExplanations?: readonly import('../core/world-state/consensus/priceTrajectory.js').WeightExplanation[];
  },
  day: number,
  reason: string,
  sourceEventRefs: readonly string[] = [],
): ConsensusFormationRecord | undefined {
  const existing = findConsensusForOpportunity(state, brokeredOpportunityId);
  if (!existing) return undefined;

  const { formations } = ensureConsensusRuntime(state);
  const idx = formations.indexOf(existing);
  const { state: newState, record } = setEvalCore(existing, evaluation, day, reason, sourceEventRefs);
  asWritableGameState(state).runtimeConsensusFormations[idx] = newState;
  return record;
}

export function markConsensusSignedOnState(
  state: GameState,
  brokeredOpportunityId: string,
  day: number,
  reason: string,
): ConsensusFormationRecord | undefined {
  const existing = findConsensusForOpportunity(state, brokeredOpportunityId);
  if (!existing) return undefined;

  const { formations } = ensureConsensusRuntime(state);
  const idx = formations.indexOf(existing);
  const { state: newState, record } = markSignedCore(existing, day, reason);
  asWritableGameState(state).runtimeConsensusFormations[idx] = newState;
  return record;
}

export function markConsensusCollapsedOnState(
  state: GameState,
  brokeredOpportunityId: string,
  day: number,
  reason: string,
): ConsensusFormationRecord | undefined {
  const existing = findConsensusForOpportunity(state, brokeredOpportunityId);
  if (!existing) return undefined;

  const { formations } = ensureConsensusRuntime(state);
  const idx = formations.indexOf(existing);
  const { state: newState, record } = markCollapsedCore(existing, day, reason);
  asWritableGameState(state).runtimeConsensusFormations[idx] = newState;
  return record;
}

// ---------------------------------------------------------------------------
// Contract fact helpers (with GameState persistence)
// ---------------------------------------------------------------------------

/**
 * Finds an existing ContractFactState for a given caseId.
 * Returns undefined if no contract exists for the case yet.
 */
export function findContractForCase(
  state: GameState,
  caseId: string,
): ContractFactState | undefined {
  const contracts = state.runtimeContractFacts ?? [];
  return contracts.find((c) => c.caseId === caseId);
}

export function createContractFactForFixtureOnlyOnState(
  state: GameState,
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
  weightExplanations: readonly import('../core/world-state/consensus/priceTrajectory.js').WeightExplanation[] = [],
): ContractFactState | undefined {
  // Duplicate guard: one contract per case (same case can't be sold twice)
  const existing = findContractForCase(state, caseId);
  if (existing) return undefined;

  const { contracts } = ensureConsensusRuntime(state);
  const created = createContractCore(
    consensusId, brokeredOpportunityId, caseId, customerId,
    dealPrice, dealType, signedDay, sourceClosedDealId,
    closeReadiness, closeProbability, resolvedBlockers, supportingFactors,
    sourceEventRefs, weightExplanations,
  );
  asWritableGameState(state).runtimeContractFacts.push(created);
  return created;
}

/**
 * R26: Create a ContractFact from a validated PriceConsensusProof.
 * Production deal closing must use this — not the scalar API.
 * The proof's agreedPrice becomes the contract's dealPrice.
 */
export function createContractFactFromPriceConsensusOnState(
  state: GameState,
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
  proof: PriceConsensusProof,
): ContractFactState | undefined {
  const existing = findContractForCase(state, caseId);
  if (existing) return undefined;

  const { contracts } = ensureConsensusRuntime(state);
  const created = createContractFromProofCore(
    consensusId, brokeredOpportunityId, caseId, customerId,
    dealType, signedDay, sourceClosedDealId,
    closeReadiness, closeProbability,
    resolvedBlockers, supportingFactors,
    proof,
  );
  asWritableGameState(state).runtimeContractFacts.push(created);
  return created;
}

/**
 * R26: Mark consensus signed with price proof evidence.
 * The proof's source refs become the consensus signing evidence.
 */
export function markConsensusSignedFromPriceConsensusOnState(
  state: GameState,
  brokeredOpportunityId: string,
  day: number,
  proof: PriceConsensusProof,
): ConsensusFormationRecord | undefined {
  return markConsensusSignedOnState(
    state,
    brokeredOpportunityId,
    day,
    `price consensus proof: ${proof.proofId}`,
  );
}
// ---------------------------------------------------------------------------

export function createOpportunityClosureOnState(
  state: GameState,
  contractId: string,
  wonOpportunityId: string,
  closedOpportunityIds: readonly string[],
  losingCustomerIds: readonly string[],
  reason: string,
  day: number,
): OpportunityClosureSetState {
  const { closures } = ensureConsensusRuntime(state);
  const created = createClosureCore(
    contractId, wonOpportunityId, closedOpportunityIds, losingCustomerIds, reason, day,
  );
  asWritableGameState(state).runtimeOpportunityClosureSets.push(created);
  return created;
}

// ---------------------------------------------------------------------------
// Legacy mirror sync
// ---------------------------------------------------------------------------

/**
 * Syncs a ContractFactState to a legacy ClosedDealRecord mirror.
 * Returns the mirror object for insertion into state.closedDeals.
 */
export function syncLegacyClosedDealMirror(contract: ContractFactState) {
  return deriveLegacyClosedDealMirror(contract);
}
