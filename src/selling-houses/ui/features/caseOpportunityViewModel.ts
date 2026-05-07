import type {
  Case,
  CustomerCaseRuntime,
  CustomerProfile,
  CustomerRuntimeState,
  GameState,
  Opportunity,
} from '../../domain/models.js';

export type OpportunityEngagementBand = 'met' | 'contacted' | 'potential';

export interface OpportunityViewModel {
  opportunity: Opportunity;
  caseItem?: Case;
  customer?: CustomerProfile;
  customerState?: CustomerRuntimeState;
  runtime?: CustomerCaseRuntime;
  engagementBand: OpportunityEngagementBand;
  hasViewed: boolean;
  profileLine: string;
  profileDetail: string;
  customerStatusLabel: string;
  customerStatusDetail: string;
  opportunityStatusLabel: string;
  opportunityStatusDetail: string;
  urgencyLabel: string;
  relationshipFact: string;
  nextStep: string;
  stageTrail: string;
  competitorSummary?: string;
}

export function buildOpportunityViewModels(
  state: GameState,
  opportunities: Opportunity[],
): OpportunityViewModel[] {
  return opportunities
    .map((opportunity) => buildOpportunityViewModel(state, opportunity))
    .sort((left, right) => scoreOpportunityViewModel(right) - scoreOpportunityViewModel(left));
}

export function formatOpportunityDaysLeft(daysLeft: number) {
  const value = Number.isFinite(daysLeft) ? Math.max(0, daysLeft) : 0;
  if (value < 1) return '不足 1 天';
  const rounded = Math.round(value);
  if (Math.abs(value - rounded) < 0.001) return `${rounded} 天`;
  return `约 ${Math.ceil(value)} 天`;
}

export function buildOpportunityViewModel(
  state: GameState,
  opportunity: Opportunity,
): OpportunityViewModel {
  const caseItem = state.cases.find((entry) => entry.id === opportunity.caseId);
  const customer = state.customers.find((entry) => entry.id === opportunity.customerId);
  const customerState = state.customerStates.find((entry) => entry.customerId === opportunity.customerId);
  const runtime = customerState?.caseStates[opportunity.caseId];
  const hasViewed = opportunity.visibility !== 'shadow' && Boolean(runtime?.viewed || opportunity.stageIndex >= 2);
  const engagementBand: OpportunityEngagementBand = opportunity.visibility === 'shadow'
    ? 'potential'
    : hasViewed
      ? 'met'
      : 'contacted';

  return {
    opportunity,
    caseItem,
    customer,
    customerState,
    runtime,
    engagementBand,
    hasViewed,
    profileLine: deriveProfileLine(customer, opportunity, caseItem),
    profileDetail: deriveProfileDetail(customer, opportunity),
    customerStatusLabel: deriveCustomerStatusLabel(customerState, opportunity),
    customerStatusDetail: deriveCustomerStatusDetail(customerState, opportunity, runtime),
    opportunityStatusLabel: deriveOpportunityStatusLabel(opportunity, engagementBand),
    opportunityStatusDetail: deriveOpportunityStatusDetail(opportunity, customerState, runtime, caseItem, engagementBand),
    urgencyLabel: deriveUrgencyLabel(opportunity, customerState),
    relationshipFact: deriveRelationshipFact(opportunity, customerState, runtime, caseItem),
    nextStep: deriveNextStep(opportunity, customerState, runtime),
    stageTrail: deriveStageTrail(opportunity),
    competitorSummary: deriveCompetitorSummary(state, runtime),
  };
}

function scoreOpportunityViewModel(model: OpportunityViewModel) {
  const engagementScore = model.engagementBand === 'met' ? 300 : model.engagementBand === 'contacted' ? 180 : 60;
  const stageScore = model.opportunity.stageIndex * 35;
  const urgencyScore = Math.max(0, 80 - model.opportunity.daysLeft * 12);
  const riskScore = (model.customerState?.churnRisk || 0) >= 60 ? 40 : 0;
  const intentScore = model.opportunity.intent * 0.4;

  return engagementScore + stageScore + urgencyScore + riskScore + intentScore;
}

