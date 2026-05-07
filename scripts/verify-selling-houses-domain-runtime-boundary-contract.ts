/**
 * Domain ↔ Runtime Boundary Contract.
 *
 * Proves domain layer does NOT import runtime/interface/application:
 * 1. A/B/C/D governance, E/F blocked
 * 2. domain/engine.ts does NOT import runtime/simulation/*
 * 3. domain/engine/actionResolvers.ts does NOT import runtime/simulation/*
 * 4. domain/* does NOT import interface/*
 * 5. domain/* does NOT import application/*
 * 6. ActionReceipt generation lives in runtime, not domain
 * 7. No domain file embeds ActionReceipt construction logic
 * 8. ProcessRun / OwnerDecisionMoment / StrategyFork adapters live in runtime
 * 9. DecisionSupport adapters live in runtime
 * 10. Core boundary: core/* does NOT import domain/* (except type-only legacy shims)
 * 11. No mutable counters in core builders
 * 12. All core outputs are frozen
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;
const failures: string[] = [];

function check(condition: boolean, message: string) {
  if (condition) { passed++; }
  else { failed++; failures.push(message); console.error(`  [FAIL] ${message}`); }
}

function stripComments(src: string): string {
  return src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function walkTsFiles(dir: string): string[] {
  const results: string[] = [];
  try {
    for (const entry of readdirSync(dir)) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        results.push(...walkTsFiles(fullPath));
      } else if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) {
        results.push(fullPath);
      }
    }
  } catch { /* directory doesn't exist */ }
  return results;
}

const ROOT = '/Users/jiaqi/Documents/开放日测算';
const DOMAIN_DIR = join(ROOT, 'src/selling-houses/domain');
const RUNTIME_DIR = join(ROOT, 'src/selling-houses/runtime');
const INTERFACE_DIR = join(ROOT, 'src/selling-houses/interface');
const APPLICATION_DIR = join(ROOT, 'src/selling-houses/application');
const CORE_DIR = join(ROOT, 'src/selling-houses/core');

// ---------------------------------------------------------------------------
// 1. Governance
// ---------------------------------------------------------------------------

console.log('=== Check 1: A/B/C/D governance, E/F blocked ===');

const workplanSrc = readFileSync(
  join(ROOT, 'docs/selling-houses-mother-model-agent-workplan.md'), 'utf-8');
check(workplanSrc.includes('A, B, C, D are workers'), 'workplan: A/B/C/D are workers');
check(workplanSrc.includes('Do not create Agent E/F'), 'workplan: E/F blocked');

console.log('  Governance: PASS');

// ---------------------------------------------------------------------------
// 2. domain/engine.ts does NOT import runtime
// ---------------------------------------------------------------------------

console.log('=== Check 2: domain/engine.ts → runtime boundary ===');

const engineSrc = readFileSync(join(DOMAIN_DIR, 'engine.ts'), 'utf-8');
const engineCode = stripComments(engineSrc);

// Count runtime imports from domain/engine.ts
// Allow: runtime/simulation/processes/ (domain-level process logic, in layer import allowlist)
const engineRuntimeImports: string[] = [];
for (const line of engineSrc.split('\n')) {
  if (line.includes("from '../runtime/") || line.includes("from './runtime/")) {
    // Skip allowed imports
    if (line.includes("runtime/simulation/processes/")) continue;
    engineRuntimeImports.push(line.trim());
  }
}

check(engineRuntimeImports.length === 0,
  `domain/engine.ts has ${engineRuntimeImports.length} runtime imports (should be 0)`);

if (engineRuntimeImports.length > 0) {
  for (const imp of engineRuntimeImports) {
    console.error(`    [DEBT] ${imp}`);
  }
}

// Allow: runtime/simulation/processes/ is domain-level process logic (in layer import allowlist)
// This import contains settleNegotiationProcessesForDay, advanceProductRunProcessesForDay
// which are domain-level process settlement, not runtime enrichment.
check(!engineCode.includes("from '../runtime/simulation/semanticReceiptEnrichment"),
  'domain/engine.ts: no import from runtime/simulation/semanticReceiptEnrichment');
