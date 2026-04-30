import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';

import type { DailyTickResult, DomainEventEntry, GameState } from '../src/selling-houses/domain/models.js';

const receiptModulePath = '../src/selling-houses/runtime/simulation/eventStreamReceipt.js';
const receiptSourcePath = 'src/selling-houses/runtime/simulation/eventStreamReceipt.ts';

function stableSnapshot(value: unknown) {
  return JSON.stringify(value);
}

function assertReadonlyEventStreamReceiptTypes(receiptForTypes: {
  readonly byKind: Readonly<Record<string, number>>;
  readonly byTone: Readonly<Record<string, number>>;
  readonly referencedCaseIds: readonly string[];
  readonly recentEvents: readonly {
    readonly title: string;
    readonly payloadKeys: readonly string[];
  }[];
}) {
  if (false) {
    // @ts-expect-error receipt count objects are readonly DTOs.
    receiptForTypes.byKind.journal = 99;
    // @ts-expect-error receipt count objects are readonly DTOs.
    receiptForTypes.byTone.accent = 99;
    // @ts-expect-error receipt arrays are readonly DTOs.
    receiptForTypes.referencedCaseIds.push('mutated');

    const event = receiptForTypes.recentEvents[0];
    if (event) {
      // @ts-expect-error recent event DTOs are readonly.
      event.title = 'mutated';
      // @ts-expect-error payload key arrays are readonly DTOs.
      event.payloadKeys.push('mutated');
    }
  }
}

function makeEvents(): DomainEventEntry[] {
  return [
    {
      id: 'event-newest',
      day: 8,
      date: '2026-04-08',
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
        nested: {
          hidden: true,
        },
      },
    },
    {
      id: 'event-middle',
      day: 7,
      date: '2026-04-07',
      kind: 'market_event',
      actor: 'market',
      title: 'Middle market event',
      detail: 'middle event detail',
      tone: 'danger',
      caseId: 'case-1',
      opportunityId: 'opp-2',
      customerId: 'customer-1',
      payload: {
        risk: 'price-cut',
      },
    },
    {
      id: 'event-oldest',
      day: 6,
      date: '2026-04-06',
      kind: 'journal',
      actor: 'owner',
      title: 'Oldest owner event',
      detail: 'oldest event detail',
      tone: 'success',
      caseId: 'case-2',
      opportunityId: 'opp-1',
      customerId: 'customer-2',
      payload: {
        ownerMood: 'steady',
      },
    },
  ];
}

function makeDailyTickResult(events: DomainEventEntry[]): DailyTickResult {
  return {
    day: 8,
    nextDay: 9,
    report: null,
    emittedEvents: events,
    closedDeals: [],
    processResults: [],
    dirtyScopes: {
      cases: [],
      opportunities: [],
      customers: [],
      owners: [],
      districts: [],
      marketCells: [],
      matters: [],
      market: false,
      dashboard: false,
      result: false,
    },
    invariantAlerts: [],
  } as unknown as DailyTickResult;
}

if (!existsSync(receiptSourcePath)) {
  console.log('selling-houses event stream receipt contract skipped: receipt runtime adapter is not present yet');
  process.exit(0);
}

const {
  buildDailyTickEventStreamReceipt,
  buildEventStreamReceipt,
  buildEventStreamReceiptFromState,
} = await import(receiptModulePath);
assert.equal(typeof buildEventStreamReceipt, 'function', 'Expected buildEventStreamReceipt to be exported');
assert.equal(
  typeof buildEventStreamReceiptFromState,
  'function',
  'Expected buildEventStreamReceiptFromState to be exported',
);
assert.equal(
  typeof buildDailyTickEventStreamReceipt,
  'function',
  'Expected buildDailyTickEventStreamReceipt to be exported',
);

const events = makeEvents();
const beforeReceipt = stableSnapshot(events);
const receipt = buildEventStreamReceipt(events, {
  day: 8,
  source: 'domain-event-store',
  recentLimit: 2,
});
assert.equal(stableSnapshot(events), beforeReceipt, 'Expected event stream receipt builder not to mutate events');
assertReadonlyEventStreamReceiptTypes(receipt);

assert.equal(receipt.receiptKind, 'event_stream_receipt');
assert.equal(receipt.source, 'domain-event-store');
assert.equal(receipt.readOnly, true);
assert.equal(receipt.day, 8);
assert.equal(receipt.recentLimit, 2);
assert.equal(receipt.eventCount, 3);
assert.equal(receipt.newestEventId, 'event-newest');
assert.equal(receipt.oldestEventId, 'event-oldest');
assert.deepEqual(receipt.byKind, {
  journal: 2,
  market_event: 1,
});
assert.deepEqual(receipt.byTone, {
  accent: 1,
  danger: 1,
  success: 1,
});
assert.deepEqual(receipt.referencedCaseIds, ['case-1', 'case-2']);
assert.deepEqual(receipt.referencedOpportunityIds, ['opp-1', 'opp-2']);
assert.deepEqual(receipt.referencedCustomerIds, ['customer-1', 'customer-2']);

