import assert from 'node:assert/strict';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { OPPORTUNITY_STAGES } from '../src/selling-houses/domain/constants.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { refreshOpportunityLabel, seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import type { Opportunity } from '../src/selling-houses/domain/models.js';

function buildWorld() {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');
  const world = createInitialState(snapshot, 20260421);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

function scoreForStage(stageIndex: number) {
  const world = buildWorld();
  const targetCase = world.cases[0];
  assert.ok(targetCase, 'Expected at least one case');

  world.opportunities = Array.from({ length: 3 }, (_, index) => {
    const entry: Opportunity = {
      id: `opp-scoring-${stageIndex}-${index + 1}`,
      caseId: targetCase.id,
      customerId: `customer-scoring-${index + 1}`,
      customerName: `评分客户${index + 1}`,
      profile: '评分口径验证',
      channelId: 'private-referral',
      channelName: '私域转介绍',
      fit: 82,
      intent: 86,
      confidence: 80,
      stageIndex,
      stageLabel: OPPORTUNITY_STAGES[stageIndex],
      status: 'active',
      lifecycleStatus: 'active',
      leadSource: 'direct',
      visibility: 'revealed',
      createdDay: world.day,
      daysLeft: 3,
      touchedToday: true,
      budgetMax: targetCase.askPrice + 30,
      priceSensitivity: 52,
      stagnationTicks: 0,
      history: [{ day: world.day, stage: OPPORTUNITY_STAGES[stageIndex] }],
    };
    refreshOpportunityLabel(entry);
    return entry;
  });

  updateDerivedState(world);
  return targetCase.d1;
}

const viewedScore = scoreForStage(3);
const revisitedScore = scoreForStage(4);
const meetingScore = scoreForStage(5);
const offeredScore = scoreForStage(6);

assert.ok(revisitedScore > viewedScore, 'Expected 再次看房 to contribute more than 已看房 in D1');
assert.ok(meetingScore > revisitedScore, 'Expected 见面沟通 to contribute more than 再次看房 in D1');
assert.ok(offeredScore > meetingScore, 'Expected 出价 to contribute more than 见面沟通 in D1');

console.log('selling-houses scoring contract verification passed');
