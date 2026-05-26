import type {
  CaseFinalResult,
  FinalCustomerReview,
  GameState,
  GoalTier,
  ScoreBreakdownEntry,
} from '../../domain/models.js';
import { isCaseActiveByCanonicalStatus } from '../../domain/caseLifecycleStatusRead.js';
import { resolveFormalSoldCount } from '../../domain/runtimeStats.js';
import type { ProjectionTone } from './operatingProjection.js';
import type { WorldCausalEvent } from '../../domain/world-model/causalEvents.js';

/** Structured causal ref for result explanation — mirrors POVCausalRef shape. */
export interface ResultCausalRef {
  readonly refType: string;
  readonly refId: string;
  readonly refLabel: string;
}

export interface ResultCausalTrace {
  readonly caseId: string;
  readonly caseTitle: string;
  readonly endingBucket: string;
  readonly defenseOutcome: string;
  readonly causalEventCount: number;
  readonly topCausalKinds: readonly string[];
  readonly lastCausalDay: number;
  /** Structured causal refs for explanation envelope — links outcome to specific events. */
  readonly causalRefs: readonly ResultCausalRef[];
  /** Explanation summary: why this case ended this way, backed by causal refs. */
  readonly explanationSummary: string;
  /** Replay key for deterministic replay of this outcome explanation. */
  readonly replayKey: string;
}

/**
 * ResultExplanationEnvelope — structured explanation of game outcomes.
 *
 * This is the result surface's equivalent of DecisionEvidenceEnvelope.
 * It explains WHY each case ended up good/bad/lost by tracing back
 * through the causal event chain.
 *
 * Not actor-knowledge-based (post-game evaluation), but fully causal-ref-backed.
 */
export interface ResultExplanationEnvelope {
  /** Total cases evaluated. */
  readonly totalCases: number;
  /** Cases with causal-backed explanations. */
  readonly explainedCases: number;
  /** Aggregate explanation: overall narrative of why the game ended this way. */
  readonly aggregateExplanation: string;
  /** Per-case causal traces with structured refs. */
  readonly caseTraces: readonly ResultCausalTrace[];
  /** Replay key for deterministic replay. */
  readonly replayKey: string;
}

export interface ResultHeroProjection {
  eyebrow: string;
  title: string;
  summary: string;
  score: string;
  grade: string;
  scenarioName: string;
  difficultyId: string;
}

export interface ResultMetricProjection {
  label: string;
  value: string;
  note: string;
  tone: ProjectionTone;
}


export interface ResultTierGroupProjection {
  goalTier: GoalTier;
  label: string;
  total: number;
  good: number;
  neutral: number;
  bad: number;
  lost: number;
  preview: string;
  items: CaseFinalResult[];
}

export interface ResultMarketOutcomeProjection {
  title: string;
  summary: string;
  metrics: ResultMetricProjection[];
}

export interface ResultProjection {
  hero: ResultHeroProjection;
  summaryCards: ResultMetricProjection[];
  marketOutcome: ResultMarketOutcomeProjection | null;
  scoreBreakdown: ScoreBreakdownEntry[];
  tierGroups: ResultTierGroupProjection[];
  highlights: string[];
  improvements: string[];
  promotionNotes: string[];
  coachNotes: string[];
  nextRunAdvice: string[];
  customerReview: FinalCustomerReview | null;
  /** Causal trace: links each case outcome back to its causal event history. */
  readonly causalTrace: readonly ResultCausalTrace[];
  /** Explanation envelope: structured explanation of game outcomes. */
  readonly explanationEnvelope: ResultExplanationEnvelope;
}

function getClosedDealCount(state: GameState) {
  return resolveFormalSoldCount(state);
}

function buildMarketOutcomeProjection(state: GameState): ResultMarketOutcomeProjection | null {
  const marketOutcome = state.marketOutcome;
  if (!marketOutcome) {
    return null;
  }

  const total = marketOutcome.totalCapacity21d;
  const released = marketOutcome.releasedSlots;
  const player = marketOutcome.playerClaimedDeals;
  const rival = marketOutcome.rivalClaimedDeals;
  const delayed = marketOutcome.delayedDeals;
  const available = Math.max(0, released - player - rival - delayed);

  return {
    title: '市场结算',
    summary: buildMarketOutcomeSummary(total, released, player, rival, delayed, available),
    metrics: [
      { label: '市场容量', value: `${total} 套`, note: `${state.rules.outcomeControl.simulationDays} 天共享成交池`, tone: 'neutral' },
      { label: '已释放', value: `${released} 套`, note: available > 0 ? `剩余 ${available} 套未被消耗` : '本局释放窗口已结算', tone: 'neutral' },
      { label: '我方成交', value: `${player} 套`, note: player > 0 ? '你拿到的成交窗口' : '本局未拿到成交窗口', tone: player > 0 ? 'chance' : 'neutral' },
      { label: '对手成交', value: `${rival} 套`, note: rival > 0 ? '对手拿到的成交窗口' : '对手未拿到成交窗口', tone: rival > player ? 'risk' : 'neutral' },
      { label: '延后窗口', value: `${delayed} 套`, note: delayed > 0 ? '释放后未形成成交' : '没有延后窗口', tone: delayed > 0 ? 'risk' : 'neutral' },
    ],
  };
}

