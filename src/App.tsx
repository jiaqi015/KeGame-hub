import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Layers, Cpu, CheckCircle2, Loader2, ArrowLeft, Send, Sparkles, X } from 'lucide-react';
import { AVAILABLE_MODELS, ComparisonResult } from './types';

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [selectedModels, setSelectedModels] = useState<string[]>(['doubao-seed-2.0-code']);
  const [activeTab, setActiveTab] = useState('all');
  const [isComparing, setIsComparing] = useState(false);
  const [results, setResults] = useState<Record<string, ComparisonResult>>({});

  const toggleModel = (id: string) => {
    setSelectedModels(prev => 
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const startComparison = async () => {
    if (!prompt.trim() || selectedModels.length === 0) return;

    setIsComparing(true);
    
    const initialResults: Record<string, ComparisonResult> = {};
    selectedModels.forEach(id => {
      initialResults[id] = { modelId: id, result: '', status: 'thinking' };
    });
    setResults(initialResults);

    try {
      const response = await fetch('/api/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, models: selectedModels }),
      });

      const data = await response.json();
      
      const updatedResults: Record<string, ComparisonResult> = { ...initialResults };
      data.results.forEach((res: { modelId: string; result: string }) => {
        updatedResults[res.modelId] = {
          modelId: res.modelId,
          result: res.result,
          status: 'completed'
        };
      });
      setResults(updatedResults);
    } catch (error) {
      console.error('Comparison failed:', error);
      setResults(prev => {
        const next = { ...prev };
        Object.keys(next).forEach(id => {
          if (next[id].status === 'thinking') next[id].status = 'error';
        });
        return next;
      });
    }
  };

  const reset = () => {
    setIsComparing(false);
    setResults({});
  };

  return (
    <div className="h-screen bg-[#F5F5F7] text-[#1D1D1F] font-sans selection:bg-blue-100 overflow-hidden flex flex-col">
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
              <p className="text-[10px] text-[#86868B] uppercase tracking-widest font-medium">Multi-Model Comparison Engine</p>
            </div>

            <div className="flex-1 bg-white rounded-3xl shadow-2xl shadow-black/5 border border-black/5 mb-4 flex flex-col min-h-0 overflow-hidden">
              {/* Input Area - Further increased height for better focus */}
              <div className="relative h-[380px] shrink-0 p-5 pb-2">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Enter your prompt here..."
                  className="w-full h-full p-6 text-lg bg-[#F5F5F7] rounded-2xl border-none focus:ring-2 focus:ring-blue-500/10 transition-all resize-none placeholder:text-[#86868B] font-medium custom-scrollbar"
                />
                <div className="absolute bottom-5 right-8 flex items-center gap-3">
                  {prompt && (
                    <button 
                      onClick={() => setPrompt('')}
                      className="text-[10px] font-bold uppercase tracking-wider text-red-500 hover:text-red-600 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                  <div className="text-[10px] font-mono text-[#86868B] bg-white/50 px-2 py-0.5 rounded-full backdrop-blur-sm border border-black/5">
                    {prompt.length} chars
                  </div>
                </div>
              </div>

              {/* Selection Area - Ultra compact cards */}
              <div className="flex-1 min-h-0 flex flex-col px-5 pb-4">
                <div className="flex items-center justify-between mb-2 shrink-0">
                  <div className="flex items-center gap-3">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[#86868B] flex items-center gap-2">
                      <Cpu className="w-3.5 h-3.5" /> Models
                    </h3>
                    <div className="h-4 w-px bg-black/10" />
                    <div className="bg-[#F5F5F7] p-0.5 rounded-md flex gap-0.5">
                      {['all', ...new Set(AVAILABLE_MODELS.map(m => m.channel))].map((c) => (
                        <button
                          key={c}
                          onClick={() => setActiveTab(c)}
                          className={`px-2.5 py-1 rounded text-[11px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                            activeTab === c 
                              ? 'bg-white text-blue-600 shadow-sm' 
                              : 'text-[#86868B] hover:text-[#1D1D1F]'
                          }`}
                        >
                          {c === 'all' ? '全部' : c.toUpperCase()}
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
                        Reset
                      </button>
                    )}
                    <div className="text-xs font-bold text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full border border-blue-100">
                      {selectedModels.length} Selected
                    </div>
                  </div>
                </div>

                <div className="flex-1 min-h-0 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2 overflow-y-auto pr-1 custom-scrollbar mb-4">
                  {AVAILABLE_MODELS.filter(m => activeTab === 'all' || m.channel === activeTab).map((model) => (
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
                        const model = AVAILABLE_MODELS.find(m => m.id === modelId);
                        if (!model) return null;
                        return (
                          <motion.div
                            key={modelId}
                            layout
                            initial={{ opacity: 0, scale: 0.8 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            className="flex items-center gap-1 px-2 py-0.5 bg-[#F5F5F7] border border-black/5 rounded-full"
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
                  disabled={!prompt.trim() || selectedModels.length === 0}
                  className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 disabled:bg-[#E5E5E7] disabled:cursor-not-allowed text-white rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2 shadow-xl shadow-blue-500/20 active:scale-[0.98] shrink-0"
                >
                  <Send className="w-5 h-5" />
                  Run Comparison
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
                    Back to Sabrina Ⅱ
                  </button>
                  <h2 className="text-2xl font-bold tracking-tight">Comparison Results</h2>
                </div>
                <div className="bg-white px-4 py-2 rounded-xl border border-black/5 shadow-sm max-w-xl">
                  <p className="text-[10px] text-[#86868B] font-bold uppercase tracking-wider mb-0.5">Prompt</p>
                  <p className="text-[#1D1D1F] text-sm line-clamp-1 italic">"{prompt}"</p>
                </div>
              </div>

              <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4 overflow-y-auto pr-2 custom-scrollbar pb-4">
                {selectedModels.map((modelId) => {
                  const model = AVAILABLE_MODELS.find(m => m.id === modelId);
                  const result = results[modelId];

                  return (
                    <motion.div
                      layout
                      key={modelId}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-white rounded-2xl border border-black/5 shadow-sm flex flex-col h-[500px] overflow-hidden"
                    >
                      <div className="p-4 border-b border-black/5 flex items-center justify-between bg-[#FBFBFD] shrink-0">
                        <div>
                          <h3 className="font-bold text-base">{model?.name}</h3>
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-[#86868B] uppercase tracking-widest">{model?.category}</span>
                            <span className="text-[10px] text-[#86868B]">•</span>
                            <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase tracking-tighter">
                              {model?.channel === 'china' ? 'China 渠道' : 'Global 渠道'}
                            </span>
                            <span className="text-[10px] text-[#86868B]">•</span>
                            <span className="text-[10px] text-[#86868B] italic">{model?.description}</span>
                          </div>
                        </div>
                        {result?.status === 'thinking' && (
                          <div className="flex items-center gap-1.5 text-blue-600 text-xs font-medium">
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            Reasoning...
                          </div>
                        )}
                        {result?.status === 'completed' && (
                          <div className="flex items-center gap-1 text-emerald-600 text-xs font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Ready
                          </div>
                        )}
                      </div>

                      <div className="flex-1 overflow-y-auto p-5 font-mono text-xs leading-relaxed text-[#424245] bg-white custom-scrollbar">
                        {result?.status === 'thinking' ? (
                          <div className="space-y-3">
                            <div className="h-3 bg-[#F5F5F7] rounded w-3/4 animate-pulse" />
                            <div className="h-3 bg-[#F5F5F7] rounded w-1/2 animate-pulse" />
                            <div className="h-3 bg-[#F5F5F7] rounded w-5/6 animate-pulse" />
                          </div>
                        ) : result?.status === 'error' ? (
                          <div className="text-red-500 bg-red-50 p-3 rounded-xl border border-red-100 text-xs">
                            Failed to generate response.
                          </div>
                        ) : (
                          <div className="whitespace-pre-wrap">
                            {result?.result}
                          </div>
                        )}
                      </div>

                      <div className="p-3 bg-[#FBFBFD] border-t border-black/5 flex justify-between items-center shrink-0">
                        <span className="text-[9px] text-[#86868B] uppercase font-bold tracking-tighter">
                          Output: {result?.result.length || 0} chars
                        </span>
                        <button className="text-[10px] text-blue-600 hover:underline font-bold uppercase tracking-wider">
                          Copy
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

      <footer className="shrink-0 py-3 text-center text-[#86868B] text-[11px] border-t border-black/5 bg-white/50 backdrop-blur-sm">
        <div className="flex items-center justify-center gap-2">
          <Sparkles className="w-3.5 h-3.5" />
          <span>Sabrina Ⅱ • Multi-Model Orchestration</span>
          <span className="text-black/10">|</span>
          <span>© 2026</span>
        </div>
      </footer>
    </div>
  );
}
