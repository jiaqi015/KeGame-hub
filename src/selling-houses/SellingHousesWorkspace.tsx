import React, { Suspense, lazy, useMemo, useState } from 'react';
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  FastForward,
  History,
  Home,
  LayoutDashboard,
  LineChart,
  MessageSquare,
  RefreshCw,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { useGame } from './application/useGame';
import { WEEKLY_ROUTINE } from './domain/constants';
import { getDayOfWeek, getRoutine } from './domain/utils';

const Dashboard = lazy(() => import('./ui/features/Dashboard').then((module) => ({ default: module.Dashboard })));
const Cases = lazy(() => import('./ui/features/Cases').then((module) => ({ default: module.Cases })));
const Opportunities = lazy(() => import('./ui/features/Opportunities').then((module) => ({ default: module.Opportunities })));
const Market = lazy(() => import('./ui/features/Market').then((module) => ({ default: module.Market })));
const Review = lazy(() => import('./ui/features/Review').then((module) => ({ default: module.Review })));
const ResultOverlay = lazy(() => import('./ui/features/ResultOverlay').then((module) => ({ default: module.ResultOverlay })));
const DailySummaryOverlay = lazy(() => import('./ui/features/DailySummaryOverlay').then((module) => ({ default: module.DailySummaryOverlay })));
const ScenarioSetup = lazy(() => import('./ui/features/ScenarioSetup').then((module) => ({ default: module.ScenarioSetup })));

