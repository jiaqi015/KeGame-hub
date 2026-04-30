import type { GameState } from '../../domain/models.js';
import {
  buildLastDailyTickReceiptFromState,
  type DailyTickReceipt,
} from '../../runtime/simulation/dailyTickReceipt.js';
import { freezeProjection, type ReadonlyDeep } from './readOnly.js';

export interface DailyTickReceiptWorkspaceProjection {
  readonly projectionKind: 'daily_tick_receipt_adapter_state';
  readonly source: 'runtime-daily-tick-receipt';
  readonly readOnly: true;
  /** Compatibility mirror for the settled tick day; process rows carry their own day/phase. */
  readonly day: number;
  readonly receipt: ReadonlyDeep<DailyTickReceipt> | null;
}

export function buildDailyTickReceiptWorkspaceProjection(
  state: Readonly<GameState>,
): DailyTickReceiptWorkspaceProjection {
  const receipt = buildLastDailyTickReceiptFromState(state);

  return freezeProjection({
    projectionKind: 'daily_tick_receipt_adapter_state',
    source: 'runtime-daily-tick-receipt',
    readOnly: true,
    day: receipt?.day ?? state.day,
    receipt,
  }) as DailyTickReceiptWorkspaceProjection;
}
