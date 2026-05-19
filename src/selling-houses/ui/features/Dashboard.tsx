import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { GameState, TodayArrangementSlot } from '../../domain/models';
import { formatDate, getRoutine } from '../../domain/utils';
import { WEEKLY_ROUTINE } from '../../domain/constants';
import { ACTIONS } from '../../domain/actions/definitions.js';
import {
  type ArrangementItemProjection,
  type ArrangementProjection,
  buildOperatingProjection,
  type CalendarDayProjection,
  type CaseDetailProjection,
  type DashboardProjection,
  type ProductOpportunityProjection,
  type ProjectionBrief,
  type ProjectionTone,
} from '../../application/projections/operatingProjection.js';
import { buildMyWechatProjection } from '../../application/projections/myWechatProjection.js';
import type { WechatMessage } from '../../application/projections/myWechatTypes.js';
import { buildMarketIntelProjection, type IntelLayerTab } from './marketIntel';
import { MyWechatPanel } from './MyWechatPanel';
import {
  ArrowRight,
  Calendar,
  Clock3,
} from 'lucide-react';

interface DashboardProps {
  state: GameState;
  wechatReadIds: Set<string>;
  onSelectCase: (id: string) => void;
  onExecuteAction: (actionId: string, caseId: string) => boolean;
  onEnterScenarioAction: (actionId: string, caseId: string) => boolean;
  onAddToToday: (item: ArrangementItemProjection, slot: TodayArrangementSlot) => boolean;
  onRemoveFromToday: (itemId: string) => boolean;
  onExecuteTodayItem: (itemId: string) => boolean;
  onCaptureOpportunity: (opportunity: ProductOpportunityProjection) => boolean;
  onSetView: (view: string) => void;
  onOpenMarket: (layer?: IntelLayerTab) => void;
  onOpenCaseFromWechat: (caseId: string) => void;
  onMarkWechatRead: (id: string) => void;
  onSendWechatConversationReply: (
    conversationKey: string,
    message: WechatMessage,
    playerText: string,
  ) => Promise<{ success: boolean; reason: string; receipt: unknown | null }>;
  onAdvanceToDay: (targetDay: number) => void;
}

type CalendarRelation = 'past' | 'today' | 'future';
type DashboardCalendarMode = CalendarRelation;
type CalendarWindowDays = 7 | 14;

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

const DEFAULT_CALENDAR_WINDOW_DAYS: CalendarWindowDays = 7;
const CALENDAR_WINDOW_OPTIONS: CalendarWindowDays[] = [7, 14];
const CALENDAR_PAST_CONTEXT_DAYS: Record<CalendarWindowDays, number> = {
  7: 0,
  14: 3,
};

export function resolveDashboardSelectedDayAfterStateDayChange(
  selectedDay: number,
  stateDay: number,
  previousStateDay: number,
) {
  return stateDay !== previousStateDay ? stateDay : selectedDay;
}

