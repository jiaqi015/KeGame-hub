export type WechatSenderRole =
  | 'owner'
  | 'customer'
  | 'district_manager'
  | 'store_manager'
  | 'agent'
  | 'official_account'
  | 'system';

export type WechatMessageUrgency = 'low' | 'medium' | 'high';

export type WechatFactSource =
  | 'case'
  | 'owner_state'
  | 'customer_opportunity'
  | 'manager_priority'
  | 'market_intel'
  | 'matter'
  | 'event_store'
  | 'daily_tick'
  | 'action_result';

export type WechatFactType =
  | 'owner_no_showing'
  | 'owner_price_doubt'
  | 'owner_urgent'
  | 'owner_trust_drop'
  | 'owner_long_time_no_touch'
  | 'customer_comparing'
  | 'customer_price_sensitive'
  | 'customer_second_showing'
  | 'customer_churn_risk'
  | 'manager_push_priority'
  | 'manager_warn_risk'
  | 'agent_lead_referral'
  | 'market_competition_risk'
  | 'market_demand_change'
  | 'community_supply_change'
  | 'method_suggestion'
  | 'matter_pending'
  | 'event_followup_needed';

export interface WechatFact {
  id: string;
  type: WechatFactType;
  source: WechatFactSource;
  day: number;
  priority: number;
  reason: string;
  caseId?: string;
  customerId?: string;
  opportunityId?: string;
  matterId?: string;
  eventId?: string;
  senderRole?: WechatSenderRole;
  senderName?: string;
  ownerName?: string;
  customerName?: string;
  caseTitle?: string;
  community?: string;
  district?: string;
  price?: number;
  rivalTitle?: string;
  relatedCaseIds?: string[];
  debugSignals?: string[];
}

export interface WechatSourceTrace {
  source: WechatFactSource;
  factType: WechatFactType;
  caseId?: string;
  customerId?: string;
  opportunityId?: string;
  matterId?: string;
  eventId?: string;
  reason: string;
}

export interface WechatMessage {
  id: string;
  senderName: string;
  senderRole: WechatSenderRole;
  avatarLabel: string;
  content: string;
  preview: string;
  timeLabel: string;
  unread: boolean;
  urgency: WechatMessageUrgency;
  targetCaseId?: string;
  targetCaseTitle?: string;
  targetCustomerId?: string;
  targetOpportunityId?: string;
  targetMatterId?: string;
  primaryActionId?: string;
  primaryCtaLabel?: string;
  sourceTrace: WechatSourceTrace;
}

export interface OfficialAccountArticle {
  id: string;
  accountName: string;
  title: string;
  summary: string;
  preview: string;
  timeLabel: string;
  tag: 'market' | 'district' | 'community' | 'competitor' | 'policy' | 'method';
  tone: 'risk' | 'chance' | 'neutral';
  relatedCaseIds: string[];
  primaryCtaLabel?: string;
  sourceTrace: WechatSourceTrace;
}

export interface MyWechatProjection {
  messages: WechatMessage[];
  officialAccounts: OfficialAccountArticle[];
  unreadCount: number;
  leadCaseMessageId?: string;
  emptyState?: { title: string; description: string };
}
