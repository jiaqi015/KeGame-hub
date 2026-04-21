import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { getRuntimeTempDir } from '../lib/runtimeTemp.js';
import { createInitialState } from '../src/selling-houses/application/gameState.js';
import { applyAuxiliaryStats } from '../src/selling-houses/domain/runtimeStats.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { getOrCreateMaintainerUserId } from '../src/selling-houses/application/cloudState.js';
import { buildSellingHousesPlayerContext } from '../src/selling-houses/application/playerContext.js';
import { SELLING_HOUSES_SCHEMA_SQL } from '../src/selling-houses/infrastructure/neonGameDatabase.js';

process.env.DATABASE_URL = '';
process.env.POSTGRES_URL = '';

const runtimeRoot = getRuntimeTempDir('selling-houses-runtime');
await fs.rm(runtimeRoot, { recursive: true, force: true });

const {
  handleMaintainerRunCreate,
  handleMaintainerRunGet,
  handleMaintainerRunList,
  handleMaintainerRunSave,
} = await import('../src/selling-houses/interfaces/http/maintainerRunHandlers.js');

const snapshot = getScenarioSnapshotById('standard-window-chain');
if (!snapshot) {
  throw new Error('Missing builtin scenario for maintainer identity verification');
}

const baseState = createInitialState(snapshot, 20260420);

function cloneState() {
  return structuredClone(baseState);
}

function buildSavedState() {
  const state = cloneState();
  state.day = 2;
  state.energy = Math.max(0, state.energy - 1);
  applyAuxiliaryStats(state, {
    promotionBudget: state.auxiliaryStats.promotionBudget + 800,
  });
  return state;
}

const sessionIdentity = {
  accountId: 'acct_session_owner',
  displayName: 'Session Owner',
  source: 'session' as const,
};

const activationIdentity = {
  source: 'activation-key' as const,
};

const playerContext = buildSellingHousesPlayerContext({
  accountId: 'acct_session_owner',
  email: 'Owner@KE.com',
  nickname: 'Session Owner',
});

assert.equal(
  playerContext.workspaceId,
  'selling-houses',
  'selling-houses player context should carry the workspace id for PlayerProfile derivation',
);
assert.equal(
  playerContext.playerProfileId,
  'profile_selling_houses_acct_session_owner',
  'playerProfileId should be stable from accountId + workspaceId',
);

assert.equal(
  getOrCreateMaintainerUserId({
    storageScopeKey: 'scope-legacy',
    accountId: 'acct_session_owner',
  }),
  'acct_session_owner',
  'authenticated run owner should prefer accountId over legacy storage owner',
);

const accountIdColumnCount = SELLING_HOUSES_SCHEMA_SQL.match(/\baccount_id\s+TEXT\s+NULL\b/g)?.length || 0;
const playerProfileIdColumnCount = SELLING_HOUSES_SCHEMA_SQL.match(/\bplayer_profile_id\s+TEXT\s+NULL\b/g)?.length || 0;
assert.ok(
  accountIdColumnCount >= 2,
  'Neon schema should carry account_id on run and leaderboard persistence tables',
);
assert.ok(
  playerProfileIdColumnCount >= 2,
  'Neon schema should carry player_profile_id on run and leaderboard persistence tables',
);

const sessionCreated = await handleMaintainerRunCreate({
  userId: 'forged-body-user',
  accountId: 'forged-body-account',
  playerProfileId: 'profile_selling_houses_forged_body_account',
  playerName: 'Body Player',
  seasonId: 'season-1',
  state: cloneState(),
}, sessionIdentity);

assert.equal(
  sessionCreated.userId,
  sessionIdentity.accountId,
  'session create should use server-derived accountId instead of body userId',
);
assert.equal(
  sessionCreated.accountId,
  sessionIdentity.accountId,
  'session create should use server-derived accountId metadata instead of body accountId',
);
assert.equal(
  sessionCreated.playerProfileId,
  playerContext.playerProfileId,
  'session create should derive PlayerProfile from the server-derived accountId',
);

const sessionCreatedWithoutUserId = await handleMaintainerRunCreate({
  playerName: 'Body Player Without UserId',
  seasonId: 'season-1',
  state: cloneState(),
}, sessionIdentity);

assert.equal(
  sessionCreatedWithoutUserId.userId,
  sessionIdentity.accountId,
  'session create should allow omitting userId from client body',
);

const sessionListed = await handleMaintainerRunList({
  userId: 'forged-query-user',
  limit: '8',
}, sessionIdentity);

assert.ok(sessionListed.runs.length >= 2, 'session list should return the owner runs');
assert.ok(
  sessionListed.runs.every((run) => run.userId === sessionIdentity.accountId),
  'session list should ignore forged query userId',
);
assert.ok(
  sessionListed.runs.every((run) => run.playerProfileId === playerContext.playerProfileId),
  'session list should preserve PlayerProfile metadata',
);

