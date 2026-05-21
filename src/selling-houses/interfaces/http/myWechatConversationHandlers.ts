import { callDeepSeekChat } from '../../../../lib/deepseek.js';
import { resolveEnabledModel } from '../../../../lib/modelRuntime.js';
import {
  buildFallbackConversationEffectProposal,
  isHostileWechatPlayerText,
  normalizeConversationEffectProposal,
} from '../../application/wechatConversation.js';
import { buildWechatAgentRuntime } from '../../application/agents/wechatAgentAdapter.js';
import { buildWechatConversationTurnPromptLines } from '../../application/agents/wechatPromptPresets.js';
import { buildWechatDualRuntime } from '../../application/agents/wechatDualRuntime.js';
import type {
  AgentArbiterResult,
  AgentRunTrace,
} from '../../core/world-state/agents/proposal.js';
import type { AgentHarnessObservation } from '../../core/world-state/agents/observation.js';
import type { AgentEvaluationReport } from '../../core/world-state/agents/evaluationReport.js';
import type { AgentShadowReport } from '../../core/world-state/agents/shadowReport.js';
import type { CaseAgentMeshHarnessReport } from '../../application/agents/caseMeshHarness.js';
import type {
  ConversationEffectProposal,
  ConversationSceneInputPack,
  ConversationSceneType,
} from '../../core/world-state/conversation/models.js';

const DEFAULT_DIALOGUE_MODEL_ID = 'deepseek-v4-pro';

export interface MyWechatConversationTurnHandlerResult {
  status: number;
  body: {
    ok: boolean;
    proposal: ConversationEffectProposal;
    source: 'ai' | 'fallback';
    modelId?: string;
    provider?: 'deepseek';
    error?: string;
    trace?: AgentRunTrace;
    arbiterResult?: AgentArbiterResult;
    observation?: AgentHarnessObservation;
    shadowReport?: AgentShadowReport;
    evaluationReport?: AgentEvaluationReport;
    meshReport?: CaseAgentMeshHarnessReport | null;
  };
}

export async function handleMyWechatConversationTurn(input: unknown): Promise<MyWechatConversationTurnHandlerResult> {
  const scene = normalizeWechatConversationSceneInput(input);
  if (!scene) {
    const fallbackScene = buildMinimalFallbackScene();
    const dual = buildWechatDualRuntime(fallbackScene);
    return {
      status: 400,
      body: {
        ok: false,
        proposal: dual.arbiterResult.finalProposal,
        source: 'fallback',
        error: '微信对话上下文不可用。',
        trace: dual.trace,
        arbiterResult: dual.arbiterResult,
        observation: dual.observation,
        shadowReport: dual.shadowReport,
        evaluationReport: dual.evaluationReport,
        meshReport: dual.meshReport,
      },
    };
  }

  const modelId = resolveDialogueModelId(input);
  const model = resolveEnabledModel(modelId);

  if (isHostileWechatPlayerText(scene.playerText)) {
    const dual = buildWechatDualRuntime(scene, { modelId, provider: 'deepseek' });
    return {
      status: 200,
      body: {
        ok: true,
        proposal: dual.arbiterResult.finalProposal,
        source: 'fallback',
        modelId,
        provider: 'deepseek',
        trace: dual.trace,
        arbiterResult: dual.arbiterResult,
        observation: dual.observation,
        shadowReport: dual.shadowReport,
        evaluationReport: dual.evaluationReport,
        meshReport: dual.meshReport,
      },
    };
  }

  if (!model || model.provider !== 'deepseek') {
    const dual = buildWechatDualRuntime(scene, { llmError: 'model_not_available', modelId, provider: 'deepseek' });
    return {
      status: 200,
      body: {
        ok: true,
        proposal: dual.arbiterResult.finalProposal,
        source: dual.arbiterResult.acceptedSource === 'llm' ? 'ai' : 'fallback',
        modelId,
        provider: 'deepseek',
        error: '微信对话理解模型未启用或不是 DeepSeek 渠道。',
        trace: dual.trace,
        arbiterResult: dual.arbiterResult,
        observation: dual.observation,
        shadowReport: dual.shadowReport,
        evaluationReport: dual.evaluationReport,
        meshReport: dual.meshReport,
      },
    };
  }

  const llmStart = Date.now();
  const result = await callDeepSeekChat(
    [
      {
        role: 'system',
        content: '你只输出符合要求的 JSON。不要输出 Markdown、说明、思考过程。',
      },
      {
        role: 'user',
        content: buildWechatConversationTurnPrompt(scene),
      },
    ],
    model,
    {
      responseFormat: 'json_object',
      thinking: 'disabled',
      temperature: 0.35,
      maxTokens: 900,
    },
  );
  const llmDurationUs = Math.round((Date.now() - llmStart) * 1000);

  if (result.status !== 'completed') {
    const dual = buildWechatDualRuntime(scene, {
      llmError: result.result || 'DeepSeek call failed',
      durationUs: llmDurationUs,
      modelId,
      provider: 'deepseek',
    });
    return {
      status: 200,
      body: {
        ok: true,
        proposal: dual.arbiterResult.finalProposal,
        source: 'fallback',
        modelId: model.id,
        provider: 'deepseek',
        error: result.result || 'DeepSeek 微信对话理解失败。',
        trace: dual.trace,
        arbiterResult: dual.arbiterResult,
        observation: dual.observation,
        shadowReport: dual.shadowReport,
        evaluationReport: dual.evaluationReport,
        meshReport: dual.meshReport,
      },
    };
  }

  try {
    const llmProposal = parseConversationEffectProposalPayload(result.result, scene);
    const dual = buildWechatDualRuntime(scene, { llmProposal, durationUs: llmDurationUs, modelId, provider: 'deepseek' });
    return {
      status: 200,
      body: {
        ok: true,
        proposal: dual.arbiterResult.finalProposal,
        source: dual.arbiterResult.acceptedSource === 'llm' ? 'ai' : 'fallback',
        modelId: model.id,
        provider: 'deepseek',
        trace: dual.trace,
        arbiterResult: dual.arbiterResult,
        observation: dual.observation,
        shadowReport: dual.shadowReport,
        evaluationReport: dual.evaluationReport,
        meshReport: dual.meshReport,
      },
    };
  } catch (error) {
    const dual = buildWechatDualRuntime(scene, {
      llmError: error instanceof Error ? error.message : 'parse_error',
      durationUs: llmDurationUs,
      modelId,
      provider: 'deepseek',
    });
    return {
      status: 200,
      body: {
        ok: true,
        proposal: dual.arbiterResult.finalProposal,
        source: 'fallback',
        modelId: model.id,
        provider: 'deepseek',
        error: error instanceof Error ? error.message : 'DeepSeek 微信对话返回格式不可用。',
        trace: dual.trace,
        arbiterResult: dual.arbiterResult,
        observation: dual.observation,
        shadowReport: dual.shadowReport,
        evaluationReport: dual.evaluationReport,
        meshReport: dual.meshReport,
      },
    };
  }
}

