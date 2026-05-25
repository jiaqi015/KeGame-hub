import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { advanceDays, executeAction, seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import { asWritableCase, asWritableOpportunity } from '../src/selling-houses/domain/models.js';

const snapshot = getScenarioSnapshotById('standard-window-chain');
assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');

const world = createInitialState(snapshot, 20260421);
seedInitialOpportunities(world);
updateDerivedState(world);

const firstMatter = world.matters.find((entry) => entry.kind === 'case') || world.matters[0];
assert.ok(firstMatter, 'Expected at least one derived matter');

const firstMatterId = firstMatter.id;
const firstOpenedAtDay = firstMatter.openedAtDay;
const firstMatterIndex = world.matters.findIndex((entry) => entry.id === firstMatterId);
world.matters[firstMatterIndex] = {
  ...firstMatter,
  stage: 'in_progress',
  resolutionSummary: '正在处理中',
};

updateDerivedState(world);

const persistedMatter = world.matters.find((entry) => entry.id === firstMatterId);
assert.ok(persistedMatter, 'Expected matter identity to persist across re-derivation');
assert.equal(persistedMatter.stage, 'in_progress', 'Expected matter stage to persist across updateDerivedState');
assert.equal(persistedMatter.openedAtDay, firstOpenedAtDay, 'Expected matter openedAtDay to persist');
assert.equal(persistedMatter.updatedAtDay, world.day, 'Expected matter updatedAtDay to refresh to current day');

const persistedMatterIndex = world.matters.findIndex((entry) => entry.id === firstMatterId);
assert.ok(persistedMatterIndex >= 0, 'Expected persisted matter index to exist before completion simulation');
world.matters[persistedMatterIndex] = {
  ...firstMatter,
  stage: 'completed',
  resolvedAtDay: world.day,
  resolutionSummary: '玩家已处理过一次',
};
updateDerivedState(world);

const reopenedMatter = world.matters.find((entry) => entry.id === firstMatterId);
assert.ok(reopenedMatter, 'Expected active source matter to remain available after re-derivation');
assert.equal(reopenedMatter.stage, 'pending', 'Expected completed matter to reopen when the source is still active');
assert.equal(reopenedMatter.resolvedAtDay, undefined, 'Expected reopened matter to clear the old resolved day');

const linkedCase = world.cases.find((entry) => entry.id === firstMatter.caseId);
assert.ok(linkedCase, 'Expected case-linked matter for lifecycle verification');
asWritableCase(linkedCase).status = 'withdrawn';
updateDerivedState(world);

const resolvedMatter = world.matters.find((entry) => entry.id === firstMatterId);
assert.ok(resolvedMatter, 'Expected resolved matter to remain available for projection and sync');
assert.equal(resolvedMatter.stage, 'completed', 'Expected missing source matter to settle as completed');
assert.equal(resolvedMatter.resolvedAtDay, world.day, 'Expected resolved matter to record settlement day');
const resolvedUpdatedAtDay = resolvedMatter.updatedAtDay;

world.day += 1;
updateDerivedState(world);

const stableResolvedMatter = world.matters.find((entry) => entry.id === firstMatterId);
assert.ok(stableResolvedMatter, 'Expected resolved matter to remain visible after another derivation');
assert.equal(stableResolvedMatter.updatedAtDay, resolvedUpdatedAtDay, 'Expected resolved matter updatedAtDay not to drift every day');

const worldForNegotiation = createInitialState(snapshot, 20260422);
seedInitialOpportunities(worldForNegotiation);
updateDerivedState(worldForNegotiation);

const caseItem = worldForNegotiation.cases[0];
assert.ok(caseItem, 'Expected case for negotiation matter verification');
const opportunity = worldForNegotiation.opportunities.find((entry) => entry.caseId === caseItem.id && entry.status === 'active');
assert.ok(opportunity, 'Expected opportunity for negotiation matter verification');
if (!opportunity) {
  throw new Error('Expected opportunity for negotiation matter verification');
}

caseItem.askPrice = caseItem.marketPrice;
caseItem.hasCompletedFirstVisit = true;
asWritableCase(caseItem).trust = 100;
caseItem.competitiveness = 100;
opportunity.intent = 100;
opportunity.confidence = 100;
asWritableOpportunity(opportunity).stageIndex = 4;
opportunity.daysLeft = 3;
updateDerivedState(worldForNegotiation);

assert.ok(
  executeAction(worldForNegotiation, 'invite-customer-negotiation', caseItem, 'close'),
  'Expected negotiation action to execute for matter verification',
);

const negotiationMatter = worldForNegotiation.matters.find((entry) => entry.scene === 'negotiation' && entry.caseId === caseItem.id);
assert.ok(negotiationMatter, 'Expected pending closing flow to derive a negotiation matter');
assert.equal(negotiationMatter.stage, 'pending', 'Expected negotiation matter to start as pending');

advanceDays(worldForNegotiation, 1);

const resolvedNegotiationMatter = worldForNegotiation.matters.find((entry) => entry.id === negotiationMatter?.id);
assert.ok(resolvedNegotiationMatter, 'Expected negotiation matter to stay visible after settlement');
assert.equal(resolvedNegotiationMatter.stage, 'completed', 'Expected negotiation matter to resolve after daily settlement');
assert.ok(
  typeof resolvedNegotiationMatter.resolutionSummary === 'string' && resolvedNegotiationMatter.resolutionSummary.length > 0,
  'Expected negotiation matter to retain a resolution summary after settlement',
);

console.log('selling-houses matter contract verification passed');
