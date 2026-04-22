import assert from 'node:assert/strict';

import {
  getOrCreateMaintainerUserId,
  loadMaintainerCloudMeta,
  migrateMaintainerCloudMetaScope,
  migrateMaintainerUserIdScope,
  saveMaintainerCloudMeta,
} from '../src/selling-houses/application/cloudState.js';
import {
  createInitialState,
  loadSavedState,
  migrateSavedStateScope,
  saveGameState,
} from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';

const snapshot = getScenarioSnapshotById('standard-window-chain');
if (!snapshot) {
  throw new Error('Missing builtin scenario for storage scope migration verification');
}

const localStorageMap = new Map<string, string>();
const windowStub = {
  localStorage: {
    getItem(key: string) {
      return localStorageMap.has(key) ? localStorageMap.get(key)! : null;
    },
    setItem(key: string, value: string) {
      localStorageMap.set(key, value);
    },
    removeItem(key: string) {
      localStorageMap.delete(key);
    },
  },
};

Object.assign(globalThis, {
  window: windowStub,
});

{
  const legacyScope = 'yangjiaqi015@ke.com';
  const accountScope = 'acct_ke_001';
  const world = createInitialState(snapshot, 20260420);
  world.day = 3;
  world.energy = 5;

  saveGameState(world, legacyScope);
  saveMaintainerCloudMeta({
    runId: 'run-legacy',
    syncVersion: 7,
    updatedAt: '2026-04-20T08:30:00.000Z',
  }, legacyScope);
  const legacyUserId = getOrCreateMaintainerUserId(legacyScope);

  const migratedState = migrateSavedStateScope(accountScope, legacyScope);
  const migratedMeta = migrateMaintainerCloudMetaScope(accountScope, legacyScope);
  const migratedUserId = migrateMaintainerUserIdScope(accountScope, legacyScope);

  assert.equal(migratedState?.day, 3, 'expected legacy local save to migrate into account scope');
  assert.equal(loadSavedState(accountScope)?.day, 3, 'expected account scope to load migrated save');
  assert.equal(migratedMeta?.runId, 'run-legacy', 'expected legacy cloud meta to migrate');
  assert.equal(loadMaintainerCloudMeta(accountScope)?.syncVersion, 7, 'expected migrated cloud meta to persist');
  assert.equal(migratedUserId, legacyUserId, 'expected legacy browser user id to carry forward');
  assert.equal(getOrCreateMaintainerUserId(accountScope), legacyUserId, 'expected account scope to reuse migrated browser user id');
}

console.log('selling-houses storage scope migration verification passed');
