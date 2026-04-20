import React, { Suspense, lazy, useMemo, useState } from 'react';
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
  RefreshCw,
  ScrollText,
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
import { buildWorkspaceShellProjection, type WorkspaceShellSidebarCueProjection } from './application/projections/workspaceShellProjection';
import { DailyJournal } from './ui/widgets/DailyJournal';

const Dashboard = lazy(() => import('./ui/features/Dashboard').then((module) => ({ default: module.Dashboard })));
const Cases = lazy(() => import('./ui/features/Cases').then((module) => ({ default: module.Cases })));
const Opportunities = lazy(() => import('./ui/features/Opportunities').then((module) => ({ default: module.Opportunities })));
const Market = lazy(() => import('./ui/features/Market').then((module) => ({ default: module.Market })));
const Review = lazy(() => import('./ui/features/Review').then((module) => ({ default: module.Review })));
const ResultsPanel = lazy(() => import('./ui/features/ResultsPanel').then((module) => ({ default: module.ResultsPanel })));
const ProfilePanel = lazy(() => import('./ui/features/ProfilePanel').then((module) => ({ default: module.ProfilePanel })));
const ResultOverlay = lazy(() => import('./ui/features/ResultOverlay').then((module) => ({ default: module.ResultOverlay })));
const DailySummaryOverlay = lazy(() => import('./ui/features/DailySummaryOverlay').then((module) => ({ default: module.DailySummaryOverlay })));
const LeaderboardOverlay = lazy(() => import('./ui/features/LeaderboardOverlay').then((module) => ({ default: module.LeaderboardOverlay })));
const ScenarioSetup = lazy(() => import('./ui/features/ScenarioSetup').then((module) => ({ default: module.ScenarioSetup })));

