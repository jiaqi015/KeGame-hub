import React from 'react';
import { GameState } from '../../domain/models';
import { History, Target, Lightbulb } from 'lucide-react';

interface ReviewProps {
  state: GameState;
}

export function Review({ state }: ReviewProps) {
  const { weeklyReviews } = state;
  const { scenarioName, difficultyId } = state.runContext;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[22px] font-bold text-slate-900">周复盘</h3>
          <p className="mt-1 text-sm text-slate-400">
            当前剧本：{scenarioName} · {difficultyId.toUpperCase()}
          </p>
        </div>
        <span className="text-sm text-slate-400">系统每周日自动记录经营变化</span>
      </div>

      <div className="space-y-4">
        {weeklyReviews.map((r, i) => (
          <div key={r.id || i} className="overflow-hidden rounded-[22px] border border-black/5 bg-white shadow-sm">
            <div className="flex items-center justify-between bg-slate-900 p-5">
              <h4 className="flex items-center gap-3 text-[17px] font-bold text-white">
                <Target className="text-emerald-400" size={20} />
                {r.title}
              </h4>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest bg-white/5 px-2 py-1 rounded">
                COMPLETED
              </span>
            </div>
            <div className="space-y-5 p-6">
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest">
                  <History size={14} /> 经营总结
                </div>
                <p className="text-slate-600 leading-relaxed">{r.note}</p>
              </div>

              <div className="flex gap-4 rounded-xl border border-emerald-500/10 bg-emerald-50 p-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-emerald-600 shadow-sm">
                  <Lightbulb size={20} />
                </div>
                <div className="space-y-1">
                  <div className="text-[10px] font-bold text-emerald-700 uppercase tracking-widest">本周变化记录</div>
                  <p className="text-sm text-emerald-900 font-medium">{r.suggestion}</p>
                </div>
              </div>
            </div>
          </div>
        ))}

        {weeklyReviews.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-[24px] border-2 border-dashed border-slate-200 bg-slate-50 py-16 text-slate-400">
            <History size={40} className="mb-4 opacity-20" />
            <p className="italic">这局还没跑满一周，请先把 {scenarioName} 往前推进几天。</p>
          </div>
        )}
      </div>
    </div>
  );
}
