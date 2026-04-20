import React, { useEffect, useMemo, useState } from 'react';
import type { GameState } from '../../domain/models';
import { formatDate, getRoutine } from '../../domain/utils';
import {
  buildOperatingProjection,
  type CalendarDayProjection,
  type DashboardProjection,
  type ProjectionBrief,
  type ProjectionTone,
} from '../../application/projections/operatingProjection.js';
import {
  Calendar,
  Clock3,
  Flag,
  Newspaper,
  ShieldAlert,
  Sparkles,
  Target,
  Users,
  Zap,
} from 'lucide-react';
import { WEEKLY_ROUTINE } from '../../domain/constants';
import { deriveImpactedCases, deriveIntelFeed, type IntelItem, type IntelLayerTab, layerLabel, toneLabel } from './marketIntel';
import { deriveCustomerPressureSummary } from '../../domain/engine/customerEngine';

interface DashboardProps {
  state: GameState;
  onSelectCase: (id: string) => void;
  onSetView: (view: string) => void;
  onOpenMarket: (layer?: IntelLayerTab) => void;
}

type OperatingBriefTone = 'risk' | 'chance' | 'neutral';
type CalendarRelation = 'past' | 'today' | 'future';

type CalendarRailEntry = {
  day: number;
  relation: CalendarRelation;
  label: string;
  title: string;
  detail: string;
  meta: string;
  tone: ProjectionTone;
  energy?: number;
};

type JournalItem = {
  id: string;
  day: number;
  title: string;
  detail: string;
  actor: string;
  tone: 'accent' | 'danger' | 'success';
  caseId?: string;
  date?: string;
};

type AgendaTool = {
  label: string;
  target: 'case' | 'customers' | 'market' | 'review';
  marketLayer?: IntelLayerTab;
};