function buildMarketOutcomeSummary(
  total: number,
  released: number,
  player: number,
  rival: number,
  delayed: number,
  available: number,
) {
  if (player > rival) {
    return `本局市场容量 ${total} 套，已释放 ${released} 套；你拿到 ${player} 套，对手拿到 ${rival} 套。`;
  }
  if (rival > player) {
    return `本局市场容量 ${total} 套，已释放 ${released} 套；对手拿到 ${rival} 套，你拿到 ${player} 套。`;
  }
  if (delayed > 0) {
    return `本局市场容量 ${total} 套，已释放 ${released} 套；延后 ${delayed} 套，剩余 ${available} 套。`;
  }
  return `本局市场容量 ${total} 套，已释放 ${released} 套；成交窗口分配接近。`;
}

export function buildResultProjection(state: GameState): ResultProjection {
  const finalResult = state.finalResult;
  const caseResults = Array.isArray(finalResult?.caseResults) ? finalResult.caseResults : [];
  const scoreBreakdown = Array.isArray(finalResult?.scoreBreakdown) ? finalResult.scoreBreakdown : [];
  const soldCount = getClosedDealCount(state);
  const withdrawnCount = state.auxiliaryStats.withdrawnCount;
  const lostCount = caseResults.filter((entry) => entry.defenseOutcome === 'lost_to_rival').length;
  const activeCount = state.cases.filter((entry) => isCaseActiveByCanonicalStatus(state, entry)).length;
  const endingStats = finalResult?.endingStats;

  const causalTrace = buildCausalTrace(state, caseResults);
  const explanationEnvelope = buildResultExplanationEnvelope(state, caseResults, causalTrace);

  return {
    hero: {
      eyebrow: finalResult ? '本局正式结算' : '结果台账',
      title: finalResult?.title || '当前结果台账',
      summary: finalResult?.summary || '本局当前收成。',
      score: typeof finalResult?.score === 'number' ? `${finalResult.score}` : '--',
      grade: finalResult?.grade || '待结算',
      scenarioName: state.runContext.scenarioName,
      difficultyId: state.runContext.difficultyId,
    },
    summaryCards: [
      {
        label: '正式总分',
        value: typeof finalResult?.score === 'number' ? `${finalResult.score}` : '--',
        note: finalResult?.grade || '还没生成正式成绩',
        tone: finalResult?.score && finalResult.score >= 80 ? 'chance' : 'neutral',
      },
      {
        label: '本局成交',
        value: `${soldCount} 套`,
        note: soldCount > 0 ? '已经形成正式成交事实' : '这局还没打出成交',
        tone: soldCount > 0 ? 'chance' : 'neutral',
      },
      {
        label: '他处成交 / 核销',
        value: `${lostCount + withdrawnCount} 套`,
        note: lostCount > 0 ? `${lostCount} 套在别处成交` : withdrawnCount > 0 ? `${withdrawnCount} 套已核销` : '没有明显失手',
        tone: lostCount + withdrawnCount > 0 ? 'risk' : 'neutral',
      },
      {
        label: '仍在场上',
        value: `${activeCount} 套`,
        note: activeCount > 0 ? '这部分还没结算' : '本局房源已经结算',
        tone: activeCount > 0 ? 'neutral' : 'chance',
      },
      {
        label: '结果不错',
        value: endingStats ? `${endingStats.good} 套` : '--',
        note: endingStats ? `结果一般 ${endingStats.neutral} 套，结果较差 ${endingStats.bad} 套` : '还没有房源结果结构',
        tone: endingStats && endingStats.bad > 0 ? 'risk' : 'chance',
      },
      {
        label: '核心盘风险',
        value: endingStats ? `${endingStats.coreBadCount} 套` : '--',
        note: endingStats && endingStats.coreBadCount > 0 ? '核心盘有结果较差的情况' : '核心盘整体可控',
        tone: endingStats && endingStats.coreBadCount > 0 ? 'risk' : 'chance',
      },
    ],
    marketOutcome: buildMarketOutcomeProjection(state),
    scoreBreakdown,
    tierGroups: buildTierGroups(caseResults),
    highlights: Array.isArray(finalResult?.highlights) ? finalResult.highlights : [],
    improvements: Array.isArray(finalResult?.improvements) ? finalResult.improvements : [],
    promotionNotes: Array.isArray(finalResult?.promotionNotes) ? finalResult.promotionNotes : [],
    coachNotes: Array.isArray(finalResult?.coachNotes) ? finalResult.coachNotes : [],
    nextRunAdvice: Array.isArray(finalResult?.nextRunAdvice) ? finalResult.nextRunAdvice : [],
    customerReview: finalResult?.customerReview || null,
    causalTrace,
    explanationEnvelope,
  };
}

