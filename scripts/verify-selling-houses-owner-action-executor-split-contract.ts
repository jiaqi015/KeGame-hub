import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  LEGACY_ACTION_EXECUTOR_IDS,
} from '../src/selling-houses/domain/engine/actionResolvers.js';
import {
  OWNER_ACTION_EXECUTOR_IDS,
  OWNER_ACTION_EXECUTORS,
} from '../src/selling-houses/domain/engine/ownerActionExecutors.js';
import {
  ACTION_SPLIT_PLAN,
} from '../src/selling-houses/runtime/simulation/action-split-plan.js';

const actionResolversSource = readFileSync(
  'src/selling-houses/domain/engine/actionResolvers.ts',
  'utf8',
);
const ownerFamilyActionIds = ACTION_SPLIT_PLAN.familiesById.owner.actionIds;

assert.deepEqual(
  OWNER_ACTION_EXECUTOR_IDS.slice().sort(),
  ownerFamilyActionIds.slice().sort(),
  'Owner action executor ids must match the owner family in ACTION_SPLIT_PLAN',
);
assert.deepEqual(
  Object.keys(OWNER_ACTION_EXECUTORS).sort(),
  ownerFamilyActionIds.slice().sort(),
  'OWNER_ACTION_EXECUTORS must implement every owner family action exactly once',
);
assert.ok(
  ownerFamilyActionIds.every((actionId) => LEGACY_ACTION_EXECUTOR_IDS.includes(actionId)),
  'Legacy action executor registry must still expose the extracted owner actions',
);
assert.ok(
  actionResolversSource.includes('...OWNER_ACTION_EXECUTORS'),
  'actionResolvers must register owner executors through OWNER_ACTION_EXECUTORS',
);

for (const actionId of ownerFamilyActionIds) {
  assert.ok(
    !actionResolversSource.includes(`  '${actionId}':`),
    `actionResolvers should not keep an inline ${actionId} executor after owner split`,
  );
}

assert.ok(Object.isFrozen(OWNER_ACTION_EXECUTOR_IDS), 'OWNER_ACTION_EXECUTOR_IDS must be frozen');

console.log('selling-houses owner action executor split contract verification passed');