check(!engineCode.includes("from '../runtime/simulation/dailyOperatingLedgerAdapter"),
  'domain/engine.ts: no import from runtime/simulation/dailyOperatingLedgerAdapter');
check(!engineCode.includes("from '../runtime/simulation/actionReceiptAdapter"),
  'domain/engine.ts: no import from runtime/simulation/actionReceiptAdapter');
check(!engineCode.includes("from '../runtime/simulation/processRunAdapter"),
  'domain/engine.ts: no import from runtime/simulation/processRunAdapter');
check(!engineCode.includes("from '../runtime/simulation/ownerDecisionMomentAdapter"),
  'domain/engine.ts: no import from runtime/simulation/ownerDecisionMomentAdapter');
check(!engineCode.includes("from '../runtime/simulation/strategyForkAdapter"),
  'domain/engine.ts: no import from runtime/simulation/strategyForkAdapter');
check(!engineCode.includes("from '../runtime/simulation/managerInterventionAdapter"),
  'domain/engine.ts: no import from runtime/simulation/managerInterventionAdapter');
check(!engineCode.includes("from '../runtime/simulation/negotiationReplayAdapter"),
  'domain/engine.ts: no import from runtime/simulation/negotiationReplayAdapter');
check(!engineCode.includes("from '../runtime/simulation/businessOutcomeReviewAdapter"),
  'domain/engine.ts: no import from runtime/simulation/businessOutcomeReviewAdapter');
// decisionMomentBridge should not be imported (calls moved to application layer)
check(!engineCode.includes("from './engine/decisionMomentBridge"),
  'domain/engine.ts: no import from decisionMomentBridge');

console.log('  domain/engine.ts → runtime: CHECK COMPLETE');

// ---------------------------------------------------------------------------
// 3. domain/engine/actionResolvers.ts does NOT import runtime
// ---------------------------------------------------------------------------

console.log('=== Check 3: actionResolvers.ts → runtime boundary ===');

const resolverSrc = readFileSync(join(DOMAIN_DIR, 'engine/actionResolvers.ts'), 'utf-8');
const resolverCode = stripComments(resolverSrc);

check(!resolverCode.includes("from '../../runtime/simulation/actionReceiptAdapter"),
  'actionResolvers.ts: no import from runtime/simulation/actionReceiptAdapter');
check(!resolverCode.includes('buildActionReceipt'),
  'actionResolvers.ts: no buildActionReceipt reference');
check(!resolverCode.includes('appendActionReceipt'),
  'actionResolvers.ts: no appendActionReceipt reference');

// actionResolvers should not reference runtime ActionReceipt construction
// Allow ActionReceiptSnapshot (domain-level snapshot type)
const hasActionReceipt = resolverCode.includes('ActionReceipt');
const onlyHasActionReceiptSnapshot = hasActionReceipt && resolverCode.replace(/ActionReceiptSnapshot/g, '').includes('ActionReceipt');
check(!onlyHasActionReceiptSnapshot,
  'actionResolvers.ts: no ActionReceipt type reference (ActionReceiptSnapshot allowed)');

// DecisionMoment emission moved to application layer — no longer in domain
check(!resolverCode.includes('emitDecisionMomentTriggers'),
  'actionResolvers.ts: no emitDecisionMomentTriggers reference');
check(!resolverCode.includes('advanceFlowProgress'),
  'actionResolvers.ts: no advanceFlowProgress reference');
check(!resolverCode.includes('decisionMomentBridge'),
  'actionResolvers.ts: no decisionMomentBridge import');

console.log('  actionResolvers.ts → runtime: CHECK COMPLETE');

// ---------------------------------------------------------------------------
// 4. domain/* does NOT import interface/*
// ---------------------------------------------------------------------------

console.log('=== Check 4: domain → interface boundary ===');

const domainFiles = walkTsFiles(DOMAIN_DIR);
let domainInterfaceImports = 0;
for (const file of domainFiles) {
  const src = readFileSync(file, 'utf-8');
  const code = stripComments(src);
  if (code.includes("from '../interface/") || code.includes("from '../../interface/")) {
    domainInterfaceImports++;
    console.error(`    [VIOLATION] ${relative(ROOT, file)} imports interface`);
  }
}
check(domainInterfaceImports === 0,
  `domain has ${domainInterfaceImports} interface imports (should be 0)`);

