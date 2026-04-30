import type { GameState } from '../../domain/models.js';
import { deriveCaseRecommendations } from '../../domain/recommendationEngine.js';
import {
  buildDecisionSupportWorkspaceProjection,
  buildOpportunityRelationWorkspaceProjection,
  buildProcessWorkspaceProjection,
} from '../../interface/interaction-workspace/index.js';
import { freezeProjection } from '../../interface/interaction-workspace/readOnly.js';

export type ArchitectureParityStatus = 'aligned' | 'watch' | 'gap';

export interface ArchitectureParityWarning {
  readonly code: string;
  readonly message: string;
  readonly caseId?: string;
}

export interface RecommendationParityProjection {
  readonly legacyRecommendationCount: number;
  readonly decisionSupportCaseCount: number;
  readonly decisionSupportDraftCount: number;
  readonly matchedPrimaryActionCount: number;
  readonly missingPrimaryActions: ReadonlyArray<{
    readonly caseId: string;
    readonly legacyActionId: string;
  }>;
}

export interface OpportunityRelationParityProjection {
  readonly legacyOpportunityCount: number;
  readonly runtimeCaseStateCount: number;
  readonly relationViewCount: number;
  readonly mergedCount: number;
  readonly runtimeOnlyCount: number;
  readonly conflictCount: number;
  readonly lostOrClosedCount: number;
}

export interface ProcessParityProjection {
  readonly legacyProductRunCount: number;
  readonly pendingNegotiationCount: number;
  readonly processViewCount: number;
  readonly runningCount: number;
  readonly managerMutableCount: number;
  readonly negotiationPendingMigrationCount: number;
}

export interface ArchitectureParityProjection {
  readonly projectionKind: 'architecture_parity_projection';
  readonly source: 'legacy-game-state';
  readonly readOnly: true;
  readonly day: number;
  readonly status: ArchitectureParityStatus;
  readonly summary: {
    readonly activeCaseCount: number;
    readonly warnings: number;
  };
  readonly recommendationParity: RecommendationParityProjection;
  readonly opportunityRelationParity: OpportunityRelationParityProjection;
  readonly processParity: ProcessParityProjection;
  readonly warnings: readonly ArchitectureParityWarning[];
}

function activeCases(state: GameState) {
  return state.cases.filter((caseItem) => caseItem.status === 'active');
}

function runtimeCaseStateCount(state: GameState) {
  return (state.customerStates || []).reduce((sum, customerState) =>
    sum + Object.keys(customerState.caseStates || {}).length, 0);
}

function legacyProductRunCount(state: GameState) {
  return (state.productRuns || [])
    .filter((run) => run.productType === 'open-day' || run.productType === 'sincere-sale')
    .length;
}

function pendingNegotiationCount(state: GameState) {
  return (state.opportunities || []).filter((opportunity) => opportunity.pendingClosingEvaluation).length;
}

function buildRecommendationParity(state: GameState): {
  parity: RecommendationParityProjection;
  warnings: ArchitectureParityWarning[];
} {
  const legacyRecommendations = deriveCaseRecommendations(state);
  const decisionSupport = buildDecisionSupportWorkspaceProjection(state);
  const warnings: ArchitectureParityWarning[] = [];
  const draftsByCase = new Map(
    decisionSupport.cases.map((caseProjection) => [
      caseProjection.caseId,
      caseProjection.recommendationDrafts,
    ]),
  );

  const missingPrimaryActions = legacyRecommendations
    .filter((recommendation) => {
      const drafts = draftsByCase.get(recommendation.caseId) || [];
      return !drafts.some((draft) => draft.legacyActionId === recommendation.primaryAction.actionId);
    })
    .map((recommendation) => ({
      caseId: recommendation.caseId,
      legacyActionId: recommendation.primaryAction.actionId,
    }));

  missingPrimaryActions.forEach((entry) => {
    warnings.push({
      code: 'legacy_recommendation_primary_action_not_in_decision_support_drafts',
      message: `Legacy recommendation primary action ${entry.legacyActionId} is not represented in decision-support drafts.`,
      caseId: entry.caseId,
    });
  });

  const activeCaseCount = activeCases(state).length;
  if (decisionSupport.summary.caseCount !== activeCaseCount) {
    warnings.push({
      code: 'decision_support_case_count_mismatch',
      message: `Decision support covers ${decisionSupport.summary.caseCount} cases, expected ${activeCaseCount} active cases.`,
    });
  }

  return {
    parity: {
      legacyRecommendationCount: legacyRecommendations.length,
      decisionSupportCaseCount: decisionSupport.summary.caseCount,
      decisionSupportDraftCount: decisionSupport.summary.recommendationDraftCount,
      matchedPrimaryActionCount: legacyRecommendations.length - missingPrimaryActions.length,
      missingPrimaryActions,
    },
    warnings,
  };
}

