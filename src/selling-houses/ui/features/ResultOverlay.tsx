import React from 'react';
import { GameState } from '../../domain/models';
import { Trophy, RefreshCw, Star, Wallet, Users, Award } from 'lucide-react';

interface ResultOverlayProps {
  state: GameState;
  onRestart: () => void;
}

export function ResultOverlay({ state, onRestart }: ResultOverlayProps) {
  const { finalResult, reputation, soldCount, commission } = state;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6">
      <div className="bg-white rounded-[40px] shadow-2xl max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="bg-slate-900 p-10 text-center relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="flex h-20 w-20 items-center justify-center rounded-[28px] bg-emerald-500 text-white shadow-xl shadow-emerald-500/20">
              <Trophy size={40} />
            </div>
          </div>
          
          <h2 className="text-3xl font-bold text-white mt-4">{finalResult?.title || '经营报告'}</h2>
          <p className="text-slate-400 mt-2 text-sm leading-relaxed max-w-md mx-auto">
            {finalResult?.summary}
          </p>
        </div>

        <div className="p-10">
          <div className="grid grid-cols-2 gap-4 mb-10">
            {finalResult?.stats.map((s: any, i: number) => (
              <div key={i} className="p-5 rounded-2xl bg-slate-50 border border-black/[0.03] flex flex-col gap-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.15em]">{s.label}</span>
                <span className="text-xl font-bold text-slate-800">{s.value}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            <button 
              onClick={onRestart}
              className="w-full flex items-center justify-center gap-3 py-5 bg-slate-900 text-white rounded-2xl font-bold text-lg hover:scale-[1.02] transition-all shadow-xl shadow-slate-900/20"
            >
              <RefreshCw size={20} />
              <span>再战一局</span>
            </button>
            <p className="text-center text-[10px] font-bold text-slate-300 uppercase tracking-widest mt-2">
              王牌维护人 · 资产经营模拟
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
