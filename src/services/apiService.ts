import { ComparisonResult, AIModel, ActivationWorkspaceId } from '../types';

export const ACTIVATION_STORAGE_KEY = 'sabrina-activation-key';
export const ACTIVATION_HEADER_NAME = 'x-activation-key';
export const AUTH_EMAIL_STORAGE_KEY = 'sabrina-auth-email';
export const DIFFERENCE_SUMMARY_MODEL_ID = 'doubao-seed-2-0-pro-260215';
export const DIFFERENCE_SUMMARY_MODEL_NAME = 'Doubao-Seed-2.0-pro';
export const SUMMARY_INPUT_CHAR_LIMIT = 6000;
export const SCRATCHPAD_TAG = 'scratchpad';
export const FINAL_TAG = 'final';

export interface CompareStreamEvent {
  type: 'delta' | 'completed' | 'error';
  delta?: string;
  channel?: 'reasoning' | 'output';
  result?: string;
  error?: string;
  reasoning?: string;
}

export interface ActivationPayload {
  key: string;
  allowedWorkspaces: ActivationWorkspaceId[];
}

export interface AuthenticatedUserPayload {
  email: string;
  nickname: string;
  displayName: string;
  allowedWorkspaces: ActivationWorkspaceId[];
  source?: 'session' | 'activation-key';
}

export interface AuthStartPayload {
  email: string;
  mode: 'trusted-bypass' | 'verification_required' | 'activation_required';
  expiresAt?: string | null;
  verificationCode?: string | null;
  user?: AuthenticatedUserPayload | null;
}

export function truncateForSummary(value: string, limit = SUMMARY_INPUT_CHAR_LIMIT): string {
  if (value.length <= limit) {
    return value;
  }
  return `${value.slice(0, limit)}\n\n[后续内容已截断，保留前 ${limit} 个字符用于差异总结]`;
}

export function wrapPromptForVisibleThinking(userPrompt: string): string {
  return [
    '请严格按下面格式输出，方便前端在生成过程中展示“思考摘要”，完成后只展示最终结果：',
    '',
    `<${SCRATCHPAD_TAG}>`,
    '用 6 到 12 行要点写出你正在做的分析步骤和关注点（这是给用户看的思考摘要）。',
    '不要写长段推理，不要输出隐私/敏感信息，不要编造未提供的事实。',
    `</${SCRATCHPAD_TAG}>`,
    '',
    `<${FINAL_TAG}>`,
    '在这里输出最终答案，严格遵循用户给的“输出格式”。',
    `</${FINAL_TAG}>`,
    '',
    '用户提示词：',
    userPrompt,
  ].join('\n');
}

export function extractTagBlock(text: string, tag: string): {content: string; openIndex: number; closeIndex: number} | null {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const openIndex = text.indexOf(open);
  if (openIndex === -1) {
    return null;
  }

  const contentStart = openIndex + open.length;
  const closeIndex = text.indexOf(close, contentStart);
  if (closeIndex === -1) {
    return {content: text.slice(contentStart).trimStart(), openIndex, closeIndex: -1};
  }

  return {content: text.slice(contentStart, closeIndex).trim(), openIndex, closeIndex};
}

export function stripTaggedBlocks(text: string): string {
  return text
    .replace(new RegExp(`<${SCRATCHPAD_TAG}>[\\s\\S]*?</${SCRATCHPAD_TAG}>`, 'g'), '')
    .replace(new RegExp(`<${FINAL_TAG}>[\\s\\S]*?</${FINAL_TAG}>`, 'g'), '')
    .trim();
}

export function getDisplayedText(result: ComparisonResult | undefined): {inProgress: string; final: string} {
  const raw = result?.result || '';
  const nativeReasoning = result?.reasoning?.trim() || '';
  const scratchpad = extractTagBlock(raw, SCRATCHPAD_TAG)?.content || '';
  const final = extractTagBlock(raw, FINAL_TAG)?.content || '';

  return {
    inProgress: nativeReasoning || scratchpad || raw,
    final: final || stripTaggedBlocks(raw) || raw,
  };
}

export function shouldUsePromptThinkingFallback(model: AIModel | undefined): boolean {
  return model?.thinkingStreamMode !== 'native';
}

