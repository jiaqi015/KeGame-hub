import type {
  Case,
  DomainEventEntry,
  GameState,
  MatterEntry,
  Opportunity,
} from '../../domain/models.js';
import type { DashboardProjection } from './operatingProjection.js';
import type { MarketIntelProjection } from '../../ui/features/marketIntel.js';
import { buildOpportunityViewModels } from '../../ui/features/caseOpportunityViewModel.js';
import type { WechatFact, WechatFactSource, WechatFactType } from './myWechatTypes.js';

export interface ExtractMyWechatFactsInput {
  state: GameState;
  dashboard: DashboardProjection;
  marketIntel?: MarketIntelProjection;
}

export function extractMyWechatFacts(input: ExtractMyWechatFactsInput): WechatFact[] {
  return [
    ...extractOwnerFacts(input),
    ...extractCustomerFacts(input),
    ...extractManagerFacts(input),
    ...extractMarketIntelFacts(input),
    ...extractMatterFacts(input),
    ...extractFactsFromEventStore(input.state.eventStore, input.state),
  ].filter((fact) => Boolean(fact));
}

function extractOwnerFacts(input: ExtractMyWechatFactsInput): WechatFact[] {
  const { state, dashboard } = input;
  const todayPriorityCaseIds = new Set(dashboard.todayPriority.map((entry) => entry.caseId).filter(Boolean));
  const leadCaseId = resolveLeadCaseId(state, dashboard);
  const coldCaseIds = new Set(
    dashboard.todayPriority
      .filter((entry) => entry.title.includes('带看') || entry.detail.includes('带看') || entry.detail.includes('客户'))
      .map((entry) => entry.caseId)
      .filter(Boolean) as string[],
  );

  return activeCases(state).flatMap((caseItem) => {
    const facts: WechatFact[] = [];
    const baseContext = getCaseContext(caseItem);
    const eventSignals = getRecentCaseEvents(state, caseItem.id);
    const priorityBoost = getCasePriorityBoost(caseItem, leadCaseId, todayPriorityCaseIds);
    const hasRecentOwnerContact = hasOwnerContactToday(state, caseItem.id);

    if (caseItem.urgency >= 72 || caseItem.windowDays <= 7 || caseItem.patience <= 45) {
      facts.push(buildFact({
        state,
        source: 'owner_state',
        type: 'owner_urgent',
        caseId: caseItem.id,
        priority: 20 + priorityBoost + riskScore(caseItem.urgency, 60) + riskScore(50 - caseItem.patience, 0),
        reason: `${caseItem.ownerName} 时间压力或耐心已经进入高风险区，需要今天给明确方案。`,
        senderRole: 'owner',
        senderName: caseItem.ownerName,
        ownerName: caseItem.ownerName,
        ...baseContext,
        debugSignals: [`urgency=${caseItem.urgency}`, `windowDays=${caseItem.windowDays}`, `patience=${caseItem.patience}`],
      }));
    }

    if (caseItem.priceGapPct >= 2.5 || caseItem.askPrice >= caseItem.marketPrice * 1.04 || hasRivalPricePressure(state, caseItem)) {
      facts.push(buildFact({
        state,
        source: 'case',
        type: 'owner_price_doubt',
        caseId: caseItem.id,
        priority: 15 + priorityBoost + riskScore(caseItem.priceGapPct, 0),
        reason: `${caseItem.title} 挂牌价高于市场常见成交价，业主容易追问价格判断。`,
        senderRole: 'owner',
        senderName: caseItem.ownerName,
        ownerName: caseItem.ownerName,
        price: Math.round(caseItem.askPrice),
        rivalTitle: getLeadRivalListing(state, caseItem)?.title,
        ...baseContext,
        debugSignals: [`priceGapPct=${caseItem.priceGapPct}`, `askPrice=${caseItem.askPrice}`, `marketPrice=${caseItem.marketPrice}`],
      }));
    }

    if (caseItem.heat <= 55 || caseItem.viewings <= 0 || coldCaseIds.has(caseItem.id) || !hasShowingFeedback(state, caseItem.id)) {
      facts.push(buildFact({
        state,
        source: 'case',
        type: 'owner_no_showing',
        caseId: caseItem.id,
        priority: 12 + priorityBoost + riskScore(58 - caseItem.heat, 0),
        reason: `${caseItem.title} 近期带看和反馈偏少，业主会追问真实市场动静。`,
        senderRole: 'owner',
        senderName: caseItem.ownerName,
        ownerName: caseItem.ownerName,
        ...baseContext,
        debugSignals: [`heat=${caseItem.heat}`, `viewings=${caseItem.viewings}`],
      }));
    }

    if (state.day - caseItem.lastOwnerTouchedDay >= 2 && !hasRecentOwnerContact) {
      facts.push(buildFact({
        state,
        source: 'owner_state',
        type: 'owner_long_time_no_touch',
        caseId: caseItem.id,
        priority: 10 + priorityBoost + Math.max(0, state.day - caseItem.lastOwnerTouchedDay),
        reason: `${caseItem.ownerName} 已经多天没有收到业主侧同步，今天需要补一次沟通。`,
        senderRole: 'owner',
        senderName: caseItem.ownerName,
        ownerName: caseItem.ownerName,
        ...baseContext,
        debugSignals: [`lastOwnerTouchedDay=${caseItem.lastOwnerTouchedDay}`, `day=${state.day}`],
      }));
    }

    if (caseItem.trust <= 55 || eventSignals.some((event) => mentionsAny(event, ['信任', '不满', '情绪', '投诉']))) {
      facts.push(buildFact({
        state,
        source: eventSignals.length > 0 ? 'event_store' : 'owner_state',
        type: 'owner_trust_drop',
        caseId: caseItem.id,
        eventId: eventSignals.find((event) => mentionsAny(event, ['信任', '不满', '情绪', '投诉']))?.id,
        priority: 14 + priorityBoost + riskScore(58 - caseItem.trust, 0),
        reason: `${caseItem.ownerName} 的信任感偏低，沟通里要先解释事实再谈动作。`,
        senderRole: 'owner',
        senderName: caseItem.ownerName,
        ownerName: caseItem.ownerName,
        ...baseContext,
        debugSignals: [`trust=${caseItem.trust}`],
      }));
    }

    return facts;
  });
}

