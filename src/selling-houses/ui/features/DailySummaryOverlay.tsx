import React from 'react';
import { DailyReport } from '../../domain/models';
import { TrendingUp, AlertCircle, Star, Calendar, ArrowRight, Zap, Target, SunMedium, BriefcaseBusiness } from 'lucide-react';

interface DailySummaryOverlayProps {
  report: DailyReport;
  onContinue: () => void;
}

export function DailySummaryOverlay({ report, onContinue }: DailySummaryOverlayProps) {
  const overnightEvents = [
    ...report.majorEvents.map((entry) => ({ ...entry, kind: 'major' as const })),
    ...report.randomEvents.map((entry) => ({ ...entry, kind: 'random' as const })),
  ];

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/40 p-6 backdrop-blur-md">
      <div className="seller-panel max-h-[86vh] w-full max-w-5xl overflow-hidden rounded-[22px] shadow-[var(--seller-shadow-lg)] animate-in fade-in zoom-in duration-300">
        <div className="bg-[var(--seller-ink)] px-7 py-5 text-center text-white">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-[14px] bg-[var(--seller-accent)] text-white">
            <Calendar size={20} />
          </div>
          <h2 className="seller-title mt-3 text-[18px] text-white sm:text-[20px]">{report.title}</h2>
        </div>

        <div className="max-h-[calc(86vh-96px)] overflow-y-auto p-6 sm:p-7">
          <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.2fr_0.8fr]">
            <section className="seller-panel min-w-0 overflow-hidden">
              <div className="border-b border-black/[0.05] px-5 py-4">
                <h4 className="seller-label flex items-center gap-2 text-xs">
                  <Zap size={14} className="text-amber-500" />
                  昨夜变化
                </h4>
              </div>

              <div className="space-y-5 p-5">
                <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
                  {report.metricsDelta.map((m, i) => (
                    <div key={i} className="rounded-[18px] bg-slate-50 px-4 py-3">
                      <div className="text-[10px] font-bold tracking-[0.02em] text-slate-400">{m.label}</div>
                      <div className={`mt-2 text-[17px] font-bold ${m.value > 0 ? 'text-emerald-600' : m.value < 0 ? 'text-rose-600' : 'text-slate-500'}`}>
                        {m.value > 0 ? '+' : ''}{m.value}{m.unit}
                      </div>
                    </div>
                  ))}
                </div>

                <div className="overflow-hidden rounded-[20px] border border-black/[0.05] bg-slate-50/70">
                  {overnightEvents.length > 0 ? (
                    overnightEvents.map((entry, index) => (
                      <EventRow
                        key={`${entry.kind}-${index}`}
                        actor={entry.actor}
                        message={entry.message}
                        tone={entry.tone}
                        isLast={index === overnightEvents.length - 1}
                      />
                    ))
                  ) : (
                    <div className="px-5 py-10 text-center text-sm text-slate-400">
                      昨天没有新的变化，经营整体比较平稳。
                    </div>
                  )}
                </div>
              </div>
            </section>

            <aside className="seller-panel-muted">
              <div className="space-y-5 p-5">
                <h4 className="seller-label flex items-center gap-2 text-xs">
                  <SunMedium size={14} className="text-amber-500" />
                  今天安排
                </h4>

                <div className="grid grid-cols-2 gap-3">
                  <InfoBlock label="日程" value={report.todayPlan.label} />
                  <InfoBlock label="资源" value={`${report.todayPlan.energy} 精力`} />
                </div>

                <div className="seller-tablet px-4 py-4">
                  <div className="seller-label">今日主题</div>
                  <div className="mt-2 text-base font-semibold text-slate-900">{report.todayPlan.theme}</div>
                </div>

                {report.todayPlan.focusCases.length > 0 ? (
                  <div className="seller-tablet px-4 py-4">
                    <div className="seller-label mb-3 flex items-center gap-2">
                      <Target size={12} className="text-amber-500" />
                      今日商圈聚焦房
                    </div>
                    <div className="space-y-2">
                      {report.todayPlan.focusCases.map((name, i) => (
                        <div key={i} className="text-sm font-medium text-slate-700">
                          {name}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                <div className="border-t border-black/[0.06] pt-5">
                  <h4 className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.2em] text-slate-400">
                  <BriefcaseBusiness size={14} className="text-slate-600" />
                    今日先办
                  </h4>
                  <div className="overflow-hidden rounded-[18px] border border-black/[0.05] bg-white">
                    {report.todayPlan.priorities.length > 0 ? (
                      report.todayPlan.priorities.map((item, i) => (
                        <PriorityRow key={i} index={i + 1} text={item} isLast={i === report.todayPlan.priorities.length - 1} />
                      ))
                    ) : (
                      <div className="px-4 py-6 text-center text-sm text-slate-400">
                        今天没有明确待办，适合先盘点业主反馈和准客池。
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </aside>
          </div>

          <div className="pt-5">
            <button
              onClick={onContinue}
              className="seller-button-primary ml-auto flex items-center justify-center gap-2 px-6 py-3.5 text-sm"
            >
              继续经营
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function EventRow({
  actor,
  message,
  tone,
  isLast,
}: {
  key?: React.Key;
  actor: string;
  message: string;
  tone: string;
  isLast: boolean;
}) {
  const toneClass = tone === 'success'
    ? 'text-emerald-500'
    : tone === 'danger'
      ? 'text-rose-500'
      : 'text-amber-500';

  return (
    <div className={`flex items-start gap-3 px-4 py-3.5 ${isLast ? '' : 'border-b border-black/[0.05]'}`}>
      <div className={`mt-0.5 ${toneClass}`}>
        {tone === 'success' && <Star size={15} />}
        {tone === 'danger' && <AlertCircle size={15} />}
        {tone === 'accent' && <TrendingUp size={15} />}
      </div>
      <div className="min-w-0">
        <div className="mb-1 text-[10px] font-bold tracking-[0.02em] text-slate-400">{actor}</div>
        <p className="text-[14px] font-medium leading-6 text-slate-700">{message}</p>
      </div>
    </div>
  );
}

function InfoBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="seller-tablet px-4 py-4">
      <div className="seller-label">{label}</div>
      <div className="mt-2 text-[18px] font-bold text-slate-900">{value}</div>
    </div>
  );
}

function PriorityRow({ index, text, isLast }: { key?: React.Key; index: number; text: string; isLast: boolean }) {
  return (
    <div className={`flex items-start gap-3 px-4 py-3.5 ${isLast ? '' : 'border-b border-black/[0.05]'}`}>
      <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">
        {index}
      </div>
      <div className="pt-0.5 text-sm font-medium leading-6 text-slate-700">{text}</div>
    </div>
  );
}
