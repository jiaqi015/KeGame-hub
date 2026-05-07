/**
 * Opportunity Read Boundary v0 — canonical-first read functions.
 *
 * Reads from CustomerCaseMatchState / BrokeredOpportunityState when available,
 * falls back to legacy Opportunity shape when canonical state is missing.
 *
 * All return values include a source marker:
 * - 'canonical_match': read from CustomerCaseMatchState
 * - 'canonical_brokered_opportunity': read from BrokeredOpportunityState
 * - 'legacy_opportunity_mirror': fell back to legacy Opportunity
 *
 * Hard constraints:
 * 1. Pure functions in core — no domain/runtime imports.
 * 2. No mutation of state.
 * 3. No Date.now / Math.random.
 * 4. Deterministic: same input → same output.
 */

import {
  buildCustomerCaseMatchId,
  buildBrokeredOpportunityId,
  type CustomerCaseMatchState,
  type BrokeredOpportunityState,
} from './writeSource.js';

// ---------------------------------------------------------------------------
// Source marker
// ---------------------------------------------------------------------------

export type OpportunityReadSource =
  | 'canonical_match'
  | 'canonical_brokered_opportunity'
  | 'legacy_opportunity_mirror';

// ---------------------------------------------------------------------------
// Read result wrapper
// ---------------------------------------------------------------------------

export interface OpportunityReadResult<T> {
  readonly value: T;
  readonly source: OpportunityReadSource;
}

// ---------------------------------------------------------------------------
// Plain shapes (no domain import)
// ---------------------------------------------------------------------------

export interface ReadableMatchState {
  readonly matchId: string;
  readonly customerId: string;
  readonly caseId: string;
  readonly fit: number;
  readonly interest: number;
  readonly confidence: number;
  readonly budgetMax: number;
  readonly priceSensitivity: number;
  readonly selected: boolean;
  readonly offered: boolean;
  readonly viewed: boolean;
  readonly lastUpdatedDay: number;
}

export interface ReadableBrokeredOpportunityState {
  readonly brokeredOpportunityId: string;
  readonly legacyOpportunityId: string;
  readonly matchId: string;
  readonly stageIndex: number;
  readonly stageLabel: string;
  readonly status: string;
  readonly lifecycleStatus: string;
  readonly daysLeft: number;
  readonly stagnationTicks: number;
  readonly pendingClosingEvaluation: boolean;
  readonly pendingClosingStrategyId: string;
  readonly pendingClosingRequestedDay: number;
}

export interface ReadableLegacyOpportunity {
  readonly id: string;
  readonly caseId: string;
  readonly customerId: string;
  readonly fit: number;
  readonly intent: number;
  readonly confidence: number;
  readonly stageIndex: number;
  readonly stageLabel: string;
  readonly status: string;
  readonly lifecycleStatus: string;
  readonly daysLeft: number;
  readonly stagnationTicks: number;
  readonly pendingClosingEvaluation?: boolean;
  readonly pendingClosingStrategyId?: string;
  readonly pendingClosingRequestedDay?: number;
}

export interface ReadableStateLike {
  readonly runtimeCustomerCaseMatches?: readonly ReadableMatchState[];
  readonly runtimeBrokeredOpportunities?: readonly ReadableBrokeredOpportunityState[];
}

// ---------------------------------------------------------------------------
// Risk signals
// ---------------------------------------------------------------------------

export interface OpportunityRiskSignals {
  readonly staleMatch: boolean;
  readonly lowConfidence: boolean;
  readonly highChurnRisk: boolean;
  readonly stagnating: boolean;
  readonly pendingClosingStale: boolean;
}

// ---------------------------------------------------------------------------
// Lookup helpers
// ---------------------------------------------------------------------------

export function findCustomerCaseMatchFromState(
  stateLike: ReadableStateLike,
  customerId: string,
  caseId: string,
): ReadableMatchState | undefined {
  const matchId = buildCustomerCaseMatchId(customerId, caseId);
  return stateLike.runtimeCustomerCaseMatches?.find((m) => m.matchId === matchId);
}

export function findBrokeredOpportunityFromState(
  stateLike: ReadableStateLike,
  legacyOpportunityId: string,
): ReadableBrokeredOpportunityState | undefined {
  const brokeredId = buildBrokeredOpportunityId(legacyOpportunityId);
  return stateLike.runtimeBrokeredOpportunities?.find((o) => o.brokeredOpportunityId === brokeredId);
}

// ---------------------------------------------------------------------------
// Canonical-first read functions
// ---------------------------------------------------------------------------

/**
 * Reads opportunity intent. Prefers canonical match interest over legacy intent.
 */
export function readOpportunityIntent(
  stateLike: ReadableStateLike,
  legacyOpp: ReadableLegacyOpportunity,
): OpportunityReadResult<number> {
  const match = findCustomerCaseMatchFromState(stateLike, legacyOpp.customerId, legacyOpp.caseId);
  if (match) {
    return { value: match.interest, source: 'canonical_match' };
  }
  return { value: legacyOpp.intent, source: 'legacy_opportunity_mirror' };
}

/**
 * Reads opportunity confidence. Prefers canonical match confidence over legacy.
 */
export function readOpportunityConfidence(
  stateLike: ReadableStateLike,
  legacyOpp: ReadableLegacyOpportunity,
): OpportunityReadResult<number> {
  const match = findCustomerCaseMatchFromState(stateLike, legacyOpp.customerId, legacyOpp.caseId);
  if (match) {
    return { value: match.confidence, source: 'canonical_match' };
  }
  return { value: legacyOpp.confidence, source: 'legacy_opportunity_mirror' };
}

