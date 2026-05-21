import type { AgentChannel, AgentExecutionMode } from './models.js';
import { resolveAgentToolManifest } from './toolRegistry.js';

export type CaseAgentToolPermission = 'read' | 'proposal' | 'forbidden';
export type CaseAgentHookPhase =
  | 'before_prompt'
  | 'before_agent'
  | 'before_settle'
  | 'after_settle'
  | 'after_turn';

export interface CaseAgentToolSpec {
  readonly toolId: string;
  readonly permission: CaseAgentToolPermission;
  readonly description: string;
  readonly toolsetId?: string;
}

export interface CaseAgentGuardHookSpec {
  readonly hookId: string;
  readonly phase: CaseAgentHookPhase;
  readonly description: string;
}

export interface CaseAgentOsRunPlan {
  readonly channel: AgentChannel;
  readonly mode: AgentExecutionMode;
  readonly contextPackRequired: boolean;
  readonly tools: readonly CaseAgentToolSpec[];
  readonly hooks: readonly CaseAgentGuardHookSpec[];
  readonly outputContract: readonly string[];
}

export const CASE_AGENT_OS_TOOLS: readonly CaseAgentToolSpec[] = Object.freeze(
  resolveAgentToolManifest({ channel: 'wechat', mode: 'hybrid' })
    .availableTools
    .concat(resolveAgentToolManifest({ channel: 'wechat', mode: 'hybrid' }).forbiddenTools)
    .map((tool) => Object.freeze({
      toolId: tool.toolId,
      permission: tool.permission === 'mutation' ? 'proposal' : tool.permission,
      description: tool.description,
      toolsetId: tool.toolsetId,
    } satisfies CaseAgentToolSpec)),
);

export const CASE_AGENT_OS_HOOKS: readonly CaseAgentGuardHookSpec[] = Object.freeze([
  {
    hookId: 'case-context-boundary',
    phase: 'before_prompt',
    description: '构建结构化 CaseContextPack，并过滤不可见事实。',
  },
  {
    hookId: 'dialogue-redline-guard',
    phase: 'before_agent',
    description: '识别辱骂、摆烂、威胁、过度承诺等红线输入。',
  },
  {
    hookId: 'proposal-fact-validator',
    phase: 'before_settle',
    description: '校验 proposal 没有编造成交、调价、出价、带看等未发生事实。',
  },
  {
    hookId: 'engine-settlement-only',
    phase: 'before_settle',
    description: '确保状态写入只走现有引擎结算。',
  },
  {
    hookId: 'memory-writeback',
    phase: 'after_settle',
    description: '把关系变化、未消化风险、下一步承诺写入 agent memory。',
  },
  {
    hookId: 'harness-observation',
    phase: 'after_turn',
    description: '生成可回放的 agent observation，支持 rule/LLM/shadow 对比。',
  },
]);

export function buildCaseAgentOsRunPlan(input: {
  readonly channel: AgentChannel;
  readonly mode?: AgentExecutionMode;
}): CaseAgentOsRunPlan {
  const mode = input.mode || 'hybrid';
  const toolManifest = resolveAgentToolManifest({ channel: input.channel, mode });
  const tools = toolManifest.availableTools
    .concat(toolManifest.forbiddenTools)
    .map((tool) => Object.freeze({
      toolId: tool.toolId,
      permission: tool.permission === 'mutation' ? 'proposal' : tool.permission,
      description: tool.description,
      toolsetId: tool.toolsetId,
    } satisfies CaseAgentToolSpec));
  return Object.freeze({
    channel: input.channel,
    mode,
    contextPackRequired: true,
    tools: Object.freeze(tools),
    hooks: CASE_AGENT_OS_HOOKS,
    outputContract: Object.freeze([
      'agent 输出 proposal，不输出世界事实。',
      'LLM proposal 必须经过 rule guard、validator 和 arbiter。',
      'GameState 写入只能发生在 domain/application settlement。',
      '每轮都要留下 trace、memory refs 和 visible refs。',
    ]),
  });
}
