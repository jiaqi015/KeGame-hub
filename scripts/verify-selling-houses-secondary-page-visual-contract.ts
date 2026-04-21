import assert from 'node:assert/strict';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import { ProfilePanel } from '../src/selling-houses/ui/features/ProfilePanel.js';
import { ResultsPanel } from '../src/selling-houses/ui/features/ResultsPanel.js';
import { Review } from '../src/selling-houses/ui/features/Review.js';

function buildWorld() {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');
  const world = createInitialState(snapshot, 20260419);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

const world = buildWorld();

const pages = {
  review: renderToStaticMarkup(React.createElement(Review, { state: world })),
  results: renderToStaticMarkup(React.createElement(ResultsPanel, { state: world, onRestart: () => {} })),
  profile: renderToStaticMarkup(React.createElement(ProfilePanel, { state: world, currentUserNickname: '当前顾问' })),
};

for (const [name, markup] of Object.entries(pages)) {
  assert.ok(markup.includes('seller-panel'), `Expected ${name} to use the shared seller panel grammar`);
  assert.ok(markup.includes('seller-tablet') || markup.includes('seller-note'), `Expected ${name} to use shared secondary surfaces`);
  assert.ok(!markup.includes('bg-white'), `Expected ${name} not to render standalone white-card classes`);
  assert.ok(!markup.includes('border-black'), `Expected ${name} not to render standalone light border classes`);
}

console.log('selling-houses secondary page visual contract verification passed');