function extractCustomerFacts(input: ExtractMyWechatFactsInput): WechatFact[] {
  const { state, dashboard } = input;
  const todayPriorityCaseIds = new Set(dashboard.todayPriority.map((entry) => entry.caseId).filter(Boolean));
  const leadCaseId = resolveLeadCaseId(state, dashboard);
  const productCaseIds = new Set(dashboard.productOpportunities.map((entry) => entry.caseId).filter(Boolean));
  const activeOpportunities = state.opportunities.filter((opportunity) => opportunity.status === 'active');
  const viewModels = buildOpportunityViewModels(state, activeOpportunities);

  return viewModels.flatMap((model) => {
    const opportunity = model.opportunity;
    const caseItem = model.caseItem;
    if (!caseItem || caseItem.status !== 'active' || opportunity.visibility === 'shadow') {
      return [];
    }

    const customerState = model.customerState;
    const runtime = model.runtime;
    const facts: WechatFact[] = [];
    const priorityBoost = getCasePriorityBoost(caseItem, leadCaseId, todayPriorityCaseIds)
      + (opportunity.intent >= 76 ? 18 : 0);
    const context = getOpportunityContext(caseItem, opportunity);

    if (customerState?.status === 'comparing' || (runtime?.competingCaseIds?.length || 0) > 0 || model.competitorSummary) {
      facts.push(buildFact({
        state,
        source: 'customer_opportunity',
        type: 'customer_comparing',
        caseId: caseItem.id,
        customerId: opportunity.customerId,
        opportunityId: opportunity.id,
        priority: 10 + priorityBoost,
        reason: `${opportunity.customerName} 正在拿同类房比较，需要把这套房的优势讲清楚。`,
        senderRole: 'customer',
        senderName: opportunity.customerName,
        customerName: opportunity.customerName,
        ...context,
        debugSignals: [`status=${customerState?.status || 'unknown'}`, `competitors=${runtime?.competingCaseIds?.length || 0}`],
      }));
    }

    if (opportunity.priceSensitivity >= 68 || opportunity.budgetMax < caseItem.askPrice || (model.customer?.priceSensitivity || 0) >= 68) {
      facts.push(buildFact({
        state,
        source: 'customer_opportunity',
        type: 'customer_price_sensitive',
        caseId: caseItem.id,
        customerId: opportunity.customerId,
        opportunityId: opportunity.id,
        priority: 12 + priorityBoost + riskScore(opportunity.priceSensitivity, 58),
        reason: `${opportunity.customerName} 对总价和业主预期很敏感，继续推进前要先确认价格空间。`,
        senderRole: 'customer',
        senderName: opportunity.customerName,
        customerName: opportunity.customerName,
        price: Math.round(caseItem.askPrice),
        ...context,
        debugSignals: [`priceSensitivity=${opportunity.priceSensitivity}`, `budgetMax=${opportunity.budgetMax}`, `askPrice=${caseItem.askPrice}`],
      }));
    }

    if (opportunity.intent >= 76 && (opportunity.stageIndex >= 1 || runtime?.viewed || productCaseIds.has(caseItem.id))) {
      facts.push(buildFact({
        state,
        source: 'customer_opportunity',
        type: 'customer_second_showing',
        caseId: caseItem.id,
        customerId: opportunity.customerId,
        opportunityId: opportunity.id,
        priority: 18 + priorityBoost,
        reason: `${opportunity.customerName} 仍有明确兴趣，适合尽快约复看或带家人再确认。`,
        senderRole: 'customer',
        senderName: opportunity.customerName,
        customerName: opportunity.customerName,
        ...context,
        debugSignals: [`intent=${opportunity.intent}`, `stageIndex=${opportunity.stageIndex}`, `viewed=${Boolean(runtime?.viewed)}`],
      }));
    }

    if ((customerState?.churnRisk || 0) >= 55 || opportunity.daysLeft <= 2 || opportunity.intent < 45 || opportunity.stagnationTicks >= 2) {
      facts.push(buildFact({
        state,
        source: 'customer_opportunity',
        type: 'customer_churn_risk',
        caseId: caseItem.id,
        customerId: opportunity.customerId,
        opportunityId: opportunity.id,
        priority: 15 + priorityBoost + riskScore(customerState?.churnRisk || 0, 48),
        reason: `${opportunity.customerName} 有流失风险，今天不能等客户自然回头。`,
        senderRole: 'customer',
        senderName: opportunity.customerName,
        customerName: opportunity.customerName,
        ...context,
        debugSignals: [`churnRisk=${customerState?.churnRisk || 0}`, `daysLeft=${opportunity.daysLeft}`, `stagnationTicks=${opportunity.stagnationTicks}`],
      }));
    }

    if (opportunity.leadSource === 'broker' || opportunity.channelName.includes('经纪')) {
      facts.push(buildFact({
        state,
        source: 'customer_opportunity',
        type: 'agent_lead_referral',
        caseId: caseItem.id,
        customerId: opportunity.customerId,
        opportunityId: opportunity.id,
        priority: 8 + priorityBoost,
        reason: `${opportunity.channelName} 有客户线索，需要先给同事明确卖点和业主节奏。`,
        senderRole: 'agent',
        senderName: opportunity.brokerName || '小刘',
        customerName: opportunity.customerName,
        price: Math.round(caseItem.askPrice),
        ...context,
        debugSignals: [`leadSource=${opportunity.leadSource}`, `channelName=${opportunity.channelName}`],
      }));
    }

    return facts;
  });
}

