import type { GameState } from '../../../domain/models.js';
import {
  buildProcessManagerContractsFromLegacyState,
  deriveProcessRunReadModelsFromLegacyState,
} from './legacyAdapters.js';
import type {
  ProcessLifecycleOwner,
  ProcessLifecycleSource,
  ProcessManagerType,
} from './types.js';

export type ProcessLifecycleMigrationReadiness = 'ready' | 'watch' | 'blocked';

export type ProcessLifecycleMigrationStepId =
  | 'read-model-boundary'
  | 'action-entry-boundary'
  | 'transition-facade'
  | 'settlement-facade'
  | 'transition-owner'
  | 'outcome-owner';

export type ProcessLifecycleMigrationStepStatus = 'done' | 'pending';

export interface ProcessLifecycleMigrationStep {
  readonly stepId: ProcessLifecycleMigrationStepId;
  readonly title: string;
  readonly status: ProcessLifecycleMigrationStepStatus;
  readonly currentOwner: ProcessLifecycleOwner;
  readonly targetOwner: 'runtime-process-manager';
  readonly evidence: readonly string[];
  readonly blockingReason?: string;
}

export interface ProcessLifecycleMigrationPlanItem {
  readonly processType: ProcessManagerType;
  readonly displayName: string;
  readonly currentOwner: ProcessLifecycleSource;
  readonly targetOwner: 'runtime-process-manager';
  readonly activeProcessCount: number;
  readonly transitionCount: number;
  readonly managerMutableTransitionCount: number;
  readonly readiness: ProcessLifecycleMigrationReadiness;
  readonly completedStepCount: number;
  readonly pendingStepCount: number;
  readonly steps: readonly ProcessLifecycleMigrationStep[];
}

export interface ProcessLifecycleMigrationPlan {
  readonly source: 'runtime-simulation-processes';
  readonly readOnly: true;
  readonly processCount: number;
  readonly activeProcessCount: number;
  readonly readyProcessCount: number;
  readonly watchProcessCount: number;
  readonly blockedProcessCount: number;
  readonly items: readonly ProcessLifecycleMigrationPlanItem[];
}

const PROCESS_ENTRY_EVIDENCE: Record<ProcessManagerType, readonly string[]> = {
  'open-day': Object.freeze([
    'OPEN_DAY_ACTION_EXECUTORS owns the action entry',
    'startActionProductRunIfNeeded centralizes open-day ProductRun creation',
  ]),
  'sincerity-sale': Object.freeze([
    'SINCERITY_SALE_ACTION_EXECUTORS owns the action entry',
    'startActionProductRunIfNeeded centralizes sincere-sale ProductRun creation',
  ]),
  negotiation: Object.freeze([
    'NEGOTIATION_ACTION_EXECUTORS owns the action entry',
    'queueNegotiationProcessEvaluation centralizes pending close entry',
  ]),
};

function freezeArray<T>(items: T[]) {
  return Object.freeze(items);
}

