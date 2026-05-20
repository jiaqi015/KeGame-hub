/**
 * Agent Harness v0 — shared contracts for world actors, matters, and systems.
 *
 * An agent is not necessarily a human or an LLM persona. It is any runtime unit
 * that can perceive bounded world context, apply policy, and emit a proposal /
 * expression / receipt candidate. Domain reducers still own final settlement.
 */

export type AgentKind =
  | 'human'
  | 'matter'
  | 'organization'
  | 'market_mechanism'
  | 'world_engine';

export type AgentExecutionMode = 'rule' | 'ai' | 'hybrid';

export const AGENT_CHANNELS = [
  'wechat',
  'face_visit',
  'open_day',
  'sincere_sale',
  'focus_meeting',
  'daily_tick',
  'market_reaction',
] as const;

export type AgentChannel = typeof AGENT_CHANNELS[number];

export interface AgentProfile {
  readonly agentId: string;
  readonly kind: AgentKind;
  readonly roleLabel: string;
  readonly soul: string;
  readonly goals: readonly string[];
  readonly traits: readonly string[];
  readonly boundaries: readonly string[];
  readonly speakingStyle: readonly string[];
}

export interface AgentMemoryFact {
  readonly factId: string;
  readonly agentId: string;
  readonly kind: string;
  readonly summary: string;
  readonly strength: number;
  readonly scope?: {
    readonly conversationKey?: string;
    readonly caseId?: string;
    readonly opportunityId?: string;
    readonly channel?: AgentChannel;
  };
  readonly createdAtDay?: number;
  readonly updatedAtDay?: number;
  readonly sourceRef?: {
    readonly refType: string;
    readonly refId: string;
  };
  readonly expiresAtDay?: number;
}

export interface AgentMemoryStore {
  readonly facts: readonly AgentMemoryFact[];
}

export interface AgentPerceptionPack<TContext = unknown> {
  readonly agentId: string;
  readonly channel: AgentChannel;
  readonly day: number;
  readonly visibleRefs: readonly string[];
  readonly context: TContext;
  readonly memory: readonly AgentMemoryFact[];
  readonly pressure: readonly string[];
  readonly uncertainty: readonly string[];
}

export interface AgentPromptPack {
  readonly systemLines: readonly string[];
  readonly contextLines: readonly string[];
  readonly outputContractLines: readonly string[];
}

export interface AgentRuntimePack<TContext = unknown> {
  readonly profile: AgentProfile;
  readonly perception: AgentPerceptionPack<TContext>;
  readonly mode: AgentExecutionMode;
  readonly prompt: AgentPromptPack;
}

export interface AgentHarnessAdapter<TContext = unknown> {
  readonly channel: AgentChannel;
  resolveProfile(context: TContext): AgentProfile;
  buildPerception(profile: AgentProfile, context: TContext): AgentPerceptionPack<TContext>;
  compilePrompt(profile: AgentProfile, perception: AgentPerceptionPack<TContext>): AgentPromptPack;
}

export interface AgentHarnessRunInput<TContext = unknown> {
  readonly adapter: AgentHarnessAdapter<TContext>;
  readonly context: TContext;
  readonly mode?: AgentExecutionMode;
}
