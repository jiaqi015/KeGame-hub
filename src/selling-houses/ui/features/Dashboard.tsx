import React, { useEffect, useMemo, useState } from 'react';
import type { GameState, TodayArrangementSlot } from '../../domain/models';
import { formatDate, getRoutine } from '../../domain/utils';
import { WEEKLY_ROUTINE } from '../../domain/constants';
import {
  type ArrangementItemProjection,
  type ArrangementProjection,
  buildOperatingProjection,
  type CalendarDayProjection,
  type DashboardProjection,
  type ProjectionBrief,
  type ProjectionTone,
} from '../../application/projections/operatingProjection.js';
import { type IntelLayerTab } from './marketIntel';
import {
  ArrowRight,
  Calendar,
  Clock3,
  Target,
} from 'lucide-react';

interface DashboardProps {
  state: GameState;
  onSelectCase: (id: string) => void;
  onExecuteAction: (actionId: string, caseId: string) => boolean;
  onAddToToday: (item: ArrangementItemProjection, slot: TodayArrangementSlot) => boolean;
  onRemoveFromToday: (itemId: string) => boolean;
  onExecuteTodayItem: (itemId: string) => boolean;
  onSetView: (view: string) => void;
  onOpenMarket: (layer?: IntelLayerTab) => void;
}

type CalendarRelation = 'past' | 'today' | 'future';
type DashboardCalendarMode = CalendarRelation;

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
};

type AgendaTool = {
  label: string;
  target: 'case' | 'customers' | 'market';
  marketLayer?: IntelLayerTab;
};

type DashboardSidePanel = 'case' | 'scope';

export function Dashboard({
  state,
  onSelectCase,
  onExecuteAction,
  onAddToToday,
  onRemoveFromToday,
  onExecuteTodayItem,
  onSetView,
  onOpenMarket,
}: DashboardProps) {
  const operatingProjection = useMemo(() => buildOperatingProjection(state), [state]);
  const dashboard = operatingProjection.dashboard;
  const journalItems = useMemo(() => buildJournalItems(state), [state]);
  const calendarRail = useMemo(
    () => buildCalendarRail(state, dashboard, journalItems),
    [dashboard, journalItems, state],
  );
  const [selectedDay, setSelectedDay] = useState(state.day);
  const [showTimelineDetail, setShowTimelineDetail] = useState(false);
  const [activeSidePanel, setActiveSidePanel] = useState<DashboardSidePanel>('case');

  useEffect(() => {
    setSelectedDay(state.day);
  }, [state.day]);

  const routine = getRoutine(state.day, WEEKLY_ROUTINE);
  const activeCases = state.cases.filter((caseItem) => caseItem.status === 'active');
  const visiblePriorities = dashboard.todayPriority.slice(0, 4);
  const daysRemaining = Math.max(state.maxDay - state.day, 0);

  const leadCaseId = visiblePriorities[0]?.caseId
    || activeCases.find((caseItem) => caseItem.isFocused)?.id
    || [...activeCases].sort((left, right) => scoreCaseWeight(right) - scoreCaseWeight(left))[0]?.id
    || null;
  const leadCase = leadCaseId
    ? state.cases.find((caseItem) => caseItem.id === leadCaseId) || null
    : null;
  const leadCaseProjection = leadCaseId
    ? operatingProjection.cases.find((entry) => entry.caseId === leadCaseId) || null
    : null;
  const leadCaseImpact = leadCase && dashboard.marketBrief.impactedCases.length > 0
    ? dashboard.marketBrief.impactedCases.find((item) => item.caseId === leadCase.id) || null
    : null;

  const selectedCalendarEntry = calendarRail.find((entry) => entry.day === selectedDay) || null;
  const selectedDayEvents = journalItems.filter((entry) => entry.day === selectedDay).slice(0, 4);
  const selectedDateLabel = formatDate(shiftDate(state.currentDate, selectedDay - state.day));
  const calendarMode: DashboardCalendarMode = selectedDay === state.day
    ? 'today'
    : selectedDay < state.day
      ? 'past'
      : 'future';

  const openCase = (caseId?: string) => {
    if (!caseId) {
      onSetView('cases');
      return;
    }
    onSelectCase(caseId);
    onSetView('cases');
  };

  const handleAgendaTool = (tool: AgendaTool, caseId?: string) => {
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
  };

  return (
    <div className="space-y-4" data-selling-houses-page="overview">
      <section className="seller-workbench-dark overflow-hidden px-5 py-4">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div className="min-w-0">
            <div className="seller-label">总览</div>
            <h1
              className="mt-2 text-[28px] font-semibold leading-[1.04] tracking-[-0.04em] text-[var(--seller-ink)] md:text-[30px]"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              {calendarMode === 'today' ? '今天先去哪' : calendarMode === 'past' ? '回看那天' : '后面几天先怎么排'}
            </h1>
            <p className="mt-2 max-w-[72ch] text-[12px] leading-6 text-[var(--seller-muted)]">
              {calendarMode === 'today'
                ? `当前在场 ${dashboard.resourceSnapshot.activeCases} 套房，活跃客户线 ${dashboard.resourceSnapshot.activeOpportunities} 条。${leadCase
                  ? ` ${leadCase.title} 排在前面，先处理这条线。`
                  : ' 先处理最影响今天顺序的一件事。'}`
                : calendarMode === 'past'
                  ? `${selectedDateLabel} 更适合回看那天留下的动作、记录和影响。`
                  : `${selectedDateLabel} 先看安排和准备，不展开今天的处理区。`}
            </p>
          </div>

          <div className="flex flex-wrap gap-2 text-[11px] text-[var(--seller-muted)] xl:justify-end">
            <span className="seller-chip seller-chip-accent">DAY {state.day}</span>
            <span className="seller-chip">{routine.label} · {routine.theme}</span>
            <span className="seller-chip">剩 {daysRemaining} 天</span>
          </div>
        </div>
      </section>

      {calendarMode === 'today' && (
        <section className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {dashboard.triageCards.map((card) => (
            <React.Fragment key={card.id}>
              <TriageRouteCard
                card={card}
                onOpen={(targetView, caseId, marketLayer) => {
                  if (caseId) {
                    onSelectCase(caseId);
                  }
                  if (targetView === 'market') {
                    onOpenMarket(marketLayer || 'macro');
                    return;
                  }
                  onSetView(targetView);
                }}
              />
            </React.Fragment>
          ))}
        </section>
      )}

      <section className="seller-panel overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[var(--seller-border)] px-4 py-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="seller-label flex items-center gap-2">
              <Calendar size={13} />
              本周节奏
            </div>
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {calendarRail.map((entry) => (
                <div key={entry.day}>
                  <CalendarCell
                    entry={entry}
                    active={entry.day === selectedDay}
                    onClick={() => {
                      if (entry.day !== state.day) {
                        setShowTimelineDetail(false);
                      }
                      setSelectedDay(entry.day);
                    }}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="text-[11px] font-medium text-[var(--seller-subtle)]">
              DAY {state.day.toString().padStart(2, '0')} / {state.maxDay}　剩 {daysRemaining} 天　{routine.label} · {routine.theme}
            </div>
            <button
              type="button"
              onClick={() => {
                if (calendarMode !== 'today') {
                  setSelectedDay(state.day);
                  return;
                }
                setShowTimelineDetail((current) => !current);
              }}
              className="seller-button-secondary rounded-full px-3 py-1 text-[10px]"
            >
              {calendarMode === 'today' ? (showTimelineDetail ? '收起明细' : '看明细') : '回到今天'}
            </button>
          </div>
        </div>
      </section>

      {calendarMode === 'today' ? (
        <>
          {showTimelineDetail && selectedCalendarEntry && (
            <SelectedDayPanel
              entry={selectedCalendarEntry}
              dateLabel={selectedDateLabel}
              events={selectedDayEvents}
              onBackToday={() => setShowTimelineDetail(false)}
              onOpenCase={openCase}
            />
          )}

          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.58fr)_minmax(320px,0.92fr)]">
            <AgendaPanel
              arrangement={dashboard.arrangement}
              day={state.day}
              energyLabel={dashboard.resourceSnapshot.energy}
              budgetLabel={dashboard.resourceSnapshot.promotionBudget}
              onOpenCase={openCase}
              onExecuteAction={onExecuteAction}
              onAddToToday={onAddToToday}
              onRemoveFromToday={onRemoveFromToday}
              onExecuteTodayItem={onExecuteTodayItem}
              onUseTool={handleAgendaTool}
            />

            <div className="space-y-3">
              <section className="seller-panel overflow-hidden">
                <div className="flex items-center justify-between gap-3 border-b border-[var(--seller-border)] px-4 py-3">
                  <div className="seller-label">更多</div>
                  <div className="seller-tabbar">
                    <button
                      type="button"
                      onClick={() => setActiveSidePanel('case')}
                      className={`seller-tab ${activeSidePanel === 'case' ? 'seller-tab-active' : ''}`}
                    >
                      主房源
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveSidePanel('scope')}
                      className={`seller-tab ${activeSidePanel === 'scope' ? 'seller-tab-active' : ''}`}
                    >
                      快速导航
                    </button>
                  </div>
                </div>
              </section>

              {activeSidePanel === 'case' ? (
                <PinnedCasePanel
                  caseItem={leadCase}
                  projection={leadCaseProjection}
                  impactedItem={leadCaseImpact ? {
                    caseId: leadCaseImpact.caseId || '',
                    title: leadCaseImpact.title,
                    count: 1,
                    reason: leadCaseImpact.detail,
                    tone: leadCaseImpact.tone,
                    layer: 'listing',
                  } : null}
                  onOpenCase={() => openCase(leadCase?.id)}
                  onOpenMarket={onOpenMarket}
                />
              ) : (
                <TriageSummaryPanel
                  cards={dashboard.triageCards}
                  onOpen={(targetView, caseId, marketLayer) => {
                    if (caseId) {
                      onSelectCase(caseId);
                    }
                    if (targetView === 'market') {
                      onOpenMarket(marketLayer || 'macro');
                      return;
                    }
                    onSetView(targetView);
                  }}
                />
              )}
            </div>
          </div>
        </>
      ) : selectedCalendarEntry ? (
        <SelectedDayPanel
          entry={selectedCalendarEntry}
          dateLabel={selectedDateLabel}
          events={selectedDayEvents}
          onBackToday={() => setSelectedDay(state.day)}
          onOpenCase={openCase}
        />
      ) : null}
    </div>
  );
}

