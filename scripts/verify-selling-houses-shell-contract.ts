import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { renderToStaticMarkup } from 'react-dom/server';
import { WorkspaceUtilityBar } from '../src/selling-houses/ui/widgets/WorkspaceUtilityBar.js';

const markup = renderToStaticMarkup(
  WorkspaceUtilityBar({
    journalTodayCount: 4,
    onOpenJournal: () => {},
    onOpenLeaderboard: () => {},
  }),
);

assert.ok(markup.includes('今日记录'), 'Expected workspace utility bar to expose journal entry');
assert.ok(markup.includes('4 条'), 'Expected workspace utility bar to show today journal count');
assert.ok(markup.includes('游戏排行榜'), 'Expected workspace utility bar to keep game leaderboard entry');
assert.ok(!markup.includes('登出账号'), 'Expected workspace utility bar not to expose logout entry');

const workspaceShellSource = readFileSync(new URL('../src/selling-houses/SellingHousesWorkspace.tsx', import.meta.url), 'utf8');
assert.ok(!workspaceShellSource.includes('routineLabel} · {runShellProjection.header.routineTheme'), 'Expected shell header to avoid routine/theme chip');

const leaderboardOverlaySource = readFileSync(new URL('../src/selling-houses/ui/features/LeaderboardOverlay.tsx', import.meta.url), 'utf8');
assert.ok(!leaderboardOverlaySource.includes('projection.heroSummary'), 'Expected leaderboard overlay to avoid redundant hero subtitle');
assert.ok(!leaderboardOverlaySource.includes('当前榜单'), 'Expected leaderboard overlay to avoid current-board summary card');
assert.ok(!leaderboardOverlaySource.includes('榜首'), 'Expected leaderboard overlay to avoid leader summary card');
assert.ok(!leaderboardOverlaySource.includes('榜单说明'), 'Expected leaderboard overlay to avoid explanation block');
assert.ok(!leaderboardOverlaySource.includes('function SummaryCard'), 'Expected leaderboard overlay not to keep summary cards');

console.log('selling-houses shell contract verification passed');
