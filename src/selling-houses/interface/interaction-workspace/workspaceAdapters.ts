import type { GameState } from '../../domain/models.js';
import { buildMatterWorkspaceProjection } from './matterBoundary.js';
import { freezeProjection } from './readOnly.js';
import { buildTodayPlanWorkspaceProjection } from './todayPlanBoundary.js';
import type {
  BrokerWorkspaceView,
  ManagerWorkspaceView,
  OwnerWorkspaceView,
  WorkspaceProjectionMeta,
  WorkspacePovProjection,
  WorkspaceRole,
} from './types.js';

function isActiveCase(entry: GameState['cases'][number]) {
  return entry.status === 'active';
}

function isActiveOpportunity(entry: GameState['opportunities'][number]) {
  return entry.status === 'active';
}

function buildMeta(state: GameState, role: WorkspaceRole): WorkspaceProjectionMeta {
  return {
    role,
    day: state.day,
    currentDate: state.currentDate,
    source: 'legacy-game-state',
    sourceRevision: state.localRevision,
    readOnly: true,
  };
}

function buildPovProjection(state: GameState, role: WorkspaceRole): WorkspacePovProjection {
  const todayItems = state.todayPlan?.day === state.day ? state.todayPlan.playerItems : [];
  const activeCaseCount = state.cases.filter(isActiveCase).length;
  const activeOpportunityCount = state.opportunities.filter(isActiveOpportunity).length;
  const pendingMatterCount = state.matters.filter((entry) => entry.stage !== 'completed' && entry.stage !== 'abandoned').length;
  const plannedInteractionCount = todayItems.filter((entry) => entry.status === 'planned').length;
  const completedInteractionCount = todayItems.filter((entry) => entry.status === 'completed').length;
  const roleLabel = role === 'broker' ? '经纪人' : role === 'owner' ? '业主' : '经理';

  return {
    projectionKind: 'pov_adapter_state',
    actor: role,
    headline: `${roleLabel}工作台`,
    summary: `${activeCaseCount} 套在场，${pendingMatterCount} 件待处理。`,
    activeCaseCount,
    activeOpportunityCount,
    pendingMatterCount,
    plannedInteractionCount,
    completedInteractionCount,
  };
}

export function buildBrokerWorkspaceView(state: GameState): BrokerWorkspaceView {
  return freezeProjection({
    projectionKind: 'workspace_view',
    meta: buildMeta(state, 'broker'),
    pov: buildPovProjection(state, 'broker'),
    todayPlan: buildTodayPlanWorkspaceProjection(state),
    matters: buildMatterWorkspaceProjection(state),
  }) as BrokerWorkspaceView;
}

export function buildOwnerWorkspaceView(state: GameState): OwnerWorkspaceView {
  const pov = buildPovProjection(state, 'owner');
  const todayItems = state.todayPlan?.day === state.day ? state.todayPlan.playerItems : [];

  return freezeProjection({
    projectionKind: 'workspace_view',
    meta: buildMeta(state, 'owner'),
    pov,
    ownerReadableSummary: {
      activeListingCount: pov.activeCaseCount,
      needsOwnerResponseCount: state.matters.filter((entry) => (
        entry.stage !== 'completed'
        && entry.stage !== 'abandoned'
        && entry.scene === 'report_to_owner'
      )).length,
      completedTodayCount: todayItems.filter((entry) => entry.status === 'completed').length,
    },
  }) as OwnerWorkspaceView;
}

export function buildManagerWorkspaceView(state: GameState): ManagerWorkspaceView {
  const pov = buildPovProjection(state, 'manager');

  return freezeProjection({
    projectionKind: 'workspace_view',
    meta: buildMeta(state, 'manager'),
    pov,
    operatingSummary: {
      activeCaseCount: pov.activeCaseCount,
      activeOpportunityCount: pov.activeOpportunityCount,
      pendingMatterCount: pov.pendingMatterCount,
      plannedTodayCount: pov.plannedInteractionCount,
    },
  }) as ManagerWorkspaceView;
}
