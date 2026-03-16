import type {AIModel} from './models.js';
import type {CompareResult} from './ark.js';

const IKUN_BASE_URL = 'https://api.ikuncode.cc/v1';

interface IkunChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

function getIkunApiKey(): string {
  return (process.env.IKUN_API_KEY || process.env.IKUNCODE_API_KEY || '').trim();
}

function extractMessage(payload: IkunChatResponse): string {
  return payload.choices
    ?.map((choice) => choice.message?.content?.trim() || '')
    .filter(Boolean)
    .join('\n') || '';
}

export async function callIkunModel(prompt: string, model: AIModel): Promise<CompareResult> {
  const apiKey = getIkunApiKey();

  if (!apiKey) {
    return {
      modelId: model.id,
      result: '未配置 IKUN_API_KEY。',
      status: 'error',
    };
  }

  try {
    const response = await fetch(`${IKUN_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model.upstreamModel,
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
        stream: false,
      }),
      signal: AbortSignal.timeout(30000),
    });

    const payload = (await response.json()) as IkunChatResponse;

    if (!response.ok) {
      return {
        modelId: model.id,
        result: payload.error?.message || `IKunCode 请求失败，HTTP ${response.status}。`,
        status: 'error',
      };
    }

    const text = extractMessage(payload);

    if (!text) {
      return {
        modelId: model.id,
        result: 'IKunCode 返回了空响应。',
        status: 'error',
      };
    }

    return {
      modelId: model.id,
      result: text,
      status: 'completed',
    };
  } catch (error) {
    return {
      modelId: model.id,
      result: error instanceof Error ? error.message : 'IKunCode 请求异常。',
      status: 'error',
    };
  }
}
