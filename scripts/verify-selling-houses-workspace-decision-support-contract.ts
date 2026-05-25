import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { buildDecisionSupportWorkspaceProjection } from '../src/selling-houses/interface/interaction-workspace/decisionSupportBoundary.js';
import { asWritableCase } from '../src/selling-houses/domain/models.js';
import type { GameState } from '../src/selling-houses/domain/models.js';

function stableStateJson(world: GameState) {
  return JSON.stringify(world);
}

const snapshot = getScenarioSnapshotById('standard-window-chain');
assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');

const world = createInitialState(snapshot, 20260429);
world.day = 3;
world.cases.forEach((caseItem, index) => {
  asWritableCase(caseItem).status = 'active';
  caseItem.hasCompletedFirstVisit = index !== 0;
  caseItem.lastOwnerTouchedDay = index === 0 ? 0 : Math.max(1, world.day - 2);
  caseItem.touchedOwnerToday = false;
  caseItem.openDayCooldown = 0;
});
updateDerivedState(world);

const before = stableStateJson(world);
const projection = buildDecisionSupportWorkspaceProjection(world);
const after = stableStateJson(world);

assert.equal(after, before, 'Expected decision-support workspace boundary not to mutate GameState');
assert.equal(projection.projectionKind, 'decision_support_adapter_state');
assert.equal(projection.source, 'legacy-game-state-read-model');
assert.equal(projection.readOnly, true, 'Expected workspace decision-support boundary to be read-only');
assert.equal(projection.decisionSupport.readOnly, true, 'Expected decisionSupport summary to preserve read-only context');
assert.equal(projection.day, world.day, 'Expected projection day to mirror GameState day');
assert.equal(projection.summary.day, world.day, 'Expected summary day to mirror GameState day');
assert.equal(
  projection.summary.caseCount,
  world.cases.filter((caseItem) => caseItem.status === 'active').length,
  'Expected projection to summarize active case count',
);
assert.ok(projection.summary.caseCount > 0, 'Expected at least one active case in decision-support projection');
assert.ok(projection.summary.signalCount > 0, 'Expected decision-support projection to summarize signals');
assert.ok(
  projection.summary.recommendationDraftCount > 0,
  'Expected decision-support projection to summarize recommendation drafts',
);
assert.ok(
  projection.summary.decisionMomentCount > 0,
  'Expected decision-support projection to summarize decision moments',
);

const allDrafts = projection.cases.flatMap((caseProjection) => caseProjection.recommendationDrafts);
assert.ok(allDrafts.length > 0, 'Expected at least one recommendation draft');
assert.ok(
  allDrafts.every((draft) => typeof draft.legacyActionId === 'string' && draft.legacyActionId.length > 0),
  'Expected recommendationDrafts to reference legacyActionId',
);

assert.equal(
  projection.summary.signalCount,
  projection.cases.reduce((total, caseProjection) => total + caseProjection.counts.signals, 0),
  'Expected signal summary count to match case summaries',
);
assert.equal(
  projection.summary.recommendationDraftCount,
  projection.cases.reduce((total, caseProjection) => total + caseProjection.counts.recommendationDrafts, 0),
  'Expected draft summary count to match case summaries',
);
assert.equal(
  projection.summary.decisionMomentCount,
  projection.decisionMoments.length,
  'Expected decision moment summary count to match decision moment summaries',
);

console.log('selling-houses workspace decision-support contract verification passed');
