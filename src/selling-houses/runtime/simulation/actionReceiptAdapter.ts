/**
 * ActionReceipt Runtime Adapter v0 — builds compressed action receipts
 * and commitment settlements from action execution context.
 *
 * Mother model alignment:
 * - Section 0.2: replayable, debuggable, grounded in business truth
 * - Section 1.1: same seed + same action → replayable results
 * - Section 5: Human Decision Model (DecisionState, DecisionMoment, DecisionCommitment)
 * - Section 18.10: replay, store seeds/RNG counters, deterministic
 *
 * Hard constraints:
 * 1. Pure functions for building — no side effects.
 * 2. No Date.now, no Math.random, no fetch, no OpenAI, no apiKey.
 * 3. Deterministic: same input → same output.
 * 4. Frozen output.
 * 5. No raw GameState/Case/Opportunity in receipt output.
 * 6. Receipt is audit/explanation only — does NOT participate in dice rolls.
 * 7. runtime/simulation can import core/domain types (allowed).
 */

import type {
  ActionReceipt,
  ActionReceiptFieldDelta,
  ActionReceiptOutcome,
  CommitmentSettlement,
  CommitmentSettlementTrigger,
  GameState,
} from '../../domain/models.js';

// ---------------------------------------------------------------------------
// ActionReceiptBuildInput — caller captures state snapshot before/after
// ---------------------------------------------------------------------------

export interface ActionReceiptBuildInput {
  readonly day: number;
  readonly caseId: string;
  readonly actionId: string;
  readonly executorId: string;
  readonly optionId: string | null;
  readonly outcome: ActionReceiptOutcome;
  readonly costEnergy: number;
  readonly costPromotionBudget: number;
  readonly fieldDeltas: readonly ActionReceiptFieldDelta[];
  readonly outcomeSummary: string;
  readonly emittedEventIds: readonly string[];
  readonly affectedOpportunityIds: readonly string[];
  readonly linkedOpportunityId?: string;
}

// ---------------------------------------------------------------------------
// CommitmentSettlementBuildInput — caller captures commitment change context
// ---------------------------------------------------------------------------

export interface CommitmentSettlementBuildInput {
  readonly day: number;
  readonly caseId: string;
  readonly commitmentKind: string;
  readonly commitmentScope: string;
  readonly trigger: CommitmentSettlementTrigger;
  readonly ownerEntity: string;
  readonly strengthBefore: number;
  readonly strengthAfter: number;
  readonly reason: string;
  readonly relatedEventIds: readonly string[];
  readonly relatedReceiptIds: readonly string[];
}

// ---------------------------------------------------------------------------
// buildActionReceipt — pure, deterministic, frozen
// ---------------------------------------------------------------------------

export function buildActionReceipt(input: ActionReceiptBuildInput): ActionReceipt {
  const receiptId = `receipt-${input.caseId}-${input.actionId}-${input.day}`;
  return Object.freeze({
    receiptId,
    day: input.day,
    actionId: input.actionId,
    executorId: input.executorId,
    caseId: input.caseId,
    optionId: input.optionId,
    outcome: input.outcome,
    costEnergy: input.costEnergy,
    costPromotionBudget: input.costPromotionBudget,
    fieldDeltas: Object.freeze([...input.fieldDeltas]),
    outcomeSummary: input.outcomeSummary,
    emittedEventIds: Object.freeze([...input.emittedEventIds]),
    affectedOpportunityIds: Object.freeze([...input.affectedOpportunityIds]),
    linkedOpportunityId: input.linkedOpportunityId,
  });
}

// ---------------------------------------------------------------------------
// buildCommitmentSettlement — pure, deterministic, frozen
// ---------------------------------------------------------------------------

export function buildCommitmentSettlement(input: CommitmentSettlementBuildInput): CommitmentSettlement {
  const settlementId = `settlement-${input.caseId}-${input.commitmentKind}-${input.day}`;
  return Object.freeze({
    settlementId,
    day: input.day,
    caseId: input.caseId,
    commitmentKind: input.commitmentKind,
    commitmentScope: input.commitmentScope,
    trigger: input.trigger,
    ownerEntity: input.ownerEntity,
    strengthBefore: input.strengthBefore,
    strengthAfter: input.strengthAfter,
    reason: input.reason,
    relatedEventIds: Object.freeze([...input.relatedEventIds]),
    relatedReceiptIds: Object.freeze([...input.relatedReceiptIds]),
  });
}

// ---------------------------------------------------------------------------
// appendActionReceipt — upsert-safe state enrichment
// ---------------------------------------------------------------------------

/**
 * Appends an ActionReceipt to GameState.actionReceiptHistory.
 * Idempotent: if a receipt with the same receiptId already exists, replaces it.
 * Does NOT affect gameplay, RNG, tick order, or UI.
 */
export function appendActionReceipt(state: GameState, receipt: ActionReceipt): void {
  if (!state.actionReceiptHistory) {
    state.actionReceiptHistory = [];
  }
  const existingIndex = state.actionReceiptHistory.findIndex(
    (entry) => entry.receiptId === receipt.receiptId,
  );
  if (existingIndex >= 0) {
    state.actionReceiptHistory[existingIndex] = receipt;
  } else {
    state.actionReceiptHistory.push(receipt);
  }
}

