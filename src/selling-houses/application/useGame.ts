import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { DifficultyId, GameState, ScenarioSnapshot, ScenarioSummary, DifficultyOption, Case } from '../domain/models';
import {
  clearSavedGameState,
  createInitialState,
  loadSavedState,
  normalizeLoadedState,
  saveGameState,
  updateDerivedState,
} from './gameState';
import { advanceDays, executeAction, seedInitialOpportunities } from '../domain/engine';
import {
  getDifficultyOptions,
  getScenarioSnapshotById,
  listBuiltInScenarioSummaries,
} from '../domain/scenarioCatalog';
import {
  clearMaintainerCloudMeta,
  getOrCreateMaintainerUserId,
  loadMaintainerCloudMeta,
  saveMaintainerCloudMeta,
} from './cloudState';
import {
  createMaintainerRun,
  fetchMaintainerRun,
  fetchSellingHousesScenario,
  fetchSellingHousesScenarioCatalog,
  saveMaintainerRun,
} from '../infrastructure/cloudClient';

function buildWorldFromScenario(snapshot: ScenarioSnapshot) {
  const seed = Date.now() % 2147483647;
  const world = createInitialState(snapshot, seed);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

async function loadScenarioCatalog(activationKey?: string) {
  if (!activationKey) {
    return listBuiltInScenarioSummaries();
  }

  try {
    const payload = await fetchSellingHousesScenarioCatalog(activationKey);
    if (Array.isArray(payload?.scenarios) && payload.scenarios.length > 0) {
      return payload.scenarios;
    }
  } catch (error) {
    console.warn('Failed to load scenario catalog from cloud:', error);
  }

  return listBuiltInScenarioSummaries();
}

async function loadScenarioSnapshot(activationKey: string | undefined, scenarioId: string) {
  if (activationKey) {
    try {
      const payload = await fetchSellingHousesScenario(activationKey, scenarioId);
      if (payload?.scenario?.id && payload?.world?.id) {
        return {
          source: 'cloud' as const,
          scenario: payload.scenario,
          world: payload.world,
        };
      }
    } catch (error) {
      console.warn('Failed to load scenario detail from cloud:', error);
    }
  }

  const snapshot = getScenarioSnapshotById(scenarioId);
  if (!snapshot) {
    throw new Error(`未找到剧本 ${scenarioId}`);
  }
  return snapshot;
}

function pickRandomScenarioId(catalog: ScenarioSummary[], difficultyId: DifficultyId) {
  const candidates = catalog.filter((entry) => entry.difficultyId === difficultyId);
  if (!candidates.length) {
    return null;
  }

  const index = Math.floor(Math.random() * candidates.length);
  return candidates[index]?.id || null;
}

export function useGame(activationKey?: string) {
  const [state, setState] = useState<GameState | null>(null);
  const [catalog, setCatalog] = useState<ScenarioSummary[]>([]);
  const [booting, setBooting] = useState(true);
  const [starting, setStarting] = useState(false);
  const [lastDifficulty, setLastDifficulty] = useState<DifficultyId>('standard');
  const cloudMetaRef = useRef(loadMaintainerCloudMeta());
  const userIdRef = useRef('');
  const hydratedRef = useRef(false);
  const skipCloudSaveRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    let disposed = false;

    const bootstrap = async () => {
      const userId = getOrCreateMaintainerUserId();
      userIdRef.current = userId;
      const localCatalog = await loadScenarioCatalog(activationKey);
      if (!disposed) {
        setCatalog(localCatalog);
      }

      const localState = loadSavedState();
      let nextState = localState;
      const localMeta = loadMaintainerCloudMeta();
      cloudMetaRef.current = localMeta;

      if (activationKey && localMeta?.runId) {
        try {
          const cloudRun = await fetchMaintainerRun(activationKey, localMeta.runId, userId);
          const normalized = normalizeLoadedState(cloudRun.saveData);

          if (normalized && (!localState || cloudRun.syncVersion >= localMeta.syncVersion)) {
            nextState = normalized;
            saveGameState(normalized);
          }

          cloudMetaRef.current = {
            runId: cloudRun.runId,
            syncVersion: cloudRun.syncVersion,
            updatedAt: cloudRun.updatedAt,
          };
          saveMaintainerCloudMeta(cloudMetaRef.current);
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
  }, [activationKey]);

  useEffect(() => {
    if (!state) {
      return;
    }

    saveGameState(state);
  }, [state]);

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
      const userId = userIdRef.current || getOrCreateMaintainerUserId();
      const currentMeta = cloudMetaRef.current;

      try {
        if (!currentMeta?.runId) {
          const created = await createMaintainerRun(activationKey, {
            userId,
            playerName: '匿名维护人',
            state,
            clientUpdatedAt: new Date().toISOString(),
          });

          cloudMetaRef.current = {
            runId: created.runId,
            syncVersion: created.syncVersion,
            updatedAt: created.updatedAt,
          };
          saveMaintainerCloudMeta(cloudMetaRef.current);
          return;
        }

        const saved = await saveMaintainerRun(activationKey, {
          runId: currentMeta.runId,
          userId,
          playerName: '匿名维护人',
          state,
          expectedSyncVersion: currentMeta.syncVersion,
          clientUpdatedAt: new Date().toISOString(),
        });

        cloudMetaRef.current = {
          runId: saved.runId,
          syncVersion: saved.syncVersion,
          updatedAt: saved.updatedAt,
        };
        saveMaintainerCloudMeta(cloudMetaRef.current);
      } catch (error) {
        const latest = error instanceof Error && 'latest' in error
          ? (error as Error & { latest?: { saveData?: unknown; runId?: string; syncVersion?: number; updatedAt?: string } }).latest
          : null;

        if (latest?.saveData) {
          const normalized = normalizeLoadedState(latest.saveData);
          if (normalized) {
            skipCloudSaveRef.current = true;
            setState(normalized);
            saveGameState(normalized);
          }
        }

        if (latest?.runId && Number.isFinite(latest.syncVersion)) {
          cloudMetaRef.current = {
            runId: latest.runId,
            syncVersion: Number(latest.syncVersion),
            updatedAt: latest.updatedAt || new Date().toISOString(),
          };
          saveMaintainerCloudMeta(cloudMetaRef.current);
        }

        console.warn('Failed to sync maintainer cloud save:', error);
      }
    }, 900);

    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [state, activationKey]);

  const startRandomRun = useCallback(async (difficultyId: DifficultyId) => {
    setStarting(true);
    try {
      const scenarioId = pickRandomScenarioId(catalog.length ? catalog : listBuiltInScenarioSummaries(), difficultyId);
      if (!scenarioId) {
        throw new Error('当前难度下没有可用剧本。');
      }

      const snapshot = await loadScenarioSnapshot(activationKey, scenarioId);
      const world = buildWorldFromScenario(snapshot);
      setLastDifficulty(difficultyId);
      clearMaintainerCloudMeta();
      clearSavedGameState();
      cloudMetaRef.current = null;
      setState(world);
      saveGameState(world);
    } finally {
      setStarting(false);
    }
  }, [activationKey, catalog]);

  const handleSelectCase = useCallback((id: string) => {
    setState((prev) => {
      if (!prev) return null;
      return { ...prev, selectedCaseId: id };
    });
  }, []);

  const handleAdvanceDays = useCallback((count: number, onMessage?: (msg: string) => void) => {
    setState((prev) => {
      if (!prev) return null;
      const next = { ...prev };
      advanceDays(next, count, onMessage);
      return { ...next };
    });
  }, []);

  const handleExecuteAction = useCallback((actionId: string, caseItem: Case, optionId: string | null = null, onMessage?: (msg: string) => void) => {
    let success = false;
    setState((prev) => {
      if (!prev) return null;
      const next = { ...prev };
      const currentCase = next.cases.find((entry) => entry.id === caseItem.id);
      if (currentCase) {
        success = executeAction(next, actionId, currentCase, optionId, onMessage);
      }
      return { ...next };
    });
    return success;
  }, []);

  const handleReset = useCallback(() => {
    if (window.confirm('确定要结束当前这一局并回到难度选择吗？')) {
      clearMaintainerCloudMeta();
      clearSavedGameState();
      cloudMetaRef.current = null;
      setState(null);
    }
  }, []);

  const handleAutoExecute = useCallback(() => {
    if (!state || state.energy <= 0) return;
    const topPriority = state.priorities.find((entry) => entry.kind === 'case');
    if (topPriority?.caseId) {
      const caseItem = state.cases.find((entry) => entry.id === topPriority.caseId);
      if (caseItem) {
        handleExecuteAction('owner-call', caseItem, null, (msg) => console.log('Auto-Exec:', msg));
      }
    }
  }, [state, handleExecuteAction]);

  const handleClearReport = useCallback(() => {
    setState((prev) => (prev ? { ...prev, currentReport: null } : null));
  }, []);

  const difficultyOptions: DifficultyOption[] = useMemo(() => getDifficultyOptions(), []);

  return {
    phase: booting ? 'loading' as const : state ? 'playing' as const : 'setup' as const,
    state,
    catalog,
    difficultyOptions,
    lastDifficulty,
    starting,
    startRandomRun,
    handleSelectCase,
    handleAdvanceDays,
    handleExecuteAction,
    handleReset,
    handleAutoExecute,
    handleClearReport,
  };
}
