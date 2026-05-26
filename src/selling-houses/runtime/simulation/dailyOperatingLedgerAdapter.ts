/**
 * DailyOperatingLedger Runtime Adapter v0 — builds ledger entries from
 * DailyTickResult and enriches GameState with daily operating summaries.
 *
 * Mother model alignment:
 * - Section 0.2: replayable, debuggable, grounded in business truth
 * - Section 18.10: replay, store seeds/RNG counters, deterministic
 * - Section 1.1: same seed + same action → replayable results
 *
 * Hard constraints:
 * 1. Does NOT mutate original DailyTickResult.
 * 2. Does NOT modify domain engine behavior.
 * 3. Does NOT affect gameplay, RNG, tick order, or UI.
 * 4. Deterministic: no Date.now, no Math.random.
 * 5. Pure functions for building — side-effect only in state enrichment.
 * 6. Same day upsert: replacing, not duplicating.
 * 7. No raw GameState/Case/Opportunity in ledger output.
 * 8. runtime/simulation can import core (allowed).
 */

import type {
  DailyTickResult,
  GameState,
  ActionReceipt,
  CommitmentSettlement,
} from '../../domain/models.js';
import { asWritableGameState } from '../../domain/models.js';

import type {
  DailyOperatingLedgerDaySummary,
  DailyOperatingLedgerEntry,
  DailyOperatingLedgerEntryInput,
  DailyOperatingLedgerEvidenceRef,
} from '../../core/world-state/semantic-receipt/dailyOperatingLedger.js';

import {
  buildDailyOperatingLedgerDaySummary,
  buildEmptyDailyOperatingLedgerDaySummary,
} from '../../core/world-state/semantic-receipt/dailyOperatingLedger.js';

import type {
  DailySemanticReceiptBundle,
} from '../../core/world-state/semantic-receipt/models.js';

import {
  buildEmptySemanticReceipt,
} from '../../core/world-state/semantic-receipt/models.js';

// ---------------------------------------------------------------------------
// buildDailyOperatingLedgerFromTickResult
// ---------------------------------------------------------------------------

/**
 * Builds a DailyOperatingLedgerDaySummary from a DailyTickResult.
 *
 * Extracts compressed operating data from the tick result:
 * - semanticReceipts bundle (already compressed)
 * - operatingMovement from dailyDecisionBridge
 * - closedDeals count
 * - emittedEvents count
 * - dirty scope case IDs
 *
 * Pure function. No mutation. Deterministic.
 *
 * @param tickResult - The daily tick result
 * @param activeCaseIds - IDs of active cases at end of this day
 * @param gameOver - Whether the game is over at end of this day
 * @returns A frozen DailyOperatingLedgerDaySummary
 */
