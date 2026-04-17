import React, { Suspense, lazy, useMemo, useState } from 'react';
import {
  Calendar,
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

type ResourcePanelType = 'budget' | 'commission' | 'energy';

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
  const [activeResourcePanel, setActiveResourcePanel] = useState<ResourcePanelType | null>(null);
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
    ? '余额偏紧，后续高成本动作空间有限。'
    : state.cash >= state.rules.weeklyBudgetAllowance * 3
      ? '结余比较健康，仍有继续投放的空间。'
      : '余额处于中段，后续动作仍可承接。';
  const commissionDisplay = Number.isInteger(state.commission) ? `${state.commission}` : state.commission.toFixed(1);
  const soldCases = [...state.cases]
    .filter((entry) => entry.status === 'sold')
    .sort((left, right) => (right.soldPrice || 0) - (left.soldPrice || 0))
    .slice(0, 6);
  const averageCommission = state.soldCount > 0 ? state.commission / state.soldCount : 0;
  const averageCommissionDisplay = formatPointValue(averageCommission);
  const spentEnergy = Math.max(state.maxEnergy - state.energy, 0);
  const nextRoutine = getRoutine(state.day + 1, WEEKLY_ROUTINE);
  const energyHealthText = state.energy <= 1
    ? '今天可用精力已经接近见底。'
    : state.energy >= Math.max(3, Math.ceil(state.maxEnergy * 0.6))
      ? '当前可用精力仍然充足。'
      : '今天精力已经过半。';
  const energyRhythm = Array.from({ length: 4 }, (_, index) => {
    const absoluteDay = state.day + index;
    const previewRoutine = getRoutine(absoluteDay, WEEKLY_ROUTINE);
    return {
      key: `${absoluteDay}-${index}`,
      label: index === 0 ? '今天' : index === 1 ? '明天' : `+${index}天`,
      routine: previewRoutine,
    };
  });
  const activeResourceMeta = activeResourcePanel === 'budget'
    ? {
      icon: <CircleDollarSign size={13} className="text-emerald-500" />,
      eyebrow: '资源详情',
      title: '推广金',
      description: '这里展示余额、流水和投放结构。',
    }
    : activeResourcePanel === 'commission'
      ? {
        icon: <CircleDollarSign size={13} className="text-emerald-500" />,
        eyebrow: '经营结果',
        title: '佣金',
        description: '这里看本局已经拿到多少佣金，以及主要来自哪些成交。',
      }
      : activeResourcePanel === 'energy'
        ? {
          icon: <Zap size={13} className="text-amber-500" />,
          eyebrow: '日程资源',
          title: '精力',
          description: '这里看今天还能做多少事，以及接下来几天的精力节奏。',
        }
        : null;

  return (
    <div className="flex h-full flex-col overflow-hidden bg-[linear-gradient(180deg,rgba(255,251,235,0.4),rgba(255,255,255,1))] font-sans text-slate-900">
      <header className="shrink-0 border-b border-black/5 bg-white/85 px-5 py-3 backdrop-blur-xl">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-[260px] items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-[16px] bg-[#8B5A2B] text-white shadow-[0_12px_22px_rgba(139,90,43,0.14)]">
                <Home size={17} />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-amber-700">
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
                <h2 className="truncate text-[16px] font-semibold tracking-[-0.03em] text-slate-900">{state.runContext.scenarioName}</h2>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="flex items-center gap-1 rounded-[22px] border border-black/5 bg-white/90 p-1.5 shadow-sm">
                <button
                  type="button"
                  onClick={() => setActiveResourcePanel('budget')}
                  className="min-w-[136px] rounded-[16px] border border-transparent bg-transparent px-2.5 py-2 text-left transition-all hover:border-black/5 hover:bg-slate-50"
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
                <div className="h-9 w-px bg-slate-100" />
                <button
                  type="button"
                  onClick={() => setActiveResourcePanel('commission')}
                  className="min-w-[108px] rounded-[16px] border border-transparent bg-transparent px-2.5 py-2 text-left transition-all hover:border-black/5 hover:bg-slate-50"
                  aria-label="查看佣金详情"
                  title="查看佣金详情"
                >
                  <ResourceTile
                    icon={<CircleDollarSign size={16} />}
                    label="佣金"
                    value={`${commissionDisplay} 点`}
                    color="text-emerald-700"
                    trailing={<ResourceDetailHint />}
                  />
                </button>
                <div className="h-9 w-px bg-slate-100" />
                <button
                  type="button"
                  onClick={() => setActiveResourcePanel('energy')}
                  className="min-w-[96px] rounded-[16px] border border-transparent bg-transparent px-2.5 py-2 text-left transition-all hover:border-black/5 hover:bg-slate-50"
                  aria-label="查看精力详情"
                  title="查看精力详情"
                >
                  <ResourceTile
                    icon={<Zap size={16} />}
                    label="精力"
                    value={`${state.energy}/${state.maxEnergy}`}
                    color="text-amber-600"
                    trailing={<ResourceDetailHint />}
                  />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleAdvanceDays(7, displayMessage)}
                  disabled={state.gameOver}
                  className="flex items-center gap-2 rounded-xl bg-slate-100 px-3.5 py-2 text-[12px] font-bold text-slate-900 transition-all hover:bg-slate-200 disabled:opacity-50"
                >
                  <FastForward size={16} />
                  <span>推进一周</span>
                </button>
                <button
                  onClick={() => handleAdvanceDays(1, displayMessage)}
                  disabled={state.gameOver}
                  className="rounded-xl bg-slate-900 px-3.5 py-2 text-[12px] font-bold text-white shadow-lg shadow-slate-900/10 transition-all hover:scale-105 disabled:scale-100 disabled:opacity-50"
                >
                  结束今日
                </button>
              </div>
            </div>
          </div>

          <nav className="flex gap-1 overflow-x-auto rounded-[18px] border border-black/[0.04] bg-slate-100/80 p-1">
            <NavItem active={activeView === 'dashboard'} onClick={() => setActiveView('dashboard')} icon={<LayoutDashboard size={16} />} label="经营概览" />
            <NavItem active={activeView === 'cases'} onClick={() => setActiveView('cases')} icon={<Home size={16} />} label="房源管理" />
            <NavItem active={activeView === 'opportunities'} onClick={() => setActiveView('opportunities')} icon={<Users size={16} />} label="准客池" />
            <NavItem active={activeView === 'market'} onClick={() => setActiveView('market')} icon={<LineChart size={16} />} label="商圈动静" />
            <NavItem active={activeView === 'review'} onClick={() => setActiveView('review')} icon={<History size={16} />} label="活动" />
          </nav>
        </div>
      </header>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        <main className="relative flex-1 overflow-y-auto p-5">
          {message && (
            <div className="fixed bottom-10 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-slate-900 px-6 py-3 text-white shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
              <MessageSquare size={18} className="text-emerald-400" />
              <span className="text-sm font-medium">{message}</span>
            </div>
          )}

          <button
            onClick={handleReset}
            className="fixed bottom-5 right-6 z-40 flex items-center gap-1.5 rounded-full bg-white/88 px-3 py-2 text-[11px] font-semibold text-slate-400 shadow-sm ring-1 ring-black/5 backdrop-blur transition-all hover:bg-rose-50 hover:text-rose-500"
          >
            <RefreshCw size={14} />
            <span>重开本局</span>
          </button>

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

      {activeResourcePanel && activeResourceMeta && (
        <div className="fixed inset-0 z-[90] flex justify-end bg-slate-900/30 backdrop-blur-sm" onClick={() => setActiveResourcePanel(null)}>
          <div
            className="h-full w-full max-w-[560px] overflow-y-auto border-l border-black/5 bg-[linear-gradient(180deg,#fffdf8_0%,#ffffff_28%)] p-7 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div className="max-w-[360px]">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  {activeResourceMeta.icon}
                  {activeResourceMeta.eyebrow}
                </div>
                <h3 className="mt-2 text-[28px] font-semibold tracking-tight text-slate-900">{activeResourceMeta.title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  {activeResourceMeta.description}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveResourcePanel(null)}
                className="rounded-xl border border-black/5 px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-slate-50 hover:text-slate-900"
              >
                关闭
              </button>
            </div>

            {activeResourcePanel === 'budget' && (
              <>
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
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">资源说明</div>
                    <p className="mt-3 text-sm leading-6 text-amber-900/85">
                      推广金主要消耗在投放、开放日等高成本动作上，流水会直接反映资源投向。
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
              </>
            )}

            {activeResourcePanel === 'commission' && (
              <>
                <div className="mb-5 rounded-[28px] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-sky-50 px-5 py-5">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">累计佣金</div>
                      <div className="mt-2 text-[38px] font-bold tracking-tight text-emerald-950">{commissionDisplay} 点</div>
                      <div className="mt-2 max-w-md text-sm leading-6 text-emerald-800/80">
                        已成交 {state.soldCount} 套，平均每套 {averageCommissionDisplay} 点。佣金更适合拿来看成交质量和结构，不需要天天盯小波动。
                      </div>
                    </div>
                    <div className="grid min-w-[220px] grid-cols-3 gap-2">
                      <BudgetMiniStat label="已成交" value={`${state.soldCount} 套`} tone="emerald" />
                      <BudgetMiniStat label="均佣" value={`${averageCommissionDisplay}`} tone="sky" />
                      <BudgetMiniStat label="撤回" value={`${state.withdrawnCount} 套`} tone="rose" />
                    </div>
                  </div>
                </div>

                <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-[20px] border border-black/[0.05] bg-white px-4 py-4 shadow-sm">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">规则摘要</div>
                    <div className="mt-3 space-y-3 text-sm text-slate-600">
                      <div className="flex items-start justify-between gap-3">
                        <span>计佣规则</span>
                        <strong className="text-slate-900">成交价 1% x 25%</strong>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span>在场房源</span>
                        <strong className="text-slate-900">{state.cases.filter((entry) => entry.status === 'active').length} 套</strong>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span>当前阶段</span>
                        <strong className="text-slate-900">{state.soldCount > 0 ? '已有成交回款' : '仍在累积首单'}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-4 py-4">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">经营判断</div>
                    <p className="mt-3 text-sm leading-6 text-emerald-900/85">
                      如果佣金高但成交套数少，说明你更多在吃大单；如果成交多但佣金偏薄，就要回头看房源结构是不是偏轻。
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-end justify-between gap-3 px-1">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">最近成交</div>
                      <p className="mt-1 text-xs text-slate-500">默认展示最近成交房源，方便快速回看佣金从哪里来。</p>
                    </div>
                    <div className="text-[11px] font-semibold text-slate-400">按成交价倒序</div>
                  </div>
                  {soldCases.map((entry) => {
                    const soldPrice = entry.soldPrice || 0;
                    const commission = Math.round(soldPrice * 0.01 * 0.25 * 10) / 10;

                    return (
                      <div key={entry.id} className="rounded-[18px] border border-black/[0.04] bg-white px-4 py-4 shadow-sm">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <div className="text-sm font-semibold text-slate-800">{entry.title}</div>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                                {entry.community}
                              </span>
                            </div>
                            <div className="mt-1.5 text-xs leading-relaxed text-slate-500">
                              成交价 {soldPrice} 万，业主 {entry.ownerName}，当前已进入成交收口。
                            </div>
                          </div>
                          <div className="min-w-[96px] text-right">
                            <div className="text-base font-bold text-emerald-600">+{formatPointValue(commission)}</div>
                            <div className="mt-1 text-[10px] font-medium text-slate-400">佣金</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {soldCases.length === 0 && (
                    <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
                      这局还没有成交，佣金会在第一套房源收口后开始累计。
                    </div>
                  )}
                </div>
              </>
            )}

            {activeResourcePanel === 'energy' && (
              <>
                <div className="mb-5 rounded-[28px] border border-amber-100 bg-gradient-to-br from-amber-50 via-white to-white px-5 py-5">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">当前精力</div>
                      <div className="mt-2 text-[38px] font-bold tracking-tight text-amber-950">{state.energy}/{state.maxEnergy}</div>
                      <div className="mt-2 max-w-md text-sm leading-6 text-amber-900/80">
                        今天是 {routine.label} · {routine.theme}。{energyHealthText}
                      </div>
                    </div>
                    <div className="grid min-w-[220px] grid-cols-3 gap-2">
                      <BudgetMiniStat label="今日上限" value={`${state.maxEnergy}`} tone="amber" />
                      <BudgetMiniStat label="已用精力" value={`${spentEnergy}`} tone="rose" />
                      <BudgetMiniStat label="明日恢复" value={`${nextRoutine.energy}`} tone="sky" />
                    </div>
                  </div>
                </div>

                <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="rounded-[20px] border border-black/[0.05] bg-white px-4 py-4 shadow-sm">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">规则摘要</div>
                    <div className="mt-3 space-y-3 text-sm text-slate-600">
                      <div className="flex items-start justify-between gap-3">
                        <span>每日恢复</span>
                        <strong className="text-slate-900">开日自动回满</strong>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span>基础上限</span>
                        <strong className="text-slate-900">{state.rules.baseMaxEnergy} 精力</strong>
                      </div>
                      <div className="flex items-start justify-between gap-3">
                        <span>明日主题</span>
                        <strong className="text-slate-900">{nextRoutine.theme}</strong>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[20px] border border-amber-100 bg-amber-50/80 px-4 py-4">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">资源说明</div>
                    <p className="mt-3 text-sm leading-6 text-amber-900/85">
                      精力是每日硬上限，数值只反映今天还能执行多少动作。
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-end justify-between gap-3 px-1">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">接下来几天</div>
                      <p className="mt-1 text-xs text-slate-500">精力不是每天都一样，最好顺着节奏安排高成本动作。</p>
                    </div>
                    <div className="text-[11px] font-semibold text-slate-400">未来 4 天</div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {energyRhythm.map((entry) => (
                      <div key={entry.key} className="rounded-[18px] border border-black/[0.04] bg-white px-4 py-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{entry.label}</div>
                            <div className="mt-1 text-sm font-semibold text-slate-800">{entry.routine.label} · {entry.routine.theme}</div>
                          </div>
                          <div className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700">
                            {entry.routine.energy} 精力
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function NavItem({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex shrink-0 items-center gap-2 rounded-[14px] px-3.5 py-2 text-[12px] font-bold transition-all ${
        active
          ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/10'
          : 'text-slate-500 hover:bg-white hover:text-slate-900'
      }`}
    >
      {icon}
      <span>{label}</span>
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

function ResourceDetailHint() {
  return (
    <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-400">
      <span>详情</span>
      <ChevronRight size={14} />
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
  tone: 'emerald' | 'sky' | 'rose' | 'amber';
}) {
  const toneClass = tone === 'emerald'
    ? 'bg-white text-emerald-700'
    : tone === 'sky'
      ? 'bg-white text-sky-700'
      : tone === 'amber'
        ? 'bg-white text-amber-700'
        : 'bg-white text-rose-600';

  return (
    <div className={`rounded-2xl px-3 py-3 text-center shadow-sm ${toneClass}`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="mt-1 text-base font-bold">{value}</div>
    </div>
  );
}

function formatPointValue(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
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
