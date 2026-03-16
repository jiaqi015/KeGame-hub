import type {AIModel} from './models.js';
import type {CompareResult} from './ark.js';
import type {CompareStreamOptions} from './ark.js';

const HUNYUAN_BASE_URL = 'https://api.hunyuan.cloud.tencent.com/v1';
const DEFAULT_HUNYUAN_TIMEOUT_MS = 120000;

interface HunyuanChatResponse {
  choices?: Array<{
    delta?: {
      content?: string;
    };
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

function getHunyuanApiKey(): string {
  return (process.env.HUNYUAN_API_KEY || '').trim();
}

function getHunyuanTimeoutMs(): number {
  const rawValue = process.env.HUNYUAN_REQUEST_TIMEOUT_MS;
  const parsedValue = rawValue ? Number.parseInt(rawValue, 10) : Number.NaN;
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : DEFAULT_HUNYUAN_TIMEOUT_MS;
}

function getRequestSignal(timeoutMs: number, externalSignal?: AbortSignal): AbortSignal {
  return externalSignal
    ? AbortSignal.any([AbortSignal.timeout(timeoutMs), externalSignal])
    : AbortSignal.timeout(timeoutMs);
}

function extractMessage(payload: HunyuanChatResponse): string {
  return payload.choices
    ?.map((choice) => choice.message?.content?.trim() || '')
    .filter(Boolean)
    .join('\n') || '';
}

function extractDelta(payload: HunyuanChatResponse): string {
  return payload.choices
    ?.map((choice) => choice.delta?.content || '')
    .filter(Boolean)
    .join('') || '';
}

export async function callHunyuanModel(prompt: string, model: AIModel): Promise<CompareResult> {
  const apiKey = getHunyuanApiKey();
  const timeoutMs = getHunyuanTimeoutMs();

  if (!apiKey) {
    return {
      modelId: model.id,
      result: '未配置 HUNYUAN_API_KEY。',
      status: 'error',
    };
  }

  try {
    const response = await fetch(`${HUNYUAN_BASE_URL}/chat/completions`, {
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
      signal: getRequestSignal(timeoutMs),
    });

    const payload = (await response.json()) as HunyuanChatResponse;

    if (!response.ok) {
      return {
        modelId: model.id,
        result: payload.error?.message || `腾讯混元请求失败，HTTP ${response.status}。`,
        status: 'error',
      };
    }

    const text = extractMessage(payload);

    if (!text) {
      return {
        modelId: model.id,
        result: '腾讯混元返回了空响应。',
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
      result: error instanceof Error ? error.message : '腾讯混元请求异常。',
      status: 'error',
    };
  }
}

export async function streamHunyuanModel(prompt: string, model: AIModel, options: CompareStreamOptions = {}): Promise<CompareResult> {
  const apiKey = getHunyuanApiKey();
  const timeoutMs = getHunyuanTimeoutMs();

  if (!apiKey) {
    return {
      modelId: model.id,
      result: '未配置 HUNYUAN_API_KEY。',
      status: 'error',
    };
  }

  try {
    const response = await fetch(`${HUNYUAN_BASE_URL}/chat/completions`, {
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
        stream: true,
      }),
      signal: getRequestSignal(timeoutMs, options.signal),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as HunyuanChatResponse;
      return {
        modelId: model.id,
        result: payload.error?.message || `腾讯混元请求失败，HTTP ${response.status}。`,
        status: 'error',
      };
    }

    if (!response.body) {
      return {
        modelId: model.id,
        result: '腾讯混元流式响应不可用。',
        status: 'error',
      };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let aggregatedText = '';

    const processPayload = async (payloadText: string): Promise<CompareResult | null> => {
      if (!payloadText) {
        return null;
      }

      if (payloadText === '[DONE]') {
        return aggregatedText
          ? {
              modelId: model.id,
              result: aggregatedText,
              status: 'completed',
            }
          : null;
      }

      let payload: HunyuanChatResponse;

      try {
        payload = JSON.parse(payloadText) as HunyuanChatResponse;
      } catch {
        return null;
      }

      if (payload.error?.message) {
        return {
          modelId: model.id,
          result: payload.error.message,
          status: 'error',
        };
      }

      const deltaText = extractDelta(payload);
      if (deltaText) {
        aggregatedText += deltaText;
        if (options.onDelta) {
          await options.onDelta(deltaText);
        }
        return null;
      }

      const fallbackText = extractMessage(payload);
      if (fallbackText && !aggregatedText) {
        aggregatedText = fallbackText;
      }

      return null;
    };

    while (true) {
      const {done, value} = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), {stream: !done});
      const segments = buffer.split(/\r?\n\r?\n/);
      buffer = segments.pop() || '';

      for (const segment of segments) {
        const payloadText = segment
          .split(/\r?\n/)
          .filter((line) => line.startsWith('data:'))
          .map((line) => line.slice(5).trimStart())
          .join('\n');

        const result = await processPayload(payloadText);
        if (result) {
          return result;
        }
      }

      if (done) {
        break;
      }
    }

    const trailingPayload = buffer
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).trimStart())
      .join('\n');
    const trailingResult = await processPayload(trailingPayload);

    if (trailingResult) {
      return trailingResult;
    }

    return aggregatedText
      ? {
          modelId: model.id,
          result: aggregatedText,
          status: 'completed',
        }
      : {
          modelId: model.id,
          result: '腾讯混元返回了空响应。',
          status: 'error',
        };
  } catch (error) {
    return {
      modelId: model.id,
      result: error instanceof Error ? error.message : '腾讯混元请求异常。',
      status: 'error',
    };
  }
}
