import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import {
  buildArchitectureMigrationReadinessProjection,
  type ArchitectureMigrationTargetId,
} from '../src/selling-houses/application/projections/architectureMigrationReadinessProjection.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import type { GameState } from '../src/selling-houses/domain/models.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';

function stableStateJson(world: GameState) {
  return JSON.stringify(world);
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
const projection = buildArchitectureMigrationReadinessProjection(world);
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

const targetIds = projection.nextMigrationTargets.map((target) => target.id);
const requiredTargets = [
  'case-field-migration',
  'action-resolver-split',
  'process-lifecycle-ownership',
  'opportunity-authority-cleanup',
] as const satisfies readonly ArchitectureMigrationTargetId[];

for (const targetId of requiredTargets) {
  assert.ok(
    targetIds.includes(targetId),
    `Expected readiness projection to include next migration target ${targetId}`,
  );
}

assert.ok(
  projection.nextMigrationTargets.every((target) => target.readiness),
  'Expected every next migration target to declare readiness',
);
assert.ok(
  projection.blockingWarnings.every((warning) => warning.severity === 'blocking'),
  'Expected blockingWarnings to contain only blocking warnings',
);

console.log('selling-houses architecture migration readiness contract verification passed');
