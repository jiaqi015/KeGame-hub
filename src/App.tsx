import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Layers, Cpu, CheckCircle2, Loader2, ArrowLeft, Send, Sparkles, X, Maximize2, KeyRound, LogOut, ShieldCheck } from 'lucide-react';
import { ComparisonResult, AIModel } from './types';

type DifferenceSummaryStatus = 'idle' | 'waiting' | 'thinking' | 'completed' | 'error';
type AuthStatus = 'checking' | 'locked' | 'submitting' | 'authenticated';

interface DifferenceSummaryState {
  modelId: string | null;
  content: string;
  status: DifferenceSummaryStatus;
}

interface CompareStreamEvent {
  type: 'delta' | 'completed' | 'error';
  delta?: string;
  channel?: 'reasoning' | 'output';
  result?: string;
  error?: string;
  reasoning?: string;
}

const DIFFERENCE_SUMMARY_MODEL_ID = 'doubao-seed-2-0-pro-260215';
const DIFFERENCE_SUMMARY_MODEL_NAME = 'Doubao-Seed-2.0-pro';
const SUMMARY_INPUT_CHAR_LIMIT = 6000;
const SCRATCHPAD_TAG = 'scratchpad';
const FINAL_TAG = 'final';
const ACTIVATION_STORAGE_KEY = 'sabrina-activation-key';
const ACTIVATION_HEADER_NAME = 'x-activation-key';