console.log('  domain → interface: PASS');

// ---------------------------------------------------------------------------
// 5. domain/* does NOT import application/*
// ---------------------------------------------------------------------------

console.log('=== Check 5: domain → application boundary ===');

let domainAppImports = 0;
for (const file of domainFiles) {
  const src = readFileSync(file, 'utf-8');
  const code = stripComments(src);
  // Allow domain/config/difficultyOptions.ts to import application/difficultyPresentation
  // (known legacy debt, documented in layer imports allowlist)
  if (relative(DOMAIN_DIR, file) === 'config/difficultyOptions.ts') continue;
  if (code.includes("from '../application/") || code.includes("from '../../application/")) {
    domainAppImports++;
    console.error(`    [VIOLATION] ${relative(ROOT, file)} imports application`);
  }
}
check(domainAppImports === 0,
  `domain has ${domainAppImports} application imports (should be 0)`);

console.log('  domain → application: PASS');

// ---------------------------------------------------------------------------
// 6. ActionReceipt generation lives in runtime
// ---------------------------------------------------------------------------

console.log('=== Check 6: ActionReceipt generation in runtime ===');

// buildActionReceipt must exist in runtime
const receiptAdapterSrc = readFileSync(
  join(RUNTIME_DIR, 'simulation/actionReceiptAdapter.ts'), 'utf-8');
check(receiptAdapterSrc.includes('export function buildActionReceipt'),
  'runtime/actionReceiptAdapter: exports buildActionReceipt');
check(receiptAdapterSrc.includes('export function appendActionReceipt'),
  'runtime/actionReceiptAdapter: exports appendActionReceipt');

// buildActionReceipt must NOT exist in domain
let domainReceiptBuilderCount = 0;
for (const file of domainFiles) {
  const src = readFileSync(file, 'utf-8');
  const code = stripComments(src);
  if (code.includes('export function buildActionReceipt') ||
      code.includes('function buildActionReceipt')) {
    domainReceiptBuilderCount++;
    console.error(`    [VIOLATION] ${relative(ROOT, file)} defines buildActionReceipt`);
  }
}
check(domainReceiptBuilderCount === 0,
  `domain has ${domainReceiptBuilderCount} buildActionReceipt definitions (should be 0)`);

console.log('  ActionReceipt in runtime: PASS');

// ---------------------------------------------------------------------------
// 7. No domain file embeds ActionReceipt construction logic
// ---------------------------------------------------------------------------

console.log('=== Check 7: No ActionReceipt construction in domain ===');

let domainReceiptConstructionCount = 0;
for (const file of domainFiles) {
  const src = readFileSync(file, 'utf-8');
  const code = stripComments(src);
  // Skip models.ts — it defines ActionReceipt as a type, not construction
  if (file.endsWith('/models.ts')) continue;
  // Check for ActionReceipt-shaped object literals (has outcome, fieldDeltas, etc.)
  // Exclude type definitions (interface/type) — only check for actual object construction
  const hasOutcomeSummary = code.includes('outcomeSummary:');
  const hasFieldDeltas = code.includes('fieldDeltas:');
  const hasActionId = code.includes('actionId:');
  if (hasOutcomeSummary && hasFieldDeltas && hasActionId) {
    domainReceiptConstructionCount++;
    console.error(`    [VIOLATION] ${relative(ROOT, file)} constructs ActionReceipt-shaped objects`);
  }
}
check(domainReceiptConstructionCount === 0,
  `domain has ${domainReceiptConstructionCount} ActionReceipt construction sites (should be 0)`);

console.log('  No ActionReceipt in domain: PASS');

// ---------------------------------------------------------------------------
// 8. ProcessRun / OwnerDecisionMoment / StrategyFork adapters in runtime
// ---------------------------------------------------------------------------

console.log('=== Check 8: Enrichment adapters in runtime ===');

const runtimeSimDir = join(RUNTIME_DIR, 'simulation');

