import type { GameState, ForeshadowingHook, DomainEventEntry } from '../models.js';
import { randomInt } from '../utils.js';

export function checkForeshadowing(
  store: ForeshadowingHook[] | undefined,
  eventStore: DomainEventEntry[],
  currentDay: number
): ForeshadowingHook[] {
  if (!store) return [];

  const resolvedHooks: ForeshadowingHook[] = [];
  
  for (const hook of store) {
    if (hook.expirationDay < currentDay) continue;

    // 假设 conditionToTrigger 是一种特定事件类型的标识
    const hasTriggerEvent = eventStore.some(
      e => e.day === currentDay && e.kind === hook.conditionToTrigger && e.caseId === hook.relatedEntityId
    );

    if (hasTriggerEvent) {
      resolvedHooks.push(hook);
    }
  }

  return resolvedHooks;
}

export function buryNewForeshadowings(state: GameState, newHooks: string[]): void {
  if (!state.foreshadowingStore) {
    state.foreshadowingStore = [];
  }
  
  // 清理过期 hook
  state.foreshadowingStore = state.foreshadowingStore.filter(h => h.expirationDay >= state.day);
  
  // 加入新的 hook
  newHooks.forEach((hookType, index) => {
    state.foreshadowingStore!.push({
      id: `hook_${state.day}_${state.eventStore.length}_${index}_${randomInt(100, 999, state)}`,
      hookType,
      sourceEventId: '',
      buryDay: state.day,
      conditionToTrigger: hookType === 'competitor_price_drop' ? 'market_event' : 'case_withdrawn',
      expirationDay: state.day + 3,
      description: `悬念: ${hookType}`,
    });
  });
}
