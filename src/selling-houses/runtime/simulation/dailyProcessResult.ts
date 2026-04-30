export const DAILY_PROCESS_MANAGER_IDS = [
  'negotiation-process-manager',
  'product-run-process-manager',
] as const;

export type DailyProcessManagerId = typeof DAILY_PROCESS_MANAGER_IDS[number];
export type DailyProcessResultOwner = 'runtime-process-manager' | 'runtime-process-manager-facade';
export type DailyProcessResultOutcomeOwner = 'legacy-deal-closing-engine';

type DailyProcessResultOwnershipRule = Readonly<{
  owner: DailyProcessResultOwner;
  outcomeOwner?: DailyProcessResultOutcomeOwner;
  phase: DailyProcessResultReadModel['phase'];
}>;

const DAILY_PROCESS_RESULT_OWNERSHIP_BY_MANAGER: Readonly<Record<DailyProcessManagerId, DailyProcessResultOwnershipRule>> = {
  'negotiation-process-manager': {
    owner: 'runtime-process-manager-facade',
    outcomeOwner: 'legacy-deal-closing-engine',
    phase: 'settled-day',
  },
  'product-run-process-manager': {
    owner: 'runtime-process-manager',
    phase: 'next-day-setup',
  },
};

export interface DailyProcessResultReadModel {
  readonly managerId: DailyProcessManagerId;
  readonly owner: DailyProcessResultOwner;
  readonly outcomeOwner?: DailyProcessResultOutcomeOwner;
  readonly day: number;
  readonly phase: 'settled-day' | 'next-day-setup';
  readonly processedCount: number;
  readonly resolvedCount: number;
  readonly emittedEventIds: readonly string[];
  readonly closedDealIds: readonly string[];
  readonly opportunityIds: readonly string[];
  readonly productRunIds: readonly string[];
}

export type DailyProcessManagerCounts = Readonly<Record<DailyProcessManagerId, number>>;

export interface DailyProcessResultGroups {
  readonly settledDayResults: readonly DailyProcessResultReadModel[];
  readonly nextDaySetupResults: readonly DailyProcessResultReadModel[];
}

export function isDailyProcessManagerId(value: unknown): value is DailyProcessManagerId {
  return DAILY_PROCESS_MANAGER_IDS.includes(value as DailyProcessManagerId);
}

function isDailyProcessResultOwner(value: unknown): value is DailyProcessResultOwner {
  return value === 'runtime-process-manager' || value === 'runtime-process-manager-facade';
}

function readNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function readOptionalNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function readProcessResultPhase(
  value: unknown,
  fallback: DailyProcessResultReadModel['phase'],
): DailyProcessResultReadModel['phase'] | null {
  if (value === undefined || value === null) {
    return fallback;
  }

  return value === 'next-day-setup' || value === 'settled-day' ? value : null;
}

function readStringArray(value: unknown): readonly string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

export function hasValidDailyProcessResultOwnership(
  managerId: DailyProcessManagerId,
  owner: DailyProcessResultOwner,
  outcomeOwner: unknown,
  phase?: DailyProcessResultReadModel['phase'],
): boolean {
  const rule = DAILY_PROCESS_RESULT_OWNERSHIP_BY_MANAGER[managerId];
  return owner === rule.owner
    && outcomeOwner === rule.outcomeOwner
    && (phase === undefined || phase === rule.phase);
}

export function emptyDailyProcessManagerCounts(): Record<DailyProcessManagerId, number> {
  return {
    'negotiation-process-manager': 0,
    'product-run-process-manager': 0,
  };
}

export function normalizeDailyProcessResultReadModel(
  entry: unknown,
  options: {
    readonly fallbackDay?: number;
    readonly expectedDay?: number;
    readonly fallbackPhase?: DailyProcessResultReadModel['phase'];
  } = {},
): DailyProcessResultReadModel | null {
  if (!entry || typeof entry !== 'object') {
    return null;
  }

  const payload = entry as Record<string, unknown>;
  const { managerId, owner } = payload;
  if (!isDailyProcessManagerId(managerId) || !isDailyProcessResultOwner(owner)) {
    return null;
  }
  const rule = DAILY_PROCESS_RESULT_OWNERSHIP_BY_MANAGER[managerId];
  const phase = readProcessResultPhase(payload.phase, options.fallbackPhase || rule.phase);
  if (!phase || !hasValidDailyProcessResultOwnership(managerId, owner, payload.outcomeOwner, phase)) {
    return null;
  }

  const hasExplicitDay = payload.day !== undefined && payload.day !== null;
  const explicitDay = hasExplicitDay ? readOptionalNumber(payload.day) : null;
  if (hasExplicitDay && explicitDay === null) {
    return null;
  }
  const day = explicitDay ?? options.expectedDay ?? options.fallbackDay ?? 0;
  if (options.expectedDay !== undefined && day !== options.expectedDay) {
    return null;
  }

  return {
    managerId,
    owner,
    outcomeOwner: payload.outcomeOwner === 'legacy-deal-closing-engine'
      ? payload.outcomeOwner
      : undefined,
    day,
    phase,
    processedCount: readNumber(payload.processedCount),
    resolvedCount: readNumber(payload.resolvedCount),
    emittedEventIds: readStringArray(payload.emittedEventIds),
    closedDealIds: readStringArray(payload.closedDealIds),
    opportunityIds: readStringArray(payload.opportunityIds),
    productRunIds: readStringArray(payload.productRunIds),
  };
}

export function readDailyProcessResultReadModels(
  source: { readonly processResults?: unknown; readonly day?: unknown; readonly nextDay?: unknown },
): readonly DailyProcessResultReadModel[] {
  if (!Array.isArray(source.processResults)) {
    return [];
  }

  const settledDay = readOptionalNumber(source.day);
  const nextDay = readOptionalNumber(source.nextDay);

  return source.processResults
    .map((entry) => {
      const payload = entry && typeof entry === 'object'
        ? (entry as { readonly managerId?: unknown; readonly day?: unknown })
        : undefined;
      const managerId = payload?.managerId;
      const hasExplicitDay = payload?.day !== undefined && payload.day !== null;
      if (
        (managerId === 'product-run-process-manager' && nextDay === null && !hasExplicitDay)
        || (managerId === 'negotiation-process-manager' && settledDay === null && !hasExplicitDay)
      ) {
        return null;
      }
      const expectedDay = managerId === 'product-run-process-manager'
        ? nextDay
        : managerId === 'negotiation-process-manager'
          ? settledDay
          : undefined;
      const fallbackDay = expectedDay ?? settledDay ?? 0;
      const fallbackPhase = managerId === 'product-run-process-manager'
        ? 'next-day-setup'
        : 'settled-day';

      return normalizeDailyProcessResultReadModel(entry, {
        expectedDay: expectedDay ?? undefined,
        fallbackDay,
        fallbackPhase,
      });
    })
    .filter((entry): entry is DailyProcessResultReadModel => Boolean(entry));
}

export function countDailyProcessResultsByManager(
  processResults: readonly DailyProcessResultReadModel[],
): DailyProcessManagerCounts {
  const counts = emptyDailyProcessManagerCounts();
  processResults.forEach((result) => {
    counts[result.managerId] += 1;
  });
  return counts;
}

export function groupDailyProcessResultsByPhase(
  processResults: readonly DailyProcessResultReadModel[],
): DailyProcessResultGroups {
  return {
    settledDayResults: processResults.filter((entry) => entry.phase === 'settled-day'),
    nextDaySetupResults: processResults.filter((entry) => entry.phase === 'next-day-setup'),
  };
}
