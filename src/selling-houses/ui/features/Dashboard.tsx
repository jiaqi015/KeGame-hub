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
  Wallet,
} from 'lucide-react';
import { DailyJournal } from '../widgets/DailyJournal';
import { WEEKLY_ROUTINE } from '../../domain/constants';
import { getDayOfWeek, getRoutine } from '../../domain/utils';

interface DashboardProps {
  state: GameState;
  onSelectCase: (id: string) => void;
  onSetView: (view: string) => void;
}

export function Dashboard({ state, onSelectCase, onSetView }: DashboardProps) {
  const { metrics, schedule, priorities, day, maxDay, currentDate } = state;
  const { scenarioSnapshot } = state.runContext;
  const routine = getRoutine(day, WEEKLY_ROUTINE);
  const activeCases = state.cases.filter((entry) => entry.status === 'active');
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
  const tierSummaries = useMemo(() => buildTierStructure(state), [state]);
  const daysRemaining = Math.max(maxDay - day, 0);
  const activeCoreCount = tierSummaries.find((entry) => entry.goalTier === 'core')?.active || 0;
  const dangerCount = activeCases.filter((entry) => entry.storylineState === 'critical' || entry.storylineState === 'sliding').length;
  const leadCoreRisk = tierSummaries.find((entry) => entry.goalTier === 'core')?.leadCaseTitle || null;
  const todayGoal = topPriority?.title
    || (leadCase ? `围绕 ${leadCase.title} 做推进` : `按 ${routine.theme} 稳步推进`);
  const todayRisk = topRisk?.title
    || leadCase?.riskFlags?.[0]
    || (state.energy <= 1 ? '今日资源很紧，只能做关键动作' : '暂无显著风险');
  const todayAdvice = topPriority?.detail
    || deriveTodayAdvice(routine.theme, leadCase?.title, state.energy);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <MetricCard label="平均业主信任" value={metrics.averageTrust} icon={<TrendingUp size={20} />} color="text-emerald-600" />
        <MetricCard label="在场核心盘" value={`${activeCoreCount} 套`} icon={<Target size={20} />} color="text-rose-600" />
        <MetricCard label="高危房源" value={`${dangerCount} 套`} icon={<ShieldAlert size={20} />} color="text-amber-600" />
        <MetricCard label="项目进度" value={`${day}/${maxDay} 天`} icon={<Calendar size={20} />} color="text-slate-600" />
      </div>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <section className="rounded-[28px] border border-black/5 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-3">
            <Flag size={18} className="text-amber-500" />
            <div>
              <h3 className="text-sm font-bold uppercase tracking-widest text-slate-800">今日经营</h3>
              <p className="mt-1 text-xs text-slate-400">首页只回答今天最重要的三件事：目标、风险、下一步。</p>
            </div>
          </div>

          <div className="rounded-[24px] border border-black/[0.04] bg-gradient-to-br from-amber-50 via-white to-emerald-50/60 p-5">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  {state.runContext.scenarioName} · {scenarioSnapshot.scenario.theme}
                </div>
                <div className="mt-1.5 text-[24px] font-bold tracking-tight text-slate-900">
                  第 {day} 天 · {routine.label}
                </div>
                <div className="mt-1 text-[13px] font-semibold text-amber-700">{routine.theme}</div>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  {daysRemaining > 0 ? `距离本局结束还剩 ${daysRemaining} 天。` : '已经来到本局最后一天。'}
                  {leadCase ? ` 今天优先盯住 ${leadCase.title}。` : ' 今天先处理最确定的一步动作。'}
                </p>
              </div>

              <div className="grid min-w-[220px] grid-cols-2 gap-3">
                <SnapshotStat label="今日资源" value={`${state.energy}/${state.maxEnergy}`} helper="精力" />
                <SnapshotStat label="剩余时限" value={`${daysRemaining}`} helper="天" />
                <SnapshotStat label="聚焦房源" value={`${focusCases.length}`} helper="套" />
                <SnapshotStat label="待处理风险" value={`${Math.min(schedule.length, 9)}${schedule.length > 9 ? '+' : ''}`} helper="条" />
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
              <DecisionCard icon={<Target size={15} />} label="今日目标" value={todayGoal} tone="emerald" />
              <DecisionCard icon={<Siren size={15} />} label="主风险" value={todayRisk} tone="rose" />
              <DecisionCard icon={<Sparkles size={15} />} label="建议打法" value={todayAdvice} tone="slate" />
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
                      className="rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:text-slate-900"
                    >
                      {caseItem.title}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 rounded-[22px] border border-black/[0.05] bg-white/90 p-4">
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
          </div>
        </section>

        <div className="space-y-5">
          <section className="rounded-[24px] border border-black/5 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <Wallet size={18} className="text-emerald-600" />
              <div>
                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-800">推广金</h3>
                <p className="mt-1 text-xs text-slate-400">
                  开局拨付 {state.runContext.scenarioSnapshot.scenario.rules?.initialCash ?? state.rules.initialCash} 点，每周补给 {state.rules.weeklyBudgetAllowance} 点，成交后按佣金的 {Math.round(state.rules.promotionRebateRatio * 100)}% 返投，保底 {state.rules.promotionRebateFloor} 点。
                </p>
              </div>
            </div>
            <div className="mb-4 rounded-[18px] border border-emerald-100 bg-emerald-50 px-4 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">当前余额</div>
              <div className="mt-1 text-[28px] font-bold text-emerald-900">{state.cash} 点</div>
            </div>
            <div className="space-y-2.5">
              {state.budgetLedger.slice(0, 5).map((entry) => (
                <div key={entry.id} className="rounded-xl border border-black/[0.04] bg-slate-50 px-3.5 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[12px] font-semibold text-slate-800">{entry.title}</div>
                      <div className="mt-1 text-[11px] leading-relaxed text-slate-500">{entry.detail}</div>
                    </div>
                    <div className="text-right">
                      <div className={`text-sm font-bold ${entry.amount >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {entry.amount >= 0 ? '+' : ''}{entry.amount}
                      </div>
                      <div className="text-[10px] font-medium text-slate-400">余额 {entry.balanceAfter}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[28px] border border-black/5 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <Clock3 size={18} className="text-slate-700" />
              <div>
                <h3 className="text-sm font-bold uppercase tracking-widest text-slate-800">未来节奏</h3>
                <p className="mt-1 text-xs text-slate-400">未来只看稳定节奏，不在首页预演完整事件。</p>
              </div>
            </div>
            <div className="space-y-2.5">
              {upcomingDays.map((entry) => (
                <div key={entry.day}>
                  <FuturePreviewCard entry={entry} />
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
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr] items-start">
        <section className="rounded-[24px] border border-black/5 bg-white p-5 shadow-sm">
          <div className="mb-5">
            <h3 className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-400">
              <Zap className="text-amber-500" size={16} />
              建议决策
            </h3>
            <p className="mt-1 text-xs text-slate-400">这里只给建议，不会替你自动执行动作。</p>
          </div>
          <div className="space-y-2.5">
            {priorities.map((p, i) => (
              <div
                key={i}
                className="group cursor-pointer rounded-xl border border-transparent bg-slate-50 p-3.5 transition-all hover:border-black/10"
                onClick={() => {
                  if (p.caseId) {
                    onSelectCase(p.caseId);
                    onSetView('cases');
                  }
                }}
              >
                <div className="flex items-start justify-between">
                  <strong className="text-xs font-bold tracking-tight text-slate-800">{p.title}</strong>
                  <span className="text-[8px] font-bold uppercase tracking-widest text-slate-300">{p.kind}</span>
                </div>
                <p className="mt-1 line-clamp-1 text-[11px] text-slate-500">{p.detail}</p>
              </div>
            ))}
            {priorities.length === 0 && (
              <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-8 text-center text-xs italic text-slate-400">
                当前没有强优先级事项，可以先盘一遍业主反馈和准客池。
              </div>
            )}
          </div>
        </section>

        <section className="rounded-[24px] border border-black/5 bg-white p-5 shadow-sm">
          <h3 className="mb-5 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-slate-400">
            <ShieldAlert className="text-rose-500" size={16} />
            预警监控
          </h3>
          <div className="space-y-2.5">
            {schedule.map((s) => (
              <div key={s.key} className="flex items-center justify-between rounded-xl border border-dashed border-slate-200 bg-slate-50/30 p-3">
                <div className="flex flex-col">
                  <span className="text-[11px] font-bold text-slate-700">{s.title}</span>
                  <small className="text-[9px] font-medium text-slate-400">{s.badge}</small>
                </div>
                <div className="flex h-6 w-6 items-center justify-center rounded-full bg-rose-50">
                  <div className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                </div>
              </div>
            ))}
            {schedule.length === 0 && (
              <p className="py-6 text-center text-[10px] font-medium italic text-slate-400">商圈表现稳定，暂无显著风险。</p>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-[28px] border border-black/5 bg-white p-6 shadow-sm">
        <DailyJournal state={state} />
      </section>
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

function deriveTodayAdvice(theme: string, leadCaseTitle?: string | null, energy?: number) {
  if ((energy || 0) <= 1) {
    return '资源偏紧，优先做一件最关键的稳定动作，不要同时铺太多线。';
  }

  if (leadCaseTitle) {
    return `先围绕 ${leadCaseTitle} 做推进，再把剩余资源投到最可能见效的线索上。`;
  }

  return `按照“${theme}”的节奏推进，先做高确定性动作，再处理次优事项。`;
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
      detail: names.length > 0 ? `建议优先提报 ${names.join('、')}，争取本周资源位。` : '这周仍需要准备可提报的盘源材料。',
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
      detail: dow === 6 ? '适合把本周积累的准客压到带看和再看。' : '如果周末做过动作，今天要优先吃后续结果。',
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
      leadCaseTitle: leadCase ? `${leadCase.title} 最需要先盯住。` : null,
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
      ? `这组还有 ${danger} 套在抖，先盯 ${leadCaseTitle}。`
      : `这组还有 ${danger} 套在抖，今天优先稳住。`;
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
