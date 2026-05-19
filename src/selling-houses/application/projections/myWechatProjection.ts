import type { GameState } from '../../domain/models.js';
import type { MarketIntelProjection } from '../../ui/features/marketIntel.js';
import { buildMarketIntelProjection } from '../../ui/features/marketIntel.js';
import type { DashboardProjection, OperatingProjection } from './operatingProjection.js';
import { buildOperatingProjection } from './operatingProjection.js';
import { extractMyWechatFacts } from './myWechatFacts.js';
import { renderOfficialAccountArticle, renderWechatMessage } from './myWechatCopy.js';
import type {
  MyWechatProjection,
  OfficialAccountArticle,
  WechatFact,
  WechatMessage,
} from './myWechatTypes.js';
import type { ActorKnowledgeSnapshot } from '../../domain/world-model/actorKnowledgeTypes.js';

export function buildMyWechatProjection({
  state,
  dashboard,
  marketIntel,
  actorKnowledgeMap,
}: {
  state: GameState;
  dashboard?: DashboardProjection | OperatingProjection;
  marketIntel?: MarketIntelProjection;
  /** Optional actor knowledge map (caseId → ActorKnowledgeSnapshot) for evidence-backed facts. */
  actorKnowledgeMap?: Map<string, ActorKnowledgeSnapshot>;
}): MyWechatProjection {
  const resolvedDashboard = resolveDashboardProjection(state, dashboard);
  const resolvedMarketIntel = marketIntel || buildMarketIntelProjection(state);
  const activeCaseIds = new Set(state.cases.filter((caseItem) => caseItem.status === 'active').map((caseItem) => caseItem.id));

  if (activeCaseIds.size === 0) {
    return {
      messages: [],
      officialAccounts: [],
      unreadCount: 0,
      emptyState: {
        title: '今天没有新的微信消息',
        description: '当前没有在场房源，外部世界暂时没有需要你处理的人和情报。',
      },
    };
  }

  const facts = extractMyWechatFacts({
    state,
    dashboard: resolvedDashboard,
    marketIntel: resolvedMarketIntel,
    actorKnowledgeMap,
  }).filter((fact) => isValidFactTarget(fact, state));

  const officialFacts = facts
    .filter((fact) => fact.source === 'market_intel')
    .filter((fact) => fact.relatedCaseIds?.some((caseId) => activeCaseIds.has(caseId)) || (fact.caseId && activeCaseIds.has(fact.caseId)));
  const messageFacts = facts.filter((fact) => fact.source !== 'market_intel');

  const messages = attachConversationTurns(
    limitMessages(
      dedupeMessages(messageFacts)
        .sort((left, right) => compareFacts(left, right, state, resolvedDashboard))
        .map((fact) => renderWechatMessage(fact, { state }))
        .filter((message) => isValidMessageTarget(message, state)),
      state,
      resolvedDashboard,
    ),
    state,
  );

  const officialAccounts = limitOfficialAccounts(
    dedupeOfficialFacts(officialFacts)
      .sort((left, right) => compareFacts(left, right, state, resolvedDashboard))
      .map((fact) => renderOfficialAccountArticle(fact, { state }))
      .filter((article) => isValidArticleTarget(article, state))
      .filter(dedupeOfficialArticleContent()),
  );

  const leadCaseId = resolveLeadCaseId(state, resolvedDashboard);
  const leadCaseMessageId = messages.find((message) => message.targetCaseId === leadCaseId)?.id;

  return {
    messages,
    officialAccounts,
    unreadCount: messages.filter((message) => message.unread).length,
    leadCaseMessageId,
    emptyState: messages.length === 0 && officialAccounts.length === 0
      ? {
          title: '今天没有新的微信消息',
          description: '外部客户、业主和市场暂时没有新增动静，可以按今日安排推进。',
        }
      : undefined,
  };
}

function resolveDashboardProjection(state: GameState, dashboard?: DashboardProjection | OperatingProjection): DashboardProjection {
  if (dashboard && 'todayPriority' in dashboard) return dashboard;
  if (dashboard && 'dashboard' in dashboard) return dashboard.dashboard;
  return buildOperatingProjection(state).dashboard;
}

function compareFacts(left: WechatFact, right: WechatFact, state: GameState, dashboard: DashboardProjection) {
  const leftScore = scoreFactForSort(left, state, dashboard);
  const rightScore = scoreFactForSort(right, state, dashboard);
  if (leftScore !== rightScore) return rightScore - leftScore;
  return left.id.localeCompare(right.id);
}

function scoreFactForSort(fact: WechatFact, state: GameState, dashboard: DashboardProjection) {
  const leadCaseId = resolveLeadCaseId(state, dashboard);
  const todayPriorityCaseIds = new Set(dashboard.todayPriority.map((entry) => entry.caseId).filter(Boolean));
  const caseItem = fact.caseId ? state.cases.find((entry) => entry.id === fact.caseId) : undefined;
  const closedPenalty = caseItem && caseItem.status !== 'active' ? -80 : 0;
  const targetPenalty = !fact.caseId && !fact.opportunityId && !fact.matterId && fact.source !== 'market_intel' ? -40 : 0;
  const roleBalance = fact.type.startsWith('owner_') ? 9
    : fact.type === 'manager_push_priority' ? 7
      : fact.type.startsWith('customer_') ? 5
        : 0;

  return fact.priority
    + (fact.caseId && fact.caseId === leadCaseId ? 30 : 0)
    + (fact.caseId && todayPriorityCaseIds.has(fact.caseId) ? 25 : 0)
    + (fact.type === 'owner_urgent' ? 20 : 0)
    + (fact.type === 'manager_push_priority' ? 18 : 0)
    + (fact.type === 'customer_churn_risk' ? 15 : 0)
    + (fact.type === 'matter_pending' ? 12 : 0)
    + (fact.type === 'market_competition_risk' ? 12 : 0)
    + (fact.type === 'owner_long_time_no_touch' || fact.type === 'event_followup_needed' ? 10 : 0)
    + roleBalance
    + closedPenalty
    + targetPenalty;
}

