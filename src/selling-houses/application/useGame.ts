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
  createRandomGeneratedOpeningRef,
  createGeneratedScenarioSeed,
  createStateFromScenarioOpening,
  loadScenarioOpeningCatalog,
  resolveScenarioOpening,
} from './scenarioOpening.js';
import {
  advanceGameDays,
  executeGameAction,
} from './gameTransitions.js';

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
  const difficultyOptions: DifficultyOption[] = useMemo(() => getDifficultyOptions(), []);
  const [state, setState] = useState<GameState | null>(null);
  const [catalog, setCatalog] = useState<ScenarioSummary[]>([]);
  const [featuredScenarios, setFeaturedScenarios] = useState<FeaturedScenarioPreview[]>([]);
  const [leaderboardDetail, setLeaderboardDetail] = useState<MaintainerLeaderboardDetail | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [starting, setStarting] = useState(false);
  const [lastDifficulty, setLastDifficulty] = useState<DifficultyId>('standard');
  const cloudMetaRef = useRef(loadMaintainerCloudMeta(playerContext.accountScopeKey));
  const userIdRef = useRef('');
  const hydratedRef = useRef(false);
  const skipCloudSaveRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let disposed = false;

    const bootstrap = async () => {
      if (
        playerContext.emailScopeKey
        && playerContext.emailScopeKey !== playerContext.accountScopeKey
      ) {
        migrateSavedStateScope(playerContext.accountScopeKey, playerContext.emailScopeKey);
        migrateMaintainerCloudMetaScope(playerContext.accountScopeKey, playerContext.emailScopeKey);
        migrateMaintainerUserIdScope(playerContext.accountScopeKey, playerContext.emailScopeKey);
      }

      const userId = getOrCreateMaintainerUserId(playerContext.accountScopeKey);
      userIdRef.current = userId;
      const localCatalog = await loadScenarioOpeningCatalog(activationKey, difficultyOptions);
      if (!disposed) {
        setCatalog(localCatalog.scenarios);
        setFeaturedScenarios(localCatalog.featuredScenarios);
      }

      const localState = loadSavedState(playerContext.accountScopeKey);
      let nextState = localState;
      const localMeta = loadMaintainerCloudMeta(playerContext.accountScopeKey);
      cloudMetaRef.current = localMeta;

      if (activationKey) {
        try {
          const preferredCloudRun = await loadPreferredMaintainerCloudRun({
            userId,
            localMeta,
            fetchRun: async (runId) => fetchMaintainerRun(activationKey, runId, userId),
            listRuns: async (resumeUserId) => {
              const payload = await fetchMaintainerRuns(activationKey, resumeUserId, 8);
              return payload.runs;
            },
          });

          if (preferredCloudRun) {
            const { run: cloudRun, meta: nextMeta } = preferredCloudRun;
            const normalized = normalizeLoadedState(cloudRun.saveData);

            if (normalized && (!localState || cloudRun.syncVersion >= (localMeta?.syncVersion || 0))) {
              nextState = normalized;
              saveGameState(normalized, playerContext.accountScopeKey);
            }

            cloudMetaRef.current = nextMeta;
            saveMaintainerCloudMeta(nextMeta, playerContext.accountScopeKey);
          }
        } catch (error) {
          console.warn('Failed to hydrate maintainer cloud save:', error);
        }
      }

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
    };

    bootstrap();

    return () => {
      disposed = true;
    };
  }, [activationKey, difficultyOptions, playerContext.accountScopeKey]);

  useEffect(() => {
    if (!state) {
      return;
    }

    saveGameState(state, playerContext.accountScopeKey);
  }, [state, playerContext.accountScopeKey]);

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
      const userId = userIdRef.current || getOrCreateMaintainerUserId(playerContext.accountScopeKey);
      const currentMeta = cloudMetaRef.current;

      try {
        if (!currentMeta?.runId) {
          const created = await createMaintainerRun(activationKey, {
            userId,
            playerName: playerContext.displayName,
            state,
            clientUpdatedAt: new Date().toISOString(),
          });

          cloudMetaRef.current = {
            runId: created.runId,
            syncVersion: created.syncVersion,
            updatedAt: created.updatedAt,
          };
          saveMaintainerCloudMeta(cloudMetaRef.current, playerContext.accountScopeKey);
          return;
        }

        const saved = await saveMaintainerRun(activationKey, {
          runId: currentMeta.runId,
          userId,
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
        saveMaintainerCloudMeta(cloudMetaRef.current, playerContext.accountScopeKey);
      } catch (error) {
        const latest = error instanceof Error && 'latest' in error
          ? (error as Error & { latest?: { saveData?: unknown; runId?: string; syncVersion?: number; updatedAt?: string } }).latest
          : null;

        if (latest?.saveData) {
          const normalized = normalizeLoadedState(latest.saveData);
          if (normalized) {
            skipCloudSaveRef.current = true;
            setState(normalized);
            saveGameState(normalized, playerContext.accountScopeKey);
          }
        }

        if (latest?.runId && Number.isFinite(latest.syncVersion)) {
          cloudMetaRef.current = {
            runId: latest.runId,
            syncVersion: Number(latest.syncVersion),
            updatedAt: latest.updatedAt || new Date().toISOString(),
          };
          saveMaintainerCloudMeta(cloudMetaRef.current, playerContext.accountScopeKey);
        }

        console.warn('Failed to sync maintainer cloud save:', error);
      }
    }, 900);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [state, activationKey, playerContext.accountScopeKey, playerContext.displayName]);

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
    clearMaintainerCloudMeta(playerContext.accountScopeKey);
    clearSavedGameState(playerContext.accountScopeKey);
    cloudMetaRef.current = null;
    setState(world);
    saveGameState(world, playerContext.accountScopeKey);
  }, [playerContext.accountScopeKey]);

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

  const handleReset = useCallback(() => {
    clearMaintainerCloudMeta(playerContext.accountScopeKey);
    clearSavedGameState(playerContext.accountScopeKey);
    cloudMetaRef.current = null;
    setState(null);
  }, [playerContext.accountScopeKey]);

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
    handleReset,
    handleClearReport,
  };
}
