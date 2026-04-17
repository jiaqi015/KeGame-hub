import React from 'react';
import { GameState } from '../../domain/models';
import { formatDate } from '../../domain/utils';
import { TrendingUp, Users, Calendar, Home as HomeIcon, Zap, ShieldAlert } from 'lucide-react';
import { DailyJournal } from '../widgets/DailyJournal';

interface DashboardProps {
  state: GameState;
  onSelectCase: (id: string) => void;
  onSetView: (view: string) => void;
  onAutoExecute: () => void;
}

export function Dashboard({ state, onSelectCase, onSetView, onAutoExecute }: DashboardProps) {
  const { metrics, schedule, priorities, day, maxDay } = state;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Top Summary Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label="综合竞争力" value={metrics.averageTrust} icon={<TrendingUp size={20} />} color="text-emerald-600" />
        <MetricCard label="漏斗健康 (D1)" value={metrics.averageD1} icon={<Users size={20} />} color="text-blue-600" />
        <MetricCard label="业主意愿 (D3)" value={metrics.averageD3} icon={<Zap size={20} />} color="text-amber-600" />
        <MetricCard label="项目进度" value={`${day}/${maxDay} 天`} icon={<Calendar size={20} />} color="text-slate-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-10 items-start">
        {/* Main Column: Daily Journal / Calendar */}
        <section className="bg-white rounded-[32px] border border-black/5 p-8 shadow-sm">
          <DailyJournal state={state} />
        </section>

        {/* Side Column: Actionable Insights */}
        <aside className="space-y-8">
          {/* Priorities Section */}
          <section className="bg-white rounded-[28px] border border-black/5 p-6 shadow-sm flex flex-col">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-sm font-bold flex items-center gap-2 text-slate-400 uppercase tracking-widest">
                <Zap className="text-amber-500" size={16} />
                建议决策
              </h3>
              <button 
                onClick={onAutoExecute}
                disabled={state.energy <= 0 || priorities.length === 0}
                className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-slate-900 text-white hover:scale-105 transition-all disabled:opacity-20 disabled:scale-100 shadow-lg shadow-slate-900/10"
              >
                建议执行
              </button>
            </div>
            <div className="space-y-4">
              {priorities.map((p, i) => (
                <div 
                  key={i} 
                  className="group p-4 rounded-2xl bg-slate-50 border border-transparent hover:border-black/10 transition-all cursor-pointer"
                  onClick={() => {
                    if (p.caseId) {
                      onSelectCase(p.caseId);
                      onSetView('cases');
                    }
                  }}
                >
                  <div className="flex justify-between items-start">
                    <strong className="text-xs font-bold text-slate-800 tracking-tight">{p.title}</strong>
                    <span className="text-[8px] font-bold text-slate-300 uppercase tracking-widest">{p.kind}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 line-clamp-1">{p.detail}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Risk Monitoring Section */}
          <section className="bg-white rounded-[28px] border border-black/5 p-6 shadow-sm">
            <h3 className="text-sm font-bold mb-6 flex items-center gap-2 text-slate-400 uppercase tracking-widest">
              <ShieldAlert className="text-rose-500" size={16} />
              预警监控
            </h3>
            <div className="space-y-3">
              {schedule.map((s) => (
                <div key={s.key} className="flex items-center justify-between p-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/30">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-slate-700">{s.title}</span>
                    <small className="text-[9px] text-slate-400 font-medium">{s.badge}</small>
                  </div>
                  <div className="h-6 w-6 rounded-full bg-rose-50 flex items-center justify-center">
                    <div className="h-1.5 w-1.5 rounded-full bg-rose-500 animate-pulse" />
                  </div>
                </div>
              ))}
              {schedule.length === 0 && (
                <p className="text-slate-400 text-[10px] font-medium text-center py-6 italic">商圈表现稳定，暂无显著风险。</p>
              )}
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) {
  return (
    <div className="bg-white rounded-[28px] border border-black/5 p-6 shadow-sm hover:shadow-md transition-shadow group">
      <div className="flex items-center gap-3 mb-3">
        <div className={`p-2.5 rounded-xl bg-slate-50 ${color} group-hover:scale-110 transition-transform`}>
          {icon}
        </div>
        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.1em]">{label}</span>
      </div>
      <div className="text-2xl font-bold text-slate-900 tracking-tight">{value}</div>
    </div>
  );
}
