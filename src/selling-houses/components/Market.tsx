import React from 'react';
import { GameState } from '../core/gameState';
import { Activity, ArrowUpRight, ArrowDownRight, Radio } from 'lucide-react';

interface MarketProps {
  state: GameState;
}

export function Market({ state }: MarketProps) {
  const { markets, channels } = state;

  return (
    <div className="space-y-10">
      <section>
        <div className="flex items-center gap-2 mb-6">
          <Activity className="text-rose-500" size={20} />
          <h2 className="text-xl font-semibold text-slate-900">板块热力图</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {markets.map(m => (
            <div key={m.id} className="bg-white rounded-[28px] border border-black/5 p-6 shadow-sm">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">{m.name.split('|')[0]}</div>
              <div className="space-y-4">
                <MarketIndicator label="需求热度" val={m.demandHeat} />
                <MarketIndicator label="供应压力" val={m.supplyPressure} />
                <MarketIndicator label="竞争压力" val={m.competitivePressure} />
                <div className="pt-4 mt-4 border-t border-slate-50 flex justify-between items-center">
                  <span className="text-xs font-bold text-slate-400">板块情绪</span>
                  <div className="flex items-center gap-1">
                    <span className={`text-lg font-bold ${m.sentiment > 60 ? 'text-emerald-600' : 'text-slate-600'}`}>{Math.round(m.sentiment)}</span>
                    {m.demandHeat > m.supplyPressure ? <ArrowUpRight size={16} className="text-emerald-500" /> : <ArrowDownRight size={16} className="text-rose-500" />}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center gap-2 mb-6">
          <Radio className="text-blue-500" size={20} />
          <h2 className="text-xl font-semibold text-slate-900">获客渠道质量</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {channels.map(c => (
            <div key={c.id} className="bg-slate-900 rounded-[28px] p-6 text-white h-full flex flex-col justify-between">
              <div>
                <div className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mb-1">{c.id === 'open-day' ? '核心驱动' : '流量入口'}</div>
                <h4 className="text-lg font-semibold">{c.name}</h4>
              </div>
              <div className="mt-8 space-y-4">
                <div>
                  <div className="flex justify-between text-[10px] font-bold uppercase mb-1.5 opacity-60">
                    <span>线索质量</span>
                    <span>{Math.round(c.quality * 100)}%</span>
                  </div>
                  <div className="h-1 w-full bg-white/10 rounded-full">
                    <div className="h-full bg-blue-400" style={{ width: `${c.quality * 100}%` }} />
                  </div>
                </div>
                <div>
                  <div className="flex justify-between text-[10px] font-bold uppercase mb-1.5 opacity-60">
                    <span>可控性</span>
                    <span>{Math.round(c.controllability * 100)}%</span>
                  </div>
                  <div className="h-1 w-full bg-white/10 rounded-full">
                    <div className="h-full bg-emerald-400" style={{ width: `${c.controllability * 100}%` }} />
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function MarketIndicator({ label, val }: { label: string; val: number }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] font-bold uppercase tracking-tight mb-1.5 text-slate-400">
        <span>{label}</span>
        <span className="text-slate-900">{Math.round(val)}</span>
      </div>
      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
        <div 
          className={`h-full ${val > 70 ? 'bg-slate-900' : 'bg-slate-300'} transition-all`} 
          style={{ width: `${val}%` }} 
        />
      </div>
    </div>
  );
}
