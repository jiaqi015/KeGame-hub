/**
 * WorldCausalLedger — append-only causal event store with indexed queries.
 *
 * The ledger is the single source of truth for causal events.
 * It provides:
 * - Append (append-only, never mutate)
 * - Query by kind, day, entity, cause chain
 * - Causal chain traversal (forward and backward)
 * - Filtering without mutation
 *
 * Mother model alignment:
 * - Section 13: Causal Transmission (deterministic skeleton)
 * - Section 19.10: Replayability — events are replayable facts
 *
 * Hard constraints:
 * - Pure in core — no domain/runtime imports
 * - Append-only, never mutate existing events
 * - All queries return frozen results
 * - No Date.now, no Math.random
 */

import type {
  WorldCausalEvent,
  WorldCausalEventKind,
} from './causalEvents.js';

// ---------------------------------------------------------------------------
// WorldCausalLedger: the main ledger type
// ---------------------------------------------------------------------------

export interface WorldCausalLedger {
  /** All events in insertion order. */
  readonly events: readonly WorldCausalEvent[];
  /** Events indexed by kind. */
  readonly byKind: ReadonlyMap<WorldCausalEventKind, readonly WorldCausalEvent[]>;
  /** Events indexed by day. */
  readonly byDay: ReadonlyMap<number, readonly WorldCausalEvent[]>;
  /** Events indexed by affected entity ID. */
  readonly byAffectedId: ReadonlyMap<string, readonly WorldCausalEvent[]>;
  /** Events indexed by their own ID (for fast cause-chain traversal). */
  readonly byId: ReadonlyMap<string, WorldCausalEvent>;
  /** Total event count. */
  readonly count: number;
}

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

/**
 * Build a ledger from a list of events.
 * Events should already be in causal order (earliest day first).
 */
export function buildCausalLedger(events: readonly WorldCausalEvent[]): WorldCausalLedger {
  const byKind = new Map<WorldCausalEventKind, WorldCausalEvent[]>();
  const byDay = new Map<number, WorldCausalEvent[]>();
  const byAffectedId = new Map<string, WorldCausalEvent[]>();
  const byId = new Map<string, WorldCausalEvent>();

  for (const event of events) {
    // Index by kind
    const kindArr = byKind.get(event.kind) ?? [];
    kindArr.push(event);
    byKind.set(event.kind, kindArr);

    // Index by day
    const dayArr = byDay.get(event.day) ?? [];
    dayArr.push(event);
    byDay.set(event.day, dayArr);

    // Index by affected IDs
    for (const affectedId of event.affectedIds) {
      const affectedArr = byAffectedId.get(affectedId) ?? [];
      affectedArr.push(event);
      byAffectedId.set(affectedId, affectedArr);
    }

    // Index by event ID
    byId.set(event.id, event);
  }

  return Object.freeze({
    events: Object.freeze([...events]),
    byKind: Object.freeze(byKind),
    byDay: Object.freeze(byDay),
    byAffectedId: Object.freeze(byAffectedId),
    byId: Object.freeze(byId),
    count: events.length,
  });
}

// ---------------------------------------------------------------------------
// Append: returns a NEW ledger with the event added (immutable)
// ---------------------------------------------------------------------------

export function appendToLedger(
  ledger: WorldCausalLedger,
  event: WorldCausalEvent,
): WorldCausalLedger {
  return buildCausalLedger([...ledger.events, event]);
}

// ---------------------------------------------------------------------------
// Append multiple
// ---------------------------------------------------------------------------

export function appendManyToLedger(
  ledger: WorldCausalLedger,
  events: readonly WorldCausalEvent[],
): WorldCausalLedger {
  return buildCausalLedger([...ledger.events, ...events]);
}

// ---------------------------------------------------------------------------
// Query helpers (all return frozen arrays)
// ---------------------------------------------------------------------------

export function getEventsByKind(
  ledger: WorldCausalLedger,
  kind: WorldCausalEventKind,
): readonly WorldCausalEvent[] {
  return ledger.byKind.get(kind) ?? [];
}

export function getEventsByDay(
  ledger: WorldCausalLedger,
  day: number,
): readonly WorldCausalEvent[] {
  return ledger.byDay.get(day) ?? [];
}

export function getEventsAffecting(
  ledger: WorldCausalLedger,
  entityId: string,
): readonly WorldCausalEvent[] {
  return ledger.byAffectedId.get(entityId) ?? [];
}

export function getEventById(
  ledger: WorldCausalLedger,
  eventId: string,
): WorldCausalEvent | undefined {
  return ledger.byId.get(eventId);
}

// ---------------------------------------------------------------------------
// Causal chain traversal
// ---------------------------------------------------------------------------

/**
 * Get all direct causes of an event.
 */