// ---------------------------------------------------------------------------
// appendCommitmentSettlement — upsert-safe state enrichment
// ---------------------------------------------------------------------------

/**
 * Appends a CommitmentSettlement to GameState.commitmentSettlementHistory.
 * Idempotent: if a settlement with the same settlementId already exists, replaces it.
 * Does NOT affect gameplay, RNG, tick order, or UI.
 */
export function appendCommitmentSettlement(state: GameState, settlement: CommitmentSettlement): void {
  if (!state.commitmentSettlementHistory) {
    state.commitmentSettlementHistory = [];
  }
  const existingIndex = state.commitmentSettlementHistory.findIndex(
    (entry) => entry.settlementId === settlement.settlementId,
  );
  if (existingIndex >= 0) {
    state.commitmentSettlementHistory[existingIndex] = settlement;
  } else {
    state.commitmentSettlementHistory.push(settlement);
  }
}

// ---------------------------------------------------------------------------
// normalizeActionReceiptHistory — for save/load compatibility
// ---------------------------------------------------------------------------

export function normalizeActionReceiptHistory(input: unknown): ActionReceipt[] {
  if (!Array.isArray(input)) return [];
  return input.filter(
    (entry): entry is ActionReceipt =>
      entry != null
      && typeof entry === 'object'
      && typeof (entry as any).receiptId === 'string'
      && typeof (entry as any).day === 'number'
      && (entry as any).day > 0,
  );
}

// ---------------------------------------------------------------------------
// normalizeCommitmentSettlementHistory — for save/load compatibility
// ---------------------------------------------------------------------------

export function normalizeCommitmentSettlementHistory(input: unknown): CommitmentSettlement[] {
  if (!Array.isArray(input)) return [];
  return input.filter(
    (entry): entry is CommitmentSettlement =>
      entry != null
      && typeof entry === 'object'
      && typeof (entry as any).settlementId === 'string'
      && typeof (entry as any).day === 'number'
      && (entry as any).day > 0,
  );
}

// ---------------------------------------------------------------------------
// buildActionReceiptsForDay — extract receipts for a given day
// ---------------------------------------------------------------------------

export function buildActionReceiptsForDay(
  state: GameState,
  day: number,
): readonly ActionReceipt[] {
  return (state.actionReceiptHistory ?? []).filter((r) => r.day === day);
}

// ---------------------------------------------------------------------------
// buildCommitmentSettlementsForDay — extract settlements for a given day
// ---------------------------------------------------------------------------

export function buildCommitmentSettlementsForDay(
  state: GameState,
  day: number,
): readonly CommitmentSettlement[] {
  return (state.commitmentSettlementHistory ?? []).filter((s) => s.day === day);
}

// ---------------------------------------------------------------------------
// buildActionReceiptSummary — compressed summary for a day
// ---------------------------------------------------------------------------

export interface ActionReceiptDaySummary {
  readonly day: number;
  readonly totalReceipts: number;
  readonly successCount: number;
  readonly blockedCount: number;
  readonly noEffectCount: number;
  readonly failedCount: number;
  readonly partialCount: number;
  readonly totalSettlements: number;
  readonly createdCount: number;
  readonly advancedCount: number;
  readonly expiredCount: number;
  readonly revokedCount: number;
  readonly signedCount: number;
  readonly collapsedCount: number;
}

export function buildActionReceiptDaySummary(
  state: GameState,
  day: number,
): ActionReceiptDaySummary {
  const receipts = buildActionReceiptsForDay(state, day);
  const settlements = buildCommitmentSettlementsForDay(state, day);

  let successCount = 0;
  let blockedCount = 0;
  let noEffectCount = 0;
  let failedCount = 0;
  let partialCount = 0;
  for (const r of receipts) {
    switch (r.outcome) {
      case 'success': successCount++; break;
      case 'blocked': blockedCount++; break;
      case 'no_effect': noEffectCount++; break;
      case 'failed': failedCount++; break;
      case 'partial': partialCount++; break;
    }
  }

  let createdCount = 0;
  let advancedCount = 0;
  let expiredCount = 0;
  let revokedCount = 0;
  let signedCount = 0;
  let collapsedCount = 0;
  for (const s of settlements) {
    switch (s.trigger) {
      case 'created': createdCount++; break;
      case 'advanced': advancedCount++; break;
      case 'expired': expiredCount++; break;
      case 'revoked': revokedCount++; break;
      case 'signed': signedCount++; break;
      case 'collapsed': collapsedCount++; break;
      case 'merged': break; // not counted separately
    }
  }

  return Object.freeze({
    day,
    totalReceipts: receipts.length,
    successCount,
    blockedCount,
    noEffectCount,
    failedCount,
    partialCount,
    totalSettlements: settlements.length,
    createdCount,
    advancedCount,
    expiredCount,
    revokedCount,
    signedCount,
    collapsedCount,
  });
}
