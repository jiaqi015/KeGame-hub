/**
 * NegotiationReplay Runtime Adapter — generates replay summaries from
 * ProcessRun, ConsensusFormation, ContractFact, and ActionReceipt.
 *
 * Mother model alignment:
 * - Section 4: Consensus Formation lifecycle
 * - Section 4.3: Contract / OpportunityClosureSet
 * - Section 12: Consensus Formation (not_started → signed | collapsed)
 * - Section 18.10: replayable, deterministic
 *
 * Hard constraints:
 * 1. Replay is read-only — does NOT re-roll dice.
 * 2. Pure functions — no side effects.
 * 3. No Date.now, no Math.random, no fetch, no LLM.
 * 4. Deterministic: same input → same output.
 * 5. Frozen output.
 * 6. No raw GameState/Case/Opportunity in replay output.
 */

import type {
  GameState,
  NegotiationReplaySummary,
  NegotiationReplayPhase,
  NegotiationReplayTurnPoint,
} from '../../domain/models.js';
import { asWritableGameState } from '../../domain/models.js';
import { isOpportunityActiveByCanonicalState } from '../../domain/opportunityLifecycleStatusRead.js';

import type {
  ProcessRun,
} from '../../core/world-state/processes/models.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freezeArray<T>(items: readonly T[]): readonly T[] {
  return Object.freeze([...items]) as readonly T[];
}

// ---------------------------------------------------------------------------
// buildNegotiationReplayFromRun — main entry point
// ---------------------------------------------------------------------------

/**
 * Builds a NegotiationReplaySummary from a consensus_to_contract ProcessRun.
 *
 * Reads from processRunHistory, actionReceiptHistory, commitmentSettlementHistory,
 * and runtime consensus/contract states.
 * Does NOT mutate GameState. Does NOT re-roll dice.
 * Pure function. Deterministic. Frozen output.
 */
export function buildNegotiationReplayFromRun(
  state: GameState,
  run: ProcessRun,
): NegotiationReplaySummary {
  const caseId = run.caseId;
  const receipts = state.actionReceiptHistory ?? [];
  const settlements = state.commitmentSettlementHistory ?? [];
  const caseReceipts = receipts.filter((r) => r.caseId === caseId);
  const caseSettlements = settlements.filter((s) => s.caseId === caseId);

  // Find customer ID from opportunities
  const opp = state.opportunities.find(
    (o) => o.caseId === caseId && isOpportunityActiveByCanonicalState(state, o),
  );
  const customerId = opp?.customerId ?? '';

  // Build phases from process run phase snapshots
  const phases: NegotiationReplayPhase[] = [];
  for (const snapshot of run.phaseSnapshots) {
    const template = run.templateKind;
    phases.push(Object.freeze({
      phaseId: snapshot.phaseId,
      label: snapshot.phaseId,
      enteredDay: snapshot.enteredDay,
      exitedDay: snapshot.exitedDay ?? null,
      triggerReceiptId: snapshot.actionReceiptIds[0] ?? null,
      triggerSettlementId: snapshot.commitmentSettlementIds[0] ?? null,
      description: `阶段 ${snapshot.phaseId}`,
    }));
  }

  // Build turn points from settlements and blocked receipts
  const turnPoints: NegotiationReplayTurnPoint[] = [];

  // Settlement-based turn points
  for (const settlement of caseSettlements) {
    let impact: 'positive' | 'negative' | 'neutral' = 'neutral';
    if (settlement.trigger === 'advanced' || settlement.trigger === 'signed') {
      impact = 'positive';
    } else if (settlement.trigger === 'collapsed' || settlement.trigger === 'revoked') {
      impact = 'negative';
    }

    turnPoints.push(Object.freeze({
      turnPointId: `turnpoint:${caseId}:${settlement.settlementId}`,
      day: settlement.day,
      description: `${settlement.commitmentKind} ${settlement.trigger}: ${settlement.reason}`,
      relatedReceiptId: null,
      relatedSettlementId: settlement.settlementId,
      impact,
    }));
  }

  // Blocked receipt-based turn points
  const blockedReceipts = caseReceipts.filter((r) => r.outcome === 'blocked');
  for (const receipt of blockedReceipts) {
    turnPoints.push(Object.freeze({
      turnPointId: `turnpoint:${caseId}:${receipt.receiptId}:blocked`,
      day: receipt.day,
      description: `动作被阻断: ${receipt.outcomeSummary}`,
      relatedReceiptId: receipt.receiptId,
      relatedSettlementId: null,
      impact: 'negative',
    }));
  }

  // Sort turn points by day
  turnPoints.sort((a, b) => a.day - b.day);

  // Build evidence chain from action receipts, commitment settlements,
  // and operating ledger entries for the case's active days
  const evidenceChain: NegotiationReplaySummary['evidenceChain'][number][] = [];
  for (const r of caseReceipts) {
    evidenceChain.push(Object.freeze({
      refType: 'action_receipt',
      refId: r.receiptId,
      day: r.day,
      summary: `${r.actionId}: ${r.outcomeSummary}`,
    }));
  }
  for (const s of caseSettlements) {
    evidenceChain.push(Object.freeze({
      refType: 'commitment_settlement',
      refId: s.settlementId,
      day: s.day,
      summary: `${s.commitmentKind} ${s.trigger}: ${s.reason}`,
    }));
  }

  // Add operating ledger entries for this case as evidence
  const ledgerDays = state.operatingLedgerDays ?? [];
  for (const ledgerDay of ledgerDays) {
    const caseEntry = ledgerDay.entries.find((e) => e.caseId === caseId);
    if (caseEntry) {
      evidenceChain.push(Object.freeze({
        refType: 'operating_ledger',
        refId: `ledger:${caseId}:d${ledgerDay.day}`,
        day: ledgerDay.day,
        summary: caseEntry.movementSummary || `urgency=${caseEntry.urgencyScore}`,
      }));
    }
  }

  // Add strategy fork receipts for this case as evidence
  const strategyForks = state.strategyForkHistory ?? [];
  for (const fork of strategyForks) {
    if (fork.caseId === caseId) {
      evidenceChain.push(Object.freeze({
        refType: 'strategy_fork',
        refId: fork.forkId,
        day: fork.day,
        summary: `策略分叉: ${fork.recommendationRationale ?? '无推荐'} (${fork.branches.length} branches)`,
      }));
    }
  }

  evidenceChain.sort((a, b) => a.day - b.day);

  // Find contract fact if any
  const contractFacts = state.runtimeContractFacts ?? [];
  const caseContract = contractFacts.find((cf) => cf.caseId === caseId);
  const contractFactId = caseContract?.contractId ?? null;

  return Object.freeze({
    replayId: `replay:${caseId}:${run.runId}`,
    caseId,
    customerId,
    templateKind: run.templateKind,
    startedDay: run.startedDay,
    endedDay: run.endedDay ?? null,
    finalStatus: run.status,
    phases: freezeArray(phases),
    turnPoints: freezeArray(turnPoints),
    evidenceChain: freezeArray(evidenceChain),
    contractFactId,
  });
}