function extractManagerFacts(input: ExtractMyWechatFactsInput): WechatFact[] {
  const { state, dashboard } = input;
  const leadPriority = dashboard.todayPriority.find((entry) => entry.caseId && hasActiveCase(state, entry.caseId));
  const facts: WechatFact[] = [];

  if (leadPriority?.caseId) {
    const caseItem = state.cases.find((entry) => entry.id === leadPriority.caseId);
    if (caseItem) {
      facts.push(buildFact({
        state,
        source: 'manager_priority',
        type: 'manager_push_priority',
        caseId: caseItem.id,
        priority: 25 + 18 + (caseItem.isFocused ? 20 : 0) + riskScore(caseItem.urgency, 60),
        reason: `今日重点指向 ${caseItem.title}，需要先处理这套房的关键动作。`,
        senderRole: 'district_manager',
        senderName: '张经理',
        ownerName: caseItem.ownerName,
        ...getCaseContext(caseItem),
        debugSignals: [`todayPriority=${leadPriority.id}`],
      }));
    }
  }

  const riskCases = activeCases(state)
    .filter((caseItem) => caseItem.patience <= 45 || caseItem.trust <= 55 || caseItem.windowDays <= 7 || hasRivalPricePressure(state, caseItem))
    .sort((left, right) => scoreCaseRisk(right) - scoreCaseRisk(left))
    .slice(0, 2);

  riskCases.forEach((caseItem) => {
    facts.push(buildFact({
      state,
      source: 'manager_priority',
      type: 'manager_warn_risk',
      caseId: caseItem.id,
      priority: 18 + (dashboard.todayPriority.some((entry) => entry.caseId === caseItem.id) ? 25 : 0) + riskScore(scoreCaseRisk(caseItem), 120),
      reason: `${caseItem.title} 的业主或竞争风险已经靠前，今天要先稳住可解释的动作。`,
      senderRole: 'store_manager',
      senderName: '商圈经理',
      ownerName: caseItem.ownerName,
      ...getCaseContext(caseItem),
      debugSignals: [`riskScore=${scoreCaseRisk(caseItem)}`],
    }));
  });

  return facts;
}

