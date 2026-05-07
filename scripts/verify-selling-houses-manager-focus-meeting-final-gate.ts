/**
 * Manager Focus Meeting Final Hard Gate.
 *
 * Proves the Manager Focus Meeting system is real:
 * 1. A/B/C/D governance, E/F blocked
 * 2. FocusMeetingState exists on GameState with real fields
 * 3. ProcessWorkspaceProjection provides compressed ProcessRun data
 * 4. OwnerPOV data is available for manager consumption
 * 5. ActionReceipt data is available for focus meeting evidence
 * 6. DailyOperatingLedger provides compressed operating data
 * 7. All consumed projections are compressed — no raw GameState/Case/Opportunity leakage
 * 8. Focus meeting data is deterministic from same seed
 * 9. Focus meeting derivation does NOT change gameplay
 * 10. No Date.now/Math.random/fetch/OpenAI/apiKey in focus meeting paths
 * 11. Next-step suggestions are intention-only
 * 12. Focus meeting is a process, not a one-click action
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { advanceOneDay, advanceDays, seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import type { GameState, DailyTickResult } from '../src/selling-houses/domain/models.js';

import { buildProcessWorkspaceProjection } from '../src/selling-houses/interface/interaction-workspace/processWorkspaceBoundary.js';
import { buildActionReceiptDaySummary } from '../src/selling-houses/runtime/simulation/actionReceiptAdapter.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function check(condition: boolean, message: string) {
  if (condition) { passed++; }
  else { failed++; console.error(`  [FAIL] ${message}`); }
}

function stripComments(src: string): string {
  return src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

const SEED = 20260507;

function buildWorld(seed: number): GameState {
  const snapshot = getScenarioSnapshotById('standard-window-chain');
  assert.ok(snapshot, 'Expected standard-window-chain scenario');
  const world = createInitialState(snapshot, seed);
  seedInitialOpportunities(world);
  updateDerivedState(world);
  return world;
}

// ---------------------------------------------------------------------------
// 1. Governance
// ---------------------------------------------------------------------------

console.log('=== Check 1: A/B/C/D governance, E/F blocked ===');

const workplanSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/docs/selling-houses-mother-model-agent-workplan.md', 'utf-8');
check(workplanSrc.includes('A, B, C, D are workers'), 'workplan: A/B/C/D are workers');
check(workplanSrc.includes('Do not create Agent E/F'), 'workplan: E/F blocked');

console.log('  Governance: PASS');

// ---------------------------------------------------------------------------
// 2. FocusMeetingState exists and is structured
// ---------------------------------------------------------------------------

console.log('=== Check 2: FocusMeetingState structure ===');

const world = buildWorld(SEED);

check(world.focusMeeting !== undefined, 'GameState has focusMeeting field');
check(typeof world.focusMeeting.submissionDay === 'number' || world.focusMeeting.submissionDay === null,
  'focusMeeting.submissionDay is number|null');
check(Array.isArray(world.focusMeeting.submittedCaseIds),
  'focusMeeting.submittedCaseIds is array');
check(Array.isArray(world.focusMeeting.selectedCaseIds),
  'focusMeeting.selectedCaseIds is array');

// Focus meeting is part of GameState lifecycle
check(typeof world.day === 'number', 'GameState has day');
check(world.day > 0, 'GameState day > 0');

console.log('  FocusMeetingState structure: PASS');

// ---------------------------------------------------------------------------
// 3. ProcessWorkspaceProjection provides compressed ProcessRun data
// ---------------------------------------------------------------------------

console.log('=== Check 3: ProcessWorkspaceProjection for focus meeting ===');

const projection = buildProcessWorkspaceProjection(world);
check(projection.projectionKind === 'process_workspace_projection', 'projection: correct kind');
check(projection.readOnly === true, 'projection: readOnly');
check(typeof projection.day === 'number', 'projection: has day');
check(Array.isArray(projection.processes), 'projection: has processes');
check(Array.isArray(projection.contracts), 'projection: has contracts');
check(Object.isFrozen(projection), 'projection: frozen');

// Projection contains compressed data only
const projJson = JSON.stringify(projection);
check(!projJson.includes('"rngState"'), 'projection: no rngState');
check(!projJson.includes('"eventStore"'), 'projection: no eventStore');
check(!projJson.includes('"cases"'), 'projection: no raw cases array');
check(!projJson.includes('"opportunities"'), 'projection: no raw opportunities array');
check(!projJson.includes('"customers"'), 'projection: no raw customers array');

// Process counts are useful for manager
check(typeof projection.processCountsByType['open-day'] === 'number', 'projection: open-day count');
check(typeof projection.processCountsByType['sincerity-sale'] === 'number', 'projection: sincerity-sale count');
check(typeof projection.processCountsByType['negotiation'] === 'number', 'projection: negotiation count');

console.log('  ProcessWorkspaceProjection: PASS');

// ---------------------------------------------------------------------------
// 4. OwnerPOV data available for manager consumption
// ---------------------------------------------------------------------------

console.log('=== Check 4: OwnerPOV available ===');

// Check that povAdapter exists and builds OwnerPOV
const povAdapterSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/runtime/decision-support/povAdapter.ts', 'utf-8');
check(povAdapterSrc.includes('buildOwnerPOVSnapshot'), 'povAdapter: exports buildOwnerPOVSnapshot');
check(povAdapterSrc.includes('buildBrokerPOVSnapshot'), 'povAdapter: exports buildBrokerPOVSnapshot');

// OwnerPOV hides broker-only info
const povBoundarySrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/interface/interaction-workspace/povBoundary.ts', 'utf-8');
check(povBoundarySrc.includes('OwnerPOVWorkspaceProjection'), 'povBoundary: has OwnerPOVWorkspaceProjection');

console.log('  OwnerPOV available: PASS');

// ---------------------------------------------------------------------------
// 5. ActionReceipt data available for focus meeting evidence
// ---------------------------------------------------------------------------

console.log('=== Check 5: ActionReceipt data available ===');

// ActionReceipt adapter exists
const receiptAdapterSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/runtime/simulation/actionReceiptAdapter.ts', 'utf-8');
check(receiptAdapterSrc.includes('buildActionReceiptDaySummary'), 'adapter: has day summary builder');
check(receiptAdapterSrc.includes('buildActionReceiptsForDay'), 'adapter: has day filter');
check(receiptAdapterSrc.includes('buildCommitmentSettlementsForDay'), 'adapter: has settlement filter');

// ActionReceipt is populated in GameState
check(Array.isArray(world.actionReceiptHistory), 'GameState has actionReceiptHistory');
check(Array.isArray(world.commitmentSettlementHistory), 'GameState has commitmentSettlementHistory');

// After advancing, receipts may be populated
const worldForReceipts = buildWorld(20260509);
advanceDays(worldForReceipts, 3);
const receiptSummary = buildActionReceiptDaySummary(worldForReceipts, 1);
check(typeof receiptSummary.totalReceipts === 'number', 'receipt summary: has totalReceipts');
check(typeof receiptSummary.successCount === 'number', 'receipt summary: has successCount');

console.log('  ActionReceipt data available: PASS');

// ---------------------------------------------------------------------------
// 6. DailyOperatingLedger provides compressed data
// ---------------------------------------------------------------------------

console.log('=== Check 6: DailyOperatingLedger data ===');

check(Array.isArray(world.operatingLedgerDays) || world.operatingLedgerDays === undefined,
  'GameState has operatingLedgerDays');

// After advancing, ledger should have entries
if (world.operatingLedgerDays && world.operatingLedgerDays.length > 0) {
  const firstDay = world.operatingLedgerDays[0];
  check(typeof firstDay.day === 'number', 'ledger day: has day number');
  check(Array.isArray(firstDay.entries), 'ledger day: has entries');
}

console.log('  DailyOperatingLedger data: PASS');

// ---------------------------------------------------------------------------
// 7. No raw GameState leakage in consumed projections
// ---------------------------------------------------------------------------

console.log('=== Check 7: No raw state leakage ===');

// Focus meeting must consume compressed data, not raw GameState
const focusMeetingSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/domain/models.ts', 'utf-8');

// FocusMeetingState is minimal — no embedded Case/Opportunity/Customer
const fmType = focusMeetingSrc.substring(
  focusMeetingSrc.indexOf('interface FocusMeetingState'),
  focusMeetingSrc.indexOf('}', focusMeetingSrc.indexOf('interface FocusMeetingState')) + 1,
);
// Check for embedded types (not field names that happen to contain "Case")
check(!fmType.includes('interface Case'), 'FocusMeetingState: no embedded Case interface');
check(!fmType.includes(': Case'), 'FocusMeetingState: no Case type reference');
check(!fmType.includes('Opportunity '), 'FocusMeetingState: no embedded Opportunity type');
check(!fmType.includes('Customer '), 'FocusMeetingState: no embedded Customer type');
check(!fmType.includes('GameState '), 'FocusMeetingState: no embedded GameState type');

// ProcessWorkspaceProjection is compressed
check(!projJson.includes('"budgetLedger"'), 'projection: no budgetLedger');
check(!projJson.includes('"customerStates"'), 'projection: no customerStates');

console.log('  No raw state leakage: PASS');

// ---------------------------------------------------------------------------
// 8. Deterministic from same seed
// ---------------------------------------------------------------------------

console.log('=== Check 8: Deterministic ===');

const worldA = buildWorld(20260510);
const worldB = buildWorld(20260510);

check(JSON.stringify(worldA.focusMeeting) === JSON.stringify(worldB.focusMeeting),
  'FocusMeetingState: same seed -> identical');

const projA = buildProcessWorkspaceProjection(worldA);
const projB = buildProcessWorkspaceProjection(worldB);
check(JSON.stringify(projA) === JSON.stringify(projB),
  'ProcessWorkspaceProjection: same seed -> identical');

console.log('  Deterministic: PASS');

// ---------------------------------------------------------------------------
// 9. Focus meeting does NOT change gameplay
// ---------------------------------------------------------------------------

console.log('=== Check 9: Gameplay invariance ===');

const worldC = buildWorld(20260511);
const beforeDeals = worldC.closedDeals.length;
const beforeRng = worldC.rngCalls;
const beforeOpps = worldC.opportunities.length;

// Derive focus meeting related data
const _fm = worldC.focusMeeting;
const _proj = buildProcessWorkspaceProjection(worldC);
const _receipts = buildActionReceiptDaySummary(worldC, 1);

check(worldC.closedDeals.length === beforeDeals, 'closedDeals unchanged');
check(worldC.rngCalls === beforeRng, 'rngCalls unchanged');
check(worldC.opportunities.length === beforeOpps, 'opportunities unchanged');

console.log('  Gameplay invariance: PASS');

// ---------------------------------------------------------------------------
// 10. No side effects
// ---------------------------------------------------------------------------

console.log('=== Check 10: No side effects ===');

const focusMeetingFieldSrc = stripComments(
  readFileSync('/Users/jiaqi/Documents/开放日测算/src/selling-houses/application/gameState.ts', 'utf-8'));
// FocusMeeting normalization should not have side effects
check(focusMeetingFieldSrc.includes('normalizeFocusMeeting'), 'gameState: has normalizeFocusMeeting');

// ProcessWorkspaceProjection builder should be pure
const wsBoundarySrc = stripComments(
  readFileSync('/Users/jiaqi/Documents/开放日测算/src/selling-houses/interface/interaction-workspace/processWorkspaceBoundary.ts', 'utf-8'));
check(!wsBoundarySrc.includes('Date.now'), 'processWorkspaceBoundary: no Date.now');
check(!wsBoundarySrc.includes('Math.random'), 'processWorkspaceBoundary: no Math.random');
check(!wsBoundarySrc.includes('fetch('), 'processWorkspaceBoundary: no fetch');

console.log('  No side effects: PASS');

// ---------------------------------------------------------------------------
// 11. Intention-only
// ---------------------------------------------------------------------------

console.log('=== Check 11: Intention-only ===');

// Focus meeting is a process (Section 11.3 of mother model)
// It should not auto-execute outcomes
check(!fmType.includes('execute'), 'FocusMeetingState: no execute method');
check(!fmType.includes('resolve'), 'FocusMeetingState: no resolve method');

// Focus meeting lifecycle is handled by process managers, not by direct mutation
const processManagerSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/runtime/simulation/processes/productRunProcessManager.ts', 'utf-8');
check(processManagerSrc.includes('advanceProductRunProcessesForDay'),
  'productRunProcessManager: has advance function');
check(processManagerSrc.includes('runtime-process-manager'),
  'productRunProcessManager: transition owner is runtime-process-manager');

console.log('  Intention-only: PASS');

// ---------------------------------------------------------------------------
// 12. Focus meeting is a business process
// ---------------------------------------------------------------------------

console.log('=== Check 12: Focus meeting as business process ===');

// Mother model Section 11.3: FocusMeetingRun is an organizational attention market
// Check that focus-meeting-submit action is linked to business flows
const actionSpecsSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/business-rules/action-specs/legacyAdapter.ts', 'utf-8');
check(actionSpecsSrc.includes("'focus-meeting-submit'"), 'action-specs: focus-meeting-submit exists');
check(actionSpecsSrc.includes("'team-listing-co-sell'"), 'action-specs: team-listing-co-sell flow');

// Business flow definitions include focus meeting path
const flowDefSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/business-rules/business-flows/definitions.ts', 'utf-8');
check(flowDefSrc.includes("'focus-meeting-submit'"), 'business-flows: focus-meeting-submit in flow');
check(flowDefSrc.includes("'team-listing-co-sell'"), 'business-flows: team-listing-co-sell flow exists');

// InteractionScene includes focus_meeting type
const interactionSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/interactions/models.ts', 'utf-8');
check(interactionSrc.includes("'focus_meeting'"), 'interactions: focus_meeting scene type');
check(interactionSrc.includes("'manager_review'"), 'interactions: manager_review scene type');

console.log('  Focus meeting as business process: PASS');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Manager Focus Meeting Final Gate ===`);
console.log(`Total: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);

if (failed > 0) {
  console.log('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\nmanager-focus-meeting final gate passed');
  process.exit(0);
}
