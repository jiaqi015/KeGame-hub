/**
 * StrategyFork Runtime Adapter — generates read-only fork branch summaries.
 *
 * Answers: "If we apply a different strategy to this case, what might happen?"
 *
 * Mother model alignment:
 * - Section 1.1: Global Core vs POV (fork reads, does NOT mutate main world)
 * - Section 9: POV shape (visibleFacts, inferredSignals)
 * - Section 18.10: replayable, deterministic
 *
 * Hard constraints:
 * 1. Fork does NOT pollute main world.
 * 2. Pure functions for building — no side effects on main GameState.
 * 3. No Date.now, no Math.random, no fetch, no LLM.
 * 4. Deterministic: same input → same output.
 * 5. Frozen output.
 * 6. No raw GameState/Case/Opportunity in fork summary.
 * 7. Fork is read-only projection — never executed.
 */

import type {
  GameState,
  StrategyForkSummary,
  StrategyForkBranch,
} from '../../domain/models.js';

import type {
  ProcessRun,
} from '../../core/world-state/processes/models.js';

// ---------------------------------------------------------------------------
// Strategy templates
// ---------------------------------------------------------------------------

interface StrategyTemplate {
  readonly strategyId: string;
  readonly label: string;
  readonly policySummary: string;
  readonly actionSequence: readonly string[];
  readonly outcomeForecast: string;
  readonly confidence: number;
}

