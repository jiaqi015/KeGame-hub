import type {
  CaseFinalResult,
  FinalCustomerReview,
  GameState,
  GoalTier,
  ScoreBreakdownEntry,
} from '../../domain/models.js';
import { resolveFormalSoldCount } from '../../domain/runtimeStats.js';
import type { ProjectionTone } from './operatingProjection.js';

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
  const activeCount = state.cases.filter((entry) => entry.status === 'active').length;
  const endingStats = finalResult?.endingStats;

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
