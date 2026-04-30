import type {
  MatterLifecycleCategory,
  MatterPresentation,
  MatterScene,
  MatterSource,
  MatterStage,
  MatterTemplate,
  TodayArrangementExecutionMode,
  TodayArrangementSlot,
} from '../../domain/models.js';
import type { ReadonlyDeep } from './readOnly.js';

export type WorkspaceRole = 'broker' | 'owner' | 'manager';
export type WorkspaceProjectionSource = 'legacy-game-state';
export type WorkspaceProjectionKind =
  | 'workspace_view'
  | 'pov_adapter_state'
  | 'today_plan_adapter_state'
  | 'matter_adapter_state';

export type WorkspaceItemTone = 'neutral' | 'chance' | 'risk';

export interface WorkspaceProjectionMeta {
  readonly role: WorkspaceRole;
  readonly day: number;
  readonly currentDate: string;
  readonly source: WorkspaceProjectionSource;
  readonly sourceRevision?: number;
  readonly readOnly: true;
}

export interface WorkspacePovProjection {
  readonly projectionKind: 'pov_adapter_state';
  readonly actor: WorkspaceRole;
  readonly headline: string;
  readonly summary: string;
  readonly activeCaseCount: number;
  readonly activeOpportunityCount: number;
  readonly pendingMatterCount: number;
  readonly plannedInteractionCount: number;
  readonly completedInteractionCount: number;
}

export type TodayPlanWorldTruthKind = 'schedule_truth' | 'capacity_truth' | 'player_intent';

export interface TodayPlanWorkspaceItem {
  readonly id: string;
  readonly worldTruthKind: TodayPlanWorldTruthKind;
  readonly title: string;
  readonly detail: string;
  readonly status: 'fixed' | 'planned' | 'completed';
  readonly slot?: TodayArrangementSlot;
  readonly caseId?: string;
  readonly matterId?: string;
  readonly actionId?: string;
  readonly customerId?: string;
  readonly opportunityId?: string;
  readonly executionMode?: TodayArrangementExecutionMode;
  readonly durationHours: number;
  readonly energyCost: number;
  readonly sourceDay: number;
}

export interface TodayPlanCapacityProjection {
  readonly worldTruthKind: 'capacity_truth';
  readonly remainingEnergy: number;
  readonly plannedEnergy: number;
  readonly fixedEnergyReserve: number;
  readonly slots: Readonly<Record<TodayArrangementSlot, {
    readonly remainingHours: number;
  }>>;
}

export interface TodayPlanWorkspaceProjection {
  readonly projectionKind: 'today_plan_adapter_state';
  readonly day: number;
  readonly capacity: TodayPlanCapacityProjection;
  readonly fixedWorldItems: readonly TodayPlanWorkspaceItem[];
  readonly plannedInteractionItems: readonly TodayPlanWorkspaceItem[];
  readonly completedInteractionItems: readonly TodayPlanWorkspaceItem[];
}

export type MatterProjectionState = 'open' | 'resolved';

export interface MatterWorkspaceItem {
  readonly projectionKind: 'matter_adapter_state';
  readonly domainMatterId: string;
  readonly domainSource: MatterSource;
  readonly domainSourceKey: string;
  readonly domainStage: MatterStage;
  readonly projectionState: MatterProjectionState;
  readonly caseId?: string;
  readonly scene: MatterScene;
  readonly lifecycleCategory: MatterLifecycleCategory;
  readonly title: string;
  readonly detail: string;
  readonly badge?: string;
  readonly template: ReadonlyDeep<MatterTemplate>;
  readonly presentation: ReadonlyDeep<MatterPresentation>;
  readonly kind?: 'case' | 'opportunity';
  readonly urgency: number;
  readonly openedAtDay: number;
  readonly updatedAtDay?: number;
  readonly resolvedAtDay?: number;
  readonly resolutionSummary?: string;
  readonly tone: WorkspaceItemTone;
}

export interface MatterWorkspaceProjection {
  readonly projectionKind: 'matter_adapter_state';
  readonly day: number;
  readonly pendingItems: readonly MatterWorkspaceItem[];
  readonly resolvedItems: readonly MatterWorkspaceItem[];
  readonly counts: {
    readonly pending: number;
    readonly resolved: number;
    readonly byLifecycle: Readonly<Record<MatterLifecycleCategory, number>>;
  };
}

export interface BrokerWorkspaceView {
  readonly projectionKind: 'workspace_view';
  readonly meta: WorkspaceProjectionMeta & { readonly role: 'broker' };
  readonly pov: WorkspacePovProjection & { readonly actor: 'broker' };
  readonly todayPlan: TodayPlanWorkspaceProjection;
  readonly matters: MatterWorkspaceProjection;
}

export interface OwnerWorkspaceView {
  readonly projectionKind: 'workspace_view';
  readonly meta: WorkspaceProjectionMeta & { readonly role: 'owner' };
  readonly pov: WorkspacePovProjection & { readonly actor: 'owner' };
  readonly ownerReadableSummary: {
    readonly activeListingCount: number;
    readonly needsOwnerResponseCount: number;
    readonly completedTodayCount: number;
  };
}

export interface ManagerWorkspaceView {
  readonly projectionKind: 'workspace_view';
  readonly meta: WorkspaceProjectionMeta & { readonly role: 'manager' };
  readonly pov: WorkspacePovProjection & { readonly actor: 'manager' };
  readonly operatingSummary: {
    readonly activeCaseCount: number;
    readonly activeOpportunityCount: number;
    readonly pendingMatterCount: number;
    readonly plannedTodayCount: number;
  };
}
