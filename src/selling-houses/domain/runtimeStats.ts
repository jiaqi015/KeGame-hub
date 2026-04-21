import type {
  AuxiliaryStats,
  GameState,
  RuntimeAuxiliaryStats,
} from './models.js';

type AuxiliaryStatsInput = Partial<Pick<
  GameState,
  'cash' | 'auxiliaryStats' | 'closedDeals' | 'commission' | 'reputation' | 'soldCount' | 'withdrawnCount'
>> & {
  wordOfMouth?: number;
};

function toNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

export function buildAuxiliaryStats(
  input: AuxiliaryStatsInput,
): AuxiliaryStats {
  const runtimeStats = buildRuntimeAuxiliaryStats(input);
  return {
    commission: runtimeStats.commission,
    wordOfMouth: runtimeStats.wordOfMouth,
    soldCount: runtimeStats.soldCount,
    withdrawnCount: runtimeStats.withdrawnCount,
  };
}

export function buildRuntimeAuxiliaryStats(
  input: AuxiliaryStatsInput,
): RuntimeAuxiliaryStats {
  const auxiliaryStats = input.auxiliaryStats;
  // Older saves used "reputation"; runtime code now treats the value as auxiliary word-of-mouth.
  const legacyAuxiliaryStats = auxiliaryStats as Partial<RuntimeAuxiliaryStats> & { reputation?: number } | undefined;
  return {
    promotionBudget: toNumber(auxiliaryStats?.promotionBudget ?? input.cash),
    commission: toNumber(auxiliaryStats?.commission ?? input.commission),
    wordOfMouth: toNumber(auxiliaryStats?.wordOfMouth ?? legacyAuxiliaryStats?.reputation ?? input.wordOfMouth ?? input.reputation),
    soldCount: resolveFormalSoldCount(input),
    withdrawnCount: toNumber(auxiliaryStats?.withdrawnCount ?? input.withdrawnCount),
  };
}

export function resolveFormalSoldCount(input: AuxiliaryStatsInput) {
  if (Array.isArray(input.closedDeals) && input.closedDeals.length > 0) {
    return input.closedDeals.length;
  }

  return toNumber(input.auxiliaryStats?.soldCount ?? input.soldCount);
}

export function syncAuxiliaryStats(state: GameState) {
  state.auxiliaryStats = buildRuntimeAuxiliaryStats(state);
  syncAuxiliaryMirrors(state);
}

export function getPromotionBudget(state: Pick<GameState, 'auxiliaryStats' | 'cash'>) {
  return toNumber(state.auxiliaryStats?.promotionBudget ?? state.cash);
}

export function getWordOfMouth(state: Pick<GameState, 'auxiliaryStats' | 'reputation'>) {
  const auxiliaryStats = state.auxiliaryStats as Partial<RuntimeAuxiliaryStats> & { reputation?: number } | undefined;
  return toNumber(auxiliaryStats?.wordOfMouth ?? auxiliaryStats?.reputation ?? state.reputation);
}

export function syncAuxiliaryMirrors(state: GameState) {
  state.cash = getPromotionBudget(state);
  state.commission = state.auxiliaryStats.commission;
  state.reputation = getWordOfMouth(state);
  state.soldCount = state.auxiliaryStats.soldCount;
  state.withdrawnCount = state.auxiliaryStats.withdrawnCount;
}

export function applyAuxiliaryStats(state: GameState, next: Partial<RuntimeAuxiliaryStats>) {
  state.auxiliaryStats = {
    ...state.auxiliaryStats,
    ...next,
  };
  syncAuxiliaryMirrors(state);
}
