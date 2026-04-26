import React, { useState } from 'react';
import type { GameState, Case, MatterEntry } from '../../../domain/models';
import type { ActionDecisionConfig, CharacterFeedback, Settlement } from '../ActionDecisionOverlay';
import { getActionTemplate } from '../../../domain/actions/templates';
import { ACTIONS } from '../../../domain/actions/definitions';
import { Activity, Target, Zap, AlertTriangle } from 'lucide-react';

interface Props {
  config: ActionDecisionConfig;
  matter?: MatterEntry;
  onChoose?: (optionId: string, assistOptionId?: string, choices?: Array<{ round: number; main: string; assist: string }>, feedbacks?: CharacterFeedback[]) => void;
  onComplete?: (result: Settlement, choices: Array<{ round: number; main: string; assist: string }>, feedbacks: CharacterFeedback[]) => void;
  onClose: () => void;
  state?: GameState;
  caseItem?: Case;
}

export function DiagnoseMatterView({ config, matter, onChoose, onComplete, onClose, state, caseItem }: Props) {
  const [phase, setPhase] = useState<'scan' | 'result'>('scan');
  const [scannedMetrics, setScannedMetrics] = useState<number>(0);

  const handleStartScan = () => {
    // Simulate scanning progress
    let progress = 0;
    const interval = setInterval(() => {
      progress += 1;
      setScannedMetrics(progress);
      if (progress >= 3) {
        clearInterval(interval);
        setTimeout(() => setPhase('result'), 500);
      }
    }, 400);
  };

  const handleFinish = (optionId: string) => {
    if (onChoose) {
      onChoose(optionId);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(5,8,12,0.85)] p-4 backdrop-blur-sm">
      <div className="flex h-full max-h-[85vh] w-full max-w-3xl flex-col overflow-hidden rounded-[24px] border border-[var(--seller-border)] bg-[var(--seller-paper)] shadow-[0_0_80px_rgba(40,80,120,0.15)]">
        
        <header className="border-b border-[var(--seller-border)] bg-[rgba(255,255,255,0.02)] px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[rgba(40,140,240,0.1)] text-blue-400">
              <Activity size={20} />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-blue-400 mb-1">
                诊断盘 · {matter?.title || config.title}
              </div>
              <h3 className="text-lg font-bold text-[var(--seller-ink)]">{config.title}</h3>
            </div>
          </div>
          <button onClick={onClose} className="text-[var(--seller-muted)] hover:text-white">✕</button>
        </header>

        <div className="flex-1 overflow-y-auto bg-[rgba(5,8,12,0.6)] p-8">
          <p className="text-[14px] text-[var(--seller-muted)] mb-8 text-center max-w-xl mx-auto">
            {config.summary}
            <br/>
            <span className="text-[12px] opacity-70 mt-2 block">{config.body}</span>
          </p>

          {/* Dashboard area */}
          <div className="grid grid-cols-2 gap-6 mb-8">
            <div className="rounded-[20px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.02)] p-6 relative overflow-hidden">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--seller-muted)] mb-4 flex items-center gap-2">
                <Target size={14} /> 当前数据
              </div>
              {phase === 'scan' && scannedMetrics < 1 ? (
                 <div className="h-16 flex items-center text-[var(--seller-subtle)] italic">等待扫描...</div>
              ) : (
                <div className="space-y-4 animate-in fade-in zoom-in-95">
                  <div>
                    <div className="text-[12px] text-[var(--seller-muted)]">带看热度</div>
                    <div className="text-[24px] font-bold text-[var(--seller-ink)]">{caseItem?.heat || 0}</div>
                  </div>
                  <div>
                    <div className="text-[12px] text-[var(--seller-muted)]">挂牌价</div>
                    <div className="text-[20px] font-bold text-[var(--seller-ink)]">{caseItem?.askPrice || 0}万</div>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-[20px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.02)] p-6 relative overflow-hidden">
               <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--seller-muted)] mb-4 flex items-center gap-2">
                <Zap size={14} /> 市场基准 / 竞品
              </div>
              {phase === 'scan' && scannedMetrics < 2 ? (
                 <div className="h-16 flex items-center text-[var(--seller-subtle)] italic">等待对照...</div>
              ) : (
                <div className="space-y-4 animate-in fade-in zoom-in-95">
                  <div>
                    <div className="text-[12px] text-[var(--seller-muted)]">商圈平均热度</div>
                    <div className="text-[24px] font-bold text-blue-400">45+</div>
                  </div>
                  <div>
                    <div className="text-[12px] text-[var(--seller-muted)]">近期成交价</div>
                    <div className="text-[20px] font-bold text-blue-400">{caseItem?.marketPrice || 0}万</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {phase === 'scan' && (
            <div className="flex justify-center mt-10">
              <button 
                onClick={handleStartScan}
                disabled={scannedMetrics > 0}
                className="flex items-center gap-2 rounded-full bg-blue-500/20 text-blue-400 px-8 py-3 text-[14px] font-bold border border-blue-500/30 hover:bg-blue-500/30 transition-all disabled:opacity-50"
              >
                {scannedMetrics > 0 ? `扫描比对中... (${scannedMetrics}/3)` : '收集线索与诊断'}
              </button>
            </div>
          )}

          {phase === 'result' && (
            <div className="animate-in fade-in slide-in-from-bottom-4 mt-8">
               <div className="rounded-[20px] border border-red-500/20 bg-red-500/5 p-6 mb-8">
                 <div className="flex items-start gap-4">
                   <div className="mt-1 text-red-400"><AlertTriangle size={24} /></div>
                   <div>
                     <h4 className="text-[16px] font-bold text-red-400 mb-1">诊断结论：存在明显卡点</h4>
                     <p className="text-[13px] text-[var(--seller-ink)] leading-relaxed">
                       经过对比，当前价格显著脱离商圈均值，而带看热度仅为竞品的 1/3。问题不在推广，而在价格站位与买家预期的严重偏差。
                     </p>
                   </div>
                 </div>
               </div>

               <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--seller-muted)] mb-3 px-2">
                 基于诊断的建议动作
               </div>
               <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                 {config.options.map(opt => (
                    <button
                      key={opt.id}
                      onClick={() => handleFinish(opt.id)}
                      className="group rounded-[16px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] p-4 text-left transition-all hover:border-[var(--seller-accent)] hover:bg-[var(--seller-accent-soft)]"
                    >
                      <div className="font-bold text-[13px] text-[var(--seller-ink)] group-hover:text-[var(--seller-accent)]">{opt.title}</div>
                      <div className="text-[11px] text-[var(--seller-muted)] mt-1">{opt.note}</div>
                    </button>
                 ))}
               </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
