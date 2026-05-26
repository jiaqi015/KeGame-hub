import type { Case, GameState, DefenseOutcome, ListingEndingBucket, ListingEndingType, OwnerSatisfactionState } from './models.js';
import { asWritableCase, asWritableGameState } from './models.js';
import type { ContractFactState } from './consensusFormationHelper.js';
import {
  type CaseTerminalKind,
  type CaseTerminalOutcomeState,
  createCaseTerminalOutcomeState,
} from '../core/world-state/caseOutcomeTypes.js';
import {
  deriveCaseTerminalStatusFromOutcomeProjection,
  deriveSoldPriceFromContractFacts,
  type CaseOutcomeProjection,
} from '../core/world-state/caseOutcomeProjection.js';
import {
  type CanonicalStoreWriteProvenance,
  type CanonicalStoreWriteReceipt,
  makeStoreWriteReceipt,
} from '../core/world-state/canonicalStoreKernel.js';

export const LOST_TO_RIVAL_UNHAPPY_TRUST_THRESHOLD = 52;
export const WITHDRAWN_UNHAPPY_TRUST_THRESHOLD = 50;
export const SOLD_HAPPY_TRUST_THRESHOLD = 76;
export const SOLD_HAPPY_PRICE_RATIO_THRESHOLD = 0.97;
export const SOLD_NEUTRAL_TRUST_THRESHOLD = 62;
export const RELATIVE_OUTCOME_OUTRUN_PRICE_RATIO = 0.985;
export const RELATIVE_OUTCOME_FLAT_PRICE_RATIO = 0.95;

// ---------------------------------------------------------------------------
// R30: Canonical read helpers — derive from canonical state, not legacy mirrors
// ---------------------------------------------------------------------------

export type OutcomeReadSource = 'canonical_terminal_outcome' | 'canonical_contract_fact' | 'old_save_compatibility';

export interface CaseOutcomeReadResult {
  readonly status: 'sold' | 'lost_to_rival' | 'withdrawn' | 'active';
  readonly soldPrice: number | undefined;
  readonly ownerSatisfaction: OwnerSatisfactionState;
  readonly defenseOutcome: DefenseOutcome;
  readonly endingType: ListingEndingType;
  readonly endingBucket: ListingEndingBucket;
  readonly relativeOutcome: 'outrun' | 'flat' | 'lose';
  readonly source: OutcomeReadSource;
}

/**
 * R30: Read terminal outcome from canonical state objects.
 * Priority: CaseTerminalOutcomeState > ContractFactState > old_save_compatibility from Case mirrors.
 */
export function readCaseTerminalOutcomeForCase(
  state: GameState,
  caseItem: Case,
  trust: number,
): CaseOutcomeReadResult {
  // 1. Check canonical terminal outcome (lost_to_rival / withdrawn)
  const terminal = findCaseTerminalOutcome(state, caseItem.id);
  if (terminal) {
    return {
      status: terminal.kind,
      soldPrice: undefined,
      ownerSatisfaction: terminal.ownerSatisfaction,
      defenseOutcome: terminal.defenseOutcome as DefenseOutcome,
      endingType: terminal.endingType,
      endingBucket: terminal.endingBucket,
      relativeOutcome: 'lose' as const,
      source: 'canonical_terminal_outcome',
    };
  }

  // 2. Check canonical contract fact (sold)
  const contractFacts = state.runtimeContractFacts ?? [];
  const outcomeProjection = deriveCaseTerminalStatusFromOutcomeProjection(contractFacts, [], caseItem.id);
  if (outcomeProjection.sourceKind === 'contract_fact') {
    const soldPrice = deriveSoldPriceFromContractFacts(contractFacts, caseItem.id) ?? 0;
    const ownerSatisfaction = deriveOwnerSatisfactionForSold(trust, soldPrice, caseItem.marketPrice);
    const defenseOutcome = 'held' as DefenseOutcome;
    const endingType = deriveEndingTypeForSold(ownerSatisfaction);
    const endingBucket = resolveEndingBucket(endingType);
    const relativeOutcome = computeRelativeOutcome(caseItem, state);
    return {
      status: 'sold',
      soldPrice,
      ownerSatisfaction,
      defenseOutcome,
      endingType,
      endingBucket,
      relativeOutcome,
      source: 'canonical_contract_fact',
    };
  }

  // 3. Old-save compatibility: derive from Case mirrors
  return deriveOutcomeFromLegacyCase(caseItem, trust);
}

/** R30: Old-save compatibility fallback — reads from Case mirrors with explicit provenance. */
function deriveOutcomeFromLegacyCase(caseItem: Case, trust: number): CaseOutcomeReadResult {
  const status = caseItem.status;
  const soldPrice = caseItem.soldPrice;
  const ownerSatisfaction = deriveOwnerSatisfaction(status, trust, soldPrice, caseItem.marketPrice);
  const defenseOutcome = deriveDefenseOutcome(status);
  const endingType = deriveEndingType(status, ownerSatisfaction, defenseOutcome);
  const endingBucket = resolveEndingBucket(endingType);
  const relativeOutcome = status === 'sold'
    ? computeRelativeOutcomeFromPrice(soldPrice ?? 0, caseItem.marketPrice)
    : 'lose' as const;
  return {
    status: status as CaseOutcomeReadResult['status'],
    soldPrice: status === 'sold' ? soldPrice : undefined,
    ownerSatisfaction,
    defenseOutcome,
    endingType,
    endingBucket,
    relativeOutcome,
    source: 'old_save_compatibility',
  };
}