export function Dashboard({
  state,
  wechatReadIds,
  onSelectCase,
  onExecuteAction,
  onEnterScenarioAction,
  onAddToToday,
  onRemoveFromToday,
  onExecuteTodayItem,
  onCaptureOpportunity,
  onSetView,
  onOpenMarket,
  onOpenCaseFromWechat,
  onMarkWechatRead,
  onSendWechatConversationReply,
  onAdvanceToDay,
}: DashboardProps) {
  const operatingProjection = useMemo(() => buildOperatingProjection(state), [state]);
  const dashboard = operatingProjection.dashboard;
  const marketIntel = useMemo(() => buildMarketIntelProjection(state), [state]);
  const myWechat = useMemo(
    () => buildMyWechatProjection({ state, dashboard, marketIntel }),
    [dashboard, marketIntel, state],
  );
  const journalItems = useMemo(() => buildJournalItems(state), [state]);
  const [selectedDay, setSelectedDay] = useState(state.day);
  const [showTimelineDetail, setShowTimelineDetail] = useState(false);
  const [calendarWindowDays, setCalendarWindowDays] = useState<CalendarWindowDays>(DEFAULT_CALENDAR_WINDOW_DAYS);
  const calendarRail = useMemo(
    () => buildCalendarRail(state, dashboard, journalItems, calendarWindowDays),
    [calendarWindowDays, dashboard, journalItems, state],
  );
  const lastKnownStateDayRef = useRef(state.day);

  useEffect(() => {
    const previousStateDay = lastKnownStateDayRef.current;
    const nextSelectedDay = resolveDashboardSelectedDayAfterStateDayChange(
      selectedDay,
      state.day,
      previousStateDay,
    );

    if (nextSelectedDay !== selectedDay) {
      setSelectedDay(nextSelectedDay);
    }

    if (previousStateDay !== state.day) {
      setShowTimelineDetail(false);
      lastKnownStateDayRef.current = state.day;
    }
  }, [selectedDay, state.day]);

  useEffect(() => {
    if (!calendarRail.some((entry) => entry.day === selectedDay)) {
      setSelectedDay(state.day);
      setShowTimelineDetail(false);
    }
  }, [calendarRail, selectedDay, state.day]);

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

  const scheduleWechatMessageAction = (message: WechatMessage) => {
    if (!message.targetCaseId || !message.primaryActionId) {
      return false;
    }

    const caseItem = state.cases.find((entry) => entry.id === message.targetCaseId);
    if (!caseItem) {
      return false;
    }

    const action = ACTIONS.find((entry) => entry.id === message.primaryActionId || entry.executorId === message.primaryActionId) || null;
    if (!action) {
      return false;
    }

    const candidateItem = dashboard.arrangement.candidateItems.find(
      (item) => item.caseId === caseItem.id
        && item.actionId === action.id
        && (!message.targetCustomerId || item.customerId === message.targetCustomerId),
    );
    const opportunity = message.targetOpportunityId
      ? state.opportunities.find((entry) => entry.id === message.targetOpportunityId) || null
      : message.targetCustomerId
        ? state.opportunities.find((entry) => entry.customerId === message.targetCustomerId && entry.caseId === caseItem.id && entry.status === 'active') || null
        : null;
    const slot = candidateItem?.slot || getDefaultAgendaSlot();
    const arrangementItem: ArrangementItemProjection = candidateItem || {
      id: `wechat-message-${message.id}-${action.id}`,
      source: 'candidate',
      slot,
      rank: 1,
      label: '待选',
      title: `${caseItem.title} · ${action.name}`,
      detail: `${caseItem.community} · ${action.summary}`,
      tone: 'neutral',
      caseId: caseItem.id,
      customerId: message.targetCustomerId,
      opportunityId: opportunity?.id,
      durationHours: action.durationHours,
      energyCost: action.costEnergy,
      statusLabel: '可加入',
      actionId: action.id,
      executionMode: action.type === 'scenario' ? 'scenario' : 'direct',
      ctaLabel: slot === 'am' ? '加入上午' : '加入下午',
      displayTitle: opportunity?.customerName,
      contextTitle: opportunity ? caseItem.title : undefined,
      secondaryLabel: opportunity ? '看客户' : '看房源',
    };

    return onAddToToday(arrangementItem, slot);
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
      <section className="seller-panel overflow-hidden">
        <div className="border-b border-[var(--seller-border)] px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="seller-label flex items-center gap-2">
              <Calendar size={13} />
              {calendarWindowDays}天节奏
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <div className="inline-flex items-center gap-0.5 rounded-full border border-[var(--seller-border)] bg-[rgba(255,255,255,0.04)] p-0.5">
                {CALENDAR_WINDOW_OPTIONS.map((windowDays) => (
                  <button
                    key={windowDays}
                    type="button"
                    aria-pressed={calendarWindowDays === windowDays}
                    onClick={() => setCalendarWindowDays(windowDays)}
                    className={`inline-flex h-[18px] min-w-[30px] items-center justify-center rounded-full px-1 text-[9px] font-bold leading-none transition ${
                      calendarWindowDays === windowDays
                        ? 'bg-[var(--seller-ink)] text-[var(--seller-bg)]'
                        : 'text-[var(--seller-muted)] hover:text-[var(--seller-ink)]'
                    }`}
                  >
                    <span className="origin-center scale-[0.78]">{windowDays}天</span>
                  </button>
                ))}
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
                {calendarMode === 'today' ? (showTimelineDetail ? '收起历史' : '看历史') : '回到今天'}
              </button>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4 lg:grid-cols-7">
            {calendarRail.map((entry) => (
              <CalendarCell
                key={entry.day}
                entry={entry}
                active={entry.day === selectedDay}
                onClick={() => {
                  if (entry.day !== state.day) {
                    setShowTimelineDetail(false);
                  }
                  setSelectedDay(entry.day);
                }}
              />
            ))}
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
              maxDay={state.maxDay}
              energyLabel={dashboard.resourceSnapshot.energy}
            onOpenCase={openCase}
            onExecuteAction={onExecuteAction}
            onEnterScenarioAction={onEnterScenarioAction}
            onAddToToday={onAddToToday}
              onRemoveFromToday={onRemoveFromToday}
              onExecuteTodayItem={onExecuteTodayItem}
              onUseTool={handleAgendaTool}
            />

            <div className="space-y-3">
              {/* 旧右栏“机会 / 今日新闻摘要 / 推荐跟进房源”已由“我的微信”替代，旧组件保留便于回滚。 */}
              <MyWechatPanel
                state={state}
                projection={myWechat}
                readIds={wechatReadIds}
                onMarkRead={onMarkWechatRead}
                onSelectCase={onOpenCaseFromWechat}
                onScheduleMessageAction={scheduleWechatMessageAction}
                onSendConversationReply={onSendWechatConversationReply}
                onOpenMarket={(layer) => onOpenMarket(layer || 'macro')}
              />
            </div>
          </div>
        </>
      ) : selectedCalendarEntry ? (
        <SelectedDayPanel
          entry={selectedCalendarEntry}
          dateLabel={selectedDateLabel}
          events={selectedDayEvents}
          onBackToday={() => setSelectedDay(state.day)}
          onAdvanceToDay={onAdvanceToDay}
          onOpenCase={openCase}
        />
      ) : null}
    </div>
  );
}

