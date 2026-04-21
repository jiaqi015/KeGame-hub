import assert from 'node:assert/strict';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import { Dashboard } from '../src/selling-houses/ui/features/Dashboard.js';
import { Market } from '../src/selling-houses/ui/features/Market.js';

function buildWorld() {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');
  const world = createInitialState(snapshot, 20260419);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

const world = buildWorld();

const dashboardMarkup = renderToStaticMarkup(
  React.createElement(Dashboard, {
    state: world,
    onSelectCase: () => {},
    onSetView: () => {},
    onOpenMarket: () => {},
  }),
);

assert.ok(dashboardMarkup.includes('分诊'), 'Expected overview to present itself as triage');
assert.ok(dashboardMarkup.includes('去房源'), 'Expected overview to route into cases instead of replacing cases');
assert.ok(dashboardMarkup.includes('去客户'), 'Expected overview to route into customer pool instead of replacing customers');
assert.ok(!dashboardMarkup.includes('外部发生了什么'), 'Expected overview not to own the market feed');
assert.ok(!dashboardMarkup.includes('今天市场变化'), 'Expected overview not to render market changes as a first-level section');

const marketMarkup = renderToStaticMarkup(
  React.createElement(Market, {
    state: world,
    onSelectCase: () => {},
    onOpenCases: () => {},
  }),
);

assert.ok(marketMarkup.includes('外因解释'), 'Expected market to present itself as external-cause explanation');
assert.ok(marketMarkup.includes('变化链路'), 'Expected market to explain how external signals travel through layers');
assert.ok(!marketMarkup.includes('今天先怎么做'), 'Expected market not to own shell triage actions');
assert.ok(!marketMarkup.includes('先动的哪里最弱'), 'Expected market not to issue action-priority copy');
assert.ok(!marketMarkup.includes('先看哪套房'), 'Expected market not to duplicate case triage');

console.log('selling-houses page responsibility contract verification passed');
