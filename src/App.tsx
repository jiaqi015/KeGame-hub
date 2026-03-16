import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Layers, Cpu, CheckCircle2, Loader2, ArrowLeft, Send, Sparkles, X, Maximize2 } from 'lucide-react';
import { ComparisonResult, AIModel } from './types';

type DifferenceSummaryStatus = 'idle' | 'waiting' | 'thinking' | 'completed' | 'error';

interface DifferenceSummaryState {
  modelId: string | null;
  content: string;
  status: DifferenceSummaryStatus;
}

interface CompareStreamEvent {
  type: 'delta' | 'completed' | 'error';
  delta?: string;
  result?: string;
  error?: string;
}

const DIFFERENCE_SUMMARY_MODEL_ID = 'doubao-seed-2-0-pro-260215';
const DIFFERENCE_SUMMARY_MODEL_NAME = 'Doubao-Seed-2.0-pro';
const SUMMARY_INPUT_CHAR_LIMIT = 6000;

function truncateForSummary(value: string, limit = SUMMARY_INPUT_CHAR_LIMIT): string {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit)}\n\n[后续内容已截断，保留前 ${limit} 个字符用于差异总结]`;
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

    const content = truncateForSummary(result?.result || '该模型没有返回可用内容。');

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

async function readCompareStream(
  response: Response,
  modelId: string,
  onDelta: (delta: string) => void,
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
      aggregatedText += event.delta;
      onDelta(event.delta);
      return null;
    }

    if (event.type === 'completed') {
      return {
        modelId,
        result: typeof event.result === 'string' && event.result ? event.result : aggregatedText,
        status: 'completed',
      };
    }

    if (event.type === 'error') {
      return {
        modelId,
        result: typeof event.error === 'string' ? event.error : '模型流式输出失败。',
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
    };
  }

  throw new Error('模型未返回可展示的流式内容。');
}

export default function App() {
  const [prompt, setPrompt] = useState('');
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
    let disposed = false;

    const loadModels = async () => {
      try {
        const response = await fetch('/api/models');
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
      abortActiveComparisons();
      abortDifferenceSummary();
    };
  }, []);

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
      initialResults[id] = { modelId: id, result: '', status: 'thinking' };
    });
    setResults(initialResults);
    const settledResults: Record<string, ComparisonResult> = { ...initialResults };

    const controllers = modelIds.map(() => new AbortController());
    activeControllersRef.current = controllers;

    await Promise.allSettled(
      modelIds.map(async (modelId, index) => {
        const controller = controllers[index];

        try {
          const response = await fetch('/api/compare-stream', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt, modelId }),
            signal: controller.signal,
          });
          const normalizedResult = await readCompareStream(response, modelId, (delta) => {
            if (controller.signal.aborted || compareRunRef.current !== runId) {
              return;
            }

            const nextPartialResult: ComparisonResult = {
              modelId,
              result: `${settledResults[modelId]?.result || ''}${delta}`,
              status: 'thinking',
            };

            settledResults[modelId] = nextPartialResult;

            setResults((prev) => ({
              ...prev,
              [modelId]: {
                modelId,
                result: `${prev[modelId]?.result || ''}${delta}`,
                status: 'thinking',
              },
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
      const response = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
      <AnimatePresence mode="wait">
        {!isComparing ? (
          <motion.div
            key="start"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex-1 max-w-5xl mx-auto w-full flex flex-col pt-4 px-6 overflow-hidden"
          >
            <div className="text-center mb-3 shrink-0">
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
                <div className="bg-white px-4 py-2 rounded-xl border border-black/5 shadow-sm max-w-xl">
                  <p className="text-[10px] text-[#86868B] font-bold uppercase tracking-wider mb-0.5">提示词</p>
                  <p className="text-[#1D1D1F] text-sm line-clamp-1 italic">"{prompt}"</p>
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
                          result?.result ? (
                            <div className="space-y-4">
                              <div className="whitespace-pre-wrap text-[#424245]">
                                {result.result}
                              </div>
                              <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-[11px] leading-relaxed text-blue-700">
                                正在持续生成中，内容会边返回边写入当前卡片。
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
                                正在单独请求这个模型。复杂提示词可能需要 20 到 120 秒。
                              </div>
                            </div>
                          )
                        ) : result?.status === 'error' ? (
                          <div className="text-red-500 bg-red-50 p-3 rounded-xl border border-red-100 text-xs">
                            {result?.result || '生成响应失败。'}
                          </div>
                        ) : (
                          <div className="whitespace-pre-wrap">
                            {result?.result}
                          </div>
                        )}
                      </div>

                      <div className="p-3 bg-white border-t border-black/5 flex justify-between items-center shrink-0">
                        <div className="flex items-center gap-3">
                          <span className="text-[9px] text-[#86868B] uppercase font-bold tracking-tighter">
                            输出: {result?.result.length || 0} 字符
                          </span>
                          <button 
                            onClick={() => setPreviewData({
                              title: `${model?.name} 结果全览`,
                              subtitle: `查看 ${model?.name} 生成的完整响应`,
                              content: result?.result || ''
                            })}
                            disabled={!result?.result}
                            className="flex items-center gap-1 text-[9px] text-[#86868B] hover:text-[#1D1D1F] font-bold uppercase tracking-tighter transition-colors disabled:opacity-30"
                          >
                            <Maximize2 className="w-2.5 h-2.5" />
                            全屏预览
                          </button>
                        </div>
                        <button 
                          onClick={() => {
                            if (result?.result) {
                              navigator.clipboard.writeText(result.result);
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