function ProductOpportunityPanel({
  items,
  onOpenCase,
  onCapture,
}: {
  items: ProductOpportunityProjection[];
  onOpenCase: (caseId?: string) => void;
  onCapture: (opportunity: ProductOpportunityProjection) => boolean;
}) {
  return (
    <section className="seller-panel overflow-hidden">
      <div className="border-b border-[var(--seller-border)] px-4 py-3">
        <div className="seller-label">机会</div>
      </div>
      <div className="space-y-2 px-4 py-3">
        {items.map((item) => {
          const actionLabel = item.status === 'accepted'
            ? '看进展'
            : item.primaryActionLabel;
          return (
            <article key={item.id} className="rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2.5">
              <div className="text-[12px] font-semibold text-[var(--seller-ink)]">{item.headline}</div>
              <p className="mt-1 text-[11px] text-[var(--seller-muted)]">{item.reasonLabel}</p>
              <p className="mt-1 text-[11px] text-[var(--seller-subtle)]">{item.subline}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={item.status === 'expired'}
                  onClick={() => onCapture(item)}
                  className="seller-button-primary rounded-[10px] px-3 py-2 text-[11px] disabled:opacity-60"
                >
                  {actionLabel}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenCase(item.caseId)}
                  className="seller-button-secondary rounded-[10px] px-3 py-2 text-[11px]"
                >
                  看房源
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

function oneLine(text: string, max: number) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, Math.max(0, max - 1))}…`;
}

function buildDashboardMarketNews(
  marketBrief: DashboardProjection['marketBrief'],
): Array<{ title: string; impact: string }> {
  const rows: Array<{ title: string; impact: string }> = [];
  const seen = new Set<string>();

  const append = (title: string, detail: string) => {
    if (rows.length >= 3) return;
    const lineTitle = oneLine(title, 56);
    if (seen.has(lineTitle)) return;
    seen.add(lineTitle);
    rows.push({
      title: lineTitle,
      impact: oneLine(detail, 48),
    });
  };

  if (marketBrief.lead) {
    append(marketBrief.lead.title, marketBrief.lead.detail);
  }
  for (const brief of marketBrief.briefs) {
    if (rows.length >= 3) break;
    append(brief.title, brief.detail);
  }

  return rows;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildFollowListingRows(
  state: GameState,
  caseDetails: CaseDetailProjection[],
  todayPriority: DashboardProjection['todayPriority'],
) {
  const seen = new Set<string>();
  const rows: Array<{
    caseId: string;
    name: string;
    stageOrProblem: string;
    reason: string;
  }> = [];

  for (const item of todayPriority) {
    if (!item.caseId || seen.has(item.caseId)) {
      continue;
    }
    const caseItem = state.cases.find((entry) => entry.id === item.caseId);
    if (!caseItem || caseItem.status !== 'active') {
      continue;
    }
    seen.add(item.caseId);
    const projection = caseDetails.find((entry) => entry.caseId === item.caseId) || null;
    const name = caseItem.title;
    const stageOrProblem = projection
      ? projection.listingLifecyclePhase.phaseLabel
      : oneLine(item.label, 14);
    let reason = oneLine(item.detail, 50);
    if (reason.length < 6) {
      const stripped = item.title.replace(new RegExp(`^\\s*${escapeRegExp(name)}\\s*·\\s*`), '');
      reason = oneLine(stripped, 50);
    }
    rows.push({
      caseId: item.caseId,
      name,
      stageOrProblem,
      reason: reason || '按今日优先级先推进这一件。',
    });
    if (rows.length >= 3) {
      break;
    }
  }

  return rows;
}

function TodayNewsSummaryPanel({
  items,
  onOpenMarket,
}: {
  items: Array<{ title: string; impact: string }>;
  onOpenMarket: () => void;
}) {
  return (
    <section className="seller-panel overflow-hidden">
      <div className="border-b border-[var(--seller-border)] px-4 py-2.5">
        <div className="seller-label">今日新闻摘要</div>
      </div>
      <div className="px-4 py-3">
        {items.length === 0 ? (
          <p className="text-[11px] leading-5 text-[var(--seller-muted)]">
            今日外部信号不多，可去市场页看板块、竞品和房源变化。
          </p>
        ) : (
          <ul className="space-y-3">
            {items.map((row, index) => (
              <li key={`${row.title}-${index}`} className="border-b border-[var(--seller-border)] pb-3 last:border-b-0 last:pb-0">
                <div className="text-[12px] font-semibold text-[var(--seller-ink)]">{row.title}</div>
                <p className="mt-1 text-[11px] leading-5 text-[var(--seller-muted)]">{row.impact}</p>
              </li>
            ))}
          </ul>
        )}
        <button
          type="button"
          onClick={onOpenMarket}
          className="seller-button-secondary mt-3 flex w-full items-center justify-center gap-1 rounded-[10px] px-3 py-2 text-[11px]"
        >
          查看市场动态
          <ArrowRight size={12} />
        </button>
      </div>
    </section>
  );
}

function RecommendedFollowListingsPanel({
  rows,
  onOpenCase,
}: {
  rows: Array<{
    caseId: string;
    name: string;
    stageOrProblem: string;
    reason: string;
  }>;
  onOpenCase: (caseId: string) => void;
}) {
  return (
    <section className="seller-panel overflow-hidden">
      <div className="border-b border-[var(--seller-border)] px-4 py-2.5">
        <div className="seller-label">推荐跟进房源</div>
      </div>
      <div className="space-y-2.5 px-4 py-3">
        {rows.length === 0 ? (
          <p className="text-[11px] text-[var(--seller-muted)]">暂无需要跟进的在场房源。</p>
        ) : (
          rows.map((row) => (
            <div
              key={row.caseId}
              className="rounded-[10px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.02)] px-3 py-2.5"
            >
              <div className="text-[13px] font-semibold text-[var(--seller-ink)]">{row.name}</div>
              <p className="mt-0.5 text-[11px] text-[var(--seller-subtle)]">{row.stageOrProblem}</p>
              <p className="mt-1.5 text-[11px] leading-5 text-[var(--seller-muted)]">{row.reason}</p>
              <button
                type="button"
                onClick={() => onOpenCase(row.caseId)}
                className="mt-2 text-[11px] font-medium text-[var(--seller-accent)] hover:underline"
              >
                打开房源
              </button>
            </div>
          ))
        )}
      </div>
    </section>
  );
}

function AgendaPanel({
  arrangement,
  day,
  maxDay,
  energyLabel,
  onOpenCase,
  onExecuteAction,
  onEnterScenarioAction,
  onAddToToday,
  onRemoveFromToday,
  onExecuteTodayItem,
  onUseTool,
}: {
  arrangement: ArrangementProjection;
  day: number;
  maxDay: number;
  energyLabel: string;
  onOpenCase: (caseId?: string) => void;
  onExecuteAction: (actionId: string, caseId: string) => boolean;
  onEnterScenarioAction: (actionId: string, caseId: string) => boolean;
  onAddToToday: (item: ArrangementItemProjection, slot: TodayArrangementSlot) => boolean;
  onRemoveFromToday: (itemId: string) => boolean;
  onExecuteTodayItem: (itemId: string) => boolean;
  onUseTool: (tool: AgendaTool, caseId?: string) => void;
}) {
  const slots: TodayArrangementSlot[] = ['am', 'pm'];
  const [activeAgendaSlot, setActiveAgendaSlot] = useState<TodayArrangementSlot>(
    () => getDefaultAgendaSlot(),
  );
  const activeSlotArrangement = arrangement.slots[activeAgendaSlot];
  const plannedItemKeys = useMemo(
    () => activeSlotArrangement.plannedItems.map((item) => getArrangementItemKey(item)),
    [activeSlotArrangement.plannedItems],
  );
  const plannedItemKeySignature = plannedItemKeys.join('|');
  const [activePlannedItemKey, setActivePlannedItemKey] = useState<string | null>(
    plannedItemKeys[0] || null,
  );

  useEffect(() => {
    setActiveAgendaSlot(getDefaultAgendaSlot());
  }, [day]);

  useEffect(() => {
    setActivePlannedItemKey((current) => (
      current && plannedItemKeys.includes(current)
        ? current
        : plannedItemKeys[0] || null
    ));
  }, [plannedItemKeySignature, plannedItemKeys]);

  const activePlannedItem = activeSlotArrangement.plannedItems.find((item) => getArrangementItemKey(item) === activePlannedItemKey) || null;
  const summary = buildAgendaSummary(arrangement, activeSlotArrangement);

  return (
    <section className="seller-panel overflow-hidden">
      <div className="border-b border-[var(--seller-border)] px-4 py-4">
        <div className="min-w-0">
          <div className="seller-label flex items-center gap-2">
            <Clock3 size={13} />
            今日安排
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="seller-chip">{day}/{maxDay}</span>
            <span className="seller-chip seller-chip-accent">今日精力 {energyLabel}</span>
            <span className="seller-chip">我的安排 {arrangement.plannedEnergy} 小时</span>
            <span className="seller-chip">固定预留 {arrangement.fixedEnergyReserve} 小时</span>
            <span className="seller-chip">可排余量 {arrangement.remainingEnergy} 小时</span>
            <span className="seller-chip seller-chip-accent">
              当前时段：{activeSlotArrangement.label}
            </span>
            {activePlannedItem ? (
              <span className="seller-chip seller-chip-accent">
                当前要做：{getArrangementItemShortTitle(activePlannedItem)}
              </span>
            ) : null}
          </div>
          <p className="mt-2 max-w-[78ch] text-[12px] leading-6 text-[var(--seller-muted)]">
            {summary}
          </p>
        </div>
      </div>

      <div className="border-b border-[var(--seller-border)] px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <div className="seller-label">今天要处理什么</div>
          <span className="text-[10px] font-semibold text-[var(--seller-subtle)]">
            已安排 {arrangement.fixedItems.length + arrangement.plannedItems.length} 件 · 已完成 {arrangement.completedItems.length} 件
          </span>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {slots.map((slot) => {
            const slotArrangement = arrangement.slots[slot];
            const isActive = activeAgendaSlot === slot;
            return (
              <button
                key={slot}
                type="button"
                aria-pressed={isActive}
                onClick={() => setActiveAgendaSlot(slot)}
                className={`rounded-[12px] border px-3 py-2 text-left transition ${
                  isActive
                    ? 'border-[var(--seller-accent)] bg-[var(--seller-accent-soft)] text-[var(--seller-ink)]'
                    : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.025)] text-[var(--seller-muted)] hover:border-[var(--seller-border-strong)] hover:bg-white/[0.04] hover:text-[var(--seller-ink)]'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`seller-chip ${isActive ? 'seller-chip-accent' : ''}`}>{slotArrangement.label}</span>
                  <span className="text-[10px] font-semibold text-[var(--seller-subtle)]">
                    {isActive ? '正在看' : '切换'}
                  </span>
                </div>
                <div className="mt-2 text-[10px] font-semibold text-[var(--seller-subtle)]">
                  我排 {slotArrangement.plannedItems.length} 件 · 推荐 {arrangement.candidateItems.length} 件 · 固定 {slotArrangement.fixedItems.length} 件
                </div>
              </button>
            );
          })}
        </div>
        <div className="mt-3 space-y-3">
          <HalfDayAgendaSection
            slot={activeAgendaSlot}
            arrangement={activeSlotArrangement}
            candidateItems={arrangement.candidateItems}
            onOpenCase={onOpenCase}
            onExecuteAction={onExecuteAction}
            onEnterScenarioAction={onEnterScenarioAction}
            onAddToToday={onAddToToday}
            onRemoveFromToday={onRemoveFromToday}
            onExecuteTodayItem={onExecuteTodayItem}
            onUseTool={onUseTool}
            activePlannedItemKey={activePlannedItemKey}
            onSelectPlannedItem={setActivePlannedItemKey}
          />
        </div>
      </div>
    </section>
  );
}

