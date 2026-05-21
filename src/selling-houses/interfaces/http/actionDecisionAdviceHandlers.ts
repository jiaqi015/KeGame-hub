import { callDeepSeekChat } from '../../../../lib/deepseek.js';
import { resolveEnabledModel } from '../../../../lib/modelRuntime.js';
import {
  buildActionScenarioSimulationPrompt,
  normalizeActionScenarioSimulationProposal,
  normalizeActionAdviceRequest,
  parseActionAdvicePayload,
  type ActionAdviceProposal,
} from '../../application/actionDecisionAdvice.js';
import { buildActionDecisionAgentRuntime } from '../../application/agents/actionDecisionAgentAdapter.js';
import { buildActionDecisionDualRuntime } from '../../application/agents/actionDecisionDualRuntime.js';
import type {
  AgentArbiterResult,
  AgentRunTrace,
} from '../../core/world-state/agents/proposal.js';
import type { AgentHarnessObservation } from '../../core/world-state/agents/observation.js';
import type { AgentEvaluationReport } from '../../core/world-state/agents/evaluationReport.js';
import type { AgentShadowReport } from '../../core/world-state/agents/shadowReport.js';

const DEFAULT_ACTION_ADVICE_MODEL_ID = 'deepseek-v4-flash';

export interface ActionDecisionAdviceHandlerResult {
  status: number;
  body: {
    ok: boolean;
    advice: ActionAdviceProposal;
    source: 'ai' | 'fallback';
    modelId?: string;
    provider?: 'deepseek';
    error?: string;
    trace?: AgentRunTrace;
    arbiterResult?: AgentArbiterResult<ActionAdviceProposal>;
    observation?: AgentHarnessObservation;
    shadowReport?: AgentShadowReport;
    evaluationReport?: AgentEvaluationReport;
  };
}

export async function handleActionDecisionAdvice(input: unknown): Promise<ActionDecisionAdviceHandlerResult> {
  const request = normalizeActionAdviceRequest(input);
  if (!request) {
    const fallbackRequest = normalizeActionAdviceRequest(buildMinimalFallbackRequest())!;
    const dual = buildActionDecisionDualRuntime(fallbackRequest, { llmError: 'invalid_request' });
    return {
      status: 400,
      body: {
        ok: false,
        advice: dual.arbiterResult.finalProposal,
        source: 'fallback',
        error: '动作上下文不可用。',
        trace: dual.trace,
        arbiterResult: dual.arbiterResult,
        observation: dual.observation,
        shadowReport: dual.shadowReport,
        evaluationReport: dual.evaluationReport,
      },
    };
  }

  const modelId = resolveActionAdviceModelId(input);
  const model = resolveEnabledModel(modelId);

  if (!model || model.provider !== 'deepseek') {
    const dual = buildActionDecisionDualRuntime(request, { llmError: 'model_not_available' });
    return {
      status: 200,
      body: {
        ok: true,
        advice: dual.arbiterResult.finalProposal,
        source: dual.arbiterResult.acceptedSource === 'llm' ? 'ai' : 'fallback',
        modelId,
        provider: 'deepseek',
        error: '动作参谋模型未启用或不是 DeepSeek 渠道。',
        trace: dual.trace,
        arbiterResult: dual.arbiterResult,
        observation: dual.observation,
        shadowReport: dual.shadowReport,
        evaluationReport: dual.evaluationReport,
      },
    };
  }

  const agent = buildActionDecisionAgentRuntime(request);
  const llmStart = Date.now();
  const result = await callDeepSeekChat(
    [
      {
        role: 'system',
        content: '你只输出符合要求的 JSON。不要输出 Markdown、说明、思考过程。',
      },
      {
        role: 'user',
        content: buildActionScenarioSimulationPrompt(request, agent.promptLines),
      },
    ],
    model,
    {
      responseFormat: 'json_object',
      thinking: 'disabled',
      temperature: 0.32,
      maxTokens: 700,
    },
  );
  const llmDurationUs = Math.round((Date.now() - llmStart) * 1000);

  if (result.status !== 'completed') {
    const dual = buildActionDecisionDualRuntime(request, {
      llmError: result.result || 'DeepSeek call failed',
      durationUs: llmDurationUs,
    });
    return {
      status: 200,
      body: {
        ok: true,
        advice: dual.arbiterResult.finalProposal,
        source: 'fallback',
        modelId: model.id,
        provider: 'deepseek',
        error: result.result || 'DeepSeek 动作参谋生成失败。',
        trace: dual.trace,
        arbiterResult: dual.arbiterResult,
        observation: dual.observation,
        shadowReport: dual.shadowReport,
        evaluationReport: dual.evaluationReport,
      },
    };
  }

  try {
    const parsed = parseActionAdvicePayload(result.result);
    const llmProposal = normalizeActionScenarioSimulationProposal(parsed, request);
    const dual = buildActionDecisionDualRuntime(request, {
      llmProposal,
      durationUs: llmDurationUs,
    });
    return {
      status: 200,
      body: {
        ok: true,
        advice: dual.arbiterResult.finalProposal,
        source: dual.arbiterResult.acceptedSource === 'llm' ? 'ai' : 'fallback',
        modelId: model.id,
        provider: 'deepseek',
        trace: dual.trace,
        arbiterResult: dual.arbiterResult,
        observation: dual.observation,
        shadowReport: dual.shadowReport,
        evaluationReport: dual.evaluationReport,
      },
    };
  } catch (error) {
    const dual = buildActionDecisionDualRuntime(request, {
      llmError: error instanceof Error ? error.message : 'parse_error',
      durationUs: llmDurationUs,
    });
    return {
      status: 200,
      body: {
        ok: true,
        advice: dual.arbiterResult.finalProposal,
        source: 'fallback',
        modelId: model.id,
        provider: 'deepseek',
        error: error instanceof Error ? error.message : 'DeepSeek 动作参谋返回格式不可用。',
        trace: dual.trace,
        arbiterResult: dual.arbiterResult,
        observation: dual.observation,
        shadowReport: dual.shadowReport,
        evaluationReport: dual.evaluationReport,
      },
    };
  }
}

function resolveActionAdviceModelId(input: unknown) {
  if (typeof process.env.SELLING_HOUSES_ACTION_ADVICE_MODEL_ID === 'string' && process.env.SELLING_HOUSES_ACTION_ADVICE_MODEL_ID.trim()) {
    return process.env.SELLING_HOUSES_ACTION_ADVICE_MODEL_ID.trim();
  }
  if (typeof input === 'object' && input !== null && 'modelId' in input && typeof input.modelId === 'string' && input.modelId.trim()) {
    return input.modelId.trim();
  }
  return DEFAULT_ACTION_ADVICE_MODEL_ID;
}

function buildMinimalFallbackRequest() {
  return {
    actionId: 'unknown',
    title: '当前动作',
    summary: '先选择最明确的一步。',
    body: '',
    actorLabel: '',
    currentRound: 1,
    totalRounds: 1,
    contextBullets: [],
    round: {
      title: '本轮选择',
      description: '',
      mainStrategies: [{ id: 'fallback-main', title: '先推进明确动作', note: '先把最确定的一步做掉。' }],
      assistStrategies: [],
    },
  };
}
