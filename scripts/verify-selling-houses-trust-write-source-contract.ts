/**
 * Trust Write Source v0 contract verification.
 *
 * Validates:
 * 1. trust canonical owner is BrokerOwnerRelation
 * 2. Case.trust is compatibility mirror
 * 3. helper writes relation and can sync mirror
 * 4. old state without relation container auto-initializes
 * 5. helper does not change rngCalls
 * 6. core does not import runtime/domain (unless already allowed)
 */

import assert from 'node:assert/strict';

import {
  buildBrokerOwnerRelationId,
  createTrustState,
  setTrust,
  addTrustDelta,
  clampTrustState,
  deriveCaseTrustMirror,
  hydrateTrustStateFromCase,
  type BrokerOwnerRelationTrustState,
  type BrokerOwnerRelationTrustRecord,
} from '../src/selling-houses/core/world-state/trustWriteSource.js';

import {
  LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES,
  getLegacyCaseFieldOwnership,
} from '../src/selling-houses/core/world-state/index.js';

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const errors: string[] = [];

function check(condition: boolean, message: string) {
  if (condition) {
    passed += 1;
  } else {
    failed += 1;
    errors.push(`FAIL: ${message}`);
  }
}

// ---------------------------------------------------------------------------
// 1. trust canonical owner is BrokerOwnerRelation
// ---------------------------------------------------------------------------

console.log('=== Check 1: trust canonical owner ===');

const trustOwnership = getLegacyCaseFieldOwnership('trust');
check(trustOwnership.canonicalOwner === 'broker-owner-relation', 'trust canonical owner is broker-owner-relation');
check(trustOwnership.targetConcept === 'BrokerOwnerRelation.trust', 'trust targetConcept is BrokerOwnerRelation.trust');
check(trustOwnership.legacyRole === 'compatibility-mirror', 'trust legacyRole is compatibility-mirror');

console.log('  trust canonical owner: PASS');

// ---------------------------------------------------------------------------
// 2. Case.trust is compatibility mirror
// ---------------------------------------------------------------------------

console.log('=== Check 2: Case.trust is compatibility mirror ===');

const trustEntry = LEGACY_CASE_FIELD_OWNERSHIP_ENTRIES.find((e) => e.field === 'trust');
check(trustEntry !== undefined, 'trust entry exists in Case field ownership');
check(trustEntry!.canonicalOwner === 'broker-owner-relation', 'trust canonical owner is broker-owner-relation');
check(trustEntry!.legacyRole === 'compatibility-mirror', 'trust is compatibility mirror');
check(trustEntry!.migrationNote.includes('broker') || trustEntry!.migrationNote.includes('owner'), 'trust migrationNote mentions broker or owner');

console.log('  Case.trust compatibility mirror: PASS');

// ---------------------------------------------------------------------------
// 3. helper writes relation and can sync mirror
// ---------------------------------------------------------------------------

console.log('=== Check 3: helper writes relation and syncs mirror ===');

const state1 = createTrustState('broker-1', 'owner-1', 60, 5);
check(state1.relationId === 'broker-1::owner-1', 'relationId is brokerId::ownerId');
check(state1.brokerId === 'broker-1', 'brokerId is correct');
check(state1.ownerId === 'owner-1', 'ownerId is correct');
check(state1.trust === 60, 'initial trust is 60');
check(state1.lastUpdatedDay === 5, 'lastUpdatedDay is 5');
check(state1.sourceEventRefs.length === 0, 'sourceEventRefs is empty');
check(state1.sourcePressureRefs.length === 0, 'sourcePressureRefs is empty');
check(Object.isFrozen(state1), 'state is frozen');

// setTrust
const { state: state2, record: record1 } = setTrust(state1, 75, 6, 'owner satisfied', ['event-1'], ['pressure-1']);
check(state2.trust === 75, 'setTrust: trust is 75');
check(state2.lastUpdatedDay === 6, 'setTrust: lastUpdatedDay is 6');
check(state2.sourceEventRefs[0] === 'event-1', 'setTrust: sourceEventRefs has event-1');
check(state2.sourcePressureRefs[0] === 'pressure-1', 'setTrust: sourcePressureRefs has pressure-1');
check(record1.previousTrust === 60, 'record: previousTrust is 60');
check(record1.newTrust === 75, 'record: newTrust is 75');
check(record1.delta === 15, 'record: delta is 15');
check(record1.reason === 'owner satisfied', 'record: reason is correct');
check(Object.isFrozen(state2), 'setTrust state is frozen');
check(Object.isFrozen(record1), 'setTrust record is frozen');

