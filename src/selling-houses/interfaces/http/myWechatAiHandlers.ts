import { callDeepSeekChat } from '../../../../lib/deepseek.js';
import { resolveEnabledModel } from '../../../../lib/modelRuntime.js';
import {
  buildWechatBrokerReplyDraftPrompt,
  normalizeWechatBrokerReplyDraftRequest,
  parseWechatBrokerReplyDraftPayload,
  validateWechatBrokerReplyDrafts,
  type WechatBrokerReplyDraft,
} from '../../application/projections/myWechatAiDraft.js';

const DEFAULT_DIALOGUE_MODEL_ID = 'deepseek-v4-flash';

export interface MyWechatBrokerReplyDraftHandlerResult {
  status: number;
  body: {
    ok: boolean;
    replies: WechatBrokerReplyDraft[];
    modelId?: string;
    provider?: 'deepseek';
    error?: string;
  };
}

export async function handleMyWechatBrokerReplyDraft(input: unknown): Promise<MyWechatBrokerReplyDraftHandlerResult> {
  const request = normalizeWechatBrokerReplyDraftRequest(input);
  if (request.messages.length === 0) {
    return {
      status: 400,
      body: {
        ok: false,
        replies: [],
        error: '没有可生成回复的微信消息。',
      },
    };
  }

  const modelId = resolveDialogueModelId(input);
  const model = resolveEnabledModel(modelId);
  if (!model || model.provider !== 'deepseek') {
    return {
      status: 400,
      body: {
        ok: false,
        replies: [],
        modelId,
        provider: 'deepseek',
        error: '微信对话模型未启用或不是 DeepSeek 渠道。',
      },
    };
  }

  const prompt = buildWechatBrokerReplyDraftPrompt(request);
  const result = await callDeepSeekChat(
    [
      {
        role: 'system',
        content: '你只输出符合要求的 JSON。不要输出 Markdown、说明、思考过程。',
      },
      {
        role: 'user',
        content: prompt,
      },
    ],
    model,
    {
      responseFormat: 'json_object',
      thinking: 'disabled',
      temperature: 0.45,
      maxTokens: 900,
    },
  );

  if (result.status !== 'completed') {
    return {
      status: 502,
      body: {
        ok: false,
        replies: [],
        modelId: model.id,
        provider: 'deepseek',
        error: result.result || 'DeepSeek 对话生成失败。',
      },
    };
  }

  try {
    const parsed = parseWechatBrokerReplyDraftPayload(result.result);
    const replies = validateWechatBrokerReplyDrafts(parsed.replies, request);
    return {
      status: 200,
      body: {
        ok: true,
        replies,
        modelId: model.id,
        provider: 'deepseek',
      },
    };
  } catch (error) {
    return {
      status: 502,
      body: {
        ok: false,
        replies: [],
        modelId: model.id,
        provider: 'deepseek',
        error: error instanceof Error ? error.message : 'DeepSeek 返回格式不可用。',
      },
    };
  }
}

function resolveDialogueModelId(input: unknown) {
  if (typeof process.env.SELLING_HOUSES_DIALOGUE_MODEL_ID === 'string' && process.env.SELLING_HOUSES_DIALOGUE_MODEL_ID.trim()) {
    return process.env.SELLING_HOUSES_DIALOGUE_MODEL_ID.trim();
  }
  if (typeof input === 'object' && input !== null && 'modelId' in input && typeof input.modelId === 'string' && input.modelId.trim()) {
    return input.modelId.trim();
  }
  return DEFAULT_DIALOGUE_MODEL_ID;
}
