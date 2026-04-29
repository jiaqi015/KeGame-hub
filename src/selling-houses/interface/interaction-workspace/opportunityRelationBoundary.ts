import { buildCustomerCaseOpportunityRelationView } from '../../core/world-state/opportunity-relations/readModel.js';
import type { CustomerCaseOpportunityRelationView } from '../../core/world-state/opportunity-relations/types.js';
import type { GameState } from '../../domain/models.js';
import { freezeProjection } from './readOnly.js';

export interface OpportunityRelationWorkspaceSummary {
  readonly total: number;
  readonly merged: number;
  readonly opportunityOnly: number;
  readonly runtimeOnly: number;
  readonly conflictCount: number;
  readonly activeCount: number;
  readonly lostOrClosedCount: number;
}

export interface OpportunityRelationWorkspaceProjection {
  readonly projectionKind: 'opportunity_relation_adapter_state';
  readonly source: 'legacy-game-state';
  readonly readOnly: true;
  readonly day: number;
  readonly summary: OpportunityRelationWorkspaceSummary;
  readonly relations: readonly CustomerCaseOpportunityRelationView[];
}

function hasConflict(relation: CustomerCaseOpportunityRelationView) {
  return Object.values(relation.conflictFlags).some(Boolean);
}

function isLostOrClosedRelation(relation: CustomerCaseOpportunityRelationView) {
  const status = relation.legacyOpportunity?.status;
  const lifecycleStatus = relation.legacyOpportunity?.lifecycleStatus;
  return status === 'lost'
    || status === 'closed'
    || lifecycleStatus === 'lost'
    || lifecycleStatus === 'closed_by_deal'
    || lifecycleStatus === 'closed_by_case';
}

function isActiveRelation(relation: CustomerCaseOpportunityRelationView) {
  if (isLostOrClosedRelation(relation)) return false;
  if (relation.legacyOpportunity) {
    return relation.legacyOpportunity.status === 'active'
      || relation.legacyOpportunity.lifecycleStatus === 'active';
  }
  return relation.customerRuntime?.active === true;
}

function buildSummary(relations: readonly CustomerCaseOpportunityRelationView[]): OpportunityRelationWorkspaceSummary {
  return {
    total: relations.length,
    merged: relations.filter((entry) => entry.source === 'merged').length,
    opportunityOnly: relations.filter((entry) => entry.source === 'opportunity').length,
    runtimeOnly: relations.filter((entry) => entry.source === 'customer-runtime').length,
    conflictCount: relations.filter(hasConflict).length,
    activeCount: relations.filter(isActiveRelation).length,
    lostOrClosedCount: relations.filter(isLostOrClosedRelation).length,
  };
}

export function buildOpportunityRelationWorkspaceProjection(state: GameState): OpportunityRelationWorkspaceProjection {
  const relations = buildCustomerCaseOpportunityRelationView(state);

  return freezeProjection({
    projectionKind: 'opportunity_relation_adapter_state',
    source: 'legacy-game-state',
    readOnly: true,
    day: state.day,
    summary: buildSummary(relations),
    relations,
  }) as OpportunityRelationWorkspaceProjection;
}
