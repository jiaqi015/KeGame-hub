import {
  getAiCapability,
  isModelAllowedForCapability,
  type AiCapability,
  type AiCapabilityId,
  type AiCapabilityWorkspace,
} from './aiCapabilities.js';
import {getAiAgent} from './aiAgents.js';
import {
  getAiPlatformManifest,
  listAiPlatformCapabilities,
} from './aiPlatform.js';
import type {
  AiExecutionMode,
  AiInvocationReceipt,
  AiInvocationTraceEvent,
  AiToolPolicy,
} from './aiInvocationContracts.js';
import {MODEL_CONFIG_MAP} from './models.js';
import {callConfiguredModel, streamConfiguredModel, type CompareResult, type CompareStreamOptions} from './modelRuntime.js';

export interface AiCapabilityInvocationInput {
  capabilityId: AiCapabilityId | string;
  prompt: string;
  modelId?: string;
}

export interface AiCapabilityInvocationResult extends CompareResult {
  capabilityId: string;
  modelId: string;
  capability: Pick<AiCapability, 'id' | 'name' | 'kind' | 'outputContract' | 'safetyBoundary' | 'executionMode' | 'toolPolicy'>;
  receipt: AiInvocationReceipt;
}

export function getAvailableAiCapabilities(workspace: AiCapabilityWorkspace = 'global') {
  return listAiPlatformCapabilities(workspace).map((capability) => ({
    ...capability,
    availableModelIds: capability.allowedModelIds.filter((modelId) => MODEL_CONFIG_MAP.get(modelId)?.enabled),
  }));
}

export function getAiPlatformOverview(workspace: AiCapabilityWorkspace = 'global') {
  return getAiPlatformManifest(workspace);
}

function resolveCapabilityModel(capability: AiCapability, requestedModelId?: string) {
  const modelId = requestedModelId?.trim() || capability.defaultModelId;
  const model = MODEL_CONFIG_MAP.get(modelId);

  if (!model || !isModelAllowedForCapability(capability, model)) {
    return null;
  }

  return model;
}

function getUtcNow(): string {
  return new Date().toISOString();
}

function createInvocationId(capabilityId: string): string {
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `ai_${capabilityId}_${Date.now().toString(36)}_${randomPart}`;
}

function traceEvent(type: AiInvocationTraceEvent['type'], message: string): AiInvocationTraceEvent {
  return {
    at: getUtcNow(),
    type,
    message,
  };
}

function getCapabilityToolPolicy(capability: AiCapability): AiToolPolicy {
  if (capability.toolPolicy === 'server_approved') {
    return 'server_approved';
  }

  if (capability.toolPolicy === 'read_only') {
    return 'read_only';
  }

  if (capability.toolPolicy === 'plan_only') {
    return 'plan_only';
  }

  return 'no_tools';
}

function getCapabilityExecutionMode(capability: AiCapability): AiExecutionMode {
  return capability.executionMode;
}

function createReceipt(
  capability: AiCapability,
  modelId: string,
  trace: AiInvocationTraceEvent[] = [],
): AiInvocationReceipt {
  const agent = getAiAgent(capability.agentId);
  const skillIds = [...new Set([...(agent?.skillIds || []), ...capability.skillIds])];
  const toolIds = [...new Set([...(agent?.toolIds || []), ...capability.toolIds])];
  const handoffTargets = [...new Set([...(agent?.handoffTargets || []), ...capability.handoffTargets])];
  const guardrailIds = [
    ...new Set([
      ...(agent?.inputGuardrailIds || []),
      ...(agent?.outputGuardrailIds || []),
      ...capability.guardrailIds,
    ]),
  ];

  return {
    id: createInvocationId(capability.id),
    capabilityId: capability.id,
    agentId: capability.agentId,
    modelId,
    executionMode: getCapabilityExecutionMode(capability),
    toolPolicy: getCapabilityToolPolicy(capability),
    skillIds,
    toolIds,
    handoffTargets,
    guardrailIds,
    startedAt: getUtcNow(),
    trace,
  };
}

