import type { GameState } from '../models.js';

export function getMarketCell(state: GameState, id: string) {
  return state.markets.find((entry) => entry.id === id);
}
