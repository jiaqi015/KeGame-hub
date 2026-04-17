import React, { useState } from 'react';
import { useGame } from './application/useGame';
import { Dashboard } from './ui/features/Dashboard';
import { Cases } from './ui/features/Cases';
import { Opportunities } from './ui/features/Opportunities';
import { Market } from './ui/features/Market';
import { Review } from './ui/features/Review';
import { ResultOverlay } from './ui/features/ResultOverlay';
import { 
  LayoutDashboard, Home, Users, 
  LineChart, History, FastForward, RefreshCw,
  Wallet, Zap, MessageSquare
} from 'lucide-react';

export function SellingHousesWorkspace() {
  const { 
    state, handleSelectCase, handleAdvanceDays, handleExecuteAction, handleAutoExecute, handleReset 
  } = useGame();

  const [activeView, setActiveView] = useState('dashboard');
  const [autoDecision, setAutoDecision] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!state) return (
    <div className="flex h-full items-center justify-center bg-slate-50">
      <div className="animate-pulse flex flex-col items-center gap-4">
        <div className="h-12 w-12 bg-slate-200 rounded-2xl" />
        <div className="h-4 w-32 bg-slate-100 rounded" />
      </div>
    </div>
  );

  const displayMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  };

  const renderView = () => {
    switch (activeView) {
      case 'dashboard': return (
        <Dashboard 
          state={state} 
          onSelectCase={handleSelectCase} 
          onSetView={setActiveView} 
          onAutoExecute={handleAutoExecute}
        />
      );
      case 'cases': return (
        <Cases 
          state={state} 
          onSelectCase={handleSelectCase} 
          onExecuteAction={(id, item, opt) => handleExecuteAction(id, item, opt, displayMessage)} 
          autoDecision={autoDecision}
          onToggleAutoDecision={() => setAutoDecision(!autoDecision)}
        />
      );
      case 'opportunities': return <Opportunities state={state} onSelectCase={handleSelectCase} onSetView={setActiveView} />;
      case 'market': return <Market state={state} />;
      case 'review': return <Review state={state} />;
      default: return <Dashboard state={state} onSelectCase={handleSelectCase} onSetView={setActiveView} onAutoExecute={handleAutoExecute} />;
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[linear-gradient(180deg,rgba(255,251,235,0.4),rgba(255,255,255,1))] font-sans text-slate-900">
      <header className="shrink-0 border-b border-black/5 bg-white/80 px-6 py-4 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-[#B45309] text-white shadow-[0_14px_28px_rgba(180,83,9,0.18)]">
              <Home size={18} />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">Top Maintainer</div>
              <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-900">我是王牌维护人</h2>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4">
               <StatItem icon={<Wallet size={16} />} label="预算" value={`${state.cash} W`} color="text-slate-900" />
               <StatItem icon={<Zap size={16} />} label="精力" value={`${state.energy}/${state.maxEnergy}`} color="text-amber-600" />
            </div>
            <div className="h-6 w-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <button 
                onClick={() => handleAdvanceDays(1, displayMessage)}
                disabled={state.gameOver}
                className="px-4 py-2 bg-slate-100 text-slate-900 rounded-xl font-bold text-sm hover:bg-slate-200 transition-all disabled:opacity-50"
              >
                结束今日
              </button>
              <button 
                onClick={() => handleAdvanceDays(7, displayMessage)}
                disabled={state.gameOver}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-xl font-bold text-sm hover:scale-105 transition-all disabled:opacity-50 disabled:scale-100 shadow-lg shadow-slate-900/10"
              >
                <FastForward size={16} />
                <span>推进一周</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <nav className="w-20 shrink-0 border-r border-black/5 bg-white/80 p-4 backdrop-blur-xl lg:w-64">
          <div className="flex h-full flex-col space-y-2">
            <NavItem active={activeView === 'dashboard'} onClick={() => setActiveView('dashboard')} icon={<LayoutDashboard size={20} />} label="经营概览" />
            <NavItem active={activeView === 'cases'} onClick={() => setActiveView('cases')} icon={<Home size={20} />} label="房源管理" />
            <NavItem active={activeView === 'opportunities'} onClick={() => setActiveView('opportunities')} icon={<Users size={20} />} label="线索跟进" />
            <NavItem active={activeView === 'market'} onClick={() => setActiveView('market')} icon={<LineChart size={20} />} label="市场研究" />
            <NavItem active={activeView === 'review'} onClick={() => setActiveView('review')} icon={<History size={20} />} label="日志周报" />
            
            <div className="flex-1" />
            
            <button 
              onClick={handleReset}
              className="flex items-center gap-3 w-full p-3 rounded-xl text-slate-400 hover:text-rose-500 hover:bg-rose-50 transition-all text-sm font-medium"
            >
              <RefreshCw size={20} />
              <span className="hidden lg:inline">重新开始</span>
            </button>
          </div>
        </nav>

        <main className="flex-1 overflow-y-auto p-8 relative">
          {message && (
             <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[60] px-6 py-3 bg-slate-900 text-white rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <MessageSquare size={18} className="text-emerald-400" />
                <span className="text-sm font-medium">{message}</span>
             </div>
          )}

          {renderView()}
        </main>
      </div>

      {state.gameOver && <ResultOverlay state={state} onRestart={handleReset} />}
    </div>
  );
}

function NavItem({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button 
      onClick={onClick}
      className={`flex items-center gap-3 w-full p-4 rounded-2xl transition-all ${
        active 
          ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/10' 
          : 'text-slate-400 hover:text-slate-900 hover:bg-slate-50'
      }`}
    >
      {icon}
      <span className="hidden lg:inline font-bold text-sm text-left">{label}</span>
    </button>
  );
}

function StatItem({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="text-slate-300">{icon}</div>
      <div className="flex flex-col leading-none">
        <span className="text-[10px] font-bold text-slate-300 uppercase tracking-tighter mb-0.5">{label}</span>
        <span className={`text-sm font-bold ${color}`}>{value}</span>
      </div>
    </div>
  );
}