function createUnknownReceipt(capabilityId: string, modelId = ''): AiInvocationReceipt {
  return {
    id: createInvocationId(capabilityId || 'unknown'),
    capabilityId,
    modelId,
    executionMode: 'model_only',
    toolPolicy: 'no_tools',
    skillIds: [],
    toolIds: [],
    handoffTargets: [],
    guardrailIds: ['input_scope'],
    startedAt: getUtcNow(),
    completedAt: getUtcNow(),
    trace: [
      traceEvent('failed', '未识别能力，未调用模型。'),
    ],
  };
}

function buildCapabilityPrompt(capability: AiCapability, prompt: string): string {
  const agent = getAiAgent(capability.agentId);
  const skillText = capability.skillIds.length
    ? capability.skillIds.map((skillId) => `- ${skillId}`).join('\n')
    : '- none';
  const toolText = capability.toolIds.length
    ? capability.toolIds.map((toolId) => `- ${toolId}`).join('\n')
    : '- none';
  const handoffText = capability.handoffTargets.length
    ? capability.handoffTargets.map((agentId) => `- ${agentId}`).join('\n')
    : '- none';

  return [
    `AI Capability: ${capability.name} (${capability.id})`,
    `Capability kind: ${capability.kind}`,
    `Agent: ${agent?.name || capability.agentId}`,
    `Execution mode: ${capability.executionMode}`,
    `Tool policy: ${capability.toolPolicy}`,
    `Output contract: ${capability.outputContract}`,
    `Safety boundary: ${capability.safetyBoundary}`,
    '',
    'Agent instruction:',
    agent?.instruction || 'Follow the capability safety boundary.',
    '',
    'Enabled skills:',
    skillText,
    '',
    'Exposed tools:',
    toolText,
    '',
    'Allowed handoff targets:',
    handoffText,
    '',
    'Important:',
    '- Do not claim that tools, skills, handoffs, file edits, or business actions were executed unless the request explicitly provides that result.',
    '- If tool use is needed, produce a plan or proposal only under the current tool policy.',
    '- Keep final output aligned with the output contract and safety boundary.',
    '',
    'User request:',
    prompt,
  ].join('\n');
}

function toCapabilityResult(
  capability: AiCapability,
  result: CompareResult,
  receipt: AiInvocationReceipt,
): AiCapabilityInvocationResult {
  return {
    ...result,
    capabilityId: capability.id,
    modelId: result.modelId,
    receipt: {
      ...receipt,
      completedAt: receipt.completedAt || getUtcNow(),
      trace: [
        ...receipt.trace,
        traceEvent(result.status === 'completed' ? 'completed' : 'failed', result.status === 'completed'
          ? '模型调用完成。'
          : '模型调用失败。'),
      ],
    },
    capability: {
      id: capability.id,
      name: capability.name,
      kind: capability.kind,
      outputContract: capability.outputContract,
      executionMode: capability.executionMode,
      toolPolicy: capability.toolPolicy,
      safetyBoundary: capability.safetyBoundary,
    },
  };
}

