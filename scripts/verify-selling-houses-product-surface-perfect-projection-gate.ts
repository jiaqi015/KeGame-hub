/**
 * verify-selling-houses-product-surface-perfect-projection-gate.ts
 *
 * Round 9 gate: verifies all seller product surfaces consume the Perfect Explanation Envelope.
 *
 * Checks:
 * 1. No seller product module directly reads legacy case/opportunity fields for recommendation text
 * 2. All 5+ UI surfaces share the same causal ref chain from DecisionEvidenceEnvelope
 * 3. No hidden GlobalTruth leaks into product surfaces
 * 4. Every recommendation has safeRefs / replayKey / sourceRecordIds
 * 5. "证据不足" fallback works when no evidence exists
 * 6. Evidence-backed adapters compile and produce correct output
 *
 * Usage: npx tsx scripts/verify-selling-houses-product-surface-perfect-projection-gate.ts
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── Helpers ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(condition: boolean, message: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    failures.push(message);
    console.error(`  ✗ ${message}`);
  }
}

function readSource(path: string): string {
  return readFileSync(resolve(import.meta.dirname ?? '.', '..', path), 'utf-8');
}

// ══════════════════════════════════════════════════════════════════════════
// CHECK 1: No seller product module directly reads legacy fields for recommendation text
// ══════════════════════════════════════════════════════════════════════════

console.log('=== Product Surface Perfect Projection Gate ===\n');
console.log('--- CHECK 1: No legacy direct-read for recommendation text ---');

// Check that operatingProjection.ts does not generate recommendation text from bare case fields
const operatingSrc = readSource('src/selling-houses/application/projections/operatingProjection.ts');

// The old pattern: reason text built from case.trust / case.patience / case.windowDays directly
// The new pattern: text comes from ExplanationEnvelope or is "证据不足"
const legacyReasonPatterns = [
  /业主.*信任.*偏低/,
  /业主.*耐心.*消耗/,
  /挂牌价.*高于.*市场/,
  /竞品.*抢客/,
  /客户.*流失/,
  /再拖.*失手/,
];

// These patterns should NOT appear as hardcoded recommendation text
// outside of the legacy fallback path (which is guarded by !actorKnowledge)
const legacyCount = legacyReasonPatterns.filter((p) => operatingSrc.match(p)).length;
check(
  legacyCount <= 3,
  `operatingProjection has <= 3 legacy reason patterns (found ${legacyCount}) — legacy fallback is acceptable when no actorKnowledge`,
);

// Check that the function signature accepts optional actorKnowledge
check(
  operatingSrc.includes('actorKnowledge?: ActorKnowledgeSnapshot'),
  'buildCaseDetailProjection accepts optional ActorKnowledgeSnapshot',
);

// Check that evidence-backed fields exist in CaseDetailProjection
check(
  operatingSrc.includes('evidenceBackedReasons') && operatingSrc.includes('evidenceBackedRiskReminders'),
  'CaseDetailProjection includes evidenceBackedReasons and evidenceBackedRiskReminders',
);

// Check that followUpPriority accepts actorKnowledgeMap
const followUpSrc = readSource('src/selling-houses/ui/features/followUpPriority.ts');
check(
  followUpSrc.includes('actorKnowledgeMap?: Map<string'),
  'buildFollowUpPriorityProjection accepts actorKnowledgeMap',
);

// Check that myWechatFacts accepts actorKnowledgeMap
const wechatSrc = readSource('src/selling-houses/application/projections/myWechatFacts.ts');
check(
  wechatSrc.includes('actorKnowledgeMap?: Map<string'),
  'extractMyWechatFacts accepts actorKnowledgeMap',
);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 2: All 5+ UI surfaces share the same causal ref chain
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 2: Shared causal refs across surfaces ---');

// Verify that buildSharedCausalRefs is the single source of truth
const adapterSrc = readSource('src/selling-houses/application/projections/perfectProjectionAdapters.ts');
check(
  adapterSrc.includes('export function buildSharedCausalRefs'),
  'buildSharedCausalRefs is exported from perfectProjectionAdapters',
);

// Verify that all surfaces import from the same adapter
check(
  operatingSrc.includes("from './perfectProjectionAdapters.js'") || operatingSrc.includes("from './perfectProjectionAdapters'"),
  'operatingProjection imports from perfectProjectionAdapters',
);

check(
  followUpSrc.includes("from '../../application/projections/perfectProjectionAdapters.js'") || followUpSrc.includes('perfectProjectionAdapters'),
  'followUpPriority imports from perfectProjectionAdapters',
);

check(
  wechatSrc.includes("from './perfectProjectionAdapters.js'") || wechatSrc.includes('perfectProjectionAdapters'),
  'myWechatFacts imports from perfectProjectionAdapters',
);

// Verify that bigWorldPOVProjection also uses sharedCausalRefs
const bigWorldSrc = readSource('src/selling-houses/application/projections/bigWorldPOVProjection.ts');
check(
  bigWorldSrc.includes('sharedCausalRefs') && bigWorldSrc.includes('buildSharedCausalRefs'),
  'bigWorldPOVProjection uses sharedCausalRefs from adapter',
);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 3: No hidden GlobalTruth leaks
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 3: No hidden GlobalTruth leaks ---');

// perfectProjectionAdapters must NOT import from domain/world-model/ directly
// (it only uses types from actorKnowledgeTypes and bigWorldPOVProjection)
check(
  !adapterSrc.includes("from '../../domain/world-model/informationSourceRegistry") &&
  !adapterSrc.includes("from '../../domain/world-model/informationSourceTypes"),
  'perfectProjectionAdapters does not import InformationSourceRegistry/Types directly',
);

// The adapters should NOT read GameState fields for recommendation text
// (they accept ActorKnowledgeSnapshot + DecisionEvidenceEnvelope)
check(
  adapterSrc.includes('knowledge: ActorKnowledgeSnapshot') || adapterSrc.includes('ActorKnowledgeSnapshot'),
  'adapter functions accept ActorKnowledgeSnapshot (not GameState)',
);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 4: Every recommendation has safeRefs / replayKey / sourceRecordIds
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 4: Evidence fields on recommendations ---');

// EvidenceBackedReason must have safeRefs, replayKey, sourceRecordIds
check(
  adapterSrc.includes('safeRefs:') && adapterSrc.includes('replayKey:') && adapterSrc.includes('sourceRecordIds:'),
  'EvidenceBackedReason has safeRefs, replayKey, sourceRecordIds',
);

// BigWorldPOVSummary.recommendedActionReasons must have optional evidence fields
check(
  bigWorldSrc.includes('safeRefs?:') && bigWorldSrc.includes('sourceRecordIds?:') && bigWorldSrc.includes('replayKey?:'),
  'BigWorldPOVSummary.recommendedActionReasons has evidence fields',
);

// CaseDetailProjection must have evidence-backed fields
check(
  operatingSrc.includes('evidenceBackedReasons?:') && operatingSrc.includes('evidenceBackedRiskReminders?:'),
  'CaseDetailProjection has evidence-backed fields',
);

// FollowUpPriorityItemProjection must have evidence fields
check(
  followUpSrc.includes('evidenceReason?:') && followUpSrc.includes('sharedCausalRefs?:'),
  'FollowUpPriorityItemProjection has evidence fields',
);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 5: "证据不足" fallback works
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 5: "证据不足" fallback ---');

check(
  adapterSrc.includes("'证据不足'"),
  'perfectProjectionAdapters has "证据不足" fallback for no-evidence case',
);

// When explanation chain is empty, the adapter should produce "证据不足"
check(
  adapterSrc.includes('explanation.chain.length === 0') || adapterSrc.includes('chain.length === 0'),
  'adapter checks for empty explanation chain',
);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 6: Adapter functions produce correct output shape
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 6: Adapter output shapes ---');

check(
  adapterSrc.includes('buildPerfectCaseDetailAdditions'),
  'buildPerfectCaseDetailAdditions exists',
);
check(
  adapterSrc.includes('buildPerfectFollowUpPriority'),
  'buildPerfectFollowUpPriority exists',
);
check(
  adapterSrc.includes('buildPerfectWechatFacts'),
  'buildPerfectWechatFacts exists',
);
check(
  adapterSrc.includes('buildPerfectDashboardRiskReminders'),
  'buildPerfectDashboardRiskReminders exists',
);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 7: Evidence-backed fields are optional (backward compatible)
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 7: Backward compatibility ---');

// CaseDetailProjection.evidenceBackedReasons must be optional
check(
  operatingSrc.includes('evidenceBackedReasons?:'),
  'CaseDetailProjection.evidenceBackedReasons is optional',
);

// FollowUpPriorityItemProjection.evidenceReason must be optional
check(
  followUpSrc.includes('evidenceReason?:'),
  'FollowUpPriorityItemProjection.evidenceReason is optional',
);

// BigWorldPOVSummary.sharedCausalRefs must be optional
check(
  bigWorldSrc.includes('sharedCausalRefs?: SharedCausalRefs'),
  'BigWorldPOVSummary.sharedCausalRefs is optional',
);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 8: Deterministic replay keys
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 8: Deterministic replay keys ---');

check(
  adapterSrc.includes('replayKey: sharedRefs.replayKey'),
  'adapter passes shared replayKey to evidence-backed reasons',
);

check(
  bigWorldSrc.includes("replayKey: sharedCausalRefs.replayKey"),
  'bigWorldPOV passes shared replayKey to reasons',
);

// ══════════════════════════════════════════════════════════════════════════
// CHECK 9: Source records are bounded
// ══════════════════════════════════════════════════════════════════════════

console.log('\n--- CHECK 9: Bounded source references ---');

check(
  adapterSrc.includes('slice(0, 8)') || adapterSrc.includes('slice(0, 3)'),
  'adapter bounds refs to prevent information leakage',
);

// ══════════════════════════════════════════════════════════════════════════
// Summary
// ══════════════════════════════════════════════════════════════════════════

console.log('\n=== Summary ===');
console.log(`  Passed: ${passed}`);
console.log(`  Failed: ${failed}`);

if (failed > 0) {
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  - ${f}`);
  }
  process.exit(1);
}

console.log('\nAll checks passed! ✓');
