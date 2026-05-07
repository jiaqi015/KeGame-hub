/**
 * OwnerCaseRelation Read Boundary Contract
 *
 * Proves that evaluation/POV layers read patience/urgency from
 * OwnerCaseRelation (canonical) with fallback to Case (legacy mirror).
 *
 * Checks:
 * 1. readPatience prefers canonical relation
 * 2. readUrgency prefers canonical relation
 * 3. readPatience falls back to Case.patience when relation absent
 * 4. readUrgency falls back to Case.urgency when relation absent
 * 5. readPatience returns 'missing' when neither source has valid data
 * 6. readUrgency returns 'missing' when neither source has valid data
 * 7. readOwnerCaseValuesFromState resolves from state
 * 8. Adapter is pure — no mutation
 * 9. Old save (no relation) doesn't crash
 * 10. No Date.now/Math.random/fetch in readBoundary
 * 11. State-aware: relation patience=80, Case patience=20 → reads 80
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import {
  readPatience,
  readUrgency,
  readOwnerCaseValues,
  readOwnerCaseValuesFromState,
  findOwnerCaseRelationForCase,
  buildOwnerCaseRelationId,
  type OwnerCaseReadResult,
  type OwnerCaseRelationReadinessShape,
} from '../src/selling-houses/core/evaluation/ownerCaseReadBoundary.js';

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

// ---------------------------------------------------------------------------
// 1. readPatience prefers canonical relation
// ---------------------------------------------------------------------------

console.log('=== Check 1: readPatience prefers canonical ===');

const r1 = readPatience({ patience: 50, urgency: 50 }, { patience: 72, urgency: 60 });
check(r1.value === 72, `Canonical patience 72, got ${r1.value}`);
check(r1.source === 'canonical_owner_case_relation', `Source is canonical, got ${r1.source}`);

// ---------------------------------------------------------------------------
// 2. readUrgency prefers canonical relation
// ---------------------------------------------------------------------------

console.log('=== Check 2: readUrgency prefers canonical ===');

const r2 = readUrgency({ patience: 50, urgency: 50 }, { patience: 60, urgency: 82 });
check(r2.value === 82, `Canonical urgency 82, got ${r2.value}`);
check(r2.source === 'canonical_owner_case_relation', `Source is canonical, got ${r2.source}`);

// ---------------------------------------------------------------------------
// 3. readPatience falls back to Case.patience
// ---------------------------------------------------------------------------

console.log('=== Check 3: readPatience fallback ===');

const r3a = readPatience({ patience: 55, urgency: 40 }, null);
check(r3a.value === 55, `Fallback patience 55, got ${r3a.value}`);
check(r3a.source === 'legacy_case_mirror', `Source is legacy_case_mirror, got ${r3a.source}`);

const r3b = readPatience({ patience: 55, urgency: 40 }, undefined);
check(r3b.value === 55, `Fallback with undefined, got ${r3b.value}`);
check(r3b.source === 'legacy_case_mirror', `Source with undefined, got ${r3b.source}`);

// ---------------------------------------------------------------------------
// 4. readUrgency falls back to Case.urgency
// ---------------------------------------------------------------------------

console.log('=== Check 4: readUrgency fallback ===');

const r4 = readUrgency({ patience: 40, urgency: 60 }, null);
check(r4.value === 60, `Fallback urgency 60, got ${r4.value}`);
check(r4.source === 'legacy_case_mirror', `Source is legacy_case_mirror, got ${r4.source}`);

// ---------------------------------------------------------------------------
// 5. readPatience returns 'missing' when neither has valid data
// ---------------------------------------------------------------------------

console.log('=== Check 5: readPatience missing ===');

const r5 = readPatience({ patience: NaN, urgency: NaN }, null);
check(r5.value === 0, `Missing patience returns 0, got ${r5.value}`);
check(r5.source === 'missing', `Source is missing, got ${r5.source}`);

// ---------------------------------------------------------------------------
// 6. readUrgency returns 'missing' when neither has valid data
// ---------------------------------------------------------------------------

console.log('=== Check 6: readUrgency missing ===');

const r6 = readUrgency({ patience: NaN, urgency: NaN }, null);
check(r6.value === 0, `Missing urgency returns 0, got ${r6.value}`);
check(r6.source === 'missing', `Source is missing, got ${r6.source}`);

// ---------------------------------------------------------------------------
// 7. readOwnerCaseValuesFromState resolves from state
// ---------------------------------------------------------------------------

console.log('=== Check 7: readOwnerCaseValuesFromState ===');

const relationId = buildOwnerCaseRelationId('case-1');
const mockRelation: OwnerCaseRelationReadinessShape = {
  relationId,
  ownerId: 'owner:case-1',
  assetCaseId: 'case:case-1',
  patience: 80,
  urgency: 70,
  windowDays: 10,
};

const stateWithRelation = {
  runtimeOwnerCaseRelations: [mockRelation],
};

const r7 = readOwnerCaseValuesFromState(
  { id: 'case-1', patience: 20, urgency: 30 },
  stateWithRelation,
);
check(r7.patience.value === 80, `State-aware patience=80, got ${r7.patience.value}`);
check(r7.patience.source === 'canonical_owner_case_relation', `patience source canonical, got ${r7.patience.source}`);
check(r7.urgency.value === 70, `State-aware urgency=70, got ${r7.urgency.value}`);
check(r7.urgency.source === 'canonical_owner_case_relation', `urgency source canonical, got ${r7.urgency.source}`);

// State without relation → falls back to Case
const r7b = readOwnerCaseValuesFromState(
  { id: 'case-1', patience: 20, urgency: 30 },
  { runtimeOwnerCaseRelations: undefined },
);
check(r7b.patience.value === 20, `Fallback patience=20, got ${r7b.patience.value}`);
check(r7b.patience.source === 'legacy_case_mirror', `Fallback source, got ${r7b.patience.source}`);
check(r7b.urgency.value === 30, `Fallback urgency=30, got ${r7b.urgency.value}`);

// findOwnerCaseRelationForCase
const found = findOwnerCaseRelationForCase(stateWithRelation, 'case-1');
check(found !== null, 'findOwnerCaseRelationForCase finds relation');
check(found?.patience === 80, `Found relation patience is 80, got ${found?.patience}`);
check(found?.urgency === 70, `Found relation urgency is 70, got ${found?.urgency}`);

// ---------------------------------------------------------------------------
// 8. Adapter is pure — no mutation
// ---------------------------------------------------------------------------

console.log('=== Check 8: Adapter purity ===');

const caseObj = { patience: 50, urgency: 60 };
const relation = { patience: 99, urgency: 88 };
readPatience(caseObj, relation);
readUrgency(caseObj, relation);
readOwnerCaseValues(caseObj, relation);
check(caseObj.patience === 50, `Case.patience unchanged: ${caseObj.patience}`);
check(caseObj.urgency === 60, `Case.urgency unchanged: ${caseObj.urgency}`);
check(relation.patience === 99, `Relation.patience unchanged: ${relation.patience}`);
check(relation.urgency === 88, `Relation.urgency unchanged: ${relation.urgency}`);

// ---------------------------------------------------------------------------
// 9. Old save compatibility
// ---------------------------------------------------------------------------

console.log('=== Check 9: Old save compatibility ===');

// Simulate old save: no relation
const r9p = readPatience({ patience: 42, urgency: 33 }, undefined);
check(r9p.value === 42, `Old save patience: 42, got ${r9p.value}`);
check(r9p.source === 'legacy_case_mirror', `Old save source: legacy_case_mirror, got ${r9p.source}`);

const r9u = readUrgency({ patience: 42, urgency: 33 }, undefined);
check(r9u.value === 33, `Old save urgency: 33, got ${r9u.value}`);
check(r9u.source === 'legacy_case_mirror', `Old save source: legacy_case_mirror, got ${r9u.source}`);

// ---------------------------------------------------------------------------
// 10. No Date.now/Math.random/fetch in readBoundary
// ---------------------------------------------------------------------------

console.log('=== Check 10: readBoundary determinism ===');

const readBoundarySrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/.claude/worktrees/kind-bassi-be0955/src/selling-houses/core/evaluation/ownerCaseReadBoundary.ts', 'utf-8');
const nonComment = readBoundarySrc.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
check(!nonComment.includes('Date.now'), 'readBoundary: no Date.now');
check(!nonComment.includes('Math.random'), 'readBoundary: no Math.random');
check(!nonComment.includes('fetch('), 'readBoundary: no fetch()');

// ---------------------------------------------------------------------------
// 11. State-aware: relation patience=80, Case patience=20 → reads 80
// ---------------------------------------------------------------------------

console.log('=== Check 11: State-aware reads canonical ===');

const stateRelationId = buildOwnerCaseRelationId('test-case');
const stateRelation: OwnerCaseRelationReadinessShape = {
  relationId: stateRelationId,
  ownerId: 'owner:test-case',
  assetCaseId: 'case:test-case',
  patience: 80,
  urgency: 85,
  windowDays: 14,
};

const stateResult = readOwnerCaseValuesFromState(
  { id: 'test-case', patience: 20, urgency: 15 },
  { runtimeOwnerCaseRelations: [stateRelation] },
);
check(stateResult.patience.value === 80, `State-aware: relation patience=80, Case=20 → reads ${stateResult.patience.value} (expected 80)`);
check(stateResult.patience.source === 'canonical_owner_case_relation', `patience source is canonical`);
check(stateResult.urgency.value === 85, `State-aware: relation urgency=85, Case=15 → reads ${stateResult.urgency.value} (expected 85)`);
check(stateResult.urgency.source === 'canonical_owner_case_relation', `urgency source is canonical`);

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
  console.log('\nselling-houses owner-case readiness read boundary contract verification passed');
  process.exit(0);
}
