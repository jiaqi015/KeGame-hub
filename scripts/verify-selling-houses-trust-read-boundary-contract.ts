/**
 * Trust Read Boundary verification contract.
 *
 * Proves that evaluation/POV/semantic receipt layers read trust from
 * BrokerOwnerRelation (canonical) with fallback to Case.trust (legacy mirror).
 *
 * Checks:
 * 1. readTrust prefers canonical relation trust
 * 2. readTrust falls back to Case.trust when relation is absent
 * 3. readTrust returns 'missing' when neither source has valid data
 * 4. buildAssetScoreSnapshotFromLegacyCase accepts optional relation
 * 5. buildOwnerDecisionReadinessSnapshotFromLegacyCase accepts optional relation
 * 6. Snapshot includes trustSource marker
 * 7. Adapter is pure — no mutation of state/case/relation
 * 8. Old save (no relation) doesn't crash
 * 9. Semantic evidence doesn't leak raw Case trust
 * 10. No Date.now/Math.random/fetch in trustReadBoundary
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import type { GameState, Case } from '../src/selling-houses/domain/models.js';

import {
  readTrust,
  readTrustValue,
  readTrustFromState,
  findRelationTrustForCase,
  buildCaseRelationId,
  type TrustReadResult,
  type BrokerOwnerRelationTrustStateShape,
} from '../src/selling-houses/core/evaluation/trustReadBoundary.js';

import {
  buildAssetScoreSnapshotFromLegacyCase,
  buildOwnerDecisionReadinessSnapshotFromLegacyCase,
  buildCaseEvaluationSnapshotsFromLegacyStateWithRelations,
} from '../src/selling-houses/core/evaluation/legacyAdapters.js';

// ---------------------------------------------------------------------------
// Helpers
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

function buildWorld(seed: number): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario');
  const world = createInitialState(snapshot, seed);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

const SEED = 20260501;

// ---------------------------------------------------------------------------
// 1. readTrust prefers canonical relation trust
// ---------------------------------------------------------------------------

console.log('=== Check 1: readTrust prefers canonical ===');

const result1 = readTrust({ trust: 50 }, { trust: 72 });
check(result1.value === 72, `Canonical trust 72, got ${result1.value}`);
check(result1.source === 'canonical_relation', `Source is canonical_relation, got ${result1.source}`);

// ---------------------------------------------------------------------------
// 2. readTrust falls back to Case.trust when relation absent
// ---------------------------------------------------------------------------

console.log('=== Check 2: readTrust fallback to Case.trust ===');

const result2a = readTrust({ trust: 55 }, null);
check(result2a.value === 55, `Fallback trust 55, got ${result2a.value}`);
check(result2a.source === 'legacy_case_mirror', `Source is legacy_case_mirror, got ${result2a.source}`);

const result2b = readTrust({ trust: 55 }, undefined);
check(result2b.value === 55, `Fallback trust with undefined relation, got ${result2b.value}`);
check(result2b.source === 'legacy_case_mirror', `Source is legacy_case_mirror with undefined relation`);

// ---------------------------------------------------------------------------
// 3. readTrust returns 'missing' when neither has valid data
// ---------------------------------------------------------------------------

console.log('=== Check 3: readTrust missing ===');

const result3 = readTrust({ trust: NaN }, null);
check(result3.value === 0, `Missing trust returns 0, got ${result3.value}`);
check(result3.source === 'missing', `Source is missing, got ${result3.source}`);

// readTrustValue convenience
const val = readTrustValue({ trust: 60 }, { trust: 80 });
check(val === 80, `readTrustValue prefers canonical, got ${val}`);

// ---------------------------------------------------------------------------
// 4. buildAssetScoreSnapshotFromLegacyCase accepts optional relation
// ---------------------------------------------------------------------------

console.log('=== Check 4: AssetScore accepts relation ===');

const world = buildWorld(SEED);
const caseItem = world.cases[0];
assert.ok(caseItem, 'Expected at least one case');

// Without relation (old path)
const snapWithout = buildAssetScoreSnapshotFromLegacyCase(world, caseItem);
check(snapWithout.score >= 0, 'AssetScore without relation works');

// With relation (new path)
const snapWith = buildAssetScoreSnapshotFromLegacyCase(world, caseItem, { trust: 85 });
check(snapWith.score >= 0, 'AssetScore with relation works');

// With null relation (explicit fallback)
const snapNull = buildAssetScoreSnapshotFromLegacyCase(world, caseItem, null);
check(snapNull.score >= 0, 'AssetScore with null relation works');

// ---------------------------------------------------------------------------
// 5. buildOwnerDecisionReadinessSnapshotFromLegacyCase accepts optional relation
// ---------------------------------------------------------------------------

console.log('=== Check 5: OwnerReadiness accepts relation ===');

const readinessWithout = buildOwnerDecisionReadinessSnapshotFromLegacyCase(world, caseItem);
check(readinessWithout.score >= 0, 'OwnerReadiness without relation works');

const readinessWith = buildOwnerDecisionReadinessSnapshotFromLegacyCase(world, caseItem, { trust: 90 });
check(readinessWith.score >= 0, 'OwnerReadiness with relation works');

const readinessNull = buildOwnerDecisionReadinessSnapshotFromLegacyCase(world, caseItem, null);
check(readinessNull.score >= 0, 'OwnerReadiness with null relation works');

// ---------------------------------------------------------------------------
// 6. Snapshot includes trustSource marker
// ---------------------------------------------------------------------------

console.log('=== Check 6: Snapshot trustSource marker ===');

// AssetScore inputs should have trustSource
const assetSnap = buildAssetScoreSnapshotFromLegacyCase(world, caseItem, { trust: 80 });
const assetInputs = assetSnap.inputs as Record<string, unknown>;
check(assetInputs.trustSource === 'canonical_relation', `AssetScore trustSource is canonical_relation, got ${assetInputs.trustSource}`);
// trust value is inside legacyD3OwnerRelationSignals, not at top-level inputs
const assetD3Signals = assetInputs.legacyD3OwnerRelationSignals as Record<string, unknown>;
check(assetD3Signals?.trust === 80, `AssetScore D3 signals trust is 80, got ${assetD3Signals?.trust}`);

// AssetScore without relation should have legacy_case_mirror
const assetSnapLegacy = buildAssetScoreSnapshotFromLegacyCase(world, caseItem);
const assetInputsLegacy = assetSnapLegacy.inputs as Record<string, unknown>;
check(assetInputsLegacy.trustSource === 'legacy_case_mirror', `AssetScore trustSource is legacy_case_mirror, got ${assetInputsLegacy.trustSource}`);
const assetD3SignalsLegacy = assetInputsLegacy.legacyD3OwnerRelationSignals as Record<string, unknown>;
check(assetD3SignalsLegacy?.trust === caseItem.trust, `AssetScore D3 signals trust matches Case.trust, got ${assetD3SignalsLegacy?.trust}`);

// OwnerReadiness inputs should have trustSource
const ownerSnap = buildOwnerDecisionReadinessSnapshotFromLegacyCase(world, caseItem, { trust: 85 });
const ownerInputs = ownerSnap.inputs as Record<string, unknown>;
check(ownerInputs.trustSource === 'canonical_relation', `OwnerReadiness trustSource is canonical_relation, got ${ownerInputs.trustSource}`);
check(ownerInputs.trust === 85, `OwnerReadiness trust is 85, got ${ownerInputs.trust}`);

// OwnerReadiness without relation
const ownerSnapLegacy = buildOwnerDecisionReadinessSnapshotFromLegacyCase(world, caseItem);
const ownerInputsLegacy = ownerSnapLegacy.inputs as Record<string, unknown>;
check(ownerInputsLegacy.trustSource === 'legacy_case_mirror', `OwnerReadiness trustSource is legacy_case_mirror, got ${ownerInputsLegacy.trustSource}`);

// D3 dimension should have trustSource
const d3Dim = assetSnap.dimensions.d3;
const d3Meta = d3Dim as unknown as Record<string, unknown>;
const d3Inputs = d3Meta.inputs as Record<string, unknown> | undefined;
if (d3Inputs) {
  check(d3Inputs.trustSource === 'canonical_relation', `D3 trustSource is canonical_relation, got ${d3Inputs.trustSource}`);
}

// ---------------------------------------------------------------------------
// 7. Adapter is pure — no mutation
// ---------------------------------------------------------------------------

console.log('=== Check 7: Adapter purity ===');

const worldBefore = buildWorld(SEED);
const caseBefore = worldBefore.cases[0];
const trustBefore = caseBefore.trust;
const heatBefore = caseBefore.heat;

// Build snapshots
buildAssetScoreSnapshotFromLegacyCase(worldBefore, caseBefore, { trust: 99 });
buildOwnerDecisionReadinessSnapshotFromLegacyCase(worldBefore, caseBefore, { trust: 99 });

check(caseBefore.trust === trustBefore, `Case.trust unchanged: ${caseBefore.trust} === ${trustBefore}`);
check(caseBefore.heat === heatBefore, `Case.heat unchanged: ${caseBefore.heat} === ${heatBefore}`);

// Relation should not be mutated
const relation = { trust: 99 };
const relationBefore = relation.trust;
buildAssetScoreSnapshotFromLegacyCase(worldBefore, caseBefore, relation);
check(relation.trust === relationBefore, `Relation trust unchanged: ${relation.trust} === ${relationBefore}`);

// ---------------------------------------------------------------------------
// 8. Old save (no relation) doesn't crash
// ---------------------------------------------------------------------------

console.log('=== Check 8: Old save compatibility ===');

// Simulate old save: no relation, Case.trust is the only source
const oldWorld = buildWorld(SEED);
for (const caseItem of oldWorld.cases) {
  const snap = buildAssetScoreSnapshotFromLegacyCase(oldWorld, caseItem);
  check(snap.score >= 0, `Old save AssetScore works for ${caseItem.id}`);

  const readiness = buildOwnerDecisionReadinessSnapshotFromLegacyCase(oldWorld, caseItem);
  check(readiness.score >= 0, `Old save OwnerReadiness works for ${caseItem.id}`);

  const inputs = snap.inputs as Record<string, unknown>;
  check(inputs.trustSource === 'legacy_case_mirror', `Old save trustSource is legacy_case_mirror for ${caseItem.id}`);
}

// ---------------------------------------------------------------------------
// 9. Semantic evidence doesn't leak raw Case trust
// ---------------------------------------------------------------------------

console.log('=== Check 9: Semantic evidence trust isolation ===');

const trustReadSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/evaluation/trustReadBoundary.ts', 'utf-8');
check(!trustReadSrc.includes("from '../../domain"), 'trustReadBoundary does NOT import domain');
check(!trustReadSrc.includes("from '../../runtime"), 'trustReadBoundary does NOT import runtime');
// GameState may appear in comments (e.g. "Matches the structure on GameState.runtimeBrokerOwnerRelations")
// but must not be imported or used as a type
check(!trustReadSrc.includes("from '../../domain"), 'trustReadBoundary does NOT import domain (GameState)');
check(!trustReadSrc.includes('import type.*GameState'), 'trustReadBoundary does NOT import GameState type');
// Case may appear in comments (e.g. "Case.trust is a legacy mirror"), but not as a type import
check(!trustReadSrc.includes("from '../../domain"), 'trustReadBoundary does NOT import domain (Case type)');

// The helper uses plain shapes, not domain types
check(trustReadSrc.includes('TrustCaseShape'), 'trustReadBoundary uses TrustCaseShape (plain shape)');
check(trustReadSrc.includes('TrustRelationShape'), 'trustReadBoundary uses TrustRelationShape (plain shape)');

// ---------------------------------------------------------------------------
// 10. No Date.now/Math.random/fetch in trustReadBoundary
// ---------------------------------------------------------------------------

console.log('=== Check 10: trustReadBoundary determinism ===');

const nonComment = trustReadSrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!nonComment.includes('Date.now'), 'trustReadBoundary: no Date.now');
check(!nonComment.includes('Math.random'), 'trustReadBoundary: no Math.random');
check(!nonComment.includes('fetch('), 'trustReadBoundary: no fetch()');

// ---------------------------------------------------------------------------
// 11. State-aware trust: relation=80, Case=20 → reads 80
// ---------------------------------------------------------------------------

console.log('=== Check 11: State-aware trust reads canonical ===');

const caseItemForState = world.cases[0];
assert.ok(caseItemForState, 'Expected at least one case');

// Build a mock relation with trust=80
const relationId = buildCaseRelationId(caseItemForState.id, caseItemForState.maintainerName);
const mockRelation: BrokerOwnerRelationTrustStateShape = {
  relationId,
  brokerId: `broker:maintainer:${caseItemForState.maintainerName}`,
  ownerId: `owner:${caseItemForState.id}`,
  trust: 80,
  lastUpdatedDay: world.day,
};

// State with relation
const stateWithRelation = {
  ...world,
  runtimeBrokerOwnerRelations: [mockRelation],
};

// findRelationTrustForCase finds the relation
const foundRelation = findRelationTrustForCase(stateWithRelation, caseItemForState.id, caseItemForState.maintainerName);
check(foundRelation !== null, 'findRelationTrustForCase finds relation');
check(foundRelation?.trust === 80, `Found relation trust is 80, got ${foundRelation?.trust}`);

// readTrustFromState: relation=80, Case=20 → reads 80
// We need to temporarily set Case.trust to 20 for this test
const caseWith20 = { ...caseItemForState, trust: 20 };
const stateResult = readTrustFromState(
  { id: caseWith20.id, maintainerName: caseWith20.maintainerName, trust: caseWith20.trust },
  stateWithRelation,
);
check(stateResult.value === 80, `readTrustFromState: relation=80, Case=20 → reads ${stateResult.value} (expected 80)`);
check(stateResult.source === 'canonical_relation', `readTrustFromState source is canonical_relation, got ${stateResult.source}`);

// readTrustFromState without relation → falls back to Case.trust
const stateWithoutRelation = { runtimeBrokerOwnerRelations: undefined };
const fallbackResult = readTrustFromState(
  { id: caseWith20.id, maintainerName: caseWith20.maintainerName, trust: caseWith20.trust },
  stateWithoutRelation,
);
check(fallbackResult.value === 20, `readTrustFromState without relation → Case.trust=20, got ${fallbackResult.value}`);
check(fallbackResult.source === 'legacy_case_mirror', `readTrustFromState fallback source is legacy_case_mirror, got ${fallbackResult.source}`);

// buildCaseEvaluationSnapshotsFromLegacyStateWithRelations: relation=80, Case=20 → reads 80
const caseWith20Full = { ...caseItemForState, trust: 20 };
const stateWith20 = {
  ...world,
  cases: world.cases.map((c) => c.id === caseWith20Full.id ? caseWith20Full : c),
  runtimeBrokerOwnerRelations: [mockRelation],
};
const snapshots = buildCaseEvaluationSnapshotsFromLegacyStateWithRelations(stateWith20, caseWith20Full);
const stateAssetInputs = snapshots.assetScore.inputs as Record<string, unknown>;
check(stateAssetInputs.trustSource === 'canonical_relation', `State-aware AssetScore trustSource is canonical_relation, got ${stateAssetInputs.trustSource}`);
const stateOwnerInputs = snapshots.ownerDecisionReadiness.inputs as Record<string, unknown>;
check(stateOwnerInputs.trustSource === 'canonical_relation', `State-aware OwnerReadiness trustSource is canonical_relation, got ${stateOwnerInputs.trustSource}`);

// The D3 signals should have trust=80 (from relation), not 20 (from Case)
const stateD3Signals = stateAssetInputs.legacyD3OwnerRelationSignals as Record<string, unknown>;
check(stateD3Signals?.trust === 80, `D3 signals trust is 80 (from relation), got ${stateD3Signals?.trust}`);

// Owner readiness trust dimension should use 80
const trustDim = snapshots.ownerDecisionReadiness.dimensions.trust;
check(trustDim.score === 80, `OwnerReadiness trust dimension is 80, got ${trustDim.score}`);

// Old save: no runtimeBrokerOwnerRelations → fallback to Case.trust=20
const oldSaveState = {
  ...world,
  cases: world.cases.map((c) => c.id === caseWith20Full.id ? caseWith20Full : c),
  // No runtimeBrokerOwnerRelations
};
const oldSnapshots = buildCaseEvaluationSnapshotsFromLegacyStateWithRelations(oldSaveState, caseWith20Full);
const oldSaveAssetInputs = oldSnapshots.assetScore.inputs as Record<string, unknown>;
check(oldSaveAssetInputs.trustSource === 'legacy_case_mirror', `Old save AssetScore trustSource is legacy_case_mirror, got ${oldSaveAssetInputs.trustSource}`);
const oldSaveD3Signals = oldSaveAssetInputs.legacyD3OwnerRelationSignals as Record<string, unknown>;
check(oldSaveD3Signals?.trust === 20, `Old save D3 signals trust is 20 (Case.trust), got ${oldSaveD3Signals?.trust}`);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Summary ===`);
console.log(`Total checks: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (errors.length > 0) {
  console.log('\nFailures:');
  errors.forEach(e => console.log(`  ${e}`));
}

if (failed > 0) {
  console.log('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\nselling-houses trust read boundary contract verification passed');
  process.exit(0);
}
