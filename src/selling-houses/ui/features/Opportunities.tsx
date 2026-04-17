import React from 'react';
import { GameState, Opportunity } from '../../domain/models';
import { Users, Info, ArrowRight, EyeOff, ShieldCheck, UserCheck } from 'lucide-react';

interface OpportunitiesProps {
  state: GameState;
  onSelectCase: (id: string) => void;
  onSetView: (view: string) => void;
}

export function Opportunities({ state, onSelectCase, onSetView }: OpportunitiesProps) {
  const activeOpportunities = state.opportunities.filter(o => o.status === 'active');
  const marketSignals = state.marketShadow?.marketSignals || [];

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h3 className="text-[22px] font-bold text-slate-900">准客池</h3>
        <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-bold">
          {activeOpportunities.length} 个活跃机会
        </span>
      </div>

      {marketSignals.length > 0 && (
        <section className="rounded-[24px] border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-white p-5 shadow-sm">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700">
            <EyeOff size={15} />
            潜在机会
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            {marketSignals.slice(0, 3).map((signal) => (
              <div key={signal.id} className="rounded-2xl border border-white bg-white/80 p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h4 className="text-sm font-bold text-slate-800">{signal.title}</h4>
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">
                    {signal.confidence}%
                  </span>
                </div>
                <p className="mt-2 line-clamp-2 text-xs leading-5 text-slate-500">{signal.message}</p>
                <div className="mt-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  {signal.district} · 信号剩余 {signal.expiresInDays} 天
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {activeOpportunities.map(o => {
          const caseItem = state.cases.find(c => c.id === o.caseId);
          const isShadow = o.visibility === 'shadow';

          return (
            <div 
              key={o.id} 
              className={`group cursor-pointer rounded-[22px] border bg-white p-4 shadow-sm transition-all hover:shadow-lg ${
                isShadow ? 'border-amber-100 bg-amber-50/10' : 'border-black/5 hover:border-blue-500/20'
              }`}
              onClick={() => {
                onSelectCase(o.caseId);
                onSetView('cases');
              }}
            >
              <div className="mb-3.5 flex items-start justify-between">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                  isShadow ? 'bg-amber-100 text-amber-600' : 'bg-blue-50 text-blue-600'
                }`}>
                  {isShadow ? <EyeOff size={20} /> : <Users size={20} />}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider ${
                    isShadow ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {isShadow ? '待确认' : o.stageLabel}
                  </span>
                  {o.leadSource === 'broker' && (
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                      经纪人: {o.brokerName}
                    </span>
                  )}
                </div>
              </div>
              
              <h4 className="mb-1 text-[17px] font-bold text-slate-900">
                {isShadow ? `待确认客户 #${o.id.split('-').pop()}` : o.customerName}
              </h4>
              <p className="mb-3.5 line-clamp-1 text-xs text-slate-400">
                {isShadow ? '别人带来的客户，需求还没摸清' : o.profile}
              </p>
              
              <div className="mb-5 space-y-2.5">
                <ProgressItem 
                  label="购房意向" 
                  val={o.intent} 
                  color={isShadow ? "bg-amber-300" : "bg-blue-500"} 
                  isShadow={isShadow}
                />
                <ProgressItem 
                  label="配置信心" 
                  val={o.confidence} 
                  color={isShadow ? "bg-amber-300" : "bg-indigo-500"} 
                  isShadow={isShadow}
                />
              </div>

              <div className="flex items-center justify-between border-t border-black/5 pt-3.5">
                <div className="flex flex-col">
                  <span className="text-[10px] font-bold text-slate-300 uppercase italic">意向房源</span>
                  <span className="text-xs font-bold text-slate-600">{caseItem?.title || '未知房源'}</span>
                </div>
                <div className={`h-8 w-8 rounded-full flex items-center justify-center transition-colors ${
                  isShadow ? 'bg-amber-100 text-amber-400 group-hover:bg-amber-500 group-hover:text-white' : 'bg-slate-50 text-slate-400 group-hover:bg-blue-500 group-hover:text-white'
                }`}>
                  <ArrowRight size={14} />
                </div>
              </div>
            </div>
          );
        })}
        {activeOpportunities.length === 0 && (
          <div className="col-span-full flex flex-col items-center justify-center rounded-[24px] border-2 border-dashed border-slate-200 bg-slate-50 py-16 text-slate-400">
            <Info size={40} className="mb-4 opacity-20" />
            <p className="italic">准客池暂时见底，当前没有活跃机会。</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressItem({ label, val, color, isShadow }: { label: string; val: number; color: string, isShadow?: boolean }) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase">
        <span>{label}</span>
        {isShadow ? (
          <span className="text-amber-500">?? ~ ??%</span>
        ) : (
          <span>{Math.round(val)}%</span>
        )}
      </div>
      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden relative">
        <div className={`h-full ${color} transition-all duration-500 ${isShadow ? 'blur-[3px] opacity-40' : ''}`} style={{ width: `${val}%` }} />
        {isShadow && (
          <div className="absolute inset-0 flex items-center justify-center">
             <div className="h-px w-full border-t border-dashed border-amber-400/30" />
          </div>
        )}
      </div>
    </div>
  );
}