function TriageRouteCard({
  card,
  onOpen,
}: {
  card: DashboardProjection['triageCards'][number];
  onOpen: (targetView: string, caseId?: string, marketLayer?: IntelLayerTab) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(card.targetView, card.caseId, card.marketLayer)}
      className={`seller-panel overflow-hidden px-4 py-4 text-left transition hover:border-[var(--seller-border-strong)] ${card.tone === 'risk'
        ? 'seller-tone-risk'
        : card.tone === 'chance'
          ? 'seller-tone-chance'
          : ''}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="seller-chip">{card.label}</span>
        <span className="text-[10px] font-semibold text-[var(--seller-subtle)]">{card.countLabel}</span>
      </div>
      <div className="mt-3 text-[15px] font-semibold tracking-[-0.03em] text-[var(--seller-ink)]">
        {card.title}
      </div>
      <p className="mt-2 text-[12px] leading-6 text-[var(--seller-muted)]">
        {card.detail}
      </p>
      <div className="mt-4 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--seller-ink)]">
        {card.label}
        <ArrowRight size={12} />
      </div>
    </button>
  );
}

function AgendaPanel({
  arrangement,
  day,
  energyLabel,
  budgetLabel,
  onOpenCase,
  onExecuteAction,
  onAddToToday,
  onRemoveFromToday,
  onExecuteTodayItem,
  onUseTool,
}: {
  arrangement: ArrangementProjection;
  day: number;
  energyLabel: string;
  budgetLabel: string;
  onOpenCase: (caseId?: string) => void;
  onExecuteAction: (actionId: string, caseId: string) => boolean;
  onAddToToday: (item: ArrangementItemProjection, slot: TodayArrangementSlot) => boolean;
  onRemoveFromToday: (itemId: string) => boolean;
  onExecuteTodayItem: (itemId: string) => boolean;
  onUseTool: (tool: AgendaTool, caseId?: string) => void;
}) {
  const slots: TodayArrangementSlot[] = ['am', 'pm'];
  return (
    <section className="seller-panel overflow-hidden">
      <div className="border-b border-[var(--seller-border)] px-4 py-4">
        <div className="min-w-0">
          <div className="seller-label flex items-center gap-2">
            <Clock3 size={13} />
            今日安排
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <h2 className="text-[17px] font-semibold tracking-[-0.03em] text-[var(--seller-ink)]">
              {arrangement.headline}
            </h2>
            <span className="seller-chip">DAY {day}</span>
            <span className="seller-chip seller-chip-accent">{energyLabel} 精力</span>
            <span className="seller-chip">{budgetLabel} 推广金</span>
            <span className="seller-chip">{arrangement.remainingEnergyLabel}</span>
          </div>
          <p className="mt-2 max-w-[78ch] text-[12px] leading-6 text-[var(--seller-muted)]">
            {arrangement.summary}
          </p>
        </div>

        {arrangement.fixedItems[0] && (
          <div className="mt-4 rounded-[12px] border border-[color:var(--seller-accent)]/26 bg-[var(--seller-accent-soft)] px-3.5 py-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="seller-chip seller-chip-accent">本周节奏</span>
              <span className="text-[12px] font-semibold text-[var(--seller-ink)]">{arrangement.weekFocusLabel}</span>
            </div>
          </div>
        )}
      </div>

      <div className="border-b border-[var(--seller-border)] px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="seller-label">上午 / 下午</div>
          <span className="text-[10px] font-semibold text-[var(--seller-subtle)]">
            固定 {arrangement.fixedItems.length} · 已排 {arrangement.plannedItems.length} · 完成 {arrangement.completedItems.length}
          </span>
        </div>
        <div className="mt-3 space-y-3">
          {slots.map((slot) => (
            <React.Fragment key={slot}>
              <HalfDayAgendaSection
                slot={slot}
                arrangement={arrangement.slots[slot]}
                onOpenCase={onOpenCase}
                onExecuteAction={onExecuteAction}
                onAddToToday={onAddToToday}
                onRemoveFromToday={onRemoveFromToday}
                onExecuteTodayItem={onExecuteTodayItem}
                onUseTool={onUseTool}
              />
            </React.Fragment>
          ))}
        </div>
      </div>
    </section>
  );
}

function FixedArrangementCard({
  item,
  onOpenCase,
  onExecuteAction,
}: {
  item: ArrangementItemProjection;
  onOpenCase: (caseId?: string) => void;
  onExecuteAction: (actionId: string, caseId: string) => boolean;
}) {
  return (
    <div className={`rounded-[12px] border px-3.5 py-3 ${item.tone === 'risk' ? 'border-[color:var(--seller-risk)]/24 bg-[var(--seller-risk-soft)]' : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)]'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="seller-chip">{item.label}</span>
        <span className="seller-chip">{item.slot === 'pm' ? '下午' : '上午'}</span>
        <span className="text-[10px] font-semibold text-[var(--seller-subtle)]">{item.statusLabel}</span>
        <span className="text-[10px] font-semibold text-[var(--seller-subtle)]">需 {item.energyCost} 点精力</span>
      </div>
      <div className="mt-2 text-[14px] font-semibold text-[var(--seller-ink)]">{item.title}</div>
      <p className="mt-1 text-[11px] leading-5 text-[var(--seller-muted)]">{item.detail}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {item.actionId && item.caseId ? (
          <button
            type="button"
            onClick={() => onExecuteAction(item.actionId!, item.caseId!)}
            className="seller-button-primary rounded-[10px] px-3 py-2 text-[11px]"
          >
            {item.ctaLabel}
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => onOpenCase(item.caseId)}
          className="seller-button-secondary rounded-[10px] px-3 py-2 text-[11px]"
        >
          打开房源
        </button>
      </div>
    </div>
  );
}

