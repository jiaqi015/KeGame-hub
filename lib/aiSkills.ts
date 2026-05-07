import type {AiCapabilityWorkspace} from './aiInvocationContracts.js';
import type {AiToolId} from './aiTools.js';

export type AiSkillId =
  | 'project_context'
  | 'agent_architecture'
  | 'open_day_strategy'
  | 'selling_houses_strategy'
  | 'fact_grounded_narrative'
  | 'structured_tool_planning';

export interface AiSkillManifest {
  id: AiSkillId;
  name: string;
  description: string;
  trigger: string;
  instruction: string;
  workspaces: AiCapabilityWorkspace[];
  allowedToolIds: AiToolId[];
  resourceRefs: string[];
  scriptRefs: string[];
  source: 'registry' | 'skill_pack_compatible';
}

export const AI_SKILLS: AiSkillManifest[] = [
  {
    id: 'project_context',
    name: '项目上下文理解',
    description: '理解统一入口项目、三条业务线和本仓库的边界约束。',
    trigger: '当请求涉及项目内业务、架构、代码或文档时使用。',
    instruction: '先按仓库当前架构理解问题；不把多模型PK、开放日、资产顾问混成一个模块。',
    workspaces: ['global', 'sabrina', 'open-day', 'selling-houses'],
    allowedToolIds: ['context.read_pack'],
    resourceRefs: ['MEMORY.md', 'docs/project-memory/module-map.md', 'docs/project-memory/durable-decisions.md'],
    scriptRefs: [],
    source: 'skill_pack_compatible',
  },
  {
    id: 'agent_architecture',
    name: 'Agent 架构设计',
    description: '把模型、agent、subagent、tool、skill 和 trace 拆成可组合能力。',
    trigger: '当请求涉及 AI 底座、能力编排、工具调用或 agent 扩展时使用。',
    instruction: '优先输出稳定契约和最小可用运行时；避免把业务场景直接绑定到某个 provider。',
    workspaces: ['global', 'sabrina'],
    allowedToolIds: ['handoff.request', 'artifact.draft'],
    resourceRefs: ['docs/ai-capability-architecture.md'],
    scriptRefs: [],
    source: 'skill_pack_compatible',
  },
  {
    id: 'open_day_strategy',
    name: '开放日策略建议',
    description: '围绕开放日候选小区、参数包和测算结果生成策略建议。',
    trigger: '当请求涉及开放日选址、候选小区排序、参数调整和方案解释时使用。',
    instruction: '基于输入的测算事实提出建议；如果事实不足，明确列出需要的上下文，不补造数据。',
    workspaces: ['open-day'],
    allowedToolIds: ['context.read_pack', 'open_day.score_preview', 'artifact.draft'],
    resourceRefs: ['docs/open-day-ddd-architecture.md', 'docs/open-day-dba-sop.md'],
    scriptRefs: [],
    source: 'skill_pack_compatible',
  },
  {
    id: 'selling_houses_strategy',
    name: '资产顾问经营策略',
    description: '围绕业主画像、房源阶段、好房分和事项推进生成经营建议。',
    trigger: '当请求涉及我是王牌资产顾问的行动建议、复盘和经营判断时使用。',
    instruction: '只生成 proposal，不直接改变领域状态；建议必须能回到已给出的业务事实。',
    workspaces: ['selling-houses'],
    allowedToolIds: ['context.read_pack', 'selling_houses.proposal_review', 'artifact.draft'],
    resourceRefs: ['docs/selling-houses-master.md', 'docs/selling-houses-business-facts.md'],
    scriptRefs: [],
    source: 'skill_pack_compatible',
  },
  {
    id: 'fact_grounded_narrative',
    name: '事实约束叙事',
    description: '把结构化事实改写成清楚、克制、可读的业务文本。',
    trigger: '当请求是总结、复盘、说明、文案或用户可读解释时使用。',
    instruction: '只能使用输入事实和明确给出的上下文；不要编造数字、状态、结论来源或人物动机。',
    workspaces: ['global', 'open-day', 'selling-houses'],
    allowedToolIds: ['context.read_pack', 'artifact.draft'],
    resourceRefs: [],
    scriptRefs: [],
    source: 'skill_pack_compatible',
  },
  {
    id: 'structured_tool_planning',
    name: '结构化工具计划',
    description: '把需求拆成可审批、可追踪、可白名单校验的工具调用计划。',
    trigger: '当请求需要工具编排、agent 交接、自动化或未来执行能力时使用。',
    instruction: '先产出计划，不声称已经执行工具；每一步必须包含工具 id、输入、预期输出和审批需求。',
    workspaces: ['global', 'sabrina', 'open-day', 'selling-houses'],
    allowedToolIds: [
      'context.read_pack',
      'open_day.score_preview',
      'selling_houses.proposal_review',
      'artifact.draft',
      'handoff.request',
    ],
    resourceRefs: ['docs/ai-capability-architecture.md'],
    scriptRefs: [],
    source: 'skill_pack_compatible',
  },
];

export const AI_SKILL_MAP = new Map(AI_SKILLS.map((skill) => [skill.id, skill]));

export function getAiSkill(skillId: string): AiSkillManifest | null {
  return AI_SKILL_MAP.get(skillId as AiSkillId) || null;
}

export function listAiSkills(workspace: AiCapabilityWorkspace = 'global'): AiSkillManifest[] {
  return AI_SKILLS.filter((skill) => (
    workspace === 'global'
      ? skill.workspaces.includes('global')
      : skill.workspaces.includes('global') || skill.workspaces.includes(workspace)
  ));
}
