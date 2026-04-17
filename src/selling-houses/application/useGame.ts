import { useState, useCallback, useEffect } from 'react';
import { GameState, Case } from '../domain/models';
import { 
  createInitialState, loadSavedState, saveGameState, updateDerivedState 
} from './gameState';
import { 
  advanceDays, executeAction, seedInitialOpportunities 
} from '../domain/engine';
import { MARKET_CELLS, CUSTOMER_POOL, CHANNELS } from '../domain/constants';

export function useGame() {
  const [state, setState] = useState<GameState | null>(null);

  useEffect(() => {
    const saved = loadSavedState();
    if (saved) {
      setState(saved);
    } else {
      const world = createInitialState(MARKET_CELLS, CUSTOMER_POOL, CHANNELS);
      seedInitialOpportunities(world);
      updateDerivedState(world);
      setState(world);
    }
  }, []);

  const handleSelectCase = useCallback((id: string) => {
    setState(prev => {
      if (!prev) return null;
      return { ...prev, selectedCaseId: id };
    });
  }, []);

  const handleAdvanceDays = useCallback((count: number, onMessage?: (msg: string) => void) => {
    setState(prev => {
      if (!prev) return null;
      const next = { ...prev };
      advanceDays(next, count, onMessage);
      return { ...next };
    });
  }, []);

  const handleExecuteAction = useCallback((actionId: string, caseItem: Case, optionId: string | null = null, onMessage?: (msg: string) => void) => {
    let success = false;
    setState(prev => {
      if (!prev) return null;
      const next = { ...prev };
      const currentCase = next.cases.find(c => c.id === caseItem.id);
      if (currentCase) {
        success = executeAction(next, actionId, currentCase, optionId, onMessage);
      }
      return { ...next };
    });
    return success;
  }, []);

  const handleReset = useCallback(() => {
    if (window.confirm("确定要重置当前进度吗？")) {
      const world = createInitialState(MARKET_CELLS, CUSTOMER_POOL, CHANNELS);
      seedInitialOpportunities(world);
      updateDerivedState(world);
      setState(world);
      saveGameState(world);
    }
  }, []);

  const handleAutoExecute = useCallback(() => {
    // Basic heuristic: execute the top priority case action if it's clear
    if (!state || state.energy <= 0) return;
    const topPriority = state.priorities.find(p => p.kind === 'case');
    if (topPriority && topPriority.caseId) {
      const caseItem = state.cases.find(c => c.id === topPriority.caseId);
      if (caseItem) {
        handleExecuteAction('owner-call', caseItem, null, (msg) => console.log("Auto-Exec:", msg));
      }
    }
  }, [state, handleExecuteAction]);

  return {
    state,
    handleSelectCase,
    handleAdvanceDays,
    handleExecuteAction,
    handleReset,
    handleAutoExecute
  };
}
