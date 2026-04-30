import assert from 'node:assert/strict';

import {
  ACTION_EXECUTOR_CONTRACTS,
  ACTION_EXECUTOR_CONTRACT_BY_EXECUTOR_ID,
  getActionExecutorContract,
  getActionsMissingExecutorContract,
} from '../src/selling-houses/domain/engine/actionExecutorContract.js';
import { LEGACY_ACTION_EXECUTOR_IDS } from '../src/selling-houses/domain/engine/actionResolvers.js';
import { ACTIONS } from '../src/selling-houses/domain/constants.js';
import { getActionStageRelation } from '../src/selling-houses/domain/actionStageRelations.js';

const executorIds = ACTIONS.map((entry) => entry.executorId || entry.id);
const uniqueExecutorIds = Array.from(new Set(executorIds));

assert.deepEqual(
  getActionsMissingExecutorContract(),
  [],
  'Expected every action executor to have a boundary contract or explicit gap',
);
assert.equal(
  ACTION_EXECUTOR_CONTRACTS.length,
  uniqueExecutorIds.length,
  'Expected one executor boundary contract per executor id',
);
assert.equal(
  Object.keys(ACTION_EXECUTOR_CONTRACT_BY_EXECUTOR_ID).length,
  ACTION_EXECUTOR_CONTRACTS.length,
  'Expected executor contract registry keys to be unique',
);
assert.deepEqual(
  new Set(LEGACY_ACTION_EXECUTOR_IDS),
  new Set(uniqueExecutorIds),
  'Expected legacy action executor table to cover the same executor ids as ACTIONS',
);

for (const action of ACTIONS) {
  const executorId = action.executorId || action.id;
  const contract = getActionExecutorContract(action.id);
  assert.ok(contract, `Expected action ${action.id} to resolve an executor contract`);
  assert.equal(contract?.actionId, action.id, `Expected action ${action.id} to keep its action id in the contract`);
  assert.equal(contract?.executorId, executorId, `Expected action ${action.id} to keep executor id ${executorId}`);
  assert.equal(
    contract?.stageRelation.actionId,
    executorId,
    `Expected action ${action.id} contract to bind stage relation by executor id`,
  );
  assert.deepEqual(
    contract?.stageRelation,
    getActionStageRelation(executorId),
    `Expected action ${action.id} contract to reference the canonical stage relation`,
  );
  assert.equal(
    contract?.resourcesManagedByTransaction,
    true,
    `Expected action ${action.id} resources to remain managed by actionTransaction`,
  );
}

const revealsOwnerState = ACTION_EXECUTOR_CONTRACTS.filter((entry) => entry.revealsOwnerState);
assert.deepEqual(
  revealsOwnerState.map((entry) => entry.executorId),
  ['first-visit'],
  'Expected only first-visit to reveal owner state',
);

for (const contract of ACTION_EXECUTOR_CONTRACTS) {
  if (contract.opportunityBound) {
    assert.ok(
      contract.stageRelation.opportunityStageWindow,
      `Expected opportunity-bound executor ${contract.executorId} to declare an opportunity stage window`,
    );
  }

  assert.equal(
    contract.touchesOwner,
    contract.stageRelation.touchesOwner === true,
    `Expected touchesOwner to be derived from stage relation for ${contract.executorId}`,
  );
  assert.equal(
    contract.opportunityBound,
    contract.stageRelation.availabilityKind === 'opportunity-bound',
    `Expected opportunityBound to be derived from stage relation for ${contract.executorId}`,
  );
}

const negotiation = getActionExecutorContract('invite-customer-negotiation');
assert.equal(
  negotiation?.startsProcessKind,
  'negotiation',
  'Expected invite-customer-negotiation contract to start the negotiation process boundary',
);
assert.equal(
  negotiation?.queuesPendingClosingEvaluation,
  true,
  'Expected invite-customer-negotiation contract to queue pending closing evaluation',
);

const openDay = getActionExecutorContract('open-day');
assert.equal(openDay?.startsProcessKind, 'open-day', 'Expected open-day to start an open-day process');
assert.equal(
  openDay?.legacyExecutorOwnsProcessRun,
  true,
  'Expected open-day process run to remain owned by the legacy executor',
);

const sinceritySale = getActionExecutorContract('sincerity-sale');
assert.equal(sinceritySale?.startsProcessKind, 'sincere-sale', 'Expected sincerity-sale to start a sincere-sale process');
assert.equal(
  sinceritySale?.legacyExecutorOwnsProcessRun,
  true,
  'Expected sincerity-sale process run to remain owned by the legacy executor',
);

console.log('selling-houses action executor boundary contract verification passed');