function buildSteps(
  processType: ProcessManagerType,
  currentOwner: ProcessLifecycleSource,
  transitionCount: number,
): readonly ProcessLifecycleMigrationStep[] {
  const productRunProcess = processType === 'open-day' || processType === 'sincerity-sale';
  const readModelStep = Object.freeze({
    stepId: 'read-model-boundary',
    title: 'Read-model boundary',
    status: 'done',
    currentOwner,
    targetOwner: 'runtime-process-manager',
    evidence: Object.freeze([
      'deriveProcessRunReadModelsFromLegacyState maps legacy lifecycle state',
      'buildProcessManagerContractsFromLegacyState publishes read-only contracts',
    ]),
  } satisfies ProcessLifecycleMigrationStep);

  const actionEntryStep = Object.freeze({
    stepId: 'action-entry-boundary',
    title: 'Action entry boundary',
    status: 'done',
    currentOwner,
    targetOwner: 'runtime-process-manager',
    evidence: PROCESS_ENTRY_EVIDENCE[processType],
  } satisfies ProcessLifecycleMigrationStep);

  const transitionOwnerStep = Object.freeze({
    stepId: 'transition-owner',
    title: 'Transition ownership',
    status: productRunProcess ? 'done' : 'pending',
    currentOwner: productRunProcess ? 'runtime-process-manager' : currentOwner,
    targetOwner: 'runtime-process-manager',
    evidence: productRunProcess
      ? Object.freeze([
        'ProductRunProcessManager owns open-day and sincerity-sale milestone movement',
        `${transitionCount} product run transition view(s) report runtime-process-manager as nextTransitionOwner`,
      ])
      : Object.freeze([
        `${transitionCount} negotiation transition view(s) still report managerCanMutateNow=false`,
      ]),
    blockingReason: productRunProcess
      ? undefined
      : 'Runtime process manager does not own negotiation lifecycle transitions yet.',
  } satisfies ProcessLifecycleMigrationStep);

  const steps = new Array<ProcessLifecycleMigrationStep>(readModelStep, actionEntryStep, transitionOwnerStep);

  if (processType === 'open-day' || processType === 'sincerity-sale') {
    steps.splice(2, 0, Object.freeze({
      stepId: 'transition-facade',
      title: 'Transition facade',
      status: 'done',
      currentOwner,
      targetOwner: 'runtime-process-manager',
      evidence: Object.freeze([
        'advanceProductRunProcessesForDay owns product run transition orchestration',
        'ProductRunProcessManager records transition journal events and linkedEventIds',
      ]),
    } satisfies ProcessLifecycleMigrationStep));
  }

  if (processType === 'negotiation') {
    steps.splice(2, 0, Object.freeze({
      stepId: 'settlement-facade',
      title: 'Settlement facade',
      status: 'done',
      currentOwner,
      targetOwner: 'runtime-process-manager',
      evidence: Object.freeze([
        'settleNegotiationProcessesForDay owns daily settlement entry orchestration',
        'NegotiationProcessManager records pending/resolved opportunity ids while legacy deal closing owns outcomes',
      ]),
    } satisfies ProcessLifecycleMigrationStep));

    steps.push(Object.freeze({
      stepId: 'outcome-owner',
      title: 'Outcome ownership',
      status: 'pending',
      currentOwner,
      targetOwner: 'runtime-process-manager',
      evidence: Object.freeze([
        'settlePendingDealClosings still owns close/fail/capacity outcomes',
      ]),
      blockingReason: 'Negotiation outcome resolution must stay in the legacy deal closing engine until a process manager owns settlement.',
    } satisfies ProcessLifecycleMigrationStep));
  }

  return freezeArray(steps);
}

function readinessForSteps(steps: readonly ProcessLifecycleMigrationStep[]): ProcessLifecycleMigrationReadiness {
  if (!steps.some((step) => step.status === 'done')) return 'blocked';
  if (steps.some((step) => step.status === 'pending')) return 'watch';
  return 'ready';
}

export function buildProcessLifecycleMigrationPlan(
  state: Readonly<GameState>,
): ProcessLifecycleMigrationPlan {
  const readModels = deriveProcessRunReadModelsFromLegacyState(state);
  const contracts = buildProcessManagerContractsFromLegacyState(state);

  const items = freezeArray(contracts.map((contract) => {
    const activeProcessCount = readModels.filter((process) => process.processType === contract.processType).length;
    const managerMutableTransitionCount = contract.transitions.filter((transition) => transition.managerCanMutateNow).length;
    const steps = buildSteps(contract.processType, contract.lifecycleOwnership.currentOwner, contract.transitions.length);
    const completedStepCount = steps.filter((step) => step.status === 'done').length;
    const pendingStepCount = steps.filter((step) => step.status === 'pending').length;

    return Object.freeze({
      processType: contract.processType,
      displayName: contract.displayName,
      currentOwner: contract.lifecycleOwnership.currentOwner,
      targetOwner: contract.lifecycleOwnership.futureOwner,
      activeProcessCount,
      transitionCount: contract.transitions.length,
      managerMutableTransitionCount,
      readiness: readinessForSteps(steps),
      completedStepCount,
      pendingStepCount,
      steps,
    } satisfies ProcessLifecycleMigrationPlanItem);
  }));

  return Object.freeze({
    source: 'runtime-simulation-processes',
    readOnly: true,
    processCount: items.length,
    activeProcessCount: items.reduce((sum, item) => sum + item.activeProcessCount, 0),
    readyProcessCount: items.filter((item) => item.readiness === 'ready').length,
    watchProcessCount: items.filter((item) => item.readiness === 'watch').length,
    blockedProcessCount: items.filter((item) => item.readiness === 'blocked').length,
    items,
  } satisfies ProcessLifecycleMigrationPlan);
}
