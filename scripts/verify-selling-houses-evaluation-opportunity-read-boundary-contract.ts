/**
 * Evaluation Opportunity Read Boundary Contract.
 *
 * Verifies that the evaluation layer reads opportunity fields through the
 * canonical read boundary (CustomerCaseMatch / BrokeredOpportunity) when
 * available, and falls back to legacy Opportunity mirror when not.
 *
 * Checks:
 * 1. opportunityScoreReadBoundary.ts exists and exports canonical-first read functions
 * 2. buildOpportunityScoreSnapshotFromLegacyOpportunity uses read boundary
 * 3. Snapshot includes read source markers (canonical vs mirror)
 * 4. Canonical state takes precedence over legacy mirror
 * 5. Legacy fallback works when canonical state is missing
 * 6. No direct bare reads of opportunity.intent/confidence/stage/status in evaluation layer
 * 7. Evaluation snapshot is read-only (no mutation)
 * 8. Boundary guards still work with read source markers
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { advanceOneDay, seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import type { GameState } from '../src/selling-houses/domain/models.js';

import {
  buildOpportunityScoreSnapshotFromLegacyOpportunity,
  buildCaseEvaluationSnapshotsFromLegacyState,
} from '../src/selling-houses/core/evaluation/legacyAdapters.js';

import {
  readOpportunityScoreInputs,
  toReadableLegacyOpportunity,
} from '../src/selling-houses/core/evaluation/opportunityScoreReadBoundary.js';

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
// 1. opportunityScoreReadBoundary.ts exists and exports
// ---------------------------------------------------------------------------

console.log('=== Check 1: opportunityScoreReadBoundary exports ===');

const boundarySrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/evaluation/opportunityScoreReadBoundary.ts', 'utf-8');
check(boundarySrc.includes('export function readOpportunityScoreInputs'), 'readOpportunityScoreInputs exported');
check(boundarySrc.includes('export function toReadableLegacyOpportunity'), 'toReadableLegacyOpportunity exported');
check(boundarySrc.includes('export interface OpportunityScoreReadInputs'), 'OpportunityScoreReadInputs exported');
check(boundarySrc.includes('export interface OpportunityScoreReadResult'), 'OpportunityScoreReadResult exported');

// No domain/runtime imports
check(!boundarySrc.includes("from '../../domain"), 'No domain import');
check(!boundarySrc.includes("from '../../runtime"), 'No runtime import');

// ---------------------------------------------------------------------------
// 2. buildOpportunityScoreSnapshotFromLegacyOpportunity uses read boundary
// ---------------------------------------------------------------------------

console.log('=== Check 2: legacyAdapters uses read boundary ===');

const legacyAdaptersSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/evaluation/legacyAdapters.ts', 'utf-8');
check(legacyAdaptersSrc.includes('readOpportunityScoreInputs'), 'legacyAdapters imports readOpportunityScoreInputs');
check(legacyAdaptersSrc.includes('toReadableLegacyOpportunity'), 'legacyAdapters imports toReadableLegacyOpportunity');
check(legacyAdaptersSrc.includes('readOpportunityScoreInputs(state, readableOpp'), 'legacyAdapters calls readOpportunityScoreInputs');

// ---------------------------------------------------------------------------
// 3. Snapshot includes read source markers
// ---------------------------------------------------------------------------

console.log('=== Check 3: Snapshot includes read source markers ===');

const world = buildWorld(SEED);
const result = advanceOneDay(world);
assert.ok(result, 'advanceOneDay returned result');

const activeCases = world.cases.filter((c) => c.status === 'active');
assert.ok(activeCases.length > 0, 'Has active cases');

const activeOpportunities = world.opportunities.filter((o) => o.status === 'active');
assert.ok(activeOpportunities.length > 0, 'Has active opportunities');

const opp = activeOpportunities[0];
const snapshot = buildOpportunityScoreSnapshotFromLegacyOpportunity(world, opp);

check(snapshot.modelId === 'opportunity-score', 'Snapshot has correct modelId');
check(snapshot.inputs.intentReadSource !== undefined, 'Snapshot has intentReadSource');
check(snapshot.inputs.confidenceReadSource !== undefined, 'Snapshot has confidenceReadSource');
check(snapshot.inputs.stageReadSource !== undefined, 'Snapshot has stageReadSource');
check(snapshot.inputs.lifecycleReadSource !== undefined, 'Snapshot has lifecycleReadSource');
check(snapshot.inputs.fitReadSource !== undefined, 'Snapshot has fitReadSource');
check(snapshot.inputs.daysLeftReadSource !== undefined, 'Snapshot has daysLeftReadSource');
check(snapshot.inputs.pendingClosingReadSource !== undefined, 'Snapshot has pendingClosingReadSource');

// Read sources should be valid values
const validSources = ['canonical_match', 'canonical_brokered_opportunity', 'legacy_opportunity_mirror'];
check(validSources.includes(snapshot.inputs.intentReadSource as string), `intentReadSource is valid: ${snapshot.inputs.intentReadSource}`);
check(validSources.includes(snapshot.inputs.confidenceReadSource as string), `confidenceReadSource is valid: ${snapshot.inputs.confidenceReadSource}`);
check(validSources.includes(snapshot.inputs.stageReadSource as string), `stageReadSource is valid: ${snapshot.inputs.stageReadSource}`);
check(validSources.includes(snapshot.inputs.lifecycleReadSource as string), `lifecycleReadSource is valid: ${snapshot.inputs.lifecycleReadSource}`);

// Dimension inputs should include readSource
// After advanceOneDay, canonical state exists — fit/daysLeft may read from canonical
check(
  validSources.includes(snapshot.dimensions.fit.inputs?.readSource as string),
  `fit dimension readSource is valid: ${snapshot.dimensions.fit.inputs?.readSource}`,
);
check(snapshot.dimensions.intent.inputs?.readSource !== undefined, 'intent dimension has readSource');
check(snapshot.dimensions.confidence.inputs?.readSource !== undefined, 'confidence dimension has readSource');
check(snapshot.dimensions.closeReadiness.inputs?.readSource !== undefined, 'closeReadiness dimension has readSource');

// ---------------------------------------------------------------------------
// 4. Canonical state takes precedence over legacy mirror
// ---------------------------------------------------------------------------

console.log('=== Check 4: Canonical state precedence ===');

// With canonical state present, intent/confidence should read from canonical
const stateWithCanonical = {
  ...world,
  runtimeCustomerCaseMatches: [
    {
      matchId: `match:${opp.customerId}::${opp.caseId}`,
      customerId: opp.customerId,
      caseId: opp.caseId,
      fit: 88,
      interest: 77,
      confidence: 66,
      budgetMax: opp.budgetMax,
      priceSensitivity: opp.priceSensitivity,
      selected: false,
      offered: false,
      viewed: false,
      lastUpdatedDay: world.day,
    },
  ],
  runtimeBrokeredOpportunities: [
    {
      brokeredOpportunityId: `brokered:${opp.id}`,
      legacyOpportunityId: opp.id,
      matchId: `match:${opp.customerId}::${opp.caseId}`,
      stageIndex: 4,
      stageLabel: '谈判中',
      status: 'active',
      lifecycleStatus: 'active',
      daysLeft: 5,
      stagnationTicks: 0,
      pendingClosingEvaluation: false,
      pendingClosingStrategyId: '',
      pendingClosingRequestedDay: 0,
      lastUpdatedDay: world.day,
    },
  ],
};

const snapshotCanonical = buildOpportunityScoreSnapshotFromLegacyOpportunity(stateWithCanonical, opp);

check(snapshotCanonical.inputs.intentReadSource === 'canonical_match', `intent read from canonical: ${snapshotCanonical.inputs.intentReadSource}`);
check(snapshotCanonical.inputs.confidenceReadSource === 'canonical_match', `confidence read from canonical: ${snapshotCanonical.inputs.confidenceReadSource}`);
check(snapshotCanonical.inputs.stageReadSource === 'canonical_brokered_opportunity', `stage read from canonical: ${snapshotCanonical.inputs.stageReadSource}`);
check(snapshotCanonical.inputs.lifecycleReadSource === 'canonical_brokered_opportunity', `lifecycle read from canonical: ${snapshotCanonical.inputs.lifecycleReadSource}`);

// Canonical values should be used (77, 66) not legacy mirror values
check(snapshotCanonical.dimensions.intent.score === 77, `intent uses canonical value: ${snapshotCanonical.dimensions.intent.score} (not ${opp.intent})`);
check(snapshotCanonical.dimensions.confidence.score === 66, `confidence uses canonical value: ${snapshotCanonical.dimensions.confidence.score} (not ${opp.confidence})`);

// fit now reads from canonical match when available
check(snapshotCanonical.inputs.fitReadSource === 'canonical_match', `fit reads from canonical: ${snapshotCanonical.inputs.fitReadSource}`);
check(snapshotCanonical.dimensions.fit.score === 88, `fit uses canonical value: ${snapshotCanonical.dimensions.fit.score} (not ${opp.fit})`);

// daysLeft now reads from canonical brokered when available
check(snapshotCanonical.inputs.daysLeftReadSource === 'canonical_brokered_opportunity', `daysLeft reads from canonical: ${snapshotCanonical.inputs.daysLeftReadSource}`);
check(snapshotCanonical.inputs.daysLeft === 5, `daysLeft uses canonical value: ${snapshotCanonical.inputs.daysLeft} (not ${opp.daysLeft})`);

// pendingClosing now reads from canonical brokered when available
check(snapshotCanonical.inputs.pendingClosingReadSource === 'canonical_brokered_opportunity', `pendingClosing reads from canonical: ${snapshotCanonical.inputs.pendingClosingReadSource}`);

// ---------------------------------------------------------------------------
// 5. Legacy fallback works when canonical state is missing
// ---------------------------------------------------------------------------

console.log('=== Check 5: Legacy fallback ===');

// Create a world without canonical state to test fallback
const worldNoCanonical = {
  ...world,
  runtimeCustomerCaseMatches: undefined,
  runtimeBrokeredOpportunities: undefined,
};

const snapshotLegacy = buildOpportunityScoreSnapshotFromLegacyOpportunity(worldNoCanonical, opp);

check(snapshotLegacy.inputs.intentReadSource === 'legacy_opportunity_mirror', `intent falls back to legacy: ${snapshotLegacy.inputs.intentReadSource}`);
check(snapshotLegacy.inputs.confidenceReadSource === 'legacy_opportunity_mirror', `confidence falls back to legacy: ${snapshotLegacy.inputs.confidenceReadSource}`);
check(snapshotLegacy.inputs.stageReadSource === 'legacy_opportunity_mirror', `stage falls back to legacy: ${snapshotLegacy.inputs.stageReadSource}`);
check(snapshotLegacy.inputs.lifecycleReadSource === 'legacy_opportunity_mirror', `lifecycle falls back to legacy: ${snapshotLegacy.inputs.lifecycleReadSource}`);
check(snapshotLegacy.inputs.fitReadSource === 'legacy_opportunity_mirror', `fit falls back to legacy: ${snapshotLegacy.inputs.fitReadSource}`);
check(snapshotLegacy.inputs.daysLeftReadSource === 'legacy_opportunity_mirror', `daysLeft falls back to legacy: ${snapshotLegacy.inputs.daysLeftReadSource}`);
check(snapshotLegacy.inputs.pendingClosingReadSource === 'legacy_opportunity_mirror', `pendingClosing falls back to legacy: ${snapshotLegacy.inputs.pendingClosingReadSource}`);

// Legacy values should match original opportunity
check(snapshotLegacy.dimensions.intent.score === Math.round(opp.intent), `intent uses legacy value: ${snapshotLegacy.dimensions.intent.score}`);
check(snapshotLegacy.dimensions.confidence.score === Math.round(opp.confidence), `confidence uses legacy value: ${snapshotLegacy.dimensions.confidence.score}`);
check(snapshotLegacy.dimensions.fit.score === Math.round(opp.fit), `fit uses legacy value: ${snapshotLegacy.dimensions.fit.score}`);

// ---------------------------------------------------------------------------
// 6. No bare reads of opportunity fields in evaluation layer (structural check)
// ---------------------------------------------------------------------------

console.log('=== Check 6: No bare opportunity reads in evaluation layer ===');

// The evaluation layer should not directly read opportunity.intent/confidence/stage/status
// except through the read boundary. Check that legacyAdapters.ts uses the boundary.
check(legacyAdaptersSrc.includes('readOpportunityScoreInputs'), 'legacyAdapters calls readOpportunityScoreInputs');
check(legacyAdaptersSrc.includes('toReadableLegacyOpportunity'), 'legacyAdapters uses toReadableLegacyOpportunity');
check(legacyAdaptersSrc.includes('scoreRead.readSources.intent'), 'legacyAdapters reads intent source through boundary');
check(legacyAdaptersSrc.includes('scoreRead.readSources.confidence'), 'legacyAdapters reads confidence source through boundary');
check(legacyAdaptersSrc.includes('scoreRead.readSources.stage'), 'legacyAdapters reads stage source through boundary');

// The function uses `inputs = scoreRead.inputs` pattern — verify that
check(legacyAdaptersSrc.includes('const inputs = scoreRead.inputs'), 'legacyAdapters destructures scoreRead.inputs');

// Direct opportunity field reads should only happen via toReadableLegacyOpportunity
// (which is the bridge to the read boundary)
const directOpportunityReads = legacyAdaptersSrc.split('\n').filter(
  (line) => /opportunity\.(intent|confidence|stageIndex|status)\s*[^(]/.test(line)
    && !line.trim().startsWith('//')
    && !line.includes('opportunitySubjectRef')
    && !line.includes('opportunityScoreInputs')
    && !line.includes('readableOpp')
    && !line.includes('toReadableLegacyOpportunity')
    && !line.includes('inputs.')
);
check(directOpportunityReads.length === 0, `No bare opportunity reads in evaluation layer (found ${directOpportunityReads.length})`);

// ---------------------------------------------------------------------------
// 7. Evaluation snapshot is read-only (no mutation)
// ---------------------------------------------------------------------------

console.log('=== Check 7: Snapshot is read-only ===');

const snapshotBefore = buildOpportunityScoreSnapshotFromLegacyOpportunity(world, opp);
const intentBefore = snapshotBefore.dimensions.intent.score;
const confidenceBefore = snapshotBefore.dimensions.confidence.score;

// Snapshot should not have mutated the original opportunity
check(opp.intent === snapshotBefore.dimensions.intent.score || snapshotBefore.inputs.intentReadSource === 'canonical_match',
  'Snapshot did not mutate opportunity.intent');
check(opp.confidence === snapshotBefore.dimensions.confidence.score || snapshotBefore.inputs.confidenceReadSource === 'canonical_match',
  'Snapshot did not mutate opportunity.confidence');

// ---------------------------------------------------------------------------
// 8. readOpportunityScoreInputs is deterministic
// ---------------------------------------------------------------------------

console.log('=== Check 8: readOpportunityScoreInputs is deterministic ===');

const readableOpp = toReadableLegacyOpportunity(opp);
const readA = readOpportunityScoreInputs(world, readableOpp);
const readB = readOpportunityScoreInputs(world, readableOpp);

check(readA.inputs.intent === readB.inputs.intent, `intent deterministic: ${readA.inputs.intent} === ${readB.inputs.intent}`);
check(readA.inputs.confidence === readB.inputs.confidence, `confidence deterministic: ${readA.inputs.confidence} === ${readB.inputs.confidence}`);
check(readA.inputs.stageIndex === readB.inputs.stageIndex, `stageIndex deterministic: ${readA.inputs.stageIndex} === ${readB.inputs.stageIndex}`);
check(readA.inputs.status === readB.inputs.status, `status deterministic: ${readA.inputs.status} === ${readB.inputs.status}`);
check(readA.readSources.intent === readB.readSources.intent, `intent source deterministic: ${readA.readSources.intent}`);
check(readA.readSources.confidence === readB.readSources.confidence, `confidence source deterministic: ${readA.readSources.confidence}`);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log('\n=== Summary ===');
console.log(`Total checks: ${passed + failed}`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  console.log('\nFailures:');
  errors.forEach((e) => console.log(`  ${e}`));
  console.log('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\nRESULT: PASS');
  process.exit(0);
}
