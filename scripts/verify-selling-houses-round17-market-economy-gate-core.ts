import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { advanceDays } from '../src/selling-houses/domain/engine.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine/opportunityEngine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import {
  createBigWorldBootstrap,
  buildScaleManifest,
  buildDiversityManifest,
} from '../src/selling-houses/domain/world-model/bigWorldBootstrap.js';
import { createEmptyRegistry, appendSourceRecord } from '../src/selling-houses/domain/world-model/informationSourceRegistry.js';
import { buildActorKnowledgeSnapshot } from '../src/selling-houses/application/projections/actorKnowledgeProjection.js';
import { buildStrategicMarketDecisionProjection } from '../src/selling-houses/application/projections/strategicMarketDecisionProjection.js';
import { asWritableCase } from '../src/selling-houses/domain/models.js';
import type { GameState } from '../src/selling-houses/domain/models.js';
import type { ActorKnowledgeSnapshot } from '../src/selling-houses/domain/world-model/actorKnowledgeTypes.js';
import type {
  BigWorldBootstrap,
  BigWorldScalePolicy,
} from '../src/selling-houses/domain/world-model/bigWorldTypes.js';
import type { SourceKind } from '../src/selling-houses/domain/world-model/informationSourceTypes.js';
import type { WorldCausalEvent } from '../src/selling-houses/domain/world-model/causalEvents.js';

export const ROUND17_SEED = 20260627;

export const MARKET_ECONOMY_SCALE: BigWorldScalePolicy = {
  minMarketCells: 24,
  maxMarketCells: 24,
  acnCount: 8,
  namedBrokersPerAcn: 5,
  shadowBrokersPerAcn: 15,
  shadowListingsPerCell: 25,
  directRivalListingsPerCell: 8,
  materializedCustomersPerCell: 50,
  shadowAggregateClustersPerCell: 20,
  ownerProfilePriorCount: 500,
  customerCaseRatio: 12,
};

export function readSrc(rel: string): string {
  return readFileSync(resolve(import.meta.dirname ?? '.', '..', rel), 'utf-8');
}

export function buildMarketEconomyWorld(seed: number = ROUND17_SEED): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  if (!snapshot) throw new Error('standard-window-chain scenario missing');
  const state = createInitialState(snapshot, seed);
  const bootstrap = createBigWorldBootstrap({
    seed,
    scenarioName: snapshot.scenario.name,
    difficultyId: snapshot.scenario.difficultyId,
    playerCaseCount: snapshot.scenario.cases.length,
    scaleOverride: MARKET_ECONOMY_SCALE,
  });
  (state.runContext as { bigWorldBootstrap?: BigWorldBootstrap }).bigWorldBootstrap = bootstrap;
  seedInitialOpportunities(state);
  return state;
}

export function buildLongHorizonMarketEconomyWorld(seed: number = ROUND17_SEED): GameState {
  const state = buildMarketEconomyWorld(seed);
  state.maxDay = 120;
  state.rules.maxDay = 120;
  state.rules.outcomeControl.simulationDays = 120;
  state.rules.outcomeControl.marketDealCapacity21d = 0;
  state.rules.outcomeControl.rivalCaseLossScale = 0;
  state.rules.rivalLossProbabilityScale = 0;

  for (const caseItem of state.cases) {
    asWritableCase(caseItem).status = 'active';
    caseItem.windowDays = 120;
    asWritableCase(caseItem).trust = Math.max(caseItem.trust, 88);
    asWritableCase(caseItem).patience = Math.max(caseItem.patience, 88);
    asWritableCase(caseItem).urgency = Math.min(caseItem.urgency, 35);
    caseItem.heat = Math.max(caseItem.heat, 55);
    caseItem.competitiveness = Math.max(caseItem.competitiveness, 65);
  }

  return state;
}

export function advanceMarketEconomyWorld(days: number, seed: number = ROUND17_SEED): GameState {
  const state = buildLongHorizonMarketEconomyWorld(seed);
  advanceDays(state, days);
  updateDerivedState(state);
  return state;
}

export function bootstrapOf(state: GameState): BigWorldBootstrap {
  const bootstrap = state.runContext.bigWorldBootstrap as BigWorldBootstrap | undefined;
  if (!bootstrap) throw new Error('bigWorldBootstrap missing');
  return bootstrap;
}

