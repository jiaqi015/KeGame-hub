import type { DecisionMomentDefinition } from './types.js';

export const DECISION_MOMENTS: DecisionMomentDefinition[] = [
  {
    id: 'first-visit-owner-discovery',
    name: '首次面访 / 业主发现',
    summary: '接手房源后确认业主预期、授权边界、价格弹性和基础经营共识。',
    primaryActors: ['advisor', 'owner'],
    triggerActionIds: ['first-visit'],
    expectedSignals: ['trust', 'patience', 'd3', 'windowDays'],
    downstreamFlowIds: ['standard-selling'],
  },
  {
    id: 'pricing-strategy-adjustment',
    name: '价格策略 / 调整',
    summary: '当竞争、客户反馈或窗口期变化指向价格主矛盾时，推进心理价和挂牌价讨论。',
    primaryActors: ['advisor', 'owner', 'market'],
    triggerActionIds: ['pricing-advice', 'ask-psychological-price', 'adjust-listing-price'],
    expectedSignals: ['trust', 'd3', 'competitiveness', 'askPrice', 'heat'],
    downstreamFlowIds: ['standard-selling', 'sincerity-sale'],
  },
  {
    id: 'open-day-participation',
    name: '开放日参与',
    summary: '判断房源、业主和社区热度是否适合进入开放日产品链路。',
    primaryActors: ['advisor', 'owner', 'customer', 'broker'],
    triggerActionIds: ['open-day'],
    expectedSignals: ['heat', 'd1', 'trust', 'windowDays'],
    downstreamFlowIds: ['open-day'],
  },
  {
    id: 'sincerity-sale-entry',
    name: '诚意卖进入',
    summary: '在已有成熟客户或谈判基础时，确认业主是否愿意用隐藏价和诚意机制换确定性。',
    primaryActors: ['advisor', 'owner', 'customer'],
    triggerActionIds: ['sincerity-sale'],
    expectedSignals: ['intent', 'confidence', 'askPrice', 'trust'],
    downstreamFlowIds: ['sincerity-sale'],
  },
  {
    id: 'offer-acceptance-negotiation',
    name: '报价接受 / 斡旋',
    summary: '把快成交客户和业主拉到明确谈判桌，围绕报价、让步和成交速度做取舍。',
    primaryActors: ['advisor', 'owner', 'customer'],
    triggerActionIds: ['invite-customer-negotiation'],
    expectedSignals: ['intent', 'confidence', 'askPrice', 'trust'],
    downstreamFlowIds: ['standard-selling', 'sincerity-sale'],
  },
];

export const DECISION_MOMENT_BY_ID = Object.fromEntries(
  DECISION_MOMENTS.map((moment) => [moment.id, moment]),
) as Record<DecisionMomentDefinition['id'], DecisionMomentDefinition>;
