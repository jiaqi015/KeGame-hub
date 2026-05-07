/**
 * Workspace Follow-Through Agenda Contract.
 *
 * Proves the workspace layer:
 * 1. SemanticWorkspaceProjection consumes semanticReceipts
 * 2. Projection has interactionScenes, narrativePackSummary, pressureSummary, consensusSummary, evidenceIndex
 * 3. Projection is readOnly with correct projectionKind
 * 4. DecisionSupportWorkspace exposes recommendationDrafts as compressed summaries
 * 5. LLM boundary: disabled, no provider
 * 6. No raw GameState keys in workspace composer
 * 7. Deterministic: same input -> identical projection
 * 8. Bridge operatingMovement data flows through semanticReceipts
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { advanceOneDay, seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import type { GameState, DailyTickResult } from '../src/selling-houses/domain/models.js';

import {
  buildSemanticWorkspaceProjectionFromDailyTickResult,
  buildSemanticWorkspaceProjectionFromState,
} from '../src/selling-houses/interface/interaction-workspace/semanticWorkspaceComposer.js';

import {
  buildDecisionSupportWorkspaceProjection,
} from '../src/selling-houses/interface/interaction-workspace/decisionSupportBoundary.js';

import {
  buildDailyDecisionBridgeSummary,
} from '../src/selling-houses/core/world-state/semantic-receipt/dailyDecisionBridge.js';

import {
  enrichDailyTickResultWithDailyDecisionBridge,
} from '../src/selling-houses/runtime/simulation/semanticReceiptEnrichment.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const ROOT = '/Users/jiaqi/Documents/开放日测算/src/selling-houses';

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string) {
  if (condition) { passed++; }
  else { failed++; console.error(`  [FAIL] ${message}`); }
}

function stripComments(src: string): string {
  return src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

const SEED = 20260506;

function buildWorld(seed: number): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario');
  const world = createInitialState(snapshot, seed);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

// ---------------------------------------------------------------------------
// 1. SemanticWorkspaceProjection consumes semanticReceipts
// ---------------------------------------------------------------------------

console.log('=== Check 1: Projection consumes semanticReceipts ===');

const world1 = buildWorld(SEED);
const tick1 = advanceOneDay(world1) as DailyTickResult;

const projection = buildSemanticWorkspaceProjectionFromDailyTickResult(tick1);
check(projection !== null, 'projection is not null');
check(projection.day === tick1.day, 'projection day matches tick day');
check(projection.projectionKind === 'semantic_receipt_adapter_state', 'correct projectionKind');
check(projection.readOnly === true, 'projection is readOnly');

console.log('  Projection consumes semanticReceipts: PASS');

// ---------------------------------------------------------------------------
// 2. Projection has all required fields
// ---------------------------------------------------------------------------

console.log('=== Check 2: Projection has required fields ===');

check(projection.interactionScenes !== undefined, 'has interactionScenes');
check(Array.isArray(projection.interactionScenes), 'interactionScenes is array');
check(projection.narrativePackSummary !== undefined, 'has narrativePackSummary');
check(projection.pressureSummary !== undefined, 'has pressureSummary');
check(projection.consensusSummary !== undefined, 'has consensusSummary');
check(projection.evidenceIndex !== undefined, 'has evidenceIndex');
check(Array.isArray(projection.evidenceIndex), 'evidenceIndex is array');
check(projection.llmOptionality !== undefined, 'has llmOptionality');

// pressureSummary has expected shape
check(typeof projection.pressureSummary.available === 'boolean', 'pressureSummary has available');
check(typeof projection.pressureSummary.snapshotCount === 'number', 'pressureSummary has snapshotCount');

// consensusSummary has expected shape
check(typeof projection.consensusSummary.available === 'boolean', 'consensusSummary has available');
check(typeof projection.consensusSummary.formationCount === 'number', 'consensusSummary has formationCount');

console.log('  Projection has required fields: PASS');

// ---------------------------------------------------------------------------
// 3. Projection readOnly with correct projectionKind
// ---------------------------------------------------------------------------

console.log('=== Check 3: ReadOnly and projectionKind ===');

check(projection.readOnly === true, 'readOnly is true');
check(projection.projectionKind === 'semantic_receipt_adapter_state', 'correct kind');

// Also test from state
const world2 = buildWorld(SEED);
advanceOneDay(world2);
const stateProjection = buildSemanticWorkspaceProjectionFromState(world2);
check(stateProjection.day === world2.day - 1, 'stateProjection: day matches');
check(stateProjection.readOnly === true, 'stateProjection: readOnly');
check(stateProjection.projectionKind === 'semantic_receipt_adapter_state', 'stateProjection: kind');

console.log('  ReadOnly and projectionKind: PASS');

// ---------------------------------------------------------------------------
// 4. DecisionSupportWorkspace exposes recommendationDrafts
// ---------------------------------------------------------------------------

console.log('=== Check 4: DecisionSupport exposes recommendationDrafts ===');

const dsProjection = buildDecisionSupportWorkspaceProjection(world2);
check(dsProjection !== null, 'dsProjection is not null');
check(dsProjection.projectionKind === 'decision_support_adapter_state', 'dsProjection: correct kind');
check(dsProjection.readOnly === true, 'dsProjection: readOnly');
check(dsProjection.day === world2.day, 'dsProjection: day matches world.day');

// Summary has recommendationDraftCount
check(typeof dsProjection.summary.recommendationDraftCount === 'number', 'summary: has recommendationDraftCount');
check(typeof dsProjection.summary.enabledRecommendationDraftCount === 'number', 'summary: has enabledRecommendationDraftCount');
check(dsProjection.summary.recommendationDraftCount >= 0, 'summary: recommendationDraftCount >= 0');

// recommendationDrafts aggregate
check(typeof dsProjection.recommendationDrafts.count === 'number', 'drafts: count is number');
check(typeof dsProjection.recommendationDrafts.enabledCount === 'number', 'drafts: enabledCount is number');
check(typeof dsProjection.recommendationDrafts.disabledCount === 'number', 'drafts: disabledCount is number');
check(Array.isArray(dsProjection.recommendationDrafts.legacyActionIds), 'drafts: legacyActionIds is array');

// Per-case recommendationDrafts
for (const caseProj of dsProjection.cases) {
  check(Array.isArray(caseProj.recommendationDrafts), `case ${caseProj.caseId}: has recommendationDrafts array`);
  for (const draft of caseProj.recommendationDrafts) {
    check(draft.actionSpecId.length > 0, 'draft: actionSpecId non-empty');
    check(draft.caseId.length > 0, 'draft: caseId non-empty');
    check(typeof draft.priority === 'number', 'draft: priority is number');
    check(typeof draft.confidence === 'number', 'draft: confidence is number');
    check(typeof draft.enabled === 'boolean', 'draft: enabled is boolean');
  }
}

console.log('  DecisionSupport exposes recommendationDrafts: PASS');

// ---------------------------------------------------------------------------
// 5. LLM boundary: disabled, no provider
// ---------------------------------------------------------------------------

console.log('=== Check 5: LLM disabled ===');

check(projection.llmOptionality.mode === 'disabled', 'LLM mode is disabled');

const composerSrc = readFileSync(
  `${ROOT}/interface/interaction-workspace/semanticWorkspaceComposer.ts`, 'utf-8');
const composerCode = stripComments(composerSrc);
check(!composerCode.includes('openai'), 'composer: no openai');
check(!composerCode.includes('apiKey'), 'composer: no apiKey');
check(!composerCode.includes('fetch('), 'composer: no fetch');

console.log('  LLM disabled: PASS');

// ---------------------------------------------------------------------------
// 6. No raw GameState keys in workspace composer
// ---------------------------------------------------------------------------

console.log('=== Check 6: No raw state in composer ===');

check(!composerCode.includes('state.cases'), 'composer: no state.cases');
check(!composerCode.includes('state.opportunities'), 'composer: no state.opportunities');
check(!composerCode.includes('state.customers'), 'composer: no state.customers');
check(!composerCode.includes('state.eventStore'), 'composer: no state.eventStore');
check(!composerCode.includes('state.rngState'), 'composer: no state.rngState');

// DecisionSupportBoundary reads through adapter boundary
const dsSrc = readFileSync(
  `${ROOT}/interface/interaction-workspace/decisionSupportBoundary.ts`, 'utf-8');
const dsCode = stripComments(dsSrc);
check(dsCode.includes('buildDecisionSupportContextFromLegacyState'), 'dsBoundary: uses adapter boundary');
check(!dsCode.includes('state.cases'), 'dsBoundary: no state.cases direct access');
check(!dsCode.includes('state.rngState'), 'dsBoundary: no state.rngState');

console.log('  No raw state in composer: PASS');

// ---------------------------------------------------------------------------
// 7. Deterministic
// ---------------------------------------------------------------------------

console.log('=== Check 7: Deterministic ===');

const worldA = buildWorld(SEED);
const worldB = buildWorld(SEED);

const tickA = advanceOneDay(worldA) as DailyTickResult;
const tickB = advanceOneDay(worldB) as DailyTickResult;

const projA = buildSemanticWorkspaceProjectionFromDailyTickResult(tickA);
const projB = buildSemanticWorkspaceProjectionFromDailyTickResult(tickB);

check(JSON.stringify(projA) === JSON.stringify(projB), 'identical projection JSON');

// DecisionSupport projection
const dsA = buildDecisionSupportWorkspaceProjection(worldA);
const dsB = buildDecisionSupportWorkspaceProjection(worldB);
check(JSON.stringify(dsA) === JSON.stringify(dsB), 'identical dsProjection JSON');

console.log('  Deterministic: PASS');

// ---------------------------------------------------------------------------
// 8. Bridge operatingMovement flows through semanticReceipts
// ---------------------------------------------------------------------------

console.log('=== Check 8: operatingMovement flows through ===');

// The bridge in semanticReceipts should have operatingMovement
check(tick1.semanticReceipts?.dailyDecisionBridge !== undefined, 'bridge exists in receipt');
check(tick1.semanticReceipts?.dailyDecisionBridge?.operatingMovement !== undefined, 'operatingMovement exists');

// Enrichment preserves operatingMovement
const sampleBridge = buildDailyDecisionBridgeSummary({
  day: tick1.day,
  movedCases: [],
  actorPovChanges: [],
  recommendations: [],
  caseMovements: [{
    caseId: 'test-case',
    movements: [{
      kind: 'owner_relation',
      direction: 'improved',
      magnitude: 'medium',
      field: 'trust',
      from: 50,
      to: 65,
      delta: 15,
      reason: 'broker call',
      sourceRefIds: ['scene:1'],
    }],
    blockerEmergences: [],
    blockerResolutions: [],
    recommendedActionId: 'follow-up-call',
  }],
});

const enriched = enrichDailyTickResultWithDailyDecisionBridge(tick1, sampleBridge);
check(enriched.semanticReceipts?.dailyDecisionBridge?.operatingMovement !== undefined,
  'enriched: operatingMovement preserved');
check(enriched.semanticReceipts?.dailyDecisionBridge?.operatingMovement?.movedCaseCount === 1,
  'enriched: movedCaseCount=1');
check(enriched.semanticReceipts?.dailyDecisionBridge?.operatingMovement?.caseMovements[0]?.caseId === 'test-case',
  'enriched: caseMovement has correct caseId');

console.log('  operatingMovement flows through: PASS');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Workspace Follow-Through Agenda Contract ===`);
console.log(`Total: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);

if (failed > 0) {
  console.log('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\nworkspace follow-through-agenda contract passed');
  process.exit(0);
}
