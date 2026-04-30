import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  LEGACY_ACTION_EXECUTOR_IDS,
} from '../src/selling-houses/domain/engine/actionResolvers.js';
import {
  getActionExecutorContract,
} from '../src/selling-houses/domain/engine/actionExecutorContract.js';
import {
  OPEN_DAY_ACTION_EXECUTOR_IDS,
  OPEN_DAY_ACTION_EXECUTORS,
} from '../src/selling-houses/domain/engine/openDayActionExecutors.js';
import {
  ACTION_SPLIT_PLAN,
} from '../src/selling-houses/runtime/simulation/action-split-plan.js';

const actionResolversSource = readFileSync(
  'src/selling-houses/domain/engine/actionResolvers.ts',
  'utf8',
);
const openDaySource = readFileSync(
  'src/selling-houses/domain/engine/openDayActionExecutors.ts',
  'utf8',
);
const openDayFamily = ACTION_SPLIT_PLAN.familiesById.process;
const expectedOpenDayActionIds = ['open-day'];

function executorKeyRegExp(actionId: string) {
  return new RegExp(`^\\s*['"]${actionId}['"]\\s*:`, 'm');
}

assert.deepEqual(
  openDayFamily.actionIds,
  expectedOpenDayActionIds,
  'Open-day process split family must remain the single open-day action',
);
assert.deepEqual(
  OPEN_DAY_ACTION_EXECUTOR_IDS,
  openDayFamily.actionIds,
  'OPEN_DAY_ACTION_EXECUTOR_IDS must match the process family in ACTION_SPLIT_PLAN',
);
assert.deepEqual(
  OPEN_DAY_ACTION_EXECUTOR_IDS,
  expectedOpenDayActionIds,
  'OPEN_DAY_ACTION_EXECUTOR_IDS must stay fixed to open-day',
);
assert.deepEqual(
  Object.keys(OPEN_DAY_ACTION_EXECUTORS),
  expectedOpenDayActionIds,
  'OPEN_DAY_ACTION_EXECUTORS must implement only the open-day action',
);
assert.ok(
  LEGACY_ACTION_EXECUTOR_IDS.includes('open-day'),
  'Legacy action executor registry must still expose open-day during the split',
);
assert.ok(
  executorKeyRegExp('open-day').test(actionResolversSource)
    || actionResolversSource.includes('...OPEN_DAY_ACTION_EXECUTORS'),
  'actionResolvers must keep inline open-day or register OPEN_DAY_ACTION_EXECUTORS during phased migration',
);

const openDayContract = getActionExecutorContract('open-day');
assert.equal(openDayContract?.startsProcessKind, 'open-day', 'open-day must start the open-day process kind');
assert.equal(
  openDayContract?.legacyExecutorOwnsProcessRun,
  true,
  'open-day process run must remain owned by the legacy executor until the new manager takes over',
);
assert.equal(
  openDayContract?.resourcesManagedByTransaction,
  true,
  'open-day resources must stay managed by actionTransaction',
);
assert.equal(openDayContract?.opportunityBound, false, 'open-day must not be opportunity-bound');

assert.ok(
  openDaySource.includes('OPEN_DAY_ACTION_EXECUTORS'),
  'openDayActionExecutors must export OPEN_DAY_ACTION_EXECUTORS',
);
assert.ok(
  openDaySource.includes('openDayCooldown = 4'),
  'open-day executor must keep the four-day cooldown',
);
assert.ok(
  openDaySource.includes('startActionProductRunIfNeeded')
    || openDaySource.includes('createProductRun'),
  'open-day executor must keep product run creation until a new manager owns it',
);
assert.ok(
  openDaySource.includes('return true'),
  'open-day executor must continue returning true on success',
);

console.log('selling-houses open-day action executor split contract verification passed');
