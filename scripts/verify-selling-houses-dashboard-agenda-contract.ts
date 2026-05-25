import assert from 'node:assert/strict';

import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import {
  buildDashboardProjection,
} from '../src/selling-houses/application/projections/operatingProjection.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { Dashboard } from '../src/selling-houses/ui/features/Dashboard.js';
import { asWritableOpportunity } from '../src/selling-houses/domain/models.js';

const snapshot = getScenarioSnapshotById('standard-window-chain');
assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');

const world = createInitialState(snapshot, 20260419);
seedInitialOpportunities(world);
world.day = 5;
world.currentDate = '2026-04-24';

const leadCase = world.cases[0];
assert.ok(leadCase, 'Expected a lead case');
leadCase.hasCompletedFirstVisit = true;
leadCase.heat = 70;
leadCase.stageIndex = 2;
leadCase.windowDays = 8;

const leadOpportunity = world.opportunities.find((entry) => entry.caseId === leadCase.id);
assert.ok(leadOpportunity, 'Expected a lead opportunity');
leadOpportunity.daysLeft = 0.5;
asWritableOpportunity(leadOpportunity).stageIndex = 1;
leadOpportunity.status = 'active';
leadOpportunity.visibility = 'revealed';
leadOpportunity.intent = 80;

updateDerivedState(world);

const dashboard = buildDashboardProjection(world);
const fixedWithAction = dashboard.arrangement.fixedItems.find((item) => item.actionId);
const fixedActionLabels = dashboard.arrangement.fixedItems
  .filter((item) => item.actionId && item.actionId !== 'focus-meeting-submit')
  .map((item) => item.ctaLabel);

assert.ok(fixedWithAction, 'Expected fixed agenda item to expose an action entry');
assert.equal(fixedWithAction?.ctaLabel, '进入情景', 'Expected fixed agenda action to open a scene entry');
assert.ok(
  fixedActionLabels.length > 0 && fixedActionLabels.every((label) => label === '进入情景'),
  'Expected fixed agenda action entries to use scene-entry copy',
);

const markup = renderToStaticMarkup(
  React.createElement(Dashboard, {
    state: world,
    wechatReadIds: new Set<string>(),
    onSelectCase: () => {},
    onExecuteAction: () => false,
    onEnterScenarioAction: () => true,
    onAddToToday: () => false,
    onRemoveFromToday: () => false,
    onExecuteTodayItem: () => false,
    onCaptureOpportunity: () => false,
    onSetView: () => {},
    onOpenMarket: () => {},
    onOpenCaseFromWechat: () => {},
    onMarkWechatRead: () => {},
    onAdvanceToDay: () => {},
  }),
);

const fixedIndex = markup.indexOf('固定/临时事项');
const recommendedIndex = markup.indexOf('推荐动作排行');

assert.ok(fixedIndex >= 0, 'Expected agenda markup to render fixed item group');
assert.ok(recommendedIndex >= 0, 'Expected agenda markup to render recommendation group');
assert.ok(
  fixedIndex < recommendedIndex,
  'Expected fixed agenda group to render before recommendation group',
);
assert.ok(markup.includes('进入情景'), 'Expected fixed agenda card to render scene entry copy');

console.log('selling-houses dashboard agenda contract verification passed');
