import type { AgentChannel, AgentExecutionMode } from './models.js';

export type AgentToolPermission = 'read' | 'proposal' | 'mutation' | 'forbidden';

export type AgentToolsetId =
  | 'case-read'
  | 'world-read'
  | 'memory-read'
  | 'action-read'
  | 'dialogue-proposal'
  | 'action-proposal'
  | 'scenario-simulation'
  | 'world-engine'
  | 'state-mutation-forbidden';

export interface AgentToolDefinition {
  readonly toolId: string;
  readonly toolsetId: AgentToolsetId;
  readonly permission: AgentToolPermission;
  readonly description: string;
  readonly channels: readonly AgentChannel[];
}

export interface AgentToolManifest {
  readonly channel: AgentChannel;
  readonly mode: AgentExecutionMode;
  readonly enabledToolsets: readonly AgentToolsetId[];
  readonly disabledToolsets: readonly AgentToolsetId[];
  readonly availableTools: readonly AgentToolDefinition[];
  readonly forbiddenTools: readonly AgentToolDefinition[];
  readonly promptLines: readonly string[];
}

export interface AgentToolReferenceValidation {
  readonly ok: boolean;
  readonly unknownToolIds: readonly string[];
}

export const DEFAULT_AGENT_TOOL_DEFINITIONS: readonly AgentToolDefinition[] = Object.freeze([
  {
    toolId: 'case.getFullContext',
    toolsetId: 'case-read',
    permission: 'read',
    description: '读取单套房的房源、业主、客户、竞品、市场、记忆和可用动作上下文。',
    channels: ['wechat', 'face_visit', 'open_day', 'sincere_sale', 'focus_meeting', 'market_reaction'],
  },
  {
    toolId: 'world.getRecentEvents',
    toolsetId: 'world-read',
    permission: 'read',
    description: '读取与当前 case、matter 或市场单元相关的最近世界事件。',
    channels: ['wechat', 'face_visit', 'open_day', 'sincere_sale', 'focus_meeting', 'daily_tick', 'market_reaction'],
  },
  {
    toolId: 'memory.retrieve',
    toolsetId: 'memory-read',
    permission: 'read',
    description: '按 actorId、caseId、conversationKey 召回人物记忆、承诺和未消化风险。',
    channels: ['wechat', 'face_visit', 'open_day', 'sincere_sale', 'focus_meeting', 'daily_tick', 'market_reaction'],
  },
  {
    toolId: 'action.listAvailable',
    toolsetId: 'action-read',
    permission: 'read',
    description: '列出当前能做的业务动作及前置条件。',
    channels: ['wechat', 'face_visit', 'open_day', 'sincere_sale', 'focus_meeting', 'market_reaction'],
  },
  {
    toolId: 'dialogue.proposeEffect',
    toolsetId: 'dialogue-proposal',
    permission: 'proposal',
    description: '输出对话效果 proposal，包括意图、风险、角色回复、状态 delta 和下一步。',
    channels: ['wechat'],
  },
  {
    toolId: 'action.proposeNextStep',
    toolsetId: 'action-proposal',
    permission: 'proposal',
    description: '输出下一步动作 proposal，不直接执行。',
    channels: ['wechat', 'face_visit', 'open_day', 'sincere_sale', 'focus_meeting', 'market_reaction'],
  },
  {
    toolId: 'scenario.simulateTopic',
    toolsetId: 'scenario-simulation',
    permission: 'proposal',
    description: '模拟开放日、诚意卖、聚焦会、面访等业务话题的角色反应和风险。',
    channels: ['face_visit', 'open_day', 'sincere_sale', 'focus_meeting'],
  },
  {
    toolId: 'world.proposeTickEvents',
    toolsetId: 'world-engine',
    permission: 'proposal',
    description: '为日推进、市场波动、竞对行为输出可裁决的世界事件 proposal。',
    channels: ['daily_tick', 'market_reaction'],
  },
  {
    toolId: 'state.writeDirectly',
    toolsetId: 'state-mutation-forbidden',
    permission: 'forbidden',
    description: '禁止 agent 直接改 GameState。',
    channels: ['wechat', 'face_visit', 'open_day', 'sincere_sale', 'focus_meeting', 'daily_tick', 'market_reaction'],
  },
  {
    toolId: 'price.changeDirectly',
    toolsetId: 'state-mutation-forbidden',
    permission: 'forbidden',
    description: '禁止 agent 绕过动作和结算直接改挂牌价。',
    channels: ['wechat', 'face_visit', 'open_day', 'sincere_sale', 'focus_meeting', 'daily_tick', 'market_reaction'],
  },
  {
    toolId: 'deal.closeDirectly',
    toolsetId: 'state-mutation-forbidden',
    permission: 'forbidden',
    description: '禁止 agent 编造或直接关闭成交。',
    channels: ['wechat', 'face_visit', 'open_day', 'sincere_sale', 'focus_meeting', 'daily_tick', 'market_reaction'],
  },
]);

