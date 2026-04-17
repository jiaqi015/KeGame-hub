import React from 'react';
import { GameState } from '../../domain/models';
import { History, Calendar, Star, AlertCircle, TrendingUp, User } from 'lucide-react';

interface DailyJournalProps {
  state: GameState;
}

export function DailyJournal({ state }: DailyJournalProps) {
  const { eventLog, day } = state;

  // Group events by day
  const days = Array.from({ length: day }, (_, i) => day - i);
  
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-bold text-slate-900 flex items-center gap-2">
          <Calendar className="text-amber-500" size={24} />
          经营日历 (Day {day})
        </h3>
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
          经营全轨迹回溯
        </span>
      </div>

      <div className="space-y-8 relative before:absolute before:inset-0 before:left-[19px] before:w-0.5 before:bg-slate-100 before:pointer-events-none">
        {days.map(d => {
          const dayEvents = eventLog.filter(e => e.day === d);
          if (dayEvents.length === 0 && d !== day) return null;

          return (
            <div key={d} className="relative pl-12">
              <div className="absolute left-0 top-0 w-10 h-10 rounded-full bg-white border-4 border-slate-50 flex items-center justify-center z-10 shadow-sm">
                <span className="text-xs font-bold text-slate-500">{d}</span>
              </div>
              
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <h4 className="text-sm font-bold text-slate-800">Day {d} · {d === day ? '今日经营' : '历史轨迹'}</h4>
                  <div className="h-px flex-1 bg-slate-50" />
                </div>
                
                <div className="grid grid-cols-1 gap-2">
                  {dayEvents.map((e, i) => (
                    <div 
                      key={i} 
                      className={`p-3 rounded-2xl border flex items-start gap-3 transition-all ${
                        e.tone === 'success' ? 'bg-emerald-50/50 border-emerald-500/10' :
                        e.tone === 'danger' ? 'bg-rose-50/50 border-rose-500/10' :
                        e.tone === 'accent' ? 'bg-amber-50/50 border-amber-500/10' :
                        'bg-slate-50 border-transparent'
                      }`}
                    >
                      <div className="mt-0.5">
                        {e.tone === 'success' && <Star size={14} className="text-emerald-500" />}
                        {e.tone === 'danger' && <AlertCircle size={14} className="text-rose-500" />}
                        {e.tone === 'accent' && <TrendingUp size={14} className="text-amber-500" />}
                        {!e.tone && <User size={14} className="text-slate-400" />}
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-0.5">
                          <span className="text-[10px] font-bold text-slate-400 uppercase">{e.actor}</span>
                          <span className="text-[8px] text-slate-300">{e.date?.split('T')[1]?.slice(0, 5)}</span>
                        </div>
                        <p className="text-xs text-slate-700 leading-relaxed">{e.message}</p>
                      </div>
                    </div>
                  ))}
                  {dayEvents.length === 0 && d === day && (
                    <p className="text-xs text-slate-400 italic py-2">本日经营尚未开始，请下达首个指令。</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
