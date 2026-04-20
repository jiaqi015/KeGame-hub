import type {
  DailyReport,
  DomainEventEntry,
  GameState,
  Tone,
  WeeklyReview,
} from '../../domain/models.js';
import type { ProjectionTone } from './operatingProjection.js';

export interface ReviewHeroProjection {
  title: string;
  subtitle: string;
  note: string;
}

export interface ReviewTurningPointProjection {
  id: string;
  label: string;
  title: string;
  detail: string;
  tone: ProjectionTone;
  day: number;
  date: string;
  caseTitle?: string;
}

export interface ReviewCustomerProjection {
  engaged: number;
  comparing: number;
  atRisk: number;
  rivalPulled: number;
  strongestCaseTitle: string | null;
  mostComparedCaseTitle: string | null;
  mostAtRiskCaseTitle: string | null;
  summary: string;
}

export interface ReviewDailyBriefProjection {
  title: string;
  headline: string;
  metricNotes: string[];
  marketNews: string[];
  focusCases: string[];
  priorities: string[];
}

export interface ReviewProjection {
  hero: ReviewHeroProjection;
  turningPoints: ReviewTurningPointProjection[];
  customer: ReviewCustomerProjection;
  recentChanges: ReviewTurningPointProjection[];
  dailyBrief: ReviewDailyBriefProjection | null;
  weeklyReviews: WeeklyReview[];
}

export function buildReviewProjection(state: GameState): ReviewProjection {
  const turningPoints = buildTurningPoints(state);
  const recentChanges = buildRecentChanges(state);
  const customer = buildCustomerProjection(state);
  const dailyBrief = buildDailyBrief(state.currentReport);

  return {
    hero: {
      title: '经营回看',
      subtitle: `${state.runContext.scenarioName} · ${difficultyLabel(state.runContext.difficultyId)}`,
      note: dailyBrief
        ? '先看哪几天开始往前走了，哪几天开始出问题。'
        : '这局还没跑完第一天，先把时间往前推进一点，复盘才会开始有因果。',
    },
    turningPoints,
    customer,
    recentChanges,
    dailyBrief,
    weeklyReviews: state.weeklyReviews,
  };
}

function difficultyLabel(difficultyId: string) {
  if (difficultyId === 'warmup') return '热身局';
  if (difficultyId === 'easy') return '入门局';
  if (difficultyId === 'standard') return '标准局';
  if (difficultyId === 'advanced') return '进阶局';
  if (difficultyId === 'hard') return '高压局';
  if (difficultyId === 'extreme') return '极限局';
  return difficultyId;
}

function buildTurningPoints(state: GameState): ReviewTurningPointProjection[] {
  return [...state.eventStore]
    .sort((left, right) => {
      if (right.day !== left.day) return right.day - left.day;
      return scoreEvent(right) - scoreEvent(left);
    })
    .slice(0, 6)
    .map((event) => toReviewEvent(event, state));
}

function buildRecentChanges(state: GameState): ReviewTurningPointProjection[] {
  const customerEvents = state.eventStore.filter((event) => isCustomerRelated(event));
  const source = customerEvents.length > 0 ? customerEvents : state.eventStore;

  return [...source]
    .sort((left, right) => {
      if (right.day !== left.day) return right.day - left.day;
      return scoreEvent(right) - scoreEvent(left);
    })
    .slice(0, 6)
    .map((event) => toReviewEvent(event, state));
}

function buildCustomerProjection(state: GameState): ReviewCustomerProjection {
  const engaged = state.customerStates.filter((entry) => entry.status === 'engaged' || entry.status === 'negotiating').length;
  const comparing = state.customerStates.filter((entry) => entry.status === 'comparing').length;
  const atRisk = state.customerStates.filter((entry) => entry.churnRisk >= 60).length;
  const rivalPulled = state.customerStates.filter((entry) => entry.lastActionNote?.includes('竞品')).length;

  const strongestCaseTitle = pickLeadCaseTitle(
    state,
    (entry) => entry.status === 'engaged' || entry.status === 'negotiating',
  );
  const mostComparedCaseTitle = pickLeadCaseTitle(state, (entry) => entry.status === 'comparing');
  const mostAtRiskCaseTitle = pickLeadCaseTitle(state, (entry) => entry.churnRisk >= 60);

  const summary = comparing > 0
    ? `现在还有 ${comparing} 位客户在比盘，说明你的价格和讲法还没完全压住同类盘。`
    : atRisk > 0
      ? `现在有 ${atRisk} 位客户快流失，说明最后几步的承接还需要更稳。`
      : engaged > 0
        ? `现在还有 ${engaged} 位客户在往前走，客户线没有断。`
        : '现在客户推进偏薄，后面要更早把线索做厚。';

  return {
    engaged,
    comparing,
    atRisk,
    rivalPulled,
    strongestCaseTitle,
    mostComparedCaseTitle,
    mostAtRiskCaseTitle,
    summary,
  };
}

