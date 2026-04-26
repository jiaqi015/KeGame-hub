import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  clearSavedGameState,
  getGameStateStorageKey,
  loadSavedState,
  saveGameState,
} from '../src/selling-houses/application/gameState.js';
import {
  buildSellingHousesPlayerContext,
} from '../src/selling-houses/application/playerContext.js';
import {
  clearMaintainerCloudMeta,
  loadMaintainerCloudMeta,
  saveMaintainerCloudMeta,
} from '../src/selling-houses/application/cloudState.js';
import {
  isDefaultSellingHousesStorageProfile,
  resolveSellingHousesStorageProfileFromSearch,
  shouldSyncSellingHousesProfileToCloud,
} from '../src/selling-houses/application/storageProfile.js';
import { advanceGameDaysWithSummary } from '../src/selling-houses/application/gameTransitions.js';
import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';

class MemoryStorage implements Storage {
  private readonly data = new Map<string, string>();

  get length() {
    return this.data.size;
  }

  clear() {
    this.data.clear();
  }

  getItem(key: string) {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  key(index: number) {
    return Array.from(this.data.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.data.delete(key);
  }

  setItem(key: string, value: string) {
    this.data.set(key, String(value));
  }
}

function installMemoryStorage() {
  const storage = new MemoryStorage();
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: storage },
  });
  return storage;
}