assert.equal(receipt.recentEvents.length, 2, 'Expected recentEvents to honor recentLimit');
assert.deepEqual(
  receipt.recentEvents.map((entry: { id: string }) => entry.id),
  ['event-newest', 'event-middle'],
  'Expected recentEvents to preserve input ordering',
);
assert.notEqual(
  receipt.recentEvents[0],
  events[0],
  'Expected recent event DTO to be copied instead of aliasing the original event',
);
assert.equal(
  Object.hasOwn(receipt.recentEvents[0], 'payload'),
  false,
  'Expected recent event DTO not to expose payload',
);
assert.deepEqual(
  receipt.recentEvents[0].payloadKeys,
  ['impactScore', 'nested'],
  'Expected recent event DTO to expose payloadKeys instead of payload',
);

assert.ok(Object.isFrozen(receipt), 'Expected event stream receipt to be frozen');
assert.ok(Object.isFrozen(receipt.byKind), 'Expected event stream byKind counts to be frozen');
assert.ok(Object.isFrozen(receipt.byTone), 'Expected event stream byTone counts to be frozen');
assert.ok(Object.isFrozen(receipt.referencedCaseIds), 'Expected referenced case ids to be frozen');
assert.ok(Object.isFrozen(receipt.referencedOpportunityIds), 'Expected referenced opportunity ids to be frozen');
assert.ok(Object.isFrozen(receipt.referencedCustomerIds), 'Expected referenced customer ids to be frozen');
assert.ok(Object.isFrozen(receipt.recentEvents), 'Expected recentEvents to be frozen');
assert.ok(Object.isFrozen(receipt.recentEvents[0]), 'Expected recent event DTOs to be frozen');
assert.ok(Object.isFrozen(receipt.recentEvents[0]?.payloadKeys), 'Expected payloadKeys to be frozen');

assert.throws(
  () => {
    (receipt.byKind as { journal: number }).journal = 99;
  },
  TypeError,
  'Expected byKind mutation to be blocked by freeze',
);
assert.throws(
  () => {
    (receipt.recentEvents[0] as { payloadKeys: string[] }).payloadKeys.push('mutated');
  },
  TypeError,
  'Expected payloadKeys mutation to be blocked by freeze',
);
assert.equal(
  stableSnapshot(events),
  beforeReceipt,
  'Expected failed receipt mutation probes not to write back to source events',
);

events[0]?.payload && ((events[0].payload as Record<string, unknown>).addedAfterReceipt = true);
events.push({
  ...events[0],
  id: 'event-added-after-receipt',
} as DomainEventEntry);
assert.equal(receipt.eventCount, 3, 'Expected eventCount to stay stable after source event mutation');
assert.equal(
  receipt.recentEvents[0]?.payloadKeys.includes('addedAfterReceipt'),
  false,
  'Expected payloadKeys to stay stable after source payload mutation',
);

const state = {
  day: 8,
  eventStore: makeEvents(),
} as unknown as GameState;
const stateReceipt = buildEventStreamReceiptFromState(state, { recentLimit: 2 });
assert.equal(stateReceipt.receiptKind, 'event_stream_receipt');
assert.equal(stateReceipt.source, 'domain-event-store');
assert.equal(stateReceipt.day, 8);
assert.equal(stateReceipt.eventCount, 3);
assert.equal(stateReceipt.newestEventId, 'event-newest');
assert.equal(stateReceipt.oldestEventId, 'event-oldest');

const dailyTickReceipt = buildDailyTickEventStreamReceipt(makeDailyTickResult(makeEvents()), {
  recentLimit: 1,
});
assert.equal(dailyTickReceipt.receiptKind, 'event_stream_receipt');
assert.equal(dailyTickReceipt.source, 'daily-tick-emitted-events');
assert.equal(dailyTickReceipt.day, 8);
assert.equal(dailyTickReceipt.recentLimit, 1);
assert.equal(dailyTickReceipt.eventCount, 3);
assert.deepEqual(
  dailyTickReceipt.recentEvents.map((entry: { id: string }) => entry.id),
  ['event-newest'],
  'Expected daily tick event stream receipt to honor recentLimit',
);

console.log('selling-houses event stream receipt contract verification passed');
