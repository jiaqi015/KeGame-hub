import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState';
import { advanceDays, seedInitialOpportunities } from '../src/selling-houses/domain/engine';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog';

function buildWorld() {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  if (!snapshot) {
    throw new Error('Missing builtin scenario for verification');
  }
  const world = createInitialState(snapshot, 123456);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

{
  const world = buildWorld();
  const emotional = world.cases[0];
  const urgent = world.cases[1];

  emotional.personality = 'emotional';
  emotional.trust = 70;
  emotional.heat = 35;
  emotional.windowDays = 9;

  urgent.personality = 'urgent';
  urgent.urgency = 40;
  urgent.windowDays = 9;

  advanceDays(world, 1);

  assert.ok(emotional.trust <= 66, `Expected emotional owner trust to drop aggressively, got ${emotional.trust}`);
  assert.ok(urgent.urgency >= 45, `Expected urgent owner urgency to grow by at least 5, got ${urgent.urgency}`);
}

{
  const world = buildWorld();
  world.rules.randomEventProbability = 1;
  world.runContext.scenarioSnapshot.scenario.randomEventPool = [{ templateId: 'policy-shift', weight: 1 }];
  const before = world.opportunities
    .filter((opportunity) => opportunity.status === 'active')
    .map((opportunity) => opportunity.confidence);

  advanceDays(world, 1);

  const after = world.opportunities
    .filter((opportunity) => opportunity.status === 'active')
    .map((opportunity) => opportunity.confidence);

  assert.ok(after.length > 0, 'Expected active opportunities after policy-shift verification');
  assert.ok(
    after.every((confidence, index) => confidence <= before[index]),
    'Expected policy shift event to reduce confidence for every active opportunity'
  );
}

console.log('selling-houses verification passed');
