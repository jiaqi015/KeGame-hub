// ---------------------------------------------------------------------------
// InformationSourceRegistry — append-only, indexable, replayable source store
//
// Architecture position:
//   InformationSourceRecord → Registry (append-only)
//     → queryVisibleSourceRecords(actorId, role, day) → actor POV subset
//     → runtime reads hidden records via queryHiddenSourceRecords()
//
// Hard constraints:
//   - Pure functions: appendSourceRecord returns new registry, never mutates
//   - Same records order → same registry JSON (deterministic)
//   - Duplicate replayKey rejected (returns { ok: false })
//   - no_one scope invisible to actor queries; only accessible via queryHiddenSourceRecords
//   - No Case / Opportunity mutation methods
//   - No wall-clock reads, non-seeded RNG, or network calls
//   - Not a mutable global singleton
// ---------------------------------------------------------------------------

import type {
  InformationSourceRecord,
  SourceKind,
  SourceRecordIndex,
  VisibilityScope,
  ActorRole,
} from './informationSourceTypes.js';

// ════════════════════════════════════════════════════════════════════════════
// InformationSourceRegistry — the immutable, append-only store
// ════════════════════════════════════════════════════════════════════════════

/**
 * The InformationSourceRegistry is an immutable, append-only store of
 * InformationSourceRecords with fast lookup indexes.
 *
 * Each appendSourceRecord call returns a NEW registry (structural sharing
 * of underlying arrays where possible for performance).
 *
 * Usage:
 *   let registry = createEmptyRegistry();
 *   const result = appendSourceRecord(registry, record);
 *   if (result.ok) { registry = result.registry; }
 *   const visible = queryVisibleSourceRecords(registry, 'player-broker', 'player_broker', 5);
 */
export interface InformationSourceRegistry {
  /** Immutable index for fast queries. */
  readonly index: SourceRecordIndex;
}

// ════════════════════════════════════════════════════════════════════════════
// Append result — either success or duplicate rejection
// ════════════════════════════════════════════════════════════════════════════

export interface AppendSuccess {
  readonly ok: true;
  /** The new registry with the record appended. */
  readonly registry: InformationSourceRegistry;
}

export interface AppendDuplicate {
  readonly ok: false;
  /** The reason: duplicate replayKey. */
  readonly reason: 'duplicate_replay_key';
  /** The existing record that conflicts. */
  readonly existing: InformationSourceRecord;
}

export type AppendResult = AppendSuccess | AppendDuplicate;

// ════════════════════════════════════════════════════════════════════════════
// createEmptyRegistry — factory
// ════════════════════════════════════════════════════════════════════════════

/**
 * Create an empty registry with no records.
 */
