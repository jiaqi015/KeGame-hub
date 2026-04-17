import React from 'react';
import { GameState } from '../../domain/models';
import { History, Target, Lightbulb, CheckCircle2 } from 'lucide-react';

interface ReviewProps {
  state: GameState;
}

export function Review({ state }: ReviewProps) {
  const { weeklyReviews } = state;

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-bold text-slate-900">经营日志与周报</h3>
        <span className="text-sm text-slate-400">系统每周日自动生成复盘建议</span>
      </div>

      <div className="space-y-6">
        {weeklyReviews.map((r, i) => (
          <div key={r.id || i} className="bg-white rounded-3xl border border-black/5 overflow-hidden shadow-sm">
            <div className="bg-slate-900 p-6 flex items-center justify-between">
              <h4 className="text-lg font-bold text-white flex items-center gap-3">
                <Target className="text-emerald-400" size={20} />
                {r.title}
              </h4>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-white/5 px-2 py-1 rounded">
                COMPLETED
              </span>
            </div>
            <div className="p-8 space-y-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
                  <History size={14} /> 经营总结
                </div>
                <p className="text-slate-600 leading-relaxed">{r.note}</p>
              </div>

              <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-500/10 flex gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm">
                  <Lightbulb size={20} />
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">下周经营策略建议</div>
                  <p className="text-sm text-emerald-900 font-medium">{r.suggestion}</p>
                </div>
              </div>
            </div>
          </div>
        ))}

        {weeklyReviews.length === 0 && (
          <div className="py-20 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center text-slate-400">
            <History size={40} className="mb-4 opacity-20" />
            <p className="italic">尚未产生周报，请至少完成一周的经营。</p>
          </div>
        )}
      </div>
    </div>
  );
}