function HalfDayAgendaSection({
  slot,
  arrangement,
  onOpenCase,
  onExecuteAction,
  onAddToToday,
  onRemoveFromToday,
  onExecuteTodayItem,
  onUseTool,
}: {
  slot: TodayArrangementSlot;
  arrangement: ArrangementProjection['slots'][TodayArrangementSlot];
  onOpenCase: (caseId?: string) => void;
  onExecuteAction: (actionId: string, caseId: string) => boolean;
  onAddToToday: (item: ArrangementItemProjection, slot: TodayArrangementSlot) => boolean;
  onRemoveFromToday: (itemId: string) => boolean;
  onExecuteTodayItem: (itemId: string) => boolean;
  onUseTool: (tool: AgendaTool, caseId?: string) => void;
}) {
  return (
    <div className="rounded-[14px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.02)] px-3.5 py-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`seller-chip ${slot === 'am' ? 'seller-chip-accent' : ''}`}>{arrangement.label}</span>
          <span className="text-[10px] font-semibold text-[var(--seller-subtle)]">
            固定 {arrangement.fixedItems.length} · 已排 {arrangement.plannedItems.length} · 候选 {arrangement.candidateItems.length}
          </span>
        </div>
        <span className="text-[10px] font-semibold text-[var(--seller-subtle)]">
          完成 {arrangement.completedItems.length}
        </span>
      </div>

      <div className="mt-3 space-y-4">
        <HalfDayAgendaBlock title="固定安排" emptyText={`${arrangement.label}没有固定安排。`}>
          {arrangement.fixedItems.map((item) => (
            <React.Fragment key={item.id}>
              <FixedArrangementCard
                item={item}
                onOpenCase={onOpenCase}
                onExecuteAction={onExecuteAction}
              />
            </React.Fragment>
          ))}
        </HalfDayAgendaBlock>

        <HalfDayAgendaBlock title="我今天安排的" emptyText={`先把${arrangement.label}要做的事排进去。`}>
          {arrangement.plannedItems.map((item, index) => (
            <React.Fragment key={item.id}>
              <PlannedArrangementCard
                item={item}
                index={index}
                onOpenCase={onOpenCase}
                onExecuteTodayItem={onExecuteTodayItem}
                onRemoveFromToday={onRemoveFromToday}
              />
            </React.Fragment>
          ))}
        </HalfDayAgendaBlock>

        <HalfDayAgendaBlock title="候选事项" emptyText={`${arrangement.label}暂时没有新的候选事项。`}>
          {arrangement.candidateItems.map((item, index) => (
            <React.Fragment key={item.id}>
              <AgendaItemRow
                item={item}
                index={index}
                slot={slot}
                onOpenCase={onOpenCase}
                onAddToToday={onAddToToday}
                onUseTool={onUseTool}
              />
            </React.Fragment>
          ))}
        </HalfDayAgendaBlock>

        <HalfDayAgendaBlock title="已完成" emptyText={`${arrangement.label}还没有完成事项。`}>
          {arrangement.completedItems.map((item) => (
            <React.Fragment key={item.id}>
              <CompletedArrangementCard item={item} onOpenCase={onOpenCase} />
            </React.Fragment>
          ))}
        </HalfDayAgendaBlock>
      </div>
    </div>
  );
}

