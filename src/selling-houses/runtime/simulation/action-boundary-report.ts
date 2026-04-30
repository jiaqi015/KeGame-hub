import { ACTIONS } from '../../domain/constants.js';
import {
  ACTION_EXECUTOR_CONTRACTS,
  getActionExecutorContract,
  type ActionExecutorContract,
  type ActionExecutorProcessKind,
} from '../../domain/engine/actionExecutorContract.js';

export type RuntimeActionBoundaryProcessKind = ActionExecutorProcessKind | 'none';

export type RuntimeActionBoundaryReportEntry = {
  actionId: string;
  executorId: string;
  actionName: string;
  processKind: RuntimeActionBoundaryProcessKind;
  touchesOwner: boolean;
  revealsOwnerState: boolean;
  opportunityBound: boolean;
  startsProcess: boolean;
  legacyExecutorOwnsProcessRun: boolean;
  queuesPendingClosingEvaluation: boolean;
  resourcesManagedByTransaction: boolean;
};

export type RuntimeActionBoundaryReportSummary = {
  actionCount: number;
  contractCount: number;
  ownerTouchActionCount: number;
  opportunityBoundActionCount: number;
  processStartingActionCount: number;
  legacyProcessOwnedActionCount: number;
  transactionManagedCount: number;
};

export type RuntimeActionBoundaryReportByProcessKind = Record<
  RuntimeActionBoundaryProcessKind,
  readonly RuntimeActionBoundaryReportEntry[]
>;

export type RuntimeActionBoundaryMigrationReadiness = {
  executorWrapperReadyActionIds: readonly string[];
  waitForProcessManager: {
    allActionIds: readonly string[];
    openDayActionIds: readonly string[];
    sincereSaleActionIds: readonly string[];
    negotiationActionIds: readonly string[];
  };
};

export type RuntimeActionBoundaryReport = RuntimeActionBoundaryReportSummary & {
  source: 'action-executor-contracts';
  resourcesBoundary: 'actionTransaction';
  actions: readonly RuntimeActionBoundaryReportEntry[];
  actionsById: Readonly<Record<string, RuntimeActionBoundaryReportEntry>>;
  byProcessKind: RuntimeActionBoundaryReportByProcessKind;
  summary: RuntimeActionBoundaryReportSummary;
  migrationReadiness: RuntimeActionBoundaryMigrationReadiness;
  missingActionIds: readonly string[];
  ownerTouchActionIds: readonly string[];
  opportunityBoundActionIds: readonly string[];
  processStartingActionIds: readonly string[];
  legacyProcessOwnedActionIds: readonly string[];
  transactionManagedActionIds: readonly string[];
};

function freezeArray<T>(items: T[]) {
  return Object.freeze(items);
}

function mapContractToReportEntry(contract: ActionExecutorContract): RuntimeActionBoundaryReportEntry {
  const processKind = contract.startsProcessKind ?? 'none';

  return Object.freeze({
    actionId: contract.actionId,
    executorId: contract.executorId,
    actionName: contract.actionName,
    processKind,
    touchesOwner: contract.touchesOwner,
    revealsOwnerState: contract.revealsOwnerState,
    opportunityBound: contract.opportunityBound,
    startsProcess: processKind !== 'none',
    legacyExecutorOwnsProcessRun: contract.legacyExecutorOwnsProcessRun,
    queuesPendingClosingEvaluation: contract.queuesPendingClosingEvaluation,
    resourcesManagedByTransaction: contract.resourcesManagedByTransaction,
  } satisfies RuntimeActionBoundaryReportEntry);
}

function actionIds(entries: readonly RuntimeActionBoundaryReportEntry[]) {
  return entries.map((entry) => entry.actionId);
}

export function buildActionBoundaryReport(): RuntimeActionBoundaryReport {
  const actions = freezeArray(
    ACTIONS
      .map((action) => getActionExecutorContract(action.id))
      .filter((entry): entry is ActionExecutorContract => Boolean(entry))
      .map(mapContractToReportEntry),
  );
  const actionsById = Object.freeze(
    Object.fromEntries(actions.map((entry) => [entry.actionId, entry])),
  ) as Readonly<Record<string, RuntimeActionBoundaryReportEntry>>;
  const missingActionIds = freezeArray(
    ACTIONS
      .map((action) => action.id)
      .filter((actionId) => !actionsById[actionId]),
  );

  const byProcessKind = Object.freeze({
    'open-day': freezeArray(actions.filter((entry) => entry.processKind === 'open-day')),
    'sincere-sale': freezeArray(actions.filter((entry) => entry.processKind === 'sincere-sale')),
    negotiation: freezeArray(actions.filter((entry) => entry.processKind === 'negotiation')),
    none: freezeArray(actions.filter((entry) => entry.processKind === 'none')),
  } satisfies RuntimeActionBoundaryReportByProcessKind);

  const ownerTouchActionIds = freezeArray(actionIds(actions.filter((entry) => entry.touchesOwner)));
  const opportunityBoundActionIds = freezeArray(actionIds(actions.filter((entry) => entry.opportunityBound)));
  const processStartingActionIds = freezeArray(actionIds(actions.filter((entry) => entry.startsProcess)));
  const legacyProcessOwnedActionIds = freezeArray(actionIds(actions.filter((entry) => entry.legacyExecutorOwnsProcessRun)));
  const transactionManagedActionIds = freezeArray(actionIds(actions.filter((entry) => entry.resourcesManagedByTransaction)));

  const summary = Object.freeze({
    actionCount: ACTIONS.length,
    contractCount: ACTION_EXECUTOR_CONTRACTS.length,
    ownerTouchActionCount: ownerTouchActionIds.length,
    opportunityBoundActionCount: opportunityBoundActionIds.length,
    processStartingActionCount: processStartingActionIds.length,
    legacyProcessOwnedActionCount: legacyProcessOwnedActionIds.length,
    transactionManagedCount: transactionManagedActionIds.length,
  } satisfies RuntimeActionBoundaryReportSummary);

  const migrationReadiness = Object.freeze({
    executorWrapperReadyActionIds: freezeArray(actionIds(byProcessKind.none)),
    waitForProcessManager: Object.freeze({
      allActionIds: processStartingActionIds,
      openDayActionIds: freezeArray(actionIds(byProcessKind['open-day'])),
      sincereSaleActionIds: freezeArray(actionIds(byProcessKind['sincere-sale'])),
      negotiationActionIds: freezeArray(actionIds(byProcessKind.negotiation)),
    }),
  } satisfies RuntimeActionBoundaryMigrationReadiness);

  return Object.freeze({
    source: 'action-executor-contracts',
    resourcesBoundary: 'actionTransaction',
    actionCount: summary.actionCount,
    contractCount: summary.contractCount,
    ownerTouchActionCount: summary.ownerTouchActionCount,
    opportunityBoundActionCount: summary.opportunityBoundActionCount,
    processStartingActionCount: summary.processStartingActionCount,
    legacyProcessOwnedActionCount: summary.legacyProcessOwnedActionCount,
    transactionManagedCount: summary.transactionManagedCount,
    actions,
    actionsById,
    byProcessKind,
    summary,
    migrationReadiness,
    missingActionIds,
    ownerTouchActionIds,
    opportunityBoundActionIds,
    processStartingActionIds,
    legacyProcessOwnedActionIds,
    transactionManagedActionIds,
  } satisfies RuntimeActionBoundaryReport);
}

export const ACTION_BOUNDARY_REPORT = buildActionBoundaryReport();
