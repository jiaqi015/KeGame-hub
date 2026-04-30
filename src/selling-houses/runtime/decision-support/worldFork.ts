import type { GameState } from '../../domain/models.js';

type Primitive = string | number | boolean | bigint | symbol | null | undefined;

type ReadonlyDeep<T> =
  T extends Primitive ? T
    : T extends (...args: any[]) => unknown ? T
      : T extends readonly (infer Item)[] ? readonly ReadonlyDeep<Item>[]
        : T extends object ? { readonly [Key in keyof T]: ReadonlyDeep<T[Key]> }
          : T;

export type WorldForkReceipt = ReadonlyDeep<{
  receiptKind: 'world_fork_receipt';
  source: 'legacy-game-state-clone';
  readOnly: true;
  forkKind: 'counterfactual-preview';
  baseRunId: string;
  baseDay: number;
  baseCurrentDate: string;
  baseLocalRevision: number;
  rngState: number;
  rngCalls: number;
  caseCount: number;
  opportunityCount: number;
  eventCount: number;
  closedDealCount: number;
  productRunCount: number;
  hasLastDailyTickResult: boolean;
  forkCreatedAt: string;
  mutationPolicy: 'clone-before-simulate';
}>;

export type WorldForkDraft = Readonly<{
  forkState: GameState;
  receipt: WorldForkReceipt;
}>;

export type CreateCounterfactualWorldForkOptions = Readonly<{
  forkCreatedAt?: string;
}>;

type WorldForkReceiptSource = Readonly<Partial<GameState>>;

function freezeReceipt<T>(value: T): ReadonlyDeep<T> {
  if (!value || typeof value !== 'object') {
    return value as ReadonlyDeep<T>;
  }

  for (const key of Object.keys(value as Record<string, unknown>)) {
    const nested = (value as Record<string, unknown>)[key];
    if (nested && typeof nested === 'object') {
      freezeReceipt(nested);
    }
  }

  return Object.freeze(value) as ReadonlyDeep<T>;
}

function cloneForkState(state: Readonly<GameState>): GameState {
  return structuredClone(state) as GameState;
}

function readArray(value: unknown): readonly unknown[] {
  return Array.isArray(value) ? value : [];
}

function readNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function buildWorldForkReceipt(
  state: WorldForkReceiptSource,
  forkCreatedAt: string,
): WorldForkReceipt {
  return freezeReceipt({
    receiptKind: 'world_fork_receipt',
    source: 'legacy-game-state-clone',
    readOnly: true,
    forkKind: 'counterfactual-preview',
    baseRunId: readString(state.runId),
    baseDay: readNumber(state.day),
    baseCurrentDate: readString(state.currentDate),
    baseLocalRevision: readNumber(state.localRevision),
    rngState: readNumber(state.rngState),
    rngCalls: readNumber(state.rngCalls),
    caseCount: readArray(state.cases).length,
    opportunityCount: readArray(state.opportunities).length,
    eventCount: readArray(state.eventStore).length,
    closedDealCount: readArray(state.closedDeals).length,
    productRunCount: readArray(state.productRuns).length,
    hasLastDailyTickResult: Boolean(state.lastDailyTickResult),
    forkCreatedAt,
    mutationPolicy: 'clone-before-simulate',
  } satisfies WorldForkReceipt);
}

export function createCounterfactualWorldFork(
  state: Readonly<GameState>,
  options: CreateCounterfactualWorldForkOptions = {},
): WorldForkDraft {
  return {
    forkState: cloneForkState(state),
    receipt: buildWorldForkReceipt(state, options.forkCreatedAt ?? new Date().toISOString()),
  };
}
