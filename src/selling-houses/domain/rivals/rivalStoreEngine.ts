import type { GameState } from '../models.js';
import { getRivalOutcomeControl } from '../engine/outcomeControlRuntime.js';
import { clamp, randomInt } from '../utils.js';

export function tickRivalStores(state: GameState) {
  const { rivalStoreCapabilityScale } = getRivalOutcomeControl(state);
  state.marketShadow.rivalStores.forEach((store) => {
    const stylePulse = store.style === 'aggressive'
      ? 2
      : store.style === 'traffic'
        ? 1
        : store.style === 'relationship'
          ? 0.5
          : 0;
    const activityDelta = randomInt(-4, 5, state) + stylePulse * rivalStoreCapabilityScale;
    store.activityHeat = clamp(store.activityHeat + activityDelta, 12, 96);
  });
}