function ArrangementTitleBlock({
  title,
  displayTitle,
  contextTitle,
  size = 'md',
}: {
  title: string;
  displayTitle?: string;
  contextTitle?: string;
  size?: 'sm' | 'md';
}) {
  const { caseTitle, matterTitle } = splitArrangementTitle(title);
  const visibleTitle = displayTitle || caseTitle;
  const visibleContextTitle = contextTitle || (displayTitle ? caseTitle : '');
  const titleClass = size === 'sm'
    ? 'mt-2 text-[14px] font-semibold text-[var(--seller-ink)]'
    : 'mt-2 text-[16px] font-semibold tracking-[-0.03em] text-[var(--seller-ink)]';
  const matterClass = size === 'sm'
    ? 'seller-chip'
    : 'inline-flex items-center rounded-full border border-[var(--seller-border-strong)] bg-[rgba(255,255,255,0.06)] px-2.5 py-1 text-[11px] font-semibold leading-none text-[var(--seller-ink)]';

  return (
    <div>
      <div className={titleClass}>{visibleTitle}</div>
      {visibleContextTitle ? (
        <div className="mt-1 text-[11px] font-medium leading-5 text-[var(--seller-muted)]">{visibleContextTitle}</div>
      ) : null}
      {matterTitle ? (
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <span className={matterClass}>事项：{matterTitle}</span>
        </div>
      ) : null}
    </div>
  );
}

