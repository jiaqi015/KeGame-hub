/**
 * OwnerDecisionMoment Runtime Adapter — identifies owner decision nodes
 * from readiness, trust, pressure, commitment, and price signals.
 *
 * An OwnerDecisionMoment is NOT a UI alert. It's a structural observation:
 * "At this point in the process, the owner's state crossed a threshold where
 * a decision became likely, necessary, or irreversible."
 *
 * Mother model alignment:
 * - Section 5: Human Decision Model (DecisionState, DecisionMoment, DecisionCommitment)
 * - Section 6: Owner Model (owner typology → decision behavior)
 * - Section 12: Consensus Formation (owner acceptance as input)
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
  ActionReceipt,
  CommitmentSettlement,
  GameState,
  OwnerDecisionMoment,
  OwnerDecisionMomentKind,
  OwnerDecisionMomentSignificance,
  OwnerDecisionMomentFactor,
} from '../../domain/models.js';

import type {
  ProcessRun,
} from '../../core/world-state/processes/models.js';

// ---------------------------------------------------------------------------
// Threshold configuration
// ---------------------------------------------------------------------------

interface ThresholdConfig {
  readonly kind: OwnerDecisionMomentKind;
  readonly significance: OwnerDecisionMomentSignificance;
  readonly description: string;
  readonly recommendedResponse: string;
  check(
    caseId: string,
    receipts: readonly ActionReceipt[],
    settlements: readonly CommitmentSettlement[],
    runs: readonly ProcessRun[],
    day: number,
  ): OwnerDecisionMoment | null;
}

const THRESHOLDS: readonly ThresholdConfig[] = Object.freeze([
  // Trust thresholds
  Object.freeze({
    kind: 'trust_threshold',
    significance: 'important',
    description: '信任度降至低水平',
    recommendedResponse: '安排深度沟通或信任修复动作',
    check(caseId, receipts, settlements, runs, day) {
      const trustDeltas = receipts
        .filter((r) => r.caseId === caseId)
        .flatMap((r) => r.fieldDeltas.filter((d) => d.field === 'trust'));
      const cumulativeDelta = trustDeltas.reduce((sum, d) => sum + d.delta, 0);
      if (cumulativeDelta >= -15) return null;
      return buildMoment(caseId, day, 'trust_threshold', 'important',
        `信任度累计下降 ${Math.abs(cumulativeDelta)} 点`,
        [{ factorKind: 'trust_delta', label: '信任度变化', value: cumulativeDelta, threshold: -15, direction: 'below', weight: 0.8 }],
        receipts, settlements, runs);
    },
  }),
  // Patience exhausted
  Object.freeze({
    kind: 'patience_exhausted',
    significance: 'critical',
    description: '业主耐心耗尽',
    recommendedResponse: '立即安排安抚或降价沟通',
    check(caseId, receipts, settlements, runs, day) {
      const patienceDeltas = receipts
        .filter((r) => r.caseId === caseId)
        .flatMap((r) => r.fieldDeltas.filter((d) => d.field === 'patience'));
      const cumulativeDelta = patienceDeltas.reduce((sum, d) => sum + d.delta, 0);
      if (cumulativeDelta >= -20) return null;
      return buildMoment(caseId, day, 'patience_exhausted', 'critical',
        `耐心累计下降 ${Math.abs(cumulativeDelta)} 点，业主可能撤回`,
        [{ factorKind: 'patience_delta', label: '耐心变化', value: cumulativeDelta, threshold: -20, direction: 'below', weight: 0.9 }],
        receipts, settlements, runs);
    },
  }),
  // Urgency spike
  Object.freeze({
    kind: 'urgency_spike',
    significance: 'important',
    description: '紧迫度突然上升',
    recommendedResponse: '加快决策节奏，准备降价或快速出价方案',
    check(caseId, receipts, settlements, runs, day) {
      const urgencyDeltas = receipts
        .filter((r) => r.caseId === caseId)
        .flatMap((r) => r.fieldDeltas.filter((d) => d.field === 'urgency'));
      const cumulativeDelta = urgencyDeltas.reduce((sum, d) => sum + d.delta, 0);
      if (cumulativeDelta <= 15) return null;
      return buildMoment(caseId, day, 'urgency_spike', 'important',
        `紧迫度累计上升 ${cumulativeDelta} 点`,
        [{ factorKind: 'urgency_delta', label: '紧迫度变化', value: cumulativeDelta, threshold: 15, direction: 'above', weight: 0.7 }],
        receipts, settlements, runs);
    },
  }),
  // Price anchor shift (from settlements)
  Object.freeze({
    kind: 'price_anchor_shift',
    significance: 'important',
    description: '价格锚点发生变化',
    recommendedResponse: '根据锚点变化调整谈判策略',
    check(caseId, receipts, settlements, runs, day) {
      const priceSettlements = settlements.filter(
        (s) => s.caseId === caseId && s.commitmentKind === 'price_anchor',
      );
      if (priceSettlements.length === 0) return null;
      const last = priceSettlements[priceSettlements.length - 1];
      return buildMoment(caseId, day, 'price_anchor_shift', 'important',
        `价格锚点变化：${last.reason}`,
        [{ factorKind: 'price_anchor', label: '价格锚点', value: last.strengthAfter, threshold: last.strengthBefore, direction: last.strengthAfter > last.strengthBefore ? 'above' : 'below', weight: 0.75 }],
        receipts, settlements, runs);
    },
  }),
  // Commitment formed
  Object.freeze({
    kind: 'commitment_formed',
    significance: 'important',
    description: '业主形成新承诺',
    recommendedResponse: '跟进承诺细节，推动下一阶段',
    check(caseId, receipts, settlements, runs, day) {
      const createdSettlements = settlements.filter(
        (s) => s.caseId === caseId && s.trigger === 'created',
      );
      if (createdSettlements.length === 0) return null;
      const last = createdSettlements[createdSettlements.length - 1];
      return buildMoment(caseId, day, 'commitment_formed', 'important',
        `新承诺：${last.commitmentKind} — ${last.reason}`,
        [{ factorKind: 'commitment', label: '承诺', value: last.strengthAfter, threshold: 0, direction: 'above', weight: 0.8 }],
        receipts, settlements, runs);
    },
  }),
  // Commitment revoked
  Object.freeze({
    kind: 'commitment_revoked',
    significance: 'critical',
    description: '业主撤销承诺',
    recommendedResponse: '立即评估风险，准备备选方案',
    check(caseId, receipts, settlements, runs, day) {
      const revokedSettlements = settlements.filter(
        (s) => s.caseId === caseId && s.trigger === 'revoked',
      );
      if (revokedSettlements.length === 0) return null;
      const last = revokedSettlements[revokedSettlements.length - 1];
      return buildMoment(caseId, day, 'commitment_revoked', 'critical',
        `承诺撤销：${last.commitmentKind} — ${last.reason}`,
        [{ factorKind: 'commitment', label: '承诺', value: last.strengthAfter, threshold: last.strengthBefore, direction: 'below', weight: 0.9 }],
        receipts, settlements, runs);
    },
  }),
  // Consensus advance
  Object.freeze({
    kind: 'consensus_advance',
    significance: 'informational',
    description: '共识向前推进',
    recommendedResponse: '保持跟进节奏',
    check(caseId, receipts, settlements, runs, day) {
      const advancedSettlements = settlements.filter(
        (s) => s.caseId === caseId && s.trigger === 'advanced',
      );
      if (advancedSettlements.length === 0) return null;
      const last = advancedSettlements[advancedSettlements.length - 1];
      return buildMoment(caseId, day, 'consensus_advance', 'informational',
        `共识推进：${last.commitmentKind} — ${last.reason}`,
        [{ factorKind: 'consensus', label: '共识', value: last.strengthAfter, threshold: last.strengthBefore, direction: 'above', weight: 0.6 }],
        receipts, settlements, runs);
    },
  }),
  // Consensus collapse
  Object.freeze({
    kind: 'consensus_collapse',
    significance: 'critical',
    description: '共识破裂',
    recommendedResponse: '评估重新谈判可能性或关闭案例',
    check(caseId, receipts, settlements, runs, day) {
      const collapsedSettlements = settlements.filter(
        (s) => s.caseId === caseId && s.trigger === 'collapsed',
      );
      if (collapsedSettlements.length === 0) return null;
      const last = collapsedSettlements[collapsedSettlements.length - 1];
      return buildMoment(caseId, day, 'consensus_collapse', 'critical',
        `共识破裂：${last.reason}`,
        [{ factorKind: 'consensus', label: '共识', value: 0, threshold: last.strengthBefore, direction: 'below', weight: 0.95 }],
        receipts, settlements, runs);
    },
  }),
  // Window closing
  Object.freeze({
    kind: 'window_closing',
    significance: 'critical',
    description: '案例可推进天数即将归零',
    recommendedResponse: '优先推进高价值动作或准备撤盘',
    check(caseId, receipts, settlements, runs, day) {
      const windowDeltas = receipts
        .filter((r) => r.caseId === caseId)
        .flatMap((r) => r.fieldDeltas.filter((d) => d.field === 'windowDays'));
      const cumulativeDelta = windowDeltas.reduce((sum, d) => sum + d.delta, 0);
      // If windowDays decreased significantly (approaching zero)
      if (cumulativeDelta >= -3) return null;
      return buildMoment(caseId, day, 'window_closing', 'critical',
        `可推进天数减少 ${Math.abs(cumulativeDelta)} 天`,
        [{ factorKind: 'window', label: '可推进天数', value: cumulativeDelta, threshold: -3, direction: 'below', weight: 0.85 }],
        receipts, settlements, runs);
    },
  }),
  // Pressure response (blocked receipts indicate owner resistance)
  Object.freeze({
    kind: 'pressure_response',
    significance: 'informational',
    description: '业主对压力产生反应',
    recommendedResponse: '观察反应模式，调整沟通策略',
    check(caseId, receipts, settlements, runs, day) {
      const blockedReceipts = receipts.filter(
        (r) => r.caseId === caseId && r.outcome === 'blocked',
      );
      if (blockedReceipts.length < 2) return null;
      return buildMoment(caseId, day, 'pressure_response', 'informational',
        `连续 ${blockedReceipts.length} 次动作被阻断`,
        [{ factorKind: 'resistance', label: '阻断次数', value: blockedReceipts.length, threshold: 2, direction: 'above', weight: 0.5 }],
        receipts, settlements, runs);
    },
  }),
]);

// ---------------------------------------------------------------------------
// Helper to build a moment
// ---------------------------------------------------------------------------

function buildMoment(
  caseId: string,
  day: number,
  kind: OwnerDecisionMomentKind,
  significance: OwnerDecisionMomentSignificance,
  description: string,
  factors: readonly OwnerDecisionMomentFactor[],
  receipts: readonly ActionReceipt[],
  settlements: readonly CommitmentSettlement[],
  runs: readonly ProcessRun[],
): OwnerDecisionMoment {
  const caseReceipts = receipts.filter((r) => r.caseId === caseId);
  const caseSettlements = settlements.filter((s) => s.caseId === caseId);
  const caseRuns = runs.filter((r) => r.caseId === caseId);

  return Object.freeze({
    momentId: `moment:${caseId}:${kind}:${day}`,
    day,
    caseId,
    kind,
    significance,
    description,
    factors: freezeArray(factors),
    relatedReceiptIds: freezeArray(caseReceipts.map((r) => r.receiptId)),
    relatedSettlementIds: freezeArray(caseSettlements.map((s) => s.settlementId)),
    relatedRunIds: freezeArray(caseRuns.map((r) => r.runId)),
    ownerEntity: 'owner',
    recommendedResponse: THRESHOLDS.find((t) => t.kind === kind)?.recommendedResponse ?? '观察',
  });
}

function freezeArray<T>(items: readonly T[]): readonly T[] {
  return Object.freeze([...items]) as readonly T[];
}

// ---------------------------------------------------------------------------
// buildOwnerDecisionMomentsFromState — main entry point
// ---------------------------------------------------------------------------

/**
 * Identifies OwnerDecisionMoment instances from GameState.
 * Reads from already-computed action receipt, settlement, and process run history.
 * Does NOT mutate GameState.
 * Pure function. Deterministic. Frozen output.
 */
