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
    <div className="mx-auto max-w-6xl space-y-4">
      <section className="seller-panel-muted p-4 lg:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="seller-label">我的经营状态</div>
            <h3 className="seller-title mt-2 text-[22px]">{playerLabel}</h3>
            <p className="seller-body mt-2 max-w-2xl text-sm">
              个人视角：今天还剩多少精力、场上还有多少房源、客户线厚不厚、最近留下了什么复盘记录。
            </p>
          </div>
          <div className="seller-tablet px-4 py-4">
            <div className="seller-label">当前进度</div>
            <div className="mt-2 text-[18px] font-semibold text-slate-900">Day {state.day} / {state.maxDay}</div>
            <div className="mt-1 text-[12px] text-slate-500">{state.runContext.scenarioName}</div>
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
          <h4 className="mt-2 text-[18px] font-semibold tracking-[-0.03em] text-slate-900">我现在在守谁、接着谁</h4>
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
            {relationCards.map((entry) => (
              <div key={entry.key} className="rounded-[22px] border border-black/[0.05] bg-slate-50 px-4 py-4">
                <div className="text-sm font-semibold text-slate-900">{entry.title}</div>
                <div className="mt-1 text-[12px] text-slate-500">{entry.note}</div>
                <div className="mt-3 inline-flex rounded-full bg-white px-3 py-1 text-[11px] font-bold text-slate-700">
                  {entry.value}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-[22px] border border-sky-100 bg-sky-50/70 px-4 py-4 text-sm leading-6 text-slate-600">
            当前平均信任 {averageTrust}。先看手上关系够不够稳，后面再拆到业主、客户和同行三条线。
          </div>
        </section>

        <section className="seller-panel p-4 lg:p-5">
          <div className="seller-label">战绩与复盘</div>
          <h4 className="mt-2 text-[18px] font-semibold tracking-[-0.03em] text-slate-900">留下这局沉淀</h4>
          <div className="mt-5 grid grid-cols-2 gap-3">
            <MetricChip label="已成交" value={`${soldCount} 套`} />
            <MetricChip label="平均信任" value={`${averageTrust}`} />
          </div>
          <div className="mt-5 space-y-3">
            {recentReviews.length > 0 ? recentReviews.map((entry) => (
              <div key={entry.id} className="rounded-[20px] border border-black/[0.05] bg-slate-50 px-4 py-4">
                <div className="text-sm font-semibold text-slate-900">{entry.title}</div>
                <div className="mt-2 text-[12px] leading-6 text-slate-600">{entry.note}</div>
              </div>
            )) : (
              <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-400">
                这局还没跑出周复盘，后面推进几天这里就会开始沉淀。
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
    <div className="rounded-[22px] border border-black/[0.05] bg-white px-4 py-4 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{eyebrow}</div>
      <div className="mt-2 text-[18px] font-semibold text-slate-900">{value}</div>
      <div className="mt-1 text-[12px] leading-5 text-slate-500">{note}</div>
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
    <div className="rounded-[18px] border border-black/[0.05] bg-slate-50 px-4 py-3">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="mt-1 text-sm font-semibold text-slate-900">{value}</div>
    </div>
  );
}
