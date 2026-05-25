/**
 * Case Outcome Projection — derives terminal case status from canonical state.
 *
 * Case.status / soldPrice / closedDeals are projections/mirrors, not canonical truth.
 * Canonical sources:
 *   - sold: ContractFactState + OpportunityClosureSetState
 *   - lost_to_rival / withdrawn / expired: CaseTerminalOutcomeState
 *
 * Pure functions — no domain/runtime imports, no Date.now/Math.random.
 */

import type { ContractFactState, OpportunityClosureSetState } from './consensus/writeSource.js';
import type { CaseTerminalOutcomeState } from './caseOutcomeTypes.js';

export type CaseTerminalStatus = 'sold' | 'lost_to_rival' | 'withdrawn' | 'active';

export interface CaseOutcomeProjection {
  readonly caseId: string;
  readonly status: CaseTerminalStatus;
  readonly sourceKind: 'contract_fact' | 'terminal_outcome' | 'active';
  readonly sourceId: string;
}

export interface ClosedDealProjection {
  readonly dealId: string;
  readonly caseId: string;
  readonly customerId: string;
  readonly dealPrice: number;
  readonly dealType: string;
  readonly signedDay: number;
  readonly sourceContractId: string;
}

/**
 * Derive terminal status for a case from canonical state objects.
 * Returns 'active' if no terminal state exists.
 */
export function deriveCaseTerminalStatusFromOutcomeProjection(
  contractFacts: readonly ContractFactState[],
  terminalOutcomes: readonly CaseTerminalOutcomeState[],
  caseId: string,
): CaseOutcomeProjection {
  const contract = contractFacts.find(c => c.caseId === caseId);
  if (contract) {
    return {
      caseId,
      status: 'sold',
      sourceKind: 'contract_fact',
      sourceId: contract.contractId,
    };
  }

  const terminal = terminalOutcomes.find(t => t.caseId === caseId);
  if (terminal) {
    return {
      caseId,
      status: terminal.kind,
      sourceKind: 'terminal_outcome',
      sourceId: terminal.terminalOutcomeId,
    };
  }

  return {
    caseId,
    status: 'active',
    sourceKind: 'active',
    sourceId: '',
  };
}

/**
 * Derive sold price for a case from ContractFact.
 * Returns undefined if no contract exists.
 */
export function deriveSoldPriceFromContractFacts(
  contractFacts: readonly ContractFactState[],
  caseId: string,
): number | undefined {
  const contract = contractFacts.find(c => c.caseId === caseId);
  return contract?.dealPrice;
}

/**
 * Derive closed deal projection list from ContractFact records.
 * Each ContractFact produces one ClosedDealProjection.
 */
export function deriveClosedDealProjectionFromContractFacts(
  contractFacts: readonly ContractFactState[],
): ClosedDealProjection[] {
  return contractFacts.map(contract => ({
    dealId: contract.sourceClosedDealId || contract.contractId,
    caseId: contract.caseId,
    customerId: contract.customerId,
    dealPrice: contract.dealPrice,
    dealType: contract.dealType,
    signedDay: contract.signedDay,
    sourceContractId: contract.contractId,
  }));
}

/**
 * Derive the full outcome projection for all cases in state.
 * Maps caseId -> CaseOutcomeProjection.
 */
export function deriveCaseOutcomeProjection(input: {
  contractFacts: readonly ContractFactState[];
  terminalOutcomes: readonly CaseTerminalOutcomeState[];
  activeCaseIds: readonly string[];
}): Map<string, CaseOutcomeProjection> {
  const result = new Map<string, CaseOutcomeProjection>();

  for (const contract of input.contractFacts) {
    result.set(contract.caseId, {
      caseId: contract.caseId,
      status: 'sold',
      sourceKind: 'contract_fact',
      sourceId: contract.contractId,
    });
  }

  for (const terminal of input.terminalOutcomes) {
    // Terminal outcome only applies if no contract already claims this case
    if (!result.has(terminal.caseId)) {
      result.set(terminal.caseId, {
        caseId: terminal.caseId,
        status: terminal.kind,
        sourceKind: 'terminal_outcome',
        sourceId: terminal.terminalOutcomeId,
      });
    }
  }

  for (const caseId of input.activeCaseIds) {
    if (!result.has(caseId)) {
      result.set(caseId, {
        caseId,
        status: 'active',
        sourceKind: 'active',
        sourceId: '',
      });
    }
  }

  return result;
}
