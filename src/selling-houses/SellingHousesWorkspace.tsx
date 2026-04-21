import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  ChevronRight,
  CircleDollarSign,
  Clock3,
  FastForward,
  History,
  Home,
  LayoutDashboard,
  Medal,
  LineChart,
  LogOut,
  MessageSquare,
  Newspaper,
  ShieldAlert,
  SquareUserRound,
  Target,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { ConfirmBackButton } from '../components/Common/ConfirmBackButton';
import { LoadingScene } from '../components/Common/LoadingScene';
import { useGame } from './application/useGame';
import {
  buildWorkspaceShellProjection,
  type WorkspaceShellSidebarCueProjection,
  type WorkspaceShellSidebarProjection,
} from './application/projections/workspaceShellProjection';
import { DailyJournal } from './ui/widgets/DailyJournal';
import { WorkspaceUtilityBar } from './ui/widgets/WorkspaceUtilityBar';

const Dashboard = lazy(() => import('./ui/features/Dashboard').then((module) => ({ default: module.Dashboard })));
const Cases = lazy(() => import('./ui/features/Cases').then((module) => ({ default: module.Cases })));
const Opportunities = lazy(() => import('./ui/features/Opportunities').then((module) => ({ default: module.Opportunities })));
const Market = lazy(() => import('./ui/features/Market').then((module) => ({ default: module.Market })));
const ProfilePanel = lazy(() => import('./ui/features/ProfilePanel').then((module) => ({ default: module.ProfilePanel })));
const ResultOverlay = lazy(() => import('./ui/features/ResultOverlay').then((module) => ({ default: module.ResultOverlay })));
const DailySummaryOverlay = lazy(() => import('./ui/features/DailySummaryOverlay').then((module) => ({ default: module.DailySummaryOverlay })));
const LeaderboardOverlay = lazy(() => import('./ui/features/LeaderboardOverlay').then((module) => ({ default: module.LeaderboardOverlay })));
const ScenarioSetup = lazy(() => import('./ui/features/ScenarioSetup').then((module) => ({ default: module.ScenarioSetup })));

export function preloadSellingHousesPrimaryViews() {
  return Promise.all([
    import('./ui/features/ScenarioSetup'),
    import('./ui/features/Dashboard'),
  ]);
}

type ResourcePanelType = 'budget' | 'auxiliary' | 'energy';
type WorkspaceView = 'overview' | 'cases' | 'customers' | 'market' | 'profile';
type MarketEntryLayer = 'macro' | 'district' | 'competition' | 'listing';
type DetailPanelType = 'selected-case';

interface SellingHousesWorkspaceProps {
  activationKey: string;
  currentUserAccountId?: string;
  currentUserNickname?: string;
  currentUserEmail?: string;
  onReturnToHub: () => void;
  onLogout: () => void;
}

function difficultyLabel(difficultyId: string) {
  if (difficultyId === 'warmup') return '热身局';
  if (difficultyId === 'easy') return '入门局';
  if (difficultyId === 'standard') return '标准局';
  if (difficultyId === 'advanced') return '进阶局';
  if (difficultyId === 'hard') return '高压局';
  if (difficultyId === 'extreme') return '极限局';
  return difficultyId;
}

