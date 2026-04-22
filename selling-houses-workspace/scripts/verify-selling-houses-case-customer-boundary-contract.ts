import assert from 'node:assert/strict';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import { Cases } from '../src/selling-houses/ui/features/Cases.js';
import { Opportunities } from '../src/selling-houses/ui/features/Opportunities.js';

function buildWorld() {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');
  const world = createInitialState(snapshot, 20260419);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

const world = buildWorld();

const casesMarkup = renderToStaticMarkup(
  React.createElement(Cases, {
    state: world,
    onSelectCase: () => {},
    onExecuteAction: () => true,
  }),
);

assert.ok(casesMarkup.includes('单房决策'), 'Expected cases to present itself as single-house decision workspace');
assert.ok(casesMarkup.includes('执行清单'), 'Expected cases to expose selected-house execution checklist');
assert.ok(!casesMarkup.includes('为什么是这件事'), 'Expected cases not to use global-priority framing');
assert.ok(!casesMarkup.includes('今天的推进顺序'), 'Expected cases not to use global schedule framing');

const opportunitiesMarkup = renderToStaticMarkup(
  React.createElement(Opportunities, {
    state: world,
    onSelectCase: () => {},
    onSetView: () => {},
  }),
);

assert.ok(opportunitiesMarkup.includes('关系推进池'), 'Expected opportunities to present itself as relationship pool');
assert.ok(opportunitiesMarkup.includes('已接上的关系'), 'Expected opportunities to own engaged-customer progression');
assert.ok(!opportunitiesMarkup.includes('商圈信号'), 'Expected opportunities not to own market signal feed');
assert.ok(!opportunitiesMarkup.includes('客户线在往哪里走'), 'Expected opportunities to avoid operating-desk hero framing');

console.log('selling-houses case/customer boundary contract verification passed');
