import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  Case,
  DifficultyId,
  DifficultyOption,
  GameState,
  ScenarioOpeningRef,
  ScenarioSummary,
} from '../domain/models.js';
import {
  clearSavedGameState,
  loadSavedState,
  migrateSavedStateScope,
  normalizeLoadedState,
  saveGameState,
} from './gameState.js';
import {
  getDifficultyOptions,
} from '../domain/scenarioCatalog.js';
import {
  clearMaintainerCloudMeta,
  clearMaintainerCloudResetMarker,
  getOrCreateMaintainerUserId,
  loadMaintainerCloudMeta,
  loadMaintainerCloudResetMarker,
  migrateMaintainerCloudMetaScope,
  migrateMaintainerUserIdScope,
  saveMaintainerCloudMeta,
  saveMaintainerCloudResetMarker,
} from './cloudState.js';
import {
  createMaintainerRun,
  fetchMaintainerLeaderboardDetail,
  fetchMaintainerRuns,
  fetchMaintainerRun,
  saveMaintainerRun,
} from '../infrastructure/cloudClient.js';
import type { MaintainerLeaderboardDetail } from './cloudSync.js';
import { loadPreferredMaintainerCloudRun } from './cloudResume.js';
import { buildSellingHousesPlayerContext, type SellingHousesPlayerContextInput } from './playerContext.js';
import type { WorldGraphSummary } from '../domain/world-model/runtime/types.js';
import type { FeaturedScenarioPreview } from './scenarioOpening.js';
import {
  buildLocalScenarioOpeningCatalog,
  createRandomGeneratedOpeningRef,
  createGeneratedScenarioSeed,
  createStateFromScenarioOpening,
  loadScenarioOpeningCatalog,
  resolveScenarioOpening,
} from './scenarioOpening.js';
import {
  addTodayPlanItem,
  advanceGameDays,
  advanceGameDaysWithSummary,
  type AdvanceGameDaysSummary,
  executeTodayPlanItem,
  removeTodayPlanItem,
  sendWechatConversationReply,
  syncTodayPlanForCurrentDay,
  executeGameAction,
  executeScenarioAction,
} from './gameTransitions.js';
import type { Settlement } from '../domain/actions/templates.js';
import type { TodayPlanDraft } from './todayPlan.js';
import type { WechatMessage } from './projections/myWechatTypes.js';
import {
  buildFallbackConversationEffectProposal,
  buildWechatConversationScenePack,
  sanitizeWechatPlayerText,
} from './wechatConversation.js';
import { fetchMyWechatConversationEffectProposal } from '../infrastructure/myWechatConversationClient.js';
import {
  buildKeepLocalWarning,
  buildSaveComparisonLog,
  compareGameProgress,
  markHydratedState,
  markLocalStateChange,
  shouldHydrateRemote,
  type GameSaveComparison,
} from './saveConsistency.js';
import { shouldSyncSellingHousesProfileToCloud } from './storageProfile.js';

const cloudHydrationInFlight = new Map<
  string,
  Promise<Awaited<ReturnType<typeof loadPreferredMaintainerCloudRun>>>
>();
const scenarioCatalogRefreshInFlight = new Map<
  string,
  Promise<Awaited<ReturnType<typeof loadScenarioOpeningCatalog>>>
>();

const WECHAT_AGENT_TIMEOUT_MS = 14000;

function dedupeInFlight<T>(cache: Map<string, Promise<T>>, key: string, loader: () => Promise<T>) {
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }

  const promise = loader().finally(() => {
    cache.delete(key);
  });
  cache.set(key, promise);
  return promise;
}

