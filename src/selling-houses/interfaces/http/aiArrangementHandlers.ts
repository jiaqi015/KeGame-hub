import { callDeepSeekChat } from '../../../../lib/deepseek.js';
import { resolveEnabledModel } from '../../../../lib/modelRuntime.js';
import { buildAiArrangementContextPack } from '../../application/aiArrangement/contextPackBuilder.js';
import { normalizeAiArrangementProposal } from '../../application/aiArrangement/normalizer.js';
import { buildFallbackAiArrangementProposal } from '../../application/aiArrangement/fallbackPlanner.js';
import type { AiArrangementProposalV2 } from '../../application/aiArrangement/proposal.js';
import { buildAiArrangementDualRuntime } from '../../application/agents/aiArrangementDualRuntime.js';
import type {
  AgentArbiterResult,
  AgentRunTrace,
} from '../../core/world-state/agents/proposal.js';
import type { AgentHarnessObservation } from '../../core/world-state/agents/observation.js';
import type { AgentEvaluationReport } from '../../core/world-state/agents/evaluationReport.js';
import type { AgentShadowReport } from '../../core/world-state/agents/shadowReport.js';
import type { GameState } from '../../domain/models.js';
import type { ArrangementProjection } from '../../application/projections/operatingProjection.js';

const DEFAULT_MODEL_ID = 'deepseek-v4-flash';

export interface AiArrangementHandlerResult {
  status: number;
  body: {
    ok: boolean;
    proposal: AiArrangementProposalV2;
    source: 'ai' | 'fallback';
    modelId?: string;
    provider?: 'deepseek';
    error?: string;
    trace?: AgentRunTrace;
    arbiterResult?: AgentArbiterResult<AiArrangementProposalV2>;
    observation?: AgentHarnessObservation;
    shadowReport?: AgentShadowReport;
    evaluationReport?: AgentEvaluationReport;
  };
}

export async function handleAiArrangement(
  state: GameState,
  arrangement: ArrangementProjection,
  currentSlot: 'am' | 'pm',
): Promise<AiArrangementHandlerResult> {
  const pack = buildAiArrangementContextPack(state, arrangement, currentSlot);
  const modelId = DEFAULT_MODEL_ID;
  const model = resolveEnabledModel(modelId);

  if (!model || model.provider !== 'deepseek') {
    const dual = buildAiArrangementDualRuntime(pack, { llmError: 'model_not_available' });
    return {
      status: 200,
      body: {
        ok: true,
        proposal: dual.arbiterResult.finalProposal,
        source: dual.arbiterResult.acceptedSource === 'llm' ? 'ai' : 'fallback',
        modelId,
        provider: 'deepseek',
        error: 'AI 安排模型未启用或不是 DeepSeek 渠道。',
        trace: dual.trace,
        arbiterResult: dual.arbiterResult,
        observation: dual.observation,
        shadowReport: dual.shadowReport,
        evaluationReport: dual.evaluationReport,
      },
    };
  }

  try {
    const prompt = buildPrompt(pack);
    const llmResponse = await callDeepSeekChat([{ role: 'user', content: prompt }], model, {
      responseFormat: 'json_object',
      thinking: 'disabled',
      temperature: 0.3,
      maxTokens: 700,
    });
    if (llmResponse.status !== 'completed') {
      throw new Error(llmResponse.result || 'DeepSeek AI 安排生成失败。');
    }

    const parsed = parseLlmResponse(llmResponse.result);
    const normalized = normalizeAiArrangementProposal(parsed, pack);

    const dual = buildAiArrangementDualRuntime(pack, {
      llmProposal: normalized.proposal,
      durationUs: 0,
      modelId,
      provider: 'deepseek',
    });

    return {
      status: 200,
      body: {
        ok: true,
        proposal: dual.arbiterResult.finalProposal,
        source: dual.arbiterResult.acceptedSource === 'llm' ? 'ai' : 'fallback',
        modelId,
        provider: 'deepseek',
        trace: dual.trace,
        arbiterResult: dual.arbiterResult,
        observation: dual.observation,
        shadowReport: dual.shadowReport,
        evaluationReport: dual.evaluationReport,
      },
    };
  } catch (error) {
    const dual = buildAiArrangementDualRuntime(pack, {
      llmError: error instanceof Error ? error.message : 'unknown_error',
    });

    return {
      status: 200,
      body: {
        ok: true,
        proposal: dual.arbiterResult.finalProposal,
        source: 'fallback',
        modelId,
        provider: 'deepseek',
        error: error instanceof Error ? error.message : 'unknown_error',
        trace: dual.trace,
        arbiterResult: dual.arbiterResult,
        observation: dual.observation,
        shadowReport: dual.shadowReport,
        evaluationReport: dual.evaluationReport,
      },
    };
  }
}

function buildPrompt(pack: any): string {
  return `你是卖房经营游戏里的今日安排代理。你只能根据输入的 candidateItems 做选择。
你不能创建新 action，不能修改游戏状态，不能声称已经安排成功。
输出必须是 JSON，字段为 headline、summary、evidenceLabels、drafts。
drafts 中每一项只能引用 candidateItems 里存在且未 disabled 的 itemId。
总 energyCost 不能超过 ${pack.energy.remaining}，单个 slot 不能超过 slots[slot].remainingCapacity。
不要输出推理链，只输出可解释摘要。
优先少而准，最多 3 个 draft。
如果没有可排动作，返回空 drafts，并说明今天先处理已有安排。

输入上下文：
${JSON.stringify(pack, null, 2)}`;
}

function parseLlmResponse(response: string): unknown {
  try {
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return JSON.parse(response);
  } catch {
    return null;
  }
}