function splitArrangementTitle(title: string) {
  const [caseTitle, ...matterParts] = title.split(' · ');
  return {
    caseTitle: caseTitle || title,
    matterTitle: matterParts.join(' · '),
  };
}

function getArrangementItemKey(item: ArrangementItemProjection) {
  return item.todayPlanItemId || item.id;
}

function getArrangementItemShortTitle(item: ArrangementItemProjection) {
  return splitArrangementTitle(item.title).caseTitle;
}

function getDefaultAgendaSlot(): TodayArrangementSlot {
  return 'am';
}

function buildAgendaSummary(
  arrangement: ArrangementProjection,
  activeSlot: ArrangementProjection['slots'][TodayArrangementSlot],
) {
  const totalFixed = arrangement.fixedItems.length;
  const totalPlanned = arrangement.plannedItems.length;
  if (totalPlanned > 0) {
    return `今天你主动排了 ${totalPlanned} 件事，系统还放进 ${totalFixed} 个固定/临时事项。当前只看${activeSlot.label}，先处理绿色“当前要做”，再切换时段补其他事。`;
  }
  if (arrangement.candidateItems.length > 0) {
    return `当前有 ${arrangement.candidateItems.length} 件推荐动作。`;
  }
  return `今天有 ${totalFixed} 个系统固定/临时事项。先按上午/下午切换查看，不需要把两个时段同时摊开处理。`;
}

function presentFixedStatusLabel(label: string) {
  return label === '已排进今天' ? '系统排入今天' : label;
}

function presentFixedSourceLabel(label: string) {
  return label === '已安排' ? '系统事项' : label;
}

function presentPlannedStatusLabel(label: string) {
  return label === '已排进今天' ? '已加入今天' : label;
}