function dedupeMessages(facts: WechatFact[]) {
  const ownerCaseCounts = new Map<string, number>();
  const customerOpportunityIds = new Set<string>();
  let managerPushCount = 0;
  const seen = new Set<string>();

  return facts.filter((fact) => {
    if (seen.has(fact.id)) return false;
    seen.add(fact.id);

    if (fact.type.startsWith('owner_') && fact.caseId) {
      const count = ownerCaseCounts.get(fact.caseId) || 0;
      if (count >= 2) return false;
      ownerCaseCounts.set(fact.caseId, count + 1);
    }

    if (fact.type.startsWith('customer_') && fact.opportunityId) {
      if (customerOpportunityIds.has(fact.opportunityId)) return false;
      customerOpportunityIds.add(fact.opportunityId);
    }

    if (fact.type === 'manager_push_priority') {
      managerPushCount += 1;
      if (managerPushCount > 1) return false;
    }

    return true;
  });
}

function dedupeOfficialFacts(facts: WechatFact[]) {
  const seenKeys = new Set<string>();
  return facts.filter((fact) => {
    const key = `${fact.type}-${fact.caseId || 'none'}-${(fact.relatedCaseIds || []).join(',')}`;
    if (seenKeys.has(key)) return false;
    seenKeys.add(key);
    return true;
  });
}

function limitMessages(messages: WechatMessage[], state: GameState, dashboard: DashboardProjection) {
  const leadCaseId = resolveLeadCaseId(state, dashboard);
  const selected: WechatMessage[] = [];

  const leadOwner = messages.find((message) => message.targetCaseId === leadCaseId && message.senderRole === 'owner');
  const managerPush = messages.find((message) => message.sourceTrace.factType === 'manager_push_priority');
  const customer = messages.find((message) => message.senderRole === 'customer');

  [leadOwner, managerPush, customer].forEach((message) => {
    if (message && !selected.some((entry) => entry.id === message.id)) selected.push(message);
  });

  messages.forEach((message) => {
    if (selected.length >= 8) return;
    if (!selected.some((entry) => entry.id === message.id)) selected.push(message);
  });

  return selected.slice(0, 8);
}

function limitOfficialAccounts(articles: OfficialAccountArticle[]) {
  return articles.slice(0, 5);
}

function attachConversationTurns(messages: WechatMessage[], state: GameState): WechatMessage[] {
  const receiptsByMessageId = new Map<string, NonNullable<WechatMessage['conversationTurns']>>();

  (state.wechatConversationHistory || []).forEach((receipt) => {
    const turns = receiptsByMessageId.get(receipt.sourceMessageId) || [];
    turns.push(receipt);
    receiptsByMessageId.set(receipt.sourceMessageId, turns);
  });

  if (receiptsByMessageId.size === 0) {
    return messages;
  }

  return messages.map((message) => {
    const conversationTurns = receiptsByMessageId.get(message.id);
    return conversationTurns?.length
      ? { ...message, conversationTurns }
      : message;
  });
}

function dedupeOfficialArticleContent() {
  const seen = new Set<string>();
  return (article: OfficialAccountArticle) => {
    const key = `${article.accountName}|${article.title}|${article.preview}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  };
}

function isValidFactTarget(fact: WechatFact, state: GameState) {
  if (fact.caseId && !state.cases.some((caseItem) => caseItem.id === fact.caseId)) return false;
  if (fact.opportunityId && !state.opportunities.some((opportunity) => opportunity.id === fact.opportunityId)) return false;
  if (fact.matterId && !state.matters.some((matter) => matter.id === fact.matterId)) return false;
  return true;
}

function isValidMessageTarget(message: WechatMessage, state: GameState) {
  if (!message.sourceTrace) return false;
  if (message.senderRole === 'owner' && !message.targetCaseId) return false;
  if (message.senderRole === 'customer' && !message.targetOpportunityId && !message.targetCaseId) return false;
  if (message.targetCaseId && !state.cases.some((caseItem) => caseItem.id === message.targetCaseId)) return false;
  if (message.targetOpportunityId && !state.opportunities.some((opportunity) => opportunity.id === message.targetOpportunityId)) return false;
  if (message.targetMatterId && !state.matters.some((matter) => matter.id === message.targetMatterId)) return false;
  return true;
}

function isValidArticleTarget(article: OfficialAccountArticle, state: GameState) {
  if (!article.sourceTrace) return false;
  const validCaseIds = new Set(state.cases.map((caseItem) => caseItem.id));
  return article.relatedCaseIds.length > 0 && article.relatedCaseIds.every((caseId) => validCaseIds.has(caseId));
}

function resolveLeadCaseId(state: GameState, dashboard: DashboardProjection) {
  return dashboard.todayPriority.find((entry) => entry.caseId)?.caseId
    || state.cases.find((caseItem) => caseItem.status === 'active' && caseItem.isFocused)?.id
    || state.cases.filter((caseItem) => caseItem.status === 'active')[0]?.id
    || null;
}
