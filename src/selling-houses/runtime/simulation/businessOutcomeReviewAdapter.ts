/**
 * BusinessOutcomeReview Runtime Adapter — generates structured result reviews
 * from ended ProcessRuns.
 *
 * Mother model alignment:
 * - Section 3: Processes (OpenDayRun, NegotiationProcess, etc.)
 * - Section 12: Consensus Formation lifecycle
 * - Section 18.10: replayable, deterministic
 *
 * Hard constraints:
 * 1. Review is read-only — does NOT create ContractFact.
 * 2. Pure functions — no side effects.
 * 3. No Date.now, no Math.random, no fetch, no LLM.
 * 4. Deterministic: same input → same output.
 * 5. Frozen output.
 * 6. No raw GameState/Case/Opportunity in review output.
 */

import type {
  GameState,
  BusinessOutcomeReview,
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

function buildSuccessFactors(
  run: ProcessRun,
  state: GameState,
): readonly string[] {
  const factors: string[] = [];
  const caseId = run.caseId;
  const caseObj = state.cases.find((c) => c.id === caseId);

  if (run.status === 'converted_to_contract') {
    factors.push('共识成功转为签约');
  }
  if (caseObj && caseObj.trust >= 60) {
    factors.push(`业主信任度良好 (${caseObj.trust}/100)`);
  }
  if (caseObj && caseObj.heat >= 50) {
    factors.push(`房源热度充足 (${caseObj.heat}/100)`);
  }
  if (run.phaseSnapshots.length >= 3) {
    factors.push('流程经历了多个阶段，推进深入');
  }
  const signedSettlements = (state.commitmentSettlementHistory ?? []).filter(
    (s) => s.caseId === caseId && s.trigger === 'signed',
  );
  if (signedSettlements.length > 0) {
    factors.push('承诺成功转为签约');
  }

  return freezeArray(factors);
}

function buildFailureFactors(
  run: ProcessRun,
  state: GameState,
): readonly string[] {
  const factors: string[] = [];
  const caseId = run.caseId;
  const caseObj = state.cases.find((c) => c.id === caseId);

  if (run.status === 'collapsed') {
    factors.push('共识破裂');
  }
  if (caseObj && caseObj.trust < 40) {
    factors.push(`业主信任度过低 (${caseObj.trust}/100)`);
  }
  if (caseObj && caseObj.patience < 30) {
    factors.push(`业主耐心不足 (${caseObj.patience}/100)`);
  }
  const blockedReceipts = (state.actionReceiptHistory ?? []).filter(
    (r) => r.caseId === caseId && r.outcome === 'blocked',
  );
  if (blockedReceipts.length >= 3) {
    factors.push(`多次动作被阻断 (${blockedReceipts.length}次)`);
  }
  const revokedSettlements = (state.commitmentSettlementHistory ?? []).filter(
    (s) => s.caseId === caseId && s.trigger === 'revoked',
  );
  if (revokedSettlements.length > 0) {
    factors.push('发生承诺撤销');
  }

  return freezeArray(factors);
}

function buildKeyLearnings(
  run: ProcessRun,
  state: GameState,
): readonly string[] {
  const learnings: string[] = [];
  const caseId = run.caseId;
  const caseObj = state.cases.find((c) => c.id === caseId);

  if (run.status === 'converted_to_contract') {
    learnings.push('完整的共识形成流程对成交至关重要');
  }
  if (run.status === 'collapsed') {
    learnings.push('需要更早识别并处理共识风险因素');
  }
  if (caseObj) {
    if (caseObj.personality === 'urgent' && caseObj.patience < 30) {
      learnings.push('紧迫型业主需要更频繁的沟通和快速决策');
    }
    if (caseObj.personality === 'emotional' && caseObj.trust < 50) {
      learnings.push('情绪化业主需要更多信任建设');
    }
  }

  return freezeArray(learnings);
}

function buildRecommendedNextActions(
  run: ProcessRun,
  state: GameState,
): BusinessOutcomeReview['recommendedNextActions'] {
  const actions: BusinessOutcomeReview['recommendedNextActions'][number][] = [];
  const caseId = run.caseId;
  const caseObj = state.cases.find((c) => c.id === caseId);

  if (run.status === 'collapsed') {
    actions.push(Object.freeze({
      actionId: 'deep-diagnosis',
      reason: '共识破裂后需要深度诊断原因',
      priority: 'high' as const,
    }));
    if (caseObj && caseObj.trust < 40) {
      actions.push(Object.freeze({
        actionId: 'first-visit',
        reason: '重新建立与业主的信任关系',
        priority: 'urgent' as const,
      }));
    }
  }

  if (run.status === 'active' && run.blockers.length > 0) {
    actions.push(Object.freeze({
      actionId: 'weekly-feedback',
      reason: '定期跟进以处理阻塞因素',
      priority: 'medium' as const,
    }));
  }

  return freezeArray(actions);
}

// ---------------------------------------------------------------------------
// buildBusinessOutcomeReviewFromRun — main entry point
// ---------------------------------------------------------------------------

/**
 * Builds a BusinessOutcomeReview from an ended ProcessRun.
 *
 * Reads from processRunHistory, actionReceiptHistory, commitmentSettlementHistory.
 * Does NOT create ContractFact. Does NOT mutate GameState.
 * Pure function. Deterministic. Frozen output.
 */
export function buildBusinessOutcomeReviewFromRun(
  state: GameState,
  run: ProcessRun,
): BusinessOutcomeReview {
  const caseId = run.caseId;
  const receipts = state.actionReceiptHistory ?? [];
  const settlements = state.commitmentSettlementHistory ?? [];
  const caseReceipts = receipts.filter((r) => r.caseId === caseId);
  const caseSettlements = settlements.filter((s) => s.caseId === caseId);

  const successFactors = buildSuccessFactors(run, state);
  const failureFactors = buildFailureFactors(run, state);
  const keyLearnings = buildKeyLearnings(run, state);
  const recommendedNextActions = buildRecommendedNextActions(run, state);

  // Build outcome description
  let outcomeDescription = '';
  switch (run.status) {
    case 'converted_to_contract':
      outcomeDescription = '流程成功转为签约成交';
      break;
    case 'collapsed':
      outcomeDescription = '共识破裂，流程终止';
      break;
    case 'blocked':
      outcomeDescription = '流程被阻断，需要处理阻塞因素';
      break;
    case 'active':
      outcomeDescription = '流程仍在进行中';
      break;
    default:
      outcomeDescription = `流程状态: ${run.status}`;
  }

  // Find contract fact if any
  const contractFacts = state.runtimeContractFacts ?? [];
  const caseContract = contractFacts.find((cf) => cf.caseId === caseId);
  const contractFactId = caseContract?.contractId ?? null;

  return Object.freeze({
    reviewId: `review:${caseId}:${run.runId}`,
    caseId,
    templateKind: run.templateKind,
    startedDay: run.startedDay,
    endedDay: run.endedDay ?? state.day,
    finalStatus: run.status,
    outcomeDescription,
    successFactors,
    failureFactors,
    keyLearnings,
    relatedReceiptIds: freezeArray(caseReceipts.map((r) => r.receiptId)),
    relatedSettlementIds: freezeArray(caseSettlements.map((s) => s.settlementId)),
    relatedRunIds: freezeArray([run.runId]),
    contractFactId,
    recommendedNextActions,
  });
}

// ---------------------------------------------------------------------------
// buildBusinessOutcomeReviewsFromState — batch builder
// ---------------------------------------------------------------------------

/**
 * Builds BusinessOutcomeReview for all ended ProcessRuns.
 * Does NOT mutate GameState. Pure function. Deterministic. Frozen output.
 */
export function buildBusinessOutcomeReviewsFromState(
  state: GameState,
): readonly BusinessOutcomeReview[] {
  const runs = state.processRunHistory ?? [];
  const reviews: BusinessOutcomeReview[] = [];

  for (const run of runs) {
    // Only review ended runs
    if (run.status !== 'active' && run.status !== 'blocked') {
      reviews.push(buildBusinessOutcomeReviewFromRun(state, run));
    }
  }

  // Sort by caseId for deterministic ordering
  reviews.sort((a, b) => a.caseId.localeCompare(b.caseId));

  return freezeArray(reviews);
}

// ---------------------------------------------------------------------------
// enrichStateWithBusinessOutcomeReviews — upsert-safe state enrichment
// ---------------------------------------------------------------------------

export function enrichStateWithBusinessOutcomeReviews(
  state: GameState,
  reviews: readonly BusinessOutcomeReview[],
): void {
  if (!state.businessOutcomeReviewHistory) {
    state.businessOutcomeReviewHistory = [];
  }

  for (const review of reviews) {
    const existingIndex = state.businessOutcomeReviewHistory.findIndex(
      (entry) => entry.reviewId === review.reviewId,
    );
    if (existingIndex >= 0) {
      state.businessOutcomeReviewHistory[existingIndex] = review;
    } else {
      state.businessOutcomeReviewHistory.push(review);
    }
  }
}

// ---------------------------------------------------------------------------
// normalizeBusinessOutcomeReviewHistory — for save/load compatibility
// ---------------------------------------------------------------------------

export function normalizeBusinessOutcomeReviewHistory(input: unknown): BusinessOutcomeReview[] {
  if (!Array.isArray(input)) return [];
  return input.filter(
    (entry): entry is BusinessOutcomeReview =>
      entry != null
      && typeof entry === 'object'
      && typeof (entry as any).reviewId === 'string'
      && typeof (entry as any).caseId === 'string'
      && typeof (entry as any).startedDay === 'number'
      && (entry as any).startedDay > 0,
  );
}