/**
 * Reads opportunity stage. Prefers canonical brokered opportunity stage over legacy.
 */
export function readOpportunityStage(
  stateLike: ReadableStateLike,
  legacyOpp: ReadableLegacyOpportunity,
): OpportunityReadResult<{ stageIndex: number; stageLabel: string }> {
  const brokered = findBrokeredOpportunityFromState(stateLike, legacyOpp.id);
  if (brokered) {
    return {
      value: { stageIndex: brokered.stageIndex, stageLabel: brokered.stageLabel },
      source: 'canonical_brokered_opportunity',
    };
  }
  return {
    value: { stageIndex: legacyOpp.stageIndex, stageLabel: legacyOpp.stageLabel },
    source: 'legacy_opportunity_mirror',
  };
}

/**
 * Reads opportunity lifecycle. Prefers canonical brokered opportunity lifecycle over legacy.
 */
export function readOpportunityLifecycle(
  stateLike: ReadableStateLike,
  legacyOpp: ReadableLegacyOpportunity,
): OpportunityReadResult<{ status: string; lifecycleStatus: string }> {
  const brokered = findBrokeredOpportunityFromState(stateLike, legacyOpp.id);
  if (brokered) {
    return {
      value: { status: brokered.status, lifecycleStatus: brokered.lifecycleStatus },
      source: 'canonical_brokered_opportunity',
    };
  }
  return {
    value: { status: legacyOpp.status, lifecycleStatus: legacyOpp.lifecycleStatus },
    source: 'legacy_opportunity_mirror',
  };
}

/**
 * Reads opportunity fit. Prefers canonical match fit over legacy.
 */
export function readOpportunityFit(
  stateLike: ReadableStateLike,
  legacyOpp: ReadableLegacyOpportunity,
): OpportunityReadResult<number> {
  const match = findCustomerCaseMatchFromState(stateLike, legacyOpp.customerId, legacyOpp.caseId);
  if (match) {
    return { value: match.fit, source: 'canonical_match' };
  }
  return { value: legacyOpp.fit, source: 'legacy_opportunity_mirror' };
}

/**
 * Reads opportunity daysLeft. Prefers canonical brokered opportunity daysLeft over legacy.
 */
export function readOpportunityDaysLeft(
  stateLike: ReadableStateLike,
  legacyOpp: ReadableLegacyOpportunity,
): OpportunityReadResult<number> {
  const brokered = findBrokeredOpportunityFromState(stateLike, legacyOpp.id);
  if (brokered) {
    return { value: brokered.daysLeft, source: 'canonical_brokered_opportunity' };
  }
  return { value: legacyOpp.daysLeft, source: 'legacy_opportunity_mirror' };
}

/**
 * Reads opportunity pendingClosing fields. Prefers canonical brokered opportunity over legacy.
 */
export function readOpportunityPendingClosing(
  stateLike: ReadableStateLike,
  legacyOpp: ReadableLegacyOpportunity,
): OpportunityReadResult<{ evaluation: boolean; strategyId: string; requestedDay: number }> {
  const brokered = findBrokeredOpportunityFromState(stateLike, legacyOpp.id);
  if (brokered) {
    return {
      value: {
        evaluation: brokered.pendingClosingEvaluation,
        strategyId: brokered.pendingClosingStrategyId,
        requestedDay: brokered.pendingClosingRequestedDay,
      },
      source: 'canonical_brokered_opportunity',
    };
  }
  return {
    value: {
      evaluation: legacyOpp.pendingClosingEvaluation ?? false,
      strategyId: legacyOpp.pendingClosingStrategyId ?? '',
      requestedDay: legacyOpp.pendingClosingRequestedDay ?? 0,
    },
    source: 'legacy_opportunity_mirror',
  };
}

/**
 * Reads risk signals from canonical state or derives from legacy.
 */
export function readOpportunityRiskSignals(
  stateLike: ReadableStateLike,
  legacyOpp: ReadableLegacyOpportunity,
  currentDay: number,
): OpportunityReadResult<OpportunityRiskSignals> {
  const match = findCustomerCaseMatchFromState(stateLike, legacyOpp.customerId, legacyOpp.caseId);
  const brokered = findBrokeredOpportunityFromState(stateLike, legacyOpp.id);

  if (match || brokered) {
    const staleThreshold = 3;
    const staleMatch = match ? (currentDay - match.lastUpdatedDay) > staleThreshold : false;
    const lowConfidence = match ? match.confidence < 30 : false;
    const highChurnRisk = false; // canonical match doesn't have churnRisk directly
    const stagnating = brokered ? brokered.stagnationTicks > 5 : false;
    const pendingClosingStale = brokered
      ? brokered.pendingClosingEvaluation && (currentDay - brokered.pendingClosingRequestedDay) > 7
      : false;

    return {
      value: { staleMatch, lowConfidence, highChurnRisk, stagnating, pendingClosingStale },
      source: brokered ? 'canonical_brokered_opportunity' : 'canonical_match',
    };
  }

  // Fallback: derive from legacy
  return {
    value: {
      staleMatch: false,
      lowConfidence: legacyOpp.confidence < 30,
      highChurnRisk: false,
      stagnating: legacyOpp.stagnationTicks > 5,
      pendingClosingStale: legacyOpp.pendingClosingEvaluation
        ? (currentDay - (legacyOpp.pendingClosingRequestedDay ?? 0)) > 7
        : false,
    },
    source: 'legacy_opportunity_mirror',
  };
}
