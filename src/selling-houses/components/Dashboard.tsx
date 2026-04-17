import React from 'react';
import { GameState } from '../core/gameState';
import { formatDate } from '../core/utils';
import { TrendingUp, Users, Calendar, Wallet, Zap, ShieldAlert } from 'lucide-react';

interface DashboardProps {
  state: GameState;
  onSelectCase: (id: string) => void;
  onSetView: (view: string) => void;
  onAutoExecute: () => void;
}

export function Dashboard({ state, onSelectCase, onSetView, onAutoExecute }: DashboardProps) {
  const { metrics, schedule, priorities, currentDate, day, maxDay } = state;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <MetricCard label="活跃房源" value={metrics.activeCaseCount} icon={<Home size={20} />} color="text-emerald-600" />
        <MetricCard label="线索活跃" value={metrics.activeOpportunityCount} icon={<Users size={20} />} color="text-blue-600" />
        <MetricCard label="平均信任" value={metrics.averageTrust} icon={<TrendingUp size={20} />} color="text-amber-600" />
        <MetricCard label="今日日期" value={`${formatDate(currentDate)} (Day ${day}/${maxDay})`} icon={<Calendar size={20} />} color="text-slate-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-white rounded-[24px] border border-black/5 p-6 shadow-sm flex flex-col">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Zap className="text-amber-500" size={20} />
              本日重点
            </h3>
            <button 
              onClick={onAutoExecute}
              disabled={state.energy <= 0 || priorities.length === 0}
              className="text-[10px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-full bg-slate-900 text-white hover:scale-105 transition-all disabled:opacity-20 disabled:scale-100"
            >
              一键执行建议
            </button>
          </div>
          <div className="space-y-4 flex-1">
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
                  <strong className="text-slate-800">{p.title}</strong>
                  <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{p.kind}</span>
                </div>
                <p className="text-sm text-slate-500 mt-1">{p.detail}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-white rounded-[24px] border border-black/5 p-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <ShieldAlert className="text-rose-500" size={20} />
            风险监控
          </h3>
          <div className="space-y-3">
            {schedule.map((s) => (
              <div key={s.key} className="flex items-center justify-between p-3 rounded-xl border border-dashed border-slate-200">
                <div className="flex flex-col">
                  <span className="text-sm font-medium">{s.title}</span>
                  <small className="text-xs text-slate-400">{s.note}</small>
                </div>
                <span className="shrink-0 ml-4 px-2 py-1 rounded-md bg-rose-50 text-rose-600 text-[10px] font-bold">
                  {s.badge}
                </span>
              </div>
            ))}
            {schedule.length === 0 && <p className="text-slate-400 text-sm text-center py-8">目前一切平稳。</p>}
          </div>
        </section>
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon, color }: { label: string; value: string | number; icon: React.ReactNode; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-black/5 p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-2">
        <div className={`p-2 rounded-lg bg-slate-50 ${color}`}>
          {icon}
        </div>
        <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{label}</span>
      </div>
      <div className="text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function Home(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}
