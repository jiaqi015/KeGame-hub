import type {AIModel} from './models.js';
import type {AiAgentId} from './aiAgents.js';
import type {AiSkillId} from './aiSkills.js';
import type {AiToolId} from './aiTools.js';
import type {
  AiCapabilityKind,
  AiCapabilityWorkspace,
  AiExecutionMode,
  AiGuardrailId,
  AiOutputContract,
  AiToolPolicy,
} from './aiInvocationContracts.js';

export type {
  AiCapabilityKind,
  AiCapabilityWorkspace,
  AiExecutionMode,
  AiGuardrailId,
  AiOutputContract,
  AiToolPolicy,
} from './aiInvocationContracts.js';

export type AiCapabilityId =
  | 'general_reasoning'
  | 'code_analysis'
  | 'strategy_advice'
  | 'narrative_draft'
  | 'tool_orchestration';

export interface AiCapability {
  id: AiCapabilityId;
  name: string;
  kind: AiCapabilityKind;
  description: string;
  agentId: AiAgentId;
  defaultModelId: string;
  allowedModelIds: string[];
  skillIds: AiSkillId[];
  toolIds: AiToolId[];
  handoffTargets: AiAgentId[];
  guardrailIds: AiGuardrailId[];
  executionMode: AiExecutionMode;
  toolPolicy: AiToolPolicy;
  workspaces: AiCapabilityWorkspace[];
  supportsStreaming: boolean;
  supportsReasoning: boolean;
  supportsToolUse: boolean;
  outputContract: AiOutputContract;
  safetyBoundary: string;
}

export const AI_CAPABILITIES: AiCapability[] = [
  {
    id: 'general_reasoning',
    name: '通用推理',
    kind: 'llm',
    description: '面向复杂问答、长文本归纳、方案拆解的通用模型能力。',
    agentId: 'deepseek_core_agent',
    defaultModelId: 'deepseek-v4-pro',
    allowedModelIds: ['deepseek-v4-pro'],
    skillIds: ['project_context'],
    toolIds: [],
    handoffTargets: ['code_architect_agent', 'strategy_advisor_agent', 'narrative_editor_agent', 'tool_planner_agent'],
    guardrailIds: ['input_scope', 'fact_grounding'],
    executionMode: 'model_only',
    toolPolicy: 'no_tools',
    workspaces: ['global', 'sabrina', 'open-day', 'selling-houses'],
    supportsStreaming: true,
    supportsReasoning: true,
    supportsToolUse: false,
    outputContract: 'text',
    safetyBoundary: '只产出文本建议，不直接改业务状态。',
  },
  {
    id: 'code_analysis',
    name: '代码分析',
    kind: 'llm',
    description: '面向代码解释、缺陷定位、实现建议和工程方案评审。',
    agentId: 'code_architect_agent',
    defaultModelId: 'deepseek-v4-pro',
    allowedModelIds: ['deepseek-v4-pro'],
    skillIds: ['project_context', 'agent_architecture'],
    toolIds: ['artifact.draft'],
    handoffTargets: ['tool_planner_agent'],
    guardrailIds: ['input_scope', 'fact_grounding', 'proposal_only'],
    executionMode: 'agent_planning',
    toolPolicy: 'plan_only',
    workspaces: ['global'],
    supportsStreaming: true,
    supportsReasoning: true,
    supportsToolUse: false,
    outputContract: 'text',
    safetyBoundary: '只分析和建议；文件编辑仍由明确工程流程执行。',
  },
  {
    id: 'strategy_advice',
    name: '策略建议',
    kind: 'agent',
    description: '读取压缩后的业务上下文，给出经营、决策或下一步行动建议。',
    agentId: 'strategy_advisor_agent',
    defaultModelId: 'deepseek-v4-pro',
    allowedModelIds: ['deepseek-v4-pro'],
    skillIds: ['project_context', 'open_day_strategy', 'selling_houses_strategy'],
    toolIds: ['context.read_pack', 'open_day.score_preview', 'selling_houses.proposal_review', 'artifact.draft'],
    handoffTargets: ['narrative_editor_agent', 'tool_planner_agent'],
    guardrailIds: ['input_scope', 'domain_boundary', 'fact_grounding', 'proposal_only'],
    executionMode: 'agent_planning',
    toolPolicy: 'plan_only',
    workspaces: ['open-day', 'selling-houses'],
    supportsStreaming: true,
    supportsReasoning: true,
    supportsToolUse: false,
    outputContract: 'structured_proposal',
    safetyBoundary: '输出必须是建议或 proposal，不能直接写入领域事实或执行行动。',
  },
  {
    id: 'narrative_draft',
    name: '叙事草稿',
    kind: 'llm',
    description: '把结构化事实、事件和视角摘要改写成用户可读文案。',
    agentId: 'narrative_editor_agent',
    defaultModelId: 'deepseek-v4-pro',
    allowedModelIds: ['deepseek-v4-pro'],
    skillIds: ['project_context', 'fact_grounded_narrative'],
    toolIds: ['context.read_pack', 'artifact.draft'],
    handoffTargets: ['strategy_advisor_agent'],
    guardrailIds: ['input_scope', 'fact_grounding'],
    executionMode: 'agent_planning',
    toolPolicy: 'plan_only',
    workspaces: ['open-day', 'selling-houses'],
    supportsStreaming: true,
    supportsReasoning: true,
    supportsToolUse: false,
    outputContract: 'text',
    safetyBoundary: '只能基于输入事实写作，不能发明新业务事实。',
  },
  {
    id: 'tool_orchestration',
    name: '工具编排',
    kind: 'tool_use',
    description: '未来用于把模型输出约束为工具计划、技能调用或子任务分派。',
    agentId: 'tool_planner_agent',
    defaultModelId: 'deepseek-v4-pro',
    allowedModelIds: ['deepseek-v4-pro'],
    skillIds: ['project_context', 'agent_architecture', 'structured_tool_planning'],
    toolIds: [
      'context.read_pack',
      'open_day.score_preview',
      'selling_houses.proposal_review',
      'artifact.draft',
      'handoff.request',
    ],
    handoffTargets: ['code_architect_agent', 'strategy_advisor_agent', 'narrative_editor_agent'],
    guardrailIds: ['input_scope', 'domain_boundary', 'server_tool_allowlist', 'human_approval_required', 'handoff_is_explicit'],
    executionMode: 'tool_plan_proposal',
    toolPolicy: 'plan_only',
    workspaces: ['global'],
    supportsStreaming: false,
    supportsReasoning: true,
    supportsToolUse: true,
    outputContract: 'tool_plan',
    safetyBoundary: '先产出计划，工具执行必须由服务端白名单和业务权限再次校验。',
  },
];

export const AI_CAPABILITY_MAP = new Map(AI_CAPABILITIES.map((capability) => [capability.id, capability]));

export function getAiCapability(capabilityId: string): AiCapability | null {
  return AI_CAPABILITY_MAP.get(capabilityId as AiCapabilityId) || null;
}

export function listAiCapabilities(workspace: AiCapabilityWorkspace = 'global'): AiCapability[] {
  return AI_CAPABILITIES.filter((capability) => (
    workspace === 'global'
      ? capability.workspaces.includes('global')
      : capability.workspaces.includes('global') || capability.workspaces.includes(workspace)
  ));
}

export function isModelAllowedForCapability(capability: AiCapability, model: AIModel): boolean {
  return model.enabled && capability.allowedModelIds.includes(model.id);
}
