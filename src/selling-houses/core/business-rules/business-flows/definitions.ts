import type { BusinessFlowDefinition } from './types.js';

export const BUSINESS_FLOWS: BusinessFlowDefinition[] = [
  {
    id: 'standard-selling',
    name: '标准售卖',
    summary: '从首次面访、卖点经营、持续反馈到价格沟通和最终斡旋的基础房源经营链路。',
    scope: 'listing',
    entryActionIds: ['first-visit'],
    steps: [
      {
        id: 'owner-alignment',
        name: '业主对齐',
        summary: '建立信任、摸清预期，并持续反馈经营进展。',
        actionIds: ['first-visit', 'weekly-feedback', 'deep-diagnosis'],
        decisionMomentIds: ['first-visit-owner-discovery'],
      },
      {
        id: 'demand-generation',
        name: '需求生成',
        summary: '通过卖点、渠道和带看承接形成真实客户池。',
        actionIds: ['story', 'xiaohongshu-boost', 'broker-broadcast', 'private-referral', 'showing'],
      },
      {
        id: 'price-and-close',
        name: '价格与成交',
        summary: '围绕价格站位、心理价和客户报价进入成交推进。',
        actionIds: ['pricing-advice', 'ask-psychological-price', 'adjust-listing-price', 'invite-customer-negotiation'],
        decisionMomentIds: ['pricing-strategy-adjustment', 'offer-acceptance-negotiation'],
      },
    ],
  },
  {
    id: 'open-day',
    name: '开放日',
    summary: '以社区或重点房源为单位集中邀约、集中带看，并把活动热度转成后续转化动作。',
    scope: 'community',
    productType: 'open-day',
    entryActionIds: ['open-day'],
    steps: [
      {
        id: 'owner-signup',
        name: '业主报名',
        summary: '确认业主授权、活动目标和参与边界。',
        actionIds: ['open-day'],
        decisionMomentIds: ['open-day-participation'],
      },
      {
        id: 'audience-building',
        name: '客群邀约',
        summary: '组织客户、经纪人和私域邀约，把到访结构做厚。',
        actionIds: ['xiaohongshu-boost', 'broker-broadcast', 'private-referral'],
      },
      {
        id: 'event-conversion',
        name: '活动转化',
        summary: '集中带看后反馈业主，并推进调价、二带或出价。',
        actionIds: ['showing', 'weekly-feedback', 'pricing-advice', 'invite-customer-negotiation'],
      },
    ],
  },
  {
    id: 'sincerity-sale',
    name: '诚意卖',
    summary: '用隐藏成交价和诚意机制把成熟客户推进到更确定的成交窗口。',
    scope: 'listing',
    productType: 'sincere-sale',
    entryActionIds: ['sincerity-sale'],
    steps: [
      {
        id: 'owner-entry',
        name: '进入授权',
        summary: '说服业主接受诚意卖机制，并确认价格边界。',
        actionIds: ['sincerity-sale', 'ask-psychological-price'],
        decisionMomentIds: ['sincerity-sale-entry'],
      },
      {
        id: 'hidden-price',
        name: '隐藏价策略',
        summary: '明确隐藏价和可谈空间，统一对外谈判口径。',
        actionIds: ['pricing-advice', 'adjust-listing-price'],
      },
      {
        id: 'bid-settlement',
        name: '报价结算',
        summary: '跟进报价、组织谈判，并在成交或回落普通经营后复盘。',
        actionIds: ['invite-customer-negotiation', 'weekly-feedback'],
        decisionMomentIds: ['offer-acceptance-negotiation'],
      },
    ],
  },
  {
    id: 'team-listing-co-sell',
    name: '团队房源 / 合作售卖',
    summary: '轻量描述同店、合作经纪人或团队资源协作时的房源经营边界。',
    scope: 'team',
    entryActionIds: ['broker-broadcast', 'focus-meeting-submit'],
    steps: [
      {
        id: 'resource-routing',
        name: '资源路由',
        summary: '判断房源是否值得进入团队重点、合作经纪人或周四聚焦会。',
        actionIds: ['broker-broadcast', 'focus-meeting-submit'],
      },
      {
        id: 'feedback-loop',
        name: '协作反馈',
        summary: '把团队带来的客户、竞品和报价信息回传到业主经营。',
        actionIds: ['weekly-feedback', 'deep-diagnosis', 'pricing-advice'],
      },
    ],
  },
];

export const BUSINESS_FLOW_BY_ID = Object.fromEntries(
  BUSINESS_FLOWS.map((flow) => [flow.id, flow]),
) as Record<BusinessFlowDefinition['id'], BusinessFlowDefinition>;
