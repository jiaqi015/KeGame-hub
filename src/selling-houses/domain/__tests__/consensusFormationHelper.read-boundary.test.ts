/**
 * R34/R35 read-boundary contract: read functions must NOT mutate state.
 *
 * `findConsensusForOpportunity` and `findContractForCase` are pure
 * lookups. Calling them on a state that has not yet initialized the
 * canonical runtime arrays must NOT allocate the arrays as a side
 * effect. This preserves the read boundary: reads are side-effect free.
 *
 * The reference implementation is `findBrokeredStateForOpportunity` in
 * opportunitySplitHelper.ts:446, which guards with
 * `if (!state.runtimeBrokeredOpportunities) return undefined;`.
 */
import { describe, expect, it } from 'vitest';
import { createInitialState, updateDerivedState } from '../../application/gameState.js';
import {
  findConsensusForOpportunity,
  findContractForCase,
} from '../consensusFormationHelper.js';
import { seedInitialOpportunities } from '../engine.js';
import { getScenarioSnapshotById } from '../scenarioCatalog.js';

function createWorld(seed: number) {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  if (!snapshot) {
    throw new Error('Expected standard-window-chain scenario to exist');
  }
  const world = createInitialState(snapshot, seed);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

function stripCanonicalRuntimeArrays(world: ReturnType<typeof createWorld>) {
  (world as { runtimeConsensusFormations?: unknown }).runtimeConsensusFormations = undefined;
  (world as { runtimeContractFacts?: unknown }).runtimeContractFacts = undefined;
}

describe('consensusFormationHelper — R34/R35 read boundary', () => {
  it('findConsensusForOpportunity does NOT mutate state when runtime arrays are absent', () => {
    const world = createWorld(20260430);
    stripCanonicalRuntimeArrays(world);
    expect(world.runtimeConsensusFormations, 'precondition: array must be undefined').toBeUndefined();

    const result = findConsensusForOpportunity(world, 'brokered:opportunity:nonexistent');

    expect(result, 'lookup must return undefined for a missing formation').toBeUndefined();
    expect(
      world.runtimeConsensusFormations,
      'findConsensusForOpportunity must NOT initialize runtimeConsensusFormations',
    ).toBeUndefined();
  });

  it('findContractForCase does NOT mutate state when runtime arrays are absent', () => {
    const world = createWorld(20260501);
    stripCanonicalRuntimeArrays(world);
    expect(world.runtimeContractFacts, 'precondition: array must be undefined').toBeUndefined();

    const result = findContractForCase(world, 'case-nonexistent');

    expect(result, 'lookup must return undefined for a missing contract').toBeUndefined();
    expect(
      world.runtimeContractFacts,
      'findContractForCase must NOT initialize runtimeContractFacts',
    ).toBeUndefined();
  });
});
