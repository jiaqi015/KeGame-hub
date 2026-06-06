import type { DailyReport, DailyTickResult, GameState, Case, Opportunity } from '../../domain/models.js';
import type { DailyCityStoryContextPack, DailyStoryVisibleEvent, DailyStoryVisibleCase, DailyStoryVisibleOwner, DailyStoryVisibleCustomer } from './contextPack.js';

export interface DailyStoryPlayerProfile {
  readonly playerId: string;
  readonly displayName: string;
  readonly role: 'broker' | 'manager' | 'owner';
  readonly experienceLevel: 'beginner' | 'intermediate' | 'expert';
  readonly preferredStyle: 'concise' | 'detailed' | 'storytelling';
  readonly focusAreas: readonly string[];
}

export interface BuildContextPackInput {
  readonly report: DailyReport;
  readonly tickResult?: DailyTickResult | null;
  readonly state?: GameState | null;
  readonly playerProfile?: DailyStoryPlayerProfile | null;
}

export function buildDailyStoryContextPack(input: BuildContextPackInput): DailyCityStoryContextPack {
  const { report, tickResult, state, playerProfile } = input;
  const day = report.day;

  return {
    packId: `daily-story-${day}-${Date.now()}`,
    day,
    reportTitle: report.title,
    cityFrame: buildCityFrame(report, state),
    scoreboard: buildScoreboard(report),
    visibleEvents: buildVisibleEvents(report, tickResult),
    visibleCases: buildVisibleCases(state),
    visibleOwners: buildVisibleOwners(state),
    visibleCustomers: buildVisibleCustomers(state),
    todayPlan: report.todayPlan,
    constraints: buildConstraints(playerProfile),
  };
}

function buildCityFrame(report: DailyReport, state?: GameState | null) {
  const districts = state?.cases
    ? [...new Set(state.cases.map(c => c.district).filter(Boolean))]
    : [];

  const hour = new Date().getHours();
  let currentPeriod: 'morning' | 'afternoon' | 'evening' | 'night' | 'unknown' = 'unknown';
  if (hour >= 6 && hour < 12) currentPeriod = 'morning';
  else if (hour >= 12 && hour < 18) currentPeriod = 'afternoon';
  else if (hour >= 18 && hour < 22) currentPeriod = 'evening';
  else currentPeriod = 'night';

  return {
    dayLabel: `第${report.day}天`,
    currentPeriod,
    districts,
    weatherOrExternalNotes: report.marketNews || [],
    marketMood: inferMarketMood(report),
  };
}

function inferMarketMood(report: DailyReport): string {
  const deltas = report.metricsDelta || [];
  const trustDelta = deltas.find(d => d.label.includes('信任'));
  const urgencyDelta = deltas.find(d => d.label.includes('紧迫'));

  if (trustDelta && trustDelta.value < -5) return '信任压力上升';
  if (urgencyDelta && urgencyDelta.value > 10) return '紧迫感加剧';
  if (deltas.some(d => d.label.includes('成交') && d.value > 0)) return '成交带动士气';
  return '整体平稳';
}

function buildScoreboard(report: DailyReport) {
  const deltas = report.metricsDelta || [];
  const totalScoreMetric = deltas.find(d => d.displayMode === 'absolute');
  const sharpestDeltas = deltas
    .filter(d => d.displayMode !== 'absolute' && d.value !== 0)
    .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))
    .slice(0, 3)
    .map(d => ({
      label: d.label,
      value: Math.abs(d.value),
      unit: d.unit,
      direction: d.value > 0 ? 'up' as const : d.value < 0 ? 'down' as const : 'flat' as const,
    }));

  return {
    totalScore: totalScoreMetric ? { value: totalScoreMetric.value, unit: totalScoreMetric.unit } : undefined,
    sharpestDeltas,
    riskCount: report.majorEvents.filter(e => e.tone === 'danger').length,
  };
}

function buildVisibleEvents(report: DailyReport, tickResult?: DailyTickResult | null): DailyStoryVisibleEvent[] {
  const events: DailyStoryVisibleEvent[] = [];

  for (const event of report.majorEvents) {
    events.push({
      eventId: `major-${events.length}`,
      actor: event.actor,
      title: event.message,
      detail: event.message,
      tone: mapTone(event.tone),
    });
  }

  for (const event of report.randomEvents) {
    events.push({
      eventId: `random-${events.length}`,
      actor: event.actor,
      title: event.message,
      detail: event.message,
      tone: mapTone(event.tone),
    });
  }

  if (tickResult?.closedDeals) {
    for (const deal of tickResult.closedDeals) {
      events.push({
        eventId: `deal-${events.length}`,
        actor: 'system',
        title: `成交：${deal.caseTitle || '房源'}`,
        detail: `成交价 ${deal.dealPrice || 0}万`,
        tone: 'success',
      });
    }
  }

  return events;
}

