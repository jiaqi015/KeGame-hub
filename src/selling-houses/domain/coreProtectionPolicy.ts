import { BALANCE } from './config/balance.js';
import { readCaseRelationBusinessContextFromRuntime } from '../core/world-state/relationReadProjection.js';
import type { Case, GameState, OwnerSatisfactionState, Opportunity } from './models.js';
import { isOpportunityActiveByCanonicalState } from './opportunityLifecycleStatusRead.js';

export type CoreProtectionSource =
  | 'visible_rival_loss'
  | 'competition_rival_loss'
  | 'withdrawn_terminal_outcome'
  | 'window_extension';

export interface CoreProtectionEvaluation {
  protected: boolean;
  relationTrust: number;
  relationTrustSource: string;
  opportunities: Opportunity[];
  qualifiedLeadCount: number;
  lateLeadCount: number;
  relationshipGap: number;
  recentlyMaintained: boolean;
  activePipeline: boolean;
  advancedPipeline: boolean;
  reasons: string[];
}

function activeOwnedOpportunities(state: GameState, caseItem: Case) {
  return state.opportunities.filter((entry) => (
    entry.caseId === caseItem.id
    && isOpportunityActiveByCanonicalState(state, entry)
    && entry.visibility !== 'shadow'
  ));
}

function relationGap(state: GameState, caseItem: Case) {
  return caseItem.lastOwnerTouchedDay <= 0 ? state.day : state.day - caseItem.lastOwnerTouchedDay;
}

export function evaluateCoreProtection(
  state: GameState,
  caseItem: Case,
  source: CoreProtectionSource,
): CoreProtectionEvaluation {
  const relationContext = readCaseRelationBusinessContextFromRuntime(state, caseItem);
  const relationTrust = relationContext.trustValue;
  const opportunities = activeOwnedOpportunities(state, caseItem);
  const qualifiedLeadCount = opportunities.filter((entry) => entry.stageIndex >= 2).length;
  const lateLeadCount = opportunities.filter((entry) => entry.stageIndex >= 3).length;
  const relationshipGap = relationGap(state, caseItem);
  const recentlyMaintained = relationshipGap <= 2;
  const activePipeline = opportunities.length > 0;
  const advancedPipeline = qualifiedLeadCount > 0;
  const baseReasons = [
    `source=${source}`,
    `trust=${Math.round(relationTrust)}`,
    `trustSource=${relationContext.trustSource}`,
    `goalTier=${caseItem.goalTier}`,
  ];

  const build = (protectedCase: boolean, reason?: string): CoreProtectionEvaluation => ({
    protected: protectedCase,
    relationTrust,
    relationTrustSource: relationContext.trustSource,
    opportunities,
    qualifiedLeadCount,
    lateLeadCount,
    relationshipGap,
    recentlyMaintained,
    activePipeline,
    advancedPipeline,
    reasons: reason ? [...baseReasons, reason] : baseReasons,
  });

  if (state.runContext.difficultyId === 'warmup' || state.runContext.difficultyId === 'easy') {
    if (relationTrust >= 62 && (recentlyMaintained || activePipeline)) {
      return build(true, 'low difficulty maintained or pipelined case');
    }
  }

  if (caseItem.goalTier !== 'core') {
    return build(false);
  }

  if (relationTrust >= 78) {
    return build(true, 'high-trust core case');
  }

  if (qualifiedLeadCount > 0 && relationTrust >= 48) {
    return build(true, 'core case protected by qualified owned pipeline');
  }

  if (recentlyMaintained && activePipeline && relationTrust >= 52) {
    return build(true, 'core case protected by maintained owned pipeline');
  }

  if (
    relationTrust >= 58
    && (recentlyMaintained || qualifiedLeadCount > 0 || opportunities.length >= 2)
  ) {
    return build(true, 'core case protected by relation-backed maintenance or owned pipeline');
  }

  return build(false);
}

export function shouldExtendExpiredCoreWindow(
  state: GameState,
  caseItem: Case,
  ownerSatisfaction: OwnerSatisfactionState,
) {
  const protection = evaluateCoreProtection(state, caseItem, 'window_extension');
  const caseTickBalance = BALANCE.market.caseTick;
  const regularRenewal = protection.relationTrust >= caseTickBalance.renewalTrustThreshold
    && ownerSatisfaction !== 'unhappy'
    && caseItem.d3 >= caseTickBalance.renewalD3Threshold;
  const protectedCoreWindow = caseItem.goalTier === 'core'
    && protection.protected
    && protection.relationTrust >= (state.runContext.difficultyId === 'extreme' ? 84 : 62)
    && (protection.activePipeline || protection.recentlyMaintained)
    && (
      state.runContext.difficultyId !== 'extreme'
      || protection.advancedPipeline
      || protection.relationTrust >= 90
    );

  return {
    extend: regularRenewal || protectedCoreWindow,
    protection,
    reasons: [
      ...protection.reasons,
      regularRenewal ? 'regular renewal threshold met' : 'regular renewal threshold missed',
      protectedCoreWindow ? 'core window extension protected' : 'core window extension not protected',
    ],
  };
}
