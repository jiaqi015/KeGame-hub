import type { AgentMemoryFact } from './models.js';

export interface CaseAgentContextPack {
  readonly packId: string;
  readonly contextBudget: CaseAgentContextBudget;
  readonly caseIdentity: {
    readonly caseId: string;
    readonly title: string;
    readonly community: string;
    readonly district: string;
    readonly layout: string;
    readonly area?: number;
    readonly askPrice: number;
    readonly marketPrice: number;
    readonly bottomPrice?: number;
    readonly priceGapPct: number;
    readonly stageLabel?: string;
    readonly story?: string;
    readonly tags: readonly string[];
    readonly defects: readonly string[];
  };
  readonly currentWorld: {
    readonly day: number;
    readonly currentDate?: string;
    readonly todayTheme: string;
    readonly marketSignals: readonly CaseAgentMarketSignal[];
    readonly externalCompetitors: readonly CaseAgentCompetitor[];
    readonly activeCustomers: readonly CaseAgentCustomer[];
    readonly recentCausalEvents: readonly CaseAgentWorldEvent[];
  };
  readonly operatingContext: {
    readonly energyLeft: number;
    readonly maxEnergy: number;
    readonly todayPlannedActions: readonly CaseAgentPlannedAction[];
    readonly actionPressure: string;
  };
  readonly actorMind: {
    readonly actorId: string;
    readonly role: 'owner' | 'customer' | 'manager' | 'broker' | 'system';
    readonly name: string;
    readonly persona: string;
    readonly trust?: number;
    readonly patience?: number;
    readonly urgency?: number;
    readonly intent?: number;
    readonly confidence?: number;
    readonly emotionalState: string;
    readonly relationshipBoundary: string;
  };
  readonly dialogueSituation: {
    readonly sourceMessage: string;
    readonly playerText: string;
    readonly whyThisMessageAppeared: string;
    readonly expectedBusinessQuestion: string;
  };
  readonly memory: {
    readonly recentTurns: readonly {
      readonly playerText: string;
      readonly recipientReply: string;
      readonly summary: string;
    }[];
    readonly conversationHistory: readonly CaseAgentConversationHistoryEntry[];
    readonly semanticFacts: readonly AgentMemoryFact[];
    readonly recentCaseActions: readonly CaseAgentRecentAction[];
    readonly unresolvedRisks: readonly string[];
    readonly promisesNotYetFulfilled: readonly string[];
  };
  readonly visibleBoundary: {
    readonly canKnow: readonly string[];
    readonly cannotKnow: readonly string[];
  };
  readonly availableActions: readonly CaseAgentAvailableAction[];
  readonly settlementContract: {
    readonly allowedDeltas: readonly string[];
    readonly deltaBounds: Record<string, readonly [number, number]>;
    readonly hardRules: readonly string[];
  };
}

export interface CaseAgentContextBudget {
  readonly marketSignals: CaseAgentSectionBudget;
  readonly externalCompetitors: CaseAgentSectionBudget;
  readonly activeCustomers: CaseAgentSectionBudget;
  readonly recentCausalEvents: CaseAgentSectionBudget;
  readonly recentCaseActions: CaseAgentSectionBudget;
  readonly conversationHistory: CaseAgentSectionBudget;
  readonly semanticFacts: CaseAgentSectionBudget;
  readonly recentTurns: CaseAgentSectionBudget;
  readonly isCompacted: boolean;
  readonly summary: string;
}

export interface CaseAgentSectionBudget {
  readonly total: number;
  readonly kept: number;
  readonly truncated: number;
}

export interface CaseAgentMarketSignal {
  readonly signalId: string;
  readonly title: string;
  readonly message: string;
  readonly confidence?: number;
  readonly source: string;
}

export interface CaseAgentCompetitor {
  readonly listingId: string;
  readonly title: string;
  readonly district: string;
  readonly askPrice: number;
  readonly heat: number;
  readonly daysLeft?: number;
  readonly source: string;
}

export interface CaseAgentCustomer {
  readonly opportunityId: string;
  readonly customerId: string;
  readonly customerName: string;
  readonly stage: string;
  readonly intent: number;
  readonly confidence: number;
  readonly budgetMax?: number;
  readonly priceSensitivity?: number;
  readonly budgetRange?: string;
  readonly priceSensitivityLevel?: string;
}

export interface CaseAgentWorldEvent {
  readonly eventId: string;
  readonly day: number;
  readonly summary: string;
  readonly source: string;
}

export interface CaseAgentAvailableAction {
  readonly actionId: string;
  readonly label: string;
  readonly preconditions: readonly string[];
  readonly expectedEffect: string;
}

export interface CaseAgentPlannedAction {
  readonly itemId: string;
  readonly actionId: string;
  readonly status: string;
  readonly slot?: string;
}

export interface CaseAgentRecentAction {
  readonly receiptId: string;
  readonly day: number;
  readonly actionId: string;
  readonly outcome: string;
  readonly summary: string;
  readonly fieldDeltas: readonly string[];
}

export interface CaseAgentConversationHistoryEntry {
  readonly receiptId: string;
  readonly day: number;
  readonly turnIndex: number;
  readonly source: 'ai' | 'fallback';
  readonly playerText: string;
  readonly recipientReply: string;
  readonly summary: string;
}
