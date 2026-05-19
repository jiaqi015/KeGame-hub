import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronRight,
  CircleDollarSign,
  FastForward,
  Megaphone,
  History,
  Home,
  LayoutDashboard,
  LineChart,
  Medal,
  MessageSquare,
  Moon,
  SquareUserRound,
  Sun,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { ConfirmBackButton } from '../components/Common/ConfirmBackButton';
import { LoadingScene } from '../components/Common/LoadingScene';
import { useGame } from './application/useGame';
import {
  getSellingHousesStorageProfileLabel,
  isDefaultSellingHousesStorageProfile,
  type SellingHousesStorageProfile,
} from './application/storageProfile';
import {
  buildWorkspaceShellProjection,
} from './application/projections/workspaceShellProjection';
import { buildOperatingProjection } from './application/projections/operatingProjection';
import { buildWeeklySummaryPresentation, type WeeklySummaryPresentation } from './application/weeklySummary';
import type { ArrangementItemProjection, ProductOpportunityProjection } from './application/projections/operatingProjection';
import type { Settlement } from './domain/actions/templates';
import type { Case, TodayArrangementSlot } from './domain/models';
import { ActionDecisionOverlay, buildActionDecisionConfig } from './ui/features/ActionDecisionOverlay';
import { getActionAvailability } from './domain/engine';
import { DailyJournal } from './ui/widgets/DailyJournal';
import { Dashboard } from './ui/features/Dashboard';
import { LiquidGlassSurface } from './ui/widgets/LiquidGlassSurface';
import { WorkspaceUtilityBar } from './ui/widgets/WorkspaceUtilityBar';

const Cases = lazy(() => import('./ui/features/Cases').then((module) => ({ default: module.Cases })));
const Opportunities = lazy(() => import('./ui/features/Opportunities').then((module) => ({ default: module.Opportunities })));
const Market = lazy(() => import('./ui/features/Market').then((module) => ({ default: module.Market })));
const ProfilePanel = lazy(() => import('./ui/features/ProfilePanel').then((module) => ({ default: module.ProfilePanel })));
const ResultOverlay = lazy(() => import('./ui/features/ResultOverlay').then((module) => ({ default: module.ResultOverlay })));
const DailySummaryOverlay = lazy(() => import('./ui/features/DailySummaryOverlay').then((module) => ({ default: module.DailySummaryOverlay })));
const WeeklySummaryOverlay = lazy(() => import('./ui/features/WeeklySummaryOverlay').then((module) => ({ default: module.WeeklySummaryOverlay })));
const LeaderboardOverlay = lazy(() => import('./ui/features/LeaderboardOverlay').then((module) => ({ default: module.LeaderboardOverlay })));
const ScenarioSetup = lazy(() => import('./ui/features/ScenarioSetup').then((module) => ({ default: module.ScenarioSetup })));

const ADVANCE_LOCK_RELEASE_DELAY_MS = 650;

export function preloadSellingHousesPrimaryViews() {
  return Promise.all([
    import('./ui/features/ScenarioSetup'),
  ]);
}

type ResourcePanelType = 'budget' | 'auxiliary' | 'energy';
type WorkspaceView = 'overview' | 'cases' | 'customers' | 'market' | 'profile';
type MarketEntryLayer = 'macro' | 'district' | 'competition' | 'listing';
type DetailPanelType = 'selected-case';
type ActiveTodayScenario = {
  todayPlanItemId: string | null;
  actionId: string;
  caseId: string;
};
type FocusMeetingSubmitDraft = {
  todayPlanItemId: string | null;
  initialCaseId: string | null;
};
type FocusMeetingSubmitResult = {
  submittedCaseIds: string[];
  selectedCaseId: string;
  optionId: string;
  externalRivalListingIds: string[];
  comparingCustomerIds: string[];
};
type FocusMeetingStage = 'submit' | 'compare' | 'promote';
type FocusMeetingSubmittedEntry = {
  caseItem: Case;
  score: number;
  summary: ReturnType<typeof buildOperatingProjection>['cases'][number] | null;
};
type FocusMeetingCaseSummary = ReturnType<typeof buildOperatingProjection>['cases'][number];

