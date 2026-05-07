/**
 * DailyOperatingLedger v0 — pure core read-model contract.
 *
 * The operating ledger answers:
 * - Which cases/opportunities had meaningful business movement today?
 * - Which movements need follow-through tomorrow?
 * - Which are resolved / signed / closed / observing / risk-blocked?
 * - What evidence supports each entry?
 * - Is this just a recommendation, or has it become a ContractFact?
 *
 * Mother model alignment:
 * - Section 0.2: "The model must be replayable, debuggable, and grounded in business truth."
 * - Section 5: Human Decision Model (DecisionState, DecisionMoment, DecisionCommitment)
 * - Section 8: Broker Service Essence (information → interpretation → recommendation)
 * - Section 9: POV And Interaction Design
 * - Section 12: Consensus Formation (pending → aligned → signed / collapsed)
 * - Section 16: High-Priority Interfaces (ActorKnowledge, SignalSource)
 * - Section 18.10: replay, store action commands, seeds/RNG counters, model versions
 * - Section 1.1: Same seed + same action command sequence should produce replayable world results
 *
 * Hard constraints:
 * 1. Pure types in core — no domain/runtime imports.
 * 2. No Date.now, no Math.random, no crypto, no global state.
 * 3. Deterministic: same input → same output, byte-identical.
 * 4. All refs are string IDs, not embedded objects.
 * 5. Summary/ref data only — no raw GameState/Case/Opportunity.
 * 6. All actions are draft/task/recommendation — never executed.
 * 7. Ledger is a projection of semantic receipts, not a replacement for GameState.
 * 8. Frozen output.
 * 9. Ledger does NOT become a source of gameplay truth.
 */

import type {
  DailySemanticReceiptBundle,
} from './models.js';

import type {
  DailyOperatingMovementSummary,
  DailyFollowThroughAgendaSummary,
} from './dailyDecisionBridge.js';

// ---------------------------------------------------------------------------
// DailyOperatingLedgerEntryStatus: lifecycle state of a ledger entry
// ---------------------------------------------------------------------------

export type DailyOperatingLedgerEntryStatus =
  | 'pending'       // needs follow-through
  | 'resolved'      // blocker resolved, situation improved
  | 'signed'        // consensus formed, deal closed
  | 'closed'        // opportunity or case closed (not a deal)
  | 'observing'     // situation stable, watching for change
  | 'risk_blocked'; // blocker preventing progress

// ---------------------------------------------------------------------------
// DailyOperatingLedgerEvidenceRef: compressed evidence reference
// ---------------------------------------------------------------------------

export interface DailyOperatingLedgerEvidenceRef {
  readonly refType: 'pressure_receipt' | 'consensus_receipt' | 'evaluation_snapshot'
    | 'interaction_scene' | 'event' | 'commitment' | 'belief' | 'attention'
    | 'opportunity' | 'contract_fact';
  readonly refId: string;
  readonly summary: string;
  readonly relevance: number; // 0..1
}

// ---------------------------------------------------------------------------
// DailyOperatingLedgerOutcome: what happened to this entry
// ---------------------------------------------------------------------------

export interface DailyOperatingLedgerOutcome {
  readonly outcomeType: 'movement' | 'blocker_emerged' | 'blocker_resolved'
    | 'commitment_changed' | 'consensus_shifted' | 'contract_signed'
    | 'opportunity_closed' | 'case_status_changed';
  readonly description: string;
  readonly direction: 'improved' | 'worsened' | 'emerged' | 'resolved' | 'unchanged';
  readonly magnitude: 'low' | 'medium' | 'high';
  readonly field?: string;
  readonly from?: string | number | boolean;
  readonly to?: string | number | boolean;
  readonly delta?: number;
  readonly sourceRefIds: readonly string[];
}

// ---------------------------------------------------------------------------
// DailyOperatingLedgerTaskItem: a follow-through task
// ---------------------------------------------------------------------------

export interface DailyOperatingLedgerTaskItem {
  readonly taskId: string;
  readonly kind: 'resolve_blocker' | 'revisit_opportunity' | 'follow_commitment'
    | 'check_status' | 'escalate' | 'close_entry' | 'monitor';
  readonly description: string;
  readonly priority: 'urgent' | 'high' | 'medium' | 'low' | 'deferred';
  readonly relatedField?: string;
  readonly sourceRefIds: readonly string[];
}

