export interface AiArrangementContextPack {
  readonly packId: string;
  readonly day: number;
  readonly currentSlot: 'am' | 'pm';
  readonly energy: {
    readonly remaining: number;
    readonly planned: number;
    readonly fixedReserve: number;
  };
  readonly slots: {
    readonly am: { readonly remainingCapacity: number; readonly fixedCount: number; readonly plannedCount: number };
    readonly pm: { readonly remainingCapacity: number; readonly fixedCount: number; readonly plannedCount: number };
  };
  readonly plannedItems: readonly VisibleArrangementItem[];
  readonly fixedItems: readonly VisibleArrangementItem[];
  readonly candidateItems: readonly VisibleArrangementItem[];
  readonly wechatSignals: readonly VisibleWechatSignal[];
  readonly marketSignals: readonly VisibleMarketSignal[];
  readonly constraints: readonly string[];
}

export interface VisibleArrangementItem {
  readonly itemId: string;
  readonly actionId: string;
  readonly caseId?: string;
  readonly customerId?: string;
  readonly opportunityId?: string;
  readonly slot?: 'am' | 'pm';
  readonly title: string;
  readonly detail: string;
  readonly energyCost: number;
  readonly durationHours: number;
  readonly rank?: number;
  readonly disabledReason?: string;
  readonly evidenceLabels?: readonly string[];
  readonly signalTrace?: readonly SignalTrace[];
  readonly riskLevel?: 'high' | 'medium' | 'low';
}

export interface SignalTrace {
  readonly source: 'wechat' | 'market' | 'case' | 'opportunity';
  readonly signal: string;
  readonly credibility: number;
  readonly receivedAt: string;
}

export interface NoDecisionModel {
  readonly posture: 'wait_observe' | 'stuck_conflicted' | 'blocked_resource' | 'no_candidates';
  readonly exitCondition: string;
  readonly accumulatedPressure: number;
  readonly nextReviewDay: number;
  readonly reason: string;
}

export interface VisibleWechatSignal {
  readonly messageId: string;
  readonly senderName: string;
  readonly senderRole: string;
  readonly content: string;
  readonly urgency: 'high' | 'medium' | 'low';
  readonly caseId?: string;
}

export interface VisibleMarketSignal {
  readonly signalId: string;
  readonly title: string;
  readonly message: string;
  readonly caseId?: string;
}