function buildDailyBrief(report: DailyReport | null): ReviewDailyBriefProjection | null {
  if (!report) {
    return null;
  }

  return {
    title: report.title,
    headline: report.majorEvents[0]?.message || '昨天没有特别大的事件，但日结已经落完账。',
    metricNotes: report.metricsDelta.map((entry) => {
      const prefix = entry.value > 0 ? '+' : '';
      return `${entry.label} ${prefix}${entry.value}${entry.unit}`;
    }),
    marketNews: report.marketNews.slice(0, 3),
    focusCases: report.todayPlan.focusCases.slice(0, 3),
    priorities: report.todayPlan.priorities.slice(0, 3),
  };
}

function toReviewEvent(event: DomainEventEntry, state: GameState): ReviewTurningPointProjection {
  const caseTitle = event.caseId
    ? state.cases.find((entry) => entry.id === event.caseId)?.title
    : undefined;

  return {
    id: event.id,
    label: labelForEvent(event),
    title: event.title,
    detail: event.detail,
    tone: mapTone(event.tone),
    day: event.day,
    date: event.date,
    caseTitle,
  };
}

function labelForEvent(event: DomainEventEntry) {
  switch (event.kind) {
    case 'case_sold':
      return '成交落账';
    case 'case_lost_to_rival':
      return '丢盘';
    case 'case_withdrawn':
      return '撤盘';
    case 'opportunity_closed':
      return '机会成交';
    case 'opportunity_advanced':
      return '客户推进';
    case 'market_event':
      return '市场变化';
    case 'budget_changed':
      return '资源变化';
    case 'action_executed':
      return '动作落地';
    default:
      return '经营变化';
  }
}

function scoreEvent(event: DomainEventEntry) {
  const kindWeight = (() => {
    switch (event.kind) {
      case 'case_sold':
        return 100;
      case 'case_lost_to_rival':
        return 96;
      case 'case_withdrawn':
        return 92;
      case 'opportunity_closed':
        return 84;
      case 'opportunity_advanced':
        return 78;
      case 'market_event':
        return 64;
      case 'action_executed':
        return 48;
      case 'budget_changed':
        return 36;
      default:
        return 20;
    }
  })();

  return kindWeight + toneWeight(event.tone);
}

function toneWeight(tone: Tone) {
  if (tone === 'danger') return 12;
  if (tone === 'success') return 10;
  if (tone === 'accent') return 6;
  return 0;
}

function mapTone(tone: Tone): ProjectionTone {
  if (tone === 'danger') return 'risk';
  if (tone === 'success') return 'chance';
  return 'neutral';
}

function isCustomerRelated(event: DomainEventEntry) {
  return event.kind === 'opportunity_advanced'
    || event.kind === 'opportunity_closed'
    || Boolean(event.customerId)
    || event.title.includes('客户')
    || event.detail.includes('客户')
    || event.detail.includes('竞品');
}

function pickLeadCaseTitle(
  state: GameState,
  predicate: (entry: GameState['customerStates'][number]) => boolean,
) {
  const counts = new Map<string, number>();
  state.customerStates
    .filter(predicate)
    .forEach((entry) => {
      const leadCaseId = entry.activeCaseIds[0];
      if (!leadCaseId) return;
      counts.set(leadCaseId, (counts.get(leadCaseId) || 0) + 1);
    });

  const leadCaseId = [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0];
  return state.cases.find((entry) => entry.id === leadCaseId)?.title || null;
}
