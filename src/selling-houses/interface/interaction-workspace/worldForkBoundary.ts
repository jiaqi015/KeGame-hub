import type { GameState } from '../../domain/models.js';
import {
  createCounterfactualWorldFork,
  type CreateCounterfactualWorldForkOptions,
  type WorldForkReceipt,
} from '../../runtime/decision-support/index.js';
import { freezeProjection, type ReadonlyDeep } from './readOnly.js';

export type BuildWorldForkWorkspaceProjectionOptions = CreateCounterfactualWorldForkOptions;

export interface WorldForkWorkspaceProjection {
  readonly projectionKind: 'world_fork_adapter_state';
  readonly source: 'runtime-decision-support-world-fork';
  readonly readOnly: true;
  readonly day: number;
  readonly receipt: ReadonlyDeep<WorldForkReceipt>;
}

export function buildWorldForkWorkspaceProjection(
  state: Readonly<GameState>,
  options: BuildWorldForkWorkspaceProjectionOptions = {},
): WorldForkWorkspaceProjection {
  const { receipt } = createCounterfactualWorldFork(state, options);

  return freezeProjection({
    projectionKind: 'world_fork_adapter_state',
    source: 'runtime-decision-support-world-fork',
    readOnly: true,
    day: receipt.baseDay,
    receipt,
  }) as WorldForkWorkspaceProjection;
}
