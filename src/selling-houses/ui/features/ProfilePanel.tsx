import React from 'react';
import type { ClosedDealRecord, DomainEventEntry, GameState } from '../../domain/models';
import { resolveFormalSoldCount } from '../../domain/runtimeStats';

interface ProfilePanelProps {
  state: GameState;
  currentUserNickname?: string;
}

type RecordTone = 'neutral' | 'chance' | 'risk';

export function ProfilePanel({ state }: ProfilePanelProps) {
  const soldCount = resolveFormalSoldCount(state);
  const closedDeals = [...state.closedDeals].sort((left, right) => right.dayIndex - left.dayIndex).slice(0, 4);
  const recentEvents = state.eventStore
    .filter((entry) => entry.kind !== 'journal')
    .slice(-6)
    .reverse();
  const weeklyReviews = state.weeklyReviews.slice(-3).reverse();
  const activeCases = state.cases.filter((entry) => entry.status === 'active').length;
  const lostToRivalCases = state.cases.filter((entry) => entry.status === 'lost_to_rival').length;
  const withdrawnCases = state.cases.filter((entry) => entry.status === 'withdrawn').length;
  const actionCount = state.eventStore.filter((entry) => entry.kind === 'action_executed').length;
  const totalCommission = Math.round(state.auxiliaryStats.commission || state.commission || 0);

  return (
    <div className="mx-auto max-w-6xl" data-selling-houses-page="profile">
      <section className="seller-panel p-4 lg:p-5">
        <div className="flex flex-col gap-3 border-b border-[var(--seller-border)] pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="seller-label">本局记录</div>
            <h3 className="seller-title mt-2 text-[22px]">战绩台账</h3>
          </div>
          <div className="text-[12px] font-semibold text-[var(--seller-subtle)]">
            Day {state.day}/{state.maxDay}
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricChip label="已成交" value={`${soldCount} 套`} tone="chance" />
          <MetricChip label="佣金" value={`${totalCommission} 点`} tone="chance" />
          <MetricChip label="他处成交" value={`${lostToRivalCases} 套`} tone="risk" />
          <MetricChip label="已执行" value={`${actionCount} 次`} tone="neutral" />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
          <RecordSection title="成交台账" count={`${closedDeals.length} 条`}>
            {closedDeals.length > 0 ? (
              <div className="space-y-2.5">
                {closedDeals.map((deal) => (
                  <div key={deal.dealId}>
                    <DealRecordLine deal={deal} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyRecord text="暂无成交记录。" />
            )}
          </RecordSection>

          <RecordSection title="房源结局" count={`${state.cases.length} 套`}>
            <div className="grid grid-cols-2 gap-2">
              <OutcomeTile label="在场" value={`${activeCases} 套`} />
              <OutcomeTile label="已成交" value={`${soldCount} 套`} tone="chance" />
              <OutcomeTile label="他处成交" value={`${lostToRivalCases} 套`} tone="risk" />
              <OutcomeTile label="已核销" value={`${withdrawnCases} 套`} tone="risk" />
            </div>
          </RecordSection>

          <RecordSection title="事件流水" count={`${recentEvents.length} 条`}>
            {recentEvents.length > 0 ? (
              <div className="space-y-2.5">
                {recentEvents.map((event) => (
                  <div key={event.id}>
                    <EventRecordLine event={event} />
                  </div>
                ))}
              </div>
            ) : (
              <EmptyRecord text="暂无事件记录。" />
            )}
          </RecordSection>

          <RecordSection title="周记录" count={`${weeklyReviews.length} 条`}>
            {weeklyReviews.length > 0 ? (
              <div className="space-y-2.5">
                {weeklyReviews.map((entry) => (
                  <div key={entry.id} className="seller-tablet px-4 py-4">
                    <div className="text-sm font-semibold text-[var(--seller-ink)]">{entry.title}</div>
                    <div className="seller-body mt-2 text-[12px] leading-6">{entry.note}</div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyRecord text="暂无周记录。" />
            )}
          </RecordSection>
        </div>
      </section>
    </div>
  );
}

function MetricChip({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: RecordTone;
}) {
  const valueClass = tone === 'chance'
    ? 'text-[var(--seller-accent)]'
    : tone === 'risk'
      ? 'text-[var(--seller-risk)]'
      : 'text-[var(--seller-ink)]';

  return (
    <div className="seller-tablet px-4 py-3">
      <div className="seller-label">{label}</div>
      <div className={`mt-1 text-base font-semibold ${valueClass}`}>{value}</div>
    </div>
  );
}

function RecordSection({
  title,
  count,
  children,
}: {
  title: string;
  count: string;
  children: React.ReactNode;
}) {
  return (
    <section className="seller-panel-muted p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-[15px] font-semibold tracking-[-0.02em] text-[var(--seller-ink)]">{title}</div>
        <span className="seller-chip">{count}</span>
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function DealRecordLine({ deal }: { deal: ClosedDealRecord }) {
  return (
    <div className="seller-tablet px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-[var(--seller-ink)]">{deal.caseTitle || deal.caseId}</div>
          <div className="seller-body mt-1 text-[12px] leading-5">
            Day {deal.dayIndex} · {deal.customerName || deal.customerId}
          </div>
        </div>
        <span className="seller-chip seller-chip-accent">{Math.round(deal.dealPrice)} 万</span>
      </div>
    </div>
  );
}

function EventRecordLine({ event }: { event: DomainEventEntry }) {
  return (
    <div className="seller-tablet px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-[var(--seller-ink)]">{event.title}</div>
          <div className="seller-body mt-1 line-clamp-2 text-[12px] leading-5">{event.detail}</div>
        </div>
        <span className="seller-chip">Day {event.day}</span>
      </div>
    </div>
  );
}

function OutcomeTile({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: RecordTone;
}) {
  const valueClass = tone === 'chance'
    ? 'text-[var(--seller-accent)]'
    : tone === 'risk'
      ? 'text-[var(--seller-risk)]'
      : 'text-[var(--seller-ink)]';

  return (
    <div className="rounded-[16px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
      <div className="seller-label">{label}</div>
      <div className={`mt-1 text-sm font-semibold ${valueClass}`}>{value}</div>
    </div>
  );
}

function EmptyRecord({ text }: { text: string }) {
  return <div className="seller-empty px-4 py-8 text-center text-sm">{text}</div>;
}
