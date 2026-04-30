import assert from 'node:assert/strict';

import { ACTIONS } from '../src/selling-houses/domain/constants.js';
import {
  ACTION_EXECUTOR_CONTRACTS,
  getActionExecutorContract,
} from '../src/selling-houses/domain/engine/actionExecutorContract.js';
import {
  ACTION_BOUNDARY_REPORT,
  buildActionBoundaryReport,
} from '../src/selling-houses/runtime/simulation/action-boundary-report.js';

const report = buildActionBoundaryReport();
const actionIds = ACTIONS.map((entry) => entry.id);

assert.deepEqual(report, ACTION_BOUNDARY_REPORT, 'Expected the exported report to match the report builder output');
assert.equal(report.actionCount, ACTIONS.length, 'Expected report action count to match ACTIONS');
assert.equal(report.contractCount, ACTION_EXECUTOR_CONTRACTS.length, 'Expected report contract count to match registry');
assert.equal(report.actions.length, ACTIONS.length, 'Expected report actions to cover every action definition');
assert.equal(report.actions.length, ACTION_EXECUTOR_CONTRACTS.length, 'Expected report actions to cover every executor contract');
assert.equal(
  Object.values(report.byProcessKind).reduce((total, entries) => total + entries.length, 0),
  report.actions.length,
  'Expected process-kind groups to partition report actions',
);
assert.deepEqual(report.missingActionIds, [], 'Expected every action to appear in the action boundary report');
assert.deepEqual(
  report.missingActionIds,
  actionIds.filter((actionId) => !report.actions.some((entry) => entry.actionId === actionId)),
  'Expected missing action ids to be derived from ACTIONS coverage',
);

for (const action of ACTIONS) {
  const contract = getActionExecutorContract(action.id);
  const entry = report.actions.find((candidate) => candidate.actionId === action.id);
  assert.ok(contract, `Expected action ${action.id} to have an executor contract`);
  assert.ok(entry, `Expected report to include action ${action.id}`);
  assert.equal(entry?.executorId, contract?.executorId, `Expected ${action.id} executor id to mirror contract`);
  assert.equal(entry?.processKind, contract?.startsProcessKind ?? 'none', `Expected ${action.id} process kind to mirror contract`);
  assert.equal(entry?.resourcesManagedByTransaction, true, `Expected ${action.id} resources to stay transaction-managed`);
}

assert.equal(
  report.summary.transactionManagedCount,
  ACTIONS.length,
  'Expected all action resources to be managed by actionTransaction',
);
assert.ok(
  report.actions.every((entry) => entry.resourcesManagedByTransaction),
  'Expected all report actions to be marked transaction-managed',
);

assert.deepEqual(
  report.byProcessKind['open-day'].map((entry) => entry.actionId),
  ['open-day'],
  'Expected only open-day to start the open-day process boundary',
);
assert.deepEqual(
  report.byProcessKind['sincere-sale'].map((entry) => entry.actionId),
  ['sincerity-sale'],
  'Expected sincerity-sale action to start the sincere-sale process boundary',
);
assert.deepEqual(
  report.byProcessKind.negotiation.map((entry) => entry.actionId),
  ['invite-customer-negotiation'],
  'Expected invite-customer-negotiation to start the negotiation process boundary',
);
assert.equal(
  report.byProcessKind.none.length,
  ACTIONS.length - 3,
  'Expected non-process actions to be grouped under none',
);

const openDay = report.actionsById['open-day'];
const sinceritySale = report.actionsById['sincerity-sale'];
const negotiation = report.actionsById['invite-customer-negotiation'];

assert.equal(openDay?.legacyExecutorOwnsProcessRun, true, 'Expected open-day to remain legacy process owned');
assert.equal(sinceritySale?.legacyExecutorOwnsProcessRun, true, 'Expected sincerity-sale to remain legacy process owned');
assert.equal(
  negotiation?.queuesPendingClosingEvaluation,
  true,
  'Expected invite-customer-negotiation to queue pending closing evaluation',
);

assert.deepEqual(
  report.migrationReadiness.waitForProcessManager.openDayActionIds,
  ['open-day'],
  'Expected open-day migrations to wait for process manager ownership',
);
assert.deepEqual(
  report.migrationReadiness.waitForProcessManager.sincereSaleActionIds,
  ['sincerity-sale'],
  'Expected sincere-sale migrations to wait for process manager ownership',
);
assert.deepEqual(
  report.migrationReadiness.waitForProcessManager.negotiationActionIds,
  ['invite-customer-negotiation'],
  'Expected negotiation migrations to wait for pending-closing manager ownership',
);
assert.ok(
  report.migrationReadiness.executorWrapperReadyActionIds.every((actionId) => (
    !report.migrationReadiness.waitForProcessManager.allActionIds.includes(actionId)
  )),
  'Expected executor-wrapper-ready actions not to include process-manager-owned actions',
);

console.log('selling-houses runtime action boundary report contract verification passed');
