import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  LEGACY_ACTION_EXECUTOR_IDS,
} from '../src/selling-houses/domain/engine/actionResolvers.js';
import {
  getActionExecutorContract,
} from '../src/selling-houses/domain/engine/actionExecutorContract.js';
import {
  ACTION_MIGRATION_PLAN,
} from '../src/selling-houses/runtime/simulation/action-migration-plan.js';
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
const sinceritySaleSource = readFileSync(
  'src/selling-houses/domain/engine/sinceritySaleActionExecutors.ts',
  'utf8',
);
const negotiationSource = readFileSync(
  'src/selling-houses/domain/engine/negotiationActionExecutors.ts',
  'utf8',
);

const processManagerRequiredActionIds = [
  'open-day',
  'sincerity-sale',
  'invite-customer-negotiation',
] as const;

assert.deepEqual(
  ACTION_SPLIT_PLAN.familiesById.process.actionIds,
  ['open-day'],
  'Process family must remain only the open-day process entry action',
);
assert.deepEqual(
  ACTION_SPLIT_PLAN.familiesById.negotiation.actionIds,
  ['sincerity-sale', 'invite-customer-negotiation'],
  'Negotiation family must remain sincere-sale plus deal-closing negotiation entry',
);
assert.deepEqual(
  ACTION_SPLIT_PLAN.blockedFamilyIds.slice().sort(),
  ['negotiation', 'process'],
  'Only process and negotiation families should remain blocked after immediate executor splits',
);
assert.deepEqual(
  ACTION_SPLIT_PLAN.recommendedFirstSplitFamilyIds.slice().sort(),
  ['marketing', 'owner', 'pricing', 'showing'],
  'Immediate split families must remain the extracted owner/pricing/marketing/showing set',
);

const processRequiredActionIds = ACTION_MIGRATION_PLAN.processManagerRequired.all.map((entry) => entry.actionId).sort();
assert.deepEqual(
  processRequiredActionIds,
  [...processManagerRequiredActionIds].sort(),
  'Process-manager-required action set must stay fixed while executor files are split out',
);

for (const actionId of processManagerRequiredActionIds) {
  assert.ok(
    LEGACY_ACTION_EXECUTOR_IDS.includes(actionId),
    `${actionId} must still be exposed by the legacy action executor registry`,
  );

  const contract = getActionExecutorContract(actionId);
  assert.ok(contract?.startsProcessKind, `${actionId} must declare a process boundary kind`);
  assert.equal(contract?.resourcesManagedByTransaction, true, `${actionId} resources must stay managed by actionTransaction`);
}

assert.ok(
  actionResolversSource.includes('...OPEN_DAY_ACTION_EXECUTORS'),
  'open-day must be registered through OPEN_DAY_ACTION_EXECUTORS after executor split',
);
assert.ok(
  actionResolversSource.includes('...SINCERITY_SALE_ACTION_EXECUTORS'),
  'sincerity-sale must be registered through SINCERITY_SALE_ACTION_EXECUTORS after executor split',
);
assert.ok(
  actionResolversSource.includes('...NEGOTIATION_ACTION_EXECUTORS'),
  'invite-customer-negotiation must be registered through NEGOTIATION_ACTION_EXECUTORS after executor split',
);

const openDay = getActionExecutorContract('open-day');
assert.equal(openDay?.startsProcessKind, 'open-day', 'open-day must remain the open-day process entry');
assert.equal(openDay?.legacyExecutorOwnsProcessRun, true, 'open-day legacy executor still owns ProductRun creation');
assert.equal(openDay?.queuesPendingClosingEvaluation, false, 'open-day must not queue deal closing');

const sinceritySale = getActionExecutorContract('sincerity-sale');
assert.equal(sinceritySale?.startsProcessKind, 'sincere-sale', 'sincerity-sale must remain the sincere-sale process entry');
assert.equal(sinceritySale?.legacyExecutorOwnsProcessRun, true, 'sincerity-sale legacy executor still owns ProductRun creation');
assert.equal(sinceritySale?.opportunityBound, true, 'sincerity-sale must remain opportunity-bound');

const inviteNegotiation = getActionExecutorContract('invite-customer-negotiation');
assert.equal(inviteNegotiation?.startsProcessKind, 'negotiation', 'invite-customer-negotiation must remain the negotiation process entry');
assert.equal(inviteNegotiation?.legacyExecutorOwnsProcessRun, false, 'invite-customer-negotiation must not own a ProductRun');
assert.equal(inviteNegotiation?.queuesPendingClosingEvaluation, true, 'invite-customer-negotiation must queue pending deal closing');
assert.equal(inviteNegotiation?.opportunityBound, true, 'invite-customer-negotiation must remain opportunity-bound');

assert.ok(
  openDaySource.includes("startActionProductRunIfNeeded(state, caseItem, 'open-day')"),
  'open-day executor must still create an open-day ProductRun before process-manager extraction',
);
assert.ok(
  sinceritySaleSource.includes("startActionProductRunIfNeeded(state, caseItem, 'sincere-sale')"),
  'sincerity-sale executor must still create a sincere-sale ProductRun through the action lifecycle helper before process-manager extraction',
);
assert.ok(
  negotiationSource.includes('queueNegotiationProcessEvaluation(state, caseItem, opportunity, optionId, onMessage)'),
  'invite-customer-negotiation executor must still route through pending negotiation lifecycle evaluation',
);
assert.ok(
  !actionResolversSource.includes('queueDealClosingEvaluation('),
  'actionResolvers must not call deal closing evaluation directly after negotiation executor split',
);
assert.ok(
  !negotiationSource.includes('settlePendingDealClosings('),
  'invite-customer-negotiation executor must not settle negotiation outcomes directly',
);

console.log('selling-houses residual legacy action executor contract verification passed');
