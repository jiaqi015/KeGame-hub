import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  LEGACY_ACTION_EXECUTOR_IDS,
} from '../src/selling-houses/domain/engine/actionResolvers.js';
import {
  getActionExecutorContract,
} from '../src/selling-houses/domain/engine/actionExecutorContract.js';
import {
  MARKETING_ACTION_EXECUTOR_IDS,
  MARKETING_ACTION_EXECUTORS,
} from '../src/selling-houses/domain/engine/marketingActionExecutors.js';
import {
  ACTION_SPLIT_PLAN,
} from '../src/selling-houses/runtime/simulation/action-split-plan.js';

const actionResolversSource = readFileSync(
  'src/selling-houses/domain/engine/actionResolvers.ts',
  'utf8',
);
const marketingSource = readFileSync(
  'src/selling-houses/domain/engine/marketingActionExecutors.ts',
  'utf8',
);
const marketingFamily = ACTION_SPLIT_PLAN.familiesById.marketing;
const marketingFamilyActionIds = marketingFamily.actionIds;
const expectedMarketingActionIds = [
  'story',
  'xiaohongshu-boost',
  'broker-broadcast',
  'private-referral',
  'focus-meeting-submit',
];

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

assert.deepEqual(
  MARKETING_ACTION_EXECUTOR_IDS.slice().sort(),
  marketingFamilyActionIds.slice().sort(),
  'Marketing action executor ids must match the marketing family in ACTION_SPLIT_PLAN',
);
assert.deepEqual(
  Object.keys(MARKETING_ACTION_EXECUTORS).sort(),
  marketingFamilyActionIds.slice().sort(),
  'MARKETING_ACTION_EXECUTORS must implement every marketing family action exactly once',
);
assert.deepEqual(
  marketingFamilyActionIds,
  expectedMarketingActionIds,
  'Marketing split family must remain the non-process marketing action set',
);
assert.ok(
  marketingFamilyActionIds.every((actionId) => LEGACY_ACTION_EXECUTOR_IDS.includes(actionId)),
  'Legacy action executor registry must still expose the extracted marketing actions',
);
assert.ok(
  actionResolversSource.includes('...MARKETING_ACTION_EXECUTORS'),
  'actionResolvers must register marketing executors through MARKETING_ACTION_EXECUTORS',
);
assert.equal(
  marketingFamily.processBlockedActionIds.length,
  0,
  'Marketing family must not be blocked on process manager extraction',
);
assert.deepEqual(
  marketingFamily.immediateWrapperActionIds.slice().sort(),
  marketingFamilyActionIds.slice().sort(),
  'Marketing family must stay ready for immediate wrapper extraction',
);
assert.ok(
  ACTION_SPLIT_PLAN.recommendedFirstSplitFamilyIds.includes('marketing'),
  'Marketing family must remain a recommended first split family',
);
assert.ok(
  !ACTION_SPLIT_PLAN.blockedFamilyIds.includes('marketing'),
  'Marketing family must not be process-blocked',
);
assert.deepEqual(
  marketingFamily.ownerTouchActionIds.slice().sort(),
  ['focus-meeting-submit'],
  'Only focus-meeting-submit should be owner-touching inside marketing',
);

for (const actionId of marketingFamilyActionIds) {
  const inlineExecutorKey = new RegExp(`^\\s*'${escapeRegExp(actionId)}'\\s*:`, 'm');
  assert.ok(
    !inlineExecutorKey.test(actionResolversSource),
    `actionResolvers should not keep an inline ${actionId} executor after marketing split`,
  );
  assert.ok(
    inlineExecutorKey.test(marketingSource),
    `marketingActionExecutors should own the ${actionId} executor`,
  );

  const contract = getActionExecutorContract(actionId);
  assert.equal(contract?.startsProcessKind, null, `${actionId} must not start a product process run`);
  assert.equal(contract?.resourcesManagedByTransaction, true, `${actionId} resources must stay managed by actionTransaction`);
  assert.equal(contract?.opportunityBound, false, `${actionId} must not be an opportunity-bound executor`);
  assert.equal(
    contract?.touchesOwner,
    actionId === 'focus-meeting-submit',
    `${actionId} owner-touch contract must match marketing semantics`,
  );
}

assert.ok(Object.isFrozen(MARKETING_ACTION_EXECUTOR_IDS), 'MARKETING_ACTION_EXECUTOR_IDS must be frozen');

console.log('selling-houses marketing action executor split contract verification passed');