function delay(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

export function useGame(input?: { activationKey?: string } & SellingHousesPlayerContextInput) {
  const activationKey = input?.activationKey;
  const playerContext = useMemo(
    () => buildSellingHousesPlayerContext({
      accountId: input?.accountId,
      email: input?.email,
      nickname: input?.nickname,
      storageProfile: input?.storageProfile,
    }),
    [input?.accountId, input?.email, input?.nickname, input?.storageProfile],
  );
  const shouldSyncCloud = shouldSyncSellingHousesProfileToCloud(playerContext.storageProfile);
  const cloudActivationKey = shouldSyncCloud ? activationKey : undefined;
  const runOwnerContext = useMemo(
    () => ({
      storageScopeKey: playerContext.storageScopeKey,
      accountId: playerContext.accountId,
    }),
    [playerContext.storageScopeKey, playerContext.accountId],
  );
  const difficultyOptions: DifficultyOption[] = useMemo(() => getDifficultyOptions(), []);
  const [state, setState] = useState<GameState | null>(null);
  const [catalog, setCatalog] = useState<ScenarioSummary[]>([]);
  const [featuredScenarios, setFeaturedScenarios] = useState<FeaturedScenarioPreview[]>([]);
  const [leaderboardDetail, setLeaderboardDetail] = useState<MaintainerLeaderboardDetail | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [syncWarning, setSyncWarning] = useState<string | null>(null);
  const [booting, setBooting] = useState(true);
  const [starting, setStarting] = useState(false);
  const [lastDifficulty, setLastDifficulty] = useState<DifficultyId>('standard');
  const cloudMetaRef = useRef(loadMaintainerCloudMeta(playerContext.storageScopeKey));
  const loadedStorageScopeRef = useRef(playerContext.storageScopeKey);
  const userIdRef = useRef('');
  const hydratedRef = useRef(false);
  const skipCloudSaveRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);

  const commitLocalStateChange = useCallback((nextState: GameState, saveSource: 'local' | 'manual' | 'system' = 'local') => {
    const committedState = markLocalStateChange(nextState, saveSource);
    saveGameState(committedState, playerContext.storageScopeKey);
    return committedState;
  }, [playerContext.storageScopeKey]);

  useEffect(() => {
    let disposed = false;
    loadedStorageScopeRef.current = '';
    hydratedRef.current = false;
    skipCloudSaveRef.current = true;
    setBooting(true);

    const hydrateFromCloudInBackground = async (
      localState: GameState | null,
      localMeta: ReturnType<typeof loadMaintainerCloudMeta>,
    ) => {
      if (!cloudActivationKey) {
        return;
      }

      try {
        const compatibilityUserId = playerContext.accountId ? undefined : userIdRef.current;
        const hydrationKey = [
          cloudActivationKey,
          playerContext.accountId || compatibilityUserId || playerContext.storageScopeKey,
          localMeta?.runId || 'latest',
          localMeta?.syncVersion || 0,
        ].join('|');
        const preferredCloudRun = await dedupeInFlight(cloudHydrationInFlight, hydrationKey, () => (
          loadPreferredMaintainerCloudRun({
            userId: compatibilityUserId,
            localMeta,
            fetchRun: async (runId) => fetchMaintainerRun(
              cloudActivationKey,
              runId,
              compatibilityUserId,
            ),
            listRuns: async (resumeUserId) => {
              const payload = await fetchMaintainerRuns(cloudActivationKey, resumeUserId, 8);
              return payload.runs;
            },
          })
        ));

        if (disposed || !preferredCloudRun) {
          return;
        }

        const { run: cloudRun, meta: nextMeta } = preferredCloudRun;
        const normalized = normalizeLoadedState(cloudRun.saveData);

        if (normalized) {
          const remoteState = markHydratedState(normalized);
          const comparison: GameSaveComparison | null = localState
            ? compareGameProgress(localState, remoteState)
            : null;
          if (comparison) {
            console.info('Maintainer cloud hydrate comparison:', buildSaveComparisonLog(comparison));
          }

          if (!localState || (comparison && shouldHydrateRemote(comparison))) {
            skipCloudSaveRef.current = true;
            setState(remoteState);
            saveGameState(remoteState, playerContext.storageScopeKey);
            setSyncWarning(null);
            cloudMetaRef.current = nextMeta;
            saveMaintainerCloudMeta(nextMeta, playerContext.storageScopeKey);
            clearMaintainerCloudResetMarker(playerContext.storageScopeKey);
            if (remoteState.runContext?.difficultyId) {
              setLastDifficulty(remoteState.runContext.difficultyId);
            }
          } else if (comparison?.decision === 'same') {
            cloudMetaRef.current = nextMeta;
            saveMaintainerCloudMeta(nextMeta, playerContext.storageScopeKey);
            clearMaintainerCloudResetMarker(playerContext.storageScopeKey);
            setSyncWarning(null);
          } else if (comparison) {
            const warning = buildKeepLocalWarning(comparison) || '检测到云端进度冲突，已保留本地进度。';
            console.warn('Maintainer cloud hydrate kept local progress:', buildSaveComparisonLog(comparison));
            setSyncWarning(warning);
            saveGameState(localState, playerContext.storageScopeKey);

            if (comparison.decision === 'local_newer') {
              cloudMetaRef.current = nextMeta;
              saveMaintainerCloudMeta(nextMeta, playerContext.storageScopeKey);
              try {
                const saved = await saveMaintainerRun(cloudActivationKey, {
                  runId: nextMeta.runId,
                  userId: compatibilityUserId,
                  accountId: playerContext.accountId,
                  playerProfileId: playerContext.playerProfileId,
                  playerName: playerContext.displayName,
                  state: localState,
                  expectedSyncVersion: nextMeta.syncVersion,
                  clientUpdatedAt: localState.clientUpdatedAt,
                });
                cloudMetaRef.current = {
                  runId: saved.runId,
                  syncVersion: saved.syncVersion,
                  updatedAt: saved.updatedAt,
                };
                saveMaintainerCloudMeta(cloudMetaRef.current, playerContext.storageScopeKey);
                console.info('Maintainer cloud hydrate pushed local newer progress:', {
                  day: localState.day,
                  localRevision: localState.localRevision,
                  syncVersion: saved.syncVersion,
                });
              } catch (pushError) {
                console.warn('Failed to push local newer maintainer progress after hydrate:', pushError);
              }
            }
          }
        }
      } catch (error) {
        console.warn('Failed to hydrate maintainer cloud save:', error);
      }
    };

    const refreshScenarioCatalogInBackground = async () => {
      if (!cloudActivationKey) {
        return;
      }

      try {
        const catalogKey = `${cloudActivationKey}|${difficultyOptions.map((option) => option.id).join(',')}`;
        const nextCatalog = await dedupeInFlight(
          scenarioCatalogRefreshInFlight,
          catalogKey,
          () => loadScenarioOpeningCatalog(cloudActivationKey, difficultyOptions),
        );
        if (disposed) {
          return;
        }
        setCatalog(nextCatalog.scenarios);
        setFeaturedScenarios(nextCatalog.featuredScenarios);
      } catch (error) {
        console.warn('Failed to refresh scenario catalog:', error);
      }
    };

    const bootstrap = async () => {
      if (
        playerContext.legacyEmailScopeKey
        && playerContext.legacyEmailScopeKey !== playerContext.storageScopeKey
      ) {
        migrateSavedStateScope(playerContext.storageScopeKey, playerContext.legacyEmailScopeKey);
        migrateMaintainerCloudMetaScope(playerContext.storageScopeKey, playerContext.legacyEmailScopeKey);
        migrateMaintainerUserIdScope(playerContext.storageScopeKey, playerContext.legacyEmailScopeKey);
      }

      const userId = getOrCreateMaintainerUserId(runOwnerContext);
      userIdRef.current = userId;
      const localCatalog = buildLocalScenarioOpeningCatalog(difficultyOptions);
      if (!disposed) {
        setCatalog(localCatalog.scenarios);
        setFeaturedScenarios(localCatalog.featuredScenarios);
      }

      const localState = loadSavedState(playerContext.storageScopeKey);
      let nextState = localState;
      const localMeta = loadMaintainerCloudMeta(playerContext.storageScopeKey);
      const resetMarker = loadMaintainerCloudResetMarker(playerContext.storageScopeKey);
      cloudMetaRef.current = localMeta;

      if (disposed) {
        return;
      }

      if (nextState?.runContext?.difficultyId) {
        setLastDifficulty(nextState.runContext.difficultyId);
      }

      loadedStorageScopeRef.current = playerContext.storageScopeKey;
      skipCloudSaveRef.current = true;
      hydratedRef.current = true;
      setState(nextState);
      setBooting(false);
      if (!resetMarker) {
        void hydrateFromCloudInBackground(nextState, localMeta);
      }
      void refreshScenarioCatalogInBackground();
    };

    bootstrap();

    return () => {
      disposed = true;
    };
  }, [
    cloudActivationKey,
    difficultyOptions,
    playerContext.storageScopeKey,
    playerContext.legacyEmailScopeKey,
    runOwnerContext,
  ]);

  useEffect(() => {
    if (!state) {
      return;
    }

    if (loadedStorageScopeRef.current !== playerContext.storageScopeKey) {
      return;
    }

    saveGameState(state, playerContext.storageScopeKey);
  }, [state, playerContext.storageScopeKey]);

  useEffect(() => {
    if (!state || !cloudActivationKey || !hydratedRef.current) {
      return;
    }

    if (skipCloudSaveRef.current) {
      skipCloudSaveRef.current = false;
      return;
    }

    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = window.setTimeout(async () => {
      const userId = userIdRef.current || getOrCreateMaintainerUserId(runOwnerContext);
      const currentMeta = cloudMetaRef.current;

      try {
        const compatibilityUserId = playerContext.accountId ? undefined : userId;
        if (!currentMeta?.runId) {
          const created = await createMaintainerRun(cloudActivationKey, {
            userId: compatibilityUserId,
            accountId: playerContext.accountId,
            playerProfileId: playerContext.playerProfileId,
            playerName: playerContext.displayName,
            state,
            clientUpdatedAt: state.clientUpdatedAt,
          });

          cloudMetaRef.current = {
            runId: created.runId,
            syncVersion: created.syncVersion,
            updatedAt: created.updatedAt,
          };
          saveMaintainerCloudMeta(cloudMetaRef.current, playerContext.storageScopeKey);
          clearMaintainerCloudResetMarker(playerContext.storageScopeKey);
          setSyncWarning(null);
          return;
        }

        const saved = await saveMaintainerRun(cloudActivationKey, {
          runId: currentMeta.runId,
          userId: compatibilityUserId,
          accountId: playerContext.accountId,
          playerProfileId: playerContext.playerProfileId,
          playerName: playerContext.displayName,
          state,
          expectedSyncVersion: currentMeta.syncVersion,
          clientUpdatedAt: state.clientUpdatedAt,
        });

        cloudMetaRef.current = {
          runId: saved.runId,
          syncVersion: saved.syncVersion,
          updatedAt: saved.updatedAt,
        };
        saveMaintainerCloudMeta(cloudMetaRef.current, playerContext.storageScopeKey);
        clearMaintainerCloudResetMarker(playerContext.storageScopeKey);
        setSyncWarning(null);
      } catch (error) {
        const latest = error instanceof Error && 'latest' in error
          ? (error as Error & { latest?: { saveData?: unknown; runId?: string; syncVersion?: number; updatedAt?: string } }).latest
          : null;

        let comparison: GameSaveComparison | null = null;

        if (latest?.saveData) {
          const normalized = normalizeLoadedState(latest.saveData);
          if (normalized) {
            const remoteState = markHydratedState(normalized);
            comparison = compareGameProgress(state, remoteState);
            console.info('Maintainer cloud save conflict comparison:', buildSaveComparisonLog(comparison));
            if (shouldHydrateRemote(comparison)) {
              skipCloudSaveRef.current = true;
              setState(remoteState);
              saveGameState(remoteState, playerContext.storageScopeKey);
              setSyncWarning(`云端进度已更新，已切换到第 ${remoteState.day} 天。`);
            } else {
              const warning = buildKeepLocalWarning(comparison) || '检测到云端进度冲突，已保留本地进度。';
              console.warn('Maintainer cloud save conflict kept local progress:', buildSaveComparisonLog(comparison));
              setSyncWarning(warning);
              saveGameState(state, playerContext.storageScopeKey);
            }
          }
        }

        if (latest?.runId && Number.isFinite(latest.syncVersion)) {
          const latestMeta = {
            runId: latest.runId,
            syncVersion: Number(latest.syncVersion),
            updatedAt: latest.updatedAt || new Date().toISOString(),
          };
          const canAttachLatestMeta = comparison?.decision !== 'conflict';
          if (canAttachLatestMeta) {
            cloudMetaRef.current = latestMeta;
            saveMaintainerCloudMeta(cloudMetaRef.current, playerContext.storageScopeKey);
          }

          if (comparison?.decision === 'local_newer') {
            try {
              const compatibilityUserId = playerContext.accountId ? undefined : userId;
              const saved = await saveMaintainerRun(cloudActivationKey, {
                runId: latestMeta.runId,
                userId: compatibilityUserId,
                accountId: playerContext.accountId,
                playerProfileId: playerContext.playerProfileId,
                playerName: playerContext.displayName,
                state,
                expectedSyncVersion: latestMeta.syncVersion,
                clientUpdatedAt: state.clientUpdatedAt,
              });
              cloudMetaRef.current = {
                runId: saved.runId,
                syncVersion: saved.syncVersion,
                updatedAt: saved.updatedAt,
              };
              saveMaintainerCloudMeta(cloudMetaRef.current, playerContext.storageScopeKey);
              setSyncWarning(null);
            } catch (retryError) {
              console.warn('Failed to retry maintainer cloud save with local newer progress:', retryError);
            }
          }
        }

        console.warn('Failed to sync maintainer cloud save:', error);
      }
    }, 900);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [
    state,
    cloudActivationKey,
    playerContext.accountId,
    playerContext.playerProfileId,
    playerContext.storageScopeKey,
    playerContext.displayName,
    runOwnerContext,
  ]);

  const loadLeaderboardDetail = useCallback(async () => {
    if (!cloudActivationKey) {
      return null;
    }

    setLeaderboardLoading(true);
    try {
      const detail = await fetchMaintainerLeaderboardDetail(cloudActivationKey);
      setLeaderboardDetail(detail);
      return detail;
    } finally {
      setLeaderboardLoading(false);
    }
  }, [cloudActivationKey]);

  const startScenarioState = useCallback((world: GameState, difficultyId: DifficultyId) => {
    const initialState = markLocalStateChange(world, 'manual');
    setLastDifficulty(difficultyId);
    setSyncWarning(null);
    clearMaintainerCloudMeta(playerContext.storageScopeKey);
    clearMaintainerCloudResetMarker(playerContext.storageScopeKey);
    clearSavedGameState(playerContext.storageScopeKey);
    cloudMetaRef.current = null;
    setState(initialState);
    saveGameState(initialState, playerContext.storageScopeKey);
  }, [playerContext.storageScopeKey]);

  const startScenarioRun = useCallback(async (openingRef: ScenarioOpeningRef, fallbackDifficultyId: DifficultyId) => {
    setStarting(true);
    try {
      const opening = await resolveScenarioOpening({ activationKey: cloudActivationKey, openingRef });
      const world = createStateFromScenarioOpening(opening);
      startScenarioState(world, opening.summary.difficultyId || fallbackDifficultyId);
    } finally {
      setStarting(false);
    }
  }, [cloudActivationKey, startScenarioState]);

  const startFeaturedRun = useCallback(async (difficultyId: DifficultyId) => {
    const featured = featuredScenarios.find((entry) => entry.difficultyId === difficultyId);
    if (!featured) {
      throw new Error(`未找到难度 ${difficultyId}`);
    }
    await startScenarioRun(featured.scenario.opening, difficultyId);
  }, [featuredScenarios, startScenarioRun]);

  const startRandomGeneratedRun = useCallback(async (difficultyId: DifficultyId, seed?: number) => {
    await startScenarioRun(createRandomGeneratedOpeningRef(difficultyId, seed ?? createGeneratedScenarioSeed(Date.now())), difficultyId);
  }, [startScenarioRun]);

  const handleSelectCase = useCallback((id: string) => {
    setState((prev) => {
      if (!prev) return null;
      return commitLocalStateChange({ ...prev, selectedCaseId: id });
    });
  }, [commitLocalStateChange]);

  const handleAdvanceDays = useCallback((count: number, onMessage?: (msg: string) => void) => {
    setState((prev) => {
      if (!prev) return null;
      return commitLocalStateChange(advanceGameDays(prev, count, onMessage));
    });
  }, [commitLocalStateChange]);

  const handleAdvanceDaysWithSummary = useCallback((count: number, onMessage?: (msg: string) => void) => {
    if (!state) return null;
    const summary: AdvanceGameDaysSummary = advanceGameDaysWithSummary(state, count, onMessage);
    const nextState = commitLocalStateChange(summary.nextState);
    setState(nextState);
    return {
      ...summary,
      nextState,
    };
  }, [commitLocalStateChange, state]);

  const handleExecuteAction = useCallback((
    actionId: string,
    caseItem: Case,
    optionId: string | null = null,
    onMessage?: (msg: string) => void,
    todayPlanItemId: string | null = null,
    meta?: unknown,
  ): boolean => {
    if (!state) return false;
    const result = executeGameAction(state, actionId, caseItem.id, optionId, todayPlanItemId, onMessage, meta);
    if (result.success) {
      setState(commitLocalStateChange(result.nextState));
    }
    return result.success;
  }, [state, commitLocalStateChange]);

  const handleExecuteScenarioAction = useCallback((
    actionId: string,
    caseItem: Case,
    settlement: Settlement,
    choices: Array<{ round: number; main: string; assist: string }> = [],
    feedbacks: Array<{ actor: string; mood: string; message: string }> = [],
    onMessage?: (msg: string) => void,
    todayPlanItemId: string | null = null,
  ): boolean => {
    if (!state) return false;
    const result = executeScenarioAction(
      state,
      actionId,
      caseItem.id,
      settlement,
      { choices, feedbacks },
      todayPlanItemId,
      onMessage,
    );
    if (result.success) {
      setState(commitLocalStateChange(result.nextState));
    }
    return result.success;
  }, [state, commitLocalStateChange]);

  const handleSendWechatConversationReply = useCallback(async (
    conversationKey: string,
    message: WechatMessage,
    playerText: string,
  ) => {
    if (!state) {
      return { success: false, reason: '当前局面还没加载完成。', receipt: null };
    }

    const sanitizedText = sanitizeWechatPlayerText(playerText);
    if (sanitizedText.length < 2) {
      return { success: false, reason: '先输入要回复的内容。', receipt: null };
    }

    const scene = buildWechatConversationScenePack(state, {
      conversationKey,
      message,
      playerText: sanitizedText,
    });

    const fallbackProposal = buildFallbackConversationEffectProposal(scene);
    const proposalResult = await Promise.race([
      fetchMyWechatConversationEffectProposal(scene).catch(() => null),
      delay(WECHAT_AGENT_TIMEOUT_MS).then(() => null),
    ]);
    const result = sendWechatConversationReply(state, {
      conversationKey,
      message,
      playerText: sanitizedText,
      proposal: proposalResult?.proposal || fallbackProposal,
      proposalSource: proposalResult?.source === 'ai' ? 'ai' : 'fallback',
      // Trace may be available even when proposal is null (e.g. server returned
      // fallback trace on error). Always prefer server trace over no trace.
      trace: proposalResult?.trace,
      arbiterResult: proposalResult?.arbiterResult,
    });

    if (result.success) {
      setState(commitLocalStateChange(result.nextState));
    }

    return {
      success: result.success,
      reason: result.reason,
      receipt: result.receipt,
      trace: result.trace,
      arbiterResult: result.arbiterResult,
    };
  }, [commitLocalStateChange, state]);

  const handleSyncTodayPlan = useCallback(() => {
    setState((prev) => {
      if (!prev) return null;
      return commitLocalStateChange(syncTodayPlanForCurrentDay(prev), 'system');
    });
  }, [commitLocalStateChange]);

  const handleAddTodayPlanItem = useCallback((input: TodayPlanDraft, onMessage?: (msg: string) => void) => {
    if (!state) return { success: false, reason: 'no state' };
    const result = addTodayPlanItem(state, input, onMessage);
    if (result.success) {
      setState(commitLocalStateChange(result.nextState));
    }
    return { success: result.success, reason: result.reason };
  }, [state, commitLocalStateChange]);

  const handleRemoveTodayPlanItem = useCallback((itemId: string, onMessage?: (msg: string) => void) => {
    if (!state) return { success: false, reason: 'no state' };
    const result = removeTodayPlanItem(state, itemId, onMessage);
    if (result.success) {
      setState(commitLocalStateChange(result.nextState));
    }
    return { success: result.success, reason: result.reason };
  }, [state, commitLocalStateChange]);

  const handleExecuteTodayPlanItem = useCallback((
    itemId: string,
    optionId: string | null = null,
    onMessage?: (msg: string) => void,
  ) => {
    if (!state) {
      return { success: false, reason: 'no state', outcome: 'blocked' as const, executionMode: null };
    }
    const result = executeTodayPlanItem(state, itemId, optionId, onMessage);
    if (result.success && result.outcome === 'executed') {
      setState(commitLocalStateChange(result.nextState));
    }
    return { success: result.success, reason: result.reason, outcome: result.outcome, executionMode: result.executionMode };
  }, [state, commitLocalStateChange]);

  const handleReset = useCallback(() => {
    setSyncWarning(null);
    clearMaintainerCloudMeta(playerContext.storageScopeKey);
    saveMaintainerCloudResetMarker(playerContext.storageScopeKey);
    clearSavedGameState(playerContext.storageScopeKey);
    cloudMetaRef.current = null;
    setState(null);
  }, [playerContext.storageScopeKey]);

  const handleClearReport = useCallback(() => {
    setState((prev) => {
      if (!prev) return null;
      return commitLocalStateChange({ ...prev, currentReport: null });
    });
  }, [commitLocalStateChange]);

  const worldGraphSummary: WorldGraphSummary | null = useMemo(() => {
    if (!state) return null;
    return state.bigWorldRuntime?.worldGraphSummary ?? null;
  }, [state]);

  return {
    phase: booting ? 'loading' as const : state ? 'playing' as const : 'setup' as const,
    state,
    worldGraphSummary,
    catalog,
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
    handleAdvanceDays,
    handleAdvanceDaysWithSummary,
    handleExecuteAction,
    handleExecuteScenarioAction,
    handleSendWechatConversationReply,
    handleSyncTodayPlan,
    handleAddTodayPlanItem,
    handleRemoveTodayPlanItem,
    handleExecuteTodayPlanItem,
    handleReset,
    handleClearReport,
  };
}
