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
  WorkspaceProjectionBoundaryKind,
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
  OpportunityRelationWorkspaceEntry,
  OpportunityRelationWorkspaceProjection,
  OpportunityRelationWorkspaceSummary,
} from './opportunityRelationBoundary.js';

export type {
  ProcessWorkspaceManagerContract,
  ProcessWorkspaceProjection,
  ProcessWorkspaceLifecycleMigrationPlan,
  ProcessWorkspaceReadModel,
} from './processWorkspaceBoundary.js';

export type {
  ProcessResultWorkspaceItem,
  ProcessResultWorkspaceProjection,
} from './processResultBoundary.js';

export type {
  DailyTickReceiptWorkspaceProjection,
} from './dailyTickReceiptBoundary.js';

export type {
  BuildEventStreamWorkspaceProjectionOptions,
  EventStreamWorkspaceProjection,
} from './eventStreamBoundary.js';

export type {
  BuildWorldForkWorkspaceProjectionOptions,
  WorldForkWorkspaceProjection,
} from './worldForkBoundary.js';

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
  buildProcessResultWorkspaceProjection,
} from './processResultBoundary.js';

export {
  buildDailyTickReceiptWorkspaceProjection,
} from './dailyTickReceiptBoundary.js';

export {
  buildEventStreamWorkspaceProjection,
} from './eventStreamBoundary.js';

export {
  buildWorldForkWorkspaceProjection,
} from './worldForkBoundary.js';

export {
  buildBrokerWorkspaceView,
  buildManagerWorkspaceView,
  buildOwnerWorkspaceView,
} from './workspaceAdapters.js';