function buildWechatConversationTurnPrompt(scene: ConversationSceneInputPack) {
  const agent = buildWechatAgentRuntime(scene);
  return buildWechatConversationTurnPromptLines({
    profile: agent.profile,
    scene,
    caseContextPack: scene.caseContextPack,
  }).join('\n');
}

function parseConversationEffectProposalPayload(
  text: string,
  scene: ConversationSceneInputPack,
): ConversationEffectProposal {
  const parsed = JSON.parse(extractJsonObjectText(text)) as unknown;
  if (!isRecord(parsed)) {
    throw new Error('微信对话模型没有返回 JSON 对象。');
  }
  return normalizeConversationEffectProposal(parsed as unknown as ConversationEffectProposal, scene);
}

function normalizeWechatConversationSceneInput(input: unknown): ConversationSceneInputPack | null {
  const raw = isRecord(input) && isRecord(input.scene) ? input.scene : input;
  if (!isRecord(raw)) return null;

  const sourceMessage = isRecord(raw.sourceMessage) ? raw.sourceMessage : null;
  if (!sourceMessage) return null;

  const sceneId = normalizeString(raw.sceneId, 160);
  const runId = normalizeString(raw.runId, 120);
  const conversationKey = normalizeString(raw.conversationKey, 160);
  const sourceMessageId = normalizeString(raw.sourceMessageId, 160);
  const playerText = normalizeString(raw.playerText, 220);
  const senderName = normalizeString(sourceMessage.senderName, 40);
  const senderRole = normalizeString(sourceMessage.senderRole, 40);
  const content = normalizeString(sourceMessage.content, 420);

  if (!sceneId || !runId || !conversationKey || !sourceMessageId || !playerText || !senderName || !senderRole || !content) {
    return null;
  }

  return {
    sceneId,
    runId,
    day: normalizeNumber(raw.day, 1),
    conversationKey,
    sourceMessageId,
    sceneType: normalizeSceneType(raw.sceneType),
    playerText,
    sourceMessage: {
      messageId: normalizeString(sourceMessage.messageId, 160) || sourceMessageId,
      senderName,
      senderRole,
      content,
      timeLabel: normalizeString(sourceMessage.timeLabel, 24) || '今天',
      urgency: normalizeString(sourceMessage.urgency, 24) || 'medium',
      primaryCtaLabel: normalizeOptionalString(sourceMessage.primaryCtaLabel, 40),
    },
    caseContext: normalizeCaseContext(raw.caseContext),
    caseContextPack: isRecord(raw.caseContextPack)
      ? raw.caseContextPack as unknown as ConversationSceneInputPack['caseContextPack']
      : undefined,
    opportunityContext: normalizeOpportunityContext(raw.opportunityContext),
    agentMemory: normalizeAgentMemoryFacts(raw.agentMemory),
    recentTurns: Array.isArray(raw.recentTurns)
      ? raw.recentTurns
        .map(normalizeRecentTurn)
        .filter((turn): turn is ConversationSceneInputPack['recentTurns'][number] => Boolean(turn))
        .slice(-3)
      : [],
  };
}

