/**
 * AttentionLedger v0 — pure read model builder.
 *
 * Builds an AttentionLedger from attention events.
 * The ledger is indexed by actor, target, and actor+target for fast lookup.
 *
 * This is a READ-ONLY projection. It does NOT mutate GameState.
 */

import type {
  AttentionEvent,
  AttentionLedger,
} from './types.js';

// ---------------------------------------------------------------------------
// Build ledger from events
// ---------------------------------------------------------------------------

export function buildAttentionLedger(events: readonly AttentionEvent[]): AttentionLedger {
  const byActor = new Map<string, AttentionEvent[]>();
  const byTarget = new Map<string, AttentionEvent[]>();
  const byActorTarget = new Map<string, AttentionEvent[]>();

  for (const event of events) {
    // Index by actor
    const actorKey = `${event.actorKind}::${event.actorId}`;
    const actorArr = byActor.get(actorKey) ?? [];
    actorArr.push(event);
    byActor.set(actorKey, actorArr);

    // Index by target
    const targetKey = `${event.targetKind}::${event.targetId}`;
    const targetArr = byTarget.get(targetKey) ?? [];
    targetArr.push(event);
    byTarget.set(targetKey, targetArr);

    // Index by actor+target
    const actorTargetKey = `${actorKey}::${targetKey}`;
    const actorTargetArr = byActorTarget.get(actorTargetKey) ?? [];
    actorTargetArr.push(event);
    byActorTarget.set(actorTargetKey, actorTargetArr);
  }

  return Object.freeze({
    events: Object.freeze([...events]),
    byActor: Object.freeze(byActor),
    byTarget: Object.freeze(byTarget),
    byActorTarget: Object.freeze(byActorTarget),
  });
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export function getEventsByActor(
  ledger: AttentionLedger,
  actorKind: string,
  actorId: string,
): readonly AttentionEvent[] {
  return ledger.byActor.get(`${actorKind}::${actorId}`) ?? [];
}

export function getEventsByTarget(
  ledger: AttentionLedger,
  targetKind: string,
  targetId: string,
): readonly AttentionEvent[] {
  return ledger.byTarget.get(`${targetKind}::${targetId}`) ?? [];
}

export function getEventsByActorTarget(
  ledger: AttentionLedger,
  actorKind: string,
  actorId: string,
  targetKind: string,
  targetId: string,
): readonly AttentionEvent[] {
  return ledger.byActorTarget.get(`${actorKind}::${actorId}::${targetKind}::${targetId}`) ?? [];
}
