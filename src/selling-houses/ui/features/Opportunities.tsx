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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-bold text-slate-900">线索池跟进</h3>
        <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-600 text-xs font-bold">
          {activeOpportunities.length} 个活跃机会
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {activeOpportunities.map(o => {
          const caseItem = state.cases.find(c => c.id === o.caseId);
          const isShadow = o.visibility === 'shadow';

          return (
            <div 
              key={o.id} 
              className={`group bg-white rounded-3xl border p-6 shadow-sm hover:shadow-xl transition-all cursor-pointer ${
                isShadow ? 'border-amber-100 bg-amber-50/10' : 'border-black/5 hover:border-blue-500/20'
              }`}
              onClick={() => {
                onSelectCase(o.caseId);
                onSetView('cases');
              }}
            >
              <div className="flex justify-between items-start mb-4">
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                  isShadow ? 'bg-amber-100 text-amber-600' : 'bg-blue-50 text-blue-600'
                }`}>
                  {isShadow ? <EyeOff size={20} /> : <Users size={20} />}
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-[10px] font-bold px-2 py-1 rounded-lg uppercase tracking-wider ${
                    isShadow ? 'bg-amber-100 text-amber-600' : 'bg-slate-100 text-slate-500'
                  }`}>
                    {isShadow ? '待揭秘' : o.stageLabel}
                  </span>
                  {o.leadSource === 'broker' && (
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">
                      经纪人: {o.brokerName}
                    </span>
                  )}
                </div>
              </div>
              
              <h4 className="text-lg font-bold text-slate-900 mb-1">
                {isShadow ? `影子客 #${o.id.split('-').pop()}` : o.customerName}
              </h4>
              <p className="text-xs text-slate-400 line-clamp-1 mb-4">
                {isShadow ? '该线索由同业提供，底牌暂不可见' : o.profile}
              </p>
              
              <div className="space-y-3 mb-6">
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

              <div className="pt-4 border-t border-black/5 flex items-center justify-between">
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
          <div className="col-span-full py-20 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl flex flex-col items-center justify-center text-slate-400">
            <Info size={40} className="mb-4 opacity-20" />
            <p className="italic">线索池已干涸，请通过投放流量补充。</p>
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