function buildTierGroups(caseResults: CaseFinalResult[]): ResultTierGroupProjection[] {
  return (['core', 'important', 'normal'] as const).map((goalTier) => {
    const items = caseResults.filter((entry) => entry.goalTier === goalTier);
    const good = items.filter((entry) => entry.endingBucket === 'good').length;
    const neutral = items.filter((entry) => entry.endingBucket === 'neutral').length;
    const bad = items.filter((entry) => entry.endingBucket === 'bad').length;
    const lost = items.filter((entry) => entry.defenseOutcome === 'lost_to_rival').length;

    return {
      goalTier,
      label: goalTierLabel(goalTier),
      total: items.length,
      good,
      neutral,
      bad,
      lost,
      preview: buildTierPreview(goalTier, items.length, good, neutral, bad, lost),
      items,
    };
  });
}

function buildTierPreview(
  goalTier: GoalTier,
  total: number,
  good: number,
  neutral: number,
  bad: number,
  lost: number,
) {
  if (total === 0) {
    return `${goalTierLabel(goalTier)}这组本局没有分到房源。`;
  }
  if (bad > 0) {
    return `${goalTierLabel(goalTier)}里有 ${bad} 套结果较差${lost > 0 ? `，其中 ${lost} 套直接被别人做掉` : ''}。`;
  }
  if (good === total) {
    return `${goalTierLabel(goalTier)}这组全部收得住，是这局最稳的一段。`;
  }
  return `${goalTierLabel(goalTier)}这组有 ${good} 套结果不错、${neutral} 套一般，整体仍在可控区间。`;
}

function goalTierLabel(goalTier: GoalTier) {
  if (goalTier === 'core') return '核心盘';
  if (goalTier === 'important') return '重要盘';
  return '普通盘';
}

function buildCausalTrace(
  state: GameState,
  caseResults: CaseFinalResult[],
): ResultCausalTrace[] {
  const causalEvents = Array.isArray(state.worldCausalEvents) ? state.worldCausalEvents : [];

  return caseResults.map((result) => {
    const caseEvents = causalEvents.filter(
      (e) => (e.entityIds ?? []).includes(result.caseId)
        || (e.affectedIds ?? []).includes(result.caseId)
        || (e.payload as Record<string, unknown>)?.['caseId'] === result.caseId
        || (e.payload as Record<string, unknown>)?.['targetCaseId'] === result.caseId,
    );

    const kindCounts = new Map<string, number>();
    for (const e of caseEvents) {
      kindCounts.set(e.kind, (kindCounts.get(e.kind) ?? 0) + 1);
    }
    const topKinds = [...kindCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([kind]) => kind);

    const lastCausalDay = caseEvents.length > 0
      ? Math.max(...caseEvents.map((e) => e.day))
      : 0;

    // Build structured causal refs from the most significant events
    const causalRefs: ResultCausalRef[] = caseEvents
      .sort((a, b) => b.day - a.day)
      .slice(0, 5)
      .map((e) => ({
        refType: mapEventKindToRefType(e.kind),
        refId: e.id,
        refLabel: buildEventLabel(e),
      }));

    // Build explanation summary based on outcome and causal chain
    const explanationSummary = buildCaseExplanationSummary(result, caseEvents, topKinds);

    // Deterministic replay key
    const replayKey = `result-${result.caseId}-${result.endingBucket}-${caseEvents.length}-${topKinds.join(',')}`;

    return {
      caseId: result.caseId,
      caseTitle: result.title,
      endingBucket: result.endingBucket,
      defenseOutcome: result.defenseOutcome ?? 'none',
      causalEventCount: caseEvents.length,
      topCausalKinds: topKinds,
      lastCausalDay,
      causalRefs,
      explanationSummary,
      replayKey,
    };
  });
}

