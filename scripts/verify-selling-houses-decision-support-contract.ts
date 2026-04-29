import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { buildDecisionSupportContextFromLegacyState } from '../src/selling-houses/runtime/decision-support/index.js';
import {
  ACTION_SPECS,
  ACTION_SPEC_BY_ID,
  DECISION_MOMENTS,
} from '../src/selling-houses/core/business-rules/index.js';
import type { GameState } from '../src/selling-houses/domain/models.js';

const snapshot = getScenarioSnapshotById('standard-window-chain');
assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');

function stableStateJson(world: GameState) {
  return JSON.stringify(world);
}

function attemptMutation(mutate: () => void) {
  try {
    mutate();
  } catch {
    return;
  }
}

const world = createInitialState(snapshot, 20260429);
world.day = 3;
world.cases.forEach((caseItem, index) => {
  caseItem.status = 'active';
  caseItem.hasCompletedFirstVisit = index !== 0;
  caseItem.lastOwnerTouchedDay = index === 0 ? 0 : Math.max(1, world.day - 2);
  caseItem.touchedOwnerToday = false;
  caseItem.openDayCooldown = 0;
});
updateDerivedState(world);

const before = stableStateJson(world);
const context = buildDecisionSupportContextFromLegacyState(world);
const after = stableStateJson(world);

assert.equal(after, before, 'Expected decision-support adapter not to mutate GameState');
assert.equal(context.readOnly, true, 'Expected decision-support context to declare read-only behavior');
assert.equal(context.source, 'legacy-game-state-read-model', 'Expected context to declare legacy read-model source');

assert.notEqual(context.actionSpecs, ACTION_SPECS, 'Expected actionSpecs to be a read-model copy, not the shared core array');
assert.notEqual(
  context.decisionMoments,
  DECISION_MOMENTS,
  'Expected decisionMoments to be a read-model copy, not the shared core array',
);
assert.ok(Object.isFrozen(context.actionSpecs), 'Expected actionSpecs read-model list to be frozen');
assert.ok(Object.isFrozen(context.decisionMoments), 'Expected decisionMoments read-model list to be frozen');

const contextActionSpec = context.actionSpecs.find((spec) => spec.metricFocus.length > 0) || context.actionSpecs[0];
assert.ok(contextActionSpec, 'Expected at least one action spec in decision-support context');
const globalActionSpec = ACTION_SPECS.find((spec) => spec.id === contextActionSpec.id);
assert.ok(globalActionSpec, `Expected global action spec ${contextActionSpec.id} to exist`);
assert.notEqual(contextActionSpec, globalActionSpec, 'Expected action spec entries to be copied');
assert.ok(Object.isFrozen(contextActionSpec), 'Expected action spec entries to be frozen');
assert.ok(Object.isFrozen(contextActionSpec.metricFocus), 'Expected nested action spec metricFocus to be frozen');
assert.ok(Object.isFrozen(contextActionSpec.decisionMomentIds), 'Expected nested action spec decisionMomentIds to be frozen');
assert.ok(Object.isFrozen(contextActionSpec.businessFlowIds), 'Expected nested action spec businessFlowIds to be frozen');

const originalActionSpecName = globalActionSpec.name;
const originalMetricFocus = [...globalActionSpec.metricFocus];
attemptMutation(() => {
  (contextActionSpec as unknown as { name: string }).name = '__mutated_action_spec__';
});
attemptMutation(() => {
  (contextActionSpec.metricFocus as unknown as string[]).push('__mutated_metric__');
});
assert.equal(globalActionSpec.name, originalActionSpecName, 'Mutating decision-support action spec must not mutate global ACTION_SPECS');
assert.deepEqual(
  globalActionSpec.metricFocus,
  originalMetricFocus,
  'Mutating decision-support action spec arrays must not mutate global ACTION_SPECS',
);
assert.equal(contextActionSpec.name, originalActionSpecName, 'Frozen decision-support action spec should reject name mutation');
assert.deepEqual(
  contextActionSpec.metricFocus,
  originalMetricFocus,
  'Frozen decision-support action spec should reject nested metric mutation',
);