export function buildOwnerDecisionMomentsFromState(
  state: GameState,
): readonly OwnerDecisionMoment[] {
  const receipts = state.actionReceiptHistory ?? [];
  const settlements = state.commitmentSettlementHistory ?? [];
  const runs = state.processRunHistory ?? [];

  if (receipts.length === 0) return Object.freeze([]);

  // Get unique case IDs from receipts
  const caseIds = new Set(receipts.map((r) => r.caseId));
  const moments: OwnerDecisionMoment[] = [];

  for (const caseId of caseIds) {
    const caseReceipts = receipts.filter((r) => r.caseId === caseId);
    const caseSettlements = settlements.filter((s) => s.caseId === caseId);
    const caseRuns = runs.filter((r) => r.caseId === caseId);

    // Use the latest day from this case's receipts
    const latestDay = Math.max(...caseReceipts.map((r) => r.day));

    for (const threshold of THRESHOLDS) {
      const moment = threshold.check(caseId, caseReceipts, caseSettlements, caseRuns, latestDay);
      if (moment) {
        moments.push(moment);
      }
    }
  }

  // Sort by day ascending, then by significance (critical first), then by caseId
  moments.sort((a, b) => {
    if (a.day !== b.day) return a.day - b.day;
    const sigOrder = { critical: 0, important: 1, informational: 2 };
    const sigDiff = sigOrder[a.significance] - sigOrder[b.significance];
    if (sigDiff !== 0) return sigDiff;
    return a.caseId.localeCompare(b.caseId);
  });

  return freezeArray(moments);
}

