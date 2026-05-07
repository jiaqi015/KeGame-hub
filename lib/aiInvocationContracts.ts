export type AiCapabilityKind = 'llm' | 'agent' | 'subagent' | 'tool_use' | 'skill';
export type AiCapabilityWorkspace = 'global' | 'sabrina' | 'open-day' | 'selling-houses';
export type AiOutputContract = 'text' | 'structured_proposal' | 'tool_plan';

export type AiExecutionMode =
  | 'model_only'
  | 'agent_planning'
  | 'tool_plan_proposal'
  | 'server_tool_execution';

export type AiToolPolicy =
  | 'no_tools'
  | 'plan_only'
  | 'read_only'
  | 'server_approved';

export type AiGuardrailId =
  | 'input_scope'
  | 'domain_boundary'
  | 'fact_grounding'
  | 'proposal_only'
  | 'server_tool_allowlist'
  | 'human_approval_required'
  | 'handoff_is_explicit';

export interface AiInvocationTraceEvent {
  at: string;
  type:
    | 'capability_resolved'
    | 'agent_resolved'
    | 'skills_loaded'
    | 'tools_exposed'
    | 'model_called'
    | 'completed'
    | 'failed';
  message: string;
}

export interface AiInvocationReceipt {
  id: string;
  capabilityId: string;
  agentId?: string;
  modelId: string;
  executionMode: AiExecutionMode;
  toolPolicy: AiToolPolicy;
  skillIds: string[];
  toolIds: string[];
  handoffTargets: string[];
  guardrailIds: AiGuardrailId[];
  startedAt: string;
  completedAt?: string;
  trace: AiInvocationTraceEvent[];
}
