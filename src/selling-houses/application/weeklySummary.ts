import type { Case, DailyTickResult, GameState, MarketOutcomeState, Opportunity, Tone } from '../domain/models.js';

export interface WeeklySummaryLine {
  label: string;
  value: string;
  tone?: Tone;
}

export interface WeeklySummaryChange {
  title: string;
  detail: string;
  tone?: Tone;
}

export interface WeeklySummaryDailyHighlight {
  day: number;
  title: string;
  detail: string;
  tone?: Tone;
}

export interface WeeklySummaryPresentation {
  title: string;
  dayRangeLabel: string;
  settledDays: number;
  totals: WeeklySummaryLine[];
  caseStageChanges: WeeklySummaryChange[];
  customerIntentChanges: WeeklySummaryChange[];
  ownerPressureChanges: WeeklySummaryChange[];
  marketWindow: WeeklySummaryLine[];
  dailyHighlights: WeeklySummaryDailyHighlight[];
  priorityActions: string[];
}

export function buildWeeklySummaryPresentation(
  beforeState: GameState,
  afterState: GameState,
  settledResults: DailyTickResult[],
): WeeklySummaryPresentation {
  const startDay = settledResults[0]?.day ?? beforeState.day;
  const endDay = settledResults[settledResults.length - 1]?.day ?? Math.max(beforeState.day, afterState.day - 1);
  const beforeMarket = beforeState.marketOutcome || null;
  const afterMarket = afterState.marketOutcome || null;
  const playerDeals = countPlayerDeals(settledResults);
  const rivalDeals = diffMarketNumber(beforeMarket, afterMarket, 'rivalClaimedDeals');
  const missedOpportunities = countNewLostOpportunities(beforeState, afterState);

  const isNaturalWeek = settledResults.length === 7;

  return {
    title: isNaturalWeek ? '周经营复盘' : '推进复盘',
    dayRangeLabel: `第 ${startDay}-${endDay} 天`,
    settledDays: settledResults.length,
    totals: [
      { label: '我方成交', value: `${playerDeals} 套`, tone: playerDeals > 0 ? 'success' : 'accent' },
      { label: '对手成交', value: `${Math.max(0, rivalDeals)} 套`, tone: rivalDeals > 0 ? 'danger' : 'accent' },
      { label: '错失机会', value: `${missedOpportunities} 个`, tone: missedOpportunities > 0 ? 'danger' : 'accent' },
    ],
    caseStageChanges: buildCaseStageChanges(beforeState, afterState),
    customerIntentChanges: buildCustomerIntentChanges(beforeState, afterState),
    ownerPressureChanges: buildOwnerPressureChanges(beforeState, afterState),
    marketWindow: buildMarketWindowLines(beforeMarket, afterMarket),
    dailyHighlights: buildDailyHighlights(settledResults),
    priorityActions: buildPriorityActions(afterState),
  };
}

function countPlayerDeals(settledResults: DailyTickResult[]) {
  return settledResults.reduce((sum, result) => (
    sum + result.closedDeals.filter((deal) => deal.dealType === 'self_closed').length
  ), 0);
}

function diffMarketNumber(
  beforeMarket: MarketOutcomeState | null,
  afterMarket: MarketOutcomeState | null,
  field: keyof Pick<MarketOutcomeState, 'releasedSlots' | 'playerClaimedDeals' | 'rivalClaimedDeals' | 'delayedDeals'>,
) {
  return Math.max(0, (afterMarket?.[field] ?? 0) - (beforeMarket?.[field] ?? 0));
}

function countNewLostOpportunities(beforeState: GameState, afterState: GameState) {
  const beforeLostIds = new Set(beforeState.opportunities
    .filter((entry) => entry.status === 'lost' || entry.lifecycleStatus === 'lost')
    .map((entry) => entry.id));
  return afterState.opportunities.filter((entry) => (
    !beforeLostIds.has(entry.id)
    && (entry.status === 'lost' || entry.lifecycleStatus === 'lost')
  )).length;
}