// ---------------------------------------------------------------------------
// enrichStateWithOwnerDecisionMoments — upsert-safe state enrichment
// ---------------------------------------------------------------------------

export function enrichStateWithOwnerDecisionMoments(
  state: GameState,
  moments: readonly OwnerDecisionMoment[],
): void {
  if (!state.ownerDecisionMomentHistory) {
    state.ownerDecisionMomentHistory = [];
  }

  for (const moment of moments) {
    const existingIndex = state.ownerDecisionMomentHistory.findIndex(
      (entry) => entry.momentId === moment.momentId,
    );
    if (existingIndex >= 0) {
      state.ownerDecisionMomentHistory[existingIndex] = moment;
    } else {
      state.ownerDecisionMomentHistory.push(moment);
    }
  }
}

// ---------------------------------------------------------------------------
// normalizeOwnerDecisionMomentHistory — for save/load compatibility
// ---------------------------------------------------------------------------

export function normalizeOwnerDecisionMomentHistory(input: unknown): OwnerDecisionMoment[] {
  if (!Array.isArray(input)) return [];
  return input.filter(
    (entry): entry is OwnerDecisionMoment =>
      entry != null
      && typeof entry === 'object'
      && typeof (entry as any).momentId === 'string'
      && typeof (entry as any).caseId === 'string'
      && typeof (entry as any).day === 'number'
      && (entry as any).day > 0,
  );
}

