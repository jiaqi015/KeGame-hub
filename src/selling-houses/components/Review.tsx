import React from 'react';
import { GameState } from '../core/gameState';
import { History, ClipboardList, Lightbulb } from 'lucide-react';

interface ReviewProps {
  state: GameState;
}

export function Review({ state }: ReviewProps) {
  const { eventLog, weeklyReviews } = state;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-10 h-full min-h-0">
      <section className="flex flex-col min-h-0">
        <div className="flex items-center gap-2 mb-6">
          <History className="text-slate-400" size={20} />
          <h2 className="text-xl font-semibold text-slate-900">推盘日志</h2>
        </div>
        <div className="flex-1 bg-white rounded-[32px] border border-black/5 overflow-y-auto p-4 space-y-2 shadow-inner bg-slate-50/30">
          {eventLog.map((log, i) => (
            <div key={i} className="flex gap-4 p-3 rounded-2xl bg-white border border-black/[0.02]">
              <div className="shrink-0 flex flex-col items-center">
                <span className="text-[10px] font-bold text-slate-300 uppercase tracking-tighter">Day</span>
                <span className="text-base font-bold text-slate-400 leading-none">{log.day}</span>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest ${
                    log.tone === 'success' ? 'bg-emerald-50 text-emerald-600' : 
                    log.tone === 'danger' ? 'bg-rose-50 text-rose-600' : 
                    'bg-slate-100 text-slate-500'
                  }`}>
                    {log.actor}
                  </span>
                </div>
                <p className="text-sm text-slate-600 leading-relaxed">{log.message}</p>
              </div>
            </div>
          ))}
          {eventLog.length === 0 && <p className="text-center py-20 text-slate-300 italic">暂无历史记录。</p>}
        </div>
      </section>

      <aside className="space-y-6 overflow-y-auto pr-2">
        <div className="flex items-center gap-2 mb-6">
          <ClipboardList className="text-emerald-500" size={20} />
          <h2 className="text-xl font-semibold text-slate-900">周报存档</h2>
        </div>
        {weeklyReviews.map(r => (
          <div key={r.id} className="bg-emerald-900 rounded-[32px] p-8 text-white shadow-xl relative overflow-hidden">
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <ClipboardList size={80} />
            </div>
            <div className="relative z-10">
              <span className="inline-block px-3 py-1 rounded-full bg-white/10 text-[10px] font-bold uppercase tracking-[0.2em] mb-4">
                {r.title}
              </span>
              <p className="text-emerald-50/80 text-sm leading-relaxed mb-6">{r.note}</p>
              <div className="bg-white/10 rounded-2xl p-4 flex gap-3">
                <Lightbulb size={20} className="shrink-0 text-emerald-300" />
                <div>
                  <div className="text-[10px] font-bold text-emerald-300 uppercase tracking-widest mb-1">经营建议</div>
                  <p className="text-xs text-white/90">{r.suggestion}</p>
                </div>
              </div>
            </div>
          </div>
        ))}
        {weeklyReviews.length === 0 && (
          <div className="py-20 text-center border-2 border-dashed border-slate-100 rounded-[32px] text-slate-300 italic text-sm">
            本周经营尚未结算。
          </div>
        )}
      </aside>
    </div>
  );
}