function extractMarketIntelFacts(input: ExtractMyWechatFactsInput): WechatFact[] {
  const { state, marketIntel } = input;
  if (!marketIntel) return [];

  const validActiveCaseIds = new Set(activeCases(state).map((entry) => entry.id));
  const facts: WechatFact[] = [];

  marketIntel.items.forEach((item) => {
    const relatedCaseIds = item.affectedCaseIds.filter((caseId) => validActiveCaseIds.has(caseId)).slice(0, 4);
    if (relatedCaseIds.length === 0) return;
    const leadCase = state.cases.find((entry) => entry.id === relatedCaseIds[0]);
    if (!leadCase) return;

    const factType = resolveMarketFactType(item);
    facts.push(buildFact({
      state,
      source: 'market_intel',
      type: factType,
      caseId: leadCase.id,
      eventId: item.id,
      priority: 12 + (item.tone === 'risk' ? 18 : item.tone === 'chance' ? 10 : 4) + (item.layer === 'listing' ? 8 : 0),
      reason: `${item.title} 影响 ${relatedCaseIds.length} 套在场房源，来自市场情报层。`,
      senderRole: 'official_account',
      senderName: '市场情报',
      relatedCaseIds,
      caseTitle: leadCase.title,
      community: leadCase.community,
      district: leadCase.district,
      rivalTitle: item.title,
      debugSignals: [`layer=${item.layer}`, `tone=${item.tone}`, `intelId=${item.id}`],
    }));
  });

  const leadIntel = marketIntel.homepage.lead || marketIntel.items.find((item) => item.affectedCaseIds.length > 0);
  const methodCaseId = leadIntel?.affectedCaseIds.find((caseId) => validActiveCaseIds.has(caseId))
    || marketIntel.impactedCases.find((entry) => validActiveCaseIds.has(entry.caseId))?.caseId;
  const methodCase = methodCaseId ? state.cases.find((entry) => entry.id === methodCaseId) : null;

  if (leadIntel && methodCase) {
    facts.push(buildFact({
      state,
      source: 'market_intel',
      type: 'method_suggestion',
      caseId: methodCase.id,
      eventId: `${leadIntel.id}-method`,
      priority: 16,
      reason: `${leadIntel.title} 已经关联到 ${methodCase.title}，需要把市场事实翻译成业主沟通动作。`,
      senderRole: 'official_account',
      senderName: '平台经营建议',
      relatedCaseIds: [methodCase.id],
      caseTitle: methodCase.title,
      community: methodCase.community,
      district: methodCase.district,
      debugSignals: [`intelId=${leadIntel.id}`, 'method=owner-followup'],
    }));
  }

  return facts;
}

