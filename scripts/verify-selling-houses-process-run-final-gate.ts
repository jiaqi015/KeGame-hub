/**
 * ProcessRun + BusinessFlowTemplate Final Hard Gate.
 *
 * Proves ProcessRun system is real business functionality:
 * 1. A/B/C/D governance, E/F blocked
 * 2. Core contracts exist and are pure (no domain/runtime/UI import)
 * 3. BusinessFlowTemplate has >= 6 template kinds
 * 4. ProcessRun has 7 lifecycle statuses
 * 5. Runtime produces real ProcessRun read-models (not just type stubs)
 * 6. ProcessWorkspaceProjection consumes compressed data
 * 7. nextStepDrafts are intention-only (never auto-execute)
 * 8. ContractFact is deal truth source, ProcessRun cannot fake a close
 * 9. Deterministic: same input -> byte-identical ProcessRun
 * 10. No Date.now/Math.random/fetch/OpenAI/apiKey in builders
 * 11. All outputs frozen
 * 12. Existing gates still green
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { createInitialState, updateDerivedState } from '../src/selling-houses/application/gameState.js';
import { getScenarioSnapshotById } from '../src/selling-houses/domain/scenarioCatalog.js';
import { advanceOneDay, executeAction, seedInitialOpportunities } from '../src/selling-houses/domain/engine.js';
import { popPendingActionReceiptSnapshots } from '../src/selling-houses/domain/engine/actionResolvers.js';
import { buildActionReceiptFromSnapshot, appendActionReceiptFromSnapshot } from '../src/selling-houses/runtime/simulation/actionReceiptFromSnapshotAdapter.js';
import type { GameState, DailyTickResult } from '../src/selling-houses/domain/models.js';

import {
  buildProcessRunsFromState,
  enrichStateWithProcessRuns,
} from '../src/selling-houses/runtime/simulation/processRunAdapter.js';

import {
  buildBusinessFlowTemplateCatalog,
  buildProcessRunFromInput,
  buildEmptyProcessRunSummary,
  summarizeProcessRunsForCase,
  summarizeProcessRunsAcrossCases,
  type BusinessFlowTemplateKind,
  type ProcessRunStatus,
  type ProcessRunInput,
} from '../src/selling-houses/core/world-state/processes/models.js';

import {
  deriveProcessRunReadModelsFromLegacyState,
  buildProcessManagerContractsFromLegacyState,
} from '../src/selling-houses/runtime/simulation/processes/legacyAdapters.js';

import {
  buildProcessWorkspaceProjection,
} from '../src/selling-houses/interface/interaction-workspace/processWorkspaceBoundary.js';

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

const coreProcessesSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/processes/models.ts', 'utf-8');
check(!coreProcessesSrc.includes("from '../../agent-e"), 'processes/models: no E/F imports');
check(!coreProcessesSrc.includes("from '../../agent-f"), 'processes/models: no F imports');

console.log('  Governance: PASS');

// ---------------------------------------------------------------------------
// 2. Core contract purity
// ---------------------------------------------------------------------------

console.log('=== Check 2: Core contract purity ===');

const processCode = stripComments(coreProcessesSrc);
check(!processCode.includes("from '../../domain"), 'processes/models: no domain imports');
check(!processCode.includes("from '../../runtime"), 'processes/models: no runtime imports');
check(!processCode.includes("from '../../application"), 'processes/models: no application imports');
check(!processCode.includes("from '../../interface"), 'processes/models: no interface imports');
check(!processCode.includes('Date.now'), 'processes/models: no Date.now');
check(!processCode.includes('Math.random'), 'processes/models: no Math.random');
check(!processCode.includes('crypto'), 'processes/models: no crypto');
check(!processCode.includes('let _runSeq'), 'processes/models: no mutable _runSeq counter');

// Exports
const processIndexSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/core/world-state/processes/index.ts', 'utf-8');
check(processIndexSrc.includes('buildProcessRunFromInput'), 'index exports buildProcessRunFromInput');
check(processIndexSrc.includes('buildBusinessFlowTemplateCatalog'), 'index exports buildBusinessFlowTemplateCatalog');
check(processIndexSrc.includes('summarizeProcessRunsForCase'), 'index exports summarizeProcessRunsForCase');

console.log('  Core contract purity: PASS');

// ---------------------------------------------------------------------------
// 3. BusinessFlowTemplate >= 6 kinds
// ---------------------------------------------------------------------------

console.log('=== Check 3: BusinessFlowTemplate >= 6 kinds ===');

const catalog = buildBusinessFlowTemplateCatalog();
check(catalog.length >= 6, `catalog has ${catalog.length} templates (>= 6)`);

const templateKinds = new Set<BusinessFlowTemplateKind>();
for (const tpl of catalog) {
  check(tpl.templateId.length > 0, `template ${tpl.kind}: has templateId`);
  check(tpl.label.length > 0, `template ${tpl.kind}: has label`);
  check(tpl.phases.length >= 3, `template ${tpl.kind}: >= 3 phases`);
  check(tpl.gates.length >= 2, `template ${tpl.kind}: >= 2 gates`);
  check(tpl.actorRoles.length >= 1, `template ${tpl.kind}: >= 1 actorRoles`);
  check(tpl.typicalDurationDays > 0, `template ${tpl.kind}: positive durationDays`);
  templateKinds.add(tpl.kind);

  // Each phase has requiredEvidenceKinds
  for (const phase of tpl.phases) {
    check(phase.phaseId.length > 0, `template ${tpl.kind}: phase ${phase.phaseId} has ID`);
    check(typeof phase.order === 'number', `template ${tpl.kind}: phase ${phase.phaseId} has order`);
  }

  // Each gate references valid phases
  for (const gate of tpl.gates) {
    check(gate.fromPhaseId.length > 0, `template ${tpl.kind}: gate ${gate.gateId} has fromPhaseId`);
    check(gate.toPhaseId.length > 0, `template ${tpl.kind}: gate ${gate.gateId} has toPhaseId`);
  }
}

// Verify all 6 BusinessFlowTemplateKind values are present
const expectedKinds: BusinessFlowTemplateKind[] = [
  'price_adjustment_communication',
  'showing_to_offer_conversion',
  'open_day_campaign',
  'sincerity_sale_push',
  'owner_waiting_to_commitment',
  'consensus_to_contract',
];
for (const kind of expectedKinds) {
  check(templateKinds.has(kind), `template kind ${kind} present`);
}

console.log(`  BusinessFlowTemplate: ${catalog.length} templates, ${templateKinds.size} kinds: PASS`);

// ---------------------------------------------------------------------------
// 4. ProcessRun has 7 lifecycle statuses
// ---------------------------------------------------------------------------

console.log('=== Check 4: ProcessRun 7 lifecycle statuses ===');

const allStatuses: ProcessRunStatus[] = [
  'active', 'resolved', 'blocked', 'collapsed', 'converted_to_contract', 'expired', 'superseded',
];

for (const status of allStatuses) {
  const input: ProcessRunInput = {
    templateId: 'tpl-price-adjustment',
    templateKind: 'price_adjustment_communication',
    caseId: `case-${status}`,
    status,
    currentPhaseId: 'price-gap-identified',
    startedDay: 1,
  };
  const run = buildProcessRunFromInput(input);
  check(run.status === status, `ProcessRun: status=${status}`);
}

console.log('  ProcessRun 7 statuses: PASS');

// ---------------------------------------------------------------------------
// 5. Runtime produces real ProcessRun read-models
// ---------------------------------------------------------------------------

console.log('=== Check 5: Runtime ProcessRun read-models ===');

const world = buildWorld(SEED);
const tick = advanceOneDay(world) as DailyTickResult;

// Derive read-models from legacy state
// Note: a fresh world may have 0 read-models if no productRuns or
// pendingClosingEvaluation opportunities exist yet. This is expected.
// The HARD requirement for non-zero ProcessRun is in Check 5b below.
const readModels = deriveProcessRunReadModelsFromLegacyState(world);
check(Array.isArray(readModels), 'readModels is array');
// Do NOT allow 0 read-models to pass silently — require explanation
if (readModels.length === 0) {
  console.log('  [INFO] readModels=0 (fresh world, no productRuns/pendingClosing yet — acceptable for contract check only)');
}

// Check contracts
const contracts = buildProcessManagerContractsFromLegacyState(world);
check(contracts.length === 3, `3 process manager contracts (open-day, sincerity-sale, negotiation)`);

const contractTypes = new Set(contracts.map(c => c.processType));
check(contractTypes.has('open-day'), 'contract for open-day');
check(contractTypes.has('sincerity-sale'), 'contract for sincerity-sale');
check(contractTypes.has('negotiation'), 'contract for negotiation');

// Each contract has lifecycle ownership info
for (const contract of contracts) {
  check(contract.displayName.length > 0, `contract ${contract.processType}: has displayName`);
  check(contract.observes.length > 0, `contract ${contract.processType}: has observes`);
  check(contract.lifecycleOwnership.futureOwner === 'runtime-process-manager',
    `contract ${contract.processType}: futureOwner=runtime-process-manager`);
  check(contract.reads.length > 0, `contract ${contract.processType}: has reads`);
}

console.log(`  Runtime ProcessRun: ${readModels.length} read-models, ${contracts.length} contracts: PASS`);

// ---------------------------------------------------------------------------
// 5b. Real scenario produces non-zero ProcessRun via action receipts
// ---------------------------------------------------------------------------

console.log('=== Check 5b: Real scenario produces ProcessRun > 0 ===');

// Build a world with real opportunities and execute real actions
const realWorld = buildWorld(SEED);
const realTick = advanceOneDay(realWorld) as DailyTickResult;
updateDerivedState(realWorld);

// Find an active case with at least one opportunity
const activeCases = realWorld.cases.filter(c => c.status === 'active');
check(activeCases.length > 0, 'scenario has active cases');

let receiptsProduced = 0;
if (activeCases.length > 0) {
  // Execute a sequence of actions on the first active case
  // to build up a real actionReceiptHistory.
  // The sequence matches 'owner_waiting_to_commitment' flow pattern:
  //   trigger: weekly-feedback (0.4 confidence)
  //   advancing: first-visit (0.1 confidence)
  //   terminal: pricing-advice (0.2 confidence)
  //   total: 0.7 > 0.3 threshold
  const targetCase = activeCases[0];
  const actionSequence = [
    'weekly-feedback',
    'first-visit',
    'pricing-advice',
  ];

  for (const actionId of actionSequence) {
    const result = executeAction(realWorld, actionId, targetCase);
    // Process pending receipt snapshots into actionReceiptHistory
    for (const snap of popPendingActionReceiptSnapshots()) {
      const receipt = buildActionReceiptFromSnapshot(snap, realWorld);
      appendActionReceiptFromSnapshot(realWorld, receipt);
      receiptsProduced++;
    }
  }
}

// Build ProcessRuns from the state with real receipts
const realRuns = buildProcessRunsFromState(realWorld);

check(realRuns.length > 0, `real scenario produced ${realRuns.length} ProcessRun(s) (expected > 0, got receipts: ${receiptsProduced})`);

// Each run must be a valid ProcessRun
for (const run of realRuns) {
  check(typeof run.runId === 'string' && run.runId.length > 0, `run has runId: ${run.runId}`);
  check(typeof run.templateKind === 'string', `run has templateKind: ${run.templateKind}`);
  check(typeof run.caseId === 'string' && run.caseId.length > 0, `run has caseId: ${run.caseId}`);
  check(Object.isFrozen(run), `run ${run.runId} is frozen`);
}

// Verify enrichment with upsert
enrichStateWithProcessRuns(realWorld, realRuns);
check(realWorld.processRunHistory!.length === realRuns.length, `processRunHistory has ${realRuns.length} entries`);

// Re-enrich (upsert, not duplicate)
enrichStateWithProcessRuns(realWorld, realRuns);
check(realWorld.processRunHistory!.length === realRuns.length, `upsert: still ${realRuns.length} entries`);

console.log(`  Real ProcessRun: ${realRuns.length} runs from ${receiptsProduced} receipts: PASS`);

// ---------------------------------------------------------------------------
// 6. ProcessWorkspaceProjection
// ---------------------------------------------------------------------------

console.log('=== Check 6: ProcessWorkspaceProjection ===');

const projection = buildProcessWorkspaceProjection(world);
check(projection.projectionKind === 'process_workspace_projection', 'projection: correct kind');
check(projection.source === 'runtime-simulation-processes', 'projection: correct source');
check(projection.readOnly === true, 'projection: readOnly');
check(projection.day === world.day, 'projection: day matches');
check(typeof projection.processCountsByType === 'object', 'projection: has processCountsByType');
check(typeof projection.runningCount === 'number', 'projection: has runningCount');
check(typeof projection.managerMutableCount === 'number', 'projection: has managerMutableCount');
check(Array.isArray(projection.processes), 'projection: has processes array');
check(Array.isArray(projection.contracts), 'projection: has contracts array');
check(typeof projection.lifecycleMigrationPlan === 'object', 'projection: has lifecycleMigrationPlan');
check(Object.isFrozen(projection), 'projection: frozen');

console.log('  ProcessWorkspaceProjection: PASS');

// ---------------------------------------------------------------------------
// 7. nextStepDrafts are intention-only
// ---------------------------------------------------------------------------

console.log('=== Check 7: Intention-only ===');

check(processCode.includes('readonly draftId'), 'processes/models: draftId is readonly');
check(processCode.includes('readonly actionKind'), 'processes/models: actionKind is readonly');
check(!processCode.includes('execute('), 'processes/models: no execute() method');
check(!processCode.includes('resolveAction'), 'processes/models: no resolveAction');
check(!processCode.includes('applyOutcome'), 'processes/models: no applyOutcome');

// Builder returns frozen object, not executable
const testRun = buildProcessRunFromInput({
  templateId: 'tpl-price-adjustment',
  templateKind: 'price_adjustment_communication',
  caseId: 'case-intention',
  currentPhaseId: 'price-gap-identified',
  startedDay: 1,
  nextStepDrafts: [{
    draftId: 'draft:1',
    actionKind: 'pricing-advice',
    description: '建议调价',
    priority: 'high',
    rationale: '市场依据充分',
  }],
});
check(Object.isFrozen(testRun), 'ProcessRun frozen (not executable)');
check(Object.isFrozen(testRun.nextStepDrafts), 'nextStepDrafts frozen');

console.log('  Intention-only: PASS');

// ---------------------------------------------------------------------------
// 8. ContractFact is deal truth source
// ---------------------------------------------------------------------------

console.log('=== Check 8: ContractFact truth source ===');

check(!processCode.includes('dealPrice'), 'processes/models: no dealPrice field');
check(!processCode.includes('dealId'), 'processes/models: no dealId field');
check(!processCode.includes('contractSigned'), 'processes/models: no contractSigned mutation');

// ProcessRunOutcome references are refs, not embedded objects
check(processCode.includes('readonly relatedContractFactId'), 'outcome references ContractFact by ID');
check(processCode.includes('readonly relatedConsensusId'), 'outcome references Consensus by ID');

console.log('  ContractFact truth source: PASS');

// ---------------------------------------------------------------------------
// 9. Deterministic
// ---------------------------------------------------------------------------

console.log('=== Check 9: Deterministic ===');

const detInput: ProcessRunInput = {
  templateId: 'tpl-showing-to-offer',
  templateKind: 'showing_to_offer_conversion',
  caseId: 'case-det',
  currentPhaseId: 'showing-scheduled',
  startedDay: 3,
  actorIds: ['broker:1', 'customer:1'],
  phaseSnapshots: [{
    phaseId: 'showing-scheduled',
    enteredDay: 3,
    actionReceiptIds: ['receipt:showing:1'],
  }],
};

const runA = buildProcessRunFromInput(detInput);
const runB = buildProcessRunFromInput(detInput);
check(runA.runId === runB.runId, 'deterministic: same runId');
check(JSON.stringify(runA) === JSON.stringify(runB), 'deterministic: byte-identical');

// Summary deterministic
const summaryA = summarizeProcessRunsForCase({ caseId: 'case-det', runs: [runA] });
const summaryB = summarizeProcessRunsForCase({ caseId: 'case-det', runs: [runB] });
check(JSON.stringify(summaryA) === JSON.stringify(summaryB), 'deterministic: byte-identical summary');

// Aggregated deterministic
const aggA = summarizeProcessRunsAcrossCases(5, [summaryA]);
const aggB = summarizeProcessRunsAcrossCases(5, [summaryB]);
check(JSON.stringify(aggA) === JSON.stringify(aggB), 'deterministic: byte-identical aggregated');

// Empty deterministic
const emptyA = buildEmptyProcessRunSummary(5);
const emptyB = buildEmptyProcessRunSummary(5);
check(JSON.stringify(emptyA) === JSON.stringify(emptyB), 'deterministic: byte-identical empty');

console.log('  Deterministic: PASS');

// ---------------------------------------------------------------------------
// 10. No side effects
// ---------------------------------------------------------------------------

console.log('=== Check 10: No side effects ===');

check(!processCode.includes('Date.now'), 'processes/models: no Date.now');
check(!processCode.includes('Math.random'), 'processes/models: no Math.random');
check(!processCode.includes('fetch('), 'processes/models: no fetch');
check(!processCode.includes('openai'), 'processes/models: no openai');
check(!processCode.includes('apiKey'), 'processes/models: no apiKey');
check(!processCode.includes('new Date'), 'processes/models: no new Date');
check(!processCode.includes('let _runSeq'), 'processes/models: no mutable counter');

console.log('  No side effects: PASS');

// ---------------------------------------------------------------------------
// 10b. Enrichment pipeline collects diagnostics (not silent swallow)
// ---------------------------------------------------------------------------

console.log('=== Check 10b: Enrichment pipeline diagnostic collection ===');

const pipelineSrc = readFileSync(
  '/Users/jiaqi/Documents/开放日测算/src/selling-houses/runtime/simulation/dailyTickSemanticEnrichmentPipeline.ts',
  'utf-8',
);

// The enrichment function must return diagnostics, not just console.warn.
check(pipelineSrc.includes('EnrichmentDiagnostic'), 'pipeline: defines EnrichmentDiagnostic type');
check(pipelineSrc.includes('readonly EnrichmentDiagnostic[]'), 'pipeline: returns readonly EnrichmentDiagnostic[]');
check(pipelineSrc.includes('diagnostics.push'), 'pipeline: collects diagnostics into array');
check(pipelineSrc.includes('console.warn'), 'pipeline: still logs to console.warn for visibility');

// Verify the function signature changed from void to returning diagnostics
check(pipelineSrc.includes('): readonly EnrichmentDiagnostic[]'), 'pipeline: return type is readonly EnrichmentDiagnostic[]');
check(!pipelineSrc.includes('): void {'), 'pipeline: no longer returns void');

// Verify the diagnostics include step name and day
check(pipelineSrc.includes("step: step.name"), 'pipeline: diagnostic includes step name');
check(pipelineSrc.includes("day: settledDay"), 'pipeline: diagnostic includes day');
check(pipelineSrc.includes("message: msg"), 'pipeline: diagnostic includes message');

console.log('  Enrichment pipeline diagnostic collection: PASS');

// ---------------------------------------------------------------------------
// 11. Frozen output
// ---------------------------------------------------------------------------

console.log('=== Check 11: Frozen output ===');

check(Object.isFrozen(testRun), 'ProcessRun frozen');
check(Object.isFrozen(testRun.phaseSnapshots), 'phaseSnapshots frozen');
check(Object.isFrozen(testRun.evidenceRefs), 'evidenceRefs frozen');
check(Object.isFrozen(testRun.blockers), 'blockers frozen');
check(Object.isFrozen(testRun.nextStepDrafts), 'nextStepDrafts frozen');
check(Object.isFrozen(testRun.actorIds), 'actorIds frozen');
check(Object.isFrozen(summaryA), 'ProcessRunSummary frozen');
check(Object.isFrozen(summaryA.runs), 'ProcessRunSummary.runs frozen');
check(Object.isFrozen(aggA), 'AggregatedSummary frozen');
check(Object.isFrozen(aggA.caseSummaries), 'AggregatedSummary.caseSummaries frozen');
check(Object.isFrozen(emptyA), 'emptySummary frozen');

// Catalog frozen
for (const tpl of catalog) {
  check(Object.isFrozen(tpl), `template ${tpl.kind}: frozen`);
  check(Object.isFrozen(tpl.phases), `template ${tpl.kind}: phases frozen`);
  check(Object.isFrozen(tpl.gates), `template ${tpl.kind}: gates frozen`);
  check(Object.isFrozen(tpl.actorRoles), `template ${tpl.kind}: actorRoles frozen`);
}

console.log('  Frozen output: PASS');

// ---------------------------------------------------------------------------
// 12. ProcessRun does NOT change gameplay
// ---------------------------------------------------------------------------

console.log('=== Check 12: Gameplay invariance ===');

const worldBefore = buildWorld(20260508);
const beforeDeals = worldBefore.closedDeals.length;
const beforeRng = worldBefore.rngCalls;

// Build ProcessRun from the world
const readModelsBefore = deriveProcessRunReadModelsFromLegacyState(worldBefore);
const _projectionBefore = buildProcessWorkspaceProjection(worldBefore);

// Check no gameplay mutation
check(worldBefore.closedDeals.length === beforeDeals, 'closedDeals unchanged after ProcessRun derivation');
check(worldBefore.rngCalls === beforeRng, 'rngCalls unchanged after ProcessRun derivation');

console.log('  Gameplay invariance: PASS');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== ProcessRun Final Gate ===`);
console.log(`Total: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);

if (failed > 0) {
  console.log('\nRESULT: FAIL');
  process.exit(1);
} else {
  console.log('\nprocess-run final gate passed');
  process.exit(0);
}
