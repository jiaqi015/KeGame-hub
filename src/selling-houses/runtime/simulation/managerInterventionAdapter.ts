/**
 * ManagerIntervention Runtime Adapter — generates manager intervention
 * ActionReceipts when FocusMeeting selects cases or manager drafts appear.
 *
 * Mother model alignment:
 * - Section 5: Human Decision Model (DecisionIntent for manager role)
 * - Section 11.3: FocusMeetingRun (CasePitch → BuyerBrokerAttention → RecommendationCommitment)
 * - Section 18.10: replayable, deterministic
 *
 * Hard constraints:
 * 1. Pure functions — no side effects.
 * 2. No Date.now, no Math.random, no fetch, no LLM.
 * 3. Deterministic: same input → same output.
 * 4. Frozen output.
 * 5. Does NOT directly write trust / urgency / stage.
 * 6. Does NOT bypass ConsensusFormation / ContractFact.
 * 7. Does NOT alter rngCalls, closedDeals, opportunity lifecycle.
 */

import type {
  GameState,
  ManagerInterventionReceipt,
} from '../../domain/models.js';
import { asWritableGameState } from '../../domain/models.js';
import { isOpportunityActiveByCanonicalState } from '../../domain/opportunityLifecycleStatusRead.js';

import type {
  ActionReceipt,
} from '../../domain/models.js';

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
// buildManagerInterventionFromFocusMeeting — main builder
// ---------------------------------------------------------------------------

/**
 * Builds a ManagerInterventionReceipt from FocusMeeting selection context.
 *
 * Called when focus meeting selects cases on day 4 (Wednesday).
 * Reads only from FocusMeetingState and action receipt history.
 * Does NOT mutate GameState. Pure function. Deterministic. Frozen output.
 */
export function buildManagerInterventionFromFocusMeeting(
  state: GameState,
): ManagerInterventionReceipt | null {
  const focusMeeting = state.focusMeeting;
  if (!focusMeeting || focusMeeting.submissionDay !== state.day) {
    return null; // Not a focus meeting day
  }

  if (focusMeeting.submittedCaseIds.length === 0) {
    return null; // No cases submitted
  }

  const selectedCaseIds = focusMeeting.selectedCaseIds ?? [];
  const submittedCaseIds = focusMeeting.submittedCaseIds ?? [];
  const day = state.day;

  // Build drafts from selected cases' recommendation drafts
  const drafts: ManagerInterventionReceipt['drafts'][number][] = [];
  for (const caseId of selectedCaseIds) {
    const caseItem = state.cases.find((c) => c.id === caseId);
    if (!caseItem) continue;

    // Generate a draft based on case state
    const opportunities = state.opportunities.filter(
      (o) => o.caseId === caseId && isOpportunityActiveByCanonicalState(state, o),
    );
    const lateStageOpps = opportunities.filter((o) => o.stageIndex >= 3);

    if (lateStageOpps.length > 0) {
      drafts.push(Object.freeze({
        draftId: `draft:manager:${caseId}:negotiation:${day}`,
        actionSpecId: 'invite-customer-negotiation',
        reason: `案例 ${caseItem.title} 有 ${lateStageOpps.length} 个晚期机会，建议推进谈判`,
      }));
    } else {
      drafts.push(Object.freeze({
        draftId: `draft:manager:${caseId}:showing:${day}`,
        actionSpecId: 'showing',
        reason: `案例 ${caseItem.title} 需要更多带看以推进机会`,
      }));
    }
  }

  // Determine recommended action from drafts
  let recommendedActionId: string | null = null;
  let recommendationReason = '';
  if (drafts.length > 0) {
    recommendedActionId = drafts[0].actionSpecId;
    recommendationReason = drafts[0].reason;
  }

  // Build evidence refs from recent receipts
  const recentReceipts = (state.actionReceiptHistory ?? []).filter(
    (r) => r.day >= day - 3 && selectedCaseIds.includes(r.caseId),
  );
  const evidenceRefs: string[] = [];
  for (const r of recentReceipts) {
    evidenceRefs.push(r.receiptId);
  }

  return Object.freeze({
    receiptId: `manager-intervention:${day}`,
    day,
    caseId: selectedCaseIds[0] ?? submittedCaseIds[0] ?? '',
    interventionKind: 'focus_meeting_selection',
    focusMeetingSubmittedCaseIds: freezeArray(submittedCaseIds),
    focusMeetingSelectedCaseIds: freezeArray(selectedCaseIds),
    drafts: freezeArray(drafts),
    evidenceRefs: freezeArray(evidenceRefs),
    recommendedActionId,
    recommendationReason,
  });
}

// ---------------------------------------------------------------------------
// buildManagerInterventionFromDraft — from escalation or manager draft
// ---------------------------------------------------------------------------

/**
 * Builds a ManagerInterventionReceipt from a manager escalation or draft.
 * Called when a manager creates an intervention draft for a case.
 * Does NOT mutate GameState. Pure function. Deterministic. Frozen output.
 */
export function buildManagerInterventionFromDraft(
  state: GameState,
  caseId: string,
  actionSpecId: string,
  reason: string,
): ManagerInterventionReceipt {
  const day = state.day;

  // Build evidence refs from case receipts
  const caseReceipts = (state.actionReceiptHistory ?? []).filter((r) => r.caseId === caseId);
  const evidenceRefs: string[] = [];
  for (const r of caseReceipts) {
    evidenceRefs.push(r.receiptId);
  }

  const drafts = [
    Object.freeze({
      draftId: `draft:manager:${caseId}:${actionSpecId}:${day}`,
      actionSpecId,
      reason,
    }),
  ];

  return Object.freeze({
    receiptId: `manager-intervention:${caseId}:${day}`,
    day,
    caseId,
    interventionKind: 'manager_draft',
    focusMeetingSubmittedCaseIds: Object.freeze([]),
    focusMeetingSelectedCaseIds: Object.freeze([]),
    drafts: freezeArray(drafts),
    evidenceRefs: freezeArray(evidenceRefs),
    recommendedActionId: actionSpecId,
    recommendationReason: reason,
  });
}

// ---------------------------------------------------------------------------
// enrichStateWithManagerInterventions — upsert-safe state enrichment
// ---------------------------------------------------------------------------

export function enrichStateWithManagerInterventions(
  state: GameState,
  receipts: readonly ManagerInterventionReceipt[],
): void {
  if (!state.managerInterventionReceiptHistory) {
    asWritableGameState(state).managerInterventionReceiptHistory = [];
  }

  for (const receipt of receipts) {
    const existingIndex = state.managerInterventionReceiptHistory.findIndex(
      (entry) => entry.receiptId === receipt.receiptId,
    );
    if (existingIndex >= 0) {
      asWritableGameState(state).managerInterventionReceiptHistory[existingIndex] = receipt;
    } else {
      asWritableGameState(state).managerInterventionReceiptHistory.push(receipt);
    }
  }
}

// ---------------------------------------------------------------------------
// normalizeManagerInterventionReceiptHistory — for save/load compatibility
// ---------------------------------------------------------------------------

export function normalizeManagerInterventionReceiptHistory(input: unknown): ManagerInterventionReceipt[] {
  if (!Array.isArray(input)) return [];
  return input.filter(
    (entry): entry is ManagerInterventionReceipt =>
      entry != null
      && typeof entry === 'object'
      && typeof (entry as any).receiptId === 'string'
      && typeof (entry as any).caseId === 'string'
      && typeof (entry as any).day === 'number'
      && (entry as any).day > 0,
  );
}