function FixedArrangementCard({
  item,
  onOpenCase,
  onExecuteAction,
  onEnterScenarioAction,
}: {
  item: ArrangementItemProjection;
  onOpenCase: (caseId?: string) => void;
  onExecuteAction: (actionId: string, caseId: string) => boolean;
  onEnterScenarioAction: (actionId: string, caseId: string) => boolean;
}) {
  const canEnterAction = Boolean(item.actionId && item.caseId);
  const actionLabel = item.actionId ? item.ctaLabel : '看房源';
  return (
    <div className={`rounded-[12px] border px-3.5 py-3 ${item.tone === 'risk' ? 'border-[color:var(--seller-risk)]/24 bg-[var(--seller-risk-soft)]' : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)]'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="seller-chip">固定事项</span>
        <span className="seller-chip">{item.slot === 'pm' ? '下午' : '上午'}</span>
        <span className="text-[10px] font-semibold text-[var(--seller-subtle)]">{presentFixedSourceLabel(item.label)}</span>
        <span className="text-[10px] font-semibold text-[var(--seller-subtle)]">{presentFixedStatusLabel(item.statusLabel)}</span>
        <span className="text-[10px] font-semibold text-[var(--seller-subtle)]">占 {item.durationHours} 小时 · {item.energyCost} 精力</span>
      </div>
      <ArrangementTitleBlock title={item.title} displayTitle={item.displayTitle} contextTitle={item.contextTitle} size="sm" />
      <p className="mt-1 text-[11px] leading-5 text-[var(--seller-muted)]">{item.detail}</p>
      {item.conflictHint ? (
        <p className={`mt-2 text-[11px] leading-5 ${item.conflictHint.level === 'warning' ? 'text-[var(--seller-risk)]' : 'text-[var(--seller-muted)]'}`}>
          {item.conflictHint.message}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {canEnterAction ? (
          <button
            type="button"
            onClick={() => {
              const didEnterScene = onEnterScenarioAction(item.actionId!, item.caseId!);
              if (didEnterScene) {
                return;
              }
              onExecuteAction(item.actionId!, item.caseId!);
            }}
            className="seller-button-primary rounded-[10px] px-3 py-2 text-[11px]"
          >
            {actionLabel}
          </button>
        ) : null}
        {item.caseId ? (
          <button
            type="button"
            onClick={() => onOpenCase(item.caseId)}
            className="seller-button-secondary rounded-[10px] px-3 py-2 text-[11px]"
          >
            看房源
          </button>
        ) : null}
      </div>
    </div>
  );
}

function HalfDayAgendaSection({
  slot,
  arrangement,
  candidateItems,
  onOpenCase,
  onExecuteAction,
  onEnterScenarioAction,
  onAddToToday,
  onRemoveFromToday,
  onExecuteTodayItem,
  onUseTool,
  activePlannedItemKey,
  onSelectPlannedItem,
}: {
  slot: TodayArrangementSlot;
  arrangement: ArrangementProjection['slots'][TodayArrangementSlot];
  candidateItems: ArrangementItemProjection[];
  onOpenCase: (caseId?: string) => void;
  onExecuteAction: (actionId: string, caseId: string) => boolean;
  onEnterScenarioAction: (actionId: string, caseId: string) => boolean;
  onAddToToday: (item: ArrangementItemProjection, slot: TodayArrangementSlot) => boolean;
  onRemoveFromToday: (itemId: string) => boolean;
  onExecuteTodayItem: (itemId: string) => boolean;
  onUseTool: (tool: AgendaTool, caseId?: string) => void;
  activePlannedItemKey: string | null;
  onSelectPlannedItem: (itemKey: string) => void;
}) {
  const hasAnyItems = arrangement.plannedItems.length > 0
    || candidateItems.length > 0
    || arrangement.fixedItems.length > 0
    || arrangement.completedItems.length > 0;

  return (
    <div
      className="rounded-[14px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.02)] px-3.5 py-3.5"
      data-seller-agenda-slot={slot}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`seller-chip ${slot === 'am' ? 'seller-chip-accent' : ''}`}>{arrangement.label}</span>
        </div>
        <span className="text-[10px] font-semibold text-[var(--seller-subtle)]">
          我排 {arrangement.plannedItems.length} 件 · 推荐 {candidateItems.length} 件 · 固定 {arrangement.fixedItems.length} 件
        </span>
      </div>

      <div className="mt-3 space-y-3">
        {arrangement.fixedItems.length > 0 && (
          <AgendaGroup title="固定/临时事项" helper="系统已经排进今天；先处理固定，再补自选动作。">
            {arrangement.fixedItems.map((item) => (
              <React.Fragment key={item.id}>
                <FixedArrangementCard
                  item={item}
                  onOpenCase={onOpenCase}
                  onExecuteAction={onExecuteAction}
                  onEnterScenarioAction={onEnterScenarioAction}
                />
              </React.Fragment>
            ))}
          </AgendaGroup>
        )}

        {arrangement.plannedItems.length > 0 && (
          <AgendaGroup
            title="我排的动作"
            helper={arrangement.plannedItems.length > 1
              ? '点击卡片或“切到这件”切换当前日程。'
              : '当前日程可直接进入情景处理。'}
          >
            {arrangement.plannedItems.map((item) => (
              <React.Fragment key={item.id}>
                <PlannedArrangementCard
                  item={item}
                  isActive={getArrangementItemKey(item) === activePlannedItemKey}
                  onOpenCase={onOpenCase}
                  onExecuteTodayItem={onExecuteTodayItem}
                  onRemoveFromToday={onRemoveFromToday}
                  onSelect={() => onSelectPlannedItem(getArrangementItemKey(item))}
                />
              </React.Fragment>
            ))}
          </AgendaGroup>
        )}

        {candidateItems.length > 0 && (
          <AgendaGroup title="推荐动作排行" helper="每套房取当前最推荐的一件事；可加入哪个时段看按钮，排不下会禁用。">
            {candidateItems.map((item, index) => (
              <React.Fragment key={item.id}>
                <AgendaItemRow
                  item={item}
                  index={index}
                  slot={slot}
                  onOpenCase={onOpenCase}
                  onAddToToday={onAddToToday}
                />
              </React.Fragment>
            ))}
          </AgendaGroup>
        )}

        {arrangement.completedItems.length > 0 && (
          <AgendaGroup title="已处理" helper="今天已经完成的动作会留在这里。">
            {arrangement.completedItems.map((item) => (
              <React.Fragment key={item.id}>
                <CompletedArrangementCard item={item} onOpenCase={onOpenCase} />
              </React.Fragment>
            ))}
          </AgendaGroup>
        )}

        {!hasAnyItems && (
          <div className="seller-empty px-4 py-5 text-center text-[12px]">
            {arrangement.label}暂时没有要处理的事，可以先看另一时段或进入房源页。
          </div>
        )}
      </div>
    </div>
  );
}

function AgendaGroup({
  title,
  helper,
  children,
}: {
  title: string;
  helper: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.025)] px-3 py-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="seller-label">{title}</div>
        <div className="text-[10px] font-medium text-[var(--seller-subtle)]">{helper}</div>
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function AgendaItemRow({
  item,
  index,
  slot,
  onOpenCase,
  onAddToToday,
}: {
  item: ArrangementItemProjection;
  index: number;
  slot: TodayArrangementSlot;
  onOpenCase: (caseId?: string) => void;
  onAddToToday: (item: ArrangementItemProjection, slot: TodayArrangementSlot) => boolean;
}) {
  const [isHovered, setIsHovered] = useState(false);
  return (
    <article
      className="grid gap-3 py-4 md:grid-cols-[72px_minmax(0,1fr)_auto] md:items-start transition-all rounded-lg hover:bg-[rgba(255,255,255,0.02)]"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="pt-0.5">
        <div className={`inline-flex rounded-[10px] px-2.5 py-1 text-[11px] font-semibold ${
          index === 0
            ? 'bg-[var(--seller-accent)] text-[var(--seller-bg)]'
            : 'bg-[rgba(255,255,255,0.06)] text-[var(--seller-muted)]'
        }`}>
          {item.rank ?? index + 1}
        </div>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          {index === 0 && <span className="seller-chip seller-chip-accent">优先</span>}
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${toneChipClass(item.tone)}`}>
            {item.label}
          </span>
          <span className={`text-[10px] font-medium transition-colors ${isHovered && item.energyCost > 0 ? 'text-[var(--seller-ink)] font-bold' : 'text-[var(--seller-subtle)]'}`}>
            占 {item.durationHours} 小时 · {item.energyCost} 精力
          </span>
          <span className="text-[10px] font-medium text-[var(--seller-subtle)]">{item.statusLabel}</span>
        </div>
        <ArrangementTitleBlock title={item.title} displayTitle={item.displayTitle} contextTitle={item.contextTitle} />
        {item.conflictHint ? (
          <p className={`mt-2 max-w-[72ch] text-[11px] leading-5 ${item.conflictHint.level === 'warning' ? 'text-[var(--seller-risk)]' : 'text-[var(--seller-muted)]'}`}>
            {item.conflictHint.message}
          </p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-start justify-start md:justify-end">
        <div className="flex flex-wrap gap-2 md:flex-col">
          {item.actionId ? (
            <button
              type="button"
              onClick={() => onAddToToday(item, item.slot || slot)}
              disabled={item.isDisabled}
              className={`inline-flex items-center gap-1 rounded-[10px] px-3 py-2 text-[11px] font-semibold ${
                index === 0
                  ? 'seller-button-primary'
                  : 'seller-button-secondary'
              } disabled:opacity-50`}
              title={item.disabledReason}
            >
              {item.ctaLabel}
              <ArrowRight size={12} />
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onOpenCase(item.caseId)}
            className="seller-button-secondary inline-flex items-center gap-1 rounded-[10px] px-3 py-2 text-[11px] font-semibold"
          >
            看房源
            <ArrowRight size={12} />
          </button>
          {item.isDisabled && item.disabledReason ? (
            <p className="max-w-[220px] text-[11px] leading-5 text-[var(--seller-risk)]">
              {item.disabledReason}
            </p>
          ) : null}
        </div>
      </div>
    </article>
  );
}

function PlannedArrangementCard({
  item,
  isActive,
  onOpenCase,
  onExecuteTodayItem,
  onRemoveFromToday,
  onSelect,
}: {
  item: ArrangementItemProjection;
  isActive: boolean;
  onOpenCase: (caseId?: string) => void;
  onExecuteTodayItem: (itemId: string) => boolean;
  onRemoveFromToday: (itemId: string) => boolean;
  onSelect: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const isWaiting = item.disabledReason?.includes('等待');
  const isUrgent = isActive && !item.isDisabled && !isWaiting;

  return (
    <div
      aria-current={isActive ? 'true' : undefined}
      role={isActive ? undefined : 'button'}
      tabIndex={isActive ? undefined : 0}
      onClick={isActive ? undefined : onSelect}
      onKeyDown={(event) => {
        if (isActive || (event.key !== 'Enter' && event.key !== ' ')) {
          return;
        }
        event.preventDefault();
        onSelect();
      }}
      className={`relative rounded-[12px] border px-3.5 py-3 transition-all ${
        isWaiting ? 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.01)] opacity-70 grayscale-[30%]' :
        isUrgent ? 'border-[var(--seller-accent)] bg-[var(--seller-accent-soft)] shadow-[0_0_15px_rgba(40,120,240,0.15)]' :
        'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)]'
      } ${isActive ? 'cursor-default' : 'cursor-pointer hover:border-[var(--seller-border-strong)] hover:bg-white/[0.04]'}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      {isUrgent && (
        <div className="absolute -top-1 -right-1 flex h-3 w-3">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-3 w-3 bg-blue-500"></span>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-2">
        {isActive ? <span className="seller-chip seller-chip-accent">当前要做</span> : <span className="seller-chip">待处理</span>}
        <span className="seller-chip">{item.slot === 'pm' ? '下午' : '上午'}</span>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${toneChipClass(item.tone)}`}>
          {item.executionMode === 'scenario' ? '情景' : '直接处理'}
        </span>
        {isWaiting && (
          <span className="seller-chip bg-[rgba(255,255,255,0.1)] text-[var(--seller-muted)] animate-pulse">⏳ 等待回复</span>
        )}
        <span className="text-[10px] font-semibold text-[var(--seller-subtle)]">{presentPlannedStatusLabel(item.statusLabel)}</span>
        <span className={`text-[10px] font-semibold transition-colors ${isHovered && item.energyCost > 0 ? 'text-red-400 font-bold' : 'text-[var(--seller-subtle)]'}`}>
          占 {item.durationHours} 小时 · {isHovered && item.energyCost > 0 ? '-' : ''}{item.energyCost} 精力
        </span>
      </div>
      <ArrangementTitleBlock title={item.title} displayTitle={item.displayTitle} contextTitle={item.contextTitle} size="sm" />
      <p className="mt-1 text-[11px] leading-5 text-[var(--seller-muted)]">{item.detail}</p>
      {item.disabledReason ? (
        <p className="mt-2 text-[11px] leading-5 text-[var(--seller-risk)]">{item.disabledReason}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        {isActive ? (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              if (item.todayPlanItemId) {
                onExecuteTodayItem(item.todayPlanItemId);
              }
            }}
            disabled={item.isDisabled || !item.todayPlanItemId}
            className="seller-button-primary rounded-[10px] px-3 py-2 text-[11px] disabled:opacity-50"
            title={item.disabledReason}
          >
            {item.executionMode === 'scenario' ? '进入情景' : '立即处理'}
          </button>
        ) : (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onSelect();
            }}
            className="seller-button-primary rounded-[10px] px-3 py-2 text-[11px]"
          >
            切到这件
          </button>
        )}
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            if (item.todayPlanItemId) {
              onRemoveFromToday(item.todayPlanItemId);
            }
          }}
          disabled={!item.todayPlanItemId}
          className="seller-button-secondary rounded-[10px] px-3 py-2 text-[11px] disabled:opacity-50"
        >
          移出今天
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpenCase(item.caseId);
          }}
          className="seller-button-secondary rounded-[10px] px-3 py-2 text-[11px]"
        >
          看房源
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
        <span className="text-[10px] font-semibold text-[var(--seller-subtle)]">占 {item.durationHours} 小时 · 已消耗 {item.energyCost} 精力</span>
      </div>
      <ArrangementTitleBlock title={item.title} displayTitle={item.displayTitle} contextTitle={item.contextTitle} size="sm" />
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

