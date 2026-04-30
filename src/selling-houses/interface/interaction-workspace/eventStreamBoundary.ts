import type { GameState } from '../../domain/models.js';
import {
  buildEventStreamReceiptFromState,
  type BuildEventStreamReceiptFromStateOptions,
  type EventStreamReceipt,
} from '../../runtime/simulation/eventStreamReceipt.js';
import { freezeProjection, type ReadonlyDeep } from './readOnly.js';

export type BuildEventStreamWorkspaceProjectionOptions = BuildEventStreamReceiptFromStateOptions;

export interface EventStreamWorkspaceProjection {
  readonly projectionKind: 'event_stream_adapter_state';
  readonly source: 'runtime-event-stream-receipt';
  readonly readOnly: true;
  readonly day: number;
  readonly receipt: ReadonlyDeep<EventStreamReceipt>;
}

export function buildEventStreamWorkspaceProjection(
  state: Readonly<GameState>,
  options: BuildEventStreamWorkspaceProjectionOptions = {},
): EventStreamWorkspaceProjection {
  const receipt = buildEventStreamReceiptFromState(state, options);

  return freezeProjection({
    projectionKind: 'event_stream_adapter_state',
    source: 'runtime-event-stream-receipt',
    readOnly: true,
    day: receipt.day,
    receipt,
  }) as EventStreamWorkspaceProjection;
}