function HalfDayAgendaBlock({
  title,
  emptyText,
  children,
}: {
  title: string;
  emptyText: string;
  children: React.ReactNode;
}) {
  const items = React.Children.toArray(children);
  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="seller-label">{title}</div>
        <span className="text-[10px] font-semibold text-[var(--seller-subtle)]">{items.length} 件</span>
      </div>
      {items.length > 0 ? (
        <div className="mt-3 space-y-3">{items}</div>
      ) : (
        <div className="seller-empty mt-3 px-4 py-4 text-center text-[12px]">
          {emptyText}
        </div>
      )}
    </div>
  );
}

function AgendaItemRow({
  item,
  index,
  slot,
  onOpenCase,
  onAddToToday,
  onUseTool,
}: {
  item: ArrangementItemProjection;
  index: number;
  slot: TodayArrangementSlot;
  onOpenCase: (caseId?: string) => void;
  onAddToToday: (item: ArrangementItemProjection, slot: TodayArrangementSlot) => boolean;
  onUseTool: (tool: AgendaTool, caseId?: string) => void;
}) {
  const tools = buildAgendaTools({
    label: item.label,
    title: item.title,
    detail: item.detail,
    tone: item.tone,
    caseId: item.caseId,
    id: item.id,
  });
  return (
    <article className="grid gap-3 py-4 md:grid-cols-[72px_minmax(0,1fr)_auto] md:items-start">
      <div className="pt-0.5">
        <div className={`inline-flex rounded-[10px] px-2.5 py-1 text-[11px] font-semibold ${
          index === 0
            ? 'bg-[var(--seller-accent)] text-[var(--seller-bg)]'
            : 'bg-[rgba(255,255,255,0.06)] text-[var(--seller-muted)]'
        }`}>
          {index + 1}
        </div>
        <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">
          {slot === 'am' ? '上午候选' : '下午候选'}
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          {index === 0 && <span className="seller-chip seller-chip-accent">优先</span>}
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${toneChipClass(item.tone)}`}>
            {item.label}
          </span>
          <span className="text-[10px] font-medium text-[var(--seller-subtle)]">需 {item.energyCost} 点精力</span>
          <span className="text-[10px] font-medium text-[var(--seller-subtle)]">{item.statusLabel}</span>
        </div>
        <h3 className="mt-2 text-[16px] font-semibold tracking-[-0.03em] text-[var(--seller-ink)]">
          {item.title}
        </h3>
        <p className="mt-1 max-w-[72ch] text-[12px] leading-6 text-[var(--seller-muted)]">{item.detail}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {tools.map((tool) => (
            <button
              key={tool.label}
              type="button"
              onClick={() => onUseTool(tool, item.caseId)}
              className="rounded-full border border-[var(--seller-border)] bg-[rgba(255,255,255,0.04)] px-3 py-1.5 text-[11px] font-medium text-[var(--seller-muted)] transition hover:border-[var(--seller-border-strong)] hover:text-[var(--seller-ink)]"
            >
              {tool.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex shrink-0 items-start justify-start md:justify-end">
        <div className="flex flex-wrap gap-2 md:flex-col">
          {item.actionId ? (
            <button
              type="button"
              onClick={() => onAddToToday(item, slot)}
              disabled={item.isDisabled}
              className={`inline-flex items-center gap-1 rounded-[10px] px-3 py-2 text-[11px] font-semibold ${
                index === 0
                  ? 'seller-button-primary'
                  : 'seller-button-secondary'
              } disabled:opacity-50`}
              title={item.disabledReason}
            >
              {slot === 'am' ? '排到上午' : '排到下午'}
              <ArrowRight size={12} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onOpenCase(item.caseId)}
            className="seller-button-secondary inline-flex items-center gap-1 rounded-[10px] px-3 py-2 text-[11px] font-semibold"
          >
            打开房源
            <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </article>
  );
}

function PlannedArrangementCard({
  item,
  index,
  onOpenCase,
  onExecuteTodayItem,
  onRemoveFromToday,
}: {
  item: ArrangementItemProjection;
  index: number;
  onOpenCase: (caseId?: string) => void;
  onExecuteTodayItem: (itemId: string) => boolean;
  onRemoveFromToday: (itemId: string) => boolean;
}) {
  return (
    <div className="rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        {index === 0 ? <span className="seller-chip seller-chip-accent">先做</span> : <span className="seller-chip">已安排</span>}
        <span className="seller-chip">{item.slot === 'pm' ? '下午' : '上午'}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${toneChipClass(item.tone)}`}>
          {item.executionMode === 'scenario' ? '情境' : '直接处理'}
        </span>
        <span className="text-[10px] font-semibold text-[var(--seller-subtle)]">{item.statusLabel}</span>
        <span className="text-[10px] font-semibold text-[var(--seller-subtle)]">需 {item.energyCost} 点精力</span>
      </div>
      <div className="mt-2 text-[14px] font-semibold text-[var(--seller-ink)]">{item.title}</div>
      <p className="mt-1 text-[11px] leading-5 text-[var(--seller-muted)]">{item.detail}</p>
      {item.disabledReason ? (
        <p className="mt-2 text-[11px] leading-5 text-[var(--seller-risk)]">{item.disabledReason}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => item.todayPlanItemId && onExecuteTodayItem(item.todayPlanItemId)}
          disabled={item.isDisabled || !item.todayPlanItemId}
          className="seller-button-primary rounded-[10px] px-3 py-2 text-[11px] disabled:opacity-50"
          title={item.disabledReason}
        >
          {item.executionMode === 'scenario' ? '进入情境' : '立即处理'}
        </button>
        <button
          type="button"
          onClick={() => item.todayPlanItemId && onRemoveFromToday(item.todayPlanItemId)}
          disabled={!item.todayPlanItemId}
          className="seller-button-secondary rounded-[10px] px-3 py-2 text-[11px] disabled:opacity-50"
        >
          移出今天
        </button>
        <button
          type="button"
          onClick={() => onOpenCase(item.caseId)}
          className="seller-button-secondary rounded-[10px] px-3 py-2 text-[11px]"
        >
          打开房源
        </button>
      </div>
    </div>
  );
}

