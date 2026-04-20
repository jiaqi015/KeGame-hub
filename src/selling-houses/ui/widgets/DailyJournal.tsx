import React, { useMemo, useState } from 'react';
import type { DomainEventEntry, EventLogEntry, GameState, Tone } from '../../domain/models';
import { CalendarDays, History, Newspaper, ShieldAlert, Sparkles, Target } from 'lucide-react';

type JournalScope = 'today' | 'timeline' | 'selected-case';

interface DailyJournalProps {
  state: GameState;
  selectedCaseId?: string | null;
  onSelectCase?: (caseId: string) => void;
}

type JournalItem = {
  id: string;
  day: number;
  title: string;
  detail: string;
  actor: string;
  tone: Tone;
  kind: string;
  caseId?: string;
  date?: string;
};

const JOURNAL_SCOPES: Array<{ id: JournalScope; label: string }> = [
  { id: 'today', label: '今日' },
  { id: 'timeline', label: '全局流水' },
  { id: 'selected-case', label: '当前房源' },
];

export function DailyJournal({ state, selectedCaseId, onSelectCase }: DailyJournalProps) {
  const [scope, setScope] = useState<JournalScope>('today');
  const selectedCase = selectedCaseId ? state.cases.find((entry) => entry.id === selectedCaseId) || null : null;
  const sourceItems = useMemo(() => buildJournalItems(state), [state]);
  const scopedItems = useMemo(
    () => filterJournalItems(sourceItems, scope, state.day, selectedCaseId),
    [scope, sourceItems, state.day, selectedCaseId],
  );
  const groupedByDay = useMemo(() => groupJournalByDay(scopedItems), [scopedItems]);

  return (
    <div className="space-y-4">
      <div className="seller-panel-muted flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="seller-label flex items-center gap-2">
              <History size={14} />
              经营记录
            </div>
            <h3 className="seller-title mt-1 text-lg">今天是怎么走到这里的</h3>
            <p className="seller-body mt-1 text-[12px]">
              这里按时间还原发生过的事。先看发生了什么，再回头判断哪里开始变。
            </p>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {JOURNAL_SCOPES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setScope(entry.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] ${
                  scope === entry.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <JournalMetricCard
            icon={<CalendarDays size={15} className="text-slate-500" />}
            label="当前范围"
            value={scope === 'today' ? '今天的变化' : scope === 'selected-case' ? (selectedCase?.title || '当前房源') : '全局时间线'}
            detail={scope === 'today'
              ? '只看今天已经落账的变化。'
              : scope === 'selected-case'
                ? '只看当前房源被命中的变化。'
                : '从近到远回看整局经营变化。'}
          />
          <JournalMetricCard
            icon={<Newspaper size={15} className="text-sky-600" />}
            label="本日记录"
            value={`${sourceItems.filter((item) => item.day === state.day).length} 条`}
            detail="今天系统已经留下的事实记录。"
          />
          <JournalMetricCard
            icon={<Target size={15} className="text-emerald-600" />}
            label="当前房源"
            value={selectedCase?.title || '暂未指定'}
            detail={selectedCase ? '可切到“当前房源”只看这套盘的变化。' : '先在房源页点进一套房，再回来追这套盘的时间线。'}
          />
        </div>
      </div>

      {groupedByDay.length > 0 ? (
        <div className="space-y-4">
          {groupedByDay.map((group) => (
            <section key={group.day} className="seller-panel p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 min-w-9 items-center justify-center rounded-full bg-slate-900 text-[12px] font-bold text-white">
                  {group.day}
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                    Day {group.day}
                  </div>
                  <div className="text-sm font-semibold text-slate-900">
                    {group.day === state.day ? '今天的经营变化' : `第 ${group.day} 天留下的记录`}
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {group.items.map((item) => (
                  <article
                    key={item.id}
                    className={`rounded-[18px] border px-4 py-4 ${
                      item.tone === 'danger'
                        ? 'border-rose-200 bg-rose-50/70'
                        : item.tone === 'success'
                          ? 'border-emerald-200 bg-emerald-50/70'
                          : 'border-black/[0.05] bg-slate-50/70'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                            {describeKind(item.kind)}
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
                            {item.actor}
                          </span>
                          {item.caseId && onSelectCase && (
                            <button
                              type="button"
                              onClick={() => onSelectCase(item.caseId!)}
                              className="rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white hover:bg-slate-700"
                            >
                              打开房源
                            </button>
                          )}
                        </div>
                        <div className="mt-2 text-[14px] font-semibold text-slate-900">{item.title}</div>
                        <p className="mt-1 text-[12px] leading-6 text-slate-600">{item.detail}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <ToneDot tone={item.tone} />
                        <span className="text-[10px] font-medium text-slate-400">{item.date?.split('T')[1]?.slice(0, 5) || `Day ${item.day}`}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="rounded-[22px] border border-dashed border-slate-200 bg-slate-50 px-5 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white shadow-sm">
            <ShieldAlert size={20} className="text-slate-400" />
          </div>
          <div className="mt-3 text-sm font-semibold text-slate-700">这一段暂时还没有记录</div>
          <p className="mt-1 text-[12px] leading-6 text-slate-500">
            先推进一天、做一个动作或切一套房回来，这里才会开始形成可回看的时间线。
          </p>
        </div>
      )}
    </div>
  );
}

function buildJournalItems(state: GameState): JournalItem[] {
  const eventItems = state.eventStore.map((entry) => ({
    id: `event-${entry.id}`,
    day: entry.day,
    title: entry.title,
    detail: entry.detail,
    actor: entry.actor,
    tone: entry.tone,
    kind: entry.kind,
    caseId: entry.caseId,
    date: entry.date,
  }));

  const fallbackLogItems = state.eventLog
    .filter((entry) => !hasJournalDuplicate(entry, state.eventStore))
    .map((entry, index) => ({
      id: `log-${entry.day}-${index}`,
      day: entry.day,
      title: trimJournalTitle(entry),
      detail: entry.message,
      actor: entry.actor,
      tone: entry.tone,
      kind: 'journal',
      date: entry.date,
    }));

  return [...eventItems, ...fallbackLogItems].sort((left, right) => {
    if (right.day !== left.day) {
      return right.day - left.day;
    }
    return (right.date || '').localeCompare(left.date || '');
  });
}

function filterJournalItems(
  items: JournalItem[],
  scope: JournalScope,
  today: number,
  selectedCaseId?: string | null,
) {
  if (scope === 'today') {
    return items.filter((item) => item.day === today);
  }

  if (scope === 'selected-case') {
    return selectedCaseId ? items.filter((item) => item.caseId === selectedCaseId) : [];
  }

  return items;
}

function groupJournalByDay(items: JournalItem[]) {
  const map = new Map<number, JournalItem[]>();

  items.forEach((item) => {
    const bucket = map.get(item.day) || [];
    bucket.push(item);
    map.set(item.day, bucket);
  });

  return [...map.entries()]
    .sort((left, right) => right[0] - left[0])
    .map(([day, groupItems]) => ({
      day,
      items: groupItems,
    }));
}

function hasJournalDuplicate(entry: EventLogEntry, eventStore: DomainEventEntry[]) {
  return eventStore.some((event) =>
    event.day === entry.day
    && event.actor === entry.actor
    && event.detail === entry.message,
  );
}

function trimJournalTitle(entry: EventLogEntry) {
  const message = entry.message.trim();
  if (message.length <= 24) {
    return message;
  }
  return `${message.slice(0, 24)}...`;
}

function describeKind(kind: string) {
  switch (kind) {
    case 'case_sold':
      return '成交';
    case 'case_withdrawn':
      return '撤盘';
    case 'case_lost_to_rival':
      return '丢盘';
    case 'opportunity_advanced':
      return '推进';
    case 'opportunity_closed':
      return '成交';
    case 'market_event':
      return '市场';
    case 'action_executed':
      return '动作';
    case 'budget_changed':
      return '资源';
    default:
      return '记录';
  }
}

function ToneDot({ tone }: { tone: Tone }) {
  const className = tone === 'danger'
    ? 'bg-rose-500'
    : tone === 'success'
      ? 'bg-emerald-500'
      : 'bg-sky-500';

  return <span className={`inline-flex h-2.5 w-2.5 rounded-full ${className}`} />;
}

function JournalMetricCard({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[18px] border border-black/[0.05] bg-white px-4 py-4 shadow-sm">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-[15px] font-semibold text-slate-900">{value}</div>
      <p className="mt-1 text-[12px] leading-6 text-slate-500">{detail}</p>
    </div>
  );
}
