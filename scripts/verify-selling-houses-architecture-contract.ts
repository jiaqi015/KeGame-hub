import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import {
  buildAssetScoreSnapshotFromLegacyCase,
  buildCaseEvaluationSnapshotsFromLegacyState,
  buildOwnerDecisionReadinessSnapshotFromLegacyCase,
  deriveWorldStateFromLegacyGameState,
  mapLegacyCaseToAssetCase,
} from '../src/selling-houses/core/index.js';
import { ACTION_SPECS } from '../src/selling-houses/core/business-rules/action-specs/index.js';
import { BUSINESS_FLOWS } from '../src/selling-houses/core/business-rules/business-flows/index.js';
import { DECISION_MOMENTS } from '../src/selling-houses/core/business-rules/decision-moments/index.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';

function buildWorld() {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');
  const world = createInitialState(snapshot, 20260429);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

const world = buildWorld();
const caseItem = world.cases[0];
assert.ok(caseItem, 'Expected at least one legacy case');

const worldState = deriveWorldStateFromLegacyGameState(world);
assert.equal(worldState.source, 'legacy-game-state', 'Expected core world-state adapter import to derive a snapshot');
assert.equal(worldState.assets.length, world.cases.length, 'Expected core world-state export to expose asset cases');
assert.equal(
  worldState.customerCaseOpportunities.length,
  world.opportunities.length,
  'Expected core world-state export to expose opportunity relations',
);

const assetCase = mapLegacyCaseToAssetCase(caseItem);
assert.equal(assetCase.legacyCaseId, caseItem.id, 'Expected core world-state case mapper import to work');

const assetScore = buildAssetScoreSnapshotFromLegacyCase(world, caseItem);
assert.equal(assetScore.modelId, 'asset-score', 'Expected core evaluation export to expose asset score snapshots');

const ownerReadiness = buildOwnerDecisionReadinessSnapshotFromLegacyCase(world, caseItem);
assert.equal(
  ownerReadiness.modelId,
  'owner-decision-readiness',
  'Expected core evaluation export to expose owner readiness snapshots',
);

const caseEvaluations = buildCaseEvaluationSnapshotsFromLegacyState(world, caseItem);
assert.ok(caseEvaluations.assetScore, 'Expected combined case evaluation builder to expose asset score');
assert.ok(
  caseEvaluations.ownerDecisionReadiness,
  'Expected combined case evaluation builder to expose owner decision readiness',
);

assert.ok(ACTION_SPECS.length > 0, 'Expected core business-rules export to expose action specs');
assert.ok(
  DECISION_MOMENTS.length > 0,
  'Expected core business-rules export to expose decision moment concepts',
);
assert.ok(
  BUSINESS_FLOWS.length > 0,
  'Expected core business-rules export to expose business flow concepts',
);

console.log('selling-houses architecture smoke export verification passed');
