export type {
  BrokerWorkspaceView,
  ManagerWorkspaceView,
  MatterProjectionState,
  MatterWorkspaceItem,
  MatterWorkspaceProjection,
  OwnerWorkspaceView,
  TodayPlanCapacityProjection,
  TodayPlanWorkspaceItem,
  TodayPlanWorkspaceProjection,
  TodayPlanWorldTruthKind,
  WorkspaceItemTone,
  WorkspacePovProjection,
  WorkspaceProjectionKind,
  WorkspaceProjectionMeta,
  WorkspaceProjectionSource,
  WorkspaceRole,
} from './types.js';

export type {
  DecisionSupportWorkspaceCaseProjection,
  DecisionSupportWorkspaceDecisionMomentSummary,
  DecisionSupportWorkspaceDecisionSupportSummary,
  DecisionSupportWorkspaceDraftAggregate,
  DecisionSupportWorkspaceProjection,
  DecisionSupportWorkspaceProjectionKind,
  DecisionSupportWorkspaceRecommendationDraftSummary,
  DecisionSupportWorkspaceSignalAggregate,
  DecisionSupportWorkspaceSignalSummary,
  DecisionSupportWorkspaceSummary,
} from './decisionSupportBoundary.js';

export type {
  OpportunityRelationWorkspaceProjection,
  OpportunityRelationWorkspaceSummary,
} from './opportunityRelationBoundary.js';

export type {
  ProcessWorkspaceProjection,
  ProcessWorkspaceLifecycleMigrationPlan,
} from './processWorkspaceBoundary.js';

export {
  buildMatterWorkspaceProjection,
} from './matterBoundary.js';

export {
  buildTodayPlanWorkspaceProjection,
} from './todayPlanBoundary.js';

export {
  buildDecisionSupportWorkspaceProjection,
} from './decisionSupportBoundary.js';

export {
  buildOpportunityRelationWorkspaceProjection,
} from './opportunityRelationBoundary.js';

export {
  buildProcessWorkspaceProjection,
} from './processWorkspaceBoundary.js';

export {
  buildBrokerWorkspaceView,
  buildManagerWorkspaceView,
  buildOwnerWorkspaceView,
} from './workspaceAdapters.js';
