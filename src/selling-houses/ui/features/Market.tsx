import React from 'react';
import { GameState } from '../../domain/models';
import { LineChart, Thermometer, Box, TrendingUp, CalendarRange } from 'lucide-react';

interface MarketProps {
  state: GameState;
}

export function Market({ state }: MarketProps) {
  const { markets } = state;
  const monthIndex = new Date(state.currentDate).getMonth();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[22px] font-bold text-slate-900">情报台</h3>
        <p className="text-sm text-slate-400">行情波动同时受世界月份曲线、竞争压力和剧本事件驱动</p>
      </div>

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
              <span className="text-slate-400 font-medium">竞对博弈压力</span>
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
