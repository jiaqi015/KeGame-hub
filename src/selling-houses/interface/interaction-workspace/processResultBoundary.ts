import type { GameState } from '../../domain/models.js';
import {
  countDailyProcessResultsByManager,
  groupDailyProcessResultsByPhase,
  readDailyProcessResultReadModels,
  type DailyProcessManagerId,
  type DailyProcessResultOutcomeOwner,
  type DailyProcessResultOwner,
  type DailyProcessResultReadModel,
} from '../../runtime/simulation/dailyProcessResult.js';
import { freezeProjection } from './readOnly.js';

export interface ProcessResultWorkspaceItem {
  readonly managerId: DailyProcessManagerId;
  readonly owner: DailyProcessResultOwner;
  readonly outcomeOwner?: DailyProcessResultOutcomeOwner;
  readonly day: number;
  readonly phase: DailyProcessResultReadModel['phase'];
  readonly processedCount: number;
  readonly resolvedCount: number;
  readonly emittedEventIds: readonly string[];
  readonly closedDealIds: readonly string[];
  readonly opportunityIds: readonly string[];
  readonly productRunIds: readonly string[];
}

export interface ProcessResultWorkspaceProjection {
  readonly projectionKind: 'process_result_adapter_state';
  readonly source: 'last_daily_tick_result';
  readonly readOnly: true;
  readonly settledDay: number;
  readonly nextDay: number;
  /** Compatibility mirror for older workspace consumers; prefer result-level day/phase. */
  readonly day: number;
  readonly processResultCount: number;
  readonly byManager: Readonly<Record<DailyProcessManagerId, number>>;
  readonly settledDayResults: readonly ProcessResultWorkspaceItem[];
  readonly nextDaySetupResults: readonly ProcessResultWorkspaceItem[];
  /** Compatibility mirror containing both settled-day and next-day setup rows. */
  readonly results: readonly ProcessResultWorkspaceItem[];
}

function buildProcessResultWorkspaceItem(result: DailyProcessResultReadModel): ProcessResultWorkspaceItem {
  return {
    managerId: result.managerId,
    owner: result.owner,
    outcomeOwner: result.outcomeOwner,
    day: result.day,
    phase: result.phase,
    processedCount: result.processedCount,
    resolvedCount: result.resolvedCount,
    emittedEventIds: [...result.emittedEventIds],
    closedDealIds: [...result.closedDealIds],
    opportunityIds: [...result.opportunityIds],
    productRunIds: [...result.productRunIds],
  };
}

export function buildProcessResultWorkspaceProjection(state: Readonly<GameState>): ProcessResultWorkspaceProjection {
  const tickResult = state.lastDailyTickResult;
  const processResults = readDailyProcessResultReadModels(tickResult ?? {});
  const processResultGroups = groupDailyProcessResultsByPhase(processResults);
  const results = processResults.map(buildProcessResultWorkspaceItem);
  const byManager = countDailyProcessResultsByManager(processResults);

  return freezeProjection({
    projectionKind: 'process_result_adapter_state',
    source: 'last_daily_tick_result',
    readOnly: true,
    settledDay: tickResult?.day ?? state.day,
    nextDay: tickResult?.nextDay ?? state.day,
    day: tickResult?.day ?? state.day,
    processResultCount: results.length,
    byManager,
    settledDayResults: processResultGroups.settledDayResults.map(buildProcessResultWorkspaceItem),
    nextDaySetupResults: processResultGroups.nextDaySetupResults.map(buildProcessResultWorkspaceItem),
    results,
  }) as ProcessResultWorkspaceProjection;
}
