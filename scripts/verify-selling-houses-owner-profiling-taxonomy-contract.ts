import assert from 'node:assert/strict';

import { createInitialState } from '../src/selling-houses/application/gameState.js';
import { buildOwnerPersonaProfile } from '../src/selling-houses/application/projections/ownerPersonaProfile.js';
import { buildOwnerProfilingMemorySummary } from '../src/selling-houses/application/projections/ownerProfilingMemory.js';
import { normalizeLoadedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { OWNER_TYPE_TABLE } from '../src/selling-houses/domain/ownerProfilingMemoryTypes.js';

const snapshot = getScenarioSnapshotById('standard-window-chain');
assert.ok(snapshot, 'Expected standard-window-chain scenario to exist');

const state = createInitialState(snapshot, 20260507);
const firstCase = state.cases[0];
assert.ok(firstCase, 'Expected at least one case');
firstCase.hasCompletedFirstVisit = true;

const profiling = buildOwnerProfilingMemorySummary(firstCase, []);
const persona = buildOwnerPersonaProfile(firstCase);

assert.equal(Object.keys(OWNER_TYPE_TABLE).length, 16, 'Expected a 16-type owner taxonomy');
assert.ok(profiling.ownerTypeKey in OWNER_TYPE_TABLE, 'Expected profiling to resolve to taxonomy table');
assert.equal(profiling.ownerTypeName, OWNER_TYPE_TABLE[profiling.ownerTypeKey].name, 'Expected profiling name to come from taxonomy table');
assert.equal(profiling.ownerTypeTone, OWNER_TYPE_TABLE[profiling.ownerTypeKey].tone, 'Expected profiling tone to come from taxonomy table');
assert.equal(persona.label, profiling.ownerTypeName, 'Expected persona label to reuse profiling label');
assert.equal(persona.tone, profiling.ownerTypeTone, 'Expected persona tone to reuse profiling tone');

const knownLegacyNames = new Set(['焦虑型', '等价型', '试水型', '博弈型']);
assert.ok(
  !knownLegacyNames.has(persona.label),
  'Expected persona label not to fall back to legacy 4-type archetype names',
);

const dirtyState = structuredClone(state);
dirtyState.cases[0].ownerProfilingMemory = {
  ...profiling,
  ownerTypeKey: 'weak-long-low-guided_or_joint',
  ownerTypeName: '焦虑型',
  ownerTypeDescription: 'legacy',
  ownerTypeTone: 'risk',
};
const normalizedState = normalizeLoadedState(dirtyState);
assert.ok(normalizedState, 'Expected dirty state to normalize');
const normalizedCase = normalizedState!.cases[0];
assert.ok(normalizedCase.ownerProfilingMemory, 'Expected normalized case to retain owner profiling memory');
assert.equal(
  normalizedCase.ownerProfilingMemory?.ownerTypeName,
  OWNER_TYPE_TABLE[normalizedCase.ownerProfilingMemory!.ownerTypeKey].name,
  'Expected normalized owner profiling memory to rewrite legacy names to the taxonomy table',
);
assert.equal(
  buildOwnerPersonaProfile(normalizedCase).label,
  normalizedCase.ownerProfilingMemory?.ownerTypeName,
  'Expected persona to reuse normalized profiling memory after load',
);

console.log('Owner profiling taxonomy contract: 16 types, single active label/tone source, legacy 4-type names not used.');
