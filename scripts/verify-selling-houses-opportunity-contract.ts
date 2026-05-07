import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { OPPORTUNITY_STAGES } from '../src/selling-houses/domain/constants.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import { resolveOpportunityLifecycleLabel } from '../src/selling-houses/domain/opportunitySplitHelper.js';
import type { Opportunity } from '../src/selling-houses/domain/models.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';

assert.ok(
  !OPPORTUNITY_STAGES.includes('成交'),
  'expected opportunity stage labels to stop before deal closing',
);

const snapshot = getScenarioSnapshotById('standard-window-chain');
if (!snapshot) {
  throw new Error('Missing builtin scenario for opportunity contract verification');
}

const world = createInitialState(snapshot, 20260420);
seedInitialOpportunities(world);
updateDerivedState(world);

assert.ok(Array.isArray(world.closedDeals), 'expected game state to expose closed deal records');
assert.equal(world.closedDeals.length, 0, 'expected new world to start without closed deal records');

assert.ok(
  world.opportunities.every((entry) =>
    entry.lifecycleStatus === 'active'
    || entry.lifecycleStatus === 'stagnated'
    || entry.lifecycleStatus === 'lost'
    || entry.lifecycleStatus === 'closed_by_deal'
    || entry.lifecycleStatus === 'closed_by_case'),
  'expected every opportunity to expose canonical lifecycle status',
);

assert.ok(
  world.matters.every((entry) => typeof entry.scene === 'string' && entry.scene.trim().length > 0),
  'expected every matter to expose a scene code',
);

const sample: Opportunity = {
  id: 'opp-contract-sample',
  caseId: 'case-1',
  customerId: 'customer-1',
  customerName: '测试客户',
  profile: '测试机会',
  channelId: 'private-referral',
  channelName: '私域转介绍',
  fit: 78,
  intent: 82,
  confidence: 76,
  stageIndex: 6,
  stageLabel: '占位',
  status: 'won',
  lifecycleStatus: 'active',
  leadSource: 'direct',
  visibility: 'revealed',
  createdDay: 1,
  daysLeft: 2,
  touchedToday: true,
  budgetMax: 800,
  priceSensitivity: 55,
  stagnationTicks: 0,
  history: [],
};

const wonResolved = resolveOpportunityLifecycleLabel('won', sample.lifecycleStatus, sample.stageIndex);
assert.equal(wonResolved.lifecycleStatus, 'closed_by_deal', 'expected won legacy status to map to closed_by_deal');
assert.notEqual(wonResolved.stageLabel, '成交', 'expected closed-by-deal label to avoid pretending stage equals deal');

const closedResolved = resolveOpportunityLifecycleLabel('closed', sample.lifecycleStatus, sample.stageIndex);
assert.equal(closedResolved.lifecycleStatus, 'closed_by_case', 'expected closed legacy status to map to closed_by_case');

const lostResolved = resolveOpportunityLifecycleLabel('lost', sample.lifecycleStatus, sample.stageIndex);
assert.equal(lostResolved.lifecycleStatus, 'lost', 'expected lost status to remain lost in canonical lifecycle');

console.log('selling-houses opportunity contract verification passed');