interface SellingHousesWorkspaceProps {
  activationKey: string;
  currentUserAccountId?: string;
  currentUserNickname?: string;
  currentUserEmail?: string;
  storageProfile?: SellingHousesStorageProfile;
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
  storageProfile = 'default',
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
    syncWarning,
    loadLeaderboardDetail,
    startFeaturedRun,
    startRandomGeneratedRun,
    handleSelectCase,
    handleAdvanceDaysWithSummary,
    handleExecuteAction,
    handleExecuteScenarioAction,
    handleAddTodayPlanItem,
    handleRemoveTodayPlanItem,
    handleExecuteTodayPlanItem,
    handleReset,
    handleClearReport,
  } = useGame({
    activationKey,
    accountId: currentUserAccountId,
    email: currentUserEmail,
    nickname: currentUserNickname,
    storageProfile,
  });

  const [activeView, setActiveView] = useState<WorkspaceView>('overview');
  const [marketEntryLayer, setMarketEntryLayer] = useState<MarketEntryLayer>('macro');
  const [activeResourcePanel, setActiveResourcePanel] = useState<ResourcePanelType | null>(null);
  const [selectedCaseIdOverride, setSelectedCaseIdOverride] = useState<string | null>(null);
  const [journalOpen, setJournalOpen] = useState(false);
  const [activeDetailPanel, setActiveDetailPanel] = useState<DetailPanelType | null>(null);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [activeTodayScenario, setActiveTodayScenario] = useState<ActiveTodayScenario | null>(null);
  const [focusMeetingSubmitDraft, setFocusMeetingSubmitDraft] = useState<FocusMeetingSubmitDraft | null>(null);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [weeklySummary, setWeeklySummary] = useState<WeeklySummaryPresentation | null>(null);
  const [wechatReadIds, setWechatReadIds] = useState<Set<string>>(() => new Set());
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try { return (localStorage.getItem('seller-theme') as 'dark' | 'light') || 'dark'; } catch { return 'dark'; }
  });
  const toggleTheme = () => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem('seller-theme', next); } catch { /* ignore */ }
      return next;
    });
  };
  const mainScrollRef = useRef<HTMLElement | null>(null);
  const workspaceContentRef = useRef<HTMLDivElement | null>(null);
  const advancingLockRef = useRef(false);
  const viewFallback = useMemo(() => <WorkspacePanelSkeleton />, []);
  const overlayFallback = useMemo(() => <WorkspaceOverlaySkeleton />, []);
  const shellProjection = useMemo(() => (state ? buildWorkspaceShellProjection(state) : null), [state]);
  const wechatReadScopeKey = state
    ? `${state.runContext.createdAt}:${state.runContext.runSeed}:${state.runContext.difficultyId}`
    : 'no-run';
  const isDefaultProfile = isDefaultSellingHousesStorageProfile(storageProfile);
  const storageProfileLabel = getSellingHousesStorageProfileLabel(storageProfile);
  const activeScenarioCase = state && activeTodayScenario
    ? state.cases.find((entry) => entry.id === activeTodayScenario.caseId) || null
    : null;
  const activeScenarioConfig = state && activeTodayScenario && activeScenarioCase
    ? buildActionDecisionConfig(state, activeScenarioCase, activeTodayScenario.actionId)
    : null;
  const activeTodayPlanItem = state && activeTodayScenario?.todayPlanItemId
    ? state.todayPlan.playerItems.find(item => item.id === activeTodayScenario.todayPlanItemId)
    : null;
  const activeMatter = state && activeTodayPlanItem?.sourceMatterId
    ? state.matters.find(m => m.id === activeTodayPlanItem.sourceMatterId)
    : undefined;
  const focusMeetingOptions = useMemo(
    () => state
      ? state.cases
        .filter((caseItem) => caseItem.status === 'active')
        .map((caseItem) => ({
          caseItem,
          score: Math.round(caseItem.heat * 0.42 + caseItem.competitiveness * 0.36 + caseItem.trust * 0.22),
        }))
        .sort((left, right) => right.score - left.score)
      : [],
    [state],
  );
  const focusMeetingProjection = useMemo(
    () => (state ? buildOperatingProjection(state) : null),
    [state],
  );
  const focusMeetingCaseSummaries = useMemo(
    () => new Map(focusMeetingProjection?.cases.map((entry) => [entry.caseId, entry]) || []),
    [focusMeetingProjection],
  );

  const releaseWorkspaceFocus = () => {
    const activeElement = document.activeElement;
    if (activeElement instanceof HTMLElement && workspaceContentRef.current?.contains(activeElement)) {
      activeElement.blur();
    }
  };

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      mainScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeView, state?.day]);

  useEffect(() => {
    if (!state) {
      setWeeklySummary(null);
    }
  }, [state]);

  useEffect(() => {
    setWechatReadIds(new Set());
  }, [wechatReadScopeKey]);

  useEffect(() => {
    if (activeTodayScenario && !activeScenarioConfig) {
      setActiveTodayScenario(null);
    }
  }, [activeScenarioConfig, activeTodayScenario]);

  useEffect(() => {
    if (!activeTodayScenario || !state) {
      return;
    }

    if (!activeTodayScenario.todayPlanItemId) {
      return;
    }

    const activeItem = state.todayPlan.playerItems.find((entry) => entry.id === activeTodayScenario.todayPlanItemId) || null;
    if (!activeItem || activeItem.status !== 'planned') {
      setActiveTodayScenario(null);
    }
  }, [activeTodayScenario, state]);

  const displayMessage = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 3000);
  };

  const closeTransientPanels = () => {
    setActiveResourcePanel(null);
    setActiveDetailPanel(null);
    setJournalOpen(false);
    setActiveTodayScenario(null);
    setLeaderboardOpen(false);
    setLeaderboardError(null);
  };

  const resetToNewDayView = () => {
    closeTransientPanels();
    setActiveView('overview');
    setMarketEntryLayer('macro');
  };

  const resetTestProfile = async () => {
    if (isDefaultProfile || starting) {
      return;
    }

    releaseWorkspaceFocus();
    advancingLockRef.current = false;
    setIsAdvancing(false);
    resetToNewDayView();
    handleReset();
    await startFeaturedRun('standard');
    displayMessage(`${storageProfileLabel}已重置到 Day 1。`);
  };

  if (phase === 'loading') {
    return (
      <LoadingScene
        title="正在恢复进度"
      />
    );
  }

  if (phase === 'setup' || !state) {
    return (
      <div data-theme={theme} className="selling-houses-shell relative flex h-full flex-col overflow-hidden text-[var(--seller-ink)]">
        <div className="absolute right-4 top-4 z-20 flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--seller-border)] bg-[rgba(11,17,24,0.88)] text-[var(--seller-muted)] transition-all hover:bg-[rgba(11,17,24,0.96)] hover:text-[var(--seller-ink)]"
            title={theme === 'dark' ? '切换浅色模式' : '切换深色模式'}
          >
            {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
          </button>
          {!isDefaultProfile && (
            <div className="flex items-center gap-2 rounded-full border border-[var(--seller-border)] bg-[rgba(11,17,24,0.88)] px-2 py-1 shadow-[var(--seller-shadow-sm)]">
              <span className="px-2 text-[10px] font-bold text-[var(--seller-chance)]">{storageProfileLabel}</span>
              <button
                type="button"
                onClick={() => { void resetTestProfile(); }}
                disabled={starting}
                className="rounded-full border border-[var(--seller-border)] bg-[rgba(255,255,255,0.06)] px-2.5 py-1 text-[10px] font-bold text-[var(--seller-ink)] transition hover:bg-[rgba(255,255,255,0.1)] disabled:opacity-50"
              >
                重置测试档
              </button>
            </div>
          )}
        </div>
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

  const hasBlockingDailyReport = Boolean(state.currentReport && !state.gameOver);
  const hasBlockingWeeklySummary = Boolean(weeklySummary && !state.gameOver);

  const advanceByDays = (count: number) => {
    releaseWorkspaceFocus();
    if (advancingLockRef.current || isAdvancing) {
      return;
    }
    if (state.gameOver) {
      displayMessage('本局已结算');
      return;
    }
    if (hasBlockingDailyReport) {
      displayMessage('先查看今日结算。');
      return;
    }
    if (hasBlockingWeeklySummary) {
      displayMessage('先查看周经营复盘。');
      return;
    }

    advancingLockRef.current = true;
    setIsAdvancing(true);
    setWeeklySummary(null);
    resetToNewDayView();
    const summary = handleAdvanceDaysWithSummary(count, count === 1 ? displayMessage : undefined);
    if (count > 1 && summary) {
      handleClearReport();
      if (summary.settledDays > 0 && !summary.gameOver) {
        setWeeklySummary(buildWeeklySummaryPresentation(state, summary.nextState, summary.settledResults));
      }
      displayMessage(summary.gameOver
        ? '本局已结算'
        : `已连续结算 ${summary.settledDays} 天，当前到第 ${summary.afterDay} 天`);
    }
    window.setTimeout(() => {
      advancingLockRef.current = false;
      setIsAdvancing(false);
    }, ADVANCE_LOCK_RELEASE_DELAY_MS);
  };

  const continueAfterDailySummary = () => {
    resetToNewDayView();
    handleClearReport();
  };

  const continueAfterWeeklySummary = () => {
    resetToNewDayView();
    setWeeklySummary(null);
  };

  const executeActionByCaseId = (actionId: string, caseId: string) => {
    const caseItem = state.cases.find((entry) => entry.id === caseId);
    if (!caseItem) {
      displayMessage('这套房当前不在场，先刷新一下再试。');
      return false;
    }
    return handleExecuteAction(actionId, caseItem, null, displayMessage);
  };

  const enterScenarioByCaseId = (actionId: string, caseId: string) => {
    const caseItem = state.cases.find((entry) => entry.id === caseId);
    if (!caseItem) {
      displayMessage('这套房当前不在场，先刷新一下再试。');
      return false;
    }
    if (actionId === 'focus-meeting-submit') {
      const availability = getActionAvailability(state, caseItem, actionId);
      if (!availability.enabled) {
        displayMessage(availability.reason);
        return false;
      }
      releaseWorkspaceFocus();
      setFocusMeetingSubmitDraft({
        todayPlanItemId: null,
        initialCaseId: caseId,
      });
      return true;
    }
    const decision = buildActionDecisionConfig(state, caseItem, actionId);
    if (!decision) {
      return handleExecuteAction(actionId, caseItem, null, displayMessage);
    }
    releaseWorkspaceFocus();
    setActiveTodayScenario({
      todayPlanItemId: null,
      actionId,
      caseId,
    });
    return true;
  };

  const addTodayPlanFromProjection = (item: ArrangementItemProjection, slot: TodayArrangementSlot) => {
    if (!item?.actionId) {
      displayMessage('这件事还不能直接排进今天。');
      return false;
    }
    return handleAddTodayPlanItem({
      sourceMatterId: item.matterId,
      linkedActionId: item.actionId,
      linkedCaseId: item.caseId,
      linkedCustomerId: item.customerId,
      linkedOpportunityId: item.opportunityId,
      executionMode: item.executionMode === 'scenario' ? 'scenario' : 'direct',
      slot,
    }, displayMessage).success;
  };

  const captureProductOpportunity = (opportunity: ProductOpportunityProjection) => {
    const actionCase = state.cases.find((entry) => entry.id === opportunity.actionCaseId) || null;
    if (!actionCase || actionCase.status !== 'active') {
      displayMessage('当前对象已不可执行，请刷新后再试。');
      return false;
    }
    if (opportunity.status === 'expired') {
      displayMessage('这个机会已经过期了。');
      return false;
    }
    if (opportunity.status === 'accepted') {
      handleSelectCase(actionCase.id);
      setActiveView('cases');
      displayMessage(`${actionCase.title} 的${opportunity.type === 'open-day' ? '开放日' : '诚意卖'}正在推进中。`);
      return true;
    }
    return handleExecuteAction(opportunity.actionId, actionCase, null, displayMessage);
  };

  const removeTodayPlanItem = (itemId: string) => handleRemoveTodayPlanItem(itemId, displayMessage).success;
  const executeTodayPlanItem = (itemId: string) => {
    const todayPlanItem = state.todayPlan.playerItems.find((entry) => entry.id === itemId) || null;
    if (
      todayPlanItem?.status === 'planned'
      && todayPlanItem.linkedActionId === 'focus-meeting-submit'
    ) {
      releaseWorkspaceFocus();
      setFocusMeetingSubmitDraft({
        todayPlanItemId: itemId,
        initialCaseId: todayPlanItem.linkedCaseId || null,
      });
      return true;
    }
    if (
      todayPlanItem?.status === 'planned'
      && todayPlanItem.executionMode === 'scenario'
      && todayPlanItem.linkedCaseId
    ) {
      releaseWorkspaceFocus();
      setActiveTodayScenario({
        todayPlanItemId: itemId,
        actionId: todayPlanItem.linkedActionId,
        caseId: todayPlanItem.linkedCaseId,
      });
      return true;
    }

    const result = handleExecuteTodayPlanItem(itemId, null, displayMessage);
    return result.success;
  };

  const closeTodayScenario = () => setActiveTodayScenario(null);
  const closeFocusMeetingSubmit = () => setFocusMeetingSubmitDraft(null);
  const completeFocusMeetingSubmit = (caseItem: Case, result: FocusMeetingSubmitResult) => {
    handleExecuteAction(
      'focus-meeting-submit',
      caseItem,
      result.optionId,
      displayMessage,
      focusMeetingSubmitDraft?.todayPlanItemId || null,
      {
        submittedCaseIds: result.submittedCaseIds,
        selectedCaseId: result.selectedCaseId,
        recommendationMode: result.optionId,
        externalRivalListingIds: result.externalRivalListingIds,
        comparingCustomerIds: result.comparingCustomerIds,
      },
    );
    setFocusMeetingSubmitDraft(null);
  };

  const completeTodayScenario = (
    optionId: string | null,
    settlement?: Settlement,
    choices: Array<{ round: number; main: string; assist: string }> = [],
    feedbacks: Array<{ actor: string; mood: string; message: string }> = [],
  ) => {
    if (!activeTodayScenario || !activeScenarioCase) {
      setActiveTodayScenario(null);
      return;
    }

    if (settlement) {
      handleExecuteScenarioAction(
        activeTodayScenario.actionId,
        activeScenarioCase,
        settlement,
        choices,
        feedbacks,
        displayMessage,
        activeTodayScenario.todayPlanItemId,
      );
    } else {
      handleExecuteAction(
        activeTodayScenario.actionId,
        activeScenarioCase,
        optionId,
        displayMessage,
        activeTodayScenario.todayPlanItemId,
      );
    }
  };

  const openLeaderboard = async () => {
    releaseWorkspaceFocus();
    setLeaderboardOpen(true);
    setLeaderboardError(null);
    try {
      await loadLeaderboardDetail();
    } catch (error) {
      setLeaderboardError(error instanceof Error ? error.message : '游戏排行榜加载失败。');
    }
  };

  const restartAndReturnToHub = () => {
    handleReset();
    onReturnToHub();
  };

  const openView = (view: WorkspaceView) => {
    if (view !== 'cases') {
      setSelectedCaseIdOverride(null);
    }
    setActiveView(view);
  };

  const openCaseFromWechat = (caseId: string) => {
    setSelectedCaseIdOverride(caseId);
    setActiveView('cases');
  };

  const markWechatRead = (id: string) => {
    setWechatReadIds((current) => {
      if (current.has(id)) {
        return current;
      }
      const next = new Set(current);
      next.add(id);
      return next;
    });
  };

  const openSelectedCaseQuickView = (caseId?: string) => {
    if (!caseId) {
      setActiveView('overview');
      return;
    }
    releaseWorkspaceFocus();
    handleSelectCase(caseId);
    setActiveDetailPanel('selected-case');
  };

  const openViewFromChild = (view: string) => {
    if (view === 'overview' || view === 'dashboard') {
      setActiveView('overview');
      return;
    }
    if (view === 'customers' || view === 'opportunities') {
      setSelectedCaseIdOverride(null);
      setActiveView('customers');
      return;
    }
    if (view === 'cases' || view === 'market' || view === 'profile') {
      if (view !== 'cases') {
        setSelectedCaseIdOverride(null);
      }
      setActiveView(view);
      return;
    }
    setSelectedCaseIdOverride(null);
    setActiveView('overview');
  };

  const openMarketView = (layer: MarketEntryLayer = 'macro') => {
    setSelectedCaseIdOverride(null);
    setMarketEntryLayer(layer);
    setActiveView('market');
  };

  const renderView = () => {
    switch (activeView) {
      case 'overview':
        return (
          <Dashboard
            state={state}
            wechatReadIds={wechatReadIds}
            onSelectCase={handleSelectCase}
            onExecuteAction={executeActionByCaseId}
            onEnterScenarioAction={enterScenarioByCaseId}
            onAddToToday={addTodayPlanFromProjection}
            onRemoveFromToday={removeTodayPlanItem}
            onExecuteTodayItem={executeTodayPlanItem}
            onCaptureOpportunity={captureProductOpportunity}
            onSetView={openViewFromChild}
            onOpenMarket={openMarketView}
            onOpenCaseFromWechat={openCaseFromWechat}
            onMarkWechatRead={markWechatRead}
            onAdvanceToDay={(targetDay) => advanceByDays(targetDay - state.day)}
          />
        );
      case 'cases':
        return (
          <Cases
            state={state}
            theme={theme}
            selectedCaseIdOverride={selectedCaseIdOverride}
            onSelectCase={(caseId) => {
              setSelectedCaseIdOverride(null);
              handleSelectCase(caseId);
            }}
            onExecuteAction={(id, item, opt) => handleExecuteAction(id, item, opt, displayMessage)}
            onCaptureOpportunity={captureProductOpportunity}
            onExecuteScenarioAction={(actionId, caseItem, settlement, choices, feedbacks) => (
              handleExecuteScenarioAction(actionId, caseItem, settlement, choices, feedbacks, displayMessage)
            )}
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
            wechatReadIds={wechatReadIds}
            onSelectCase={handleSelectCase}
            onExecuteAction={executeActionByCaseId}
            onEnterScenarioAction={enterScenarioByCaseId}
            onAddToToday={addTodayPlanFromProjection}
            onRemoveFromToday={removeTodayPlanItem}
            onExecuteTodayItem={executeTodayPlanItem}
            onCaptureOpportunity={captureProductOpportunity}
            onSetView={openViewFromChild}
            onOpenMarket={openMarketView}
            onOpenCaseFromWechat={openCaseFromWechat}
            onMarkWechatRead={markWechatRead}
            onAdvanceToDay={(targetDay) => advanceByDays(targetDay - state.day)}
          />
        );
    }
  };

  const openJournal = () => {
    releaseWorkspaceFocus();
    setJournalOpen(true);
  };

  const openResourcePanel = (panel: ResourcePanelType) => {
    releaseWorkspaceFocus();
    setActiveResourcePanel(panel);
  };

  const activeResourceMeta = activeResourcePanel ? runShellProjection.panelMeta[activeResourcePanel] : null;
  const isOverlayOpen = Boolean(
    journalOpen
    || activeResourcePanel
    || activeDetailPanel
    || leaderboardOpen
    || activeScenarioConfig
    || hasBlockingDailyReport
    || state.gameOver,
  );

  return (
    <div data-theme={theme} className="selling-houses-shell flex h-full flex-col overflow-hidden font-sans text-[var(--seller-ink)]">
      <div
        ref={workspaceContentRef}
        aria-hidden={isOverlayOpen ? true : undefined}
        inert={isOverlayOpen ? true : undefined}
        data-seller-interaction-layer={isOverlayOpen ? 'background-inert' : 'active'}
        className={`flex min-h-0 flex-1 flex-col transition duration-200 ${isOverlayOpen ? 'pointer-events-none select-none opacity-45 blur-[1px]' : ''}`}
      >
      <header className="shrink-0 border-b border-[var(--seller-border)] bg-[rgba(11,17,24,0.96)] px-4 py-2 backdrop-blur-xl">
        <div className="flex flex-col gap-2.5">
          <LiquidGlassIfLight
            enabled={theme === 'light'}
            preset="toolbar"
            className="w-full"
            glassClassName="rounded-[18px]"
            contentClassName="seller-band flex flex-wrap items-center justify-between gap-3 px-3 py-2"
            fallbackClassName="seller-band flex flex-wrap items-center justify-between gap-3 px-3 py-2"
          >
            <div className="flex min-w-0 flex-1">
              <div className="flex min-w-0 flex-1 items-center gap-3">
                <ConfirmBackButton
                  actions={[
                    {
                      label: '重开并返回',
                      onClick: restartAndReturnToHub,
                      tone: 'danger',
                    },
                    {
                      label: '保存进度返回',
                      onClick: onReturnToHub,
                      tone: 'primary',
                    },
                  ]}
                  title="返回入口？"
                  description="你可以保留当前进度回到功能入口，也可以直接清掉这一局后返回。"
                  buttonLabel="返回"
                  buttonClassName="seller-button-secondary inline-flex h-9 shrink-0 items-center gap-1.5 px-3"
                />

                <div className="seller-separator h-8 w-px shrink-0" />

                <div className="flex min-w-0 items-center gap-3">
                  <div className="min-w-0 flex flex-wrap items-center gap-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <div className="seller-chip">
                        {difficultyLabel(runShellProjection.header.difficultyId)}
                      </div>
                      {!isDefaultProfile && (
                        <>
                          <div className="seller-chip seller-chip-chance" title="当前使用独立测试存档，不影响正式档">
                            {storageProfileLabel}
                          </div>
                          <button
                            type="button"
                            onClick={() => { void resetTestProfile(); }}
                            disabled={starting || isAdvancing}
                            className="seller-button-secondary h-8 rounded-full px-3 text-[10px] disabled:opacity-50"
                            title="只重置当前测试档，不影响正式档"
                          >
                            重置测试档
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="seller-separator h-6 w-px shrink-0" />
                  <button
                    type="button"
                    onClick={toggleTheme}
                    className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--seller-border)] bg-[rgba(255,255,255,0.04)] text-[var(--seller-muted)] transition-all hover:bg-[rgba(255,255,255,0.08)] hover:text-[var(--seller-ink)]"
                    title={theme === 'dark' ? '切换浅色模式' : '切换深色模式'}
                  >
                    {theme === 'dark' ? <Sun size={14} /> : <Moon size={14} />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end">
              <WorkspaceUtilityBar
                journalTodayCount={runShellProjection.sidebar.journal.todayCount}
                onOpenJournal={openJournal}
                onOpenLeaderboard={openLeaderboard}
              />
            </div>
          </LiquidGlassIfLight>

          <LiquidGlassIfLight
            enabled={theme === 'light'}
            preset="toolbar"
            className="w-full"
            glassClassName="rounded-[18px]"
            contentClassName="seller-panel-muted flex flex-wrap items-center justify-between gap-2 p-1.5"
            fallbackClassName="seller-panel-muted flex flex-wrap items-center justify-between gap-2 p-1.5"
          >
            <nav className="flex min-w-0 flex-1 gap-1 overflow-x-auto rounded-[15px] bg-[rgba(255,255,255,0.03)] p-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <NavItem active={activeView === 'overview'} onClick={() => openView('overview')} icon={<LayoutDashboard size={16} />} label="工作台" />
              <NavItem active={activeView === 'cases'} onClick={() => openView('cases')} icon={<Home size={16} />} label="我的房源" />
              <NavItem active={activeView === 'customers'} onClick={() => openView('customers')} icon={<Users size={16} />} label="我的客户" />
              <NavItem active={activeView === 'market'} onClick={() => openMarketView('macro')} icon={<LineChart size={16} />} label="市场雷达" />
              <NavItem active={activeView === 'profile'} onClick={() => openView('profile')} icon={<SquareUserRound size={16} />} label="玩家中心" />
            </nav>

            <div className="seller-separator hidden h-8 w-px xl:block" />

            <div className="flex flex-wrap items-center gap-1.5">
              <div className="seller-band flex items-center gap-1 p-1">
                <button
                  type="button"
                  onClick={() => openResourcePanel('budget')}
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
                  onClick={() => openResourcePanel('auxiliary')}
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
                  onClick={() => openResourcePanel('energy')}
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
                  onClick={() => advanceByDays(7)}
                  disabled={hasBlockingDailyReport || state.gameOver || isAdvancing}
                  className="seller-button-secondary flex h-11 items-center gap-1.5 rounded-[10px] px-3.5 disabled:opacity-50"
                >
                  <FastForward size={16} />
                  <span>推进一周</span>
                </button>
                <button
                  onClick={() => advanceByDays(1)}
                  disabled={hasBlockingDailyReport || state.gameOver || isAdvancing}
                  className="seller-button-primary h-11 rounded-[10px] px-3.5 shadow-[var(--seller-shadow-sm)] disabled:opacity-50"
                >
                  结束今日
                </button>
              </div>
            </div>
          </LiquidGlassIfLight>
        </div>
      </header>

      <div className="seller-shell-body flex flex-1 min-h-0 overflow-hidden">
        <main ref={mainScrollRef} className="relative min-w-0 flex-1 overflow-y-auto p-4 lg:p-5">
          {(message || syncWarning) && (
            <div className="fixed bottom-10 left-1/2 z-[120] flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-[var(--seller-border)] bg-[var(--seller-paper)] px-6 py-3 text-[var(--seller-ink)] shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-300">
              <MessageSquare size={18} className="text-emerald-400" />
              <span className="text-sm font-medium">{message || syncWarning}</span>
            </div>
          )}
          <Suspense fallback={viewFallback}>
            {renderView()}
          </Suspense>
        </main>
      </div>
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
            onContinue={continueAfterDailySummary}
          />
        </Suspense>
      )}
      {weeklySummary && !state.gameOver && (
        <Suspense fallback={overlayFallback}>
          <WeeklySummaryOverlay
            summary={weeklySummary}
            onContinue={continueAfterWeeklySummary}
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
      {activeScenarioConfig && (
        <ActionDecisionOverlay
          config={activeScenarioConfig}
          onChoose={(optionId) => {
            if (!activeScenarioConfig.isScenario) {
              completeTodayScenario(optionId || null);
            }
          }}
          onComplete={(result, choices, feedbacks) => {
            completeTodayScenario(null, result, choices, feedbacks);
          }}
          onClose={closeTodayScenario}
          state={state}
          caseItem={activeScenarioCase || undefined}
          matter={activeMatter}
        />
      )}
      {focusMeetingSubmitDraft && (
        <FocusMeetingSubmitOverlay
          cases={focusMeetingOptions}
          caseSummaries={focusMeetingCaseSummaries}
          initialCaseId={focusMeetingSubmitDraft.initialCaseId}
          submittedCaseIds={state.focusMeeting.submissionDay === state.day ? state.focusMeeting.submittedCaseIds : []}
          onSubmit={completeFocusMeetingSubmit}
          onClose={closeFocusMeetingSubmit}
        />
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
                  经营流水
                </div>
                <h3 className="seller-title mt-2 text-[22px]">今天变化与全局记录</h3>
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
                  {runShellProjection.selectedCaseDetail.community} · {runShellProjection.selectedCaseDetail.district} · {runShellProjection.selectedCaseDetail.projection.listingLifecyclePhase.completionStateLabel || runShellProjection.selectedCaseDetail.projection.listingLifecyclePhase.phaseLabel}
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
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">怎么算</div>
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
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-chance)]">当前状态</div>
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
                      暂时还没有推广金流水，做出第一笔经营动作后这里会更新。
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
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">当前构成</div>
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
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-chance)]">当前状态</div>
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
                      <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">今日精力（当前可用 / 今日上限）</div>
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
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">当前构成</div>
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
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-accent)]">精力口径说明</div>
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
        <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">房源阶段</div>
        <div className="mt-2 text-[17px] font-semibold tracking-[-0.03em] text-[var(--seller-ink)]">{projection.listingLifecyclePhase.phaseLabel}</div>
        <p className="mt-2 text-[12px] leading-6 text-[var(--seller-muted)]">{projection.listingLifecyclePhase.coreProblemLabel}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <span className="seller-chip">{projection.listingLifecyclePhase.phaseLabel}</span>
          <span className="seller-chip seller-chip-accent">下一步：{projection.listingLifecyclePhase.primaryActionLabel}</span>
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
            `报价/签约 ${projection.customerPoolSummary.closingCount}`,
          ]}
        />
        <DetailMetricCard
          label="价格"
          title={projection.priceSummary.title}
          detail={projection.priceSummary.detail}
          chips={[
            `挂牌 ${projection.priceSummary.askPrice} 万`,
            `市场 ${projection.priceSummary.marketPrice} 万`,
            `业主预期 ${projection.priceSummary.bottomPrice} 万`,
          ]}
        />
        <DetailMetricCard
          label="竞争"
          title={projection.competitionSummary.title}
          detail={projection.competitionSummary.detail}
          chips={[
            `同类房 ${projection.competitionSummary.rivalCount} 套`,
            `压力 ${projection.competitionSummary.pressure}`,
          ]}
        />
      </div>

      <section className="seller-panel-soft p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">主动作</div>
            <div className="mt-1 text-[15px] font-semibold text-[var(--seller-ink)]">下一步：{projection.listingLifecyclePhase.primaryActionLabel}</div>
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
          <div className="rounded-[18px] border border-[color:var(--seller-risk)]/20 bg-[var(--seller-risk-soft)] px-3 py-3">
            <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--seller-subtle)]">{projection.listingLifecyclePhase.phaseLabel}</div>
            <div className="mt-1 text-[13px] font-semibold text-[var(--seller-ink)]">下一步：{projection.listingLifecyclePhase.primaryActionLabel}</div>
            <p className="mt-1 text-[12px] leading-6 text-[var(--seller-muted)]">{projection.listingLifecyclePhase.phaseRiskHint}</p>
          </div>
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