function mapTone(tone: string): 'success' | 'danger' | 'accent' | 'neutral' {
  if (tone === 'success' || tone === 'positive') return 'success';
  if (tone === 'danger' || tone === 'negative' || tone === 'warning') return 'danger';
  if (tone === 'accent' || tone === 'info') return 'accent';
  return 'neutral';
}

function buildVisibleCases(state?: GameState | null): DailyStoryVisibleCase[] {
  if (!state?.cases) return [];

  return state.cases.slice(0, 10).map(c => ({
    caseId: c.id,
    title: c.title || `${c.community || ''}${c.layout || ''}`,
    district: c.district,
    layout: c.layout,
    areaSqm: c.area,
    visibleStatus: inferCaseStatus(c),
    pressureLabels: inferCasePressure(c),
  }));
}

function inferCaseStatus(c: Case): string {
  if (c.status === 'sold') return '已成交';
  if (c.status === 'withdrawn') return '已下架';
  if (c.askPrice > c.marketPrice * 1.15) return '价格偏高';
  if (c.hasCompletedFirstVisit) return '已面访';
  return '跟进中';
}

function inferCasePressure(c: Case): string[] {
  const labels: string[] = [];
  if (c.priceGapPct > 15) labels.push('价差大');
  if (c.urgency >= 70) labels.push('紧迫');
  if (c.trust < 35) labels.push('信任低');
  if (c.patience < 25) labels.push('耐心低');
  return labels;
}

function buildVisibleOwners(state?: GameState | null): DailyStoryVisibleOwner[] {
  if (!state?.cases) return [];

  const ownerMap = new Map<string, { name: string; caseTitle: string; trust: number; urgency: number; patience: number }>();
  for (const c of state.cases) {
    const key = c.ownerName || c.ownerArchetypeId;
    if (!key) continue;
    const existing = ownerMap.get(key);
    if (!existing) {
      ownerMap.set(key, {
        name: c.ownerName || key,
        caseTitle: c.title,
        trust: c.trust,
        urgency: c.urgency,
        patience: c.patience,
      });
    }
  }

  return [...ownerMap.entries()].slice(0, 8).map(([key, o]) => ({
    ownerId: key,
    displayName: o.name,
    relatedCaseTitle: o.caseTitle,
    visibleMood: inferOwnerMood(o.trust, o.urgency, o.patience),
    pressureLabels: inferOwnerPressure(o.trust, o.urgency, o.patience),
  }));
}

function inferOwnerMood(trust: number, urgency: number, patience: number): string {
  if (trust < 30) return '不信任';
  if (urgency >= 70) return '焦虑';
  if (patience < 25) return '不耐烦';
  if (trust >= 70) return '配合';
  return '中性';
}

function inferOwnerPressure(trust: number, urgency: number, patience: number): string[] {
  const labels: string[] = [];
  if (trust < 35) labels.push('信任低');
  if (urgency >= 70) labels.push('紧迫');
  if (patience < 25) labels.push('耐心低');
  return labels;
}

function buildVisibleCustomers(state?: GameState | null): DailyStoryVisibleCustomer[] {
  if (!state?.opportunities) return [];

  return state.opportunities.slice(0, 8).map(opp => ({
    customerId: opp.id,
    displayName: opp.customerName || '客户',
    intentLabel: inferIntentLabel(opp.intent),
    relatedCaseTitles: opp.caseId ? [state.cases?.find(c => c.id === opp.caseId)?.title || ''].filter(Boolean) : [],
    latestVisibleSignal: opp.stageLabel || undefined,
  }));
}

function inferIntentLabel(intent?: number): string {
  if (!intent || intent < 30) return '低意向';
  if (intent < 60) return '中意向';
  if (intent < 80) return '高意向';
  return '极高意向';
}

function buildConstraints(playerProfile?: DailyStoryPlayerProfile | null): readonly string[] {
  const constraints: string[] = [
    '只能使用可见事实，不能发明不存在的成交、降价、客户、业主情绪',
    '不能偷看 hidden truth',
    '不能修改游戏状态',
    '不能声称已经安排成功',
  ];

  if (playerProfile?.experienceLevel === 'beginner') {
    constraints.push('用简单易懂的语言，避免专业术语');
    constraints.push('多解释为什么，少说结论');
  }
  if (playerProfile?.preferredStyle === 'concise') {
    constraints.push('简洁有力，每段不超过100字');
  }
  if (playerProfile?.preferredStyle === 'storytelling') {
    constraints.push('像讲故事一样，有起伏有节奏');
  }

  return constraints;
}
