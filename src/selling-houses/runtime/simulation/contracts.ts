import type { DomainEventEntry, GameState } from '../../domain/models';

export type EngineReadScope =
  | 'state'
  | 'cases'
  | 'opportunities'
  | 'customers'
  | 'markets'
  | 'budget'
  | 'schedule'
  | 'matters';

export type EngineWriteScope =
  | 'resources'
  | 'cases'
  | 'opportunities'
  | 'customers'
  | 'markets'
  | 'budgetLedger'
  | 'eventStore'
  | 'schedule'
  | 'matters'
  | 'derivedState';

export type EngineEmitScope =
  | 'domainEvent'
  | 'eventLog'
  | 'message'
  | 'dailyTickResult';

export type EngineReadContract = {
  scope: EngineReadScope;
  reason?: string;
};

export type EngineWriteContract = {
  scope: EngineWriteScope;
  reason?: string;
};

export type EngineEmitContract = {
  scope: EngineEmitScope;
  reason?: string;
};

export type EngineRuntimeContract = {
  reads: EngineReadContract[];
  writes: EngineWriteContract[];
  emits: EngineEmitContract[];
};

export type EngineStateReader<T = unknown> = (state: Readonly<GameState>) => T;
export type EngineStateWriter<T = void> = (state: GameState) => T;
export type EngineEventEmitter = (event: DomainEventEntry) => void;
