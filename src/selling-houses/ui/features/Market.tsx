import React from 'react';
import { GameState } from '../../domain/models';
import { LineChart, Thermometer, Box, TrendingUp, CalendarRange, Store, Radio, AlertTriangle } from 'lucide-react';

interface MarketProps {
  state: GameState;
}

export function Market({ state }: MarketProps) {
  const { markets } = state;
  const monthIndex = new Date(state.currentDate).getMonth();
  const activeRivals = state.marketShadow?.rivalListings?.filter((entry) => entry.status === 'active') || [];
  const signals = state.marketShadow?.marketSignals || [];
  const dailyEvent = state.marketShadow?.dailyMarketEvent;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[22px] font-bold text-slate-900">商圈动静</h3>
        <p className="text-sm text-slate-400">看今天谁进场、谁抢客、哪个板块变热或变冷</p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <section className="rounded-[24px] border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700">
            <Radio size={15} />
            今天发生了什么
          </div>
          {dailyEvent ? (
            <>
              <h4 className="text-lg font-bold text-slate-900">{dailyEvent.title}</h4>
              <p className="mt-2 text-sm leading-6 text-slate-600">{dailyEvent.message}</p>
              <div className="mt-4 inline-flex rounded-full bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-500 shadow-sm">
                第 {dailyEvent.day} 天
              </div>
            </>
          ) : (
            <p className="text-sm leading-6 text-slate-500">今天没有明显外部冲击，先按当前节奏推进。</p>
          )}
        </section>

        <section className="rounded-[24px] border border-black/5 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
              <Store size={15} />
              别人也在卖
            </div>
            <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold text-slate-500">
              {activeRivals.length} 套在抢客
            </span>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {activeRivals.slice(0, 4).map((listing) => (
              <div key={listing.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-sm font-bold text-slate-800">{listing.title}</div>
                    <div className="mt-1 text-[11px] text-slate-400">{listing.segment} · {listing.district}</div>
                  </div>
                  <div className="text-right text-[11px] font-bold text-rose-600">{Math.round(listing.askPrice)} 万</div>
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-[10px] font-semibold text-slate-500">
                  <span>热度 {Math.round(listing.heat)}</span>
                  <span>抢客 {Math.round(listing.leadSiphonPower)}</span>
                  <span>{listing.daysLeft} 天</span>
                </div>
              </div>
            ))}
            {activeRivals.length === 0 && (
              <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
                暂时没看到强竞品盘。先把自己手里的房源节奏做稳。
              </div>
            )}
          </div>
        </section>
      </div>

      <section className="rounded-[24px] border border-black/5 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">
          <AlertTriangle size={15} />
          潜在机会
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {signals.map((signal) => (
            <div key={signal.id} className="rounded-2xl border border-slate-100 bg-slate-50/70 p-4">
              <div className="flex items-center justify-between gap-3">
                <h4 className="text-sm font-bold text-slate-800">{signal.title}</h4>
                <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-slate-500">{signal.confidence}%</span>
              </div>
              <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{signal.message}</p>
              <div className="mt-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                {signal.district} · {signal.expiresInDays} 天内有效
              </div>
            </div>
          ))}
          {signals.length === 0 && (
            <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-400">
              暂时没有新的客户或业主风声。先维护现有客户池。
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {markets.map(m => (
          <div key={m.id} className="rounded-[22px] border border-black/5 bg-white p-5 shadow-sm">
            <div className="mb-5 flex items-center justify-between">
              <h4 className="text-lg font-bold text-slate-900">{m.name}</h4>
              <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${m.sentiment > 65 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-500'}`}>
                {m.sentiment > 65 ? '情绪回暖' : '情绪平稳'}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <MarketStat icon={<Thermometer size={16} className="text-rose-500" />} label="需求热度" value={m.demandHeat} />
              <MarketStat icon={<Box size={16} className="text-blue-500" />} label="供应压力" value={m.supplyPressure} />
              <MarketStat icon={<TrendingUp size={16} className="text-emerald-500" />} label="板块情绪" value={m.sentiment} />
            </div>

            <div className="mt-5 flex items-center justify-between border-t border-black/5 pt-5 text-xs">
              <span className="text-slate-400 font-medium">别人抢客强度</span>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-24 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-slate-900" style={{ width: `${m.competitivePressure}%` }} />
                </div>
                <span className="font-bold text-slate-800">{m.competitivePressure}</span>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between rounded-xl bg-slate-50 px-3.5 py-3 text-xs">
              <div className="flex items-center gap-2 text-slate-500">
                <CalendarRange size={14} />
                <span>{monthIndex + 1} 月季节因子</span>
              </div>
              <span className="font-bold text-slate-800">
                {formatSeasonality(m.monthlyFactors?.[monthIndex] || 0)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatSeasonality(value: number) {
  if (value > 0) {
    return `+${Math.round(value)}`;
  }
  if (value < 0) {
    return `${Math.round(value)}`;
  }
  return '0';
}

function MarketStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
        {icon} <span>{label}</span>
      </div>
      <div className="text-[22px] font-bold tracking-tight text-slate-800">{Math.round(value)}</div>
    </div>
  );
}
