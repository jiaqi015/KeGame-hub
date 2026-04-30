import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  LEGACY_ACTION_EXECUTOR_IDS,
} from '../src/selling-houses/domain/engine/actionResolvers.js';
import {
  getActionExecutorContract,
} from '../src/selling-houses/domain/engine/actionExecutorContract.js';
import {
  NEGOTIATION_ACTION_EXECUTOR_IDS,
  NEGOTIATION_ACTION_EXECUTORS,
} from '../src/selling-houses/domain/engine/negotiationActionExecutors.js';
import {
  ACTION_SPLIT_PLAN,
} from '../src/selling-houses/runtime/simulation/action-split-plan.js';

const actionResolversSource = readFileSync(
  'src/selling-houses/domain/engine/actionResolvers.ts',
  'utf8',
);
const negotiationSource = readFileSync(
  'src/selling-houses/domain/engine/negotiationActionExecutors.ts',
  'utf8',
);
const expectedNegotiationActionIds = ['invite-customer-negotiation'];

function executorKeyRegExp(actionId: string) {
  return new RegExp(`^\\s*['"]${actionId}['"]\\s*:`, 'm');
}

assert.deepEqual(
  NEGOTIATION_ACTION_EXECUTOR_IDS,
  expectedNegotiationActionIds,
  'NEGOTIATION_ACTION_EXECUTOR_IDS must stay fixed to invite-customer-negotiation',
);
assert.deepEqual(
  Object.keys(NEGOTIATION_ACTION_EXECUTORS),
  expectedNegotiationActionIds,
  'NEGOTIATION_ACTION_EXECUTORS must implement only the negotiation entry action',
);
assert.ok(
  ACTION_SPLIT_PLAN.familiesById.negotiation.actionIds.includes('invite-customer-negotiation'),
  'invite-customer-negotiation must remain classified in the negotiation family',
);
assert.ok(
  LEGACY_ACTION_EXECUTOR_IDS.includes('invite-customer-negotiation'),
  'Legacy action executor registry must still expose invite-customer-negotiation during the split',
);
assert.ok(
  actionResolversSource.includes('...NEGOTIATION_ACTION_EXECUTORS'),
  'actionResolvers must register NEGOTIATION_ACTION_EXECUTORS during phased migration',
);
assert.ok(
  !executorKeyRegExp('invite-customer-negotiation').test(actionResolversSource),
  'actionResolvers must not keep an inline invite-customer-negotiation executor after the split',
);

const contract = getActionExecutorContract('invite-customer-negotiation');
assert.equal(contract?.startsProcessKind, 'negotiation', 'invite-customer-negotiation must remain the negotiation process entry');
assert.equal(contract?.legacyExecutorOwnsProcessRun, false, 'invite-customer-negotiation must not own a ProductRun');
assert.equal(contract?.queuesPendingClosingEvaluation, true, 'invite-customer-negotiation must queue pending deal closing');
assert.equal(contract?.resourcesManagedByTransaction, true, 'invite-customer-negotiation resources must stay managed by actionTransaction');
assert.equal(contract?.opportunityBound, true, 'invite-customer-negotiation must remain opportunity-bound');

assert.ok(
  negotiationSource.includes('findBestOpportunity(state, caseItem.id, 3, 6)'),
  'negotiation executor must keep the quote-stage opportunity stage window',
);
assert.ok(
  negotiationSource.includes('queueNegotiationProcessEvaluation(state, caseItem, opportunity, optionId, onMessage)'),
  'negotiation executor must queue negotiation through the lifecycle helper',
);
assert.ok(
  negotiationSource.includes('return actionSuccess(opportunity)'),
  'negotiation executor must continue returning the touched opportunity on success',
);
assert.ok(
  !negotiationSource.includes('settlePendingDealClosings('),
  'negotiation executor must not own settlement outcome resolution',
);

console.log('selling-houses negotiation action executor split contract verification passed');
