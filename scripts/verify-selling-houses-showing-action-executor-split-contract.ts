import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  LEGACY_ACTION_EXECUTOR_IDS,
} from '../src/selling-houses/domain/engine/actionResolvers.js';
import {
  getActionExecutorContract,
} from '../src/selling-houses/domain/engine/actionExecutorContract.js';
import {
  SHOWING_ACTION_EXECUTOR_IDS,
  SHOWING_ACTION_EXECUTORS,
} from '../src/selling-houses/domain/engine/showingActionExecutors.js';
import {
  ACTION_SPLIT_PLAN,
} from '../src/selling-houses/runtime/simulation/action-split-plan.js';

const actionResolversSource = readFileSync(
  'src/selling-houses/domain/engine/actionResolvers.ts',
  'utf8',
);
const showingSource = readFileSync(
  'src/selling-houses/domain/engine/showingActionExecutors.ts',
  'utf8',
);
const showingFamily = ACTION_SPLIT_PLAN.familiesById.showing;
const showingFamilyActionIds = showingFamily.actionIds;

function executorKeyRegExp(actionId: string) {
  return new RegExp(`^\\s*['"]?${actionId}['"]?\\s*:`, 'm');
}

assert.deepEqual(
  SHOWING_ACTION_EXECUTOR_IDS.slice().sort(),
  showingFamilyActionIds.slice().sort(),
  'Showing action executor ids must match the showing family in ACTION_SPLIT_PLAN',
);
assert.deepEqual(
  Object.keys(SHOWING_ACTION_EXECUTORS).sort(),
  showingFamilyActionIds.slice().sort(),
  'SHOWING_ACTION_EXECUTORS must implement every showing family action exactly once',
);
assert.deepEqual(
  showingFamilyActionIds,
  ['showing'],
  'Showing split family must remain the single showing action',
);
assert.ok(
  showingFamilyActionIds.every((actionId) => LEGACY_ACTION_EXECUTOR_IDS.includes(actionId)),
  'Legacy action executor registry must still expose the extracted showing action',
);
assert.ok(
  actionResolversSource.includes('...SHOWING_ACTION_EXECUTORS'),
  'actionResolvers must register showing executors through SHOWING_ACTION_EXECUTORS',
);
assert.equal(
  showingFamily.processBlockedActionIds.length,
  0,
  'Showing family must not be blocked on process manager extraction',
);
assert.deepEqual(
  showingFamily.immediateWrapperActionIds,
  showingFamilyActionIds,
  'Showing family must stay ready for immediate wrapper extraction',
);
assert.deepEqual(
  showingFamily.opportunityTouchActionIds,
  ['showing'],
  'Showing family must remain opportunity-touching',
);
assert.deepEqual(
  showingFamily.ownerTouchActionIds,
  [],
  'Showing family must not become owner-touching',
);
assert.ok(
  ACTION_SPLIT_PLAN.recommendedFirstSplitFamilyIds.includes('showing'),
  'Showing family must remain a recommended first split family',
);
assert.ok(
  !ACTION_SPLIT_PLAN.blockedFamilyIds.includes('showing'),
  'Showing family must not be process-blocked',
);

for (const actionId of showingFamilyActionIds) {
  const inlineExecutorKey = executorKeyRegExp(actionId);
  assert.ok(
    !inlineExecutorKey.test(actionResolversSource),
    `actionResolvers should not keep an inline ${actionId} executor after showing split`,
  );
  assert.ok(
    inlineExecutorKey.test(showingSource),
    `showingActionExecutors should own the ${actionId} executor`,
  );

  const contract = getActionExecutorContract(actionId);
  assert.equal(contract?.startsProcessKind, null, `${actionId} must not start a product process run`);
  assert.equal(contract?.resourcesManagedByTransaction, true, `${actionId} resources must stay managed by actionTransaction`);
  assert.equal(contract?.opportunityBound, true, `${actionId} must remain opportunity-bound`);
  assert.equal(contract?.touchesOwner, false, `${actionId} must not be owner-touching`);
}

assert.ok(
  showingSource.includes("refundResources(state, action, '当前没有合适的线索可以安排带看')"),
  'Showing executor must keep its no-opportunity refund path',
);
assert.ok(
  showingSource.includes('return actionSuccess(opportunity);'),
  'Showing executor must return actionSuccess(opportunity) so the wrapper can apply opportunity stage relation',
);
assert.ok(Object.isFrozen(SHOWING_ACTION_EXECUTOR_IDS), 'SHOWING_ACTION_EXECUTOR_IDS must be frozen');

console.log('selling-houses showing action executor split contract verification passed');