export async function callAiCapability(input: AiCapabilityInvocationInput): Promise<AiCapabilityInvocationResult> {
  const capability = getAiCapability(input.capabilityId);

  if (!capability) {
    return {
      capabilityId: input.capabilityId,
      modelId: input.modelId || '',
      result: '未识别的 AI 能力。',
      status: 'error',
      receipt: createUnknownReceipt(input.capabilityId, input.modelId || ''),
      capability: {
        id: input.capabilityId as AiCapabilityId,
        name: '未知能力',
        kind: 'llm',
        outputContract: 'text',
        executionMode: 'model_only',
        toolPolicy: 'no_tools',
        safetyBoundary: '未执行。',
      },
    };
  }

  const trace = [
    traceEvent('capability_resolved', `能力 ${capability.id} 已解析。`),
    traceEvent('agent_resolved', `Agent ${capability.agentId} 已关联。`),
    traceEvent('skills_loaded', `加载 ${capability.skillIds.length} 个 skill manifest。`),
    traceEvent('tools_exposed', `暴露 ${capability.toolIds.length} 个 tool 定义；策略为 ${capability.toolPolicy}。`),
  ];
  const model = resolveCapabilityModel(capability, input.modelId);
  const receipt = createReceipt(capability, input.modelId || capability.defaultModelId, trace);

  if (!model) {
    return {
      capabilityId: capability.id,
      modelId: input.modelId || capability.defaultModelId,
      result: '该能力未配置可用模型。',
      status: 'error',
      receipt: {
        ...receipt,
        completedAt: getUtcNow(),
        trace: [
          ...receipt.trace,
          traceEvent('failed', '未找到该能力允许且已启用的模型。'),
        ],
      },
      capability: {
        id: capability.id,
        name: capability.name,
        kind: capability.kind,
        outputContract: capability.outputContract,
        executionMode: capability.executionMode,
        toolPolicy: capability.toolPolicy,
        safetyBoundary: capability.safetyBoundary,
      },
    };
  }

  receipt.modelId = model.id;
  receipt.trace.push(traceEvent('model_called', `调用模型 ${model.id}。`));

  const result = await callConfiguredModel(buildCapabilityPrompt(capability, input.prompt), model);
  return toCapabilityResult(capability, result, receipt);
}

export async function streamAiCapability(
  input: AiCapabilityInvocationInput,
  options: CompareStreamOptions = {},
): Promise<AiCapabilityInvocationResult> {
  const capability = getAiCapability(input.capabilityId);

  if (!capability) {
    return {
      capabilityId: input.capabilityId,
      modelId: input.modelId || '',
      result: '未识别的 AI 能力。',
      status: 'error',
      receipt: createUnknownReceipt(input.capabilityId, input.modelId || ''),
      capability: {
        id: input.capabilityId as AiCapabilityId,
        name: '未知能力',
        kind: 'llm',
        outputContract: 'text',
        executionMode: 'model_only',
        toolPolicy: 'no_tools',
        safetyBoundary: '未执行。',
      },
    };
  }

  if (!capability.supportsStreaming) {
    return callAiCapability(input);
  }

  const trace = [
    traceEvent('capability_resolved', `能力 ${capability.id} 已解析。`),
    traceEvent('agent_resolved', `Agent ${capability.agentId} 已关联。`),
    traceEvent('skills_loaded', `加载 ${capability.skillIds.length} 个 skill manifest。`),
    traceEvent('tools_exposed', `暴露 ${capability.toolIds.length} 个 tool 定义；策略为 ${capability.toolPolicy}。`),
  ];
  const model = resolveCapabilityModel(capability, input.modelId);
  const receipt = createReceipt(capability, input.modelId || capability.defaultModelId, trace);

  if (!model) {
    return {
      capabilityId: capability.id,
      modelId: input.modelId || capability.defaultModelId,
      result: '该能力未配置可用模型。',
      status: 'error',
      receipt: {
        ...receipt,
        completedAt: getUtcNow(),
        trace: [
          ...receipt.trace,
          traceEvent('failed', '未找到该能力允许且已启用的模型。'),
        ],
      },
      capability: {
        id: capability.id,
        name: capability.name,
        kind: capability.kind,
        outputContract: capability.outputContract,
        executionMode: capability.executionMode,
        toolPolicy: capability.toolPolicy,
        safetyBoundary: capability.safetyBoundary,
      },
    };
  }

  receipt.modelId = model.id;
  receipt.trace.push(traceEvent('model_called', `流式调用模型 ${model.id}。`));

  const result = await streamConfiguredModel(buildCapabilityPrompt(capability, input.prompt), model, options);
  return toCapabilityResult(capability, result, receipt);
}
