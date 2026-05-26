/**
 * Opportunity Lifecycle Status Read Boundary — ergonomic state-level helpers.
 *
 * R35: Domain/application code should use these helpers instead of reading opportunity.status directly.
 * The canonical source of truth is BrokeredOpportunityState in runtimeBrokeredOpportunities.
 * Opportunity.status is a legacy mirror for backward compatibility only.
 *
 * Priority: canonical_brokered_opportunity > legacy_opportunity_mirror.
 */

import type { GameState, Opportunity } from './models.js';
import {
  readOpportunityLifecycle,
  type OpportunityReadSource,
} from '../core/world-state/opportunity-relations/readBoundary.js';

export type { OpportunityReadSource };

/**
 * R35: Read opportunity status from canonical state.
 * This is the primary helper for domain code to check opportunity status.
 *
 * @param state - GameState with runtimeBrokeredOpportunities
 * @param opportunity - Opportunity item (only used for ID and fallback)
 * @returns status string with source provenance
 */
export function readOpportunityStatus(
  state: GameState,
  opportunity: Opportunity,
): { status: string; source: OpportunityReadSource } {
  const result = readOpportunityLifecycle(state, opportunity);
  return { status: result.value.status, source: result.source };
}

/**
 * R35: Check if opportunity is active by canonical status.
 * Returns true only if BrokeredOpportunityState.status === 'active' or fallback mirror says active.
 *
 * Use this instead of `opportunity.status === 'active'` in truth-decision code.
 */
export function isOpportunityActiveByCanonicalState(
  state: GameState,
  opportunity: Opportunity,
): boolean {
  const result = readOpportunityLifecycle(state, opportunity);
  return result.value.status === 'active';
}

/**
 * R35: Check if opportunity is terminal (won/closed/lost) by canonical status.
 */
export function isOpportunityTerminalByCanonicalState(
  state: GameState,
  opportunity: Opportunity,
): boolean {
  const result = readOpportunityLifecycle(state, opportunity);
  return result.value.status !== 'active';
}

/**
 * R35: Filter opportunities that are active by canonical status.
 * Returns a filtered array of opportunities.
 */
export function filterActiveOpportunitiesByCanonicalState(
  state: GameState,
  opportunities: readonly Opportunity[],
): Opportunity[] {
  return opportunities.filter((opp) => isOpportunityActiveByCanonicalState(state, opp));
}

/**
 * R35: Filter opportunities that match a case and are active by canonical status.
 */
export function filterActiveOpportunitiesForCaseByCanonicalState(
  state: GameState,
  opportunities: readonly Opportunity[],
  caseId: string,
): Opportunity[] {
  return opportunities.filter(
    (opp) => opp.caseId === caseId && isOpportunityActiveByCanonicalState(state, opp),
  );
}

/**
 * R35: Get count of active opportunities for a case.
 */
export function countActiveOpportunitiesForCaseByCanonicalState(
  state: GameState,
  opportunities: readonly Opportunity[],
  caseId: string,
): number {
  return filterActiveOpportunitiesForCaseByCanonicalState(state, opportunities, caseId).length;
}
