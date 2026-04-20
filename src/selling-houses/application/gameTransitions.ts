import type { GameState } from '../domain/models.js';
import { advanceDays, executeAction } from '../domain/engine.js';

export function cloneGameState(state: GameState): GameState {
  return structuredClone(state);
}

export function transitionGameState(
  state: GameState,
  transition: (next: GameState) => void,
): GameState {
  const next = cloneGameState(state);
  transition(next);
  return next;
}

export function advanceGameDays(
  state: GameState,
  count: number,
  onMessage?: (msg: string) => void,
): GameState {
  return transitionGameState(state, (next) => {
    advanceDays(next, count, onMessage);
  });
}

export function executeGameAction(
  state: GameState,
  actionId: string,
  caseId: string,
  optionId: string | null = null,
  onMessage?: (msg: string) => void,
) {
  let success = false;
  const nextState = transitionGameState(state, (next) => {
    const currentCase = next.cases.find((entry) => entry.id === caseId);
    if (currentCase) {
      success = executeAction(next, actionId, currentCase, optionId, onMessage);
    }
  });

  return {
    nextState,
    success,
  };
}