// ---------------------------------------------------------------------------
// buildNegotiationReplaysFromState — batch builder
// ---------------------------------------------------------------------------

/**
 * Builds NegotiationReplaySummary for all consensus_to_contract ProcessRuns.
 * Does NOT mutate GameState. Pure function. Deterministic. Frozen output.
 */
export function buildNegotiationReplaysFromState(
  state: GameState,
): readonly NegotiationReplaySummary[] {
  const runs = state.processRunHistory ?? [];
  const replays: NegotiationReplaySummary[] = [];

  for (const run of runs) {
    if (run.templateKind === 'consensus_to_contract') {
      replays.push(buildNegotiationReplayFromRun(state, run));
    }
  }

  // Sort by caseId for deterministic ordering
  replays.sort((a, b) => a.caseId.localeCompare(b.caseId));

  return freezeArray(replays);
}

// ---------------------------------------------------------------------------
// enrichStateWithNegotiationReplays — upsert-safe state enrichment
// ---------------------------------------------------------------------------

export function enrichStateWithNegotiationReplays(
  state: GameState,
  replays: readonly NegotiationReplaySummary[],
): void {
  if (!state.negotiationReplayHistory) {
    asWritableGameState(state).negotiationReplayHistory = [];
  }

  for (const replay of replays) {
    const existingIndex = state.negotiationReplayHistory.findIndex(
      (entry) => entry.replayId === replay.replayId,
    );
    if (existingIndex >= 0) {
      asWritableGameState(state).negotiationReplayHistory[existingIndex] = replay;
    } else {
      asWritableGameState(state).negotiationReplayHistory.push(replay);
    }
  }
}

// ---------------------------------------------------------------------------
// normalizeNegotiationReplayHistory — for save/load compatibility
// ---------------------------------------------------------------------------

export function normalizeNegotiationReplayHistory(input: unknown): NegotiationReplaySummary[] {
  if (!Array.isArray(input)) return [];
  return input.filter(
    (entry): entry is NegotiationReplaySummary =>
      entry != null
      && typeof entry === 'object'
      && typeof (entry as any).replayId === 'string'
      && typeof (entry as any).caseId === 'string'
      && typeof (entry as any).startedDay === 'number'
      && (entry as any).startedDay > 0,
  );
}