function deriveProfileLine(
  customer: CustomerProfile | undefined,
  opportunity: Opportunity,
  caseItem?: Case,
) {
  if (customer) {
    const layouts = customer.layouts?.length ? customer.layouts.slice(0, 2).join('/') : '户型待核实';
    return `预算 ${customer.budgetMin}-${customer.budgetMax} 万 · ${customer.targetDistrict} · ${layouts}`;
  }

  if (opportunity.visibility === 'shadow') {
    return `预算上限 ${opportunity.budgetMax} 万 · ${caseItem?.district || '所在片区'} · ${opportunity.channelName}`;
  }

  return `预算上限 ${opportunity.budgetMax} 万 · ${caseItem?.district || '片区待核实'}`;
}

function deriveProfileDetail(
  customer: CustomerProfile | undefined,
  opportunity: Opportunity,
) {
  if (customer?.profile) {
    return customer.profile;
  }

  if (opportunity.visibility === 'shadow') {
    return opportunity.profile
      ? `${opportunity.profile}，但还没接上真人。`
      : '还只是潜在人群，预算、意愿都没核实。';
  }

  return opportunity.profile || '需求还在摸底。';
}

function deriveCustomerStatusLabel(
  customerState: CustomerRuntimeState | undefined,
  opportunity: Opportunity,
) {
  if (opportunity.visibility === 'shadow') return '还只是人群信号';
  if (!customerState) return '状态待补';
  if (customerState.churnRisk >= 60) return '客户正在往外滑';

  const labels: Record<CustomerRuntimeState['status'], string> = {
    idle: '还没进入明确决策',
    browsing: '还在看盘摸底',
    comparing: '拿同类盘比较中',
    engaged: '已经在持续沟通',
    negotiating: '进入价格沟通',
    lost: '已经流失',
    converted: '已经成交',
  };

  return labels[customerState.status];
}

function deriveCustomerStatusDetail(
  customerState: CustomerRuntimeState | undefined,
  opportunity: Opportunity,
  runtime?: CustomerCaseRuntime,
) {
  if (opportunity.visibility === 'shadow') {
    return '还没形成真人客户，仍需接触和核实。';
  }

  if (!customerState) {
    return '已经接上话，但客户的整体状态还没有摸清。';
  }

  if (customerState.churnRisk >= 60) {
    return customerState.lastActionNote
      ? `最近一次明显变化是：${customerState.lastActionNote}`
      : '最近跟进偏弱，或者被同类房分走了注意力。';
  }

  if (customerState.status === 'comparing') {
    return '客户在比较价格、位置和房子条件。';
  }

  if (customerState.status === 'negotiating') {
    return '客户在确认价格、时机和成交确定性。';
  }

  if (runtime?.selected) {
    return '这套房仍在客户优先选择里，别断跟进。';
  }

  if ((customerState.fatigue || 0) >= 60) {
    return '客户看房累，沟通要聚焦。';
  }

  return '客户还在往前走，需要更具体的推进理由。';
}

function deriveOpportunityStatusLabel(
  opportunity: Opportunity,
  engagementBand: OpportunityEngagementBand,
) {
  if (engagementBand === 'potential') return '潜在人群信号';
  if (engagementBand === 'met') return `已见面 · ${opportunity.stageLabel}`;
  return `咨询过 · ${opportunity.stageLabel}`;
}

