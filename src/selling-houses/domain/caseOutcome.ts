import type { Case, GameState, DefenseOutcome, ListingEndingBucket, ListingEndingType, OwnerSatisfactionState } from './models.js';
import { asWritableCase } from './models.js';
import {
  type CaseTerminalKind,
  type CaseTerminalOutcomeState,
  createCaseTerminalOutcomeState,
} from '../core/world-state/caseOutcomeTypes.js';

export const LOST_TO_RIVAL_UNHAPPY_TRUST_THRESHOLD = 52;
export const WITHDRAWN_UNHAPPY_TRUST_THRESHOLD = 50;
export const SOLD_HAPPY_TRUST_THRESHOLD = 76;
export const SOLD_HAPPY_PRICE_RATIO_THRESHOLD = 0.97;
export const SOLD_NEUTRAL_TRUST_THRESHOLD = 62;
export const RELATIVE_OUTCOME_OUTRUN_PRICE_RATIO = 0.985;
export const RELATIVE_OUTCOME_FLAT_PRICE_RATIO = 0.95;

export function resolveDefenseOutcome(caseItem: Case): DefenseOutcome {
  if (caseItem.defenseOutcome === 'lost_to_rival') {
    return 'lost_to_rival';
  }
  if (caseItem.status === 'sold') {
    return 'held';
  }
  if (caseItem.status === 'lost_to_rival') {
    return 'lost_to_rival';
  }
  if (caseItem.status === 'withdrawn') {
    return 'withdrawn';
  }
  return 'held';
}

export function resolveOwnerSatisfaction(caseItem: Case): OwnerSatisfactionState {
  if (caseItem.ownerSatisfaction) {
    return caseItem.ownerSatisfaction;
  }

  if (caseItem.status === 'sold') {
    if (caseItem.trust >= SOLD_HAPPY_TRUST_THRESHOLD && (caseItem.soldPrice || 0) >= caseItem.marketPrice * SOLD_HAPPY_PRICE_RATIO_THRESHOLD) {
      return 'happy';
    }
    if (caseItem.trust >= SOLD_NEUTRAL_TRUST_THRESHOLD) {
      return 'neutral';
    }
    return 'regret';
  }

  if (caseItem.status === 'lost_to_rival') {
    return caseItem.trust <= LOST_TO_RIVAL_UNHAPPY_TRUST_THRESHOLD ? 'unhappy' : 'regret';
  }
  if (caseItem.status === 'withdrawn') {
    return caseItem.trust <= WITHDRAWN_UNHAPPY_TRUST_THRESHOLD ? 'unhappy' : 'regret';
  }

  return 'regret';
}

export function resolveEndingType(
  caseItem: Case,
  satisfaction: OwnerSatisfactionState,
  defenseOutcome: DefenseOutcome,
): ListingEndingType {
  if (caseItem.endingType) {
    return caseItem.endingType;
  }

  if (caseItem.status === 'sold') {
    if (satisfaction === 'happy') return 'sold_by_you_happy';
    if (satisfaction === 'neutral' || satisfaction === 'no_regret') return 'sold_by_you_neutral';
    return 'sold_by_you_regret';
  }

  if (defenseOutcome === 'lost_to_rival') {
    return 'sold_by_other';
  }

  if (caseItem.status === 'withdrawn') {
    return 'withdrawn_unhappy';
  }

  if (satisfaction === 'no_regret' || satisfaction === 'neutral') {
    return 'not_sold_no_regret';
  }

  return 'not_sold_regret';
}

export function resolveEndingBucket(endingType: ListingEndingType): ListingEndingBucket {
  switch (endingType) {
    case 'sold_by_you_happy':
    case 'sold_by_you_neutral':
    case 'not_sold_no_regret':
    case 'switch_to_rent_no_regret':
      return 'good';
    case 'sold_by_you_regret':
    case 'not_sold_regret':
      return 'neutral';
    case 'sold_by_other':
    case 'withdrawn_unhappy':
      return 'bad';
  }
}

export function resolveRelativeOutcome(caseItem: Case): 'outrun' | 'flat' | 'lose' {
  if (caseItem.status === 'sold') {
    const priceRatio = (caseItem.soldPrice || 0) / caseItem.marketPrice;
    if (priceRatio >= RELATIVE_OUTCOME_OUTRUN_PRICE_RATIO) return 'outrun';
    if (priceRatio >= RELATIVE_OUTCOME_FLAT_PRICE_RATIO) return 'flat';
    return 'lose';
  }
  return 'lose';
}

export function markCaseLostToRival(caseItem: Case): void {
  caseItem.defenseOutcome = 'lost_to_rival';
  caseItem.ownerSatisfaction = caseItem.trust <= LOST_TO_RIVAL_UNHAPPY_TRUST_THRESHOLD ? 'unhappy' : 'regret';
  caseItem.endingType = 'sold_by_other';
  caseItem.endingBucket = 'bad';
}

