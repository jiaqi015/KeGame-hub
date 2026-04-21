import React from 'react';
import type { GameState } from '../../domain/models';
import { getPromotionBudget, resolveFormalSoldCount } from '../../domain/runtimeStats';

interface ProfilePanelProps {
  state: GameState;
  currentUserNickname?: string;
}

export function ProfilePanel({ state, currentUserNickname }: ProfilePanelProps) {
  const normalizedNickname = (currentUserNickname || '').trim();
  const playerLabel = !normalizedNickname || normalizedNickname.toLowerCase() === 'preview'
    ? '当前顾问'
    : normalizedNickname;
  const soldCount = resolveFormalSoldCount(state);
  const promotionBudget = getPromotionBudget(state);
  const averageTrust = Math.round(state.metrics.averageTrust);
  const activeOwners = state.cases.filter((entry) => entry.status === 'active').length;
  const activeCustomers = state.customerStates.filter((entry) => entry.status !== 'lost' && entry.status !== 'converted').length;
  const relationCards = state.cases
    .slice(0, 4)
    .map((entry) => ({
      key: entry.id,
      title: entry.ownerName,
      note: `${entry.title} · ${entry.ownerMood}`,
      value: `${entry.trust} 信任`,
    }));
  const recentReviews = state.weeklyReviews.slice(0, 3);

  return (
    <div className="mx-auto max-w-6xl space-y-4" data-selling-houses-page="profile">
      <section className="seller-panel-muted p-4 lg:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="seller-label">我的经营状态</div>
            <h3 className="seller-title mt-2 text-[22px]">{playerLabel}</h3>
            <p className="seller-body mt-2 max-w-2xl text-sm">
              看今天还剩多少精力、场上还有多少房源、客户线厚不厚。
            </p>
          </div>
          <div className="seller-tablet px-4 py-4">
            <div className="seller-label">当前进度</div>
            <div className="mt-2 text-[18px] font-semibold text-[var(--seller-ink)]">Day {state.day} / {state.maxDay}</div>
            <div className="mt-1 text-[12px] text-[var(--seller-subtle)]">{state.runContext.scenarioName}</div>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard eyebrow="今日精力" value={`${state.energy}/${state.maxEnergy}`} note="今天还能做多少事" />
          <MetricCard eyebrow="推广金" value={`${promotionBudget} 点`} note="还能承接多少投放动作" />
          <MetricCard eyebrow="在场房源" value={`${activeOwners} 套`} note="当前还需要守的盘" />
          <MetricCard eyebrow="活跃客户" value={`${activeCustomers} 位`} note="还在推进线上的客户" />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[1.05fr_0.95fr]">
        <section className="seller-panel p-4 lg:p-5">
          <div className="seller-label">关系网络</div>
          <h4 className="mt-2 text-[18px] font-semibold tracking-[-0.03em] text-[var(--seller-ink)]">我现在在守谁、接着谁</h4>
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
            {relationCards.map((entry) => (
              <div key={entry.key} className="seller-tablet px-4 py-4">
                <div className="text-sm font-semibold text-[var(--seller-ink)]">{entry.title}</div>
                <div className="mt-1 text-[12px] text-[var(--seller-subtle)]">{entry.note}</div>
                <div className="seller-chip mt-3 inline-flex">
                  {entry.value}
                </div>
              </div>
            ))}
          </div>
          <div className="seller-note mt-4 px-4 py-4 text-sm leading-6">
            当前平均信任 {averageTrust}。
          </div>
        </section>

        <section className="seller-panel p-4 lg:p-5">
          <div className="seller-label">战绩与复盘</div>
          <h4 className="mt-2 text-[18px] font-semibold tracking-[-0.03em] text-[var(--seller-ink)]">这局记录</h4>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <MetricChip label="已成交" value={`${soldCount} 套`} />
            <MetricChip label="平均信任" value={`${averageTrust}`} />
          </div>
          <div className="mt-5 space-y-3">
            {recentReviews.length > 0 ? recentReviews.map((entry) => (
              <div key={entry.id} className="seller-tablet px-4 py-4">
                <div className="text-sm font-semibold text-[var(--seller-ink)]">{entry.title}</div>
                <div className="seller-body mt-2 text-[12px] leading-6">{entry.note}</div>
              </div>
            )) : (
              <div className="seller-empty px-4 py-10 text-center text-sm">
                这局还没跑出周复盘。
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({
  eyebrow,
  value,
  note,
}: {
  eyebrow: string;
  value: string;
  note: string;
}) {
  return (
    <div className="seller-tablet px-4 py-4">
      <div className="seller-label">{eyebrow}</div>
      <div className="mt-2 text-[18px] font-semibold text-[var(--seller-ink)]">{value}</div>
      <div className="seller-body mt-1 text-[12px] leading-5">{note}</div>
    </div>
  );
}

function MetricChip({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="seller-tablet px-4 py-3">
      <div className="seller-label">{label}</div>
      <div className="mt-1 text-sm font-semibold text-[var(--seller-ink)]">{value}</div>
    </div>
  );
}
