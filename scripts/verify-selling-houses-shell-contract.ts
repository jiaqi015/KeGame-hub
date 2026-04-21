import assert from 'node:assert/strict';

import { renderToStaticMarkup } from 'react-dom/server';
import { WorkspaceUtilityBar } from '../src/selling-houses/ui/widgets/WorkspaceUtilityBar.js';

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
