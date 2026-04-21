import assert from 'node:assert/strict';

import { renderToStaticMarkup } from 'react-dom/server';
import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { buildWorkspaceShellProjection } from '../src/selling-houses/application/projections/workspaceShellProjection.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import { WorkspaceRightRail } from '../src/selling-houses/SellingHousesWorkspace.js';
import { WorkspaceUtilityBar } from '../src/selling-houses/ui/widgets/WorkspaceUtilityBar.js';

function buildWorld() {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');
  const world = createInitialState(snapshot, 20260419);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

const world = buildWorld();
const shell = buildWorkspaceShellProjection(world);

const railMarkup = renderToStaticMarkup(
  WorkspaceRightRail({
    sidebar: shell.sidebar,
    onOpenJournal: () => {},
    onOpenCue: () => {},
  }),
);

assert.ok(!railMarkup.includes('当前焦点'), 'Expected right rail not to expose focus section');
assert.ok(railMarkup.includes('今日事项'), 'Expected right rail to expose matter section');
assert.ok(railMarkup.includes('风险与市场'), 'Expected right rail to expose risk and market section');
assert.ok(railMarkup.includes('经营记录'), 'Expected right rail to expose journal section');
assert.ok(railMarkup.includes(shell.sidebar.matter.headline), 'Expected right rail to render shell matter headline');
assert.ok(railMarkup.includes(shell.sidebar.journal.lastTitle), 'Expected right rail to render latest journal title');

const markup = renderToStaticMarkup(
  WorkspaceUtilityBar({
    journalTodayCount: 4,
    onOpenJournal: () => {},
    onOpenLeaderboard: () => {},
    onLogout: () => {},
  }),
);

assert.ok(markup.includes('经营记录'), 'Expected workspace utility bar to expose journal entry');
assert.ok(markup.includes('今日 4'), 'Expected workspace utility bar to show today journal count');
assert.ok(markup.includes('排行榜'), 'Expected workspace utility bar to keep leaderboard entry');

console.log('selling-houses shell contract verification passed');
