import type {AIModel} from './models.js';

const ARK_BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
const DEFAULT_ARK_TIMEOUT_MS = 360000;
const DEFAULT_ARK_MAX_RETRIES = 1;
const DEFAULT_ARK_RETRY_DELAY_MS = 600;
const RETRYABLE_STATUS_CODES = new Set([408, 429, 500, 502, 503, 504]);

interface ArkOutputText {
  type: 'output_text';
  text?: string;
}

interface ArkReasoningSummaryText {
  type: 'summary_text';
  text?: string;
}

interface ArkMessageOutput {
  type: 'message';
  role: 'assistant' | string;
  content?: ArkOutputText[];
}

interface ArkReasoningOutput {
  type: 'reasoning';
  summary?: ArkReasoningSummaryText[];
}

interface ArkResponse {
  output?: Array<ArkMessageOutput | ArkReasoningOutput>;
  error?: {
    message?: string;
  };
}

export interface CompareResult {
  modelId: string;
  result: string;
  status: 'completed' | 'error';
  reasoning?: string;
}

export interface CompareStreamOptions {
  signal?: AbortSignal;
  onDelta?: (delta: string, channel?: 'reasoning' | 'output') => void | Promise<void>;
}

interface ArkStreamDeltaEvent {
  type: 'response.output_text.delta';
  delta?: string;
}

interface ArkStreamReasoningDeltaEvent {
  type: 'response.reasoning_summary_text.delta';
  delta?: string;
}

interface ArkStreamCompletedEvent {
  type: 'response.completed';
  response?: ArkResponse;
}

interface ArkStreamErrorEvent {
  type: 'error';
  error?: {
    message?: string;
  };
  message?: string;
}

type ArkStreamEvent =
  | ArkStreamDeltaEvent
  | ArkStreamReasoningDeltaEvent
  | ArkStreamCompletedEvent
  | ArkStreamErrorEvent
  | {type: string; [key: string]: unknown};

function getArkApiKey(): string {
  return (process.env.ARK_API_KEY || process.env.VOLCENGINE_API_KEY || '').trim();
}

function getEnvInteger(name: string, fallback: number): number {
  const rawValue = process.env[name];
  const parsedValue = rawValue ? Number.parseInt(rawValue, 10) : Number.NaN;
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : fallback;
}

function isTimeoutError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const message = error.message.toLowerCase();
  return error.name === 'AbortError' || error.name === 'TimeoutError' || message.includes('aborted due to timeout');
}

function formatArkException(error: unknown, timeoutMs: number): string {
  if (isTimeoutError(error)) {
    return `火山方舟请求超时（${Math.ceil(timeoutMs / 1000)} 秒）。`;
  }

  return error instanceof Error ? error.message : '火山方舟请求异常。';
}

function supportsNativeThinking(model: AIModel): boolean {
  return model.thinkingStreamMode === 'native';
}

function buildArkBody(model: AIModel, input: string, stream = false) {
  return {
    model: model.upstreamModel,
    input,
    stream,
    thinking: {
      type: supportsNativeThinking(model) ? ('enabled' as const) : ('disabled' as const),
    },
  };
}

function getRequestSignal(timeoutMs: number, externalSignal?: AbortSignal): AbortSignal {
  return externalSignal
    ? AbortSignal.any([AbortSignal.timeout(timeoutMs), externalSignal])
    : AbortSignal.timeout(timeoutMs);
}

async function parseArkPayload(response: Response): Promise<ArkResponse> {
  try {
    return (await response.json()) as ArkResponse;
  } catch {
    return {};
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendArkRequest(
  model: AIModel,
  input: string,
  options: {
    timeoutMs: number;
    maxRetries: number;
    retryDelayMs: number;
    signal?: AbortSignal;
  },
): Promise<{response: Response; payload: ArkResponse}> {
  const apiKey = getArkApiKey();

  for (let attempt = 0; ; attempt += 1) {
    try {
      const response = await fetch(`${ARK_BASE_URL}/responses`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildArkBody(model, input)),
        signal: getRequestSignal(options.timeoutMs, options.signal),
      });

      const payload = await parseArkPayload(response);

      if (response.ok || !RETRYABLE_STATUS_CODES.has(response.status) || attempt >= options.maxRetries) {
        return {response, payload};
      }
    } catch (error) {
      if (!isTimeoutError(error) || attempt >= options.maxRetries) {
        throw error;
      }
    }

    await sleep(options.retryDelayMs * (attempt + 1));
  }
}

