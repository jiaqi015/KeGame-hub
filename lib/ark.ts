import type {AIModel} from './models.js';

const ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';

interface ArkOutputText {
  type: 'output_text';
  text?: string;
}

interface ArkMessageOutput {
  type: 'message';
  role: 'assistant' | string;
  content?: ArkOutputText[];
}

interface ArkResponse {
  output?: ArkMessageOutput[];
  error?: {
    message?: string;
  };
}

export interface CompareResult {
  modelId: string;
  result: string;
  status: 'completed' | 'error';
}

function getArkApiKey(): string {
  return (process.env.ARK_API_KEY || process.env.VOLCENGINE_API_KEY || '').trim();
}

function extractOutputText(payload: ArkResponse): string {
  const message = payload.output?.find((item) => item.type === 'message' && item.role === 'assistant');

  if (!message?.content) {
    return '';
  }

  return message.content
    .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text?.trim() || '')
    .filter(Boolean)
    .join('\n');
}

export async function callArkModel(prompt: string, model: AIModel): Promise<CompareResult> {
  const apiKey = getArkApiKey();

  if (!apiKey) {
    return {
      modelId: model.id,
      result: '未配置 ARK_API_KEY。',
      status: 'error',
    };
  }

  try {
    const response = await fetch(`${ARK_BASE_URL}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: model.upstreamModel,
        input: prompt,
        thinking: {
          type: 'disabled',
        },
      }),
      signal: AbortSignal.timeout(30000),
    });

    const payload = (await response.json()) as ArkResponse;

    if (!response.ok) {
      return {
        modelId: model.id,
        result: payload.error?.message || `火山方舟请求失败，HTTP ${response.status}。`,
        status: 'error',
      };
    }

    const text = extractOutputText(payload);

    if (!text) {
      return {
        modelId: model.id,
        result: '火山方舟返回了空响应。',
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
      result: error instanceof Error ? error.message : '火山方舟请求异常。',
      status: 'error',
    };
  }
}
