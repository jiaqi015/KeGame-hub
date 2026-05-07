import type {
  AiCapabilityWorkspace,
  AiExecutionMode,
  AiGuardrailId,
  AiOutputContract,
  AiToolPolicy,
} from './aiInvocationContracts.js';
import type {AiSkillId} from './aiSkills.js';
import type {AiToolId} from './aiTools.js';

export type AiAgentId =
  | 'deepseek_core_agent'
  | 'code_architect_agent'
  | 'strategy_advisor_agent'
  | 'narrative_editor_agent'
  | 'tool_planner_agent';

export type AiAgentRole = 'agent' | 'subagent';

export interface AiAgentDefinition {
  id: AiAgentId;
  name: string;
  role: AiAgentRole;
  description: string;
  workspaces: AiCapabilityWorkspace[];
  defaultModelId: string;
  allowedModelIds: string[];
  instruction: string;
  skillIds: AiSkillId[];
  toolIds: AiToolId[];
  handoffTargets: AiAgentId[];
  inputGuardrailIds: AiGuardrailId[];
  outputGuardrailIds: AiGuardrailId[];
  executionMode: AiExecutionMode;
  toolPolicy: AiToolPolicy;
  outputContract: AiOutputContract;
  traceEnabled: boolean;
}

const DEEPSEEK_PRO_ONLY = ['deepseek-v4-pro'];

export const AI_AGENTS: AiAgentDefinition[] = [
  {
    id: 'deepseek_core_agent',
    name: 'DeepSeek Pro 核心助手',
    role: 'agent',
    description: '项目默认高能力通用 agent，负责复杂问答、总结、拆解和轻量规划。',
    workspaces: ['global', 'sabrina', 'open-day', 'selling-houses'],
    defaultModelId: 'deepseek-v4-pro',
    allowedModelIds: DEEPSEEK_PRO_ONLY,
    instruction: '你是项目的默认高能力 AI 层。保持结论清楚，必要时指出缺失上下文；不要直接执行工具或改写业务状态。',
    skillIds: ['project_context'],
    toolIds: [],
    handoffTargets: ['code_architect_agent', 'strategy_advisor_agent', 'narrative_editor_agent', 'tool_planner_agent'],
    inputGuardrailIds: ['input_scope'],
    outputGuardrailIds: ['fact_grounding'],
    executionMode: 'model_only',
    toolPolicy: 'no_tools',
    outputContract: 'text',
    traceEnabled: true,
  },
  {
    id: 'code_architect_agent',
    name: '代码与架构子 Agent',
    role: 'subagent',
    description: '负责代码分析、架构拆解、缺陷定位和实现方案评审。',
    workspaces: ['global', 'sabrina'],
    defaultModelId: 'deepseek-v4-pro',
    allowedModelIds: DEEPSEEK_PRO_ONLY,
    instruction: '用工程视角分析代码与架构，优先识别边界、风险、契约和验证路径。不要假装已经读取未提供的文件。',
    skillIds: ['project_context', 'agent_architecture'],
    toolIds: ['artifact.draft'],
    handoffTargets: ['tool_planner_agent'],
    inputGuardrailIds: ['input_scope'],
    outputGuardrailIds: ['fact_grounding', 'proposal_only'],
    executionMode: 'agent_planning',
    toolPolicy: 'plan_only',
    outputContract: 'text',
    traceEnabled: true,
  },
  {
    id: 'strategy_advisor_agent',
    name: '业务策略 Agent',
    role: 'agent',
    description: '负责开放日和资产顾问的业务策略建议、方案解释和下一步 proposal。',
    workspaces: ['open-day', 'selling-houses'],
    defaultModelId: 'deepseek-v4-pro',
    allowedModelIds: DEEPSEEK_PRO_ONLY,
    instruction: '把业务上下文转成可执行建议，但输出必须停留在 proposal 层。事实不足时先声明假设和所需上下文。',
    skillIds: ['project_context', 'open_day_strategy', 'selling_houses_strategy'],
    toolIds: ['context.read_pack', 'open_day.score_preview', 'selling_houses.proposal_review', 'artifact.draft'],
    handoffTargets: ['narrative_editor_agent', 'tool_planner_agent'],
    inputGuardrailIds: ['input_scope', 'domain_boundary'],
    outputGuardrailIds: ['fact_grounding', 'proposal_only'],
    executionMode: 'agent_planning',
    toolPolicy: 'plan_only',
    outputContract: 'structured_proposal',
    traceEnabled: true,
  },
  {
    id: 'narrative_editor_agent',
    name: '叙事草稿子 Agent',
    role: 'subagent',
    description: '负责事实约束下的用户可读文案、复盘、说明和摘要。',
    workspaces: ['global', 'open-day', 'selling-houses'],
    defaultModelId: 'deepseek-v4-pro',
    allowedModelIds: DEEPSEEK_PRO_ONLY,
    instruction: '把输入事实写得更清楚、更像业务现场，但不能补造事实。优先保留可验证的数字、状态和因果限定。',
    skillIds: ['project_context', 'fact_grounded_narrative'],
    toolIds: ['context.read_pack', 'artifact.draft'],
    handoffTargets: ['strategy_advisor_agent'],
    inputGuardrailIds: ['input_scope'],
    outputGuardrailIds: ['fact_grounding'],
    executionMode: 'agent_planning',
    toolPolicy: 'plan_only',
    outputContract: 'text',
    traceEnabled: true,
  },
  {
    id: 'tool_planner_agent',
    name: '工具编排子 Agent',
    role: 'subagent',
    description: '负责把任务拆成工具、skill、handoff 或未来执行步骤的可审批计划。',
    workspaces: ['global', 'sabrina', 'open-day', 'selling-houses'],
    defaultModelId: 'deepseek-v4-pro',
    allowedModelIds: DEEPSEEK_PRO_ONLY,
    instruction: '只产出工具计划，不执行工具。每个计划步骤都必须说明为什么需要、输入是什么、是否需要人工确认。',
    skillIds: ['project_context', 'agent_architecture', 'structured_tool_planning'],
    toolIds: [
      'context.read_pack',
      'open_day.score_preview',
      'selling_houses.proposal_review',
      'artifact.draft',
      'handoff.request',
    ],
    handoffTargets: ['code_architect_agent', 'strategy_advisor_agent', 'narrative_editor_agent'],
    inputGuardrailIds: ['input_scope', 'domain_boundary'],
    outputGuardrailIds: ['server_tool_allowlist', 'human_approval_required', 'handoff_is_explicit'],
    executionMode: 'tool_plan_proposal',
    toolPolicy: 'plan_only',
    outputContract: 'tool_plan',
    traceEnabled: true,
  },
];

export const AI_AGENT_MAP = new Map(AI_AGENTS.map((agent) => [agent.id, agent]));

export function getAiAgent(agentId: string): AiAgentDefinition | null {
  return AI_AGENT_MAP.get(agentId as AiAgentId) || null;
}

export function listAiAgents(workspace: AiCapabilityWorkspace = 'global'): AiAgentDefinition[] {
  return AI_AGENTS.filter((agent) => (
    workspace === 'global'
      ? agent.workspaces.includes('global')
      : agent.workspaces.includes('global') || agent.workspaces.includes(workspace)
  ));
}