async function readArkStream(
  response: Response,
  modelId: string,
  onDelta?: (delta: string, channel?: 'reasoning' | 'output') => void | Promise<void>,
): Promise<CompareResult> {
  if (!response.body) {
    return {
      modelId,
      result: '火山方舟流式响应不可用。',
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
            modelId,
            result: aggregatedText,
            status: 'completed',
            reasoning: aggregatedReasoning || undefined,
          }
        : null;
    }

    let event: ArkStreamEvent;

    try {
      event = JSON.parse(payloadText) as ArkStreamEvent;
    } catch {
      return null;
    }

    if (event.type === 'response.output_text.delta' && typeof event.delta === 'string' && event.delta) {
      aggregatedText += event.delta;
      if (onDelta) {
        await onDelta(event.delta, 'output');
      }
      return null;
    }

    if (event.type === 'response.reasoning_summary_text.delta' && typeof event.delta === 'string' && event.delta) {
      aggregatedReasoning += event.delta;
      if (onDelta) {
        await onDelta(event.delta, 'reasoning');
      }
      return null;
    }

    if (event.type === 'response.completed') {
      const completedText = aggregatedText || extractOutputText(event.response || {});
      const completedReasoning = aggregatedReasoning || extractReasoningSummary(event.response || {});
      return completedText
        ? {
            modelId,
            result: completedText,
            status: 'completed',
            reasoning: completedReasoning || undefined,
          }
        : {
            modelId,
            result: completedReasoning ? '火山方舟只返回了思考摘要，没有最终答案。' : '火山方舟返回了空响应。',
            status: 'error',
            reasoning: completedReasoning || undefined,
          };
    }

    if (event.type === 'error') {
      const detailedError =
        'error' in event &&
        typeof event.error === 'object' &&
        event.error !== null &&
        'message' in event.error &&
        typeof event.error.message === 'string'
          ? event.error.message
          : undefined;
      const streamErrorMessage =
        'message' in event && typeof event.message === 'string' ? event.message : undefined;
      return {
        modelId,
        result: detailedError || streamErrorMessage || '火山方舟流式请求失败。',
        status: 'error',
      };
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
        modelId,
        result: aggregatedText,
        status: 'completed',
        reasoning: aggregatedReasoning || undefined,
      }
    : {
        modelId,
        result: aggregatedReasoning ? '火山方舟只返回了思考摘要，没有最终答案。' : '火山方舟返回了空响应。',
        status: 'error',
        reasoning: aggregatedReasoning || undefined,
      };
}

function extractOutputText(payload: ArkResponse): string {
  const message = payload.output?.find((item): item is ArkMessageOutput => item.type === 'message' && item.role === 'assistant');

  if (!message?.content) {
    return '';
  }

  return message.content
    .filter((item) => item.type === 'output_text' && typeof item.text === 'string')
    .map((item) => item.text?.trim() || '')
    .filter(Boolean)
    .join('\n');
}

function extractReasoningSummary(payload: ArkResponse): string {
  return payload.output
    ?.filter((item): item is ArkReasoningOutput => item.type === 'reasoning')
    .flatMap((item) => item.summary || [])
    .filter((item) => item.type === 'summary_text' && typeof item.text === 'string')
    .map((item) => item.text?.trim() || '')
    .filter(Boolean)
    .join('\n') || '';
}

export async function callArkModel(prompt: string, model: AIModel): Promise<CompareResult> {
  const apiKey = getArkApiKey();
  const timeoutMs = getEnvInteger('ARK_REQUEST_TIMEOUT_MS', DEFAULT_ARK_TIMEOUT_MS);
  const maxRetries = getEnvInteger('ARK_REQUEST_MAX_RETRIES', DEFAULT_ARK_MAX_RETRIES);
  const retryDelayMs = getEnvInteger('ARK_REQUEST_RETRY_DELAY_MS', DEFAULT_ARK_RETRY_DELAY_MS);

  if (!apiKey) {
    return {
      modelId: model.id,
      result: '未配置 ARK_API_KEY。',
      status: 'error',
    };
  }

  try {
    const {response, payload} = await sendArkRequest(model, prompt, {
      timeoutMs,
      maxRetries,
      retryDelayMs,
    });

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
      result: formatArkException(error, timeoutMs),
      status: 'error',
    };
  }
}

export async function streamArkModel(prompt: string, model: AIModel, options: CompareStreamOptions = {}): Promise<CompareResult> {
  const apiKey = getArkApiKey();
  const timeoutMs = getEnvInteger('ARK_REQUEST_TIMEOUT_MS', DEFAULT_ARK_TIMEOUT_MS);

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
      body: JSON.stringify(buildArkBody(model, prompt, true)),
      signal: getRequestSignal(timeoutMs, options.signal),
    });

    if (!response.ok) {
      const payload = await parseArkPayload(response);
      return {
        modelId: model.id,
        result: payload.error?.message || `火山方舟请求失败，HTTP ${response.status}。`,
        status: 'error',
      };
    }

    return readArkStream(response, model.id, options.onDelta);
  } catch (error) {
    return {
      modelId: model.id,
      result: formatArkException(error, timeoutMs),
      status: 'error',
    };
  }
}
