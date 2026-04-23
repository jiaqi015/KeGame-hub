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
  getOrCreateMaintainerUserId,
  loadMaintainerCloudMeta,
  migrateMaintainerCloudMetaScope,
  migrateMaintainerUserIdScope,
  saveMaintainerCloudMeta,
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
  executeTodayPlanItem,
  removeTodayPlanItem,
  syncTodayPlanForCurrentDay,
  executeGameAction,
  executeScenarioAction,
} from './gameTransitions.js';
import type { Settlement } from '../domain/actions/templates.js';
import type { TodayPlanDraft } from './todayPlan.js';

const cloudHydrationInFlight = new Map<
  string,
  Promise<Awaited<ReturnType<typeof loadPreferredMaintainerCloudRun>>>
>();
const scenarioCatalogRefreshInFlight = new Map<
  string,
  Promise<Awaited<ReturnType<typeof loadScenarioOpeningCatalog>>>
>();

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

export function useGame(input?: { activationKey?: string } & SellingHousesPlayerContextInput) {
  const activationKey = input?.activationKey;
  const playerContext = useMemo(
    () => buildSellingHousesPlayerContext({
      accountId: input?.accountId,
      email: input?.email,
      nickname: input?.nickname,
    }),
    [input?.accountId, input?.email, input?.nickname],
  );
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
  const [booting, setBooting] = useState(true);
  const [starting, setStarting] = useState(false);
  const [lastDifficulty, setLastDifficulty] = useState<DifficultyId>('standard');
  const cloudMetaRef = useRef(loadMaintainerCloudMeta(playerContext.storageScopeKey));
  const userIdRef = useRef('');
  const hydratedRef = useRef(false);
  const skipCloudSaveRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let disposed = false;

    const hydrateFromCloudInBackground = async (
      localState: GameState | null,
      localMeta: ReturnType<typeof loadMaintainerCloudMeta>,
    ) => {
      if (!activationKey) {
        return;
      }

      try {
        const compatibilityUserId = playerContext.accountId ? undefined : userIdRef.current;
        const hydrationKey = [
          activationKey,
          playerContext.accountId || compatibilityUserId || playerContext.storageScopeKey,
          localMeta?.runId || 'latest',
          localMeta?.syncVersion || 0,
        ].join('|');
        const preferredCloudRun = await dedupeInFlight(cloudHydrationInFlight, hydrationKey, () => (
          loadPreferredMaintainerCloudRun({
            userId: compatibilityUserId,
            localMeta,
            fetchRun: async (runId) => fetchMaintainerRun(
              activationKey,
              runId,
              compatibilityUserId,
            ),
            listRuns: async (resumeUserId) => {
              const payload = await fetchMaintainerRuns(activationKey, resumeUserId, 8);
              return payload.runs;
            },
          })
        ));

        if (disposed || !preferredCloudRun) {
          return;
        }

        const { run: cloudRun, meta: nextMeta } = preferredCloudRun;
        const normalized = normalizeLoadedState(cloudRun.saveData);

        if (normalized && (!localState || cloudRun.syncVersion >= (localMeta?.syncVersion || 0))) {
          skipCloudSaveRef.current = true;
          setState(normalized);
          saveGameState(normalized, playerContext.storageScopeKey);
          if (normalized.runContext?.difficultyId) {
            setLastDifficulty(normalized.runContext.difficultyId);
          }
        }

        cloudMetaRef.current = nextMeta;
        saveMaintainerCloudMeta(nextMeta, playerContext.storageScopeKey);
      } catch (error) {
        console.warn('Failed to hydrate maintainer cloud save:', error);
      }
    };

    const refreshScenarioCatalogInBackground = async () => {
      if (!activationKey) {
        return;
      }

      try {
        const catalogKey = `${activationKey}|${difficultyOptions.map((option) => option.id).join(',')}`;
        const nextCatalog = await dedupeInFlight(
          scenarioCatalogRefreshInFlight,
          catalogKey,
          () => loadScenarioOpeningCatalog(activationKey, difficultyOptions),
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
      cloudMetaRef.current = localMeta;

      if (disposed) {
        return;
      }

      if (nextState?.runContext?.difficultyId) {
        setLastDifficulty(nextState.runContext.difficultyId);
      }

      skipCloudSaveRef.current = true;
      hydratedRef.current = true;
      setState(nextState);
      setBooting(false);
      void hydrateFromCloudInBackground(nextState, localMeta);
      void refreshScenarioCatalogInBackground();
    };

    bootstrap();

    return () => {
      disposed = true;
    };
  }, [
    activationKey,
    difficultyOptions,
    playerContext.storageScopeKey,
    playerContext.legacyEmailScopeKey,
    runOwnerContext,
  ]);

  useEffect(() => {
    if (!state) {
      return;
    }

    saveGameState(state, playerContext.storageScopeKey);
  }, [state, playerContext.storageScopeKey]);

  useEffect(() => {
    if (!state || !activationKey || !hydratedRef.current) {
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
          const created = await createMaintainerRun(activationKey, {
            userId: compatibilityUserId,
            accountId: playerContext.accountId,
            playerProfileId: playerContext.playerProfileId,
            playerName: playerContext.displayName,
            state,
            clientUpdatedAt: new Date().toISOString(),
          });

          cloudMetaRef.current = {
            runId: created.runId,
            syncVersion: created.syncVersion,
            updatedAt: created.updatedAt,
          };
          saveMaintainerCloudMeta(cloudMetaRef.current, playerContext.storageScopeKey);
          return;
        }

        const saved = await saveMaintainerRun(activationKey, {
          runId: currentMeta.runId,
          userId: compatibilityUserId,
          accountId: playerContext.accountId,
          playerProfileId: playerContext.playerProfileId,
          playerName: playerContext.displayName,
          state,
          expectedSyncVersion: currentMeta.syncVersion,
          clientUpdatedAt: new Date().toISOString(),
        });

        cloudMetaRef.current = {
          runId: saved.runId,
          syncVersion: saved.syncVersion,
          updatedAt: saved.updatedAt,
        };
        saveMaintainerCloudMeta(cloudMetaRef.current, playerContext.storageScopeKey);
      } catch (error) {
        const latest = error instanceof Error && 'latest' in error
          ? (error as Error & { latest?: { saveData?: unknown; runId?: string; syncVersion?: number; updatedAt?: string } }).latest
          : null;

        if (latest?.saveData) {
          const normalized = normalizeLoadedState(latest.saveData);
          if (normalized) {
            skipCloudSaveRef.current = true;
            setState(normalized);
            saveGameState(normalized, playerContext.storageScopeKey);
          }
        }

        if (latest?.runId && Number.isFinite(latest.syncVersion)) {
          cloudMetaRef.current = {
            runId: latest.runId,
            syncVersion: Number(latest.syncVersion),
            updatedAt: latest.updatedAt || new Date().toISOString(),
          };
          saveMaintainerCloudMeta(cloudMetaRef.current, playerContext.storageScopeKey);
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
    activationKey,
    playerContext.accountId,
    playerContext.playerProfileId,
    playerContext.storageScopeKey,
    playerContext.displayName,
    runOwnerContext,
  ]);

  const loadLeaderboardDetail = useCallback(async () => {
    if (!activationKey) {
      return null;
    }

    setLeaderboardLoading(true);
    try {
      const detail = await fetchMaintainerLeaderboardDetail(activationKey);
      setLeaderboardDetail(detail);
      return detail;
    } finally {
      setLeaderboardLoading(false);
    }
  }, [activationKey]);

  const startScenarioState = useCallback((world: GameState, difficultyId: DifficultyId) => {
    setLastDifficulty(difficultyId);
    clearMaintainerCloudMeta(playerContext.storageScopeKey);
    clearSavedGameState(playerContext.storageScopeKey);
    cloudMetaRef.current = null;
    setState(world);
    saveGameState(world, playerContext.storageScopeKey);
  }, [playerContext.storageScopeKey]);

  const startScenarioRun = useCallback(async (openingRef: ScenarioOpeningRef, fallbackDifficultyId: DifficultyId) => {
    setStarting(true);
    try {
      const opening = await resolveScenarioOpening({ activationKey, openingRef });
      const world = createStateFromScenarioOpening(opening);
      startScenarioState(world, opening.summary.difficultyId || fallbackDifficultyId);
    } finally {
      setStarting(false);
    }
  }, [activationKey, startScenarioState]);

  const startFeaturedRun = useCallback(async (difficultyId: DifficultyId) => {
    const featured = featuredScenarios.find((entry) => entry.difficultyId === difficultyId);
    if (!featured) {
      throw new Error(`未找到难度 ${difficultyId}`);
    }
    await startScenarioRun(featured.scenario.opening, difficultyId);
  }, [featuredScenarios, startScenarioRun]);

  const startRandomGeneratedRun = useCallback(async (difficultyId: DifficultyId) => {
    await startScenarioRun(createRandomGeneratedOpeningRef(difficultyId, createGeneratedScenarioSeed(Date.now())), difficultyId);
  }, [startScenarioRun]);

  const handleSelectCase = useCallback((id: string) => {
    setState((prev) => {
      if (!prev) return null;
      return { ...prev, selectedCaseId: id };
    });
  }, []);

  const handleAdvanceDays = useCallback((count: number, onMessage?: (msg: string) => void) => {
    setState((prev) => {
      if (!prev) return null;
      return advanceGameDays(prev, count, onMessage);
    });
  }, []);

  const handleExecuteAction = useCallback((actionId: string, caseItem: Case, optionId: string | null = null, onMessage?: (msg: string) => void) => {
    let success = false;
    setState((prev) => {
      if (!prev) return null;
      const result = executeGameAction(prev, actionId, caseItem.id, optionId, onMessage);
      success = result.success;
      return result.success ? result.nextState : prev;
    });
    return success;
  }, []);

  const handleExecuteScenarioAction = useCallback((actionId: string, caseItem: Case, settlement: Settlement, onMessage?: (msg: string) => void) => {
    let success = false;
    setState((prev) => {
      if (!prev) return null;
      const result = executeScenarioAction(prev, actionId, caseItem.id, settlement, onMessage);
      success = result.success;
      return result.success ? result.nextState : prev;
    });
    return success;
  }, []);

  const handleSyncTodayPlan = useCallback(() => {
    setState((prev) => {
      if (!prev) return null;
      return syncTodayPlanForCurrentDay(prev);
    });
  }, []);

  const handleAddTodayPlanItem = useCallback((input: TodayPlanDraft, onMessage?: (msg: string) => void) => {
    let success = false;
    let reason = '';
    setState((prev) => {
      if (!prev) return null;
      const result = addTodayPlanItem(prev, input, onMessage);
      success = result.success;
      reason = result.reason;
      return result.success ? result.nextState : prev;
    });
    return { success, reason };
  }, []);

  const handleRemoveTodayPlanItem = useCallback((itemId: string, onMessage?: (msg: string) => void) => {
    let success = false;
    let reason = '';
    setState((prev) => {
      if (!prev) return null;
      const result = removeTodayPlanItem(prev, itemId, onMessage);
      success = result.success;
      reason = result.reason;
      return result.success ? result.nextState : prev;
    });
    return { success, reason };
  }, []);

  const handleExecuteTodayPlanItem = useCallback((
    itemId: string,
    optionId: string | null = null,
    onMessage?: (msg: string) => void,
  ) => {
    let success = false;
    let reason = '';
    let outcome: 'executed' | 'scenario' | 'missing' | 'blocked' = 'blocked';
    let executionMode: TodayPlanDraft['executionMode'] | null = null;
    setState((prev) => {
      if (!prev) return null;
      const result = executeTodayPlanItem(prev, itemId, optionId, onMessage);
      success = result.success;
      reason = result.reason;
      outcome = result.outcome;
      executionMode = result.executionMode;
      return result.success && result.outcome === 'executed' ? result.nextState : prev;
    });
    return { success, reason, outcome, executionMode };
  }, []);

  const handleReset = useCallback(() => {
    clearMaintainerCloudMeta(playerContext.storageScopeKey);
    clearSavedGameState(playerContext.storageScopeKey);
    cloudMetaRef.current = null;
    setState(null);
  }, [playerContext.storageScopeKey]);

  const handleClearReport = useCallback(() => {
    setState((prev) => (prev ? { ...prev, currentReport: null } : null));
  }, []);

  return {
    phase: booting ? 'loading' as const : state ? 'playing' as const : 'setup' as const,
    state,
    catalog,
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
    handleExecuteScenarioAction,
    handleSyncTodayPlan,
    handleAddTodayPlanItem,
    handleRemoveTodayPlanItem,
    handleExecuteTodayPlanItem,
    handleReset,
    handleClearReport,
  };
}
