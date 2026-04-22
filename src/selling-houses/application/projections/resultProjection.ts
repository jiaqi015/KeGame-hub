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
  settlementLabel: string;
}

export interface ResultMetricProjection {
  label: string;
  value: string;
  note: string;
  tone: ProjectionTone;
}

export interface ResultNoteProjection {
  title: string;
  detail: string;
  tone: ProjectionTone;
}

export interface ResultCareerNoteProjection {
  title: string;
  detail: string;
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

export interface ResultProjection {
  hero: ResultHeroProjection;
  summaryCards: ResultMetricProjection[];
  settlementNotes: ResultNoteProjection[];
  careerNotes: ResultCareerNoteProjection[];
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
      settlementLabel: finalResult ? '会写入生涯与排行榜' : '尚未生成正式成绩',
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
        label: '丢盘 / 撤回',
        value: `${lostCount + withdrawnCount} 套`,
        note: lostCount > 0 ? `${lostCount} 套被别人做掉` : withdrawnCount > 0 ? `${withdrawnCount} 套业主撤回` : '没有明显丢盘',
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
    settlementNotes: buildSettlementNotes(Boolean(finalResult), caseResults.length),
    careerNotes: buildCareerNotes(state, soldCount, lostCount, activeCount),
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

function buildSettlementNotes(hasFinalResult: boolean, caseResultCount: number): ResultNoteProjection[] {
  if (!hasFinalResult) {
    return [
      {
        title: '还没生成正式结算',
        detail: '现在看到的只是当前局面，还不会写入生涯和排行榜。',
        tone: 'risk',
      },
      {
        title: '每日预估分不入榜',
        detail: '局内每天看到的预估分不算正式成绩。',
        tone: 'neutral',
      },
    ];
  }

  return [
      {
        title: '已经结算',
        detail: `当前已经生成 ${caseResultCount} 条单房结果。`,
        tone: 'chance',
      },
    {
      title: '每日预估分不会入榜',
      detail: '局内每天看到的预估分不会写进排行榜。',
      tone: 'neutral',
    },
    {
      title: '排行榜只看正式结果',
      detail: '总分榜、单局最高榜、局数榜都只看正式结算。',
      tone: 'neutral',
    },
  ];
}

function buildCareerNotes(
  state: GameState,
  soldCount: number,
  lostCount: number,
  activeCount: number,
): ResultCareerNoteProjection[] {
  return [
    {
      title: '这局会留下什么',
      detail: `正式总分、三维得分、${soldCount} 套成交和单房结果会一起写进生涯。`,
      tone: soldCount > 0 ? 'chance' : 'neutral',
    },
    {
      title: '这局不会留下什么',
      detail: '精力、推广金、客户过程状态这些局内数据，不会直接带到下一局。',
      tone: 'neutral',
    },
    {
      title: '下次重点',
      detail: lostCount > 0
        ? `这局有 ${lostCount} 套丢盘，下一局重点是守盘和同类房处理。`
        : activeCount > 0
          ? `这局结束时还有 ${activeCount} 套房在场，下一局重点看怎么更早把机会推进到成交桌。`
          : `这局整体已经结算，下一局可以挑战更高难度的经营局面。`,
      tone: lostCount > 0 ? 'risk' : 'chance',
    },
  ];
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
