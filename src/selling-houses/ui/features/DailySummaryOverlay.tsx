import React from 'react';
import { DailyReport } from '../../domain/models';
import { TrendingUp, AlertCircle, Star, Calendar, ArrowRight, Zap, Target, SunMedium, BriefcaseBusiness, Sparkles } from 'lucide-react';

interface DailySummaryOverlayProps {
  report: DailyReport;
  onContinue: () => void;
}

export function DailySummaryOverlay({ report, onContinue }: DailySummaryOverlayProps) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 backdrop-blur-md p-6">
      <div className="bg-white rounded-[40px] shadow-2xl max-w-6xl w-full max-h-[90vh] overflow-hidden animate-in fade-in zoom-in duration-300">
        <div className="bg-slate-900 px-10 py-10 text-center relative">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-xl shadow-amber-500/20">
              <Calendar size={32} />
            </div>
          </div>
          
          <h2 className="text-2xl font-bold text-white mt-4">{report.title}</h2>
          <p className="text-slate-400 mt-2 text-sm uppercase tracking-widest font-bold">Overnight Insights</p>
        </div>

        <div className="max-h-[calc(90vh-180px)] overflow-y-auto p-10">
          <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1.15fr_0.85fr]">
            <section className="space-y-8">
              <div>
                <h4 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                  <Zap size={14} className="text-amber-500" />
                  昨天发生了什么
                </h4>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  {report.metricsDelta.map((m, i) => (
                    <div key={i} className="space-y-1 rounded-2xl border border-black/[0.03] bg-slate-50 p-4">
                      <div className="mb-1 text-[10px] font-bold uppercase tracking-wider leading-none text-slate-400">{m.label}</div>
                      <div className={`text-lg font-bold ${m.value > 0 ? 'text-emerald-600' : m.value < 0 ? 'text-rose-600' : 'text-slate-400'}`}>
                        {m.value > 0 ? '+' : ''}{m.value}{m.unit}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-5 space-y-3">
                  {report.majorEvents.map((e, i) => (
                    <EventCard key={i} actor={e.actor} message={e.message} tone={e.tone} />
                  ))}
                  {report.majorEvents.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-200 py-10 text-center text-sm italic text-slate-400">
                      昨天没有重大突发，经营整体比较平稳。
                    </div>
                  )}
                </div>
              </div>

              <div>
                <h4 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                  <Sparkles size={14} className="text-blue-500" />
                  随机事件与外部风向
                </h4>
                <div className="space-y-3">
                  {report.randomEvents.map((event, i) => (
                    <EventCard key={`random-${i}`} actor={event.actor} message={event.message} tone={event.tone} compact />
                  ))}
                  {report.randomEvents.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-8 text-center text-sm italic text-slate-400">
                      昨天没有新的随机事件，市场风向相对稳定。
                    </div>
                  )}
                </div>
              </div>
            </section>

            <aside className="space-y-6">
              <div className="rounded-[28px] border border-black/[0.04] bg-gradient-to-br from-amber-50 via-white to-emerald-50 p-6 shadow-sm">
                <h4 className="mb-5 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                  <SunMedium size={14} className="text-amber-500" />
                  今天是什么日子
                </h4>
                <div className="grid grid-cols-2 gap-3">
                  <TodayMetric label="日程" value={report.todayPlan.label} />
                  <TodayMetric label="资源" value={`${report.todayPlan.energy} 精力`} />
                </div>
                <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">今日主题</div>
                  <div className="mt-2 text-base font-semibold text-slate-900">{report.todayPlan.theme}</div>
                </div>
                {report.todayPlan.focusCases.length > 0 && (
                  <div className="mt-4 rounded-2xl bg-white p-4 shadow-sm">
                    <div className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                      <Target size={12} className="text-amber-500" />
                      今日聚焦盘
                    </div>
                    <div className="space-y-2">
                      {report.todayPlan.focusCases.map((name, i) => (
                        <div key={i} className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
                          {name}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-[28px] border border-black/[0.04] bg-slate-50 p-6">
                <h4 className="mb-4 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                  <BriefcaseBusiness size={14} className="text-slate-600" />
                  今天你该先干什么
                </h4>
                <div className="space-y-3">
                  {report.todayPlan.priorities.map((item, i) => (
                    <div key={i} className="rounded-2xl border border-black/[0.04] bg-white px-4 py-3 text-sm font-medium leading-relaxed text-slate-700 shadow-sm">
                      {item}
                    </div>
                  ))}
                  {report.todayPlan.priorities.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-white px-4 py-6 text-center text-sm italic text-slate-400">
                      今天没有明确待办，适合先盘点业主反馈和准客池。
                    </div>
                  )}
                </div>
              </div>
            </aside>
          </div>

          <div className="pt-8">
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

function EventCard({
  actor,
  message,
  tone,
  compact = false,
}: {
  key?: React.Key;
  actor: string;
  message: string;
  tone: string;
  compact?: boolean;
}) {
  return (
    <div className={`flex items-start gap-4 rounded-2xl border p-4 ${
      tone === 'success' ? 'border-emerald-500/10 bg-emerald-50/50' :
      tone === 'danger' ? 'border-rose-500/10 bg-rose-50/50' :
      'border-transparent bg-slate-50'
    }`}>
      <div className="mt-0.5">
        {tone === 'success' && <Star size={compact ? 14 : 16} className="text-emerald-500" />}
        {tone === 'danger' && <AlertCircle size={compact ? 14 : 16} className="text-rose-500" />}
        {tone === 'accent' && <TrendingUp size={compact ? 14 : 16} className="text-amber-500" />}
      </div>
      <div>
        <div className="mb-0.5 text-[10px] font-bold uppercase text-slate-400">{actor}</div>
        <p className={`${compact ? 'text-sm' : 'text-[15px]'} font-medium leading-relaxed text-slate-700`}>{message}</p>
      </div>
    </div>
  );
}

function TodayMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-white p-4 text-center shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className="mt-2 text-lg font-bold text-slate-900">{value}</div>
    </div>
  );
}