export function Dashboard({ state, onSelectCase, onSetView, onOpenMarket }: DashboardProps) {
  const { day, maxDay } = state;
  const routine = getRoutine(day, WEEKLY_ROUTINE);
  const [selectedDay, setSelectedDay] = useState(day);

  useEffect(() => {
    setSelectedDay(day);
  }, [day]);

  const operatingProjection = useMemo(() => buildOperatingProjection(state), [state]);
  const dashboardProjection = operatingProjection.dashboard;
  const operatingBrief = useMemo(() => buildOperatingBrief(dashboardProjection), [dashboardProjection]);
  const allJournalItems = useMemo(() => buildJournalItems(state), [state]);
  const calendarRail = useMemo(
    () => buildCalendarRail(state, dashboardProjection, allJournalItems),
    [allJournalItems, dashboardProjection, state],
  );
  const selectedDayEvents = useMemo(
    () => allJournalItems.filter((item) => item.day === selectedDay).slice(0, 4),
    [allJournalItems, selectedDay],
  );
  const activeCases = state.cases.filter((entry) => entry.status === 'active');
  const focusCases = activeCases.filter((entry) => entry.isFocused).slice(0, 2);
  const leadCase = focusCases[0]
    || [...activeCases].sort((left, right) => scoreCurrentDanger(right) - scoreCurrentDanger(left))[0]
    || null;
  const firstPriority = dashboardProjection.todayPriority[0] || null;
  const leadCaseId = firstPriority?.caseId || leadCase?.id || null;
  const leadCaseProjection = leadCaseId
    ? operatingProjection.cases.find((entry) => entry.caseId === leadCaseId) || null
    : null;
  const intelFeed = useMemo(() => deriveIntelFeed(state), [state]);
  const homepageIntel = useMemo(() => deriveHomepageIntel(state, intelFeed), [state, intelFeed]);
  const customerPressure = useMemo(() => deriveCustomerPressureSummary(state), [state]);
  const daysRemaining = Math.max(maxDay - day, 0);
  const activeCoreCount = activeCases.filter((entry) => entry.goalTier === 'core').length;
  const dangerCount = activeCases.filter((entry) => entry.storylineState === 'critical' || entry.storylineState === 'sliding').length;
  const todayFocus = leadCase?.title || '暂无商圈聚焦房';
  const topRisk = dashboardProjection.riskReminders[0] || null;
  const todayRisk = topRisk?.title
    || leadCase?.riskFlags?.[0]
    || (state.energy <= 1 ? '今日资源很紧，只能做关键动作' : '暂无显著风险');
  const visiblePriorities = dashboardProjection.todayPriority.slice(0, 4);
  const selectedCalendarEntry = calendarRail.find((entry) => entry.day === selectedDay) || null;
  const selectedDateLabel = formatDate(shiftDate(state.currentDate, selectedDay - day));
  const todayNews = [homepageIntel.lead, ...homepageIntel.briefs].filter((entry): entry is IntelItem => Boolean(entry)).slice(0, 3);

  const openCase = (caseId?: string) => {
    if (!caseId) {
      onSetView('cases');
      return;
    }
    onSelectCase(caseId);
    onSetView('cases');
  };

  const handleTool = (tool: AgendaTool, caseId?: string) => {
    if (tool.target === 'case') {
      openCase(caseId);
      return;
    }
    if (tool.target === 'customers') {
      if (caseId) onSelectCase(caseId);
      onSetView('customers');
      return;
    }
    if (tool.target === 'market') {
      onOpenMarket(tool.marketLayer || 'macro');
      return;
    }
    onSetView('review');
  };

  return (
    <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <section className="seller-panel overflow-hidden">
        <div className="flex flex-col gap-2.5 border-b border-[var(--seller-border)] px-3 py-3 lg:px-3.5">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
            <div className="seller-label flex items-center gap-2">
              <Calendar size={13} />
              日历
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold text-[var(--seller-muted)]">
              <span className="seller-chip">Day {day}/{maxDay}</span>
              <span className="seller-chip">剩 {daysRemaining} 天</span>
              <span className="seller-chip">{routine.label} · {routine.theme}</span>
            </div>
          </div>

          <div className="flex gap-1.5 overflow-x-auto pb-1">
            {calendarRail.map((entry) => (
              <div key={entry.day}>
                <CalendarRailCell
                  entry={entry}
                  active={selectedDay === entry.day}
                  onClick={() => setSelectedDay(entry.day)}
                />
              </div>
            ))}
          </div>
        </div>

        {selectedDay !== day && selectedCalendarEntry && (
          <SelectedDayPanel
            entry={selectedCalendarEntry}
            dateLabel={selectedDateLabel}
            events={selectedDayEvents}
            onBackToday={() => setSelectedDay(day)}
            onOpenCase={openCase}
          />
        )}
      </section>

      <div className="grid grid-cols-1 gap-3 2xl:grid-cols-[minmax(0,1.32fr)_332px]">
        <div className="space-y-3">
          <section className="seller-panel px-3.5 py-3">
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_232px]">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="seller-chip bg-[var(--seller-ink)] text-white">
                    今日
                  </span>
                  <span className="seller-chip seller-chip-accent">
                    {firstPriority?.label || '主事项'}
                  </span>
                </div>

                <h1 className="seller-title mt-2.5 max-w-4xl text-[18px] leading-[1.18] md:text-[20px]">
                  {operatingBrief.today.title}
                </h1>
                <p className="seller-body mt-1.5 max-w-[72ch] text-[12px] leading-5 line-clamp-2">
                  {operatingBrief.today.detail}
                </p>

                <div className="mt-3 grid grid-cols-2 gap-1.5 md:grid-cols-4">
                  <DeskMetric label="主盯房源" value={todayFocus} />
                  <DeskMetric label="先防什么" value={todayRisk} tone="risk" />
                  <DeskMetric label="今日精力" value={dashboardProjection.resourceSnapshot.energy} />
                  <DeskMetric label="活跃机会" value={`${dashboardProjection.resourceSnapshot.activeOpportunities} 条`} />
                </div>
              </div>

              <div className="border-t border-[var(--seller-border)] pt-3 xl:border-l xl:border-t-0 xl:pl-3 xl:pt-0">
                <div className="flex items-center justify-between gap-2">
                  <div className="seller-label">房源情况</div>
                  <button
                    type="button"
                    onClick={() => openCase(leadCaseId || undefined)}
                    className="seller-button-secondary rounded-full px-2.5 py-1 text-[10px]"
                  >
                    打开房源
                  </button>
                </div>
                <div className="mt-2 space-y-1.5">
                  {(leadCaseProjection?.factChain.slice(0, 3) || []).map((fact) => (
                    <div key={fact.id} className="seller-tablet px-2.5 py-2">
                      <div className="text-[12px] font-semibold text-[var(--seller-ink)]">{fact.title}</div>
                      <p className="seller-body mt-0.5 text-[11px] leading-5">{fact.fact}</p>
                    </div>
                  ))}
                  {!leadCaseProjection && (
                    <p className="seller-empty px-2.5 py-2.5 text-[11px] leading-5">
                      这套房眼下还没有新的关键信息。
                    </p>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="seller-panel px-3.5 py-3">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <div className="seller-label flex items-center gap-2">
                <Clock3 size={13} />
                今日安排
              </div>
              <div className="text-[11px] text-[var(--seller-subtle)]">
                {visiblePriorities.length} 项
              </div>
            </div>

            <div className="divide-y divide-[color:var(--seller-border)]">
              {visiblePriorities.length > 0 ? visiblePriorities.map((item, index) => (
                <div key={item.id}>
                  <AgendaRow
                    item={item}
                    index={index}
                    onOpenCase={openCase}
                    onUseTool={handleTool}
                  />
                </div>
              )) : (
                <div className="seller-empty px-4 py-6 text-center text-[12px]">
                  今天还没有明确安排，先回房源页看在场房。
                </div>
              )}
            </div>
          </section>
        </div>

        <aside className="space-y-3">
          <section className="seller-panel-muted px-3.5 py-3">
            <div className="mb-2.5 flex items-center justify-between gap-3">
              <div className="seller-label flex items-center gap-2">
                <Newspaper size={13} />
                市场变化
              </div>
              <button
                type="button"
                onClick={() => onOpenMarket(homepageIntel.lead?.layer || 'macro')}
                className="seller-button-secondary rounded-full px-2.5 py-1 text-[11px]"
              >
                去市场
              </button>
            </div>

            <div className="space-y-2">
              {todayNews.length > 0 ? todayNews.map((item) => (
                <div key={item.id}>
                  <NewsBrief
                    item={item}
                    onOpen={() => onOpenMarket(item.layer)}
                  />
                </div>
              )) : (
                <div className="seller-empty px-3 py-5 text-[12px] leading-5">
                  今天没有新的市场变化。
                </div>
              )}
            </div>
          </section>

          <section className="seller-panel px-3.5 py-3">
            <div className="seller-label mb-2.5 flex items-center gap-2">
              <ShieldAlert size={13} />
              在手情况
            </div>
            <div className="grid grid-cols-1 gap-2">
              <EvidenceTile icon={<Target size={15} />} label="商圈聚焦房" value={`${activeCoreCount} 套`} detail={todayFocus} />
              <EvidenceTile
                icon={<ShieldAlert size={15} />}
                label="走弱房源"
                value={`${dangerCount} 套`}
                detail={dangerCount > 0 ? todayRisk : '暂时没有明显掉队的房源'}
                tone={dangerCount > 0 ? 'risk' : 'neutral'}
              />
              <EvidenceTile
                icon={<Users size={15} />}
                label="快流失客户"
                value={`${customerPressure.atRisk} 位`}
                detail={customerPressure.atRiskCaseTitle || '短期流失压力不重'}
                tone={customerPressure.atRisk > 0 ? 'risk' : 'neutral'}
                onClick={customerPressure.atRiskCaseId ? () => openCase(customerPressure.atRiskCaseId) : undefined}
              />
              <EvidenceTile
                icon={<Sparkles size={15} />}
                label="当前最强房"
                value={customerPressure.strongestCaseTitle || '暂无'}
                detail="客户和反馈暂时都在前面。"
                tone="chance"
                onClick={customerPressure.strongestCaseId ? () => openCase(customerPressure.strongestCaseId) : undefined}
              />
            </div>

            <div className="seller-panel-soft mt-2.5 p-2.5">
              <div className="seller-label">受影响房源</div>
              <div className="mt-2 space-y-1.5">
                {homepageIntel.impactedCases.length > 0 ? homepageIntel.impactedCases.map((item) => (
                  <button
                    key={item.caseId}
                    type="button"
                    onClick={() => openCase(item.caseId)}
                    className="seller-tablet w-full px-2.5 py-2.5 text-left transition hover:bg-white"
                  >
                    <div className="text-[12px] font-semibold text-[var(--seller-ink)]">{item.title}</div>
                    <p className="seller-body mt-0.5 text-[11px] leading-5">{item.reason}</p>
                  </button>
                )) : (
                  <p className="seller-empty px-2.5 py-4 text-[11px] leading-5">
                    今天还没有房源被外部变化直接命中。
                  </p>
                )}
              </div>
            </div>
          </section>

          <section className="seller-panel-muted px-3.5 py-3">
            <div className="seller-label mb-2 flex items-center gap-2">
              <Flag size={13} />
              昨日记录
            </div>
            <div className="space-y-1.5">
              {dashboardProjection.yesterdayIntel.length > 0 ? dashboardProjection.yesterdayIntel.slice(0, 3).map((event) => (
                <button
                  key={event.id}
                  type="button"
                  onClick={() => openCase(event.caseId)}
                  className="seller-tablet w-full px-2.5 py-2.5 text-left transition hover:bg-white"
                >
                  <div className="text-[11px] font-semibold text-[var(--seller-ink)]">{event.title}</div>
                  <p className="seller-body mt-0.5 line-clamp-2 text-[11px] leading-5">{event.detail}</p>
                </button>
              )) : (
                <div className="seller-empty px-3 py-4 text-[11px] leading-5">
                  昨天没有留下关键记录。
                </div>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function CalendarRailCell({
  entry,
  active,
  onClick,
}: {
  entry: CalendarRailEntry;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-w-[104px] rounded-[12px] border px-2.5 py-2 text-left transition ${
        active
          ? 'border-[var(--seller-ink)] bg-[var(--seller-ink)] text-white shadow-[0_10px_20px_rgba(25,34,48,0.16)]'
          : entry.relation === 'future'
            ? 'border-[var(--seller-border)] bg-white/70 text-[var(--seller-muted)] hover:bg-white'
            : 'border-[var(--seller-border)] bg-[var(--seller-accent-soft)] text-[var(--seller-muted)] hover:bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-70">Day {entry.day}</div>
        <span className={`h-1.5 w-1.5 rounded-full ${active ? 'bg-white' : calendarToneDot(entry.tone)}`} />
      </div>
      <div className="mt-0.5 text-[12px] font-semibold tracking-[-0.02em]">{entry.label}</div>
      <div className={`mt-0.5 line-clamp-1 text-[10px] font-medium ${active ? 'text-white/72' : 'text-[var(--seller-subtle)]'}`}>
        {entry.title}
      </div>
      <div className={`mt-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${active ? 'bg-white/10 text-white' : 'bg-white text-[var(--seller-muted)]'}`}>
        {entry.meta}
      </div>
    </button>
  );
}

function SelectedDayPanel({
  entry,
  dateLabel,
  events,
  onBackToday,
  onOpenCase,
}: {
  entry: CalendarRailEntry;
  dateLabel: string;
  events: JournalItem[];
  onBackToday: () => void;
  onOpenCase: (caseId?: string) => void;
}) {
  if (entry.relation === 'future') {
    const prepTools = buildFuturePrepTools(entry);
    return (
      <div className="border-t border-[var(--seller-border)] bg-white px-3.5 py-3">
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-[1fr_248px]">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--seller-accent)]">未来</div>
            <h3 className="mt-1 text-[14px] font-semibold tracking-[-0.03em] text-[var(--seller-ink)]">
              Day {entry.day} · {entry.title}
            </h3>
            <p className="mt-1 text-[11px] leading-5 text-[var(--seller-muted)]">
              {dateLabel}。{entry.detail}
            </p>
          </div>
          <div className="rounded-[12px] border border-[var(--seller-border)] bg-[var(--seller-accent-soft)] p-2.5">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-accent)]">提前准备</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {prepTools.map((tool) => (
                <span key={tool} className="rounded-full border border-[var(--seller-border)] bg-white px-2.5 py-1 text-[11px] font-semibold text-[var(--seller-muted)]">
                  {tool}
                </span>
              ))}
            </div>
            <button
              type="button"
              onClick={onBackToday}
              className="mt-2.5 w-full rounded-[11px] bg-[var(--seller-ink)] px-3 py-2 text-[11px] font-bold text-white"
            >
              回到今天
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="border-t border-[var(--seller-border)] bg-white px-3.5 py-3">
      <div className="flex flex-col gap-2.5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--seller-accent)]">过去</div>
          <h3 className="mt-1 text-[14px] font-semibold tracking-[-0.03em] text-[var(--seller-ink)]">
            Day {entry.day} · {dateLabel}
          </h3>
          <p className="mt-1 text-[11px] leading-5 text-[var(--seller-muted)]">
            这天留下的记录。
          </p>
        </div>
        <button
          type="button"
          onClick={onBackToday}
          className="rounded-[11px] bg-[var(--seller-ink)] px-3 py-2 text-[11px] font-bold text-white"
        >
          回到今天
        </button>
      </div>
      <div className="mt-2.5 grid grid-cols-1 gap-1.5 lg:grid-cols-2">
        {events.length > 0 ? events.map((event) => (
          <button
            key={event.id}
            type="button"
            onClick={() => onOpenCase(event.caseId)}
            className="rounded-[12px] border border-[var(--seller-border)] bg-white px-2.5 py-2 text-left transition hover:bg-[var(--seller-accent-soft)]"
          >
            <div className="flex items-center gap-2">
              <span className={`h-1.5 w-1.5 rounded-full ${journalToneDot(event.tone)}`} />
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">{event.actor}</span>
            </div>
            <div className="mt-1 text-[12px] font-semibold text-[var(--seller-ink)]">{event.title}</div>
            <p className="mt-0.5 line-clamp-2 text-[11px] leading-5 text-[var(--seller-muted)]">{event.detail}</p>
          </button>
        )) : (
          <div className="rounded-[12px] border border-dashed border-[var(--seller-border)] bg-white px-3 py-4 text-[11px] text-[var(--seller-subtle)]">
            这天没有留下关键记录。
          </div>
        )}
      </div>
    </div>
  );
}

function DeskMetric({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'risk' | 'chance';
}) {
  return (
    <div className={`rounded-[12px] border px-2.5 py-2 ${
      tone === 'risk'
        ? 'border-[color:var(--seller-risk)]/20 bg-[var(--seller-risk-soft)]'
        : tone === 'chance'
          ? 'border-[color:var(--seller-chance)]/22 bg-[var(--seller-chance-soft)]'
          : 'border-[var(--seller-border)] bg-white'
    }`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">{label}</div>
      <div className="mt-0.5 line-clamp-2 text-[11px] font-semibold leading-5 text-[var(--seller-ink)]">{value}</div>
    </div>
  );
}

function AgendaRow({
  item,
  index,
  onOpenCase,
  onUseTool,
}: {
  item: ProjectionBrief;
  index: number;
  onOpenCase: (caseId?: string) => void;
  onUseTool: (tool: AgendaTool, caseId?: string) => void;
}) {
  const tools = buildAgendaTools(item);
  return (
    <article className="grid grid-cols-1 gap-2.5 px-0 py-2.5 md:grid-cols-[74px_minmax(0,1fr)]">
      <div className="pt-0.5">
        <div className="inline-flex rounded-full bg-[var(--seller-accent-soft)] px-2 py-0.5 text-[10px] font-semibold text-[var(--seller-accent)]">
          {agendaSlot(index)}
        </div>
        <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">
          {index === 0 ? '优先处理' : `第 ${index + 1} 件`}
        </div>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${projectionToneBadge(item.tone)}`}>
            {item.label}
          </span>
          {item.caseId && (
            <button
              type="button"
              onClick={() => onOpenCase(item.caseId)}
              className="rounded-full border border-[var(--seller-border)] bg-white px-2 py-0.5 text-[10px] font-bold text-[var(--seller-muted)] transition hover:bg-[var(--seller-accent-soft)]"
            >
              打开房源
            </button>
          )}
        </div>
        <h4 className="mt-1 text-[13px] font-semibold tracking-[-0.02em] text-[var(--seller-ink)]">{item.title}</h4>
        <p className="mt-0.5 max-w-[80ch] text-[11px] leading-5 text-[var(--seller-muted)]">{item.detail}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tools.map((tool) => (
            <button
              key={tool.label}
              type="button"
              onClick={() => onUseTool(tool, item.caseId)}
              className="rounded-full border border-[var(--seller-border)] bg-white px-2.5 py-1 text-[10px] font-semibold text-[var(--seller-muted)] transition hover:bg-[var(--seller-ink)] hover:text-white"
            >
              {tool.label}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}

function NewsBrief({ item, onOpen }: { item: IntelItem; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full rounded-[12px] border border-[var(--seller-border)] bg-white px-2.5 py-2.5 text-left transition hover:bg-[var(--seller-accent-soft)]"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${intelToneBadge(item.tone)}`}>
          {toneLabel(item.tone)}
        </span>
        <span className="rounded-full bg-[var(--seller-accent-soft)] px-2 py-0.5 text-[10px] font-bold text-[var(--seller-accent)]">
          {layerLabel(item.layer)}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">{item.badge}</span>
      </div>
      <div className="mt-1 text-[12px] font-semibold leading-5 text-[var(--seller-ink)]">{item.title}</div>
      <p className="mt-0.5 text-[11px] leading-5 text-[var(--seller-muted)]">{item.summary}</p>
    </button>
  );
}

function EvidenceTile({
  icon,
  label,
  value,
  detail,
  tone = 'neutral',
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: 'neutral' | 'risk' | 'chance';
  onClick?: () => void;
}) {
  const className = `rounded-[12px] border px-2.5 py-2 text-left ${
    tone === 'risk'
      ? 'border-[color:var(--seller-risk)]/20 bg-[var(--seller-risk-soft)]'
      : tone === 'chance'
        ? 'border-[color:var(--seller-chance)]/22 bg-[var(--seller-chance-soft)]'
        : 'border-[var(--seller-border)] bg-white'
  } ${onClick ? 'transition hover:bg-[var(--seller-accent-soft)]' : ''}`;

  const content = (
    <>
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-[12px] font-semibold text-[var(--seller-ink)]">{value}</div>
      <p className="mt-0.5 line-clamp-2 text-[11px] leading-5 text-[var(--seller-muted)]">{detail}</p>
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={className}>
        {content}
      </button>
    );
  }

  return <div className={className}>{content}</div>;
}

function buildOperatingBrief(dashboard: DashboardProjection) {
  const firstPriority = dashboard.todayPriority[0] || null;
  const yesterday = dashboard.yesterdayIntel[0] || null;
  const resourceTone: OperatingBriefTone = dashboard.resourceSnapshot.energy.startsWith('0/')
    || dashboard.resourceSnapshot.energy.startsWith('1/')
    ? 'risk'
    : dashboard.resourceSnapshot.activeOpportunities >= dashboard.resourceSnapshot.activeCases
      ? 'chance'
      : 'neutral';

  return {
    today: {
      title: firstPriority?.title || dashboard.todayHeadline,
      detail: firstPriority?.detail || '先按今天的优先级处理，不要把资源摊到所有房源上。',
      tone: (firstPriority?.tone || 'neutral') as OperatingBriefTone,
      caseId: firstPriority?.caseId,
    },
    yesterday: {
      title: yesterday?.title || '昨天没有明显转折',
      detail: yesterday?.detail || '没有新增关键记录，今天按当前情况推进。',
      tone: (yesterday?.tone || 'neutral') as OperatingBriefTone,
      caseId: yesterday?.caseId,
    },
    resources: {
      title: `${dashboard.resourceSnapshot.energy} 精力 · ${dashboard.resourceSnapshot.promotionBudget} 推广金`,
      detail: `在场 ${dashboard.resourceSnapshot.activeCases} 套，活跃机会 ${dashboard.resourceSnapshot.activeOpportunities} 条。`,
      tone: resourceTone,
    },
  };
}

function buildCalendarRail(
  state: GameState,
  dashboard: DashboardProjection,
  journalItems: JournalItem[],
): CalendarRailEntry[] {
  const entries: CalendarRailEntry[] = [];
  const startPastDay = Math.max(1, state.day - 3);

  for (let currentDay = startPastDay; currentDay < state.day; currentDay += 1) {
    const events = journalItems.filter((item) => item.day === currentDay);
    entries.push({
      day: currentDay,
      relation: 'past',
      label: currentDay === state.day - 1 ? '昨天' : `Day ${currentDay}`,
      title: events[0]?.title || '没有关键记录',
      detail: events[0]?.detail || '这天没有留下会影响今天判断的变化。',
      meta: events.length > 0 ? `${events.length} 流水` : '无新增',
      tone: deriveEventsProjectionTone(events),
    });
  }

  dashboard.weekCalendar
    .filter((entry) => entry.day >= state.day && entry.day <= state.maxDay)
    .slice(0, 7)
    .forEach((entry) => {
      const isToday = entry.day === state.day;
      entries.push({
        day: entry.day,
        relation: isToday ? 'today' : 'future',
        label: isToday ? '今天' : entry.day === state.day + 1 ? '明天' : entry.label,
        title: isToday ? '今日安排' : entry.title,
        detail: entry.detail,
        meta: isToday
          ? `${dashboard.todayPriority.length} 安排 · ${dashboard.marketBrief.todayCount} 新闻`
          : `${entry.energy} 精力 · ${futureSignal(entry)}`,
        tone: isToday
          ? (dashboard.riskReminders.length > 0 ? 'risk' : dashboard.marketBrief.chanceCount > 0 ? 'chance' : 'neutral')
          : entry.tone,
        energy: entry.energy,
      });
    });

  return entries;
}

function buildJournalItems(state: GameState): JournalItem[] {
  const eventStoreItems = state.eventStore.map((entry) => ({
    id: `event-${entry.id}`,
    day: entry.day,
    title: entry.title,
    detail: entry.detail,
    actor: entry.actor,
    tone: entry.tone,
    caseId: entry.caseId,
    date: entry.date,
  }));

  const fallbackItems = state.eventLog
    .filter((entry) => !state.eventStore.some((event) => event.day === entry.day && event.actor === entry.actor && event.detail === entry.message))
    .map((entry, index) => ({
      id: `log-${entry.day}-${index}`,
      day: entry.day,
      title: trimJournalTitle(entry.message),
      detail: entry.message,
      actor: entry.actor,
      tone: entry.tone,
      date: entry.date,
    }));

  return [...eventStoreItems, ...fallbackItems].sort((left, right) => {
    if (right.day !== left.day) return right.day - left.day;
    return (right.date || '').localeCompare(left.date || '');
  });
}

function deriveEventsProjectionTone(events: JournalItem[]): ProjectionTone {
  if (events.some((event) => event.tone === 'danger')) return 'risk';
  if (events.some((event) => event.tone === 'success')) return 'chance';
  return 'neutral';
}

function futureSignal(entry: CalendarDayProjection) {
  if (entry.title.includes('业主')) return '业主日';
  if (entry.title.includes('获客')) return '获客日';
  if (entry.title.includes('带看')) return '带看';
  if (entry.energy <= 1) return '轻排';
  return '普通日';
}

function buildFuturePrepTools(entry: CalendarRailEntry) {
  if (entry.title.includes('业主') || entry.detail.includes('业主')) {
    return ['筛反馈房源', '看客户记录', '看竞品对比'];
  }
  if (entry.title.includes('获客') || entry.detail.includes('客户')) {
    return ['筛缺客户房源', '看推广金', '看商圈热度'];
  }
  if (entry.title.includes('带看') || entry.detail.includes('周末')) {
    return ['排带看顺序', '看快成交客户', '检查房源卖点'];
  }
  return ['看在场房源', '检查精力', '回到今日安排'];
}

function buildAgendaTools(item: ProjectionBrief): AgendaTool[] {
  const text = `${item.label} ${item.title} ${item.detail}`;
  if (/业主|反馈|信任|耐心/.test(text)) {
    return [
      { label: '写反馈要点', target: 'case' },
      { label: '看客户情况', target: 'customers' },
      { label: '查竞品对比', target: 'market', marketLayer: 'competition' },
    ];
  }
  if (/竞品|竞争|截|窗口/.test(text)) {
    return [
      { label: '拉竞品对比', target: 'market', marketLayer: 'competition' },
      { label: '改卖点口径', target: 'case' },
      { label: '看受影响房源', target: 'market', marketLayer: 'listing' },
    ];
  }
  if (/成交|报价|谈判|斡旋/.test(text)) {
    return [
      { label: '整理谈判口径', target: 'case' },
      { label: '看快成交客户', target: 'customers' },
      { label: '看调价依据', target: 'case' },
    ];
  }
  if (/客户|准客|流失|带看/.test(text)) {
    return [
      { label: '整理回访话术', target: 'customers' },
      { label: '打开客户线', target: 'customers' },
      { label: '安排带看', target: 'case' },
    ];
  }
  if (/市场|商圈|情报/.test(text)) {
    return [
      { label: '看商圈新闻', target: 'market', marketLayer: 'district' },
      { label: '看受影响房源', target: 'market', marketLayer: 'listing' },
      { label: '回到房源处理', target: 'case' },
    ];
  }
  return [
    { label: '打开房源', target: 'case' },
    { label: '看客户线', target: 'customers' },
    { label: '回看今天记录', target: 'review' },
  ];
}

function agendaSlot(index: number) {
  if (index === 0) return '上午';
  if (index === 1) return '午后';
  if (index === 2) return '傍晚';
  return '机动';
}

function projectionToneBadge(tone: ProjectionTone) {
  if (tone === 'risk') return 'bg-[var(--seller-risk-soft)] text-[color:var(--seller-risk)]';
  if (tone === 'chance') return 'bg-[var(--seller-chance-soft)] text-[color:var(--seller-chance)]';
  return 'bg-[var(--seller-accent-soft)] text-[color:var(--seller-accent)]';
}

function intelToneBadge(tone: IntelItem['tone']) {
  if (tone === 'risk') return 'bg-[var(--seller-risk-soft)] text-[color:var(--seller-risk)]';
  if (tone === 'chance') return 'bg-[var(--seller-chance-soft)] text-[color:var(--seller-chance)]';
  return 'bg-[var(--seller-accent-soft)] text-[color:var(--seller-accent)]';
}

function calendarToneDot(tone: ProjectionTone) {
  if (tone === 'risk') return 'bg-[color:var(--seller-risk)]';
  if (tone === 'chance') return 'bg-[color:var(--seller-chance)]';
  return 'bg-[color:var(--seller-accent)]';
}

function journalToneDot(tone: JournalItem['tone']) {
  if (tone === 'danger') return 'bg-[color:var(--seller-risk)]';
  if (tone === 'success') return 'bg-[color:var(--seller-chance)]';
  return 'bg-[color:var(--seller-accent)]';
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

function deriveHomepageIntel(state: GameState, intelFeed: IntelItem[]) {
  return {
    lead: intelFeed[0] || null,
    briefs: intelFeed.slice(1, 3),
    impactedCases: deriveImpactedCases(state, intelFeed).slice(0, 3),
  };
}

function shiftDate(currentDate: string, offset: number) {
  const date = new Date(currentDate);
  date.setDate(date.getDate() + offset);
  return date.toISOString().split('T')[0];
}

function trimJournalTitle(message: string) {
  const normalized = message.trim();
  if (normalized.length <= 24) return normalized;
  return `${normalized.slice(0, 24)}...`;
}