export function markCaseWithdrawn(caseItem: Case): void {
  caseItem.defenseOutcome = 'withdrawn';
  caseItem.ownerSatisfaction = caseItem.trust <= WITHDRAWN_UNHAPPY_TRUST_THRESHOLD ? 'unhappy' : 'regret';
  caseItem.endingType = 'withdrawn_unhappy';
  caseItem.endingBucket = 'bad';
}

export function markCaseSold(caseItem: Case, soldPrice: number): void {
  asWritableCase(caseItem).soldPrice = soldPrice;
  caseItem.ownerSatisfaction = resolveOwnerSatisfaction(caseItem);
  caseItem.defenseOutcome = resolveDefenseOutcome(caseItem);
  caseItem.endingType = resolveEndingType(caseItem, caseItem.ownerSatisfaction, caseItem.defenseOutcome);
  caseItem.endingBucket = resolveEndingBucket(caseItem.endingType);
  caseItem.relativeOutcome = resolveRelativeOutcome(caseItem);
}

/**
 * R26: Mark case sold from a ContractFact (proof-derived).
 * Production deal closing should use this instead of markCaseSold(caseItem, number).
 */
export function markCaseSoldFromContract(caseItem: Case, contractDealPrice: number, _proofId: string): void {
  asWritableCase(caseItem).soldPrice = contractDealPrice;
  caseItem.ownerSatisfaction = resolveOwnerSatisfaction(caseItem);
  caseItem.defenseOutcome = resolveDefenseOutcome(caseItem);
  caseItem.endingType = resolveEndingType(caseItem, caseItem.ownerSatisfaction, caseItem.defenseOutcome);
  caseItem.endingBucket = resolveEndingBucket(caseItem.endingType);
  caseItem.relativeOutcome = resolveRelativeOutcome(caseItem);
}

// ---------------------------------------------------------------------------
// Canonical CaseTerminalOutcome creation + legacy mirror sync
// ---------------------------------------------------------------------------

function ensureCaseTerminalOutcomes(state: GameState): CaseTerminalOutcomeState[] {
  if (!state.runtimeCaseTerminalOutcomes) state.runtimeCaseTerminalOutcomes = [];
  return state.runtimeCaseTerminalOutcomes;
}

export function findCaseTerminalOutcome(state: GameState, caseId: string): CaseTerminalOutcomeState | undefined {
  return state.runtimeCaseTerminalOutcomes?.find(t => t.caseId === caseId);
}

export function createCaseTerminalOutcomeOnState(
  state: GameState,
  caseId: string,
  kind: CaseTerminalKind,
  day: number,
  defenseOutcome: string,
  ownerSatisfaction: OwnerSatisfactionState,
  endingType: ListingEndingType,
  endingBucket: ListingEndingBucket,
  sourceEventRefs: readonly string[] = [],
): CaseTerminalOutcomeState | undefined {
  const outcomes = ensureCaseTerminalOutcomes(state);
  // Duplicate guard: one terminal outcome per case
  if (outcomes.some(t => t.caseId === caseId)) return undefined;

  const created = createCaseTerminalOutcomeState(
    caseId, kind, day, defenseOutcome, ownerSatisfaction, endingType, endingBucket, sourceEventRefs,
  );
  outcomes.push(created);
  return created;
}

/**
 * Syncs legacy Case mirrors from a canonical CaseTerminalOutcomeState.
 *
 * This is the ONLY allowed write path for terminal case status → 'lost_to_rival' / 'withdrawn' / 'expired'.
 * All direct mutations are encapsulated here so the gate can allowlist a single location.
 *
 * R23: provenance is required. `terminalOutcomeId` traces back to the canonical
 * CaseTerminalOutcomeState that owns this terminal truth. If the caller is a
 * fallback path (no canonical outcome exists yet), they must still call this
 * function with `provenance: 'fallback-guard'` so the gate can classify it.
 */
export function syncLegacyCaseTerminalMirrorFromOutcome(
  state: GameState,
  input: {
    terminalOutcomeId: string;
    caseId: string;
    kind: CaseTerminalKind;
    stageLabel: string;
    defenseOutcome: string;
    ownerSatisfaction: OwnerSatisfactionState;
    endingType: ListingEndingType;
    endingBucket: ListingEndingBucket;
    provenance: 'canonical-outcome' | 'fallback-guard';
    sourceEventRefs?: readonly string[];
  },
): void {
  const caseItem = state.cases.find((c) => c.id === input.caseId);
  if (!caseItem) return;

  // Terminal status write (mirror of canonical terminal outcome)
  asWritableCase(caseItem).status = input.kind;
  caseItem.stageLabel = input.stageLabel;
  caseItem.defenseOutcome = input.defenseOutcome as DefenseOutcome;
  caseItem.ownerSatisfaction = input.ownerSatisfaction;
  caseItem.endingType = input.endingType;
  caseItem.endingBucket = input.endingBucket;
}