function normalizeAgentMemoryFacts(input: unknown): ConversationSceneInputPack['agentMemory'] {
  if (!Array.isArray(input)) return [];
  return input
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .map((entry) => {
      const factId = normalizeString(entry.factId, 180);
      const agentId = normalizeString(entry.agentId, 120);
      const kind = normalizeString(entry.kind, 80);
      const summary = normalizeString(entry.summary, 220);
      if (!factId || !agentId || !kind || !summary) return null;
      return {
        factId,
        agentId,
        kind,
        summary,
        strength: Math.max(0, Math.min(1, normalizeNumber(entry.strength, 0.5))),
        createdAtDay: normalizeOptionalNumber(entry.createdAtDay),
        updatedAtDay: normalizeOptionalNumber(entry.updatedAtDay),
        expiresAtDay: normalizeOptionalNumber(entry.expiresAtDay),
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .slice(0, 8);
}

function normalizeCaseContext(input: unknown): ConversationSceneInputPack['caseContext'] | undefined {
  if (!isRecord(input)) return undefined;
  const caseId = normalizeString(input.caseId, 120);
  const title = normalizeString(input.title, 80);
  const ownerName = normalizeString(input.ownerName, 40);
  if (!caseId || !title || !ownerName) return undefined;
  return {
    caseId,
    title,
    ownerName,
    district: normalizeString(input.district, 40),
    community: normalizeString(input.community, 40),
    askPrice: normalizeNumber(input.askPrice, 0),
    marketPrice: normalizeNumber(input.marketPrice, 0),
    priceGapPct: normalizeNumber(input.priceGapPct, 0),
    trust: normalizeNumber(input.trust, 50),
    patience: normalizeNumber(input.patience, 50),
    urgency: normalizeNumber(input.urgency, 50),
    heat: normalizeNumber(input.heat, 50),
    competitiveness: normalizeNumber(input.competitiveness, 50),
    hasCompletedFirstVisit: Boolean(input.hasCompletedFirstVisit),
    ownerProfileLabel: normalizeString(input.ownerProfileLabel, 60) || '未知业主',
  };
}

function normalizeOpportunityContext(input: unknown): ConversationSceneInputPack['opportunityContext'] | undefined {
  if (!isRecord(input)) return undefined;
  const opportunityId = normalizeString(input.opportunityId, 120);
  const customerName = normalizeString(input.customerName, 40);
  if (!opportunityId || !customerName) return undefined;
  return {
    opportunityId,
    customerName,
    stage: normalizeString(input.stage, 40),
    intent: normalizeNumber(input.intent, 50),
    confidence: normalizeNumber(input.confidence, 50),
  };
}

function normalizeRecentTurn(input: unknown): ConversationSceneInputPack['recentTurns'][number] | null {
  if (!isRecord(input)) return null;
  const playerText = normalizeString(input.playerText, 180);
  const recipientReply = normalizeString(input.recipientReply, 160);
  const summary = normalizeString(input.summary, 120);
  if (!playerText || !recipientReply || !summary) return null;
  return { playerText, recipientReply, summary };
}

function buildMinimalFallbackScene(): ConversationSceneInputPack {
  return {
    sceneId: 'invalid-wechat-scene',
    runId: 'unknown',
    day: 1,
    conversationKey: 'unknown',
    sourceMessageId: 'unknown',
    sceneType: 'broker_wechat',
    playerText: '收到，我来处理。',
    sourceMessage: {
      messageId: 'unknown',
      senderName: '对方',
      senderRole: 'system',
      content: '上下文不可用。',
      timeLabel: '今天',
      urgency: 'medium',
    },
    recentTurns: [],
  };
}

function resolveDialogueModelId(input: unknown) {
  if (typeof process.env.SELLING_HOUSES_DIALOGUE_MODEL_ID === 'string' && process.env.SELLING_HOUSES_DIALOGUE_MODEL_ID.trim()) {
    return process.env.SELLING_HOUSES_DIALOGUE_MODEL_ID.trim();
  }
  if (isRecord(input) && typeof input.modelId === 'string' && input.modelId.trim()) {
    return input.modelId.trim();
  }
  return DEFAULT_DIALOGUE_MODEL_ID;
}

function normalizeSceneType(value: unknown): ConversationSceneType {
  if (
    value === 'owner_wechat'
    || value === 'customer_wechat'
    || value === 'manager_wechat'
    || value === 'broker_wechat'
  ) {
    return value;
  }
  return 'broker_wechat';
}

function normalizeString(value: unknown, maxLength: number) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength) : '';
}

function normalizeOptionalString(value: unknown, maxLength: number) {
  const text = normalizeString(value, maxLength);
  return text || undefined;
}

function normalizeNumber(value: unknown, fallback: number) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : fallback;
}

function normalizeOptionalNumber(value: unknown) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function extractJsonObjectText(text: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1]?.trim() || trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return candidate.slice(start, end + 1);
  }
  return candidate;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