export function buildDifferenceSummaryPrompt(prompt: string, modelIds: string[], models: AIModel[], results: Record<string, ComparisonResult>): string {
  const promptPreview = truncateForSummary(prompt, 1500);
  const modelSections = modelIds.map((modelId) => {
    const model = models.find((item) => item.id === modelId);
    const result = results[modelId];
    const statusLabel = result?.status === 'completed'
      ? '已完成'
      : result?.status === 'error'
        ? '异常'
        : '进行中';

    const content = truncateForSummary(getDisplayedText(result).final || '该模型没有返回可用内容。');

    return [
      `【模型】${model?.name || modelId}`,
      `【状态】${statusLabel}`,
      '【输出】',
      content,
    ].join('\n');
  });

  return [
    '你是一个中立的多模型差异总结助手。下面是多个模型对同一提示词的回答结果，请只提炼“核心差异”，不要重复共识内容。',
    '',
    '输出要求：',
    '1. 输出 4 到 6 条短 bullet。',
    '2. 每条先写一个不超过 8 个字的小标题，再用 1 到 2 句话解释。',
    '3. 优先比较：结论区间、判断依据、风险提示、行动建议、异常情况。',
    '4. 如果某个模型报错、超时或明显缺信息，单独点出来。',
    '5. 语言简洁、客观，不重新回答原题，不做最终拍板。',
    '',
    '原始提示词摘要：',
    promptPreview,
    '',
    '模型结果：',
    modelSections.join('\n\n'),
  ].join('\n');
}

export function buildAuthorizedHeaders(activationKey: string, headers?: HeadersInit): Headers {
  const mergedHeaders = new Headers(headers);
  mergedHeaders.set(ACTIVATION_HEADER_NAME, activationKey);
  return mergedHeaders;
}

export async function verifyActivationKey(key: string): Promise<ActivationPayload> {
  const response = await fetch('/api/auth?mode=activate', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({key}),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : '激活失败。');
  }

  const allowedWorkspaces = Array.isArray(payload?.allowedWorkspaces)
    ? payload.allowedWorkspaces.filter((item: unknown): item is ActivationWorkspaceId => typeof item === 'string')
    : [];

  return {
    key: typeof payload?.key === 'string' ? payload.key.trim() : key.trim(),
    allowedWorkspaces,
  };
}

export async function startEmailLogin(email: string): Promise<AuthStartPayload> {
  const response = await fetch('/api/auth?mode=start', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : '登录初始化失败。');
  }

  return {
    email: typeof payload?.email === 'string' ? payload.email : email.trim().toLowerCase(),
    mode: payload?.mode,
    expiresAt: typeof payload?.expiresAt === 'string' ? payload.expiresAt : null,
    verificationCode: typeof payload?.verificationCode === 'string' ? payload.verificationCode : null,
    user: payload?.user ?? null,
  };
}

export async function completeEmailLogin(input: {
  email: string;
  code?: string;
  activationKey?: string;
}): Promise<AuthenticatedUserPayload> {
  const response = await fetch('/api/auth?mode=complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : '登录失败。');
  }

  return payload.user as AuthenticatedUserPayload;
}

export async function fetchAuthenticatedUser(): Promise<AuthenticatedUserPayload> {
  const response = await fetch('/api/auth?mode=me');
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : '获取用户信息失败。');
  }

  return payload.user as AuthenticatedUserPayload;
}

export async function logoutCurrentSession(): Promise<void> {
  await fetch('/api/auth?mode=logout', {
    method: 'POST',
  });
}

export async function readCompareStream(
  response: Response,
  modelId: string,
  onDelta: (delta: string, channel: 'reasoning' | 'output') => void,
): Promise<ComparisonResult> {
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(typeof payload?.error === 'string' ? payload.error : '流式比较请求失败。');
  }

  if (!response.body) {
    throw new Error('浏览器未收到可读取的流式响应。');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let aggregatedText = '';
  let aggregatedReasoning = '';

  const processPayload = (payloadText: string): ComparisonResult | null => {
    if (!payloadText || payloadText === '[DONE]') {
      return null;
    }

    let event: CompareStreamEvent;

    try {
      event = JSON.parse(payloadText) as CompareStreamEvent;
    } catch {
      return null;
    }

    if (event.type === 'delta' && typeof event.delta === 'string' && event.delta) {
      if (event.channel === 'reasoning') {
        aggregatedReasoning += event.delta;
        onDelta(event.delta, 'reasoning');
      } else {
        aggregatedText += event.delta;
        onDelta(event.delta, 'output');
      }
      return null;
    }

    if (event.type === 'completed') {
      return {
        modelId,
        result: typeof event.result === 'string' && event.result ? event.result : aggregatedText,
        status: 'completed',
        reasoning: typeof event.reasoning === 'string' && event.reasoning ? event.reasoning : aggregatedReasoning || undefined,
      };
    }

    if (event.type === 'error') {
      return {
        modelId,
        result: typeof event.error === 'string' ? event.error : '模型流式输出失败。',
        status: 'error',
        reasoning: typeof event.reasoning === 'string' && event.reasoning ? event.reasoning : aggregatedReasoning || undefined,
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

      const result = processPayload(payloadText);
      if (result) {
        return result;
      }
    }

    if (done) break;
  }

  const trailingPayload = buffer
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
  const trailingResult = processPayload(trailingPayload);

  if (trailingResult) return trailingResult;

  if (aggregatedText) {
    return {
      modelId,
      result: aggregatedText,
      status: 'completed',
      reasoning: aggregatedReasoning || undefined,
    };
  }

  throw new Error('模型未返回可展示的流式内容。');
}