function CalendarCell({
  entry,
  active,
  onClick,
}: {
  key?: React.Key;
  entry: CalendarRailEntry;
  active: boolean;
  onClick: () => void;
}) {
  const isToday = entry.relation === 'today';
  const relationLabel = isToday
    ? '今天'
    : entry.relation === 'past'
      ? entry.label === '昨天' ? '昨天' : '已过'
      : entry.label === '明天' ? '明天' : '后续';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative min-h-[78px] w-full rounded-[10px] border px-2.5 py-2.5 text-left transition ${
        active
          ? 'border-[var(--seller-accent)] bg-[var(--seller-panel-alt)] text-[var(--seller-ink)]'
        : isToday
            ? 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.04)] text-[var(--seller-ink)]'
            : 'border-[var(--seller-border)] bg-transparent text-[var(--seller-muted)] hover:bg-[rgba(255,255,255,0.04)]'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] font-bold uppercase tracking-[0.12em] opacity-70">D{entry.day}</span>
        <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-bold leading-none ${
          isToday
            ? 'bg-[var(--seller-accent)] text-[var(--seller-bg)]'
            : 'bg-[rgba(255,255,255,0.06)] text-[var(--seller-subtle)]'
        }`}>
          {relationLabel}
        </span>
        <span className={`h-1.5 w-1.5 rounded-full ${toneDotClass(entry.tone)}`} />
      </div>
      <div className="mt-2 truncate text-[12px] font-semibold tracking-[-0.02em]">{entry.label}</div>
      <div className="mt-0.5 truncate text-[10px] leading-4 opacity-80">{entry.title}</div>
      <div className="mt-1 truncate text-[10px] font-medium opacity-75">{entry.meta}</div>
    </button>
  );
}

function SelectedDayPanel({
  entry,
  dateLabel,
  events,
  onBackToday,
  onAdvanceToDay,
  onOpenCase,
}: {
  entry: CalendarRailEntry;
  dateLabel: string;
  events: JournalItem[];
  onBackToday: () => void;
  onAdvanceToDay?: (targetDay: number) => void;
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
            <div className="seller-label">记录</div>
            <div className="mt-3 space-y-2 text-[11px] leading-5 text-[var(--seller-muted)]">
              <p>按上午、下午查看记录。</p>
              <p>看完回到安排区。</p>
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
              <div className="seller-label text-[var(--seller-accent)]">后续</div>
              <h3 className="mt-2 text-[15px] font-semibold tracking-[-0.03em] text-[var(--seller-ink)]">
                DAY {entry.day} · {entry.title}
              </h3>
              <p className="mt-2 text-[12px] leading-6 text-[var(--seller-muted)]">
                {dateLabel}。{entry.detail}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                if (onAdvanceToDay) {
                  onAdvanceToDay(entry.day);
                  return;
                }
                onBackToday();
              }}
              className="seller-button-primary rounded-[10px] px-3 py-2 text-[11px]"
            >
              推进到这天
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
          <div className="seller-label">回看</div>
          <div className="mt-3 space-y-2 text-[11px] leading-5 text-[var(--seller-muted)]">
            <p>{events.length > 0 ? `这天有 ${events.length} 条记录。` : '这天无关键记录。'}</p>
            <p>按上午、下午查看。</p>
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
  windowDays: CalendarWindowDays,
): CalendarRailEntry[] {
  const entries: CalendarRailEntry[] = [];
  const windowStartDay = resolveCalendarWindowStart(state.day, state.maxDay, windowDays);
  const windowEndDay = Math.min(state.maxDay, windowStartDay + windowDays - 1);
  const projectedDays = new Map(dashboard.weekCalendar.map((entry) => [entry.day, entry]));

  for (let day = windowStartDay; day <= windowEndDay; day += 1) {
    const routine = getRoutine(day, WEEKLY_ROUTINE);
    if (day >= state.day) {
      const projected = projectedDays.get(day);
      const isToday = day === state.day;
      entries.push({
        day,
        relation: isToday ? 'today' : 'future',
        label: isToday ? '今天' : day === state.day + 1 ? '明天' : routine.label,
        title: projected?.title || routine.theme,
        detail: projected?.detail || `${routine.label} · ${routine.theme}`,
        meta: isToday
          ? `${dashboard.todayPriority.length} 件事 · ${dashboard.marketBrief.todayCount} 外部变化`
          : `${routine.energy} 精力 · ${futureSignal(projected || { title: routine.theme, energy: routine.energy })}`,
        tone: isToday
          ? (dashboard.marketBrief.riskCount > 0 ? 'risk' : dashboard.marketBrief.chanceCount > 0 ? 'chance' : 'neutral')
          : (projected?.tone || (routine.energy <= 1 ? 'risk' : 'neutral')),
        energy: routine.energy,
      });
      continue;
    }

    const events = journalItems.filter((item) => item.day === day);
    entries.push({
      day,
      relation: 'past',
      label: day === state.day - 1 ? '昨天' : routine.label,
      title: events[0]?.title || routine.theme,
      detail: events[0]?.detail || '这天没有留下会影响今天判断的变化。',
      meta: events.length > 0 ? `${events.length} 条记录` : '无新增',
      tone: deriveEventsTone(events),
    });
  }

  return entries;
}

function resolveCalendarWindowStart(stateDay: number, maxDay: number, windowDays: CalendarWindowDays) {
  const maxStart = Math.max(1, maxDay - windowDays + 1);
  const preferredStart = Math.max(1, stateDay - CALENDAR_PAST_CONTEXT_DAYS[windowDays]);
  return Math.min(preferredStart, maxStart);
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
      { label: '写反馈', target: 'case' },
      { label: '看客户', target: 'customers' },
      { label: '同类对比', target: 'market', marketLayer: 'competition' },
    ];
  }
  if (/竞品|竞争/.test(text)) {
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
    { label: '看房源', target: 'case' },
    { label: '看客户线', target: 'customers' },
    { label: '看市场变化', target: 'market', marketLayer: 'macro' },
  ];
}

function buildFuturePrepPills(entry: CalendarRailEntry) {
  if (entry.title.includes('业主') || entry.detail.includes('业主')) {
    return ['筛反馈房源', '看客户记录', '同类对比'];
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
      badge: '已排',
      title: entry.title,
      detail: entry.meta,
      pills: pills.slice(0, 2),
    },
    {
      slot: 'pm' as const,
      badge: '候选',
      title: futureSignal(entry) === '轻排' ? '下午留机动' : '下午推进',
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
