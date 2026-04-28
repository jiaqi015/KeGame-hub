import React, { useState } from 'react';
import type { GameState, Case, MatterEntry } from '../../../domain/models';
import type { ActionDecisionConfig, CharacterFeedback, Settlement } from '../ActionDecisionOverlay';
import { Zap, CheckCircle2, Play, Circle } from 'lucide-react';
import { buildQuickMatterScenarioCompletion } from './matterCompletion';

interface Props {
  config: ActionDecisionConfig;
  matter?: MatterEntry;
  onChoose?: (optionId: string, assistOptionId?: string, choices?: Array<{ round: number; main: string; assist: string }>, feedbacks?: CharacterFeedback[]) => void;
  onComplete?: (result: Settlement, choices: Array<{ round: number; main: string; assist: string }>, feedbacks: CharacterFeedback[]) => void;
  onClose: () => void;
  state?: GameState;
  caseItem?: Case;
}

export function ExecuteMatterView({ config, matter, onChoose, onComplete, onClose, state, caseItem }: Props) {
  const [phase, setPhase] = useState<'prep' | 'executing' | 'result'>('prep');
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [energyCostPreview, setEnergyCostPreview] = useState<number>(0);

  const handleHoverOption = (optionId: string) => {
    // In a real implementation, we'd look up the exact cost. Here we mock it.
    setEnergyCostPreview(2);
  };

  const handleStartExecute = () => {
    if (!selectedOption) return;
    setPhase('executing');
    
    // Simulate execution timeline
    setTimeout(() => {
      if (config.isScenario && onComplete) {
        const completion = buildQuickMatterScenarioCompletion(config, selectedOption, state, caseItem);
        onComplete(completion.settlement, completion.choices, completion.feedbacks);
      } else if (onChoose) {
        onChoose(selectedOption);
      }
      onClose(); // In direct mode, usually we just close or show result
    }, 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(5,8,12,0.85)] p-4 backdrop-blur-sm">
      <div className="flex h-full max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-[24px] border border-[var(--seller-border)] bg-[var(--seller-paper)] shadow-[0_20px_60px_rgba(240,160,40,0.05)]">
        
        <header className="border-b border-[var(--seller-border)] bg-[rgba(255,255,255,0.02)] px-6 py-5 flex items-center justify-between">
          <div>
             <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--seller-accent)] mb-1">
               执行打卡 · {matter?.title || config.title}
             </div>
             <h3 className="text-lg font-bold text-[var(--seller-ink)]">{config.title}</h3>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-[rgba(255,255,255,0.05)] px-3 py-1">
            <Zap size={14} className="text-[var(--seller-accent)]" />
            <span className="text-[13px] font-bold text-[var(--seller-ink)]">
              {state?.energy || 0} 
              {energyCostPreview > 0 && phase === 'prep' && (
                <span className="text-red-400 ml-1 animate-pulse">-{energyCostPreview}</span>
              )}
            </span>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-6">
          <p className="text-[13px] text-[var(--seller-muted)] mb-8">
            {config.summary}
          </p>

          <div className="relative border-l-2 border-[rgba(255,255,255,0.1)] ml-4 space-y-8 pb-8">
            {/* Step 1 */}
            <div className="relative pl-6">
              <div className="absolute -left-[11px] top-0 bg-[var(--seller-paper)]">
                <CheckCircle2 size={20} className="text-[var(--seller-accent)]" />
              </div>
              <h4 className="text-[14px] font-bold text-[var(--seller-ink)] mb-1">确认前置条件</h4>
              <p className="text-[12px] text-[var(--seller-muted)]">已经具备了执行基础。</p>
            </div>

            {/* Step 2 */}
            <div className="relative pl-6">
              <div className="absolute -left-[11px] top-0 bg-[var(--seller-paper)]">
                {phase === 'prep' ? (
                  <Circle size={20} className="text-[var(--seller-chance)] animate-pulse" />
                ) : (
                  <CheckCircle2 size={20} className="text-[var(--seller-chance)]" />
                )}
              </div>
              <h4 className={`text-[14px] font-bold mb-3 ${phase === 'prep' ? 'text-[var(--seller-chance)]' : 'text-[var(--seller-ink)]'}`}>
                选择方案并投入资源
              </h4>
              
              {phase === 'prep' && (
                <div className="grid grid-cols-1 gap-3">
                  {config.options.map(opt => (
                    <button
                      key={opt.id}
                      onMouseEnter={() => handleHoverOption(opt.id)}
                      onMouseLeave={() => setEnergyCostPreview(0)}
                      onClick={() => setSelectedOption(opt.id)}
                      className={`text-left p-3 rounded-[14px] border transition-all ${
                        selectedOption === opt.id 
                          ? 'border-[var(--seller-chance)] bg-[var(--seller-chance-soft)]' 
                          : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.02)] hover:border-[var(--seller-chance)]/50'
                      }`}
                    >
                      <div className={`font-bold text-[13px] ${selectedOption === opt.id ? 'text-[var(--seller-chance)]' : 'text-[var(--seller-ink)]'}`}>
                        {opt.title}
                      </div>
                      <div className="text-[11px] text-[var(--seller-muted)] mt-1">{opt.note}</div>
                    </button>
                  ))}
                </div>
              )}
              {phase !== 'prep' && (
                <div className="rounded-[12px] bg-[rgba(255,255,255,0.03)] p-3 text-[12px] text-[var(--seller-muted)]">
                  已投入资源执行方案。
                </div>
              )}
            </div>

            {/* Step 3 */}
            <div className={`relative pl-6 transition-opacity duration-500 ${phase === 'prep' ? 'opacity-30' : 'opacity-100'}`}>
              <div className="absolute -left-[11px] top-0 bg-[var(--seller-paper)]">
                {phase === 'executing' ? (
                  <div className="h-5 w-5 rounded-full border-2 border-[var(--seller-accent)] border-t-transparent animate-spin" />
                ) : (
                  <Circle size={20} className="text-[var(--seller-muted)]" />
                )}
              </div>
              <h4 className="text-[14px] font-bold text-[var(--seller-ink)] mb-1">执行与发车</h4>
              {phase === 'executing' && (
                <div className="mt-4 space-y-2 text-[12px] text-[var(--seller-muted)]">
                  <div className="animate-in fade-in slide-in-from-left-2 delay-100">正在触达目标对象...</div>
                  <div className="animate-in fade-in slide-in-from-left-2 delay-300">收集反馈数据中...</div>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-[var(--seller-border)] bg-[var(--seller-paper)] p-4 flex justify-between items-center">
           <button onClick={onClose} className="text-[12px] font-bold text-[var(--seller-muted)] px-4 hover:text-white">取消</button>
           {phase === 'prep' && (
             <button 
               disabled={!selectedOption}
               onClick={handleStartExecute}
               className="flex items-center gap-2 seller-button-primary bg-[var(--seller-chance)] hover:bg-[var(--seller-chance)] px-8 py-2.5 rounded-full text-[13px] font-bold disabled:opacity-50"
             >
               <Play size={14} fill="currentColor" /> 投入并开始
             </button>
           )}
        </div>
      </div>
    </div>
  );
}
