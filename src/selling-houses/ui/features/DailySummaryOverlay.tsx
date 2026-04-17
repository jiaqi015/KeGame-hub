import React from 'react';
import { DailyReport } from '../../domain/models';
import { TrendingUp, AlertCircle, Star, Calendar, ArrowRight, Zap, Target } from 'lucide-react';

interface DailySummaryOverlayProps {
  report: DailyReport;
  onContinue: () => void;
}

export function DailySummaryOverlay({ report, onContinue }: DailySummaryOverlayProps) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6">
      <div className="bg-white rounded-[40px] shadow-2xl max-w-2xl w-full overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="bg-slate-900 p-10 text-center relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-xl shadow-amber-500/20">
              <Calendar size={32} />
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-white mt-4">{report.title}</h2>
          <p className="text-slate-400 mt-2 text-sm uppercase tracking-widest font-bold">Overnight Insights</p>
        </div>

        <div className="p-10 space-y-10">
          {/* Metrics Delta */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {report.metricsDelta.map((m, i) => (
              <div key={i} className="p-4 rounded-2xl bg-slate-50 border border-black/[0.03] space-y-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider leading-none mb-1">{m.label}</div>
                <div className={`text-lg font-bold ${m.value > 0 ? 'text-emerald-600' : m.value < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                  {m.value > 0 ? '+' : ''}{m.value}{m.unit}
                </div>
              </div>
            ))}
          </div>

          {/* Major Events */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-2">
              <Zap size={14} className="text-amber-500" />
              本日重大转折
            </h4>
            <div className="space-y-3 max-h-[240px] overflow-y-auto pr-2 custom-scrollbar">
              {report.majorEvents.map((e, i) => (
                <div key={i} className={`p-4 rounded-2xl border flex items-start gap-4 ${
                  e.tone === 'success' ? 'bg-emerald-50/50 border-emerald-500/10' :
                  e.tone === 'danger' ? 'bg-rose-50/50 border-rose-500/10' :
                  'bg-slate-50 border-transparent'
                }`}>
                  <div className="mt-0.5">
                    {e.tone === 'success' && <Star size={16} className="text-emerald-500" />}
                    {e.tone === 'danger' && <AlertCircle size={16} className="text-rose-500" />}
                    {e.tone === 'accent' && <TrendingUp size={16} className="text-amber-500" />}
                  </div>
                  <div>
                    <div className="text-[10px] font-bold text-slate-400 uppercase mb-0.5">{e.actor}</div>
                    <p className="text-sm text-slate-700 font-medium leading-relaxed">{e.message}</p>
                  </div>
                </div>
              ))}
              {report.majorEvents.length === 0 && (
                <div className="py-10 text-center text-slate-400 italic text-sm">今日无重大突发事件，经营稳步推进。</div>
              )}
            </div>
          </div>

          {/* Market News */}
          {report.marketNews.length > 0 && (
            <div className="p-5 rounded-3xl bg-blue-50 border border-blue-500/10 flex gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-blue-600 shadow-sm">
                <Target size={20} />
              </div>
              <div className="space-y-1">
                <div className="text-[10px] font-bold text-blue-700 uppercase tracking-widest">板块风向标</div>
                <p className="text-sm text-blue-900 font-medium">{report.marketNews[0]}</p>
              </div>
            </div>
          )}

          <div className="pt-2">
            <button 
              onClick={onContinue}
              className="w-full flex items-center justify-center gap-3 py-5 bg-slate-900 text-white rounded-[24px] font-bold text-lg hover:scale-[1.02] active:scale-[0.98] transition-all shadow-xl shadow-slate-900/20"
            >
              继续经营
              <ArrowRight size={20} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