// ---------------------------------------------------------------------------
// DailyOperatingLedgerEntry: a single ledger entry (one case/opportunity)
// ---------------------------------------------------------------------------

export interface DailyOperatingLedgerEntry {
  readonly caseId: string;
  readonly status: DailyOperatingLedgerEntryStatus;
  readonly day: number;
  readonly outcomes: readonly DailyOperatingLedgerOutcome[];
  readonly tasks: readonly DailyOperatingLedgerTaskItem[];
  readonly evidenceRefs: readonly DailyOperatingLedgerEvidenceRef[];
  readonly recommendedActionId?: string;
  readonly urgencyScore: number; // 0-100
  readonly movementSummary: string;
}

// ---------------------------------------------------------------------------
// DailyOperatingLedgerDaySummary: one day's compressed operating record
// ---------------------------------------------------------------------------

export interface DailyOperatingLedgerDaySummary {
  readonly day: number;
  readonly entries: readonly DailyOperatingLedgerEntry[];
  readonly entryCount: number;
  readonly pendingCount: number;
  readonly resolvedCount: number;
  readonly signedCount: number;
  readonly closedCount: number;
  readonly observingCount: number;
  readonly riskBlockedCount: number;
  readonly totalTasks: number;
  readonly totalOutcomes: number;
  readonly totalEvidenceRefs: number;
  /** The full semantic receipt bundle for this day (already compressed). */
  readonly semanticReceipt?: DailySemanticReceiptBundle;
  /** Movement summary for this day. */
  readonly operatingMovement?: DailyOperatingMovementSummary;
  /** Follow-through agenda for next day. */
  readonly followThroughAgenda?: DailyFollowThroughAgendaSummary;
}

// ---------------------------------------------------------------------------
// DailyOperatingLedgerInput: plain input for the ledger builder
// ---------------------------------------------------------------------------

export interface DailyOperatingLedgerEntryInput {
  readonly caseId: string;
  readonly status: DailyOperatingLedgerEntryStatus;
  readonly outcomes: readonly DailyOperatingLedgerOutcome[];
  readonly tasks: readonly DailyOperatingLedgerTaskItem[];
  readonly evidenceRefs: readonly DailyOperatingLedgerEvidenceRef[];
  readonly recommendedActionId?: string;
  readonly urgencyScore?: number;
  readonly movementSummary?: string;
}

export interface DailyOperatingLedgerDayInput {
  readonly day: number;
  readonly entries: readonly DailyOperatingLedgerEntryInput[];
  readonly semanticReceipt?: DailySemanticReceiptBundle;
  readonly operatingMovement?: DailyOperatingMovementSummary;
  readonly followThroughAgenda?: DailyFollowThroughAgendaSummary;
}

// ---------------------------------------------------------------------------
// DailyOperatingLedgerSummary: aggregate summary across days
// ---------------------------------------------------------------------------

export interface DailyOperatingLedgerSummary {
  readonly totalDays: number;
  readonly totalEntries: number;
  readonly totalPending: number;
  readonly totalResolved: number;
  readonly totalSigned: number;
  readonly totalClosed: number;
  readonly totalObserving: number;
  readonly totalRiskBlocked: number;
  readonly totalTasks: number;
  readonly totalOutcomes: number;
  readonly totalEvidenceRefs: number;
  readonly days: readonly DailyOperatingLedgerDaySummary[];
}

// ---------------------------------------------------------------------------
// DailyOperatingLedgerReplaySlice: replay data for one day
// ---------------------------------------------------------------------------

export interface DailyOperatingLedgerReplaySlice {
  readonly day: number;
  readonly entries: readonly DailyOperatingLedgerEntry[];
  readonly summary: DailyOperatingLedgerDaySummary;
}

// ---------------------------------------------------------------------------
// Builders (pure, deterministic, frozen)
// ---------------------------------------------------------------------------

export function buildEmptyDailyOperatingLedgerDaySummary(day: number): DailyOperatingLedgerDaySummary {
  return Object.freeze({
    day,
    entries: Object.freeze([]),
    entryCount: 0,
    pendingCount: 0,
    resolvedCount: 0,
    signedCount: 0,
    closedCount: 0,
    observingCount: 0,
    riskBlockedCount: 0,
    totalTasks: 0,
    totalOutcomes: 0,
    totalEvidenceRefs: 0,
  });
}