export function SellingHousesWorkspace({ activationKey }: { activationKey: string }) {
  const {
    phase,
    state,
    difficultyOptions,
    featuredScenarios,
    lastDifficulty,
    starting,
    startFeaturedRun,
    startRandomGeneratedRun,
    handleSelectCase,
    handleAdvanceDays,
    handleExecuteAction,
    handleReset,
    handleClearReport,
  } = useGame(activationKey);

  const [activeView, setActiveView] = useState('dashboard');
  const [isNavCollapsed, setIsNavCollapsed] = useState(false);
  const [isBudgetPanelOpen, setIsBudgetPanelOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const viewFallback = useMemo(() => <WorkspacePanelSkeleton />, []);
  const overlayFallback = useMemo(() => <WorkspaceOverlaySkeleton />, []);

  if (phase === 'loading') {
    return (
      <div className="flex h-full items-center justify-center bg-slate-50">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-slate-200" />
          <div className="h-4 w-32 rounded bg-slate-100" />
        </div>
      </div>
    );
  }

  if (phase === 'setup' || !state) {
    return (
      <div className="flex h-full flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.12),transparent_36%),linear-gradient(180deg,#fff8ef,#ffffff)] text-slate-900">
        <Suspense fallback={viewFallback}>
          <ScenarioSetup
            difficultyOptions={difficultyOptions}
            featuredScenarios={featuredScenarios}
            lastDifficulty={lastDifficulty}
            starting={starting}
            onStartFeatured={startFeaturedRun}
            onStartRandom={startRandomGeneratedRun}
          />
        </Suspense>
      </div>
    );
  }

  const displayMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  };

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return (
          <Dashboard
            state={state}
            onSelectCase={handleSelectCase}
            onSetView={setActiveView}
          />
        );
      case 'cases':
        return (
          <Cases
            state={state}
            onSelectCase={handleSelectCase}
            onExecuteAction={(id, item, opt) => handleExecuteAction(id, item, opt, displayMessage)}
          />
        );
      case 'opportunities':
        return <Opportunities state={state} onSelectCase={handleSelectCase} onSetView={setActiveView} />;
      case 'market':
        return <Market state={state} />;
      case 'review':
        return <Review state={state} />;
      default:
        return (
          <Dashboard
            state={state}
            onSelectCase={handleSelectCase}
            onSetView={setActiveView}
          />
        );
    }
  };

  const routine = getRoutine(state.day, WEEKLY_ROUTINE);
  const dow = getDayOfWeek(state.day);
  const recentBudgetEntries = state.budgetLedger.slice(0, 8);
  const weeklyBudgetIncome = state.budgetLedger
    .filter((entry) => entry.kind === 'weekly-allocation')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const saleBudgetIncome = state.budgetLedger
    .filter((entry) => entry.kind === 'sale-rebate')
    .reduce((sum, entry) => sum + entry.amount, 0);
  const budgetSpend = Math.abs(state.budgetLedger
    .filter((entry) => entry.amount < 0)
    .reduce((sum, entry) => sum + entry.amount, 0));
  const budgetHealthText = state.cash <= Math.max(4, state.rules.weeklyBudgetAllowance)
    ? '余额偏紧，后续动作要更聚焦到重点盘。'
    : state.cash >= state.rules.weeklyBudgetAllowance * 3
      ? '结余比较健康，还有继续做经营动作的空间。'
      : '余额还在可控区间，保持按优先级使用即可。';
  const commissionDisplay = Number.isInteger(state.commission) ? `${state.commission}` : state.commission.toFixed(1);

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[linear-gradient(180deg,rgba(255,251,235,0.4),rgba(255,255,255,1))] font-sans text-slate-900">
      <header className="shrink-0 border-b border-black/5 bg-white/80 px-6 py-4 backdrop-blur-xl">
        <div className="flex items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-[18px] bg-[#8B5A2B] text-white shadow-[0_14px_24px_rgba(139,90,43,0.16)]">
              <Home size={18} />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="text-[11px] font-bold uppercase tracking-[0.18em] text-amber-700">
                  {state.runContext.scenarioSnapshot.scenario.theme}
                </div>
                <div className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-700">
                  <Calendar size={10} />
                  {routine.label} · {routine.theme}
                </div>
                <div className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500">
                  {state.runContext.difficultyId}
                </div>
              </div>
              <h2 className="text-lg font-semibold tracking-[-0.03em] text-slate-900">{state.runContext.scenarioName}</h2>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-3 rounded-[24px] border border-black/5 bg-white/90 p-2 shadow-sm">
              <button
                type="button"
                onClick={() => setIsBudgetPanelOpen(true)}
                className="min-w-[168px] rounded-[18px] border border-transparent bg-transparent px-3 py-2 text-left transition-all hover:border-black/5 hover:bg-slate-50"
                aria-label="查看推广金详情"
                title="查看推广金详情"
              >
                <ResourceTile
                  icon={<Wallet size={16} />}
                  label="推广金"
                  value={`${state.cash} 点`}
                  color="text-slate-900"
                  trailing={(
                    <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400">
                      <span>明细</span>
                      <ChevronRight size={14} />
                    </div>
                  )}
                />
              </button>
              <div className="h-10 w-px bg-slate-100" />
              <div className="min-w-[132px] rounded-[18px] px-3 py-2">
                <ResourceTile icon={<CircleDollarSign size={16} />} label="佣金" value={`${commissionDisplay} 点`} color="text-emerald-700" />
              </div>
              <div className="h-10 w-px bg-slate-100" />
              <div className="min-w-[124px] rounded-[18px] px-3 py-2">
                <ResourceTile icon={<Zap size={16} />} label="精力" value={`${state.energy}/${state.maxEnergy}`} color="text-amber-600" />
              </div>
            </div>
            <div className="h-6 w-px bg-slate-200" />
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleAdvanceDays(7, displayMessage)}
                disabled={state.gameOver}
                className="flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-900 transition-all hover:bg-slate-200 disabled:opacity-50"
              >
                <FastForward size={16} />
                <span>推进一周</span>
              </button>
              <button
                onClick={() => handleAdvanceDays(1, displayMessage)}
                disabled={state.gameOver}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white shadow-lg shadow-slate-900/10 transition-all hover:scale-105 disabled:scale-100 disabled:opacity-50"
              >
                结束今日
              </button>
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <nav
          className={`relative shrink-0 border-r border-black/5 bg-white/80 p-4 backdrop-blur-xl transition-all duration-200 ${
            isNavCollapsed ? 'w-20' : 'w-20 lg:w-64'
          }`}
        >
          <button
            type="button"
            onClick={() => setIsNavCollapsed((value) => !value)}
            className="absolute right-0 top-5 z-20 translate-x-1/2 rounded-xl border border-black/5 bg-white p-2 text-slate-600 shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition-all hover:border-black/10 hover:bg-slate-50 hover:text-slate-900"
            aria-expanded={!isNavCollapsed}
            aria-label={isNavCollapsed ? '展开左侧列表' : '收起左侧列表'}
            title={isNavCollapsed ? '展开左侧列表' : '收起左侧列表'}
          >
            {isNavCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
          <div className="flex h-full flex-col space-y-2">
            <NavItem collapsed={isNavCollapsed} active={activeView === 'dashboard'} onClick={() => setActiveView('dashboard')} icon={<LayoutDashboard size={20} />} label="经营概览" />
            <NavItem collapsed={isNavCollapsed} active={activeView === 'cases'} onClick={() => setActiveView('cases')} icon={<Home size={20} />} label="房源管理" />
            <NavItem collapsed={isNavCollapsed} active={activeView === 'opportunities'} onClick={() => setActiveView('opportunities')} icon={<Users size={20} />} label="准客池" />
            <NavItem collapsed={isNavCollapsed} active={activeView === 'market'} onClick={() => setActiveView('market')} icon={<LineChart size={20} />} label="情报台" />
            <NavItem collapsed={isNavCollapsed} active={activeView === 'review'} onClick={() => setActiveView('review')} icon={<History size={20} />} label="活动" />

            <div className="flex-1" />

            <button
              onClick={handleReset}
              className={`flex w-full items-center rounded-xl p-3 text-sm font-medium text-slate-400 transition-all hover:bg-rose-50 hover:text-rose-500 ${
                isNavCollapsed ? 'justify-center' : 'gap-3'
              }`}
            >
              <RefreshCw size={20} />
              <span className={isNavCollapsed ? 'hidden' : 'hidden lg:inline'}>重新开局</span>
            </button>
          </div>
        </nav>

        <main className="relative flex-1 overflow-y-auto p-8">
          {message && (
            <div className="fixed bottom-10 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-slate-900 px-6 py-3 text-white shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
              <MessageSquare size={18} className="text-emerald-400" />
              <span className="text-sm font-medium">{message}</span>
            </div>
          )}

          <Suspense fallback={viewFallback}>
            {renderView()}
          </Suspense>
        </main>
      </div>

      {state.gameOver && (
        <Suspense fallback={overlayFallback}>
          <ResultOverlay state={state} onRestart={handleReset} />
        </Suspense>
      )}
      {state.currentReport && (
        <Suspense fallback={overlayFallback}>
          <DailySummaryOverlay report={state.currentReport} onContinue={handleClearReport} />
        </Suspense>
      )}

      {isBudgetPanelOpen && (
        <div className="fixed inset-0 z-[90] flex justify-end bg-slate-900/30 backdrop-blur-sm" onClick={() => setIsBudgetPanelOpen(false)}>
          <div
            className="h-full w-full max-w-[560px] overflow-y-auto border-l border-black/5 bg-[linear-gradient(180deg,#fffdf8_0%,#ffffff_28%)] p-7 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div className="max-w-[360px]">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  <CircleDollarSign size={13} className="text-emerald-500" />
                  资源详情
                </div>
                <h3 className="mt-2 text-[28px] font-semibold tracking-tight text-slate-900">推广金</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  这里不只是看余额，也顺手判断这局资源是不是花在了该花的地方。
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsBudgetPanelOpen(false)}
                className="rounded-xl border border-black/5 px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
              >
                关闭
              </button>
            </div>

            <div className="mb-5 rounded-[28px] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-amber-50 px-5 py-5">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">当前余额</div>
                  <div className="mt-2 text-[38px] font-bold tracking-tight text-emerald-950">{state.cash} 点</div>
                  <div className="mt-2 max-w-md text-sm leading-6 text-emerald-800/80">
                    每周固定补给 {state.rules.weeklyBudgetAllowance} 点，成交后再按返投规则补回。{budgetHealthText}
                  </div>
                </div>
                <div className="grid min-w-[220px] grid-cols-3 gap-2">
                  <BudgetMiniStat label="周补给" value={`+${weeklyBudgetIncome}`} tone="emerald" />
                  <BudgetMiniStat label="成交返投" value={`+${saleBudgetIncome}`} tone="sky" />
                  <BudgetMiniStat label="累计投放" value={`-${budgetSpend}`} tone="rose" />
                </div>
              </div>
            </div>

            <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2">
              <div className="rounded-[20px] border border-black/[0.05] bg-white px-4 py-4 shadow-sm">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">规则摘要</div>
                <div className="mt-3 space-y-3 text-sm text-slate-600">
                  <div className="flex items-start justify-between gap-3">
                    <span>周度补给</span>
                    <strong className="text-slate-900">{state.rules.weeklyBudgetAllowance} 点 / 周</strong>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span>最近可看流水</span>
                    <strong className="text-slate-900">{recentBudgetEntries.length} 条</strong>
                  </div>
                  <div className="flex items-start justify-between gap-3">
                    <span>当前模拟日</span>
                    <strong className="text-slate-900">Day {state.day}</strong>
                  </div>
                </div>
              </div>

              <div className="rounded-[20px] border border-amber-100 bg-amber-50/80 px-4 py-4">
                <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">使用建议</div>
                <p className="mt-3 text-sm leading-6 text-amber-900/85">
                  推广金更适合用来放大重点盘、关键窗口和高价值动作，不适合平均摊到所有房源上。
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-end justify-between gap-3 px-1">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">最近流水</div>
                  <p className="mt-1 text-xs text-slate-500">默认展示最近 8 条，先看近因，再决定要不要回看更早记录。</p>
                </div>
                <div className="text-[11px] font-semibold text-slate-400">按时间倒序</div>
              </div>
              {recentBudgetEntries.map((entry) => (
                <div key={entry.id} className="rounded-[18px] border border-black/[0.04] bg-white px-4 py-4 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="text-sm font-semibold text-slate-800">{entry.title}</div>
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                          Day {entry.day}
                        </span>
                      </div>
                      <div className="mt-1.5 text-xs leading-relaxed text-slate-500">{entry.detail}</div>
                    </div>
                    <div className="min-w-[92px] text-right">
                      <div className={`text-base font-bold ${entry.amount >= 0 ? 'text-emerald-600' : 'text-rose-500'}`}>
                        {entry.amount >= 0 ? '+' : ''}{entry.amount}
                      </div>
                      <div className="mt-1 text-[10px] font-medium text-slate-400">余额 {entry.balanceAfter}</div>
                    </div>
                  </div>
                </div>
              ))}
              {recentBudgetEntries.length === 0 && (
                <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
                  暂时还没有推广金流水，先做一笔经营动作再回来看看。
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function NavItem({
  active,
  collapsed,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center rounded-2xl p-4 transition-all ${
        collapsed ? 'justify-center' : 'gap-3'
      } ${
        active
          ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/10'
          : 'text-slate-400 hover:bg-slate-50 hover:text-slate-900'
      }`}
      title={collapsed ? label : undefined}
    >
      {icon}
      <span className={collapsed ? 'hidden' : 'hidden text-left text-sm font-bold lg:inline'}>{label}</span>
    </button>
  );
}

function ResourceTile({
  icon,
  label,
  value,
  color,
  trailing,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <div className="text-slate-300">{icon}</div>
        <div className="flex flex-col leading-none">
          <span className="mb-0.5 text-[10px] font-bold uppercase tracking-tighter text-slate-300">{label}</span>
          <span className={`text-sm font-bold ${color}`}>{value}</span>
        </div>
      </div>
      {trailing}
    </div>
  );
}

function BudgetMiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'emerald' | 'sky' | 'rose';
}) {
  const toneClass = tone === 'emerald'
    ? 'bg-white text-emerald-700'
    : tone === 'sky'
      ? 'bg-white text-sky-700'
      : 'bg-white text-rose-600';

  return (
    <div className={`rounded-2xl px-3 py-3 text-center shadow-sm ${toneClass}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="mt-1 text-base font-bold">{value}</div>
    </div>
  );
}

function WorkspacePanelSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="rounded-[22px] border border-black/5 bg-white p-4 shadow-sm">
            <div className="mb-2.5 h-4 w-24 rounded bg-slate-100" />
            <div className="h-8 w-20 rounded bg-slate-200" />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <div className="rounded-[28px] border border-black/5 bg-white p-5 shadow-sm">
          <div className="h-6 w-40 rounded bg-slate-100" />
          <div className="mt-4 h-52 rounded-[24px] bg-slate-50" />
        </div>
        <div className="space-y-5">
          <div className="rounded-[24px] border border-black/5 bg-white p-5 shadow-sm">
            <div className="h-6 w-32 rounded bg-slate-100" />
            <div className="mt-4 h-40 rounded-[18px] bg-slate-50" />
          </div>
          <div className="rounded-[24px] border border-black/5 bg-white p-5 shadow-sm">
            <div className="h-6 w-28 rounded bg-slate-100" />
            <div className="mt-4 h-32 rounded-[18px] bg-slate-50" />
          </div>
        </div>
      </div>
    </div>
  );
}

function WorkspaceOverlaySkeleton() {
  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/30 backdrop-blur-sm">
      <div className="mx-auto mt-20 max-w-4xl animate-pulse rounded-[36px] bg-white/90 p-10 shadow-2xl">
        <div className="mx-auto h-8 w-56 rounded bg-slate-200" />
        <div className="mx-auto mt-4 h-4 w-96 max-w-full rounded bg-slate-100" />
        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-24 rounded-2xl bg-slate-100" />
          ))}
        </div>
      </div>
    </div>
  );
}
