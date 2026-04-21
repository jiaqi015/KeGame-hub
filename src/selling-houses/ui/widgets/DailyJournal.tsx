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
              流水
            </div>
            <h3 className="seller-title mt-1 text-lg">经营流水</h3>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {JOURNAL_SCOPES.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setScope(entry.id)}
                className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] transition-colors ${
                  scope === entry.id
                    ? 'border border-[var(--seller-border-strong)] bg-[var(--seller-ink)] text-[var(--seller-bg)]'
                    : 'border border-[var(--seller-border)] bg-[rgba(255,255,255,0.04)] text-[var(--seller-subtle)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[var(--seller-ink)]'
                }`}
              >
                {entry.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <JournalMetricCard
            icon={<CalendarDays size={15} className="text-[var(--seller-subtle)]" />}
            label="范围"
            value={scope === 'today' ? '今天的变化' : scope === 'selected-case' ? (selectedCase?.title || '当前房源') : '全局时间线'}
            detail={scope === 'today'
              ? '只看今天'
              : scope === 'selected-case'
                ? '只看当前房源'
                : '按时间回看'}
          />
          <JournalMetricCard
            icon={<Newspaper size={15} className="text-[var(--seller-chance)]" />}
            label="今日记录"
            value={`${sourceItems.filter((item) => item.day === state.day).length} 条`}
            detail={selectedCase ? `当前房源：${selectedCase.title}` : '当前未指定房源'}
          />
        </div>
      </div>

      {groupedByDay.length > 0 ? (
        <div className="space-y-4">
          {groupedByDay.map((group) => (
            <section key={group.day} className="seller-panel p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-9 min-w-9 items-center justify-center rounded-full border border-[var(--seller-border)] bg-[rgba(255,255,255,0.08)] text-[12px] font-bold text-[var(--seller-ink)]">
                  {group.day}
                </div>
                <div className="min-w-0">
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--seller-subtle)]">
                    Day {group.day}
                  </div>
                  <div className="text-sm font-semibold text-[var(--seller-ink)]">
                    {group.day === state.day ? '今天的变化' : `第 ${group.day} 天记录`}
                  </div>
                </div>
              </div>

              <div className="mt-4 space-y-3">
                {group.items.map((item) => (
                  <article
                    key={item.id}
                    className={`rounded-[18px] border px-4 py-4 ${toneSurfaceClass(item.tone)}`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-full border border-[var(--seller-border)] bg-[rgba(255,255,255,0.05)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[var(--seller-subtle)]">
                            {describeKind(item.kind)}
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--seller-subtle)]">
                            {item.actor}
                          </span>
                          {item.caseId && onSelectCase && (
                            <button
                              type="button"
                              onClick={() => onSelectCase(item.caseId!)}
                              className="seller-button-secondary rounded-full px-2 py-0.5 text-[10px]"
                            >
                              去房源页
                            </button>
                          )}
                        </div>
                        <div className="mt-2 text-[14px] font-semibold text-[var(--seller-ink)]">{item.title}</div>
                        <p className="mt-1 text-[12px] leading-6 text-[var(--seller-muted)]">{item.detail}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <ToneDot tone={item.tone} />
                        <span className="text-[10px] font-medium text-[var(--seller-subtle)]">{item.date?.split('T')[1]?.slice(0, 5) || `Day ${item.day}`}</span>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="seller-empty px-5 py-12 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full border border-[var(--seller-border)] bg-[rgba(255,255,255,0.05)]">
            <ShieldAlert size={20} className="text-[var(--seller-subtle)]" />
          </div>
          <div className="mt-3 text-sm font-semibold text-[var(--seller-ink)]">这一段还没有记录</div>
          <p className="mt-1 text-[12px] leading-6 text-[var(--seller-muted)]">
            先推进一天、做一个动作，或切一套房回来再看。
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
    ? 'bg-[var(--seller-risk)]'
    : tone === 'success'
      ? 'bg-[var(--seller-chance)]'
      : 'bg-[var(--seller-accent)]';

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
    <div className="seller-fact-row rounded-[18px] px-4 py-4 shadow-sm">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--seller-subtle)]">
        {icon}
        {label}
      </div>
      <div className="mt-2 text-[15px] font-semibold text-[var(--seller-ink)]">{value}</div>
      <p className="mt-1 text-[12px] leading-6 text-[var(--seller-muted)]">{detail}</p>
    </div>
  );
}

function toneSurfaceClass(tone: Tone) {
  if (tone === 'danger') {
    return 'border-[color:var(--seller-risk)]/20 bg-[var(--seller-risk-soft)]';
  }

  if (tone === 'success') {
    return 'border-[color:var(--seller-chance)]/20 bg-[var(--seller-chance-soft)]';
  }

  return 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)]';
}