type ResourcePanelType = 'budget' | 'auxiliary' | 'energy';
type WorkspaceView = 'overview' | 'cases' | 'customers' | 'market' | 'review' | 'results' | 'profile';
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
  const viewFallback = useMemo(() => <WorkspacePanelSkeleton />, []);
  const overlayFallback = useMemo(() => <WorkspaceOverlaySkeleton />, []);
  const shellProjection = useMemo(() => (state ? buildWorkspaceShellProjection(state) : null), [state]);

  if (phase === 'loading') {
    return (
      <LoadingScene
        title="正在初始化这一局"
        subtitle="读取房源、恢复进度、准备经营看板…"
      />
    );
  }

  if (phase === 'setup' || !state) {
    return (
      <div className="selling-houses-shell flex h-full flex-col overflow-hidden text-slate-900">
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
        title="正在初始化这一局"
        subtitle="读取房源、恢复进度、准备经营看板…"
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

  const openViewFromChild = (view: string) => {
    if (view === 'overview' || view === 'dashboard') {
      setActiveView('overview');
      return;
    }
    if (view === 'customers' || view === 'opportunities') {
      setActiveView('customers');
      return;
    }
    if (view === 'cases' || view === 'market' || view === 'review' || view === 'results' || view === 'profile') {
      setActiveView(view);
      return;
    }
    setActiveView('overview');
  };

  const openMarketView = (layer: MarketEntryLayer = 'macro') => {
    setMarketEntryLayer(layer);
    setActiveView('market');
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
      case 'review':
        return <Review state={state} />;
      case 'results':
        return <ResultsPanel state={state} onRestart={handleReset} />;
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
    <div className="selling-houses-shell flex h-full flex-col overflow-hidden font-sans text-slate-900">
      <header className="shrink-0 border-b border-[var(--seller-border)] bg-[rgba(248,245,239,0.88)] px-5 py-3 backdrop-blur-xl">
        <div className="flex flex-col gap-2.5">
          <div className="seller-band flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
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
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-[var(--seller-ink)] text-[rgba(247,245,239,0.96)] shadow-[var(--seller-shadow-sm)]">
                    <Home size={18} />
                  </div>
                  <div className="min-w-0">
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
                    <h2 className="seller-title mt-1 truncate text-[1.15rem] text-[var(--seller-ink)]">
                      {runShellProjection.header.scenarioName}
                    </h2>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end">
              <div className="seller-band flex items-center gap-1 p-1">
                <button
                  type="button"
                  onClick={openLeaderboard}
                  className="seller-button-secondary inline-flex h-9 items-center gap-1.5 px-3.5"
                >
                  <Medal size={14} />
                  排行榜
                </button>
                <button
                  type="button"
                  onClick={onLogout}
                  className="seller-button-ghost inline-flex h-9 items-center gap-1.5 px-3.5"
                >
                  <LogOut size={14} />
                  退出
                </button>
              </div>
            </div>
          </div>

          <div className="seller-panel-muted flex flex-wrap items-center justify-between gap-2 p-1.5">
            <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-[15px] bg-[rgba(255,255,255,0.62)] p-1">
              <NavItem active={activeView === 'overview'} onClick={() => openView('overview')} icon={<LayoutDashboard size={16} />} label="经营概览" />
              <NavItem active={activeView === 'cases'} onClick={() => openView('cases')} icon={<Home size={16} />} label="房源" />
              <NavItem active={activeView === 'customers'} onClick={() => openView('customers')} icon={<Users size={16} />} label="客户" />
              <NavItem active={activeView === 'market'} onClick={() => openMarketView('macro')} icon={<LineChart size={16} />} label="市场" />
              <NavItem active={activeView === 'review'} onClick={() => openView('review')} icon={<History size={16} />} label="复盘" />
              <NavItem active={activeView === 'results'} onClick={() => openView('results')} icon={<ScrollText size={16} />} label="结果" />
              <NavItem active={activeView === 'profile'} onClick={() => openView('profile')} icon={<SquareUserRound size={16} />} label="我" />
            </nav>

            <div className="seller-separator hidden h-8 w-px xl:block" />

            <div className="flex flex-wrap items-center gap-1.5">
              <div className="seller-band flex items-center gap-1 p-1">
                <button
                  type="button"
                  onClick={() => setActiveResourcePanel('budget')}
                  className="min-w-[114px] rounded-[12px] border border-transparent bg-transparent px-2.5 py-2 text-left transition-all hover:border-[var(--seller-border)] hover:bg-white/80"
                  aria-label="查看推广金详情"
                  title="查看推广金详情"
                >
                  <ResourceTile
                    icon={<Wallet size={15} />}
                    label={runShellProjection.resourceTiles.budget.label}
                    value={runShellProjection.resourceTiles.budget.value}
                    color="text-slate-900"
                    trailing={(
                      <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-400">
                        <span>明细</span>
                        <ChevronRight size={13} />
                      </div>
                    )}
                  />
                </button>
                <div className="h-8 w-px bg-slate-100" />
                <button
                  type="button"
                  onClick={() => setActiveResourcePanel('auxiliary')}
                  className="min-w-[112px] rounded-[12px] border border-transparent bg-transparent px-2.5 py-2 text-left transition-all hover:border-[var(--seller-border)] hover:bg-white/80"
                  aria-label="查看成交与佣金详情"
                  title="查看成交与佣金详情"
                >
                  <ResourceTile
                    icon={<CircleDollarSign size={15} />}
                    label={runShellProjection.resourceTiles.auxiliary.label}
                    value={runShellProjection.resourceTiles.auxiliary.value}
                    color="text-slate-700"
                    trailing={<ResourceDetailHint />}
                  />
                </button>
                <div className="h-8 w-px bg-slate-100" />
                <button
                  type="button"
                  onClick={() => setActiveResourcePanel('energy')}
                  className="min-w-[90px] rounded-[12px] border border-transparent bg-transparent px-2.5 py-2 text-left transition-all hover:border-[var(--seller-border)] hover:bg-white/80"
                  aria-label="查看今日精力详情"
                  title="查看今日精力详情"
                >
                  <ResourceTile
                    icon={<Zap size={15} />}
                    label={runShellProjection.resourceTiles.energy.label}
                    value={runShellProjection.resourceTiles.energy.value}
                    color="text-amber-600"
                    trailing={<ResourceDetailHint />}
                  />
                </button>
              </div>

              <div className="seller-band flex items-center gap-1 p-1">
                <button
                  onClick={() => handleAdvanceDays(7, displayMessage)}
                  disabled={state.gameOver}
                  className="seller-button-secondary flex h-11 items-center gap-1.5 px-3.5 disabled:opacity-50"
                >
                  <FastForward size={16} />
                  <span>推进一周</span>
                </button>
                <button
                  onClick={() => handleAdvanceDays(1, displayMessage)}
                  disabled={state.gameOver}
                  className="seller-button-primary h-11 px-3.5 shadow-[var(--seller-shadow-sm)] disabled:opacity-50"
                >
                  结束今日
                </button>
              </div>
            </div>
          </div>
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

          <div className="fixed bottom-5 right-6 z-40 flex items-center gap-2">
            <button
              type="button"
              onClick={() => setJournalOpen(true)}
              className="seller-button-secondary flex items-center gap-1.5 rounded-full px-3 py-2 backdrop-blur"
            >
              <History size={14} />
              <span>经营记录</span>
            </button>
            <button
              onClick={handleReset}
              className="seller-button-secondary flex items-center gap-1.5 rounded-full px-3 py-2 text-[var(--seller-muted)] backdrop-blur hover:border-[color:var(--seller-risk)] hover:bg-[var(--seller-risk-soft)] hover:text-[color:var(--seller-risk)]"
            >
              <RefreshCw size={14} />
              <span>重开本局</span>
            </button>
          </div>

          <CompactMatterStrip
            matter={runShellProjection.sidebar.matter}
            journal={runShellProjection.sidebar.journal}
            onOpenMatter={(caseId) => {
              if (caseId) {
                handleSelectCase(caseId);
                setActiveView('cases');
                return;
              }
              setActiveView('overview');
            }}
            onOpenJournal={() => setJournalOpen(true)}
          />

          <Suspense fallback={viewFallback}>
            {renderView()}
          </Suspense>
        </main>

        <aside className="hidden w-[332px] shrink-0 border-l border-[var(--seller-border)] bg-[linear-gradient(180deg,rgba(244,241,235,0.92),rgba(251,250,247,0.98))] xl:flex xl:flex-col">
          <div className="border-b border-[var(--seller-border)] px-5 py-4">
            <div className="seller-label flex items-center gap-2">
              <Target size={14} />
              今日工作台
            </div>
            <h3 className="seller-title mt-1 text-[1.2rem] text-[var(--seller-ink)]">先做什么，为什么现在做</h3>
            <p className="seller-body mt-1 text-[12px]">
              先看今天要处理的事，再看依据、外部变化和已经留下的记录。
            </p>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4">
            <SidebarFocusCard
              title={runShellProjection.sidebar.focus.title}
              detail={runShellProjection.sidebar.focus.detail}
              eyebrow={runShellProjection.sidebar.focus.eyebrow}
              badges={runShellProjection.sidebar.focus.badges}
              onOpen={runShellProjection.sidebar.focus.caseId
                ? () => {
                  handleSelectCase(runShellProjection.sidebar.focus.caseId!);
                  setActiveDetailPanel('selected-case');
                }
                : undefined}
            />

            <MatterWorkPanel
              matter={runShellProjection.sidebar.matter}
              onOpen={(caseId) => {
                if (!caseId) {
                  setActiveView('overview');
                  return;
                }
                handleSelectCase(caseId);
                setActiveView('cases');
              }}
              onOpenMarket={() => setActiveView('market')}
            />

            <SidebarSection
              icon={<Clock3 size={14} />}
              title="待处理"
              items={runShellProjection.sidebar.actionCues}
              emptyText="今天没有新的明确待办，先把正在推进的房源跟住。"
              onOpen={(caseId) => {
                if (!caseId) return;
                handleSelectCase(caseId);
                setActiveView('cases');
              }}
            />

            <SidebarSection
              icon={<ShieldAlert size={14} />}
              title="风险提醒"
              items={runShellProjection.sidebar.riskCues}
              emptyText="当前没有新的高优先级风险，先按现在的顺序推进。"
              onOpen={(caseId) => {
                if (!caseId) return;
                handleSelectCase(caseId);
                setActiveView('cases');
              }}
            />

            <SidebarSection
              icon={<Newspaper size={14} />}
              title="市场变化"
              items={runShellProjection.sidebar.marketCues}
              emptyText="今天市场层面还没有新的明确变化。"
              onOpen={(caseId) => {
                if (caseId) {
                  handleSelectCase(caseId);
                  setActiveView('cases');
                  return;
                }
                setActiveView('market');
              }}
            />

            <button
              type="button"
              onClick={() => setJournalOpen(true)}
              className="seller-panel mt-4 w-full px-4 py-4 text-left transition hover:border-[var(--seller-border-strong)] hover:bg-white"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="seller-label">经营记录</div>
                  <div className="mt-1 text-[15px] font-semibold text-[var(--seller-ink)]">{runShellProjection.sidebar.journal.lastTitle}</div>
                </div>
                <div className="seller-chip bg-[var(--seller-ink)] text-white">
                  {runShellProjection.sidebar.journal.todayCount} 条
                </div>
              </div>
              <p className="seller-body mt-2 text-[12px]">{runShellProjection.sidebar.journal.brief}</p>
              <div className="mt-3 grid grid-cols-3 gap-2">
                <JournalMiniStat label="昨日变化" value={`${runShellProjection.sidebar.journal.yesterdayCount}`} />
                <JournalMiniStat label="丢盘风险" value={`${runShellProjection.sidebar.journal.riskCount}`} tone="risk" />
                <JournalMiniStat label="成交线索" value={`${runShellProjection.sidebar.journal.chanceCount}`} tone="chance" />
              </div>
            </button>
          </div>
        </aside>
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
          className="fixed inset-0 z-[95] flex items-end justify-center bg-slate-900/30 backdrop-blur-sm"
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
                <h3 className="seller-title mt-2 text-[26px]">整局记录</h3>
                <p className="seller-body mt-2 text-[13px]">
                  {runShellProjection.sidebar.journal.brief} 从这里回看整局事实、今天变化和当前房源变化。
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
          className="fixed inset-0 z-[94] flex justify-end bg-slate-900/30 backdrop-blur-sm"
          onClick={() => setActiveDetailPanel(null)}
        >
          <div
            className="seller-panel-muted h-full w-full max-w-[640px] overflow-y-auto rounded-none border-l p-7 shadow-[var(--seller-shadow-lg)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div className="max-w-[420px]">
                <div className="seller-label flex items-center gap-2">
                  <Home size={13} className="text-[var(--seller-accent)]" />
                  当前房源详情
                </div>
                <h3 className="seller-title mt-2 text-[28px]">
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
        <div className="fixed inset-0 z-[90] flex justify-end bg-slate-900/30 backdrop-blur-sm" onClick={() => setActiveResourcePanel(null)}>
          <div
            className="h-full w-full max-w-[560px] overflow-y-auto border-l border-black/5 bg-[linear-gradient(180deg,#fffdf8_0%,#ffffff_28%)] p-7 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-6 flex items-start justify-between gap-4">
              <div className="max-w-[360px]">
                <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
                  {activeResourcePanel === 'energy'
                    ? <Zap size={13} className="text-amber-500" />
                    : <CircleDollarSign size={13} className="text-emerald-500" />}
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
                      <div className="mt-2 text-[38px] font-bold tracking-tight text-emerald-950">{runShellProjection.budgetPanel.balanceLabel}</div>
                      <div className="mt-2 max-w-md text-sm leading-6 text-emerald-800/80">
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
                  <div className="rounded-[20px] border border-black/[0.05] bg-white px-4 py-4 shadow-sm">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">规则摘要</div>
                    <div className="mt-3 space-y-3 text-sm text-slate-600">
                      {runShellProjection.budgetPanel.rules.map((entry) => (
                        <div key={entry.label} className="flex items-start justify-between gap-3">
                          <span>{entry.label}</span>
                          <strong className="text-slate-900">{entry.value}</strong>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[20px] border border-amber-100 bg-amber-50/80 px-4 py-4">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">资源说明</div>
                    <p className="mt-3 text-sm leading-6 text-amber-900/85">
                      {runShellProjection.budgetPanel.note}
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
                  {runShellProjection.budgetPanel.entries.map((entry) => (
                    <div key={entry.id} className="rounded-[18px] border border-black/[0.04] bg-white px-4 py-4 shadow-sm">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-semibold text-slate-800">{entry.title}</div>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">
                              {entry.dayLabel}
                            </span>
                          </div>
                          <div className="mt-1.5 text-xs leading-relaxed text-slate-500">{entry.detail}</div>
                        </div>
                        <div className="min-w-[92px] text-right">
                          <div className={`text-base font-bold ${entry.positive ? 'text-emerald-600' : 'text-rose-500'}`}>
                            {entry.amountLabel}
                          </div>
                          <div className="mt-1 text-[10px] font-medium text-slate-400">{entry.balanceLabel}</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {runShellProjection.budgetPanel.entries.length === 0 && (
                    <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
                      暂时还没有推广金流水，先做一笔经营动作再回来看看。
                    </div>
                  )}
                </div>
              </>
            )}

            {activeResourcePanel === 'auxiliary' && (
              <>
                <div className="mb-5 rounded-[28px] border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-sky-50 px-5 py-5">
                  <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">辅助经营数据</div>
                      <div className="mt-2 text-[38px] font-bold tracking-tight text-emerald-950">{runShellProjection.auxiliaryPanel.commissionLabel}</div>
                      <div className="mt-2 max-w-md text-sm leading-6 text-emerald-800/80">
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
                  <div className="rounded-[20px] border border-black/[0.05] bg-white px-4 py-4 shadow-sm">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">规则摘要</div>
                    <div className="mt-3 space-y-3 text-sm text-slate-600">
                      {runShellProjection.auxiliaryPanel.rules.map((entry) => (
                        <div key={entry.label} className="flex items-start justify-between gap-3">
                          <span>{entry.label}</span>
                          <strong className="text-slate-900">{entry.value}</strong>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[20px] border border-emerald-100 bg-emerald-50/80 px-4 py-4">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">怎么看这组数</div>
                    <p className="mt-3 text-sm leading-6 text-emerald-900/85">
                      {runShellProjection.auxiliaryPanel.note}
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
                  {runShellProjection.auxiliaryPanel.soldCases.map((entry) => (
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
                            {entry.detail}
                          </div>
                        </div>
                        <div className="min-w-[96px] text-right">
                          <div className="text-base font-bold text-emerald-600">{entry.commissionLabel}</div>
                          <div className="mt-1 text-[10px] font-medium text-slate-400">佣金</div>
                        </div>
                      </div>
                    </div>
                  ))}
                  {runShellProjection.auxiliaryPanel.soldCases.length === 0 && (
                    <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-400">
                      这局还没有成交，佣金会在第一套房成交后开始累计。
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
                      <div className="mt-2 text-[38px] font-bold tracking-tight text-amber-950">{runShellProjection.energyPanel.energyLabel}</div>
                      <div className="mt-2 max-w-md text-sm leading-6 text-amber-900/80">
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
                  <div className="rounded-[20px] border border-black/[0.05] bg-white px-4 py-4 shadow-sm">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">规则摘要</div>
                    <div className="mt-3 space-y-3 text-sm text-slate-600">
                      {runShellProjection.energyPanel.rules.map((entry) => (
                        <div key={entry.label} className="flex items-start justify-between gap-3">
                          <span>{entry.label}</span>
                          <strong className="text-slate-900">{entry.value}</strong>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-[20px] border border-amber-100 bg-amber-50/80 px-4 py-4">
                    <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-amber-700">资源说明</div>
                    <p className="mt-3 text-sm leading-6 text-amber-900/85">
                      {runShellProjection.energyPanel.note}
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div className="flex items-end justify-between gap-3 px-1">
                    <div>
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">接下来几天</div>
                      <p className="mt-1 text-xs text-slate-500">精力不是每天都一样，高成本动作最好放在余量更宽的时候。</p>
                    </div>
                    <div className="text-[11px] font-semibold text-slate-400">未来 4 天</div>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {runShellProjection.energyPanel.rhythm.map((entry) => (
                      <div key={entry.key} className="rounded-[18px] border border-black/[0.04] bg-white px-4 py-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{entry.label}</div>
                            <div className="mt-1 text-sm font-semibold text-slate-800">{entry.title}</div>
                          </div>
                          <div className="rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700">
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

function CompactMatterStrip({
  matter,
  journal,
  onOpenMatter,
  onOpenJournal,
}: {
  matter: ReturnType<typeof buildWorkspaceShellProjection>['sidebar']['matter'];
  journal: ReturnType<typeof buildWorkspaceShellProjection>['sidebar']['journal'];
  onOpenMatter: (caseId?: string) => void;
  onOpenJournal: () => void;
}) {
  const lead = matter.actionItems[0];

  return (
    <section className="mb-3 rounded-[18px] border border-[#e7dccd] bg-[#fffdf8] px-3.5 py-3 shadow-sm xl:hidden">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#9a6a31]">
            <Target size={13} />
            今日工作面
          </div>
          <h3 className="mt-1 truncate text-[15px] font-semibold tracking-tight text-[#241a12]">{matter.headline}</h3>
          <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-[#6b5948]">{matter.summary}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => onOpenMatter(lead?.caseId)}
            className="rounded-full bg-[#2b2118] px-3 py-2 text-[11px] font-bold text-[#fff6df]"
          >
            打开今日优先
          </button>
          <button
            type="button"
            onClick={onOpenJournal}
            className="rounded-full border border-[#d9cbb8] bg-white px-3 py-2 text-[11px] font-bold text-[#5f4b37]"
          >
            流水 {journal.todayCount}
          </button>
        </div>
      </div>
    </section>
  );
}

function MatterWorkPanel({
  matter,
  onOpen,
  onOpenMarket,
}: {
  matter: ReturnType<typeof buildWorkspaceShellProjection>['sidebar']['matter'];
  onOpen: (caseId?: string) => void;
  onOpenMarket: () => void;
}) {
  return (
    <section className="mt-4 rounded-[22px] border border-[#e7dccd] bg-[#fffdf8] p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-[#9a6a31]">
            <Target size={14} />
            事项工作面
          </div>
          <h4 className="mt-1 text-[15px] font-semibold tracking-tight text-[#241a12]">{matter.headline}</h4>
        </div>
      </div>
      <p className="mt-2 text-[12px] leading-6 text-[#6b5948]">{matter.summary}</p>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {matter.stats.map((entry) => (
          <React.Fragment key={entry.label}>
            <MatterStat entry={entry} />
          </React.Fragment>
        ))}
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#9a6a31]">今日优先</div>
          <span className="text-[10px] font-semibold text-[#8a7762]">{matter.actionItems.length} 项</span>
        </div>
        <div className="space-y-2">
          {matter.actionItems.slice(0, 3).map((item) => (
            <React.Fragment key={item.id}>
              <MatterCueButton item={item} onOpen={() => onOpen(item.caseId)} />
            </React.Fragment>
          ))}
          {matter.actionItems.length === 0 && (
            <div className="rounded-[14px] border border-dashed border-[#d9cbb8] bg-white px-3 py-4 text-[12px] leading-5 text-[#8a7762]">
              今日没有明确待办，先守住当前主线。
            </div>
          )}
        </div>
      </div>

      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-[#9a6a31]">昨日情报 / 竞品压力</div>
          <button
            type="button"
            onClick={onOpenMarket}
            className="rounded-full border border-[#d9cbb8] bg-white px-2.5 py-1 text-[10px] font-bold text-[#5f4b37] transition hover:bg-[#fff7e7]"
          >
            去市场
          </button>
        </div>
        <div className="space-y-2">
          {matter.intelligenceItems.slice(0, 2).map((item) => (
            <React.Fragment key={item.id}>
              <MatterCueButton item={item} onOpen={() => item.caseId ? onOpen(item.caseId) : onOpenMarket()} />
            </React.Fragment>
          ))}
          {matter.intelligenceItems.length === 0 && (
            <div className="rounded-[14px] border border-dashed border-[#d9cbb8] bg-white px-3 py-4 text-[12px] leading-5 text-[#8a7762]">
              暂时没有会改变顺序的昨日情报。
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function MatterStat({
  entry,
}: {
  entry: ReturnType<typeof buildWorkspaceShellProjection>['sidebar']['matter']['stats'][number];
}) {
  return (
    <div className={`rounded-[14px] border px-2.5 py-2 ${
      entry.tone === 'risk'
        ? 'border-[#e6b8a8] bg-[#fff4ef]'
        : entry.tone === 'chance'
          ? 'border-[#c9d8bc] bg-[#f4f8ed]'
          : 'border-[#eadfce] bg-white'
    }`}>
      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#8a7762]">{entry.label}</div>
      <div className="mt-0.5 text-[16px] font-semibold text-[#241a12]">{entry.value}</div>
      <p className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-[#766551]">{entry.detail}</p>
    </div>
  );
}

function MatterCueButton({
  item,
  onOpen,
}: {
  item: WorkspaceShellSidebarCueProjection;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`w-full rounded-[14px] border px-3 py-2.5 text-left transition ${
        item.tone === 'risk'
          ? 'border-[#e6b8a8] bg-[#fff4ef] hover:bg-[#ffeee6]'
          : item.tone === 'chance'
            ? 'border-[#c9d8bc] bg-[#f4f8ed] hover:bg-[#edf5e2]'
            : 'border-[#eadfce] bg-white hover:bg-[#fff7e7]'
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-[#7b5b35]">
          {item.label}
        </span>
        {item.caseId && <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-[#9a8a76]">房源</span>}
      </div>
      <div className="mt-1 text-[12px] font-semibold leading-5 text-[#2b2118]">{item.title}</div>
      <p className="mt-0.5 line-clamp-2 text-[11px] leading-5 text-[#766551]">{item.detail}</p>
    </button>
  );
}

function JournalMiniStat({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'risk' | 'chance';
}) {
  return (
    <div className={`rounded-[13px] border px-2 py-2 ${
      tone === 'risk'
        ? 'border-rose-200 bg-rose-50/70'
        : tone === 'chance'
          ? 'border-emerald-200 bg-emerald-50/70'
          : 'border-black/[0.05] bg-slate-50'
    }`}>
      <div className="text-[9px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="mt-0.5 text-[13px] font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function SidebarFocusCard({
  eyebrow,
  title,
  detail,
  badges,
  onOpen,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  badges: string[];
  onOpen?: () => void;
}) {
  const content = (
    <div className="rounded-[22px] border border-black/[0.05] bg-slate-950 px-4 py-4 text-white shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">{eyebrow}</div>
      <div className="mt-2 text-[17px] font-semibold tracking-tight">{title}</div>
      <p className="mt-2 text-[12px] leading-6 text-slate-300">{detail}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {badges.map((badge) => (
          <span
            key={badge}
            className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-200"
          >
            {badge}
          </span>
        ))}
      </div>
    </div>
  );

  if (!onOpen) {
    return content;
  }

  return (
    <button type="button" onClick={onOpen} className="w-full text-left">
      {content}
    </button>
  );
}

function SidebarSection({
  icon,
  title,
  items,
  emptyText,
  onOpen,
}: {
  icon: React.ReactNode;
  title: string;
  items: Array<{
    id: string;
    label: string;
    title: string;
    detail: string;
    tone: 'neutral' | 'chance' | 'risk';
    caseId?: string;
  }>;
  emptyText: string;
  onOpen: (caseId?: string) => void;
}) {
  return (
    <section className="mt-4 rounded-[22px] border border-black/[0.05] bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">
        {icon}
        {title}
      </div>
      <div className="mt-3 space-y-2.5">
        {items.length > 0 ? items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onOpen(item.caseId)}
            className={`w-full rounded-[18px] border px-3 py-3 text-left transition ${
              item.tone === 'risk'
                ? 'border-rose-200 bg-rose-50/70 hover:bg-rose-50'
                : item.tone === 'chance'
                  ? 'border-emerald-200 bg-emerald-50/70 hover:bg-emerald-50'
                  : 'border-black/[0.05] bg-slate-50/70 hover:bg-slate-50'
            }`}
          >
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{item.label}</div>
            <div className="mt-1 text-[13px] font-semibold text-slate-900">{item.title}</div>
            <p className="mt-1 text-[12px] leading-6 text-slate-500">{item.detail}</p>
          </button>
        )) : (
          <div className="rounded-[18px] border border-dashed border-slate-200 bg-slate-50 px-3 py-5 text-[12px] leading-6 text-slate-400">
            {emptyText}
          </div>
        )}
      </div>
    </section>
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
      <div className="rounded-[22px] border border-black/[0.05] bg-slate-950 px-4 py-4 text-white shadow-sm">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-300">当前主矛盾</div>
        <div className="mt-2 text-[18px] font-semibold tracking-tight">{projection.mainProblemLabel}</div>
        <p className="mt-2 text-[12px] leading-6 text-slate-300">{projection.actionReasons[0]?.detail || projection.ownerSummary.detail}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {projection.currentRiskTags.slice(0, 3).map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-white/10 bg-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-200"
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
            `快成交 ${projection.customerPoolSummary.closingCount}`,
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

      <section className="rounded-[22px] border border-black/[0.05] bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">下一步</div>
            <div className="mt-1 text-[15px] font-semibold text-slate-900">这套房接下来先做什么</div>
          </div>
          <button
            type="button"
            onClick={onOpenFull}
            className="rounded-full bg-slate-900 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white hover:bg-slate-700"
          >
            打开房源页
          </button>
        </div>
        <div className="mt-3 space-y-2.5">
          {projection.actionReasons.slice(0, 3).map((reason) => (
            <div
              key={reason.id}
              className={`rounded-[18px] border px-3 py-3 ${
                reason.tone === 'risk'
                  ? 'border-rose-200 bg-rose-50/70'
                  : reason.tone === 'chance'
                    ? 'border-emerald-200 bg-emerald-50/70'
                    : 'border-black/[0.05] bg-slate-50/70'
              }`}
            >
              <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">{reason.label}</div>
              <div className="mt-1 text-[13px] font-semibold text-slate-900">{reason.title}</div>
              <p className="mt-1 text-[12px] leading-6 text-slate-500">{reason.detail}</p>
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
    <section className="rounded-[22px] border border-black/[0.05] bg-white p-4 shadow-sm">
      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400">{label}</div>
      <div className="mt-1 text-[15px] font-semibold text-slate-900">{title}</div>
      <p className="mt-2 text-[12px] leading-6 text-slate-500">{detail}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        {chips.map((chip) => (
          <span
            key={chip}
            className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-slate-600"
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
      className={`flex h-11 shrink-0 items-center gap-2 rounded-[14px] px-3.5 text-[12px] font-bold transition-all ${
        active
          ? 'border border-slate-200 bg-[linear-gradient(180deg,#2F3C4F,#243244)] text-white shadow-[0_8px_18px_rgba(36,50,68,0.16)]'
          : 'border border-transparent text-slate-500 hover:bg-white hover:text-slate-900'
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
          <span className="mb-1 text-[10px] font-bold uppercase tracking-tight text-slate-300">{label}</span>
          <span className={`text-[13px] font-bold ${color}`}>{value}</span>
        </div>
      </div>
      {trailing}
    </div>
  );
}

function ResourceDetailHint() {
  return (
    <div className="flex items-center gap-1 text-[10px] font-semibold text-slate-400">
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

function WorkspacePanelSkeleton() {
  return (
    <div className="min-h-[420px]">
      <LoadingScene
        compact
        title="正在准备当前页面"
        subtitle="读取模块内容，马上就好…"
        steps={['读取模块', '整理数据', '渲染页面']}
      />
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
