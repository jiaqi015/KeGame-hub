/**
 * Opportunity Score Read Boundary — canonical-first opportunity score inputs.
 *
 * Reads opportunity score inputs through the opportunity-relations read boundary
 * when canonical state is available, falls back to legacy Opportunity mirror.
 *
 * Mother model alignment:
 * - Evaluation is derived snapshot, not fact.
 * - trust/readiness/opportunity/consensus must go through read boundary.
 * - legacy Case/Opportunity allowed as fallback mirror, but must be explicitly named.
 *
 * Source markers:
 * - 'canonical_match': read from CustomerCaseMatchState
 * - 'canonical_brokered_opportunity': read from BrokeredOpportunityState
 * - 'legacy_opportunity_mirror': fell back to legacy Opportunity
 * - 'missing': neither canonical nor legacy available
 *
 * Hard constraints:
 * 1. Pure functions in core — no domain/runtime imports.
 * 2. No mutation of state.
 * 3. No Date.now / Math.random.
 * 4. Deterministic: same input → same output.
 */

import {
  readOpportunityIntent,
  readOpportunityConfidence,
  readOpportunityStage,
  readOpportunityLifecycle,
  readOpportunityFit,
  readOpportunityDaysLeft,
  readOpportunityPendingClosing,
  type ReadableStateLike,
  type ReadableLegacyOpportunity,
  type OpportunityReadResult,
  type OpportunityReadSource,
} from '../world-state/opportunity-relations/readBoundary.js';

// ---------------------------------------------------------------------------
// Source marker
// ---------------------------------------------------------------------------

export type { OpportunityReadSource };

// ---------------------------------------------------------------------------
// Opportunity score read inputs
// ---------------------------------------------------------------------------

export interface OpportunityScoreReadInputs {
  readonly fit: number;
  readonly intent: number;
  readonly confidence: number;
  readonly stageIndex: number;
  readonly stageLabel: string;
  readonly status: string;
  readonly daysLeft: number;
  readonly budgetMax: number;
  readonly pendingClosingEvaluation: boolean;
}

export interface OpportunityScoreReadResult {
  readonly inputs: OpportunityScoreReadInputs;
  /** Where each field was read from. */
  readonly readSources: {
    readonly fit: OpportunityReadSource;
    readonly intent: OpportunityReadSource;
    readonly confidence: OpportunityReadSource;
    readonly stage: OpportunityReadSource;
    readonly lifecycle: OpportunityReadSource;
    readonly daysLeft: OpportunityReadSource;
    readonly pendingClosing: OpportunityReadSource;
  };
}

// ---------------------------------------------------------------------------
// Canonical-first read
// ---------------------------------------------------------------------------

/**
 * Reads opportunity score inputs through the canonical read boundary.
 * Falls back to legacy Opportunity mirror when canonical state is missing.
 *
 * fit/confidence prefer canonical match state (CustomerCaseMatchState).
 * stage/lifecycle/daysLeft/pendingClosing prefer canonical brokered opportunity state.
 * intent prefers canonical match interest.
 *
 * Pure function. No mutation.
 */
export function readOpportunityScoreInputs(
  stateLike: ReadableStateLike,
  legacyOpp: ReadableLegacyOpportunity,
  extra?: { budgetMax?: number },
): OpportunityScoreReadResult {
  const fitResult = readOpportunityFit(stateLike, legacyOpp);
  const intentResult = readOpportunityIntent(stateLike, legacyOpp);
  const confidenceResult = readOpportunityConfidence(stateLike, legacyOpp);
  const stageResult = readOpportunityStage(stateLike, legacyOpp);
  const lifecycleResult = readOpportunityLifecycle(stateLike, legacyOpp);
  const daysLeftResult = readOpportunityDaysLeft(stateLike, legacyOpp);
  const pendingClosingResult = readOpportunityPendingClosing(stateLike, legacyOpp);

  return {
    inputs: {
      fit: fitResult.value,
      intent: intentResult.value,
      confidence: confidenceResult.value,
      stageIndex: stageResult.value.stageIndex,
      stageLabel: stageResult.value.stageLabel,
      status: lifecycleResult.value.status,
      daysLeft: daysLeftResult.value,
      budgetMax: extra?.budgetMax ?? 0, // no canonical equivalent yet
      pendingClosingEvaluation: pendingClosingResult.value.evaluation,
    },
    readSources: {
      fit: fitResult.source,
      intent: intentResult.source,
      confidence: confidenceResult.source,
      stage: stageResult.source,
      lifecycle: lifecycleResult.source,
      daysLeft: daysLeftResult.source,
      pendingClosing: pendingClosingResult.source,
    },
  };
}

/**
 * Creates a ReadableLegacyOpportunity from a plain object.
 * Useful for callers that have a raw Opportunity-like object.
 */
export function toReadableLegacyOpportunity(opp: {
  id: string;
  caseId: string;
  customerId: string;
  fit: number;
  intent: number;
  confidence: number;
  stageIndex: number;
  stageLabel: string;
  status: string;
  lifecycleStatus: string;
  daysLeft: number;
  stagnationTicks: number;
  pendingClosingEvaluation?: boolean;
  pendingClosingStrategyId?: string;
  pendingClosingRequestedDay?: number;
}): ReadableLegacyOpportunity {
  return {
    id: opp.id,
    caseId: opp.caseId,
    customerId: opp.customerId,
    fit: opp.fit,
    intent: opp.intent,
    confidence: opp.confidence,
    stageIndex: opp.stageIndex,
    stageLabel: opp.stageLabel,
    status: opp.status,
    lifecycleStatus: opp.lifecycleStatus,
    daysLeft: opp.daysLeft,
    stagnationTicks: opp.stagnationTicks,
    pendingClosingEvaluation: opp.pendingClosingEvaluation,
    pendingClosingStrategyId: opp.pendingClosingStrategyId,
    pendingClosingRequestedDay: opp.pendingClosingRequestedDay,
  };
}
