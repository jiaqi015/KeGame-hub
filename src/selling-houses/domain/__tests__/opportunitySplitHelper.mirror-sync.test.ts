/**
 * Smoke test for the gold-standard `opportunitySplitHelper.ts` write path.
 *
 * `applyMatchIntentDelta` is the canonical (R20) way to mutate intent:
 *   1. Compute clamped delta on the opportunity (mirror)
 *   2. Apply clamped delta to the CustomerCaseMatch (canonical)
 *   3. Sync the opportunity (mirror) from the new match state
 *
 * If any step silently drops the value, the legacy UI / consumers will
 * see stale intent, breaking R20's mirror-consistency invariant.
 */
import { describe, expect, it } from 'vitest';
import { createInitialState, updateDerivedState } from '../../application/gameState.js';
import { seedInitialOpportunities } from '../engine.js';
import { getScenarioSnapshotById } from '../scenarioCatalog.js';
import {
  applyMatchIntentDelta,
  applyMatchConfidenceDelta,
  findMatchStateForPair,
} from '../opportunitySplitHelper.js';
import { createCustomerCaseMatchState } from '../../core/world-state/opportunity-relations/writeSource.js';

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

describe('opportunitySplitHelper — R20 mirror sync', () => {
  it('applyMatchIntentDelta keeps match.interest and opportunity.intent in sync', () => {
    const world = createWorld(20260502);
    const opportunity = world.opportunities[0];
    const customerId = opportunity.customerId;
    const caseId = opportunity.caseId;

    const match = createCustomerCaseMatchState(
      customerId, caseId, 50, 50, 50, 1000, 1, 1,
    );

    const result = applyMatchIntentDelta(world, match, 25, 1, 'test delta');

    expect(result.interest, 'match.interest must reflect the delta').toBe(75);
    const stored = findMatchStateForPair(world, customerId, caseId);
    expect(stored?.interest, 'stored match.interest must equal the result').toBe(75);
    expect(
      opportunity.intent,
      'opportunity.intent (legacy mirror) must equal match.interest after sync',
    ).toBe(75);
  });

  it('applyMatchConfidenceDelta keeps match.confidence and opportunity.confidence in sync', () => {
    const world = createWorld(20260503);
    const opportunity = world.opportunities[0];
    const customerId = opportunity.customerId;
    const caseId = opportunity.caseId;

    const match = createCustomerCaseMatchState(
      customerId, caseId, 50, 50, 50, 1000, 1, 1,
    );

    const result = applyMatchConfidenceDelta(world, match, 20, 1, 'test delta');

    expect(result.confidence).toBe(70);
    expect(
      opportunity.confidence,
      'opportunity.confidence (legacy mirror) must equal match.confidence after sync',
    ).toBe(70);
  });
});
