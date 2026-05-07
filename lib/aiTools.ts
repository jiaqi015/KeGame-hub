import type {AiCapabilityWorkspace, AiGuardrailId} from './aiInvocationContracts.js';

export type AiToolId =
  | 'context.read_pack'
  | 'open_day.score_preview'
  | 'selling_houses.proposal_review'
  | 'artifact.draft'
  | 'handoff.request';

export type AiToolKind = 'mcp_tool' | 'domain_tool' | 'runtime_tool' | 'handoff_tool';
export type AiToolRiskLevel = 'low' | 'medium' | 'high';
export type AiToolExecution = 'disabled' | 'read_only' | 'proposal_only' | 'server_approved';

export interface AiToolDefinition {
  id: AiToolId;
  name: string;
  kind: AiToolKind;
  description: string;
  workspaces: AiCapabilityWorkspace[];
  execution: AiToolExecution;
  riskLevel: AiToolRiskLevel;
  guardrailIds: AiGuardrailId[];
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
}

export const AI_TOOLS: AiToolDefinition[] = [
  {
    id: 'context.read_pack',
    name: '读取上下文包',
    kind: 'runtime_tool',
    description: '读取服务端预先压缩、脱敏、授权过的业务上下文包。',
    workspaces: ['global', 'sabrina', 'open-day', 'selling-houses'],
    execution: 'read_only',
    riskLevel: 'low',
    guardrailIds: ['input_scope', 'domain_boundary'],
    inputSchema: {
      type: 'object',
      properties: {
        workspace: {type: 'string'},
        contextPackId: {type: 'string'},
      },
      required: ['workspace', 'contextPackId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        facts: {type: 'array', items: {type: 'string'}},
        sourceRefs: {type: 'array', items: {type: 'string'}},
      },
    },
  },
  {
    id: 'open_day.score_preview',
    name: '开放日测算预览',
    kind: 'domain_tool',
    description: '对已授权的开放日参数包产生只读测算预览，供模型解释或生成建议。',
    workspaces: ['open-day'],
    execution: 'server_approved',
    riskLevel: 'medium',
    guardrailIds: ['domain_boundary', 'server_tool_allowlist', 'human_approval_required'],
    inputSchema: {
      type: 'object',
      properties: {
        scenarioId: {type: 'string'},
        parameterPatch: {type: 'object'},
      },
      required: ['scenarioId'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        rankedCandidates: {type: 'array'},
        changedMetrics: {type: 'array'},
      },
    },
  },
  {
    id: 'selling_houses.proposal_review',
    name: '资产顾问 proposal 校验',
    kind: 'domain_tool',
    description: '校验模型生成的经营建议是否越过领域事实、动作边界或状态写入边界。',
    workspaces: ['selling-houses'],
    execution: 'server_approved',
    riskLevel: 'medium',
    guardrailIds: ['domain_boundary', 'fact_grounding', 'proposal_only', 'server_tool_allowlist'],
    inputSchema: {
      type: 'object',
      properties: {
        runId: {type: 'string'},
        proposal: {type: 'object'},
      },
      required: ['proposal'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        accepted: {type: 'boolean'},
        issues: {type: 'array', items: {type: 'string'}},
      },
    },
  },
  {
    id: 'artifact.draft',
    name: '草稿产物',
    kind: 'runtime_tool',
    description: '把模型输出包装成草稿产物，等待用户确认；不直接落库为业务事实。',
    workspaces: ['global', 'sabrina', 'open-day', 'selling-houses'],
    execution: 'proposal_only',
    riskLevel: 'low',
    guardrailIds: ['proposal_only', 'human_approval_required'],
    inputSchema: {
      type: 'object',
      properties: {
        title: {type: 'string'},
        body: {type: 'string'},
        format: {type: 'string'},
      },
      required: ['title', 'body'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        draftId: {type: 'string'},
        status: {type: 'string'},
      },
    },
  },
  {
    id: 'handoff.request',
    name: '子 Agent 交接请求',
    kind: 'handoff_tool',
    description: '表达“应该转交给哪个专长 agent”的意图；当前仅生成交接计划，不自动启动子 agent。',
    workspaces: ['global', 'sabrina', 'open-day', 'selling-houses'],
    execution: 'proposal_only',
    riskLevel: 'low',
    guardrailIds: ['handoff_is_explicit', 'human_approval_required'],
    inputSchema: {
      type: 'object',
      properties: {
        targetAgentId: {type: 'string'},
        reason: {type: 'string'},
        compactContext: {type: 'string'},
      },
      required: ['targetAgentId', 'reason'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        acceptedForPlanning: {type: 'boolean'},
      },
    },
  },
];

export const AI_TOOL_MAP = new Map(AI_TOOLS.map((tool) => [tool.id, tool]));

export function getAiTool(toolId: string): AiToolDefinition | null {
  return AI_TOOL_MAP.get(toolId as AiToolId) || null;
}

export function listAiTools(workspace: AiCapabilityWorkspace = 'global'): AiToolDefinition[] {
  return AI_TOOLS.filter((tool) => (
    workspace === 'global'
      ? tool.workspaces.includes('global')
      : tool.workspaces.includes('global') || tool.workspaces.includes(workspace)
  ));
}