function buildOpportunityRelationParity(state: GameState): {
  parity: OpportunityRelationParityProjection;
  warnings: ArchitectureParityWarning[];
} {
  const opportunityProjection = buildOpportunityRelationWorkspaceProjection(state);
  const warnings: ArchitectureParityWarning[] = [];
  const legacyOpportunityCount = (state.opportunities || []).length;
  const runtimeCount = runtimeCaseStateCount(state);

  if (opportunityProjection.summary.total < legacyOpportunityCount) {
    warnings.push({
      code: 'opportunity_relation_dropped_legacy_opportunity',
      message: `Opportunity relation view has ${opportunityProjection.summary.total} relations, below ${legacyOpportunityCount} legacy opportunities.`,
    });
  }
  if (opportunityProjection.summary.conflictCount > 0) {
    warnings.push({
      code: 'opportunity_relation_conflict_detected',
      message: `Opportunity relation view has ${opportunityProjection.summary.conflictCount} merged relation conflicts between legacy opportunities and customer runtime state.`,
    });
  }

  return {
    parity: {
      legacyOpportunityCount,
      runtimeCaseStateCount: runtimeCount,
      relationViewCount: opportunityProjection.summary.total,
      mergedCount: opportunityProjection.summary.merged,
      runtimeOnlyCount: opportunityProjection.summary.runtimeOnly,
      conflictCount: opportunityProjection.summary.conflictCount,
      lostOrClosedCount: opportunityProjection.summary.lostOrClosedCount,
    },
    warnings,
  };
}

function buildProcessParity(state: GameState): {
  parity: ProcessParityProjection;
  warnings: ArchitectureParityWarning[];
} {
  const processProjection = buildProcessWorkspaceProjection(state);
  const warnings: ArchitectureParityWarning[] = [];
  const productRunCount = legacyProductRunCount(state);
  const negotiationCount = pendingNegotiationCount(state);
  const expectedProcessCount = productRunCount + negotiationCount;

  if (processProjection.processes.length !== expectedProcessCount) {
    warnings.push({
      code: 'process_view_count_mismatch',
      message: `Process view has ${processProjection.processes.length} processes, expected ${expectedProcessCount}.`,
    });
  }

  const negotiationPendingMigrationCount = processProjection.processes.filter((process) =>
    process.processType === 'negotiation' && !process.transitionView.managerCanMutateNow).length;
  const mutableNegotiationCount = processProjection.processes.filter((process) =>
    process.processType === 'negotiation' && process.transitionView.managerCanMutateNow).length;

  if (mutableNegotiationCount > 0) {
    warnings.push({
      code: 'negotiation_process_manager_mutable_too_early',
      message: 'Negotiation process workspace projection exposed mutable transitions before settlement ownership migration.',
    });
  }

  return {
    parity: {
      legacyProductRunCount: productRunCount,
      pendingNegotiationCount: negotiationCount,
      processViewCount: processProjection.processes.length,
      runningCount: processProjection.runningCount,
      managerMutableCount: processProjection.managerMutableCount,
      negotiationPendingMigrationCount,
    },
    warnings,
  };
}

function statusForWarnings(warnings: readonly ArchitectureParityWarning[]): ArchitectureParityStatus {
  if (warnings.length === 0) return 'aligned';
  if (warnings.some((warning) => warning.code.endsWith('_mismatch') || warning.code.includes('dropped'))) {
    return 'gap';
  }
  return 'watch';
}

export function buildArchitectureParityProjection(state: GameState): ArchitectureParityProjection {
  const recommendation = buildRecommendationParity(state);
  const opportunityRelation = buildOpportunityRelationParity(state);
  const process = buildProcessParity(state);
  const warnings = [
    ...recommendation.warnings,
    ...opportunityRelation.warnings,
    ...process.warnings,
  ];

  return freezeProjection({
    projectionKind: 'architecture_parity_projection',
    source: 'legacy-game-state',
    readOnly: true,
    day: state.day,
    status: statusForWarnings(warnings),
    summary: {
      activeCaseCount: activeCases(state).length,
      warnings: warnings.length,
    },
    recommendationParity: recommendation.parity,
    opportunityRelationParity: opportunityRelation.parity,
    processParity: process.parity,
    warnings,
  }) as ArchitectureParityProjection;
}