const STRATEGY_TEMPLATES: readonly StrategyTemplate[] = Object.freeze([
  Object.freeze({
    strategyId: 'aggressive-price-cut',
    label: '激进降价',
    policySummary: '快速降价以吸引更多买家关注，缩短成交周期',
    actionSequence: ['adjust-listing-price', 'xiaohongshu-boost', 'broker-broadcast'],
    outcomeForecast: '可能加速成交但降低利润率',
    confidence: 0.6,
  }),
  Object.freeze({
    strategyId: 'hold-and-negotiate',
    label: '坚守谈判',
    policySummary: '维持报价，通过深度沟通和信任建设推动成交',
    actionSequence: ['deep-diagnosis', 'weekly-feedback', 'invite-customer-negotiation'],
    outcomeForecast: '可能维持利润率但延长成交周期',
    confidence: 0.5,
  }),
  Object.freeze({
    strategyId: 'open-day-push',
    label: '开放日推广',
    policySummary: '通过集中式开放日活动批量激活客户',
    actionSequence: ['open-day', 'showing', 'invite-customer-negotiation'],
    outcomeForecast: '可能快速聚集意向客户但需要前期投入',
    confidence: 0.55,
  }),
  Object.freeze({
    strategyId: 'sincerity-sale',
    label: '诚意售',
    policySummary: '通过诚意售活动快速匹配买家',
    actionSequence: ['sincerity-sale', 'invite-customer-negotiation'],
    outcomeForecast: '快速匹配但价格可能偏低',
    confidence: 0.65,
  }),
  Object.freeze({
    strategyId: 'manager-escalation',
    label: '升级管理层',
    policySummary: '将案例升级到管理层进行资源重新分配',
    actionSequence: ['focus-meeting-submit', 'deep-diagnosis', 'invite-customer-negotiation'],
    outcomeForecast: '可能获得额外资源但暴露管理问题',
    confidence: 0.45,
  }),
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function freezeArray<T>(items: readonly T[]): readonly T[] {
  return Object.freeze([...items]) as readonly T[];
}

// ---------------------------------------------------------------------------
// buildStrategyForkSummary — main entry point
// ---------------------------------------------------------------------------

/**
 * Builds a StrategyForkSummary for a given case from the current GameState.
 *
 * Reads from already-computed action receipt and process run history.
 * Does NOT mutate GameState. Does NOT re-roll dice.
 * Pure function. Deterministic. Frozen output.
 *
 * @param state - GameState (read-only access)
 * @param caseId - case to fork strategies for
 * @returns Frozen StrategyForkSummary
 */
export function buildStrategyForkSummary(
  state: GameState,
  caseId: string,
): StrategyForkSummary {
  const receipts = state.actionReceiptHistory ?? [];
  const caseReceipts = receipts.filter((r) => r.caseId === caseId);
  const caseRuns = (state.processRunHistory ?? []).filter((r) => r.caseId === caseId);

  const currentDay = state.day;
  const baseSeed = state.runContext?.runSeed ?? 0;

  // Determine which strategies are applicable based on case state
  const caseObj = state.cases.find((c) => c.id === caseId);
  const activeOppCount = state.opportunities.filter(
    (o) => o.caseId === caseId && o.status === 'active',
  ).length;

  const branches: StrategyForkBranch[] = [];

  for (const template of STRATEGY_TEMPLATES) {
    // Filter strategies based on case context
    if (template.strategyId === 'aggressive-price-cut' && caseObj && caseObj.askPrice <= caseObj.marketPrice) {
      continue; // No need for price cut if already below market
    }
    if (template.strategyId === 'open-day-push' && activeOppCount >= 3) {
      continue; // Already have enough opportunities
    }

    // Determine evidence refs from case receipts
    const evidenceRefs: string[] = [];
    for (const r of caseReceipts) {
      evidenceRefs.push(r.receiptId);
    }
    for (const run of caseRuns) {
      evidenceRefs.push(run.runId);
    }

    branches.push(Object.freeze({
      branchId: `fork:${caseId}:${template.strategyId}:${currentDay}`,
      strategyLabel: template.label,
      caseId,
      policySummary: template.policySummary,
      snapshotDay: currentDay,
      actionsProposed: freezeArray(template.actionSequence),
      outcomeForecast: template.outcomeForecast,
      confidence: template.confidence,
      evidenceRefs: freezeArray(evidenceRefs),
    }));
  }

  // Sort branches by confidence descending for deterministic ordering
  branches.sort((a, b) => b.confidence - a.confidence);

  // Recommended branch is the highest confidence one
  const recommendedBranchId = branches.length > 0 ? branches[0].branchId : null;
  const recommendationRationale = branches.length > 0
    ? `${branches[0].strategyLabel}：${branches[0].policySummary}`
    : '无可用策略';

  return Object.freeze({
    forkId: `strategy-fork:${caseId}:${currentDay}`,
    day: currentDay,
    baseSeed,
    caseId,
    branches: freezeArray(branches),
    recommendedBranchId,
    recommendationRationale,
  });
}

// ---------------------------------------------------------------------------
// buildStrategyForksFromState — batch builder for all active cases
// ---------------------------------------------------------------------------

/**
 * Builds StrategyForkSummary for all active cases.
 * Does NOT mutate GameState. Pure function. Deterministic. Frozen output.
 */
export function buildStrategyForksFromState(
  state: GameState,
): readonly StrategyForkSummary[] {
  const activeCases = state.cases.filter((c) => c.status === 'active');
  const forks: StrategyForkSummary[] = [];

  for (const caseItem of activeCases) {
    const fork = buildStrategyForkSummary(state, caseItem.id);
    if (fork.branches.length > 0) {
      forks.push(fork);
    }
  }

  // Sort by caseId for deterministic ordering
  forks.sort((a, b) => a.caseId.localeCompare(b.caseId));

  return freezeArray(forks);
}

// ---------------------------------------------------------------------------
// enrichStateWithStrategyForks — upsert-safe state enrichment
// ---------------------------------------------------------------------------

export function enrichStateWithStrategyForks(
  state: GameState,
  forks: readonly StrategyForkSummary[],
): void {
  if (!state.strategyForkHistory) {
    state.strategyForkHistory = [];
  }

  for (const fork of forks) {
    const existingIndex = state.strategyForkHistory.findIndex(
      (entry) => entry.forkId === fork.forkId,
    );
    if (existingIndex >= 0) {
      state.strategyForkHistory[existingIndex] = fork;
    } else {
      state.strategyForkHistory.push(fork);
    }
  }
}

// ---------------------------------------------------------------------------
// normalizeStrategyForkHistory — for save/load compatibility
// ---------------------------------------------------------------------------

export function normalizeStrategyForkHistory(input: unknown): StrategyForkSummary[] {
  if (!Array.isArray(input)) return [];
  return input.filter(
    (entry): entry is StrategyForkSummary =>
      entry != null
      && typeof entry === 'object'
      && typeof (entry as any).forkId === 'string'
      && typeof (entry as any).caseId === 'string'
      && typeof (entry as any).day === 'number'
      && (entry as any).day > 0,
  );
}
