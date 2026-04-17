import React, { useMemo } from 'react';
import { GameState } from '../../domain/models';
import { formatDate } from '../../domain/utils';
import {
  Calendar,
  Clock3,
  Flag,
  ShieldAlert,
  Siren,
  Sparkles,
  Target,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { WEEKLY_ROUTINE } from '../../domain/constants';
import { getDayOfWeek, getRoutine } from '../../domain/utils';

interface DashboardProps {
  state: GameState;
  onSelectCase: (id: string) => void;
  onSetView: (view: string) => void;
}

export function Dashboard({ state, onSelectCase, onSetView }: DashboardProps) {
  const { metrics, schedule, priorities, day, maxDay, currentDate } = state;
  const routine = getRoutine(day, WEEKLY_ROUTINE);
  const activeCases = state.cases.filter((entry) => entry.status === 'active');
  const activeRivalListings = state.marketShadow?.rivalListings?.filter((entry) => entry.status === 'active') || [];
  const marketSignals = state.marketShadow?.marketSignals || [];
  const companyPressure = state.marketShadow?.companyPressure;
  const dailyMarketEvent = state.marketShadow?.dailyMarketEvent;
  const focusCases = state.cases.filter((entry) => entry.status === 'active' && entry.isFocused).slice(0, 2);
  const leadCase = focusCases[0]
    || [...activeCases]
      .sort((a, b) => b.competitiveness - a.competitiveness)[0]
    || null;
  const topPriority = priorities[0] || null;
  const topRisk = schedule[0] || null;
  const highlightedMarketEvents = state.eventLog
    .filter((event) => event.actor === '市场' || event.actor === '宏观')
    .slice(0, 3);
  const upcomingDays = useMemo(() => buildUpcomingPreview(state), [state]);
  const recentTimeline = useMemo(() => buildRecentTimeline(state), [state]);
  const tierSummaries = useMemo(() => buildTierStructure(state), [state]);
  const daysRemaining = Math.max(maxDay - day, 0);
  const activeCoreCount = tierSummaries.find((entry) => entry.goalTier === 'core')?.active || 0;
  const dangerCount = activeCases.filter((entry) => entry.storylineState === 'critical' || entry.storylineState === 'sliding').length;
  const leadCoreRisk = tierSummaries.find((entry) => entry.goalTier === 'core')?.leadCaseTitle || null;
  const todayFocus = leadCase
    ? `${leadCase.title} · ${Math.round(leadCase.competitiveness)} 分`
    : '暂无聚焦盘';
  const todayRisk = topRisk?.title
    || leadCase?.riskFlags?.[0]
    || (state.energy <= 1 ? '今日资源很紧，只能做关键动作' : '暂无显著风险');
  const todayResourceState = `${state.energy}/${state.maxEnergy} 精力 · 剩余 ${daysRemaining} 天`;
  const todayBriefs = buildTodayBriefs(state);
  const visiblePriorities = priorities.slice(0, 4);
  const overflowPriorityCount = Math.max(priorities.length - visiblePriorities.length, 0);
  const visibleSchedule = schedule.slice(0, 4);
  const overflowRiskCount = Math.max(schedule.length - visibleSchedule.length, 0);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MetricCard label="平均业主信任" value={metrics.averageTrust} icon={<TrendingUp size={20} />} color="text-emerald-600" />
        <MetricCard label="在场核心盘" value={`${activeCoreCount} 套`} icon={<Target size={20} />} color="text-rose-600" />
        <MetricCard label="高危房源" value={`${dangerCount} 套`} icon={<ShieldAlert size={20} />} color="text-amber-600" />
        <MetricCard label="模拟周期" value={`${day}/${maxDay} 天`} icon={<Calendar size={20} />} color="text-slate-600" />
      </div>

      <section className="rounded-[28px] border border-black/5 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-widest text-slate-800">今日事实</h3>
            <p className="mt-1 text-xs text-slate-400">只展示今天发生的变化、影响范围和当前可见机会。</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-[10px] font-bold text-slate-500">
            Day {day}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
          {todayBriefs.map((brief) => (
            <div key={`${brief.label}-${brief.title}`}>
              <TodayBriefCard brief={brief} />
            </div>
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <ShadowPulseCard
          label={dailyMarketEvent ? `第 ${dailyMarketEvent.day} 天` : '商圈动静'}
          title={dailyMarketEvent?.title || '今天没大事'}
          detail={dailyMarketEvent?.message || '没有明显外部冲击，按当前经营节奏推进。'}
          tone={dailyMarketEvent?.tone || 'accent'}
        />
        <ShadowPulseCard
          label="别人也在卖"
          title={activeRivalListings.length > 0 ? `${activeRivalListings.length} 套竞品在抢客` : '暂未看到强竞品'}
          detail={activeRivalListings[0] ? `${activeRivalListings[0].title} 正在分走同板块客户。` : '当前没有看到强势竞品在分流。'}
          tone={activeRivalListings.length >= 2 ? 'danger' : 'accent'}
        />
        <ShadowPulseCard
          label="客户池"
          title={(companyPressure?.sharedLeadPressure || 0) >= 58 ? '共享客户偏紧' : '客户池还算平稳'}
          detail={marketSignals[0]?.message || '市场侧暂未出现明确新需求信号。'}
          tone={(companyPressure?.sharedLeadPressure || 0) >= 58 ? 'danger' : 'accent'}
        />
      </section>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[0.85fr_1.15fr]">
        <div className="space-y-5">
          <section className="rounded-[28px] border border-black/5 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <Clock3 size={18} className="text-slate-700" />
              <div>
                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-800">经营节奏</h3>
                <p className="mt-1 text-xs text-slate-400">一张卡里看接下来三天，也顺手回看最近几天，时间信息不再分两处。</p>
              </div>
            </div>
            <div className="mb-4 rounded-[18px] border border-black/[0.04] bg-slate-50 px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">节奏提醒</div>
              <div className="mt-1 text-sm font-semibold text-slate-800">
                今天是 {routine.label} · {routine.theme}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                {leadCoreRisk ? `这周最要提前防的是 ${leadCoreRisk}。` : '这周没有明显提前爆炸的核心盘，先按节奏推进。'}
              </p>
            </div>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">接下来三天</div>
            <div className="mt-2.5 space-y-2.5">
              {upcomingDays.map((entry) => (
                <div key={entry.day}>
                  <FuturePreviewCard entry={entry} />
                </div>
              ))}
            </div>
            <div className="mt-5 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">最近进展</div>
            <div className="mt-2.5 space-y-2.5">
              {recentTimeline.map((entry) => (
                <div key={entry.day}>
                  <RecentTimelineCard entry={entry} />
                </div>
              ))}
            </div>
          </section>

          {highlightedMarketEvents.length > 0 && (
            <section className="rounded-[24px] border border-amber-200/60 bg-gradient-to-br from-amber-50 via-white to-rose-50 p-5 shadow-sm">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-amber-700">
                <ShieldAlert className="text-rose-500" size={16} />
                市场异动
              </h3>
              <div className="space-y-2.5">
                {highlightedMarketEvents.map((event, index) => (
                  <div
                    key={`${event.day}-${index}`}
                    className={`rounded-xl border px-3.5 py-3 ${
                      event.tone === 'danger'
                        ? 'border-rose-200 bg-rose-50/80'
                        : 'border-emerald-200 bg-emerald-50/80'
                    }`}
                  >
                    <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{event.actor}</div>
                    <p className="mt-1 text-xs font-medium leading-relaxed text-slate-700">{event.message}</p>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <section className="rounded-[28px] border border-black/5 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3">
              <Flag size={18} className="text-amber-500" />
              <div>
                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-800">今日盘面</h3>
                <p className="mt-1 text-xs text-slate-400">这里只看今天最关键的事实：焦点、风险和资源状态。</p>
              </div>
            </div>

            <div className="grid min-w-[220px] grid-cols-2 gap-2">
              <SnapshotStat label="今日资源" value={`${state.energy}/${state.maxEnergy}`} helper="精力" />
              <SnapshotStat label="剩余时限" value={`${daysRemaining}`} helper="天" />
              <SnapshotStat label="聚焦房源" value={`${focusCases.length}`} helper="套" />
              <SnapshotStat label="待处理风险" value={`${Math.min(schedule.length, 9)}${schedule.length > 9 ? '+' : ''}`} helper="条" />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <DecisionCard icon={<Target size={15} />} label="当前焦点" value={todayFocus} tone="emerald" />
            <DecisionCard icon={<Siren size={15} />} label="风险变化" value={todayRisk} tone="rose" />
            <DecisionCard icon={<Sparkles size={15} />} label="资源状态" value={todayResourceState} tone="slate" />
          </div>

          {focusCases.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">今日聚焦盘</div>
              <div className="flex flex-wrap gap-2">
                {focusCases.map((caseItem) => (
                  <button
                    key={caseItem.id}
                    type="button"
                    onClick={() => {
                      onSelectCase(caseItem.id);
                      onSetView('cases');
                    }}
                    className="rounded-full border border-black/[0.05] bg-slate-50 px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition hover:-translate-y-0.5 hover:bg-white hover:text-slate-900"
                  >
                    {caseItem.title}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-5 rounded-[22px] border border-black/[0.05] bg-slate-50/70 p-4">
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
              <ShieldAlert size={14} className="text-rose-500" />
              当前盘型结构
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
              {tierSummaries.map((entry) => (
                <div key={entry.goalTier}>
                  <TierStructureCard entry={entry} />
                </div>
              ))}
            </div>
            <div className="mt-3 rounded-2xl border border-rose-100 bg-rose-50/80 px-4 py-3 text-sm text-rose-900">
              <span className="font-semibold">现在最不能掉的：</span>
              {leadCoreRisk ? ` ${leadCoreRisk}` : ' 核心盘暂时都还稳着。'}
            </div>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[1.16fr_0.84fr]">
        <section className="rounded-[26px] border border-black/5 bg-gradient-to-br from-white via-white to-amber-50/40 p-5 shadow-sm">
          <div className="mb-5">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-500">
              <Zap className="text-amber-500" size={16} />
              盘面变化
            </h3>
            <p className="mt-1 text-xs text-slate-400">系统只把变化较大的事项摆出来，不替你决定先做哪一个。</p>
          </div>
          <div className="space-y-2.5">
            {visiblePriorities.map((p, i) => (
              <div
                key={i}
                className="group cursor-pointer rounded-2xl border border-black/[0.05] bg-white/90 p-4 transition-all hover:border-black/10 hover:shadow-sm"
                onClick={() => {
                  if (p.caseId) {
                    onSelectCase(p.caseId);
                    onSetView('cases');
                  }
                }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-3">
                    <strong className="text-sm font-bold tracking-tight text-slate-800">{p.title}</strong>
                    <span className="shrink-0 text-[8px] font-bold uppercase tracking-widest text-slate-300">{p.kind}</span>
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-slate-500">{p.detail}</p>
                </div>
              </div>
            ))}
            {overflowPriorityCount > 0 && (
              <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50/70 px-4 py-3 text-xs text-amber-800">
                还有 {overflowPriorityCount} 条变化没有在首页展开，避免首页继续堆满。
              </div>
            )}
            {priorities.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-8 text-center text-xs italic text-slate-400">
                当前没有明显新增变化，可以继续按既定节奏推进。
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[24px] border border-black/5 bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-500">
              <ShieldAlert className="text-rose-500" size={16} />
              预警监控
            </h3>
            <p className="mt-1 text-xs text-slate-400">这块只保留风险提醒，集中展示正在抬头的问题。</p>
          </div>
          <div className="mb-4 rounded-[18px] border border-rose-100 bg-rose-50/70 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-rose-500">风险概览</div>
                <div className="mt-1 text-sm font-semibold text-slate-800">
                  当前 {schedule.length} 条待处理风险
                </div>
                <p className="mt-1 text-xs leading-relaxed text-slate-500">
                  {topRisk ? `最需要先盯的是：${topRisk.title}` : '当前没有明显风险，可以按经营节奏推进。'}
                </p>
              </div>
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-rose-500 shadow-sm">
                <ShieldAlert size={16} />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            {visibleSchedule.map((s) => (
              <div key={s.key} className="flex items-center justify-between rounded-xl border border-dashed border-slate-200 bg-slate-50/40 px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-semibold text-slate-700">{s.title}</div>
                  <small className="text-[10px] font-medium text-slate-400">{s.badge}</small>
                </div>
                <div className="ml-3 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-rose-50">
                  <div className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                </div>
              </div>
            ))}
            {overflowRiskCount > 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-3.5 py-3 text-[11px] text-slate-500">
                还有 {overflowRiskCount} 条风险未在首页展开，进入详情页再看全量。
              </div>
            )}
            {schedule.length === 0 && (
              <p className="py-4 text-center text-[11px] font-medium italic text-slate-400">商圈表现稳定，暂无显著风险。</p>
            )}
          </div>
        </section>
      </div>

    </div>
  );
}

function buildUpcomingPreview(state: GameState) {
  return Array.from({ length: 3 }, (_, index) => {
    const offset = index + 1;
    const absoluteDay = state.day + offset;
    const date = shiftDate(state.currentDate, offset);
    const routine = getRoutine(absoluteDay, WEEKLY_ROUTINE);
    const fixedAgenda = deriveFixedAgenda(absoluteDay, state);
    const primaryAgenda = fixedAgenda.find((item) => item.label === '固定事项') || fixedAgenda[0];

    return {
      day: absoluteDay,
      offset,
      date,
      routine,
      agenda: primaryAgenda,
    };
  });
}

function buildRecentTimeline(state: GameState) {
  return Array.from({ length: 3 }, (_, index) => {
    const offset = -index;
    const absoluteDay = state.day + offset;
    const date = shiftDate(state.currentDate, offset);
    const events = state.eventLog
      .filter((event) => event.day === absoluteDay)
      .slice(-2)
      .reverse();

    return {
      day: absoluteDay,
      offset,
      date,
      label: offset === 0 ? '今天' : offset === -1 ? '昨天' : '前天',
      summary: deriveRecentTimelineSummary(events, offset),
      events,
    };
  }).filter((entry) => entry.day > 0);
}

function deriveRecentTimelineSummary(
  events: Array<{ tone?: string }>,
  offset: number,
) {
  if (events.length === 0) {
    return offset === 0 ? '本日经营还没开始，还没有新增记录。' : '这一天没有留下关键记录。';
  }

  if (events.some((event) => event.tone === 'danger')) {
    return '这一天出现了风险波动，记录里能看到承接动作。';
  }

  if (events.some((event) => event.tone === 'success')) {
    return '这一天出现了正向反馈，结果已经被记录下来。';
  }

  if (events.some((event) => event.tone === 'accent')) {
    return '这一天有节奏变化，推进节点比较明显。';
  }

  return '这一天完成了常规推进，节奏比较平稳。';
}

function SnapshotStat({ label, value, helper }: { label: string; value: string; helper: string }) {
  return (
    <div className="rounded-2xl bg-white px-4 py-3 text-right shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</div>
      <div className="mt-1 text-xl font-bold text-slate-900">{value}</div>
      <div className="text-[10px] text-slate-400">{helper}</div>
    </div>
  );
}

function TierStructureCard({
  entry,
}: {
  entry: {
    goalTier: 'core' | 'important' | 'normal';
    label: string;
    rule: string;
    total: number;
    active: number;
    danger: number;
    settled: number;
    failed: number;
    note: string;
  };
}) {
  return (
    <div className="rounded-2xl border border-black/[0.05] bg-slate-50/80 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-slate-900">{entry.label}</div>
          <div className="mt-1 text-[11px] leading-relaxed text-slate-500">{entry.rule}</div>
        </div>
        <div className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          共 {entry.total} 套
        </div>
      </div>
      <div className="mt-3 grid grid-cols-4 gap-2">
        <TierMiniStat label="在场" value={entry.active} />
        <TierMiniStat label="高危" value={entry.danger} />
        <TierMiniStat label="收口" value={entry.settled} />
        <TierMiniStat label="失手" value={entry.failed} />
      </div>
      <p className="mt-3 text-xs leading-relaxed text-slate-600">{entry.note}</p>
    </div>
  );
}

function TierMiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-white px-2.5 py-2 text-center shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function DecisionCard({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone: 'emerald' | 'rose' | 'slate';
}) {
  const toneClass = tone === 'emerald'
    ? 'border-emerald-100 bg-emerald-50/90 text-emerald-700'
    : tone === 'rose'
      ? 'border-rose-100 bg-rose-50/90 text-rose-700'
      : 'border-slate-200 bg-white/90 text-slate-700';

  return (
    <div className={`rounded-xl border px-3.5 py-3 ${toneClass}`}>
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] opacity-80">
        {icon}
        {label}
      </div>
      <div className="mt-1.5 text-[13px] font-semibold leading-relaxed text-slate-800">{value}</div>
    </div>
  );
}

function FuturePreviewCard({
  entry,
}: {
  entry: {
    day: number;
    offset: number;
    date: string;
    routine: { label: string; theme: string; energy: number };
    agenda?: { title: string; detail: string; tone: 'neutral' | 'accent' | 'danger' };
  };
}) {
  const toneClass = entry.agenda?.tone === 'danger'
    ? 'border-rose-200 bg-rose-50/80'
    : entry.agenda?.tone === 'accent'
      ? 'border-amber-200 bg-amber-50/70'
      : 'border-black/[0.05] bg-slate-50';

  return (
    <div className={`rounded-xl border px-3.5 py-3 ${toneClass}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            {entry.routine.label} · +{entry.offset}天
          </div>
          <div className="mt-1 text-[13px] font-semibold text-slate-800">{formatDate(entry.date)}</div>
          <div className="mt-1 text-xs text-slate-600">{entry.routine.theme}</div>
        </div>
        <div className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          {entry.routine.energy} 精力
        </div>
      </div>
      <div className="mt-2.5 text-[12px] font-semibold text-slate-800">
        {entry.agenda?.title || '按默认节奏推进'}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        {entry.agenda?.detail || '暂无额外固定事项，按当日盘面灵活调度。'}
      </p>
    </div>
  );
}

function RecentTimelineCard({
  entry,
}: {
  entry: {
    day: number;
    date: string;
    label: string;
    summary: string;
    events: Array<{ actor: string; message: string; tone?: string }>;
  };
}) {
  return (
    <div className="rounded-xl border border-black/[0.05] bg-slate-50 px-3.5 py-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
            {entry.label} · Day {entry.day}
          </div>
          <div className="mt-1 text-[13px] font-semibold text-slate-800">{formatDate(entry.date)}</div>
        </div>
        <div className="rounded-full bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">
          {entry.events.length} 条记录
        </div>
      </div>
      <p className="mt-2 text-xs leading-relaxed text-slate-600">{entry.summary}</p>
      <div className="mt-2.5 space-y-2">
        {entry.events.length > 0 ? entry.events.map((event, index) => (
          <div
            key={`${event.actor}-${index}`}
            className={`rounded-lg border px-3 py-2 ${
              event.tone === 'danger'
                ? 'border-rose-200 bg-rose-50/80'
                : event.tone === 'success'
                  ? 'border-emerald-200 bg-emerald-50/80'
                  : event.tone === 'accent'
                    ? 'border-amber-200 bg-amber-50/70'
                    : 'border-black/[0.05] bg-white'
            }`}
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{event.actor}</div>
            <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-slate-700">{event.message}</p>
          </div>
        )) : (
          <div className="rounded-lg border border-dashed border-slate-200 bg-white px-3 py-2 text-[12px] text-slate-400">
            暂无关键经营记录。
          </div>
        )}
      </div>
    </div>
  );
}

function deriveFixedAgenda(day: number, state: GameState) {
  const routine = getRoutine(day, WEEKLY_ROUTINE);
  const dow = getDayOfWeek(day);
  const items: Array<{ label: string; title: string; detail: string; tone: 'neutral' | 'accent' | 'danger' }> = [
    {
      label: '节奏',
      title: routine.theme,
      detail: `这一天系统默认给你 ${routine.energy} 点精力，适合按周节奏排布工作。`,
      tone: 'neutral',
    },
  ];

  if (dow === 4) {
    const names = state.cases
      .filter((c) => c.status === 'active')
      .sort((a, b) => b.competitiveness - a.competitiveness)
      .slice(0, 2)
      .map((c) => c.title);
    items.push({
      label: '固定事项',
      title: '房源聚焦会',
      detail: names.length > 0 ? `本周资源位会围绕 ${names.join('、')} 展开。` : '这周仍需要准备可提报的盘源材料。',
      tone: 'accent',
    });
  }

  if (dow === 5) {
    items.push({
      label: '固定事项',
      title: '每周业主反馈',
      detail: '整理带看、准客池和竞品反馈，用一页话术把业主拉回同一口径。',
      tone: 'accent',
    });
  }

  if (dow === 6 || dow === 7) {
    items.push({
      label: '固定事项',
      title: dow === 6 ? '周末带看高峰' : '开放日后追客',
      detail: dow === 6 ? '周末通常会集中承接本周积累的准客。' : '如果周末做过动作，今天通常会看到后续反馈。',
      tone: 'accent',
    });
  }

  if (routine.energy <= 1) {
    items.push({
      label: '提醒',
      title: '低资源日',
      detail: '精力紧，只适合做最关键的一两件事，不适合同时铺太多动作。',
      tone: 'danger',
    });
  }

  return items;
}

function shiftDate(currentDate: string, offset: number) {
  const date = new Date(currentDate);
  date.setDate(date.getDate() + offset);
  return date.toISOString().split('T')[0];
}

function MetricCard({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) {
  return (
    <div className="group rounded-[22px] border border-black/5 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-2.5 flex items-center gap-3">
        <div className={`rounded-xl bg-slate-50 p-2 ${color} transition-transform group-hover:scale-110`}>
          {icon}
        </div>
        <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-400">{label}</span>
      </div>
      <div className="text-[22px] font-bold tracking-tight text-slate-900">{value}</div>
    </div>
  );
}

function buildTodayBriefs(state: GameState) {
  const activeCases = state.cases.filter((entry) => entry.status === 'active');
  const activeRivals = state.marketShadow?.rivalListings?.filter((entry) => entry.status === 'active') || [];
  const signal = state.marketShadow?.marketSignals?.[0];
  const dailyEvent = state.marketShadow?.dailyMarketEvent;
  const urgentCase = [...activeCases]
    .sort((left, right) => scoreCurrentDanger(right) - scoreCurrentDanger(left))[0];
  const lateCase = activeCases.find((caseItem) => {
    return state.opportunities.some((entry) => (
      entry.caseId === caseItem.id
      && entry.status === 'active'
      && entry.visibility !== 'shadow'
      && entry.stageIndex >= 3
    ));
  });

  const firstBrief = dailyEvent
    ? {
        label: '商圈变化',
        title: dailyEvent.title,
        detail: dailyEvent.message,
        tone: dailyEvent.tone,
      }
    : {
        label: '商圈变化',
        title: '今天没有大冲击',
        detail: '商圈暂时平稳，重点看手里房源有没有断档。',
        tone: 'accent',
      };

  const secondBrief = urgentCase
    ? {
        label: '受影响房源',
        title: urgentCase.title,
        detail: buildPlainCaseReason(state, urgentCase),
        tone: urgentCase.storylineState === 'critical' || urgentCase.windowDays <= 3 ? 'danger' : 'accent',
      }
    : {
        label: '受影响房源',
        title: '暂无明显危险房',
        detail: '没有房源进入明显失守区，先按计划做推进。',
        tone: 'success',
      };

  const thirdBrief = lateCase
    ? {
        label: '客户与机会',
        title: `${lateCase.title} 已有后段客户`,
        detail: '已有客户进入后段阶段，接下来的结果会更快显现。',
        tone: 'success',
      }
    : activeRivals[0]
      ? {
          label: '客户与机会',
          title: '竞品正在分流客户',
          detail: `${activeRivals[0].title} 正在抢同类客户。`,
          tone: 'danger',
        }
      : signal
        ? {
            label: '客户与机会',
            title: signal.title,
            detail: signal.message,
            tone: 'accent',
          }
        : {
            label: '客户与机会',
            title: '当前没有新增机会',
            detail: '今天的机会面比较安静，盘面主要看现有房源和现有客户。',
            tone: 'accent',
          };

  return [firstBrief, secondBrief, thirdBrief];
}

function buildPlainCaseReason(state: GameState, caseItem: GameState['cases'][number]) {
  const opportunities = state.opportunities.filter((entry) => entry.caseId === caseItem.id && entry.status === 'active');
  if (caseItem.status === 'lost_to_rival') return '已经被别家截走，这局只能复盘原因。';
  if (caseItem.status === 'withdrawn') return '业主已经撤盘，重点复盘前面哪里断了。';
  if (caseItem.windowDays <= 3) return `只剩 ${caseItem.windowDays} 天窗口，今天不能再拖。`;
  if (caseItem.trust < 55) return '业主已经动摇，先把推进节奏讲清楚。';
  if (opportunities.length === 0) return '客户池偏空，继续谈价也很难收口。';
  if (caseItem.heat < 45) return '看房热度偏冷，需要先把盘面拉起来。';
  return '这套还在场，但需要用一次明确动作推进。';
}

function TodayBriefCard({
  brief,
}: {
  brief: {
    label: string;
    title: string;
    detail: string;
    tone: string;
  };
}) {
  const toneClass = brief.tone === 'danger'
    ? 'border-rose-100 bg-rose-50/70'
    : brief.tone === 'success'
      ? 'border-emerald-100 bg-emerald-50/70'
      : 'border-amber-100 bg-amber-50/70';
  return (
    <div className={`rounded-[22px] border p-4 ${toneClass}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-500">{brief.label}</div>
      <div className="mt-1 text-base font-bold text-slate-900">{brief.title}</div>
      <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-600">{brief.detail}</p>
    </div>
  );
}

function ShadowPulseCard({
  label,
  title,
  detail,
  tone,
}: {
  label: string;
  title: string;
  detail: string;
  tone: string;
}) {
  const toneClass = tone === 'danger'
    ? 'border-rose-100 bg-rose-50/70 text-rose-700'
    : tone === 'success'
      ? 'border-emerald-100 bg-emerald-50/70 text-emerald-700'
      : 'border-amber-100 bg-amber-50/70 text-amber-700';

  return (
    <div className={`rounded-[22px] border p-4 shadow-sm ${toneClass}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.16em] opacity-70">{label}</div>
      <div className="mt-1 text-base font-bold text-slate-900">{title}</div>
      <p className="mt-1.5 line-clamp-2 text-xs leading-5 text-slate-600">{detail}</p>
    </div>
  );
}

function buildTierStructure(state: GameState) {
  return (['core', 'important', 'normal'] as const).map((goalTier) => {
    const cases = state.cases.filter((entry) => entry.goalTier === goalTier);
    const activeCases = cases.filter((entry) => entry.status === 'active');
    const settled = cases.filter((entry) => entry.status === 'sold').length;
    const failed = cases.filter((entry) => entry.status === 'lost_to_rival' || entry.status === 'withdrawn').length;
    const dangerCases = activeCases.filter((entry) => entry.storylineState === 'critical' || entry.storylineState === 'sliding');
    const leadCase = [...dangerCases, ...activeCases]
      .sort((left, right) => scoreCurrentDanger(right) - scoreCurrentDanger(left))[0];

    return {
      goalTier,
      label: goalTierLabel(goalTier),
      rule: goalTierRule(goalTier),
      total: cases.length,
      active: activeCases.length,
      danger: dangerCases.length,
      settled,
      failed,
      leadCaseTitle: leadCase ? `${leadCase.title}` : null,
      note: buildTierStructureNote(goalTier, activeCases.length, dangerCases.length, settled, failed, leadCase?.title),
    };
  });
}

function buildTierStructureNote(
  goalTier: 'core' | 'important' | 'normal',
  active: number,
  danger: number,
  settled: number,
  failed: number,
  leadCaseTitle?: string,
) {
  if (failed > 0) {
    return `${goalTierLabel(goalTier)}已经有 ${failed} 套失手，这组不能再继续放任。`;
  }
  if (danger > 0) {
    return leadCaseTitle
      ? `这组还有 ${danger} 套在抖，当前风险最高的是 ${leadCaseTitle}。`
      : `这组还有 ${danger} 套在抖，当前处在波动阶段。`;
  }
  if (active > 0) {
    return `${goalTierLabel(goalTier)}还有 ${active} 套在场，当前节奏基本稳得住。`;
  }
  if (settled > 0) {
    return `${goalTierLabel(goalTier)}这组已经基本收口，可以把资源往别处挪。`;
  }
  return `${goalTierLabel(goalTier)}目前没有在场盘。`;
}

function goalTierLabel(goalTier: 'core' | 'important' | 'normal') {
  if (goalTier === 'core') return '核心盘';
  if (goalTier === 'important') return '重要盘';
  return '普通盘';
}

function goalTierRule(goalTier: 'core' | 'important' | 'normal') {
  if (goalTier === 'core') return '这组最贵，最怕被截走。';
  if (goalTier === 'important') return '这组决定你能不能把局势撑住。';
  return '这组能放，但不能乱放。';
}

function scoreCurrentDanger(caseItem: GameState['cases'][number]) {
  if (caseItem.status !== 'active') {
    return -1;
  }

  let score = 0;
  if (caseItem.storylineState === 'critical') score += 120;
  if (caseItem.storylineState === 'sliding') score += 80;
  if (caseItem.windowDays <= 4) score += 40;
  if (caseItem.trust <= 55) score += 34;
  if (caseItem.competitionGroupIds.length > 0) score += 18;
  if (caseItem.heat <= 45) score += 16;
  return score;
}