export function buildDailyOperatingLedgerDaySummary(
  input: DailyOperatingLedgerDayInput,
): DailyOperatingLedgerDaySummary {
  const entries: DailyOperatingLedgerEntry[] = [];
  let pendingCount = 0;
  let resolvedCount = 0;
  let signedCount = 0;
  let closedCount = 0;
  let observingCount = 0;
  let riskBlockedCount = 0;
  let totalTasks = 0;
  let totalOutcomes = 0;
  let totalEvidenceRefs = 0;

  for (const entryInput of input.entries) {
    const entry: DailyOperatingLedgerEntry = Object.freeze({
      caseId: entryInput.caseId,
      status: entryInput.status,
      day: input.day,
      outcomes: Object.freeze([...entryInput.outcomes]),
      tasks: Object.freeze([...entryInput.tasks]),
      evidenceRefs: Object.freeze([...entryInput.evidenceRefs]),
      recommendedActionId: entryInput.recommendedActionId,
      urgencyScore: entryInput.urgencyScore ?? 0,
      movementSummary: entryInput.movementSummary ?? '',
    });
    entries.push(entry);

    // Count by status
    switch (entryInput.status) {
      case 'pending': pendingCount++; break;
      case 'resolved': resolvedCount++; break;
      case 'signed': signedCount++; break;
      case 'closed': closedCount++; break;
      case 'observing': observingCount++; break;
      case 'risk_blocked': riskBlockedCount++; break;
    }

    totalTasks += entryInput.tasks.length;
    totalOutcomes += entryInput.outcomes.length;
    totalEvidenceRefs += entryInput.evidenceRefs.length;
  }

  return Object.freeze({
    day: input.day,
    entries: Object.freeze(entries),
    entryCount: entries.length,
    pendingCount,
    resolvedCount,
    signedCount,
    closedCount,
    observingCount,
    riskBlockedCount,
    totalTasks,
    totalOutcomes,
    totalEvidenceRefs,
    semanticReceipt: input.semanticReceipt,
    operatingMovement: input.operatingMovement,
    followThroughAgenda: input.followThroughAgenda,
  });
}

export function summarizeDailyOperatingLedger(
  days: readonly DailyOperatingLedgerDaySummary[],
): DailyOperatingLedgerSummary {
  let totalEntries = 0;
  let totalPending = 0;
  let totalResolved = 0;
  let totalSigned = 0;
  let totalClosed = 0;
  let totalObserving = 0;
  let totalRiskBlocked = 0;
  let totalTasks = 0;
  let totalOutcomes = 0;
  let totalEvidenceRefs = 0;

  for (const day of days) {
    totalEntries += day.entryCount;
    totalPending += day.pendingCount;
    totalResolved += day.resolvedCount;
    totalSigned += day.signedCount;
    totalClosed += day.closedCount;
    totalObserving += day.observingCount;
    totalRiskBlocked += day.riskBlockedCount;
    totalTasks += day.totalTasks;
    totalOutcomes += day.totalOutcomes;
    totalEvidenceRefs += day.totalEvidenceRefs;
  }

  return Object.freeze({
    totalDays: days.length,
    totalEntries,
    totalPending,
    totalResolved,
    totalSigned,
    totalClosed,
    totalObserving,
    totalRiskBlocked,
    totalTasks,
    totalOutcomes,
    totalEvidenceRefs,
    days: Object.freeze([...days]),
  });
}

export function buildDailyOperatingLedgerReplaySlice(
  day: number,
  entries: readonly DailyOperatingLedgerEntry[],
): DailyOperatingLedgerReplaySlice {
  const summary = buildDailyOperatingLedgerDaySummary({
    day,
    entries: entries.map((e) => ({
      caseId: e.caseId,
      status: e.status,
      outcomes: e.outcomes,
      tasks: e.tasks,
      evidenceRefs: e.evidenceRefs,
      recommendedActionId: e.recommendedActionId,
      urgencyScore: e.urgencyScore,
      movementSummary: e.movementSummary,
    })),
  });

  return Object.freeze({
    day,
    entries: Object.freeze([...entries]),
    summary,
  });
}