function truncateForSummary(value: string, limit = SUMMARY_INPUT_CHAR_LIMIT): string {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit)}\n\n[后续内容已截断，保留前 ${limit} 个字符用于差异总结]`;
}

function wrapPromptForVisibleThinking(userPrompt: string): string {
  // This is intentionally a "thinking summary" the model writes out, not hidden chain-of-thought.
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

function extractTagBlock(text: string, tag: string): {content: string; openIndex: number; closeIndex: number} | null {
  const open = `<${tag}>`;
  const close = `</${tag}>`;
  const openIndex = text.indexOf(open);
  if (openIndex === -1) {
    return null;
  }

  const contentStart = openIndex + open.length;
  const closeIndex = text.indexOf(close, contentStart);
  if (closeIndex === -1) {
    // Still streaming: return the partial content after the open tag.
    return {content: text.slice(contentStart).trimStart(), openIndex, closeIndex: -1};
  }

  return {content: text.slice(contentStart, closeIndex).trim(), openIndex, closeIndex};
}

function stripTaggedBlocks(text: string): string {
  // Best-effort cleanup when models don't follow the tag contract perfectly.
  return text
    .replace(new RegExp(`<${SCRATCHPAD_TAG}>[\\s\\S]*?</${SCRATCHPAD_TAG}>`, 'g'), '')
    .replace(new RegExp(`<${FINAL_TAG}>[\\s\\S]*?</${FINAL_TAG}>`, 'g'), '')
    .trim();
}

function getDisplayedText(result: ComparisonResult | undefined): {inProgress: string; final: string} {
  const raw = result?.result || '';
  const nativeReasoning = result?.reasoning?.trim() || '';
  const scratchpad = extractTagBlock(raw, SCRATCHPAD_TAG)?.content || '';
  const final = extractTagBlock(raw, FINAL_TAG)?.content || '';

  return {
    inProgress: nativeReasoning || scratchpad || raw,
    final: final || stripTaggedBlocks(raw) || raw,
  };
}

function shouldUsePromptThinkingFallback(model: AIModel | undefined): boolean {
  return model?.thinkingStreamMode !== 'native';
}

function buildDifferenceSummaryPrompt(prompt: string, modelIds: string[], models: AIModel[], results: Record<string, ComparisonResult>): string {
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

function buildAuthorizedHeaders(activationKey: string, headers?: HeadersInit): Headers {
  const mergedHeaders = new Headers(headers);
  mergedHeaders.set(ACTIVATION_HEADER_NAME, activationKey);
  return mergedHeaders;
}

async function readCompareStream(
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

    if (done) {
      break;
    }
  }

  const trailingPayload = buffer
    .split(/\r?\n/)
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart())
    .join('\n');
  const trailingResult = processPayload(trailingPayload);

  if (trailingResult) {
    return trailingResult;
  }

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

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [activationInput, setActivationInput] = useState('');
  const [authorizedKey, setAuthorizedKey] = useState('');
  const [authStatus, setAuthStatus] = useState<AuthStatus>('checking');
  const [authError, setAuthError] = useState('');
  const [availableModels, setAvailableModels] = useState<AIModel[]>([]);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState('all');
  const [isComparing, setIsComparing] = useState(false);
  const [results, setResults] = useState<Record<string, ComparisonResult>>({});
  const [differenceSummary, setDifferenceSummary] = useState<DifferenceSummaryState>({
    modelId: null,
    content: '',
    status: 'idle',
  });
  const [previewData, setPreviewData] = useState<{ title: string, subtitle: string, content: string } | null>(null);
  const [catalogReady, setCatalogReady] = useState(false);
  const compareRunRef = useRef(0);
  const activeControllersRef = useRef<AbortController[]>([]);
  const summaryControllerRef = useRef<AbortController | null>(null);

  const abortActiveComparisons = () => {
    activeControllersRef.current.forEach((controller) => controller.abort());
    activeControllersRef.current = [];
  };

  const abortDifferenceSummary = () => {
    summaryControllerRef.current?.abort();
    summaryControllerRef.current = null;
  };

  useEffect(() => {
    return () => {
      abortActiveComparisons();
      abortDifferenceSummary();
    };
  }, []);

  const resetWorkspaceState = () => {
    compareRunRef.current += 1;
    abortActiveComparisons();
    abortDifferenceSummary();
    setAvailableModels([]);
    setSelectedModels([]);
    setCatalogReady(false);
    setIsComparing(false);
    setResults({});
    setPrompt('');
    setPreviewData(null);
    setDifferenceSummary({
      modelId: null,
      content: '',
      status: 'idle',
    });
  };

  const lockApplication = (message: string, nextInput = '') => {
    window.localStorage.removeItem(ACTIVATION_STORAGE_KEY);
    resetWorkspaceState();
    setAuthorizedKey('');
    setActivationInput(nextInput);
    setAuthStatus('locked');
    setAuthError(message);
  };

  const completeActivation = (key: string) => {
    window.localStorage.setItem(ACTIVATION_STORAGE_KEY, key);
    setAuthorizedKey(key);
    setActivationInput(key);
    setAuthError('');
    setAuthStatus('authenticated');
  };

  const verifyActivationKey = async (key: string) => {
    const response = await fetch('/api/activate', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({key}),
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(typeof payload?.error === 'string' ? payload.error : '激活失败。');
    }

    return key.trim();
  };

  const authorizedFetch = async (input: string, init: RequestInit = {}) => {
    const response = await fetch(input, {
      ...init,
      headers: buildAuthorizedHeaders(authorizedKey, init.headers),
    });

    if (response.status === 401 || response.status === 403) {
      const payload = await response.clone().json().catch(() => ({}));
      const message = typeof payload?.error === 'string' ? payload.error : '激活密钥无效或已失效。';
      lockApplication(message, authorizedKey);
      throw new Error(message);
    }

    return response;
  };

  const submitActivationKey = async (event?: React.FormEvent<HTMLFormElement>) => {
    event?.preventDefault();

    const candidateKey = activationInput.trim();

    if (!candidateKey) {
      setAuthStatus('locked');
      setAuthError('请输入激活密钥。');
      return;
    }

    setAuthStatus('submitting');
    setAuthError('');

    try {
      const verifiedKey = await verifyActivationKey(candidateKey);
      completeActivation(verifiedKey);
    } catch (error) {
      setAuthStatus('locked');
      setAuthError(error instanceof Error ? error.message : '激活失败。');
    }
  };

  const handleLogout = () => {
    lockApplication('', '');
  };

  useEffect(() => {
    let disposed = false;

    const restoreActivation = async () => {
      const storedKey = window.localStorage.getItem(ACTIVATION_STORAGE_KEY)?.trim() || '';

      if (!storedKey) {
        if (!disposed) {
          setAuthStatus('locked');
          setAuthError('');
        }
        return;
      }

      if (!disposed) {
        setActivationInput(storedKey);
        setAuthStatus('checking');
      }

      try {
        const verifiedKey = await verifyActivationKey(storedKey);

        if (!disposed) {
          completeActivation(verifiedKey);
        }
      } catch (error) {
        if (!disposed) {
          lockApplication(error instanceof Error ? error.message : '激活失败。', storedKey);
        }
      }
    };

    void restoreActivation();

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    let disposed = false;

    if (authStatus !== 'authenticated' || !authorizedKey) {
      setCatalogReady(false);
      setAvailableModels([]);
      setSelectedModels([]);
      return () => {
        disposed = true;
      };
    }

    const loadModels = async () => {
      setCatalogReady(false);

      try {
        const response = await authorizedFetch('/api/models');
        const payload = await response.json();
        const models = Array.isArray(payload?.models) ? payload.models as AIModel[] : [];

        if (disposed) {
          return;
        }

        setAvailableModels(models);
        setSelectedModels(models[0] ? [models[0].id] : []);
      } catch (error) {
        if (!disposed) {
          console.error('Failed to load model catalog:', error);
          setAvailableModels([]);
          setSelectedModels([]);
        }
      } finally {
        if (!disposed) {
          setCatalogReady(true);
        }
      }
    };

    void loadModels();

    return () => {
      disposed = true;
    };
  }, [authStatus, authorizedKey]);

  const toggleModel = (id: string) => {
    setSelectedModels(prev => 
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const startComparison = async () => {
    if (!prompt.trim() || selectedModels.length === 0) return;

    abortActiveComparisons();
    abortDifferenceSummary();
    compareRunRef.current += 1;
    const runId = compareRunRef.current;
    const modelIds = [...selectedModels];

    setIsComparing(true);
    setDifferenceSummary({
      modelId: DIFFERENCE_SUMMARY_MODEL_ID,
      content: '',
      status: 'waiting',
    });
    
    const initialResults: Record<string, ComparisonResult> = {};
    modelIds.forEach(id => {
      initialResults[id] = { modelId: id, result: '', reasoning: '', status: 'thinking' };
    });
    setResults(initialResults);
    const settledResults: Record<string, ComparisonResult> = { ...initialResults };

    const controllers = modelIds.map(() => new AbortController());
    activeControllersRef.current = controllers;

    await Promise.allSettled(
      modelIds.map(async (modelId, index) => {
        const controller = controllers[index];
        const model = availableModels.find((item) => item.id === modelId);
        const requestPrompt = shouldUsePromptThinkingFallback(model)
          ? wrapPromptForVisibleThinking(prompt)
          : prompt;

        try {
          const response = await authorizedFetch('/api/compare-stream', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ prompt: requestPrompt, modelId }),
            signal: controller.signal,
          });
          const normalizedResult = await readCompareStream(response, modelId, (delta, channel) => {
            if (controller.signal.aborted || compareRunRef.current !== runId) {
              return;
            }

            const nextPartialResult: ComparisonResult = {
              modelId,
              result: channel === 'output'
                ? `${settledResults[modelId]?.result || ''}${delta}`
                : settledResults[modelId]?.result || '',
              reasoning: channel === 'reasoning'
                ? `${settledResults[modelId]?.reasoning || ''}${delta}`
                : settledResults[modelId]?.reasoning || '',
              status: 'thinking',
            };

            settledResults[modelId] = nextPartialResult;

            setResults((prev) => ({
              ...prev,
              [modelId]: nextPartialResult,
            }));
          });

          if (compareRunRef.current !== runId) {
            return;
          }

          settledResults[modelId] = normalizedResult;

          setResults((prev) => ({
            ...prev,
            [modelId]: normalizedResult,
          }));
        } catch (error) {
          if (controller.signal.aborted || compareRunRef.current !== runId) {
            return;
          }

          console.error(`Comparison failed for ${modelId}:`, error);
          const partialResult = settledResults[modelId]?.result || '';
          const normalizedResult: ComparisonResult = {
            modelId,
            result: partialResult
              ? `${partialResult}\n\n[生成中断] ${error instanceof Error ? error.message : '比较请求失败。'}`
              : error instanceof Error ? error.message : '比较请求失败。',
            status: 'error',
            reasoning: settledResults[modelId]?.reasoning || '',
          };
          settledResults[modelId] = normalizedResult;

          setResults((prev) => ({
            ...prev,
            [modelId]: normalizedResult,
          }));
        }
      }),
    );

    if (compareRunRef.current === runId) {
      activeControllersRef.current = [];
    }

    if (compareRunRef.current !== runId) {
      return;
    }

    if (modelIds.length < 2) {
      setDifferenceSummary({
        modelId: DIFFERENCE_SUMMARY_MODEL_ID,
        content: '当前仅选择了 1 个模型，至少选择 2 个模型后才会生成核心差异。',
        status: 'completed',
      });
      return;
    }

    const summaryController = new AbortController();
    summaryControllerRef.current = summaryController;

    setDifferenceSummary({
      modelId: DIFFERENCE_SUMMARY_MODEL_ID,
      content: '',
      status: 'thinking',
    });

    try {
      const response = await authorizedFetch('/api/compare', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({
          prompt: buildDifferenceSummaryPrompt(prompt, modelIds, availableModels, settledResults),
          models: [DIFFERENCE_SUMMARY_MODEL_ID],
        }),
        signal: summaryController.signal,
      });

      const data = await response.json();
      const summaryResult = Array.isArray(data?.results)
        ? data.results.find((item: { modelId?: string }) => item?.modelId === DIFFERENCE_SUMMARY_MODEL_ID)
        : null;

      if (compareRunRef.current !== runId || summaryController.signal.aborted) {
        return;
      }

      setDifferenceSummary({
        modelId: DIFFERENCE_SUMMARY_MODEL_ID,
        content: typeof summaryResult?.result === 'string' && summaryResult.result
          ? summaryResult.result
          : '豆包已完成总结，但没有返回可展示的核心差异。',
        status: summaryResult?.status === 'completed' ? 'completed' : 'error',
      });
    } catch (error) {
      if (summaryController.signal.aborted || compareRunRef.current !== runId) {
        return;
      }

      setDifferenceSummary({
        modelId: DIFFERENCE_SUMMARY_MODEL_ID,
        content: error instanceof Error ? error.message : '核心差异总结失败。',
        status: 'error',
      });
    } finally {
      if (summaryControllerRef.current === summaryController) {
        summaryControllerRef.current = null;
      }
    }
  };

  const reset = () => {
    compareRunRef.current += 1;
    abortActiveComparisons();
    abortDifferenceSummary();
    setIsComparing(false);
    setResults({});
    setPreviewData(null);
    setDifferenceSummary({
      modelId: null,
      content: '',
      status: 'idle',
    });
  };

  const visibleChannels = [...new Set(availableModels.map((model) => model.channel))];
  const filteredModels = availableModels.filter((model) => activeTab === 'all' || model.channel === activeTab);
  const summaryModelName = differenceSummary.modelId === DIFFERENCE_SUMMARY_MODEL_ID
    ? DIFFERENCE_SUMMARY_MODEL_NAME
    : '豆包模型';

  return (
    <div className="h-screen bg-[#FAFAFA] text-[#1D1D1F] font-sans selection:bg-blue-100 overflow-hidden flex flex-col">
      {authStatus !== 'authenticated' ? (
        <div className="relative flex-1 overflow-hidden bg-[radial-gradient(circle_at_top,#F4F7FF_0%,#F8F8FA_42%,#F3F3F5_100%)] px-6 py-10">
          <div className="pointer-events-none absolute left-1/2 top-16 h-64 w-64 -translate-x-[130%] rounded-full bg-[#DCE7FF] blur-3xl opacity-70" />
          <div className="pointer-events-none absolute right-1/2 bottom-10 h-72 w-72 translate-x-[135%] rounded-full bg-white blur-3xl opacity-80" />
          <motion.form
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            onSubmit={submitActivationKey}
            className="relative mx-auto flex h-full w-full max-w-[540px] items-center"
          >
            <div className="w-full rounded-[40px] border border-white/70 bg-white/80 p-3 shadow-[0_30px_90px_rgba(20,20,43,0.12)] backdrop-blur-2xl">
              <div className="rounded-[32px] border border-black/5 bg-white/80 p-8 md:p-10">
                <div className="mb-8 flex items-start justify-between gap-6">
                  <div>
                    <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-black/5 bg-[#F5F5F7] px-3 py-1 text-[11px] font-semibold tracking-[0.22em] text-[#6E6E73] uppercase">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" />
                      Sabrina Access
                    </div>
                    <h1 className="text-[34px] font-semibold tracking-[-0.04em] text-[#111111]">
                      AI Model Sabrina II
                    </h1>
                    <p className="mt-3 max-w-sm text-[15px] leading-7 text-[#6E6E73]">
                      输入激活密钥后进入模型工作台。
                    </p>
                  </div>

                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[20px] bg-[#111111] text-white shadow-[0_18px_40px_rgba(17,17,17,0.18)]">
                    {authStatus === 'checking' || authStatus === 'submitting' ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <ShieldCheck className="h-5 w-5" />
                    )}
                  </div>
                </div>

                <div className="grid gap-3">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#8E8E93]">
                    激活密钥
                  </label>
                  <div className="flex items-center gap-3 rounded-[24px] border border-black/6 bg-[#F5F5F7] px-4 py-4 transition focus-within:border-black/15 focus-within:bg-white focus-within:shadow-[0_0_0_4px_rgba(0,122,255,0.08)]">
                    <KeyRound className="h-4.5 w-4.5 shrink-0 text-[#8E8E93]" />
                    <input
                      value={activationInput}
                      onChange={(event) => setActivationInput(event.target.value)}
                      placeholder="输入激活密钥"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      disabled={authStatus === 'checking' || authStatus === 'submitting'}
                      className="w-full bg-transparent font-mono text-sm tracking-[0.04em] text-[#111111] outline-none placeholder:text-[#AEAEB2] disabled:cursor-not-allowed"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={!activationInput.trim() || authStatus === 'checking' || authStatus === 'submitting'}
                    className="mt-2 inline-flex w-full items-center justify-center gap-2 rounded-[24px] bg-[#111111] px-4 py-4 text-sm font-semibold text-white shadow-[0_18px_30px_rgba(17,17,17,0.16)] transition hover:bg-black disabled:cursor-not-allowed disabled:bg-[#C7C7CC] disabled:shadow-none"
                  >
                    {authStatus === 'submitting' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
                    {authStatus === 'checking' ? '正在校验' : authStatus === 'submitting' ? '校验中...' : '进入系统'}
                  </button>
                </div>

                {authError && (
                  <div className="mt-4 rounded-[22px] border border-red-100 bg-red-50/90 px-4 py-3 text-sm text-red-600">
                    {authError}
                  </div>
                )}

                <div className="mt-6 flex items-center justify-between gap-4 text-xs text-[#8E8E93]">
                  <span>{authStatus === 'checking' ? '正在验证已保存密钥' : '激活后会记住当前设备'}</span>
                  <span className="rounded-full bg-[#F5F5F7] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[#6E6E73]">
                    Private Access
                  </span>
                </div>
              </div>
            </div>
          </motion.form>
        </div>
      ) : (
      <>
      <AnimatePresence mode="wait">
        {!isComparing ? (
          <motion.div
            key="start"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex-1 max-w-5xl mx-auto w-full flex flex-col pt-4 px-6 overflow-hidden"
          >
            <div className="relative text-center mb-3 shrink-0">
              <button
                onClick={handleLogout}
                className="absolute right-0 top-0 inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#5C5C60] transition hover:border-black/20 hover:text-[#1D1D1F]"
              >
                <LogOut className="h-3.5 w-3.5" />
                退出登录
              </button>
              <h1 className="text-2xl font-bold tracking-tight mb-0.5">AI Model Sabrina Ⅱ</h1>
              <p className="text-[10px] text-[#86868B] uppercase tracking-widest font-medium">一句提示词，多个模型一起出</p>
            </div>

            <div className="flex-1 bg-white rounded-3xl shadow-2xl shadow-black/5 border border-black/5 mb-4 flex flex-col min-h-0 overflow-hidden">
              {/* Input Area - Further increased height for better focus */}
              <div className="relative h-[380px] shrink-0 p-5 pb-2">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="在此输入您的提示词..."
                  className="w-full h-full p-6 text-lg bg-white rounded-2xl border border-black/5 focus:ring-2 focus:ring-blue-500/10 transition-all resize-none placeholder:text-[#86868B] font-medium custom-scrollbar"
                />
                <div className="absolute top-8 right-10 flex items-center gap-3">
                  <div className="text-[10px] font-mono text-[#86868B] bg-white/80 px-2 py-0.5 rounded-full backdrop-blur-sm border border-black/5">
                    {prompt.length} 字符
                  </div>
                </div>
                <div className="absolute bottom-5 left-8">
                  <button
                    onClick={() => setPreviewData({ 
                      title: '提示词全览', 
                      subtitle: '适合审阅长篇内容，确保逻辑完整', 
                      content: prompt 
                    })}
                    disabled={!prompt.trim()}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white/80 hover:bg-white text-[#86868B] hover:text-[#1D1D1F] rounded-full backdrop-blur-sm border border-black/5 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed group"
                    title="放大预览"
                  >
                    <Maximize2 className="w-3.5 h-3.5 transition-transform group-hover:scale-110" />
                    <span className="text-[10px] font-bold uppercase tracking-wider">预览</span>
                  </button>
                </div>
                <div className="absolute bottom-5 right-8 flex items-center gap-3">
                  {prompt && (
                    <button 
                      onClick={() => setPrompt('')}
                      className="text-[10px] font-bold uppercase tracking-wider text-red-500 hover:text-red-600 transition-colors"
                    >
                      清空
                    </button>
                  )}
                </div>
              </div>

              {/* Selection Area - Ultra compact cards */}
              <div className="flex-1 min-h-0 flex flex-col px-5 pb-4">
                <div className="flex items-center justify-between mb-2 shrink-0">
                  <div className="flex items-center gap-3">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[#86868B] flex items-center gap-2">
                      <Cpu className="w-3.5 h-3.5" /> 模型选择
                    </h3>
                    <div className="h-4 w-px bg-black/10" />
                    <div className="bg-gray-100/50 p-0.5 rounded-md flex gap-0.5">
                      {['all', ...visibleChannels].map((c) => (
                        <button
                          key={c}
                          onClick={() => setActiveTab(c)}
                          className={`px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                            activeTab === c 
                              ? 'bg-white text-blue-600 shadow-sm' 
                              : 'text-[#86868B] hover:text-[#1D1D1F]'
                      }`}
                    >
                      {c === 'all' ? '全部' : c === 'china' ? '国产' : '国际'}
                    </button>
                  ))}
                </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {selectedModels.length > 0 && (
                      <button 
                        onClick={() => setSelectedModels([])}
                        className="text-[10px] font-bold text-red-500 hover:text-red-600 uppercase tracking-tighter"
                      >
                        重置
                      </button>
                    )}
                    <div className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">
                      已选 {selectedModels.length}
                    </div>
                  </div>
                </div>

                <div className="flex-1 min-h-0 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2 overflow-y-auto pr-1 custom-scrollbar mb-4">
                  {filteredModels.map((model) => (
                    <button
                      key={model.id}
                      onClick={() => toggleModel(model.id)}
                      className={`group relative flex flex-col justify-center p-2.5 rounded-xl border transition-all text-left h-[72px] ${
                        selectedModels.includes(model.id)
                          ? 'border-blue-500 bg-blue-50/40 ring-1 ring-blue-500 shadow-sm'
                          : 'border-black/5 bg-white hover:border-black/10 hover:shadow-sm'
                      }`}
                    >
                      {/* Row 1: Name */}
                      <div className="flex items-center justify-between w-full mb-0.5">
                        <span className="font-bold text-[11px] leading-tight line-clamp-1 flex-1">{model.name}</span>
                        {selectedModels.includes(model.id) && (
                          <CheckCircle2 className="w-3 h-3 text-blue-600 shrink-0 ml-1" />
                        )}
                      </div>
                      
                      {/* Row 2: Tag */}
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          model.channel === 'china' ? 'bg-red-400' : 'bg-pink-400'
                        }`} />
                        <span className="text-[9px] font-bold text-[#86868B] uppercase tracking-tighter">
                          {model.category}
                        </span>
                      </div>

                      {/* Row 3: Description */}
                      <div className="w-full">
                        <span className="text-[9px] text-[#86868B] line-clamp-1 opacity-70">
                          {model.description}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>

                {/* Selected Chips - Very compact */}
                {selectedModels.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-1.5 max-h-[48px] overflow-y-auto pr-1 custom-scrollbar shrink-0">
                    <AnimatePresence mode="popLayout">
                      {selectedModels.map((modelId) => {
                        const model = availableModels.find(m => m.id === modelId);
                        if (!model) return null;
                        return (
                          <motion.div
                            key={modelId}
                            layout
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            className="flex items-center gap-1 px-2 py-0.5 bg-gray-100/50 border border-black/5 rounded-full"
                          >
                            <span className="text-[11px] font-bold text-[#1D1D1F]">{model.name}</span>
                            <button 
                              onClick={() => toggleModel(modelId)}
                              className="p-0.5 hover:bg-red-100 rounded-full transition-colors"
                            >
                              <X className="w-2.5 h-2.5 text-[#86868B] hover:text-red-500" />
                            </button>
                          </motion.div>
                        );
                      })}
                    </AnimatePresence>
                  </div>
                )}

                {/* Action Button - Anchored at the bottom of the card */}
                <button
                  onClick={startComparison}
                  disabled={!catalogReady || !prompt.trim() || selectedModels.length === 0}
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-[#E5E5E7] disabled:cursor-not-allowed text-white rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2 shadow-xl shadow-blue-500/20 active:scale-[0.98] shrink-0"
                >
                  <Send className="w-5 h-5" />
                  开始对比
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="results"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col p-6 overflow-hidden"
          >
            <div className="max-w-7xl mx-auto w-full flex flex-col h-full">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6 shrink-0">
                <div>
                  <button 
                    onClick={reset}
                    className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium mb-2 group text-sm"
                  >
                    <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                    返回首页
                  </button>
                  <h2 className="text-2xl font-bold tracking-tight">对比结果</h2>
                </div>
                <div className="flex items-start gap-3">
                  <div className="bg-white px-4 py-2 rounded-xl border border-black/5 shadow-sm max-w-xl">
                    <p className="text-[10px] text-[#86868B] font-bold uppercase tracking-wider mb-0.5">提示词</p>
                    <p className="text-[#1D1D1F] text-sm line-clamp-1 italic">"{prompt}"</p>
                  </div>
                  <button
                    onClick={handleLogout}
                    className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#5C5C60] transition hover:border-black/20 hover:text-[#1D1D1F]"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    退出登录
                  </button>
                </div>
              </div>

              <div className="mb-4 bg-white rounded-2xl border border-black/5 shadow-sm overflow-hidden shrink-0">
                <div className="px-5 py-4 border-b border-black/5 bg-white flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="p-2 rounded-xl bg-blue-50 shrink-0">
                      <Layers className="w-4 h-4 text-blue-600" />
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-bold text-base">核心差异</h3>
                      <p className="text-xs text-[#86868B] truncate">
                        等待全部模型完成后，由 {summaryModelName} 自动汇总几条最关键的差异。
                      </p>
                    </div>
                  </div>

                  {differenceSummary.status === 'waiting' && (
                    <div className="text-xs font-medium text-[#86868B] shrink-0">等待结果</div>
                  )}
                  {differenceSummary.status === 'thinking' && (
                    <div className="flex items-center gap-1.5 text-blue-600 text-xs font-medium shrink-0">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      总结中...
                    </div>
                  )}
                  {differenceSummary.status === 'completed' && (
                    <div className="flex items-center gap-1 text-emerald-600 text-xs font-medium shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      已就绪
                    </div>
                  )}
                  {differenceSummary.status === 'error' && (
                    <div className="text-xs font-medium text-red-500 shrink-0">生成失败</div>
                  )}
                </div>

                <div className="px-5 py-4 bg-white">
                  {differenceSummary.status === 'waiting' && (
                    <div className="text-sm leading-relaxed text-[#86868B]">
                      等待所有模型结果返回后，再统一生成“核心差异”。
                    </div>
                  )}

                  {differenceSummary.status === 'thinking' && (
                    <div className="space-y-4 text-[#86868B]">
                      <div className="space-y-3">
                        <div className="h-3 bg-[#F5F5F7] rounded w-1/3 animate-pulse" />
                        <div className="h-3 bg-[#F5F5F7] rounded w-5/6 animate-pulse" />
                        <div className="h-3 bg-[#F5F5F7] rounded w-2/3 animate-pulse" />
                      </div>
                      <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] leading-relaxed text-blue-700">
                        正在读取所有模型输出，并用豆包模型提炼几条最关键的差异。
                      </div>
                    </div>
                  )}

                  {differenceSummary.status === 'error' && (
                    <div className="text-red-500 bg-red-50 p-3 rounded-xl border border-red-100 text-sm">
                      {differenceSummary.content}
                    </div>
                  )}

                  {differenceSummary.status === 'completed' && (
                    <div className="whitespace-pre-wrap text-sm leading-relaxed text-[#424245]">
                      {differenceSummary.content}
                    </div>
                  )}
                </div>
              </div>

              <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 overflow-y-auto pr-2 custom-scrollbar pb-4">
                {selectedModels.map((modelId) => {
                  const model = availableModels.find(m => m.id === modelId);
                  const result = results[modelId];
                  const displayedText = getDisplayedText(result);

                  return (
                    <motion.div
                      layout
                      key={modelId}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-white rounded-2xl border border-black/5 shadow-sm flex flex-col h-[500px] overflow-hidden"
                    >
                      <div className="p-4 border-b border-black/5 flex items-center justify-between bg-white shrink-0">
                        <div>
                          <h3 className="font-bold text-base">{model?.name}</h3>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-widest">{model?.category}</span>
                            <span className="text-[10px] text-[#86868B]">•</span>
                            <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase tracking-tighter">
                              {model?.channel === 'china' ? '国产' : '国际'}
                            </span>
                            <span className="text-[10px] text-[#86868B]">•</span>
                            <span className="text-[10px] text-[#86868B] italic">{model?.description}</span>
                          </div>
                        </div>
                        {result?.status === 'thinking' && (
                          <div className="flex items-center gap-1.5 text-blue-600 text-xs font-medium">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            思考中...
                          </div>
                        )}
                        {result?.status === 'completed' && (
                          <div className="flex items-center gap-1 text-emerald-600 text-xs font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            已就绪
                          </div>
                        )}
                      </div>

                      <div className="flex-1 overflow-y-auto p-5 font-mono text-xs leading-relaxed text-[#424245] bg-white custom-scrollbar">
                        {result?.status === 'thinking' ? (
                          displayedText.inProgress ? (
                            <div className="space-y-4">
                              <div className="whitespace-pre-wrap text-[#424245]">
                                {displayedText.inProgress}
                              </div>
                              <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] leading-relaxed text-blue-700">
                                正在持续生成中。这里展示的是“思考摘要”，完成后只保留最终结果。
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-4 text-[#86868B]">
                              <div className="space-y-3">
                                <div className="h-3 bg-[#F5F5F7] rounded w-3/4 animate-pulse" />
                              <div className="h-3 bg-[#F5F5F7] rounded w-1/2 animate-pulse" />
                              <div className="h-3 bg-[#F5F5F7] rounded w-5/6 animate-pulse" />
                            </div>
                            <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] leading-relaxed text-blue-700">
                              正在单独请求这个模型。复杂提示词可能需要 20 到 300 秒。
                            </div>
                          </div>
                          )
                        ) : result?.status === 'error' ? (
                          <div className="text-red-500 bg-red-50 p-3 rounded-xl border border-red-100 text-xs">
                            {displayedText.final || '生成响应失败。'}
                          </div>
                        ) : (
                          <div className="whitespace-pre-wrap">
                            {displayedText.final}
                          </div>
                        )}
                      </div>

                      <div className="p-3 bg-white border-t border-black/5 flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-3">
                          <span className="text-[9px] text-[#86868B] uppercase font-bold tracking-tighter">
                            输出: {displayedText.final.length || 0} 字符
                          </span>
                          <button 
                            onClick={() => setPreviewData({
                              title: `${model?.name} 结果全览`,
                              subtitle: `查看 ${model?.name} 生成的完整响应`,
                              content: displayedText.final || ''
                            })}
                            disabled={!displayedText.final}
                            className="flex items-center gap-1 text-[9px] text-[#86868B] hover:text-[#1D1D1F] font-bold uppercase tracking-tighter transition-colors disabled:opacity-30"
                          >
                            <Maximize2 className="w-2.5 h-2.5" />
                            全屏预览
                          </button>
                        </div>
                        <button 
                          onClick={() => {
                            if (displayedText.final) {
                              navigator.clipboard.writeText(displayedText.final);
                            }
                          }}
                          className="text-[10px] text-blue-600 hover:underline font-bold uppercase tracking-wider"
                        >
                          复制
                        </button>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      </>
      )}

      <footer className="shrink-0 py-3 text-center text-[#86868B] text-[11px] border-t border-black/5 bg-white">
        <div className="flex items-center justify-center gap-2">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Sabrina Ⅱ • 多模型协同引擎</span>
          <span className="text-black/10">|</span>
          <span>© 2026</span>
        </div>
      </footer>

      {/* Content Preview Modal */}
      <AnimatePresence>
        {previewData && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/40 backdrop-blur-md"
            onClick={() => setPreviewData(null)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="bg-white w-[96vw] h-[96vh] max-w-none max-h-none rounded-[32px] shadow-2xl overflow-hidden flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-8 py-5 border-b border-black/5 flex items-center justify-between bg-white">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-blue-50 rounded-xl">
                    <Sparkles className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">{previewData.title}</h3>
                    <p className="text-xs text-[#86868B] font-medium">{previewData.subtitle}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(previewData.content);
                    }}
                    className="px-4 py-2 text-xs font-bold text-blue-600 hover:bg-blue-50 rounded-full transition-colors border border-blue-100"
                  >
                    复制全文
                  </button>
                  <button
                    onClick={() => setPreviewData(null)}
                    className="p-2 hover:bg-black/5 rounded-full transition-colors"
                  >
                    <X className="w-6 h-6 text-[#86868B]" />
                  </button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-8 custom-scrollbar bg-white">
                <div className="w-full">
                  <div className="text-sm leading-relaxed text-[#1D1D1F] font-mono whitespace-pre-wrap selection:bg-blue-100 bg-white p-8 rounded-2xl border border-black/5 shadow-inner min-h-full">
                    {previewData.content}
                  </div>
                </div>
              </div>
              <div className="px-8 py-4 border-t border-black/5 bg-white flex items-center justify-between">
                <div className="text-xs font-mono text-[#86868B]">
                  共 {previewData.content.length} 个字符
                </div>
                <button
                  onClick={() => setPreviewData(null)}
                  className="px-6 py-2 bg-[#1D1D1F] text-white rounded-full font-bold text-sm hover:bg-black transition-colors"
                >
                  返回
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
