import type {
  ListingEndingBucket,
  ListingEndingType,
  OwnerSatisfactionState,
} from '../core/world-state/caseOutcomeTypes.js';
import type { Case, DefenseOutcome, GameState } from './models.js';
import { evaluateCoreProtection } from './coreProtectionPolicy.js';

export interface TerminalOutcomeDecision {
  defenseOutcome: DefenseOutcome;
  ownerSatisfaction: OwnerSatisfactionState;
  endingType: ListingEndingType;
  endingBucket: ListingEndingBucket;
  eventTone: 'accent' | 'danger' | 'success';
  reasons: string[];
}

function buildWithdrawnDecision(
  ownerSatisfaction: OwnerSatisfactionState,
  reasons: string[],
): TerminalOutcomeDecision {
  if (ownerSatisfaction === 'no_regret') {
    return {
      defenseOutcome: 'withdrawn',
      ownerSatisfaction,
      endingType: 'not_sold_no_regret',
      endingBucket: 'good',
      eventTone: 'accent',
      reasons,
    };
  }

  if (ownerSatisfaction === 'regret') {
    return {
      defenseOutcome: 'withdrawn',
      ownerSatisfaction,
      endingType: 'not_sold_regret',
      endingBucket: 'neutral',
      eventTone: 'accent',
      reasons,
    };
  }

  return {
    defenseOutcome: 'withdrawn',
    ownerSatisfaction: 'unhappy',
    endingType: 'withdrawn_unhappy',
    endingBucket: 'bad',
    eventTone: 'danger',
    reasons,
  };
}

export function resolveWithdrawnTerminalOutcome(
  state: GameState,
  caseItem: Case,
): TerminalOutcomeDecision {
  const protection = evaluateCoreProtection(state, caseItem, 'withdrawn_terminal_outcome');
  const relationTrust = protection.relationTrust;
  const activePipeline = protection.activePipeline;
  const qualifiedPipeline = protection.qualifiedLeadCount > 0;
  const recentlyMaintained = caseItem.touchedOwnerToday || protection.recentlyMaintained;
  const reasons = protection.reasons;

  if (caseItem.goalTier === 'core') {
    if (protection.protected || relationTrust >= 64 || qualifiedPipeline || (recentlyMaintained && activePipeline)) {
      return buildWithdrawnDecision('no_regret', [
        ...reasons,
        'core protected by relation or pipeline evidence',
      ]);
    }

    return buildWithdrawnDecision('regret', [
      ...reasons,
      'core withdrawn without rival loss is protected from bad bucket',
    ]);
  }

  if (relationTrust >= 72 || qualifiedPipeline) {
    return buildWithdrawnDecision('no_regret', [
      ...reasons,
      'non-core withdrawn with strong trust or qualified pipeline',
    ]);
  }

  if (relationTrust >= 52 || recentlyMaintained || activePipeline) {
    return buildWithdrawnDecision('regret', [
      ...reasons,
      'non-core withdrawn with partial protection evidence',
    ]);
  }

  return buildWithdrawnDecision('unhappy', [
    ...reasons,
    'withdrawn with weak relation and no active protection evidence',
  ]);
}
