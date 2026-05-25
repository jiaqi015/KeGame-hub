export const LISTING_ENDING_TYPES = [
  'sold_by_you_happy',
  'sold_by_you_neutral',
  'sold_by_you_regret',
  'sold_by_other',
  'not_sold_no_regret',
  'not_sold_regret',
  'switch_to_rent_no_regret',
  'withdrawn_unhappy',
] as const;
export type ListingEndingType = (typeof LISTING_ENDING_TYPES)[number];

export const LISTING_ENDING_BUCKETS = ['good', 'neutral', 'bad'] as const;
export type ListingEndingBucket = (typeof LISTING_ENDING_BUCKETS)[number];

export const OWNER_SATISFACTION_STATES = ['happy', 'neutral', 'no_regret', 'regret', 'unhappy'] as const;
export type OwnerSatisfactionState = (typeof OWNER_SATISFACTION_STATES)[number];

const LISTING_ENDING_TYPE_SET: ReadonlySet<string> = new Set(LISTING_ENDING_TYPES);
export function isListingEndingType(value: unknown): value is ListingEndingType {
  return typeof value === 'string' && LISTING_ENDING_TYPE_SET.has(value);
}

const LISTING_ENDING_BUCKET_SET: ReadonlySet<string> = new Set(LISTING_ENDING_BUCKETS);
export function isListingEndingBucket(value: unknown): value is ListingEndingBucket {
  return typeof value === 'string' && LISTING_ENDING_BUCKET_SET.has(value);
}

const OWNER_SATISFACTION_STATE_SET: ReadonlySet<string> = new Set(OWNER_SATISFACTION_STATES);
export function isOwnerSatisfactionState(value: unknown): value is OwnerSatisfactionState {
  return typeof value === 'string' && OWNER_SATISFACTION_STATE_SET.has(value);
}

// ---------------------------------------------------------------------------
// CaseTerminalOutcomeState: canonical terminal outcome for non-sold cases
// ---------------------------------------------------------------------------

export type CaseTerminalKind = 'lost_to_rival' | 'withdrawn';

export interface CaseTerminalOutcomeState {
  readonly terminalOutcomeId: string;
  readonly caseId: string;
  readonly kind: CaseTerminalKind;
  readonly day: number;
  readonly defenseOutcome: string;
  readonly ownerSatisfaction: OwnerSatisfactionState;
  readonly endingType: ListingEndingType;
  readonly endingBucket: ListingEndingBucket;
  readonly sourceEventRefs: readonly string[];
}

export function buildCaseTerminalOutcomeId(caseId: string, kind: CaseTerminalKind, day: number): string {
  return `terminal:${caseId}:${kind}:${day}`;
}

export function createCaseTerminalOutcomeState(
  caseId: string,
  kind: CaseTerminalKind,
  day: number,
  defenseOutcome: string,
  ownerSatisfaction: OwnerSatisfactionState,
  endingType: ListingEndingType,
  endingBucket: ListingEndingBucket,
  sourceEventRefs: readonly string[] = [],
): CaseTerminalOutcomeState {
  return Object.freeze({
    terminalOutcomeId: buildCaseTerminalOutcomeId(caseId, kind, day),
    caseId,
    kind,
    day,
    defenseOutcome,
    ownerSatisfaction,
    endingType,
    endingBucket,
    sourceEventRefs: Object.freeze([...sourceEventRefs]),
  });
}