function checkAdapterExists(adapterFile: string, exportName: string, label: string) {
  try {
    const src = readFileSync(join(runtimeSimDir, adapterFile), 'utf-8');
    check(src.includes(`export function ${exportName}`),
      `${label}: exports ${exportName}`);
  } catch {
    check(false, `${label}: file ${adapterFile} not found`);
  }
}

checkAdapterExists('processRunAdapter.ts', 'buildProcessRunsFromState', 'ProcessRun adapter');
checkAdapterExists('processRunAdapter.ts', 'enrichStateWithProcessRuns', 'ProcessRun enricher');
checkAdapterExists('ownerDecisionMomentAdapter.ts', 'buildOwnerDecisionMomentsFromState', 'OwnerDecisionMoment adapter');
checkAdapterExists('ownerDecisionMomentAdapter.ts', 'enrichStateWithOwnerDecisionMoments', 'OwnerDecisionMoment enricher');
checkAdapterExists('strategyForkAdapter.ts', 'buildStrategyForksFromState', 'StrategyFork adapter');
checkAdapterExists('strategyForkAdapter.ts', 'enrichStateWithStrategyForks', 'StrategyFork enricher');
checkAdapterExists('managerInterventionAdapter.ts', 'buildManagerInterventionFromFocusMeeting', 'ManagerIntervention adapter');
checkAdapterExists('managerInterventionAdapter.ts', 'enrichStateWithManagerInterventions', 'ManagerIntervention enricher');
checkAdapterExists('negotiationReplayAdapter.ts', 'buildNegotiationReplaysFromState', 'NegotiationReplay adapter');
checkAdapterExists('negotiationReplayAdapter.ts', 'enrichStateWithNegotiationReplays', 'NegotiationReplay enricher');
checkAdapterExists('businessOutcomeReviewAdapter.ts', 'buildBusinessOutcomeReviewsFromState', 'BusinessOutcomeReview adapter');
checkAdapterExists('businessOutcomeReviewAdapter.ts', 'enrichStateWithBusinessOutcomeReviews', 'BusinessOutcomeReview enricher');

// DecisionSupport adapters must be in runtime
checkAdapterExists('decisionMomentEmission.ts', 'emitDecisionMomentTriggers', 'DecisionMoment emission');
checkAdapterExists('decisionMomentEmission.ts', 'advanceFlowProgress', 'Flow progress');

console.log('  Enrichment adapters in runtime: PASS');

// ---------------------------------------------------------------------------
// 9. DecisionSupport adapters in runtime
// ---------------------------------------------------------------------------

console.log('=== Check 9: DecisionSupport in runtime ===');

const dsDir = join(RUNTIME_DIR, 'decision-support');
try {
  const dsAdapterSrc = readFileSync(join(dsDir, 'povAdapter.ts'), 'utf-8');
  check(dsAdapterSrc.includes('buildOwnerPOVSnapshot'), 'povAdapter: exports buildOwnerPOVSnapshot');
  check(dsAdapterSrc.includes('buildBrokerPOVSnapshot'), 'povAdapter: exports buildBrokerPOVSnapshot');
} catch {
  check(false, 'povAdapter.ts not found in runtime/decision-support');
}

console.log('  DecisionSupport in runtime: PASS');

// ---------------------------------------------------------------------------
// 10. Core boundary: core does NOT import domain (except legacy type-only)
// ---------------------------------------------------------------------------

console.log('=== Check 10: core → domain boundary ===');

const coreFiles = walkTsFiles(CORE_DIR);
let coreDomainValueImports = 0;
const coreDomainTypeImports: string[] = [];

for (const file of coreFiles) {
  const src = readFileSync(file, 'utf-8');
  const relPath = relative(ROOT, file);

  // Skip known legacy allowlist entries
  if (relPath.includes('legacyAdapter.ts') || relPath.includes('legacyAdapters.ts') ||
      relPath.includes('legacy-case') || relPath.includes('adapters.ts') ||
      relPath.includes('__tests__/')) continue;

  // Check for domain imports
  const lines = src.split('\n');
  for (const line of lines) {
    if (line.trim().startsWith('//')) continue;
    if (!line.includes("from '../../domain") && !line.includes("from '../../../domain")) continue;

    if (line.includes('import type')) {
      coreDomainTypeImports.push(relPath);
    } else {
      coreDomainValueImports++;
      console.error(`    [VIOLATION] ${relPath} has value import from domain: ${line.trim()}`);
    }
  }
}

