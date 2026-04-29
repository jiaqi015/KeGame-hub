import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import {
  buildAssetScoreInputDraftFromLegacyCase,
  decomposeLegacyAssetScore,
} from '../src/selling-houses/core/evaluation/score-separation/index.js';

function buildWorld() {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');
  const world = createInitialState(snapshot, 20260429);
  updateDerivedState(world);
  return world;
}

const world = buildWorld();
const targetCase = world.cases[0];
assert.ok(targetCase, 'Expected at least one case');

const before = structuredClone(targetCase);
const decomposition = decomposeLegacyAssetScore(world, targetCase);
const draft = buildAssetScoreInputDraftFromLegacyCase(world, targetCase);

assert.deepEqual(targetCase, before, 'Score separation adapter must not mutate legacy Case');

assert.equal(decomposition.legacyD3.isMixedLegacyScore, true);
assert.match(
  decomposition.legacyD3.canonicalWarning,
  /not the future canonical good-house score/i,
);

assert.equal(decomposition.ownerReadiness.trust.value, targetCase.trust);
assert.equal(decomposition.ownerReadiness.urgency.value, targetCase.urgency);
assert.equal(decomposition.ownerReadiness.patience.value, targetCase.patience);
assert.equal(decomposition.ownerReadiness.windowDays.value, targetCase.windowDays);
assert.equal(decomposition.ownerReadiness.trust.assetFact, false);
assert.equal(decomposition.ownerReadiness.urgency.assetFact, false);
assert.equal(decomposition.ownerReadiness.patience.assetFact, false);

assert.ok(
  !Object.prototype.hasOwnProperty.call(decomposition.assetIntrinsicQuality.signals, 'trust'),
  'Trust must not be modeled as an intrinsic asset signal',
);
assert.ok(
  !Object.prototype.hasOwnProperty.call(decomposition.assetIntrinsicQuality.signals, 'urgency'),
  'Urgency must not be modeled as an intrinsic asset signal',
);
assert.ok(
  !Object.prototype.hasOwnProperty.call(decomposition.assetIntrinsicQuality.signals, 'patience'),
  'Patience must not be modeled as an intrinsic asset signal',
);

assert.equal(draft.caseId, targetCase.id);
assert.equal(draft.price.askPrice, targetCase.askPrice);
assert.equal(draft.ownerReadinessContext.trust, targetCase.trust);
assert.equal(draft.ownerReadinessContext.urgency, targetCase.urgency);
assert.equal(draft.ownerReadinessContext.patience, targetCase.patience);
assert.equal(draft.ownerReadinessContext.excludedFromIntrinsicAssetQuality, true);

console.log('selling-houses score separation contract verification passed');