function extractMatterFacts(input: ExtractMyWechatFactsInput): WechatFact[] {
  const { state } = input;
  return state.matters
    .filter((matter) => matter.stage === 'pending')
    .flatMap((matter) => {
      const opportunity = resolveMatterOpportunity(state, matter);
      const caseId = matter.caseId || opportunity?.caseId;
      if (!caseId || !hasActiveCase(state, caseId)) return [];
      const caseItem = state.cases.find((entry) => entry.id === caseId);
      if (!caseItem) return [];

      return [buildFact({
        state,
        source: 'matter',
        type: 'matter_pending',
        caseId,
        customerId: opportunity?.customerId,
        opportunityId: opportunity?.id,
        matterId: matter.id,
        priority: 12 + Math.round(matter.urgency || 0) / 2 + (matter.openedAtDay < state.day ? 8 : 0),
        reason: `${matter.title} 仍待处理，事项绑定到 ${caseItem.title}。`,
        senderRole: 'store_manager',
        senderName: matter.kind === 'opportunity' ? '张经理' : '商圈经理',
        ownerName: caseItem.ownerName,
        customerName: opportunity?.customerName,
        ...getCaseContext(caseItem),
        debugSignals: [`matterStage=${matter.stage}`, `matterUrgency=${matter.urgency || 0}`],
      })];
    });
}

export function extractFactsFromEventStore(eventStore: DomainEventEntry[], state: GameState): WechatFact[] {
  return eventStore
    .filter((event) => event.day >= state.day - 1)
    .filter((event) => Boolean(event.caseId || event.opportunityId))
    .filter((event) => mentionsAny(event, ['跟进', '反馈', '价格', '客户', '业主', '风险', '流失', '带看']))
    .flatMap((event) => {
      const opportunity = event.opportunityId
        ? state.opportunities.find((entry) => entry.id === event.opportunityId)
        : undefined;
      const caseId = event.caseId || opportunity?.caseId;
      if (!caseId || !hasActiveCase(state, caseId)) return [];
      const caseItem = state.cases.find((entry) => entry.id === caseId);
      if (!caseItem) return [];

      return [buildFact({
        state,
        source: event.kind === 'action_executed' ? 'action_result' : 'event_store',
        type: 'event_followup_needed',
        caseId,
        customerId: event.customerId || opportunity?.customerId,
        opportunityId: event.opportunityId,
        eventId: event.id,
        priority: 10 + (event.tone === 'danger' ? 10 : event.tone === 'success' ? 4 : 0),
        reason: `${event.title || event.actor} 已经发生，需要今天补一次可交代的跟进。`,
        senderRole: event.opportunityId ? 'customer' : 'store_manager',
        senderName: opportunity?.customerName || '商圈经理',
        ownerName: caseItem.ownerName,
        customerName: opportunity?.customerName,
        ...getCaseContext(caseItem),
        debugSignals: [`eventKind=${event.kind}`, `eventTone=${event.tone}`],
      })];
    });
}

function buildFact(args: Omit<WechatFact, 'id' | 'day'> & { state: GameState }): WechatFact {
  const { state, ...fact } = args;
  return {
    ...fact,
    id: buildWechatFactId({
      source: fact.source,
      type: fact.type,
      caseId: fact.caseId,
      customerId: fact.customerId,
      opportunityId: fact.opportunityId,
      matterId: fact.matterId,
      eventId: fact.eventId,
      day: state.day,
    }),
    day: state.day,
  };
}

export function buildWechatFactId(input: {
  source: WechatFactSource;
  type: WechatFactType;
  caseId?: string;
  customerId?: string;
  opportunityId?: string;
  matterId?: string;
  eventId?: string;
  day: number;
}) {
  return [
    'wechat-fact',
    input.source,
    input.type,
    input.caseId ?? 'none',
    input.customerId ?? 'none',
    input.opportunityId ?? 'none',
    input.matterId ?? 'none',
    input.eventId ?? 'none',
    input.day,
  ].join(':');
}

function activeCases(state: GameState) {
  return state.cases.filter((caseItem) => caseItem.status === 'active');
}

function hasActiveCase(state: GameState, caseId: string) {
  return state.cases.some((caseItem) => caseItem.id === caseId && caseItem.status === 'active');
}

