import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

import { getRuntimeTempDir } from '../lib/runtimeTemp.js';
import { createInitialState } from '../src/selling-houses/application/gameState.js';
import { applyAuxiliaryStats } from '../src/selling-houses/domain/runtimeStats.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';

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

const sessionCreated = await handleMaintainerRunCreate({
  userId: 'forged-body-user',
  playerName: 'Body Player',
  seasonId: 'season-1',
  state: cloneState(),
}, sessionIdentity);

assert.equal(
  sessionCreated.userId,
  sessionIdentity.accountId,
  'session create should use server-derived accountId instead of body userId',
);

const sessionListed = await handleMaintainerRunList({
  userId: 'forged-query-user',
  limit: '8',
}, sessionIdentity);

assert.equal(sessionListed.runs.length, 1, 'session list should return the owner run');
assert.equal(
  sessionListed.runs[0]?.userId,
  sessionIdentity.accountId,
  'session list should ignore forged query userId',
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

const sessionSaved = await handleMaintainerRunSave({
  runId: sessionCreated.runId,
  userId: 'forged-body-user',
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

const activationCreated = await handleMaintainerRunCreate({
  userId: 'legacy-client-user',
  playerName: 'Legacy Client',
  seasonId: 'season-1',
  state: cloneState(),
}, activationIdentity);

assert.equal(
  activationCreated.userId,
  'legacy-client-user',
  'activation-key create should preserve client userId',
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

console.log('maintainer run identity verification passed');
