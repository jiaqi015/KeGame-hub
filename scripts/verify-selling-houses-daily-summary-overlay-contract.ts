import assert from 'node:assert/strict';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { advanceOneDay, executeAction, seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { DailySummaryOverlay } from '../src/selling-houses/ui/features/DailySummaryOverlay.js';
import { asWritableCase, asWritableOpportunity } from '../src/selling-houses/domain/models.js';

const snapshot = getScenarioSnapshotById('standard-window-chain');
assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');

const world = createInitialState(snapshot, 20260421);
seedInitialOpportunities(world);
updateDerivedState(world);

const caseItem = world.cases[0];
assert.ok(caseItem, 'Expected at least one case for daily summary overlay contract');
const opportunity = world.opportunities.find((entry) => entry.caseId === caseItem.id && entry.status === 'active');
assert.ok(opportunity, 'Expected active opportunity for daily summary overlay contract');
if (!opportunity) {
  throw new Error('Expected active opportunity for daily summary overlay contract');
}

caseItem.askPrice = caseItem.marketPrice;
asWritableCase(caseItem).trust = 100;
caseItem.competitiveness = 100;
caseItem.hasCompletedFirstVisit = true;
opportunity.intent = 100;
opportunity.confidence = 100;
asWritableOpportunity(opportunity).stageIndex = 4;
opportunity.daysLeft = 3;
updateDerivedState(world);

assert.equal(
  executeAction(world, 'invite-customer-negotiation', caseItem, 'close'),
  true,
  'Expected negotiation action to execute before daily summary settlement',
);

const tickResult = advanceOneDay(world);
assert.ok(tickResult?.report, 'Expected daily settlement to create summary report');

const markup = renderToStaticMarkup(
  React.createElement(DailySummaryOverlay, {
    report: tickResult.report,
    tickResult,
    onContinue: () => {},
  }),
);

assert.ok(markup.includes('今天影响到哪里'), 'Expected daily summary overlay to show dirty scope section');
assert.ok(markup.includes('昨日总分'), 'Expected daily summary overlay to show yesterday total score');
assert.ok(markup.includes('总分变化'), 'Expected daily summary overlay to show total score delta');
assert.ok(markup.includes('客户线变化'), 'Expected daily summary overlay to show readable D1 delta label');
assert.ok(markup.includes('业主配合变化'), 'Expected daily summary overlay to show readable D3 delta label');
assert.ok(markup.includes('业主信任变化'), 'Expected daily summary overlay to show owner trust delta');
assert.ok(markup.includes('今日关注'), 'Expected daily summary overlay to rename priority section');
assert.ok(markup.includes('系统提醒'), 'Expected daily summary overlay to show invariant alert section');
assert.ok(markup.includes(caseItem.title), 'Expected daily summary overlay to include affected case title');
assert.ok(markup.includes(caseItem.district), 'Expected daily summary overlay to include affected district');
assert.ok(markup.includes(opportunity.customerName), 'Expected daily summary overlay to include affected customer name');
assert.ok(!markup.includes('漏斗健康'), 'Expected daily summary overlay not to show technical D1 label');
assert.ok(!markup.includes('业主意愿'), 'Expected daily summary overlay not to show technical D3 label');
assert.ok(!markup.includes('pts'), 'Expected daily summary overlay not to show English point units');
assert.ok(!markup.includes(`房源 ${caseItem.id}`), 'Expected daily summary overlay not to expose technical case ids');
assert.ok(!markup.includes(`客户 ${opportunity.customerId}`), 'Expected daily summary overlay not to expose technical customer ids');
assert.ok(!/\b(?:case|cus|opp|event|matter|run)-/.test(markup), 'Expected daily summary overlay not to expose technical tokens');

console.log('selling-houses daily summary overlay contract verification passed');