function CompletedArrangementCard({
  item,
  onOpenCase,
}: {
  item: ArrangementItemProjection;
  onOpenCase: (caseId?: string) => void;
}) {
  return (
    <div className="rounded-[12px] border border-[color:var(--seller-accent)]/24 bg-[var(--seller-accent-soft)] px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="seller-chip seller-chip-accent">已完成</span>
        <span className="seller-chip">{item.slot === 'pm' ? '下午' : '上午'}</span>
        <span className="text-[10px] font-semibold text-[var(--seller-subtle)]">{item.statusLabel}</span>
        <span className="text-[10px] font-semibold text-[var(--seller-subtle)]">已消耗 {item.energyCost} 点精力</span>
      </div>
      <div className="mt-2 text-[14px] font-semibold text-[var(--seller-ink)]">{item.title}</div>
      <p className="mt-1 text-[11px] leading-5 text-[var(--seller-muted)]">{item.detail}</p>
      <div className="mt-3">
        <button
          type="button"
          onClick={() => onOpenCase(item.caseId)}
          className="seller-button-secondary rounded-[10px] px-3 py-2 text-[11px]"
        >
          查看房源
        </button>
      </div>
    </div>
  );
}

function PinnedCasePanel({
  caseItem,
  projection,
  impactedItem,
  onOpenCase,
  onOpenMarket,
}: {
  caseItem: GameState['cases'][number] | null;
  projection: ReturnType<typeof buildOperatingProjection>['cases'][number] | null;
  impactedItem: {
    caseId: string;
    title: string;
    count: number;
    reason: string;
    tone: ProjectionTone;
    layer: IntelLayerTab;
  } | null;
  onOpenCase: () => void;
  onOpenMarket: (layer?: IntelLayerTab) => void;
}) {
  if (!caseItem || !projection) {
    return (
      <section className="seller-panel px-4 py-4">
        <div className="seller-label flex items-center gap-2">
          <Target size={13} />
          当前主房源
        </div>
        <div className="seller-empty mt-3 px-4 py-6 text-[12px]">
          当前没有需要单独抬出来看的房源。
        </div>
      </section>
    );
  }

  return (
    <section className="seller-panel overflow-hidden">
      <div className="border-b border-[var(--seller-border)] px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="seller-label flex items-center gap-2">
              <Target size={13} />
              当前主房源
            </div>
            <h2 className="mt-2 text-[16px] font-semibold tracking-[-0.03em] text-[var(--seller-ink)]">
              {caseItem.title}
            </h2>
            <p className="mt-1 text-[11px] leading-5 text-[var(--seller-muted)]">
              {caseItem.community} · {caseItem.layout} · 业主 {caseItem.ownerName}
            </p>
          </div>
          <span className="seller-chip">{projection.recentChanges.slice(0, 3).length + projection.actionReasons.slice(0, 2).length} 项</span>
        </div>
      </div>

      <div className="px-4 py-4">
        <div className="seller-fact-row px-3.5 py-3.5">
          <div className="seller-label">当前重点</div>
          <div className="mt-2 text-[13px] font-semibold text-[var(--seller-ink)]">
            {projection.actionReasons[0]?.title || `${caseItem.title} 今天要先盯住`}
          </div>
          <div className="mt-1 text-[11px] leading-5 text-[var(--seller-muted)]">
            {projection.actionReasons[0]?.detail || projection.nextStepLine}
          </div>

          {impactedItem && (
            <div className="mt-3 rounded-[10px] border border-[color:var(--seller-risk)]/26 bg-[var(--seller-risk-soft)] px-3 py-2.5">
              <div className="text-[10px] font-semibold text-[var(--seller-risk)]">外部也打到了这套房</div>
              <div className="mt-1 text-[11px] leading-5 text-[var(--seller-ink)]">
                {impactedItem.reason}，今天被命中 {impactedItem.count} 次。
              </div>
            </div>
          )}
        </div>

        <div className="mt-4 grid gap-2 md:grid-cols-3">
          <MetricBar
            label="业主关系"
            value={Math.round(caseItem.trust)}
            detail={`信任 ${Math.round(caseItem.trust)} / 耐心 ${Math.round(caseItem.patience)}`}
            tone={caseItem.trust < 55 || caseItem.patience < 45 ? 'risk' : 'neutral'}
          />
          <MetricBar
            label="竞争力"
            value={Math.round(caseItem.competitiveness)}
            detail={`竞争力 ${Math.round(caseItem.competitiveness)} / 窗口 ${caseItem.windowDays} 天`}
            tone={caseItem.competitiveness < 50 || caseItem.windowDays <= 3 ? 'risk' : 'chance'}
          />
          <MetricBar
            label="价格位"
            value={pricePosition(caseItem)}
            detail={`挂牌高出常见成交价 ${Math.max(0, Math.round(caseItem.askPrice - caseItem.marketPrice))} 万`}
            tone={caseItem.askPrice > caseItem.marketPrice ? 'risk' : 'chance'}
          />
        </div>

        <div className="mt-4 border-t border-[var(--seller-border)] pt-3">
          <div className="seller-label">客户情况</div>
          <div className="mt-3 space-y-3">
            <SummaryRow
              label="已接上客户"
              value={`${projection.customerPoolSummary.metCount} 位`}
              detail={projection.customerPoolSummary.title}
            />
            <SummaryRow
              label="在跟进的客户"
              value={`${projection.customerPoolSummary.metCount + projection.customerPoolSummary.potentialCount} 位`}
              detail={projection.customerPoolSummary.detail}
            />
            <SummaryRow
              label="快到报价"
              value={`${projection.customerPoolSummary.closingCount} 位`}
              detail={projection.customerPoolSummary.closingCount > 0 ? '已经进入报价或谈判区。' : '当前还没有进入报价桌的客户。'}
            />
          </div>
        </div>

        <div className="mt-4 border-t border-[var(--seller-border)] pt-3">
          <div className="seller-label">最近变化</div>
          <div className="mt-3 space-y-3">
            {projection.recentChanges.slice(0, 3).map((item) => (
              <div key={item.id}>
                <FactChainRow
                  label={item.label}
                  title={item.title}
                  detail={item.detail}
                  tone={item.tone}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={onOpenCase}
            className="seller-button-primary flex w-full items-center justify-center gap-1 rounded-[10px] px-3 py-2 text-[11px]"
          >
            打开房源
            <ArrowRight size={12} />
          </button>
          <button
            type="button"
            onClick={() => onOpenMarket(impactedItem ? 'listing' : 'district')}
            className="seller-button-secondary flex w-full items-center justify-center gap-1 rounded-[10px] px-3 py-2 text-[11px]"
          >
            看外部变化
            <ArrowRight size={12} />
          </button>
        </div>
      </div>
    </section>
  );
}

function MetricBar({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: number;
  detail: string;
  tone: ProjectionTone;
}) {
  const barColor = tone === 'risk'
    ? 'var(--seller-risk)'
    : tone === 'chance'
      ? 'var(--seller-accent)'
      : 'var(--seller-info)';

  return (
    <div className="seller-fact-row px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[10px] font-semibold tracking-[0.08em] text-[var(--seller-subtle)]">{label}</div>
        <div className="text-[13px] font-semibold text-[var(--seller-ink)]">{value}/100</div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
        <div
          className="h-full rounded-full"
          style={{ width: `${Math.max(6, Math.min(100, value))}%`, backgroundColor: barColor }}
        />
      </div>
      <div className="mt-2 text-[10px] leading-5 text-[var(--seller-muted)]">{detail}</div>
    </div>
  );
}

function SummaryRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-[var(--seller-border)] pb-3 last:border-b-0 last:pb-0">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold text-[var(--seller-ink)]">{label}</div>
        <div className="mt-1 text-[11px] leading-5 text-[var(--seller-muted)]">{detail}</div>
      </div>
      <div className="text-[12px] font-semibold text-[var(--seller-ink)]">{value}</div>
    </div>
  );
}

function TriageSummaryPanel({
  cards,
  onOpen,
}: {
  cards: DashboardProjection['triageCards'];
  onOpen: (targetView: string, caseId?: string, marketLayer?: IntelLayerTab) => void;
}) {
  return (
    <section className="seller-panel overflow-hidden">
      <div className="border-b border-[var(--seller-border)] px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="seller-label flex items-center gap-2">
            <Target size={13} />
            快速导航
          </div>
          <span className="text-[10px] font-semibold text-[var(--seller-subtle)]">只做快速导航，不重复页面内容</span>
        </div>
      </div>

      <div className="grid divide-y divide-[var(--seller-border)]">
        <section className="px-4 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="text-[11px] font-semibold text-[var(--seller-ink)]">页面边界</div>
            <span className="text-[10px] font-semibold text-[var(--seller-subtle)]">{cards.length} 个入口</span>
          </div>
          <div className="space-y-3">
            {cards.map((card) => (
              <button
                key={card.id}
                type="button"
                onClick={() => onOpen(card.targetView, card.caseId, card.marketLayer)}
                className="w-full rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-3 py-3 text-left transition hover:border-[var(--seller-border-strong)]"
              >
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${toneChipClass(card.tone)}`}>{card.label}</span>
                  <span className="text-[10px] font-medium text-[var(--seller-subtle)]">{card.countLabel}</span>
                </div>
                <div className="mt-2 text-[13px] font-semibold text-[var(--seller-ink)]">{card.title}</div>
                <div className="mt-1 text-[11px] leading-5 text-[var(--seller-muted)]">{card.detail}</div>
              </button>
            ))}
          </div>
        </section>

      </div>
    </section>
  );
}

function FactChainRow({
  label,
  title,
  detail,
  tone,
}: {
  key?: React.Key;
  label: string;
  title: string;
  detail: string;
  tone: ProjectionTone;
}) {
  return (
    <div className="rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-3 py-3">
      <div className="flex items-center gap-2">
        <span className={`h-1.5 w-1.5 rounded-full ${toneDotClass(tone)}`} />
        <span className="text-[10px] font-medium text-[var(--seller-subtle)]">{label}</span>
      </div>
      <div className="mt-2 text-[12px] font-semibold text-[var(--seller-ink)]">{title}</div>
      <div className="mt-1 text-[11px] leading-5 text-[var(--seller-muted)]">{detail}</div>
    </div>
  );
}

function CalendarCell({
  entry,
  active,
  onClick,
}: {
  entry: CalendarRailEntry;
  active: boolean;
  onClick: () => void;
}) {
  const isToday = entry.relation === 'today';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative min-w-[110px] rounded-[12px] border px-3 py-3 text-left transition ${
        active
          ? 'border-[var(--seller-accent)] bg-[var(--seller-panel-alt)] text-[var(--seller-ink)]'
          : isToday
            ? 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.04)] text-[var(--seller-ink)]'
            : 'border-[var(--seller-border)] bg-transparent text-[var(--seller-muted)] hover:bg-[rgba(255,255,255,0.04)]'
      }`}
    >
      {isToday && (
        <span className="absolute left-3 top-[-10px] rounded-full bg-[var(--seller-accent)] px-2 py-0.5 text-[10px] font-bold text-[var(--seller-bg)]">
          TODAY
        </span>
      )}
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.14em] opacity-70">DAY {entry.day}</span>
        <span className={`h-1.5 w-1.5 rounded-full ${toneDotClass(entry.tone)}`} />
      </div>
      <div className="mt-2 text-[14px] font-semibold tracking-[-0.02em]">{entry.label}</div>
      <div className="mt-1 text-[11px] leading-5 opacity-80">{entry.title}</div>
      <div className="mt-2 text-[10px] font-medium opacity-75">{entry.meta}</div>
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
  const eventSlots = splitJournalItemsBySlot(events);

  if (entry.relation === 'today') {
    return (
      <div className="seller-panel overflow-hidden">
        <div className="border-b border-[var(--seller-border)] px-4 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="seller-label text-[var(--seller-accent)]">今天发生了什么</div>
              <h3 className="mt-2 text-[15px] font-semibold tracking-[-0.03em] text-[var(--seller-ink)]">
                DAY {entry.day} · {entry.title}
              </h3>
              <p className="mt-2 text-[12px] leading-6 text-[var(--seller-muted)]">
                {dateLabel}。{entry.detail}
              </p>
            </div>
            <button
              type="button"
              onClick={onBackToday}
              className="seller-button-secondary rounded-[10px] px-3 py-2 text-[11px]"
            >
              回到今天主视图
            </button>
          </div>
        </div>
        <div className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="space-y-3">
            {(['am', 'pm'] as TodayArrangementSlot[]).map((slot) => (
              <React.Fragment key={slot}>
                <JournalSlotBlock
                  label={slot === 'am' ? '上午发生了什么' : '下午发生了什么'}
                  items={eventSlots[slot]}
                  emptyText={slot === 'am' ? '今天上午还没有留下新的关键记录。' : '今天下午还没有留下新的关键记录。'}
                  onOpenCase={onOpenCase}
                />
              </React.Fragment>
            ))}
          </div>
          <div className="rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-3 py-3">
            <div className="seller-label">今天提示</div>
            <div className="mt-3 space-y-2 text-[11px] leading-5 text-[var(--seller-muted)]">
              <p>先按上午、下午回看今天已经留下的变化。</p>
              <p>看完就回到下面继续安排和推进。</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (entry.relation === 'future') {
    return (
      <div className="seller-panel overflow-hidden">
        <div className="border-b border-[var(--seller-border)] px-4 py-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="seller-label text-[var(--seller-accent)]">后面几天</div>
              <h3 className="mt-2 text-[15px] font-semibold tracking-[-0.03em] text-[var(--seller-ink)]">
                DAY {entry.day} · {entry.title}
              </h3>
              <p className="mt-2 text-[12px] leading-6 text-[var(--seller-muted)]">
                {dateLabel}。{entry.detail}
              </p>
            </div>
            <button
              type="button"
              onClick={onBackToday}
              className="seller-button-primary rounded-[10px] px-3 py-2 text-[11px]"
            >
              回到今天
            </button>
          </div>
        </div>
        <div className="space-y-3 px-4 py-4">
          {buildFutureSlotCards(entry).map((card) => (
            <div
              key={card.slot}
              className="rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-3.5 py-3"
            >
              <div className="flex items-center gap-2">
                <span className={`seller-chip ${card.slot === 'am' ? 'seller-chip-accent' : ''}`}>
                  {card.slot === 'am' ? '上午' : '下午'}
                </span>
                <span className="text-[10px] font-semibold text-[var(--seller-subtle)]">{card.badge}</span>
              </div>
              <div className="mt-2 text-[14px] font-semibold text-[var(--seller-ink)]">{card.title}</div>
              <p className="mt-1 text-[11px] leading-5 text-[var(--seller-muted)]">{card.detail}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {card.pills.map((pill) => (
                  <span
                    key={pill}
                    className="rounded-full border border-[var(--seller-border)] bg-[rgba(255,255,255,0.04)] px-3 py-1 text-[11px] font-medium text-[var(--seller-muted)]"
                  >
                    {pill}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="seller-panel overflow-hidden">
      <div className="border-b border-[var(--seller-border)] px-4 py-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="seller-label text-[var(--seller-accent)]">那天记录</div>
            <h3 className="mt-2 text-[15px] font-semibold tracking-[-0.03em] text-[var(--seller-ink)]">
              DAY {entry.day} · {dateLabel}
            </h3>
            <p className="mt-2 text-[12px] leading-6 text-[var(--seller-muted)]">
              这里是那天的总结页，只看留下的动作、记录和影响。
            </p>
          </div>
          <button
            type="button"
            onClick={onBackToday}
            className="seller-button-primary rounded-[10px] px-3 py-2 text-[11px]"
          >
            回到今天
          </button>
        </div>
      </div>
      <div className="grid gap-3 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_260px]">
        <div className="space-y-3">
          {(['am', 'pm'] as TodayArrangementSlot[]).map((slot) => (
            <React.Fragment key={slot}>
              <JournalSlotBlock
                label={slot === 'am' ? '上午做了什么' : '下午做了什么'}
                items={eventSlots[slot]}
                emptyText={slot === 'am' ? '那天上午没有留下关键记录。' : '那天下午没有留下关键记录。'}
                onOpenCase={onOpenCase}
              />
            </React.Fragment>
          ))}
        </div>
        <div className="rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-3 py-3">
          <div className="seller-label">回看重点</div>
          <div className="mt-3 space-y-2 text-[11px] leading-5 text-[var(--seller-muted)]">
            <p>{events.length > 0 ? `这天留下了 ${events.length} 条关键变化。` : '这天没有留下会继续影响判断的关键变化。'}</p>
            <p>先按上午、下午回看那天发生了什么。</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function buildCalendarRail(
  state: GameState,
  dashboard: DashboardProjection,
  journalItems: JournalItem[],
): CalendarRailEntry[] {
  const entries: CalendarRailEntry[] = [];
  const startPastDay = Math.max(1, state.day - 3);

  for (let day = startPastDay; day < state.day; day += 1) {
    const events = journalItems.filter((item) => item.day === day);
    entries.push({
      day,
      relation: 'past',
      label: day === state.day - 1 ? '昨天' : `DAY ${day}`,
      title: events[0]?.title || '没有关键记录',
      detail: events[0]?.detail || '这天没有留下会影响今天判断的变化。',
      meta: events.length > 0 ? `${events.length} 条记录` : '无新增',
      tone: deriveEventsTone(events),
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
        title: entry.title,
        detail: entry.detail,
        meta: isToday
          ? `${dashboard.todayPriority.length} 件事 · ${dashboard.marketBrief.todayCount} 条外部变化`
          : `${entry.energy} 精力 · ${futureSignal(entry)}`,
        tone: isToday
          ? (dashboard.marketBrief.riskCount > 0 ? 'risk' : dashboard.marketBrief.chanceCount > 0 ? 'chance' : 'neutral')
          : entry.tone,
        energy: entry.energy,
      });
    });

  return entries;
}

function buildJournalItems(state: GameState): JournalItem[] {
  const explicitItems = state.eventStore.map((entry) => ({
    id: entry.id,
    day: entry.day,
    title: entry.title,
    detail: entry.detail,
    actor: entry.actor,
    tone: entry.tone,
    caseId: entry.caseId,
  }));

  const fallbackItems = state.eventLog
    .filter((entry) => !state.eventStore.some((stored) => stored.day === entry.day && stored.actor === entry.actor && stored.detail === entry.message))
    .map((entry, index) => ({
      id: `log-${entry.day}-${index}`,
      day: entry.day,
      title: trimTitle(entry.message),
      detail: entry.message,
      actor: entry.actor,
      tone: entry.tone,
    }));

  return [...explicitItems, ...fallbackItems].sort((left, right) => right.day - left.day);
}

function buildAgendaTools(item: ProjectionBrief): AgendaTool[] {
  const text = `${item.label} ${item.title} ${item.detail}`;
  if (/业主|反馈|信任|耐心/.test(text)) {
    return [
      { label: '写反馈要点', target: 'case' },
      { label: '看客户情况', target: 'customers' },
      { label: '查同类房对比', target: 'market', marketLayer: 'competition' },
    ];
  }
  if (/竞品|竞争|窗口/.test(text)) {
    return [
      { label: '拉同类房对比', target: 'market', marketLayer: 'competition' },
      { label: '看受影响房源', target: 'market', marketLayer: 'listing' },
      { label: '回到房源', target: 'case' },
    ];
  }
  if (/成交|报价|谈判/.test(text)) {
      return [
        { label: '看谈判', target: 'case' },
        { label: '看报价前客户', target: 'customers' },
        { label: '看调价依据', target: 'case' },
      ];
  }
  if (/客户|带看|流失/.test(text)) {
    return [
      { label: '看客户线', target: 'customers' },
      { label: '安排带看', target: 'case' },
      { label: '回到房源', target: 'case' },
    ];
  }
  if (/市场|商圈/.test(text)) {
    return [
      { label: '看市场变化', target: 'market', marketLayer: 'district' },
      { label: '看受影响房源', target: 'market', marketLayer: 'listing' },
      { label: '看今日事项', target: 'case' },
    ];
  }

  return [
    { label: '打开房源', target: 'case' },
    { label: '看客户线', target: 'customers' },
    { label: '看市场变化', target: 'market', marketLayer: 'macro' },
  ];
}

function buildFuturePrepPills(entry: CalendarRailEntry) {
  if (entry.title.includes('业主') || entry.detail.includes('业主')) {
    return ['筛反馈房源', '看客户记录', '查同类房对比'];
  }
  if (entry.title.includes('获客') || entry.detail.includes('客户')) {
    return ['筛缺客户房源', '看推广金', '看商圈热度'];
  }
  if (entry.title.includes('带看') || entry.detail.includes('周末')) {
    return ['排带看顺序', '看后续客户', '检查房源卖点'];
  }
  return ['看在场房源', '检查精力', '回到今日安排'];
}

function buildFutureSlotCards(entry: CalendarRailEntry) {
  const pills = buildFuturePrepPills(entry);
  return [
    {
      slot: 'am' as const,
      badge: '先看已有安排',
      title: entry.title,
      detail: entry.meta,
      pills: pills.slice(0, 2),
    },
    {
      slot: 'pm' as const,
      badge: '再看准备动作',
      title: futureSignal(entry) === '轻排' ? '下午先留机动' : '下午继续推进',
      detail: entry.detail,
      pills: pills.slice(2),
    },
  ];
}

function futureSignal(entry: Pick<CalendarRailEntry, 'title' | 'energy'> | CalendarDayProjection) {
  if (entry.title.includes('业主')) return '业主日';
  if (entry.title.includes('获客')) return '获客日';
  if (entry.title.includes('带看')) return '带看';
  if ((entry.energy || 0) <= 1) return '轻排';
  return '普通日';
}

function splitJournalItemsBySlot(events: JournalItem[]): Record<TodayArrangementSlot, JournalItem[]> {
  const midpoint = Math.ceil(events.length / 2);
  return {
    am: events.slice(0, midpoint),
    pm: events.slice(midpoint),
  };
}

function JournalSlotBlock({
  label,
  items,
  emptyText,
  onOpenCase,
}: {
  label: string;
  items: JournalItem[];
  emptyText: string;
  onOpenCase: (caseId?: string) => void;
}) {
  return (
    <div className="rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-3 py-3">
      <div className="seller-label">{label}</div>
      {items.length > 0 ? (
        <div className="mt-3 space-y-3">
          {items.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => onOpenCase(event.caseId)}
              className="w-full rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-3 py-3 text-left transition hover:border-[var(--seller-border-strong)]"
            >
              <div className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 rounded-full ${journalToneClass(event.tone)}`} />
                <span className="text-[10px] font-medium text-[var(--seller-subtle)]">{event.actor}</span>
              </div>
              <div className="mt-2 text-[13px] font-semibold text-[var(--seller-ink)]">{event.title}</div>
              <div className="mt-1 text-[11px] leading-5 text-[var(--seller-muted)]">{event.detail}</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="seller-empty mt-3 px-4 py-6 text-[12px]">{emptyText}</div>
      )}
    </div>
  );
}

function deriveEventsTone(events: JournalItem[]): ProjectionTone {
  if (events.some((event) => event.tone === 'danger')) return 'risk';
  if (events.some((event) => event.tone === 'success')) return 'chance';
  return 'neutral';
}

function pricePosition(caseItem: GameState['cases'][number]) {
  const gapPct = Math.max(0, Math.round(caseItem.priceGapPct * 100));
  return Math.max(12, Math.min(100, 100 - gapPct));
}

function scoreCaseWeight(caseItem: GameState['cases'][number]) {
  if (caseItem.status !== 'active') return -1;

  let score = 0;
  if (caseItem.storylineState === 'critical') score += 120;
  if (caseItem.storylineState === 'sliding') score += 80;
  if (caseItem.windowDays <= 4) score += 40;
  if (caseItem.trust <= 55) score += 30;
  if (caseItem.competitionGroupIds.length > 0) score += 20;
  return score;
}

function toneChipClass(tone: ProjectionTone) {
  if (tone === 'risk') return 'bg-[var(--seller-risk-soft)] text-[var(--seller-risk)]';
  if (tone === 'chance') return 'bg-[var(--seller-chance-soft)] text-[var(--seller-chance)]';
  return 'bg-[var(--seller-accent-soft)] text-[var(--seller-accent)]';
}

function toneDotClass(tone: ProjectionTone) {
  if (tone === 'risk') return 'bg-[color:var(--seller-risk)]';
  if (tone === 'chance') return 'bg-[color:var(--seller-chance)]';
  return 'bg-[color:var(--seller-accent)]';
}

function journalToneClass(tone: JournalItem['tone']) {
  if (tone === 'danger') return 'bg-[color:var(--seller-risk)]';
  if (tone === 'success') return 'bg-[color:var(--seller-chance)]';
  return 'bg-[color:var(--seller-accent)]';
}

function trimTitle(message: string) {
  return message.length <= 28 ? message : `${message.slice(0, 28)}...`;
}

function shiftDate(currentDate: string, offset: number) {
  const date = new Date(currentDate);
  date.setDate(date.getDate() + offset);
  return date.toISOString().split('T')[0];
}
