import type { GameState } from '../../domain/models.js';
import {
  buildProcessManagerContractsFromLegacyState,
  deriveProcessRunReadModelsFromLegacyState,
} from '../../runtime/simulation/processes/index.js';
import type {
  ProcessManagerContract,
  ProcessManagerType,
  ProcessRunReadModel,
} from '../../runtime/simulation/processes/types.js';
import { freezeProjection } from './readOnly.js';

type ProcessCountByType = Readonly<Record<ProcessManagerType, number>>;

export interface ProcessWorkspaceProjection {
  readonly projectionKind: 'process_workspace_projection';
  readonly source: 'runtime-simulation-processes';
  readonly readOnly: true;
  readonly day: number;
  readonly processCountsByType: ProcessCountByType;
  readonly runningCount: number;
  readonly managerMutableCount: number;
  readonly processes: readonly ProcessRunReadModel[];
  readonly contracts: readonly ProcessManagerContract[];
}

function emptyCounts(): Record<ProcessManagerType, number> {
  return {
    'open-day': 0,
    'sincerity-sale': 0,
    negotiation: 0,
  };
}

function isRunningProcess(process: ProcessRunReadModel): boolean {
  if (process.processType === 'negotiation') {
    return process.status === 'active';
  }

  return process.status === 'running';
}

export function buildProcessWorkspaceProjection(state: Readonly<GameState>): ProcessWorkspaceProjection {
  const processes = deriveProcessRunReadModelsFromLegacyState(state);
  const contracts = buildProcessManagerContractsFromLegacyState(state);
  const processCountsByType = processes.reduce<Record<ProcessManagerType, number>>((counts, process) => {
    counts[process.processType] += 1;
    return counts;
  }, emptyCounts());

  return freezeProjection({
    projectionKind: 'process_workspace_projection',
    source: 'runtime-simulation-processes',
    readOnly: true,
    day: state.day,
    processCountsByType,
    runningCount: processes.filter(isRunningProcess).length,
    managerMutableCount: processes.filter((process) => process.transitionView.managerCanMutateNow).length,
    processes,
    contracts,
  }) as ProcessWorkspaceProjection;
}
