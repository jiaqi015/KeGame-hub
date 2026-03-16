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
            className="flex-1 max-w-5xl mx-auto w-full flex flex-col pt-6 px-6 overflow-hidden"
          >
            <div className="text-center mb-4 shrink-0">
              <h1 className="text-2xl font-bold tracking-tight mb-1">AI Model Sabrina Ⅱ</h1>
              <p className="text-xs text-[#86868B]">Compare the world's best models with a single prompt.</p>
            </div>

            <div className="flex-1 bg-white rounded-3xl shadow-xl shadow-black/5 border border-black/5 p-5 mb-4 flex flex-col min-h-0">
              <div className="relative flex-1 min-h-0 mb-4">
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Enter your prompt here..."
                  className="w-full h-full p-5 text-lg bg-[#F5F5F7] rounded-2xl border-none focus:ring-2 focus:ring-blue-500/20 transition-all resize-none placeholder:text-[#86868B] font-medium"
                />
                <div className="absolute bottom-3 right-4 flex items-center gap-3">
                  {prompt && (
                    <button 
                      onClick={() => setPrompt('')}
                      className="text-[10px] font-bold uppercase tracking-wider text-red-500 hover:text-red-600 transition-colors"
                    >
                      Clear
                    </button>
                  )}
                  <div className="text-[10px] font-mono text-[#86868B]">
                    {prompt.length} chars
                  </div>
                </div>
              </div>

              <div className="shrink-0">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#86868B] flex items-center gap-2">
                    <Cpu className="w-3 h-3" /> Select Models
                  </h3>
                  <div className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
                    {selectedModels.length} selected
                  </div>
                </div>
                
                <div className="bg-[#F5F5F7] p-1 rounded-lg flex gap-1 mb-3 overflow-x-auto no-scrollbar">
                  {['all', ...new Set(AVAILABLE_MODELS.map(m => m.channel))].map((c) => (
                    <button
                      key={c}
                      onClick={() => setActiveTab(c)}
                      className={`px-3 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all whitespace-nowrap ${
                        activeTab === c 
                          ? 'bg-white text-blue-600 shadow-sm' 
                          : 'text-[#86868B] hover:text-[#1D1D1F]'
                      }`}
                    >
                      {c === 'all' ? '全部' : 
                       c === 'ark' ? '火山方舟 (Ark)' : 
                       c === 'global' ? '国际模型 (Global)' : c}
                    </button>
                  ))}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4 max-h-[160px] overflow-y-auto pr-1 custom-scrollbar">
                  {AVAILABLE_MODELS.filter(m => activeTab === 'all' || m.channel === activeTab).map((model) => (
                    <button
                      key={model.id}
                      onClick={() => toggleModel(model.id)}
                      className={`group relative flex flex-col items-start p-2.5 rounded-xl border transition-all text-left ${
                        selectedModels.includes(model.id)
                          ? 'border-blue-500 bg-blue-50/30 ring-1 ring-blue-500'
                          : 'border-black/5 bg-white hover:border-black/10 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between w-full mb-1">
                        <div className="flex items-center gap-1">
                          <div className={`w-1.5 h-1.5 rounded-full ${
                            model.channel === 'ark' ? 'bg-red-400' : 'bg-pink-400'
                          }`} />
                          <span className="text-[8px] font-bold text-[#86868B] uppercase tracking-tighter">
                            {model.category}
                          </span>
                        </div>
                        {selectedModels.includes(model.id) && (
                          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }}>
                            <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
                          </motion.div>
                        )}
                      </div>
                      <span className="font-bold text-[11px] mb-0.5 line-clamp-1">{model.name}</span>
                      <span className="text-[9px] text-[#86868B] line-clamp-1">
                        {model.description}
                      </span>
                    </button>
                  ))}
                </div>

                <button
                  onClick={startComparison}
                  disabled={!prompt.trim() || selectedModels.length === 0}
                  className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:bg-[#E5E5E7] disabled:cursor-not-allowed text-white rounded-xl font-bold text-base transition-all flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20 active:scale-[0.98]"
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
                            <span className="text-[9px] font-bold text-[#86868B] uppercase tracking-widest">{model?.category}</span>
                            <span className="text-[9px] text-[#86868B]">•</span>
                            <span className="text-[9px] font-medium text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded uppercase tracking-tighter">
                              {model?.channel === 'ark' ? '方舟渠道' : 'Global 渠道'}
                            </span>
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

      <footer className="shrink-0 py-3 text-center text-[#86868B] text-[10px] border-t border-black/5 bg-white/50 backdrop-blur-sm">
        <div className="flex items-center justify-center gap-2">
          <Sparkles className="w-3 h-3" />
          <span>Sabrina Ⅱ • Multi-Model Orchestration</span>
          <span className="text-black/10">|</span>
          <span>© 2026</span>
        </div>
      </footer>
    </div>
  );
}
