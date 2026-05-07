import type {
  DailyTickResult,
  DirtyScopeSet,
  GameState,
  TickInvariantAlert,
} from '../../domain/models.js';
import {
  countDailyProcessResultsByManager,
  groupDailyProcessResultsByPhase,
  readDailyProcessResultReadModels,
  type DailyProcessManagerCounts,
  type DailyProcessResultReadModel,
} from './dailyProcessResult.js';

type Primitive = string | number | boolean | bigint | symbol | null | undefined;

type ReadonlyDeep<T> =
  T extends Primitive ? T
    : T extends (...args: any[]) => unknown ? T
      : T extends readonly (infer Item)[] ? readonly ReadonlyDeep<Item>[]
        : T extends object ? { readonly [Key in keyof T]: ReadonlyDeep<T[Key]> }
          : T;

type DailyTickReceiptSource = Readonly<Partial<Omit<DailyTickResult, 'processResults'>> & {
  processResults?: unknown;
}>;

export type DailyTickReceiptInvariantLevel = 'none' | TickInvariantAlert['level'];

export type DailyTickReceiptProcessResult = ReadonlyDeep<Pick<
  DailyProcessResultReadModel,
  | 'managerId'
  | 'owner'
  | 'outcomeOwner'
  | 'day'
  | 'phase'
  | 'processedCount'
  | 'resolvedCount'
  | 'emittedEventIds'
  | 'closedDealIds'
  | 'opportunityIds'
  | 'productRunIds'
>>;

export type DailyTickReceipt = ReadonlyDeep<{
  receiptKind: 'daily_tick_receipt';
  source: 'domain-daily-tick-result';
  readOnly: true;
  day: number;
  nextDay: number;
  emittedEventCount: number;
  closedDealCount: number;
  processResultCount: number;
  invariantAlertCount: number;
  dirtyScopeCounts: {
    cases: number;
    opportunities: number;
    customers: number;
    owners: number;
    districts: number;
    marketCells: number;
    matters: number;
    market: boolean;
    dashboard: boolean;
    result: boolean;
  };
  processManagerCounts: DailyProcessManagerCounts;
  /**
   * Compatibility mirror containing both settled-day and next-day setup rows.
   * New consumers should prefer settledDayProcessResults / nextDaySetupProcessResults.
   */
  processResults: DailyTickReceiptProcessResult[];
  settledDayProcessResults: DailyTickReceiptProcessResult[];
  nextDaySetupProcessResults: DailyTickReceiptProcessResult[];
  emittedEventIds: string[];
  closedDealIds: string[];
  // Compatibility mirrors for older consumers. New consumers should prefer grouped process result rows.
  processOpportunityIds: string[];
  processProductRunIds: string[];
  maxInvariantLevel: DailyTickReceiptInvariantLevel;
  /** Semantic receipt summary. Undefined when not available (old saves). */
  semanticReceiptSummary?: {
    readonly sceneCount: number;
    readonly sceneTypes: readonly string[];
    readonly narrativePackId: string;
    readonly narrativePackHash: string;
    readonly sourceRefCount: number;
    readonly evidenceRefCount: number;
    readonly pressureAvailable: boolean;
    readonly pressureSnapshotCount: number;
    readonly consensusAvailable: boolean;
    readonly consensusFormationCount: number;
    readonly llmReady: boolean;
  };
}>;

function buildReceiptProcessResult(result: DailyProcessResultReadModel): DailyTickReceiptProcessResult {
  return {
    managerId: result.managerId,
    owner: result.owner,
    outcomeOwner: result.outcomeOwner,
    day: result.day,
    phase: result.phase,
    processedCount: result.processedCount,
    resolvedCount: result.resolvedCount,
    emittedEventIds: copyIds(result.emittedEventIds),
    closedDealIds: copyIds(result.closedDealIds),
    opportunityIds: copyIds(result.opportunityIds),
    productRunIds: copyIds(result.productRunIds),
  };
}

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

function readArray<T>(value: unknown): readonly T[] {
  return Array.isArray(value) ? value as readonly T[] : [];
}

function readNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readBoolean(value: unknown): boolean {
  return value === true;
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function copyIds(ids: readonly string[]): string[] {
  return [...ids];
}

function readDirtyScopeCounts(dirtyScopes: unknown): DailyTickReceipt['dirtyScopeCounts'] {
  const scopes = readObject(dirtyScopes) as Partial<Record<keyof DirtyScopeSet, unknown>>;
  return {
    cases: readArray(scopes.cases).length,
    opportunities: readArray(scopes.opportunities).length,
    customers: readArray(scopes.customers).length,
    owners: readArray(scopes.owners).length,
    districts: readArray(scopes.districts).length,
    marketCells: readArray(scopes.marketCells).length,
    matters: readArray(scopes.matters).length,
    market: readBoolean(scopes.market),
    dashboard: readBoolean(scopes.dashboard),
    result: readBoolean(scopes.result),
  };
}

function maxInvariantLevel(alerts: readonly Partial<TickInvariantAlert>[]): DailyTickReceiptInvariantLevel {
  if (alerts.some((alert) => alert.level === 'error')) {
    return 'error';
  }

  if (alerts.some((alert) => alert.level === 'warning')) {
    return 'warning';
  }

  return 'none';
}

function buildSemanticReceiptSummary(result: DailyTickReceiptSource): DailyTickReceipt['semanticReceiptSummary'] {
  const semantic = readObject(result.semanticReceipts);
  if (!semantic || typeof semantic.day !== 'number') {
    return undefined;
  }

  const interactionScenes = readObject(semantic.interactionScenes);
  const narrativeSignalPack = readObject(semantic.narrativeSignalPack);
  const pressureReceipts = readObject(semantic.pressureReceipts);
  const consensusReceipts = readObject(semantic.consensusReceipts);

  return {
    sceneCount: readNumber(interactionScenes.sceneCount),
    sceneTypes: readArray<string>(interactionScenes.sceneTypes),
    narrativePackId: readString(narrativeSignalPack.packId),
    narrativePackHash: readString(narrativeSignalPack.packHash),
    sourceRefCount: readNumber(narrativeSignalPack.sourceRefCount),
    evidenceRefCount: readNumber(narrativeSignalPack.evidenceRefCount),
    pressureAvailable: readBoolean(pressureReceipts.available),
    pressureSnapshotCount: readNumber(pressureReceipts.snapshotCount),
    consensusAvailable: readBoolean(consensusReceipts.available),
    consensusFormationCount: readNumber(consensusReceipts.formationCount),
    llmReady: readBoolean(semantic.llmReady),
  };
}

export function buildDailyTickReceipt(result: DailyTickReceiptSource): DailyTickReceipt {
  const processResults = readDailyProcessResultReadModels(result);
  const processResultGroups = groupDailyProcessResultsByPhase(processResults);
  const emittedEvents = readArray<Record<string, unknown>>(result.emittedEvents);
  const closedDeals = readArray<Record<string, unknown>>(result.closedDeals);
  const invariantAlerts = readArray<Partial<TickInvariantAlert>>(result.invariantAlerts);
  const day = readNumber(result.day);

  return freezeReceipt({
    receiptKind: 'daily_tick_receipt',
    source: 'domain-daily-tick-result',
    readOnly: true,
    day,
    nextDay: readNumber(result.nextDay, day + 1),
    emittedEventCount: emittedEvents.length,
    closedDealCount: closedDeals.length,
    processResultCount: processResults.length,
    invariantAlertCount: invariantAlerts.length,
    dirtyScopeCounts: readDirtyScopeCounts(result.dirtyScopes),
    processManagerCounts: countDailyProcessResultsByManager(processResults),
    processResults: processResults.map(buildReceiptProcessResult),
    settledDayProcessResults: processResultGroups.settledDayResults.map(buildReceiptProcessResult),
    nextDaySetupProcessResults: processResultGroups.nextDaySetupResults.map(buildReceiptProcessResult),
    emittedEventIds: emittedEvents.map((entry) => readString(entry.id)).filter(Boolean),
    closedDealIds: closedDeals.map((entry) => readString(entry.dealId)).filter(Boolean),
    processOpportunityIds: processResults.flatMap((entry) => copyIds(entry.opportunityIds)),
    processProductRunIds: processResults.flatMap((entry) => copyIds(entry.productRunIds)),
    maxInvariantLevel: maxInvariantLevel(invariantAlerts),
    semanticReceiptSummary: buildSemanticReceiptSummary(result),
  } satisfies DailyTickReceipt);
}

export function buildLastDailyTickReceiptFromState(state: Readonly<GameState>): DailyTickReceipt | null {
  if (!state.lastDailyTickResult) {
    return null;
  }

  return buildDailyTickReceipt(state.lastDailyTickResult);
}