function mapEventKindToRefType(kind: string): string {
  if (kind.includes('Owner')) return 'owner-signal';
  if (kind.includes('Customer') || kind.includes('Demand')) return 'customer-signal';
  if (kind.includes('Rival') || kind.includes('Competition')) return 'competition-signal';
  if (kind.includes('Market') || kind.includes('Price')) return 'market-signal';
  if (kind.includes('Broker') || kind.includes('Recommendation')) return 'broker-action';
  if (kind.includes('Deal') || kind.includes('Negotiation')) return 'deal-event';
  return 'world-event';
}

function buildEventLabel(e: WorldCausalEvent): string {
  const payload = e.payload as unknown as Record<string, unknown> | undefined;
  const kind = e.kind;
  const day = e.day;
  if (payload?.['summary'] && typeof payload['summary'] === 'string') {
    return payload['summary'].slice(0, 80);
  }
  return `${kind} (day ${day})`;
}

function buildCaseExplanationSummary(
  result: CaseFinalResult,
  events: WorldCausalEvent[],
  topKinds: readonly string[],
): string {
  const bucket = result.endingBucket;
  const defense = result.defenseOutcome;
  const eventCount = events.length;

  if (defense === 'lost_to_rival') {
    const rivalEvents = events.filter((e) => e.kind.includes('Rival') || e.kind.includes('Competition'));
    return rivalEvents.length > 0
      ? `被对手做掉：${rivalEvents.length} 条竞争事件 (${rivalEvents[0].kind}) 最终导致流失。`
      : `被对手做掉：因果链中有 ${eventCount} 条事件，竞争压力是核心原因。`;
  }

  if (bucket === 'good') {
    const positiveKinds = topKinds.filter((k) =>
      k.includes('Deal') || k.includes('Negotiation') || k.includes('Customer') || k.includes('Recommendation'),
    );
    return positiveKinds.length > 0
      ? `结果不错：${positiveKinds.join('、')} 等 ${eventCount} 条因果事件推动成交。`
      : `结果不错：${eventCount} 条因果事件形成正向积累。`;
  }

  if (bucket === 'bad') {
    const negativeKinds = topKinds.filter((k) =>
      k.includes('Rival') || k.includes('Owner') || k.includes('Pressure'),
    );
    return negativeKinds.length > 0
      ? `结果较差：${negativeKinds.join('、')} 等 ${eventCount} 条因果事件未能转化为成交。`
      : `结果较差：${eventCount} 条因果事件，但未能形成成交共识。`;
  }

  return `${eventCount} 条因果事件，结果处于中间状态。`;
}

function buildResultExplanationEnvelope(
  state: GameState,
  caseResults: CaseFinalResult[],
  causalTrace: readonly ResultCausalTrace[],
): ResultExplanationEnvelope {
  const explainedCases = causalTrace.filter((t) => t.causalRefs.length > 0).length;
  const goodCount = caseResults.filter((r) => r.endingBucket === 'good').length;
  const badCount = caseResults.filter((r) => r.endingBucket === 'bad').length;
  const lostCount = caseResults.filter((r) => r.defenseOutcome === 'lost_to_rival').length;

  const aggregateExplanation = buildAggregateExplanation(caseResults, causalTrace, goodCount, badCount, lostCount);
  const replayKey = `result-envelope-${state.runContext.runSeed}-${caseResults.length}-${goodCount}-${badCount}-${lostCount}`;

  return {
    totalCases: caseResults.length,
    explainedCases,
    aggregateExplanation,
    caseTraces: causalTrace,
    replayKey,
  };
}

function buildAggregateExplanation(
  caseResults: CaseFinalResult[],
  causalTrace: readonly ResultCausalTrace[],
  goodCount: number,
  badCount: number,
  lostCount: number,
): string {
  const total = caseResults.length;
  if (total === 0) return '本局没有房源结果。';

  const totalEvents = causalTrace.reduce((s, t) => s + t.causalEventCount, 0);
  const parts: string[] = [];

  if (goodCount > 0) parts.push(`${goodCount} 套结果不错`);
  if (badCount > 0) parts.push(`${badCount} 套结果较差`);
  if (lostCount > 0) parts.push(`${lostCount} 套被对手做掉`);

  const neutralCount = total - goodCount - badCount - lostCount;
  if (neutralCount > 0) parts.push(`${neutralCount} 套一般`);

  return `本局 ${total} 套房源，${parts.join('、')}。因果链共 ${totalEvents} 条事件。`;
}
