import {
  ACTION_BOUNDARY_REPORT,
  buildActionBoundaryReport,
  type RuntimeActionBoundaryProcessKind,
  type RuntimeActionBoundaryReport,
  type RuntimeActionBoundaryReportEntry,
} from './action-boundary-report.js';

type ProcessManagerRequiredKind = Exclude<RuntimeActionBoundaryProcessKind, 'none'>;

export type ActionMigrationPlanQueueItem = Readonly<{
  actionId: string;
  executorId: string;
  actionName: string;
  processKind: RuntimeActionBoundaryProcessKind;
  resourcesManagedByTransaction: boolean;
  touchesOwner: boolean;
  revealsOwnerState: boolean;
  opportunityBound: boolean;
  queuesPendingClosingEvaluation: boolean;
  legacyExecutorOwnsProcessRun: boolean;
}>;

export type ActionMigrationPlanRiskNote = Readonly<{
  actionId: string;
  executorId: string;
  actionName: string;
  processKind: ProcessManagerRequiredKind;
  note: string;
}>;

export type ActionMigrationPlanProcessGroups = Readonly<Record<
  ProcessManagerRequiredKind | 'all',
  readonly ActionMigrationPlanQueueItem[]
>>;

export type ActionMigrationPlanSummary = Readonly<{
  immediateWrapperCandidateCount: number;
  processManagerRequiredCount: number;
  ownerRelationTouchpointCount: number;
  opportunityAuthorityTouchpointCount: number;
  riskNoteCount: number;
}>;

export type ActionMigrationPlan = Readonly<{
  source: 'runtime-action-boundary-report';
  resourcesBoundary: RuntimeActionBoundaryReport['resourcesBoundary'];
  missingActionIds: readonly string[];
  immediateWrapperCandidates: readonly ActionMigrationPlanQueueItem[];
  processManagerRequired: ActionMigrationPlanProcessGroups;
  ownerRelationTouchpoints: readonly ActionMigrationPlanQueueItem[];
  opportunityAuthorityTouchpoints: readonly ActionMigrationPlanQueueItem[];
  riskNotes: readonly ActionMigrationPlanRiskNote[];
  summary: ActionMigrationPlanSummary;
}>;

function freezeArray<T>(items: T[]) {
  return Object.freeze(items);
}

function cloneQueueItem(entry: RuntimeActionBoundaryReportEntry): ActionMigrationPlanQueueItem {
  return Object.freeze({
    actionId: entry.actionId,
    executorId: entry.executorId,
    actionName: entry.actionName,
    processKind: entry.processKind,
    resourcesManagedByTransaction: entry.resourcesManagedByTransaction,
    touchesOwner: entry.touchesOwner,
    revealsOwnerState: entry.revealsOwnerState,
    opportunityBound: entry.opportunityBound,
    queuesPendingClosingEvaluation: entry.queuesPendingClosingEvaluation,
    legacyExecutorOwnsProcessRun: entry.legacyExecutorOwnsProcessRun,
  } satisfies ActionMigrationPlanQueueItem);
}

function buildRiskNote(entry: RuntimeActionBoundaryReportEntry): ActionMigrationPlanRiskNote {
  return Object.freeze({
    actionId: entry.actionId,
    executorId: entry.executorId,
    actionName: entry.actionName,
    processKind: entry.processKind as ProcessManagerRequiredKind,
    note: `${entry.actionId}: legacy executor still owns process run lifecycle; move lifecycle ownership to a ${entry.processKind} process manager before changing run transitions.`,
  } satisfies ActionMigrationPlanRiskNote);
}

function queueItems(
  report: RuntimeActionBoundaryReport,
  predicate: (entry: RuntimeActionBoundaryReportEntry) => boolean,
) {
  return freezeArray(report.actions.filter(predicate).map(cloneQueueItem));
}

export function buildActionMigrationPlan(
  report: RuntimeActionBoundaryReport = buildActionBoundaryReport(),
): ActionMigrationPlan {
  const immediateWrapperCandidates = queueItems(
    report,
    (entry) => entry.resourcesManagedByTransaction && entry.processKind === 'none',
  );
  const processManagerRequiredAll = queueItems(report, (entry) => entry.startsProcess);
  const processManagerRequired = Object.freeze({
    all: processManagerRequiredAll,
    'open-day': freezeArray(processManagerRequiredAll.filter((entry) => entry.processKind === 'open-day')),
    'sincere-sale': freezeArray(processManagerRequiredAll.filter((entry) => entry.processKind === 'sincere-sale')),
    negotiation: freezeArray(processManagerRequiredAll.filter((entry) => entry.processKind === 'negotiation')),
  } satisfies ActionMigrationPlanProcessGroups);
  const ownerRelationTouchpoints = queueItems(
    report,
    (entry) => entry.touchesOwner || entry.revealsOwnerState,
  );
  const opportunityAuthorityTouchpoints = queueItems(
    report,
    (entry) => entry.opportunityBound || entry.queuesPendingClosingEvaluation,
  );
  const riskNotes = freezeArray(
    report.actions
      .filter((entry) => entry.legacyExecutorOwnsProcessRun)
      .map(buildRiskNote),
  );
  const summary = Object.freeze({
    immediateWrapperCandidateCount: immediateWrapperCandidates.length,
    processManagerRequiredCount: processManagerRequired.all.length,
    ownerRelationTouchpointCount: ownerRelationTouchpoints.length,
    opportunityAuthorityTouchpointCount: opportunityAuthorityTouchpoints.length,
    riskNoteCount: riskNotes.length,
  } satisfies ActionMigrationPlanSummary);

  return Object.freeze({
    source: 'runtime-action-boundary-report',
    resourcesBoundary: report.resourcesBoundary,
    missingActionIds: freezeArray([...report.missingActionIds]),
    immediateWrapperCandidates,
    processManagerRequired,
    ownerRelationTouchpoints,
    opportunityAuthorityTouchpoints,
    riskNotes,
    summary,
  } satisfies ActionMigrationPlan);
}

export const ACTION_MIGRATION_PLAN = buildActionMigrationPlan(ACTION_BOUNDARY_REPORT);
