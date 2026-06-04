export interface ParticipantSoul {
  readonly participantId: string;
  readonly ownerProfileLabel: string;
  readonly basePersonality: {
    readonly assertiveness: number;
    readonly patience: number;
    readonly trust倾向: number;
    readonly priceSensitivity: number;
  };
  readonly emotionalState: {
    trust: number;
    patience: number;
    urgency: number;
    mood: 'positive' | 'neutral' | 'negative';
  };
  readonly conversationHistory: readonly ConversationMemory[];
  readonly communicationPatterns: readonly CommunicationPattern[];
}

export interface ConversationMemory {
  readonly day: number;
  readonly playerText: string;
  readonly recipientReply: string;
  readonly trustDelta: number;
  readonly patienceDelta: number;
  readonly urgencyDelta: number;
  readonly intents: readonly string[];
  readonly risks: readonly string[];
}

export interface CommunicationPattern {
  readonly intent: string;
  readonly effectiveness: number;
  readonly lastUsed: number;
  readonly count: number;
}

export interface ParticipantSoulStore {
  readonly [participantId: string]: ParticipantSoul;
}