// ---------------------------------------------------------------------------
// R30: Pure derivation helpers — no early-return on mirror fields
// ---------------------------------------------------------------------------

function deriveDefenseOutcome(status: string): DefenseOutcome {
  if (status === 'lost_to_rival') return 'lost_to_rival';
  if (status === 'sold') return 'held';
  if (status === 'withdrawn') return 'withdrawn';
  return 'held';
}

function deriveOwnerSatisfaction(
  status: string,
  trust: number,
  soldPrice: number | undefined,
  marketPrice: number,
): OwnerSatisfactionState {
  if (status === 'sold') {
    return deriveOwnerSatisfactionForSold(trust, soldPrice ?? 0, marketPrice);
  }
  if (status === 'lost_to_rival') {
    return trust <= LOST_TO_RIVAL_UNHAPPY_TRUST_THRESHOLD ? 'unhappy' : 'regret';
  }
  if (status === 'withdrawn') {
    return trust <= WITHDRAWN_UNHAPPY_TRUST_THRESHOLD ? 'unhappy' : 'regret';
  }
  return 'regret';
}

function deriveOwnerSatisfactionForSold(trust: number, soldPrice: number, marketPrice: number): OwnerSatisfactionState {
  if (trust >= SOLD_HAPPY_TRUST_THRESHOLD && soldPrice >= marketPrice * SOLD_HAPPY_PRICE_RATIO_THRESHOLD) {
    return 'happy';
  }
  if (trust >= SOLD_NEUTRAL_TRUST_THRESHOLD) {
    return 'neutral';
  }
  return 'regret';
}

function deriveEndingType(
  status: string,
  satisfaction: OwnerSatisfactionState,
  defenseOutcome: DefenseOutcome,
): ListingEndingType {
  if (status === 'sold') {
    return deriveEndingTypeForSold(satisfaction);
  }
  if (defenseOutcome === 'lost_to_rival') return 'sold_by_other';
  if (status === 'withdrawn') return 'withdrawn_unhappy';
  if (satisfaction === 'no_regret' || satisfaction === 'neutral') return 'not_sold_no_regret';
  return 'not_sold_regret';
}

function deriveEndingTypeForSold(satisfaction: OwnerSatisfactionState): ListingEndingType {
  if (satisfaction === 'happy') return 'sold_by_you_happy';
  if (satisfaction === 'neutral' || satisfaction === 'no_regret') return 'sold_by_you_neutral';
  return 'sold_by_you_regret';
}

function computeRelativeOutcome(caseItem: Case, state: GameState): 'outrun' | 'flat' | 'lose' {
  const soldPrice = deriveSoldPriceFromContractFacts(state.runtimeContractFacts ?? [], caseItem.id) ?? caseItem.soldPrice ?? 0;
  return computeRelativeOutcomeFromPrice(soldPrice, caseItem.marketPrice);
}

function computeRelativeOutcomeFromPrice(soldPrice: number, marketPrice: number): 'outrun' | 'flat' | 'lose' {
  const priceRatio = soldPrice / marketPrice;
  if (priceRatio >= RELATIVE_OUTCOME_OUTRUN_PRICE_RATIO) return 'outrun';
  if (priceRatio >= RELATIVE_OUTCOME_FLAT_PRICE_RATIO) return 'flat';
  return 'lose';
}

// ---------------------------------------------------------------------------
// Legacy resolver functions — kept for backward compatibility but now
// derive instead of preferring mirrors
// ---------------------------------------------------------------------------

export function resolveDefenseOutcome(caseItem: Case): DefenseOutcome {
  return deriveDefenseOutcome(caseItem.status);
}

export function resolveOwnerSatisfaction(caseItem: Case): OwnerSatisfactionState {
  return deriveOwnerSatisfaction(caseItem.status, caseItem.trust, caseItem.soldPrice, caseItem.marketPrice);
}

export function resolveEndingType(
  caseItem: Case,
  satisfaction: OwnerSatisfactionState,
  defenseOutcome: DefenseOutcome,
): ListingEndingType {
  return deriveEndingType(caseItem.status, satisfaction, defenseOutcome);
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
    return computeRelativeOutcomeFromPrice(caseItem.soldPrice ?? 0, caseItem.marketPrice);
  }
  return 'lose';
}

// ---------------------------------------------------------------------------
// R29: Single canonical terminal mirror sync boundary
// ---------------------------------------------------------------------------

/**
 * R29: The ONLY allowed write path for terminal outcome mirror fields.
 *
 * All terminal mirror writes (ownerSatisfaction, defenseOutcome, endingType,
 * endingBucket, relativeOutcome) must go through this function.
 * No other code may write these fields directly.
 */
