import type { DailyTickResult, DomainEventEntry, DomainEventKind, GameState, Tone } from '../../domain/models.js';

type Primitive = string | number | boolean | bigint | symbol | null | undefined;

type ReadonlyDeep<T> =
  T extends Primitive ? T
    : T extends (...args: any[]) => unknown ? T
      : T extends readonly (infer Item)[] ? readonly ReadonlyDeep<Item>[]
        : T extends object ? { readonly [Key in keyof T]: ReadonlyDeep<T[Key]> }
          : T;

export type EventStreamReceiptSource = 'domain-event-store' | 'daily-tick-emitted-events';

export type EventStreamReceiptEvent = Readonly<{
  id: string;
  day: number;
  date: string;
  kind: DomainEventKind;
  actor: string;
  title: string;
  tone: Tone;
  caseId?: string;
  opportunityId?: string;
  customerId?: string;
  payloadKeys: readonly string[];
}>;

export type EventStreamReceipt = ReadonlyDeep<{
  receiptKind: 'event_stream_receipt';
  source: EventStreamReceiptSource;
  readOnly: true;
  day: number;
  eventCount: number;
  recentLimit: number;
  newestEventId: string | null;
  oldestEventId: string | null;
  byKind: Readonly<Partial<Record<DomainEventKind, number>>>;
  byTone: Readonly<Record<Tone, number>>;
  referencedCaseIds: string[];
  referencedOpportunityIds: string[];
  referencedCustomerIds: string[];
  recentEvents: EventStreamReceiptEvent[];
}>;

export type BuildEventStreamReceiptOptions = Readonly<{
  day: number;
  source: EventStreamReceiptSource;
  recentLimit?: number;
}>;

export type BuildEventStreamReceiptFromStateOptions = Readonly<{
  day?: number;
  recentLimit?: number;
}>;

export type BuildDailyTickEventStreamReceiptOptions = Readonly<{
  day?: number;
  recentLimit?: number;
}>;

type EventStreamReceiptEventSource = Readonly<Partial<DomainEventEntry>>;

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

function normalizeRecentLimit(recentLimit: number | undefined): number {
  if (recentLimit === undefined) {
    return 20;
  }

  if (!Number.isFinite(recentLimit)) {
    return 20;
  }

  return Math.max(0, Math.floor(recentLimit));
}

function readArray<T>(value: unknown): readonly T[] {
  return Array.isArray(value) ? value as readonly T[] : [];
}

function readNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function readEventKind(value: unknown): DomainEventKind {
  if (
    value === 'journal'
    || value === 'action_executed'
    || value === 'budget_changed'
    || value === 'opportunity_advanced'
    || value === 'opportunity_closed'
    || value === 'case_sold'
    || value === 'case_withdrawn'
    || value === 'case_lost_to_rival'
    || value === 'window_extended'
    || value === 'market_event'
    || value === 'decision_moment_triggered'
    || value === 'business_flow_step_advanced'
  ) {
    return value;
  }
  return 'journal';
}

function readTone(value: unknown): Tone {
  if (value === 'success' || value === 'danger') {
    return value;
  }
  return 'accent';
}

function normalizeEventEntry(
  event: EventStreamReceiptEventSource,
  index: number,
  fallbackDay: number,
): DomainEventEntry {
  const id = readString(event.id, `event-legacy-${index + 1}`);
  return {
    id,
    day: readNumber(event.day, fallbackDay),
    date: readString(event.date),
    kind: readEventKind(event.kind),
    actor: readString(event.actor, '系统'),
    title: readString(event.title, readString(event.actor, id)),
    detail: readString(event.detail),
    tone: readTone(event.tone),
    ...(typeof event.caseId === 'string' ? { caseId: event.caseId } : {}),
    ...(typeof event.opportunityId === 'string' ? { opportunityId: event.opportunityId } : {}),
    ...(typeof event.customerId === 'string' ? { customerId: event.customerId } : {}),
    payload: readObject(event.payload),
  };
}

function buildPayloadKeys(event: EventStreamReceiptEventSource): string[] {
  return Object.keys(readObject(event.payload)).sort();
}

function buildReceiptEvent(event: DomainEventEntry): EventStreamReceiptEvent {
  return {
    id: event.id,
    day: event.day,
    date: event.date,
    kind: event.kind,
    actor: event.actor,
    title: event.title,
    tone: event.tone,
    ...(event.caseId === undefined ? {} : { caseId: event.caseId }),
    ...(event.opportunityId === undefined ? {} : { opportunityId: event.opportunityId }),
    ...(event.customerId === undefined ? {} : { customerId: event.customerId }),
    payloadKeys: buildPayloadKeys(event),
  };
}

function collectReferencedIds(
  events: readonly EventStreamReceiptEventSource[],
  key: 'caseId' | 'opportunityId' | 'customerId',
): string[] {
  const ids = new Set<string>();
  events.forEach((event) => {
    const id = event[key];
    if (id) {
      ids.add(id);
    }
  });
  return [...ids];
}

export function buildEventStreamReceipt(
  events: readonly EventStreamReceiptEventSource[],
  options: BuildEventStreamReceiptOptions,
): EventStreamReceipt {
  const eventEntries = readArray<EventStreamReceiptEventSource>(events)
    .map((event, index) => normalizeEventEntry(event, index, readNumber(options.day)));
  const recentLimit = normalizeRecentLimit(options.recentLimit);
  const byKind: Partial<Record<DomainEventKind, number>> = {};
  const byTone: Record<Tone, number> = {
    accent: 0,
    danger: 0,
    success: 0,
  };

  eventEntries.forEach((event) => {
    byKind[event.kind] = (byKind[event.kind] || 0) + 1;
    byTone[event.tone] += 1;
  });

  return freezeReceipt({
    receiptKind: 'event_stream_receipt',
    source: options.source,
    readOnly: true,
    day: options.day,
    eventCount: eventEntries.length,
    recentLimit,
    newestEventId: eventEntries[0]?.id || null,
    oldestEventId: eventEntries[eventEntries.length - 1]?.id || null,
    byKind,
    byTone,
    referencedCaseIds: collectReferencedIds(eventEntries, 'caseId'),
    referencedOpportunityIds: collectReferencedIds(eventEntries, 'opportunityId'),
    referencedCustomerIds: collectReferencedIds(eventEntries, 'customerId'),
    recentEvents: eventEntries.slice(0, recentLimit).map(buildReceiptEvent),
  } satisfies EventStreamReceipt);
}

export function buildEventStreamReceiptFromState(
  state: Readonly<Partial<GameState>>,
  options: BuildEventStreamReceiptFromStateOptions = {},
): EventStreamReceipt {
  const day = options.day ?? readNumber(state.day);
  return buildEventStreamReceipt(readArray<EventStreamReceiptEventSource>(state.eventStore), {
    day,
    source: 'domain-event-store',
    recentLimit: options.recentLimit,
  });
}

export function buildDailyTickEventStreamReceipt(
  result: Readonly<Partial<DailyTickResult>>,
  options: BuildDailyTickEventStreamReceiptOptions = {},
): EventStreamReceipt {
  const day = options.day ?? readNumber(result.day);
  return buildEventStreamReceipt(readArray<EventStreamReceiptEventSource>(result.emittedEvents), {
    day,
    source: 'daily-tick-emitted-events',
    recentLimit: options.recentLimit,
  });
}