function resolveLeadCaseId(state: GameState, dashboard: DashboardProjection) {
  return dashboard.todayPriority.find((entry) => entry.caseId)?.caseId
    || activeCases(state).find((caseItem) => caseItem.isFocused)?.id
    || activeCases(state).sort((left, right) => scoreCaseRisk(right) - scoreCaseRisk(left))[0]?.id
    || null;
}

function getCasePriorityBoost(
  caseItem: Case,
  leadCaseId: string | null,
  todayPriorityCaseIds: Set<string | undefined>,
) {
  return (caseItem.id === leadCaseId ? 30 : 0) + (todayPriorityCaseIds.has(caseItem.id) ? 25 : 0);
}

function getCaseContext(caseItem: Case) {
  return {
    caseTitle: caseItem.title,
    community: caseItem.community,
    district: caseItem.district,
  };
}

function getOpportunityContext(caseItem: Case, opportunity: Opportunity) {
  return {
    caseTitle: caseItem.title,
    community: caseItem.community,
    district: caseItem.district,
    customerName: opportunity.customerName,
  };
}

function riskScore(value: number, threshold: number) {
  return Math.max(0, Math.round(value - threshold));
}

function scoreCaseRisk(caseItem: Case) {
  return Math.max(0, 80 - caseItem.patience)
    + Math.max(0, 80 - caseItem.trust)
    + Math.max(0, caseItem.urgency - 50)
    + Math.max(0, 10 - caseItem.windowDays) * 4
    + Math.max(0, caseItem.priceGapPct) * 2
    + Math.max(0, 58 - caseItem.heat);
}

function hasOwnerContactToday(state: GameState, caseId: string) {
  return state.todayPlan?.playerItems?.some((entry) => (
    entry.day === state.day
    && entry.linkedCaseId === caseId
    && entry.linkedActionId.includes('owner')
  )) || state.eventStore.some((event) => (
    event.day === state.day
    && event.caseId === caseId
    && mentionsAny(event, ['业主', '反馈', '面访'])
  ));
}

function hasShowingFeedback(state: GameState, caseId: string) {
  return state.eventStore.some((event) => (
    event.day >= state.day - 2
    && event.caseId === caseId
    && mentionsAny(event, ['带看', '看房', '反馈', '复看'])
  ));
}

function getRecentCaseEvents(state: GameState, caseId: string) {
  return state.eventStore.filter((event) => event.caseId === caseId && event.day >= state.day - 2);
}

function hasRivalPricePressure(state: GameState, caseItem: Case) {
  return state.marketShadow?.rivalListings?.some((listing) => (
    listing.status === 'active'
    && (listing.linkedCaseId === caseItem.id || listing.marketCellId === caseItem.marketCellId || listing.district === caseItem.district)
    && (listing.askPrice < caseItem.askPrice || listing.ownerAnchorPower >= 58 || listing.leadSiphonPower >= 62)
  )) || false;
}

function getLeadRivalListing(state: GameState, caseItem: Case) {
  return [...(state.marketShadow?.rivalListings || [])]
    .filter((listing) => listing.status === 'active')
    .filter((listing) => listing.linkedCaseId === caseItem.id || listing.marketCellId === caseItem.marketCellId || listing.district === caseItem.district)
    .sort((left, right) => right.leadSiphonPower - left.leadSiphonPower)[0];
}

function resolveMatterOpportunity(state: GameState, matter: MatterEntry) {
  return state.opportunities.find((opportunity) => opportunity.id === matter.sourceKey)
    || state.opportunities.find((opportunity) => matter.sourceKey.includes(opportunity.id))
    || undefined;
}

function resolveMarketFactType(item: MarketIntelProjection['items'][number]): WechatFactType {
  if (item.layer === 'listing' || item.layer === 'competition' || item.tone === 'risk') {
    return 'market_competition_risk';
  }
  if (item.title.includes('新增') || item.title.includes('供给') || item.summary.includes('同户型') || item.summary.includes('挂牌')) {
    return 'community_supply_change';
  }
  return 'market_demand_change';
}

function mentionsAny(
  value: Pick<DomainEventEntry, 'actor' | 'title' | 'detail'> | DomainEventEntry,
  keywords: string[],
) {
  const text = `${value.actor || ''} ${value.title || ''} ${value.detail || ''}`;
  return keywords.some((keyword) => text.includes(keyword));
}
