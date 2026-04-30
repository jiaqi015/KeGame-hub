import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  LEGACY_ACTION_EXECUTOR_IDS,
} from '../src/selling-houses/domain/engine/actionResolvers.js';
import {
  getActionExecutorContract,
} from '../src/selling-houses/domain/engine/actionExecutorContract.js';
import {
  SINCERITY_SALE_ACTION_EXECUTOR_IDS,
  SINCERITY_SALE_ACTION_EXECUTORS,
} from '../src/selling-houses/domain/engine/sinceritySaleActionExecutors.js';
import {
  ACTION_SPLIT_PLAN,
} from '../src/selling-houses/runtime/simulation/action-split-plan.js';

const actionResolversSource = readFileSync(
  'src/selling-houses/domain/engine/actionResolvers.ts',
  'utf8',
);
const sinceritySaleSource = readFileSync(
  'src/selling-houses/domain/engine/sinceritySaleActionExecutors.ts',
  'utf8',
);
const expectedSinceritySaleActionIds = ['sincerity-sale'];

function executorKeyRegExp(actionId: string) {
  return new RegExp(`^\\s*['"]${actionId}['"]\\s*:`, 'm');
}

assert.deepEqual(
  SINCERITY_SALE_ACTION_EXECUTOR_IDS,
  expectedSinceritySaleActionIds,
  'SINCERITY_SALE_ACTION_EXECUTOR_IDS must stay fixed to sincerity-sale',
);
assert.deepEqual(
  Object.keys(SINCERITY_SALE_ACTION_EXECUTORS),
  expectedSinceritySaleActionIds,
  'SINCERITY_SALE_ACTION_EXECUTORS must implement only the sincerity-sale action',
);
assert.ok(
  ACTION_SPLIT_PLAN.familiesById.negotiation.actionIds.includes('sincerity-sale'),
  'sincerity-sale must remain classified in the negotiation/process-blocked family',
);
assert.ok(
  LEGACY_ACTION_EXECUTOR_IDS.includes('sincerity-sale'),
  'Legacy action executor registry must still expose sincerity-sale during the split',
);
assert.ok(
  actionResolversSource.includes('...SINCERITY_SALE_ACTION_EXECUTORS'),
  'actionResolvers must register SINCERITY_SALE_ACTION_EXECUTORS during phased migration',
);
assert.ok(
  !executorKeyRegExp('sincerity-sale').test(actionResolversSource),
  'actionResolvers must not keep an inline sincerity-sale executor after the split',
);

const sinceritySaleContract = getActionExecutorContract('sincerity-sale');
assert.equal(
  sinceritySaleContract?.startsProcessKind,
  'sincere-sale',
  'sincerity-sale must remain the sincere-sale process entry',
);
assert.equal(
  sinceritySaleContract?.legacyExecutorOwnsProcessRun,
  true,
  'sincerity-sale process run must remain owned by the executor until the new manager takes over',
);
assert.equal(
  sinceritySaleContract?.resourcesManagedByTransaction,
  true,
  'sincerity-sale resources must stay managed by actionTransaction',
);
assert.equal(sinceritySaleContract?.opportunityBound, true, 'sincerity-sale must remain opportunity-bound');

assert.ok(
  sinceritySaleSource.includes('SINCERITY_SALE_ACTION_EXECUTORS'),
  'sinceritySaleActionExecutors must export SINCERITY_SALE_ACTION_EXECUTORS',
);
assert.ok(
  sinceritySaleSource.includes('findBestOpportunity(state, caseItem.id, 2, 6)'),
  'sincerity-sale executor must keep the opportunity stage window',
);
assert.ok(
  sinceritySaleSource.includes("startActionProductRunIfNeeded(state, caseItem, 'sincere-sale')"),
  'sincerity-sale executor must keep sincere-sale ProductRun creation until a new manager owns it',
);
assert.ok(
  sinceritySaleSource.includes('return actionSuccess(opportunity)'),
  'sincerity-sale executor must continue returning the touched opportunity on success',
);

console.log('selling-houses sincerity-sale action executor split contract verification passed');
