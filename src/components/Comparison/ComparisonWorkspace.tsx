import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, LogOut, Cpu, Send, X, 
  Maximize2, CheckCircle2, Loader2, Layers 
} from 'lucide-react';
import { AppState, DifferenceSummaryStatus } from '../../app/appReducer';
import { 
  getDisplayedText, 
  DIFFERENCE_SUMMARY_MODEL_ID, 
  DIFFERENCE_SUMMARY_MODEL_NAME 
} from '../../services/apiService';

interface ComparisonWorkspaceProps {
  state: AppState;
  onSetPrompt: (val: string) => void;
  onToggleModel: (id: string) => void;
  onSetActiveTab: (tab: string) => void;
  onResetSelectedModels: () => void;
  onStartComparison: () => void;
  onReset: () => void;
  onReturnToHub: () => void;
  onLogout: () => void;
  sessionExpiresAt?: string;
  onPreview: (title: string, subtitle: string, content: string) => void;
}

export function ComparisonWorkspace({
  state,
  onSetPrompt,
  onToggleModel,
  onSetActiveTab,
  onResetSelectedModels,
  onStartComparison,
  onReset,
  onReturnToHub,
  onLogout,
  sessionExpiresAt,
  onPreview,
}: ComparisonWorkspaceProps) {
  const {
    prompt,
    selectedModels,
    availableModels,
    isComparing,
    results,
    differenceSummary,
    activeTab,
    catalogReady,
  } = state;

  const visibleChannels = [...new Set(availableModels.map((model) => model.channel))];
  const filteredModels = availableModels.filter((model) => activeTab === 'all' || model.channel === activeTab);
  const summaryModelName = differenceSummary.modelId === DIFFERENCE_SUMMARY_MODEL_ID
    ? DIFFERENCE_SUMMARY_MODEL_NAME
    : '豆包模型';

  return (
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
              onClick={onReturnToHub}
              className="absolute left-0 top-0 inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#5C5C60] transition hover:border-black/20 hover:text-[#1D1D1F]"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              返回 Hub
            </button>
            <button
              onClick={onLogout}
              className="absolute right-0 top-0 inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-[#5C5C60] transition hover:border-black/20 hover:text-[#1D1D1F]"
            >
              <LogOut className="h-3.5 w-3.5" />
              登出账号
            </button>
            <h1 className="text-2xl font-bold tracking-tight mb-0.5">多模型PK</h1>
            <p className="text-[10px] text-[#86868B] uppercase tracking-widest font-medium">一句提示词，多个模型一起出</p>
          </div>

          <div className="flex-1 bg-white rounded-3xl shadow-2xl shadow-black/5 border border-black/5 mb-4 flex flex-col min-h-0 overflow-hidden">
            <div className="relative h-[380px] shrink-0 p-5 pb-2">
              <textarea
                value={prompt}
                onChange={(e) => onSetPrompt(e.target.value)}
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
                  onClick={() => onPreview('提示词全览', '适合审阅长篇内容，确保逻辑完整', prompt)}
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
                    onClick={() => onSetPrompt('')}
                    className="text-[10px] font-bold uppercase tracking-wider text-red-500 hover:text-red-600 transition-colors"
                  >
                    清空
                  </button>
                )}
              </div>
            </div>

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
                        onClick={() => onSetActiveTab(c)}
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
                      onClick={onResetSelectedModels}
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
                    onClick={() => onToggleModel(model.id)}
                    className={`group relative flex flex-col justify-center p-2.5 rounded-xl border transition-all text-left h-[72px] ${
                      selectedModels.includes(model.id)
                        ? 'border-blue-500 bg-blue-50/40 ring-1 ring-blue-500 shadow-sm'
                        : 'border-black/5 bg-white hover:border-black/10 hover:shadow-sm'
                    }`}
                  >
                    <div className="flex items-center justify-between w-full mb-0.5">
                      <span className="font-bold text-[11px] leading-tight line-clamp-1 flex-1">{model.name}</span>
                      {selectedModels.includes(model.id) && (
                        <CheckCircle2 className="w-3 h-3 text-blue-600 shrink-0 ml-1" />
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        model.channel === 'china' ? 'bg-red-400' : 'bg-pink-400'
                      }`} />
                      <span className="text-[9px] font-bold text-[#86868B] uppercase tracking-tighter">
                        {model.category}
                      </span>
                    </div>
                    <div className="w-full">
                      <span className="text-[9px] text-[#86868B] line-clamp-1 opacity-70">
                        {model.description}
                      </span>
                    </div>
                  </button>
                ))}
              </div>

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
                            onClick={() => onToggleModel(modelId)}
                            aria-label={`移除模型 ${model.name}`}
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

              <button
                onClick={onStartComparison}
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
                  onClick={onReset}
                  className="flex items-center gap-2 text-blue-600 hover:text-blue-700 font-medium mb-2 group text-sm"
                >
                  <ArrowLeft className="w-4 h-4 transition-transform group-hover:-translate-x-1" />
                  返回上一层
                </button>
                <h2 className="text-2xl font-bold tracking-tight">对比结果</h2>
              </div>
              <div className="flex items-start gap-3">
                <div className="bg-white px-4 py-2 rounded-xl border border-black/5 shadow-sm max-w-xl">
                  <p className="text-[10px] text-[#86868B] font-bold uppercase tracking-wider mb-0.5">提示词</p>
                  <p className="text-[#1D1D1F] text-sm line-clamp-1 italic">"{prompt}"</p>
                </div>
                <button
                  onClick={onReturnToHub}
                  className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#5C5C60] transition hover:border-black/20 hover:text-[#1D1D1F]"
                >
                  <ArrowLeft className="h-3.5 w-3.5" />
                  功能页
                </button>
                <button
                  onClick={onLogout}
                  className="inline-flex items-center gap-1.5 rounded-full border border-black/10 bg-white px-3 py-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#5C5C60] transition hover:border-black/20 hover:text-[#1D1D1F]"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  登出账号
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

                {differenceSummary.status === 'waiting' && <div className="text-xs font-medium text-[#86868B] shrink-0">等待结果</div>}
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
                {differenceSummary.status === 'error' && <div className="text-xs font-medium text-red-500 shrink-0">生成失败</div>}
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
              {Object.keys(results).map((modelId) => {
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
                        <h3 className="font-bold text-base">{model?.name || modelId}</h3>
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
                          onClick={() => onPreview(`${model?.name} 结果全览`, `查看 ${model?.name} 生成的完整响应`, displayedText.final || '')}
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
  );
}
