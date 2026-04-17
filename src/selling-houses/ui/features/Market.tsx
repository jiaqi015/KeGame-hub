import React from 'react';
import { GameState } from '../../domain/models';
import { LineChart, Thermometer, Box, TrendingUp } from 'lucide-react';

interface MarketProps {
  state: GameState;
}

export function Market({ state }: MarketProps) {
  const { markets } = state;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-bold text-slate-900">板块行情分析</h3>
        <p className="text-sm text-slate-400">行情波动基于当日成交活跃度与库存压力自动生成</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {markets.map(m => (
          <div key={m.id} className="bg-white rounded-3xl border border-black/5 p-8 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h4 className="text-xl font-bold text-slate-900">{m.name}</h4>
              <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${m.sentiment > 65 ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-50 text-slate-500'}`}>
                {m.sentiment > 65 ? '情绪回暖' : '情绪平稳'}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-8">
              <MarketStat icon={<Thermometer size={16} className="text-rose-500" />} label="需求热度" value={m.demandHeat} />
              <MarketStat icon={<Box size={16} className="text-blue-500" />} label="供应压力" value={m.supplyPressure} />
              <MarketStat icon={<TrendingUp size={16} className="text-emerald-500" />} label="板块情绪" value={m.sentiment} />
            </div>

            <div className="mt-8 pt-8 border-t border-black/5 flex items-center justify-between text-xs">
              <span className="text-slate-400 font-medium">竞对博弈压力</span>
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-24 bg-slate-100 rounded-full overflow-hidden">
                  <div className="h-full bg-slate-900" style={{ width: `${m.competitivePressure}%` }} />
                </div>
                <span className="font-bold text-slate-800">{m.competitivePressure}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function MarketStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
        {icon} <span>{label}</span>
      </div>
      <div className="text-2xl font-bold text-slate-800 tracking-tight">{Math.round(value)}</div>
    </div>
  );
}
