import React from 'react';
import { GameState } from '../core/gameState';
import { Trophy, RefreshCw } from 'lucide-react';

interface ResultOverlayProps {
  state: GameState;
  onRestart: () => void;
}

export function ResultOverlay({ state, onRestart }: ResultOverlayProps) {
  const { finalResult } = state;
  if (!finalResult) return null;

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/90 backdrop-blur-xl flex items-center justify-center p-6">
      <div className="bg-white rounded-[48px] shadow-2xl max-w-2xl w-full p-12 text-center animate-in fade-in slide-in-from-bottom-8 duration-500">
        <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-8">
          <Trophy size={48} />
        </div>
        
        <h2 className="text-sm font-bold text-emerald-500 uppercase tracking-[0.3em] mb-2">经营周期结束</h2>
        <h1 className="text-4xl font-bold text-slate-900 mb-6">{finalResult.title}</h1>
        <p className="text-slate-500 text-lg leading-relaxed mb-10 max-w-md mx-auto">
          {finalResult.summary}
        </p>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-12">
          {finalResult.stats.map((s: any, i: number) => (
            <div key={i} className="bg-slate-50 rounded-2xl p-4">
              <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">{s.label}</div>
              <div className="text-lg font-bold text-slate-900">{s.value}</div>
            </div>
          ))}
        </div>

        <button 
          onClick={onRestart}
          className="inline-flex items-center gap-2 px-10 py-5 bg-slate-900 text-white rounded-full font-bold hover:scale-105 transition-all shadow-xl shadow-slate-900/20"
        >
          <RefreshCw size={20} />
          <span>再开一局</span>
        </button>
      </div>
    </div>
  );
}
