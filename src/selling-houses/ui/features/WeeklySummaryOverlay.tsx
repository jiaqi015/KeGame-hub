import React from 'react';
import {
  ArrowRight,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  ClipboardList,
  Home,
  ShieldAlert,
  Target,
  TrendingUp,
  Users,
} from 'lucide-react';
import type { WeeklySummaryChange, WeeklySummaryLine, WeeklySummaryPresentation } from '../../application/weeklySummary';
import type { Tone } from '../../domain/models';

interface WeeklySummaryOverlayProps {
  summary: WeeklySummaryPresentation;
  onContinue: () => void;
}

export function WeeklySummaryOverlay({ summary, onContinue }: WeeklySummaryOverlayProps) {
  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-slate-900/45 p-3 backdrop-blur-md sm:p-5">
      <div className="seller-panel max-h-[84vh] w-full max-w-5xl overflow-hidden rounded-[18px] shadow-[var(--seller-shadow-lg)] animate-in fade-in zoom-in duration-300">
        <div className="flex items-center gap-3 bg-[var(--seller-ink)] px-5 py-3 text-white">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[11px] bg-[var(--seller-accent)] text-white">
            <CalendarDays size={17} />
          </div>
          <div className="min-w-0">
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/55">经营结算</div>
            <h2 className="truncate text-[16px] font-semibold tracking-[-0.02em] text-white sm:text-[18px]">
              {summary.title || '推进复盘'} · {summary.dayRangeLabel}
            </h2>
          </div>
        </div>

        <div className="max-h-[calc(84vh-56px)] overflow-y-auto p-4 sm:p-5">
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.12fr_0.88fr]">
            <section className="space-y-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {summary.totals.map((line) => (
                  <MetricCard key={line.label} line={line} />
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <ChangePanel
                  icon={<Home size={14} className="text-emerald-600" />}
                  title="房源阶段变化"
                  items={summary.caseStageChanges}
                />
                <ChangePanel
                  icon={<Users size={14} className="text-sky-600" />}
                  title="客户意向变化"
                  items={summary.customerIntentChanges}
                />
                <ChangePanel
                  icon={<ShieldAlert size={14} className="text-amber-600" />}
                  title="业主信任 / 压力"
                  items={summary.ownerPressureChanges}
                />
                <MarketWindowPanel lines={summary.marketWindow} />
              </div>
            </section>

            <aside className="space-y-4">
              <div className="seller-panel-muted p-4">
                <h4 className="seller-label mb-3 flex items-center gap-2 text-xs">
                  <ClipboardList size={14} className="text-slate-600" />
                  推进关键事件
                </h4>
                <div className="space-y-2.5">
                  {summary.dailyHighlights.map((entry) => (
                    <div key={entry.day} className="rounded-[14px] bg-white px-3 py-2.5 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                      <div className="mb-1 flex items-center justify-between gap-3">
                        <span className="text-[11px] font-bold text-slate-400">第 {entry.day} 天</span>
                        <ToneDot tone={entry.tone || 'accent'} />
                      </div>
                      <p className="line-clamp-2 text-[13px] font-medium leading-5 text-slate-700">{entry.detail}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="seller-panel-muted p-4">
                <h4 className="seller-label mb-3 flex items-center gap-2 text-xs">
                  <Target size={14} className="text-emerald-600" />
                  接下来优先动作
                </h4>
                <div className="space-y-2">
                  {summary.priorityActions.map((action, index) => (
                    <div key={`${action}-${index}`} className="flex items-start gap-2 rounded-[14px] bg-white px-3 py-2.5 text-sm font-medium leading-6 text-slate-700 shadow-[inset_0_0_0_1px_rgba(15,23,42,0.06)]">
                      <CheckCircle2 size={15} className="mt-1 shrink-0 text-emerald-600" />
                      <span>{action}</span>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>

          <div className="pt-4">
            <button
              onClick={onContinue}
              className="seller-button-primary ml-auto flex items-center justify-center gap-2 px-5 py-3 text-sm"
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

function MetricCard({ line }: { line: WeeklySummaryLine; key?: string }) {
  return (
    <div className="seller-panel-muted px-4 py-3">
      <div className="seller-label">{line.label}</div>
      <div className={`mt-2 text-2xl font-bold ${toneTextClass(line.tone || 'accent')}`}>{line.value}</div>
    </div>
  );
}

function ChangePanel({
  icon,
  title,
  items,
}: {
  icon: React.ReactNode;
  title: string;
  items: WeeklySummaryChange[];
}) {
  return (
    <div className="seller-panel min-w-0 overflow-hidden">
      <div className="border-b border-black/[0.05] px-4 py-3">
        <h4 className="seller-label flex items-center gap-2 text-xs">
          {icon}
          {title}
        </h4>
      </div>
      <div className="divide-y divide-black/[0.05]">
        {items.slice(0, 5).map((item, index) => (
          <ChangeRow key={`${item.title}-${index}`} item={item} />
        ))}
      </div>
    </div>
  );
}

function MarketWindowPanel({ lines }: { lines: WeeklySummaryLine[] }) {
  return (
    <div className="seller-panel min-w-0 overflow-hidden">
      <div className="border-b border-black/[0.05] px-4 py-3">
        <h4 className="seller-label flex items-center gap-2 text-xs">
          <CircleDollarSign size={14} className="text-emerald-600" />
          市场成交窗口
        </h4>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3">
        {lines.map((line) => (
          <div key={line.label} className="rounded-[14px] bg-slate-50 px-3 py-2.5">
            <div className="text-[10px] font-bold tracking-[0.02em] text-slate-400">{line.label}</div>
            <div className={`mt-1 text-base font-bold ${toneTextClass(line.tone || 'accent')}`}>{line.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChangeRow({ item }: { item: WeeklySummaryChange; key?: string }) {
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className={`mt-1 ${toneTextClass(item.tone || 'accent')}`}>
        <TrendingUp size={14} />
      </div>
      <div className="min-w-0">
        <div className="mb-1 truncate text-[12px] font-bold text-slate-800">{item.title}</div>
        <p className="text-[13px] font-medium leading-5 text-slate-600">{item.detail}</p>
      </div>
    </div>
  );
}

function ToneDot({ tone }: { tone: Tone }) {
  return <span className={`h-2 w-2 rounded-full ${toneBgClass(tone)}`} />;
}

function toneTextClass(tone: Tone) {
  if (tone === 'success') return 'text-emerald-600';
  if (tone === 'danger') return 'text-rose-600';
  return 'text-amber-600';
}

function toneBgClass(tone: Tone) {
  if (tone === 'success') return 'bg-emerald-500';
  if (tone === 'danger') return 'bg-rose-500';
  return 'bg-amber-500';
}