export function syncLegacyCaseOutcomeMirrorsFromTerminalFact(
  caseItem: Case,
  mirrors: {
    ownerSatisfaction: OwnerSatisfactionState;
    defenseOutcome: DefenseOutcome;
    endingType: ListingEndingType;
    endingBucket: ListingEndingBucket;
    relativeOutcome: 'outrun' | 'flat' | 'lose';
  },
): void {
  const w = asWritableCase(caseItem);
  w.ownerSatisfaction = mirrors.ownerSatisfaction;
  w.defenseOutcome = mirrors.defenseOutcome;
  w.endingType = mirrors.endingType;
  w.endingBucket = mirrors.endingBucket;
  w.relativeOutcome = mirrors.relativeOutcome;
}

// ---------------------------------------------------------------------------
// Terminal outcome marking functions
// ---------------------------------------------------------------------------

export function markCaseLostToRival(caseItem: Case): void {
  const ownerSatisfaction = caseItem.trust <= LOST_TO_RIVAL_UNHAPPY_TRUST_THRESHOLD ? 'unhappy' as const : 'regret' as const;
  syncLegacyCaseOutcomeMirrorsFromTerminalFact(caseItem, {
    ownerSatisfaction,
    defenseOutcome: 'lost_to_rival',
    endingType: 'sold_by_other',
    endingBucket: 'bad',
    relativeOutcome: 'lose',
  });
}

export function markCaseWithdrawn(caseItem: Case): void {
  const ownerSatisfaction = caseItem.trust <= WITHDRAWN_UNHAPPY_TRUST_THRESHOLD ? 'unhappy' as const : 'regret' as const;
  syncLegacyCaseOutcomeMirrorsFromTerminalFact(caseItem, {
    ownerSatisfaction,
    defenseOutcome: 'withdrawn',
    endingType: 'withdrawn_unhappy',
    endingBucket: 'bad',
    relativeOutcome: 'lose',
  });
}

export function markCaseSoldForFixtureOnly(caseItem: Case, soldPrice: number): void {
  asWritableCase(caseItem).soldPrice = soldPrice;
  const ownerSatisfaction = resolveOwnerSatisfaction(caseItem);
  const defenseOutcome = resolveDefenseOutcome(caseItem);
  const endingType = resolveEndingType(caseItem, ownerSatisfaction, defenseOutcome);
  const endingBucket = resolveEndingBucket(endingType);
  const relativeOutcome = resolveRelativeOutcome(caseItem);
  syncLegacyCaseOutcomeMirrorsFromTerminalFact(caseItem, {
    ownerSatisfaction,
    defenseOutcome,
    endingType,
    endingBucket,
    relativeOutcome,
  });
}

/**
 * R29: Mark case sold from a ContractFactState (proof-derived, contract-shaped).
 * Production deal closing must use this. Consumes the full contract fact,
 * not a scalar price.
 */
export function markCaseSoldFromContract(caseItem: Case, contractFact: ContractFactState): void {
  asWritableCase(caseItem).soldPrice = contractFact.dealPrice;
  const ownerSatisfaction = resolveOwnerSatisfaction(caseItem);
  const defenseOutcome = resolveDefenseOutcome(caseItem);
  const endingType = resolveEndingType(caseItem, ownerSatisfaction, defenseOutcome);
  const endingBucket = resolveEndingBucket(endingType);
  const relativeOutcome = resolveRelativeOutcome(caseItem);
  syncLegacyCaseOutcomeMirrorsFromTerminalFact(caseItem, {
    ownerSatisfaction,
    defenseOutcome,
    endingType,
    endingBucket,
    relativeOutcome,
  });
}

// ---------------------------------------------------------------------------
// Canonical CaseTerminalOutcome creation + legacy mirror sync
// ---------------------------------------------------------------------------

function ensureCaseTerminalOutcomes(state: GameState): readonly CaseTerminalOutcomeState[] {
  if (!state.runtimeCaseTerminalOutcomes) asWritableGameState(state).runtimeCaseTerminalOutcomes = [];
  return state.runtimeCaseTerminalOutcomes;
}

/**
 * Store-level ensure helper for terminal outcome store.
 * Returns a CanonicalStoreWriteReceipt for audit.
 */
export function ensureRuntimeCaseTerminalOutcomes(
  state: GameState,
  provenance: CanonicalStoreWriteProvenance = 'canonical-bootstrap',
): CanonicalStoreWriteReceipt {
  if (!state.runtimeCaseTerminalOutcomes) {
    asWritableGameState(state).runtimeCaseTerminalOutcomes = [];
  }
  return makeStoreWriteReceipt('runtimeCaseTerminalOutcomes', 'ensure', provenance, {
    nextCount: state.runtimeCaseTerminalOutcomes.length,
  });
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
  asWritableGameState(state).runtimeCaseTerminalOutcomes.push(created);
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
  syncLegacyCaseOutcomeMirrorsFromTerminalFact(caseItem, {
    ownerSatisfaction: input.ownerSatisfaction,
    defenseOutcome: input.defenseOutcome as DefenseOutcome,
    endingType: input.endingType,
    endingBucket: input.endingBucket,
    relativeOutcome: 'lose',
  });
}