export function getDirectCauses(
  ledger: WorldCausalLedger,
  event: WorldCausalEvent,
): readonly WorldCausalEvent[] {
  return event.causeEventIds
    .map((id) => ledger.byId.get(id))
    .filter((e): e is WorldCausalEvent => e !== undefined);
}

/**
 * Get all direct effects of an event (events that list this event as a cause).
 */
export function getDirectEffects(
  ledger: WorldCausalLedger,
  eventId: string,
): readonly WorldCausalEvent[] {
  return ledger.events.filter((e) => e.causeEventIds.includes(eventId));
}

/**
 * Walk the full causal chain backward from an event.
 * Returns events in reverse causal order (most recent cause first).
 * Uses BFS to avoid cycles.
 */
export function traceCausalChainBackward(
  ledger: WorldCausalLedger,
  startEventId: string,
): readonly WorldCausalEvent[] {
  const visited = new Set<string>();
  const result: WorldCausalEvent[] = [];
  const queue: string[] = [startEventId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    const event = ledger.byId.get(currentId);
    if (!event) continue;

    // Don't include the start event itself in backward trace
    if (currentId !== startEventId) {
      result.push(event);
    }

    for (const causeId of event.causeEventIds) {
      if (!visited.has(causeId)) {
        queue.push(causeId);
      }
    }
  }

  return Object.freeze(result);
}

/**
 * Walk the full causal chain forward from an event.
 * Returns events in causal order (effects come after causes).
 * Uses BFS to avoid cycles.
 */
export function traceCausalChainForward(
  ledger: WorldCausalLedger,
  startEventId: string,
): readonly WorldCausalEvent[] {
  const visited = new Set<string>();
  const result: WorldCausalEvent[] = [];
  const queue: string[] = [startEventId];

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    if (visited.has(currentId)) continue;
    visited.add(currentId);

    if (currentId !== startEventId) {
      const event = ledger.byId.get(currentId);
      if (event) {
        result.push(event);
      }
    }

    // Find events that list currentId as a cause
    for (const event of ledger.events) {
      if (event.causeEventIds.includes(currentId) && !visited.has(event.id)) {
        queue.push(event.id);
      }
    }
  }

  return Object.freeze(result);
}

// ---------------------------------------------------------------------------
// Filtering (returns new ledger without mutating)
// ---------------------------------------------------------------------------

export function filterLedgerByDayRange(
  ledger: WorldCausalLedger,
  fromDay: number,
  toDay: number,
): WorldCausalLedger {
  return buildCausalLedger(
    ledger.events.filter((e) => e.day >= fromDay && e.day <= toDay),
  );
}

export function filterLedgerByKind(
  ledger: WorldCausalLedger,
  ...kinds: readonly WorldCausalEventKind[]
): WorldCausalLedger {
  const kindSet = new Set(kinds);
  return buildCausalLedger(
    ledger.events.filter((e) => kindSet.has(e.kind)),
  );
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Check that all causeEventIds in the ledger point to events that actually exist.
 * Returns IDs that are referenced but not found.
 */
export function findDanglingCauseRefs(ledger: WorldCausalLedger): readonly string[] {
  const dangling: string[] = [];
  for (const event of ledger.events) {
    for (const causeId of event.causeEventIds) {
      if (!ledger.byId.has(causeId)) {
        dangling.push(causeId);
      }
    }
  }
  return Object.freeze(dangling);
}

/**
 * Validate that the causal chain for a specific event is fully connected.
 * Returns empty array if valid, or the missing event IDs.
 */
export function validateCausalChain(
  ledger: WorldCausalLedger,
  eventId: string,
): readonly string[] {
  const chain = traceCausalChainBackward(ledger, eventId);
  const allIds = new Set(ledger.events.map((e) => e.id));
  const missing: string[] = [];
  for (const event of chain) {
    for (const causeId of event.causeEventIds) {
      if (!allIds.has(causeId)) {
        missing.push(causeId);
      }
    }
  }
  return Object.freeze([...new Set(missing)]);
}

/**
 * Get a human-readable causal chain summary for debugging.
 */
export function summarizeCausalChain(
  ledger: WorldCausalLedger,
  eventId: string,
): readonly string[] {
  const backwardChain = traceCausalChainBackward(ledger, eventId);
  const startEvent = ledger.byId.get(eventId);
  if (!startEvent) return Object.freeze([]);

  const lines: string[] = [];
  // Root causes first
  for (const event of [...backwardChain].reverse()) {
    lines.push(`  [${event.day}] ${event.kind} (${event.id}) confidence=${event.confidence}`);
  }
  lines.push(`-> [${startEvent.day}] ${startEvent.kind} (${startEvent.id}) confidence=${startEvent.confidence}`);

  const forwardChain = traceCausalChainForward(ledger, eventId);
  for (const event of forwardChain) {
    lines.push(`  -> [${event.day}] ${event.kind} (${event.id}) confidence=${event.confidence}`);
  }

  return Object.freeze(lines);
}
