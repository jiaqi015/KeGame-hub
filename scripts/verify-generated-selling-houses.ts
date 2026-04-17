import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState';
import { advanceDays, seedInitialOpportunities } from '../src/selling-houses/domain/engine';
import { generateScenarioBundle } from '../src/selling-houses/domain/scenarioCatalog';

const SEEDS = [101, 202, 303];
const DIFFICULTIES = ['warmup', 'easy', 'standard', 'advanced', 'hard', 'extreme'] as const;

for (const difficultyId of DIFFICULTIES) {
  for (const seed of SEEDS) {
    const bundle = generateScenarioBundle({ difficultyId, seed });

    assert.ok(bundle.validation.valid, [
      `Generated scenario should validate for ${difficultyId}/${seed}`,
      bundle.validation.findings.join('; '),
    ].join('\n'));

    assert.equal(bundle.scenario.cases.length, bundle.profile.caseCount, 'Generated scenario case count should match profile');
    assert.ok(bundle.scenario.competitionGroups.length >= bundle.profile.competitionGroupCountRange.min, 'Generated scenario should have enough competition groups');
    assert.ok(bundle.scenario.scriptedEvents.length >= bundle.profile.scriptedEventCountRange.min, 'Generated scenario should have enough scripted events');

    const world = createInitialState(bundle.snapshot, seed);
    seedInitialOpportunities(world);
    updateDerivedState(world);
    advanceDays(world, 1);
    updateDerivedState(world);

    assert.ok(world.cases.length === bundle.profile.caseCount, 'Initial state should hydrate generated cases');
    assert.ok(world.day >= 2, 'Generated world should advance one day successfully');
  }
}

console.log('generated selling-houses verification passed');