// ---------------------------------------------------------------------------
// buildOwnerDecisionMomentSummary — compressed summary for projections
// ---------------------------------------------------------------------------

export interface OwnerDecisionMomentDaySummary {
  readonly day: number;
  readonly totalMoments: number;
  readonly criticalCount: number;
  readonly importantCount: number;
  readonly informationalCount: number;
  readonly kindBreakdown: Readonly<Record<string, number>>;
  readonly affectedCaseIds: readonly string[];
}

export function buildOwnerDecisionMomentSummary(
  state: GameState,
  day: number,
): OwnerDecisionMomentDaySummary {
  const moments = (state.ownerDecisionMomentHistory ?? []).filter((m) => m.day === day);

  let criticalCount = 0;
  let importantCount = 0;
  let informationalCount = 0;
  const kindBreakdown: Record<string, number> = {};
  const affectedCaseIds = new Set<string>();

  for (const m of moments) {
    switch (m.significance) {
      case 'critical': criticalCount++; break;
      case 'important': importantCount++; break;
      case 'informational': informationalCount++; break;
    }
    kindBreakdown[m.kind] = (kindBreakdown[m.kind] ?? 0) + 1;
    affectedCaseIds.add(m.caseId);
  }

  return Object.freeze({
    day,
    totalMoments: moments.length,
    criticalCount,
    importantCount,
    informationalCount,
    kindBreakdown: Object.freeze({ ...kindBreakdown }),
    affectedCaseIds: freezeArray([...affectedCaseIds]),
  });
}
