import { callDeepSeekChat } from '../../../../lib/deepseek.js';
import { resolveEnabledModel } from '../../../../lib/modelRuntime.js';
import {
  buildFallbackConversationEffectProposal,
  normalizeConversationEffectProposal,
} from '../../application/wechatConversation.js';
import { buildWechatAgentRuntime } from '../../application/agents/wechatAgentAdapter.js';
import { buildWechatDualRuntime } from '../../application/agents/wechatDualRuntime.js';
import type {
  AgentArbiterResult,
  AgentRunTrace,
} from '../../core/world-state/agents/proposal.js';
import type {
  ConversationEffectProposal,
  ConversationSceneInputPack,
  ConversationSceneType,
} from '../../core/world-state/conversation/models.js';

const DEFAULT_DIALOGUE_MODEL_ID = 'deepseek-v4-flash';

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
      },
    };
  }

  const modelId = resolveDialogueModelId(input);
  const model = resolveEnabledModel(modelId);

  if (!model || model.provider !== 'deepseek') {
    const dual = buildWechatDualRuntime(scene, { llmError: 'model_not_available' });
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
      },
    };
  }

  try {
    const llmProposal = parseConversationEffectProposalPayload(result.result, scene);
    const dual = buildWechatDualRuntime(scene, { llmProposal, durationUs: llmDurationUs });
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
      },
    };
  } catch (error) {
    const dual = buildWechatDualRuntime(scene, {
      llmError: error instanceof Error ? error.message : 'parse_error',
      durationUs: llmDurationUs,
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
      },
    };
  }
}

function buildWechatConversationTurnPrompt(scene: ConversationSceneInputPack) {
  const agent = buildWechatAgentRuntime(scene);
  return [
    '你是上海二手房经纪经营模拟的"微信对话理解器"。',
    '你的任务不是代替游戏改状态，而是阅读玩家给业主/客户/经理发出的微信，输出一个可被应用层结算的效果提案。',
    '你同时要扮演对话对象的真实反应。recipientReply 必须像这个角色本人回的一条微信，不是评语。',
    '',
    '对话 agent 档案：',
    ...agent.promptLines,
    '',
    '业务判断要求：',
    '1. 只基于输入上下文判断，不能编造已成交、已调价、已带看等事实。',
    '2. 识别玩家回复是否用了市场证据、竞品对比、客户反馈、面访安排、价格沟通和明确下一步。',
    '3. 对业主场景，可建议影响关系、耐心、催促感和价格松动；对客户场景，可建议影响客户意向和信心。',
    '4. 不直接输出最终游戏结果，所有 delta 只是 proposal，应用层会再限幅和判定。',
    '5. 语气像真实微信：recipientReply 是对方看到玩家回复后的自然反应，要保留角色性格和最近记忆。',
    '6. 不说"系统/AI/模型/评分/内部变量"。不承诺"一定成交/保证结果"。',
    '7. recipientReply 控制在 16 到 46 个中文字符，优先短句；不要复述玩家原文；不要每次都用"收到/好/可以"开头。',
    '',
    'delta 建议范围：trustDelta、patienceDelta 在 -5 到 6；urgencyDelta 在 -6 到 6；priceFlexibilityDelta 在 -6 到 10。非常明确且合理才取极端值。',
    'secure_price_adjustment 只在玩家明确谈到调价/改价/下调，且结合依据时使用。',
    '',
    '允许 intentKinds：reassure, present_market_evidence, propose_face_visit, discuss_price, secure_price_adjustment, promise_feedback, follow_customer, align_manager, overpromise, unclear',
    '允许 riskKinds：none, overpromise, empty_comfort, price_pressure_too_fast, missing_next_step, ignores_customer',
    '允许 nextStep.kind：schedule_face_visit, review_price, prepare_competition_comparison, follow_customer, confirm_price_adjustment, open_case, none',
    '',
    '只输出 JSON，格式如下：',
    '{"summary":"一句业务影响总结","recipientReply":"对方的微信反应","intentKinds":["present_market_evidence"],"riskKinds":["none"],"evidenceUse":"specific","trustDelta":2,"patienceDelta":1,"urgencyDelta":-1,"priceFlexibilityDelta":0,"customerIntentDelta":0,"customerConfidenceDelta":0,"nextStep":{"kind":"schedule_face_visit","actionId":"first-visit","label":"安排面访","reason":"一句原因","priority":"high"},"confidence":0.78}',
    '',
    '输入上下文：',
    JSON.stringify(buildLLMVisibleContext(scene), null, 2),
  ].join('\n');
}

function buildLLMVisibleContext(scene: ConversationSceneInputPack) {
  return {
    day: scene.day,
    sceneType: scene.sceneType,
    playerText: scene.playerText,
    sourceMessage: {
      senderName: scene.sourceMessage.senderName,
      senderRole: scene.sourceMessage.senderRole,
      content: scene.sourceMessage.content,
      urgency: scene.sourceMessage.urgency,
    },
    caseContext: scene.caseContext ? {
      title: scene.caseContext.title,
      ownerName: scene.caseContext.ownerName,
      district: scene.caseContext.district,
      community: scene.caseContext.community,
      askPrice: scene.caseContext.askPrice,
      marketPrice: scene.caseContext.marketPrice,
      priceGapPct: scene.caseContext.priceGapPct,
      trust: scene.caseContext.trust,
      patience: scene.caseContext.patience,
      urgency: scene.caseContext.urgency,
      heat: scene.caseContext.heat,
      hasCompletedFirstVisit: scene.caseContext.hasCompletedFirstVisit,
      ownerProfileLabel: scene.caseContext.ownerProfileLabel,
    } : undefined,
    opportunityContext: scene.opportunityContext ? {
      customerName: scene.opportunityContext.customerName,
      stage: scene.opportunityContext.stage,
      intent: scene.opportunityContext.intent,
      confidence: scene.opportunityContext.confidence,
    } : undefined,
    agentMemory: (scene.agentMemory || []).map((fact) => ({
      kind: fact.kind,
      summary: fact.summary,
    })),
    recentTurns: scene.recentTurns,
  };
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