export function buildDailyOperatingLedgerFromTickResult(
  tickResult: DailyTickResult,
  activeCaseIds: readonly string[],
  gameOver: boolean,
): DailyOperatingLedgerDaySummary {
  const day = tickResult.day;
  const semanticReceipt: DailySemanticReceiptBundle =
    tickResult.semanticReceipts ?? buildEmptySemanticReceipt(day);

  // Extract operating movement from bridge (already computed)
  const operatingMovement = semanticReceipt.dailyDecisionBridge?.operatingMovement;

  // Build ledger entries from dirty scopes and closed deals
  const entries: DailyOperatingLedgerEntryInput[] = [];

  // Entries from dirty case scopes
  const dirtyCaseIds = tickResult.dirtyScopes?.cases ?? [];
  for (const caseId of dirtyCaseIds) {
    const closedDeal = tickResult.closedDeals.find((d) => d.caseId === caseId);
    if (closedDeal) {
      entries.push({
        caseId,
        status: 'signed',
        outcomes: [{
          outcomeType: 'contract_signed',
          description: `${closedDeal.caseTitle ?? caseId} signed at ${closedDeal.dealPrice}`,
          direction: 'improved',
          magnitude: 'high',
          field: 'dealPrice',
          from: 0,
          to: closedDeal.dealPrice,
          delta: closedDeal.dealPrice,
          sourceRefIds: [`closed-deal:${closedDeal.dealId}`],
        }],
        tasks: [],
        evidenceRefs: [{
          refType: 'contract_fact',
          refId: `contract:${closedDeal.dealId}`,
          summary: `Contract signed: ${closedDeal.dealPrice}`,
          relevance: 1.0,
        }],
        urgencyScore: 10,
        movementSummary: `Deal closed at ${closedDeal.dealPrice}`,
      });
      continue;
    }

    // Non-deal dirty case — check if it has movements from the bridge
    const caseMovement = operatingMovement?.caseMovements.find((m) => m.caseId === caseId);
    if (caseMovement) {
      const hasWorsened = caseMovement.movements.some((m) => m.direction === 'worsened');
      const hasBlockers = caseMovement.blockerEmergences.length > 0;

      entries.push({
        caseId,
        status: hasBlockers ? 'risk_blocked' : hasWorsened ? 'pending' : 'observing',
        outcomes: caseMovement.movements.map((m) => ({
          outcomeType: 'movement' as const,
          description: m.reason,
          direction: m.direction,
          magnitude: m.magnitude,
          field: m.field,
          from: m.from,
          to: m.to,
          delta: m.delta,
          sourceRefIds: m.sourceRefIds,
        })),
        tasks: [],
        evidenceRefs: caseMovement.blockerEmergences.map((b) => ({
          refType: 'event' as const,
          refId: b.blockerId,
          summary: b.description,
          relevance: b.severity === 'high' ? 0.95 : b.severity === 'medium' ? 0.7 : 0.4,
        })),
        recommendedActionId: caseMovement.recommendedActionId,
        urgencyScore: hasBlockers ? 80 : hasWorsened ? 60 : 20,
        movementSummary: caseMovement.movements
          .filter((m) => m.direction !== 'unchanged')
          .map((m) => `${m.field}: ${m.direction}`)
          .join(', ') || 'No significant movement',
      });
    }
  }

  return buildDailyOperatingLedgerDaySummary({
    day,
    entries,
    semanticReceipt,
    operatingMovement,
  });
}

// ---------------------------------------------------------------------------
// enrichLedgerWithActionReceipts
// ---------------------------------------------------------------------------

/**
 * Enriches a DailyOperatingLedgerDaySummary with action receipt evidence refs.
 * Returns a new frozen summary with receipts added as evidence to matching case entries.
 * Does NOT mutate the original summary.
 * Pure function. Deterministic.
 */
