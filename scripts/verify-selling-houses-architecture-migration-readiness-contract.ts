import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { buildArchitectureMigrationReadinessProjection } from '../src/selling-houses/application/projections/architectureMigrationReadinessProjection.js';
import { advanceOneDay, seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import type { GameState } from '../src/selling-houses/domain/models.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';

type RuntimeReceiptReadiness = {
  readonly source: 'runtime-simulation-daily-tick-receipt';
  readonly readOnly: true;
  readonly readiness: 'ready' | 'watch' | 'blocked';
  readonly receiptBoundaryLinked: boolean;
  readonly workspaceProjectionLinked: boolean;
  readonly hasLastDailyTickResult: boolean;
  readonly hasDailyTickReceipt: boolean;
  readonly hasWorkspaceReceiptProjection: boolean;
  readonly processResultCount: number;
  readonly emittedEventCount: number;
  readonly closedDealCount: number;
  readonly maxInvariantLevel: 'none' | 'warning' | 'error';
};

type EventStreamBoundaryReadiness = {
  readonly source: 'runtime-simulation-event-stream-receipt';
  readonly readOnly: true;
  readonly receiptBoundaryLinked: boolean;
  readonly workspaceProjectionLinked: boolean;
  readonly readiness: 'ready' | 'watch' | 'blocked';
  readonly eventCount: number;
  readonly recentEventCount: number;
  readonly journalEventCount: number;
  readonly domainEventKindCount: number;
};

type WorldForkBoundaryReadiness = {
  readonly source: 'runtime-decision-support-world-fork';
  readonly readOnly: true;
  readonly forkBoundaryLinked: boolean;
  readonly workspaceProjectionLinked: boolean;
  readonly readiness: 'ready' | 'watch' | 'blocked';
  readonly mutationPolicy: 'clone-before-simulate';
  readonly baseDay: number;
  readonly caseCount: number;
  readonly opportunityCount: number;
  readonly eventCount: number;
};

type ArchitectureMigrationReadinessProjectionContract = ReturnType<typeof buildArchitectureMigrationReadinessProjection> & {
  readonly runtimeReceipt: RuntimeReceiptReadiness;
  readonly eventStream: EventStreamBoundaryReadiness;
  readonly worldFork: WorldForkBoundaryReadiness;
};

function stableStateJson(world: GameState) {
  return JSON.stringify(world);
}

function assertOwnField(target: object, field: string, message: string) {
  assert.equal(Object.hasOwn(target, field), true, message);
}

function assertRuntimeReceiptLinkedContract(runtimeReceipt: RuntimeReceiptReadiness) {
  for (const field of [
    'source',
    'readOnly',
    'readiness',
    'receiptBoundaryLinked',
    'workspaceProjectionLinked',
    'hasLastDailyTickResult',
    'hasDailyTickReceipt',
    'hasWorkspaceReceiptProjection',
    'processResultCount',
    'emittedEventCount',
    'closedDealCount',
    'maxInvariantLevel',
  ]) {
    assertOwnField(
      runtimeReceipt,
      field,
      `Expected runtime receipt readiness to expose ${field}`,
    );
  }
  assert.equal(runtimeReceipt.source, 'runtime-simulation-daily-tick-receipt');
  assert.equal(runtimeReceipt.readOnly, true);
  assert.equal(
    runtimeReceipt.receiptBoundaryLinked,
    true,
    'Expected runtime receipt readiness to link the daily tick receipt boundary',
  );
  assert.equal(
    runtimeReceipt.workspaceProjectionLinked,
    true,
    'Expected runtime receipt readiness to link the workspace receipt projection',
  );
}

function assertEventStreamReadinessContract(eventStream: EventStreamBoundaryReadiness) {
  assert.ok(eventStream, 'Expected readiness projection to include event stream boundary readiness');
  for (const field of [
    'source',
    'readOnly',
    'receiptBoundaryLinked',
    'workspaceProjectionLinked',
    'readiness',
    'eventCount',
    'recentEventCount',
    'journalEventCount',
    'domainEventKindCount',
  ]) {
    assertOwnField(
      eventStream,
      field,
      `Expected event stream readiness to expose ${field}`,
    );
  }
  assert.equal(eventStream.source, 'runtime-simulation-event-stream-receipt');
  assert.equal(eventStream.readOnly, true);
  assert.equal(eventStream.receiptBoundaryLinked, true, 'Expected event stream receipt boundary to be linked');
  assert.equal(eventStream.workspaceProjectionLinked, true, 'Expected event stream workspace projection to be linked');
  assert.equal(eventStream.readiness, 'ready', 'Expected event stream boundary readiness to be ready');
  assert.equal(typeof eventStream.eventCount, 'number', 'Expected event stream readiness eventCount to be numeric');
  assert.equal(
    typeof eventStream.recentEventCount,
    'number',
    'Expected event stream readiness recentEventCount to be numeric',
  );
  assert.equal(
    typeof eventStream.journalEventCount,
    'number',
    'Expected event stream readiness journalEventCount to be numeric',
  );
  assert.equal(
    typeof eventStream.domainEventKindCount,
    'number',
    'Expected event stream readiness domainEventKindCount to be numeric',
  );
  assert.ok(
    eventStream.recentEventCount <= eventStream.eventCount,
    'Expected event stream readiness recentEventCount not to exceed eventCount',
  );
  assert.ok(
    eventStream.journalEventCount <= eventStream.eventCount,
    'Expected event stream readiness journalEventCount not to exceed eventCount',
  );
}

function assertWorldForkReadinessContract(worldFork: WorldForkBoundaryReadiness, world: GameState) {
  assert.ok(worldFork, 'Expected readiness projection to include world fork boundary readiness');
  for (const field of [
    'source',
    'readOnly',
    'forkBoundaryLinked',
    'workspaceProjectionLinked',
    'readiness',
    'mutationPolicy',
    'baseDay',
    'caseCount',
    'opportunityCount',
    'eventCount',
  ]) {
    assertOwnField(
      worldFork,
      field,
      `Expected world fork readiness to expose ${field}`,
    );
  }
  assert.equal(worldFork.source, 'runtime-decision-support-world-fork');
  assert.equal(worldFork.readOnly, true);
  assert.equal(worldFork.forkBoundaryLinked, true, 'Expected world fork runtime boundary to be linked');
  assert.equal(worldFork.workspaceProjectionLinked, true, 'Expected world fork workspace projection to be linked');
  assert.equal(worldFork.readiness, 'ready', 'Expected world fork boundary readiness to be ready');
  assert.equal(
    worldFork.mutationPolicy,
    'clone-before-simulate',
    'Expected world fork boundary readiness to preserve clone-before-simulate mutation policy',
  );
  assert.equal(worldFork.baseDay, world.day, 'Expected world fork readiness baseDay to mirror GameState day');
  assert.equal(
    worldFork.caseCount,
    world.cases.length,
    'Expected world fork readiness caseCount to mirror GameState cases',
  );
  assert.equal(
    worldFork.opportunityCount,
    world.opportunities.length,
    'Expected world fork readiness opportunityCount to mirror GameState opportunities',
  );
  assert.equal(
    worldFork.eventCount,
    world.eventStore.length,
    'Expected world fork readiness eventCount to mirror GameState event store',
  );
}

function buildScenarioState(seed: number) {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');

  const world = createInitialState(snapshot, seed);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

const world = buildScenarioState(20260429);
const before = stableStateJson(world);
const projection = buildArchitectureMigrationReadinessProjection(world) as ArchitectureMigrationReadinessProjectionContract;
const after = stableStateJson(world);

assert.equal(after, before, 'Expected architecture migration readiness projection not to mutate GameState');
assert.equal(projection.projectionKind, 'architecture_migration_readiness_projection');
assert.equal(projection.source, 'legacy-game-state');
assert.equal(projection.readOnly, true);
assert.equal(projection.day, world.day);
assert.ok(Object.isFrozen(projection), 'Expected readiness projection to be frozen');
assert.ok(Object.isFrozen(projection.blockingWarnings), 'Expected blocking warnings to be frozen');

assert.ok(
  projection.caseFieldOwnership.fieldCount > 0,
  'Expected readiness projection to include legacy Case field ownership entries',
);
assert.ok(
  projection.caseFieldOwnership.canonicalOwnerCount > 0,
  'Expected readiness projection to include canonical owner coverage',
);
assert.ok(
  projection.caseFieldOwnership.compatibilityMirrorCount > 0,
  'Expected readiness projection to include compatibility mirror coverage',
);

assert.deepEqual(
  projection.actionExecutor.missingActionIds,
  [],
  'Expected readiness projection to expose no missing action executor contracts',
);
assert.equal(
  projection.actionExecutor.actionCount,
  projection.actionExecutor.contractCount,
  'Expected action executor readiness to cover every action',
);
assert.ok(
  projection.actionExecutor.processActionIds.length > 0,
  'Expected action executor readiness to expose process-starting actions',
);

assert.equal(
  projection.processLifecycle.source,
  'runtime-simulation-processes',
  'Expected readiness projection to include runtime process lifecycle source',
);
assert.equal(
  projection.processLifecycle.processCount,
  3,
  'Expected process lifecycle readiness to cover open-day, sincerity-sale, and negotiation',
);
assert.equal(
  projection.processLifecycle.readiness,
  'watch',
  'Expected process lifecycle ownership to stay watch while negotiation transitions are still legacy-owned',
);
assert.equal(
  projection.processLifecycle.readyProcessCount,
  2,
  'Expected open-day and sincerity-sale lifecycle targets to be ready',
);
assert.equal(
  projection.processLifecycle.watchProcessCount,
  1,
  'Expected only negotiation lifecycle target to remain watch',
);
assert.equal(
  projection.processLifecycle.pendingStepCount,
  2,
  'Expected readiness to expose negotiation transition-owner and outcome-owner pending steps',
);
assert.deepEqual(
  projection.processLifecycle.pendingProcessTypes,
  ['negotiation'],
  'Expected process lifecycle readiness to include only negotiation as a pending process type',
);

assert.ok(
  projection.architectureParity.status,
  'Expected readiness projection to include architecture parity status',
);
assert.equal(
  projection.architectureParity.warningCount,
  projection.architectureParity.warnings.length,
  'Expected architecture parity warning count to mirror warnings',
);

assertEventStreamReadinessContract(projection.eventStream);
assertWorldForkReadinessContract(projection.worldFork, world);
assertRuntimeReceiptLinkedContract(projection.runtimeReceipt);
assert.equal(
  projection.runtimeReceipt.hasLastDailyTickResult,
  false,
  'Expected initial runtime receipt readiness to show no lastDailyTickResult',
);
assert.equal(
  projection.runtimeReceipt.hasDailyTickReceipt,
  false,
  'Expected initial runtime receipt readiness to show no daily tick receipt',
);
assert.equal(
  projection.runtimeReceipt.hasWorkspaceReceiptProjection,
  false,
  'Expected initial runtime receipt readiness to show no workspace receipt projection',
);
assert.equal(
  projection.runtimeReceipt.readiness,
  'watch',
  'Expected runtime receipt readiness to stay watch before the first daily tick result',
);

const tickResult = advanceOneDay(world);
assert.ok(tickResult, 'Expected advanceOneDay to produce a daily tick result for readiness receipt coverage');
assert.deepEqual(
  tickResult.processResults.map((entry) => entry.managerId),
  ['negotiation-process-manager', 'product-run-process-manager'],
  'Expected daily tick result to include negotiation and product-run process summaries in settlement order',
);
assert.deepEqual(
  tickResult.settledDayProcessResults.map((entry) => ({ managerId: entry.managerId, day: entry.day, phase: entry.phase })),
  [{ managerId: 'negotiation-process-manager', day: tickResult.day, phase: 'settled-day' }],
  'Expected daily tick result readiness fixture to expose grouped settled-day process rows',
);
assert.deepEqual(
  tickResult.nextDaySetupProcessResults.map((entry) => ({ managerId: entry.managerId, day: entry.day, phase: entry.phase })),
  [{ managerId: 'product-run-process-manager', day: tickResult.nextDay, phase: 'next-day-setup' }],
  'Expected daily tick result readiness fixture to expose grouped next-day setup process rows',
);
assert.ok(world.lastDailyTickResult, 'Expected advanceOneDay to persist lastDailyTickResult on GameState');
const afterTickBeforeProjection = stableStateJson(world);
const projectionAfterTick = buildArchitectureMigrationReadinessProjection(world) as ArchitectureMigrationReadinessProjectionContract;
const afterTickAfterProjection = stableStateJson(world);

assert.equal(
  afterTickAfterProjection,
  afterTickBeforeProjection,
  'Expected architecture migration readiness projection not to mutate GameState after daily tick receipt exists',
);
assertEventStreamReadinessContract(projectionAfterTick.eventStream);
assertWorldForkReadinessContract(projectionAfterTick.worldFork, world);
assertRuntimeReceiptLinkedContract(projectionAfterTick.runtimeReceipt);
assert.equal(
  projectionAfterTick.runtimeReceipt.hasLastDailyTickResult,
  true,
  'Expected runtime receipt readiness to detect persisted lastDailyTickResult after advanceOneDay',
);
assert.equal(
  projectionAfterTick.runtimeReceipt.hasDailyTickReceipt,
  true,
  'Expected runtime receipt readiness to build a daily tick receipt after advanceOneDay',
);
assert.equal(
  projectionAfterTick.runtimeReceipt.hasWorkspaceReceiptProjection,
  true,
  'Expected runtime receipt readiness to build a workspace receipt projection after advanceOneDay',
);
assert.equal(
  projectionAfterTick.runtimeReceipt.readiness,
  'ready',
  'Expected runtime receipt readiness to be ready after receipt and workspace projection exist',
);
assert.ok(
  projectionAfterTick.runtimeReceipt.processResultCount >= 2,
  'Expected runtime receipt readiness to expose at least negotiation and product-run process result counts',
);
assert.equal(
  projectionAfterTick.runtimeReceipt.processResultCount,
  tickResult.processResults.length,
  'Expected runtime receipt readiness processResultCount to mirror the daily tick result',
);
assert.equal(
  projectionAfterTick.runtimeReceipt.emittedEventCount,
  tickResult.emittedEvents.length,
  'Expected runtime receipt readiness emittedEventCount to mirror the daily tick result',
);
assert.equal(
  projectionAfterTick.runtimeReceipt.closedDealCount,
  tickResult.closedDeals.length,
  'Expected runtime receipt readiness closedDealCount to mirror the daily tick result',
);
assert.equal(
  typeof projectionAfterTick.runtimeReceipt.emittedEventCount,
  'number',
  'Expected runtime receipt readiness emittedEventCount to be numeric',
);
assert.equal(
  typeof projectionAfterTick.runtimeReceipt.closedDealCount,
  'number',
  'Expected runtime receipt readiness closedDealCount to be numeric',
);
assert.ok(
  ['none', 'warning', 'error'].includes(projectionAfterTick.runtimeReceipt.maxInvariantLevel),
  'Expected runtime receipt readiness maxInvariantLevel to be none, warning, or error',
);

const targetIds = projection.nextMigrationTargets.map((target) => String(target.id));
const requiredTargets = [
  'case-field-migration',
  'action-resolver-split',
  'process-lifecycle-ownership',
  'opportunity-authority-cleanup',
] as const;

for (const targetId of requiredTargets) {
  assert.ok(
    targetIds.includes(targetId),
    `Expected readiness projection to include next migration target ${targetId}`,
  );
}

assert.ok(
  targetIds.includes('daily-tick-receipt-boundary'),
  'Expected readiness projection to include next migration target daily-tick-receipt-boundary',
);
assert.ok(
  targetIds.includes('event-stream-boundary'),
  'Expected readiness projection to include next migration target event-stream-boundary',
);
assert.ok(
  targetIds.includes('world-fork-boundary'),
  'Expected readiness projection to include next migration target world-fork-boundary',
);
assert.ok(
  projection.nextMigrationTargets.every((target) => target.readiness),
  'Expected every next migration target to declare readiness',
);
assert.ok(
  projection.blockingWarnings.every((warning) => warning.severity === 'blocking'),
  'Expected blockingWarnings to contain only blocking warnings',
);

console.log('selling-houses architecture migration readiness contract verification passed');