const contextDecisionMoment = context.decisionMoments[0];
assert.ok(contextDecisionMoment, 'Expected at least one decision moment in decision-support context');
const globalDecisionMoment = DECISION_MOMENTS.find((moment) => moment.id === contextDecisionMoment.id);
assert.ok(globalDecisionMoment, `Expected global decision moment ${contextDecisionMoment.id} to exist`);
assert.notEqual(contextDecisionMoment, globalDecisionMoment, 'Expected decision moment entries to be copied');
assert.ok(Object.isFrozen(contextDecisionMoment), 'Expected decision moment entries to be frozen');
assert.ok(Object.isFrozen(contextDecisionMoment.triggerActionIds), 'Expected nested decision moment triggerActionIds to be frozen');

const originalDecisionMomentName = globalDecisionMoment.name;
const originalTriggerActionIds = [...globalDecisionMoment.triggerActionIds];
attemptMutation(() => {
  (contextDecisionMoment as unknown as { name: string }).name = '__mutated_decision_moment__';
});
attemptMutation(() => {
  (contextDecisionMoment.triggerActionIds as unknown as string[]).push('__mutated_action__');
});
assert.equal(
  globalDecisionMoment.name,
  originalDecisionMomentName,
  'Mutating decision-support decision moment must not mutate global DECISION_MOMENTS',
);
assert.deepEqual(
  globalDecisionMoment.triggerActionIds,
  originalTriggerActionIds,
  'Mutating decision-support decision moment arrays must not mutate global DECISION_MOMENTS',
);
assert.equal(
  contextDecisionMoment.name,
  originalDecisionMomentName,
  'Frozen decision-support decision moment should reject name mutation',
);
assert.deepEqual(
  contextDecisionMoment.triggerActionIds,
  originalTriggerActionIds,
  'Frozen decision-support decision moment should reject nested trigger mutation',
);

const activeCases = world.cases.filter((caseItem) => caseItem.status === 'active');
assert.equal(context.cases.length, activeCases.length, 'Expected every active case to get decision-support context');

activeCases.forEach((caseItem) => {
  const caseContext = context.cases.find((entry) => entry.caseId === caseItem.id);
  assert.ok(caseContext, `Expected decision-support context for active case ${caseItem.id}`);
  assert.equal(caseContext?.assetScore.modelId, 'asset-score', 'Expected active case to include assetScore');
  assert.equal(
    caseContext?.ownerReadiness.modelId,
    'owner-decision-readiness',
    'Expected active case to include ownerReadiness',
  );
});

const caseDecisionMoment = context.cases
  .flatMap((caseContext) => caseContext.decisionMoments)
  .find((moment) => moment.id === contextDecisionMoment.id);
assert.ok(caseDecisionMoment, 'Expected case-level decision moments to use the same read-model DTO shape');
assert.notEqual(caseDecisionMoment, globalDecisionMoment, 'Expected case-level decision moments not to expose global definitions');
assert.ok(Object.isFrozen(caseDecisionMoment), 'Expected case-level decision moments to be frozen');

context.cases.forEach((caseContext) => {
  caseContext.recommendationDrafts.forEach((draft) => {
    const actionSpec = ACTION_SPEC_BY_ID[draft.actionSpecId];
    assert.ok(actionSpec, `Expected draft ${draft.id} to reference a valid action spec`);
    assert.equal(
      draft.legacyActionId,
      actionSpec.legacyActionId,
      `Expected draft ${draft.id} to preserve action spec legacy action id`,
    );
    draft.decisionMomentIds.forEach((momentId) => {
      assert.ok(
        DECISION_MOMENTS.some((moment) => moment.id === momentId),
        `Expected draft ${draft.id} to reference valid decision moment ${momentId}`,
      );
    });
  });
});

assert.ok(DECISION_MOMENTS.length > 0, 'Expected business-rule decision moments to exist');
assert.ok(
  context.decisionMoments.every((moment) => typeof moment.summary === 'string' && moment.summary.length > 0),
  'Expected decision moments to exist as business-rule definitions, independent from old recommendation text',
);
assert.ok(
  context.cases.some((caseContext) => caseContext.decisionMoments.length > 0),
  'Expected at least one active case to surface a decision moment through decision support',
);

console.log('selling-houses decision-support contract verification passed');
