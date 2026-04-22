import type {
  Case,
  DefenseOutcome,
  ListingEndingBucket,
  ListingEndingType,
  OwnerSatisfactionState,
} from './models.js';

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
  caseItem.soldPrice = soldPrice;
  caseItem.ownerSatisfaction = resolveOwnerSatisfaction(caseItem);
  caseItem.defenseOutcome = resolveDefenseOutcome(caseItem);
  caseItem.endingType = resolveEndingType(caseItem, caseItem.ownerSatisfaction, caseItem.defenseOutcome);
  caseItem.endingBucket = resolveEndingBucket(caseItem.endingType);
  caseItem.relativeOutcome = resolveRelativeOutcome(caseItem);
}