function createWorld(seed: number) {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');

  const world = createInitialState(snapshot, seed);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

{
  assert.equal(resolveSellingHousesStorageProfileFromSearch(''), 'default');
  assert.equal(resolveSellingHousesStorageProfileFromSearch('?profile=default'), 'default');
  assert.equal(resolveSellingHousesStorageProfileFromSearch('?profile=e2e'), 'e2e');
  assert.equal(resolveSellingHousesStorageProfileFromSearch('?profile=dev'), 'dev');
  assert.equal(resolveSellingHousesStorageProfileFromSearch('?profile=unknown'), 'default');
}

{
  const defaultContext = buildSellingHousesPlayerContext({
    accountId: 'account-1',
    email: 'codex@ke.com',
    nickname: 'Codex',
  });
  const e2eContext = buildSellingHousesPlayerContext({
    accountId: 'account-1',
    email: 'codex@ke.com',
    nickname: 'Codex',
    storageProfile: 'e2e',
  });
  const devContext = buildSellingHousesPlayerContext({
    accountId: 'account-1',
    email: 'codex@ke.com',
    nickname: 'Codex',
    storageProfile: 'dev',
  });

  assert.equal(defaultContext.storageScopeKey, 'account-1', 'Default profile scope must remain unchanged');
  assert.equal(e2eContext.storageScopeKey, 'account-1:selling-houses:e2e');
  assert.equal(devContext.storageScopeKey, 'account-1:selling-houses:dev');
  assert.equal(e2eContext.legacyEmailScopeKey, undefined, 'Test profile must not migrate real email-scoped saves');
  assert.notEqual(defaultContext.playerProfileId, e2eContext.playerProfileId);
  assert.notEqual(getGameStateStorageKey(defaultContext.storageScopeKey), getGameStateStorageKey(e2eContext.storageScopeKey));
  assert.ok(getGameStateStorageKey(e2eContext.storageScopeKey).includes('e2e'));
  assert.equal(isDefaultSellingHousesStorageProfile(defaultContext.storageProfile), true);
  assert.equal(shouldSyncSellingHousesProfileToCloud(defaultContext.storageProfile), true);
  assert.equal(shouldSyncSellingHousesProfileToCloud(e2eContext.storageProfile), false);
  assert.equal(shouldSyncSellingHousesProfileToCloud(devContext.storageProfile), false);
}

{
  installMemoryStorage();
  const defaultContext = buildSellingHousesPlayerContext({ accountId: 'account-2', email: 'codex@ke.com' });
  const e2eContext = buildSellingHousesPlayerContext({ accountId: 'account-2', email: 'codex@ke.com', storageProfile: 'e2e' });

  const defaultState = createWorld(2026042401);
  const dayTwoState = advanceGameDaysWithSummary(createWorld(2026042402), 1).nextState;

  saveGameState(defaultState, defaultContext.storageScopeKey);
  saveGameState(dayTwoState, e2eContext.storageScopeKey);

  assert.equal(loadSavedState(defaultContext.storageScopeKey)?.day, 1, 'Default profile should keep its own Day 1 save');
  assert.equal(loadSavedState(e2eContext.storageScopeKey)?.day, 2, 'E2E profile should load its own Day 2 save');

  clearSavedGameState(e2eContext.storageScopeKey);

  assert.equal(loadSavedState(e2eContext.storageScopeKey), null, 'E2E reset should clear only E2E save');
  assert.equal(loadSavedState(defaultContext.storageScopeKey)?.day, 1, 'E2E reset must not touch default save');
}

{
  installMemoryStorage();
  const defaultContext = buildSellingHousesPlayerContext({ accountId: 'account-2-dev', email: 'codex@ke.com' });
  const e2eContext = buildSellingHousesPlayerContext({ accountId: 'account-2-dev', email: 'codex@ke.com', storageProfile: 'e2e' });
  const devContext = buildSellingHousesPlayerContext({ accountId: 'account-2-dev', email: 'codex@ke.com', storageProfile: 'dev' });

  const defaultState = createWorld(2026042403);
  const e2eState = advanceGameDaysWithSummary(createWorld(2026042404), 1).nextState;
  const devState = advanceGameDaysWithSummary(createWorld(2026042405), 2).nextState;

  saveGameState(defaultState, defaultContext.storageScopeKey);
  saveGameState(e2eState, e2eContext.storageScopeKey);
  saveGameState(devState, devContext.storageScopeKey);
  clearSavedGameState(devContext.storageScopeKey);

  assert.equal(loadSavedState(defaultContext.storageScopeKey)?.day, 1, 'Dev reset must not touch default save');
  assert.equal(loadSavedState(e2eContext.storageScopeKey)?.day, 2, 'Dev reset must not touch E2E save');
  assert.equal(loadSavedState(devContext.storageScopeKey), null, 'Dev reset should clear only dev save');
}

{
  installMemoryStorage();
  const defaultContext = buildSellingHousesPlayerContext({ accountId: 'account-3', email: 'codex@ke.com' });
  const e2eContext = buildSellingHousesPlayerContext({ accountId: 'account-3', email: 'codex@ke.com', storageProfile: 'e2e' });

  saveMaintainerCloudMeta({ runId: 'default-run', syncVersion: 4, updatedAt: '2026-04-24T00:00:00.000Z' }, defaultContext.storageScopeKey);
  saveMaintainerCloudMeta({ runId: 'e2e-run', syncVersion: 1, updatedAt: '2026-04-24T00:01:00.000Z' }, e2eContext.storageScopeKey);
  clearMaintainerCloudMeta(e2eContext.storageScopeKey);

  assert.equal(loadMaintainerCloudMeta(e2eContext.storageScopeKey), null, 'E2E cloud meta reset should clear only E2E meta');
  assert.equal(loadMaintainerCloudMeta(defaultContext.storageScopeKey)?.runId, 'default-run', 'E2E cloud meta reset must not touch default meta');
}

{
  const workspaceSource = readFileSync('src/selling-houses/SellingHousesWorkspace.tsx', 'utf8');
  assert.ok(workspaceSource.includes('重置测试档'), 'Workspace should expose a test-profile-only reset control');
  assert.ok(workspaceSource.includes('!isDefaultProfile &&'), 'Test reset/profile marker should be gated away from default profile');
  assert.ok(workspaceSource.includes("handleReset();\n    await startFeaturedRun('standard');"), 'Test reset should clear current profile and return to a Day 1 standard run');
  assert.ok(workspaceSource.includes('data-seller-interaction-layer={isOverlayOpen ? \'background-inert\' : \'active\'}'), 'Workspace should expose inert state for browser smoke checks');
  assert.ok(workspaceSource.includes('aria-hidden={isOverlayOpen ? true : undefined}'), 'Background workspace should be aria-hidden only while overlay is open');
  assert.ok(workspaceSource.includes('inert={isOverlayOpen ? true : undefined}'), 'Background workspace should be inert while overlay is open without React boolean-attribute warnings');
  assert.ok(workspaceSource.includes('const hasBlockingDailyReport = Boolean(state.currentReport && !state.gameOver);'), 'Workspace should treat currentReport as a blocking overlay');
  assert.ok(workspaceSource.includes('disabled={hasBlockingDailyReport || state.gameOver || isAdvancing}'), 'Advance buttons should be disabled while daily report is open');
  assert.ok(workspaceSource.includes('const ADVANCE_LOCK_RELEASE_DELAY_MS = 650;'), 'Advance lock should survive quick double-clicks');
  assert.equal(workspaceSource.includes("displayMessage('正在结算，请稍候。');"), false, 'Advance double-click guard should not overwrite the short weekly toast');
  assert.ok(workspaceSource.includes('releaseWorkspaceFocus();\n    setJournalOpen(true);'), 'Journal opening should release focused background control first');
  assert.ok(workspaceSource.includes('releaseWorkspaceFocus();\n    setActiveResourcePanel(panel);'), 'Resource drawer opening should release focused background control first');
  assert.equal(workspaceSource.includes('onOpenJournal={() => setJournalOpen(true)}'), false, 'Journal should not open without focus release');

  const wrapperIndex = workspaceSource.indexOf('data-seller-interaction-layer');
  const resultOverlayIndex = workspaceSource.indexOf('<ResultOverlay', wrapperIndex);
  const dailyOverlayIndex = workspaceSource.indexOf('<DailySummaryOverlay', wrapperIndex);
  const actionOverlayIndex = workspaceSource.indexOf('<ActionDecisionOverlay', wrapperIndex);
  const journalOverlayIndex = workspaceSource.indexOf('<DailyJournal', wrapperIndex);
  assert.ok(resultOverlayIndex > wrapperIndex, 'Result overlay should be rendered outside the inert background wrapper');
  assert.ok(dailyOverlayIndex > wrapperIndex, 'Daily summary overlay should be rendered outside the inert background wrapper');
  assert.ok(actionOverlayIndex > wrapperIndex, 'Action decision overlay should be rendered outside the inert background wrapper');
  assert.ok(journalOverlayIndex > wrapperIndex, 'Journal drawer content should be rendered outside the inert background wrapper');
}

{
  const casesSource = readFileSync('src/selling-houses/ui/features/Cases.tsx', 'utf8');
  assert.ok(casesSource.includes('当前可做 {availableActionCount} / {ACTIONS.length}'), 'Action count copy should keep the clear executable-action wording');
  assert.ok(casesSource.includes('card.availability.enabled'), 'Recommended action resolver should require enabled actions');
  assert.ok(casesSource.includes('if (!disabled) onExecute(action.id);'), 'CompactActionButton should ignore disabled clicks');
}

console.log('selling-houses browser profile smoke verification passed');
