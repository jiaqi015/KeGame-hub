import type { Case, DailyTickResult, DomainEventEntry, GameState, MarketOutcomeState, Opportunity, Tone } from '../domain/models.js';
import { isCaseActiveByCanonicalStatus, isCaseSoldByCanonicalStatus, isCaseLostOrWithdrawnByCanonicalStatus } from '../domain/caseLifecycleStatusRead.js';
import { isOpportunityActiveByCanonicalState } from '../domain/opportunityLifecycleStatusRead.js';

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
  settlementHeadline: string;
  settlementSubline: string;
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
  const totalClosedDeals = settledResults.reduce((sum, result) => sum + result.closedDeals.length, 0);
  const activeCases = afterState.cases.filter((entry) => isCaseActiveByCanonicalStatus(afterState, entry)).length;

  return {
    title: isNaturalWeek ? '周经营复盘' : '推进复盘',
    dayRangeLabel: `第 ${startDay}-${endDay} 天`,
    settledDays: settledResults.length,
    settlementHeadline: `已结算 ${settledResults.length} 天，当前推进到第 ${afterState.day} 天`,
    settlementSubline: totalClosedDeals > 0
      ? `这段时间共成交 ${totalClosedDeals} 套，其中我方 ${playerDeals} 套；剩余 ${activeCases} 套还在经营。`
      : `这段时间没有新成交；剩余 ${activeCases} 套还在经营，先看下方变化再排今天。`,
    totals: [
      { label: '我方成交', value: `${playerDeals} 套`, tone: playerDeals > 0 ? 'success' : 'accent' },
      { label: '对手成交', value: `${Math.max(0, rivalDeals)} 套`, tone: rivalDeals > 0 ? 'danger' : 'accent' },
      { label: '错失机会', value: `${missedOpportunities} 个`, tone: missedOpportunities > 0 ? 'danger' : 'accent' },
    ],
    caseStageChanges: buildCaseStageChanges(beforeState, afterState, settledResults),
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

function buildCaseStageChanges(
  beforeState: GameState,
  afterState: GameState,
  settledResults: DailyTickResult[],
): WeeklySummaryChange[] {
  const beforeCases = new Map(beforeState.cases.map((entry) => [entry.id, entry]));
  const caseEvents = groupCaseEvents(settledResults);
  const changes = afterState.cases
    .map((caseItem) => {
      const before = beforeCases.get(caseItem.id);
      const events = caseEvents.get(caseItem.id) || [];
      if (!before) {
        return {
          title: caseItem.title,
          detail: `新入场，当前 ${caseItem.stageLabel}`,
          tone: 'accent' as Tone,
          score: 20,
        };
      }
      const stageChanged = before.stageIndex !== caseItem.stageIndex || before.stageLabel !== caseItem.stageLabel;
      const statusChanged = before.status !== caseItem.status;
      if (!stageChanged && !statusChanged) {
        if (!events.length) return null;
        return {
          title: caseItem.title,
          detail: describeCaseEventMovement(events, before, caseItem),
          tone: deriveCaseEventTone(events),
          score: scoreCaseEvents(events),
        };
      }
      const stageText = describeStageMovement(before, caseItem);
      const statusText = statusChanged ? `，状态 ${formatCaseStatus(before.status)} → ${formatCaseStatus(caseItem.status)}` : '';
      const changeTone = isCaseSoldByCanonicalStatus(afterState, caseItem) ? 'success' as Tone : isCaseActiveByCanonicalStatus(afterState, caseItem) ? 'accent' as Tone : 'danger' as Tone;
      return {
        title: caseItem.title,
        detail: `${stageText}${statusText}${describeStageContext(before, caseItem)}${describeEventContext(events)}`,
        tone: changeTone,
        score: 50 + scoreCaseEvents(events),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
  return changes.length > 0
    ? changes.sort((left, right) => right.score - left.score).slice(0, 5).map(({ score: _score, ...entry }) => entry)
    : [{ title: '房源经营', detail: '这段时间没有明显阶段跃迁，主要是客户、业主和竞品侧在累积压力。', tone: 'accent' }];
}

function groupCaseEvents(settledResults: DailyTickResult[]) {
  const groups = new Map<string, DomainEventEntry[]>();
  settledResults.forEach((result) => {
    result.emittedEvents.forEach((event) => {
      if (!event.caseId) return;
      const events = groups.get(event.caseId) || [];
      events.push(event);
      groups.set(event.caseId, events);
    });
  });
  return groups;
}

function scoreCaseEvents(events: DomainEventEntry[]) {
  return events.reduce((sum, event) => {
    if (event.kind === 'case_sold' || event.kind === 'case_lost_to_rival') return sum + 80;
    if (event.kind === 'action_executed') return sum + 30;
    if (event.kind === 'opportunity_advanced') return sum + 28;
    if (event.kind === 'opportunity_closed') return sum + 24;
    if (event.kind === 'window_extended') return sum + 18;
    if (event.kind === 'market_event') return sum + 12;
    return sum + 6;
  }, 0);
}

function deriveCaseEventTone(events: DomainEventEntry[]): Tone {
  if (events.some((event) => event.kind === 'case_sold' || event.tone === 'success')) return 'success';
  if (events.some((event) => event.kind === 'case_lost_to_rival' || event.kind === 'opportunity_closed' || event.tone === 'danger')) return 'danger';
  return 'accent';
}

function describeCaseEventMovement(events: DomainEventEntry[], before: Case, after: Case) {
  const sold = events.find((event) => event.kind === 'case_sold');
  if (sold) return `成交落地，${stripCasePrefix(sold.detail, after)}${describeStageContext(before, after)}`;
  const lost = events.find((event) => event.kind === 'case_lost_to_rival');
  if (lost) return `被外部房源截走，${stripCasePrefix(lost.detail, after)}`;

  const actionEvents = events.filter((event) => event.kind === 'action_executed');
  const advanced = events.filter((event) => event.kind === 'opportunity_advanced');
  const closed = events.filter((event) => event.kind === 'opportunity_closed');
  const windowExtended = events.find((event) => event.kind === 'window_extended');
  const marketEvents = events.filter((event) => event.kind === 'market_event');
  const fragments: string[] = [];

  actionEvents
    .map((event) => describeActionEvent(event, after))
    .filter(Boolean)
    .slice(-2)
    .forEach((fragment) => fragments.push(fragment));
  if (advanced.length > 0) {
    const lead = advanced[advanced.length - 1];
    const stageLabel = typeof lead.payload?.stageLabel === 'string' ? lead.payload.stageLabel : '下一阶段';
    fragments.push(`${advanced.length} 条客户线推进到 ${stageLabel}`);
  }
  if (closed.length > 0) {
    fragments.push(`${closed.length} 条客户线流失或关闭`);
  }
  if (windowExtended) {
    fragments.push('业主重新给了操作窗口');
  }
  if (marketEvents.length > 0) {
    fragments.push('外部市场信号影响了这套房');
  }
  if (!fragments.length) {
    const lead = events[events.length - 1];
    fragments.push(stripCasePrefix(lead.detail, after));
  }

  const movement = describeBusinessMovement(before, after);
  return `${movement}：${fragments.join('；')}${describeStageContext(before, after)}`;
}

function describeActionEvent(event: DomainEventEntry, caseItem: Case) {
  const actionId = typeof event.payload?.actionId === 'string' ? event.payload.actionId : '';
  const settlementTitle = typeof event.payload?.settlementTitle === 'string' ? event.payload.settlementTitle : event.title;
  const cleanTitle = stripCasePrefix(settlementTitle, caseItem).replace(/^执行\s*/, '');
  if (actionId === 'first-visit') return `面访后补齐业主分型`;
  if (actionId === 'showing') return `带看后沉淀客户反馈`;
  if (actionId === 'focus-meeting-submit') return `聚焦会把它放进外部比较`;
  if (actionId === 'weekly-feedback') return `业主反馈后预期被校准`;
  if (actionId === 'pricing-advice' || actionId === 'adjust-listing-price') return `价格沟通改变市场站位`;
  if (actionId === 'invite-customer-negotiation') return `客户进入谈判口`;
  if (cleanTitle) return cleanTitle;
  return stripCasePrefix(event.detail, caseItem);
}

function describeBusinessMovement(before: Case, after: Case) {
  if (after.status === 'sold' && before.status !== 'sold') return '成交状态变化';
  if (after.status === 'lost_to_rival' && before.status !== 'lost_to_rival') return '外部竞品截胡';
  if (after.status === 'withdrawn' && before.status !== 'withdrawn') return '业主窗口关闭';
  if (!before.hasCompletedFirstVisit && after.hasCompletedFirstVisit) return '业主信息变清楚';
  if (after.offers > before.offers) return '报价链路推进';
  if (after.viewings > before.viewings) return '带看链路推进';
  if (after.heat > before.heat + 5) return '客户热度抬升';
  if (after.trust > before.trust + 4) return '业主信任修复';
  if (after.windowDays < before.windowDays - 2) return '经营窗口收紧';
  if (after.stageIndex !== before.stageIndex) return `${before.stageLabel} → ${after.stageLabel}`;
  return '阶段名未变，底层经营关系变化';
}

function describeEventContext(events: DomainEventEntry[]) {
  const actions = events.filter((event) => event.kind === 'action_executed').length;
  const advanced = events.filter((event) => event.kind === 'opportunity_advanced').length;
  const closed = events.filter((event) => event.kind === 'opportunity_closed').length;
  const fragments: string[] = [];
  if (actions > 0) fragments.push(`关键动作 ${actions} 次`);
  if (advanced > 0) fragments.push(`客户推进 ${advanced} 次`);
  if (closed > 0) fragments.push(`客户流失 ${closed} 次`);
  return fragments.length > 0 ? `，${fragments.join('、')}` : '';
}

function stripCasePrefix(detail: string, caseItem: Case) {
  return detail.replace(caseItem.title, '').replace(/^，|。$/g, '').trim() || detail;
}

function describeStageMovement(before: Case, after: Case) {
  if (before.stageIndex < after.stageIndex) {
    if (!before.hasCompletedFirstVisit && after.hasCompletedFirstVisit) return '从待面访推进到已面访';
    if (after.viewings > before.viewings) return `带看从 ${before.stageLabel} 推进到 ${after.stageLabel}`;
    if (after.offers > before.offers) return `报价从 ${before.stageLabel} 推进到 ${after.stageLabel}`;
    return `${before.stageLabel} → ${after.stageLabel}`;
  }
  if (before.stageIndex > after.stageIndex) {
    return `${before.stageLabel} 回落到 ${after.stageLabel}`;
  }
  return `${before.stageLabel} 维持不变`;
}

function describeStageContext(before: Case, after: Case) {
  const fragments: string[] = [];
  if (after.heat !== before.heat) {
    fragments.push(`热度 ${formatSigned(Math.round(after.heat - before.heat))}`);
  }
  if (after.trust !== before.trust) {
    fragments.push(`信任 ${formatSigned(Math.round(after.trust - before.trust))}`);
  }
  if (after.windowDays !== before.windowDays) {
    fragments.push(`窗口 ${formatSigned(Math.round(after.windowDays - before.windowDays))} 天`);
  }
  if (after.viewings !== before.viewings) {
    fragments.push(`带看 ${formatSigned(after.viewings - before.viewings)} 次`);
  }
  if (after.offers !== before.offers) {
    fragments.push(`报价 ${formatSigned(after.offers - before.offers)} 次`);
  }
  return fragments.length > 0 ? `，${fragments.join('、')}` : '';
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
      return {
        title: opportunity.customerName,
        detail: describeCustomerFollowupChange(before, opportunity, intentDelta, confidenceDelta),
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
    : [{ title: '客户跟进', detail: '这段时间客户整体比较稳定，没有明显升温或流失。', tone: 'accent' }];
}

function describeCustomerFollowupChange(
  before: Opportunity,
  after: Opportunity,
  intentDelta: number,
  confidenceDelta: number,
) {
  const stageChanged = before.stageIndex !== after.stageIndex || before.stageLabel !== after.stageLabel;
  const totalDelta = intentDelta + confidenceDelta;
  const stageText = stageChanged
    ? `从「${before.stageLabel}」推进到「${after.stageLabel}」`
    : `仍停在「${after.stageLabel}」`;

  if (after.status === 'lost' || after.lifecycleStatus === 'lost') {
    return `${stageText}，这条客户线已经流失，先复盘卡点，别再占用今天资源。`;
  }
  if (
    after.status === 'closed'
    || after.lifecycleStatus === 'closed_by_deal'
    || after.lifecycleStatus === 'closed_by_case'
  ) {
    return `${stageText}，客户已经结束跟进，后面只保留必要记录。`;
  }
  if (stageChanged && totalDelta >= 0) {
    return `${stageText}，热度在往前走，今天适合补一次确认和下一步邀约。`;
  }
  if (stageChanged) {
    return `${stageText}，但把握感变弱，推进前先确认真实顾虑。`;
  }
  if (totalDelta >= 24) {
    return `${stageText}，明显升温，适合趁热约带看或推进谈价。`;
  }
  if (totalDelta >= 8) {
    return `${stageText}，有小幅升温，可以安排一次轻触达。`;
  }
  if (totalDelta <= -34) {
    return `${stageText}，明显转冷，可能被竞品或价格预期分走注意力。`;
  }
  if (totalDelta <= -14) {
    return `${stageText}，兴趣在回落，先用竞品对比或业主反馈重新拉回。`;
  }
  return `${stageText}，变化不大，保持常规跟进即可。`;
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
    .filter((entry) => isOpportunityActiveByCanonicalState(state, entry))
    .sort(compareOpportunityPriority);
  const highIntent = activeOpportunities.find((entry) => entry.intent >= 72 || entry.stageIndex >= 3);
  const lowTrustCase = state.cases
    .filter((entry) => isCaseActiveByCanonicalStatus(state, entry))
    .sort((left, right) => left.trust - right.trust)[0];
  const tightWindowCase = state.cases
    .filter((entry) => isCaseActiveByCanonicalStatus(state, entry))
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