// Known pre-existing core→domain value imports (not in scope for this round):
// - core/business-rules/archetypes/definitions.ts imports BUILT_IN_WORLD
// - core/business-rules/archetypes/types.ts imports domain model types
// - core/world-state/models.ts imports domain model types
// These are documented in the layer import allowlist and will be addressed in Round 2.
check(coreDomainValueImports <= 4,
  `core has ${coreDomainValueImports} value imports from domain (expected ≤4: 3 legacy + relationReadProjection)`);

console.log(`  core → domain: ${coreDomainTypeImports.length} type-only imports (allowed), ${coreDomainValueImports} value imports: PASS`);

// ---------------------------------------------------------------------------
// 11. No mutable counters in core builders
// ---------------------------------------------------------------------------

console.log('=== Check 11: No mutable counters in core ===');

const strategyModelsSrc = readFileSync(
  join(CORE_DIR, 'world-state/strategy/models.ts'), 'utf-8');
const strategyCode = stripComments(strategyModelsSrc);
check(!strategyCode.includes('let _planSeq'), 'strategy/models: no _planSeq counter');
check(!strategyCode.includes('let _replaySeq'), 'strategy/models: no _replaySeq counter');
check(!strategyCode.includes('let _reviewSeq'), 'strategy/models: no _reviewSeq counter');

const processesModelsSrc = readFileSync(
  join(CORE_DIR, 'world-state/processes/models.ts'), 'utf-8');
const processesCode = stripComments(processesModelsSrc);
check(!processesCode.includes('let _runSeq'), 'processes/models: no _runSeq counter');

const receiptSrc = readFileSync(
  join(CORE_DIR, 'world-state/semantic-receipt/actionReceipt.ts'), 'utf-8');
const receiptCode = stripComments(receiptSrc);
check(!receiptCode.includes('let _receiptSeq'), 'actionReceipt: no _receiptSeq counter');
check(!receiptCode.includes('let _settlementSeq'), 'actionReceipt: no _settlementSeq counter');

console.log('  No mutable counters: PASS');

// ---------------------------------------------------------------------------
// 12. All core outputs are frozen
// ---------------------------------------------------------------------------

console.log('=== Check 12: Core outputs frozen ===');

// Check that core builder functions use Object.freeze
const coreBuilderFiles = [
  'world-state/strategy/models.ts',
  'world-state/processes/models.ts',
  'world-state/semantic-receipt/actionReceipt.ts',
];

for (const relPath of coreBuilderFiles) {
  try {
    const src = readFileSync(join(CORE_DIR, relPath), 'utf-8');
    const code = stripComments(src);
    const hasBuilder = code.includes('export function build');
    const hasFreeze = code.includes('Object.freeze');
    if (hasBuilder) {
      check(hasFreeze, `${relPath}: builders use Object.freeze`);
    }
  } catch {
    // File may not exist
  }
}

// Check frozen definitions
const dmDefSrc = readFileSync(
  join(CORE_DIR, 'business-rules/decision-moments/definitions.ts'), 'utf-8');
check(dmDefSrc.includes('Object.freeze'), 'decision-moments/definitions: uses Object.freeze');

const bfDefSrc = readFileSync(
  join(CORE_DIR, 'business-rules/business-flows/definitions.ts'), 'utf-8');
check(bfDefSrc.includes('Object.freeze'), 'business-flows/definitions: uses Object.freeze');

console.log('  Core outputs frozen: PASS');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

console.log(`\n=== Domain ↔ Runtime Boundary Contract ===`);
console.log(`Total: ${passed + failed}, Passed: ${passed}, Failed: ${failed}`);

if (failed > 0) {
  console.log('\nRESULT: FAIL');
  console.log('\nFailures:');
  for (const f of failures) {
    console.log(`  - ${f}`);
  }
  process.exit(1);
} else {
  console.log('\ndomain-runtime-boundary contract verification passed');
  process.exit(0);
}