const sessionListedWithoutUserId = await handleMaintainerRunList({
  limit: '8',
}, sessionIdentity);

assert.ok(
  sessionListedWithoutUserId.runs.some((run) => run.runId === sessionCreatedWithoutUserId.runId),
  'session list should allow omitting userId from query',
);

const sessionFetched = await handleMaintainerRunGet({
  id: sessionCreated.runId,
  userId: 'forged-query-user',
}, sessionIdentity);

assert.equal(
  sessionFetched.userId,
  sessionIdentity.accountId,
  'session get should ignore forged query userId',
);

const sessionFetchedWithoutUserId = await handleMaintainerRunGet({
  id: sessionCreatedWithoutUserId.runId,
}, sessionIdentity);

assert.equal(
  sessionFetchedWithoutUserId.userId,
  sessionIdentity.accountId,
  'session get should allow omitting userId from query',
);

const sessionSaved = await handleMaintainerRunSave({
  runId: sessionCreated.runId,
  userId: 'forged-body-user',
  accountId: 'forged-body-account-after-save',
  playerProfileId: 'profile_selling_houses_forged_after_save',
  playerName: 'Updated Body Player',
  seasonId: 'season-1',
  state: buildSavedState(),
  expectedSyncVersion: sessionCreated.syncVersion,
}, sessionIdentity);

assert.equal(
  sessionSaved.userId,
  sessionIdentity.accountId,
  'session save should use server-derived accountId instead of body userId',
);
assert.equal(sessionSaved.syncVersion, 2, 'session save should update the same owned run');
assert.equal(
  sessionSaved.accountId,
  sessionIdentity.accountId,
  'session save should keep server-derived accountId metadata',
);
assert.equal(
  sessionSaved.playerProfileId,
  playerContext.playerProfileId,
  'session save should keep server-derived PlayerProfile metadata',
);

const sessionSavedWithoutUserId = await handleMaintainerRunSave({
  runId: sessionCreatedWithoutUserId.runId,
  playerName: 'Updated Body Player Without UserId',
  seasonId: 'season-1',
  state: buildSavedState(),
  expectedSyncVersion: sessionCreatedWithoutUserId.syncVersion,
}, sessionIdentity);

assert.equal(
  sessionSavedWithoutUserId.userId,
  sessionIdentity.accountId,
  'session save should allow omitting userId from client body',
);

const activationCreated = await handleMaintainerRunCreate({
  userId: 'legacy-client-user',
  accountId: 'legacy-client-account',
  playerProfileId: 'profile_selling_houses_legacy_client_account',
  playerName: 'Legacy Client',
  seasonId: 'season-1',
  state: cloneState(),
}, activationIdentity);

assert.equal(
  activationCreated.userId,
  'legacy-client-user',
  'activation-key create should preserve client userId',
);
assert.equal(
  activationCreated.accountId,
  'legacy-client-account',
  'activation-key create should preserve optional client account metadata',
);
assert.equal(
  activationCreated.playerProfileId,
  'profile_selling_houses_legacy_client_account',
  'activation-key create should preserve optional client PlayerProfile metadata',
);

const activationListed = await handleMaintainerRunList({
  userId: 'legacy-client-user',
  limit: '8',
}, activationIdentity);

assert.ok(
  activationListed.runs.some((run) => run.runId === activationCreated.runId && run.userId === 'legacy-client-user'),
  'activation-key list should use client userId',
);

const activationFetched = await handleMaintainerRunGet({
  id: activationCreated.runId,
  userId: 'legacy-client-user',
}, activationIdentity);

assert.equal(
  activationFetched.userId,
  'legacy-client-user',
  'activation-key get should use client userId',
);

const activationSaved = await handleMaintainerRunSave({
  runId: activationCreated.runId,
  userId: 'legacy-client-user',
  accountId: 'legacy-client-account',
  playerProfileId: 'profile_selling_houses_legacy_client_account',
  playerName: 'Legacy Client Saved',
  seasonId: 'season-1',
  state: buildSavedState(),
  expectedSyncVersion: activationCreated.syncVersion,
}, activationIdentity);

assert.equal(
  activationSaved.userId,
  'legacy-client-user',
  'activation-key save should preserve client userId',
);
assert.equal(activationSaved.syncVersion, 2, 'activation-key save should update the matching legacy run');
assert.equal(
  activationSaved.accountId,
  'legacy-client-account',
  'activation-key save should preserve client account metadata',
);
assert.equal(
  activationSaved.playerProfileId,
  'profile_selling_houses_legacy_client_account',
  'activation-key save should preserve client PlayerProfile metadata',
);

console.log('maintainer run identity verification passed');
