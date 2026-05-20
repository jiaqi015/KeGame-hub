import type {
  AgentExecutionMode,
  AgentHarnessRunInput,
  AgentRuntimePack,
} from './models.js';

export function buildAgentRuntimePack<TContext>(
  input: AgentHarnessRunInput<TContext>,
): AgentRuntimePack<TContext> {
  const profile = input.adapter.resolveProfile(input.context);
  const perception = input.adapter.buildPerception(profile, input.context);
  const prompt = input.adapter.compilePrompt(profile, perception);
  return {
    profile,
    perception,
    prompt,
    mode: input.mode || inferAgentExecutionMode(input.adapter.channel),
  };
}

const RULE_CHANNELS: readonly string[] = ['daily_tick', 'market_reaction'];

function inferAgentExecutionMode(channel: string): AgentExecutionMode {
  return RULE_CHANNELS.includes(channel) ? 'rule' : 'hybrid';
}
