import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import type { DomainEventEntry, GameState } from '../src/selling-houses/domain/models.js';

const projectionModulePath = '../src/selling-houses/interface/interaction-workspace/eventStreamBoundary.js';
const projectionSourcePath = 'src/selling-houses/interface/interaction-workspace/eventStreamBoundary.ts';

function stableSnapshot(value: unknown) {
  return JSON.stringify(value);
}

function makeEvents(): DomainEventEntry[] {
  return [
    {
      id: 'event-newest',
      day: 10,
      date: '2026-04-10',
      kind: 'journal',
      actor: 'broker',
      title: 'Newest visible event',
      detail: 'newest event detail',
      tone: 'accent',
      caseId: 'case-1',
      opportunityId: 'opp-1',
      customerId: 'customer-1',
      payload: {
        impactScore: 4,
      },
    },
    {
      id: 'event-oldest',
      day: 9,
      date: '2026-04-09',
      kind: 'market_event',
      actor: 'market',
      title: 'Oldest market event',
      detail: 'oldest event detail',
      tone: 'danger',
      caseId: 'case-2',
      opportunityId: 'opp-2',
      customerId: 'customer-2',
      payload: {
        risk: 'price-cut',
      },
    },
  ];
}

if (!existsSync(projectionSourcePath)) {
  console.log(
    'selling-houses workspace event stream contract skipped: event stream workspace projection is not present yet',
  );
  process.exit(0);
}

const { buildEventStreamWorkspaceProjection } = await import(projectionModulePath);
assert.equal(
  typeof buildEventStreamWorkspaceProjection,
  'function',
  'Expected buildEventStreamWorkspaceProjection to be exported',
);

const state = {
  day: 10,
  eventStore: makeEvents(),
} as unknown as GameState;

const beforeProjection = stableSnapshot(state);
const projection = buildEventStreamWorkspaceProjection(state, { recentLimit: 1 });
assert.equal(
  stableSnapshot(state),
  beforeProjection,
  'Expected event stream workspace projection not to mutate GameState',
);

assert.equal(projection.projectionKind, 'event_stream_adapter_state');
assert.equal(projection.source, 'runtime-event-stream-receipt');
assert.equal(projection.readOnly, true);
assert.equal(projection.day, 10);
assert.ok(projection.receipt, 'Expected projection receipt to be present for a GameState eventStore');
assert.notEqual(
  projection.receipt,
  state.eventStore,
  'Expected projection receipt to be a read-only adapter DTO instead of raw state',
);
assert.equal(projection.receipt.receiptKind, 'event_stream_receipt');
assert.equal(projection.receipt.eventCount, 2);
assert.equal(projection.receipt.recentLimit, 1);
assert.deepEqual(
  projection.receipt.recentEvents.map((entry: { id: string }) => entry.id),
  ['event-newest'],
  'Expected projected event stream receipt to honor recentLimit',
);

assert.ok(Object.isFrozen(projection), 'Expected event stream workspace projection to be frozen');
assert.ok(Object.isFrozen(projection.receipt), 'Expected projected event stream receipt to be frozen');
assert.ok(Object.isFrozen(projection.receipt.recentEvents), 'Expected projected event list to be frozen');
assert.ok(Object.isFrozen(projection.receipt.recentEvents[0]), 'Expected projected recent events to be frozen');

assert.throws(
  () => {
    (projection.receipt as { recentEvents: { title: string }[] }).recentEvents[0]!.title = 'mutated';
  },
  TypeError,
  'Expected projected event stream receipt mutation to be blocked by freeze',
);
assert.equal(
  stableSnapshot(state),
  beforeProjection,
  'Expected failed projection mutation probe not to write back to GameState',
);

console.log('selling-houses workspace event stream contract verification passed');