export function SellingHousesWorkspace({
  activationKey,
  currentUserAccountId,
  currentUserNickname,
  currentUserEmail,
  onReturnToHub,
  onLogout,
}: SellingHousesWorkspaceProps) {
  const {
    phase,
    state,
    difficultyOptions,
    featuredScenarios,
    lastDifficulty,
    starting,
    leaderboardDetail,
    leaderboardLoading,
    loadLeaderboardDetail,
    startFeaturedRun,
    startRandomGeneratedRun,
    handleSelectCase,
    handleAdvanceDays,
    handleExecuteAction,
    handleReset,
    handleClearReport,
  } = useGame({
    activationKey,
    accountId: currentUserAccountId,
    email: currentUserEmail,
    nickname: currentUserNickname,
  });

  const [activeView, setActiveView] = useState<WorkspaceView>('overview');
  const [marketEntryLayer, setMarketEntryLayer] = useState<MarketEntryLayer>('macro');
  const [activeResourcePanel, setActiveResourcePanel] = useState<ResourcePanelType | null>(null);
  const [journalOpen, setJournalOpen] = useState(false);
  const [activeDetailPanel, setActiveDetailPanel] = useState<DetailPanelType | null>(null);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const viewFallback = useMemo(() => <WorkspacePanelSkeleton />, []);
  const overlayFallback = useMemo(() => <WorkspaceOverlaySkeleton />, []);
  const shellProjection = useMemo(() => (state ? buildWorkspaceShellProjection(state) : null), [state]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      mainScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeView, state?.day]);

  if (phase === 'loading') {
    return (
      <LoadingScene
        title="正在恢复进度"
      />
    );
  }

  if (phase === 'setup' || !state) {
    return (
      <div className="selling-houses-shell flex h-full flex-col overflow-hidden text-[var(--seller-ink)]">
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

  const runShellProjection = shellProjection;
  if (!runShellProjection) {
    return (
      <LoadingScene
        title="正在恢复进度"
      />
    );
  }

  const displayMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  };

  const openLeaderboard = async () => {
    setLeaderboardOpen(true);
    setLeaderboardError(null);
    try {
      await loadLeaderboardDetail();
    } catch (error) {
      setLeaderboardError(error instanceof Error ? error.message : '排行榜加载失败。');
    }
  };

  const openView = (view: WorkspaceView) => {
    setActiveView(view);
  };

  const openSelectedCaseQuickView = (caseId?: string) => {
    if (!caseId) {
      setActiveView('overview');
      return;
    }
    handleSelectCase(caseId);
    setActiveDetailPanel('selected-case');
  };

  const openViewFromChild = (view: string) => {
    if (view === 'overview' || view === 'dashboard') {
      setActiveView('overview');
      return;
    }
    if (view === 'customers' || view === 'opportunities') {
      setActiveView('customers');
      return;
    }
    if (view === 'cases' || view === 'market' || view === 'profile') {
      setActiveView(view);
      return;
    }
    setActiveView('overview');
  };

  const openMarketView = (layer: MarketEntryLayer = 'macro') => {
    setMarketEntryLayer(layer);
    setActiveView('market');
  };

  const handleRailCue = (cue: WorkspaceShellSidebarCueProjection) => {
    if (cue.caseId) {
      openSelectedCaseQuickView(cue.caseId);
      return;
    }

    if (cue.label === '昨日情报' || cue.label === '竞品压力') {
      openMarketView('macro');
      return;
    }

    setActiveView('overview');
  };

  const renderView = () => {
    switch (activeView) {
      case 'overview':
        return (
          <Dashboard
            state={state}
            onSelectCase={handleSelectCase}
            onSetView={openViewFromChild}
            onOpenMarket={openMarketView}
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
      case 'customers':
        return <Opportunities state={state} onSelectCase={handleSelectCase} onSetView={openViewFromChild} />;
      case 'market':
        return (
          <Market
            state={state}
            initialLayer={marketEntryLayer}
            onSelectCase={handleSelectCase}
            onOpenCases={() => openView('cases')}
          />
        );
      case 'profile':
        return <ProfilePanel state={state} currentUserNickname={currentUserNickname} />;
      default:
        return (
          <Dashboard
            state={state}
            onSelectCase={handleSelectCase}
            onSetView={openViewFromChild}
            onOpenMarket={openMarketView}
          />
        );
    }
  };

  const activeResourceMeta = activeResourcePanel ? runShellProjection.panelMeta[activeResourcePanel] : null;

  return (
    <div className="selling-houses-shell flex h-full flex-col overflow-hidden font-sans text-[var(--seller-ink)]">
      <header className="shrink-0 border-b border-[var(--seller-border)] bg-[rgba(11,17,24,0.96)] px-4 py-2 backdrop-blur-xl">
        <div className="flex flex-col gap-2.5">
          <div className="seller-band flex flex-wrap items-center justify-between gap-3 px-3 py-2">
            <div className="flex min-w-0 flex-1">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <ConfirmBackButton
                  onConfirm={() => {
                    handleReset();
                    onReturnToHub();
                  }}
                  title="确认返回？"
                  description="将离开当前这一局，回到功能入口。当前进度会按系统状态保留。"
                  buttonClassName="seller-button-secondary inline-flex h-9 shrink-0 items-center gap-1.5 px-3"
                />

                <div className="seller-separator h-8 w-px shrink-0" />

                <div className="flex min-w-0 items-center gap-3">
                  <div className="min-w-0 flex flex-wrap items-center gap-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="seller-chip seller-chip-accent">
                        {runShellProjection.header.scenarioTheme}
                      </div>
                      <div className="seller-chip">
                        <Calendar size={10} />
                        {runShellProjection.header.routineLabel} · {runShellProjection.header.routineTheme}
                      </div>
                      <div className="seller-chip">
                        {difficultyLabel(runShellProjection.header.difficultyId)}
                      </div>
                    </div>
                    <div className="truncate text-[14px] font-semibold tracking-[-0.03em] text-[var(--seller-ink)]">
                      {runShellProjection.header.scenarioName}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end">
              <WorkspaceUtilityBar
                journalTodayCount={runShellProjection.sidebar.journal.todayCount}
                onOpenJournal={() => setJournalOpen(true)}
                onOpenLeaderboard={openLeaderboard}
                onLogout={onLogout}
              />
            </div>
          </div>

          <div className="seller-panel-muted flex flex-wrap items-center justify-between gap-2 p-1.5">
            <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-[15px] bg-[rgba(255,255,255,0.03)] p-1">
              <NavItem active={activeView === 'overview'} onClick={() => openView('overview')} icon={<LayoutDashboard size={16} />} label="经营概览" />
              <NavItem active={activeView === 'cases'} onClick={() => openView('cases')} icon={<Home size={16} />} label="房源" />
              <NavItem active={activeView === 'customers'} onClick={() => openView('customers')} icon={<Users size={16} />} label="客户" />
              <NavItem active={activeView === 'market'} onClick={() => openMarketView('macro')} icon={<LineChart size={16} />} label="市场" />
              <NavItem active={activeView === 'profile'} onClick={() => openView('profile')} icon={<SquareUserRound size={16} />} label="我" />
            </nav>

            <div className="seller-separator hidden h-8 w-px xl:block" />

            <div className="flex flex-wrap items-center gap-1.5">
              <div className="seller-band flex items-center gap-1 p-1">
                <button
                  type="button"
                  onClick={() => setActiveResourcePanel('budget')}
                  className="min-w-[108px] rounded-[10px] border border-transparent bg-transparent px-2 py-2 text-left transition-all hover:border-[var(--seller-border)] hover:bg-[rgba(255,255,255,0.06)]"
                  aria-label="查看推广金详情"
                  title="查看推广金详情"
                >
                  <ResourceTile
                    icon={<Wallet size={15} />}
                    label={runShellProjection.resourceTiles.budget.label}
                    value={runShellProjection.resourceTiles.budget.value}
                    color="text-[var(--seller-ink)]"
                    trailing={(
                      <div className="flex items-center gap-1 text-[10px] font-semibold text-[var(--seller-subtle)]">
                        <span>明细</span>
                        <ChevronRight size={13} />
                      </div>
                    )}
                  />
                </button>
                <div className="seller-separator h-8 w-px" />
                <button
                  type="button"
                  onClick={() => setActiveResourcePanel('auxiliary')}
                  className="min-w-[108px] rounded-[10px] border border-transparent bg-transparent px-2 py-2 text-left transition-all hover:border-[var(--seller-border)] hover:bg-[rgba(255,255,255,0.06)]"
                  aria-label="查看成交与佣金详情"
                  title="查看成交与佣金详情"
                >
                  <ResourceTile
                    icon={<CircleDollarSign size={15} />}
                    label={runShellProjection.resourceTiles.auxiliary.label}
                    value={runShellProjection.resourceTiles.auxiliary.value}
                    color="text-[var(--seller-muted)]"
                    trailing={<ResourceDetailHint />}
                  />
                </button>
                <div className="seller-separator h-8 w-px" />
                <button
                  type="button"
                  onClick={() => setActiveResourcePanel('energy')}
                  className="min-w-[84px] rounded-[10px] border border-transparent bg-transparent px-2 py-2 text-left transition-all hover:border-[var(--seller-border)] hover:bg-[rgba(255,255,255,0.06)]"
                  aria-label="查看今日精力详情"
                  title="查看今日精力详情"
                >
                  <ResourceTile
                    icon={<Zap size={15} />}
                    label={runShellProjection.resourceTiles.energy.label}
                    value={runShellProjection.resourceTiles.energy.value}
                    color="text-[var(--seller-accent)]"
                    trailing={<ResourceDetailHint />}
                  />
                </button>
              </div>

              <div className="seller-band flex items-center gap-1 p-1">
                <button
                  onClick={() => handleAdvanceDays(7, displayMessage)}
                  disabled={state.gameOver}
                  className="seller-button-secondary flex h-11 items-center gap-1.5 rounded-[10px] px-3.5 disabled:opacity-50"
                >
                  <FastForward size={16} />
                  <span>推进一周</span>
                </button>
                <button
                  onClick={() => handleAdvanceDays(1, displayMessage)}
                  disabled={state.gameOver}
                  className="seller-button-primary h-11 rounded-[10px] px-3.5 shadow-[var(--seller-shadow-sm)] disabled:opacity-50"
                >
                  结束今日
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="seller-shell-body flex flex-1 min-h-0 overflow-hidden">
        <main ref={mainScrollRef} className="relative min-w-0 flex-1 overflow-y-auto p-4 lg:p-5">
          {message && (
            <div className="fixed bottom-10 left-1/2 z-[60] flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-[var(--seller-border)] bg-[var(--seller-paper)] px-6 py-3 text-[var(--seller-ink)] shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
              <MessageSquare size={18} className="text-emerald-400" />
              <span className="text-sm font-medium">{message}</span>
            </div>
          )}
          <Suspense fallback={viewFallback}>
            {renderView()}
          </Suspense>
        </main>

        <WorkspaceRightRail
          sidebar={runShellProjection.sidebar}
          onOpenJournal={() => setJournalOpen(true)}
          onOpenCue={handleRailCue}
        />
      </div>

      {state.gameOver && (
        <Suspense fallback={overlayFallback}>
          <ResultOverlay state={state} onRestart={handleReset} />
        </Suspense>
      )}
      {state.currentReport && !state.gameOver && (
        <Suspense fallback={overlayFallback}>
          <DailySummaryOverlay
            report={state.currentReport}
            tickResult={state.lastDailyTickResult}
            onContinue={handleClearReport}
          />
        </Suspense>
      )}
      {leaderboardOpen && (
        <Suspense fallback={overlayFallback}>
          <LeaderboardOverlay
            loading={leaderboardLoading}
            detail={leaderboardDetail}
            error={leaderboardError}
            onClose={() => setLeaderboardOpen(false)}
          />
        </Suspense>
      )}
      {journalOpen && (
        <div
          className="fixed inset-0 z-[95] flex items-end justify-center bg-[rgba(5,8,12,0.42)] backdrop-blur-sm"
          onClick={() => setJournalOpen(false)}
        >
          <div
          className="seller-panel-muted flex h-[82vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-[24px] shadow-[var(--seller-shadow-lg)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[var(--seller-border)] px-6 py-5">
              <div className="max-w-2xl">
                <div className="seller-label flex items-center gap-2">
                  <History size={14} />
                  经营记录
                </div>
                <h3 className="seller-title mt-2 text-[22px]">整局记录</h3>
                <p className="seller-body mt-2 text-[13px]">
                  {runShellProjection.sidebar.journal.brief}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setJournalOpen(false)}
                className="seller-button-secondary px-3 py-2 text-sm"
              >
                关闭
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              <DailyJournal
                state={state}
                selectedCaseId={state.selectedCaseId}
                onSelectCase={(caseId) => {
                  handleSelectCase(caseId);
                  setActiveView('cases');
                  setJournalOpen(false);
                }}
              />
            </div>
          </div>
        </div>
      )}
      {activeDetailPanel === 'selected-case' && runShellProjection.selectedCaseDetail && (
        <div
          className="fixed inset-0 z-[94] flex justify-end bg-[rgba(5,8,12,0.42)] backdrop-blur-sm"
          onClick={() => setActiveDetailPanel(null)}
        >
          <div
            className="seller-panel-muted h-full w-full max-w-[640px] overflow-y-auto rounded-none border-l border-[var(--seller-border)] p-7 shadow-[var(--seller-shadow-lg)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div className="max-w-[420px]">
                <div className="seller-label flex items-center gap-2">
                  <Home size={13} className="text-[var(--seller-accent)]" />
                  当前房源详情
                </div>
                <h3 className="seller-title mt-2 text-[22px]">
                  {runShellProjection.selectedCaseDetail.title}
                </h3>
                <p className="seller-body mt-2 text-sm">
                  {runShellProjection.selectedCaseDetail.community} · {runShellProjection.selectedCaseDetail.district} · {runShellProjection.selectedCaseDetail.stageLabel}
                </p>
                <p className="seller-body mt-2 text-sm">
                  {runShellProjection.selectedCaseDetail.story}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveDetailPanel(null)}
                className="seller-button-secondary px-3 py-2 text-sm"
              >
                关闭
              </button>
            </div>

            <SelectedCaseDetailSheet
              detail={runShellProjection.selectedCaseDetail}
              onOpenFull={() => {
                handleSelectCase(runShellProjection.selectedCaseDetail!.caseId);
                setActiveView('cases');
                setActiveDetailPanel(null);
              }}
            />
          </div>
        </div>
      )}

      {activeResourcePanel && activeResourceMeta && (
        <div className="fixed inset-0 z-[90] flex justify-end bg-[rgba(5,8,12,0.42)] backdrop-blur-sm" onClick={() => setActiveResourcePanel(null)}>
          <div
            className="h-full w-full max-w-[560px] overflow-y-auto border-l border-[var(--seller-border)] bg-[linear-gradient(180deg,rgba(17,25,35,0.98)_0%,rgba(9,16,24,0.98)_28%)] p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div className="max-w-[360px]">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">
                  {activeResourcePanel === 'energy'
                    ? <Zap size={13} className="text-[var(--seller-accent)]" />
                    : <CircleDollarSign size={13} className="text-[var(--seller-chance)]" />}
                  {activeResourceMeta.eyebrow}
                </div>
                <h3 className="mt-2 text-[20px] font-semibold tracking-[-0.03em] text-[var(--seller-ink)]">{activeResourceMeta.title}</h3>
                <p className="mt-2 text-[12px] leading-6 text-[var(--seller-muted)]">
                  {activeResourceMeta.description}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveResourcePanel(null)}
                className="seller-button-secondary rounded-[10px] px-3 py-2 text-[11px]"
              >
                关闭
              </button>
            </div>

            {activeResourcePanel === 'budget' && (
              <>
                <div className="seller-panel-strong mb-5 px-5 py-5">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">当前余额</div>
                      <div className="mt-2 text-[34px] font-semibold tracking-[-0.04em] text-[var(--seller-ink)]">{runShellProjection.budgetPanel.balanceLabel}</div>
                      <div className="mt-2 max-w-md text-[12px] leading-6 text-[var(--seller-muted)]">
                        {runShellProjection.budgetPanel.summary}
                      </div>
                    </div>
                    <div className="grid min-w-[220px] grid-cols-3 gap-2">
                      {runShellProjection.budgetPanel.stats.map((entry) => (
                        <React.Fragment key={entry.label}>
                          <BudgetMiniStat label={entry.label} value={entry.value} tone={entry.tone} />
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="seller-panel-soft px-4 py-4">
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">规则摘要</div>
                    <div className="mt-3 space-y-3 text-[12px] text-[var(--seller-muted)]">
                      {runShellProjection.budgetPanel.rules.map((entry) => (
                        <div key={entry.label} className="flex items-start justify-between gap-3">
                          <span>{entry.label}</span>
                          <strong className="text-[var(--seller-ink)]">{entry.value}</strong>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="seller-panel-soft px-4 py-4">
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-chance)]">当前含义</div>
                    <p className="mt-3 text-[12px] leading-6 text-[var(--seller-muted)]">
                      {runShellProjection.budgetPanel.note}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-end justify-between gap-3 px-1">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">最近流水</div>
                      <p className="mt-1 text-[11px] text-[var(--seller-subtle)]">最近 8 条收支。</p>
                    </div>
                    <div className="text-[11px] font-semibold text-[var(--seller-subtle)]">按时间倒序</div>
                  </div>
                  {runShellProjection.budgetPanel.entries.map((entry) => (
                    <div key={entry.id} className="seller-fact-row rounded-[14px] px-4 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-[13px] font-semibold text-[var(--seller-ink)]">{entry.title}</div>
                            <span className="seller-chip">
                              {entry.dayLabel}
                            </span>
                          </div>
                          <div className="mt-1.5 text-[11px] leading-6 text-[var(--seller-muted)]">{entry.detail}</div>
                        </div>
                        <div className="min-w-[92px] text-right">
                          <div className={`text-[15px] font-semibold ${entry.positive ? 'text-[var(--seller-chance)]' : 'text-[var(--seller-risk)]'}`}>
                            {entry.amountLabel}
                          </div>
                          <div className="mt-1 text-[10px] font-medium text-[var(--seller-subtle)]">{entry.balanceLabel}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {runShellProjection.budgetPanel.entries.length === 0 && (
                    <div className="seller-empty px-4 py-8 text-center text-[12px]">
                      暂时还没有推广金流水，先做一笔经营动作再回来看看。
                    </div>
                  )}
                </div>
              </>
            )}

            {activeResourcePanel === 'auxiliary' && (
              <>
                <div className="seller-panel-strong mb-5 px-5 py-5">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">成交与回款</div>
                      <div className="mt-2 text-[34px] font-semibold tracking-[-0.04em] text-[var(--seller-ink)]">{runShellProjection.auxiliaryPanel.commissionLabel}</div>
                      <div className="mt-2 max-w-md text-[12px] leading-6 text-[var(--seller-muted)]">
                        {runShellProjection.auxiliaryPanel.summary}
                      </div>
                    </div>
                    <div className="grid min-w-[220px] grid-cols-3 gap-2">
                      {runShellProjection.auxiliaryPanel.stats.map((entry) => (
                        <React.Fragment key={entry.label}>
                          <BudgetMiniStat label={entry.label} value={entry.value} tone={entry.tone} />
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="seller-panel-soft px-4 py-4">
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">规则摘要</div>
                    <div className="mt-3 space-y-3 text-[12px] text-[var(--seller-muted)]">
                      {runShellProjection.auxiliaryPanel.rules.map((entry) => (
                        <div key={entry.label} className="flex items-start justify-between gap-3">
                          <span>{entry.label}</span>
                          <strong className="text-[var(--seller-ink)]">{entry.value}</strong>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="seller-panel-soft px-4 py-4">
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-chance)]">当前含义</div>
                    <p className="mt-3 text-[12px] leading-6 text-[var(--seller-muted)]">
                      {runShellProjection.auxiliaryPanel.note}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-end justify-between gap-3 px-1">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">最近成交</div>
                      <p className="mt-1 text-[11px] text-[var(--seller-subtle)]">最近成交房源。</p>
                    </div>
                    <div className="text-[11px] font-semibold text-[var(--seller-subtle)]">按成交价倒序</div>
                  </div>
                  {runShellProjection.auxiliaryPanel.soldCases.map((entry) => (
                    <div key={entry.id} className="seller-fact-row rounded-[14px] px-4 py-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-[13px] font-semibold text-[var(--seller-ink)]">{entry.title}</div>
                            <span className="seller-chip">
                              {entry.community}
                            </span>
                          </div>
                          <div className="mt-1.5 text-[11px] leading-6 text-[var(--seller-muted)]">
                            {entry.detail}
                          </div>
                        </div>
                        <div className="min-w-[96px] text-right">
                          <div className="text-[15px] font-semibold text-[var(--seller-chance)]">{entry.commissionLabel}</div>
                          <div className="mt-1 text-[10px] font-medium text-[var(--seller-subtle)]">佣金</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {runShellProjection.auxiliaryPanel.soldCases.length === 0 && (
                    <div className="seller-empty px-4 py-8 text-center text-[12px]">
                      这局还没有成交，佣金会在第一套房成交后开始累计。
                    </div>
                  )}
                </div>
              </>
            )}

            {activeResourcePanel === 'energy' && (
              <>
                <div className="seller-panel-strong mb-5 px-5 py-5">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">当前精力</div>
                      <div className="mt-2 text-[34px] font-semibold tracking-[-0.04em] text-[var(--seller-ink)]">{runShellProjection.energyPanel.energyLabel}</div>
                      <div className="mt-2 max-w-md text-[12px] leading-6 text-[var(--seller-muted)]">
                        {runShellProjection.energyPanel.summary}
                      </div>
                    </div>
                    <div className="grid min-w-[220px] grid-cols-3 gap-2">
                      {runShellProjection.energyPanel.stats.map((entry) => (
                        <React.Fragment key={entry.label}>
                          <BudgetMiniStat label={entry.label} value={entry.value} tone={entry.tone} />
                        </React.Fragment>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="mb-5 grid grid-cols-1 gap-3 md:grid-cols-2">
                  <div className="seller-panel-soft px-4 py-4">
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">规则摘要</div>
                    <div className="mt-3 space-y-3 text-[12px] text-[var(--seller-muted)]">
                      {runShellProjection.energyPanel.rules.map((entry) => (
                        <div key={entry.label} className="flex items-start justify-between gap-3">
                          <span>{entry.label}</span>
                          <strong className="text-[var(--seller-ink)]">{entry.value}</strong>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="seller-panel-soft px-4 py-4">
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-accent)]">精力现在说明什么</div>
                    <p className="mt-3 text-[12px] leading-6 text-[var(--seller-muted)]">
                      {runShellProjection.energyPanel.note}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-end justify-between gap-3 px-1">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">接下来几天</div>
                      <p className="mt-1 text-[11px] text-[var(--seller-subtle)]">精力不是每天都一样，高成本动作最好放在余量更宽的时候。</p>
                    </div>
                    <div className="text-[11px] font-semibold text-[var(--seller-subtle)]">未来 4 天</div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {runShellProjection.energyPanel.rhythm.map((entry) => (
                      <div key={entry.key} className="seller-fact-row rounded-[14px] px-4 py-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">{entry.label}</div>
                            <div className="mt-1 text-[13px] font-semibold text-[var(--seller-ink)]">{entry.title}</div>
                          </div>
                          <div className="seller-chip seller-chip-accent">
                            {entry.energyLabel}
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

function SelectedCaseDetailSheet({
  detail,
  onOpenFull,
}: {
  detail: NonNullable<ReturnType<typeof buildWorkspaceShellProjection>['selectedCaseDetail']>;
  onOpenFull: () => void;
}) {
  const projection = detail.projection;

  return (
    <div className="space-y-4">
      <div className="seller-panel-strong px-4 py-4">
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">当前问题</div>
        <div className="mt-2 text-[17px] font-semibold tracking-[-0.03em] text-[var(--seller-ink)]">{projection.mainProblemLabel}</div>
        <p className="mt-2 text-[12px] leading-6 text-[var(--seller-muted)]">{projection.actionReasons[0]?.detail || projection.ownerSummary.detail}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {projection.currentRiskTags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="seller-chip"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <DetailMetricCard
          label="业主"
          title={projection.ownerSummary.title}
          detail={projection.ownerSummary.detail}
          chips={[
            `信任 ${projection.ownerSummary.trust}`,
            `耐心 ${projection.ownerSummary.patience}`,
            `紧迫 ${projection.ownerSummary.urgency}`,
          ]}
        />
        <DetailMetricCard
          label="客户池"
          title={projection.customerPoolSummary.title}
          detail={projection.customerPoolSummary.detail}
          chips={[
            `已接 ${projection.customerPoolSummary.metCount}`,
            `潜力 ${projection.customerPoolSummary.potentialCount}`,
            `快到报价 ${projection.customerPoolSummary.closingCount}`,
          ]}
        />
        <DetailMetricCard
          label="价格"
          title={projection.priceSummary.title}
          detail={projection.priceSummary.detail}
          chips={[
            `挂牌 ${projection.priceSummary.askPrice} 万`,
            `市场 ${projection.priceSummary.marketPrice} 万`,
            `底价 ${projection.priceSummary.bottomPrice} 万`,
          ]}
        />
        <DetailMetricCard
          label="竞争"
          title={projection.competitionSummary.title}
          detail={projection.competitionSummary.detail}
          chips={[
            `竞品 ${projection.competitionSummary.rivalCount} 套`,
            `压力 ${projection.competitionSummary.pressure}`,
          ]}
        />
      </div>

      <section className="seller-panel-soft p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">现在能接着做什么</div>
            <div className="mt-1 text-[15px] font-semibold text-[var(--seller-ink)]">可做动作</div>
          </div>
          <button
            type="button"
            onClick={onOpenFull}
            className="seller-button-secondary rounded-full px-3 py-1.5 text-[10px]"
          >
            打开房源
          </button>
        </div>
        <div className="mt-3 space-y-2.5">
          {projection.actionReasons.slice(0, 3).map((reason) => (
            <div
              key={reason.id}
              className={`rounded-[18px] border px-3 py-3 ${
                reason.tone === 'risk'
                  ? 'border-[color:var(--seller-risk)]/20 bg-[var(--seller-risk-soft)]'
                  : reason.tone === 'chance'
                    ? 'border-[color:var(--seller-chance)]/20 bg-[var(--seller-chance-soft)]'
                    : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)]'
              }`}
            >
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">{reason.label}</div>
              <div className="mt-1 text-[13px] font-semibold text-[var(--seller-ink)]">{reason.title}</div>
              <p className="mt-1 text-[12px] leading-6 text-[var(--seller-muted)]">{reason.detail}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function DetailMetricCard({
  label,
  title,
  detail,
  chips,
}: {
  label: string;
  title: string;
  detail: string;
  chips: string[];
}) {
  return (
    <section className="seller-fact-row rounded-[14px] p-4">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">{label}</div>
      <div className="mt-1 text-[15px] font-semibold text-[var(--seller-ink)]">{title}</div>
      <p className="mt-2 text-[12px] leading-6 text-[var(--seller-muted)]">{detail}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <span
            key={chip}
            className="seller-chip"
          >
            {chip}
          </span>
        ))}
      </div>
    </section>
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
      className={`flex h-10 shrink-0 items-center gap-2 rounded-[10px] px-3.5 text-[12px] font-semibold transition-all ${
        active
          ? 'border border-[var(--seller-border-strong)] bg-[var(--seller-ink)] text-[var(--seller-bg)] shadow-[0_10px_20px_rgba(0,0,0,0.24)]'
          : 'border border-transparent text-[var(--seller-muted)] hover:bg-[rgba(255,255,255,0.06)] hover:text-[var(--seller-ink)]'
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
        <div className="text-[var(--seller-subtle)]">{icon}</div>
        <div className="flex flex-col leading-none">
          <span className="mb-1 text-[10px] font-bold uppercase tracking-tight text-[var(--seller-subtle)]">{label}</span>
          <span className={`text-[13px] font-bold ${color}`}>{value}</span>
        </div>
      </div>
      {trailing}
    </div>
  );
}

function ResourceDetailHint() {
  return (
    <div className="flex items-center gap-1 text-[10px] font-semibold text-[var(--seller-subtle)]">
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
  const valueClass = tone === 'emerald'
    ? 'text-[var(--seller-chance)]'
    : tone === 'sky'
      ? 'text-[var(--seller-accent)]'
      : tone === 'amber'
        ? 'text-[var(--seller-accent)]'
        : 'text-[var(--seller-risk)]';

  return (
    <div className="seller-fact-row rounded-[14px] px-3 py-3 text-center">
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">{label}</div>
      <div className={`mt-1 text-[15px] font-semibold ${valueClass}`}>{value}</div>
    </div>
  );
}

export function WorkspaceRightRail({
  sidebar,
  onOpenJournal,
  onOpenCue,
}: {
  sidebar: WorkspaceShellSidebarProjection;
  onOpenJournal: () => void;
  onOpenCue: (cue: WorkspaceShellSidebarCueProjection) => void;
}) {
  const combinedMarketAndRisk = [...sidebar.riskCues, ...sidebar.marketCues].slice(0, 4);

  return (
    <aside className="seller-right-rail hidden w-[360px] shrink-0 xl:flex xl:flex-col xl:gap-4 xl:overflow-y-auto xl:px-5 xl:pb-5 xl:pt-4">
      <WorkspaceRailSection
        eyebrow="壳层分诊"
        title="今日事项"
        actionLabel={sidebar.matter.primaryCue ? '去处理' : undefined}
        onAction={sidebar.matter.primaryCue ? () => onOpenCue(sidebar.matter.primaryCue!) : undefined}
      >
        <div className="seller-panel-muted px-4 py-4">
          <div className="text-[15px] font-semibold tracking-[-0.03em] text-[var(--seller-ink)]">
            {sidebar.matter.headline}
          </div>
          <p className="mt-2 text-[12px] leading-6 text-[var(--seller-muted)]">
            {sidebar.matter.summary}
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {sidebar.matter.stats.map((stat) => (
              <div key={stat.label} className="seller-fact-row rounded-[14px] px-3 py-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">{stat.label}</div>
                <div className={`mt-1 text-[15px] font-semibold ${toneTextClass(stat.tone)}`}>{stat.value}</div>
              </div>
            ))}
          </div>
            <div className="mt-3 space-y-2.5">
              {sidebar.actionCues.map((cue) => (
                <React.Fragment key={cue.id}>
                  <RailCueCard cue={cue} onClick={() => onOpenCue(cue)} />
                </React.Fragment>
              ))}
            </div>
          </div>
        </WorkspaceRailSection>

      <WorkspaceRailSection eyebrow="变化解释" title="风险与市场">
        <div className="seller-panel-muted px-4 py-4">
          <div className="grid grid-cols-2 gap-2">
            <div className="seller-fact-row rounded-[14px] px-3 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">风险提示</div>
              <div className="mt-1 text-[15px] font-semibold text-[var(--seller-risk)]">{sidebar.riskCues.length}</div>
            </div>
            <div className="seller-fact-row rounded-[14px] px-3 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">市场变化</div>
              <div className="mt-1 text-[15px] font-semibold text-[var(--seller-chance)]">{sidebar.marketCues.length}</div>
            </div>
          </div>
          <div className="mt-3 space-y-2.5">
            {combinedMarketAndRisk.map((cue) => (
              <React.Fragment key={cue.id}>
                <RailCueCard cue={cue} onClick={() => onOpenCue(cue)} />
              </React.Fragment>
            ))}
          </div>
        </div>
      </WorkspaceRailSection>

      <WorkspaceRailSection
        eyebrow="回看入口"
        title="经营记录"
        actionLabel={sidebar.journal.actionLabel}
        onAction={onOpenJournal}
      >
        <div className="seller-panel-muted px-4 py-4">
          <div className="grid grid-cols-4 gap-2">
            <div className="seller-fact-row rounded-[14px] px-3 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">今日</div>
              <div className="mt-1 text-[15px] font-semibold text-[var(--seller-ink)]">{sidebar.journal.todayCount}</div>
            </div>
            <div className="seller-fact-row rounded-[14px] px-3 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">昨日</div>
              <div className="mt-1 text-[15px] font-semibold text-[var(--seller-ink)]">{sidebar.journal.yesterdayCount}</div>
            </div>
            <div className="seller-fact-row rounded-[14px] px-3 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">风险</div>
              <div className="mt-1 text-[15px] font-semibold text-[var(--seller-risk)]">{sidebar.journal.riskCount}</div>
            </div>
            <div className="seller-fact-row rounded-[14px] px-3 py-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">机会</div>
              <div className="mt-1 text-[15px] font-semibold text-[var(--seller-chance)]">{sidebar.journal.chanceCount}</div>
            </div>
          </div>
          <div className="seller-fact-row mt-3 rounded-[14px] px-4 py-4">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">最新记录</div>
            <div className="mt-2 text-[14px] font-semibold text-[var(--seller-ink)]">
              {sidebar.journal.lastTitle}
            </div>
            <p className="mt-1 text-[12px] leading-6 text-[var(--seller-muted)]">
              {sidebar.journal.lastDetail}
            </p>
            <p className="mt-2 text-[11px] leading-6 text-[var(--seller-subtle)]">
              {sidebar.journal.brief}
            </p>
          </div>
        </div>
      </WorkspaceRailSection>
    </aside>
  );
}

function WorkspaceRailSection({
  eyebrow,
  title,
  actionLabel,
  onAction,
  children,
}: {
  eyebrow: string;
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3 px-1">
        <div>
          <div className="seller-label">{eyebrow}</div>
          <div className="mt-1 text-[13px] font-semibold text-[var(--seller-ink)]">{title}</div>
        </div>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="seller-button-secondary rounded-full px-3 py-1.5 text-[10px]"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function RailCueCard({
  cue,
  onClick,
}: {
  cue: WorkspaceShellSidebarCueProjection;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-[14px] border px-3 py-3 text-left transition-all hover:border-[var(--seller-border-strong)] hover:bg-[rgba(255,255,255,0.06)] ${toneSurfaceClass(cue.tone)}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">{cue.label}</div>
          <div className="mt-1 text-[13px] font-semibold text-[var(--seller-ink)]">{cue.title}</div>
          <p className="mt-1 text-[12px] leading-6 text-[var(--seller-muted)]">{cue.detail}</p>
        </div>
        <ChevronRight size={14} className="mt-1 shrink-0 text-[var(--seller-subtle)]" />
      </div>
    </button>
  );
}

function toneTextClass(tone: 'neutral' | 'chance' | 'risk') {
  if (tone === 'chance') return 'text-[var(--seller-chance)]';
  if (tone === 'risk') return 'text-[var(--seller-risk)]';
  return 'text-[var(--seller-ink)]';
}

function toneSurfaceClass(tone: 'neutral' | 'chance' | 'risk') {
  if (tone === 'chance') {
    return 'border-[color:var(--seller-chance)]/20 bg-[var(--seller-chance-soft)]';
  }
  if (tone === 'risk') {
    return 'border-[color:var(--seller-risk)]/20 bg-[var(--seller-risk-soft)]';
  }
  return 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)]';
}

function WorkspacePanelSkeleton() {
  return (
    <div className="min-h-[420px]">
      <LoadingScene
        compact
        title="正在加载页面"
      />
    </div>
  );
}

function WorkspaceOverlaySkeleton() {
  return (
    <div className="fixed inset-0 z-[100] bg-[rgba(5,8,12,0.42)] backdrop-blur-sm">
      <div className="mx-auto mt-20 max-w-4xl animate-pulse rounded-[18px] border border-[var(--seller-border)] bg-[var(--seller-paper)] p-10 shadow-2xl">
        <div className="mx-auto h-8 w-56 rounded bg-[rgba(255,255,255,0.08)]" />
        <div className="mx-auto mt-4 h-4 w-96 max-w-full rounded bg-[rgba(255,255,255,0.05)]" />
        <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="h-24 rounded-[14px] bg-[rgba(255,255,255,0.05)]" />
          ))}
        </div>
      </div>
    </div>
  );
}
