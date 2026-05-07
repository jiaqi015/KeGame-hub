/**
 * OwnerCaseRelation Readiness Write Source Contract
 *
 * Proves the core write source is pure, deterministic, and correctly structured.
 */

import { readFileSync } from 'node:fs';
import {
  createReadinessState,
  setPatience,
  addPatienceDelta,
  setUrgency,
  addUrgencyDelta,
  deriveCasePatienceMirror,
  deriveCaseUrgencyMirror,
  hydrateReadinessStateFromCase,
  buildOwnerCaseRelationId,
} from '../src/selling-houses/core/world-state/ownerCaseReadinessWriteSource.js';

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string) {
  if (condition) { passed++; }
  else { failed++; console.error(`  [FAIL] ${message}`); }
}

// ---------------------------------------------------------------------------
// 1. createReadinessState creates valid state
// ---------------------------------------------------------------------------

console.log('=== Check 1: createReadinessState ===');

const s1 = createReadinessState('case-1', 60, 45, 3);
check(s1.relationId === 'owner-case:case-1', `relationId: ${s1.relationId}`);
check(s1.ownerId === 'owner:case-1', `ownerId: ${s1.ownerId}`);
check(s1.assetCaseId === 'case:case-1', `assetCaseId: ${s1.assetCaseId}`);
check(s1.patience === 60, `patience: ${s1.patience}`);
check(s1.urgency === 45, `urgency: ${s1.urgency}`);
check(s1.lastUpdatedDay === 3, `lastUpdatedDay: ${s1.lastUpdatedDay}`);
check(Object.isFrozen(s1), 'state is frozen');

// ---------------------------------------------------------------------------
// 2. setPatience returns new frozen state + record
// ---------------------------------------------------------------------------

console.log('=== Check 2: setPatience ===');

const { state: s2, record: r2 } = setPatience(s1, 80, 4, 'test-set');
check(s2.patience === 80, `new patience: ${s2.patience}`);
check(s2.urgency === 45, `urgency unchanged: ${s2.urgency}`);
check(s2.lastUpdatedDay === 4, `lastUpdatedDay: ${s2.lastUpdatedDay}`);
check(Object.isFrozen(s2), 'new state is frozen');
check(r2.dimension === 'patience', `record dimension: ${r2.dimension}`);
check(r2.previousValue === 60, `previous: ${r2.previousValue}`);
check(r2.newValue === 80, `new: ${r2.newValue}`);
check(r2.delta === 20, `delta: ${r2.delta}`);
check(Object.isFrozen(r2), 'record is frozen');

// ---------------------------------------------------------------------------
// 3. addPatienceDelta works
// ---------------------------------------------------------------------------

console.log('=== Check 3: addPatienceDelta ===');

const { state: s3 } = addPatienceDelta(s1, -10, 5, 'test-delta');
check(s3.patience === 50, `patience after -10: ${s3.patience}`);

// ---------------------------------------------------------------------------
// 4. setUrgency returns new frozen state + record
// ---------------------------------------------------------------------------

console.log('=== Check 4: setUrgency ===');

const { state: s4, record: r4 } = setUrgency(s1, 90, 6, 'test-urgency');
check(s4.urgency === 90, `new urgency: ${s4.urgency}`);
check(s4.patience === 60, `patience unchanged: ${s4.patience}`);
check(r4.dimension === 'urgency', `record dimension: ${r4.dimension}`);
check(r4.delta === 45, `delta: ${r4.delta}`);

// ---------------------------------------------------------------------------
// 5. addUrgencyDelta works
// ---------------------------------------------------------------------------

console.log('=== Check 5: addUrgencyDelta ===');

const { state: s5 } = addUrgencyDelta(s1, 15, 7, 'test-urgency-delta');
check(s5.urgency === 60, `urgency after +15: ${s5.urgency}`);

// ---------------------------------------------------------------------------
// 6. deriveCasePatienceMirror / deriveCaseUrgencyMirror
// ---------------------------------------------------------------------------

console.log('=== Check 6: deriveCaseMirror ===');

check(deriveCasePatienceMirror(s2) === 80, `mirror patience: ${deriveCasePatienceMirror(s2)}`);
check(deriveCaseUrgencyMirror(s4) === 90, `mirror urgency: ${deriveCaseUrgencyMirror(s4)}`);

// ---------------------------------------------------------------------------
// 7. hydrateReadinessStateFromCase
// ---------------------------------------------------------------------------

console.log('=== Check 7: hydrateReadinessStateFromCase ===');

const s7 = hydrateReadinessStateFromCase('case-hydrate', 33, 77, 10);
check(s7.patience === 33, `hydrated patience: ${s7.patience}`);
check(s7.urgency === 77, `hydrated urgency: ${s7.urgency}`);
check(s7.relationId === 'owner-case:case-hydrate', `hydrated relationId: ${s7.relationId}`);

// ---------------------------------------------------------------------------
// 8. buildOwnerCaseRelationId
// ---------------------------------------------------------------------------

console.log('=== Check 8: buildOwnerCaseRelationId ===');

check(buildOwnerCaseRelationId('abc') === 'owner-case:abc', `id format: ${buildOwnerCaseRelationId('abc')}`);

// ---------------------------------------------------------------------------
// 9. Clamping
// ---------------------------------------------------------------------------

console.log('=== Check 9: Clamping ===');

const { state: s9a } = setPatience(s1, 150, 1, 'over');
check(s9a.patience === 100, `clamp high patience: ${s9a.patience}`);

const { state: s9b } = setUrgency(s1, -20, 1, 'under');
check(s9b.urgency === 0, `clamp low urgency: ${s9b.urgency}`);

// ---------------------------------------------------------------------------
// 10. Deterministic
// ---------------------------------------------------------------------------

console.log('=== Check 10: Deterministic ===');

const s10a = createReadinessState('case-det', 55, 44, 1);
const s10b = createReadinessState('case-det', 55, 44, 1);
check(s10a.patience === s10b.patience && s10a.urgency === s10b.urgency, 'deterministic creation');

// ---------------------------------------------------------------------------
// 11. Core does not import runtime/domain
// ---------------------------------------------------------------------------

console.log('=== Check 11: Core boundary ===');

const src = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/.claude/worktrees/kind-bassi-be0955/src/selling-houses/core/world-state/ownerCaseReadinessWriteSource.ts', 'utf-8');
check(!src.includes("from '../../domain"), 'writeSource has no domain imports');
check(!src.includes("from '../../runtime"), 'writeSource has no runtime imports');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Summary ===`);
console.log(`Total: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);

if (failed > 0) {
  console.log('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\nselling-houses owner-case readiness write source contract verification passed');
  process.exit(0);
}