function LiquidGlassIfLight({
  children,
  contentClassName,
  enabled,
  fallbackClassName,
  glassClassName,
  className,
  preset,
}: {
  children: React.ReactNode;
  contentClassName: string;
  enabled: boolean;
  fallbackClassName: string;
  glassClassName?: string;
  className?: string;
  preset: 'panel' | 'hero' | 'toolbar' | 'button';
}) {
  if (!enabled || preset === 'toolbar') {
    return <div className={fallbackClassName}>{children}</div>;
  }

  return (
    <LiquidGlassSurface
      preset={preset}
      className={className}
      glassClassName={glassClassName}
      contentClassName={contentClassName}
    >
      {children}
    </LiquidGlassSurface>
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

function FocusMeetingExternalRows({ summary }: { summary: FocusMeetingCaseSummary }) {
  const rows = [
    ...summary.comparisonSummary.rivalListings,
    ...summary.comparisonSummary.comparingCustomers,
  ].slice(0, 3);

  if (!rows.length) {
    return (
      <div className="mt-2 rounded-[10px] border border-dashed border-[var(--seller-border)] px-2.5 py-2 text-[10px] leading-4 text-[var(--seller-subtle)]">
        外部竞品和客户比较还不够，需要先补世界样本再提推广。
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-1.5">
      {rows.map((row) => (
        <div key={row.id} className="rounded-[10px] bg-[rgba(255,255,255,0.035)] px-2.5 py-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-bold text-[var(--seller-subtle)]">{row.label}</span>
            <span className={row.tone === 'risk' ? 'text-[10px] font-bold text-[var(--seller-risk)]' : 'text-[10px] font-bold text-[var(--seller-muted)]'}>
              {row.tone === 'risk' ? '会抢客户' : '可比较'}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[11px] font-semibold text-[var(--seller-ink)]">{row.title}</div>
          <div className="mt-0.5 line-clamp-2 text-[10px] leading-4 text-[var(--seller-muted)]">{row.detail}</div>
        </div>
      ))}
    </div>
  );
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

function FocusMeetingSubmitOverlay({
  cases,
  caseSummaries,
  initialCaseId,
  submittedCaseIds,
  onSubmit,
  onClose,
}: {
  cases: Array<{ caseItem: Case; score: number }>;
  caseSummaries: Map<string, ReturnType<typeof buildOperatingProjection>['cases'][number]>;
  initialCaseId: string | null;
  submittedCaseIds: string[];
  onSubmit: (caseItem: Case, result: FocusMeetingSubmitResult) => void;
  onClose: () => void;
}) {
  const availableCases = cases.filter((entry) => !submittedCaseIds.includes(entry.caseItem.id));
  const activeCases = availableCases.filter((entry) => entry.caseItem.status === 'active');
  const remainingSubmissionSlots = Math.max(0, 3 - submittedCaseIds.length);
  const initialSubmittedIds = activeCases
    .slice(0, remainingSubmissionSlots)
    .map((entry) => entry.caseItem.id);
  const preferredInitialId = initialCaseId && activeCases.some((entry) => entry.caseItem.id === initialCaseId)
    ? initialCaseId
    : initialSubmittedIds[0] || null;
  const [step, setStep] = useState<FocusMeetingStage>('submit');
  const [selectedCaseIds, setSelectedCaseIds] = useState<string[]>(() => {
    if (!preferredInitialId) return initialSubmittedIds;
    return [preferredInitialId, ...initialSubmittedIds.filter((caseId) => caseId !== preferredInitialId)].slice(0, 3);
  });
  const [focusedCaseId, setFocusedCaseId] = useState<string | null>(() => preferredInitialId);
  const [selectedOptionId, setSelectedOptionId] = useState<string>('quality-priority');
  const submittedEntries = selectedCaseIds
    .map((caseId) => {
      const entry = activeCases.find((candidate) => candidate.caseItem.id === caseId);
      if (!entry) return null;
      return {
        ...entry,
        summary: caseSummaries.get(caseId) || null,
      };
    })
    .filter((entry): entry is FocusMeetingSubmittedEntry => Boolean(entry));
  const focusedEntry = submittedEntries.find((entry) => entry.caseItem.id === focusedCaseId) || submittedEntries[0] || null;
  const focusedCase = focusedEntry?.caseItem || null;
  const focusedSummary = focusedEntry?.summary || null;
  const topScore = submittedEntries.reduce((max, entry) => Math.max(max, entry.score), 1);
  const externalRivalListingIds = submittedEntries.flatMap((entry) =>
    entry.summary?.comparisonSummary.rivalListings.map((row) => row.id.replace(`case-${entry.caseItem.id}-rival-listing-`, '')) || [],
  );
  const comparingCustomerIds = submittedEntries.flatMap((entry) =>
    entry.summary?.comparisonSummary.comparingCustomers.map((row) => row.id.replace(`case-${entry.caseItem.id}-customer-`, '')) || [],
  );

  const recommendationOptions = [
    {
      id: 'quality-priority',
      title: '主推房源条件',
      note: focusedCase ? `好房分 ${Math.round(focusedCase.competitiveness)}，会上先讲它为什么值得拿资源。` : '突出房子本身优势。',
    },
    {
      id: 'owner-readiness',
      title: '主推业主配合',
      note: focusedCase ? `业主信任 ${Math.round(focusedCase.trust)}，证明推广落下去有人接。` : '说明业主配合度。',
    },
    {
      id: 'customer-signal',
      title: '主推客户信号',
      note: focusedCase ? `当前热度 ${Math.round(focusedCase.heat)}，用客户反馈证明值得重点跟。` : '用客户反馈和带看线索证明。',
    },
  ];

  const toggleCase = (caseId: string) => {
    setSelectedCaseIds((current) => {
      if (current.includes(caseId)) {
        const next = current.filter((id) => id !== caseId);
        if (focusedCaseId === caseId) {
          setFocusedCaseId(next[0] || null);
        }
        return next;
      }
      if (current.length >= remainingSubmissionSlots) return current;
      if (!focusedCaseId) setFocusedCaseId(caseId);
      return [...current, caseId];
    });
  };

  const goCompare = () => {
    if (submittedEntries.length === 0) return;
    setFocusedCaseId((current) => current && selectedCaseIds.includes(current) ? current : selectedCaseIds[0] || null);
    setStep('compare');
  };

  const progressLabel = step === 'submit'
    ? '第一轮：提报候选'
    : step === 'compare'
      ? '第二轮：外部竞品比较'
      : '第三轮：推进推广';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(5,8,12,0.72)] p-6 backdrop-blur-sm">
      <div className="w-full max-w-4xl animate-in zoom-in rounded-[24px] border border-[var(--seller-border)] bg-[var(--seller-paper)] p-6 shadow-[var(--seller-shadow-lg)] fade-in duration-200">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <div className="seller-label flex items-center gap-2">
              <Megaphone size={13} />
              {progressLabel}
            </div>
            <h3 className="mt-1 text-[18px] font-bold text-[var(--seller-ink)]">提报周四聚焦会</h3>
            <p className="mt-1 text-[12px] leading-5 text-[var(--seller-muted)]">
              先提报最多 3 套，再和其他经纪人维护的同类房比较，最后选出 1 套聚焦推广。
            </p>
          </div>
          <span className="rounded-full bg-[rgba(255,255,255,0.06)] px-2.5 py-1 text-[10px] font-semibold text-[var(--seller-muted)]">
            今日已提报 {submittedCaseIds.length}/3
          </span>
        </div>

        <div className="mb-5 grid grid-cols-3 gap-2 text-[11px] font-bold">
          {[
            ['submit', '1 提报候选'],
            ['compare', '2 外部竞品比较'],
            ['promote', '3 推进推广'],
          ].map(([id, label]) => (
            <div
              key={id}
              className={`rounded-full px-3 py-2 text-center ${step === id ? 'bg-[var(--seller-accent-soft)] text-[var(--seller-ink)]' : 'bg-[rgba(255,255,255,0.04)] text-[var(--seller-muted)]'}`}
            >
              {label}
            </div>
          ))}
        </div>

        {step === 'submit' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[12px] font-bold text-[var(--seller-ink)]">可提报房源</div>
              <div className="text-[11px] font-semibold text-[var(--seller-muted)]">已选 {selectedCaseIds.length}/{remainingSubmissionSlots}</div>
            </div>
            <div className="grid max-h-[430px] grid-cols-1 gap-2.5 overflow-y-auto pr-1 md:grid-cols-2">
              {availableCases.map(({ caseItem, score }) => {
                const selected = selectedCaseIds.includes(caseItem.id);
                const disabled = caseItem.status !== 'active' || remainingSubmissionSlots <= 0 || (!selected && selectedCaseIds.length >= remainingSubmissionSlots);
                return (
                  <button
                    key={caseItem.id}
                    type="button"
                    disabled={disabled}
                    onClick={() => toggleCase(caseItem.id)}
                    className={`w-full rounded-[14px] border p-3.5 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${
                      selected
                        ? 'border-[color:var(--seller-accent)]/55 bg-[var(--seller-accent-soft)]'
                        : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] hover:border-[color:var(--seller-accent)]/35 hover:bg-[rgba(255,255,255,0.05)]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[13px] font-bold text-[var(--seller-ink)]">{caseItem.title}</div>
                        <div className="mt-1 text-[11px] text-[var(--seller-muted)]">
                          热度 {Math.round(caseItem.heat)} · 业主信任 {Math.round(caseItem.trust)} · 好房分 {Math.round(caseItem.competitiveness)}
                        </div>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {(caseSummaries.get(caseItem.id)?.comparisonSummary.decisionLens || []).slice(0, 3).map((lens) => (
                            <span key={lens} className="seller-chip">
                              {lens}
                            </span>
                          ))}
                        </div>
                        {caseItem.status !== 'active' ? (
                          <div className="mt-2 text-[10px] font-semibold text-[var(--seller-risk)]">这套房已经不在可提报状态</div>
                        ) : null}
                      </div>
                      <span className="shrink-0 rounded-full bg-[rgba(255,255,255,0.06)] px-2 py-0.5 text-[10px] font-semibold text-[var(--seller-muted)]">
                        推荐分 {score}
                      </span>
                    </div>
                  </button>
                );
              })}
              {availableCases.length === 0 ? (
                <div className="rounded-[14px] border border-dashed border-[var(--seller-border)] px-4 py-8 text-center text-[12px] text-[var(--seller-muted)] md:col-span-2">
                  今天已经没有可提报的房源。
                </div>
              ) : null}
              {availableCases.length > 0 && remainingSubmissionSlots <= 0 ? (
                <div className="rounded-[14px] border border-dashed border-[var(--seller-border)] px-4 py-8 text-center text-[12px] text-[var(--seller-muted)] md:col-span-2">
                  今天 3 个提报名额已经用完。
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {step === 'compare' ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="text-[12px] font-bold text-[var(--seller-ink)]">和谁比</div>
              <div className="text-[11px] font-semibold text-[var(--seller-muted)]">先看其他经纪人维护的同类房，再选 1 套作为本轮聚焦</div>
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {submittedEntries.map(({ caseItem, score, summary }, index) => {
                const selected = caseItem.id === focusedEntry?.caseItem.id;
                const scoreWidth = Math.max(14, Math.round((score / topScore) * 100));
                return (
                  <button
                    key={caseItem.id}
                    type="button"
                    onClick={() => setFocusedCaseId(caseItem.id)}
                    className={`rounded-[18px] border p-4 text-left transition ${
                      selected
                        ? 'border-[color:var(--seller-accent)]/60 bg-[var(--seller-accent-soft)]'
                        : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.05)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="rounded-full bg-[rgba(255,255,255,0.06)] px-2 py-1 text-[10px] font-bold text-[var(--seller-muted)]">候选 {index + 1}</span>
                      {selected ? <span className="seller-chip seller-chip-accent">建议聚焦</span> : null}
                    </div>
                    <div className="mt-4 text-[14px] font-black text-[var(--seller-ink)]">{caseItem.title}</div>
                    <div className="mt-2 space-y-1 text-[11px] text-[var(--seller-muted)]">
                      <div>热度 {Math.round(caseItem.heat)} · 业主信任 {Math.round(caseItem.trust)}</div>
                      <div>好房分 {Math.round(caseItem.competitiveness)} · 推荐分 {score}</div>
                    </div>
                    <div className="mt-3 space-y-2">
                      <div className="rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2">
                        <div className="text-[10px] font-bold text-[var(--seller-subtle)]">比较视角</div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {(summary?.comparisonSummary.decisionLens || []).slice(0, 3).map((lens) => (
                            <span key={lens} className="seller-chip">
                              {lens}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2">
                        <div className="text-[10px] font-bold text-[var(--seller-subtle)]">竞品和客户</div>
                        <div className="mt-1 text-[11px] leading-5 text-[var(--seller-muted)]">
                          {summary?.comparisonSummary.detail || '继续补齐其他经纪人维护的同类房和同客户线比较对象。'}
                        </div>
                        {summary ? <FocusMeetingExternalRows summary={summary} /> : null}
                      </div>
                    </div>
                    <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[rgba(255,255,255,0.08)]">
                      <div className="h-full rounded-full bg-[var(--seller-accent)]" style={{ width: `${scoreWidth}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {step === 'promote' && focusedCase ? (
          <div className="space-y-3">
            <div className="rounded-[16px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
              <div className="text-[11px] font-semibold text-[var(--seller-subtle)]">最终聚焦</div>
              <div className="mt-1 text-[15px] font-black text-[var(--seller-ink)]">{focusedCase.title}</div>
              <div className="mt-1 text-[11px] text-[var(--seller-muted)]">提交后会进入本轮聚焦，并触发推广推进。</div>
              {focusedSummary ? (
                <div className="mt-3 rounded-[12px] border border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] px-3 py-2">
                  <div className="text-[10px] font-bold text-[var(--seller-subtle)]">比较结论</div>
                  <div className="mt-1 text-[11px] leading-5 text-[var(--seller-muted)]">{focusedSummary.comparisonSummary.detail}</div>
                </div>
              ) : null}
            </div>
            {recommendationOptions.map((option) => {
              const selected = option.id === selectedOptionId;
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setSelectedOptionId(option.id)}
                  className={`w-full rounded-[14px] border p-3.5 text-left transition ${
                    selected
                      ? 'border-[color:var(--seller-accent)]/55 bg-[var(--seller-accent-soft)]'
                      : 'border-[var(--seller-border)] bg-[rgba(255,255,255,0.03)] hover:border-[color:var(--seller-accent)]/35 hover:bg-[rgba(255,255,255,0.05)]'
                  }`}
                >
                  <div className="text-[13px] font-bold text-[var(--seller-ink)]">{option.title}</div>
                  <div className="mt-1 text-[11px] leading-5 text-[var(--seller-muted)]">{option.note}</div>
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => {
              if (step === 'promote') {
                setStep('compare');
                return;
              }
              if (step === 'compare') {
                setStep('submit');
                return;
              }
              onClose();
            }}
            className="rounded-full px-4 py-2 text-[12px] font-bold text-[var(--seller-muted)] transition hover:text-[var(--seller-ink)]"
          >
            {step === 'submit' ? '取消' : '上一步'}
          </button>
          <button
            type="button"
            disabled={submittedEntries.length === 0 || (step !== 'submit' && !focusedCase)}
            onClick={() => {
              if (step === 'submit') {
                goCompare();
                return;
              }
              if (step === 'compare') {
                setStep('promote');
                return;
              }
              if (!focusedCase) return;
              onSubmit(focusedCase, {
                submittedCaseIds: submittedEntries.map((entry) => entry.caseItem.id),
                selectedCaseId: focusedCase.id,
                optionId: selectedOptionId,
                externalRivalListingIds,
                comparingCustomerIds,
              });
            }}
            className="seller-button-primary rounded-[14px] px-5 py-2.5 text-[13px] font-bold disabled:opacity-40"
          >
            {step === 'submit' ? '进入竞品比较' : step === 'compare' ? '确定聚焦房源' : '提交并推进推广'}
          </button>
        </div>
      </div>
    </div>
  );
}