const DEFAULT_TOOLSETS_BY_CHANNEL: Record<AgentChannel, readonly AgentToolsetId[]> = {
  wechat: ['case-read', 'world-read', 'memory-read', 'action-read', 'dialogue-proposal', 'action-proposal'],
  face_visit: ['case-read', 'world-read', 'memory-read', 'action-read', 'action-proposal', 'scenario-simulation'],
  open_day: ['case-read', 'world-read', 'memory-read', 'action-read', 'action-proposal', 'scenario-simulation'],
  sincere_sale: ['case-read', 'world-read', 'memory-read', 'action-read', 'action-proposal', 'scenario-simulation'],
  focus_meeting: ['case-read', 'world-read', 'memory-read', 'action-read', 'action-proposal', 'scenario-simulation'],
  daily_tick: ['world-read', 'memory-read', 'world-engine'],
  market_reaction: ['case-read', 'world-read', 'memory-read', 'action-read', 'action-proposal', 'world-engine'],
};

export function resolveAgentToolManifest(input: {
  readonly channel: AgentChannel;
  readonly mode: AgentExecutionMode;
  readonly enabledToolsets?: readonly AgentToolsetId[];
  readonly disabledToolsets?: readonly AgentToolsetId[];
  readonly definitions?: readonly AgentToolDefinition[];
}): AgentToolManifest {
  const definitions = input.definitions || DEFAULT_AGENT_TOOL_DEFINITIONS;
  const disabled = new Set(input.disabledToolsets || []);
  const enabled = uniqueToolsets(input.enabledToolsets || DEFAULT_TOOLSETS_BY_CHANNEL[input.channel])
    .filter((toolset) => !disabled.has(toolset));
  const enabledSet = new Set(enabled);
  const channelTools = definitions.filter((tool) => tool.channels.includes(input.channel));
  const availableTools = channelTools
    .filter((tool) => tool.permission !== 'forbidden')
    .filter((tool) => enabledSet.has(tool.toolsetId));
  const forbiddenTools = channelTools.filter((tool) => tool.permission === 'forbidden');

  return Object.freeze({
    channel: input.channel,
    mode: input.mode,
    enabledToolsets: Object.freeze(enabled),
    disabledToolsets: Object.freeze([...(input.disabledToolsets || [])]),
    availableTools: Object.freeze(availableTools),
    forbiddenTools: Object.freeze(forbiddenTools),
    promptLines: Object.freeze(buildToolManifestPromptLines(availableTools, forbiddenTools)),
  });
}

export function validateAgentPromptToolReferences(input: {
  readonly manifest: AgentToolManifest;
  readonly referencedToolIds: readonly string[];
}): AgentToolReferenceValidation {
  const knownToolIds = new Set([
    ...input.manifest.availableTools.map((tool) => tool.toolId),
    ...input.manifest.forbiddenTools.map((tool) => tool.toolId),
  ]);
  const unknownToolIds = input.referencedToolIds.filter((toolId) => !knownToolIds.has(toolId));
  return Object.freeze({
    ok: unknownToolIds.length === 0,
    unknownToolIds: Object.freeze([...unknownToolIds]),
  });
}

function buildToolManifestPromptLines(
  availableTools: readonly AgentToolDefinition[],
  forbiddenTools: readonly AgentToolDefinition[],
): string[] {
  const toolsByToolset = groupByToolset(availableTools);
  const lines = Object.entries(toolsByToolset).map(([toolsetId, tools]) => (
    `可用工具 ${toolsetId}：${tools.map((tool) => `${tool.toolId}=${tool.description}`).join('；')}`
  ));
  if (forbiddenTools.length > 0) {
    lines.push(`禁止工具：${forbiddenTools.map((tool) => `${tool.toolId}=${tool.description}`).join('；')}`);
  }
  return lines;
}

function groupByToolset(tools: readonly AgentToolDefinition[]) {
  const groups: Partial<Record<AgentToolsetId, AgentToolDefinition[]>> = {};
  for (const tool of tools) {
    groups[tool.toolsetId] = [...(groups[tool.toolsetId] || []), tool];
  }
  return groups;
}

function uniqueToolsets(toolsets: readonly AgentToolsetId[]) {
  return [...new Set(toolsets)];
}