export function enrichLedgerWithActionReceipts(
  ledger: DailyOperatingLedgerDaySummary,
  actionReceipts: readonly ActionReceipt[],
  commitmentSettlements: readonly CommitmentSettlement[],
): DailyOperatingLedgerDaySummary {
  if (actionReceipts.length === 0 && commitmentSettlements.length === 0) {
    return ledger;
  }

  const entries: DailyOperatingLedgerEntryInput[] = [];
  for (const entry of ledger.entries) {
    const caseReceipts = actionReceipts.filter((r) => r.caseId === entry.caseId);
    const caseSettlements = commitmentSettlements.filter((s) => s.caseId === entry.caseId);

    const extraEvidence: DailyOperatingLedgerEvidenceRef[] = [];
    for (const receipt of caseReceipts) {
      extraEvidence.push({
        refType: 'event',
        refId: `action-receipt:${receipt.receiptId}`,
        summary: `${receipt.actionId}: ${receipt.outcomeSummary} (${receipt.outcome})`,
        relevance: receipt.outcome === 'success' ? 0.85 : receipt.outcome === 'blocked' ? 0.4 : 0.6,
      });
    }
    for (const settlement of caseSettlements) {
      extraEvidence.push({
        refType: 'commitment',
        refId: `commitment-settlement:${settlement.settlementId}`,
        summary: `${settlement.commitmentKind} ${settlement.trigger}: ${settlement.reason}`,
        relevance: settlement.trigger === 'signed' ? 0.95 : settlement.trigger === 'collapsed' ? 0.9 : 0.7,
      });
    }

    entries.push({
      caseId: entry.caseId,
      status: entry.status,
      outcomes: [...entry.outcomes],
      tasks: [...entry.tasks],
      evidenceRefs: [...entry.evidenceRefs, ...extraEvidence],
      recommendedActionId: entry.recommendedActionId,
      urgencyScore: entry.urgencyScore,
      movementSummary: entry.movementSummary,
    });
  }

  // Add entries for cases that have receipts but weren't in the ledger
  const ledgerCaseIds = new Set(ledger.entries.map((e) => e.caseId));
  const receiptCaseIds = new Set([
    ...actionReceipts.map((r) => r.caseId),
    ...commitmentSettlements.map((s) => s.caseId),
  ]);
  for (const caseId of receiptCaseIds) {
    if (ledgerCaseIds.has(caseId)) continue;
    const caseReceipts = actionReceipts.filter((r) => r.caseId === caseId);
    const caseSettlements = commitmentSettlements.filter((s) => s.caseId === caseId);
    const evidenceRefs: DailyOperatingLedgerEvidenceRef[] = [];
    for (const receipt of caseReceipts) {
      evidenceRefs.push({
        refType: 'event',
        refId: `action-receipt:${receipt.receiptId}`,
        summary: `${receipt.actionId}: ${receipt.outcomeSummary} (${receipt.outcome})`,
        relevance: receipt.outcome === 'success' ? 0.85 : 0.4,
      });
    }
    for (const settlement of caseSettlements) {
      evidenceRefs.push({
        refType: 'commitment',
        refId: `commitment-settlement:${settlement.settlementId}`,
        summary: `${settlement.commitmentKind} ${settlement.trigger}: ${settlement.reason}`,
        relevance: 0.7,
      });
    }
    entries.push({
      caseId,
      status: 'observing',
      outcomes: [],
      tasks: [],
      evidenceRefs,
      urgencyScore: 20,
      movementSummary: `${caseReceipts.length} actions executed, ${caseSettlements.length} settlements`,
    });
  }

  // Rebuild summary with enriched entries
  return buildDailyOperatingLedgerDaySummary({
    day: ledger.day,
    entries,
    semanticReceipt: ledger.semanticReceipt,
    operatingMovement: ledger.operatingMovement,
  });
}

// ---------------------------------------------------------------------------
// enrichStateWithDailyOperatingLedger
// ---------------------------------------------------------------------------

/**
 * Enriches GameState with a daily operating ledger entry.
 * Uses upsert semantics: if an entry for the same day exists, it is replaced.
 * Otherwise, the new entry is appended.
 *
 * Does NOT mutate the input ledger entry.
 * Does NOT affect gameplay, RNG, tick order, or UI.
 * The ledger is a read-only projection for workspace/Dashboard/review.
 *
 * @param state - GameState to enrich (mutates only operatingLedgerDays)
 * @param ledgerDay - The ledger entry to upsert
 */
export function enrichStateWithDailyOperatingLedger(
  state: GameState,
  ledgerDay: DailyOperatingLedgerDaySummary,
): void {
  if (!state.operatingLedgerDays) {
    asWritableGameState(state).operatingLedgerDays = [];
  }

  // Upsert: replace existing entry for same day, or append
  const existingIndex = state.operatingLedgerDays.findIndex((entry) => entry.day === ledgerDay.day);
  if (existingIndex >= 0) {
    asWritableGameState(state).operatingLedgerDays[existingIndex] = ledgerDay;
  } else {
    asWritableGameState(state).operatingLedgerDays.push(ledgerDay);
  }
}

// ---------------------------------------------------------------------------
// normalizeOperatingLedgerDays — for save/load compatibility
// ---------------------------------------------------------------------------

/**
 * Normalizes operatingLedgerDays from a loaded save.
 * Returns empty array if the field is missing (old saves).
 * Does NOT validate individual entries deeply — trust the builder.
 */
export function normalizeOperatingLedgerDays(
  input: unknown,
): DailyOperatingLedgerDaySummary[] {
  if (!Array.isArray(input)) {
    return [];
  }
  // Basic shape validation: each entry must have a day number
  return input.filter((entry): entry is DailyOperatingLedgerDaySummary =>
    entry != null
    && typeof entry === 'object'
    && typeof (entry as any).day === 'number'
    && (entry as any).day > 0,
  );
}