export function scaleOf(state: GameState) {
  return buildScaleManifest(bootstrapOf(state));
}

export function diversityOf(state: GameState) {
  return buildDiversityManifest(bootstrapOf(state));
}

export function sourceKindsForEvent(event: WorldCausalEvent): readonly SourceKind[] {
  const eventRecord = event as WorldCausalEvent & {
    readonly sourceKind?: SourceKind;
    readonly sourceKinds?: readonly SourceKind[];
  };
  const kinds = new Set<SourceKind>();
  if (eventRecord.sourceKind) kinds.add(eventRecord.sourceKind);
  for (const sourceKind of eventRecord.sourceKinds ?? []) {
    kinds.add(sourceKind);
  }
  return [...kinds];
}

export function eventHasSourceKind(event: WorldCausalEvent, kind: SourceKind): boolean {
  return sourceKindsForEvent(event).includes(kind);
}

export function buildRegistryFromCausalEvents(events: readonly WorldCausalEvent[], day: number) {
  let registry = createEmptyRegistry();
  for (const event of events) {
    const eventRecord = event as WorldCausalEvent & {
      readonly sourceKind?: SourceKind;
      readonly sourceRecordId?: string;
      readonly sourceReplayKey?: string;
    };
    if (!eventRecord.sourceKind) continue;
    const payload = event.payload as unknown;
    const safePayload = typeof payload === 'object' && payload !== null
      ? { summary: `live ${event.kind}`, ...(payload as Record<string, unknown>) }
      : { summary: `live ${event.kind}` };
    const result = appendSourceRecord(registry, {
      sourceId: eventRecord.sourceRecordId ?? `isr-live-${event.id}`,
      sourceKind: eventRecord.sourceKind,
      payload: safePayload,
      day: event.day || day,
      phase: 'morning',
      entityRefs: (event.entityIds ?? []).map((id) => ({ id, kind: 'market_cell' as const })),
      actorRefs: (event.actorIds ?? []).map((id) => ({ id, role: 'system' as const })),
      visibility: { scope: 'all_actors', baseDelayDays: 0 },
      confidence: event.confidence ?? 0.7,
      delayDays: 0,
      replayKey: eventRecord.sourceReplayKey ?? `rk-live-${event.id}`,
      origin: 'ecosystem_tick',
    } as never);
    if (result.ok) registry = result.registry;
  }
  return registry;
}

export function buildKnowledgeMapFromState(state: GameState): Map<string, ActorKnowledgeSnapshot> {
  const registry = buildRegistryFromCausalEvents(state.worldCausalEvents ?? [], state.day);
  const knowledge = buildActorKnowledgeSnapshot('player-1', 'player_broker', state.day, registry);
  const actorKnowledgeMap = new Map<string, ActorKnowledgeSnapshot>();
  for (const caseItem of state.cases.slice(0, 10)) {
    actorKnowledgeMap.set(caseItem.id, knowledge);
  }
  return actorKnowledgeMap;
}

export function buildStrategicProjectionFromState(state: GameState) {
  return buildStrategicMarketDecisionProjection(state, buildKnowledgeMapFromState(state));
}

export function causalEventIds(state: GameState): readonly string[] {
  return (state.worldCausalEvents ?? []).map((event) => event.id).sort();
}

export function sameStringList(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

export function uniqueSourceKinds(events: readonly WorldCausalEvent[]): Set<SourceKind> {
  const sourceKinds = new Set<SourceKind>();
  for (const event of events) {
    for (const sourceKind of sourceKindsForEvent(event)) {
      sourceKinds.add(sourceKind);
    }
  }
  return sourceKinds;
}

export function countEconomySourceRecords(events: readonly WorldCausalEvent[]): number {
  return events.filter((event) => {
    const eventRecord = event as WorldCausalEvent & {
      readonly sourceRecordId?: string;
      readonly sourceRecordIds?: readonly string[];
    };
    return eventRecord.sourceRecordId?.startsWith('isr-eco-')
      || eventRecord.sourceRecordIds?.some((sourceRecordId) => sourceRecordId.startsWith('isr-eco-'));
  }).length;
}
