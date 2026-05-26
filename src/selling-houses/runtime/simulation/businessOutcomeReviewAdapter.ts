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
import { asWritableGameState } from '../../domain/models.js';

import type {
  ProcessRun,
} from '../../core/world-state/processes/models.js';

import { readCaseRelationBundleFromRuntime } from '../../core/world-state/relationReadProjection.js';

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
  if (caseObj) {
    const bundle = readCaseRelationBundleFromRuntime(state, caseObj);
    const trust = bundle.trust?.trust ?? caseObj.trust;
    if (trust >= 60) {
      factors.push(`业主信任度良好 (${trust}/100)`);
    }
    if (caseObj.heat >= 50) {
      factors.push(`房源热度充足 (${caseObj.heat}/100)`);
    }
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
  if (caseObj) {
    const bundle = readCaseRelationBundleFromRuntime(state, caseObj);
    const trust = bundle.trust?.trust ?? caseObj.trust;
    const patience = bundle.readiness?.patience ?? caseObj.patience;
    if (trust < 40) {
      factors.push(`业主信任度过低 (${trust}/100)`);
    }
    if (patience < 30) {
      factors.push(`业主耐心不足 (${patience}/100)`);
    }
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

  // Causal chain analysis: which link in the evidence chain broke?
  if (run.status === 'collapsed' || run.status === 'resolved') {
    const chainFactors = buildCausalChainFactors(run, state);
    factors.push(...chainFactors);
  }

  return freezeArray(factors);
}

/**
 * Causal chain analysis — identifies which link in the evidence chain broke.
 *
 * Mother model chain: competition pressure → market evidence → owner perception → consensus readiness → ContractFact.
 * Each factor maps to a specific link so the review can explain "why" not just "what".
 */
function buildCausalChainFactors(
  run: ProcessRun,
  state: GameState,
): string[] {
  const factors: string[] = [];
  const caseId = run.caseId;
  const caseObj = state.cases.find((c) => c.id === caseId);
  if (!caseObj) return factors;

  const bundle = readCaseRelationBundleFromRuntime(state, caseObj);
  const trust = bundle.trust?.trust ?? caseObj.trust;
  const patience = bundle.readiness?.patience ?? caseObj.patience;
  const urgency = bundle.readiness?.urgency ?? caseObj.urgency;

  // Link 1: Competition pressure → case heat
  if (caseObj.heat < 30) {
    factors.push(`[竞争→热度] 房源热度极低 (${caseObj.heat}/100)，竞争压力导致关注度不足`);
  }

  // Link 2: Market evidence → opportunity signals
  const caseReceipts = (state.actionReceiptHistory ?? []).filter((r) => r.caseId === caseId);
  const blockedCount = caseReceipts.filter((r) => r.outcome === 'blocked').length;
  if (blockedCount >= 2) {
    factors.push(`[市场→机会] 多次动作被阻断 (${blockedCount}次)，市场证据积累不足`);
  }

  // Link 3: Relation trust → owner perception
  if (trust < 50) {
    factors.push(`[关系→业主感知] 业主信任不足 (${trust}/100)，无法推动价格谈判`);
  }
  if (patience < 30) {
    factors.push(`[关系→业主感知] 业主耐心耗尽 (${patience}/100)，窗口即将关闭`);
  }

  // Link 4: Consensus readiness
  if (run.status === 'collapsed') {
    const consensusFormations = state.runtimeConsensusFormations ?? [];
    const caseConsensus = consensusFormations.find((cf) => cf.caseId === caseId);
    if (caseConsensus) {
      const stage = caseConsensus.stage;
      if (stage !== 'contract_ready' && stage !== 'signed') {
        factors.push(`[共识→签约] 共识停留在 ${stage} 阶段，未达 contract_ready`);
      }
      if (caseConsensus.blockers.length > 0) {
        factors.push(`[共识→签约] 共识有 ${caseConsensus.blockers.length} 个活跃阻断因素`);
      }
    }
  }

  return factors;
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
    const profiling = caseObj.ownerProfilingMemory;
    const bundle = readCaseRelationBundleFromRuntime(state, caseObj);
    const trust = bundle.trust?.trust ?? caseObj.trust;
    const patience = bundle.readiness?.patience ?? caseObj.patience;

    if (profiling) {
      const priceAnchor = profiling.dimensions.find((d) => d.key === 'price_anchor')?.value;
      const timeWindow = profiling.dimensions.find((d) => d.key === 'time_window')?.value;
      const decisionStyle = profiling.dimensions.find((d) => d.key === 'decision_style')?.value;

      if (priceAnchor === 'strong' && trust < 50) {
        learnings.push(`${profiling.ownerTypeName}：强价格锚定业主需要更多信任积累才能松动预期`);
      }
      if (timeWindow === 'short' && patience < 30) {
        learnings.push(`${profiling.ownerTypeName}：短窗口业主耐心即将耗尽，需要加速推进关键节点`);
      }
      if (decisionStyle === 'guided_or_joint' && trust < 50) {
        learnings.push(`${profiling.ownerTypeName}：共同决策型业主需要同步影响人的预期`);
      }
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
    if (caseObj) {
      const bundle = readCaseRelationBundleFromRuntime(state, caseObj);
      const trust = bundle.trust?.trust ?? caseObj.trust;
      if (trust < 40) {
        actions.push(Object.freeze({
          actionId: 'first-visit',
          reason: '重新建立与业主的信任关系',
          priority: 'urgent' as const,
        }));
      }
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

  // Enrich with operating ledger data for this case
  const ledgerDays = state.operatingLedgerDays ?? [];
  const caseLedgerEntries = ledgerDays.flatMap((day) =>
    day.entries.filter((e) => e.caseId === caseId),
  );
  const ledgerEvidenceRefs: string[] = [];
  for (const entry of caseLedgerEntries) {
    ledgerEvidenceRefs.push(`ledger:${caseId}:d${entry.day}`);
  }

  // Enrich with strategy fork data for this case
  const strategyForks = state.strategyForkHistory ?? [];
  const caseForks = strategyForks.filter((f) => f.caseId === caseId);
  const forkEvidenceRefs: string[] = [];
  for (const fork of caseForks) {
    forkEvidenceRefs.push(fork.forkId);
  }

  // Combine all evidence refs
  const allRelatedReceiptIds = [
    ...caseReceipts.map((r) => r.receiptId),
    ...ledgerEvidenceRefs,
    ...forkEvidenceRefs,
  ];

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
    relatedReceiptIds: freezeArray(allRelatedReceiptIds),
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
    asWritableGameState(state).businessOutcomeReviewHistory = [];
  }

  for (const review of reviews) {
    const existingIndex = state.businessOutcomeReviewHistory.findIndex(
      (entry) => entry.reviewId === review.reviewId,
    );
    if (existingIndex >= 0) {
      asWritableGameState(state).businessOutcomeReviewHistory[existingIndex] = review;
    } else {
      asWritableGameState(state).businessOutcomeReviewHistory.push(review);
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
