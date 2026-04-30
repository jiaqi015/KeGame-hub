import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  LEGACY_ACTION_EXECUTOR_IDS,
} from '../src/selling-houses/domain/engine/actionResolvers.js';
import {
  getActionExecutorContract,
} from '../src/selling-houses/domain/engine/actionExecutorContract.js';
import {
  PRICING_ACTION_EXECUTOR_IDS,
  PRICING_ACTION_EXECUTORS,
} from '../src/selling-houses/domain/engine/pricingActionExecutors.js';
import {
  ACTION_SPLIT_PLAN,
} from '../src/selling-houses/runtime/simulation/action-split-plan.js';

const actionResolversSource = readFileSync(
  'src/selling-houses/domain/engine/actionResolvers.ts',
  'utf8',
);
const pricingSource = readFileSync(
  'src/selling-houses/domain/engine/pricingActionExecutors.ts',
  'utf8',
);
const pricingFamily = ACTION_SPLIT_PLAN.familiesById.pricing;
const pricingFamilyActionIds = pricingFamily.actionIds;

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

assert.deepEqual(
  PRICING_ACTION_EXECUTOR_IDS.slice().sort(),
  pricingFamilyActionIds.slice().sort(),
  'Pricing action executor ids must match the pricing family in ACTION_SPLIT_PLAN',
);
assert.deepEqual(
  Object.keys(PRICING_ACTION_EXECUTORS).sort(),
  pricingFamilyActionIds.slice().sort(),
  'PRICING_ACTION_EXECUTORS must implement every pricing family action exactly once',
);
assert.ok(
  pricingFamilyActionIds.every((actionId) => LEGACY_ACTION_EXECUTOR_IDS.includes(actionId)),
  'Legacy action executor registry must still expose the extracted pricing actions',
);
assert.ok(
  actionResolversSource.includes('...PRICING_ACTION_EXECUTORS'),
  'actionResolvers must register pricing executors through PRICING_ACTION_EXECUTORS',
);
assert.deepEqual(
  pricingFamilyActionIds,
  ['pricing-advice', 'ask-psychological-price', 'adjust-listing-price'],
  'Pricing split family must remain the three pricing consultation actions',
);
assert.equal(
  pricingFamily.processBlockedActionIds.length,
  0,
  'Pricing family must not be blocked on process manager extraction',
);
assert.deepEqual(
  pricingFamily.immediateWrapperActionIds.slice().sort(),
  pricingFamilyActionIds.slice().sort(),
  'Pricing family must stay ready for immediate wrapper extraction',
);
assert.deepEqual(
  pricingFamily.ownerTouchActionIds.slice().sort(),
  pricingFamilyActionIds.slice().sort(),
  'Pricing family must remain owner-touching price communication actions',
);

for (const actionId of pricingFamilyActionIds) {
  const inlineExecutorKey = new RegExp(`^\\s*'${escapeRegExp(actionId)}'\\s*:`, 'm');
  assert.ok(
    !inlineExecutorKey.test(actionResolversSource),
    `actionResolvers should not keep an inline ${actionId} executor after pricing split`,
  );
  assert.ok(
    inlineExecutorKey.test(pricingSource),
    `pricingActionExecutors should own the ${actionId} executor`,
  );

  const contract = getActionExecutorContract(actionId);
  assert.equal(contract?.startsProcessKind, null, `${actionId} must not start a product process run`);
  assert.equal(contract?.resourcesManagedByTransaction, true, `${actionId} resources must stay managed by actionTransaction`);
  assert.equal(contract?.touchesOwner, true, `${actionId} must remain an owner-touching pricing action`);
}

assert.ok(Object.isFrozen(PRICING_ACTION_EXECUTOR_IDS), 'PRICING_ACTION_EXECUTOR_IDS must be frozen');

console.log('selling-houses pricing action executor split contract verification passed');