function deriveOpportunityStatusDetail(
  opportunity: Opportunity,
  customerState: CustomerRuntimeState | undefined,
  runtime: CustomerCaseRuntime | undefined,
  caseItem: Case | undefined,
  engagementBand: OpportunityEngagementBand,
) {
  if (engagementBand === 'potential') {
    return '别当已在跟的机会，只能说明这类客户对这套房有兴趣。';
  }

  if (engagementBand === 'contacted') {
    return opportunity.stageIndex >= 1
      ? '已经有明确接触，但还没形成现场感受。'
      : '刚接上话，真实需求还需要再确认一轮。';
  }

  if ((customerState?.churnRisk || 0) >= 60 || opportunity.daysLeft <= 2) {
    return '已经进入掉线风险区，再不推进，这次见面留下的意向也会回落。';
  }

  if (opportunity.stageIndex >= 4) {
    return '已经快成交了，现在重点不再是讲卖点，而是把价格和确定性谈拢。';
  }

  if (runtime?.selected) {
    return `${caseItem?.title || '这套房'} 见完面后还站在客户心里前排，可以继续往复看或报价推。`;
  }

  return '已经有现场反馈，接下来要把喜欢和犹豫点讲清楚。';
}

function deriveUrgencyLabel(
  opportunity: Opportunity,
  customerState: CustomerRuntimeState | undefined,
) {
  const daysLeftLabel = formatOpportunityDaysLeft(opportunity.daysLeft);
  if (opportunity.visibility === 'shadow') return `${daysLeftLabel}内不接，这波人群会散`;
  if ((customerState?.churnRisk || 0) >= 60) return `${daysLeftLabel}内不跟，客户很容易流失`;
  if (opportunity.stageIndex >= 4) return `${daysLeftLabel}内要把价格谈实`;
  if (opportunity.stageIndex >= 2) return `${daysLeftLabel}内要接住看房热度`;
  return `${daysLeftLabel}内要推进到见面`;
}

function deriveCompetitorSummary(state: GameState, runtime?: CustomerCaseRuntime) {
  const competitors = (runtime?.competingCaseIds || [])
    .map((competitorId) => (
      state.marketShadow?.rivalListings?.find((entry) => entry.id === competitorId)?.title
      || state.cases.find((entry) => entry.id === competitorId)?.title
    ))
    .filter(Boolean)
    .slice(0, 2);

  return competitors.length > 0 ? competitors.join('、') : undefined;
}

function deriveRelationshipFact(
  opportunity: Opportunity,
  customerState: CustomerRuntimeState | undefined,
  runtime: CustomerCaseRuntime | undefined,
  caseItem: Case | undefined,
) {
  if (opportunity.visibility === 'shadow') {
    return `这组信号还没形成真人客户，当前更多是在看 ${caseItem?.title || '这套房'} 对哪类人有吸引力。`;
  }
  if (!customerState) {
    return '已经接上，但客户状态还不稳定。';
  }
  if (customerState.churnRisk >= 60) {
    return '这位客户最近在往外滑，当前关系处在容易断联的边缘。';
  }
  if (runtime?.selected) {
    return '这套房目前还在客户优先列表里。';
  }
  if (customerState.status === 'comparing') {
    return '客户在做同类盘比较，关系还不够稳。';
  }
  if (customerState.status === 'negotiating') {
    return '客户已进入实质价格沟通阶段。';
  }
  return '客户关系还在推进中，需要持续给出明确理由。';
}

function deriveNextStep(
  opportunity: Opportunity,
  customerState: CustomerRuntimeState | undefined,
  runtime: CustomerCaseRuntime | undefined,
) {
  if (opportunity.visibility === 'shadow') return '先接上真人，再核实预算、决策人和看房时间。';
  if ((customerState?.churnRisk || 0) >= 60) return '需要一次明确回访，稳住机会。';
  if (opportunity.stageIndex >= 4 || customerState?.status === 'negotiating') return '集中推进报价和谈判细节，争取尽快落到成交动作。';
  if (runtime?.viewed || opportunity.stageIndex >= 2) return '已有看房反馈，复看或报价意向会更清楚。';
  return '聊过需求，还没形成看房记录。';
}

function deriveStageTrail(opportunity: Opportunity) {
  const trail = opportunity.history
    .slice(-3)
    .map((entry) => `${entry.day}天:${entry.stage}`);
  return trail.length > 0 ? trail.join(' → ') : '阶段记录待补';
}
