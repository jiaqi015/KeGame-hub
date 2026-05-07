/**
 * Daily Tick Semantic Enrichment Pipeline — runtime layer.
 *
 * Runs AFTER domain resolveOneDay returns a raw DailyTickResult.
 * Enriches GameState with semantic receipts, ledger, process runs,
 * owner decision moments, manager interventions, strategy forks,
 * negotiation replays, and business outcome reviews.
 *
 * This pipeline was previously embedded in domain/engine.ts resolveOneDay.
 * Moved here to enforce domain→runtime layer boundary.
 *
 * Hard constraints:
 * 1. Does NOT alter rngCalls, rngState, closedDeals, eventStore, eventLog.
 * 2. Does NOT alter case/opportunity/customer mutations.
 * 3. Does NOT change gameplay, tick order, or UI.
 * 4. Deterministic: same state + same tick result → same enrichment.
 * 5. Non-invasive: errors are caught, logged, and returned as diagnostics.
 */

import type { DailyTickResult, GameState } from '../../domain/models.js';
import { enrichSemanticReceiptWithDecisionBridge } from './semanticReceiptEnrichment.js';
import {
  buildDailyOperatingLedgerFromTickResult,
  enrichStateWithDailyOperatingLedger,
  enrichLedgerWithActionReceipts,
} from './dailyOperatingLedgerAdapter.js';
import { buildActionReceiptsForDay, buildCommitmentSettlementsForDay } from './actionReceiptAdapter.js';
import { buildProcessRunsFromState, enrichStateWithProcessRuns } from './processRunAdapter.js';
import { buildOwnerDecisionMomentsFromState, enrichStateWithOwnerDecisionMoments } from './ownerDecisionMomentAdapter.js';
import { buildStrategyForksFromState, enrichStateWithStrategyForks } from './strategyForkAdapter.js';
import { buildManagerInterventionFromFocusMeeting, enrichStateWithManagerInterventions } from './managerInterventionAdapter.js';
import { buildNegotiationReplaysFromState, enrichStateWithNegotiationReplays } from './negotiationReplayAdapter.js';
import { buildBusinessOutcomeReviewsFromState, enrichStateWithBusinessOutcomeReviews } from './businessOutcomeReviewAdapter.js';

export interface DailyTickEnrichmentInput {
  readonly state: GameState;
  readonly tickResult: DailyTickResult;
  readonly activeCaseIdsAtEnd: readonly string[];
  readonly settledDayClosedDeals: readonly unknown[];
  readonly settledDayEmittedEvents: readonly unknown[];
  readonly isGameOver: boolean;
}

/**
 * Enrichment diagnostic: collected when an enrichment step fails.
 */
export interface EnrichmentDiagnostic {
  readonly step: string;
  readonly day: number;
  readonly message: string;
}

/**
 * Enriches GameState with all semantic receipt / ledger / process run data.
 * Called from application layer after advanceOneDay returns.
 * Does NOT alter gameplay. Does NOT mutate tick result.
 *
 * Returns an array of diagnostics for any enrichment steps that failed.
 * Empty array means all steps succeeded.
 */
export function enrichStateWithDailyTickSemantics(input: DailyTickEnrichmentInput): readonly EnrichmentDiagnostic[] {
  const { state, tickResult, activeCaseIdsAtEnd, settledDayClosedDeals, settledDayEmittedEvents, isGameOver } = input;
  const settledDay = tickResult.day;
  const diagnostics: EnrichmentDiagnostic[] = [];

  // 1. Semantic receipt enrichment (decision bridge)
  const enrichedSemanticReceipts = enrichSemanticReceiptWithDecisionBridge(
    state,
    tickResult.semanticReceipts ?? { day: settledDay } as any,
  );

  // 2. Daily operating ledger
  const ledgerDayEntry = buildDailyOperatingLedgerFromTickResult(
    {
      ...tickResult,
      semanticReceipts: enrichedSemanticReceipts,
    },
    activeCaseIdsAtEnd,
    isGameOver,
  );

  const dayActionReceipts = buildActionReceiptsForDay(state, settledDay);
  const dayCommitmentSettlements = buildCommitmentSettlementsForDay(state, settledDay);
  const enrichedLedger = enrichLedgerWithActionReceipts(
    ledgerDayEntry,
    dayActionReceipts,
    dayCommitmentSettlements,
  );
  enrichStateWithDailyOperatingLedger(state, enrichedLedger);

  // 3–8. Non-invasive enrichments with diagnostic collection.
  // Each step catches errors to prevent enrichment failures from crashing gameplay,
  // and collects diagnostics so failures are visible and actionable.

  const steps: Array<{ name: string; run: () => void }> = [
    { name: 'ProcessRun', run: () => {
      const processRuns = buildProcessRunsFromState(state);
      enrichStateWithProcessRuns(state, processRuns);
    }},
    { name: 'OwnerDecisionMoment', run: () => {
      const ownerMoments = buildOwnerDecisionMomentsFromState(state);
      enrichStateWithOwnerDecisionMoments(state, ownerMoments);
    }},
    { name: 'ManagerIntervention', run: () => {
      const managerReceipt = buildManagerInterventionFromFocusMeeting(state);
      if (managerReceipt) {
        enrichStateWithManagerInterventions(state, [managerReceipt]);
      }
    }},
    { name: 'StrategyFork', run: () => {
      const forks = buildStrategyForksFromState(state);
      enrichStateWithStrategyForks(state, forks);
    }},
    { name: 'NegotiationReplay', run: () => {
      const replays = buildNegotiationReplaysFromState(state);
      enrichStateWithNegotiationReplays(state, replays);
    }},
    { name: 'BusinessOutcomeReview', run: () => {
      const reviews = buildBusinessOutcomeReviewsFromState(state);
      enrichStateWithBusinessOutcomeReviews(state, reviews);
    }},
  ];

  for (const step of steps) {
    try {
      step.run();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      const diagnostic: EnrichmentDiagnostic = { step: step.name, day: settledDay, message: msg };
      diagnostics.push(diagnostic);
      console.warn(`[${step.name} enrichment failed] day=${settledDay}: ${msg}`);
    }
  }

  return diagnostics;
}
