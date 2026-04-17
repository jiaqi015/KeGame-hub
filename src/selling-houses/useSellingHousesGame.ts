import { useState, useCallback, useEffect } from 'react';
import { GameState, createInitialState, loadSavedState, saveGameState, updateDerivedState } from './core/gameState';
import { advanceDays, executeAction, seedInitialOpportunities } from './core/gameEngine';
import { MARKET_CELLS, CUSTOMER_POOL, CHANNELS } from './core/constants';

export function useSellingHousesGame() {
  const [state, setState] = useState<GameState>(() => {
    const saved = loadSavedState();
    if (saved) return saved;
    const initial = createInitialState(MARKET_CELLS, CUSTOMER_POOL, CHANNELS);
    seedInitialOpportunities(initial);
    updateDerivedState(initial);
    return initial;
  });

  const [message, setMessage] = useState<string>('');

  const onAdvanceDays = useCallback((count: number) => {
    setState(prev => {
      const next = { ...prev };
      advanceDays(next, count, (msg) => setMessage(msg));
      return next;
    });
  }, []);

  const onAdvanceWeek = useCallback(() => {
    setState(prev => {
      const next = { ...prev };
      advanceDays(next, 7, (msg) => setMessage(`已快速推进一周。期间共为您处理了多项基础维护动作。`));
      return next;
    });
  }, []);

  const onAutoExecute = useCallback(() => {
    setState(prev => {
      const next = { ...prev };
      let actionsDone = 0;
      // Greedy execution based on priorities
      next.priorities.forEach(p => {
        if (next.energy <= 0) return;
        const caseItem = next.cases.find(c => c.id === p.caseId);
        if (!caseItem || caseItem.status !== 'active') return;

        // Simple heuristic for auto-choice
        const actionId = p.kind === 'case' ? 'owner-call' : 'showing';
        const action = next.cases.find(c => c.id === p.caseId);
        
        // Use executeAction from engine directly
        const success = executeAction(next, actionId, caseItem, 'balanced', () => {});
        if (success) actionsDone++;
      });

      updateDerivedState(next);
      saveGameState(next);
      setMessage(`自动执行完毕，本日完成了 ${actionsDone} 项核心经营动作。`);
      return next;
    });
  }, []);

  const onExecuteAction = useCallback((actionId: string, caseItem: any, optionId: string | null = null) => {
    let success = false;
    setState(prev => {
      const next = { ...prev };
      // Note: we find the case in the new state to apply mutations
      const targetCase = next.cases.find(c => c.id === caseItem.id);
      success = executeAction(next, actionId, targetCase, optionId, (msg) => setMessage(msg));
      return next;
    });
    return success;
  }, []);

  const onRestart = useCallback(() => {
    const fresh = createInitialState(MARKET_CELLS, CUSTOMER_POOL, CHANNELS);
    seedInitialOpportunities(fresh);
    updateDerivedState(fresh);
    setState(fresh);
    saveGameState(fresh);
    setMessage('新局已开始。');
  }, []);

  const onSelectCase = useCallback((id: string) => {
    setState(prev => ({ ...prev, selectedCaseId: id }));
  }, []);

  // Clear message after delay
  useEffect(() => {
    if (message) {
      const timer = setTimeout(() => setMessage(''), 5000);
      return () => clearTimeout(timer);
    }
  }, [message]);

  return {
    state,
    message,
    onAdvanceDays,
    onAdvanceWeek,
    onAutoExecute,
    onExecuteAction,
    onRestart,
    onSelectCase
  };
}
