import type { AgentMemoryFact } from '../agents/models.js';

/**
 * WeChat Conversation v0 — pure contracts for player-operated dialogue.
 *
 * Conversation text is not simulation truth. A dialogue turn becomes gameplay
 * only after it is settled into a bounded ConversationReceipt.
 */

export type ConversationSceneType =
  | 'owner_wechat'
  | 'customer_wechat'
  | 'manager_wechat'
  | 'broker_wechat';

export type ConversationSenderRole =
  | 'owner'
  | 'customer'
  | 'district_manager'
  | 'store_manager'
  | 'agent'
  | 'official_account'
  | 'system';

export type ConversationIntentKind =
  | 'reassure'
  | 'present_market_evidence'
  | 'propose_face_visit'
  | 'discuss_price'
  | 'secure_price_adjustment'
  | 'promise_feedback'
  | 'follow_customer'
  | 'align_manager'
  | 'overpromise'
  | 'unclear';

export type ConversationRiskKind =
  | 'none'
  | 'overpromise'
  | 'empty_comfort'
  | 'price_pressure_too_fast'
  | 'missing_next_step'
  | 'ignores_customer';

export type ConversationNextStepKind =
  | 'schedule_face_visit'
  | 'review_price'
  | 'prepare_competition_comparison'
  | 'follow_customer'
  | 'confirm_price_adjustment'
  | 'open_case'
  | 'none';

export interface ConversationSceneCaseContext {
  readonly caseId: string;
  readonly title: string;
  readonly ownerName: string;
  readonly district: string;
  readonly community: string;
  readonly askPrice: number;
  readonly marketPrice: number;
  readonly priceGapPct: number;
  readonly trust: number;
  readonly patience: number;
  readonly urgency: number;
  readonly heat: number;
  readonly competitiveness: number;
  readonly hasCompletedFirstVisit: boolean;
  readonly ownerProfileLabel: string;
}

export interface ConversationSceneSourceMessage {
  readonly messageId: string;
  readonly senderName: string;
  readonly senderRole: ConversationSenderRole | string;
  readonly content: string;
  readonly timeLabel: string;
  readonly urgency: string;
  readonly primaryCtaLabel?: string;
}

export interface ConversationSceneInputPack {
  readonly sceneId: string;
  readonly runId: string;
  readonly day: number;
  readonly conversationKey: string;
  readonly sourceMessageId: string;
  readonly sceneType: ConversationSceneType;
  readonly playerText: string;
  readonly sourceMessage: ConversationSceneSourceMessage;
  readonly caseContext?: ConversationSceneCaseContext;
  readonly opportunityContext?: {
    readonly opportunityId: string;
    readonly customerName: string;
    readonly stage: string;
    readonly intent: number;
    readonly confidence: number;
  };
  readonly agentMemory?: readonly AgentMemoryFact[];
  readonly recentTurns: readonly {
    readonly playerText: string;
    readonly recipientReply: string;
    readonly summary: string;
  }[];
}

export interface ConversationNextStepDraft {
  readonly kind: ConversationNextStepKind;
  readonly actionId?: string;
  readonly label: string;
  readonly reason: string;
  readonly priority: 'urgent' | 'high' | 'medium' | 'low';
}

export interface ConversationEffectProposal {
  readonly summary: string;
  readonly recipientReply: string;
  readonly intentKinds: readonly ConversationIntentKind[];
  readonly riskKinds: readonly ConversationRiskKind[];
  readonly evidenceUse: 'none' | 'mentioned' | 'specific';
  readonly trustDelta?: number;
  readonly patienceDelta?: number;
  readonly urgencyDelta?: number;
  readonly priceFlexibilityDelta?: number;
  readonly customerIntentDelta?: number;
  readonly customerConfidenceDelta?: number;
  readonly nextStep?: ConversationNextStepDraft;
  readonly confidence: number;
}

export interface ConversationEffectSettlement {
  readonly trustDelta: number;
  readonly patienceDelta: number;
  readonly urgencyDelta: number;
  readonly priceFlexibilityDelta: number;
  readonly customerIntentDelta: number;
  readonly customerConfidenceDelta: number;
  readonly askPriceBefore?: number;
  readonly askPriceAfter?: number;
  readonly effectLabels: readonly string[];
}

export interface ConversationTraceSnapshot {
  readonly acceptedSource: 'rule' | 'llm' | 'fallback';
  readonly ruleConfidence: number;
  readonly llmConfidence: number | null;
  readonly pressure: readonly string[];
  readonly uncertainty: readonly string[];
  readonly memoryFactCount: number;
  readonly contextSignalCount: number;
  readonly arbiterDecision: string;
  readonly validationNotes: readonly string[];
  readonly rejectedReasons: readonly string[];
}

export interface ConversationReceipt {
  readonly receiptId: string;
  readonly conversationKey: string;
  readonly sourceMessageId: string;
  readonly day: number;
  readonly turnIndex: number;
  readonly sceneType: ConversationSceneType;
  readonly targetCaseId?: string;
  readonly targetOpportunityId?: string;
  readonly actorName: string;
  readonly actorRole: string;
  readonly playerText: string;
  readonly recipientReply: string;
  readonly summary: string;
  readonly proposal: ConversationEffectProposal;
  readonly settlement: ConversationEffectSettlement;
  readonly nextSteps: readonly ConversationNextStepDraft[];
  readonly source: 'ai' | 'fallback';
  readonly traceSnapshot?: ConversationTraceSnapshot;
}