function buildCaseStageChanges(beforeState: GameState, afterState: GameState): WeeklySummaryChange[] {
  const beforeCases = new Map(beforeState.cases.map((entry) => [entry.id, entry]));
  const changes = afterState.cases
    .map((caseItem) => {
      const before = beforeCases.get(caseItem.id);
      if (!before) {
        return {
          title: caseItem.title,
          detail: `新入场，当前 ${caseItem.stageLabel}`,
          tone: 'accent' as Tone,
        };
      }
      const stageChanged = before.stageIndex !== caseItem.stageIndex || before.stageLabel !== caseItem.stageLabel;
      const statusChanged = before.status !== caseItem.status;
      if (!stageChanged && !statusChanged) {
        return null;
      }
      const stageText = stageChanged ? `${before.stageLabel} → ${caseItem.stageLabel}` : caseItem.stageLabel;
      const statusText = statusChanged ? `，状态 ${formatCaseStatus(before.status)} → ${formatCaseStatus(caseItem.status)}` : '';
      return {
        title: caseItem.title,
        detail: `${stageText}${statusText}`,
        tone: caseItem.status === 'sold' ? 'success' as Tone : caseItem.status === 'active' ? 'accent' as Tone : 'danger' as Tone,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  return changes.length > 0
    ? changes.slice(0, 5)
    : [{ title: '房源阶段', detail: '这段时间主要房源阶段保持稳定。', tone: 'accent' }];
}

function buildCustomerIntentChanges(beforeState: GameState, afterState: GameState): WeeklySummaryChange[] {
  const beforeOpportunities = new Map(beforeState.opportunities.map((entry) => [entry.id, entry]));
  const changes = afterState.opportunities
    .map((opportunity) => {
      const before = beforeOpportunities.get(opportunity.id);
      if (!before) {
        return {
          title: opportunity.customerName,
          detail: `新客进入 ${opportunity.stageLabel}`,
          tone: 'accent' as Tone,
          score: 8,
        };
      }
      const intentDelta = Math.round(opportunity.intent - before.intent);
      const confidenceDelta = Math.round(opportunity.confidence - before.confidence);
      const stageChanged = before.stageIndex !== opportunity.stageIndex || before.stageLabel !== opportunity.stageLabel;
      const score = Math.abs(intentDelta) + Math.abs(confidenceDelta) + (stageChanged ? 20 : 0);
      if (score < 6) {
        return null;
      }
      const stageText = stageChanged ? `，${before.stageLabel} → ${opportunity.stageLabel}` : '';
      return {
        title: opportunity.customerName,
        detail: `意向 ${formatSigned(intentDelta)}，信心 ${formatSigned(confidenceDelta)}${stageText}`,
        tone: intentDelta + confidenceDelta >= 0 ? 'success' as Tone : 'danger' as Tone,
        score,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
    .map(({ score: _score, ...entry }) => entry);
  return changes.length > 0
    ? changes
    : [{ title: '客户意向', detail: '这段时间客户意向整体波动不大。', tone: 'accent' }];
}

function buildOwnerPressureChanges(beforeState: GameState, afterState: GameState): WeeklySummaryChange[] {
  const beforeCases = new Map(beforeState.cases.map((entry) => [entry.id, entry]));
  const changes = afterState.cases
    .map((caseItem) => {
      const before = beforeCases.get(caseItem.id);
      if (!before) {
        return null;
      }
      const trustDelta = Math.round(caseItem.trust - before.trust);
      const pressureDelta = Math.round(before.windowDays - caseItem.windowDays);
      const score = Math.abs(trustDelta) + Math.abs(pressureDelta) * 3;
      if (score < 4) {
        return null;
      }
      return {
        title: caseItem.title,
        detail: `信任 ${formatSigned(trustDelta)}，窗口压力 ${formatSigned(pressureDelta)}`,
        tone: trustDelta >= 0 && pressureDelta <= 0 ? 'success' as Tone : pressureDelta > 0 || trustDelta < 0 ? 'danger' as Tone : 'accent' as Tone,
        score,
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((left, right) => right.score - left.score)
    .slice(0, 5)
    .map(({ score: _score, ...entry }) => entry);
  return changes.length > 0
    ? changes
    : [{ title: '业主侧', detail: '这段时间业主信任和窗口压力基本稳定。', tone: 'accent' }];
}

function buildMarketWindowLines(
  beforeMarket: MarketOutcomeState | null,
  afterMarket: MarketOutcomeState | null,
): WeeklySummaryLine[] {
  const releasedDelta = diffMarketNumber(beforeMarket, afterMarket, 'releasedSlots');
  const playerDelta = diffMarketNumber(beforeMarket, afterMarket, 'playerClaimedDeals');
  const rivalDelta = diffMarketNumber(beforeMarket, afterMarket, 'rivalClaimedDeals');
  const delayedDelta = diffMarketNumber(beforeMarket, afterMarket, 'delayedDeals');
  const remainingReleased = Math.max(
    0,
    (afterMarket?.releasedSlots ?? 0)
      - (afterMarket?.playerClaimedDeals ?? 0)
      - (afterMarket?.rivalClaimedDeals ?? 0)
      - (afterMarket?.delayedDeals ?? 0),
  );
  const remainingCapacity = Math.max(
    0,
    (afterMarket?.totalCapacity21d ?? 0)
      - (afterMarket?.playerClaimedDeals ?? 0)
      - (afterMarket?.rivalClaimedDeals ?? 0)
      - (afterMarket?.delayedDeals ?? 0),
  );

  return [
    { label: '期间释放', value: `${releasedDelta} 个`, tone: releasedDelta > 0 ? 'accent' : 'danger' },
    { label: '我方占用', value: `${playerDelta} 个`, tone: playerDelta > 0 ? 'success' : 'accent' },
    { label: '对手占用', value: `${rivalDelta} 个`, tone: rivalDelta > 0 ? 'danger' : 'accent' },
    { label: '开放剩余', value: `${remainingReleased} 个`, tone: remainingReleased > 0 ? 'success' : 'accent' },
    { label: '尾部延后', value: `${delayedDelta} 个`, tone: delayedDelta > 0 ? 'danger' : 'accent' },
    { label: '总容量余量', value: `${remainingCapacity} 个`, tone: remainingCapacity > 0 ? 'accent' : 'danger' },
  ];
}

function buildDailyHighlights(settledResults: DailyTickResult[]): WeeklySummaryDailyHighlight[] {
  return settledResults.map((result) => {
    const report = result.report;
    const closedDealText = result.closedDeals.length > 0
      ? `成交 ${result.closedDeals.length} 套`
      : '';
    const narrativeText = report?.narrativeLog?.text
      || report?.majorEvents[0]?.message
      || report?.randomEvents[0]?.message
      || '当天经营平稳推进。';
    return {
      day: result.day,
      title: report?.title || `第 ${result.day} 天`,
      detail: [closedDealText, narrativeText].filter(Boolean).join(' · '),
      tone: result.closedDeals.length > 0 ? 'success' : report?.majorEvents[0]?.tone || 'accent',
    };
  });
}

function buildPriorityActions(state: GameState): string[] {
  const activeOpportunities = state.opportunities
    .filter((entry) => entry.status === 'active')
    .sort(compareOpportunityPriority);
  const highIntent = activeOpportunities.find((entry) => entry.intent >= 72 || entry.stageIndex >= 3);
  const lowTrustCase = state.cases
    .filter((entry) => entry.status === 'active')
    .sort((left, right) => left.trust - right.trust)[0];
  const tightWindowCase = state.cases
    .filter((entry) => entry.status === 'active')
    .sort((left, right) => left.windowDays - right.windowDays)[0];
  const market = state.marketOutcome || null;
  const openSlots = Math.max(
    0,
    (market?.releasedSlots ?? 0) - (market?.playerClaimedDeals ?? 0) - (market?.rivalClaimedDeals ?? 0) - (market?.delayedDeals ?? 0),
  );
  const actions: string[] = [];

  if (highIntent) {
    actions.push(`${highIntent.customerName} 已接近成交口，优先确认价格和付款节奏。`);
  }
  if (lowTrustCase && lowTrustCase.trust < 58) {
    actions.push(`${lowTrustCase.title} 先稳业主预期，补一轮价格沟通。`);
  }
  if (tightWindowCase && tightWindowCase.windowDays <= 5) {
    actions.push(`${tightWindowCase.title} 窗口偏紧，先排关键跟进。`);
  }
  if (openSlots > 0) {
    actions.push(`成交窗口还有 ${openSlots} 个，优先推进临门一脚。`);
  }
  if (actions.length === 0) {
    actions.push('把资源集中到阶段最高的客户和窗口最紧的房源。');
  }

  return [...new Set(actions)].slice(0, 4);
}

function compareOpportunityPriority(left: Opportunity, right: Opportunity) {
  return (
    right.stageIndex * 100 + right.intent + right.confidence * 0.4
  ) - (
    left.stageIndex * 100 + left.intent + left.confidence * 0.4
  );
}

function formatSigned(value: number) {
  return value > 0 ? `+${value}` : String(value);
}

function formatCaseStatus(status: Case['status']) {
  if (status === 'active') return '在售';
  if (status === 'sold') return '已成交';
  if (status === 'withdrawn') return '撤牌';
  return '被对手拿走';
}
