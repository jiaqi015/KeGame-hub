import assert from 'node:assert/strict';

import { createProductRun, getProductRunTemplates } from '../src/selling-houses/domain/productRuns.js';
import type { GameState, Opportunity } from '../src/selling-houses/domain/models.js';
import {
  buildProcessManagerContractsFromLegacyState,
  deriveProcessRunReadModelsFromLegacyState,
  mapLegacyProductRunToProcessReadModel,
  mapPendingClosingOpportunityToNegotiationProcess,
} from '../src/selling-houses/runtime/simulation/processes/index.js';

function buildMinimalState(): GameState {
  return {
    day: 3,
    productRuns: [],
    opportunities: [],
    eventStore: [],
  } as unknown as GameState;
}

function buildOpportunity(): Opportunity {
  return {
    id: 'opp-pending-close',
    caseId: 'case-1',
    customerId: 'customer-1',
    customerName: '流程边界客户',
    profile: 'pending closing verification',
    channelId: 'private-referral',
    channelName: '私域转介绍',
    fit: 88,
    intent: 91,
    confidence: 84,
    stageIndex: 4,
    stageLabel: '报价斡旋',
    status: 'active',
    lifecycleStatus: 'active',
    leadSource: 'direct',
    visibility: 'revealed',
    createdDay: 2,
    daysLeft: 2,
    touchedToday: true,
    budgetMax: 520,
    priceSensitivity: 45,
    stagnationTicks: 0,
    pendingClosingEvaluation: true,
    pendingClosingStrategyId: 'balanced',
    pendingClosingRequestedDay: 3,
    history: [],
  };
}

const state = buildMinimalState();
const openDayRun = createProductRun(state, 'open-day', ['case-1', 'case-2']);
const sinceritySaleRun = createProductRun(state, 'sincere-sale', ['case-1']);
const pendingOpportunity = buildOpportunity();

state.productRuns.push(openDayRun, sinceritySaleRun);
state.opportunities.push(pendingOpportunity);

const openDayProcess = mapLegacyProductRunToProcessReadModel(openDayRun);
assert.ok(openDayProcess, 'Expected open-day product run to map to a process read model');
assert.equal(openDayProcess.processType, 'open-day');
assert.equal(openDayProcess.lifecycleOwner, 'legacy-product-run');
assert.equal(openDayProcess.transitionView.managerCanMutateNow, false);
assert.equal(
  openDayProcess.milestones.length,
  getProductRunTemplates('open-day').length,
  'Expected open-day milestones to preserve the legacy template shape',
);

const sinceritySaleProcess = mapLegacyProductRunToProcessReadModel(sinceritySaleRun);
assert.ok(sinceritySaleProcess, 'Expected sincere-sale product run to map to a process read model');
assert.equal(sinceritySaleProcess.processType, 'sincerity-sale');
assert.equal(sinceritySaleProcess.legacyProductType, 'sincere-sale');
assert.equal(sinceritySaleProcess.lifecycleOwner, 'legacy-product-run');
assert.equal(
  sinceritySaleProcess.milestones.length,
  getProductRunTemplates('sincere-sale').length,
  'Expected sincerity-sale milestones to preserve the legacy template shape',
);

const negotiationProcess = mapPendingClosingOpportunityToNegotiationProcess(pendingOpportunity);
assert.ok(negotiationProcess, 'Expected pending closing opportunity to map to negotiation process');
assert.equal(negotiationProcess.processType, 'negotiation');
assert.equal(negotiationProcess.lifecycleOwner, 'legacy-opportunity-pending-closing');
assert.equal(negotiationProcess.pendingClosingEvaluation, true);
assert.equal(negotiationProcess.transitionView.currentStepId, 'pending-closing-evaluation');
assert.equal(negotiationProcess.transitionView.managerCanMutateNow, false);

const readModels = deriveProcessRunReadModelsFromLegacyState(state);
assert.equal(readModels.length, 3, 'Expected two product processes and one negotiation process');

const contracts = buildProcessManagerContractsFromLegacyState(state);
assert.equal(contracts.length, 3, 'Expected all process manager contracts');
assert.ok(
  contracts.every((contract) => contract.writes.length === 0),
  'Expected process manager boundary contracts to remain read-only',
);
assert.ok(
  contracts.every((contract) => contract.lifecycleOwnership.futureOwner === 'runtime-process-manager'),
  'Expected contracts to name the future runtime-process-manager owner',
);

const nonPendingOpportunity = {
  ...pendingOpportunity,
  id: 'opp-not-pending',
  pendingClosingEvaluation: false,
};
assert.equal(
  mapPendingClosingOpportunityToNegotiationProcess(nonPendingOpportunity),
  null,
  'Expected non-pending opportunity not to appear as a negotiation process boundary',
);

console.log('selling-houses process boundary contract verification passed');
