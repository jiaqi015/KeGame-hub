import type { Case, GameState, RivalListing } from '../models.js';
import { evaluateCoreProtection } from '../coreProtectionPolicy.js';
import { getMarketCell } from '../market/marketReadBoundary.js';
import { getRivalOutcomeControl } from './rivalOutcomeControlScales.js';
import {
  computeCompetitionRivalLossProbability,
  computeVisibleRivalLossProbability,
  getRivalListingStrengthScale,
  type CompetitionRivalLossInput,
} from './rivalLossProbabilityModel.js';

export { getRivalListingStrengthScale };

export type RivalCaseLossSource = 'visible_listing' | 'competition_group';

export interface RivalCaseLossEvaluation {
  allowed: boolean;
  probability: number;
  reasons: string[];
  relationTrust: number;
  relationTrustSource: string;
  source: RivalCaseLossSource;
}

function blockedEvaluation(
  source: RivalCaseLossSource,
  relationTrust: number,
  relationTrustSource: string,
  reasons: string[],
): RivalCaseLossEvaluation {
  return {
    allowed: false,
    probability: 0,
    reasons,
    relationTrust,
    relationTrustSource,
    source,
  };
}

export function evaluateVisibleRivalCaseLoss(
  state: GameState,
  caseItem: Case,
  listing: RivalListing,
): RivalCaseLossEvaluation {
  const { rivalCaseLossScale } = getRivalOutcomeControl(state);
  const protection = evaluateCoreProtection(state, caseItem, 'visible_rival_loss');
  if (rivalCaseLossScale <= 0) {
    return blockedEvaluation('visible_listing', protection.relationTrust, protection.relationTrustSource, [
      ...protection.reasons,
      'rival case loss disabled by outcome control',
    ]);
  }
  if (protection.protected) {
    return blockedEvaluation('visible_listing', protection.relationTrust, protection.relationTrustSource, protection.reasons);
  }

  const probability = computeVisibleRivalLossProbability(caseItem, listing, protection, rivalCaseLossScale);
  return {
    allowed: probability.allowed,
    probability: probability.probability,
    reasons: [...protection.reasons, ...probability.reasons],
    relationTrust: protection.relationTrust,
    relationTrustSource: protection.relationTrustSource,
    source: 'visible_listing',
  };
}

export function evaluateCompetitionRivalCaseLoss(
  state: GameState,
  caseItem: Case,
  input: CompetitionRivalLossInput,
): RivalCaseLossEvaluation {
  const source = 'competition_group';
  const { rivalCaseLossScale } = getRivalOutcomeControl(state);
  const protection = evaluateCoreProtection(state, caseItem, 'competition_rival_loss');
  if (rivalCaseLossScale <= 0) {
    return blockedEvaluation(source, protection.relationTrust, protection.relationTrustSource, [
      ...protection.reasons,
      'rival case loss disabled by outcome control',
    ]);
  }
  if (protection.protected) {
    return blockedEvaluation(source, protection.relationTrust, protection.relationTrustSource, protection.reasons);
  }

  const cell = getMarketCell(state, caseItem.marketCellId);
  if (!cell) {
    return blockedEvaluation(source, protection.relationTrust, protection.relationTrustSource, [
      ...protection.reasons,
      'case has no market cell',
    ]);
  }

  const probability = computeCompetitionRivalLossProbability(
    state,
    caseItem,
    input,
    protection,
    cell,
    rivalCaseLossScale,
  );
  if (!probability.allowed) {
    return blockedEvaluation(source, protection.relationTrust, protection.relationTrustSource, [
      ...protection.reasons,
      ...probability.reasons,
    ]);
  }

  return {
    allowed: true,
    probability: probability.probability,
    reasons: [...protection.reasons, ...probability.reasons],
    relationTrust: protection.relationTrust,
    relationTrustSource: protection.relationTrustSource,
    source,
  };
}
