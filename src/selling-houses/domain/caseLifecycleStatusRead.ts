/**
 * Case Lifecycle Status Read Boundary — ergonomic state-level helpers.
 *
 * R34: Domain/application code should use these helpers instead of reading caseItem.status directly.
 * The canonical source of truth is ContractFactState (sold) or CaseTerminalOutcomeState (lost/withdrawn).
 * caseItem.status is a legacy mirror for backward compatibility only.
 *
 * Priority: contract_fact > terminal_outcome > old_save_compatibility.
 */

import type { GameState, Case } from './models.js';
import {
  readCaseLifecycleStatusFromCanonicalState,
  type CaseLifecycleStatus,
  type CaseTerminalStatus,
  type CaseLifecycleSource,
} from '../core/world-state/caseOutcomeProjection.js';

export type { CaseLifecycleStatus, CaseTerminalStatus, CaseLifecycleSource };

/**
 * R34: Read case lifecycle status from canonical state.
 * This is the primary helper for domain code to check case status.
 *
 * @param state - GameState with runtimeContractFacts and runtimeCaseTerminalOutcomes
 * @param caseItem - Case item (only used for caseId and old_save_compatibility fallback)
 * @returns CaseLifecycleStatus with status, source, and optional source IDs
 */
export function readCaseLifecycleStatus(state: GameState, caseItem: Case): CaseLifecycleStatus {
  return readCaseLifecycleStatusFromCanonicalState({
    contractFacts: state.runtimeContractFacts ?? [],
    terminalOutcomes: state.runtimeCaseTerminalOutcomes ?? [],
    caseId: caseItem.id,
    legacyStatus: caseItem.status, // old_save_compatibility fallback
  });
}

/**
 * R34: Check if case is active by canonical status.
 * Returns true only if no ContractFact or CaseTerminalOutcome exists.
 *
 * Use this instead of `caseItem.status === 'active'` in truth-decision code.
 */
export function isCaseActiveByCanonicalStatus(state: GameState, caseItem: Case): boolean {
  const result = readCaseLifecycleStatus(state, caseItem);
  return result.status === 'active';
}

/**
 * R34: Check if case is terminal (sold/lost/withdrawn) by canonical status.
 * Returns true if ContractFact or CaseTerminalOutcome exists.
 *
 * Use this instead of `caseItem.status !== 'active'` in truth-decision code.
 */
export function isCaseTerminalByCanonicalStatus(state: GameState, caseItem: Case): boolean {
  const result = readCaseLifecycleStatus(state, caseItem);
  return result.status !== 'active';
}

/**
 * R34: Check if case is sold by canonical status.
 * Returns true only if a ContractFact exists for this case.
 */
export function isCaseSoldByCanonicalStatus(state: GameState, caseItem: Case): boolean {
  const result = readCaseLifecycleStatus(state, caseItem);
  return result.status === 'sold';
}

/**
 * R34: Check if case is lost or withdrawn by canonical status.
 * Returns true only if a CaseTerminalOutcome exists with kind lost_to_rival or withdrawn.
 */
export function isCaseLostOrWithdrawnByCanonicalStatus(state: GameState, caseItem: Case): boolean {
  const result = readCaseLifecycleStatus(state, caseItem);
  return result.status === 'lost_to_rival' || result.status === 'withdrawn';
}

/**
 * R34: Get the source of truth for case status.
 * Returns 'contract_fact' if sold, 'terminal_outcome' if lost/withdrawn, 'old_save_compatibility' if active with no canonical fact.
 */
export function getCaseStatusSource(state: GameState, caseItem: Case): CaseLifecycleSource {
  return readCaseLifecycleStatus(state, caseItem).source;
}