export function createEmptyRegistry(): InformationSourceRegistry {
  return {
    index: {
      all: [],
      byKind: new Map(),
      byDay: new Map(),
      byEntityId: new Map(),
      byActorId: new Map(),
      byReplayKey: new Map(),
      count: 0,
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// appendSourceRecord — pure function, returns new registry
// ════════════════════════════════════════════════════════════════════════════

/**
 * Append a source record to the registry.
 * Returns a NEW registry if successful, or rejects if replayKey is duplicate.
 *
 * This is a pure function: the old registry is never mutated.
 */
export function appendSourceRecord(
  registry: InformationSourceRegistry,
  record: InformationSourceRecord,
): AppendResult {
  const oldIndex = registry.index;

  // --- Duplicate replayKey check ---
  if (oldIndex.byReplayKey.has(record.replayKey)) {
    return {
      ok: false,
      reason: 'duplicate_replay_key',
      existing: oldIndex.byReplayKey.get(record.replayKey)!,
    };
  }

  // --- Build new all array ---
  const newAll = [...oldIndex.all, record];

  // --- Build new byKind ---
  const newByKind = new Map(oldIndex.byKind);
  const kindArr = newByKind.get(record.sourceKind) ?? [];
  newByKind.set(record.sourceKind, [...kindArr, record]);

  // --- Build new byDay ---
  const newByDay = new Map(oldIndex.byDay);
  const dayArr = newByDay.get(record.day) ?? [];
  newByDay.set(record.day, [...dayArr, record]);

  // --- Build new byEntityId ---
  const newByEntityId = new Map(oldIndex.byEntityId);
  for (const ref of record.entityRefs) {
    const arr = newByEntityId.get(ref.id) ?? [];
    newByEntityId.set(ref.id, [...arr, record]);
  }

  // --- Build new byActorId ---
  const newByActorId = new Map(oldIndex.byActorId);
  for (const ref of record.actorRefs) {
    const arr = newByActorId.get(ref.id) ?? [];
    newByActorId.set(ref.id, [...arr, record]);
  }

  // --- Build new byReplayKey ---
  const newByReplayKey = new Map(oldIndex.byReplayKey);
  newByReplayKey.set(record.replayKey, record);

  return {
    ok: true,
    registry: {
      index: {
        all: newAll,
        byKind: newByKind,
        byDay: newByDay,
        byEntityId: newByEntityId,
        byActorId: newByActorId,
        byReplayKey: newByReplayKey,
        count: oldIndex.count + 1,
      },
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// appendSourceRecords — batch append
// ════════════════════════════════════════════════════════════════════════════

export interface BatchAppendResult {
  readonly ok: boolean;
  readonly registry: InformationSourceRegistry;
  /** Records that were rejected (duplicates). */
  readonly rejected: readonly AppendDuplicate[];
  /** Number of records successfully appended. */
  readonly appendedCount: number;
}

/**
 * Append multiple records in order. Stops at first duplicate.
 * Returns the registry with all successful appends, plus rejection list.
 */
export function appendSourceRecords(
  registry: InformationSourceRegistry,
  records: readonly InformationSourceRecord[],
): BatchAppendResult {
  let current = registry;
  const rejected: AppendDuplicate[] = [];
  let appendedCount = 0;

  for (const record of records) {
    const result = appendSourceRecord(current, record);
    if (result.ok) {
      current = result.registry;
      appendedCount += 1;
    } else {
      rejected.push(result as AppendDuplicate);
    }
  }

  return {
    ok: rejected.length === 0,
    registry: current,
    rejected,
    appendedCount,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// Visibility evaluation
// ════════════════════════════════════════════════════════════════════════════

/**
 * Evaluate whether an actor can see a record at a given day.
 *
 * Visibility rules:
 *   'no_one'           → never visible to any actor
 *   'all_actors'       → visible if day >= record.day + delayDays
 *   'player_only'      → visible only if actorRole === 'player_broker'
 *   'owner_only'       → visible only if actorRole === 'owner'
 *   'broker_chain'     → visible if actorRole === 'player_broker' || 'rival_broker'
 *   'specific_actors'  → visible if actorId is in visibility.actorIds
 *
 * Additionally, the record must have occurred on or before the query day.
 */
export function isRecordVisibleToActor(
  record: InformationSourceRecord,
  actorId: string,
  actorRole: ActorRole,
  queryDay: number,
): boolean {
  const vis = record.visibility;

  // Gate 1: record must have occurred before or on query day
  if (record.day > queryDay) {
    return false;
  }

  // Gate 2: delay — record becomes visible only after delayDays
  if (queryDay < record.day + vis.baseDelayDays) {
    return false;
  }

  // Gate 3: scope
  switch (vis.scope) {
    case 'no_one':
      return false;

    case 'all_actors':
      return true;

    case 'player_only':
      return actorRole === 'player_broker';

    case 'owner_only':
      return actorRole === 'owner';

    case 'broker_chain':
      return actorRole === 'player_broker' || actorRole === 'rival_broker' || actorRole === 'manager';

    case 'specific_actors':
      return (vis.actorIds ?? []).includes(actorId);

    default:
      return false;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// queryVisibleSourceRecords — actor POV projection
// ════════════════════════════════════════════════════════════════════════════

/**
 * Query all records visible to a specific actor at a specific day.
 *
 * This is the primary method for building actor POV projections.
 * Records with scope 'no_one' are excluded.
 *
 * Results are returned in insertion order (day, then insertion order within day).
 */
export function queryVisibleSourceRecords(
  registry: InformationSourceRegistry,
  actorId: string,
  actorRole: ActorRole,
  queryDay: number,
): readonly InformationSourceRecord[] {
  const results: InformationSourceRecord[] = [];

  for (const record of registry.index.all) {
    // Fast skip: if record day > queryDay, all subsequent records are also > queryDay
    // (records are in insertion order, which is day-sorted within each day)
    if (record.day > queryDay) {
      break;
    }

    if (isRecordVisibleToActor(record, actorId, actorRole, queryDay)) {
      results.push(record);
    }
  }

  return results;
}

// ════════════════════════════════════════════════════════════════════════════
// queryHiddenSourceRecords — runtime-internal only
// ════════════════════════════════════════════════════════════════════════════

/**
 * Query records with scope 'no_one' — hidden truth, not for actor POV.
 *
 * This method exists for runtime internals that need to read hidden world state
 * (e.g., ecosystem tick generating competition pressure). It must NOT be called
 * from projection / UI code.
 */
export function queryHiddenSourceRecords(
  registry: InformationSourceRegistry,
): readonly InformationSourceRecord[] {
  const results: InformationSourceRecord[] = [];

  for (const record of registry.index.all) {
    if (record.visibility.scope === 'no_one') {
      results.push(record);
    }
  }

  return results;
}

// ════════════════════════════════════════════════════════════════════════════
// Convenience query helpers
// ════════════════════════════════════════════════════════════════════════════

/**
 * Query records by kind.
 */
export function queryByKind(
  registry: InformationSourceRegistry,
  kind: SourceKind,
): readonly InformationSourceRecord[] {
  return registry.index.byKind.get(kind) ?? [];
}

/**
 * Query records by day.
 */
export function queryByDay(
  registry: InformationSourceRegistry,
  day: number,
): readonly InformationSourceRecord[] {
  return registry.index.byDay.get(day) ?? [];
}

/**
 * Query records by entity ID.
 */
export function queryByEntityId(
  registry: InformationSourceRegistry,
  entityId: string,
): readonly InformationSourceRecord[] {
  return registry.index.byEntityId.get(entityId) ?? [];
}

/**
 * Query records by actor ID.
 */
export function queryByActorId(
  registry: InformationSourceRegistry,
  actorId: string,
): readonly InformationSourceRecord[] {
  return registry.index.byActorId.get(actorId) ?? [];
}

/**
 * Query a single record by replayKey.
 */
export function queryByReplayKey(
  registry: InformationSourceRegistry,
  replayKey: string,
): InformationSourceRecord | undefined {
  return registry.index.byReplayKey.get(replayKey);
}

// ════════════════════════════════════════════════════════════════════════════
// Registry stats — for verification and debugging
// ════════════════════════════════════════════════════════════════════════════

export interface RegistryStats {
  readonly totalCount: number;
  readonly kindCounts: Readonly<Record<SourceKind, number>>;
  readonly dayRange: { readonly min: number; readonly max: number } | null;
  readonly uniqueEntityIds: number;
  readonly uniqueActorIds: number;
  readonly uniqueReplayKeys: number;
}

/**
 * Compute stats about a registry. Useful for verification.
 */
export function getRegistryStats(registry: InformationSourceRegistry): RegistryStats {
  const idx = registry.index;
  const kindCounts: Record<string, number> = {};
  Array.from(idx.byKind.entries()).forEach(([kind, arr]) => {
    kindCounts[kind] = arr.length;
  });

  const dayKeys = Array.from(idx.byDay.keys());
  let dayMin = Infinity;
  let dayMax = -Infinity;
  dayKeys.forEach((day) => {
    if (day < dayMin) dayMin = day;
    if (day > dayMax) dayMax = day;
  });

  return {
    totalCount: idx.count,
    kindCounts: kindCounts as Record<SourceKind, number>,
    dayRange: idx.count > 0 ? { min: dayMin, max: dayMax } : null,
    uniqueEntityIds: idx.byEntityId.size,
    uniqueActorIds: idx.byActorId.size,
    uniqueReplayKeys: idx.byReplayKey.size,
  };
}
