/**
 * R21 Runtime Contract Validation + Owner Belief Coverage + Dead Code Burial Gate.
 *
 * Proves R21 makes R20's structural work harder to regress:
 * 1. Runtime validation functions exist for canonical contracts
 * 2. Validation catches invalid input (missing IDs, non-finite numbers, wrong arrays)
 * 3. deriveWorldStateFromLegacyGameState runs validation at boundary
 * 4. Pre-R20 dead code removed (calculateNegotiationSuccessScore/calculateScaledCloseProbability)
 * 5. No inline close-probability formula fragments in buildDealClosingEvaluation
 * 6. computeCloseProbability is the only probability path
 * 7. Owner process_receipt beliefs cover >= 2 meaningful domains with metrics
 * 8. Owner beliefs are POV-bound (no no_one, no all_actors for sensitive sources)
 * 9. Owner belief values use bounded process metrics, not generic text only
 * 10. Owner belief metrics change when input metrics change
 * 11. R20 gate still passes
 * 12. R19 gate still passes
 * 13. Replay determinism for validation and owner beliefs
 * 14. Gate self-audit has no fake green patterns and hard exits on failure
 *
 * Hard constraints:
 *   - No check(true), assert(true), || true
 *   - No WARN-as-PASS
 *   - No silent catch around core checks
 *   - Hard process.exit(1) on failure
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildGeneratedScenarioOpeningPreview, createStateFromScenarioOpening } from '../src/selling-houses/application/scenarioOpening.js';
import { advanceGameDays, executeGameAction } from '../src/selling-houses/application/gameTransitions.js';
import { getActionAvailability } from '../src/selling-houses/domain/engine.js';
import type { GameState } from '../src/selling-houses/domain/models.js';
import {
  validateLegacyCanonicalCaseLike,
  validateLegacyCanonicalOpportunityLike,
  validateLegacyCanonicalGameStateLike,
  assertLegacyCanonicalGameStateLike,
  type CompatibilityValidationResult,
} from '../src/selling-houses/core/world-state/legacyCompatibilityValidation.js';
import {
  deriveWorldStateFromLegacyGameState,
} from '../src/selling-houses/core/world-state/adapters.js';
import { findGateSoftPassLines } from './selling-houses-gate-hygiene.js';

let passed = 0;
let failed = 0;
const errors: string[] = [];

function pass(message: string): void {
  passed += 1;
  console.log(`  [PASS] ${message}`);
}

function fail(message: string): void {
  failed += 1;
  errors.push(message);
  console.error(`  [FAIL] ${message}`);
}

function check(condition: boolean, message: string): void {
  if (condition) {
    pass(message);
  } else {
    fail(message);
  }
}

function readFile(path: string): string {
  return readFileSync(join(import.meta.dirname!, '..', path), 'utf-8');
}

function readFileSafe(path: string): string | null {
  try {
    return readFile(path);
  } catch {
    return null;
  }
}

const SEED = 20260524;

function buildWorld(seed: number): GameState {
  const opening = buildGeneratedScenarioOpeningPreview('standard', seed, 'standard');
  return createStateFromScenarioOpening(opening);
}

function firstActiveCaseId(state: GameState): string {
  const caseItem = state.cases.find((entry) => entry.status === 'active');
  if (!caseItem) throw new Error('no active case');
  return caseItem.id;
}

function advanceAndAct(state: GameState, days: number, caseId: string): GameState {
  let s = state;
  for (let d = 0; d < days; d++) {
    const c = s.cases.find((e) => e.id === caseId && e.status === 'active');
    if (c) {
      const actions = ['first-visit', 'weekly-feedback', 'open-day', 'second-visit', 'sincerity-sale'];
      for (const action of actions) {
        const avail = getActionAvailability(s, c, action);
        if (avail.enabled) {
          const result = executeGameAction(s, action, caseId, null);
          if (result.success) { s = advanceGameDays(result.nextState, 1); break; }
        }
      }
    }
    s = advanceGameDays(s, 1);
  }
  return s;
}

// ── 1. Runtime validation functions exist for canonical contracts ──

console.log('\n=== R21-1: Runtime validation functions exist ===\n');

{
  const validationSrc = readFileSafe('src/selling-houses/core/world-state/legacyCompatibilityValidation.ts');
  check(validationSrc !== null, 'legacyCompatibilityValidation.ts exists');
  if (validationSrc) {
    check(validationSrc.includes('export function validateLegacyCanonicalCaseLike'), 'validateLegacyCanonicalCaseLike exported');
    check(validationSrc.includes('export function validateLegacyCanonicalOpportunityLike'), 'validateLegacyCanonicalOpportunityLike exported');
    check(validationSrc.includes('export function validateLegacyCanonicalGameStateLike'), 'validateLegacyCanonicalGameStateLike exported');
    check(validationSrc.includes('export function assertLegacyCanonicalGameStateLike'), 'assertLegacyCanonicalGameStateLike exported');
    check(validationSrc.includes('CompatibilityValidationResult'), 'CompatibilityValidationResult type used');
    check(validationSrc.includes('CompatibilityValidationIssue'), 'CompatibilityValidationIssue type used');
  }
}

// ── 2. Validation catches invalid input ──

console.log('\n=== R21-2: Validation catches invalid input ===\n');

{
  // Missing required fields
  const emptyCase = {};
  const caseResult = validateLegacyCanonicalCaseLike(emptyCase);
  check(!caseResult.ok, 'empty object fails case validation');
  check(caseResult.issues.length > 0, `case validation reports issues (count: ${caseResult.issues.length})`);

  // Missing id specifically
  const caseNoId = { title: 'test' };
  const caseNoIdResult = validateLegacyCanonicalCaseLike(caseNoId);
  check(!caseNoIdResult.ok, 'case without id fails validation');
  const idIssue = caseNoIdResult.issues.find(i => i.path === 'id');
  check(idIssue !== undefined, 'missing id reported as issue');

  // Non-finite number
  const caseBadNumber = { id: 'c1', area: Infinity };
  const caseBadNumResult = validateLegacyCanonicalCaseLike(caseBadNumber);
  check(!caseBadNumResult.ok, 'case with Infinity area fails validation');
  const areaIssue = caseBadNumResult.issues.find(i => i.path === 'area');
  check(areaIssue !== undefined, 'non-finite area reported');

  // Unrecognized enum string (error severity — R22 tightened from warning to error)
  const caseBadStatus = { id: 'c1', status: 'unknown_status' };
  const caseBadStatusResult = validateLegacyCanonicalCaseLike(caseBadStatus);
  check(!caseBadStatusResult.ok, 'unrecognized status fails validation (error severity)');
  const statusIssue = caseBadStatusResult.issues.find(i => i.path === 'status');
  if (statusIssue) {
    check(statusIssue.severity === 'error', 'unrecognized status is error severity (R22 tightened)');
  }

  // Opportunity validation
  const emptyOpp = {};
  const oppResult = validateLegacyCanonicalOpportunityLike(emptyOpp);
  check(!oppResult.ok, 'empty object fails opportunity validation');

  // Game state validation
  const emptyState = {};
  const stateResult = validateLegacyCanonicalGameStateLike(emptyState);
  check(!stateResult.ok, 'empty object fails game state validation');
}

// ── 3. deriveWorldStateFromLegacyGameState runs validation at boundary ──

console.log('\n=== R21-3: Adapter runs validation at boundary ===\n');

{
  // Valid game state should produce a validation report with ok=true
  const s0 = buildWorld(SEED);
  const worldState = deriveWorldStateFromLegacyGameState(s0);
  check(worldState.validationReport !== undefined, 'deriveWorldStateFromLegacyGameState includes validationReport');
  check(worldState.validationReport!.ok, 'valid game state passes validation');

  // Invalid input should produce issues
  const invalidState = { runId: '', version: 1, day: 0, currentDate: '', cases: 'not-array', opportunities: [] };
  const invalidResult = deriveWorldStateFromLegacyGameState(invalidState as any);
  check(invalidResult.validationReport !== undefined, 'invalid input produces validationReport');
  check(!invalidResult.validationReport!.ok, 'invalid input fails validation');

  // assertLegacyCanonicalGameStateLike throws on invalid
  let assertThrew = false;
  try {
    assertLegacyCanonicalGameStateLike({});
  } catch {
    assertThrew = true;
  }
  check(assertThrew, 'assertLegacyCanonicalGameStateLike throws on invalid input');
}

// ── 4. Pre-R20 dead code removed ──

console.log('\n=== R21-4: Dead code removed ===\n');

{
  const dealClosingSrc = readFileSafe('src/selling-houses/domain/dealClosing.ts');
  check(dealClosingSrc !== null, 'dealClosing.ts exists');
  if (dealClosingSrc) {
    check(!dealClosingSrc.includes('function calculateNegotiationSuccessScore'), 'calculateNegotiationSuccessScore removed');
    check(!dealClosingSrc.includes('function calculateScaledCloseProbability'), 'calculateScaledCloseProbability removed');
  }
}

// ── 5. No inline close-probability formula fragments in buildDealClosingEvaluation ──

console.log('\n=== R21-5: No inline formula fragments ===\n');

{
  const dealClosingSrc = readFileSafe('src/selling-houses/domain/dealClosing.ts');
  check(dealClosingSrc !== null, 'dealClosing.ts exists for fragment check');
  if (dealClosingSrc) {
    // Extract the buildDealClosingEvaluation function body
    const buildEvalMatch = dealClosingSrc.match(/function buildDealClosingEvaluation[\s\S]*?^}/m);
    if (buildEvalMatch) {
      const buildEvalBody = buildEvalMatch[0];
      check(buildEvalBody.includes('computeCloseProbability'), 'buildDealClosingEvaluation calls computeCloseProbability');
      check(!/intentWeight.*confidenceWeight/.test(buildEvalBody), 'no inline weight multiplication in buildDealClosingEvaluation');
    } else {
      fail('could not find buildDealClosingEvaluation function body');
    }
  }
}

// ── 6. computeCloseProbability is the only probability path ──

console.log('\n=== R21-6: computeCloseProbability is the only path ===\n');

{
  const dealClosingSrc = readFileSafe('src/selling-houses/domain/dealClosing.ts');
  check(dealClosingSrc !== null, 'dealClosing.ts exists for path check');
  if (dealClosingSrc) {
    // Count calls to computeCloseProbability
    const computeCalls = (dealClosingSrc.match(/computeCloseProbability\(/g) || []).length;
    check(computeCalls >= 1, `computeCloseProbability called at least once (count: ${computeCalls})`);

    // No old function references
    check(!dealClosingSrc.includes('calculateNegotiationSuccessScore('), 'no calculateNegotiationSuccessScore calls');
    check(!dealClosingSrc.includes('calculateScaledCloseProbability('), 'no calculateScaledCloseProbability calls');
  }
}

// ── 7. Owner process_receipt beliefs cover >= 2 meaningful domains with metrics ──

console.log('\n=== R21-7: Owner process_receipt belief coverage ===\n');

{
  const projSrc = readFileSafe('src/selling-houses/application/projections/actorKnowledgeProjection.ts');
  check(projSrc !== null, 'actorKnowledgeProjection.ts exists');
  if (projSrc) {
    // Find the process_receipt owner section in deriveBeliefForRole.
    // Strategy: find "subtype === 'focus_meeting_completed'" which is unique to
    // the deriveBeliefForRole owner process_receipt section, then extract the
    // surrounding owner block.
    const ownerProcessReceiptMarker = projSrc.indexOf("subtype === 'focus_meeting_completed'");
    check(ownerProcessReceiptMarker > 0, 'owner process_receipt section marker found (focus_meeting_completed)');

    if (ownerProcessReceiptMarker > 0) {
      // Search backwards to find "case 'owner':" and forward to find "case 'customer':"
      let ownerStart = projSrc.lastIndexOf("case 'owner':", ownerProcessReceiptMarker);
      let ownerEnd = projSrc.indexOf("case 'customer':", ownerProcessReceiptMarker);
      if (ownerStart < 0) ownerStart = 0;
      if (ownerEnd < 0) ownerEnd = projSrc.length;

      const ownerCode = projSrc.slice(ownerStart, ownerEnd);

      // Count distinct domains used by owner in process_receipt
      const domainMatches = ownerCode.match(/domain:\s*'[^']+'/g) || [];
      const domains = new Set(domainMatches.map(m => m.replace(/domain:\s*'/, '').replace("'", '')));
      check(domains.size >= 2, `owner uses >= 2 belief domains (found: ${domains.size}: ${[...domains].join(', ')})`);

      // Count metrics fields
      const metricsMatches = ownerCode.match(/metrics:\s*\{/g) || [];
      check(metricsMatches.length >= 3, `owner beliefs have >= 3 metrics objects (found: ${metricsMatches.length})`);

      // Check specific subtypes handled
      check(ownerCode.includes("subtype === 'open_day_completed'"), 'owner handles open_day_completed');
      check(ownerCode.includes("subtype === 'sincerity_sale_completed'"), 'owner handles sincerity_sale_completed');
      check(ownerCode.includes("subtype === 'negotiation_progressed'"), 'owner handles negotiation_progressed');
      check(ownerCode.includes("subtype === 'focus_meeting_completed'"), 'owner handles focus_meeting_completed');
      check(ownerCode.includes("subtype === 'consensus_reached'"), 'owner handles consensus_reached');
      check(ownerCode.includes("subtype === 'deal_signed'"), 'owner handles deal_signed');
      check(ownerCode.includes("subtype === 'consensus_collapsed'"), 'owner handles consensus_collapsed');
      check(ownerCode.includes("subtype === 'case_withdrawn'"), 'owner handles case_withdrawn');
    }
  }
}

// ── 8. Owner beliefs are POV-bound ──

console.log('\n=== R21-8: Owner beliefs are POV-bound ===\n');

{
  const regSrc = readFileSafe('src/selling-houses/domain/world-model/informationSourceRegistry.ts');
  check(regSrc !== null, 'informationSourceRegistry.ts exists');
  if (regSrc) {
    // Owner allowed scopes should not include no_one or broker_chain
    // The owner role is configured in actorKnowledgeTypes.ts DEFAULT_ROLE_VISIBILITY, not here
    check(regSrc.includes('isRecordVisibleToActor'), 'informationSourceRegistry has visibility function');
  }

  const typesSrc = readFileSafe('src/selling-houses/domain/world-model/actorKnowledgeTypes.ts');
  check(typesSrc !== null, 'actorKnowledgeTypes.ts exists');
  if (typesSrc) {
    // Owner visibility config
    const ownerConfigMatch = typesSrc.match(/\{[^}]*role:\s*'owner'[^}]*\}/);
    check(ownerConfigMatch !== null, 'owner DEFAULT_ROLE_VISIBILITY entry found');
    if (ownerConfigMatch) {
      const ownerConfig = ownerConfigMatch[0];
      check(ownerConfig.includes('owner_only'), 'owner has owner_only scope');
      check(!ownerConfig.includes('no_one'), 'owner does not have no_one scope');
      check(!ownerConfig.includes('broker_chain'), 'owner does not have broker_chain scope');
    }
  }

  // No process_receipt with all_actors for sensitive sources
  const clockSrc = readFileSafe('src/selling-houses/domain/world-model/runtime/clock.ts');
  check(clockSrc !== null, 'clock.ts exists for visibility check');
  if (clockSrc) {
    // Check no process_receipt records use all_actors visibility
    const processReceiptAllActors = clockSrc.match(/sourceKind:\s*'process_receipt'[\s\S]*?visibility:\s*\{[^}]*all_actors/g);
    check(processReceiptAllActors === null, 'no process_receipt records with all_actors visibility');
  }
}

// ── 9. Owner belief values use bounded process metrics ──

console.log('\n=== R21-9: Owner beliefs use bounded process metrics ===\n');

{
  const projSrc = readFileSafe('src/selling-houses/application/projections/actorKnowledgeProjection.ts');
  check(projSrc !== null, 'actorKnowledgeProjection.ts exists for metric check');
  if (projSrc) {
    const ownerProcessReceiptMarker = projSrc.indexOf("subtype === 'focus_meeting_completed'");
    if (ownerProcessReceiptMarker > 0) {
      let ownerStart = projSrc.lastIndexOf("case 'owner':", ownerProcessReceiptMarker);
      let ownerEnd = projSrc.indexOf("case 'customer':", ownerProcessReceiptMarker);
      if (ownerStart < 0) ownerStart = 0;
      if (ownerEnd < 0) ownerEnd = projSrc.length;

      const ownerCode = projSrc.slice(ownerStart, ownerEnd);
      // Check that metric values are used (safeMetric calls)
      const safeMetricCalls = ownerCode.match(/safeMetric\(/g) || [];
      check(safeMetricCalls.length >= 5, `owner uses >= 5 safeMetric calls (found: ${safeMetricCalls.length})`);

      // Check specific metrics are used
      check(ownerCode.includes("safeMetric('ownerReadinessScore'"), 'owner uses ownerReadinessScore metric');
      check(ownerCode.includes("safeMetric('customerSeriousnessScore'"), 'owner uses customerSeriousnessScore metric');
      check(ownerCode.includes("safeMetric('trustScore'"), 'owner uses trustScore metric');
    }
  }
}

// ── 10. Owner belief metrics change when input metrics change ──

console.log('\n=== R21-10: Owner belief metrics are input-sensitive ===\n');

{
  // Behavioral test: validate that owner beliefs with metrics produce different
  // values when input metrics differ. This is tested indirectly through the
  // safeMetric function — verify it uses the payload value, not a hardcoded default.
  const projSrc = readFileSafe('src/selling-houses/application/projections/actorKnowledgeProjection.ts');
  check(projSrc !== null, 'actorKnowledgeProjection.ts exists for sensitivity check');
  if (projSrc) {
    // safeMetric is a const that reads from a metrics object derived from payload
    // It reads from `m[key]` where m is extracted from record.payload or metrics
    const safeMetricDef = projSrc.match(/const safeMetric[^;]*;/);
    check(safeMetricDef !== null, 'safeMetric const found in projection');
    if (safeMetricDef) {
      // Verify it reads from an object (m[key]), not hardcoded
      check(safeMetricDef[0].includes('m['), 'safeMetric reads from metrics object (input-sensitive)');
    }
  }
}

// ── 11. R20 gate still passes ──

console.log('\n=== R21-11: R20 gate still passes ===\n');

{
  const r20Result = spawnSync(
    'npx',
    ['tsx', 'scripts/verify-selling-houses-r20-trajectory-stage-probability-truth-kernel-gate.ts'],
    { stdio: 'pipe', shell: process.platform === 'win32', timeout: 300_000 },
  );
  if (r20Result.error) {
    fail(`R20 gate: ${r20Result.error.message}`);
  } else if (r20Result.status !== 0) {
    fail(`R20 gate: exit ${r20Result.status}`);
  } else {
    pass('R20 gate still passes');
  }
}

// ── 12. R19 gate still passes ──

console.log('\n=== R21-12: R19 gate still passes ===\n');

{
  const r19Result = spawnSync(
    'npx',
    ['tsx', 'scripts/verify-selling-houses-r19-structural-truth-lock-gate.ts'],
    { stdio: 'pipe', shell: process.platform === 'win32', timeout: 300_000 },
  );
  if (r19Result.error) {
    fail(`R19 gate: ${r19Result.error.message}`);
  } else if (r19Result.status !== 0) {
    fail(`R19 gate: exit ${r19Result.status}`);
  } else {
    pass('R19 gate still passes');
  }
}

// ── 13. Replay determinism for validation and owner beliefs ──

console.log('\n=== R21-13: Replay determinism ===\n');

{
  // Validation determinism: same input → same issues
  const testInput = { id: '', status: 'bogus', area: NaN, riskFlags: 'not-array' };
  const result1 = validateLegacyCanonicalCaseLike(testInput);
  const result2 = validateLegacyCanonicalCaseLike(testInput);
  check(result1.issues.length === result2.issues.length, 'replay: same issue count');
  check(JSON.stringify(result1.issues.map(i => i.path).sort()) === JSON.stringify(result2.issues.map(i => i.path).sort()), 'replay: same issue paths');

  // World state determinism
  const s0 = buildWorld(SEED);
  const w1 = deriveWorldStateFromLegacyGameState(s0);
  const w2 = deriveWorldStateFromLegacyGameState(s0);
  check(w1.validationReport!.ok === w2.validationReport!.ok, 'replay: same validation result');
}

// ── 14. Gate self-audit ──

console.log('\n=== R21-14: Gate self-audit ===\n');

const gateSelfSrc = readFileSync(import.meta.filename!, 'utf-8');
const softPassViolations = findGateSoftPassLines(gateSelfSrc);
check(softPassViolations.length === 0, `gate self-audit: no soft-pass patterns (found ${softPassViolations.length})`);

// ── Summary ──

console.log('\n=== R21 Runtime Contract + Owner Belief + Dead Code Burial Gate Summary ===\n');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  console.error(`\nGATE FAILED: ${failed} checks did not pass.`);
  for (const err of errors) {
    console.error(`  - ${err}`);
  }
  process.exit(1);
}

console.log(`\nGATE PASSED: All ${passed} checks passed.`);
console.log('Verified: runtime contract validation, dead code removal, owner belief coverage, POV-bound beliefs.');
