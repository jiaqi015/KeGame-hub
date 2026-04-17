import React from 'react';
import { GameState } from '../core/gameState';
import { getOpportunityPriority } from '../core/utils';
import { User, Target, Zap, Clock } from 'lucide-react';

interface OpportunitiesProps {
  state: GameState;
  onSelectCase: (id: string) => void;
  onSetView: (view: string) => void;
}

export function Opportunities({ state, onSelectCase, onSetView }: OpportunitiesProps) {
  const { opportunities, cases } = state;
  const activeOpportunities = opportunities.filter(o => o.status === 'active');
  
  // Sort by priority (intent + confidence)
  const sortedOpportunities = [...activeOpportunities].sort((a, b) => getOpportunityPriority(b) - getOpportunityPriority(a));

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900 tracking-tight">线索雷达</h2>
          <p className="text-slate-500 text-sm mt-1">全局共有 {activeOpportunities.length} 个活跃机会在跟进中</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {sortedOpportunities.map(o => {
          const caseItem = cases.find(c => c.id === o.caseId);
          return (
            <div 
              key={o.id} 
              className="bg-white rounded-[28px] border border-black/5 p-6 shadow-sm hover:shadow-md transition-shadow cursor-pointer group"
              onClick={() => {
                if (caseItem) {
                  onSelectCase(caseItem.id);
                  onSetView('cases');
                }
              }}
            >
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 group-hover:bg-slate-900 group-hover:text-white transition-colors">
                    <User size={18} />
                  </div>
                  <div>
                    <strong className="block text-slate-900">{o.customerName}</strong>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{o.channelName}</span>
                  </div>
                </div>
                <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded-lg text-[10px] font-bold uppercase">
                  {o.stageLabel}
                </span>
              </div>

              <div className="space-y-4 mb-6">
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-500">对应房源</span>
                  <span className="text-slate-900 font-medium">{caseItem?.title || '未知房源'}</span>
                </div>
                
                <div className="space-y-3">
                  <ProbabilityBar label="购买意向" val={o.intent} color="bg-emerald-500" />
                  <ProbabilityBar label="成交置信" val={o.confidence} color="bg-blue-500" />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-slate-400">
                  <Clock size={12} />
                  <span className="text-[10px] font-bold uppercase tracking-tight">{o.daysLeft} 天后流失</span>
                </div>
                <div className="flex items-center gap-1 text-slate-900 font-bold text-xs group-hover:translate-x-1 transition-transform">
                  查看房源 <Target size={14} />
                </div>
              </div>
            </div>
          );
        })}
        
        {sortedOpportunities.length === 0 && (
          <div className="col-span-full py-24 flex flex-col items-center justify-center bg-slate-50/50 rounded-[32px] border-2 border-dashed border-slate-100 italic text-slate-400">
            <Zap className="mb-4 opacity-20" size={48} />
            <p>目前盘面上没有活跃线索，请在房源页补进流量。</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ProbabilityBar({ label, val, color }: { label: string; val: number; color: string }) {
  return (
    <div>
      <div className="flex justify-between text-[10px] font-bold uppercase tracking-tight mb-1.5">
        <span className="text-slate-400">{label}</span>
        <span className="text-slate-900">{Math.round(val)}%</span>
      </div>
      <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
        <div 
          className={`h-full ${color} transition-all duration-700`} 
          style={{ width: `${val}%` }} 
        />
      </div>
    </div>
  );
}
