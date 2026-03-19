import type {AIModel} from './models.js';
import type {CompareResult, CompareStreamOptions} from './ark.js';

const DASHSCOPE_BASE_URL = 'https://dashscope.aliyuncs.com/compatible-mode/v1';
const DEFAULT_DASHSCOPE_TIMEOUT_MS = 360000;

interface DashScopeChatResponse {
  choices?: Array<{
    delta?: {
      content?: string;
      reasoning_content?: string;
    };
    message?: {
      content?: string;
      reasoning_content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

function getDashScopeApiKey(): string {
  return (process.env.DASHSCOPE_API_KEY || process.env.BAILIAN_API_KEY || '').trim();
}

function getDashScopeTimeoutMs(): number {
  const rawValue = process.env.DASHSCOPE_REQUEST_TIMEOUT_MS;
  const parsedValue = rawValue ? Number.parseInt(rawValue, 10) : Number.NaN;
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : DEFAULT_DASHSCOPE_TIMEOUT_MS;
}

function getRequestSignal(timeoutMs: number, externalSignal?: AbortSignal): AbortSignal {
  return externalSignal
    ? AbortSignal.any([AbortSignal.timeout(timeoutMs), externalSignal])
    : AbortSignal.timeout(timeoutMs);
}

function extractMessage(payload: DashScopeChatResponse): string {
  return payload.choices
    ?.map((choice) => choice.message?.content?.trim() || '')
    .filter(Boolean)
    .join('\n') || '';
}

function extractDelta(payload: DashScopeChatResponse): string {
  return payload.choices
    ?.map((choice) => choice.delta?.content || '')
    .filter(Boolean)
    .join('') || '';
}

function extractReasoningDelta(payload: DashScopeChatResponse): string {
  return payload.choices
    ?.map((choice) => choice.delta?.reasoning_content || '')
    .filter(Boolean)
    .join('') || '';
}

function extractReasoningMessage(payload: DashScopeChatResponse): string {
  return payload.choices
    ?.map((choice) => choice.message?.reasoning_content?.trim() || '')
    .filter(Boolean)
    .join('\n') || '';
}

function formatDashScopeException(error: unknown, timeoutMs: number): string {
  if (error instanceof Error && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
    return `阿里云百炼请求超时（${Math.ceil(timeoutMs / 1000)} 秒）。`;
  }

  return error instanceof Error ? error.message : '阿里云百炼请求异常。';
}

function buildRequestBody(model: AIModel, prompt: string, stream: boolean) {
  return {
    model: model.upstreamModel,
    messages: [
      {
        role: 'user' as const,
        content: prompt,
      },
    ],
    stream,
    ...(model.thinkingStreamMode === 'native' ? {enable_thinking: true} : {}),
  };
}

export async function callDashScopeModel(prompt: string, model: AIModel): Promise<CompareResult> {
  const apiKey = getDashScopeApiKey();
  const timeoutMs = getDashScopeTimeoutMs();

  if (!apiKey) {
    return {
      modelId: model.id,
      result: '未配置 DASHSCOPE_API_KEY。',
      status: 'error',
    };
  }

  try {
    const response = await fetch(`${DASHSCOPE_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildRequestBody(model, prompt, false)),
      signal: getRequestSignal(timeoutMs),
    });

    const payload = (await response.json()) as DashScopeChatResponse;

    if (!response.ok) {
      return {
        modelId: model.id,
        result: payload.error?.message || `阿里云百炼请求失败，HTTP ${response.status}。`,
        status: 'error',
      };
    }

    const text = extractMessage(payload);

    if (!text) {
      return {
        modelId: model.id,
        result: '阿里云百炼返回了空响应。',
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
      result: formatDashScopeException(error, timeoutMs),
      status: 'error',
    };
  }
}

export async function streamDashScopeModel(prompt: string, model: AIModel, options: CompareStreamOptions = {}): Promise<CompareResult> {
  const apiKey = getDashScopeApiKey();
  const timeoutMs = getDashScopeTimeoutMs();

  if (!apiKey) {
    return {
      modelId: model.id,
      result: '未配置 DASHSCOPE_API_KEY。',
      status: 'error',
    };
  }

  try {
    const response = await fetch(`${DASHSCOPE_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(buildRequestBody(model, prompt, true)),
      signal: getRequestSignal(timeoutMs, options.signal),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as DashScopeChatResponse;
      return {
        modelId: model.id,
        result: payload.error?.message || `阿里云百炼请求失败，HTTP ${response.status}。`,
        status: 'error',
      };
    }

    if (!response.body) {
      return {
        modelId: model.id,
        result: '阿里云百炼流式响应不可用。',
        status: 'error',
      };
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    let aggregatedText = '';
    let aggregatedReasoning = '';

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
              reasoning: aggregatedReasoning || undefined,
            }
          : null;
      }

      let payload: DashScopeChatResponse;

      try {
        payload = JSON.parse(payloadText) as DashScopeChatResponse;
      } catch {
        return null;
      }

      if (payload.error?.message) {
        return {
          modelId: model.id,
          result: payload.error.message,
          status: 'error',
          reasoning: aggregatedReasoning || undefined,
        };
      }

      const reasoningDelta = extractReasoningDelta(payload);
      if (reasoningDelta) {
        aggregatedReasoning += reasoningDelta;
        if (options.onDelta) {
          await options.onDelta(reasoningDelta, 'reasoning');
        }
      }

      const deltaText = extractDelta(payload);
      if (deltaText) {
        aggregatedText += deltaText;
        if (options.onDelta) {
          await options.onDelta(deltaText, 'output');
        }
        return null;
      }

      const fallbackText = extractMessage(payload);
      if (fallbackText && !aggregatedText) {
        aggregatedText = fallbackText;
      }

      const fallbackReasoning = extractReasoningMessage(payload);
      if (fallbackReasoning && !aggregatedReasoning) {
        aggregatedReasoning = fallbackReasoning;
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
          reasoning: aggregatedReasoning || undefined,
        }
      : {
          modelId: model.id,
          result: aggregatedReasoning ? '阿里云百炼只返回了思考过程，没有最终答案。' : '阿里云百炼返回了空响应。',
          status: 'error',
          reasoning: aggregatedReasoning || undefined,
        };
  } catch (error) {
    return {
      modelId: model.id,
      result: formatDashScopeException(error, timeoutMs),
      status: 'error',
    };
  }
}
