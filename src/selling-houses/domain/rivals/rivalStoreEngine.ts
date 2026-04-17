import type { GameState } from '../models';
import { clamp, randomInt } from '../utils';

export function tickRivalStores(state: GameState) {
  state.marketShadow.rivalStores.forEach((store) => {
    const stylePulse = store.style === 'aggressive'
      ? 2
      : store.style === 'traffic'
        ? 1
        : store.style === 'relationship'
          ? 0.5
          : 0;
    store.activityHeat = clamp(store.activityHeat + randomInt(-4, 5, state) + stylePulse, 12, 96);
  });
}