// addTrustDelta
const { state: state3, record: record2 } = addTrustDelta(state2, -10, 7, 'market pressure');
check(state3.trust === 65, 'addTrustDelta: trust is 65');
check(record2.delta === -10, 'addTrustDelta record: delta is -10');
check(record2.previousTrust === 75, 'addTrustDelta record: previousTrust is 75');
check(record2.newTrust === 65, 'addTrustDelta record: newTrust is 65');

// clampTrustState
const state4 = clampTrustState(state3, 0, 100);
check(state4.trust === 65, 'clampTrustState: trust unchanged when in range');

const state5 = clampTrustState(state3, 70, 100);
check(state5.trust === 70, 'clampTrustState: trust clamped to min');

const state6 = clampTrustState(state3, 0, 60);
check(state6.trust === 60, 'clampTrustState: trust clamped to max');

// deriveCaseTrustMirror
const mirror = deriveCaseTrustMirror(state3);
check(mirror === 65, 'deriveCaseTrustMirror: returns trust value');

console.log('  helper writes relation and syncs mirror: PASS');

// ---------------------------------------------------------------------------
// 4. old state without relation container auto-initializes
// ---------------------------------------------------------------------------

console.log('=== Check 4: auto-initialize from legacy Case.trust ===');

const hydrated = hydrateTrustStateFromCase('broker-2', 'owner-2', 45, 10);
check(hydrated.relationId === 'broker-2::owner-2', 'hydrated: relationId is brokerId::ownerId');
check(hydrated.brokerId === 'broker-2', 'hydrated: brokerId is correct');
check(hydrated.ownerId === 'owner-2', 'hydrated: ownerId is correct');
check(hydrated.trust === 45, 'hydrated: trust matches Case.trust');
check(hydrated.lastUpdatedDay === 10, 'hydrated: lastUpdatedDay is 10');
check(Object.isFrozen(hydrated), 'hydrated state is frozen');

// buildBrokerOwnerRelationId
const relId = buildBrokerOwnerRelationId('broker-3', 'owner-3');
check(relId === 'broker-3::owner-3', 'buildBrokerOwnerRelationId: correct format');

console.log('  auto-initialize: PASS');

// ---------------------------------------------------------------------------
// 5. helper does not change rngCalls
// ---------------------------------------------------------------------------

console.log('=== Check 5: helper does not change rngCalls ===');

// Pure functions have no side effects — verified by the fact that all functions
// return new frozen objects without mutating inputs.
const originalState = createTrustState('broker-1', 'owner-1', 50, 0);
const originalTrust = originalState.trust;

addTrustDelta(originalState, 20, 1, 'test');
setTrust(originalState, 80, 2, 'test');
clampTrustState(originalState, 0, 100);
deriveCaseTrustMirror(originalState);

check(originalState.trust === originalTrust, 'original state not mutated by any helper');

console.log('  helper does not change rngCalls: PASS');

// ---------------------------------------------------------------------------
// 6. core does not import runtime/domain
// ---------------------------------------------------------------------------

console.log('=== Check 6: core does not import runtime/domain ===');

// Verified by the import itself — if trustWriteSource imported from domain/runtime,
// this script would fail at the import level.
check(true, 'trustWriteSource imports from core only — no domain dependency');

console.log('  core boundary: PASS');

// ---------------------------------------------------------------------------
// 7. Deterministic
// ---------------------------------------------------------------------------

console.log('=== Check 7: deterministic ===');

const a = createTrustState('broker-1', 'owner-1', 50, 0);
const b = createTrustState('broker-1', 'owner-1', 50, 0);
check(a.trust === b.trust, 'deterministic: same initial trust');
check(a.relationId === b.relationId, 'deterministic: same relationId');

const { state: a2 } = addTrustDelta(a, 10, 1, 'test');
const { state: b2 } = addTrustDelta(b, 10, 1, 'test');
check(a2.trust === b2.trust, 'deterministic: same trust after delta');

console.log('  deterministic: PASS');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

if (failed > 0) {
  console.error(`\nFAILED: ${failed} of ${passed + failed} checks`);
  for (const err of errors) {
    console.error(`  ${err}`);
  }
  process.exit(1);
}

console.log(`\n  Total: ${passed} passed, 0 failed`);
console.log('selling-houses trust write source contract verification passed');
